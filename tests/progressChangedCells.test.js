/**
 * @jest-environment jsdom
 *
 * Progress writes that name their changed cells. The Tracker keeps a journal of
 * which cells each new done array changed (ProjectStorage.progressChanges); a
 * progress write names the cells changed since its last write confirmed on disk
 * (`since`), and saveProgress compares only those (TrackingSync.recordDelta's
 * `indices`) when, in its own transaction, the stored record is still that
 * write. Anything else compares every cell, as before.
 *
 * The reference is the full comparison itself: every recordDelta call that
 * takes the shortcut is repeated without it on the same inputs, and the two
 * must agree, over random sequences of marks, unmarks, several marks per write,
 * writes overlapping, failing and turned away, another tab's writes, full and
 * overlay saves (new bases), navigation-journal recovery and done arrays
 * replaced wholesale (a merge or load).
 */
const fs = require('fs');
const path = require('path');
const { IDBFactory } = require('fake-indexeddb');

global.indexedDB = new IDBFactory();
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
window.indexedDB = global.indexedDB;
global.ensurePersistence = () => {};
const v8 = require('v8');
global.structuredClone = v => v8.deserialize(v8.serialize(v));
const SRC = fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8');
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'helpers.js'), 'utf8'));
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'threadCalc.js'), 'utf8'));
// eslint-disable-next-line no-eval
eval(SRC);
window.ProjectStorage = ProjectStorage;
const ThisPage = window.ProjectStorage;
// eslint-disable-next-line no-new-func
const OtherPage = new Function(SRC + '\nreturn ProjectStorage;')();
window.ProjectStorage = ThisPage;
window.CrossTabCoord = { tabId: 'tab-A', noteSeen() {}, getSeen: () => null, broadcastProjectSaved() {} };

const TS = TrackingSync;
const sorted = m => { const o = {}; Object.keys(m).sort().forEach(k => { o[k] = m[k]; }); return JSON.stringify(o); };

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
}

// ── The oracle: a shortcut recordDelta must equal the full comparison ──
const realRecordDelta = TS.recordDelta;
let oracle;
function installOracle() {
  oracle = { shortcut: 0, full: 0, mismatches: [] };
  TS.recordDelta = function (previous, delta, next, author, opts) {
    const out = realRecordDelta.call(this, previous, delta, next, author, opts);
    if (opts && opts.indices) {
      oracle.shortcut++;
      // The same author: the clocks then match exactly.
      const ref = realRecordDelta.call(this, previous, delta, next, author || 'oracle-unused');
      const got = author ? out : realRecordDelta.call(this, previous, delta, next, 'oracle-unused', opts);
      if (sorted(got.marks) !== sorted(ref.marks)) oracle.mismatches.push({ indices: Array.from(opts.indices), got: sorted(got.marks), ref: sorted(ref.marks) });
    } else oracle.full++;
    return out;
  };
}
afterEach(() => { TS.recordDelta = realRecordDelta; });

