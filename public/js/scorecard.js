function svcApi(method) {
  const args = Array.prototype.slice.call(arguments, 1);
  const client = (typeof window !== 'undefined' && typeof window.apiClient === 'function')
    ? window.apiClient()
    : ((typeof window !== 'undefined' && window.api) || (typeof api === 'object' ? api : {}) || {});
  if (client && typeof client[method] === 'function') return client[method].apply(client, args);
  if (typeof window !== 'undefined' && typeof window.callApi === 'function') {
    return window.callApi.apply(null, arguments);
  }
  if (method === 'updateBadge' || method === 'flushInBackground') return;
  if (method === 'getToken') {
    try { return localStorage.getItem('goldendale_scorecard_token'); } catch { return null; }
  }
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = localStorage.getItem('goldendale_scorecard_token');
    if (token) headers.Authorization = 'Bearer ' + token;
  } catch { /* ignore */ }
  const http = method === 'put' ? 'PUT' : (method === 'get' || method === 'getLive') ? 'GET' : 'POST';
  const init = { method: http, headers };
  if (http !== 'GET') init.body = JSON.stringify(args[1] || {});
  return fetch(args[0], init).then(async (res) => {
    if (res.status === 304) return { notModified: true };
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || ('HTTP ' + res.status));
    return data;
  });
}

