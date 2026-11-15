/* tests/import/pdfVectorGlyphs.test.js — the parts that read a KG-Chart chart:
 * symbols drawn as shapes (pdf-vector-glyphs.js), the key's ruled swatch boxes
 * (pdf-key-reader.js), and the grid measured inside its ruler bands, with the
 * pitch its alternating rules really have (pdf-importer.js detectGrid,
 * pdf-chart-geometry.js anchorGridToRuler). tests/import/pdfKgChart.test.js
 * puts them together on whole charts.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const V = require(path.join(ROOT, 'pdf-vector-glyphs.js'));
const R = require(path.join(ROOT, 'pdf-key-reader.js'));
const G = require(path.join(ROOT, 'pdf-chart-geometry.js'));

function loadImporterClass() {
  global.pdfjsLib = { OPS: new Proxy({}, { get: () => -1 }), GlobalWorkerOptions: { workerSrc: '' } };
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(ROOT, 'pdf-importer.js'), 'utf8') + '\nthis.PatternKeeperImporter = PatternKeeperImporter;');
  return this.PatternKeeperImporter;
}
const imp = new (loadImporterClass())();

/* Shapes in ems, centred on 0, placed at (cx, cy) with an em of `em` points. */
const place = (shapes, cx, cy, em) => shapes.map(s => Object.assign({}, s, { pts: s.pts.map(p => ({ x: cx + p.x * em, y: cy + p.y * em })) }));
const box = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const filled = (pts, paint) => ({ pts, fill: true, paint });
const circle = (r, n) => Array.from({ length: n || 24 }, (_, i) => ({ x: r * Math.cos(2 * Math.PI * i / (n || 24)), y: r * Math.sin(2 * Math.PI * i / (n || 24)) }));
const BOLD_ARROW = [filled([{ x: -0.5, y: 0 }, { x: 0, y: -0.5 }, { x: 0, y: 0.5 }], 1), filled(box(0, -0.14, 0.5, 0.28), 2)];
const THIN_ARROW = [
  filled([{ x: 0, y: -0.5 }, { x: -0.5, y: 0 }, { x: -0.38, y: 0 }, { x: 0, y: -0.38 }], 1),
  filled([{ x: 0, y: 0.5 }, { x: -0.5, y: 0 }, { x: -0.38, y: 0 }, { x: 0, y: 0.38 }], 2),
  filled(box(-0.44, -0.06, 0.94, 0.12), 3),
];
const E = [filled(box(-0.5, -0.5, 1, 0.15), 1), filled(box(-0.5, -0.075, 1, 0.15), 2), filled(box(-0.5, 0.35, 1, 0.15), 3), filled(box(-0.5, -0.5, 0.15, 1), 4)];
const F = E.filter((_, i) => i !== 2);

