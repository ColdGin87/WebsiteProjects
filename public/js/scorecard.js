const scorecard = {
  state: null,
  pollTimer: null,
  overlay: null,
  screen: 'play',
  cardMode: null,
  currentHole: 1,
  expandedHole: null,
  CACHE_PREFIX: 'goldendale_last_round_',

  stopPoll() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  isNarrow() {
    return window.matchMedia('(max-width: 600px)').matches;
  },

  isHoleView() {
    if (this.screen !== 'play') return false;
    if (this.cardMode === 'full') return false;
    if (this.cardMode === 'hole') return true;
    return this.isNarrow();
  },

  cacheKey(id) {
    return this.CACHE_PREFIX + id;
  },

  readCache(id) {
    try {
      return JSON.parse(localStorage.getItem(this.cacheKey(id)) || 'null');
    } catch {
      return null;
    }
  },

  writeCache(id, state) {
    try {
      localStorage.setItem(this.cacheKey(id), JSON.stringify(state));
    } catch {
      /* quota */
    }
  },

  async renderRound(id, screen) {
    this.screen = screen === 'settings' || screen === 'results' ? screen : 'play';
    this.stopPoll();
    const container = document.getElementById('app');
    const cached = this.readCache(id);
    if (cached) {
      this.state = cached;
      this.currentHole = this.pickCurrentHole(cached);
      this.draw(cached);
    } else {
      container.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Loading scorecard...</div>';
    }
    try {
      const state = await api.get('/api/rounds/' + id);
      this.state = state;
      this.writeCache(id, state);
      this.currentHole = this.pickCurrentHole(state);
      this.draw(state);
      this.pollTimer = setInterval(() => this.refresh(id), 5000);
    } catch (err) {
      if (!cached) {
        container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${_esc(err.message)}</p></div>`;
      }
    }
  },

  pickCurrentHole(state) {
    const holes = state.holes || [];
    if (!holes.length) return 1;
    if (holes.some((h) => h.hole_number === this.currentHole)) return this.currentHole;
    for (const hole of holes) {
      const missing = (state.members || []).some((m) => {
        const hs = (m.holes || []).find((x) => x.holeNumber === hole.hole_number);
        return !hs || hs.gross == null;
      });
      if (missing) return hole.hole_number;
    }
    return holes[holes.length - 1].hole_number;
  },

  refresh(id) {
    api.flushInBackground();
    this.refreshLive(id);
  },

  async refreshLive(id) {
    try {
      const patch = await api.getLive('/api/rounds/' + id + '/live', this.state && this.state.updatedAt);
      if (!patch || patch.notModified) return;
      if (this.state && patch.updatedAt && patch.updatedAt === this.state.updatedAt) return;
      if (this.rosterChanged(patch)) {
        const full = await api.get('/api/rounds/' + id);
        this.state = full;
        this.writeCache(id, full);
        this.draw(full);
        return;
      }
      this.applyLivePatch(patch);
      this.writeCache(id, this.state);
      this.patchUI();
    } catch {
      /* keep current view while offline */
    }
  },

  rosterChanged(patch) {
    const next = patch.memberTotals || [];
    const cur = (this.state && this.state.members) || [];
    if (next.length !== cur.length) return true;
    return next.some((t) => !cur.some((m) => m.id === t.id));
  },

  applyLivePatch(patch) {
    if (!this.state) return;
    this.state.updatedAt = patch.updatedAt;
    if (patch.status) this.state.round.status = patch.status;
    this.state.winner = patch.winner;
    const scored = new Set((patch.scores || []).map((s) => s.memberId + ':' + s.holeNumber));
    for (const member of this.state.members || []) {
      for (const hole of member.holes || []) {
        if (hole.gross != null && !scored.has(member.id + ':' + hole.holeNumber)) {
          hole.gross = null;
          hole.net = null;
        }
      }
    }
    for (const score of patch.scores || []) {
      this.writeMemberHole(score.memberId, score.holeNumber, score.gross, score.net, score.strokes);
    }
    for (const tot of patch.memberTotals || []) {
      const member = this.state.members.find((m) => m.id === tot.id);
      if (!member) continue;
      member.outGross = tot.outGross;
      member.inGross = tot.inGross;
      member.totalGross = tot.totalGross;
      member.outNet = tot.outNet;
      member.inNet = tot.inNet;
      member.totalNet = tot.totalNet;
      member.playing_handicap = tot.playing_handicap;
      member.team_id = tot.team_id;
    }
    if (patch.teams) {
      this.state.teams = (this.state.teams || []).map((t) => {
        const next = patch.teams.find((x) => x.id === t.id);
        return next ? { ...t, ...next } : t;
      });
      for (const team of patch.teams) {
        if (!(this.state.teams || []).some((t) => t.id === team.id)) this.state.teams.push(team);
      }
    }
    if (patch.matches && this.state.matches) {
      this.state.matches = this.state.matches.map((m) => {
        const next = patch.matches.find((x) => x.id === m.id);
        return next ? { ...m, resultText: next.resultText, score: next.score } : m;
      });
    }
  },

  writeMemberHole(memberId, holeNumber, gross, net, strokes) {
    const member = (this.state.members || []).find((m) => m.id === memberId);
    if (!member) return null;
    const hole = (member.holes || []).find((h) => h.holeNumber === holeNumber);
    if (!hole) return null;
    hole.gross = gross;
    if (strokes != null) hole.strokes = strokes;
    hole.net = gross == null ? null : (net != null ? net : gross - (hole.strokes || 0));
    return hole;
  },

  applyLocalScore(memberId, holeNumber, gross) {
    if (!this.state) return;
    this.writeMemberHole(memberId, holeNumber, gross, null, null);
    this.paintScoreCell(memberId, holeNumber);
  },

  applySlimPost(slim) {
    if (!slim || !this.state) return;
    if (slim.updatedAt) this.state.updatedAt = slim.updatedAt;
    for (const row of slim.teams || []) {
      const team = (this.state.teams || []).find((t) => t.id === row.id);
      if (!team) continue;
      if (row.total != null) team.total = row.total;
      if (row.hole && team.holes) {
        const idx = team.holes.findIndex((h) => h.holeNumber === row.hole.holeNumber);
        if (idx >= 0) team.holes[idx] = { ...team.holes[idx], ...row.hole };
      }
    }
    this.paintTeamHole(slim.holeNumber);
    this.paintRaceStrip();
    this.paintBallLine(slim.holeNumber);
  },

  isOrganizer(state) {
    const user = auth.currentUser;
    if (!user) return false;
    if (state.round.organizer_id === user.id) return true;
    return (state.members || []).some((m) => m.player_id === user.id && m.role === 'organizer');
  },

  draw(state) {
    if (this.screen === 'settings') {
      this.drawSettings(state);
      return;
    }
    if (this.screen === 'results') {
      this.drawResults(state);
      return;
    }
    if (this.isHoleView()) this.drawHoleView(state);
    else this.drawFullCard(state);
    this.bindOverlay();
    api.updateBadge();
  },

  toolbar(state, extra) {
    const r = state.round;
    const organizer = this.isOrganizer(state);
    return `
      <div class="round-toolbar">
        <a href="#dashboard" onclick="event.preventDefault();app.navigate('#dashboard')">&larr; Rounds</a>
        <span class="badge badge-${_esc(r.status)}" data-status-badge>${_esc(r.status)}</span>
        <span class="unsynced-inline" id="unsynced-inline"></span>
        ${extra || ''}
        <button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.showScreen('results')">Results</button>
        ${organizer ? '<button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.showScreen(\'settings\')">Settings</button>' : ''}
      </div>`;
  },

  showScreen(screen) {
    const id = this.state && this.state.round && this.state.round.id;
    if (!id) return;
    if (screen === 'settings' || screen === 'results') {
      app.navigate('#round/' + id + '/' + screen);
      return;
    }
    app.navigate('#round/' + id);
  },

  setCardMode(mode) {
    this.cardMode = mode;
    if (this.state) this.draw(this.state);
  },

  holeMeta(state, holeNumber) {
    return (state.holes || []).find((h) => h.hole_number === holeNumber) || {};
  },

  ballLineText(state, holeNumber) {
    const bits = [];
    for (const team of state.teams || []) {
      const hole = (team.holes || []).find((h) => h.holeNumber === holeNumber);
      for (const ball of (hole && hole.balls) || []) {
        bits.push(`${ball.name} ${ball.score}${ball.type === 'gross' ? 'G' : 'N'}`);
      }
    }
    return bits.join(' · ');
  },

  raceStripText(state) {
    const teams = state.teams || [];
    if (!teams.length) return '';
    const completed = state.round.status === 'completed';
    const leader = state.winner || teams.find((t) => t.total != null) || teams[0];
    if (completed && leader) return `${leader.name} wins · ${leader.total}`;
    return teams.map((t) => {
      let bit = `${t.name} ${t.total ?? '—'}`;
      if (leader && leader.total != null && t.total != null && t.id !== leader.id) {
        bit += ` (+${t.total - leader.total})`;
      }
      return bit;
    }).join(' · ');
  },

  drawHoleView(state) {
    const container = document.getElementById('app');
    const r = state.round;
    const holes = state.holes || [];
    const holeNumber = this.pickCurrentHole(state);
    this.currentHole = holeNumber;
    const hole = this.holeMeta(state, holeNumber);
    const formatLabel = r.format === 'match_play' ? 'Match play' : `${r.gross_balls} gross + ${r.net_balls} net`;
    const balls = this.ballLineText(state, holeNumber);
    const race = this.raceStripText(state);

    container.innerHTML = `
      ${this.toolbar(state, `<button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.setCardMode('full')">Full card</button>`)}
      <div class="card hole-view" id="hole-view">
        <h2 class="card-title">${_esc(r.name)}</h2>
        <p class="card-subtitle">${_esc(r.course?.name || '')} · ${_esc(r.tee?.name || 'Tee')} · ${formatLabel}</p>
        <div class="hole-number" id="hole-number">Hole ${holeNumber}</div>
        <div class="race-strip" id="race-strip">${_esc(race)}</div>
        <p class="hole-meta">Par ${hole.par ?? '—'} · SI ${hole.stroke_index ?? '—'}</p>
        <div class="hole-players" id="hole-players">
          ${this.holePlayerRows(state, holeNumber, hole.par)}
        </div>
        ${r.format === 'team_net' ? `
          <div class="hole-teams" id="hole-teams">${this.holeTeamTotals(state, holeNumber)}</div>
          <div class="ball-line" id="ball-line">${_esc(balls)}</div>
        ` : ''}
      </div>
      <div class="hole-nav thumb-zone" id="hole-nav">
        <button type="button" class="btn btn-secondary" id="hole-prev" ${holes[0] && holeNumber <= holes[0].hole_number ? 'disabled' : ''}>Prev</button>
        <span class="hole-nav-label">Hole ${holeNumber}</span>
        <button type="button" class="btn btn-secondary" id="hole-next" ${holes[holes.length - 1] && holeNumber >= holes[holes.length - 1].hole_number ? 'disabled' : ''}>Next</button>
      </div>
    `;
    const prev = document.getElementById('hole-prev');
    const next = document.getElementById('hole-next');
    if (prev) prev.onclick = () => this.shiftHole(-1);
    if (next) next.onclick = () => this.shiftHole(1);
  },

  holePlayerRows(state, holeNumber, par) {
    return (state.members || []).map((m) => {
      const hs = (m.holes || []).find((x) => x.holeNumber === holeNumber);
      return this.holePlayerRowHtml(m, hs, holeNumber, par);
    }).join('');
  },

  holePlayerRowHtml(member, hs, holeNumber, par) {
    const cls = this.vsParClass(hs?.gross, par);
    const dots = Math.max(0, hs?.strokes || 0);
    const plus = (hs?.strokes || 0) < 0;
    return `<button type="button" class="hole-player-row" data-member="${member.id}" data-hole="${holeNumber}"
        onclick="scorecard.openEditor(${this.state.round.id},${member.id},${holeNumber},'${_esc(member.display_name)}',${hs?.gross ?? 'null'},${par})">
        <span class="hole-player-name">${_esc(member.display_name)}</span>
        <span class="hole-player-score sc-cell-editable ${cls} ${dots ? 'dots-' + Math.min(dots, 3) : ''} ${plus ? 'dots-plus' : ''}"
          data-score-cell="${member.id}:${holeNumber}">
          <span class="gross">${hs?.gross ?? ''}</span>
          ${hs?.gross != null ? `<span class="net-mini">${hs.net}</span>` : ''}
        </span>
      </button>`;
  },

  holeTeamTotals(state, holeNumber) {
    return (state.teams || []).map((team) => {
      const hole = (team.holes || []).find((x) => x.holeNumber === holeNumber);
      return `<div class="hole-team-total ${hole?.incomplete ? 'incomplete' : ''}" data-team-total="${team.id}">
        <span>${_esc(team.name)}</span>
        <strong data-team-hole="${team.id}:${holeNumber}">${hole?.total ?? ''}</strong>
      </div>`;
    }).join('');
  },

  shiftHole(delta) {
    const holes = (this.state && this.state.holes) || [];
    const idx = holes.findIndex((h) => h.hole_number === this.currentHole);
    const next = holes[idx + delta];
    if (!next) return;
    this.currentHole = next.hole_number;
    this.draw(this.state);
  },

  drawFullCard(state) {
    const container = document.getElementById('app');
    const r = state.round;
    const holes = state.holes || [];
    const formatLabel = r.format === 'match_play' ? 'Match play' : `${r.gross_balls} gross + ${r.net_balls} net`;
    const outHoles = holes.filter((h) => h.hole_number <= 9);
    const inHoles = holes.filter((h) => h.hole_number >= 10);
    const holeToggle = this.isNarrow()
      ? '<button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.setCardMode(\'hole\')">This hole</button>'
      : '';

    container.innerHTML = `
      ${this.toolbar(state, holeToggle)}
      <div class="card">
        <h2 class="card-title">${_esc(r.name)}</h2>
        <p class="card-subtitle">${_esc(r.course?.name || '')} · ${_esc(r.tee?.name || 'Tee')} · ${formatLabel} · ${r.holes}</p>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Scorecard</span></div>
        <div class="scorecard-container high-contrast" id="scorecard-scroll">
          <table class="scorecard team-scorecard" id="full-scorecard">
            <thead>
              <tr>
                <th>Hole</th>
                ${holes.map((h) => `<th class="${h.hole_number === this.currentHole ? 'is-current-hole' : ''}">${h.hole_number}</th>`).join('')}
                ${outHoles.length ? '<th>OUT</th>' : ''}
                ${inHoles.length ? '<th>IN</th>' : ''}
                <th>TOT</th>
              </tr>
              <tr class="par-row">
                <th class="row-label">Par / SI</th>
                ${holes.map((h) => `<th>${h.par}<div class="si-mini">${h.stroke_index}</div></th>`).join('')}
                ${outHoles.length ? `<th>${outHoles.reduce((s, h) => s + h.par, 0)}</th>` : ''}
                ${inHoles.length ? `<th>${inHoles.reduce((s, h) => s + h.par, 0)}</th>` : ''}
                <th>${holes.reduce((s, h) => s + h.par, 0)}</th>
              </tr>
            </thead>
            <tbody>
              ${this.playerRows(state, holes, outHoles, inHoles)}
              ${r.format === 'team_net' ? this.teamRows(state, holes, outHoles, inHoles) : ''}
            </tbody>
          </table>
        </div>
        <div class="ball-reveal" id="ball-reveal">${this.expandedHole ? 'Hole ' + this.expandedHole + ' · ' + _esc(this.ballLineText(state, this.expandedHole)) : ''}</div>
      </div>
    `;
  },

  drawSettings(state) {
    const container = document.getElementById('app');
    const r = state.round;
    const organizer = this.isOrganizer(state);
    container.innerHTML = `
      ${this.toolbar(state, `<button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.showScreen('play')">Scorecard</button>`)}
      <div class="card">
        <h2 class="card-title">Settings</h2>
        <p class="card-subtitle">${_esc(r.name)} · join <strong>${_esc(r.joinCode || r.join_code)}</strong></p>
        <p class="join-row">
          <button class="btn btn-sm btn-secondary" onclick="scorecard.copy('${_esc(r.joinUrl || '')}')">Copy join link</button>
          <button class="btn btn-sm btn-secondary" onclick="scorecard.copy('${_esc(r.publicUrl || '')}')">Copy public board</button>
        </p>
      </div>
      ${organizer ? this.settingsBar(state) : '<div class="card"><p>Only the organizer can change teams and guests.</p></div>'}
    `;
    api.updateBadge();
  },

  drawResults(state) {
    const container = document.getElementById('app');
    container.innerHTML = `
      ${this.toolbar(state, `<button type="button" class="btn btn-sm btn-secondary" onclick="scorecard.showScreen('play')">Scorecard</button>`)}
      ${state.round.format === 'match_play' ? this.matchBlock(state) : this.resultsPreview(state)}
    `;
    api.updateBadge();
  },

  settingsBar(state) {
    const r = state.round;
    return `
      <div class="admin-bar" style="display:flex">
        <span class="admin-bar-label">Organizer</span>
        <button class="btn btn-sm btn-accent" onclick="scorecard.addGuest()">Add guest</button>
        <button class="btn btn-sm btn-secondary" onclick="scorecard.balanceTeams()">Auto-balance teams</button>
        ${r.format === 'match_play' ? '<button class="btn btn-sm btn-secondary" onclick="scorecard.generateMatches()">Generate matches</button>' : ''}
        <button class="btn btn-sm btn-secondary" onclick="scorecard.setStatus('${r.status === 'completed' ? 'live' : 'completed'}')">${r.status === 'completed' ? 'Reopen' : 'Complete round'}</button>
        <label class="tiny-label">Allowance
          <select onchange="scorecard.updateSettings({allowance: Number(this.value), recomputeHandicaps:true})">
            ${[75,80,90,100].map((a) => `<option value="${a}" ${r.allowance === a ? 'selected' : ''}>${a}%</option>`).join('')}
          </select>
        </label>
        <label class="tiny-label"><input type="checkbox" ${r.dual_count ? 'checked' : ''} onchange="scorecard.updateSettings({dualCount: this.checked})"> Dual-count</label>
      </div>
      <div class="card">
        <div class="card-title">Players (${state.members.length}/20)</div>
        <div class="player-list">${state.members.map((m) => `
          <span class="player-pill">${_esc(m.display_name)} · H ${m.playing_handicap ?? m.handicap ?? '—'} ${m.team_id ? '' : '· individual'} ${m.is_guest ? '· guest' : ''}
            ${this.isOrganizer(state) ? `<button class="linkish" onclick="scorecard.editMember(${m.id})">edit</button>` : ''}
          </span>`).join('')}</div>
      </div>`;
  },

  playerRows(state, holes, outHoles, inHoles) {
    return state.members.map((m) => {
      const cells = holes.map((h) => {
        const hs = m.holes.find((x) => x.holeNumber === h.hole_number);
        return this.scoreCellHtml(state, m, h, hs);
      }).join('');
      return `
        <tr class="row-player" data-member-row="${m.id}">
          <td class="row-label">${_esc(m.display_name)}<div class="hcp-mini">H ${m.playing_handicap ?? '—'}</div></td>
          ${cells}
          ${outHoles.length ? `<td class="sc-total" data-out="${m.id}">${m.outGross ?? ''} <span class="net-mini">${m.outNet ?? ''}</span></td>` : ''}
          ${inHoles.length ? `<td class="sc-total" data-in="${m.id}">${m.inGross ?? ''} <span class="net-mini">${m.inNet ?? ''}</span></td>` : ''}
          <td class="sc-total" data-tot="${m.id}"><strong>${m.totalGross ?? ''}</strong> <span class="net-mini">${m.totalNet ?? ''}</span></td>
        </tr>`;
    }).join('');
  },

  scoreCellHtml(state, member, hole, hs) {
    const cls = this.vsParClass(hs?.gross, hole.par);
    const dots = Math.max(0, hs?.strokes || 0);
    const plus = (hs?.strokes || 0) < 0;
    return `<td class="sc-cell-editable ${cls} ${dots ? 'dots-' + Math.min(dots, 3) : ''} ${plus ? 'dots-plus' : ''}"
      data-score-cell="${member.id}:${hole.hole_number}"
      onclick="scorecard.openEditor(${state.round.id},${member.id},${hole.hole_number},'${_esc(member.display_name)}',${hs?.gross ?? 'null'},${hole.par})">
      <span class="gross">${hs?.gross ?? ''}</span>
      ${hs?.gross != null ? `<span class="net-mini">${hs.net}</span>` : ''}
    </td>`;
  },

  teamRows(state, holes, outHoles, inHoles) {
    return (state.teams || []).map((team) => `
      <tr class="row-team" data-team-row="${team.id}">
        <td class="row-label">${_esc(team.name)}</td>
        ${holes.map((h) => {
          const hole = team.holes.find((x) => x.holeNumber === h.hole_number);
          return `<td data-team-hole="${team.id}:${h.hole_number}" class="${hole?.incomplete ? 'incomplete' : ''}"
            onclick="scorecard.revealHoleBalls(${h.hole_number})">${hole?.total ?? ''}</td>`;
        }).join('')}
        ${outHoles.length ? `<td class="sc-total">${team.out ?? ''}</td>` : ''}
        ${inHoles.length ? `<td class="sc-total">${team.inn ?? ''}</td>` : ''}
        <td class="sc-total"><strong data-team-tot="${team.id}">${team.total ?? ''}</strong></td>
      </tr>`).join('');
  },

  revealHoleBalls(holeNumber) {
    this.expandedHole = this.expandedHole === holeNumber ? null : holeNumber;
    const el = document.getElementById('ball-reveal');
    if (!el || !this.state) return;
    el.textContent = this.expandedHole
      ? 'Hole ' + this.expandedHole + ' · ' + this.ballLineText(this.state, this.expandedHole)
      : '';
  },

  resultsPreview(state) {
    const winner = state.winner;
    const completed = state.round.status === 'completed';
    let headline = 'Enter scores to see team totals.';
    if (winner) {
      headline = completed
        ? `${winner.name} wins · ${winner.total}`
        : `Leading team: ${winner.name} · ${winner.total}`;
    }
    return `
      <div class="card">
        <div class="card-header"><span class="card-title">Results</span></div>
        <p><strong>${_esc(headline)}</strong></p>
        <p class="race-strip">${_esc(this.raceStripText(state))}</p>
        <p class="card-subtitle">Tie-break: back 9, last 6, last 3, 18, hardest SI. Incomplete holes are flagged.</p>
        <div class="welcome-actions">
          <button class="btn btn-secondary btn-sm" onclick="scorecard.copyText()">Copy as text</button>
          <a class="btn btn-secondary btn-sm" href="/api/rounds/${state.round.id}/results.csv" onclick="scorecard.downloadCsv(event)">CSV</a>
          <button class="btn btn-secondary btn-sm" onclick="app.navigate('#lb/${_esc(state.round.public_token || '')}')">Public board</button>
        </div>
      </div>`;
  },

  matchBlock(state) {
    const matches = state.matches || [];
    return `
      <div class="card">
        <div class="card-title">Match play</div>
        ${matches.length === 0 ? '<p>Organizer can generate pairings. 8 players use the retreat rotation; otherwise players are paired by handicap.</p>' : ''}
        ${matches.map((m) => `
          <div class="match-card">
            <div class="players">
              <span>${_esc(m.member1?.display_name || 'P1')}</span>
              <span class="vs">vs</span>
              <span>${_esc(m.member2?.display_name || 'P2')}</span>
            </div>
            <div>${_esc(m.resultText || 'All Square')}</div>
          </div>`).join('')}
      </div>`;
  },

  vsParClass(gross, par) {
    if (gross == null || par == null) return '';
    const d = gross - par;
    if (d <= -2) return 'vs-eagle';
    if (d === -1) return 'vs-birdie';
    if (d === 0) return 'vs-par';
    if (d === 1) return 'vs-bogey';
    return 'vs-double';
  },

  cellClassList(hs, par) {
    const cls = ['sc-cell-editable'];
    const vs = this.vsParClass(hs?.gross, par);
    if (vs) cls.push(vs);
    const dots = Math.max(0, hs?.strokes || 0);
    if (dots) cls.push('dots-' + Math.min(dots, 3));
    if ((hs?.strokes || 0) < 0) cls.push('dots-plus');
    return cls.join(' ');
  },

  paintScoreCell(memberId, holeNumber) {
    if (!this.state) return;
    const member = this.state.members.find((m) => m.id === memberId);
    const hs = member && (member.holes || []).find((h) => h.holeNumber === holeNumber);
    const hole = this.holeMeta(this.state, holeNumber);
    const cells = document.querySelectorAll('[data-score-cell="' + memberId + ':' + holeNumber + '"]');
    cells.forEach((cell) => {
      cell.className = this.cellClassList(hs, hole.par) + (cell.classList.contains('hole-player-score') ? ' hole-player-score' : '');
      cell.innerHTML = `<span class="gross">${hs?.gross ?? ''}</span>${hs?.gross != null ? `<span class="net-mini">${hs.net}</span>` : ''}`;
    });
    const row = document.querySelector('.hole-player-row[data-member="' + memberId + '"][data-hole="' + holeNumber + '"]');
    if (row) {
      row.setAttribute(
        'onclick',
        `scorecard.openEditor(${this.state.round.id},${memberId},${holeNumber},'${_esc(member.display_name)}',${hs?.gross ?? 'null'},${hole.par})`
      );
    }
  },

  paintTeamHole(holeNumber) {
    if (!this.state || holeNumber == null) return;
    for (const team of this.state.teams || []) {
      const hole = (team.holes || []).find((h) => h.holeNumber === holeNumber);
      document.querySelectorAll('[data-team-hole="' + team.id + ':' + holeNumber + '"]').forEach((el) => {
        el.textContent = hole?.total ?? '';
        el.classList.toggle('incomplete', !!hole?.incomplete);
      });
      const wrap = document.querySelector('[data-team-total="' + team.id + '"]');
      if (wrap) wrap.classList.toggle('incomplete', !!hole?.incomplete);
      const tot = document.querySelector('[data-team-tot="' + team.id + '"]');
      if (tot) tot.textContent = team.total ?? '';
    }
  },

  paintRaceStrip() {
    const el = document.getElementById('race-strip');
    if (el && this.state) el.textContent = this.raceStripText(this.state);
    const badge = document.querySelector('[data-status-badge]');
    if (badge && this.state) {
      badge.textContent = this.state.round.status;
      badge.className = 'badge badge-' + this.state.round.status;
    }
  },

  paintBallLine(holeNumber) {
    const el = document.getElementById('ball-line');
    if (el && this.state) el.textContent = this.ballLineText(this.state, holeNumber || this.currentHole);
    const reveal = document.getElementById('ball-reveal');
    if (reveal && this.expandedHole && this.state) {
      reveal.textContent = 'Hole ' + this.expandedHole + ' · ' + this.ballLineText(this.state, this.expandedHole);
    }
  },

  patchUI() {
    if (!this.state) return;
    if (this.screen !== 'play') return;
    if (this.isHoleView()) {
      if (!document.getElementById('hole-view')) {
        this.draw(this.state);
        return;
      }
      const holeNumber = this.currentHole;
      const hole = this.holeMeta(this.state, holeNumber);
      const players = document.getElementById('hole-players');
      if (players && players.children.length !== (this.state.members || []).length) {
        this.draw(this.state);
        return;
      }
      for (const member of this.state.members || []) {
        this.paintScoreCell(member.id, holeNumber);
        const row = document.querySelector('.hole-player-row[data-member="' + member.id + '"]');
        if (row) {
          const name = row.querySelector('.hole-player-name');
          if (name) name.textContent = member.display_name;
        }
      }
      this.paintTeamHole(holeNumber);
      this.paintRaceStrip();
      this.paintBallLine(holeNumber);
      return;
    }
    const table = document.getElementById('full-scorecard');
    if (!table) {
      this.draw(this.state);
      return;
    }
    for (const member of this.state.members || []) {
      for (const hs of member.holes || []) this.paintScoreCell(member.id, hs.holeNumber);
      const out = document.querySelector('[data-out="' + member.id + '"]');
      if (out) out.innerHTML = `${member.outGross ?? ''} <span class="net-mini">${member.outNet ?? ''}</span>`;
      const inn = document.querySelector('[data-in="' + member.id + '"]');
      if (inn) inn.innerHTML = `${member.inGross ?? ''} <span class="net-mini">${member.inNet ?? ''}</span>`;
      const tot = document.querySelector('[data-tot="' + member.id + '"]');
      if (tot) tot.innerHTML = `<strong>${member.totalGross ?? ''}</strong> <span class="net-mini">${member.totalNet ?? ''}</span>`;
    }
    for (const team of this.state.teams || []) {
      for (const hole of team.holes || []) this.paintTeamHole(hole.holeNumber);
    }
    this.paintRaceStrip();
    this.paintBallLine(this.expandedHole);
  },

  setThumbNavHidden(hidden) {
    const nav = document.getElementById('hole-nav');
    if (nav) nav.hidden = hidden;
  },

  openEditor(roundId, memberId, holeNumber, name, current, par) {
    this.overlay = { roundId, memberId, holeNumber, name, par };
    const overlay = document.getElementById('score-overlay');
    const input = document.getElementById('score-overlay-input');
    document.getElementById('score-overlay-title').textContent = name;
    document.getElementById('score-overlay-label').textContent = `Hole ${holeNumber} · Par ${par}`;
    input.value = current == null ? par : current;
    overlay.hidden = false;
    overlay.classList.add('active');
    this.setThumbNavHidden(true);
    input.focus();
    input.select();
  },

  closeEditor() {
    const overlay = document.getElementById('score-overlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.classList.remove('active');
    }
    this.setThumbNavHidden(false);
  },

  bindOverlay() {
    const overlay = document.getElementById('score-overlay');
    const input = document.getElementById('score-overlay-input');
    if (!overlay || overlay.dataset.bound) return;
    overlay.dataset.bound = '1';
    document.getElementById('score-minus').onclick = () => {
      input.value = Math.max(1, (Number(input.value) || 1) - 1);
    };
    document.getElementById('score-plus').onclick = () => {
      input.value = Math.min(15, (Number(input.value) || 0) + 1);
    };
    document.getElementById('score-save').onclick = () => this.saveOverlay();
    document.getElementById('score-clear').onclick = () => this.saveOverlay(true);
  },

  saveOverlay(clear) {
    if (!this.overlay) return;
    const input = document.getElementById('score-overlay-input');
    const { roundId, memberId, holeNumber } = this.overlay;
    const gross = clear ? null : Number(input.value);
    this.closeEditor();
    this.applyLocalScore(memberId, holeNumber, gross);
    api.postScore(`/api/rounds/${roundId}/scores`, { memberId, holeNumber, gross })
      .then((slim) => {
        this.applySlimPost(slim);
        if (this.state) this.writeCache(roundId, this.state);
      })
      .catch((err) => {
        _toast(err.message, err.offline ? '' : 'error');
      });
  },

  async addGuest() {
    const values = await _formPrompt({
      title: 'Add guest',
      submitLabel: 'Add guest',
      fields: [
        { name: 'name', label: 'Guest name', required: true, placeholder: 'Name' },
        { name: 'handicap', label: 'Handicap (optional)', placeholder: '12.4 or +2' },
      ],
    });
    if (!values) return;
    try {
      const state = await api.post(`/api/rounds/${this.state.round.id}/guests`, {
        name: values.name,
        handicap: values.handicap,
      });
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async balanceTeams() {
    const values = await _formPrompt({
      title: 'Auto-balance teams',
      submitLabel: 'Balance',
      fields: [{ name: 'teamCount', label: 'How many teams?', type: 'number', value: '2', required: true }],
    });
    if (!values) return;
    try {
      const state = await api.post(`/api/rounds/${this.state.round.id}/teams/balance`, {
        teamCount: Number(values.teamCount),
      });
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async generateMatches() {
    try {
      const state = await api.post(`/api/rounds/${this.state.round.id}/matches/generate`);
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async setStatus(status) {
    try {
      const state = await api.put(`/api/rounds/${this.state.round.id}`, { status });
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async updateSettings(body) {
    try {
      const state = await api.put(`/api/rounds/${this.state.round.id}`, body);
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  async editMember(memberId) {
    const member = this.state.members.find((m) => m.id === memberId);
    const values = await _formPrompt({
      title: 'Playing handicap',
      submitLabel: 'Save',
      fields: [{
        name: 'playingHandicap',
        label: 'Playing handicap (editable mid-round)',
        value: member.playing_handicap ?? member.handicap ?? '',
        required: true,
      }],
    });
    if (!values) return;
    try {
      const state = await api.put(`/api/rounds/${this.state.round.id}/members/${memberId}`, {
        playingHandicap: values.playingHandicap,
      });
      this.state = state;
      this.writeCache(state.round.id, state);
      this.draw(state);
    } catch (err) { _toast(err.message, 'error'); }
  },

  copy(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => _toast('Copied', 'success')).catch(() => {
      _formPrompt({
        title: 'Copy this link',
        submitLabel: 'Done',
        fields: [{ name: 'text', label: 'Link', value: text }],
      });
    });
  },

  async copyText() {
    try {
      const text = await api.get(`/api/rounds/${this.state.round.id}/results.txt`);
      this.copy(typeof text === 'string' ? text : JSON.stringify(text));
    } catch (err) { _toast(err.message, 'error'); }
  },

  async downloadCsv(e) {
    e.preventDefault();
    const token = api.getToken();
    const res = await fetch(`/api/rounds/${this.state.round.id}/results.csv`, {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'goldendale-round.csv';
    a.click();
    URL.revokeObjectURL(url);
  },
};

window.scorecard = scorecard;
