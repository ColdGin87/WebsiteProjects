/**
 * App — Hash-based router and initialization
 */
const app = {
  init() {
    auth.init();
    window.addEventListener('hashchange', () => this.route());

    // Nav link handlers
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate(link.getAttribute('href'));
      });
    });

    this.route();
  },

  navigate(hash) {
    location.hash = hash;
  },

  route() {
    const hash = location.hash || '#dashboard';
    const parts = hash.substring(1).split('/');
    const page = parts[0];
    const id = parts[1];

    // Update active nav
    document.querySelectorAll('.nav-links a').forEach(link => {
      const href = link.getAttribute('href').substring(1).split('/')[0];
      link.classList.toggle('active', href === page);
    });

    switch (page) {
      case 'dashboard':
        dashboard.render();
        break;
      case 'round':
        if (id) scorecard.renderRound(id);
        else dashboard.render();
        break;
      case 'match':
        if (id) scorecard.renderMatch(id);
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

  async renderPlayers() {
    const container = document.getElementById('app');
    container.innerHTML = '<div class="loading">Loading players...</div>';
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
