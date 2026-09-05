/**
 * Team hole is vs par, not a stroke sum.
 * Default 1 gross + 2 net from distinct players. Dual-count optional.
 * Every legal assignment is tried; keep the lowest (best) vs-par total.
 * Gross slots use gross vs par; net slots use net vs par.
 * Ties: stable ballsKey. Fewer than needed scores: use what exists and flag incomplete.
 */

function resolvePar(players, settings) {
  const fromSettings = Number(settings.par);
  if (Number.isFinite(fromSettings) && fromSettings > 0) return fromSettings;
  for (const p of players || []) {
    const n = Number(p.par);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function vsPar(score, par) {
  return Number(score) - par;
}

function combinations(arr, k) {
  if (k <= 0) return [[]];
  if (k > arr.length) return [];
  const result = [];
  const path = [];
  function rec(start) {
    if (path.length === k) {
      result.push(path.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      path.push(arr[i]);
      rec(i + 1);
      path.pop();
    }
  }
  rec(0);
  return result;
}

/**
 * @param {Array<{id: string|number, gross: number, net?: number}>} players
 * @param {{grossBalls?: number, netBalls?: number, dualCount?: boolean, par?: number}} [settings]
 * @returns {{ total: number|null, balls: Array, incomplete: boolean }}
 */
function teamHoleScore(players, settings = {}) {
  const grossBalls = Number(settings.grossBalls ?? settings.gross_balls ?? 1);
  const netBalls = Number(settings.netBalls ?? settings.net_balls ?? 2);
  const dualCount = Boolean(settings.dualCount ?? settings.dual_count ?? false);
  const par = resolvePar(players, settings);

  const scored = (players || []).filter((p) => {
    if (p == null || p.gross == null || p.gross === '') return false;
    return Number.isFinite(Number(p.gross));
  });
  const neededDistinct = dualCount
    ? Math.max(grossBalls, netBalls)
    : grossBalls + netBalls;
  const incomplete =
    scored.length < neededDistinct ||
    scored.length < grossBalls ||
    (!dualCount && scored.length < Math.min(neededDistinct, grossBalls + netBalls));

  if (scored.length === 0 || (grossBalls <= 0 && netBalls <= 0) || par == null) {
    return { total: null, balls: [], incomplete: true };
  }

  const prepared = scored.map((p) => ({
    id: p.id,
    name: p.name,
    gross: Number(p.gross),
    net: Number.isFinite(Number(p.net)) ? Number(p.net) : Number(p.gross),
  }));

  const gCount = Math.min(Math.max(grossBalls, 0), prepared.length);
  let best = null;

  const gCombos = gCount === 0 ? [[]] : combinations(prepared, gCount);
  for (const gPick of gCombos) {
    const used = new Set(gPick.map((p) => p.id));
    const netPool = dualCount ? prepared : prepared.filter((p) => !used.has(p.id));
    const nCount = Math.min(Math.max(netBalls, 0), netPool.length);
    const nCombos = nCount === 0 ? [[]] : combinations(netPool, nCount);

    for (const nPick of nCombos) {
      const gTotal = gPick.reduce((s, p) => s + vsPar(p.gross, par), 0);
      const nTotal = nPick.reduce((s, p) => s + vsPar(p.net, par), 0);
      const total = gTotal + nTotal;
      const balls = [
        ...gPick.map((p) => ({
          playerId: p.id,
          name: p.name,
          type: 'gross',
          score: p.gross,
        })),
        ...nPick.map((p) => ({
          playerId: p.id,
          name: p.name,
          type: 'net',
          score: p.net,
        })),
      ];
      if (
        !best ||
        total < best.total ||
        (total === best.total && ballsKey(balls) < ballsKey(best.balls))
      ) {
        best = { total, balls, incomplete };
      }
    }
  }

  return best || { total: null, balls: [], incomplete: true };
}

function ballsKey(balls) {
  return balls
    .map((b) => `${b.type}:${b.playerId}:${b.score}`)
    .sort()
    .join('|');
}

/**
 * Snake-draft teams by playing handicap (best to highest).
 * Unassigned players are not passed in.
 */
function autoBalanceTeams(players, teamCount) {
  const n = Math.max(1, Number(teamCount) || 1);
  const sorted = [...(players || [])].sort((a, b) => {
    const ha = Number(a.playingHandicap ?? a.playing_handicap ?? a.handicap ?? 0);
    const hb = Number(b.playingHandicap ?? b.playing_handicap ?? b.handicap ?? 0);
    if (ha !== hb) return ha - hb;
    return String(a.id).localeCompare(String(b.id));
  });

  const teams = Array.from({ length: n }, (_, i) => ({
    name: `Team ${i + 1}`,
    sortOrder: i + 1,
    memberIds: [],
  }));

  sorted.forEach((player, i) => {
    const cycle = n * 2;
    const pos = i % cycle;
    const idx = pos < n ? pos : cycle - 1 - pos;
    teams[idx].memberIds.push(player.id);
  });

  return teams;
}

/**
 * Compare team totals with Goldendale tie-break:
 * back 9, last 6, last 3, 18, hardest SI.
 */
function compareTeamTieBreak(aHoles, bHoles, courseHoles) {
  const sumRange = (holes, start, end) =>
    holes
      .filter((h) => h.holeNumber >= start && h.holeNumber <= end && h.total != null)
      .reduce((s, h) => s + h.total, 0);

  const backA = sumRange(aHoles, 10, 18);
  const backB = sumRange(bHoles, 10, 18);
  if (backA !== backB) return backA - backB;

  const last6A = sumRange(aHoles, 13, 18);
  const last6B = sumRange(bHoles, 13, 18);
  if (last6A !== last6B) return last6A - last6B;

  const last3A = sumRange(aHoles, 16, 18);
  const last3B = sumRange(bHoles, 16, 18);
  if (last3A !== last3B) return last3A - last3B;

  const h18a = aHoles.find((h) => h.holeNumber === 18)?.total;
  const h18b = bHoles.find((h) => h.holeNumber === 18)?.total;
  if (h18a != null && h18b != null && h18a !== h18b) return h18a - h18b;

  const hardest = [...(courseHoles || [])].sort(
    (x, y) => (x.strokeIndex ?? x.stroke_index) - (y.strokeIndex ?? y.stroke_index)
  )[0];
  if (hardest) {
    const hn = hardest.holeNumber ?? hardest.hole_number;
    const ha = aHoles.find((h) => h.holeNumber === hn)?.total;
    const hb = bHoles.find((h) => h.holeNumber === hn)?.total;
    if (ha != null && hb != null && ha !== hb) return ha - hb;
  }
  return 0;
}

function sanitizeNickname(raw) {
  if (raw == null) return '';
  return String(raw).replace(/\s+/g, ' ').trim().slice(0, 24);
}

function teamDisplayName(team) {
  if (!team) return '';
  const name = String(team.name || '').trim() || 'Team';
  const nick = sanitizeNickname(team.nickname);
  return nick ? `${name} · ${nick}` : name;
}

function nextTeamLabel(teams) {
  const used = new Set();
  for (const team of teams || []) {
    const match = String(team.name || '').match(/^team\s*(\d+)$/i);
    if (match) used.add(Number(match[1]));
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return 'Team ' + n;
}

module.exports = {
  teamHoleScore,
  autoBalanceTeams,
  compareTeamTieBreak,
  combinations,
  sanitizeNickname,
  teamDisplayName,
  nextTeamLabel,
};
