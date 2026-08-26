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
    if (!api.getToken()) {
      this.setUser(null);
      return;
    }
    try {
      const data = await api.get('/api/auth/me');
      this.setUser(data.user || data);
    } catch {
      api.clearToken();
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
      const data = await api.post('/api/auth/login', {
        email: document.getElementById('login-email').value.trim(),
        password: document.getElementById('login-password').value,
      });
      api.setToken(data.token);
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
      const data = await api.post('/api/auth/register', {
        name: document.getElementById('register-name').value.trim(),
        email: document.getElementById('register-email').value.trim(),
        password: document.getElementById('register-password').value,
        handicap: document.getElementById('register-handicap').value.trim() || null,
        homeTee: document.getElementById('register-tee').value.trim() || null,
      });
      api.setToken(data.token);
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
      const data = await api.post('/api/auth/magic-link', {
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
      const data = await api.post('/api/auth/forgot', {
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
    const data = await api.post('/api/auth/magic', { token });
    api.setToken(data.token);
    this.setUser(data.user);
  },

  async consumeReset(token, password) {
    const data = await api.post('/api/auth/reset', { token, password });
    api.setToken(data.token);
    this.setUser(data.user);
  },

  logout() {
    api.clearToken();
    this.setUser(null);
    if (window.app) window.app.navigate('#dashboard');
  },
};

window.auth = auth;
