/**
 * Skins: one pot, gross AND net from the same scores. No carryovers.
 * Tie for low = that skin is dead. Net plays off the low man.
 * Value per skin = pot ÷ (gross skins won + net skins won). Same hole can win both.
 */
const { lowManNetOnHole, scoreOnHole } = require('./lowMan');

function uniqueLow(entries, key) {
  const scored = (entries || []).filter((e) => e[key] != null && Number.isFinite(Number(e[key])));
  if (scored.length < 2) return null;
  let best = Infinity;
  for (const e of scored) {
    const n = Number(e[key]);
    if (n < best) best = n;
  }
  const winners = scored.filter((e) => Number(e[key]) === best);
  return winners.length === 1 ? winners[0] : null;
}

function bump(map, id, name) {
  const cur = map.get(id) || { id, name, count: 0 };
  cur.count += 1;
  cur.name = name || cur.name;
  map.set(id, cur);
}

function scoreSkins({ holes, players, pot, startHole, endHole } = {}) {
  const potValue = Math.max(0, Number(pot) || 0);
  const start = Number(startHole) || 1;
  const end = Number(endHole) || 18;
  const grossMap = new Map();
  const netMap = new Map();
  const holeRows = [];
  let grossWon = 0;
  let netWon = 0;

  for (const hole of holes || []) {
    const hn = hole.holeNumber ?? hole.hole_number;
    if (hn < start || hn > end) continue;
    const onHole = (players || []).map((p) => {
      const hs = scoreOnHole(p, hn);
      return {
        id: p.id,
        name: p.display_name || p.name,
        handicap: p.playing_handicap ?? p.playingHandicap ?? p.handicap,
        playingHandicap: p.playing_handicap ?? p.playingHandicap ?? p.handicap,
        gross: hs.gross,
      };
    }).filter((p) => p.gross != null && p.gross !== '');

    const withNet = lowManNetOnHole(onHole, hole);
    const gWin = uniqueLow(withNet, 'gross');
    const nWin = uniqueLow(withNet, 'lowManNet');
    if (gWin) {
      grossWon += 1;
      bump(grossMap, gWin.id, gWin.name);
    }
    if (nWin) {
      netWon += 1;
      bump(netMap, nWin.id, nWin.name);
    }
    holeRows.push({
      holeNumber: hn,
      gross: gWin ? { playerId: gWin.id, name: gWin.name } : { dead: true },
      net: nWin ? { playerId: nWin.id, name: nWin.name } : { dead: true },
    });
  }

  const skinCount = grossWon + netWon;
  const valuePerSkin = skinCount > 0 ? potValue / skinCount : 0;
  const money = new Map();
  for (const row of grossMap.values()) {
    money.set(row.id, (money.get(row.id) || 0) + row.count * valuePerSkin);
  }
  for (const row of netMap.values()) {
    money.set(row.id, (money.get(row.id) || 0) + row.count * valuePerSkin);
  }

  return {
    kind: 'skins',
    pot: potValue,
    valuePerSkin,
    grossSkins: grossWon,
    netSkins: netWon,
    skinCount,
    holes: holeRows,
    grossWinners: [...grossMap.values()],
    netWinners: [...netMap.values()],
    money: [...money.entries()].map(([id, dollars]) => ({ id, dollars })),
  };
}

module.exports = { scoreSkins, uniqueLow };
