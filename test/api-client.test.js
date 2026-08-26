const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function loadBrowserScript(filename, context) {
  const src = fs.readFileSync(path.join(ROOT, 'public/js', filename), 'utf8');
  vm.runInNewContext(src, context, { filename });
  return context;
}

function browserContext(fetchImpl) {
  const store = {};
  const context = {
    fetch: fetchImpl,
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    document: {
      addEventListener() {},
      querySelectorAll() { return []; },
      getElementById() { return null; },
    },
    addEventListener() {},
    window: null,
  };
  context.window = context;
  context.globalThis = context;
  return context;
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('api client login helpers', () => {
  it('exposes api.post as a function on window.api', () => {
    const ctx = loadBrowserScript('api.js', browserContext(async () => jsonResponse({})));
    assert.equal(typeof ctx.api.post, 'function');
    assert.equal(typeof ctx.window.api.post, 'function');
    assert.equal(typeof ctx.api.get, 'function');
    assert.equal(typeof ctx.api.put, 'function');
    assert.equal(typeof ctx.api.del, 'function');
    assert.equal(ctx.window.api, ctx.api);
  });

  it('login and register call api.post', async () => {
    const calls = [];
    const ctx = loadBrowserScript('api.js', browserContext(async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      return jsonResponse({ token: 't', user: { name: 'David' } });
    }));
    assert.equal(typeof ctx.api.post, 'function');
    await ctx.api.post('/api/auth/login', { email: 'david@example.com', password: 'secret1' });
    await ctx.api.post('/api/auth/register', { name: 'David', email: 'david@example.com', password: 'secret1' });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, '/api/auth/login');
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].body, /david@example.com/);
    assert.equal(calls[1].url, '/api/auth/register');
    assert.equal(calls[1].method, 'POST');
  });

  it('auth login still posts when window.api.post is missing', async () => {
    const calls = [];
    const ctx = loadBrowserScript('api.js', browserContext(async (url, init) => {
      calls.push({ url, method: init.method });
      return jsonResponse({ token: 't', user: { name: 'David' } });
    }));
    loadBrowserScript('auth.js', ctx);
    delete ctx.window.api.post;
    assert.equal(typeof ctx.window.api.post, 'undefined');
    const client = ctx.apiClient();
    assert.equal(typeof client.post, 'function');
    await client.post('/api/auth/login', { email: 'a@b.c', password: 'x' });
    assert.equal(calls[0].url, '/api/auth/login');
    assert.equal(calls[0].method, 'POST');
  });

  it('login register magic and forgot work via fetch when post and request are missing', async () => {
    const calls = [];
    const ctx = loadBrowserScript('api.js', browserContext(async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      return jsonResponse({ token: 't', user: { name: 'David' }, message: 'ok' });
    }));
    loadBrowserScript('auth.js', ctx);
    delete ctx.window.api.post;
    delete ctx.window.api.request;
    delete ctx.window.api.get;
    const authSrc = fs.readFileSync(path.join(ROOT, 'public/js/auth.js'), 'utf8');
    assert.doesNotMatch(authSrc, /hard[- ]refresh/i);
    assert.doesNotMatch(authSrc, /Hard-refresh/);

    const client = ctx.apiClient();
    assert.equal(typeof client.post, 'function');
    await client.post('/api/auth/login', { email: 'david@example.com', password: 'secret1' });
    await client.post('/api/auth/register', { name: 'David', email: 'david@example.com', password: 'secret1' });
    await client.post('/api/auth/magic-link', { email: 'david@example.com' });
    await client.post('/api/auth/forgot', { email: 'david@example.com' });
    assert.deepEqual(calls.map((c) => c.url), [
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/magic-link',
      '/api/auth/forgot',
    ]);
    assert.ok(calls.every((c) => c.method === 'POST'));
  });

  it('apiClient never blocks when window.api is an empty stale object', async () => {
    const calls = [];
    const ctx = browserContext(async (url, init) => {
      calls.push({ url, method: init.method });
      return jsonResponse({ token: 't', user: { name: 'David' } });
    });
    ctx.window.api = {};
    loadBrowserScript('auth.js', ctx);
    const client = ctx.apiClient();
    assert.equal(typeof client.post, 'function');
    const data = await client.post('/api/auth/login', { email: 'a@b.c', password: 'x' });
    assert.equal(data.token, 't');
    assert.equal(calls[0].url, '/api/auth/login');
    assert.equal(calls[0].method, 'POST');
  });

  it('apiClient never throws when window.api has neither post nor request', async () => {
    const calls = [];
    const fields = {
      'login-email': { value: 'a@b.c' },
      'login-password': { value: 'secret1' },
      'login-error': { textContent: '' },
    };
    const ctx = browserContext(async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      return jsonResponse({ token: 't', user: { name: 'David' } });
    });
    ctx.document.getElementById = (id) => fields[id] || null;
    ctx.window.api = { stale: true };
    loadBrowserScript('auth.js', ctx);
    const authSrc = fs.readFileSync(path.join(ROOT, 'public/js/auth.js'), 'utf8');
    assert.doesNotMatch(authSrc, /missing post/);
    assert.doesNotMatch(authSrc, /hard[- ]refresh/i);
    assert.match(authSrc, /function rawPost/);
    assert.equal(typeof ctx.apiClient(), 'object');
    const client = ctx.apiClient();
    assert.equal(typeof client.post, 'function');
    assert.equal(typeof ctx.window.api.post, 'function');
    await ctx.auth.handleLogin({ preventDefault() {} });
    assert.equal(calls[0].url, '/api/auth/login');
    assert.equal(calls[0].method, 'POST');
    assert.equal(ctx.auth.currentUser.name, 'David');
  });

  it('index.html cache-busts unhashed js and css', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
    assert.match(html, /js\/api\.js\?v=/);
    assert.match(html, /js\/auth\.js\?v=/);
    assert.match(html, /css\/styles\.css\?v=/);
    const vercel = fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8');
    assert.doesNotMatch(vercel, /max-age=86400/);
    assert.match(vercel, /must-revalidate/);
  });
});
