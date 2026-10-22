// pdf-key-reader.js is a classic script that pdf-importer.js calls by global name. Everything that loads the
// importer must load it first (after pdf-picture-pixels.js), the import engine's copy of that loader must agree,
// the service worker must precache and fingerprint it, and it must stand alone: no globals needed at load, no
// pdf.js, no DOM, no storage, no asynchronous results.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

describe('pdf-key-reader.js loading contexts', () => {
  const loaderOrder = ["pdf-chart-geometry.js", "pdf-picture-pixels.js", "pdf-key-reader.js", "pdf-importer.js"];
  const positions = (text) => loaderOrder.map(name => text.search(new RegExp("loadScript\\('" + name.replace('.', '\\.') + "'\\)")));

  test.each(['create.html', 'index.html', 'stitch.html', 'import-engine/strategies/pdfGlyphStrategy.js', 'import-engine/bundle.js'])(
    '%s loads the key reader once, between the picture pixels and the importer', (file) => {
      const text = read(file);
      expect(text.split("loadScript('pdf-key-reader.js')").length - 1).toBe(1);
      const p = positions(text);
      expect(p.every(i => i >= 0)).toBe(true);
      expect([...p].sort((a, b) => a - b)).toEqual(p);
    });

  test('the service worker precaches the key reader and fingerprints it', () => {
    const sw = read('sw.js');
    expect(sw).toContain("'./pdf-key-reader.js'");
    expect(sw).toContain('"./pdf-key-reader.js": {');
  });

  test('the Jest setup exposes the global the way the pages do', () => {
    expect(global.PdfKeyReader).toBe(require('../pdf-key-reader.js'));
  });
});

describe('pdf-key-reader.js stands alone', () => {
  const src = read('pdf-key-reader.js');

  test('evaluates in an empty global scope and publishes PdfKeyReader on window', () => {
    const ctx = {};
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    expect(Object.keys(ctx.PdfKeyReader)).toEqual(['readKeyEntries']);
  });

  test('is also a CommonJS module, for tests that require it', () => {
    expect(Object.keys(require('../pdf-key-reader.js'))).toEqual(['readKeyEntries']);
  });

  test('returns synchronously, and leaves a frozen page and exclusion box alone', () => {
    const R = require('../pdf-key-reader.js');
    const deepFreeze = (o) => { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };
    const page = deepFreeze({
      textItems: [{ str: '310', x: 100, y: 100, width: 18, height: 8, fontName: 'f1' }],
      vectorPaths: [{ fillColor: [1, 2, 3], points: [{ x: 80, y: 91 }, { x: 89, y: 91 }, { x: 89, y: 100 }, { x: 80, y: 100 }] }],
      images: [],
    });
    const out = R.readKeyEntries(page, deepFreeze({ x0: 0, y0: 0, x1: 1, y1: 1 }));
    expect(out && typeof out.then).not.toBe('function');
    expect(out).toEqual([expect.objectContaining({ threadCode: '310', swatchRgb: [1, 2, 3] })]);
    expect(out[0].swatchRgb).not.toBe(page.vectorPaths[0].fillColor);
  });
});
