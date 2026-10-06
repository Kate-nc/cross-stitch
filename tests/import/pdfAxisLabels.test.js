/* tests/import/pdfAxisLabels.test.js — axis-ruler reading and page placement.
 *
 * The synthetic cases pin the behaviour; the fixture-derived cases at the bottom
 * lock in the numbers measured from the real PDFs in TestUploads/, so a
 * regression in ruler reading shows up as a changed tiling rather than as a
 * silently misassembled chart.
 */

const path = require('path');
const AX = require(path.resolve(__dirname, '..', '..', 'pdf-axis-labels.js'));

/* Build a page of text items representing a chart page whose rulers run in
 * absolute design coordinates.
 *   firstCol/firstRow — the absolute cell at the page's top-left
 *   cols/rows         — how many cells the page covers
 *   interval          — label every Nth cell
 *   pitch             — points per cell
 *   originX/originY   — where the page's grid starts on the sheet
 *   labelEnds         — also label the page's own first and last cell
 */
function makePage(opts) {
  const o = Object.assign({
    firstCol: 1, firstRow: 1, cols: 50, rows: 70, interval: 10,
    pitch: 8, originX: 40, originY: 30, labelEnds: false,
    rulerY: 20, rulerX: 25,
  }, opts);
  const items = [];
  const xOf = (col) => o.originX + (col - o.firstCol) * o.pitch + o.pitch / 2;
  const yOf = (row) => o.originY + (row - o.firstRow) * o.pitch + o.pitch / 2;

  const colLabels = [];
  for (let c = o.firstCol; c <= o.firstCol + o.cols - 1; c++) {
    if (c % o.interval === 0) colLabels.push(c);
  }
  if (o.labelEnds) {
    colLabels.unshift(o.firstCol);
    colLabels.push(o.firstCol + o.cols - 1);
  }
  for (const c of [...new Set(colLabels)].sort((a, b) => a - b)) {
    items.push({ str: String(c), x: xOf(c), y: o.rulerY });
  }

  const rowLabels = [];
  for (let r = o.firstRow; r <= o.firstRow + o.rows - 1; r++) {
    if (r % o.interval === 0) rowLabels.push(r);
  }
  if (o.labelEnds) {
    rowLabels.unshift(o.firstRow);
    rowLabels.push(o.firstRow + o.rows - 1);
  }
  for (const r of [...new Set(rowLabels)].sort((a, b) => a - b)) {
    items.push({ str: String(r), x: o.rulerX, y: yOf(r) });
  }

  // A few chart symbols, so the page is not purely rulers.
  for (let i = 0; i < 5; i++) {
    items.push({ str: 'x', x: xOf(o.firstCol + i), y: yOf(o.firstRow + i) });
  }
  return { pageIndex: o.pageIndex || 1, textItems: items, _opts: o };
}

describe('fitRuler', () => {
  it('fits a clean ruler and recovers the pitch', () => {
    const values = [10, 20, 30, 40, 50];
    const positions = [100, 160, 220, 280, 340]; // 6 points per cell
    const fit = AX._fitRuler(values, positions);
    expect(fit).not.toBeNull();
    expect(fit.pitch).toBeCloseTo(6, 5);
    // value at position 0
    expect(fit.base).toBeCloseTo(10 - 100 / 6, 5);
  });

  it('rejects a run that is not linear', () => {
    const values = [1, 2, 3, 99];
    const positions = [0, 10, 20, 30];
    expect(AX._fitRuler(values, positions)).toBeNull();
  });

  it('rejects a run shorter than the minimum', () => {
    expect(AX._fitRuler([1, 2, 3], [0, 10, 20])).toBeNull();
  });

  it('rejects a descending run', () => {
    // findRuns filters these, but fitRuler must not accept a negative slope either.
    expect(AX._fitRuler([40, 30, 20, 10], [0, 10, 20, 30])).toBeNull();
  });
});

