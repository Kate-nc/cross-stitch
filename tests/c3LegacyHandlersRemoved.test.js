// tests/c3LegacyHandlersRemoved.test.js — C3
//
// Source-level guards that the legacy drag-mark / range-mode plumbing has
// been removed and the unified useDragMark pipeline is the only one wired
// to the canvas. Pinch / pan / edit-mode popover / navigate-mode / half-
// stitch handling are NOT covered by useDragMark and intentionally remain
// inside the legacy mouse + touch handlers — those branches must stay.

const fs = require('fs');
const path = require('path');

const TRACKER = fs.readFileSync(
  path.resolve(__dirname, '..', 'tracker-app.js'), 'utf8');
const PREFS_MODAL = fs.readFileSync(
  path.resolve(__dirname, '..', 'preferences-modal.js'), 'utf8');
const USER_PREFS = fs.readFileSync(
  path.resolve(__dirname, '..', 'user-prefs.js'), 'utf8');

describe('C3 — legacy drag-mark plumbing removed', () => {
  test('rangeModeActive React state is no longer declared', () => {
    expect(TRACKER).not.toMatch(/setRangeModeActive/);
    expect(TRACKER).not.toMatch(/useState\([^)]*\)\s*;[^\n]*rangeModeActive/);
    // `rangeModeActive` should not appear as a binding name anywhere.
    expect(TRACKER).not.toMatch(/\brangeModeActive\b/);
  });

  test('rangeAnchor React state (the touch range anchor) is no longer declared', () => {
    expect(TRACKER).not.toMatch(/setRangeAnchor/);
    // `rangeAnchor` lives only inside useDragMark's reducer now — not in
    // the tracker component scope.
    expect(TRACKER).not.toMatch(/\brangeAnchor\b/);
  });

  test('the "⊞ Range" toolbar button is removed', () => {
    expect(TRACKER).not.toMatch(/⊞ Range/);
    expect(TRACKER).not.toMatch(/title="Range select mode"/);
  });

  test('legacy mouse cell-marking branches are gone from handleStitchMouseDown', () => {
    // The drag-init optimistic update line must be gone.
    expect(TRACKER).not.toMatch(/dragStateRef\.current\s*=\s*\{\s*isDragging:\s*true/);
    // The mouse-up commit registration must be gone.
    expect(TRACKER).not.toMatch(/window\.addEventListener\(\s*["']pointerup["']\s*,\s*handleMouseUp/);
    // The shift+click range fill loop in the mousedown handler must be gone.
    // (lastClickedRef is still used as a defensive ref but should no
    // longer be the source of a range-fill loop.)
    expect(TRACKER).not.toMatch(/Shift\+Click range fill/);
  });

  test('legacy mouse drag mutation branch is gone from handleStitchMouseMove', () => {
    // The block that pushed into dragChangesRef during a mouse drag is
    // gone; drag mutation now flows through useDragMark.
    expect(TRACKER).not.toMatch(/dragChangesRef\.current\.push/);
  });

  test('handleMouseUp no longer commits a legacy drag (pan release retained)', () => {
    // Pan release must remain so middle-click / space-drag pan still ends.
    expect(TRACKER).toMatch(/function handleMouseUp\([^)]*\)\s*\{[^}]*isPanning[^}]*setIsPanning\(false\)/);
    // The legacy commit lines must be gone.
    expect(TRACKER).not.toMatch(/handleMouseUp\([^)]*\)\s*\{[\s\S]{0,400}pushTrackHistory\(\[\.\.\.dragChangesRef/);
  });

  test('legacy touch tap-to-toggle / range-fill branches are gone from handleTouchEnd', () => {
    // handleTouchEnd is reduced to pinch + pan state cleanup. None of the
    // tap toggle, range fill, or rangeAnchor calls should remain.
    expect(TRACKER).not.toMatch(/setRangeAnchor\(\{idx,row:gy/);
    expect(TRACKER).not.toMatch(/handleTouchEnd[\s\S]{0,2000}pushTrackHistory/);
    // The handler must still reset touch state so pinch + pan stay clean.
    expect(TRACKER).toMatch(/function handleTouchEnd[\s\S]{0,400}ts\.mode\s*=\s*["']none["']/);
  });

  test('handleTouchStart no longer pre-records a tap idx for cell marking', () => {
    // The single-touch branch used to set ts.tapIdx for the legacy
    // cell-toggle path; that's owned by useDragMark now.
    expect(TRACKER).not.toMatch(/ts\.tapIdx\s*=\s*idx/);
    expect(TRACKER).not.toMatch(/ts\.tapVal\s*=\s*done\[idx\]/);
  });

  test('handleTouchStart and handleTouchMove still own pinch + pan', () => {
    // Pinch (two-finger) entry point.
    expect(TRACKER).toMatch(/e\.touches\.length\s*===\s*2/);
    expect(TRACKER).toMatch(/ts\.pinchDist\s*=\s*Math\.hypot/);
    // Pan switch (single-finger > 8px threshold).
    expect(TRACKER).toMatch(/PAN_THRESHOLD/);
  });

  test('touch event listeners are still registered (pinch + pan need passive:false)', () => {
    expect(TRACKER).toMatch(/canvas\.addEventListener\(\s*["']touchstart["']/);
    expect(TRACKER).toMatch(/canvas\.addEventListener\(\s*["']touchmove["']/);
    expect(TRACKER).toMatch(/canvas\.addEventListener\(\s*["']touchend["']/);
  });

  test('touch-only gate around useDragMark handlers is removed', () => {
    expect(TRACKER).not.toMatch(/_touchOnlyHandlers/);
    // Hook handlers spread directly onto the canvas.
    expect(TRACKER).toMatch(/\{\.\.\.dragMarkHandlers\}/);
  });

  test('useDragMark is the sole owner of cell-marking pointer events', () => {
    // Hook is invoked.
    expect(TRACKER).toMatch(/window\.useDragMark\(/);
    // dragMarkState drives the range anchor overlay (replaces rangeAnchor).
    expect(TRACKER).toMatch(/dragMarkState[^.]*\.\s*mode\s*===\s*['"]range['"]/);
  });

  test('B2_DRAG_MARK_ENABLED is still referenced as an override (not removed)', () => {
    // Per C3 plan: keep the flag as a QA escape hatch (force-disable).
    expect(TRACKER).toMatch(/B2_DRAG_MARK_ENABLED/);
    // The default-off `_dragMarkPrefOn` derivation has been replaced by a
    // default-on derivation. The OLD pattern (pref must equal true OR
    // flag must equal true) is gone.
    expect(TRACKER).not.toMatch(/UserPrefs\.get\(['"]trackerDragMark['"]\)\s*===\s*true/);
    // The new pattern only DISABLES via the override.
    expect(TRACKER).toMatch(/B2_DRAG_MARK_ENABLED\s*===\s*false/);
  });
});

describe('C3 — preference default flipped to on', () => {
  test('user-prefs.js DEFAULTS.trackerDragMark is now true', () => {
    expect(USER_PREFS).toMatch(/trackerDragMark\s*:\s*true/);
    expect(USER_PREFS).not.toMatch(/trackerDragMark\s*:\s*false/);
  });

  test('preferences-modal.js label drops "(experimental)"', () => {
    expect(PREFS_MODAL).toMatch(/Drag to mark stitches/);
    expect(PREFS_MODAL).not.toMatch(/Drag to mark stitches \(experimental\)/);
  });

  test('preferences-modal.js usePref default-arg flipped to true', () => {
    expect(PREFS_MODAL).toMatch(/usePref\("trackerDragMark",\s*true\)/);
  });
});
