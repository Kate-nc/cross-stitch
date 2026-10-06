/* tests/import/pdfPageLayout.test.js — reading a multi-page PDF once and
 * rebuilding it with the pages arranged differently.
 *
 * pdf-importer's analyse() reads every chart page at page-local coordinates;
 * buildFromLayout() places them. The review dialog's Pages tab uses the pair
 * so the stitcher can correct where pages go without re-reading the PDF.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
let pdfjs;
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const M = require(path.join(ROOT, 'import-engine', 'ui', 'pageLayoutModel.js'));

function loadImporter() {
  global.pdfjsLib = pdfjs;
  global.PdfAxisLabels = require(path.join(ROOT, 'pdf-axis-labels.js'));
  global.PdfRasterChart = require(path.join(ROOT, 'pdf-raster-chart.js'));
  const raw = fs.readFileSync(path.join(ROOT, 'pdf-importer.js'), 'utf8');
  // eslint-disable-next-line no-eval
  eval(raw + '\nthis.PatternKeeperImporter = PatternKeeperImporter;');
  return this.PatternKeeperImporter;
}
let PatternKeeperImporter;
beforeAll(async () => {
  pdfjs = await import(path.join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'));
  PatternKeeperImporter = loadImporter();
});
const newImporter = () => {
  const imp = new PatternKeeperImporter();
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  return imp;
};

/* ── buildFromLayout, on a hand-built session ─────────────────────────────── */

describe('buildFromLayout', () => {
  const thread = (id, c) => ({ id, rgb: c, lab: [0, 0, 0], name: id });
  const A = thread('A', [200, 0, 0]), B = thread('B', [0, 0, 200]);
  // Two 3 x 2 pages, each fully stitched in one thread.
  const pageOf = (pageIndex, t) => {
    const cells = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) cells.push({ col: c, row: r, isEmpty: false, thread: t, symbol: '' });
    return { pageIndex, cols: 3, rows: 2, cells, bs: [], initial: null, reason: null };
  };
  const session = () => {
    const imp = newImporter();
    const s = {
      pages: [pageOf(1, A), pageOf(2, B)],
      legend: { entries: [], matchReport: {} },
      stated: {}, layoutSource: 'sequential', tiling: null, layoutWarnings: [],
      placement: { pages: { 1: { col: 0, row: 0 }, 2: { col: 3, row: 0 } }, manual: false },
    };
    s.build = (pl) => imp.buildFromLayout(s, pl);
    return s;
  };

  it('places pages side by side as given', () => {
    const s = session();
    const p = s.build(s.placement);
    expect([p.w, p.h]).toEqual([6, 2]);
    expect(p.pattern[0].id).toBe('A');
    expect(p.pattern[3].id).toBe('B');
  });

  it('places pages one above the other when rearranged', () => {
    const s = session();
    const p = s.build({ pages: { 1: { col: 0, row: 0 }, 2: { col: 0, row: 2 } }, manual: true });
    expect([p.w, p.h]).toEqual([3, 4]);
    expect(p.pattern[3 * 2].id).toBe('B');            // row 2, col 0
    expect(p.importReport.layout).toBe('manual');
    expect(p.importReport.warnings).toContain('The page layout was arranged by hand.');
  });

  it('leaves a page out when it has no position, and says so', () => {
    const s = session();
    const p = s.build({ pages: { 1: { col: 0, row: 0 } }, manual: true });
    expect([p.w, p.h]).toEqual([3, 2]);
    expect(p.importReport.warnings.join(' ')).toMatch(/Page 2 looked like a chart page but was not placed/);
  });

  it('lets overlapping pages share their repeated cells', () => {
    const s = session();
    const p = s.build({ pages: { 1: { col: 0, row: 0 }, 2: { col: 2, row: 0 } }, manual: true });
    expect(p.w).toBe(5);
    expect(p.pattern.filter(m => m.id !== '__skip__')).toHaveLength(10);
  });

  it('shifts backstitch with its page', () => {
    const s = session();
    s.pages[1].bs = [{ x1: 0, y1: 0, x2: 1, y2: 1, rgb: [1, 2, 3] }];
    const p = s.build({ pages: { 1: { col: 0, row: 0 }, 2: { col: 0, row: 2 } }, manual: true });
    expect(p.bsLines[0]).toEqual(expect.objectContaining({ x1: 0, y1: 2, x2: 1, y2: 3 }));
  });
});