describe('pdf-vector-glyphs', () => {
  it('measures the em as the commonest share of the box a symbol fills', () => {
    // Most symbols fill half the cell one way; a dot and a dash do not.
    const groups = [];
    for (let i = 0; i < 20; i++) groups.push({ w: 3.96 + (i % 3) * 0.02, h: 3.9, box: 7.92 });
    groups.push({ w: 1, h: 1, box: 7.92 }, { w: 3.9, h: 0.4, box: 7.92 }, { w: 0.5, h: 0.5, box: 7.92 });
    expect(V.emOf(groups)).toBeCloseTo(0.5, 2);
    expect(V.emOf([])).toBe(0);
  });

  it('draws the same symbol alike at any size and place', () => {
    const chart = V.bitmap(place(BOLD_ARROW, 103.1, 207.4, 3.96), 103.1, 207.4, 3.96);
    const key = V.bitmap(place(BOLD_ARROW, 300, 420, 7.2), 300, 420, 7.2);
    expect(V.similarity(chart, key)).toBeGreaterThan(0.97);
    // Drawn half a pixel off centre, still the same symbol.
    const off = V.bitmap(place(BOLD_ARROW, 103.1 + V.pixelSize(3.96) / 2, 207.4, 3.96), 103.1, 207.4, 3.96);
    expect(V.similarity(chart, off)).toBeGreaterThan(0.95);
  });

  it('tells a bold arrow from a thin one, a ring from a disc and an E from an F', () => {
    const at = (shapes) => V.bitmap(place(shapes, 0, 0, 5), 0, 0, 5);
    const ring = [{ pts: circle(0.5), fill: true, paint: 1 }, { pts: circle(0.3), fill: true, paint: 1 }];
    const disc = [{ pts: circle(0.5), fill: true, paint: 1 }];
    expect(V.similarity(at(BOLD_ARROW), at(THIN_ARROW))).toBeLessThan(0.9);
    expect(V.similarity(at(ring), at(disc))).toBeLessThan(0.85);
    expect(V.similarity(at(E), at(F))).toBeLessThan(0.95);
    const keyed = [{ bits: at(BOLD_ARROW), id: '3853' }, { bits: at(THIN_ARROW), id: '740' }, { bits: at(E), id: '939' }, { bits: at(F), id: '987' }];
    const chartOf = (shapes) => V.bitmap(place(shapes, 10, 10, 3.9), 10, 10, 3.9);
    expect(keyed[V.bestMatch(chartOf(THIN_ARROW), keyed).index].id).toBe('740');
    expect(keyed[V.bestMatch(chartOf(BOLD_ARROW), keyed).index].id).toBe('3853');
    expect(keyed[V.bestMatch(chartOf(F), keyed).index].id).toBe('987');
  });

  it('draws a stroked outline as well as a filled one', () => {
    const ringStroke = [{ pts: circle(0.4).concat([circle(0.4)[0]]), fill: false, pen: 0.6 }];
    const bits = V.bitmap(place(ringStroke, 0, 0, 5), 0, 0, 5);
    const N = V.N;
    expect(bits[(N / 2) * N + N / 2]).toBe(0);                    // the middle is empty
    expect(bits.reduce((n, b) => n + b, 0)).toBeGreaterThan(N);  // the ring is drawn
  });

  it('matches nothing when no key symbol is close, or two different threads are equally close', () => {
    const at = (shapes) => V.bitmap(place(shapes, 0, 0, 5), 0, 0, 5);
    const dot = [{ pts: circle(0.1), fill: true, paint: 1 }];
    expect(V.bestMatch(at(dot), [{ bits: at(E), id: '939' }])).toBeNull();
    expect(V.bestMatch(at(E), [{ bits: at(E), id: '939' }, { bits: at(E), id: '3021' }])).toBeNull();
    // The same thread twice is no ambiguity.
    expect(V.bestMatch(at(E), [{ bits: at(E), id: '939' }, { bits: at(E), id: '939' }])).not.toBeNull();
  });

  it('gives equal bitmaps one id, and draws a bitmap black on white for the review', () => {
    const at = (shapes) => V.bitmap(place(shapes, 0, 0, 5), 0, 0, 5);
    expect(V.keyOf(at(E))).toBe(V.keyOf(at(E)));
    expect(V.keyOf(at(E))).not.toBe(V.keyOf(at(F)));
    const bits = at(E);
    const img = V.toRgba(bits);
    expect([img.w, img.h, img.data.length]).toEqual([V.N, V.N, V.N * V.N * 4]);
    const inked = bits.indexOf(1);
    expect(Array.from(img.data.slice(inked * 4, inked * 4 + 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(img.data.slice(0, 4))).toEqual([255, 255, 255, 255]);  // the corner, past the em, is paper
  });
});

/* ── the key: swatch squares ruled with four lines ────────────────────────── */

describe('a key whose swatches are ruled squares', () => {
  const text = (str, x, y) => ({ str, x, y, width: str.length * 5, height: 9, fontName: 'f1' });
  const line = (x0, y0, x1, y1) => ({ type: 'line', stroked: true, strokeColor: [130, 130, 130], lineWidth: 2.36, penWidth: 0.28, points: [{ x: x0, y: y0 }, { x: x1, y: y1 }] });
  const ruled = (x, y, s) => [line(x, y, x + s, y), line(x + s, y, x + s, y + s), line(x, y + s, x + s, y + s), line(x, y, x, y + s)];
  const rect = (x, y, w, h, fill) => ({ type: 'rect', fillColor: fill, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }] });

  it('reads an entry with a drawn symbol as cross stitch, with the symbol\'s shapes, not as backstitch', () => {
    const page = {
      textItems: [text('939', 100, 110), text('(1796 ct)', 130, 110), text('3341', 100, 130), text('n', 85, 130)],
      vectorPaths: [
        ...ruled(82, 100, 11.3),
        // The E: four black bars. The largest, 7.4 x 3.2, once passed for a swatch.
        rect(84, 102, 7.4, 3.2, [0, 0, 0]), rect(84, 104.7, 7.4, 0.8, [0, 0, 0]), rect(84, 108.5, 7.4, 0.8, [0, 0, 0]), rect(84, 102, 0.9, 7.3, [0, 0, 0]),
        ...ruled(82, 120, 11.3),
      ],
      images: [],
    };
    const out = R.readKeyEntries(page, null);
    expect(out.map(e => [e.threadCode, e.kind])).toEqual([['939', 'cross'], ['3341', 'cross']]);
    const e939 = out[0];
    expect(e939.swatchRgb).toBeNull();
    expect(e939.stitchCount).toBe(1796);
    expect(e939.glyphInk.box).toEqual({ x0: 82, y0: 100, x1: 93.3, y1: 111.3 });
    expect(e939.glyphInk.shapes).toHaveLength(4);
    expect(e939.glyphInk.shapes.every(s => s.fill)).toBe(true);
    // A text symbol in the square is the symbol; there are no shapes to keep.
    expect(out[1].symbol).toBe('n');
    expect(out[1].glyphInk).toBeUndefined();
  });

  it('keeps a filled swatch inside the ruling as the swatch, its symbol as ink', () => {
    const page = {
      textItems: [text('972', 100, 110)],
      vectorPaths: [rect(82, 100, 11.3, 11.3, [227, 165, 34]), ...ruled(82, 100, 11.3),
        { type: 'path', fillColor: [0, 0, 0], paint: 7, points: [{ x: 91, y: 102 }, { x: 91, y: 109 }, { x: 84, y: 109 }, { x: 91, y: 102 }] }],
      images: [],
    };
    const [e] = R.readKeyEntries(page, null);
    expect(e.swatchRgb).toEqual([227, 165, 34]);
    expect(e.glyphInk.shapes).toEqual([{ pts: [{ x: 91, y: 102 }, { x: 91, y: 109 }, { x: 84, y: 109 }, { x: 91, y: 102 }], fill: true, pen: 0, paint: 7 }]);
  });

  it('still reads a backstitch sample drawn in a ruled square as backstitch', () => {
    const page = {
      textItems: [text('3799', 100, 110)],
      vectorPaths: [...ruled(82, 100, 11.3), { type: 'line', stroked: true, strokeColor: [40, 40, 40], points: [{ x: 83, y: 105.6 }, { x: 92, y: 105.6 }] }],
      images: [],
    };
    const [e] = R.readKeyEntries(page, null);
    expect(e.kind).toBe('backstitch');
    expect(e.lineRgb).toEqual([40, 40, 40]);
  });
});

