/**
 * @jest-environment jsdom
 *
 * Restoring a backup onto a new device after opening its Stash page.
 *
 * The Stash Manager fills in a blank row for every DMC and Anchor thread the
 * first time it opens (manager-app.js), and the stash migration stamps those
 * rows with the legacy dates. Restore used to treat any differing thread row as
 * an identifier collision, so a backup that owned any thread stopped with
 * "Identifier collision in threads: dmc:19" on a device that had only opened
 * the Stash page. A blank row holds nothing to lose: the backup's row replaces
 * it, a blank row in the backup leaves this device's row alone, and two real
 * rows that differ still stop the restore. A row at 0 that thread usage refers
 * to was stitched down to nothing: it is a count, not a blank row.
 */
const { A, store } = require('./support/consumption-harness');
const { load } = require('./setup/backup-harness');

global.structuredClone = global.structuredClone || (v => require('v8').deserialize(require('v8').serialize(v)));

const LEGACY = '2020-01-01T00:00:00Z';
// What the Stash Manager seeds, after the v3 migration has stamped it.
const blank = () => ({ owned: 0, tobuy: false, partialStatus: null, min_stock: 0, addedAt: LEGACY, lastAdjustedAt: LEGACY, acquisitionSource: 'legacy', history: [] });
const owned = (n, at = '2026-03-01T10:00:00Z') => ({
  owned: n, tobuy: false, partialStatus: null, min_stock: 0, addedAt: at, lastAdjustedAt: at, acquisitionSource: 'purchase',
  history: [{ date: at, delta: n, reason: 'purchase' }],
});

beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { jest.restoreAllMocks(); });

async function backupWith(threads, extra) {
  const source = load(undefined, { ThreadAccounting: A });
  await source.api.createBackup();                       // create current, empty storage
  await store(source.idb, Object.assign({ threads, schema_version: 3 }, extra));
  return source.api.createBackup();
}
async function deviceWith(threads, extra, options) {
  const dest = load(undefined, Object.assign({ ThreadAccounting: A }, options));
  await dest.api.createBackup();
  await store(dest.idb, Object.assign({ threads, schema_version: 3 }, extra));
  return dest;
}
// The Tracker's per-project deduction checkpoint: dmc:19 was stitched down to nothing.
const usedUp = { 'rt_deduction:p': { version: 1, threads: { 'dmc:19': { observed: 2, deducted: 2 } } } };
const usedUpRow = () => ({ owned: 0, tobuy: false, partialStatus: null, min_stock: 0, addedAt: LEGACY, lastAdjustedAt: LEGACY, acquisitionSource: 'legacy', history: [] });
const threadsOf = async dest => (await store(dest.idb)).threads;

test('a backup restores onto a device whose Stash page filled in blank rows', async () => {
  const backup = await backupWith({ 'dmc:19': owned(2), 'dmc:310': owned(1) });
  const dest = await deviceWith({ 'dmc:19': blank(), 'dmc:310': blank(), 'dmc:550': blank(), 'anchor:403': blank() });
  await dest.api.restore(backup);
  const threads = await threadsOf(dest);
  expect(threads['dmc:19']).toEqual(owned(2));
  expect(threads['dmc:310']).toEqual(owned(1));
  expect(threads['dmc:550']).toEqual(blank());
  expect(threads['anchor:403']).toEqual(blank());
});

test('a blank row in the backup leaves the device\'s real row alone', async () => {
  const backup = await backupWith({ 'dmc:19': blank(), 'dmc:310': owned(3) });
  const dest = await deviceWith({ 'dmc:19': owned(4, '2026-05-01T09:00:00Z') });
  await dest.api.restore(backup);
  const threads = await threadsOf(dest);
  expect(threads['dmc:19']).toEqual(owned(4, '2026-05-01T09:00:00Z'));
  expect(threads['dmc:310']).toEqual(owned(3));
});

