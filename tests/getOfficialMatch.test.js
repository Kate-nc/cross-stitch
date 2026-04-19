// tests/getOfficialMatch.test.js
// Tests for getOfficialMatch() and the CONVERSIONS table in thread-conversions.js

const { getOfficialMatch, CONVERSIONS } = require('../thread-conversions.js');

describe('getOfficialMatch', () => {
  // ─── Known official DMC → Anchor mappings ─────────────────────────────────

  test('DMC 310 (Black) → Anchor 403 (official)', () => {
    const result = getOfficialMatch('dmc', '310', 'anchor');
    expect(result).not.toBeNull();
    expect(result.id).toBe('403');
    expect(result.confidence).toBe('official');
  });

  test('DMC 321 (Christmas Red) → Anchor 9046 (official)', () => {
    const result = getOfficialMatch('dmc', '321', 'anchor');
    expect(result).not.toBeNull();
    expect(result.id).toBe('9046');
    expect(result.confidence).toBe('official');
  });

  test('DMC blanc → Anchor 1 (official)', () => {
    const result = getOfficialMatch('dmc', 'blanc', 'anchor');
    expect(result).not.toBeNull();
    expect(result.id).toBe('1');
    expect(result.confidence).toBe('official');
  });

  // ─── Known official Anchor → DMC mappings ─────────────────────────────────

  test('Anchor 403 (Black) → DMC 310 (official)', () => {
    const result = getOfficialMatch('anchor', '403', 'dmc');
    expect(result).not.toBeNull();
    expect(result.id).toBe('310');
    expect(result.confidence).toBe('official');
  });

  test('Anchor 9046 → DMC 321 (official)', () => {
    const result = getOfficialMatch('anchor', '9046', 'dmc');
    expect(result).not.toBeNull();
    expect(result.id).toBe('321');
    expect(result.confidence).toBe('official');
  });

  // ─── Confidence levels ─────────────────────────────────────────────────────

  test('DMC 356 → Anchor 1013 (reconciled)', () => {
    const result = getOfficialMatch('dmc', '356', 'anchor');
    expect(result).not.toBeNull();
    expect(result.id).toBe('1013');
    expect(result.confidence).toBe('reconciled');
  });

  // ─── Unknown / missing mappings ────────────────────────────────────────────

  test('returns null for unknown DMC id', () => {
    expect(getOfficialMatch('dmc', '99999', 'anchor')).toBeNull();
  });

  test('returns null for unknown Anchor id', () => {
    expect(getOfficialMatch('anchor', '99999', 'dmc')).toBeNull();
  });

  test('returns null for unsupported brand pair', () => {
    expect(getOfficialMatch('madeira', '310', 'anchor')).toBeNull();
  });

  // ─── CONVERSIONS table structure ───────────────────────────────────────────

  test('CONVERSIONS is a plain object', () => {
    expect(typeof CONVERSIONS).toBe('object');
    expect(CONVERSIONS).not.toBeNull();
    expect(Array.isArray(CONVERSIONS)).toBe(false);
  });

  test('CONVERSIONS has entries for both dmc: and anchor: prefixes', () => {
    const keys = Object.keys(CONVERSIONS);
    const dmcKeys = keys.filter(k => k.startsWith('dmc:'));
    const anchorKeys = keys.filter(k => k.startsWith('anchor:'));
    expect(dmcKeys.length).toBeGreaterThan(100);
    expect(anchorKeys.length).toBeGreaterThan(50);
  });

  test('all entries have a valid confidence value', () => {
    const valid = new Set(['official', 'reconciled', 'single-source']);
    Object.entries(CONVERSIONS).forEach(([key, value]) => {
      if (key.startsWith('dmc:') && value.anchor) {
        expect(valid.has(value.anchor.confidence)).toBe(true);
      }
      if (key.startsWith('anchor:') && value.dmc) {
        expect(valid.has(value.dmc.confidence)).toBe(true);
      }
    });
  });

  test('all entries have a non-empty id', () => {
    Object.entries(CONVERSIONS).forEach(([key, value]) => {
      if (key.startsWith('dmc:') && value.anchor) {
        expect(typeof value.anchor.id).toBe('string');
        expect(value.anchor.id.length).toBeGreaterThan(0);
      }
      if (key.startsWith('anchor:') && value.dmc) {
        expect(typeof value.dmc.id).toBe('string');
        expect(value.dmc.id.length).toBeGreaterThan(0);
      }
    });
  });
});
