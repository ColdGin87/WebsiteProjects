const {
  playingHandicap,
  strokesOnHole,
  netScore,
  teamHoleScore,
  holeRangeForPlay,
  compareTeamTieBreak,
  formatLabel,
  computeSideGames,
  parseSideGames,
} = require('../scoring');
const { formatVsPar } = require('./vsPar');
const { computeFunFacts, segmentLeaders } = require('./funFacts');

function formatTeamTotal(value) {
  if (value == null || value === '') return '—';
  return formatVsPar(value) ?? '—';
}

function playingHoles(round) {
  return holeRangeForPlay(round.holes);
}

function nineHolesFor(round, courseHoles) {
  const range = playingHoles(round);
  if (range.count !== 9) return null;
  return courseHoles
    .filter((h) => h.hole_number >= range.start && h.hole_number <= range.end)
    .map((h) => ({ holeNumber: h.hole_number, strokeIndex: h.stroke_index }));
}

function memberStrokes(member, hole, round, nineHoles) {
  const hcp = member.playing_handicap != null ? member.playing_handicap : member.handicap;
  return strokesOnHole(hcp, hole.stroke_index, {
    holes: round.holes,
    nineHoles,
    holeNumber: hole.hole_number,
  });
}

function computePlayingHandicap(handicap) {
  if (handicap === null || handicap === undefined || handicap === '') return 0;
  return playingHandicap(handicap);
}

function isTeamRaceOn(round) {
  if (!round) return true;
  if (round.team_race === 0 || round.team_race === false || round.teamRace === false) return false;
  return true;
}

