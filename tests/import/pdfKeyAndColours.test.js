/* tests/import/pdfKeyAndColours.test.js — reading the colour key, reading each
 * cell's colour, and linking the two.
 *
 * Measured against TestUploads/ before these changes:
 *   gen-3  key 18 of 102 entries read; 88 colours imported, 70 of them absent
 *          from the key; 1 of 102 per-thread counts matched the key's own.
 *   gen1   key 53 of 105 entries read — every line holds two entries and only
 *          the first was taken.
 *   PAT2171_2  key not read at all (it is printed on the chart page).
 * After: gen-3 matches all 102 printed counts to the stitch.
 */

const fs = require('fs');
const path = require('path');

const OPS = {
  save: 10, restore: 11, transform: 12,
  moveTo: 13, lineTo: 14, curveTo: 15, rectangle: 19, closePath: 18,
  stroke: 20, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25,
  closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28,
  setLineWidth: 2, setFillRGBColor: 61, setStrokeRGBColor: 60, setStrokeGray: 56,
  constructPath: 91,
};

function loadImporterClass() {
  const raw = fs.readFileSync(path.resolve(__dirname, '..', '..', 'pdf-importer.js'), 'utf8');
  global.pdfjsLib = { OPS, GlobalWorkerOptions: { workerSrc: '' } };
  // eslint-disable-next-line no-eval
  eval(raw + '\nthis.PatternKeeperImporter = PatternKeeperImporter;');
  return this.PatternKeeperImporter;
}

const PatternKeeperImporter = loadImporterClass();
const imp = new PatternKeeperImporter();

/* ── builders ─────────────────────────────────────────────────────────────── */

const text = (str, x, y, extra) => Object.assign({ str, x, y, width: 6 * str.length, height: 8, fontName: 'f1' }, extra || {});
const rect = (x, y, w, h, fill) => ({
  type: 'rect', lineWidth: 1, fillColor: fill,
  points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }],
});
const page = (textItems, vectorPaths) => ({ pageIndex: 1, width: 612, height: 792, textItems, vectorPaths: vectorPaths || [], fonts: [] });

/* A KG-Chart-style key line: [swatch] code (count), three entries per line. */
function threeColumnKey(rows) {
  const t = [], v = [];
  rows.forEach((row, r) => {
    const y = 100 + r * 12;
    row.forEach((e, c) => {
      const x = 60 + c * 120;
      v.push(rect(x, y - 9, 9, 9, e.rgb));                  // swatch, baseline-aligned
      t.push(text(e.code, x + 15, y));
      t.push(text('(' + e.count + ' ct)', x + 45, y));
    });
  });
  return page(t, v);
}

/* ── key reading ─────────────────────────────────────────────────────────── */

