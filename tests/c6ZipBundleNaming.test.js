// tests/c6ZipBundleNaming.test.js — slug + filename helpers from creator/zipBundle.js
const ZipBundle = require('../creator/zipBundle.js');

describe('C6 ZipBundle._slugify', () => {
  it('lowercases and replaces non-alphanumerics with hyphens', () => {
    expect(ZipBundle._slugify('My Cushion Pattern!')).toBe('my-cushion-pattern');
  });
  it('returns "pattern" for empty / nullish input', () => {
    expect(ZipBundle._slugify('')).toBe('pattern');
    expect(ZipBundle._slugify(null)).toBe('pattern');
    expect(ZipBundle._slugify('   ')).toBe('pattern');
  });
  it('strips path separators (no directory traversal in filename)', () => {
    expect(ZipBundle._slugify('../etc/passwd')).toBe('etc-passwd');
  });
  it('caps length at 48 chars and trims trailing hyphens', () => {
    var long = ZipBundle._slugify('a'.repeat(100));
    expect(long.length).toBeLessThanOrEqual(48);
  });
  it('strips diacritics where supported', () => {
    // Node's Intl supports normalize; this should at least not throw.
    var s = ZipBundle._slugify('Café Floral — 2026');
    expect(s.length).toBeGreaterThan(0);
    expect(s).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('C6 ZipBundle._filename', () => {
  it('produces {slug}-{YYYYMMDD-HHmm}-v{version}.zip', () => {
    var d = new Date(2026, 3, 24, 14, 7); // 24 April 2026 14:07 local
    expect(ZipBundle._filename('My Cushion Pattern', 11, d))
      .toBe('my-cushion-pattern-20260424-1407-v11.zip');
  });
  it('zero-pads single-digit month / day / hour / minute', () => {
    var d = new Date(2026, 0, 3, 5, 9);
    expect(ZipBundle._filename('foo', 11, d)).toBe('foo-20260103-0509-v11.zip');
  });
  it('falls back to "pattern" when project name is empty', () => {
    var d = new Date(2026, 3, 24, 14, 7);
    expect(ZipBundle._filename('', 11, d)).toBe('pattern-20260424-1407-v11.zip');
  });
  it('uses default schema version 11 when not supplied', () => {
    var d = new Date(2026, 3, 24, 14, 7);
    expect(ZipBundle._filename('foo', null, d)).toMatch(/-v11\.zip$/);
  });
});
