/**
 * Multi-device team write lock. A signed-in player may enter scores only
 * for members who share that player's team. No team → no writes.
 */

function sameTeamIds(a, b) {
  if (a == null || b == null || a === '' || b === '') return false;
  return Number(a) === Number(b) && Number.isFinite(Number(a));
}

function canWriteTeamScore(me, target) {
  if (!me || !target) return false;
  return sameTeamIds(me.team_id ?? me.teamId, target.team_id ?? target.teamId);
}

function canAddGuestToTeam(me, teamId) {
  if (!me) return false;
  return sameTeamIds(me.team_id ?? me.teamId, teamId);
}

function canManageRosterMember(me, target, organizer) {
  if (organizer) return true;
  return canWriteTeamScore(me, target);
}

module.exports = { sameTeamIds, canWriteTeamScore, canAddGuestToTeam, canManageRosterMember };
