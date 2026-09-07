const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const Store = require('../public/yardages/store');

function memoryStorage(seed) {
  const data = Object.assign({}, seed);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    _data: data,
  };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on('error', reject);
  });
}

describe('ColdGin yardages store', () => {
  it('lists the 13 clubs in bag order', () => {
    assert.deepEqual(Store.CLUBS.map((c) => c.name), [
      'Driver',
      '5-wood',
      '19° hybrid',
      '22° hybrid',
      '6-iron',
      '7-iron',
      '8-iron',
      '9-iron',
      'Pitching wedge',
      'Gap wedge',
      '52°',
      '56°',
      '60°',
    ]);
  });

  it('starts empty and keeps empty fields as blank strings', () => {
    const state = Store.emptyState();
    assert.equal(state.updatedAt, null);
    assert.equal(Store.hasAnyYards(state), false);
    assert.equal(state.clubs.driver.fullCarry, '');
    assert.equal(state.clubs.wedge60.threeQuarterTotal, '');
  });

  it('normalizes yards and rejects junk', () => {
    assert.equal(Store.normalizeYards(''), '');
    assert.equal(Store.normalizeYards('  '), '');
    assert.equal(Store.normalizeYards('245.4'), '245');
    assert.equal(Store.normalizeYards('0'), '0');
    assert.equal(Store.normalizeYards('-1'), '');
    assert.equal(Store.normalizeYards('1000'), '');
    assert.equal(Store.normalizeYards('abc'), '');
  });

  it('autosaves one field and reloads it', () => {
    const storage = memoryStorage();
    const now = new Date('2026-09-07T17:30:00.000Z');
    let state = Store.load(storage);
    state = Store.setField(state, 'iron7', 'fullCarry', '155', now);
    Store.save(storage, state);

    const loaded = Store.load(storage);
    assert.equal(loaded.clubs.iron7.fullCarry, '155');
    assert.equal(loaded.clubs.iron7.fullTotal, '');
    assert.equal(loaded.updatedAt, now.toISOString());
    assert.equal(Store.hasAnyYards(loaded), true);
  });

  it('resets one club and clears all', () => {
    const now = new Date('2026-09-07T18:00:00.000Z');
    let state = Store.emptyState();
    state = Store.setField(state, 'driver', 'fullCarry', '250', now);
    state = Store.setField(state, 'pw', 'threeQuarterTotal', '90', now);
    state = Store.resetClub(state, 'driver', now);
    assert.equal(state.clubs.driver.fullCarry, '');
    assert.equal(state.clubs.pw.threeQuarterTotal, '90');

    state = Store.clearAll(now);
    assert.equal(Store.hasAnyYards(state), false);
    assert.equal(state.updatedAt, now.toISOString());
  });

  it('survives corrupt localStorage JSON', () => {
    const storage = memoryStorage({ [Store.STORAGE_KEY]: '{not-json' });
    const state = Store.load(storage);
    assert.equal(state.clubs.driver.fullCarry, '');
    assert.equal(state.updatedAt, null);
  });
});

describe('ColdGin yardages static contract', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/yardages/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public/yardages/styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'public/yardages/app.js'), 'utf8');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'public/yardages/manifest.webmanifest'), 'utf8')
  );

  it('is Add to Home Screen friendly', () => {
    assert.match(html, /<title>ColdGin’s Yardages<\/title>/);
    assert.match(html, /name="theme-color"/);
    assert.match(html, /apple-touch-icon/);
    assert.match(html, /apple-mobile-web-app-capable/);
    assert.match(html, /rel="manifest"/);
    assert.equal(manifest.name, 'ColdGin’s Yardages');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/yardages/');
    assert.equal(manifest.scope, '/yardages/');
    assert.match(html, /href="\/yardages\/manifest\.webmanifest"/);
    assert.ok(fs.existsSync(path.join(ROOT, 'public/yardages/apple-touch-icon.png')));
    assert.ok(fs.existsSync(path.join(ROOT, 'public/yardages/icon-192.png')));
    assert.ok(fs.existsSync(path.join(ROOT, 'public/yardages/icon-512.png')));
  });

  it('labels Club Full/¾ Carry+Total and uses 44px tap targets', () => {
    assert.match(app, /Club · Full Carry · Full Total · ¾ Carry · ¾ Total/);
    assert.match(app, /type: 'number'/);
    assert.match(css, /min-height:\s*var\(--tap\)/);
    assert.match(css, /--tap:\s*48px/);
    assert.match(css, /min-height:\s*44px/);
  });
});

describe('ColdGin yardages HTTP does not collide with the scorecard', () => {
  let child;
  let base;

  before(async () => {
    const port = await getFreePort();
    const dbFile = path.join(os.tmpdir(), 'yardages-http-' + Date.now() + '.db');
    child = spawn(process.execPath, ['api/index.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        TURSO_DATABASE_URL: 'file:' + dbFile,
        TURSO_AUTH_TOKEN: '',
        JWT_SECRET: 'yardages-tester-local-only',
        APP_BASE_URL: 'http://127.0.0.1:' + port,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = 'http://127.0.0.1:' + port;
    const start = Date.now();
    let lastErr;
    while (Date.now() - start < 20000) {
      try {
        const res = await fetch(base + '/api/health');
        if (res.ok) return;
        lastErr = new Error('HTTP ' + res.status);
      } catch (err) {
        lastErr = err;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('Server did not become healthy: ' + (lastErr && lastErr.message));
  });

  after(() => {
    if (child) child.kill('SIGTERM');
  });

  it('serves yardages, scorecard root, and health', async () => {
    const [yardages, rootPage, health, manifest, icon] = await Promise.all([
      fetch(base + '/yardages/'),
      fetch(base + '/'),
      fetch(base + '/api/health'),
      fetch(base + '/yardages/manifest.webmanifest'),
      fetch(base + '/yardages/apple-touch-icon.png'),
    ]);

    assert.equal(yardages.status, 200);
    const yardHtml = await yardages.text();
    assert.match(yardHtml, /ColdGin’s Yardages/);
    assert.match(yardHtml, /store\.js/);
    assert.doesNotMatch(yardHtml, /Goldendale Scorecard/);

    assert.equal(rootPage.status, 200);
    const rootHtml = await rootPage.text();
    assert.match(rootHtml, /Goldendale Scorecard/);
    assert.doesNotMatch(rootHtml, /ColdGin’s Yardages/);

    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.ok, true);
    assert.equal(body.name, 'goldendale-scorecard');

    assert.equal(manifest.status, 200);
    const man = await manifest.json();
    assert.equal(man.short_name, 'Yardages');

    assert.equal(icon.status, 200);
    assert.match(icon.headers.get('content-type') || '', /image\/png/);

    const bare = await fetch(base + '/yardages', { redirect: 'manual' });
    assert.ok(bare.status === 200 || (bare.status >= 301 && bare.status <= 308));
    if (bare.status >= 301 && bare.status <= 308) {
      assert.match(bare.headers.get('location') || '', /\/yardages\/?$/);
    }
  });
});
