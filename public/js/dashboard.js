/**
 * Dashboard View — tournament overview, current round, schedule, quick stats
 */
const dashboard = {

  async render() {
    const container = document.getElementById('app');
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Loading dashboard...</div>';

    try {
      const user = auth.currentUser;

      // Fetch ALL data in parallel for speed
      const fetches = [
        api.get('/api/rounds').catch(() => []),
        api.get('/api/players').catch(() => []),
        api.get('/api/leaderboard').catch(() => [])
      ];
      if (user) {
        fetches.push(api.get('/api/matches?player=' + user.id).catch(() => []));
      }

      const results = await Promise.all(fetches);
      const rounds = results[0] || [];
      const players = results[1] || [];
      const leaderboard = results[2] || [];
      let myMatches = user ? (results[3] || []) : [];

      const activeRound = rounds.find(function (r) { return r.status === 'active'; });
      const upcomingRounds = rounds.filter(function (r) { return r.status === 'upcoming' || r.status === 'pending'; });
      const completedRounds = rounds.filter(function (r) { return r.status === 'completed'; });

      const myCompletedMatches = myMatches.filter(function (m) { return m.status === 'completed' || m.status === 'finalized'; });
      const myWins = myCompletedMatches.filter(function (m) { return m.winner_id === (user && user.id); }).length;
      const myLosses = myCompletedMatches.filter(function (m) { return m.winner_id && m.winner_id !== (user && user.id); }).length;
      const myHalves = myCompletedMatches.filter(function (m) { return !m.winner_id; }).length;

      // Course names by round number
      var courseColors = ['round-accent-1', 'round-accent-2', 'round-accent-3', 'round-accent-4', 'round-accent-5'];

      var html = '';

      // Hero
      html += '<div class="welcome-hero">';
      html += '  <div class="hero-clubs">';
      // Left club — Driver
      html += '    <svg class="hero-club hero-club-left" viewBox="0 0 24 120" width="24" height="120" aria-hidden="true">';
      html += '      <line x1="12" y1="8" x2="12" y2="90" stroke="#d4d4d4" stroke-width="2.2" stroke-linecap="round"/>';
      html += '      <line x1="10.5" y1="10" x2="13.5" y2="12" stroke="#aaa" stroke-width="0.7"/>';
      html += '      <line x1="10.5" y1="14" x2="13.5" y2="16" stroke="#aaa" stroke-width="0.7"/>';
      html += '      <line x1="10.5" y1="18" x2="13.5" y2="20" stroke="#aaa" stroke-width="0.7"/>';
      html += '      <ellipse cx="12" cy="98" rx="10" ry="14" fill="#b0b0b0" stroke="#888" stroke-width="0.8"/>';
      html += '      <line x1="5" y1="95" x2="19" y2="95" stroke="#999" stroke-width="0.4"/>';
      html += '      <line x1="4" y1="98" x2="20" y2="98" stroke="#999" stroke-width="0.4"/>';
      html += '      <line x1="5" y1="101" x2="19" y2="101" stroke="#999" stroke-width="0.4"/>';
      html += '    </svg>';
      // Right club — Iron
      html += '    <svg class="hero-club hero-club-right" viewBox="0 0 24 120" width="24" height="120" aria-hidden="true">';
      html += '      <line x1="12" y1="8" x2="12" y2="90" stroke="#d4d4d4" stroke-width="2.2" stroke-linecap="round"/>';
      html += '      <line x1="10.5" y1="10" x2="13.5" y2="12" stroke="#aaa" stroke-width="0.7"/>';
      html += '      <line x1="10.5" y1="14" x2="13.5" y2="16" stroke="#aaa" stroke-width="0.7"/>';
      html += '      <line x1="10.5" y1="18" x2="13.5" y2="20" stroke="#aaa" stroke-width="0.7"/>';
      html += '      <path d="M6 90 L12 90 L14 91 L14 104 L10 106 L6 104 Z" fill="#b0b0b0" stroke="#888" stroke-width="0.6"/>';
      html += '      <rect x="11" y="88" width="2.5" height="3" rx="0.5" fill="#999"/>';
      html += '      <line x1="7" y1="94" x2="13" y2="94" stroke="#777" stroke-width="0.4"/>';
      html += '      <line x1="7" y1="97" x2="13" y2="97" stroke="#777" stroke-width="0.4"/>';
      html += '      <line x1="7" y1="100" x2="13" y2="100" stroke="#777" stroke-width="0.4"/>';
      html += '    </svg>';
      html += '  </div>';
      html += '  <div class="welcome-title">' + (user ? ('Welcome back, ' + _esc(user.name || 'Player')) : 'Bandon Dunes Retreat') + '</div>';
      html += '  <div class="welcome-subtitle">8 Players &middot; 5 Rounds &middot; 10 Matches Per Player</div>';
      html += '  <div class="welcome-actions">';
      html += '    <a href="#leaderboard" class="btn btn-accent btn-sm" onclick="event.preventDefault();app.navigate(\'#leaderboard\')">Leaderboard</a>';
      html += '    <a href="#rounds" class="btn btn-outline-light btn-sm" onclick="event.preventDefault();app.navigate(\'#rounds\')">View Rounds</a>';
      if (players.length < 8) {
        html += '  <button class="btn btn-outline-light btn-sm" onclick="auth.showModal(\'register\')">&#43; Add Player</button>';
      }
      if (!user) {
        html += '  <button class="btn btn-outline-light btn-sm" onclick="auth.showModal(\'login\')">Sign In</button>';
      }
      html += '  </div>';
      html += '</div>';

      // Admin bar
      if (user && user.is_admin) {
        html += '<div class="admin-bar admin-only" style="display:flex">';
        html += '  <span class="admin-bar-label">Admin Controls</span>';
        html += '  <button class="btn btn-accent btn-sm" onclick="dashboard.generateAll()">Generate All Rounds</button>';
        html += '</div>';
      }

      // Stats row (only for logged-in user)
      if (user) {
        html += '<div class="stats-row">';
        html += '  <div class="stat-card"><div class="stat-value">' + players.length + '</div><div class="stat-label">Players</div></div>';
        html += '  <div class="stat-card"><div class="stat-value">' + completedRounds.length + '/' + rounds.length + '</div><div class="stat-label">Rounds</div></div>';
        html += '  <div class="stat-card"><div class="stat-value">' + myWins + '-' + myLosses + '-' + myHalves + '</div><div class="stat-label">W-L-H</div></div>';
        html += '  <div class="stat-card"><div class="stat-value">' + myCompletedMatches.length + '</div><div class="stat-label">Played</div></div>';
        html += '</div>';
      }

      // Active round
      if (activeRound) {
        html += '<div class="section-title">Now Playing</div>';
        html += '<div class="round-card card-clickable" onclick="app.navigate(\'#round/' + activeRound.id + '\')">';
        html += '  <div class="round-accent ' + courseColors[((activeRound.round_number || 1) - 1) % 5] + '"></div>';
        html += '  <div style="padding-left:12px">';
        html += '    <div class="round-number">Round ' + activeRound.round_number + '</div>';
        html += '    <div class="round-course">' + _esc(_courseName(activeRound)) + '</div>';
        html += '    <span class="badge badge-active">Active</span>';
        html += '  </div>';
        html += '</div>';
      }

      // My upcoming matches
      if (user && myMatches.length > 0) {
        var pendingMatches = myMatches.filter(function (m) { return m.status === 'active' || m.status === 'pending'; });
        if (pendingMatches.length > 0) {
          html += '<div class="section-title mt-lg">My Upcoming Matches</div>';
          html += '<div class="grid grid-2">';
          pendingMatches.slice(0, 4).forEach(function (m) {
            var opponent = (m.player1_id === user.id) ? (m.player2_name || 'TBD') : (m.player1_name || 'TBD');
            var half = m.half || '';
            html += '<div class="card card-clickable" onclick="app.navigate(\'#match/' + m.id + '\')">';
            html += '  <div class="card-subtitle">Round ' + (m.round_number || '') + (half ? ' &middot; ' + _esc(half) : '') + '</div>';
            html += '  <div class="card-title">' + _esc(opponent) + '</div>';
            html += '  <span class="badge badge-' + m.status + '">' + _esc(m.status) + '</span>';
            html += '</div>';
          });
          html += '</div>';
        }
      }

      // Round schedule
      if (rounds.length > 0) {
        html += '<div class="section-title mt-lg">Round Schedule</div>';
        html += '<div class="grid grid-2">';
        rounds.forEach(function (r, idx) {
          html += '<div class="round-card card-clickable" onclick="app.navigate(\'#round/' + r.id + '\')">';
          html += '  <div class="round-accent ' + courseColors[idx % 5] + '"></div>';
          html += '  <div style="padding-left:12px">';
          html += '    <div class="round-number">Round ' + r.round_number + '</div>';
          html += '    <div class="round-course">' + _esc(_courseName(r)) + '</div>';
          html += '    <span class="badge badge-' + r.status + '">' + _esc(r.status) + '</span>';
          html += '  </div>';
          html += '</div>';
        });
        html += '</div>';
      }

      // Quick leaderboard preview
      if (leaderboard.length > 0) {
        html += '<div class="section-title mt-lg">Standings</div>';
        html += '<div class="card">';
        html += '<div class="leaderboard-wrapper">';
        html += '<table class="leaderboard-table">';
        html += '<thead><tr><th>#</th><th>Player</th><th>W</th><th>L</th><th>H</th><th>Pts</th></tr></thead>';
        html += '<tbody>';
        leaderboard.slice(0, 5).forEach(function (p, i) {
          var isCurrent = user && (p.player_id === user.id || p.id === user.id);
          var rankClass = (i < 3) ? ' rank-' + (i + 1) : '';
          html += '<tr class="' + rankClass + (isCurrent ? ' current-user' : '') + '">';
          html += '  <td class="rank-cell">' + (i + 1) + '</td>';
          html += '  <td class="player-cell">' + _esc(p.name || p.player_name || '') + '</td>';
          html += '  <td class="numeric-cell">' + (p.wins || 0) + '</td>';
          html += '  <td class="numeric-cell">' + (p.losses || 0) + '</td>';
          html += '  <td class="numeric-cell">' + (p.halves || 0) + '</td>';
          html += '  <td class="points-cell">' + (p.points || 0) + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table></div>';
        html += '<div class="card-footer"><a href="#leaderboard" class="btn btn-secondary btn-sm" onclick="event.preventDefault();app.navigate(\'#leaderboard\')">Full Leaderboard</a></div>';
        html += '</div>';
      }

      // Signed-out prompt
      if (!user) {
        html += '<div class="empty-state mt-lg">';
        html += '  <div class="empty-state-icon">&#9971;</div>';
        html += '  <h3>Join the Championship</h3>';
        html += '  <p>Sign in to view your matches and enter scores from the course.</p>';
        html += '  <button class="btn btn-primary mt-md" onclick="auth.showModal(\'login\')">Sign In</button>';
        html += '</div>';
      }

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><h3>Error loading dashboard</h3><p>' + _esc(err.message) + '</p></div>';
    }
  },

  /**
   * Admin: generate schedule for all rounds
   */
  async generateAll() {
    if (!confirm('Generate the full tournament schedule? This will create all rounds, foursomes, and matches.')) return;
    try {
      await api.post('/api/rounds/generate-all');
      _toast('Schedule generated successfully!', 'success');
      this.render();
    } catch (err) {
      _toast('Error: ' + err.message, 'error');
    }
  }
};

/* ---- Helper: extract course name ---- */
function _courseName(round) {
  if (round.course) return round.course;
  if (round.name) {
    var parts = round.name.split(' - ');
    return parts.length > 1 ? parts.slice(1).join(' - ') : round.name;
  }
  return 'Course ' + round.round_number;
}

/* ---- Helper: HTML-escape ---- */
function _esc(str) {
  if (str === null || str === undefined) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

/* ---- Helper: toast notification ---- */
function _toast(message, type) {
  var existing = document.querySelector('.toast');
  if (existing) existing.remove();

  var el = document.createElement('div');
  el.className = 'toast' + (type ? ' toast-' + type : '');
  el.textContent = message;
  document.body.appendChild(el);

  setTimeout(function () {
    if (el.parentNode) el.remove();
  }, 3000);
}

window.dashboard = dashboard;
window._esc = _esc;
window._toast = _toast;
window._courseName = _courseName;
