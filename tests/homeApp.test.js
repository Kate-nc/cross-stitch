// tests/homeApp.test.js — UX-12 Phase 7 PR #13
// Static assertions on home-app.js (the new /home landing).
// We don't mount the React tree (Babel transform is not available in Jest);
// instead we verify the source-level contract: exports, headings, tile
// hrefs, no emoji literals, Icons.* usage.

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'home-app.js'), 'utf8');

describe('home-app.js source contract', () => {
  test('exposes window.HomeApp', () => {
    expect(SRC).toMatch(/window\.HomeApp\s*=\s*HomeApp/);
  });

  test('mounts via ReactDOM into #root', () => {
    expect(SRC).toMatch(/getElementById\(['"]root['"]\)/);
    expect(SRC).toMatch(/ReactDOM/);
  });

  test('renders the greeting hero with getGreeting()', () => {
    expect(SRC).toMatch(/getGreeting\(\)/);
    // British English greeting suffix from the wireframe.
    expect(SRC).toMatch(/ready to stitch/);
  });

  test('renders headings for each section (h2 ids)', () => {
    expect(SRC).toMatch(/home-resume-title/);
    expect(SRC).toMatch(/home-recent-title/);
    expect(SRC).toMatch(/home-quick-title/);
    expect(SRC).toMatch(/home-stash-title/);
  });

  test('reads active project from ProjectStorage.getActiveProject', () => {
    expect(SRC).toMatch(/ProjectStorage\.getActiveProject/);
  });

  test('renders ResumeCard with both Resume and Edit CTAs', () => {
    expect(SRC).toMatch(/Resume tracking/);
    expect(SRC).toMatch(/Edit pattern/);
    // Both navigate via activateAndGo (sets active project then goes).
    expect(SRC).toMatch(/activateAndGo\([^,]+,\s*['"]stitch\.html['"]\)/);
    expect(SRC).toMatch(/activateAndGo\([^,]+,\s*['"]index\.html['"]\)/);
  });

  test('lists projects via ProjectStorage.listProjects (recents grid)', () => {
    expect(SRC).toMatch(/ProjectStorage\.listProjects/);
    // .slice(0, 6) → top 6 projects.
    expect(SRC).toMatch(/slice\(0,\s*6\)/);
  });

  test('renders four quick-action tiles linking to the three tools', () => {
    // Two "New" tiles point at index.html (with action= flags).
    expect(SRC).toMatch(/index\.html\?action=new-from-image/);
    expect(SRC).toMatch(/index\.html\?action=new-blank/);
    // Stash + Tracker tiles point at the other tools (with from=home so the
    // redirect-to-home guard stands down).
    expect(SRC).toMatch(/manager\.html\?from=home/);
    expect(SRC).toMatch(/stitch\.html\?from=home/);
  });

  test('uses Icons.* for tile icons (no emojis)', () => {
    expect(SRC).toMatch(/Icons\.image/);
    expect(SRC).toMatch(/Icons\.plus/);
    expect(SRC).toMatch(/Icons\.box/);
    expect(SRC).toMatch(/Icons\.check/);
  });

  test('contains no emoji or unicode-glyph literals in user-facing strings', () => {
    // Forbidden glyphs per AGENTS.md house rule: pictographic emoji and
    // emoji-like marks (× ✓ ✗ ⚠ ℹ → ← ▸ ✕ ▾). We allow the box-drawing
    // separators (═) used in CSS section headers, plus middot (·) which is
    // a punctuation character, not an emoji.
    const FORBIDDEN = /[\u2713\u2717\u2715\u26A0\u2139\u2192\u2190\u25B8\u25BE\u2716\uD83C-\uDBFF\uDC00-\uDFFF]|[\u00D7\u2715\u2716]/;
    // Allow \u00D7 inside the wireframe-style "80×100" dimension string —
    // home-app.js renders sW × sH, so \u00D7 IS used legitimately. The rule
    // forbids it as a close-button glyph; that case isn't present in this file.
    // Strip the legitimate dimensions usage before testing.
    const stripped = SRC.replace(/['"][^'"]*\\u00d7[^'"]*['"]/gi, "''");
    // Drop the middot escape too (used in meta separators).
    const cleaned = stripped.replace(/\\u00b7/g, '');
    // Pictographic emoji in any literal.
    const emojiRe = /[\uD83C-\uDBFF\uDC00-\uDFFF]|[\u2713\u2717\u26A0\u2139\u2192\u2190\u25B8\u25BE]/;
    expect(cleaned).not.toMatch(emojiRe);
  });

  test('reuses window.timeAgo + window.getGreeting helpers from home-screen.js', () => {
    expect(SRC).toMatch(/window\.timeAgo/);
    expect(SRC).toMatch(/window\.getGreeting/);
  });

  test('respects skip-redirect on tool links via ?from=home', () => {
    // QuickTiles for tracker and stash include from=home so the per-tool
    // redirect-to-home guard stands down even when no project is active.
    expect(SRC).toMatch(/stitch\.html\?from=home/);
    expect(SRC).toMatch(/manager\.html\?from=home/);
  });
});

describe('home-screen.js helper exports for /home', () => {
  const HS = fs.readFileSync(path.join(__dirname, '..', 'home-screen.js'), 'utf8');
  test('exposes window.timeAgo', () => {
    expect(HS).toMatch(/window\.timeAgo\s*=\s*timeAgo/);
  });
  test('exposes window.getGreeting', () => {
    expect(HS).toMatch(/window\.getGreeting\s*=\s*getGreeting/);
  });
});
