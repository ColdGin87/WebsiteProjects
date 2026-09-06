/**
 * Fun layer: each gross birdie+ and each net birdie+ is one slot spin.
 * Same hole can award both. Payout is deterministic from round + player +
 * hole + kind so a refresh does not re-roll. Not money — a running high score.
 */
const REEL = [0, 0, 1, 1, 2, 3, 5, 8];

function isBirdieOrBetter(score, par) {
  const s = Number(score);
  const p = Number(par);
  if (!Number.isFinite(s) || !Number.isFinite(p) || s < 1) return false;
  return s <= p - 1;
}

function slotSpin(roundId, memberId, holeNumber, kind) {
  const kindSalt = kind === 'net' ? 7919 : 0;
  let n = (Number(roundId) || 0) * 10007 + (Number(memberId) || 0) * 97 + (Number(holeNumber) || 0) * 13 + kindSalt;
  n = Math.abs(n);
  return REEL[n % REEL.length];
}

function holePar(hole) {
  return hole && hole.par;
}

function holeNum(hole) {
  return hole.holeNumber ?? hole.hole_number;
}

function funBoardText(players) {
  const rows = (players || []).filter((p) => (Number(p.spins) || 0) > 0 || (Number(p.points) || 0) > 0);
  return rows.map((p) => `${p.name} ${p.points}`).join(' · ');
}

function computeBirdieSlots({ on, holes, members, roundId } = {}) {
  if (!on) {
    return {
      on: false,
      spins: 0,
      points: 0,
      grossBirdies: 0,
      netBirdies: 0,
      players: [],
      spinLog: [],
      leader: null,
      funBoard: '',
      strip: '',
    };
  }
  const players = [];
  const spinLog = [];
  let spins = 0;
  let points = 0;
  let grossBirdies = 0;
  let netBirdies = 0;
  for (const member of members || []) {
    let playerGross = 0;
    let playerNet = 0;
    let playerSpins = 0;
    let playerPoints = 0;
    for (const hole of holes || []) {
      const hn = holeNum(hole);
      const par = holePar(hole);
      const hs = (member.holes || []).find((h) => (h.holeNumber ?? h.hole_number) === hn);
      if (!hs) continue;
      const rid = roundId || member.round_id;
      const name = member.display_name || member.name;
      if (hs.gross != null && isBirdieOrBetter(hs.gross, par)) {
        const award = slotSpin(rid, member.id, hn, 'gross');
        playerGross += 1;
        playerSpins += 1;
        playerPoints += award;
        grossBirdies += 1;
        spinLog.push({
          memberId: member.id,
          name,
          hole: hn,
          kind: 'gross',
          points: award,
        });
      }
      if (hs.net != null && isBirdieOrBetter(hs.net, par)) {
        const award = slotSpin(rid, member.id, hn, 'net');
        playerNet += 1;
        playerSpins += 1;
        playerPoints += award;
        netBirdies += 1;
        spinLog.push({
          memberId: member.id,
          name,
          hole: hn,
          kind: 'net',
          points: award,
        });
      }
    }
    spins += playerSpins;
    points += playerPoints;
    players.push({
      id: member.id,
      name: member.display_name || member.name,
      birdies: playerGross,
      grossBirdies: playerGross,
      netBirdies: playerNet,
      spins: playerSpins,
      points: playerPoints,
    });
  }
  players.sort((a, b) => b.points - a.points || b.spins - a.spins || b.birdies - a.birdies);
  const leader = players.find((p) => p.spins) || null;
  const funBoard = funBoardText(players);
  const strip = funBoard ? `Wyrm Coil ${funBoard}` : 'Wyrm Coil —';
  return {
    on: true,
    spins,
    points,
    grossBirdies,
    netBirdies,
    players,
    spinLog,
    leader,
    funBoard,
    strip,
  };
}

module.exports = {
  isBirdieOrBetter,
  slotSpin,
  funBoardText,
  computeBirdieSlots,
};
