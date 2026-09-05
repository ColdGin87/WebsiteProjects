const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const { seedGoldendale } = require('./seed/goldendale');

let client = null;

function getClient() {
  if (!client) {
    let url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      url = `file:${path.join(dataDir, 'goldendale.db')}`;
    } else if (url.startsWith('file:')) {
      const filePath = url.slice(5);
      const dir = path.dirname(path.resolve(filePath));
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    client = createClient({
      url,
      authToken: authToken || undefined,
    });
  }
  return client;
}

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
      lastInsertRowid: result.lastInsertRowid != null ? Number(result.lastInsertRowid) : undefined,
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
      statements.map((s) => (typeof s === 'string' ? s : { sql: s.sql, args: s.args || [] })),
      'write'
    );
    return results;
  },
};

async function ensureColumn(table, column, definition) {
  const cols = await db.all(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function initDatabase() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      handicap REAL,
      is_admin INTEGER DEFAULT 0,
      home_tee TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      num_holes INTEGER NOT NULL,
      par INTEGER NOT NULL,
      round_number INTEGER,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS course_holes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER REFERENCES courses(id),
      hole_number INTEGER NOT NULL,
      par INTEGER NOT NULL,
      stroke_index INTEGER NOT NULL,
      yards INTEGER,
      yards_estimated INTEGER DEFAULT 0,
      UNIQUE(course_id, hole_number)
    );

    CREATE TABLE IF NOT EXISTS tees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER REFERENCES courses(id),
      name TEXT NOT NULL,
      color TEXT,
      gender TEXT,
      yards INTEGER,
      par INTEGER,
      rating REAL,
      slope INTEGER,
      yards_estimated INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS hole_yardages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_hole_id INTEGER REFERENCES course_holes(id),
      tee_id INTEGER REFERENCES tees(id),
      yards INTEGER,
      yards_estimated INTEGER DEFAULT 0,
      UNIQUE(course_hole_id, tee_id)
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_number INTEGER UNIQUE,
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
      result_text TEXT,
      score_round_id INTEGER
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

    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER REFERENCES players(id),
      type TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS score_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      course_id INTEGER REFERENCES courses(id),
      tee_id INTEGER,
      format TEXT DEFAULT 'team_net',
      holes TEXT DEFAULT '18',
      join_code TEXT UNIQUE NOT NULL,
      public_token TEXT UNIQUE NOT NULL,
      organizer_id INTEGER REFERENCES players(id),
      status TEXT DEFAULT 'setup',
      gross_balls INTEGER DEFAULT 1,
      net_balls INTEGER DEFAULT 2,
      dual_count INTEGER DEFAULT 0,
      allowance INTEGER DEFAULT 100,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS score_teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER REFERENCES score_rounds(id),
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS score_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER REFERENCES score_rounds(id),
      player_id INTEGER REFERENCES players(id),
      display_name TEXT NOT NULL,
      handicap TEXT,
      playing_handicap REAL,
      tee_id INTEGER,
      team_id INTEGER REFERENCES score_teams(id),
      role TEXT DEFAULT 'player',
      is_guest INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS score_holes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER REFERENCES score_rounds(id),
      member_id INTEGER REFERENCES score_members(id),
      hole_number INTEGER NOT NULL,
      gross INTEGER NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(round_id, member_id, hole_number)
    );

    CREATE TABLE IF NOT EXISTS score_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER REFERENCES score_rounds(id),
      member1_id INTEGER,
      member2_id INTEGER,
      half TEXT DEFAULT '18',
      status TEXT DEFAULT 'pending',
      winner_member_id INTEGER,
      result_text TEXT
    );
  `);

  await migrateLegacyColumns();
  await seedGoldendale(db);
  await seedLegacyCoursesIfEmpty();
  await seedRounds();
}

async function migrateLegacyColumns() {
  await ensureColumn('players', 'home_tee', 'TEXT');
  await ensureColumn('courses', 'address', 'TEXT');
  await ensureColumn('courses', 'city', 'TEXT');
  await ensureColumn('courses', 'state', 'TEXT');
  await ensureColumn('courses', 'zip', 'TEXT');
  await ensureColumn('courses', 'notes', 'TEXT');
  await ensureColumn('course_holes', 'yards', 'INTEGER');
  await ensureColumn('course_holes', 'yards_estimated', 'INTEGER DEFAULT 0');
  await ensureColumn('matches', 'score_round_id', 'INTEGER');
  await ensureColumn('score_rounds', 'updated_at', "TEXT DEFAULT (datetime('now'))");
  await ensureColumn('score_rounds', 'side_games', "TEXT DEFAULT '{}'");
  await ensureColumn('score_rounds', 'team_race', 'INTEGER DEFAULT 1');
  await ensureColumn('score_wolf_picks', 'blind', 'INTEGER DEFAULT 0');
  await ensureColumn('score_wolf_picks', 'passed_ids', 'TEXT');
  await ensureColumn('score_wolf_picks', 'locked', 'INTEGER DEFAULT 0');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS score_presses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER REFERENCES score_rounds(id),
      game_key TEXT NOT NULL,
      segment TEXT,
      start_hole INTEGER NOT NULL,
      end_hole INTEGER NOT NULL,
      dollars REAL,
      pressed_by_member_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS score_wolf_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER REFERENCES score_rounds(id),
      hole_number INTEGER NOT NULL,
      wolf_member_id INTEGER,
      partner_member_id INTEGER,
      lone INTEGER DEFAULT 0,
      blind INTEGER DEFAULT 0,
      passed_ids TEXT,
      locked INTEGER DEFAULT 0,
      UNIQUE(round_id, hole_number)
    );
  `);
}

async function seedLegacyCoursesIfEmpty() {
  const bandon = await db.get("SELECT COUNT(*) AS cnt FROM courses WHERE name = 'Bandon Dunes'");
  if (bandon && bandon.cnt > 0) return;

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

  for (const course of coursesData) {
    const already = await db.get('SELECT id FROM courses WHERE name = ?', [course.name]);
    if (already) continue;
    const inserted = await db.run(
      'INSERT INTO courses (name, num_holes, par, round_number) VALUES (?, ?, ?, ?)',
      [course.name, course.numHoles, course.par, course.roundNumber]
    );
    const stmts = course.holes.map((h, hi) => ({
      sql: 'INSERT INTO course_holes (course_id, hole_number, par, stroke_index) VALUES (?, ?, ?, ?)',
      args: [inserted.lastInsertRowid, hi + 1, h.par, h.si],
    }));
    await db.batch(stmts);
  }
}

async function seedRounds() {
  const count = await db.get('SELECT COUNT(*) AS cnt FROM rounds');
  if (count.cnt > 0) return;

  const courses = await db.all(
    'SELECT id, name, round_number FROM courses WHERE round_number IS NOT NULL ORDER BY round_number'
  );

  const statements = courses.map((course) => ({
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

module.exports = { getDb, initDatabase, getClient };
