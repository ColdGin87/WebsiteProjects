/**
 * Wolf: rotating wolf each hole. Sides are per hole, not fixed Team 1/2.
 * Point values are setup toggles. Defaults: partnered ±1, lone ±2, blind ±4.
 * Low ball of each side. Gross or net (net off low man). Tie = no points.
 */

function wolfValues(raw) {
  const src = raw || {};
  const n = (v, fallback) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : fallback;
  };
  return {
    partnered: n(src.partnered ?? src.partneredPoints, 1),
    lone: n(src.lone ?? src.lonePoints, 2),
    blind: n(src.blind ?? src.blindPoints, 4),
  };
}
const { lowManNetOnHole, scoreOnHole } = require('./lowMan');

function rotationWolf(members, holeNumber) {
  const ordered = [...(members || [])].sort((a, b) => Number(a.id) - Number(b.id));
  if (!ordered.length) return null;
  return ordered[(Math.max(1, Number(holeNumber)) - 1) % ordered.length];
}

function pickForHole(picks, holeNumber, members) {
  const listed = (picks || []).find((p) => Number(p.holeNumber ?? p.hole_number) === Number(holeNumber));
  const wolf = rotationWolf(members, holeNumber);
  if (!wolf) return null;
  if (!listed) {
    return { wolfMemberId: wolf.id, partnerMemberId: null, lone: false, blind: false, pending: true };
  }
  const partnerMemberId = listed.partner_member_id ?? listed.partnerMemberId ?? null;
  const blind = !!(listed.blind || listed.blind_wolf);
  const lone = blind || !!(listed.lone || listed.lone_wolf) || !partnerMemberId;
  const locked = listed.locked === 1 || listed.locked === true || blind || !!(listed.lone || listed.lone_wolf) || !!partnerMemberId;
  return {
    wolfMemberId: listed.wolf_member_id ?? listed.wolfMemberId ?? wolf.id,
    partnerMemberId: locked && !lone ? partnerMemberId : (lone ? null : partnerMemberId),
    lone: locked && lone,
    blind,
    pending: !locked,
  };
}

function bestScore(players, key) {
  let best = null;
  for (const p of players || []) {
    const n = p[key];
    if (n == null || !Number.isFinite(Number(n))) continue;
    if (best == null || Number(n) < best) best = Number(n);
  }
  return best;
}

function scoreWolfHole({ players, hole, pick, scoring, values } = {}) {
  if (!pick || pick.pending) {
    return { incomplete: true, points: 0, winner: null, pending: true, wolfMemberId: pick && pick.wolfMemberId };
  }
  const onHole = (players || []).map((p) => {
    const hs = scoreOnHole(p, hole.holeNumber ?? hole.hole_number);
    return {
      id: p.id,
      name: p.display_name || p.name,
      handicap: p.playing_handicap ?? p.playingHandicap ?? p.handicap,
      playingHandicap: p.playing_handicap ?? p.playingHandicap ?? p.handicap,
      gross: hs.gross,
      net: hs.net,
    };
  });
  const withNet = lowManNetOnHole(onHole, hole);
  const key = scoring === 'net' ? 'lowManNet' : 'gross';
  const wolfId = pick.wolfMemberId;
  const blind = !!pick.blind;
  const lone = blind || !!pick.lone || !pick.partnerMemberId;
  const wolfSideIds = new Set([wolfId]);
  if (!lone && pick.partnerMemberId) wolfSideIds.add(pick.partnerMemberId);
  const wolfSide = withNet.filter((p) => wolfSideIds.has(p.id));
  const field = withNet.filter((p) => !wolfSideIds.has(p.id));
  const wolfBest = bestScore(wolfSide, key);
  const fieldBest = bestScore(field, key);
  if (wolfBest == null || fieldBest == null) {
    return { incomplete: true, points: 0, winner: null, lone, blind, wolfMemberId: wolfId };
  }
  const units = wolfValues(values);
  const multiplier = blind ? units.blind : (lone ? units.lone : units.partnered);
  let winner = null;
  if (wolfBest < fieldBest) winner = 'wolf';
  else if (fieldBest < wolfBest) winner = 'field';
  return {
    incomplete: false,
    winner,
    points: winner ? multiplier : 0,
    lone,
    blind,
    wolfMemberId: wolfId,
    partnerMemberId: lone ? null : pick.partnerMemberId,
    wolfBest,
    fieldBest,
  };
}

function scoreWolf({ holes, members, picks, scoring, dollarsPerPoint, startHole, endHole, values } = {}) {
  const stake = Number.isFinite(Number(dollarsPerPoint)) ? Number(dollarsPerPoint) : 1;
  const start = Number(startHole) || 1;
  const end = Number(endHole) || 18;
  const mode = scoring === 'net' ? 'net' : 'gross';
  const points = new Map();
  const holeRows = [];
  for (const hole of holes || []) {
    const hn = hole.holeNumber ?? hole.hole_number;
    if (hn < start || hn > end) continue;
    const pick = pickForHole(picks, hn, members);
    const row = scoreWolfHole({ players: members, hole, pick, scoring: mode, values });
    holeRows.push({ holeNumber: hn, ...row });
    if (row.incomplete || !row.winner) continue;
    const wolfId = row.wolfMemberId;
    const partnerId = row.partnerMemberId;
    const fieldIds = (members || [])
      .map((m) => m.id)
      .filter((id) => id !== wolfId && id !== partnerId);
    const unit = row.points;
    if (row.winner === 'wolf') {
      points.set(wolfId, (points.get(wolfId) || 0) + unit);
      if (partnerId) points.set(partnerId, (points.get(partnerId) || 0) + unit);
      for (const id of fieldIds) points.set(id, (points.get(id) || 0) - unit);
    } else {
      for (const id of fieldIds) points.set(id, (points.get(id) || 0) + unit);
      points.set(wolfId, (points.get(wolfId) || 0) - unit);
      if (partnerId) points.set(partnerId, (points.get(partnerId) || 0) - unit);
    }
  }
  const nameOf = (id) => {
    const m = (members || []).find((x) => x.id === id);
    return m ? (m.display_name || m.name) : String(id);
  };
  return {
    kind: 'wolf',
    scoring: mode,
    dollarsPerPoint: stake,
    holes: holeRows,
    points: [...points.entries()].map(([id, pts]) => ({ id, name: nameOf(id), points: pts })),
    money: [...points.entries()].map(([id, pts]) => ({ id, name: nameOf(id), dollars: pts * stake })),
  };
}

module.exports = { rotationWolf, pickForHole, wolfValues, scoreWolfHole, scoreWolf };
