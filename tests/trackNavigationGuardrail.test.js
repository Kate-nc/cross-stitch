/* tests/trackNavigationGuardrail.test.js — regression guard for
 * "clicking Track from home/stash doesn't load the pattern in the Tracker"
 * ════════════════════════════════════════════════════════════════════════
 *
 * Root cause: the navigation from home.html / manager.html to stitch.html
 * relied entirely on the localStorage active-project pointer being intact
 * when the tracker's loading useEffect ran.  Two independent races could
 * silently clear that pointer:
 *
 *   1. The home-app.js self-heal: if cs:projectsChanged fired before
 *      window.__navigatingAway was set and an in-flight IDB read returned
 *      null (e.g. the project had no .pattern), clearActiveProject() was
 *      called just as the page was unloading.
 *
 *   2. manager-app.js Track/Edit buttons never set window.__navigatingAway,
 *      leaving an open window for any async post-save listener to clear the
 *      pointer before stitch.html loaded.
 *
 * Fix: pass ?id=<projectId> in the navigation URL as a belt-and-suspenders
 * fallback.  stitch.html's inline guard rewrites the localStorage pointer
 * from the URL param before any other script runs.  TrackerApp's loading
 * useEffect also repairs it from URLSearchParams as a second fallback.
 * manager-app.js now sets window.__navigatingAway = true before navigation.
 *
 * These tests are source-content assertions (no IndexedDB / React / page
 * navigation required) because those runtime paths are exercised by the
 * Playwright integration tests.  The checks pin the contract so a future
 * refactor can't silently drop the URL-param plumbing.
 * ════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const homeApp     = fs.readFileSync(path.join(__dirname, '..', 'home-app.js'),      'utf8');
const managerApp  = fs.readFileSync(path.join(__dirname, '..', 'manager-app.js'),   'utf8');
const stitchHtml  = fs.readFileSync(path.join(__dirname, '..', 'stitch.html'),      'utf8');
const trackerApp  = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'),   'utf8');
const createHtml  = fs.readFileSync(path.join(__dirname, '..', 'create.html'),      'utf8');
const indexHtml   = fs.readFileSync(path.join(__dirname, '..', 'index.html'),       'utf8');
const headerJs    = fs.readFileSync(path.join(__dirname, '..', 'header.js'),        'utf8');
const helpDrawer  = fs.readFileSync(path.join(__dirname, '..', 'help-drawer.js'),   'utf8');
const homeScreen  = fs.readFileSync(path.join(__dirname, '..', 'home-screen.js'),   'utf8');

// ── home-app.js ─────────────────────────────────────────────────────────────
describe('home-app activateAndGo (Track / Edit navigation)', () => {
  test('activateAndGo appends ?id=<projectId> to the destination URL', () => {
    // The id param is the primary belt-and-suspenders mechanism: stitch.html
    // reads it and writes the active-project pointer before any other script.
    expect(homeApp).toMatch(/from=home&id=.*encodeURIComponent\(id\)/);
  });

  test('activateAndGo sets window.__navigatingAway before navigating', () => {
    // Prevent home-app.js's self-heal from clearing the fresh pointer while
    // an in-flight IDB read is still pending.
    const block = homeApp.match(
      /function activateAndGo[\s\S]*?window\.location\.href\s*=\s*href/
    );
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/window\.__navigatingAway\s*=\s*true/);
    // __navigatingAway must be set BEFORE window.location.href is assigned.
    // Use indexOf on '= true' and '= href' to avoid matching comment occurrences.
    const navIdx   = block[0].indexOf('window.location.href = href');
    const guardIdx = block[0].indexOf('window.__navigatingAway = true');
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    expect(navIdx).toBeGreaterThanOrEqual(0);
    expect(guardIdx).toBeLessThan(navIdx);
  });
});

// ── manager-app.js ───────────────────────────────────────────────────────────
describe('manager-app Track / Edit navigation', () => {
  test('inline Track button (storedProjects) appends &id= and sets __navigatingAway', () => {
    // The inline Track button at the "Saved Cross-Stitch Projects" section.
    // It must not navigate without the id param and the navigating-away guard.
    expect(managerApp).toMatch(
      /window\.__navigatingAway\s*=\s*true.*stitch\.html\?from=home.*id=.*encodeURIComponent/s
    );
  });

  test('inline Edit button (storedProjects) appends &id= and sets __navigatingAway', () => {
    // The "Edit" button that navigates to create.html should also carry the
    // id param so the creator can heal the active-project pointer.
    expect(managerApp).toMatch(
      /window\.__navigatingAway\s*=\s*true.*create\.html\?from=home.*id=.*encodeURIComponent/s
    );
  });

  test('PatternModal handleTrack sets __navigatingAway before navigating to stitch.html', () => {
    // The pattern-library modal Track button (for linkedProjectId entries).
    const block = managerApp.match(
      /function handleTrack\(\)[\s\S]*?window\.location\.href\s*=\s*["']stitch\.html/
    );
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/window\.__navigatingAway\s*=\s*true/);
  });

  test('PatternModal handleTrack appends &id=<linkedProjectId> to the URL', () => {
    // Extend match to capture the full navigation statement including the
    // encodeURIComponent(linkedProjectId) tail.
    // Use the full file string: find handleTrack, then check the window.location.href assignment line.
    const fnStart = managerApp.indexOf('function handleTrack()');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = managerApp.indexOf('\n  }', fnStart + 10);
    const fnBody = managerApp.slice(fnStart, fnEnd + 10);
    expect(fnBody).toMatch(/window\.location\.href.*&id=.*encodeURIComponent.*linkedProjectId/);
  });
});

// ── stitch.html redirect guard ───────────────────────────────────────────────
describe('stitch.html redirect guard — URL id param healing', () => {
  test('stitch.html reads ?id= param and writes it as the active-project pointer', () => {
    // The guard must extract the id from the URL and write it to localStorage
    // BEFORE the redirect check, so a race-cleared pointer is always healed.
    expect(stitchHtml).toMatch(/idMatch.*=.*qs\.match.*id=/);
    expect(stitchHtml).toMatch(/localStorage\.setItem\('crossstitch_active_project',\s*urlId\)/);
  });

  test('stitch.html validates the id param against the proj_ prefix before writing', () => {
    // Only write valid proj_* IDs to prevent arbitrary strings being stored.
    expect(stitchHtml).toMatch(/\/\^proj_\/\.test\(urlId\)/);
  });
});

// ── tracker-app.js loading useEffect ────────────────────────────────────────
describe('TrackerApp loading useEffect — URL id param fallback', () => {
  test('tracker-app reads URLSearchParams id param before getActiveProject()', () => {
    // The URL-param fallback runs synchronously before the microtask that calls
    // getActiveProject(), so the pointer is always correct regardless of race.
    const block = trackerApp.match(
      /URLSearchParams\(window\.location\.search\)[\s\S]*?Promise\.resolve\(\)\.then/
    );
    expect(block).not.toBeNull();
  });

  test('tracker-app validates the URL id param against proj_ prefix', () => {
    expect(trackerApp).toMatch(/\/\^proj_\/\.test\(_urlId\)/);
  });

  test('tracker-app calls setActiveProject with the URL id when pointer is missing or wrong', () => {
    expect(trackerApp).toMatch(/ProjectStorage\.setActiveProject.*_urlId/);
  });
});

// ── incomingProject path — consistent error surface ──────────────────────────
describe('TrackerApp incomingProject path — consistent error handling', () => {
  test('incomingProject id path checks p.pattern before calling processLoadedProject', () => {
    // Must check p && p.pattern (not just p) so a patternless project shows
    // a toast rather than silently rendering an empty canvas.
    const block = trackerApp.match(
      /else if\(ip\.id\)\{ProjectStorage\.get[\s\S]*?processLoadedProject/
    );
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/p\.pattern/);
    expect(block[0]).not.toMatch(/if\(p\)\{processLoadedProject/);
  });

  test('incomingProject id path shows a toast when project exists but has no pattern', () => {
    // Users navigating from the stats/unified view to a patternless project
    // should see a clear message, not a silent empty canvas.
    const block = trackerApp.match(
      /incomingProject.*found in IDB but has no pattern|No pattern found.*library/s
    );
    expect(block).not.toBeNull();
  });
});

// ── manager-app.js ProjectLibrary card navigation ────────────────────────────
describe('manager-app ProjectLibrary onOpenProject card navigation', () => {
  test('onOpenProject sets window.__navigatingAway before navigating', () => {
    // The "Your Projects" panel uses ProjectLibrary > MultiProjectDashboard.
    // Without __navigatingAway the auto-save listener can clear the pointer.
    const fnStart = managerApp.indexOf('onOpenProject: (proj, target) =>');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd   = managerApp.indexOf('},', fnStart + 10);
    const fnBody  = managerApp.slice(fnStart, fnEnd + 2);
    expect(fnBody).toMatch(/window\.__navigatingAway\s*=\s*true/);
  });

  test('onOpenProject appends &id=encodeURIComponent(proj.id) to the URL', () => {
    const fnStart = managerApp.indexOf('onOpenProject: (proj, target) =>');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd   = managerApp.indexOf('},', fnStart + 10);
    const fnBody  = managerApp.slice(fnStart, fnEnd + 2);
    expect(fnBody).toMatch(/&id=.*encodeURIComponent\(proj\.id\)/);
  });

  test('onOpenProject sets __navigatingAway BEFORE assigning window.location.href', () => {
    const fnStart = managerApp.indexOf('onOpenProject: (proj, target) =>');
    const fnEnd   = managerApp.indexOf('},', fnStart + 10);
    const fnBody  = managerApp.slice(fnStart, fnEnd + 2);
    const guardIdx = fnBody.indexOf('window.__navigatingAway = true');
    const navIdx   = fnBody.indexOf('window.location.href');
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    expect(navIdx).toBeGreaterThanOrEqual(0);
    expect(guardIdx).toBeLessThan(navIdx);
  });
});

// ── create.html startup guard ────────────────────────────────────────────────
describe('create.html startup — URL id param healing', () => {
  test('create.html reads ?id= param and writes it as the active-project pointer', () => {
    // Mirrors the same belt-and-suspenders guard in stitch.html.
    // Must run before any Babel script so the Creator always loads the right project.
    expect(createHtml).toMatch(/idMatch.*=.*qs\.match.*id=/);
    expect(createHtml).toMatch(/localStorage\.setItem\('crossstitch_active_project',\s*urlId\)/);
  });

  test('create.html validates the id param against the proj_ prefix before writing', () => {
    // Prevent arbitrary strings from being stored as the active pointer.
    expect(createHtml).toMatch(/\/\^proj_\/\.test\(urlId\)/);
  });
});

// ── index.html startup guard ─────────────────────────────────────────────────
describe('index.html startup — URL id param healing (legacy creator URL)', () => {
  test('index.html reads ?id= param before the redirect-to-home check', () => {
    // index.html is the legacy creator URL; it must heal the pointer from the
    // URL before deciding whether to redirect to home.html.
    expect(indexHtml).toMatch(/idMatch.*=.*qs\.match.*id=/);
    expect(indexHtml).toMatch(/localStorage\.setItem\('crossstitch_active_project',\s*urlId\)/);
  });

  test('index.html validates the id param against the proj_ prefix before writing', () => {
    expect(indexHtml).toMatch(/\/\^proj_\/\.test\(urlId\)/);
  });
});

// ── header.js project switcher ────────────────────────────────────────────────
describe('header.js pickProject — project switcher navigation', () => {
  test('pickProject appends ?id=encodeURIComponent(id) to stitch.html URL', () => {
    // The header project-switcher dropdown calls setActiveProject then navigates.
    // The same cs:projectsChanged race applies, so ?id= is required.
    expect(headerJs).toMatch(/stitch\.html\?id=.*encodeURIComponent\(id\)/);
  });

  test('pickProject sets window.__navigatingAway before assigning location.href', () => {
    const block = headerJs.match(
      /function pickProject\(id\)[\s\S]*?window\.location\.href/
    );
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/window\.__navigatingAway\s*=\s*true/);
    const guardIdx = block[0].indexOf('window.__navigatingAway = true');
    const navIdx   = block[0].indexOf('window.location.href');
    expect(guardIdx).toBeLessThan(navIdx);
  });
});

// ── help-drawer.js sample project navigation ─────────────────────────────────
describe('help-drawer.js sample project navigation', () => {
  test('sample project navigation sets window.__navigatingAway before location.href', () => {
    // After saving the sample, the handler navigates to stitch.html.
    // __navigatingAway prevents any cs:projectsChanged listener from clearing
    // the just-set active-project pointer before the new page loads.
    const block = helpDrawer.match(
      /ProjectStorage\.save\(p\)\.then[\s\S]*?window\.location\.href/
    );
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/window\.__navigatingAway\s*=\s*true/);
  });

  test('sample project navigation appends ?id= to the stitch.html URL', () => {
    expect(helpDrawer).toMatch(/stitch\.html\?id=.*encodeURIComponent\(p\.id\)/);
  });
});

// ── getActiveProject fallback path — legacy project.p field ──────────────────
describe('TrackerApp getActiveProject fallback path — legacy p field', () => {
  test('getActiveProject fallback accepts project.p as well as project.pattern', () => {
    // Projects saved from URL-shared (#p=...) patterns are stored with a
    // compressed `p` field instead of `pattern`. The fallback load path must
    // check both so those projects don't silently show "No pattern found".
    const block = trackerApp.match(
      /ProjectStorage\.getActiveProject\(\)\.then[\s\S]*?processLoadedProject/
    );
    expect(block).not.toBeNull();
    // Must accept both fields
    expect(block[0]).toMatch(/project\.pattern\s*\|\|\s*project\.p/);
  });

  test('project picker onPick accepts project.p as well as project.pattern', () => {
    // Inline project picker (opened from within the tracker) must also
    // accept the legacy p field when switching to a URL-shared project.
    const block = trackerApp.match(
      /onPick[\s\S]*?p\.pattern\s*\|\|\s*p\.p/
    );
    expect(block).not.toBeNull();
  });

  test('project rail onPickProject accepts project.p as well as project.pattern', () => {
    const block = trackerApp.match(
      /onPickProject[\s\S]*?p\.pattern\s*\|\|\s*p\.p/
    );
    expect(block).not.toBeNull();
  });
});

// ── home-screen.js sample project navigation ─────────────────────────────────
describe('home-screen.js sample project navigation', () => {
  test('sample project navigation sets window.__navigatingAway before location.href', () => {
    const block = homeScreen.match(
      /ProjectStorage\.save\(sample\)\.then[\s\S]*?window\.location\.href/
    );
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/window\.__navigatingAway\s*=\s*true/);
  });

  test('sample project navigation appends ?id= to the stitch.html URL', () => {
    expect(homeScreen).toMatch(/stitch\.html\?id=.*encodeURIComponent\(/);
  });
});
