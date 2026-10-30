// Image-to-pattern conversion: no invented colours in flat areas, and small but
// clearly different features kept. One test (or group) per cause found in the
// investigation; see the comments in colour-utils.js for each fix.
const fs = require('fs');
const vm = require('vm');

function runtime(worker = false) {
  const messages = [];
  const c = { console, postMessage: (m) => messages.push(m) };
  c.window = c; c.self = c; c.globalThis = c;
  vm.createContext(c);
  const load = (f) => vm.runInContext(fs.readFileSync(f, 'utf8'), c, { filename: f });
  c.importScripts = (...files) => files.forEach(load);
  if (worker) load('generate-worker.js');
  else ['constants.js', 'dmc-data.js', 'colour-utils.js'].forEach(load);
  c.messages = messages;
  return c;
}
const C = runtime();
const g = (name) => vm.runInContext(name, C);
const DMC = g('DMC');
const dmc = (id) => DMC.find((e) => e.id === id);
const lab = (r, gg, b) => C.rgbToLab(r, gg, b);
const cie76 = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

function rand(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
function image(w, h, pixel, noise = 0, seed = 7) {
  const r = rand(seed), data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = pixel(x, y), i = (y * w + x) * 4;
    for (let k = 0; k < 3; k++) data[i + k] = c[k] + (r() - 0.5) * 2 * noise;
    data[i + 3] = 255;
  }
  return data;
}
const grid = (w, h, fn) => { const a = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.push(fn(x, y)); return a; };
const cell = (e) => ({ id: e.id, type: 'solid', rgb: e.rgb, lab: e.lab });

describe('stitches are matched by CIEDE2000, like the palette is chosen', () => {
  test('a sky blue gets the perceptually nearer thread, not the Euclidean-Lab nearer one', () => {
    const sky = lab(72, 136, 248), pal = [dmc('322'), dmc('334')];
    // The old Euclidean match preferred 322; ΔE2000 says 334 is much closer.
    expect(cie76(sky, pal[0].lab)).toBeLessThan(cie76(sky, pal[1].lab));
    expect(C.dE2000(sky, pal[1].lab)).toBeLessThan(C.dE2000(sky, pal[0].lab) - 2);
    const m = C.findSolid(sky, pal);
    expect(m.id).toBe('334');
    expect(m.dist).toBeCloseTo(C.dE2000(sky, pal[1].lab), 6);
  });

  test('the lightness bound never changes which thread is found', () => {
    const r = rand(3);
    for (let i = 0; i < 3000; i++) {
      const p = lab(r() * 255 | 0, r() * 255 | 0, r() * 255 | 0);
      let best = null, bd = Infinity;
      for (const e of DMC) { const d = C.dE2000(p, e.lab); if (d < bd) { bd = d; best = e; } }
      expect(C.findSolid(p, DMC).dist).toBeCloseTo(bd, 9);
    }
  });
});

describe('blends pair only threads that are close', () => {
  test('black and white are never paired; two neighbouring greys are', () => {
    C.findBest.precomputeBlends([dmc('310'), dmc('B5200')]);
    expect(C.findBest._blends).toHaveLength(0);
    C.findBest.precomputeBlends([dmc('3799'), dmc('317')]);
    expect(C.findBest._blends.map((b) => b.id)).toEqual(['317+3799']);
  });

  test('a flat warm grey is not drawn as blends of unrelated threads', () => {
    // These used to give "Straw Dk + Royal Blue" and "Black + Winter White".
    const pal = ['310', '3865', '300', '3820', '797'].map(dmc);
    C.findBest.precomputeBlends(pal);
    const r = rand(3);
    for (let i = 0; i < 200; i++) {
      const c = [128, 120, 112].map((v) => Math.round(v + (r() - 0.5) * 8));
      const m = C.findBest(lab(...c), pal, true);
      if (m.type === 'blend') expect(C.dE2000(m.threads[0].lab, m.threads[1].lab)).toBeLessThanOrEqual(g('BLEND_MAX_PARTNER_DE'));
    }
  });
});

