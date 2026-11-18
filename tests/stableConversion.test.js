// Small changes no longer reshuffle a pattern's colours
// (reports/photo-conversion-audit-2026-11.md, follow-up):
//   1. the background is left out after the whole picture is converted
//      (blankUncovered), so leaving it out changes only stitches at its edge;
//   2. threads are chosen from a fixed start (no seed: the same settings give
//      the same pattern), and with Sharpen details from the picture before
//      sharpening (paletteSourcePixels, settings.paletteRaw).
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
// A shaded subject (a disc going from deep red to gold, with a blue band) on
// a plain pale wall, soft at its edge like a photo.
const N = 48, WALL = [236, 234, 230];
function subject(x, y) {
  const dx = x - 24, dy = y - 24, r = Math.sqrt(dx * dx + dy * dy);
  const t = x / N;
  let c = [Math.round(150 + 90 * t), Math.round(30 + 150 * t), Math.round(40 + 20 * t)];
  if (y > 28 && y < 33) c = [40, 70, 150 + Math.round(60 * t)];
  const k = Math.max(0, Math.min(1, 15.5 - r));   // a one-pixel soft edge
  return c.map((v, i) => Math.round(v * k + WALL[i] * (1 - k)));
}
const settings = (o) => Object.assign({
  maxC: 12, dith: true, dithAlgo: 'atkinson', dithStrength: 0.5, allowBlends: true, maxBlends: 6,
  skipBg: false, bgCol: WALL, bgTh: 15, minSt: 0, smooth: 0,
  stitchCleanup: { enabled: true, protectDetails: true, foldEdgeShades: false }, orphans: 2, disambig: false, seed: null,
}, o);
const besideBackground = (cells, i, w) => [i % w > 0 ? i - 1 : -1, i % w < w - 1 ? i + 1 : -1, i - w, i + w]
  .some((j) => j >= 0 && j < cells.length && cells[j].id === '__skip__');

describe('leaving the background out', () => {
  const W = runtime();
  const data = picture(N, N, subject);
  for (const [name, o] of [['shaded, with blends', {}], ['flat, no blends', { dith: false, dithAlgo: 'off', allowBlends: false }],
    ['a graphic (edge shades folded)', { dith: false, dithAlgo: 'off', allowBlends: false, maxC: 6, stitchCleanup: { enabled: true, protectDetails: true } }]]) {
    test(name + ': changes only stitches beside it', () => {
      const kept = runWorker(data, N, N, settings(o), W).mapped;
      const out = runWorker(data, N, N, settings(Object.assign({ skipBg: true }, o)), W).mapped;
      const left = out.filter((m) => m.id === '__skip__').length;
      expect(left).toBeGreaterThan(N * N / 2);
      let changed = 0;
      out.forEach((m, i) => {
        if (m.id === '__skip__' || m.id === kept[i].id) return;
        changed++;
        expect(besideBackground(out, i, N)).toBe(true);
      });
      expect(changed).toBeLessThan((N * N - left) * 0.25);
    });
  }

  test('the page pipeline matches the worker', () => {
    const Wp = runtime();
    vm.runInContext(fs.readFileSync('creator/generate.js', 'utf8'), Wp);
    const s = settings({ skipBg: true });
    const page = Wp.runCleanupPipeline(new Uint8ClampedArray(data), N, N, s);
    expect(page.mapped.map((m) => m.id)).toEqual(runWorker(data, N, N, s, W).mapped.map((m) => m.id));
  });

  test('a tidied stitch is never one left out', () => {
    const res = runWorker(data, N, N, settings({ skipBg: true }), W);
    if (res.tidiedCells) res.mapped.forEach((m, i) => { if (m.id === '__skip__') expect(res.tidiedCells[i]).toBe(0); });
  });
});

describe('blankUncovered', () => {
  const W = runtime();
  const white = { type: 'solid', id: 'B5200', rgb: [255, 255, 255], lab: W.rgbToLab(255, 255, 255) };
  const navy = { type: 'solid', id: '311', rgb: [14, 57, 77], lab: W.rgbToLab(14, 57, 77) };
  const bgLab = W.rgbToLab(255, 255, 255);

  test('a pale edge in the background\'s own thread takes the subject\'s thread; enclosed white keeps its thread', () => {
    // One row: background | pale edge (white thread, picture grey) | navy | white lettering | navy
    const w = 5, raw = picture(w, 1, (x) => [[255, 255, 255], [200, 205, 210], [14, 57, 77], [255, 255, 255], [14, 57, 77]][x]);
    const mapped = [white, white, navy, white, navy];
    const mask = Uint8Array.from([0, 1, 1, 1, 1]);
    expect(W.blankUncovered(mapped, mask, raw, w, bgLab)).toBe(true);
    expect(mapped.map((m) => m.id)).toEqual(['__skip__', '311', '311', 'B5200', '311']);
  });

  test('without a background colour it only leaves out the uncovered stitches', () => {
    const w = 3, raw = picture(w, 1, () => [200, 205, 210]);
    const mapped = [white, white, navy];
    expect(W.blankUncovered(mapped, Uint8Array.from([0, 1, 1]), raw, w, null)).toBe(true);
    expect(mapped.map((m) => m.id)).toEqual(['__skip__', 'B5200', '311']);
    expect(W.blankUncovered([navy], Uint8Array.from([1]), raw, 1, null)).toBe(false);
  });
});

describe('a steady choice of threads', () => {
  const data = picture(N, N, subject);

  test('the same settings give the same pattern, without a seed', () => {
    const a = runWorker(data, N, N, settings({}), runtime()).mapped.map((m) => m.id);
    const b = runWorker(data, N, N, settings({}), runtime()).mapped.map((m) => m.id);
    expect(b).toEqual(a);
  });

  test('a Variation seed still gives its own start', () => {
    const W = runtime();
    const raw = new Uint8ClampedArray(data);
    const ids = (seed) => W.quantizeConstrained(raw, N, N, 12, null, { seed: seed }).map((p) => p.id).sort().join();
    expect(ids(null)).toBe(ids(null));
    expect([ids(1), ids(2), ids(3)].some((x) => x !== ids(null))).toBe(true);
  });

  test('with paletteRaw the threads are chosen from that picture', () => {
    const W = runtime();
    const sharp = picture(N, N, (x, y) => subject(x, y).map((v) => (v > 128 ? Math.min(255, v + 25) : Math.max(0, v - 25))));
    // Without paletteRaw it is the picture itself.
    expect(W.paletteSourcePixels(sharp, N, N, settings({}))).toBe(sharp);
    const src = W.paletteSourcePixels(sharp, N, N, settings({ paletteRaw: data.buffer.slice(0) }));
    expect(Array.from(src)).toEqual(Array.from(data));
    // So a sharpened picture gets the unsharpened picture's threads.
    const chosen = (raw, s) => {
      const Wq = runtime(); let pal = null;
      const real = Wq.quantizeConstrained;
      Wq.quantizeConstrained = function () { pal = real.apply(this, arguments); return pal; };
      runWorker(raw, N, N, s, Wq);
      return pal.map((p) => p.id).sort();
    };
    expect(chosen(sharp, settings({ paletteRaw: data.buffer.slice(0) }))).toEqual(chosen(data, settings({})));
    expect(chosen(sharp, settings({}))).not.toEqual(chosen(data, settings({})));
  });
});
