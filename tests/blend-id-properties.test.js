// tests/blend-id-properties.test.js
// Property-based tests for blend-id helpers in helpers.js.

const fc = require('fast-check');
const fs = require('fs');
const { fcDmcId } = require('./arbitraries');

const _helpersSrc = fs.readFileSync('./helpers.js', 'utf8');
const _isBlendIdSrc = _helpersSrc.match(/function isBlendId\s*\([^)]*\)\s*\{[^\n]*\}/);
const _splitBlendIdSrc = _helpersSrc.match(/function splitBlendId\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
if (!_isBlendIdSrc || !_splitBlendIdSrc) {
  throw new Error('Could not extract isBlendId / splitBlendId from helpers.js');
}
eval(_isBlendIdSrc[0]);
eval(_splitBlendIdSrc[0]);

// Canonical blend constructor — sorts ids for sort-invariance.
function makeBlend(a, b) {
  const sorted = [String(a), String(b)].sort();
  return sorted[0] + '+' + sorted[1];
}

describe('blend-id — properties', () => {
  test('isBlendId true iff id contains "+"', () => {
    expect(isBlendId('310')).toBe(false);
    expect(isBlendId('310+550')).toBe(true);
    expect(isBlendId('')).toBe(false);
    expect(isBlendId(null)).toBe(false);
    expect(isBlendId(undefined)).toBe(false);
  });

  test('sort-invariant: makeBlend(a,b) === makeBlend(b,a)', () => {
    fc.assert(
      fc.property(fcDmcId(), fcDmcId(), (a, b) => {
        return makeBlend(a, b) === makeBlend(b, a);
      }),
      { numRuns: 200 }
    );
  });

  test('round-trip: splitBlendId(makeBlend(a,b)) returns sorted [a,b]', () => {
    fc.assert(
      fc.property(fcDmcId(), fcDmcId(), (a, b) => {
        const id = makeBlend(a, b);
        const parts = splitBlendId(id);
        const expected = [String(a), String(b)].sort();
        return parts.length === 2 && parts[0] === expected[0] && parts[1] === expected[1];
      }),
      { numRuns: 200 }
    );
  });

  test('splitBlendId on a non-blend id returns a single-element array', () => {
    fc.assert(
      fc.property(fcDmcId(), (id) => {
        const parts = splitBlendId(id);
        return parts.length === 1 && parts[0] === id;
      }),
      { numRuns: 100 }
    );
  });

  test('self-blend "x+x" splits to two equal parts (current behaviour)', () => {
    // splitBlendId does not deduplicate; document the current contract.
    expect(splitBlendId('310+310')).toEqual(['310', '310']);
    expect(isBlendId('310+310')).toBe(true);
  });
});
