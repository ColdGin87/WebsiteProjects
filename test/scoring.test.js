const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  courseHandicap,
  strokesOnHole,
  netScore,
  teamHoleScore,
  playingHandicap,
  validateGross,
  autoBalanceTeams,
} = require('../lib/scoring');
const { estimateRedYards, WHITE_TOTAL, RED_TOTAL, WHITE_HOLES } = require('../lib/seed/goldendale');
const { appBaseUrl } = require('../lib/tokens');
const { resultsText } = require('../lib/compute/roundState');
const { DEMO_FOURSOME, demoGrossTotal } = require('../lib/seed/demoFoursome');
const { formatVsPar, holeTeamVsPar, runningTeamVsPar, strokeDotMarks } = require('../lib/compute/vsPar');

describe('playingHandicap', () => {
  it('keeps whole numbers', () => {
    assert.equal(playingHandicap(18), 18);
  });

  it('rounds decimals to nearest', () => {
    assert.equal(playingHandicap(10.4), 10);
    assert.equal(playingHandicap(10.5), 11);
    assert.equal(playingHandicap(11.5), 12);
  });

  it('parses plus as negative', () => {
    assert.equal(playingHandicap('+2'), -2);
    assert.equal(playingHandicap(-2), -2);
  });
});

describe('courseHandicap', () => {
  it('uses slope, rating, par, and allowance', () => {
    // Goldendale White/Blue men: 67.9 / 112 / par 72
    // 18 * (112/113) + (67.9 - 72) = 17.8407 - 4.1 = 13.7407 → 14
    assert.equal(courseHandicap(18, { slope: 112, rating: 67.9, par: 72 }), 14);
  });

  it('applies 80% allowance after course handicap', () => {
    const full = courseHandicap(18, { slope: 112, rating: 67.9, par: 72, allowance: 100 });
    const eighty = courseHandicap(18, { slope: 112, rating: 67.9, par: 72, allowance: 80 });
    assert.equal(full, 14);
    assert.equal(eighty, 11); // 13.7407 * 0.8 = 10.992 → 11
  });

  it('halves for 9-hole play', () => {
    assert.equal(courseHandicap(18, { slope: 113, rating: 72, par: 72, holes: 9 }), 9);
  });
});

describe('strokesOnHole 18-hole', () => {
  it('gives 18 hcp one stroke every hole', () => {
    for (let si = 1; si <= 18; si++) {
      assert.equal(strokesOnHole(18, si), 1, `SI ${si}`);
    }
  });

  it('gives 22 hcp one every hole plus second on SI 1-4', () => {
    for (let si = 1; si <= 18; si++) {
      const expected = si <= 4 ? 2 : 1;
      assert.equal(strokesOnHole(22, si), expected, `SI ${si}`);
    }
  });

  it('gives 9 hcp strokes on SI 1-9', () => {
    for (let si = 1; si <= 18; si++) {
      assert.equal(strokesOnHole(9, si), si <= 9 ? 1 : 0, `SI ${si}`);
    }
  });

  it('gives 24 hcp two strokes on SI 1', () => {
    assert.equal(strokesOnHole(24, 1), 2);
    assert.equal(strokesOnHole(24, 6), 2);
    assert.equal(strokesOnHole(24, 7), 1);
  });

  it('gives plus strokes back from SI 18 down', () => {
    assert.equal(strokesOnHole('+2', 18), -1);
    assert.equal(strokesOnHole('+2', 17), -1);
    assert.equal(strokesOnHole('+2', 16), 0);
    assert.equal(strokesOnHole('+1', 18), -1);
    assert.equal(strokesOnHole('+1', 17), 0);
  });

  it('gives +18 minus one every hole', () => {
    for (let si = 1; si <= 18; si++) {
      assert.equal(strokesOnHole('+18', si), -1, `SI ${si}`);
    }
  });

  it('gives zero handicap no strokes', () => {
    for (let si = 1; si <= 18; si++) {
      assert.equal(strokesOnHole(0, si), 0);
    }
  });

  it('rounds decimal handicap before allocating', () => {
    assert.equal(strokesOnHole(4.4, 4), 1);
    assert.equal(strokesOnHole(4.4, 5), 0);
    assert.equal(strokesOnHole(4.5, 5), 1);
  });
});