describe('findRuns', () => {
  it('groups labels sharing a baseline and ignores short groups', () => {
    const items = [
      { str: '10', x: 10, y: 5 }, { str: '20', x: 20, y: 5 },
      { str: '30', x: 30, y: 5 }, { str: '40', x: 40, y: 5 },
      { str: '7', x: 10, y: 99 }, { str: '8', x: 20, y: 99 }, // only 2 — dropped
    ];
    const runs = AX._findRuns(items, i => i.y, i => i.x);
    expect(runs).toHaveLength(1);
    expect(runs[0].values).toEqual([10, 20, 30, 40]);
  });

  it('ignores values that are not bare positive integers', () => {
    const items = [
      { str: '10', x: 10, y: 5 }, { str: '0020', x: 20, y: 5 },
      { str: '30a', x: 30, y: 5 }, { str: '4.5', x: 40, y: 5 },
      { str: '50', x: 50, y: 5 },
    ];
    const runs = AX._findRuns(items, i => i.y, i => i.x);
    expect(runs).toHaveLength(0); // only 10 and 50 survive — under MIN_RUN
  });
});

describe('readPageRulers', () => {
  it('reads both axes from a page labelling its own extremes', () => {
    const p = makePage({ firstCol: 56, firstRow: 1, cols: 55, rows: 80, labelEnds: true });
    const r = AX.readPageRulers(p.textItems, { yDown: true });
    expect(r).not.toBeNull();
    expect(r.firstLabelCol).toBe(56);
    expect(r.lastLabelCol).toBe(110);
    expect(r.h.pitch).toBeCloseTo(8, 3);
  });

  it('returns null when only one axis has a ruler', () => {
    const p = makePage({});
    const colsOnly = p.textItems.filter(i => i.y === 20 || i.str === 'x');
    expect(AX.readPageRulers(colsOnly, { yDown: true })).toBeNull();
  });

  it('returns null for a page with no numeric labels', () => {
    expect(AX.readPageRulers([{ str: 'a', x: 1, y: 1 }], { yDown: true })).toBeNull();
  });

  it('handles PDF user space, where row numbers descend in y', () => {
    const p = makePage({ firstCol: 1, firstRow: 1, labelEnds: true });
    // Flip y to emulate bottom-up user space.
    const flipped = p.textItems.map(i => ({ str: i.str, x: i.x, y: 800 - i.y }));
    const r = AX.readPageRulers(flipped, { yDown: false });
    expect(r).not.toBeNull();
    expect(r.firstLabelRow).toBe(1);
  });
});

