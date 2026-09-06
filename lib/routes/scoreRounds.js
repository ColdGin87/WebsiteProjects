const express = require('express');
const { getDb } = require('../database');
const { authenticate } = require('../middleware/auth');
const { randomJoinCode, randomToken, appBaseUrl } = require('../tokens');
const { demoRoutesEnabled, joinRateLimit, scoreRateLimit } = require('../security');
const { validateGross } = require('../scoring');
const { autoBalanceTeams, sanitizeNickname, teamDisplayName, nextTeamLabel } = require('../scoring');
const { parseSideGames, stringifySideGames, nassauSegmentForHole, segmentEnd } = require('../scoring');
const { canWriteTeamScore, canAddGuestToTeam } = require('../scoring/teamWrite');
const { DEMO_FOURSOME } = require('../seed/demoFoursome');
const { DEMO_TEAM1_VS_PAR } = require('../seed/demoTeam1VsPar');
const { generateSchedule } = require('../game/rotation');
const {
  buildRoundState,
  computePlayingHandicap,
  resultsText,
  resultsCsv,
  livePatch,
  isShowOtherScoresOn,
  redactOtherTeamScores,
} = require('../compute/roundState');

const router = express.Router();
const publicRouter = express.Router();

async function uniqueCode(db) {
  for (let i = 0; i < 12; i++) {
    const code = randomJoinCode(8);
    const existing = await db.get('SELECT id FROM score_rounds WHERE join_code = ?', [code]);
    if (!existing) return code;
  }
  return randomJoinCode(10);
}

async function loadRoundBundle(db, id) {
  const round = await db.get('SELECT * FROM score_rounds WHERE id = ?', [id]);
  if (!round) return null;
  const course = await db.get('SELECT * FROM courses WHERE id = ?', [round.course_id]);
  const tee = round.tee_id ? await db.get('SELECT * FROM tees WHERE id = ?', [round.tee_id]) : null;
  const holes = await db.all(
    `SELECT ch.*, hy.yards AS tee_yards, hy.yards_estimated AS tee_yards_estimated
     FROM course_holes ch
     LEFT JOIN hole_yardages hy ON hy.course_hole_id = ch.id AND hy.tee_id = ?
     WHERE ch.course_id = ?
     ORDER BY ch.hole_number`,
    [round.tee_id || 0, round.course_id]
  );
  const holesNorm = holes.map((h) => ({
    ...h,
    yards: h.tee_yards != null ? h.tee_yards : h.yards,
    yards_estimated: h.tee_yards != null ? h.tee_yards_estimated : h.yards_estimated,
  }));
  const members = await db.all(
    'SELECT * FROM score_members WHERE round_id = ? ORDER BY id',
    [id]
  );
  const teams = await db.all(
    'SELECT * FROM score_teams WHERE round_id = ? ORDER BY sort_order, id',
    [id]
  );
  const scores = await db.all('SELECT * FROM score_holes WHERE round_id = ?', [id]);
  const matches = await db.all('SELECT * FROM score_matches WHERE round_id = ? ORDER BY id', [id]);
  let presses = [];
  let wolfPicks = [];
  try {
    presses = await db.all('SELECT * FROM score_presses WHERE round_id = ? ORDER BY id', [id]);
  } catch { presses = []; }
  try {
    wolfPicks = await db.all('SELECT * FROM score_wolf_picks WHERE round_id = ? ORDER BY hole_number', [id]);
  } catch { wolfPicks = []; }
  return { round, course, tee, holes: holesNorm, members, teams, scores, matches, presses, wolfPicks };
}

function attachUrls(state, req, round) {
  const base = appBaseUrl(req);
  state.round.joinUrl = `${base}/#join/${round.join_code}`;
  state.round.publicUrl = `${base}/#lb/${round.public_token}`;
  state.round.joinCode = round.join_code;
  return state;
}

function samePlayerId(a, b) {
  return Number(a) === Number(b) && Number.isFinite(Number(a));
}

function canSeeRound(req, round, members) {
  if (!req.user) return false;
  if (req.user.is_admin) return true;
  if (samePlayerId(round.organizer_id, req.user.id)) return true;
  return members.some((m) => samePlayerId(m.player_id, req.user.id));
}

function isOrganizer(req, round, members) {
  if (!req.user) return false;
  if (samePlayerId(round.organizer_id, req.user.id)) return true;
  const me = members.find((m) => samePlayerId(m.player_id, req.user.id));
  return !!(me && me.role === 'organizer');
}

async function touchRound(db, id) {
  await db.run("UPDATE score_rounds SET updated_at = datetime('now') WHERE id = ?", [id]);
}

function etagFor(updatedAt) {
  return `"${String(updatedAt || '')}"`;
}

function isUnchanged(req, updatedAt) {
  if (!updatedAt) return false;
  const etag = etagFor(updatedAt);
  const inm = req.get('If-None-Match');
  if (inm && inm.split(',').some((part) => part.trim() === etag)) return true;
  const since = req.query.since;
  if (since != null && String(since) === String(updatedAt)) return true;
  return false;
}

function teamLabel(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s || /^individual$/i.test(s)) return null;
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 0) return 'Team ' + asNum;
  const named = s.match(/^team\s*(\d+)$/i);
  if (named) return 'Team ' + Number(named[1]);
  return s;
}

