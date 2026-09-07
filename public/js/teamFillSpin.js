/**
 * Team fill spin — pick one leftover golfer for a short team.
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

function teamDisplay(team) {
  if (!team) return 'Unassigned';
  const nick = team.nickname || team.teamNickname;
  return nick ? `${team.name} · ${nick}` : String(team.name || 'Team');
}

function scoringCountOnTeam(state, teamId) {
  return scoringMembers(state && state.members).filter((m) => sameTeamIds(m.team_id ?? m.teamId, teamId)).length;
}

function sortedTeams(state) {
  return [...((state && state.teams) || [])].sort((a, b) => {
    const sa = a.sortOrder ?? a.sort_order ?? 0;
    const sb = b.sortOrder ?? b.sort_order ?? 0;
    return sa - sb || Number(a.id) - Number(b.id);
  });
}

function hasShortTeam(state, fullSize) {
  const size = Number(fullSize) > 0 ? Number(fullSize) : TEAM_FILL_SIZE;
  const short = defaultShortTeam(state, size);
  if (!short) return false;
  return scoringCountOnTeam(state, short.id) < size;
}

function defaultShortTeam(state, fullSize) {
  const size = Number(fullSize) > 0 ? Number(fullSize) : TEAM_FILL_SIZE;
  const teams = sortedTeams(state);
  if (!teams.length) return null;
  const ranked = teams.map((team) => ({
    team,
    count: scoringCountOnTeam(state, team.id),
  }));
  const short = ranked.filter((row) => row.count < size);
  const pool = short.length ? short : ranked;
  pool.sort((a, b) => a.count - b.count || (a.team.sortOrder ?? a.team.sort_order ?? 0) - (b.team.sortOrder ?? b.team.sort_order ?? 0));
  return pool[0].team;
}

function fillCandidates(state, targetTeamId) {
  return scoringMembers(state && state.members).filter((m) => !sameTeamIds(m.team_id ?? m.teamId, targetTeamId));
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

function fairUnit() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  return Math.random();
}

function pickFillWinner(candidates, excludedKeys, randomFn) {
  const pool = includedCandidates(candidates, excludedKeys);
  if (!pool.length) return null;
  const roll = typeof randomFn === 'function' ? Number(randomFn()) : fairUnit();
  const unit = Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 0.999999999) : 0;
  return pool[Math.floor(unit * pool.length)] || null;
}

function teamOfMember(state, member) {
  if (!member) return null;
  return ((state && state.teams) || []).find((t) => sameTeamIds(t.id, member.team_id ?? member.teamId)) || null;
}

const GOT_BEER_DEFAULT = false;

function isGotBeerOn(options) {
  if (GOT_BEER_DEFAULT === true) return true;
  const round = options && options.round;
  if (round && (round.gotBeer === true || round.got_beer === 1 || round.got_beer === true)) return true;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('goldendale_got_beer') === '1') return true;
  } catch { /* ignore */ }
  const href = options && options.href != null
    ? String(options.href)
    : (typeof location !== 'undefined' ? String(location.search || '') + String(location.hash || '') : '');
  return /(?:[?&#]gotBeer=1)(?:&|$)/.test(href);
}

const teamFillApi = {
  TEAM_FILL_SIZE,
  GOT_BEER_DEFAULT,
  isGotBeerOn,
  hasShortTeam,
  isFollowAlongMember,
  scoringMembers,
  scoringCountOnTeam,
  sortedTeams,
  defaultShortTeam,
  fillCandidates,
  candidateKey,
  includedCandidates,
  fairUnit,
  pickFillWinner,
  teamDisplay,
  teamOfMember,
  sameTeamIds,
};

if (typeof module === 'object' && module.exports) {
  module.exports = teamFillApi;
}
if (typeof window !== 'undefined') {
  window.teamFillSpin = teamFillApi;
}
