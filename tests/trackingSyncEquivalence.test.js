/* Tap-lag audit, fix #7: TrackingSync.record / merge were made cheap on charts
   that are well under way (shared registers, each distinct register normalised
   once, full crosses compared array to array). The stored metadata is what
   other devices and older builds read, so the output must not change at all.
   This holds the module to byte-identical JSON against the version before the
   change (tests/fixtures/tracking-sync.reference.js), over seeded random
   projects that include malformed and legacy metadata, and over chains of
   saves that round-trip through structured clone the way IndexedDB does. */
const v8 = require('v8');
const CUR = require('../tracking-sync.js');
const REF = require('./fixtures/tracking-sync.reference.js');

const clone = v => v8.deserialize(v8.serialize(v));
const json = v => JSON.stringify(v);

const { rng, pick, ACTORS, project, edit } = require('./_helpers/trackingSyncGen');

test('record() output is byte-identical to the reference, including malformed and legacy metadata', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const r = rng(seed), len = 6 + Math.floor(r() * 30);
    const base = r() < 0.1 ? null : project(r, len), next = edit(r, base || project(r, len));
    const author = pick(r, ACTORS);
    expect(json(CUR.record(base, next, author))).toBe(json(REF.record(base, next, author)));
  }
});

test('a chain of saves read back through structured clone stays byte-identical', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = rng(seed * 31), len = 20 + Math.floor(r() * 60);
    let p = project(r, len), cur = clone(CUR.record(null, p, 'tab-a')), ref = clone(REF.record(null, p, 'tab-a'));
    expect(json(cur)).toBe(json(ref));
    for (let step = 0; step < 25; step++) {
      const nextCur = edit(rng(seed * 1000 + step), cur), nextRef = edit(rng(seed * 1000 + step), ref);
      const author = pick(r, ACTORS);
      cur = clone(CUR.record(cur, nextCur, author));
      ref = clone(REF.record(ref, nextRef, author));
      expect(json(cur)).toBe(json(ref));
    }
  }
});

test('reusing the last write (`from`) gives the same bytes as reading the stored copy', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = rng(seed * 131), len = 20 + Math.floor(r() * 60);
    const start = project(r, len);
    if (r() < 0.3) start.knotsDone = ['', '3,3'];                     // a name records() does not accept
    let curOut = CUR.record(null, start, 'tab-a'), ref = clone(REF.record(null, start, 'tab-a'));
    let stored = clone(curOut);
    for (let step = 0; step < 25; step++) {
      const er = rng(seed * 977 + step);
      const nextCur = edit(er, stored), nextRef = edit(rng(seed * 977 + step), ref);
      if (er() < 0.1) { nextCur.knotsDone = ['']; nextRef.knotsDone = ['']; }
      const author = pick(r, ACTORS);
      curOut = CUR.record(stored, nextCur, author, curOut.trackingSync.marks);
      ref = clone(REF.record(ref, nextRef, author));
      stored = clone(curOut);
      expect(json(stored)).toBe(json(ref));
    }
  }
});

test('an output is reused only once, and an unknown one falls back to reading', () => {
  const p = { done: [1, 0, 1], pattern: [{}, {}, {}] };
  const first = CUR.record(null, p, 'tab-a'), stored = clone(first);
  const next = Object.assign({}, stored, { done: [1, 1, 1] });
  const a = CUR.record(stored, next, 'tab-a', first.trackingSync.marks);
  const b = CUR.record(stored, next, 'tab-a', first.trackingSync.marks);   // already used: reads base
  const c = CUR.record(stored, next, 'tab-a', {});                         // never produced here
  expect(json(a)).toBe(json(REF.record(stored, next, 'tab-a')));
  expect(json(b)).toBe(json(a));
  expect(json(c)).toBe(json(a));
});

test('merge() and marks() are byte-identical to the reference', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const r = rng(seed * 7), len = 6 + Math.floor(r() * 30);
    const a = project(r, len), b = r() < 0.3 ? {} : project(r, len);
    expect(json(CUR.merge(a, b))).toBe(json(REF.merge(a, b)));
    expect(json(CUR.merge(b, a))).toBe(json(REF.merge(b, a)));
    expect(json(Object.keys(CUR.marks(a)))).toBe(json(Object.keys(REF.marks(a))));
  }
});

test('identical registers are stored as one shared array, which structured clone keeps', () => {
  const len = 3000, done = new Uint8Array(len).fill(1);
  const out = CUR.record(null, { done, pattern: new Array(len).fill({ id: '310' }) }, 'tab-a');
  const m = out.trackingSync.marks;
  expect(m['d:0']).toBe(m['d:1']);
  const back = clone(out.trackingSync);
  expect(back.marks['d:0']).toBe(back.marks['d:2999']);
  expect(v8.serialize(out.trackingSync).length).toBeLessThan(v8.serialize(JSON.parse(JSON.stringify(out.trackingSync))).length / 2);
});
