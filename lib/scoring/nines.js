/**
 * Nines — exactly 3 players. 9 points/hole: 5-3-1.
 * Ties: 4-4-1 / 5-2-2 / 3-3-3.
 * Blitz (default on): win by 2+ strokes → 9-0-0.
 * Net is off the low man. $ per point.
 * Running totals SUM hole points through the hole you are on.
 */
const { lowManNetOnHole, scoreOnHole } = require('./lowMan');

function ninesPointGet(map, playerId) {
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
}

function ninesPointMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, val] of Object.entries(raw)) {
    if (val == null || !Number.isFinite(Number(val))) continue;
    out[String(key)] = Number(val);
  }
  return out;
}

function ninesHolePoints(three, blitz) {
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
}

function ninesPlayers(members) {
  const list = members || [];
  if (list.length !== 3) return null;
  return list;
}

function ninesRunningThrough(holes, holeNumber, playerId) {
  let sum = 0;
  let seen = false;
  const cap = Number(holeNumber);
  for (const h of holes || []) {
    const hn = Number(h.holeNumber ?? h.hole_number);
    if (!Number.isFinite(hn) || (Number.isFinite(cap) && hn > cap)) continue;
    if (h.incomplete || !h.points) continue;
    const add = ninesPointGet(h.points, playerId);
    if (add == null) continue;
    sum += add;
    seen = true;
  }
  return seen ? sum : null;
}

function scoreNines({ holes, members, scoring, blitz, dollarsPerPoint, startHole, endHole } = {}) {
  const three = ninesPlayers(members);
  const stake = Number.isFinite(Number(dollarsPerPoint)) ? Number(dollarsPerPoint) : 1;
  const useBlitz = blitz !== false;
  const mode = scoring === 'gross' ? 'gross' : 'net';
  const start = Number(startHole) || 1;
  const end = Number(endHole) || 18;
  if (!three) {
    return { kind: 'nines', incomplete: true, reason: 'Nines needs exactly 3 players', points: [], money: [], holes: [] };
  }
  const totals = new Map(three.map((m) => [m.id, 0]));
  const holeRows = [];
  for (const hole of holes || []) {
    const hn = hole.holeNumber ?? hole.hole_number;
    if (hn < start || hn > end) continue;
    const raw = three.map((m) => {
      const hs = scoreOnHole(m, hn);
      return {
        id: m.id,
        name: m.display_name || m.name,
        handicap: m.playing_handicap ?? m.playingHandicap ?? m.handicap,
        playingHandicap: m.playing_handicap ?? m.playingHandicap ?? m.handicap,
        gross: hs.gross,
        net: hs.net,
      };
    });
    const withNet = lowManNetOnHole(raw, hole);
    const keyed = withNet.map((p) => ({
      id: p.id,
      name: p.name,
      score: mode === 'gross' ? p.gross : p.lowManNet,
    }));
    const pts = ninesPointMap(ninesHolePoints(keyed, useBlitz));
    if (!Object.keys(pts).length) {
      holeRows.push({
        holeNumber: hn,
        incomplete: true,
        points: null,
        running: Object.fromEntries([...totals.entries()].map(([id, n]) => [String(id), n])),
        players: three.map((player) => ({
          id: player.id,
          name: player.display_name || player.name,
          hole: null,
          run: totals.get(player.id) || 0,
        })),
      });
      continue;
    }
    for (const player of three) {
      const add = ninesPointGet(pts, player.id) ?? 0;
      totals.set(player.id, (totals.get(player.id) || 0) + add);
    }
    holeRows.push({
      holeNumber: hn,
      incomplete: false,
      points: pts,
      running: Object.fromEntries([...totals.entries()].map(([id, n]) => [String(id), n])),
      players: three.map((player) => ({
        id: player.id,
        name: player.display_name || player.name,
        hole: ninesPointGet(pts, player.id) ?? 0,
        run: totals.get(player.id) || 0,
      })),
    });
  }
  const nameOf = (id) => {
    const m = three.find((x) => String(x.id) === String(id));
    return m ? (m.display_name || m.name) : String(id);
  };
  const points = [...totals.entries()].map(([id, pts]) => ({ id, name: nameOf(id), points: pts }));
  const mean = points.reduce((s, p) => s + p.points, 0) / (points.length || 1);
  return {
    kind: 'nines',
    incomplete: false,
    scoring: mode,
    blitz: useBlitz,
    dollarsPerPoint: stake,
    holes: holeRows,
    points,
    money: points.map((p) => ({ id: p.id, name: p.name, dollars: (p.points - mean) * stake })),
  };
}

module.exports = { ninesHolePoints, ninesPointGet, ninesPointMap, ninesRunningThrough, scoreNines };
