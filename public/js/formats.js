/**
 * Team game presets. Team hole/race totals are vs par, not stroke sums.
 */
const TEAM_GAMES = [
  { key: '3G', grossBalls: 3, netBalls: 0, label: '3 gross' },
  { key: '3N', grossBalls: 0, netBalls: 3, label: '3 net' },
  { key: '1G1N', grossBalls: 1, netBalls: 1, label: '1 gross + 1 net' },
  { key: '1G2N', grossBalls: 1, netBalls: 2, label: '1 gross + 2 net (Goldendale default)', isDefault: true },
  { key: '1G3N', grossBalls: 1, netBalls: 3, label: '1 gross + 3 net' },
  { key: '2G2N', grossBalls: 2, netBalls: 2, label: '2 gross + 2 net' },
];

function gameFromBalls(grossBalls, netBalls) {
  const g = Number(grossBalls);
  const n = Number(netBalls);
  return TEAM_GAMES.find((game) => game.grossBalls === g && game.netBalls === n)
    || TEAM_GAMES.find((game) => game.isDefault);
}

function gameFromKey(key) {
  return TEAM_GAMES.find((game) => game.key === key)
    || TEAM_GAMES.find((game) => game.isDefault);
}

function formatRuleText(grossBalls, netBalls) {
  const g = Math.max(0, Number(grossBalls) || 0);
  const n = Math.max(0, Number(netBalls) || 0);
  const parts = [];
  if (g) parts.push(g === 1 ? '1 gross score' : `${g} gross scores`);
  if (n) parts.push(n === 1 ? '1 net score' : `${n} net scores`);
  const who = parts.length ? parts.join(' and ') : 'no balls';
  const distinct = g + n;
  const people = distinct === 1 ? '1 player' : `${distinct} different players`;
  return `Count the best ${who} from ${people}. Each counted ball is vs par (birdie −1, par E, bogey +1). The hole total is those vs-par values added together. Every legal assignment of distinct players to those slots is tried; the lowest (best) combo is kept. The race is the running vs-par total, not a stroke sum.`;
}

function formatLabel(grossBalls, netBalls) {
  const game = gameFromBalls(grossBalls, netBalls);
  if (game) return game.label.replace(' (Goldendale default)', '') + ' vs par';
  const g = Number(grossBalls) || 0;
  const n = Number(netBalls) || 0;
  return `${g} gross + ${n} net vs par`;
}

function shortFormatLabel(grossBalls, netBalls) {
  const game = gameFromBalls(grossBalls, netBalls);
  const key = (game && game.key) || '1G2N';
  return key.replace(/G(\d)/, 'G+$1');
}

const api = {
  TEAM_GAMES,
  gameFromBalls,
  gameFromKey,
  formatRuleText,
  formatLabel,
  shortFormatLabel,
};

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.teamFormats = api;
}
