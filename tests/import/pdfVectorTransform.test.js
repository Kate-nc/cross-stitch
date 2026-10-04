/* tests/import/pdfVectorTransform.test.js — graphics-state stack in
 * extractVectorPaths.
 *
 * The walker multiplies `transform` ops into a running matrix. Without a q/Q
 * stack, a restore cannot put back the matrix that was in force at the matching
 * save — and resetting it to the identity instead drops any enclosing scale for
 * the remainder of the page. Charts printed through "Microsoft: Print To PDF"
 * wrap their content in a 0.75 (72/96 dpi) scale inside q/Q, so every
 * coordinate came out 4/3 too large and grid origins landed thousands of points
 * off the sheet.
 *
 * Loaded the same way as tests/pdfImporterYBucket.test.js: pdf-importer.js is a
 * classic script whose top-level classes are not exported.
 */

const fs = require('fs');
const path = require('path');

// A minimal OPS enum matching the subset extractVectorPaths reads.
const OPS = {
  save: 10, restore: 11, transform: 12,
  moveTo: 13, lineTo: 14, rectangle: 19,
  closePath: 18, curveTo: 15,
  stroke: 20, fill: 22, eoFill: 23, fillStroke: 24, endPath: 28,
  setFillRGBColor: 61, setStrokeRGBColor: 60,
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

// An identity viewport: convertToViewportPoint passes coordinates through, so a
// test asserts the content-stream maths alone.
const identityViewport = {
  width: 612, height: 792, scale: 1,
  convertToViewportPoint: (x, y) => [x, y],
};

function opList(entries) {
  return {
    fnArray: entries.map(e => e[0]),
    argsArray: entries.map(e => e.length > 1 ? e[1] : null),
  };
}

// constructPath carrying a single rectangle.
function rectPath(x, y, w, h) {
  return [OPS.constructPath, [[OPS.rectangle], [x, y, w, h]]];
}

describe('extractVectorPaths — graphics state', () => {
  const imp = new PatternKeeperImporter();

  it('restores the enclosing matrix on Q instead of resetting to identity', () => {
    // q, scale by 0.75, draw, Q, draw again. The second rectangle is outside the
    // q/Q pair so it must be unscaled — and crucially the first must be scaled.
    const paths = imp.extractVectorPaths(opList([
      [OPS.save],
      [OPS.transform, [0.75, 0, 0, 0.75, 0, 0]],
      rectPath(100, 100, 40, 40),
      [OPS.restore],
      rectPath(100, 100, 40, 40),
    ]), identityViewport);

    const rects = paths.filter(p => p.type === 'rect');
    expect(rects).toHaveLength(2);
    // Scaled: 100 * 0.75 = 75
    expect(rects[0].points[0].x).toBeCloseTo(75, 5);
    // Unscaled, because the 0.75 belonged to the q/Q pair that has ended.
    expect(rects[1].points[0].x).toBeCloseTo(100, 5);
  });

  it('keeps an outer scale in force after an inner q/Q closes', () => {
    // This is the case that produced the 4/3 error: an outer 0.75 page scale
    // with inner q/Q pairs inside it. Resetting to identity on the inner Q lost
    // the page scale for everything that followed.
    const paths = imp.extractVectorPaths(opList([
      [OPS.transform, [0.75, 0, 0, 0.75, 0, 0]],   // page scale
      [OPS.save],
      [OPS.transform, [2, 0, 0, 2, 0, 0]],
      rectPath(10, 10, 5, 5),
      [OPS.restore],
      rectPath(100, 100, 40, 40),                  // still under the page scale
    ]), identityViewport);

    const rects = paths.filter(p => p.type === 'rect');
    expect(rects).toHaveLength(2);
    expect(rects[0].points[0].x).toBeCloseTo(10 * 2 * 0.75, 5);  // 15
    expect(rects[1].points[0].x).toBeCloseTo(100 * 0.75, 5);     // 75, not 100
  });

  it('handles nested q/Q to several levels', () => {
    const paths = imp.extractVectorPaths(opList([
      [OPS.save],
      [OPS.transform, [2, 0, 0, 2, 0, 0]],
      [OPS.save],
      [OPS.transform, [3, 0, 0, 3, 0, 0]],
      rectPath(1, 1, 1, 1),   // 1 * 3 * 2 = 6
      [OPS.restore],
      rectPath(1, 1, 1, 1),   // 1 * 2 = 2
      [OPS.restore],
      rectPath(1, 1, 1, 1),   // 1
    ]), identityViewport);

    const xs = paths.filter(p => p.type === 'rect').map(p => p.points[0].x);
    expect(xs).toHaveLength(3);
    expect(xs[0]).toBeCloseTo(6, 5);
    expect(xs[1]).toBeCloseTo(2, 5);
    expect(xs[2]).toBeCloseTo(1, 5);
  });

  it('applies translation from the restored matrix', () => {
    const paths = imp.extractVectorPaths(opList([
      [OPS.transform, [1, 0, 0, 1, 50, 20]],
      [OPS.save],
      [OPS.transform, [1, 0, 0, 1, 500, 500]],
      [OPS.restore],
      rectPath(0, 0, 10, 10),
    ]), identityViewport);
    const r = paths.filter(p => p.type === 'rect')[0];
    expect(r.points[0].x).toBeCloseTo(50, 5);
    expect(r.points[0].y).toBeCloseTo(20, 5);
  });

  it('survives an unbalanced Q without resetting the matrix', () => {
    // More restores than saves is malformed but occurs in the wild. The matrix
    // should be left alone rather than wiped.
    const paths = imp.extractVectorPaths(opList([
      [OPS.transform, [0.5, 0, 0, 0.5, 0, 0]],
      [OPS.restore],
      rectPath(100, 100, 10, 10),
    ]), identityViewport);
    const r = paths.filter(p => p.type === 'rect')[0];
    expect(r.points[0].x).toBeCloseTo(50, 5);
  });

  it('restores the fill colour along with the matrix', () => {
    const paths = imp.extractVectorPaths(opList([
      [OPS.setFillRGBColor, [10, 20, 30]],
      [OPS.save],
      [OPS.setFillRGBColor, [200, 200, 200]],
      [OPS.restore],
      rectPath(0, 0, 4, 4),
      [OPS.fill],
    ]), identityViewport);
    const r = paths.filter(p => p.type === 'rect')[0];
    // The inner colour ended with its q/Q; the outer one applies.
    expect(r.fillColor).toBeDefined();
    expect(Array.from(r.fillColor)).toEqual([10, 20, 30]);
  });
});

describe('detectGrid with corrected coordinates', () => {
  const imp = new PatternKeeperImporter();

  /* A chart drawn as grid lines inside a 0.75 page scale — the shape that
   * defeated the old walker. detectGrid should recover the true cell pitch in
   * post-scale coordinates. */
  function scaledGridPage(cols, rows, pitch, originX, originY, scale) {
    const entries = [[OPS.save], [OPS.transform, [scale, 0, 0, scale, 0, 0]]];
    for (let c = 0; c <= cols; c++) {
      const x = originX + c * pitch;
      entries.push([OPS.constructPath, [
        [OPS.moveTo, OPS.lineTo], [x, originY, x, originY + rows * pitch],
      ]]);
      entries.push([OPS.stroke]);
    }
    for (let r = 0; r <= rows; r++) {
      const y = originY + r * pitch;
      entries.push([OPS.constructPath, [
        [OPS.moveTo, OPS.lineTo], [originX, y, originX + cols * pitch, y],
      ]]);
      entries.push([OPS.stroke]);
    }
    entries.push([OPS.restore]);
    return opList(entries);
  }

  it('reads the true pitch and span through a page scale', () => {
    const cols = 20, rows = 15, pitch = 9, scale = 0.75;
    const paths = imp.extractVectorPaths(
      scaledGridPage(cols, rows, pitch, 60, 60, scale), identityViewport);
    const grid = imp.detectGrid({
      pageIndex: 1, width: 612, height: 792, vectorPaths: paths, textItems: [], fonts: [],
    });
    // Everything is scaled by 0.75, so the on-page pitch is 9 * 0.75.
    expect(grid.cellWidth).toBeCloseTo(pitch * scale, 1);
    expect(grid.cellHeight).toBeCloseTo(pitch * scale, 1);
    expect(grid.columns).toBe(cols);
    expect(grid.rows).toBe(rows);
    // Origins must stay on the sheet; the old walker produced large negatives.
    expect(grid.originX).toBeGreaterThanOrEqual(0);
    expect(grid.originY).toBeGreaterThanOrEqual(0);
  });

  it('keeps the origin on the page for a scaled chart', () => {
    const paths = imp.extractVectorPaths(
      scaledGridPage(10, 10, 12, 100, 100, 0.75), identityViewport);
    const grid = imp.detectGrid({
      pageIndex: 1, width: 612, height: 792, vectorPaths: paths, textItems: [], fonts: [],
    });
    expect(grid.originX).toBeCloseTo(100 * 0.75, 0);
    expect(grid.originY).toBeCloseTo(100 * 0.75, 0);
  });
});
