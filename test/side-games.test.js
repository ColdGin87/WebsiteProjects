const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  scoreSkins,
  vegasPairNumber,
  scoreVegasHole,
  scoreVegas,
  ninesHolePoints,
  scoreNines,
  scoreWolf,
  scoreWolfHole,
  rotationWolf,
  scoreNassau,
  parseSideGames,
  computeSideGames,
  teamHoleScore,
  strokesOnHole,
  netScore,
} = require('../lib/scoring');

function member(id, name, handicap, holes) {
  return {
    id,
    display_name: name,
    handicap,
    playing_handicap: handicap,
    holes: holes.map((gross, i) => {
      const holeNumber = i + 1;
      const si = holeNumber;
      const strokes = strokesOnHole(handicap, si);
      return { holeNumber, par: holeNumber === 1 ? 5 : 4, strokeIndex: si, gross, strokes, net: netScore(gross, strokes) };
    }),
  };
}

describe('Skins', () => {
  it('kills a tied hole and splits the pot by skins won', () => {
    const holes = [
      { holeNumber: 1, par: 4, strokeIndex: 1 },
      { holeNumber: 2, par: 4, strokeIndex: 2 },
    ];
    const players = [
      member('A', 'Ann', 0, [3, 5]),
      member('B', 'Bob', 0, [4, 4]),
      member('C', 'Cal', 0, [5, 4]),
    ];
    const skins = scoreSkins({ holes, players, pot: 12 });
    // H1 gross: Ann 3 unique low. H2 gross: Bob+Cal 4 tie → dead.
    // H1 net off low man (all 0): same as gross. H2 net dead.
    assert.equal(skins.grossSkins, 1);
    assert.equal(skins.netSkins, 1);
    assert.equal(skins.skinCount, 2);
    assert.equal(skins.valuePerSkin, 6);
    assert.equal(skins.holes[0].gross.name, 'Ann');
    assert.equal(skins.holes[1].gross.dead, true);
    const ann = skins.money.find((m) => m.id === 'A');
    assert.equal(ann.dollars, 12);
  });

  it('lets the same hole win both gross and net', () => {
    const holes = [{ holeNumber: 1, par: 5, strokeIndex: 1 }];
    const players = [
      { id: 1, display_name: 'Low', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 4 }] },
      { id: 2, display_name: 'Mid', playing_handicap: 10, holes: [{ holeNumber: 1, gross: 6 }] },
      { id: 3, display_name: 'High', playing_handicap: 18, holes: [{ holeNumber: 1, gross: 8 }] },
    ];
    const skins = scoreSkins({ holes, players, pot: 10 });
    assert.equal(skins.holes[0].gross.name, 'Low');
    assert.equal(skins.holes[0].net.name, 'Low');
    assert.equal(skins.skinCount, 2);
    assert.equal(skins.valuePerSkin, 5);
  });
});

describe('Vegas', () => {
  it('writes low first and high-first for 10+', () => {
    assert.equal(vegasPairNumber(4, 5, false), 45);
    assert.equal(vegasPairNumber(5, 4, false), 45);
    assert.equal(vegasPairNumber(10, 4, false), 104);
    assert.equal(vegasPairNumber(4, 5, true), 54);
  });

  it('flips the opposing team on a gross birdie and cancels when both birdie', () => {
    const par = 5;
    const a = [{ gross: 4, net: 3 }, { gross: 5, net: 5 }];
    const b = [{ gross: 5, net: 5 }, { gross: 6, net: 6 }];
    const flipped = scoreVegasHole(a, b, { scoring: 'gross', par });
    assert.equal(flipped.flipB, true);
    assert.equal(flipped.numA, 45);
    assert.equal(flipped.numB, 65);
    assert.equal(flipped.points, 20);
    assert.equal(flipped.winner, 'A');

    const both = scoreVegasHole(a, [{ gross: 4, net: 4 }, { gross: 6, net: 6 }], { scoring: 'gross', par });
    assert.equal(both.flipA, false);
    assert.equal(both.flipB, false);
  });

  it('uses net numbers but only flips on a gross birdie', () => {
    const par = 4;
    const a = [{ gross: 5, net: 3 }, { gross: 5, net: 4 }];
    const b = [{ gross: 5, net: 5 }, { gross: 6, net: 6 }];
    const row = scoreVegasHole(a, b, { scoring: 'net', par });
    assert.equal(row.numA, 34);
    assert.equal(row.flipB, false);
  });

  it('accumulates points for two teams', () => {
    const holes = [{ holeNumber: 1, par: 4, strokeIndex: 1 }];
    const teams = [
      { id: 10, name: 'Team 1', members: [member(1, 'A', 0, [4]), member(2, 'B', 0, [5])] },
      { id: 20, name: 'Team 2', members: [member(3, 'C', 0, [5]), member(4, 'D', 0, [6])] },
    ];
    const vegas = scoreVegas({ holes, teams, scoring: 'gross', dollarsPerPoint: 2 });
    assert.equal(vegas.teamA.points, 11);
    assert.equal(vegas.teamB.points, 0);
    assert.equal(vegas.money.find((m) => m.id === 10).dollars, 22);
  });
});

