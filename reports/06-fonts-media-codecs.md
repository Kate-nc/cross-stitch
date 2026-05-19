# Report 06 — Fonts, Media, Codecs, and Canvas APIs

## Summary

Audited for cross-browser compatibility between Chromium/Windows and WebKit/Safari/Mac. **Overall Risk Level: MEDIUM**.

The codebase has reasonable fallbacks for many newer APIs (e.g., `ctx.roundRect()`), but two critical issues remain:
1. `OffscreenCanvas.convertToBlob()` used without graceful degradation for Safari <16.4
2. `imageSmoothingQuality` set without feature detection on three canvas rendering paths

Good practices: No external font CDNs (uses `system-ui`), no WebGL, no WebCodecs, no module workers, correct `importScripts()` in workers, canvas capped at 8192px.

## Findings

### F-01: imageSmoothingQuality Without Feature Detection — MEDIUM
- **File**: [tracker-app.js](../tracker-app.js#L208), [creator/bundle.js](../creator/bundle.js#L2653), [creator/RealisticCanvas.js](../creator/RealisticCanvas.js#L460)
- **Code**: `ctx2d.imageSmoothingQuality = "high";`
- **Issue**: Set without checking if the property exists on the context. Safari had inconsistent support across versions. Setting it directly may cause silent failures on older Safari.
- **Safari Behaviour**: Safari 15.4+ supports it, but Safari 12–15.3 may not. Browsers typically fall back to `imageSmoothingEnabled` boolean only in older versions.
- **Severity**: medium

### F-02: OffscreenCanvas and convertToBlob() Without Graceful Degradation — HIGH
- **File**: [pdf.worker.min.js](../pdf.worker.min.js#L22), line 22 (bundled pdf.js)
- **Code**: `const i = new OffscreenCanvas(a, n)` then `i.convertToBlob({type: "image/jpeg", quality: 1}).then(...)`
- **Issue**: The PDF worker uses `OffscreenCanvas` and calls `convertToBlob()` and `transferToImageBitmap()`. While the library includes `isOffscreenCanvasSupported` detection, it does NOT detect the availability of `convertToBlob()` specifically, which arrived in Safari 16.4. On Safari <16.4, `OffscreenCanvas` exists but `convertToBlob()` will throw.
- **Safari Behaviour**: OffscreenCanvas added in Safari 16.4 (March 2023). Versions 12–16.3 lack this API entirely.
- **Severity**: high

### F-03: Excessive OffscreenCanvas Dimension in PDF Worker — MEDIUM
- **File**: [pdf.worker.min.js](../pdf.worker.min.js#L22)
- **Code**: `static get MAX_DIM() { return shadow(this, "MAX_DIM", this._guessMax(2048, 65537, 0, 1)) }`
- **Issue**: The `ImageResizer` class attempts to allocate OffscreenCanvas up to 65536×65536 pixels. iOS Safari has a documented limit of ~16384 pixels per dimension. Large PDF imports may cause out-of-memory errors on iOS.
- **Severity**: medium

### F-04: ctx.roundRect() Used With Fallback — PROPERLY HANDLED
- **File**: [tracker-app.js](../tracker-app.js#L4459)
- **Code**: `if(ctx.roundRect) ctx.roundRect(...); else ctx.rect(...);`
- **Issue**: None. Feature-detection fallback to `ctx.rect()` is correct.
- **Severity**: low (no issue)

### F-05: createImageBitmap() Without Error Handling — MEDIUM
- **File**: [pdf.worker.min.js](../pdf.worker.min.js#L22)
- **Code**: `const a = createImageBitmap(t);`
- **Issue**: Not wrapped in try/catch. Safari 15.0+ supports it but with limited option support. A failure would propagate uncaught.
- **Severity**: medium

### F-06: Canvas Dimension Capping at 8192px — BEST PRACTICE
- **File**: [tracker-app.js](../tracker-app.js#L32), [creator/bundle.js](../creator/bundle.js#L2238), [creator/RealisticCanvas.js](../creator/RealisticCanvas.js#L45)
- **Code**: `var MAX_DIM = 8192; var rawCellSz = Math.floor(Math.min(MAX_DIM / sW, MAX_DIM / sH));`
- **Issue**: None. Regular canvas (non-OffscreenCanvas) is capped at 8192×8192px, below both macOS Safari (~16384) and iOS Safari limits. Good practice.
- **Severity**: low (no issue)

### F-07: System Fonts and Inter as First Choice — BEST PRACTICE
- **File**: [styles.css](../styles.css#L50)
- **Code**: `--font-ui: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;`
- **Issue**: None. No external font CDN. Works identically on Safari and Chromium.
- **Severity**: low (no issue)

### F-08: Symbol Font Embedded as Base64 — BEST PRACTICE
- **File**: [assets/fonts/](../assets/fonts/), [creator/symbolFontSpec.js](../creator/symbolFontSpec.js)
- **Issue**: None. TTF embedded as base64, avoiding CORS and network loading issues.
- **Severity**: low (no issue)

### F-09: Workers Use synchronous importScripts() — COMPATIBLE
- **File**: [generate-worker.js](../generate-worker.js#L27), [pdf-export-worker.js](../pdf-export-worker.js#L39)
- **Code**: `importScripts('constants.js', 'dmc-data.js', 'colour-utils.js')`
- **Issue**: None. All workers use traditional `new Worker(url)` without `{type: 'module'}`, avoiding Safari's module-worker limitation (not supported until Safari 15). Correct approach.
- **Severity**: low (no issue)

### F-10: No WebGL, WebCodecs, or MediaRecorder — BEST PRACTICE
- **Issue**: None. No usage of `getContext('webgl')`, `VideoEncoder`, `MediaRecorder`, or `getUserMedia`.
- **Severity**: low (no issue)

## TODO — Priority-Ordered Fix List

1. **[HIGH] Add feature detection for OffscreenCanvas methods** — Before calling `convertToBlob()` or `transferToImageBitmap()` in [pdf-export-worker.js](../pdf-export-worker.js), check that the method exists. Enables PDF export on Safari <16.4.

2. **[MEDIUM] Reduce OffscreenCanvas MAX_DIM in PDF worker to 16384** — Lower the binary-search upper bound from 65536 to 16384 to respect iOS Safari limits. Prevents OOM on large PDF imports.

3. **[MEDIUM] Add feature detection for imageSmoothingQuality** — Guard all three usages:
   ```javascript
   if ('imageSmoothingQuality' in ctx2d) { ctx2d.imageSmoothingQuality = "high"; }
   ```
   Files: [tracker-app.js](../tracker-app.js), [creator/bundle.js](../creator/bundle.js), [creator/RealisticCanvas.js](../creator/RealisticCanvas.js).

4. **[MEDIUM] Wrap createImageBitmap() in try/catch** — Handle potential failures gracefully in [pdf-export-worker.js](../pdf-export-worker.js).

5. **[LOW] Document Safari 16.4+ requirement for PDF export** — Add a notice in UI that PDF export requires Safari 16.4 (March 2023) or later. Recommend Chromium if PDF export fails.
