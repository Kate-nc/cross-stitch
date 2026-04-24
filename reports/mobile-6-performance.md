# Mobile Audit 6 — Performance on Constrained Devices

## Summary

This PWA loads heavy upfront on mobile: Babel-Standalone (~150KB) compiles JSX in-browser blocking 500-800ms on a mid-range phone; ~30 sync `<script>` tags run before the app boots; CSS animates layout properties (`max-height`, `width`) instead of transforms; Service Worker pre-caches Babel + pdf-lib (~370KB) on install. Canvas rendering is well-optimised (RAF coalescing) but full DOM trees stay mounted on collapsed mobile panels.

## TODOs (prioritised)

### 1. 🔴 Babel in-browser JSX compile blocks main thread
- **File(s)**: [index.html](index.html#L86-L120), [stitch.html](stitch.html), [manager.html](manager.html)
- **Problem**: `Babel.transform()` of `tracker-app.js`/`creator-main.js`/etc on first load: 500–800ms freeze on mid-range Android.
- **Fix**: Add a precompile step (esbuild / Babel CLI) that emits `.compiled.min.js` for each JSX file; use `localStorage` cache for repeat visits; CDN Babel as fallback only.

### 2. 🔴 ~30 sync scripts loaded before app mount
- **File(s)**: [index.html](index.html#L38-L72), [stitch.html](stitch.html#L17-L32), [manager.html](manager.html#L16-L27)
- **Fix**: Concat core utilities into `core-bundle.min.js` (constants/dmc-data/colour-utils/helpers/threadCalc/project-storage); lazy-load page-specific bundles after first paint.

### 3. 🔴 CSS animates layout properties → jank
- **File(s)**: [styles.css](styles.css#L1711-L1848)
- **Problem**: `.rpanel`, `.mgr-rpanel` animate `max-height`; `.tb-progress-fill` animates `width`; toolbar-row animates `transform` (✓).
- **Fix**: Use `transform: translateY()` for slide panels; `transform: scaleX()` for progress fill (origin-left).

### 4. 🔴 Service Worker pre-caches Babel + pdf-lib + pdf.js (~370KB)
- **File(s)**: [sw.js](sw.js#L24)
- **Fix**: Move PDF + Babel to runtime-cache (cache on first use, not at install).

### 5. 🟡 Sidebar/PreviewCanvas always mounted even when hidden on mobile
- **File(s)**: [creator/SplitPane.js](creator/SplitPane.js#L44), [creator/Sidebar.js](creator/Sidebar.js#L44)
- **Fix**: `{!narrow || previewOpen ? <PreviewCanvas/> : null}` for narrow viewports.

### 6. 🟡 Images lack `loading="lazy"` / `srcset`
- **File(s)**: [home-screen.js](home-screen.js), preview comparison images, [creator-main.js](creator-main.js#L176-L182)
- **Fix**: Add `loading="lazy" decoding="async"` to all non-above-fold images; provide `srcset` where multiple sizes exist.

### 7. 🟡 localStorage key pollution from manual Babel cache cleanup
- **File(s)**: [index.html](index.html#L94-L100)
- **Fix**: Replace static `removeItem` list with regex sweep `^babel_[^_]+_v\d+$` that keeps only current `BABEL_VERSION`.

### 8. 🟡 Some pointer/mouse handlers missing `{passive:true}` for scroll
- **File(s)**: [creator/SplitPane.js](creator/SplitPane.js#L60), [command-palette.js](command-palette.js#L297)
- **Fix**: Add `{passive:true}` where `preventDefault()` is not called.

### 9. 🟢 Workers underutilised for image filters (bilateral, Canny, k-means)
- **File(s)**: [embroidery.js](embroidery.js), [analysis-worker.js](analysis-worker.js)
- **Fix** (future): offload to existing `analysis-worker.js`.

### 10. 🟢 Defer non-critical init via `requestIdleCallback`
- **File(s)**: [tracker-app.js](tracker-app.js)
- **Fix**: Wrap insights engine + onboarding init in `requestIdleCallback` (with `setTimeout` fallback).
