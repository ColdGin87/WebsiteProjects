/**
 * API Client — JWT storage and fetch wrapper
 * All API calls go through this module.
 */
const api = {
  TOKEN_KEY: 'bandon_retreat_token',

  /* ---- Token helpers ---- */
  setToken(token) {
    localStorage.setItem(this.TOKEN_KEY, token);
  },

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  clearToken() {
    localStorage.removeItem(this.TOKEN_KEY);
  },

  /* ---- Core request method ---- */
  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    const opts = { method, headers };
    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(path, opts);
    } catch (networkErr) {
      throw new Error('Network error. Please check your connection.');
    }

    // Try to parse JSON; some responses may not have a body
    let data = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }
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

  /* ---- Convenience methods ---- */
  get(path) {
    return this.request('GET', path);
  },

  post(path, body) {
    return this.request('POST', path, body);
  },

  put(path, body) {
    return this.request('PUT', path, body);
  }
};

window.api = api;