/* ── end to end: a four-page chart with no rulers ─────────────────────────── */

/* Four pages forming a 2 x 2 chart, with no printed row or column numbers, so
 * the importer cannot know their arrangement and lays them out in page order.
 * Each page is 30 x 24 cells, filled with a colour that identifies it. */
async function rulerlessFourPageChart() {
  const pdf = await PDFDocument.create();
  const colours = [rgb(0.8, 0.1, 0.1), rgb(0.1, 0.6, 0.1), rgb(0.1, 0.2, 0.8), rgb(0.8, 0.7, 0.1)];
  const pitch = 12, x0 = 100, y0 = 200, cols = 30, rows = 24;
  for (let p = 0; p < 4; p++) {
    const page = pdf.addPage([612, 792]);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        page.drawRectangle({ x: x0 + c * pitch, y: y0 + r * pitch, width: pitch, height: pitch, color: colours[p] });
      }
    }
    for (let c = 0; c <= cols; c++) page.drawLine({ start: { x: x0 + c * pitch, y: y0 }, end: { x: x0 + c * pitch, y: y0 + rows * pitch }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) });
    for (let r = 0; r <= rows; r++) page.drawLine({ start: { x: x0, y: y0 + r * pitch }, end: { x: x0 + cols * pitch, y: y0 + r * pitch }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) });
  }
  // A colour key, so each page's colour resolves to its own thread.
  const key = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  key.drawText('DMC colour key', { x: 60, y: 700, size: 14, font });
  ['321', '699', '797', '725'].forEach((code, i) => {
    key.drawRectangle({ x: 60, y: 640 - i * 20, width: 10, height: 10, color: colours[i] });
    key.drawText(code, { x: 80, y: 641 - i * 20, size: 10, font });
  });
  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('rearranging a rulerless multi-page chart', () => {
  jest.setTimeout(60000);

  it('reads the pages once, then rebuilds them as a 2 x 2 grid', async () => {
    const imp = newImporter();
    const session = await imp.analyse(await rulerlessFourPageChart());

    expect(session.pages.map(p => p.pageIndex)).toEqual([1, 2, 3, 4]);
    expect(session.pages.every(p => p.cols === 30 && p.rows === 24)).toBe(true);
    // Without rulers the importer can only lay them out in page order...
    expect(session.layoutSource).toBe('sequential');
    expect(M.needsReview(session)).toBe(true);
    const strip = session.build(session.placement);
    expect([strip.w, strip.h]).toEqual([120, 24]);

    // ...and the stitcher says two go across.
    const slots = M.setAcross(M.slotsFromPlacement(session, session.placement), 2);
    const grid = session.build(M.placementFromSlots(session, slots));
    expect([grid.w, grid.h]).toEqual([60, 48]);
    // Page 3 (blue) now sits under page 1, at the start of the second row.
    const at = (c, r) => grid.pattern[r * grid.w + c].id;
    expect(at(0, 0)).toBe('321');                      // page 1 top left
    expect(at(59, 23)).toBe('699');                    // page 2 top right
    expect(at(0, 24)).toBe('797');                     // page 3 under page 1
    expect(at(59, 47)).toBe('725');                    // page 4 bottom right
  });

  it('import() still returns the automatic layout, with the session attached', async () => {
    const project = await newImporter().import(await rulerlessFourPageChart());
    expect([project.w, project.h]).toEqual([120, 24]);
    expect(project._layoutSession.pages).toHaveLength(4);
    // Not enumerable, so it is never saved with the project.
    expect(Object.keys(project)).not.toContain('_layoutSession');
    expect(JSON.stringify(project)).not.toMatch(/_layoutSession/);
  });
});
