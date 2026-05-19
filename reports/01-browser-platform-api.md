# Report 01 — Browser/Platform API Divergence

## Summary

This audit examined the cross-stitch PWA codebase for Safari/WebKit compatibility issues. The investigation scanned 15 API categories across ~80 source files and identified 7 findings ranging from high-severity (blocking clipboard features on Safari <15.1) to low-severity (minor locale formatting differences). Overall risk level: **MEDIUM** — most issues have workarounds or feature detection, but two issues pose real functional blockers on older Safari versions.

## Findings

### F-01: ClipboardItem API Not Supported on Safari Pre-15.1
- **File**: [stats-page.js](../stats-page.js#L481), line 481 and 658
- **Code**: `await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])`
- **Issue**: Safari added support for `navigator.clipboard.write()` with `ClipboardItem` only in Safari 15.1. Older versions do not support this API. The code has a try-catch block that silently fails, but users see no visual feedback on unsupported browsers.
- **Severity**: high

### F-02: Intl Formatting Inconsistency — toLocaleString() Default Locale
- **File**: [header.js](../header.js#L574), lines 574, 815, 816, 883
- **Code**: `new Date(s.createdAt).toLocaleString()`
- **Issue**: `toLocaleString()` called without explicit locale argument uses the browser's default locale. Safari, Chrome, and Firefox produce different default formats. Users in different regions will see dates formatted inconsistently, particularly with 12/24-hour time and separator styles. On Safari, this often produces verbose formats ("Friday, April 5, 2024, 12:34:56 PM") whereas Chromium may use shorter formats.
- **Severity**: medium

### F-03: canvas.getContext() willReadFrequently Option Not Recognised in Older Safari
- **File**: [import-formats.js](../import-formats.js#L346), line 346
- **Code**: `const ctx = canvas.getContext("2d", { willReadFrequently: true });`
- **Issue**: The `willReadFrequently` option was added in Safari 15.4. Earlier versions and some iOS versions ignore this option parameter entirely (no error, but no optimisation either). The code does not have a try/catch fallback.
- **Severity**: low

### F-04: ResizeObserver Feature-Detected but No Fallback Implementation
- **File**: [creator/AdaptModal.js](../creator/AdaptModal.js#L396), [creator/SplitPane.js](../creator/SplitPane.js#L44), [creator/ToolStrip.js](../creator/ToolStrip.js#L31), [tracker-app.js](../tracker-app.js#L5379)
- **Code**: `if (!el || typeof ResizeObserver === 'undefined') return;` followed by `var obs = new ResizeObserver(...)`
- **Issue**: Code properly checks for `ResizeObserver` presence and exits early if unavailable. However, on older Safari (pre-13.1), ResizeObserver is missing, and the UI will not recalculate narrow-breakpoint styling when the container resizes. Toolbar layout becomes static on pre-13.1 Safari.
- **Severity**: low

### F-05: Mixed Pointer/Touch Event Handlers — Potential Safari iOS Capture Issues
- **File**: [tracker-app.js](../tracker-app.js#L5359), lines 5359–5361
- **Code**: `canvas.addEventListener("touchstart", ts, {passive: false}); canvas.addEventListener("touchmove", tm, {passive: false}); canvas.addEventListener("touchend", te, {passive: false});`
- **Issue**: The codebase uses both explicit touch events (touchstart/touchmove/touchend) in the Tracker and pointer events (pointerdown/pointermove/pointerup) in modals/dropdowns. Safari iOS has known quirks with pointer event capture and touch event coexistence. The inconsistency between touch-specific and pointer-generic handling across components can lead to subtle interaction bugs on Safari iOS, particularly around scrolling interference and multi-touch handling.
- **Severity**: medium

### F-06: IndexedDB Private Browsing Not Explicitly Detected
- **File**: [helpers.js](../helpers.js#L268), [project-storage.js](../project-storage.js#L640), [manager-app.js](../manager-app.js#L553), [backup-restore.js](../backup-restore.js#L40)
- **Code**: `let request = indexedDB.open(DB_NAME, 5);`
- **Issue**: Safari's private browsing mode silently fails IndexedDB operations. The code has error handlers but there is NO explicit detection or user-facing messaging for "you are in private mode, so your data will be lost." Users in Safari private browsing may create patterns believing they are saved, only to discover on page reload that the entire session is gone.
- **Severity**: medium

### F-07: toLocaleTimeString() with Empty Locale Array — Safari Behaviour Difference
- **File**: [header.js](../header.js#L382), line 382
- **Code**: `return 'at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });`
- **Issue**: Passing an empty array `[]` as the locale argument produces different default behaviour in Safari vs Chromium. Safari may use the system locale's 12-hour vs 24-hour preference, whereas Chromium defaults differently. The "at HH:MM" format for timestamps may show as "at 03:45 PM" on Safari but "at 15:45" on Chromium.
- **Severity**: low

## TODO — Priority-Ordered Fix List

1. **[HIGH]** Add fallback for `navigator.clipboard.write([ClipboardItem(...)])` in [stats-page.js](../stats-page.js#L480). Detect support and fall back to `navigator.clipboard.writeText()` or a text export. Provide visual feedback when image copy fails.
2. **[MEDIUM]** Explicitly specify locale string (e.g., `'en-GB'`) in all `toLocaleString()`, `toLocaleDateString()`, `toLocaleTimeString()` calls in [header.js](../header.js) and [components-stats.js](../components-stats.js) to ensure consistent output across browsers.
3. **[MEDIUM]** Add explicit Safari private browsing detection in [helpers.js](../helpers.js) or [project-storage.js](../project-storage.js). When IndexedDB is detected as unavailable, show a prominent banner: "You are in private browsing mode. Your designs will not be saved when you close this window."
4. **[MEDIUM]** Consolidate event handling strategy for [tracker-app.js](../tracker-app.js) canvas interaction. Choose either pointer events or touch events consistently, and test touch event coalescing on Safari iOS to ensure `{passive: false}` is paired with actual `preventDefault()` calls where necessary.
5. **[LOW]** Replace empty locale array `[]` in [header.js](../header.js#L382) with explicit locale (`'en-GB'`), or use `undefined` and rely only on options object.
6. **[LOW]** Document the `canvas.getContext("2d", { willReadFrequently: true })` limitation in [import-formats.js](../import-formats.js#L346). Consider adding a feature-detection wrapper if performance degradation is unacceptable on older Safari.
7. **[LOW]** Ensure ResizeObserver fallback layouts in [creator/](../creator/) modals and toolbar are tested on browsers without ResizeObserver support.
