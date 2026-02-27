const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../../database/init');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'golf-retreat-secret-key';

/**
 * POST /api/auth/register
 * Create a new player account.
 * Body: { name, email, password, handicap }
 * Limited to 8 players max (match play retreat format).
 * Returns JWT token and user object.
 */
router.post('/register', (req, res, next) => {
  try {
    const { name, email, password, handicap } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (handicap === undefined || handicap === null) {
      return res.status(400).json({ error: 'Handicap is required.' });
    }

    // Check player limit
    const playerCount = db.prepare('SELECT COUNT(*) as count FROM players').get();
    if (playerCount.count >= 8) {
      return res.status(400).json({ error: 'Maximum of 8 players reached. Cannot register more players.' });
    }

    // Check for existing email
    const existing = db.prepare('SELECT id FROM players WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    // Insert player — first player becomes admin
    const isAdmin = playerCount.count === 0 ? 1 : 0;
    const result = db.prepare(
      'INSERT INTO players (name, email, password_hash, handicap, is_admin) VALUES (?, ?, ?, ?, ?)'
    ).run(name, email, passwordHash, handicap, isAdmin);

    const user = db.prepare(
      'SELECT id, name, email, handicap, is_admin, created_at FROM players WHERE id = ?'
    ).get(result.lastInsertRowid);

    // Generate JWT
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

/**
 * POST /api/auth/login
 * Authenticate with email and password.
 * Returns JWT token and user object.
 */
router.post('/login', (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = db.prepare(
      'SELECT id, name, email, password_hash, handicap, is_admin FROM players WHERE email = ?'
    ).get(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, is_admin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return user without password_hash
    const { password_hash: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Return the current authenticated user's profile with stats.
 */
router.get('/me', authenticate, (req, res, next) => {
  try {
    const user = db.prepare(
      'SELECT id, name, email, handicap, is_admin, created_at FROM players WHERE id = ?'
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Get match stats from completed matches
    const wins = db.prepare(
      'SELECT COUNT(*) as count FROM matches WHERE winner_id = ? AND status = ?'
    ).get(user.id, 'completed');

    const totalMatches = db.prepare(
      `SELECT COUNT(*) as count FROM matches
       WHERE (player1_id = ? OR player2_id = ?) AND status = ?`
    ).get(user.id, user.id, 'completed');

    const halves = db.prepare(
      `SELECT COUNT(*) as count FROM matches
       WHERE (player1_id = ? OR player2_id = ?) AND status = ? AND winner_id IS NULL`
    ).get(user.id, user.id, 'completed');

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
