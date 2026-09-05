/**
 * Locked Team 1 vs-par demo for David’s review.
 * All four are on Team 1. Format default is 1G+2N, best-combo vs par.
 *
 * ColdGin  H 3  — three strokes RECEIVED (never +3 / plus handicap).
 *              Gross = par on every Goldendale hole.
 * Kurt     H 9  gross 75 → net 66  (same holes as DEMO_FOURSOME)
 * Chase    H 12 gross 85 → net 73
 * Brian    H 15 gross 95 → net 80
 *
 * This card coexists with the A/B/C/D hole-1 fixture. Do not replace that.
 */

const { DEMO_FOURSOME } = require('./demoFoursome');
const { WHITE_HOLES } = require('./goldendale');
const { strokesOnHole, netScore, parseHandicap, teamHoleScore } = require('../scoring');

const GOLDENDALE_PARS = WHITE_HOLES.map((h) => h.par);
const GOLDENDALE_SI = WHITE_HOLES.map((h) => h.si);

const COLDGIN = {
  name: 'ColdGin',
  // Store as 3, never "+3". parseHandicap("+3") is a plus handicap (gives strokes).
  handicap: 3,
  playingHandicap: 3,
  teamName: 'Team 1',
  holes: GOLDENDALE_PARS.slice(),
};

const DEMO_TEAM1_VS_PAR = [COLDGIN, ...DEMO_FOURSOME.map((p) => ({ ...p }))];

function demoPlayerNets(player) {
  return (player.holes || []).map((gross, idx) => {
    const strokes = strokesOnHole(player.playingHandicap, GOLDENDALE_SI[idx]);
    return netScore(gross, strokes);
  });
}

/**
 * Hole-by-hole best 1G+2N vs-par for the locked Team 1 roster.
 * Gross slots use gross vs par; net slots use net vs par.
 */
function team1VsParHoles(roster = DEMO_TEAM1_VS_PAR, settings = { grossBalls: 1, netBalls: 2, dualCount: false }) {
  return GOLDENDALE_PARS.map((par, idx) => {
    const players = roster.map((p, i) => ({
      id: p.name || i,
      name: p.name,
      gross: p.holes[idx],
      net: netScore(p.holes[idx], strokesOnHole(p.playingHandicap, GOLDENDALE_SI[idx])),
      par,
    }));
    const hole = teamHoleScore(players, { ...settings, par });
    return {
      holeNumber: idx + 1,
      par,
      si: GOLDENDALE_SI[idx],
      total: hole.total,
      balls: hole.balls,
    };
  });
}

function team1VsParRace(holes = team1VsParHoles()) {
  let run = 0;
  return holes.map((h) => {
    run += Number(h.total) || 0;
    return { holeNumber: h.holeNumber, hole: h.total, race: run };
  });
}

function coldGinIsStrokesReceived() {
  const stored = COLDGIN.handicap;
  return (
    stored === 3 &&
    COLDGIN.playingHandicap === 3 &&
    parseHandicap(stored) === 3 &&
    parseHandicap(String(stored)) === 3 &&
    parseHandicap('+3') === -3
  );
}

module.exports = {
  DEMO_TEAM1_VS_PAR,
  COLDGIN,
  GOLDENDALE_PARS,
  GOLDENDALE_SI,
  demoPlayerNets,
  team1VsParHoles,
  team1VsParRace,
  coldGinIsStrokesReceived,
};
