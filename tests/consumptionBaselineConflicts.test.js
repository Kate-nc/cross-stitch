// Two devices that each started a thread-usage record for the same project.
// The Tracker records a baseline (the stitches already marked) as soon as a
// project is opened, so opening it on two devices before their stashes synced
// gives two different baselines. Before this, every sync file from the other
// device failed to import with "Conflicting consumption baselines".
const fs = require('fs');
const vm = require('vm');
const {IDBFactory, IDBKeyRange} = require('fake-indexeddb');
const {A, op, estimate, cost, key, syncEngine, clone} = require('./support/consumption-harness');

const json = x => JSON.parse(JSON.stringify(x));
// A device's ledger: one baseline per project, then stitching events.
function ledger(baselines, ops) {
  const l = A.empty(), threads = {[key]: {owned: 1}};
  Object.entries(baselines).forEach(([pid, b]) => A.baseline(l, pid, b.marks, b.legacy || null, b.date));
  A.apply(l, threads, ops || [], '2026-01-05');
  return {ledger: l, threads};
}

describe('merge keeps the baseline that has thread use after it', () => {
  test('a baseline with no events gives way to one with events, in either order', () => {
    const a = ledger({p: {marks: {}, date: '2026-01-01'}}, [op(1, 'mark', 'd:1')]).ledger;
    const b = ledger({p: {marks: {'d:0': estimate}, date: '2026-01-03'}}).ledger;
    for (const merged of [A.merge(a, b), A.merge(b, a)]) {
      expect(merged.projects.p).toEqual(a.projects.p);
      expect(Object.keys(merged.events)).toEqual(Object.keys(a.events));
    }
  });

  test('the other device\'s legacy checkpoint alone is not a conflict once one side is unused', () => {
    const a = ledger({p: {marks: {}, date: '2026-01-01'}}, [op(1)]).ledger;
    const b = ledger({p: {marks: {}, legacy: {version: 1, threads: {}}, date: '2026-01-01'}}).ledger;
    expect(A.merge(b, a).projects.p).toEqual(a.projects.p);
  });

  test('with neither used, the earlier baseline is kept whatever the merge order', () => {
    const a = ledger({p: {marks: {}, date: '2026-02-01'}}).ledger;
    const b = ledger({p: {marks: {'d:0': estimate}, date: '2026-01-01'}}).ledger;
    expect(json(A.merge(a, b))).toEqual(json(A.merge(b, a)));
    expect(A.merge(a, b).projects.p).toEqual(b.projects.p);
    // Same date: still independent of order.
    const c = ledger({p: {marks: {'d:0': estimate}, date: '2026-02-01'}}).ledger;
    expect(json(A.merge(a, c))).toEqual(json(A.merge(c, a)));
  });

  test('stitching continues from the adopted baseline', () => {
    const a = ledger({p: {marks: {}, date: '2026-01-01'}}, [op(1, 'mark', 'd:1')]).ledger;
    const b = ledger({p: {marks: {'d:0': estimate}, date: '2026-01-03'}}).ledger;
    const merged = A.merge(b, a), threads = {[key]: {owned: 1}};
    // d:0 was in b's baseline only; under a's it was never charged, so marking charges it.
    expect(A.apply(merged, threads, [op(1, 'mark', 'd:0'), op(2, 'correction', 'd:1')], '2026-01-06')).toEqual([key]);
    expect(() => A.validate(merged)).not.toThrow();
  });

  test('baselines that both have events after them still conflict in a plain merge', () => {
    const a = ledger({p: {marks: {}, date: '2026-01-01'}}, [op(1, 'mark', 'd:1')]).ledger;
    const b = ledger({p: {marks: {'d:0': estimate}, date: '2026-01-03'}}, [op(1, 'mark', 'd:1')]).ledger;
    expect(() => A.merge(a, b)).toThrow('Conflicting consumption baselines');
  });
});

