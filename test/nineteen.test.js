const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  canOpenNineteenth,
  nineteenthNeedsConfirm,
  writableRosterComplete,
  anyTeamComplete,
} = require('../public/js/nineteen');

function holes(n) {
  return Array.from({ length: n }, (_, i) => ({ hole_number: i + 1 }));
}

function member(id, teamId, scoredHoles) {
  return {
    id,
    team_id: teamId,
    holes: holes(18).map((h) => ({
      holeNumber: h.hole_number,
      gross: scoredHoles >= h.hole_number ? 4 : null,
    })),
  };
}

describe('19th hole unlock', () => {
  const eighteen = holes(18);
  const team1 = { id: 10, name: 'Team 1' };
  const team2 = { id: 20, name: 'Team 2' };

  it('lets Team 1 open 19th when their 18 is in and Team 2 is incomplete', () => {
    const state = {
      holes: eighteen,
      teams: [team1, team2],
      members: [
        member(1, 10, 18),
        member(2, 10, 18),
        member(3, 20, 3),
      ],
    };
    const me = state.members[0];
    assert.equal(writableRosterComplete(state, me), true);
    assert.equal(anyTeamComplete(state), true);
    assert.equal(canOpenNineteenth(state, me, false), true);
    assert.equal(nineteenthNeedsConfirm(state, false), false);
  });

  it('does not let an incomplete Team 2 joiner open 19th', () => {
    const state = {
      holes: eighteen,
      teams: [team1, team2],
      members: [
        member(1, 10, 18),
        member(2, 10, 18),
        member(3, 20, 3),
      ],
    };
    const me = state.members[2];
    assert.equal(writableRosterComplete(state, me), false);
    assert.equal(canOpenNineteenth(state, me, false), false);
  });

  it('lets the organizer open 19th once any team has 18, with confirm if others are blank', () => {
    const state = {
      holes: eighteen,
      teams: [team1, team2],
      members: [
        member(1, 10, 18),
        member(2, 10, 18),
        member(3, 20, 0),
      ],
    };
    const host = state.members[0];
    assert.equal(canOpenNineteenth(state, host, true), true);
    assert.equal(nineteenthNeedsConfirm(state, true), true);
  });

  it('does not require opposing scores the viewer cannot enter', () => {
    const state = {
      holes: eighteen,
      teams: [team1, team2],
      members: [
        member(1, 10, 18),
        {
          id: 3,
          team_id: 20,
          holes: holes(18).map((h) => ({ holeNumber: h.hole_number, gross: null })),
        },
      ],
    };
    const me = state.members[0];
    assert.equal(canOpenNineteenth(state, me, false), true);
    assert.equal(canOpenNineteenth(state, me, true), true);
  });

  it('stays closed until a writable roster or a finished team exists', () => {
    const state = {
      holes: eighteen,
      teams: [team1, team2],
      members: [member(1, 10, 17), member(3, 20, 12)],
    };
    assert.equal(canOpenNineteenth(state, state.members[0], false), false);
    assert.equal(canOpenNineteenth(state, state.members[0], true), false);
    assert.equal(nineteenthNeedsConfirm(state, true), true);
  });
});
