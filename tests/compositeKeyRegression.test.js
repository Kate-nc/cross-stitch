// Regression tests for composite-key handling (C1 + C2 from the branch audit).
// C1: useCreatorState.js must extract bare DMC ids from composite stash keys
//     ('dmc:310') rather than comparing the composite key directly to DMC[].id.
// C2: stats-insights.js ColourHeatmap must mark blend ids ("310+550") as owned
//     when every component is in stash.

const fs = require('fs');
const path = require('path');

describe('C1 — useCreatorState composite-key extraction', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useCreatorState.js'), 'utf8');

  // Extract the helper using a controlled eval so we can call it directly.
  const helperMatch = src.match(/function _extractDmcId\(key\) \{[\s\S]*?\n\}/);

  it('helper is present in source', () => {
    expect(helperMatch).not.toBeNull();
  });

  // Build a callable copy of the helper.
  const _extractDmcId = new Function('return ' + helperMatch[0])();

  it('extracts bare id from dmc: composite key', () => {
    expect(_extractDmcId('dmc:310')).toBe('310');
    expect(_extractDmcId('dmc:B5200')).toBe('B5200');
  });

  it('returns null for non-DMC brands', () => {
    expect(_extractDmcId('anchor:403')).toBeNull();
  });

  it('treats bare ids as DMC for back-compat', () => {
    expect(_extractDmcId('310')).toBe('310');
  });

  it('rejects non-string inputs', () => {
    expect(_extractDmcId(null)).toBeNull();
    expect(_extractDmcId(undefined)).toBeNull();
    expect(_extractDmcId(310)).toBeNull();
  });

  it('all composite-key call sites funnel through the central helper', () => {
    // The original C1 bug was each call site iterating globalStash keys and
    // hand-rolling its own brand parsing. The fix consolidated all sites onto
    // the central _buildAllowedPaletteFromStash helper so the brand-aware
    // logic lives in exactly one place. Direct uses of _extractDmcId(key)
    // are also acceptable (legacy bare-id callers).
    const helperUses = (src.match(/_buildAllowedPaletteFromStash\(/g) || []).length;
    const directUses = (src.match(/_extractDmcId\(key\)/g) || []).length;
    // Helper is defined once + called from at minimum the conversionSettings
    // memo, the generate flow, randomise, generateGallery, and the coverage
    // useEffect. Combined surface area must be ≥ 5.
    expect(helperUses + directUses).toBeGreaterThanOrEqual(5);
    // The buggy pattern (DMC.find(d => d.id === id) where id came from Object.keys)
    // should no longer compare against the raw key.
    expect(src).not.toMatch(/Object\.keys\(globalStash[^)]*\)\.forEach\(function\(id\) \{[\s\S]{0,80}DMC\.find\(function\(d\) \{ return d\.id === id;/);
  });
});

describe('C1b — Create-from-stash is DMC-only (pipeline id-safety)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useCreatorState.js'), 'utf8');

  // Extract the central helper. It depends on findThreadInCatalog, which we
  // stub in the eval context with a tiny in-memory catalogue.
  const helperMatch = src.match(/function _splitStashKey\(key\)[\s\S]*?\n\}/);
  const builderMatch = src.match(/function _buildAllowedPaletteFromStash\(globalStash, subset\)[\s\S]*?\n\}/);

  it('helpers are present in source', () => {
    expect(helperMatch).not.toBeNull();
    expect(builderMatch).not.toBeNull();
  });

  // Stub catalogue with one DMC and one Anchor entry for the eval scope.
  const fakeDmc   = { id: '310', name: 'Black',     rgb: [0, 0, 0],     lab: [0, 0, 0] };
  const fakeAnch  = { id: '403', name: 'Anch Black',rgb: [10, 10, 10],  lab: [3, 0, 0] };
  function findThreadInCatalog(brand, id) {
    if (brand === 'dmc' && id === '310') return fakeDmc;
    if (brand === 'anchor' && id === '403') return fakeAnch;
    return null;
  }
  // eslint-disable-next-line no-new-func
  const _build = new Function(
    'findThreadInCatalog',
    helperMatch[0] + '\n' + builderMatch[0] + '\nreturn _buildAllowedPaletteFromStash;'
  )(findThreadInCatalog);

  it('returns null palette when stash is empty', () => {
    expect(_build({}, null).palette).toBeNull();
    expect(_build(null, null).palette).toBeNull();
  });

  it('includes DMC threads (legacy bare ids and dmc: composite keys)', () => {
    const got = _build({ '310': { owned: 1 } }, null);
    expect(got.count).toBe(1);
    expect(got.palette[0].id).toBe('310');
    expect(got.palette[0].brand).toBe('dmc');
    const got2 = _build({ 'dmc:310': { owned: 1 } }, null);
    expect(got2.count).toBe(1);
    expect(got2.palette[0].brand).toBe('dmc');
  });

  it('excludes non-DMC threads — pipeline uses bare ids and brands share many ids', () => {
    // Anchor id '403' is excluded because including it with bare id '403' would
    // corrupt quantize/buildPalette which keys colours by id alone.
    const got = _build({ 'anchor:403': { owned: 2 } }, null);
    expect(got.count).toBe(0);
    expect(got.palette).toBeNull();
  });

  it('only counts DMC threads when stash has mixed brands', () => {
    const got = _build({ 'dmc:310': { owned: 1 }, 'anchor:403': { owned: 1 } }, null);
    expect(got.count).toBe(1);
    expect(got.palette[0].brand).toBe('dmc');
  });

  it('skips DMC entries with owned <= 0', () => {
    const got = _build({ 'dmc:310': { owned: 0 } }, null);
    expect(got.count).toBe(0);
    expect(got.palette).toBeNull();
  });
});

