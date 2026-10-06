/* tests/import/pdfBackstitch.test.js — importing backstitch outlines.
 *
 * Backstitch is stitched over the grid rather than inside cells, so cell
 * sampling never saw it and bsLines was always empty — patterns imported with
 * their outlines missing.
 *
 * It is told apart from the rest of a page's line work by the pen: a chart is
 * ruled, and its symbols drawn, in one ink, while backstitch is drawn in thread
 * colours and with a heavier pen. On PAT2171_2 that splits 1448 stroked
 * segments into 1394 in the ink [44,46,53] and 52 in the two colours its key
 * lists for backstitch, B5200 (white) and D225 (pink).
 */

const fs = require('fs');
const path = require('path');

function loadImporterClass() {
  const raw = fs.readFileSync(path.resolve(__dirname, '..', '..', 'pdf-importer.js'), 'utf8');
  global.pdfjsLib = { OPS: new Proxy({}, { get: () => -1 }), GlobalWorkerOptions: { workerSrc: '' } };
  // eslint-disable-next-line no-eval
  eval(raw + '\nthis.PatternKeeperImporter = PatternKeeperImporter;');
  return this.PatternKeeperImporter;
}

const PatternKeeperImporter = loadImporterClass();
const imp = new PatternKeeperImporter();

const grid = {
  originX: 100, originY: 100, cellWidth: 10, cellHeight: 10,
  columns: 20, rows: 20, boldLineInterval: 10,
};
const INK = [44, 46, 53];
const THREAD = [236, 191, 181];

// A point on the lattice: corner (cx, cy) of the grid.
const at = (cx, cy) => ({ x: grid.originX + cx * grid.cellWidth, y: grid.originY + cy * grid.cellHeight });

function seg(c1, r1, c2, r2, colour, lineWidth) {
  return {
    type: 'line', stroked: true, lineWidth: lineWidth === undefined ? 1 : lineWidth,
    strokeColor: colour, points: [at(c1, r1), at(c2, r2)],
  };
}

/* The ink segments a chart always carries: rules spanning the grid, and short
 * marks inside cells that draw the symbols. */
function inkFurniture() {
  const paths = [];
  for (let c = 0; c <= 20; c++) paths.push(seg(c, 0, c, 20, INK, 1));
  for (let r = 0; r <= 20; r++) paths.push(seg(0, r, 20, r, INK, 1));
  // Symbol strokes: a fifth of a cell long, well inside cells.
  for (let i = 0; i < 40; i++) {
    const x = grid.originX + 5 + i, y = grid.originY + 5 + i;
    paths.push({ type: 'line', stroked: true, lineWidth: 1, strokeColor: INK,
      points: [{ x, y }, { x: x + 2, y: y + 2 }] });
  }
  return paths;
}

function page(extra) {
  return { pageIndex: 1, width: 612, height: 792, textItems: [], fonts: [],
           vectorPaths: inkFurniture().concat(extra || []) };
}