describe('readLayout', () => {
  it('places a 2x2 tiling and reports the finished size', () => {
    const pages = [
      makePage({ pageIndex: 1, firstCol: 1, firstRow: 1, cols: 50, rows: 70, labelEnds: true }),
      makePage({ pageIndex: 2, firstCol: 51, firstRow: 1, cols: 50, rows: 70, labelEnds: true }),
      makePage({ pageIndex: 3, firstCol: 1, firstRow: 71, cols: 50, rows: 70, labelEnds: true }),
      makePage({ pageIndex: 4, firstCol: 51, firstRow: 71, cols: 50, rows: 70, labelEnds: true }),
    ];
    const L = AX.readLayout(pages, { yDown: true });
    expect(L.tiling).toEqual({ across: 2, down: 2 });
    expect(L.totalColumns).toBe(100);
    expect(L.totalRows).toBe(140);
    expect(L.complete).toBe(true);
    expect(L.pages.every(p => p.offsets)).toBe(true);
  });

  it('groups pages of the same tile column together', () => {
    const pages = [
      makePage({ pageIndex: 1, firstCol: 1, firstRow: 1, labelEnds: true }),
      makePage({ pageIndex: 2, firstCol: 1, firstRow: 71, labelEnds: true }),
    ];
    const L = AX.readLayout(pages, { yDown: true });
    expect(L.tiling.across).toBe(1);
    expect(L.tiling.down).toBe(2);
    expect(L.pages[0].offsets.colGroup).toBe(L.pages[1].offsets.colGroup);
    expect(L.pages[0].offsets.rowGroup).not.toBe(L.pages[1].offsets.rowGroup);
  });

  it('places a remainder page laid out at a different sheet position', () => {
    // The short last column is often not left-aligned with the full-width pages.
    // Placement must come from the page's own ruler, not a shared geometry.
    const full = makePage({ pageIndex: 1, firstCol: 1, cols: 55, rows: 80, originX: 40, labelEnds: true });
    const rem = makePage({ pageIndex: 2, firstCol: 56, cols: 20, rows: 80, originX: 200, labelEnds: true });
    const L = AX.readLayout([full, rem], { yDown: true });
    expect(L.tiling).toEqual({ across: 2, down: 1 });
    const o = L.pages[1].offsets;
    // Mapping the remainder page's own first cell back through its ruler must
    // land on absolute column 56.
    const xOfFirstCell = rem._opts.originX + rem._opts.pitch / 2;
    expect(Math.round(o.colBase + xOfFirstCell / o.pitchX)).toBe(56);
  });

  it('reports pages with no ruler as unplaced rather than guessing', () => {
    const pages = [
      makePage({ pageIndex: 1, firstCol: 1, labelEnds: true }),
      { pageIndex: 2, textItems: [{ str: 'Colour key', x: 10, y: 10 }] },
    ];
    const L = AX.readLayout(pages, { yDown: true });
    expect(L.pages[1].offsets).toBeNull();
    expect(L.complete).toBe(false);
    expect(L.warnings.join(' ')).toMatch(/no readable ruler/);
  });

  it('returns no tiling when nothing can be read', () => {
    const L = AX.readLayout([{ pageIndex: 1, textItems: [] }], { yDown: true });
    expect(L.tiling).toBeNull();
    expect(L.totalColumns).toBe(0);
    expect(L.complete).toBe(false);
  });

  it('warns when the rulers describe more tiles than there are pages', () => {
    // Three pages whose rulers imply a 2x2 grid — one tile is missing.
    const pages = [
      makePage({ pageIndex: 1, firstCol: 1, firstRow: 1, labelEnds: true }),
      makePage({ pageIndex: 2, firstCol: 51, firstRow: 1, labelEnds: true }),
      makePage({ pageIndex: 3, firstCol: 1, firstRow: 71, labelEnds: true }),
    ];
    const L = AX.readLayout(pages, { yDown: true });
    expect(L.tiling).toEqual({ across: 2, down: 2 });
    expect(L.complete).toBe(false);
    expect(L.warnings.join(' ')).toMatch(/describe an 2x2 grid|2x2 grid/);
  });

  it('reads rulers that only label multiples, never the page first column', () => {
    // gen1.pdf's shape: page starts at column 1 but the ruler's lowest label is
    // 10. The affine map must still place cells correctly.
    const p = makePage({ pageIndex: 1, firstCol: 1, cols: 86, rows: 113, interval: 10, labelEnds: false });
    const r = AX.readPageRulers(p.textItems, { yDown: true });
    expect(r).not.toBeNull();
    expect(r.firstLabelCol).toBe(10);
    // The page's first cell still maps to column 1.
    const xOfFirstCell = p._opts.originX + p._opts.pitch / 2;
    expect(Math.round(r.h.base + xOfFirstCell / r.h.pitch)).toBe(1);
  });
});

