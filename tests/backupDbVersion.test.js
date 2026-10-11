/**
 * @jest-environment jsdom
 *
 * Backup and restore must open CrossStitchDB at whatever version the app has
 * created (5 today). They used to hard-code version 4, which fails with a
 * VersionError, so every backup silently contained no projects
 * (databases.CrossStitchDB was null) and restore could not write any back.
 */
const fs = require('fs');
const { IDBFactory } = require('fake-indexeddb');
const pako = require('pako');

global.structuredClone = global.structuredClone || (v => JSON.parse(JSON.stringify(v)));
const backupSrc = fs.readFileSync('./backup-restore.js', 'utf8');

function load(idb) {
  const window = { PERF_FLAGS: {}, pako };
  const localStorage = { getItem: () => null, setItem: () => {} };
  const LOCAL_STORAGE_KEYS = { activeProject: 'a', shortcutsHint: 'b', globalGoals: 'c', globalGoalsCompat: 'd' };
  const indexedDB = idb;
  const isColorOwned = () => false;
  let BackupRestore;
  // eslint-disable-next-line no-eval
  eval(backupSrc.replace('const BackupRestore =', 'BackupRestore ='));
  return BackupRestore;
}

// The database as the app creates it (helpers.js getDB, version 5).
function openAppDb(idb) {
  return new Promise((resolve, reject) => {
    const req = idb.open('CrossStitchDB', 5);
    req.onupgradeneeded = e => {
      // Same shape as helpers.js getDB: create only what is missing, by old version.
      const db = e.target.result, old = e.oldVersion;
      const mk = (name, opts) => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, opts); };
      if (old < 4) ['projects', 'project_meta', 'stats_summaries', 'sync_snapshots'].forEach(n => mk(n));
      if (old < 5) { mk('importerTelemetry', { keyPath: 'id' }); mk('pendingImports', { keyPath: 'id' }); }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const put = (db, store, key, value) => new Promise((res, rej) => {
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value, key);
  tx.oncomplete = res; tx.onerror = () => rej(tx.error);
});
const get = (db, store, key) => new Promise((res, rej) => {
  const r = db.transaction(store).objectStore(store).get(key);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});

test('a backup of a version-5 database contains the projects', async () => {
  const idb = new IDBFactory();
  const db = await openAppDb(idb);
  await put(db, 'projects', 'proj_a', { id: 'proj_a', name: 'A', pattern: [{ id: '310' }], done: [1] });
  db.close();
  const BackupRestore = load(idb);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const backup = await BackupRestore.createBackup();
  expect(backup.databases.CrossStitchDB).not.toBeNull();
  const entry = backup.databases.CrossStitchDB.projects.find(e => e.key === 'proj_a');
  expect(entry.value.done).toEqual([1]);
});

test('restore writes the projects back into a version-5 database', async () => {
  const idb = new IDBFactory();
  const db = await openAppDb(idb);
  await put(db, 'projects', 'proj_a', { id: 'proj_a', name: 'A', pattern: [{ id: '310' }], done: [1] });
  db.close();
  const BackupRestore = load(idb);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const backup = await BackupRestore.createBackup();

  const fresh = new IDBFactory();
  const db2 = await openAppDb(fresh);
  db2.close();
  const restoring = load(fresh);
  await restoring.restore(backup);
  const db3 = await openAppDb(fresh);
  expect((await get(db3, 'projects', 'proj_a')).done).toEqual([1]);
});

test('restoring into a browser with no database yet leaves it upgradeable to the app version', async () => {
  const idb = new IDBFactory();
  const src = await openAppDb(idb);
  await put(src, 'projects', 'proj_a', { id: 'proj_a', pattern: [{ id: '310' }], done: [1] });
  src.close();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const backup = await load(idb).createBackup();

  const empty = new IDBFactory();
  await load(empty).restore(backup);
  const db = await openAppDb(empty);               // what the app does next: open at 5
  expect(db.version).toBe(5);
  expect(Array.from(db.objectStoreNames)).toEqual(expect.arrayContaining(['projects', 'importerTelemetry', 'pendingImports']));
  expect((await get(db, 'projects', 'proj_a')).done).toEqual([1]);
});
