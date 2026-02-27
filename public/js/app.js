/**
 * App — Hash-based router and initialization
 */
const app = {
  init() {
    auth.init();
    window.addEventListener('hashchange', () => this.route());

    // Nav link handlers
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate(link.getAttribute('href'));
        this.closeMobileMenu();
      });
    });

    // Mobile hamburger menu toggle
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

  route() {
    const hash = location.hash || '#dashboard';
    const parts = hash.substring(1).split('/');
    const page = parts[0];
    const id = parts[1];

    // Close mobile menu on navigation
    this.closeMobileMenu();

    // Update active nav
    document.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href').substring(1).split('/')[0];
      link.classList.toggle('active', href === page);
    });

    switch (page) {
      case 'dashboard':
        dashboard.render();
        break;
      case 'rounds':
        this.renderRoundsList();
        break;
      case 'round':
        if (id) scorecard.renderRound(id);
        else this.renderRoundsList();
        break;
      case 'match':
        if (id) scorecard.renderMatch(id);
        else dashboard.render();
        break;
      case 'challenge':
        if (id) scorecard.renderChallenge(id);
        else dashboard.render();
        break;
      case 'leaderboard':
        leaderboardView.render();
        break;
      case 'players':
        this.renderPlayers();
        break;
      default:
        dashboard.render();
    }
  },

  async renderRoundsList() {
    const container = document.getElementById('app');
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Loading rounds...</div>';
    try {
      const rounds = await api.get('/api/rounds');
      var courseColors = ['round-accent-1', 'round-accent-2', 'round-accent-3', 'round-accent-4', 'round-accent-5'];

      var html = '<h2 class="section-title">All Rounds</h2>';

      if (rounds.length === 0) {
        html += '<div class="empty-state"><h3>No rounds yet</h3><p>Rounds will appear once the tournament is set up.</p></div>';
      } else {
        html += '<div class="grid grid-2">';
        rounds.forEach(function (r, idx) {
          html += '<div class="round-card card-clickable" onclick="app.navigate(\'#round/' + r.id + '\')">';
          html += '  <div class="round-accent ' + courseColors[idx % 5] + '"></div>';
          html += '  <div style="padding-left:12px">';
          html += '    <div class="round-number">Round ' + r.round_number + '</div>';
          html += '    <div class="round-course">' + _esc(r.course_name || r.name) + '</div>';
          html += '    <span class="badge badge-' + r.status + '">' + _esc(r.status) + '</span>';
          html += '  </div>';
          html += '</div>';
        });
        html += '</div>';
      }

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><h3>Error</h3><p>' + _esc(err.message) + '</p></div>';
    }
  },

  async renderPlayers() {
    const container = document.getElementById('app');
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Loading players...</div>';
    try {
      const players = await api.get('/api/players');
      container.innerHTML = `
        <h2 class="section-title">Players</h2>
        <div class="grid grid-3">
          ${players.map(p => `
            <div class="card" style="text-align:center">
              <div style="width:60px;height:60px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:700;margin:0 auto 0.75rem">${p.name.charAt(0)}</div>
              <div style="font-size:1.1rem;font-weight:700">${p.name}</div>
              <div style="color:var(--text-light);font-size:0.85rem">Handicap: ${p.handicap}</div>
            </div>
          `).join('')}
        </div>
        ${players.length === 0 ? '<div class="empty-state"><h3>No players registered yet</h3><p>Players will appear here once they create accounts.</p></div>' : ''}
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  }
};

window.app = app;

// Boot
document.addEventListener('DOMContentLoaded', () => app.init());
