/**
 * 19th-hole unlock. Own-team write lock + show-other OFF must not
 * block the 19th because opposing teams still have blanks.
 */

function sameTeamIds(a, b) {
  if (a == null || b == null || a === '' || b === '') return false;
  return Number(a) === Number(b) && Number.isFinite(Number(a));
}

function canWriteMember(me, target) {
  if (!me || !target) return false;
  return sameTeamIds(me.team_id ?? me.teamId, target.team_id ?? target.teamId);
}

function holeNumbers(holes) {
  return (holes || []).map((h) => Number(h.hole_number ?? h.holeNumber)).filter((n) => Number.isFinite(n));
}

function playerComplete(member, holes) {
  const nums = holeNumbers(holes);
  if (!member || !nums.length) return false;
  return nums.every((n) => {
    const hs = (member.holes || []).find((x) => Number(x.holeNumber) === n);
    return hs && hs.gross != null;
  });
}

function assignedMembers(members) {
  return (members || []).filter((m) => m && m.team_id != null && m.team_id !== '');
}

function writableMembers(members, me) {
  return assignedMembers(members).filter((m) => canWriteMember(me, m));
}

function teamComplete(members, teamId, holes) {
  const roster = assignedMembers(members).filter((m) => sameTeamIds(m.team_id ?? m.teamId, teamId));
  return roster.length > 0 && roster.every((m) => playerComplete(m, holes));
}

function writableRosterComplete(state, me) {
  const roster = writableMembers(state && state.members, me);
  const holes = state && state.holes;
  return roster.length > 0 && roster.every((m) => playerComplete(m, holes));
}

function anyTeamComplete(state) {
  const holes = state && state.holes;
  return ((state && state.teams) || []).some((t) => teamComplete(state.members, t.id, holes));
}

function canOpenNineteenth(state, me, organizer) {
  if (writableRosterComplete(state, me)) return true;
  if (organizer && anyTeamComplete(state)) return true;
  return false;
}

function nineteenthNeedsConfirm(state, organizer) {
  if (!organizer) return false;
  const holes = state && state.holes;
  const roster = assignedMembers(state && state.members);
  return roster.some((m) => !playerComplete(m, holes));
}

const nineteenApi = {
  sameTeamIds,
  canWriteMember,
  playerComplete,
  writableMembers,
  writableRosterComplete,
  teamComplete,
  anyTeamComplete,
  canOpenNineteenth,
  nineteenthNeedsConfirm,
};

if (typeof module === 'object' && module.exports) {
  module.exports = nineteenApi;
}
if (typeof window !== 'undefined') {
  window.nineteen = nineteenApi;
}
