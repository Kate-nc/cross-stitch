// tests/swPrecacheSync.test.js — action plan §2D.4
//
// Guards that every local <script src="..."> reference in the five HTML
// entry points is either:
//   (a) listed in sw.js PRECACHE_URLS (cached at install time), or
//   (b) in the explicit RUNTIME_ALLOWLIST below (intentionally cached on
//       first use by the local-asset fetch handler).
//
// Without this guard, adding a new script tag to one of the HTML pages
// silently breaks offline support: first visits still cache the file,
// but any user already running an older SW won't get it until they hit
// it organically. Failing the test forces an explicit decision —
// "precache it" vs "runtime-cache only".

const { loadSource } = require('./_helpers/loadSource');

const HTML_FILES = [
  'home.html',
  'index.html',
  'create.html',
  'stitch.html',
  'manager.html',
];

// Local files referenced from HTML that are intentionally NOT in
// PRECACHE_URLS. The local-asset fetch handler in sw.js caches them on
// first request (stale-while-revalidate). Add a comment explaining why.
const RUNTIME_ALLOWLIST = new Set([
  // Page-level UX helpers — small, lazily exercised, runtime cache is fine.
  'coaching.js',
  'keyboard-utils.js',
  'shortcuts.js',
  'touch-constants.js',
  'useDragMark.js',
  'onboarding-wizard.js',
  'help-drawer.js',
  'toast.js',
  'apply-prefs.js',
  'command-palette.js',
  'preferences-modal.js',
  'project-library.js',
  'insights-engine.js',
  // Shared partials — small React components used across pages.
  'components/PartialStitchThumb.js',
  'components/Overlay.js',
  // Creator-only modal mounted from manager.html for bulk-add flow.
  'creator/BulkAddModal.js',
]);

function localScriptsIn(html) {
  // <script ... src="...">  — local relative paths only; skip http(s) and
  // skip leading './' for normalisation. Capture even when defer / type
  // attributes are present.
  const out = new Set();
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+\.js)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const src = m[1];
    if (/^https?:/i.test(src)) continue;
    out.add(src.replace(/^\.\//, ''));
  }
  return out;
}

describe('sw.js PRECACHE_URLS sync (action plan §2D.4)', () => {
  const SW = loadSource('sw.js');
  const precached = new Set();
  const reUrl = /['"]\.\/([^'"]+\.js)['"]/g;
  let m;
  while ((m = reUrl.exec(SW)) !== null) precached.add(m[1]);

  for (const file of HTML_FILES) {
    test(`${file}: every local script src is precached or runtime-allowlisted`, () => {
      const html = loadSource(file);
      const refs = localScriptsIn(html);
      const missing = [];
      for (const ref of refs) {
        if (precached.has(ref)) continue;
        if (RUNTIME_ALLOWLIST.has(ref)) continue;
        missing.push(ref);
      }
      // Surface the missing list in the failure message so the fix is obvious.
      expect({ file, missing }).toEqual({ file, missing: [] });
    });
  }

  test('RUNTIME_ALLOWLIST entries are still referenced by some HTML page', () => {
    // Prevents the allowlist from accumulating dead entries when the
    // referenced file is later removed from every HTML page.
    const allRefs = new Set();
    for (const file of HTML_FILES) {
      for (const ref of localScriptsIn(loadSource(file))) allRefs.add(ref);
    }
    const dead = [];
    for (const ref of RUNTIME_ALLOWLIST) {
      if (!allRefs.has(ref)) dead.push(ref);
    }
    expect(dead).toEqual([]);
  });
});
