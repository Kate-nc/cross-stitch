// tests/stashToBuyConflicts.test.js — UX-011 / UX-021.
//
// A "conflict" is two or more active patterns competing for the same thread.
// A shortfall for a single pattern is a neutral "to buy" list, and Home's
// shopping list and the Stash Manager's To buy panels both read it from
// StashBridge.getToBuy(), so the two always agree.

const fs = require('fs');
const path = require('path');
const FDBFactory = require('fake-indexeddb/lib/FDBFactory');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const SB_SRC = read('stash-bridge.js');
const SB_SRC_NO_AUTORUN = SB_SRC.replace(
  /\/\/ Auto-run migrations on script load[\s\S]*?\.catch\(function\(\) \{ \/\* migrations log internally \*\/ \}\);\n/,
  ''
);

function loadBridge(indexedDB) {
  const window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
  const runtime = new Function(
    'window', 'indexedDB', 'CustomEvent', 'console', 'ensurePersistence', 'invalidateStatsCache',
    SB_SRC_NO_AUTORUN + '\nreturn StashBridge;'
  );
  return runtime(window, indexedDB, function CustomEvent(type) { this.type = type; },
    { log() {}, warn() {}, error() {} }, undefined, undefined);
}

async function seed(indexedDB, entries) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('stitch_manager_db', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('manager_state');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('manager_state', 'readwrite');
    Object.keys(entries).forEach(k => tx.objectStore('manager_state').put(entries[k], k));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// Library patterns whose thread quantities are already in skeins.
function pattern(id, title, threads, extra) {
  return Object.assign({
    id, title, status: 'inprogress',
    threads: threads.map(([tid, qty]) => ({ id: tid, name: 'Thread ' + tid, qty, unit: 'skeins', brand: 'DMC' }))
  }, extra || {});
}

async function bridgeWith(threads, patterns) {
  const indexedDB = new FDBFactory();
  await seed(indexedDB, { threads, patterns, schema_version: 4 });
  return loadBridge(indexedDB);
}

describe('StashBridge.detectConflicts', () => {
  test('one pattern with a shortfall is not a conflict', async () => {
    const sb = await bridgeWith({}, [pattern('p1', 'Meadow', [['310', 2], ['321', 1], ['550', 1]])]);
    expect(await sb.detectConflicts()).toEqual([]);
  });

  test('two patterns whose combined demand exceeds the stash conflict, naming both', async () => {
    const sb = await bridgeWith({ 'dmc:310': { owned: 2 } }, [
      pattern('p1', 'Meadow', [['310', 1]]),
      pattern('p2', 'Harbour', [['310', 2]])
    ]);
    const conflicts = await sb.detectConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ key: 'dmc:310', owned: 2, totalNeeded: 3, deficit: 1 });
    expect(conflicts[0].patterns.map(p => p.title).sort()).toEqual(['Harbour', 'Meadow']);
  });

  test('two patterns the stash can cover together do not conflict', async () => {
    const sb = await bridgeWith({ 'dmc:310': { owned: 3 } }, [
      pattern('p1', 'Meadow', [['310', 1]]),
      pattern('p2', 'Harbour', [['310', 2]])
    ]);
    expect(await sb.detectConflicts()).toEqual([]);
  });

  test('two patterns competing for an empty stash conflict', async () => {
    const sb = await bridgeWith({}, [
      pattern('p1', 'Meadow', [['310', 1], ['321', 1]]),
      pattern('p2', 'Harbour', [['310', 1], ['550', 1]])
    ]);
    const conflicts = await sb.detectConflicts();
    expect(conflicts.map(c => c.key)).toEqual(['dmc:310']);
  });

  test('completed patterns do not compete', async () => {
    const sb = await bridgeWith({}, [
      pattern('p1', 'Meadow', [['310', 1]]),
      pattern('p2', 'Harbour', [['310', 1]], { status: 'completed' })
    ]);
    expect(await sb.detectConflicts()).toEqual([]);
  });

  test('a thread listed twice by one pattern is still one pattern', async () => {
    const sb = await bridgeWith({}, [pattern('p1', 'Meadow', [['310', 1], ['310', 1]])]);
    expect(await sb.detectConflicts()).toEqual([]);
  });

  test('patterns that share a title are still two patterns', async () => {
    const sb = await bridgeWith({}, [
      pattern('p1', 'Sampler', [['310', 1]]),
      pattern('p2', 'Sampler', [['310', 1]])
    ]);
    const conflicts = await sb.detectConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].patterns.map(p => p.id).sort()).toEqual(['p1', 'p2']);
  });
});

