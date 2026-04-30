/* tests/import/pdfMetaExtractor.test.js — Unit 9. */

const path = require('path');
const ENGINE = require(path.resolve(__dirname, '..', '..', 'import-engine', 'index.js'));
const { extractMeta, extractTitle, extractDesigner, extractFabricCount,
        extractFabricColour, extractFinishedSize, extractStitchSize } = ENGINE;

describe('extractTitle', () => {
  it('picks the largest-font band', () => {
    const bands = [
      { text: 'tiny footer', fontSize: 6 },
      { text: 'Plume de Geai — Jay Feather', fontSize: 24 },
      { text: 'subtitle', fontSize: 12 },
    ];
    expect(extractTitle(bands, '')).toMatch(/Plume de Geai/);
  });

  it('falls back to first non-trivial line of text', () => {
    expect(extractTitle([], 'Moonlight Fleurs\n© 2023 DMC')).toBe('Moonlight Fleurs');
  });
});

describe('extractDesigner', () => {
  it('parses "by Jane Doe"', () => {
    expect(extractDesigner('A pattern by Jane Doe')).toBe('Jane Doe');
  });
  it('parses "© DMC Studio"', () => {
    expect(extractDesigner('© DMC Studio 2023')).toBe('DMC Studio');
  });
  it('returns null when no designer line is found', () => {
    expect(extractDesigner('no signature here')).toBeNull();
  });
});

describe('extractFabricCount', () => {
  it('parses "14 ct"', () => expect(extractFabricCount('14 ct Aida')).toBe(14));
  it('parses "16-count"', () => expect(extractFabricCount('16-count Aida')).toBe(16));
  it('parses "Aida 18"', () => expect(extractFabricCount('Aida 18 white')).toBe(18));
  it('converts metric "5,5 pts/cm"', () => expect(extractFabricCount('5,5 pts/cm')).toBe(14));
  it('returns null for missing fabric info', () => expect(extractFabricCount('hello')).toBeNull());
});

describe('extractFinishedSize', () => {
  it('parses cm', () => expect(extractFinishedSize('14 x 13 cm')).toEqual({ w: 14, h: 13, unit: 'cm' }));
  it('parses inches', () => expect(extractFinishedSize('5.51 x 5.11 in')).toEqual({ w: 5.51, h: 5.11, unit: 'in' }));
  it('returns null when no size', () => expect(extractFinishedSize('hello')).toBeNull());
});

describe('extractStitchSize', () => {
  it('parses "80 x 80 stitches"', () => expect(extractStitchSize('80 x 80 stitches')).toEqual({ w: 80, h: 80 }));
});

describe('extractMeta (integration)', () => {
  it('combines all extractors', () => {
    const bands = [
      { text: 'Moonlight Fleurs', fontSize: 28 },
      { text: '© DMC Studio', fontSize: 8 },
      { text: 'Design size: 14 x 13 cm', fontSize: 10 },
      { text: 'Aida 14 ct white', fontSize: 10 },
    ];
    const m = extractMeta(bands);
    expect(m.title).toBe('Moonlight Fleurs');
    expect(m.designer).toBe('DMC Studio');
    expect(m.fabricCount).toBe(14);
    expect(m.finishedSize).toEqual({ w: 14, h: 13, unit: 'cm' });
  });
});
