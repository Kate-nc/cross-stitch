// tests/wastePrefsPerProjectSave.test.js
// Regression for DEFECT-007: doSaveProject must include wastePrefs in
// settings, otherwise per-project waste customisation cannot persist.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');

describe('tracker-app.js — wastePrefs per-project persistence (DEFECT-007)', () => {
  test('doSaveProject settings object includes wastePrefs', () => {
    // Match the doSaveProject body's settings line specifically.
    const fnStart = SRC.indexOf('function doSaveProject(');
    expect(fnStart).toBeGreaterThan(0);
    const slice = SRC.slice(fnStart, fnStart + 2500);
    expect(slice).toMatch(/settings:\s*\{[^}]*wastePrefs[^}]*\}/);
  });

  test('hydration prefers per-project settings.wastePrefs over global default', () => {
    // The processLoadedProject branch must read settings.wastePrefs.
    expect(SRC).toMatch(/s\.wastePrefs\s*&&\s*typeof\s+s\.wastePrefs\s*===\s*['"]object['"]/);
    // It must spread RT_WASTE_DEFAULTS first, then per-project overrides on top.
    expect(SRC).toMatch(/Object\.assign\(\{\},\s*RT_WASTE_DEFAULTS\s*,\s*s\.wastePrefs\)/);
  });

  test('all three save paths include wastePrefs (auto, manual, doSaveProject)', () => {
    var matches = SRC.match(/wastePrefs\s*[},]/g) || [];
    // 3 save paths × 1 each, plus assorted other reads. At minimum 3.
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});
