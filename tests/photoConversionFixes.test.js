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

describe('How close a match is ΔE2000', () => {
  const W = runtime();
  const io = fs.readFileSync('creator/useProjectIO.js', 'utf8');
  const lab = (c) => W.rgbToLab(c[0], c[1], c[2]);
  // A 9 × 9 picture: the border colour, with a stripe through the middle
  // touching both edges. Returns how many stripe stitches are left out.
  const stripeLeftOut = (border, stripe, bgTh) => {
    const data = picture(9, 9, (x, y) => (y === 4 ? stripe : border));
    const mask = W.prepareConversionPixels(new Uint8ClampedArray(data), 9, 9, settings({ skipBg: true, bgCol: border, bgTh }));
    return Array.from(mask.slice(36, 45)).filter((v) => !v).length;
  };

  test('a stripe goes with the background only when it looks closer than the tolerance', () => {
    // The audit's pale stripes on a 240 grey border: ΔE2000 3.2, 5.5, 7.9 and 10.3.
    expect([225, 215, 205, 195].map((g) => stripeLeftOut([240, 240, 240], [g, g, g], 9))).toEqual([9, 9, 9, 0]);
    expect(stripeLeftOut([240, 240, 240], [205, 205, 205], 7.5)).toBe(0);
  });

  test('a colour change counts as it looks, not by Lab distance', () => {
    // On a saturated red, a more saturated red and a darker red, each ΔE76 15
    // away. They look very different (ΔE2000 about 3 and 11): only the first
    // goes with the background now. Under ΔE76 15 neither did.
    const red = [200, 30, 40], L = lab(red), C = Math.hypot(L[1], L[2]);
    const toRgb = (l) => W.labToRgb(l[0], l[1], l[2]).map(Math.round);
    const moreRed = toRgb([L[0], L[1] + L[1] / C * 15, L[2] + L[2] / C * 15]);
    const darker = toRgb([L[0] - 15, L[1], L[2]]);
    expect(W.dE2000(lab(moreRed), L)).toBeLessThan(4.5);
    expect(W.dE2000(lab(darker), L)).toBeGreaterThan(10);
    expect(stripeLeftOut(red, moreRed, 9)).toBe(9);
    expect(stripeLeftOut(red, darker, 9)).toBe(0);
  });

  test('a tolerance saved as ΔE76 is converted for its background colour', () => {
    expect(W.BG_TOLERANCE_DEFAULT).toBe(9);
    // The old default on white is the new default: a white background is left out as before.
    expect(W.bgToleranceFromDE76(15, [255, 255, 255])).toBe(9);
    expect(W.bgToleranceFromDE76(15, [128, 128, 128])).toBe(13.5);
    expect(W.bgToleranceFromDE76(50, [255, 255, 255])).toBe(30);
    expect(W.bgToleranceFromDE76(undefined, [0, 0, 0])).toBe(9);
    // What a lighter or darker shade left out before, it leaves out now.
    for (const [bg, old] of [[[255, 255, 255], 15], [[236, 234, 230], 20], [[107, 145, 196], 12]]) {
      const L = lab(bg);
      for (const d of [old * 0.8, old * 1.2]) {
        const shade = W.labToRgb(Math.max(0, L[0] - d), L[1], L[2]).map(Math.round);
        const before = Math.hypot(...lab(shade).map((v, i) => v - L[i])) < old;   // the old ΔE76 test
        expect(stripeLeftOut(bg, shade, W.bgToleranceFromDE76(old, bg)) === 9).toBe(before);
      }
    }
  });

  test('saved with its unit; older projects and drafts are converted on opening', () => {
    expect(io.match(/bgThUnit: 'de2000'/g)).toHaveLength(3);   // the three project-save paths
    const g = { BG_TOLERANCE_DEFAULT: 9, bgToleranceFromDE76: W.bgToleranceFromDE76, window: {} };
    const src = io.slice(io.indexOf('var DRAFT_SETTING_KEYS = ['), io.indexOf('window.CREATOR_DRAFT_SETTING_KEYS'));
    const fns = new Function('g', 'with (g) { ' + src + ' return { creatorRestoredBgTolerance, creatorDraftSettings, creatorApplyDraftSettings }; }')(g);   // eslint-disable-line no-new-func
    expect(fns.creatorRestoredBgTolerance(12.5, 'de2000', [255, 255, 255])).toBe(12.5);
    expect(fns.creatorRestoredBgTolerance(15, undefined, [255, 255, 255])).toBe(9);
    expect(fns.creatorRestoredBgTolerance(undefined, undefined, undefined)).toBe(9);
    expect(io).toMatch(/state\.setBgTh\(creatorRestoredBgTolerance\(s\.bgTh, s\.bgThUnit, s\.bgCol\)\);/);
    // Drafts carry the unit; one without it is converted.
    expect(fns.creatorDraftSettings({ bgTh: 6, bgCol: [1, 2, 3] })).toMatchObject({ bgTh: 6, bgThUnit: 'de2000' });
    const set = [];
    const state = { setBgTh: (v) => set.push(v), setBgCol: () => {} };
    fns.creatorApplyDraftSettings(state, { bgTh: 15, bgCol: [255, 255, 255] });
    fns.creatorApplyDraftSettings(state, { bgTh: 6, bgThUnit: 'de2000', bgCol: [255, 255, 255] });
    expect(set).toEqual([9, 6]);
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

test('reopening a project keeps its edge-shade setting', () => {
  // processLoadedProject rebuilds stitchCleanup field by field: a Photo
  // chart's false must survive, and a project saved before the setting (none)
  // must stay unset, so it folds as it always did.
  const src = fs.readFileSync('creator/useProjectIO.js', 'utf8');
  const start = src.indexOf('if (s.stitchCleanup) {'), block = src.slice(start, src.indexOf('});', start) + 3) + '}';
  const restore = (saved) => { let out; new Function('s', 'state', block)({ stitchCleanup: saved }, { setStitchCleanup: (v) => { out = v; } }); return out; };   // eslint-disable-line no-new-func
  expect(restore({ enabled: true, protectDetails: true, foldEdgeShades: false }).foldEdgeShades).toBe(false);
  expect(restore({ enabled: true, protectDetails: true, foldEdgeShades: true }).foldEdgeShades).toBe(true);
  expect(restore({ enabled: true, protectDetails: true }).foldEdgeShades).toBeUndefined();
});

describe('Colours to keep (keepIds)', () => {
  // A big two-colour picture with a small patch of a colour close to one of
  // them (ΔE 10), like a face against a pale wall: k-means gives the threads
  // to the big areas and the patch is drawn in the wall's thread.
  const W = 40, H = 40;
  const small = (x, y) => x >= 30 && x < 33 && y >= 30 && y < 33;   // 9 stitches, 0.6%
  const data = picture(W, H, (x, y) => (small(x, y) ? [215, 190, 160] : x < 20 ? [30, 70, 140] : [235, 225, 200]));
  const smallIds = (res) => [...new Set(res.mapped.filter((m, i) => small(i % W, (i / W) | 0)).map((m) => m.id))];

  test('a kept thread is in the palette and draws its patch, even when rare', () => {
    const Wk = runtime();
    const skin = Wk.findSolid(Wk.rgbToLab(215, 190, 160), require('vm').runInContext('DMC', Wk));
    const plain = runWorker(data, W, H, settings({ maxC: 3 }), Wk);
    expect(smallIds(plain)).not.toContain(skin.id);
    const kept = runWorker(data, W, H, settings({ maxC: 3, keepIds: [skin.id] }), Wk);
    expect(smallIds(kept)).toEqual([skin.id]);
    expect(new Set(kept.mapped.map((m) => m.id)).size).toBeLessThanOrEqual(3);
  });

  test('quantizeConstrained: kept threads come first, within the limit, from the pool only', () => {
    const C = runtime();
    const DMC = require('vm').runInContext('DMC', C);
    const pal = C.quantizeConstrained(data, W, H, 4, null, { seed: 1337, reserved: ['945', 'not-a-thread', '945'] });
    expect(pal[0].id).toBe('945');
    expect(pal.filter((e) => e.id === '945')).toHaveLength(1);
    expect(pal.length).toBeLessThanOrEqual(4);
    // Kept but not in a stash-only pool: ignored.
    const stash = [DMC.find((t) => t.id === '310'), DMC.find((t) => t.id === 'B5200'), DMC.find((t) => t.id === '798')];
    expect(C.quantizeConstrained(data, W, H, 3, stash, { seed: 1337, reserved: ['945'] }).map((e) => e.id)).not.toContain('945');
    // More kept than the limit: the first ones.
    expect(C.quantizeConstrained(data, W, H, 2, null, { seed: 1337, reserved: ['945', '310', '798'] }).map((e) => e.id)).toEqual(['945', '310']);
  });

  test('the rare-colour fold, the edge fold and the thread limit leave kept colours', () => {
    const C = runtime();
    const DMC = require('vm').runInContext('DMC', C);
    const a = DMC.find((t) => t.id === '310'), b = DMC.find((t) => t.id === '945');
    const cells = () => Array.from({ length: 100 }, (_, i) => (i === 55 ? b : a));
    const m1 = cells();
    C.foldRareColours(m1, 10, 10, 5);
    expect(m1[55].id).toBe('310');
    const m2 = cells();
    C.foldRareColours(m2, 10, 10, 5, { keep: new Set(['945']) });
    expect(m2[55].id).toBe('945');
  });

  test('Reduce confetti never merges a kept colour away', () => {
    const C = runtime();
    const DMC = require('vm').runInContext('DMC', C);
    const a = DMC.find((t) => t.id === '310'), b = DMC.find((t) => t.id === '3799');   // close to 310
    const cells = () => Array.from({ length: 100 }, (_, i) => (i === 55 ? b : a));
    const flat = new Uint8ClampedArray(400).fill(20);
    const cleanup = { enabled: true, protectDetails: false };
    expect(C.runConfettiCleanup(cells(), flat, 10, 10, null, null, cleanup, 2).mapped[55].id).toBe('310');
    expect(C.runConfettiCleanup(cells(), flat, 10, 10, null, null, cleanup, 2, new Set(['3799'])).mapped[55].id).toBe('3799');
  });
});

describe('which kept colours a conversion uses (keepColoursPlan)', () => {
  const src = fs.readFileSync('creator/useCreatorState.js', 'utf8');
  const fnSrc = src.slice(src.indexOf('function keepColoursPlan('), src.indexOf('if (typeof window !== "undefined") { window.keepColoursPlan'));
  const { keepColoursPlan } = new Function(fnSrc + '; return { keepColoursPlan };')();   // eslint-disable-line no-new-func
  const k = (id, brand) => ({ id, name: id, rgb: [0, 0, 0], brand });
  const pool = [{ id: '310' }, { id: '945' }, { id: '798' }];

  test('only those in the conversion\'s brand: DMC 310 is not Anchor 310', () => {
    const plan = keepColoursPlan([k('310', 'dmc'), k('945', 'dmc')], 'anchor', null, 10);
    expect(plan.ids).toEqual([]);
    expect(plan.off).toEqual(['dmc:310', 'dmc:945']);
    // Colours kept before brands were recorded are DMC.
    expect(keepColoursPlan([k('310')], 'dmc', null, 10).ids).toEqual(['310']);
  });

  test('only threads the conversion may use, and no more than Threads (max)', () => {
    const plan = keepColoursPlan([k('310', 'dmc'), k('B5200', 'dmc'), k('945', 'dmc'), k('798', 'dmc')], 'dmc', pool, 2);
    expect(plan.ids).toEqual(['310', '945']);
    expect(plan.off).toEqual(['dmc:B5200']);
    expect(plan.over).toEqual(['dmc:798']);
  });

  test('every conversion uses the plan: Generate, the gallery and the preview settings', () => {
    expect(src).toMatch(/keepIds: keepColoursPlan\(keepColours, genBrand, allowedPalette, effMaxC\)\.ids,\n\s*preSharpen/);   // worker
    expect(src).toMatch(/keepIds: keepColoursPlan\(keepColours, genBrand, allowedPalette, effMaxC\)\.ids,\n\s*allowedPalette/);   // page
    expect(src).toMatch(/keepIds: keepColoursPlan\(keepColours, convertBrand, slotSubset, effN\)\.ids,/);   // gallery
    expect(src).toMatch(/keepIds: keepColoursPlan\(keepColours, convertBrand, stashConstrained \? stashInfo\.palette : /);   // conversionSettings
    expect(src).not.toMatch(/keepIds: keepColours\.map/);
    // A colour is kept in the brand it was picked in, and a reopened project keeps it.
    expect(src).toMatch(/brand: convertBrand \|\| "dmc" \};/);
    expect(fs.readFileSync('creator/useProjectIO.js', 'utf8')).toMatch(/brand: k\.brand === "anchor" \? "anchor" : "dmc" \}/);
  });
});

test('Colours to keep travel with projects, drafts, the preview and Generate', () => {
  const io = fs.readFileSync('creator/useProjectIO.js', 'utf8');
  // Saved in all three project-save paths, restored on open, kept in drafts.
  expect(io.match(/keepColours: state\.keepColours && state\.keepColours\.length \? state\.keepColours : undefined/g)).toHaveLength(3);
  expect(io).toMatch(/state\.setKeepColours\(Array\.isArray\(s\.keepColours\)/);
  expect(io).toMatch(/'keepColours',\n\s*\/\/ The picture type chosen/);
  const st = fs.readFileSync('creator/useCreatorState.js', 'utf8');
  expect(st.match(/keepIds: keepColoursPlan\(/g).length).toBeGreaterThanOrEqual(4);   // conversionSettings, Generate (worker, page) and gallery
  // A change to the kept colours alone is saved after generating.
  expect(io).toMatch(/state\.keepColours, state\.stitchCleanup, state\.crispEdges, state\.preSharpen, state\.preSharpenAmount,\n  \]\);/);
  expect(fs.readFileSync('creator/usePreview.js', 'utf8')).toMatch(/keepIds: settings\.keepIds \|\| null/);
  expect(fs.readFileSync('creator/CompareStrip.js', 'utf8')).toMatch(/keepIds: s\.keepIds \|\| null/);
  // A new picture starts with none.
  expect(st).toMatch(/setKeepColours\(\[\]\); setPickKeep\(false\);/);
});
