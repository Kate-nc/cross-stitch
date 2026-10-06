/* tests/import/pdfHalfStitches.test.js — half stitches drawn as lines, read
 * from a real PDF.
 *
 * Some charting software draws a half stitch as a heavy diagonal line in the
 * thread's colour rather than as a filled triangle. The importer used to read
 * it as a short backstitch. The line's width is set inside the PDF's own
 * coordinate system, so this goes through pdf.js to check the pen width comes
 * out in page units: here the chart is drawn under a 0.75 scale, as "Print to
 * PDF" charts are.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
let pdfjs;
const { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = require('pdf-lib');

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

const RED = rgb(0.8, 0.1, 0.15), GREEN = rgb(0.15, 0.6, 0.25), BROWN = rgb(0.35, 0.2, 0.1);

/* A 20 x 16 chart, drawn at 16 units a cell under a 0.75 scale (12pt cells
 * on the page): a block of full red stitches, a row of green half stitches
 * as heavy lines (5 units, 3.75pt: about a third of a cell), and a brown
 * backstitch outline in a fine pen. */
async function chartWithHalfStitches() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const pitch = 16, x0 = 120, y0 = 300, cols = 20, rows = 16;
  const X = (c) => x0 + c * pitch, Y = (r) => y0 + (rows - r) * pitch;   // row 0 at the top
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(0.75, 0, 0, 0.75, 0, 0));
  for (let r = 0; r < 10; r++) for (let c = 0; c < 20; c++) {
    page.drawRectangle({ x: X(c), y: Y(r + 1), width: pitch, height: pitch, color: RED });
  }
  for (let c = 2; c < 8; c++) {
    // Row 12: forward halves (bottom-left to top-right), stopping a little short of the corners.
    page.drawLine({ start: { x: X(c) + 2, y: Y(13) + 2 }, end: { x: X(c + 1) - 2, y: Y(12) - 2 }, thickness: 5, color: GREEN });
  }
  // Backstitch: a line under the red block and a diagonal below it.
  page.drawLine({ start: { x: X(2), y: Y(10) }, end: { x: X(8), y: Y(10) }, thickness: 1.2, color: BROWN });
  page.drawLine({ start: { x: X(10), y: Y(11) }, end: { x: X(12), y: Y(13) }, thickness: 1.2, color: BROWN });
  for (let c = 0; c <= cols; c++) page.drawLine({ start: { x: X(c), y: Y(rows) }, end: { x: X(c), y: Y(0) }, thickness: 0.4, color: rgb(0.3, 0.3, 0.3) });
  for (let r = 0; r <= rows; r++) page.drawLine({ start: { x: X(0), y: Y(r) }, end: { x: X(cols), y: Y(r) }, thickness: 0.4, color: rgb(0.3, 0.3, 0.3) });
  page.pushOperators(popGraphicsState());

  const key = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  key.drawText('DMC colour key', { x: 60, y: 700, size: 14, font });
  [['321', RED], ['699', GREEN]].forEach(([code, col], i) => {
    key.drawRectangle({ x: 60, y: 640 - i * 20, width: 10, height: 10, color: col });
    key.drawText(code, { x: 80, y: 641 - i * 20, size: 10, font });
  });
  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('importing half stitches drawn as lines', () => {
  jest.setTimeout(60000);

  it('stores each as two quarters of its cell, and keeps them out of the backstitch', async () => {
    const project = await newImporter().import(await chartWithHalfStitches());
    // Six forward halves in green: bottom-left and top-right quarters.
    const halves = (project.partialStitches || []).filter(([, q]) => q.BL && q.TR && !q.TL && !q.BR);
    expect(halves).toHaveLength(6);
    for (const [, q] of halves) expect(q.BL.id).toBe(q.TR.id);
    // Neither a full stitch nor backstitch where they are.
    const ids = new Set(halves.map(([idx]) => idx));
    for (const idx of ids) expect(project.pattern[idx].id).toBe('__skip__');
    expect(project.bsLines).toHaveLength(2);
    expect(project.importReport.matched.partial).toBe(6);
  });
});
