const fs = require('fs');
const vm = require('vm');
const { createCanvas, Image, ImageData } = require('canvas');

function runtime(worker = false) {
  const messages = [];
  const c = { console, Uint8ClampedArray, Image, ImageData, addEventListener() {},
    document: { createElement: () => createCanvas(1, 1) },
    postMessage: m => messages.push(m) };
  c.window = c; c.self = c; c.globalThis = c;
  vm.createContext(c);
  const load = f => vm.runInContext(fs.readFileSync(f, 'utf8'), c, { filename: f });
  c.importScripts = (...files) => files.forEach(load);
  if (worker) load('generate-worker.js');
  else ['constants.js', 'dmc-data.js', 'colour-utils.js', 'helpers.js', 'creator/generate.js'].forEach(load);
  c.messages = messages;
  return c;
}
const options = { maxC: 3, dith: false, allowBlends: false, skipBg: false,
  bgCol: [0, 0, 0], bgTh: 10, minSt: 0, seed: 1337,
  stitchCleanup: { enabled: true, strength: 'balanced', protectDetails: true } };
function rgba(w, h, pixel) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(pixel(x, y), (y * w + x) * 4);
  return data;
}
function canvas(w, h, raw) {
  const c = createCanvas(w, h);
  c.getContext('2d').putImageData(new ImageData(raw, w, h), 0, 0);
  return c;
}
const ids = mapped => Array.from(mapped, x => x.id);
const plain = v => JSON.parse(JSON.stringify(v));
const stitchCount = mapped => mapped.filter(x => x.id !== '__skip__').length;
function workerResult(c, raw, w, h, settings) {
  c.messages.length = 0;
  c.onmessage({ data: { type: 'generate', reqId: 1, pixels: raw.slice().buffer, width: w, height: h, settings } });
  const result = c.messages.find(x => x.type === 'result');
  expect(c.messages.filter(x => x.type === 'error')).toEqual([]);
  expect(result).toBeDefined();
  return result;
}

test('reproduced transparent-black probe keeps opaque black and excludes hidden RGB from palette and saved counts', () => {
  const c = runtime();
  const raw = rgba(24, 4, x => x < 8 ? [0, 0, 0, 0] : x < 16 ? [0, 0, 0, 255] : [255, 0, 0, 255]);
  for (const skipBg of [false, true]) {
    const result = c.runCleanupPipeline(raw, 24, 4, { ...options, maxC: 2, skipBg });
    expect(ids(result.mapped).slice(0, 8)).toEqual(Array(8).fill('__skip__'));
    expect(ids(result.mapped).slice(8, 16)).toEqual(Array(8).fill('310'));
    expect(stitchCount(result.mapped)).toBe(64);
    expect(c.buildPalette(result.mapped).pal.map(x => x.count).sort()).toEqual([32, 32]);
    const saved = JSON.parse(JSON.stringify(c.serializePattern(result.mapped)));
    expect(saved[0]).toEqual({ id: '__skip__' });
    const restored = saved.map(x => c.restoreStitch(x));
    expect(ids(restored)).toEqual(ids(result.mapped));
    expect(plain(c.buildPalette(restored).pal.map(x => [x.id, x.count]))).toEqual(plain(c.buildPalette(result.mapped).pal.map(x => [x.id, x.count])));
  }
  const hidden = raw.slice();
  for (let i = 0; i < 96; i++) if (!hidden[i * 4 + 3]) hidden.set([0, 255, 255, 0], i * 4);
  expect(plain(c.runCleanupPipeline(hidden, 24, 4, options))).toEqual(plain(c.runCleanupPipeline(raw, 24, 4, options)));
  expect(Array.from(raw.slice(0, 4))).toEqual([0, 0, 0, 0]);
});

