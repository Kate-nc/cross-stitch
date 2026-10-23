/* tests/finalConfettiCount.test.js ────────────────────────────────────────
   The confetti count Detail and tidiness shows ("In the preview") is the
   finished chart's: measured after look-alike separation and the Threads
   (max) limit, which can change stitches after Reduce confetti was
   measured. The worker and the page pipeline agree, and the page preview
   keeps to the thread limit as Generate does.
   ─────────────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createCanvas, Image, ImageData, loadImage } = require('canvas');

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
function workerResult(c, raw, w, h, settings) {
  c.messages.length = 0;
  c.onmessage({ data: { type: 'generate', reqId: 1, pixels: raw.slice().buffer, width: w, height: h, settings } });
  expect(c.messages.filter(x => x.type === 'error')).toEqual([]);
  return c.messages.find(x => x.type === 'result');
}
async function pixels(file, n) {
  const img = await loadImage(path.join(__dirname, '..', file));
  const cv = createCanvas(n, n);
  cv.getContext('2d').drawImage(img, 0, 0, n, n);
  return cv.getContext('2d').getImageData(0, 0, n, n).data;
}
function threadIds(mapped) {
  const ids = new Set();
  mapped.forEach(m => {
    if (m.id === '__skip__') return;
    if (m.type === 'blend' && m.threads) m.threads.forEach(t => ids.add(t.id));
    else ids.add(m.id);
  });
  return ids;
}
// The logo with the Photo type's settings and strong look-alike separation:
// the review's reproduction (the summary showed the count before separation).
const PHOTO_STRONG = { maxC: 24, dith: true, dithAlgo: 'atkinson', dithStrength: 0.5, allowBlends: true,
  skipBg: false, bgCol: [255, 255, 255], bgTh: 15, minSt: 0, seed: 1337,
  stitchCleanup: { enabled: true, protectDetails: true }, orphans: 2,
  disambig: true, disambigLevel: 'strong' };

describe('the finished chart\'s confetti count', () => {
  let page, worker, raw;
  beforeAll(async () => {
    page = runtime(false);
    worker = runtime(true);
    raw = await pixels('tests/fixtures/logo.png', 60);
  });

  test('is measured after look-alike separation, which changed stitches', () => {
    const r = page.runCleanupPipeline(new Uint8ClampedArray(raw), 60, 60, PHOTO_STRONG);
    expect(r.disambigData.swaps).toBeGreaterThan(0);
    const recount = page.analyzeConfetti(r.mapped, 60, 60);
    expect(r.confettiFinal.singles).toBe(recount.singles);
    // The cleanup count (kept for the before/after comparison) is the earlier one.
    expect(r.confettiClean.singles).not.toBe(recount.singles);
  });

  test('the worker reports the same finished count as the page', () => {
    const r = page.runCleanupPipeline(new Uint8ClampedArray(raw), 60, 60, PHOTO_STRONG);
    const w = workerResult(worker, raw, 60, 60, PHOTO_STRONG);
    expect(w.mapped.map(m => m.id)).toEqual(r.mapped.map(m => m.id));
    expect(w.confettiData.final.singles).toBe(r.confettiFinal.singles);
    expect(w.confettiData.final.singles).toBe(page.analyzeConfetti(w.mapped, 60, 60).singles);
  });

  test('with nothing changed after cleanup, it is the cleanup count (no second measurement)', () => {
    const opts = Object.assign({}, PHOTO_STRONG, { disambig: false });
    const r = page.runCleanupPipeline(new Uint8ClampedArray(raw), 60, 60, opts);
    expect(r.confettiFinal).toBe(r.confettiClean || r.confettiRaw);
    expect(r.confettiFinal.singles).toBe(page.analyzeConfetti(r.mapped, 60, 60).singles);
  });

  test('Generate keeps the cleanup counts and adds the finished one', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'creator', 'generate.js'), 'utf8');
    expect(src).toMatch(/confettiData: \{ raw: rawConfetti, clean: cleanConfetti, final: pipelineResult\.confettiFinal \}/);
  });
});

describe('Threads (max) on the page preview', () => {
  test('the page pipeline keeps to the limit, as Generate and the worker do', async () => {
    const page = runtime(false), worker = runtime(true);
    const raw = await pixels('scripts/conversion-accuracy/img/astronaut.png', 50);
    for (const maxC of [4, 6, 10]) {
      const opts = Object.assign({}, PHOTO_STRONG, { maxC, disambig: false });
      const r = page.runCleanupPipeline(new Uint8ClampedArray(raw), 50, 50, opts);
      expect(threadIds(r.mapped).size).toBeLessThanOrEqual(maxC);
      const w = workerResult(worker, raw, 50, 50, opts);
      expect(w.mapped.map(m => m.id)).toEqual(r.mapped.map(m => m.id));
      expect(r.confettiFinal.singles).toBe(page.analyzeConfetti(r.mapped, 50, 50).singles);
    }
  });

  test('enforceMaxColours says whether it changed stitches', () => {
    const page = runtime(false);
    const t = id => ({ id, type: 'solid', rgb: [0, 0, 0], lab: [0, 0, 0] });
    const pal = [t('a'), t('b'), t('c')];
    const mapped = [t('a'), t('a'), t('a'), t('b'), t('b'), t('c')];
    const raw = new Uint8ClampedArray(6 * 4);
    expect(page.enforceMaxColours(mapped, pal, raw, 3)).toBe(false);
    expect(page.enforceMaxColours(mapped, pal, raw, 2)).toBe(true);
    expect(new Set(mapped.map(m => m.id))).toEqual(new Set(['a', 'b']));
  });
});
