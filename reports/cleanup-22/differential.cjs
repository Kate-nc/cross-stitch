/* Cleanup 22 — base-versus-head differential for pictureRgba (decoded picture -> RGBA on white).
 *
 *   node reports/cleanup-22/differential.cjs <base-pdf-importer.js> [iterations]
 *
 * Builds the base importer (conversion inside the class) and the working-tree importer (delegating to
 * pdf-picture-pixels.js) in separate vm contexts, feeds both the same seeded random images and compares the
 * result's bytes and size, the error class and message when one is thrown, whether the input was written to,
 * whether the output aliases the input, the canvas calls made (factory, draw, read-back), and the typed-array
 * allocations made (count and total bytes: memory ownership). Inputs include malformed shapes.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');

function build(importerPath, extra, canvasLog) {
  const alloc = { n: 0, bytes: 0 };
  class Counting extends Uint8ClampedArray {
    constructor(...a) { super(...a); alloc.n++; alloc.bytes += this.byteLength; }
  }
  const ctx = vm.createContext({ console, Map, Set, Math, JSON, Object, Array, Uint8ClampedArray: Counting, Float64Array, pdfjsLib: { OPS: {}, GlobalWorkerOptions: {} } });
  ctx.window = ctx;
  for (const f of extra) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  vm.runInContext(fs.readFileSync(importerPath, 'utf8'), ctx, { filename: path.basename(importerPath) });
  const Imp = vm.runInContext('PatternKeeperImporter', ctx);
  return { Imp, alloc, Counting };
}
const base = build(path.resolve(process.argv[2]), [], null);
const head = build(path.join(ROOT, 'pdf-importer.js'), ['pdf-picture-pixels.js'], null);
const N = Number(process.argv[3]) || 20000;

let seed = 0x9e3779b9;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const bytes = (n) => Uint8Array.from({ length: n }, () => Math.floor(rnd() * 256));
const dim = () => pick([1, 1, 2, 3, 7, 8, 9, 15, 16, 17, 31, 64, 0, -1, NaN, undefined, null, '4', 2.5, Infinity]);

function makeImage() {
  const w = rnd() < 0.9 ? 1 + Math.floor(rnd() * 20) : dim();
  const h = rnd() < 0.9 ? 1 + Math.floor(rnd() * 20) : dim();
  const n = (w > 0 && h > 0 && isFinite(w * h)) ? Math.floor(w * h) : 0;
  const k = rnd();
  const kind = pick([1, 2, 3, undefined, 0, 4, 99, null]);
  let img;
  if (k < 0.7) {
    const per = kind === 1 ? ((Math.ceil(w) + 7) >> 3) * Math.ceil(h) : kind === 3 ? n * 4 : kind === 2 ? n * 3 : n * pick([1, 2, 3, 4, 4, 5, 0.5, 3.5]);
    const len = isFinite(per) ? Math.min(20000, Math.max(0, Math.floor(per) + pick([0, 0, 0, 0, -1, 1, -5, 7]))) : 0;
    const data = pick([bytes, bytes, bytes, (m) => Array.from(bytes(m)), (m) => Uint8ClampedArray.from(bytes(m))])(len);
    img = { width: w, height: h, kind, data };
  } else if (k < 0.9) {
    img = { width: w, height: h, bitmap: { tag: 'bmp' } };
    if (rnd() < 0.2) img.data = rnd() < 0.5 ? null : 0;
  } else {
    img = pick([null, undefined, {}, { width: w, height: h }, { width: w, height: h, data: null, bitmap: null }, 0, '']);
  }
  const mode = pick(['ok', 'ok', 'ok', 'nocontext', 'drawthrows', 'readthrows', 'factorythrows', 'short', 'long']);
  const pixelRgba = Array.from({ length: Math.max(0, Math.floor(Math.max(0, (w | 0) * (h | 0)) * 4)) }, () => Math.floor(rnd() * 256));
  return { img, mode, pixelRgba };
}

function run(side, c) {
  const { Imp, alloc, Counting } = side;
  const log = [];
  const w = c.img && c.img.width, h = c.img && c.img.height;
  const mkCtx = () => {
    if (c.mode === 'nocontext') return null;
    return {
      drawImage: (...a) => { log.push(['draw', a[1], a[2]]); if (c.mode === 'drawthrows') throw new Error('draw'); },
      getImageData: (...a) => {
        log.push(['get', ...a]);
        if (c.mode === 'readthrows') throw new Error('read');
        const px = c.mode === 'short' ? c.pixelRgba.slice(0, Math.max(0, c.pixelRgba.length - 4)) : c.mode === 'long' ? c.pixelRgba.concat([1, 2, 3, 4]) : c.pixelRgba;
        return { data: new Counting(px) };
      },
    };
  };
  const imp = new Imp({ canvasFactory: { create: (a, b) => { log.push(['create', a, b]); if (c.mode === 'factorythrows') throw new Error('factory'); return { canvas: {}, context: mkCtx() }; } } });
  const before = alloc.n, beforeBytes = alloc.bytes;
  const snap = c.img && c.img.data && c.img.data.length !== undefined ? Array.from(c.img.data) : null;
  let res, err = null;
  try { res = imp.pictureRgba(c.img); } catch (e) { err = e.constructor.name + ':' + e.message; }
  // the mock read-back buffer is itself counted; remove it so only the importer's own allocations are compared
  const gets = log.filter(l => l[0] === 'get').length;
  const out = {
    err, log: JSON.stringify(log),
    res: res ? { w: res.w, h: res.h, type: res.data.constructor === Counting ? 'U8C' : res.data.constructor.name, data: Array.from(res.data) } : res,
    alias: !!(res && c.img && c.img.data && res.data.buffer === c.img.data.buffer),
    mutated: snap ? JSON.stringify(snap) !== JSON.stringify(Array.from(c.img.data)) : false,
    allocs: alloc.n - before - gets, allocBytes: alloc.bytes - beforeBytes - (gets ? c.pixelRgba.length * 0 : 0),
  };
  return out;
}

let mismatches = 0, errors = 0, nulls = 0, ok = 0, bitmapOk = 0;
for (let i = 0; i < N; i++) {
  const c = makeImage();
  // each side gets its own copy of the input so one run cannot affect the other
  const copy = () => ({ ...c, img: c.img && typeof c.img === 'object' ? { ...c.img, data: c.img.data && c.img.data.slice ? c.img.data.slice() : c.img.data } : c.img });
  const a = run(base, copy()), b = run(head, copy());
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    mismatches++;
    if (mismatches <= 5) console.log('MISMATCH', JSON.stringify({ img: c.img && { ...c.img, data: c.img.data && c.img.data.length }, mode: c.mode }), '\n base', JSON.stringify(a).slice(0, 300), '\n head', JSON.stringify(b).slice(0, 300));
  }
  if (a.err) errors++; else if (a.res === null) nulls++; else { ok++; if (c.img && c.img.bitmap && !c.img.data) bitmapOk++; }
}
console.log(`${N} images: ${mismatches} mismatches (return value, error, input mutation, aliasing, canvas calls, allocations); base threw ${errors}, returned null ${nulls}, converted ${ok} (${bitmapOk} through a canvas)`);
process.exit(mismatches ? 1 : 0);