describe('extractBackstitch', () => {
  it('finds thread-coloured outline stitches', () => {
    const out = imp.extractBackstitch(page([
      seg(2, 2, 5, 2, THREAD, 1.6),
      seg(5, 2, 7, 5, THREAD, 1.6),
    ]), grid);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(expect.objectContaining({ x1: 2, y1: 2, x2: 5, y2: 2 }));
    expect(out[0].rgb).toEqual(THREAD);
  });

  it('ignores the grid rules', () => {
    expect(imp.extractBackstitch(page([]), grid)).toHaveLength(0);
  });

  it('ignores the short marks that draw cell symbols', () => {
    // Already present in the furniture; adding more must not produce lines.
    const marks = [];
    for (let i = 0; i < 20; i++) {
      const x = grid.originX + 30 + i, y = grid.originY + 30;
      marks.push({ type: 'line', stroked: true, lineWidth: 1, strokeColor: THREAD,
        points: [{ x, y }, { x: x + 2, y: y + 1 }] });
    }
    expect(imp.extractBackstitch(page(marks), grid)).toHaveLength(0);
  });

  it('finds backstitch drawn in the chart ink when the pen is heavier', () => {
    // Charts that outline in black: colour cannot separate it, pen width can.
    const out = imp.extractBackstitch(page([seg(3, 3, 6, 3, INK, 2.5)]), grid);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(expect.objectContaining({ x1: 3, y1: 3, x2: 6, y2: 3 }));
  });

  it('keeps diagonal stitches', () => {
    const out = imp.extractBackstitch(page([seg(4, 4, 6, 6, THREAD, 1.6)]), grid);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(expect.objectContaining({ x1: 4, y1: 4, x2: 6, y2: 6 }));
  });

  it('snaps endpoints to the lattice', () => {
    // Drawn a little off the corners, as rounded line caps leave them.
    const a = at(2, 3), b = at(5, 3);
    const out = imp.extractBackstitch(page([{
      type: 'line', stroked: true, lineWidth: 1.6, strokeColor: THREAD,
      points: [{ x: a.x + 1.2, y: a.y - 0.9 }, { x: b.x - 1.1, y: b.y + 1.3 }],
    }]), grid);
    expect(out[0]).toEqual(expect.objectContaining({ x1: 2, y1: 3, x2: 5, y2: 3 }));
  });

  it('deduplicates a stitch drawn twice, in either direction', () => {
    const out = imp.extractBackstitch(page([
      seg(2, 2, 5, 2, THREAD, 1.6),
      seg(2, 2, 5, 2, THREAD, 1.6),
      seg(5, 2, 2, 2, THREAD, 1.6),
    ]), grid);
    expect(out).toHaveLength(1);
  });

  it('drops segments that collapse to a point on the lattice', () => {
    const a = at(3, 3);
    const out = imp.extractBackstitch(page([{
      type: 'line', stroked: true, lineWidth: 2.5, strokeColor: THREAD,
      points: [{ x: a.x, y: a.y }, { x: a.x + 1, y: a.y + 1 }],
    }]), grid);
    expect(out).toHaveLength(0);
  });

  it('ignores line work outside the chart area', () => {
    const out = imp.extractBackstitch(page([{
      type: 'line', stroked: true, lineWidth: 2, strokeColor: THREAD,
      points: [{ x: 10, y: 700 }, { x: 60, y: 700 }],
    }]), grid);
    expect(out).toHaveLength(0);
  });

  it('ignores unstroked paths', () => {
    const out = imp.extractBackstitch(page([
      Object.assign(seg(2, 2, 5, 2, THREAD, 1.6), { stroked: false }),
    ]), grid);
    expect(out).toHaveLength(0);
  });

  it('returns nothing for a page with no grid', () => {
    expect(imp.extractBackstitch(page([]), null)).toEqual([]);
    expect(imp.extractBackstitch(page([]), { cellWidth: 0, cellHeight: 0 })).toEqual([]);
  });
});

