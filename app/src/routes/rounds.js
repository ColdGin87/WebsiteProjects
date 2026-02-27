const express = require('express');
const db = require('../../database/init').db;
const { authenticate } = require('../middleware/auth');
const { generateSchedule } = require('../game/rotation');

const router = express.Router();

/**
 * GET /api/rounds
 * List all 5 rounds with course info and status.
 */
router.get('/', (req, res, next) => {
  try {
    const rounds = db.prepare(
      `SELECT r.id, r.round_number, r.status, r.date,
              c.id as course_id, c.name as course_name, c.holes as course_holes
       FROM rounds r
       LEFT JOIN courses c ON r.course_id = c.id
       ORDER BY r.round_number ASC`
    ).all();

    res.json(rounds);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/rounds/:id
 * Get round detail with foursomes, players in each foursome, and all matches.
 */
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    const round = db.prepare(
      `SELECT r.id, r.round_number, r.status, r.date,
              c.id as course_id, c.name as course_name, c.holes as course_holes
       FROM rounds r
       LEFT JOIN courses c ON r.course_id = c.id
       WHERE r.id = ?`
    ).get(id);

    if (!round) {
      return res.status(404).json({ error: 'Round not found.' });
    }

    // Get foursomes for this round
    const foursomes = db.prepare(
      'SELECT id, round_id, foursome_number FROM foursomes WHERE round_id = ? ORDER BY foursome_number ASC'
    ).all(id);

    // For each foursome, get its players and matches
    const foursomesWithDetails = foursomes.map(foursome => {
      const players = db.prepare(
        `SELECT p.id, p.name, p.handicap
         FROM foursome_players fp
         JOIN players p ON fp.player_id = p.id
         WHERE fp.foursome_id = ?
         ORDER BY p.handicap ASC`
      ).all(foursome.id);

      const matches = db.prepare(
        `SELECT m.id, m.player1_id, m.player2_id, m.winner_id,
                m.result_text, m.status,
                p1.name as player1_name, p1.handicap as player1_handicap,
                p2.name as player2_name, p2.handicap as player2_handicap
         FROM matches m
         JOIN players p1 ON m.player1_id = p1.id
         JOIN players p2 ON m.player2_id = p2.id
         WHERE m.foursome_id = ?`
      ).all(foursome.id);

      return { ...foursome, players, matches };
    });

    res.json({ ...round, foursomes: foursomesWithDetails });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/rounds/:id/generate
 * (Admin only) Generate foursomes and matches for a specific round
 * using the rotation engine.
 * Takes the 8 players sorted by handicap, calls generateSchedule,
 * then inserts foursomes, foursome_players, and matches.
 */
router.post('/:id/generate', authenticate, (req, res, next) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { id } = req.params;

    const round = db.prepare('SELECT * FROM rounds WHERE id = ?').get(id);
    if (!round) {
      return res.status(404).json({ error: 'Round not found.' });
    }

    // Check if already generated
    const existingFoursomes = db.prepare(
      'SELECT COUNT(*) as count FROM foursomes WHERE round_id = ?'
    ).get(id);

    if (existingFoursomes.count > 0) {
      return res.status(400).json({ error: 'Foursomes already generated for this round.' });
    }

    // Get all 8 players sorted by handicap
    const players = db.prepare(
      'SELECT id, name, handicap FROM players ORDER BY handicap ASC'
    ).all();

    if (players.length < 8) {
      return res.status(400).json({ error: `Need 8 players to generate schedule. Currently have ${players.length}.` });
    }

    const playerIds = players.map(p => p.id);
    const schedule = generateSchedule(playerIds);

    // Use the round's specific round_number (0-indexed for schedule array)
    const roundIndex = round.round_number - 1;
    if (roundIndex < 0 || roundIndex >= schedule.length) {
      return res.status(400).json({ error: 'Invalid round number for schedule generation.' });
    }

    const roundSchedule = schedule[roundIndex];

    // Insert foursomes and matches within a transaction
    const insertFoursome = db.prepare(
      'INSERT INTO foursomes (round_id, foursome_number) VALUES (?, ?)'
    );
    const insertFoursomePlayer = db.prepare(
      'INSERT INTO foursome_players (foursome_id, player_id) VALUES (?, ?)'
    );
    const insertMatch = db.prepare(
      'INSERT INTO matches (round_id, foursome_id, player1_id, player2_id, status) VALUES (?, ?, ?, ?, ?)'
    );

    const generateRound = db.transaction(() => {
      roundSchedule.forEach((foursome, index) => {
        const foursomeResult = insertFoursome.run(id, index + 1);
        const foursomeId = foursomeResult.lastInsertRowid;

        // Insert all players in the foursome
        foursome.players.forEach(playerId => {
          insertFoursomePlayer.run(foursomeId, playerId);
        });

        // Insert matches for this foursome
        foursome.matches.forEach(match => {
          insertMatch.run(id, foursomeId, match[0], match[1], 'pending');
        });
      });
    });

    generateRound();

    // Return the generated round detail
    const updatedRound = db.prepare(
      `SELECT r.id, r.round_number, r.status, r.date,
              c.id as course_id, c.name as course_name
       FROM rounds r
       LEFT JOIN courses c ON r.course_id = c.id
       WHERE r.id = ?`
    ).get(id);

    const foursomes = db.prepare(
      'SELECT id, round_id, foursome_number FROM foursomes WHERE round_id = ? ORDER BY foursome_number ASC'
    ).all(id);

    const foursomesWithDetails = foursomes.map(f => {
      const fPlayers = db.prepare(
        `SELECT p.id, p.name, p.handicap
         FROM foursome_players fp
         JOIN players p ON fp.player_id = p.id
         WHERE fp.foursome_id = ?`
      ).all(f.id);

      const fMatches = db.prepare(
        `SELECT m.id, m.player1_id, m.player2_id, m.status,
                p1.name as player1_name, p2.name as player2_name
         FROM matches m
         JOIN players p1 ON m.player1_id = p1.id
         JOIN players p2 ON m.player2_id = p2.id
         WHERE m.foursome_id = ?`
      ).all(f.id);

      return { ...f, players: fPlayers, matches: fMatches };
    });

    res.status(201).json({ ...updatedRound, foursomes: foursomesWithDetails });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/rounds/generate-all
 * (Admin only) Generate foursomes and matches for all 5 rounds at once.
 */
router.post('/generate-all', authenticate, (req, res, next) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    // Get all 8 players sorted by handicap
    const players = db.prepare(
      'SELECT id, name, handicap FROM players ORDER BY handicap ASC'
    ).all();

    if (players.length < 8) {
      return res.status(400).json({ error: `Need 8 players to generate schedule. Currently have ${players.length}.` });
    }

    const playerIds = players.map(p => p.id);
    const schedule = generateSchedule(playerIds);

    // Get all rounds
    const rounds = db.prepare(
      'SELECT * FROM rounds ORDER BY round_number ASC'
    ).all();

    if (rounds.length === 0) {
      return res.status(400).json({ error: 'No rounds found in the database.' });
    }

    const insertFoursome = db.prepare(
      'INSERT INTO foursomes (round_id, foursome_number) VALUES (?, ?)'
    );
    const insertFoursomePlayer = db.prepare(
      'INSERT INTO foursome_players (foursome_id, player_id) VALUES (?, ?)'
    );
    const insertMatch = db.prepare(
      'INSERT INTO matches (round_id, foursome_id, player1_id, player2_id, status) VALUES (?, ?, ?, ?, ?)'
    );

    const generateAll = db.transaction(() => {
      const results = [];

      rounds.forEach((round, roundIdx) => {
        // Check if already generated
        const existingFoursomes = db.prepare(
          'SELECT COUNT(*) as count FROM foursomes WHERE round_id = ?'
        ).get(round.id);

        if (existingFoursomes.count > 0) {
          results.push({ round_number: round.round_number, status: 'skipped', message: 'Already generated' });
          return;
        }

        if (roundIdx >= schedule.length) {
          results.push({ round_number: round.round_number, status: 'skipped', message: 'No schedule data for this round' });
          return;
        }

        const roundSchedule = schedule[roundIdx];

        roundSchedule.forEach((foursome, index) => {
          const foursomeResult = insertFoursome.run(round.id, index + 1);
          const foursomeId = foursomeResult.lastInsertRowid;

          foursome.players.forEach(playerId => {
            insertFoursomePlayer.run(foursomeId, playerId);
          });

          foursome.matches.forEach(match => {
            insertMatch.run(round.id, foursomeId, match[0], match[1], 'pending');
          });
        });

        results.push({ round_number: round.round_number, status: 'generated' });
      });

      return results;
    });

    const results = generateAll();

    res.status(201).json({
      message: 'Schedule generation complete.',
      rounds: results
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/rounds/:id/status
 * (Admin only) Update round status (upcoming/active/completed).
 */
router.put('/:id/status', authenticate, (req, res, next) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['upcoming', 'active', 'completed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    const round = db.prepare('SELECT * FROM rounds WHERE id = ?').get(id);
    if (!round) {
      return res.status(404).json({ error: 'Round not found.' });
    }

    db.prepare('UPDATE rounds SET status = ? WHERE id = ?').run(status, id);

    const updatedRound = db.prepare(
      `SELECT r.id, r.round_number, r.status, r.date,
              c.id as course_id, c.name as course_name
       FROM rounds r
       LEFT JOIN courses c ON r.course_id = c.id
       WHERE r.id = ?`
    ).get(id);

    res.json(updatedRound);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
