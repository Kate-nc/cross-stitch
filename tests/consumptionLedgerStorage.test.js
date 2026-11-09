/* The thread-usage ledger stored a record per event (thread-accounting.js
   "Stored form", StashBridge.applyConsumptionEvents). A commit must read only
   the rows of the units it touches, and give exactly what the whole-ledger
   implementation gave: the same events, receipts, baselines, stock and errors,
   over random histories with every kind of operation, retries and deductions
   on and off. The whole form stays what backups, sync and history read. */
const { A, bridge, store, op, estimate, cost, key, clone } = require('./support/consumption-harness');
const FDBFactory = require('fake-indexeddb/lib/FDBFactory');

let idb;
beforeEach(async () => { idb = new FDBFactory(); await store(idb, { threads: { [key]: { owned: 5 } }, schema_version: 3 }); });

// Every manager_state row as stored, without assembling.
async function rawRows(db) {
  const { dbFor } = require('./support/consumption-harness');
  const d = await dbFor(db);
  try {
    return await new Promise((res, rej) => {
      const s = d.transaction('manager_state').objectStore('manager_state'), k = s.getAllKeys(), v = s.getAll();
      v.onsuccess = () => res(k.result.map((key, i) => [key, v.result[i]])); v.onerror = () => rej(v.error);
    });
  } finally { d.close(); }
}
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; }; }
const KINDS = ['mark', 'mark', 'mark', 'correction', 'unpick', 'undo-unpick', 'correct-project'];
const sortedEvents = l => Object.keys(l.events).sort().map(id => l.events[id]);

test('random histories: the stored ledger commits exactly what the whole-ledger apply() does', async () => {
  for (let seed = 1; seed <= 25; seed++) {
    idb = new FDBFactory();
    await store(idb, { threads: { [key]: { owned: 3 } }, schema_version: 3 });
    const b = bridge(idb);
    const r = rng(seed);
    let ref = A.empty(), refThreads = { [key]: { owned: 3 } };
    const seqs = {};
    for (let step = 0; step < 18; step++) {
      const pid = r() < 0.7 ? 'p1' : 'p2';
      const n = 1 + Math.floor(r() * 3), ops = [];
      for (let i = 0; i < n; i++) {
        const unit = 'd:' + Math.floor(r() * 6), k = pid + unit;
        const retry = r() < 0.08, stale = r() < 0.05;
        const seq = retry ? Math.max(1, seqs[k] || 1) : (seqs[k] || 0) + 1 + (stale ? 1 : 0);
        ops.push({ projectId: pid, unit, seq, kind: KINDS[Math.floor(r() * KINDS.length)], enabled: r() < 0.6, estimate,
          token: r() < 0.7 ? 't' + seed + '-' + step + '-' + i : undefined });
      }
      // Reference: the whole ledger in memory, as the bridge used to keep it.
      const snap = clone(ref), snapThreads = clone(refThreads);
      let refErr = null;
      try {
        if (ops.length) A.baseline(ref, pid, {}, null, 'now');
        A.apply(ref, refThreads, ops, 'now', {});
      } catch (e) { refErr = e.message; ref = snap; refThreads = snapThreads; }
      let err = null;
      try { await b.applyConsumptionEvents(pid, {}, clone(ops)); } catch (e) { err = e.message; }
      expect(err).toBe(refErr);
      ops.forEach(o => { if (ref.events[JSON.stringify([o.projectId, o.unit, o.seq])]) seqs[o.projectId + o.unit] = Math.max(seqs[o.projectId + o.unit] || 0, o.seq); });
      const got = (await store(idb))[A.KEY];
      // Dates are the commit time: compare everything else.
      const strip = l => sortedEvents(l).map(e => ({ ...e, date: 0 }));
      expect(strip(got)).toEqual(strip(ref));
      expect(Object.keys(got.receipts).sort()).toEqual(Object.keys(ref.receipts).sort());
      expect(Object.keys(got.projects).sort()).toEqual(Object.keys(ref.projects).sort());
      expect((await store(idb)).threads[key].owned).toBe(refThreads[key].owned);
    }
    const final = (await store(idb))[A.KEY];
    expect(() => A.validate(final)).not.toThrow();
  }
});

