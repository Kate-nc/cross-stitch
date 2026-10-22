/**
 * Picture to stitch pixels: gridPixels (creator/generate.js) and
 * linearAreaDownscale (colour-utils.js).
 *
 * A stitch shows the average of the picture under it as light. The browser's
 * own downscale averages the stored sRGB values instead, which made white and
 * black 128 rather than 188 and darkened every boundary between two colours
 * (reports/photo-conversion-accuracy-review.md, finding 2). Replaces the tests
 * for prescaleForGrid, the gamma-space halving chain this removes.
 */
const { loadSource } = require('./_helpers/loadSource');
const { linearAreaDownscale } = require('../colour-utils.js');

const genSrc = loadSource('creator/generate.js');

function px(...colours) {
  return new Uint8ClampedArray(colours.flatMap((c) => (c.length === 4 ? c : c.concat(255))));
}

describe('linearAreaDownscale', () => {
  test('white and black average to 188 (half the light), not 128', () => {
    const out = linearAreaDownscale(px([0, 0, 0], [255, 255, 255], [255, 255, 255], [0, 0, 0]), 2, 2, 1, 1);
    expect(Array.from(out)).toEqual([188, 188, 188, 255]);
  });

  test('the same size returns the same pixels', () => {
    const src = px([10, 20, 30], [200, 100, 50, 128], [0, 255, 0], [77, 77, 77]);
    expect(Array.from(linearAreaDownscale(src, 2, 2, 2, 2))).toEqual(Array.from(src));
  });

  test('fractional coverage: 3 pixels to 2 weights the middle one half to each side', () => {
    const out = linearAreaDownscale(px([0, 0, 0], [255, 255, 255], [0, 0, 0]), 3, 1, 2, 1);
    // Each output covers 1.5 pixels: a third of the light of white.
    expect(out[0]).toBe(156);
    expect(out[4]).toBe(156);
  });

  test('transparent pixels add coverage, never colour', () => {
    // Opaque red beside a transparent pixel whose hidden RGB is green.
    const out = linearAreaDownscale(px([255, 0, 0, 255], [0, 255, 0, 0]), 2, 1, 1, 1);
    expect(Array.from(out)).toEqual([255, 0, 0, 128]);
  });

  test('fully transparent stays transparent', () => {
    const out = linearAreaDownscale(px([9, 9, 9, 0], [9, 9, 9, 0]), 2, 1, 1, 1);
    expect(out[3]).toBe(0);
  });

  test('a flat colour is unchanged at any ratio', () => {
    const w = 37, h = 23, src = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) src.set([123, 45, 210, 255], i * 4);
    const out = linearAreaDownscale(src, w, h, 5, 4);
    for (let i = 0; i < 20; i++) expect(Array.from(out.slice(i * 4, i * 4 + 4))).toEqual([123, 45, 210, 255]);
  });
});

describe('gridPixels', () => {
  // A fake canvas: drawing an image at its own size copies its pixels;
  // at any other size, records the call and returns grey.
  let draws, applied;
  function load() {
    draws = []; applied = [];
    const document = {
      createElement: () => {
        const c = { width: 0, height: 0 };
        let pixels = null;
        const ctx = {
          filter: 'none',
          drawImage(src, x, y, w, h) {
            draws.push({ w, h, filter: ctx.filter });
            pixels = (w === src.width && h === src.height && src.pixels) ? src.pixels.slice() : new Uint8ClampedArray(w * h * 4).fill(128);
          },
          getImageData: (x, y, w, h) => ({ data: pixels, width: w, height: h }),
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        };
        c.getContext = () => ctx;
        return c;
      },
    };
    const fn = new Function('document', 'linearAreaDownscale', 'applyPreSharpenCanvas', '_applyImageFilters',
      genSrc.slice(genSrc.indexOf('var GRID_PIXELS_MAX_SOURCE_AREA'), genSrc.indexOf('/**\n * Apply a pre-downscale luminance unsharp mask')) + '\nreturn { gridPixels, GRID_PIXELS_MAX_SOURCE_AREA };');
    return fn(document, linearAreaDownscale, (s) => s, (id, b, c, s) => applied.push([id.width, b, c, s]));
  }
  const checker = () => ({ width: 2, height: 2, pixels: px([0, 0, 0], [255, 255, 255], [255, 255, 255], [0, 0, 0]) });

  test('draws the picture at its own size and averages it as light', () => {
    const { gridPixels } = load();
    const out = gridPixels(checker(), 1, 1);
    expect(draws[0]).toMatchObject({ w: 2, h: 2 });
    expect(Array.from(out.data)).toEqual([188, 188, 188, 255]);
  });

  test('brightness, contrast and saturation go to the stitch-sized picture, never as a canvas filter', () => {
    const { gridPixels } = load();
    gridPixels(checker(), 1, 1, { bri: 10, con: -5, sat: 20 });
    expect(applied).toEqual([[1, 10, -5, 20]]);
    expect(draws.every((d) => d.filter === 'none')).toBe(true);
  });

  test('no adjustments: the pixels are left alone', () => {
    const { gridPixels } = load();
    gridPixels(checker(), 1, 1, {});
    expect(applied).toEqual([]);
  });

  test('enlarging has nothing to average: drawn straight at grid size', () => {
    const { gridPixels } = load();
    const out = gridPixels(checker(), 4, 4);
    expect(draws).toEqual([{ w: 4, h: 4, filter: 'none' }]);
    expect(out.data.length).toBe(64);
  });

  test('a very large picture is first drawn within the size limit', () => {
    const { gridPixels, GRID_PIXELS_MAX_SOURCE_AREA } = load();
    gridPixels({ width: 9000, height: 6000 }, 90, 60);
    expect(draws[0].w * draws[0].h).toBeLessThanOrEqual(GRID_PIXELS_MAX_SOURCE_AREA);
    expect(draws[0].w / draws[0].h).toBeCloseTo(1.5, 2);
  });

  test('the same picture and size are read once, whatever the adjustments', () => {
    const { gridPixels } = load();
    const img = checker();
    const a = gridPixels(img, 1, 1);
    const b = gridPixels(img, 1, 1, { bri: 30 });
    gridPixels(img, 1, 1);
    expect(draws.length).toBe(1);
    expect(Array.from(a.data)).toEqual([188, 188, 188, 255]);   // the cached copy is never adjusted in place
    expect(b.data).not.toBe(a.data);
  });

  test('an element given a picture of another size is read again', () => {
    const { gridPixels } = load();
    const img = checker();
    gridPixels(img, 1, 1);
    Object.assign(img, { width: 4, height: 2, pixels: px([0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]) });
    expect(Array.from(gridPixels(img, 1, 1).data)).toEqual([0, 0, 0, 255]);
    expect(draws.length).toBe(2);
  });

  test('a new size, or a canvas source, is read again', () => {
    const { gridPixels } = load();
    const img = checker();
    gridPixels(img, 1, 1); gridPixels(img, 2, 1);
    expect(draws.length).toBe(2);
    const canvas = Object.assign(checker(), { getContext() {} });
    gridPixels(canvas, 1, 1); gridPixels(canvas, 1, 1);
    expect(draws.length).toBe(4);
  });
});