describe('mergeContained leaves out only the project that cannot be combined', () => {
  const both = () => {
    const a = ledger({p: {marks: {}, date: '2026-01-01'}, q: {marks: {}, date: '2026-01-01'}},
      [op(1, 'mark', 'd:1'), op(1, 'mark', 'd:0', estimate, 'q')]).ledger;
    const b = ledger({p: {marks: {'d:0': estimate}, date: '2026-01-03'}, r: {marks: {}, date: '2026-01-02'}},
      [op(1, 'mark', 'd:1'), op(1, 'mark', 'd:0', estimate, 'r')]).ledger;
    return {a, b};
  };

  test('keeps this device\'s history for the conflicting project and merges the rest', () => {
    const {a, b} = both(), r = A.mergeContained(a, b);
    expect(r.conflicts).toEqual(['p']);
    expect(r.ledger.projects.p).toEqual(a.projects.p);
    expect(Object.keys(r.ledger.projects).sort()).toEqual(['p', 'q', 'r']);
    expect(Object.values(r.ledger.events).filter(e => e.projectId === 'p')).toEqual(Object.values(a.events).filter(e => e.projectId === 'p'));
    expect(Object.values(r.ledger.events).some(e => e.projectId === 'r')).toBe(true);
    expect(() => A.validate(r.ledger)).not.toThrow();
  });

  test('is a plain merge when nothing conflicts', () => {
    const {a} = both(), b = ledger({r: {marks: {}, date: '2026-01-02'}}, [op(1, 'mark', 'd:0', estimate, 'r')]).ledger;
    expect(A.mergeContained(a, b)).toEqual({ledger: A.merge(a, b), conflicts: []});
  });

  test('contains a contradictory event as well as a contradictory baseline', () => {
    const a = ledger({p: {marks: {}, date: '2026-01-01'}}, [op(1)]).ledger, b = clone(a);
    Object.values(b.events)[0].estimate.assumptions.strands = 6;
    expect(() => A.merge(a, b)).toThrow('Conflicting consumption history');
    const r = A.mergeContained(a, b);
    expect(r.conflicts).toEqual(['p']);
    expect(r.ledger.events).toEqual(a.events);
  });

  test('contains a receipt that names a different event', () => {
    const a = ledger({p: {marks: {}, date: '2026-01-01'}}, [{...op(1), token: 'tok'}]).ledger;
    const b = ledger({p: {marks: {}, date: '2026-01-01'}, q: {marks: {}, date: '2026-01-01'}},
      [{...op(1), token: 'other'}, {...op(1, 'mark', 'd:0', estimate, 'q'), token: 'tok'}]).ledger;
    const r = A.mergeContained(a, b);
    expect(r.conflicts).toEqual(['q']);
    expect(r.ledger.receipts.tok).toBe(a.receipts.tok);
  });

  test('a malformed ledger still stops the merge', () => {
    const a = ledger({p: {marks: {}, date: '2026-01-01'}}, [op(1)]).ledger, b = clone(a);
    b.version = 3;
    expect(() => A.mergeContained(a, b)).toThrow('Unsupported consumption history');
  });
});

describe('mergeStash with conflicting thread-usage histories', () => {
  test('imports the rest and does not charge either device\'s stitching twice', () => {
    const se = syncEngine({ThreadAccounting: A});
    // Both devices start from 1 skein; each recorded its own stitching on p, and B also on r.
    const a = ledger({p: {marks: {}, date: '2026-01-01'}}, [op(1, 'mark', 'd:1')]);
    const b = ledger({p: {marks: {'d:0': estimate}, date: '2026-01-03'}, r: {marks: {}, date: '2026-01-02'}},
      [op(1, 'mark', 'd:1'), op(1, 'mark', 'd:0', estimate, 'r')]);
    const local = {threads: a.threads, [A.KEY]: a.ledger}, remote = {threads: b.threads, [A.KEY]: b.ledger};
    expect(() => se.mergeStash(local, remote)).not.toThrow();
    const report = {}, merged = se.mergeStash(local, remote, {report});
    expect(report.consumptionConflicts).toEqual(['p']);
    // This device's p stitching and the other device's r stitching: two charges, not three.
    expect(merged.threads[key].owned).toBeCloseTo(1 - 2 * cost, 14);
    expect(merged[A.KEY].projects.p).toEqual(a.ledger.projects.p);
    // Merging again changes nothing.
    expect(se.mergeStash(merged, remote).threads[key].owned).toBeCloseTo(1 - 2 * cost, 14);
  });
});

