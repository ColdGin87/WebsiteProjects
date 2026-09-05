/**
 * Net off the low man: everyone plays relative to the lowest playing handicap.
 * Strokes fall by stroke index the same way as the existing dots formula.
 */
const { playingHandicap } = require('./parse');
const { strokesOnHole } = require('./handicap');

function relativeHandicaps(players) {
  const list = players || [];
  const hcps = list.map((p) =>
    playingHandicap(p.playingHandicap ?? p.playing_handicap ?? p.handicap ?? 0)
  );
  const low = hcps.length ? Math.min(...hcps) : 0;
  return list.map((p, i) => ({
    ...p,
    relativeHandicap: hcps[i] - low,
  }));
}

function lowManNetOnHole(players, hole) {
  const si = hole.strokeIndex ?? hole.stroke_index;
  return relativeHandicaps(players).map((p) => {
    if (p.gross == null || p.gross === '') {
      return { ...p, lowManStrokes: 0, lowManNet: null };
    }
    const strokes = strokesOnHole(p.relativeHandicap, si, {
      holes: hole.holes,
      nineHoles: hole.nineHoles,
      holeNumber: hole.holeNumber ?? hole.hole_number,
    });
    return {
      ...p,
      lowManStrokes: strokes,
      lowManNet: Number(p.gross) - strokes,
    };
  });
}

function scoreOnHole(player, holeNumber) {
  const hs = (player.holes || []).find((h) => h.holeNumber === holeNumber);
  return hs || {};
}

module.exports = {
  relativeHandicaps,
  lowManNetOnHole,
  scoreOnHole,
};
