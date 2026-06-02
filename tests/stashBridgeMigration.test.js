const fs = require('fs');
const path = require('path');
const FDBFactory = require('fake-indexeddb/lib/FDBFactory');

const SB_SRC = fs.readFileSync(path.join(__dirname, '..', 'stash-bridge.js'), 'utf8');
const SB_SRC_NO_AUTORUN = SB_SRC.replace(
  /\/\/ Auto-run migrations on script load[\s\S]*?\.catch\(function\(\) \{ \/\* migrations log internally \*\/ \}\);\n/,
  ''
);

function createWindow() {
  const listeners = Object.create(null);
  return {
    __events: [],
    SyncEngine: { triggerAutoExport: jest.fn() },
    addEventListener(type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
    removeEventListener(type, listener) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(fn => fn !== listener);
    },
    dispatchEvent(event) {
      this.__events.push(event.type);
      (listeners[event.type] || []).slice().forEach(fn => fn(event));
      return true;
    },
  };
}

function CustomEvent(type) {
  this.type = type;
}

function loadBridge(indexedDB) {
  const window = createWindow();
  const runtime = new Function(
    'window',
    'indexedDB',
    'CustomEvent',
    'console',
    'ensurePersistence',
    'invalidateStatsCache',
    SB_SRC_NO_AUTORUN + '\nreturn StashBridge;'
  );
  const StashBridge = runtime(
    window,
    indexedDB,
    CustomEvent,
    { log() {}, warn() {}, error() {} },
    undefined,
    undefined
  );
  return { StashBridge, window };
}

function openDb(indexedDB) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('stitch_manager_db', 1);
    req.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('manager_state')) db.createObjectStore('manager_state');
    };
    req.onsuccess = event => resolve(event.target.result);
    req.onerror = event => reject(event.target.error);
  });
}

async function seedManagerState(indexedDB, entries) {
  const db = await openDb(indexedDB);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('manager_state', 'readwrite');
      const store = tx.objectStore('manager_state');
      Object.keys(entries || {}).forEach(key => {
        store.put(entries[key], key);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function readManagerState(indexedDB) {
  const db = await openDb(indexedDB);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('manager_state', 'readonly');
      const store = tx.objectStore('manager_state');
      let threads;
      let schemaVersion;
      let settled = 0;
      function check() {
        if (++settled === 2) {
          resolve({
            threads: threads || {},
            schema_version: schemaVersion,
          });
        }
      }
      const tReq = store.get('threads');
      tReq.onsuccess = () => {
        threads = tReq.result;
        check();
      };
      tReq.onerror = () => reject(tReq.error);
      const sReq = store.get('schema_version');
      sReq.onsuccess = () => {
        schemaVersion = sReq.result;
        check();
      };
      sReq.onerror = () => reject(sReq.error);
    });
  } finally {
    db.close();
  }
}

function expectLegacyStamped(entry) {
  expect(entry.addedAt).toBe('2020-01-01T00:00:00Z');
  expect(entry.lastAdjustedAt).toBe('2020-01-01T00:00:00Z');
  expect(entry.acquisitionSource).toBe('legacy');
  expect(entry.history).toEqual([]);
}