describe('TrackingSync.recordDelta with named cells', () => {
  const N = 64;
  function randomDone(r) { const d = new Uint8Array(N); for (let i = 0; i < N; i++) d[i] = r() < 0.4 ? 1 : 0; return d; }
  test('equals the full comparison whenever the named cells cover every difference', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const prevDone = randomDone(r), nextDone = Uint8Array.from(prevDone);
      const named = [];
      const k = Math.floor(r() * 6);
      for (let j = 0; j < k; j++) {
        const i = Math.floor(r() * N);
        nextDone[i] ^= 1; named.push(i);
        if (r() < 0.3) { nextDone[i] ^= 1; named.push(i); }            // marked then unmarked
      }
      for (let j = 0; j < 2; j++) if (r() < 0.5) named.push(Math.floor(r() * N));   // named but unchanged
      // A delta carried from earlier writes, some of whose cells change again.
      let delta = null;
      if (r() < 0.7) {
        const p0 = Uint8Array.from(prevDone); for (let j = 0; j < 5; j++) p0[Math.floor(r() * N)] ^= 1;
        delta = JSON.parse(JSON.stringify(realRecordDelta({ done: p0 }, null, { done: prevDone }, 'tab-a')));
      }
      const halfPrev = r() < 0.5 ? [[3, { fwd: 1 }]] : [], halfNext = r() < 0.5 ? [[3, { fwd: 1, bck: 1 }]] : halfPrev;
      const previous = { done: prevDone, halfDone: halfPrev, knotsDone: ['1,1'] };
      const next = { done: nextDone, halfDone: halfNext, knotsDone: r() < 0.5 ? ['1,1'] : [] };
      const ref = realRecordDelta(previous, delta, next, 'tab-b');
      const fast = realRecordDelta(previous, delta, next, 'tab-b', { indices: named, trusted: true });
      expect(sorted(fast.marks)).toBe(sorted(ref.marks));
      // Not trusted (registers normalised as read): the same.
      expect(sorted(realRecordDelta(previous, delta, next, 'tab-b', { indices: named }).marks)).toBe(sorted(ref.marks));
    }
  });
  test('compares only the named cells, each once', () => {
    const prev = new Uint8Array(1000), next = Uint8Array.from(prev); next[7] = 1; next[900] = 1;
    const c0 = TS.stats.cellsCompared;
    const out = realRecordDelta({ done: prev }, null, { done: next }, 'tab-a', { indices: [900, 7, 7, 900, 7] });
    expect(TS.stats.cellsCompared - c0).toBe(2);
    expect(Object.keys(out.marks).sort()).toEqual(['d:7', 'd:900']);
    expect(out.marks['d:7'][0].clock['tab-a']).toBe(1);                   // one register write, not three
  });
  test('anything that is not a list of cells, or a size change, compares every cell', () => {
    const prev = new Uint8Array(50), next = Uint8Array.from(prev); next[3] = 1;
    for (const indices of [[3, -1], [3, 1.5], [3, '4'], [3, 50], [3, NaN]]) {
      const c0 = TS.stats.cellsCompared;
      const out = realRecordDelta({ done: prev }, null, { done: next }, 'tab-a', { indices });
      expect(TS.stats.cellsCompared - c0).toBe(50);
      expect(Object.keys(out.marks)).toEqual(['d:3']);
    }
    const c0 = TS.stats.cellsCompared;
    realRecordDelta({ done: new Uint8Array(40) }, null, { done: next }, 'tab-a', { indices: [3] });
    expect(TS.stats.cellsCompared - c0).toBe(50);
  });
});

describe('ProjectStorage.progressChanges (the Tracker journal)', () => {
  const step = (j, prev, cells) => { const nd = Uint8Array.from(prev); cells.forEach(i => { nd[i] ^= 1; }); j.link(prev, nd, cells.map(i => ({ idx: i, oldVal: prev[i] }))); return nd; };
  test('the first write names nothing; later ones name the cells since the last confirmed write', () => {
    const j = ProjectStorage.progressChanges();
    let d = new Uint8Array(10);
    d = step(j, d, [1]);
    const w1 = j.begin('p', d);
    expect(w1.since).toBeNull();
    j.confirm(w1);
    d = step(j, d, [2]); d = step(j, d, [3, 2]);
    const w2 = j.begin('p', d);
    expect(w2.since.writeId).toBe(w1.writeId);
    expect(w2.since.indices.slice().sort()).toEqual([2, 2, 3]);
    expect(w2.writeId).not.toBe(w1.writeId);
  });
  test('an unconfirmed (failed or in-flight) write is not the base: its cells are named again', () => {
    const j = ProjectStorage.progressChanges();
    let d = new Uint8Array(10);
    const w0 = j.begin('p', d); j.confirm(w0);
    d = step(j, d, [1]);
    j.begin('p', d);                                   // failed: never confirmed
    d = step(j, d, [4]);
    const w2 = j.begin('p', d);
    expect(w2.since.writeId).toBe(w0.writeId);
    expect(w2.since.indices.slice().sort()).toEqual([1, 4]);
  });
  test('confirmations out of order never move the base back', () => {
    const j = ProjectStorage.progressChanges();
    let d = new Uint8Array(10);
    const a = j.begin('p', d); d = step(j, d, [1]);
    const b = j.begin('p', d);
    j.confirm(b); j.confirm(a);
    d = step(j, d, [2]);
    expect(j.begin('p', d).since.writeId).toBe(b.writeId);
  });
  test('a done array set without a link (load, merge) names nothing', () => {
    const j = ProjectStorage.progressChanges();
    let d = new Uint8Array(10);
    j.confirm(j.begin('p', d));
    const merged = Uint8Array.from(d); merged[5] = 1;                 // no link
    expect(j.begin('p', merged).since).toBeNull();
    expect(j.begin('p', step(j, merged, [6])).since).toBeNull();
  });
  test('another project, a reset, or too many waiting cells name nothing', () => {
    const j = ProjectStorage.progressChanges(5);
    let d = new Uint8Array(10);
    j.confirm(j.begin('p', d));
    d = step(j, d, [1]);
    expect(j.begin('q', d).since).toBeNull();
    d = step(j, d, [1, 2, 3, 4, 5, 6]);                               // over the limit of 5
    expect(j.begin('p', d).since).toBeNull();
    const k = ProjectStorage.progressChanges();
    let e = new Uint8Array(10);
    k.confirm(k.begin('p', e)); e = step(k, e, [1]); k.reset();
    expect(k.begin('p', e).since).toBeNull();
  });
  test('two different ways to one array: neither is believed', () => {
    const j = ProjectStorage.progressChanges();
    const a = new Uint8Array(10), b = Uint8Array.from(a); b[1] = 1;
    j.confirm(j.begin('p', a));
    const c = Uint8Array.from(b); c[2] = 1;
    j.link(a, c, [{ idx: 2 }]);
    j.link(b, c, [{ idx: 2 }]);
    expect(j.begin('p', c).since).toBeNull();
  });
  test('links hold no arrays and are dropped once a later write is confirmed', () => {
    const j = ProjectStorage.progressChanges();
    let d = new Uint8Array(10);
    j.confirm(j.begin('p', d));
    for (let i = 0; i < 5; i++) d = step(j, d, [i]);
    expect(j.size().links).toBe(5);
    j.confirm(j.begin('p', d));
    expect(j.size()).toMatchObject({ links: 0, held: 0 });
    expect(SRC).toMatch(/Arrays are known by a number, never held/);
  });
});

