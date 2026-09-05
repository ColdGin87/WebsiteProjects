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
  TEAM_GAMES,
  gameFromKey,
  formatRuleText,
  formatLabel,
  shortFormatLabel,
  teamDisplayName,
  nextTeamLabel,
  sanitizeNickname,
} = require('../lib/scoring');
const { estimateRedYards, WHITE_TOTAL, RED_TOTAL, WHITE_HOLES } = require('../lib/seed/goldendale');
const { appBaseUrl } = require('../lib/tokens');
const { resultsText } = require('../lib/compute/roundState');
const { DEMO_FOURSOME, demoGrossTotal } = require('../lib/seed/demoFoursome');
const {
  DEMO_TEAM1_VS_PAR,
  COLDGIN,
  GOLDENDALE_PARS,
  GOLDENDALE_SI,
  demoPlayerNets,
  team1VsParHoles,
  team1VsParRace,
  coldGinIsStrokesReceived,
} = require('../lib/seed/demoTeam1VsPar');
const { formatVsPar, holeTeamVsPar, runningTeamVsPar, strokeDotMarks } = require('../lib/compute/vsPar');
const { computePlayingHandicap, isTeamRaceOn } = require('../lib/compute/roundState');
const { computeFunFacts, segmentLeaders } = require('../lib/compute/funFacts');

describe('playingHandicap', () => {
  it('keeps whole numbers', () => {
    assert.equal(playingHandicap(18), 18);
  });

  it('rounds decimals to nearest', () => {
    assert.equal(playingHandicap(10.4), 10);
    assert.equal(playingHandicap(10.5), 11);
    assert.equal(playingHandicap(11.5), 12);
    assert.equal(playingHandicap(2.4), 2);
    assert.equal(playingHandicap(2.5), 3);
    assert.equal(playingHandicap(18.7), 19);
    assert.equal(playingHandicap(1.3), 1);
  });

  it('parses plus as negative', () => {
    assert.equal(playingHandicap('+2'), -2);
    assert.equal(playingHandicap(-2), -2);
  });
});

describe('index-only playing handicap', () => {
  it('ignores slope, rating, and allowance', () => {
    assert.equal(computePlayingHandicap(2.4), 2);
    assert.equal(computePlayingHandicap(2.5), 3);
    assert.equal(computePlayingHandicap(18.7), 19);
    assert.equal(computePlayingHandicap('1.3'), 1);
    assert.equal(computePlayingHandicap('+2'), -2);
  });
});

describe('team race toggle', () => {
  it('defaults on and turns off only when stored as 0 or false', () => {
    assert.equal(isTeamRaceOn({}), true);
    assert.equal(isTeamRaceOn({ team_race: 1 }), true);
    assert.equal(isTeamRaceOn({ team_race: 0 }), false);
    assert.equal(isTeamRaceOn({ teamRace: false }), false);
  });
});

