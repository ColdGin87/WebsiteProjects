const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  scoreSkins,
  vegasPairNumber,
  scoreVegasHole,
  scoreVegas,
  ninesHolePoints,
  ninesPointGet,
  ninesRunningThrough,
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
  computeBirdieSlots,
  slotSpin,
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
    assert.equal(vegasPairNumber(4, 11, false), 114);
    assert.equal(vegasPairNumber(4, 5, true), 54);
  });

  it('flips the opposing team on a gross birdie or eagle and flips both when both birdie', () => {
    const par = 5;
    const a = [{ gross: 4, net: 3 }, { gross: 5, net: 5 }];
    const b = [{ gross: 5, net: 5 }, { gross: 6, net: 6 }];
    const flipped = scoreVegasHole(a, b, { scoring: 'gross', par });
    assert.equal(flipped.flipB, true);
    assert.equal(flipped.numA, 45);
    assert.equal(flipped.numB, 65);
    assert.equal(flipped.points, 20);
    assert.equal(flipped.winner, 'A');

    const eagle = scoreVegasHole([{ gross: 3, net: 3 }, { gross: 5, net: 5 }], b, { scoring: 'gross', par });
    assert.equal(eagle.flipB, true);

    const both = scoreVegasHole(a, [{ gross: 4, net: 4 }, { gross: 6, net: 6 }], { scoring: 'gross', par });
    assert.equal(both.flipA, true);
    assert.equal(both.flipB, true);
    assert.equal(both.numA, 54);
    assert.equal(both.numB, 64);
  });

  it('does not treat a missing teammate gross as a birdie flip', () => {
    const par = 5;
    const a = [{ gross: null, net: null }, { gross: 5, net: 4 }, { gross: 6, net: 5 }];
    const b = [{ gross: 6, net: 6 }, { gross: 7, net: 7 }];
    const row = scoreVegasHole(a, b, { scoring: 'gross', par });
    assert.equal(row.numA, 56);
    assert.equal(row.numB, 67);
    assert.equal(row.flipB, false);
    assert.equal(row.points, 11);
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
    assert.equal(vegas.teamB.points, -11);
    assert.equal(vegas.holes[0].swingA, 11);
    assert.equal(vegas.holes[0].swingB, -11);
    assert.equal(vegas.money.find((m) => m.id === 10).dollars, 22);
  });

  it('zero-sum running: H1 A +11 / B −11, H2 B +8 → A +3 / B −3', () => {
    const holes = [
      { holeNumber: 1, par: 4, strokeIndex: 1 },
      { holeNumber: 2, par: 4, strokeIndex: 2 },
    ];
    const teams = [
      { id: 10, name: 'Team 1', members: [member(1, 'A', 0, [4, 5]), member(2, 'B', 0, [5, 6])] },
      { id: 20, name: 'Team 2', members: [member(3, 'C', 0, [5, 4]), member(4, 'D', 0, [6, 8])] },
    ];
    const vegas = scoreVegas({ holes, teams, scoring: 'gross', dollarsPerPoint: 1 });
    assert.equal(vegas.holes[0].numA, 45);
    assert.equal(vegas.holes[0].numB, 56);
    assert.equal(vegas.holes[0].points, 11);
    assert.equal(vegas.holes[0].swingA, 11);
    assert.equal(vegas.holes[0].swingB, -11);
    assert.equal(vegas.holes[0].runA, 11);
    assert.equal(vegas.holes[0].runB, -11);
    assert.equal(vegas.holes[1].numA, 56);
    assert.equal(vegas.holes[1].numB, 48);
    assert.equal(vegas.holes[1].points, 8);
    assert.equal(vegas.holes[1].swingA, -8);
    assert.equal(vegas.holes[1].swingB, 8);
    assert.equal(vegas.holes[1].runA, 3);
    assert.equal(vegas.holes[1].runB, -3);
    assert.equal(vegas.teamA.points, 3);
    assert.equal(vegas.teamB.points, -3);
  });

  it('running is cumulative: +5 then −25 → −20, other team is the mirror', () => {
    const holes = [
      { holeNumber: 1, par: 4, strokeIndex: 1 },
      { holeNumber: 2, par: 4, strokeIndex: 2 },
    ];
    const teams = [
      {
        id: 10,
        name: 'Team A',
        members: [
          { id: 1, display_name: 'A', holes: [{ holeNumber: 1, gross: 4, net: 4 }, { holeNumber: 2, gross: 6, net: 6 }] },
          { id: 2, display_name: 'B', holes: [{ holeNumber: 1, gross: 4, net: 4 }, { holeNumber: 2, gross: 9, net: 9 }] },
        ],
      },
      {
        id: 20,
        name: 'Team B',
        members: [
          { id: 3, display_name: 'C', holes: [{ holeNumber: 1, gross: 4, net: 4 }, { holeNumber: 2, gross: 4, net: 4 }] },
          { id: 4, display_name: 'D', holes: [{ holeNumber: 1, gross: 9, net: 9 }, { holeNumber: 2, gross: 4, net: 4 }] },
        ],
      },
    ];
    const vegas = scoreVegas({ holes, teams, scoring: 'gross', dollarsPerPoint: 1 });
    assert.equal(vegas.holes[0].points, 5);
    assert.equal(vegas.holes[0].swingA, 5);
    assert.equal(vegas.holes[0].swingB, -5);
    assert.equal(vegas.holes[0].runA, 5);
    assert.equal(vegas.holes[0].runB, -5);
    assert.equal(vegas.holes[1].points, 25);
    assert.equal(vegas.holes[1].swingA, -25);
    assert.equal(vegas.holes[1].swingB, 25);
    assert.equal(vegas.holes[1].runA, -20);
    assert.equal(vegas.holes[1].runB, 20);
    assert.equal(vegas.teamA.points, -20);
    assert.equal(vegas.teamB.points, 20);
  });

  it('posts 5-point hole × 3 games as +15/−15, not child ledgers', () => {
    const holes = [{ holeNumber: 1, par: 4, strokeIndex: 1 }];
    const teams = [
      {
        id: 10,
        name: 'Team A',
        members: [
          { id: 1, display_name: 'A', holes: [{ holeNumber: 1, gross: 4, net: 4 }] },
          { id: 2, display_name: 'B', holes: [{ holeNumber: 1, gross: 4, net: 4 }] },
        ],
      },
      {
        id: 20,
        name: 'Team B',
        members: [
          { id: 3, display_name: 'C', holes: [{ holeNumber: 1, gross: 4, net: 4 }] },
          { id: 4, display_name: 'D', holes: [{ holeNumber: 1, gross: 9, net: 9 }] },
        ],
      },
    ];
    const presses = [
      { game_key: 'vegas', start_hole: 1 },
      { game_key: 'vegas', start_hole: 1 },
    ];
    const vegas = scoreVegas({ holes, teams, scoring: 'gross', dollarsPerPoint: 1, presses });
    assert.equal(vegas.holes[0].numA, 44);
    assert.equal(vegas.holes[0].numB, 49);
    assert.equal(vegas.holes[0].points, 5);
    assert.equal(vegas.holes[0].games, 3);
    assert.equal(vegas.holes[0].swingA, 15);
    assert.equal(vegas.holes[0].swingB, -15);
    assert.equal(vegas.teamA.points, 15);
    assert.equal(vegas.teamB.points, -15);
    assert.equal(vegas.gamesRunning, 3);
    assert.equal(vegas.presses, undefined);
    const side = computeSideGames({
      config: { vegas: { on: true, scoring: 'gross', dollarsPerPoint: 1 } },
      holes,
      members: teams.flatMap((t) => t.members),
      teams,
      presses,
    });
    assert.ok(side.games.vegas);
    assert.equal(side.games.vegasPresses, undefined);
    assert.equal(side.games.vegas.holes[0].swingA, 15);
    assert.equal(side.games.vegas.teamA.points, 15);
  });

  it('multiplies this-hole swing by games running', () => {
    const holes = [
      { holeNumber: 1, par: 4, strokeIndex: 1 },
      { holeNumber: 2, par: 4, strokeIndex: 2 },
    ];
    const teams = [
      { id: 10, name: 'Team A', members: [member(1, 'A', 0, [4, 5]), member(2, 'B', 0, [5, 5])] },
      { id: 20, name: 'Team B', members: [member(3, 'C', 0, [5, 4]), member(4, 'D', 0, [6, 4])] },
    ];
    const presses = [{ game_key: 'vegas', start_hole: 2 }];
    const vegas = scoreVegas({ holes, teams, scoring: 'gross', dollarsPerPoint: 1, presses });
    assert.equal(vegas.holes[0].games, 1);
    assert.equal(vegas.holes[0].points, 11);
    assert.equal(vegas.holes[0].swingA, 11);
    assert.equal(vegas.holes[1].games, 2);
    assert.equal(vegas.holes[1].points, 11);
    assert.equal(vegas.holes[1].swingA, -22);
    assert.equal(vegas.holes[1].swingB, 22);
    assert.equal(vegas.teamA.points, -11);
    assert.equal(vegas.teamB.points, 11);
  });

  it('uses pair numbers, never the 1G+2N vs-par team total', () => {
    const players = [
      { id: 'A', handicap: 4, gross: 5 },
      { id: 'B', handicap: 11, gross: 6 },
      { id: 'C', handicap: 18, gross: 7 },
      { id: 'D', handicap: 24, gross: 8 },
    ].map((p) => {
      const strokes = strokesOnHole(p.handicap, 1);
      return { ...p, strokes, net: netScore(p.gross, strokes) };
    });
    const vsPar = teamHoleScore(players, { grossBalls: 1, netBalls: 2, dualCount: false, par: 5 });
    assert.equal(vsPar.total, 1);
    const hole = scoreVegasHole(
      [{ gross: 5, net: 4 }, { gross: 6, net: 5 }],
      [{ gross: 6, net: 6 }, { gross: 7, net: 7 }],
      { scoring: 'gross', par: 5 }
    );
    assert.equal(hole.numA, 56);
    assert.equal(hole.numB, 67);
    assert.equal(hole.points, 11);
    assert.equal(hole.flipA, false);
    assert.equal(hole.flipB, false);
    assert.notEqual(hole.numA, vsPar.total);
    assert.notEqual(hole.points, vsPar.total);
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
    const h1 = nassau.front.holeRows.find((h) => h.holeNumber === 1);
    assert.equal(h1 && h1.winner, 'A');
    assert.equal(nassau.front.holesWonA, 9);
    assert.equal(nassau.back.holesWonB, 9);
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
    const blind = scoreWolfHole({
      players: members,
      hole,
      pick: { wolfMemberId: 1, partnerMemberId: null, lone: true, blind: true },
      scoring: 'gross',
    });
    assert.equal(blind.points, 4);
    assert.equal(blind.blind, true);
    const partnered = scoreWolfHole({
      players: members,
      hole,
      pick: { wolfMemberId: 1, partnerMemberId: 2, lone: false },
      scoring: 'gross',
    });
    assert.equal(partnered.points, 1);
  });

  it('pays house points: partnered ±1, lone ±2, blind ±4; tie 0', () => {
    const hole = { holeNumber: 1, par: 4, strokeIndex: 1 };
    const four = [
      { id: 1, display_name: 'A', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 3, net: 3 }] },
      { id: 2, display_name: 'B', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 4, net: 4 }] },
      { id: 3, display_name: 'C', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 5, net: 5 }] },
      { id: 4, display_name: 'D', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 6, net: 6 }] },
    ];
    const holes = [hole];
    const pts = (picks) => {
      const game = scoreWolf({ holes, members: four, picks, scoring: 'gross', dollarsPerPoint: 1 });
      return Object.fromEntries((game.points || []).map((p) => [p.id, p.points]));
    };
    const partnered = pts([{ holeNumber: 1, wolfMemberId: 1, partnerMemberId: 2, lone: 0, locked: 1 }]);
    assert.equal(partnered[1], 1);
    assert.equal(partnered[2], 1);
    assert.equal(partnered[3], -1);
    assert.equal(partnered[4], -1);
    const loneWin = pts([{ holeNumber: 1, wolfMemberId: 1, partnerMemberId: null, lone: 1, locked: 1 }]);
    assert.equal(loneWin[1], 2);
    assert.equal(loneWin[2], -2);
    assert.equal(loneWin[3], -2);
    assert.equal(loneWin[4], -2);
    const blindWin = pts([{ holeNumber: 1, wolfMemberId: 1, partnerMemberId: null, lone: 1, blind: 1, locked: 1 }]);
    assert.equal(blindWin[1], 4);
    assert.equal(blindWin[2], -4);
    assert.equal(blindWin[3], -4);
    assert.equal(blindWin[4], -4);
    const tied = [
      { id: 1, display_name: 'A', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 4, net: 4 }] },
      { id: 2, display_name: 'B', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 5, net: 5 }] },
      { id: 3, display_name: 'C', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 4, net: 4 }] },
      { id: 4, display_name: 'D', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 6, net: 6 }] },
    ];
    const tieGame = scoreWolf({
      holes,
      members: tied,
      picks: [{ holeNumber: 1, wolfMemberId: 1, partnerMemberId: 2, lone: 0, locked: 1 }],
      scoring: 'gross',
    });
    assert.equal(tieGame.holes[0].winner, null);
    assert.equal(tieGame.holes[0].points, 0);
    assert.equal((tieGame.points || []).reduce((s, p) => s + p.points, 0), 0);
  });

  it('uses setup toggle values, not hardcoded 1/2/4', () => {
    const hole = { holeNumber: 1, par: 4, strokeIndex: 1 };
    const members = [
      { id: 1, display_name: 'A', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 3, net: 3 }] },
      { id: 2, display_name: 'B', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 5, net: 5 }] },
      { id: 3, display_name: 'C', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 6, net: 6 }] },
    ];
    const custom = scoreWolfHole({
      players: members,
      hole,
      pick: { wolfMemberId: 1, partnerMemberId: null, lone: true, blind: true },
      scoring: 'gross',
      values: { partnered: 2, lone: 5, blind: 8 },
    });
    assert.equal(custom.points, 8);
    const lone = scoreWolfHole({
      players: members,
      hole,
      pick: { wolfMemberId: 1, partnerMemberId: null, lone: true },
      scoring: 'gross',
      values: { partnered: 2, lone: 5, blind: 8 },
    });
    assert.equal(lone.points, 5);
    const pair = scoreWolfHole({
      players: members,
      hole,
      pick: { wolfMemberId: 1, partnerMemberId: 2, lone: false },
      scoring: 'gross',
      values: { partnered: 2, lone: 5, blind: 8 },
    });
    assert.equal(pair.points, 2);
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

  it('shows hole points and a running total through each hole', () => {
    const holes = [
      { holeNumber: 1, par: 4, strokeIndex: 1 },
      { holeNumber: 2, par: 4, strokeIndex: 2 },
    ];
    const nines = scoreNines({
      holes,
      members: [
        member(1, 'A', 0, [3, 4]),
        member(2, 'B', 0, [4, 5]),
        member(3, 'C', 0, [5, 6]),
      ],
      scoring: 'gross',
      blitz: false,
    });
    assert.equal(nines.holes[0].points[1], 5);
    assert.equal(nines.holes[0].points[2], 3);
    assert.equal(nines.holes[0].points[3], 1);
    assert.equal(nines.holes[0].running[1], 5);
    assert.equal(nines.holes[0].running[2], 3);
    assert.equal(nines.holes[0].running[3], 1);
    assert.equal(nines.holes[1].points[1], 5);
    assert.equal(nines.holes[1].running[1], 10);
    assert.equal(nines.holes[1].running[2], 6);
    assert.equal(nines.holes[1].running[3], 2);
    assert.equal(nines.holes[0].players[0].hole, 5);
    assert.equal(nines.holes[1].players[0].run, 10);
  });

  it('sums 5-2-2 then 5-3-1 into running 10/5/3', () => {
    const nines = scoreNines({
      holes: [
        { holeNumber: 1, par: 4, strokeIndex: 1 },
        { holeNumber: 2, par: 4, strokeIndex: 2 },
      ],
      members: [
        member(1, 'A', 0, [3, 3]),
        member(2, 'B', 0, [5, 4]),
        member(3, 'C', 0, [5, 5]),
      ],
      scoring: 'gross',
      blitz: false,
    });
    assert.deepEqual(nines.holes[0].points, { 1: 5, 2: 2, 3: 2 });
    assert.equal(nines.holes[0].players.find((p) => p.id === 1).run, 5);
    assert.equal(nines.holes[1].players.find((p) => p.id === 1).hole, 5);
    assert.equal(nines.holes[1].players.find((p) => p.id === 2).hole, 3);
    assert.equal(nines.holes[1].players.find((p) => p.id === 3).hole, 1);
    assert.equal(nines.holes[1].players.find((p) => p.id === 1).run, 10);
    assert.equal(nines.holes[1].players.find((p) => p.id === 2).run, 5);
    assert.equal(nines.holes[1].players.find((p) => p.id === 3).run, 3);
    assert.equal(ninesRunningThrough(nines.holes, 1, 1), 5);
    assert.equal(ninesRunningThrough(nines.holes, 2, 1), 10);
    assert.equal(ninesRunningThrough(nines.holes, 2, 2), 5);
    assert.equal(ninesRunningThrough(nines.holes, 2, 3), 3);
    assert.equal(ninesPointGet(nines.holes[1].running, '1'), 10);
    assert.equal(ninesPointGet(nines.holes[1].running, 2), 5);
    assert.equal(nines.holes[1].running['3'], 3);
  });

  it('sums 3-3-3 then 5-3-1 into running 8/6/4', () => {
    const nines = scoreNines({
      holes: [
        { holeNumber: 1, par: 4, strokeIndex: 1 },
        { holeNumber: 2, par: 4, strokeIndex: 2 },
      ],
      members: [
        member(1, 'A', 0, [4, 3]),
        member(2, 'B', 0, [4, 4]),
        member(3, 'C', 0, [4, 5]),
      ],
      scoring: 'gross',
      blitz: false,
    });
    assert.deepEqual(nines.holes[0].points, { 1: 3, 2: 3, 3: 3 });
    assert.equal(nines.holes[1].players.find((p) => p.id === 1).run, 8);
    assert.equal(nines.holes[1].players.find((p) => p.id === 2).run, 6);
    assert.equal(nines.holes[1].players.find((p) => p.id === 3).run, 4);
  });
});