test('a commit reads only the touched rows and writes only what it adds, however long the history', async () => {
  // A long history, mostly other projects', stored the old way (one record).
  const ledger = A.empty(), threads = { [key]: { owned: 5 } };
  for (let p = 0; p < 20; p++) A.baseline(ledger, 'old' + p, {}, null, '2026-01-01');
  const ops = [];
  for (let i = 0; i < 3000; i++) ops.push({ projectId: 'old' + (i % 20), unit: 'd:' + i, seq: 1, kind: 'mark', estimate, enabled: false });
  A.apply(ledger, threads, ops, '2026-01-01', {});
  await store(idb, { [A.KEY]: ledger, threads });
  const b = bridge(idb);
  // First write after updating: folds the old record into the stored form, once.
  await b.applyConsumptionEvents('p', {}, [op(1)]);
  const rows = await rawRows(idb);
  expect(rows.some(([k]) => k === A.KEY)).toBe(false);
  expect(rows.filter(([k]) => k.startsWith('tc2:e|'))).toHaveLength(3001);
  // Later commits: count what they touch.
  const FDBObjectStore = require('fake-indexeddb/lib/FDBObjectStore');
  const counts = { get: 0, getAll: 0, getAllKeys: 0, put: 0, cursor: 0 };
  const spies = ['get', 'getAll', 'getAllKeys', 'put', 'openCursor'].map(m => {
    const orig = FDBObjectStore.prototype[m];
    return jest.spyOn(FDBObjectStore.prototype, m).mockImplementation(function () {
      if (this.name === 'manager_state') counts[m === 'openCursor' ? 'cursor' : m]++;
      return orig.apply(this, arguments);
    });
  });
  try {
    await b.applyConsumptionEvents('p', {}, [op(1, 'mark', 'd:1'), op(1, 'mark', 'd:2'), op(2, 'correction', 'd:0'), op(1, 'mark', 'd:3'), op(1, 'mark', 'd:4')].map((o, i) => ({ ...o, token: 'k' + i })));
  } finally { spies.forEach(s => s.mockRestore()); }
  expect(counts.getAll).toBe(0);
  expect(counts.getAllKeys).toBe(0);
  expect(counts.cursor).toBe(5);                    // one newest-event lookup per unit
  expect(counts.get).toBeLessThanOrEqual(5 + 5 + 5 + 5); // fixed rows + exact events + receipts
  expect(counts.put).toBe(5 + 5 + 1 + 1 + 1);       // events, receipts, project row, threads, marker
  const s = await store(idb);
  expect(Object.keys(s[A.KEY].events)).toHaveLength(3006);
  expect(s.threads[key].owned).toBeCloseTo(5 - 4 * cost, 13);   // five marks, one of them corrected
});

test('the summary a commit returns carries the project\'s exact running totals', async () => {
  const b = bridge(idb);
  let res;
  for (let i = 1; i <= 40; i++) res = await b.applyConsumptionEvents('p', {}, [op(1, 'mark', 'd:' + i)]);
  res = await b.applyConsumptionEvents('p', {}, [op(2, 'correction', 'd:7'), op(2, 'unpick', 'd:8')]);
  expect(res.accounting.summary).toBe(true);
  const whole = (await store(idb))[A.KEY];
  const exact = A.totalsValue(A.toRows(whole).find(([k]) => k === A.storedKeys.project('p'))[1].totals);
  expect(res.accounting.totals).toEqual(exact);
  // Within rounding of the whole-ledger sum (which adds in event-id order).
  Object.entries(A.totals(whole, 'p')).forEach(([k, v]) => expect(res.accounting.totals[k]).toBeCloseTo(v, 15));
  expect(res.accounting.sequences).toEqual({ 'd:7': 2, 'd:8': 2 });
});

test('duplicate delivery and lost acknowledgements commit once', async () => {
  const b = bridge(idb), c = bridge(idb);
  const batch = [{ ...op(1), token: 'tok-1' }, { ...op(1, 'mark', 'd:5'), token: 'tok-2' }];
  await b.applyConsumptionEvents('p', {}, batch);
  await b.applyConsumptionEvents('p', {}, batch);                 // the same batch again
  await c.applyConsumptionEvents('p', {}, [{ ...op(1), token: undefined }]);   // retry without its token
  const s = await store(idb);
  expect(Object.keys(s[A.KEY].events)).toHaveLength(2);
  expect(s[A.KEY].receipts).toEqual({ 'tok-1': JSON.stringify(['p', 'd:0', 1]), 'tok-2': JSON.stringify(['p', 'd:5', 1]) });
  expect(s.threads[key].owned).toBeCloseTo(5 - 2 * cost, 13);
  const look = await b.consumptionLookup('p', ['d:0', 'd:5', 'd:9'], ['tok-1', 'nope']);
  expect(look).toEqual({ sequences: { 'd:0': 1, 'd:5': 1 }, receipts: { 'tok-1': JSON.stringify(['p', 'd:0', 1]) } });
});

