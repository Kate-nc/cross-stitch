/* Cleanup 21 — time and heap for the moved calculations on a large synthetic page.
 *   node --expose-gc reports/cleanup-21/bench.cjs <base-pdf-importer.js>
 * A 300 x 400 cell chart page (120 000 filled cells, 120 000 glyphs, 600 ruler labels) is
 * run through chartContentBox / rulerCellSpan / anchorGridToRuler / samplingGrid, 15 rounds
 * each, base and head interleaved. Reports median and best wall time and the heap delta.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
function build(p, extra) {
  const ctx = vm.createContext({ console, Map, Set, Math, JSON, Object, Array, pdfjsLib: { OPS: {}, GlobalWorkerOptions: {} } });
  ctx.window = ctx;
  for (const f of extra) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(p, 'utf8'), ctx);
  return new (vm.runInContext('PatternKeeperImporter', ctx))();
}
const base = build(path.resolve(process.argv[2]), []);
const head = build(path.join(ROOT, 'pdf-importer.js'), ['pdf-chart-geometry.js']);
const pitch = 5, cols = 300, rows = 400, ox = 40, oy = 40;
const vectorPaths = [], textItems = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const x = ox + c * pitch, y = oy + r * pitch;
  vectorPaths.push({ type: 'rect', lineWidth: 1, fillColor: [(c * 7) % 256, (r * 11) % 256, 90], points: [{ x, y }, { x: x + pitch, y }, { x: x + pitch, y: y + pitch }, { x, y: y + pitch }, { x, y }] });
  textItems.push({ str: String.fromCharCode(65 + ((r + c) % 26)), x: x + 1, y: y + 4, width: 3, height: 4, fontName: 'f' });
}
const page = { pageIndex: 1, width: 40 + cols * pitch + 40, height: 40 + rows * pitch + 40, vectorPaths, textItems };
const lab = (v, x, y) => ({ value: v, x, y, width: 8, height: 8 });
const colLabels = [], rowLabels = [];
for (let c = 10; c <= cols; c += 10) colLabels.push(lab(c, ox + (c - 0.5) * pitch - 4, 30));
for (let r = 10; r <= rows; r += 10) rowLabels.push(lab(r, 30, oy + (r - 0.5) * pitch + 4));
const ruler = { pitchX: pitch, pitchY: pitch, colBase: 0.5 - ox / pitch + 1, rowBase: 0.5 - oy / pitch + 1, colLabels, rowLabels };
const grid = { originX: ox, originY: oy, cellWidth: pitch, cellHeight: pitch, columns: cols, rows, boldLineInterval: 10 };
const work = (imp) => {
  const out = [];
  out.push(imp.chartContentBox(page, pitch, pitch));
  out.push(imp.rulerCellSpan(page, ruler, cols, rows));
  out.push(imp.anchorGridToRuler(grid, ruler, cols, rows));
  out.push(imp.samplingGrid({ ruler, anchoredToGrid: true, rulerSpan: out[2], grid }));
  return out;
};
const same = JSON.stringify(work(base)) === JSON.stringify(work(head));
const stats = (a) => { const s = [...a].sort((x, y) => x - y); return { median: +s[s.length >> 1].toFixed(2), best: +s[0].toFixed(2) }; };
const tb = [], th = [], hb = [], hh = [];
for (let i = 0; i < 15; i++) for (const [imp, t, h] of (i % 2 ? [[head, th, hh], [base, tb, hb]] : [[base, tb, hb], [head, th, hh]])) {
  if (global.gc) global.gc();
  const m0 = process.memoryUsage().heapUsed, t0 = process.hrtime.bigint();
  work(imp);
  t.push(Number(process.hrtime.bigint() - t0) / 1e6); h.push((process.memoryUsage().heapUsed - m0) / 1048576);
}
console.log(JSON.stringify({ page: { vectorPaths: vectorPaths.length, textItems: textItems.length, labels: colLabels.length + rowLabels.length }, outputsIdentical: same,
  baseMs: stats(tb), headMs: stats(th), baseHeapMB: stats(hb), headHeapMB: stats(hh) }));
