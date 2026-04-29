/* tests/import/sniffMagic.test.js — Unit 3: format detection. */

const path = require('path');
const ENGINE = require(path.resolve(__dirname, '..', '..', 'import-engine', 'index.js'));
const { sniffMagic } = ENGINE;

function probe(bytes, fileName, mimeType) {
  return {
    fileName: fileName || '',
    mimeType: mimeType || '',
    bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
  };
}

describe('sniffMagic', () => {
  it('detects PDF by magic bytes', () => {
    const r = sniffMagic(probe([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37], 'a.pdf'));
    expect(r).toEqual({ format: 'pdf', confidence: 1.0 });
  });

  it('detects PNG / JPEG / GIF / BMP / WEBP', () => {
    expect(sniffMagic(probe([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 'a.png')).format).toBe('image');
    expect(sniffMagic(probe([0xFF, 0xD8, 0xFF, 0xE0], 'a.jpg')).format).toBe('image');
    expect(sniffMagic(probe([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 'a.gif')).format).toBe('image');
    expect(sniffMagic(probe([0x42, 0x4D, 0x00, 0x00], 'a.bmp')).format).toBe('image');
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffMagic(probe(webp, 'a.webp')).format).toBe('image');
  });

  it('detects XML / OXS by leading <?xml', () => {
    const xml = new TextEncoder().encode('<?xml version="1.0"?><chart></chart>');
    const r = sniffMagic(probe(xml, 'pat.oxs'));
    expect(r.format).toBe('oxs');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('detects JSON by leading {', () => {
    const j = new TextEncoder().encode('{"v":8}');
    const r = sniffMagic(probe(j, 'p.json'));
    expect(r.format).toBe('json');
  });

  it('drops to 0.9 when extension disagrees with magic', () => {
    const r = sniffMagic(probe([0x25, 0x50, 0x44, 0x46, 0x2D], 'mystery.dat'));
    expect(r).toEqual({ format: 'pdf', confidence: 0.9 });
  });

  it('falls back to extension at 0.7', () => {
    const r = sniffMagic(probe([0, 0, 0, 0], 'a.pdf'));
    expect(r).toEqual({ format: 'pdf', confidence: 0.7 });
  });

  it('falls back to MIME at 0.6', () => {
    const r = sniffMagic(probe([0, 0, 0, 0], '', 'application/pdf'));
    expect(r).toEqual({ format: 'pdf', confidence: 0.6 });
  });

  it('returns unknown when nothing matches', () => {
    const r = sniffMagic(probe([0xAB, 0xCD], 'mystery.zzz'));
    expect(r).toEqual({ format: 'unknown', confidence: 0 });
  });

  it('handles missing probe / empty bytes safely', () => {
    expect(sniffMagic(null).format).toBe('unknown');
    expect(sniffMagic(probe([], 'x.pdf')).format).toBe('pdf'); // by extension
  });
});
