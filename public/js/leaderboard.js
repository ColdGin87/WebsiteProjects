const leaderboardView = {
  async renderPublic(token) {
    const container = document.getElementById('app');
    container.innerHTML = '<div class="loading">Loading public board...</div>';
    try {
      const state = await api.get('/api/public/' + encodeURIComponent(token));
      this.draw(state, true);
      if (this._timer) clearInterval(this._timer);
      this._timer = setInterval(async () => {
        try {
          const next = await api.get('/api/public/' + encodeURIComponent(token) + '/live');
          this.draw(next, true);
        } catch { /* ignore */ }
      }, 5000);
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Board not found</h3><p>${_esc(err.message)}</p></div>`;
    }
  },

  draw(state, readOnly) {
    const container = document.getElementById('app');
    const r = state.round;
    container.innerHTML = `
      <div class="welcome-hero">
        <div class="welcome-title">${_esc(r.name)}</div>
        <div class="welcome-subtitle">${_esc(r.course?.name || 'Goldendale Golf Club')} · read-only public board</div>
      </div>
      ${state.winner ? `<div class="card"><h3>Winning / leading team: ${_esc(state.winner.name)}</h3><p>Team total ${state.winner.total}</p></div>` : ''}
      <div class="card">
        <table class="leaderboard-table">
          <thead><tr><th>#</th><th>Team</th><th>OUT</th><th>IN</th><th>Total</th></tr></thead>
          <tbody>
            ${(state.teams || []).map((t, i) => `
              <tr class="${i === 0 ? 'rank-1' : ''}">
                <td class="rank-cell">${i + 1}</td>
                <td class="player-cell">${_esc(t.name)}${t.incomplete ? ' *' : ''}</td>
                <td class="numeric-cell">${t.out ?? '—'}</td>
                <td class="numeric-cell">${t.inn ?? '—'}</td>
                <td class="points-cell">${t.total ?? '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="card-title">Players</div>
        <table class="leaderboard-table">
          <thead><tr><th>Player</th><th>HCP</th><th>Gross</th><th>Net</th></tr></thead>
          <tbody>
            ${state.members.map((m) => `
              <tr>
                <td>${_esc(m.display_name)}</td>
                <td>${m.playing_handicap ?? m.handicap ?? '—'}</td>
                <td>${m.totalGross ?? '—'}</td>
                <td>${m.totalNet ?? '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${readOnly ? '<p class="card-subtitle">No login required. Scores update automatically.</p>' : ''}
    `;
  },
};

window.leaderboardView = leaderboardView;
