// tests/swPrecache-rasterChart.test.js — Phase 1 & Phase 2 of the raster
// cross-stitch chart importer. Mirrors the swPrecache.test.js contract so
// future cache bumps that drop these files will fail loudly.
//
// Heavy CV/OCR vendor blobs (OpenCV.js ~8 MB, Tesseract.js + language data)
// are explicitly NOT in PRECACHE_URLS — they're runtime-cached on first use
// by the local-asset fetch handler in sw.js. This test guards both halves of
// that contract.

const fs = require('fs');
const path = require('path');

const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Extract just the PRECACHE_URLS array literal so negative assertions don't
// trip on comment prose that happens to mention vendor names.
function extractPrecacheUrls(src) {
  const m = src.match(/var\s+PRECACHE_URLS\s*=\s*\[([\s\S]*?)\];/);
  if (!m) throw new Error('PRECACHE_URLS array not found in sw.js');
  const body = m[1];
  // Strip line comments before pulling out quoted strings.
  const stripped = body.replace(/\/\/[^\n]*/g, '');
  const urls = [];
  const re = /['"]([^'"]+)['"]/g;
  let q;
  while ((q = re.exec(stripped)) !== null) urls.push(q[1]);
  return urls;
}

const PRECACHE = extractPrecacheUrls(SW);

describe('sw.js precache (raster chart importer Phase 1)', () => {
  const SMALL_LOCAL_MODULES = [
    './creator/rasterChart/hog.js',
    './creator/rasterChart/ocrRepair.js',
    './creator/rasterChart/projectionProfile.js',
    './creator/rasterChart/dbscan.js',
    './creator/rasterChart/matScope.js',
    './creator/rasterChart/cvPipeline.js',
    './creator/rasterChart/pendingImportStore.js',
    './creator/rasterChart/CorrectionUI.js',
    './creator/rasterChart/MultiPageDropzone.js',
    './creator/rasterChart/telemetry.js',
    './creator/rasterChart/DebugUI.js',
    './creator/rasterChartWorker.js',
    './import-engine/strategies/rasterChartStrategy.js',
  ];

  test.each(SMALL_LOCAL_MODULES)('precaches %s', (url) => {
    expect(PRECACHE).toContain(url);
  });

  test('does NOT precache the OpenCV.js vendor blob', () => {
    expect(PRECACHE.some((u) => /opencv\.js/i.test(u))).toBe(false);
  });

  test('does NOT precache Tesseract.js or its language data', () => {
    expect(PRECACHE.some((u) => /tesseract/i.test(u))).toBe(false);
    expect(PRECACHE.some((u) => /eng\.traineddata/i.test(u))).toBe(false);
  });

  test('does NOT precache density-clustering or imagehash-web', () => {
    expect(PRECACHE.some((u) => /density-clustering/i.test(u))).toBe(false);
    expect(PRECACHE.some((u) => /imagehash-web/i.test(u))).toBe(false);
  });
});
