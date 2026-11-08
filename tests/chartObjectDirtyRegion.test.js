/* The region a partial chart repaint covers (objectDirtyCells in tracker-app.js).
   ═══════════════════════════════════════════════════════════════════════════
   A tap repaints its own stitch, clipped, and the commit then skips the full
   redraw. For that repaint to match a full one, no clip edge may cut through an
   anti-aliased shape: a stroke or ellipse clipped there rasterises a little
   differently from the same shape drawn whole. So the repaint takes in, whole,
   every bead, petite, long stitch, knot and backstitch line that reaches its clip,
   and every neighbouring stitch holding a half or quarter stitch or a park marker,
   growing by whole stitches. tests/mobile-audit/desktop-mixed-mark-repaint.spec.js
   compares the result with a full redraw in the browser; this holds the geometry. */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
function fnSource(name) {
  const start = SRC.indexOf('function ' + name + '(');
  expect(start).toBeGreaterThanOrEqual(0);
  // Top-level functions end at the first line that is just "}" (or on their own line for one-liners).
  const nl = SRC.indexOf('\n', start);
  const oneLine = SRC.slice(start, nl);
  if (/\}\s*$/.test(oneLine) && (oneLine.match(/\{/g) || []).length === (oneLine.match(/\}/g) || []).length) return oneLine;
  const end = SRC.indexOf('\n}\n', start);
  return SRC.slice(start, end + 2);
}
// eslint-disable-next-line no-new-func
const BUCKET = /const OBJECT_BUCKET=\d+;/.exec(SRC)[0];
const lib = new Function(BUCKET + '\n' + ['beadReachPx', 'knotReachPx', 'specialtyReachPx', 'backstitchReachPx', 'buildObjectIndex', 'objectsNear', 'objectDirtyCells'].map(fnSource).join('\n') +
  '\nreturn { beadReachPx, knotReachPx, specialtyReachPx, backstitchReachPx, buildObjectIndex, objectsNear, objectDirtyCells };')();
const { beadReachPx, knotReachPx, specialtyReachPx, backstitchReachPx, buildObjectIndex, objectsNear, objectDirtyCells } = lib;

const PAD = 2;   // repaintChartCells' clip overhang, px
const box = (x0, y0, x1, y1, cSz, o) => objectDirtyCells(x0, y0, x1, y1, PAD, cSz, Object.assign({ layerVis: {}, sW: 400, sH: 500 }, o));
const petite = (x, y, uid = 'p') => ({ uid, type: 'petite', x, y });
const long = (x1, y1, x2, y2, uid = 'l') => ({ uid, type: 'long_stitch', x1, y1, x2, y2 });
const bead = (cx, cy) => ({ uid: 'b' + cx + ',' + cy, x: cx * 2, y: cy * 2 });   // stored in half-stitch units

describe('reach of each object, in pixels', () => {
  test('what drawStitch draws for it, never less than the shape itself', () => {
    expect(beadReachPx(20)).toBeCloseTo(4.8 + 2);          // radius 0.24 x 20 and half a 3 px ring, plus a pixel
    expect(beadReachPx(3)).toBe(5);                         // the 3 px minimum radius
    expect(knotReachPx(20)).toBeCloseTo(6 + 1 + 0.5);       // radius 0.3 x 20, half a 2 px outline
    expect(knotReachPx(2)).toBeCloseTo(2 + 0.75 + 0.5);     // 2 px minimum radius, 1.5 px minimum outline
    expect(specialtyReachPx(20, false)).toBeCloseTo(0.8 + 1);
    expect(specialtyReachPx(20, true)).toBeCloseTo(0.8 + 1 + 4);   // the dashed box 3 px outside, 1 px wide
    expect(backstitchReachPx(2)).toBeCloseTo(4.5);          // half of 2 px plus the 5 px selection halo, plus a pixel
  });
});