// Two simulated devices exchanging real sync files (same harness as
// syncProtocolSemantics.test.js).
function device(id) {
  const values = new Map(), toasts = [];
  const c = {console: {...console, warn() {}}, indexedDB: new IDBFactory(), IDBKeyRange, Blob, crypto: require('crypto').webcrypto, pako: require('pako'), TextEncoder, TextDecoder,
    structuredClone, Uint8Array, ArrayBuffer, setTimeout, clearTimeout, setInterval, clearInterval,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    localStorage: {getItem: k => values.has(k) ? values.get(k) : null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k)},
    ensurePersistence() {}, dispatchEvent() {}, addEventListener() {}, CustomEvent: class {},
    Toast: {show: t => toasts.push(t)},
    Beads: require('../beads'), ProgressUnits: require('../progress-units')};
  c.window = c; c.globalThis = c; c.toasts = toasts;
  vm.createContext(c);
  for (const file of ['tracking-sync.js', 'thread-accounting.js', 'project-storage.js', 'sync-merge-helpers.js', 'sync-attachment-codec.js', 'sync-export-scheduler.js', 'sync-engine.js', 'blob-store.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8') + (file === 'project-storage.js' ? '\nthis.ProjectStorage=ProjectStorage;' : ''), c);
  }
  c.BlobStore._setOpener(() => new Promise((r, j) => { const q = c.indexedDB.open('CrossStitchDB', 5); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); }));
  c.localStorage.setItem('cs_sync_deviceId', id);
  return c;
}
async function managerRows(c) {
  const db = await new Promise((r, j) => { const q = c.indexedDB.open('stitch_manager_db'); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
  try { return await new Promise((r, j) => { const q = db.transaction('manager_state').objectStore('manager_state').getAll(); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); }); } finally { db.close(); }
}
async function putManager(c, value, k) {
  const db = await new Promise((r, j) => { const q = c.indexedDB.open('stitch_manager_db'); q.onupgradeneeded = () => q.result.createObjectStore('manager_state'); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
  try { await new Promise((r, j) => { const tx = db.transaction('manager_state', 'readwrite'); tx.objectStore('manager_state').put(value, k); tx.oncomplete = r; tx.onabort = tx.onerror = () => j(tx.error); }); } finally { db.close(); }
}
async function give(c, state) { await putManager(c, state.ledger, A.KEY); await putManager(c, state.threads, 'threads'); }
async function transfer(from, to) {
  const plan = await to.SyncEngine.prepareImport(json(await from.SyncEngine.exportSync()));
  await to.SyncEngine.executeImport(plan, {});
}
async function owned(c) { return (await managerRows(c)).find(x => x && x[key])[key].owned; }
const flags = c => c.SyncEngine.getEventLog().filter(e => e.type === 'consumption-conflict');

describe('sync between two devices', () => {
  test('opening a project on both devices before syncing no longer blocks the import', async () => {
    const a = device('A'), b = device('B');
    // A opened p and stitched one stitch; B opened p (one stitch already marked) and has not stitched.
    await give(a, ledger({p: {marks: {}, date: '2026-01-01'}}, [op(1, 'mark', 'd:1')]));
    await give(b, ledger({p: {marks: {'d:0': estimate}, date: '2026-01-03'}}));
    await transfer(a, b);
    await transfer(b, a);
    for (const c of [a, b]) {
      expect(await owned(c)).toBeCloseTo(1 - cost, 10);
      expect(flags(c)).toEqual([]);
    }
    const lb = (await managerRows(b)).find(x => x && x.version === 2);
    expect(lb.projects.p.baseline).toEqual({});
  });

  test('stitching on both devices keeps each device\'s record, imports the rest and flags it once', async () => {
    const a = device('A'), b = device('B');
    await give(a, ledger({p: {marks: {}, date: '2026-01-01'}, q: {marks: {}, date: '2026-01-01'}},
      [op(1, 'mark', 'd:1'), op(1, 'mark', 'd:0', estimate, 'q')]));
    await give(b, ledger({p: {marks: {'d:0': estimate}, date: '2026-01-03'}}, [op(1, 'mark', 'd:1')]));
    await transfer(a, b);
    // B keeps its p record and takes A's q stitching.
    expect(await owned(b)).toBeCloseTo(1 - 2 * cost, 10);
    expect(flags(b)).toHaveLength(1);
    expect(flags(b)[0].message).toContain('"p"');
    expect(b.toasts).toHaveLength(1);
    // Later files from the same device import without flagging again.
    await transfer(a, b); await transfer(a, b);
    expect(flags(b)).toHaveLength(1);
    expect(b.toasts).toHaveLength(1);
    // The other direction works too, and is flagged once there.
    await transfer(b, a);
    expect(await owned(a)).toBeCloseTo(1 - 2 * cost, 10);
    expect(flags(a)).toHaveLength(1);
    const la = (await managerRows(a)).find(x => x && x.version === 2);
    expect(la.projects.p.baseline).toEqual({});
  });
});
