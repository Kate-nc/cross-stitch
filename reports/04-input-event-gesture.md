# Report 04 — Input, Event, and Gesture Handling

## Summary

Audited input, event, and gesture handling across Chromium/Windows and WebKit/Safari/Mac environments. The codebase shows generally good practices with proper use of modifier key checks (`ctrlKey || metaKey`), non-passive touch listeners, and pointer capture error handling. However, two specific issues could cause platform-specific failures on macOS Safari: wheel event delta normalisation is missing, and one location checks only `ctrlKey` without `metaKey` for Mac zoom.

**Overall Risk Level: MEDIUM** — The identified issues are fixable and do not block core functionality, but affect the zoom/pan experience on Mac.

## Findings

### F-01: Wheel Event Delta Not Normalised for deltaMode
- **File**: [embroidery.js](../embroidery.js#L1067), line 1067
- **Code**: `const dz = ZOOM_STEP_SCROLL * -Math.sign(e.deltaY);`
- **Issue**: The code reads `e.deltaY` directly without checking `deltaMode`. In Safari on Mac, `WheelEvent.deltaMode` can be 0 (pixels) or 1 (lines), while Chrome uses pixels by default. Safari trackpad momentum scrolling also produces different delta values. This causes inconsistent zoom sensitivity across browsers.
- **Severity**: high

### F-02: Tracker Wheel Zoom Only Checks ctrlKey (Missing metaKey for Mac) — ROOT CAUSE
- **File**: [tracker-app.js](../tracker-app.js#L4914), line 4914
- **Code**: `if (!e.ctrlKey) return;` (inside `handleStitchWheel` function)
- **Issue**: The zoom shortcut only checks `ctrlKey` and ignores `metaKey`. On macOS, keyboard shortcuts use Cmd (`metaKey`), not Ctrl. Mac users cannot use Cmd+wheel to zoom the stitch tracker. All other keyboard shortcuts in the codebase correctly check both `ctrlKey` and `metaKey`.
- **Severity**: high

### F-03: Embroidery Canvas Wheel Zoom Also Lacks deltaMode Normalisation
- **File**: [embroidery.js](../embroidery.js#L1062), lines 1062–1077
- **Code**: `const wh = e => { e.preventDefault(); const dz = ZOOM_STEP_SCROLL * -Math.sign(e.deltaY); ... }`
- **Issue**: Same as F-01 but in the embroidery/image editing context. Also lacks `deltaMode` normalisation. The listener is correctly attached with `{passive: false}` to allow `preventDefault`, which is good.
- **Severity**: high

### F-04: Pointer Capture Properly Error-Handled (No Issue)
- **File**: [creator/useCanvasInteraction.js](../creator/useCanvasInteraction.js#L637), lines 637–638
- **Code**: `if (e.target && e.target.setPointerCapture) { try { e.target.setPointerCapture(e.pointerId); } catch (_) {} }`
- **Issue**: None detected. This is correct — Safari 13+ supports `setPointerCapture`, but the try-catch provides safety for edge cases. Pattern is consistently used throughout.
- **Severity**: low (no issue)

### F-05: Touch Event Listeners Correctly Non-Passive (No Issue)
- **File**: [tracker-app.js](../tracker-app.js#L5359), lines 5359–5361
- **Code**: `canvas.addEventListener("touchstart", ts, {passive: false}); canvas.addEventListener("touchmove", tm, {passive: false});`
- **Issue**: None detected. Correctly configured to allow `preventDefault()` for touch event handling.
- **Severity**: low (no issue)

### F-06: Context Menu Suppression Sound (Minor Note)
- **File**: [tracker-app.js](../tracker-app.js#L6447), [creator/ContextMenu.js](../creator/ContextMenu.js#L16)
- **Code**: `onContextMenu={e => e.preventDefault()}`
- **Issue**: Context menu prevention is implemented correctly. However, on iOS Safari, two-finger tap generates `contextmenu` events differently than on desktop Safari or Chrome. This is expected platform-specific UX, not a bug.
- **Severity**: low (expected Safari difference, not a bug)

### F-07: Modifier Key Handling Is Mostly Correct (No Issue)
- **File**: [embroidery.js](../embroidery.js#L1085), [shortcuts.js](../shortcuts.js#L96), [command-palette.js](../command-palette.js#L552)
- **Code**: `if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey)` and `var modPressed = !!(evt.ctrlKey || evt.metaKey);`
- **Issue**: None in these files. The canonical pattern of checking both `ctrlKey` and `metaKey` is correctly used everywhere except the one instance in F-02.
- **Severity**: low (no issue)

### F-08: touch-action CSS Properly Set (Best Practice)
- **File**: [creator/PatternCanvas.js](../creator/PatternCanvas.js#L147), [tracker-app.js](../tracker-app.js#L6447)
- **Code**: `touchAction: "none"` on interactive canvases, `touch-action: manipulation` on buttons
- **Issue**: None detected. Eliminates 300ms tap delay and prevents browser gestures on gesture-handling canvases. Follows best practices.
- **Severity**: low (no issue)

### F-09: No Deprecated event.which or keypress Usage (Best Practice)
- **Issue**: None detected. Code uses `event.key` instead of deprecated `event.which` or `keypress` event throughout.
- **Severity**: low (no issue)

## TODO — Priority-Ordered Fix List

1. **[HIGH] Fix Wheel Event Delta Normalisation** — In [tracker-app.js](../tracker-app.js#L4924) and [embroidery.js](../embroidery.js#L1067), normalise `e.deltaY` by checking `e.deltaMode`:
   ```javascript
   const DELTA_MODE_MULTIPLIERS = [1, 40, 800]; // pixels, lines, pages
   const normalised = (DELTA_MODE_MULTIPLIERS[e.deltaMode] || 1) * e.deltaY;
   ```
   Test on Safari/Mac trackpad to ensure consistent zoom speed.

2. **[HIGH] Add metaKey Check to Tracker Wheel Zoom** — In [tracker-app.js](../tracker-app.js#L4914), change:
   ```javascript
   if (!e.ctrlKey) return;
   ```
   to:
   ```javascript
   if (!(e.ctrlKey || e.metaKey)) return;
   ```
   This mirrors the existing pattern used everywhere else and is a one-line fix.

3. **[MEDIUM] Verify momentum scrolling on Safari Trackpad** — After fixing F-01/F-03, test zoom-to-scroll-position update in [tracker-app.js](../tracker-app.js#L5343) on Safari to ensure scroll position doesn't cause unwanted viewport jumps.

4. **[LOW] Document iOS Safari Context Menu Behaviour** — Two-finger tap context menu may feel different on iOS vs desktop. This is expected platform-specific UX and does not require code changes.
