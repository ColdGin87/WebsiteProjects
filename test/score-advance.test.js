const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { nextDownTarget, nextAcrossTarget } = require('../public/js/scoreAdvance');

function holes(n) {
  return Array.from({ length: n }, (_, i) => ({ hole_number: i + 1 }));
}

function player(id, teamId) {
  return { id, team_id: teamId };
}

describe('Down score advance wrap', () => {
  const eighteen = holes(18);
  const t1 = [player(1, 10), player(2, 10), player(3, 10), player(4, 10)];
  const me = t1[0];

  it('walks P1 → P2 → P3 → P4 on the same hole', () => {
    const a = nextDownTarget({ members: t1, me, holes: eighteen, memberId: 1, holeNumber: 1 });
    const b = nextDownTarget({ members: t1, me, holes: eighteen, memberId: 2, holeNumber: 1 });
    const c = nextDownTarget({ members: t1, me, holes: eighteen, memberId: 3, holeNumber: 1 });
    assert.deepEqual(a, { memberId: 2, holeNumber: 1 });
    assert.deepEqual(b, { memberId: 3, holeNumber: 1 });
    assert.deepEqual(c, { memberId: 4, holeNumber: 1 });
  });

  it('wraps the last player to player 1 on the next hole', () => {
    const next = nextDownTarget({ members: t1, me, holes: eighteen, memberId: 4, holeNumber: 1 });
    assert.deepEqual(next, { memberId: 1, holeNumber: 2 });
    const later = nextDownTarget({ members: t1, me, holes: eighteen, memberId: 4, holeNumber: 9 });
    assert.deepEqual(later, { memberId: 1, holeNumber: 10 });
  });

  it('does not wrap past the last hole', () => {
    const end = nextDownTarget({ members: t1, me, holes: eighteen, memberId: 4, holeNumber: 18 });
    assert.equal(end, null);
  });

  it('skips opposing roster even if they appear in the visible order', () => {
    const mixed = [player(1, 10), player(2, 10), player(8, 20), player(9, 20), player(3, 10)];
    const afterTwo = nextDownTarget({
      members: mixed,
      me,
      orderIds: [1, 2, 8, 9, 3],
      holes: eighteen,
      memberId: 2,
      holeNumber: 1,
    });
    assert.deepEqual(afterTwo, { memberId: 3, holeNumber: 1 });
    const afterLast = nextDownTarget({
      members: mixed,
      me,
      orderIds: [1, 2, 8, 9, 3],
      holes: eighteen,
      memberId: 3,
      holeNumber: 1,
    });
    assert.deepEqual(afterLast, { memberId: 1, holeNumber: 2 });
  });

  it('leaves Across on the same player, next hole', () => {
    const next = nextAcrossTarget({ holes: eighteen, memberId: 4, holeNumber: 1 });
    assert.deepEqual(next, { memberId: 4, holeNumber: 2 });
    const end = nextAcrossTarget({ holes: eighteen, memberId: 4, holeNumber: 18 });
    assert.equal(end, null);
  });
});
