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
  // was added to the precache (perf audit, Cat A #1). Bumped to v37 when
  // the brand catalogues were defer-loaded / removed from home.html
  // (perf audit, Cat D — quick wins #2). Bumped to v38 when the
  // ImportWizard bundle was code-split out of creator/bundle.js
  // (perf audit, Cat C — quick wins #3). Bumped to v39 when Cache-Control
  // headers and CSS network-first strategy were added. Bumped to v40 when
  // precache requests were upgraded to { cache: 'no-cache' } for
  // defence-in-depth against the browser HTTP cache during SW install.
  // Bumped to v41 when version.js was added to the precache.
  // Bumped to v42 when the navigation offline fallback was switched
  // from index.html to home.html (Workshop landing page).
  // Bumped to v43 when components.js was split into core + components-stats.js
  // (action plan headline H1 = 2A.1) so home/manager skip the stats half.
  // Bumped to v44 when pdf.worker.min.js (~1 MB) and assets/fontkit.umd.min.js
  // were dropped from PRECACHE_URLS (action plan headline H2 = 2A.3); both
  // are runtime-cached on first use so the SW install stays light.
  test('CACHE_NAME bumped to v45', () => {
    expect(SW).toMatch(/CACHE_NAME\s*=\s*['"]cross-stitch-cache-v45['"]/);
  });

  test('PRECACHE_URLS does NOT include heavy lazy vendor blobs', () => {
    // Guard for action plan H2 (2A.3): keep pdf.worker.min.js and
    // fontkit.umd.min.js out of the install-time precache. They are still
    // cached at runtime by the local-asset fetch handler in sw.js.
    expect(SW).not.toMatch(/['"]\.\/pdf\.worker\.min\.js['"]/);
    expect(SW).not.toMatch(/['"]\.\/assets\/fontkit\.umd\.min\.js['"]/);
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