async function ensureTeam(db, roundId, raw) {
  const name = teamLabel(raw);
  if (!name) return null;
  const existing = await db.get(
    'SELECT * FROM score_teams WHERE round_id = ? AND name = ?',
    [roundId, name]
  );
  if (existing) return existing;
  const max = await db.get(
    'SELECT COALESCE(MAX(sort_order), 0) AS m FROM score_teams WHERE round_id = ?',
    [roundId]
  );
  const sortOrder = (max && max.m ? Number(max.m) : 0) + 1;
  const inserted = await db.run(
    'INSERT INTO score_teams (round_id, name, sort_order) VALUES (?, ?, ?)',
    [roundId, name, sortOrder]
  );
  return { id: inserted.lastInsertRowid, name, sort_order: sortOrder };
}

async function resolveTeamId(db, roundId, body) {
  if (body.teamName !== undefined || body.team_name !== undefined || body.teamNumber !== undefined || body.team_number !== undefined) {
    const team = await ensureTeam(db, roundId, body.teamName ?? body.team_name ?? body.teamNumber ?? body.team_number);
    return team ? team.id : null;
  }
  if (body.teamId !== undefined || body.team_id !== undefined) {
    const raw = body.teamId !== undefined ? body.teamId : body.team_id;
    if (raw === '' || raw === null) return null;
    const asLabel = teamLabel(raw);
    if (asLabel && !Number.isFinite(Number(raw))) {
      const team = await ensureTeam(db, roundId, asLabel);
      return team ? team.id : null;
    }
    return raw;
  }
  return undefined;
}

function findExistingTeamId(bundle, body) {
  const hasName = body.teamName !== undefined || body.team_name !== undefined
    || body.teamNumber !== undefined || body.team_number !== undefined;
  const hasId = body.teamId !== undefined || body.team_id !== undefined;
  if (!hasName && !hasId) return undefined;
  const raw = hasName
    ? (body.teamName ?? body.team_name ?? body.teamNumber ?? body.team_number)
    : (body.teamId ?? body.team_id);
  if (raw === '' || raw == null) return undefined;
  const label = teamLabel(raw);
  if (label) {
    const named = (bundle.teams || []).find((t) => t.name === label);
    if (named) return named.id;
  }
  if (Number.isFinite(Number(raw))) {
    const byId = (bundle.teams || []).find((t) => Number(t.id) === Number(raw));
    if (byId) return byId.id;
  }
  return null;
}

function myRoundMember(req, members) {
  if (!req.user) return null;
  return (members || []).find((m) => samePlayerId(m.player_id, req.user.id)) || null;
}

function applyScoreToBundle(bundle, memberId, holeNumber, gross) {
  bundle.scores = (bundle.scores || []).filter(
    (s) => !(Number(s.member_id) === Number(memberId) && Number(s.hole_number) === Number(holeNumber))
  );
  if (gross != null) {
    bundle.scores.push({
      round_id: bundle.round.id,
      member_id: memberId,
      hole_number: holeNumber,
      gross,
    });
  }
}

function slimScoreResponse(state, holeNumber) {
  return {
    ok: true,
    updatedAt: state.updatedAt,
    holeNumber,
    teams: (state.teams || []).map((t) => ({
      id: t.id,
      name: t.name,
      total: t.total,
      hole: (t.holes || []).find((h) => h.holeNumber === holeNumber) || null,
    })),
    sideGames: state.sideGames
      ? {
        stripText: state.sideGames.stripText,
        money: state.sideGames.money,
        config: state.sideGames.config,
        games: state.sideGames.games || null,
      }
      : null,
  };
}

function canScore(req, round, members, memberId) {
  if (!req.user) return false;
  if (!canSeeRound(req, round, members)) return false;
  const target = members.find((m) => Number(m.id) === Number(memberId));
  if (!target) return false;
  if (req.user.is_admin) return true;
  if (isOrganizer(req, round, members)) return true;
  const me = members.find((m) => Number(m.player_id) === Number(req.user.id));
  return canWriteTeamScore(me, target);
}

function parseShowOtherScores(raw, fallback) {
  if (raw === undefined || raw === null) return fallback;
  return raw === true || raw === 1 || raw === '1' ? 1 : 0;
}

function maskStateForViewer(state, req, members) {
  if (!state) return state;
  if (isShowOtherScoresOn(state.round)) return state;
  if (req.user && req.user.is_admin) return state;
  if (isOrganizer(req, state.round, members)) return state;
  return redactOtherTeamScores(state, myRoundMember(req, members));
}

function viewerRoundJson(bundle, req) {
  const state = maskStateForViewer(buildRoundState(bundle), req, bundle.members);
  return attachUrls(state, req, bundle.round);
}

