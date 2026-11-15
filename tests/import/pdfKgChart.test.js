/* tests/import/pdfKgChart.test.js — charts laid out as KG-Chart prints them.
 *
 * A 256 x 450 KG-Chart pattern, printed in colour and again in black and white,
 * imported with a grey line of stitches along every page edge, and the black-
 * and-white copy with three quarters of its stitches missing. What KG-Chart
 * does differently:
 *   - each page edge that continues onto another page is shaded by a grey band
 *     one cell thick, just outside the grid, with the rulers printed on it. Its
 *     edges sit one pitch from the grid's, so they passed for grid lines and
 *     each page read a cell too big on every shaded side. The band then read
 *     as stitches, and where pages overlap it overwrote the next page's own;
 *   - the rulers label each page's own first and last cell (66, 70, 80 ... 130);
 *   - its grid lines alternate 7.92 and 8.04 apart, so the median gap is not
 *     the pitch, and the sampled cells drifted a point across a page;
 *   - about half the symbols are drawn as shapes, not text: the same shape in
 *     the chart and the key, at half a cell and two thirds of a key box. In
 *     colour each cell is also filled with its thread's colour; in black and
 *     white the shape is all there is. The key draws each symbol in a square
 *     ruled by four lines, whose top rule was read as a backstitch sample.
 *
 * The PDFs here are made with pdf-lib to the same plan, at a smaller size: a
 * 70 x 60 design over four pages of 35 x 30.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
let pdfjs;
const { PDFDocument, StandardFonts, rgb, rectangle, fill, setFillingRgbColor, pushGraphicsState, popGraphicsState } = require('pdf-lib');

function loadImporter() {
  global.pdfjsLib = pdfjs;
  global.PdfAxisLabels = require(path.join(ROOT, 'pdf-axis-labels.js'));
  global.PdfRasterChart = require(path.join(ROOT, 'pdf-raster-chart.js'));
  // The pages load the thread table and colour maths before the importer.
  Object.assign(global, require(path.join(ROOT, 'dmc-data.js')));
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

/* ── the design ───────────────────────────────────────────────────────────── */

