// Phase 1 — Tracker left sidebar scaffold (Highlight / View / Session).
// tracker-app.js is JSX (compiled in-browser by Babel) so we cannot eval it
// in Node. We assert on the source text that the sidebar component is wired
// correctly and that styles.css carries the matching rules. This is the
// same low-tech approach used by tests/editModeBanner.test.js.

const fs = require('fs');
const path = require('path');

const trackerSrc = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
const stylesSrc  = fs.readFileSync(path.join(__dirname, '..', 'styles.css'),    'utf8');
const prefsSrc   = fs.readFileSync(path.join(__dirname, '..', 'user-prefs.js'), 'utf8');
const iconsSrc   = fs.readFileSync(path.join(__dirname, '..', 'icons.js'),      'utf8');

describe('Tracker left sidebar (toolbar-rework phase 1)', () => {
  test('UserPrefs declares the two new sidebar keys with sensible defaults', () => {
    // Touch-1 H-1: tri-state mode replaces the boolean. Both keys are kept
    // for the migration window so existing user prefs still load.
    expect(prefsSrc).toMatch(/trackerLeftSidebarOpen:\s*false/);
    expect(prefsSrc).toMatch(/trackerLeftSidebarMode:\s*"hidden"/);
    expect(prefsSrc).toMatch(/trackerLeftSidebarTab:\s*"highlight"/);
  });

  test('icons.js defines the hamburger menu icon', () => {
    expect(iconsSrc).toMatch(/menu:\s*function/);
  });

  test('tracker registers leftSidebarMode / leftSidebarTab state', () => {
    expect(trackerSrc).toMatch(/leftSidebarMode,\s*setLeftSidebarMode/);
    expect(trackerSrc).toMatch(/leftSidebarTab,\s*setLeftSidebarTab/);
    // Initialised from localStorage directly (so key presence can be detected),
    // with migration from the legacy boolean, and UserPrefs tab key
    expect(trackerSrc).toMatch(/localStorage\.getItem\(["']cs_pref_trackerLeftSidebarMode["']\)/);
    expect(trackerSrc).toMatch(/localStorage\.getItem\(["']cs_pref_trackerLeftSidebarOpen["']\)/);
    expect(trackerSrc).toMatch(/UserPrefs.*get\("trackerLeftSidebarTab"\)/);
    // Persisted back via setter
    expect(trackerSrc).toMatch(/UserPrefs.*set\("trackerLeftSidebarMode"/);
    expect(trackerSrc).toMatch(/UserPrefs.*set\("trackerLeftSidebarTab"/);
  });

  test('toolbar pill exposes a hamburger button bound to the cycle helper', () => {
    expect(trackerSrc).toMatch(/className="tracker-hamburger"/);
    expect(trackerSrc).toMatch(/onClick=\{cycleLeftSidebar\}/);
    expect(trackerSrc).toMatch(/Icons\.menu\(\)/);
  });

  test('lpanel renders for both rail and open modes', () => {
    expect(trackerSrc).toMatch(/leftSidebarMode==="rail"\s*&&\s*<aside className="lpanel lpanel--rail"/);
    expect(trackerSrc).toMatch(/leftSidebarMode==="open"\s*&&\s*<div className=\{?"lpanel lpanel--open/);
  });

  test('lpanel exposes Highlight, View, and Session tabs', () => {
    // Tab definitions live in a single map literal
    expect(trackerSrc).toMatch(/\["highlight","Highlight"\]/);
    expect(trackerSrc).toMatch(/\["view","View"\]/);
    expect(trackerSrc).toMatch(/\["session","Session"\]/);
  });

  test('Highlight tab wires the same setters as the legacy controls', () => {
    // The Highlight panel must still call setHighlightMode, setFocusColour,
    // setCountingAidsEnabled, etc. so existing state stays in sync.
    const hlBlock = trackerSrc.split('leftSidebarTab==="highlight"')[1] || '';
    expect(hlBlock).toMatch(/setHighlightMode\(/);
    expect(hlBlock).toMatch(/setFocusColour\(/);
    expect(hlBlock).toMatch(/setCountingAidsEnabled\(/);
    expect(hlBlock).toMatch(/setHighlightSkipDone\(/);
  });

  test('View tab wires zoom, view mode, lock-detail and layers', () => {
    const viewBlock = trackerSrc.split('leftSidebarTab==="view"')[1] || '';
    expect(viewBlock).toMatch(/setStitchView\(/);
    expect(viewBlock).toMatch(/setStitchZoom\(/);
    expect(viewBlock).toMatch(/setLockDetailLevel\(/);
    expect(viewBlock).toMatch(/setLayerVis\(/);
  });

  test('Session tab wires explicit-session start/end through existing setters', () => {
    const sessBlock = trackerSrc.split('leftSidebarTab==="session"')[1] || '';
    expect(sessBlock).toMatch(/setSessionConfigOpen\(true\)/);
    expect(sessBlock).toMatch(/setExplicitSession\(null\)/);
  });

  test('styles.css ships the matching .lpanel rules', () => {
    expect(stylesSrc).toMatch(/\.lpanel\s*\{/);
    expect(stylesSrc).toMatch(/\.lp-tabs\s*\{/);
    expect(stylesSrc).toMatch(/\.lp-tab\s*\{/);
    expect(stylesSrc).toMatch(/\.lp-section\s*\{/);
    expect(stylesSrc).toMatch(/\.lp-heading\s*\{/);
    expect(stylesSrc).toMatch(/\.tracker-hamburger\s*\{/);
    // Bottom-sheet behaviour applies at all viewports — see the user
    // request to free up horizontal canvas real estate on desktop too.
    expect(stylesSrc).toMatch(/\.lpanel\s*\{[^}]*position:fixed/);
  });

  test('mitigation: legacy toolbar-pill highlight controls remain wired (phase 1 only)', () => {
    // Phase 2 removes these; the assertion is inverted there.
    // For phase >=2, the toolbar pill should no longer carry these.
    expect(trackerSrc).not.toMatch(/title="Previous colour \(\]\)"/);
    expect(trackerSrc).not.toMatch(/title="Next colour \(\[\)"/);
    expect(trackerSrc).not.toMatch(/title="Toggle counting aids \(C\)"/);
  });

  test('phase 2: rpanel "More" tab no longer carries the duplicate View block', () => {
    // The legacy More-tab View section opened with a `<div className="rp-heading">View</div>`
    // immediately following an `{rpanelTab==="more"&&<div className="rp-section">`.
    // After phase 2 there is no rp-heading "View" reachable from the more tab.
    const moreSections = trackerSrc.split('rpanelTab==="more"').slice(1);
    const carriesViewHeading = moreSections.some(s => /<div className="rp-heading">View<\/div>/.test(s.slice(0, 200)));
    expect(carriesViewHeading).toBe(false);
  });

  test('phase 2: toolbar pill no longer renders the View mode pill', () => {
    // The legacy toolbar View pill mapped Sym/Col+Sym/HL labels.
    expect(trackerSrc).not.toMatch(/\[\['symbol','Sym'\],\['colour','Col\+Sym'\],\['highlight','HL'\]\]/);
  });

  test('phase 2: toolbar pill no longer renders the focus-area Eye button', () => {
    // The legacy Eye button used title="Spotlight focus area (F)" inside the toolbar pill.
    // It now lives in the (future) Tools tab. Confirm it's gone from the pill.
    expect(trackerSrc).not.toMatch(/title=\{"Spotlight focus area \(F\)"/);
  });

  test('phase 3: info strip + session chip defer to the Session tab', () => {
    // The info strip click handler used to open the per-project stats view
    // on mobile. After phase 3 it opens the left sidebar Session tab.
    expect(trackerSrc).toMatch(/setLeftSidebarTab\("session"\);\s*setLeftSidebarOpen\(true\);/);
    // The chip's pause-toggle behaviour is gone — the chip now only opens
    // the sidebar Session tab.
    expect(trackerSrc).not.toMatch(/title=\{manuallyPaused \? "Tap to resume tracking"/);
    // The legacy explicit-session start/stop button on the info strip is gone.
    expect(trackerSrc).not.toMatch(/title=\{explicitSession\?"End session":"Start session"\}/);
  });

  test('phase 3: forbidden emoji-like marks gone from the live progress UI', () => {
    // The chip + info strip used ▶ ⏸ ⏹ ⏱ for live state. Phase 3 swaps
    // them for SVG icons (Icons.play / Icons.pause / Icons.clock).
    expect(trackerSrc).not.toMatch(/['"`][^'"`]*[▶⏸⏹⏱][^'"`]*['"`]/);
  });
});