describe('the region a mark repaints', () => {
  test('just the stitch when nothing is near it', () => {
    expect(box(10, 10, 11, 11, 20, {})).toMatchObject({ x0: 10, y0: 10, x1: 11, y1: 11 });
    expect(box(10, 10, 11, 11, 20, { specialty: [petite(30, 30), long(50, 5, 60, 5)], beads: [bead(100.5, 100.5)], knots: [{ x: 2 * 70, y: 2 * 70 }] }))
      .toMatchObject({ x0: 10, y0: 10, x1: 11, y1: 11 });
  });

  test('a petite in the next stitch, reached by the clip margin, joins whole (by whole stitches)', () => {
    // Petite in stitch (11, 10), its left arms ending on the shared edge: the clip
    // reaches 2 px into that stitch.
    // Its round caps reach 0.8 px above that stitch, so the row above joins too.
    expect(box(10, 10, 11, 11, 20, { specialty: [petite(11, 10)] })).toMatchObject({ x0: 10, y0: 9, x1: 12, y1: 11, converged: true });
  });

  test('a long stitch along the edge joins with every stitch it crosses', () => {
    expect(box(11, 9, 12, 10, 20, { specialty: [long(10, 10, 13, 10)] })).toMatchObject({ x0: 9, y0: 9, x1: 14, y1: 11 });
  });

  test('one object reaching the next takes that in too', () => {
    // The long stitch reaches the stitch; its far end reaches a bead, which reaches a petite.
    const r = box(10, 9, 11, 10, 20, { specialty: [long(10, 10, 13, 10), petite(14, 11, 'p2')], beads: [bead(13.5, 10.5)] });
    expect(r).toMatchObject({ x0: 9, y0: 9, x1: 15, y1: 12 });
  });

  test('a selected object reaches further (its selection box)', () => {
    // A long stitch 0.2 stitches (4 px) below the region at 20 px: outside the
    // margin unselected, inside it once its 3 px box is drawn around it.
    const l = long(10, 11.2, 11, 11.2);
    expect(box(10, 10, 11, 11, 20, { specialty: [l] })).toMatchObject({ x0: 10, y0: 10, x1: 11, y1: 11 });
    expect(box(10, 10, 11, 11, 20, { specialty: [l], specialtySelected: 'l' })).toMatchObject({ x0: 9, y0: 10, x1: 12, y1: 12 });
  });

  test('hidden petites, long stitches and knots are not drawn, so do not count', () => {
    const o = { specialty: [petite(11, 10), long(10, 11, 11, 11)], knots: [{ x: 2 * 11, y: 2 * 10 }] };
    expect(box(10, 10, 11, 11, 20, o)).not.toMatchObject({ x0: 10, y0: 10, x1: 11, y1: 11 });
    expect(box(10, 10, 11, 11, 20, Object.assign({ layerVis: { petite: false, long_stitch: false, french_knot: false } }, o)))
      .toMatchObject({ x0: 10, y0: 10, x1: 11, y1: 11 });
  });

  test('zoomed far out a bead reaches stitches away (its 3 px minimum radius)', () => {
    // At 3 px a stitch, a bead centred two stitches away reaches within 2 px.
    // (5 px reach = 1.67 stitches each way: stitches 10 to 14, rows 8 to 12.)
    expect(box(10, 10, 11, 11, 3, { beads: [bead(12.5, 10.5)] })).toMatchObject({ x0: 10, y0: 8, x1: 15, y1: 13 });
    // At 20 px it does not.
    expect(box(10, 10, 11, 11, 20, { beads: [bead(12.5, 10.5)] })).toMatchObject({ x0: 10, y0: 10, x1: 11, y1: 11 });
  });

  test('a neighbouring stitch with a half or quarter stitch or a park marker joins whole, diagonals included', () => {
    const has = new Set([9 * 400 + 11, 11 * 400 + 9]);   // stitches (11, 9) and (9, 11)
    expect(box(10, 10, 11, 11, 20, { cellHas: (i) => has.has(i) })).toMatchObject({ x0: 9, y0: 9, x1: 12, y1: 12 });
    // Not two stitches away.
    expect(box(10, 10, 11, 11, 20, { cellHas: (i) => i === 10 * 400 + 12 })).toMatchObject({ x0: 10, y0: 10, x1: 11, y1: 11 });
  });

  test('a backstitch line reaching the clip joins whole', () => {
    expect(box(10, 10, 11, 11, 20, { bsLines: [{ x1: 11, y1: 9, x2: 13, y2: 11 }], bsReachPx: backstitchReachPx(2) }))
      .toMatchObject({ x0: 10, y0: 8, x1: 14, y1: 12 });
  });
});

/* The invariant the browser comparison rests on: whatever reaches into the clip
   (the region plus PAD px) lies wholly inside the region, whose edges are on
   stitch boundaries. Random charts, regions and stitch sizes. */
