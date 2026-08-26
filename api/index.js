require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const { initDatabase } = require('../lib/database');
let dbInitialized = false;
let dbInitPromise = null;

app.use(async (req, res, next) => {
  try {
    if (!dbInitialized) {
      if (!dbInitPromise) dbInitPromise = initDatabase();
      await dbInitPromise;
      dbInitialized = true;
    }
    next();
  } catch (err) {
    console.error('Database initialization failed:', err);
    next(err);
  }
});

app.use('/api/auth', require('../lib/routes/auth'));
app.use('/api/courses', require('../lib/routes/courses'));

const scoreRounds = require('../lib/routes/scoreRounds');
app.use('/api/rounds', scoreRounds.router);
app.use('/api/public', scoreRounds.publicRouter);

app.use('/api/players', require('../lib/routes/players'));
app.use('/api/tournament/rounds', require('../lib/routes/rounds'));
const matchesModule = require('../lib/routes/matches');
app.use('/api/matches', matchesModule.router);
app.use('/api/leaderboard', matchesModule.leaderboardRouter);
app.use('/api/tournament/matches', matchesModule.router);
app.use('/api/tournament/leaderboard', matchesModule.leaderboardRouter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'goldendale-scorecard' });
});

app.use(express.static(path.join(__dirname, '../public')));

app.use((err, req, res, next) => {
  console.error('Server error:', err.stack || err.message || err);
  res.status(err.statusCode || 500).json({
    error: err.message || 'Internal server error',
  });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Goldendale Scorecard listening on http://localhost:${port}`);
  });
}

module.exports = app;
