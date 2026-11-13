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

/**
 * Phone numeric pads often replace a lone "1" instead of appending, so 11/12/13
 * never form. Recover 10–19 from the pending first digit + the inserted key.
 */
function readGrossTyping(previousPending, fieldValue, insertedDigit) {
  let raw = String(fieldValue == null ? '' : fieldValue).replace(/\D/g, '');
  const prev = String(previousPending == null ? '' : previousPending).replace(/\D/g, '');
  const ins = String(insertedDigit == null ? '' : insertedDigit).replace(/\D/g, '');
  if (raw.length <= 1 && prev.length === 1 && ins.length === 1) {
    const pair = (prev + ins).slice(0, 2);
    const n = Number(pair);
    if (n >= 10 && n <= 19) raw = pair;
  }
  raw = raw.slice(0, 2);
  if (!raw) return { raw: '', value: null, complete: false };
  const n = Number(raw);
  if (!Number.isInteger(n)) return { raw: '', value: null, complete: false };
  if (n > 19) return { raw: '', value: null, complete: false, overflow: true };
  if (n >= 10 && n <= 19) return { raw, value: n, complete: true };
  if (n >= 2 && n <= 9) return { raw, value: n, complete: true };
  if (n === 1) return { raw: '1', value: 1, complete: false };
  return { raw: '', value: null, complete: false };
}

module.exports = {
  roundNearest,
  parseHandicap,
  playingHandicap,
  validateGross,
  readGrossTyping,
};
