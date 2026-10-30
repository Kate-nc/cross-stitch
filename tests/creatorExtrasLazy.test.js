// creator/extras-bundle.js (Materials & Output, the Adapt modal) loads the
// first time it is needed instead of on every Creator open, and no longer
// carries a second copy of creator/pdfChartLayout.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PAGES = ['create.html', 'index.html'];

describe('extras bundle loads on demand', () => {
  test.each(PAGES)('%s has no eager <script> for it, but desktop prefetches it', page => {
    const html = read(page);
    expect(html).not.toMatch(/<script[^>]+src="creator\/extras-bundle\.js"/);
    const prefetch = html.slice(html.indexOf("l.rel = 'prefetch'") - 600, html.indexOf("l.rel = 'prefetch'"));
    expect(prefetch).toContain("'creator/extras-bundle.js'");
  });

  test('it stays in the offline precache', () => {
    const sw = read('sw.js');
    const ctx = {};
    vm.runInNewContext(sw.slice(0, sw.indexOf('// END GENERATED BUILD MANIFEST')), ctx);
    expect(ctx.PRECACHE_URLS).toContain('./creator/extras-bundle.js');
    expect(ctx.REQUIRED_URLS).toContain('./creator/extras-bundle.js');
  });

  test('runtime-loaders.js exposes loadCreatorExtras for it', () => {
    expect(read('runtime-loaders.js')).toMatch(/window\.loadCreatorExtras = function[\s\S]*?loadScript\('creator\/extras-bundle\.js'/);
  });

  test('creator-main.js loads it for Materials & Output and for the Adapt modal', () => {
    const main = read('creator-main.js');
    expect(main).toMatch(/const needExtras = state\.tab === 'materials' \|\| !!state\.adaptModalOpen;/);
    expect(main).toMatch(/window\.loadCreatorExtras\(\)/);
    expect(main).toMatch(/state\.adaptModalOpen&&extrasReady&&typeof window\.AdaptModal/);
    expect(main).toMatch(/Loading Materials & Output…/);
    expect(main).toMatch(/Materials & Output couldn't be loaded/);
  });

  test("the Project tab's Adapt to brand button no longer waits for AdaptModal", () => {
    const src = read('creator/ProjectTab.js');
    expect(src).toContain('"Adapt to brand"');
    expect(src).not.toMatch(/typeof window\.AdaptModal !== "undefined"\s*\?\s*h\("button"/);
  });
});

describe('the PDF exporter runs once on the Creator pages', () => {
  test('export-pdf.js gets it from the extras bundle there, not creator/pdfExport.js on its own', () => {
    const src = read('export-pdf.js');
    const creator = src.indexOf('window.__csPageKind === "creator" && typeof window.loadCreatorExtras === "function"');
    const standalone = src.indexOf('window.loadScript(PDF_EXPORT_SRC');
    expect(creator).toBeGreaterThan(-1);
    expect(standalone).toBeGreaterThan(creator);
  });

  test.each(PAGES)('%s is marked as a Creator page before export-pdf.js can run', page => {
    expect(read(page)).toMatch(/window\.__csPageKind = 'creator';/);
  });
});

describe('pdfChartLayout.js is loaded once on the Creator pages', () => {
  test('the extras bundle no longer includes it', () => {
    expect(read('creator/extras-bundle.js')).not.toContain('/* ─── pdfChartLayout.js ─── */');
    expect(read('creator/extras-bundle.js')).toContain('/* ─── pdfExport.js ─── */');
  });

  test.each(PAGES)('%s loads it with its own tag before symbol-glyphs.js, which needs it at first render', page => {
    const html = read(page);
    const layout = html.indexOf('<script src="creator/pdfChartLayout.js"></script>');
    expect(layout).toBeGreaterThan(-1);
    expect(html.indexOf('<script src="symbol-glyphs.js"></script>')).toBeGreaterThan(layout);
  });
});
