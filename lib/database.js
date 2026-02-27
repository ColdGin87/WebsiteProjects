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
        { par: 4, si: 11 }, { par: 5, si: 7 }, { par: 4, si: 3 }, { par: 4, si: 13 },
        { par: 3, si: 15 }, { par: 4, si: 1 }, { par: 4, si: 9 }, { par: 4, si: 5 },
        { par: 4, si: 17 }, { par: 4, si: 10 }, { par: 4, si: 4 }, { par: 3, si: 18 },
        { par: 5, si: 6 }, { par: 4, si: 2 }, { par: 3, si: 16 }, { par: 5, si: 8 },
        { par: 4, si: 12 }, { par: 4, si: 14 },
      ],
    },
    {
      name: 'Pacific Dunes', numHoles: 18, par: 71, roundNumber: 2,
      holes: [
        { par: 4, si: 9 }, { par: 5, si: 5 }, { par: 3, si: 17 }, { par: 4, si: 1 },
        { par: 4, si: 7 }, { par: 3, si: 15 }, { par: 4, si: 3 }, { par: 4, si: 11 },
        { par: 5, si: 13 }, { par: 4, si: 4 }, { par: 3, si: 18 }, { par: 4, si: 2 },
        { par: 4, si: 10 }, { par: 3, si: 16 }, { par: 4, si: 8 }, { par: 4, si: 6 },
        { par: 4, si: 12 }, { par: 4, si: 14 },
      ],
    },
    {
      name: 'Old Macdonald', numHoles: 18, par: 71, roundNumber: 3,
      holes: [
        { par: 4, si: 7 }, { par: 4, si: 3 }, { par: 3, si: 15 }, { par: 5, si: 1 },
        { par: 4, si: 11 }, { par: 3, si: 17 }, { par: 4, si: 5 }, { par: 4, si: 9 },
        { par: 4, si: 13 }, { par: 4, si: 4 }, { par: 4, si: 2 }, { par: 5, si: 10 },
        { par: 3, si: 18 }, { par: 4, si: 6 }, { par: 4, si: 8 }, { par: 4, si: 14 },
        { par: 4, si: 12 }, { par: 4, si: 16 },
      ],
    },
    {
      name: 'Bandon Trails', numHoles: 18, par: 71, roundNumber: 4,
      holes: [
        { par: 4, si: 5 }, { par: 3, si: 17 }, { par: 4, si: 1 }, { par: 4, si: 9 },
        { par: 5, si: 7 }, { par: 4, si: 3 }, { par: 3, si: 15 }, { par: 4, si: 11 },
        { par: 4, si: 13 }, { par: 4, si: 6 }, { par: 4, si: 2 }, { par: 4, si: 14 },
        { par: 5, si: 8 }, { par: 4, si: 4 }, { par: 3, si: 18 }, { par: 4, si: 10 },
        { par: 4, si: 16 }, { par: 4, si: 12 },
      ],
    },
    {
      name: 'Sheep Ranch', numHoles: 18, par: 72, roundNumber: 5,
      holes: [
        { par: 4, si: 9 }, { par: 4, si: 3 }, { par: 3, si: 15 }, { par: 5, si: 1 },
        { par: 4, si: 7 }, { par: 4, si: 11 }, { par: 4, si: 5 }, { par: 3, si: 17 },
        { par: 5, si: 13 }, { par: 4, si: 4 }, { par: 3, si: 18 }, { par: 5, si: 2 },
        { par: 4, si: 10 }, { par: 4, si: 6 }, { par: 4, si: 8 }, { par: 4, si: 14 },
        { par: 3, si: 16 }, { par: 4, si: 12 },
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
        sql: 'INSERT INTO course_holes (course_id, hole_number, par, stroke_index) VALUES (?, ?, ?, ?)',
        args: [courseId, hi + 1, coursesData[ci].holes[hi].par, coursesData[ci].holes[hi].si],
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
