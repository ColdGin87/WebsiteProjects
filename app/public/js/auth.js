/**
 * Auth UI — login, register, logout, session check
 */
const auth = {
  currentUser: null,

  init() {
    document.getElementById('btn-show-login')?.addEventListener('click', () => this.showModal());
    document.getElementById('btn-logout')?.addEventListener('click', () => this.logout());
    document.getElementById('tab-login')?.addEventListener('click', () => this.switchTab('login'));
    document.getElementById('tab-register')?.addEventListener('click', () => this.switchTab('register'));
    document.getElementById('login-form')?.addEventListener('submit', (e) => this.handleLogin(e));
    document.getElementById('register-form')?.addEventListener('submit', (e) => this.handleRegister(e));
    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.hideModal();
    });
    this.checkSession();
  },

  async checkSession() {
    const token = api.getToken();
    if (!token) { this.updateUI(null); return; }
    try {
      const user = await api.get('/api/auth/me');
      this.currentUser = user;
      this.updateUI(user);
    } catch {
      api.clearToken();
      this.updateUI(null);
    }
  },

  updateUI(user) {
    const loginBtn = document.getElementById('btn-show-login');
    const userMenu = document.getElementById('user-menu');
    const userName = document.getElementById('user-name');
    const adminBtns = document.querySelectorAll('.admin-only');

    if (user) {
      this.currentUser = user;
      if (loginBtn) loginBtn.style.display = 'none';
      if (userMenu) userMenu.style.display = 'flex';
      if (userName) userName.textContent = user.name;
      adminBtns.forEach(el => el.style.display = user.is_admin ? '' : 'none');
    } else {
      this.currentUser = null;
      if (loginBtn) loginBtn.style.display = '';
      if (userMenu) userMenu.style.display = 'none';
      adminBtns.forEach(el => el.style.display = 'none');
    }
  },

  showModal() {
    document.getElementById('modal-overlay')?.classList.add('active');
    this.switchTab('login');
  },

  hideModal() {
    document.getElementById('modal-overlay')?.classList.remove('active');
    document.getElementById('auth-error').textContent = '';
  },

  switchTab(tab) {
    document.getElementById('tab-login')?.classList.toggle('active', tab === 'login');
    document.getElementById('tab-register')?.classList.toggle('active', tab === 'register');
    document.getElementById('login-form').style.display = tab === 'login' ? '' : 'none';
    document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
    document.getElementById('auth-error').textContent = '';
  },

  async handleLogin(e) {
    e.preventDefault();
    const errEl = document.getElementById('auth-error');
    try {
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const data = await api.post('/api/auth/login', { email, password });
      api.setToken(data.token);
      this.updateUI(data.user);
      this.hideModal();
      if (window.app) window.app.navigate(location.hash || '#dashboard');
    } catch (err) {
      errEl.textContent = err.message;
    }
  },

  async handleRegister(e) {
    e.preventDefault();
    const errEl = document.getElementById('auth-error');
    try {
      const name = document.getElementById('reg-name').value;
      const email = document.getElementById('reg-email').value;
      const password = document.getElementById('reg-password').value;
      const handicap = parseFloat(document.getElementById('reg-handicap').value) || 0;
      const data = await api.post('/api/auth/register', { name, email, password, handicap });
      api.setToken(data.token);
      this.updateUI(data.user);
      this.hideModal();
      if (window.app) window.app.navigate('#dashboard');
    } catch (err) {
      errEl.textContent = err.message;
    }
  },

  logout() {
    api.clearToken();
    this.updateUI(null);
    if (window.app) window.app.navigate('#dashboard');
  }
};

window.auth = auth;