describe('parseKeyEntries', () => {
  it('reads every entry of a multi-column key, not one per line', () => {
    const p = threeColumnKey([
      [{ code: '310', count: 10511, rgb: [5, 5, 5] }, { code: '3721', count: 1163, rgb: [160, 39, 75] }, { code: '597', count: 231, rgb: [91, 163, 179] }],
      [{ code: '939', count: 402, rgb: [27, 40, 83] }, { code: '301', count: 457, rgb: [179, 95, 43] }, { code: '959', count: 452, rgb: [89, 199, 180] }],
    ]);
    const out = imp.parseKeyEntries(p, null);
    expect(out.map(e => e.threadCode)).toEqual(expect.arrayContaining(['310', '3721', '597', '939', '301', '959']));
    expect(out).toHaveLength(6);
  });

  it('keeps the stitch count apart from the colour name', () => {
    const out = imp.parseKeyEntries(threeColumnKey([[{ code: '310', count: 10511, rgb: [5, 5, 5] }]]), null);
    expect(out[0].stitchCount).toBe(10511);
    expect(out[0].colorName).toBeNull();
  });

  it('records the exact swatch colour', () => {
    const out = imp.parseKeyEntries(threeColumnKey([[{ code: '158', count: 686, rgb: [94, 80, 153] }]]), null);
    expect(out[0].swatchRgb).toEqual([94, 80, 153]);
  });

  it('pairs each code with its own swatch, not the previous column\'s', () => {
    const out = imp.parseKeyEntries(threeColumnKey([
      [{ code: '310', count: 1, rgb: [5, 5, 5] }, { code: '3721', count: 1, rgb: [160, 39, 75] }],
    ]), null);
    const byCode = Object.fromEntries(out.map(e => [e.threadCode, e.swatchRgb]));
    expect(byCode['310']).toEqual([5, 5, 5]);
    expect(byCode['3721']).toEqual([160, 39, 75]);
  });

  it('reads a symbol, strands and name in the gen1 layout, two entries per line', () => {
    // "Ø [2] DMC 155 blue violet - md dk   \ [2] DMC 815 garnet - md"
    const p = page([
      text('Ø', 37, 117), text('[2]', 58, 117), text('DMC', 74, 117), text('155', 106, 117),
      text('blue violet - md dk', 126, 117),
      text('\\', 306, 117), text('[2]', 328, 117), text('DMC', 344, 117), text('815', 376, 117),
      text('garnet - md', 396, 117),
    ]);
    const out = imp.parseKeyEntries(p, null);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(expect.objectContaining({ symbol: 'Ø', threadCode: '155', colorName: 'blue violet - md dk', strands: 2 }));
    expect(out[1]).toEqual(expect.objectContaining({ symbol: '\\', threadCode: '815', colorName: 'garnet - md' }));
  });

  it('treats a lone digit as a symbol, never a code', () => {
    // gen1 uses digits as symbols: "4 [2] DMC 165". Read as a code, "4" used
    // to block its own entry.
    const out = imp.parseKeyEntries(page([
      text('4', 38, 158), text('[2]', 58, 158), text('DMC', 74, 158), text('165', 106, 158), text('moss green', 126, 158),
    ]), null);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(expect.objectContaining({ symbol: '4', threadCode: '165' }));
  });

  it('accepts DMC letter-prefixed codes and leading-zero codes', () => {
    const p = page([text('E334', 100, 100), text('09', 100, 120), text('D225', 100, 140)], [
      rect(80, 91, 9, 9, [102, 188, 207]), rect(80, 111, 9, 9, [94, 81, 86]), rect(80, 131, 9, 9, [237, 192, 181]),
    ]);
    expect(imp.parseKeyEntries(p, null).map(e => e.threadCode)).toEqual(['E334', '09', 'D225']);
  });

  it('reaches a swatch printed well left of its code, as DMC spaces them', () => {
    const p = page([text('310', 146, 360), text('x1', 233, 360)], [rect(100, 351, 9, 9, [2, 2, 3])]);
    const out = imp.parseKeyEntries(p, null);
    expect(out).toHaveLength(1);
    expect(out[0].swatchRgb).toEqual([2, 2, 3]);
  });

  it('does not take a skein quantity like "x1" for a code', () => {
    const p = page([text('310', 146, 360), text('x1', 233, 360)], [rect(100, 351, 9, 9, [2, 2, 3])]);
    expect(imp.parseKeyEntries(p, null).map(e => e.threadCode)).toEqual(['310']);
  });

  it('ignores a number with nothing beside it', () => {
    expect(imp.parseKeyEntries(page([text('2023', 100, 100), text('Page', 40, 100)]), null)).toEqual([]);
  });

  it('reads a backstitch entry from a stroked sample line', () => {
    const p = page([text('B5200', 120, 100)], [{
      type: 'line', stroked: true, strokeColor: [218, 221, 217], lineWidth: 2,
      points: [{ x: 80, y: 96 }, { x: 110, y: 96 }],
    }]);
    const out = imp.parseKeyEntries(p, null);
    expect(out).toEqual([expect.objectContaining({ kind: 'backstitch', threadCode: 'B5200', lineRgb: [218, 221, 217] })]);
  });

  it('reads a backstitch sample drawn as a thin filled bar with rounded ends', () => {
    // DMC's bar: three points once its curved ends are dropped.
    const p = page([text('5310', 316, 739)], [{
      type: 'path', fillColor: [241, 206, 125], lineWidth: 1,
      points: [{ x: 256, y: 735 }, { x: 286, y: 735 }, { x: 286, y: 738 }],
    }]);
    expect(imp.parseKeyEntries(p, null)).toEqual([expect.objectContaining({ kind: 'backstitch', threadCode: '5310' })]);
  });

  it('ignores anything inside the excluded region', () => {
    const p = threeColumnKey([[{ code: '310', count: 1, rgb: [5, 5, 5] }]]);
    expect(imp.parseKeyEntries(p, { x0: 0, y0: 0, x1: 612, y1: 792 })).toEqual([]);
  });
});

