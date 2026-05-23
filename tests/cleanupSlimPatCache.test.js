// CL-4: slim-pat cache for auto-detect worker.
// Structural assertions on useCleanupMode.js plus a behavioural test of
// the cache predicate (which would otherwise require a full React render).

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'creator', 'useCleanupMode.js'),
  'utf8'
);

describe('CL-4: slim-pat cache structural shape', () => {
  test('useCleanupMode declares slimPatCacheRef', () => {
    expect(src).toMatch(/CL-4:/);
    expect(src).toMatch(
      /var slimPatCacheRef = useRef\(\{ pat: null, cmap: null, slim: null \}\)/);
  });

  test('runAutoDetect checks the cache before allocating', () => {
    // Identity equality on both pat and cmap, plus a length sanity check.
    expect(src).toMatch(
      /cache\.pat === pat && cache\.cmap === cmap && cache\.slim && cache\.slim\.length === pat\.length/);
  });

  test('cache is repopulated on miss', () => {
    expect(src).toMatch(
      /slimPatCacheRef\.current = \{ pat: pat, cmap: cmap, slim: slimPat \}/);
  });
});

describe('CL-4: cache predicate behaviour', () => {
  // Mirror the predicate so we can assert the invalidation logic without
  // pulling in React.
  function pick(cache, pat, cmap) {
    if (cache.pat === pat && cache.cmap === cmap && cache.slim
        && cache.slim.length === pat.length) {
      return cache.slim;
    }
    return null;
  }
  const pat = [{ id: 'a' }, { id: 'b' }];
  const cmap = { a: { lab: [0, 0, 0] }, b: { lab: [50, 0, 0] } };
  const slim = [{ id: 'a', lab: [0, 0, 0] }, { id: 'b', lab: [50, 0, 0] }];

  test('same pat + same cmap returns cached slim', () => {
    expect(pick({ pat, cmap, slim }, pat, cmap)).toBe(slim);
  });
  test('different pat identity invalidates', () => {
    expect(pick({ pat, cmap, slim }, pat.slice(), cmap)).toBeNull();
  });
  test('different cmap identity invalidates', () => {
    expect(pick({ pat, cmap, slim }, pat, { ...cmap })).toBeNull();
  });
  test('mismatched length invalidates', () => {
    const stale = [{ id: 'a', lab: [0, 0, 0] }];
    expect(pick({ pat, cmap, slim: stale }, pat, cmap)).toBeNull();
  });
  test('null cache state misses cleanly', () => {
    expect(pick({ pat: null, cmap: null, slim: null }, pat, cmap)).toBeNull();
  });
});
