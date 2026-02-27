const { createClient } = require('@libsql/client');

let client = null;

function getClient() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      throw new Error('TURSO_DATABASE_URL environment variable is required');
    }

    client = createClient({
      url,
      authToken: authToken || undefined,
    });
  }
  return client;
}

/**
 * Database wrapper providing convenient methods over @libsql/client.
 * Methods mirror better-sqlite3 patterns but are async.
 */
const db = {
  async get(sql, params = []) {
    const c = getClient();
    const result = await c.execute({ sql, args: params });
    return result.rows[0] || undefined;
  },

  async all(sql, params = []) {
    const c = getClient();
    const result = await c.execute({ sql, args: params });
    return result.rows;
  },

  async run(sql, params = []) {
    const c = getClient();
    const result = await c.execute({ sql, args: params });
    return {
      lastInsertRowid: result.lastInsertRowid,
      changes: result.rowsAffected,
    };
  },

  async exec(sql) {
    const c = getClient();
    await c.executeMultiple(sql);
  },

  async batch(statements) {
    const c = getClient();
    const results = await c.batch(
      statements.map(s => (typeof s === 'string' ? s : { sql: s.sql, args: s.args || [] })),
      'write'
    );
    return results;
  },
};

async function initDatabase() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      handicap REAL DEFAULT 0,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      num_holes INTEGER NOT NULL,
      par INTEGER NOT NULL,
      round_number INTEGER
    );

    CREATE TABLE IF NOT EXISTS course_holes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER REFERENCES courses(id),
      hole_number INTEGER NOT NULL,
      par INTEGER NOT NULL,
      stroke_index INTEGER NOT NULL,
      distance INTEGER DEFAULT 0,
      UNIQUE(course_id, hole_number)
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_number INTEGER NOT NULL UNIQUE,
      course_id INTEGER REFERENCES courses(id),
      name TEXT NOT NULL,
      status TEXT DEFAULT 'upcoming'
    );

    CREATE TABLE IF NOT EXISTS foursomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER REFERENCES rounds(id),
      group_label TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS foursome_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      foursome_id INTEGER REFERENCES foursomes(id),
      player_id INTEGER REFERENCES players(id),
      position INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER REFERENCES rounds(id),
      foursome_id INTEGER REFERENCES foursomes(id),
      player1_id INTEGER REFERENCES players(id),
      player2_id INTEGER REFERENCES players(id),
      half TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      winner_id INTEGER REFERENCES players(id),
      result_text TEXT
    );

    CREATE TABLE IF NOT EXISTS match_holes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER REFERENCES matches(id),
      hole_number INTEGER NOT NULL,
      player1_strokes INTEGER,
      player2_strokes INTEGER,
      player1_net INTEGER,
      player2_net INTEGER,
      hole_winner_id INTEGER REFERENCES players(id),
      UNIQUE(match_id, hole_number)
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER REFERENCES rounds(id),
      course_id INTEGER REFERENCES courses(id),
      player1_id INTEGER REFERENCES players(id),
      player2_id INTEGER REFERENCES players(id),
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS challenge_holes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id INTEGER REFERENCES challenges(id),
      hole_number INTEGER NOT NULL,
      player1_strokes INTEGER,
      player2_strokes INTEGER,
      player1_net INTEGER,
      player2_net INTEGER,
      hole_winner_id INTEGER REFERENCES players(id),
      UNIQUE(challenge_id, hole_number)
    );

    CREATE TABLE IF NOT EXISTS challenge_signatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id INTEGER REFERENCES challenges(id),
      player_id INTEGER REFERENCES players(id),
      nine TEXT NOT NULL,
      signed_at TEXT DEFAULT (datetime('now')),
      UNIQUE(challenge_id, player_id, nine)
    );
  `);

  await seedCourses();
  await seedRounds();
}

async function seedCourses() {
  const count = await db.get('SELECT COUNT(*) AS cnt FROM courses');
  if (count.cnt > 0) return;

  const coursesData = [
    {
      name: 'Bandon Dunes', numHoles: 18, par: 72, roundNumber: 1,
      holes: [
        { par: 4, si: 11, dist: 356 }, { par: 5, si: 7, dist: 551 }, { par: 4, si: 3, dist: 425 }, { par: 4, si: 13, dist: 338 },
        { par: 3, si: 15, dist: 193 }, { par: 4, si: 1, dist: 448 }, { par: 4, si: 9, dist: 387 }, { par: 4, si: 5, dist: 412 },
        { par: 4, si: 17, dist: 326 }, { par: 4, si: 10, dist: 373 }, { par: 4, si: 4, dist: 418 }, { par: 3, si: 18, dist: 162 },
        { par: 5, si: 6, dist: 536 }, { par: 4, si: 2, dist: 453 }, { par: 3, si: 16, dist: 178 }, { par: 5, si: 8, dist: 564 },
        { par: 4, si: 12, dist: 362 }, { par: 4, si: 14, dist: 348 },
      ],
    },
    {
      name: 'Pacific Dunes', numHoles: 18, par: 71, roundNumber: 2,
      holes: [
        { par: 4, si: 9, dist: 389 }, { par: 5, si: 5, dist: 522 }, { par: 3, si: 17, dist: 143 }, { par: 4, si: 1, dist: 463 },
        { par: 4, si: 7, dist: 421 }, { par: 3, si: 15, dist: 192 }, { par: 4, si: 3, dist: 441 }, { par: 4, si: 11, dist: 369 },
        { par: 5, si: 13, dist: 523 }, { par: 4, si: 4, dist: 415 }, { par: 3, si: 18, dist: 148 }, { par: 4, si: 2, dist: 452 },
        { par: 4, si: 10, dist: 378 }, { par: 3, si: 16, dist: 175 }, { par: 4, si: 8, dist: 397 }, { par: 4, si: 6, dist: 428 },
        { par: 4, si: 12, dist: 349 }, { par: 4, si: 14, dist: 331 },
      ],
    },
    {
      name: 'Old Macdonald', numHoles: 18, par: 71, roundNumber: 3,
      holes: [
        { par: 4, si: 7, dist: 393 }, { par: 4, si: 3, dist: 436 }, { par: 3, si: 15, dist: 157 }, { par: 5, si: 1, dist: 555 },
        { par: 4, si: 11, dist: 358 }, { par: 3, si: 17, dist: 141 }, { par: 4, si: 5, dist: 419 }, { par: 4, si: 9, dist: 381 },
        { par: 4, si: 13, dist: 342 }, { par: 4, si: 4, dist: 412 }, { par: 4, si: 2, dist: 447 }, { par: 5, si: 10, dist: 531 },
        { par: 3, si: 18, dist: 165 }, { par: 4, si: 6, dist: 426 }, { par: 4, si: 8, dist: 388 }, { par: 4, si: 14, dist: 338 },
        { par: 4, si: 12, dist: 359 }, { par: 4, si: 16, dist: 313 },
      ],
    },
    {
      name: 'Bandon Trails', numHoles: 18, par: 71, roundNumber: 4,
      holes: [
        { par: 4, si: 5, dist: 417 }, { par: 3, si: 17, dist: 188 }, { par: 4, si: 1, dist: 454 }, { par: 4, si: 9, dist: 372 },
        { par: 5, si: 7, dist: 541 }, { par: 4, si: 3, dist: 432 }, { par: 3, si: 15, dist: 153 }, { par: 4, si: 11, dist: 365 },
        { par: 4, si: 13, dist: 335 }, { par: 4, si: 6, dist: 421 }, { par: 4, si: 2, dist: 448 }, { par: 4, si: 14, dist: 341 },
        { par: 5, si: 8, dist: 528 }, { par: 4, si: 4, dist: 439 }, { par: 3, si: 18, dist: 168 }, { par: 4, si: 10, dist: 398 },
        { par: 4, si: 16, dist: 324 }, { par: 4, si: 12, dist: 356 },
      ],
    },
    {
      name: 'Sheep Ranch', numHoles: 18, par: 72, roundNumber: 5,
      holes: [
        { par: 4, si: 9, dist: 384 }, { par: 4, si: 3, dist: 436 }, { par: 3, si: 15, dist: 173 }, { par: 5, si: 1, dist: 557 },
        { par: 4, si: 7, dist: 403 }, { par: 4, si: 11, dist: 361 }, { par: 4, si: 5, dist: 429 }, { par: 3, si: 17, dist: 146 },
        { par: 5, si: 13, dist: 534 }, { par: 4, si: 4, dist: 413 }, { par: 3, si: 18, dist: 155 }, { par: 5, si: 2, dist: 548 },
        { par: 4, si: 10, dist: 389 }, { par: 4, si: 6, dist: 425 }, { par: 4, si: 8, dist: 396 }, { par: 4, si: 14, dist: 345 },
        { par: 3, si: 16, dist: 179 }, { par: 4, si: 12, dist: 367 },
      ],
    },
  ];

  const statements = [];
  for (const course of coursesData) {
    statements.push({
      sql: 'INSERT INTO courses (name, num_holes, par, round_number) VALUES (?, ?, ?, ?)',
      args: [course.name, course.numHoles, course.par, course.roundNumber],
    });
  }
  await db.batch(statements);

  // Now insert holes for each course
  const courses = await db.all('SELECT id, name FROM courses ORDER BY id');
  const holeStatements = [];
  for (let ci = 0; ci < coursesData.length; ci++) {
    const courseId = courses[ci].id;
    for (let hi = 0; hi < coursesData[ci].holes.length; hi++) {
      holeStatements.push({
        sql: 'INSERT INTO course_holes (course_id, hole_number, par, stroke_index, distance) VALUES (?, ?, ?, ?, ?)',
        args: [courseId, hi + 1, coursesData[ci].holes[hi].par, coursesData[ci].holes[hi].si, coursesData[ci].holes[hi].dist || 0],
      });
    }
  }
  // Batch in chunks of 20 to avoid hitting limits
  for (let i = 0; i < holeStatements.length; i += 20) {
    await db.batch(holeStatements.slice(i, i + 20));
  }
}

async function seedRounds() {
  const count = await db.get('SELECT COUNT(*) AS cnt FROM rounds');
  if (count.cnt > 0) return;

  const courses = await db.all(
    'SELECT id, name, round_number FROM courses WHERE round_number IS NOT NULL ORDER BY round_number'
  );

  const statements = courses.map(course => ({
    sql: 'INSERT INTO rounds (round_number, course_id, name, status) VALUES (?, ?, ?, ?)',
    args: [course.round_number, course.id, `Round ${course.round_number} - ${course.name}`, 'upcoming'],
  }));

  if (statements.length > 0) {
    await db.batch(statements);
  }
}

function getDb() {
  return db;
}

module.exports = { getDb, initDatabase };