describe('fun facts', () => {
  it('counts birdies and names hardest and easiest holes', () => {
    const facts = computeFunFacts({
      holes: [
        { hole_number: 1, par: 4 },
        { hole_number: 2, par: 5 },
      ],
      members: [
        { display_name: 'Ann', holes: [{ holeNumber: 1, gross: 3 }, { holeNumber: 2, gross: 6 }] },
        { display_name: 'Bob', holes: [{ holeNumber: 1, gross: 5 }, { holeNumber: 2, gross: 5 }] },
      ],
      teams: [{ name: 'Team 1', holes: [{ total: -1 }, { total: 2 }] }],
    });
    assert.equal(facts.totalBirdies, 1);
    assert.equal(facts.mostBirdies.name, 'Ann');
    assert.equal(facts.hardest.hole, 2);
    assert.equal(facts.easiest.hole, 1);
    assert.equal(facts.biggestSwing.name, 'Team 1');
    assert.deepEqual(segmentLeaders([{ name: 'Team 1', out: -2 }, { name: 'Team 2', out: 1 }], 'out').map((t) => t.name), ['Team 1']);
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
  it('four players H 4,11,18,24 on SI 1 par 5 → team +1 vs par', () => {
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

    const team = teamHoleScore(players, { grossBalls: 1, netBalls: 2, dualCount: false, par: 5 });
    assert.equal(team.total, 1);
    assert.equal(team.incomplete, false);
    assert.equal(team.balls.length, 3);
    const ids = team.balls.map((b) => b.playerId);
    assert.equal(new Set(ids).size, 3);
    assert.equal(team.balls.filter((b) => b.type === 'gross').length, 1);
    assert.equal(team.balls.filter((b) => b.type === 'net').length, 2);
    assert.equal(holeTeamVsPar(team.total), 1, 'team hole total is already vs par');
    assert.equal(formatVsPar(team.total), '+1');
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
    assert.equal(holeTeamVsPar(-2), -2);
    assert.equal(formatVsPar(holeTeamVsPar(-2)), '-2');
  });

  it('running line is the sum of hole vs-par through that hole', () => {
    const holes = [
      { holeNumber: 1, total: -2 },
      { holeNumber: 2, total: 2 },
    ];
    assert.equal(runningTeamVsPar(holes, 1), -2);
    assert.equal(formatVsPar(runningTeamVsPar(holes, 1)), '-2');
    assert.equal(runningTeamVsPar(holes, 2), 0);
    assert.equal(formatVsPar(runningTeamVsPar(holes, 2)), 'E');
  });
});

describe('teamHoleScore', () => {
  it('does not treat a missing gross as zero', () => {
    const team = teamHoleScore(
      [
        { id: 1, gross: 5, net: 4 },
        { id: 2, gross: 6, net: 5 },
        { id: 3, gross: 7, net: 6 },
        { id: 4, gross: null, net: null },
      ],
      { grossBalls: 1, netBalls: 2, par: 5 }
    );
    assert.equal(team.incomplete, false);
    assert.equal(team.total, 1);
  });

  it('flags incomplete when fewer than three scores', () => {
    const team = teamHoleScore(
      [
        { id: 1, gross: 4, net: 4 },
        { id: 2, gross: 5, net: 4 },
      ],
      { grossBalls: 1, netBalls: 2, par: 4 }
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
      { grossBalls: 1, netBalls: 1, dualCount: true, par: 4 }
    );
    assert.equal(team.incomplete, false);
    assert.equal(team.total, -3); // same player: gross 3 (−1) + net 2 (−2)
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
      { grossBalls: 1, netBalls: 1, dualCount: false, par: 5 }
    );
    // Best vs par: A gross 0 + B net −1 = −1 (not B gross 0 + A net 0)
    assert.equal(team.total, -1);
    assert.equal(team.balls.find((b) => b.type === 'gross').playerId, 'A');
    assert.equal(team.balls.find((b) => b.type === 'net').playerId, 'B');
    assert.equal(team.balls.filter((b) => b.type === 'gross').length, 1);
    assert.equal(team.balls.filter((b) => b.type === 'net').length, 1);
  });

  it('keeps the best vs-par combo, not lowest-gross-first', () => {
    const team = teamHoleScore(
      [
        { id: 'A', gross: 4, net: 3 },
        { id: 'B', gross: 5, net: 5 },
        { id: 'C', gross: 5, net: 5 },
      ],
      { grossBalls: 1, netBalls: 2, dualCount: false, par: 5 }
    );
    // Lowest-gross-first would lock A as gross (−1) + B/C nets (0+0) = −1.
    // Best: B or C as gross (0) + A net (−2) + other net (0) = −2.
    assert.equal(team.total, -2);
    assert.equal(team.balls.find((b) => b.type === 'net').playerId, 'A');
    assert.equal(team.balls.find((b) => b.type === 'gross').playerId !== 'A', true);
  });
});

describe('team game formats', () => {
  it('ships the selectable games with 1G+2N default and 1G+1N', () => {
    assert.deepEqual(TEAM_GAMES.map((g) => g.key), ['3G', '3N', '1G1N', '1G2N', '1G3N', '2G2N']);
    assert.equal(gameFromKey('1G2N').isDefault, true);
    assert.equal(gameFromKey('missing').key, '1G2N');
    assert.equal(gameFromKey('1G1N').grossBalls, 1);
    assert.equal(gameFromKey('1G1N').netBalls, 1);
    assert.match(formatLabel(1, 2), /1 gross \+ 2 net vs par/);
    assert.match(formatLabel(1, 1), /1 gross \+ 1 net vs par/);
    assert.equal(shortFormatLabel(1, 2), '1G+2N');
    assert.equal(shortFormatLabel(1, 1), '1G+1N');
    assert.equal(shortFormatLabel(3, 0), '3G');
    assert.match(formatRuleText(1, 2), /1 gross score and 2 net scores/);
    assert.match(formatRuleText(1, 1), /1 gross score and 1 net score/);
    assert.match(formatRuleText(1, 2), /vs par/);
    assert.match(formatRuleText(1, 2), /lowest \(best\) combo/);
    assert.match(formatRuleText(1, 2), /running vs-par total/);
  });
});

describe('validateGross', () => {
  it('accepts 1 through 15', () => {
    assert.equal(validateGross(1), 1);
    assert.equal(validateGross(15), 15);
    assert.equal(validateGross(19), 19);
  });

  it('rejects out of range', () => {
    assert.throws(() => validateGross(0), /1 to 19/);
    assert.throws(() => validateGross(20), /1 to 19/);
    assert.throws(() => validateGross(4.5), /1 to 19/);
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

describe('Team 1 vs-par demo ColdGin / Kurt / Chase / Brian', () => {
  it('keeps ColdGin HCP 3 as strokes received, not plus', () => {
    assert.equal(COLDGIN.handicap, 3);
    assert.equal(COLDGIN.playingHandicap, 3);
    assert.ok(coldGinIsStrokesReceived());
    assert.equal(strokesOnHole(3, 1), 1, 'SI 1 receives a stroke');
    assert.equal(strokesOnHole(3, 2), 1, 'SI 2 receives a stroke');
    assert.equal(strokesOnHole(3, 3), 1, 'SI 3 receives a stroke');
    assert.equal(strokesOnHole(3, 4), 0, 'SI 4 does not');
    assert.equal(strokesOnHole(3, 18), 0, 'easiest hole does not give a stroke back');
    assert.equal(strokesOnHole('+3', 18), -1, '+3 would give a stroke on SI 18');
    assert.notEqual(strokesOnHole(COLDGIN.playingHandicap, 18), -1);
  });

  it('ColdGin is par every hole and the other three keep 75/66 85/73 95/80', () => {
    const names = DEMO_TEAM1_VS_PAR.map((p) => p.name);
    assert.deepEqual(names, ['ColdGin', 'Kurt', 'Chase', 'Brian']);
    DEMO_TEAM1_VS_PAR.forEach((p) => assert.equal(p.teamName, 'Team 1'));
    assert.deepEqual(COLDGIN.holes, GOLDENDALE_PARS);
    assert.equal(COLDGIN.holes.reduce((s, g) => s + g, 0), 72);
    const coldNets = demoPlayerNets(COLDGIN);
    assert.equal(coldNets.reduce((s, n) => s + n, 0), 69);
    GOLDENDALE_SI.forEach((si, idx) => {
      const want = si <= 3 ? GOLDENDALE_PARS[idx] - 1 : GOLDENDALE_PARS[idx];
      assert.equal(coldNets[idx], want, 'ColdGin net hole ' + (idx + 1));
    });
    const locked = [
      { name: 'Kurt', gross: 75, net: 66 },
      { name: 'Chase', gross: 85, net: 73 },
      { name: 'Brian', gross: 95, net: 80 },
    ];
    locked.forEach((want) => {
      const player = DEMO_TEAM1_VS_PAR.find((p) => p.name === want.name);
      assert.equal(demoGrossTotal(player), want.gross, want.name + ' gross');
      assert.equal(demoPlayerNets(player).reduce((s, n) => s + n, 0), want.net, want.name + ' net');
    });
  });

  it('best 1G+2N vs-par is computed hole-by-hole with a running race', () => {
    const holes = team1VsParHoles();
    const race = team1VsParRace(holes);
    assert.equal(holes.length, 18);
    assert.equal(holes[0].total, -2, 'hole 1 best 1G+2N with ColdGin at par');
    holes.forEach((h) => {
      assert.equal(typeof h.total, 'number');
      assert.ok(h.balls.length >= 3, 'hole ' + h.holeNumber + ' counts 1G+2N');
    });
    const sum = holes.reduce((s, h) => s + h.total, 0);
    assert.equal(race[17].race, sum);
    assert.equal(race[0].race, holes[0].total);
  });
});

describe('resultsText leading vs winning', () => {
  function sample(status) {
    return {
      round: { name: 'Saturday', format: 'team_net', status, course: { name: 'Goldendale Golf Club' } },
      winner: { name: 'Team 1', total: 2 },
      teams: [{ name: 'Team 1', total: 2, incomplete: false, members: [] }],
      unassigned: [],
      holeResults: [],
    };
  }

  it('says Leading team while the round is live', () => {
    const text = resultsText(sample('live'));
    assert.match(text, /Leading team: Team 1 \(\+2\)/);
    assert.equal(text.includes('Winning team'), false);
  });

  it('says Winning team only when the round is completed', () => {
    const text = resultsText(sample('completed'));
    assert.match(text, /Winning team: Team 1 \(\+2\)/);
    assert.equal(text.includes('Leading team'), false);
  });

  it('does not label leftover players as Individual', () => {
    const text = resultsText({
      ...sample('live'),
      unassigned: [{ display_name: 'Guest', totalGross: 72, totalNet: 70 }],
    });
    assert.equal(text.includes('Individual'), false);
    assert.match(text, /Unassigned/);
  });
});

describe('team identity', () => {
  it('shows Team N · nickname and finds the next Team number', () => {
    assert.equal(sanitizeNickname('  Birds  '), 'Birds');
    assert.equal(teamDisplayName({ name: 'Team 1' }), 'Team 1');
    assert.equal(teamDisplayName({ name: 'Team 1', nickname: 'Birds' }), 'Team 1 · Birds');
    assert.equal(nextTeamLabel([{ name: 'Team 1' }]), 'Team 2');
    assert.equal(nextTeamLabel([{ name: 'Team 1' }, { name: 'Team 2' }]), 'Team 3');
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
