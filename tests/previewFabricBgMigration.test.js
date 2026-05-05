// tests/previewFabricBgMigration.test.js
// Regression for DEFECT-006: legacy `previewFabricBg=true` should be migrated
// to fabricColour='#F5F0E6' on load. The migration is idempotent and never
// overwrites a fabricColour the user has already explicitly chosen.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'user-prefs.js'), 'utf8');

describe('user-prefs.js — previewFabricBg → fabricColour migration (DEFECT-006)', () => {
  test('migration block exists and references the legacy key', () => {
    expect(SRC).toMatch(/migratePreviewFabricBg/);
    expect(SRC).toMatch(/previewFabricBg/);
    expect(SRC).toMatch(/fabricColour/);
  });

  test('only writes fabricColour when it has not been set', () => {
    expect(SRC).toMatch(/getItem\(PREFIX_GLOBAL\s*\+\s*'fabricColour'\)/);
    expect(SRC).toMatch(/currentFabricRaw\s*===\s*null/);
  });

  test('migrates only when legacy value is true', () => {
    expect(SRC).toMatch(/legacyVal\s*===\s*true/);
  });

  test('removes the legacy key after running (idempotent re-run)', () => {
    expect(SRC).toMatch(/removeItem\(legacyKey\)/);
  });

  test('migrated colour is the documented #F5F0E6 beige', () => {
    expect(SRC).toMatch(/['"]#F5F0E6['"]/);
  });

  test('functional simulation: legacy true + unset fabricColour → migrates', () => {
    // Build a minimal localStorage stub and execute just the IIFE in isolation
    // to verify the actual logic, not just the source text.
    var store = {};
    store['cs_pref_previewFabricBg'] = JSON.stringify(true);
    var localStorage = {
      getItem: function(k){ return Object.prototype.hasOwnProperty.call(store,k) ? store[k] : null; },
      setItem: function(k,v){ store[k] = String(v); },
      removeItem: function(k){ delete store[k]; },
    };
    var PREFIX_GLOBAL = 'cs_pref_';
    var iifeMatch = SRC.match(/\(function migratePreviewFabricBg\(\)\{[\s\S]*?\}\)\(\);/);
    expect(iifeMatch).not.toBeNull();
    eval(iifeMatch[0]);
    expect(store['cs_pref_fabricColour']).toBe(JSON.stringify('#F5F0E6'));
    expect(store['cs_pref_previewFabricBg']).toBeUndefined();
  });

  test('functional simulation: legacy true + already-set fabricColour → preserved', () => {
    var store = {};
    store['cs_pref_previewFabricBg'] = JSON.stringify(true);
    store['cs_pref_fabricColour'] = JSON.stringify('#123456');
    var localStorage = {
      getItem: function(k){ return Object.prototype.hasOwnProperty.call(store,k) ? store[k] : null; },
      setItem: function(k,v){ store[k] = String(v); },
      removeItem: function(k){ delete store[k]; },
    };
    var PREFIX_GLOBAL = 'cs_pref_';
    var iifeMatch = SRC.match(/\(function migratePreviewFabricBg\(\)\{[\s\S]*?\}\)\(\);/);
    eval(iifeMatch[0]);
    expect(store['cs_pref_fabricColour']).toBe(JSON.stringify('#123456'));
    expect(store['cs_pref_previewFabricBg']).toBeUndefined();
  });

  test('functional simulation: no legacy key → no-op', () => {
    var store = {};
    var localStorage = {
      getItem: function(k){ return Object.prototype.hasOwnProperty.call(store,k) ? store[k] : null; },
      setItem: function(k,v){ store[k] = String(v); },
      removeItem: function(k){ delete store[k]; },
    };
    var PREFIX_GLOBAL = 'cs_pref_';
    var iifeMatch = SRC.match(/\(function migratePreviewFabricBg\(\)\{[\s\S]*?\}\)\(\);/);
    eval(iifeMatch[0]);
    expect(store['cs_pref_fabricColour']).toBeUndefined();
  });
});
