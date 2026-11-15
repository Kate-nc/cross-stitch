// pdf-vector-glyphs.js is a classic script that pdf-importer.js calls by global name. Everything that loads the
// importer must load it first (after pdf-key-reader.js), the import engine's copy of that loader must agree, the
// service worker must precache and fingerprint it, and it must stand alone: no globals needed at load, no pdf.js,
// no DOM, no storage, no asynchronous results.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

describe('pdf-vector-glyphs.js loading contexts', () => {
  const loaderOrder = ['pdf-key-reader.js', 'pdf-vector-glyphs.js', 'pdf-importer.js'];
  const positions = (text) => loaderOrder.map(name => text.search(new RegExp("loadScript\\('" + name.replace('.', '\\.') + "'\\)")));

  test.each(['create.html', 'index.html', 'stitch.html', 'import-engine/strategies/pdfGlyphStrategy.js', 'import-engine/bundle.js'])(
    '%s loads the drawn-symbol matcher once, between the key reader and the importer', (file) => {
      const text = read(file);
      expect(text.split("loadScript('pdf-vector-glyphs.js')").length - 1).toBe(1);
      const p = positions(text);
      expect(p.every(i => i >= 0)).toBe(true);
      expect([...p].sort((a, b) => a - b)).toEqual(p);
    });

  test('the service worker precaches the drawn-symbol matcher and fingerprints it', () => {
    const sw = read('sw.js');
    expect(sw).toContain("'./pdf-vector-glyphs.js'");
    expect(sw).toContain('"./pdf-vector-glyphs.js": {');
  });

  test('the Jest setup exposes the global the way the pages do', () => {
    expect(global.PdfVectorGlyphs).toBe(require('../pdf-vector-glyphs.js'));
  });
});

describe('pdf-vector-glyphs.js stands alone', () => {
  const src = read('pdf-vector-glyphs.js');
  const API = ['N', 'emOf', 'bitmap', 'pixelSize', 'keyOf', 'similarity', 'bestMatch', 'toRgba'];

  test('evaluates in an empty global scope and publishes PdfVectorGlyphs on window', () => {
    const ctx = {};
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    expect(Object.keys(ctx.PdfVectorGlyphs)).toEqual(API);
  });

  test('is also a CommonJS module, for tests that require it', () => {
    expect(Object.keys(require('../pdf-vector-glyphs.js'))).toEqual(API);
  });

  test('returns synchronously, and leaves frozen shapes alone', () => {
    const V = require('../pdf-vector-glyphs.js');
    const shapes = Object.freeze([Object.freeze({ fill: true, paint: 1, pts: Object.freeze([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }].map(Object.freeze)) })]);
    const bits = V.bitmap(shapes, 2, 2, 4);
    expect(bits && typeof bits.then).not.toBe('function');
    expect(bits.some(b => b === 1)).toBe(true);
  });
});