describe('StashBridge.getToBuy', () => {
  test('one pattern with an empty stash lists every thread, per project and in total', async () => {
    const sb = await bridgeWith({}, [pattern('p1', 'Meadow', [['310', 2], ['321', 1], ['550', 1]])]);
    const toBuy = await sb.getToBuy();
    expect(toBuy.projects).toHaveLength(1);
    expect(toBuy.projects[0]).toMatchObject({ id: 'p1', title: 'Meadow' });
    expect(toBuy.projects[0].threads).toHaveLength(3);
    expect(toBuy.total).toHaveLength(3);
    expect(toBuy.total.find(r => r.key === 'dmc:310')).toMatchObject({ need: 2, owned: 0, toBuy: 2 });
  });

  test('threads the stash already covers are left off', async () => {
    const sb = await bridgeWith({ 'dmc:310': { owned: 2 } }, [pattern('p1', 'Meadow', [['310', 2], ['321', 1]])]);
    const toBuy = await sb.getToBuy();
    expect(toBuy.total.map(r => r.key)).toEqual(['dmc:321']);
    expect(toBuy.projects[0].threads.map(r => r.key)).toEqual(['dmc:321']);
  });

  test('a fully covered pattern has no project entry', async () => {
    const sb = await bridgeWith({ 'dmc:310': { owned: 5 } }, [pattern('p1', 'Meadow', [['310', 2]])]);
    const toBuy = await sb.getToBuy();
    expect(toBuy.projects).toEqual([]);
    expect(toBuy.total).toEqual([]);
  });

  test('the total counts a shared thread once, at the combined shortfall', async () => {
    const sb = await bridgeWith({ 'dmc:310': { owned: 1 } }, [
      pattern('p1', 'Meadow', [['310', 1], ['321', 1]]),
      pattern('p2', 'Harbour', [['310', 2]])
    ]);
    const toBuy = await sb.getToBuy();
    expect(toBuy.total.map(r => [r.key, r.toBuy]).sort()).toEqual([['dmc:310', 2], ['dmc:321', 1]]);
    // Each project is measured against the stash on its own.
    const harbour = toBuy.projects.find(p => p.id === 'p2');
    expect(harbour.threads.map(r => [r.key, r.toBuy])).toEqual([['dmc:310', 1]]);
    const meadow = toBuy.projects.find(p => p.id === 'p1');
    expect(meadow.threads.map(r => r.key)).toEqual(['dmc:321']);
  });

  test('completed patterns add nothing to buy', async () => {
    const sb = await bridgeWith({}, [pattern('p1', 'Meadow', [['310', 2]], { status: 'completed' })]);
    expect((await sb.getToBuy()).total).toEqual([]);
  });
});