describe('parseLegend', () => {
  it('prefers the code-anchored reading when it finds more', () => {
    const p = threeColumnKey([
      [{ code: '310', count: 1, rgb: [5, 5, 5] }, { code: '3721', count: 1, rgb: [160, 39, 75] }, { code: '597', count: 1, rgb: [91, 163, 179] }],
    ]);
    expect(imp.parseLegend([p], []).entries).toHaveLength(3);
  });

  it('drops a stray reading from a page that is not really a key', () => {
    // PAT2171_2: a materials page whose product reference was read as a thread.
    const key = threeColumnKey([
      [{ code: '310', count: 1, rgb: [5, 5, 5] }, { code: '3721', count: 1, rgb: [160, 39, 75] }],
    ]);
    const materials = page([text('c', 50, 300), text('4015', 70, 300)]);
    const codes = imp.parseLegend([materials, key], []).entries.map(e => e.threadCode);
    expect(codes).not.toContain('4015');
    expect(codes).toEqual(expect.arrayContaining(['310', '3721']));
  });

  it('still uses a key page only the original reader understands', () => {
    // A small key elsewhere must not cause a full key in an older layout to be
    // thrown away.
    const mini = threeColumnKey([
      [{ code: '310', count: 1, rgb: [5, 5, 5] }, { code: '3721', count: 1, rgb: [160, 39, 75] }],
    ]);
    const original = page([]);
    const spy = jest.spyOn(imp, 'parseLegendLegacy').mockImplementation((pages) => ({
      entries: pages[0] === original
        ? [{ symbol: 'a', threadCode: '100' }, { symbol: 'b', threadCode: '200' }, { symbol: 'c', threadCode: '300' }]
        : [],
    }));
    try {
      const codes = imp.parseLegend([mini, original], []).entries.map(e => e.threadCode);
      expect(codes).toEqual(expect.arrayContaining(['100', '200', '300', '310', '3721']));
    } finally {
      spy.mockRestore();
    }
  });
});

/* ── cell colour reading ─────────────────────────────────────────────────── */

const gridLayout = (cols, rows, pitch) => ({
  totalColumns: cols, totalRows: rows,
  pages: [{ pageIndex: 1, grid: { originX: 100, originY: 100, cellWidth: pitch, cellHeight: pitch, columns: cols, rows }, globalOffsetCol: 0, globalOffsetRow: 0 }],
});
const cellAt = (syms, c, r) => syms.find(s => s.col === c && s.row === r);

describe('extractSymbols — cell colours', () => {
  it('reads a colour painted as half-cell strips', async () => {
    // "Microsoft: Print To PDF" paints colour as strips half a cell high.
    const p = page([], [rect(100, 100, 30, 5, [148, 177, 209]), rect(100, 105, 30, 5, [148, 177, 209])]);
    const syms = await imp.extractSymbols([p], gridLayout(3, 1, 10), null);
    expect(syms.filter(s => !s.isEmpty)).toHaveLength(3);
    expect(cellAt(syms, 1, 0).fillColor).toEqual([148, 177, 209]);
  });

  it('credits a merged multi-cell region to every cell it covers', async () => {
    // One rectangle for a 4x2 run of a single colour; by centroid it would
    // have been credited to one cell.
    const p = page([], [rect(100, 100, 40, 20, [10, 20, 30])]);
    const syms = await imp.extractSymbols([p], gridLayout(4, 2, 10), null);
    expect(syms.filter(s => !s.isEmpty)).toHaveLength(8);
  });

  it('does not let symbol ink pass for the cell colour', async () => {
    // A red cell with a small black mark on top: the cell is red.
    const p = page([], [rect(100, 100, 10, 10, [200, 30, 30]), rect(103, 103, 3, 3, [0, 0, 0])]);
    const syms = await imp.extractSymbols([p], gridLayout(1, 1, 10), null);
    expect(syms[0].fillColor).toEqual([200, 30, 30]);
    expect(syms[0].fillColors).toEqual([[200, 30, 30]]);
  });

  it('treats a paper-white cell with nothing on it as unstitched', async () => {
    const p = page([], [rect(100, 100, 10, 10, [255, 255, 255])]);
    const syms = await imp.extractSymbols([p], gridLayout(1, 1, 10), null);
    expect(syms[0].isEmpty).toBe(true);
  });

  it('keeps a near-white cell when the key lists that exact white', async () => {
    // BLANC's swatch is [252,252,248] — paper-like, but a real thread.
    const p = page([text('k', 103, 108)], [rect(100, 100, 10, 10, [252, 252, 248])]);
    const legend = { entries: [{ threadCode: 'blanc', swatchRgb: [252, 252, 248], symbol: 'k' }] };
    const syms = await imp.extractSymbols([p], gridLayout(1, 1, 10), legend);
    expect(syms[0].isEmpty).toBe(false);
    expect(syms[0].fillColors).toEqual([[252, 252, 248]]);
  });

  it('ignores a backdrop laid under the whole chart', async () => {
    const p = page([], [rect(100, 100, 100, 100, [226, 236, 236]), rect(130, 130, 10, 10, [40, 80, 120])]);
    const syms = await imp.extractSymbols([p], gridLayout(10, 10, 10), null);
    const stitched = syms.filter(s => !s.isEmpty);
    expect(stitched).toHaveLength(1);
    expect(stitched[0].fillColor).toEqual([40, 80, 120]);
  });

  it('never reads a ruler number as a symbol', async () => {
    const p = page([text('10', 101, 108)]);
    const syms = await imp.extractSymbols([p], gridLayout(2, 1, 10), null);
    expect(syms.every(s => s.isEmpty)).toBe(true);
  });

  it('never reads rotated margin text as a symbol', async () => {
    const p = page([text('s', 103, 108, { rotated: true })]);
    const syms = await imp.extractSymbols([p], gridLayout(1, 1, 10), null);
    expect(syms[0].isEmpty).toBe(true);
  });
});

