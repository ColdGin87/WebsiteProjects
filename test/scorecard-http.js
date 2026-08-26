#!/usr/bin/env node
/**
 * Goldendale scorecard tester (HTTP/API — no browser).
 *
 * Signs up, creates an 18-hole Goldendale team round, adds guests A–D
 * with playing handicaps 4/11/18/24, puts them on Team 1, enters hole 1
 * gross 5/6/7/8, and fails if dots, nets, or the team hole are wrong.
 *
 *   npm run test:scorecard
 *
 * Starts a local file-DB server on a free port by default (no Vercel env).
 * To hit an already running app:
 *   SCORECARD_TEST_URL=http://127.0.0.1:3000 npm run test:scorecard
 */

const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLAYERS = [
  { name: 'A', handicap: 4, gross: 5, dots: 1, net: 4 },
  { name: 'B', handicap: 11, gross: 6, dots: 1, net: 5 },
  { name: 'C', handicap: 18, gross: 7, dots: 1, net: 6 },
  { name: 'D', handicap: 24, gross: 8, dots: 2, net: 6 },
];

function fail(message) {
  console.error('FAIL ' + message);
  process.exitCode = 1;
  throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on('error', reject);
  });
}

async function waitForHealth(base, timeoutMs = 20000) {
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(base + '/api/health');
      if (res.ok) return;
      lastErr = new Error('HTTP ' + res.status);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Server did not become healthy: ' + (lastErr && lastErr.message));
}

async function api(base, method, urlPath, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(base + urlPath, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && data.error) || text || res.status;
    throw new Error(`${method} ${urlPath} → ${res.status} ${msg}`);
  }
  return data;
}

