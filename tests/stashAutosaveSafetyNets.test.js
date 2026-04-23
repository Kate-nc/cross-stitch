/* Regression test: Stash autosave safety nets in creator/useProjectIO.js.
   Bug: previously the only place that called StashBridge.syncProjectToLibrary
   was the 1-second debounced auto-save effect. That meant a user who generated
   a pattern and immediately clicked "Open in Tracker" or closed the tab within
   the debounce window would never get the pattern into the Stash Manager
   library. We now sync from three additional places:
     1. handleOpenInTracker (when leaving for the Tracker)
     2. beforeunload (when closing/navigating)
     3. First save for a project (immediate, no debounce) */
const fs = require('fs');
const path = require('path');

describe('Creator stash safety nets', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useProjectIO.js'), 'utf8');
  const bundle = fs.readFileSync(path.join(__dirname, '..', 'creator', 'bundle.js'), 'utf8');

  test('handleOpenInTracker calls StashBridge.syncProjectToLibrary', () => {
    // Find the onSwitchToTrack branch and look ahead for the sync call.
    const idx = src.indexOf('if (onSwitchToTrack)');
    expect(idx).toBeGreaterThan(-1);
    // Look in the next ~1500 chars (the branch body) for the sync call.
    const branch = src.slice(idx, idx + 1500);
    expect(branch).toMatch(/StashBridge\.syncProjectToLibrary/);
  });

  test('beforeunload handler calls StashBridge.syncProjectToLibrary', () => {
    const idx = src.indexOf('function handleBeforeUnload');
    expect(idx).toBeGreaterThan(-1);
    const fn = src.slice(idx, idx + 1500);
    expect(fn).toMatch(/StashBridge\.syncProjectToLibrary/);
  });

  test('first-save fires immediately (no debounce) via firstSaveDoneRef', () => {
    expect(src).toMatch(/firstSaveDoneRef/);
    expect(src).toMatch(/isFirstSave[\s\S]{0,200}persistAll\(\)/);
  });

  test('bundle.js contains the firstSaveDoneRef wiring (build is up to date)', () => {
    expect(bundle).toMatch(/firstSaveDoneRef/);
  });
});