describe('nothing that reaches the clip is cut by it', () => {
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  test.each([1, 2, 3, 5, 12, 20, 40])('at %i px a stitch', (cSz) => {
    const r = rng(cSz * 7919);
    let unsettled = 0;
    for (let trial = 0; trial < 300; trial++) {
      const n = (k) => Math.floor(r() * k);
      const specialty = [], beads = [], knots = [], bsLines = [], cells = new Set();
      for (let i = 0; i < 12; i++) {
        const x = 20 + n(20), y = 20 + n(20);
        specialty.push(r() < 0.5 ? petite(x + (r() < 0.5 ? 0 : 0.5), y + (r() < 0.5 ? 0 : 0.5), 's' + i)
          : long(x, y, x + n(4) - 2, y + n(4) - 2, 's' + i));
        beads.push(bead(20 + n(40) / 2, 20 + n(40) / 2));
        knots.push({ x: 40 + n(40), y: 40 + n(40) });
        bsLines.push({ x1: x, y1: y, x2: x + n(3) - 1, y2: y + n(3) - 1 });
        cells.add((20 + n(20)) * 400 + 20 + n(20));
      }
      const selected = r() < 0.3 ? 's' + n(12) : null;
      const x0 = 25 + n(10), y0 = 25 + n(10), x1 = x0 + 1 + n(3), y1 = y0 + 1 + n(3);
      const o = { specialty, specialtySelected: selected, beads, knots, bsLines, bsReachPx: backstitchReachPx(2), cellHas: (i) => cells.has(i) };
      const b = box(x0, y0, x1, y1, cSz, o);
      // A chain too long to settle is repainted as the whole tile instead (repaintChartCells).
      if (!b.converged) { unsettled++; continue; }
      for (const v of [b.x0, b.y0, b.x1, b.y1]) expect(Number.isInteger(v)).toBe(true);
      expect(b.x0 <= x0 && b.y0 <= y0 && b.x1 >= x1 && b.y1 >= y1).toBe(true);
      const p = PAD / cSz;
      const reaches = (e) => !(e[2] < b.x0 - p || e[0] > b.x1 + p || e[3] < b.y0 - p || e[1] > b.y1 + p);
      const inside = (e) => e[0] >= b.x0 && e[1] >= b.y0 && e[2] <= b.x1 && e[3] <= b.y1;
      const extents = [];
      const sR = specialtyReachPx(cSz, false) / cSz, sS = specialtyReachPx(cSz, true) / cSz;
      for (const s of specialty) {
        const q = s.uid === selected ? sS : sR;
        extents.push(s.type === 'petite' ? [s.x - q, s.y - q, s.x + 0.5 + q, s.y + 0.5 + q]
          : [Math.min(s.x1, s.x2) - q, Math.min(s.y1, s.y2) - q, Math.max(s.x1, s.x2) + q, Math.max(s.y1, s.y2) + q]);
      }
      const bR = beadReachPx(cSz) / cSz, kR = knotReachPx(cSz) / cSz, lR = backstitchReachPx(2) / cSz;
      for (const e of beads) extents.push([e.x / 2 - bR, e.y / 2 - bR, e.x / 2 + bR, e.y / 2 + bR]);
      for (const k of knots) extents.push([k.x / 2 - kR, k.y / 2 - kR, k.x / 2 + kR, k.y / 2 + kR]);
      for (const l of bsLines) extents.push([Math.min(l.x1, l.x2) - lR, Math.min(l.y1, l.y2) - lR, Math.max(l.x1, l.x2) + lR, Math.max(l.y1, l.y2) + lR]);
      // A stitch holding an in-cell object, touching the region (a neighbour), must be in it.
      for (const i of cells) { const cx = i % 400, cy = (i - cx) / 400; if (cx >= b.x0 - 1 && cx < b.x1 + 1 && cy >= b.y0 - 1 && cy < b.y1 + 1) extents.push([cx, cy, cx + 1, cy + 1]); }
      for (const e of extents) if (reaches(e) && !inside(e)) throw new Error('cut by the clip: ' + JSON.stringify({ cSz, e, b, region: [x0, y0, x1, y1], selected }));
    }
    // These random charts are far denser than real ones; most marks still settle.
    expect(unsettled).toBeLessThan(150);
  });
  test('a chain that does not settle says so', () => {
    // Petites on every stitch of a long row: each reaches the next.
    const row = Array.from({ length: 200 }, (_, i) => petite(i, 10, 'r' + i));
    expect(box(100, 10, 101, 11, 20, { specialty: row }).converged).toBe(false);
  });
});