// Symbols drawn as shapes, as SVG paths in ems: y down, centred on 0.
const rectPath = (x, y, w, h) => `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
const K = 0.5523;
const circlePath = (r, reverse) => reverse
  ? `M ${r} 0 C ${r} ${-K * r} ${K * r} ${-r} 0 ${-r} C ${-K * r} ${-r} ${-r} ${-K * r} ${-r} 0 ` +
    `C ${-r} ${K * r} ${-K * r} ${r} 0 ${r} C ${K * r} ${r} ${r} ${K * r} ${r} 0 Z`
  : `M ${r} 0 C ${r} ${K * r} ${K * r} ${r} 0 ${r} C ${-K * r} ${r} ${-r} ${K * r} ${-r} 0 ` +
    `C ${-r} ${-K * r} ${-K * r} ${-r} 0 ${-r} C ${K * r} ${-r} ${r} ${-K * r} ${r} 0 Z`;
const SHAPES = {
  triangle: ['M 0.5 -0.5 L 0.5 0.5 L -0.5 0.5 Z'],
  E: [rectPath(-0.5, -0.5, 1, 0.15), rectPath(-0.5, -0.075, 1, 0.15), rectPath(-0.5, 0.35, 1, 0.15), rectPath(-0.5, -0.5, 0.15, 1)],
  plus: [rectPath(-0.5, -0.075, 1, 0.15), rectPath(-0.075, -0.5, 0.15, 1)],
  ring: [circlePath(0.5, false) + ' ' + circlePath(0.3, true)],
  // A bold arrow and a thin one: alike in outline, told apart by weight.
  boldArrow: ['M -0.5 0 L 0 -0.5 L 0 0.5 Z', rectPath(0, -0.14, 0.5, 0.28)],
  thinArrow: ['M 0 -0.5 L -0.5 0 L -0.38 0 L 0 -0.38 Z', 'M 0 0.5 L -0.5 0 L -0.38 0 L 0 0.38 Z', rectPath(-0.44, -0.06, 0.94, 0.12)],
};
// Each thread: its code and its symbol, drawn (a SHAPES name) or text.
const THREADS = [
  { code: '972', shape: 'triangle' },
  { code: '939', shape: 'E' },
  { code: '310', shape: 'plus' },
  { code: '3760', shape: 'ring' },
  { code: '3853', shape: 'boldArrow' },
  { code: '740', shape: 'thinArrow' },
  { code: '3341', text: 'g' },
  { code: 'B5200', text: 'n' },
];
const dmcRgb = (code) => {
  const { DMC } = require(path.join(ROOT, 'dmc-data.js'));
  return DMC.find(d => String(d.id) === code).rgb;
};

const W = 70, H = 60, PAGE_COLS = 35, PAGE_ROWS = 30;
// Patches of a few cells each, in an order no simple rule reproduces.
function design() {
  const out = [];
  let s = 12345;
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const patch = [];
  for (let i = 0; i < Math.ceil(W / 3) * Math.ceil(H / 3); i++) patch.push(Math.floor(rand() * THREADS.length));
  for (let r = 0; r < H; r++) {
    const row = [];
    for (let c = 0; c < W; c++) {
      const t = rand() < 0.15 ? Math.floor(rand() * THREADS.length) : patch[Math.floor(r / 3) * Math.ceil(W / 3) + Math.floor(c / 3)];
      row.push(t);
    }
    out.push(row);
  }
  return out;
}

/* ── the PDF ──────────────────────────────────────────────────────────────── */

const SHEET_W = 595, SHEET_H = 842;
const PITCH = 8, BAND = 8.6, LEFT = 50, TOP = 90;
// Rules alternate a little either side of the pitch, as KG-Chart's do.
const lineAt = (i) => i * PITCH + (i % 2 ? 0.07 : 0);

async function kgChart({ colour }) {
  const cells = design();
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const grey = (v) => rgb(v / 255, v / 255, v / 255);
  const yPdf = (yDown) => SHEET_H - yDown;
  // A filled rectangle as KG-Chart paints one, with the "re" operator: the
  // grid reader takes rectangles' edges as ruled lines.
  const fillRect = (page, x, yDown, w, h, c) => page.pushOperators(pushGraphicsState(),
    setFillingRgbColor(c[0] / 255, c[1] / 255, c[2] / 255), rectangle(x, yPdf(yDown + h), w, h), fill(), popGraphicsState());
  const drawSymbol = (page, t, cx, cy, em, ink) => {
    const th = THREADS[t];
    if (th.text) {
      const size = em * 1.2;
      page.drawText(th.text, { x: cx - font.widthOfTextAtSize(th.text, size) / 2, y: yPdf(cy) - size * 0.3, size, font, color: ink });
      return;
    }
    for (const d of SHAPES[th.shape]) page.drawSvgPath(d, { x: cx, y: yPdf(cy), scale: em, color: ink });
  };
  const label = (page, s, x, yDown, align) => {
    const size = 6, w = font.widthOfTextAtSize(s, size);
    page.drawText(s, { x: align === 'right' ? x - w : align === 'centre' ? x - w / 2 : x, y: yPdf(yDown), size, font, color: grey(0) });
  };

  for (let pr = 0; pr < H / PAGE_ROWS; pr++) {
    for (let pc = 0; pc < W / PAGE_COLS; pc++) {
      const page = pdf.addPage([SHEET_W, SHEET_H]);
      const c0 = pc * PAGE_COLS, r0 = pr * PAGE_ROWS;
      const gw = lineAt(PAGE_COLS), gh = lineAt(PAGE_ROWS);
      page.drawText('KG Test Chart', { x: 220, y: yPdf(30), size: 14, font });
      // The title's underline: four cells above the band on a lower page,
      // which is what pulled the band's grid four more rows up.
      page.drawLine({ start: { x: 200, y: yPdf(TOP - BAND - 4 * PITCH - 0.4) }, end: { x: 380, y: yPdf(TOP - BAND - 4 * PITCH - 0.4) }, thickness: 1.2, color: grey(0) });

      // Bands on the edges that continue onto another page.
      const band = (x, y, w, h) => fillRect(page, x, y, w, h, [220, 220, 220]);
      if (pc > 0) band(LEFT - BAND, TOP, BAND, gh);
      if (pc < W / PAGE_COLS - 1) band(LEFT + gw, TOP, BAND, gh);
      if (pr > 0) band(LEFT, TOP - BAND, gw, BAND);
      if (pr < H / PAGE_ROWS - 1) band(LEFT, TOP + gh, gw, BAND);

      for (let r = 0; r < PAGE_ROWS; r++) {
        for (let c = 0; c < PAGE_COLS; c++) {
          const t = cells[r0 + r][c0 + c];
          const x = LEFT + lineAt(c), y = TOP + lineAt(r), w = lineAt(c + 1) - lineAt(c), h = lineAt(r + 1) - lineAt(r);
          if (colour) fillRect(page, x, y, w, h, dmcRgb(THREADS[t].code));
          drawSymbol(page, t, x + w / 2, y + h / 2, PITCH * 0.5, grey(0));
        }
      }
      for (let c = 0; c <= PAGE_COLS; c++) {
        const bold = c === 0 || c === PAGE_COLS || (c0 + c) % 10 === 0;
        page.drawLine({ start: { x: LEFT + lineAt(c), y: yPdf(TOP) }, end: { x: LEFT + lineAt(c), y: yPdf(TOP + gh) }, thickness: bold ? 0.8 : 0.3, color: grey(bold ? 110 : 130) });
      }
      for (let r = 0; r <= PAGE_ROWS; r++) {
        const bold = r === 0 || r === PAGE_ROWS || (r0 + r) % 10 === 0;
        page.drawLine({ start: { x: LEFT, y: yPdf(TOP + lineAt(r)) }, end: { x: LEFT + gw, y: yPdf(TOP + lineAt(r)) }, thickness: bold ? 0.8 : 0.3, color: grey(bold ? 110 : 130) });
      }
      // Rulers: the page's first and last cell, and every tenth.
      for (let c = 0; c < PAGE_COLS; c++) {
        const n = c0 + c + 1;
        if (c !== 0 && c !== PAGE_COLS - 1 && n % 10 !== 0) continue;
        const x = LEFT + (lineAt(c) + lineAt(c + 1)) / 2;
        label(page, String(n), x, TOP - 2, 'centre');
        label(page, String(n), x, TOP + gh + 7, 'centre');
      }
      for (let r = 0; r < PAGE_ROWS; r++) {
        const n = r0 + r + 1;
        if (r !== 0 && r !== PAGE_ROWS - 1 && n % 10 !== 0) continue;
        const y = TOP + (lineAt(r) + lineAt(r + 1)) / 2 + 2;
        label(page, String(n), LEFT - 2, y, 'right');
        label(page, String(n), LEFT + gw + 2, y, 'left');
      }
    }
  }

  // The key: a ruled square for each thread with its symbol in it, filled
  // with the thread's colour in the colour copy.
  const key = pdf.addPage([SHEET_W, SHEET_H]);
  key.drawText('KG Test Chart', { x: 220, y: yPdf(30), size: 14, font });
  key.drawText('Stitch Count: ' + W + 'w x ' + H + 'h', { x: 60, y: yPdf(70), size: 9, font });
  key.drawText('Color Table (DMC)', { x: 60, y: yPdf(95), size: 9, font });
  const counts = THREADS.map((_, t) => cells.reduce((n, row) => n + row.filter(v => v === t).length, 0));
  const BOX = 11.4;
  THREADS.forEach((th, t) => {
    const x0 = 60, y0 = 110 + t * 18;
    if (colour) fillRect(key, x0, y0, BOX, BOX, dmcRgb(THREADS[t].code));
    const rule = (ax, ay, bx, by) => key.drawLine({ start: { x: ax, y: yPdf(ay) }, end: { x: bx, y: yPdf(by) }, thickness: 0.6, color: grey(130) });
    rule(x0, y0, x0 + BOX, y0); rule(x0 + BOX, y0, x0 + BOX, y0 + BOX);
    rule(x0, y0 + BOX, x0 + BOX, y0 + BOX); rule(x0, y0, x0, y0 + BOX);
    drawSymbol(key, t, x0 + BOX / 2, y0 + BOX / 2, BOX * 0.64, grey(0));
    key.drawText(th.code, { x: x0 + BOX + 6, y: yPdf(y0 + 8.5), size: 9, font });
    key.drawText('(' + counts[t] + ' ct)', { x: x0 + BOX + 50, y: yPdf(y0 + 8.5), size: 9, font });
  });

  const bytes = await pdf.save();
  return { buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), cells };
}

/* ── importing it ─────────────────────────────────────────────────────────── */

const pagesOf = (session) => session.pages.map(p => [p.pageIndex, p.cols, p.rows, p.initial && p.initial.col, p.initial && p.initial.row]);
const designIds = (cells) => cells.flat().map(t => THREADS[t].code);

describe('importing a KG-Chart chart', () => {
  jest.setTimeout(120000);
  let colour, mono;
  beforeAll(async () => {
    const [c, m] = await Promise.all([kgChart({ colour: true }), kgChart({ colour: false })]);
    const cs = await newImporter().analyse(c.buffer);
    const ms = await newImporter().analyse(m.buffer);
    colour = { cells: c.cells, session: cs, project: cs.build(cs.placement) };
    mono = { cells: m.cells, session: ms, project: ms.build(ms.placement) };
  });

  it('reads each page as its own cells, not the ruler bands around them', () => {
    const expected = [[1, 35, 30, 0, 0], [2, 35, 30, 35, 0], [3, 35, 30, 0, 30], [4, 35, 30, 35, 30]];
    expect(pagesOf(colour.session)).toEqual(expected);
    expect(pagesOf(mono.session)).toEqual(expected);
  });

  it('imports the colour chart cell for cell, every stitch read from the key', () => {
    const p = colour.project;
    expect([p.w, p.h]).toEqual([W, H]);
    expect(p.pattern.map(c => c.id)).toEqual(designIds(colour.cells));
    expect(p.importReport.matched.nearest).toBe(0);
    expect(p.importReport.matched.unresolved).toBe(0);
    expect(p.importReport.matched.partial).toBe(0);
    expect(p.importReport.warnings).toEqual([]);
  });

  it('reads the black-and-white key as cross stitch, with each drawn symbol', () => {
    const entries = mono.session.legend.entries;
    expect(entries.map(e => e.threadCode).sort()).toEqual(THREADS.map(t => t.code).sort());
    expect(entries.filter(e => e.kind === 'backstitch')).toEqual([]);
    for (const th of THREADS) {
      const e = entries.find(x => x.threadCode === th.code);
      if (th.text) expect(e.symbol).toBe(th.text);
      else expect(e.glyph).toMatch(/^vec:/);
      expect(e.swatchRgb).toBeNull();
    }
  });

  it('imports the black-and-white chart cell for cell by its drawn symbols', () => {
    const p = mono.project;
    expect([p.w, p.h]).toEqual([W, H]);
    expect(p.pattern.map(c => c.id)).toEqual(designIds(mono.cells));
    expect(p.importReport.matched.symbol).toBe(W * H);
    expect(p.importReport.warnings).toEqual([]);
    // The thread takes its catalogue colour, as the key prints none.
    expect(p.pattern.find(c => c.id === '972').rgb).toEqual(dmcRgb('972'));
  });

  it('gives the two copies the same chart', () => {
    expect(mono.project.pattern.map(c => c.id)).toEqual(colour.project.pattern.map(c => c.id));
  });
});

describe('a black-and-white chart whose key lacks a drawn symbol', () => {
  jest.setTimeout(120000);

  it('imports the cells as a numbered placeholder with a picture of the symbol, not as black thread', async () => {
    const { buffer, cells } = await kgChart({ colour: false });
    // Drop the ring from the key by reading the key page with its shapes for
    // 3760 removed: the importer is handed the key it would read.
    const imp = newImporter();
    const read = imp.parseLegend.bind(imp);
    imp.parseLegend = (legendPages, chartPages) => {
      const legend = read(legendPages, chartPages);
      legend.entries = legend.entries.filter(e => e.threadCode !== '3760');
      return legend;
    };
    const session = await imp.analyse(buffer);
    const p = session.build(session.placement);
    const rings = cells.flat().filter(t => THREADS[t].code === '3760').length;
    const ph = p.importReport.placeholders;
    expect(ph).toHaveLength(1);
    expect(ph[0]).toEqual(expect.objectContaining({ name: 'Drawn symbol 1 (not in key)', count: rings, reason: 'not-in-key' }));
    expect(p.pattern.filter(c => c.id === '310').length).toBe(cells.flat().filter(t => THREADS[t].code === '310').length);
    const sample = session.glyphSamples[ph[0].id];
    expect([sample.w, sample.h]).toEqual([PdfVectorGlyphs.N, PdfVectorGlyphs.N]);
  });
});
