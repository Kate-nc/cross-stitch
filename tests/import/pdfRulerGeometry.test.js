/* tests/import/pdfRulerGeometry.test.js — characterisation of the ruler-to-grid
 * placement calculations in pdf-importer.js: chartContentBox, rulerCellSpan,
 * anchorGridToRuler, gridFromRuler and samplingGrid.
 *
 * These were written against the in-class implementations and must keep passing
 * unchanged when the arithmetic lives in pdf-chart-geometry.js: they go through
 * the importer's own methods, which stay in place as delegates. Expected values
 * are what the code returned before the move, including the awkward ones
 * (a falsy boldLineInterval falling back to 10, a ruler page with no span
 * throwing, the measured grid coming back by identity).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function loadImporterClass() {
  global.pdfjsLib = { OPS: new Proxy({}, { get: () => -1 }), GlobalWorkerOptions: { workerSrc: '' } };
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(ROOT, 'pdf-importer.js'), 'utf8') + '\nthis.PatternKeeperImporter = PatternKeeperImporter;');
  return this.PatternKeeperImporter;
}
const Importer = loadImporterClass();
const imp = new Importer();

const pt = (x, y) => ({ x, y });
const rect = (x, y, w, h, fill) => ({
  type: 'rect', lineWidth: 1, fillColor: fill || [20, 20, 20],
  points: [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h), pt(x, y)],
});
const glyph = (str, x, y, extra) => Object.assign({ str, x, y, width: 6, height: 8, fontName: 'f' }, extra || {});
const page = (over) => Object.assign({ pageIndex: 1, width: 612, height: 792, vectorPaths: [], textItems: [], fonts: [] }, over || {});
const box = (b) => b && [b.x0, b.y0, b.x1, b.y1];

/* deep-freeze: the calculations take explicit inputs and must not write to them */
function freeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(freeze); }
  return o;
}

