// tests/landingRedirect.test.js — UX-12 Phase 7 PR #13
// Verifies that index.html, stitch.html, and manager.html each contain the
// inline redirect-to-/home guard, and that the guard fires only when no
// active project is stored.

const fs = require('fs');
const path = require('path');

const FILES = ['index.html', 'stitch.html', 'manager.html'];

describe('per-tool /home redirect snippet', () => {
  for (const file of FILES) {
    describe(file, () => {
      const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

      test('reads crossstitch_active_project from localStorage', () => {
        expect(src).toMatch(/localStorage\.getItem\(['"]crossstitch_active_project['"]\)/);
      });

      test('redirects to home.html only when no active project', () => {
        // The guard pattern: if (!active) { ... location.replace('home.html') ... }
        expect(src).toMatch(/if\s*\(\s*!\s*active\s*\)/);
        expect(src).toMatch(/location\.replace\(['"]home\.html['"]\)/);
      });

      test('skips redirect when ?from=home or ?action= is present', () => {
        expect(src).toMatch(/from=home/);
        expect(src).toMatch(/action=/);
      });

      test('redirect snippet sits before the heavy script loads', () => {
        const redirectIdx = src.indexOf("location.replace('home.html')");
        const reactIdx = src.indexOf('react.production.min.js');
        // Accept either ordering when the snippet is first script (reactIdx > redirectIdx)
        // or, if a CDN preconnect happens to come earlier, the snippet must still
        // appear before the React load.
        expect(redirectIdx).toBeGreaterThan(0);
        expect(redirectIdx).toBeLessThan(reactIdx === -1 ? Infinity : reactIdx);
      });
    });
  }
});
