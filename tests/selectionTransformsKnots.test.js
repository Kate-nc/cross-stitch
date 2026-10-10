// tests/selectionTransformsKnots.test.js — French knots in copy, paste, flip
// and rotate (P4-4).
const T = require('../creator/selectionTransforms.js');

const E = () => ({ id: '__empty__', rgb: [255, 255, 255] });
const sW = 6, sH = 6;
const pat = Array.from({ length: sW * sH }, E);
const ps = new Map();
// Cells (1,1)–(2,2) selected.
const mask = new Uint8Array(sW * sH);
[[1, 1], [2, 1], [1, 2], [2, 2]].forEach(([x, y]) => { mask[y * sW + x] = 1; });
// Centre of (1,1); corner at the top left of (2,2); centre of (4,4), outside.
const knots = [{ x: 3, y: 3, id: '310' }, { x: 4, y: 4, id: '666' }, { x: 9, y: 9, id: '310' }];

test('a clip carries the knots of its cells, in clip-local half units', () => {
  const clip = T.extractClip(pat, ps, [], mask, sW, sH, knots);
  expect(clip.kn).toEqual([{ x: 1, y: 1, id: '310' }, { x: 2, y: 2, id: '666' }]);
  // Without knots, clips have none.
  expect(T.extractClip(pat, ps, [], mask, sW, sH).kn).toEqual([]);
});

test('flips map knots across the box; four quarter turns are the identity', () => {
  const clip = T.extractClip(pat, ps, [], mask, sW, sH, knots);
  expect(T.transformClip(clip, 'flipH').kn).toEqual([{ x: 3, y: 1, id: '310' }, { x: 2, y: 2, id: '666' }]);
  expect(T.transformClip(clip, 'flipV').kn).toEqual([{ x: 1, y: 3, id: '310' }, { x: 2, y: 2, id: '666' }]);
  expect(T.transformClip(clip, 'rotCW').kn).toEqual([{ x: 3, y: 1, id: '310' }, { x: 2, y: 2, id: '666' }]);
  let c = clip;
  for (let i = 0; i < 4; i++) c = T.transformClip(c, 'rotCW');
  expect(c.kn).toEqual(clip.kn);
});

test('lift takes the knots out; place puts them back at the new spot', () => {
  const lifted = T.liftSelection(pat, ps, [], mask, sW, sH, knots);
  expect(lifted.knots).toEqual([{ x: 9, y: 9, id: '310' }]);
  const clip = T.extractClip(pat, ps, [], mask, sW, sH, knots);
  const r = T.placeClip(lifted, clip, 3, 3, sW, sH);
  expect(r.knots.map(k => [k.x, k.y]).sort()).toEqual([[7, 7], [8, 8], [9, 9]].sort());
  expect(r.clipped).toBe(false);
  // A pasted knot replaces the one on its spot.
  const over = T.placeClip({ pat, ps, bsLines: [], knots: [{ x: 7, y: 7, id: 'old' }] }, clip, 3, 3, sW, sH);
  expect(over.knots.filter(k => k.x === 7 && k.y === 7)).toEqual([{ x: 7, y: 7, id: '310' }]);
  // Knots off the pattern are left out and flagged.
  expect(T.placeClip(lifted, clip, 5, 5, sW, sH).clipped).toBe(false); // (12, 12) is the far corner
  expect(T.placeClip(lifted, clip, 6, 6, sW, sH).clipped).toBe(true);
});

test('history sees knot changes, but not a reorder', () => {
  const before = { pat, ps, bsLines: [], knots };
  expect(T.diffForHistory(before, { pat, ps, bsLines: [], knots: knots.slice().reverse() }).empty).toBe(true);
  const d = T.diffForHistory(before, { pat, ps, bsLines: [], knots: knots.slice(1) });
  expect(d.empty).toBe(false);
  expect(d.knots).toEqual(knots);
  // States without knots have no knot entry.
  expect(T.diffForHistory({ pat, ps, bsLines: [] }, { pat, ps, bsLines: [] }).knots).toBeUndefined();
});
