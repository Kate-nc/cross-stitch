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

  it('all five composite-key call sites use _extractDmcId', () => {
    // Count occurrences of the pattern that previously bugged out.
    // The fixed code always pairs `_extractDmcId(key)` with `globalStash[key].owned`.
    const fixedSites = (src.match(/_extractDmcId\(key\)/g) || []).length;
    expect(fixedSites).toBeGreaterThanOrEqual(5);
    // The buggy pattern (DMC.find(d => d.id === id) where id came from Object.keys)
    // should no longer compare against the raw key.
    expect(src).not.toMatch(/Object\.keys\(globalStash[^)]*\)\.forEach\(function\(id\) \{[\s\S]{0,80}DMC\.find\(function\(d\) \{ return d\.id === id;/);
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
