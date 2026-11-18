// The four fixes from reports/photo-conversion-audit-2026-11.md:
//   1. photos skip the edge-shade fold (stitchCleanup.foldEdgeShades);
//   2. background removal: one nearly opaque pixel no longer switches it off,
//      and Brightness / Contrast / Saturation no longer move the mask;
//   3. the tidied count is what Reduce confetti changed (tidiedCells);
//   4. blends are their two threads mixed as light (blendThreadRgb).
const fs = require('fs'), vm = require('vm');
const { runtime, runWorker } = require('../scripts/conversion-accuracy/harness');

function picture(w, h, colourAt) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = colourAt(x, y), i = (y * w + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] == null ? 255 : c[3];
  }
  return d;
}
const base = { maxC: 8, dith: false, dithAlgo: 'off', allowBlends: false, skipBg: false, bgCol: [255, 255, 255], bgTh: 15,
  minSt: 0, smooth: 0, stitchCleanup: { enabled: true, protectDetails: true }, orphans: 0, disambig: false, seed: 1337 };
const settings = (o) => Object.assign({}, base, o);
const skipped = (res) => res.mapped.map((m) => m.id === '__skip__');

describe('background removal', () => {
  const W = runtime();
  // A pale grey frame around a red square: the frame is the background.
  const framed = (x, y) => (x >= 5 && x < 15 && y >= 5 && y < 15 ? [200, 40, 40] : [230, 230, 230]);

  test('one nearly opaque pixel no longer switches colour removal off', () => {
    const data = picture(20, 20, framed);
    data[3] = 254;   // the top-left pixel, alpha 254
    const mask = W.prepareConversionPixels(new Uint8ClampedArray(data), 20, 20, settings({ skipBg: true, bgCol: [230, 230, 230] }));
    expect(Array.from(mask).filter((v) => v).length).toBe(100);   // only the red square
  });

  test('a picture with see-through areas still uses its own transparency', () => {
    const data = picture(20, 20, (x, y) => (x < 2 ? [230, 230, 230, 0] : framed(x, y)));
    const mask = W.prepareConversionPixels(new Uint8ClampedArray(data), 20, 20, settings({ skipBg: true, bgCol: [230, 230, 230] }));
    expect(Array.from(mask).filter((v) => !v).length).toBe(40);   // just the transparent columns
  });

  test('Brightness, Contrast and Saturation do not move the mask', () => {
    const data = picture(20, 20, framed);
    const s = settings({ skipBg: true, bgCol: [230, 230, 230] });
    const plain = skipped(runWorker(data, 20, 20, s, W));
    expect(plain.filter(Boolean).length).toBe(300);
    for (const adj of [{ bri: -30 }, { bri: 25 }, { con: -50 }, { con: 40, sat: 60 }]) {
      // Before, the background colour (from the picture) was compared with
      // adjusted stitches: at Brightness -30 the frame was no longer a match.
      expect(skipped(runWorker(data, 20, 20, Object.assign({}, s, adj), W))).toEqual(plain);
    }
  });

  test('the adjustments still change the stitched colours', () => {
    const data = picture(20, 20, framed);
    const dark = runWorker(data, 20, 20, settings({ bri: -60 }), W);
    const plain = runWorker(data, 20, 20, settings({}), W);
    const red = 10 * 20 + 10;
    expect(dark.mapped[red].lab[0]).toBeLessThan(plain.mapped[red].lab[0] - 10);
  });

  test('the page pipeline matches the worker', () => {
    const data = picture(20, 20, framed);
    const s = settings({ skipBg: true, bgCol: [230, 230, 230], bri: -30, con: 20 });
    const Wp = runtime();
    vm.runInContext(fs.readFileSync('creator/generate.js', 'utf8'), Wp);
    const page = Wp.runCleanupPipeline(new Uint8ClampedArray(data), 20, 20, s);
    expect(page.mapped.map((m) => m.id)).toEqual(runWorker(data, 20, 20, s, W).mapped.map((m) => m.id));
  });
});

describe('the edge-shade fold', () => {
  function countFolds(cleanup) {
    const W = runtime();
    let calls = 0;
    const real = W.mergeEdgeBlendColours;
    W.mergeEdgeBlendColours = function () { calls++; return real.apply(this, arguments); };
    runWorker(picture(12, 12, (x) => (x < 6 ? [20, 40, 160] : [240, 240, 240])), 12, 12, settings({ stitchCleanup: cleanup }), W);
    return calls;
  }
  test('photos skip it; graphics and charts saved before the setting fold', () => {
    expect(countFolds({ enabled: true, protectDetails: true, foldEdgeShades: false })).toBe(0);
    expect(countFolds({ enabled: true, protectDetails: true, foldEdgeShades: true })).toBe(1);
    expect(countFolds({ enabled: true, protectDetails: true })).toBe(1);
    expect(countFolds({ enabled: false, foldEdgeShades: true })).toBe(0);
  });

  test('the photo preset and every photo step turn it off', () => {
    const src = fs.readFileSync('creator/useCreatorState.js', 'utf8');
    const start = src.indexOf('var STITCH_STYLE_ORDER'), end = src.indexOf('// The values a preset sets for a picture.');
    const api = new Function(src.slice(start, end) + '\nreturn { stitchStyleValues, foldsEdgeShades, STITCH_STYLE_ORDER };')();   // eslint-disable-line no-new-func
    for (const step of api.STITCH_STYLE_ORDER) {
      expect(api.stitchStyleValues('photo', step).foldEdgeShades).toBe(false);
      expect(api.stitchStyleValues('graphic', step).foldEdgeShades).toBe(true);
      expect(api.stitchStyleValues('pixel', step).foldEdgeShades).toBe(true);
    }
  });
});

test('tidiedCells marks exactly the stitches Reduce confetti changed', () => {
  // Specks of a lighter green in two flat colours give Reduce confetti work
  // to do (a high-contrast speck would be kept, like a catchlight).
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const data = picture(30, 30, (x) => (rnd() < 0.08 ? [70, 125, 60] : x < 15 ? [40, 90, 40] : [220, 210, 170]));
  const W = runtime();
  const res = runWorker(data, 30, 30, settings({ orphans: 2, maxC: 6, stitchCleanup: { enabled: true, protectDetails: false } }), W);
  const cells = Array.from(res.tidiedCells);
  const tidied = cells.reduce((n, v) => n + v, 0);
  expect(tidied).toBeGreaterThan(0);
  cells.forEach((v, i) => { if (v) expect(res.preCleanupIds[i]).not.toBe(res.mapped[i].id); });
  // Off, there is nothing to report.
  expect(runWorker(data, 30, 30, settings({ orphans: 0 }), W).tidiedCells).toBeNull();
});

describe('blend colours', () => {
  const C = require('../colour-utils.js');
  test('two threads mix as light, not as the average of their stored values', () => {
    expect(C.blendThreadRgb([0, 0, 0], [255, 255, 255])).toEqual([188, 188, 188]);
    expect(C.legacyBlendRgb([0, 0, 0], [255, 255, 255])).toEqual([128, 128, 128]);
    expect(C.blendThreadRgb([90, 40, 200], [90, 40, 200])).toEqual([90, 40, 200]);
    // Strand shares weight the mix.
    expect(C.blendThreadRgb([0, 0, 0], [255, 255, 255], 3, 1)).toEqual(C.blendThreadRgb([0, 0, 0], [255, 255, 255], 1.5, 0.5));
    const two = C.blendThreadRgb([0, 0, 0], [255, 255, 255], 2, 1)[0];
    expect(two).toBeLessThan(188);
    expect(two).toBeGreaterThan(0);
  });
});
