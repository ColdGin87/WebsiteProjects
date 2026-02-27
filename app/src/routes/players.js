const express = require('express');
const db = require('../../database/init').db;

const router = express.Router();

/**
 * GET /api/players
 * List all players (public), ordered by handicap.
 */
router.get('/', (req, res, next) => {
  try {
    const players = db.prepare(
      'SELECT id, name, email, handicap, is_admin, created_at FROM players ORDER BY handicap ASC'
    ).all();

    res.json(players);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/players/:id
 * Get player detail with match win/loss record.
 */
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    const player = db.prepare(
      'SELECT id, name, email, handicap, is_admin, created_at FROM players WHERE id = ?'
    ).get(id);

    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    // Get match record
    const wins = db.prepare(
      'SELECT COUNT(*) as count FROM matches WHERE winner_id = ? AND status = ?'
    ).get(id, 'completed');

    const totalMatches = db.prepare(
      `SELECT COUNT(*) as count FROM matches
       WHERE (player1_id = ? OR player2_id = ?) AND status = ?`
    ).get(id, id, 'completed');

    const halves = db.prepare(
      `SELECT COUNT(*) as count FROM matches
       WHERE (player1_id = ? OR player2_id = ?) AND status = ? AND winner_id IS NULL`
    ).get(id, id, 'completed');

    const losses = totalMatches.count - wins.count - halves.count;
    const points = wins.count + (halves.count * 0.5);

    res.json({
      ...player,
      record: {
        matches_played: totalMatches.count,
        wins: wins.count,
        losses,
        halves: halves.count,
        points
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/players/:id/matches
 * Get all matches for a specific player.
 */
router.get('/:id/matches', (req, res, next) => {
  try {
    const { id } = req.params;

    const player = db.prepare('SELECT id FROM players WHERE id = ?').get(id);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    const matches = db.prepare(
      `SELECT m.id, m.round_id, m.foursome_id, m.player1_id, m.player2_id,
              m.winner_id, m.result_text, m.status,
              p1.name as player1_name, p1.handicap as player1_handicap,
              p2.name as player2_name, p2.handicap as player2_handicap,
              r.round_number
       FROM matches m
       JOIN players p1 ON m.player1_id = p1.id
       JOIN players p2 ON m.player2_id = p2.id
       JOIN rounds r ON m.round_id = r.id
       WHERE m.player1_id = ? OR m.player2_id = ?
       ORDER BY r.round_number ASC`
    ).all(id, id);

    res.json(matches);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
