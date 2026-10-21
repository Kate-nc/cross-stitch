// Characterises how the Creator's two stitch draw pipelines paint fractional
// (quarter, half, three-quarter) stitches: drawPatternOnCanvas (full redraw,
// no style caching) and drawPatternBaseOnCanvas (base cache, with fill/stroke/
// line-width caching that must be invalidated after a fractional cell).
//
// The renderer runs against a real node-canvas context wrapped in a recording
// proxy. The expected canvas operations for each cell come from calling the
// real helpers (analysePartialStitches and the draw* functions) directly, so
// the tests pin draw order, arguments, alpha and cache invalidation without
// reading source text.

const fs = require('fs');
const vm = require('vm');
const { createCanvas } = require('canvas');

function renderer() {
  const c = vm.createContext({ console, Map, Set, Uint8Array, CK: 4, ProgressUnits: require('../progress-units'),
    addEventListener() {}, document: { createElement: () => createCanvas(1, 1) } });
  c.window = c;
  for (const file of ['colour-utils.js', 'helpers.js', 'creator/symbolFontSpec.js', 'creator/canvasRenderer.js'])
    vm.runInContext(fs.readFileSync(file, 'utf8'), c, { filename: file });
  return c;
}

// Canvas arguments (the checker tile) are described, not stored.
const plain = a => (a && typeof a === 'object' ? '[' + a.constructor.name + ']' : a);

// Logs every method call and property assignment, then forwards it.
function recording(ctx) {
  const log = [];
  const proxy = new Proxy(ctx, {
    get(t, p) {
      const v = t[p];
      if (typeof v !== 'function') return v;
      return (...a) => { log.push([String(p), ...a.map(plain)]); return v.apply(t, a); };
    },
    set(t, p, v) { log.push(['=' + String(p), v]); t[p] = v; return true; }
  });
  return { ctx: proxy, log, raw: ctx };
}

const red = { id: 'red', rgb: [220, 20, 20] };
const blue = { id: 'blue', rgb: [20, 40, 220] };
const green = { id: 'green', rgb: [20, 160, 40] };
const ghost = { id: 'ghost', rgb: [90, 90, 90] }; // deliberately absent from the colour map
const cmap = { red: { ...red, symbol: 'R' }, blue: { ...blue, symbol: 'B' }, green: { ...green, symbol: 'G' } };
const empty = { id: '__empty__' };

// Every orientation the analyser can emit, over empty and stitched cells.
const SCENARIOS = [
  { name: 'quarter TL', base: empty, ps: { TL: red } },
  { name: 'quarter TR', base: empty, ps: { TR: blue } },
  { name: 'quarter BL', base: empty, ps: { BL: red } },
  { name: 'quarter BR', base: empty, ps: { BR: blue } },
  { name: 'half forward', base: empty, ps: { TR: red, BL: red } },
  { name: 'half backward', base: empty, ps: { TL: blue, BR: blue } },
  { name: 'three-quarter empty TL', base: empty, ps: { TR: red, BL: red, BR: red } },
  { name: 'three-quarter empty TR', base: empty, ps: { TL: red, BL: red, BR: red } },
  { name: 'three-quarter empty BL', base: empty, ps: { TL: blue, TR: blue, BR: blue } },
  { name: 'three-quarter empty BR', base: empty, ps: { TL: blue, TR: blue, BL: blue } },
  { name: 'two half colours overlapping a stitch', base: { ...red }, ps: { TL: blue, BR: blue } },
  { name: 'override over a stitch (three-quarter + quarter)', base: { ...blue }, ps: { TL: red } },
  { name: 'colour missing from the colour map', base: empty, ps: { TL: ghost, TR: ghost } },
  { name: 'mixed quarters', base: empty, ps: { TL: red, TR: blue } }
];

const W = SCENARIOS.length + 2; // a green stitch at each end of the row
function buildState(view, extra) {
  const pat = [{ ...green }];
  const partialStitches = new Map();
  SCENARIOS.forEach((s, i) => {
    pat.push({ ...s.base });
    partialStitches.set(i + 1, s.ps);
  });
  pat.push({ ...green });
  return Object.assign({ sW: W, sH: 1, view, showCtr: false, bsLines: [], fabricColour: '#ffffff', pat, cmap, partialStitches }, extra);
}

