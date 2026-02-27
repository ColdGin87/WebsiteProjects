/**
 * Scorecard + Round Detail Views
 */
const scorecard = {
  async renderRound(roundId) {
    const container = document.getElementById('app');
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Loading round...</div>';

    try {
      const round = await api.get(`/api/rounds/${roundId}`);
      const matches = await api.get(`/api/matches?round=${round.round_number}`);

      const frontMatches = matches.filter(m => m.half === 'front');
      const backMatches = matches.filter(m => m.half === 'back');

      container.innerHTML = `
        <div style="margin-bottom:1rem">
          <a href="#dashboard" onclick="event.preventDefault();app.navigate('#dashboard')" style="color:var(--primary);text-decoration:none;font-size:0.85rem">&larr; Back to Dashboard</a>
        </div>
        <div class="card">
          <h2 style="color:var(--primary)">${round.name}</h2>
          <p style="color:var(--text-light)">
            ${round.course_name || ''} &bull; ${round.num_holes || 18} holes &bull; Par ${round.course_par || 72}
          </p>
          <span class="badge badge-${round.status}">${round.status}</span>
          ${auth.currentUser?.is_admin && round.status === 'upcoming' ? `
            <button class="btn btn-sm btn-primary" style="margin-left:0.5rem" onclick="scorecard.activateRound(${round.id})">Activate Round</button>
          ` : ''}
          ${auth.currentUser?.is_admin && round.status === 'active' ? `
            <button class="btn btn-sm btn-secondary" style="margin-left:0.5rem" onclick="scorecard.completeRound(${round.id})">Complete Round</button>
          ` : ''}
        </div>

        ${round.foursomes && round.foursomes.length > 0 ? `
          <h2 class="section-title">Foursomes</h2>
          <div class="grid grid-2">
            ${round.foursomes.map(f => `
              <div class="foursome-card">
                <div class="group-label">Group ${f.group_label}</div>
                <div class="player-list">
                  ${f.players ? f.players.map(p => `<span class="player-pill">${p.name} (${p.handicap})</span>`).join('') : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<div class="empty-state"><p>Schedule not yet generated for this round.</p></div>'}

        ${frontMatches.length > 0 ? `
          <h2 class="section-title">Front 9 Matches</h2>
          ${frontMatches.map(m => this.renderMatchCard(m)).join('')}
        ` : ''}

        ${backMatches.length > 0 ? `
          <h2 class="section-title">Back 9 Matches</h2>
          ${backMatches.map(m => this.renderMatchCard(m)).join('')}
        ` : ''}
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  },

  renderMatchCard(m) {
    const statusBadge = m.status === 'completed'
      ? (m.result_text ? `<span class="badge badge-completed">${m.result_text}</span>` : '')
      : `<span class="badge badge-${m.status}">${m.status}</span>`;
    const winner = m.winner_id === m.player1_id ? m.player1_name : m.winner_id === m.player2_id ? m.player2_name : null;

    return `
      <div class="match-card" onclick="app.navigate('#match/${m.id}')">
        <div class="half-label">${m.half} 9</div>
        <div class="players">
          <span${m.winner_id === m.player1_id ? ' style="color:var(--success)"' : ''}>${m.player1_name} (${m.player1_handicap})</span>
          <span class="vs">vs</span>
          <span${m.winner_id === m.player2_id ? ' style="color:var(--success)"' : ''}>${m.player2_name} (${m.player2_handicap})</span>
        </div>
        <div style="margin-top:0.5rem">${statusBadge} ${winner ? `<span style="font-size:0.8rem;color:var(--text-light)">${winner} wins</span>` : ''}</div>
      </div>
    `;
  },

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

      // Build hole data map
      const holeData = {};
      (match.holes || []).forEach(h => { holeData[h.hole_number] = h; });

      // Course holes for par
      let courseHoles = {};
      try {
        const roundData = await api.get(`/api/rounds/${match.round_id}`);
        if (roundData.course_holes) roundData.course_holes.forEach(h => { courseHoles[h.hole_number] = h; });
      } catch {}

      // Running match score
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

      container.innerHTML = `
        <div style="margin-bottom:1rem">
          <a href="#round/${match.round_id}" onclick="event.preventDefault();app.navigate('#round/${match.round_id}')" style="color:var(--primary);text-decoration:none;font-size:0.85rem">&larr; Back to Round</a>
        </div>

        <div class="card" style="text-align:center">
          <div style="font-size:0.75rem;color:var(--text-light);text-transform:uppercase;letter-spacing:1px">${match.round_name || 'Round'} &bull; ${match.half} 9</div>
          <div style="display:flex;justify-content:center;align-items:center;gap:1.5rem;margin:1rem 0">
            <div>
              <div style="font-size:1.3rem;font-weight:700">${match.player1_name}</div>
              <div style="font-size:0.8rem;color:var(--text-light)">Handicap: ${match.player1_handicap}</div>
            </div>
            <div style="font-size:0.9rem;color:var(--text-muted);font-weight:600">VS</div>
            <div>
              <div style="font-size:1.3rem;font-weight:700">${match.player2_name}</div>
              <div style="font-size:0.8rem;color:var(--text-light)">Handicap: ${match.player2_handicap}</div>
            </div>
          </div>
          <div class="match-result ${match.status === 'completed' ? (match.winner_id ? 'won' : 'halved') : ''}">${match.result_text || stateText}</div>
          ${match.handicap_strokes > 0 ? `<div style="font-size:0.8rem;color:var(--text-light);margin-top:0.5rem">${match.strokes_receiver === 'player1' ? match.player1_name : match.player2_name} receives ${match.handicap_strokes} stroke${match.handicap_strokes > 1 ? 's' : ''}</div>` : ''}
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Scorecard</span></div>
          <div class="scorecard-container">
            <table class="scorecard">
              <thead>
                <tr>
                  <th>Hole</th>
                  ${holeNumbers.map(h => `<th>${h}</th>`).join('')}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr class="par-row">
                  <td class="row-label">Par</td>
                  ${holeNumbers.map(h => `<td>${courseHoles[h]?.par || holeData[h]?.par || '-'}</td>`).join('')}
                  <td>${holeNumbers.reduce((s, h) => s + (courseHoles[h]?.par || holeData[h]?.par || 0), 0)}</td>
                </tr>
                <tr class="si-row">
                  <td class="row-label">SI</td>
                  ${holeNumbers.map(h => {
                    const si = courseHoles[h]?.stroke_index || holeData[h]?.stroke_index || '-';
                    const isStroke = match.stroke_holes?.includes(h);
                    return `<td class="${isStroke ? 'stroke-cell' : ''}">${si}</td>`;
                  }).join('')}
                  <td></td>
                </tr>
                <tr>
                  <td class="row-label">${match.player1_name}${match.stroke_holes?.length ? ' *' : ''}</td>
                  ${holeNumbers.map(h => {
                    const d = holeData[h];
                    const isStroke = match.strokes_receiver === 'player1' && match.stroke_holes?.includes(h);
                    const cls = d ? (d.hole_winner_id === match.player1_id ? 'hole-won' : d.hole_winner_id === match.player2_id ? 'hole-lost' : d.hole_winner_id === null && d.player1_strokes ? 'hole-halved' : '') : '';
                    if (canEdit) {
                      return `<td class="${cls} ${isStroke ? 'stroke-cell' : ''}"><input type="number" class="score-input" inputmode="numeric" pattern="[0-9]*" min="1" max="12" value="${d?.player1_strokes || ''}" data-hole="${h}" data-player="1" onchange="scorecard.saveScore(${matchId}, ${h}, this)"></td>`;
                    }
                    return `<td class="${cls} ${isStroke ? 'stroke-cell' : ''}">${d?.player1_strokes || '-'}</td>`;
                  }).join('')}
                  <td style="font-weight:700">${Object.values(holeData).reduce((s, h) => s + (h.player1_strokes || 0), 0) || '-'}</td>
                </tr>
                <tr>
                  <td class="row-label">${match.player2_name}${match.stroke_holes?.length ? '' : ''}</td>
                  ${holeNumbers.map(h => {
                    const d = holeData[h];
                    const isStroke = match.strokes_receiver === 'player2' && match.stroke_holes?.includes(h);
                    const cls = d ? (d.hole_winner_id === match.player2_id ? 'hole-won' : d.hole_winner_id === match.player1_id ? 'hole-lost' : d.hole_winner_id === null && d.player2_strokes ? 'hole-halved' : '') : '';
                    if (canEdit) {
                      return `<td class="${cls} ${isStroke ? 'stroke-cell' : ''}"><input type="number" class="score-input" inputmode="numeric" pattern="[0-9]*" min="1" max="12" value="${d?.player2_strokes || ''}" data-hole="${h}" data-player="2" onchange="scorecard.saveScore(${matchId}, ${h}, this)"></td>`;
                    }
                    return `<td class="${cls} ${isStroke ? 'stroke-cell' : ''}">${d?.player2_strokes || '-'}</td>`;
                  }).join('')}
                  <td style="font-weight:700">${Object.values(holeData).reduce((s, h) => s + (h.player2_strokes || 0), 0) || '-'}</td>
                </tr>
                <tr class="status-row">
                  <td class="row-label">Status</td>
                  ${holeNumbers.map(h => {
                    const s = runningScores[h];
                    if (s === undefined || !holeData[h]) return '<td>-</td>';
                    if (s > 0) return `<td style="color:var(--success)">${s}UP</td>`;
                    if (s < 0) return `<td style="color:var(--danger)">${Math.abs(s)}DN</td>`;
                    return '<td>AS</td>';
                  }).join('')}
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
          ${canEdit ? `<div style="text-align:center;margin-top:1rem"><button class="btn btn-primary" onclick="scorecard.finalizeMatch(${matchId})">Finalize Match</button></div>` : ''}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  },

  async saveScore(matchId, holeNumber, inputEl) {
    const row = inputEl.closest('tr');
    const player = inputEl.dataset.player;
    const allInputs = row.closest('tbody').querySelectorAll(`input[data-hole="${holeNumber}"]`);
    const p1Input = [...allInputs].find(i => i.dataset.player === '1');
    const p2Input = [...allInputs].find(i => i.dataset.player === '2');

    const p1 = parseInt(p1Input?.value);
    const p2 = parseInt(p2Input?.value);
    if (!p1 || !p2) return; // Wait for both scores

    try {
      await api.put(`/api/matches/${matchId}/score`, {
        holeNumber, player1Strokes: p1, player2Strokes: p2
      });
      // Refresh to show updated colors
      this.renderMatch(matchId);
    } catch (err) {
      alert('Error saving score: ' + err.message);
    }
  },

  async finalizeMatch(matchId) {
    if (!confirm('Finalize this match? This cannot be undone.')) return;
    try {
      const result = await api.put(`/api/matches/${matchId}/finalize`);
      alert(`Match complete! ${result.winner_name ? result.winner_name + ' wins ' + result.result_text : 'Match halved (A/S)'}`);
      this.renderMatch(matchId);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  },

  async activateRound(roundId) {
    try {
      await api.put(`/api/rounds/${roundId}/status`, { status: 'active' });
      this.renderRound(roundId);
    } catch (err) { alert('Error: ' + err.message); }
  },

  async completeRound(roundId) {
    try {
      await api.put(`/api/rounds/${roundId}/status`, { status: 'completed' });
      this.renderRound(roundId);
    } catch (err) { alert('Error: ' + err.message); }
  }
};

window.scorecard = scorecard;
