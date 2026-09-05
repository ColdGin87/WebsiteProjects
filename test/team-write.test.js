const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { sameTeamIds, canWriteTeamScore } = require('../lib/scoring/teamWrite');

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
});
