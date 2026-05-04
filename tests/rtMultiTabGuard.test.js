// tests/rtMultiTabGuard.test.js
// Regression for DEFECT-008: when two tracker tabs both have Live tracking
// on, they will race their stash writes. We can't fix the race without an
// atomic read-modify-write inside StashBridge, but we can at least warn
// the user. Static guards on the BroadcastChannel-based heartbeat.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');

describe('tracker-app.js — multi-tab live-tracking guard (DEFECT-008)', () => {
  test('uses BroadcastChannel named "cs-rt-tracker"', () => {
    expect(SRC).toMatch(/new\s+BroadcastChannel\(\s*['"]cs-rt-tracker['"]\s*\)/);
  });

  test('feature-detects BroadcastChannel before constructing', () => {
    expect(SRC).toMatch(/typeof\s+BroadcastChannel\s*===\s*['"]undefined['"]/);
  });

  test('only runs while wastePrefs.enabled', () => {
    // The effect must early-return when RT is off.
    const fnIdx = SRC.indexOf('Multi-tab guard (DEFECT-008)');
    expect(fnIdx).toBeGreaterThan(0);
    const slice = SRC.slice(fnIdx, fnIdx + 1500);
    expect(slice).toMatch(/if\(!wastePrefs\.enabled\)return/);
  });

  test('emits a warning Toast when another tab is detected', () => {
    expect(SRC).toMatch(/Live tracking is active in another tab/);
    expect(SRC).toMatch(/type:\s*['"]warning['"]/);
  });

  test('only warns once per session (warned flag)', () => {
    const fnIdx = SRC.indexOf('Multi-tab guard (DEFECT-008)');
    const slice = SRC.slice(fnIdx, fnIdx + 1500);
    expect(slice).toMatch(/var\s+warned\s*=\s*false/);
    expect(slice).toMatch(/warned\s*=\s*true/);
  });

  test('cleans up channel and heartbeat on effect teardown', () => {
    expect(SRC).toMatch(/clearInterval\(hb\)/);
    expect(SRC).toMatch(/chan\.close\(\)/);
  });
});