describe('StashBridge.getShoppingList (shared by Home)', () => {
  test('lists the same threads as the To buy total', async () => {
    const sb = await bridgeWith({}, [pattern('p1', 'Meadow', [['310', 2], ['321', 1]])]);
    const toBuy = await sb.getToBuy();
    const list = await sb.getShoppingList();
    expect(list.map(r => r.key).sort()).toEqual(toBuy.total.map(r => r.key).sort());
    expect(list).toHaveLength(2);
    expect(list.find(r => r.key === 'dmc:310').tobuyQty).toBe(2);
  });

  test('keeps threads flagged by hand, and uses the larger quantity for threads on both', async () => {
    const sb = await bridgeWith({
      'dmc:310': { owned: 0, tobuy: true, tobuy_qty: 4, tobuy_added_at: '2026-01-01T00:00:00Z' },
      'dmc:666': { owned: 0, tobuy: true, tobuy_qty: 1, tobuy_added_at: '2026-01-02T00:00:00Z' }
    }, [pattern('p1', 'Meadow', [['310', 2], ['321', 1]])]);
    const list = await sb.getShoppingList();
    expect(list.map(r => r.key).sort()).toEqual(['dmc:310', 'dmc:321', 'dmc:666']);
    expect(list.find(r => r.key === 'dmc:310').tobuyQty).toBe(4);
    expect(list.find(r => r.key === 'dmc:321').tobuyQty).toBe(1);
  });

  test('is empty when nothing is short and nothing is flagged', async () => {
    const sb = await bridgeWith({ 'dmc:310': { owned: 3 } }, [pattern('p1', 'Meadow', [['310', 2]])]);
    expect(await sb.getShoppingList()).toEqual([]);
  });
});

describe('Stash Manager and Home wiring', () => {
  const manager = read('manager-app.js');
  const home = read('home-app.js');

  test('Manager shows a neutral To buy panel per pattern and keeps Thread Conflicts for real conflicts', () => {
    expect(manager).toMatch(/StashBridge\.getToBuy\(\)/);
    expect(manager).toMatch(/title=\{"To buy for " \+ /);
    expect(manager).toMatch(/Add to shopping list/);
    expect(manager).toMatch(/title="Thread Conflicts"[^>]*preferenceKey="stashConflictsCollapsed"/);
    expect(manager).not.toMatch(/needed by multiple patterns but you don't have enough/);
  });

  test('the To buy panel has its own persisted collapse preference', () => {
    expect(manager).toMatch(/preferenceKey="stashToBuyCollapsed"/);
    expect(read('user-prefs.js')).toMatch(/stashToBuyCollapsed:\s+false/);
  });

  test('Home leaves the shopping list to the Stash Manager and never says Colours', () => {
    // Home's Stash tab (with its own copy of the shopping list) was removed in the
    // home redesign; the list lives in the Stash Manager, and the help says so.
    expect(home).not.toMatch(/getShoppingList/);
    expect(home).not.toMatch(/'Colours'\)/);
    expect(read('help-drawer.js')).toMatch(/The Stash Manager's Shopping list already includes these threads/);
  });

  test('home-app.js is in the terminology lint scope', () => {
    const { TARGET_FILES } = require('../scripts/lint-terminology.js');
    expect(TARGET_FILES).toContain('home-app.js');
  });

  test('"fully kitted" jargon is gone from the UI sources', () => {
    ['manager-app.js', 'stats-page.js', 'home-app.js'].forEach(f => {
      expect(read(f)).not.toMatch(/fully kit|100% kitted|Fully kitted/i);
    });
  });
});

describe('plural helper', () => {
  const helpers = read('helpers.js');
  const m = helpers.match(/function plural\([^)]*\)\s*\{[^\n]*\}/);

  test('is defined in helpers.js', () => { expect(m).not.toBeNull(); });

  test('uses the singular for exactly one', () => {
    const plural = new Function('fmtNum', m[0] + '\nreturn plural;')(n => String(n));
    expect(plural(1, 'pattern')).toBe('1 pattern');
    expect(plural(0, 'pattern')).toBe('0 patterns');
    expect(plural(2, 'pattern')).toBe('2 patterns');
    expect(plural(1, 'colour', 'colours')).toBe('1 colour');
    expect(plural(3, 'box', 'boxes')).toBe('3 boxes');
  });
});
