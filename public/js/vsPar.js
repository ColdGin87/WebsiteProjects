/**
 * Team hole/race totals are already vs par (sum of counted-ball vs-par).
 * These helpers only format and sum those values.
 */

function formatVsPar(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return 'E';
  return n > 0 ? '+' + n : String(n);
}

function holeTeamVsPar(teamTotal) {
  if (teamTotal === null || teamTotal === undefined || teamTotal === '') return null;
  const total = Number(teamTotal);
  return Number.isFinite(total) ? total : null;
}

function runningTeamVsPar(holes, throughHole) {
  const through = Number(throughHole);
  if (!Number.isFinite(through)) return null;
  let sum = 0;
  let any = false;
  for (const hole of holes || []) {
    const n = Number(hole.holeNumber ?? hole.hole_number);
    if (!Number.isFinite(n) || n > through) continue;
    const v = holeTeamVsPar(hole.total);
    if (v == null) continue;
    sum += v;
    any = true;
  }
  return any ? sum : null;
}

function strokeDotMarks(strokes) {
  const n = Number(strokes);
  if (!Number.isFinite(n) || n === 0) return { plus: false, count: 0 };
  if (n < 0) return { plus: true, count: 0 };
  return { plus: false, count: Math.min(3, Math.floor(n)) };
}

const vsParApi = { formatVsPar, holeTeamVsPar, runningTeamVsPar, strokeDotMarks };

if (typeof module === 'object' && module.exports) {
  module.exports = vsParApi;
}
if (typeof window !== 'undefined') {
  window.vsPar = vsParApi;
}