test.each(['off', 'atkinson', 'bayer', 'riemersma'])('%s: alpha cutoff, cleanup and worker/main parity with hidden RGB and semi-transparent edges', algo => {
  const c = runtime(), worker = runtime(true);
  const raw = rgba(24, 8, x => x < 4 ? [0, 255, 255, 0] : x < 8 ? [255, 0, 0, 127] : x < 12 ? [255, 0, 0, 128] : x < 18 ? [255, 0, 0, 200] : [0, 0, 0, 255]);
  for (const smoothType of ['gaussian', 'median', 'bilateral']) {
    const opts = { ...options, dith: algo !== 'off', dithAlgo: algo, smooth: 1, smoothType, preSmooth: true, skipBg: true, disambig: true, disambigLevel: 'standard' };
    const before = raw.slice();
    const main = c.runCleanupPipeline(raw, 24, 8, opts);
    const wr = workerResult(worker, raw, 24, 8, opts);
    expect(ids(wr.mapped)).toEqual(ids(main.mapped));
    expect(plain(wr.confettiData)).toEqual(plain({ raw: main.confettiRaw, clean: main.confettiClean || main.confettiRaw }));
    expect(stitchCount(main.mapped)).toBe(128);
    for (let i = 0; i < 192; i++) expect(main.mapped[i].id === '__skip__').toBe((i % 24) < 8);
    expect(raw).toEqual(before);
  }
});

test.each(['off', 'atkinson', 'bayer', 'riemersma'])('all-transparent %s yields zero threads/stitches and round-trips as empty cells', algo => {
  const c = runtime(), w = runtime(true);
  const raw = rgba(7, 5, (x, y) => [x * 30, y * 40, 255, 0]);
  const opts = { ...options, dith: algo !== 'off', dithAlgo: algo, smooth: 1, smoothType: 'gaussian' };
  const r = c.runCleanupPipeline(raw, 7, 5, opts);
  expect(r.palette.length).toBe(0);
  expect(stitchCount(r.mapped)).toBe(0);
  expect(c.buildPalette(r.mapped).pal.length).toBe(0);
  expect(r.confettiRaw.pct).toBe(0);
  expect(ids(workerResult(w, raw, 7, 5, opts).mapped)).toEqual(ids(r.mapped));
  expect(ids(JSON.parse(JSON.stringify(c.serializePattern(r.mapped))).map(x => c.restoreStitch(x)))).toEqual(ids(r.mapped));
  const full = c.runGenerationPipeline(canvas(7, 5, raw), { ...opts, sW: 7, sH: 5, bri: 0, con: 0, sat: 0 });
  expect(full.pal.length).toBe(0);
  expect(stitchCount(full.pat)).toBe(0);
});

test('opaque background removal preserves an enclosed genuine black detail', () => {
  const c = runtime();
  const raw = rgba(11, 11, (x, y) => x === 0 || y === 0 || x === 10 || y === 10 || (x >= 4 && x <= 6 && y >= 4 && y <= 6) ? [0, 0, 0, 255] : [255, 0, 0, 255]);
  const r = c.runCleanupPipeline(raw, 11, 11, { ...options, maxC: 2, skipBg: true });
  expect(stitchCount(r.mapped)).toBe(81);
  expect(r.mapped[5 * 11 + 5].id).toBe('310');
  expect(r.mapped[0].id).toBe('__skip__');
});

test('cleanup cannot reinterpret an enclosed opaque detail as skipped background', () => {
  const c = runtime();
  const raw = rgba(40, 40, (x, y) => x === 0 || y === 0 || x === 39 || y === 39 || (x >= 18 && x <= 20 && y >= 18 && y <= 20) ? [0, 0, 0, 255] : [255, 0, 0, 255]);
  const r = c.runCleanupPipeline(raw, 40, 40, { ...options, maxC: 2, skipBg: true });
  expect(stitchCount(r.mapped)).toBe(38 * 38);
  expect(r.mapped[19 * 40 + 19].id).toBe('310');
});

test('PNG decode, progressive downscaling and pre-sharpen retain coverage without a black halo', async () => {
  const c = runtime();
  const raw = rgba(128, 64, x => x < 64 ? [0, 255, 0, 0] : [255, 0, 0, 255]);
  const source = canvas(128, 64, raw);
  const image = new Image(); image.src = source.toBuffer('image/png');
  expect(image.width).toBe(128);
  for (const preSharpenOpts of [null, { amount: 1 }]) {
    const opts = { ...options, maxC: 1, sW: 8, sH: 4, bri: 0, con: 0, sat: 0, preSharpenOpts };
    const r = c.runGenerationPipeline(image, opts);
    expect(stitchCount(r.pat)).toBe(16);
    expect(ids(r.pat).filter(id => id !== '__skip__')).toEqual(Array(16).fill('606'));
    expect(r.pal.length).toBe(1);
  }
});