describe('stash-bridge migrations', () => {
  let indexedDB;

  beforeEach(() => {
    indexedDB = new FDBFactory();
  });

  test('migrateSchemaToV2 stays backward-compatible: converts bare keys only, no schema_version write, no event', async () => {
    await seedManagerState(indexedDB, {
      threads: {
        '310': { owned: 2, tobuy: false, partialStatus: null },
      },
    });
    const { StashBridge, window } = loadBridge(indexedDB);

    await StashBridge.migrateSchemaToV2();

    const state = await readManagerState(indexedDB);
    expect(state.threads).toEqual({
      'dmc:310': { owned: 2, tobuy: false, partialStatus: null },
    });
    expect(state.schema_version).toBeUndefined();
    expect(window.__events).toEqual([]);
    expect(window.SyncEngine.triggerAutoExport).not.toHaveBeenCalled();
  });

  test('migrateSchemaToV3 preserves V2->V3 ordering: bare-key stash becomes composite and legacy-stamped once', async () => {
    await seedManagerState(indexedDB, {
      threads: {
        '310': { owned: 2, tobuy: true, partialStatus: 'about-half' },
      },
    });
    const { StashBridge, window } = loadBridge(indexedDB);

    await StashBridge.migrateSchemaToV3();

    const state = await readManagerState(indexedDB);
    expect(Object.keys(state.threads)).toEqual(['dmc:310']);
    expect(state.threads['dmc:310'].owned).toBe(2);
    expect(state.threads['dmc:310'].tobuy).toBe(true);
    expect(state.threads['dmc:310'].partialStatus).toBe('about-half');
    expectLegacyStamped(state.threads['dmc:310']);
    expect(state.schema_version).toBe(3);
    expect(window.__events.filter(type => type === 'cs:stashChanged')).toHaveLength(1);
    expect(window.SyncEngine.triggerAutoExport).toHaveBeenCalledTimes(1);
  });

  test('fresh DB migrates cleanly to latest and second run is a no-op', async () => {
    const { StashBridge, window } = loadBridge(indexedDB);

    await StashBridge.migrateToLatest();
    await StashBridge.migrateToLatest();

    const state = await readManagerState(indexedDB);
    expect(state.threads).toEqual({});
    expect(state.schema_version).toBe(3);
    expect(window.__events.filter(type => type === 'cs:stashChanged')).toHaveLength(1);
    expect(window.SyncEngine.triggerAutoExport).toHaveBeenCalledTimes(1);
  });

  test('partially migrated V2 stash upgrades to V3 with exact legacy defaults', async () => {
    await seedManagerState(indexedDB, {
      threads: {
        'dmc:310': { owned: 1, tobuy: false, partialStatus: null },
        'anchor:403': { owned: 3, tobuy: false, partialStatus: null },
      },
    });
    const { StashBridge, window } = loadBridge(indexedDB);

    await StashBridge.migrateToLatest();

    const state = await readManagerState(indexedDB);
    expectLegacyStamped(state.threads['dmc:310']);
    expectLegacyStamped(state.threads['anchor:403']);
    expect(state.schema_version).toBe(3);
    expect(window.__events.filter(type => type === 'cs:stashChanged')).toHaveLength(1);
  });

  test('already-latest DB is idempotent and does not re-fire cs:stashChanged', async () => {
    await seedManagerState(indexedDB, {
      threads: {
        'dmc:310': {
          owned: 4,
          tobuy: false,
          partialStatus: null,
          addedAt: '2024-02-01T00:00:00Z',
          lastAdjustedAt: '2024-02-01T00:00:00Z',
          acquisitionSource: 'gifted',
          history: [{ date: '2024-02-01T00:00:00Z', delta: 4 }],
        },
      },
      schema_version: 3,
    });
    const { StashBridge, window } = loadBridge(indexedDB);

    await StashBridge.migrateToLatest();
    await StashBridge.migrateToLatest();

    const state = await readManagerState(indexedDB);
    expect(state.threads['dmc:310'].history).toEqual([{ date: '2024-02-01T00:00:00Z', delta: 4 }]);
    expect(state.schema_version).toBe(3);
    expect(window.__events.filter(type => type === 'cs:stashChanged')).toHaveLength(0);
    expect(window.SyncEngine.triggerAutoExport).toHaveBeenCalledTimes(0);
  });
});