describe('saveProgress with named cells, against the full comparison', () => {
  const W = 12, H = 10, N = W * H;
  const pattern = () => Array.from({ length: N }, (_, i) => ({ id: i % 3 ? '310' : '550', type: 'solid' }));
  const proj = over => Object.assign({ id: 'proj_c', name: 'C', settings: { sW: W, sH: H, fabricCt: 14 }, pattern: pattern(),
    done: new Array(N).fill(0), halfDone: [], knotsDone: [], beadsDone: [], bsDone: [], partialDone: [], specialtyDone: [], statsSessions: [] }, over);
  async function rawProgress() {
    const db = await getDB();
    return new Promise((res, rej) => { const q = db.transaction('pendingImports').objectStore('pendingImports').get('progress:proj_c'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  }
  beforeEach(async () => {
    await ProjectStorage.clearAllProjects();
    await ProjectStorage.clearAllProgress();
    ProjectStorage._deletedIds.clear();
  });

  // A put that fails: the progress record's write is aborted.
  const Store = require('fake-indexeddb/lib/FDBObjectStore');
  const realPut = Store.prototype.put;
  let failNext = false;
  beforeAll(() => {
    Store.prototype.put = function (value, key) {
      if (failNext && value && typeof value.id === 'string' && value.id.startsWith('progress:')) { failNext = false; this.transaction.abort(); throw new DOMException('injected', 'AbortError'); }
      return realPut.apply(this, arguments);
    };
  });
  afterAll(() => { Store.prototype.put = realPut; });

  async function run(seed, steps) {
    const r = rng(seed);
    await ProjectStorage.save(proj());
    let base = (await ProjectStorage.get('proj_c')).lastWriteAt;
    const j = ProjectStorage.progressChanges();
    let cur = new Uint8Array(N), half = [], knots = [];
    const used = { named: 0, confirmed: 0, failed: 0 };
    const tabWrite = async (fail) => {
      const data = { done: cur, halfDone: half, knotsDone: knots, baseWriteAt: base, tabId: 'tab-A' };
      const w = j.begin('proj_c', cur);
      data.writeId = w.writeId; if (w.since) { data.since = w.since; used.named++; }
      failNext = !!fail;
      const ok = await ProjectStorage.saveProgress('proj_c', data);
      failNext = false;
      if (ok === true) { j.confirm(w); used.confirmed++; } else used.failed++;
      return ok;
    };
    const mark = (k) => {
      const nd = Uint8Array.from(cur), changes = [];
      for (let x = 0; x < k; x++) { const i = Math.floor(r() * N); changes.push({ idx: i, oldVal: nd[i] }); nd[i] ^= 1; }
      j.link(cur, nd, changes); cur = nd;
    };
    for (let s = 0; s < steps; s++) {
      const roll = r();
      if (roll < 0.35) mark(1 + Math.floor(r() * 4));
      else if (roll < 0.42) { const i = Math.floor(r() * N); mark(0); const nd = Uint8Array.from(cur); nd[i] ^= 1; j.link(cur, nd, [{ idx: i }]); const back = Uint8Array.from(nd); back[i] ^= 1; j.link(nd, back, [{ idx: i }]); cur = back; }   // mark then unmark
      else if (roll < 0.47) { half = r() < 0.5 ? [[Math.floor(r() * N), { fwd: 1 }]] : []; knots = r() < 0.5 ? ['2,2'] : []; }
      else if (roll < 0.62) await tabWrite(false);
      else if (roll < 0.66) await tabWrite(true);                                        // a failed write
      else if (roll < 0.71) {                                                             // overlapping writes, marks between
        const a = tabWrite(false); mark(1); const b = tabWrite(false); await Promise.all([a, b]);
      } else if (roll < 0.75) {                                                           // another tab's write
        const other = Uint8Array.from(cur); other[Math.floor(r() * N)] ^= 1;
        await OtherPage.saveProgress('proj_c', { done: other, baseWriteAt: base, tabId: 'tab-B', writeId: 'other-' + s });
      } else if (roll < 0.79) {                                                           // a full save: a new base
        const p = await ProjectStorage.get('proj_c');
        await ProjectStorage.save(Object.assign({}, p, { done: Array.from(cur), halfDone: half, knotsDone: knots, name: 'S' + s }));
        base = (await ProjectStorage.get('proj_c')).lastWriteAt;
      } else if (roll < 0.83) {                                                           // an overlay save
        const p = await ProjectStorage.get('proj_c');
        await ProjectStorage.save(Object.assign({}, p, { pattern: pattern(), done: Array.from(cur), halfDone: half, knotsDone: knots, notes: 'n' + s, navigationAt: Date.now() }), { overlay: true });
        base = (await ProjectStorage.get('proj_c')).lastWriteAt;
      } else if (roll < 0.86) {                                                           // navigation journal, recovered on read
        ProjectStorage.saveProgressRecovery('proj_c', { done: cur, halfDone: half, knotsDone: knots, baseWriteAt: base, writeId: 'x', since: { writeId: 'y', indices: [1] } });
        base = (await ProjectStorage.get('proj_c')).lastWriteAt;
      } else if (roll < 0.9) {                                                            // replaced wholesale (a merge): no link
        const nd = Uint8Array.from(cur); nd[Math.floor(r() * N)] ^= 1; cur = nd;
      } else await new Promise(res => setTimeout(res, 1));
    }
    expect(await tabWrite(false)).toBe(true);
    const p = await ProjectStorage.get('proj_c');
    return { used, p, cur, half, knots };
  }

  test('random sequences: every shortcut write equals the full comparison, and the marks read back are the tab\'s', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});   // the injected failures
    installOracle();
    let named = 0, shortcut = 0, failed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { used, p, cur, half, knots } = await run(seed, 60);
      named += used.named; failed += used.failed;
      expect(Array.from(p.done)).toEqual(Array.from(cur));
      expect(JSON.stringify(p.halfDone || [])).toBe(JSON.stringify(half));
      expect(p.knotsDone || []).toEqual(knots);
      // The registers read back say what the marks say.
      for (let i = 0; i < N; i++) {
        const reg = p.trackingSync.marks['d:' + i];
        const on = !!(reg && reg.length && reg.every(e => e.value === 1));
        expect([i, on]).toEqual([i, !!cur[i]]);
      }
      await ProjectStorage.clearAllProgress();
    }
    shortcut = oracle.shortcut;
    expect(oracle.mismatches).toEqual([]);
    // Not vacuous: the shortcut was taken often, and the fallbacks ran too.
    expect(shortcut).toBeGreaterThan(200);
    expect(named).toBeGreaterThanOrEqual(shortcut);
    expect(failed).toBeGreaterThan(5);
    expect(oracle.full).toBeGreaterThan(50);
    warn.mockRestore();
  }, 60000);

  test('a write naming a record that is no longer stored compares every cell', async () => {
    await ProjectStorage.save(proj());
    const b = (await ProjectStorage.get('proj_c')).lastWriteAt;
    const d1 = new Uint8Array(N); d1[1] = 1;
    expect(await ProjectStorage.saveProgress('proj_c', { done: d1, baseWriteAt: b, writeId: 'w1' })).toBe(true);
    // Another tab's write replaces it.
    const d2 = Uint8Array.from(d1); d2[2] = 1;
    await OtherPage.saveProgress('proj_c', { done: d2, baseWriteAt: b, writeId: 'other' });
    const d3 = Uint8Array.from(d1); d3[3] = 1;
    const c0 = TS.stats.cellsCompared;
    expect(await ProjectStorage.saveProgress('proj_c', { done: d3, baseWriteAt: b, writeId: 'w2', since: { writeId: 'w1', indices: [3] } })).toBe(true);
    expect(TS.stats.cellsCompared - c0).toBe(N);
    // Cell 2 (the other tab's, absent here) is written as unmarked: what the full comparison says.
    const rec = await rawProgress();
    expect(rec.trackingSyncDelta.marks['d:2'][0].value).toBe(0);
    expect(rec.writeId).toBe('w2');
  });

  test('a write naming the stored record compares only the named cells', async () => {
    await ProjectStorage.save(proj());
    const b = (await ProjectStorage.get('proj_c')).lastWriteAt;
    const d1 = new Uint8Array(N); d1[1] = 1;
    await ProjectStorage.saveProgress('proj_c', { done: d1, baseWriteAt: b, writeId: 'w1' });
    const d2 = Uint8Array.from(d1); d2[5] = 1;
    const c0 = TS.stats.cellsCompared;
    await ProjectStorage.saveProgress('proj_c', { done: d2, baseWriteAt: b, writeId: 'w2', since: { writeId: 'w1', indices: [5] } });
    expect(TS.stats.cellsCompared - c0).toBe(1);
    expect(Object.keys((await rawProgress()).trackingSyncDelta.marks).sort()).toEqual(['d:1', 'd:5']);
  });

  test('after a full save the stored record is retired: the next write compares every cell', async () => {
    await ProjectStorage.save(proj());
    const b = (await ProjectStorage.get('proj_c')).lastWriteAt;
    const d1 = new Uint8Array(N); d1[1] = 1;
    await ProjectStorage.saveProgress('proj_c', { done: d1, baseWriteAt: b, writeId: 'w1' });
    const p = await ProjectStorage.get('proj_c');
    await ProjectStorage.save(Object.assign({}, p, { name: 'again' }));
    const b2 = (await ProjectStorage.get('proj_c')).lastWriteAt;
    const d2 = Uint8Array.from(d1); d2[2] = 1;
    const c0 = TS.stats.cellsCompared;
    await ProjectStorage.saveProgress('proj_c', { done: d2, baseWriteAt: b2, writeId: 'w2', since: { writeId: 'w1', indices: [2] } });
    expect(TS.stats.cellsCompared - c0).toBe(N);
  });

  test('a navigation journal never carries a write name, and its recovery stores none', async () => {
    await ProjectStorage.save(proj());
    const b = (await ProjectStorage.get('proj_c')).lastWriteAt;
    const d = new Uint8Array(N); d[4] = 1;
    ProjectStorage.saveProgressRecovery('proj_c', { done: d, baseWriteAt: b, writeId: 'w9', since: { writeId: 'w8', indices: [4] } });
    const journal = JSON.parse(localStorage.getItem('crossstitch_progress_recovery:proj_c'));
    expect(journal.writeId).toBeUndefined();
    expect(journal.since).toBeUndefined();
    await ProjectStorage.get('proj_c');
    expect((await rawProgress()).writeId).toBeNull();
  });
});

