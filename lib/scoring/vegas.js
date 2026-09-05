/**
 * Vegas 2v2. Two scores become a two-digit (or three-digit) number, low first.
 * 10+ is written high-first. Birdie or eagle (or better) flips the opposing team (high first).
 * Both sides birdie+ → both numbers flip (do not cancel). Net Vegas uses net numbers; flip only on gross birdie+.
 * Points = |A − B|. Lower number wins.
 */
function isBirdieOrBetter(gross, par) {
  return Number.isFinite(Number(gross)) && Number.isFinite(Number(par)) && Number(gross) <= Number(par) - 1;
}

function placeValue(other) {
  return Number(other) >= 10 ? 100 : 10;
}

function vegasPairNumber(a, b, highFirst) {
  const x = Number(a);
  const y = Number(b);
  const lo = Math.min(x, y);
  const hi = Math.max(x, y);
  const forceHigh = highFirst || hi >= 10;
  if (forceHigh) return hi * placeValue(lo) + lo;
  return lo * placeValue(hi) + hi;
}

function pairScores(players, scoring) {
  const key = scoring === 'net' ? 'net' : 'gross';
  const scored = (players || []).filter((p) => p[key] != null && Number.isFinite(Number(p[key])));
  if (scored.length < 2) return null;
  return [Number(scored[0][key]), Number(scored[1][key])];
}

function scoreVegasHole(teamA, teamB, { scoring, par } = {}) {
  const aPair = pairScores(teamA, scoring);
  const bPair = pairScores(teamB, scoring);
  if (!aPair || !bPair) return { incomplete: true, points: 0, winner: null };

  const aBirdie = (teamA || []).some((p) => isBirdieOrBetter(p.gross, par));
  const bBirdie = (teamB || []).some((p) => isBirdieOrBetter(p.gross, par));
  const flipA = bBirdie;
  const flipB = aBirdie;

  const numA = vegasPairNumber(aPair[0], aPair[1], flipA);
  const numB = vegasPairNumber(bPair[0], bPair[1], flipB);
  const points = Math.abs(numA - numB);
  const winner = numA === numB ? null : numA < numB ? 'A' : 'B';
  return { incomplete: false, numA, numB, points, winner, flipA, flipB };
}

function twoSides(teams) {
  const sides = (teams || []).filter((t) => (t.members || []).length >= 2).slice(0, 2);
  if (sides.length < 2) return null;
  return sides;
}

function holePlayers(team, holeNumber) {
  return (team.members || []).map((m) => {
    const hs = (m.holes || []).find((h) => h.holeNumber === holeNumber) || {};
    return { id: m.id, name: m.display_name || m.name, gross: hs.gross, net: hs.net };
  });
}

function scoreVegas({ holes, teams, scoring, dollarsPerPoint, startHole, endHole } = {}) {
  const sides = twoSides(teams);
  const rate = Number(dollarsPerPoint);
  const stake = Number.isFinite(rate) ? rate : 1;
  const start = Number(startHole) || 1;
  const end = Number(endHole) || 18;
  if (!sides) {
    return { kind: 'vegas', incomplete: true, pointsA: 0, pointsB: 0, money: [], holes: [] };
  }
  let pointsA = 0;
  let pointsB = 0;
  const holeRows = [];
  for (const hole of holes || []) {
    const hn = hole.holeNumber ?? hole.hole_number;
    if (hn < start || hn > end) continue;
    const row = scoreVegasHole(
      holePlayers(sides[0], hn),
      holePlayers(sides[1], hn),
      { scoring: scoring === 'net' ? 'net' : 'gross', par: hole.par }
    );
    if (!row.incomplete && row.winner === 'A') pointsA += row.points;
    if (!row.incomplete && row.winner === 'B') pointsB += row.points;
    holeRows.push({ holeNumber: hn, ...row });
  }
  const diff = pointsA - pointsB;
  const money = [];
  if (diff !== 0) {
    const winner = diff > 0 ? sides[0] : sides[1];
    const loser = diff > 0 ? sides[1] : sides[0];
    const dollars = Math.abs(diff) * stake;
    money.push({ id: winner.id, name: winner.name, dollars });
    money.push({ id: loser.id, name: loser.name, dollars: -dollars });
  }
  return {
    kind: 'vegas',
    incomplete: false,
    scoring: scoring === 'net' ? 'net' : 'gross',
    dollarsPerPoint: stake,
    teamA: { id: sides[0].id, name: sides[0].name, points: pointsA },
    teamB: { id: sides[1].id, name: sides[1].name, points: pointsB },
    holes: holeRows,
    money,
  };
}

module.exports = {
  isBirdieOrBetter,
  vegasPairNumber,
  scoreVegasHole,
  scoreVegas,
};