describe('every picture-to-stitches path uses gridPixels', () => {
  test.each([
    ['creator/generate.js', /gridPixels\(img, sW, sH, \{ bri: bri, con: con, sat: sat, preSharpenOpts: opts\.preSharpenOpts \}\)/],
    ['creator/useCreatorState.js', /imageData = gridPixels\(img, sW, sH,/],
    ['creator/useCreatorState.js', /_gcxImgData = gridPixels\(img, gw, gh,/],
    ['creator/usePreview.js', /gridPixels\(img, pw, ph,/],
    ['creator/CompareStrip.js', /gridPixels\(img, pw, ph,/],
  ])('%s', (file, re) => {
    expect(loadSource(file)).toMatch(re);
  });

  test('the gamma-space halving chain is gone', () => {
    for (const f of ['creator/generate.js', 'creator/useCreatorState.js', 'creator/usePreview.js', 'creator/CompareStrip.js']) {
      expect(loadSource(f)).not.toMatch(/prescaleForGrid/);
    }
  });
});

describe('creatorShrinkUpload (large uploads, useProjectIO.js)', () => {
  const ioSrc = loadSource('creator/useProjectIO.js');
  const fnSrc = ioSrc.slice(ioSrc.indexOf('function creatorShrinkUpload('), ioSrc.indexOf('window.creatorShrinkUpload'));
  function load(noContext) {
    const draws = [];
    const document = { createElement: () => {
      const c = { width: 0, height: 0 };
      c.getContext = () => (noContext ? null : { imageSmoothingQuality: 'low', drawImage(src, x, y, w, h) { draws.push({ from: [src.width, src.height], to: [w, h], quality: this.imageSmoothingQuality, smooth: this.imageSmoothingEnabled }); } });
      return c;
    } };
    return { draws, shrink: new Function('document', fnSrc + '\nreturn creatorShrinkUpload;')(document) };
  }

  test('a 48-megapixel photo is halved in high-quality steps, never sampled in one go', () => {
    const { draws, shrink } = load();
    const out = shrink({ width: 8064, height: 6048 }, 2000, 1500);
    expect([out.width, out.height]).toEqual([2000, 1500]);
    expect(draws.map((d) => d.to)).toEqual([[4032, 3024], [2016, 1512], [2000, 1500]]);
    for (const d of draws) { expect(d.quality).toBe('high'); expect(d.smooth).toBe(true); expect(d.from[0] / d.to[0]).toBeLessThanOrEqual(2); }
  });

  test('a picture already within twice the size is drawn once', () => {
    const { draws, shrink } = load();
    shrink({ width: 3000, height: 2000 }, 2000, 1333);
    expect(draws).toHaveLength(1);
  });

  test('no 2D context: null', () => {
    expect(load(true).shrink({ width: 8000, height: 6000 }, 2000, 1500)).toBeNull();
  });
});
