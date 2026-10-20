const FDBFactory = require('fake-indexeddb/lib/FDBFactory');
const { browserScripts } = require('./_helpers/browserScripts');

describe('duplicate readonly Stash queries through public methods', () => {
  let scope, indexedDB, connections;
  const threads = { 'dmc:310': { owned: 2 }, 'anchor:403': { owned: 1 } };
  const patterns = [
    { id: 'ready', title: 'Ready', status: 'planned', threads: [{ id: '310', qty: 2 }] },
    { id: 'short', title: 'Short', status: 'planned', threads: [{ id: '403', brand: 'anchor', qty: 3 }] },
    { id: 'done', title: 'Done', status: 'completed', threads: [{ id: '310', qty: 9 }] }
  ];
  beforeEach(async () => {
    indexedDB = new FDBFactory();
    connections = [];
    function openManagerDB() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('stitch_manager_db');
        req.onupgradeneeded = () => req.result.createObjectStore('manager_state');
        req.onsuccess = () => { connections.push(req.result); resolve(req.result); };
        req.onerror = () => reject(req.error);
      });
    }
    const db = await openManagerDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('manager_state', 'readwrite');
      const store = tx.objectStore('manager_state');
      store.put(3, 'schema_version'); store.put(threads, 'threads'); store.put(patterns, 'patterns');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
    scope = browserScripts(['stash-bridge.js'], { libraryThreadKey: browserScripts(['helpers.js'], { addEventListener() {} }).libraryThreadKey, openManagerDB, console: { warn: jest.fn(), error: jest.fn() } });
    // Includes the real script's automatic migration; don't strip its source.
    await scope.StashBridge.migrateToLatest();
  });
  afterEach(async () => {
    connections.forEach(db => db.close());
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase('stitch_manager_db');
      req.onsuccess = resolve; req.onerror = () => reject(req.error);
    });
  });
  test('real IndexedDB data produces ordered readiness and brand-aware deficits', async () => {
    const ready = await scope.StashBridge.whatCanIStart();
    expect(ready.map(p => [p.id, p.pct, p.missing])).toEqual([
      ['ready', 100, []], ['short', 0, [{ id: '403', name: undefined, need: 3, have: 1 }]]
    ]);
    const toBuy = await scope.StashBridge.getToBuy();
    expect(toBuy.total).toEqual([expect.objectContaining({ id: '403', brand: 'anchor', toBuy: 2 })]);
    expect(toBuy.shopping).toEqual([expect.objectContaining({ id: '403', brand: 'anchor' })]);
  });
  function controlledRead() {
    const requests = {};
    const order = [];
    const store = { get: jest.fn(key => { order.push(key); return (requests[key] = {}); }) };
    const tx = { objectStore: jest.fn(() => store) };
    const db = { transaction: jest.fn(() => tx), close: jest.fn(() => order.push('close')) };
    scope.openManagerDB = jest.fn(() => Promise.resolve(db));
    return { db, tx, requests, order, success(key, result) {
      requests[key].result = result;
      requests[key].onsuccess();
    } };
  }
  describe.each(['getToBuy', 'whatCanIStart'])('%s ordering and errors', method => {
    test.each([['threads', 'patterns'], ['patterns', 'threads']])('queues both reads and waits for %s then %s', async (first, second) => {
      const c = controlledRead();
      let settled = false;
      const pending = scope.StashBridge[method]().then(value => { settled = true; return value; });
      // Public getToBuy also awaits its already-completed migration.
      for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(c.db.transaction).toHaveBeenCalledWith('manager_state', 'readonly');
      expect(c.order).toEqual(['threads', 'patterns']);
      c.success(first, first === 'threads' ? threads : patterns);
      await Promise.resolve();
      expect(settled).toBe(false);
      c.success(second, second === 'threads' ? threads : patterns);
      const value = await pending;
      expect(settled).toBe(true);
      // Current readonly contract settles on request success, before tx completion.
      // Delaying this until tx.oncomplete would be a separate behaviour change.
      if (method === 'getToBuy') {
        expect(value.total[0].toBuy).toBe(2);
        expect(c.order).toEqual(['threads', 'patterns', 'close']);
      } else expect(value.map(p => p.id)).toEqual(['ready', 'short']);
      if (c.tx.oncomplete) c.tx.oncomplete();
      expect(await pending).toBe(value);
    });
    test.each(['threads', 'patterns'])('%s request failure logs and returns its public empty fallback', async key => {
      const c = controlledRead();
      const pending = scope.StashBridge[method]();
      for (let i = 0; i < 8; i++) await Promise.resolve();
      const failure = new Error('readonly request failed');
      c.requests[key].error = failure;
      c.requests[key].onerror();
      expect(await pending).toEqual(method === 'getToBuy' ? { projects: [], total: [], shopping: [] } : []);
      expect(scope.console.error).toHaveBeenCalledWith('StashBridge.' + method + ' failed:', failure);
      if (method === 'getToBuy') expect(c.db.close).toHaveBeenCalledTimes(1);
    });
    test('missing stored rows use empty defaults', async () => {
      const c = controlledRead();
      const pending = scope.StashBridge[method]();
      for (let i = 0; i < 8; i++) await Promise.resolve();
      c.success('threads', undefined); c.success('patterns', undefined);
      expect(await pending).toEqual(method === 'getToBuy' ? { projects: [], total: [], shopping: [] } : []);
    });
    test('open failure is logged and returns the same empty fallback', async () => {
      const error = new Error('cannot open stash');
      scope.openManagerDB = () => Promise.reject(error);
      expect(await scope.StashBridge[method]()).toEqual(method === 'getToBuy' ? { projects: [], total: [], shopping: [] } : []);
      expect(scope.console.error).toHaveBeenCalledWith('StashBridge.' + method + ' failed:', error);
    });
    test('an aborted real readonly transaction returns the failure fallback', async () => {
      const open = scope.openManagerDB;
      scope.openManagerDB = async () => {
        const db = await open();
        return {
          close: () => db.close(),
          transaction(...args) {
            const tx = db.transaction(...args);
            queueMicrotask(() => tx.abort());
            return tx;
          }
        };
      };
      expect(await scope.StashBridge[method]()).toEqual(method === 'getToBuy' ? { projects: [], total: [], shopping: [] } : []);
      expect(scope.console.error).toHaveBeenCalledWith('StashBridge.' + method + ' failed:', expect.objectContaining({ name: 'AbortError' }));
    });
  });
  test.each(['complete', 'abort', 'error'])('migration waits for transaction %s', async outcome => {
    const transactions = [];
    const close = jest.fn();
    const isolated = browserScripts(['stash-bridge.js'], {
      openManagerDB: () => Promise.resolve({ transaction() {
        const requests = {};
        const tx = { objectStore: () => ({ get: key => (requests[key] = {}) }) };
        transactions.push({ tx, requests });
        return tx;
      }, close }),
      console: { warn: jest.fn(), error: jest.fn() }
    });
    // Drive both the automatic startup and this public migration to settlement.
    let settled = false;
    const pending = isolated.StashBridge.migrateToLatest().then(() => { settled = true; });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(transactions).toHaveLength(2);
    transactions.forEach(({ requests }) => {
      requests.schema_version.result = 3; requests.schema_version.onsuccess();
      requests.threads.result = threads; requests.threads.onsuccess();
    });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(settled).toBe(false);
    const failure = new Error('migration ' + outcome);
    transactions.forEach(({ tx }) => {
      tx.error = failure;
      tx['on' + outcome]();
    });
    await pending;
    if (outcome === 'complete') expect(isolated.console.warn.mock.calls.filter(c => c[0] === 'StashBridge: v3 migration failed')).toEqual([]);
    else expect(isolated.console.warn).toHaveBeenCalledWith('StashBridge: v3 migration failed', failure);
    expect(close).toHaveBeenCalledTimes(2);
  });
});
