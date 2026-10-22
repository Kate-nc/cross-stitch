/* Cleanup 22 — repeated run time and memory of pictureRgba, base against head.
 *
 *   node --expose-gc reports/cleanup-22/bench.cjs <importer.js> [extra-script ...]
 *
 * One side per process (so peak RSS is that side's own). Raw images: 1000x1000 RGBA (kind 3), 1000x1000 RGB
 * (kind 2) and 1-bit (kind 1), 25 conversions each; and a 1000x1000 bitmap through a stub canvas. Reports
 * median ms, retained ArrayBuffer bytes after each result is dropped and collected (should be 0), the
 * ArrayBuffer bytes held while one result is kept (the output only), and the process's peak RSS.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
const [importer, ...extra] = process.argv.slice(2);
const ctx = vm.createContext({ console, Map, Set, Math, JSON, Object, Array, Uint8ClampedArray, Float64Array, pdfjsLib: { OPS: {}, GlobalWorkerOptions: {} } });
ctx.window = ctx;
for (const f of ['pdf-chart-geometry.js', ...extra]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.resolve(importer), 'utf8'), ctx);
const Imp = vm.runInContext('PatternKeeperImporter', ctx);
const W = 1000, H = 1000, N = W * H;
const rgba = new Uint8Array(N * 4).map((_, i) => (i * 31 + (i >> 8)) & 255);
const rgb = new Uint8Array(N * 3).map((_, i) => (i * 17) & 255);
const bits = new Uint8Array(((W + 7) >> 3) * H).map((_, i) => (i * 29) & 255);
const bitmapRgba = Uint8ClampedArray.from(rgba);
const factory = { create: () => ({ canvas: {}, context: { drawImage() {}, getImageData: () => ({ data: bitmapRgba }) } }) };
const imp = new Imp({ canvasFactory: factory });
const cases = {
  'raw RGBA (kind 3)': { width: W, height: H, kind: 3, data: rgba },
  'raw RGB (kind 2)': { width: W, height: H, kind: 2, data: rgb },
  'raw 1-bit (kind 1)': { width: W, height: H, kind: 1, data: bits },
  'bitmap via canvas': { width: W, height: H, bitmap: {} },
};
const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
const mb = (b) => (b / 1048576).toFixed(2);
for (const [name, img] of Object.entries(cases)) {
  if (process.env.CASE && !name.includes(process.env.CASE)) continue;
  for (let i = 0; i < 3; i++) imp.pictureRgba(img);
  global.gc();
  const base0 = process.memoryUsage().arrayBuffers;
  const times = [];
  for (let i = 0; i < 25; i++) { const t = process.hrtime.bigint(); const r = imp.pictureRgba(img); times.push(Number(process.hrtime.bigint() - t) / 1e6); if (!r) throw new Error('null'); }
  global.gc();
  const retained = process.memoryUsage().arrayBuffers - base0;
  const kept = imp.pictureRgba(img); global.gc();
  const held = process.memoryUsage().arrayBuffers - base0;
  console.log(`${name.padEnd(20)} median ${med(times).toFixed(1)} ms  retained after drop ${mb(retained)} MB  held while one result kept ${mb(held)} MB`);
  void kept;
}
console.log(`peak RSS ${mb(process.resourceUsage().maxRSS * 1024)} MB`);