router.get('/', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const rounds = await db.all(
      `SELECT r.*, c.name AS course_name
       FROM score_rounds r
       LEFT JOIN courses c ON c.id = r.course_id
       WHERE r.organizer_id = ? OR r.id IN (
         SELECT round_id FROM score_members WHERE player_id = ?
       )
       ORDER BY r.created_at DESC`,
      [req.user.id, req.user.id]
    );
    res.json(rounds);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const name = (req.body.name || '').trim() || 'Goldendale Team Round';
    let courseId = req.body.courseId || req.body.course_id;
    if (!courseId) {
      const g = await db.get("SELECT id FROM courses WHERE name = 'Goldendale Golf Club'");
      courseId = g?.id;
    }
    if (!courseId) return res.status(400).json({ error: 'Course is required.' });

    const course = await db.get('SELECT * FROM courses WHERE id = ?', [courseId]);
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    let teeId = req.body.teeId || req.body.tee_id || null;
    if (!teeId) {
      const tee = await db.get(
        "SELECT id FROM tees WHERE course_id = ? AND name = 'White/Blue'",
        [courseId]
      );
      teeId = tee?.id || (await db.get('SELECT id FROM tees WHERE course_id = ?', [courseId]))?.id || null;
    }

    const format = req.body.format === 'match_play' ? 'match_play' : 'team_net';
    const holes = ['18', 'front9', 'back9'].includes(req.body.holes) ? req.body.holes : '18';
    const allowance = [75, 80, 90, 100].includes(Number(req.body.allowance))
      ? Number(req.body.allowance)
      : 100;
    const grossBalls = Number(req.body.grossBalls ?? req.body.gross_balls ?? 1);
    const netBalls = Number(req.body.netBalls ?? req.body.net_balls ?? 2);
    const dualCount = req.body.dualCount || req.body.dual_count ? 1 : 0;
    const teamRace = req.body.teamRace === false || req.body.team_race === 0 || req.body.team_race === false ? 0 : 1;
    const showOtherScores = parseShowOtherScores(req.body.showOtherScores ?? req.body.show_other_scores, 0);
    const sideGames = stringifySideGames(req.body.sideGames || req.body.side_games);

    const result = await db.run(
      `INSERT INTO score_rounds
        (name, course_id, tee_id, format, holes, join_code, public_token, organizer_id,
         status, gross_balls, net_balls, dual_count, allowance, side_games, team_race, show_other_scores)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'setup', ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        courseId,
        teeId,
        format,
        holes,
        await uniqueCode(db),
        randomToken(24),
        req.user.id,
        Math.max(0, grossBalls),
        Math.max(0, netBalls),
        dualCount,
        allowance,
        sideGames,
        teamRace,
        showOtherScores,
      ]
    );

    const user = await db.get('SELECT * FROM players WHERE id = ?', [req.user.id]);
    const playing = computePlayingHandicap(user.handicap);
    const team1 = await ensureTeam(db, result.lastInsertRowid, 'Team 1');
    const team1Nick = sanitizeNickname(req.body.team1Nickname ?? req.body.team_1_nickname ?? req.body.teamNickname);
    if (team1 && team1Nick) {
      await db.run('UPDATE score_teams SET nickname = ? WHERE id = ?', [team1Nick, team1.id]);
    }

    await db.run(
      `INSERT INTO score_members
        (round_id, player_id, display_name, handicap, playing_handicap, tee_id, role, is_guest, team_id)
       VALUES (?, ?, ?, ?, ?, ?, 'organizer', 0, ?)`,
      [result.lastInsertRowid, user.id, user.name, user.handicap, playing, teeId, team1 && team1.id]
    );

    await touchRound(db, result.lastInsertRowid);
    const bundle = await loadRoundBundle(db, result.lastInsertRowid);
    res.status(201).json(viewerRoundJson(bundle, req));
  } catch (err) {
    next(err);
  }
});

router.post('/join', authenticate, joinRateLimit, async (req, res, next) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) return res.status(400).json({ error: 'Join code is required.' });
    if (code.length < 6 || code.length > 12) return res.status(404).json({ error: 'Round not found for that code.' });
    const db = getDb();
    const round = await db.get('SELECT * FROM score_rounds WHERE join_code = ?', [code]);
    if (!round) return res.status(404).json({ error: 'Round not found for that code.' });

    const existing = await db.get(
      'SELECT * FROM score_members WHERE round_id = ? AND player_id = ?',
      [round.id, req.user.id]
    );
    if (!existing) {
      const count = await db.get('SELECT COUNT(*) AS cnt FROM score_members WHERE round_id = ?', [round.id]);
      if (count.cnt >= 20) return res.status(400).json({ error: 'This round is full (20 players).' });
      const user = await db.get('SELECT * FROM players WHERE id = ?', [req.user.id]);
      const playing = computePlayingHandicap(user.handicap);
      const teams = await db.all('SELECT * FROM score_teams WHERE round_id = ? ORDER BY sort_order, id', [round.id]);
      const addTeam = req.body.addTeam === true || req.body.add_team === true || req.body.addTeam === 'true';
      let teamRaw = req.body.teamName ?? req.body.team_name ?? req.body.teamNumber ?? req.body.team_number;
      if (addTeam && (teamRaw == null || teamRaw === '')) {
        teamRaw = nextTeamLabel(teams);
      }
      if (teamRaw == null || String(teamRaw).trim() === '') {
        return res.status(400).json({
          error: 'Pick a team to join.',
          teams: teams.map((t) => ({
            id: t.id,
            name: t.name,
            nickname: t.nickname || '',
            displayName: teamDisplayName(t),
          })),
          nextTeamName: nextTeamLabel(teams),
        });
      }
      const teamLabel = String(teamRaw).trim();
      if (/^team\s*1$/i.test(teamLabel) && !addTeam) {
        return res.status(400).json({
          error: 'Pick Team 2+ or Add team — joiners are not auto Team 1.',
          teams: teams.map((t) => ({
            id: t.id,
            name: t.name,
            nickname: t.nickname || '',
            displayName: teamDisplayName(t),
          })),
          nextTeamName: nextTeamLabel(teams),
        });
      }
      const team = await ensureTeam(db, round.id, teamRaw);
      const teamNick = sanitizeNickname(req.body.teamNickname ?? req.body.team_nickname ?? req.body.nickname);
      if (team && teamNick && !sanitizeNickname(team.nickname)) {
        await db.run('UPDATE score_teams SET nickname = ? WHERE id = ?', [teamNick, team.id]);
      }
      const rawCard = req.body.displayName ?? req.body.display_name ?? req.body.playerName ?? user.name ?? '';
      const cardName = String(rawCard).replace(/\s+/g, ' ').trim().slice(0, 40) || user.name;
      await db.run(
        `INSERT INTO score_members
          (round_id, player_id, display_name, handicap, playing_handicap, tee_id, role, is_guest, team_id)
         VALUES (?, ?, ?, ?, ?, ?, 'player', 0, ?)`,
        [round.id, user.id, cardName, user.handicap, playing, round.tee_id, team && team.id]
      );
    }

    await touchRound(db, round.id);
    const bundle = await loadRoundBundle(db, round.id);
    res.json(viewerRoundJson(bundle, req));
  } catch (err) {
    next(err);
  }
});

router.get('/join-info', authenticate, joinRateLimit, async (req, res, next) => {
  try {
    const code = String(req.query.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) return res.status(400).json({ error: 'Join code is required.' });
    if (code.length < 6 || code.length > 12) return res.status(404).json({ error: 'Round not found for that code.' });
    const db = getDb();
    const round = await db.get('SELECT * FROM score_rounds WHERE join_code = ?', [code]);
    if (!round) return res.status(404).json({ error: 'Round not found for that code.' });
    const teams = await db.all(
      'SELECT * FROM score_teams WHERE round_id = ? ORDER BY sort_order, id',
      [round.id]
    );
    const members = await db.all('SELECT team_id, player_id FROM score_members WHERE round_id = ?', [round.id]);
    const counts = new Map();
    let alreadyJoined = false;
    for (const member of members) {
      const key = String(member.team_id || '');
      counts.set(key, (counts.get(key) || 0) + 1);
      if (Number(member.player_id) === Number(req.user.id)) alreadyJoined = true;
    }
    res.json({
      name: round.name,
      joinCode: round.join_code,
      alreadyJoined,
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        nickname: t.nickname || '',
        displayName: teamDisplayName(t),
        memberCount: counts.get(String(t.id)) || 0,
      })),
      nextTeamName: nextTeamLabel(teams),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!canSeeRound(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'You do not have access to this round.' });
    }
    res.json(viewerRoundJson(bundle, req));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/live', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const round = await db.get('SELECT * FROM score_rounds WHERE id = ?', [req.params.id]);
    if (!round) return res.status(404).json({ error: 'Round not found.' });
    const memberRows = await db.all(
      'SELECT player_id FROM score_members WHERE round_id = ?',
      [req.params.id]
    );
    if (!canSeeRound(req, round, memberRows)) {
      return res.status(403).json({ error: 'You do not have access to this round.' });
    }
    if (isUnchanged(req, round.updated_at)) {
      res.set('ETag', etagFor(round.updated_at));
      res.set('Cache-Control', 'no-store');
      return res.status(304).end();
    }
    const bundle = await loadRoundBundle(db, req.params.id);
    const state = maskStateForViewer(buildRoundState(bundle), req, bundle.members);
    res.set('ETag', etagFor(state.updatedAt));
    res.set('Cache-Control', 'no-store');
    res.json(livePatch(state));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!isOrganizer(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'Organizer access required.' });
    }

    const r = bundle.round;
    const name = req.body.name != null ? String(req.body.name).trim() : r.name;
    const format = req.body.format === 'match_play' || req.body.format === 'team_net' ? req.body.format : r.format;
    const holes = ['18', 'front9', 'back9'].includes(req.body.holes) ? req.body.holes : r.holes;
    const allowance = [75, 80, 90, 100].includes(Number(req.body.allowance))
      ? Number(req.body.allowance)
      : r.allowance;
    const grossBalls = req.body.grossBalls != null || req.body.gross_balls != null
      ? Number(req.body.grossBalls ?? req.body.gross_balls)
      : r.gross_balls;
    const netBalls = req.body.netBalls != null || req.body.net_balls != null
      ? Number(req.body.netBalls ?? req.body.net_balls)
      : r.net_balls;
    const dualCount = req.body.dualCount != null || req.body.dual_count != null
      ? (req.body.dualCount || req.body.dual_count ? 1 : 0)
      : r.dual_count;
    const status = ['setup', 'live', 'completed'].includes(req.body.status) ? req.body.status : r.status;
    const courseId = req.body.courseId || req.body.course_id || r.course_id;
    const teeId = req.body.teeId !== undefined || req.body.tee_id !== undefined
      ? (req.body.teeId ?? req.body.tee_id)
      : r.tee_id;
    const sideGames = req.body.sideGames != null || req.body.side_games != null
      ? stringifySideGames(req.body.sideGames ?? req.body.side_games)
      : (r.side_games || '{}');
    const teamRace = req.body.teamRace != null || req.body.team_race != null
      ? (req.body.teamRace === false || req.body.team_race === 0 || req.body.team_race === false ? 0 : 1)
      : (r.team_race == null ? 1 : r.team_race);
    const showOtherScores = req.body.showOtherScores != null || req.body.show_other_scores != null
      ? parseShowOtherScores(req.body.showOtherScores ?? req.body.show_other_scores, 0)
      : (r.show_other_scores == null ? 0 : r.show_other_scores);

    await db.run(
      `UPDATE score_rounds SET name=?, format=?, holes=?, allowance=?, gross_balls=?, net_balls=?,
        dual_count=?, status=?, course_id=?, tee_id=?, side_games=?, team_race=?, show_other_scores=? WHERE id=?`,
      [name, format, holes, allowance, grossBalls, netBalls, dualCount, status, courseId, teeId, sideGames, teamRace, showOtherScores, r.id]
    );

    if (req.body.recomputeHandicaps || holes !== r.holes) {
      const members = await db.all('SELECT * FROM score_members WHERE round_id = ?', [r.id]);
      for (const m of members) {
        const playing = computePlayingHandicap(m.handicap);
        await db.run('UPDATE score_members SET playing_handicap = ?, tee_id = ? WHERE id = ?', [playing, teeId, m.id]);
      }
    }

    await touchRound(db, r.id);
    const next = await loadRoundBundle(db, r.id);
    res.json(viewerRoundJson(next, req));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/guests', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!canSeeRound(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'You do not have access to this round.' });
    }
    const organizer = isOrganizer(req, bundle.round, bundle.members) || !!(req.user && req.user.is_admin);
    const me = myRoundMember(req, bundle.members);
    if (!organizer && !me) {
      return res.status(403).json({ error: 'Join this round before adding players.' });
    }
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Guest name is required.' });
    if (bundle.members.length >= 20) {
      return res.status(400).json({ error: 'This round is full (20 players).' });
    }
    const handicap = req.body.handicap === undefined || req.body.handicap === '' ? null : String(req.body.handicap);
    let playing = computePlayingHandicap(handicap);
    if (req.body.playingHandicap != null || req.body.playing_handicap != null) {
      playing = computePlayingHandicap(req.body.playingHandicap ?? req.body.playing_handicap);
    }
    let teamId;
    if (organizer) {
      teamId = await resolveTeamId(db, bundle.round.id, req.body);
      if (teamId == null) {
        const team1 = await ensureTeam(db, bundle.round.id, 'Team 1');
        teamId = team1 && team1.id;
      }
    } else {
      if (me.team_id == null || me.team_id === '') {
        return res.status(403).json({ error: 'Join a team before adding players.' });
      }
      const requested = findExistingTeamId(bundle, req.body);
      if (requested === null || (requested !== undefined && !canAddGuestToTeam(me, requested))) {
        return res.status(403).json({ error: 'You can only add players to your own team.' });
      }
      teamId = me.team_id;
    }
    await db.run(
      `INSERT INTO score_members
        (round_id, player_id, display_name, handicap, playing_handicap, tee_id, role, is_guest, team_id)
       VALUES (?, NULL, ?, ?, ?, ?, 'player', 1, ?)`,
      [bundle.round.id, name, handicap, playing, bundle.round.tee_id, teamId]
    );
    await touchRound(db, bundle.round.id);
    const next = await loadRoundBundle(db, bundle.round.id);
    res.status(201).json(viewerRoundJson(next, req));
  } catch (err) {
    next(err);
  }
});

router.put('/:id/members/:memberId', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    const member = bundle.members.find((m) => m.id === Number(req.params.memberId));
    if (!member) return res.status(404).json({ error: 'Player not found in this round.' });

    const organizer = isOrganizer(req, bundle.round, bundle.members);
    const self = member.player_id === req.user.id;
    if (!organizer && !self) return res.status(403).json({ error: 'Not authorized.' });

    let handicap = member.handicap;
    if (req.body.handicap !== undefined) {
      handicap = req.body.handicap === '' || req.body.handicap === null ? null : String(req.body.handicap);
    }
    const displayName = req.body.name != null || req.body.display_name != null
      ? String(req.body.name || req.body.display_name).trim()
      : member.display_name;
    let playing = member.playing_handicap;
    if (req.body.playing_handicap !== undefined || req.body.playingHandicap !== undefined) {
      playing = computePlayingHandicap(req.body.playing_handicap ?? req.body.playingHandicap);
    } else if (req.body.handicap !== undefined) {
      playing = computePlayingHandicap(handicap);
    }
    let teamId = member.team_id;
    if (organizer) {
      const resolved = await resolveTeamId(db, bundle.round.id, req.body);
      if (resolved !== undefined) teamId = resolved;
    }

    await db.run(
      'UPDATE score_members SET display_name=?, handicap=?, playing_handicap=?, team_id=? WHERE id=?',
      [displayName, handicap, playing, teamId, member.id]
    );
    await touchRound(db, bundle.round.id);
    const next = await loadRoundBundle(db, bundle.round.id);
    res.json(viewerRoundJson(next, req));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/members/:memberId', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!isOrganizer(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'Organizer access required.' });
    }
    const member = bundle.members.find((m) => m.id === Number(req.params.memberId));
    if (!member) return res.status(404).json({ error: 'Player not found.' });
    await db.run('DELETE FROM score_holes WHERE member_id = ?', [member.id]);
    await db.run('DELETE FROM score_members WHERE id = ?', [member.id]);
    await touchRound(db, bundle.round.id);
    const next = await loadRoundBundle(db, bundle.round.id);
    res.json(viewerRoundJson(next, req));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/guests/bulk', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!isOrganizer(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'Organizer access required.' });
    }
    const guests = Array.isArray(req.body.guests) ? req.body.guests : [];
    if (!guests.length) return res.status(400).json({ error: 'Add at least one guest name.' });
    if (bundle.members.length + guests.length > 20) {
      return res.status(400).json({ error: 'This round is full (20 players).' });
    }
    for (const g of guests) {
      const name = String((g && g.name) || '').trim();
      if (!name) continue;
      const handicap = g.handicap === undefined || g.handicap === '' ? null : String(g.handicap);
      let playing = computePlayingHandicap(handicap);
      if (g.playingHandicap != null || g.playing_handicap != null) {
        playing = computePlayingHandicap(g.playingHandicap ?? g.playing_handicap);
      }
      let teamId = await resolveTeamId(db, bundle.round.id, g || {});
      if (teamId == null) {
        const team1 = await ensureTeam(db, bundle.round.id, 'Team 1');
        teamId = team1 && team1.id;
      }
      await db.run(
        `INSERT INTO score_members
          (round_id, player_id, display_name, handicap, playing_handicap, tee_id, role, is_guest, team_id)
         VALUES (?, NULL, ?, ?, ?, ?, 'player', 1, ?)`,
        [bundle.round.id, name, handicap, playing, bundle.round.tee_id, teamId]
      );
    }
    await touchRound(db, bundle.round.id);
    const next = await loadRoundBundle(db, bundle.round.id);
    res.status(201).json(viewerRoundJson(next, req));
  } catch (err) {
    next(err);
  }
});

async function upsertGross(db, roundId, memberId, holeNumber, gross) {
  const existing = await db.get(
    'SELECT id FROM score_holes WHERE round_id = ? AND member_id = ? AND hole_number = ?',
    [roundId, memberId, holeNumber]
  );
  if (existing) {
    await db.run(
      "UPDATE score_holes SET gross = ?, updated_at = datetime('now') WHERE id = ?",
      [gross, existing.id]
    );
  } else {
    await db.run(
      'INSERT INTO score_holes (round_id, member_id, hole_number, gross) VALUES (?, ?, ?, ?)',
      [roundId, memberId, holeNumber, gross]
    );
  }
}

async function applyDemoRoster(db, bundle, roster) {
  let members = bundle.members;
  for (const player of roster) {
    const taken = members.find((m) => m.display_name === player.name);
    const teamId = await resolveTeamId(db, bundle.round.id, { teamName: player.teamName });
    let memberId = taken && taken.id;
    if (taken) {
      await db.run(
        'UPDATE score_members SET handicap=?, playing_handicap=?, team_id=? WHERE id=?',
        [String(player.handicap), player.playingHandicap, teamId, taken.id]
      );
    } else {
      if (members.length >= 20) continue;
      const inserted = await db.run(
        `INSERT INTO score_members
          (round_id, player_id, display_name, handicap, playing_handicap, tee_id, role, is_guest, team_id)
         VALUES (?, NULL, ?, ?, ?, ?, 'player', 1, ?)`,
        [
          bundle.round.id,
          player.name,
          String(player.handicap),
          player.playingHandicap,
          bundle.round.tee_id,
          teamId,
        ]
      );
      memberId = inserted.lastInsertRowid;
    }
    const nextBundle = await loadRoundBundle(db, bundle.round.id);
    members = nextBundle.members;
    const member = members.find((m) => m.id === memberId) || members.find((m) => m.display_name === player.name);
    if (!member) continue;
    for (let i = 0; i < player.holes.length; i++) {
      await upsertGross(db, bundle.round.id, member.id, i + 1, player.holes[i]);
    }
  }
  if (bundle.round.status === 'setup') {
    await db.run("UPDATE score_rounds SET status = 'live' WHERE id = ?", [bundle.round.id]);
  }
  await touchRound(db, bundle.round.id);
}

async function applyDemoFoursome(db, bundle) {
  await applyDemoRoster(db, bundle, DEMO_FOURSOME);
}

async function applyDemoTeam1VsPar(db, bundle) {
  await applyDemoRoster(db, bundle, DEMO_TEAM1_VS_PAR);
}

router.post('/:id/demo/foursome', authenticate, async (req, res, next) => {
  try {
    if (!demoRoutesEnabled()) return res.status(404).json({ error: 'Not found.' });
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!isOrganizer(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'Organizer access required.' });
    }
    await applyDemoFoursome(db, bundle);
    const next = await loadRoundBundle(db, bundle.round.id);
    res.json(viewerRoundJson(next, req));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/demo/team1-vs-par', authenticate, async (req, res, next) => {
  try {
    if (!demoRoutesEnabled()) return res.status(404).json({ error: 'Not found.' });
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!isOrganizer(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'Organizer access required.' });
    }
    await applyDemoTeam1VsPar(db, bundle);
    const next = await loadRoundBundle(db, bundle.round.id);
    res.json(viewerRoundJson(next, req));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/teams', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!isOrganizer(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'Organizer access required.' });
    }
    const team = await ensureTeam(db, bundle.round.id, req.body.name || req.body.teamName || req.body.teamNumber);
    if (!team) return res.status(400).json({ error: 'Team name is required.' });
    if (req.body.nickname !== undefined || req.body.teamNickname !== undefined) {
      const nick = sanitizeNickname(req.body.nickname ?? req.body.teamNickname);
      await db.run('UPDATE score_teams SET nickname = ? WHERE id = ?', [nick || null, team.id]);
    }
    await touchRound(db, bundle.round.id);
    const next = await loadRoundBundle(db, bundle.round.id);
    res.status(201).json(viewerRoundJson(next, req));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/teams/balance', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!isOrganizer(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'Organizer access required.' });
    }
    const teamCount = Math.max(1, Number(req.body.teamCount || req.body.team_count || 2));
    await db.run('UPDATE score_members SET team_id = NULL WHERE round_id = ?', [bundle.round.id]);
    await db.run('DELETE FROM score_teams WHERE round_id = ?', [bundle.round.id]);

    const teams = autoBalanceTeams(
      bundle.members.map((m) => ({ id: m.id, playingHandicap: m.playing_handicap })),
      teamCount
    );
    for (const team of teams) {
      const inserted = await db.run(
        'INSERT INTO score_teams (round_id, name, sort_order) VALUES (?, ?, ?)',
        [bundle.round.id, team.name, team.sortOrder]
      );
      for (const memberId of team.memberIds) {
        await db.run('UPDATE score_members SET team_id = ? WHERE id = ?', [inserted.lastInsertRowid, memberId]);
      }
    }
    await touchRound(db, bundle.round.id);
    const next = await loadRoundBundle(db, bundle.round.id);
    res.json(viewerRoundJson(next, req));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/scores', authenticate, scoreRateLimit, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    const memberId = Number(req.body.memberId || req.body.member_id);
    if (!canScore(req, bundle.round, bundle.members, memberId)) {
      return res.status(403).json({ error: 'You can only enter scores for your own team.' });
    }
    const holeNumber = Number(req.body.holeNumber || req.body.hole_number);
    const hole = bundle.holes.find((h) => h.hole_number === holeNumber);
    if (!hole) return res.status(400).json({ error: 'Invalid hole number.' });

    if (req.body.gross === '' || req.body.gross === null || req.body.gross === undefined) {
      await db.run('DELETE FROM score_holes WHERE round_id = ? AND member_id = ? AND hole_number = ?', [
        bundle.round.id,
        memberId,
        holeNumber,
      ]);
    } else {
      const gross = validateGross(req.body.gross);
      const existing = await db.get(
        'SELECT id FROM score_holes WHERE round_id = ? AND member_id = ? AND hole_number = ?',
        [bundle.round.id, memberId, holeNumber]
      );
      if (existing) {
        await db.run(
          "UPDATE score_holes SET gross = ?, updated_at = datetime('now') WHERE id = ?",
          [gross, existing.id]
        );
      } else {
        await db.run(
          'INSERT INTO score_holes (round_id, member_id, hole_number, gross) VALUES (?, ?, ?, ?)',
          [bundle.round.id, memberId, holeNumber, gross]
        );
      }
    }

    if (bundle.round.status === 'setup') {
      await db.run("UPDATE score_rounds SET status = 'live' WHERE id = ?", [bundle.round.id]);
      bundle.round.status = 'live';
    }

    await touchRound(db, bundle.round.id);
    const touched = await db.get('SELECT updated_at, status FROM score_rounds WHERE id = ?', [bundle.round.id]);
    if (touched) {
      bundle.round.updated_at = touched.updated_at;
      bundle.round.status = touched.status;
    }
    const written = req.body.gross === '' || req.body.gross === null || req.body.gross === undefined
      ? null
      : validateGross(req.body.gross);
    applyScoreToBundle(bundle, memberId, holeNumber, written);
    res.json(slimScoreResponse(maskStateForViewer(buildRoundState(bundle), req, bundle.members), holeNumber));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/presses', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!canSeeRound(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'Not in this round.' });
    }
    const gameKey = String(req.body.gameKey || req.body.game_key || '');
    const allowed = ['vegas', 'nassau', 'wolf', 'nines'];
    if (!allowed.includes(gameKey)) {
      return res.status(400).json({ error: 'Press that game from the live card (Vegas, Nassau, Wolf, or Nines).' });
    }
    let startHole = Math.max(1, Number(req.body.startHole || req.body.start_hole || 1));
    let segment = req.body.segment || null;
    if (gameKey === 'nassau') {
      segment = segment || nassauSegmentForHole(startHole);
      if (segment !== 'front' && segment !== 'back' && segment !== 'overall') {
        segment = nassauSegmentForHole(startHole);
      }
      if (segment === 'front' && startHole > 9) {
        return res.status(400).json({ error: 'Front press starts on holes 1–9 and dies at 9.' });
      }
      if (segment === 'back' && startHole < 10) {
        startHole = 10;
      }
    }
    let endHole = Math.min(18, Number(req.body.endHole || req.body.end_hole || segmentEnd(segment)));
    if (gameKey === 'nassau') {
      endHole = Math.min(endHole, segmentEnd(segment));
    }
    const dollars = req.body.dollars != null ? Number(req.body.dollars) : null;
    const me = bundle.members.find((m) => m.player_id === req.user.id);
    await db.run(
      `INSERT INTO score_presses
        (round_id, game_key, segment, start_hole, end_hole, dollars, pressed_by_member_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [bundle.round.id, gameKey, segment, startHole, endHole, dollars, me ? me.id : null]
    );
    await touchRound(db, bundle.round.id);
    const next = await loadRoundBundle(db, bundle.round.id);
    res.json(viewerRoundJson(next, req));
  } catch (err) {
    next(err);
  }
});

