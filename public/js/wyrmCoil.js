/**
 * Wyrm Coil — original birdie dragon slots overlay.
 * Casino-dragon mood only. Original name, art, and pay. Not a copy of any
 * cabinet. Fun layer. Toggle still applies. Each player spins their own
 * gross + net better-than-par. Points stay on that player — not team money.
 */
const WYRM_ICONS = [
  { key: 'coil', mark: '◎', label: 'Coil' },
  { key: 'ember', mark: '✶', label: 'Ember' },
  { key: 'pearl', mark: '●', label: 'Pearl' },
  { key: 'scale', mark: '◇', label: 'Scale' },
  { key: 'lantern', mark: '⌂', label: 'Lantern' },
  { key: 'cloud', mark: '☁', label: 'Cloud' },
];

function _esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const wyrmCoil = {
  HIGH_KEY: 'goldendale_wyrm_coil_high',
  SPIN_MS: 3000,
  REEL_ROWS: 18,
  open: false,
  spinning: false,
  taken: 0,
  running: 0,
  lastAward: null,
  autoOpenedFor: null,
  roundId: null,
  playerId: null,

  slotsFrom(state) {
    const games = state && state.sideGames && state.sideGames.games;
    return (games && games.birdieSlots) || { on: false, spins: 0, spinLog: [], players: [] };
  },

  funBoardText(slots) {
    if (slots && slots.funBoard) return slots.funBoard;
    const rows = ((slots && slots.players) || []).filter((p) => (p.spins || p.points));
    return rows.map((p) => `${p.name} ${p.points}`).join(' · ');
  },

  funBoardHtml(state) {
    const slots = this.slotsFrom(state);
    if (!slots.on) return '';
    const rows = (slots.players || []).filter((p) => (Number(p.spins) || 0) > 0);
    const board = rows.length
      ? `<ol class="wyrm-fun-list">${rows.map((p) => {
        const g = Number(p.grossBirdies) || 0;
        const n = Number(p.netBirdies) || 0;
        return `<li><span class="wyrm-fun-name">${_esc(p.name)}</span> <strong>${p.points}</strong> <span class="wyrm-fun-spins">${p.spins} spin${p.spins === 1 ? '' : 's'} (${g}G+${n}N)</span></li>`;
      }).join('')}</ol>`
      : '<p class="wyrm-fun-empty">No better-than-par scores yet.</p>';
    return `<section class="wyrm-fun-board" id="wyrm-fun-board">
      <h3>Wyrm Coil fun board</h3>
      <p>Fun only · not team money. Each player’s spins = their own gross + net better than par. Points stay on that player.</p>
      ${board}
    </section>`;
  },

  highScore() {
    try {
      return Number(localStorage.getItem(this.HIGH_KEY)) || 0;
    } catch {
      return 0;
    }
  },

  saveHigh(total) {
    const prev = this.highScore();
    if (total > prev) {
      try { localStorage.setItem(this.HIGH_KEY, String(total)); } catch { /* ignore */ }
      return total;
    }
    return prev;
  },

  boardHigh(slots) {
    return ((slots && slots.players) || []).reduce((max, p) => {
      const pts = Number(p.points) || 0;
      return pts > max ? pts : max;
    }, 0);
  },

  displayBest(slots) {
    return this.saveHigh(Math.max(this.running, this.boardHigh(slots)));
  },

  progressKey(roundId) {
    return 'goldendale_wyrm_coil_play_' + String(roundId || '');
  },

  loadProgress(roundId, playerId) {
    try {
      const raw = sessionStorage.getItem(this.progressKey(roundId));
      if (!raw) return { taken: 0, running: 0 };
      const data = JSON.parse(raw);
      const byPlayer = data && data.byPlayer;
      if (byPlayer && playerId != null) {
        const row = byPlayer[String(playerId)];
        if (row) return { taken: Number(row.taken) || 0, running: Number(row.running) || 0 };
      }
      return { taken: 0, running: 0 };
    } catch {
      return { taken: 0, running: 0 };
    }
  },

  saveProgress() {
    try {
      const key = this.progressKey(this.roundId);
      let data = { byPlayer: {} };
      try { data = JSON.parse(sessionStorage.getItem(key) || '') || data; } catch { /* ignore */ }
      if (!data.byPlayer || typeof data.byPlayer !== 'object') data.byPlayer = {};
      if (this.playerId != null) {
        data.byPlayer[String(this.playerId)] = { taken: this.taken, running: this.running };
      }
      sessionStorage.setItem(key, JSON.stringify(data));
    } catch { /* ignore */ }
  },

  iconAt(seed, reel, row) {
    const n = Math.abs((Number(seed) || 0) * 31 + reel * 17 + row * 7);
    return WYRM_ICONS[n % WYRM_ICONS.length];
  },

  reelHtml(seed, spinning) {
    const rows = this.REEL_ROWS;
    return [0, 1, 2].map((reel) => {
      const cells = Array.from({ length: rows }, (_, row) => {
        const icon = this.iconAt(seed, reel, row);
        const pay = row === rows - 2 ? ' is-pay' : '';
        return `<div class="wyrm-cell wyrm-${icon.key}${pay}" title="${icon.label}"><span>${icon.mark}</span><em>${icon.label}</em></div>`;
      }).join('');
      return `<div class="wyrm-reel${spinning ? ' is-spinning' : ''}" data-reel="${reel}"><div class="wyrm-reel-strip">${cells}</div></div>`;
    }).join('');
  },

  playerLogs(slots, playerId) {
    return (slots.spinLog || []).filter((s) => String(s.memberId) === String(playerId));
  },

  defaultPlayerId(slots, state) {
    const me = typeof scorecard !== 'undefined' && scorecard.myMember ? scorecard.myMember(state) : null;
    if (me && this.playerLogs(slots, me.id).length) return me.id;
    const first = (slots.players || []).find((p) => p.spins);
    return first ? first.id : null;
  },

  bannerHtml(state) {
    const slots = this.slotsFrom(state);
    if (!slots.on) return '';
    const n = Number(slots.spins) || 0;
    const g = Number(slots.grossBirdies) || 0;
    const net = Number(slots.netBirdies) || 0;
    const label = n
      ? `Spin your birdies · ${n} spin${n === 1 ? '' : 's'}`
      : 'Wyrm Coil · no better-than-par scores';
    return `<div class="wyrm-coil-banner wyrm-spin-door" id="wyrm-coil-banner">
      <h3>Spin your birdies</h3>
      <p>Wyrm Coil · fun only · not team money. ${g} gross + ${net} net better than par, counted on the player who made them.</p>
      <button type="button" class="btn btn-accent wyrm-spin-door-btn" id="wyrm-coil-open" ${n ? '' : 'disabled'}>${label}</button>
    </div>`;
  },

  bindBanner() {
    const btn = document.getElementById('wyrm-coil-open');
    if (!btn) return;
    btn.addEventListener('click', () => this.show(window.scorecard && scorecard.state));
  },

  onNineteenthDrawn(state) {
    this.bindBanner();
    const slots = this.slotsFrom(state);
    if (!slots.on) this.hide();
  },

  show(state) {
    if (!state) return;
    const slots = this.slotsFrom(state);
    if (!slots.on) return;
    this.roundId = state.round && state.round.id;
    this.playerId = this.defaultPlayerId(slots, state);
    const saved = this.loadProgress(this.roundId, this.playerId);
    this.taken = saved.taken;
    this.running = saved.running;
    this.lastAward = null;
    this.open = true;
    this.spinning = false;
    this.render(state);
  },

  hide() {
    this.open = false;
    this.spinning = false;
    const el = document.getElementById('wyrm-coil-overlay');
    if (el) el.remove();
  },

  remaining(slots) {
    return Math.max(0, this.playerLogs(slots, this.playerId).length - this.taken);
  },

  currentSpin(slots) {
    const log = this.playerLogs(slots, this.playerId);
    return log[this.taken] || null;
  },

  selectPlayer(state, playerId) {
    if (this.spinning) return;
    this.playerId = playerId;
    const saved = this.loadProgress(this.roundId, playerId);
    this.taken = saved.taken;
    this.running = saved.running;
    this.lastAward = null;
    this.render(state);
  },

  playerChipsHtml(slots) {
    const rows = (slots.players || []).filter((p) => p.spins);
    if (!rows.length) return '';
    return `<div class="wyrm-player-chips">${rows.map((p) => {
      const on = String(p.id) === String(this.playerId) ? ' is-on' : '';
      return `<button type="button" class="wyrm-player-chip${on}" data-wyrm-player="${p.id}">${_esc(p.name)} ${p.points} · ${p.spins}</button>`;
    }).join('')}</div>`;
  },

  render(state) {
    const slots = this.slotsFrom(state);
    const left = this.remaining(slots);
    const spin = this.lastAward || this.currentSpin(slots) || { points: 0, hole: '—', kind: '', name: '' };
    const seed = (this.roundId || 0) * 17 + this.taken * 13 + (spin.points || 0) * 5 + Number(this.playerId || 0);
    const high = this.displayBest(slots);
    const done = left === 0;
    const player = (slots.players || []).find((p) => String(p.id) === String(this.playerId));
    const playerPts = player ? Number(player.points) || 0 : 0;
    let host = document.getElementById('wyrm-coil-overlay');
    if (!host) {
      host = document.createElement('div');
      host.id = 'wyrm-coil-overlay';
      host.className = 'wyrm-coil-overlay';
      document.body.appendChild(host);
    }
    host.innerHTML = `
      <div class="wyrm-coil-machine" role="dialog" aria-modal="true" aria-labelledby="wyrm-coil-title">
        ${this.playerChipsHtml(slots)}
        <div class="wyrm-coil-crest" aria-hidden="true">
          <svg viewBox="0 0 80 48" width="80" height="48">
            <path d="M8 32c10-18 22-22 32-10 6 7 10 8 18 4 8-4 14-2 14 6" fill="none" stroke="#e6c36a" stroke-width="3" stroke-linecap="round"/>
            <circle cx="18" cy="22" r="3" fill="#7cffc4"/>
            <path d="M58 28c6 0 10 4 10 8" fill="none" stroke="#ff8a4c" stroke-width="2"/>
          </svg>
        </div>
        <h2 id="wyrm-coil-title">Wyrm Coil</h2>
        <p class="wyrm-coil-tag">Birdie dragon slots · fun only · not team money</p>
        <div class="wyrm-screens" aria-hidden="true">${this.reelHtml(seed, this.spinning)}</div>
        <div class="wyrm-coil-stats">
          <div><span>Spins left</span><strong>${left}</strong></div>
          <div><span>This spin</span><strong>${this.lastAward ? '+' + this.lastAward.points : '—'}</strong></div>
          <div><span>This player</span><strong>${playerPts}</strong></div>
          <div><span>Best</span><strong>${high}</strong></div>
        </div>
        <p class="wyrm-fun-board-line">${_esc(this.funBoardText(slots) || 'No birdie scores yet')}</p>
        <p class="wyrm-coil-note">${done
          ? (this.playerLogs(slots, this.playerId).length
            ? 'Coil rest. ' + (spin.name || 'This player') + ' took every one of their birdie spins.'
            : 'No gross or net birdies for this player — the coil stays dark.')
          : `${_esc(spin.name || 'A birdie')} · hole ${spin.hole} · ${spin.kind || ''} birdie`}</p>
        <div class="wyrm-coil-actions">
          <button type="button" class="btn btn-accent" id="wyrm-coil-spin" ${done || this.spinning ? 'disabled' : ''}>${done ? 'Done' : 'Spin'}</button>
          <button type="button" class="btn btn-secondary" id="wyrm-coil-close">Close</button>
        </div>
      </div>`;
    document.getElementById('wyrm-coil-close').onclick = () => this.hide();
    const spinBtn = document.getElementById('wyrm-coil-spin');
    if (spinBtn) spinBtn.onclick = () => this.takeSpin(state);
    host.querySelectorAll('[data-wyrm-player]').forEach((btn) => {
      btn.onclick = () => this.selectPlayer(state, btn.getAttribute('data-wyrm-player'));
    });
    host.onclick = (e) => { if (e.target === host) this.hide(); };
  },

  takeSpin(state) {
    const slots = this.slotsFrom(state);
    if (this.spinning || this.remaining(slots) <= 0) return;
    const award = this.currentSpin(slots);
    if (!award) return;
    this.spinning = true;
    this.render(state);
    window.setTimeout(() => {
      this.spinning = false;
      this.lastAward = award;
      this.running += Number(award.points) || 0;
      this.taken += 1;
      this.saveProgress();
      this.displayBest(slots);
      this.render(state);
    }, this.SPIN_MS);
  },
};

if (typeof module === 'object' && module.exports) {
  module.exports = wyrmCoil;
}
if (typeof window !== 'undefined') {
  window.wyrmCoil = wyrmCoil;
}
