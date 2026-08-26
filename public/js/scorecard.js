const scorecard = {
  state: null,
  pollTimer: null,
  overlay: null,

  stopPoll() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  async renderRound(id) {
    this.stopPoll();
    const container = document.getElementById('app');
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Loading scorecard...</div>';
    try {
      const state = await api.get('/api/rounds/' + id);
      this.state = state;
      this.draw(state);
      this.pollTimer = setInterval(() => this.refresh(id, true), 5000);
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${_esc(err.message)}</p></div>`;
    }
  },

  async refresh(id, silent) {
    try {
      await api.flushQueue();
      const state = await api.get('/api/rounds/' + id + '/live');
      this.state = state;
      this.draw(state, silent);
    } catch {
      /* keep current view while offline */
    }
  },

  isOrganizer(state) {
    const user = auth.currentUser;
    if (!user) return false;
    if (state.round.organizer_id === user.id) return true;
    return (state.members || []).some((m) => m.player_id === user.id && m.role === 'organizer');
  },

  draw(state) {
    const container = document.getElementById('app');
    const r = state.round;
    const holes = state.holes || [];
    const organizer = this.isOrganizer(state);
    const formatLabel = r.format === 'match_play' ? 'Match play' : `${r.gross_balls} gross + ${r.net_balls} net`;
    const teeNote = r.tee?.yards_estimated ? ' · Red/Gold hole yards estimated' : '';

    const outHoles = holes.filter((h) => h.hole_number <= 9);
    const inHoles = holes.filter((h) => h.hole_number >= 10);

    container.innerHTML = `
      <div class="round-toolbar">
        <a href="#dashboard" onclick="event.preventDefault();app.navigate('#dashboard')">&larr; Rounds</a>
        <span class="badge badge-${_esc(r.status)}">${_esc(r.status)}</span>
        <span class="unsynced-inline" id="unsynced-inline"></span>
      </div>
      <div class="card">
        <h2 class="card-title">${_esc(r.name)}</h2>
        <p class="card-subtitle">${_esc(r.course?.name || '')} · ${_esc(r.tee?.name || 'Tee')} · ${formatLabel} · ${r.holes}${teeNote}</p>
        <p class="join-row">Join code <strong>${_esc(r.joinCode || r.join_code)}</strong>
          <button class="btn btn-sm btn-secondary" onclick="scorecard.copy('${_esc(r.joinUrl || '')}')">Copy join link</button>
          <button class="btn btn-sm btn-secondary" onclick="scorecard.copy('${_esc(r.publicUrl || '')}')">Copy public board</button>
        </p>
      </div>

      ${organizer ? this.settingsBar(state) : ''}

      <div class="card">
        <div class="card-header"><span class="card-title">Scorecard</span>
          <span class="card-subtitle">Tap a cell. Dots are handicap strokes. Colors are vs par.</span>
        </div>
        <div class="scorecard-container high-contrast">
          <table class="scorecard team-scorecard">
            <thead>
              <tr>
                <th>Hole</th>
                ${holes.map((h) => `<th>${h.hole_number}</th>`).join('')}
                ${outHoles.length ? '<th>OUT</th>' : ''}
                ${inHoles.length ? '<th>IN</th>' : ''}
                <th>TOT</th>
              </tr>
              <tr class="par-row">
                <th class="row-label">Par / SI</th>
                ${holes.map((h) => `<th>${h.par}<div class="si-mini">${h.stroke_index}</div></th>`).join('')}
                ${outHoles.length ? `<th>${outHoles.reduce((s, h) => s + h.par, 0)}</th>` : ''}
                ${inHoles.length ? `<th>${inHoles.reduce((s, h) => s + h.par, 0)}</th>` : ''}
                <th>${holes.reduce((s, h) => s + h.par, 0)}</th>
              </tr>
              <tr class="yds-row">
                <th class="row-label">Yds${holes.some((h) => h.yards_estimated) ? ' *' : ''}</th>
                ${holes.map((h) => `<th>${h.yards || '—'}${h.yards_estimated ? '<span class="est-label">est</span>' : ''}</th>`).join('')}
                ${outHoles.length ? `<th>${outHoles.reduce((s, h) => s + (h.yards || 0), 0) || ''}</th>` : ''}
                ${inHoles.length ? `<th>${inHoles.reduce((s, h) => s + (h.yards || 0), 0) || ''}</th>` : ''}
                <th>${holes.reduce((s, h) => s + (h.yards || 0), 0) || ''}</th>
              </tr>
            </thead>
            <tbody>
              ${this.playerRows(state, holes, outHoles, inHoles)}
              ${r.format === 'team_net' ? this.teamRows(state, holes, outHoles, inHoles) : ''}
            </tbody>
          </table>
        </div>
      </div>

      ${r.format === 'match_play' ? this.matchBlock(state) : this.resultsPreview(state)}
    `;
    this.bindOverlay();
    api.updateBadge();
  },

  settingsBar(state) {
    const r = state.round;
    return `
      <div class="admin-bar" style="display:flex">
        <span class="admin-bar-label">Organizer</span>
        <button class="btn btn-sm btn-accent" onclick="scorecard.addGuest()">Add guest</button>
        <button class="btn btn-sm btn-secondary" onclick="scorecard.balanceTeams()">Auto-balance teams</button>
        ${r.format === 'match_play' ? '<button class="btn btn-sm btn-secondary" onclick="scorecard.generateMatches()">Generate matches</button>' : ''}
        <button class="btn btn-sm btn-secondary" onclick="scorecard.setStatus('${r.status === 'completed' ? 'live' : 'completed'}')">${r.status === 'completed' ? 'Reopen' : 'Complete round'}</button>
        <label class="tiny-label">Allowance
          <select onchange="scorecard.updateSettings({allowance: Number(this.value), recomputeHandicaps:true})">
            ${[75,80,90,100].map((a) => `<option value="${a}" ${r.allowance === a ? 'selected' : ''}>${a}%</option>`).join('')}
          </select>
        </label>
        <label class="tiny-label"><input type="checkbox" ${r.dual_count ? 'checked' : ''} onchange="scorecard.updateSettings({dualCount: this.checked})"> Dual-count</label>
      </div>
      <div class="card">
        <div class="card-title">Players (${state.members.length}/20)</div>
        <div class="player-list">${state.members.map((m) => `
          <span class="player-pill">${_esc(m.display_name)} · H ${m.playing_handicap ?? m.handicap ?? '—'} ${m.team_id ? '' : '· individual'} ${m.is_guest ? '· guest' : ''}
            ${this.isOrganizer(state) ? `<button class="linkish" onclick="scorecard.editMember(${m.id})">edit</button>` : ''}
          </span>`).join('')}</div>
      </div>`;
  },

  playerRows(state, holes, outHoles, inHoles) {
    return state.members.map((m) => {
      const cells = holes.map((h) => {
        const hs = m.holes.find((x) => x.holeNumber === h.hole_number);
        const cls = this.vsParClass(hs?.gross, h.par);
        const dots = Math.max(0, hs?.strokes || 0);
        const plus = (hs?.strokes || 0) < 0;
        return `<td class="sc-cell-editable ${cls} ${dots ? 'dots-' + Math.min(dots, 3) : ''} ${plus ? 'dots-plus' : ''}"
          onclick="scorecard.openEditor(${state.round.id},${m.id},${h.hole_number},'${_esc(m.display_name)}',${hs?.gross ?? 'null'},${h.par})">
          <span class="gross">${hs?.gross ?? ''}</span>
          ${hs?.gross != null ? `<span class="net-mini">${hs.net}</span>` : ''}
        </td>`;
      }).join('');
      return `
        <tr class="row-player">
          <td class="row-label">${_esc(m.display_name)}<div class="hcp-mini">H ${m.playing_handicap ?? '—'}</div></td>
          ${cells}
          ${outHoles.length ? `<td class="sc-total">${m.outGross ?? ''} <span class="net-mini">${m.outNet ?? ''}</span></td>` : ''}
          ${inHoles.length ? `<td class="sc-total">${m.inGross ?? ''} <span class="net-mini">${m.inNet ?? ''}</span></td>` : ''}
          <td class="sc-total"><strong>${m.totalGross ?? ''}</strong> <span class="net-mini">${m.totalNet ?? ''}</span></td>
        </tr>`;
    }).join('');
  },

  teamRows(state, holes, outHoles, inHoles) {
    return (state.teams || []).map((team) => `
      <tr class="row-team">
        <td class="row-label">${_esc(team.name)}${state.winner && state.winner.id === team.id ? ' ★' : ''}</td>
        ${holes.map((h) => {
          const hole = team.holes.find((x) => x.holeNumber === h.hole_number);
          const title = (hole?.balls || []).map((b) => `${b.name} ${b.score}${b.type === 'gross' ? 'G' : 'N'}`).join(', ');
          return `<td title="${_esc(title)}" class="${hole?.incomplete ? 'incomplete' : ''}">${hole?.total ?? ''}</td>`;
        }).join('')}
        ${outHoles.length ? `<td class="sc-total">${team.out ?? ''}</td>` : ''}
        ${inHoles.length ? `<td class="sc-total">${team.inn ?? ''}</td>` : ''}
        <td class="sc-total"><strong>${team.total ?? ''}</strong></td>
      </tr>`).join('');
  },

  resultsPreview(state) {
    const winner = state.winner;
    return `
      <div class="card">
        <div class="card-header"><span class="card-title">Live results</span></div>
        ${winner ? `<p><strong>Leading: ${_esc(winner.name)}</strong> · ${_esc(String(winner.total))}</p>` : '<p>Enter scores to see team totals.</p>'}
        <p class="card-subtitle">Tie-break: back 9, last 6, last 3, 18, hardest SI. Incomplete holes are flagged.</p>
        <div class="welcome-actions">
          <button class="btn btn-secondary btn-sm" onclick="scorecard.copyText()">Copy as text</button>
          <a class="btn btn-secondary btn-sm" href="/api/rounds/${state.round.id}/results.csv" onclick="scorecard.downloadCsv(event)">CSV</a>
          <button class="btn btn-secondary btn-sm" onclick="app.navigate('#lb/${_esc(state.round.public_token || '')}')">Public board</button>
        </div>
      </div>`;
  },

  matchBlock(state) {
    const matches = state.matches || [];
    return `
      <div class="card">
        <div class="card-title">Match play</div>
        ${matches.length === 0 ? '<p>Organizer can generate pairings. 8 players use the retreat rotation; otherwise players are paired by handicap.</p>' : ''}
        ${matches.map((m) => `
          <div class="match-card">
            <div class="players">
              <span>${_esc(m.member1?.display_name || 'P1')}</span>
              <span class="vs">vs</span>
              <span>${_esc(m.member2?.display_name || 'P2')}</span>
            </div>
            <div>${_esc(m.resultText || 'All Square')}</div>
          </div>`).join('')}
      </div>`;
  },

  vsParClass(gross, par) {
    if (gross == null || par == null) return '';
    const d = gross - par;
    if (d <= -2) return 'vs-eagle';
    if (d === -1) return 'vs-birdie';
    if (d === 0) return 'vs-par';
    if (d === 1) return 'vs-bogey';
    return 'vs-double';
  },

  openEditor(roundId, memberId, holeNumber, name, current, par) {
    this.overlay = { roundId, memberId, holeNumber, name, par };
    const overlay = document.getElementById('score-overlay');
    const input = document.getElementById('score-overlay-input');
    document.getElementById('score-overlay-title').textContent = name;
    document.getElementById('score-overlay-label').textContent = `Hole ${holeNumber} · Par ${par} · Gross 1–15`;
    input.value = current == null ? par : current;
    overlay.hidden = false;
    overlay.classList.add('active');
    input.focus();
    input.select();
  },

  bindOverlay() {
    const overlay = document.getElementById('score-overlay');
    const input = document.getElementById('score-overlay-input');
    if (!overlay || overlay.dataset.bound) return;
    overlay.dataset.bound = '1';
    document.getElementById('score-minus').onclick = () => {
      input.value = Math.max(1, (Number(input.value) || 1) - 1);
    };
    document.getElementById('score-plus').onclick = () => {
      input.value = Math.min(15, (Number(input.value) || 0) + 1);
    };
    document.getElementById('score-save').onclick = () => this.saveOverlay();
    document.getElementById('score-clear').onclick = () => this.saveOverlay(true);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.hidden = true;
        overlay.classList.remove('active');
      }
    });
  },

  async saveOverlay(clear) {
    if (!this.overlay) return;
    const overlay = document.getElementById('score-overlay');
    const input = document.getElementById('score-overlay-input');
    overlay.hidden = true;
    overlay.classList.remove('active');
    try {
      const state = await api.post(`/api/rounds/${this.overlay.roundId}/scores`, {
        memberId: this.overlay.memberId,
        holeNumber: this.overlay.holeNumber,
        gross: clear ? null : Number(input.value),
      });
      this.state = state;
      this.draw(state);
    } catch (err) {
      _toast(err.message, err.offline ? '' : 'error');
      if (err.offline && this.state) this.draw(this.state);
    }
  },

  async addGuest() {
    const name = prompt('Guest name');
    if (!name) return;
    const handicap = prompt('Guest handicap (optional)', '');
    try {
      const state = await api.post(`/api/rounds/${this.state.round.id}/guests`, { name, handicap });
      this.state = state;
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async balanceTeams() {
    const n = prompt('How many teams?', '2');
    if (!n) return;
    try {
      const state = await api.post(`/api/rounds/${this.state.round.id}/teams/balance`, { teamCount: Number(n) });
      this.state = state;
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async generateMatches() {
    try {
      const state = await api.post(`/api/rounds/${this.state.round.id}/matches/generate`);
      this.state = state;
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async setStatus(status) {
    try {
      const state = await api.put(`/api/rounds/${this.state.round.id}`, { status });
      this.state = state;
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async updateSettings(body) {
    try {
      const state = await api.put(`/api/rounds/${this.state.round.id}`, body);
      this.state = state;
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async editMember(memberId) {
    const member = this.state.members.find((m) => m.id === memberId);
    const hcp = prompt('Playing handicap (editable mid-round)', member.playing_handicap ?? member.handicap ?? '');
    if (hcp === null) return;
    try {
      const state = await api.put(`/api/rounds/${this.state.round.id}/members/${memberId}`, { playingHandicap: hcp });
      this.state = state;
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  copy(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => _toast('Copied', 'success')).catch(() => prompt('Copy this link', text));
  },

  async copyText() {
    try {
      const text = await api.get(`/api/rounds/${this.state.round.id}/results.txt`);
      this.copy(typeof text === 'string' ? text : JSON.stringify(text));
    } catch (err) { _toast(err.message, 'error'); }
  },

  async downloadCsv(e) {
    e.preventDefault();
    const token = api.getToken();
    const res = await fetch(`/api/rounds/${this.state.round.id}/results.csv`, {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'goldendale-round.csv';
    a.click();
    URL.revokeObjectURL(url);
  },
};

window.scorecard = scorecard;
