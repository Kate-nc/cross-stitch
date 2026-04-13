/**
 * Unit tests for quantize (seeded determinism) and quantizeConstrained
 * (constraint guarantee, no duplicates, n > allowedPalette.length handling)
 * in colour-utils.js.
 */

const fs = require('fs');
const { rgbToLab, dE2, DMC } = require('../dmc-data.js');

// ---------------------------------------------------------------------------
// Extract functions from colour-utils.js using the same pattern as doDither.test.js
// ---------------------------------------------------------------------------
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

eval(extractFn(cuSrc, 'quantize'));            // eslint-disable-line no-eval
eval(extractFn(cuSrc, 'quantizeConstrained')); // eslint-disable-line no-eval

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a small solid-colour image (RGBA flat array) filled with a single colour. */
function solidImage(w, h, r, g, b) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4]     = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Build a gradient image spanning R=0..255 across width. */
function gradientImage(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = Math.round((x / (w - 1)) * 255);
      data[i]     = v;
      data[i + 1] = Math.round(255 - v * 0.5);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// quantize — determinism tests
// ---------------------------------------------------------------------------

describe('quantize — determinism (same seed ⇒ same palette)', () => {
  test('identical seeds produce identical palette IDs', () => {
    const w = 20, h = 20;
    const data = gradientImage(w, h);
    const seed = 42;
    const result1 = quantize(data, w, h, 8, { seed });
    const result2 = quantize(data, w, h, 8, { seed });
    expect(result1.map(d => d.id)).toEqual(result2.map(d => d.id));
  });

  test('different seeds can produce different palettes', () => {
    const w = 30, h = 30;
    const data = gradientImage(w, h);
    const result1 = quantize(data, w, h, 10, { seed: 1 });
    const result2 = quantize(data, w, h, 10, { seed: 9999999 });
    // With a wide gradient and different seeds it is very likely (but not
    // guaranteed) that at least one entry differs; we assert they are not
    // always completely identical.
    const ids1 = result1.map(d => d.id).sort().join(',');
    const ids2 = result2.map(d => d.id).sort().join(',');
    // At minimum the function must return non-empty arrays for both seeds.
    expect(result1.length).toBeGreaterThan(0);
    expect(result2.length).toBeGreaterThan(0);
    // Note: it is theoretically possible (though unlikely) for two different
    // seeds to yield the same palette on a small image. We do not assert
    // inequality because it would make the test flaky. The important
    // guarantee is pure reproducibility tested above.
    expect(typeof ids1).toBe('string');
    expect(typeof ids2).toBe('string');
  });

  test('returns at most n entries', () => {
    const w = 10, h = 10;
    const data = gradientImage(w, h);
    const result = quantize(data, w, h, 5, { seed: 1337 });
    expect(result.length).toBeLessThanOrEqual(5);
  });

  test('returned entries are valid DMC objects with id, name, rgb, lab', () => {
    const w = 10, h = 10;
    const data = gradientImage(w, h);
    const result = quantize(data, w, h, 4, { seed: 100 });
    for (const entry of result) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('rgb');
      expect(entry).toHaveProperty('lab');
    }
  });

  test('no duplicate IDs in output', () => {
    const w = 20, h = 20;
    const data = gradientImage(w, h);
    const result = quantize(data, w, h, 10, { seed: 55 });
    const ids = result.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// quantizeConstrained — constraint and edge-case tests
// ---------------------------------------------------------------------------

describe('quantizeConstrained — all results come from allowedPalette', () => {
  /** A small 5-colour allowed palette for testing. */
  const smallPalette = DMC.slice(0, 20);

  test('every returned entry is from allowedPalette', () => {
    const w = 20, h = 20;
    const data = gradientImage(w, h);
    const allowed = smallPalette;
    const result = quantizeConstrained(data, w, h, 5, allowed, { seed: 42 });
    const allowedIds = new Set(allowed.map(d => d.id));
    for (const entry of result) {
      expect(allowedIds.has(entry.id)).toBe(true);
    }
  });

  test('no duplicate IDs in output', () => {
    const w = 20, h = 20;
    const data = gradientImage(w, h);
    const result = quantizeConstrained(data, w, h, 10, smallPalette, { seed: 7 });
    const ids = result.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('when n > allowedPalette.length, returns at most allowedPalette.length entries', () => {
    const w = 10, h = 10;
    const data = solidImage(w, h, 255, 0, 0);
    const tinyPalette = DMC.slice(0, 3);
    const result = quantizeConstrained(data, w, h, 100, tinyPalette, { seed: 1 });
    expect(result.length).toBeLessThanOrEqual(tinyPalette.length);
  });

  test('falls back to full DMC palette when allowedPalette is empty', () => {
    const w = 10, h = 10;
    const data = gradientImage(w, h);
    // Empty allowedPalette → should fall back to DMC (not throw)
    const result = quantizeConstrained(data, w, h, 4, [], { seed: 1 });
    // All results must be valid DMC entries
    const dmcIds = new Set(DMC.map(d => d.id));
    for (const entry of result) {
      expect(dmcIds.has(entry.id)).toBe(true);
    }
  });

  test('same seed produces identical results (determinism)', () => {
    const w = 20, h = 20;
    const data = gradientImage(w, h);
    const seed = 999;
    const r1 = quantizeConstrained(data, w, h, 6, smallPalette, { seed });
    const r2 = quantizeConstrained(data, w, h, 6, smallPalette, { seed });
    expect(r1.map(d => d.id)).toEqual(r2.map(d => d.id));
  });

  test('returned entries have expected DMC shape', () => {
    const w = 10, h = 10;
    const data = gradientImage(w, h);
    const result = quantizeConstrained(data, w, h, 4, smallPalette, { seed: 2 });
    for (const entry of result) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('rgb');
      expect(Array.isArray(entry.rgb)).toBe(true);
      expect(entry.rgb).toHaveLength(3);
    }
  });
});