test('the dither anti-speck check compares ΔE, not squared distances', () => {
  // Two greys, and a pixel about 1 ΔE nearer the darker one. With a 4 ΔE
  // threshold and the lighter grey to its left, the lighter grey is kept.
  const light = dmc('318'), dark = dmc('414'), pal = [light, dark];
  let grey = null;
  for (let v = dark.rgb[0]; v <= light.rgb[0] && grey === null; v++) {
    const p = lab(v, v, v), dl = C.dE2000(p, light.lab), dd = C.dE2000(p, dark.lab);
    if (dd > 2.5 && dl - dd > 0.5 && dl - dd < 2) grey = v;
  }
  expect(grey).not.toBeNull();
  const data = new Uint8ClampedArray([...light.rgb, 255, grey, grey, grey, 255]);
  const out = C.doDither(data, 2, 1, pal, false, null, { confettiDitherThreshold: 4, ditherStrength: 0 });
  expect(out.map((e) => e.id)).toEqual([light.id, light.id]);
  const off = C.doDither(data, 2, 1, pal, false, null, { confettiDitherThreshold: 0, ditherStrength: 0 });
  expect(off.map((e) => e.id)).toEqual([light.id, dark.id]);
});

describe('the palette has no near-copies and gives distinct small features a thread', () => {
  const map = (data, w, h, pal) => Array.from({ length: w * h }, (_, i) => C.findSolid(lab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]), pal).id);

  test('a flat, noisy colour gets one thread, not several near-copies', () => {
    const w = 40, h = 40, data = image(w, h, () => [110, 160, 215], 8);
    const pal = C.quantizeConstrained(data, w, h, 15, null, { seed: 1337 });
    expect(pal.length).toBeLessThan(15);
    expect(new Set(map(data, w, h, pal)).size).toBe(1);
  });

  test('a 3×3 spot of a clearly different colour gets its own thread', () => {
    const w = 40, h = 40, BROWN = [150, 105, 75];
    const data = image(w, h, (x, y) => (x >= 20 && x < 23 && y >= 20 && y < 23 ? BROWN : [90, 140, 70]), 4);
    const pal = C.quantizeConstrained(data, w, h, 8, null, { seed: 1337 });
    const ids = map(data, w, h, pal);
    const spot = pal.find((e) => e.id === ids[21 * w + 21]);
    expect(ids[21 * w + 21]).not.toBe(ids[5 * w + 5]);
    expect(C.dE2000(spot.lab, lab(...BROWN))).toBeLessThan(10);
  });

  test('a new thread needs a patch: lone pixels do not earn one, a 2×2 patch does', () => {
    // addDistinctColours on its own (the clustering before it may still give a
    // far outlier a thread, which is right for, say, a star in a night sky).
    const w = 40, h = 40, magenta = lab(230, 20, 200), green = dmc('3347');
    const lone = new Set([5 * w + 5, 20 * w + 30, 33 * w + 12]);
    const scattered = image(w, h, (x, y) => (lone.has(y * w + x) ? [230, 20, 200] : green.rgb));
    const a = C.addDistinctColours(C._uniqueColours(scattered, w, h), w, [green], DMC, 8);
    expect(a.every((e) => C.dE2000(e.lab, magenta) > 20)).toBe(true);
    const patch = image(w, h, (x, y) => (x >= 20 && x < 22 && y >= 20 && y < 22 ? [230, 20, 200] : green.rgb));
    const b = C.addDistinctColours(C._uniqueColours(patch, w, h), w, [green], DMC, 8);
    // DMC has no pure magenta; the nearest it has is far closer than the green.
    expect(b).toHaveLength(2);
    expect(C.dE2000(b[1].lab, magenta)).toBeLessThan(C.dE2000(green.lab, magenta) - 30);
  });

  test('two separate pixel pairs are not a patch', () => {
    const w = 40, h = 40, green = dmc('3347');
    const pairs = new Set([5 * w + 5, 5 * w + 6, 30 * w + 30, 30 * w + 31]);
    const data = image(w, h, (x, y) => (pairs.has(y * w + x) ? [230, 20, 200] : green.rgb));
    expect(C.addDistinctColours(C._uniqueColours(data, w, h), w, [green], DMC, 8).map((e) => e.id)).toEqual([green.id]);
  });

  test('with blends on, a thread a blend needs is not pruned', () => {
    // A flat grey that only a blend of 3799 and 317 matches: neither thread
    // is any pixel's nearest solid on its own, but both are needed.
    const w = 30, h = 10, data = image(w, h, () => [63, 63, 63]);
    const stash = [dmc('3799'), dmc('317')];
    const pal = C.quantizeConstrained(data, w, h, 2, stash, { seed: 1337, blends: true });
    expect(pal.map((e) => e.id).sort()).toEqual(['317', '3799']);
    C.findBest.precomputeBlends(pal);
    const m = C.doMap(data, w, h, pal, true);
    expect(m.every((e) => e.id === '317+3799')).toBe(true);
    expect(m[0].dist).toBeLessThan(1);
    // Without blends the second thread does nothing for this picture and goes.
    expect(C.quantizeConstrained(data, w, h, 2, stash, { seed: 1337 })).toHaveLength(1);
  });

  test('every pipeline tells the quantiser when blends will be used', () => {
    for (const f of ['creator/generate.js', 'generate-worker.js']) {
      expect(fs.readFileSync(f, 'utf8')).toMatch(/blends: !!allowBlends/);
    }
    expect(fs.readFileSync('import-formats.js', 'utf8')).toMatch(/\{ blends: allowBlends \}/);
  });

  test('refine: false keeps the raw clusters', () => {
    const w = 40, h = 40, data = image(w, h, () => [110, 160, 215], 8);
    expect(C.quantizeConstrained(data, w, h, 15, null, { seed: 1337, refine: false })).toHaveLength(15);
  });
});