describe('stash-bridge writers after migration initialise V3 fields', () => {
  let indexedDB;
  let StashBridge;

  beforeEach(async () => {
    indexedDB = new FDBFactory();
    ({ StashBridge } = loadBridge(indexedDB));
    await StashBridge.migrateToLatest();
  });

  test('updateThreadOwned sees schema version 3 after migration', async () => {
    await StashBridge.updateThreadOwned('310', 2);

    const state = await readManagerState(indexedDB);
    const entry = state.threads['dmc:310'];
    expect(entry.owned).toBe(2);
    expect(typeof entry.addedAt).toBe('string');
    expect(typeof entry.lastAdjustedAt).toBe('string');
    expect(entry.acquisitionSource).toBeNull();
    expect(entry.history).toHaveLength(1);
    expect(entry.history[0].delta).toBe(2);
  });

  test('addToStash sees schema version 3 after migration', async () => {
    await StashBridge.addToStash('310', 1, { acquisitionSource: 'gifted' });

    const state = await readManagerState(indexedDB);
    const entry = state.threads['dmc:310'];
    expect(entry.owned).toBe(1);
    expect(typeof entry.addedAt).toBe('string');
    expect(typeof entry.lastAdjustedAt).toBe('string');
    expect(entry.acquisitionSource).toBe('gifted');
    expect(entry.history).toHaveLength(1);
    expect(entry.history[0].delta).toBe(1);
  });

  test('markBought sees schema version 3 after migration', async () => {
    await seedManagerState(indexedDB, {
      threads: {
        'dmc:310': { owned: 0, tobuy: true, tobuy_qty: 2, partialStatus: null },
      },
    });
    ({ StashBridge } = loadBridge(indexedDB));
    await StashBridge.migrateToLatest();

    const result = await StashBridge.markBought('310');

    const state = await readManagerState(indexedDB);
    const entry = state.threads['dmc:310'];
    expect(result).toEqual({ key: 'dmc:310', addedSkeins: 2, newOwned: 2 });
    expect(entry.owned).toBe(2);
    expect(entry.tobuy).toBe(false);
    expect(entry.tobuy_qty).toBe(0);
    expect(typeof entry.addedAt).toBe('string');
    expect(typeof entry.lastAdjustedAt).toBe('string');
    expect(entry.history).toHaveLength(1);
    expect(entry.history[0].delta).toBe(2);
  });

  test('markBoughtMany sees schema version 3 after migration', async () => {
    await seedManagerState(indexedDB, {
      threads: {
        'dmc:310': { owned: 0, tobuy: true, tobuy_qty: 2, partialStatus: null },
        'dmc:321': { owned: 1, tobuy: true, tobuy_qty: 1, partialStatus: null },
      },
    });
    ({ StashBridge } = loadBridge(indexedDB));
    await StashBridge.migrateToLatest();

    const result = await StashBridge.markBoughtMany({ '310': 0, '321': 0 });

    const state = await readManagerState(indexedDB);
    expect(result).toEqual([
      { key: 'dmc:310', addedSkeins: 2, newOwned: 2 },
      { key: 'dmc:321', addedSkeins: 1, newOwned: 2 },
    ]);
    expect(state.threads['dmc:310'].history[0].delta).toBe(2);
    expect(state.threads['dmc:321'].history[0].delta).toBe(1);
    expect(state.threads['dmc:310'].tobuy).toBe(false);
    expect(state.threads['dmc:321'].tobuy).toBe(false);
    expect(typeof state.threads['dmc:310'].addedAt).toBe('string');
    expect(typeof state.threads['dmc:321'].addedAt).toBe('string');
  });
});

describe('stash-bridge writers ensure migration before writes', () => {
  test('updateThreadOwned migrates to v3 before mutating stash rows', async () => {
    const indexedDB = new FDBFactory();
    const { StashBridge } = loadBridge(indexedDB);

    await StashBridge.updateThreadOwned('310', 2);

    const state = await readManagerState(indexedDB);
    const entry = state.threads['dmc:310'];
    expect(state.schema_version).toBe(3);
    expect(entry.owned).toBe(2);
    expect(typeof entry.addedAt).toBe('string');
    expect(typeof entry.lastAdjustedAt).toBe('string');
    expect(entry.acquisitionSource).toBeNull();
    expect(entry.history).toHaveLength(1);
    expect(entry.history[0].delta).toBe(2);
  });
});
