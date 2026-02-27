const express = require('express');
const { getDb } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const leaderboardRouter = express.Router();

/**
 * GET /api/leaderboard
 */
leaderboardRouter.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const players = await db.all('SELECT id, name, handicap FROM players ORDER BY handicap ASC');

    const leaderboard = [];
    for (const player of players) {
      const wins = await db.get(
        'SELECT COUNT(*) as count FROM matches WHERE winner_id = ? AND status = ?',
        [player.id, 'completed']
      );

      const total = await db.get(
        'SELECT COUNT(*) as count FROM matches WHERE (player1_id = ? OR player2_id = ?) AND status = ?',
        [player.id, player.id, 'completed']
      );

      const halves = await db.get(
        'SELECT COUNT(*) as count FROM matches WHERE (player1_id = ? OR player2_id = ?) AND status = ? AND winner_id IS NULL',
        [player.id, player.id, 'completed']
      );

      const losses = total.count - wins.count - halves.count;
      const points = wins.count + (halves.count * 0.5);

      leaderboard.push({
        player_id: player.id,
        name: player.name,
        handicap: player.handicap,
        matches_played: total.count,
        wins: wins.count,
        losses,
        halves: halves.count,
        points,
      });
    }

    leaderboard.sort((a, b) => b.points !== a.points ? b.points - a.points : b.wins - a.wins);
    res.json(leaderboard);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/matches
 */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { round, player, status } = req.query;

    let query = `
      SELECT m.id, m.round_id, m.foursome_id, m.player1_id, m.player2_id,
             m.half, m.status, m.winner_id, m.result_text,
             p1.name as player1_name, p1.handicap as player1_handicap,
             p2.name as player2_name, p2.handicap as player2_handicap,
             r.round_number, r.name as round_name
      FROM matches m
      JOIN players p1 ON m.player1_id = p1.id
      JOIN players p2 ON m.player2_id = p2.id
      JOIN rounds r ON m.round_id = r.id
    `;

    const conditions = [];
    const params = [];

    if (round) { conditions.push('r.round_number = ?'); params.push(round); }
    if (player) { conditions.push('(m.player1_id = ? OR m.player2_id = ?)'); params.push(player, player); }
    if (status) { conditions.push('m.status = ?'); params.push(status); }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY r.round_number ASC, m.half ASC, m.id ASC';

    const matches = await db.all(query, params);
    res.json(matches);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/matches/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const match = await db.get(`
      SELECT m.*, p1.name as player1_name, p1.handicap as player1_handicap,
             p2.name as player2_name, p2.handicap as player2_handicap,
             r.round_number, r.course_id, r.name as round_name,
             c.name as course_name, c.num_holes, c.par as course_par
      FROM matches m
      JOIN players p1 ON m.player1_id = p1.id
      JOIN players p2 ON m.player2_id = p2.id
      JOIN rounds r ON m.round_id = r.id
      JOIN courses c ON r.course_id = c.id
      WHERE m.id = ?
    `, [req.params.id]);

    if (!match) return res.status(404).json({ error: 'Match not found' });

    const holes = await db.all(`
      SELECT mh.*, ch.par, ch.stroke_index
      FROM match_holes mh
      LEFT JOIN course_holes ch ON ch.course_id = ? AND ch.hole_number = mh.hole_number
      WHERE mh.match_id = ? ORDER BY mh.hole_number ASC
    `, [match.course_id, match.id]);

    const handicapDiff = Math.round(Math.abs(match.player1_handicap - match.player2_handicap));
    const halfStrokes = match.half === 'front' ? Math.round(handicapDiff / 2) : handicapDiff - Math.round(handicapDiff / 2);
    const receiver = match.player1_handicap > match.player2_handicap ? 'player1' : match.player2_handicap > match.player1_handicap ? 'player2' : null;

    const holeRange = match.half === 'front' ? [1, 9] : [10, 18];
    const courseHoles = await db.all(
      'SELECT hole_number, stroke_index FROM course_holes WHERE course_id = ? AND hole_number >= ? AND hole_number <= ? ORDER BY stroke_index ASC',
      [match.course_id, holeRange[0], holeRange[1]]
    );
    const strokeHoles = courseHoles.slice(0, halfStrokes).map(h => h.hole_number);

    let score = 0;
    holes.forEach(h => {
      if (h.hole_winner_id === match.player1_id) score++;
      else if (h.hole_winner_id === match.player2_id) score--;
    });

    res.json({
      ...match, holes, handicap_strokes: halfStrokes, strokes_receiver: receiver,
      stroke_holes: strokeHoles,
      current_state: {
        score,
        holes_played: holes.length,
        status_text: score > 0 ? `${match.player1_name} ${score}UP` : score < 0 ? `${match.player2_name} ${Math.abs(score)}UP` : 'All Square',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/matches/:id/score
 */
router.put('/:id/score', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const { holeNumber, player1Strokes, player2Strokes } = req.body;

    if (!holeNumber || player1Strokes == null || player2Strokes == null) {
      return res.status(400).json({ error: 'holeNumber, player1Strokes, and player2Strokes required' });
    }

    const match = await db.get(`
      SELECT m.*, p1.handicap as p1hcp, p2.handicap as p2hcp, r.course_id
      FROM matches m
      JOIN players p1 ON m.player1_id = p1.id
      JOIN players p2 ON m.player2_id = p2.id
      JOIN rounds r ON m.round_id = r.id
      WHERE m.id = ?
    `, [req.params.id]);

    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (match.status === 'completed') return res.status(400).json({ error: 'Match already completed' });
    if (!req.user.is_admin && req.user.id !== match.player1_id && req.user.id !== match.player2_id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const courseHole = await db.get(
      'SELECT * FROM course_holes WHERE course_id = ? AND hole_number = ?',
      [match.course_id, holeNumber]
    );
    if (!courseHole) return res.status(400).json({ error: `Hole ${holeNumber} not found` });

    const handicapDiff = Math.round(Math.abs(match.p1hcp - match.p2hcp));
    const p1Higher = match.p1hcp > match.p2hcp;
    let p1StrokesRcv = 0, p2StrokesRcv = 0;

    if (handicapDiff > 0 && courseHole.stroke_index <= handicapDiff) {
      if (p1Higher) p1StrokesRcv = 1; else p2StrokesRcv = 1;
    }

    const p1Net = player1Strokes - p1StrokesRcv;
    const p2Net = player2Strokes - p2StrokesRcv;
    const holeWinnerId = p1Net < p2Net ? match.player1_id : p2Net < p1Net ? match.player2_id : null;

    const existing = await db.get('SELECT id FROM match_holes WHERE match_id = ? AND hole_number = ?', [match.id, holeNumber]);
    if (existing) {
      await db.run(
        'UPDATE match_holes SET player1_strokes=?, player2_strokes=?, player1_net=?, player2_net=?, hole_winner_id=? WHERE id=?',
        [player1Strokes, player2Strokes, p1Net, p2Net, holeWinnerId, existing.id]
      );
    } else {
      await db.run(
        'INSERT INTO match_holes (match_id, hole_number, player1_strokes, player2_strokes, player1_net, player2_net, hole_winner_id) VALUES (?,?,?,?,?,?,?)',
        [match.id, holeNumber, player1Strokes, player2Strokes, p1Net, p2Net, holeWinnerId]
      );
    }

    if (match.status === 'pending') {
      await db.run('UPDATE matches SET status = ? WHERE id = ?', ['active', match.id]);
    }

    const allHoles = await db.all('SELECT * FROM match_holes WHERE match_id = ? ORDER BY hole_number', [match.id]);
    let updatedScore = 0;
    allHoles.forEach(h => {
      if (h.hole_winner_id === match.player1_id) updatedScore++;
      else if (h.hole_winner_id === match.player2_id) updatedScore--;
    });

    res.json({
      match_id: match.id,
      hole: {
        hole_number: holeNumber, player1_strokes: player1Strokes, player2_strokes: player2Strokes,
        player1_net: p1Net, player2_net: p2Net, hole_winner_id: holeWinnerId,
        par: courseHole.par, stroke_index: courseHole.stroke_index,
      },
      match_state: { score: updatedScore, holes_played: allHoles.length },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/matches/:id/finalize
 */
router.put('/:id/finalize', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const match = await db.get(`
      SELECT m.*, p1.name as p1name, p2.name as p2name
      FROM matches m JOIN players p1 ON m.player1_id = p1.id JOIN players p2 ON m.player2_id = p2.id WHERE m.id = ?
    `, [req.params.id]);

    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (match.status === 'completed') return res.status(400).json({ error: 'Already finalized' });

    const holes = await db.all(
      'SELECT hole_number, hole_winner_id FROM match_holes WHERE match_id = ? ORDER BY hole_number',
      [match.id]
    );
    if (holes.length === 0) return res.status(400).json({ error: 'No holes scored' });

    let score = 0;
    let closedAt = null;

    for (let i = 0; i < holes.length; i++) {
      if (holes[i].hole_winner_id === match.player1_id) score++;
      else if (holes[i].hole_winner_id === match.player2_id) score--;

      const remaining = 9 - (i + 1);
      if (Math.abs(score) > remaining && remaining > 0) {
        closedAt = i + 1;
        break;
      }
    }

    let winnerId = null, resultText;
    if (score === 0) {
      resultText = 'A/S';
    } else {
      winnerId = score > 0 ? match.player1_id : match.player2_id;
      const lead = Math.abs(score);
      if (closedAt) {
        resultText = `${lead}&${9 - closedAt}`;
      } else {
        resultText = `${lead}UP`;
      }
    }

    await db.run(
      'UPDATE matches SET status=?, winner_id=?, result_text=? WHERE id=?',
      ['completed', winnerId, resultText, match.id]
    );

    res.json({
      match_id: match.id,
      status: 'completed',
      winner_id: winnerId,
      winner_name: winnerId === match.player1_id ? match.p1name : winnerId === match.player2_id ? match.p2name : null,
      result_text: resultText,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = { router, leaderboardRouter };
