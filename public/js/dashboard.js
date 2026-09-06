function svcApi(method) {
  const args = Array.prototype.slice.call(arguments, 1);
  const client = (typeof window !== 'undefined' && typeof window.apiClient === 'function')
    ? window.apiClient()
    : ((typeof window !== 'undefined' && window.api) || (typeof api === 'object' ? api : {}) || {});
  if (client && typeof client[method] === 'function') return client[method].apply(client, args);
  if (typeof window !== 'undefined' && typeof window.callApi === 'function') {
    return window.callApi.apply(null, arguments);
  }
  if (method === 'updateBadge' || method === 'flushInBackground') return;
  if (method === 'getToken') {
    try { return localStorage.getItem('goldendale_scorecard_token'); } catch { return null; }
  }
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = localStorage.getItem('goldendale_scorecard_token');
    if (token) headers.Authorization = 'Bearer ' + token;
  } catch { /* ignore */ }
  const http = method === 'put' ? 'PUT' : (method === 'get' || method === 'getLive') ? 'GET' : 'POST';
  const init = { method: http, headers };
  if (http !== 'GET') init.body = JSON.stringify(args[1] || {});
  return fetch(args[0], init).then(async (res) => {
    if (res.status === 304) return { notModified: true };
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || ('HTTP ' + res.status));
    return data;
  });
}