describe('convertToPattern — backstitch', () => {
  const layout = (w, h) => ({ totalColumns: w, totalRows: h, pages: [] });
  const thread = { id: '310', rgb: [0, 0, 0], lab: [0, 0, 0], name: 'black' };

  function stitchBox(gridW, gridH, box) {
    const out = [];
    for (let r = 0; r < gridH; r++) {
      for (let c = 0; c < gridW; c++) {
        const inside = c >= box.c0 && c <= box.c1 && r >= box.r0 && r <= box.r1;
        out.push(inside
          ? { col: c, row: r, isEmpty: false, symbol: 'x', thread }
          : { col: c, row: r, isEmpty: true, symbol: '', thread: null });
      }
    }
    return out;
  }

  it('shifts backstitch by the same trim as the stitches', () => {
    const cells = stitchBox(40, 30, { c0: 5, c1: 14, r0: 6, r1: 12 });
    const bs = [{ x1: 5, y1: 6, x2: 10, y2: 6, rgb: [1, 2, 3] }];
    const project = imp.convertToPattern(layout(40, 30), cells, { entries: [] }, bs);
    expect(project.w).toBe(10);
    // The app draws a line in `color`; with no key entry there is no colorId.
    expect(project.bsLines).toEqual([{ x1: 0, y1: 0, x2: 5, y2: 0, color: '#010203' }]);
  });

  it('widens the trim to keep backstitch beyond the last cross stitch', () => {
    // An outline or caption can run past the crosses; trimming to the crosses
    // alone used to cut it off.
    const cells = stitchBox(40, 30, { c0: 5, c1: 14, r0: 6, r1: 12 });
    const bs = [{ x1: 0, y1: 20, x2: 3, y2: 20, rgb: [1, 2, 3] }];
    const project = imp.convertToPattern(layout(40, 30), cells, { entries: [] }, bs);
    expect(project.bsLines).toHaveLength(1);
    expect(project.w).toBe(15);          // columns 0..14
    expect(project.h).toBe(15);          // rows 6..20
    expect(project.bsLines[0]).toEqual(expect.objectContaining({ x1: 0, y1: 14, x2: 3, y2: 14 }));
  });

  it('tags each line with its key thread so the app can colour and export it', () => {
    const cells = stitchBox(10, 10, { c0: 0, c1: 9, r0: 0, r1: 9 });
    const legend = { entries: [{ kind: 'backstitch', threadCode: 'D225', lineRgb: [237, 192, 181] }] };
    const project = imp.convertToPattern(layout(10, 10), cells, legend,
      [{ x1: 1, y1: 1, x2: 3, y2: 1, rgb: [236, 191, 181] }]);
    expect(project.bsLines[0].colorId).toBe('D225');
    expect(project.bsLines[0].color).toBe('#ecbfb5');
  });

  it('drops a stroke that matches none of the key\'s backstitch threads', () => {
    // PAT1968_2's blue centre arrows sit on the grid edge; its key lists only
    // a gold backstitch.
    const cells = stitchBox(10, 10, { c0: 2, c1: 9, r0: 0, r1: 9 });
    const legend = { entries: [{ kind: 'backstitch', threadCode: '5310', lineRgb: [241, 206, 125] }] };
    const project = imp.convertToPattern(layout(10, 10), cells, legend,
      [{ x1: 0, y1: 4, x2: 1, y2: 4, rgb: [0, 16, 159] }]);
    expect(project.bsLines).toHaveLength(0);
    expect(project.w).toBe(8);           // not widened by the arrow
  });

  it('allows backstitch on the outer edge of the design', () => {
    const cells = stitchBox(10, 10, { c0: 0, c1: 9, r0: 0, r1: 9 });
    const bs = [{ x1: 0, y1: 0, x2: 10, y2: 0, rgb: null }];
    const project = imp.convertToPattern(layout(10, 10), cells, { entries: [] }, bs);
    expect(project.bsLines).toHaveLength(1);
  });

  it('defaults to no backstitch when none is passed', () => {
    const cells = stitchBox(6, 6, { c0: 0, c1: 5, r0: 0, r1: 5 });
    expect(imp.convertToPattern(layout(6, 6), cells, { entries: [] }).bsLines).toEqual([]);
  });
});

