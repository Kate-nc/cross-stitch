/* Tap-lag audit, fix #9: the thread-usage ledger shares equal event parts
   (estimates, empty amounts), apply() finds the newest event per stitch without
   a key per event, and totals() sorts only the project's events. The ledger is
   stock accounting other devices merge, so results must not change: this holds
   apply(), totals(), state(), sequences() and compact() to identical JSON,
   numbers and errors against the module before the change
   (tests/fixtures/thread-accounting.reference.js), over seeded random histories
   that round-trip through structured clone as IndexedDB does. */
const v8 = require('v8');
global.ProgressUnits = require('../progress-units.js');
const CUR = require('../thread-accounting.js');
const REF = require('./fixtures/thread-accounting.reference.js');
const clone = v => v8.deserialize(v8.serialize(v));
const json = v => JSON.stringify(v);

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const THREADS = [{ id: '310', type: 'solid' }, { id: '321', type: 'solid' }, { id: '310+321', type: 'blend', threads: [{ id: '310' }, { id: '321' }] }];
const est = (A, t, f) => A.snapshot({ pattern: [t], done: [1], fabricCt: f }, {})['d:0'];
const KINDS = ['mark', 'mark', 'mark', 'correction', 'unpick', 'undo-unpick', 'correct-project', 'bogus'];

function attempt(A, ledger, threads, ops, date) {
  try { return { ok: A.apply(ledger, threads, ops, date, { 'dmc:310': 0.0001 }) }; } catch (e) { return { err: e.message }; }
}

test('apply() over random histories matches the reference: ledger, stock, changes and errors', () => {
  for (let seed = 1; seed <= 120; seed++) {
    const r = rng(seed);
    let a = CUR.empty(), b = REF.empty(), ta = { 'dmc:310': { owned: 3 }, 'dmc:321': { owned: 0.5, partialStatus: 'remnant' } }, tb = clone(ta);
    ['p1', 'p2'].forEach(p => { CUR.baseline(a, p, { 'd:9': {} }, null, '2026-01-01'); REF.baseline(b, p, { 'd:9': {} }, null, '2026-01-01'); });
    const seqA = {}, seqB = {};
    for (let step = 0; step < 40; step++) {
      const n = 1 + Math.floor(r() * 4), opsA = [], opsB = [];
      for (let i = 0; i < n; i++) {
        const projectId = pick(r, ['p1', 'p2', 'p1']), unit = 'd:' + Math.floor(r() * 10), k = projectId + unit;
        const kind = pick(r, KINDS), stale = r() < 0.08, retry = r() < 0.05;
        const t = pick(r, THREADS), f = pick(r, [14, 18]);
        const seq = retry ? Math.max(1, seqA[k] || 1) : (seqA[k] || 0) + 1 + (stale ? 1 : 0);
        const op = { projectId, unit, seq, kind, enabled: r() < 0.6, token: r() < 0.7 ? 't' + seed + '-' + step + '-' + i : undefined,
          estimate: r() < 0.9 ? est(CUR, t, f) : undefined, date: '2026-02-0' + (1 + (step % 9)) };
        opsA.push(op); opsB.push(clone(op));
      }
      const ra = attempt(CUR, a, ta, opsA, '2026-03-01'), rb = attempt(REF, b, tb, opsB, '2026-03-01');
      expect(json(ra)).toBe(json(rb));
      if (ra.err) {                                        // the write aborts: both roll back
        a = clone(a); b = clone(b);
      }
      expect(json(a)).toBe(json(b));
      expect(json(ta)).toBe(json(tb));
      opsA.forEach(op => { const k = op.projectId + op.unit; if (a.events[JSON.stringify([op.projectId, op.unit, op.seq])]) seqA[k] = Math.max(seqA[k] || 0, op.seq); });
      Object.assign(seqB, seqA);
      if (r() < 0.3) { a = CUR.compact(clone(a)); b = clone(b); expect(json(a)).toBe(json(b)); }
      for (const pid of [undefined, 'p1', 'p2']) {
        expect(json(CUR.totals(a, pid))).toBe(json(REF.totals(b, pid)));
      }
      expect(json(CUR.sequences(a, 'p1'))).toBe(json(REF.sequences(b, 'p1')));
      expect(json(CUR.state(a, 'p2', 'd:3'))).toBe(json(REF.state(b, 'p2', 'd:3')));
    }
    expect(() => CUR.validate(clone(a))).not.toThrow();
  }
});

test('equal parts are shared, kept shared through structured clone, and the JSON is unchanged', () => {
  const ledger = CUR.empty();
  CUR.baseline(ledger, 'p', {}, null, '2026-01-01');
  const e = est(CUR, THREADS[0], 14);
  CUR.apply(ledger, {}, Array.from({ length: 50 }, (_, i) => ({ projectId: 'p', unit: 'd:' + i, seq: 1, kind: 'mark', estimate: JSON.parse(JSON.stringify(e)), enabled: false })), '2026-01-02', {});
  const evs = Object.values(ledger.events);
  expect(evs[0].estimate).toBe(evs[49].estimate);
  expect(evs[0].debit).toBe(evs[1].credit);
  const back = clone(ledger), bevs = Object.values(back.events);
  expect(bevs[0].estimate).toBe(bevs[49].estimate);
  // A ledger written by an older build (every part its own object) compacts to the same JSON.
  const legacy = JSON.parse(JSON.stringify(ledger));
  const before = json(legacy);
  CUR.compact(legacy);
  expect(json(legacy)).toBe(before);
  expect(Object.values(legacy.events)[0].estimate).toBe(Object.values(legacy.events)[7].estimate);
  expect(v8.serialize(legacy).length).toBeLessThan(v8.serialize(JSON.parse(before)).length * 0.8);
});

test('a caller editing its estimate afterwards does not reach the ledger', () => {
  const ledger = CUR.empty();
  CUR.baseline(ledger, 'p', {}, null, '2026-01-01');
  const e = est(CUR, THREADS[1], 14);
  CUR.apply(ledger, {}, [{ projectId: 'p', unit: 'd:1', seq: 1, kind: 'mark', estimate: e, enabled: false }], '2026-01-02', {});
  e.amounts['dmc:321'] = 99;
  expect(Object.values(ledger.events)[0].estimate.amounts['dmc:321']).not.toBe(99);
});
