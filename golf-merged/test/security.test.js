const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { randomJoinCode } = require('../lib/tokens');

const ROOT = path.join(__dirname, '..');

describe('Production backdoor locks', () => {
  const saved = {};

  beforeEach(() => {
    for (const key of ['VERCEL_ENV', 'VERCEL', 'ALLOW_DEMO', 'JWT_SECRET', 'NODE_ENV']) {
      saved[key] = process.env[key];
    }
    delete require.cache[require.resolve('../lib/security')];
  });

  afterEach(() => {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    delete require.cache[require.resolve('../lib/security')];
  });

  it('forces demo routes off in Vercel production even if ALLOW_DEMO=1', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.ALLOW_DEMO = '1';
    const { demoRoutesEnabled, mayRevealEmailLinks } = require('../lib/security');
    assert.equal(demoRoutesEnabled(), false);
    assert.equal(mayRevealEmailLinks(), false);
  });

  it('allows demo routes only when ALLOW_DEMO=1 off production', () => {
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL;
    process.env.ALLOW_DEMO = '1';
    const { demoRoutesEnabled } = require('../lib/security');
    assert.equal(demoRoutesEnabled(), true);
  });

  it('rejects a weak JWT secret in Vercel production', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.JWT_SECRET = 'golf-retreat-secret-key';
    const { jwtSecret } = require('../lib/security');
    assert.throws(() => jwtSecret(), /JWT_SECRET/);
  });
});

describe('Join codes and rate limits', () => {
  it('makes 8-character codes from a no-lookalike alphabet', () => {
    const code = randomJoinCode();
    assert.equal(code.length, 8);
    assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
    assert.doesNotMatch(code, /[01IO]/);
  });

  it('rate-limits after the configured max', () => {
    const { createRateLimit } = require('../lib/security');
    const limit = createRateLimit({ windowMs: 60_000, max: 2, message: 'slow down' });
    const req = { headers: {}, ip: '203.0.113.9' };
    const seen = [];
    const res = {
      set() {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        seen.push({ status: this.statusCode, body });
        return this;
      },
    };
    let nextCount = 0;
    const next = () => { nextCount += 1; };
    limit(req, res, next);
    limit(req, res, next);
    limit(req, res, next);
    assert.equal(nextCount, 2);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].status, 429);
    assert.match(seen[0].body.error, /slow down/);
  });
});

describe('Client JS has no secrets', () => {
  it('does not embed JWT, Turso, or DB credentials', () => {
    const dir = path.join(ROOT, 'public');
    const files = [];
    function walk(folder) {
      for (const name of fs.readdirSync(folder)) {
        const full = path.join(folder, name);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (/\.(js|html|css)$/i.test(name)) files.push(full);
      }
    }
    walk(dir);
    const banned = [
      /JWT_SECRET/,
      /TURSO_AUTH_TOKEN/,
      /TURSO_DATABASE_URL/,
      /golf-retreat-secret-key/,
      /libsql:\/\//,
      /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./,
    ];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const pattern of banned) {
        assert.doesNotMatch(text, pattern, path.relative(ROOT, file) + ' leaked ' + pattern);
      }
    }
  });
});