describe('chartContentBox', () => {
  it('is null for an empty page or one with only furniture', () => {
    expect(imp.chartContentBox(page(), 10, 10)).toBeNull();
    expect(imp.chartContentBox({}, 10, 10)).toBeNull();
    expect(imp.chartContentBox(page({ vectorPaths: [{ points: [] , fillColor: [1, 2, 3] }, { points: [pt(50, 50)] }] }), 10, 10)).toBeNull();
    expect(imp.chartContentBox(page({ textItems: [glyph('Title', 50, 50), glyph('12', 60, 50)] }), 10, 10)).toBeNull();
  });

  it('hugs coloured fills and ignores unfilled paths', () => {
    const p = page({ vectorPaths: [rect(100, 200, 10, 10), rect(130, 240, 10, 10), { type: 'line', points: [pt(0, 0), pt(500, 700)], lineWidth: 1 }] });
    expect(box(imp.chartContentBox(p, 10, 10))).toEqual([100, 200, 140, 250]);
  });

  it('skips a fill that covers the sheet or touches its edge, with or without a pitch', () => {
    const sheet = rect(0, 0, 612, 792, [255, 255, 255]);
    const strip = rect(200, 0, 50, 40);              // reaches y <= 1
    const right = rect(560, 300, 52, 10);            // reaches pageW - 1
    const near = rect(300, 300, 10, 10);
    for (const pitch of [undefined, 10]) {
      expect(box(imp.chartContentBox(page({ vectorPaths: [sheet, strip, right, near] }), pitch, pitch))).toEqual([300, 300, 310, 310]);
    }
    // the 0.9 test needs both dimensions and a known page size
    const wide = rect(10, 10, 560, 100);
    expect(box(imp.chartContentBox(page({ vectorPaths: [wide] }), 10, 10))).toEqual([10, 10, 570, 110]);
    expect(box(imp.chartContentBox(page({ width: 0, height: 0, vectorPaths: [rect(0, 0, 612, 792)] }), 10, 10))).toEqual([0, 0, 612, 792]);
  });

  it('skips a white backdrop only when it is more than four cells each way and a pitch is known', () => {
    const white = rect(100, 100, 50, 50, [255, 255, 255]);
    const smallWhite = rect(100, 100, 40, 40, [255, 255, 255]);   // exactly 4 cells: not > 4, kept
    const nearWhite = rect(200, 200, 50, 50, [245, 250, 255]);
    expect(imp.chartContentBox(page({ vectorPaths: [white] }), 10, 10)).toBeNull();
    expect(box(imp.chartContentBox(page({ vectorPaths: [white] }), undefined, undefined))).toEqual([100, 100, 150, 150]);
    expect(box(imp.chartContentBox(page({ vectorPaths: [smallWhite] }), 10, 10))).toEqual([100, 100, 140, 140]);
    // each dimension is tested on its own: four cells wide but tall, or four cells tall but wide
    expect(box(imp.chartContentBox(page({ vectorPaths: [rect(100, 100, 40, 60, [255, 255, 255])] }), 10, 10))).toEqual([100, 100, 140, 160]);
    expect(box(imp.chartContentBox(page({ vectorPaths: [rect(100, 100, 60, 40, [255, 255, 255])] }), 10, 10))).toEqual([100, 100, 160, 140]);
    expect(imp.chartContentBox(page({ vectorPaths: [rect(100, 100, 40.1, 40.1, [255, 255, 255])] }), 10, 10)).toBeNull();
    expect(imp.chartContentBox(page({ vectorPaths: [nearWhite] }), 10, 10)).toBeNull();
    expect(box(imp.chartContentBox(page({ vectorPaths: [rect(200, 200, 50, 50, [244, 250, 255])] }), 10, 10))).toEqual([200, 200, 250, 250]);
  });

  it('keeps a right-angled triangle and drops an arrowhead with one straight side', () => {
    const quarter = { fillColor: [9, 9, 9], points: [pt(100, 100), pt(110, 100), pt(100, 110), pt(100, 100)] };
    const arrow = { fillColor: [9, 9, 9], points: [pt(80, 120), pt(90, 115), pt(90, 125), pt(80, 120)] };
    expect(box(imp.chartContentBox(page({ vectorPaths: [quarter] }), 10, 10))).toEqual([100, 100, 110, 110]);
    expect(imp.chartContentBox(page({ vectorPaths: [arrow] }), 10, 10)).toBeNull();
    // a slanted triangle with no straight side at all
    const slant = { fillColor: [9, 9, 9], points: [pt(100, 100), pt(107, 103), pt(103, 109)] };
    expect(imp.chartContentBox(page({ vectorPaths: [slant] }), 10, 10)).toBeNull();
    // five points are never tested as a triangle
    const five = { fillColor: [9, 9, 9], points: [pt(100, 100), pt(107, 103), pt(103, 109), pt(101, 104), pt(100, 100)] };
    expect(box(imp.chartContentBox(page({ vectorPaths: [five] }), 10, 10))).toEqual([100, 100, 107, 109]);
  });

  it('skips a ruler band one cell thick and twenty or more long, but only given a pitch', () => {
    const hBand = rect(50, 40, 300, 12);        // 12 <= 15 and 300 >= 200
    const vBand = rect(40, 60, 12, 300);
    const edge = rect(100, 100, 10, 10);
    const edgeCell = rect(50, 40, 150, 10);     // 15 cells: long enough to be a stitch row
    expect(box(imp.chartContentBox(page({ vectorPaths: [hBand, vBand, edge] }), 10, 10))).toEqual([100, 100, 110, 110]);
    expect(box(imp.chartContentBox(page({ vectorPaths: [hBand, vBand, edge] }), undefined, undefined))).toEqual([40, 40, 350, 360]);
    expect(box(imp.chartContentBox(page({ vectorPaths: [edgeCell, edge] }), 10, 10))).toEqual([50, 40, 200, 110]);
    // exactly 20 pitches long and 1.5 thick is a band; 19.99 is not
    expect(imp.chartContentBox(page({ vectorPaths: [rect(50, 40, 200, 15)] }), 10, 10)).toBeNull();
    expect(box(imp.chartContentBox(page({ vectorPaths: [rect(50, 40, 199.9, 15)] }), 10, 10))).toEqual([50, 40, 249.9, 55]);
  });

  it('counts pictured symbols and single glyphs, and holds a lone digit to the box the rest mark out', () => {
    const p = page({
      vectorPaths: [rect(100, 100, 10, 10)],
      images: [{ pic: true, x0: 120, x1: 130, y0: 100, y1: 110 }, { pic: false, x0: 0, x1: 1000, y0: 0, y1: 1000 }, { x0: 0, x1: 1000, y0: 0, y1: 1000 }],
      textItems: [
        glyph('A', 140, 118),                  // centre y = 114
        glyph(' B ', 150, 128),                // trims to one glyph
        glyph('AB', 400, 400),                 // two characters: ignored
        glyph('', 5, 5),
        glyph('7', 100, 118),                  // inside: counts
        glyph('1', 20, 118),                   // a ruler's 1, outside by more than a pitch: dropped
        glyph('9', 160, 128, { height: undefined }),  // no height: centre is baseline; just inside slack
      ],
    });
    expect(box(imp.chartContentBox(p, 10, 10))).toEqual([100, 100, 160, 128]);
  });

  it('lets every digit count when nothing else marks out the chart, and applies pitch slack to the edges', () => {
    const only = page({ textItems: [glyph('1', 20, 40), glyph('2', 200, 300)] });
    expect(box(imp.chartContentBox(only, 10, 10))).toEqual([20, 36, 200, 296]);
    const p = page({ vectorPaths: [rect(100, 100, 10, 10)], textItems: [glyph('3', 110 + 10, 118), glyph('4', 110 + 10.5, 118), glyph('5', 90, 118), glyph('6', 89.5, 118)] });
    // each accepted digit widens the box the next one is measured against
    expect(box(imp.chartContentBox(p, 10, 10))).toEqual([89.5, 100, 120.5, 114]);
    const chain = (xs) => page({ vectorPaths: [rect(100, 100, 10, 10)], textItems: xs.map(x => glyph('8', x, 118)) });
    expect(box(imp.chartContentBox(chain([118, 127]), 10, 10))).toEqual([100, 100, 127, 114]);
    expect(box(imp.chartContentBox(chain([127, 118]), 10, 10))).toEqual([100, 100, 118, 114]);
    // without a pitch there is no slack at all
    expect(box(imp.chartContentBox(p, undefined, undefined))).toEqual([100, 100, 110, 110]);
  });

  it('does not write to the page it is given', () => {
    const p = freeze(page({ vectorPaths: [rect(100, 100, 10, 10)], images: [{ pic: true, x0: 1, x1: 2, y0: 3, y1: 4 }], textItems: [glyph('A', 1, 2), glyph('4', 3, 4)] }));
    expect(() => imp.chartContentBox(p, 10, 10)).not.toThrow();
  });
});

