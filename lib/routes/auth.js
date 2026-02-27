const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'golf-retreat-secret-key';

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, handicap } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (handicap === undefined || handicap === null) {
      return res.status(400).json({ error: 'Handicap is required.' });
    }

    const db = getDb();
    const playerCount = await db.get('SELECT COUNT(*) as count FROM players');
    if (playerCount.count >= 8) {
      return res.status(400).json({ error: 'Maximum of 8 players reached. Cannot register more players.' });
    }

    const existing = await db.get('SELECT id FROM players WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);
    const isAdmin = playerCount.count === 0 ? 1 : 0;

    const result = await db.run(
      'INSERT INTO players (name, email, password_hash, handicap, is_admin) VALUES (?, ?, ?, ?, ?)',
      [name, email, passwordHash, handicap, isAdmin]
    );

    const user = await db.get(
      'SELECT id, name, email, handicap, is_admin, created_at FROM players WHERE id = ?',
      [result.lastInsertRowid]
    );

    const token = jwt.sign(
      { id: user.id, email: user.email, is_admin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const db = getDb();
    const user = await db.get(
      'SELECT id, name, email, password_hash, handicap, is_admin FROM players WHERE email = ?',
      [email]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, is_admin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password_hash: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const user = await db.get(
      'SELECT id, name, email, handicap, is_admin, created_at FROM players WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const wins = await db.get(
      'SELECT COUNT(*) as count FROM matches WHERE winner_id = ? AND status = ?',
      [user.id, 'completed']
    );

    const totalMatches = await db.get(
      'SELECT COUNT(*) as count FROM matches WHERE (player1_id = ? OR player2_id = ?) AND status = ?',
      [user.id, user.id, 'completed']
    );

    const halves = await db.get(
      'SELECT COUNT(*) as count FROM matches WHERE (player1_id = ? OR player2_id = ?) AND status = ? AND winner_id IS NULL',
      [user.id, user.id, 'completed']
    );

    const losses = totalMatches.count - wins.count - halves.count;
    const points = wins.count + (halves.count * 0.5);

    res.json({
      ...user,
      stats: {
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

module.exports = router;