router.put('/:id/wolf/:hole', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!canSeeRound(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'Not in this round.' });
    }
    const holeNumber = Number(req.params.hole);
    const wolfMemberId = Number(req.body.wolfMemberId || req.body.wolf_member_id);
    const blind = !!(req.body.blind || req.body.blindWolf);
    const lone = blind || !!(req.body.lone || req.body.loneWolf);
    const partnerMemberId = lone ? null : Number(req.body.partnerMemberId || req.body.partner_member_id || 0) || null;
    const passedRaw = req.body.passedIds ?? req.body.passed_ids ?? [];
    const passedIds = Array.isArray(passedRaw) ? JSON.stringify(passedRaw.map(Number)) : String(passedRaw || '');
    const locked = req.body.locked == null
      ? !!(lone || partnerMemberId)
      : !!(req.body.locked);
    const existing = await db.get(
      'SELECT id FROM score_wolf_picks WHERE round_id = ? AND hole_number = ?',
      [bundle.round.id, holeNumber]
    );
    if (existing) {
      await db.run(
        'UPDATE score_wolf_picks SET wolf_member_id=?, partner_member_id=?, lone=?, blind=?, passed_ids=?, locked=? WHERE id=?',
        [wolfMemberId, partnerMemberId, lone ? 1 : 0, blind ? 1 : 0, passedIds, locked ? 1 : 0, existing.id]
      );
    } else {
      await db.run(
        'INSERT INTO score_wolf_picks (round_id, hole_number, wolf_member_id, partner_member_id, lone, blind, passed_ids, locked) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [bundle.round.id, holeNumber, wolfMemberId, partnerMemberId, lone ? 1 : 0, blind ? 1 : 0, passedIds, locked ? 1 : 0]
      );
    }
    await touchRound(db, bundle.round.id);
    const next = await loadRoundBundle(db, bundle.round.id);
    res.json(viewerRoundJson(next, req));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/matches/generate', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!isOrganizer(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'Organizer access required.' });
    }

    await db.run('DELETE FROM score_matches WHERE round_id = ?', [bundle.round.id]);
    const members = [...bundle.members];

    if (members.length === 8) {
      const schedule = generateSchedule(members.map((m) => m.id));
      const first = schedule[0];
      const stmts = [];
      for (const foursome of first.foursomes) {
        for (const match of foursome.matches.front) {
          stmts.push({
            sql: 'INSERT INTO score_matches (round_id, member1_id, member2_id, half) VALUES (?, ?, ?, ?)',
            args: [bundle.round.id, match.player1, match.player2, 'front'],
          });
        }
        for (const match of foursome.matches.back) {
          stmts.push({
            sql: 'INSERT INTO score_matches (round_id, member1_id, member2_id, half) VALUES (?, ?, ?, ?)',
            args: [bundle.round.id, match.player1, match.player2, 'back'],
          });
        }
      }
      if (stmts.length) await db.batch(stmts);
    } else {
      const sorted = members.sort((a, b) => (a.playing_handicap || 0) - (b.playing_handicap || 0));
      const stmts = [];
      for (let i = 0; i + 1 < sorted.length; i += 2) {
        stmts.push({
          sql: 'INSERT INTO score_matches (round_id, member1_id, member2_id, half) VALUES (?, ?, ?, ?)',
          args: [bundle.round.id, sorted[i].id, sorted[i + 1].id, bundle.round.holes],
        });
      }
      if (stmts.length) await db.batch(stmts);
    }

    await touchRound(db, bundle.round.id);
    const next = await loadRoundBundle(db, bundle.round.id);
    res.json(viewerRoundJson(next, req));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/results.txt', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!canSeeRound(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'You do not have access to this round.' });
    }
    const state = buildRoundState(bundle);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(resultsText(state));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/results.csv', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!canSeeRound(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'You do not have access to this round.' });
    }
    const state = buildRoundState(bundle);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="round-${bundle.round.id}.csv"`);
    res.send(resultsCsv(state));
  } catch (err) {
    next(err);
  }
});

async function publicState(req, res, next) {
  try {
    const db = getDb();
    const round = await db.get('SELECT * FROM score_rounds WHERE public_token = ?', [req.params.token]);
    if (!round) return res.status(404).json({ error: 'Leaderboard not found.' });
    const bundle = await loadRoundBundle(db, round.id);
    const state = buildRoundState(bundle);
    delete state.round.join_code;
    state.round.publicToken = round.public_token;
    res.json(state);
  } catch (err) {
    next(err);
  }
}

async function publicLive(req, res, next) {
  try {
    const db = getDb();
    const round = await db.get('SELECT * FROM score_rounds WHERE public_token = ?', [req.params.token]);
    if (!round) return res.status(404).json({ error: 'Leaderboard not found.' });
    if (isUnchanged(req, round.updated_at)) {
      res.set('ETag', etagFor(round.updated_at));
      res.set('Cache-Control', 'no-store');
      return res.status(304).end();
    }
    const bundle = await loadRoundBundle(db, round.id);
    const state = buildRoundState(bundle);
    res.set('ETag', etagFor(state.updatedAt));
    res.set('Cache-Control', 'no-store');
    res.json(livePatch(state));
  } catch (err) {
    next(err);
  }
}

publicRouter.get('/:token', publicState);
publicRouter.get('/:token/live', publicLive);
publicRouter.get('/:token/results.csv', async (req, res, next) => {
  try {
    const db = getDb();
    const round = await db.get('SELECT * FROM score_rounds WHERE public_token = ?', [req.params.token]);
    if (!round) return res.status(404).json({ error: 'Leaderboard not found.' });
    const bundle = await loadRoundBundle(db, round.id);
    const state = buildRoundState(bundle);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leaderboard.csv"`);
    res.send(resultsCsv(state));
  } catch (err) {
    next(err);
  }
});

module.exports = { router, publicRouter };
