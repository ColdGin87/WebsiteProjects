/**
 * Dashboard View
 */
const dashboard = {
  async render() {
    const container = document.getElementById('app');
    container.innerHTML = '<div class="loading">Loading dashboard...</div>';

    try {
      const [rounds, players] = await Promise.all([
        api.get('/api/rounds'),
        api.get('/api/players')
      ]);

      let leaderboard = [];
      try { leaderboard = await api.get('/api/leaderboard'); } catch {}

      const activeRound = rounds.find(r => r.status === 'active');
      const upcomingRounds = rounds.filter(r => r.status === 'upcoming');
      const completedRounds = rounds.filter(r => r.status === 'completed');

      const user = auth.currentUser;
      let myMatches = [];
      if (user) {
        try { myMatches = await api.get(`/api/matches?player=${user.id}`); } catch {}
      }

      const myWins = myMatches.filter(m => m.winner_id === user?.id).length;
      const myTotal = myMatches.filter(m => m.status === 'completed').length;

      container.innerHTML = `
        <div class="hero">
          <h1>Bandon Dunes Retreat</h1>
          <p>8 Players &bull; 5 Rounds &bull; 28 Matches &bull; All 91 Holes</p>
        </div>

        ${user ? `
        <div class="stats-row" style="margin-bottom:1.5rem">
          <div class="stat-card">
            <div class="stat-value">${players.length}</div>
            <div class="stat-label">Players</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${completedRounds.length}/${rounds.length}</div>
            <div class="stat-label">Rounds</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${myWins}</div>
            <div class="stat-label">My Wins</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${myTotal}</div>
            <div class="stat-label">Matches Played</div>
          </div>
        </div>` : ''}

        ${user?.is_admin ? `
        <div class="card admin-only">
          <div class="card-header"><span class="card-title">Admin Controls</span></div>
          <button class="btn btn-accent" onclick="dashboard.generateAll()">Generate All Rounds Schedule</button>
        </div>` : ''}

        ${activeRound ? `
        <h2 class="section-title">Now Playing</h2>
        <div class="round-card" onclick="app.navigate('#round/${activeRound.id}')">
          <div class="round-number">Round ${activeRound.round_number}</div>
          <div class="course-name">${activeRound.name}</div>
          <span class="badge badge-active">Active</span>
        </div>` : ''}

        <h2 class="section-title">Schedule</h2>
        <div class="grid grid-2">
          ${rounds.map(r => `
            <div class="round-card" onclick="app.navigate('#round/${r.id}')">
              <div class="round-number">Round ${r.round_number}</div>
              <div class="course-name">${r.name.replace('Round ' + r.round_number + ' - ', '')}</div>
              <span class="badge badge-${r.status}">${r.status}</span>
            </div>
          `).join('')}
        </div>

        ${leaderboard.length > 0 ? `
        <h2 class="section-title">Standings</h2>
        <div class="card">
          <table class="leaderboard-table">
            <thead><tr><th>#</th><th>Player</th><th>W</th><th>L</th><th>H</th><th>Pts</th></tr></thead>
            <tbody>
              ${leaderboard.slice(0, 5).map((p, i) => `
                <tr class="${i < 3 ? 'rank-' + (i+1) : ''} ${p.player_id === user?.id ? 'current-user' : ''}">
                  <td class="rank-cell">${i + 1}</td>
                  <td>${p.name}</td>
                  <td>${p.wins}</td>
                  <td>${p.losses}</td>
                  <td>${p.halves}</td>
                  <td class="points-cell">${p.points}</td>
                </tr>`).join('')}
            </tbody>
          </table>
          <div style="text-align:center;margin-top:0.75rem">
            <a href="#leaderboard" class="btn btn-sm btn-secondary" onclick="event.preventDefault();app.navigate('#leaderboard')">View Full Leaderboard</a>
          </div>
        </div>` : ''}

        ${!user ? `
        <div class="empty-state">
          <div class="emoji">&#9971;</div>
          <h3>Welcome to the Retreat</h3>
          <p>Log in or create an account to view your matches and enter scores.</p>
          <button class="btn btn-primary" style="margin-top:1rem" onclick="auth.showModal()">Sign In</button>
        </div>` : ''}
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error loading dashboard</h3><p>${err.message}</p></div>`;
    }
  },

  async generateAll() {
    try {
      await api.post('/api/rounds/generate-all');
      alert('Schedule generated! All foursomes and matches created.');
      this.render();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }
};

window.dashboard = dashboard;
