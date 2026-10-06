/* tests/import/pdfRasterChart.test.js — reading a chart from a picture of it.
 *
 * Charts are drawn procedurally into RGBA buffers, so every expectation has an
 * exact truth. The real-file numbers (a JPEG scan of PAT2171_2's chart at
 * 2.8x reads 73 x 72 — the vector import's size — and of gen1's first page
 * 86 x 114 with 99.8% of stitches found) come from the probe harness.
 */

const path = require('path');
const RC = require(path.resolve(__dirname, '..', '..', 'pdf-raster-chart.js'));

function blank(w, h) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  return { width: w, height: h, data };
}
function fill(img, x0, y0, x1, y1, rgb) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.height, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(img.width, Math.ceil(x1)); x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2];
    }
  }
}

/* Glyphs, drawn into a cell's box. Distinct shapes, as a symbol chart uses. */
const GLYPHS = [
  (img, x, y, s, ink) => { fill(img, x + s * 0.3, y + s * 0.3, x + s * 0.7, y + s * 0.7, ink); },            // square
  (img, x, y, s, ink) => { fill(img, x + s * 0.25, y + s * 0.45, x + s * 0.75, y + s * 0.55, ink); },        // bar
  (img, x, y, s, ink) => { fill(img, x + s * 0.45, y + s * 0.2, x + s * 0.55, y + s * 0.8, ink); },          // stem
  (img, x, y, s, ink) => {                                                                                   // corners
    fill(img, x + s * 0.2, y + s * 0.2, x + s * 0.4, y + s * 0.4, ink);
    fill(img, x + s * 0.6, y + s * 0.6, x + s * 0.8, y + s * 0.8, ink);
  },
];

/* A chart: `cells(c, r)` returns null for empty, or { rgb?, glyph? }. */
function chart(opts) {
  const o = Object.assign({ cols: 30, rows: 20, pitch: 14, x: 60, y: 80, margin: 60, lineRgb: [70, 70, 70] }, opts);
  const w = Math.ceil(o.x + o.cols * o.pitch + o.margin), h = Math.ceil(o.y + o.rows * o.pitch + o.margin);
  const img = blank(w, h);
  if (o.ground) fill(img, o.x, o.y, o.x + o.cols * o.pitch, o.y + o.rows * o.pitch, o.ground);
  for (let r = 0; r < o.rows; r++) {
    for (let c = 0; c < o.cols; c++) {
      const cell = o.cells(c, r);
      if (!cell) continue;
      const x = o.x + c * o.pitch, y = o.y + r * o.pitch;
      if (cell.rgb) fill(img, x, y, x + o.pitch, y + o.pitch, cell.rgb);
      if (cell.glyph !== undefined) GLYPHS[cell.glyph](img, x, y, o.pitch, cell.ink || [0, 0, 0]);
    }
  }
  for (let c = 0; c <= o.cols; c++) fill(img, o.x + c * o.pitch, o.y, o.x + c * o.pitch + 1, o.y + o.rows * o.pitch + 1, o.lineRgb);
  for (let r = 0; r <= o.rows; r++) fill(img, o.x, o.y + r * o.pitch, o.x + o.cols * o.pitch + 1, o.y + r * o.pitch + 1, o.lineRgb);
  if (o.titleRule) fill(img, 10, 30, w - 10, 32, [20, 20, 120]);
  return img;
}

describe('findGrid', () => {
  it('finds the grid of a ruled chart', () => {
    const g = RC.findGrid(chart({ cells: () => null }));
    expect(g).toEqual(expect.objectContaining({ columns: 30, rows: 20 }));
    expect(g.pitchX).toBeCloseTo(14, 0);
  });

  it('finds a pitch that is not a whole number of pixels', () => {
    // 4.83pt at 2.8x is 13.5px; a whole-pixel search preferred twice that.
    const g = RC.findGrid(chart({ pitch: 13.5, cols: 40, rows: 30, cells: () => null }));
    expect(g.columns).toBe(40);
    expect(g.rows).toBe(30);
    expect(g.pitchX).toBeCloseTo(13.5, 1);
  });

  it('is not led astray by a long rule above the chart', () => {
    // The strongest horizontal line on PAT2171_2 is the title rule, not the grid.
    const g = RC.findGrid(chart({ titleRule: true, cells: () => null }));
    expect(g.rows).toBe(20);
  });

  it('returns null for a page with no grid', () => {
    expect(RC.findGrid(blank(400, 300))).toBeNull();
  });
});

