const AUTH_TOKEN_KEY = 'goldendale_scorecard_token';

function authFetch(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (token) headers.Authorization = 'Bearer ' + token;
  } catch {
    /* ignore */
  }
  const init = { method, headers };
  if (body != null && method !== 'GET' && method !== 'HEAD') {
    init.body = JSON.stringify(body);
  }
  return fetch(path, init).then(async (res) => {
    let data = null;
    const contentType = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
    if (contentType.includes('application/json')) {
      try { data = await res.json(); } catch { data = null; }
    } else {
      try { data = await res.text(); } catch { data = null; }
    }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || ('HTTP ' + res.status);
      const err = new Error(typeof msg === 'string' ? msg : 'Request failed.');
      err.status = res.status;
      throw err;
    }
    return data;
  });
}

function apiClient() {
  const raw = (typeof window !== 'undefined' && window.api)
    || (typeof api !== 'undefined' ? api : null);
  const base = raw && typeof raw === 'object' ? raw : {};

  if (typeof window !== 'undefined' && typeof window.ensureApiMethods === 'function') {
    try { window.ensureApiMethods(base); } catch { /* keep going */ }
  }

  const request = typeof base.request === 'function'
    ? base.request.bind(base)
    : function request(method, path, body) { return authFetch(method, path, body); };

  const client = {
    request,
    get: typeof base.get === 'function'
      ? base.get.bind(base)
      : function get(path) { return request('GET', path); },
    post: typeof base.post === 'function'
      ? base.post.bind(base)
      : function post(path, body) { return request('POST', path, body); },
    put: typeof base.put === 'function'
      ? base.put.bind(base)
      : function put(path, body) { return request('PUT', path, body); },
    del: typeof base.del === 'function'
      ? base.del.bind(base)
      : function del(path) { return request('DELETE', path); },
    setToken: typeof base.setToken === 'function'
      ? base.setToken.bind(base)
      : function setToken(token) {
        try { localStorage.setItem(AUTH_TOKEN_KEY, token); } catch { /* ignore */ }
      },
    getToken: typeof base.getToken === 'function'
      ? base.getToken.bind(base)
      : function getToken() {
        try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch { return null; }
      },
    clearToken: typeof base.clearToken === 'function'
      ? base.clearToken.bind(base)
      : function clearToken() {
        try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch { /* ignore */ }
      },
  };

  try {
    if (typeof base.request !== 'function') base.request = request;
    if (typeof base.post !== 'function') base.post = client.post;
    if (typeof base.get !== 'function') base.get = client.get;
    if (typeof base.put !== 'function') base.put = client.put;
    if (typeof base.del !== 'function') base.del = client.del;
    if (typeof window !== 'undefined' && !window.api) window.api = base;
  } catch {
    /* frozen stale client — returned wrapper still signs in */
  }

  return client;
}