describe('strokesOnHole 9-hole', () => {
  const front = [
    { holeNumber: 1, strokeIndex: 1 },
    { holeNumber: 2, strokeIndex: 5 },
    { holeNumber: 3, strokeIndex: 9 },
    { holeNumber: 4, strokeIndex: 17 },
    { holeNumber: 5, strokeIndex: 3 },
    { holeNumber: 6, strokeIndex: 7 },
    { holeNumber: 7, strokeIndex: 15 },
    { holeNumber: 8, strokeIndex: 13 },
    { holeNumber: 9, strokeIndex: 11 },
  ];

  it('uses round(H/2) against that nine\'s SI ranks', () => {
    // H 18 → 9-hole 9 → one on every hole of the nine
    for (const hole of front) {
      assert.equal(
        strokesOnHole(18, hole.strokeIndex, {
          holes: 9,
          nineHoles: front,
          holeNumber: hole.holeNumber,
        }),
        1
      );
    }

    // H 9 → 9-hole 5 → five hardest: 1,5,2,6,3
    const hardFive = new Set([1, 5, 2, 6, 3]);
    for (const hole of front) {
      const strokes = strokesOnHole(9, hole.strokeIndex, {
        holes: 'front9',
        nineHoles: front,
        holeNumber: hole.holeNumber,
      });
      assert.equal(strokes, hardFive.has(hole.holeNumber) ? 1 : 0, `hole ${hole.holeNumber}`);
    }
  });
});

describe('netScore', () => {
  it('subtracts strokes from gross', () => {
    assert.equal(netScore(5, 1), 4);
    assert.equal(netScore(8, 2), 6);
    assert.equal(netScore(4, -1), 5);
  });

  it('returns null without a gross', () => {
    assert.equal(netScore(null, 1), null);
  });
});

describe('Goldendale required team hole', () => {
  it('four players H 4,11,18,24 on SI 1 par 5 → team 16', () => {
    const players = [
      { id: 'A', handicap: 4, gross: 5 },
      { id: 'B', handicap: 11, gross: 6 },
      { id: 'C', handicap: 18, gross: 7 },
      { id: 'D', handicap: 24, gross: 8 },
    ].map((p) => {
      const strokes = strokesOnHole(p.handicap, 1);
      return { ...p, strokes, net: netScore(p.gross, strokes) };
    });

    assert.deepEqual(players.map((p) => p.strokes), [1, 1, 1, 2]);
    assert.deepEqual(players.map((p) => p.net), [4, 5, 6, 6]);

    const team = teamHoleScore(players, { grossBalls: 1, netBalls: 2, dualCount: false });
    assert.equal(team.total, 16);
    assert.equal(team.incomplete, false);
    assert.equal(team.balls.length, 3);
    const ids = team.balls.map((b) => b.playerId);
    assert.equal(new Set(ids).size, 3);
    assert.equal(team.balls.filter((b) => b.type === 'gross').length, 1);
    assert.equal(team.balls.filter((b) => b.type === 'net').length, 2);
    assert.equal(holeTeamVsPar(team.total, 5), 1, 'team 16 vs par 5 is +1 display only');
  });
});

describe('stroke dots and team vs-par display', () => {
  it('paints 1 / 2 / 3 marks and a distinct plus', () => {
    assert.deepEqual(strokeDotMarks(1), { plus: false, count: 1 });
    assert.deepEqual(strokeDotMarks(2), { plus: false, count: 2 });
    assert.deepEqual(strokeDotMarks(3), { plus: false, count: 3 });
    assert.deepEqual(strokeDotMarks(4), { plus: false, count: 3 });
    assert.deepEqual(strokeDotMarks(0), { plus: false, count: 0 });
    assert.deepEqual(strokeDotMarks(-1), { plus: true, count: 0 });
  });

  it('formats hole vs par as E / -2 / +1', () => {
    assert.equal(formatVsPar(0), 'E');
    assert.equal(formatVsPar(-2), '-2');
    assert.equal(formatVsPar(1), '+1');
    assert.equal(holeTeamVsPar(13, 5), -2);
    assert.equal(formatVsPar(holeTeamVsPar(13, 5)), '-2');
  });

  it('running line is the sum of hole vs-par through that hole', () => {
    const holes = [
      { holeNumber: 1, par: 5, total: 13 },
      { holeNumber: 2, par: 4, total: 12 },
    ];
    assert.equal(runningTeamVsPar(holes, 1), -2);
    assert.equal(formatVsPar(runningTeamVsPar(holes, 1)), '-2');
    assert.equal(runningTeamVsPar(holes, 2), -2);
    assert.equal(formatVsPar(runningTeamVsPar(holes, 2)), '-2');
  });
});

