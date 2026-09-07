/**
 * Goldendale Golf Club — 9 holes played twice for 18.
 * Stroke index and White/Blue + Red/Gold yards match the paper scorecard.
 */

const WHITE_HOLES = [
  { hole: 1, par: 5, si: 1, yards: 496, redYards: 378 },
  { hole: 2, par: 4, si: 5, yards: 365, redYards: 365 },
  { hole: 3, par: 4, si: 13, yards: 287, redYards: 287 },
  { hole: 4, par: 3, si: 17, yards: 104, redYards: 94 },
  { hole: 5, par: 4, si: 3, yards: 338, redYards: 331 },
  { hole: 6, par: 5, si: 7, yards: 465, redYards: 393 },
  { hole: 7, par: 4, si: 15, yards: 307, redYards: 307 },
  { hole: 8, par: 4, si: 11, yards: 284, redYards: 225 },
  { hole: 9, par: 3, si: 9, yards: 163, redYards: 153 },
  { hole: 10, par: 5, si: 2, yards: 500, redYards: 378 },
  { hole: 11, par: 4, si: 6, yards: 360, redYards: 360 },
  { hole: 12, par: 4, si: 14, yards: 280, redYards: 280 },
  { hole: 13, par: 3, si: 18, yards: 87, redYards: 87 },
  { hole: 14, par: 4, si: 4, yards: 352, redYards: 331 },
  { hole: 15, par: 5, si: 8, yards: 480, redYards: 393 },
  { hole: 16, par: 4, si: 16, yards: 306, redYards: 306 },
  { hole: 17, par: 4, si: 12, yards: 295, redYards: 225 },
  { hole: 18, par: 3, si: 10, yards: 176, redYards: 159 },
];

const WHITE_TOTAL = WHITE_HOLES.reduce((s, h) => s + h.yards, 0);
const RED_TOTAL = WHITE_HOLES.reduce((s, h) => s + h.redYards, 0);

function estimateRedYards() {
  return WHITE_HOLES.map((h) => h.redYards);
}

const COURSE = {
  name: 'Goldendale Golf Club',
  address: '1901 N Columbus Ave',
  city: 'Goldendale',
  state: 'WA',
  zip: '98620',
  num_holes: 18,
  par: 72,
  notes: '9 holes played twice for 18. SI and yards from the paper scorecard. Default course for Goldendale Scorecard.',
};

const TEES = [
  {
    name: 'White/Blue',
    color: 'White/Blue',
    gender: 'men',
    yards: WHITE_TOTAL,
    par: 72,
    rating: 67.9,
    slope: 112,
    yards_estimated: 0,
  },
  {
    name: 'Red/Gold (Men)',
    color: 'Red/Gold',
    gender: 'men',
    yards: RED_TOTAL,
    par: 72,
    rating: 64.8,
    slope: 110,
    yards_estimated: 0,
  },
  {
    name: 'Red/Gold (Women)',
    color: 'Red/Gold',
    gender: 'women',
    yards: RED_TOTAL,
    par: 72,
    rating: 69.6,
    slope: 119,
    yards_estimated: 0,
  },
];