/* ── linking ─────────────────────────────────────────────────────────────── */

describe('linkSymbolsToThreads', () => {
  const key = (entries) => ({ entries });

  it('links by symbol first', () => {
    const out = imp.linkSymbolsToThreads(
      [{ col: 0, row: 0, symbol: 'k', isEmpty: false }],
      key([{ threadCode: '9999', symbol: 'k', swatchRgb: [1, 2, 3] }]));
    expect(out[0].thread.id).toBe('9999');
  });

  it('links by exact swatch colour when the symbol is artwork', () => {
    const legend = key([{ threadCode: '3755', symbol: null, swatchRgb: [148, 177, 209] }]);
    const out = imp.linkSymbolsToThreads(
      [{ col: 0, row: 0, symbol: '', isEmpty: false, fillColor: [148, 177, 209], fillColors: [[148, 177, 209]] }], legend);
    expect(out[0].thread.id).toBe('3755');
    expect(legend.matchReport.swatch).toBe(1);
  });

  it('treats a swatch within two steps per channel as the same colour', () => {
    // DMC prints 3860 as 133,110,113 in the key and 134,111,113 on the chart.
    const legend = key([{ threadCode: '3860', swatchRgb: [133, 110, 113] }]);
    const out = imp.linkSymbolsToThreads(
      [{ col: 0, row: 0, symbol: '', isEmpty: false, fillColors: [[134, 111, 113]] }], legend);
    expect(out[0].thread.id).toBe('3860');
  });

  it('does not guess between two swatches equally close', () => {
    const legend = key([{ threadCode: 'A', swatchRgb: [100, 100, 100] }, { threadCode: 'B', swatchRgb: [102, 102, 102] }]);
    imp.linkSymbolsToThreads([{ col: 0, row: 0, symbol: '', isEmpty: false, fillColors: [[101, 101, 101]] }], legend);
    expect(legend.matchReport.swatch).toBe(0);
  });

  it('prefers the entry in the same font when a glyph is reused', () => {
    const out = imp.linkSymbolsToThreads(
      [{ col: 0, row: 0, symbol: 'a', fontName: 'f2', isEmpty: false }],
      key([{ threadCode: '1', symbol: 'a', symbolFontName: 'f1' }, { threadCode: '2', symbol: 'a', symbolFontName: 'f2' }]));
    expect(out[0].thread.id).toBe('2');
  });

  it('gives a code outside the DMC table the colour the key printed', () => {
    const out = imp.linkSymbolsToThreads(
      [{ col: 0, row: 0, symbol: 'z', isEmpty: false }],
      key([{ threadCode: 'E334', symbol: 'z', swatchRgb: [102, 188, 207] }]));
    expect(out[0].thread.rgb).toEqual([102, 188, 207]);
  });

  it('counts a stitch it cannot resolve instead of hiding it', () => {
    const legend = key([{ threadCode: '310', symbol: 'x' }]);
    imp.linkSymbolsToThreads([{ col: 0, row: 0, symbol: 'q', isEmpty: false }], legend);
    expect(legend.matchReport.unresolved).toBe(1);
    expect(legend.matchReport.unresolvedSymbols).toEqual({ q: 1 });
  });

  it('gives each symbol missing from the key its own placeholder thread', () => {
    const legend = key([{ threadCode: '310', symbol: 'x' }]);
    const out = imp.linkSymbolsToThreads([
      { col: 0, row: 0, symbol: 'q', isEmpty: false },
      { col: 1, row: 0, symbol: 'r', isEmpty: false },
      { col: 2, row: 0, symbol: 'q', isEmpty: false },
    ], legend);
    expect(out.map(c => c.thread.id)).toEqual(['U1', 'U2', 'U1']);
    expect(out[0].thread).toEqual(expect.objectContaining({ placeholder: 'not-in-key', name: 'Symbol q (not in key)' }));
    expect(out[0].thread.rgb).not.toEqual(out[1].thread.rgb);
  });

  it('lists the placeholders in the import report', () => {
    const legend = key([{ threadCode: '310', symbol: 'x' }]);
    const linked = imp.linkSymbolsToThreads([
      { col: 0, row: 0, symbol: 'q', isEmpty: false },
      { col: 1, row: 0, symbol: 'q', isEmpty: false },
      { col: 2, row: 0, symbol: 'x', isEmpty: false },
    ], legend);
    const p = imp.convertToPattern({ totalColumns: 3, totalRows: 1, pages: [] }, linked, legend, [], {});
    expect(p.importReport.placeholders).toEqual([
      { id: 'U1', name: 'Symbol q (not in key)', symbol: 'q', reason: 'not-in-key', count: 2 },
    ]);
  });

  it('leaves empty cells empty', () => {
    const out = imp.linkSymbolsToThreads([{ col: 0, row: 0, isEmpty: true }], key([]));
    expect(out[0].thread).toBeNull();
  });
});

