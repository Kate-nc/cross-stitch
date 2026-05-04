// tests/liveAutoStitchesClamp.test.js
// Regression for DEFECT-011: liveAutoStitches must never go negative.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');

describe('tracker-app.js — liveAutoStitches clamp (DEFECT-011)', () => {
  test('setLiveAutoStitches always wraps the difference in Math.max(0, ...)', () => {
    expect(SRC).toMatch(/setLiveAutoStitches\(\s*Math\.max\(\s*0\s*,\s*currentAutoSessionRef\.current\.stitchesCompleted\s*-\s*currentAutoSessionRef\.current\.stitchesUndone\s*\)\s*\)/);
  });

  test('the unguarded subtraction is no longer present', () => {
    // Belt-and-braces: the bare subtraction would compile but display negatives.
    expect(SRC).not.toMatch(/setLiveAutoStitches\(currentAutoSessionRef\.current\.stitchesCompleted-currentAutoSessionRef\.current\.stitchesUndone\)/);
  });
});
