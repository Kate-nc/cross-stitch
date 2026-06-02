const fs = require('fs');
const path = require('path');
const FDBFactory = require('fake-indexeddb/lib/FDBFactory');

const SB_SRC = fs.readFileSync(path.join(__dirname, '..', 'stash-bridge.js'), 'utf8');
const LOCK_SRC = fs.readFileSync(path.join(__dirname, '..', 'cross-tab-lock.js'), 'utf8');
const SB_SRC_NO_AUTORUN = SB_SRC.replace(
  /\/\/ Auto-run migrations on script load[\s\S]*?\.catch\(function\(\) \{ \/\* migrations log internally \*\/ \}\);\n/,
  ''
);

function makeWindow(overrides) {
  const listeners = Object.create(null);
  return Object.assign({
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
  }, overrides || {});
}

function CustomEvent(type) {
  this.type = type;
}

function loadBridge(indexedDB, options) {
  const opts = options || {};
  const window = opts.window || makeWindow();
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
    opts.console || { log() {}, warn() {}, error() {} },
    undefined,
    undefined
  );
  return { StashBridge, window };
}

function loadLock(windowObj, sharedStorage) {
  const localStorage = sharedStorage || {
    _store: {},
    getItem(k) { return this._store[k] != null ? this._store[k] : null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; },
  };
  new Function(
    'window', 'localStorage', 'BroadcastChannel', 'setTimeout',
    LOCK_SRC + '\n;'
  )(windowObj, localStorage, undefined, setTimeout);
  windowObj.localStorage = localStorage;
  return windowObj;
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
      Object.keys(entries || {}).forEach(key => store.put(entries[key], key));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  } finally {
    db.close();
  }
}

async function readThreads(indexedDB) {
  const db = await openDb(indexedDB);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('manager_state', 'readonly');
      const req = tx.objectStore('manager_state').get('threads');
      req.onsuccess = () => resolve(req.result || {});
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

describe('stash-bridge locking and entry versions', () => {
  test('lazy _v default starts at 0 and increments on each successful write', async () => {
    const indexedDB = new FDBFactory();
    await seedManagerState(indexedDB, {
      threads: {
        'dmc:310': { owned: 1, tobuy: false, partialStatus: null },
      },
      schema_version: 3,
    });
    const { StashBridge } = loadBridge(indexedDB);

    await StashBridge.migrateToLatest();
    await StashBridge.updateThreadOwned('310', 2);
    await StashBridge.updateThreadOwned('310', 4);

    const threads = await readThreads(indexedDB);
    expect(threads['dmc:310'].owned).toBe(4);
    expect(threads['dmc:310']._v).toBe(2);
  });

  test('addToStash acquires/releases the manager_state lock once and fires one stash event for the logical write', async () => {
    const indexedDB = new FDBFactory();
    const acquire = jest.fn().mockResolvedValue({
      ok: true,
      release: jest.fn().mockResolvedValue(true),
    });
    const window = makeWindow({ CrossTabLock: { acquire: acquire } });
    const { StashBridge } = loadBridge(indexedDB, { window: window });

    await StashBridge.migrateToLatest();
    acquire.mockClear();
    window.__events = [];
    window.SyncEngine.triggerAutoExport.mockClear();

    const next = await StashBridge.addToStash('310', 2, { acquisitionSource: 'gifted' });
    const threads = await readThreads(indexedDB);

    expect(next).toBe(2);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire.mock.calls[0][0]).toBe('manager_state');
    expect(window.__events.filter(type => type === 'cs:stashChanged')).toHaveLength(1);
    expect(window.SyncEngine.triggerAutoExport).toHaveBeenCalledTimes(1);
    expect(threads['dmc:310']._v).toBe(1);
  });

  test('lock timeout degrades to unlocked write with a warning instead of hanging', async () => {
    const indexedDB = new FDBFactory();
    const consoleStub = { log() {}, error() {}, warn: jest.fn() };
    const window = makeWindow({
      CrossTabLock: {
        acquire: jest.fn().mockResolvedValue({ ok: false, reason: 'timeout', release: jest.fn().mockResolvedValue(false) })
      }
    });
    const { StashBridge } = loadBridge(indexedDB, { window: window, console: consoleStub });

    await StashBridge.migrateToLatest();
    await StashBridge.updateThreadOwned('310', 3);

    const threads = await readThreads(indexedDB);
    expect(threads['dmc:310'].owned).toBe(3);
    expect(threads['dmc:310']._v).toBe(1);
    expect(consoleStub.warn).toHaveBeenCalled();
  });

  test('two tabs writing the same key do not lose either write and _v reflects both commits', async () => {
    const indexedDB = new FDBFactory();
    const sharedStorage = {
      _store: {},
      getItem(k) { return this._store[k] != null ? this._store[k] : null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; },
    };
    const winA = loadLock(makeWindow(), sharedStorage);
    const winB = loadLock(makeWindow(), sharedStorage);
    const { StashBridge: bridgeA } = loadBridge(indexedDB, { window: winA });
    const { StashBridge: bridgeB } = loadBridge(indexedDB, { window: winB });

    await bridgeA.migrateToLatest();
    await Promise.all([
      bridgeA.addToStash('310', 1),
      bridgeB.addToStash('310', 2),
    ]);

    const threads = await readThreads(indexedDB);
    expect(threads['dmc:310'].owned).toBe(3);
    expect(threads['dmc:310']._v).toBe(2);
  });
});