/* ── duplicate renderings ─────────────────────────────────────────────────── */

describe('findAlternateRenderings', () => {
  const grid = { originX: 74, originY: 208, cellWidth: 4.3, cellHeight: 4.3, columns: 104, rows: 97 };
  const filled = (colours, dx) => colours.map((c, i) => rect(80 + (dx || 0) + i * 5, 220, 4, 4, c));

  it('recognises a colour chart and its black-and-white twin', () => {
    // PAT1968_2: 9 colours painted inside the colour chart, 3 inside the twin.
    const colour = { pageIndex: 1, grid, rawPage: page([], filled([[1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 4], [5, 5, 5], [6, 6, 6]])) };
    // The twin draws black symbols in the same cells the colour chart paints.
    const mono = { pageIndex: 2, grid: Object.assign({}, grid, { rows: 101, originX: 85 }), rawPage: page([], filled([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [255, 255, 255]], 11)) };
    const out = imp.findAlternateRenderings([colour, mono]);
    expect(out.keep).toBe(colour);
    expect(out.dropped).toEqual([2]);
  });

  it('leaves a plain tile alone even when it paints few colours', () => {
    // A page that is mostly sky paints two or three colours, like a symbol
    // chart would — but in different places from its detailed neighbour.
    const detailed = { pageIndex: 1, grid, rawPage: page([], filled([[1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 4], [5, 5, 5], [6, 6, 6]])) };
    const sky = { pageIndex: 2, grid, rawPage: page([], [rect(300, 500, 4, 4, [120, 170, 220]), rect(340, 560, 4, 4, [120, 170, 220])]) };
    expect(imp.findAlternateRenderings([detailed, sky])).toBeNull();
  });

  it('leaves genuine tiles alone', () => {
    // gen1's tiles are rendered alike; none is markedly richer.
    const a = { pageIndex: 1, grid, rawPage: page([], filled([[0, 0, 0]])) };
    const b = { pageIndex: 2, grid, rawPage: page([], filled([[0, 0, 0]])) };
    expect(imp.findAlternateRenderings([a, b])).toBeNull();
  });

  it('leaves pages with different grids alone', () => {
    const rich = filled([[1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 4], [5, 5, 5]]);
    const a = { pageIndex: 1, grid, rawPage: page([], rich) };
    const b = { pageIndex: 2, grid: Object.assign({}, grid, { columns: 40 }), rawPage: page([], filled([[0, 0, 0]])) };
    expect(imp.findAlternateRenderings([a, b])).toBeNull();
  });
});

