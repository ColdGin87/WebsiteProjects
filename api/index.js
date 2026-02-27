const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Initialize database (creates tables + seeds data on first run)
const { initDatabase } = require('../lib/database');
let dbInitialized = false;

app.use(async (req, res, next) => {
  try {
    if (!dbInitialized) {
      await initDatabase();
      dbInitialized = true;
    }
    next();
  } catch (err) {
    console.error('Database initialization failed:', err);
    next(err);
  }
});

// API Routes
app.use('/api/auth', require('../lib/routes/auth'));
app.use('/api/players', require('../lib/routes/players'));
app.use('/api/rounds', require('../lib/routes/rounds'));
const matchesModule = require('../lib/routes/matches');
app.use('/api/matches', matchesModule.router);
app.use('/api/leaderboard', matchesModule.leaderboardRouter);
app.use('/api/challenges', require('../lib/routes/challenges'));

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack || err.message || err);
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal server error'
  });
});

module.exports = app;