describe('extractBackstitch — line work variety', () => {
  const g = { originX: 100, originY: 100, cellWidth: 10, cellHeight: 10, columns: 20, rows: 20 };
  const pt = (c, r) => ({ x: g.originX + c * 10, y: g.originY + r * 10 });
  const rule = (c1, r1, c2, r2) => ({ type: 'line', stroked: true, lineWidth: 1, strokeColor: [44, 46, 53], points: [pt(c1, r1), pt(c2, r2)] });
  const rules = () => {
    const out = [];
    for (let i = 0; i <= 20; i++) { out.push(rule(i, 0, i, 20)); out.push(rule(0, i, 20, i)); }
    return out;
  };
  const pg = (extra) => ({ pageIndex: 1, textItems: [], fonts: [], vectorPaths: rules().concat(extra) });

  it('reads backstitch drawn as one polyline', () => {
    const out = imp.extractBackstitch(pg([{
      type: 'path', stroked: true, lineWidth: 1.6, strokeColor: [236, 191, 181],
      points: [pt(2, 2), pt(4, 2), pt(5, 4), pt(5, 6)],
    }]), g);
    expect(out).toHaveLength(3);
  });

  it('takes the ink from the rules even when backstitch strokes outnumber them', () => {
    // Without that, the main backstitch colour is mistaken for ink and lost.
    const many = [];
    for (let i = 0; i < 60; i++) many.push({ type: 'line', stroked: true, lineWidth: 1, strokeColor: [200, 40, 40], points: [pt(i % 18, 1 + (i % 15)), pt((i % 18) + 1, 2 + (i % 15))] });
    expect(imp.extractBackstitch(pg(many), g).length).toBeGreaterThan(30);
  });

  it('keeps a long diagonal stitch in a thread colour', () => {
    const out = imp.extractBackstitch(pg([{ type: 'line', stroked: true, lineWidth: 1.6, strokeColor: [236, 191, 181], points: [pt(1, 1), pt(15, 15)] }]), g);
    expect(out).toHaveLength(1);
  });

  it('treats a long bold rule as a rule, not backstitch', () => {
    // Every tenth grid line drawn bold and black: a different colour and a
    // heavier pen than the fine grid, but still a rule.
    const bold = [];
    for (let i = 0; i <= 20; i += 10) bold.push({ type: 'line', stroked: true, lineWidth: 2, strokeColor: [0, 0, 0], points: [pt(i, 0), pt(i, 20)] });
    expect(imp.extractBackstitch(pg(bold), g)).toHaveLength(0);
  });

  it('ignores symbol outlines drawn as polylines off the lattice', () => {
    const c = { x: g.originX + 53, y: g.originY + 53 };
    const out = imp.extractBackstitch(pg([{
      type: 'path', stroked: true, lineWidth: 1.6, strokeColor: [255, 255, 255],
      points: [c, { x: c.x + 7, y: c.y + 1 }, { x: c.x + 4, y: c.y + 8 }, c],
    }]), g);
    expect(out).toHaveLength(0);
  });
});

describe('extractBackstitch — half-cell positions', () => {
  const page = (paths) => ({ pageIndex: 1, width: 612, height: 792, vectorPaths: inkFurniture().concat(paths), textItems: [] });
  const ends = (lines) => lines.map(l => [l.x1, l.y1, l.x2, l.y2]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  it('keeps a line that runs to the middle of a cell\'s side, or its centre', () => {
    const lines = imp.extractBackstitch(page([
      seg(2, 2, 4, 2, THREAD),            // corner to corner
      seg(5, 3, 6.5, 3, THREAD),          // to the middle of a side
      seg(8.5, 8.5, 10, 10, THREAD),      // from a cell's centre
    ]), grid);
    expect(ends(lines)).toEqual([[2, 2, 4, 2], [5, 3, 6.5, 3], [8.5, 8.5, 10, 10]]);
  });

  it('takes out a shift between the measured grid and the line work before snapping', () => {
    // Every end a third of a cell below its corner, as on DMC's charts: the
    // lines belong on the corners, not at half points or a row lower.
    const shifted = (c1, r1, c2, r2) => seg(c1, r1 + 0.33, c2, r2 + 0.33, THREAD);
    const lines = imp.extractBackstitch(page([
      shifted(2, 2, 4, 2), shifted(4, 2, 4, 5), shifted(4, 5, 7, 5), shifted(7, 5, 9, 7),
    ]), grid);
    expect(ends(lines)).toEqual([[2, 2, 4, 2], [4, 2, 4, 5], [4, 5, 7, 5], [7, 5, 9, 7]]);
  });

  it('takes a shift of 0.7 as one of -0.3, as rounding to the nearest corner did', () => {
    const shifted = (c1, r1, c2, r2) => seg(c1 + 0.7, r1, c2 + 0.7, r2, THREAD);
    const lines = imp.extractBackstitch(page([
      shifted(2, 2, 4, 2), shifted(4, 2, 4, 5), shifted(4, 5, 7, 5), shifted(7, 5, 9, 7),
    ]), grid);
    expect(ends(lines)).toEqual([[3, 2, 5, 2], [5, 2, 5, 5], [5, 5, 8, 5], [8, 5, 10, 7]]);
  });
});

describe('stitchedBounds — half-cell backstitch', () => {
  it('trims to whole cells around a line that ends halfway across one', () => {
    const b = imp.stitchedBounds([], 20, 20, [{ x1: 3.5, y1: 4, x2: 6, y2: 7.5 }]);
    expect(b).toEqual({ offsetCol: 3, offsetRow: 4, width: 3, height: 4 });
  });
});
