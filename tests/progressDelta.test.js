/* Progress records keep only the sync registers that differ from their base
   (TrackingSync.recordDelta / withDelta / deltaFrom).
   ═══════════════════════════════════════════════════════════════════════════
   ProjectStorage's progress record used to carry the whole chart's
   trackingSync, one register per finished stitch, rebuilt and rewritten on
   every progress write: the freeze shortly after marking on a large chart
   (reports/track-pan-performance-audit.md, "Panning and marking"). It now
   keeps a delta over the full save it is based on. The trackingSync a reader
   rebuilds from the base and the delta must be what the full record held, as
   records() reads it back, over chains of writes, malformed and legacy
   metadata, and a full record written by an older build. */
const v8 = require('v8');
const TS = require('../tracking-sync.js');
const { rng, pick, ACTORS, project, edit } = require('./_helpers/trackingSyncGen');

const clone = v => v8.deserialize(v8.serialize(v));
const MARKS = ['done', 'halfDone', 'partialDone', 'knotsDone', 'bsDone', 'beadsDone', 'specialtyDone'];
const marksOf = p => { const o = {}; MARKS.forEach(f => { o[f] = p[f]; }); return o; };
// What a reader makes of a project: its registers as records() reads them, and
// the marks they stand for.
const read = p => JSON.stringify(TS.merge(p, {}));

test('a chain of delta writes rebuilds what the full progress record held', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const r = rng(seed * 53), len = 20 + Math.floor(r() * 60);
    const base = clone(project(r, len));          // the full save the records are based on
    let full = null;                              // old: the previous record, trackingSync in full
    let delta = null;                             // new: the previous record, registers over base
    let marks = marksOf(base);
    for (let step = 0; step < 20; step++) {
      const author = pick(r, ACTORS);
      const previous = Object.assign({}, base, marks);
      const next = Object.assign(edit(rng(seed * 991 + step), previous), {});
      if (r() < 0.1) next.knotsDone = [''];      // a name records() does not accept

      const oldOut = TS.record(full ? Object.assign({}, previous, { trackingSync: full }) : base, next, author);
      full = clone(oldOut.trackingSync);
      delta = clone(TS.recordDelta(previous, delta, next, author));
      // A field the write leaves out keeps the previous marks, as record()'s
      // output and applyProgressRecord both do.
      const carried = Object.assign({}, next);
      MARKS.forEach(f => { if (next[f] == null && previous[f] != null) carried[f] = previous[f]; });
      marks = marksOf(carried);

      const rebuilt = TS.withDelta(Object.assign({}, base, marks), delta);
      expect(read(Object.assign({}, next, { trackingSync: rebuilt })))
        .toBe(read(Object.assign({}, next, { trackingSync: full })));
    }
  }
});

test('a full record from an older build becomes a delta that rebuilds the same thing', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const r = rng(seed * 17), len = 20 + Math.floor(r() * 60);
    const base = clone(project(r, len));
    const next = edit(r, base);
    const fullTs = clone(TS.record(base, next, pick(r, ACTORS)).trackingSync);
    const over = Object.assign({}, base, marksOf(next));
    const d = clone(TS.deltaFrom(over, fullTs));
    expect(read(Object.assign({}, next, { trackingSync: TS.withDelta(over, d) })))
      .toBe(read(Object.assign({}, next, { trackingSync: fullTs })));
  }
});

test('the delta holds only the changed marks, however far the chart is done', () => {
  const len = 200000, done = new Uint8Array(len);
  for (let i = 0; i < len; i += 3) done[i] = 1;                 // a third done
  const pattern = { length: len };
  const base = { pattern, done, trackingSync: TS.record(null, { pattern, done }, 'tab-a').trackingSync };
  expect(Object.keys(base.trackingSync.marks).length).toBeGreaterThan(60000);
  let delta = null, prevDone = done;
  for (let w = 0; w < 10; w++) {                                // ten writes of five marks
    const d = new Uint8Array(prevDone);
    for (let k = 0; k < 5; k++) d[1 + 3 * (w * 5 + k)] = 1;
    delta = clone(TS.recordDelta(Object.assign({}, base, { done: prevDone }), delta, Object.assign({}, base, { done: d }), 'tab-b'));
    prevDone = d;
  }
  expect(Object.keys(delta.marks).length).toBe(50);
  // An unpick of a stitch the base has done is recorded as one removal.
  const d = new Uint8Array(prevDone); d[0] = 0;
  delta = TS.recordDelta(Object.assign({}, base, { done: prevDone }), delta, Object.assign({}, base, { done: d }), 'tab-b');
  expect(Object.keys(delta.marks).length).toBe(51);
  expect(delta.marks['d:0'][0].value).toBe(0);
  expect(TS.merge(Object.assign({}, base, { done: d, trackingSync: TS.withDelta(Object.assign({}, base, { done: d }), delta) }), {}).done[0]).toBe(0);
});

test('a malformed or missing delta adds nothing', () => {
  const p = { pattern: [{}, {}, {}], done: [1, 0, 1] };
  const plain = JSON.stringify(TS.withDelta(p, null));
  for (const bad of [undefined, {}, { version: 2, marks: { 'd:1': [{ value: 1, clock: { a: 1 } }] } }, { version: 1, marks: 'x' },
    { version: 1, marks: { 'x:1': [{ value: 1, clock: { a: 1 } }], 'd:1': 'nope', 'd:2': [{ value: 7, clock: {} }] } }]) {
    expect(JSON.stringify(TS.withDelta(p, bad))).toBe(plain);
  }
});
