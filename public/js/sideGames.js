/**
 * Side-game presets and plain-English rules. Scoring math lives on the server.
 * Scores are entered once; every active game reads the same hole scores.
 */
const SIDE_GAMES = [
  {
    key: 'skins',
    label: 'Skins',
    defaultOn: false,
    pressable: false,
    defaults: { on: false, pot: 20 },
    rule: 'One pot. Gross skins and net skins both run from the same scores. A tie for low kills that hole — no carryovers. Net plays off the low man, strokes by stroke index. Value per skin = pot ÷ (gross skins won + net skins won). The same hole can win both (counts as 2). Default OFF.',
  },
  {
    key: 'vegas',
    label: 'Vegas',
    defaultOn: false,
    pressable: true,
    defaults: { on: false, scoring: 'gross', dollarsPerPoint: 1 },
    rule: '2v2. Each side’s two hole scores become a number, low first (4 and 5 = 45). 10 or more is written high-first (10 and 4 = 104). That is not the 1G+2N vs-par team total. This-hole points = the difference. The winner adds those points and the loser subtracts the same (zero-sum). Example: H1 A +11 / B −11; H2 B wins 8 → A +3 / B −3. Birdie or eagle (or better) flips the other side so their high score goes first. If both sides birdie or better, both numbers flip — they do not cancel. Net Vegas uses net numbers; a flip still requires a gross birdie or better. $ per point. Presses from the current hole to 18.',
  },
  {
    key: 'nassau',
    label: 'Nassau',
    defaultOn: false,
    pressable: true,
    defaults: { on: false, scoring: 'net', front: 2, back: 2, overall: 2 },
    rule: 'NASA means Nassau. Classic three independent bets: Front 1–9, Back 10–18, and Overall 1–18. Each hole is match play (lower team score wins the hole). Gross uses the sum of that hole’s gross scores; net uses the sum of nets. Winner of a segment is the side that wins more holes (or AS). Anyone can press. A press is a new wager from that hole through the end of that segment only — Front dies at 9, Back at 18, Overall tap→18. Original bets stay live. Front, Back, and Overall can be pressed independently (hole 12 can press Back and Overall). No auto 2-down.',
  },
  {
    key: 'wolf',
    label: 'Wolf',
    defaultOn: false,
    pressable: true,
    defaults: { on: false, scoring: 'gross', dollarsPerPoint: 1 },
    rule: '3–5 players typical. Wolf rotates each hole — new Wolf and new sides every hole, not fixed Team 1/2. After each tee, Wolf picks that player or passes. Sides lock before the hole is scored. Partnered hole = 1×. Lone Wolf after seeing drives = 2×. Blind Lone Wolf claimed before others tee = 3×. Low ball of Wolf’s side vs the field. Gross or net (net off low man). Presses optional, current hole to 18.',
  },
  {
    key: 'nines',
    label: 'Nines',
    defaultOn: false,
    pressable: true,
    defaults: { on: false, scoring: 'net', blitz: true, dollarsPerPoint: 1 },
    rule: 'Exactly 3 players. 9 points a hole: 5-3-1. Ties split 4-4-1, 5-2-2, or 3-3-3. Blitz (default ON): beat 2nd by 2 or more strokes and take 9-0-0. Gross or net (net off the low man). $ per point. Presses from the current hole to 18.',
  },
];

function defaultSideGames() {
  const out = {};
  for (const game of SIDE_GAMES) out[game.key] = { ...game.defaults };
  return out;
}

function parseSideGames(raw) {
  let obj = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) obj = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try { obj = JSON.parse(raw); } catch { obj = {}; }
  }
  const out = defaultSideGames();
  for (const game of SIDE_GAMES) {
    const src = obj[game.key] || {};
    out[game.key] = { ...out[game.key], ...src, on: !!src.on };
    if (game.key === 'nines' && src.blitz === undefined) out.nines.blitz = true;
  }
  const slots = obj.birdieSlots || {};
  out.birdieSlots = { on: slots.on !== false };
  const kps = obj.kps || {};
  const holes = Array.isArray(kps.holes) ? kps.holes.map(Number).filter((n) => n >= 1 && n <= 18) : [];
  out.kps = {
    on: !!kps.on,
    holes,
    winners: kps.winners && typeof kps.winners === 'object' && !Array.isArray(kps.winners) ? kps.winners : {},
  };
  return out;
}

function sideGameRule(key) {
  const game = SIDE_GAMES.find((g) => g.key === key);
  return game ? game.rule : '';
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '$0';
  const abs = Math.abs(n);
  const shown = Number.isInteger(abs) ? String(abs) : abs.toFixed(2);
  return n > 0 ? '+$' + shown : '−$' + shown;
}

const api = {
  SIDE_GAMES,
  defaultSideGames,
  parseSideGames,
  sideGameRule,
  formatMoney,
};

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.sideGames = api;
}
