/**
 * Match Rotation Engine
 *
 * Implements the tournament structure for 8 players over 5 rounds of match play.
 * All 28 unique pairings (C(8,2)) are covered across front-nine and back-nine
 * matches. Every player shares a foursome with every other player at least once,
 * ensuring balanced social mixing.
 *
 * Position indices 0-7 correspond to the 8 players sorted by handicap
 * (lowest handicap = index 0).
 */

const ROTATION = [
  {
    roundNumber: 1,
    foursomes: [
      {
        group: 'A',
        positions: [0, 1, 2, 3],
        matches: {
          front: [
            { p1: 0, p2: 1 },
            { p1: 2, p2: 3 },
          ],
          back: [
            { p1: 0, p2: 2 },
            { p1: 1, p2: 3 },
          ],
        },
      },
      {
        group: 'B',
        positions: [4, 5, 6, 7],
        matches: {
          front: [
            { p1: 4, p2: 5 },
            { p1: 6, p2: 7 },
          ],
          back: [
            { p1: 4, p2: 6 },
            { p1: 5, p2: 7 },
          ],
        },
      },
    ],
  },
  {
    roundNumber: 2,
    foursomes: [
      {
        group: 'A',
        positions: [0, 1, 4, 5],
        matches: {
          front: [
            { p1: 0, p2: 4 },
            { p1: 1, p2: 5 },
          ],
          back: [
            { p1: 0, p2: 5 },
            { p1: 1, p2: 4 },
          ],
        },
      },
      {
        group: 'B',
        positions: [2, 3, 6, 7],
        matches: {
          front: [
            { p1: 2, p2: 6 },
            { p1: 3, p2: 7 },
          ],
          back: [
            { p1: 2, p2: 7 },
            { p1: 3, p2: 6 },
          ],
        },
      },
    ],
  },
  {
    roundNumber: 3,
    foursomes: [
      {
        group: 'A',
        positions: [0, 1, 6, 7],
        matches: {
          front: [
            { p1: 0, p2: 6 },
            { p1: 1, p2: 7 },
          ],
          back: [
            { p1: 0, p2: 7 },
            { p1: 1, p2: 6 },
          ],
        },
      },
      {
        group: 'B',
        positions: [2, 3, 4, 5],
        matches: {
          front: [
            { p1: 2, p2: 4 },
            { p1: 3, p2: 5 },
          ],
          back: [
            { p1: 2, p2: 5 },
            { p1: 3, p2: 4 },
          ],
        },
      },
    ],
  },
  {
    roundNumber: 4,
    foursomes: [
      {
        group: 'A',
        positions: [0, 3, 4, 7],
        matches: {
          front: [
            { p1: 0, p2: 3 },
            { p1: 4, p2: 7 },
          ],
          back: [
            { p1: 0, p2: 4 },
            { p1: 3, p2: 7 },
          ],
        },
      },
      {
        group: 'B',
        positions: [1, 2, 5, 6],
        matches: {
          front: [
            { p1: 1, p2: 2 },
            { p1: 5, p2: 6 },
          ],
          back: [
            { p1: 1, p2: 5 },
            { p1: 2, p2: 6 },
          ],
        },
      },
    ],
  },
  {
    roundNumber: 5,
    foursomes: [
      {
        group: 'A',
        positions: [0, 2, 5, 7],
        matches: {
          front: [
            { p1: 0, p2: 2 },
            { p1: 5, p2: 7 },
          ],
          back: [
            { p1: 0, p2: 5 },
            { p1: 2, p2: 7 },
          ],
        },
      },
      {
        group: 'B',
        positions: [1, 3, 4, 6],
        matches: {
          front: [
            { p1: 1, p2: 3 },
            { p1: 4, p2: 6 },
          ],
          back: [
            { p1: 1, p2: 4 },
            { p1: 3, p2: 6 },
          ],
        },
      },
    ],
  },
];

/**
 * Generate the full tournament schedule from an array of 8 player IDs.
 *
 * @param {number[]} playerIds - Array of exactly 8 player IDs, sorted by handicap
 *                               (lowest handicap first).
 * @returns {Object[]} Array of round objects with resolved player IDs.
 */
function generateSchedule(playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length !== 8) {
    throw new Error('generateSchedule requires exactly 8 player IDs');
  }

  return ROTATION.map((round) => ({
    roundNumber: round.roundNumber,
    foursomes: round.foursomes.map((foursome) => {
      const resolvedPlayerIds = foursome.positions.map((pos) => playerIds[pos]);

      const resolveMatches = (matchList) =>
        matchList.map((m) => ({
          player1: playerIds[m.p1],
          player2: playerIds[m.p2],
        }));

      return {
        group: foursome.group,
        playerIds: resolvedPlayerIds,
        matches: {
          front: resolveMatches(foursome.matches.front),
          back: resolveMatches(foursome.matches.back),
        },
      };
    }),
  }));
}

