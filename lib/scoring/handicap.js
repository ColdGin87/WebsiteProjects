/**
 * Goldendale / USGA-style handicap allocation.
 *
 * 18-hole dots: floor(H/18) + 1 if SI <= (H mod 18).
 * If H mod 18 is 0 and H is not 0: no extra stroke (already 1 per hole).
 * Plus: give strokes back from SI 18 down (net increases on easiest holes).
 * 9-hole: round(H/2) against that nine's SI ranks (1 = hardest).
 */

const { parseHandicap, playingHandicap, roundNearest } = require('./parse');

/**
 * Course handicap from handicap index, tee, and team allowance.
 * CH = Index × (Slope / 113) + (Rating − Par), then × allowance%, then nearest.
 * For 9-hole play the caller should pass holes: 9, which returns round(CH / 2).
 */
function courseHandicap(handicapIndex, options = {}) {
  const index = parseHandicap(handicapIndex);
  const slope = Number(options.slope ?? 113);
  const par = Number(options.par ?? 72);
  const rating = Number(options.rating ?? par);
  const allowance = Number(options.allowance ?? 100);
  const holes = normalizeHoles(options.holes);

  let ch = index * (slope / 113) + (rating - par);
  ch = ch * (allowance / 100);
  if (holes === 9) {
    return roundNearest(ch / 2);
  }
  return roundNearest(ch);
}

/**
 * Strokes received (positive) or given back (negative) on one hole.
 *
 * @param {number|string} handicap - Playing handicap (whole, decimal, or +2)
 * @param {number} strokeIndex - 18-hole SI, or 9-hole rank when holes === 9
 * @param {object} [options]
 * @param {number|string} [options.holes=18] - 18, 9, 'front9', 'back9'
 * @param {Array<{holeNumber,strokeIndex}>} [options.nineHoles] - holes on this nine
 * @param {number} [options.holeNumber] - required when ranking a nine
 */
function strokesOnHole(handicap, strokeIndex, options = {}) {
  const holes = normalizeHoles(options.holes);
  let H = playingHandicap(handicap);

  if (holes === 9) {
    H = roundNearest(H / 2);
    const rank = nineHoleRank(strokeIndex, options);
    return allocateStrokes(H, rank, 9);
  }

  return allocateStrokes(H, Number(strokeIndex), 18);
}

function nineHoleRank(strokeIndex, options) {
  const nine = options.nineHoles;
  const holeNumber = options.holeNumber;
  if (Array.isArray(nine) && holeNumber != null) {
    const ranked = [...nine].sort((a, b) => {
      const si = (a.strokeIndex ?? a.stroke_index) - (b.strokeIndex ?? b.stroke_index);
      if (si !== 0) return si;
      return (a.holeNumber ?? a.hole_number) - (b.holeNumber ?? b.hole_number);
    });
    const idx = ranked.findIndex((h) => (h.holeNumber ?? h.hole_number) === holeNumber);
    if (idx >= 0) return idx + 1;
  }
  // Fallback: treat incoming strokeIndex as the nine's rank if already 1-9
  const si = Number(strokeIndex);
  if (si >= 1 && si <= 9) return si;
  // Otherwise rank from the raw 18-hole SI among typical odd/even nines
  return si;
}

/**
 * Allocate strokes for a cycle of 9 or 18 holes.
 * Plus handicaps give strokes back from the easiest hole (highest SI / rank) down.
 */
function allocateStrokes(H, si, cycle) {
  const index = Number(si);
  if (!Number.isFinite(index) || index < 1) return 0;

  if (H < 0) {
    const absH = Math.abs(H);
    const base = -Math.floor(absH / cycle);
    const rem = absH % cycle;
    let extra = 0;
    if (!(rem === 0 && absH !== 0)) {
      const easyRank = cycle + 1 - index;
      extra = easyRank <= rem ? -1 : 0;
    }
    return base + extra;
  }

  const base = Math.floor(H / cycle);
  const rem = H % cycle;
  let extra = 0;
  if (!(rem === 0 && H !== 0)) {
    extra = index <= rem ? 1 : 0;
  }
  return base + extra;
}

function netScore(gross, strokes) {
  if (gross === null || gross === undefined || gross === '') return null;
  const g = Number(gross);
  const s = Number(strokes) || 0;
  if (!Number.isFinite(g)) return null;
  return g - s;
}

function normalizeHoles(holes) {
  if (holes === 9 || holes === '9' || holes === 'front9' || holes === 'back9' || holes === 'front' || holes === 'back') {
    return 9;
  }
  return 18;
}

function holeRangeForPlay(holes) {
  if (holes === 'front9' || holes === 'front' || holes === 9) return { start: 1, end: 9, count: 9 };
  if (holes === 'back9' || holes === 'back') return { start: 10, end: 18, count: 9 };
  return { start: 1, end: 18, count: 18 };
}

module.exports = {
  courseHandicap,
  strokesOnHole,
  netScore,
  allocateStrokes,
  playingHandicap,
  parseHandicap,
  holeRangeForPlay,
  normalizeHoles,
};