describe('Nassau', () => {
  it('settles front, back, and overall as three match-play bets', () => {
    const holes = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, par: 4, strokeIndex: i + 1 }));
    const frontLow = Array(9).fill(3).concat(Array(9).fill(5));
    const frontHigh = Array(9).fill(5).concat(Array(9).fill(3));
    const teams = [
      { id: 1, name: 'Team 1', members: [member(1, 'A', 0, frontLow), member(2, 'B', 0, frontLow)] },
      { id: 2, name: 'Team 2', members: [member(3, 'C', 0, frontHigh), member(4, 'D', 0, frontHigh)] },
    ];
    const nassau = scoreNassau({ holes, teams, scoring: 'gross', front: 2, back: 2, overall: 2 });
    assert.equal(nassau.front.winner, 'A');
    assert.equal(nassau.back.winner, 'B');
    assert.equal(nassau.overall.winner, null);
    assert.match(nassau.front.status, /Team 1/);
    assert.match(nassau.back.status, /Team 2/);
    assert.equal(nassau.overall.status, 'AS');
    const t1 = nassau.money.find((m) => m.id === 1);
    assert.equal(t1.dollars, 0);
  });
});

describe('Wolf', () => {
  it('rotates wolf and pays 2× for lone wolf', () => {
    const members = [
      { id: 1, display_name: 'A', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 3, net: 3 }] },
      { id: 2, display_name: 'B', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 5, net: 5 }] },
      { id: 3, display_name: 'C', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 6, net: 6 }] },
    ];
    assert.equal(rotationWolf(members, 1).id, 1);
    assert.equal(rotationWolf(members, 2).id, 2);
    const hole = { holeNumber: 1, par: 4, strokeIndex: 1 };
    const lone = scoreWolfHole({
      players: members,
      hole,
      pick: { wolfMemberId: 1, partnerMemberId: null, lone: true },
      scoring: 'gross',
    });
    assert.equal(lone.winner, 'wolf');
    assert.equal(lone.points, 2);
  });
});

describe('Nines', () => {
  it('scores 5-3-1, ties, and blitz 9-0-0', () => {
    assert.deepEqual(ninesHolePoints([{ id: 'A', score: 3 }, { id: 'B', score: 4 }, { id: 'C', score: 5 }], false), {
      A: 5, B: 3, C: 1,
    });
    assert.deepEqual(ninesHolePoints([{ id: 'A', score: 4 }, { id: 'B', score: 4 }, { id: 'C', score: 6 }], false), {
      A: 4, B: 4, C: 1,
    });
    assert.deepEqual(ninesHolePoints([{ id: 'A', score: 3 }, { id: 'B', score: 5 }, { id: 'C', score: 5 }], false), {
      A: 5, B: 2, C: 2,
    });
    assert.deepEqual(ninesHolePoints([{ id: 'A', score: 4 }, { id: 'B', score: 4 }, { id: 'C', score: 4 }], false), {
      A: 3, B: 3, C: 3,
    });
    assert.deepEqual(ninesHolePoints([{ id: 'A', score: 3 }, { id: 'B', score: 5 }, { id: 'C', score: 6 }], true), {
      A: 9, B: 0, C: 0,
    });
  });

  it('needs exactly three players', () => {
    const holes = [{ holeNumber: 1, par: 4, strokeIndex: 1 }];
    const two = scoreNines({ holes, members: [member(1, 'A', 0, [4]), member(2, 'B', 0, [5])], scoring: 'gross' });
    assert.equal(two.incomplete, true);
    const three = scoreNines({
      holes,
      members: [member(1, 'A', 0, [4]), member(2, 'B', 0, [5]), member(3, 'C', 0, [6])],
      scoring: 'gross',
      blitz: false,
      dollarsPerPoint: 1,
    });
    assert.equal(three.incomplete, false);
    assert.equal(three.points.find((p) => p.id === 1).points, 5);
  });
});

