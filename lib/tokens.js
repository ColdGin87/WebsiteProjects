const crypto = require('crypto');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomJoinCode(length = 8) {
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function appBaseUrl(req) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '');
  const host = req?.headers?.host || '';
  const forwarded = req?.headers?.['x-forwarded-proto'];
  const local = /localhost|127\.0\.0\.1/.test(host);
  const proto = forwarded || (local ? 'http' : 'https');
  if (host) return `${proto}://${host}`;
  return 'http://localhost:3000';
}

module.exports = { randomJoinCode, randomToken, appBaseUrl };
