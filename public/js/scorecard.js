/**
 * Scorecard + Round Detail + Challenge Views
 */
const scorecard = {

  /* ===================================================================
     ROUND PAGE
     =================================================================== */
  async renderRound(roundId) {
    const container = document.getElementById('app');
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Loading round...</div>';

    try {
      const [round, matches, players, challenges] = await Promise.all([
        api.get(`/api/rounds/${roundId}`),
        api.get(`/api/matches?round=0`).catch(() => []),
        api.get('/api/players').catch(() => []),
        api.get(`/api/challenges?round=${roundId}`).catch(() => []),
      ]);

      // Re-fetch matches with correct round_number
      const roundMatches = await api.get(`/api/matches?round=${round.round_number}`).catch(() => []);
      const frontMatches = roundMatches.filter(m => m.half === 'front');
      const backMatches = roundMatches.filter(m => m.half === 'back');

      let html = '';

      // Back link
      html += '<div style="margin-bottom:1rem">';
      html += '  <a href="#dashboard" onclick="event.preventDefault();app.navigate(\'#dashboard\')" style="color:var(--primary);text-decoration:none;font-size:0.85rem">&larr; Back to Dashboard</a>';
      html += '</div>';

      // Round header
      html += '<div class="card">';
      html += '  <h2 style="color:var(--primary)">' + _esc(round.name) + '</h2>';
      html += '  <p style="color:var(--text-light)">';
      html += '    ' + _esc(round.course_name || '') + ' &bull; ' + (round.num_holes || 18) + ' holes &bull; Par ' + (round.course_par || 72);
      html += '  </p>';
      html += '  <span class="badge badge-' + round.status + '">' + _esc(round.status) + '</span>';
      if (auth.currentUser?.is_admin && round.status === 'upcoming') {
        html += '  <button class="btn btn-sm btn-primary" style="margin-left:0.5rem" onclick="scorecard.activateRound(' + round.id + ')">Activate Round</button>';
      }
      if (auth.currentUser?.is_admin && round.status === 'active') {
        html += '  <button class="btn btn-sm btn-secondary" style="margin-left:0.5rem" onclick="scorecard.completeRound(' + round.id + ')">Complete Round</button>';
      }
      html += '</div>';

      // Challenge section
      if (auth.currentUser) {
        html += '<div class="card challenge-setup-card">';
        html += '  <div class="card-header"><span class="card-title">Create Challenge</span></div>';
        html += '  <p style="color:var(--text-light);font-size:0.85rem;margin-bottom:1rem">Set up a head-to-head match between two players for this round.</p>';
        html += '  <div class="challenge-form">';
        html += '    <div class="challenge-player-select">';
        html += '      <label>Player 1</label>';
        html += '      <select id="challenge-p1">';
        html += '        <option value="">Select player...</option>';
        players.forEach(function (p) {
          html += '        <option value="' + p.id + '">' + _esc(p.name) + ' (' + p.handicap + ')</option>';
        });
        html += '      </select>';
        html += '    </div>';
        html += '    <div class="challenge-vs">VS</div>';
        html += '    <div class="challenge-player-select">';
        html += '      <label>Player 2</label>';
        html += '      <select id="challenge-p2">';
        html += '        <option value="">Select player...</option>';
        players.forEach(function (p) {
          html += '        <option value="' + p.id + '">' + _esc(p.name) + ' (' + p.handicap + ')</option>';
        });
        html += '      </select>';
        html += '    </div>';
        html += '    <button class="btn btn-primary" onclick="scorecard.createChallenge(' + round.id + ')">Start Challenge</button>';
        html += '  </div>';
        html += '</div>';
      }

      // Existing challenges
      if (challenges.length > 0) {
        html += '<h2 class="section-title">Challenges</h2>';
        challenges.forEach(function (c) {
          var statusCls = c.status === 'completed' ? 'badge-completed' : 'badge-active';
          html += '<div class="match-card" onclick="app.navigate(\'#challenge/' + c.id + '\')">';
          html += '  <div class="half-label">18-Hole Challenge</div>';
          html += '  <div class="players">';
          html += '    <span>' + _esc(c.player1_name) + ' (' + c.player1_handicap + ')</span>';
          html += '    <span class="vs">vs</span>';
          html += '    <span>' + _esc(c.player2_name) + ' (' + c.player2_handicap + ')</span>';
          html += '  </div>';
          html += '  <div style="margin-top:0.5rem"><span class="badge ' + statusCls + '">' + _esc(c.status) + '</span></div>';
          html += '</div>';
        });
      }

      // Foursomes
      if (round.foursomes && round.foursomes.length > 0) {
        html += '<h2 class="section-title">Foursomes</h2>';
        html += '<div class="grid grid-2">';
        round.foursomes.forEach(function (f) {
          html += '<div class="foursome-card">';
          html += '  <div class="group-label">Group ' + _esc(f.group_label) + '</div>';
          html += '  <div class="player-list">';
          if (f.players) f.players.forEach(function (p) {
            html += '    <span class="player-pill">' + _esc(p.name) + ' (' + p.handicap + ')</span>';
          });
          html += '  </div>';
          html += '</div>';
        });
        html += '</div>';
      } else {
        html += '<div class="empty-state"><p>Schedule not yet generated for this round.</p></div>';
      }

      // Front 9 matches
      if (frontMatches.length > 0) {
        html += '<h2 class="section-title">Front 9 Matches</h2>';
        frontMatches.forEach(function (m) { html += scorecard.renderMatchCard(m); });
      }

      // Back 9 matches
      if (backMatches.length > 0) {
        html += '<h2 class="section-title">Back 9 Matches</h2>';
        backMatches.forEach(function (m) { html += scorecard.renderMatchCard(m); });
      }

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><h3>Error</h3><p>' + _esc(err.message) + '</p></div>';
    }
  },

  async createChallenge(roundId) {
    var p1 = document.getElementById('challenge-p1')?.value;
    var p2 = document.getElementById('challenge-p2')?.value;
    if (!p1 || !p2) { alert('Please select both players.'); return; }
    if (p1 === p2) { alert('Please select two different players.'); return; }

    try {
      var result = await api.post('/api/challenges', {
        round_id: roundId,
        player1_id: parseInt(p1),
        player2_id: parseInt(p2),
      });
      app.navigate('#challenge/' + result.id);
    } catch (err) {
      alert('Error creating challenge: ' + err.message);
    }
  },

  renderMatchCard(m) {
    var statusBadge = m.status === 'completed'
      ? (m.result_text ? '<span class="badge badge-completed">' + _esc(m.result_text) + '</span>' : '')
      : '<span class="badge badge-' + m.status + '">' + _esc(m.status) + '</span>';
    var winner = m.winner_id === m.player1_id ? m.player1_name : m.winner_id === m.player2_id ? m.player2_name : null;

    var html = '<div class="match-card" onclick="app.navigate(\'#match/' + m.id + '\')">';
    html += '  <div class="half-label">' + _esc(m.half) + ' 9</div>';
    html += '  <div class="players">';
    html += '    <span' + (m.winner_id === m.player1_id ? ' style="color:var(--success)"' : '') + '>' + _esc(m.player1_name) + ' (' + m.player1_handicap + ')</span>';
    html += '    <span class="vs">vs</span>';
    html += '    <span' + (m.winner_id === m.player2_id ? ' style="color:var(--success)"' : '') + '>' + _esc(m.player2_name) + ' (' + m.player2_handicap + ')</span>';
    html += '  </div>';
    html += '  <div style="margin-top:0.5rem">' + statusBadge + (winner ? ' <span style="font-size:0.8rem;color:var(--text-light)">' + _esc(winner) + ' wins</span>' : '') + '</div>';
    html += '</div>';
    return html;
  },

  /* ===================================================================
     EXISTING MATCH PAGE (9-hole tournament match)
     =================================================================== */
  async renderMatch(matchId) {
    const container = document.getElementById('app');
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Loading match...</div>';

    try {
      const match = await api.get(`/api/matches/${matchId}`);
      const isParticipant = auth.currentUser && (auth.currentUser.id === match.player1_id || auth.currentUser.id === match.player2_id);
      const canEdit = (isParticipant || auth.currentUser?.is_admin) && match.status !== 'completed';
      const startHole = match.half === 'front' ? 1 : 10;
      const endHole = match.half === 'front' ? 9 : 18;
      const holeNumbers = [];
      for (let h = startHole; h <= endHole; h++) holeNumbers.push(h);

      const holeData = {};
      (match.holes || []).forEach(h => { holeData[h.hole_number] = h; });

      let courseHoles = {};
      try {
        const roundData = await api.get(`/api/rounds/${match.round_id}`);
        if (roundData.course_holes) roundData.course_holes.forEach(h => { courseHoles[h.hole_number] = h; });
      } catch {}

      let runningScore = 0;
      const runningScores = {};
      holeNumbers.forEach(h => {
        const d = holeData[h];
        if (d) {
          if (d.hole_winner_id === match.player1_id) runningScore++;
          else if (d.hole_winner_id === match.player2_id) runningScore--;
        }
        runningScores[h] = runningScore;
      });

      const stateText = match.current_state?.status_text || 'Not started';

      let html = '';
      html += '<div style="margin-bottom:1rem">';
      html += '  <a href="#round/' + match.round_id + '" onclick="event.preventDefault();app.navigate(\'#round/' + match.round_id + '\')" style="color:var(--primary);text-decoration:none;font-size:0.85rem">&larr; Back to Round</a>';
      html += '</div>';

      // Header card
      html += '<div class="card" style="text-align:center">';
      html += '  <div style="font-size:0.75rem;color:var(--text-light);text-transform:uppercase;letter-spacing:1px">' + _esc(match.round_name || 'Round') + ' &bull; ' + _esc(match.half) + ' 9</div>';
      html += '  <div style="display:flex;justify-content:center;align-items:center;gap:1.5rem;margin:1rem 0">';
      html += '    <div><div style="font-size:1.3rem;font-weight:700">' + _esc(match.player1_name) + '</div><div style="font-size:0.8rem;color:var(--text-light)">Handicap: ' + match.player1_handicap + '</div></div>';
      html += '    <div style="font-size:0.9rem;color:var(--text-muted);font-weight:600">VS</div>';
      html += '    <div><div style="font-size:1.3rem;font-weight:700">' + _esc(match.player2_name) + '</div><div style="font-size:0.8rem;color:var(--text-light)">Handicap: ' + match.player2_handicap + '</div></div>';
      html += '  </div>';
      html += '  <div class="match-result ' + (match.status === 'completed' ? (match.winner_id ? 'won' : 'halved') : '') + '">' + _esc(match.result_text || stateText) + '</div>';
      if (match.handicap_strokes > 0) {
        html += '  <div style="font-size:0.8rem;color:var(--text-light);margin-top:0.5rem">' + _esc(match.strokes_receiver === 'player1' ? match.player1_name : match.player2_name) + ' receives ' + match.handicap_strokes + ' stroke' + (match.handicap_strokes > 1 ? 's' : '') + '</div>';
      }
      html += '</div>';

      // Scorecard
      html += '<div class="card">';
      html += '  <div class="card-header"><span class="card-title">Scorecard</span></div>';
      html += '  <div class="scorecard-wrapper">';
      html += '    <table class="scorecard">';
      html += '      <thead><tr><th>Hole</th>';
      holeNumbers.forEach(function (h) { html += '<th>' + h + '</th>'; });
      html += '<th>Total</th></tr></thead>';
      html += '      <tbody>';

      // Par row
      html += '<tr class="row-par"><td class="row-label">Par</td>';
      holeNumbers.forEach(function (h) { html += '<td>' + (courseHoles[h]?.par || holeData[h]?.par || '-') + '</td>'; });
      html += '<td>' + holeNumbers.reduce(function (s, h) { return s + (courseHoles[h]?.par || holeData[h]?.par || 0); }, 0) + '</td></tr>';

      // SI row
      html += '<tr class="row-par"><td class="row-label">SI</td>';
      holeNumbers.forEach(function (h) {
        var si = courseHoles[h]?.stroke_index || holeData[h]?.stroke_index || '-';
        var isStroke = match.stroke_holes?.includes(h);
        html += '<td class="' + (isStroke ? 'stroke-cell' : '') + '">' + si + '</td>';
      });
      html += '<td></td></tr>';

      // Distance row
      html += '<tr class="row-par"><td class="row-label">Yds</td>';
      holeNumbers.forEach(function (h) {
        html += '<td>' + (courseHoles[h]?.distance || '-') + '</td>';
      });
      var totalYds = holeNumbers.reduce(function (s, h) { return s + (courseHoles[h]?.distance || 0); }, 0);
      html += '<td>' + (totalYds || '-') + '</td></tr>';

      // Player 1 scores
      html += '<tr class="row-player"><td class="row-label">' + _esc(match.player1_name) + '</td>';
      holeNumbers.forEach(function (h) {
        var d = holeData[h];
        var isStroke = match.strokes_receiver === 'player1' && match.stroke_holes?.includes(h);
        var cls = d ? (d.hole_winner_id === match.player1_id ? 'sc-win' : d.hole_winner_id === match.player2_id ? 'sc-loss' : d.hole_winner_id === null && d.player1_strokes ? 'sc-halve' : '') : '';
        if (canEdit) {
          html += '<td class="' + cls + ' ' + (isStroke ? 'stroke-cell' : '') + '"><input type="number" class="score-input" inputmode="numeric" pattern="[0-9]*" min="1" max="12" value="' + (d?.player1_strokes || '') + '" data-hole="' + h + '" data-player="1" onchange="scorecard.saveScore(' + matchId + ', ' + h + ', this)"></td>';
        } else {
          html += '<td class="' + cls + ' ' + (isStroke ? 'stroke-cell' : '') + '">' + (d?.player1_strokes || '-') + '</td>';
        }
      });
      var p1Total = Object.values(holeData).reduce(function (s, h) { return s + (h.player1_strokes || 0); }, 0);
      html += '<td style="font-weight:700">' + (p1Total || '-') + '</td></tr>';

      // Player 2 scores
      html += '<tr class="row-player"><td class="row-label">' + _esc(match.player2_name) + '</td>';
      holeNumbers.forEach(function (h) {
        var d = holeData[h];
        var isStroke = match.strokes_receiver === 'player2' && match.stroke_holes?.includes(h);
        var cls = d ? (d.hole_winner_id === match.player2_id ? 'sc-win' : d.hole_winner_id === match.player1_id ? 'sc-loss' : d.hole_winner_id === null && d.player2_strokes ? 'sc-halve' : '') : '';
        if (canEdit) {
          html += '<td class="' + cls + ' ' + (isStroke ? 'stroke-cell' : '') + '"><input type="number" class="score-input" inputmode="numeric" pattern="[0-9]*" min="1" max="12" value="' + (d?.player2_strokes || '') + '" data-hole="' + h + '" data-player="2" onchange="scorecard.saveScore(' + matchId + ', ' + h + ', this)"></td>';
        } else {
          html += '<td class="' + cls + ' ' + (isStroke ? 'stroke-cell' : '') + '">' + (d?.player2_strokes || '-') + '</td>';
        }
      });
      var p2Total = Object.values(holeData).reduce(function (s, h) { return s + (h.player2_strokes || 0); }, 0);
      html += '<td style="font-weight:700">' + (p2Total || '-') + '</td></tr>';

      // Result row
      html += '<tr class="row-result"><td class="row-label">Result</td>';
      holeNumbers.forEach(function (h) {
        var d = holeData[h];
        if (!d || !d.player1_strokes) { html += '<td>-</td>'; return; }
        if (d.hole_winner_id === match.player1_id) html += '<td class="sc-win">W</td>';
        else if (d.hole_winner_id === match.player2_id) html += '<td class="sc-loss">L</td>';
        else html += '<td class="sc-halve">H</td>';
      });
      html += '<td></td></tr>';

      // Status row
      html += '<tr class="row-status"><td class="row-label">Status</td>';
      holeNumbers.forEach(function (h) {
        var s = runningScores[h];
        if (s === undefined || !holeData[h]) { html += '<td>-</td>'; return; }
        if (s > 0) html += '<td class="sc-up">' + s + 'UP</td>';
        else if (s < 0) html += '<td class="sc-dn">' + Math.abs(s) + 'DN</td>';
        else html += '<td class="sc-as">AS</td>';
      });
      html += '<td></td></tr>';

      html += '</tbody></table></div>';

      if (canEdit) {
        html += '<div style="text-align:center;margin-top:1rem"><button class="btn btn-primary" onclick="scorecard.finalizeMatch(' + matchId + ')">Finalize Match</button></div>';
      }
      html += '</div>';

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><h3>Error</h3><p>' + _esc(err.message) + '</p></div>';
    }
  },

  /* ===================================================================
     CHALLENGE SCORECARD (full 18-hole head-to-head)
     =================================================================== */
  async renderChallenge(challengeId) {
    const container = document.getElementById('app');
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Loading challenge...</div>';

    try {
      const ch = await api.get('/api/challenges/' + challengeId);
      const isParticipant = auth.currentUser && (auth.currentUser.id === ch.player1_id || auth.currentUser.id === ch.player2_id);
      const canEdit = (isParticipant || auth.currentUser?.is_admin) && ch.status !== 'completed';

      // Build course holes map
      const courseHoles = {};
      (ch.course_holes || []).forEach(function (h) { courseHoles[h.hole_number] = h; });

      // Build hole data map
      const holeData = {};
      (ch.holes || []).forEach(function (h) { holeData[h.hole_number] = h; });

      // Build signatures map
      const sigs = {};
      (ch.signatures || []).forEach(function (s) {
        if (!sigs[s.nine]) sigs[s.nine] = [];
        sigs[s.nine].push(s);
      });

      // Running scores
      let runningScore = 0;
      const runningScores = {};
      for (let h = 1; h <= 18; h++) {
        var d = holeData[h];
        if (d) {
          if (d.hole_winner_id === ch.player1_id) runningScore++;
          else if (d.hole_winner_id === ch.player2_id) runningScore--;
        }
        runningScores[h] = runningScore;
      }

      // Count scored holes per nine
      let frontScored = 0, backScored = 0;
      for (let h = 1; h <= 9; h++) if (holeData[h]?.player1_strokes) frontScored++;
      for (let h = 10; h <= 18; h++) if (holeData[h]?.player1_strokes) backScored++;

      // Check if current user already signed
      const myFrontSig = (sigs.front || []).find(function (s) { return s.player_id === auth.currentUser?.id; });
      const myBackSig = (sigs.back || []).find(function (s) { return s.player_id === auth.currentUser?.id; });

      let html = '';

      // Back link
      html += '<div style="margin-bottom:1rem">';
      html += '  <a href="#round/' + ch.round_id + '" onclick="event.preventDefault();app.navigate(\'#round/' + ch.round_id + '\')" style="color:var(--primary);text-decoration:none;font-size:0.85rem">&larr; Back to Round</a>';
      html += '</div>';

      // Header card
      html += '<div class="card" style="text-align:center">';
      html += '  <div style="font-size:0.75rem;color:var(--text-light);text-transform:uppercase;letter-spacing:1px">' + _esc(ch.round_name) + ' &bull; 18-Hole Challenge</div>';
      html += '  <div style="display:flex;justify-content:center;align-items:center;gap:1.5rem;margin:1rem 0">';
      html += '    <div><div style="font-size:1.3rem;font-weight:700">' + _esc(ch.player1_name) + '</div><div style="font-size:0.8rem;color:var(--text-light)">Handicap: ' + ch.player1_handicap + '</div></div>';
      html += '    <div style="font-size:0.9rem;color:var(--text-muted);font-weight:600">VS</div>';
      html += '    <div><div style="font-size:1.3rem;font-weight:700">' + _esc(ch.player2_name) + '</div><div style="font-size:0.8rem;color:var(--text-light)">Handicap: ' + ch.player2_handicap + '</div></div>';
      html += '  </div>';

      // Overall match status
      var ts = ch.total_score;
      var statusText = ts > 0 ? ch.player1_name + ' ' + ts + 'UP' : ts < 0 ? ch.player2_name + ' ' + Math.abs(ts) + 'UP' : 'All Square';
      html += '  <div class="match-result">' + _esc(statusText) + '</div>';
      if (ch.handicap_strokes > 0) {
        html += '  <div style="font-size:0.8rem;color:var(--text-light);margin-top:0.5rem">' + _esc(ch.strokes_receiver === 'player1' ? ch.player1_name : ch.player2_name) + ' receives ' + ch.handicap_strokes + ' stroke' + (ch.handicap_strokes > 1 ? 's' : '') + '</div>';
      }
      html += '  <span class="badge badge-' + ch.status + '" style="margin-top:0.5rem">' + _esc(ch.status) + '</span>';
      html += '</div>';

      // ---- FRONT 9 SCORECARD ----
      html += this._buildNineCard(ch, courseHoles, holeData, runningScores, 1, 9, 'Front 9', canEdit, challengeId, sigs.front || [], frontScored, myFrontSig, isParticipant);

      // ---- BACK 9 SCORECARD ----
      html += this._buildNineCard(ch, courseHoles, holeData, runningScores, 10, 18, 'Back 9', canEdit, challengeId, sigs.back || [], backScored, myBackSig, isParticipant);

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = '<div class="empty-state"><h3>Error</h3><p>' + _esc(err.message) + '</p></div>';
    }
  },

  /**
   * Build a 9-hole scorecard card with signature section
   */
  _buildNineCard(ch, courseHoles, holeData, runningScores, startHole, endHole, title, canEdit, challengeId, nineSigs, scoredCount, mySignature, isParticipant) {
    var nine = startHole === 1 ? 'front' : 'back';
    var holeNumbers = [];
    for (var h = startHole; h <= endHole; h++) holeNumbers.push(h);

    var html = '<div class="card">';
    html += '<div class="card-header"><span class="card-title">' + title + '</span></div>';
    html += '<div class="scorecard-wrapper">';
    html += '<table class="scorecard">';

    // Header
    html += '<thead><tr><th>Hole</th>';
    holeNumbers.forEach(function (h) { html += '<th>' + h + '</th>'; });
    html += '<th>Total</th></tr></thead>';
    html += '<tbody>';

    // Par row
    html += '<tr class="row-par"><td class="row-label">Par</td>';
    holeNumbers.forEach(function (h) { html += '<td>' + (courseHoles[h]?.par || '-') + '</td>'; });
    var parTotal = holeNumbers.reduce(function (s, h) { return s + (courseHoles[h]?.par || 0); }, 0);
    html += '<td>' + parTotal + '</td></tr>';

    // Handicap (SI) row
    html += '<tr class="row-par"><td class="row-label">Hdcp</td>';
    holeNumbers.forEach(function (h) {
      var si = courseHoles[h]?.stroke_index || '-';
      var isStroke = ch.stroke_holes?.includes(h);
      html += '<td class="' + (isStroke ? 'stroke-cell' : '') + '">' + si + '</td>';
    });
    html += '<td></td></tr>';

    // Distance row
    html += '<tr class="row-par"><td class="row-label">Yds</td>';
    holeNumbers.forEach(function (h) { html += '<td>' + (courseHoles[h]?.distance || '-') + '</td>'; });
    var ydsTotal = holeNumbers.reduce(function (s, h) { return s + (courseHoles[h]?.distance || 0); }, 0);
    html += '<td>' + ydsTotal + '</td></tr>';

    // Player 1 score row
    html += '<tr class="row-player"><td class="row-label">' + _esc(ch.player1_name) + '</td>';
    holeNumbers.forEach(function (h) {
      var d = holeData[h];
      var isStroke = ch.strokes_receiver === 'player1' && ch.stroke_holes?.includes(h);
      var cls = d ? (d.hole_winner_id === ch.player1_id ? 'sc-win' : d.hole_winner_id === ch.player2_id ? 'sc-loss' : d.hole_winner_id === null && d.player1_strokes ? 'sc-halve' : '') : '';
      if (canEdit) {
        html += '<td class="' + cls + ' ' + (isStroke ? 'stroke-cell' : '') + '"><input type="number" class="score-input" inputmode="numeric" pattern="[0-9]*" min="1" max="12" value="' + (d?.player1_strokes || '') + '" data-hole="' + h + '" data-player="1" onchange="scorecard.saveChallengeScore(' + challengeId + ', ' + h + ', this)"></td>';
      } else {
        html += '<td class="' + cls + ' ' + (isStroke ? 'stroke-cell' : '') + '">' + (d?.player1_strokes || '-') + '</td>';
      }
    });
    var p1Total = holeNumbers.reduce(function (s, h) { return s + (holeData[h]?.player1_strokes || 0); }, 0);
    html += '<td style="font-weight:700">' + (p1Total || '-') + '</td></tr>';

    // Player 2 score row
    html += '<tr class="row-player"><td class="row-label">' + _esc(ch.player2_name) + '</td>';
    holeNumbers.forEach(function (h) {
      var d = holeData[h];
      var isStroke = ch.strokes_receiver === 'player2' && ch.stroke_holes?.includes(h);
      var cls = d ? (d.hole_winner_id === ch.player2_id ? 'sc-win' : d.hole_winner_id === ch.player1_id ? 'sc-loss' : d.hole_winner_id === null && d.player2_strokes ? 'sc-halve' : '') : '';
      if (canEdit) {
        html += '<td class="' + cls + ' ' + (isStroke ? 'stroke-cell' : '') + '"><input type="number" class="score-input" inputmode="numeric" pattern="[0-9]*" min="1" max="12" value="' + (d?.player2_strokes || '') + '" data-hole="' + h + '" data-player="2" onchange="scorecard.saveChallengeScore(' + challengeId + ', ' + h + ', this)"></td>';
      } else {
        html += '<td class="' + cls + ' ' + (isStroke ? 'stroke-cell' : '') + '">' + (d?.player2_strokes || '-') + '</td>';
      }
    });
    var p2Total = holeNumbers.reduce(function (s, h) { return s + (holeData[h]?.player2_strokes || 0); }, 0);
    html += '<td style="font-weight:700">' + (p2Total || '-') + '</td></tr>';

    // Result row (W / L / H)
    html += '<tr class="row-result"><td class="row-label">Result</td>';
    holeNumbers.forEach(function (h) {
      var d = holeData[h];
      if (!d || !d.player1_strokes) { html += '<td>-</td>'; return; }
      if (d.hole_winner_id === ch.player1_id) html += '<td class="sc-win">W</td>';
      else if (d.hole_winner_id === ch.player2_id) html += '<td class="sc-loss">L</td>';
      else html += '<td class="sc-halve">H</td>';
    });
    html += '<td></td></tr>';

    // Status row (running match score)
    html += '<tr class="row-status"><td class="row-label">Match</td>';
    holeNumbers.forEach(function (h) {
      var s = runningScores[h];
      if (s === undefined || !holeData[h]?.player1_strokes) { html += '<td>-</td>'; return; }
      if (s > 0) html += '<td class="sc-up">' + s + 'UP</td>';
      else if (s < 0) html += '<td class="sc-dn">' + Math.abs(s) + 'DN</td>';
      else html += '<td class="sc-as">AS</td>';
    });
    html += '<td></td></tr>';

    html += '</tbody></table></div>';

    // Signature section
    html += '<div class="signature-section">';
    html += '<div class="signature-header">' + title + ' Attestation</div>';

    if (nineSigs.length > 0) {
      html += '<div class="signature-list">';
      nineSigs.forEach(function (s) {
        html += '<div class="signature-item signed">';
        html += '  <span class="sig-icon">&#10003;</span>';
        html += '  <span class="sig-name">' + _esc(s.player_name) + '</span>';
        html += '  <span class="sig-time">Signed ' + new Date(s.signed_at + 'Z').toLocaleString() + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (isParticipant && !mySignature && scoredCount >= 9) {
      html += '<button class="btn btn-primary btn-sign" onclick="scorecard.signNine(' + challengeId + ', \'' + nine + '\')">Sign ' + title + '</button>';
    } else if (isParticipant && !mySignature && scoredCount < 9) {
      html += '<div class="sig-pending">Score all 9 holes to sign (' + scoredCount + '/9 completed)</div>';
    } else if (!isParticipant && nineSigs.length === 0) {
      html += '<div class="sig-pending">No signatures yet</div>';
    }

    html += '</div>';
    html += '</div>';

    return html;
  },

  /* ===================================================================
     CHALLENGE SCORING
     =================================================================== */
  async saveChallengeScore(challengeId, holeNumber, inputEl) {
    var tbody = inputEl.closest('tbody');
    var allInputs = tbody.querySelectorAll('input[data-hole="' + holeNumber + '"]');
    var p1Input = null, p2Input = null;
    allInputs.forEach(function (i) {
      if (i.dataset.player === '1') p1Input = i;
      if (i.dataset.player === '2') p2Input = i;
    });

    var p1 = parseInt(p1Input?.value);
    var p2 = parseInt(p2Input?.value);
    if (!p1 || !p2) return;

    try {
      await api.put('/api/challenges/' + challengeId + '/score', {
        holeNumber: holeNumber,
        player1Strokes: p1,
        player2Strokes: p2,
      });
      this.renderChallenge(challengeId);
    } catch (err) {
      alert('Error saving score: ' + err.message);
    }
  },

  async signNine(challengeId, nine) {
    if (!confirm('Sign and attest the ' + nine + ' 9 scores? This confirms the scores are accurate.')) return;
    try {
      await api.post('/api/challenges/' + challengeId + '/sign', { nine: nine });
      this.renderChallenge(challengeId);
    } catch (err) {
      alert('Error signing: ' + err.message);
    }
  },

  /* ===================================================================
     SCORE SAVING (existing match)
     =================================================================== */
  async saveScore(matchId, holeNumber, inputEl) {
    var tbody = inputEl.closest('tbody');
    var allInputs = tbody.querySelectorAll('input[data-hole="' + holeNumber + '"]');
    var p1Input = null, p2Input = null;
    allInputs.forEach(function (i) {
      if (i.dataset.player === '1') p1Input = i;
      if (i.dataset.player === '2') p2Input = i;
    });

    var p1 = parseInt(p1Input?.value);
    var p2 = parseInt(p2Input?.value);
    if (!p1 || !p2) return;

    try {
      await api.put('/api/matches/' + matchId + '/score', {
        holeNumber: holeNumber,
        player1Strokes: p1,
        player2Strokes: p2,
      });
      this.renderMatch(matchId);
    } catch (err) {
      alert('Error saving score: ' + err.message);
    }
  },

  async finalizeMatch(matchId) {
    if (!confirm('Finalize this match? This cannot be undone.')) return;
    try {
      var result = await api.put('/api/matches/' + matchId + '/finalize');
      alert('Match complete! ' + (result.winner_name ? result.winner_name + ' wins ' + result.result_text : 'Match halved (A/S)'));
      this.renderMatch(matchId);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  },

  async activateRound(roundId) {
    try {
      await api.put('/api/rounds/' + roundId + '/status', { status: 'active' });
      this.renderRound(roundId);
    } catch (err) { alert('Error: ' + err.message); }
  },

  async completeRound(roundId) {
    try {
      await api.put('/api/rounds/' + roundId + '/status', { status: 'completed' });
      this.renderRound(roundId);
    } catch (err) { alert('Error: ' + err.message); }
  }
};

window.scorecard = scorecard;