describe('rulerCellSpan', () => {
  const ruler = { colBase: 0.5, rowBase: 0.5, pitchX: 10, pitchY: 10 };
  const chart = (x, y, w, h) => page({ vectorPaths: [rect(x, y, w, h), rect(x + w - 10, y + h - 10, 10, 10)] });

  it('maps the chart content through the ruler and returns 0-based cells', () => {
    expect(imp.rulerCellSpan(chart(100, 200, 50, 40), ruler, 309, 467)).toEqual({ colStart: 10, rowStart: 20, columns: 6, rows: 5 });
  });

  it('rounds half-way positions with Math.round (towards +infinity)', () => {
    // colBase 0.5 + 100/10 = 10.5 -> 11; 150/10 + 0.5 = 15.5 -> 16
    expect(imp.rulerCellSpan(chart(100, 100, 50, 50), ruler, 100, 100)).toEqual({ colStart: 10, rowStart: 10, columns: 6, rows: 6 });
    expect(imp.rulerCellSpan(chart(100, 100, 50, 50), { colBase: -0.5, rowBase: -0.5, pitchX: 10, pitchY: 10 }, 100, 100))
      .toEqual({ colStart: 9, rowStart: 9, columns: 6, rows: 6 });
  });

  it('clamps to the design: no column before 1, nothing beyond the limits', () => {
    // both edges fall before column 1: they collapse onto it
    expect(imp.rulerCellSpan(chart(100, 200, 50, 40), { colBase: -50, rowBase: -50, pitchX: 10, pitchY: 10 }, 12, 9))
      .toEqual({ colStart: 0, rowStart: 0, columns: 1, rows: 1 });
    // one edge inside, one beyond the limit
    expect(imp.rulerCellSpan(chart(100, 200, 50, 40), { colBase: -2, rowBase: -12, pitchX: 10, pitchY: 10 }, 12, 9))
      .toEqual({ colStart: 7, rowStart: 7, columns: 5, rows: 2 });
    expect(imp.rulerCellSpan(chart(100, 200, 50, 40), { colBase: 500, rowBase: 500, pitchX: 10, pitchY: 10 }, 12, 9))
      .toEqual({ colStart: 11, rowStart: 8, columns: 1, rows: 1 });
  });

  it('covers the whole sheet, 612 by 792 when the size is missing, when the page has no content', () => {
    expect(imp.rulerCellSpan(page(), ruler, 1000, 1000)).toEqual({ colStart: 0, rowStart: 0, columns: 62, rows: 80 });
    expect(imp.rulerCellSpan({}, ruler, 1000, 1000)).toEqual({ colStart: 0, rowStart: 0, columns: 62, rows: 80 });
    expect(imp.rulerCellSpan(page({ width: 100, height: 50 }), ruler, 1000, 1000)).toEqual({ colStart: 0, rowStart: 0, columns: 11, rows: 6 });
  });

  it('never returns a negative span when the far edge maps before the near one', () => {
    expect(imp.rulerCellSpan(chart(100, 100, 50, 50), { colBase: 0, rowBase: 0, pitchX: -10, pitchY: -10 }, 100, 100))
      .toEqual({ colStart: 0, rowStart: 0, columns: 1, rows: 1 });
  });

  it('does not write to its inputs', () => {
    expect(() => imp.rulerCellSpan(freeze(chart(100, 200, 50, 40)), freeze(Object.assign({}, ruler)), 309, 467)).not.toThrow();
  });
});

