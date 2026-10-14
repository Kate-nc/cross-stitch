/**
 * @jest-environment node
 *
 * Progress photos (Phase 6 batch 5, TRACK-14): the BlobStore key helpers, the photo list, the cap, project
 * isolation, project deletion, and the backup round trip.
 */
const fs = require('fs');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');
global.IDBKeyRange = IDBKeyRange;
const pako = require('pako');


function openAppDb(idb) {
  return new Promise((resolve, reject) => {
    const req = idb.open('CrossStitchDB', 5);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      ['projects', 'project_meta', 'stats_summaries', 'sync_snapshots'].forEach(n => { if (!db.objectStoreNames.contains(n)) db.createObjectStore(n); });
      if (!db.objectStoreNames.contains('pendingImports')) db.createObjectStore('pendingImports', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('importerTelemetry')) db.createObjectStore('importerTelemetry', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let BlobStore, Photos, idb;
beforeEach(() => {
  idb = new IDBFactory();
  global.indexedDB = idb;
  jest.resetModules();
  BlobStore = require('../blob-store.js');
  let dbp = null;
  BlobStore._setOpener(() => (dbp = dbp || openAppDb(idb)));
  global.BlobStore = BlobStore;
  Photos = require('../photos.js');
});

const jpeg = (n) => new Blob([new Uint8Array(n).fill(7)], { type: 'image/jpeg' });
async function addRaw(pid, id, size) {
  await BlobStore.put('photo:' + pid + ':' + id, { projectId: pid, type: 'image/jpeg', w: 10, h: 10, bytes: size, blob: jpeg(size) });
  await BlobStore.put('photothumb:' + pid + ':' + id, { projectId: pid, type: 'image/jpeg', blob: jpeg(8) });
}

describe('BlobStore prefix helpers', () => {
  test('keys lists the ids with a prefix without reading records, and deletePrefix removes them', async () => {
    await BlobStore.put('photo:p1:a', { blob: jpeg(3) });
    await BlobStore.put('photo:p1:b', { blob: jpeg(3) });
    await BlobStore.put('photo:p10:a', { blob: jpeg(3) });
    await BlobStore.put('trace:p1', { blob: jpeg(3) });
    expect((await BlobStore.keys('photo:p1:')).sort()).toEqual(['photo:p1:a', 'photo:p1:b']);
    await BlobStore.deletePrefix('photo:p1:');
    expect(await BlobStore.keys('photo:p1:')).toEqual([]);
    expect(await BlobStore.keys('photo:p10:')).toEqual(['photo:p10:a']);
    expect(await BlobStore.get('trace:p1')).not.toBeNull();
  });
});

describe('ProjectPhotos', () => {
  test('fitSize only ever shrinks, keeping the shape', () => {
    expect(Photos.fitSize(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 });
    expect(Photos.fitSize(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600 });
    expect(Photos.fitSize(800, 600, 1600)).toEqual({ w: 800, h: 600 });
    expect(Photos.fitSize(0, 10, 100)).toEqual({ w: 0, h: 0 });
  });

  test('list is oldest first, reads keys only, and one project never sees another\'s photos', async () => {
    await addRaw('proj_a', 'm', 10); await addRaw('proj_a', 'k', 10); await addRaw('proj_ab', 'z', 10);
    expect(await Photos.list('proj_a')).toEqual(['k', 'm']);
    expect(await Photos.list('proj_ab')).toEqual(['z']);
    expect(await Photos.list('proj_none')).toEqual([]);
  });

  test('remove takes the picture and its thumbnail; removeAll takes a project\'s', async () => {
    await addRaw('proj_a', 'k', 10); await addRaw('proj_a', 'm', 10); await addRaw('proj_b', 'x', 10);
    await Photos.remove('proj_a', 'k');
    expect(await Photos.list('proj_a')).toEqual(['m']);
    expect(await BlobStore.get('photo:proj_a:k')).toBeNull();
    await Photos.removeAll('proj_a');
    expect(await Photos.list('proj_a')).toEqual([]);
    expect(await Photos.list('proj_b')).toEqual(['x']);
  });

  test('add refuses a file that is not a picture, a missing project, and a 13th photo', async () => {
    await expect(Photos.add('proj_a', { type: 'application/pdf' })).rejects.toThrow(/not a picture/);
    await expect(Photos.add('', { type: 'image/png' })).rejects.toThrow(/Save the project/);
    for (let i = 0; i < Photos.MAX_PHOTOS; i++) await addRaw('proj_a', 'p' + String(i).padStart(2, '0'), 5);
    await expect(Photos.add('proj_a', { type: 'image/png' })).rejects.toThrow(/up to 12 photos/);
  });

  test('thumbUrl and fullUrl hand back object URLs (or null for a missing one)', async () => {
    global.URL.createObjectURL = jest.fn(() => 'blob:fake');
    await addRaw('proj_a', 'k', 10);
    expect(await Photos.thumbUrl('proj_a', 'k')).toBe('blob:fake');
    expect(await Photos.fullUrl('proj_a', 'k')).toBe('blob:fake');
    expect(await Photos.thumbUrl('proj_a', 'nope')).toBeNull();
  });
});

describe('photos and project deletion, backups', () => {
  const storageSrc = fs.readFileSync('./project-storage.js', 'utf8');
  test('deleting a project deletes its photos (both delete paths use the range helper)', () => {
    expect(storageSrc.match(/deletePhotoRecords\(tx\.objectStore\("pendingImports"\), id\)/g)).toHaveLength(2);
    expect(storageSrc).toMatch(/IDBKeyRange\.bound\("photo:" \+ id \+ ":"/);
    expect(storageSrc).toMatch(/IDBKeyRange\.bound\("photothumb:" \+ id \+ ":"/);
  });

  function loadBackup() {
    const backupSrc = fs.readFileSync('./backup-restore.js', 'utf8');
    const window = { PERF_FLAGS: {}, pako };
    const localStorage = { getItem: () => null, setItem: () => {} };
    const LOCAL_STORAGE_KEYS = { activeProject: 'a', shortcutsHint: 'b', globalGoals: 'c', globalGoalsCompat: 'd' };
    const indexedDB = idb;
    const IDBKeyRange = global.IDBKeyRange;
    const isColorOwned = () => false;
    let BackupRestore;
    // eslint-disable-next-line no-eval
    eval(backupSrc.replace('const BackupRestore =', 'BackupRestore ='));
    return BackupRestore;
  }

  test('a backup carries the photos and a restore brings them back (and replaces the ones on the device)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const db = await openAppDb(idb);
    await new Promise((res, rej) => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put({ id: 'proj_a', name: 'A', pattern: [{ id: '310' }], done: [0] }, 'proj_a'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
    await addRaw('proj_a', 'k', 40);
    const BR = loadBackup();
    const backup = await BR.createBackup();
    expect(backup.photos.map(p => p.id).sort()).toEqual(['photo:proj_a:k', 'photothumb:proj_a:k']);
    expect(typeof backup.photos[0].data).toBe('string');
    // The compressed file format round-trips it too.
    const file = BR.serializeBackupFile(backup, { compressed: true });
    const parsed = BR.parseBackupText(file.text);
    expect(parsed.photos).toHaveLength(2);
    // The device changes: another photo is added, the original one deleted.
    await addRaw('proj_a', 'other', 12);
    await Photos.remove('proj_a', 'k');
    await BR.restore(parsed);
    expect(await Photos.list('proj_a')).toEqual(['k']);
    const rec = await BlobStore.get('photo:proj_a:k');
    expect(rec.blob.size).toBe(40);
    expect(rec.type).toBe('image/jpeg');
  });

  test('a backup with no photos list leaves the photos on the device alone, and none is written when there are none', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const db = await openAppDb(idb); db.close();
    const BR = loadBackup();
    const empty = await BR.createBackup();
    expect('photos' in empty).toBe(false);
    await addRaw('proj_a', 'k', 10);
    await BR.restore(empty);
    expect(await Photos.list('proj_a')).toEqual(['k']);
  });
});
