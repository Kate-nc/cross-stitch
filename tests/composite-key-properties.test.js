// tests/composite-key-properties.test.js
// Property-based tests for threadKey / parseThreadKey in helpers.js.

const fc = require('fast-check');
const fs = require('fs');
const { fcDmcId } = require('./arbitraries');

const _helpersSrc = fs.readFileSync('./helpers.js', 'utf8');
const _threadKeySrc = _helpersSrc.match(/function threadKey\s*\([^)]*\)\s*\{[^\n]*\}/);
const _parseThreadKeySrc = _helpersSrc.match(/function parseThreadKey\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
if (!_threadKeySrc || !_parseThreadKeySrc) {
  throw new Error('Could not extract threadKey / parseThreadKey from helpers.js');
}
eval(_threadKeySrc[0]);
eval(_parseThreadKeySrc[0]);

const fcBrand = () => fc.constantFrom('dmc', 'anchor', 'madeira', 'cosmo');

describe('threadKey / parseThreadKey — properties', () => {
  test('round-trip: parseThreadKey(threadKey(b, i)) === { brand: b, id: i }', () => {
    fc.assert(
      fc.property(fcBrand(), fcDmcId(), (brand, id) => {
        const key = threadKey(brand, id);
        const parsed = parseThreadKey(key);
        return parsed.brand === brand && parsed.id === id;
      }),
      { numRuns: 200 }
    );
  });

  test('format: threadKey(b, i) contains exactly one ":"', () => {
    fc.assert(
      fc.property(fcBrand(), fcDmcId(), (brand, id) => {
        const key = threadKey(brand, id);
        const colons = (key.match(/:/g) || []).length;
        return colons === 1;
      }),
      { numRuns: 200 }
    );
  });

  test('legacy bare ids (no colon) parse as DMC', () => {
    fc.assert(
      fc.property(fcDmcId(), (id) => {
        const parsed = parseThreadKey(id);
        return parsed.brand === 'dmc' && parsed.id === id;
      }),
      { numRuns: 100 }
    );
  });

  test('non-string inputs are coerced (current defensive behaviour)', () => {
    // Numbers fall into the typeof !== 'string' branch and are stringified.
    expect(parseThreadKey(310)).toEqual({ brand: 'dmc', id: '310' });
    // Null / undefined become the string 'null' / 'undefined' under String().
    const pn = parseThreadKey(null);
    expect(pn.brand).toBe('dmc');
    expect(typeof pn.id).toBe('string');
  });
});
