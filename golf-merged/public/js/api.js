/**
 * API client with JWT auth and an offline score queue.
 * post/get/put/del are always real functions on the object and on window.api
 * so a stale cached helper cannot leave login as `api.post is not a function`.
 */
function ensureApiMethods(target) {
  if (!target || typeof target !== 'object') return target;
  if (typeof target.request !== 'function') {
    target.request = function request(method, path, body) {
      const headers = { 'Content-Type': 'application/json' };
      try {
        const token = typeof this.getToken === 'function'
          ? this.getToken()
          : (typeof localStorage !== 'undefined' ? localStorage.getItem('goldendale_scorecard_token') : null);
        if (token) headers.Authorization = 'Bearer ' + token;
      } catch {
        /* ignore */
      }
      const init = { method, headers };
      if (body != null && method !== 'GET' && method !== 'HEAD') init.body = JSON.stringify(body);
      return fetch(path, init).then(async (res) => {
        let data = null;
        const contentType = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
        if (contentType.includes('application/json')) {
          try { data = await res.json(); } catch { data = null; }
        }
        if (!res.ok) {
          const msg = (data && (data.error || data.message)) || ('HTTP ' + res.status);
          throw new Error(typeof msg === 'string' ? msg : 'Request failed.');
        }
        return data;
      });
    };
  }
  if (typeof target.get !== 'function') {
    target.get = function get(path) { return this.request('GET', path); };
  }
  if (typeof target.post !== 'function') {
    target.post = function post(path, body) { return this.request('POST', path, body); };
  }
  if (typeof target.put !== 'function') {
    target.put = function put(path, body) { return this.request('PUT', path, body); };
  }
  if (typeof target.del !== 'function') {
    target.del = function del(path) { return this.request('DELETE', path); };
  }
  return target;
}

const api = {
  TOKEN_KEY: 'goldendale_scorecard_token',
  QUEUE_KEY: 'goldendale_offline_queue',
  SCORE_TIMEOUT_MS: 8000,
  _flushing: null,

  setToken(token) {
    localStorage.setItem(this.TOKEN_KEY, token);
  },

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  clearToken() {
    localStorage.removeItem(this.TOKEN_KEY);
  },

  queue() {
    try {
      return JSON.parse(localStorage.getItem(this.QUEUE_KEY) || '[]');
    } catch {
      return [];
    }
  },

  saveQueue(items) {
    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(items));
    this.updateBadge();
  },

  scoreKey(item) {
    const body = item && item.body;
    if (!body) return null;
    const memberId = body.memberId != null ? body.memberId : body.member_id;
    const holeNumber = body.holeNumber != null ? body.holeNumber : body.hole_number;
    if (memberId == null || holeNumber == null) return null;
    return String(memberId) + ':' + String(holeNumber);
  },

  enqueue(item) {
    const key = this.scoreKey(item);
    let items = this.queue();
    if (key) items = items.filter((q) => this.scoreKey(q) !== key);
    items.push({
      ...item,
      id: Date.now() + ':' + Math.random().toString(16).slice(2),
      createdAt: Date.now(),
    });
    this.saveQueue(items);
    if (item.body && window.scorecard && typeof scorecard.applyLocalScore === 'function') {
      scorecard.applyLocalScore(item.body.memberId, item.body.holeNumber, item.body.gross);
    }
    this.flushInBackground();
  },

  updateBadge() {
    const n = this.queue().length;
    document.querySelectorAll('#unsynced-badge, #unsynced-inline').forEach((badge) => {
      if (!badge) return;
      badge.hidden = n === 0;
      badge.textContent = 'Unsynced ' + n;
    });
  },

  flushInBackground() {
    this.flushQueue();
  },

  async flushQueue() {
    if (this._flushing) return this._flushing;
    this._flushing = this._flushNow().finally(() => {
      this._flushing = null;
    });
    return this._flushing;
  },

  async _flushNow() {
    const items = this.queue();
    if (!items.length) return;
    const remain = [];
    for (const item of items) {
      try {
        await this.request(item.method, item.path, item.body, { skipQueue: true, timeoutMs: this.SCORE_TIMEOUT_MS });
      } catch {
        remain.push(item);
      }
    }
    this.saveQueue(remain);
  },

  abortAfter(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return {
      signal: controller.signal,
      cancel() { clearTimeout(timer); },
    };
  },

  async request(method, path, body, opts) {
    const headers = { 'Content-Type': 'application/json', ...(opts?.extraHeaders || {}) };
    const token = this.getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    const init = { method, headers };
    if (body && method !== 'GET') init.body = JSON.stringify(body);

    const isScorePost = method === 'POST' && /\/scores$/.test(path);
    const isLiveGet = method === 'GET' && /\/live(?:\?|$)/.test(path);
    const timeoutMs = opts?.timeoutMs != null
      ? opts.timeoutMs
      : (isScorePost || isLiveGet ? this.SCORE_TIMEOUT_MS : 0);
    const gate = timeoutMs ? this.abortAfter(timeoutMs) : null;
    if (gate) init.signal = gate.signal;

    let res;
    try {
      res = await fetch(path, init);
      if (gate) gate.cancel();
    } catch (networkErr) {
      if (gate) gate.cancel();
      const timedOut = networkErr && (networkErr.name === 'AbortError' || /abort/i.test(networkErr.message || ''));
      if (!opts?.skipQueue && isScorePost) {
        this.enqueue({ method, path, body });
        const queued = new Error(timedOut
          ? 'Saved offline. Will sync when you are back online.'
          : 'Saved offline. Will sync when you are back online.');
        queued.offline = true;
        queued.timeout = timedOut;
        throw queued;
      }
      if (timedOut) throw new Error('Request timed out.');
      throw new Error('Network error. Please check your connection.');
    }

    if (res.status === 304) {
      return { notModified: true };
    }

    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try { data = await res.json(); } catch { data = null; }
    } else if (contentType.includes('text/')) {
      data = await res.text();
    }

    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },

  getLive(path, updatedAt) {
    const extraHeaders = {};
    let url = path;
    if (updatedAt) {
      extraHeaders['If-None-Match'] = '"' + updatedAt + '"';
      url += (path.includes('?') ? '&' : '?') + 'since=' + encodeURIComponent(updatedAt);
    }
    return this.request('GET', url, null, { extraHeaders, timeoutMs: this.SCORE_TIMEOUT_MS });
  },

  postScore(path, body) {
    return this.request('POST', path, body, { timeoutMs: this.SCORE_TIMEOUT_MS });
  },
};

api.get = function get(path) { return this.request('GET', path); };
api.post = function post(path, body) { return this.request('POST', path, body); };
api.put = function put(path, body) { return this.request('PUT', path, body); };
api.del = function del(path) { return this.request('DELETE', path); };

ensureApiMethods(api);
if (typeof window !== 'undefined') {
  if (window.api && window.api !== api && typeof window.api === 'object') {
    ensureApiMethods(window.api);
    if (typeof window.attachApiHelpers === 'function') window.attachApiHelpers(window.api);
  }
  window.api = api;
  if (typeof window.attachApiHelpers === 'function') window.attachApiHelpers(window.api);
}
window.ensureApiMethods = ensureApiMethods;
ensureApiMethods(window.api);
window.addEventListener('online', () => {
  if (typeof api.flushInBackground === 'function') api.flushInBackground();
});
document.addEventListener('DOMContentLoaded', () => {
  if (typeof api.updateBadge === 'function') api.updateBadge();
  if (typeof api.flushInBackground === 'function') api.flushInBackground();
});
