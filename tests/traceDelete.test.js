/**
 * @jest-environment jsdom
 *
 * A scratch design's tracing picture (P2-4) is kept in pendingImports as
 * trace:<projectId>. Deleting the project, or every project, removes it.
 */
const fs = require('fs');
const path = require('path');
const { IDBFactory } = require('fake-indexeddb');

global.indexedDB = new IDBFactory();
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
window.indexedDB = global.indexedDB;
global.ensurePersistence = () => {};
global.structuredClone = global.structuredClone || (v => JSON.parse(JSON.stringify(v)));

eval(fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8'));
window.ProjectStorage = ProjectStorage;
const BlobStore = require('../blob-store.js');

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('CrossStitchDB', 5);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

beforeAll(async () => {
  // Let ProjectStorage create the stores, then point BlobStore at the same database.
  await ProjectStorage.listProjects();
  BlobStore._setOpener(openDb);
});

async function seed(name) {
  const id = await ProjectStorage.save({
    name, width: 2, height: 2,
    pattern: [{ id: '310' }, { id: '310' }, { id: '310' }, { id: '310' }],
    settings: { sW: 2, sH: 2, isScratchMode: true, traceImage: true, overlayOpacity: 0.3 },
  });
  await BlobStore.put('trace:' + id, { blob: 'picture', name: 'logo.png' });
  return id;
}

test('deleting a project deletes its tracing picture only', async () => {
  const a = await seed('A');
  const b = await seed('B');
  await ProjectStorage.delete(a);
  expect(await BlobStore.get('trace:' + a)).toBeNull();
  expect(await BlobStore.get('trace:' + b)).not.toBeNull();
});

test('deleting every project deletes every tracing picture', async () => {
  const c = await seed('C');
  await BlobStore.put('draft:keep', { blob: 'x' });
  await ProjectStorage.clearAllProjects();
  expect(await BlobStore.get('trace:' + c)).toBeNull();
  expect((await BlobStore.list('trace:')).length).toBe(0);
});
