const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'public/js/scorecard.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public/css/styles.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');

function sliceFn(name, nextName) {
  const start = src.indexOf(name);
  const end = src.indexOf(nextName, start + 1);
  assert.ok(start >= 0 && end > start, name + ' must exist');
  return src.slice(start, end);
}

describe('Combined PR3 hole view', () => {
  it('groups names with their team inside one #hole-players list', () => {
    const fn = sliceFn('holePlayersHtml(state, holeNumber)', 'drawHoleView(state)');
    assert.match(fn, /groupedMembers/);
    assert.match(fn, /hole-team-group/);
    assert.match(fn, /hole-team-head/);
    assert.match(fn, /teamDisplay/);
    assert.match(fn, /oneHoleTeamTotal/);
    assert.match(fn, /id="hole-players"/);
    assert.match(src, /hole-player-row/);
  });

  it('paints net next to the hole-row gross', () => {
    const fn = sliceFn('holePlayerRowHtml(state, member, holeNumber, team)', 'holePlayersHtml(state, holeNumber)');
    assert.match(fn, /net-mini/);
    assert.match(fn, /score-input/);
  });

  it('keeps Hole + race and drops title, par-si, and end-totals from hole view', () => {
    const fn = sliceFn('drawHoleView(state) {', 'holeNavButtonsHtml(holeNumber)');
    assert.match(fn, /hole-number/);
    assert.match(fn, /liveGameTitleHtml|live-game-title/);
    assert.match(fn, /race-strip/);
    assert.match(fn, /holePlayersHtml/);
    assert.doesNotMatch(fn, /end-totals/);
    assert.doesNotMatch(fn, /card-title/);
    assert.doesNotMatch(fn, /hole-meta/);
    assert.doesNotMatch(fn, /scoreTable\(/);
  });

  it('stepper default bar is minus / number / plus / Done, not Clear', () => {
    const fn = sliceFn('stepperInnerHtml()', 'renderHoleNav()');
    assert.match(fn, /score-minus/);
    assert.match(fn, /score-plus/);
    assert.match(fn, /score-overlay-input/);
    assert.match(fn, /score-done/);
    assert.doesNotMatch(fn, /score-clear/);
  });

  it('Prev/Next patches the current hole instead of draw()', () => {
    const fn = sliceFn('shiftHole(delta)', 'drawFullCard(state)');
    assert.match(fn, /retargetHoleView/);
    assert.match(fn, /paintScoreCell/);
    assert.match(fn, /paintTeamHole/);
    assert.match(fn, /paintCurrentHoleChrome/);
    assert.match(fn, /keepMember/);
    assert.ok(!/this\.draw\(this\.state\);\s*this\.currentHole/.test(fn));
  });

  it('keeps P0 fetch fallback above every /js file and a fresh asset token', () => {
    const fallbackAt = html.indexOf('function rawGet');
    const apiTagAt = html.indexOf('js/api.js');
    assert.ok(fallbackAt >= 0 && fallbackAt < apiTagAt);
    assert.match(html, /20260910c/);
    assert.match(html, /js\/formats\.js\?v=20260910c/);
    assert.match(html, /js\/sideGames\.js\?v=20260910c/);
    assert.match(html, /js\/nineteen\.js\?v=20260910c/);
    assert.match(html, /js\/scoreAdvance\.js\?v=20260910c/);
    assert.match(html, /js\/teamFillSpin\.js\?v=20260910c/);
    assert.match(src, /ASSET_V:\s*'20260910c'/);
  });

  it('shows the shared join code at the top of hole view and full card', () => {
    const hole = sliceFn('drawHoleView(state) {', 'holeNavButtonsHtml(holeNumber)');
    const full = sliceFn('drawFullCard(state) {', 'scoreTable(state, holes, outHoles, inHoles)');
    const bar = sliceFn('joinCodeBarHtml(state) {', 'toolbar(state, extra)');
    assert.match(hole, /joinCodeBarHtml/);
    assert.match(full, /joinCodeBarHtml/);
    assert.ok(hole.indexOf('joinCodeBarHtml') < hole.indexOf('eighteenBanner'), 'join code is above the 19th banner');
    assert.ok(hole.indexOf('eighteenBanner') < hole.indexOf('holeToolbar'), '19th banner sits at the top of the live card');
    assert.ok(full.indexOf('joinCodeBarHtml') < full.indexOf('eighteenBanner'), 'join code is above the full-card 19th banner');
    assert.ok(full.indexOf('eighteenBanner') < full.indexOf('toolbar(state'), '19th banner sits above the full-card toolbar');
    assert.ok(hole.indexOf('joinCodeBarHtml') < hole.indexOf('holeToolbar'), 'join code is above hole toolbar');
    assert.ok(full.indexOf('joinCodeBarHtml') < full.indexOf('toolbar(state'), 'join code is above full-card toolbar');
    assert.match(bar, /live-join-bar/);
    assert.match(bar, /live-join-code/);
    assert.match(bar, /Copy/);
    assert.match(bar, /copyJoinCode/);
    assert.match(src, /copyJoinCode\(\)/);
    assert.match(css, /\.live-join-code\s*\{[^}]*font-size:\s*1\.35rem/);
    assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.live-join-code\s*\{[^}]*font-size:\s*1\.25rem/);
    assert.match(css, /\.live-join-copy\s*\{[^}]*min-height:\s*44px/);
    const dash = fs.readFileSync(path.join(ROOT, 'public/js/dashboard.js'), 'utf8');
    assert.match(dash, /maxlength="12"/);
    assert.match(dash, /code\.length < 6 \|\| code\.length > 12/);
    assert.doesNotMatch(dash, /6-character join code/);
  });

  it('hole scoring toolbar is Back plus one overflow', () => {
    const draw = sliceFn('drawHoleView(state) {', 'holeNavButtonsHtml(holeNumber)');
    assert.match(draw, /holeToolbar/);
    assert.doesNotMatch(draw, /See dashboard/);
    assert.match(draw, /hole-full-card-btn/);
    assert.match(draw, /setCardMode\('full'\)/);
    const bar = sliceFn('holeToolbar(state) {', 'bindHoleOverflowDismiss');
    assert.match(bar, />Back</);
    assert.match(bar, /hole-overflow/);
    assert.match(bar, /Full card/);
    assert.match(bar, /Settings/);
    assert.doesNotMatch(bar, /confirmPress/);
    assert.doesNotMatch(bar, /nassauToolbarPressHtml/);
    assert.doesNotMatch(bar, /See dashboard/);
    assert.doesNotMatch(bar, /Edit presses/);
    assert.doesNotMatch(bar, /Undo last press/);
    assert.doesNotMatch(bar, /Missed a press/);
    const hole = sliceFn('drawHoleView(state) {', 'holeNavButtonsHtml(holeNumber)');
    assert.doesNotMatch(hole, /Press/);
    assert.doesNotMatch(hole, /vegasPressButtonHtml|nassauLiveDockHtml|ninesBoardHtml|wolfBarHtml|pressedHolesBarHtml/);
    assert.match(src, /id="hole-players"/);
    assert.match(src, /patchUI\(\)/);
  });

  it('team balls and vs-par are at least 0.875rem', () => {
    assert.match(css, /\.team-balls[\s\S]{0,160}font-size:\s*0\.875rem/);
    assert.match(css, /\.vs-par-lines[\s\S]{0,160}font-size:\s*0\.875rem/);
    assert.match(css, /flex-wrap:\s*nowrap/);
  });

  it('race strip and Team N totals format vs-par, not stroke sums', () => {
    const race = sliceFn('raceStripText(state)', 'fillSeatLabel(member, team)');
    assert.match(race, /fmtTeam/);
    assert.match(race, /Sunday game /);
    assert.doesNotMatch(race, /vegasStripText/);
    assert.match(src, /fmtTeam\(winner\.total\)/);
    assert.match(src, /fmtTeam\(team\.total\)/);
    assert.match(src, /Sunday game/);
    const holeDraw = sliceFn('drawHoleView(state) {', 'holeNavButtonsHtml(holeNumber)');
    assert.match(holeDraw, /race-strip/);
    assert.match(holeDraw, /oneHoleTeamTotal|holePlayersHtml/);
    assert.doesNotMatch(holeDraw, /vegasPressButtonHtml|nassauLiveDockHtml|ninesBoardHtml|wolfBarHtml|pressedHolesBarHtml|confirmPress/);
    const fullCard = sliceFn('drawFullCard(state) {', 'scoreTable(state, holes, outHoles, inHoles)');
    assert.doesNotMatch(fullCard, /nassauToolbarPressHtml|nassauLiveDockHtml|vegasPressButtonHtml|pressedHolesBarHtml/);
    assert.match(css, /\.hole-team-head/);
  });

  it('marks gross birdie/eagle/bogey on the live card, not Standard', () => {
    const mark = sliceFn('scoreMarkKind(gross, par, standard)', 'cellClassList(hs, par)');
    assert.match(mark, /vs-eagle/);
    assert.match(mark, /vs-birdie/);
    assert.match(mark, /vs-bogey/);
    assert.match(mark, /vs-double/);
    const cell = sliceFn('cellClassList(hs, par)', 'paintScoreCell(memberId, holeNumber)');
    assert.match(cell, /hs\?\.gross/);
    assert.match(cell, /isStandardScorecard/);
    assert.match(cell, /has-score-mark/);
    assert.match(cell, /mark-/);
    assert.match(css, /\.has-score-mark\.mark-birdie/);
    assert.match(css, /\.has-score-mark\.mark-eagle/);
    assert.match(css, /\.has-score-mark\.mark-bogey/);
    assert.match(css, /\.has-score-mark\.mark-double/);
    assert.match(css, /border-radius:\s*50%/);
    assert.match(src, /double square/);
  });

  it('lets a joined non-organizer add players onto their own team', () => {
    const gate = sliceFn('canAddPlayer(state)', 'myTeamName(state)');
    assert.match(gate, /isOrganizer/);
    assert.match(gate, /myMember/);
    assert.match(src, /canAddPlayer\(state\)/);
    const panel = sliceFn('addPlayerPanel(state)', 'addPlayerPanelInner(state)');
    assert.match(panel, /canAddPlayer/);
    assert.doesNotMatch(panel, /isOrganizer\(state\)\) return ''/);
    assert.match(src, /myTeamName\(state\)/);
    const chips = sliceFn('addTeamChipsHtml(selected)', 'addExtraTeam()');
    assert.match(chips, /isOrganizer/);
    assert.match(chips, /myTeamName/);
    const extra = sliceFn('addExtraTeam()', 'snapshotAddPlayer()');
    assert.match(extra, /isOrganizer\(this\.state\)\) return/);
    const routes = fs.readFileSync(path.join(ROOT, 'lib/routes/scoreRounds.js'), 'utf8');
    assert.match(routes, /canAddGuestToTeam/);
    assert.match(routes, /You can only add players to your own team/);
    assert.match(routes, /findExistingTeamId/);
  });

  it('shows This hole on the full card so phone users can leave Full card', () => {
    const full = sliceFn('drawFullCard(state) {', 'scoreTable(state, holes, outHoles, inHoles)');
    assert.match(full, /This hole/);
    assert.match(full, /setCardMode/);
    assert.match(full, /hole-this-hole/);
    assert.match(css, /\.hole-full-card-btn/);
    assert.match(css, /\.hole-number-row/);
  });

  it('live add-player is name, HCP, and Team 1 / 2 / 3 chips in one flow', () => {
    const panel = sliceFn('addPlayerPanelInner(state) {', 'addTeamNames(state)');
    assert.match(panel, /live-add-guest-name/);
    assert.match(panel, /live-add-guest-hcp/);
    assert.match(panel, /addTeamChipsHtml/);
    assert.match(panel, /Save player/);
    const names = sliceFn('addTeamNames(state)', 'nextAddTeamName(state)');
    assert.match(names, /Team 1/);
    assert.match(names, /Team 2/);
    assert.match(names, /Team 3/);
    const chips = sliceFn('addTeamChipsHtml(selected)', 'snapshotAddPlayer()');
    assert.match(chips, /add-team-chip/);
    assert.match(chips, /add-extra-team/);
    assert.match(chips, /Add team/);
    assert.match(src, /addExtraTeam\(/);
    assert.match(src, /nextAddTeamName/);
    assert.doesNotMatch(panel, /<select/);
  });

  it('opens add-player in place without a full draw', () => {
    const open = sliceFn('openAddPlayer(e)', 'closeAddPlayer()');
    assert.match(open, /mountAddPlayerPanel/);
    assert.doesNotMatch(open, /this\.draw\(/);
    const close = sliceFn('closeAddPlayer()', 'bindAddPlayerPanel()');
    assert.match(close, /mountAddPlayerPanel/);
    assert.doesNotMatch(close, /this\.draw\(/);
  });

  it('keeps the live add-player sheet open after save', () => {
    const fn = sliceFn('addGuestFromForm(which)', 'addBulkGuests()');
    assert.doesNotMatch(fn, /addPlayerOpen = false/);
    assert.match(fn, /addPlayerOpen = \(state\.members/);
    assert.match(fn, /_preserveAddDraft/);
  });

  it('poll and patch skip a full redraw while add-player is held', () => {
    const live = sliceFn('async refreshLive(id)', 'applyLivePatch(patch)');
    assert.match(live, /shouldHoldAddPlayer/);
    const patch = sliceFn('patchUI()', 'openEditor(');
    assert.match(patch, /shouldHoldAddPlayer/);
    assert.match(src, /shouldHoldAddPlayer\(\)/);
  });

  it('puts each team total under that team and skips Individual groups on the hole list', () => {
    const players = sliceFn('holePlayersHtml(state, holeNumber)', 'holeToolbar(state)');
    assert.match(players, /group\.team/);
    assert.match(players, /oneHoleTeamTotal/);
    assert.match(src, /teamRunThrough/);
    assert.match(src, /data-team-run/);
    assert.match(src, />Running</);
    const holeTotal = sliceFn('oneHoleTeamTotal(state, team, holeNumber)', 'kpPickerHtml(state, holeNumber)');
    assert.match(holeTotal, /Running/);
    assert.match(holeTotal, /teamRunText/);
    assert.match(holeTotal, /canSeeTeamScores/);
    const teamRow = sliceFn('oneTeamRow(state, team, holes, showOut, showIn) {', 'oneVegasRow(state, team, holes, showOut, showIn)');
    assert.match(teamRow, /data-team-run/);
    assert.match(teamRow, /Running/);
    assert.match(teamRow, /canSeeTeamScores/);
    assert.match(teamRow, /data-team-out/);
    assert.match(players, /isVegasOn/);
    assert.match(players, /oneHoleTeamTotal/);
    assert.match(players, /visibleHoleMembers|group\.team &&/);
    assert.match(src, /Go to the 19th hole/);
    assert.match(src, /Skip → 19th/);
    assert.match(src, /openFillSpin/);
    assert.match(src, /shouldOfferFillBeforeNineteenth/);
    assert.match(src, /shortTeams/);
    assert.match(src, /isStandardScorecard/);
    assert.match(src, /Standard scorecard/);
    assert.doesNotMatch(src, /got-beer-btn|Got beer\?/);
    assert.match(src, /canOpenNineteenth/);
    assert.match(src, /openNineteenth/);
    assert.match(src, /nineteenthNeedsConfirm/);
    assert.match(src, /writableRosterComplete|canWriteMember/);
    assert.doesNotMatch(sliceFn('canOpenNineteenth(state) {', 'nineteenthNeedsConfirm(state)'), /isShowOtherScoresOn/);
    assert.match(css, /\.eighteen-done\s*\{[^}]*position:\s*sticky/);
    assert.match(src, /drawGameRules/);
    assert.match(src, /drawNineteenth/);
    assert.match(src, /info-tip/);
    assert.match(src, /isTeamRaceOn/);
    assert.match(src, /liveGameTitle/);
    assert.match(src, /canWriteMember/);
    assert.match(src, /is-readonly/);
    assert.match(src, /setScoreAdvance/);
    assert.match(src, /score-advance/);
    assert.match(src, /nextDownTarget|nextAdvanceTarget/);
    assert.match(src, /writableAdvanceOrder/);
    const advance = sliceFn('nextAdvanceTarget(memberId, holeNumber) {', 'focusNextHole(memberId, holeNumber)');
    assert.match(advance, /organizer:\s*this\.isOrganizer/);
    const down = sliceFn('focusNextHole(memberId, holeNumber) {', 'paintCurrentHoleChrome()');
    assert.match(down, /nextAdvanceTarget/);
    assert.match(down, /retargetHoleView/);
    assert.doesNotMatch(down, /if \(!next\) return;/);
    assert.match(src, /Gross must be 1–19/);
    assert.match(src, /readGrossTyping/);
    assert.match(src, /dataset\.pending/);
    assert.match(src, /type="tel"/);
    assert.match(src, /ONE_DIGIT_MS/);
    assert.match(src, /playPodiumReveal/);
    const podium = sliceFn('playPodiumReveal()', 'drawNineteenth(state)');
    assert.match(podium, /\['3rd', '2nd', '1st'\]/);
    assert.match(podium, /nineteenth-confetti/);
    assert.match(src, /revealNineteenthCard/);
    const nineteenth = sliceFn('drawNineteenth(state) {', 'window.scorecard');
    assert.match(nineteenth, /revealCardHtml\('front'/);
    assert.match(nineteenth, /revealCardHtml\('back'/);
    assert.match(nineteenth, /revealCardHtml\('overall'/);
    assert.doesNotMatch(nineteenth, /revealCardHtml\('skins'/);
    assert.doesNotMatch(nineteenth, /wyrmCoil/);
    assert.match(src, /data-reveal=/);
    assert.match(nineteenth, /share-strip/);
    assert.match(src, /shareNineteenth/);
    assert.match(src, /nineteenthSharePng/);
    assert.match(css, /\.podium-place/);
    assert.match(css, /\.reveal-card/);
    const holeRow = sliceFn('holePlayerRowHtml(state, member, holeNumber, team)', 'playerNineLineHtml(state, member)');
    assert.match(holeRow, /canWriteMember/);
    assert.match(holeRow, /focusHoleScore/);
    assert.doesNotMatch(holeRow, /wolfHoldsScoring/);
    const writeLock = sliceFn('canWriteMember(state, member) {', 'lockScoreInputs()');
    assert.doesNotMatch(writeLock, /isWolfOn/);
    assert.match(writeLock, /isOrganizer/);
    assert.doesNotMatch(writeLock, /is_admin/);
    assert.match(writeLock, /shareAnyTeam/);
    assert.match(writeLock, /isFollowAlong/);
    assert.match(src, /followAlongBarHtml/);
    assert.match(src, /setFollowShowOther/);
    assert.match(src, /follow-view/);
    assert.match(src, /See other teams/);
    assert.match(src, /Host is hiding other teams/);
    assert.match(src, /isShowOtherScoresOn\(state\) && this\.followShowOtherOn/);
    assert.match(css, /\.follow-along-bar/);
    assert.match(css, /\.follow-board-btn/);
    const dashJoin = fs.readFileSync(path.join(ROOT, 'public/js/dashboard.js'), 'utf8');
    assert.match(dashJoin, /data-join-role="follower"/);
    assert.match(dashJoin, /data-join-role="player"/);
    assert.match(dashJoin, /Follow along/);
    const appSrcJoin = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
    assert.match(appSrcJoin, /ensureSession/);
    assert.match(src, /canManageRosterMember/);
    assert.match(src, /removeMember\(/);
    assert.match(src, /confirmRemoveMember/);
    assert.match(src, /saveRosterHcp/);
    assert.match(src, /refreshStrokeDots/);
    assert.match(src, /setup-roster-hcp-input/);
    assert.match(src, /setupRosterHtml/);
    assert.match(src, /playing_handicap/);
    const rosterChange = sliceFn('rosterChanged(patch) {', 'applyLivePatch(patch)');
    assert.match(rosterChange, /playing_handicap/);
    assert.match(rosterChange, /sameTeamOrEmpty/);
    assert.match(rosterChange, /fill_team_id/);
    assert.match(src, /nineTotalsBarHtml/);
    assert.match(src, /joinCardRow/);
    assert.match(src, />OUT</);
    assert.match(src, />TOT</);
    assert.match(css, /\.nine-totals-bar/);
    assert.match(css, /\.setup-roster-row/);
    assert.match(css, /\.setup-roster-hcp-input/);
    assert.match(src, /lockScoreInputs\(\)/);
    assert.match(src, /canSeeMemberScores/);
    assert.match(src, /canSeeTeamScores/);
    assert.match(src, /isShowOtherScoresOn/);
    assert.match(src, /showOtherScores/);
    assert.match(src, /Show other teams/);
    assert.match(src, /is-score-hidden/);
    const dash = fs.readFileSync(path.join(ROOT, 'public/js/dashboard.js'), 'utf8');
    assert.match(dash, /name="showOtherScores"/);
    assert.doesNotMatch(dash, /name="showOtherScores" checked/);
    const routes = fs.readFileSync(path.join(ROOT, 'lib/routes/scoreRounds.js'), 'utf8');
    assert.match(routes, /parseJoinRole/);
    assert.match(routes, /follow-view/);
    assert.match(routes, /Follow along is read-only/);
    assert.match(routes, /presses\/last/);
    assert.match(routes, /No press to undo/);
    assert.match(routes, /function canPress/);
    const canScoreAt = routes.indexOf('function canScore');
    const canManageAt = routes.indexOf('function canManageMember', canScoreAt);
    const canScoreFn = routes.slice(canScoreAt, canManageAt > canScoreAt ? canManageAt : canScoreAt + 400);
    assert.match(canScoreFn, /canWriteTeamScore/);
    assert.doesNotMatch(canScoreFn, /wolfGameOn/);
    assert.doesNotMatch(canScoreFn, /is_admin/);
    assert.match(canScoreFn, /isOrganizer/);
    assert.match(routes, /canManageMember/);
    assert.match(routes, /You can only remove players from your own team/);
    assert.match(routes, /DELETE FROM score_holes WHERE member_id = \? AND round_id/);
    assert.match(src, /playerNineLineHtml/);
    assert.match(src, /showOut/);
    assert.match(src, /showIn/);
    const settings = sliceFn('settingsBar(state)', 'groupedMembers(state)');
    assert.doesNotMatch(settings, />Individual</);
    assert.doesNotMatch(settings, /Allowance/);
    assert.match(settings, /HCP = Index only/);
    assert.match(settings, /Sunday game/);
    assert.match(settings, /Show other teams/);
    assert.match(settings, /1G1N|1G\+1N/);
    assert.match(src, /Sunday game · /);
    assert.match(src, /<h3>Sunday game<\/h3>/);
    assert.match(css, /\.info-pop:not\(\[hidden\]\)/);
  });

  it('does not show press or side-game chrome on the live card', () => {
    const hole = sliceFn('drawHoleView(state) {', 'holeNavButtonsHtml(holeNumber)');
    const full = sliceFn('drawFullCard(state) {', 'scoreTable(state, holes, outHoles, inHoles)');
    const bar = sliceFn('holeToolbar(state) {', 'bindHoleOverflowDismiss');
    const settings = sliceFn('settingsBar(state)', 'groupedMembers(state)');
    assert.doesNotMatch(hole, /pressedHolesBarHtml|vegasPressButtonHtml|nassauLiveDockHtml|ninesBoardHtml|wolfBarHtml|confirmPress/);
    assert.doesNotMatch(full, /pressedHolesBarHtml|vegasPressButtonHtml|nassauToolbarPressHtml|nassauLiveDockHtml/);
    assert.doesNotMatch(bar, /confirmPress|Edit presses|Undo last press|Missed a press/);
    assert.doesNotMatch(settings, /sideGamesFieldsInner|Save side games|vegasOn|nassauOn|wolfOn|ninesOn|skinsOn/);
    assert.match(src, /isVegasOn\(_state\) \{\s*return false;/);
    assert.match(src, /isNassauOn\(_state\) \{\s*return false;/);
    assert.match(src, /isWolfOn\(_state\) \{\s*return false;/);
    assert.match(src, /isNinesOn\(_state\) \{\s*return false;/);
    assert.match(src, /pressableGames\(_state\) \{\s*return \[\];/);
  });

  it('fill spin shuffles each tap and Accept redraws roster plus live card', () => {
    const fill = fs.readFileSync(path.join(ROOT, 'public/js/teamFillSpin.js'), 'utf8');
    assert.match(fill, /function shuffleFillPool/);
    assert.match(fill, /function fairIndex/);
    assert.match(fill, /crypto\.getRandomValues/);
    assert.match(fill, /shuffled\[0\]/);
    assert.doesNotMatch(fill, /lastWinner/);
    const spin = sliceFn('runFillSpin() {', 'applyAcceptedFill(next)');
    assert.match(spin, /shuffleFillPool/);
    assert.match(spin, /reelOrder = shuffled/);
    assert.match(spin, /reelOrder = \[winner\]/);
    const accept = sliceFn('acceptFillSpin() {', 'manageableMembers(state)');
    assert.match(accept, /applyAcceptedFill/);
    assert.match(accept, /showFilledScorecard/);
    assert.match(accept, /team-fill/);
    const show = sliceFn('showFilledScorecard(next) {', 'acceptFillSpin()');
    assert.match(show, /this\.screen = 'play'/);
    assert.match(show, /this\.draw\(next\)/);
    const groups = sliceFn('groupedMembers(state) {', 'playerRows(state, holes, outHoles, inHoles, showOut, showIn)');
    assert.match(groups, /memberOnTeam/);
    assert.doesNotMatch(groups, /m\.team_id === team\.id/);
    assert.match(src, /Each Spin shuffles every eligible name/);
    assert.match(src, /leaves them on their original team/);
    assert.match(src, /fillSeatLabel/);
    assert.match(src, /rosterFillNote/);
    assert.match(css, /\.fill-spin-cell\.is-landed/);
    assert.match(css, /\.fill-seat/);
    const routes = fs.readFileSync(path.join(ROOT, 'lib/routes/scoreRounds.js'), 'utf8');
    const fillAt = routes.indexOf("router.post('/:id/team-fill'");
    const fillFn = routes.slice(fillAt, fillAt + 1800);
    assert.match(fillFn, /SET fill_team_id/);
    assert.match(fillFn, /memberOnTeam/);
  });

  it('hole Back is a button so a leftover tap cannot change the hash', () => {
    const bar = sliceFn('holeToolbar(state) {', 'bindHoleOverflowDismiss');
    assert.match(bar, /type="button"/);
    assert.match(bar, /id="hole-back"/);
    assert.doesNotMatch(bar, /href="#dashboard"/);
  });
});

describe('Game select vs-par formats', () => {
  it('create form lists the five games and outlines the calculation', () => {
    const dash = fs.readFileSync(path.join(ROOT, 'public/js/dashboard.js'), 'utf8');
    assert.match(dash, /create-game-rule/);
    const ruleAt = dash.indexOf('id="create-game-rule"');
    const gameSelAt = dash.indexOf('id="create-game"');
    assert.ok(ruleAt >= 0 && gameSelAt > ruleAt, 'rule text sits above the game select');
    assert.match(dash, /1G2N/);
    assert.match(dash, /1G1N/);
    assert.match(dash, /Sunday game/);
    assert.match(dash, /gameRule/);
    assert.doesNotMatch(dash, /create-side-games/);
    assert.doesNotMatch(dash, /sideGamesFieldsInner/);
    assert.match(dash, /quietSideGames/);
    assert.match(dash, /create-team-race-row/);
    assert.match(dash, /name="teamRace"/);
    assert.match(dash, /name="showOtherScores"/);
    assert.match(dash, /create-show-other-row/);
    assert.match(dash, /team1Nickname/);
    assert.match(dash, /renderJoinPicker/);
    assert.match(dash, /not auto Team 1/);
    assert.match(dash, /joinableTeams/);
    assert.match(dash, /stashGuestCodeAndSignIn/);
    assert.match(dash, /pending_join/);
    const appSrc = fs.readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
    assert.match(appSrc, /join-info/);
    assert.match(appSrc, /resumePendingJoin/);
    assert.match(src, /Join code teams/);
    assert.match(src, /saveTeamNickname/);
    assert.doesNotMatch(src, /birdieSlotsOn/);
    assert.doesNotMatch(src, /Birdie dragon slots/);
  });
});

describe('Wyrm Coil overlay', () => {
  it('stays off the Sunday 19th path and never copies casino names', () => {
    const coil = fs.readFileSync(path.join(ROOT, 'public/js/wyrmCoil.js'), 'utf8');
    assert.match(coil, /Wyrm Coil/);
    assert.doesNotMatch(coil, /Dragon Link/);
    assert.doesNotMatch(coil, /Dragon Spin/);
    assert.doesNotMatch(coil, /Aristocrat/);
    assert.doesNotMatch(coil, /Light & Wonder|Light and Wonder/);
    assert.doesNotMatch(src, /Dragon Link|Dragon Spin/);
    const nineteenth = sliceFn('drawNineteenth(state) {', 'window.scorecard');
    assert.doesNotMatch(nineteenth, /wyrmCoil/);
    assert.doesNotMatch(src, /onNineteenthDrawn/);
  });

  it('does not ship demo rounds or demo player buttons', () => {
    const dash = fs.readFileSync(path.join(ROOT, 'public/js/dashboard.js'), 'utf8');
    const routes = fs.readFileSync(path.join(ROOT, 'lib/routes/scoreRounds.js'), 'utf8');
    assert.doesNotMatch(dash, /openTeam1VsParDemo|openDemoFoursome/);
    assert.doesNotMatch(dash, /Open Team 1 vs-par demo|Open Kurt \/ Chase \/ Brian demo/);
    assert.doesNotMatch(src, /addDemoTeam1VsPar|addDemoFoursome/);
    assert.doesNotMatch(src, /Open Team 1 vs-par demo/);
    const dbSrc = fs.readFileSync(path.join(ROOT, 'lib/database.js'), 'utf8');
    assert.match(dbSrc, /wipePracticeScoreDataOnce/);
    assert.match(dbSrc, /DELETE FROM score_rounds/);
    assert.match(dbSrc, /field_test_wipe/);
    assert.match(dbSrc, /20260907/);
    assert.match(dash, /New round/);
    assert.match(dash, /Standard scorecard/);
    assert.match(dash, /Join with code/);
    assert.match(dash, /Game Rules/);
    assert.match(routes, /demoRoutesEnabled/);
    const security = fs.readFileSync(path.join(ROOT, 'lib/security.js'), 'utf8');
    assert.match(security, /VERCEL_ENV/);
    assert.match(security, /ALLOW_DEMO/);
    assert.match(security, /if \(isVercelProduction\(\)\) return false/);
  });
});
