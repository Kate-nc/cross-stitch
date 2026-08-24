// Regression tests for the stitch_manager_db opener.
//
// Reported in the field as, on sync import:
//   Stash update failed: Failed to execute 'transaction' on 'IDBDatabase':
//   One of the specified object stores was not found.
//   StashBridge.syncProjectToLibrary failed: NotFoundError ...
//
// Cause: two Creator call sites opened the database with NO version and no
// onupgradeneeded. On a device that had never opened the Manager, that CREATES
// the database at version 1 with zero object stores. Every other consumer then
// used a hard-coded open(name, 1) — the version already matched, so
// onupgradeneeded never fired, manager_state was never created, and the first
// transaction threw NotFoundError.
//
// Repair requires a version bump (the only way to add a store), which is why
// every caller had to stop hard-coding version 1: they would otherwise fail
// with VersionError against a repaired database.

const fs = require('fs');
const path = require('path');
const { IDBFactory } = require('fake-indexeddb');

const ROOT = path.join(__dirname, '..');
const helpersSrc = fs.readFileSync(path.join(ROOT, 'helpers.js'), 'utf8');

// Pull the canonical opener out of helpers.js without executing the whole file.
function loadOpener(idb) {
  const start = helpersSrc.indexOf('function openManagerDB()');
  expect(start).toBeGreaterThan(-1);
  const end = helpersSrc.indexOf('\nif (typeof window !== \'undefined\') window.openManagerDB', start);
  expect(end).toBeGreaterThan(start);
  const body = helpersSrc.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function('indexedDB', body + '; return openManagerDB;')(idb);
}

function rawOpen(idb, name, version) {
  return new Promise((resolve, reject) => {
    const req = version === undefined ? idb.open(name) : idb.open(name, version);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

describe('openManagerDB — creates the store on a fresh database', () => {
  test('a brand new database gets manager_state', async () => {
    const idb = new IDBFactory();
    const db = await loadOpener(idb)();
    expect([...db.objectStoreNames]).toContain('manager_state');
    expect(() => db.transaction('manager_state', 'readwrite')).not.toThrow();
    db.close();
  });
});

describe('openManagerDB — repairs the database the old code left broken', () => {
  test('an existing storeless v1 database is repaired, not thrown at', async () => {
    const idb = new IDBFactory();
    // Reproduce exactly what a bare versionless open used to leave behind.
    const broken = await rawOpen(idb, 'stitch_manager_db', undefined);
    expect(broken.version).toBe(1);
    expect([...broken.objectStoreNames]).toEqual([]);
    broken.close();

    const db = await loadOpener(idb)();
    expect([...db.objectStoreNames]).toContain('manager_state');
    // The failing operation from the report now succeeds.
    expect(() => db.transaction('manager_state', 'readwrite')).not.toThrow();
    db.close();
  });

  test('repair bumps the version exactly once and is idempotent', async () => {
    const idb = new IDBFactory();
    const broken = await rawOpen(idb, 'stitch_manager_db', undefined);
    broken.close();

    const open = loadOpener(idb);
    const first = await open();
    const v = first.version;
    expect(v).toBe(2);
    first.close();

    // Opening again must NOT keep bumping the version.
    const second = await open();
    expect(second.version).toBe(v);
    expect([...second.objectStoreNames]).toContain('manager_state');
    second.close();
  });

  test('a healthy database is returned untouched', async () => {
    const idb = new IDBFactory();
    const open = loadOpener(idb);
    const first = await open();
    const v = first.version;
    first.close();
    const second = await open();
    expect(second.version).toBe(v);
    second.close();
  });

  test('data written before a repair survives it', async () => {
    const idb = new IDBFactory();
    const open = loadOpener(idb);
    const db1 = await open();
    await new Promise((resolve, reject) => {
      const tx = db1.transaction('manager_state', 'readwrite');
      tx.objectStore('manager_state').put({ 310: { owned: 4 } }, 'threads');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db1.close();

    const db2 = await open();
    const threads = await new Promise((resolve, reject) => {
      const tx = db2.transaction('manager_state', 'readonly');
      const r = tx.objectStore('manager_state').get('threads');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    expect(threads).toEqual({ 310: { owned: 4 } });
    db2.close();
  });
});

describe('no caller hard-codes version 1 any more', () => {
  // A repaired database sits at version 2, so any surviving open(name, 1)
  // would fail with VersionError — the bug would just move rather than go.
  const FILES = [
    'helpers.js', 'stash-bridge.js', 'sync-engine.js', 'manager-app.js',
    'home-app.js', 'home-screen.js', 'project-library.js', 'backup-restore.js',
    'creator/ShoppingListModal.js', 'creator/extras-bundle.js',
    'compiled/manager-app.compiled.js'
  ];

  test.each(FILES)('%s does not open stitch_manager_db at a pinned version', (file) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    // Only a NUMERIC LITERAL version is the bug. The repair paths legitimately
    // open at a computed `version + 1`, which is how the store gets created at
    // all. Comments are stripped first so the notes explaining the old code
    // don't trip the check.
    const withoutComments = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toMatch(/indexedDB\.open\(\s*["']stitch_manager_db["']\s*,\s*\d/);
  });

  test('helpers.js exposes the opener on window', () => {
    expect(helpersSrc).toMatch(/window\.openManagerDB\s*=\s*openManagerDB/);
  });
});
