/**
 * Auth UI — login, register, logout, session validation
 */
const auth = {
  currentUser: null,

  /**
   * Bind all auth-related DOM events. Called once on page load.
   */
  init() {
    // Show-modal button
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.addEventListener('click', () => this.showModal('login'));

    // Close modal
    const closeBtn = document.getElementById('modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.hideModal());

    // Close on overlay click
    const overlay = document.getElementById('auth-modal');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.hideModal();
      });
    }

    // Tab switching
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    if (tabLogin) tabLogin.addEventListener('click', () => this.switchTab('login'));
    if (tabRegister) tabRegister.addEventListener('click', () => this.switchTab('register'));

    // Form submissions
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    if (loginForm) loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    if (registerForm) registerForm.addEventListener('submit', (e) => this.handleRegister(e));

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());

    // Check existing session
    this.checkSession();
  },

  /**
   * Validate existing token with GET /api/auth/me
   */
  async checkSession() {
    const token = api.getToken();
    if (!token) {
      this.setUser(null);
      return;
    }
    try {
      const data = await api.get('/api/auth/me');
      // The response may be the user directly or nested: { user: {...} }
      const user = data.user || data;
      this.setUser(user);
    } catch (err) {
      api.clearToken();
      this.setUser(null);
    }
  },

  /**
   * Update internal state and DOM to reflect logged-in user or null.
   */
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
      adminEls.forEach((el) => {
        el.style.display = user.is_admin ? '' : 'none';
      });
    } else {
      if (loginBtn) loginBtn.style.display = '';
      if (userMenu) userMenu.style.display = 'none';
      adminEls.forEach((el) => {
        el.style.display = 'none';
      });
    }
  },

  /* ---- Modal management ---- */
  showModal(tab) {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('active');
    if (tab) this.switchTab(tab);
  },

  hideModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('active');
    this.clearErrors();
    // Reset forms
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    if (loginForm) loginForm.reset();
    if (registerForm) registerForm.reset();
  },

  switchTab(tab) {
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    if (tabLogin) tabLogin.classList.toggle('active', tab === 'login');
    if (tabRegister) tabRegister.classList.toggle('active', tab === 'register');
    if (loginForm) loginForm.style.display = (tab === 'login') ? '' : 'none';
    if (registerForm) registerForm.style.display = (tab === 'register') ? '' : 'none';

    this.clearErrors();
  },

  clearErrors() {
    const loginErr = document.getElementById('login-error');
    const registerErr = document.getElementById('register-error');
    if (loginErr) loginErr.textContent = '';
    if (registerErr) registerErr.textContent = '';
  },

  /* ---- Login handler ---- */
  async handleLogin(e) {
    e.preventDefault();
    const errEl = document.getElementById('login-error');

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      if (errEl) errEl.textContent = 'Please fill in all fields.';
      return;
    }

    try {
      const data = await api.post('/api/auth/login', { email, password });
      api.setToken(data.token);
      const user = data.user || data;
      this.setUser(user);
      this.hideModal();
      // Refresh current view
      if (window.app && window.app.navigate) {
        window.app.navigate(location.hash || '#dashboard');
      }
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Login failed.';
    }
  },

  /* ---- Register handler ---- */
  async handleRegister(e) {
    e.preventDefault();
    const errEl = document.getElementById('register-error');

    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const handicap = parseFloat(document.getElementById('register-handicap').value) || 0;

    if (!name || !email || !password) {
      if (errEl) errEl.textContent = 'Please fill in all fields.';
      return;
    }

    try {
      const data = await api.post('/api/auth/register', { name, email, password, handicap });
      api.setToken(data.token);
      const user = data.user || data;
      this.setUser(user);
      this.hideModal();
      if (window.app && window.app.navigate) {
        window.app.navigate('#dashboard');
      }
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'Registration failed.';
    }
  },

  /* ---- Logout ---- */
  logout() {
    api.clearToken();
    this.setUser(null);
    if (window.app && window.app.navigate) {
      window.app.navigate('#dashboard');
    }
  }
};

window.auth = auth;