const dashboard = {
  async render() {
    const container = document.getElementById('app');
    const user = auth.currentUser;
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Loading rounds...</div>';

    if (!user) {
      container.innerHTML = `
        <div class="welcome-hero">
          <div class="welcome-title">Goldendale Scorecard</div>
          <div class="welcome-subtitle">Goldendale Golf Club · 1901 N Columbus Ave · 9 holes played twice</div>
          <p class="hero-copy">Handicapped team competitions. Default is 1 gross + 2 net, totaled vs par. The best combo of distinct players is kept.</p>
          <div class="welcome-actions">
            <button class="btn btn-accent" onclick="auth.showModal('login')">Sign In</button>
            <button class="btn btn-outline-light" onclick="auth.showModal('register')">Create account</button>
          </div>
        </div>
        <div class="card">
          <h3 class="card-title">Have a join code?</h3>
          <p class="card-subtitle">Sign in first, then enter the join code from your organizer.</p>
          <div class="inline-form">
            <input id="guest-code" class="form-input join-code-input" maxlength="12" placeholder="ABC234XY" autocomplete="off" style="text-transform:uppercase" onkeydown="if(event.key==='Enter'){event.preventDefault();dashboard.stashGuestCodeAndSignIn();}">
            <button class="btn btn-primary" onclick="dashboard.stashGuestCodeAndSignIn()">Sign in to join</button>
          </div>
        </div>`;
      return;
    }

    try {
      const rounds = await svcApi('get', '/api/rounds');
      const live = rounds.filter((r) => r.status === 'live' || r.status === 'setup');
      const done = rounds.filter((r) => r.status === 'completed');

      container.innerHTML = `
        <div class="welcome-hero">
          <div class="welcome-title">Hi, ${_esc(user.name)}</div>
          <div class="welcome-subtitle">Goldendale Golf Club · team scoring by default</div>
          <div class="welcome-actions">
            <a class="btn btn-accent btn-sm" href="#create" onclick="event.preventDefault();app.navigate('#create')">New round</a>
            <button class="btn btn-outline-light btn-sm" onclick="dashboard.promptJoin()">Join with code</button>
            <a class="btn btn-outline-light btn-sm" href="#rules" onclick="event.preventDefault();app.navigate('#rules')">Game Rules</a>
          </div>
        </div>
        <div class="stats-row">
          <div class="stat-card"><div class="stat-value">${rounds.length}</div><div class="stat-label">My rounds</div></div>
          <div class="stat-card"><div class="stat-value">${live.length}</div><div class="stat-label">Open</div></div>
          <div class="stat-card"><div class="stat-value">${done.length}</div><div class="stat-label">History</div></div>
        </div>
        <h2 class="section-title">Open rounds</h2>
        ${live.length ? dashboard.roundGrid(live) : '<div class="empty-state"><h3>No open rounds</h3><p>Create a team round or join with a code.</p></div>'}
        <h2 class="section-title mt-lg">History</h2>
        ${done.length ? dashboard.roundGrid(done) : '<div class="empty-state"><p>Completed rounds will land here.</p></div>'}
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${_esc(err.message)}</p></div>`;
    }
  },

  roundGrid(rounds) {
    return `<div class="grid grid-2">${rounds.map((r, idx) => `
      <div class="round-card card-clickable" onclick="app.navigate('#round/${r.id}')">
        <div class="round-accent ${['round-accent-1','round-accent-2','round-accent-3','round-accent-4','round-accent-5'][idx % 5]}"></div>
        <div style="padding-left:12px">
          <div class="round-number">${_esc(r.name)}</div>
          <div class="round-course">${_esc(r.course_name || 'Goldendale')} · ${r.format === 'match_play' ? 'Match play' : dashboard.gameChip(r)} · ${r.holes}</div>
          <span class="badge badge-${_esc(r.status)}">${_esc(r.status)}</span>
          <span class="code-chip">${_esc(r.join_code)}</span>
        </div>
      </div>`).join('')}</div>`;
  },

  formatsApi() {
    return (typeof window !== 'undefined' && window.teamFormats) || {};
  },

  gameFromKey(key) {
    const api = this.formatsApi();
    if (typeof api.gameFromKey === 'function') return api.gameFromKey(key);
    return { key: '1G2N', grossBalls: 1, netBalls: 2 };
  },

  gameRule(key) {
    const game = this.gameFromKey(key);
    const api = this.formatsApi();
    if (typeof api.formatRuleText === 'function') return api.formatRuleText(game.grossBalls, game.netBalls);
    const g = game.grossBalls ?? 1;
    const n = game.netBalls ?? 2;
    return `Count the best ${g} gross and ${n} net from ${g + n} different players. Each counted ball is vs par (birdie −1, par E, bogey +1). The hole total is those vs-par values added together. Every legal assignment is tried; the lowest (best) combo is kept. The race is the running vs-par total, not a stroke sum.`;
  },

  gameChip(round) {
    const api = this.formatsApi();
    if (typeof api.formatLabel === 'function') {
      return api.formatLabel(round.gross_balls ?? round.grossBalls, round.net_balls ?? round.netBalls);
    }
    return '1G + 2N vs par';
  },

  gameOptionsHtml(selectedKey) {
    const api = this.formatsApi();
    const games = api.TEAM_GAMES || [
      { key: '3G', label: '3 gross' },
      { key: '3N', label: '3 net' },
      { key: '1G1N', label: '1 gross + 1 net' },
      { key: '1G2N', label: '1 gross + 2 net (Goldendale default)' },
      { key: '1G3N', label: '1 gross + 3 net' },
      { key: '2G2N', label: '2 gross + 2 net' },
    ];
    return games.map((game) =>
      `<option value="${game.key}" ${game.key === selectedKey ? 'selected' : ''}>${_esc(game.label)}</option>`
    ).join('');
  },

  async promptJoin() {
    const values = await _formPrompt({
      title: 'Join a round',
      submitLabel: 'Next',
      fields: [{
        name: 'code',
        label: 'Join code',
        maxlength: 12,
        required: true,
        uppercase: true,
        placeholder: 'ABC234XY',
        alphabet: JOIN_ALPHABET,
      }],
    });
    if (!values) return;
    app.navigate('#join/' + String(values.code || '').trim().toUpperCase());
  },

  stashGuestCodeAndSignIn() {
    const el = document.getElementById('guest-code');
    const code = String((el && el.value) || '').trim().toUpperCase();
    if (code.length >= 4) {
      try { sessionStorage.setItem('pending_join', code); } catch { /* ignore */ }
    }
    if (window.auth) auth.showModal('login');
  },

  defaultJoinTeam(info) {
    const next = (info && info.nextTeamName) || 'Team 2';
    return next === 'Team 1' ? 'Team 2' : next;
  },

  joinableTeams(info) {
    return ((info && info.teams) || []).filter((t) => String(t.name || '').trim() !== 'Team 1');
  },

  renderJoinPicker(code, info) {
    const container = document.getElementById('app');
    const teams = (info && info.teams) || [];
    const hostTeam = teams.find((t) => t.name === 'Team 1');
    const joinTeams = this.joinableTeams(info);
    const nextName = (info && info.nextTeamName) || 'Team 2';
    const selected = this.defaultJoinTeam(info);
    const hostLabel = hostTeam ? (hostTeam.displayName || hostTeam.name) : 'Team 1';
    const chips = joinTeams.map((t) => {
      const on = t.name === selected ? ' is-on' : '';
      return `<button type="button" class="add-team-chip${on}" data-join-team="${_esc(t.name)}">${_esc(t.displayName || t.name)} · ${t.memberCount || 0}</button>`;
    }).join('');
    container.innerHTML = `
      <h2 class="section-title">Join ${ _esc((info && info.name) || 'Sunday game') }</h2>
      <form class="card join-picker" id="join-picker-form">
        <p class="card-subtitle">Code <strong>${_esc(code)}</strong>. Host is ${_esc(hostLabel)}. Pick Team 2+ or Add team — you are not auto Team 1.</p>
        <div class="add-team-picks" role="group" aria-label="Team">
          ${chips}
          <button type="button" class="add-team-more${selected === nextName && !teams.some((t) => t.name === nextName) ? ' is-on' : ''}" id="join-add-team" data-join-team="${_esc(nextName)}">Add team · ${_esc(nextName)}</button>
          <input type="hidden" id="join-team-name" name="teamName" value="${_esc(selected)}">
          <input type="hidden" id="join-add-flag" name="addTeam" value="${teams.some((t) => t.name === selected) ? '0' : '1'}">
        </div>
        <div class="form-group">
          <label>Team nickname (optional)</label>
          <input class="form-input" id="join-team-nick" name="teamNickname" maxlength="24" placeholder="e.g. Wolves">
        </div>
        <div class="form-group">
          <label>Your name on the card (optional)</label>
          <input class="form-input" id="join-display-name" name="displayName" maxlength="40" placeholder="${_esc((auth.currentUser && auth.currentUser.name) || 'Nickname')}">
        </div>
        <div class="card-footer">
          <button class="btn btn-primary" type="submit">Join this team</button>
        </div>
        <div class="form-error" id="join-picker-error"></div>
      </form>`;
    const form = document.getElementById('join-picker-form');
    const hidden = document.getElementById('join-team-name');
    const addFlag = document.getElementById('join-add-flag');
    form.querySelectorAll('[data-join-team]').forEach((btn) => {
      btn.addEventListener('click', () => {
        form.querySelectorAll('[data-join-team]').forEach((b) => b.classList.remove('is-on'));
        btn.classList.add('is-on');
        hidden.value = btn.getAttribute('data-join-team');
        addFlag.value = btn.id === 'join-add-team' ? '1' : '0';
      });
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('join-picker-error');
      try {
        const state = await svcApi('post', '/api/rounds/join', {
          code,
          teamName: hidden.value,
          addTeam: addFlag.value === '1',
          teamNickname: (document.getElementById('join-team-nick') || {}).value || '',
          displayName: (document.getElementById('join-display-name') || {}).value || '',
        });
        app.navigate('#round/' + state.round.id);
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
        else _toast(err.message, 'error');
      }
    });
  },

  async renderCreate() {
    const container = document.getElementById('app');
    if (!auth.currentUser) {
      container.innerHTML = '<div class="empty-state"><h3>Sign in to create a round</h3><button class="btn btn-primary" onclick="auth.showModal(\'login\')">Sign In</button></div>';
      return;
    }
    container.innerHTML = '<div class="loading">Loading courses...</div>';
    try {
      const courses = await svcApi('get', '/api/courses');
      const goldendale = courses.find((c) => c.name === 'Goldendale Golf Club') || courses[0];
      let tees = [];
      if (goldendale) {
        const detail = await svcApi('get', '/api/courses/' + goldendale.id);
        tees = detail.tees || [];
      }
      container.innerHTML = `
        <h2 class="section-title">New round</h2>
        <form class="card" id="create-round-form">
          <div class="form-group">
            <label>Round name</label>
            <input class="form-input" name="name" value="Goldendale Team Round" required>
          </div>
          <div class="form-group">
            <label>Course</label>
            <select class="form-input" name="courseId" id="create-course">
              ${courses.map((c) => `<option value="${c.id}" ${goldendale && c.id === goldendale.id ? 'selected' : ''}>${_esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Tee</label>
            <select class="form-input" name="teeId" id="create-tee">
              ${tees.map((t) => `<option value="${t.id}">${_esc(t.name)} · ${t.rating}/${t.slope}${t.yards_estimated ? ' (est. yards)' : ''}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Format</label>
            <select class="form-input" name="format" id="create-format">
              <option value="team_net" selected>Team vs par</option>
              <option value="match_play">Match play</option>
            </select>
          </div>
          <label class="check-row" id="create-team-race-row">
            <input type="checkbox" name="teamRace" checked>
            Sunday game
            ${typeof scorecard !== 'undefined' && scorecard.infoTip ? scorecard.infoTip('create-race', 'Sunday game is the default team vs-par race. 1G+2N or 1G+1N (or another format). OFF hides the Sunday game; side games can still run.') : ''}
          </label>
          <label class="check-row" id="create-show-other-row">
            <input type="checkbox" name="showOtherScores">
            Show other teams’ scores
            ${typeof scorecard !== 'undefined' && scorecard.infoTip ? scorecard.infoTip('create-show-other', 'Default OFF. Each team sees only its own scores on the live card. ON shows other teams read-only. Nobody can edit the other team.') : ''}
          </label>
          <div class="form-group" id="create-game-wrap">
            <label>Sunday game format ${typeof scorecard !== 'undefined' && scorecard.infoTip ? scorecard.infoTip('create-format', 'Best-combo vs-par. Goldendale default is 1G+2N. Also 1G+1N, 3G, 3N, 1G+3N, 2G+2N.') : ''}</label>
            <p class="game-rule" id="create-game-rule">${_esc(dashboard.gameRule('1G2N'))}</p>
            <select class="form-input" name="gameKey" id="create-game">
              ${dashboard.gameOptionsHtml('1G2N')}
            </select>
          </div>
          <div class="form-group">
            <label>Holes</label>
            <select class="form-input" name="holes">
              <option value="18">18 holes</option>
              <option value="front9">Front 9</option>
              <option value="back9">Back 9</option>
            </select>
          </div>
          <div class="form-group">
            <label>Team 1 name (optional)</label>
            <input class="form-input" name="team1Nickname" maxlength="24" placeholder="e.g. Birds">
          </div>
          <p class="card-subtitle">Handicap = Index only. Round at 0.5 (2.4→2, 2.5→3). Strokes by scorecard SI. No course handicap. You start on Team 1. Joiners pick Team 2+.</p>
          <label class="check-row" id="create-dual-row"><input type="checkbox" name="dualCount"> Dual-count (same player can count as gross and net)</label>
          <div class="form-group" id="create-side-games">
            <label>Side games</label>
            ${typeof scorecard !== 'undefined' && scorecard.sideGamesFieldsInner
              ? scorecard.sideGamesFieldsInner((window.sideGames && window.sideGames.parseSideGames(null)) || {})
              : ''}
          </div>
          <div class="card-footer">
            <button class="btn btn-primary" type="submit">Create round</button>
          </div>
        </form>`;

      const formatSel = document.getElementById('create-format');
      const gameSel = document.getElementById('create-game');
      const gameRule = document.getElementById('create-game-rule');
      const gameWrap = document.getElementById('create-game-wrap');
      const dualRow = document.getElementById('create-dual-row');
      const raceRow = document.getElementById('create-team-race-row');
      const showOtherRow = document.getElementById('create-show-other-row');
      const syncGameUi = () => {
        const teamMode = formatSel.value === 'team_net';
        if (gameWrap) gameWrap.hidden = !teamMode;
        if (dualRow) dualRow.hidden = !teamMode;
        if (raceRow) raceRow.hidden = !teamMode;
        if (showOtherRow) showOtherRow.hidden = !teamMode;
        if (gameRule && gameSel) gameRule.textContent = dashboard.gameRule(gameSel.value);
      };
      if (gameSel) gameSel.addEventListener('change', syncGameUi);
      if (formatSel) formatSel.addEventListener('change', syncGameUi);
      syncGameUi();
      if (typeof scorecard !== 'undefined' && scorecard.bindInfoTips) scorecard.bindInfoTips();

      document.getElementById('create-course').addEventListener('change', async (e) => {
        const detail = await svcApi('get', '/api/courses/' + e.target.value);
        const teeSel = document.getElementById('create-tee');
        teeSel.innerHTML = (detail.tees || []).map((t) =>
          `<option value="${t.id}">${_esc(t.name)} · ${t.rating}/${t.slope}${t.yards_estimated ? ' (est. yards)' : ''}</option>`
        ).join('');
      });

      document.getElementById('create-round-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const game = dashboard.gameFromKey(fd.get('gameKey'));
        try {
          const state = await svcApi('post', '/api/rounds', {
            name: fd.get('name'),
            courseId: Number(fd.get('courseId')),
            teeId: fd.get('teeId') ? Number(fd.get('teeId')) : null,
            format: fd.get('format'),
            holes: fd.get('holes'),
            allowance: 100,
            grossBalls: game.grossBalls,
            netBalls: game.netBalls,
            dualCount: fd.get('dualCount') === 'on',
            teamRace: fd.get('teamRace') === 'on',
            showOtherScores: fd.get('showOtherScores') === 'on',
            team1Nickname: fd.get('team1Nickname') || '',
            sideGames: typeof scorecard !== 'undefined' && scorecard.readSideGamesForm
              ? scorecard.readSideGamesForm(fd)
              : undefined,
          });
          app.navigate('#round/' + state.round.id);
        } catch (err) {
          _toast(err.message, 'error');
        }
      });
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${_esc(err.message)}</p></div>`;
    }
  },

  async renderProfile() {
    const container = document.getElementById('app');
    const user = auth.currentUser;
    if (!user) {
      container.innerHTML = '<div class="empty-state"><h3>Sign in to edit your profile</h3><button class="btn btn-primary" onclick="auth.showModal(\'login\')">Sign In</button></div>';
      return;
    }
    container.innerHTML = `
      <h2 class="section-title">Profile ${typeof scorecard !== 'undefined' && scorecard.infoTip ? scorecard.infoTip('profile', 'Your display name and handicap index. Index only — 2.4 rounds to 2, 2.5 to 3. No course handicap.') : ''}</h2>
      <form class="card" id="profile-form">
        <div class="form-group"><label>Display name</label><input class="form-input" name="name" value="${_esc(user.name || '')}" required></div>
        <div class="form-group"><label>Email</label><input class="form-input" value="${_esc(user.email || '')}" disabled></div>
        <div class="form-group"><label>Handicap index (optional) ${typeof scorecard !== 'undefined' && scorecard.infoTip ? scorecard.infoTip('profile-hcp', 'Index only. 2.4 rounds to 2, 2.5 to 3. That integer is applied by stroke index for every net game. No course handicap.') : ''}</label><input class="form-input" name="handicap" value="${_esc(user.handicap ?? '')}" placeholder="12.4 or +2"></div>
        <div class="form-group"><label>Home tee (optional)</label><input class="form-input" name="homeTee" value="${_esc(user.home_tee || '')}" placeholder="White/Blue"></div>
        <button class="btn btn-primary" type="submit">Save profile</button>
      </form>`;
    if (typeof scorecard !== 'undefined' && scorecard.bindInfoTips) scorecard.bindInfoTips();
    document.getElementById('profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const updated = await svcApi('put', '/api/auth/me', {
          name: fd.get('name'),
          handicap: fd.get('handicap') || null,
          homeTee: fd.get('homeTee') || null,
        });
        auth.setUser(updated);
        _toast('Profile saved', 'success');
      } catch (err) {
        _toast(err.message, 'error');
      }
    });
  },

  async renderCourses() {
    const container = document.getElementById('app');
    if (!auth.currentUser?.is_admin) {
      container.innerHTML = '<div class="empty-state"><h3>Admin only</h3><p>The first registered account can edit courses.</p></div>';
      return;
    }
    container.innerHTML = '<div class="loading">Loading courses...</div>';
    try {
      const courses = await svcApi('get', '/api/courses');
      container.innerHTML = `
        <h2 class="section-title">Courses</h2>
        <p class="card-subtitle">Goldendale is seeded. Red/Gold hole yards are labeled estimated when official split yardage is missing.</p>
        <div class="grid grid-2">${courses.map((c) => `
          <div class="card card-clickable" onclick="dashboard.renderCourseEdit(${c.id})">
            <div class="card-title">${_esc(c.name)}</div>
            <div class="card-subtitle">${_esc([c.address, c.city, c.state].filter(Boolean).join(', '))} · Par ${c.par} · ${c.num_holes} holes</div>
          </div>`).join('')}</div>
        <h3 class="section-title mt-lg">Add course</h3>
        <form class="card" id="add-course-form">
          <div class="form-group"><label>Name</label><input class="form-input" name="name" required></div>
          <div class="grid grid-2">
            <div class="form-group"><label>Holes</label><select class="form-input" name="num_holes"><option value="18">18</option><option value="9">9</option></select></div>
            <div class="form-group"><label>Par</label><input class="form-input" name="par" type="number" value="72"></div>
          </div>
          <button class="btn btn-primary" type="submit">Add course</button>
        </form>`;
      document.getElementById('add-course-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await svcApi('post', '/api/courses', { name: fd.get('name'), num_holes: Number(fd.get('num_holes')), par: Number(fd.get('par')) });
          dashboard.renderCourses();
        } catch (err) { _toast(err.message, 'error'); }
      });
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${_esc(err.message)}</p></div>`;
    }
  },

  async renderCourseEdit(id) {
    const container = document.getElementById('app');
    const course = await svcApi('get', '/api/courses/' + id);
    container.innerHTML = `
      <p><a href="#courses" onclick="event.preventDefault();app.navigate('#courses')">&larr; Courses</a></p>
      <h2 class="section-title">${_esc(course.name)}</h2>
      <form class="card" id="edit-course-form">
        <div class="form-group"><label>Name</label><input class="form-input" name="name" value="${_esc(course.name)}"></div>
        <div class="form-group"><label>Address</label><input class="form-input" name="address" value="${_esc(course.address || '')}"></div>
        <div class="grid grid-2">
          <div class="form-group"><label>City</label><input class="form-input" name="city" value="${_esc(course.city || '')}"></div>
          <div class="form-group"><label>State</label><input class="form-input" name="state" value="${_esc(course.state || '')}"></div>
        </div>
        <div class="form-group"><label>Notes</label><input class="form-input" name="notes" value="${_esc(course.notes || '')}"></div>
        <button class="btn btn-primary" type="submit">Save course</button>
      </form>
      <h3 class="section-title mt-lg">Tees</h3>
      ${(course.tees || []).map((t) => `<div class="card"><strong>${_esc(t.name)}</strong> · ${t.yards || '?'} yds · ${t.rating}/${t.slope} · ${t.gender}${t.yards_estimated ? ' · <em>estimated yards</em>' : ''}</div>`).join('')}
      <h3 class="section-title mt-lg">Holes</h3>
      <div class="scorecard-container">
        <table class="scorecard hole-admin">
          <thead><tr><th>Hole</th><th>Par</th><th>SI</th><th>Yds</th><th></th></tr></thead>
          <tbody>
            ${(course.holes || []).map((h) => `
              <tr>
                <td>${h.hole_number}</td>
                <td><input class="score-input" data-hole="${h.hole_number}" data-f="par" value="${h.par}"></td>
                <td><input class="score-input" data-hole="${h.hole_number}" data-f="si" value="${h.stroke_index}"></td>
                <td><input class="score-input" data-hole="${h.hole_number}" data-f="yards" value="${h.yards || ''}">${h.yards_estimated ? '<span class="est-label">est.</span>' : ''}</td>
                <td></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <button class="btn btn-primary mt-md" id="save-holes">Save holes</button>`;

    document.getElementById('edit-course-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await svcApi('put', '/api/courses/' + id, {
        name: fd.get('name'), address: fd.get('address'), city: fd.get('city'), state: fd.get('state'), notes: fd.get('notes'),
      });
      _toast('Course saved', 'success');
    });
    document.getElementById('save-holes').addEventListener('click', async () => {
      const holes = {};
      container.querySelectorAll('[data-hole]').forEach((input) => {
        const n = input.dataset.hole;
        holes[n] = holes[n] || { hole_number: Number(n) };
        if (input.dataset.f === 'par') holes[n].par = Number(input.value);
        if (input.dataset.f === 'si') holes[n].stroke_index = Number(input.value);
        if (input.dataset.f === 'yards') holes[n].yards = input.value === '' ? null : Number(input.value);
      });
      await svcApi('put', '/api/courses/' + id, { holes: Object.values(holes) });
      _toast('Holes saved', 'success');
    });
  },
};

const JOIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function _esc(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

function _formPrompt({ title, submitLabel, fields }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('app-form-modal');
    const form = document.getElementById('app-form');
    const fieldsEl = document.getElementById('app-form-fields');
    const titleEl = document.getElementById('app-form-title');
    const submitBtn = document.getElementById('app-form-submit');
    const errEl = document.getElementById('app-form-error');
    if (!modal || !form || !fieldsEl) {
      resolve(null);
      return;
    }
    titleEl.textContent = title || 'Enter details';
    submitBtn.textContent = submitLabel || 'Save';
    errEl.textContent = '';
    fieldsEl.innerHTML = (fields || []).map((f, i) => {
      if (f.type === 'select' && f.options) {
        return `<div class="form-group">
          <label for="app-form-f-${i}">${_esc(f.label)}</label>
          <select id="app-form-f-${i}" class="form-input" name="${_esc(f.name)}">
            ${f.options.map((o) => `<option value="${_esc(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${_esc(o.label)}</option>`).join('')}
          </select>
        </div>`;
      }
      return `<div class="form-group">
        <label for="app-form-f-${i}">${_esc(f.label)}</label>
        <input id="app-form-f-${i}" class="form-input${f.alphabet ? ' join-code-input' : ''}"
          name="${_esc(f.name)}" type="${f.type === 'select' ? 'text' : (f.type || 'text')}" value="${_esc(f.value ?? '')}"
          ${f.maxlength ? `maxlength="${f.maxlength}"` : ''}
          ${f.required ? 'required' : ''}
          ${f.placeholder ? `placeholder="${_esc(f.placeholder)}"` : ''}
          ${f.uppercase ? 'style="text-transform:uppercase"' : ''}
          autocomplete="off">
      </div>`;
    }).join('');
    modal.classList.add('active');
    const inputs = [...fieldsEl.querySelectorAll('input')];
    inputs.forEach((input, i) => {
      const field = fields[i];
      if (field && field.alphabet) {
        input.addEventListener('input', () => {
          const next = input.value.toUpperCase().split('').filter((ch) => field.alphabet.includes(ch)).join('');
          input.value = next;
        });
      }
    });
    if (inputs[0]) inputs[0].focus();

    const finish = (value) => {
      cleanup();
      modal.classList.remove('active');
      resolve(value);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      const values = {};
      (fields || []).forEach((f, i) => {
        let v = document.getElementById('app-form-f-' + i).value;
        if (f.uppercase) v = v.toUpperCase();
        if (f.alphabet) v = v.split('').filter((ch) => f.alphabet.includes(ch)).join('');
        values[f.name] = v;
      });
      const codeField = (fields || []).find((f) => f.name === 'code' && f.alphabet);
      if (codeField) {
        const code = values.code || '';
        if (code.length < 6 || code.length > 12 || [...code].some((ch) => !JOIN_ALPHABET.includes(ch))) {
          errEl.textContent = 'Enter the join code (no 0, O, 1, or I).';
          return;
        }
      }
      finish(values);
    };
    const onCancel = () => finish(null);
    const cleanup = () => {
      form.removeEventListener('submit', onSubmit);
      document.getElementById('app-form-cancel').onclick = null;
      document.getElementById('app-form-close').onclick = null;
    };
    form.addEventListener('submit', onSubmit);
    document.getElementById('app-form-cancel').onclick = onCancel;
    document.getElementById('app-form-close').onclick = onCancel;
  });
}

function _toast(message, type) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' toast-' + type : '');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

window.dashboard = dashboard;
window._esc = _esc;
window._toast = _toast;
window._formPrompt = _formPrompt;
window.JOIN_ALPHABET = JOIN_ALPHABET;
