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
  ASSET_V: '20260905q',
  scoreAdvance: 'down',
  SCORE_ADVANCE_KEY: 'goldendale_score_advance',
  ONE_DIGIT_MS: 1400,

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
    if (patch.wolfPicks) this.state.wolfPicks = patch.wolfPicks;
    if (patch.presses) this.state.presses = patch.presses;
    this._ninesLedger = null;
  },

  writeMemberHole(memberId, holeNumber, gross, net, strokes) {
    const member = (this.state.members || []).find((m) => String(m.id) === String(memberId));
    if (!member) return null;
    const hole = (member.holes || []).find((h) => Number(h.holeNumber) === Number(holeNumber));
    if (!hole) return null;
    hole.gross = gross;
    if (strokes != null) hole.strokes = strokes;
    hole.net = gross == null ? null : (net != null ? net : gross - (hole.strokes || 0));
    return hole;
  },

  applyLocalScore(memberId, holeNumber, gross) {
    if (!this.state) return;
    this._ninesLedger = null;
    this.writeMemberHole(memberId, holeNumber, gross, null, null);
    const member = (this.state.members || []).find((m) => String(m.id) === String(memberId));
    if (member) this.recomputePlayerTotals(member);
    this.paintScoreCell(memberId, holeNumber);
    this.paintPlayerTotals(memberId);
    this.paintNinesBoard();
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
    const members = this.visibleHoleMembers(state);
    if (!holes.length || !members.length) return false;
    return members.every((m) => this.playerComplete(m, holes));
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

  isVegasOn(state) {
    const cfg = this.sideConfig(state);
    return !!(cfg.vegas && cfg.vegas.on);
  },

  isWolfOn(state) {
    if (!state) return false;
    const cfg = this.sideConfig(state);
    if (cfg && cfg.wolf && this.flagOn(cfg.wolf.on)) return true;
    const games = state.sideGames && state.sideGames.games;
    return !!(games && games.wolf);
  },

  vegasGame(state) {
    const g = state && state.sideGames && state.sideGames.games && state.sideGames.games.vegas;
    return g && (g.teamA || g.holes) ? g : null;
  },

  vegasSideForTeam(state, team) {
    const v = this.vegasGame(state);
    if (!v || !team) return null;
    if (v.teamA && Number(v.teamA.id) === Number(team.id)) return 'A';
    if (v.teamB && Number(v.teamB.id) === Number(team.id)) return 'B';
    return null;
  },

  fmtVegasPts(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    const v = Number(n);
    if (v === 0) return '0';
    return v > 0 ? '+' + v : String(v);
  },

  vegasHoleFor(state, team, holeNumber) {
    const v = this.vegasGame(state);
    const side = this.vegasSideForTeam(state, team);
    if (!v || !side) return null;
    const row = (v.holes || []).find((h) => h.holeNumber === holeNumber);
    const runFallback = side === 'A' ? (v.teamA && v.teamA.points) || 0 : (v.teamB && v.teamB.points) || 0;
    if (!row || row.incomplete) {
      return { incomplete: true, num: null, run: runFallback, swing: null, points: 0, flip: false };
    }
    return {
      incomplete: false,
      num: side === 'A' ? row.numA : row.numB,
      run: side === 'A' ? (row.runA != null ? row.runA : runFallback) : (row.runB != null ? row.runB : runFallback),
      swing: side === 'A' ? row.swingA : row.swingB,
      points: row.points,
      flip: side === 'A' ? row.flipA : row.flipB,
    };
  },

  vegasStripText(state) {
    const v = this.vegasGame(state);
    if (!v || !v.teamA || !v.teamB) return this.isVegasOn(state) ? 'Vegas —' : '';
    const hn = this.currentHole || 1;
    const row = (v.holes || []).find((h) => h.holeNumber === hn);
    const run = this.vegasNamedRun(v, hn);
    if (!row || row.incomplete) return `Vegas ${run}`;
    return `Vegas ${row.numA}–${row.numB} · this ${this.fmtVegasPts(row.swingA)}/${this.fmtVegasPts(row.swingB)} · ${run}`;
  },

  vegasBoardHtml(state) {
    if (!this.isVegasOn(state)) return '';
    return `<div class="vegas-board" id="vegas-board">${this.vegasBoardInner(state)}</div>`;
  },

  vegasPresses(state) {
    return (state && state.presses || []).filter((p) => (p.game_key || p.gameKey) === 'vegas');
  },

  vegasGamesRunning(state, holeNumber) {
    const hn = Number(holeNumber || this.currentHole || 1);
    const v = this.vegasGame(state);
    const row = v && (v.holes || []).find((h) => h.holeNumber === hn);
    if (row && row.games != null) return row.games;
    return 1 + this.vegasPresses(state).filter((p) => Number(p.start_hole ?? p.startHole ?? 1) <= hn).length;
  },

  vegasPressCount(state) {
    return this.vegasGamesRunning(state, this.currentHole);
  },

  vegasRunPoints(game, holeNumber) {
    if (!game || !game.teamA || !game.teamB) return { a: 0, b: 0 };
    const hn = Number(holeNumber || this.currentHole || 0);
    const row = hn ? (game.holes || []).find((h) => h.holeNumber === hn) : null;
    const a = row && row.runA != null ? Number(row.runA) : Number(game.teamA.points) || 0;
    const b = row && row.runB != null ? Number(row.runB) : Number(game.teamB.points) || 0;
    return { a, b };
  },

  vegasNamedRun(game, holeNumber) {
    if (!game || !game.teamA || !game.teamB) return 'RUNNING even';
    const { a, b } = this.vegasRunPoints(game, holeNumber);
    if (a === b) return 'RUNNING even';
    if (a > b) {
      return `RUNNING: ${game.teamA.name} up ${Math.abs(a)} · ${game.teamB.name} down ${Math.abs(b)}`;
    }
    return `RUNNING: ${game.teamB.name} up ${Math.abs(b)} · ${game.teamA.name} down ${Math.abs(a)}`;
  },

  vegasRunDiffLine(game, holeNumber) {
    return this.vegasNamedRun(game, holeNumber);
  },

  vegasThisHoleLine(game, holeNumber) {
    const row = (game.holes || []).find((h) => h.holeNumber === holeNumber);
    if (!row || row.incomplete) return 'This hole: —';
    const games = row.games != null ? row.games : 1;
    return `This hole: ${game.teamA.name} ${this.fmtVegasPts(row.swingA)} · ${game.teamB.name} ${this.fmtVegasPts(row.swingB)} · ${row.numA}–${row.numB}${games > 1 ? ` ×${games}` : ''}`;
  },

  vegasBoardInner(state) {
    const v = this.vegasGame(state);
    if (!v || !v.teamA || !v.teamB) {
      return this.isVegasOn(state) ? '<div class="vegas-board-this">Vegas —</div>' : '';
    }
    const hn = this.currentHole || 1;
    return `<div class="vegas-board-this">${_esc(this.vegasThisHoleLine(v, hn))}</div>
      <div class="vegas-board-total vegas-run-diff">${_esc(this.vegasRunDiffLine(v, hn))}</div>`;
  },

  vegasPressButtonHtml(state, holeNumber) {
    if (!this.isVegasOn(state)) return '';
    const n = this.vegasGamesRunning(state, holeNumber);
    return `<div class="vegas-press-wrap" id="vegas-press-wrap">
      <button type="button" class="vegas-press-btn" data-vegas-press="${holeNumber}" data-vegas-games="${n}" onclick="scorecard.pressVegasFromHole(${holeNumber})" aria-label="Vegas games running ${n}. Tap Press to add a game.">
        <span class="vegas-press-label">Press</span>
        <span class="vegas-press-badge">${n}</span>
        <span class="vegas-press-hint">${n} game${n === 1 ? '' : 's'} running</span>
      </button>
    </div>`;
  },

  flagOn(value) {
    return value === true || value === 1 || value === '1' || value === 'on' || value === 'true' || value === 'yes';
  },

  isNassauOn(state) {
    if (!state) return false;
    const cfg = this.sideConfig(state);
    if (cfg && cfg.nassau && this.flagOn(cfg.nassau.on)) return true;
    const games = state.sideGames && state.sideGames.games;
    if (games && (games.nassau || (games.nassauPresses && games.nassauPresses.length))) return true;
    const presses = state.presses || [];
    if (presses.some((p) => (p.game_key || p.gameKey) === 'nassau')) return true;
    const strip = state.sideGames && (state.sideGames.stripText || '');
    return /\bNassau\b/i.test(strip);
  },

  nassauPresses(state) {
    const g = state && state.sideGames && state.sideGames.games;
    return (g && g.nassauPresses) || [];
  },

  nassauPressCount(state, segment) {
    const rows = this.nassauPresses(state);
    if (!segment) return rows.length;
    return rows.filter((p) => p.segment === segment).length;
  },

  nassauSegmentsForHole(holeNumber) {
    const hn = Number(holeNumber) || 1;
    return [
      { key: 'front', label: 'Front', end: 9, enabled: hn <= 9, hint: hn <= 9 ? 'dies at 9' : 'closed after 9', start: hn },
      { key: 'back', label: 'Back', end: 18, enabled: true, hint: hn >= 10 ? 'dies at 18' : 'starts hole 10', start: hn >= 10 ? hn : 10 },
      { key: 'overall', label: 'Overall', end: 18, enabled: true, hint: 'tap→18', start: hn },
    ];
  },

  nassauSegLabel(segment) {
    if (segment === 'front') return 'Front';
    if (segment === 'back') return 'Back';
    return 'Overall';
  },

  nassauThisHole(seg, holeNumber, teamA, teamB) {
    const row = ((seg && seg.holeRows) || []).find((h) => h.holeNumber === holeNumber);
    if (!row || row.scoreA == null || row.scoreB == null) return 'This hole: —';
    if (row.winner === 'A') return `This hole: ${(teamA && teamA.name) || 'A'} wins`;
    if (row.winner === 'B') return `This hole: ${(teamB && teamB.name) || 'B'} wins`;
    return 'This hole: halved';
  },

  nassauByHole(seg) {
    const bits = ((seg && seg.holeRows) || [])
      .filter((h) => h.scoreA != null && h.scoreB != null)
      .map((h) => {
        const mark = h.winner === 'A' ? 'A' : h.winner === 'B' ? 'B' : '½';
        return `H${h.holeNumber} ${mark}`;
      });
    return bits.length ? 'By hole: ' + bits.join(' · ') : 'By hole: —';
  },

  nassauTeamName(team, fallback) {
    if (!team) return fallback;
    return team.displayName || team.name || fallback;
  },

  nassauRunThrough(seg, holeNumber, teamA, teamB) {
    const hn = Number(holeNumber) || this.currentHole || 18;
    const rows = ((seg && seg.holeRows) || []).filter((h) => (
      Number(h.holeNumber) <= hn && h.scoreA != null && h.scoreB != null
    ));
    let a = 0;
    let b = 0;
    for (const row of rows) {
      if (row.winner === 'A') a += 1;
      else if (row.winner === 'B') b += 1;
    }
    const nameA = this.nassauTeamName(teamA, 'A');
    const nameB = this.nassauTeamName(teamB, 'B');
    if (!rows.length) return 'RUNNING even';
    if (a === b) return `RUNNING even (${a}–${b})`;
    if (a > b) return `RUNNING: ${nameA} up ${a - b} · ${nameB} down ${a - b}`;
    return `RUNNING: ${nameB} up ${b - a} · ${nameA} down ${b - a}`;
  },

  nassauRunText(seg, holeNumber, teamA, teamB) {
    if (seg && (seg.holeRows || []).length) return this.nassauRunThrough(seg, holeNumber, teamA, teamB);
    if (!seg) return 'RUNNING even';
    const a = seg.holesWonA != null ? seg.holesWonA : 0;
    const b = seg.holesWonB != null ? seg.holesWonB : 0;
    const nameA = this.nassauTeamName(teamA, 'A');
    const nameB = this.nassauTeamName(teamB, 'B');
    if (a === b) return a || b ? `RUNNING even (${a}–${b})` : 'RUNNING even';
    if (a > b) return `RUNNING: ${nameA} up ${a - b} · ${nameB} down ${a - b}`;
    return `RUNNING: ${nameB} up ${b - a} · ${nameA} down ${b - a}`;
  },

  nassauLineHtml(label, seg, holeNumber, teamA, teamB) {
    return `<div class="nassau-press-line">
      <div class="nassau-line-title">${_esc(label)}</div>
      <div class="nassau-line-run">${_esc(this.nassauRunText(seg, holeNumber, teamA, teamB))}</div>
      <div>${_esc(this.nassauThisHole(seg, holeNumber, teamA, teamB))}</div>
    </div>`;
  },

  nassauBoardHtml(state, boardId) {
    if (!this.isNassauOn(state)) return '';
    return `<div class="nassau-board" id="${boardId || 'nassau-board'}">${this.nassauBoardInner(state)}</div>`;
  },

  nassauLiveDockHtml(state, holeNumber) {
    if (!this.isNassauOn(state)) return '';
    const hn = Number(holeNumber) || this.currentHole || 1;
    return `<div class="nassau-live-dock" id="nassau-live-dock">
      ${this.nassauPressButtonsHtml(state, hn)}
      ${this.nassauBoardHtml(state)}
    </div>`;
  },

  nassauBoardInner(state) {
    const n = state && state.sideGames && state.sideGames.games && state.sideGames.games.nassau;
    if (!n || !n.front) {
      return '<div class="nassau-original">Nassau RUNNING — need two teams</div>';
    }
    const hn = this.currentHole || 1;
    const presses = this.nassauPresses(state);
    const counts = ['front', 'back', 'overall'].map((seg) => {
      const c = this.nassauPressCount(state, seg);
      const label = seg === 'front' ? 'F' : seg === 'back' ? 'B' : 'O';
      return c ? `${label}${c}` : null;
    }).filter(Boolean);
    const badge = counts.length
      ? `<div class="nassau-press-badge">${counts.join(' · ')} live press${presses.length === 1 ? '' : 'es'}</div>`
      : '';
    const original = ['front', 'back', 'overall'].map((seg) =>
      this.nassauLineHtml(`Original ${this.nassauSegLabel(seg)}`, n[seg], hn, n.teamA, n.teamB)
    ).join('');
    const pressLines = presses.map((p, i) =>
      this.nassauLineHtml(
        `Press ${i + 1} ${this.nassauSegLabel(p.segment)} H${p.startHole}–${p.endHole}`,
        p,
        hn,
        p.teamA || n.teamA,
        p.teamB || n.teamB
      )
    ).join('');
    return `${badge}${original}${pressLines}`;
  },

  nassauPressButtonsHtml(state, holeNumber, wrapId) {
    if (!this.isNassauOn(state)) return '';
    const hn = Number(holeNumber) || this.currentHole || 1;
    return `<div class="nassau-press-wrap" id="${wrapId || 'nassau-press-wrap'}">
      <div class="nassau-press-heading">Nassau Press</div>
      <div class="nassau-press-btns">${this.nassauSegmentsForHole(hn).map((seg) => {
        const c = this.nassauPressCount(state, seg.key);
        const disabled = seg.enabled === false ? ' disabled' : '';
        return `<button type="button" class="nassau-press-btn" data-nassau-press="${seg.key}" data-nassau-hole="${hn}"${disabled} onclick="scorecard.pressNassauFromHole(${hn}, '${seg.key}')" aria-label="Press Nassau ${seg.label} from hole ${hn}">Press ${seg.label}${c ? ` <span class="nassau-press-count">${c}</span>` : ''}<span class="nassau-press-hint">${_esc(seg.hint || '')}</span></button>`;
      }).join('')}</div>
    </div>`;
  },

  async pressNassauFromHole(holeNumber, segment) {
    if (!this.state || !this.isNassauOn(this.state)) return;
    const hn = Number(holeNumber) || this.currentHole || 1;
    const seg = this.nassauSegmentsForHole(hn).find((s) => s.key === segment);
    if (seg && seg.enabled === false) {
      _toast(seg.hint || 'That Nassau segment is not open on this hole.', 'error');
      return;
    }
    const startHole = seg && seg.start != null ? Number(seg.start) : (segment === 'back' && hn < 10 ? 10 : hn);
    const endHole = segment === 'front' ? 9 : 18;
    try {
      const state = await svcApi('post', `/api/rounds/${this.state.round.id}/presses`, {
        gameKey: 'nassau',
        segment,
        startHole,
        endHole,
      });
      this.state = state;
      this.writeCache(state.round.id, state);
      if (this.screen === 'play') this.paintPressChrome();
      else this.draw(state);
    } catch (err) {
      _toast(err.message, 'error');
    }
  },

  async pressVegasFromHole(holeNumber) {
    if (!this.state || !this.isVegasOn(this.state)) return;
    try {
      const state = await svcApi('post', `/api/rounds/${this.state.round.id}/presses`, {
        gameKey: 'vegas',
        startHole: holeNumber,
        endHole: 18,
      });
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) {
      _toast(err.message, 'error');
    }
  },

  isNinesOn(state) {
    if (!state) return false;
    const cfg = this.sideConfig(state);
    if (cfg && cfg.nines && this.flagOn(cfg.nines.on)) return true;
    const games = state.sideGames && state.sideGames.games;
    return !!(games && games.nines);
  },

  ninesGame(state) {
    return state && state.sideGames && state.sideGames.games && state.sideGames.games.nines;
  },

  ninesBoardHtml(state) {
    if (!this.isNinesOn(state)) return '';
    return `<div class="nines-board" id="nines-board">${this.ninesBoardInner(state)}</div>`;
  },

  ninesPtsLine(players, key) {
    return (players || []).map((p) => {
      const val = p[key];
      return `${p.name} ${val == null ? '—' : val}`;
    }).join(' · ');
  },

  ninesPointGet(map, playerId) {
    if (!map || typeof map !== 'object') return null;
    const keys = [playerId, String(playerId)];
    const asNum = Number(playerId);
    if (Number.isFinite(asNum)) keys.push(asNum);
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
      const val = map[key];
      if (val == null || !Number.isFinite(Number(val))) continue;
      return Number(val);
    }
    return null;
  },

  ninesPointMap(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [key, val] of Object.entries(raw)) {
      if (val == null || !Number.isFinite(Number(val))) continue;
      out[String(key)] = Number(val);
    }
    return out;
  },

  ninesHolePointsLive(three, blitz) {
    const scored = (three || []).filter((p) => p.score != null && Number.isFinite(Number(p.score)));
    if (scored.length !== 3) return null;
    const sorted = [...scored].sort((a, b) => Number(a.score) - Number(b.score) || String(a.id).localeCompare(String(b.id)));
    const [a, b, c] = sorted;
    const sa = Number(a.score);
    const sb = Number(b.score);
    const sc = Number(c.score);
    const out = {};
    if (blitz && sa <= sb - 2) {
      out[a.id] = 9;
      out[b.id] = 0;
      out[c.id] = 0;
      return out;
    }
    if (sa === sb && sb === sc) {
      out[a.id] = 3;
      out[b.id] = 3;
      out[c.id] = 3;
      return out;
    }
    if (sa === sb) {
      out[a.id] = 4;
      out[b.id] = 4;
      out[c.id] = 1;
      return out;
    }
    if (sb === sc) {
      out[a.id] = 5;
      out[b.id] = 2;
      out[c.id] = 2;
      return out;
    }
    out[a.id] = 5;
    out[b.id] = 3;
    out[c.id] = 1;
    return out;
  },

  ninesThree(state) {
    const members = (state && state.members) || [];
    const g = this.ninesGame(state);
    if (g && g.points && g.points.length === 3) {
      return g.points.map((p) => {
        const found = members.find((m) => String(m.id) === String(p.id));
        return found || { id: p.id, display_name: p.name, name: p.name, holes: [] };
      });
    }
    return members.length === 3 ? members : null;
  },

  ninesLiveScore(member, holeNumber, mode, three, state) {
    const hs = ((member && member.holes) || []).find((h) => Number(h.holeNumber ?? h.hole_number) === Number(holeNumber));
    if (!hs || hs.gross == null || hs.gross === '') return null;
    const gross = Number(hs.gross);
    if (!Number.isFinite(gross)) return null;
    if (mode !== 'net') return gross;
    const hcpOf = (m) => Number(m.playing_handicap ?? m.playingHandicap ?? m.handicap ?? 0) || 0;
    const low = Math.min(...(three || []).map(hcpOf));
    const rel = hcpOf(member) - low;
    const hole = this.holeMeta(state, holeNumber);
    const si = Number((hole && (hole.stroke_index ?? hole.strokeIndex)) || hs.strokeIndex || hs.stroke_index) || 1;
    const base = Math.floor(rel / 18);
    const rem = rel % 18;
    const extra = (!(rem === 0 && rel !== 0) && si <= rem) ? 1 : 0;
    return gross - (base + extra);
  },

  ninesComputeLedger(state) {
    const three = this.ninesThree(state);
    const cfg = ((this.sideConfig(state) || {}).nines) || {};
    const mode = cfg.scoring === 'gross' ? 'gross' : 'net';
    const blitz = cfg.blitz !== false;
    const course = (state && state.holes) || [];
    const list = course.length
      ? course.map((h) => Number(h.hole_number ?? h.holeNumber)).filter((n) => Number.isFinite(n))
      : Array.from({ length: 18 }, (_, i) => i + 1);
    const serverHoles = ((this.ninesGame(state) || {}).holes) || [];
    const totals = new Map();
    if (three) three.forEach((m) => totals.set(String(m.id), 0));
    const rows = [];
    for (const hn of list) {
      let pts = null;
      if (three) {
        const keyed = three.map((m) => ({
          id: m.id,
          score: this.ninesLiveScore(m, hn, mode, three, state),
        }));
        pts = this.ninesHolePointsLive(keyed, blitz);
      }
      const serverRow = serverHoles.find((h) => Number(h.holeNumber ?? h.hole_number) === Number(hn));
      if (!pts && serverRow && !serverRow.incomplete && serverRow.points) pts = serverRow.points;
      const map = this.ninesPointMap(pts);
      if (!Object.keys(map).length) {
        rows.push({
          holeNumber: hn,
          incomplete: true,
          points: null,
          running: Object.fromEntries(totals),
        });
        continue;
      }
      const ids = three ? three.map((m) => m.id) : Object.keys(map);
      for (const id of ids) {
        const add = this.ninesPointGet(map, id) ?? 0;
        totals.set(String(id), (totals.get(String(id)) || 0) + add);
      }
      rows.push({
        holeNumber: hn,
        incomplete: false,
        points: map,
        running: Object.fromEntries(totals),
      });
    }
    return { three, holes: rows };
  },

  ninesLedgerFor(state) {
    if (!state) return { three: null, holes: [] };
    if (this._ninesLedger && this._ninesLedgerState === state) return this._ninesLedger;
    this._ninesLedgerState = state;
    this._ninesLedger = this.ninesComputeLedger(state);
    return this._ninesLedger;
  },

  ninesHoleValue(game, holeNumber, playerId, state) {
    const ledger = this.ninesLedgerFor(state || this.state);
    const live = (ledger.holes || []).find((h) => Number(h.holeNumber) === Number(holeNumber));
    if (live && !live.incomplete) {
      const fromLive = this.ninesPointGet(live.points, playerId);
      if (fromLive != null) return fromLive;
    }
    const row = ((game && game.holes) || []).find((h) => Number(h.holeNumber ?? h.hole_number) === Number(holeNumber));
    if (row && row.players) {
      const found = row.players.find((p) => String(p.id) === String(playerId));
      if (found && found.hole != null && Number.isFinite(Number(found.hole))) return Number(found.hole);
    }
    if (!row || row.incomplete || !row.points) return null;
    return this.ninesPointGet(row.points, playerId);
  },

  ninesRunningThrough(game, holeNumber, playerId, state) {
    const ledger = this.ninesLedgerFor(state || this.state);
    const cap = Number(holeNumber);
    let sum = 0;
    let seen = false;
    for (const h of ledger.holes || []) {
      const hn = Number(h.holeNumber);
      if (!Number.isFinite(hn) || (Number.isFinite(cap) && hn > cap)) continue;
      if (h.incomplete || !h.points) continue;
      const add = this.ninesPointGet(h.points, playerId);
      if (add == null) continue;
      sum += add;
      seen = true;
    }
    if (seen) return sum;
    const liveRow = (ledger.holes || []).find((h) => Number(h.holeNumber) === Number(holeNumber));
    if (liveRow && liveRow.running) {
      const fromRun = this.ninesPointGet(liveRow.running, playerId);
      if (fromRun != null) return fromRun;
    }
    let serverSum = 0;
    let serverSeen = false;
    for (const h of (game && game.holes) || []) {
      const hn = Number(h.holeNumber ?? h.hole_number);
      if (!Number.isFinite(hn) || (Number.isFinite(cap) && hn > cap)) continue;
      if (h.incomplete || !h.points) continue;
      const add = this.ninesPointGet(h.points, playerId);
      if (add == null) continue;
      serverSum += add;
      serverSeen = true;
    }
    if (serverSeen) return serverSum;
    const row = ((game && game.holes) || []).find((h) => Number(h.holeNumber ?? h.hole_number) === Number(holeNumber));
    if (row && row.running) {
      const fromRow = this.ninesPointGet(row.running, playerId);
      if (fromRow != null) return fromRow;
    }
    if (row && row.players) {
      const found = row.players.find((p) => String(p.id) === String(playerId));
      if (found && found.run != null && Number.isFinite(Number(found.run))) return Number(found.run);
    }
    return null;
  },

  ninesRoster(game, state) {
    const ledger = this.ninesLedgerFor(state || this.state);
    if (ledger.three && ledger.three.length) {
      return ledger.three.map((m) => ({
        id: m.id,
        name: m.display_name || m.name,
      }));
    }
    if (game && game.points && game.points.length) return game.points;
    const first = ((game && game.holes) || []).find((h) => h.players && h.players.length);
    return (first && first.players) || [];
  },

  ninesBoardInner(state) {
    const g = this.ninesGame(state);
    if (!g) return this.isNinesOn(state) ? '<div class="nines-hole">Nines —</div>' : '';
    if (g.incomplete && !this.ninesThree(state)) return '<div class="nines-hole">Nines — need exactly 3 players</div>';
    const hn = this.currentHole || 1;
    const roster = this.ninesRoster(g, state);
    const holeLine = this.ninesPtsLine(roster.map((p) => ({
      name: p.name,
      hole: this.ninesHoleValue(g, hn, p.id, state),
    })), 'hole');
    const runLine = this.ninesPtsLine(roster.map((p) => ({
      name: p.name,
      run: this.ninesRunningThrough(g, hn, p.id, state),
    })), 'run');
    return `<div class="nines-hole">This hole: ${_esc(holeLine)}</div>
      <div class="nines-run">RUNNING: ${_esc(runLine)}</div>`;
  },

  ninesTableRows(state, holes, showOut, showIn) {
    if (!this.isNinesOn(state)) return '';
    const g = this.ninesGame(state);
    if (g && g.incomplete && !this.ninesThree(state)) return '';
    return (state.members || []).map((m) => this.onePlayerNinesRows(state, m, holes, showOut, showIn)).join('');
  },

  onePlayerNinesRows(state, member, holes, showOut, showIn) {
    if (!this.isNinesOn(state) || !member) return '';
    const g = this.ninesGame(state);
    if (g && g.incomplete && !this.ninesThree(state)) return '';
    const cell = (hn, kind) => {
      const val = kind === 'hole'
        ? this.ninesHoleValue(g, hn, member.id, state)
        : this.ninesRunningThrough(g, hn, member.id, state);
      return `<td class="nines-cell" data-nines-${kind}="${member.id}:${hn}">${val == null ? '—' : val}</td>`;
    };
    const holeRow = (holes || []).map((h) => cell(h.hole_number, 'hole')).join('');
    const runRow = (holes || []).map((h) => cell(h.hole_number, 'run')).join('');
    const runOut = showOut ? this.ninesRunningThrough(g, 9, member.id, state) : null;
    const runIn = showIn ? this.ninesRunningThrough(g, 18, member.id, state) : null;
    const pad = `${showOut ? `<td class="sc-total">${runOut == null ? '' : runOut}</td>` : ''}${showIn ? `<td class="sc-total"></td><td class="sc-total">${runIn == null ? '' : runIn}</td>` : ''}`;
    const holePad = `${showOut ? '<td></td>' : ''}${showIn ? '<td></td><td></td>' : ''}`;
    const name = _esc(member.display_name || member.name || '');
    return `<tr class="nines-hole-row nines-player-hole-row" data-nines-hole-member="${member.id}"><td class="row-label">${name} nines</td>${holeRow}${holePad}</tr>
      <tr class="nines-run-row nines-player-run-row" data-nines-run-member="${member.id}"><td class="row-label">${name} run</td>${runRow}${pad}</tr>`;
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
    if (this.isWolfOn(state)) return this.wolfRoster(state);
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
        <p class="card-subtitle">Name, HCP, then Team 1 / Team 2 / Team 3. Add team for Team 4+. Auto-balance is only a helper.</p>
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

  addTeamNames(state) {
    const names = new Set(['Team 1', 'Team 2', 'Team 3']);
    for (const team of (state && state.teams) || []) {
      if (team && team.name) names.add(team.name);
    }
    for (const extra of (this.addPlayerDraft && this.addPlayerDraft.extraTeams) || []) {
      if (extra) names.add(extra);
    }
    return [...names].sort((a, b) => {
      const na = Number((a.match(/(\d+)/) || [])[1] || 99);
      const nb = Number((b.match(/(\d+)/) || [])[1] || 99);
      return na - nb || a.localeCompare(b);
    });
  },

  nextAddTeamName(state) {
    const used = new Set(this.addTeamNames(state));
    let n = 4;
    while (used.has('Team ' + n) && n < 20) n += 1;
    return 'Team ' + n;
  },

  addTeamChipsHtml(selected) {
    const current = selected || 'Team 1';
    const names = this.addTeamNames(this.state);
    return `<div class="add-team-picks" role="group" aria-label="Team">
      ${names.map((n) => {
        const team = ((this.state && this.state.teams) || []).find((t) => t.name === n);
        const label = team ? this.teamDisplay(team) : n;
        return `<button type="button" class="add-team-chip${current === n ? ' is-on' : ''}" data-team-name="${n}">${_esc(label)}</button>`;
      }).join('')}
      <button type="button" class="add-team-more" id="add-extra-team">Add team</button>
      <input type="hidden" id="live-add-guest-team" value="${_esc(current)}">
    </div>`;
  },

  addExtraTeam() {
    this.snapshotAddPlayer();
    const name = this.nextAddTeamName(this.state);
    if (!this.addPlayerDraft) this.addPlayerDraft = { name: '', handicap: '', teamName: name, extraTeams: [] };
    const extras = this.addPlayerDraft.extraTeams || [];
    if (!extras.includes(name)) extras.push(name);
    this.addPlayerDraft.extraTeams = extras;
    this.addPlayerDraft.teamName = name;
    this.mountAddPlayerPanel();
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
      extraTeams: prev.extraTeams || [],
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
    const addTeam = document.getElementById('add-extra-team');
    if (addTeam) {
      addTeam.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.addExtraTeam();
      };
    }
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
    return team ? this.teamDisplay(team) : '—';
  },

  teamDisplay(team) {
    if (!team) return '—';
    if (team.displayName) return team.displayName;
    const nick = (team.nickname || '').trim();
    return nick ? `${team.name} · ${nick}` : (team.name || '—');
  },

  commitScore(memberId, holeNumber, gross) {
    if (!this.state) return;
    const member = (this.state.members || []).find((m) => Number(m.id) === Number(memberId));
    if (!this.canWriteMember(this.state, member)) {
      this.showWriteError('You can only enter scores for your own team.');
      return;
    }
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
        this.paintNinesBoard();
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

  readGrossTyping(previousPending, fieldValue, insertedDigit) {
    let raw = String(fieldValue == null ? '' : fieldValue).replace(/\D/g, '');
    const prev = String(previousPending == null ? '' : previousPending).replace(/\D/g, '');
    const ins = String(insertedDigit == null ? '' : insertedDigit).replace(/\D/g, '');
    if (raw.length <= 1 && prev.length === 1 && ins.length === 1) {
      const pair = (prev + ins).slice(0, 2);
      const n = Number(pair);
      if (n >= 10 && n <= 19) raw = pair;
    }
    raw = raw.slice(0, 2);
    if (!raw) return { raw: '', value: null, complete: false };
    const n = Number(raw);
    if (!Number.isInteger(n)) return { raw: '', value: null, complete: false };
    if (n > 19) return { raw: '', value: null, complete: false, overflow: true };
    if (n >= 10 && n <= 19) return { raw, value: n, complete: true };
    if (n >= 2 && n <= 9) return { raw, value: n, complete: true };
    if (n === 1) return { raw: '1', value: 1, complete: false };
    return { raw: '', value: null, complete: false };
  },

  onScoreInput(e) {
    if (this.shouldHoldAddPlayer()) return;
    const input = e.target;
    const inserted = (e.inputType === 'insertText' || e.inputType === 'insertCompositionText')
      ? (e.data != null ? String(e.data) : '')
      : '';
    const parsed = this.readGrossTyping(input.dataset.pending, input.value, inserted);
    input.dataset.pending = parsed.raw;
    input.value = parsed.raw;
    try { input.setSelectionRange(parsed.raw.length, parsed.raw.length); } catch { /* ignore */ }
    if (this._oneTimer) {
      clearTimeout(this._oneTimer);
      this._oneTimer = null;
    }
    if (parsed.overflow) {
      this.showWriteError('Gross must be 1–19.');
      input.value = '';
      input.dataset.pending = '';
      return;
    }
    if (parsed.raw === '') return;
    if (parsed.complete && parsed.value != null) {
      this.commitTyped(input, parsed.value, true);
      return;
    }
    if (parsed.value === 1) {
      this._oneTimer = setTimeout(() => {
        if (input.value === '1' && (input.dataset.pending || '1') === '1') {
          this.commitTyped(input, 1, true);
        }
      }, this.ONE_DIGIT_MS);
    }
  },

  onScoreBlur(e) {
    if (this.shouldHoldAddPlayer()) return;
    const input = e.target;
    if (this._oneTimer) {
      clearTimeout(this._oneTimer);
      this._oneTimer = null;
    }
    const parsed = this.readGrossTyping(input.dataset.pending, input.value, '');
    input.dataset.pending = parsed.raw;
    const raw = parsed.raw;
    if (raw === '') {
      const member = this.state && this.state.members.find((m) => m.id === Number(input.dataset.member));
      const hs = member && (member.holes || []).find((h) => h.holeNumber === Number(input.dataset.hole));
      if (hs && hs.gross != null) this.commitTyped(input, null, false);
      return;
    }
    if (parsed.overflow) {
      this.showWriteError('Gross must be 1–19.');
      return;
    }
    const n = parsed.value;
    if (Number.isInteger(n) && n >= 1 && n <= 19) {
      if (!input.dataset.committed || Number(input.dataset.committed) !== n) {
        this.commitTyped(input, n, false);
      }
    } else {
      this.showWriteError('Gross must be 1–19.');
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
    input.dataset.pending = gross == null ? '' : String(gross);
    if (gross != null) input.value = String(gross);
    this.focusCell = { memberId, holeNumber };
    this.currentHole = holeNumber;
    this.commitScore(memberId, holeNumber, gross);
    this.paintCurrentHoleChrome();
    if (advance) this.focusNextHole(memberId, holeNumber);
  },

  loadScoreAdvance() {
    try {
      const raw = localStorage.getItem(this.SCORE_ADVANCE_KEY);
      if (raw === 'across' || raw === 'down') this.scoreAdvance = raw;
    } catch { /* keep default */ }
    return this.scoreAdvance === 'across' ? 'across' : 'down';
  },

  setScoreAdvance(mode) {
    this.scoreAdvance = mode === 'across' ? 'across' : 'down';
    try { localStorage.setItem(this.SCORE_ADVANCE_KEY, this.scoreAdvance); } catch { /* ignore */ }
    document.querySelectorAll('[data-score-advance]').forEach((btn) => {
      btn.classList.toggle('is-on', btn.getAttribute('data-score-advance') === this.scoreAdvance);
    });
  },

  advanceToggleHtml() {
    const mode = this.loadScoreAdvance();
    return `<div class="score-advance" id="score-advance" role="group" aria-label="Score entry direction">
      <button type="button" class="score-advance-btn${mode === 'down' ? ' is-on' : ''}" data-score-advance="down" onclick="scorecard.setScoreAdvance('down')">Down</button>
      <button type="button" class="score-advance-btn${mode === 'across' ? ' is-on' : ''}" data-score-advance="across" onclick="scorecard.setScoreAdvance('across')">Across</button>
    </div>`;
  },

  focusNextHole(memberId, holeNumber) {
    const across = this.loadScoreAdvance() === 'across';
    if (!across) {
      const rows = this.isHoleView()
        ? Array.from(document.querySelectorAll('#hole-players .hole-player-row'))
        : Array.from(document.querySelectorAll('tr.row-player'));
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
    if (this.isHoleView()) {
      this.retargetHoleView(this.currentHole);
      for (const member of this.state.members || []) this.paintScoreCell(member.id, this.currentHole);
    }
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
    this.paintPressChrome();
    this.paintNinesBoard();
    this.paintVegasBoard();
  },

  paintNinesBoard() {
    const el = document.getElementById('nines-board');
    if (el && this.state) el.innerHTML = this.ninesBoardInner(this.state);
    this.paintNinesTableRows();
    this.paintNinesPlayerLines();
  },

  paintNinesTableRows() {
    const table = document.getElementById('full-scorecard');
    if (!table || !this.state) return;
    const holes = this.state.holes || [];
    const showOut = this.showOut(this.state);
    const showIn = this.showIn(this.state);
    (this.state.members || []).forEach((member) => {
      const html = this.onePlayerNinesRows(this.state, member, holes, showOut, showIn);
      const oldHole = table.querySelector(`tr[data-nines-hole-member="${member.id}"]`);
      const oldRun = table.querySelector(`tr[data-nines-run-member="${member.id}"]`);
      if (!html) {
        if (oldHole) oldHole.remove();
        if (oldRun) oldRun.remove();
        return;
      }
      const tmp = document.createElement('tbody');
      tmp.innerHTML = html;
      const nextHole = tmp.querySelector('tr.nines-player-hole-row');
      const nextRun = tmp.querySelector('tr.nines-player-run-row');
      const player = table.querySelector(`tr.row-player[data-member-row="${member.id}"]`);
      if (oldHole && nextHole) oldHole.replaceWith(nextHole);
      else if (nextHole && player) player.insertAdjacentElement('afterend', nextHole);
      else if (nextHole) (table.tBodies[0] || table).appendChild(nextHole);
      const holeNow = table.querySelector(`tr[data-nines-hole-member="${member.id}"]`);
      if (oldRun && nextRun) oldRun.replaceWith(nextRun);
      else if (nextRun && holeNow) holeNow.insertAdjacentElement('afterend', nextRun);
      else if (nextRun && player) player.insertAdjacentElement('afterend', nextRun);
    });
    table.querySelectorAll('tr.nines-hole-row:not(.nines-player-hole-row), tr.nines-run-row:not(.nines-player-run-row)').forEach((el) => el.remove());
  },

  paintNinesPlayerLines() {
    if (!this.state) return;
    const hn = this.currentHole || 1;
    document.querySelectorAll('.hole-player-row').forEach((row) => {
      const member = (this.state.members || []).find((m) => String(m.id) === String(row.dataset.memberRow));
      if (!member) return;
      const html = this.playerNinesLineHtml(this.state, member, hn);
      const line = row.querySelector('.nines-player-stack, .nines-player-line');
      if (!html) {
        if (line) line.remove();
        return;
      }
      if (line) line.outerHTML = html;
      else row.insertAdjacentHTML('beforeend', html);
    });
  },

  paintVegasBoard() {
    const el = document.getElementById('vegas-board');
    if (el && this.state) el.innerHTML = this.vegasBoardInner(this.state);
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
    if (!this.canWriteMember(this.state, member)) {
      this.showWriteError('You can only enter scores for your own team.');
      return;
    }
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
    if (!this.canWriteMember(this.state, member)) {
      const writable = (this.state.members || []).find((m) => this.canWriteMember(this.state, m));
      if (!writable) {
        this.showWriteError('You can only enter scores for your own team.');
        return;
      }
      this.openEditor(this.state.round.id, writable.id, focus.holeNumber || this.currentHole, writable.display_name,
        ((writable.holes || []).find((h) => h.holeNumber === (focus.holeNumber || this.currentHole)) || {}).gross ?? null,
        this.holeMeta(this.state, focus.holeNumber || this.currentHole).par);
      return;
    }
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
    this._ninesLedger = null;
    this.paintTeamHole(slim.holeNumber);
    this.paintRaceStrip();
    this.paintBallLine(slim.holeNumber);
    this.paintEndTotals();
    this.paintPlayerTotals();
    this.paintNinesBoard();
    this.paintPressChrome();
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
    const user = typeof auth !== 'undefined' && auth.currentUser;
    if (!user || !state || !state.round) return false;
    const uid = Number(user.id);
    if (Number(state.round.organizer_id ?? state.round.organizerId) === uid) return true;
    return (state.members || []).some((m) => Number(m.player_id) === uid && m.role === 'organizer');
  },

  myMember(state) {
    const user = typeof auth !== 'undefined' && auth.currentUser;
    if (!user || !state) return null;
    return (state.members || []).find((m) => Number(m.player_id) === Number(user.id)) || null;
  },

  sameTeamIds(a, b) {
    if (a == null || b == null || a === '') return false;
    return Number(a) === Number(b) && Number.isFinite(Number(a));
  },

  canWriteMember(state, member) {
    if (!state || !member) return false;
    // Wolf sides are not Team 1/2 — anyone on the live card can type gross now.
    if (this.isWolfOn(state)) return true;
    const user = typeof auth !== 'undefined' && auth.currentUser;
    if (user && user.is_admin) return true;
    if (this.isOrganizer(state)) return true;
    const me = this.myMember(state);
    if (this.sameTeamIds(me && (me.team_id ?? me.teamId), member.team_id ?? member.teamId)) return true;
    return false;
  },

  onAuthReady() {
    if (!this.state || this.screen !== 'play') return;
    document.querySelectorAll('input.score-input[data-member]').forEach((input) => {
      const member = (this.state.members || []).find((m) => String(m.id) === String(input.dataset.member));
      const writable = this.canWriteMember(this.state, member);
      input.disabled = !writable;
      const cell = input.closest('[data-score-cell]');
      if (cell) cell.classList.toggle('is-readonly', !writable);
      const row = input.closest('.hole-player-row, tr.row-player');
      if (row) row.classList.toggle('is-readonly', !writable);
    });
  },

  focusHoleScore(memberId, holeNumber, ev) {
    if (ev && ev.target && ev.target.classList && ev.target.classList.contains('score-input')) return;
    const input = document.querySelector(`input.score-input[data-member="${memberId}"][data-hole="${holeNumber}"]`);
    if (input && !input.disabled) {
      input.focus();
      return;
    }
    if (input) this.openEditorFromInput(input);
  },

  scoreInputDisabled(state, member) {
    return !this.canWriteMember(state, member);
  },

  wolfRoster(state) {
    return [...(state.members || [])];
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
      if (window.wyrmCoil && typeof window.wyrmCoil.onNineteenthDrawn === 'function') {
        window.wyrmCoil.onNineteenthDrawn(state);
      }
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
      return balls ? `${this.teamDisplay(team)} ${balls}` : '';
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

  shortRaceTitle(round) {
    const tf = window.teamFormats;
    if (tf && typeof tf.shortFormatLabel === 'function') {
      return tf.shortFormatLabel(round.gross_balls ?? round.grossBalls, round.net_balls ?? round.netBalls);
    }
    return '1G+2N';
  },

  liveGameTitle(state) {
    const bits = [];
    if (this.isTeamRaceOn(state) && state && state.round && state.round.format !== 'match_play') {
      bits.push('Sunday game · ' + this.shortRaceTitle(state.round));
    }
    const cfg = this.sideConfig(state);
    const labels = [
      ['vegas', 'Vegas'],
      ['wolf', 'Wolf'],
      ['nassau', 'Nassau'],
      ['nines', 'Nines'],
      ['skins', 'Skins'],
    ];
    for (const [key, label] of labels) {
      if (cfg[key] && this.flagOn(cfg[key].on)) bits.push(label);
    }
    return bits.join(' + ') || 'Scorecard';
  },

  liveGameTitleHtml(state) {
    return `<div class="live-game-title" id="live-game-title">${_esc(this.liveGameTitle(state))}</div>`;
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
    const fromSide = state && state.sideGames && state.sideGames.config;
    if (fromSide && typeof fromSide === 'object' && !Array.isArray(fromSide) && (fromSide.nassau || fromSide.vegas || fromSide.wolf || fromSide.nines || fromSide.skins)) {
      return fromSide;
    }
    const raw = state && state.round && (state.round.sideGames || state.round.side_games);
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch { /* ignore */ }
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
    return fromSide || {};
  },

  pressableGames(state) {
    const cfg = this.sideConfig(state);
    const defs = (window.sideGames && window.sideGames.SIDE_GAMES) || [];
    return defs.filter((g) => g.pressable && cfg[g.key] && this.flagOn(cfg[g.key].on));
  },

  async confirmPress() {
    if (!this.state) return;
    const games = this.pressableGames(this.state).filter((g) => g.key !== 'vegas');
    if (!games.length) {
      _toast('Use the Vegas Press control to add a running game. Turn on Nassau, Wolf, or Nines to press those.', 'error');
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
          ...(hole <= 9 ? [{ value: 'front', label: 'Front 1–9 (dies at 9)' }] : []),
          ...(hole >= 10 ? [{ value: 'back', label: 'Back 10–18 (dies at 18)' }] : []),
          { value: 'overall', label: 'Overall tap→18' },
        ],
        value: hole <= 9 ? 'front' : 'back',
      });
    }
    const values = await _formPrompt({ title: 'Press from hole ' + hole, submitLabel: 'Press', fields });
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

  async setWolfPick(holeNumber, payload) {
    if (!this.state) return;
    const wolf = this.wolfForHole(this.state, holeNumber);
    if (!wolf) return;
    const body = (payload && typeof payload === 'object')
      ? payload
      : { partnerId: payload, lone: arguments[2] };
    try {
      const state = await svcApi('put', `/api/rounds/${this.state.round.id}/wolf/${holeNumber}`, {
        wolfMemberId: wolf.id,
        partnerMemberId: body.lone || body.blind ? null : body.partnerId,
        lone: !!(body.lone || body.blind),
        blind: !!body.blind,
        passedIds: body.passedIds || [],
        locked: body.locked !== false && !!(body.lone || body.blind || body.partnerId),
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

  wolfPickFor(state, holeNumber) {
    return (state.wolfPicks || []).find((p) => Number(p.hole_number || p.holeNumber) === Number(holeNumber)) || null;
  },

  wolfPassedIds(pick) {
    const raw = pick && (pick.passed_ids || pick.passedIds);
    if (Array.isArray(raw)) return raw.map(Number);
    if (typeof raw === 'string' && raw.trim()) {
      try { return JSON.parse(raw).map(Number); } catch { return []; }
    }
    return [];
  },

  wolfFlag(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  },

  wolfLocked(pick) {
    if (!pick) return false;
    if (this.wolfFlag(pick.locked)) return true;
    if (this.wolfFlag(pick.blind) || this.wolfFlag(pick.lone) || this.wolfFlag(pick.lone_wolf)) return true;
    if (pick.partner_member_id || pick.partnerMemberId) return true;
    return false;
  },

  wolfHoldsScoring(state, holeNumber) {
    if (!this.isWolfOn(state)) return false;
    return !this.wolfLocked(this.wolfPickFor(state, holeNumber));
  },

  wolfOthers(state, holeNumber) {
    const wolf = this.wolfForHole(state, holeNumber);
    return [...(state.members || [])]
      .filter((m) => wolf && m.id !== wolf.id)
      .sort((a, b) => a.id - b.id);
  },

  wolfSides(state, holeNumber) {
    const wolf = this.wolfForHole(state, holeNumber);
    const pick = this.wolfPickFor(state, holeNumber);
    if (!wolf || !this.wolfLocked(pick)) return null;
    const partnerId = pick && (pick.partner_member_id || pick.partnerMemberId);
    const wolfSide = [wolf].concat((state.members || []).filter((m) => Number(m.id) === Number(partnerId)));
    const field = (state.members || []).filter((m) => m.id !== wolf.id && Number(m.id) !== Number(partnerId));
    const blind = !!(pick && pick.blind);
    const lone = !partnerId;
    return { wolf, partnerId, wolfSide, field, blind, lone };
  },

  wolfPass(holeNumber, memberId) {
    const pick = this.wolfPickFor(this.state, holeNumber);
    const passed = this.wolfPassedIds(pick);
    if (!passed.includes(Number(memberId))) passed.push(Number(memberId));
    this.setWolfPick(holeNumber, { passedIds: passed, locked: false });
  },

  wolfPointValues(state) {
    const cfg = this.sideConfig(state).wolf || {};
    const n = (v, fallback) => {
      const x = Number(v);
      return Number.isFinite(x) && x > 0 ? x : fallback;
    };
    return {
      partnered: n(cfg.partnered, 1),
      lone: n(cfg.lone, 2),
      blind: n(cfg.blind, 4),
    };
  },

  wolfBarHtml(state, holeNumber) {
    const cfg = this.sideConfig(state);
    if (!cfg.wolf || !cfg.wolf.on) return '';
    const wolf = this.wolfForHole(state, holeNumber);
    if (!wolf) return '';
    const pick = this.wolfPickFor(state, holeNumber);
    const sides = this.wolfSides(state, holeNumber);
    if (sides) {
      const wolfNames = sides.wolfSide.map((m) => m.display_name).join(' + ');
      const fieldNames = sides.field.map((m) => m.display_name).join(' / ') || 'field';
      const vals = this.wolfPointValues(state);
      const kind = sides.blind
        ? `Blind Lone Wolf ±${vals.blind}`
        : (sides.lone ? `Lone Wolf ±${vals.lone}` : `Wolf + partner ±${vals.partnered}`);
      return `<div class="wolf-bar" id="wolf-bar">
        <div class="wolf-badge">Wolf: ${_esc(wolf.display_name)}</div>
        <div class="wolf-sides">${_esc(kind)} · ${_esc(wolfNames)} vs ${_esc(fieldNames)}</div>
      </div>`;
    }
    const passed = this.wolfPassedIds(pick);
    const others = this.wolfOthers(state, holeNumber);
    const current = others.find((m) => !passed.includes(Number(m.id)));
    const canBlind = passed.length === 0;
    const rows = others.map((m) => {
      if (passed.includes(Number(m.id))) {
        return `<div class="wolf-tee is-passed">Passed ${_esc(m.display_name)}</div>`;
      }
      if (current && current.id === m.id) {
        return `<div class="wolf-tee is-up">${_esc(m.display_name)} teed
          <button type="button" class="btn btn-sm btn-accent" onclick="scorecard.setWolfPick(${holeNumber}, { partnerId: ${m.id}, locked: true })">Pick partner</button>
          <button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.wolfPass(${holeNumber}, ${m.id})">Pass</button>
        </div>`;
      }
      return `<div class="wolf-tee">Waiting to tee: ${_esc(m.display_name)}</div>`;
    }).join('');
    return `<div class="wolf-bar" id="wolf-bar">
      <div class="wolf-badge">Wolf: ${_esc(wolf.display_name)}</div>
      <p class="card-subtitle">After each tee, pick that player or pass. Lock Wolf sides before scoring this hole for points — you can still enter gross now. Next hole is a new Wolf.</p>
      ${canBlind ? `<button type="button" class="btn btn-sm btn-accent" onclick="scorecard.setWolfPick(${holeNumber}, { lone: true, blind: true, locked: true })">Blind Lone Wolf ±${this.wolfPointValues(state).blind}</button>` : ''}
      ${rows}
      <button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.setWolfPick(${holeNumber}, { lone: true, locked: true })">Lone Wolf ±${this.wolfPointValues(state).lone}</button>
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
      <p class="card-subtitle">Scores enter once. Every game here reads the same hole scores. Skins default off. ${this.infoTip('side-games', 'Turn on any mix. Sunday game is a separate setup toggle. Side games can run alone.')}</p>
      <label class="check-row"><input type="checkbox" name="skinsOn" ${skinsOn ? 'checked' : ''}> Skins</label>
      <p class="game-rule">${_esc((window.sideGames && window.sideGames.sideGameRule('skins')) || '')}</p>
      <div class="form-group"><label>Skins pot</label><input class="form-input" name="skinsPot" type="number" min="0" step="1" value="${cfg.skins && cfg.skins.pot != null ? cfg.skins.pot : 20}"></div>
      <label class="check-row"><input type="checkbox" name="vegasOn" ${vegasOn ? 'checked' : ''}> Vegas</label>
      <p class="game-rule">${_esc((window.sideGames && window.sideGames.sideGameRule('vegas')) || '')}</p>
      <div class="grid grid-2">
        <div class="form-group"><label>Vegas scoring</label><select class="form-input" name="vegasScoring"><option value="gross" ${cfg.vegas && cfg.vegas.scoring === 'net' ? '' : 'selected'}>Gross</option><option value="net" ${cfg.vegas && cfg.vegas.scoring === 'net' ? 'selected' : ''}>Net</option></select></div>
        <div class="form-group"><label>$ / point</label><input class="form-input" name="vegasDollars" type="number" min="0" step="0.5" value="${cfg.vegas && cfg.vegas.dollarsPerPoint != null ? cfg.vegas.dollarsPerPoint : 1}"></div>
      </div>
      <label class="check-row"><input type="checkbox" name="nassauOn" ${nassauOn ? 'checked' : ''}> Nassau (NASA)</label>
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
        <div class="form-group"><label>Partnered ±</label><input class="form-input" name="wolfPartnered" type="number" min="1" step="1" value="${cfg.wolf && cfg.wolf.partnered != null ? cfg.wolf.partnered : 1}"></div>
        <div class="form-group"><label>Lone ±</label><input class="form-input" name="wolfLone" type="number" min="1" step="1" value="${cfg.wolf && cfg.wolf.lone != null ? cfg.wolf.lone : 2}"></div>
        <div class="form-group"><label>Blind Lone ±</label><input class="form-input" name="wolfBlind" type="number" min="1" step="1" value="${cfg.wolf && cfg.wolf.blind != null ? cfg.wolf.blind : 4}"></div>
      </div>
      <label class="check-row"><input type="checkbox" name="ninesOn" ${ninesOn ? 'checked' : ''}> Nines (3 players)</label>
      <p class="game-rule">${_esc((window.sideGames && window.sideGames.sideGameRule('nines')) || '')}</p>
      <label class="check-row"><input type="checkbox" name="ninesBlitz" ${!cfg.nines || cfg.nines.blitz !== false ? 'checked' : ''}> Blitz 9-0-0</label>
      <div class="grid grid-2">
        <div class="form-group"><label>Nines scoring</label><select class="form-input" name="ninesScoring"><option value="net" ${cfg.nines && cfg.nines.scoring === 'gross' ? '' : 'selected'}>Net</option><option value="gross" ${cfg.nines && cfg.nines.scoring === 'gross' ? 'selected' : ''}>Gross</option></select></div>
        <div class="form-group"><label>$ / point</label><input class="form-input" name="ninesDollars" type="number" min="0" step="0.5" value="${cfg.nines && cfg.nines.dollarsPerPoint != null ? cfg.nines.dollarsPerPoint : 1}"></div>
      </div>
      <label class="check-row"><input type="checkbox" name="birdieSlotsOn" ${!cfg.birdieSlots || cfg.birdieSlots.on !== false ? 'checked' : ''}> Birdie dragon slots ${this.infoTip('slots', 'Fun layer, not team money. Each player’s spins = their own gross + net better than par. Points stay on that player (David 29 · Brian 50 · Matt 60). 19th hole shows the fun board. Longer reel before it settles.')}</label>
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
      wolf: {
        on: fd.get('wolfOn') === 'on',
        scoring: fd.get('wolfScoring') || 'gross',
        dollarsPerPoint: Number(fd.get('wolfDollars') || 1),
        partnered: Number(fd.get('wolfPartnered') || 1),
        lone: Number(fd.get('wolfLone') || 2),
        blind: Number(fd.get('wolfBlind') || 4),
      },
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
    const raceTeams = (state.teams || []).map((t) => `${this.teamDisplay(t)} ${this.fmtTeam(t.total)}`).join(' · ');
    if (this.isTeamRaceOn(state) && raceTeams) {
      blocks.push(`<div class="card"><h3 class="card-title">Sunday game</h3><p>${_esc(raceTeams)}</p></div>`);
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
        <p>${_esc(g.vegas.teamA.name)} ${this.fmtVegasPts(g.vegas.teamA.points)} · ${_esc(g.vegas.teamB.name)} ${this.fmtVegasPts(g.vegas.teamB.points)} <span class="tiny-label">zero-sum</span></p></div>`);
    }
    if (g.nassau && g.nassau.front) {
      const presses = g.nassauPresses || [];
      const pressBits = presses.map((p, i) =>
        `Press ${i + 1} ${this.nassauSegLabel(p.segment)} H${p.startHole}–${p.endHole}: ${p.status}`
      ).join(' · ');
      blocks.push(`<div class="card"><h3 class="card-title">Nassau (NASA)</h3>
        <p>Original · Front ${ _esc(g.nassau.front.status) } · Back ${ _esc(g.nassau.back.status) } · 18 ${ _esc(g.nassau.overall.status) }</p>
        ${pressBits ? `<p>${_esc(pressBits)}</p>` : ''}
        <p class="card-subtitle">Three bets. Presses die at the end of that segment. Original stays live.</p></div>`);
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
      const board = g.birdieSlots.funBoard || (g.birdieSlots.leader ? g.birdieSlots.leader.name + ' ' + g.birdieSlots.leader.points : '');
      blocks.push(`<div class="card"><h3 class="card-title">Wyrm Coil fun board</h3><p>${_esc(board || 'No birdies yet')} · fun only, not team money</p></div>`);
    }
    if (side.stripText) {
      blocks.push(`<div class="card"><h3 class="card-title">All games</h3><p>${_esc(side.stripText)}</p></div>`);
    }
    if (!blocks.length) return '';
    return `<h3 class="section-title">Side games</h3>${blocks.join('')}`;
  },

  raceStripText(state) {
    const extra = state.sideGames && state.sideGames.stripText;
    const vegasBit = this.isVegasOn(state) ? this.vegasStripText(state) : '';
    const extraSansVegas = extra
      ? extra.split(' · ').filter((bit) => !/^Vegas\b/.test(bit)).join(' · ')
      : '';
    if (!this.isTeamRaceOn(state)) {
      return [vegasBit, extraSansVegas].filter(Boolean).join(' · ');
    }
    const teams = state.teams || [];
    if (!teams.length) return [vegasBit, extraSansVegas].filter(Boolean).join(' · ');
    const completed = state.round.status === 'completed';
    const leader = state.winner || teams.find((t) => t.total != null) || teams[0];
    if (completed && leader) {
      const win = `Sunday game ${this.teamDisplay(leader)} wins · ${this.fmtTeam(leader.total)}`;
      return [vegasBit, win, extraSansVegas].filter(Boolean).join(' · ');
    }
    const teamBits = teams.map((t) => {
      let bit = `${this.teamDisplay(t)} ${t.total == null ? '—' : this.fmtTeam(t.total)}`;
      if (leader && leader.total != null && t.total != null && t.id !== leader.id) {
        bit += ` (${this.fmtTeam(t.total - leader.total)})`;
      }
      return bit;
    }).join(' · ');
    return [vegasBit, `Sunday game ${teamBits}`, extraSansVegas].filter(Boolean).join(' · ');
  },

  holePlayerRowHtml(state, member, holeNumber) {
    const hole = this.holeMeta(state, holeNumber);
    const hs = (member.holes || []).find((x) => x.holeNumber === holeNumber);
    const cls = this.cellClassList(hs, hole.par);
    const wolfRole = this.wolfRoleLabel(state, member, holeNumber);
    const writable = this.canWriteMember(state, member);
    return `<div class="hole-player-row${writable ? '' : ' is-readonly'}" data-member-row="${member.id}" onclick="scorecard.focusHoleScore(${member.id}, ${holeNumber}, event)">
      <span class="hole-player-name">${_esc(member.display_name)}${wolfRole ? ` <span class="wolf-role">${_esc(wolfRole)}</span>` : ''}</span>
      <div class="hole-player-score ${cls}${writable ? '' : ' is-readonly'}" data-score-cell="${member.id}:${holeNumber}">
        <div class="gross-box">
          <input class="score-input" type="tel" inputmode="numeric" autocomplete="off" maxlength="2"
            data-member="${member.id}" data-hole="${holeNumber}"
            data-committed="${hs?.gross ?? ''}" data-pending="${hs?.gross ?? ''}"
            ${writable ? '' : 'disabled'}
            value="${hs?.gross ?? ''}" aria-label="${_esc(member.display_name)} hole ${holeNumber}">
          ${this.strokeDotsHtml(hs?.strokes)}
        </div>
        ${hs?.gross != null ? `<span class="net-mini">${hs.net}</span>` : ''}
      </div>
      ${this.playerNinesLineHtml(state, member, holeNumber)}
      ${this.playerNineLineHtml(state, member)}
    </div>`;
  },

  playerNinesLineHtml(state, member, holeNumber) {
    if (!this.isNinesOn(state)) return '';
    const g = this.ninesGame(state);
    if (g && g.incomplete && !this.ninesThree(state)) return '';
    const holePts = this.ninesHoleValue(g, holeNumber, member.id, state);
    const runPts = this.ninesRunningThrough(g, holeNumber, member.id, state);
    if (holePts == null && runPts == null) return '';
    return `<div class="nines-player-stack" data-nines-player="${member.id}">
      <div class="nines-player-hole">hole ${holePts == null ? '—' : holePts}</div>
      <div class="nines-player-run">run ${runPts == null ? '—' : runPts}</div>
    </div>`;
  },

  playerNineLineHtml(state, member) {
    const bits = [];
    if (this.showOut(state) && member.outGross != null) bits.push(`OUT ${member.outGross}/${member.outNet ?? '—'}`);
    if (this.showIn(state) && member.inGross != null) bits.push(`IN ${member.inGross}/${member.inNet ?? '—'}`);
    if (this.showIn(state) && member.totalGross != null) bits.push(`TOT ${member.totalGross}/${member.totalNet ?? '—'}`);
    return bits.length ? `<div class="nine-line">${bits.join(' · ')}</div>` : '';
  },

  wolfRoleLabel(state, member, holeNumber) {
    if (!this.isWolfOn(state)) return '';
    const wolf = this.wolfForHole(state, holeNumber);
    if (wolf && member.id === wolf.id) return 'Wolf';
    const sides = this.wolfSides(state, holeNumber);
    if (!sides) return '';
    if (sides.partnerId && Number(member.id) === Number(sides.partnerId)) return 'Partner';
    return 'Field';
  },

  holePlayersHtml(state, holeNumber) {
    if (this.isWolfOn(state)) {
      const sides = this.wolfSides(state, holeNumber);
      const sections = sides
        ? [
          { name: sides.blind ? 'Blind Lone Wolf' : (sides.lone ? 'Lone Wolf' : 'Wolf side'), members: sides.wolfSide },
          { name: 'Field', members: sides.field },
        ]
        : [{ name: 'Wolf hole', members: this.wolfRoster(state) }];
      const wolfHtml = sections.map((group) => {
        const rows = (group.members || []).map((member) => this.holePlayerRowHtml(state, member, holeNumber)).join('');
        return `<section class="hole-team-group">${rows}<div class="hole-team-total"><div class="hole-team-scoreline"><span>${_esc(group.name)}</span></div></div></section>`;
      }).join('');
      const extra = this.groupedMembers(state).filter((group) => group.team && (group.members || []).length).map((group) => {
        const vegasHtml = this.isVegasOn(state) ? this.oneHoleVegasTotal(state, group.team, holeNumber) : '';
        const raceHtml = this.isTeamRaceOn(state) ? this.oneHoleTeamTotal(state, group.team, holeNumber) : '';
        return vegasHtml || raceHtml ? `<section class="hole-team-group" data-team-group="${group.team.id}">${vegasHtml}${raceHtml}</section>` : '';
      }).join('');
      return `<div class="hole-players" id="hole-players">${wolfHtml}${extra}</div>`;
    }
    const groups = this.groupedMembers(state).filter((group) => group.team && (group.members || []).length);
    return `<div class="hole-players" id="hole-players">${groups.map((group) => {
      const rows = group.members.map((member) => this.holePlayerRowHtml(state, member, holeNumber)).join('');
      const vegasHtml = this.isVegasOn(state) ? this.oneHoleVegasTotal(state, group.team, holeNumber) : '';
      const raceHtml = this.isTeamRaceOn(state) ? this.oneHoleTeamTotal(state, group.team, holeNumber) : '';
      return `<section class="hole-team-group" data-team-group="${group.team.id}"><div class="hole-team-head">${_esc(this.teamDisplay(group.team))}</div>${rows}${vegasHtml}${raceHtml}</section>`;
    }).join('')}</div>`;
  },

  nassauToolbarPressHtml(state, holeNumber) {
    if (!this.isNassauOn(state)) return '';
    const hn = Number(holeNumber) || this.currentHole || 1;
    return `<div class="nassau-toolbar-press" id="nassau-toolbar-press">
      ${this.nassauPressButtonsHtml(state, hn, 'nassau-press-wrap-toolbar')}
      ${this.nassauBoardHtml(state, 'nassau-board-toolbar')}
    </div>`;
  },

  holeToolbar(state) {
    const organizer = this.isOrganizer(state);
    return `
      <div class="round-toolbar hole-toolbar" id="hole-toolbar">
        <button type="button" class="hole-back" id="hole-back">Back</button>
        ${this.advanceToggleHtml()}
        <span class="unsynced-inline" id="unsynced-inline"></span>
        <button type="button" class="btn btn-sm btn-secondary hole-overflow" id="hole-overflow" aria-label="More" aria-haspopup="true" aria-expanded="false" onclick="scorecard.toggleHoleOverflow(event)">⋯</button>
        <div class="hole-overflow-menu" id="hole-overflow-menu" hidden>
          <button type="button" onclick="scorecard.setCardMode('full')">Full card</button>
          ${this.pressableGames(state).filter((g) => g.key !== 'vegas').length ? '<button type="button" onclick="scorecard.confirmPress()">Press</button>' : ''}
          <button type="button" onclick="scorecard.showScreen('rules')">Game Rules</button>
          ${organizer ? '<button type="button" onclick="scorecard.showScreen(\'settings\')">Settings</button>' : ''}
        </div>
      </div>
      ${this.nassauToolbarPressHtml(state, this.currentHole || 1)}`;
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
      ${this.nassauLiveDockHtml(state, holeNumber)}
      <div class="card hole-view" id="hole-view">
        <div class="hole-chrome">
          ${this.nassauPressButtonsHtml(state, holeNumber, 'nassau-press-wrap-card')}
          ${this.nassauBoardHtml(state, 'nassau-board-card')}
          ${this.liveGameTitleHtml(state)}
          <div class="hole-number" id="hole-number">Hole ${holeNumber}</div>
          ${this.vegasBoardHtml(state)}
          ${this.vegasPressButtonHtml(state, holeNumber)}
          ${this.ninesBoardHtml(state)}
          <div class="race-strip" id="race-strip">${_esc(race)}</div>
          ${this.pressableGames(state).filter((g) => g.key !== 'nassau' && g.key !== 'vegas').length ? `<button type="button" class="btn btn-sm btn-accent press-live" onclick="scorecard.confirmPress()">Press</button>${this.infoTip('press', 'Vegas Press increments games running (not a new ledger). Wolf / Nines press from this hole to 18. Nassau uses Front / Back / Overall on the live card.')}` : ''}
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
      <input type="tel" id="score-overlay-input" class="form-input score-overlay-number" inputmode="numeric" autocomplete="off" maxlength="2" value="${value}" aria-label="${_esc(o.name || 'Score')}">
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

  oneHoleVegasTotal(state, team, holeNumber) {
    if (this.vegasGame(state) && !this.vegasSideForTeam(state, team)) return '';
    const row = this.vegasHoleFor(state, team, holeNumber);
    const thisPts = row && row.swing != null ? this.fmtVegasPts(row.swing) : '—';
    const runLine = this.vegasNamedRun(this.vegasGame(state), holeNumber);
    return `<div class="hole-team-total hole-vegas-total ${row && row.incomplete ? 'incomplete' : ''}" data-vegas-total="${team.id}">
      <div class="vegas-line-this">This hole <span data-vegas-swing="${team.id}">${thisPts}</span></div>
      <div class="vegas-line-run" data-vegas-named-run="${team.id}">${_esc(runLine)}</div>
    </div>`;
  },

  oneHoleTeamTotal(state, team, holeNumber) {
    const hole = (team.holes || []).find((x) => x.holeNumber === holeNumber);
    const bits = [];
    if (this.showOut(state) && team.out != null) bits.push(`OUT ${this.fmtTeam(team.out)}`);
    if (this.showIn(state) && team.inn != null) bits.push(`IN ${this.fmtTeam(team.inn)}`);
    if (this.showIn(state) && team.total != null) bits.push(`TOT ${this.fmtTeam(team.total)}`);
    const raceLabel = this.isVegasOn(state) ? 'Sunday game' : `${_esc(this.teamDisplay(team))} hole`;
    return `<div class="hole-team-total ${hole?.incomplete ? 'incomplete' : ''}" data-team-total="${team.id}">
      <div class="hole-team-scoreline">
        <span>${raceLabel}</span>
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
    const teams = (state.teams || []).map((t) => `${this.teamDisplay(t)} ${this.fmtTeam(t.total)}`).join(' · ');
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
        const writable = this.canWriteMember(this.state, member);
        input.disabled = !writable;
        row.classList.toggle('is-readonly', !writable);
      }
    });
    document.querySelectorAll('#hole-players [data-team-total]').forEach((wrap) => {
      const teamId = wrap.dataset.teamTotal;
      const score = wrap.querySelector('[data-team-hole-score]');
      if (score) score.setAttribute('data-team-hole-score', teamId + ':' + holeNumber);
      const vs = wrap.querySelector('[data-vs-par]');
      if (vs) vs.setAttribute('data-vs-par', teamId + ':' + holeNumber);
    });
    document.querySelectorAll('#hole-players [data-vegas-total]').forEach((wrap) => {
      const teamId = wrap.dataset.vegasTotal;
      const num = wrap.querySelector('[data-vegas-num]');
      if (num) num.setAttribute('data-vegas-num', teamId + ':' + holeNumber);
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
    const holeToggle = '<button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.setCardMode(\'hole\')">This hole</button>';

    container.innerHTML = `
      ${this.toolbar(state, holeToggle + this.advanceToggleHtml())}
      ${this.nassauToolbarPressHtml(state, this.currentHole || 1)}
      ${this.writeErrorBanner()}
      ${this.eighteenBanner(state)}
      ${this.addPlayerPanel(state)}
      ${this.nassauLiveDockHtml(state, this.currentHole || 1)}
      <div class="card">
        ${this.liveGameTitleHtml(state)}
        ${this.vegasBoardHtml(state)}
        ${this.vegasPressButtonHtml(state, this.currentHole || 1)}
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
        <h2 class="card-title">Settings ${this.infoTip('settings', 'Sunday game, format, and side games. Handicap index is rounded at 0.5 and applied by stroke index — no course handicap.')}</h2>
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
    return this.addTeamNames(state);
  },

  teamSelectHtml(state, member, extraClass) {
    const current = (state.teams || []).find((t) => t.id === member.team_id);
    return `<select class="form-input team-pick ${extraClass || ''}" data-member-team="${member.id}"
      onchange="scorecard.assignTeam(${member.id}, this.value)">
      ${this.teamChoices(state).map((n) => {
        const team = (state.teams || []).find((t) => t.name === n);
        return `<option value="${_esc(n)}" ${current && current.name === n ? 'selected' : ''}>${_esc(team ? this.teamDisplay(team) : n)}</option>`;
      }).join('')}
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
        <span class="tiny-label">HCP = Index only ${this.infoTip('hcp-index', 'Round the index at 0.5 (2.4→2, 2.5→3). Strokes by scorecard SI. No course handicap.')}</span>
        ${r.format === 'team_net' ? `<label class="tiny-label">Sunday game format ${this.infoTip('format', 'Best-combo vs-par when Sunday game is ON. Pick 1G+2N (default) or 1G+1N, plus 3G, 3N, 1G+3N, 2G+2N.')}
          <select onchange="scorecard.changeGame(this.value)">${this.gameOptionsHtml(this.currentGameKey(r))}</select>
        </label>` : ''}
        <label class="tiny-label"><input type="checkbox" ${this.isTeamRaceOn(state) ? 'checked' : ''} onchange="scorecard.updateSettings({teamRace: this.checked})"> Sunday game ${this.infoTip('team-race', 'Default ON. The Sunday game is the team vs-par race. OFF hides it. Vegas, Wolf, Nassau, Nines, and Skins can still run alone or stacked.')}</label>
        <label class="tiny-label"><input type="checkbox" ${r.dual_count ? 'checked' : ''} onchange="scorecard.updateSettings({dualCount: this.checked})"> Dual-count</label>
      </div>
      ${r.format === 'team_net' ? `<p class="card-subtitle game-rule">${_esc(this.teamFormatRule(r))}</p>` : ''}
      ${this.sideGamesSettingsHtml(state)}
      <div class="card">
        <div class="card-title">Players (${state.members.length}/20)</div>
        <p class="card-subtitle">Pick a team for each player (Team 1 / 2 / 3, or Add team for 4+). Auto-balance is only a helper.</p>
        <button type="button" class="btn btn-sm btn-secondary" id="settings-add-team" onclick="scorecard.addExtraTeamFromSettings()">Add team</button>
        <div class="team-nick-list">
          ${(state.teams || []).map((t) => `
            <label class="tiny-label">${_esc(t.name)} nickname
              <input class="form-input team-nick-input" data-team-nick="${_esc(t.name)}" value="${_esc(t.nickname || '')}" maxlength="24" placeholder="optional" onchange="scorecard.saveTeamNickname('${_esc(t.name)}', this.value)">
            </label>`).join('')}
        </div>
        <form class="add-guest-row" id="add-guest-form" onsubmit="event.preventDefault();scorecard.addGuestFromForm()">
          <input class="form-input" id="add-guest-name" placeholder="Name" required>
          <input class="form-input" id="add-guest-hcp" placeholder="HCP">
          <select class="form-input team-pick" id="add-guest-team">
            ${this.teamChoices(state).map((n) => {
              const team = (state.teams || []).find((t) => t.name === n);
              return `<option value="${_esc(n)}" ${n === 'Team 1' ? 'selected' : ''}>${_esc(team ? this.teamDisplay(team) : n)}</option>`;
            }).join('')}
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
    if (this.isWolfOn(state)) {
      const rows = this.wolfRoster(state).map((m) => this.onePlayerRow(state, m, holes, showOut, showIn)).join('');
      const extras = this.groupedMembers(state).filter((group) => group.team && (group.members || []).length).map((group) => {
        const vegasRow = this.isVegasOn(state) ? this.oneVegasRow(state, group.team, holes, showOut, showIn) : '';
        const teamRow = this.isTeamRaceOn(state) ? this.oneTeamRow(state, group.team, holes, showOut, showIn) : '';
        return vegasRow + teamRow;
      }).join('');
      return rows + extras;
    }
    return this.groupedMembers(state).filter((group) => group.team && (group.members || []).length).map((group) => {
      const label = this.teamDisplay(group.team);
      const head = `<tr class="row-team-head"><th class="row-label">${_esc(label)}</th><td colspan="${holes.length + extra}"></td></tr>`;
      const rows = group.members.map((m) => this.onePlayerRow(state, m, holes, showOut, showIn)).join('');
      const vegasRow = this.isVegasOn(state) ? this.oneVegasRow(state, group.team, holes, showOut, showIn) : '';
      const teamRow = this.isTeamRaceOn(state) ? this.oneTeamRow(state, group.team, holes, showOut, showIn) : '';
      return head + rows + vegasRow + teamRow;
    }).join('');
  },

  onePlayerRow(state, m, holes, showOut, showIn) {
    const cells = holes.map((h) => {
      const hs = (m.holes || []).find((x) => x.holeNumber === h.hole_number);
      return this.scoreCellHtml(state, m, h, hs);
    }).join('');
    return `
      <tr class="row-player${this.canWriteMember(state, m) ? '' : ' is-readonly'}" data-member-row="${m.id}">
        <td class="row-label">${_esc(m.display_name)}<div class="hcp-mini">H ${m.playing_handicap ?? '—'}</div></td>
        ${cells}
        ${showOut ? `<td class="sc-total" data-out="${m.id}">${m.outGross ?? ''} <span class="net-mini">${m.outNet ?? ''}</span></td>` : ''}
        ${showIn ? `<td class="sc-total" data-in="${m.id}">${m.inGross ?? ''} <span class="net-mini">${m.inNet ?? ''}</span></td>` : ''}
        ${showIn ? `<td class="sc-total sc-tot-sticky" data-tot="${m.id}"><strong>${m.totalGross ?? ''}</strong> <span class="net-mini">${m.totalNet ?? ''}</span></td>` : ''}
      </tr>
      ${this.onePlayerNinesRows(state, m, holes, showOut, showIn)}`;
  },

  oneTeamRow(state, team, holes, showOut, showIn) {
    return `
      <tr class="row-team" data-team-row="${team.id}">
        <td class="row-label">${_esc(this.teamDisplay(team))}</td>
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

  oneVegasRow(state, team, holes, showOut, showIn) {
    if (this.vegasGame(state) && !this.vegasSideForTeam(state, team)) return '';
    const last = holes[holes.length - 1];
    const lastRow = last ? this.vegasHoleFor(state, team, last.hole_number) : null;
    return `
      <tr class="row-team row-vegas" data-vegas-row="${team.id}">
        <td class="row-label">${_esc(this.teamDisplay(team))} Vegas</td>
        ${holes.map((h) => {
          const row = this.vegasHoleFor(state, team, h.hole_number);
          const swing = row && row.swing != null ? this.fmtVegasPts(row.swing) : '—';
          return `<td data-vegas-cell="${team.id}:${h.hole_number}" class="team-hole-cell ${row && row.incomplete ? 'incomplete' : ''}">
            <span class="team-hole-score" data-vegas-num="${team.id}:${h.hole_number}">${row && row.num != null ? row.num : '—'}</span>
            <span class="vegas-cell-swing" data-vegas-cell-swing="${team.id}:${h.hole_number}">${swing}</span>
          </td>`;
        }).join('')}
        ${showOut ? '<td class="sc-total"></td>' : ''}
        ${showIn ? '<td class="sc-total"></td>' : ''}
        ${showIn ? `<td class="sc-total"><strong data-vegas-run="${team.id}">${lastRow && lastRow.run != null ? this.fmtVegasPts(lastRow.run) : '0'}</strong></td>` : ''}
      </tr>`;
  },

  scoreCellHtml(state, member, hole, hs) {
    const cls = this.cellClassList(hs, hole.par);
    const writable = this.canWriteMember(state, member);
    return `<td class="${cls}${writable ? '' : ' is-readonly'}" data-score-cell="${member.id}:${hole.hole_number}">
      <div class="gross-box">
        <input class="score-input" type="tel" inputmode="numeric" autocomplete="off" maxlength="2"
          data-member="${member.id}" data-hole="${hole.hole_number}"
          data-committed="${hs?.gross ?? ''}" data-pending="${hs?.gross ?? ''}"
          ${writable ? '' : 'disabled'}
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
        <td class="row-label">${_esc(this.teamDisplay(team))}</td>
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
        const writable = this.canWriteMember(this.state, member);
        input.disabled = !writable;
        cell.classList.toggle('is-readonly', !writable);
        const row = cell.closest('.hole-player-row, tr.row-player');
        if (row) row.classList.toggle('is-readonly', !writable);
        if (document.activeElement !== input) {
          input.value = hs?.gross ?? '';
          input.dataset.committed = hs?.gross ?? '';
          input.dataset.pending = hs?.gross ?? '';
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
    this.paintVegas(holeNumber);
  },

  paintVegas(holeNumber) {
    if (!this.state || !this.isVegasOn(this.state)) return;
    const hn = holeNumber || this.currentHole;
    for (const team of this.state.teams || []) {
      const row = this.vegasHoleFor(this.state, team, hn);
      document.querySelectorAll('[data-vegas-num="' + team.id + ':' + hn + '"]').forEach((el) => {
        el.textContent = row && row.num != null ? String(row.num) : '—';
      });
      document.querySelectorAll('[data-vegas-swing="' + team.id + '"]').forEach((el) => {
        el.textContent = row && row.swing != null ? this.fmtVegasPts(row.swing) : '—';
      });
      document.querySelectorAll('[data-vegas-cell-swing="' + team.id + ':' + hn + '"]').forEach((el) => {
        el.textContent = row && row.swing != null ? this.fmtVegasPts(row.swing) : '—';
      });
      document.querySelectorAll('[data-vegas-run="' + team.id + '"]').forEach((el) => {
        el.textContent = row && row.run != null ? this.fmtVegasPts(row.run) : '0';
      });
      document.querySelectorAll('[data-vegas-named-run="' + team.id + '"]').forEach((el) => {
        el.textContent = this.vegasNamedRun(this.vegasGame(this.state), hn);
      });
      const wrap = document.querySelector('[data-vegas-total="' + team.id + '"]');
      if (wrap) wrap.classList.toggle('incomplete', !!(row && row.incomplete));
    }
    const board = document.getElementById('vegas-board');
    if (board) board.innerHTML = this.vegasBoardInner(this.state);
  },

  replaceNode(el, html) {
    if (!el) return;
    if (!html) {
      el.remove();
      return;
    }
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    if (tmp.firstElementChild) el.replaceWith(tmp.firstElementChild);
  },

  paintPressChrome() {
    if (!this.state) return;
    const hn = this.currentHole || 1;
    const vegasBoard = document.getElementById('vegas-board');
    if (vegasBoard) vegasBoard.innerHTML = this.vegasBoardInner(this.state);
    this.replaceNode(
      document.getElementById('vegas-press-wrap') || document.querySelector('.vegas-press-wrap'),
      this.vegasPressButtonHtml(this.state, hn)
    );
    this.ensureNassauLiveDock(hn);
    const ninesBoard = document.getElementById('nines-board');
    if (ninesBoard) ninesBoard.innerHTML = this.ninesBoardInner(this.state);
  },

  ensureNassauLiveDock(holeNumber) {
    const html = this.nassauLiveDockHtml(this.state, holeNumber);
    const existing = document.getElementById('nassau-live-dock')
      || document.getElementById('nassau-press-wrap');
    if (existing) {
      this.replaceNode(existing, html);
    }
    const cardBtns = document.getElementById('nassau-press-wrap-card');
    if (cardBtns) this.replaceNode(cardBtns, this.nassauPressButtonsHtml(this.state, holeNumber, 'nassau-press-wrap-card'));
    const cardBoard = document.getElementById('nassau-board-card');
    if (cardBoard) this.replaceNode(cardBoard, this.nassauBoardHtml(this.state, 'nassau-board-card'));
    const bar = document.getElementById('nassau-toolbar-press');
    if (bar) this.replaceNode(bar, this.nassauToolbarPressHtml(this.state, holeNumber));
    else if (this.nassauToolbarPressHtml(this.state, holeNumber)) {
      const toolbar = document.getElementById('hole-toolbar');
      if (toolbar && toolbar.parentNode) {
        const tmpBar = document.createElement('div');
        tmpBar.innerHTML = this.nassauToolbarPressHtml(this.state, holeNumber);
        if (tmpBar.firstElementChild) toolbar.insertAdjacentElement('afterend', tmpBar.firstElementChild);
      }
    }
    if (existing) return;
    if (!html) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const node = tmp.firstElementChild;
    if (!node) return;
    const holeView = document.getElementById('hole-view');
    const toolbar = document.getElementById('hole-toolbar');
    if (toolbar && toolbar.parentNode) {
      toolbar.insertAdjacentElement('afterend', node);
    } else if (holeView && holeView.parentNode) {
      holeView.insertAdjacentElement('beforebegin', node);
    } else if (holeView) {
      holeView.insertBefore(node, holeView.firstChild);
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
    const title = document.getElementById('live-game-title');
    if (title && this.state) title.textContent = this.liveGameTitle(this.state);
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
    const member = this.state && (this.state.members || []).find((m) => Number(m.id) === Number(memberId));
    if (this.state && !this.canWriteMember(this.state, member)) {
      this.showWriteError('You can only enter scores for your own team.');
      return;
    }
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
    const applyStepperDigits = () => {
      const parsed = this.readGrossTyping(input.dataset.pending, input.value, '');
      input.dataset.pending = parsed.raw;
      input.value = parsed.raw;
      if (parsed.complete && parsed.value != null) this.commitStepper(parsed.value);
    };
    input.addEventListener('input', applyStepperDigits);
    input.addEventListener('change', applyStepperDigits);
  },

  nudgeStepper(delta) {
    const input = document.getElementById('score-overlay-input');
    if (!input || !this.overlay) return;
    const fallback = Number(this.overlay.current != null ? this.overlay.current : this.overlay.par) || 4;
    const next = Math.min(19, Math.max(1, (Number(input.value) || fallback) + delta));
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
        this.addPlayerDraft = {
          name: '',
          handicap: '',
          teamName: teamName || 'Team 1',
          extraTeams: (this.addPlayerDraft && this.addPlayerDraft.extraTeams) || [],
        };
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

  async saveTeamNickname(teamName, nickname) {
    if (!this.state) return;
    try {
      const state = await svcApi('post', `/api/rounds/${this.state.round.id}/teams`, {
        teamName,
        nickname,
      });
      this.state = state;
      this.writeCache(state.round.id, state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async addExtraTeamFromSettings() {
    if (!this.state) return;
    const name = this.nextAddTeamName(this.state);
    try {
      const state = await svcApi('post', `/api/rounds/${this.state.round.id}/teams`, { teamName: name });
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
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
        <h3>Sunday game</h3>
        <p>The Sunday game is the team vs-par race. Setup toggle, default ON. When ON, each team’s hole is the best combo of counted balls vs par — not a stroke sum. Goldendale default is <strong>1G+2N</strong> (one best gross + two best nets). Also offered: <strong>1G+1N</strong> (one gross + one net), 3G, 3N, 1G+3N, 2G+2N. OFF hides the Sunday game. Vegas, Wolf, Nassau, Nines, and Skins can run alone or stacked.</p>
        <h3>Handicap index</h3>
        <p>No course handicap. Round the index at 0.5 (2.4→2, 2.5→3, 18.7→19, 1.3→1). That integer is applied by scorecard stroke index for every net game.</p>
        <h3>Skins</h3>
        <p>One pot. Gross and net. A tie kills that hole — no carry. Net off the low man, strokes by SI. Value = pot ÷ (gross skins won + net skins won). Default OFF.</p>
        <h3>Vegas</h3>
        <p>2v2. Pair numbers, low first (4 and 5 = 45). 10+ is high-first (10 and 4 = 104, 4 and 11 = 114). Not the Sunday game vs-par total. Press is a games-running count that starts at 1; each tap adds a game from that hole on. This-hole swing = difference × games running (5-point hole × 3 games = +15/−15). Two lines: this-hole difference, then RUNNING that names who is up and who is down (e.g. Team B up 20 · Team A down 20). Flip on gross birdie+. Both sides birdie+ flips both.</p>
        <h3>Nassau (NASA)</h3>
        <p>NASA means Nassau. Three independent bets: Front 1–9, Back 10–18, Overall 1–18. Each hole is match play. The live card shows <strong>Press Front</strong>, <strong>Press Back</strong>, and <strong>Press Overall</strong> plus RUNNING scores for each original and each live press. Anyone can press. A press is a new bet from that hole through the end of that segment only — Front dies at 9, Back at 18, Overall tap→18. Original bets stay live. No auto 2-down.</p>
        <h3>Wolf</h3>
        <p>Wolf rotates each hole. After each tee, pick that player or pass. Sides lock before Wolf points settle — you can still type gross. Better ball wins (gross or net). Tie = 0. Point values are setup toggles: Partnered ±, Lone ±, and Blind Lone ±. Defaults: partnered ±1, Lone ±2, Blind Lone ±4. Win +, lose −, same magnitude. Next hole is a new Wolf.</p>
        <h3>Join code teams</h3>
        <p>Host is Team 1 (optional nickname). A joiner with the code picks Team 2 / 3 / 4… or Add team — they are not auto Team 1. Optional team nickname. Live card shows Team N · nickname (or just Team N) on every login.</p>
        <h3>Live card write lock</h3>
        <p>Everyone sees the same live round. You may enter scores only for players on your own team. Other teams are visible read-only. The server rejects cross-team score writes. Wolf is individual — rostered players can enter the Wolf card.</p>
        <h3>Score entry</h3>
        <p>Gross is 1–19. Default advance is <strong>Down</strong> (next player, same hole). Switch to <strong>Across</strong> to stay on one player and walk holes 2→3→4 for catch-up.</p>
        <h3>Nines</h3>
        <p>Exactly 3 individual players. First row is that hole’s points (5-3-1 / 5-2-2 / 4-4-1 / 3-3-3 / Blitz 9-0-0). Second row per player <strong>sums</strong> those points through the hole you are on (hole1 5-2-2 then hole2 5-3-1 → running 10/5/3), not a reset. Net off the low man.</p>
        <h3>Presses</h3>
        <p>Vegas Press increments games running (not a new ledger). Nassau: from this hole to the end of that segment only (Front dies at 9). Wolf / Nines still press from this hole to 18. Anyone can press.</p>
        <h3>Birdie dragon slots (Wyrm Coil)</h3>
        <p>Fun layer, not team money. Default ON. Each player’s spin count is <strong>their own</strong> gross better-than-par plus their own net better-than-par (same hole can count both). Points stay on that player — a fun board like David 29 · Brian 50 · Matt 60, never a team pot. On the 19th, the fun board lists everyone and Spin your birdies opens Wyrm Coil on that player’s remaining spins. Reels rotate longer before they settle. Toggle off to skip the coil. Original theme and pay — not a copy of any cabinet.</p>
        <h3>Optional KPs</h3>
        <p>Default OFF. Designate KP holes, record a winner, see them on the 19th hole.</p>
        <h3>19th hole</h3>
        <p>When all scores are in, tap Go to the 19th hole. Podium reveals 3rd → 2nd → 1st with short confetti on the winner. Tap Front / Back / Overall / Skins cards to reveal. The Wyrm Coil fun board lists each player’s points. The big Spin your birdies door opens that player’s remaining spins. Share strip is one-tap summary plus a screenshot card. Sound stays off.</p>
        <h3>OUT / IN / TOT</h3>
        <p>After hole 9: OUT is front 1–9. After 18: IN is back 10–18 only. TOT is 1–18. Sunday game stays vs-par.</p>
      </div>`;
    svcApi('updateBadge');
  },

  nineteenthRankedTeams(state) {
    return [...(state.teams || [])]
      .filter((t) => t.total != null)
      .sort((a, b) => Number(a.total) - Number(b.total));
  },

  podiumHtml(state) {
    const ranked = this.nineteenthRankedTeams(state);
    if (!ranked.length) return '<div class="podium" id="podium">No Sunday game totals yet.</div>';
    const places = [
      { cls: 'place-3', label: '3rd', team: ranked[2] },
      { cls: 'place-2', label: '2nd', team: ranked[1] },
      { cls: 'place-1', label: '1st', team: ranked[0] },
    ];
    return `<div class="podium" id="podium">${places.map((p) => `
      <div class="podium-place ${p.cls}" data-place="${p.label}" hidden>
        <span class="podium-label">${p.label}</span>
        <strong>${p.team ? _esc(this.teamDisplay(p.team)) : '—'}</strong>
        <span>${p.team ? this.fmtTeam(p.team.total) : ''}</span>
        ${p.label === '1st' ? '<div class="confetti" id="nineteenth-confetti" hidden></div>' : ''}
      </div>`).join('')}</div>`;
  },

  revealCardHtml(key, title, body) {
    return `<button type="button" class="reveal-card" data-reveal="${key}" onclick="scorecard.revealNineteenthCard('${key}')">
      <span class="reveal-title">${_esc(title)}</span>
      <span class="reveal-body" hidden>${body}</span>
    </button>`;
  },

  revealNineteenthCard(key) {
    const card = document.querySelector(`.reveal-card[data-reveal="${key}"]`);
    if (!card) return;
    const body = card.querySelector('.reveal-body');
    if (body) body.hidden = !body.hidden;
    card.classList.toggle('is-open', body && !body.hidden);
  },

  nineteenthShareText(state) {
    const ranked = this.nineteenthRankedTeams(state);
    const winner = ranked[0];
    const vegas = this.vegasGame(state);
    const bits = [
      `Sunday game · ${state.round && state.round.name ? state.round.name : 'Goldendale'}`,
      winner ? `Winner ${winner.name} ${this.fmtTeam(winner.total)}` : '',
      vegas && vegas.teamA ? this.vegasNamedRun(vegas) : '',
    ].filter(Boolean);
    return bits.join(' · ');
  },

  nineteenthSharePng(state) {
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve(null);
    ctx.fillStyle = '#1B5E20';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#F9A825';
    ctx.fillRect(0, 0, canvas.width, 10);
    ctx.fillStyle = '#fff';
    ctx.font = '700 28px sans-serif';
    ctx.fillText('Sunday game · 19th hole', 28, 64);
    const text = this.nineteenthShareText(state || this.state);
    ctx.font = '600 20px sans-serif';
    const words = String(text || '').split(' ');
    let line = '';
    let y = 120;
    words.forEach((word) => {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width > 660) {
        ctx.fillText(line, 28, y);
        line = word;
        y += 32;
      } else {
        line = next;
      }
    });
    if (line) ctx.fillText(line, 28, y);
    ctx.font = '500 16px sans-serif';
    ctx.fillText('Goldendale Scorecard · sound off', 28, 330);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  },

  async shareNineteenth() {
    const text = this.state ? this.nineteenthShareText(this.state) : '';
    const blob = await this.nineteenthSharePng(this.state);
    const file = blob ? new File([blob], 'sunday-19th.png', { type: 'image/png' }) : null;
    try {
      if (navigator.share) {
        const data = { title: 'Sunday game', text };
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
        await navigator.share(data);
        return;
      }
    } catch { /* fall through to copy */ }
    try {
      await navigator.clipboard.writeText(text);
      _toast('Copied the 19th hole strip.', 'ok');
    } catch {
      _toast(text, 'ok');
    }
  },

  playPodiumReveal() {
    const order = ['3rd', '2nd', '1st'];
    order.forEach((label, i) => {
      window.setTimeout(() => {
        const el = document.querySelector(`.podium-place[data-place="${label}"]`);
        if (el) el.hidden = false;
        if (label === '1st') {
          const confetti = document.getElementById('nineteenth-confetti');
          if (confetti) {
            confetti.hidden = false;
            confetti.classList.add('is-on');
            window.setTimeout(() => confetti.classList.remove('is-on'), 1800);
          }
        }
      }, 350 * (i + 1));
    });
  },

  drawNineteenth(state) {
    const container = document.getElementById('app');
    const fmt = (rows) => (rows || []).length
      ? rows.map((t) => `${this.teamDisplay(t)} ${this.fmtTeam(t.total)}`).join(' · ')
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
    const skinsBody = skins
      ? `Gross ${skins.grossSkins} · Net ${skins.netSkins} · pot ${skins.pot ?? '—'} · ${skins.skinCount ? (skins.valuePerSkin + ' / skin') : 'no skins'}`
      : 'Skins off';
    container.innerHTML = `
      ${this.toolbar(state, `<button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.showScreen('play')">Scorecard</button>`)}
      <div class="card nineteenth" id="nineteenth">
        <h2 class="card-title">19th hole</h2>
        <p class="card-subtitle">${_esc(state.round.name)} · confirmed card · sound off</p>
        ${this.podiumHtml(state)}
        <div class="reveal-row">
          ${this.revealCardHtml('front', 'Front', _esc(fmt(state.frontLeaders)))}
          ${this.revealCardHtml('back', 'Back', _esc(fmt(state.backLeaders)))}
          ${this.revealCardHtml('overall', 'Overall', _esc(fmt(state.overallLeaders)))}
          ${this.revealCardHtml('skins', 'Skins', _esc(skinsBody))}
        </div>
        <div class="share-strip" id="share-strip">
          <span>${_esc(this.nineteenthShareText(state))}</span>
          <button type="button" class="btn btn-sm btn-accent" onclick="scorecard.shareNineteenth()">Share</button>
        </div>
        ${typeof wyrmCoil !== 'undefined' && wyrmCoil.funBoardHtml ? wyrmCoil.funBoardHtml(state) : ''}
        ${typeof wyrmCoil !== 'undefined' && wyrmCoil.bannerHtml ? wyrmCoil.bannerHtml(state) : ''}
        <h3>Sunday game</h3>
        ${(state.teams || []).map((t) => `<p><strong>${_esc(this.teamDisplay(t))}</strong> · Front ${this.fmtTeam(t.out)} · Back ${this.fmtTeam(t.inn)} · Overall ${this.fmtTeam(t.total)}</p>`).join('') || '<p>No teams yet.</p>'}
        ${this.sideGamesResultsHtml(state)}
        ${kps ? `<h3>Closest to the pin</h3><p>${_esc(kps)}</p>` : ''}
        <h3>Fun facts</h3>
        <p>Total gross birdies: ${facts.totalBirdies ?? 0}</p>
        <p>Hardest hole: ${facts.hardest ? ('#' + facts.hardest.hole + ' (' + (facts.hardest.avg > 0 ? '+' : '') + facts.hardest.avg.toFixed(1) + ' vs par)') : '—'}</p>
        <p>Easiest hole: ${facts.easiest ? ('#' + facts.easiest.hole + ' (' + (facts.easiest.avg > 0 ? '+' : '') + facts.easiest.avg.toFixed(1) + ' vs par)') : '—'}</p>
        <p>Most birdies: ${facts.mostBirdies ? (facts.mostBirdies.name + ' ' + facts.mostBirdies.birdies) : '—'}</p>
        <p>Biggest team swing: ${facts.biggestSwing ? (facts.biggestSwing.name + ' ' + facts.biggestSwing.swing) : '—'}</p>
      </div>`;
    this.playPodiumReveal();
    svcApi('updateBadge');
  },
};

window.scorecard = scorecard;