describe('the Tracker carries changed cells to its progress writes', () => {
  const T = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
  test('every counted change to the marks is linked in the journal', () => {
    const body = T.slice(T.indexOf('function applyDoneCountsDelta('), T.indexOf('function applyDoneCountsDelta(') + 400);
    expect(body).toMatch(/progressChangesRef\.current\.link\(baseDone,newDone,changes\)/);
    expect(body).toMatch(/counts\.applyDoneCountsDelta\(changes,patArr,newDone,baseDone\)/);
    expect(T).not.toMatch(/const\{[^}]*\bapplyDoneCountsDelta\b[^}]*\}=counts;/);
  });
  test('a write names its cells, and becomes the base only once confirmed', () => {
    const w = T.slice(T.indexOf('function writeProgressNow()'), T.indexOf('function writeProgressNow()') + 4000);
    expect(w).toMatch(/pc\.begin\(o\.id, data\.done\)/);
    expect(w).toMatch(/if \(ok === true && w\) pc\.confirm\(w\);/);
    // A navigation-journal (unload) write names nothing.
    expect(w).toMatch(/!recovery && pc \? pc\.begin/);
  });
  test('loading or switching projects resets the journal', () => {
    const e = T.slice(T.indexOf('if (b.id !== id) {'), T.indexOf('if (b.id !== id) {') + 400);
    expect(e).toMatch(/progressChangesRef\.current\.reset\(\)/);
  });
});