describe('foldRareColours', () => {
  const GREEN = cell(dmc('3347')), ORANGE = cell(dmc('977')), BROWN = cell(dmc('435'));
  const NAVY = cell(dmc('939')), WHITE = cell(dmc('B5200'));

  test('a rare patch takes the colour it touches, not the nearest colour elsewhere', () => {
    // The brown is nearer the orange (elsewhere) than the green around it.
    expect(C.dE2000(BROWN.lab, ORANGE.lab)).toBeLessThan(C.dE2000(BROWN.lab, GREEN.lab));
    const m = grid(20, 20, (x, y) => (x >= 15 ? ORANGE : x >= 5 && x < 7 && y >= 5 && y < 7 ? BROWN : GREEN));
    expect(C.foldRareColours(m, 20, 20, 5)).toBe(1);
    expect(m[5 * 20 + 5].id).toBe(GREEN.id);
  });

  test('with the contrast guard, a catchlight stays; without it, the user minimum removes it', () => {
    const make = () => grid(20, 20, (x, y) => (x >= 8 && x < 10 && y >= 8 && y < 10 ? WHITE : NAVY));
    const guarded = make();
    expect(C.foldRareColours(guarded, 20, 20, 15, { contrastGuard: g('RARE_COLOUR_CONTRAST_GUARD_DE') })).toBe(0);
    expect(guarded[8 * 20 + 8].id).toBe(WHITE.id);
    const forced = make();
    expect(C.foldRareColours(forced, 20, 20, 15)).toBe(1);
    expect(forced[8 * 20 + 8].id).toBe(NAVY.id);
  });

  test('both pipelines use it, with the guard on the automatic pass only', () => {
    for (const f of ['creator/generate.js', 'generate-worker.js']) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src).toMatch(/foldRareColours\(mapped, width, height, minSt\);/);
      expect(src).toMatch(/foldRareColours\(mapped, width, height, _autoThresh, \{ contrastGuard: RARE_COLOUR_CONTRAST_GUARD_DE \}\);/);
    }
  });
});

