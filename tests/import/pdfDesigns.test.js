/* tests/import/pdfDesigns.test.js — a PDF holding several designs.
 *
 * A booklet prints several designs, each with its own title on its pages and
 * its own key. The importer used to read every chart page as part of one
 * chart, and every key as one key: designs reuse symbols for different
 * threads, so the result mixed them up. It now reads each design on its own,
 * and the review lets the stitcher pick which to import.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
let pdfjs;
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

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

/* ── which pages belong together ──────────────────────────────────────────── */

describe('splitDesigns', () => {
  // A page whose text is [str, height, y] triples.
  const page = (pageIndex, items) => ({ pageIndex, textItems: items.map(([str, height, y]) => ({ str, height, y: y || 0, x: 0 })) });
  const chart = (i, title) => page(i, title ? [[title, 16, 20], ['Page ' + i, 8, 760]] : [['10', 8, 50]]);
  const key = (i, title) => page(i, [[title, 14, 20], ['310 Black', 9, 100]]);
  let imp;
  beforeAll(() => { imp = newImporter(); });
  const titles = (d) => d.map(x => x.title + ':' + x.chartPages.map(p => p.pageIndex).join(',') + '/' + x.legendPages.map(p => p.pageIndex).join(','));

  it('splits pages by their heading when each design has its own key', () => {
    const d = imp.splitDesigns(
      [chart(1, 'Winter Fox'), chart(2, 'Winter Fox'), chart(4, 'Summer Owl Cross Stitch Pattern')],
      [key(3, 'Winter Fox - Colour Key'), key(5, 'Summer Owl key')]);
    expect(titles(d)).toEqual(['Winter Fox:1,2/3', 'Summer Owl:4/5']);
  });

  it('puts a page with no heading with the design before it, and shares a key that names no design', () => {
    const d = imp.splitDesigns(
      [chart(1, 'Winter Fox'), chart(2, null), chart(3, 'Summer Owl')],
      [key(4, 'Winter Fox key'), key(5, 'Summer Owl key'), key(6, 'Stitching notes')]);
    expect(titles(d)).toEqual(['Winter Fox:1,2/4,6', 'Summer Owl:3/5,6']);
  });

  it('keeps one chart whose pages are headed differently but share one key', () => {
    const d = imp.splitDesigns([chart(1, 'Top left'), chart(2, 'Top right')], [key(3, 'Colour key')]);
    expect(d).toHaveLength(1);
    expect(d[0].title).toBeNull();
  });

  it('does not split on page numbers in a heading', () => {
    const d = imp.splitDesigns([chart(1, 'Chart 1 of 2'), chart(2, 'Chart 2 of 2')], [key(3, 'Key 1'), key(4, 'Key 2')]);
    expect(d).toHaveLength(1);
  });
});

/* ── end to end ───────────────────────────────────────────────────────────── */

/* A booklet: "Winter Fox" over two chart pages in red and blue, its key, then
 * "Summer Owl" on one page in green and yellow, its key. Each chart page is a
 * 20 x 16 grid of filled cells. */
async function booklet() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const RED = rgb(0.8, 0.1, 0.15), BLUE = rgb(0.1, 0.25, 0.75), GREEN = rgb(0.15, 0.6, 0.25), YELLOW = rgb(0.95, 0.8, 0.15);
  const chartPage = (title, colourAt, details) => {
    const page = pdf.addPage([612, 792]);
    page.drawText(title, { x: 60, y: 740, size: 18, font });
    (details || []).forEach((detail, i) => page.drawText(detail, { x: 60, y: 710 - i * 12, size: 9, font }));
    const pitch = 12, x0 = 100, y0 = 300, cols = 20, rows = 16;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      page.drawRectangle({ x: x0 + c * pitch, y: y0 + (rows - 1 - r) * pitch, width: pitch, height: pitch, color: colourAt(c, r) });
    }
    for (let c = 0; c <= cols; c++) page.drawLine({ start: { x: x0 + c * pitch, y: y0 }, end: { x: x0 + c * pitch, y: y0 + rows * pitch }, thickness: 0.4, color: rgb(0.3, 0.3, 0.3) });
    for (let r = 0; r <= rows; r++) page.drawLine({ start: { x: x0, y: y0 + r * pitch }, end: { x: x0 + cols * pitch, y: y0 + r * pitch }, thickness: 0.4, color: rgb(0.3, 0.3, 0.3) });
  };
  const keyPage = (title, entries) => {
    const page = pdf.addPage([612, 792]);
    page.drawText(title, { x: 60, y: 740, size: 16, font });
    page.drawText('DMC stranded cotton', { x: 60, y: 700, size: 10, font });
    entries.forEach(([code, col], i) => {
      page.drawRectangle({ x: 60, y: 640 - i * 20, width: 10, height: 10, color: col });
      page.drawText(code, { x: 80, y: 641 - i * 20, size: 10, font });
    });
  };
  chartPage('Winter Fox', (c, r) => ((c + r) % 3 ? RED : BLUE), ['14 ct', 'Designed by Winter Artist']);
  chartPage('Winter Fox', (c, r) => ((c * r) % 4 ? BLUE : RED));
  keyPage('Winter Fox - Colour Key', [['321', RED], ['797', BLUE]]);
  chartPage('Summer Owl', (c, r) => (r < 8 ? GREEN : YELLOW), ['18 ct', 'Designed by Summer Artist']);
  keyPage('Summer Owl - Colour Key', [['699', GREEN], ['725', YELLOW]]);
  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('importing a booklet of two designs', () => {
  jest.setTimeout(60000);

  it('reads each design on its own, with its own key', async () => {
    const session = await newImporter().analyse(await booklet());
    expect(session.designs.map(d => d.title)).toEqual(['Winter Fox', 'Summer Owl']);
    expect(session.designs.map(d => d.pageIndexes)).toEqual([[1, 2], [4]]);
    expect(session.designs[0].session).toBe(session);

    const fox = session.build(session.placement);
    const owl = session.designs[1].session.build(session.designs[1].session.placement);
    const ids = (p) => [...new Set(p.pattern.filter(m => m.id !== '__skip__').map(m => m.id))].sort();
    expect(ids(fox)).toEqual(['321', '797']);
    expect(ids(owl)).toEqual(['699', '725']);
    expect(fox.name).toBe('Winter Fox');
    expect(owl.name).toBe('Summer Owl');
    expect(owl.settings.fabricCt).toBe(18);
    expect(owl.designer).toBe('Summer Artist');
    expect([owl.w, owl.h]).toEqual([20, 16]);
    expect(fox.importReport.warnings).toContain('This PDF holds 2 designs: Winter Fox and Summer Owl. Only Winter Fox was imported.');
    expect(owl.importReport.warnings).toContain('This PDF holds 2 designs: Winter Fox and Summer Owl. Only Summer Owl was imported.');
  });
});
