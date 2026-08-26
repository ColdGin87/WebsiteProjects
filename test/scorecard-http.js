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

  const playerA = live.members.find((m) => m.display_name === 'A');
  assertEqual(playerA.totalGross, 5, 'player A TOT after hole 1');
  const team1 = live.teams.find((t) => t.name === 'Team 1') || live.teams[0];
  assertEqual(team1.total, 16, 'team 1 running total after hole 1');

  const extras = [
    { name: 'Cole Jan', handicap: 12, playingHandicap: 12, teamName: 'Team 3' },
    { name: 'Pat', handicap: 9, teamName: 'Team 2' },
    { name: 'Riley', handicap: 14, teamName: 'Team 2' },
    { name: 'Jordan', handicap: 6, teamName: 'Team 2' },
    { name: 'Sam', handicap: 15, teamName: 'Team 2' },
    { name: 'Alex', handicap: 10, teamName: 'Team 3' },
    { name: 'Casey', handicap: 7, teamName: 'Team 3' },
    { name: 'Morgan', handicap: 13, teamName: 'Team 4' },
    { name: 'Quinn', handicap: 5, teamName: 'Team 4' },
    { name: 'Drew', handicap: 16, teamName: 'Team 4' },
  ];
  state = await api(base, 'POST', `/api/rounds/${roundId}/guests/bulk`, { token, body: { guests: extras } });
  if (state.members.length < 15) fail('roster should hold about 15 players, got ' + state.members.length);
  const cole = state.members.find((m) => m.display_name === 'Cole Jan');
  if (!cole) fail('Cole Jan missing');
  const team3 = state.teams.find((t) => t.name === 'Team 3');
  if (!team3) fail('Team 3 was not created from the picker');
  assertEqual(cole.team_id, team3.id, 'Cole Jan on team 3');
  const still16 = (state.teams.find((t) => t.name === 'Team 1') || {}).holes || [];
  const hole1again = still16.find((h) => h.holeNumber === 1);
  assertEqual(hole1again && hole1again.total, 16, 'team 1 hole 1 stays 16 after roster grow');

  const friend = await api(base, 'POST', '/api/auth/register', {
    body: {
      name: 'Friend Two',
      email: `scorecard.friend.${stamp}@example.com`,
      password: 'tester-pass-1',
    },
  });
  const joined = await api(base, 'POST', '/api/rounds/join', {
    token: friend.token,
    body: { code: live.round.join_code || live.round.joinCode },
  });
  const friendMember = joined.members.find((m) => m.display_name === 'Friend Two');
  if (!friendMember) fail('friend did not join the round');
  await api(base, 'POST', `/api/rounds/${roundId}/scores`, {
    token: friend.token,
    body: { memberId: friendMember.id, holeNumber: 2, gross: 4 },
  });
  const organizerSees = await api(base, 'GET', `/api/rounds/${roundId}`, { token });
  const friendSeen = organizerSees.members.find((m) => m.display_name === 'Friend Two');
  const friendHole = friendSeen && (friendSeen.holes || []).find((h) => h.holeNumber === 2);
  assertEqual(friendHole && friendHole.gross, 4, 'organizer sees friend score');
  const friendSees = await api(base, 'GET', `/api/rounds/${roundId}/live`, { token: friend.token });
  const teamFromFriend = (friendSees.teams || []).find((t) => t.name === 'Team 1');
  const friendHole1 = (teamFromFriend && teamFromFriend.holes || []).find((h) => h.holeNumber === 1);
  assertEqual(friendHole1 && friendHole1.total, 16, 'friend sees live team 1 hole 1');

  console.log('PASS Goldendale four-player hole 1');
  console.log('  course   Goldendale Golf Club 18 holes');
  console.log('  players  A/B/C/D  H 4/11/18/24');
  console.log('  gross    5/6/7/8');
  console.log('  dots     ' + dots.join('/'));
  console.log('  nets     ' + nets.join('/'));
  console.log('  team     ' + teamHole.total);
}

async function runDemoScenario(base) {
  const stamp = Date.now();
  const registered = await api(base, 'POST', '/api/auth/register', {
    body: {
      name: 'Demo Host',
      email: `scorecard.demo.${stamp}@example.com`,
      password: 'tester-pass-1',
    },
  });
  const token = registered.token;
  const created = await api(base, 'POST', '/api/rounds', {
    token,
    body: {
      name: 'Demo foursome — Kurt, Chase, Brian',
      format: 'team_net',
      holes: '18',
      allowance: 100,
      grossBalls: 1,
      netBalls: 2,
      dualCount: false,
    },
  });
  const roundId = created.round.id;
  const state = await api(base, 'POST', `/api/rounds/${roundId}/demo/foursome`, { token });
  const expected = [
    { name: 'Kurt', hcp: 9, gross: 75, net: 66 },
    { name: 'Chase', hcp: 12, gross: 85, net: 73 },
    { name: 'Brian', hcp: 15, gross: 95, net: 80 },
  ];
  for (const want of expected) {
    const member = state.members.find((m) => m.display_name === want.name);
    if (!member) fail('demo missing ' + want.name);
    assertEqual(Number(member.playing_handicap), want.hcp, want.name + ' HCP');
    assertEqual(member.totalGross, want.gross, want.name + ' 18-hole gross');
    assertEqual(member.totalNet, want.net, want.name + ' 18-hole net');
    const team = state.teams.find((t) => t.id === member.team_id);
    if (!team || team.name !== 'Team 1') fail(want.name + ' should be on Team 1');
  }
  const host = state.members.find((m) => m.display_name === 'Demo Host');
  if (host && host.holes && host.holes.some((h) => h.gross != null)) {
    fail('demo must not invent host scores');
  }
  console.log('PASS demo foursome Kurt 75/66 · Chase 85/73 · Brian 95/80');
}

async function runCacheHeaders(base) {
  const js = await fetch(base + '/js/api.js');
  if (!js.ok) fail('GET /js/api.js failed');
  const jsCache = js.headers.get('cache-control') || '';
  if (/max-age=86400/i.test(jsCache)) fail('js must not 86400-cache: ' + jsCache);
  if (!/max-age=60|must-revalidate|no-cache|max-age=0/i.test(jsCache)) {
    fail('js Cache-Control should revalidate or use a short max-age, got ' + jsCache);
  }
  const html = await fetch(base + '/');
  if (!html.ok) fail('GET / failed');
  const htmlCache = html.headers.get('cache-control') || '';
  if (/max-age=86400/i.test(htmlCache)) fail('html must not 86400-cache: ' + htmlCache);
  const page = await html.text();
  if (!/js\/api\.js\?v=/.test(page)) fail('index.html must cache-bust js/api.js');
  console.log('PASS cache headers: js revalidates, html not 86400, script ?v=');
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
    await runCacheHeaders(base);
    await runScenario(base);
    await runDemoScenario(base);
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