/* ── vector walker ───────────────────────────────────────────────────────── */

describe('extractVectorPaths — painting operators', () => {
  const vp = { convertToViewportPoint: (x, y) => [x, y] };
  const list = (entries) => ({ fnArray: entries.map(e => e[0]), argsArray: entries.map(e => e[1] || null) });

  it('does not paint a clipping path closed with endPath', () => {
    // "re W n" followed by a fill of something else: the clip rectangle used to
    // pick up that fill and become a page-sized painted shape.
    const paths = imp.extractVectorPaths(list([
      [OPS.constructPath, [[OPS.rectangle], [0, 0, 595, 842]]],
      [OPS.endPath],
      [OPS.setFillRGBColor, [0, 18, 150]],
      [OPS.constructPath, [[OPS.rectangle], [10, 10, 5, 5]]],
      [OPS.fill],
    ]), vp);
    expect(paths).toHaveLength(1);
    expect(paths[0].points[0]).toEqual({ x: 10, y: 10 });
  });

  it('fills and strokes with the combined operator', () => {
    const paths = imp.extractVectorPaths(list([
      [OPS.setFillRGBColor, [9, 8, 7]],
      [OPS.setStrokeRGBColor, [1, 2, 3]],
      [OPS.constructPath, [[OPS.rectangle], [0, 0, 5, 5]]],
      [OPS.fillStroke],
    ]), vp);
    expect(paths[0].fillColor).toEqual([9, 8, 7]);
    expect(paths[0].strokeColor).toEqual([1, 2, 3]);
  });
});

/* ── ruler anchoring ─────────────────────────────────────────────────────── */

describe('anchorGridToRuler', () => {
  const grid = { originX: 111.12, originY: 130.68, cellWidth: 7.08, cellHeight: 7.08, columns: 55, rows: 80 };
  // Labels printed with their LEFT edge near the column centre, as on gen-3 —
  // the offset that made a ruler-rebuilt grid sit half a cell out.
  const colLabels = [1, 10, 20, 30, 40, 50, 55].map(v => ({
    value: 56 + v - 1, x: grid.originX + (v - 0.5) * grid.cellWidth - 1, y: 120, width: 4, height: 3,
  }));
  const rowLabels = [1, 10, 20, 30, 40, 50, 60, 70, 80].map(v => ({
    value: v, x: 100, y: grid.originY + (v - 0.5) * grid.cellHeight + 1.5, width: 4, height: 3,
  }));
  const ruler = { pitchX: 7.06, pitchY: 7.09, colLabels, rowLabels };

  it('places the measured grid by its labels', () => {
    expect(imp.anchorGridToRuler(grid, ruler, 309, 467)).toEqual({ colStart: 55, rowStart: 0, columns: 55, rows: 80 });
  });

  it('declines when the measured pitch disagrees with the ruler', () => {
    expect(imp.anchorGridToRuler(Object.assign({}, grid, { cellWidth: 9.44 }), ruler, 309, 467)).toBeNull();
  });

  it('clips the grid to the design size', () => {
    expect(imp.anchorGridToRuler(grid, ruler, 100, 467).columns).toBe(45);
  });
});

/* ── report ───────────────────────────────────────────────────────────────── */