function buildRoundState({ round, course, tee, holes, members, teams, scores, matches, presses, wolfPicks }) {
  const range = playingHoles(round);
  const playHoles = holes.filter((h) => h.hole_number >= range.start && h.hole_number <= range.end);
  const nineHoles = nineHolesFor(round, holes);
  const scoreMap = new Map();
  for (const s of scores) {
    scoreMap.set(`${s.member_id}:${s.hole_number}`, s.gross);
  }

  const settings = {
    grossBalls: round.gross_balls,
    netBalls: round.net_balls,
    dualCount: !!round.dual_count,
  };

  const membersOut = members.map((m) => {
    const holeScores = playHoles.map((hole) => {
      const gross = scoreMap.has(`${m.id}:${hole.hole_number}`)
        ? scoreMap.get(`${m.id}:${hole.hole_number}`)
        : null;
      const strokes = memberStrokes(m, hole, round, nineHoles);
      const net = gross == null ? null : netScore(gross, strokes);
      return {
        holeNumber: hole.hole_number,
        par: hole.par,
        strokeIndex: hole.stroke_index,
        yards: hole.yards,
        yardsEstimated: !!hole.yards_estimated,
        gross,
        strokes,
        net,
      };
    });
    const scored = holeScores.filter((h) => h.gross != null);
    const outHoles = holeScores.filter((h) => h.holeNumber <= 9);
    const inHoles = holeScores.filter((h) => h.holeNumber >= 10);
    const sum = (arr, key) =>
      arr.every((h) => h[key] != null) && arr.length
        ? arr.reduce((s, h) => s + h[key], 0)
        : arr.some((h) => h[key] != null)
          ? arr.reduce((s, h) => s + (h[key] || 0), 0)
          : null;
    return {
      ...m,
      holes: holeScores,
      outGross: sum(outHoles, 'gross'),
      inGross: sum(inHoles, 'gross'),
      totalGross: sum(holeScores, 'gross'),
      outNet: sum(outHoles, 'net'),
      inNet: sum(inHoles, 'net'),
      totalNet: sum(holeScores, 'net'),
      holesPlayed: scored.length,
    };
  });

  const teamRows = [];
  const grouped = new Map();
  for (const team of teams) grouped.set(team.id, { ...team, members: [] });
  const unassigned = [];
  for (const m of membersOut) {
    if (m.team_id && grouped.has(m.team_id)) grouped.get(m.team_id).members.push(m);
    else unassigned.push(m);
  }

  const holeResults = playHoles.map((hole) => {
    const perTeam = [];
    for (const team of grouped.values()) {
      const playerScores = team.members.map((m) => {
        const hs = m.holes.find((h) => h.holeNumber === hole.hole_number);
        return { id: m.id, name: m.display_name, gross: hs?.gross, net: hs?.net };
      });
      const scored = teamHoleScore(playerScores, { ...settings, par: hole.par });
      perTeam.push({
        teamId: team.id,
        teamName: team.name,
        ...scored,
      });
    }
    return {
      holeNumber: hole.hole_number,
      par: hole.par,
      strokeIndex: hole.stroke_index,
      teams: perTeam,
    };
  });

  for (const team of grouped.values()) {
    const holeTotals = holeResults.map((hr) => {
      const row = hr.teams.find((t) => t.teamId === team.id);
      return { holeNumber: hr.holeNumber, total: row?.total ?? null, incomplete: !!row?.incomplete, balls: row?.balls || [] };
    });
    const complete = holeTotals.filter((h) => h.total != null);
    const out = holeTotals.filter((h) => h.holeNumber <= 9 && h.total != null).reduce((s, h) => s + h.total, 0);
    const inn = holeTotals.filter((h) => h.holeNumber >= 10 && h.total != null).reduce((s, h) => s + h.total, 0);
    const total = complete.reduce((s, h) => s + h.total, 0);
    teamRows.push({
      id: team.id,
      name: team.name,
      sortOrder: team.sort_order,
      members: team.members,
      holes: holeTotals,
      out: holeTotals.some((h) => h.holeNumber <= 9 && h.total != null) ? out : null,
      inn: holeTotals.some((h) => h.holeNumber >= 10 && h.total != null) ? inn : null,
      total: complete.length ? total : null,
      incomplete: holeTotals.some((h) => h.incomplete),
    });
  }

  teamRows.sort((a, b) => {
    if (a.total == null && b.total == null) return a.sortOrder - b.sortOrder;
    if (a.total == null) return 1;
    if (b.total == null) return -1;
    if (a.total !== b.total) return a.total - b.total;
    return compareTeamTieBreak(a.holes, b.holes, playHoles.map((h) => ({
      holeNumber: h.hole_number,
      strokeIndex: h.stroke_index,
    })));
  });

  const winner = teamRows.find((t) => t.total != null) || null;

  const matchResults = (matches || []).map((match) => {
    const m1 = membersOut.find((m) => m.id === match.member1_id);
    const m2 = membersOut.find((m) => m.id === match.member2_id);
    let score = 0;
    const holesPlayed = [];
    for (const hole of playHoles) {
      const h1 = m1?.holes.find((h) => h.holeNumber === hole.hole_number);
      const h2 = m2?.holes.find((h) => h.holeNumber === hole.hole_number);
      if (h1?.net == null || h2?.net == null) continue;
      let winnerId = null;
      if (h1.net < h2.net) {
        winnerId = m1.id;
        score += 1;
      } else if (h2.net < h1.net) {
        winnerId = m2.id;
        score -= 1;
      }
      holesPlayed.push({ holeNumber: hole.hole_number, winnerMemberId: winnerId, p1: h1, p2: h2 });
    }
    let resultText = 'All Square';
    let winnerMemberId = null;
    if (score > 0) {
      winnerMemberId = m1?.id;
      resultText = `${m1?.display_name || 'Player 1'} ${score}UP`;
    } else if (score < 0) {
      winnerMemberId = m2?.id;
      resultText = `${m2?.display_name || 'Player 2'} ${Math.abs(score)}UP`;
    }
    return { ...match, member1: m1, member2: m2, holesPlayed, score, resultText, winnerMemberId };
  });

  const sideGames = computeSideGames({
    config: parseSideGames(round.side_games ?? round.sideGames),
    holes: playHoles.map((h) => ({
      holeNumber: h.hole_number,
      par: h.par,
      strokeIndex: h.stroke_index,
    })),
    members: membersOut,
    teams: teamRows,
    presses: presses || [],
    wolfPicks: wolfPicks || [],
    roundId: round.id,
  });

  const funFacts = computeFunFacts({
    holes: playHoles,
    members: membersOut,
    teams: teamRows,
  });

  return {
    round: {
      ...round,
      course,
      tee,
      joinUrl: null,
      publicUrl: null,
      sideGames: sideGames.config,
      teamRace: isTeamRaceOn(round),
    },
    holes: playHoles,
    members: membersOut,
    unassigned,
    teams: teamRows,
    holeResults,
    winner,
    frontLeaders: segmentLeaders(teamRows, 'out'),
    backLeaders: segmentLeaders(teamRows, 'inn'),
    overallLeaders: segmentLeaders(teamRows, 'total'),
    funFacts,
    matches: matchResults,
    settings,
    sideGames,
    presses: presses || [],
    wolfPicks: wolfPicks || [],
    updatedAt: round.updated_at || null,
  };
}

