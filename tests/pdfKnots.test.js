/* tests/pdfKnots.test.js — French knots in PDF export (P4-4).
 *
 * The Pattern Keeper preset must stay bit-identical: knots are drawn only by
 * the opt-in Workshop print theme. This runs the real worker in a VM (with
 * pdf-lib's UMD build and a frozen clock, so output is deterministic) and
 * compares bytes.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

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

function project(knots) {
  const palette = [
    { id: '310', name: 'Black', rgb: [0, 0, 0], type: 'solid' },
    { id: '666', name: 'Bright Red', rgb: [227, 29, 66], type: 'solid' },
  ];
  const pattern = [];
  for (let i = 0; i < 20 * 20; i++) pattern.push(Object.assign({}, palette[i % 3 === 0 ? 1 : 0]));
  return { name: 'Knots', w: 20, h: 20, pattern, palette, partialStitches: null, bsLines: [], fabricCt: 14, knots };
}
const KNOTS = [{ x: 1, y: 1, id: '666', rgb: [227, 29, 66] }, { x: 10, y: 10, id: '310', rgb: [0, 0, 0] }];
const PK = { pageSize: 'auto', marginsMm: 12, stitchesPerPage: 'medium', chartModes: ['bw', 'colour'], overlap: true,
  includeCover: true, includeInfo: true, includeIndex: true, miniLegend: true, locale: 'en-GB', branding: {}, theme: 'pk' };
const WORKSHOP = Object.assign({}, PK, { theme: 'workshop' });

let worker;
beforeAll(() => { worker = loadWorker(); });
const build = async (p, o) => Buffer.from(await worker.buildPdf(p, o, 1));

test('the Pattern Keeper preset is byte-identical with or without knots', async () => {
  const plain = await build(project(undefined), PK);
  expect((await build(project(undefined), PK)).equals(plain)).toBe(true); // deterministic
  expect((await build(project(KNOTS), PK)).equals(plain)).toBe(true);
}, 30000);

test('the Workshop theme draws them, and lists them in the key', async () => {
  const plain = await build(project(undefined), WORKSHOP);
  const withKnots = await build(project(KNOTS), WORKSHOP);
  expect(withKnots.equals(plain)).toBe(false);
  expect(withKnots.length).toBeGreaterThan(plain.length);
}, 30000);
