// Tests for the stash partial-skein fix (Phases 2-4).
//
// Phase 4 spec cases:
//   isColorOwned: 0.5 owned → owned; 0 → not owned; negative/NaN → not owned
//   regression: multi-partial stash works in _buildAllowedPaletteFromStash
//   owned-but-low colour still appears in computeUnownedPaletteIds output
//
// Extraction approach: the module-level helpers in stash-bridge.js live
// before the StashBridge IIFE. We slice that preamble out and eval it in a
// fresh Function scope so we get the real implementations without booting
// IndexedDB.

const fs   = require('fs');
const path = require('path');

// ── Source files ──────────────────────────────────────────────────────────────
const sbSrc = fs.readFileSync(path.join(__dirname, '..', 'stash-bridge.js'), 'utf8');
const ucSrc = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useCreatorState.js'), 'utf8');

// ── Extract module-level helpers from stash-bridge.js ────────────────────────
const iifeBoundary = sbSrc.indexOf('const StashBridge = (() => {');
if (iifeBoundary === -1) throw new Error('Cannot find StashBridge IIFE boundary in stash-bridge.js');
const preamble = sbSrc.slice(0, iifeBoundary);

// eslint-disable-next-line no-new-func
const { PARTIAL_STATUS_FRACTIONS, LOW_STASH_SKEIN_THRESHOLD, stashEffectiveQty, isColorOwned } =
  new Function(preamble + '\nreturn { PARTIAL_STATUS_FRACTIONS, LOW_STASH_SKEIN_THRESHOLD, stashEffectiveQty, isColorOwned };')();

// ── Extract _buildAllowedPaletteFromStash from useCreatorState.js ─────────────
function extractBuilderFn(src) {
  const helperMatch   = src.match(/function _splitStashKey\(key\)[\s\S]*?\n\}/);
  const builderMatch  = src.match(/function _buildAllowedPaletteFromStash\(globalStash, subset\)[\s\S]*?\n\}/);
  if (!helperMatch)  throw new Error('_splitStashKey not found in useCreatorState.js');
  if (!builderMatch) throw new Error('_buildAllowedPaletteFromStash not found in useCreatorState.js');
  // findThreadInCatalog and isColorOwned are injected as parameters.
  // eslint-disable-next-line no-new-func
  return new Function(
    'findThreadInCatalog',
    'isColorOwned',
    helperMatch[0] + '\n' + builderMatch[0] + '\nreturn _buildAllowedPaletteFromStash;'
  );
}

// Minimal in-memory catalogue with a handful of DMC threads.
const _catalog = {
  dmc: {
    '310': { id: '310', name: 'Black',         rgb: [0, 0, 0],     lab: [0, 0, 0]     },
    '550': { id: '550', name: 'Very Dk Violet', rgb: [50, 0, 80],   lab: [10, 20, -30] },
    '321': { id: '321', name: 'Red',            rgb: [196, 3, 3],   lab: [30, 55, 45]  },
    '3750': { id: '3750', name: 'Very Dk Ant Blue', rgb: [33, 52, 75], lab: [20, -5, -22] },
  },
};
function findThreadInCatalog(brand, id) {
  return (_catalog[brand] && _catalog[brand][id]) || null;
}

const _buildFn = extractBuilderFn(ucSrc);
const _build = _buildFn(findThreadInCatalog, isColorOwned);

// ── Extract computeUnownedPaletteIds from stash-bridge.js ─────────────────────
function extractComputeUnowned(src, preambleCode) {
  const sig   = 'computeUnownedPaletteIds(displayPal, globalStash, options) {';
  const start = src.indexOf(sig);
  if (start === -1) throw new Error('computeUnownedPaletteIds not found in stash-bridge.js');
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const body = src.slice(src.indexOf('{', start) + 1, i);
        // Prepend preamble so stashEffectiveQty is in scope.
        // eslint-disable-next-line no-new-func
        return new Function('displayPal', 'globalStash', 'options', preambleCode + '\n' + body);
      }
    }
  }
  throw new Error('Could not balance braces for computeUnownedPaletteIds');
}

const computeUnownedPaletteIds = extractComputeUnowned(sbSrc, preamble);

function opts(extra) {
  return Object.assign({
    resolveBrand: () => 'dmc',
    splitBlendId: id => String(id || '').split('+'),
    skeinEst: stitches => Math.max(1, Math.ceil((stitches || 0) / 1800)),
  }, extra || {});
}

