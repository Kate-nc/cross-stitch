/* tests/import/pdfGlyphStrategy.test.js — Unit 14. */

const path = require('path');
const ENGINE = require(path.resolve(__dirname, '..', '..', 'import-engine', 'index.js'));
const { pdfGlyphStrategy } = require(path.resolve(__dirname, '..', '..', 'import-engine', 'strategies', 'pdfGlyphStrategy.js'));

describe('pdfGlyphStrategy', () => {
  it('has the expected shape', () => {
    expect(pdfGlyphStrategy.id).toBe('pdf-glyph');
    expect(pdfGlyphStrategy.formats).toContain('pdf');
    expect(typeof pdfGlyphStrategy.canHandle).toBe('function');
    expect(typeof pdfGlyphStrategy.parse).toBe('function');
  });

  it('canHandle returns 0.7 for .pdf files', () => {
    expect(pdfGlyphStrategy.canHandle({ format: 'pdf' })).toBe(0.7);
    expect(pdfGlyphStrategy.canHandle({ name: 'chart.pdf' })).toBe(0.7);
    expect(pdfGlyphStrategy.canHandle({ format: 'json' })).toBe(0);
    expect(pdfGlyphStrategy.canHandle(null)).toBe(0);
  });

  it('parse rejects when PatternKeeperImporter is unavailable', async () => {
    // Node tests have no window — strategy refuses to run without a browser.
    await expect(pdfGlyphStrategy.parse({}, {})).rejects.toThrow(/browser/);
  });

  it('returns lower priority than DMC publisher (0.95)', () => {
    expect(pdfGlyphStrategy.canHandle({ format: 'pdf' })).toBeLessThan(0.95);
  });
});
