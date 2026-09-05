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
    assert.match(fn, /oneHoleTeamTotal/);
    assert.match(fn, /id="hole-players"/);
    assert.match(src, /hole-player-row/);
  });

  it('paints net next to the hole-row gross', () => {
    const fn = sliceFn('holePlayerRowHtml(state, member, holeNumber)', 'holePlayersHtml(state, holeNumber)');
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
    assert.match(html, /20260826x/);
    assert.match(html, /js\/formats\.js\?v=20260826x/);
    assert.match(html, /js\/sideGames\.js\?v=20260826x/);
    assert.match(html, /js\/wyrmCoil\.js\?v=20260826x/);
    assert.match(src, /ASSET_V:\s*'20260826x'/);
  });

  it('hole scoring toolbar is Back plus one overflow', () => {
    const draw = sliceFn('drawHoleView(state) {', 'holeNavButtonsHtml(holeNumber)');
    assert.match(draw, /holeToolbar/);
    assert.doesNotMatch(draw, /See dashboard/);
    assert.doesNotMatch(draw, /Full card/);
    const bar = sliceFn('holeToolbar(state) {', 'bindHoleOverflowDismiss');
    assert.match(bar, />Back</);
    assert.match(bar, /hole-overflow/);
    assert.match(bar, /Full card/);
    assert.match(bar, /Settings/);
    assert.match(bar, /confirmPress/);
    assert.doesNotMatch(bar, /See dashboard/);
    const hole = sliceFn('drawHoleView(state) {', 'holeNavButtonsHtml(holeNumber)');
    assert.match(hole, /Press/);
    assert.match(src, /id="hole-players"/);
    assert.match(src, /patchUI\(\)/);
  });

  it('team balls and vs-par are at least 0.875rem', () => {
    assert.match(css, /\.team-balls[\s\S]{0,160}font-size:\s*0\.875rem/);
    assert.match(css, /\.vs-par-lines[\s\S]{0,160}font-size:\s*0\.875rem/);
    assert.match(css, /flex-wrap:\s*nowrap/);
  });

  it('race strip and Team N totals format vs-par, not stroke sums', () => {
    const race = sliceFn('raceStripText(state)', 'holePlayerRowHtml(state, member, holeNumber)');
    assert.match(race, /fmtTeam/);
    assert.match(race, /vegasStripText|isVegasOn/);
    assert.match(race, /Sunday game /);
    assert.match(src, /fmtTeam\(winner\.total\)/);
    assert.match(src, /fmtTeam\(team\.total\)/);
    assert.match(src, /oneHoleVegasTotal/);
    assert.match(src, /vegasBoardHtml/);
    assert.match(src, /fmtVegasPts/);
    assert.match(src, /Sunday game/);
    assert.match(src, /vegas-press-btn/);
    assert.match(src, /pressVegasFromHole/);
    assert.match(src, /vegasPresses/);
    assert.match(src, /nassauPressButtonsHtml/);
    assert.match(src, /pressNassauFromHole/);
    assert.match(src, /nassauPresses/);
    assert.match(src, /ninesBoardHtml/);
    assert.match(src, /nines-run/);
    assert.match(css, /\.nassau-press-btn/);
    assert.match(css, /\.nines-board/);
    assert.doesNotMatch(src, /data-vegas-num[\s\S]{0,80}fmtTeam/);
  });

  it('live add-player is name, HCP, and Team 1 / 2 / 3 chips in one flow', () => {
    const panel = sliceFn('addPlayerPanelInner(state)', 'addTeamChipsHtml(selected)');
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
    assert.match(players, /oneHoleVegasTotal/);
    assert.ok(players.indexOf('oneHoleVegasTotal') < players.indexOf('oneHoleTeamTotal'), 'Vegas is primary under the team');
    assert.match(players, /isVegasOn/);
    assert.match(players, /visibleHoleMembers|group\.team &&/);
    assert.match(src, /Go to the 19th hole/);
    assert.match(src, /drawGameRules/);
    assert.match(src, /drawNineteenth/);
    assert.match(src, /info-tip/);
    assert.match(src, /birdieSlots/);
    assert.match(src, /isTeamRaceOn/);
    assert.match(src, /liveGameTitle/);
    assert.match(src, /wolf-badge/);
    assert.match(src, /Blind Lone Wolf/);
    assert.match(src, /wolfHoldsScoring/);
    assert.match(src, /Lock Wolf sides before scoring/);
    assert.match(src, /playerNineLineHtml/);
    assert.match(src, /showOut/);
    assert.match(src, /showIn/);
    const settings = sliceFn('settingsBar(state)', 'groupedMembers(state)');
    assert.doesNotMatch(settings, />Individual</);
    assert.doesNotMatch(settings, /Allowance/);
    assert.match(settings, /HCP = Index only/);
    assert.match(settings, /Sunday game/);
    assert.match(settings, /1G1N|1G\+1N/);
    assert.match(src, /Sunday game · /);
    assert.match(src, /<h3>Sunday game<\/h3>/);
    assert.match(css, /\.info-pop:not\(\[hidden\]\)/);
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
    assert.match(dash, /3G/);
    assert.match(dash, /3N/);
    assert.match(dash, /1G3N/);
    assert.match(dash, /2G2N/);
    assert.match(dash, /Sunday game/);
    assert.match(dash, /gameRule/);
    assert.match(dash, /create-side-games/);
    assert.match(dash, /sideGames/);
    assert.match(dash, /create-team-race-row/);
    assert.match(dash, /name="teamRace"/);
    assert.match(dash, /sideGamesFieldsInner/);
    assert.match(src, /birdieSlotsOn/);
    assert.match(src, /wyrmCoil/);
    assert.match(src, /Birdie dragon slots/);
  });
});

describe('Wyrm Coil overlay', () => {
  it('ships an original dragon overlay and never copies casino names', () => {
    const coil = fs.readFileSync(path.join(ROOT, 'public/js/wyrmCoil.js'), 'utf8');
    assert.match(coil, /Wyrm Coil/);
    assert.match(coil, /Birdie dragon slots/);
    assert.match(coil, /takeSpin/);
    assert.match(coil, /HIGH_KEY/);
    assert.match(coil, /wyrm-screens/);
    assert.match(src, /onNineteenthDrawn/);
    assert.match(css, /\.wyrm-coil-overlay/);
    assert.match(css, /\.wyrm-screens/);
    assert.doesNotMatch(coil, /Dragon Link/);
    assert.doesNotMatch(coil, /Dragon Spin/);
    assert.doesNotMatch(coil, /Aristocrat/);
    assert.doesNotMatch(coil, /Light & Wonder|Light and Wonder/);
    assert.doesNotMatch(src, /Dragon Link|Dragon Spin/);
  });
});
