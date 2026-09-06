#!/usr/bin/env node
/**
 * Goldendale scorecard tester (HTTP/API — no browser).
 *
 * Signs up, creates an 18-hole Goldendale team round, adds guests A–D
 * with playing handicaps 4/11/18/24, puts them on Team 1, enters hole 1
 * gross 5/6/7/8, and fails if dots, nets, or the vs-par team hole are wrong.
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

const {
  GOLDENDALE_PARS,
  team1VsParHoles,
  team1VsParRace,
} = require('../lib/seed/demoTeam1VsPar');

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

async function apiStatus(base, method, urlPath, { token, body } = {}) {
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
  return { status: res.status, body: data };
}

function startServer(port, dbFile, extraEnv = {}) {
  const child = spawn(process.execPath, ['api/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      TURSO_DATABASE_URL: 'file:' + dbFile,
      TURSO_AUTH_TOKEN: '',
      JWT_SECRET: 'scorecard-tester-local-only',
      APP_BASE_URL: 'http://127.0.0.1:' + port,
      ALLOW_DEMO: '1',
      ...extraEnv,
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
        gross: 20,
      },
    });
    fail('gross 20 should be rejected');
  } catch (err) {
    if (!/1 to 19/.test(err.message)) throw err;
  }
  const memberA = state.members.find((m) => m.display_name === 'A').id;
  for (const [holeNumber, gross] of [[3, 11], [4, 12], [5, 13], [6, 15], [7, 19]]) {
    const saved = await api(base, 'POST', `/api/rounds/${roundId}/scores`, {
      token,
      body: { memberId: memberA, holeNumber, gross },
    });
    if (!saved || saved.ok !== true) fail('gross ' + gross + ' should save');
    await api(base, 'POST', `/api/rounds/${roundId}/scores`, {
      token,
      body: { memberId: memberA, holeNumber, gross: null },
    });
  }

  if (!lastPost.updatedAt) fail('slim POST missing updatedAt');
  const postedHole = (lastPost.teams || []).find((t) => t.name === 'Team 1') || (lastPost.teams || [])[0];
  if (!postedHole || !postedHole.hole) fail('slim POST missing that hole team total');
  assertEqual(postedHole.hole.total, 1, 'slim POST team hole 1 vs par');

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
  assertEqual(teamHole.total, 1, 'team hole 1 vs par under best 1G+2N');
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
  assertEqual(liveHole && liveHole.total, 1, 'live patch team hole 1 vs par');

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
  assertEqual(team1.total, 1, 'team 1 running vs-par after hole 1');

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
  const stillHole1 = (state.teams.find((t) => t.name === 'Team 1') || {}).holes || [];
  const hole1again = stillHole1.find((h) => h.holeNumber === 1);
  assertEqual(hole1again && hole1again.total, 1, 'team 1 hole 1 stays +1 vs par after roster grow');

  const friend = await api(base, 'POST', '/api/auth/register', {
    body: {
      name: 'Friend Two',
      email: `scorecard.friend.${stamp}@example.com`,
      password: 'tester-pass-1',
    },
  });
  const joined = await api(base, 'POST', '/api/rounds/join', {
    token: friend.token,
    body: { code: live.round.join_code || live.round.joinCode, teamName: 'Team 2' },
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
  assertEqual(!!friendSees.showOtherScores, false, 'show other teams defaults OFF');
  const teamFromFriend = (friendSees.teams || []).find((t) => t.name === 'Team 1');
  const friendHole1 = (teamFromFriend && teamFromFriend.holes || []).find((h) => h.holeNumber === 1);
  if (friendHole1 && friendHole1.total != null) fail('Team 2 must not see Team 1 scores while toggle is OFF');
  const playerAFromFriend = (friendSees.scores || []).find((s) => Number(s.memberId) === Number(playerA.id) && Number(s.holeNumber) === 1);
  if (playerAFromFriend) fail('live patch must omit other-team hole scores when toggle is OFF');

  await api(base, 'PUT', `/api/rounds/${roundId}`, {
    token,
    body: { showOtherScores: true },
  });
  const friendSeesOn = await api(base, 'GET', `/api/rounds/${roundId}/live`, { token: friend.token });
  assertEqual(!!friendSeesOn.showOtherScores, true, 'toggle ON is visible to joiner');
  const teamFromFriendOn = (friendSeesOn.teams || []).find((t) => t.name === 'Team 1');
  const friendHole1On = (teamFromFriendOn && teamFromFriendOn.holes || []).find((h) => h.holeNumber === 1);
  assertEqual(friendHole1On && friendHole1On.total, 1, 'friend sees live team 1 hole 1 vs par when toggle is ON');

  const team2State = await api(base, 'POST', `/api/rounds/${roundId}/teams`, {
    token,
    body: { name: 'Team 2' },
  });
  const team2 = (team2State.teams || []).find((t) => t.name === 'Team 2');
  if (!team2) fail('Team 2 was not created');
  await api(base, 'PUT', `/api/rounds/${roundId}/members/${friendMember.id}`, {
    token,
    body: { teamId: team2.id },
  });
  const cross = await apiStatus(base, 'POST', `/api/rounds/${roundId}/scores`, {
    token: friend.token,
    body: { memberId: playerA.id, holeNumber: 2, gross: 5 },
  });
  assertEqual(cross.status, 403, 'cross-team score write rejected');
  if (!/own team/i.test((cross.body && cross.body.error) || '')) {
    fail('cross-team error should name own team');
  }
  await api(base, 'POST', `/api/rounds/${roundId}/scores`, {
    token: friend.token,
    body: { memberId: friendMember.id, holeNumber: 3, gross: 5 },
  });

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

async function runTeam1VsParDemo(base) {
  const stamp = Date.now();
  const registered = await api(base, 'POST', '/api/auth/register', {
    body: {
      name: 'Vs Par Reviewer',
      email: `scorecard.team1.${stamp}@example.com`,
      password: 'tester-pass-1',
    },
  });
  const token = registered.token;
  const created = await api(base, 'POST', '/api/rounds', {
    token,
    body: {
      name: 'Team 1 vs-par demo — ColdGin, Kurt, Chase, Brian',
      format: 'team_net',
      holes: '18',
      allowance: 100,
      grossBalls: 1,
      netBalls: 2,
      dualCount: false,
    },
  });
  const roundId = created.round.id;
  const state = await api(base, 'POST', `/api/rounds/${roundId}/demo/team1-vs-par`, { token });
  const expected = [
    { name: 'ColdGin', hcp: 3, gross: 72, net: 69 },
    { name: 'Kurt', hcp: 9, gross: 75, net: 66 },
    { name: 'Chase', hcp: 12, gross: 85, net: 73 },
    { name: 'Brian', hcp: 15, gross: 95, net: 80 },
  ];
  const team1 = state.teams.find((t) => t.name === 'Team 1');
  if (!team1) fail('Team 1 missing on vs-par demo');
  for (const want of expected) {
    const member = state.members.find((m) => m.display_name === want.name);
    if (!member) fail('team1 demo missing ' + want.name);
    assertEqual(String(member.handicap), String(want.hcp), want.name + ' stored HCP is strokes received');
    if (String(member.handicap).startsWith('+')) fail(want.name + ' HCP must not be stored as plus');
    assertEqual(Number(member.playing_handicap), want.hcp, want.name + ' playing HCP');
    assertEqual(member.totalGross, want.gross, want.name + ' 18-hole gross');
    assertEqual(member.totalNet, want.net, want.name + ' 18-hole net');
    assertEqual(member.team_id, team1.id, want.name + ' on Team 1');
  }
  const cold = state.members.find((m) => m.display_name === 'ColdGin');
  for (let i = 1; i <= 18; i++) {
    const scored = (cold.holes || []).find((h) => h.holeNumber === i);
    assertEqual(scored && scored.gross, GOLDENDALE_PARS[i - 1], 'ColdGin hole ' + i + ' is par');
  }
  const wantHoles = team1VsParHoles();
  const wantRace = team1VsParRace(wantHoles);
  (team1.holes || []).forEach((h) => {
    const want = wantHoles.find((x) => x.holeNumber === h.holeNumber);
    assertEqual(h.total, want.total, 'Team 1 hole ' + h.holeNumber + ' vs-par');
  });
  assertEqual(team1.total, wantRace[17].race, 'Team 1 running vs-par race');
  const host = state.members.find((m) => m.display_name === 'Vs Par Reviewer');
  if (host && host.holes && host.holes.some((h) => h.gross != null)) {
    fail('team1 demo must not invent host scores');
  }
  console.log('PASS Team 1 vs-par demo ColdGin 72/69 · Kurt 75/66 · Chase 85/73 · Brian 95/80 · race ' + team1.total);
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

async function runSideGamesScenario(base) {
  const stamp = Date.now();
  const registered = await api(base, 'POST', '/api/auth/register', {
    body: {
      name: 'Side Host',
      email: `scorecard.side.${stamp}@example.com`,
      password: 'tester-pass-1',
    },
  });
  const token = registered.token;
  const created = await api(base, 'POST', '/api/rounds', {
    token,
    body: {
      name: 'Side games coexist with vs-par',
      format: 'team_net',
      holes: '18',
      allowance: 100,
      grossBalls: 1,
      netBalls: 2,
      dualCount: false,
      sideGames: {
        skins: { on: true, pot: 18 },
        vegas: { on: true, scoring: 'gross', dollarsPerPoint: 1 },
        nassau: { on: true, scoring: 'gross', front: 2, back: 2, overall: 2 },
      },
    },
  });
  const roundId = created.round.id;
  let state = created;
  for (const player of PLAYERS) {
    state = await api(base, 'POST', `/api/rounds/${roundId}/guests`, {
      token,
      body: { name: player.name, handicap: player.handicap, playingHandicap: player.handicap, teamName: 'Team 1' },
    });
  }
  state = await api(base, 'POST', `/api/rounds/${roundId}/guests/bulk`, {
    token,
    body: {
      guests: [
        { name: 'Eve', handicap: 8, teamName: 'Team 2' },
        { name: 'Fay', handicap: 10, teamName: 'Team 2' },
      ],
    },
  });
  for (const player of PLAYERS) {
    const member = state.members.find((m) => m.display_name === player.name);
    if (Number(member.playing_handicap) !== player.handicap) {
      state = await api(base, 'PUT', `/api/rounds/${roundId}/members/${member.id}`, {
        token,
        body: { playingHandicap: player.handicap, teamName: 'Team 1' },
      });
    }
  }
  for (const player of PLAYERS) {
    const member = state.members.find((m) => m.display_name === player.name);
    if (!member) fail('side games missing ' + player.name);
    await api(base, 'POST', `/api/rounds/${roundId}/scores`, {
      token,
      body: { memberId: member.id, holeNumber: 1, gross: player.gross },
    });
  }
  const eve = state.members.find((m) => m.display_name === 'Eve');
  const fay = state.members.find((m) => m.display_name === 'Fay');
  if (!eve || !fay) fail('side games missing Team 2');
  await api(base, 'POST', `/api/rounds/${roundId}/scores`, {
    token,
    body: { memberId: eve.id, holeNumber: 1, gross: 6 },
  });
  await api(base, 'POST', `/api/rounds/${roundId}/scores`, {
    token,
    body: { memberId: fay.id, holeNumber: 1, gross: 7 },
  });
  const live = await api(base, 'GET', `/api/rounds/${roundId}`, { token });
  const holeResult = (live.holeResults || []).find((h) => h.holeNumber === 1);
  const teamHole = (holeResult.teams || []).find((t) => t.teamName === 'Team 1');
  assertEqual(teamHole && teamHole.total, 1, 'side games must not change hole-1 best 1G+2N');
  const vegas = live.sideGames && live.sideGames.games && live.sideGames.games.vegas;
  if (!vegas || !vegas.holes || !vegas.holes[0]) fail('vegas should score pair numbers');
  assertEqual(vegas.holes[0].numA, 56, 'Vegas Team 1 pair is 5+6=56, not vs-par +1');
  assertEqual(vegas.holes[0].numB, 67, 'Vegas Team 2 pair is 6+7=67');
  assertEqual(vegas.holes[0].points, 11, 'Vegas hole points are |56-67|');
  assertEqual(vegas.holes[0].swingA, 11, 'Vegas this-hole swing is +11 for Team 1');
  assertEqual(vegas.holes[0].swingB, -11, 'Vegas this-hole swing is −11 for Team 2');
  assertEqual(vegas.teamA.points, 11, 'Vegas TOTAL is zero-sum +11');
  assertEqual(vegas.teamB.points, -11, 'Vegas TOTAL is zero-sum −11');
  if (vegas.holes[0].numA === 1 || vegas.holes[0].points === 1) {
    fail('Vegas must not use the 1G+2N vs-par total');
  }
  if (!live.sideGames || !live.sideGames.games || !live.sideGames.games.skins) {
    fail('skins should run from the same hole scores');
  }
  assertEqual(live.round.sideGames.skins.on, true, 'skins toggle persisted');
  const friend = await api(base, 'POST', '/api/auth/register', {
    body: {
      name: 'Press Friend',
      email: `scorecard.press.${stamp}@example.com`,
      password: 'tester-pass-1',
    },
  });
  await api(base, 'POST', '/api/rounds/join', {
    token: friend.token,
    body: { code: live.round.join_code || live.round.joinCode, teamName: 'Team 2' },
  });
  await api(base, 'PUT', `/api/rounds/${roundId}`, {
    token,
    body: { showOtherScores: true },
  });
  const pressed = await api(base, 'POST', `/api/rounds/${roundId}/presses`, {
    token: friend.token,
    body: { gameKey: 'vegas', startHole: 1, endHole: 18 },
  });
  if (!(pressed.presses || []).some((p) => (p.game_key || p.gameKey) === 'vegas')) {
    fail('friend press should land on the card');
  }
  const pressedVegas = pressed.sideGames && pressed.sideGames.games && pressed.sideGames.games.vegas;
  if (!pressedVegas || !pressedVegas.holes || !pressedVegas.holes[0]) fail('vegas after press');
  assertEqual(pressedVegas.holes[0].points, 11, 'vegas raw hole points stay |56-67|');
  assertEqual(pressedVegas.holes[0].games, 2, 'vegas Press increments games running to 2');
  assertEqual(pressedVegas.holes[0].swingA, 22, '11-point hole × 2 games = +22');
  assertEqual(pressedVegas.holes[0].swingB, -22, '11-point hole × 2 games = −22');
  assertEqual(pressedVegas.teamA.points, 22, 'zero-sum TOTAL uses games-running multiplier');
  assertEqual(pressedVegas.teamB.points, -22, 'zero-sum TOTAL mirror');
  if (pressed.sideGames.games.vegasPresses) fail('vegas must not keep independent child ledgers');
  const still = (pressed.holeResults || []).find((h) => h.holeNumber === 1);
  const stillTeam = (still.teams || []).find((t) => t.teamName === 'Team 1');
  assertEqual(stillTeam && stillTeam.total, 1, 'press must not change hole-1 vs-par');

  const frontPress = await api(base, 'POST', `/api/rounds/${roundId}/presses`, {
    token: friend.token,
    body: { gameKey: 'nassau', segment: 'front', startHole: 1, endHole: 18 },
  });
  const frontRows = (frontPress.sideGames && frontPress.sideGames.games && frontPress.sideGames.games.nassauPresses) || [];
  const front = frontRows.find((p) => p.segment === 'front');
  assertEqual(front && front.endHole, 9, 'front Nassau press dies at 9');
  assertEqual(front && front.startHole, 1, 'front Nassau press starts at tap hole');
  const stillFront = (frontPress.holeResults || []).find((h) => h.holeNumber === 1);
  const stillFrontTeam = (stillFront.teams || []).find((t) => t.teamName === 'Team 1');
  assertEqual(stillFrontTeam && stillFrontTeam.total, 1, 'nassau front press must not change hole-1 vs-par');
  const nassauLive = frontPress.sideGames && frontPress.sideGames.games && frontPress.sideGames.games.nassau;
  if (!nassauLive || !nassauLive.front) fail('nassau originals should stay live after a Front press');
  assertEqual(nassauLive.front.holesWonB, 1, 'Front RUNNING through hole 1 is Team 2 1 up');
  assertEqual(nassauLive.front.holesWonA, 0, 'Front RUNNING Team 1 has 0 holes');
  if (!(nassauLive.front.holeRows || []).some((h) => h.holeNumber === 1 && h.winner === 'B')) {
    fail('Front RUNNING hole 1 should be on the live card');
  }

  const backFromOne = await api(base, 'POST', `/api/rounds/${roundId}/presses`, {
    token: friend.token,
    body: { gameKey: 'nassau', segment: 'back', startHole: 1, endHole: 18 },
  });
  const backEarly = ((backFromOne.sideGames && backFromOne.sideGames.games && backFromOne.sideGames.games.nassauPresses) || [])
    .find((p) => p.segment === 'back' && Number(p.startHole) === 10);
  if (!backEarly) fail('Back press from hole 1 should start at 10 and stay live');
  assertEqual(backEarly.endHole, 18, 'Back press dies at 18');

  await api(base, 'POST', `/api/rounds/${roundId}/presses`, {
    token: friend.token,
    body: { gameKey: 'nassau', segment: 'back', startHole: 12, endHole: 18 },
  });
  const overallPress = await api(base, 'POST', `/api/rounds/${roundId}/presses`, {
    token: friend.token,
    body: { gameKey: 'nassau', segment: 'overall', startHole: 12, endHole: 18 },
  });
  const nassauRows = (overallPress.sideGames && overallPress.sideGames.games && overallPress.sideGames.games.nassauPresses) || [];
  const back = nassauRows.find((p) => p.segment === 'back' && Number(p.startHole) === 12);
  const overall = nassauRows.find((p) => p.segment === 'overall');
  assertEqual(back && back.startHole, 12, 'back press from hole 12');
  assertEqual(back && back.endHole, 18, 'back press dies at 18');
  assertEqual(overall && overall.startHole, 12, 'overall press from hole 12');
  assertEqual(overall && overall.endHole, 18, 'overall press is tap→18');
  const from12 = nassauRows.filter((p) => Number(p.startHole) === 12);
  if (from12.length < 2) fail('hole 12 should press Back and Overall independently');
  if (!from12.some((p) => p.segment === 'back') || !from12.some((p) => p.segment === 'overall')) {
    fail('hole 12 Back and Overall presses should both stay live');
  }
  const stillOverall = (overallPress.holeResults || []).find((h) => h.holeNumber === 1);
  const stillOverallTeam = (stillOverall.teams || []).find((t) => t.teamName === 'Team 1');
  assertEqual(stillOverallTeam && stillOverallTeam.total, 1, 'nassau presses must not change hole-1 vs-par');
  console.log('PASS side games skins+vegas+nassau; hole 1 still +1; either side can press');
}

async function runJoinIdentityScenario(base) {
  const stamp = Date.now();
  const host = await api(base, 'POST', '/api/auth/register', {
    body: {
      name: 'Join Host',
      email: `scorecard.joinhost.${stamp}@example.com`,
      password: 'tester-pass-1',
    },
  });
  const created = await api(base, 'POST', '/api/rounds', {
    token: host.token,
    body: {
      name: 'Join identity Sunday game',
      format: 'team_net',
      holes: '18',
      team1Nickname: 'Birds',
    },
  });
  const team1 = (created.teams || []).find((t) => t.name === 'Team 1');
  assertEqual(team1 && team1.nickname, 'Birds', 'host Team 1 nickname');
  assertEqual(team1 && team1.displayName, 'Team 1 · Birds', 'host Team 1 display');
  const preview = await api(base, 'GET', `/api/rounds/join-info?code=${created.round.join_code || created.round.joinCode}`, {
    token: host.token,
  });
  assertEqual(preview.nextTeamName, 'Team 2', 'next join team is Team 2');
  const joiner = await api(base, 'POST', '/api/auth/register', {
    body: {
      name: 'Join Friend',
      email: `scorecard.joinfriend.${stamp}@example.com`,
      password: 'tester-pass-1',
    },
  });
  const refused = await apiStatus(base, 'POST', '/api/rounds/join', {
    token: joiner.token,
    body: { code: created.round.join_code || created.round.joinCode },
  });
  assertEqual(refused.status, 400, 'joiner must pick a team');
  const refusedHost = await apiStatus(base, 'POST', '/api/rounds/join', {
    token: joiner.token,
    body: { code: created.round.join_code || created.round.joinCode, teamName: 'Team 1' },
  });
  assertEqual(refusedHost.status, 400, 'joiner cannot take Team 1');
  const joined = await api(base, 'POST', '/api/rounds/join', {
    token: joiner.token,
    body: {
      code: created.round.join_code || created.round.joinCode,
      addTeam: true,
      teamNickname: 'Wolves',
      displayName: 'Ace',
    },
  });
  const team2 = (joined.teams || []).find((t) => t.name === 'Team 2');
  if (!team2) fail('joiner Add team should create Team 2');
  assertEqual(team2.nickname, 'Wolves', 'joiner Team 2 nickname');
  assertEqual(team2.displayName, 'Team 2 · Wolves', 'joiner Team 2 display');
  const ace = (joined.members || []).find((m) => m.display_name === 'Ace');
  if (!ace) fail('joiner card name Ace missing');
  assertEqual(ace.team_id, team2.id, 'joiner is on Team 2 not Team 1');
  const hostSees = await api(base, 'GET', `/api/rounds/${created.round.id}`, { token: host.token });
  const hostT2 = (hostSees.teams || []).find((t) => t.name === 'Team 2');
  assertEqual(hostT2 && hostT2.displayName, 'Team 2 · Wolves', 'host sees same Team 2 name');
  const hostAce = (hostSees.members || []).find((m) => m.display_name === 'Ace');
  if (!hostAce) fail('host does not see joiner name Ace');

  const added = await api(base, 'POST', `/api/rounds/${created.round.id}/guests`, {
    token: joiner.token,
    body: { name: 'Buddy', handicap: 12, teamName: 'Team 2' },
  });
  const buddy = (added.members || []).find((m) => m.display_name === 'Buddy');
  if (!buddy) fail('joiner Add player Buddy missing');
  assertEqual(buddy.team_id, team2.id, 'joiner added guest to own Team 2');
  assertEqual(!!buddy.is_guest, true, 'Buddy is a guest');

  const implicit = await api(base, 'POST', `/api/rounds/${created.round.id}/guests`, {
    token: joiner.token,
    body: { name: 'Pal', handicap: 10 },
  });
  const pal = (implicit.members || []).find((m) => m.display_name === 'Pal');
  if (!pal) fail('joiner default Add player Pal missing');
  assertEqual(pal.team_id, team2.id, 'joiner default add lands on own team');

  const cross = await apiStatus(base, 'POST', `/api/rounds/${created.round.id}/guests`, {
    token: joiner.token,
    body: { name: 'Spy', handicap: 8, teamName: 'Team 1' },
  });
  assertEqual(cross.status, 403, 'joiner cannot add a player to Team 1');
  const spy = ((cross.body && cross.body.members) || []).find((m) => m.display_name === 'Spy');
  if (spy) fail('cross-team guest must not be created');

  const hostAfter = await api(base, 'GET', `/api/rounds/${created.round.id}`, { token: host.token });
  if ((hostAfter.members || []).some((m) => m.display_name === 'Spy')) {
    fail('host must not see a rejected Team 1 guest');
  }
  const hostBuddy = (hostAfter.members || []).find((m) => m.display_name === 'Buddy');
  assertEqual(hostBuddy && hostBuddy.team_id, team2.id, 'host sees joiner guest on Team 2');

  const hostMember = (hostAfter.members || []).find((m) => Number(m.player_id) === Number(host.user && host.user.id));
  if (!hostMember) fail('host member missing for score-lock check');
  const scoreLock = await apiStatus(base, 'POST', `/api/rounds/${created.round.id}/scores`, {
    token: joiner.token,
    body: { memberId: hostMember.id, holeNumber: 1, gross: 4 },
  });
  assertEqual(scoreLock.status, 403, 'joiner must not write Team 1 scores');
  const afterLock = await api(base, 'GET', `/api/rounds/${created.round.id}`, { token: host.token });
  const hostLocked = (afterLock.members || []).find((m) => Number(m.player_id) === Number(host.user && host.user.id));
  const hostHole1 = hostLocked && (hostLocked.holes || []).find((h) => h.holeNumber === 1);
  if (hostHole1 && hostHole1.gross != null) fail('rejected Team 1 score must not persist');

  await api(base, 'POST', `/api/rounds/${created.round.id}/scores`, {
    token: host.token,
    body: { memberId: hostMember.id, holeNumber: 1, gross: 4 },
  });
  const joinerHidden = await api(base, 'GET', `/api/rounds/${created.round.id}`, { token: joiner.token });
  assertEqual(!!(joinerHidden.round && joinerHidden.round.showOtherScores), false, 'new rounds hide other teams by default');
  const hiddenHost = (joinerHidden.members || []).find((m) => Number(m.id) === Number(hostMember.id));
  const hiddenHole = hiddenHost && (hiddenHost.holes || []).find((h) => h.holeNumber === 1);
  if (hiddenHole && hiddenHole.gross != null) fail('joiner must not see Team 1 scores while toggle is OFF');

  await api(base, 'PUT', `/api/rounds/${created.round.id}`, {
    token: host.token,
    body: { showOtherScores: true },
  });
  const joinerShown = await api(base, 'GET', `/api/rounds/${created.round.id}`, { token: joiner.token });
  assertEqual(!!(joinerShown.round && joinerShown.round.showOtherScores), true, 'organizer can turn other-team scores ON');
  const shownHost = (joinerShown.members || []).find((m) => Number(m.id) === Number(hostMember.id));
  const shownHole = shownHost && (shownHost.holes || []).find((h) => h.holeNumber === 1);
  assertEqual(shownHole && shownHole.gross, 4, 'joiner sees Team 1 scores when toggle is ON');
  const stillLocked = await apiStatus(base, 'POST', `/api/rounds/${created.round.id}/scores`, {
    token: joiner.token,
    body: { memberId: hostMember.id, holeNumber: 1, gross: 6 },
  });
  assertEqual(stillLocked.status, 403, 'visible other-team scores stay read-only');

  console.log('PASS join-code Team 1 · Birds / Team 2 · Wolves; joiner Add player own team only; other-team scores hidden until toggle');
}

async function runWolfScenario(base) {
  const stamp = Date.now();
  const registered = await api(base, 'POST', '/api/auth/register', {
    body: {
      name: 'Wolf Host',
      email: `scorecard.wolf.${stamp}@example.com`,
      password: 'tester-pass-1',
    },
  });
  const token = registered.token;
  const created = await api(base, 'POST', '/api/rounds', {
    token,
    body: {
      name: 'Wolf live card',
      format: 'team_net',
      holes: '18',
      teamRace: false,
      sideGames: { wolf: { on: true, scoring: 'gross', dollarsPerPoint: 1 } },
    },
  });
  const roundId = created.round.id;
  let state = created;
  const names = ['W1', 'W2', 'W3', 'W4'];
  for (const name of names) {
    state = await api(base, 'POST', `/api/rounds/${roundId}/guests`, {
      token,
      body: { name, handicap: 0, playingHandicap: 0 },
    });
  }
  const guests = names.map((name) => state.members.find((m) => m.display_name === name));
  if (guests.some((g) => !g)) fail('wolf guests missing');
  const joiner = await api(base, 'POST', '/api/auth/register', {
    body: {
      name: 'Wolf Joiner',
      email: `scorecard.wolfjoin.${stamp}@example.com`,
      password: 'tester-pass-1',
    },
  });
  const joined = await api(base, 'POST', '/api/rounds/join', {
    token: joiner.token,
    body: { code: created.round.join_code || created.round.joinCode, addTeam: true, displayName: 'David' },
  });
  const team2 = (joined.teams || []).find((t) => t.name === 'Team 2');
  if (!team2) fail('wolf joiner should land on Team 2');
  const cross = await apiStatus(base, 'POST', `/api/rounds/${roundId}/scores`, {
    token: joiner.token,
    body: { memberId: guests[0].id, holeNumber: 1, gross: 3 },
  });
  assertEqual(cross.status, 403, 'Wolf joiner must not write Team 1 scores');
  const afterCross = await api(base, 'GET', `/api/rounds/${roundId}`, { token });
  const g0 = (afterCross.members || []).find((m) => Number(m.id) === Number(guests[0].id));
  const g0h1 = g0 && (g0.holes || []).find((h) => h.holeNumber === 1);
  if (g0h1 && g0h1.gross != null) fail('rejected Wolf Team 1 score must not persist');
  const first = await api(base, 'POST', `/api/rounds/${roundId}/scores`, {
    token,
    body: { memberId: guests[0].id, holeNumber: 1, gross: 3 },
  });
  if (!first || first.ok !== true) fail('host must enter Team 1 Wolf gross');
  const grosses = [3, 5, 6, 6];
  for (let i = 1; i < guests.length; i++) {
    const posted = await api(base, 'POST', `/api/rounds/${roundId}/scores`, {
      token,
      body: { memberId: guests[i].id, holeNumber: 1, gross: grosses[i] },
    });
    if (!posted || posted.ok !== true) fail('wolf score before lock should save');
  }
  await api(base, 'PUT', `/api/rounds/${roundId}/wolf/1`, {
    token,
    body: { wolfMemberId: guests[0].id, lone: true, locked: true },
  });
  const live = await api(base, 'GET', `/api/rounds/${roundId}`, { token });
  const wolf = live.sideGames && live.sideGames.games && live.sideGames.games.wolf;
  if (!wolf) fail('wolf game missing after lock');
  const w1 = (wolf.points || []).find((p) => Number(p.id) === Number(guests[0].id));
  assertEqual(w1 && w1.points, 2, 'lone wolf ±2');
  const hole = (wolf.holes || []).find((h) => h.holeNumber === 1);
  assertEqual(hole && hole.winner, 'wolf', 'better ball wolf wins');
  assertEqual(hole && hole.points, 2, 'lone value 2');

  const hole2Gross = [4, 6, 7, 8];
  for (let i = 0; i < guests.length; i++) {
    const refused = await apiStatus(base, 'POST', `/api/rounds/${roundId}/scores`, {
      token: joiner.token,
      body: { memberId: guests[i].id, holeNumber: 2, gross: hole2Gross[i] },
    });
    assertEqual(refused.status, 403, 'Wolf joiner must not write Team 1 hole-2 scores');
    const posted = await api(base, 'POST', `/api/rounds/${roundId}/scores`, {
      token,
      body: { memberId: guests[i].id, holeNumber: 2, gross: hole2Gross[i] },
    });
    if (!posted || posted.ok !== true) fail('host must enter Wolf hole-2 scores');
  }
  await api(base, 'PUT', `/api/rounds/${roundId}/wolf/2`, {
    token,
    body: { wolfMemberId: guests[0].id, lone: true, blind: true, locked: true },
  });
  const afterBlind = await api(base, 'GET', `/api/rounds/${roundId}`, { token });
  const wolf2 = afterBlind.sideGames && afterBlind.sideGames.games && afterBlind.sideGames.games.wolf;
  const blindHole = (wolf2.holes || []).find((h) => h.holeNumber === 2);
  assertEqual(blindHole && blindHole.points, 4, 'blind lone ±4');
  const blindW1 = (wolf2.points || []).find((p) => Number(p.id) === Number(guests[0].id));
  assertEqual(blindW1 && blindW1.points, 6, 'lone +2 plus blind +4');

  const hole3Gross = [3, 4, 5, 6];
  for (let i = 0; i < guests.length; i++) {
    await api(base, 'POST', `/api/rounds/${roundId}/scores`, {
      token,
      body: { memberId: guests[i].id, holeNumber: 3, gross: hole3Gross[i] },
    });
  }
  await api(base, 'PUT', `/api/rounds/${roundId}/wolf/3`, {
    token,
    body: { wolfMemberId: guests[0].id, partnerMemberId: guests[1].id, locked: true },
  });
  const afterPair = await api(base, 'GET', `/api/rounds/${roundId}`, { token });
  const wolf3 = afterPair.sideGames && afterPair.sideGames.games && afterPair.sideGames.games.wolf;
  const pairHole = (wolf3.holes || []).find((h) => h.holeNumber === 3);
  assertEqual(pairHole && pairHole.points, 1, 'partnered ±1');
  const pairW1 = (wolf3.points || []).find((p) => Number(p.id) === Number(guests[0].id));
  const pairW2 = (wolf3.points || []).find((p) => Number(p.id) === Number(guests[1].id));
  assertEqual(pairW1 && pairW1.points, 7, 'running +2 +4 +1');
  assertEqual(pairW2 && pairW2.points, -5, 'field −2 −4 then partner +1');

  const hole4Gross = [4, 5, 4, 6];
  for (let i = 0; i < guests.length; i++) {
    await api(base, 'POST', `/api/rounds/${roundId}/scores`, {
      token,
      body: { memberId: guests[i].id, holeNumber: 4, gross: hole4Gross[i] },
    });
  }
  await api(base, 'PUT', `/api/rounds/${roundId}/wolf/4`, {
    token,
    body: { wolfMemberId: guests[0].id, partnerMemberId: guests[1].id, locked: true },
  });
  const afterTie = await api(base, 'GET', `/api/rounds/${roundId}`, { token });
  const wolf4 = afterTie.sideGames && afterTie.sideGames.games && afterTie.sideGames.games.wolf;
  const tieHole = (wolf4.holes || []).find((h) => h.holeNumber === 4);
  assertEqual(tieHole && tieHole.winner, null, 'better-ball tie has no winner');
  assertEqual(tieHole && tieHole.points, 0, 'tie 0');
  const tieW1 = (wolf4.points || []).find((p) => Number(p.id) === Number(guests[0].id));
  assertEqual(tieW1 && tieW1.points, 7, 'tie adds nothing');
  console.log('PASS Wolf card rejects cross-team gross; host scores; lone ±2, blind ±4, partnered ±1, tie 0');
}

async function runNinesScenario(base) {
  const stamp = Date.now();
  const registered = await api(base, 'POST', '/api/auth/register', {
    body: {
      name: 'Nines Host',
      email: `scorecard.nines.${stamp}@example.com`,
      password: 'tester-pass-1',
    },
  });
  const token = registered.token;
  const created = await api(base, 'POST', '/api/rounds', {
    token,
    body: {
      name: 'Nines running card',
      format: 'team_net',
      holes: '18',
      teamRace: false,
      sideGames: { nines: { on: true, scoring: 'gross', blitz: false, dollarsPerPoint: 1 } },
    },
  });
  const roundId = created.round.id;
  let state = created;
  for (const name of ['N1', 'N2']) {
    state = await api(base, 'POST', `/api/rounds/${roundId}/guests`, {
      token,
      body: { name, handicap: 0, playingHandicap: 0 },
    });
  }
  if ((state.members || []).length !== 3) fail('nines needs host + 2 guests');
  const host = (state.members || []).find((m) => m.role === 'organizer') || state.members[0];
  const n1 = state.members.find((m) => m.display_name === 'N1');
  const n2 = state.members.find((m) => m.display_name === 'N2');
  if (!host || !n1 || !n2) fail('nines roster missing');
  await api(base, 'POST', `/api/rounds/${roundId}/scores`, { token, body: { memberId: host.id, holeNumber: 1, gross: 3 } });
  await api(base, 'POST', `/api/rounds/${roundId}/scores`, { token, body: { memberId: n1.id, holeNumber: 1, gross: 5 } });
  await api(base, 'POST', `/api/rounds/${roundId}/scores`, { token, body: { memberId: n2.id, holeNumber: 1, gross: 5 } });
  const after1 = await api(base, 'GET', `/api/rounds/${roundId}`, { token });
  const nines1 = after1.sideGames && after1.sideGames.games && after1.sideGames.games.nines;
  if (!nines1) fail('nines game missing after hole 1');
  const h1 = (nines1.holes || []).find((h) => h.holeNumber === 1);
  assertEqual(h1 && h1.points && Number(h1.points[host.id] ?? h1.points[String(host.id)]), 5, 'hole1 5-2-2 host 5');
  assertEqual(h1 && h1.running && Number(h1.running[host.id] ?? h1.running[String(host.id)]), 5, 'hole1 running 5');
  await api(base, 'POST', `/api/rounds/${roundId}/scores`, { token, body: { memberId: host.id, holeNumber: 2, gross: 3 } });
  await api(base, 'POST', `/api/rounds/${roundId}/scores`, { token, body: { memberId: n1.id, holeNumber: 2, gross: 4 } });
  await api(base, 'POST', `/api/rounds/${roundId}/scores`, { token, body: { memberId: n2.id, holeNumber: 2, gross: 5 } });
  const after2 = await api(base, 'GET', `/api/rounds/${roundId}`, { token });
  const nines2 = after2.sideGames && after2.sideGames.games && after2.sideGames.games.nines;
  const h2 = (nines2.holes || []).find((h) => h.holeNumber === 2);
  assertEqual(h2 && h2.points && Number(h2.points[host.id] ?? h2.points[String(host.id)]), 5, 'hole2 host 5');
  assertEqual(h2 && h2.points && Number(h2.points[n1.id] ?? h2.points[String(n1.id)]), 3, 'hole2 N1 3');
  assertEqual(h2 && h2.points && Number(h2.points[n2.id] ?? h2.points[String(n2.id)]), 1, 'hole2 N2 1');
  assertEqual(h2 && h2.running && Number(h2.running[host.id] ?? h2.running[String(host.id)]), 10, 'running 10');
  assertEqual(h2 && h2.running && Number(h2.running[n1.id] ?? h2.running[String(n1.id)]), 5, 'running 5');
  assertEqual(h2 && h2.running && Number(h2.running[n2.id] ?? h2.running[String(n2.id)]), 3, 'running 3');
  const hostPts = (nines2.points || []).find((p) => Number(p.id) === Number(host.id));
  assertEqual(hostPts && hostPts.points, 10, 'card total sums to 10');
  console.log('PASS Nines hole 5-2-2 then 5-3-1 running 10/5/3');
}

async function runHardeningScenario(base) {
  const stamp = Date.now();
  const host = await api(base, 'POST', '/api/auth/register', {
    body: {
      name: 'Lock Host',
      email: `scorecard.lockhost.${stamp}@example.com`,
      password: 'tester-pass-1',
    },
  });
  const created = await api(base, 'POST', '/api/rounds', {
    token: host.token,
    body: {
      name: 'Hardening Sunday game',
      format: 'team_net',
      holes: '18',
      teamRace: true,
      showOtherScores: false,
      grossBalls: 1,
      netBalls: 2,
    },
  });
  const joinCode = created.round.join_code || created.round.joinCode;
  if (!joinCode || String(joinCode).length < 8) {
    fail('new join codes must be at least 8 characters, got ' + joinCode);
  }
  const roundId = created.round.id;
  const hostMember = (created.members || []).find((m) => Number(m.player_id) === Number(host.user && host.user.id));
  if (!hostMember) fail('host member missing');

  const anonScore = await apiStatus(base, 'POST', `/api/rounds/${roundId}/scores`, {
    body: { memberId: hostMember.id, holeNumber: 1, gross: 4 },
  });
  assertEqual(anonScore.status, 401, 'anonymous score write rejected');
  const anonGuest = await apiStatus(base, 'POST', `/api/rounds/${roundId}/guests`, {
    body: { name: 'Ghost', handicap: 8 },
  });
  assertEqual(anonGuest.status, 401, 'anonymous guest add rejected');
  const anonPress = await apiStatus(base, 'POST', `/api/rounds/${roundId}/presses`, {
    body: { gameKey: 'vegas', startHole: 1 },
  });
  assertEqual(anonPress.status, 401, 'anonymous press rejected');
  const anonSettings = await apiStatus(base, 'PUT', `/api/rounds/${roundId}`, {
    body: { showOtherScores: true, teamRace: false, grossBalls: 3, netBalls: 0 },
  });
  assertEqual(anonSettings.status, 401, 'anonymous settings write rejected');
  const anonPlayers = await apiStatus(base, 'GET', '/api/players');
  assertEqual(anonPlayers.status, 401, 'player directory requires auth');

  const badJoin = await apiStatus(base, 'POST', '/api/rounds/join', {
    token: host.token,
    body: { code: 'ZZZZZZZZ', teamName: 'Team 2' },
  });
  assertEqual(badJoin.status, 404, 'invalid join code rejected');
  const shortJoin = await apiStatus(base, 'POST', '/api/rounds/join', {
    token: host.token,
    body: { code: 'AB', teamName: 'Team 2' },
  });
  assertEqual(shortJoin.status, 404, 'short join code rejected as not found');

  const joiner = await api(base, 'POST', '/api/auth/register', {
    body: {
      name: 'Lock Joiner',
      email: `scorecard.lockjoin.${stamp}@example.com`,
      password: 'tester-pass-1',
    },
  });
  const joined = await api(base, 'POST', '/api/rounds/join', {
    token: joiner.token,
    body: { code: joinCode, addTeam: true },
  });
  const joinerMember = (joined.members || []).find((m) => Number(m.player_id) === Number(joiner.user && joiner.user.id));
  if (!joinerMember) fail('joiner did not join');

  const settingsSteal = await apiStatus(base, 'PUT', `/api/rounds/${roundId}`, {
    token: joiner.token,
    body: { showOtherScores: true, teamRace: false, format: 'match_play', grossBalls: 3, netBalls: 0 },
  });
  assertEqual(settingsSteal.status, 403, 'joiner cannot change Sunday rules / formats / show-other-teams');
  const afterSteal = await api(base, 'GET', `/api/rounds/${roundId}`, { token: host.token });
  assertEqual(!!(afterSteal.round && afterSteal.round.showOtherScores), false, 'show-other-teams stayed OFF');
  assertEqual(!!afterSteal.round.teamRace, true, 'Sunday game stayed ON');
  assertEqual(Number(afterSteal.round.gross_balls ?? afterSteal.round.grossBalls), 1, 'format gross balls unchanged');
  assertEqual(Number(afterSteal.round.net_balls ?? afterSteal.round.netBalls), 2, 'format net balls unchanged');

  const cross = await apiStatus(base, 'POST', `/api/rounds/${roundId}/scores`, {
    token: joiner.token,
    body: { memberId: hostMember.id, holeNumber: 1, gross: 3 },
  });
  assertEqual(cross.status, 403, 'cross-team score write is 403');
  const afterCross = await api(base, 'GET', `/api/rounds/${roundId}`, { token: host.token });
  const hostLocked = (afterCross.members || []).find((m) => Number(m.id) === Number(hostMember.id));
  const hole1 = hostLocked && (hostLocked.holes || []).find((h) => h.holeNumber === 1);
  if (hole1 && hole1.gross != null) fail('rejected cross-team score must not persist');

  const directory = await api(base, 'GET', '/api/players', { token: joiner.token });
  if (!Array.isArray(directory)) fail('signed-in player list should be an array');
  const other = directory.find((p) => Number(p.id) !== Number(joiner.user && joiner.user.id));
  if (other && other.email) fail('non-admin must not see other players’ emails');

  const magic = await api(base, 'POST', '/api/auth/magic-link', {
    body: { email: `scorecard.lockhost.${stamp}@example.com` },
  });
  if (process.env.VERCEL_ENV === 'production' && magic.link) {
    fail('production must not return magic-link URLs');
  }

  console.log('PASS hardening: auth on mutations, 8-char join codes, invalid join 404, joiner settings 403, cross-team 403');
}

async function runDemoOffScenario() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goldendale-demo-off-'));
  const dbFile = path.join(tmpDir, 'demo-off.db');
  const port = await getFreePort();
  const child = startServer(port, dbFile, { ALLOW_DEMO: '0' });
  const base = 'http://127.0.0.1:' + port;
  try {
    await waitForHealth(base);
    const host = await api(base, 'POST', '/api/auth/register', {
      body: {
        name: 'Demo Off Host',
        email: `scorecard.demooff.${Date.now()}@example.com`,
        password: 'tester-pass-1',
      },
    });
    const created = await api(base, 'POST', '/api/rounds', {
      token: host.token,
      body: { name: 'Demo must stay closed', format: 'team_net', holes: '18' },
    });
    const foursome = await apiStatus(base, 'POST', `/api/rounds/${created.round.id}/demo/foursome`, {
      token: host.token,
    });
    assertEqual(foursome.status, 404, 'demo foursome off without ALLOW_DEMO');
    const vsPar = await apiStatus(base, 'POST', `/api/rounds/${created.round.id}/demo/team1-vs-par`, {
      token: host.token,
    });
    assertEqual(vsPar.status, 404, 'demo team1-vs-par off without ALLOW_DEMO');
    console.log('PASS demo HTTP routes 404 when ALLOW_DEMO is off');
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
    if (!child.killed) child.kill('SIGKILL');
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
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
    await runTeam1VsParDemo(base);
    await runSideGamesScenario(base);
    await runWolfScenario(base);
    await runNinesScenario(base);
    await runJoinIdentityScenario(base);
    await runHardeningScenario(base);
    if (!requested) await runDemoOffScenario();
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