/* ── the grid inside KG-Chart's ruler bands ───────────────────────────────── */

describe('detectGrid on a KG-Chart page', () => {
  // A 65 x 96 grid whose rules alternate 7.92 and 8.04 apart, as KG-Chart's do.
  const at = (i) => i * 7.98 - (i % 2 ? 0.06 : 0);
  const X0 = 39.48, Y0 = 59.76, COLS = 65, ROWS = 96;
  const line = (x0, y0, x1, y1) => ({ type: 'line', stroked: true, strokeColor: [130, 130, 130], points: [{ x: x0, y: y0 }, { x: x1, y: y1 }] });
  const band = (x0, y0, x1, y1) => ({ type: 'rect', fillColor: [220, 220, 220], points: [{ x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y0 }, { x: x0, y: y0 }, { x: x0, y: y1 }] });
  const page = (extra) => {
    const paths = [];
    for (let c = 0; c <= COLS; c++) paths.push(line(X0 + at(c), Y0, X0 + at(c), Y0 + at(ROWS)));
    for (let r = 0; r <= ROWS; r++) paths.push(line(X0, Y0 + at(r), X0 + at(COLS), Y0 + at(r)));
    return { width: 595, height: 842, vectorPaths: paths.concat(extra || []) };
  };
  const right = X0 + at(COLS), bottom = Y0 + at(ROWS);

  it('leaves out the bands shading the edges that run onto other pages', () => {
    const g = imp.detectGrid(page([
      band(right, Y0, right + 8.64, bottom),                   // right
      band(X0, bottom, right, bottom + 8.52),                  // below
      band(X0, Y0 - 8.4, right, Y0),                           // above
      // The title's underline, four cells above the top band.
      line(209.4, Y0 - 8.4 - 32.04, 385.56, Y0 - 8.4 - 32.04),
    ]));
    expect([g.columns, g.rows]).toEqual([COLS, ROWS]);
    expect([g.originX, g.originY]).toEqual([X0, Y0]);
  });

  it('takes the pitch the cells have, not the commoner of the two gaps', () => {
    const g = imp.detectGrid(page());
    expect(g.cellWidth).toBeCloseTo(at(COLS) / COLS, 4);
    expect(g.cellHeight).toBeCloseTo(at(ROWS) / ROWS, 4);
    // The last cell starts where its rule is, not a point early.
    expect(g.originX + (COLS - 1) * g.cellWidth).toBeCloseTo(X0 + at(COLS - 1), 0);
  });

  it('keeps a large filled rectangle as grid evidence when there are no ruled lines to measure by', () => {
    const g = imp.detectGrid({ width: 595, height: 842, vectorPaths: [band(100, 100, 300, 108), band(100, 116, 300, 124), band(100, 132, 300, 140)] });
    expect(g.originY).toBe(100);
  });
});

