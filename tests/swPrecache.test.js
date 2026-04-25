// tests/swPrecache.test.js — UX-12 Phase 7 PR #13 (cache name bumped to v10 after the SubstituteFromStashModal bundle hot-fix)
// Verifies the service worker precache contract:
//   - CACHE_NAME bumped to v10 (so existing clients evict the broken bundle.js they had cached under v9)
//   - home.html and home-app.js are in PRECACHE_URLS

const fs = require('fs');
const path = require('path');

const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

describe('sw.js precache (UX-12 Phase 7 PR #13)', () => {
  test('CACHE_NAME bumped to v10', () => {
    expect(SW).toMatch(/CACHE_NAME\s*=\s*['"]cross-stitch-cache-v10['"]/);
  });

  test('PRECACHE_URLS includes home.html', () => {
    expect(SW).toMatch(/['"]\.\/home\.html['"]/);
  });

  test('PRECACHE_URLS includes home-app.js', () => {
    expect(SW).toMatch(/['"]\.\/home-app\.js['"]/);
  });

  test('PRECACHE_URLS still includes the per-tool HTML pages (deep-link support)', () => {
    expect(SW).toMatch(/['"]\.\/index\.html['"]/);
    expect(SW).toMatch(/['"]\.\/stitch\.html['"]/);
    expect(SW).toMatch(/['"]\.\/manager\.html['"]/);
  });
});
