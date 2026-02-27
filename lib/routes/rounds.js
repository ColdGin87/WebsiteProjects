const express = require('express');
const { getDb } = require('../database');
const { authenticate } = require('../middleware/auth');
const { generateSchedule } = require('../game/rotation');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const rounds = await db.all(
      `SELECT r.id, r.round_number, r.name, r.status,
              c.id AS course_id, c.name AS course_name,
              c.num_holes, c.par AS course_par
       FROM rounds r
       LEFT JOIN courses c ON r.course_id = c.id
       ORDER BY r.round_number ASC`
    );
    res.json(rounds);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const round = await db.get(
      `SELECT r.id, r.round_number, r.name, r.status,
              c.id AS course_id, c.name AS course_name,
              c.num_holes, c.par AS course_par
       FROM rounds r
       LEFT JOIN courses c ON r.course_id = c.id
       WHERE r.id = ?`,
      [id]
    );

    if (!round) {
      return res.status(404).json({ error: 'Round not found.' });
    }

    const foursomes = await db.all(
      'SELECT id, round_id, group_label FROM foursomes WHERE round_id = ? ORDER BY group_label ASC',
      [id]
    );

    const courseHoles = round.course_id
      ? await db.all(
          'SELECT hole_number, par, stroke_index FROM course_holes WHERE course_id = ? ORDER BY hole_number ASC',
          [round.course_id]
        )
      : [];

    const foursomesWithDetails = [];
    for (const foursome of foursomes) {
      const players = await db.all(
        `SELECT fp.position, p.id, p.name, p.handicap
         FROM foursome_players fp
         JOIN players p ON fp.player_id = p.id
         WHERE fp.foursome_id = ?
         ORDER BY fp.position ASC`,
        [foursome.id]
      );

      const matches = await db.all(
        `SELECT m.id, m.player1_id, m.player2_id, m.half,
                m.status, m.winner_id, m.result_text,
                p1.name AS player1_name, p1.handicap AS player1_handicap,
                p2.name AS player2_name, p2.handicap AS player2_handicap
         FROM matches m
         JOIN players p1 ON m.player1_id = p1.id
         JOIN players p2 ON m.player2_id = p2.id
         WHERE m.foursome_id = ?
         ORDER BY m.half ASC`,
        [foursome.id]
      );

      foursomesWithDetails.push({ ...foursome, players, matches });
    }

    res.json({ ...round, foursomes: foursomesWithDetails, course_holes: courseHoles });
  } catch (err) {
    next(err);
  }
});