function livePatch(state) {
  return {
    updatedAt: state.updatedAt,
    status: state.round.status,
    scores: (state.members || []).flatMap((m) =>
      (m.holes || [])
        .filter((h) => h.gross != null)
        .map((h) => ({
          memberId: m.id,
          holeNumber: h.holeNumber,
          gross: h.gross,
          net: h.net,
          strokes: h.strokes,
        }))
    ),
    memberTotals: (state.members || []).map((m) => ({
      id: m.id,
      display_name: m.display_name,
      playing_handicap: m.playing_handicap,
      team_id: m.team_id,
      role: m.role,
      is_guest: m.is_guest,
      outGross: m.outGross,
      inGross: m.inGross,
      totalGross: m.totalGross,
      outNet: m.outNet,
      inNet: m.inNet,
      totalNet: m.totalNet,
    })),
    teams: (state.teams || []).map((t) => ({
      id: t.id,
      name: t.name,
      total: t.total,
      out: t.out,
      inn: t.inn,
      incomplete: t.incomplete,
      holes: t.holes,
    })),
    winner: state.winner
      ? { id: state.winner.id, name: state.winner.name, total: state.winner.total }
      : null,
    matches: (state.matches || []).map((m) => ({
      id: m.id,
      resultText: m.resultText,
      member1_id: m.member1_id,
      member2_id: m.member2_id,
      score: m.score,
    })),
    sideGames: state.sideGames
      ? { stripText: state.sideGames.stripText, strip: state.sideGames.strip, money: state.sideGames.money, config: state.sideGames.config, games: state.sideGames.games }
      : null,
    wolfPicks: state.wolfPicks || [],
  };
}

function resultsText(state) {
  const lines = [];
  lines.push(state.round.name);
  lines.push(state.round.course?.name || '');
  const formatLine = state.round.format === 'match_play'
    ? 'Match play'
    : formatLabel(state.round.gross_balls ?? state.round.grossBalls, state.round.net_balls ?? state.round.netBalls);
  lines.push(`Format: ${formatLine}`);
  lines.push('');
  if (state.winner) {
    const label = state.round.status === 'completed' ? 'Winning team' : 'Leading team';
    lines.push(`${label}: ${state.winner.name} (${formatTeamTotal(state.winner.total)})`);
    lines.push('');
  }
  for (const team of state.teams) {
    lines.push(`${team.name}  ${formatTeamTotal(team.total)}  ${team.incomplete ? '(incomplete)' : ''}`);
    for (const m of team.members) {
      lines.push(`  ${m.display_name}  HCP ${m.playing_handicap ?? m.handicap ?? '—'}  Gross ${m.totalGross ?? '—'}  Net ${m.totalNet ?? '—'}`);
    }
    lines.push('');
  }
  if (state.unassigned.length) {
    lines.push('Unassigned — put each player on a team');
    for (const m of state.unassigned) {
      lines.push(`  ${m.display_name}  Gross ${m.totalGross ?? '—'}  Net ${m.totalNet ?? '—'}`);
    }
    lines.push('');
  }
  lines.push('Balls counted by hole');
  for (const hr of state.holeResults) {
    const bits = hr.teams.map((t) => {
      const balls = (t.balls || [])
        .map((b) => `${b.name || b.playerId} ${b.score}${b.type === 'gross' ? 'G' : 'N'}`)
        .join(', ');
      return `${t.teamName} ${formatTeamTotal(t.total)} (${balls || '—'})`;
    });
    lines.push(`  Hole ${hr.holeNumber}: ${bits.join('  |  ')}`);
  }
  if (state.sideGames && state.sideGames.stripText) {
    lines.push('');
    lines.push('Side games');
    lines.push(state.sideGames.stripText);
  }
  return lines.join('\n');
}

function resultsCsv(state) {
  const holes = state.holes;
  const header = [
    'Team',
    'Player',
    'HCP',
    ...holes.map((h) => String(h.hole_number)),
    'OUT',
    'IN',
    'Gross',
    'Net',
  ];
  const rows = [header];
  const allMembers = [
    ...state.teams.flatMap((t) => t.members.map((m) => ({ ...m, teamName: t.name }))),
    ...state.unassigned.map((m) => ({ ...m, teamName: 'Unassigned' })),
  ];
  for (const m of allMembers) {
    rows.push([
      m.teamName,
      m.display_name,
      m.playing_handicap ?? m.handicap ?? '',
      ...holes.map((h) => {
        const hs = m.holes.find((x) => x.holeNumber === h.hole_number);
        return hs?.gross ?? '';
      }),
      m.outGross ?? '',
      m.inGross ?? '',
      m.totalGross ?? '',
      m.totalNet ?? '',
    ]);
  }
  rows.push([]);
  rows.push(['Team hole scores']);
  rows.push(['Team', ...holes.map((h) => String(h.hole_number)), 'OUT', 'IN', 'TOTAL']);
  for (const team of state.teams) {
    rows.push([
      team.name,
      ...holes.map((h) => team.holes.find((x) => x.holeNumber === h.hole_number)?.total ?? ''),
      team.out ?? '',
      team.inn ?? '',
      team.total ?? '',
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

function csvCell(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

module.exports = {
  buildRoundState,
  computePlayingHandicap,
  isTeamRaceOn,
  playingHoles,
  resultsText,
  resultsCsv,
  livePatch,
};
