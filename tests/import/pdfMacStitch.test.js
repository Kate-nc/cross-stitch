/* tests/import/pdfMacStitch.test.js — charts laid out as MacStitch prints them.
 *
 * MacStitch's 76-page Pokémon chart (lord-libidan…pdf) imported 290 wide
 * instead of 299, with its key misread and its black-and-white copy placed on
 * top of the colour one. What it does differently:
 *   - the key is a table: a swatch filling a whole cell, "DMC 704", then
 *     strands, length and stitch count as bare numbers under headings;
 *   - the last page of each row holds nine columns, none a multiple of ten,
 *     so it prints row numbers but no column numbers;
 *   - the whole chart is printed twice, in colour and then in black and white,
 *     and the rulers place both copies on the same cells;
 *   - the page is painted white, the margins masked with white strips running
 *     to the paper's edge, and arrowheads mark the centre row outside the grid.
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

/* ── the parts ────────────────────────────────────────────────────────────── */

describe('a key laid out as a table', () => {
  const text = (str, x, y) => ({ str, x, y, width: str.length * 5, height: 9 });
  const cell = (x0, y0, x1, y1, fill) => ({ type: 'rect', fillColor: fill, points: [{ x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y0 }, { x: x0, y: y0 }, { x: x0, y: y1 }] });
  const page = {
    pageIndex: 75, width: 595, height: 842,
    textItems: [
      text('Number', 118, 29), text('Strands', 243, 29), text('Length', 307, 29), text('Stitches', 417, 29),
      text('DMC 704', 118, 47), text('2', 296, 47), text('0.2 Skeins', 365, 47), text('947', 480, 47),
      text('DMC 722', 118, 65), text('2', 296, 65), text('0.3 Skeins', 365, 65), text('1234', 475, 65),
    ],
    vectorPaths: [
      cell(12, 38, 110, 50, [134, 164, 42]), cell(504, 38, 580, 50, [134, 164, 42]),
      cell(12, 56, 110, 68, [233, 150, 75]), cell(504, 56, 580, 68, [233, 150, 75]),
    ],
  };
  let imp;
  beforeAll(() => { imp = newImporter(); });

  it('reads each value by the column it sits under, and a cell-wide swatch', () => {
    const entries = imp.parseKeyEntries(page, null);
    expect(entries.map(e => [e.threadCode, e.stitchCount, e.strands, e.swatchRgb, e.symbol, e.colorName])).toEqual([
      ['704', 947, 2, [134, 164, 42], null, null],
      ['722', 1234, 2, [233, 150, 75], null, null],
    ]);
  });
});

describe('page furniture around a MacStitch chart', () => {
  const rect = (x0, y0, x1, y1, fill) => ({ type: 'rect', fillColor: fill, points: [{ x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y0 }, { x: x0, y: y0 }, { x: x0, y: y1 }] });
  const line = (x0, y0, x1, y1) => ({ type: 'line', stroked: true, strokeColor: [0, 0, 0], lineWidth: 0.2, points: [{ x: x0, y: y0 }, { x: x1, y: y1 }] });
  // A 10 x 8 grid at pitch 9, from (30, 50); the sheet painted white and its
  // margins masked; a centre arrowhead just left of the grid.
  const pitch = 9, gx = 30, gy = 50, cols = 10, rows = 8;
  const paths = [rect(0, 0, 595, 842, [255, 255, 255]), rect(gx, gy, gx + cols * pitch, gy + rows * pitch, [255, 255, 254])];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) paths.push(rect(gx + c * pitch, gy + r * pitch, gx + (c + 1) * pitch, gy + (r + 1) * pitch, [134, 164, 42]));
  for (let c = 0; c <= cols; c++) paths.push(line(gx + c * pitch, gy, gx + c * pitch, gy + rows * pitch));
  for (let r = 0; r <= rows; r++) paths.push(line(gx, gy + r * pitch, gx + cols * pitch, gy + r * pitch));
  paths.push(rect(0, 0, gx - 1, 842, [255, 255, 255]), rect(0, 0, 595, gy - 1, [255, 255, 255]),
    rect(gx + cols * pitch + 1, 0, 595, 842, [255, 255, 255]), rect(0, gy + rows * pitch + 1, 595, 842, [255, 255, 255]));
  paths.push({ type: 'path', fillColor: [0, 0, 0], points: [{ x: gx - pitch, y: gy + 4 * pitch - 4 }, { x: gx - pitch, y: gy + 4 * pitch + 4 }, { x: gx, y: gy + 4 * pitch }] });
  const page = { pageIndex: 3, width: 595, height: 842, vectorPaths: paths, textItems: [] };
  let imp;
  beforeAll(() => { imp = newImporter(); });

  it('finds the grid, not the margin masks around it', () => {
    const g = imp.detectGrid(page);
    expect([g.originX, g.originY, g.columns, g.rows]).toEqual([gx, gy, cols, rows]);
  });

  it('bounds the chart by its stitches, not the sheet, the backdrop or the centre arrow', () => {
    const box = imp.chartContentBox(page, pitch, pitch);
    expect([box.x0, box.y0, box.x1, box.y1]).toEqual([gx, gy, gx + cols * pitch, gy + rows * pitch]);
  });
});

describe('a title from the document info', () => {
  let imp;
  beforeAll(() => { imp = newImporter(); });
  const page = { pageIndex: 1, textItems: [{ str: '10', height: 8, x: 0, y: 0 }] };
  it('is used when the pages print none and it is a real name', () => {
    expect(imp.readTitleAndDesigner([page], { Title: 'pokemon gen 1 ext' }).title).toBe('pokemon gen 1 ext');
  });
  it('is not, when it is a placeholder or the software\'s name', () => {
    for (const t of ['document', 'KG-Chart', 'Untitled 3', 'Microsoft Word - fox.docx', 'fox.pdf']) {
      expect(imp.readTitleAndDesigner([page], { Title: t }).title).toBeUndefined();
    }
  });
});

