const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldendale-wipe-'));
process.env.TURSO_DATABASE_URL = 'file:' + path.join(tmpDir, 'wipe.db');
process.env.TURSO_AUTH_TOKEN = '';

const {
  initDatabase,
  getDb,
  wipePracticeScoreDataOnce,
} = require('../lib/database');

async function insertPracticeRound(db, stamp) {
  const code = ('PRAC' + stamp).slice(0, 6);
  const token = 'pubtok' + stamp;
  const course = await db.get("SELECT id FROM courses WHERE name = 'Goldendale Golf Club'");
  let organizer = await db.get('SELECT id FROM players WHERE email = ?', ['wipe.tester@example.com']);
  if (!organizer) {
    await db.run(
      'INSERT INTO players (name, email, password_hash, handicap) VALUES (?, ?, ?, ?)',
      ['Wipe Tester', 'wipe.tester@example.com', 'x', 10]
    );
    organizer = await db.get('SELECT id FROM players WHERE email = ?', ['wipe.tester@example.com']);
  }
  await db.run(
    `INSERT INTO score_rounds
      (name, course_id, format, holes, join_code, public_token, organizer_id, status)
     VALUES (?, ?, 'team_net', '18', ?, ?, ?, 'live')`,
    ['Practice Saturday', course.id, code, token, organizer.id]
  );
  const round = await db.get('SELECT id FROM score_rounds WHERE join_code = ?', [code]);
  await db.run(
    'INSERT INTO score_teams (round_id, name, sort_order) VALUES (?, ?, ?)',
    [round.id, 'Team 1', 1]
  );
  const team = await db.get('SELECT id FROM score_teams WHERE round_id = ?', [round.id]);
  await db.run(
    `INSERT INTO score_members
      (round_id, display_name, handicap, playing_handicap, team_id, role, is_guest)
     VALUES (?, ?, ?, ?, ?, 'player', 1)`,
    [round.id, 'Sample Pat', '12', 12, team.id]
  );
  const member = await db.get('SELECT id FROM score_members WHERE round_id = ?', [round.id]);
  await db.run(
    'INSERT INTO score_holes (round_id, member_id, hole_number, gross) VALUES (?, ?, ?, ?)',
    [round.id, member.id, 1, 5]
  );
  return round.id;
}

describe('field-test score wipe', () => {
  before(async () => {
    await initDatabase();
  });

  it('clears leftover score rounds once and then leaves later rounds alone', async () => {
    const db = getDb();
    const goldendale = await db.get("SELECT id FROM courses WHERE name = 'Goldendale Golf Club'");
    assert.ok(goldendale, 'Goldendale course seed stays');

    await insertPracticeRound(db, '1');
    const before = await db.get('SELECT COUNT(*) AS cnt FROM score_rounds');
    assert.equal(Number(before.cnt), 1);

    await db.run("DELETE FROM app_meta WHERE key = 'field_test_wipe'");
    const first = await wipePracticeScoreDataOnce();
    assert.equal(first.skipped, false);
    assert.equal(first.wiped, 1);

    const after = await db.get('SELECT COUNT(*) AS cnt FROM score_rounds');
    assert.equal(Number(after.cnt), 0);
    const holes = await db.get('SELECT COUNT(*) AS cnt FROM score_holes');
    const members = await db.get('SELECT COUNT(*) AS cnt FROM score_members');
    assert.equal(Number(holes.cnt), 0);
    assert.equal(Number(members.cnt), 0);
    const stillCourse = await db.get("SELECT id FROM courses WHERE name = 'Goldendale Golf Club'");
    assert.ok(stillCourse, 'course seed survives the wipe');

    await insertPracticeRound(db, '2');
    const second = await wipePracticeScoreDataOnce();
    assert.equal(second.skipped, true);
    const kept = await db.get('SELECT COUNT(*) AS cnt FROM score_rounds');
    assert.equal(Number(kept.cnt), 1, 'Sunday rounds created after the wipe stay');
  });
});