router.post('/generate-all', authenticate, async (req, res, next) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const db = getDb();
    const players = await db.all(
      'SELECT id, name, handicap FROM players ORDER BY handicap ASC'
    );

    if (players.length < 8) {
      return res.status(400).json({
        error: `Need 8 players to generate schedule. Currently have ${players.length}.`,
      });
    }

    const playerIds = players.map(p => p.id);
    const schedule = generateSchedule(playerIds);

    const rounds = await db.all('SELECT * FROM rounds ORDER BY round_number ASC');
    if (rounds.length === 0) {
      return res.status(400).json({ error: 'No rounds found in the database.' });
    }

    const results = [];

    for (const round of rounds) {
      const existingFoursomes = await db.get(
        'SELECT COUNT(*) as count FROM foursomes WHERE round_id = ?',
        [round.id]
      );

      if (existingFoursomes.count > 0) {
        results.push({ round_number: round.round_number, status: 'skipped', message: 'Already generated' });
        continue;
      }

      const roundSchedule = schedule.find(s => s.roundNumber === round.round_number);
      if (!roundSchedule) {
        results.push({ round_number: round.round_number, status: 'skipped', message: 'No schedule data' });
        continue;
      }

      for (const foursome of roundSchedule.foursomes) {
        const foursomeResult = await db.run(
          'INSERT INTO foursomes (round_id, group_label) VALUES (?, ?)',
          [round.id, foursome.group]
        );
        const foursomeId = foursomeResult.lastInsertRowid;

        const playerStatements = foursome.playerIds.map((playerId, position) => ({
          sql: 'INSERT INTO foursome_players (foursome_id, player_id, position) VALUES (?, ?, ?)',
          args: [foursomeId, playerId, position + 1],
        }));
        await db.batch(playerStatements);

        const matchStatements = [];
        for (const match of foursome.matches.front) {
          matchStatements.push({
            sql: 'INSERT INTO matches (round_id, foursome_id, player1_id, player2_id, half, status) VALUES (?, ?, ?, ?, ?, ?)',
            args: [round.id, foursomeId, match.player1, match.player2, 'front', 'pending'],
          });
        }
        for (const match of foursome.matches.back) {
          matchStatements.push({
            sql: 'INSERT INTO matches (round_id, foursome_id, player1_id, player2_id, half, status) VALUES (?, ?, ?, ?, ?, ?)',
            args: [round.id, foursomeId, match.player1, match.player2, 'back', 'pending'],
          });
        }
        await db.batch(matchStatements);
      }

      results.push({ round_number: round.round_number, status: 'generated' });
    }

    res.status(201).json({ message: 'Schedule generation complete.', rounds: results });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/generate', authenticate, async (req, res, next) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { id } = req.params;
    const db = getDb();

    const round = await db.get('SELECT * FROM rounds WHERE id = ?', [id]);
    if (!round) {
      return res.status(404).json({ error: 'Round not found.' });
    }

    const existingFoursomes = await db.get(
      'SELECT COUNT(*) as count FROM foursomes WHERE round_id = ?',
      [id]
    );

    if (existingFoursomes.count > 0) {
      return res.status(400).json({ error: 'Foursomes already generated for this round.' });
    }

    const players = await db.all(
      'SELECT id, name, handicap FROM players ORDER BY handicap ASC'
    );

    if (players.length < 8) {
      return res.status(400).json({
        error: `Need 8 players to generate schedule. Currently have ${players.length}.`,
      });
    }

    const playerIds = players.map(p => p.id);
    const schedule = generateSchedule(playerIds);
    const roundSchedule = schedule.find(s => s.roundNumber === round.round_number);
    if (!roundSchedule) {
      return res.status(400).json({ error: 'Invalid round number for schedule generation.' });
    }

    for (const foursome of roundSchedule.foursomes) {
      const foursomeResult = await db.run(
        'INSERT INTO foursomes (round_id, group_label) VALUES (?, ?)',
        [id, foursome.group]
      );
      const foursomeId = foursomeResult.lastInsertRowid;

      const playerStatements = foursome.playerIds.map((playerId, position) => ({
        sql: 'INSERT INTO foursome_players (foursome_id, player_id, position) VALUES (?, ?, ?)',
        args: [foursomeId, playerId, position + 1],
      }));
      await db.batch(playerStatements);

      const matchStatements = [];
      for (const match of foursome.matches.front) {
        matchStatements.push({
          sql: 'INSERT INTO matches (round_id, foursome_id, player1_id, player2_id, half, status) VALUES (?, ?, ?, ?, ?, ?)',
          args: [id, foursomeId, match.player1, match.player2, 'front', 'pending'],
        });
      }
      for (const match of foursome.matches.back) {
        matchStatements.push({
          sql: 'INSERT INTO matches (round_id, foursome_id, player1_id, player2_id, half, status) VALUES (?, ?, ?, ?, ?, ?)',
          args: [id, foursomeId, match.player1, match.player2, 'back', 'pending'],
        });
      }
      await db.batch(matchStatements);
    }

    const updatedRound = await db.get(
      `SELECT r.id, r.round_number, r.name, r.status,
              c.id AS course_id, c.name AS course_name,
              c.num_holes, c.par AS course_par
       FROM rounds r
       LEFT JOIN courses c ON r.course_id = c.id
       WHERE r.id = ?`,
      [id]
    );

    const foursomes = await db.all(
      'SELECT id, round_id, group_label FROM foursomes WHERE round_id = ? ORDER BY group_label ASC',
      [id]
    );

    const foursomesWithDetails = [];
    for (const f of foursomes) {
      const fPlayers = await db.all(
        `SELECT fp.position, p.id, p.name, p.handicap
         FROM foursome_players fp
         JOIN players p ON fp.player_id = p.id
         WHERE fp.foursome_id = ?
         ORDER BY fp.position ASC`,
        [f.id]
      );

      const fMatches = await db.all(
        `SELECT m.id, m.player1_id, m.player2_id, m.half, m.status,
                p1.name AS player1_name, p1.handicap AS player1_handicap,
                p2.name AS player2_name, p2.handicap AS player2_handicap
         FROM matches m
         JOIN players p1 ON m.player1_id = p1.id
         JOIN players p2 ON m.player2_id = p2.id
         WHERE m.foursome_id = ?
         ORDER BY m.half ASC`,
        [f.id]
      );

      foursomesWithDetails.push({ ...f, players: fPlayers, matches: fMatches });
    }

    res.status(201).json({ ...updatedRound, foursomes: foursomesWithDetails });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/status', authenticate, async (req, res, next) => {
  try {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { id } = req.params;
    const { status } = req.body;
    const db = getDb();

    const validStatuses = ['upcoming', 'active', 'completed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const round = await db.get('SELECT * FROM rounds WHERE id = ?', [id]);
    if (!round) {
      return res.status(404).json({ error: 'Round not found.' });
    }

    await db.run('UPDATE rounds SET status = ? WHERE id = ?', [status, id]);

    const updatedRound = await db.get(
      `SELECT r.id, r.round_number, r.name, r.status,
              c.id AS course_id, c.name AS course_name,
              c.num_holes, c.par AS course_par
       FROM rounds r
       LEFT JOIN courses c ON r.course_id = c.id
       WHERE r.id = ?`,
      [id]
    );

    res.json(updatedRound);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
