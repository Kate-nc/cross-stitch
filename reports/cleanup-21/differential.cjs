/* Cleanup 21 — base-versus-head differential for the five moved calculations.
 *
 *   node reports/cleanup-21/differential.cjs <base-pdf-importer.js> [iterations]
 *
 * Builds the base importer (arithmetic inside the class) and the working-tree
 * importer (delegating to pdf-chart-geometry.js) in separate vm contexts, feeds
 * both the same seeded random inputs and compares: the return value (NaN,
 * Infinity, -0 and undefined are told apart), the error class and message when
 * one is thrown, whether any input was written to, and whether the returned
 * object is one of the inputs (identity). Inputs include malformed shapes.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');

function build(importerPath, extra) {
  const ctx = vm.createContext({ console, Map, Set, Math, JSON, Object, Array, pdfjsLib: { OPS: {}, GlobalWorkerOptions: {} } });
  ctx.window = ctx;
  for (const f of extra) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  vm.runInContext(fs.readFileSync(importerPath, 'utf8'), ctx, { filename: path.basename(importerPath) });
  return new (vm.runInContext('PatternKeeperImporter', ctx))();
}
const base = build(path.resolve(process.argv[2]), []);
const head = build(path.join(ROOT, 'pdf-importer.js'), ['pdf-chart-geometry.js']);
const N = Number(process.argv[3]) || 20000;

let seed = 0x9e3779b9;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const num = () => pick([0, 1, -1, 0.5, NaN, Infinity, -Infinity, undefined, null, '7', 4.0000001, rnd() * 600, rnd() * 600, rnd() * 20, Math.round(rnd() * 60) * 0.5]);
const pos = () => rnd() < 0.9 ? rnd() * 700 : num();
const pitch = () => rnd() < 0.8 ? 4 + rnd() * 14 : num();
const rgb = () => rnd() < 0.2 ? [255, 255, 255] : rnd() < 0.05 ? undefined : [Math.floor(rnd() * 256), Math.floor(rnd() * 256), Math.floor(rnd() * 256)];
function pathObj(p) {
  const x = pos(), y = pos(), w = rnd() * 80 * (rnd() < 0.2 ? 6 : 1), h = rnd() * 40 * (rnd() < 0.2 ? 8 : 1);
  const k = rnd();
  const points = k < 0.5 ? [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }]
    : k < 0.75 ? [{ x, y }, { x: x + (rnd() < 0.5 ? w : w / 3), y: y + (rnd() < 0.5 ? 0 : h / 2) }, { x: x + w / 2, y: y + h }]
    : k < 0.85 ? [] : k < 0.9 ? [{ x: num(), y: num() }] : [{ x, y }, { x: x + w, y: y + h }];
  return { type: 'path', fillColor: rnd() < 0.85 ? rgb() : undefined, lineWidth: 1, points };
}
function pageObj() {
  const pg = {};
  if (rnd() < 0.9) pg.width = pick([612, 595, 842, 0, undefined, 100, 300 + rnd() * 400]);
  if (rnd() < 0.9) pg.height = pick([792, 842, 0, undefined, 100, 300 + rnd() * 500]);
  if (rnd() < 0.95) pg.vectorPaths = Array.from({ length: Math.floor(rnd() * 12) }, pathObj);
  if (rnd() < 0.9) pg.textItems = Array.from({ length: Math.floor(rnd() * 14) }, () => ({
    str: pick(['A', '1', '7', '12', 'AB', ' x ', '', 'Title', '9', undefined]), x: pos(), y: pos(), width: num(), height: rnd() < 0.8 ? 8 : num(), fontName: 'f' }));
  if (rnd() < 0.3) pg.images = Array.from({ length: Math.floor(rnd() * 4) }, () => ({ pic: rnd() < 0.7, x0: pos(), x1: pos(), y0: pos(), y1: pos() }));
  return pg;
}
function labels(first, n, pitchV, origin, axisX, rot) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = origin + (i + (rnd() < 0.3 ? 0 : 0.5)) * pitchV + (rnd() < 0.2 ? rnd() * 3 : 0);
    const v = rnd() < 0.05 ? num() : first + i * pick([1, 1, 1, 5]);
    out.push(axisX ? { value: v, x: c - 4, y: 90, width: 8, height: 8, rotated: rot } : { value: v, x: 90, y: c + 4, width: 8, height: 8, rotated: rot });
  }
  return out;
}
function gridObj() {
  if (rnd() < 0.05) return pick([null, undefined, {}]);
  return { originX: 100 + (rnd() < 0.3 ? rnd() * 5 : 0), originY: 100, cellWidth: pitch(), cellHeight: pitch(), columns: Math.floor(rnd() * 60), rows: Math.floor(rnd() * 60), boldLineInterval: pick([5, 10, 0, undefined]) };
}
function rulerObj(g) {
  if (rnd() < 0.05) return pick([null, undefined, {}]);
  const gx = g && g.cellWidth > 0 ? g.cellWidth : 10, gy = g && g.cellHeight > 0 ? g.cellHeight : 10;
  const px = rnd() < 0.8 ? gx * (1 + (rnd() - 0.5) * 0.12) : pitch(), py = rnd() < 0.8 ? gy * (1 + (rnd() - 0.5) * 0.12) : pitch();
  const rot = rnd() < 0.2;
  const first = Math.floor(rnd() * 50) - 3;
  return {
    pitchX: px, pitchY: py, colBase: rnd() * 40 - 10, rowBase: rnd() * 40 - 10,
    colLabels: rnd() < 0.05 ? undefined : labels(first, Math.floor(rnd() * 8), px, (g && g.originX) || 100, true, rot),
    rowLabels: rnd() < 0.05 ? undefined : labels(first + 7, Math.floor(rnd() * 8), py, (g && g.originY) || 100, false, rot),
  };
}
const spanObj = () => rnd() < 0.05 ? undefined : { colStart: Math.floor(rnd() * 50), rowStart: Math.floor(rnd() * 50), columns: Math.floor(rnd() * 40), rows: Math.floor(rnd() * 40) };

const enc = (v) => JSON.stringify(v, (k, x) => x === undefined ? '__undef__' : typeof x === 'number' && (!isFinite(x) || Object.is(x, -0)) ? '__n:' + String(x) + (Object.is(x, -0) ? '-0' : '') : x);
function outcome(imp, method, args) {
  const before = enc(args);
  let res, err = null;
  try { res = imp[method](...args); } catch (e) { err = (e && e.constructor && e.constructor.name) + ': ' + (e && e.message); }
  const identity = args.map((a, i) => a && typeof a === 'object' && res === a ? i : -1).filter(i => i >= 0);
  return { res: err ? undefined : enc(res), err, mutated: enc(args) !== before, identity, isNewObject: !!res && typeof res === 'object' && !identity.length };
}

let mismatches = 0, counts = {}, throwsSeen = 0, nulls = 0;
function check(method, mk) {
  for (let i = 0; i < N; i++) {
    const s = seed; const a = mk();
    seed = s;
    const argsHead = mk();                      // same seed -> identical, separate inputs for head
    const o1 = outcome(base, method, a), o2 = outcome(head, method, argsHead);
    counts[method] = (counts[method] || 0) + 1;
    if (o1.err) throwsSeen++;
    if (o1.res === 'null') nulls++;
    if (enc(o1) !== enc(o2)) { if (mismatches++ < 5) console.log('MISMATCH', method, i, enc(a).slice(0, 300), o1, o2); }
  }
}
check('chartContentBox', () => [pageObj(), pitch(), pitch()]);
check('chartContentBox', () => [pageObj(), undefined, undefined]);
check('rulerCellSpan', () => { const g = gridObj(); return [pageObj(), rulerObj(g), Math.floor(rnd() * 500) - 5, Math.floor(rnd() * 500) - 5]; });
check('anchorGridToRuler', () => { const g = gridObj(); return [g, rulerObj(g), Math.floor(rnd() * 120) - 5, Math.floor(rnd() * 120) - 5]; });
check('gridFromRuler', () => { const g = gridObj(); return [rulerObj(g), spanObj(), rnd() < 0.5 ? g : undefined]; });
check('samplingGrid', () => { const g = gridObj(); const r = rnd() < 0.7 ? rulerObj(g) : undefined; return [{ ruler: r, anchoredToGrid: rnd() < 0.5, rulerSpan: spanObj(), grid: g }]; });
console.log(JSON.stringify({ iterations: counts, errorsInBase: throwsSeen, nullResultsInBase: nulls, mismatches }));
process.exit(mismatches ? 1 : 0);
