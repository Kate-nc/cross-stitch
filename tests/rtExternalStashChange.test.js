// tests/rtExternalStashChange.test.js
// Regression for DEFECT-009: tracker must re-baseline rtStashSnapshotRef when
// an external surface (Manager, backup-restore, sync) edits the stash mid-
// session. Otherwise the next debounced flush silently overwrites those edits.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');

describe('tracker-app.js — external stash change handling (DEFECT-009)', () => {
  test('flushRtStashWrite sets a self-write flag for the duration of the loop', () => {
    expect(SRC).toMatch(/rtSelfWritingRef\s*=\s*useRef\(false\)/);
    expect(SRC).toMatch(/rtSelfWritingRef\.current\s*=\s*true/);
    expect(SRC).toMatch(/rtSelfWritingRef\.current\s*=\s*false/);
    // The flag set/clear must wrap the await loop (uses try/finally so a thrown
    // updateThreadOwned doesn't leave the flag stuck on).
    expect(SRC).toMatch(/rtSelfWritingRef\.current\s*=\s*true;[\s\S]{0,200}try\s*\{[\s\S]+?await\s+StashBridge\.updateThreadOwned[\s\S]+?\}\s*finally\s*\{[\s\S]+?rtSelfWritingRef\.current\s*=\s*false/);
  });

  test('an effect listens for cs:stashChanged and refreshes the snapshot', () => {
    // The listener body must (a) early-return when self-writing, (b) skip when
    // RT is disabled, and (c) call StashBridge.getGlobalStash to re-baseline.
    const listenerSection = SRC.match(/External-change listener[\s\S]{0,2200}cs:stashChanged/);
    expect(listenerSection).not.toBeNull();
    expect(listenerSection[0]).toMatch(/rtSelfWritingRef\.current/);
    expect(listenerSection[0]).toMatch(/wastePrefs\.enabled/);
    expect(listenerSection[0]).toMatch(/StashBridge\.getGlobalStash/);
  });

  test('snapshot baseline = liveOwned + currentConsumed (preserves external delta)', () => {
    // The arithmetic for rebaselining: the new snapshot.owned for each thread
    // must add the in-memory consumption back onto the live owned value, so the
    // next flush deducts only the incremental new consumption.
    expect(SRC).toMatch(/owned:\s*entry\.owned\s*\+\s*consumed/);
  });

  test('event listener is cleaned up on unmount', () => {
    const cleanup = SRC.match(/removeEventListener\(\s*'cs:stashChanged'\s*,\s*onExternalChange/);
    expect(cleanup).not.toBeNull();
  });
});