const auth = {
  currentUser: null,

  init() {
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.addEventListener('click', () => this.showModal('login'));

    const closeBtn = document.getElementById('modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.hideModal());

    document.querySelectorAll('.modal-tab').forEach((tab) => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const magicForm = document.getElementById('magic-form');
    const forgotForm = document.getElementById('forgot-form');
    if (loginForm) loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    if (registerForm) registerForm.addEventListener('submit', (e) => this.handleRegister(e));
    if (magicForm) magicForm.addEventListener('submit', (e) => this.handleMagic(e));
    if (forgotForm) forgotForm.addEventListener('submit', (e) => this.handleForgot(e));

    const forgotBtn = document.getElementById('forgot-btn');
    if (forgotBtn) forgotBtn.addEventListener('click', () => this.switchTab('forgot'));

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());

    this.checkSession();
  },

  async checkSession() {
    const client = apiClient();
    if (!client.getToken || !client.getToken()) {
      this.setUser(null);
      return;
    }
    try {
      const data = await client.get('/api/auth/me');
      this.setUser(data.user || data);
    } catch {
      if (client.clearToken) client.clearToken();
      this.setUser(null);
    }
  },

  setUser(user) {
    this.currentUser = user;
    this.updateUI();
  },

  updateUI() {
    const user = this.currentUser;
    const loginBtn = document.getElementById('login-btn');
    const userMenu = document.getElementById('user-menu');
    const userName = document.getElementById('user-name');
    const adminEls = document.querySelectorAll('.admin-only');

    if (user) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (userMenu) userMenu.style.display = 'flex';
      if (userName) userName.textContent = user.name || user.email;
      adminEls.forEach((el) => { el.style.display = user.is_admin ? '' : 'none'; });
    } else {
      if (loginBtn) loginBtn.style.display = '';
      if (userMenu) userMenu.style.display = 'none';
      adminEls.forEach((el) => { el.style.display = 'none'; });
    }
  },

  showModal(tab) {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('active');
    if (tab) this.switchTab(tab);
  },

  hideModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('active');
    this.clearErrors();
  },

  switchTab(tab) {
    const map = { login: 'login-form', register: 'register-form', magic: 'magic-form', forgot: 'forgot-form' };
    document.querySelectorAll('.modal-tab').forEach((el) => {
      el.classList.toggle('active', el.dataset.tab === tab);
    });
    Object.entries(map).forEach(([key, id]) => {
      const form = document.getElementById(id);
      if (form) form.style.display = key === tab ? '' : 'none';
    });
    this.clearErrors();
  },

  clearErrors() {
    ['login-error', 'register-error', 'magic-error', 'forgot-error'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });
  },

  async handleLogin(e) {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    try {
      const client = apiClient();
      const data = await client.post('/api/auth/login', {
        email: document.getElementById('login-email').value.trim(),
        password: document.getElementById('login-password').value,
      });
      if (client.setToken) client.setToken(data.token);
      this.setUser(data.user);
      this.hideModal();
      if (window.app) window.app.route();
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Login failed.';
    }
  },

  async handleRegister(e) {
    e.preventDefault();
    const errEl = document.getElementById('register-error');
    try {
      const client = apiClient();
      const data = await client.post('/api/auth/register', {
        name: document.getElementById('register-name').value.trim(),
        email: document.getElementById('register-email').value.trim(),
        password: document.getElementById('register-password').value,
        handicap: document.getElementById('register-handicap').value.trim() || null,
        homeTee: document.getElementById('register-tee').value.trim() || null,
      });
      if (client.setToken) client.setToken(data.token);
      this.setUser(data.user);
      this.hideModal();
      if (window.app) window.app.navigate('#dashboard');
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Registration failed.';
    }
  },

  async handleMagic(e) {
    e.preventDefault();
    const errEl = document.getElementById('magic-error');
    const out = document.getElementById('magic-result');
    try {
      const data = await apiClient().post('/api/auth/magic-link', {
        email: document.getElementById('magic-email').value.trim(),
      });
      if (out) {
        out.innerHTML = data.link
          ? '<p>Open this link to sign in:</p><a href="' + data.link + '">' + data.link + '</a>'
          : '<p>' + (data.message || 'Check your email.') + '</p>';
      }
    } catch (err) {
      if (errEl) errEl.textContent = err.message;
    }
  },

  async handleForgot(e) {
    e.preventDefault();
    const errEl = document.getElementById('forgot-error');
    const out = document.getElementById('forgot-result');
    try {
      const data = await apiClient().post('/api/auth/forgot', {
        email: document.getElementById('forgot-email').value.trim(),
      });
      if (out) {
        out.innerHTML = data.link
          ? '<p>Reset link:</p><a href="' + data.link + '">' + data.link + '</a>'
          : '<p>' + (data.message || 'If that account exists, a reset link was created.') + '</p>';
      }
    } catch (err) {
      if (errEl) errEl.textContent = err.message;
    }
  },

  async consumeMagic(token) {
    const client = apiClient();
    const data = await client.post('/api/auth/magic', { token });
    if (client.setToken) client.setToken(data.token);
    this.setUser(data.user);
  },

  async consumeReset(token, password) {
    const client = apiClient();
    const data = await client.post('/api/auth/reset', { token, password });
    if (client.setToken) client.setToken(data.token);
    this.setUser(data.user);
  },

  logout() {
    const client = apiClient();
    if (client.clearToken) client.clearToken();
    this.setUser(null);
    if (window.app) window.app.navigate('#dashboard');
  },
};

window.auth = auth;
window.apiClient = apiClient;
