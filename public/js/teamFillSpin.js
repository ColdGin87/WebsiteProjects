/**
 * Team fill spin — pick leftover golfers for any short team.
 * Fair random among included names. Accept is a separate step.
 */

const TEAM_FILL_SIZE = 4;

function isFollowAlongMember(member) {
  const role = String((member && member.role) || '').toLowerCase();
  return role === 'follower' || role === 'follow' || role === 'follow_along';
}

function scoringMembers(members) {
  return (members || []).filter((m) => m && !isFollowAlongMember(m));
}

function sameTeamIds(a, b) {
  if (a == null || b == null || a === '') return false;
  return Number(a) === Number(b) && Number.isFinite(Number(a));
}

function memberTeamIds(member) {
  if (!member) return [];
  const ids = [];
  const home = member.team_id ?? member.teamId;
  const fill = member.fill_team_id ?? member.fillTeamId;
  if (home != null && home !== '' && Number.isFinite(Number(home))) ids.push(Number(home));
  if (fill != null && fill !== '' && Number.isFinite(Number(fill)) && !sameTeamIds(fill, home)) {
    ids.push(Number(fill));
  }
  return ids;
}

function memberOnTeam(member, teamId) {
  return memberTeamIds(member).some((id) => sameTeamIds(id, teamId));
}

function teamDisplay(team) {
  if (!team) return 'Unassigned';
  const nick = team.nickname || team.teamNickname;
  return nick ? `${team.name} · ${nick}` : String(team.name || 'Team');
}

function scoringCountOnTeam(state, teamId) {
  return scoringMembers(state && state.members).filter((m) => memberOnTeam(m, teamId)).length;
}

function sortedTeams(state) {
  return [...((state && state.teams) || [])].sort((a, b) => {
    const sa = a.sortOrder ?? a.sort_order ?? 0;
    const sb = b.sortOrder ?? b.sort_order ?? 0;
    return sa - sb || Number(a.id) - Number(b.id);
  });
}

function isTeamShort(state, team, fullSize) {
  if (!team) return false;
  const size = Number(fullSize) > 0 ? Number(fullSize) : TEAM_FILL_SIZE;
  const count = scoringCountOnTeam(state, team.id);
  return count > 0 && count < size;
}

function shortTeams(state, fullSize) {
  const size = Number(fullSize) > 0 ? Number(fullSize) : TEAM_FILL_SIZE;
  return sortedTeams(state)
    .map((team) => ({ team, count: scoringCountOnTeam(state, team.id) }))
    .filter((row) => row.count > 0 && row.count < size)
    .sort((a, b) => a.count - b.count || (a.team.sortOrder ?? a.team.sort_order ?? 0) - (b.team.sortOrder ?? b.team.sort_order ?? 0))
    .map((row) => row.team);
}

function hasShortTeam(state, fullSize) {
  return shortTeams(state, fullSize).length > 0;
}

function defaultShortTeam(state, fullSize) {
  const short = shortTeams(state, fullSize);
  if (short.length) return short[0];
  const teams = sortedTeams(state);
  return teams[0] || null;
}

function fillCandidates(state, targetTeamId) {
  return scoringMembers(state && state.members).filter((m) => !memberOnTeam(m, targetTeamId));
}

function candidateKey(item) {
  if (item && item.memberId != null) return 'm:' + item.memberId;
  if (item && item.id != null && item.memberId === undefined && !item.extra) return 'm:' + item.id;
  return 'n:' + String((item && (item.name || item.display_name)) || '').trim().toLowerCase();
}

function includedCandidates(candidates, excludedKeys) {
  const skip = excludedKeys instanceof Set ? excludedKeys : new Set(excludedKeys || []);
  return (candidates || []).filter((item) => {
    const name = String((item && (item.name || item.display_name)) || '').trim();
    if (!name) return false;
    return !skip.has(candidateKey(item));
  });
}

function clampUnit(roll) {
  const n = Number(roll);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), 0.999999999);
}

function fairUnit() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  return Math.random();
}

function fairIndex(n, randomFn) {
  const size = Math.floor(Number(n));
  if (size <= 1) return 0;
  if (typeof randomFn === 'function') {
    return Math.floor(clampUnit(randomFn()) * size);
  }
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const max = 0x100000000;
    const limit = max - (max % size);
    const buf = new Uint32Array(1);
    let x;
    do {
      crypto.getRandomValues(buf);
      x = buf[0];
    } while (x >= limit);
    return x % size;
  }
  return Math.floor(clampUnit(Math.random()) * size);
}

function shuffleFillPool(candidates, randomFn) {
  const list = (candidates || []).slice();
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = fairIndex(i + 1, randomFn);
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

function pickFillWinner(candidates, excludedKeys, randomFn) {
  const pool = includedCandidates(candidates, excludedKeys);
  if (!pool.length) return null;
  const shuffled = shuffleFillPool(pool, randomFn);
  return shuffled[0] || null;
}

function teamOfMember(state, member) {
  if (!member) return null;
  return ((state && state.teams) || []).find((t) => sameTeamIds(t.id, member.team_id ?? member.teamId)) || null;
}

const teamFillApi = {
  TEAM_FILL_SIZE,
  hasShortTeam,
  isTeamShort,
  isFollowAlongMember,
  scoringMembers,
  scoringCountOnTeam,
  sortedTeams,
  shortTeams,
  defaultShortTeam,
  fillCandidates,
  candidateKey,
  includedCandidates,
  fairUnit,
  fairIndex,
  shuffleFillPool,
  pickFillWinner,
  teamDisplay,
  teamOfMember,
  sameTeamIds,
  memberTeamIds,
  memberOnTeam,
};

if (typeof module === 'object' && module.exports) {
  module.exports = teamFillApi;
}
if (typeof window !== 'undefined') {
  window.teamFillSpin = teamFillApi;
}
