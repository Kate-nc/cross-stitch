// tests/liveAutoStitchesClamp.test.js
// Regression for DEFECT-011: liveAutoStitches must never go negative.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'useAutoSession.js'), 'utf8');

describe('useAutoSession.js — liveAutoStitches clamp (DEFECT-011)', () => {
  test('setLiveAutoStitches takes the session\'s additions, which are never negative', () => {
    expect(SRC).toMatch(/setLiveAutoStitches\(\s*ProgressUnits\.liveSessionAdded\(\s*currentAutoSessionRef\.current\s*\)\s*\)/);
    const PU = require('../progress-units.js');
    expect(PU.liveSessionAdded({ unitsCompleted: 2, unitsUndone: 50 })).toBe(2);
    expect(PU.liveSessionAdded({ unitsCompleted: 0, unitsUndone: 80 })).toBe(0);
    expect(PU.liveSessionAdded({ unitsCompleted: 10, unitsUndone: 0, catchUp: 30 })).toBe(0);
  });

  test('the unguarded subtraction is no longer present', () => {
    // Belt-and-braces: the bare subtraction would compile but display negatives.
    expect(SRC).not.toMatch(/setLiveAutoStitches\(currentAutoSessionRef\.current\.unitsCompleted-currentAutoSessionRef\.current\.unitsUndone\)/);
  });
});