function startServer(port, dbFile) {
  const child = spawn(process.execPath, ['api/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      TURSO_DATABASE_URL: 'file:' + dbFile,
      TURSO_AUTH_TOKEN: '',
      JWT_SECRET: 'scorecard-tester-local-only',
      APP_BASE_URL: 'http://127.0.0.1:' + port,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr.on('data', (chunk) => logs.push(String(chunk)));
  child.logs = logs;
  return child;
}

async function probeExisting(url) {
  try {
    const res = await fetch(url.replace(/\/$/, '') + '/api/health');
    return res.ok;
  } catch {
    return false;
  }
}

async function runScenario(base) {
  const stamp = Date.now();
  const email = `scorecard.tester.${stamp}@example.com`;

  const registered = await api(base, 'POST', '/api/auth/register', {
    body: {
      name: 'Scorecard Tester',
      email,
      password: 'tester-pass-1',
      handicap: null,
    },
  });
  const token = registered.token;
  if (!token) fail('register did not return a token');

  const created = await api(base, 'POST', '/api/rounds', {
    token,
    body: {
      name: 'Tester Saturday',
      format: 'team_net',
      holes: '18',
      allowance: 100,
      grossBalls: 1,
      netBalls: 2,
      dualCount: false,
    },
  });

  const courseName = created.round && created.round.course && created.round.course.name;
  assertEqual(courseName, 'Goldendale Golf Club', 'default course');
  assertEqual(created.round.holes, '18', 'holes');
  assertEqual(created.round.format, 'team_net', 'format');
  const hole1 = (created.holes || []).find((h) => h.hole_number === 1);
  if (!hole1) fail('hole 1 missing from Goldendale seed');
  assertEqual(hole1.par, 5, 'hole 1 par');
  assertEqual(hole1.stroke_index, 1, 'hole 1 SI');

  const roundId = created.round.id;
  let state = created;

  for (const player of PLAYERS) {
    state = await api(base, 'POST', `/api/rounds/${roundId}/guests`, {
      token,
      body: {
        name: player.name,
        handicap: player.handicap,
        playingHandicap: player.handicap,
      },
    });
  }

  const guests = state.members.filter((m) => PLAYERS.some((p) => p.name === m.display_name));
  assertEqual(guests.length, 4, 'guest count');

  for (const player of PLAYERS) {
    const member = state.members.find((m) => m.display_name === player.name);
    if (!member) fail('missing guest ' + player.name);
    if (Number(member.playing_handicap) !== player.handicap) {
      state = await api(base, 'PUT', `/api/rounds/${roundId}/members/${member.id}`, {
        token,
        body: { playingHandicap: player.handicap },
      });
    }
  }

  state = await api(base, 'POST', `/api/rounds/${roundId}/teams/balance`, {
    token,
    body: { teamCount: 1 },
  });

  const organizer = state.members.find((m) => m.role === 'organizer' || !m.is_guest);
  if (organizer && organizer.team_id) {
    state = await api(base, 'PUT', `/api/rounds/${roundId}/members/${organizer.id}`, {
      token,
      body: { teamId: null },
    });
  }

  const team = state.teams.find((t) => t.name === 'Team 1') || state.teams[0];
  if (!team) fail('Team 1 was not created');
  for (const player of PLAYERS) {
    const member = state.members.find((m) => m.display_name === player.name);
    if (member.team_id !== team.id) {
      state = await api(base, 'PUT', `/api/rounds/${roundId}/members/${member.id}`, {
        token,
        body: { teamId: team.id },
      });
    }
  }

  let lastPost = null;
  for (const player of PLAYERS) {
    const member = state.members.find((m) => m.display_name === player.name);
    lastPost = await api(base, 'POST', `/api/rounds/${roundId}/scores`, {
      token,
      body: { memberId: member.id, holeNumber: 1, gross: player.gross },
    });
    if (!lastPost || lastPost.ok !== true) fail('score POST should return ok');
    if (lastPost.members || lastPost.holes || lastPost.round) {
      fail('score POST must be slim (no full loadRoundBundle)');
    }
  }

  try {
    await api(base, 'POST', `/api/rounds/${roundId}/scores`, {
      token,
      body: {
        memberId: state.members.find((m) => m.display_name === 'A').id,
        holeNumber: 2,
        gross: 16,
      },
    });
    fail('gross 16 should be rejected');
  } catch (err) {
    if (!/1 to 15/.test(err.message)) throw err;
  }

  if (!lastPost.updatedAt) fail('slim POST missing updatedAt');
  const postedHole = (lastPost.teams || []).find((t) => t.name === 'Team 1') || (lastPost.teams || [])[0];
  if (!postedHole || !postedHole.hole) fail('slim POST missing that hole team total');
  assertEqual(postedHole.hole.total, 16, 'slim POST team hole 1');

  const live = await api(base, 'GET', `/api/rounds/${roundId}`, { token });
  const dots = [];
  const nets = [];
  for (const player of PLAYERS) {
    const member = live.members.find((m) => m.display_name === player.name);
    if (!member) fail('live state missing ' + player.name);
    const hole = member.holes.find((h) => h.holeNumber === 1);
    if (!hole) fail(player.name + ' missing hole 1');
    assertEqual(hole.gross, player.gross, player.name + ' hole 1 gross');
    assertEqual(hole.strokes, player.dots, player.name + ' hole 1 dots');
    assertEqual(hole.net, player.net, player.name + ' hole 1 net');
    dots.push(hole.strokes);
    nets.push(hole.net);
  }

  assertEqual(dots.join('/'), '1/1/1/2', 'dots');
  assertEqual(nets.join('/'), '4/5/6/6', 'nets');

  const holeResult = (live.holeResults || []).find((h) => h.holeNumber === 1);
  if (!holeResult) fail('holeResults missing hole 1');
  const teamHole = (holeResult.teams || []).find((t) => t.teamName === 'Team 1') || holeResult.teams[0];
  if (!teamHole) fail('no team score on hole 1');
  assertEqual(teamHole.total, 16, 'team hole 1');
  assertEqual(teamHole.incomplete, false, 'team hole 1 complete');
  assertEqual(teamHole.balls.length, 3, 'three balls counted');
  assertEqual(new Set(teamHole.balls.map((b) => b.playerId)).size, 3, 'three different players');

  const livePatch = await api(base, 'GET', `/api/rounds/${roundId}/live`, { token });
  if (livePatch.holes || (livePatch.round && livePatch.round.course)) {
    fail('live payload should omit course/tee/holes');
  }
  if (!Array.isArray(livePatch.scores) || !Array.isArray(livePatch.teams)) {
    fail('live payload needs scores and team hole totals');
  }
  const liveTeam = (livePatch.teams || []).find((t) => t.name === 'Team 1') || livePatch.teams[0];
  const liveHole = (liveTeam.holes || []).find((h) => h.holeNumber === 1);
  assertEqual(liveHole && liveHole.total, 16, 'live patch team hole 1');

  const liveUrl = base + `/api/rounds/${roundId}/live`;
  const firstLive = await fetch(liveUrl, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!firstLive.ok) fail('live GET failed: ' + firstLive.status);
  const etag = firstLive.headers.get('etag');
  const firstBody = await firstLive.json();
  if (!etag) fail('live GET missing ETag');
  const none = await fetch(liveUrl, {
    headers: { Authorization: 'Bearer ' + token, 'If-None-Match': etag },
  });
  assertEqual(none.status, 304, 'unchanged live If-None-Match');
  const since = await fetch(liveUrl + '?since=' + encodeURIComponent(firstBody.updatedAt), {
    headers: { Authorization: 'Bearer ' + token },
  });
  assertEqual(since.status, 304, 'unchanged live since');

  console.log('PASS Goldendale four-player hole 1');
  console.log('  course   Goldendale Golf Club 18 holes');
  console.log('  players  A/B/C/D  H 4/11/18/24');
  console.log('  gross    5/6/7/8');
  console.log('  dots     ' + dots.join('/'));
  console.log('  nets     ' + nets.join('/'));
  console.log('  team     ' + teamHole.total);
}

async function main() {
  const requested = process.env.SCORECARD_TEST_URL;
  let base = requested ? requested.replace(/\/$/, '') : null;
  let child = null;
  let tmpDir = null;

  if (base) {
    const ok = await probeExisting(base);
    if (!ok) fail('SCORECARD_TEST_URL is not healthy: ' + base);
    console.log('Using running app ' + base);
  } else {
    const localDefault = 'http://127.0.0.1:3000';
    if (await probeExisting(localDefault) && process.env.SCORECARD_TEST_USE_RUNNING === '1') {
      base = localDefault;
      console.log('Using running app ' + base);
    } else {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldendale-scorecard-'));
      const dbFile = path.join(tmpDir, 'tester.db');
      const port = await getFreePort();
      child = startServer(port, dbFile);
      base = 'http://127.0.0.1:' + port;
      try {
        await waitForHealth(base);
      } catch (err) {
        console.error((child.logs || []).join(''));
        throw err;
      }
      console.log('Started file-DB app on ' + base);
    }
  }

  try {
    await runScenario(base);
  } finally {
    if (child) {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 200));
      if (!child.killed) child.kill('SIGKILL');
    }
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
