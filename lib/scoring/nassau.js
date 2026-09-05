/**
 * Classic Nassau: three separate wagers — front 9, back 9, overall 18.
 * Each hole is match play (lower team score wins the hole).
 * Gross = sum of member gross on the hole. Net = sum of member net.
 * Segment settled by holes won. Press is a child match on that segment range.
 */
function holeTeamStroke(team, holeNumber, scoring) {
  const key = scoring === 'gross' ? 'gross' : 'net';
  const members = team.members || [];
  let sum = 0;
  let any = false;
  for (const m of members) {
    const hs = (m.holes || []).find((h) => h.holeNumber === holeNumber);
    if (hs && hs[key] != null && Number.isFinite(Number(hs[key]))) {
      sum += Number(hs[key]);
      any = true;
    }
  }
  return any ? sum : null;
}

function playSegment(holes, teamA, teamB, scoring, start, end) {
  let a = 0;
  let b = 0;
  let played = 0;
  const holeRows = [];
  for (const hole of holes || []) {
    const hn = hole.holeNumber ?? hole.hole_number;
    if (hn < start || hn > end) continue;
    const sa = holeTeamStroke(teamA, hn, scoring);
    const sb = holeTeamStroke(teamB, hn, scoring);
    let winner = null;
    if (sa != null && sb != null) {
      played += 1;
      if (sa < sb) {
        a += 1;
        winner = 'A';
      } else if (sb < sa) {
        b += 1;
        winner = 'B';
      }
    }
    holeRows.push({ holeNumber: hn, scoreA: sa, scoreB: sb, winner });
  }
  const diff = a - b;
  let status = 'AS';
  if (diff > 0) status = `${teamA.name} ${diff}UP`;
  if (diff < 0) status = `${teamB.name} ${Math.abs(diff)}UP`;
  return { holesWonA: a, holesWonB: b, played, status, winner: diff === 0 ? null : diff > 0 ? 'A' : 'B', holeRows };
}

function twoTeams(teams) {
  const sides = (teams || []).filter((t) => (t.members || []).length).slice(0, 2);
  return sides.length >= 2 ? sides : null;
}

function settleMoney(segment, stake, teamA, teamB) {
  if (!segment.winner || !stake) return [];
  const dollars = Math.abs(Number(stake) || 0);
  if (!dollars) return [];
  const winner = segment.winner === 'A' ? teamA : teamB;
  const loser = segment.winner === 'A' ? teamB : teamA;
  return [
    { id: winner.id, name: winner.name, dollars },
    { id: loser.id, name: loser.name, dollars: -dollars },
  ];
}

function scoreNassau({ holes, teams, scoring, front, back, overall, startHole, endHole, segment } = {}) {
  const sides = twoTeams(teams);
  const mode = scoring === 'gross' ? 'gross' : 'net';
  if (!sides) {
    return { kind: 'nassau', incomplete: true, segments: {}, money: [] };
  }
  const start = Number(startHole);
  const end = Number(endHole);
  const range = Number.isFinite(start) && Number.isFinite(end);
  const segs = {
    front: playSegment(holes, sides[0], sides[1], mode, range && segment === 'front' ? start : 1, range && segment === 'front' ? end : 9),
    back: playSegment(holes, sides[0], sides[1], mode, range && segment === 'back' ? start : 10, range && segment === 'back' ? end : 18),
    overall: playSegment(holes, sides[0], sides[1], mode, range && segment === 'overall' ? start : 1, range && (segment === 'overall' || !segment) && segment !== 'front' && segment !== 'back' ? end : 18),
  };
  if (range && segment === 'overall') {
    segs.overall = playSegment(holes, sides[0], sides[1], mode, start, end);
  }
  const stakes = {
    front: Number(front) || 0,
    back: Number(back) || 0,
    overall: Number(overall) || 0,
  };
  const money = [
    ...settleMoney(segs.front, stakes.front, sides[0], sides[1]),
    ...settleMoney(segs.back, stakes.back, sides[0], sides[1]),
    ...settleMoney(segs.overall, stakes.overall, sides[0], sides[1]),
  ];
  const collapsed = new Map();
  for (const row of money) {
    const cur = collapsed.get(row.id) || { id: row.id, name: row.name, dollars: 0 };
    cur.dollars += row.dollars;
    collapsed.set(row.id, cur);
  }
  return {
    kind: 'nassau',
    incomplete: false,
    scoring: mode,
    teamA: { id: sides[0].id, name: sides[0].name },
    teamB: { id: sides[1].id, name: sides[1].name },
    stakes,
    front: segs.front,
    back: segs.back,
    overall: segs.overall,
    money: [...collapsed.values()],
  };
}

module.exports = { holeTeamStroke, playSegment, scoreNassau };
