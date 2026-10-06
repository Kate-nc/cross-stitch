/* tests/import/pdfFractionalStitches.test.js — ¾ and ¼ stitches.
 *
 * Charting software draws fractional stitches as triangles in the thread
 * colour: a ¾ stitch fills half the cell, its corners on three cell corners;
 * a ¼ stitch is a small triangle from one corner to the midpoints of its two
 * sides. The importer used to read every cell as a whole stitch, so a cell
 * split between two threads came in as whichever covered more.
 *
 * The app stores fractional stitches as quarters (TL, TR, BL, BR) beside the
 * full-stitch pattern; a ¾ is three quarters of one thread.
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

const grid = { originX: 100, originY: 100, cellWidth: 10, cellHeight: 10, columns: 4, rows: 3 };
const at = (c, r, u, v) => ({ x: 100 + (c + u) * 10, y: 100 + (r + v) * 10 });
const tri = (pts, rgb) => ({ type: 'path', lineWidth: 1, fillColor: rgb, points: pts.concat([pts[0]]) });
const RED = [200, 30, 30], BLUE = [30, 60, 200];

describe('fractionalShape', () => {
  it('reads a half-cell triangle as a ¾ stitch at its right-angled corner', () => {
    // Corners TL, TR, BL: the right angle is at TL, so BR is the quarter left out.
    const out = imp.fractionalShape([at(1, 1, 0, 0), at(1, 1, 1, 0), at(1, 1, 0, 1)], grid);
    expect(out).toEqual({ key: 1 * 4 + 1, quads: ['TL', 'TR', 'BL'] });
  });

  it('reads the other three ¾ orientations', () => {
    const q = (pts) => imp.fractionalShape(pts, grid).quads.sort().join(',');
    expect(q([at(0, 0, 1, 0), at(0, 0, 1, 1), at(0, 0, 0, 0)])).toBe('BR,TL,TR');   // right angle TR
    expect(q([at(0, 0, 0, 1), at(0, 0, 1, 1), at(0, 0, 0, 0)])).toBe('BL,BR,TL');   // right angle BL
    expect(q([at(0, 0, 1, 1), at(0, 0, 0, 1), at(0, 0, 1, 0)])).toBe('BL,BR,TR');   // right angle BR
  });

  it('reads a small corner triangle as a ¼ stitch', () => {
    const out = imp.fractionalShape([at(2, 0, 1, 1), at(2, 0, 0.5, 1), at(2, 0, 1, 0.5)], grid);
    expect(out).toEqual({ key: 2, quads: ['BR'] });
  });

  it('ignores a triangle whose corners are off the stitching lattice', () => {
    // A symbol's outline, not a stitch.
    expect(imp.fractionalShape([at(0, 0, 0.3, 0.2), at(0, 0, 0.8, 0.3), at(0, 0, 0.4, 0.9)], grid)).toBeNull();
  });

  it('ignores rectangles', () => {
    expect(imp.fractionalShape([at(0, 0, 0, 0), at(0, 0, 1, 0), at(0, 0, 1, 1), at(0, 0, 0, 1)], grid)).toBeNull();
  });
});

describe('reading fractional stitches from a chart', () => {
  const layout = { totalColumns: 4, totalRows: 3, pages: [{ pageIndex: 1, grid, globalOffsetCol: 0, globalOffsetRow: 0 }] };
  const page = (vectorPaths) => ({ pageIndex: 1, width: 612, height: 792, vectorPaths, textItems: [], fonts: [] });

  it('splits a cell shared by a ¾ and a ¼ stitch into its two threads', async () => {
    const p = page([
      tri([at(1, 1, 0, 0), at(1, 1, 1, 0), at(1, 1, 0, 1)], RED),                        // ¾ red, right angle TL
      tri([at(1, 1, 1, 1), at(1, 1, 0.5, 1), at(1, 1, 1, 0.5)], BLUE),                   // ¼ blue, BR
    ]);
    const syms = await imp.extractSymbols([p], layout, null);
    const cell = syms.find(s => s.col === 1 && s.row === 1);
    expect(cell.partial).toEqual({ TL: RED, TR: RED, BL: RED, BR: BLUE });
  });

  it('leaves a cell whole when all its quarters are one thread', async () => {
    const p = page([
      tri([at(0, 0, 0, 0), at(0, 0, 1, 0), at(0, 0, 0, 1)], RED),
      tri([at(0, 0, 1, 1), at(0, 0, 0, 1), at(0, 0, 1, 0)], RED),
    ]);
    const syms = await imp.extractSymbols([p], layout, null);
    expect(syms.find(s => s.col === 0 && s.row === 0).partial).toBeUndefined();
  });

  it('stores fractional stitches as quarters, with the cell itself left blank', () => {
    const legend = { entries: [
      { threadCode: '321', swatchRgb: RED },
      { threadCode: '797', swatchRgb: BLUE },
    ] };
    const linked = imp.linkSymbolsToThreads([
      { col: 1, row: 1, isEmpty: false, symbol: '', partial: { TL: RED, TR: RED, BL: RED, BR: BLUE } },
      { col: 0, row: 0, isEmpty: false, symbol: '', fillColor: RED, fillColors: [RED] },
    ], legend);
    expect(legend.matchReport.partial).toBe(1);
    const project = imp.convertToPattern({ totalColumns: 4, totalRows: 3, pages: [] }, linked, legend, []);
    // Trimmed to cells (0,0)-(1,1): the partial cell is index 3 of a 2 x 2.
    expect(project.w).toBe(2);
    expect(project.partialStitches).toHaveLength(1);
    const [idx, q] = project.partialStitches[0];
    expect(idx).toBe(3);
    expect(q.TL.id).toBe('321');
    expect(q.BR.id).toBe('797');
    expect(project.pattern[3].id).toBe('__skip__');
    expect(project.pattern[0].id).toBe('321');
  });
});

/* Half stitches drawn as a heavy diagonal line, not a filled triangle. */
describe('half stitches drawn as lines', () => {
  const line = (a, b, rgb, penWidth) => ({ type: 'line', points: [a, b], stroked: true, strokeColor: rgb, lineWidth: penWidth, penWidth });
  const GREEN = [40, 150, 60];

  it('reads a heavy corner-to-corner stroke as a half stitch, in either direction', () => {
    // Page y runs down: bottom-left to top-right rises, a forward half.
    expect(imp.halfStitchStroke(line(at(1, 1, 0, 1), at(1, 1, 1, 0), RED, 3), grid)).toEqual({ key: 5, quads: ['BL', 'TR'] });
    expect(imp.halfStitchStroke(line(at(2, 0, 0, 0), at(2, 0, 1, 1), RED, 3), grid)).toEqual({ key: 2, quads: ['TL', 'BR'] });
  });

  it('accepts a line that stops short of the corners, as many charts draw it', () => {
    expect(imp.halfStitchStroke(line(at(0, 0, 0.15, 0.85), at(0, 0, 0.85, 0.15), RED, 2.5), grid)).toEqual({ key: 0, quads: ['BL', 'TR'] });
  });

  it('leaves a fine line as backstitch', () => {
    expect(imp.halfStitchStroke(line(at(1, 1, 0, 1), at(1, 1, 1, 0), RED, 0.8), grid)).toBeNull();
  });

  it('leaves lines that are not one cell\'s diagonal', () => {
    expect(imp.halfStitchStroke(line(at(0, 0, 0, 0), at(0, 0, 2, 2), RED, 3), grid)).toBeNull();     // two cells
    expect(imp.halfStitchStroke(line(at(0, 0, 0, 0.5), at(0, 0, 1, 0.5), RED, 3), grid)).toBeNull(); // across
    expect(imp.halfStitchStroke(line(at(0, 0, 0.5, 0), at(0, 0, 1.5, 1), RED, 3), grid)).toBeNull(); // between cells
  });

  it('stores a half stitch as two quarters of the cell, and keeps it out of the backstitch', async () => {
    const layout = { totalColumns: 4, totalRows: 3, pages: [{ pageIndex: 1, grid, globalOffsetCol: 0, globalOffsetRow: 0 }] };
    const p = { pageIndex: 1, width: 612, height: 792, textItems: [], fonts: [], vectorPaths: [
      line(at(1, 1, 0, 1), at(1, 1, 1, 0), GREEN, 3),                       // forward half, green
      line(at(2, 1, 0, 0), at(2, 1, 1, 1), BLUE, 3),                        // backward half, blue
      line(at(0, 0, 0, 0), at(0, 0, 3, 0), [20, 20, 20], 0.5),              // a rule
      line(at(0, 2, 0, 0), at(0, 2, 1, 1), RED, 0.9),                       // fine: backstitch
    ] };
    const syms = await imp.extractSymbols([p], layout, null);
    expect(syms.find(s => s.col === 1 && s.row === 1).partial).toEqual({ TL: null, TR: GREEN, BL: GREEN, BR: null });
    expect(syms.find(s => s.col === 2 && s.row === 1).partial).toEqual({ TL: BLUE, TR: null, BL: null, BR: BLUE });
    const bs = imp.extractBackstitch(p, grid);
    expect(bs.map(l => [l.x1, l.y1, l.x2, l.y2])).toEqual([[0, 2, 1, 3]]);
  });
});
