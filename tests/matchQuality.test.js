/* tests/matchQuality.test.js
 * Unit tests for creator/matchQuality.js — tier classification, label/token
 * lookup, threshold predicate, and Lab-derived diff descriptions.
 *
 * Pure module, no globals required.
 */
const { TIERS, classifyMatch, tierLabel, tierToken, tierIsAcceptable, describeLabDiff } =
  require('../creator/matchQuality.js');

describe('matchQuality.classifyMatch — boundary behaviour', () => {
  test.each([
    [0,    'exact'],
    [0.99, 'exact'],
    [1,    'close'],
    [2.99, 'close'],
    [3,    'good'],
    [4.99, 'good'],
    [5,    'fair'],
    [9.99, 'fair'],
    [10,   'poor'],
    [19.99,'poor'],
    [20,   'none'],
    [50,   'none'],
  ])('ΔE %p → %s', (de, tier) => {
    expect(classifyMatch(de, {})).toBe(tier);
  });

  test('null target → none regardless of ΔE', () => {
    expect(classifyMatch(0, null)).toBe('none');
    expect(classifyMatch(undefined, null)).toBe('none');
  });

  test('NaN / negative ΔE → none', () => {
    expect(classifyMatch(NaN, {})).toBe('none');
    expect(classifyMatch(-1, {})).toBe('none');
    expect(classifyMatch(Infinity, {})).toBe('none');
  });
});

describe('matchQuality.tierLabel + tierToken', () => {
  test('every tier has a label and a token', () => {
    TIERS.forEach((t) => {
      expect(typeof tierLabel(t)).toBe('string');
      expect(tierLabel(t).length).toBeGreaterThan(0);
      expect(tierToken(t)).toMatch(/^--/);
    });
  });

  test('green tiers use --success; warn uses --warning; bad uses --danger', () => {
    expect(tierToken('exact')).toBe('--success');
    expect(tierToken('close')).toBe('--success');
    expect(tierToken('good')).toBe('--success');
    expect(tierToken('fair')).toBe('--warning');
    expect(tierToken('poor')).toBe('--danger');
    expect(tierToken('none')).toBe('--danger');
  });
});

describe('matchQuality.tierIsAcceptable', () => {
  test('within threshold → true', () => {
    expect(tierIsAcceptable(4.9, 5)).toBe(true);
    expect(tierIsAcceptable(5,   5)).toBe(true);
  });
  test('above threshold → false', () => {
    expect(tierIsAcceptable(5.1, 5)).toBe(false);
  });
  test('non-numeric → false', () => {
    expect(tierIsAcceptable(NaN, 5)).toBe(false);
    expect(tierIsAcceptable(Infinity, 5)).toBe(false);
  });
});

describe('matchQuality.describeLabDiff', () => {
  test('identical Labs → "very close match"', () => {
    expect(describeLabDiff([50, 0, 0], [50, 0, 0])).toBe('very close match');
  });
  test('darker target', () => {
    expect(describeLabDiff([60, 10, 10], [40, 10, 10])).toContain('darker');
  });
  test('lighter target', () => {
    expect(describeLabDiff([40, 10, 10], [60, 10, 10])).toContain('lighter');
  });
  test('less saturated when chroma drops', () => {
    // Source highly chromatic, target near grey on same lightness.
    expect(describeLabDiff([50, 40, 40], [50, 5, 5])).toContain('less saturated');
  });
  test('warmer / yellower when +b shift dominates', () => {
    var out = describeLabDiff([50, 0, 0], [50, 0, 30]);
    expect(out).toMatch(/yellower/);
  });
  test('cooler / bluer when -b shift dominates', () => {
    var out = describeLabDiff([50, 0, 0], [50, 0, -30]);
    expect(out).toMatch(/bluer/);
  });
  test('returns empty string for invalid input', () => {
    expect(describeLabDiff(null, [0,0,0])).toBe('');
    expect(describeLabDiff([0,0], [0,0,0])).toBe('');
  });
  test('combines at most two strongest signals', () => {
    var out = describeLabDiff([50, 0, 0], [30, 0, 30]); // darker + yellower
    expect(out.split(',').length).toBeLessThanOrEqual(2);
  });
});