const PATHS = {
  full: (r, ctx, offX, dW, cSz, gut, state) => r.drawPatternOnCanvas(ctx, offX, 0, dW, 1, cSz, gut, state),
  base: (r, ctx, offX, dW, cSz, gut, state) => r.drawPatternBaseOnCanvas(ctx, offX, 0, dW, 1, cSz, gut, state)
};

// The operations the helpers themselves make for one cell.
function expectedBlock(r, ps, base, px, py, cSz, dimAlpha, view) {
  const rec = recording(createCanvas(1, 1).getContext('2d'));
  const ctx = rec.ctx;
  r.analysePartialStitches(ps, base).forEach(inst => {
    const si = cmap[inst.colour.id];
    const sym = si ? si.symbol : null;
    if (inst.type === 'three-quarter') r.drawThreeQuarterStitch(ctx, px, py, cSz, inst.colour, inst.emptyCorner, dimAlpha, view, sym);
    else if (inst.type === 'quarter') r.drawQuarterStitch(ctx, px, py, cSz, inst.colour, inst.corner, dimAlpha, view, sym);
    else {
      r.drawHalfTriangle(ctx, px, py, cSz, inst.direction, inst.colour.rgb, dimAlpha);
      if (cSz >= 5) r.drawHalfLine(ctx, px, py, cSz, inst.direction, inst.colour.rgb, dimAlpha, Math.max(1, cSz * 0.12));
      if (cSz >= 10 && sym && (view === 'symbol' || view === 'both'))
        r.drawHalfSymbol(ctx, px, py, cSz, inst.direction, sym,
          view === 'both' ? (r.luminance(inst.colour.rgb) < 128 ? '#fff' : '#000') : '#333');
    }
  });
  return rec.log;
}

function indexOfBlock(log, block, from) {
  outer: for (let i = from; i + block.length <= log.length; i++) {
    for (let j = 0; j < block.length; j++)
      if (JSON.stringify(log[i + j]) !== JSON.stringify(block[j])) continue outer;
    return i;
  }
  return -1;
}

const ZOOMS = [3, 4, 5, 9, 10, 12]; // each side of the grid (4), line (5) and symbol (10) thresholds
const VIEWS = ['color', 'symbol', 'both'];
const DIMS = { none: {}, dimmed: { hiId: 'green', highlightMode: 'isolate', dimFraction: 1 } };
const DIM_ALPHA = 1.0 - (1.0 - 0.2) * 1;

describe.each(Object.keys(PATHS))('%s render path', pathName => {
  describe.each(VIEWS)('%s view', view => {
    describe.each(Object.keys(DIMS))('highlight: %s', dimName => {
      test.each(ZOOMS)('fractional cells are drawn once, in row order, straight after their cell (cell size %i)', cSz => {
        const r = renderer(), gut = 16;
        const state = buildState(view, DIMS[dimName]);
        const rec = recording(createCanvas(gut + W * cSz + 4, gut + cSz + 4).getContext('2d'));
        PATHS[pathName](r, rec.ctx, 0, W, cSz, gut, state);

        let from = 0;
        SCENARIOS.forEach((s, i) => {
          const px = gut + (i + 1) * cSz, py = gut;
          // Isolate dims stitched cells that are not the highlighted colour; empty cells stay opaque.
          const dimAlpha = dimName === 'dimmed' && s.base.id !== '__empty__' ? DIM_ALPHA : 1.0;
          const block = expectedBlock(r, s.ps, s.base, px, py, cSz, dimAlpha, view);
          const at = indexOfBlock(rec.log, block, from);
          expect([s.name, at >= 0]).toEqual([s.name, true]);
          // Draw order: after the cell's own grid stroke, before the next cell.
          if (cSz >= 4) expect(rec.log[at - 1]).toEqual(['strokeRect', px, py, cSz, cSz]);
          from = at + block.length;
        });
        // Nothing leaks into later drawing: balanced state stack, opaque alpha.
        const count = n => rec.log.filter(op => op[0] === n).length;
        expect(count('save')).toBe(count('restore'));
        expect(rec.raw.globalAlpha).toBe(1);
      });
    });
  });
});

