/* tests/import/pdfChartSegmentation.test.js — telling charts apart from the
 * other pages in a PDF, and keeping a page's grid on the chart itself.
 *
 * Two failures motivated this, both measured on TestUploads:
 *
 *   gen1.pdf — its colour key carries 531 rectangles (swatches) and 1059 text
 *   items, clearing the line- and text-count thresholds that marked a page as a
 *   chart. The key was imported as a 13th chart page and, because it never
 *   reached parseLegend, the pattern imported with NO colour key at all.
 *
 *   PAT2171_2.pdf — its chart ends at y=577 but footer rules near y=739 are
 *   internally regular too, so the grid bounds spanned the gap between them and
 *   reported 131 rows instead of 98.
 */

const fs = require('fs');
const path = require('path');

const OPS = {
  save: 10, restore: 11, transform: 12,
  moveTo: 13, lineTo: 14, rectangle: 19, closePath: 18, curveTo: 15,
  stroke: 20, fill: 22, eoFill: 23, fillStroke: 24, endPath: 28,
  setFillRGBColor: 61, setStrokeRGBColor: 60, constructPath: 91,
};

function loadImporterClass() {
  const raw = fs.readFileSync(path.resolve(__dirname, '..', '..', 'pdf-importer.js'), 'utf8');
  global.pdfjsLib = { OPS, GlobalWorkerOptions: { workerSrc: '' } };
  // The classifier consults the axis-label reader when it is present. Expose it
  // the same way the browser does, so these tests exercise the real path.
  global.PdfAxisLabels = require(path.resolve(__dirname, '..', '..', 'pdf-axis-labels.js'));
  // eslint-disable-next-line no-eval
  eval(raw + '\nthis.PatternKeeperImporter = PatternKeeperImporter;');
  return this.PatternKeeperImporter;
}

const PatternKeeperImporter = loadImporterClass();
const imp = new PatternKeeperImporter();

/* A page whose grid is drawn as stroked lines, with optional symbols. */
function gridPage(opts) {
  const o = Object.assign({
    pageIndex: 1, cols: 40, rows: 40, pitch: 8, originX: 50, originY: 50,
    symbols: false, extraTexts: [], rulers: false, extraLines: [],
  }, opts);
  const vectorPaths = [];
  for (let c = 0; c <= o.cols; c++) {
    const x = o.originX + c * o.pitch;
    vectorPaths.push({
      type: 'line', lineWidth: 1,
      points: [{ x, y: o.originY }, { x, y: o.originY + o.rows * o.pitch }],
    });
  }
  for (let r = 0; r <= o.rows; r++) {
    const y = o.originY + r * o.pitch;
    vectorPaths.push({
      type: 'line', lineWidth: 1,
      points: [{ x: o.originX, y }, { x: o.originX + o.cols * o.pitch, y }],
    });
  }
  for (const l of o.extraLines) vectorPaths.push(l);

  const textItems = [];
  if (o.symbols) {
    for (let r = 0; r < o.rows; r++) {
      for (let c = 0; c < o.cols; c++) {
        textItems.push({
          str: 'x', fontName: 'f1', width: o.pitch, height: o.pitch,
          x: o.originX + c * o.pitch + o.pitch / 2,
          y: o.originY + r * o.pitch + o.pitch / 2,
        });
      }
    }
  }
  if (o.rulers) {
    for (let c = 10; c <= o.cols; c += 10) {
      textItems.push({
        str: String(c), fontName: 'f2', width: 6, height: 6,
        x: o.originX + (c - 1) * o.pitch + o.pitch / 2, y: o.originY - 12,
      });
    }
    for (let r = 10; r <= o.rows; r += 10) {
      textItems.push({
        str: String(r), fontName: 'f2', width: 6, height: 6,
        x: o.originX - 14, y: o.originY + (r - 1) * o.pitch + o.pitch / 2,
      });
    }
  }
  for (const t of o.extraTexts) textItems.push(t);

  return {
    pageIndex: o.pageIndex, width: 612, height: 792,
    vectorPaths, textItems, fonts: [],
  };
}

