/**
 * Multi-device team write lock. A signed-in scorekeeper may enter scores only
 * for members who share that player's team. The game host / organizer may
 * enter every team's hole scores (one-phone Vegas). Follow along is read-only
 * even on their own team. No team → no writes for non-hosts.
 */

function sameTeamIds(a, b) {
  if (a == null || b == null || a === '' || b === '') return false;
  return Number(a) === Number(b) && Number.isFinite(Number(a));
}

function memberTeamIds(member) {
  if (!member) return [];
  const ids = [];
  const home = member.team_id ?? member.teamId;
  const fill = member.fill_team_id ?? member.fillTeamId;
  if (home != null && home !== '' && Number.isFinite(Number(home))) ids.push(Number(home));
  if (fill != null && fill !== '' && Number.isFinite(Number(fill)) && !sameTeamIds(fill, home)) {
    ids.push(Number(fill));
  }
  return ids;
}

function memberOnTeam(member, teamId) {
  return memberTeamIds(member).some((id) => sameTeamIds(id, teamId));
}

function shareAnyTeam(a, b) {
  const left = memberTeamIds(a);
  return left.some((id) => memberOnTeam(b, id));
}

function memberRole(member) {
  return String((member && member.role) || '').toLowerCase();
}

function isFollowAlong(member) {
  const role = memberRole(member);
  return role === 'follower' || role === 'follow' || role === 'follow_along';
}

function isFollowShowOtherOn(member) {
  if (!member) return false;
  return member.followShowOther === true
    || member.follow_show_other === 1
    || member.follow_show_other === true
    || member.follow_show_other === '1';
}

function canSeeTeammate(me, target) {
  if (!me || !target) return false;
  return shareAnyTeam(me, target);
}

function canWriteTeamScore(me, target, organizer) {
  if (!target) return false;
  if (isFollowAlong(me) || isFollowAlong(target)) return false;
  if (organizer) return true;
  if (!me) return false;
  return shareAnyTeam(me, target);
}

function canAddGuestToTeam(me, teamId) {
  if (!me || isFollowAlong(me)) return false;
  return sameTeamIds(me.team_id ?? me.teamId, teamId);
}

function canManageRosterMember(me, target, organizer) {
  if (isFollowAlong(me)) return false;
  if (isFollowAlong(target) && !organizer) return false;
  if (organizer) return true;
  return canWriteTeamScore(me, target);
}

module.exports = {
  sameTeamIds,
  memberTeamIds,
  memberOnTeam,
  shareAnyTeam,
  memberRole,
  isFollowAlong,
  isFollowShowOtherOn,
  canSeeTeammate,
  canWriteTeamScore,
  canAddGuestToTeam,
  canManageRosterMember,
};
