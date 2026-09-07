const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sameTeamIds, canWriteTeamScore, canAddGuestToTeam, canManageRosterMember, isFollowAlong, isFollowShowOtherOn } = require('../lib/scoring/teamWrite');

describe('Team write lock', () => {
  it('requires both sides to share a numeric team id', () => {
    assert.equal(sameTeamIds(1, 1), true);
    assert.equal(sameTeamIds('2', 2), true);
    assert.equal(sameTeamIds(1, 2), false);
    assert.equal(sameTeamIds(null, 1), false);
    assert.equal(sameTeamIds(1, null), false);
    assert.equal(sameTeamIds('', ''), false);
  });

  it('allows a caller to write only a teammate', () => {
    const me = { id: 1, team_id: 10 };
    const mate = { id: 2, teamId: 10 };
    const other = { id: 3, team_id: 20 };
    const none = { id: 4, team_id: null };
    assert.equal(canWriteTeamScore(me, mate), true);
    assert.equal(canWriteTeamScore(me, other), false);
    assert.equal(canWriteTeamScore(me, none), false);
    assert.equal(canWriteTeamScore(none, none), false);
    assert.equal(canWriteTeamScore(null, mate), false);
  });

  it('lets a member add a guest only onto their own team', () => {
    const me = { id: 1, team_id: 10 };
    assert.equal(canAddGuestToTeam(me, 10), true);
    assert.equal(canAddGuestToTeam(me, '10'), true);
    assert.equal(canAddGuestToTeam(me, 20), false);
    assert.equal(canAddGuestToTeam({ id: 2, teamId: 7 }, 7), true);
    assert.equal(canAddGuestToTeam({ id: 3, team_id: null }, 10), false);
    assert.equal(canAddGuestToTeam(null, 10), false);
  });

  it('blocks Follow along from writing, adding, or managing even on their own team', () => {
    const follower = { id: 9, team_id: 10, role: 'follower' };
    const mate = { id: 2, team_id: 10, role: 'player' };
    assert.equal(isFollowAlong(follower), true);
    assert.equal(canWriteTeamScore(follower, mate), false);
    assert.equal(canWriteTeamScore(mate, follower), false);
    assert.equal(canAddGuestToTeam(follower, 10), false);
    assert.equal(canManageRosterMember(follower, mate, false), false);
    assert.equal(canManageRosterMember(mate, follower, false), false);
    assert.equal(canManageRosterMember(follower, mate, true), false);
    assert.equal(isFollowShowOtherOn({ role: 'follower', follow_show_other: 1 }), true);
    assert.equal(isFollowShowOtherOn({ role: 'follower', follow_show_other: 0 }), false);
  });

  it('lets joiners manage only their own team and organizers manage anyone', () => {
    const me = { id: 1, team_id: 10 };
    const mate = { id: 2, team_id: 10 };
    const other = { id: 3, team_id: 20 };
    assert.equal(canManageRosterMember(me, mate, false), true);
    assert.equal(canManageRosterMember(me, other, false), false);
    assert.equal(canManageRosterMember(me, other, true), true);
  });
});