test('two tabs writing at once are serialised: different units both commit, the same step once', async () => {
  const b = bridge(idb), c = bridge(idb);
  const r = await Promise.allSettled([
    b.applyConsumptionEvents('p', {}, [op(1, 'mark', 'd:0')]),
    c.applyConsumptionEvents('p', {}, [op(1, 'mark', 'd:1')]),
    c.applyConsumptionEvents('q', {}, [op(1, 'mark', 'd:0', estimate, 'q')]),
  ]);
  expect(r.every(x => x.status === 'fulfilled')).toBe(true);
  // A second tab that numbered the same unit from the same history: refused, not recorded twice.
  await expect(b.applyConsumptionEvents('p', {}, [{ ...op(2, 'correction', 'd:0') }])).resolves.toBeTruthy();
  await expect(c.applyConsumptionEvents('p', {}, [{ ...op(2, 'unpick', 'd:0') }])).resolves.toBeTruthy();   // a committed retry of seq 2: ignored
  await expect(c.applyConsumptionEvents('p', {}, [{ ...op(4, 'mark', 'd:0') }])).rejects.toThrow('Consumption history changed');
  const s = await store(idb);
  expect(Object.keys(s[A.KEY].events)).toHaveLength(4);
  expect(s[A.KEY].events[JSON.stringify(['p', 'd:0', 2])].kind).toBe('correction');
});

test('a whole ledger written beside the stored one (a restore, an older build) is folded in, not lost', async () => {
  const b = bridge(idb);
  await b.applyConsumptionEvents('p', {}, [op(1)]);
  // An older writer adds project q's history under the old key.
  const extra = A.empty(), t = {};
  A.baseline(extra, 'q', {}, null, 'then');
  A.apply(extra, { [key]: { owned: 5 } }, [op(1, 'mark', 'd:0', estimate, 'q')], 'then');
  await store(idb, { [A.KEY]: extra });
  // Readers already see both.
  expect(Object.keys((await store(idb))[A.KEY].events).sort()).toEqual([JSON.stringify(['p', 'd:0', 1]), JSON.stringify(['q', 'd:0', 1])]);
  expect(Object.keys((await b.getConsumptionAccounting())).length).toBeGreaterThan(0);
  // The next commit stores both and drops the old key.
  await b.applyConsumptionEvents('p', {}, [op(1, 'mark', 'd:1')]);
  const rows = await rawRows(idb);
  expect(rows.some(([k]) => k === A.KEY)).toBe(false);
  expect(Object.keys((await store(idb))[A.KEY].events)).toHaveLength(3);
  void t;
});

test('history readers: one project\'s events, or the whole ledger in its interchange form', async () => {
  const b = bridge(idb);
  await b.applyConsumptionEvents('p', { 'd:9': true }, [op(1), op(1, 'mark', 'd:1')]);
  await b.applyConsumptionEvents('q', {}, [op(1, 'mark', 'd:0', estimate, 'q')]);
  const p = await b.getConsumptionAccounting('p');
  expect(Object.values(p.events).map(e => e.projectId)).toEqual(['p', 'p']);
  expect(Object.keys(p.projects)).toEqual(['p']);
  expect(p.projects.p.baseline).toEqual({ 'd:9': true });
  const all = await b.getConsumptionAccounting();
  expect(Object.keys(all.events)).toHaveLength(3);
  expect(() => A.validate(all)).not.toThrow();
  // Stored rows and the whole form convert both ways without loss.
  const back = A.assemble(A.toRows(all));
  expect(back).toEqual(all);
  expect(A.fromRows(Object.fromEntries(await rawRows(idb)))[A.KEY]).toEqual(all);
});

test('marks with deductions off record events but never change stock; correcting the project returns only what was debited', async () => {
  const b = bridge(idb);
  await b.applyConsumptionEvents('p', {}, [{ ...op(1), enabled: false }, op(1, 'mark', 'd:1')]);
  let s = await store(idb);
  expect(s.threads[key].owned).toBeCloseTo(5 - cost, 13);
  const hist = await b.getConsumptionAccounting('p');
  const ops = ['d:0', 'd:1'].map(u => ({ ...op(A.state(hist, 'p', u).seq + 1, 'correct-project', u), estimate: A.state(hist, 'p', u).estimate || estimate }))
    .filter(o => Object.values(A.state(hist, 'p', o.unit).debits).some(v => v > 0));
  await b.applyConsumptionEvents('p', {}, ops);
  s = await store(idb);
  expect(s.threads[key].owned).toBeCloseTo(5, 13);
  expect(Object.keys(s[A.KEY].events)).toHaveLength(3);
});