/* A colour key: a column of swatch rectangles, each with a symbol and a code —
 * so plenty of rectangles and text, but only a couple of glyphs per row. */
function legendPage(pageIndex, rowCount) {
  const vectorPaths = [];
  const textItems = [];
  for (let i = 0; i < rowCount; i++) {
    const y = 100 + i * 10;
    // Swatch, plus a rule either side — rectangles mount up quickly.
    vectorPaths.push({ type: 'rect', lineWidth: 1, fillColor: [1, 2, 3], points: [
      { x: 60, y }, { x: 72, y }, { x: 72, y: y + 8 }, { x: 60, y: y + 8 },
    ] });
    vectorPaths.push({ type: 'rect', lineWidth: 1, points: [
      { x: 58, y: y - 1 }, { x: 540, y: y - 1 }, { x: 540, y: y + 9 }, { x: 58, y: y + 9 },
    ] });
    textItems.push({ str: 'A', fontName: 'f1', width: 6, height: 8, x: 80, y });
    textItems.push({ str: '310', fontName: 'f2', width: 14, height: 8, x: 95, y });
    textItems.push({ str: 'DMC black', fontName: 'f2', width: 60, height: 8, x: 120, y });
    // Padding text, so the page clears a raw "more than 1000 text items" test.
    for (let k = 0; k < 16; k++) {
      textItems.push({ str: 'use 2 strands', fontName: 'f2', width: 50, height: 8, x: 200 + k, y });
    }
  }
  return { pageIndex, width: 612, height: 792, vectorPaths, textItems, fonts: [] };
}

describe('symbolsLookGridded', () => {
  it('accepts a dense grid of symbols', () => {
    expect(imp.symbolsLookGridded(gridPage({ cols: 30, rows: 30, symbols: true }))).toBe(true);
  });

  it('rejects a colour key, whose rows hold one or two glyphs', () => {
    expect(imp.symbolsLookGridded(legendPage(1, 50))).toBe(false);
  });

  it('rejects a page with almost no symbols', () => {
    expect(imp.symbolsLookGridded({ textItems: [{ str: 'A', x: 1, y: 1 }] })).toBe(false);
    expect(imp.symbolsLookGridded({ textItems: [] })).toBe(false);
  });
});

describe('looksLikeChartGrid', () => {
  it('accepts a grid that is tens of cells in both directions', () => {
    expect(imp.looksLikeChartGrid(gridPage({ cols: 40, rows: 40 }))).toBe(true);
  });

  it('rejects a single band, as a materials list would be', () => {
    expect(imp.looksLikeChartGrid(gridPage({ cols: 40, rows: 1 }))).toBe(false);
  });

  it('rejects a narrow column, as a key would be', () => {
    expect(imp.looksLikeChartGrid(gridPage({ cols: 4, rows: 30 }))).toBe(false);
  });
});

describe('pageHasAxisRulers', () => {
  it('detects rulers printed on both edges', () => {
    expect(imp.pageHasAxisRulers(gridPage({ cols: 50, rows: 50, rulers: true }))).toBe(true);
  });

  it('is false for a page with no rulers', () => {
    expect(imp.pageHasAxisRulers(gridPage({ cols: 50, rows: 50 }))).toBe(false);
  });

  it('is false for a colour key', () => {
    expect(imp.pageHasAxisRulers(legendPage(1, 50))).toBe(false);
  });
});