describe('anchorGridToRuler with labels on each page\'s own first and last cell', () => {
  // Cells 10 wide from x = 100. Labels centred on their cells.
  const lab = (value, x, y) => ({ value, x, y, width: 8, height: 8 });
  const cols = (first, idxs, values) => idxs.map((i, k) => lab(values[k], 105 + 10 * i - 4, 90));
  const rows = (first, idxs, values) => idxs.map((i, k) => lab(values[k], 90, 105 + 10 * i + 4));
  const ruler = (c, r) => ({ pitchX: 10, pitchY: 10, colLabels: c, rowLabels: r });

  it('trims a ruler band before the first label and after the last', () => {
    // A 37-cell grid: a band, columns 66-100, a band. Rows: four empty title
    // rows and a band above rows 97-131.
    const grid = { originX: 100, originY: 100, cellWidth: 10, cellHeight: 10, columns: 37, rows: 40 };
    const r = ruler(cols(65, [1, 5, 15, 25, 35], [66, 70, 80, 90, 100]).concat([]),
      rows(92, [5, 8, 18, 28, 38], [97, 100, 110, 120, 130]));
    // 100 is a multiple of ten: it may be the last cell, or the last tenth, so the band after it stays.
    expect(G.anchorGridToRuler(grid, r, 300, 500)).toEqual({ colStart: 65, rowStart: 96, columns: 36, rows: 35, skipCols: 1, skipRows: 5 });
    // With a last label off the stride, the band after it goes too.
    const r2 = ruler(cols(65, [1, 5, 15, 25, 34], [66, 70, 80, 90, 99]), rows(92, [5, 8, 18, 28, 38], [97, 100, 110, 120, 130]));
    expect(G.anchorGridToRuler(grid, r2, 300, 500)).toEqual(expect.objectContaining({ colStart: 65, columns: 34 }));
  });

  it('does not take labels that all sit off the stride for end labels', () => {
    // Labelled 5, 15, 25 ...: every label off a multiple of ten, a stride apart.
    const grid = { originX: 100, originY: 100, cellWidth: 10, cellHeight: 10, columns: 40, rows: 40 };
    const r = ruler(cols(1, [4, 14, 24, 34], [5, 15, 25, 35]), rows(1, [4, 14, 24, 34], [5, 15, 25, 35]));
    expect(G.anchorGridToRuler(grid, r, 300, 300)).toEqual({ colStart: 0, rowStart: 0, columns: 40, rows: 40 });
  });

  it('samples the trimmed grid from the first cell kept', () => {
    const grid = { originX: 100, originY: 100, cellWidth: 10, cellHeight: 10, columns: 37, rows: 40 };
    const span = { colStart: 65, rowStart: 96, columns: 36, rows: 35, skipCols: 1, skipRows: 5 };
    const g = G.samplingGrid({ ruler: {}, anchoredToGrid: true, rulerSpan: span, grid });
    expect(g).toEqual(expect.objectContaining({ originX: 110, originY: 150, columns: 36, rows: 35 }));
  });
});