/* ── end to end ───────────────────────────────────────────────────────────── */

/* An 89 x 40 design over three pages: two of 40 columns, labelled every ten,
 * and a remainder of 9 columns (81-89) that holds no multiple of ten and so
 * prints row numbers only. Then the same three pages again in black and white
 * (symbols, no colour), and a table key. */
async function macStitchChart() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const THREADS = [['321', rgb(0.8, 0.1, 0.15), 'X'], ['797', rgb(0.1, 0.25, 0.75), 'O'], ['725', rgb(0.95, 0.75, 0.15), 'Z']];
  const W = 89, H = 40;
  const threadAt = (c, r) => (c + 2 * r) % 7 < 3 ? 0 : (c * r) % 5 === 0 ? 1 : 2;
  const counts = [0, 0, 0];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) counts[threadAt(c, r)]++;
  const pitch = 8, gx = 60, gyTop = 100;
  const tiles = [[0, 40], [40, 40], [80, 9]];
  const chartPage = (colour) => ([c0, n]) => {
    const page = pdf.addPage([595, 842]);
    page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(1, 1, 1) });
    const X = (c) => gx + c * pitch, Y = (r) => 842 - (gyTop + r * pitch);       // r = 0 at the top
    for (let r = 0; r < H; r++) for (let c = 0; c < n; c++) {
      const t = threadAt(c0 + c, r);
      if (colour) page.drawRectangle({ x: X(c), y: Y(r + 1), width: pitch, height: pitch, color: THREADS[t][1] });
      else page.drawText(THREADS[t][2], { x: X(c) + 2, y: Y(r + 1) + 2, size: 6, font });
    }
    for (let c = 0; c <= n; c++) page.drawLine({ start: { x: X(c), y: Y(0) }, end: { x: X(c), y: Y(H) }, thickness: c % 10 === 0 ? 0.6 : 0.2, color: rgb(0, 0, 0) });
    for (let r = 0; r <= H; r++) page.drawLine({ start: { x: X(0), y: Y(r) }, end: { x: X(n), y: Y(r) }, thickness: r % 10 === 0 ? 0.6 : 0.2, color: rgb(0, 0, 0) });
    // Column numbers above, every ten; row numbers to the left, every ten.
    for (let c = 1; c <= n; c++) if ((c0 + c) % 10 === 0) page.drawText(String(c0 + c), { x: X(c - 1), y: Y(0) + 4, size: 7, font });
    for (let r = 1; r <= H; r++) if (r % 10 === 0) page.drawText(String(r), { x: gx - 16, y: Y(r) + 1, size: 7, font });
    // Margins masked to the paper's edge, as MacStitch does.
    page.drawRectangle({ x: 0, y: 0, width: gx - 20, height: 842, color: rgb(1, 1, 1) });
  };
  tiles.forEach(chartPage(true));
  tiles.forEach(chartPage(false));
  const key = pdf.addPage([595, 842]);
  key.drawText('Number', { x: 118, y: 800, size: 9, font });
  key.drawText('Strands', { x: 243, y: 800, size: 9, font });
  key.drawText('Length', { x: 307, y: 800, size: 9, font });
  key.drawText('Stitches', { x: 417, y: 800, size: 9, font });
  THREADS.forEach(([code, col], i) => {
    const y = 780 - i * 18;
    key.drawRectangle({ x: 12, y: y - 4, width: 98, height: 16, color: col });
    key.drawText('DMC ' + code, { x: 118, y, size: 9, font });
    key.drawText('2', { x: 296, y, size: 9, font });
    key.drawText('0.1 Skeins', { x: 365, y, size: 9, font });
    key.drawText(String(counts[i]), { x: 480, y, size: 9, font });
  });
  key.drawText('14 ct ' + W + 'x' + H + ' Stitches', { x: 60, y: 600, size: 9, font });
  const bytes = await pdf.save();
  return { buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), counts, threadAt, W, H };
}

describe('importing a chart printed as MacStitch prints it', () => {
  jest.setTimeout(90000);

  it('places the remainder page, reads the colour copy once, and matches the key', async () => {
    const { buffer, counts, threadAt, W, H } = await macStitchChart();
    const project = await newImporter().import(buffer);
    const s = project._layoutSession;
    const r = project.importReport;

    expect([project.w, project.h]).toEqual([W, H]);
    // The colour pages placed, the remainder after the other two.
    expect(Object.keys(s.placement.pages).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(s.placement.pages[3]).toEqual({ col: 80, row: 0 });
    // The black-and-white copies set aside.
    expect(s.pages.filter(p => p.reason === 'duplicate').map(p => p.pageIndex)).toEqual([4, 5, 6]);
    expect(r.warnings.join(' ')).toMatch(/Pages 4–6 repeat another page in a different style/);
    // Every stitch matched to the key by its swatch, in the right thread.
    expect(r.matched.swatch).toBe(W * H);
    const ids = ['321', '797', '725'];
    for (const [c, row] of [[0, 0], [41, 7], [88, 39], [80, 20], [85, 3]]) {
      expect(project.pattern[row * W + c].id).toBe(ids[threadAt(c, row)]);
    }
    // And the stitch counts the key prints.
    const perThread = (r.checks || []).find(c => /count/.test(c.what));
    expect(perThread && perThread.ok).toBe(true);
    expect(counts.reduce((a, b) => a + b)).toBe(W * H);
  });
});
