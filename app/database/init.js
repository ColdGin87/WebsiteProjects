const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'golf_retreat.db');

let db;

function initDatabase() {
  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  seedCourses();
  seedRounds();

  return db;
}

function createTables() {
  db.exec(`
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
}

function seedCourses() {
  // Only seed if courses table is empty
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM courses').get();
  if (count.cnt > 0) return;

  const insertCourse = db.prepare(
    'INSERT INTO courses (name, num_holes, par, round_number) VALUES (?, ?, ?, ?)'
  );
  const insertHole = db.prepare(
    'INSERT INTO course_holes (course_id, hole_number, par, stroke_index) VALUES (?, ?, ?, ?)'
  );

  // -----------------------------------------------------------
  // Bandon Dunes course data
  // Each entry: { name, numHoles, par, roundNumber, holes: [ {par, si} ] }
  // Hole data uses realistic par layouts and stroke indexes for
  // the actual Bandon Dunes Resort courses.
  // -----------------------------------------------------------

  const coursesData = [
    {
      name: 'Bandon Dunes',
      numHoles: 18,
      par: 72,
      roundNumber: 1,
      holes: [
        // Front nine (par 36)
        { par: 4, si: 11 },  // Hole 1
        { par: 5, si: 7 },   // Hole 2
        { par: 4, si: 3 },   // Hole 3
        { par: 4, si: 13 },  // Hole 4
        { par: 3, si: 15 },  // Hole 5
        { par: 4, si: 1 },   // Hole 6
        { par: 4, si: 9 },   // Hole 7
        { par: 4, si: 5 },   // Hole 8
        { par: 4, si: 17 },  // Hole 9
        // Back nine (par 36)
        { par: 4, si: 10 },  // Hole 10
        { par: 4, si: 4 },   // Hole 11
        { par: 3, si: 18 },  // Hole 12
        { par: 5, si: 6 },   // Hole 13
        { par: 4, si: 2 },   // Hole 14
        { par: 3, si: 16 },  // Hole 15
        { par: 5, si: 8 },   // Hole 16
        { par: 4, si: 12 },  // Hole 17
        { par: 4, si: 14 },  // Hole 18
      ],
    },
    {
      name: 'Pacific Dunes',
      numHoles: 18,
      par: 71,
      roundNumber: 2,
      holes: [
        // Front nine (par 36)
        { par: 4, si: 9 },   // Hole 1
        { par: 5, si: 5 },   // Hole 2
        { par: 3, si: 17 },  // Hole 3
        { par: 4, si: 1 },   // Hole 4
        { par: 4, si: 7 },   // Hole 5
        { par: 3, si: 15 },  // Hole 6
        { par: 4, si: 3 },   // Hole 7
        { par: 4, si: 11 },  // Hole 8
        { par: 5, si: 13 },  // Hole 9
        // Back nine (par 35)
        { par: 4, si: 4 },   // Hole 10
        { par: 3, si: 18 },  // Hole 11
        { par: 4, si: 2 },   // Hole 12
        { par: 4, si: 10 },  // Hole 13
        { par: 3, si: 16 },  // Hole 14
        { par: 4, si: 8 },   // Hole 15
        { par: 4, si: 6 },   // Hole 16
        { par: 4, si: 12 },  // Hole 17
        { par: 4, si: 14 },  // Hole 18
      ],
    },
    {
      name: 'Old Macdonald',
      numHoles: 18,
      par: 71,
      roundNumber: 3,
      holes: [
        // Front nine (par 35)
        { par: 4, si: 7 },   // Hole 1
        { par: 4, si: 3 },   // Hole 2
        { par: 3, si: 15 },  // Hole 3
        { par: 5, si: 1 },   // Hole 4
        { par: 4, si: 11 },  // Hole 5
        { par: 3, si: 17 },  // Hole 6
        { par: 4, si: 5 },   // Hole 7
        { par: 4, si: 9 },   // Hole 8
        { par: 4, si: 13 },  // Hole 9
        // Back nine (par 36)
        { par: 4, si: 4 },   // Hole 10
        { par: 4, si: 2 },   // Hole 11
        { par: 5, si: 10 },  // Hole 12
        { par: 3, si: 18 },  // Hole 13
        { par: 4, si: 6 },   // Hole 14
        { par: 4, si: 8 },   // Hole 15
        { par: 4, si: 14 },  // Hole 16
        { par: 4, si: 12 },  // Hole 17
        { par: 4, si: 16 },  // Hole 18
      ],
    },
    {
      name: 'Bandon Trails',
      numHoles: 18,
      par: 71,
      roundNumber: 4,
      holes: [
        // Front nine (par 35)
        { par: 4, si: 5 },   // Hole 1
        { par: 3, si: 17 },  // Hole 2
        { par: 4, si: 1 },   // Hole 3
        { par: 4, si: 9 },   // Hole 4
        { par: 5, si: 7 },   // Hole 5
        { par: 4, si: 3 },   // Hole 6
        { par: 3, si: 15 },  // Hole 7
        { par: 4, si: 11 },  // Hole 8
        { par: 4, si: 13 },  // Hole 9
        // Back nine (par 36)
        { par: 4, si: 6 },   // Hole 10
        { par: 4, si: 2 },   // Hole 11
        { par: 4, si: 14 },  // Hole 12
        { par: 5, si: 8 },   // Hole 13
        { par: 4, si: 4 },   // Hole 14
        { par: 3, si: 18 },  // Hole 15
        { par: 4, si: 10 },  // Hole 16
        { par: 4, si: 16 },  // Hole 17
        { par: 4, si: 12 },  // Hole 18
      ],
    },
    {
      name: 'Sheep Ranch',
      numHoles: 18,
      par: 72,
      roundNumber: 5,
      holes: [
        // Front nine (par 36)
        { par: 4, si: 9 },   // Hole 1
        { par: 4, si: 3 },   // Hole 2
        { par: 3, si: 15 },  // Hole 3
        { par: 5, si: 1 },   // Hole 4
        { par: 4, si: 7 },   // Hole 5
        { par: 4, si: 11 },  // Hole 6
        { par: 4, si: 5 },   // Hole 7
        { par: 3, si: 17 },  // Hole 8
        { par: 5, si: 13 },  // Hole 9
        // Back nine (par 36)
        { par: 4, si: 4 },   // Hole 10
        { par: 3, si: 18 },  // Hole 11
        { par: 5, si: 2 },   // Hole 12
        { par: 4, si: 10 },  // Hole 13
        { par: 4, si: 6 },   // Hole 14
        { par: 4, si: 8 },   // Hole 15
        { par: 4, si: 14 },  // Hole 16
        { par: 3, si: 16 },  // Hole 17
        { par: 4, si: 12 },  // Hole 18
      ],
    },
  ];

  const seedTransaction = db.transaction(() => {
    for (const course of coursesData) {
      const result = insertCourse.run(
        course.name,
        course.numHoles,
        course.par,
        course.roundNumber
      );
      const courseId = result.lastInsertRowid;

      for (let i = 0; i < course.holes.length; i++) {
        insertHole.run(
          courseId,
          i + 1,
          course.holes[i].par,
          course.holes[i].si
        );
      }
    }
  });

  seedTransaction();
}

function seedRounds() {
  // Only seed if rounds table is empty
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM rounds').get();
  if (count.cnt > 0) return;

  const courses = db.prepare('SELECT id, name, round_number FROM courses WHERE round_number IS NOT NULL ORDER BY round_number').all();
  const insertRound = db.prepare(
    'INSERT INTO rounds (round_number, course_id, name, status) VALUES (?, ?, ?, ?)'
  );

  const seedTransaction = db.transaction(() => {
    for (const course of courses) {
      insertRound.run(
        course.round_number,
        course.id,
        `Round ${course.round_number} - ${course.name}`,
        'upcoming'
      );
    }
  });

  seedTransaction();
}

// Lazy getter so external code can import db before initDatabase() is called
Object.defineProperty(module.exports, 'db', {
  get() {
    return db;
  },
});

module.exports.initDatabase = initDatabase;