describe('anchorGridToRuler', () => {
  const grid = { originX: 100, originY: 100, cellWidth: 10, cellHeight: 10, columns: 10, rows: 10 };
  const lab = (value, x, y, extra) => Object.assign({ value, x, y, width: 8, height: 8 }, extra || {});
  // labels centred on their cells: column c (0-based) is centred at 105 + 10c
  const centredCols = (first, idx) => idx.map(i => lab(first + i, 105 + 10 * i - 4, 90));
  const centredRows = (first, idx) => idx.map(i => lab(first + i, 90, 105 + 10 * i + 4));
  const ruler = (cols, rows, extra) => Object.assign({ pitchX: 10, pitchY: 10, colLabels: cols, rowLabels: rows }, extra || {});

  it('is null when the grid, the ruler or either label list is missing, or a cell has no size', () => {
    const r = ruler(centredCols(21, [0, 5]), centredRows(31, [0, 5]));
    expect(imp.anchorGridToRuler(null, r, 100, 100)).toBeNull();
    expect(imp.anchorGridToRuler(grid, null, 100, 100)).toBeNull();
    expect(imp.anchorGridToRuler(Object.assign({}, grid, { cellWidth: 0 }), r, 100, 100)).toBeNull();
    expect(imp.anchorGridToRuler(Object.assign({}, grid, { cellHeight: NaN }), r, 100, 100)).toBeNull();
    expect(imp.anchorGridToRuler(grid, Object.assign({}, r, { colLabels: null }), 100, 100)).toBeNull();
    expect(imp.anchorGridToRuler(grid, Object.assign({}, r, { rowLabels: undefined }), 100, 100)).toBeNull();
  });

  it('refuses a pitch more than four per cent away from the grid, and accepts one just inside', () => {
    const cols = centredCols(21, [0, 5]), rows = centredRows(31, [0, 5]);
    expect(imp.anchorGridToRuler(grid, ruler(cols, rows, { pitchX: 10.5 }), 100, 100)).toBeNull();
    expect(imp.anchorGridToRuler(grid, ruler(cols, rows, { pitchY: 9.5 }), 100, 100)).toBeNull();
    expect(imp.anchorGridToRuler(grid, ruler(cols, rows, { pitchX: 10.39 }), 100, 100)).not.toBeNull();
    expect(imp.anchorGridToRuler(grid, ruler(cols, rows, { pitchX: 9.62 }), 100, 100)).not.toBeNull();
    // 10 / 9.6117 is 4.04% over and 10 / 10.42 is 4.03% under; 9.62 and 10.41 are inside
    expect(imp.anchorGridToRuler(grid, ruler(cols, rows, { pitchX: 9.6117 }), 100, 100)).toBeNull();
    expect(imp.anchorGridToRuler(grid, ruler(cols, rows, { pitchY: 9.6117 }), 100, 100)).toBeNull();
    expect(imp.anchorGridToRuler(grid, ruler(cols, rows, { pitchX: 10.41 }), 100, 100)).not.toBeNull();
    expect(imp.anchorGridToRuler(grid, ruler(cols, rows, { pitchY: 10.41 }), 100, 100)).not.toBeNull();
    expect(imp.anchorGridToRuler(grid, ruler(cols, rows, { pitchY: 10.42 }), 100, 100)).toBeNull();
  });

  it('reads the first column and row from cell-centred labels', () => {
    const r = ruler(centredCols(21, [0, 5]), centredRows(31, [0, 5]));
    expect(imp.anchorGridToRuler(grid, r, 100, 100)).toEqual({ colStart: 20, rowStart: 30, columns: 10, rows: 10 });
  });

  it('reads labels sitting on the ruled lines as naming the cell that ends there', () => {
    // label N centred on the line ending cell N: x = 100 + 10 * N' for N' = 1..
    const onLineCols = [3, 4, 8].map(n => lab(n + 40, 100 + 10 * n - 4, 90));
    const onLineRows = [3, 4, 8].map(n => lab(n + 60, 90, 100 + 10 * n + 4));
    expect(imp.anchorGridToRuler(grid, ruler(onLineCols, onLineRows), 500, 500)).toEqual({ colStart: 40, rowStart: 60, columns: 10, rows: 10 });
  });

  it('needs two agreeing labels on each axis, and ignores labels outside the grid', () => {
    expect(imp.anchorGridToRuler(grid, ruler(centredCols(21, [0]), centredRows(31, [0, 5])), 100, 100)).toBeNull();
    expect(imp.anchorGridToRuler(grid, ruler(centredCols(21, [0, 5]), centredRows(31, [0])), 100, 100)).toBeNull();
    const disagree = [lab(21, 101, 90), lab(40, 151, 90)];
    expect(imp.anchorGridToRuler(grid, ruler(disagree, centredRows(31, [0, 5])), 100, 100)).toBeNull();
    const outside = centredCols(21, [0, 5]).concat([lab(99, 5, 90), lab(77, 5, 90), lab(77, 400, 90)]);
    expect(imp.anchorGridToRuler(grid, ruler(outside, centredRows(31, [0, 5])), 100, 100)).toEqual({ colStart: 20, rowStart: 30, columns: 10, rows: 10 });
  });

  it('is null when the first column or row would be before 1', () => {
    expect(imp.anchorGridToRuler(grid, ruler(centredCols(-3, [4, 5]), centredRows(31, [0, 5])), 100, 100)).toBeNull();
  });

  it('centres rotated labels along y (row labels) and across x (column labels)', () => {
    const rotRows = [0, 5].map(i => lab(31 + i, 90, 105 + 10 * i + 4, { rotated: true, width: 8, height: 6 }));
    // a rotated row label's centre is y - width / 2
    expect(imp.anchorGridToRuler(grid, ruler(centredCols(21, [0, 5]), rotRows), 100, 100)).toEqual({ colStart: 20, rowStart: 30, columns: 10, rows: 10 });
    const rotCols = [0, 5].map(i => lab(21 + i, 105 + 10 * i + 3, 90, { rotated: true, width: 8, height: 6 }));
    // a rotated column label's centre is x - height / 2
    expect(imp.anchorGridToRuler(grid, ruler(rotCols, centredRows(31, [0, 5])), 100, 100)).toEqual({ colStart: 20, rowStart: 30, columns: 10, rows: 10 });
  });

  it('lets the ruler extend a grid by up to two cells and no further', () => {
    const cols = (last) => [lab(21, 101, 90), lab(21, 101, 90), lab(last, 101, 90)];
    expect(imp.anchorGridToRuler(grid, ruler(cols(32), centredRows(31, [0, 5])), 100, 100).columns).toBe(12);
    expect(imp.anchorGridToRuler(grid, ruler(cols(31), centredRows(31, [0, 5])), 100, 100).columns).toBe(11);
    expect(imp.anchorGridToRuler(grid, ruler(cols(33), centredRows(31, [0, 5])), 100, 100).columns).toBe(10);
    const rows = (last) => [lab(31, 90, 109), lab(31, 90, 109), lab(last, 90, 109)];
    expect(imp.anchorGridToRuler(grid, ruler(centredCols(21, [0, 5]), rows(42)), 100, 100).rows).toBe(12);
    expect(imp.anchorGridToRuler(grid, ruler(centredCols(21, [0, 5]), rows(43)), 100, 100).rows).toBe(10);
  });

  it('trims the span to the design limits, keeping at least one cell', () => {
    const r = ruler(centredCols(21, [0, 5]), centredRows(31, [0, 5]));
    expect(imp.anchorGridToRuler(grid, r, 24, 33)).toEqual({ colStart: 20, rowStart: 30, columns: 4, rows: 3 });
    expect(imp.anchorGridToRuler(grid, r, 20, 30)).toEqual({ colStart: 20, rowStart: 30, columns: 1, rows: 1 });
    expect(imp.anchorGridToRuler(grid, r, 5, 5)).toEqual({ colStart: 20, rowStart: 30, columns: 1, rows: 1 });
  });

  it('does not write to its inputs', () => {
    const r = freeze(ruler(centredCols(21, [0, 5]), centredRows(31, [0, 5])));
    expect(() => imp.anchorGridToRuler(freeze(Object.assign({}, grid)), r, 100, 100)).not.toThrow();
  });
});

