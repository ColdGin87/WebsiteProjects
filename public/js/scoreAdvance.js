/**
 * Score-entry advance. Down walks writable players on this hole,
 * then wraps to player 1 on the next hole. Across stays on one player.
 */

function sameTeamIds(a, b) {
  if (a == null || b == null || a === '' || b === '') return false;
  return Number(a) === Number(b) && Number.isFinite(Number(a));
}

function canWriteMember(me, target) {
  if (!me || !target) return false;
  return sameTeamIds(me.team_id ?? me.teamId, target.team_id ?? target.teamId);
}

function holeNumberOf(hole) {
  return Number(hole && (hole.hole_number ?? hole.holeNumber));
}

function writableAdvanceMembers(members, me, orderIds) {
  const list = members || [];
  const byId = new Map(list.map((m) => [Number(m.id), m]));
  const ordered = (orderIds && orderIds.length)
    ? orderIds.map((id) => byId.get(Number(id))).filter(Boolean)
    : list;
  return ordered.filter((m) => canWriteMember(me, m));
}

function nextDownTarget({ members, me, orderIds, holes, memberId, holeNumber }) {
  const roster = writableAdvanceMembers(members, me, orderIds);
  if (!roster.length) return null;
  const idx = roster.findIndex((m) => Number(m.id) === Number(memberId));
  const at = idx < 0 ? 0 : idx;
  if (roster[at + 1]) {
    return { memberId: roster[at + 1].id, holeNumber: Number(holeNumber) };
  }
  const list = holes || [];
  const hIdx = list.findIndex((h) => holeNumberOf(h) === Number(holeNumber));
  const nextHole = list[hIdx + 1];
  if (!nextHole) return null;
  return { memberId: roster[0].id, holeNumber: holeNumberOf(nextHole) };
}

function nextAcrossTarget({ holes, memberId, holeNumber }) {
  const list = holes || [];
  const hIdx = list.findIndex((h) => holeNumberOf(h) === Number(holeNumber));
  const nextHole = list[hIdx + 1];
  if (!nextHole) return null;
  return { memberId, holeNumber: holeNumberOf(nextHole) };
}

const scoreAdvanceApi = {
  canWriteMember,
  writableAdvanceMembers,
  nextDownTarget,
  nextAcrossTarget,
};

if (typeof module === 'object' && module.exports) {
  module.exports = scoreAdvanceApi;
}
if (typeof window !== 'undefined') {
  window.scoreAdvance = scoreAdvanceApi;
}
