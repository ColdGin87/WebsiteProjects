/**
 * Demo foursome for a live Goldendale card.
 * Playing handicaps are set to the stated indexes so strokes match
 * the locked 18-hole dots formula (not a course-handicap rewrite).
 *
 * Kurt  H 9  gross 75 → 9 strokes → net 66
 * Chase H 12 gross 85 → 12 strokes → net 73
 * Brian H 15 gross 95 → 15 strokes → net 80
 *
 * Hole-by-hole grosses are 1–15 and sum to those 18-hole totals.
 * Do not apply these scores to anyone already on the card except
 * Kurt / Chase / Brian themselves.
 */

const DEMO_FOURSOME = [
  {
    name: 'Kurt',
    handicap: 9,
    playingHandicap: 9,
    teamName: 'Team 1',
    grossTarget: 75,
    netTarget: 66,
    holes: [5, 4, 4, 3, 4, 5, 4, 4, 4, 5, 4, 4, 3, 5, 5, 4, 4, 4],
  },
  {
    name: 'Chase',
    handicap: 12,
    playingHandicap: 12,
    teamName: 'Team 1',
    grossTarget: 85,
    netTarget: 73,
    holes: [5, 5, 4, 4, 5, 6, 5, 4, 4, 6, 5, 5, 3, 5, 6, 5, 4, 4],
  },
  {
    name: 'Brian',
    handicap: 15,
    playingHandicap: 15,
    teamName: 'Team 1',
    grossTarget: 95,
    netTarget: 80,
    holes: [6, 6, 5, 4, 5, 7, 5, 5, 4, 7, 6, 5, 4, 6, 6, 5, 5, 4],
  },
];

function demoGrossTotal(player) {
  return (player.holes || []).reduce((s, g) => s + g, 0);
}

module.exports = {
  DEMO_FOURSOME,
  demoGrossTotal,
};
