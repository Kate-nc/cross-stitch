// pdf-picture-pixels.js is a classic script that pdf-importer.js calls by global name. Everything that loads the
// importer must load it first (after pdf-chart-geometry.js), the import engine's copy of that loader must agree,
// the service worker must precache and fingerprint it, and it must stand alone: no globals needed at load, no
// pdf.js, no canvas, no storage, no asynchronous results.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

describe('pdf-picture-pixels.js loading contexts', () => {
  const loaderOrder = ["pdf-raster-chart.js", "pdf-chart-geometry.js", "pdf-picture-pixels.js", "pdf-importer.js"];
  const positions = (text) => loaderOrder.map(name => text.search(new RegExp("loadScript\\('" + name.replace('.', '\\.') + "'\\)")));

  test.each(['create.html', 'index.html', 'stitch.html', 'import-engine/strategies/pdfGlyphStrategy.js', 'import-engine/bundle.js'])(
    '%s loads the picture pixels once, between the geometry and the importer', (file) => {
      const text = read(file);
      expect(text.split("loadScript('pdf-picture-pixels.js')").length - 1).toBe(1);
      const p = positions(text);
      expect(p.every(i => i >= 0)).toBe(true);
      expect([...p].sort((a, b) => a - b)).toEqual(p);
    });

  test('the service worker precaches the picture pixels and fingerprints them', () => {
    const sw = read('sw.js');
    expect(sw).toContain("'./pdf-picture-pixels.js'");
    expect(sw).toContain('"./pdf-picture-pixels.js": {');
  });

  test('the Jest setup exposes the global the way the pages do', () => {
    expect(global.PdfPicturePixels).toBe(require('../pdf-picture-pixels.js'));
  });
});

describe('pdf-picture-pixels.js stands alone', () => {
  const src = read('pdf-picture-pixels.js');

  test('evaluates in an empty global scope and publishes PdfPicturePixels on window', () => {
    const ctx = {};
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    expect(Object.keys(ctx.PdfPicturePixels).sort()).toEqual(['onWhite', 'rawToRgba']);
  });

  test('is also a CommonJS module, for tests that require it', () => {
    expect(Object.keys(require('../pdf-picture-pixels.js')).sort()).toEqual(['onWhite', 'rawToRgba']);
  });

  test('both functions return synchronously, build one new buffer, and leave their inputs alone', () => {
    const P = require('../pdf-picture-pixels.js');
    const img = Object.freeze({ width: 1, height: 1, kind: 3, data: Uint8Array.from([10, 20, 30, 128]) });
    const raw = P.rawToRgba(img, 1, 1);
    expect(raw && typeof raw.then).not.toBe('function');
    expect(raw).toBeInstanceOf(Uint8ClampedArray);
    expect(raw.buffer).not.toBe(img.data.buffer);
    const out = P.onWhite(raw, 1, 1);
    expect(out && typeof out.then).not.toBe('function');
    expect(out.data.buffer).not.toBe(raw.buffer);
    expect(Array.from(raw)).toEqual([10, 20, 30, 128]);
    expect(Array.from(img.data)).toEqual([10, 20, 30, 128]);
  });
});