describe('Presses', () => {
  it('Vegas press from a later hole only scores that range', () => {
    const holes = [
      { holeNumber: 1, par: 4, strokeIndex: 1 },
      { holeNumber: 2, par: 4, strokeIndex: 2 },
    ];
    const teams = [
      { id: 10, name: 'Team 1', members: [member(1, 'A', 0, [3, 4]), member(2, 'B', 0, [5, 5])] },
      { id: 20, name: 'Team 2', members: [member(3, 'C', 0, [5, 5]), member(4, 'D', 0, [6, 6])] },
    ];
    const full = scoreVegas({ holes, teams, scoring: 'gross', dollarsPerPoint: 1 });
    const press = scoreVegas({ holes, teams, scoring: 'gross', dollarsPerPoint: 1, startHole: 2, endHole: 18 });
    assert.ok(full.teamA.points > press.teamA.points);
    assert.equal(press.holes.length, 1);
    assert.equal(press.holes[0].holeNumber, 2);
  });

  it('Nassau press reads DB-shaped start_hole and stays on that segment', () => {
    const holes = Array.from({ length: 9 }, (_, i) => ({ holeNumber: i + 1, par: 4, strokeIndex: i + 1 }));
    const low = Array(9).fill(3);
    const high = Array(9).fill(5);
    const teams = [
      { id: 1, name: 'Team 1', members: [member(1, 'A', 0, low), member(2, 'B', 0, low)] },
      { id: 2, name: 'Team 2', members: [member(3, 'C', 0, high), member(4, 'D', 0, high)] },
    ];
    const side = computeSideGames({
      config: { nassau: { on: true, scoring: 'gross', front: 2, back: 2, overall: 2 } },
      holes,
      members: teams.flatMap((t) => t.members),
      teams,
      presses: [{ game_key: 'nassau', segment: 'front', start_hole: 5, end_hole: 9, dollars: 4 }],
    });
    assert.ok(side.games.nassau);
    const t1 = side.money.find((m) => m.id === 1);
    assert.ok(t1.dollars >= 2);
    assert.match(side.stripText, /Nassau/);
    assert.match(side.stripText, /All games/);
  });
});

describe('Wolf pending', () => {
  it('does not award lone-wolf points until a pick is saved', () => {
    const members = [
      { id: 1, display_name: 'A', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 3, net: 3 }] },
      { id: 2, display_name: 'B', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 5, net: 5 }] },
      { id: 3, display_name: 'C', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 6, net: 6 }] },
    ];
    const pending = scoreWolf({
      holes: [{ holeNumber: 1, par: 4, strokeIndex: 1 }],
      members,
      picks: [],
      scoring: 'gross',
      dollarsPerPoint: 1,
    });
    assert.equal(pending.holes[0].pending, true);
    assert.equal((pending.points || []).reduce((s, p) => s + p.points, 0), 0);
  });
});

describe('Nines net off low man', () => {
  it('gives the high-handicap player a stroke before 5-3-1', () => {
    const holes = [{ holeNumber: 1, par: 4, strokeIndex: 1 }];
    const members = [
      member(1, 'Low', 0, [4]),
      member(2, 'Mid', 0, [5]),
      member(3, 'High', 18, [5]),
    ];
    const nines = scoreNines({ holes, members, scoring: 'net', blitz: false, dollarsPerPoint: 1 });
    const high = nines.points.find((p) => p.id === 3);
    const mid = nines.points.find((p) => p.id === 2);
    assert.ok(high.points > mid.points);
  });
});

describe('Side-game config and vs-par lock', () => {
  it('defaults skins off and keeps the five games', () => {
    const cfg = parseSideGames(null);
    assert.equal(cfg.skins.on, false);
    assert.equal(cfg.nines.blitz, true);
    assert.deepEqual(Object.keys(cfg), ['skins', 'vegas', 'nassau', 'wolf', 'nines']);
  });

  it('does not change team hole vs-par when side games run', () => {
    const players = [
      { id: 'A', handicap: 4, gross: 5 },
      { id: 'B', handicap: 11, gross: 6 },
      { id: 'C', handicap: 18, gross: 7 },
      { id: 'D', handicap: 24, gross: 8 },
    ].map((p) => {
      const strokes = strokesOnHole(p.handicap, 1);
      return { ...p, strokes, net: netScore(p.gross, strokes) };
    });
    const team = teamHoleScore(players, { grossBalls: 1, netBalls: 2, dualCount: false, par: 5 });
    assert.equal(team.total, 1);
    const side = computeSideGames({
      config: { skins: { on: true, pot: 18 } },
      holes: [{ holeNumber: 1, par: 5, strokeIndex: 1 }],
      members: players.map((p) => ({
        ...p,
        display_name: p.id,
        playing_handicap: p.handicap,
        holes: [{ holeNumber: 1, gross: p.gross, net: p.net }],
      })),
      teams: [],
      presses: [],
    });
    assert.ok(side.games.skins);
    assert.equal(team.total, 1);
  });
});