/* ── found in review ──────────────────────────────────────────────────────── */

describe('what is not a drawn symbol', () => {
  const P = 10, grid = { originX: 100, originY: 100, cellWidth: P, cellHeight: P, columns: 6, rows: 4 };
  const rectPts = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }];
  const read = (paths) => imp.extractSymbols([{ pageIndex: 1, width: 595, height: 842, textItems: [], vectorPaths: paths, images: [] }],
    { pages: [{ pageIndex: 1, grid, globalOffsetCol: 0, globalOffsetRow: 0 }] }, { entries: [] })
    .then(cells => cells.filter(c => !c.isEmpty).map(c => c.col + ',' + c.row));

  it('leaves out cell outlines, corner ticks and backstitch, which reach the cell edge', async () => {
    const paths = [];
    // Every cell ruled by its own stroked rectangle, as some generators draw their grid.
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) paths.push({ type: 'rect', stroked: true, strokeColor: [120, 120, 120], penWidth: 0.3, points: rectPts(100 + c * P, 100 + r * P, P, P) });
    paths.push({ type: 'path', stroked: true, strokeColor: [0, 0, 0], penWidth: 1, points: [{ x: 120, y: 100 }, { x: 125, y: 105 }, { x: 130, y: 100 }] });
    // One real symbol, in the middle of cell (3, 2).
    paths.push({ type: 'path', fillColor: [0, 0, 0], paint: 1, points: [{ x: 133, y: 127 }, { x: 137, y: 127 }, { x: 137, y: 123 }, { x: 133, y: 127 }] });
    expect(await read(paths)).toEqual(['3,2']);
  });
});

describe('detectGrid with rules drawn as thin filled rectangles', () => {
  it('keeps them: only a band a good part of a cell thick is furniture', () => {
    const X0 = 100, Y0 = 100, P = 8, C = 40, R = 30, paths = [];
    const line = (x0, y0, x1, y1) => ({ type: 'line', stroked: true, strokeColor: [150, 150, 150], points: [{ x: x0, y: y0 }, { x: x1, y: y1 }] });
    const hair = (x, y, w, h) => ({ type: 'rect', fillColor: [0, 0, 0], points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }] });
    // Minor lines stroked; every tenth line and the frame a 1pt filled rectangle.
    for (let c = 0; c <= C; c++) paths.push(c % 10 ? line(X0 + c * P, Y0, X0 + c * P, Y0 + R * P) : hair(X0 + c * P - 0.5, Y0, 1, R * P));
    for (let r = 0; r <= R; r++) paths.push(r % 10 ? line(X0, Y0 + r * P, X0 + C * P, Y0 + r * P) : hair(X0, Y0 + r * P - 0.5, C * P, 1));
    const g = imp.detectGrid({ width: 595, height: 842, vectorPaths: paths });
    expect([g.columns, g.rows]).toEqual([C, R]);
  });
});

