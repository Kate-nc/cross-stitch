/* Regression test: large-pattern handoff in creator/useProjectIO.js no longer
   uses a loud `alert()` when the URL-hash payload would be too big. The fixed
   path:
     1. Always saves to IndexedDB before navigating (so the active-project
        pointer leads to a recoverable copy).
     2. Tries localStorage `crossstitch_handoff` first.
     3. Falls back to URL-hash compression only if localStorage failed.
     4. If both fail, shows a soft toast and still navigates — the Tracker
        recovers from the IDB copy. */
const fs = require('fs');
const path = require('path');

describe('Creator → Tracker large-pattern handoff', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useProjectIO.js'), 'utf8');

  test('handleOpenInTracker no longer calls alert() for large patterns', () => {
    // Find the standalone-handoff branch (the one without onSwitchToTrack)
    const idx = src.indexOf('ProjectStorage.setActiveProject(projectIdRef.current);');
    expect(idx).toBeGreaterThan(-1);
    // The branch ends with `window.location.href = "stitch.html?source=creator";`
    // followed by a closing `}`. Bound the snippet to that end so the test
    // doesn't accidentally pick up later, unrelated alert() calls.
    const after = src.slice(idx);
    const endIdx = after.indexOf('// ─── processLoadedProject');
    const branch = endIdx > 0 ? after.slice(0, endIdx) : after.slice(0, 3000);
    // Strip line comments so a comment that mentions "alert" (e.g. "no more
    // loud `alert()`") doesn't trip the assertion.
    const code = branch.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/\balert\s*\(/);
  });

  test('handoff persists to IndexedDB before navigating', () => {
    expect(src).toMatch(/ProjectStorage\.setActiveProject\(projectIdRef\.current\);[\s\S]{0,800}ProjectStorage\.save\(project\)/);
    expect(src).toMatch(/ProjectStorage\.setActiveProject\(projectIdRef\.current\);[\s\S]{0,800}saveProjectToDB\(project\)/);
  });

  test('handoff awaits the IndexedDB save before navigating', () => {
    // Regression: previously these were fire-and-forget calls, which let
    // window.location.href fire mid-transaction. The standalone branch must
    // await both writes so the Tracker always finds the saved project.
    expect(src).toMatch(/await ProjectStorage\.save\(project\)/);
    expect(src).toMatch(/await saveProjectToDB\(project\)/);
  });

  test('handoff falls back to a toast on overflow rather than aborting', () => {
    expect(src).toMatch(/Pattern too large for inline transfer/);
    expect(src).toMatch(/state\.addToast/);
  });
});
