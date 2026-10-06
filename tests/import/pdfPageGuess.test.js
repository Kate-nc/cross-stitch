/* tests/import/pdfPageGuess.test.js — arranging the pages of a chart that
 * prints no row or column numbers.
 *
 * pdf-importer's guessPageArrangement() works the arrangement out from the
 * pages' sizes (the last column and row of pages are usually narrower and
 * shorter) and from their edges (stitching runs on across a page break, and
 * some charts repeat a few lines there exactly). It must say nothing rather
 * than guess wrong: a null answer leaves the pages in page order for the
 * stitcher to arrange on the Pages tab.
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

/* ── a design, and pages cut from it ──────────────────────────────────────── */

const PALETTE = [
  [200, 30, 40], [240, 150, 160], [40, 120, 60], [120, 190, 90],
  [30, 60, 160], [120, 160, 220], [230, 200, 60], [120, 70, 40],
];
const THREADS = PALETTE.map((c, i) => ({ id: 'T' + i, rgb: c, lab: [0, 0, 0], name: 'T' + i }));

/* Smoothly varying colour regions with some unstitched ground, deliberately
 * lopsided so no page edge mirrors another. */
function design(w, h) {
  const at = (c, r) => {
    const v = 3.5 + 1.8 * Math.sin(c / 6.3 + 0.4) + 1.6 * Math.cos(r / 4.7 + 1.1) + 0.9 * Math.sin((c + 2 * r) / 9.1);
    if (Math.sin(c / 11.7) + Math.cos(r / 13.3 + 0.5) > 1.3) return null;  // unstitched
    return THREADS[Math.max(0, Math.min(7, Math.floor(v)))];
  };
  return { w, h, at };
}

/* Cut a design into pages `across` by `down` in reading order — along rows, or
 * down columns — each repeating `overlap` lines of its neighbours. The last
 * column and row take whatever is left, so they may be smaller. */
function cut(d, across, down, { byColumns = false, overlap = 0, tileW, tileH } = {}) {
  const tw = tileW || Math.ceil((d.w - overlap) / across);
  const th = tileH || Math.ceil((d.h - overlap) / down);
  const pages = [];
  for (let k = 0; k < across * down; k++) {
    const tc = byColumns ? Math.floor(k / down) : k % across;
    const tr = byColumns ? k % down : Math.floor(k / across);
    const c0 = tc * tw, r0 = tr * th;
    const cols = Math.min(tw + overlap, d.w - c0), rows = Math.min(th + overlap, d.h - r0);
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = d.at(c0 + c, r0 + r);
        cells.push({ col: c, row: r, isEmpty: !t, thread: t || null, symbol: '' });
      }
    }
    pages.push({ pageIndex: k + 1, cols, rows, cells, truth: { col: c0, row: r0 } });
  }
  return pages;
}

const guess = (pages) => newImporter().guessPageArrangement(pages);

function expectPlacedAsCut(pages, g) {
  const pl = newImporter().placementFromArrangement(pages, g);
  for (const p of pages) expect(pl.pages[p.pageIndex]).toEqual(p.truth);
}

/* ── from sizes ───────────────────────────────────────────────────────────── */

describe('arranging pages by their sizes', () => {
  it('reads the grid from the narrower last column and shorter last row', () => {
    const pages = cut(design(130, 170), 3, 4, { tileW: 50, tileH: 50 });
    // 50, 50, 30 across; 50, 50, 50, 20 down.
    expect(pages.map(p => p.cols).slice(0, 3)).toEqual([50, 50, 30]);
    const g = guess(pages);
    expect(g).toEqual(expect.objectContaining({ across: 3, down: 4, byColumns: false, basis: 'sizes' }));
    expectPlacedAsCut(pages, g);
  });

  it('recognises pages numbered down the columns', () => {
    const pages = cut(design(130, 170), 3, 4, { tileW: 50, tileH: 50, byColumns: true });
    const g = guess(pages);
    expect(g).toEqual(expect.objectContaining({ across: 3, down: 4, byColumns: true }));
    expectPlacedAsCut(pages, g);
  });

  it('finds sizes and repeated lines together', () => {
    const pages = cut(design(130, 170), 3, 4, { tileW: 50, tileH: 50, overlap: 3 });
    const g = guess(pages);
    expect(g.overlap).toEqual({ cols: 3, rows: 3 });
    expectPlacedAsCut(pages, g);
  });
});

