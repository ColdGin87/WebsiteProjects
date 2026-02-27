const jwt = require('jsonwebtoken');
const { db } = require('../../database/init');

const JWT_SECRET = process.env.JWT_SECRET || 'golf-retreat-secret-key';

/**
 * Required authentication middleware.
 * Extracts and verifies JWT from the Authorization: Bearer <token> header.
 * Attaches user object to req.user with id, name, email, is_admin.
 * Returns 401 if token is missing or invalid.
 */
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = db.prepare(
      'SELECT id, name, email, is_admin FROM players WHERE id = ?'
    ).get(decoded.id);

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

/**
 * Optional authentication middleware.
 * Attaches user to req.user if a valid token is present,
 * but does NOT fail if no token or an invalid token is provided.
 */
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = db.prepare(
      'SELECT id, name, email, is_admin FROM players WHERE id = ?'
    ).get(decoded.id);

    if (user) {
      req.user = user;
    }

    next();
  } catch (err) {
    // Token invalid — just continue without attaching user
    next();
  }
}

module.exports = { authenticate, optionalAuth };
