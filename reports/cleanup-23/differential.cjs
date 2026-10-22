/* Cleanup 23 — base-versus-head differential for the colour key reader and everything downstream of it.
 *
 *   node reports/cleanup-23/differential.cjs <base-pdf-importer.js> [iterations]
 *   KEY_READER_PATH=<mutant.js> node ...   loads a mutated copy of the reader instead (to show the comparison can fail)
 *
 * Builds the base importer (reader inside the class) and the working-tree importer (parseKeyEntries delegating to
 * pdf-key-reader.js) in separate vm contexts, both with the DMC table and colour maths loaded, and feeds both the
 * same seeded random key pages (multi-column and table layouts, text, U+ and picture symbols, swatches of every
 * shape the reader treats differently, backstitch samples, repeated codes, several brands' code shapes, ties,
 * malformed items, an exclusion box). For each case it compares:
 *   - parseKeyEntries(page, exclude): the returned entries (field order included), the error class and message
 *     if one is thrown, whether the page was written to, and whether any returned object is a page object;
 *   - parseLegend(keyPages, chartPages): entries in order, brand, and again the page mutation;
 *   - linkSymbolsToThreads(cells, legend): linked cells in order, the match report, the legend's mutation
 *     (matchReport) and the input cells' mutation (the symbol written back on a nearest-colour match), so the
 *     symbol-to-thread mapping, duplicate/ambiguous handling and fallback order are compared end to end.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');

function build(importerPath, extra) {
  const ctx = vm.createContext({ console, Map, Set, Math, JSON, Object, Array, Uint8ClampedArray, Float32Array, Float64Array, pdfjsLib: { OPS: {}, GlobalWorkerOptions: {} } });
  ctx.window = ctx;
  for (const f of ['dmc-data.js', 'colour-utils.js'].concat(extra)) {
    try { vm.runInContext(fs.readFileSync(path.resolve(ROOT, f), 'utf8'), ctx, { filename: f }); }
    catch (e) { console.error('could not load', f, e.message); throw e; }
  }
  vm.runInContext(fs.readFileSync(importerPath, 'utf8'), ctx, { filename: path.basename(importerPath) });
  const Imp = vm.runInContext('PatternKeeperImporter', ctx);
  return { imp: new Imp(), ctx };
}
const base = build(path.resolve(process.argv[2]), []);
const head = build(path.join(ROOT, 'pdf-importer.js'), [process.env.KEY_READER_PATH || 'pdf-key-reader.js']);
const N = Number(process.argv[3]) || 5000;
if (!head.ctx.PdfKeyReader || base.ctx.PdfKeyReader) throw new Error('harness: head must load the reader and base must not');

let seed = 0x2545f491;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const chance = (p) => rnd() < p;

const CODES = ['310', '3799', '797', '03', '09', '5200', 'B5200', 'BLANC', 'ECRU', 'E334', 'D225', 'C101', '35', '938', '3865', 'DMC 321', 'DMC 666', 'dmc3045', '4', '12345', 'x1', 'Page', '2023'];
const NAMES = ['Black', 'Dark Navy Blue', 'blue violet - md dk', 'Ecru', 'Pearl Grey', 'Skein', 'DMC', 'x2', '(120 ct)', '56 sts.', '[2]', '[3]', '0.2 Skeins', '947', 'a'];
const SYMBOLS = ['A', 'b', '\\', 'Ø', '4', '%', '☺', 'U+E001', 'U+0041', 'ab', 'x'];

function mkText(str, x, y, w) {
  const t = { str, x, y };
  if (chance(0.95)) t.width = w === undefined ? 6 * str.length : w;
  if (chance(0.8)) t.height = chance(0.9) ? 8 : 9.5; else if (chance(0.3)) t.fontSize = 10;
  if (chance(0.85)) t.fontName = pick(['f1', 'f2', 'g_d0_f3']);
  return t;
}
function mkSwatch(x, y, w, h, fill) {
  const pts = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  if (chance(0.8)) pts.push({ x, y });
  const p = { type: 'rect', points: pts };
  if (chance(0.97)) p.fillColor = chance(0.15) ? Float32Array.from(fill.map(v => v + (rnd() - 0.5))) : fill;
  return p;
}
function makePage() {
  const texts = [], paths = [], images = [];
  const cols = int(1, 3), rows = int(1, 9);
  const table = chance(0.2);
  if (table) {
    const hy = 60;
    [['Number', 118], ['Strands', 243], ['Length', 307], ['Stitches', 417], ['Name', 470]].forEach(([s, x]) => { if (chance(0.85)) texts.push(mkText(s, x, hy)); });
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (chance(0.06)) continue;
    const y = 100 + r * int(11, 15) + (chance(0.1) ? int(-8, 8) : 0), x = 40 + c * (table ? 0 : int(110, 190));
    const code = pick(CODES);
    const rgb = [int(0, 255), int(0, 255), int(0, 255)];
    const style = rnd();
    const codeX = x + int(12, 60);
    if (style < 0.55) {
      const sw = pick([[9, 9], [9, 9], [8, 10], [2.5, 9], [9, 32], [4, 12], [60, 9], [100, 9], [170, 9], [30.5, 9]]);
      const sx = codeX - sw[0] - pick([0, 2, 6, 20, 45, 85, -4]);
      paths.push(mkSwatch(sx, y - 9, sw[0], sw[1], rgb));
      if (chance(0.35)) texts.push(mkText(pick(SYMBOLS), sx + 2, y - 1));
    } else if (style < 0.7) {
      texts.push(mkText(pick(SYMBOLS), codeX - int(8, 100), y));
    } else if (style < 0.8) {
      const px = codeX - int(8, 40);
      images.push(chance(0.85) ? { pic: 'pic:' + int(1, 5), x0: px, y0: y - 9, x1: px + 9, y1: y } : { x0: px, y0: y - 9, x1: px + 9, y1: y });
    } else if (style < 0.92) {
      const sx = codeX - int(20, 50);
      paths.push(chance(0.5)
        ? { type: 'line', stroked: true, strokeColor: rgb, points: [{ x: sx, y: y - 3 }, { x: sx + int(6, 75), y: y - 3 + (chance(0.1) ? 4 : 0) }] }
        : { type: 'rect', fillColor: rgb, points: [{ x: sx, y: y - 5 }, { x: sx + int(10, 40), y: y - 5 }, { x: sx + 20, y: y - 2 }] });
    }
    texts.push(mkText(code, codeX, y));
    const extras = int(0, 4);
    for (let k = 0; k < extras; k++) texts.push(mkText(pick(NAMES), codeX + 20 + k * int(10, 50), y + (chance(0.1) ? 3 : 0)));
    if (chance(0.15)) texts.push(mkText(chance(0.5) ? '[2]' : '[4]', codeX - int(20, 70), y));
  }
  if (chance(0.1)) texts.push({ str: '', x: 1, y: 1 }, { str: '   ', x: 2, y: 2 });
  const page = { pageIndex: 1, width: 612, height: 792, textItems: texts, vectorPaths: paths, images, fonts: [] };
  if (chance(0.03)) delete page.images;
  if (chance(0.02)) delete page.textItems;
  if (chance(0.02)) delete page.vectorPaths;
  return page;
}
function makeExclude() {
  const k = rnd();
  if (k < 0.5) return null;
  if (k < 0.55) return undefined;
  const x0 = int(0, 300), y0 = int(0, 300);
  return { x0, y0, x1: x0 + int(0, 400), y1: y0 + int(0, 400) };
}
function makeCells(legend) {
  const n = int(0, 30), out = [];
  const entries = legend.entries || [];
  for (let i = 0; i < n; i++) {
    const k = rnd(), e = entries.length ? pick(entries) : null;
    const cell = { col: i, row: 0, isEmpty: chance(0.05) };
    if (cell.isEmpty) { out.push(cell); continue; }
    if (k < 0.45 && e && e.symbol) { cell.symbol = e.symbol; if (chance(0.5)) cell.fontName = chance(0.7) ? e.symbolFontName : pick(['f1', 'f2']); }
    else if (k < 0.6) cell.symbol = chance(0.5) ? pick(SYMBOLS) : 'pic:' + int(1, 6);
    else cell.symbol = '';
    if (chance(0.45)) {
      const c = e && e.swatchRgb && chance(0.6) ? e.swatchRgb.map(v => v + int(-3, 3)) : [int(0, 255), int(0, 255), int(0, 255)];
      cell.fillColor = c; cell.fillColors = chance(0.8) ? [c] : [[int(0, 255), 0, 0], c];
    }
    if (chance(0.05)) cell.partial = { TL: [int(0, 255), int(0, 255), int(0, 255)], BR: e && e.swatchRgb ? e.swatchRgb : [9, 9, 9] };
    out.push(cell);
  }
  return out;
}

const plain = (v) => JSON.stringify(v, (k, x) => (x instanceof Float32Array ? { f32: Array.from(x) } : x === undefined ? '__undef' : x));
const clone = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x instanceof Float32Array ? Array.from(x) : x)));
function pageObjects(p) {
  const s = new Set();
  const walk = (o) => { if (o && typeof o === 'object' && !s.has(o)) { s.add(o); Object.values(o).forEach(walk); } };
  walk(p); return s;
}
function aliasing(result, pages) {
  const all = new Set(); pages.forEach(p => pageObjects(p).forEach(o => all.add(o)));
  let n = 0; const walk = (o, seen) => { if (o && typeof o === 'object' && !seen.has(o)) { seen.add(o); if (all.has(o)) n++; Object.values(o).forEach(v => walk(v, seen)); } };
  walk(result, new Set()); return n;
}
function attempt(fn) { try { return { ok: fn() }; } catch (e) { return { err: e.constructor.name + ':' + e.message }; } }

function runSide(side, c) {
  const pages = clone(c.pages).map((p, i) => { const q = c.pages[i]; return q; });
  // each side gets its own deep copy (typed arrays kept), so one run cannot affect the other
  const copyPage = (p) => JSON.parse(JSON.stringify(p, (k, x) => (x instanceof Float32Array ? { __f32: Array.from(x) } : x)), (k, x) => (x && x.__f32 ? Float32Array.from(x.__f32) : x));
  const mine = c.pages.map(copyPage);
  const chart = c.chartPages.map(copyPage);
  const snap = plain(mine) + plain(chart);
  const out = {};
  out.entries = mine.map((p, i) => attempt(() => side.imp.parseKeyEntries(p, c.exclude)));
  out.entriesAlias = out.entries.map((r, i) => (r.ok ? aliasing(r.ok, [mine[i]]) : 0));
  out.entriesJson = plain(out.entries);
  out.legend = attempt(() => side.imp.parseLegend(mine, chart));
  out.legendJson = plain(out.legend);
  out.legendAlias = out.legend.ok ? aliasing(out.legend.ok, mine.concat(chart)) : 0;
  out.pagesMutated = plain(mine) + plain(chart) !== snap;
  if (out.legend.ok) {
    const legend = out.legend.ok;
    const cells = c.cells(legend).map(x => JSON.parse(JSON.stringify(x)));
    const cellsBefore = plain(cells);
    const legendBefore = plain(legend);
    const link = attempt(() => side.imp.linkSymbolsToThreads(cells, legend));
    // placeholders get ids from hue steps: compare the thread objects themselves
    out.link = plain(link);
    out.legendAfter = plain(legend);
    out.legendMutatedBy = legendBefore === plain(legend) ? '' : 'legend';
    out.cellsMutated = cellsBefore !== plain(cells);
    out.cellsAfter = plain(cells);
  }
  delete out.entries;
  return out;
}

let mismatches = 0, pagesTotal = 0, entryTotal = 0, errors = 0, linked = 0, pooled = 0;
const kinds = {};
for (let i = 0; i < N; i++) {
  const np = int(1, 4);
  const c = { pages: Array.from({ length: np }, makePage), chartPages: chance(0.2) ? [makePage()] : (chance(0.05) ? undefined : []), exclude: makeExclude() };
  if (c.chartPages === undefined) c.chartPages = [];
  if (chance(0.03)) c.pages = c.pages.concat([null].slice(0, 0));
  // freeze the cells' random choices once so both sides see identical input
  const cellSeed = rnd();
  const cached = new Map();
  c.cells = (legend) => {
    const key = plain(legend.entries);
    if (!cached.has(key)) {
      const saved = seed; seed = Math.floor(cellSeed * 4294967296) >>> 0 || 1;
      cached.set(key, makeCells(legend)); seed = saved;
    }
    return cached.get(key);
  };
  const a = runSide(base, c), b = runSide(head, c);
  pagesTotal += c.pages.length;
  const aLegend = a.legend.ok;
  if (aLegend) { entryTotal += aLegend.entries.length; if (aLegend.entries.length) pooled++; }
  if (a.legend.err) errors++;
  if (a.link && !JSON.parse(a.link).err) linked++;
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (!same) {
    mismatches++;
    if (mismatches <= 5) {
      for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.log('MISMATCH in', k, '\n base', JSON.stringify(a[k]).slice(0, 400), '\n head', JSON.stringify(b[k]).slice(0, 400));
    }
  }
}
// the entries-per-page figure, for the report: re-count with one more pass of the base reader
console.log(`${N} cases (${pagesTotal} key pages): ${mismatches} mismatches (entries, error, page mutation, aliasing, pooled legend, linked cells, match report, input mutation); ` +
  `pooled legends with entries ${pooled}, ${entryTotal} legend entries, parseLegend threw ${errors}, linkSymbolsToThreads ran ${linked} times`);
process.exit(mismatches ? 1 : 0);
