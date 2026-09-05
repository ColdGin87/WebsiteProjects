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
    assert.match(html, /20260826m/);
    assert.match(html, /js\/formats\.js\?v=20260826m/);
    assert.match(html, /js\/sideGames\.js\?v=20260826m/);
    assert.match(src, /ASSET_V:\s*'20260826m'/);
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
    assert.match(src, /fmtTeam\(winner\.total\)/);
    assert.match(src, /fmtTeam\(team\.total\)/);
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
    assert.match(dash, /3G/);
    assert.match(dash, /3N/);
    assert.match(dash, /1G3N/);
    assert.match(dash, /2G2N/);
    assert.match(dash, /gameRule/);
    assert.match(dash, /create-side-games/);
    assert.match(dash, /sideGames/);
  });
});
