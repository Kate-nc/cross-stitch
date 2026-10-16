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

  test('has exactly 112 glyphs', () => {
    expect(Array.isArray(spec.glyphs)).toBe(true);
    expect(spec.glyphs.length).toBe(112);
  });

  test('codepoints are sequential within the PUA block', () => {
    spec.glyphs.forEach((g, i) => {
      expect(g.codepoint).toBe(0xE000 + i);
      expect(g.codepoint).toBeGreaterThanOrEqual(0xE000);
      expect(g.codepoint).toBeLessThanOrEqual(0xE06F);
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

// Rasterise the generated font, not just its declarative primitive names.
// Sizes approximate Small / Medium / Large chart symbols at 300 dpi.
describe('generated glyph coverage and monochrome separation', () => {
  const opentype = require('opentype.js');
  const {createCanvas} = require('canvas');
  const fontkit = require('@pdf-lib/fontkit');
  const bytes = fs.readFileSync(path.join(__dirname, '../assets/fonts/CrossStitchSymbols.ttf'));
  const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

  test('79 compatible legacy outlines, glyph IDs and codepoints remain unchanged', () => {
    const repaired = new Set([7,8,0x18,0x19,0x1d,0x1e,0x1f,0x2c,0x31,0x33,0x39,0x3a,0x3b,0x42,0x43,0x5c,0x5d]);
    const legacy = Array.from({length:96},(_,i)=>i).filter(i=>!repaired.has(i)).map(i=>{
      const cp=0xE000+i, g=font.charToGlyph(String.fromCodePoint(cp));
      expect(font.charToGlyphIndex(String.fromCodePoint(cp))).toBe(i+2);
      return {cp,name:g.name,width:g.advanceWidth,commands:g.path.commands};
    });
    // Hash captured from the committed pre-fix font at 352052f4.
    expect(require('crypto').createHash('sha256').update(JSON.stringify(legacy)).digest('hex'))
      .toBe('bca9b8eee37f820d6f000af3df183d730c30c81a6b752d4ddacd26e9df4ad16e');
  });

  test('all assigned characters have a real non-empty glyph in both font readers', () => {
    const embedded = fontkit.create(bytes);
    for(const g of spec.glyphs) {
      expect(font.charToGlyphIndex(String.fromCodePoint(g.codepoint))).toBeGreaterThan(1);
      expect(font.charToGlyph(String.fromCodePoint(g.codepoint)).path.commands.length).toBeGreaterThan(0);
      expect(embedded.glyphForCodePoint(g.codepoint).id).toBeGreaterThan(1);
    }
  });

  test.each([18,26,38])('all glyphs differ by visible ink at %ipx print size', size => {
    const images = spec.glyphs.map(g => {
      const canvas = createCanvas(48,48);
      const ctx = canvas.getContext('2d');
      font.charToGlyph(String.fromCodePoint(g.codepoint)).getPath(3,40,size).draw(ctx);
      const data = ctx.getImageData(0,0,48,48).data;
      const alpha = Array.from({length:48*48}, (_,i)=>data[i*4+3]/255);
      expect(alpha.reduce((a,b)=>a+b,0)).toBeGreaterThan(4);
      return alpha;
    });
    // This is a lookalike regression guard, not a substitute for print review.
    // The original thickness/size-only variants fail this threshold.
    let minimum = 1;
    for(let i=0;i<images.length;i++) for(let j=0;j<i;j++) {
      let difference=0, union=0;
      for(let k=0;k<images[i].length;k++) {
        difference += Math.abs(images[i][k]-images[j][k]);
        union += Math.max(images[i][k],images[j][k]);
      }
      minimum = Math.min(minimum,difference/union);
    }
    expect(minimum).toBeGreaterThan(0.10);
  });
});
