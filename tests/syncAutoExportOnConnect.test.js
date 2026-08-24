// Regression tests for sync fix #5 — connecting a folder must enable the
// write path, not just the read path.
//
// The bug: setWatchDirectory() started the polling watcher but never touched
// cs_sync_folderAutoSync, which defaults to off and was only ever set by a
// separate Preferences toggle. A device could therefore have a folder
// connected for months and never export once — receive-only, silently.

const fs = require('fs');
const pako = require('pako');

global.window = global.window || {};
global.localStorage = (() => {
  const store = {};
  return {
    getItem(k) { return store[k] !== undefined ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); }
  };
})();
global.pako = pako;
global.indexedDB = undefined;
global.ProjectStorage = { listProjects: async () => [], get: async () => null, save: async p => p.id };

eval(fs.readFileSync('./sync-engine.js', 'utf8'));
const SE = global.SyncEngine || global.window.SyncEngine;

const KEY = 'cs_sync_folderAutoSync';

const _origWarn = console.warn;
beforeAll(() => {
  console.warn = function () {
    if (String(arguments[0] || '').indexOf('SyncEngine:') === 0) return;
    _origWarn.apply(console, arguments);
  };
});
afterAll(() => { console.warn = _origWarn; });

beforeEach(() => { localStorage.clear(); });

describe('sync fix #5 — auto-sync preference is tri-state', () => {
  test('absent key means no preference expressed', () => {
    expect(SE.hasAutoSyncPreference()).toBe(false);
    expect(SE.isAutoSyncEnabled()).toBe(false);
  });

  test('turning it off records an explicit "0", not an absent key', () => {
    SE.setAutoSyncEnabled(false);
    expect(localStorage.getItem(KEY)).toBe('0');
    expect(SE.hasAutoSyncPreference()).toBe(true);
    expect(SE.isAutoSyncEnabled()).toBe(false);
  });

  test('turning it on records "1"', () => {
    SE.setAutoSyncEnabled(true);
    expect(localStorage.getItem(KEY)).toBe('1');
    expect(SE.hasAutoSyncPreference()).toBe(true);
    expect(SE.isAutoSyncEnabled()).toBe(true);
  });

  test('an unrecognised stored value is treated as off', () => {
    localStorage.setItem(KEY, 'yes');
    expect(SE.isAutoSyncEnabled()).toBe(false);
  });
});

describe('sync fix #5 — connecting a folder opts in', () => {
  // setWatchDirectory persists the handle to IDB (unavailable in Node) and
  // starts the watcher; both are wrapped in try/catch, so the auto-sync
  // default still runs. A minimal stub handle is enough.
  const stubHandle = {
    name: 'CrossStitchSync',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    values: function* () {}
  };

  afterEach(() => { try { SE.stopWatching(); } catch (_) {} });

  test('a first-time connect enables auto-export', async () => {
    expect(SE.isAutoSyncEnabled()).toBe(false);
    await SE.setWatchDirectory(stubHandle);
    expect(SE.isAutoSyncEnabled()).toBe(true);
  });

  test('a prior explicit opt-out is respected on connect', async () => {
    SE.setAutoSyncEnabled(false);
    await SE.setWatchDirectory(stubHandle);
    expect(SE.isAutoSyncEnabled()).toBe(false);
  });

  test('an existing opt-in stays on', async () => {
    SE.setAutoSyncEnabled(true);
    await SE.setWatchDirectory(stubHandle);
    expect(SE.isAutoSyncEnabled()).toBe(true);
  });

  test('disconnecting clears the preference so reconnecting opts in again', async () => {
    await SE.setWatchDirectory(stubHandle);
    expect(SE.isAutoSyncEnabled()).toBe(true);
    SE.setAutoSyncEnabled(false);
    await SE.clearWatchDirectory();
    expect(SE.hasAutoSyncPreference()).toBe(false);
    await SE.setWatchDirectory(stubHandle);
    expect(SE.isAutoSyncEnabled()).toBe(true);
  });

  test('getSyncStatus reports the new state', async () => {
    await SE.setWatchDirectory(stubHandle);
    expect(SE.getSyncStatus().autoSync).toBe(true);
  });
});