async function seedGoldendale(db) {
  const existing = await db.get('SELECT id FROM courses WHERE name = ?', [COURSE.name]);
  if (existing) {
    await ensureGoldendaleDetails(db, existing.id);
    return existing.id;
  }

  const result = await db.run(
    `INSERT INTO courses (name, num_holes, par, address, city, state, zip, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [COURSE.name, COURSE.num_holes, COURSE.par, COURSE.address, COURSE.city, COURSE.state, COURSE.zip, COURSE.notes]
  );
  const courseId = result.lastInsertRowid;
  await syncGoldendaleHolesAndTees(db, courseId);
  return courseId;
}

async function ensureGoldendaleDetails(db, courseId) {
  await db.run(
    `UPDATE courses SET address = COALESCE(address, ?), city = COALESCE(city, ?),
      state = COALESCE(state, ?), zip = COALESCE(zip, ?), notes = ?,
      num_holes = ?, par = ? WHERE id = ?`,
    [COURSE.address, COURSE.city, COURSE.state, COURSE.zip, COURSE.notes, COURSE.num_holes, COURSE.par, courseId]
  );
  await syncGoldendaleHolesAndTees(db, courseId);
}

async function insertGoldendaleHolesAndTees(db, courseId) {
  await syncGoldendaleHolesAndTees(db, courseId);
}

async function syncGoldendaleHolesAndTees(db, courseId) {
  // Force-update first so a stale prod row (hole 3 SI 9) cannot survive even
  // if UNIQUE(course_id, hole_number) is missing on an older Turso table.
  const updateStmts = WHITE_HOLES.map((h) => ({
    sql: `UPDATE course_holes SET par = ?, stroke_index = ?, yards = ?, yards_estimated = 0
          WHERE course_id = ? AND hole_number = ?`,
    args: [h.par, h.si, h.yards, courseId, h.hole],
  }));
  for (let i = 0; i < updateStmts.length; i += 18) {
    await db.batch(updateStmts.slice(i, i + 18));
  }

  const holeStmts = WHITE_HOLES.map((h) => ({
    sql: `INSERT INTO course_holes (course_id, hole_number, par, stroke_index, yards, yards_estimated)
          VALUES (?, ?, ?, ?, ?, 0)
          ON CONFLICT(course_id, hole_number) DO UPDATE SET
            par = excluded.par,
            stroke_index = excluded.stroke_index,
            yards = excluded.yards,
            yards_estimated = 0`,
    args: [courseId, h.hole, h.par, h.si, h.yards],
  }));
  for (let i = 0; i < holeStmts.length; i += 18) {
    await db.batch(holeStmts.slice(i, i + 18));
  }
  await syncGoldendaleTees(db, courseId);
}

async function insertGoldendaleTees(db, courseId) {
  await syncGoldendaleTees(db, courseId);
}

async function syncGoldendaleTees(db, courseId) {
  const holes = await db.all(
    'SELECT id, hole_number, yards FROM course_holes WHERE course_id = ? ORDER BY hole_number',
    [courseId]
  );
  const redYards = estimateRedYards();

  for (const tee of TEES) {
    const existing = await db.get(
      'SELECT id FROM tees WHERE course_id = ? AND name = ?',
      [courseId, tee.name]
    );
    let teeId;
    if (existing) {
      teeId = existing.id;
      await db.run(
        `UPDATE tees SET color = ?, gender = ?, yards = ?, par = ?, yards_estimated = ?
         WHERE id = ?`,
        [tee.color, tee.gender, tee.yards, tee.par, tee.yards_estimated, teeId]
      );
    } else {
      const inserted = await db.run(
        `INSERT INTO tees (course_id, name, color, gender, yards, par, rating, slope, yards_estimated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [courseId, tee.name, tee.color, tee.gender, tee.yards, tee.par, tee.rating, tee.slope, tee.yards_estimated]
      );
      teeId = inserted.lastInsertRowid;
    }

    const yardStmts = holes.map((hole, idx) => {
      const isWhite = tee.name === 'White/Blue';
      const yards = isWhite ? (WHITE_HOLES[idx].yards) : redYards[idx];
      return {
        sql: `INSERT INTO hole_yardages (course_hole_id, tee_id, yards, yards_estimated)
              VALUES (?, ?, ?, 0)
              ON CONFLICT(course_hole_id, tee_id) DO UPDATE SET
                yards = excluded.yards,
                yards_estimated = 0`,
        args: [hole.id, teeId, yards],
      };
    });
    for (let i = 0; i < yardStmts.length; i += 18) {
      await db.batch(yardStmts.slice(i, i + 18));
    }
  }
}

module.exports = {
  COURSE,
  TEES,
  WHITE_HOLES,
  WHITE_TOTAL,
  RED_TOTAL,
  estimateRedYards,
  seedGoldendale,
};