describe('mergeEdgeBlendColours only folds a shade into colours it sits between', () => {
  const RED = { id: '349', type: 'solid', rgb: [210, 16, 52], lab: [45, 70, 40] };
  const NAVY = { id: '820', type: 'solid', rgb: [14, 54, 92], lab: [22, 5, -30] };
  const WHITE = { id: 'B5200', type: 'solid', rgb: [255, 255, 255], lab: [100, 0, 0] };
  const BLEND = { id: '3328', type: 'solid', rgb: [112, 35, 72], lab: [33.5, 37.5, 5] }; // halfway RED–NAVY
  const ids = (m) => Array.from(new Set(m.map((c) => c.id))).sort();

  test('a thin line touching neither of the colours it happens to lie between is kept', () => {
    // RED | WHITE (with a BLEND line inside it) | NAVY: BLEND only touches WHITE.
    const m = grid(60, 40, (x) => (x < 20 ? RED : x >= 40 ? NAVY : x === 30 ? BLEND : WHITE));
    expect(C.mergeEdgeBlendColours(m, 60, 40)).toBe(0);
    expect(ids(m)).toContain('3328');
  });

  test('an edge two shades wide folds in successive passes', () => {
    const S1 = { id: 's1', type: 'solid', rgb: [0, 0, 0], lab: [59, 52, 30] };   // 1/4 of the way RED→WHITE
    const S2 = { id: 's2', type: 'solid', rgb: [0, 0, 0], lab: [86, 18, 10] };   // 3/4 of the way
    const m = grid(60, 40, (x) => (x < 29 ? RED : x === 29 ? S1 : x === 30 ? S2 : WHITE));
    expect(C.mergeEdgeBlendColours(m, 60, 40)).toBe(2);
    expect(ids(m)).toEqual(['349', 'B5200']);
  });

  test('an edge thread off the line still folds when the pixels it was drawn from are on it', () => {
    // An orange thread on a red–white edge: the nearest thread to the pink pixels.
    const ORANGE = { id: '608', type: 'solid', rgb: [253, 93, 53], lab: [62, 55, 52] };
    const make = () => grid(40, 40, (x) => (x < 19 ? RED : x === 19 ? ORANGE : WHITE));
    const pinkPixels = image(40, 40, (x) => (x < 19 ? RED.rgb : x === 19 ? [236, 140, 150] : WHITE.rgb));
    expect(C.mergeEdgeBlendColours(make(), 40, 40, { maxDeltaE: 18 })).toBe(0);
    const m = make();
    expect(C.mergeEdgeBlendColours(m, 40, 40, { maxDeltaE: 18, source: pinkPixels })).toBe(1);
    expect(ids(m)).toEqual(['349', 'B5200']);
  });

  test('the pipelines pass the source pixels only when not dithering', () => {
    for (const f of ['creator/generate.js', 'generate-worker.js']) {
      expect(fs.readFileSync(f, 'utf8')).toMatch(/source: \(!dith \|\| dithAlgo === ['"]off['"]\) \? raw : null,/);
    }
  });
});

describe('edge and detail maps see colour as well as brightness', () => {
  // Green and a brown of about the same brightness.
  const GREEN = [90, 140, 70], BROWN = [168, 118, 88];
  test('an equal-brightness colour boundary is an edge', () => {
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    expect(Math.abs(lum(GREEN) - lum(BROWN))).toBeLessThan(6);
    const data = image(30, 30, (x) => (x < 15 ? GREEN : BROWN));
    const e = C.generateEdgeMap(data, 30, 30, { edgeDilation: 0 });
    expect(e[15 * 30 + 14] || e[15 * 30 + 15]).toBe(1);
    expect(e[15 * 30 + 3]).toBe(0);
  });

  test('one black-on-white edge does not crush a moderate real edge elsewhere', () => {
    const data = image(60, 30, (x) => (x < 10 ? [0, 0, 0] : x < 20 ? [255, 255, 255] : x < 40 ? [120, 120, 120] : [150, 150, 150]));
    const s = C.generateSaliencyMap(data, 60, 30, { sigma: 0 });
    // The 30-level step at x = 40 (sobel 120): 0.12 if divided by the black/white edge.
    expect(Math.max(s[15 * 60 + 39], s[15 * 60 + 40])).toBeGreaterThan(0.5);
  });

  test('noise in a low-contrast picture is not mistaken for detail', () => {
    const data = image(40, 40, () => [128, 128, 128], 3);
    const s = C.generateSaliencyMap(data, 40, 40);
    expect(Math.max(...s)).toBeLessThan(0.2);
  });
});

test('the orphan contrast guard is measured in ΔE2000', () => {
  // Two saturated reds: over 30 apart in Euclidean Lab, under 30 in ΔE2000.
  const A = cell(dmc('321')), B = cell(dmc('606'));
  expect(cie76(A.lab, B.lab)).toBeGreaterThan(30);
  expect(C.dE2000(A.lab, B.lab)).toBeLessThan(30);
  const m = grid(10, 10, (x, y) => (x === 5 && y === 5 ? B : A));
  const out = C.removeOrphanStitches(m, 10, 10, 2, null, null, { deContrastGuard: 30 });
  expect(out[55].id).toBe(A.id);
});

test('the median filter never invents a colour', () => {
  const RED = [220, 30, 30], GREEN = [30, 200, 40];
  const data = image(20, 20, (x, y) => ((x + y) % 3 === 0 ? RED : GREEN));
  const key = (d, i) => d[i] + ',' + d[i + 1] + ',' + d[i + 2];
  const allowed = new Set([RED.join(','), GREEN.join(',')]);
  for (const radius of [1, 1.5, 2]) {
    const d = new Uint8ClampedArray(data);
    C.applyMedianFilter(d, 20, 20, radius);
    for (let i = 0; i < d.length; i += 4) expect(allowed.has(key(d, i))).toBe(true);
  }
});

describe('the whole conversion (Web Worker)', () => {
  const W = runtime(true);
  function convert(data, w, h, extra) {
    W.messages.length = 0;
    const settings = Object.assign({ maxC: 15, dith: false, allowBlends: true, skipBg: false, bgCol: [255, 255, 255], bgTh: 15,
      minSt: 0, smooth: 0, smoothType: 'median', orphans: 0, seed: 1337,
      stitchCleanup: { enabled: true, strength: 'balanced', protectDetails: true, smoothDithering: true } }, extra || {});
    W.onmessage({ data: { type: 'generate', reqId: 1, pixels: data.slice().buffer, width: w, height: h, settings } });
    const r = W.messages.find((m) => m.type === 'result');
    expect(W.messages.filter((m) => m.type === 'error')).toEqual([]);
    return r.mapped;
  }
  // A noisy flat wall with a navy block holding a 2×2 catchlight, a 3×3 brown
  // spot, and grass below.
  const w = 60, h = 60;
  const WALL = [222, 205, 170], GRASS = [90, 140, 70], NAVY = [30, 40, 80], WHITE = [250, 250, 250], BROWN = [150, 105, 75];
  const data = image(w, h, (x, y) => {
    if (y >= 40) return x >= 30 && x < 33 && y >= 48 && y < 51 ? BROWN : GRASS;
    if (x >= 10 && x < 18 && y >= 10 && y < 18) return x >= 13 && x < 15 && y >= 13 && y < 15 ? WHITE : NAVY;
    return WALL;
  }, 6);
  const region = (m, x0, y0, x1, y1) => { const s = new Set(); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s.add(m[y * w + x].id); return s; };

  test.each([['plain', {}], ['dithered photo settings', { maxC: 20, dith: true, dithAlgo: 'atkinson', dithStrength: 0.5 }]])('%s: flat areas are one thread and small features are kept', (_, extra) => {
    const m = convert(data, w, h, extra);
    expect(region(m, 25, 5, 55, 35).size).toBe(1);   // wall
    expect(region(m, 40, 45, 58, 58).size).toBe(1);  // grass
    const wall = m[20 * w + 40].id, navy = m[11 * w + 11].id, grass = m[45 * w + 45].id;
    expect(m[13 * w + 13].id).not.toBe(navy);       // catchlight
    expect(m[49 * w + 31].id).not.toBe(grass);      // brown spot
    expect(m[49 * w + 31].id).not.toBe(wall);
  });
});
