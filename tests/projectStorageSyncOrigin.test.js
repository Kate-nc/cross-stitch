/**
 * @jest-environment jsdom
 *
 * ProjectStorage tells sync about every committed change, and says when a
 * change came from applying an import, so the cloud icon can show work this
 * device has not shared yet. Deletions count too: their tombstones travel.
 */
const fs = require('fs');
const path = require('path');
const { IDBFactory } = require('fake-indexeddb');

global.indexedDB = new IDBFactory();
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
window.indexedDB = global.indexedDB;
global.ensurePersistence = () => {};
const v8 = require('v8');
global.structuredClone = v => v8.deserialize(v8.serialize(v));

const calls = [];
global.SyncEngine = { triggerAutoExport: opts => calls.push(opts && opts.origin || 'local') };

// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'helpers.js'), 'utf8'));
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8'));
window.ProjectStorage = ProjectStorage;

const proj = id => ({ id, name: id, settings: { sW: 2, sH: 1 }, pattern: [{ id: '310' }, { id: '310' }], done: [0, 0] });

beforeEach(async () => {
  await ProjectStorage.clearAllProjects();
  ProjectStorage._deletedIds.clear();
  calls.length = 0;
});

test('a save reports a local change; an import save reports its origin', async () => {
  await ProjectStorage.save(proj('proj_a'));
  await ProjectStorage.save(proj('proj_b'), { syncOrigin: 'import' });
  expect(calls).toEqual(['local', 'import']);
});

test('deleting a project reports a local change', async () => {
  await ProjectStorage.save(proj('proj_a'));
  calls.length = 0;
  await ProjectStorage.delete('proj_a');
  expect(calls).toEqual(['local']);
});

test('a deletion applied from an import reports its origin', async () => {
  await ProjectStorage.save(proj('proj_a'));
  calls.length = 0;
  await ProjectStorage.delete('proj_a', { syncOrigin: 'import' });
  expect(calls).toEqual(['import']);
});

test('bulk deletion reports each deletion', async () => {
  await ProjectStorage.save(proj('proj_a'));
  await ProjectStorage.save(proj('proj_b'));
  calls.length = 0;
  await ProjectStorage.deleteMany(['proj_a', 'proj_b']);
  expect(calls).toEqual(['local', 'local']);
});

test('"delete all" reports a change; a resync wipe does not', async () => {
  await ProjectStorage.save(proj('proj_a'));
  calls.length = 0;
  await ProjectStorage.clearAllProjects();
  expect(calls).toEqual([]);
  await ProjectStorage.save(proj('proj_b'));
  calls.length = 0;
  await ProjectStorage.clearAllProjects({ tombstone: true });
  expect(calls).toEqual(['local']);
});
