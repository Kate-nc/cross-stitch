/* tests/import/pdfTrimMargin.test.js — trimming the blank margin a chart's
 * ruling leaves around the design.
 *
 * Charts are routinely ruled larger than the design they carry. PAT2171_2 rules
 * a 92x98 grid around a design its own cover states as 14 x 13 cm at 5.5
 * stitches/cm — about 77 x 72 — so importing the ruled area overstates the
 * finished size and surrounds the work with empty canvas.
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

const thread = { id: '310', rgb: [0, 0, 0], lab: [0, 0, 0], name: 'black' };

/* Cells covering a whole grid, with stitches only inside the given box. */
function cellsWithStitchBox(gridW, gridH, box) {
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

describe('stitchedBounds', () => {
  it('finds the box the stitches occupy', () => {
    const cells = cellsWithStitchBox(92, 98, { c0: 12, c1: 84, r0: 13, r1: 84 });
    expect(imp.stitchedBounds(cells, 92, 98)).toEqual({
      offsetCol: 12, offsetRow: 13, width: 73, height: 72,
    });
  });

  it('returns the full grid when nothing is stitched', () => {
    const cells = cellsWithStitchBox(20, 10, { c0: 1, c1: 0, r0: 1, r1: 0 }); // none inside
    expect(imp.stitchedBounds(cells, 20, 10)).toEqual({
      offsetCol: 0, offsetRow: 0, width: 20, height: 10,
    });
  });

  it('returns the full grid for an already-tight chart', () => {
    const cells = cellsWithStitchBox(8, 6, { c0: 0, c1: 7, r0: 0, r1: 5 });
    expect(imp.stitchedBounds(cells, 8, 6)).toEqual({
      offsetCol: 0, offsetRow: 0, width: 8, height: 6,
    });
  });

  it('ignores cells that fall outside the grid', () => {
    const cells = [
      { col: 2, row: 2, isEmpty: false, thread },
      { col: 5, row: 4, isEmpty: false, thread },
      { col: 999, row: 999, isEmpty: false, thread },   // stray
    ];
    const b = imp.stitchedBounds(cells, 10, 10);
    expect(b.width).toBe(4);
    expect(b.height).toBe(3);
    expect(b.offsetCol).toBe(2);
  });

  it('ignores cells with no thread', () => {
    const cells = [
      { col: 1, row: 1, isEmpty: false, thread },
      { col: 9, row: 9, isEmpty: false, thread: null },  // unresolved
    ];
    const b = imp.stitchedBounds(cells, 20, 20);
    expect(b).toEqual({ offsetCol: 1, offsetRow: 1, width: 1, height: 1 });
  });
});

describe('convertToPattern — trimming', () => {
  const layout = (w, h) => ({ totalColumns: w, totalRows: h, pages: [] });

  it('sizes the pattern to the stitches, not the ruled grid', () => {
    const cells = cellsWithStitchBox(92, 98, { c0: 12, c1: 84, r0: 13, r1: 84 });
    const project = imp.convertToPattern(layout(92, 98), cells, { entries: [] });
    expect(project.w).toBe(73);
    expect(project.h).toBe(72);
    expect(project.settings.sW).toBe(73);
    expect(project.settings.sH).toBe(72);
    expect(project.pattern).toHaveLength(73 * 72);
  });

  it('keeps every stitch when trimming', () => {
    const cells = cellsWithStitchBox(40, 30, { c0: 5, c1: 14, r0: 6, r1: 12 });
    const project = imp.convertToPattern(layout(40, 30), cells, { entries: [] });
    const stitched = project.pattern.filter(m => m.id !== '__skip__');
    expect(stitched).toHaveLength(10 * 7);
  });

  it('moves the design to the origin', () => {
    const cells = cellsWithStitchBox(40, 30, { c0: 5, c1: 9, r0: 6, r1: 9 });
    const project = imp.convertToPattern(layout(40, 30), cells, { entries: [] });
    // The top-left stitch should now be at index 0.
    expect(project.pattern[0].id).toBe('310');
    expect(project.w).toBe(5);
    expect(project.h).toBe(4);
  });

  it('leaves a tight chart unchanged', () => {
    const cells = cellsWithStitchBox(12, 9, { c0: 0, c1: 11, r0: 0, r1: 8 });
    const project = imp.convertToPattern(layout(12, 9), cells, { entries: [] });
    expect(project.w).toBe(12);
    expect(project.h).toBe(9);
  });

  it('falls back to the grid size for an empty chart', () => {
    const cells = cellsWithStitchBox(15, 11, { c0: 1, c1: 0, r0: 1, r1: 0 });
    const project = imp.convertToPattern(layout(15, 11), cells, { entries: [] });
    expect(project.w).toBe(15);
    expect(project.h).toBe(11);
  });
});