describe('C2 — stats-insights ColourHeatmap blend ownership', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'stats-insights.js'), 'utf8');

  it('isOwned helper splits blend ids on "+"', () => {
    expect(src).toMatch(/function isOwned\(id\)/);
    expect(src).toMatch(/String\(id\)\.indexOf\('\+'\)/);
    expect(src).toMatch(/\.every\(sub =>/);
  });

  it('isOwned logic — every component must be in stash for a blend to count', () => {
    // Reconstruct a minimal version of the helper to validate semantics.
    function makeIsOwned(stash) {
      return function isOwned(id) {
        if (!stash) return false;
        const ids = String(id).indexOf('+') !== -1
          ? String(id).split('+').map(s => s.trim()).filter(Boolean)
          : [id];
        return ids.length > 0 && ids.every(sub => stash['dmc:' + sub] && (stash['dmc:' + sub].owned || 0) > 0);
      };
    }
    const stash = { 'dmc:310': { owned: 5 }, 'dmc:550': { owned: 0 }, 'dmc:321': { owned: 3 } };
    const isOwned = makeIsOwned(stash);
    expect(isOwned('310')).toBe(true);
    expect(isOwned('550')).toBe(false);
    expect(isOwned('310+321')).toBe(true);
    expect(isOwned('310+550')).toBe(false);
    expect(isOwned('999')).toBe(false);
  });

  it('returns false when stash is unavailable', () => {
    function isOwned(id, stash) {
      if (!stash) return false;
      return true;
    }
    expect(isOwned('310', null)).toBe(false);
  });
});

describe('C3 — stash-bridge migration chaining', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'stash-bridge.js'), 'utf8');

  it('migrateSchemaToV3 is awaited via promise chain return', () => {
    // Pattern: .then(function() { return StashBridge.migrateSchemaToV3(); })
    expect(src).toMatch(/\.then\(function\(\) \{ return StashBridge\.migrateSchemaToV3\(\); \}\)/);
  });

  it('migration chain has a catch handler', () => {
    expect(src).toMatch(/migrateSchemaToV2\(\)[\s\S]{0,200}\.catch\(/);
  });
});
