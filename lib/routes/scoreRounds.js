const express = require('express');
const { getDb } = require('../database');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { randomJoinCode, randomToken, appBaseUrl } = require('../tokens');
const { validateGross } = require('../scoring');
const { autoBalanceTeams } = require('../scoring');
const { generateSchedule } = require('../game/rotation');
const {
  buildRoundState,
  computePlayingHandicap,
  resultsText,
  resultsCsv,
} = require('../compute/roundState');

const router = express.Router();
const publicRouter = express.Router();

async function uniqueCode(db) {
  for (let i = 0; i < 12; i++) {
    const code = randomJoinCode(6);
    const existing = await db.get('SELECT id FROM score_rounds WHERE join_code = ?', [code]);
    if (!existing) return code;
  }
  return randomJoinCode(8);
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
  return { round, course, tee, holes: holesNorm, members, teams, scores, matches };
}

function attachUrls(state, req, round) {
  const base = appBaseUrl(req);
  state.round.joinUrl = `${base}/#join/${round.join_code}`;
  state.round.publicUrl = `${base}/#lb/${round.public_token}`;
  state.round.joinCode = round.join_code;
  return state;
}

function canSeeRound(req, round, members) {
  if (!req.user) return false;
  if (req.user.is_admin) return true;
  if (round.organizer_id === req.user.id) return true;
  return members.some((m) => m.player_id === req.user.id);
}

function isOrganizer(req, round, members) {
  if (!req.user) return false;
  if (round.organizer_id === req.user.id) return true;
  const me = members.find((m) => m.player_id === req.user.id);
  return !!(me && me.role === 'organizer');
}

function canScore(req, round, members, memberId) {
  if (!req.user) return false;
  if (isOrganizer(req, round, members)) return true;
  const target = members.find((m) => m.id === Number(memberId));
  if (!target) return false;
  if (target.player_id === req.user.id) return true;
  const me = members.find((m) => m.player_id === req.user.id);
  return !!me;
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

    const result = await db.run(
      `INSERT INTO score_rounds
        (name, course_id, tee_id, format, holes, join_code, public_token, organizer_id,
         status, gross_balls, net_balls, dual_count, allowance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'setup', ?, ?, ?, ?)`,
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
      ]
    );

    const user = await db.get('SELECT * FROM players WHERE id = ?', [req.user.id]);
    const tee = teeId ? await db.get('SELECT * FROM tees WHERE id = ?', [teeId]) : null;
    const playing = computePlayingHandicap(user.handicap, tee, { allowance, holes });

    await db.run(
      `INSERT INTO score_members
        (round_id, player_id, display_name, handicap, playing_handicap, tee_id, role, is_guest)
       VALUES (?, ?, ?, ?, ?, ?, 'organizer', 0)`,
      [result.lastInsertRowid, user.id, user.name, user.handicap, playing, teeId]
    );

    const bundle = await loadRoundBundle(db, result.lastInsertRowid);
    const state = attachUrls(buildRoundState(bundle), req, bundle.round);
    res.status(201).json(state);
  } catch (err) {
    next(err);
  }
});

