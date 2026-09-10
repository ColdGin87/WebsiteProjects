const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  TEAM_FILL_SIZE,
  hasShortTeam,
  defaultShortTeam,
  shortTeams,
  fillCandidates,
  includedCandidates,
  pickFillWinner,
  shuffleFillPool,
  fairIndex,
  candidateKey,
  scoringMembers,
  scoringCountOnTeam,
  memberOnTeam,
} = require('../public/js/teamFillSpin');

function stateOf(teams, members) {
  return { teams, members };
}

describe('Team fill spin', () => {
  const t1 = { id: 1, name: 'Team 1', sort_order: 1 };
  const t2 = { id: 2, name: 'Team 2', sort_order: 2 };
  const t3 = { id: 3, name: 'Team 3', sort_order: 3 };

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

  it('lists every incomplete team, not only the shortest', () => {
    const state = stateOf([t1, t2, t3], [
      { id: 10, display_name: 'A', team_id: 1, role: 'player' },
      { id: 11, display_name: 'B', team_id: 1, role: 'player' },
      { id: 12, display_name: 'C', team_id: 1, role: 'player' },
      { id: 20, display_name: 'D', team_id: 2, role: 'player' },
      { id: 21, display_name: 'E', team_id: 2, role: 'player' },
      { id: 30, display_name: 'F', team_id: 3, role: 'player' },
      { id: 31, display_name: 'G', team_id: 3, role: 'player' },
      { id: 32, display_name: 'H', team_id: 3, role: 'player' },
      { id: 33, display_name: 'I', team_id: 3, role: 'player' },
    ]);
    assert.deepEqual(shortTeams(state).map((t) => t.id), [2, 1]);
    assert.equal(defaultShortTeam(state).id, 2);
    assert.equal(hasShortTeam(state), true);
  });

  it('ignores empty unused teams so they do not block 19th', () => {
    const state = stateOf([t1, t2, t3], [
      { id: 10, display_name: 'A', team_id: 1, role: 'player' },
      { id: 11, display_name: 'B', team_id: 1, role: 'player' },
      { id: 12, display_name: 'C', team_id: 1, role: 'player' },
      { id: 13, display_name: 'D', team_id: 1, role: 'player' },
      { id: 20, display_name: 'E', team_id: 2, role: 'player' },
      { id: 21, display_name: 'F', team_id: 2, role: 'player' },
      { id: 22, display_name: 'G', team_id: 2, role: 'player' },
      { id: 23, display_name: 'H', team_id: 2, role: 'player' },
    ]);
    assert.deepEqual(shortTeams(state), []);
    assert.equal(hasShortTeam(state), false);
  });

  it('excludes unchecked names and picks fairly among the rest', () => {
    const cands = [
      { memberId: 1, name: 'A' },
      { memberId: 2, name: 'B' },
      { memberId: 3, name: 'C' },
    ];
    const excluded = new Set([candidateKey(cands[0])]);
    assert.deepEqual(includedCandidates(cands, excluded).map((c) => c.name), ['B', 'C']);
    assert.equal(pickFillWinner(cands, excluded, () => 0).name, 'C');
    assert.equal(pickFillWinner(cands, excluded, () => 0.99).name, 'B');
    assert.equal(pickFillWinner(cands, new Set(cands.map(candidateKey))), null);
  });

  it('shuffles eligible names independently each spin with equal chance', () => {
    const cands = [
      { memberId: 1, name: 'A' },
      { memberId: 2, name: 'B' },
      { memberId: 3, name: 'C' },
      { memberId: 4, name: 'D' },
    ];
    assert.equal(fairIndex(4, () => 0), 0);
    assert.equal(fairIndex(4, () => 0.99), 3);
    const rotated = shuffleFillPool(cands, () => 0).map((c) => c.name);
    const rolls = [0.75, 0.1, 0.4];
    let k = 0;
    const mixed = shuffleFillPool(cands, () => rolls[k++]).map((c) => c.name);
    assert.deepEqual(rotated, ['B', 'C', 'D', 'A']);
    assert.notDeepEqual(mixed, ['A', 'B', 'C', 'D']);
    assert.notDeepEqual(mixed, rotated);

    const counts = { A: 0, B: 0, C: 0, D: 0 };
    const n = 2000;
    for (let i = 0; i < n; i += 1) {
      const winner = pickFillWinner(cands);
      counts[winner.name] += 1;
    }
    const expected = n / 4;
    for (const name of Object.keys(counts)) {
      const share = counts[name] / n;
      assert.ok(share > 0.18 && share < 0.32, `${name} share ${share} should be near 0.25`);
      assert.ok(Math.abs(counts[name] - expected) < expected * 0.28, `${name} count ${counts[name]} drifted from ${expected}`);
    }
    const sample = [];
    for (let i = 0; i < 8; i += 1) sample.push(pickFillWinner(cands).name);
    assert.equal(sample.length, 8);
    assert.ok(new Set(sample).size >= 2, `8 independent spins should not all be one name: ${sample.join(',')}`);
  });

  it('counts a fill seat on the short team without dropping the home team', () => {
    const state = stateOf([t1, t2], [
      { id: 10, display_name: 'A', team_id: 1, role: 'player' },
      { id: 11, display_name: 'B', team_id: 1, role: 'player' },
      { id: 12, display_name: 'C', team_id: 1, role: 'player' },
      { id: 20, display_name: 'D', team_id: 2, role: 'player' },
      { id: 21, display_name: 'E', team_id: 2, role: 'player' },
      { id: 22, display_name: 'F', team_id: 2, role: 'player' },
      { id: 30, display_name: 'Pat', team_id: 1, fill_team_id: 2, role: 'player' },
    ]);
    const pat = state.members.find((m) => m.display_name === 'Pat');
    assert.equal(memberOnTeam(pat, 1), true);
    assert.equal(memberOnTeam(pat, 2), true);
    assert.equal(scoringCountOnTeam(state, 1), 4);
    assert.equal(scoringCountOnTeam(state, 2), 4);
    assert.deepEqual(fillCandidates(state, 2).map((m) => m.display_name), ['A', 'B', 'C']);
    assert.equal(hasShortTeam(state), false);
  });
});
