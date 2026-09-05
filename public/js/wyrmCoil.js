/**
 * Wyrm Coil — original birdie dragon slots overlay.
 * Casino-dragon mood only. Original name, art, and pay. Not a copy of any
 * cabinet. Fun layer. Toggle still applies. N spins = better than par.
 */
const WYRM_ICONS = [
  { key: 'coil', mark: '◎', label: 'Coil' },
  { key: 'ember', mark: '✶', label: 'Ember' },
  { key: 'pearl', mark: '●', label: 'Pearl' },
  { key: 'scale', mark: '◇', label: 'Scale' },
  { key: 'lantern', mark: '⌂', label: 'Lantern' },
  { key: 'cloud', mark: '☁', label: 'Cloud' },
];

const wyrmCoil = {
  HIGH_KEY: 'goldendale_wyrm_coil_high',
  open: false,
  spinning: false,
  taken: 0,
  running: 0,
  lastAward: null,
  autoOpenedFor: null,
  roundId: null,

  slotsFrom(state) {
    const games = state && state.sideGames && state.sideGames.games;
    return (games && games.birdieSlots) || { on: false, spins: 0, spinLog: [] };
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

  progressKey(roundId) {
    return 'goldendale_wyrm_coil_play_' + String(roundId || '');
  },

  loadProgress(roundId) {
    try {
      const raw = sessionStorage.getItem(this.progressKey(roundId));
      if (!raw) return { taken: 0, running: 0 };
      const data = JSON.parse(raw);
      return { taken: Number(data.taken) || 0, running: Number(data.running) || 0 };
    } catch {
      return { taken: 0, running: 0 };
    }
  },

  saveProgress() {
    try {
      sessionStorage.setItem(this.progressKey(this.roundId), JSON.stringify({
        taken: this.taken,
        running: this.running,
      }));
    } catch { /* ignore */ }
  },

  iconAt(seed, reel, row) {
    const n = Math.abs((Number(seed) || 0) * 31 + reel * 17 + row * 7);
    return WYRM_ICONS[n % WYRM_ICONS.length];
  },

  reelHtml(seed, spinning) {
    return [0, 1, 2].map((reel) => {
      const cells = [0, 1, 2].map((row) => {
        const icon = this.iconAt(seed, reel, row);
        const pay = row === 1 ? ' is-pay' : '';
        return `<div class="wyrm-cell wyrm-${icon.key}${pay}" title="${icon.label}"><span>${icon.mark}</span><em>${icon.label}</em></div>`;
      }).join('');
      return `<div class="wyrm-reel${spinning ? ' is-spinning' : ''}" data-reel="${reel}"><div class="wyrm-reel-strip">${cells}</div></div>`;
    }).join('');
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
      <p>Wyrm Coil · fun only. ${g} gross + ${net} net better than par.</p>
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
    const saved = this.loadProgress(this.roundId);
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
    return Math.max(0, (Number(slots.spins) || 0) - this.taken);
  },

  currentSpin(slots) {
    const log = slots.spinLog || [];
    return log[this.taken] || null;
  },

  render(state) {
    const slots = this.slotsFrom(state);
    const left = this.remaining(slots);
    const spin = this.lastAward || this.currentSpin(slots) || { points: 0, hole: '—', kind: '', name: '' };
    const seed = (this.roundId || 0) * 17 + this.taken * 13 + (spin.points || 0) * 5;
    const high = this.saveHigh(this.running);
    const done = left === 0;
    let host = document.getElementById('wyrm-coil-overlay');
    if (!host) {
      host = document.createElement('div');
      host.id = 'wyrm-coil-overlay';
      host.className = 'wyrm-coil-overlay';
      document.body.appendChild(host);
    }
    host.innerHTML = `
      <div class="wyrm-coil-machine" role="dialog" aria-modal="true" aria-labelledby="wyrm-coil-title">
        <div class="wyrm-coil-crest" aria-hidden="true">
          <svg viewBox="0 0 80 48" width="80" height="48">
            <path d="M8 32c10-18 22-22 32-10 6 7 10 8 18 4 8-4 14-2 14 6" fill="none" stroke="#e6c36a" stroke-width="3" stroke-linecap="round"/>
            <circle cx="18" cy="22" r="3" fill="#7cffc4"/>
            <path d="M58 28c6 0 10 4 10 8" fill="none" stroke="#ff8a4c" stroke-width="2"/>
          </svg>
        </div>
        <h2 id="wyrm-coil-title">Wyrm Coil</h2>
        <p class="wyrm-coil-tag">Birdie dragon slots · fun only · not a settle</p>
        <div class="wyrm-screens" aria-hidden="true">${this.reelHtml(seed, this.spinning)}</div>
        <div class="wyrm-coil-stats">
          <div><span>Spins left</span><strong>${left}</strong></div>
          <div><span>This spin</span><strong>${this.lastAward ? '+' + this.lastAward.points : '—'}</strong></div>
          <div><span>Running</span><strong>${this.running}</strong></div>
          <div><span>Best</span><strong>${high}</strong></div>
        </div>
        <p class="wyrm-coil-note">${done
          ? (slots.spins ? 'Coil rest. You took every birdie spin from this card.' : 'No gross or net birdies — the coil stays dark.')
          : `${spin.name || 'A birdie'} · hole ${spin.hole} · ${spin.kind || ''} birdie`}</p>
        <div class="wyrm-coil-actions">
          <button type="button" class="btn btn-accent" id="wyrm-coil-spin" ${done || this.spinning ? 'disabled' : ''}>${done ? 'Done' : 'Spin'}</button>
          <button type="button" class="btn btn-secondary" id="wyrm-coil-close">Close</button>
        </div>
      </div>`;
    document.getElementById('wyrm-coil-close').onclick = () => this.hide();
    const spinBtn = document.getElementById('wyrm-coil-spin');
    if (spinBtn) spinBtn.onclick = () => this.takeSpin(state);
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
      this.saveHigh(this.running);
      this.render(state);
    }, 720);
  },
};

if (typeof module === 'object' && module.exports) {
  module.exports = wyrmCoil;
}
if (typeof window !== 'undefined') {
  window.wyrmCoil = wyrmCoil;
}
