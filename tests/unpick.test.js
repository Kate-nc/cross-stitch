// tests/unpick.test.js — what "Unpick area" takes out (Phase 6 batch 4, TRACK-13).
const U = require('../unpick.js');
const B = require('../backstitch.js');
global.Backstitch = B;

const sW = 6, sH = 4;
const stitch = (id) => ({ id, type: 'solid', rgb: [0, 0, 0] });
const pat = Array.from({ length: sW * sH }, (_, i) => (i === 7 ? { id: '__skip__' } : stitch(i % 2 ? '310' : '666')));
const rect = (x0, y0, x1, y1) => { const s = new Set(); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) s.add(y * sW + x); return s; };

function world() {
  const done = new Uint8Array(sW * sH); [0, 1, 2, 6, 8, 13, 23].forEach(i => { done[i] = 1; });
  const lines = [
    { x1: 0, y1: 0, x2: 1, y2: 0, colorId: '310' },   // inside the rectangle below
    { x1: 2, y1: 1, x2: 3, y2: 1, colorId: '666' },   // inside
    { x1: 2, y1: 0, x2: 4, y2: 0, colorId: '310' }    // runs out of it
  ];
  return {
    sW, sH, pat, done,
    halfStitches: new Map([[1, { fwd: { id: '310' }, bck: { id: '666' } }], [9, { fwd: { id: '310' } }]]),
    halfDone: new Map([[1, { fwd: 1, bck: 1 }], [9, { fwd: 1 }]]),
    partialStitches: new Map([[2, { TL: { id: '310' }, BR: { id: '666' } }], [14, { TL: { id: '310' } }]]),
    partialDone: new Map([[2, new Set(['TL', 'BR'])], [14, new Set(['TL'])]]),
    knots: [{ x: 3, y: 3, id: '310' }, { x: 11, y: 7, id: '666' }],             // cells (1,1) and (5,3)
    knotsDone: ['3,3', '11,7'],
    bsLines: lines, bsDone: lines.map(B.key)
  };
}

test('unpicking a rectangle takes out every kind, and only inside it', () => {
  const w = world();
  const p = U.plan(Object.assign({}, w, { set: rect(0, 0, 2, 1) }));        // cells x 0..2, y 0..1: indexes 0,1,2,6,7,8
  expect(p.full.map(c => c.idx).sort((a, b) => a - b)).toEqual([0, 1, 2, 6, 8]);   // 7 is background
  expect(p.counts).toEqual({ full: 5, half: 2, quarter: 2, knot: 1, backstitch: 2 });
  expect(p.half.map(h => h.idx)).toEqual([1]);          // cell 9 is outside
  expect(p.quarter.map(q => q.idx)).toEqual([2]);       // cell 14 is outside
  expect(p.knots).toEqual(['3,3']);                      // the knot in cell (1,1)
  expect(p.bs).toHaveLength(2);                          // the line that runs out of the rectangle stays
  expect(p.units).toBe(5 + 2 * 0.5 + 2 * 0.25 + 1);
  expect(p.stitches).toBe(5 + 2 + 2 + 1);
  expect(p.empty).toBe(false);
});

test('a rectangle with nothing done in it is empty', () => {
  const p = U.plan(Object.assign({}, world(), { set: rect(3, 2, 4, 2) }));
  expect(p.empty).toBe(true);
  expect(p.units).toBe(0);
});

test('a colour lock takes out only that thread, half sides and quarters one by one', () => {
  const w = world();
  const p = U.plan(Object.assign({}, w, { set: rect(0, 0, 5, 3), lockId: '310' }));
  p.full.forEach(c => expect(pat[c.idx].id).toBe('310'));
  expect(p.half.find(h => h.idx === 1).after).toEqual({ bck: 1 });    // the 666 side stays
  expect(p.quarter.find(q => q.idx === 2).after).toEqual(['BR']);               // so does the 666 quarter
  expect(p.knots).toEqual(['3,3']);
  p.bs.forEach(k => expect(k.endsWith(',310')).toBe(true));
  expect(U.plan(Object.assign({}, w, { set: rect(0, 0, 5, 3), lockId: '999' })).empty).toBe(true);
});

test('applying a plan and taking it back gives the same marks', () => {
  const w = world();
  const p = U.plan(Object.assign({}, w, { set: rect(0, 0, 5, 3) }));
  const hd = U.nextHalfDone(w.halfDone, p, false), qd = U.nextPartialDone(w.partialDone, p, false), kd = U.nextKnotsDone(w.knotsDone, p, false);
  expect(hd.size).toBe(0); expect(qd.size).toBe(0); expect(kd).toEqual([]);
  const hb = U.nextHalfDone(hd, p, true), qb = U.nextPartialDone(qd, p, true), kb = U.nextKnotsDone(kd, p, true);
  expect(Array.from(hb.entries())).toEqual(Array.from(w.halfDone.entries()));
  expect(Array.from(qb.entries()).map(([k, s]) => [k, Array.from(s).sort()])).toEqual(Array.from(w.partialDone.entries()).map(([k, s]) => [k, Array.from(s).sort()]));
  expect(kb.sort()).toEqual(w.knotsDone.slice().sort());
});

test('containers the plan does not touch come back as they were', () => {
  const w = world();
  const p = U.plan(Object.assign({}, w, { set: rect(3, 2, 4, 2) }));
  expect(U.nextHalfDone(w.halfDone, p, false)).toBe(w.halfDone);
  expect(U.nextPartialDone(w.partialDone, p, false)).toBe(w.partialDone);
  expect(U.nextKnotsDone(w.knotsDone, p, false)).toBe(w.knotsDone);
});

test('80 stitches in a rectangle read as 80', () => {
  const W = 20, H = 10, big = Array.from({ length: W * H }, () => stitch('310'));
  const done = new Uint8Array(W * H).fill(1);
  const set = new Set(); for (let y = 0; y < 4; y++) for (let x = 0; x < 20; x++) set.add(y * W + x);
  const p = U.plan({ sW: W, sH: H, pat: big, done, set });
  expect(p.stitches).toBe(80);
  expect(p.units).toBe(80);
});
