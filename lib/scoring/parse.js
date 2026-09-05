/**
 * Handicap parsing and rounding helpers.
 * Plus handicaps may be entered as "+2" or -2.
 * Decimals round to nearest, half away from zero.
 */

function roundNearest(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n >= 0) return Math.round(n);
  return -Math.round(-n);
}

function parseHandicap(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('+')) {
      const mag = Number(trimmed.slice(1));
      if (!Number.isFinite(mag)) return 0;
      return -mag;
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function playingHandicap(value) {
  return roundNearest(parseHandicap(value));
}

function validateGross(gross) {
  const n = Number(gross);
  if (!Number.isInteger(n) || n < 1 || n > 19) {
    const err = new Error('Gross score must be an integer from 1 to 19.');
    err.statusCode = 400;
    throw err;
  }
  return n;
}

module.exports = {
  roundNearest,
  parseHandicap,
  playingHandicap,
  validateGross,
};
