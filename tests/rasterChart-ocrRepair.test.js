/* tests/rasterChart-ocrRepair.test.js */
const { classifyToken, repairCode, parseLegendLine, CODE_PATTERNS } =
  require('../creator/rasterChart/ocrRepair.js');

describe('classifyToken — all CODE_PATTERNS branches', () => {
  test.each([
    ['BLANC',    'code'], ['ECRU',  'code'], ['B5200', 'code'],
    ['blanc',    'code'],
    ['E940',     'code'], ['E5200', 'code'],
    ['S520',     'code'],
    ['310',      'code'], ['1', 'code'], ['12345', 'code'],
    ['DMC 310',  'code'], ['Anchor 47', 'code'], ['Madeira 1003', 'code'],
    ['Mad. 1003','code'], ['Sulky 1005', 'code'],
    ['Black',    'name'],
    ['Very dark violet', 'name'],
    ['',         'unknown'],
    ['$$$',      'unknown'],
  ])('%j → %s', (input, expected) => {
    expect(classifyToken(input)).toBe(expected);
  });

  test('CODE_PATTERNS array is non-empty (sanity)', () => {
    expect(Array.isArray(CODE_PATTERNS)).toBe(true);
    expect(CODE_PATTERNS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('repairCode — confusion-aware substitution', () => {
  const set = new Set(['310', '550', '5200', 'B5200', 'BLANC', '732', '813']);

  test('exact hit returns unrepaired', () => {
    const r = repairCode('310', set);
    expect(r).toEqual({ code: '310', repaired: false, candidates: ['310'] });
  });

  test('O→0 confusion: "31O" → "310"', () => {
    const r = repairCode('31O', set);
    expect(r).toBeTruthy();
    expect(r.code).toBe('310');
    expect(r.repaired).toBe(true);
  });

  test('S→5 confusion: "S200" not in set so try B5200? actually "SS00" → "5500"... use real case', () => {
    // 5↔S confusion: OCR "55O" → "550"
    const r = repairCode('55O', set);
    expect(r && r.code).toBe('550');
  });

  test('strips brand prefix before lookup', () => {
    const r = repairCode('DMC 310', set);
    expect(r && r.code).toBe('310');
  });

  test('returns null when no candidate matches', () => {
    expect(repairCode('99999', set)).toBeNull();
  });

  test('empty set returns null gracefully', () => {
    expect(repairCode('310', new Set())).toBeNull();
  });
});

describe('parseLegendLine — full line parsing', () => {
  const set = new Set(['310', '550', 'B5200', 'BLANC']);
  test('"310  Black" → exact', () => {
    expect(parseLegendLine('310  Black', set)).toEqual({
      code: '310', name: 'Black', source: 'exact',
    });
  });
  test('"DMC 310 Black" → exact under brand prefix', () => {
    const r = parseLegendLine('DMC 310 Black', set);
    expect(r.code).toBe('DMC 310');
    expect(r.name).toBe('Black');
    expect(r.source).toBe('exact');
  });
  test('confusion repair: "31O Black" → 310', () => {
    const r = parseLegendLine('31O Black', set);
    expect(r.code).toBe('310');
    expect(r.source).toBe('repaired');
  });
  test('unrecognised first token → null', () => {
    expect(parseLegendLine('Hello world', set)).toBeNull();
  });
});
