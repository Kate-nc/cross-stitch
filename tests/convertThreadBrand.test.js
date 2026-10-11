/* tests/convertThreadBrand.test.js — converting a picture in a chosen thread
 * brand (P4-5, audit IMG-04).
 *
 * Runs the real conversion pipeline (creator/generate.js runCleanupPipeline
 * over colour-utils.js) in a VM with the real catalogues: with Anchor's pool
 * the palette is chosen from Anchor directly, and the result is marked as
 * Anchor; with no pool it is DMC, as before.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const quiet = { log() {}, warn() {}, info() {}, error() {} };
const ctx = { console: quiet, addEventListener() {}, removeEventListener() {},
  document: { createElement: () => ({ getContext: () => null }) } };
ctx.window = ctx;
vm.createContext(ctx);
['constants.js', 'dmc-data.js', 'anchor-data.js', 'helpers.js', 'colour-utils.js', 'creator/generate.js']
  .forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
const run = (code) => vm.runInContext(code, ctx);

// A small picture with plenty of different colours.
function picture(w, h) {
  const raw = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    raw[i * 4] = (i * 37) % 256; raw[i * 4 + 1] = (i * 91) % 256; raw[i * 4 + 2] = (i * 53) % 256; raw[i * 4 + 3] = 255;
  }
  return raw;
}
function convert(pool, allowBlends) {
  return ctx.runCleanupPipeline(picture(16, 12), 16, 12, {
    maxC: 8, dith: false, allowBlends: !!allowBlends, skipBg: false, bgCol: [255, 255, 255], bgTh: 15,
    allowedPalette: pool, seed: 7, stitchCleanup: { enabled: false }, orphans: 0,
  });
}
const anchorIds = new Set(run('ANCHOR.map(function (a) { return a.id; })'));
const dmcIds = new Set(run('DMC.map(function (d) { return d.id; })'));
const ids = (mapped) => [...new Set(mapped.flatMap((m) => String(m.id).split('+')))];

describe('converting in Anchor', () => {
  const pool = run('threadBrandPool("anchor")');

  test('the pool is the Anchor catalogue, marked Anchor, and the same array each time', () => {
    expect(pool).toHaveLength(anchorIds.size);
    expect(pool.every((t) => t.brand === 'anchor')).toBe(true);
    expect(run('threadBrandPool("anchor") === threadBrandPool("anchor")')).toBe(true);
    expect(run('threadBrandPool("dmc")')).toBeNull();
  });

  test('every stitch is an Anchor thread, blends included', () => {
    const r = convert(pool, true);
    const used = ids(r.mapped);
    expect(used.length).toBeGreaterThan(1);
    used.forEach((id) => expect(anchorIds.has(id)).toBe(true));
  });

  test('tagThreadBrand marks the result, and buildPalette keeps the mark', () => {
    const r = convert(pool, true);
    run('tagThreadBrand')(r.mapped, 'anchor');
    expect(r.mapped.every((m) => m.brand === 'anchor')).toBe(true);
    r.mapped.filter((m) => m.type === 'blend').forEach((m) => m.threads.forEach((t) => expect(t.brand).toBe('anchor')));
    const pal = run('buildPalette')(r.mapped).pal;
    expect(pal.every((p) => p.brand === 'anchor')).toBe(true);
  });

  test('with no pool the conversion is DMC, unmarked, as before', () => {
    const r = convert(null, false);
    ids(r.mapped).forEach((id) => expect(dmcIds.has(id)).toBe(true));
    run('tagThreadBrand')(r.mapped, 'dmc');
    expect(r.mapped.some((m) => m.brand)).toBe(false);
  });
});

describe('editing an Anchor pattern', () => {
  test('the thread list is the pattern brand\'s catalogue', () => {
    expect(run('projectThreadList("dmc") === DMC')).toBe(true);
    const list = run('projectThreadList("anchor")');
    expect(list).toHaveLength(anchorIds.size);
    expect(list[0].brand).toBe('anchor');
  });
});
