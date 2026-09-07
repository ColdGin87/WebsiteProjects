const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  TEAM_FILL_SIZE,
  GOT_BEER_DEFAULT,
  isGotBeerOn,
  hasShortTeam,
  defaultShortTeam,
  fillCandidates,
  includedCandidates,
  pickFillWinner,
  candidateKey,
  scoringMembers,
} = require('../public/js/teamFillSpin');

function stateOf(teams, members) {
  return { teams, members };
}

describe('Team fill spin', () => {
  const t1 = { id: 1, name: 'Team 1', sort_order: 1 };
  const t2 = { id: 2, name: 'Team 2', sort_order: 2 };

  it('defaults the short team to the one under 4 and skips followers', () => {
    const state = stateOf([t1, t2], [
      { id: 10, display_name: 'A', team_id: 1, role: 'player' },
      { id: 11, display_name: 'B', team_id: 1, role: 'player' },
      { id: 12, display_name: 'C', team_id: 1, role: 'player' },
      { id: 13, display_name: 'D', team_id: 1, role: 'player' },
      { id: 20, display_name: 'E', team_id: 2, role: 'player' },
      { id: 21, display_name: 'F', team_id: 2, role: 'player' },
      { id: 22, display_name: 'G', team_id: 2, role: 'player' },
      { id: 30, display_name: 'Pat', team_id: 1, role: 'player' },
      { id: 40, display_name: 'Follow', team_id: 2, role: 'follower' },
    ]);
    assert.equal(TEAM_FILL_SIZE, 4);
    assert.equal(defaultShortTeam(state).id, 2);
    assert.equal(hasShortTeam(state), true);
    const names = fillCandidates(state, 2).map((m) => m.display_name);
    assert.deepEqual(names, ['A', 'B', 'C', 'D', 'Pat']);
    assert.equal(scoringMembers(state.members).some((m) => m.role === 'follower'), false);
  });

  it('excludes unchecked names and picks fairly among the rest', () => {
    const cands = [
      { memberId: 1, name: 'A' },
      { memberId: 2, name: 'B' },
      { memberId: 3, name: 'C' },
    ];
    const excluded = new Set([candidateKey(cands[0])]);
    assert.deepEqual(includedCandidates(cands, excluded).map((c) => c.name), ['B', 'C']);
    assert.equal(pickFillWinner(cands, excluded, () => 0).name, 'B');
    assert.equal(pickFillWinner(cands, excluded, () => 0.99).name, 'C');
    assert.equal(pickFillWinner(cands, new Set(cands.map(candidateKey))), null);
  });
});

describe('Got beer feature flag', () => {
  it('stays off by default', () => {
    assert.equal(GOT_BEER_DEFAULT, false);
    assert.equal(isGotBeerOn({ href: '' }), false);
    assert.equal(isGotBeerOn({ href: '#round/1' }), false);
  });

  it('turns on from query, hash, or an explicit round flag', () => {
    assert.equal(isGotBeerOn({ href: '?gotBeer=1' }), true);
    assert.equal(isGotBeerOn({ href: '#round/1?gotBeer=1' }), true);
    assert.equal(isGotBeerOn({ href: '', round: { got_beer: 1 } }), true);
  });
});