describe('gridFromRuler', () => {
  const ruler = { colBase: 0.5, rowBase: 1.25, pitchX: 9.5, pitchY: 10.5 };
  const span = { colStart: 3, rowStart: 4, columns: 7, rows: 8 };

  it('puts the origin half a pitch before the leading edge of the first absolute column and row', () => {
    expect(imp.gridFromRuler(ruler, span, null)).toEqual({
      originX: (4 - 0.5) * 9.5 - 9.5 / 2, originY: (5 - 1.25) * 10.5 - 10.5 / 2,
      cellWidth: 9.5, cellHeight: 10.5, columns: 7, rows: 8, boldLineInterval: 10,
    });
  });

  it('takes boldLineInterval from the fallback only when it is truthy', () => {
    expect(imp.gridFromRuler(ruler, span, { boldLineInterval: 5 }).boldLineInterval).toBe(5);
    expect(imp.gridFromRuler(ruler, span, { boldLineInterval: 0 }).boldLineInterval).toBe(10);
    expect(imp.gridFromRuler(ruler, span, {}).boldLineInterval).toBe(10);
    expect(imp.gridFromRuler(ruler, span, undefined).boldLineInterval).toBe(10);
  });

  it('builds a new object each time and leaves its inputs alone', () => {
    const a = imp.gridFromRuler(freeze(Object.assign({}, ruler)), freeze(Object.assign({}, span)), freeze({ boldLineInterval: 5, originX: 77 }));
    expect(a).not.toHaveProperty('x');
    expect(Object.keys(a)).toEqual(['originX', 'originY', 'cellWidth', 'cellHeight', 'columns', 'rows', 'boldLineInterval']);
  });

  it('throws a TypeError for a missing span, as before', () => {
    expect(() => imp.gridFromRuler(ruler, undefined, null)).toThrow(TypeError);
  });
});

