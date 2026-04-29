/* tests/activeProjectPointerRace.test.js — regression for "/home shows no
 * active project after generating in Creator and immediately navigating".
 * ════════════════════════════════════════════════════════════════════════
 * Root cause (deep-dive April 2026): the auto-save effect previously only
 * called ProjectStorage.setActiveProject(id) inside
 *   ProjectStorage.save(project).then(id => setActiveProject(id))
 * so the localStorage pointer was only written AFTER the IDB transaction
 * resolved. Browsers typically let pending IDB transactions complete
 * across page navigations, but the JS continuation that was supposed to
 * write localStorage does NOT run on the unloaded page — leaving the
 * project saved in IDB but the active pointer empty. /home then renders
 * the empty state.
 *
 * Fix: write the active pointer SYNCHRONOUSLY as soon as we have a
 * minted projectIdRef, before scheduling the IDB save. Plus a defensive
 * re-write inside the beforeunload handler. Plus a self-heal in
 * /home-app.js that clears stale pointers (project-id present but the
 * project no longer exists in IDB).
 *
 * These tests are source-content assertions because the runtime path
 * involves IndexedDB, React effects, page navigations, and the
 * useProjectIO hook — none of which are easily exercised in Jest. The
 * checks pin the contract so a future refactor can't silently revert
 * back to the async-only setActiveProject path.
 * ════════════════════════════════════════════════════════════════════════
 */
const fs = require('fs');
const path = require('path');

const useProjectIO = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useProjectIO.js'), 'utf8');
const homeApp      = fs.readFileSync(path.join(__dirname, '..', 'home-app.js'),                'utf8');
const projectStore = fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'),         'utf8');

describe('Active-project pointer race (regression)', () => {
  test('useProjectIO writes the active pointer SYNCHRONOUSLY before kicking off save', () => {
    // Locate the auto-save effect block (the one that builds project5).
    const block = useProjectIO.match(
      /if \(!state\.projectIdRef\.current\) state\.projectIdRef\.current = ProjectStorage\.newId\(\);[\s\S]*?var project5 = Object\.assign/
    );
    expect(block).not.toBeNull();
    // Inside that block, BEFORE project5 is built, setActiveProject must run.
    expect(block[0]).toMatch(/ProjectStorage\.setActiveProject\(state\.projectIdRef\.current\)/);
    // And it must be guarded by isActive so we don't claim activeness while the
    // Tracker is the active view.
    expect(block[0]).toMatch(/if \(state\.isActive[\s\S]*?ProjectStorage\.setActiveProject/);
  });

  test('useProjectIO beforeunload handler re-writes the active pointer', () => {
    const block = useProjectIO.match(
      /function handleBeforeUnload\(\) \{[\s\S]*?try \{ saveProjectToDB/
    );
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/ProjectStorage\.setActiveProject\(p\.id\)/);
  });

  test('useProjectIO still calls setActiveProject inside the save .then for the success path', () => {
    // The synchronous write is for race protection; the post-save write
    // remains so the eventual id (which may differ if save() minted one)
    // is canonical. Both paths must coexist.
    expect(useProjectIO).toMatch(/ProjectStorage\.save\(project5\)\.then\(function \(id\) \{[\s\S]*?ProjectStorage\.setActiveProject\(id\)/);
  });

  test('home-app self-heals stale active-project pointers', () => {
    // When getActiveProject() returns null but getActiveProjectId() is
    // non-null, the pointer is dangling — clear it.
    expect(homeApp).toMatch(/getActiveProject\(\)\.then[\s\S]*?clearActiveProject/);
  });

  test('ProjectStorage.setActiveProject is a synchronous localStorage write (no Promise)', () => {
    // The race fix relies on setActiveProject completing before the page
    // unload event finishes. localStorage.setItem is synchronous; if this
    // ever changes (e.g. someone wraps it in async/await for IDB-backed
    // storage), the race protection breaks.
    const block = projectStore.match(/setActiveProject\(id\) \{[\s\S]*?\}/);
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/localStorage\.setItem/);
    expect(block[0]).not.toMatch(/await|then\(/);
  });
});