/* ── from edges ───────────────────────────────────────────────────────────── */

describe('arranging equal pages by their edges', () => {
  it.each([
    [2, 2, false], [2, 2, true], [3, 2, false], [2, 3, true], [4, 3, false],
  ])('%i across by %i down, down the columns: %s', (across, down, byColumns) => {
    const pages = cut(design(across * 40, down * 36), across, down, { byColumns });
    expect(new Set(pages.map(p => p.cols + 'x' + p.rows)).size).toBe(1);   // sizes say nothing
    const g = guess(pages);
    expect(g).toEqual(expect.objectContaining({ across, down, byColumns, basis: 'edges' }));
    expect(g.overlap).toEqual({ cols: 0, rows: 0 });
    expectPlacedAsCut(pages, g);
  });

  it.each([2, 3, 5])('finds %i lines repeated at every page break', (overlap) => {
    const pages = cut(design(2 * 40 + overlap, 2 * 36 + overlap), 2, 2, { overlap });
    const g = guess(pages);
    expect(g.overlap).toEqual({ cols: overlap, rows: overlap });
    expectPlacedAsCut(pages, g);
  });

  it('finds repeated columns between pages in a single row', () => {
    const pages = cut(design(3 * 40 + 2, 36), 3, 1, { overlap: 2 });
    const g = guess(pages);
    expect(g).toEqual(expect.objectContaining({ across: 3, down: 1 }));
    expect(g.overlap.cols).toBe(2);
    expectPlacedAsCut(pages, g);
  });

  it('keeps page order for two pages side by side with nothing repeated', () => {
    expect(guess(cut(design(80, 36), 2, 1))).toBeNull();
  });

  it('says nothing when the pages carry no evidence', () => {
    // Four pages, each one solid colour: no edge resembles any other.
    const solid = (i) => ({
      pageIndex: i + 1, cols: 30, rows: 24,
      cells: Array.from({ length: 30 * 24 }, (_, k) => ({ col: k % 30, row: Math.floor(k / 30), isEmpty: false, thread: THREADS[i] })),
    });
    expect(guess([0, 1, 2, 3].map(solid))).toBeNull();
  });

  it('does not mistake a mirror-symmetric design for a repeated line', () => {
    // Symmetric about its vertical centre, which falls on the page break, so
    // the two columns either side of the break are identical.
    const base = design(40, 72);
    const mirrored = { w: 80, h: 72, at: (c, r) => base.at(c < 40 ? c : 79 - c, r) };
    const pages = cut(mirrored, 2, 2);
    const g = guess(pages);
    expect(g && g.overlap).toEqual({ cols: 0, rows: 0 });
  });
});

/* ── the layout model keeps the overlap ───────────────────────────────────── */

describe('page layout model and overlap', () => {
  const session = { pages: [1, 2, 3, 4].map(i => ({ pageIndex: i, cols: 30, rows: 20 })) };

  it('reads the overlap of a guessed placement back into slots', () => {
    const placement = { pages: { 1: { col: 0, row: 0 }, 2: { col: 28, row: 0 }, 3: { col: 0, row: 17 }, 4: { col: 28, row: 17 } },
      manual: false, overlap: { cols: 2, rows: 3 } };
    const slots = M.slotsFromPlacement(session, placement);
    expect(slots.overlap).toEqual({ cols: 2, rows: 3 });
    // and the slots rebuild the same offsets
    expect(M.placementFromSlots(session, slots).pages).toEqual(placement.pages);
    expect(M.placementFromSlots(session, slots).overlap).toEqual({ cols: 2, rows: 3 });
  });

  it('sets column and row repeats separately', () => {
    const slots = M.setOverlap(M.slotsFromPlacement(session, { pages: { 1: { col: 0, row: 0 }, 2: { col: 30, row: 0 } } }), 0, 2);
    expect(slots.overlap).toEqual({ cols: 0, rows: 2 });
  });
});

