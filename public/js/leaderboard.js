const leaderboardView = {
  state: null,
  token: null,
  _timer: null,

  async renderPublic(token) {
    this.token = token;
    const container = document.getElementById('app');
    const cached = scorecard.readCache('public:' + token);
    if (cached) {
      this.state = cached;
      this.draw(cached, true);
    } else {
      container.innerHTML = '<div class="loading">Loading public board...</div>';
    }
    try {
      const state = await api.get('/api/public/' + encodeURIComponent(token));
      this.state = state;
      scorecard.writeCache('public:' + token, state);
      this.draw(state, true);
      if (this._timer) clearInterval(this._timer);
      this._timer = setInterval(() => this.refresh(token), 5000);
    } catch (err) {
      if (!cached) {
        container.innerHTML = `<div class="empty-state"><h3>Board not found</h3><p>${_esc(err.message)}</p></div>`;
      }
    }
  },

  async refresh(token) {
    try {
      const patch = await api.getLive('/api/public/' + encodeURIComponent(token) + '/live', this.state && this.state.updatedAt);
      if (!patch || patch.notModified) return;
      if (this.state && patch.updatedAt && patch.updatedAt === this.state.updatedAt) return;
      if (!this.state || !this.state.teams) {
        const full = await api.get('/api/public/' + encodeURIComponent(token));
        this.state = full;
        this.draw(full, true);
        return;
      }
      this.state.updatedAt = patch.updatedAt;
      if (patch.status && this.state.round) this.state.round.status = patch.status;
      this.state.winner = patch.winner;
      if (patch.teams) {
        this.state.teams = patch.teams.map((t) => {
          const prev = (this.state.teams || []).find((x) => x.id === t.id) || {};
          return { ...prev, ...t };
        });
      }
      for (const tot of patch.memberTotals || []) {
        const member = (this.state.members || []).find((m) => m.id === tot.id);
        if (!member) continue;
        member.totalGross = tot.totalGross;
        member.totalNet = tot.totalNet;
        member.outGross = tot.outGross;
        member.inGross = tot.inGross;
      }
      scorecard.writeCache('public:' + token, this.state);
      this.patchBoard();
    } catch {
      /* keep board */
    }
  },

  raceStrip(state) {
    return scorecard.raceStripText(state);
  },

  draw(state, readOnly) {
    const container = document.getElementById('app');
    const r = state.round;
    container.innerHTML = `
      <div class="welcome-hero">
        <div class="welcome-title">${_esc(r.name)}</div>
        <div class="welcome-subtitle">${_esc(r.course?.name || 'Goldendale Golf Club')} · read-only public board</div>
      </div>
      <div class="card"><p class="race-strip" id="race-strip">${_esc(this.raceStrip(state))}</p></div>
      <div class="card">
        <table class="leaderboard-table" id="public-teams">
          <thead><tr><th>#</th><th>Team</th><th>OUT</th><th>IN</th><th>Total</th></tr></thead>
          <tbody>
            ${(state.teams || []).map((t, i) => `
              <tr class="${i === 0 ? 'rank-1' : ''}" data-team-row="${t.id}">
                <td class="rank-cell">${i + 1}</td>
                <td class="player-cell">${_esc(t.name)}${t.incomplete ? ' *' : ''}</td>
                <td class="numeric-cell" data-out>${t.out ?? '—'}</td>
                <td class="numeric-cell" data-in>${t.inn ?? '—'}</td>
                <td class="points-cell" data-tot>${t.total ?? '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="card-title">Players</div>
        <table class="leaderboard-table" id="public-players">
          <thead><tr><th>Player</th><th>HCP</th><th>Gross</th><th>Net</th></tr></thead>
          <tbody>
            ${state.members.map((m) => `
              <tr data-member-row="${m.id}">
                <td>${_esc(m.display_name)}</td>
                <td>${m.playing_handicap ?? m.handicap ?? '—'}</td>
                <td data-gross>${m.totalGross ?? '—'}</td>
                <td data-net>${m.totalNet ?? '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${readOnly ? '<p class="card-subtitle">No login required. Scores update automatically.</p>' : ''}
    `;
  },

  patchBoard() {
    const strip = document.getElementById('race-strip');
    if (!strip || !this.state) {
      if (this.state) this.draw(this.state, true);
      return;
    }
    strip.textContent = this.raceStrip(this.state);
    for (const team of this.state.teams || []) {
      const row = document.querySelector('#public-teams [data-team-row="' + team.id + '"]');
      if (!row) continue;
      const out = row.querySelector('[data-out]');
      const inn = row.querySelector('[data-in]');
      const tot = row.querySelector('[data-tot]');
      if (out) out.textContent = team.out ?? '—';
      if (inn) inn.textContent = team.inn ?? '—';
      if (tot) tot.textContent = team.total ?? '—';
    }
    for (const m of this.state.members || []) {
      const row = document.querySelector('#public-players [data-member-row="' + m.id + '"]');
      if (!row) continue;
      const g = row.querySelector('[data-gross]');
      const n = row.querySelector('[data-net]');
      if (g) g.textContent = m.totalGross ?? '—';
      if (n) n.textContent = m.totalNet ?? '—';
    }
  },
};

window.leaderboardView = leaderboardView;