/**
 * Calculate match play result text from an array of hole results.
 *
 * Each hole result object should have:
 *   - holeNumber: the hole number within the 9-hole half
 *   - winner: 'player1' | 'player2' | 'halved'
 *
 * The match is evaluated as a 9-hole match play contest. If a player is up
 * by more holes than remain, the match is closed out early (e.g., "3&2").
 *
 * @param {Object[]} holes - Array of hole result objects, ordered by hole number.
 *                           Each must have { holeNumber, winner }.
 * @returns {{ result: string, winner: string|null }}
 *          result is the text like "3&2", "1UP", "A/S"
 *          winner is 'player1', 'player2', or null for all-square
 */
function calculateMatchResult(holes) {
  if (!Array.isArray(holes) || holes.length === 0) {
    throw new Error('calculateMatchResult requires a non-empty array of hole results');
  }

  const totalHoles = holes.length;
  let p1Score = 0; // positive = player1 leads, negative = player2 leads

  for (let i = 0; i < totalHoles; i++) {
    const hole = holes[i];

    if (hole.winner === 'player1') {
      p1Score++;
    } else if (hole.winner === 'player2') {
      p1Score--;
    }
    // 'halved' leaves the score unchanged

    // Check for early close-out: lead > remaining holes
    const holesPlayed = i + 1;
    const holesRemaining = totalHoles - holesPlayed;
    const lead = Math.abs(p1Score);

    if (lead > holesRemaining && holesRemaining > 0) {
      return {
        result: `${lead}&${holesRemaining}`,
        winner: p1Score > 0 ? 'player1' : 'player2',
      };
    }
  }

  // All holes played
  if (p1Score === 0) {
    return { result: 'A/S', winner: null };
  }

  return {
    result: `${Math.abs(p1Score)}UP`,
    winner: p1Score > 0 ? 'player1' : 'player2',
  };
}

/**
 * Calculate the number of handicap strokes one player gives to the other.
 *
 * In match play, strokes are based on the difference between the two players'
 * course handicaps. The lower-handicap player plays off scratch (0 strokes)
 * and the higher-handicap player receives the difference.
 *
 * For 9-hole matches the stroke allowance is half the 18-hole difference,
 * rounded to the nearest integer.
 *
 * @param {number} player1Handicap - Player 1 course handicap
 * @param {number} player2Handicap - Player 2 course handicap
 * @param {number} numHoles - Number of holes in the match (9 or 18)
 * @returns {{ player1Strokes: number, player2Strokes: number }}
 */
function calculateHandicapStrokes(player1Handicap, player2Handicap, numHoles) {
  const diff = Math.abs(player1Handicap - player2Handicap);

  let strokes;
  if (numHoles === 18) {
    strokes = Math.round(diff);
  } else if (numHoles === 9) {
    strokes = Math.round(diff / 2);
  } else {
    // Scale proportionally for any number of holes
    strokes = Math.round((diff * numHoles) / 18);
  }

  if (player1Handicap <= player2Handicap) {
    return { player1Strokes: 0, player2Strokes: strokes };
  } else {
    return { player1Strokes: strokes, player2Strokes: 0 };
  }
}

/**
 * Determine which holes receive a handicap stroke.
 *
 * Strokes are allocated to holes in order of difficulty as defined by their
 * stroke index. The hardest holes (lowest stroke index numbers) receive
 * strokes first.
 *
 * @param {number} strokesReceived - Number of strokes the player receives.
 * @param {Object[]} strokeIndexes - Array of { holeNumber, strokeIndex } for
 *                                   each hole in the match.
 * @returns {number[]} Array of hole numbers that receive a stroke.
 */
function getStrokeHoles(strokesReceived, strokeIndexes) {
  if (strokesReceived <= 0) return [];

  // Sort by stroke index ascending (hardest holes first)
  const sorted = [...strokeIndexes].sort((a, b) => a.strokeIndex - b.strokeIndex);

  // Allocate strokes to the hardest holes first
  const strokeHoles = sorted
    .slice(0, strokesReceived)
    .map((h) => h.holeNumber);

  // Return sorted by hole number for readability
  return strokeHoles.sort((a, b) => a - b);
}

module.exports = {
  ROTATION,
  generateSchedule,
  calculateMatchResult,
  calculateHandicapStrokes,
  getStrokeHoles,
};
