/* tests/import/pdfPicturePixels.test.js — characterisation of how pdf-importer.js turns a picture that pdf.js
 * decoded (a MacStitch symbol, say) into RGBA pixels on white: pictureRgba, and the readSymbolPictures path that
 * calls it.
 *
 * Written against the in-class implementation and kept unchanged when the byte-level conversion lives in
 * pdf-picture-pixels.js: everything goes through the importer's own methods, which stay in place. Expected values
 * are what the code returned before the move, including the awkward ones (a channel count guessed from the byte
 * length, two-channel data read as grey-with-a-copy, the pixel buffer being allocated before the data is checked,
 * a throwing canvas giving null rather than an error).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function loadImporterClass() {
  global.pdfjsLib = { OPS: new Proxy({}, { get: () => -1 }), GlobalWorkerOptions: { workerSrc: '' } };
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(ROOT, 'pdf-importer.js'), 'utf8') + '\nthis.PatternKeeperImporter = PatternKeeperImporter;');
  return this.PatternKeeperImporter;
}
const Importer = loadImporterClass();
const newImp = (options) => new Importer(options);
const imp = newImp();

const px = (r) => r && Array.from(r.data);
const u8 = (a) => Uint8Array.from(a);

describe('pictureRgba: nothing usable', () => {
  it('is null without an image or without a positive size', () => {
    expect(imp.pictureRgba(null)).toBeNull();
    expect(imp.pictureRgba(undefined)).toBeNull();
    expect(imp.pictureRgba({ width: 0, height: 4, data: u8([1, 2, 3]), kind: 2 })).toBeNull();
    expect(imp.pictureRgba({ width: 4, height: 0, data: u8([1, 2, 3]), kind: 2 })).toBeNull();
    expect(imp.pictureRgba({ width: -1, height: 1, data: u8([1, 2, 3]), kind: 2 })).toBeNull();
    expect(imp.pictureRgba({ width: NaN, height: 1, data: u8([1, 2, 3]), kind: 2 })).toBeNull();
    expect(imp.pictureRgba({ height: 1, data: u8([1, 2, 3]), kind: 2 })).toBeNull();
    expect(imp.pictureRgba({ width: 1, height: 1 })).toBeNull();
  });

  it('is null for data whose length does not name a channel count, or is too short for the one it names', () => {
    expect(imp.pictureRgba({ width: 2, height: 1, data: u8([]), kind: 0 })).toBeNull();
    expect(imp.pictureRgba({ width: 2, height: 1, data: u8(new Array(10).fill(9)), kind: 0 })).toBeNull();    // 5 channels
    expect(imp.pictureRgba({ width: 2, height: 2, data: u8([1, 2, 3, 4, 5, 6]), kind: 2 })).toBeNull();      // kind 2 needs 12 bytes
    expect(imp.pictureRgba({ width: 2, height: 2, data: u8(new Array(15).fill(7)), kind: 3 })).toBeNull();   // kind 3 needs 16
  });
});

describe('pictureRgba: raw bytes from pdf.js', () => {
  it('reads kind 1 as one bit a pixel, rows padded to whole bytes, a set bit white', () => {
    // 10 px wide: two bytes a row. Row 0 = 1010101010, row 1 = 0000000011 (the six padding bits after each row are never read).
    const rows = [[0xAA, 0x80], [0x00, 0xFF]];
    const r = imp.pictureRgba({ width: 10, height: 2, kind: 1, data: u8(rows.flat()) });
    expect(r.w).toBe(10); expect(r.h).toBe(2);
    const v = (x, y) => r.data[(y * 10 + x) * 4];
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(x => v(x, 0))).toEqual([255, 0, 255, 0, 255, 0, 255, 0, 255, 0]);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(x => v(x, 1))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 255, 255]);
    for (let i = 0; i < 20; i++) {
      expect(r.data[i * 4 + 1]).toBe(r.data[i * 4]);
      expect(r.data[i * 4 + 2]).toBe(r.data[i * 4]);
      expect(r.data[i * 4 + 3]).toBe(255);
    }
  });

  it('reads kind 2 as RGB and kind 3 as RGBA', () => {
    expect(px(imp.pictureRgba({ width: 2, height: 1, kind: 2, data: u8([10, 20, 30, 40, 50, 60]) })))
      .toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
    expect(px(imp.pictureRgba({ width: 2, height: 1, kind: 3, data: u8([10, 20, 30, 255, 40, 50, 60, 255]) })))
      .toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
  });

  it('composites transparency onto white, rounding to the nearest value', () => {
    expect(px(imp.pictureRgba({ width: 1, height: 1, kind: 3, data: u8([0, 0, 0, 0]) }))).toEqual([255, 255, 255, 255]);
    expect(px(imp.pictureRgba({ width: 1, height: 1, kind: 3, data: u8([0, 0, 0, 128]) }))).toEqual([127, 127, 127, 255]);
    expect(px(imp.pictureRgba({ width: 1, height: 1, kind: 3, data: u8([200, 100, 0, 64]) }))).toEqual([241, 216, 191, 255]);
    expect(px(imp.pictureRgba({ width: 1, height: 1, kind: 3, data: u8([9, 8, 7, 1]) }))).toEqual([254, 254, 254, 255]);
  });

  it('guesses the channel count from the byte length when the kind says nothing', () => {
    // grey: one channel copied to all three
    expect(px(imp.pictureRgba({ width: 2, height: 1, data: u8([5, 200]) }))).toEqual([5, 5, 5, 255, 200, 200, 200, 255]);
    // two channels: first, second, second; no alpha
    expect(px(imp.pictureRgba({ width: 1, height: 1, data: u8([5, 90]) }))).toEqual([5, 90, 90, 255]);
    // three and four as the kinds
    expect(px(imp.pictureRgba({ width: 1, height: 1, data: u8([1, 2, 3]) }))).toEqual([1, 2, 3, 255]);
    expect(px(imp.pictureRgba({ width: 1, height: 1, data: u8([0, 0, 0, 0]) }))).toEqual([255, 255, 255, 255]);
    // a length that rounds to a channel count (7 bytes / 2 px = 3.5 -> 4), read as four channels, the last pixel short
    expect(imp.pictureRgba({ width: 2, height: 1, data: u8([1, 2, 3, 255, 4, 5, 6]) })).toBeNull();
    // 9 bytes / 2 px = 4.5 -> 5 channels: refused
    expect(imp.pictureRgba({ width: 2, height: 1, data: u8(new Array(9).fill(1)) })).toBeNull();
  });

  it('trusts a kind of 2 or 3 over the length, and reads only the bytes it needs', () => {
    expect(px(imp.pictureRgba({ width: 1, height: 1, kind: 2, data: u8([1, 2, 3, 4, 5, 6, 7]) }))).toEqual([1, 2, 3, 255]);
  });

  it('accepts plain arrays and typed arrays of any width', () => {
    expect(px(imp.pictureRgba({ width: 1, height: 1, kind: 2, data: [1, 2, 3] }))).toEqual([1, 2, 3, 255]);
    expect(px(imp.pictureRgba({ width: 1, height: 1, kind: 2, data: new Uint8ClampedArray([4, 5, 6]) }))).toEqual([4, 5, 6, 255]);
  });

  it('returns a fresh opaque RGBA buffer and leaves the input alone', () => {
    const data = u8([10, 20, 30, 128]);
    const before = Array.from(data);
    const r = imp.pictureRgba({ width: 1, height: 1, kind: 3, data });
    expect(r.data).toBeInstanceOf(Uint8ClampedArray);
    expect(r.data.length).toBe(4);
    expect(r.data.buffer).not.toBe(data.buffer);
    expect(Array.from(data)).toEqual(before);
    expect(Object.keys(r).sort()).toEqual(['data', 'h', 'w']);
  });

  it('takes the raw bytes in preference to a bitmap and never touches a canvas for them', () => {
    const create = jest.fn();
    const i2 = newImp({ canvasFactory: { create } });
    const r = i2.pictureRgba({ width: 1, height: 1, kind: 2, data: u8([1, 2, 3]), bitmap: {} });
    expect(px(r)).toEqual([1, 2, 3, 255]);
    expect(create).not.toHaveBeenCalled();
  });

  it('allocates the pixel buffer before checking the data, so an absurd size throws rather than returning null', () => {
    expect(() => imp.pictureRgba({ width: 200000, height: 200000, kind: 2, data: u8([1, 2, 3]) })).toThrow(RangeError);
  });
});

describe('pictureRgba: a bitmap drawn through a canvas', () => {
  const fakeFactory = (rgba, calls) => ({
    create: (w, h) => {
      calls.push(['create', w, h]);
      const context = {
        drawImage: (...a) => calls.push(['drawImage', ...a]),
        getImageData: (...a) => { calls.push(['getImageData', ...a]); return { data: Uint8ClampedArray.from(rgba) }; },
      };
      return { canvas: { w, h }, context };
    },
  });

  it('draws the bitmap at the origin on a canvas of its own size and composites what is read back onto white', () => {
    const calls = [];
    const bitmap = { tag: 'bmp' };
    const i2 = newImp({ canvasFactory: fakeFactory([0, 0, 0, 128, 10, 20, 30, 255], calls) });
    const r = i2.pictureRgba({ width: 2, height: 1, bitmap });
    expect(calls).toEqual([['create', 2, 1], ['drawImage', bitmap, 0, 0], ['getImageData', 0, 0, 2, 1]]);
    expect(px(r)).toEqual([127, 127, 127, 255, 10, 20, 30, 255]);
    expect(r.w).toBe(2); expect(r.h).toBe(1);
  });

  it('is null when the canvas has no context, or drawing or reading throws, and does not rethrow', () => {
    expect(newImp({ canvasFactory: { create: () => ({ canvas: {}, context: null }) } }).pictureRgba({ width: 1, height: 1, bitmap: {} })).toBeNull();
    expect(newImp({ canvasFactory: { create: () => { throw new Error('no canvas'); } } }).pictureRgba({ width: 1, height: 1, bitmap: {} })).toBeNull();
    const drawThrows = { create: () => ({ canvas: {}, context: { drawImage: () => { throw new Error('bad bitmap'); }, getImageData: () => ({ data: [] }) } }) };
    expect(newImp({ canvasFactory: drawThrows }).pictureRgba({ width: 1, height: 1, bitmap: {} })).toBeNull();
    const readThrows = { create: () => ({ canvas: {}, context: { drawImage: () => {}, getImageData: () => { throw new Error('tainted'); } } }) };
    expect(newImp({ canvasFactory: readThrows }).pictureRgba({ width: 1, height: 1, bitmap: {} })).toBeNull();
  });

  it('uses an OffscreenCanvas when there is no factory, and is null where there is no canvas of any kind', () => {
    const made = [];
    class FakeOffscreen {
      constructor(w, h) { made.push([w, h]); }
      getContext(kind) {
        made.push(kind);
        return { drawImage: () => {}, getImageData: () => ({ data: Uint8ClampedArray.from([1, 2, 3, 255]) }) };
      }
    }
    global.OffscreenCanvas = FakeOffscreen;
    try {
      expect(px(newImp().pictureRgba({ width: 1, height: 1, bitmap: {} }))).toEqual([1, 2, 3, 255]);
      expect(made).toEqual([[1, 1], '2d']);
    } finally { delete global.OffscreenCanvas; }
    expect(typeof OffscreenCanvas).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(newImp().pictureRgba({ width: 1, height: 1, bitmap: {} })).toBeNull();
  });

  it('falls back to a DOM canvas element where there is a document', () => {
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: Uint8ClampedArray.from([9, 8, 7, 255]) }) }) };
    global.document = { createElement: jest.fn(() => canvas) };
    try {
      expect(px(newImp().pictureRgba({ width: 1, height: 1, bitmap: {} }))).toEqual([9, 8, 7, 255]);
      expect(global.document.createElement).toHaveBeenCalledWith('canvas');
      expect(canvas.width).toBe(1); expect(canvas.height).toBe(1);
    } finally { delete global.document; }
  });
});

describe('readSymbolPictures: decoded pictures become shared symbol keys', () => {
  const imgObj = (w, h, fill) => ({ width: w, height: h, kind: 2, data: u8(new Array(w * h * 3).fill(fill)) });
  const pageWith = (objs) => ({ objs: { get: (name, cb) => cb(objs[name]) }, commonObjs: { get: (name, cb) => cb(objs[name]) } });
  const placed = (name, x0, y0) => ({ name, x0, y0, x1: x0 + 10, y1: y0 + 10, pxW: 8, pxH: 8 });

  it('keys each distinct picture by size and exact pixels, decodes a name once, and keeps the shape', async () => {
    const i2 = newImp();
    const a = placed('img_a', 0, 0), b = placed('img_b', 20, 0), c = placed('img_a', 40, 0);
    await i2.readSymbolPictures(pageWith({ img_a: imgObj(8, 8, 0), img_b: imgObj(8, 8, 255) }), [a, b, c]);
    expect(a.pic).toMatch(/^pic:8x8:[0-9a-f]+$/);
    expect(b.pic).toMatch(/^pic:8x8:[0-9a-f]+$/);
    expect(a.pic).not.toBe(b.pic);
    expect(c.pic).toBe(a.pic);
    expect(Array.from(i2._pictures.keys()).sort()).toEqual([a.pic, b.pic].sort());
    const entry = i2._pictures.get(a.pic);
    expect(Object.keys(entry).sort()).toEqual(['data', 'h', 'shape', 'w']);
    expect(entry.w).toBe(8); expect(entry.h).toBe(8);
    expect(entry.data.length).toBe(8 * 8 * 4);
    expect(entry.shape).toBeInstanceOf(Float64Array);
    expect(entry.shape.length).toBe(256);
  });

  it('leaves a picture unmarked when pdf.js never hands it over or it cannot be decoded', async () => {
    const i2 = newImp();
    const missing = placed('gone', 0, 0), broken = placed('bad', 20, 0);
    await i2.readSymbolPictures(pageWith({ bad: { width: 2, height: 2, data: u8([1, 2, 3]), kind: 2 } }), [missing, broken]);
    expect(missing.pic).toBeUndefined();
    expect(broken.pic).toBeUndefined();
    expect(i2._pictures.size).toBe(0);
  });

  it('keeps the same key for the same pixels on a later page, and does not store the picture twice', async () => {
    const i2 = newImp();
    const a = placed('p1', 0, 0), b = placed('p2', 0, 0);
    await i2.readSymbolPictures(pageWith({ p1: imgObj(8, 8, 40) }), [a]);
    await i2.readSymbolPictures(pageWith({ p2: imgObj(8, 8, 40) }), [b]);
    expect(b.pic).toBe(a.pic);
    expect(i2._pictures.size).toBe(1);
  });

  it('checks for cancellation before each new picture is decoded', async () => {
    const token = { aborted: false };
    const i2 = newImp({ cancelToken: token });
    let decoded = 0;
    const page = { objs: { get: (n, cb) => { decoded++; token.aborted = true; cb(imgObj(8, 8, 0)); } }, commonObjs: {} };
    await expect(i2.readSymbolPictures(page, [placed('x', 0, 0), placed('y', 20, 0)]))
      .rejects.toMatchObject({ name: 'ImportAbortedError', message: 'Import cancelled.' });
    expect(decoded).toBe(1);
  });

  it('ignores pictures that are not small symbols', async () => {
    const i2 = newImp();
    const big = { name: 'big', x0: 0, y0: 0, x1: 100, y1: 100, pxW: 8, pxH: 8 };
    const hi = { name: 'hi', x0: 0, y0: 0, x1: 10, y1: 10, pxW: 300, pxH: 8 };
    await i2.readSymbolPictures(pageWith({ big: imgObj(8, 8, 0), hi: imgObj(8, 8, 0) }), [big, hi]);
    expect(big.pic).toBeUndefined();
    expect(hi.pic).toBeUndefined();
    expect(i2._pictures).toBeUndefined();
  });
});
