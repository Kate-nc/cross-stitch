// tests/homeApp.test.js — Home, "Ask what they have" layout
//
// Static assertions on home-app.js (reports/home-redesign-proposals.md,
// Option 1). The contract this test enforces:
//   - exposes window.HomeApp and mounts via ReactDOM into #root
//   - first visit: a hero saying what stitchx is, the three intent cards,
//     "Which files work?", the practice pattern and "How stitchx fits together"
//   - returning: a Continue card, project cards with progress read from the
//     library rows, a More menu per project, filters and "Show all"
//   - Track / Edit go to stitch.html / create.html via activateAndGo
//   - icons come from window.Icons.*, with no emoji or emoji-like glyphs
//
// We don't mount the React tree (no Babel transform in Jest); we verify the
// source-level contract only. Behaviour is covered by the e2e specs
// (tests/e2e/home-create-three-paths.spec.js, first-use-workflows.spec.js).

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

  test('first visit says what stitchx is, with the free / on-device promise', () => {
    expect(SRC).toMatch(/Make, follow and track cross-stitch patterns\./);
    expect(SRC).toMatch(/Free, no account needed/);
    expect(SRC).toMatch(/Saves automatically on this device/);
    expect(SRC).toMatch(/How stitchx fits together/);
  });

  test('the three start cards are named after what the user has', () => {
    expect(SRC).toMatch(/What are you starting with\?/);
    expect(SRC).toMatch(/A pattern I already have/);
    expect(SRC).toMatch(/A photo or picture/);
    expect(SRC).toMatch(/A blank canvas/);
    // The onboarding hooks stay on the two picker cards.
    expect(SRC).toMatch(/onboard: 'home-import-chart'/);
    expect(SRC).toMatch(/onboard: 'home-from-image'/);
  });

  test('formats and the printed-chart caveat are explained once, behind "Which files work?"', () => {
    expect(SRC).toMatch(/Which files work\?/);
    expect((SRC.match(/can’t be read/g) || []).length).toBe(2); // the panel and the photo question
  });

  test('labelled regions exist for the main sections', () => {
    expect(SRC).toMatch(/home-hero-title/);
    expect(SRC).toMatch(/home-start-title/);
    expect(SRC).toMatch(/home-continue-title/);
    expect(SRC).toMatch(/home-proj-list-title/);
  });

  test('reads active project from ProjectStorage.getActiveProject', () => {
    expect(SRC).toMatch(/ProjectStorage\.getActiveProject/);
  });

  test('Continue card has one primary action, Edit, and a More menu', () => {
    expect(SRC).toMatch(/function ContinueCard/);
    expect(SRC).toMatch(/Continue stitching/);
    expect(SRC).toMatch(/Edit pattern/);
    // Both navigate via activateAndGo (sets active project then goes).
    expect(SRC).toMatch(/activateAndGo\([^,]+,\s*['"]stitch\.html['"]\)/);
    expect(SRC).toMatch(/activateAndGo\([^,]+,\s*['"]create\.html['"]\)/);
  });

  test('rare actions (Export, Update chart, details) live in a More menu', () => {
    expect(SRC).toMatch(/function HomeMenu/);
    expect(SRC).toMatch(/role: 'menu'/);
    expect(SRC).toMatch(/label: 'Update chart', hint: 'Re-import a corrected version of this chart'/);
    expect(SRC).toMatch(/label: 'Export or print'/);
  });

  test('the main action is named for the project state', () => {
    expect(SRC).toMatch(/if \(status === 'new'\) return 'Start stitching';/);
    expect(SRC).toMatch(/if \(status === 'done'\) return 'Open in Tracker';/);
  });

  test('project cards read progress and size from the library rows (walkthrough F13)', () => {
    expect(SRC).toMatch(/ProjectStorage\.listProjects/);
    expect(SRC).toMatch(/typeof p\.pct === 'number'/);
    expect(SRC).toMatch(/p\.dimensions && p\.dimensions\.width/);
  });

  test('every project is reachable: filters and Show all, no silent cap (F14)', () => {
    expect(SRC).toMatch(/var PAGE = 12;/);
    expect(SRC).toMatch(/'Show all ' \+ total \+ ' projects'/);
    expect(SRC).toMatch(/In progress/);
    expect(SRC).toMatch(/Not started/);
  });

  test('pattern previews come from PartialStitchThumb, fetched per card', () => {
    expect(SRC).toMatch(/window\.PartialStitchThumb/);
    expect(SRC).toMatch(/ProjectStorage\.get\(id\)/);
  });

  test('start cards expose the picture, chart and blank flows', () => {
    expect(SRC).toMatch(/create\.html\?action=home-image-pending&from=home/);
    expect(SRC).toMatch(/create\.html\?action=new-blank/);
  });

  test('a picture whose purpose is unclear gets one question', () => {
    expect(SRC).toMatch(/function PhotoQuestion/);
    expect(SRC).toMatch(/What’s in this picture\?/);
    expect(SRC).toMatch(/if \(kind === 'image' && tile !== 'photo'\) \{ setAskFile\(file\); return; \}/);
  });

  test('cross-tool links append from=home (skip-redirect guard)', () => {
    expect(SRC).toMatch(/from=home/);
  });

  test('uses Icons.* for icons (no emojis)', () => {
    expect(SRC).toMatch(/window\.Icons\[name\]/);
    expect(SRC).toMatch(/icon: 'image'/);
    expect(SRC).toMatch(/icon: 'pencil'/);
    expect(SRC).toMatch(/icon: 'document'/);
  });

  test('contains no emoji or unicode-glyph literals in user-facing strings', () => {
    // Forbidden glyphs per AGENTS.md house rule: pictographic emoji
    // and emoji-like marks (✓ ✗ ⚠ ℹ → ← ▸ ▾ ✕ ✖). The dimension
    // separator U+00D7 (×) inside `sW × sH` is allowed as a maths
    // operator, not a UI glyph — strip those literal usages first.
    const stripped = SRC.replace(/['"][^'"]*×[^'"]*['"]/g, "''");
    const emojiRe = /[\uD83C-􏰀-\uDFFF]|[✓✗⚠ℹ→←▸▾✕✖]/;
    expect(stripped).not.toMatch(emojiRe);
  });

  test('reuses window.timeAgo when home-screen.js is loaded', () => {
    expect(SRC).toMatch(/window\.timeAgo/);
  });

  test('ready-to-start projects come from the manager library via openManagerDB', () => {
    // Patterns are stored under the "patterns" key in the manager_state
    // store; StashBridge has no public read for them so /home reads the
    // raw IDB row. Opened with the canonical versionless
    // window.openManagerDB() helper (tests/managerDbOpener.test.js).
    expect(SRC).toMatch(/ProjectStorage\.getProjectsReadyToStart/);
    expect(SRC).toMatch(/window\.openManagerDB\(\)/);
    expect(SRC).toMatch(/manager_state/);
    expect(SRC).toMatch(/store\.get\(['"]patterns['"]\)/);
    expect(SRC).toMatch(/linkedProjectId/);
  });

  test('live-refreshes on cross-app data events', () => {
    // Without these listeners /home shows stale numbers after a backup
    // restore, after a tracker save, or when the user comes back from
    // another tab where they edited the manager.
    expect(SRC).toMatch(/cs:projectsChanged/);
    expect(SRC).toMatch(/cs:backupRestored/);
    expect(SRC).toMatch(/cs:patternsChanged/);
    expect(SRC).toMatch(/cs:stashChanged/);
    expect(SRC).toMatch(/visibilitychange/);
  });

  test('old ?tab= links scroll to the matching section instead of a tab', () => {
    expect(SRC).toMatch(/t === 'create' \? 'home-start-title'/);
  });

  test('the practice pattern stays memory-only', () => {
    expect(SRC).toMatch(/Deliberately memory-only: practice never enters project, session, sync or stash storage\./);
    const sample = SRC.slice(SRC.indexOf('function SampleProject'), SRC.indexOf('function PracticeCard'));
    expect(sample).not.toMatch(/ProjectStorage|BlobStore|StashBridge|localStorage|sessionStorage/);
  });
});
