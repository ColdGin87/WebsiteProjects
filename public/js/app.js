function svcApi(method) {
  const args = Array.prototype.slice.call(arguments, 1);
  const client = (typeof window !== 'undefined' && typeof window.apiClient === 'function')
    ? window.apiClient()
    : ((typeof window !== 'undefined' && window.api) || (typeof api === 'object' ? api : {}) || {});
  if (client && typeof client[method] === 'function') return client[method].apply(client, args);
  if (typeof window !== 'undefined' && typeof window.callApi === 'function') {
    return window.callApi.apply(null, arguments);
  }
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = localStorage.getItem('goldendale_scorecard_token');
    if (token) headers.Authorization = 'Bearer ' + token;
  } catch { /* ignore */ }
  const init = { method: 'POST', headers, body: JSON.stringify(args[1] || {}) };
  return fetch(args[0], init).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || ('HTTP ' + res.status));
    return data;
  });
}

const app = {
  init() {
    auth.init();
    window.addEventListener('hashchange', () => this.route());

    document.querySelectorAll('.nav-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate(link.getAttribute('href'));
        this.closeMobileMenu();
      });
    });

    const toggle = document.getElementById('mobile-menu-toggle');
    const nav = document.getElementById('main-nav');
    if (toggle && nav) {
      toggle.addEventListener('click', () => {
        nav.classList.toggle('open');
        toggle.classList.toggle('open');
      });
    }

    this.route();
  },

  closeMobileMenu() {
    const nav = document.getElementById('main-nav');
    const toggle = document.getElementById('mobile-menu-toggle');
    if (nav) nav.classList.remove('open');
    if (toggle) toggle.classList.remove('open');
  },

  navigate(hash) {
    location.hash = hash;
  },

  async route() {
    const hash = location.hash || '#dashboard';
    const parts = hash.substring(1).split('/');
    const page = parts[0];
    const id = parts[1];

    this.closeMobileMenu();
    if (window.scorecard && page !== 'round') scorecard.stopPoll();

    document.querySelectorAll('.nav-link').forEach((link) => {
      const href = (link.getAttribute('href') || '').substring(1).split('/')[0];
      link.classList.toggle('active', href === page || (page === 'round' && href === 'dashboard'));
    });

    switch (page) {
      case 'dashboard':
      case 'rounds':
        dashboard.render();
        break;
      case 'create':
        dashboard.renderCreate();
        break;
      case 'profile':
        dashboard.renderProfile();
        break;
      case 'courses':
        dashboard.renderCourses();
        break;
      case 'round':
        if (id) scorecard.renderRound(id, parts[2]);
        else dashboard.render();
        break;
      case 'join':
        await this.handleJoin(id);
        break;
      case 'lb':
      case 'board':
        if (id) leaderboardView.renderPublic(id);
        else dashboard.render();
        break;
      case 'magic':
        await this.handleMagic(id);
        break;
      case 'reset':
        await this.handleReset(id);
        break;
      default:
        dashboard.render();
    }
  },

  async handleJoin(code) {
    const container = document.getElementById('app');
    if (!code) {
      dashboard.render();
      return;
    }
    if (!auth.currentUser) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Join round ${ _esc(code.toUpperCase()) }</h3>
          <p>Sign in, then we'll add you to this group.</p>
          <button class="btn btn-primary" onclick="auth.showModal('login')">Sign In</button>
        </div>`;
      sessionStorage.setItem('pending_join', code);
      return;
    }
    try {
      const state = await svcApi('post', '/api/rounds/join', { code });
      this.navigate('#round/' + state.round.id);
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Could not join</h3><p>${_esc(err.message)}</p></div>`;
    }
  },

  async handleMagic(token) {
    const container = document.getElementById('app');
    try {
      await auth.consumeMagic(token);
      const pending = sessionStorage.getItem('pending_join');
      sessionStorage.removeItem('pending_join');
      this.navigate(pending ? '#join/' + pending : '#dashboard');
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Magic link failed</h3><p>${_esc(err.message)}</p></div>`;
    }
  },

  async handleReset(token) {
    const container = document.getElementById('app');
    container.innerHTML = `
      <h2 class="section-title">Set a new password</h2>
      <form class="card" id="reset-form">
        <div class="form-group"><label>New password</label><input class="form-input" type="password" name="password" minlength="6" required></div>
        <button class="btn btn-primary" type="submit">Save password</button>
        <div class="form-error" id="reset-error"></div>
      </form>`;
    document.getElementById('reset-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await auth.consumeReset(token, new FormData(e.target).get('password'));
        this.navigate('#dashboard');
      } catch (err) {
        document.getElementById('reset-error').textContent = err.message;
      }
    });
  },
};

window.app = app;
document.addEventListener('DOMContentLoaded', () => {
  app.init();
  const pending = sessionStorage.getItem('pending_join');
  if (pending && auth.currentUser && !location.hash.startsWith('#join')) {
    app.navigate('#join/' + pending);
  }
});
