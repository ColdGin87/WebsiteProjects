/**
 * Display-only team vs-par.
 * Hole line = teamHole − 3 × par = (gross − par) + (net1 − par) + (net2 − par).
 * Does not change who counts as the 1 gross + 2 nets.
 */

function formatVsPar(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return 'E';
  return n > 0 ? '+' + n : String(n);
}

function holeTeamVsPar(teamTotal, par) {
  if (teamTotal === null || teamTotal === undefined || teamTotal === '') return null;
  if (par === null || par === undefined || par === '') return null;
  const total = Number(teamTotal);
  const p = Number(par);
  if (!Number.isFinite(total) || !Number.isFinite(p)) return null;
  return total - 3 * p;
}

function runningTeamVsPar(holes, throughHole) {
  const through = Number(throughHole);
  if (!Number.isFinite(through)) return null;
  let sum = 0;
  let any = false;
  for (const hole of holes || []) {
    const n = Number(hole.holeNumber ?? hole.hole_number);
    if (!Number.isFinite(n) || n > through) continue;
    const v = holeTeamVsPar(hole.total, hole.par);
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

const api = { formatVsPar, holeTeamVsPar, runningTeamVsPar, strokeDotMarks };

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.vsPar = api;
}
