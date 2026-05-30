/**
 * Unit tests for doRiemersma (Hilbert-curve dithering) in colour-utils.js.
 *
 * Extracts the function from source using the same pattern as doDither.test.js.
 */

const fs = require('fs');
const { rgbToLab, dE2, DMC } = require('../dmc-data.js');

const cuSrc = fs.readFileSync('./colour-utils.js', 'utf8');

function extractFn(src, name) {
  let start = src.indexOf(`\nfunction ${name}(`);
  if (start === -1) start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`Function ${name} not found`);
  let i = start;
  while (i < src.length && src[i] !== '(') i++;
  let pd = 0;
  while (i < src.length) {
    if (src[i] === '(') pd++;
    else if (src[i] === ')') { pd--; if (pd === 0) { i++; break; } }
    i++;
  }
  while (i < src.length && src[i] !== '{') i++;
  let depth = 0;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) return src.slice(start, i + 1); }
    i++;
  }
  throw new Error(`Unterminated function ${name}`);
}

// findSolid and findBest are needed by doRiemersma
eval(extractFn(cuSrc, 'findSolid')); // eslint-disable-line no-eval
eval(extractFn(cuSrc, 'findBest'));  // eslint-disable-line no-eval
eval(extractFn(cuSrc, 'doRiemersma')); // eslint-disable-line no-eval

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function solidRgba(w, h, r, g, b) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4]     = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Small fixed palette for testing. */
const pal = DMC.slice(0, 12);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('doRiemersma', () => {
  it('returns an array of length w*h', () => {
    const w = 10, h = 10;
    const data = solidRgba(w, h, 128, 64, 32);
    const result = doRiemersma(data, w, h, pal, false, null, {});
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(w * h);
  });

  it('every entry has an .id property', () => {
    const w = 8, h = 8;
    const data = solidRgba(w, h, 200, 100, 50);
    const result = doRiemersma(data, w, h, pal, false, null, {});
    for (const entry of result) {
      expect(entry).toHaveProperty('id');
    }
  });

  it('no entries are null or undefined', () => {
    const w = 6, h = 6;
    const data = solidRgba(w, h, 80, 160, 40);
    const result = doRiemersma(data, w, h, pal, false, null, {});
    for (const entry of result) {
      expect(entry).not.toBeNull();
      expect(entry).not.toBeUndefined();
    }
  });

  it('uniform image — all pixels map to entries from the palette', () => {
    const w = 12, h = 12;
    const data = solidRgba(w, h, 220, 20, 20);
    const result = doRiemersma(data, w, h, pal, false, null, {});
    const palIds = new Set(pal.map(e => e.id));
    for (const entry of result) {
      expect(palIds.has(entry.id)).toBe(true);
    }
  });

  it('non-square image (30×20) completes without error', () => {
    const w = 30, h = 20;
    const data = solidRgba(w, h, 100, 150, 200);
    expect(() => doRiemersma(data, w, h, pal, false, null, {})).not.toThrow();
    const result = doRiemersma(data, w, h, pal, false, null, {});
    expect(result.length).toBe(w * h);
  });

  it('1×1 image does not crash', () => {
    const data = solidRgba(1, 1, 128, 128, 128);
    expect(() => doRiemersma(data, 1, 1, pal, false, null, {})).not.toThrow();
    const result = doRiemersma(data, 1, 1, pal, false, null, {});
    expect(result.length).toBe(1);
    expect(result[0]).toHaveProperty('id');
  });

  it('is deterministic — same input produces identical output', () => {
    const w = 16, h = 16;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i++) data[i] = (i * 53 + 7) % 256;
    const r1 = doRiemersma(data, w, h, pal, false, null, {});
    const r2 = doRiemersma(data, w, h, pal, false, null, {});
    expect(r1.map(e => e.id)).toEqual(r2.map(e => e.id));
  });

  it('accepts saliencyMap=null without throwing', () => {
    const w = 8, h = 8;
    const data = solidRgba(w, h, 64, 128, 192);
    expect(() => doRiemersma(data, w, h, pal, false, null, {})).not.toThrow();
  });
});