const scorecard = {
  state: null,
  pollTimer: null,
  overlay: null,
  screen: 'play',
  cardMode: null,
  currentHole: 1,
  expandedHole: null,
  focusCell: null,
  writeError: '',
  addPlayerOpen: false,
  addPlayerDraft: { name: '', handicap: '', teamName: 'Team 1' },
  addPlayerSuppressUntil: 0,
  _preserveAddDraft: false,
  stepperOpen: false,
  _oneTimer: null,
  CACHE_PREFIX: 'goldendale_last_round_',
  ASSET_V: '20260826o',

  stopPoll() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  isNarrow() {
    return window.matchMedia('(max-width: 600px)').matches;
  },

  isHoleView() {
    if (this.screen !== 'play') return false;
    if (this.cardMode === 'full') return false;
    if (this.cardMode === 'hole') return true;
    return this.isNarrow();
  },

  cacheKey(id) {
    return this.CACHE_PREFIX + id;
  },

  readCache(id) {
    try {
      return JSON.parse(localStorage.getItem(this.cacheKey(id)) || 'null');
    } catch {
      return null;
    }
  },

  writeCache(id, state) {
    try {
      localStorage.setItem(this.cacheKey(id), JSON.stringify(state));
    } catch {
      /* quota */
    }
  },

  async renderRound(id, screen) {
    this.screen = screen === 'settings' || screen === 'results' || screen === 'dashboard'
      || screen === 'rules' || screen === 'nineteenth'
      ? (screen === 'dashboard' ? 'results' : screen)
      : 'play';
    this.stopPoll();
    const incoming = Number(id);
    const sameRound = this.state && this.state.round && Number(this.state.round.id) === incoming;
    if (!sameRound) {
      this.addPlayerOpen = false;
      this.addPlayerDraft = { name: '', handicap: '', teamName: 'Team 1' };
    }
    const container = document.getElementById('app');
    const cached = this.readCache(id);
    if (cached) {
      this.state = cached;
      this.currentHole = this.pickCurrentHole(cached);
      if (!this.shouldHoldAddPlayer()) this.draw(cached);
    } else {
      container.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Loading scorecard...</div>';
    }
    try {
      const state = await svcApi('get', '/api/rounds/' + id);
      this.state = state;
      this.writeCache(id, state);
      this.currentHole = this.pickCurrentHole(state);
      if (!this.shouldHoldAddPlayer()) this.draw(state);
      this.pollTimer = setInterval(() => this.refresh(id), 5000);
    } catch (err) {
      if (!cached) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${_esc(err.message)}</p></div>`;
      }
    }
  },

  pickCurrentHole(state) {
    const holes = state.holes || [];
    if (!holes.length) return 1;
    if (holes.some((h) => h.hole_number === this.currentHole)) return this.currentHole;
    const roster = this.visibleHoleMembers(state);
    const pool = roster.length ? roster : (state.members || []);
    for (const hole of holes) {
      const missing = pool.some((m) => {
        const hs = (m.holes || []).find((x) => x.holeNumber === hole.hole_number);
        return !hs || hs.gross == null;
      });
      if (missing) return hole.hole_number;
    }
    return holes[holes.length - 1].hole_number;
  },

  refresh(id) {
    svcApi('flushInBackground');
    this.refreshLive(id);
  },

  async refreshLive(id) {
    try {
      const patch = await svcApi('getLive', '/api/rounds/' + id + '/live', this.state && this.state.updatedAt);
      if (!patch || patch.notModified) return;
      if (this.state && patch.updatedAt && patch.updatedAt === this.state.updatedAt) return;
      if (this.rosterChanged(patch)) {
        if (this.shouldHoldAddPlayer()) return;
        const full = await svcApi('get', '/api/rounds/' + id);
        this.state = full;
        this.writeCache(id, full);
        this.draw(full);
        return;
      }
      this.applyLivePatch(patch);
      this.writeCache(id, this.state);
      if (this.shouldHoldAddPlayer()) return;
      this.patchUI();
    } catch {
      /* keep current view while offline */
    }
  },

  rosterChanged(patch) {
    const next = patch.memberTotals || [];
    const cur = (this.state && this.state.members) || [];
    if (next.length !== cur.length) return true;
    return next.some((t) => !cur.some((m) => m.id === t.id));
  },

  applyLivePatch(patch) {
    if (!this.state) return;
    this.state.updatedAt = patch.updatedAt;
    if (patch.status) this.state.round.status = patch.status;
    this.state.winner = patch.winner;
    const scored = new Set((patch.scores || []).map((s) => s.memberId + ':' + s.holeNumber));
    for (const member of this.state.members || []) {
      for (const hole of member.holes || []) {
        if (hole.gross != null && !scored.has(member.id + ':' + hole.holeNumber)) {
          hole.gross = null;
          hole.net = null;
        }
      }
    }
    for (const score of patch.scores || []) {
      this.writeMemberHole(score.memberId, score.holeNumber, score.gross, score.net, score.strokes);
    }
    for (const tot of patch.memberTotals || []) {
      const member = this.state.members.find((m) => m.id === tot.id);
      if (!member) continue;
      member.outGross = tot.outGross;
      member.inGross = tot.inGross;
      member.totalGross = tot.totalGross;
      member.outNet = tot.outNet;
      member.inNet = tot.inNet;
      member.totalNet = tot.totalNet;
      member.playing_handicap = tot.playing_handicap;
      member.team_id = tot.team_id;
    }
    if (patch.teams) {
      this.state.teams = (this.state.teams || []).map((t) => {
        const next = patch.teams.find((x) => x.id === t.id);
        return next ? { ...t, ...next } : t;
      });
      for (const team of patch.teams) {
        if (!(this.state.teams || []).some((t) => t.id === team.id)) this.state.teams.push(team);
      }
    }
    if (patch.matches && this.state.matches) {
      this.state.matches = this.state.matches.map((m) => {
        const next = patch.matches.find((x) => x.id === m.id);
        return next ? { ...m, resultText: next.resultText, score: next.score } : m;
      });
    }
    if (patch.sideGames) this.state.sideGames = { ...(this.state.sideGames || {}), ...patch.sideGames };
  },

  writeMemberHole(memberId, holeNumber, gross, net, strokes) {
    const member = (this.state.members || []).find((m) => m.id === memberId);
    if (!member) return null;
    const hole = (member.holes || []).find((h) => h.holeNumber === holeNumber);
    if (!hole) return null;
    hole.gross = gross;
    if (strokes != null) hole.strokes = strokes;
    hole.net = gross == null ? null : (net != null ? net : gross - (hole.strokes || 0));
    return hole;
  },

  applyLocalScore(memberId, holeNumber, gross) {
    if (!this.state) return;
    this.writeMemberHole(memberId, holeNumber, gross, null, null);
    const member = this.state.members.find((m) => m.id === memberId);
    if (member) this.recomputePlayerTotals(member);
    this.paintScoreCell(memberId, holeNumber);
    this.paintPlayerTotals(memberId);
  },

  recomputePlayerTotals(member) {
    const holes = member.holes || [];
    const sum = (arr, key) => {
      const vals = arr.filter((h) => h[key] != null);
      return vals.length ? vals.reduce((s, h) => s + h[key], 0) : null;
    };
    const outHoles = holes.filter((h) => h.holeNumber <= 9);
    const inHoles = holes.filter((h) => h.holeNumber >= 10);
    member.outGross = sum(outHoles, 'gross');
    member.inGross = sum(inHoles, 'gross');
    member.totalGross = sum(holes, 'gross');
    member.outNet = sum(outHoles, 'net');
    member.inNet = sum(inHoles, 'net');
    member.totalNet = sum(holes, 'net');
  },

  showWriteError(message) {
    this.writeError = message || '';
    const el = document.getElementById('write-error');
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
  },

  writeErrorBanner() {
    return `<div class="write-error" id="write-error" ${this.writeError ? '' : 'hidden'}>${_esc(this.writeError)}</div>`;
  },

  playerComplete(member, holes) {
    return (holes || []).every((h) => {
      const hs = (member.holes || []).find((x) => x.holeNumber === h.hole_number);
      return hs && hs.gross != null;
    });
  },

  groupHasEighteen(state) {
    const holes = state.holes || [];
    const members = state.members || [];
    if (!holes.length || !members.length) return false;
    const holeHasScore = (h) => members.some((m) => {
      const hs = (m.holes || []).find((x) => x.holeNumber === h.hole_number);
      return hs && hs.gross != null;
    });
    return holes.every(holeHasScore) || members.some((m) => this.playerComplete(m, holes));
  },

  eighteenBanner(state) {
    if (!this.groupHasEighteen(state)) return '';
    return `
      <div class="eighteen-done" id="eighteen-done">
        <p><strong>18 holes are in.</strong> Confirm the card and go to the 19th hole.</p>
        <button type="button" class="btn btn-accent" onclick="scorecard.showScreen('nineteenth')">Go to the 19th hole</button>
        <button type="button" class="btn btn-secondary" onclick="scorecard.showScreen('results')">Round results</button>
      </div>`;
  },

  isTeamRaceOn(state) {
    const r = (state && state.round) || {};
    if (r.teamRace === false || r.team_race === 0 || r.team_race === false) return false;
    return true;
  },

  afterHoleScored(state, holeNumber) {
    return ((state && state.members) || []).some((m) =>
      (m.holes || []).some((h) => h.holeNumber === holeNumber && h.gross != null)
    );
  },

  showOut(state) {
    return this.afterHoleScored(state, 9);
  },

  showIn(state) {
    return this.afterHoleScored(state, 18);
  },

  infoTip(key, text) {
    return `<button type="button" class="info-tip" data-info="${key}" aria-expanded="false" aria-label="Help">ℹ</button><span class="info-pop" id="info-${key}" hidden>${_esc(text)}</span>`;
  },

  bindInfoTips() {
    document.querySelectorAll('.info-tip').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pop = document.getElementById('info-' + btn.getAttribute('data-info'));
        if (!pop) return;
        const open = pop.hidden;
        document.querySelectorAll('.info-pop').forEach((el) => { el.hidden = true; });
        document.querySelectorAll('.info-tip').forEach((el) => el.setAttribute('aria-expanded', 'false'));
        pop.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  },

  visibleHoleMembers(state) {
    return this.groupedMembers(state)
      .filter((g) => g.team)
      .flatMap((g) => g.members || []);
  },

  addPlayerPanel(state) {
    if (!this.isOrganizer(state)) return '';
    return `<div id="add-player-panel" class="add-player-panel">${this.addPlayerPanelInner(state)}</div>`;
  },

  addPlayerPanelInner(state) {
    const count = (state.members || []).length;
    if (count >= 2 && !this.addPlayerOpen) {
      return `<button type="button" class="btn btn-accent add-player-toggle" id="add-player-toggle">Add player</button>`;
    }
    const draft = this.addPlayerDraft || { name: '', handicap: '', teamName: 'Team 1' };
    const teamName = draft.teamName || 'Team 1';
    return `
      <div class="card add-player-card" id="add-player-card">
        <h3 class="card-title">Add a player ${this.infoTip('add-player', 'Name, handicap index, and an explicit team. Strokes follow the rounded index on the scorecard SI. Auto-balance is only a helper.')}</h3>
        <p class="card-subtitle">Name, HCP, then Team 1 / Team 2 / Team 3. Auto-balance is only a helper.</p>
        <form class="add-guest-row add-player-form" id="live-add-player-form">
          <label class="add-field">
            <span>Name</span>
            <input class="form-input" id="live-add-guest-name" name="name" placeholder="Name" autocomplete="name" required value="${_esc(draft.name || '')}">
          </label>
          <label class="add-field">
            <span>HCP</span>
            <input class="form-input" id="live-add-guest-hcp" name="handicap" placeholder="HCP" inputmode="decimal" value="${_esc(draft.handicap || '')}">
          </label>
          <div class="add-field add-team-field">
            <span>Team</span>
            ${this.addTeamChipsHtml(teamName)}
          </div>
          <button class="btn btn-accent" type="submit" id="live-add-player-save">Save player</button>
        </form>
        ${count >= 2 ? '<button type="button" class="btn btn-secondary" id="add-player-done">Done adding</button>' : ''}
      </div>`;
  },

  addTeamChipsHtml(selected) {
    const current = selected || 'Team 1';
    return `<div class="add-team-picks" role="group" aria-label="Team">
      ${['Team 1', 'Team 2', 'Team 3'].map((n) => `<button type="button" class="add-team-chip${current === n ? ' is-on' : ''}" data-team-name="${n}">${n}</button>`).join('')}
      <input type="hidden" id="live-add-guest-team" value="${_esc(current)}">
    </div>`;
  },

  snapshotAddPlayer() {
    const name = document.getElementById('live-add-guest-name');
    const hcp = document.getElementById('live-add-guest-hcp');
    const team = document.getElementById('live-add-guest-team');
    if (!name && !hcp && !team) return;
    const prev = this.addPlayerDraft || { name: '', handicap: '', teamName: 'Team 1' };
    this.addPlayerDraft = {
      name: name ? name.value : prev.name,
      handicap: hcp ? hcp.value : prev.handicap,
      teamName: team ? team.value : (prev.teamName || 'Team 1'),
    };
  },

  shouldHoldAddPlayer() {
    if (this.addPlayerSuppressUntil && Date.now() < this.addPlayerSuppressUntil) return true;
    if (this.addPlayerOpen) return true;
    const card = document.getElementById('add-player-card');
    if (card && card.contains(document.activeElement)) return true;
    const name = document.getElementById('live-add-guest-name');
    return !!(name && String(name.value || '').trim());
  },

  pickAddTeam(teamName) {
    const name = teamName || 'Team 1';
    if (!this.addPlayerDraft) this.addPlayerDraft = { name: '', handicap: '', teamName: name };
    this.addPlayerDraft.teamName = name;
    const hidden = document.getElementById('live-add-guest-team');
    if (hidden) hidden.value = name;
    document.querySelectorAll('#add-player-panel .add-team-chip').forEach((btn) => {
      btn.classList.toggle('is-on', btn.getAttribute('data-team-name') === name);
    });
  },

  mountAddPlayerPanel() {
    const mount = document.getElementById('add-player-panel');
    if (!mount || !this.state) return;
    mount.innerHTML = this.addPlayerPanelInner(this.state);
    this.bindAddPlayerPanel();
    this.syncAddPlayerChrome();
  },

  openAddPlayer(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    this.addPlayerOpen = true;
    this.addPlayerSuppressUntil = Date.now() + 450;
    this.mountAddPlayerPanel();
    const name = document.getElementById('live-add-guest-name');
    if (name) name.focus();
  },

  closeAddPlayer() {
    this.snapshotAddPlayer();
    this.addPlayerOpen = false;
    this.addPlayerSuppressUntil = 0;
    this.mountAddPlayerPanel();
    this.syncAddPlayerChrome();
    if (this.isHoleView()) this.renderHoleNav();
  },

  bindAddPlayerPanel() {
    const toggle = document.getElementById('add-player-toggle');
    if (toggle) {
      toggle.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openAddPlayer(e);
      };
    }
    const form = document.getElementById('live-add-player-form');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.addGuestFromForm('live');
      };
    }
    document.querySelectorAll('#add-player-panel .add-team-chip').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.pickAddTeam(btn.getAttribute('data-team-name'));
      };
    });
    const done = document.getElementById('add-player-done');
    if (done) {
      done.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeAddPlayer();
      };
    }
    ['live-add-guest-name', 'live-add-guest-hcp'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => this.snapshotAddPlayer());
    });
    this.bindAddPlayerGuards();
  },

  bindAddPlayerGuards() {
    const appEl = document.getElementById('app');
    if (!appEl || appEl.dataset.addGuard === '1') return;
    appEl.dataset.addGuard = '1';
    const block = (e) => {
      if (!this.shouldHoldAddPlayer()) return;
      const t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('#add-player-panel, #add-player-card, .add-player-toggle')) return;
      if (t.closest('.score-input, [data-score-cell], #hole-nav, .press-live')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    appEl.addEventListener('pointerdown', block, true);
    appEl.addEventListener('click', block, true);
  },

  bindHoleBack() {
    const back = document.getElementById('hole-back');
    if (!back) return;
    back.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof app !== 'undefined' && app.navigate) app.navigate('#dashboard');
    };
  },

  syncAddPlayerChrome() {
    const view = document.getElementById('hole-view');
    const holding = this.shouldHoldAddPlayer();
    if (view) view.classList.toggle('add-player-open', holding);
    const nav = document.getElementById('hole-nav');
    if (nav && this.isHoleView()) {
      if (holding) nav.hidden = true;
      else if (!this.stepperOpen) nav.hidden = false;
    }
  },

  ensureVsPar() {
    if (window.vsPar && typeof window.vsPar.formatVsPar === 'function') return;
    if (document.querySelector('script[data-vspar-loader]')) return;
    const script = document.createElement('script');
    script.src = 'js/vsPar.js?v=' + this.ASSET_V;
    script.dataset.vsparLoader = '1';
    script.onload = () => {
      if (this.state && this.isHoleView()) {
        for (const team of this.state.teams || []) this.paintTeamVsPar(team);
      }
    };
    document.head.appendChild(script);
  },

  ballsCountedText(state, memberId) {
    let g = 0;
    let n = 0;
    for (const team of state.teams || []) {
      for (const hole of team.holes || []) {
        for (const ball of hole.balls || []) {
          if (Number(ball.playerId) === Number(memberId)) {
            if (ball.type === 'gross') g += 1;
            else n += 1;
          }
        }
      }
    }
    const bits = [];
    if (g) bits.push(g + 'G');
    if (n) bits.push(n + 'N');
    return bits.join(' · ') || '—';
  },

  teamNameFor(state, member) {
    const team = (state.teams || []).find((t) => t.id === member.team_id);
    return team ? team.name : '—';
  },

  commitScore(memberId, holeNumber, gross) {
    if (!this.state) return;
    this.showWriteError('');
    this.applyLocalScore(memberId, holeNumber, gross);
    const roundId = this.state.round.id;
    svcApi('postScore', `/api/rounds/${roundId}/scores`, { memberId, holeNumber, gross })
      .then((slim) => {
        if (!slim || slim.ok !== true) {
          this.showWriteError('Score did not save. Totals on the card may be incomplete.');
          return;
        }
        this.applySlimPost(slim);
        this.paintPlayerTotals(memberId);
        this.paintRaceStrip();
        this.paintEndTotals();
        this.writeCache(roundId, this.state);
      })
      .catch((err) => {
        if (err.offline) {
          this.showWriteError('Saved on this phone. Will sync when you are back online.');
        } else {
          this.showWriteError('Score did not save: ' + err.message);
        }
      });
  },

  onScoreInput(e) {
    if (this.shouldHoldAddPlayer()) return;
    const input = e.target;
    const raw = String(input.value || '').replace(/\D/g, '').slice(0, 2);
    input.value = raw;
    if (raw === '') return;
    const n = Number(raw);
    if (this._oneTimer) {
      clearTimeout(this._oneTimer);
      this._oneTimer = null;
    }
    if (n >= 2 && n <= 9) {
      this.commitTyped(input, n, true);
    } else if (n >= 10 && n <= 15) {
      this.commitTyped(input, n, true);
    } else if (n > 15) {
      this.showWriteError('Gross must be 1–15.');
      input.value = '';
    } else if (n === 1) {
      this._oneTimer = setTimeout(() => {
        if (input.value === '1') this.commitTyped(input, 1, true);
      }, 450);
    }
  },

  onScoreBlur(e) {
    if (this.shouldHoldAddPlayer()) return;
    const input = e.target;
    if (this._oneTimer) {
      clearTimeout(this._oneTimer);
      this._oneTimer = null;
    }
    const raw = String(input.value || '').trim();
    if (raw === '') {
      const member = this.state && this.state.members.find((m) => m.id === Number(input.dataset.member));
      const hs = member && (member.holes || []).find((h) => h.holeNumber === Number(input.dataset.hole));
      if (hs && hs.gross != null) this.commitTyped(input, null, false);
      return;
    }
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= 15) {
      if (!input.dataset.committed || Number(input.dataset.committed) !== n) {
        this.commitTyped(input, n, false);
      }
    } else {
      this.showWriteError('Gross must be 1–15.');
    }
  },

  onScoreKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.onScoreBlur(e);
      this.focusNextHole(Number(e.target.dataset.member), Number(e.target.dataset.hole));
    }
  },

  commitTyped(input, gross, advance) {
    const memberId = Number(input.dataset.member);
    const holeNumber = Number(input.dataset.hole);
    input.dataset.committed = gross == null ? '' : String(gross);
    this.focusCell = { memberId, holeNumber };
    this.currentHole = holeNumber;
    this.commitScore(memberId, holeNumber, gross);
    this.paintCurrentHoleChrome();
    if (advance) this.focusNextHole(memberId, holeNumber);
  },

  focusNextHole(memberId, holeNumber) {
    if (this.isHoleView()) {
      const rows = Array.from(document.querySelectorAll('#hole-players .hole-player-row'));
      const idx = rows.findIndex((row) => Number(row.dataset.memberRow) === memberId);
      const next = rows[idx + 1];
      if (!next) return;
      const el = next.querySelector(`input.score-input[data-hole="${holeNumber}"]`);
      if (el) {
        el.focus();
        el.select();
      }
      return;
    }
    const holes = (this.state && this.state.holes) || [];
    const idx = holes.findIndex((h) => h.hole_number === holeNumber);
    const next = holes[idx + 1];
    if (!next) return;
    this.currentHole = next.hole_number;
    this.paintCurrentHoleChrome();
    const el = document.querySelector(`input.score-input[data-member="${memberId}"][data-hole="${next.hole_number}"]`);
    if (el) {
      el.focus();
      el.select();
    }
  },

  paintCurrentHoleChrome() {
    const n = this.currentHole;
    document.querySelectorAll('.team-scorecard thead th[data-hole-h]').forEach((th) => {
      th.classList.toggle('is-current-hole', Number(th.dataset.holeH) === n);
    });
    const label = document.getElementById('hole-number');
    if (label) label.textContent = 'Hole ' + n;
    const nav = document.querySelector('.hole-nav-label');
    if (nav) nav.textContent = 'Hole ' + n;
    const meta = document.getElementById('hole-meta');
    const hole = this.holeMeta(this.state, n);
    if (meta) meta.textContent = `Par ${hole.par ?? '—'} · SI ${hole.stroke_index ?? '—'}`;
    this.paintTeamHole(n);
    this.paintBallLine(n);
    this.paintRaceStrip();
  },

  bindScoreInputs() {
    document.querySelectorAll('input.score-input[data-member]').forEach((input) => {
      if (input.dataset.bound) return;
      input.dataset.bound = '1';
      input.addEventListener('input', (e) => this.onScoreInput(e));
      input.addEventListener('blur', (e) => this.onScoreBlur(e));
      input.addEventListener('keydown', (e) => this.onScoreKey(e));
      input.addEventListener('focus', (e) => {
        if (this.shouldHoldAddPlayer()) {
          e.target.blur();
          return;
        }
        this.focusCell = {
          memberId: Number(e.target.dataset.member),
          holeNumber: Number(e.target.dataset.hole),
        };
        this.currentHole = this.focusCell.holeNumber;
        this.paintCurrentHoleChrome();
      });
      input.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.openEditorFromInput(input);
      });
    });
  },

  openEditorFromInput(input) {
    const memberId = Number(input.dataset.member);
    const holeNumber = Number(input.dataset.hole);
    const member = this.state.members.find((m) => m.id === memberId);
    const hole = this.holeMeta(this.state, holeNumber);
    const hs = member && (member.holes || []).find((h) => h.holeNumber === holeNumber);
    this.openEditor(this.state.round.id, memberId, holeNumber, member.display_name, hs?.gross ?? null, hole.par);
  },

  openStepperFallback() {
    if (this.shouldHoldAddPlayer()) return;
    if (!this.state) return;
    const focus = this.focusCell || {
      memberId: this.state.members[0] && this.state.members[0].id,
      holeNumber: this.currentHole,
    };
    const member = this.state.members.find((m) => m.id === focus.memberId) || this.state.members[0];
    if (!member) return;
    const hole = this.holeMeta(this.state, focus.holeNumber || this.currentHole);
    const hs = (member.holes || []).find((h) => h.holeNumber === (focus.holeNumber || this.currentHole));
    this.openEditor(this.state.round.id, member.id, focus.holeNumber || this.currentHole, member.display_name, hs?.gross ?? null, hole.par);
  },

  applySlimPost(slim) {
    if (!slim || !this.state) return;
    if (slim.updatedAt) this.state.updatedAt = slim.updatedAt;
    for (const row of slim.teams || []) {
      const team = (this.state.teams || []).find((t) => t.id === row.id);
      if (!team) continue;
      if (row.total != null) team.total = row.total;
      if (row.hole && team.holes) {
        const idx = team.holes.findIndex((h) => h.holeNumber === row.hole.holeNumber);
        if (idx >= 0) team.holes[idx] = { ...team.holes[idx], ...row.hole };
      }
    }
    if (slim.sideGames) this.state.sideGames = { ...(this.state.sideGames || {}), ...slim.sideGames };
    this.paintTeamHole(slim.holeNumber);
    this.paintRaceStrip();
    this.paintBallLine(slim.holeNumber);
    this.paintEndTotals();
    this.paintPlayerTotals();
    this.ensureEighteenBanner();
  },

  ensureEighteenBanner() {
    if (!this.state || this.screen !== 'play') return;
    if (!this.groupHasEighteen(this.state)) return;
    if (document.getElementById('eighteen-done')) return;
    const bar = document.querySelector('.round-toolbar');
    if (!bar) return;
    bar.insertAdjacentHTML('afterend', this.eighteenBanner(this.state));
  },

  isOrganizer(state) {
    const user = auth.currentUser;
    if (!user) return false;
    if (state.round.organizer_id === user.id) return true;
    return (state.members || []).some((m) => m.player_id === user.id && m.role === 'organizer');
  },

  draw(state) {
    if (!this._preserveAddDraft) this.snapshotAddPlayer();
    this._preserveAddDraft = false;
    if (this.screen === 'settings') {
      this.drawSettings(state);
      this.bindInfoTips();
      return;
    }
    if (this.screen === 'results') {
      this.drawResults(state);
      this.bindInfoTips();
      return;
    }
    if (this.screen === 'rules') {
      this.drawGameRules(state);
      this.bindInfoTips();
      return;
    }
    if (this.screen === 'nineteenth') {
      this.drawNineteenth(state);
      this.bindInfoTips();
      return;
    }
    if (this.isHoleView()) this.drawHoleView(state);
    else this.drawFullCard(state);
    this.bindOverlay();
    this.bindScoreInputs();
    this.bindAddPlayerPanel();
    this.bindHoleBack();
    this.syncAddPlayerChrome();
    this.bindInfoTips();
    svcApi('updateBadge');
  },

  toolbar(state, extra) {
    const r = state.round;
    const organizer = this.isOrganizer(state);
    return `
      <div class="round-toolbar">
        <a href="#dashboard" onclick="event.preventDefault();app.navigate('#dashboard')">&larr; Rounds</a>
        <span class="badge badge-${_esc(r.status)}" data-status-badge>${_esc(r.status)}</span>
        <span class="unsynced-inline" id="unsynced-inline"></span>
        ${extra || ''}
        <button type="button" class="btn btn-sm btn-accent" onclick="scorecard.showScreen('results')">See dashboard</button>
        <button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.showScreen('rules')">Game Rules</button>
        ${organizer ? '<button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.showScreen(\'settings\')">Settings</button>' : ''}
      </div>`;
  },

  showScreen(screen) {
    const id = this.state && this.state.round && this.state.round.id;
    if (!id) return;
    if (screen === 'settings' || screen === 'results' || screen === 'dashboard'
      || screen === 'rules' || screen === 'nineteenth') {
      const path = screen === 'results' ? 'dashboard' : screen;
      app.navigate('#round/' + id + '/' + path);
      return;
    }
    app.navigate('#round/' + id);
  },

  setCardMode(mode) {
    this.cardMode = mode;
    if (this.state) this.draw(this.state);
  },

  holeMeta(state, holeNumber) {
    return (state.holes || []).find((h) => h.hole_number === holeNumber) || {};
  },

  ballFirstName(ball) {
    return String((ball && ball.name) || '?').split(/\s+/)[0] || '?';
  },

  teamBallsText(team, holeNumber) {
    const hole = (team.holes || []).find((h) => h.holeNumber === holeNumber);
    return ((hole && hole.balls) || []).map((ball) => {
      const kind = ball.type === 'gross' ? 'G' : 'N';
      return `${this.ballFirstName(ball)} ${ball.score}${kind}`;
    }).join(' · ');
  },

  teamBallsHtml(team, holeNumber) {
    return `<div class="team-balls" data-team-balls="${team.id}">${_esc(this.teamBallsText(team, holeNumber))}</div>`;
  },

  latestScoredHole(state) {
    let latest = 0;
    for (const team of state.teams || []) {
      for (const hole of team.holes || []) {
        if (hole.total != null && hole.holeNumber > latest) latest = hole.holeNumber;
      }
    }
    if (latest) return latest;
    for (const member of state.members || []) {
      for (const hole of member.holes || []) {
        if (hole.gross != null && hole.holeNumber > latest) latest = hole.holeNumber;
      }
    }
    return latest || null;
  },

  ballLineText(state, holeNumber) {
    return (state.teams || []).map((team) => {
      const balls = this.teamBallsText(team, holeNumber);
      return balls ? `${team.name} ${balls}` : '';
    }).filter(Boolean).join(' · ');
  },

  fmtTeam(value) {
    if (value == null || value === '') return '—';
    const vp = window.vsPar;
    if (vp && typeof vp.formatVsPar === 'function') {
      return vp.formatVsPar(value) || '—';
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (n === 0) return 'E';
    return n > 0 ? '+' + n : String(n);
  },

  teamFormatLabel(round) {
    if (!round || round.format === 'match_play') return 'Match play';
    const tf = window.teamFormats;
    if (tf && typeof tf.formatLabel === 'function') {
      return tf.formatLabel(round.gross_balls ?? round.grossBalls, round.net_balls ?? round.netBalls);
    }
    return `${round.gross_balls ?? 1} gross + ${round.net_balls ?? 2} net vs par`;
  },

  teamFormatRule(round) {
    const tf = window.teamFormats;
    if (tf && typeof tf.formatRuleText === 'function') {
      return tf.formatRuleText(round.gross_balls ?? round.grossBalls, round.net_balls ?? round.netBalls);
    }
    return '';
  },

  currentGameKey(round) {
    const tf = window.teamFormats;
    if (tf && typeof tf.gameFromBalls === 'function') {
      return tf.gameFromBalls(round.gross_balls ?? round.grossBalls, round.net_balls ?? round.netBalls).key;
    }
    return '1G2N';
  },

  gameOptionsHtml(selectedKey) {
    const tf = window.teamFormats;
    const games = (tf && tf.TEAM_GAMES) || [];
    return games.map((game) =>
      `<option value="${game.key}" ${game.key === selectedKey ? 'selected' : ''}>${_esc(game.label)}</option>`
    ).join('');
  },

  changeGame(key) {
    const tf = window.teamFormats;
    const game = tf && typeof tf.gameFromKey === 'function' ? tf.gameFromKey(key) : { grossBalls: 1, netBalls: 2 };
    this.updateSettings({ grossBalls: game.grossBalls, netBalls: game.netBalls });
  },

  sideConfig(state) {
    return (state && state.sideGames && state.sideGames.config)
      || (state && state.round && state.round.sideGames)
      || {};
  },

  pressableGames(state) {
    const cfg = this.sideConfig(state);
    const defs = (window.sideGames && window.sideGames.SIDE_GAMES) || [];
    return defs.filter((g) => g.pressable && cfg[g.key] && cfg[g.key].on);
  },

  async confirmPress() {
    if (!this.state) return;
    const games = this.pressableGames(this.state);
    if (!games.length) {
      _toast('Turn on Vegas, Nassau, Wolf, or Nines to press.', 'error');
      return;
    }
    const hole = this.currentHole || 1;
    const fields = [
      {
        name: 'gameKey',
        label: 'Game',
        type: 'select',
        options: games.map((g) => ({ value: g.key, label: g.label })),
        value: games[0].key,
      },
      { name: 'dollars', label: '$ (blank = same as parent)', value: '' },
    ];
    if (games.some((g) => g.key === 'nassau')) {
      fields.push({
        name: 'segment',
        label: 'Nassau segment (ignored for other games)',
        type: 'select',
        options: [
          { value: hole <= 9 ? 'front' : 'back', label: hole <= 9 ? 'Front 9' : 'Back 9' },
          { value: 'overall', label: 'Overall 18' },
        ],
        value: hole <= 9 ? 'front' : 'back',
      });
    }
    const values = await _formPrompt({ title: 'Press from hole ' + hole + ' → 18', submitLabel: 'Press', fields });
    if (!values) return;
    const gameKey = values.gameKey || games[0].key;
    const segment = gameKey === 'nassau' ? (values.segment || (hole <= 9 ? 'front' : 'back')) : null;
    const endHole = gameKey === 'nassau' && segment === 'front' ? 9 : 18;
    try {
      const state = await svcApi('post', `/api/rounds/${this.state.round.id}/presses`, {
        gameKey,
        segment,
        startHole: hole,
        endHole,
        dollars: values.dollars === '' ? null : Number(values.dollars),
      });
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) {
      _toast(err.message, 'error');
    }
  },

  async setWolfPick(holeNumber, partnerId, lone) {
    if (!this.state) return;
    const wolf = this.wolfForHole(this.state, holeNumber);
    if (!wolf) return;
    try {
      const state = await svcApi('put', `/api/rounds/${this.state.round.id}/wolf/${holeNumber}`, {
        wolfMemberId: wolf.id,
        partnerMemberId: lone ? null : partnerId,
        lone: !!lone,
      });
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) {
      _toast(err.message, 'error');
    }
  },

  wolfForHole(state, holeNumber) {
    const members = [...(state.members || [])].sort((a, b) => a.id - b.id);
    if (!members.length) return null;
    return members[(Math.max(1, Number(holeNumber)) - 1) % members.length];
  },

  wolfBarHtml(state, holeNumber) {
    const cfg = this.sideConfig(state);
    if (!cfg.wolf || !cfg.wolf.on) return '';
    const wolf = this.wolfForHole(state, holeNumber);
    if (!wolf) return '';
    const pick = (state.wolfPicks || []).find((p) => Number(p.hole_number || p.holeNumber) === Number(holeNumber));
    const lone = pick ? !!(pick.lone || pick.lone_wolf) : false;
    const partnerId = pick && (pick.partner_member_id || pick.partnerMemberId);
    const others = (state.members || []).filter((m) => m.id !== wolf.id);
    return `<div class="wolf-bar" id="wolf-bar">
      <span>Wolf: ${_esc(wolf.display_name)} — pick a partner after they tee, or go lone for 2×</span>
      <label class="tiny-label"><input type="checkbox" ${lone ? 'checked' : ''} onchange="scorecard.setWolfPick(${holeNumber}, null, this.checked)"> Lone wolf 2×</label>
      ${!lone ? `<select class="form-input" onchange="scorecard.setWolfPick(${holeNumber}, Number(this.value), false)">
        <option value="">Partner</option>
        ${others.map((m) => `<option value="${m.id}" ${Number(partnerId) === m.id ? 'selected' : ''}>${_esc(m.display_name)}</option>`).join('')}
      </select>` : ''}
    </div>`;
  },

  sideGamesFieldsInner(cfg) {
    cfg = cfg || {};
    const skinsOn = !!(cfg.skins && cfg.skins.on);
    const vegasOn = !!(cfg.vegas && cfg.vegas.on);
    const nassauOn = !!(cfg.nassau && cfg.nassau.on);
    const wolfOn = !!(cfg.wolf && cfg.wolf.on);
    const ninesOn = !!(cfg.nines && cfg.nines.on);
    return `
      <p class="card-subtitle">Scores enter once. Every game here reads the same hole scores. Skins default off. ${this.infoTip('side-games', 'Turn on any mix. Team vs-par race is a separate setup toggle. Side games can run alone.')}</p>
      <label class="check-row"><input type="checkbox" name="skinsOn" ${skinsOn ? 'checked' : ''}> Skins</label>
      <p class="game-rule">${_esc((window.sideGames && window.sideGames.sideGameRule('skins')) || '')}</p>
      <div class="form-group"><label>Skins pot</label><input class="form-input" name="skinsPot" type="number" min="0" step="1" value="${cfg.skins && cfg.skins.pot != null ? cfg.skins.pot : 20}"></div>
      <label class="check-row"><input type="checkbox" name="vegasOn" ${vegasOn ? 'checked' : ''}> Vegas</label>
      <p class="game-rule">${_esc((window.sideGames && window.sideGames.sideGameRule('vegas')) || '')}</p>
      <div class="grid grid-2">
        <div class="form-group"><label>Vegas scoring</label><select class="form-input" name="vegasScoring"><option value="gross" ${cfg.vegas && cfg.vegas.scoring === 'net' ? '' : 'selected'}>Gross</option><option value="net" ${cfg.vegas && cfg.vegas.scoring === 'net' ? 'selected' : ''}>Net</option></select></div>
        <div class="form-group"><label>$ / point</label><input class="form-input" name="vegasDollars" type="number" min="0" step="0.5" value="${cfg.vegas && cfg.vegas.dollarsPerPoint != null ? cfg.vegas.dollarsPerPoint : 1}"></div>
      </div>
      <label class="check-row"><input type="checkbox" name="nassauOn" ${nassauOn ? 'checked' : ''}> Nassau</label>
      <p class="game-rule">${_esc((window.sideGames && window.sideGames.sideGameRule('nassau')) || '')}</p>
      <div class="grid grid-2">
        <div class="form-group"><label>Nassau scoring</label><select class="form-input" name="nassauScoring"><option value="net" ${cfg.nassau && cfg.nassau.scoring === 'gross' ? '' : 'selected'}>Net</option><option value="gross" ${cfg.nassau && cfg.nassau.scoring === 'gross' ? 'selected' : ''}>Gross</option></select></div>
        <div class="form-group"><label>Front $</label><input class="form-input" name="nassauFront" type="number" min="0" value="${cfg.nassau && cfg.nassau.front != null ? cfg.nassau.front : 2}"></div>
        <div class="form-group"><label>Back $</label><input class="form-input" name="nassauBack" type="number" min="0" value="${cfg.nassau && cfg.nassau.back != null ? cfg.nassau.back : 2}"></div>
        <div class="form-group"><label>Overall $</label><input class="form-input" name="nassauOverall" type="number" min="0" value="${cfg.nassau && cfg.nassau.overall != null ? cfg.nassau.overall : 2}"></div>
      </div>
      <label class="check-row"><input type="checkbox" name="wolfOn" ${wolfOn ? 'checked' : ''}> Wolf</label>
      <p class="game-rule">${_esc((window.sideGames && window.sideGames.sideGameRule('wolf')) || '')}</p>
      <div class="grid grid-2">
        <div class="form-group"><label>Wolf scoring</label><select class="form-input" name="wolfScoring"><option value="gross" ${cfg.wolf && cfg.wolf.scoring === 'net' ? '' : 'selected'}>Gross</option><option value="net" ${cfg.wolf && cfg.wolf.scoring === 'net' ? 'selected' : ''}>Net</option></select></div>
        <div class="form-group"><label>$ / point</label><input class="form-input" name="wolfDollars" type="number" min="0" step="0.5" value="${cfg.wolf && cfg.wolf.dollarsPerPoint != null ? cfg.wolf.dollarsPerPoint : 1}"></div>
      </div>
      <label class="check-row"><input type="checkbox" name="ninesOn" ${ninesOn ? 'checked' : ''}> Nines (3 players)</label>
      <p class="game-rule">${_esc((window.sideGames && window.sideGames.sideGameRule('nines')) || '')}</p>
      <label class="check-row"><input type="checkbox" name="ninesBlitz" ${!cfg.nines || cfg.nines.blitz !== false ? 'checked' : ''}> Blitz 9-0-0</label>
      <div class="grid grid-2">
        <div class="form-group"><label>Nines scoring</label><select class="form-input" name="ninesScoring"><option value="net" ${cfg.nines && cfg.nines.scoring === 'gross' ? '' : 'selected'}>Net</option><option value="gross" ${cfg.nines && cfg.nines.scoring === 'gross' ? 'selected' : ''}>Gross</option></select></div>
        <div class="form-group"><label>$ / point</label><input class="form-input" name="ninesDollars" type="number" min="0" step="0.5" value="${cfg.nines && cfg.nines.dollarsPerPoint != null ? cfg.nines.dollarsPerPoint : 1}"></div>
      </div>
      <label class="check-row"><input type="checkbox" name="birdieSlotsOn" ${!cfg.birdieSlots || cfg.birdieSlots.on !== false ? 'checked' : ''}> Birdie slots ${this.infoTip('slots', 'Fun layer, not money. Each gross birdie or better is one spin. More birdies = more spins. Running high score.')}</label>
      <label class="check-row"><input type="checkbox" name="kpsOn" ${cfg.kps && cfg.kps.on ? 'checked' : ''}> Closest-to-the-pin ${this.infoTip('kps', 'Optional. Default OFF. Pick KP holes, record a winner, see them on the 19th hole.')}</label>
      <div class="form-group"><label>KP holes (comma, e.g. 3, 8, 12, 16)</label>
        <input class="form-input" name="kpsHoles" value="${cfg.kps && cfg.kps.holes && cfg.kps.holes.length ? cfg.kps.holes.join(', ') : ''}">
      </div>`;
  },

  sideGamesSettingsHtml(state) {
    const cfg = this.sideConfig(state);
    return `<form class="card" id="side-games-settings" onsubmit="event.preventDefault();scorecard.saveSideGames()">
      <div class="card-title">Side games</div>
      ${this.sideGamesFieldsInner(cfg)}
      <button class="btn btn-secondary btn-sm" type="submit">Save side games</button>
    </form>`;
  },

  saveSideGames() {
    const form = document.getElementById('side-games-settings');
    if (!form) return;
    const fd = new FormData(form);
    this.updateSettings({ sideGames: this.readSideGamesForm(fd) });
  },

  readSideGamesForm(fd) {
    return {
      skins: { on: fd.get('skinsOn') === 'on', pot: Number(fd.get('skinsPot') || 0) },
      vegas: { on: fd.get('vegasOn') === 'on', scoring: fd.get('vegasScoring') || 'gross', dollarsPerPoint: Number(fd.get('vegasDollars') || 1) },
      nassau: {
        on: fd.get('nassauOn') === 'on',
        scoring: fd.get('nassauScoring') || 'net',
        front: Number(fd.get('nassauFront') || 0),
        back: Number(fd.get('nassauBack') || 0),
        overall: Number(fd.get('nassauOverall') || 0),
      },
      wolf: { on: fd.get('wolfOn') === 'on', scoring: fd.get('wolfScoring') || 'gross', dollarsPerPoint: Number(fd.get('wolfDollars') || 1) },
      nines: {
        on: fd.get('ninesOn') === 'on',
        scoring: fd.get('ninesScoring') || 'net',
        blitz: fd.get('ninesBlitz') === 'on',
        dollarsPerPoint: Number(fd.get('ninesDollars') || 1),
      },
      birdieSlots: { on: fd.get('birdieSlotsOn') === 'on' },
      kps: {
        on: fd.get('kpsOn') === 'on',
        holes: String(fd.get('kpsHoles') || '').split(/[\s,]+/).map(Number).filter((n) => n >= 1 && n <= 18),
        winners: (this.state && this.sideConfig(this.state).kps && this.sideConfig(this.state).kps.winners) || {},
      },
    };
  },

  sideGamesResultsHtml(state) {
    const side = state.sideGames;
    if (!side || !side.games) return '';
    const blocks = [];
    const g = side.games;
    const raceTeams = (state.teams || []).map((t) => `${t.name} ${this.fmtTeam(t.total)}`).join(' · ');
    if (this.isTeamRaceOn(state) && raceTeams) {
      blocks.push(`<div class="card"><h3 class="card-title">Team race</h3><p>${_esc(raceTeams)}</p></div>`);
    }
    if (g.skins) {
      const s = g.skins;
      const gross = (s.grossWinners || []).map((w) => `${w.name} ${w.count}`).join(', ') || 'none';
      const net = (s.netWinners || []).map((w) => `${w.name} ${w.count}`).join(', ') || 'none';
      blocks.push(`<div class="card"><h3 class="card-title">Skins</h3>
        <p>Pot ${s.pot} · ${s.skinCount} skins · ${s.valuePerSkin ? s.valuePerSkin.toFixed(2) : '0'} each</p>
        <p>Gross skins: ${_esc(gross)}</p>
        <p>Net skins: ${_esc(net)}</p></div>`);
    }
    if (g.vegas && g.vegas.teamA) {
      blocks.push(`<div class="card"><h3 class="card-title">Vegas</h3>
        <p>${_esc(g.vegas.teamA.name)} ${g.vegas.teamA.points} · ${_esc(g.vegas.teamB.name)} ${g.vegas.teamB.points}</p></div>`);
    }
    if (g.nassau && g.nassau.front) {
      blocks.push(`<div class="card"><h3 class="card-title">Nassau</h3>
        <p>Front ${ _esc(g.nassau.front.status) } · Back ${ _esc(g.nassau.back.status) } · 18 ${ _esc(g.nassau.overall.status) }</p>
        <p class="card-subtitle">Classic: each of F / B / O is its own wager.</p></div>`);
    }
    if (g.wolf) {
      const pts = (g.wolf.points || []).map((p) => `${p.name} ${p.points}`).join(' · ');
      blocks.push(`<div class="card"><h3 class="card-title">Wolf</h3><p>${_esc(pts || 'No holes decided')}</p></div>`);
    }
    if (g.nines) {
      const pts = (g.nines.points || []).map((p) => `${p.name} ${p.points}`).join(' · ');
      blocks.push(`<div class="card"><h3 class="card-title">Nines</h3><p>${_esc(g.nines.incomplete ? 'Need exactly 3 players' : pts)}</p></div>`);
    }
    if (g.birdieSlots && g.birdieSlots.on) {
      const lead = g.birdieSlots.leader;
      blocks.push(`<div class="card"><h3 class="card-title">Birdie slots</h3><p>${_esc(lead ? lead.name + ' ' + lead.points + ' pts · ' + g.birdieSlots.spins + ' spins' : 'No birdies yet')}</p></div>`);
    }
    if (side.stripText) {
      blocks.push(`<div class="card"><h3 class="card-title">All games</h3><p>${_esc(side.stripText)}</p></div>`);
    }
    if (!blocks.length) return '';
    return `<h3 class="section-title">Side games</h3>${blocks.join('')}`;
  },

  raceStripText(state) {
    const extra = state.sideGames && state.sideGames.stripText;
    if (!this.isTeamRaceOn(state)) return extra || '';
    const teams = state.teams || [];
    if (!teams.length) return extra || '';
    const completed = state.round.status === 'completed';
    const leader = state.winner || teams.find((t) => t.total != null) || teams[0];
    if (completed && leader) return `${leader.name} wins · ${this.fmtTeam(leader.total)}`;
    const teamBits = teams.map((t) => {
      let bit = `${t.name} ${t.total == null ? '—' : this.fmtTeam(t.total)}`;
      if (leader && leader.total != null && t.total != null && t.id !== leader.id) {
        bit += ` (${this.fmtTeam(t.total - leader.total)})`;
      }
      return bit;
    }).join(' · ');
    return extra ? teamBits + ' · ' + extra : teamBits;
  },

  holePlayerRowHtml(state, member, holeNumber) {
    const hole = this.holeMeta(state, holeNumber);
    const hs = (member.holes || []).find((x) => x.holeNumber === holeNumber);
    const cls = this.cellClassList(hs, hole.par);
    return `<div class="hole-player-row" data-member-row="${member.id}">
      <span class="hole-player-name">${_esc(member.display_name)}</span>
      <div class="hole-player-score ${cls}" data-score-cell="${member.id}:${holeNumber}">
        <div class="gross-box">
          <input class="score-input" inputmode="numeric" pattern="[0-9]*" min="1" max="15" maxlength="2"
            data-member="${member.id}" data-hole="${holeNumber}"
            data-committed="${hs?.gross ?? ''}"
            value="${hs?.gross ?? ''}" aria-label="${_esc(member.display_name)} hole ${holeNumber}">
          ${this.strokeDotsHtml(hs?.strokes)}
        </div>
        ${hs?.gross != null ? `<span class="net-mini">${hs.net}</span>` : ''}
      </div>
      ${this.playerNineLineHtml(state, member)}
    </div>`;
  },

  playerNineLineHtml(state, member) {
    const bits = [];
    if (this.showOut(state) && member.outGross != null) bits.push(`OUT ${member.outGross}/${member.outNet ?? '—'}`);
    if (this.showIn(state) && member.inGross != null) bits.push(`IN ${member.inGross}/${member.inNet ?? '—'}`);
    if (this.showIn(state) && member.totalGross != null) bits.push(`TOT ${member.totalGross}/${member.totalNet ?? '—'}`);
    return bits.length ? `<div class="nine-line">${bits.join(' · ')}</div>` : '';
  },

  holePlayersHtml(state, holeNumber) {
    const groups = this.groupedMembers(state).filter((group) => group.team && (group.members || []).length);
    return `<div class="hole-players" id="hole-players">${groups.map((group) => {
      const rows = group.members.map((member) => this.holePlayerRowHtml(state, member, holeNumber)).join('');
      const teamHtml = this.isTeamRaceOn(state) ? this.oneHoleTeamTotal(state, group.team, holeNumber) : '';
      return `<section class="hole-team-group" data-team-group="${group.team.id}">${rows}${teamHtml}</section>`;
    }).join('')}</div>`;
  },

  holeToolbar(state) {
    const organizer = this.isOrganizer(state);
    return `
      <div class="round-toolbar hole-toolbar" id="hole-toolbar">
        <button type="button" class="hole-back" id="hole-back">Back</button>
        <span class="unsynced-inline" id="unsynced-inline"></span>
        <button type="button" class="btn btn-sm btn-secondary hole-overflow" id="hole-overflow" aria-label="More" aria-haspopup="true" aria-expanded="false" onclick="scorecard.toggleHoleOverflow(event)">⋯</button>
        <div class="hole-overflow-menu" id="hole-overflow-menu" hidden>
          <button type="button" onclick="scorecard.setCardMode('full')">Full card</button>
          ${this.pressableGames(state).length ? '<button type="button" onclick="scorecard.confirmPress()">Press</button>' : ''}
          <button type="button" onclick="scorecard.showScreen('rules')">Game Rules</button>
          ${organizer ? '<button type="button" onclick="scorecard.showScreen(\'settings\')">Settings</button>' : ''}
        </div>
      </div>`;
  },

  toggleHoleOverflow(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('hole-overflow-menu');
    const btn = document.getElementById('hole-overflow');
    if (!menu || !btn) return;
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    this.bindHoleOverflowDismiss();
  },

  bindHoleOverflowDismiss() {
    if (this._overflowBound) return;
    this._overflowBound = true;
    document.addEventListener('click', (ev) => {
      const menu = document.getElementById('hole-overflow-menu');
      const btn = document.getElementById('hole-overflow');
      if (!menu || menu.hidden) return;
      if (btn && (btn === ev.target || btn.contains(ev.target))) return;
      if (menu.contains(ev.target)) return;
      menu.hidden = true;
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  },

  drawHoleView(state) {
    this.ensureVsPar();
    const container = document.getElementById('app');
    const holeNumber = this.pickCurrentHole(state);
    this.currentHole = holeNumber;
    const race = this.raceStripText(state);

    container.innerHTML = `
      ${this.holeToolbar(state)}
      ${this.writeErrorBanner()}
      ${this.eighteenBanner(state)}
      <div class="card hole-view" id="hole-view">
        <div class="hole-chrome">
          <div class="hole-number" id="hole-number">Hole ${holeNumber}</div>
          <div class="race-strip" id="race-strip">${_esc(race)}</div>
          ${this.pressableGames(state).length ? `<button type="button" class="btn btn-sm btn-accent press-live" onclick="scorecard.confirmPress()">Press</button>${this.infoTip('press', 'A press starts a child wager from this hole to the end of that game or Nassau segment. Same dollars as the parent unless you change them.')}` : ''}
        </div>
        ${this.wolfBarHtml(state, holeNumber)}
        ${this.kpPickerHtml(state, holeNumber)}
        ${this.addPlayerPanel(state)}
        ${this.holePlayersHtml(state, holeNumber)}
      </div>
      <div class="hole-nav thumb-zone" id="hole-nav"></div>
    `;
    this.renderHoleNav();
  },

  holeNavButtonsHtml(holeNumber) {
    const holes = (this.state && this.state.holes) || [];
    const first = holes[0];
    const last = holes[holes.length - 1];
    return `
      <button type="button" class="btn btn-secondary" id="hole-prev" ${first && holeNumber <= first.hole_number ? 'disabled' : ''}>Prev</button>
      <span class="hole-nav-label">Hole ${holeNumber}</span>
      <button type="button" class="btn btn-secondary" id="hole-stepper">Stepper</button>
      <button type="button" class="btn btn-secondary" id="hole-next" ${last && holeNumber >= last.hole_number ? 'disabled' : ''}>Next</button>`;
  },

  stepperInnerHtml() {
    const o = this.overlay || {};
    const value = o.current == null ? (o.par ?? '') : o.current;
    return `<div class="score-stepper" id="hole-stepper-bar">
      <button type="button" class="btn btn-secondary stepper-btn" id="score-minus">−</button>
      <input type="number" id="score-overlay-input" class="form-input score-overlay-number" inputmode="numeric" min="1" max="15" value="${value}" aria-label="${_esc(o.name || 'Score')}">
      <button type="button" class="btn btn-secondary stepper-btn" id="score-plus">+</button>
      <button type="button" class="btn btn-secondary" id="score-done">Done</button>
    </div>`;
  },

  renderHoleNav() {
    let nav = document.getElementById('hole-nav');
    if (this.shouldHoldAddPlayer()) {
      if (nav) nav.hidden = true;
      return;
    }
    if (this.stepperOpen && this.overlay) {
      if (!nav) {
        nav = document.createElement('div');
        nav.id = 'hole-nav';
        nav.className = 'hole-nav thumb-zone';
        const app = document.getElementById('app');
        if (app) app.appendChild(nav);
      }
      if (!nav) return;
      nav.hidden = false;
      nav.innerHTML = this.stepperInnerHtml();
      this.bindStepperControls();
      return;
    }
    if (!this.isHoleView()) {
      if (nav) nav.remove();
      return;
    }
    if (!nav) return;
    nav.hidden = false;
    nav.innerHTML = this.holeNavButtonsHtml(this.currentHole);
    const prev = document.getElementById('hole-prev');
    const next = document.getElementById('hole-next');
    const stepper = document.getElementById('hole-stepper');
    if (prev) prev.onclick = () => this.shiftHole(-1);
    if (next) next.onclick = () => this.shiftHole(1);
    if (stepper) stepper.onclick = () => this.openStepperFallback();
  },

  oneHoleTeamTotal(state, team, holeNumber) {
    const hole = (team.holes || []).find((x) => x.holeNumber === holeNumber);
    const bits = [];
    if (this.showOut(state) && team.out != null) bits.push(`OUT ${this.fmtTeam(team.out)}`);
    if (this.showIn(state) && team.inn != null) bits.push(`IN ${this.fmtTeam(team.inn)}`);
    if (this.showIn(state) && team.total != null) bits.push(`TOT ${this.fmtTeam(team.total)}`);
    return `<div class="hole-team-total ${hole?.incomplete ? 'incomplete' : ''}" data-team-total="${team.id}">
      <div class="hole-team-scoreline">
        <span>${_esc(team.name)} hole</span>
        <strong data-team-hole-score="${team.id}:${holeNumber}">${this.fmtTeam(hole?.total)}</strong>
        <span class="running-total">run <span data-team-tot="${team.id}">${this.fmtTeam(team.total)}</span></span>
      </div>
      ${bits.length ? `<div class="nine-line">${bits.join(' · ')}</div>` : ''}
      ${this.teamBallsHtml(team, holeNumber)}
      ${this.vsParLinesHtml(state, team, holeNumber)}
    </div>`;
  },

  kpPickerHtml(state, holeNumber) {
    const cfg = this.sideConfig(state);
    if (!cfg.kps || !cfg.kps.on) return '';
    if (!(cfg.kps.holes || []).includes(Number(holeNumber))) return '';
    const current = cfg.kps.winners && cfg.kps.winners[String(holeNumber)];
    const curId = current && (current.memberId || current.id);
    return `<div class="kp-picker card">
      <label>KP this hole ${this.infoTip('kp-hole', 'Closest to the pin. Optional. Winner shows on the 19th hole.')}
        <select class="form-input" onchange="scorecard.setKpWinner(${holeNumber}, this.value)">
          <option value="">No winner yet</option>
          ${(state.members || []).map((m) => `<option value="${m.id}" ${Number(curId) === m.id ? 'selected' : ''}>${_esc(m.display_name)}</option>`).join('')}
        </select>
      </label>
    </div>`;
  },

  setKpWinner(holeNumber, memberId) {
    const cfg = this.sideConfig(this.state);
    const kps = Object.assign({ on: true, holes: [], winners: {} }, cfg.kps || {});
    kps.winners = Object.assign({}, kps.winners);
    if (!memberId) delete kps.winners[String(holeNumber)];
    else {
      const member = (this.state.members || []).find((m) => String(m.id) === String(memberId));
      kps.winners[String(holeNumber)] = { memberId: Number(memberId), name: member ? member.display_name : '' };
    }
    this.updateSettings({ sideGames: Object.assign({}, cfg, { kps }) });
  },

  holeTeamTotals(state, holeNumber) {
    return (state.teams || []).map((team) => this.oneHoleTeamTotal(state, team, holeNumber)).join('');
  },

  endTotalsHtml(state) {
    const teams = (state.teams || []).map((t) => `${t.name} ${this.fmtTeam(t.total)}`).join(' · ');
    return teams ? `Team totals · ${teams}` : 'Team totals appear as scores land.';
  },

  paintEndTotals() {
    const el = document.getElementById('end-totals');
    if (el && this.state) el.textContent = this.endTotalsHtml(this.state);
  },

  retargetHoleView(holeNumber) {
    document.querySelectorAll('#hole-players .hole-player-row').forEach((row) => {
      const memberId = row.dataset.memberRow;
      const member = (this.state.members || []).find((m) => String(m.id) === String(memberId));
      const cell = row.querySelector('[data-score-cell]');
      if (cell) cell.setAttribute('data-score-cell', memberId + ':' + holeNumber);
      const input = row.querySelector('input.score-input');
      if (input) {
        input.dataset.hole = String(holeNumber);
        input.setAttribute('aria-label', (member ? member.display_name : 'Player') + ' hole ' + holeNumber);
      }
    });
    document.querySelectorAll('#hole-players [data-team-total]').forEach((wrap) => {
      const teamId = wrap.dataset.teamTotal;
      const score = wrap.querySelector('[data-team-hole-score]');
      if (score) score.setAttribute('data-team-hole-score', teamId + ':' + holeNumber);
      const vs = wrap.querySelector('[data-vs-par]');
      if (vs) vs.setAttribute('data-vs-par', teamId + ':' + holeNumber);
    });
  },

  shiftHole(delta) {
    if (this.shouldHoldAddPlayer()) return;
    const holes = (this.state && this.state.holes) || [];
    const idx = holes.findIndex((h) => h.hole_number === this.currentHole);
    const next = holes[idx + delta];
    if (!next) return;
    const focused = document.activeElement;
    const keepMember = focused && focused.classList && focused.classList.contains('score-input')
      ? Number(focused.dataset.member)
      : null;
    this.currentHole = next.hole_number;
    const holeView = document.getElementById('hole-view');
    const players = document.getElementById('hole-players');
    const rows = players ? players.querySelectorAll('.hole-player-row') : [];
    const rosterOk = this.isHoleView() && holeView && players
      && rows.length === this.visibleHoleMembers(this.state).length;
    if (!rosterOk) {
      this.draw(this.state);
      return;
    }
    this.retargetHoleView(this.currentHole);
    for (const member of this.state.members || []) this.paintScoreCell(member.id, this.currentHole);
    this.paintTeamHole(this.currentHole);
    this.paintCurrentHoleChrome();
    this.renderHoleNav();
    if (keepMember) {
      const el = document.querySelector(`#hole-players input.score-input[data-member="${keepMember}"]`);
      if (el) el.focus();
    }
  },

  drawFullCard(state) {
    const container = document.getElementById('app');
    const r = state.round;
    const holes = state.holes || [];
    const formatLabel = this.teamFormatLabel(r);
    const outHoles = holes.filter((h) => h.hole_number <= 9);
    const inHoles = holes.filter((h) => h.hole_number >= 10);
    const holeToggle = this.isNarrow()
      ? '<button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.setCardMode(\'hole\')">This hole</button>'
      : '';

    container.innerHTML = `
      ${this.toolbar(state, holeToggle)}
      ${this.writeErrorBanner()}
      ${this.eighteenBanner(state)}
      ${this.addPlayerPanel(state)}
      <div class="card">
        <h2 class="card-title">${_esc(r.name)}</h2>
        <p class="card-subtitle">${_esc(r.course?.name || '')} · ${_esc(r.tee?.name || 'Tee')} · ${formatLabel} · ${r.holes}</p>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Scorecard</span></div>
        <div class="scorecard-container high-contrast" id="scorecard-scroll">
          ${this.scoreTable(state, holes, outHoles, inHoles)}
        </div>
        <div class="end-totals" id="end-totals" hidden></div>
        <div class="ball-reveal" id="ball-reveal">${this.expandedHole ? 'Hole ' + this.expandedHole + ' · ' + _esc(this.ballLineText(state, this.expandedHole)) : ''}</div>
      </div>
    `;
  },

  scoreTable(state, holes, outHoles, inHoles) {
    const showOut = this.showOut(state);
    const showIn = this.showIn(state);
    return `
      <table class="scorecard team-scorecard" id="full-scorecard">
        <thead>
          <tr>
            <th>Hole</th>
            ${holes.map((h) => `<th data-hole-h="${h.hole_number}" class="${h.hole_number === this.currentHole ? 'is-current-hole' : ''}">${h.hole_number}</th>`).join('')}
            ${showOut ? '<th>OUT</th>' : ''}
            ${showIn ? '<th>IN</th>' : ''}
            ${showIn ? '<th>TOT</th>' : ''}
          </tr>
          <tr class="par-row">
            <th class="row-label">Par / SI</th>
            ${holes.map((h) => `<th>${h.par}<div class="si-mini">${h.stroke_index}</div></th>`).join('')}
            ${showOut ? `<th>${outHoles.reduce((s, h) => s + h.par, 0)}</th>` : ''}
            ${showIn ? `<th>${inHoles.reduce((s, h) => s + h.par, 0)}</th>` : ''}
            ${showIn ? `<th>${holes.reduce((s, h) => s + h.par, 0)}</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${this.playerRows(state, holes, outHoles, inHoles, showOut, showIn)}
        </tbody>
      </table>`;
  },

  drawSettings(state) {
    const container = document.getElementById('app');
    const r = state.round;
    const organizer = this.isOrganizer(state);
    container.innerHTML = `
        ${this.toolbar(state, `<button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.showScreen('play')">Scorecard</button>`)}
      <div class="card">
        <h2 class="card-title">Settings ${this.infoTip('settings', 'Team race, format, and side games. Handicap index is rounded at 0.5 and applied by stroke index — no course handicap.')}</h2>
        <p class="card-subtitle">${_esc(r.name)} · join <strong>${_esc(r.joinCode || r.join_code)}</strong></p>
        <p class="join-row">
          <button class="btn btn-sm btn-secondary" onclick="scorecard.copy('${_esc(r.joinUrl || '')}')">Copy join link</button>
          <button class="btn btn-sm btn-secondary" onclick="scorecard.copy('${_esc(r.publicUrl || '')}')">Copy public board</button>
        </p>
      </div>
      ${organizer ? this.settingsBar(state) : '<div class="card"><p>Only the organizer can change teams and guests.</p></div>'}
    `;
    svcApi('updateBadge');
  },

  drawResults(state) {
    const container = document.getElementById('app');
    const r = state.round;
    const teamFormat = r.format === 'team_net';
    container.innerHTML = `
      ${this.toolbar(state, `<button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.showScreen('play')">Scorecard</button>`)}
      <div class="card results-board" id="results-board">
        <h2 class="card-title">Round results</h2>
        <p class="card-subtitle">${_esc(r.name)} · ${_esc(r.course?.name || 'Goldendale Golf Club')} · ${teamFormat ? _esc(this.teamFormatLabel(r)) : 'Match play'}</p>
        <p class="race-strip">${_esc(this.raceStripText(state))}</p>
        <div class="roster-table-wrap">
          <table class="roster-table results-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th>HCP</th>
                <th>Gross</th>
                <th>Net</th>
                ${teamFormat ? '<th>Balls counted</th><th>Team total</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${(state.members || []).filter((m) => m.team_id).map((m) => {
                const team = (state.teams || []).find((t) => t.id === m.team_id);
                return `<tr>
                  <td>${_esc(m.display_name)}${m.is_guest ? ' · guest' : ''}</td>
                  <td>${_esc(this.teamNameFor(state, m))}</td>
                  <td>${m.playing_handicap ?? m.handicap ?? '—'}</td>
                  <td>${m.totalGross ?? '—'}</td>
                  <td>${m.totalNet ?? '—'}</td>
                  ${teamFormat ? `<td>${_esc(this.ballsCountedText(state, m.id))}</td><td>${this.fmtTeam(team && team.total)}</td>` : ''}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        ${teamFormat ? `
          <h3 class="section-title">Balls counted by hole</h3>
          <p class="card-subtitle game-rule">${_esc(this.teamFormatRule(r))}</p>
          <div class="ball-board">${(state.holeResults || []).map((hr) => {
            const bits = (hr.teams || []).map((t) => {
              const balls = (t.balls || []).map((b) => `${b.name} ${b.score}${b.type === 'gross' ? 'G' : 'N'}`).join(' · ');
              return `${t.teamName} ${this.fmtTeam(t.total)} (${balls || '—'})`;
            }).join(' · ');
            return `<div>Hole ${hr.holeNumber}: ${_esc(bits)}</div>`;
          }).join('')}</div>
        ` : this.matchBlock(state)}
        ${this.sideGamesResultsHtml(state)}
        <div class="welcome-actions mt-md">
          ${this.groupHasEighteen(state) ? '<button class="btn btn-accent btn-sm" onclick="scorecard.showScreen(\'nineteenth\')">Go to the 19th hole</button>' : ''}
          <button class="btn btn-secondary btn-sm" onclick="scorecard.copyText()">Copy as text</button>
          <a class="btn btn-secondary btn-sm" href="/api/rounds/${r.id}/results.csv" onclick="scorecard.downloadCsv(event)">CSV</a>
          <button class="btn btn-secondary btn-sm" onclick="app.navigate('#lb/${_esc(r.public_token || '')}')">Public board</button>
        </div>
      </div>
    `;
    svcApi('updateBadge');
  },

  teamChoices(state) {
    const names = new Set((state.teams || []).map((t) => t.name));
    for (let i = 1; i <= 5; i++) names.add('Team ' + i);
    return [...names].sort((a, b) => {
      const na = Number((a.match(/(\d+)/) || [])[1] || 99);
      const nb = Number((b.match(/(\d+)/) || [])[1] || 99);
      return na - nb || a.localeCompare(b);
    });
  },

  teamSelectHtml(state, member, extraClass) {
    const current = (state.teams || []).find((t) => t.id === member.team_id);
    return `<select class="form-input team-pick ${extraClass || ''}" data-member-team="${member.id}"
      onchange="scorecard.assignTeam(${member.id}, this.value)">
      ${this.teamChoices(state).map((n) => `<option value="${_esc(n)}" ${current && current.name === n ? 'selected' : ''}>${_esc(n)}</option>`).join('')}
    </select>`;
  },

  settingsBar(state) {
    const r = state.round;
    return `
      <div class="admin-bar" style="display:flex">
        <span class="admin-bar-label">Organizer</span>
        <button class="btn btn-sm btn-secondary" onclick="scorecard.balanceTeams()">Auto-balance (helper)</button>
        ${r.format === 'match_play' ? '<button class="btn btn-sm btn-secondary" onclick="scorecard.generateMatches()">Generate matches</button>' : ''}
        <button class="btn btn-sm btn-secondary" onclick="scorecard.setStatus('${r.status === 'completed' ? 'live' : 'completed'}')">${r.status === 'completed' ? 'Reopen' : 'Complete round'}</button>
        <label class="tiny-label">Allowance
          <select onchange="scorecard.updateSettings({allowance: Number(this.value), recomputeHandicaps:true})">
            ${[75,80,90,100].map((a) => `<option value="${a}" ${r.allowance === a ? 'selected' : ''}>${a}%</option>`).join('')}
          </select>
        </label>
        ${r.format === 'team_net' ? `<label class="tiny-label">Team game ${this.infoTip('format', 'Best-combo vs-par when Team race is ON. 1G+2N is the Goldendale default.')}
          <select onchange="scorecard.changeGame(this.value)">${this.gameOptionsHtml(this.currentGameKey(r))}</select>
        </label>` : ''}
        <label class="tiny-label"><input type="checkbox" ${this.isTeamRaceOn(state) ? 'checked' : ''} onchange="scorecard.updateSettings({teamRace: this.checked})"> Team vs-par race ${this.infoTip('team-race', 'Default ON. OFF hides the team vs-par race. Vegas, Wolf, Nassau, Nines, and Skins can still run alone or stacked.')}</label>
        <label class="tiny-label"><input type="checkbox" ${r.dual_count ? 'checked' : ''} onchange="scorecard.updateSettings({dualCount: this.checked})"> Dual-count</label>
      </div>
      ${r.format === 'team_net' ? `<p class="card-subtitle game-rule">${_esc(this.teamFormatRule(r))}</p>` : ''}
      ${this.sideGamesSettingsHtml(state)}
      <div class="card">
        <div class="card-title">Players (${state.members.length}/20)</div>
        <p class="card-subtitle">Pick a team for each player (Team 1 / 2 / 3…). Auto-balance is only a helper.</p>
        <form class="add-guest-row" id="add-guest-form" onsubmit="event.preventDefault();scorecard.addGuestFromForm()">
          <input class="form-input" id="add-guest-name" placeholder="Name" required>
          <input class="form-input" id="add-guest-hcp" placeholder="HCP">
          <select class="form-input team-pick" id="add-guest-team">
            ${this.teamChoices(state).map((n) => `<option value="${_esc(n)}" ${n === 'Team 1' ? 'selected' : ''}>${_esc(n)}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-accent" type="submit">Add player</button>
        </form>
        <div class="roster-table-wrap">
          <table class="roster-table">
            <thead><tr><th>Player</th><th>HCP</th><th>Team</th><th></th></tr></thead>
            <tbody>
              ${state.members.map((m) => `
                <tr>
                  <td>${_esc(m.display_name)}${m.is_guest ? ' · guest' : ''}</td>
                  <td>${m.playing_handicap ?? m.handicap ?? '—'}</td>
                  <td>${this.teamSelectHtml(state, m)}</td>
                  <td><button type="button" class="linkish" onclick="scorecard.editMember(${m.id})">HCP</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <label class="tiny-label" for="bulk-guests">Add several (one per line: Name, handicap, team)</label>
        <textarea class="form-input" id="bulk-guests" rows="4" placeholder="Cole Jan, 12, 3"></textarea>
        <button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.addBulkGuests()">Add names</button>
        <button type="button" class="btn btn-sm btn-accent" onclick="scorecard.addDemoTeam1VsPar()">Open Team 1 vs-par demo</button>
      </div>`;
  },

  groupedMembers(state) {
    const used = new Set();
    const groups = [];
    const teams = [...(state.teams || [])].sort((a, b) => (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0));
    for (const team of teams) {
      const members = (state.members || []).filter((m) => m.team_id === team.id);
      members.forEach((m) => used.add(m.id));
      groups.push({ team, members });
    }
    const rest = (state.members || []).filter((m) => !used.has(m.id));
    if (rest.length) groups.push({ team: null, members: rest });
    return groups;
  },

  playerRows(state, holes, outHoles, inHoles, showOut, showIn) {
    const extra = (showOut ? 1 : 0) + (showIn ? 2 : 0);
    return this.groupedMembers(state).filter((group) => group.team && (group.members || []).length).map((group) => {
      const label = group.team.name;
      const head = `<tr class="row-team-head"><th class="row-label">${_esc(label)}</th><td colspan="${holes.length + extra}"></td></tr>`;
      const rows = group.members.map((m) => this.onePlayerRow(state, m, holes, showOut, showIn)).join('');
      const teamRow = this.isTeamRaceOn(state) ? this.oneTeamRow(state, group.team, holes, showOut, showIn) : '';
      return head + rows + teamRow;
    }).join('');
  },

  onePlayerRow(state, m, holes, showOut, showIn) {
    const cells = holes.map((h) => {
      const hs = (m.holes || []).find((x) => x.holeNumber === h.hole_number);
      return this.scoreCellHtml(state, m, h, hs);
    }).join('');
    return `
      <tr class="row-player" data-member-row="${m.id}">
        <td class="row-label">${_esc(m.display_name)}<div class="hcp-mini">H ${m.playing_handicap ?? '—'}</div></td>
        ${cells}
        ${showOut ? `<td class="sc-total" data-out="${m.id}">${m.outGross ?? ''} <span class="net-mini">${m.outNet ?? ''}</span></td>` : ''}
        ${showIn ? `<td class="sc-total" data-in="${m.id}">${m.inGross ?? ''} <span class="net-mini">${m.inNet ?? ''}</span></td>` : ''}
        ${showIn ? `<td class="sc-total sc-tot-sticky" data-tot="${m.id}"><strong>${m.totalGross ?? ''}</strong> <span class="net-mini">${m.totalNet ?? ''}</span></td>` : ''}
      </tr>`;
  },

  oneTeamRow(state, team, holes, showOut, showIn) {
    return `
      <tr class="row-team" data-team-row="${team.id}">
        <td class="row-label">${_esc(team.name)}</td>
        ${holes.map((h) => {
          const hole = (team.holes || []).find((x) => x.holeNumber === h.hole_number);
          return `<td data-team-hole="${team.id}:${h.hole_number}" class="team-hole-cell ${hole?.incomplete ? 'incomplete' : ''}"
            onclick="scorecard.revealHoleBalls(${h.hole_number})">
            <span class="team-hole-score" data-team-hole-score="${team.id}:${h.hole_number}">${this.fmtTeam(hole?.total)}</span>
          </td>`;
        }).join('')}
        ${showOut ? `<td class="sc-total">${this.fmtTeam(team.out)}</td>` : ''}
        ${showIn ? `<td class="sc-total">${this.fmtTeam(team.inn)}</td>` : ''}
        ${showIn ? `<td class="sc-total"><strong data-team-tot="${team.id}">${this.fmtTeam(team.total)}</strong></td>` : ''}
      </tr>`;
  },

  scoreCellHtml(state, member, hole, hs) {
    const cls = this.cellClassList(hs, hole.par);
    return `<td class="${cls}" data-score-cell="${member.id}:${hole.hole_number}">
      <div class="gross-box">
        <input class="score-input" inputmode="numeric" pattern="[0-9]*" min="1" max="15" maxlength="2"
          data-member="${member.id}" data-hole="${hole.hole_number}"
          data-committed="${hs?.gross ?? ''}"
          value="${hs?.gross ?? ''}" aria-label="${_esc(member.display_name)} hole ${hole.hole_number}">
        ${this.strokeDotsHtml(hs?.strokes)}
      </div>
      ${hs?.gross != null ? `<span class="net-mini">${hs.net}</span>` : ''}
    </td>`;
  },

  strokeDotsHtml(strokes) {
    const marks = (window.vsPar && window.vsPar.strokeDotMarks)
      ? window.vsPar.strokeDotMarks(strokes)
      : { plus: false, count: 0 };
    if (marks.plus) {
      return '<span class="stroke-dots stroke-dots-plus" aria-label="plus handicap"><i class="dot-plus">+</i></span>';
    }
    if (!marks.count) return '';
    const dots = Array.from({ length: marks.count }, () => '<i class="dot"></i>').join('');
    return `<span class="stroke-dots dots-${marks.count}" aria-label="${marks.count} stroke${marks.count > 1 ? 's' : ''}">${dots}</span>`;
  },

  vsParPair(state, team, holeNumber) {
    const vp = window.vsPar || {};
    const course = (state.holes || []).find((h) => h.hole_number === holeNumber);
    const teamHole = (team.holes || []).find((h) => h.holeNumber === holeNumber);
    const holeVal = vp.holeTeamVsPar ? vp.holeTeamVsPar(teamHole && teamHole.total, course && course.par) : null;
    const runRows = (state.holes || []).map((h) => {
      const th = (team.holes || []).find((x) => x.holeNumber === h.hole_number);
      return { holeNumber: h.hole_number, par: h.par, total: th && th.total };
    });
    const runVal = vp.runningTeamVsPar ? vp.runningTeamVsPar(runRows, holeNumber) : null;
    return {
      holeText: vp.formatVsPar ? (vp.formatVsPar(holeVal) || '—') : '—',
      runText: vp.formatVsPar ? (vp.formatVsPar(runVal) || '—') : '—',
    };
  },

  vsParLinesHtml(state, team, holeNumber) {
    const pair = this.vsParPair(state, team, holeNumber);
    return `<div class="vs-par-lines" data-vs-par="${team.id}:${holeNumber}">
      <div class="vs-par-hole"><span class="vs-par-label">Hole</span> ${pair.holeText}</div>
      <div class="vs-par-run"><span class="vs-par-label">Running</span> ${pair.runText}</div>
    </div>`;
  },

  teamRows(state, holes, outHoles, inHoles) {
    return (state.teams || []).map((team) => `
      <tr class="row-team" data-team-row="${team.id}">
        <td class="row-label">${_esc(team.name)}</td>
        ${holes.map((h) => {
          const hole = team.holes.find((x) => x.holeNumber === h.hole_number);
          return `<td data-team-hole="${team.id}:${h.hole_number}" class="team-hole-cell ${hole?.incomplete ? 'incomplete' : ''}"
            onclick="scorecard.revealHoleBalls(${h.hole_number})">
            <span class="team-hole-score" data-team-hole-score="${team.id}:${h.hole_number}">${this.fmtTeam(hole?.total)}</span>
          </td>`;
        }).join('')}
        ${outHoles.length ? `<td class="sc-total">${this.fmtTeam(team.out)}</td>` : ''}
        ${inHoles.length ? `<td class="sc-total">${this.fmtTeam(team.inn)}</td>` : ''}
        <td class="sc-total"><strong data-team-tot="${team.id}">${this.fmtTeam(team.total)}</strong></td>
      </tr>`).join('');
  },

  revealHoleBalls(holeNumber) {
    this.expandedHole = this.expandedHole === holeNumber ? null : holeNumber;
    const el = document.getElementById('ball-reveal');
    if (!el || !this.state) return;
    el.textContent = this.expandedHole
      ? 'Hole ' + this.expandedHole + ' · ' + this.ballLineText(this.state, this.expandedHole)
      : '';
  },

  resultsPreview(state) {
    const winner = state.winner;
    const completed = state.round.status === 'completed';
    let headline = 'Enter scores to see team totals.';
    if (winner) {
      headline = completed
        ? `${winner.name} wins · ${this.fmtTeam(winner.total)}`
        : `Leading team: ${winner.name} · ${this.fmtTeam(winner.total)}`;
    }
    return `
      <div class="card">
        <div class="card-header"><span class="card-title">Results</span></div>
        <p><strong>${_esc(headline)}</strong></p>
        <p class="race-strip">${_esc(this.raceStripText(state))}</p>
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

  cellClassList(hs, par) {
    const cls = ['sc-cell-editable'];
    const vs = this.vsParClass(hs?.gross, par);
    if (vs) cls.push(vs);
    const dots = Math.max(0, hs?.strokes || 0);
    if (dots) cls.push('dots-' + Math.min(dots, 3));
    if ((hs?.strokes || 0) < 0) cls.push('dots-plus');
    return cls.join(' ');
  },

  paintScoreCell(memberId, holeNumber) {
    if (!this.state) return;
    const member = this.state.members.find((m) => m.id === memberId);
    const hs = member && (member.holes || []).find((h) => h.holeNumber === holeNumber);
    const hole = this.holeMeta(this.state, holeNumber);
    const cells = document.querySelectorAll('[data-score-cell="' + memberId + ':' + holeNumber + '"]');
    cells.forEach((cell) => {
      const input = cell.querySelector('input.score-input');
      const holeRow = cell.classList.contains('hole-player-score');
      cell.className = (holeRow ? 'hole-player-score ' : '') + this.cellClassList(hs, hole.par);
      if (input) {
        if (document.activeElement !== input) {
          input.value = hs?.gross ?? '';
          input.dataset.committed = hs?.gross ?? '';
        }
        const box = cell.querySelector('.gross-box') || cell;
        const nextDots = this.strokeDotsHtml(hs?.strokes);
        const currentDots = box.querySelector('.stroke-dots');
        if (nextDots) {
          if (currentDots) currentDots.outerHTML = nextDots;
          else box.insertAdjacentHTML('beforeend', nextDots);
        } else if (currentDots) {
          currentDots.remove();
        }
        let net = cell.querySelector('.net-mini');
        if (hs?.gross != null) {
          if (!net) {
            net = document.createElement('span');
            net.className = 'net-mini';
            cell.appendChild(net);
          }
          net.textContent = hs.net;
        } else if (net) {
          net.remove();
        }
      }
    });
  },

  paintPlayerTotals(memberId) {
    if (!this.state) return;
    const members = memberId
      ? this.state.members.filter((m) => m.id === memberId)
      : this.state.members;
    for (const member of members) {
      const out = document.querySelector('[data-out="' + member.id + '"]');
      if (out) out.innerHTML = `${member.outGross ?? ''} <span class="net-mini">${member.outNet ?? ''}</span>`;
      const inn = document.querySelector('[data-in="' + member.id + '"]');
      if (inn) inn.innerHTML = `${member.inGross ?? ''} <span class="net-mini">${member.inNet ?? ''}</span>`;
      const tot = document.querySelector('[data-tot="' + member.id + '"]');
      if (tot) tot.innerHTML = `<strong>${member.totalGross ?? ''}</strong> <span class="net-mini">${member.totalNet ?? ''}</span>`;
    }
  },

  paintTeamHole(holeNumber) {
    if (!this.state || holeNumber == null) return;
    for (const team of this.state.teams || []) {
      const hole = (team.holes || []).find((h) => h.holeNumber === holeNumber);
      document.querySelectorAll('[data-team-hole="' + team.id + ':' + holeNumber + '"]').forEach((el) => {
        el.classList.toggle('incomplete', !!hole?.incomplete);
      });
      document.querySelectorAll('[data-team-hole-score="' + team.id + ':' + holeNumber + '"]').forEach((el) => {
        el.textContent = this.fmtTeam(hole?.total);
      });
      const wrap = document.querySelector('[data-team-total="' + team.id + '"]');
      if (wrap) wrap.classList.toggle('incomplete', !!hole?.incomplete);
      const tot = document.querySelector('[data-team-tot="' + team.id + '"]');
      if (tot) tot.textContent = this.fmtTeam(team.total);
      this.paintTeamVsPar(team);
    }
  },

  paintTeamVsPar(team) {
    if (!this.state || !team) return;
    for (const course of this.state.holes || []) {
      const pair = this.vsParPair(this.state, team, course.hole_number);
      document.querySelectorAll('[data-vs-par="' + team.id + ':' + course.hole_number + '"]').forEach((el) => {
        const holeEl = el.querySelector('.vs-par-hole');
        const runEl = el.querySelector('.vs-par-run');
        if (holeEl) holeEl.innerHTML = '<span class="vs-par-label">Hole</span> ' + pair.holeText;
        if (runEl) runEl.innerHTML = '<span class="vs-par-label">Running</span> ' + pair.runText;
      });
    }
  },

  paintRaceStrip() {
    const el = document.getElementById('race-strip');
    if (el && this.state) el.textContent = this.raceStripText(this.state);
    const badge = document.querySelector('[data-status-badge]');
    if (badge && this.state) {
      badge.textContent = this.state.round.status;
      badge.className = 'badge badge-' + this.state.round.status;
    }
  },

  paintBallLine(holeNumber) {
    const hole = holeNumber || this.currentHole;
    if (!this.state) return;
    for (const team of this.state.teams || []) {
      document.querySelectorAll('[data-team-balls="' + team.id + '"]').forEach((el) => {
        el.textContent = this.teamBallsText(team, hole);
      });
    }
    const reveal = document.getElementById('ball-reveal');
    if (reveal && this.expandedHole) {
      reveal.textContent = 'Hole ' + this.expandedHole + ' · ' + this.ballLineText(this.state, this.expandedHole);
    }
  },

  patchUI() {
    if (!this.state) return;
    if (this.screen !== 'play') return;
    if (this.shouldHoldAddPlayer()) return;
    if (this.isHoleView()) {
      const players = document.getElementById('hole-players');
      if (!players) {
        this.draw(this.state);
        return;
      }
      const rows = players.querySelectorAll('.hole-player-row');
      if (rows.length !== this.visibleHoleMembers(this.state).length) {
        this.draw(this.state);
        return;
      }
      const holeNumber = this.currentHole;
      for (const member of this.visibleHoleMembers(this.state)) {
        this.paintScoreCell(member.id, holeNumber);
      }
      for (const team of this.state.teams || []) this.paintTeamHole(holeNumber);
      this.paintRaceStrip();
      this.paintBallLine(holeNumber);
      this.paintEndTotals();
      this.paintCurrentHoleChrome();
      return;
    }
    const table = document.getElementById('full-scorecard');
    if (!table) {
      this.draw(this.state);
      return;
    }
    const rows = table.querySelectorAll('tr.row-player');
    if (rows.length !== this.visibleHoleMembers(this.state).length) {
      this.draw(this.state);
      return;
    }
    for (const member of this.state.members || []) {
      for (const hs of member.holes || []) this.paintScoreCell(member.id, hs.holeNumber);
      this.paintPlayerTotals(member.id);
    }
    for (const team of this.state.teams || []) {
      for (const hole of team.holes || []) this.paintTeamHole(hole.holeNumber);
    }
    this.paintRaceStrip();
    this.paintBallLine(this.currentHole);
    this.paintEndTotals();
    this.paintCurrentHoleChrome();
  },

  openEditor(roundId, memberId, holeNumber, name, current, par) {
    this.overlay = { roundId, memberId, holeNumber, name, current, par };
    this.stepperOpen = true;
    this.renderHoleNav();
    const input = document.getElementById('score-overlay-input');
    if (input) {
      input.focus();
      input.select();
    }
  },

  closeEditor() {
    this.stepperOpen = false;
    this.overlay = null;
    this.renderHoleNav();
  },

  bindOverlay() {
    this.bindStepperControls();
  },

  bindStepperControls() {
    const minus = document.getElementById('score-minus');
    const plus = document.getElementById('score-plus');
    const clear = document.getElementById('score-clear');
    const done = document.getElementById('score-done');
    const input = document.getElementById('score-overlay-input');
    if (!minus || !input || minus.dataset.bound) return;
    minus.dataset.bound = '1';
    minus.onclick = () => this.nudgeStepper(-1);
    if (plus) plus.onclick = () => this.nudgeStepper(1);
    if (clear) clear.onclick = () => this.commitStepper(null);
    if (done) done.onclick = () => this.closeEditor();
    input.addEventListener('change', () => {
      const raw = String(input.value || '').replace(/\D/g, '').slice(0, 2);
      if (!raw) return;
      const n = Number(raw);
      if (n >= 1 && n <= 15) this.commitStepper(n);
    });
  },

  nudgeStepper(delta) {
    const input = document.getElementById('score-overlay-input');
    if (!input || !this.overlay) return;
    const fallback = Number(this.overlay.current != null ? this.overlay.current : this.overlay.par) || 4;
    const next = Math.min(15, Math.max(1, (Number(input.value) || fallback) + delta));
    input.value = next;
    this.commitStepper(next);
  },

  commitStepper(gross) {
    if (!this.overlay) return;
    const { memberId, holeNumber } = this.overlay;
    this.overlay.current = gross;
    this.commitScore(memberId, holeNumber, gross);
  },

  async addGuest() {
    const values = await _formPrompt({
      title: 'Add guest',
      submitLabel: 'Add guest',
      fields: [
        { name: 'name', label: 'Guest name', required: true, placeholder: 'Name' },
        { name: 'handicap', label: 'Handicap (optional)', placeholder: '12.4 or +2' },
        { name: 'teamName', label: 'Team (1, 2, 3… or blank)', placeholder: '3' },
      ],
    });
    if (!values) return;
    try {
      const state = await svcApi('post', `/api/rounds/${this.state.round.id}/guests`, {
        name: values.name,
        handicap: values.handicap,
        teamName: values.teamName || null,
      });
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async addGuestFromForm(which) {
    const prefix = which === 'live' ? 'live-add-guest-' : 'add-guest-';
    const name = (document.getElementById(prefix + 'name') || {}).value;
    const handicap = (document.getElementById(prefix + 'hcp') || {}).value;
    const teamName = (document.getElementById(prefix + 'team') || {}).value;
    if (!name) return;
    try {
      const state = await svcApi('post', `/api/rounds/${this.state.round.id}/guests`, {
        name: name.trim(),
        handicap,
        teamName: teamName || 'Team 1',
      });
      this.state = state;
      this.writeCache(state.round.id, state);
      if (which === 'live') {
        this.addPlayerOpen = (state.members || []).length >= 2 ? true : this.addPlayerOpen;
        this.addPlayerDraft = { name: '', handicap: '', teamName: teamName || 'Team 1' };
        this._preserveAddDraft = true;
      }
      this.draw(state);
      if (which === 'live') {
        const nameEl = document.getElementById('live-add-guest-name');
        if (nameEl) nameEl.focus();
      }
    } catch (err) { _toast(err.message, 'error'); }
  },

  async addBulkGuests() {
    const raw = (document.getElementById('bulk-guests') || {}).value || '';
    const guests = raw.split(/\n/).map((line) => {
      const parts = line.split(',').map((s) => s.trim()).filter((s, i) => s || i === 0);
      if (!parts[0]) return null;
      return { name: parts[0], handicap: parts[1] || null, teamName: parts[2] || 'Team 1' };
    }).filter(Boolean);
    if (!guests.length) return;
    try {
      const state = await svcApi('post', `/api/rounds/${this.state.round.id}/guests/bulk`, { guests });
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async addDemoFoursome() {
    if (!this.state) return;
    try {
      const state = await svcApi('post', `/api/rounds/${this.state.round.id}/demo/foursome`);
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
      _toast('Kurt, Chase, and Brian are on Team 1 with 18 holes in.', 'success');
    } catch (err) { _toast(err.message, 'error'); }
  },

  async addDemoTeam1VsPar() {
    if (!this.state) return;
    try {
      const state = await svcApi('post', `/api/rounds/${this.state.round.id}/demo/team1-vs-par`);
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
      _toast('Team 1 vs-par demo: ColdGin (H 3 received, par) + Kurt / Chase / Brian.', 'success');
    } catch (err) { _toast(err.message, 'error'); }
  },

  async assignTeam(memberId, teamName) {
    try {
      const state = await svcApi('put', `/api/rounds/${this.state.round.id}/members/${memberId}`, {
        teamName: teamName || '',
      });
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async balanceTeams() {
    const values = await _formPrompt({
      title: 'Auto-balance teams',
      submitLabel: 'Balance',
      fields: [{ name: 'teamCount', label: 'How many teams?', type: 'number', value: '2', required: true }],
    });
    if (!values) return;
    try {
      const state = await svcApi('post', `/api/rounds/${this.state.round.id}/teams/balance`, {
        teamCount: Number(values.teamCount),
      });
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async generateMatches() {
    try {
      const state = await svcApi('post', `/api/rounds/${this.state.round.id}/matches/generate`);
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async setStatus(status) {
    try {
      const state = await svcApi('put', `/api/rounds/${this.state.round.id}`, { status });
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async updateSettings(body) {
    try {
      const state = await svcApi('put', `/api/rounds/${this.state.round.id}`, body);
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async editMember(memberId) {
    const member = this.state.members.find((m) => m.id === memberId);
    const values = await _formPrompt({
      title: 'Playing handicap',
      submitLabel: 'Save',
      fields: [{
        name: 'playingHandicap',
        label: 'Handicap index (rounded at 0.5, then SI strokes)',
        value: member.playing_handicap ?? member.handicap ?? '',
        required: true,
      }],
    });
    if (!values) return;
    try {
      const state = await svcApi('put', `/api/rounds/${this.state.round.id}/members/${memberId}`, {
        handicap: values.playingHandicap,
        playingHandicap: values.playingHandicap,
      });
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  copy(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => _toast('Copied', 'success')).catch(() => {
      _formPrompt({
        title: 'Copy this link',
        submitLabel: 'Done',
        fields: [{ name: 'text', label: 'Link', value: text }],
      });
    });
  },

  async copyText() {
    try {
      const text = await svcApi('get', `/api/rounds/${this.state.round.id}/results.txt`);
      this.copy(typeof text === 'string' ? text : JSON.stringify(text));
    } catch (err) { _toast(err.message, 'error'); }
  },

  async downloadCsv(e) {
    e.preventDefault();
    const token = svcApi('getToken');
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

  drawGameRules(state) {
    const container = document.getElementById('app');
    const bar = state
      ? this.toolbar(state, `<button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.showScreen('play')">Scorecard</button>`)
      : '<div class="round-toolbar"><a href="#dashboard" onclick="event.preventDefault();app.navigate(\'#dashboard\')">&larr; Rounds</a></div>';
    container.innerHTML = `${bar}
      <div class="card game-rules" id="game-rules">
        <h2 class="card-title">Game Rules</h2>
        <p class="card-subtitle">House rules. Short and plain. Tap ℹ on the live card for one-line help.</p>
        <h3>Team vs-par race</h3>
        <p>Setup toggle, default ON. When ON, each team’s hole is the best combo of counted balls vs par — not a stroke sum. Goldendale default is best 1 gross + 2 net. OFF hides the race. Vegas, Wolf, Nassau, Nines, and Skins can run alone or stacked.</p>
        <h3>Handicap index</h3>
        <p>No course handicap. Round the index at 0.5 (2.4→2, 2.5→3, 18.7→19, 1.3→1). That integer is applied by scorecard stroke index for every net game.</p>
        <h3>Skins</h3>
        <p>One pot. Gross and net. A tie kills that hole — no carry. Net off the low man, strokes by SI. Value = pot ÷ (gross skins won + net skins won). Default OFF.</p>
        <h3>Vegas</h3>
        <p>2v2. Two scores become a number, low first. 10+ is high-first. Birdie or eagle (or better) flips the other side high-first. If both sides birdie or better, both numbers flip — they do not cancel. Net Vegas flips only on a gross birdie or better. Presses apply.</p>
        <h3>Nassau</h3>
        <p>Front 9, back 9, and overall 18 as three bets. Each hole is match play. A press is a child wager on that segment.</p>
        <h3>Wolf</h3>
        <p>Wolf rotates. Pick a partner after they tee, or go lone for 2×. Gross or net. Presses optional.</p>
        <h3>Nines</h3>
        <p>Exactly 3 players. 5-3-1, ties split, Blitz 9-0-0 default ON. Net off the low man. Presses apply.</p>
        <h3>Presses</h3>
        <p>From the current hole to the end of that game or Nassau segment. Same $ as the parent unless you change it at confirm. Either side can press.</p>
        <h3>Birdie slots</h3>
        <p>Fun layer, not money. Default ON. Each gross birdie or better is one spin. More birdies = more spins. Running high score.</p>
        <h3>Optional KPs</h3>
        <p>Default OFF. Designate KP holes, record a winner, see them on the 19th hole.</p>
        <h3>19th hole</h3>
        <p>When all scores are in, tap Go to the 19th hole. Front, back, and overall winners for every team. Active side games settle. Fun facts: total gross birdies, hardest and easiest holes, most birdies by a player, biggest team swing.</p>
        <h3>OUT / IN / TOT</h3>
        <p>After hole 9: OUT is front 1–9. After 18: IN is back 10–18 only. TOT is 1–18. Team race stays vs-par.</p>
      </div>`;
    svcApi('updateBadge');
  },

  drawNineteenth(state) {
    const container = document.getElementById('app');
    const fmt = (rows) => (rows || []).length
      ? rows.map((t) => `${t.name} ${this.fmtTeam(t.total)}`).join(' · ')
      : '—';
    const facts = state.funFacts || {};
    const cfg = this.sideConfig(state);
    const kps = cfg.kps && cfg.kps.on
      ? (cfg.kps.holes || []).map((hn) => {
        const win = cfg.kps.winners && cfg.kps.winners[String(hn)];
        return `Hole ${hn}: ${win && win.name ? win.name : '—'}`;
      }).join(' · ')
      : '';
    const skins = state.sideGames && state.sideGames.games && state.sideGames.games.skins;
    container.innerHTML = `
      ${this.toolbar(state, `<button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.showScreen('play')">Scorecard</button>`)}
      <div class="card nineteenth" id="nineteenth">
        <h2 class="card-title">19th hole</h2>
        <p class="card-subtitle">${_esc(state.round.name)} · confirmed card</p>
        <h3>Team winners</h3>
        ${(state.teams || []).map((t) => `<p><strong>${_esc(t.name)}</strong> · Front ${this.fmtTeam(t.out)} · Back ${this.fmtTeam(t.inn)} · Overall ${this.fmtTeam(t.total)}</p>`).join('') || '<p>No teams yet.</p>'}
        <p>Front: ${_esc(fmt(state.frontLeaders))} · Back: ${_esc(fmt(state.backLeaders))} · Overall: ${_esc(fmt(state.overallLeaders))}</p>
        ${skins ? `<h3>Skins</h3><p>Gross ${skins.grossSkins} · Net ${skins.netSkins} · pot ${skins.pot ?? '—'} · ${skins.skinCount ? (skins.valuePerSkin + ' / skin') : 'no skins'}</p>` : ''}
        ${this.sideGamesResultsHtml(state)}
        ${kps ? `<h3>Closest to the pin</h3><p>${_esc(kps)}</p>` : ''}
        <h3>Fun facts</h3>
        <p>Total gross birdies: ${facts.totalBirdies ?? 0}</p>
        <p>Hardest hole: ${facts.hardest ? ('#' + facts.hardest.hole + ' (' + (facts.hardest.avg > 0 ? '+' : '') + facts.hardest.avg.toFixed(1) + ' vs par)') : '—'}</p>
        <p>Easiest hole: ${facts.easiest ? ('#' + facts.easiest.hole + ' (' + (facts.easiest.avg > 0 ? '+' : '') + facts.easiest.avg.toFixed(1) + ' vs par)') : '—'}</p>
        <p>Most birdies: ${facts.mostBirdies ? (facts.mostBirdies.name + ' ' + facts.mostBirdies.birdies) : '—'}</p>
        <p>Biggest team swing: ${facts.biggestSwing ? (facts.biggestSwing.name + ' ' + facts.biggestSwing.swing) : '—'}</p>
      </div>`;
    svcApi('updateBadge');
  },
};

window.scorecard = scorecard;