// The same growth, looking at every object on every pass (no index).
function bruteForce(x0, y0, x1, y1, cSz, o) {
  let bx0 = x0, by0 = y0, bx1 = x1, by1 = y1, converged = false;
  const p = PAD / cSz, vis = o.layerVis || {};
  const sR = specialtyReachPx(cSz, false) / cSz, sS = specialtyReachPx(cSz, true) / cSz, bR = beadReachPx(cSz) / cSz, kR = knotReachPx(cSz) / cSz, lR = (o.bsReachPx || 0) / cSz;
  for (let pass = 0; pass < 12; pass++) {
    let grew = false;
    const take = (a, b, c, d) => {
      if (c < bx0 - p || a > bx1 + p || d < by0 - p || b > by1 + p) return;
      const n = [Math.floor(a), Math.floor(b), Math.ceil(c), Math.ceil(d)];
      if (n[0] < bx0) { bx0 = n[0]; grew = true; } if (n[1] < by0) { by0 = n[1]; grew = true; }
      if (n[2] > bx1) { bx1 = n[2]; grew = true; } if (n[3] > by1) { by1 = n[3]; grew = true; }
    };
    for (const s of o.specialty) {
      if (vis[s.type] === false) continue;
      const q = o.specialtySelected === s.uid ? sS : sR;
      if (s.type === 'petite') take(s.x - q, s.y - q, s.x + 0.5 + q, s.y + 0.5 + q);
      else take(Math.min(s.x1, s.x2) - q, Math.min(s.y1, s.y2) - q, Math.max(s.x1, s.x2) + q, Math.max(s.y1, s.y2) + q);
    }
    for (const b of o.beads) take(b.x / 2 - bR, b.y / 2 - bR, b.x / 2 + bR, b.y / 2 + bR);
    if (vis.french_knot !== false) for (const k of o.knots) take(k.x / 2 - kR, k.y / 2 - kR, k.x / 2 + kR, k.y / 2 + kR);
    for (const l of o.bsLines) take(Math.min(l.x1, l.x2) - lR, Math.min(l.y1, l.y2) - lR, Math.max(l.x1, l.x2) + lR, Math.max(l.y1, l.y2) + lR);
    if (!grew) { converged = true; break; }
  }
  return { x0: bx0, y0: by0, x1: bx1, y1: by1, converged };
}

describe('the object index', () => {
  test('finds an object from every bucket it spans, once', () => {
    const idx = buildObjectIndex([long(2, 3, 30, 3, 'span')], [], [], []);
    for (const x of [0, 10, 20, 29]) expect(objectsNear(idx, x, 3, x + 1, 4).map((i) => i.obj.uid)).toEqual(['span']);
    expect(objectsNear(idx, 0, 0, 40, 10)).toHaveLength(1);
    expect(objectsNear(idx, 0, 20, 40, 30)).toHaveLength(0);
  });

  test('gives the same region as looking at every object on every pass, at every stitch size', () => {
    function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
    const r = rng(42), n = (k) => Math.floor(r() * k);
    for (let trial = 0; trial < 200; trial++) {
      const specialty = [], beads = [], knots = [], bsLines = [];
      for (let i = 0; i < 30; i++) {
        const x = n(60), y = n(60);
        specialty.push(r() < 0.5 ? petite(x, y, 's' + i) : long(x, y, x + n(9) - 4, y + n(9) - 4, 's' + i));
        beads.push(bead(n(120) / 2, n(120) / 2)); knots.push({ x: n(120), y: n(120) });
        bsLines.push({ x1: x, y1: y, x2: x + n(5) - 2, y2: y + n(5) - 2 });
      }
      const cSz = [1, 2, 3, 5, 12, 20, 40][n(7)], x0 = 10 + n(40), y0 = 10 + n(40);
      const o = { specialty, beads, knots, bsLines, bsReachPx: backstitchReachPx(2), specialtySelected: 's' + n(30), layerVis: r() < 0.3 ? { petite: false, french_knot: false } : {} };
      const indexed = box(x0, y0, x0 + 1, y0 + 1, cSz, Object.assign({}, o, { index: buildObjectIndex(specialty, beads, knots, bsLines), specialty: null, beads: null, knots: null, bsLines: null }));
      expect(indexed).toEqual(bruteForce(x0, y0, x0 + 1, y0 + 1, cSz, o));
    }
  });
});