describe('samplingGrid', () => {
  const grid = { originX: 12, originY: 34, cellWidth: 9, cellHeight: 9, columns: 50, rows: 60, boldLineInterval: 5 };
  const ruler = { colBase: 0.5, rowBase: 0.5, pitchX: 9, pitchY: 9 };
  const span = { colStart: 2, rowStart: 3, columns: 20, rows: 30 };

  it('trims the measured grid to the ruler span when the ruler anchored it, as a new object', () => {
    const out = imp.samplingGrid({ ruler, anchoredToGrid: true, rulerSpan: span, grid });
    expect(out).toEqual({ originX: 12, originY: 34, cellWidth: 9, cellHeight: 9, columns: 20, rows: 30, boldLineInterval: 5 });
    expect(out).not.toBe(grid);
    expect(grid.columns).toBe(50);
  });

  it('rebuilds the grid from the ruler when the ruler could not anchor it', () => {
    const out = imp.samplingGrid({ ruler, anchoredToGrid: false, rulerSpan: span, grid });
    expect(out).toEqual(imp.gridFromRuler(ruler, span, grid));
    expect(out.boldLineInterval).toBe(5);
    expect(imp.samplingGrid({ ruler, rulerSpan: span, grid: null }).boldLineInterval).toBe(10);
    // anchored but no span: also falls through to the ruler-derived grid, which then needs the span
    expect(() => imp.samplingGrid({ ruler, anchoredToGrid: true, grid })).toThrow(TypeError);
  });

  it('returns the measured grid itself when there is no ruler', () => {
    expect(imp.samplingGrid({ grid })).toBe(grid);
    expect(imp.samplingGrid({ grid, anchoredToGrid: true, rulerSpan: span })).toBe(grid);
    expect(imp.samplingGrid({})).toBeUndefined();
  });
});
