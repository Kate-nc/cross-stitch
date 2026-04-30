// tests/swPrecache.test.js — UX-12 Phase 7 PR #13, bumped to v13 for the
// Creator pre-mount action-handling fix (the home->index handoff now sets
// __pendingCreatorFile synchronously before React mounts; without the cache
// bump clients keep the previous creator-main.js where the handoff was
// silently dropped on a child-vs-parent useEffect race).
// Verifies the service worker precache contract:
//   - CACHE_NAME at the current ship version
//   - home.html and home-app.js are in PRECACHE_URLS
//   - the new app-icon.svg is precached

const fs = require('fs');
const path = require('path');

const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

describe('sw.js precache (UX-12 Phase 7 PR #13)', () => {
  // Cache version is bumped any time PRECACHE_URLS changes so users get
  // the new asset list. Bumped to v36 when the import-engine lazy-shim
  // was added to the precache (perf audit, Cat A #1).
  test('CACHE_NAME bumped to v36', () => {
    expect(SW).toMatch(/CACHE_NAME\s*=\s*['"]cross-stitch-cache-v36['"]/);
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

  test('PRECACHE_URLS includes the dedicated Creator entry create.html', () => {
    // create.html is the new no-redirect Creator entry that /home links to
    // (separating Creator from index.html’s legacy redirect-gateway role).
    expect(SW).toMatch(/['"]\.\/create\.html['"]/);
  });
});
