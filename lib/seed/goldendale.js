/**
 * Goldendale Golf Club — 9 holes played twice for 18.
 * White/Blue yardages are official. Red/Gold per-hole yards are estimated
 * from the published 5066 total and flagged as estimated.
 */

const WHITE_HOLES = [
  { hole: 1, par: 5, si: 1, yards: 496 },
  { hole: 2, par: 4, si: 5, yards: 360 },
  { hole: 3, par: 4, si: 9, yards: 285 },
  { hole: 4, par: 3, si: 17, yards: 103 },
  { hole: 5, par: 4, si: 3, yards: 338 },
  { hole: 6, par: 5, si: 7, yards: 465 },
  { hole: 7, par: 4, si: 15, yards: 307 },
  { hole: 8, par: 4, si: 13, yards: 284 },
  { hole: 9, par: 3, si: 11, yards: 158 },
  { hole: 10, par: 5, si: 2, yards: 500 },
  { hole: 11, par: 4, si: 6, yards: 369 },
  { hole: 12, par: 4, si: 10, yards: 289 },
  { hole: 13, par: 3, si: 18, yards: 110 },
  { hole: 14, par: 4, si: 4, yards: 352 },
  { hole: 15, par: 5, si: 8, yards: 480 },
  { hole: 16, par: 4, si: 16, yards: 307 },
  { hole: 17, par: 4, si: 14, yards: 295 },
  { hole: 18, par: 3, si: 12, yards: 185 },
];

const WHITE_TOTAL = WHITE_HOLES.reduce((s, h) => s + h.yards, 0);
const RED_TOTAL = 5066;

function estimateRedYards() {
  const raw = WHITE_HOLES.map((h) => ({
    hole: h.hole,
    raw: (h.yards * RED_TOTAL) / WHITE_TOTAL,
  }));
  const rounded = raw.map((h) => ({ hole: h.hole, yards: Math.round(h.raw), frac: h.raw - Math.floor(h.raw) }));
  let diff = RED_TOTAL - rounded.reduce((s, h) => s + h.yards, 0);
  const order = rounded
    .map((h, i) => ({ i, frac: raw[i].raw - Math.floor(raw[i].raw) }))
    .sort((a, b) => (diff > 0 ? b.frac - a.frac : a.frac - b.frac));
  let k = 0;
  while (diff !== 0 && k < 100) {
    const idx = order[k % order.length].i;
    rounded[idx].yards += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
    k++;
  }
  return rounded.map((h) => h.yards);
}

const COURSE = {
  name: 'Goldendale Golf Club',
  address: '1901 N Columbus Ave',
  city: 'Goldendale',
  state: 'WA',
  zip: '98620',
  num_holes: 18,
  par: 72,
  notes: '9 holes played twice for 18. Default course for Goldendale Scorecard.',
};

const TEES = [
  {
    name: 'White/Blue',
    color: 'White/Blue',
    gender: 'men',
    yards: 5683,
    par: 72,
    rating: 67.9,
    slope: 112,
    yards_estimated: 0,
  },
  {
    name: 'Red/Gold (Men)',
    color: 'Red/Gold',
    gender: 'men',
    yards: 5066,
    par: 72,
    rating: 64.8,
    slope: 110,
    yards_estimated: 1,
  },
  {
    name: 'Red/Gold (Women)',
    color: 'Red/Gold',
    gender: 'women',
    yards: 5066,
    par: 72,
    rating: 69.6,
    slope: 119,
    yards_estimated: 1,
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
  await insertGoldendaleHolesAndTees(db, courseId);
  return courseId;
}

async function ensureGoldendaleDetails(db, courseId) {
  await db.run(
    `UPDATE courses SET address = COALESCE(address, ?), city = COALESCE(city, ?),
      state = COALESCE(state, ?), zip = COALESCE(zip, ?), notes = COALESCE(notes, ?),
      num_holes = ?, par = ? WHERE id = ?`,
    [COURSE.address, COURSE.city, COURSE.state, COURSE.zip, COURSE.notes, COURSE.num_holes, COURSE.par, courseId]
  );

  const holeCount = await db.get('SELECT COUNT(*) AS cnt FROM course_holes WHERE course_id = ?', [courseId]);
  if (!holeCount || holeCount.cnt === 0) {
    await insertGoldendaleHolesAndTees(db, courseId);
    return;
  }

  const teeCount = await db.get('SELECT COUNT(*) AS cnt FROM tees WHERE course_id = ?', [courseId]);
  if (!teeCount || teeCount.cnt === 0) {
    await insertGoldendaleTees(db, courseId);
  }
}

async function insertGoldendaleHolesAndTees(db, courseId) {
  const holeStmts = WHITE_HOLES.map((h) => ({
    sql: 'INSERT INTO course_holes (course_id, hole_number, par, stroke_index, yards, yards_estimated) VALUES (?, ?, ?, ?, ?, 0)',
    args: [courseId, h.hole, h.par, h.si, h.yards],
  }));
  for (let i = 0; i < holeStmts.length; i += 18) {
    await db.batch(holeStmts.slice(i, i + 18));
  }
  await insertGoldendaleTees(db, courseId);
}

async function insertGoldendaleTees(db, courseId) {
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
      const yards = isWhite ? (hole.yards || WHITE_HOLES[idx].yards) : redYards[idx];
      const estimated = isWhite ? 0 : 1;
      return {
        sql: `INSERT OR IGNORE INTO hole_yardages (course_hole_id, tee_id, yards, yards_estimated)
              VALUES (?, ?, ?, ?)`,
        args: [hole.id, teeId, yards, estimated],
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
