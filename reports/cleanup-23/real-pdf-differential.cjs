/* Cleanup 23 — run the real fixture PDFs through two copies of pdf-importer.js
 * (a base copy and the working-tree copy) with the same pdf.js and compare the
 * whole analysed session, the planned layout and the built project.
 *
 *   node reports/cleanup-23/real-pdf-differential.cjs <base-importer.js> [pdf ...]
 *
 * Both sides load pdf-chart-geometry.js and pdf-picture-pixels.js (the base importer already needs them); the head side also loads
 * pdf-key-reader.js, as the pages do. The parsed legend (entries, brand, match report) and the stated facts are compared as well. Cancellation and warnings are compared as well.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');

async function makePdfjs() {
  const pdfjs = await import(path.join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'));
  // Node has no https loader for the worker: point pdf.js at the local file and
  // hand the importer a view whose GlobalWorkerOptions swallows its CDN URL.
  pdfjs.GlobalWorkerOptions.workerSrc = 'file://' + path.join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  return Object.assign({}, pdfjs, { GlobalWorkerOptions: {} });
}

function build(pdfjs, importerPath, withGeometry) {
  const warns = [];
  const sandbox = {
    console: { log() {}, info() {}, debug() {}, error() {}, warn: (...a) => warns.push(a.join(' ')) },
    Map, Set, Uint8ClampedArray, Uint8Array, Float32Array, Int32Array, Math, JSON, Object, Array, Promise, Date, Number, String, RegExp, Error,
    isFinite, parseFloat, parseInt, setTimeout, clearTimeout, performance, File, Blob, TextDecoder, TextEncoder,
    pdfjsLib: pdfjs,
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.requestAnimationFrame = (f) => setTimeout(f, 0);
  const ctx = vm.createContext(sandbox);
  const load = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  load('pdf-axis-labels.js');
  load('pdf-raster-chart.js');
  const calls = {};
  load('pdf-chart-geometry.js');
  load('pdf-picture-pixels.js');
  if (withGeometry) load('pdf-key-reader.js');
  // Count the calls that reach the moved code (the object is shared with the importer's global lookups).
  if (withGeometry && sandbox.PdfKeyReader) {
    for (const k of Object.keys(sandbox.PdfKeyReader)) {
      const fn = sandbox.PdfKeyReader[k];
      sandbox.PdfKeyReader[k] = function () { calls[k] = (calls[k] || 0) + 1; return fn.apply(this, arguments); };
    }
  }
  vm.runInContext(fs.readFileSync(importerPath, 'utf8'), ctx, { filename: path.basename(importerPath) });
  return { Importer: vm.runInContext('PatternKeeperImporter', ctx), warns, calls };
}

function stable(v) {
  // pdf.js numbers fonts per opened document (g_d0_f2, g_d1_f2): not importer output.
  return JSON.stringify(v, (k, x) => {
    if (x instanceof Map) return { __map: [...x.entries()] };
    if (x instanceof Set) return { __set: [...x] };
    if (typeof x === 'number' && !isFinite(x)) return String(x);
    if (x && x.constructor && /Uint8|Int32|Float/.test(x.constructor.name)) return { __ta: Buffer.from(x.buffer, x.byteOffset, x.byteLength).toString('base64') };
    return x;
  }).replace(/g_d\d+_/g, 'g_dN_');
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

async function run(Importer, bytes) {
  const progress = [];
  const imp = new Importer({ onProgress: (p) => progress.push(p) });
  const out = { ok: true };
  try {
    const session = await imp.analyse(bytes.slice(0).buffer);
    out.session = stable(session.pages.map(p => ({ pageIndex: p.pageIndex, cols: p.cols, rows: p.rows, initial: p.initial, reason: p.reason, n: p.cells && p.cells.length, cells: p.cells, bs: p.bs })));
    out.placement = stable(session.placement);
    out.legend = stable({ legend: session.legend, stated: session.stated });
    out.entries = (session.legend && session.legend.entries || []).length;
    const project = imp.buildFromLayout(session, session.placement);
    out.project = stable(project);
    out.dims = [project.settings && project.settings.sW, project.settings && project.settings.sH];
    out.progress = stable(progress);
  } catch (e) { out.ok = false; out.error = String(e && e.message || e); }
  return out;
}

(async () => {
  const [basePath, ...pdfs] = process.argv.slice(2);
  if (!basePath) throw new Error('usage: real-pdf-differential.cjs <base-importer.js> [pdf ...]');
  const pdfName = (f) => path.basename(f);
  const synthetic = process.env.NO_MALFORMED ? [] : [
    ['empty buffer', new Uint8Array(0)],
    ['garbage bytes', new Uint8Array(4096).map((_, i) => (i * 131 + 7) & 255)],
    ['truncated gen1.pdf (first 20 KB)', new Uint8Array(fs.readFileSync(path.join(ROOT, 'TestUploads', 'gen1.pdf'))).slice(0, 20480)],
    ['PDF header only', new Uint8Array(Buffer.from('%PDF-1.4\n%%EOF\n'))],
  ];
  const list = pdfs.length ? pdfs : fs.readdirSync(path.join(ROOT, 'TestUploads')).filter(f => f.endsWith('.pdf')).map(f => path.join(ROOT, 'TestUploads', f));
  const pdfjs = await makePdfjs();
  let bad = 0;
  for (const [label, bytes] of synthetic) {
    const B = build(pdfjs, path.resolve(basePath), false);
    const base = await run(B.Importer, bytes);
    const H = build(pdfjs, path.join(ROOT, 'pdf-importer.js'), true);
    const head = await run(H.Importer, bytes);
    const same = ['ok', 'error', 'session', 'placement', 'legend', 'project', 'progress'].every(k => base[k] === head[k]) && stable(B.warns) === stable(H.warns);
    if (!same) bad++;
    console.log(`${same ? 'SAME' : 'DIFF'}  [malformed] ${label}  ok=${base.ok} error=${JSON.stringify(base.error)}`);
  }
  for (const f of list) {
    const bytes = new Uint8Array(fs.readFileSync(f));
    const t0 = process.hrtime.bigint();
    const B = build(pdfjs, path.resolve(basePath), false);
    const base = await run(B.Importer, bytes);
    const t1 = process.hrtime.bigint();
    const H = build(pdfjs, path.join(ROOT, 'pdf-importer.js'), true);
    const head = await run(H.Importer, bytes);
    const t2 = process.hrtime.bigint();
    const keys = ['ok', 'error', 'session', 'placement', 'legend', 'project', 'progress'];
    const same = keys.every(k => base[k] === head[k]) && stable(B.warns) === stable(H.warns);
    if (!same) { bad++; for (const k of keys) if (base[k] !== head[k]) { const a = String(base[k]), b = String(head[k]); let i = 0; while (i < a.length && a[i] === b[i]) i++; console.log('   differs in', k, 'at', i, JSON.stringify(a.slice(Math.max(0, i - 60), i + 80)), 'vs', JSON.stringify(b.slice(Math.max(0, i - 60), i + 80))); } }
    console.log(`${same ? 'SAME' : 'DIFF'}  ${path.basename(f)}  ok=${base.ok}${base.error ? ' err=' + base.error : ''} dims=${base.dims} project#${sha(base.project || '')} session#${sha(base.session || '')} warns=${B.warns.length}/${H.warns.length} keyEntries=${base.entries} legend#${sha(base.legend || '')} keyReaderCalls=${JSON.stringify(H.calls)}  base=${Number(t1 - t0) / 1e6 | 0}ms head=${Number(t2 - t1) / 1e6 | 0}ms`);
  }
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
