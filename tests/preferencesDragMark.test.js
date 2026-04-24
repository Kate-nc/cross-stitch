// tests/preferences-dragMark.test.js — fix-3.3
// Verifies the Tracker drag-to-mark preference wiring across:
//   • user-prefs.js  — DEFAULTS contains trackerDragMark: false
//   • preferences-modal.js — TrackerPanel exposes a Switch for it
//   • tracker-app.js — drag-mark gate reads UserPrefs.get('trackerDragMark')

const fs = require('fs');
const path = require('path');
function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

describe('fix-3.3 — Tracker drag-to-mark preference', () => {
  it('user-prefs.js declares trackerDragMark: true in DEFAULTS (C3 default-on)', () => {
    const src = read('user-prefs.js');
    expect(src).toMatch(/trackerDragMark\s*:\s*true/);
  });

  it('preferences-modal.js TrackerPanel registers the switch via usePref("trackerDragMark", true)', () => {
    const src = read('preferences-modal.js');
    expect(src).toMatch(/usePref\("trackerDragMark",\s*true\)/);
    // C3: "(experimental)" label dropped now that the gesture is the default.
    expect(src).toMatch(/Drag to mark stitches/);
    expect(src).not.toMatch(/Drag to mark stitches \(experimental\)/);
  });

  it('tracker-app.js reads the preference as the primary source', () => {
    const src = read('tracker-app.js');
    expect(src).toMatch(/UserPrefs\.get\(['"]trackerDragMark['"]\)/);
  });

  it('tracker-app.js retains the legacy window.B2_DRAG_MARK_ENABLED override', () => {
    // C3: pref is the user-facing switch and default is on. The global
    // flag is kept as a QA escape hatch — set it to false to force-disable.
    const src = read('tracker-app.js');
    expect(src).toMatch(/B2_DRAG_MARK_ENABLED/);
  });
});