describe('read — colour charts', () => {
  const palette = [[200, 40, 40], [40, 120, 200], [60, 170, 80]];
  const cells = (c, r) => (c + r) % 4 === 0 ? null : { rgb: palette[(c * 7 + r) % 3], glyph: (c + r) % 2, ink: [255, 255, 255] };

  it('finds each coloured stitch and leaves the ground empty', () => {
    const out = RC.read(chart({ cells, ground: [226, 236, 236] }));
    const truth = [];
    for (let r = 0; r < 20; r++) for (let c = 0; c < 30; c++) if (cells(c, r)) truth.push(c + ',' + r);
    const got = out.cells.filter(c => c.kind !== 'empty').map(c => c.col + ',' + c.row);
    expect(got.sort()).toEqual(truth.sort());
    expect(out.cells.filter(c => c.kind === 'colour')).toHaveLength(truth.length);
  });

  it('groups stitches by thread colour, unswayed by the symbols drawn on them', () => {
    const out = RC.read(chart({ cells, ground: [226, 236, 236] }));
    expect(out.colours).toHaveLength(3);
    for (const g of out.colours) {
      expect(palette.some(p => Math.max(...p.map((v, i) => Math.abs(v - g.rgb[i]))) <= 3)).toBe(true);
    }
  });

  it('reports the ground colour', () => {
    expect(RC.read(chart({ cells, ground: [226, 236, 236] })).ground).toEqual([226, 236, 236]);
  });
});

describe('read — symbol charts', () => {
  const cells = (c, r) => (c % 5 === 0 && r % 3 === 0) ? null : { glyph: (c * 3 + r * 5) % 4 };

  it('reads a black-and-white chart as symbols, not grey threads', () => {
    const out = RC.read(chart({ cells }));
    expect(out.colours).toHaveLength(0);
    expect(out.cells.filter(c => c.kind === 'symbol').length).toBeGreaterThan(0);
  });

  it('finds every stitch', () => {
    const out = RC.read(chart({ cells }));
    let truth = 0;
    for (let r = 0; r < 20; r++) for (let c = 0; c < 30; c++) if (cells(c, r)) truth++;
    expect(out.cells.filter(c => c.kind === 'symbol')).toHaveLength(truth);
  });

  it('groups cells by the shape of their symbol', () => {
    const out = RC.read(chart({ cells }));
    expect(out.symbols).toHaveLength(4);
    // Every cell in a group carries the same glyph.
    const byGroup = new Map();
    for (const c of out.cells) {
      if (c.kind !== 'symbol') continue;
      const g = cells(c.col, c.row).glyph;
      if (!byGroup.has(c.group)) byGroup.set(c.group, new Set());
      byGroup.get(c.group).add(g);
    }
    for (const set of byGroup.values()) expect(set.size).toBe(1);
  });
});

