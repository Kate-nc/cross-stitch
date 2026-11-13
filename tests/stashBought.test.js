// tests/stashBought.test.js — Shopping list "Bought" ticks
// (docs/stash-redesign/hub-and-stock-take-plan.md, Phase 1).
//
// "Add ticked to stash" is StashBridge.markBoughtMany; its Undo is
// StashBridge.unmarkBoughtMany, which must take back exactly the skeins that
// were added (relative to the current count, so later edits survive) and put
// threads that were on the list by hand back on it.

const fs = require('fs');
const path = require('path');
const FDBFactory = require('fake-indexeddb/lib/FDBFactory');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const SB_SRC = read('stash-bridge.js').replace(
  /\/\/ Auto-run migrations on script load[\s\S]*?\.catch\(function\(\) \{ \/\* migrations log internally \*\/ \}\);\n/,
  ''
);

function loadBridge(indexedDB) {
  const window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
  return new Function('window', 'indexedDB', 'CustomEvent', 'console', 'ensurePersistence', 'invalidateStatsCache',
    SB_SRC + '\nreturn StashBridge;')(window, indexedDB, function CustomEvent(type) { this.type = type; },
    { log() {}, warn() {}, error() {} }, undefined, undefined);
}

async function bridgeWith(threads) {
  const indexedDB = new FDBFactory();
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('stitch_manager_db', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('manager_state');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('manager_state', 'readwrite');
    const store = tx.objectStore('manager_state');
    store.put(threads, 'threads'); store.put([], 'patterns'); store.put(4, 'schema_version');
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  db.close();
  return loadBridge(indexedDB);
}

const entry = (owned, extra) => Object.assign({ owned, tobuy: false, partialStatus: null, min_stock: 0 }, extra || {});

describe('Bought: add ticked threads to the stash, and undo', () => {
  test('adds the edited quantities and clears the shopping-list flags', async () => {
    const sb = await bridgeWith({ 'dmc:720': entry(0), 'dmc:3753': entry(2, { tobuy: true, tobuy_qty: 1 }) });
    const results = await sb.markBoughtMany({ 'dmc:720': 2, 'dmc:3753': 3 });
    expect(results.map(r => [r.key, r.addedSkeins, r.newOwned])).toEqual([['dmc:720', 2, 2], ['dmc:3753', 3, 5]]);
    const t = await sb.getGlobalStash();
    expect(t['dmc:3753'].tobuy).toBe(false);
    expect(t['dmc:3753'].tobuy_qty).toBe(0);
  });

  test('undo takes back exactly what was added and restores hand-added list entries', async () => {
    const sb = await bridgeWith({ 'dmc:720': entry(0), 'dmc:3753': entry(2, { tobuy: true, tobuy_qty: 1, tobuy_added_at: '2026-01-02T00:00:00Z' }) });
    const results = await sb.markBoughtMany({ 'dmc:720': 2, 'dmc:3753': 3 });
    await sb.unmarkBoughtMany(results.map(r => Object.assign({ key: r.key, addedSkeins: r.addedSkeins },
      r.key === 'dmc:3753' ? { tobuyQty: 1, tobuyAddedAt: '2026-01-02T00:00:00Z' } : {})));
    const t = await sb.getGlobalStash();
    expect(t['dmc:720'].owned).toBe(0);
    expect(t['dmc:720'].tobuy).toBeFalsy();
    expect(t['dmc:3753']).toMatchObject({ owned: 2, tobuy: true, tobuy_qty: 1, tobuy_added_at: '2026-01-02T00:00:00Z' });
  });

  test('undo is relative to the current count, so edits made since are kept', async () => {
    const sb = await bridgeWith({ 'dmc:310': entry(1) });
    const results = await sb.markBoughtMany({ 'dmc:310': 2 }); // 3
    await sb.updateThreadOwned('dmc:310', 5);                     // another edit: +2
    await sb.unmarkBoughtMany(results);
    expect((await sb.getGlobalStash())['dmc:310'].owned).toBe(3);
  });

  test('undo never goes below zero', async () => {
    const sb = await bridgeWith({ 'dmc:310': entry(0) });
    const results = await sb.markBoughtMany({ 'dmc:310': 2 });
    await sb.updateThreadOwned('dmc:310', 1);
    await sb.unmarkBoughtMany(results);
    expect((await sb.getGlobalStash())['dmc:310'].owned).toBe(0);
  });

  test('empty or invalid input writes nothing', async () => {
    const sb = await bridgeWith({ 'dmc:310': entry(1) });
    expect(await sb.unmarkBoughtMany([])).toEqual([]);
    expect(await sb.unmarkBoughtMany(null)).toEqual([]);
    expect((await sb.getGlobalStash())['dmc:310'].owned).toBe(1);
  });
});

describe('Shopping list wiring', () => {
  const manager = read('manager-app.js');

  test('each row has a Bought checkbox and an editable quantity once ticked', () => {
    expect(manager).toMatch(/aria-label=\{"Bought " \+ label\}/);
    expect(manager).toMatch(/label=\{"Skeins bought of " \+ label\}/);
  });

  test('adding is one markBoughtMany write and Undo uses unmarkBoughtMany', () => {
    const fn = manager.slice(manager.indexOf('async function addTickedToStash()'), manager.indexOf('function copyShoppingList()'));
    expect(fn).toMatch(/await StashBridge\.markBoughtMany\(qtyMap\)/);
    expect(fn).toMatch(/StashBridge\.unmarkBoughtMany\(/);
    expect(fn).toMatch(/undoAction:/);
    expect(fn).toMatch(/Could not add these threads to your stash/);
  });

  test('a second click while the purchase is being written is ignored', () => {
    const fn = manager.slice(manager.indexOf('async function addTickedToStash()'), manager.indexOf('async function addTicked()'));
    // A synchronous guard (React state alone updates too late for a fast double click)...
    expect(fn).toMatch(/\|\| buyingRef\.current\) return;\s*buyingRef\.current = true;/);
    // ...released whatever happens.
    expect(fn).toMatch(/finally \{ buyingRef\.current = false; setBuying\(false\); \}/);
    // Both add buttons are disabled meanwhile.
    expect(manager.match(/disabled=\{!tickedRows\.length \|\| buying\}/g)).toHaveLength(2);
  });
});
