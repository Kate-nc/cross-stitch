// tests/homeApp.test.js — Combo A (tab bar + project hub)
//
// Static assertions on home-app.js. The page was reimplemented as a
// tab-bar layout (Projects / Create new / Stash / Stats) with an
// ActiveProjectCard + ProjectsList replacing the old ResumeCard +
// RecentGrid + QuickTiles + StashCard structure. The contract this
// test now enforces:
//   - exposes window.HomeApp and mounts via ReactDOM into #root
//   - greeting hero uses getGreeting()
//   - active card + projects list section ids exist
//   - active project comes from ProjectStorage.getActiveProject and
//     listProjects feeds the all-projects list
//   - per-row Track + Edit buttons go to stitch.html / index.html via
//     activateAndGo (which appends ?from=home)
//   - tile icons come from window.Icons.* — no pictographic emoji or
//     emoji-like glyphs in any string
//
// We don't mount the React tree (Babel transform is not available in
// Jest); we verify the source-level contract only.

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

  test('renders headings for the Combo A sections (h2 / labelled regions)', () => {
    // Active project card + projects list are the two main labelled
    // regions; create + stash + stats live behind tabs and have their
    // own labelled-by ids.
    expect(SRC).toMatch(/home-active-card-title/);
    expect(SRC).toMatch(/home-proj-list-title/);
    expect(SRC).toMatch(/home-create-panel-title/);
    expect(SRC).toMatch(/home-stash-panel-title/);
  });

  test('reads active project from ProjectStorage.getActiveProject', () => {
    expect(SRC).toMatch(/ProjectStorage\.getActiveProject/);
  });

  test('renders ActiveProjectCard with both Resume and Edit CTAs', () => {
    expect(SRC).toMatch(/Resume tracking/);
    expect(SRC).toMatch(/Edit pattern/);
    // Both navigate via activateAndGo (sets active project then goes).
    expect(SRC).toMatch(/activateAndGo\([^,]+,\s*['"]stitch\.html['"]\)/);
    expect(SRC).toMatch(/activateAndGo\([^,]+,\s*['"]create\.html['"]\)/);
  });

  test('lists projects via ProjectStorage.listProjects (all-projects list)', () => {
    expect(SRC).toMatch(/ProjectStorage\.listProjects/);
    // Combo A shows up to 8 projects in the list.
    expect(SRC).toMatch(/slice\(0,\s*\d+\)/);
  });

  test('Create panel exposes new-from-image and new-blank flows', () => {
    // "New from image" uses the in-page file picker, then navigates to
    // home-image-pending; "New from scratch" links straight to
    // create.html?action=new-blank. Both target the dedicated create.html
    // entry-point introduced after the index.html redirect-gateway and
    // Creator-host dual-role kept causing /home -> Creator hand-off bugs.
    expect(SRC).toMatch(/create\.html\?action=home-image-pending&from=home/);
    expect(SRC).toMatch(/create\.html\?action=new-blank/);
  });

  test('cross-tool links append from=home (skip-redirect guard)', () => {
    // activateAndGo() builds the from=home suffix for per-row buttons;
    // the Stash panel uses literal manager.html?from=home links.
    expect(SRC).toMatch(/from=home/);
    expect(SRC).toMatch(/manager\.html\?from=home/);
  });

  test('uses Icons.* for tile icons (no emojis)', () => {
    expect(SRC).toMatch(/Icons\.image/);
    expect(SRC).toMatch(/Icons\.plus/);
  });

  test('contains no emoji or unicode-glyph literals in user-facing strings', () => {
    // Forbidden glyphs per AGENTS.md house rule: pictographic emoji
    // and emoji-like marks (✓ ✗ ⚠ ℹ → ← ▸ ▾ ✕ ✖). The dimension
    // separator U+00D7 (×) inside `sW × sH` is allowed as a maths
    // operator, not a UI glyph — strip those literal usages first.
    const stripped = SRC.replace(/['"][^'"]*\u00D7[^'"]*['"]/g, "''");
    const emojiRe = /[\uD83C-\uDBFF\uDC00-\uDFFF]|[\u2713\u2717\u26A0\u2139\u2192\u2190\u25B8\u25BE\u2715\u2716]/;
    expect(stripped).not.toMatch(emojiRe);
  });

  test('reuses window.timeAgo + window.getGreeting helpers from home-screen.js', () => {
    expect(SRC).toMatch(/window\.timeAgo/);
    expect(SRC).toMatch(/window\.getGreeting/);
  });
});