describe('read — telling threads apart on a scan', () => {
  it('joins one thread the scan printed in two shades, when its symbol says so', () => {
    // Thread A appears as two shades 18 apart, as a scan renders a small
    // patch of saturated colour; thread B is as close to A but carries a
    // different symbol, so it stays a thread of its own.
    const A1 = [20, 120, 190], A2 = [30, 130, 200], B = [45, 140, 175];
    const cells = (c, r) => {
      if ((c + r) % 5 === 0) return null;
      if (c < 10) return { rgb: A1, glyph: 0, ink: [255, 255, 255] };
      if (c < 20) return { rgb: A2, glyph: 0, ink: [255, 255, 255] };
      return { rgb: B, glyph: 2, ink: [255, 255, 255] };
    };
    const out = RC.read(chart({ cells, ground: [226, 236, 236] }));
    expect(out.colours).toHaveLength(2);
    const groupOf = (c, r) => out.cells.find(x => x.col === c && x.row === r).group;
    expect(groupOf(1, 0)).toBe(groupOf(11, 0));
    expect(groupOf(1, 0)).not.toBe(groupOf(21, 0));
  });

  it('keeps pale stitches with a symbol as a thread, not as placeholder symbols', () => {
    const cells = (c, r) => (c < 15 ? { rgb: [220, 120, 120], glyph: 1, ink: [255, 255, 255] } : { glyph: 0 });
    const out = RC.read(chart({ cells, ground: [255, 255, 255], lineRgb: [30, 30, 30] }));
    expect(out.symbols).toHaveLength(0);
    expect(out.colours).toHaveLength(2);
  });

  it('separates boxed symbols that differ only in the shape left white inside', () => {
    // Two glyphs: a black box with a white dot, and a black box with a white
    // bar — alike in all but the small white shape. Drawn anti-aliased on a
    // pitch that is not a whole number of pixels, as a scanner sees them, so
    // each cell's copy differs from the next by a fraction of a pixel.
    const paint = (img, x0, y0, x1, y1, v) => {
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const cover = Math.max(0, Math.min(x + 1, x1) - Math.max(x, x0)) * Math.max(0, Math.min(y + 1, y1) - Math.max(y, y0));
          const i = (y * img.width + x) * 4;
          for (let k = 0; k < 3; k++) img.data[i + k] = Math.round(img.data[i + k] * (1 - cover) + v * cover);
        }
      }
    };
    const boxDot = (img, x, y, s) => { paint(img, x + s * 0.2, y + s * 0.2, x + s * 0.8, y + s * 0.8, 0); paint(img, x + s * 0.36, y + s * 0.36, x + s * 0.64, y + s * 0.64, 255); };
    const boxBar = (img, x, y, s) => { paint(img, x + s * 0.2, y + s * 0.2, x + s * 0.8, y + s * 0.8, 0); paint(img, x + s * 0.28, y + s * 0.44, x + s * 0.72, y + s * 0.56, 255); };
    const pitch = 17.3, cols = 30, rows = 20, x0 = 60, y0 = 80;
    const img = blank(Math.ceil(x0 + cols * pitch + 60), Math.ceil(y0 + rows * pitch + 60));
    const which = (c, r) => (c * 7 + r * 3) % 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) (which(c, r) ? boxBar : boxDot)(img, x0 + c * pitch, y0 + r * pitch, pitch);
    for (let c = 0; c <= cols; c++) fill(img, x0 + c * pitch, y0, x0 + c * pitch + 1, y0 + rows * pitch + 1, [70, 70, 70]);
    for (let r = 0; r <= rows; r++) fill(img, x0, y0 + r * pitch, x0 + cols * pitch + 1, y0 + r * pitch + 1, [70, 70, 70]);
    const out = RC.read(img);
    // Mostly two groups. A cell caught at an awkward fraction of a pixel may
    // start a small group of its own: more to assign, but never a wrong stitch.
    const sizes = out.symbols.map(g => g.count).sort((x, y) => y - x);
    expect(sizes[0] + sizes[1]).toBeGreaterThanOrEqual(0.9 * rows * cols);
    const byGroup = new Map();
    for (const c of out.cells) {
      if (c.kind !== 'symbol') continue;
      if (!byGroup.has(c.group)) byGroup.set(c.group, new Set());
      byGroup.get(c.group).add(which(c.col, c.row));
    }
    for (const set of byGroup.values()) expect(set.size).toBe(1);
  });
});

describe('cluster — stray cells', () => {
  const dist1 = (a, b) => Math.abs(a[0] - b[0]);
  const items = [].concat(
    Array.from({ length: 20 }, () => [0]), Array.from({ length: 20 }, () => [10]),
    [[2.5], [7.5]],          // strays near the two groups
    [[40], [40]]);           // a rare but distinct value
  it('folds a few stray items into the nearest group, but keeps a distinct rare one', () => {
    const res = RC._cluster(items, x => x, dist1, 2, { minSize: 3, farApart: 8 });
    expect(res.groups.map(g => g.members.length).sort((a, b) => b - a)).toEqual([21, 21, 2]);
  });
  it('leaves strays alone without the option', () => {
    expect(RC._cluster(items, x => x, dist1, 2).groups.length).toBeGreaterThan(3);
  });
});
