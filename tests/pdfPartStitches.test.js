/* tests/pdfPartStitches.test.js — half, quarter and three-quarter stitches
 * in PDF export.
 *
 * Pattern Keeper compatibility: a pattern without part stitches must print
 * exactly as it always has. The digests below were taken from main before
 * part stitches were drawn (and match it byte for byte); the real worker
 * runs in a VM with pdf-lib's UMD build and a frozen clock, as in
 * pdfKnots.test.js, so its output is deterministic. If one changes, the
 * Pattern Keeper preset's bytes changed: check that was meant.
 *
 * Then a pattern with part stitches is built and read back with pdf.js:
 * every thread, including one used only in part stitches, has its symbol on
 * the chart and in the key, the key has a part-stitch column, and the page
 * plan still matches.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const layout = require('../creator/pdfChartLayout');

const ROOT = path.join(__dirname, '..');
const FIXED = Date.UTC(2026, 0, 1);

function loadWorker() {
  const ctx = { console, atob: b => Buffer.from(b, 'base64').toString('binary'), setTimeout, TextEncoder, TextDecoder };
  ctx.self = ctx;
  ctx.postMessage = () => {};
  ctx.importScripts = (...files) => files.forEach(f => {
    const file = /pdf-lib/.test(f) ? 'node_modules/pdf-lib/dist/pdf-lib.min.js' : f;
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  });
  vm.createContext(ctx);
  vm.runInContext('var RD = Date; Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(' + FIXED + '); } static now() { return ' + FIXED + '; } };', ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'pdf-export-worker.js'), 'utf8'), ctx, { filename: 'pdf-export-worker.js' });
  return ctx;
}

const BLACK = { id: '310', name: 'Black', rgb: [0, 0, 0], type: 'solid' };
const RED = { id: '666', name: 'Bright Red', rgb: [227, 29, 66], type: 'solid' };
const q = (c) => ({ id: c.id, rgb: c.rgb });

function plain(partialStitches) {
  const palette = [Object.assign({}, BLACK), Object.assign({}, RED)];
  const pattern = [];
  for (let i = 0; i < 20 * 20; i++) pattern.push(Object.assign({}, palette[i % 3 === 0 ? 1 : 0]));
  return { name: 'Locked', w: 20, h: 20, pattern, palette, partialStitches, bsLines: [], fabricCt: 14 };
}
const PK = { pageSize: 'auto', marginsMm: 12, stitchesPerPage: 'medium', chartModes: ['bw', 'colour'], overlap: true,
  includeCover: true, includeInfo: true, includeIndex: true, miniLegend: true, locale: 'en-GB', branding: {}, theme: 'pk' };
const WORKSHOP = Object.assign({}, PK, { theme: 'workshop' });

let worker;
beforeAll(() => { worker = loadWorker(); });
const build = async (p, o) => Buffer.from(await worker.buildPdf(JSON.parse(JSON.stringify(p)), Object.assign({}, o), 1));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

describe('without part stitches the PDF is unchanged', () => {
  test('the Pattern Keeper preset and the Workshop theme keep main\'s bytes', async () => {
    expect(sha(await build(plain(null), PK))).toBe('3316ea13a154f2193ab3f96f448a7bd70c7078bab30a857d74c4c0fcf4fbf07b');
    expect(sha(await build(plain(null), WORKSHOP))).toBe('db3b2246f427ea2ea610e17f558162e7862363347e51dd7a3b35179de0701410');
  }, 60000);

  test('no part stitches and an empty list print the same', async () => {
    const base = await build(plain(null), PK);
    expect((await build(plain([]), PK)).equals(base)).toBe(true);
    expect((await build(plain(undefined), PK)).equals(base)).toBe(true);
  }, 60000);

  test('a list of only empty entries keeps main\'s bytes too', async () => {
    // main notes "Partial / quarter stitches" on the info page for any
    // non-empty list, even of empty cells; that stays as it was.
    expect(sha(await build(plain([[5, {}], [6, { TL: null }]]), PK))).toBe('a5982fbb18728a59f708e49655cffb7f4f8412561f27c41a7ba4063b8c60412d');
  }, 60000);
});

// A 6 x 4 pattern: a red 3/4 + black 1/4 cell, a red half stitch, two
// crossing halves, and a blue quarter. Blue is used only in part stitches
// and missing from the palette.
const BLUE = { id: '797', rgb: [19, 71, 125] };
function withParts() {
  const palette = [Object.assign({}, BLACK), Object.assign({}, RED)];
  const empty = { id: '__empty__', rgb: [255, 255, 255] };
  const pattern = [];
  for (let i = 0; i < 24; i++) pattern.push(Object.assign({}, i < 6 ? RED : empty));
  const partialStitches = [
    [7, { TL: q(RED), BL: q(RED), BR: q(RED), TR: q(BLACK) }],
    [8, { BL: q(RED), TR: q(RED) }],
    [9, { BL: q(RED), TR: q(RED), TL: q(BLACK), BR: q(BLACK) }],
    [10, { BR: q(BLUE) }],
    [2, { TL: q(BLACK) }],                       // over a full red stitch: red 3/4 + black 1/4
  ];
  return { name: 'Parts', w: 6, h: 4, pattern, palette, partialStitches, bsLines: [], fabricCt: 14 };
}

async function readPdf(bytes) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false,
    standardFontDataUrl: path.join(__dirname, '../node_modules/pdfjs-dist/standard_fonts/') }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    pages.push({ items: (await page.getTextContent()).items, width: page.view[2], height: page.view[3] });
  }
  await doc.destroy();
  return pages;
}
const PUA = (s) => Array.from(s).filter(ch => ch.codePointAt(0) >= 0xE000 && ch.codePointAt(0) <= 0xE06F);

describe('with part stitches', () => {
  test('every thread has its symbol on the chart and in the key, and the plan matches', async () => {
    for (const opts of [PK, WORKSHOP]) {
      const p = withParts();
      const plan = layout.planExport(p, opts);
      const pages = await readPdf(await build(p, opts));
      expect(pages).toHaveLength(plan.totalPages);

      const keyPage = pages.find(pg => pg.items.some(t => t.str.startsWith('Thread Legend')));
      const keySymbols = new Set(keyPage.items.flatMap(t => PUA(t.str)));
      expect(keySymbols.size).toBe(3);                          // black, red and blue
      expect(keyPage.items.some(t => t.str === 'Part stitches')).toBe(true);
      const labels = keyPage.items.map(t => t.str).filter(s => /[¼½¾]/.test(s));
      expect(labels).toEqual(expect.arrayContaining(['1 ½, 2 ¼', '2 ¾, 2 ½', '1 ¼']));

      const chartPages = pages.filter(pg => pg.items.some(t => /^Columns /.test(t.str)));
      expect(chartPages).toHaveLength(2);                        // B&W and colour
      for (const pg of chartPages) {
        const chartSymbols = new Set(pg.items.flatMap(t => PUA(t.str)));
        for (const s of keySymbols) expect(chartSymbols.has(s)).toBe(true);
        for (const t of pg.items.filter(t => PUA(t.str).length)) {
          expect(t.transform[4]).toBeGreaterThanOrEqual(0);
          expect(t.transform[4] + t.width).toBeLessThanOrEqual(pg.width);
        }
      }

      const info = pages.find(pg => pg.items.some(t => t.str === 'Stitch Types Used'));
      const infoText = info.items.map(t => t.str);
      expect(infoText).toEqual(expect.arrayContaining(['• Three-quarter stitches', '• Half stitches', '• Quarter stitches']));
      expect(infoText.filter(s => /Total stitches/.test(s))).toEqual(['Total stitches: 5 + 8 part stitches']);
    }
  }, 60000);

  test('a thread used only in part stitches is named from the catalogue when the project is built', () => {
    const ctx = { console };
    ctx.window = ctx;
    ctx.findThreadInCatalog = (brand, id) => {
      if (brand === 'anchor' && id === '403') return { id: '403', name: 'Anchor Black', rgb: [0, 0, 0] };
      if (id === '797') return { id: '797', name: 'Royal Blue', rgb: [19, 71, 125] };
      if (id === '310') return { id: '310', name: 'Black', rgb: [0, 0, 0] };
      if (id === '666') return { id: '666', name: 'Bright Red', rgb: [227, 29, 66] };
      return null;
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'creator/pdfExport.js'), 'utf8'), ctx, { filename: 'pdfExport.js' });
    const p = withParts();
    // Works for both Map and saved Array forms of partialStitches.
    for (const psInput of [new Map(p.partialStitches), p.partialStitches]) {
      const out = ctx.PdfExport.buildExportProject({ pal: p.palette, pat: p.pattern, sW: 6, sH: 4, partialStitches: psInput });
      expect(out.palette.map(e => e.id)).toEqual(['310', '666', '797']);
      expect(out.palette[2]).toMatchObject({ name: 'Royal Blue', type: 'solid' });
      expect(out.partialStitches).toEqual(p.partialStitches);
    }
    // Blends, per-stitch brands, numeric IDs, and ignoring sentinels / out-of-bounds.
    const extra = ctx.PdfExport.buildExportProject({
      pal: p.palette, pat: p.pattern, sW: 6, sH: 4,
      partialStitches: [
        [11, { TL: { id: '310+666', rgb: [113, 14, 33] }, TR: { id: '403', brand: 'anchor', rgb: [0, 0, 0] }, BL: { id: 797, rgb: [19, 71, 125] }, BR: { id: '__empty__' } }],
        [12, { TL: { id: '' }, TR: { id: '__skip__' } }],
        [99, { TL: { id: '999', rgb: [1, 2, 3] } }],
      ],
    });
    expect(extra.palette.map(e => e.id)).toEqual(['310', '666', '310+666', '403', '797']);
    expect(extra.palette[2]).toMatchObject({ type: 'blend', name: 'Black + Bright Red' });
    expect(extra.palette[2].threads).toHaveLength(2);
    expect(extra.palette[3]).toMatchObject({ brand: 'anchor', name: 'Anchor Black', type: 'solid' });
    expect(extra.palette[4]).toMatchObject({ id: '797', name: 'Royal Blue', type: 'solid' });
    // Without part stitches the palette is exactly the one given.
    const none = ctx.PdfExport.buildExportProject({ pal: p.palette, pat: p.pattern, sW: 6, sH: 4 });
    expect(none.palette.map(e => e.id)).toEqual(['310', '666']);
  });

  test('partial entries that all collapse to full stitches add missing threads and omit the Part stitches column', async () => {
    const empty = { id: '__empty__', rgb: [255, 255, 255] };
    const pattern = Array.from({ length: 24 }, (_, i) => (i < 4 ? Object.assign({}, RED) : Object.assign({}, empty)));
    const p = {
      name: 'All full', w: 6, h: 4, pattern, palette: [Object.assign({}, RED)],
      partialStitches: [
        [0, { TL: q(RED) }],                                             // over full RED -> full RED
        [5, { TL: q(BLUE), TR: q(BLUE), BL: q(BLUE), BR: q(BLUE) }],     // 4 quarters of BLUE not in palette -> full BLUE
      ],
      bsLines: [], fabricCt: 14,
    };
    const pages = await readPdf(await build(p, PK));
    const keyPage = pages.find(pg => pg.items.some(t => t.str.startsWith('Thread Legend')));
    expect(keyPage.items.some(t => t.str === 'Part stitches')).toBe(false);
    expect(new Set(keyPage.items.flatMap(t => PUA(t.str))).size).toBe(2);
    const info = pages.find(pg => pg.items.some(t => t.str === 'Stitch Types Used'));
    const infoText = info.items.map(t => t.str);
    expect(infoText.some(s => /Partial|Three-quarter|Half|Quarter/.test(s))).toBe(false);
    expect(infoText.filter(s => /Total stitches/.test(s))).toEqual(['Total stitches: 5']);
  }, 60000);
});

describe('layout helpers', () => {
  test('usedThreadCounts leaves cells drawn as part stitches to them, and lists part-only threads', () => {
    const p = withParts();
    expect({ ...layout.usedThreadCounts(p) }).toEqual({ '666': 5, '310': 0, '797': 0 });
    expect({ ...layout.usedThreadCounts(plain(null)) }).toEqual({ '666': 134, '310': 266 });
  });

  test('partStitchEntries deduplicates indices and ignores invalid indices and sentinel IDs', () => {
    const entries = layout.partStitchEntries({
      w: 4, h: 4,
      partialStitches: [
        [null, { TL: q(RED) }],
        ['', { TL: q(RED) }],
        [false, { TL: q(RED) }],
        [2, { TL: { id: '__empty__' }, TR: { id: '__skip__' }, BL: { id: '' } }],
        [3, { TL: q(RED) }],
        [3, { BR: q(BLACK) }],          // duplicate index: last wins
        [4, { TL: q(RED) }],
        [4, {}],                         // overwritten with empty: removed
      ],
    });
    expect(entries).toEqual([[3, { BR: q(BLACK) }]]);
  });

  test('partStitchInstructions reads a cell as the chart on screen does', () => {
    const I = layout.partStitchInstructions;
    expect(I({ TL: q(RED), BL: q(RED), BR: q(RED), TR: q(BLACK) }, null)).toEqual([
      { id: '666', rgb: RED.rgb, type: 'threeQuarter', emptyCorner: 'TR' },
      { id: '310', rgb: BLACK.rgb, type: 'quarter', corner: 'TR' }]);
    expect(I({ TL: q(BLACK) }, RED)).toEqual([
      { id: '666', rgb: RED.rgb, type: 'threeQuarter', emptyCorner: 'TL' },
      { id: '310', rgb: BLACK.rgb, type: 'quarter', corner: 'TL' }]);
    expect(I({ BL: q(RED), TR: q(RED) }, null)).toEqual([{ id: '666', rgb: RED.rgb, type: 'half', dir: 'fwd' }]);
    expect(I({ TL: q(RED) }, RED)).toEqual([{ id: '666', rgb: RED.rgb, type: 'full' }]);
    // Two adjacent quarters of one thread are two quarters, not lost.
    expect(I({ TL: q(RED), TR: q(RED) }, null).map(i => i.type + i.corner)).toEqual(['quarterTL', 'quarterTR']);
    // Sentinel IDs in quadrants fall back to the base stitch rather than emitting fake threads.
    expect(I({ TL: { id: '__empty__' }, TR: { id: '__skip__' }, BL: { id: '' }, BR: q(BLACK) }, null)).toEqual([
      { id: '310', rgb: BLACK.rgb, type: 'quarter', corner: 'BR' }]);
  });

  test('symbols sit inside the cell and clear of each other', () => {
    const cases = [
      [{ TL: q(RED), BL: q(RED), BR: q(RED), TR: q(BLACK) }, null],
      [{ BL: q(RED), TR: q(RED), TL: q(BLACK), BR: q(BLACK) }, null],
      [{ BL: q(RED), TR: q(RED), TL: q(BLACK) }, null],
      [{ BL: q(RED), TR: q(RED), TL: q(BLACK), BR: q(BLUE) }, null],
      [{ TL: q(RED), BR: q(RED), TR: q(BLACK), BL: q(BLUE) }, null],
      [{ BR: q(RED) }, null],
    ];
    for (const [ps, base] of cases) {
      const ins = layout.partStitchInstructions(ps, base);
      const spots = layout.partStitchSymbolSpots(ins);
      expect(spots).toHaveLength(ins.length);
      spots.forEach((s, i) => {
        expect(s.x - s.size / 2).toBeGreaterThanOrEqual(0);
        expect(s.x + s.size / 2).toBeLessThanOrEqual(1);
        expect(s.y - s.size / 2).toBeGreaterThanOrEqual(0);
        expect(s.y + s.size / 2).toBeLessThanOrEqual(1);
        spots.forEach((o, j) => { if (j > i) expect(Math.hypot(s.x - o.x, s.y - o.y)).toBeGreaterThan(0.2); });
        // A half stitch symbol must sit clear of its own diagonal band and on bare fabric.
        if (ins[i].type === 'half') {
          const distToDiag = ins[i].dir === 'fwd' ? Math.abs(s.x + s.y - 1) / Math.SQRT2 : Math.abs(s.x - s.y) / Math.SQRT2;
          expect(distToDiag).toBeGreaterThan(0.2);
          expect(layout.partStitchAt(ins, s.x, s.y)).toBeNull();
        }
      });
    }
  });

  test('a 3/4 or 1/4 symbol is inside its own triangle', () => {
    const ins = layout.partStitchInstructions({ TL: q(RED), BL: q(RED), BR: q(RED), TR: q(BLACK) }, null);
    const spots = layout.partStitchSymbolSpots(ins);
    spots.forEach((s, i) => expect(layout.partStitchAt(ins, s.x, s.y)).toBe(ins[i]));
  });

  test('partStitchLabel and partStitchCounts', () => {
    expect(layout.partStitchLabel({ threeQuarter: 42, half: 12, quarter: 3 })).toBe('42 ¾, 12 ½, 3 ¼');
    expect(layout.partStitchLabel({ threeQuarter: 0, half: 2, quarter: 0 })).toBe('2 ½');
    expect({ ...layout.partStitchCounts(withParts()) }).toEqual({
      '666': { threeQuarter: 2, half: 2, quarter: 0 },
      '310': { threeQuarter: 0, half: 1, quarter: 2 },
      '797': { threeQuarter: 0, half: 0, quarter: 1 },
    });
  });
});

// The colour chart's part stitches are drawn as charting software draws
// them, so the app's own PDF importer reads them back exactly.
describe('importing an exported colour chart', () => {
  let pdfjs;
  beforeAll(async () => {
    pdfjs = await import(path.join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'));
    global.pdfjsLib = pdfjs;
    for (const [name, file] of [['PdfAxisLabels', 'pdf-axis-labels.js'], ['PdfRasterChart', 'pdf-raster-chart.js'],
      ['PdfKeyReader', 'pdf-key-reader.js'], ['PdfChartGeometry', 'pdf-chart-geometry.js'],
      ['PdfPicturePixels', 'pdf-picture-pixels.js'], ['PdfVectorGlyphs', 'pdf-vector-glyphs.js']]) {
      global[name] = require(path.join(ROOT, file));
    }
  });

  // 20 x 14 (the importer wants a chart of some size): a black border, red
  // rows inside it, and part stitches on the blank rows below them.
  function roundTripProject() {
    const W = 20, H = 14, pattern = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      pattern.push(border ? Object.assign({}, BLACK) : y <= 6 ? Object.assign({}, RED) : { id: '__empty__', rgb: [255, 255, 255] });
    }
    const at = (x, y) => y * W + x;
    const partialStitches = [
      [at(3, 9), { TL: q(RED), BL: q(RED), BR: q(RED), TR: q(BLACK) }],    // 3/4 + 1/4
      [at(5, 9), { BL: q(RED), TR: q(RED) }],                               // half /
      [at(7, 9), { TL: q(RED), BR: q(RED), BL: q(BLACK), TR: q(BLACK) }],   // crossing halves
      [at(9, 9), { BL: q(BLACK) }],                                         // a lone quarter
      [at(11, 9), { TL: q(BLACK), TR: q(BLACK), BR: q(BLACK) }],            // a lone 3/4
      [at(13, 9), { TR: q(RED), BR: q(RED), BL: q(RED), TL: q(BLACK) }],   // 3/4 + 1/4, turned
    ];
    return { name: 'Round trip', w: W, h: H, pattern, palette: [Object.assign({}, BLACK), Object.assign({}, RED)], partialStitches, bsLines: [], fabricCt: 14 };
  }

  test('every full and part stitch comes back with its thread and no phantom backstitches', async () => {
    const p = roundTripProject();
    const bytes = await build(p, Object.assign({}, PK, { chartModes: ['colour'], includeIndex: false }));
    const raw = fs.readFileSync(path.join(ROOT, 'pdf-importer.js'), 'utf8');
    const Importer = new Function(raw + '\nreturn PatternKeeperImporter;')();
    const imp = new Importer();
    pdfjs.GlobalWorkerOptions.workerSrc = path.join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
    const got = await imp.import(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

    const blank = (c) => !c || c.id === '__empty__' || c.id === '__skip__';
    const ids = (e) => e ? ['TL', 'TR', 'BL', 'BR'].filter(k => e[k]).map(k => k + ':' + String(e[k].id).replace(/^dmc:/i, '')).join(' ') : '';
    const want = new Map(p.partialStitches), back = new Map(got.partialStitches || []);
    for (let i = 0; i < p.w * p.h; i++) {
      if (want.has(i)) expect([i, ids(back.get(i))]).toEqual([i, ids(want.get(i))]);
      else expect([i, blank(got.pattern[i]), back.has(i)]).toEqual([i, blank(p.pattern[i]), false]);
    }
    expect(got.bsLines || []).toEqual([]);
  }, 60000);
});
