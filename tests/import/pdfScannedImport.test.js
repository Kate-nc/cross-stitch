/* tests/import/pdfScannedImport.test.js — importing a chart that exists only
 * as a picture: a scan, or a chart printed to an image.
 *
 * Such PDFs used to fail with "No chart pages detected". The end-to-end test
 * builds one in memory — a chart drawn with node-canvas, embedded as the whole
 * page with pdf-lib — and imports it through pdf.js, as the app does.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const pdfjs = require(path.join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.js'));
const { createCanvas } = require('canvas');
const { PDFDocument } = require('pdf-lib');

function loadImporter() {
  global.pdfjsLib = pdfjs;
  global.PdfAxisLabels = require(path.join(ROOT, 'pdf-axis-labels.js'));
  global.PdfRasterChart = require(path.join(ROOT, 'pdf-raster-chart.js'));
  const raw = fs.readFileSync(path.join(ROOT, 'pdf-importer.js'), 'utf8');
  // eslint-disable-next-line no-eval
  eval(raw + '\nthis.PatternKeeperImporter = PatternKeeperImporter;');
  return this.PatternKeeperImporter;
}
const PatternKeeperImporter = loadImporter();
const canvasFactory = {
  create: (w, h) => { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; },
  reset: (cc, w, h) => { cc.canvas.width = w; cc.canvas.height = h; },
  destroy: () => {},
};
const newImporter = () => {
  const imp = new PatternKeeperImporter({ canvasFactory });
  // The loader points pdf.js at the browser worker; run it in-process here.
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.js');
  return imp;
};

/* A scanned chart: cols x rows cells, `cell(c, r)` giving a colour or null. */
async function scannedPdf(cols, rows, cell) {
  const pitch = 18, x0 = 60, y0 = 90;
  const w = x0 * 2 + cols * pitch, h = y0 * 2 + rows * pitch;
  const cv = createCanvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1a1a7a'; ctx.fillRect(20, 40, w - 40, 3);          // title rule
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rgb = cell(c, r);
      if (!rgb) continue;
      ctx.fillStyle = 'rgb(' + rgb.join(',') + ')';
      ctx.fillRect(x0 + c * pitch, y0 + r * pitch, pitch, pitch);
      ctx.fillStyle = '#fff';                                             // a symbol on it
      ctx.fillRect(x0 + c * pitch + 6, y0 + r * pitch + 6, 6, 6);
    }
  }
  ctx.fillStyle = '#444';
  for (let c = 0; c <= cols; c++) ctx.fillRect(x0 + c * pitch, y0, 1, rows * pitch + 1);
  for (let r = 0; r <= rows; r++) ctx.fillRect(x0, y0 + r * pitch, cols * pitch + 1, 1);

  const pdf = await PDFDocument.create();
  const img = await pdf.embedPng(cv.toBuffer('image/png'));
  const page = pdf.addPage([w / 2, h / 2]);                               // 144 dpi
  page.drawImage(img, { x: 0, y: 0, width: w / 2, height: h / 2 });
  return pdf.save();
}

describe('findPageImages', () => {
  it('maps an image through the current matrix to its place on the page', () => {
    const imp = newImporter();
    const OPS = pdfjs.OPS;
    const vp = { convertToViewportPoint: (x, y) => [x, 800 - y] };
    const out = imp.findPageImages({
      fnArray: [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
      argsArray: [null, [400, 0, 0, 600, 50, 100], ['img1', 1600, 2400], null],
    }, vp);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(expect.objectContaining({ x0: 50, x1: 450, y0: 100, y1: 700, pxW: 1600, pxH: 2400 }));
  });
});

describe('scannedChartPages', () => {
  const imp = newImporter();
  it('picks pages that are mostly one picture', () => {
    const pages = [
      { pageIndex: 1, width: 600, height: 800, images: [{ x0: 0, y0: 0, x1: 600, y1: 800 }] },
      { pageIndex: 2, width: 600, height: 800, images: [{ x0: 0, y0: 0, x1: 100, y1: 100 }] },  // a logo
      { pageIndex: 3, width: 600, height: 800, images: [] },
    ];
    expect(imp.scannedChartPages(pages).map(s => s.page.pageIndex)).toEqual([1]);
  });
});

describe('scannedThreads', () => {
  const imp = newImporter();
  it('makes a distinct placeholder thread for each symbol', () => {
    const t = imp.scannedThreads({ colours: [], symbols: [{ count: 9 }, { count: 4 }, { count: 2 }] });
    expect(t.symbol.map(s => s.id)).toEqual(['S1', 'S2', 'S3']);
    expect(t.symbol[0].name).toMatch(/Symbol 1/);
    expect(new Set(t.symbol.map(s => s.rgb.join(','))).size).toBe(3);
  });
});

describe('importing a scanned chart end to end', () => {
  jest.setTimeout(60000);

  it('reads the grid, the stitches and their colours from the picture', async () => {
    const red = [200, 40, 40], blue = [40, 90, 190];
    // A 24 x 16 design with a blank margin of two cells all round.
    const cell = (c, r) => (c < 2 || r < 2 || c >= 22 || r >= 14) ? null : ((c + r) % 3 ? red : blue);
    const bytes = await scannedPdf(24, 16, cell);
    const project = await newImporter().import(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

    expect(project.importReport.layout).toBe('scanned-image');
    // Trimmed to the stitches: 20 x 12.
    expect(project.w).toBe(20);
    expect(project.h).toBe(12);
    const stitched = project.pattern.filter(m => m.id !== '__skip__');
    expect(stitched).toHaveLength(20 * 12);
    // Two colours (placeholder ids here, as the DMC table is not loaded).
    expect(new Set(stitched.map(m => m.id)).size).toBe(2);
    expect(project.importReport.warnings.join(' ')).toMatch(/scanned image/);
  });

  it('still reports no chart for a PDF with neither vectors nor a picture', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 300]);
    const bytes = await pdf.save();
    await expect(newImporter().import(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)))
      .rejects.toThrow(/No chart pages detected/);
  });
});
