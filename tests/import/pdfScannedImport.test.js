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
    // Marked, so the review offers each one up for a thread.
    expect(t.symbol.every(s => s.placeholder === 'scanned')).toBe(true);
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

/* ── several scanned pages ────────────────────────────────────────────────── */

/* One scanned page: a cols x rows chart, `cell(c, r)` giving
 * { rgb?, glyph? } or null, drawn as a scanner would see it. */
function drawChartPage(cols, rows, cell) {
  const pitch = 18, x0 = 60, y0 = 90;
  const w = x0 * 2 + cols * pitch, h = y0 * 2 + rows * pitch;
  const cv = createCanvas(w, h);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = cell(c, r);
      if (!v) continue;
      const x = x0 + c * pitch, y = y0 + r * pitch;
      if (v.rgb) { ctx.fillStyle = 'rgb(' + v.rgb.join(',') + ')'; ctx.fillRect(x, y, pitch, pitch); }
      ctx.fillStyle = v.rgb ? '#fff' : '#000';
      if (v.glyph === 1) ctx.fillRect(x + 4, y + 8, 10, 3);                // a bar
      else if (v.glyph === 2) ctx.fillRect(x + 8, y + 3, 3, 12);           // a stem
      else ctx.fillRect(x + 6, y + 6, 6, 6);                               // a square
    }
  }
  ctx.fillStyle = '#444';
  for (let c = 0; c <= cols; c++) ctx.fillRect(x0 + c * pitch, y0, 1, rows * pitch + 1);
  for (let r = 0; r <= rows; r++) ctx.fillRect(x0, y0 + r * pitch, cols * pitch + 1, 1);
  return cv;
}

/* A page of a printed key, scanned: swatches and lines of text, no grid. */
function drawKeyPage() {
  const cv = createCanvas(700, 900);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 700, 900);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = 'rgb(' + [(i * 70) % 255, (i * 130) % 255, (i * 40) % 255].join(',') + ')';
    ctx.fillRect(60, 80 + i * 50, 30, 30);
    ctx.fillStyle = '#222';
    ctx.fillRect(110, 92 + i * 50, 200 + (i * 37) % 150, 6);
  }
  return cv;
}

async function scannedBook(canvases) {
  const pdf = await PDFDocument.create();
  for (const cv of canvases) {
    const img = await pdf.embedPng(cv.toBuffer('image/png'));
    const page = pdf.addPage([cv.width / 2, cv.height / 2]);
    page.drawImage(img, { x: 0, y: 0, width: cv.width / 2, height: cv.height / 2 });
  }
  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('importing a chart scanned across several pages', () => {
  jest.setTimeout(120000);

  // A 40 x 30 design in four colours, in smooth regions so that stitching
  // runs on across the page breaks, cut into four 20 x 15 pages.
  const PALETTE = [[200, 40, 40], [40, 90, 190], [60, 160, 80], [230, 180, 40]];
  const design = (c, r) => {
    const v = Math.floor(2 + 1.4 * Math.sin(c / 5.3 + 0.3) + 1.2 * Math.cos(r / 4.1 + 0.8));
    return { rgb: PALETTE[Math.max(0, Math.min(3, v))], glyph: 0 };
  };
  const tile = (tc, tr) => drawChartPage(20, 15, (c, r) => design(tc * 20 + c, tr * 15 + r));

  it('reads every chart page, sets the key page aside, and arranges the pages', async () => {
    const buffer = await scannedBook([tile(0, 0), tile(1, 0), tile(0, 1), tile(1, 1), drawKeyPage()]);
    const session = await newImporter().analyse(buffer);
    expect(session.scanned).toBe(true);
    expect(session.pages.map(p => p.pageIndex)).toEqual([1, 2, 3, 4]);
    expect(session.layoutSource).toBe('guessed');
    expect(session.placement.pages).toEqual({ 1: { col: 0, row: 0 }, 2: { col: 20, row: 0 }, 3: { col: 0, row: 15 }, 4: { col: 20, row: 15 } });

    const p = session.build(session.placement);
    expect([p.w, p.h]).toEqual([40, 30]);
    expect(p.importReport.warnings.join(' ')).toMatch(/Scanned page 5 was not read as part of the chart/);
    expect(p.importReport.warnings.join(' ')).toMatch(/scanned image/);
    // The same thread on every page: four colours, not four per page.
    expect(new Set(p.pattern.filter(m => m.id !== '__skip__').map(m => m.id)).size).toBe(4);
  });

  it('cuts a picture of each scanned symbol for the review to show', async () => {
    const glyphAt = (c, r) => ({ glyph: (c * 2 + r) % 3 });
    const buffer = await scannedBook([drawChartPage(24, 16, glyphAt)]);
    const session = await newImporter().analyse(buffer);
    const p = session.build(session.placement);
    const ids = p.importReport.placeholders.map(x => x.id);
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      const s = session.glyphSamples[id];
      expect(s).toBeTruthy();
      expect(s.w).toBeGreaterThan(10);
      expect(s.data).toHaveLength(s.w * s.h * 4);
    }
    // Not saved with the project.
    expect(JSON.stringify(p)).not.toMatch(/glyphSamples/);
  });
});
