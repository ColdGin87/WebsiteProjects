const express = require('express');
const { getDb } = require('../database');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

function requireAdmin(req, res) {
  if (!req.user || !req.user.is_admin) {
    res.status(403).json({ error: 'Admin access required.' });
    return false;
  }
  return true;
}

async function courseDetail(db, id) {
  const course = await db.get('SELECT * FROM courses WHERE id = ?', [id]);
  if (!course) return null;
  const holes = await db.all(
    'SELECT * FROM course_holes WHERE course_id = ? ORDER BY hole_number',
    [id]
  );
  const tees = await db.all('SELECT * FROM tees WHERE course_id = ? ORDER BY id', [id]);
  const yardages = await db.all(
    `SELECT hy.*, ch.hole_number
     FROM hole_yardages hy
     JOIN course_holes ch ON ch.id = hy.course_hole_id
     WHERE ch.course_id = ?
     ORDER BY ch.hole_number`,
    [id]
  );
  return { ...course, holes, tees, yardages };
}

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const courses = await db.all(
      `SELECT id, name, num_holes, par, address, city, state, zip, notes
       FROM courses ORDER BY CASE WHEN name = 'Goldendale Golf Club' THEN 0 ELSE 1 END, name`
    );
    res.json(courses);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const course = await courseDetail(db, req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found.' });
    res.json(course);
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { name, num_holes, par, address, city, state, zip, notes, holes, tees } = req.body;
    if (!name) return res.status(400).json({ error: 'Course name is required.' });

    const db = getDb();
    const holesCount = Number(num_holes) === 9 ? 9 : 18;
    const coursePar = Number(par) || 72;
    const result = await db.run(
      `INSERT INTO courses (name, num_holes, par, address, city, state, zip, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, holesCount, coursePar, address || null, city || null, state || null, zip || null, notes || null]
    );
    const courseId = result.lastInsertRowid;

    if (Array.isArray(holes) && holes.length) {
      const stmts = holes.map((h, i) => ({
        sql: 'INSERT INTO course_holes (course_id, hole_number, par, stroke_index, yards, yards_estimated) VALUES (?, ?, ?, ?, ?, ?)',
        args: [
          courseId,
          h.hole_number || h.hole || i + 1,
          Number(h.par) || 4,
          Number(h.stroke_index || h.si) || i + 1,
          h.yards != null ? Number(h.yards) : null,
          h.yards_estimated ? 1 : 0,
        ],
      }));
      await db.batch(stmts);
    } else {
      const stmts = [];
      for (let i = 1; i <= holesCount; i++) {
        stmts.push({
          sql: 'INSERT INTO course_holes (course_id, hole_number, par, stroke_index) VALUES (?, ?, ?, ?)',
          args: [courseId, i, i === 9 || i === 18 || i === 4 || i === 13 ? 3 : 4, i],
        });
      }
      await db.batch(stmts);
    }

    if (Array.isArray(tees)) {
      for (const tee of tees) {
        await db.run(
          `INSERT INTO tees (course_id, name, color, gender, yards, par, rating, slope, yards_estimated)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            courseId,
            tee.name || 'White',
            tee.color || null,
            tee.gender || 'men',
            tee.yards || null,
            tee.par || coursePar,
            tee.rating || null,
            tee.slope || 113,
            tee.yards_estimated ? 1 : 0,
          ]
        );
      }
    }

    res.status(201).json(await courseDetail(db, courseId));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const course = await db.get('SELECT * FROM courses WHERE id = ?', [req.params.id]);
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const fields = ['name', 'num_holes', 'par', 'address', 'city', 'state', 'zip', 'notes'];
    const nextVals = { ...course, ...req.body };
    await db.run(
      `UPDATE courses SET name=?, num_holes=?, par=?, address=?, city=?, state=?, zip=?, notes=? WHERE id=?`,
      fields.map((f) => nextVals[f]).concat(course.id)
    );

    if (Array.isArray(req.body.holes)) {
      for (const h of req.body.holes) {
        const holeNumber = h.hole_number || h.hole;
        const existing = await db.get(
          'SELECT id FROM course_holes WHERE course_id = ? AND hole_number = ?',
          [course.id, holeNumber]
        );
        if (existing) {
          await db.run(
            'UPDATE course_holes SET par=?, stroke_index=?, yards=?, yards_estimated=? WHERE id=?',
            [
              Number(h.par),
              Number(h.stroke_index || h.si),
              h.yards != null ? Number(h.yards) : null,
              h.yards_estimated ? 1 : 0,
              existing.id,
            ]
          );
        } else {
          await db.run(
            'INSERT INTO course_holes (course_id, hole_number, par, stroke_index, yards, yards_estimated) VALUES (?, ?, ?, ?, ?, ?)',
            [
              course.id,
              holeNumber,
              Number(h.par) || 4,
              Number(h.stroke_index || h.si) || holeNumber,
              h.yards != null ? Number(h.yards) : null,
              h.yards_estimated ? 1 : 0,
            ]
          );
        }
      }
    }

    res.json(await courseDetail(db, course.id));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/tees', authenticate, async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const course = await db.get('SELECT * FROM courses WHERE id = ?', [req.params.id]);
    if (!course) return res.status(404).json({ error: 'Course not found.' });
    const tee = req.body;
    const result = await db.run(
      `INSERT INTO tees (course_id, name, color, gender, yards, par, rating, slope, yards_estimated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        course.id,
        tee.name || 'New tee',
        tee.color || null,
        tee.gender || 'men',
        tee.yards || null,
        tee.par || course.par,
        tee.rating || null,
        tee.slope || 113,
        tee.yards_estimated ? 1 : 0,
      ]
    );
    res.status(201).json(await db.get('SELECT * FROM tees WHERE id = ?', [result.lastInsertRowid]));
  } catch (err) {
    next(err);
  }
});

router.put('/tees/:teeId', authenticate, async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const tee = await db.get('SELECT * FROM tees WHERE id = ?', [req.params.teeId]);
    if (!tee) return res.status(404).json({ error: 'Tee not found.' });
    const nextTee = { ...tee, ...req.body };
    await db.run(
      `UPDATE tees SET name=?, color=?, gender=?, yards=?, par=?, rating=?, slope=?, yards_estimated=? WHERE id=?`,
      [
        nextTee.name,
        nextTee.color,
        nextTee.gender,
        nextTee.yards,
        nextTee.par,
        nextTee.rating,
        nextTee.slope,
        nextTee.yards_estimated ? 1 : 0,
        tee.id,
      ]
    );
    res.json(await db.get('SELECT * FROM tees WHERE id = ?', [tee.id]));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.courseDetail = courseDetail;
