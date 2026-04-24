// Tests for A1 (UX Phase 5) — the pure helper that powers the
// "Limit to stash" warning panel. Extracts
// StashBridge.computeUnownedPaletteIds from stash-bridge.js without booting
// IndexedDB, the same approach used by other pure-function tests in this repo.

const fs = require('fs');
const path = require('path');

const raw = fs.readFileSync(path.join(__dirname, '..', 'stash-bridge.js'), 'utf8');

function extractMethod(src, name) {
  const sig = `${name}(displayPal, globalStash, options) {`;
  const start = src.indexOf(sig);
  if (start === -1) throw new Error(`could not find ${name} in stash-bridge.js`);
  // skip past the signature to the first opening brace
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const body = src.slice(src.indexOf('{', start) + 1, i);
        // eslint-disable-next-line no-new-func
        return new Function('displayPal', 'globalStash', 'options', body);
      }
    }
  }
  throw new Error(`could not balance braces for ${name}`);
}

const computeUnownedPaletteIds = extractMethod(raw, 'computeUnownedPaletteIds');

// Default option set used by most tests below. Provides catalog-free
// resolveBrand and splitBlendId implementations.
function opts(extra) {
  return Object.assign({
    resolveBrand: function() { return 'dmc'; },
    splitBlendId: function(id) { return String(id || '').split('+'); },
    skeinEst: function(stitches) { return Math.max(1, Math.ceil((stitches || 0) / 1800)); }
  }, extra || {});
}

describe('computeUnownedPaletteIds', () => {
  test('returns empty array when palette is empty', () => {
    expect(computeUnownedPaletteIds([], {}, opts())).toEqual([]);
  });

  test('returns empty array when every palette thread is fully owned', () => {
    const pal = [
      { id: '310', type: 'solid', count: 100 },
      { id: '550', type: 'solid', count: 100 }
    ];
    const stash = {
      'dmc:310': { owned: 5 },
      'dmc:550': { owned: 5 }
    };
    expect(computeUnownedPaletteIds(pal, stash, opts())).toEqual([]);
  });

  test('flags threads with zero owned skeins', () => {
    const pal = [
      { id: '310', type: 'solid', count: 100 },
      { id: '550', type: 'solid', count: 4000 }
    ];
    const stash = {
      'dmc:310': { owned: 1 }
      // dmc:550 missing entirely
    };
    expect(computeUnownedPaletteIds(pal, stash, opts())).toEqual(['dmc:550']);
  });

  test('flags threads with insufficient owned skeins (partial)', () => {
    const pal = [
      // 5000 stitches at 14ct → ceil(5000/1800) = 3 skeins needed
      { id: '310', type: 'solid', count: 5000 }
    ];
    const stash = { 'dmc:310': { owned: 1 } };
    expect(computeUnownedPaletteIds(pal, stash, opts())).toEqual(['dmc:310']);
  });

  test('expands blends into both component keys', () => {
    const pal = [
      { id: '310+550', type: 'blend', count: 100 }
    ];
    const stash = {}; // nothing owned
    const got = computeUnownedPaletteIds(pal, stash, opts());
    expect(got.sort()).toEqual(['dmc:310', 'dmc:550'].sort());
  });

  test('blend with one owned component only flags the missing component', () => {
    const pal = [
      { id: '310+550', type: 'blend', count: 100 }
    ];
    const stash = { 'dmc:310': { owned: 5 } };
    expect(computeUnownedPaletteIds(pal, stash, opts())).toEqual(['dmc:550']);
  });

  test('skips placeholder ids', () => {
    const pal = [
      { id: '__skip__', type: 'solid', count: 0 },
      { id: '__empty__', type: 'solid', count: 0 }
    ];
    expect(computeUnownedPaletteIds(pal, {}, opts())).toEqual([]);
  });

  test('deduplicates when the same id appears in multiple palette entries', () => {
    const pal = [
      { id: '310', type: 'solid', count: 100 },
      { id: '310+550', type: 'blend', count: 100 }
    ];
    const stash = {}; // nothing owned
    const got = computeUnownedPaletteIds(pal, stash, opts());
    // 'dmc:310' should appear only once even though it's referenced twice
    expect(got.filter(k => k === 'dmc:310').length).toBe(1);
    expect(got.sort()).toEqual(['dmc:310', 'dmc:550'].sort());
  });

  test('honours per-entry brand override (Anchor)', () => {
    const pal = [
      { id: '403', type: 'solid', count: 100, brand: 'anchor' }
    ];
    expect(computeUnownedPaletteIds(pal, {}, opts())).toEqual(['anchor:403']);
  });

  test('treats null stash as owning nothing', () => {
    const pal = [{ id: '310', type: 'solid', count: 100 }];
    // No stash at all → every thread is unowned
    expect(computeUnownedPaletteIds(pal, null, opts())).toEqual(['dmc:310']);
  });
});
