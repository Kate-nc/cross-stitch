// tests/stashBridgeWindowGlobal.test.js
//
// Regression test for the "StashBridge is not available" error in BulkAddModal.
//
// ROOT CAUSE: stash-bridge.js declares `const StashBridge = (() => {...})()`.
// A top-level `const` in a classic <script> creates a lexical global binding
// (accessible as bare `StashBridge`) but does NOT attach to `window`.
// BulkAddModal.js, ShoppingListModal.js, creator-main.js and home-app.js all
// feature-test via `window.StashBridge`. Without a `window.StashBridge = StashBridge`
// line in stash-bridge.js, every one of these callers sees undefined and either
// shows the user an error toast or silently falls back.
//
// Same pattern was fixed for ProjectStorage (see project-storage.js commit
// "expose ProjectStorage on window so import save uses real storage").

const fs = require('fs');
const path = require('path');

const SB_SRC  = fs.readFileSync(path.join(__dirname, '..', 'stash-bridge.js'),  'utf8');
const BULK_SRC = fs.readFileSync(path.join(__dirname, '..', 'creator', 'BulkAddModal.js'), 'utf8');
const SHOP_SRC = fs.readFileSync(path.join(__dirname, '..', 'creator', 'ShoppingListModal.js'), 'utf8');
const CM_SRC   = fs.readFileSync(path.join(__dirname, '..', 'creator-main.js'), 'utf8');
const HOME_SRC = fs.readFileSync(path.join(__dirname, '..', 'home-app.js'), 'utf8');

describe('stash-bridge.js — window global assignment', () => {
  test('exposes StashBridge on window so window.StashBridge checks succeed', () => {
    // The fix must appear AFTER the IIFE definition (i.e. after the closing `})()`).
    // We just check the assignment exists anywhere in the file.
    expect(SB_SRC).toMatch(/window\.StashBridge\s*=\s*StashBridge/);
  });

  test('window assignment is guarded against non-browser environments (try/catch or typeof window)', () => {
    // The guard prevents failures in Jest (no real window) and Node contexts.
    const assignIdx = SB_SRC.indexOf('window.StashBridge = StashBridge');
    expect(assignIdx).toBeGreaterThan(-1);
    // The guard should be on the same line or in the 3 lines before
    const guardWindow = SB_SRC.slice(Math.max(0, assignIdx - 120), assignIdx);
    const hasGuard = /typeof window|try\s*\{/.test(guardWindow) || SB_SRC.slice(assignIdx, assignIdx + 60).includes('catch');
    expect(hasGuard).toBe(true);
  });

  test('window assignment comes after the IIFE closing (not inside it)', () => {
    const iifeEnd = SB_SRC.indexOf('})();');
    const assignIdx = SB_SRC.indexOf('window.StashBridge = StashBridge');
    expect(iifeEnd).toBeGreaterThan(-1);
    expect(assignIdx).toBeGreaterThan(iifeEnd);
  });
});

describe('callers that use window.StashBridge — guarded references', () => {
  test('BulkAddModal.js checks window.StashBridge (must not change to bare StashBridge)', () => {
    // BulkAddModal runs inside creator/bundle.js which is compiled separately from stash-bridge.js.
    // It must check window.StashBridge, not bare StashBridge, to test availability at runtime.
    expect(BULK_SRC).toMatch(/window\.StashBridge/);
  });

  test('ShoppingListModal.js checks window.StashBridge', () => {
    expect(SHOP_SRC).toMatch(/window\.StashBridge/);
  });

  test('creator-main.js checks window.StashBridge', () => {
    expect(CM_SRC).toMatch(/window\.StashBridge/);
  });

  test('home-app.js checks window.StashBridge', () => {
    expect(HOME_SRC).toMatch(/window\.StashBridge/);
  });
});
