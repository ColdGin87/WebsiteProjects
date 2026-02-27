const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const players = await db.all(
      'SELECT id, name, email, handicap, is_admin, created_at FROM players ORDER BY handicap ASC'
    );
    res.json(players);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const player = await db.get(
      'SELECT id, name, email, handicap, is_admin, created_at FROM players WHERE id = ?',
      [id]
    );

    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    const wins = await db.get(
      'SELECT COUNT(*) as count FROM matches WHERE winner_id = ? AND status = ?',
      [id, 'completed']
    );

    const totalMatches = await db.get(
      'SELECT COUNT(*) as count FROM matches WHERE (player1_id = ? OR player2_id = ?) AND status = ?',
      [id, id, 'completed']
    );

    const halves = await db.get(
      'SELECT COUNT(*) as count FROM matches WHERE (player1_id = ? OR player2_id = ?) AND status = ? AND winner_id IS NULL',
      [id, id, 'completed']
    );

    const losses = totalMatches.count - wins.count - halves.count;
    const points = wins.count + (halves.count * 0.5);

    res.json({
      ...player,
      record: {
        matches_played: totalMatches.count,
        wins: wins.count,
        losses,
        halves: halves.count,
        points,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/matches', async (req, res, next) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const player = await db.get('SELECT id FROM players WHERE id = ?', [id]);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    const matches = await db.all(
      `SELECT m.id, m.round_id, m.foursome_id, m.player1_id, m.player2_id,
              m.half, m.status, m.winner_id, m.result_text,
              p1.name AS player1_name, p1.handicap AS player1_handicap,
              p2.name AS player2_name, p2.handicap AS player2_handicap,
              r.round_number, r.name AS round_name
       FROM matches m
       JOIN players p1 ON m.player1_id = p1.id
       JOIN players p2 ON m.player2_id = p2.id
       JOIN rounds r ON m.round_id = r.id
       WHERE m.player1_id = ? OR m.player2_id = ?
       ORDER BY r.round_number ASC, m.half ASC`,
      [id, id]
    );

    res.json(matches);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