/* ── end to end ───────────────────────────────────────────────────────────── */

/* A chart cut into four equal pages with no row or column numbers, numbered
 * down the columns (1 top left, 2 below it, 3 top right, 4 below that), each
 * repeating `overlap` lines of its neighbours. */
async function rulerlessChart(overlap) {
  const d = design(2 * 30 + overlap, 2 * 24 + overlap);
  const pages = cut(d, 2, 2, { byColumns: true, overlap });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pitch = 12, x0 = 100, y0 = 200;
  for (const p of pages) {
    const page = pdf.addPage([612, 792]);
    page.drawText('Sampler - chart', { x: 200, y: 740, size: 16, font });
    for (const c of p.cells) {
      if (c.isEmpty) continue;
      const [r, g, b] = c.thread.rgb;
      page.drawRectangle({ x: x0 + c.col * pitch, y: y0 + (p.rows - 1 - c.row) * pitch, width: pitch, height: pitch,
        color: rgb(r / 255, g / 255, b / 255) });
    }
    for (let c = 0; c <= p.cols; c++) page.drawLine({ start: { x: x0 + c * pitch, y: y0 }, end: { x: x0 + c * pitch, y: y0 + p.rows * pitch }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) });
    for (let r = 0; r <= p.rows; r++) page.drawLine({ start: { x: x0, y: y0 + r * pitch }, end: { x: x0 + p.cols * pitch, y: y0 + r * pitch }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) });
  }
  const key = pdf.addPage([612, 792]);
  key.drawText('DMC colour key', { x: 60, y: 700, size: 14, font });
  ['321', '3716', '699', '704', '797', '799', '725', '898'].forEach((code, i) => {
    const [r, g, b] = PALETTE[i];
    key.drawRectangle({ x: 60, y: 640 - i * 20, width: 10, height: 10, color: rgb(r / 255, g / 255, b / 255) });
    key.drawText(code, { x: 80, y: 641 - i * 20, size: 10, font });
  });
  const bytes = await pdf.save();
  return { buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), pages, d };
}

describe('importing a rulerless chart', () => {
  jest.setTimeout(60000);

  it('arranges the pages itself, and still opens them for review', async () => {
    const { buffer, d } = await rulerlessChart(0);
    const session = await newImporter().analyse(buffer);
    expect(session.layoutSource).toBe('guessed');
    expect(session.tiling).toEqual({ across: 2, down: 2 });
    expect(session.placement.pages).toEqual({ 1: { col: 0, row: 0 }, 2: { col: 0, row: 24 }, 3: { col: 30, row: 0 }, 4: { col: 30, row: 24 } });
    expect(M.needsReview(session)).toBe(true);

    const p = session.build(session.placement);
    expect([p.w, p.h]).toEqual([d.w, d.h]);
    expect(p.importReport.layout).toBe('guessed');
    expect(p.importReport.warnings.join(' ')).toMatch(/arranged 2 pages across by matching their edges/);
  });

  it('merges the lines each page repeats', async () => {
    const { buffer, d } = await rulerlessChart(3);
    const session = await newImporter().analyse(buffer);
    expect(session.placement.overlap).toEqual({ cols: 3, rows: 3 });
    const p = session.build(session.placement);
    expect([p.w, p.h]).toEqual([d.w, d.h]);
    expect(p.importReport.warnings.join(' ')).toMatch(/repeats 3 columns and 3 rows/);
    // Every stitch where the design has one.
    for (let r = 0; r < d.h; r += 7) {
      for (let c = 0; c < d.w; c += 5) {
        expect(p.pattern[r * p.w + c].id === '__skip__').toBe(!d.at(c, r));
      }
    }
  });
});
