/**
 * Production hardening helpers for Goldendale Scorecard.
 * Demo/debug routes and email-link reveals stay off on Vercel production.
 */

const WEAK_JWT = new Set([
  '',
  'golf-retreat-secret-key',
  'change-this-to-a-random-secret-string',
  'scorecard-tester-local-only',
]);

function isVercelProduction() {
  return String(process.env.VERCEL_ENV || '').toLowerCase() === 'production';
}

function demoRoutesEnabled() {
  if (isVercelProduction()) return false;
  return process.env.ALLOW_DEMO === '1';
}

function mayRevealEmailLinks() {
  if (isVercelProduction()) return false;
  if (process.env.VERCEL) return demoRoutesEnabled();
  return true;
}

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (isVercelProduction() && (!secret || WEAK_JWT.has(String(secret)))) {
    const err = new Error('JWT_SECRET must be a strong unique value in production.');
    err.statusCode = 500;
    throw err;
  }
  if (secret) return secret;
  return 'golf-retreat-dev-only';
}

function assertProdSecrets() {
  if (!isVercelProduction()) return;
  jwtSecret();
  if (process.env.ALLOW_DEMO === '1') {
    console.error('ALLOW_DEMO is ignored in Vercel production.');
  }
}

function clientIp(req) {
  const forwarded = req && req.headers && req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return (req && (req.ip || (req.socket && req.socket.remoteAddress))) || 'unknown';
}

function createRateLimit({ windowMs, max, keyFn, message } = {}) {
  const hits = new Map();
  const window = Number(windowMs) > 0 ? Number(windowMs) : 60_000;
  const limit = Number(max) > 0 ? Number(max) : 30;
  const errorText = message || 'Too many attempts. Try again shortly.';

  function prune(now) {
    if (hits.size < 2000) return;
    for (const [key, bucket] of hits) {
      if (now - bucket.start > window) hits.delete(key);
    }
  }

  function rateLimit(req, res, next) {
    const now = Date.now();
    prune(now);
    const key = keyFn ? keyFn(req) : clientIp(req);
    let bucket = hits.get(key);
    if (!bucket || now - bucket.start > window) {
      bucket = { start: now, count: 0 };
      hits.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      const retry = Math.ceil((bucket.start + window - now) / 1000);
      res.set('Retry-After', String(Math.max(1, retry)));
      return res.status(429).json({ error: errorText });
    }
    next();
  }

  rateLimit.reset = () => hits.clear();
  rateLimit._hits = hits;
  return rateLimit;
}

const joinRateLimit = createRateLimit({
  windowMs: Number(process.env.JOIN_RATE_WINDOW_MS) || 60_000,
  max: Number(process.env.JOIN_RATE_MAX) || 30,
  message: 'Too many join attempts. Try again shortly.',
});

const scoreRateLimit = createRateLimit({
  windowMs: Number(process.env.SCORE_RATE_WINDOW_MS) || 60_000,
  max: Number(process.env.SCORE_RATE_MAX) || 180,
  keyFn: (req) => (req.user && req.user.id != null ? 'u:' + req.user.id : 'ip:' + clientIp(req)),
  message: 'Too many score writes. Try again shortly.',
});

module.exports = {
  isVercelProduction,
  demoRoutesEnabled,
  mayRevealEmailLinks,
  jwtSecret,
  assertProdSecrets,
  clientIp,
  createRateLimit,
  joinRateLimit,
  scoreRateLimit,
};
