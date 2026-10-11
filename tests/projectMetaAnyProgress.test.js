/**
 * @jest-environment jsdom
 *
 * listProjects() rows say whether anything has been stitched, half stitches included
 * (completedStitches counts full stitches and knots only), so Home can decide whether a backup
 * reminder is worth showing.
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
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'helpers.js'), 'utf8'));
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8'));

const pattern = () => Array.from({ length: 6 }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0] }));
const proj = (id, over) => Object.assign({ id, name: id, settings: { sW: 3, sH: 2 }, pattern: pattern(), done: [0, 0, 0, 0, 0, 0] }, over);

beforeEach(async () => { await ProjectStorage.clearAllProjects(); ProjectStorage._deletedIds.clear(); });

test('anyProgress is true for full stitches, for half stitches alone, and false for an untouched project', async () => {
  await ProjectStorage.save(proj('proj_full', { done: [1, 0, 0, 0, 0, 0] }));
  await ProjectStorage.save(proj('proj_half', { halfDone: [[2, { fwd: true }]] }));
  await ProjectStorage.save(proj('proj_none'));
  await ProjectStorage.save(proj('proj_emptyhalf', { halfDone: [[2, {}]] }));
  const rows = Object.fromEntries((await ProjectStorage.listProjects()).map(r => [r.id, r]));
  expect(rows.proj_full.anyProgress).toBe(true);
  expect(rows.proj_half.anyProgress).toBe(true);
  expect(rows.proj_half.completedStitches).toBe(0);      // the old field alone would have missed it
  expect(rows.proj_none.anyProgress).toBe(false);
  expect(rows.proj_emptyhalf.anyProgress).toBe(false);
});