describe('Presses', () => {
  it('Vegas press increments games running from that hole', () => {
    const holes = [
      { holeNumber: 1, par: 4, strokeIndex: 1 },
      { holeNumber: 2, par: 4, strokeIndex: 2 },
    ];
    const teams = [
      { id: 10, name: 'Team 1', members: [member(1, 'A', 0, [3, 4]), member(2, 'B', 0, [5, 5])] },
      { id: 20, name: 'Team 2', members: [member(3, 'C', 0, [5, 5]), member(4, 'D', 0, [6, 6])] },
    ];
    const pressed = scoreVegas({
      holes,
      teams,
      scoring: 'gross',
      dollarsPerPoint: 1,
      presses: [{ game_key: 'vegas', start_hole: 2 }],
    });
    assert.equal(pressed.holes[0].games, 1);
    assert.equal(pressed.holes[1].games, 2);
    assert.equal(pressed.holes[1].swingA, pressed.holes[1].points * 2);
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
    assert.equal(side.games.nassauPresses.length, 1);
    assert.equal(side.games.nassauPresses[0].segment, 'front');
    assert.equal(side.games.nassauPresses[0].startHole, 5);
    assert.equal(side.games.nassauPresses[0].endHole, 9);
    const t1 = side.money.find((m) => m.id === 1);
    assert.ok(t1.dollars >= 2);
    assert.match(side.stripText, /Nassau/);
    assert.match(side.stripText, /press F1/);
    assert.match(side.stripText, /All games/);
  });

  it('Nassau front press dies at 9; hole 12 can press Back and Overall', () => {
    const holes = Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, par: 4, strokeIndex: i + 1 }));
    const low = Array(18).fill(3);
    const high = Array(18).fill(5);
    const teams = [
      { id: 1, name: 'Team 1', members: [member(1, 'A', 0, low), member(2, 'B', 0, low)] },
      { id: 2, name: 'Team 2', members: [member(3, 'C', 0, high), member(4, 'D', 0, high)] },
    ];
    const side = computeSideGames({
      config: { nassau: { on: true, scoring: 'gross', front: 2, back: 2, overall: 2 } },
      holes,
      members: teams.flatMap((t) => t.members),
      teams,
      presses: [
        { id: 1, game_key: 'nassau', segment: 'front', start_hole: 5, end_hole: 18, dollars: 4 },
        { id: 2, game_key: 'nassau', segment: 'back', start_hole: 12, end_hole: 18, dollars: 4 },
        { id: 3, game_key: 'nassau', segment: 'overall', start_hole: 12, end_hole: 18, dollars: 4 },
      ],
    });
    const rows = side.games.nassauPresses;
    assert.equal(rows.length, 3);
    const front = rows.find((p) => p.segment === 'front');
    const back = rows.find((p) => p.segment === 'back');
    const overall = rows.find((p) => p.segment === 'overall');
    assert.equal(front.startHole, 5);
    assert.equal(front.endHole, 9);
    assert.equal(back.startHole, 12);
    assert.equal(back.endHole, 18);
    assert.equal(overall.startHole, 12);
    assert.equal(overall.endHole, 18);
    const from12 = rows.filter((p) => p.startHole === 12);
    assert.equal(from12.length, 2);
    assert.ok(from12.some((p) => p.segment === 'back'));
    assert.ok(from12.some((p) => p.segment === 'overall'));
    assert.match(side.stripText, /press F1 B1 181/);
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

describe('Birdie slots', () => {
  it('awards one deterministic spin per gross birdie and per net birdie', () => {
    const holes = [
      { holeNumber: 1, par: 5 },
      { holeNumber: 2, par: 4 },
    ];
    const members = [
      member(1, 'Ann', 0, [4, 4]),
      member(2, 'Bob', 0, [5, 3]),
    ];
    const slots = computeBirdieSlots({ on: true, holes, members, roundId: 9 });
    // Ann H1 4/4 on par 5 = gross + net. Bob H2 3/3 on par 4 = gross + net.
    assert.equal(slots.spins, 4);
    assert.equal(slots.grossBirdies, 2);
    assert.equal(slots.netBirdies, 2);
    assert.equal(slots.spinLog.length, 4);
    assert.equal(slots.players.find((p) => p.id === 1).birdies, 1);
    assert.equal(slots.players.find((p) => p.id === 1).spins, 2);
    assert.equal(slots.players.find((p) => p.id === 2).birdies, 1);
    assert.equal(slotSpin(9, 1, 1), slotSpin(9, 1, 1));
    assert.equal(slotSpin(9, 1, 1, 'net'), slotSpin(9, 1, 1, 'net'));
    assert.equal(computeBirdieSlots({ on: false }).on, false);
  });

  it('counts eagles and albatrosses as better than par, not birdies only', () => {
    const holes = [{ holeNumber: 1, par: 5 }];
    const members = [
      { id: 1, display_name: 'Ann', playing_handicap: 0, holes: [{ holeNumber: 1, gross: 3, net: 2 }] },
    ];
    const slots = computeBirdieSlots({ on: true, holes, members, roundId: 3 });
    assert.equal(slots.spins, 2);
    assert.equal(slots.grossBirdies, 1);
    assert.equal(slots.netBirdies, 1);
  });

  it('counts a net-only birdie when gross is not under par', () => {
    const holes = [{ holeNumber: 1, par: 4, strokeIndex: 1 }];
    const members = [member(3, 'Pat', 18, [4])];
    const slots = computeBirdieSlots({ on: true, holes, members, roundId: 3 });
    assert.equal(members[0].holes[0].gross, 4);
    assert.ok(members[0].holes[0].net <= 3);
    assert.equal(slots.grossBirdies, 0);
    assert.equal(slots.netBirdies, 1);
    assert.equal(slots.spins, 1);
    assert.equal(slots.spinLog[0].kind, 'net');
  });

  it('keeps fun points on the player who made the birdie, not a team pot', () => {
    const holes = [
      { holeNumber: 1, par: 5 },
      { holeNumber: 2, par: 4 },
    ];
    const members = [
      member(1, 'David', 0, [4, 4]),
      member(2, 'Brian', 0, [5, 3]),
      member(3, 'Matt', 0, [3, 3]),
    ];
    const slots = computeBirdieSlots({ on: true, holes, members, roundId: 9 });
    const david = slots.players.find((p) => p.name === 'David');
    const brian = slots.players.find((p) => p.name === 'Brian');
    const matt = slots.players.find((p) => p.name === 'Matt');
    assert.equal(david.spins, 2);
    assert.equal(brian.spins, 2);
    assert.equal(matt.spins, 4);
    assert.equal(david.points + brian.points + matt.points, slots.points);
    assert.equal(slots.funBoard, slots.players.filter((p) => p.spins).map((p) => `${p.name} ${p.points}`).join(' · '));
    assert.match(slots.funBoard, /David \d+/);
    assert.match(slots.funBoard, /Brian \d+/);
    assert.match(slots.funBoard, /Matt \d+/);
    assert.match(slots.strip, /^Wyrm Coil /);
    assert.doesNotMatch(slots.strip, /team pot|team money/i);
    const logDavid = slots.spinLog.filter((s) => s.name === 'David');
    const logMatt = slots.spinLog.filter((s) => s.name === 'Matt');
    assert.equal(logDavid.reduce((n, s) => n + s.points, 0), david.points);
    assert.equal(logMatt.reduce((n, s) => n + s.points, 0), matt.points);
    assert.ok(matt.spins > david.spins);
  });
});

describe('Side-game config and vs-par lock', () => {
  it('defaults skins off and keeps the five games', () => {
    const cfg = parseSideGames(null);
    assert.equal(cfg.skins.on, false);
    assert.equal(cfg.nines.blitz, true);
    assert.equal(cfg.birdieSlots.on, true);
    assert.equal(cfg.kps.on, false);
    ['skins', 'vegas', 'nassau', 'wolf', 'nines'].forEach((key) => assert.ok(cfg[key]));
    assert.equal(cfg.wolf.partnered, 1);
    assert.equal(cfg.wolf.lone, 2);
    assert.equal(cfg.wolf.blind, 4);
    assert.equal(parseSideGames({ wolf: { on: true, blind: 3 } }).wolf.blind, 3);
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
