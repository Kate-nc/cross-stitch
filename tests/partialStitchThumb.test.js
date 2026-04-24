/**
 * Tests for components/PartialStitchThumb.js
 *
 * The component touches HTMLCanvasElement which jest does not provide.
 * We follow the existing repo pattern (see embroidery-image-processing.test.js)
 * and exercise the pure helpers — doneHash, makeCacheKey, cacheGet/cacheSet —
 * by extracting them via fs.readFileSync + eval inside a fake `window`.
 * Source-level assertions guard the public API surface.
 */
const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', 'components', 'PartialStitchThumb.js');
const raw = fs.readFileSync(SRC_PATH, 'utf8');

// ── source-level assertions ────────────────────────────────────────────────
describe('PartialStitchThumb source contract', () => {
  test('exposes window.PartialStitchThumb', () => {
    expect(raw).toMatch(/window\.PartialStitchThumb\s*=\s*PartialStitchThumb/);
  });
  test('exposes window.PartialStitchThumbCache with clear and size', () => {
    expect(raw).toMatch(/window\.PartialStitchThumbCache\s*=/);
    expect(raw).toMatch(/clear:\s*function/);
    expect(raw).toMatch(/size:\s*function/);
  });
  test('handles done == null without crashing (renders fully ghosted)', () => {
    // The render path must guard on done == null and skip indexing into it.
    expect(raw).toMatch(/var hasDone\s*=\s*done\s*!=\s*null/);
  });
  test('skips __skip__ and __empty__ cells (transparent)', () => {
    expect(raw).toMatch(/__skip__/);
    expect(raw).toMatch(/__empty__/);
  });
  test('uses no emoji / forbidden symbols in user-facing strings', () => {
    // Allow box-drawing dividers in headers (═) but no emoji elsewhere.
    // Strip header dividers, then assert no emoji-range chars survive.
    const stripped = raw.replace(/[═]+/g, '');
    expect(stripped).not.toMatch(/[\u2600-\u27BF\uD83C-\uDBFF]/);
  });
});

// ── load helpers into a fake browser-ish global ────────────────────────────
function loadInSandbox() {
  const sandboxWindow = {};
  const sandboxReact  = { useMemo: (fn) => fn() };
  // We don't need document/canvas — we only call the pure helpers.
  // The IIFE references `document` only inside renderToDataUrl, which we
  // never invoke from these tests.
  // eslint-disable-next-line no-new-func
  const runner = new Function('window', 'React', 'document', raw);
  runner(sandboxWindow, sandboxReact, undefined);
  return sandboxWindow.__PartialStitchThumbInternals;
}

const internals = loadInSandbox();

describe('doneHash', () => {
  test('is stable for identical arrays', () => {
    const a = new Int8Array([0, 1, 0, 1, 1, 0, 0, 1]);
    const b = new Int8Array([0, 1, 0, 1, 1, 0, 0, 1]);
    expect(internals.doneHash(a, a.length)).toBe(internals.doneHash(b, b.length));
  });
  test('differs when one cell flips', () => {
    const a = new Int8Array([0, 0, 0, 0, 0, 0, 0, 0]);
    const b = new Int8Array([0, 0, 0, 1, 0, 0, 0, 0]);
    expect(internals.doneHash(a, a.length)).not.toBe(internals.doneHash(b, b.length));
  });
  test('differs for different lengths', () => {
    const a = new Int8Array(10);
    const b = new Int8Array(11);
    expect(internals.doneHash(a, a.length)).not.toBe(internals.doneHash(b, b.length));
  });
  test('handles null done (no tracking)', () => {
    const k1 = internals.doneHash(null, 100);
    const k2 = internals.doneHash(null, 100);
    const k3 = internals.doneHash(null, 101);
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });
  test('plain Array and Int8Array with same contents hash equal', () => {
    const arr = [0, 1, 1, 0, 1];
    const ti  = new Int8Array(arr);
    expect(internals.doneHash(arr, arr.length)).toBe(internals.doneHash(ti, ti.length));
  });
});

describe('makeCacheKey', () => {
  test('shape: projectId|WxH|size|dHash', () => {
    expect(internals.makeCacheKey('proj_x', 80, 60, 64, 'abc'))
      .toBe('proj_x|80x60|64|abc');
  });
  test('falls back to anon when projectId missing', () => {
    expect(internals.makeCacheKey(null, 10, 10, 64, 'z'))
      .toBe('anon|10x10|64|z');
  });
});

describe('LRU cache', () => {
  beforeEach(() => internals._cache.clear());

  test('cacheGet returns the cached value', () => {
    internals.cacheSet('k1', 'data:image/png;base64,AAA');
    expect(internals.cacheGet('k1')).toBe('data:image/png;base64,AAA');
  });

  test('evicts oldest entry past the cap', () => {
    const cap = internals.CACHE_CAP;
    for (let i = 0; i < cap; i++) internals.cacheSet('k' + i, 'v' + i);
    expect(internals._cache.size).toBe(cap);
    // Insert one more — first key should be evicted.
    internals.cacheSet('overflow', 'v_overflow');
    expect(internals._cache.size).toBe(cap);
    expect(internals.cacheGet('k0')).toBeUndefined();
    expect(internals.cacheGet('overflow')).toBe('v_overflow');
  });

  test('insert 33 (cap+1) evicts the very first key', () => {
    const cap = internals.CACHE_CAP;
    expect(cap).toBe(32);
    for (let i = 0; i < cap + 1; i++) internals.cacheSet('key' + i, i);
    expect(internals.cacheGet('key0')).toBeUndefined();
    expect(internals.cacheGet('key' + cap)).toBe(cap);
  });

  test('cacheGet refreshes recency (move-to-end)', () => {
    const cap = internals.CACHE_CAP;
    for (let i = 0; i < cap; i++) internals.cacheSet('k' + i, i);
    // Touch k0 so it becomes most recent — now k1 is the oldest.
    internals.cacheGet('k0');
    internals.cacheSet('newest', 'n');
    expect(internals.cacheGet('k0')).toBe(0);
    expect(internals.cacheGet('k1')).toBeUndefined();
  });

  test('cache hit returns same value without recomputing', () => {
    let computeCount = 0;
    function compute() { computeCount++; return 'computed'; }
    const key = internals.makeCacheKey('p', 10, 10, 64, 'h');
    let v = internals.cacheGet(key);
    if (v === undefined) { v = compute(); internals.cacheSet(key, v); }
    let v2 = internals.cacheGet(key);
    if (v2 === undefined) { v2 = compute(); internals.cacheSet(key, v2); }
    expect(v).toBe('computed');
    expect(v2).toBe('computed');
    expect(computeCount).toBe(1);
  });
});

describe('anonProjectKey', () => {
  test('produces stable id from first/mid/last cell IDs + length', () => {
    const pat = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
    const k1 = internals.anonProjectKey(pat);
    const k2 = internals.anonProjectKey(pat.slice());
    expect(k1).toBe(k2);
  });
  test('differs when palette swap changes ids', () => {
    const a = [{ id: '310' }, { id: '550' }, { id: '666' }];
    const b = [{ id: '310' }, { id: '700' }, { id: '666' }];
    expect(internals.anonProjectKey(a)).not.toBe(internals.anonProjectKey(b));
  });
});
