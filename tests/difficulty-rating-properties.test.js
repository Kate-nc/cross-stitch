// tests/difficulty-rating-properties.test.js
// Property-based tests for calcDifficulty in helpers.js.

const fc = require('fast-check');
const fs = require('fs');

const _helpersSrc = fs.readFileSync('./helpers.js', 'utf8');
// calcDifficulty spans multiple lines; capture from the function header to
// the matching closing brace by counting braces.
function _extractFunction(src, name) {
  const startRe = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = startRe.exec(src);
  if (!m) return null;
  const start = m.index;
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return src.slice(start, i);
}
const _calcSrc = _extractFunction(_helpersSrc, 'calcDifficulty');
if (!_calcSrc) throw new Error('Could not extract calcDifficulty from helpers.js');
eval(_calcSrc);

const VALID_LABELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

describe('calcDifficulty — properties', () => {
  test('returns a known label with stars in 1..4', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 200_000 }),
        (palLen, blendCount, totalSt) => {
          const r = calcDifficulty(palLen, blendCount, totalSt);
          return (
            r != null &&
            VALID_LABELS.indexOf(r.label) >= 0 &&
            typeof r.stars === 'number' &&
            r.stars >= 1 && r.stars <= 4 &&
            typeof r.color === 'string' && (r.color.startsWith('#') || r.color.startsWith('var(--'))
          );
        }
      ),
      { numRuns: 200 }
    );
  });

  test('monotonic in palette size: more colours → equal-or-higher stars', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 50_000 }),
        (a, delta, blendCount, totalSt) => {
          const r1 = calcDifficulty(a, blendCount, totalSt);
          const r2 = calcDifficulty(a + delta, blendCount, totalSt);
          return r2.stars >= r1.stars;
        }
      ),
      { numRuns: 200 }
    );
  });

  test('monotonic in stitch count: more stitches → equal-or-higher stars', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 50_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        (palLen, blendCount, base, delta) => {
          const r1 = calcDifficulty(palLen, blendCount, base);
          const r2 = calcDifficulty(palLen, blendCount, base + delta);
          return r2.stars >= r1.stars;
        }
      ),
      { numRuns: 200 }
    );
  });

  test('defined for all valid inputs (no exceptions)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (palLen, blendCount, totalSt) => {
          const r = calcDifficulty(palLen, blendCount, totalSt);
          return r != null && typeof r.label === 'string';
        }
      ),
      { numRuns: 200 }
    );
  });
});
