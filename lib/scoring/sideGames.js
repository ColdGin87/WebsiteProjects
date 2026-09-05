const { parseSideGames, SIDE_GAMES, formatMoney } = require('../../public/js/sideGames');
const { scoreSkins } = require('./skins');
const { scoreVegas } = require('./vegas');
const { scoreNassau, playSegment } = require('./nassau');
const { scoreWolf } = require('./wolf');
const { scoreNines } = require('./nines');

function stringifySideGames(config) {
  return JSON.stringify(parseSideGames(config));
}

function nassauSegmentForHole(holeNumber) {
  return Number(holeNumber) <= 9 ? 'front' : 'back';
}

function segmentEnd(segment) {
  if (segment === 'front') return 9;
  return 18;
}

function mergeMoney(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row.id);
    const cur = map.get(key) || { id: row.id, name: row.name, dollars: 0 };
    cur.dollars += Number(row.dollars) || 0;
    if (row.name) cur.name = row.name;
    map.set(key, cur);
  }
  return [...map.values()];
}

function computeOne(kind, payload) {
  if (kind === 'skins') return scoreSkins(payload);
  if (kind === 'vegas') return scoreVegas(payload);
  if (kind === 'nassau') return scoreNassau(payload);
  if (kind === 'wolf') return scoreWolf(payload);
  if (kind === 'nines') return scoreNines(payload);
  return null;
}

function pressNassau(base, press, holes, teams, scoring) {
  const segment = press.segment || nassauSegmentForHole(press.startHole);
  const start = Number(press.startHole) || 1;
  const end = Math.min(Number(press.endHole) || segmentEnd(segment), segmentEnd(segment));
  const sides = (teams || []).filter((t) => (t.members || []).length).slice(0, 2);
  if (sides.length < 2) return [];
  const stake = press.dollars != null ? Number(press.dollars) : (base.stakes && base.stakes[segment]) || 0;
  const played = playSegment(holes, sides[0], sides[1], scoring, start, end);
  if (!played.winner || !stake) return [];
  const winner = played.winner === 'A' ? sides[0] : sides[1];
  const loser = played.winner === 'A' ? sides[1] : sides[0];
  return [
    { id: winner.id, name: winner.name, dollars: stake, press: true, segment },
    { id: loser.id, name: loser.name, dollars: -stake, press: true, segment },
  ];
}

function computeSideGames({ config, holes, members, teams, presses, wolfPicks } = {}) {
  const cfg = parseSideGames(config);
  const games = {};
  let money = [];
  const strip = [];

  if (cfg.skins.on) {
    games.skins = scoreSkins({ holes, players: members, pot: cfg.skins.pot });
    money = money.concat(games.skins.money || []);
    const s = games.skins;
    strip.push(`Skins ${s.grossSkins}G/${s.netSkins}N ${s.skinCount ? formatMoney(s.valuePerSkin) + '/skin' : '—'}`);
  }
  if (cfg.vegas.on) {
    games.vegas = scoreVegas({
      holes,
      teams,
      scoring: cfg.vegas.scoring,
      dollarsPerPoint: cfg.vegas.dollarsPerPoint,
    });
    money = money.concat(games.vegas.money || []);
    const v = games.vegas;
    if (v.teamA && v.teamB) {
      strip.push(`Vegas ${v.teamA.name} ${v.teamA.points}–${v.teamB.points} ${v.teamB.name}`);
    } else {
      strip.push('Vegas —');
    }
  }
  if (cfg.nassau.on) {
    games.nassau = scoreNassau({
      holes,
      teams,
      scoring: cfg.nassau.scoring,
      front: cfg.nassau.front,
      back: cfg.nassau.back,
      overall: cfg.nassau.overall,
    });
    money = money.concat(games.nassau.money || []);
    const n = games.nassau;
    if (n.front) {
      strip.push(`Nassau F ${n.front.status} · B ${n.back.status} · 18 ${n.overall.status}`);
    } else {
      strip.push('Nassau —');
    }
  }
  if (cfg.wolf.on) {
    games.wolf = scoreWolf({
      holes,
      members,
      picks: wolfPicks,
      scoring: cfg.wolf.scoring,
      dollarsPerPoint: cfg.wolf.dollarsPerPoint,
    });
    money = money.concat(games.wolf.money || []);
    const lead = [...(games.wolf.points || [])].sort((a, b) => b.points - a.points)[0];
    strip.push(lead ? `Wolf ${lead.name} ${lead.points > 0 ? '+' : ''}${lead.points}` : 'Wolf —');
  }
  if (cfg.nines.on) {
    games.nines = scoreNines({
      holes,
      members,
      scoring: cfg.nines.scoring,
      blitz: cfg.nines.blitz,
      dollarsPerPoint: cfg.nines.dollarsPerPoint,
    });
    money = money.concat(games.nines.money || []);
    if (games.nines.incomplete) strip.push('Nines (need 3)');
    else {
      const bits = (games.nines.points || []).map((p) => `${p.name} ${p.points}`).join(' · ');
      strip.push('Nines ' + bits);
    }
  }

  for (const press of presses || []) {
    const key = press.game_key || press.gameKey;
    if (!cfg[key] || !cfg[key].on) continue;
    const startHole = press.start_hole ?? press.startHole;
    const endHole = press.end_hole ?? press.endHole ?? 18;
    const dollars = press.dollars;
    if (key === 'nassau') {
      money = money.concat(pressNassau(games.nassau || {}, press, holes, teams, cfg.nassau.scoring));
      continue;
    }
    const extra = computeOne(key, {
      holes,
      players: members,
      members,
      teams,
      picks: wolfPicks,
      scoring: cfg[key].scoring,
      dollarsPerPoint: dollars != null ? dollars : cfg[key].dollarsPerPoint,
      pot: cfg.skins.pot,
      blitz: cfg.nines.blitz,
      front: dollars,
      back: 0,
      overall: 0,
      startHole,
      endHole,
    });
    if (extra && extra.money) money = money.concat(extra.money.map((row) => ({ ...row, press: true })));
  }

  const net = mergeMoney(money);
  const all = net.reduce((s, row) => s + (Number(row.dollars) || 0), 0);
  const allBits = net
    .filter((row) => row.dollars)
    .map((row) => `${row.name} ${formatMoney(row.dollars)}`)
    .join(' · ');
  if (allBits) strip.push('All games ' + allBits);

  return {
    config: cfg,
    games,
    money: net,
    allGamesNet: all,
    strip,
    stripText: strip.join(' · '),
  };
}

module.exports = {
  SIDE_GAMES,
  parseSideGames,
  stringifySideGames,
  formatMoney,
  computeSideGames,
  nassauSegmentForHole,
  segmentEnd,
};