describe('ruled squares in a key that also has colour swatches', () => {
  const line = (x0, y0, x1, y1) => ({ type: 'line', stroked: true, strokeColor: [0, 0, 0], points: [{ x: x0, y: y0 }, { x: x1, y: y1 }] });
  const ruled = (x, y, s) => [line(x, y, x + s, y), line(x + s, y, x + s, y + s), line(x, y + s, x + s, y + s), line(x, y, x, y + s)];
  const rect = (x, y, w, h, fill) => ({ type: 'rect', fillColor: fill, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }] });
  const text = (str, x, y) => ({ str, x, y, width: str.length * 5, height: 9 });

  it('keeps the colour when a ruled symbol box sits between the swatch and the code', () => {
    const page = { textItems: [text('321', 120, 110), text('X', 103, 110)], vectorPaths: [rect(80, 100, 10, 10, [200, 30, 40]), ...ruled(100, 100, 10)], images: [] };
    expect(R.readKeyEntries(page, null)).toEqual([expect.objectContaining({ threadCode: '321', symbol: 'X', swatchRgb: [200, 30, 40] })]);
  });

  it('finds every box of a key ruled as a table, whose boxes share their rules', () => {
    // Three boxes stacked, each one's bottom rule the next one's top.
    const paths = [line(80, 100, 91, 100), line(80, 111, 91, 111), line(80, 122, 91, 122), line(80, 133, 91, 133)];
    for (const y of [100, 111, 122]) paths.push(line(80, y, 80, y + 11), line(91, y, 91, y + 11));
    // A drawn bar in each.
    for (const y of [100, 111, 122]) paths.push(rect(83, y + 4, 5, 3, [0, 0, 0]));
    const page = { textItems: [text('310', 100, 108), text('321', 100, 119), text('336', 100, 130)], vectorPaths: paths, images: [] };
    const out = R.readKeyEntries(page, null);
    expect(out.map(e => [e.threadCode, e.kind, !!e.glyphInk])).toEqual([['310', 'cross', true], ['321', 'cross', true], ['336', 'cross', true]]);
  });
});

describe('the ink colour of a drawn symbol', () => {
  beforeAll(() => { Object.assign(global, require(path.join(ROOT, 'dmc-data.js'))); });
  const cell = { col: 0, row: 0, symbol: '', fontName: '', isEmpty: false, glyph: 'vec:unknown', fillColor: [0, 0, 0], fillColors: [[0, 0, 0]] };

  it('still matches by colour when the key draws no symbols to match against', () => {
    const [c] = imp.linkSymbolsToThreads([Object.assign({}, cell)], { entries: [{ kind: 'cross', threadCode: '310', symbol: 'A' }] });
    expect([c.thread.id, c.matchedBy]).toEqual(['310', 'nearest']);
  });

  it('is a numbered placeholder, not the nearest colour, when the key draws its symbols', () => {
    const local = new (loadImporterClass())();
    const bits = V.bitmap(place(E, 0, 0, 5), 0, 0, 5);
    local._glyphs = new Map([['vec:e', bits]]);
    const [c] = local.linkSymbolsToThreads([Object.assign({}, cell)], { entries: [{ kind: 'cross', threadCode: '939', glyph: 'vec:e' }, { kind: 'cross', threadCode: '310', symbol: 'A' }] });
    expect([c.thread.name, c.matchedBy, c.symbol]).toEqual(['Drawn symbol 1 (not in key)', 'unresolved', 'drawn 1']);
  });
});

describe('the em of a chart\'s drawn symbols', () => {
  it('is measured over every page, so a page of only dots is read at the same scale', () => {
    const P = 10;
    const page = (cells, size) => {
      const paths = [];
      cells.forEach(([c, r]) => {
        const cx = 100 + c * P + P / 2, cy = 100 + r * P + P / 2, h = size * P / 2;
        paths.push({ type: 'path', fillColor: [0, 0, 0], paint: paths.length, points: [{ x: cx - h, y: cy + h }, { x: cx + h, y: cy + h }, { x: cx + h, y: cy - h }, { x: cx - h, y: cy + h }] });
      });
      return { width: 595, height: 842, vectorPaths: paths, textItems: [], _grid: { originX: 100, originY: 100, cellWidth: P, cellHeight: P, columns: 10, rows: 10 } };
    };
    const full = page(Array.from({ length: 30 }, (_, i) => [i % 10, Math.floor(i / 10)]), 0.5);
    const dots = page([[1, 1], [3, 3], [5, 5]], 0.15);
    expect(imp.chartGlyphShare([full, dots])).toBeCloseTo(0.5, 2);
    expect(imp.chartGlyphShare([dots])).toBeCloseTo(0.15, 2);
  });
});
