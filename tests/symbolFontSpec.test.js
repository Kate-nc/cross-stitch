/* tests/symbolFontSpec.test.js
 * Validates the declarative spec used to generate the symbol font and the
 * generated TTF base64 stub are sane.
 */
const fs = require('fs');
const path = require('path');
const spec = require('../creator/symbolFontSpec.js');

const ALLOWED_PRIMS = new Set(['rect', 'circle', 'ring', 'tri', 'line']);

describe('symbolFontSpec', () => {
  test('exports an object with the expected shape', () => {
    expect(spec).toBeTruthy();
    expect(spec.em).toBeGreaterThan(0);
    expect(spec.ascent + spec.descent).toBe(spec.em);
    expect(spec.fontFamily).toBe('CrossStitchSymbols');
    expect(spec.baseCodepoint).toBe(0xE000);
  });

  test('has exactly 96 glyphs', () => {
    expect(Array.isArray(spec.glyphs)).toBe(true);
    expect(spec.glyphs.length).toBe(96);
  });

  test('codepoints are sequential within the PUA block', () => {
    spec.glyphs.forEach((g, i) => {
      expect(g.codepoint).toBe(0xE000 + i);
      expect(g.codepoint).toBeGreaterThanOrEqual(0xE000);
      expect(g.codepoint).toBeLessThanOrEqual(0xE05F);
    });
  });

  test('codepoints are unique', () => {
    const set = new Set(spec.codepoints);
    expect(set.size).toBe(spec.codepoints.length);
  });

  test('every glyph has a name and ≥1 primitive of a known kind', () => {
    spec.glyphs.forEach((g) => {
      expect(typeof g.name).toBe('string');
      expect(g.name.length).toBeGreaterThan(0);
      expect(Array.isArray(g.prims)).toBe(true);
      expect(g.prims.length).toBeGreaterThanOrEqual(1);
      g.prims.forEach((p) => {
        expect(ALLOWED_PRIMS.has(p.kind)).toBe(true);
      });
    });
  });
});

describe('CrossStitchSymbols.ttf (generated artefact)', () => {
  const ttfPath = path.join(__dirname, '..', 'assets', 'fonts', 'CrossStitchSymbols.ttf');
  const b64Path = path.join(__dirname, '..', 'assets', 'fonts', 'CrossStitchSymbols.base64.js');

  test('TTF artefact exists and starts with a valid SFNT magic number', () => {
    expect(fs.existsSync(ttfPath)).toBe(true);
    const buf = fs.readFileSync(ttfPath);
    // Accept TrueType (00 01 00 00) or OpenType-CFF ("OTTO") — both are valid
    // sfnt wrappers and pdf-lib + Pattern Keeper handle both.
    const isTrueType = buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00;
    const isOpenTypeCff = buf.slice(0, 4).toString('latin1') === 'OTTO';
    expect(isTrueType || isOpenTypeCff).toBe(true);
    expect(buf.length).toBeGreaterThan(2000);
  });

  test('base64 helper file decodes back to the same TTF bytes', () => {
    expect(fs.existsSync(b64Path)).toBe(true);
    const js = fs.readFileSync(b64Path, 'utf8');
    const m = js.match(/CROSS_STITCH_SYMBOL_FONT_B64\s*=\s*"([A-Za-z0-9+/=]+)"/);
    expect(m).not.toBeNull();
    const decoded = Buffer.from(m[1], 'base64');
    const ttf = fs.readFileSync(ttfPath);
    expect(decoded.length).toBe(ttf.length);
    expect(decoded.equals(ttf)).toBe(true);
  });
});
