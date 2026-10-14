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

function load(idb, options = {}) {
  const window = { PERF_FLAGS: {}, pako, ...options };
  const localStorage = options.storage || { getItem: () => null, setItem: () => {} };
  const LOCAL_STORAGE_KEYS = { activeProject: 'a', shortcutsHint: 'b', globalGoals: 'c', globalGoalsCompat: 'd' };
  const indexedDB = idb;
  const isColorOwned = () => false;
  new Function('window', 'localStorage', fs.readFileSync('./user-prefs.js', 'utf8'))(window, localStorage);
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

test('a version-5 database that lacks a store is never upgraded by backup or restore', async () => {
  const idb = new IDBFactory();
  // A broken database: version 5 but without sync_snapshots.
  const db = await new Promise((resolve, reject) => {
    const req = idb.open('CrossStitchDB', 5);
    req.onupgradeneeded = e => ['projects', 'project_meta', 'stats_summaries'].forEach(n => e.target.result.createObjectStore(n));
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  await put(db, 'projects', 'proj_a', { id: 'proj_a', pattern: [{ id: '310' }], done: [1] });
  db.close();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const BackupRestore = load(idb);

  const backup = await BackupRestore.createBackup();
  expect(backup.databases.CrossStitchDB.projects).toHaveLength(1);       // still backed up
  expect(backup.databases.CrossStitchDB.sync_snapshots).toEqual([]);     // missing store reads as empty

  await expect(BackupRestore.restore(backup)).rejects.toThrow(/missing sync_snapshots/);

  // The app must still be able to open it at its own version (a bump to 6 would make this fail).
  const reopened = await new Promise((resolve, reject) => {
    const req = idb.open('CrossStitchDB', 5);
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  expect(reopened.version).toBe(5);
});

test('restore removes progress records so old marks cannot override the restored ones', async () => {
  const idb = new IDBFactory();
  const db = await openAppDb(idb);
  await put(db, 'projects', 'proj_a', { id: 'proj_a', pattern: [{ id: '310' }], done: [1] });
  await put(db, 'pendingImports', undefined, { id: 'progress:proj_a', done: new Uint8Array([0]) });
  await put(db, 'pendingImports', undefined, { id: 'trace:proj_a', blob: 'keep me' });   // other kinds are left alone
  db.close();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const BackupRestore = load(idb);
  const backup = await BackupRestore.createBackup();
  await BackupRestore.restore(backup);
  const after = await openAppDb(idb);
  expect(await get(after, 'pendingImports', 'progress:proj_a')).toBeUndefined();
  expect((await get(after, 'pendingImports', 'trace:proj_a')).blob).toBe('keep me');
  expect((await get(after, 'projects', 'proj_a')).done).toEqual([1]);
});


test('failed pre-export flush refuses stale data and shows the recovery error without recording a backup', async () => {
  const idb = new IDBFactory();
  const db = await openAppDb(idb);
  await put(db, 'projects', 'proj_a', { id: 'proj_a', pattern: [{ id: '310' }], done: [0] });
  db.close();
  const failure = new DOMException('quota exceeded', 'QuotaExceededError');
  const storage = { getItem: () => 'previous-backup', setItem: jest.fn() };
  const Toast = { show: jest.fn() };
  const B = load(idb, { __flushProjectToIDB: async () => { throw failure; }, storage, Toast });
  storage.setItem.mockClear(); // UserPrefs stamps its local schema when loaded.
  await expect(B.createBackup()).rejects.toMatchObject({ cause: failure });
  await expect(B.downloadBackup()).rejects.toThrow('latest changes could not be included');
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: expect.stringContaining('Keep this page open') }));
});

test('a flush reporting no write refuses export too', async () => {
  const B = load(new IDBFactory(), { __flushProjectToIDB: async () => ({ ok: false, reason: 'held' }) });
  await expect(B.createBackup()).rejects.toThrow('latest changes could not be included');
});

test('an IndexedDB read failure refuses a partial backup', async () => {
  const B = load({ open() { throw new Error('read failed'); } });
  await expect(B.createBackup()).rejects.toThrow('Could not read all project data');
});
