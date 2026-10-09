/**
 * Compare options before generating (P2-7, audit IMG-05).
 */
const { loadSource } = require('./_helpers/loadSource');
global.confettiTier = (pct) => ({ label: pct < 2 ? 'Excellent' : 'Good' });
global.creatorThreadCounts = (pal) => ({ threads: new Set((pal || []).flatMap((p) => String(p.id).split('+'))).size });
const C = require('../creator/CompareOptions.js');

describe('options', () => {
  test('Size: −25 %, current, +25 %', () => {
    const o = C.compareOptionsFor('size', { sW: 100, sH: 80, maxC: 15 });
    expect(o.map((x) => x.id)).toEqual(['minus', 'current', 'plus']);
    expect(o.map((x) => x.values)).toEqual([{ sW: 75, sH: 60 }, { sW: 100, sH: 80 }, { sW: 125, sH: 100 }]);
    expect(o[0].label).toBe('−25%');
    expect(o[2].label).toBe('+25%');
    expect(o[1].current).toBe(true);
  });

  test('Threads: −5, current, +5', () => {
    const o = C.compareOptionsFor('threads', { sW: 100, sH: 80, maxC: 15 });
    expect(o.map((x) => x.values.maxC)).toEqual([10, 15, 20]);
    expect(o[0].label).toBe('−5 threads');
  });

  test('sizes stay within 10–500 stitches and threads within 2–100', () => {
    expect(C.compareOptionsFor('size', { sW: 12, sH: 10 })[0].values).toEqual({ sW: 10, sH: 10 });
    expect(C.compareOptionsFor('size', { sW: 450, sH: 500 })[2].values).toEqual({ sW: 500, sH: 500 });
    expect(C.compareOptionsFor('threads', { maxC: 4 })[0].values.maxC).toBe(2);
    expect(C.compareOptionsFor('threads', { maxC: 98 })[2].values.maxC).toBe(100);
  });

  test('a neighbour equal to the current setting at a limit is marked, so it can\'t be chosen', () => {
    const o = C.compareOptionsFor('threads', { maxC: 2 });
    expect(o[0].same).toBe(true);
    expect(o[2].same).toBe(false);
    expect(C.compareOptionsFor('size', { sW: 10, sH: 10 })[0].same).toBe(true);
  });
});

describe('cache key', () => {
  const settings = { maxC: 15, dith: false, skipBg: true, bgCol: [255, 255, 255], allowedPalette: null, stitchCleanup: { enabled: true, strength: 'balanced' } };

  test('is the same for the same picture, settings and option, whatever the key order', () => {
    const a = C.compareCacheKey('img1', settings, { sW: 75, sH: 60 });
    const reordered = { stitchCleanup: settings.stitchCleanup, allowedPalette: null, bgCol: [255, 255, 255], skipBg: true, dith: false, maxC: 15 };
    expect(C.compareCacheKey('img1', reordered, { sH: 60, sW: 75 })).toBe(a);
  });

  test('changes with the picture, any setting or the option', () => {
    const a = C.compareCacheKey('img1', settings, { sW: 75, sH: 60 });
    expect(C.compareCacheKey('img2', settings, { sW: 75, sH: 60 })).not.toBe(a);
    expect(C.compareCacheKey('img1', Object.assign({}, settings, { dith: true }), { sW: 75, sH: 60 })).not.toBe(a);
    expect(C.compareCacheKey('img1', Object.assign({}, settings, { stitchCleanup: { enabled: true, strength: 'thorough' } }), { sW: 75, sH: 60 })).not.toBe(a);
    expect(C.compareCacheKey('img1', settings, { sW: 125, sH: 100 })).not.toBe(a);
  });

  test('a stash palette counts by its thread ids', () => {
    const p1 = Object.assign({}, settings, { allowedPalette: [{ id: '310', rgb: [0, 0, 0] }, { id: '321', brand: 'dmc' }] });
    const p2 = Object.assign({}, settings, { allowedPalette: [{ id: '310', rgb: [1, 1, 1] }, { id: '321' }] });
    const p3 = Object.assign({}, settings, { allowedPalette: [{ id: '310' }] });
    expect(C.compareCacheKey('i', p1, {})).toBe(C.compareCacheKey('i', p2, {}));
    expect(C.compareCacheKey('i', p1, {})).not.toBe(C.compareCacheKey('i', p3, {}));
  });
});

describe('reduced preview size and stats', () => {
  test('jobs run at no more than 100 × 100 cells', () => {
    expect(C.comparePreviewDims(80, 60)).toEqual({ pw: 80, ph: 60 });
    expect(C.comparePreviewDims(200, 200)).toEqual({ pw: 100, ph: 100 });
    const d = C.comparePreviewDims(500, 125);
    expect(d.pw * d.ph).toBeLessThanOrEqual(10000);
  });

  test('stats scale stitches to the full size and estimate hours', () => {
    const pal = [{ id: '310', count: 10 }, { id: '310+550', type: 'blend', count: 5 }];
    const s = C.compareStats(pal, 5000, 1, { w: 200, h: 200 }, { pw: 100, ph: 100 }, 40);
    expect(s).toEqual({ stitches: 20000, threads: 2, hours: 500, tier: 'Excellent' });
  });
});

describe('wiring', () => {
  test('the strip is in the bundle after the preview, uses the generate worker and drops stale batches', () => {
    const order = loadSource('build-creator-bundle.js');
    expect(order.indexOf("'CompareOptions.js'")).toBeGreaterThan(order.indexOf("'usePreview.js'"));
    expect(order.indexOf("'CompareStrip.js'")).toBeGreaterThan(order.indexOf("'CompareOptions.js'"));
    const strip = loadSource('creator/CompareStrip.js');
    expect(strip).toMatch(/new Worker\("generate-worker\.js"\)/);
    expect(strip).toMatch(/var batch = \+\+batchRef\.current;/);
    expect(strip).toMatch(/if \(busyRef\.current\) stopWorker\(\);/);
    expect(strip).toMatch(/if \(batch !== batchRef\.current\) return;/);
    expect(strip).toMatch(/var _open = React\.useState\(!props\.compact\);/);
  });

  test('choosing an option applies its size or thread count', () => {
    const main = loadSource('creator-main.js');
    expect(main).toMatch(/<window\.CreatorCompareStrip[\s\S]{0,400}onApply=\{function\(v\)\{\s*if\(v\.maxC!=null\)\{state\.setMaxC\(v\.maxC\);return;\}\s*state\.chgW\(v\.sW\);\s*if\(!state\.arLock\)state\.chgH\(v\.sH\);/);
  });
});
