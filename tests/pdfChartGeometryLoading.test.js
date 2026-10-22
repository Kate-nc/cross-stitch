// pdf-chart-geometry.js is a classic script that pdf-importer.js calls by global name. Everything that loads the
// importer must load it first (after pdf-axis-labels.js and pdf-raster-chart.js), the import engine's copy of that
// loader must agree, the service worker must precache and fingerprint it, and it must stand alone: no globals
// needed at load, no pdf.js, no storage, no asynchronous results.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

describe('pdf-chart-geometry.js loading contexts', () => {
  const loaderOrder = [
    "pdf-axis-labels.js", "pdf-raster-chart.js", "pdf-chart-geometry.js", "pdf-importer.js"
  ];
  const positions = (text) => loaderOrder.map(name => text.search(new RegExp("loadScript\\('" + name.replace('.', '\\.') + "'\\)")));

  test.each(['create.html', 'index.html', 'stitch.html', 'import-engine/strategies/pdfGlyphStrategy.js', 'import-engine/bundle.js'])(
    '%s loads the geometry once, between the raster reader and the importer', (file) => {
      const text = read(file);
      expect(text.split("loadScript('pdf-chart-geometry.js')").length - 1).toBe(1);
      const p = positions(text);
      expect(p.every(i => i >= 0)).toBe(true);
      expect([...p].sort((a, b) => a - b)).toEqual(p);
    });

  test('nothing else loads pdf-importer.js without it', () => {
    const files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) { if (!/^(node_modules|\.git|tests|reports|wiki|docs|compiled|TestUploads|assets)$/.test(e.name)) walk(rel); }
        else if (/\.(js|html)$/.test(e.name)) files.push(rel);
      }
    };
    walk('.');
    const loaders = files.filter(f => !/^(\.\/)?(sw\.js|pdf-importer\.js)$/.test(f) && /(loadScript|importScripts|<script[^>]*src=)[^\n]*pdf-importer\.js/.test(read(f)));
    expect(loaders.map(f => f.replace(/^\.\//, '')).sort()).toEqual(
      ['create.html', 'import-engine/bundle.js', 'import-engine/strategies/pdfGlyphStrategy.js', 'index.html', 'stitch.html']);
  });

  test('the service worker precaches the geometry and fingerprints it', () => {
    const sw = read('sw.js');
    expect(sw).toContain("'./pdf-chart-geometry.js'");
    expect(sw).toContain('"./pdf-chart-geometry.js": {');
  });
});

describe('pdf-chart-geometry.js stands alone', () => {
  const src = read('pdf-chart-geometry.js');

  test('evaluates in an empty global scope and publishes PdfChartGeometry on window', () => {
    const ctx = {};
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    expect(Object.keys(ctx.PdfChartGeometry).sort()).toEqual([
      'anchorGridToRuler', 'chartContentBox', 'gridFromRuler', 'rulerCellSpan', 'samplingGrid'
    ]);
  });

  test('is also a CommonJS module, for tests and workers that require it', () => {
    expect(Object.keys(require('../pdf-chart-geometry.js')).sort()).toEqual([
      'anchorGridToRuler', 'chartContentBox', 'gridFromRuler', 'rulerCellSpan', 'samplingGrid'
    ]);
  });

  test('every function returns synchronously, with nothing but its arguments', () => {
    const G = require('../pdf-chart-geometry.js');
    const ruler = { colBase: 0, rowBase: 0, pitchX: 10, pitchY: 10, colLabels: [], rowLabels: [] };
    const span = { colStart: 0, rowStart: 0, columns: 1, rows: 1 };
    const grid = { originX: 0, originY: 0, cellWidth: 10, cellHeight: 10, columns: 1, rows: 1 };
    const calls = [
      () => G.chartContentBox({ width: 100, height: 100 }, 10, 10),
      () => G.rulerCellSpan({ width: 100, height: 100 }, ruler, 10, 10),
      () => G.anchorGridToRuler(grid, ruler, 10, 10),
      () => G.gridFromRuler(ruler, span, grid),
      () => G.samplingGrid({ grid })
    ];
    for (const call of calls) {
      const out = call();
      expect(out && typeof out.then).not.toBe('function');
    }
  });
});
