const express = require('express');
const { getDb } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/challenges?round=X
 */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { round } = req.query;

    let query = `
      SELECT ch.id, ch.round_id, ch.course_id, ch.player1_id, ch.player2_id,
             ch.status, ch.created_at,
             p1.name as player1_name, p1.handicap as player1_handicap,
             p2.name as player2_name, p2.handicap as player2_handicap,
             c.name as course_name, r.round_number, r.name as round_name
      FROM challenges ch
      JOIN players p1 ON ch.player1_id = p1.id
      JOIN players p2 ON ch.player2_id = p2.id
      JOIN courses c ON ch.course_id = c.id
      JOIN rounds r ON ch.round_id = r.id
    `;
    const params = [];
    if (round) {
      query += ' WHERE ch.round_id = ?';
      params.push(round);
    }
    query += ' ORDER BY ch.created_at DESC';

    const challenges = await db.all(query, params);
    res.json(challenges);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/challenges
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const { round_id, player1_id, player2_id } = req.body;

    if (!round_id || !player1_id || !player2_id) {
      return res.status(400).json({ error: 'round_id, player1_id, and player2_id are required' });
    }
    if (player1_id === player2_id) {
      return res.status(400).json({ error: 'Players must be different' });
    }

    const round = await db.get(
      `SELECT r.id, r.course_id FROM rounds r WHERE r.id = ?`,
      [round_id]
    );
    if (!round) return res.status(404).json({ error: 'Round not found' });

    const p1 = await db.get('SELECT id, name FROM players WHERE id = ?', [player1_id]);
    const p2 = await db.get('SELECT id, name FROM players WHERE id = ?', [player2_id]);
    if (!p1 || !p2) return res.status(404).json({ error: 'Player not found' });

    const result = await db.run(
      'INSERT INTO challenges (round_id, course_id, player1_id, player2_id, status) VALUES (?, ?, ?, ?, ?)',
      [round_id, round.course_id, player1_id, player2_id, 'active']
    );

    res.status(201).json({
      id: result.lastInsertRowid,
      round_id,
      course_id: round.course_id,
      player1_id,
      player2_id,
      player1_name: p1.name,
      player2_name: p2.name,
      status: 'active',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/challenges/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const challenge = await db.get(`
      SELECT ch.*,
             p1.name as player1_name, p1.handicap as player1_handicap,
             p2.name as player2_name, p2.handicap as player2_handicap,
             c.name as course_name, c.par as course_par,
             r.round_number, r.name as round_name
      FROM challenges ch
      JOIN players p1 ON ch.player1_id = p1.id
      JOIN players p2 ON ch.player2_id = p2.id
      JOIN courses c ON ch.course_id = c.id
      JOIN rounds r ON ch.round_id = r.id
      WHERE ch.id = ?
    `, [req.params.id]);

    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    // Get course holes with distance
    const courseHoles = await db.all(
      'SELECT hole_number, par, stroke_index, distance FROM course_holes WHERE course_id = ? ORDER BY hole_number ASC',
      [challenge.course_id]
    );

    // Get scored holes
    const holes = await db.all(
      'SELECT * FROM challenge_holes WHERE challenge_id = ? ORDER BY hole_number ASC',
      [challenge.id]
    );

    // Get signatures
    const signatures = await db.all(
      `SELECT cs.*, p.name as player_name
       FROM challenge_signatures cs
       JOIN players p ON cs.player_id = p.id
       WHERE cs.challenge_id = ?`,
      [challenge.id]
    );

    // Calculate handicap strokes
    const handicapDiff = Math.round(Math.abs(challenge.player1_handicap - challenge.player2_handicap));
    const receiver = challenge.player1_handicap > challenge.player2_handicap ? 'player1'
      : challenge.player2_handicap > challenge.player1_handicap ? 'player2' : null;

    // Determine stroke holes for full 18
    const sortedBySI = [...courseHoles].sort((a, b) => a.stroke_index - b.stroke_index);
    const strokeHoles = sortedBySI.slice(0, handicapDiff).map(h => h.hole_number).sort((a, b) => a - b);

    // Calculate running score
    let frontScore = 0, backScore = 0;
    holes.forEach(h => {
      if (h.hole_number <= 9) {
        if (h.hole_winner_id === challenge.player1_id) frontScore++;
        else if (h.hole_winner_id === challenge.player2_id) frontScore--;
      } else {
        if (h.hole_winner_id === challenge.player1_id) backScore++;
        else if (h.hole_winner_id === challenge.player2_id) backScore--;
      }
    });

    res.json({
      ...challenge,
      course_holes: courseHoles,
      holes,
      signatures,
      handicap_strokes: handicapDiff,
      strokes_receiver: receiver,
      stroke_holes: strokeHoles,
      front_score: frontScore,
      back_score: backScore,
      total_score: frontScore + backScore,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/challenges/:id/score
 */
router.put('/:id/score', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const { holeNumber, player1Strokes, player2Strokes } = req.body;

    if (!holeNumber || player1Strokes == null || player2Strokes == null) {
      return res.status(400).json({ error: 'holeNumber, player1Strokes, and player2Strokes required' });
    }

    const challenge = await db.get(`
      SELECT ch.*, p1.handicap as p1hcp, p2.handicap as p2hcp
      FROM challenges ch
      JOIN players p1 ON ch.player1_id = p1.id
      JOIN players p2 ON ch.player2_id = p2.id
      WHERE ch.id = ?
    `, [req.params.id]);

    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    if (challenge.status === 'completed') return res.status(400).json({ error: 'Challenge already completed' });

    const courseHole = await db.get(
      'SELECT * FROM course_holes WHERE course_id = ? AND hole_number = ?',
      [challenge.course_id, holeNumber]
    );
    if (!courseHole) return res.status(400).json({ error: `Hole ${holeNumber} not found` });

    // Calculate handicap strokes for this hole
    const handicapDiff = Math.round(Math.abs(challenge.p1hcp - challenge.p2hcp));
    const p1Higher = challenge.p1hcp > challenge.p2hcp;
    let p1StrokesRcv = 0, p2StrokesRcv = 0;

    if (handicapDiff > 0 && courseHole.stroke_index <= handicapDiff) {
      if (p1Higher) p1StrokesRcv = 1; else p2StrokesRcv = 1;
    }

    const p1Net = player1Strokes - p1StrokesRcv;
    const p2Net = player2Strokes - p2StrokesRcv;
    const holeWinnerId = p1Net < p2Net ? challenge.player1_id : p2Net < p1Net ? challenge.player2_id : null;

    const existing = await db.get(
      'SELECT id FROM challenge_holes WHERE challenge_id = ? AND hole_number = ?',
      [challenge.id, holeNumber]
    );

    if (existing) {
      await db.run(
        'UPDATE challenge_holes SET player1_strokes=?, player2_strokes=?, player1_net=?, player2_net=?, hole_winner_id=? WHERE id=?',
        [player1Strokes, player2Strokes, p1Net, p2Net, holeWinnerId, existing.id]
      );
    } else {
      await db.run(
        'INSERT INTO challenge_holes (challenge_id, hole_number, player1_strokes, player2_strokes, player1_net, player2_net, hole_winner_id) VALUES (?,?,?,?,?,?,?)',
        [challenge.id, holeNumber, player1Strokes, player2Strokes, p1Net, p2Net, holeWinnerId]
      );
    }

    res.json({
      challenge_id: challenge.id,
      hole: {
        hole_number: holeNumber,
        player1_strokes: player1Strokes,
        player2_strokes: player2Strokes,
        player1_net: p1Net,
        player2_net: p2Net,
        hole_winner_id: holeWinnerId,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/challenges/:id/sign
 */
router.post('/:id/sign', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const { nine } = req.body; // 'front' or 'back'

    if (!nine || !['front', 'back'].includes(nine)) {
      return res.status(400).json({ error: 'nine must be "front" or "back"' });
    }

    const challenge = await db.get('SELECT * FROM challenges WHERE id = ?', [req.params.id]);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const playerId = req.user.id;
    if (playerId !== challenge.player1_id && playerId !== challenge.player2_id && !req.user.is_admin) {
      return res.status(403).json({ error: 'Only participants can sign' });
    }

    // Check that all 9 holes for this nine are scored
    const startHole = nine === 'front' ? 1 : 10;
    const endHole = nine === 'front' ? 9 : 18;
    const scoredHoles = await db.get(
      'SELECT COUNT(*) as cnt FROM challenge_holes WHERE challenge_id = ? AND hole_number >= ? AND hole_number <= ? AND player1_strokes IS NOT NULL AND player2_strokes IS NOT NULL',
      [challenge.id, startHole, endHole]
    );

    if (scoredHoles.cnt < 9) {
      return res.status(400).json({ error: `All 9 holes must be scored before signing the ${nine} nine. Currently ${scoredHoles.cnt}/9 scored.` });
    }

    // Check if already signed
    const existing = await db.get(
      'SELECT id FROM challenge_signatures WHERE challenge_id = ? AND player_id = ? AND nine = ?',
      [challenge.id, playerId, nine]
    );

    if (existing) {
      return res.status(400).json({ error: 'You have already signed this nine' });
    }

    await db.run(
      'INSERT INTO challenge_signatures (challenge_id, player_id, nine) VALUES (?, ?, ?)',
      [challenge.id, playerId, nine]
    );

    // Check if both players have signed both nines — if so, complete the challenge
    const allSigs = await db.all(
      'SELECT * FROM challenge_signatures WHERE challenge_id = ?',
      [challenge.id]
    );

    const frontSigned = allSigs.filter(s => s.nine === 'front');
    const backSigned = allSigs.filter(s => s.nine === 'back');
    const bothSignedBoth = frontSigned.length >= 2 && backSigned.length >= 2;

    if (bothSignedBoth) {
      await db.run('UPDATE challenges SET status = ? WHERE id = ?', ['completed', challenge.id]);
    }

    res.json({
      signed: true,
      nine,
      player_id: playerId,
      challenge_completed: bothSignedBoth,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
