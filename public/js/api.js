/**
 * API client with JWT auth and an offline score queue.
 */
const api = {
  TOKEN_KEY: 'goldendale_scorecard_token',
  QUEUE_KEY: 'goldendale_offline_queue',

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

  enqueue(item) {
    const items = this.queue();
    items.push({ ...item, id: Date.now() + ':' + Math.random().toString(16).slice(2), createdAt: Date.now() });
    this.saveQueue(items);
  },

  updateBadge() {
    const badge = document.getElementById('unsynced-badge');
    if (!badge) return;
    const n = this.queue().length;
    badge.hidden = n === 0;
    badge.textContent = 'Unsynced ' + n;
  },

  async flushQueue() {
    const items = this.queue();
    if (!items.length) return;
    const remain = [];
    for (const item of items) {
      try {
        await this.request(item.method, item.path, item.body, { skipQueue: true });
      } catch {
        remain.push(item);
      }
    }
    this.saveQueue(remain);
  },

  async request(method, path, body, opts) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    const init = { method, headers };
    if (body && method !== 'GET') init.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(path, init);
    } catch (networkErr) {
      if (!opts?.skipQueue && method !== 'GET' && /\/scores$/.test(path)) {
        this.enqueue({ method, path, body });
        const queued = new Error('Saved offline. Will sync when you are back online.');
        queued.offline = true;
        throw queued;
      }
      throw new Error('Network error. Please check your connection.');
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

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body) { return this.request('PUT', path, body); },
  del(path) { return this.request('DELETE', path); },
};

window.api = api;
window.addEventListener('online', () => api.flushQueue());
document.addEventListener('DOMContentLoaded', () => {
  api.updateBadge();
  api.flushQueue();
});