describe('classifyPages', () => {
  it('classifies a colour key as a legend, not a chart', () => {
    // The gen1 failure: enough rectangles and text to clear the chart
    // thresholds, but it is a key and must reach parseLegend.
    const key = legendPage(2, 50);
    const out = imp.classifyPages([gridPage({ pageIndex: 1, cols: 40, rows: 40, symbols: true }), key]);
    expect(out.chartPages.map(p => p.pageIndex)).toEqual([1]);
    expect(out.legendPages.map(p => p.pageIndex)).toEqual([2]);
  });

  it('treats a page with axis rulers as a chart', () => {
    const out = imp.classifyPages([gridPage({ pageIndex: 1, cols: 50, rows: 50, rulers: true })]);
    expect(out.chartPages).toHaveLength(1);
  });

  it('still accepts a chart whose cells are drawn as paths, not text', () => {
    // The PAT1968_2 case: thousands of ruled lines plus a filled rectangle per
    // cell, and almost no text. Classification must still call this a chart.
    const page = gridPage({ pageIndex: 1, cols: 60, rows: 60, pitch: 8, originX: 50, originY: 50 });
    for (let r = 0; r < 60; r++) {
      for (let c = 0; c < 60; c++) {
        const x = 50 + c * 8, y = 50 + r * 8;
        // Cell-sized fills: detectGrid ignores these for clustering, so the
        // grid still comes from the ruled lines.
        page.vectorPaths.push({ type: 'rect', lineWidth: 1, fillColor: [9, 9, 9], points: [
          { x, y }, { x: x + 8, y }, { x: x + 8, y: y + 8 }, { x, y: y + 8 },
        ] });
      }
    }
    const out = imp.classifyPages([page]);
    expect(out.chartPages).toHaveLength(1);
  });

  it('does not take a dense grid of symbols for a legend', () => {
    const out = imp.classifyPages([gridPage({ pageIndex: 1, cols: 30, rows: 30, symbols: true })]);
    expect(out.chartPages).toHaveLength(1);
    expect(out.legendPages).toHaveLength(0);
  });
});

describe('detectGrid — keeping the grid on the chart', () => {
  it('does not stretch across a gap to reach footer rules', () => {
    // A 40x40 chart at pitch 8, plus a block of regularly spaced footer rules
    // far below it. Both blocks are internally regular, so both survive the
    // in-band filter; only the chart should set the bounds.
    const footer = [];
    for (let i = 0; i < 6; i++) {
      const y = 700 + i * 8;
      footer.push({ type: 'line', lineWidth: 1, points: [{ x: 50, y }, { x: 400, y }] });
    }
    const page = gridPage({ cols: 40, rows: 40, pitch: 8, originX: 50, originY: 50, extraLines: footer });
    const grid = imp.detectGrid(page);
    expect(grid.cellHeight).toBeCloseTo(8, 1);
    expect(grid.rows).toBe(40);
    // 50 + 40*8 = 370. Spanning to the footer would give roughly 80 rows.
    expect(grid.originY + grid.rows * grid.cellHeight).toBeLessThan(400);
  });

  it('picks the larger block when a page holds two charts', () => {
    // A cross-stitch chart above a smaller backstitch chart: the dominant block
    // wins rather than the pair being merged into one oversized grid.
    const second = [];
    for (let c = 0; c <= 10; c++) {
      const x = 50 + c * 8;
      second.push({ type: 'line', lineWidth: 1, points: [{ x, y: 500 }, { x, y: 580 }] });
    }
    for (let r = 0; r <= 10; r++) {
      const y = 500 + r * 8;
      second.push({ type: 'line', lineWidth: 1, points: [{ x: 50, y }, { x: 130, y }] });
    }
    const page = gridPage({ cols: 40, rows: 40, pitch: 8, originX: 50, originY: 50, extraLines: second });
    const grid = imp.detectGrid(page);
    expect(grid.rows).toBe(40);
    expect(grid.originY).toBeCloseTo(50, 0);
  });

  it('still tolerates a missing grid line inside the chart', () => {
    // Runs break only on a large gap, so one absent line must not truncate the
    // chart — the behaviour the previous span-based bounds protected.
    const page = gridPage({ cols: 40, rows: 40, pitch: 8, originX: 50, originY: 50 });
    // Drop one interior horizontal line.
    const victim = page.vectorPaths.findIndex(
      p => p.points[0].y === 50 + 20 * 8 && p.points[0].x === 50 && p.points[1].x > 100);
    page.vectorPaths.splice(victim, 1);
    const grid = imp.detectGrid(page);
    expect(grid.rows).toBe(40);
  });
});
