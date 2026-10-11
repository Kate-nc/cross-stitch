/**
 * @jest-environment jsdom
 *
 * ProjectStorage.save must never let a record without a pattern replace one that
 * has a pattern (tracking audit TRACK-01: a partial record written by the
 * tracker's flush erased the chart and all progress).
 */
const fs = require('fs');
const path = require('path');
const { IDBFactory } = require('fake-indexeddb');

global.indexedDB = new IDBFactory();
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
window.indexedDB = global.indexedDB;
global.ensurePersistence = () => {};
global.structuredClone = global.structuredClone || (v => JSON.parse(JSON.stringify(v)));

// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8'));
window.ProjectStorage = ProjectStorage;

const pattern = [{ id: '310' }, { id: '310' }, { id: '666' }, { id: '666' }];
const base = () => ({
  id: 'proj_guard', name: 'Guard', settings: { sW: 2, sH: 2 },
  pattern: pattern.map(c => ({ ...c })), done: [1, 1, 0, 0]
});

beforeEach(async () => {
  await ProjectStorage.clearAllProjects();
  ProjectStorage._deletedIds.clear();
  window.Toast = { show: jest.fn() };
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('a patternless record does not overwrite a patterned one', async () => {
  await ProjectStorage.save(base());
  await expect(ProjectStorage.save({ id: 'proj_guard', name: 'Guard', settings: { sW: 2, sH: 2 } }))
    .rejects.toThrow(/patternless/);
  const stored = await ProjectStorage.get('proj_guard');
  expect(stored.pattern).toHaveLength(4);
  expect(Array.from(stored.done)).toEqual([1, 1, 0, 0]);
  expect(window.Toast.show).toHaveBeenCalledTimes(1);
});

test('compact "p" patterns count as patterns', async () => {
  await ProjectStorage.save({ ...base(), pattern: undefined, p: [['310'], ['310'], ['666'], ['666']] });
  await expect(ProjectStorage.save({ id: 'proj_guard', name: 'x' })).rejects.toThrow();
  expect((await ProjectStorage.get('proj_guard')).p).toHaveLength(4);
});

test('a patterned save still replaces a patterned one (progress updates)', async () => {
  await ProjectStorage.save(base());
  await ProjectStorage.save({ ...base(), done: [1, 1, 1, 0] });
  expect(Array.from((await ProjectStorage.get('proj_guard')).done)).toEqual([1, 1, 1, 0]);
  expect(window.Toast.show).not.toHaveBeenCalled();
});

test('a new project without a pattern can still be created, then given one', async () => {
  await ProjectStorage.save({ id: 'proj_new', name: 'Empty' });
  expect((await ProjectStorage.get('proj_new')).name).toBe('Empty');
  await ProjectStorage.save({ id: 'proj_new', name: 'Empty', pattern: pattern.map(c => ({ ...c })) });
  expect((await ProjectStorage.get('proj_new')).pattern).toHaveLength(4);
});

test('a refused save leaves the meta and stats summaries untouched', async () => {
  await ProjectStorage.save(base());
  const before = (await ProjectStorage.listProjects()).find(p => p.id === 'proj_guard');
  await ProjectStorage.save({ id: 'proj_guard', name: 'Renamed' }).catch(() => {});
  const after = (await ProjectStorage.listProjects()).find(p => p.id === 'proj_guard');
  expect(after.name).toBe(before.name);
});
