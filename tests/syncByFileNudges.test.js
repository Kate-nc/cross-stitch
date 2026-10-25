// Sync by file (iPad, and any device that cannot watch a folder): the app
// tracks whether this device has work its other devices have not seen, and
// reminds the user to import when the last import is old.

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
global.sessionStorage = (() => {
  const store = {};
  return {
    getItem(k) { return store[k] !== undefined ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); }
  };
})();
global.pako = pako;
global.indexedDB = new (require('fake-indexeddb').IDBFactory)();

// Mirrors ProjectStorage: a save fires triggerAutoExport, passing on the
// write's sync origin. Tests can hook listProjects to act during an export.
let onListProjects = null;
global.ProjectStorage = {
  listProjects: async () => { if (onListProjects) onListProjects(); return []; },
  get: async () => null,
  save: async (p, o) => { SE.triggerAutoExport(o && o.syncOrigin ? { origin: o.syncOrigin } : undefined); return p.id; }
};

eval(fs.readFileSync('./sync-engine.js', 'utf8'));
const SE = global.SyncEngine || global.window.SyncEngine;

const HOUR = 3600 * 1000;

const _origWarn = console.warn;
beforeAll(() => {
  console.warn = function () {
    if (String(arguments[0] || '').indexOf('SyncEngine:') === 0) return;
    _origWarn.apply(console, arguments);
  };
});
afterAll(() => { console.warn = _origWarn; });

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  delete window.Toast; delete window.UnifiedSyncImportModal; delete window.__flushProjectToIDB;
  onListProjects = null;
});

function mkProject(id) {
  const pattern = [];
  for (let i = 0; i < 100; i++) pattern.push({ id: String(310 + (i % 3)) });
  return { id, name: id, updatedAt: '2026-10-01T00:00:00.000Z', settings: { sW: 10, sH: 10 }, pattern, done: new Array(100).fill(0) };
}

// A folder handle that accepts writes, so exportToFolder can deliver.
function fakeFolder() {
  return {
    name: 'sync',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFileHandle: async () => ({ createWritable: async () => ({ write: async () => {}, close: async () => {} }) })
  };
}
const unsent = () => SE.getSyncStatus().hasUnsentChanges;
const importOne = id => SE.executeImport({
  newRemote: [{ id, remote: { data: mkProject(id) } }],
  mergeTracking: [], conflicts: [],
  syncObj: { _deviceId: 'dev_A' }
});

describe('unshared changes', () => {
  test('a fresh device has nothing unsent', () => {
    expect(unsent()).toBe(false);
  });

  test('a local change is unsent until a delivered export covers it', async () => {
    SE.triggerAutoExport();
    expect(unsent()).toBe(true);
    await SE.exportToFolder(fakeFolder());
    expect(unsent()).toBe(false);
    SE.triggerAutoExport();
    expect(unsent()).toBe(true);
  });

  test('a change committed while the export is reading stays unsent', async () => {
    SE.triggerAutoExport();
    // A save lands after the export noted what it covers but before it
    // finished: it may be missing from the file, so it must not count as sent.
    onListProjects = () => SE.triggerAutoExport();
    await SE.exportToFolder(fakeFolder());
    expect(unsent()).toBe(true);
  });

  test('the export file does not carry the coverage marker', async () => {
    SE.triggerAutoExport();
    const obj = await SE.exportSync();
    expect(typeof obj._coversChangeRev).toBe('number');
    expect(JSON.stringify(obj)).not.toContain('_coversChangeRev');
  });

  test('the first unsent change announces a status change', () => {
    const seen = [];
    const prev = window.dispatchEvent;
    window.dispatchEvent = e => { seen.push(e.detail && e.detail.reason); return true; };
    global.CustomEvent = global.CustomEvent || function (type, init) { this.type = type; this.detail = init && init.detail; };
    try {
      SE.triggerAutoExport();
      SE.triggerAutoExport();
    } finally { window.dispatchEvent = prev; }
    expect(seen.filter(r => r === 'local-change').length).toBe(1);
  });

  test('writes that apply an import are not this device\'s changes', async () => {
    await importOne('proj_x');
    expect(unsent()).toBe(false);
    SE.triggerAutoExport({ origin: SE.SYNC_ORIGIN_IMPORT });
    expect(unsent()).toBe(false);
  });

  test('local edits flushed at the start of an import stay unsent', async () => {
    window.__flushProjectToIDB = async () => { SE.triggerAutoExport(); };
    await importOne('proj_y');
    expect(unsent()).toBe(true);
  });

  test('a local save during an import is still counted', async () => {
    // Untagged writes count whenever they happen; only import writes are skipped.
    const run = importOne('proj_z');
    SE.triggerAutoExport();
    await run;
    expect(unsent()).toBe(true);
  });
});

describe('import reminder', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const base = { off: false, canWatchFolder: false, webdavConnected: false };

  test('due when the last import is at least 12 hours old', () => {
    expect(SE.importReminderDue(now, Object.assign({}, base, { lastImportAt: new Date(now - 13 * HOUR).toISOString() }))).toBe(true);
    expect(SE.importReminderDue(now, Object.assign({}, base, { lastImportAt: new Date(now - 2 * HOUR).toISOString() }))).toBe(false);
  });

  test('never for a device that has not imported before', () => {
    expect(SE.importReminderDue(now, Object.assign({}, base, { lastImportAt: null }))).toBe(false);
  });

  test('never when folder sync or WebDAV can do the job, or the user turned it off', () => {
    const old = new Date(now - 48 * HOUR).toISOString();
    expect(SE.importReminderDue(now, Object.assign({}, base, { lastImportAt: old, canWatchFolder: true }))).toBe(false);
    expect(SE.importReminderDue(now, Object.assign({}, base, { lastImportAt: old, webdavConnected: true }))).toBe(false);
    expect(SE.importReminderDue(now, Object.assign({}, base, { lastImportAt: old, off: true }))).toBe(false);
  });

  test('shows once per session, and "Don\'t remind me" turns it off', () => {
    const toasts = [];
    window.Toast = { show: t => toasts.push(t) };
    window.UnifiedSyncImportModal = { show: async () => null };
    localStorage.setItem('cs_sync_lastImportAt', new Date(Date.now() - 24 * HOUR).toISOString());

    expect(SE.maybeRemindImport()).toBe(true);
    expect(SE.maybeRemindImport()).toBe(false);
    expect(toasts.length).toBe(1);

    const off = toasts[0].actions.find(a => /remind/i.test(a.label));
    off.onClick();
    expect(SE.isImportReminderEnabled()).toBe(false);

    sessionStorage.clear();
    expect(SE.maybeRemindImport()).toBe(false);

    SE.setImportReminderEnabled(true);
    expect(SE.maybeRemindImport()).toBe(true);
  });
});