describe('modalStride', () => {
  it('takes the most common gap, ignoring irregular end labels', () => {
    // A ruler printing its own first and last cell around the round numbers:
    // 1, 10, 20, 30, 40, 50, 55 — gaps are 9,10,10,10,10,5 so the stride is 10.
    expect(AX._modalStride([[1, 10, 20, 30, 40, 50, 55]])).toBe(10);
  });

  it('pools gaps across several rulers', () => {
    expect(AX._modalStride([[10, 20, 30], [40, 50, 60], [5, 6]])).toBe(10);
  });

  it('returns 0 when there is nothing to measure', () => {
    expect(AX._modalStride([])).toBe(0);
    expect(AX._modalStride([[7]])).toBe(0);
  });
});

describe('finished-size bounds', () => {
  it('treats the last label as exact when it is not on the stride', () => {
    // gen-3's shape: the ruler names column 309 explicitly, so 309 is the width.
    const pages = [
      makePage({ pageIndex: 1, firstCol: 1, cols: 55, rows: 80, labelEnds: true }),
      makePage({ pageIndex: 2, firstCol: 56, cols: 54, rows: 80, labelEnds: true }),
    ];
    const L = AX.readLayout(pages, { yDown: true });
    expect(L.totalColumns).toBe(109);
    expect(L.strideCol).toBe(10);
    // 109 is not a multiple of 10, so no trailing cells are assumed.
    expect(L.totalColumnsMax).toBe(109);
  });

  it('allows trailing cells when the last label sits on the stride', () => {
    // gen1's shape: the ruler stops at a round number, so the design may run on.
    const pages = [
      makePage({ pageIndex: 1, firstCol: 1, cols: 86, rows: 113, labelEnds: false }),
      makePage({ pageIndex: 2, firstCol: 87, cols: 86, rows: 113, labelEnds: false }),
    ];
    const L = AX.readLayout(pages, { yDown: true });
    expect(L.totalColumns % L.strideCol).toBe(0);
    expect(L.totalColumnsMax).toBe(L.totalColumns + L.strideCol - 1);
  });
});

/* ── Fixture-derived regression constants ────────────────────────────────────
 * Measured from TestUploads/ with the probe harness. These assert the SHAPE the
 * reader derives, so a change in ruler handling is caught without committing
 * multi-megabyte PDFs to the test run.
 */
describe('fixture-derived expectations', () => {
  it('gen-3 (KG-Chart): 36 chart pages tile 6x6 into 309x467', () => {
    // Column groups observed: ruler origins 55 cells apart for the five full
    // columns, with a sixth remainder column; row groups 80 apart.
    const pages = [];
    let idx = 1;
    const colFirsts = [1, 56, 111, 166, 221, 276];
    const colWidths = [55, 55, 55, 55, 55, 34];
    const rowFirsts = [1, 81, 161, 241, 321, 401];
    const rowHeights = [80, 80, 80, 80, 80, 67];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        pages.push(makePage({
          pageIndex: idx++,
          firstCol: colFirsts[c], cols: colWidths[c],
          firstRow: rowFirsts[r], rows: rowHeights[r],
          // remainder column sits elsewhere on the sheet, as in the real file
          originX: c === 5 ? 200 : 40,
          labelEnds: true,
        }));
      }
    }
    const L = AX.readLayout(pages, { yDown: true });
    expect(L.tiling).toEqual({ across: 6, down: 6 });
    expect(L.totalColumns).toBe(309);
    expect(L.totalRows).toBe(467);
    expect(L.complete).toBe(true);
  });

  it('gen1 (Nitro Pro): 12 chart pages tile 3x4', () => {
    const pages = [];
    let idx = 1;
    const colFirsts = [1, 87, 173];
    const rowFirsts = [1, 114, 228, 342];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        pages.push(makePage({
          pageIndex: idx++,
          firstCol: colFirsts[c], cols: 86,
          firstRow: rowFirsts[r], rows: 113,
          interval: 10, labelEnds: false, pitch: 6.12,
        }));
      }
    }
    const L = AX.readLayout(pages, { yDown: true });
    expect(L.tiling).toEqual({ across: 3, down: 4 });
    expect(L.pages.every(p => p.offsets)).toBe(true);
  });
});
