// tests/rtSnapshotPersistence.test.js
// Regression for DEFECT-001: the RT stash snapshot must persist across
// enable/disable/re-enable cycles within a single project session.
// Re-snapshotting on every toggle-on silently moves the baseline forward and
// breaks the "Restore stash" safety net.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');

describe('tracker-app.js — RT snapshot lifecycle (DEFECT-001)', () => {
  test('exposes both __setRtStashSnapshot (replace) and __ensureRtStashSnapshot (only-if-empty)', () => {
    expect(SRC).toMatch(/window\.__setRtStashSnapshot\s*=/);
    expect(SRC).toMatch(/window\.__ensureRtStashSnapshot\s*=/);
  });

  test('__ensureRtStashSnapshot guards on empty current snapshot', () => {
    const re = /window\.__ensureRtStashSnapshot\s*=\s*function\s*\([^)]*\)\s*\{[\s\S]*?Object\.keys\(cur\)\.length\s*===\s*0/;
    expect(SRC).toMatch(re);
  });

  test('the Live toggle in TrackerProjectRail uses __ensureRtStashSnapshot, not __setRtStashSnapshot', () => {
    // The "Turning on" branch must not call the unconditional setter, otherwise
    // the snapshot moves forward on every re-enable.
    const toggleBlock = SRC.match(/Turning on:[\s\S]{0,800}__ensureRtStashSnapshot/);
    expect(toggleBlock).not.toBeNull();
  });

  test('Restore-stash button clears the snapshot ref after rolling back', () => {
    // Both the success and catch branches need to clear, so we expect at least
    // two `rtStashSnapshotRef.current={}` lines associated with restore.
    const restoreSection = SRC.match(/\/\/ Restore stash to pre-project[\s\S]{0,1500}cursor:'pointer',fontWeight:500/);
    expect(restoreSection).not.toBeNull();
    const clears = (restoreSection[0].match(/rtStashSnapshotRef\.current\s*=\s*\{\s*\}/g) || []).length;
    expect(clears).toBeGreaterThanOrEqual(2);
  });

  test('Complete-summary confirm clears the snapshot ref', () => {
    const completeSection = SRC.match(/Flush any remaining RT write[\s\S]{0,1200}finishStatus:'completed'[\s\S]{0,400}rtStashSnapshotRef\.current\s*=\s*\{\s*\}/);
    expect(completeSection).not.toBeNull();
  });
});