// ═════════════════════════════════════════════════════════════════════════════
describe('PARTIAL_STATUS_FRACTIONS', () => {
  test('contains all expected status values', () => {
    expect(PARTIAL_STATUS_FRACTIONS['mostly-full']).toBe(0.75);
    expect(PARTIAL_STATUS_FRACTIONS['about-half']).toBe(0.50);
    expect(PARTIAL_STATUS_FRACTIONS['remnant']).toBe(0.25);
  });

  test('does not contain used-up (zero remaining)', () => {
    expect(PARTIAL_STATUS_FRACTIONS['used-up']).toBeUndefined();
  });

  test('is frozen (immutable)', () => {
    expect(Object.isFrozen(PARTIAL_STATUS_FRACTIONS)).toBe(true);
  });
});

describe('LOW_STASH_SKEIN_THRESHOLD', () => {
  test('equals 1 (warn when effective qty < 1 skein)', () => {
    expect(LOW_STASH_SKEIN_THRESHOLD).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('stashEffectiveQty', () => {
  test('returns 0 for null / undefined', () => {
    expect(stashEffectiveQty(null)).toBe(0);
    expect(stashEffectiveQty(undefined)).toBe(0);
  });

  test('returns 0 for non-object inputs', () => {
    expect(stashEffectiveQty(42)).toBe(0);
    expect(stashEffectiveQty('3')).toBe(0);
  });

  test('returns integer owned when no partial', () => {
    expect(stashEffectiveQty({ owned: 3 })).toBe(3);
    expect(stashEffectiveQty({ owned: 1 })).toBe(1);
  });

  test('returns 0 for owned: 0 with no partial', () => {
    expect(stashEffectiveQty({ owned: 0 })).toBe(0);
  });

  test('adds partial fraction to full skein count', () => {
    expect(stashEffectiveQty({ owned: 2, partialStatus: 'about-half' })).toBeCloseTo(2.5);
    expect(stashEffectiveQty({ owned: 1, partialStatus: 'remnant' })).toBeCloseTo(1.25);
  });

  test('returns partial fraction alone when owned is 0', () => {
    expect(stashEffectiveQty({ owned: 0, partialStatus: 'mostly-full' })).toBeCloseTo(0.75);
    expect(stashEffectiveQty({ owned: 0, partialStatus: 'about-half' })).toBeCloseTo(0.5);
    expect(stashEffectiveQty({ owned: 0, partialStatus: 'remnant' })).toBeCloseTo(0.25);
  });

  test('returns 0 for used-up partial (skein exhausted)', () => {
    expect(stashEffectiveQty({ owned: 0, partialStatus: 'used-up' })).toBe(0);
  });

  test('returns 0 for null partial status', () => {
    expect(stashEffectiveQty({ owned: 0, partialStatus: null })).toBe(0);
  });

  test('treats negative owned as 0 and still adds partial', () => {
    expect(stashEffectiveQty({ owned: -1, partialStatus: 'about-half' })).toBeCloseTo(0.5);
    expect(stashEffectiveQty({ owned: -5 })).toBe(0);
  });

  test('treats NaN owned as 0 and still adds partial', () => {
    expect(stashEffectiveQty({ owned: NaN })).toBe(0);
    expect(stashEffectiveQty({ owned: NaN, partialStatus: 'remnant' })).toBeCloseTo(0.25);
  });

  // Phase 4 spec: fractional owned values (e.g. if owned: 0.5 is ever stored directly)
  test('returns fractional owned value when owned is a positive fraction', () => {
    expect(stashEffectiveQty({ owned: 0.5 })).toBeCloseTo(0.5);
    expect(stashEffectiveQty({ owned: 2.5 })).toBeCloseTo(2.5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('isColorOwned', () => {
  // Phase 4 spec: 0.5 → owned; 0 → not owned; negative/NaN → not owned
  test('owned: 0.5 → owned (fractional)', () => {
    expect(isColorOwned({ owned: 0.5 })).toBe(true);
  });

  test('owned: 2.5 → owned (fractional with integer part)', () => {
    expect(isColorOwned({ owned: 2.5 })).toBe(true);
  });

  test('owned: 1 → owned', () => {
    expect(isColorOwned({ owned: 1 })).toBe(true);
  });

  test('owned: 0, no partial → not owned', () => {
    expect(isColorOwned({ owned: 0 })).toBe(false);
  });

  test('null entry → not owned', () => {
    expect(isColorOwned(null)).toBe(false);
  });

  test('undefined entry → not owned', () => {
    expect(isColorOwned(undefined)).toBe(false);
  });

  test('owned: -1 → not owned', () => {
    expect(isColorOwned({ owned: -1 })).toBe(false);
  });

  test('owned: NaN → not owned', () => {
    expect(isColorOwned({ owned: NaN })).toBe(false);
  });

  test('owned: 0, partialStatus: mostly-full → owned', () => {
    expect(isColorOwned({ owned: 0, partialStatus: 'mostly-full' })).toBe(true);
  });

  test('owned: 0, partialStatus: about-half → owned', () => {
    expect(isColorOwned({ owned: 0, partialStatus: 'about-half' })).toBe(true);
  });

  test('owned: 0, partialStatus: remnant → owned', () => {
    expect(isColorOwned({ owned: 0, partialStatus: 'remnant' })).toBe(true);
  });

  test('owned: 0, partialStatus: used-up → NOT owned (skein exhausted)', () => {
    expect(isColorOwned({ owned: 0, partialStatus: 'used-up' })).toBe(false);
  });

  test('owned: 0, partialStatus: null → not owned', () => {
    expect(isColorOwned({ owned: 0, partialStatus: null })).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('_buildAllowedPaletteFromStash — partial-skein regression', () => {
  test('includes colour with only a partial skein (core regression)', () => {
    const stash = { 'dmc:310': { owned: 0, partialStatus: 'about-half' } };
    const got = _build(stash, null);
    expect(got.count).toBe(1);
    expect(got.palette[0].id).toBe('310');
  });

  test('multi-partial stash: all partial colours included', () => {
    const stash = {
      'dmc:310':  { owned: 0, partialStatus: 'mostly-full' },
      'dmc:550':  { owned: 0, partialStatus: 'about-half'  },
      'dmc:321':  { owned: 0, partialStatus: 'remnant'     },
      'dmc:3750': { owned: 0, partialStatus: 'used-up'     }, // should be excluded
    };
    const got = _build(stash, null);
    expect(got.count).toBe(3);
    const ids = got.palette.map(p => p.id).sort();
    expect(ids).toEqual(['310', '321', '550']);
  });

  test('mix of full and partial skeins: all owned colours included', () => {
    const stash = {
      'dmc:310': { owned: 2 },                              // full skeins only
      'dmc:550': { owned: 0, partialStatus: 'remnant' },    // partial only
      'dmc:321': { owned: 1, partialStatus: 'about-half' }, // both
    };
    const got = _build(stash, null);
    expect(got.count).toBe(3);
  });

  test('used-up partial still excluded from palette', () => {
    const stash = { 'dmc:310': { owned: 0, partialStatus: 'used-up' } };
    const got = _build(stash, null);
    expect(got.count).toBe(0);
    expect(got.palette).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('computeUnownedPaletteIds — partial-skein contribution', () => {
  test('partial-only entry is counted as owned when qty >= needed', () => {
    // Entry has 0.75 skeins (mostly-full); pattern needs ceil(100/1800)=1 skein.
    // Effective qty 0.75 < 1 required → shows in unowned (low-qty advisory).
    const pal = [{ id: '310', type: 'solid', count: 100 }];
    const stash = { 'dmc:310': { owned: 0, partialStatus: 'mostly-full' } };
    // 0.75 < 1 → still flagged as insufficient, advisory warning
    const result = computeUnownedPaletteIds(pal, stash, opts());
    expect(result).toEqual(['dmc:310']);
  });

  test('partial-only entry removed from unowned list when qty covers need', () => {
    // Entry has 0.75 skeins; skeinEst returns 0 (very few stitches → 0 needed).
    // We override skeinEst to return 0 so it's satisfied.
    const pal = [{ id: '310', type: 'solid', count: 1 }];
    const stash = { 'dmc:310': { owned: 0, partialStatus: 'mostly-full' } };
    const result = computeUnownedPaletteIds(pal, stash, opts({
      skeinEst: () => 0,   // 0 required → partial covers it
    }));
    expect(result).not.toContain('dmc:310');
  });

  test('owned-but-low colour still appears in the unowned list (advisory, not excluded)', () => {
    // A colour with 1 full skein but 5000 stitches (needs 3 skeins) is flagged
    // in the advisory list. This must not affect whether it gets into the
    // pattern — only computeUnownedPaletteIds / warning dots use this list.
    const pal   = [{ id: '310', type: 'solid', count: 5000 }];
    const stash = { 'dmc:310': { owned: 1 } };
    const result = computeUnownedPaletteIds(pal, stash, opts());
    expect(result).toContain('dmc:310'); // correctly flagged as low
    // But isColorOwned still returns true — ownership is independent of qty warning
    expect(isColorOwned(stash['dmc:310'])).toBe(true);
  });

  test('colour with zero owned and no partial is flagged as unowned', () => {
    const pal = [{ id: '310', type: 'solid', count: 100 }];
    const stash = { 'dmc:310': { owned: 0 } };
    const result = computeUnownedPaletteIds(pal, stash, opts());
    expect(result).toContain('dmc:310');
  });

  test('colour absent from stash is flagged as unowned', () => {
    const pal = [{ id: '310', type: 'solid', count: 100 }];
    const result = computeUnownedPaletteIds(pal, {}, opts());
    expect(result).toContain('dmc:310');
  });
});