test('two real rows that differ still stop the restore and change nothing', async () => {
  const backup = await backupWith({ 'dmc:19': owned(2) });
  const dest = await deviceWith({ 'dmc:19': owned(5, '2026-06-01T09:00:00Z'), 'dmc:310': blank() });
  const before = await threadsOf(dest);
  await expect(dest.api.restore(backup)).rejects.toThrow(/Identifier collision in threads: dmc:19\. This device's stash has different details for DMC 19 from the backup's, so nothing was changed\. To keep the backup's version, restore it in a new browser profile\./);
  expect(await threadsOf(dest)).toEqual(before);
});

test('a row with stock, a shopping flag, history or an unknown field is not blank', async () => {
  for (const real of [
    Object.assign(blank(), { owned: 0.5 }),
    Object.assign(blank(), { tobuy: true }),
    Object.assign(blank(), { partialStatus: 'used' }),
    Object.assign(blank(), { min_stock: 1 }),
    Object.assign(blank(), { tobuy_qty: 2 }),
    Object.assign(blank(), { history: [{ date: LEGACY, delta: -1 }] }),
    Object.assign(blank(), { minStock: 1 }),
  ]) {
    const backup = await backupWith({ 'dmc:19': owned(2) });
    const dest = await deviceWith({ 'dmc:19': real });
    await expect(dest.api.restore(backup)).rejects.toThrow(/Identifier collision in threads: dmc:19/);
  }
});

test('a thread stitched down to nothing on this device is not blank', async () => {
  const backup = await backupWith({ 'dmc:19': owned(2) });
  const dest = await deviceWith({ 'dmc:19': usedUpRow() }, usedUp);
  const before = await threadsOf(dest);
  await expect(dest.api.restore(backup)).rejects.toThrow(/Identifier collision in threads: dmc:19/);
  expect(await threadsOf(dest)).toEqual(before);
});

test('a thread stitched down to nothing in the backup is not blank either', async () => {
  const backup = await backupWith({ 'dmc:19': usedUpRow() }, usedUp);
  const dest = await deviceWith({ 'dmc:19': owned(3) });
  await expect(dest.api.restore(backup)).rejects.toThrow(/Identifier collision in threads: dmc:19/);
  expect((await threadsOf(dest))['dmc:19']).toEqual(owned(3));
});

test('a backup that differs only by blank rows changes nothing', async () => {
  const backup = await backupWith({ 'dmc:19': blank(), 'dmc:310': blank() });
  const dest = await deviceWith({ 'dmc:19': owned(4), 'dmc:310': blank() });
  // A device's first restore always publishes (it records the storage
  // generation), even of its own backup; the second shows what changed.
  await dest.api.restore(await dest.api.createBackup());
  const result = await dest.api.restore(backup);
  expect(result.unchanged).toBe(true);
  expect((await threadsOf(dest))['dmc:19']).toEqual(owned(4));
});

test('the collision message names Anchor threads in the usual way', async () => {
  const backup = await backupWith({ 'anchor:403': owned(2) });
  const dest = await deviceWith({ 'anchor:403': owned(1) });
  await expect(dest.api.restore(backup)).rejects.toThrow(/different details for Anchor 403 from/);
});

test('folder sync starts again after a restore that publishes nothing', async () => {
  const SyncEngine = { isWatching: () => true, stopWatching: jest.fn(), startWatching: jest.fn() };
  const backup = await backupWith({ 'dmc:19': owned(2) });
  const dest = await deviceWith({ 'dmc:19': owned(5) }, null, { SyncEngine });
  await expect(dest.api.restore(backup)).rejects.toThrow(/Identifier collision/);
  expect(SyncEngine.stopWatching).toHaveBeenCalledTimes(1);
  expect(SyncEngine.startWatching).toHaveBeenCalledTimes(1);

  const idle = { isWatching: () => false, stopWatching: jest.fn(), startWatching: jest.fn() };
  const other = await deviceWith({ 'dmc:19': owned(5) }, null, { SyncEngine: idle });
  await expect(other.api.restore(backup)).rejects.toThrow(/Identifier collision/);
  expect(idle.startWatching).not.toHaveBeenCalled();
});
