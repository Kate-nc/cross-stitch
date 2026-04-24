// tests/time-formatting-properties.test.js
// Property-based tests for fmtTime / fmtTimeL in helpers.js.
// Extracts the functions via fs + eval so we don't need a module system.

const fc = require('fast-check');
const fs = require('fs');

const _helpersSrc = fs.readFileSync('./helpers.js', 'utf8');
// Extract just the two terse formatters; both fit on a single line.
const _fmtTimeSrc = _helpersSrc.match(/function fmtTime\s*\([^)]*\)\s*\{[^\n]*\}/);
const _fmtTimeLSrc = _helpersSrc.match(/function fmtTimeL\s*\([^)]*\)\s*\{[^\n]*\}/);
if (!_fmtTimeSrc || !_fmtTimeLSrc) {
  throw new Error('Could not extract fmtTime / fmtTimeL from helpers.js');
}
eval(_fmtTimeSrc[0]);
eval(_fmtTimeLSrc[0]);

describe('fmtTime — properties', () => {
  test('always returns a non-empty string', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (s) => {
        const out = fmtTime(s);
        return typeof out === 'string' && out.length > 0;
      }),
      { numRuns: 200 }
    );
  });

  test('seconds < 60 → minute-only form (no "h ")', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 59 }), (s) => {
        const out = fmtTime(s);
        return out === '0m' && !out.includes('h ');
      }),
      { numRuns: 60 }
    );
  });

  test('handles zero without throwing and produces a sensible string', () => {
    expect(typeof fmtTime(0)).toBe('string');
    expect(fmtTime(0).length).toBeGreaterThan(0);
  });
});

describe('fmtTimeL — properties', () => {
  test('always returns a non-empty string ending in "min"', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (s) => {
        const out = fmtTimeL(s);
        return typeof out === 'string' && out.length > 0 && out.endsWith('min');
      }),
      { numRuns: 200 }
    );
  });

  test('plural: 1 hour → "1 hr", >1 hour → "N hrs"', () => {
    // 1 hour exactly → 3600s
    expect(fmtTimeL(3600)).toMatch(/^1 hr /);
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 100 }), (h) => {
        const out = fmtTimeL(h * 3600);
        return out.startsWith(`${h} hrs `);
      }),
      { numRuns: 100 }
    );
  });

  test('handles zero without throwing', () => {
    expect(typeof fmtTimeL(0)).toBe('string');
    expect(fmtTimeL(0)).toBe('0 min');
  });
});
