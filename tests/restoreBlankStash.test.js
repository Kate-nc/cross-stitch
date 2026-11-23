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
 * rows that differ still stop the restore.
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

async function backupWith(threads) {
  const source = load(undefined, { ThreadAccounting: A });
  await source.api.createBackup();                       // create current, empty storage
  await store(source.idb, { threads, schema_version: 3 });
  return source.api.createBackup();
}
async function deviceWith(threads) {
  const dest = load(undefined, { ThreadAccounting: A });
  await dest.api.createBackup();
  await store(dest.idb, { threads, schema_version: 3 });
  return dest;
}
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
  await expect(dest.api.restore(backup)).rejects.toThrow(/Identifier collision in threads: dmc:19\. This device's stash already has different details for DMC 19/);
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