describe('buildImportReport', () => {
  it('summarises how the import was read', () => {
    const r = imp.buildImportReport(
      { layoutSource: 'axis-rulers', tiling: { across: 6, down: 6 } },
      { entries: [{ threadCode: '310', swatchRgb: [5, 5, 5] }], matchReport: { symbol: 5, swatch: 7, nearest: 0, catalogue: 0, unresolved: 0 } },
      10, 10, 12, 1);
    expect(r).toEqual(expect.objectContaining({ layout: 'axis-rulers', keyEntries: 1, stitches: 12 }));
    expect(r.warnings).toEqual([]);
  });

  it('warns when no key was found', () => {
    const r = imp.buildImportReport({}, { entries: [], matchReport: {} }, 1, 1, 1, 1);
    expect(r.warnings.join(' ')).toMatch(/No colour key/);
  });

  it('names unresolved symbols', () => {
    const r = imp.buildImportReport({}, {
      entries: [{ threadCode: '310' }],
      matchReport: { unresolved: 4, unresolvedSymbols: { q: 4 } },
    }, 1, 1, 10, 1);
    expect(r.warnings.join(' ')).toMatch(/4 stitches use a symbol missing from the key \(q\)/);
  });

  it('carries layout warnings through', () => {
    const r = imp.buildImportReport({ warnings: ['Pages 2 repeat page 1'] }, { entries: [{ threadCode: '1' }] }, 1, 1, 1, 1);
    expect(r.warnings).toContain('Pages 2 repeat page 1');
  });
});

describe('backstitchThreadFor', () => {
  const bsKey = [{ threadCode: 'B5200', lineRgb: [218, 221, 217] }, { threadCode: 'D225', lineRgb: [237, 192, 181] }];

  it('matches a chart stroke to the nearest key sample', () => {
    // The key draws B5200 light grey so it shows on paper; the chart, white.
    expect(imp.backstitchThreadFor([255, 255, 255], bsKey)).toBe('B5200');
    expect(imp.backstitchThreadFor([236, 191, 181], bsKey)).toBe('D225');
  });

  it('declines a colour nowhere near the key', () => {
    expect(imp.backstitchThreadFor([0, 16, 159], bsKey)).toBeNull();
  });
});

describe('extractSymbols — paint order', () => {
  it('lets a colour painted over the whole cell win over what lies beneath', async () => {
    // A large shape of colour A, then colour B painted into one of its cells.
    const p = page([], [rect(100, 100, 40, 10, [10, 10, 10]), rect(120, 100, 10, 10, [200, 200, 0])]);
    const syms = await imp.extractSymbols([p], gridLayout(4, 1, 10), null);
    expect(cellAt(syms, 2, 0).fillColor).toEqual([200, 200, 0]);
    expect(cellAt(syms, 1, 0).fillColor).toEqual([10, 10, 10]);
  });
});

/* ── stated facts and validation ─────────────────────────────────────────── */

describe('readStatedFacts', () => {
  const pg = (...strs) => page(strs.map((s, i) => text(s, 50, 50 + i * 10)));

  it('reads KG-Chart\'s stitch count, finished size, fabric and colours', () => {
    const f = imp.readStatedFacts([pg('Stitch Count: 309w x 467h', 'Finished Size: 112.12 cm x 169.45 cm (14 ct./inch)', '# of colors: 102 Colors')]);
    expect(f.stitches).toEqual({ w: 309, h: 467 });
    expect(f.fabricCount).toBe(14);
    expect(f.colours).toBe(102);
  });

  it('reads the compact "256W x 450H" form', () => {
    expect(imp.readStatedFacts([pg('256W x 450H')]).stitches).toEqual({ w: 256, h: 450 });
  });

  it('reads DMC\'s physical size and per-centimetre fabric count', () => {
    const f = imp.readStatedFacts([pg('design size / dimensions dessin 14 x 13 cm / 5.51 x 5.11 in', 'aida 5,5 pts/cm')]);
    expect(f.physicalCm).toEqual({ w: 14, h: 13 });
    expect(f.fabricCount).toBe(14);
  });

  it('returns nothing when the PDF states nothing', () => {
    expect(imp.readStatedFacts([pg('Alizarin', 'Black')])).toEqual({});
  });
});