describe('teamHoleScore', () => {
  it('flags incomplete when fewer than three scores', () => {
    const team = teamHoleScore(
      [
        { id: 1, gross: 4, net: 4 },
        { id: 2, gross: 5, net: 4 },
      ],
      { grossBalls: 1, netBalls: 2 }
    );
    assert.equal(team.incomplete, true);
    assert.ok(team.total != null);
  });

  it('allows dual-count when enabled', () => {
    const team = teamHoleScore(
      [
        { id: 1, gross: 3, net: 2 },
        { id: 2, gross: 8, net: 7 },
      ],
      { grossBalls: 1, netBalls: 1, dualCount: true }
    );
    assert.equal(team.incomplete, false);
    assert.equal(team.total, 5); // 3 gross + 2 net from same player
    assert.equal(team.balls[0].playerId, 1);
    assert.equal(team.balls[1].playerId, 1);
  });

  it('breaks ties with the lowest hole-total combo', () => {
    const team = teamHoleScore(
      [
        { id: 'A', gross: 5, net: 5 },
        { id: 'B', gross: 5, net: 4 },
        { id: 'C', gross: 6, net: 6 },
      ],
      { grossBalls: 1, netBalls: 1, dualCount: false }
    );
    // Best: B gross 5 + A net 5 = 10, or A gross 5 + B net 4 = 9
    assert.equal(team.total, 9);
    assert.equal(team.balls.find((b) => b.type === 'gross').playerId, 'A');
    assert.equal(team.balls.find((b) => b.type === 'net').playerId, 'B');
  });
});

describe('validateGross', () => {
  it('accepts 1 through 15', () => {
    assert.equal(validateGross(1), 1);
    assert.equal(validateGross(15), 15);
  });

  it('rejects out of range', () => {
    assert.throws(() => validateGross(0), /1 to 15/);
    assert.throws(() => validateGross(16), /1 to 15/);
    assert.throws(() => validateGross(4.5), /1 to 15/);
  });
});

describe('autoBalanceTeams', () => {
  it('snake-drafts by handicap', () => {
    const players = [4, 8, 10, 12, 18, 24].map((h, i) => ({ id: i + 1, handicap: h }));
    const teams = autoBalanceTeams(players, 2);
    assert.equal(teams[0].memberIds.length, 3);
    assert.equal(teams[1].memberIds.length, 3);
    // 1 (4) → T1, 2 (8) → T2, 3 (10) → T2, 4 (12) → T1, 5 (18) → T1, 6 (24) → T2
    assert.deepEqual(teams[0].memberIds, [1, 4, 5]);
    assert.deepEqual(teams[1].memberIds, [2, 3, 6]);
  });
});

describe('demo foursome Kurt / Chase / Brian', () => {
  it('uses locked dots so 75/85/95 become nets 66/73/80', () => {
    const expected = [
      { name: 'Kurt', gross: 75, net: 66, strokes: 9 },
      { name: 'Chase', gross: 85, net: 73, strokes: 12 },
      { name: 'Brian', gross: 95, net: 80, strokes: 15 },
    ];
    DEMO_FOURSOME.forEach((player, i) => {
      assert.equal(player.holes.length, 18, player.name + ' 18 holes');
      assert.equal(demoGrossTotal(player), expected[i].gross, player.name + ' gross');
      player.holes.forEach((g) => {
        assert.ok(g >= 1 && g <= 15, player.name + ' hole in 1–15');
      });
      let strokeSum = 0;
      let netSum = 0;
      player.holes.forEach((gross, idx) => {
        const si = [1, 5, 9, 17, 3, 7, 15, 13, 11, 2, 6, 10, 18, 4, 8, 16, 14, 12][idx];
        const strokes = strokesOnHole(player.playingHandicap, si);
        strokeSum += strokes;
        netSum += netScore(gross, strokes);
      });
      assert.equal(strokeSum, expected[i].strokes, player.name + ' strokes');
      assert.equal(netSum, expected[i].net, player.name + ' net');
    });
  });
});

describe('resultsText leading vs winning', () => {
  function sample(status) {
    return {
      round: { name: 'Saturday', format: 'team_net', status, course: { name: 'Goldendale Golf Club' } },
      winner: { name: 'Team 1', total: 87 },
      teams: [{ name: 'Team 1', total: 87, incomplete: false, members: [] }],
      unassigned: [],
      holeResults: [],
    };
  }

  it('says Leading team while the round is live', () => {
    const text = resultsText(sample('live'));
    assert.match(text, /Leading team: Team 1 \(87\)/);
    assert.equal(text.includes('Winning team'), false);
  });

  it('says Winning team only when the round is completed', () => {
    const text = resultsText(sample('completed'));
    assert.match(text, /Winning team: Team 1 \(87\)/);
    assert.equal(text.includes('Leading team'), false);
  });
});

describe('appBaseUrl', () => {
  it('uses http for localhost when no forwarded proto', () => {
    assert.equal(appBaseUrl({ headers: { host: 'localhost:3000' } }), 'http://localhost:3000');
  });
});

describe('Goldendale seed yardages', () => {
  it('keeps official White/Blue total', () => {
    assert.equal(WHITE_TOTAL, 5683);
    assert.equal(WHITE_HOLES.length, 18);
  });

  it('estimates Red/Gold hole yards to the published 5066 total', () => {
    const yards = estimateRedYards();
    assert.equal(yards.length, 18);
    assert.equal(yards.reduce((s, y) => s + y, 0), RED_TOTAL);
  });
});
