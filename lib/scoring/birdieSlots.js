/**
 * Fun layer: each gross birdie or better is one slot spin.
 * Payout is deterministic from round + player + hole so a refresh does not re-roll.
 * Not money — a running high score only.
 */
const REEL = [0, 0, 1, 1, 2, 3, 5, 8];

function isBirdieOrBetter(gross, par) {
  return Number.isFinite(Number(gross)) && Number.isFinite(Number(par)) && Number(gross) <= Number(par) - 1;
}

function slotSpin(roundId, memberId, holeNumber) {
  let n = (Number(roundId) || 0) * 10007 + (Number(memberId) || 0) * 97 + (Number(holeNumber) || 0) * 13;
  n = Math.abs(n);
  return REEL[n % REEL.length];
}

function computeBirdieSlots({ on, holes, members, roundId } = {}) {
  if (!on) return { on: false, spins: 0, points: 0, players: [], leader: null, strip: '' };
  const players = [];
  let spins = 0;
  let points = 0;
  for (const member of members || []) {
    let birdies = 0;
    let playerSpins = 0;
    let playerPoints = 0;
    for (const hole of holes || []) {
      const hn = hole.holeNumber ?? hole.hole_number;
      const hs = (member.holes || []).find((h) => h.holeNumber === hn);
      if (!hs || hs.gross == null || !isBirdieOrBetter(hs.gross, hole.par)) continue;
      birdies += 1;
      playerSpins += 1;
      playerPoints += slotSpin(roundId || member.round_id, member.id, hn);
    }
    spins += playerSpins;
    points += playerPoints;
    players.push({
      id: member.id,
      name: member.display_name || member.name,
      birdies,
      spins: playerSpins,
      points: playerPoints,
    });
  }
  players.sort((a, b) => b.points - a.points || b.birdies - a.birdies);
  const leader = players.find((p) => p.spins) || null;
  const strip = leader
    ? `Slots ${leader.name} ${leader.points} (${spins} spin${spins === 1 ? '' : 's'})`
    : 'Slots —';
  return { on: true, spins, points, players, leader, strip };
}

module.exports = {
  isBirdieOrBetter,
  slotSpin,
  computeBirdieSlots,
};
