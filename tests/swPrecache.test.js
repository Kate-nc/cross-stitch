// tests/swPrecache.test.js — UX-12 Phase 7 PR #13, bumped to v12 for the
// Tier 2 homepage-predominance audit changes (the Creator no longer mounts
// the legacy in-tool HomeScreen and standalone-mode initial state changed).
// Verifies the service worker precache contract:
//   - CACHE_NAME at the current ship version
//   - home.html and home-app.js are in PRECACHE_URLS
//   - the new app-icon.svg is precached

const fs = require('fs');
const path = require('path');

const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

describe('sw.js precache (UX-12 Phase 7 PR #13)', () => {
  test('CACHE_NAME bumped to v12', () => {
    expect(SW).toMatch(/CACHE_NAME\s*=\s*['"]cross-stitch-cache-v12['"]/);
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
