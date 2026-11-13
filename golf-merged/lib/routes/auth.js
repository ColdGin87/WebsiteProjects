const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const { authenticate } = require('../middleware/auth');
const { randomToken, appBaseUrl } = require('../tokens');
const { parseHandicap } = require('../scoring/parse');
const { jwtSecret, mayRevealEmailLinks } = require('../security');

function storeHcp(value) {
  if (value === null || value === undefined || value === '') return null;
  return parseHandicap(value);
}

const router = express.Router();

function signUser(user) {
  return jwt.sign(
    { id: user.id, email: user.email, is_admin: user.is_admin },
    jwtSecret(),
    { expiresIn: '7d' }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    handicap: user.handicap,
    home_tee: user.home_tee,
    is_admin: user.is_admin,
    created_at: user.created_at,
  };
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, handicap, homeTee, home_tee } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const db = getDb();
    const existing = await db.get('SELECT id FROM players WHERE email = ?', [String(email).trim().toLowerCase()]);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const playerCount = await db.get('SELECT COUNT(*) as count FROM players');
    const salt = await bcrypt.genSalt(8);
    const passwordHash = await bcrypt.hash(password, salt);
    const isAdmin = playerCount.count === 0 ? 1 : 0;
    const hcp = storeHcp(handicap);
    const tee = homeTee || home_tee || null;

    const result = await db.run(
      'INSERT INTO players (name, email, password_hash, handicap, is_admin, home_tee) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), String(email).trim().toLowerCase(), passwordHash, hcp, isAdmin, tee]
    );

    const user = await db.get(
      'SELECT id, name, email, handicap, home_tee, is_admin, created_at FROM players WHERE id = ?',
      [result.lastInsertRowid]
    );

    res.status(201).json({ token: signUser(user), user: publicUser(user) });
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
      'SELECT id, name, email, password_hash, handicap, home_tee, is_admin, created_at FROM players WHERE email = ?',
      [String(email).trim().toLowerCase()]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    res.json({ token: signUser(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

async function issueEmailToken(db, playerId, type, hours) {
  const token = randomToken(24);
  const expires = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  await db.run(
    'INSERT INTO auth_tokens (player_id, type, token, expires_at, used) VALUES (?, ?, ?, ?, 0)',
    [playerId, type, token, expires]
  );
  return token;
}

router.post('/magic-link', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const db = getDb();
    const normalized = String(email).trim().toLowerCase();
    let user = await db.get('SELECT id, email FROM players WHERE email = ?', [normalized]);

    if (!user) {
      const randomHash = await bcrypt.hash(randomToken(16), 8);
      const name = normalized.split('@')[0];
      const count = await db.get('SELECT COUNT(*) as count FROM players');
      const result = await db.run(
        'INSERT INTO players (name, email, password_hash, handicap, is_admin) VALUES (?, ?, ?, ?, ?)',
        [name, normalized, randomHash, null, count.count === 0 ? 1 : 0]
      );
      user = { id: result.lastInsertRowid, email: normalized };
    }

    const token = await issueEmailToken(db, user.id, 'magic', 1);
    const payload = {
      message: 'If that account can sign in, a magic link was created.',
      sent: false,
    };
    if (mayRevealEmailLinks()) {
      payload.link = `${appBaseUrl(req)}/#magic/${token}`;
      payload.message = 'Magic link created. Open the link to sign in.';
    }
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.post('/magic', async (req, res, next) => {
  try {
    const token = req.body.token || req.query.token;
    if (!token) return res.status(400).json({ error: 'Token is required.' });

    const db = getDb();
    const row = await db.get(
      `SELECT t.*, p.id as pid, p.name, p.email, p.handicap, p.home_tee, p.is_admin, p.created_at
       FROM auth_tokens t JOIN players p ON p.id = t.player_id
       WHERE t.token = ? AND t.type = 'magic'`,
      [token]
    );
    if (!row || row.used || new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This magic link is invalid or expired.' });
    }

    await db.run('UPDATE auth_tokens SET used = 1 WHERE id = ?', [row.id]);
    const user = {
      id: row.pid,
      name: row.name,
      email: row.email,
      handicap: row.handicap,
      home_tee: row.home_tee,
      is_admin: row.is_admin,
      created_at: row.created_at,
    };
    res.json({ token: signUser(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const db = getDb();
    const user = await db.get('SELECT id FROM players WHERE email = ?', [String(email).trim().toLowerCase()]);
    if (!user) {
      return res.json({ message: 'If that account exists, a reset link was created.', sent: false });
    }

    const token = await issueEmailToken(db, user.id, 'reset', 2);
    const payload = {
      message: 'If that account exists, a reset link was created.',
      sent: false,
    };
    if (mayRevealEmailLinks()) {
      payload.link = `${appBaseUrl(req)}/#reset/${token}`;
      payload.message = 'Password reset link created.';
    }
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.post('/reset', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const db = getDb();
    const row = await db.get(
      `SELECT t.*, p.id as pid, p.name, p.email, p.handicap, p.home_tee, p.is_admin, p.created_at
       FROM auth_tokens t JOIN players p ON p.id = t.player_id
       WHERE t.token = ? AND t.type = 'reset'`,
      [token]
    );
    if (!row || row.used || new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This reset link is invalid or expired.' });
    }

    const hash = await bcrypt.hash(password, 8);
    await db.run('UPDATE players SET password_hash = ? WHERE id = ?', [hash, row.pid]);
    await db.run('UPDATE auth_tokens SET used = 1 WHERE id = ?', [row.id]);

    const user = {
      id: row.pid,
      name: row.name,
      email: row.email,
      handicap: row.handicap,
      home_tee: row.home_tee,
      is_admin: row.is_admin,
      created_at: row.created_at,
    };
    res.json({ token: signUser(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const user = await db.get(
      'SELECT id, name, email, handicap, home_tee, is_admin, created_at FROM players WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(publicUser(user));
  } catch (err) {
    next(err);
  }
});

router.put('/me', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const current = await db.get('SELECT * FROM players WHERE id = ?', [req.user.id]);
    if (!current) return res.status(404).json({ error: 'User not found.' });

    const name = req.body.name != null ? String(req.body.name).trim() : current.name;
    const handicap =
      req.body.handicap === undefined
        ? current.handicap
        : req.body.handicap === '' || req.body.handicap === null
          ? null
          : storeHcp(req.body.handicap);
    const homeTee =
      req.body.homeTee !== undefined || req.body.home_tee !== undefined
        ? req.body.homeTee || req.body.home_tee || null
        : current.home_tee;

    await db.run(
      'UPDATE players SET name = ?, handicap = ?, home_tee = ? WHERE id = ?',
      [name, handicap, homeTee, req.user.id]
    );

    const user = await db.get(
      'SELECT id, name, email, handicap, home_tee, is_admin, created_at FROM players WHERE id = ?',
      [req.user.id]
    );
    res.json(publicUser(user));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
