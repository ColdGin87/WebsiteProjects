require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database/init');

// Initialize database (creates tables, seeds courses and rounds)
initDatabase();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/players', require('./src/routes/players'));
app.use('/api/rounds', require('./src/routes/rounds'));
const matchesRouter = require('./src/routes/matches');
app.use('/api/matches', matchesRouter);
app.use('/api/leaderboard', matchesRouter.leaderboardRouter);

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack || err.message || err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Golf Retreat Match Play server running on port ${PORT}`);
});

module.exports = app;