describe.each(Object.keys(PATHS))('%s render path, cropped viewport', pathName => {
  test('partial stitches are looked up and placed by absolute index and viewport offset', () => {
    const r = renderer(), gut = 8, cSz = 12, offX = 4, dW = 3;
    const state = buildState('both');
    const rec = recording(createCanvas(gut + dW * cSz + 4, gut + cSz + 4).getContext('2d'));
    PATHS[pathName](r, rec.ctx, offX, dW, cSz, gut, state);
    let from = 0;
    for (let x = 0; x < dW; x++) {
      const s = SCENARIOS[offX + x - 1];
      const block = expectedBlock(r, s.ps, s.base, gut + x * cSz, gut, cSz, 1.0, 'both');
      const at = indexOfBlock(rec.log, block, from);
      expect([s.name, at >= 0]).toEqual([s.name, true]);
      from = at + block.length;
    }
    // Cells outside the viewport are not drawn at all.
    const outside = SCENARIOS[0];
    expect(indexOfBlock(rec.log, expectedBlock(r, outside.ps, outside.base, gut, gut, cSz, 1.0, 'both'), 0)).toBe(-1);
  });
});

describe('style cache invalidation after a fractional cell', () => {
  // red, red (+ fractional), red: without the fractional cell the base path
  // sets the fill, stroke and line width once; the helpers change all three,
  // so the next cell must set them again. The full path never caches.
  function styleWrites(pathName, withPartial) {
    const r = renderer(), gut = 4, cSz = 12;
    const pat = [{ ...red }, { ...red }, { ...red }];
    const state = { sW: 3, sH: 1, view: 'color', showCtr: false, bsLines: [], fabricColour: '#ffffff', pat, cmap,
      partialStitches: new Map(withPartial ? [[1, { TL: blue }]] : []) };
    const rec = recording(createCanvas(gut + 3 * cSz + 4, gut + cSz + 4).getContext('2d'));
    PATHS[pathName](r, rec.ctx, 0, 3, cSz, gut, state);
    const n = name => rec.log.filter(op => op[0] === name).length;
    return { fill: n('=fillStyle'), stroke: n('=strokeStyle'), width: n('=lineWidth'),
      block: expectedBlock(r, { TL: blue }, red, gut + cSz, gut, cSz, 1.0, 'color') };
  }
  const named = (log, name) => log.filter(op => op[0] === name).length;

  test('base path re-sets fill, stroke and line width once after the fractional cell', () => {
    const a = styleWrites('base', false), b = styleWrites('base', true);
    expect(b.fill - a.fill - named(a.block, '=fillStyle')).toBe(1);
    expect(b.stroke - a.stroke - named(a.block, '=strokeStyle')).toBe(1);
    expect(b.width - a.width - named(a.block, '=lineWidth')).toBe(1);
  });

  test('full path adds only what the helpers write (no caching to invalidate)', () => {
    const a = styleWrites('full', false), b = styleWrites('full', true);
    expect(b.fill - a.fill).toBe(named(a.block, '=fillStyle'));
    expect(b.stroke - a.stroke).toBe(named(a.block, '=strokeStyle'));
    expect(b.width - a.width).toBe(named(a.block, '=lineWidth'));
  });
});

describe('pixels', () => {
  test.each(Object.keys(PATHS))('%s path paints quadrants only where the stitches are', pathName => {
    const r = renderer(), gut = 0, cSz = 20;
    const state = buildState('color');
    const canvas = createCanvas(W * cSz, cSz), ctx = canvas.getContext('2d');
    PATHS[pathName](r, ctx, 0, W, cSz, gut, state);
    const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    // Quarter TL (cell 1): red in the TL quadrant, untouched elsewhere.
    expect(px(1 * cSz + 2, 2)).toEqual([220, 20, 20, 255]);
    expect(px(1 * cSz + 17, 17)[0]).toBeGreaterThan(240);
    // Quarter BR (cell 4) is blue in the BR quadrant only.
    expect(px(4 * cSz + 17, 17)).toEqual([20, 40, 220, 255]);
    expect(px(4 * cSz + 2, 2)[2]).toBeGreaterThan(240);
    // Plain green stitches either side are untouched.
    expect(px(2, 10)).toEqual([20, 160, 40, 255]);
    expect(px((W - 1) * cSz + 10, 10)).toEqual([20, 160, 40, 255]);
  });
});