describe('validateAgainstStated', () => {
  it('passes an import that matches its stated size exactly', () => {
    const v = imp.validateAgainstStated({ stitches: { w: 309, h: 467 } }, { w: 309, h: 467 });
    expect(v.checks[0].ok).toBe(true);
    expect(v.warnings).toEqual([]);
  });

  it('flags a stitch count that is off by even one row', () => {
    // gen1 states 256 x 450 and once imported 256 x 449.
    const v = imp.validateAgainstStated({ stitches: { w: 256, h: 450 } }, { w: 256, h: 449 });
    expect(v.checks[0].ok).toBe(false);
    expect(v.warnings[0]).toMatch(/256 x 450.*256 x 449/);
  });

  it('allows a rounded physical size its slack', () => {
    // PAT2171_2: "14 x 13 cm" at 14 count for a design of 73 x 72.
    const v = imp.validateAgainstStated({ physicalCm: { w: 14, h: 13 }, fabricCount: 14 }, { w: 73, h: 72 });
    expect(v.checks[0].ok).toBe(true);
  });

  it('flags a physical size well away from the import', () => {
    const v = imp.validateAgainstStated({ physicalCm: { w: 14, h: 13 }, fabricCount: 14 }, { w: 150, h: 72 });
    expect(v.checks[0].ok).toBe(false);
  });

  it('compares per-thread counts printed in the key', () => {
    const v = imp.validateAgainstStated({}, { w: 1, h: 1, keyCounts: [
      { code: '310', stated: 10511, imported: 10511 }, { code: 'blanc', stated: 3121, imported: 368 },
    ] });
    expect(v.checks[0].ok).toBe(false);
    expect(v.warnings[0]).toMatch(/1 of 2 threads differ.*blanc: key 3121, imported 368/);
  });
});

describe('anchorGridToRuler — label styles', () => {
  // gen1 prints its labels ON the ruled line that ends the labelled cell,
  // with row numbers rotated to read upwards.
  const grid = { originX: 45.96, originY: 45.96, cellWidth: 6.12, cellHeight: 6.12, columns: 86, rows: 108 };
  const ruler = {
    pitchX: 6.12, pitchY: 6.12,
    colLabels: [10, 20, 30, 40, 50, 60, 70, 80].map(v => ({ value: v, x: grid.originX + v * 6.12 - 4.2, y: 40, width: 8, height: 6 })),
    // Rows 343..450: label N on the line ending page row (N - 342).
    rowLabels: [350, 360, 370, 380, 390, 400, 410, 420, 430, 440, 450].map(v => ({
      value: v, x: 30, y: grid.originY + (v - 342) * 6.12 + 6.8, width: 13.3, height: 8, rotated: true,
    })),
  };

  it('reads labels that sit on lines, not cells', () => {
    const a = imp.anchorGridToRuler(grid, ruler, 256, 459);
    expect(a.rowStart).toBe(342);          // first row 343
    expect(a.rows).toBe(108);              // ending at 450, as the PDF states
    expect(a.colStart).toBe(0);
  });
});

describe('readTitleAndDesigner', () => {
  const page = (items) => ({ pageIndex: 1, textItems: items.map(([str, height, y, x]) => ({ str, height, y: y || 0, x: x || 0 })) });

  it('takes the largest heading, without page numbers or copyright lines', () => {
    const r = imp.readTitleAndDesigner([page([['Gen 3 Extended', 14, 20], ['Copyright (C) 2021 Shadow__Nova', 9, 40], ['1 / 38', 9, 40]])]);
    expect(r).toEqual({ title: 'Gen 3 Extended', designer: 'Shadow__Nova' });
  });

  it('keeps a title printed in two languages, and drops "Cross Stitch Pattern"', () => {
    expect(imp.readTitleAndDesigner([page([['moonlight', 17, 20, 10], ['fleurs lunaires', 17, 40, 10], ['www.dmc.com © 2023', 7, 700]])]))
      .toEqual({ title: 'moonlight / fleurs lunaires', designer: 'DMC' });
    expect(imp.readTitleAndDesigner([page([['Books and Blossoms Cross Stitch Pattern', 14, 20], ['©2026 Copyright littlethingsbyjoe', 8, 700]])]))
      .toEqual({ title: 'Books and Blossoms', designer: 'littlethingsbyjoe' });
  });

  it('prefers a "designed by" credit to a copyright line', () => {
    const r = imp.readTitleAndDesigner([page([['Winter Fox', 18, 10], ['© 2024 Stitch Co. All rights reserved', 7, 700], ['Designed by Ana Ruiz', 9, 600]])]);
    expect(r.designer).toBe('Ana Ruiz');
  });

  it('finds no title in small text, and uses the document Author only as a last resort', () => {
    expect(imp.readTitleAndDesigner([page([['Page: 1', 8], ['10', 8], ['Legend', 8]])], { Author: 'Gyureksz' }))
      .toEqual({ designer: 'Gyureksz' });
    expect(imp.readTitleAndDesigner([page([['Legend', 8]])], { Author: 'Administrator' })).toEqual({});
  });
});
