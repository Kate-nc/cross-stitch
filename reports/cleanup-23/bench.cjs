/* Cleanup 23 — large-legend time and memory, base versus head, one side per process.
 *
 *   node --expose-gc reports/cleanup-23/bench.cjs base|head <importer.js> <entries> <runs>
 *
 * Builds one key page of <entries> multi-column entries (swatch, symbol, code, count, name: about 5 text items and 1
 * path per entry) and times parseKeyEntries and parseLegend(…) over it <runs> times. Heap is read after a forced
 * collection before and after, so retained memory is the difference; the peak RSS of the process is printed too.
 * The head side loads pdf-key-reader.js as the pages do.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
const [side, importerPath, nEntries, runs] = [process.argv[2], path.resolve(process.argv[3]), Number(process.argv[4]) || 3000, Number(process.argv[5]) || 7];

const ctx = vm.createContext({ console, Map, Set, Math, JSON, Object, Array, pdfjsLib: { OPS: {}, GlobalWorkerOptions: {} } });
ctx.window = ctx;
if (side === 'head') vm.runInContext(fs.readFileSync(path.join(ROOT, 'pdf-key-reader.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(importerPath, 'utf8'), ctx);
const imp = new (vm.runInContext('PatternKeeperImporter', ctx))();

const texts = [], paths = [];
const cols = 4, rowH = 12;
for (let i = 0; i < nEntries; i++) {
  const r = Math.floor(i / cols), c = i % cols, x = 20 + c * 145, y = 40 + r * rowH;
  paths.push({ type: 'rect', fillColor: [i % 256, (i * 7) % 256, (i * 13) % 256], points: [{ x, y: y - 9 }, { x: x + 9, y: y - 9 }, { x: x + 9, y }, { x, y }, { x, y: y - 9 }] });
  texts.push({ str: String.fromCharCode(33 + (i % 90)), x: x + 2, y: y - 1, width: 5, height: 8, fontName: 'f1' });
  texts.push({ str: String(100 + (i % 3800)), x: x + 15, y, width: 18, height: 8, fontName: 'f1' });
  texts.push({ str: '(' + (i * 3) + ' ct)', x: x + 40, y, width: 30, height: 8, fontName: 'f1' });
  texts.push({ str: 'Colour ' + i, x: x + 75, y, width: 40, height: 8, fontName: 'f1' });
}
const page = { pageIndex: 1, width: 612, height: 100000, textItems: texts, vectorPaths: paths, images: [], fonts: [] };

const heap = () => { global.gc(); global.gc(); return process.memoryUsage().heapUsed; };
const t = (fn) => { const a = process.hrtime.bigint(); const r = fn(); return [Number(process.hrtime.bigint() - a) / 1e6, r]; };
fn1 = () => imp.parseKeyEntries(page, null);
fn2 = () => imp.parseLegend([page], []);
// warm up once so JIT and lazy compilation are not in the first sample
fn1();
const h0 = heap();
const a = [], b = [];
let n1 = 0, n2 = 0, keep;
for (let i = 0; i < runs; i++) {
  const [ta, ra] = t(fn1); a.push(ta); n1 = ra.length;
  const [tb, rb] = t(fn2); b.push(tb); n2 = rb.entries.length; keep = rb;
}
const h1 = heap();
const med = (x) => x.slice().sort((p, q) => p - q)[Math.floor(x.length / 2)];
console.log(`${side}: ${nEntries} entries on one page; parseKeyEntries ${n1} entries median ${med(a).toFixed(1)} ms (min ${Math.min(...a).toFixed(1)}), parseLegend ${n2} entries median ${med(b).toFixed(1)} ms (min ${Math.min(...b).toFixed(1)}); heap after GC ${((h1 - h0) / 1e6).toFixed(2)} MB over start with one result held (${keep.entries.length} entries); peak RSS ${(process.resourceUsage().maxRSS / 1024).toFixed(1)} MB`);
