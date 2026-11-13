function holeNum(hole) {
  return hole.holeNumber ?? hole.hole_number;
}

function computeFunFacts({ holes, members, teams } = {}) {
  let totalBirdies = 0;
  const byPlayer = [];
  for (const member of members || []) {
    let birdies = 0;
    for (const hole of holes || []) {
      const hs = (member.holes || []).find((h) => h.holeNumber === holeNum(hole));
      if (hs && hs.gross != null && Number.isFinite(Number(hole.par)) && hs.gross <= hole.par - 1) {
        birdies += 1;
        totalBirdies += 1;
      }
    }
    byPlayer.push({ name: member.display_name || member.name, birdies });
  }
  byPlayer.sort((a, b) => b.birdies - a.birdies);

  const holeAvgs = (holes || []).map((hole) => {
    const vs = (members || []).map((member) => {
      const hs = (member.holes || []).find((h) => h.holeNumber === holeNum(hole));
      return hs && hs.gross != null ? hs.gross - hole.par : null;
    }).filter((v) => v != null);
    const avg = vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
    return { hole: holeNum(hole), par: hole.par, avg, count: vs.length };
  }).filter((h) => h.avg != null);
  const hardest = [...holeAvgs].sort((a, b) => b.avg - a.avg)[0] || null;
  const easiest = [...holeAvgs].sort((a, b) => a.avg - b.avg)[0] || null;

  let biggestSwing = null;
  for (const team of teams || []) {
    const vals = (team.holes || []).filter((h) => h.total != null);
    if (!vals.length) continue;
    const best = Math.min(...vals.map((h) => h.total));
    const worst = Math.max(...vals.map((h) => h.total));
    const swing = worst - best;
    if (!biggestSwing || swing > biggestSwing.swing) {
      biggestSwing = { name: team.name, swing, best, worst };
    }
  }

  return {
    totalBirdies,
    mostBirdies: byPlayer[0] && byPlayer[0].birdies ? byPlayer[0] : null,
    hardest,
    easiest,
    biggestSwing,
  };
}

function segmentLeaders(teams, key) {
  const scored = (teams || []).filter((t) => t[key] != null);
  if (!scored.length) return [];
  const best = Math.min(...scored.map((t) => t[key]));
  return scored.filter((t) => t[key] === best).map((t) => ({ id: t.id, name: t.name, total: t[key] }));
}

module.exports = { computeFunFacts, segmentLeaders };
