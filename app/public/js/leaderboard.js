/**
 * Leaderboard View
 */
const leaderboardView = {
  async render() {
    const container = document.getElementById('app');
    container.innerHTML = '<div class="loading">Loading leaderboard...</div>';

    try {
      const leaderboard = await api.get('/api/leaderboard');
      const user = auth.currentUser;

      container.innerHTML = `
        <h2 class="section-title">Leaderboard</h2>
        <div class="card">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>HCP</th>
                <th>Played</th>
                <th>W</th>
                <th>L</th>
                <th>H</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              ${leaderboard.map((p, i) => {
                const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
                const userClass = p.player_id === user?.id ? 'current-user' : '';
                return `
                  <tr class="${rankClass} ${userClass}">
                    <td class="rank-cell">${i + 1}</td>
                    <td style="font-weight:600">${p.name}</td>
                    <td>${p.handicap}</td>
                    <td>${p.matches_played}</td>
                    <td style="color:var(--success);font-weight:600">${p.wins}</td>
                    <td style="color:var(--danger);font-weight:600">${p.losses}</td>
                    <td style="color:var(--halved);font-weight:600">${p.halves}</td>
                    <td class="points-cell">${p.points}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        ${leaderboard.length === 0 ? `
          <div class="empty-state">
            <div class="emoji">&#127942;</div>
            <h3>No matches completed yet</h3>
            <p>Standings will appear once matches are finalized.</p>
          </div>
        ` : ''}

        <h2 class="section-title">Tournament Rules</h2>
        <div class="card">
          <ul style="padding-left:1.5rem;line-height:2">
            <li>All 28 unique match pairings covered across 5 rounds</li>
            <li>Every player shares a foursome with every other player at least once</li>
            <li>No match repeats more than twice</li>
            <li>Front 9 and Back 9 have different opponents within your foursome</li>
            <li>Scoring: Win = 1 point, Halve = 0.5 points, Loss = 0 points</li>
            <li>Handicap strokes applied per hole based on stroke index</li>
          </ul>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
    }
  }
};

window.leaderboardView = leaderboardView;