test.each(['applyGaussianBlur', 'applyMedianFilter', 'applyBilateralFilter'])('%s excludes invisible RGB and retains the alpha mask', filter => {
  const c = runtime();
  const raw = rgba(7, 7, (x, y) => x === 3 && y === 3 ? [255, 0, 0, 255] : [0, 255, 255, 0]);
  c[filter](raw, 7, 7, filter === 'applyBilateralFilter' ? undefined : 1);
  expect(Array.from(raw.slice((3 * 7 + 3) * 4, (3 * 7 + 3) * 4 + 4))).toEqual([255, 0, 0, 255]);
  expect(Array.from(raw).filter((_, i) => i % 4 === 3).filter(a => a)).toEqual([255]);
});

test('large upload uses a lossless alpha-capable intermediate', () => {
  const src = fs.readFileSync('creator/useProjectIO.js', 'utf8');
  expect(src).toContain('scaledImg.src = c.toDataURL("image/png")');
});

test.each(['off', 'atkinson', 'bayer', 'riemersma'])('actual preview hook and final generation agree on a downscaled narrow RGBA image (%s)', algo => {
  const c = runtime();
  const image = new Image();
  image.src = canvas(128, 64, rgba(128, 64, x => x < 64 ? [0, 0, 0, 0] : x < 96 ? [0, 0, 0, 255] : [255, 0, 0, 180])).toDataURL();
  const settings = { ...options, sW: 8, sH: 4, bri: 0, con: 0, sat: 0,
    smooth: 1, smoothType: 'gaussian', preSharpen: true, preSharpenAmount: 0.5,
    fabricCt: 14, dith: algo !== 'off', dithAlgo: algo, skipBg: true };
  const pending = [];
  c.React = { useRef: value => ({ current: value }), useCallback: fn => fn, useEffect() {} };
  c.setTimeout = fn => { pending.push(fn); return pending.length; }; c.clearTimeout = () => {};
  const state = { img: image, conversionSettings: settings, previewTimerRef: { current: null } };
  for (const field of ['PreviewUrl', 'PreviewStats', 'PreviewColors', 'PreviewMapped', 'PreviewDims', 'PreviewHeatmap']) state['set' + field] = value => { state[field] = value; };
  vm.runInContext(fs.readFileSync('creator/usePreview.js', 'utf8'), c);
  const preview = c.usePreview(state);
  for (let pass = 0; pass < 2; pass++) {
    preview.generatePreview(); while (pending.length) pending.shift()();
    const final = c.runGenerationPipeline(image, { ...settings, preSharpenOpts: { amount: 0.5 } });
    expect(ids(state.PreviewMapped)).toEqual(ids(final.pat));
    expect(state.PreviewStats.stitchable).toBe(stitchCount(final.pat));
    expect(state.PreviewStats.uniqueColors).toBe(final.pal.length);
    expect(plain(state.PreviewDims)).toEqual({ pw: 8, ph: 4 });
  }
});

test.each(['quantize', 'quantizeConstrained'])('%s gives the same palette with invisible samples removed', fn => {
  const c = runtime();
  const visible = rgba(8, 1, x => x < 4 ? [0, 0, 0, 255] : [255, 0, 0, 255]);
  const padded = rgba(32, 1, x => x < 24 ? [0, 255, 255, 0] : Array.from(visible.slice((x - 24) * 4, (x - 23) * 4)));
  expect(ids(c[fn](padded, 32, 1, 2))).toEqual(ids(c[fn](visible, 8, 1, 2)));
  expect(c[fn](rgba(2, 2, () => [255, 255, 255, 0]), 2, 2, 2).length).toBe(0);
});

test('Atkinson error cannot jump a one-cell transparent gap', () => {
  const c = runtime();
  const pal = vm.runInContext("[DMC.find(x => x.id === '310'), DMC.find(x => x.id === 'B5200')]", c);
  const raw = new Uint8ClampedArray([100, 100, 100, 255, 0, 255, 255, 0, 120, 120, 120, 255]);
  const mapped = c.doDither(raw, 3, 1, pal, false, null, { confettiDitherThreshold: 0 });
  const isolated = c.doMap(raw.slice(8), 1, 1, pal, false);
  expect(mapped[1].id).toBe('__skip__');
  expect(mapped[2].id).toBe(isolated[0].id);
});
