// Tests for sync fix #6 — the header is the page-independent sync surface.
//
// home.html loads home-app.js, NOT home-screen.js, so the sync status panel,
// the pending-review banner and the diagnostics readout were all unreachable
// on /home. Permission loss in particular was only ever surfaced by
// home-screen.js — meaning on the page users spend most of their time, a
// revoked folder grant killed both the watcher and auto-export in silence.
//
// header.js renders on every page, so the signals live there now. These are
// source-level assertions: header.js is a React-createElement module with no
// test harness, so we verify the wiring rather than render it.

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'header.js'), 'utf8');
const HOME_HTML = fs.readFileSync(path.join(__dirname, '..', 'home.html'), 'utf8');

describe('the gap this fixes', () => {
  test('home.html still does not load home-screen.js', () => {
    // If this ever changes, the header no longer has to be the only surface —
    // but until then it is, and these tests matter.
    expect(HOME_HTML).not.toMatch(/<script[^>]*src=["']home-screen\.js["']/);
  });

  test('home.html does load header.js', () => {
    expect(HOME_HTML).toMatch(/<script[^>]*src=["']header\.js["']/);
  });
});

describe('fix #6 — permission loss is surfaced on every page', () => {
  test('header.js subscribes to cs:syncPermissionNeeded', () => {
    expect(SRC).toMatch(/addEventListener\(['"]cs:syncPermissionNeeded['"]/);
  });

  test('it also unsubscribes on cleanup', () => {
    expect(SRC).toMatch(/removeEventListener\(['"]cs:syncPermissionNeeded['"]/);
  });

  test('a granted permission clears the warning', () => {
    expect(SRC).toMatch(/permission-granted/);
    expect(SRC).toMatch(/setPermissionNeeded\(false\)/);
  });

  test('there is a Reconnect action wired to requestFolderPermission', () => {
    expect(SRC).toMatch(/function handleReconnectFolder/);
    expect(SRC).toMatch(/SyncEngine\.requestFolderPermission\(\)/);
    expect(SRC).toMatch(/Reconnect folder/);
  });

  test('Reconnect runs from a click, since requestPermission needs a gesture', () => {
    const idx = SRC.indexOf('Reconnect folder');
    expect(idx).toBeGreaterThan(0);
    const around = SRC.slice(Math.max(0, idx - 400), idx);
    expect(around).toMatch(/onClick/);
    expect(around).toMatch(/handleReconnectFolder\(\)/);
  });

  test('permission loss raises the sync badge', () => {
    expect(SRC).toMatch(/const showSyncBadge =[\s\S]{0,120}permissionNeeded/);
  });
});

describe('fix #6 — the badge counts everything actionable', () => {
  test('_reviewableCount covers conflicts, new-remote and merge-tracking', () => {
    // The watcher now partitions a delivery, so the review half can hold
    // malformed new-remote or merge-tracking entries with zero conflicts.
    // Counting plan.conflicts alone would show no badge for those.
    const fnIdx = SRC.indexOf('function _reviewableCount');
    expect(fnIdx).toBeGreaterThan(0);
    const body = SRC.slice(fnIdx, fnIdx + 400);
    expect(body).toMatch(/conflicts/);
    expect(body).toMatch(/newRemote/);
    expect(body).toMatch(/mergeTracking/);
  });

  test('the badge effect uses the shared counter rather than conflicts only', () => {
    expect(SRC).toMatch(/_reviewableCount\(SyncEngine\.getPendingPlan/);
    expect(SRC).toMatch(/setPendingConflicts\(_reviewableCount\(plan\)\)/);
  });

  test('_reviewableCount tolerates partial and empty plans', () => {
    // Extract and exercise the pure helper directly.
    const fnIdx = SRC.indexOf('function _reviewableCount');
    const end = SRC.indexOf('\n}', fnIdx) + 2;
    // eslint-disable-next-line no-new-func
    const reviewable = new Function(SRC.slice(fnIdx, end) + '; return _reviewableCount;')();
    expect(reviewable(null)).toBe(0);
    expect(reviewable({})).toBe(0);
    expect(reviewable({ conflicts: [1, 2] })).toBe(2);
    expect(reviewable({ newRemote: [1], mergeTracking: [1, 2] })).toBe(3);
    expect(reviewable({ conflicts: [1], newRemote: [1], mergeTracking: [1] })).toBe(3);
  });
});

describe('fix #6 — a silently dead write path is called out', () => {
  test('a staleness threshold is defined', () => {
    expect(SRC).toMatch(/SYNC_STALE_EXPORT_MS/);
  });

  test('staleness only applies to a connected, auto-syncing folder', () => {
    const idx = SRC.indexOf('const exportIsStale');
    expect(idx).toBeGreaterThan(0);
    const body = SRC.slice(idx, idx + 400);
    expect(body).toMatch(/hasWatchDir/);
    expect(body).toMatch(/autoSync/);
    expect(body).toMatch(/lastExportAt/);
  });

  test('the popover explains it rather than leaving it to be inferred', () => {
    expect(SRC).toMatch(/Nothing has been sent since/);
  });
});
