// Regression test: useProjectIO must receive isActive from CreatorApp.
//
// useCreatorState does NOT set state.isActive — that flag is a prop of
// CreatorApp tied to the design/track mode toggle in UnifiedApp. The
// auto-save effect in useProjectIO gates on `if (!state.isActive) return;`
// so without the merge in creator-main.js, state.isActive is undefined,
// the guard always trips, and edits made in the Creator never reach
// IndexedDB or the Stash Manager — pattern saves only happen via the
// explicit handleOpenInTracker handoff (which bypasses the guard).
//
// User-visible symptom: "Patterns are still only saving if I take them
// through to the track mode. If I stop working on them in edit and go
// to the stash, nothing shows up." Diagnosed and fixed in this commit.

const fs = require('fs');
const path = require('path');

describe('useProjectIO isActive plumbing', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'creator-main.js'), 'utf8');

  test('useProjectIOHook is called with state merged with isActive', () => {
    // Must mirror the useKeyboardShortcutsHook call which already does this.
    expect(SRC).toMatch(/useProjectIOHook\(\s*Object\.assign\(\s*\{\s*\}\s*,\s*state\s*,\s*\{\s*isActive\s*:\s*isActive\s*\}\s*\)/);
  });

  test('useCreatorState does not provide isActive itself', () => {
    // Sanity check: if useCreatorState ever starts exposing isActive, this
    // test should be revisited because the merge in creator-main.js becomes
    // redundant or actively harmful.
    const stateSrc = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useCreatorState.js'), 'utf8');
    expect(stateSrc).not.toMatch(/\bisActive\b/);
  });

  test('useProjectIO auto-save effect gates on state.isActive', () => {
    // If this guard is ever removed, the merge above is no longer required.
    const ioSrc = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useProjectIO.js'), 'utf8');
    expect(ioSrc).toMatch(/if\s*\(\s*!\s*state\.isActive\s*\)\s*return\s*;/);
  });
});
