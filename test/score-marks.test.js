const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public/js/scorecard.js'), 'utf8');

function vsParClass(gross, par) {
  if (gross == null || par == null) return '';
  const d = Number(gross) - Number(par);
  if (!Number.isFinite(d)) return '';
  if (d <= -2) return 'vs-eagle';
  if (d === -1) return 'vs-birdie';
  if (d === 0) return 'vs-par';
  if (d === 1) return 'vs-bogey';
  return 'vs-double';
}

function scoreMarkKind(gross, par, standard) {
  if (standard) return '';
  const vs = vsParClass(gross, par);
  if (vs === 'vs-eagle') return 'eagle';
  if (vs === 'vs-birdie') return 'birdie';
  if (vs === 'vs-bogey') return 'bogey';
  if (vs === 'vs-double') return 'double';
  return '';
}

describe('paper-card score marks', () => {
  it('keeps the live-card mark table in scorecard.js', () => {
    assert.match(src, /d <= -2/);
    assert.match(src, /d === -1/);
    assert.match(src, /d === 1/);
    assert.match(src, /scoreMarkKind\(hs\?\.gross, par, this\.isStandardScorecard/);
    assert.match(src, /has-score-mark/);
  });

  it('uses the gross vs par the player typed', () => {
    assert.equal(scoreMarkKind(3, 4, false), 'birdie');
    assert.equal(scoreMarkKind(2, 4, false), 'eagle');
    assert.equal(scoreMarkKind(1, 4, false), 'eagle');
    assert.equal(scoreMarkKind(4, 4, false), '');
    assert.equal(scoreMarkKind(5, 4, false), 'bogey');
    assert.equal(scoreMarkKind(6, 4, false), 'double');
    assert.equal(scoreMarkKind(8, 4, false), 'double');
  });

  it('stays off on Standard scorecard', () => {
    assert.equal(scoreMarkKind(3, 4, true), '');
    assert.equal(scoreMarkKind(2, 4, true), '');
    assert.equal(scoreMarkKind(6, 4, true), '');
  });
});