router.post('/join', authenticate, async (req, res, next) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (code.length < 4) return res.status(400).json({ error: 'Join code is required.' });
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
      const tee = round.tee_id ? await db.get('SELECT * FROM tees WHERE id = ?', [round.tee_id]) : null;
      const playing = computePlayingHandicap(user.handicap, tee, round);
      await db.run(
        `INSERT INTO score_members
          (round_id, player_id, display_name, handicap, playing_handicap, tee_id, role, is_guest)
         VALUES (?, ?, ?, ?, ?, ?, 'player', 0)`,
        [round.id, user.id, user.name, user.handicap, playing, round.tee_id]
      );
    }

    const bundle = await loadRoundBundle(db, round.id);
    res.json(attachUrls(buildRoundState(bundle), req, bundle.round));
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
    res.json(attachUrls(buildRoundState(bundle), req, bundle.round));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/live', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!canSeeRound(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'You do not have access to this round.' });
    }
    res.json(attachUrls(buildRoundState(bundle), req, bundle.round));
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

    await db.run(
      `UPDATE score_rounds SET name=?, format=?, holes=?, allowance=?, gross_balls=?, net_balls=?,
        dual_count=?, status=?, course_id=?, tee_id=? WHERE id=?`,
      [name, format, holes, allowance, grossBalls, netBalls, dualCount, status, courseId, teeId, r.id]
    );

    if (req.body.recomputeHandicaps || allowance !== r.allowance || teeId !== r.tee_id || holes !== r.holes) {
      const tee = teeId ? await db.get('SELECT * FROM tees WHERE id = ?', [teeId]) : null;
      const members = await db.all('SELECT * FROM score_members WHERE round_id = ?', [r.id]);
      for (const m of members) {
        const playing = computePlayingHandicap(m.handicap, tee, { allowance, holes });
        await db.run('UPDATE score_members SET playing_handicap = ?, tee_id = ? WHERE id = ?', [playing, teeId, m.id]);
      }
    }

    const next = await loadRoundBundle(db, r.id);
    res.json(attachUrls(buildRoundState(next), req, next.round));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/guests', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    if (!isOrganizer(req, bundle.round, bundle.members)) {
      return res.status(403).json({ error: 'Organizer access required.' });
    }
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Guest name is required.' });
    if (bundle.members.length >= 20) {
      return res.status(400).json({ error: 'This round is full (20 players).' });
    }
    const handicap = req.body.handicap === undefined || req.body.handicap === '' ? null : String(req.body.handicap);
    let playing = computePlayingHandicap(handicap, bundle.tee, bundle.round);
    if (req.body.playingHandicap != null || req.body.playing_handicap != null) {
      playing = Number(req.body.playingHandicap ?? req.body.playing_handicap);
    }
    await db.run(
      `INSERT INTO score_members
        (round_id, player_id, display_name, handicap, playing_handicap, tee_id, role, is_guest)
       VALUES (?, NULL, ?, ?, ?, ?, 'player', 1)`,
      [bundle.round.id, name, handicap, playing, bundle.round.tee_id]
    );
    const next = await loadRoundBundle(db, bundle.round.id);
    res.status(201).json(attachUrls(buildRoundState(next), req, next.round));
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
      playing = Number(req.body.playing_handicap ?? req.body.playingHandicap);
    } else if (req.body.handicap !== undefined) {
      playing = computePlayingHandicap(handicap, bundle.tee, bundle.round);
    }
    let teamId = member.team_id;
    if (organizer && (req.body.teamId !== undefined || req.body.team_id !== undefined)) {
      const raw = req.body.teamId !== undefined ? req.body.teamId : req.body.team_id;
      teamId = raw === '' || raw === null ? null : raw;
    }

    await db.run(
      'UPDATE score_members SET display_name=?, handicap=?, playing_handicap=?, team_id=? WHERE id=?',
      [displayName, handicap, playing, teamId, member.id]
    );
    const next = await loadRoundBundle(db, bundle.round.id);
    res.json(attachUrls(buildRoundState(next), req, next.round));
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
    const next = await loadRoundBundle(db, bundle.round.id);
    res.json(attachUrls(buildRoundState(next), req, next.round));
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
    const next = await loadRoundBundle(db, bundle.round.id);
    res.json(attachUrls(buildRoundState(next), req, next.round));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/scores', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const bundle = await loadRoundBundle(db, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Round not found.' });
    const memberId = Number(req.body.memberId || req.body.member_id);
    if (!canScore(req, bundle.round, bundle.members, memberId)) {
      return res.status(403).json({ error: 'Not authorized to enter this score.' });
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
    }

    const next = await loadRoundBundle(db, bundle.round.id);
    res.json(attachUrls(buildRoundState(next), req, next.round));
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

    const next = await loadRoundBundle(db, bundle.round.id);
    res.json(attachUrls(buildRoundState(next), req, next.round));
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

publicRouter.get('/:token', publicState);
publicRouter.get('/:token/live', publicState);
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
