const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const { jwtSecret } = require('../security');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, jwtSecret());

    const db = getDb();
    const user = await db.get(
      'SELECT id, name, email, is_admin FROM players WHERE id = ?',
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({ error: 'User not found. Invalid token.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    next(err);
  }
}

async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, jwtSecret());

    const db = getDb();
    const user = await db.get(
      'SELECT id, name, email, is_admin FROM players WHERE id = ?',
      [decoded.id]
    );

    if (user) {
      req.user = user;
    }

    next();
  } catch (err) {
    next();
  }
}

module.exports = { authenticate, optionalAuth };
