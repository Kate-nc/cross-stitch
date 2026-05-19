# Report 03 — Pattern Creation Feature: Safari Failure Analysis

## Summary

The pattern creation flow has several Safari incompatibilities that cause **silent failures or broken functionality**, particularly in image import, pattern generation, canvas rendering, and export. Multiple issues are blockers on Safari — the pattern creation feature is likely broken end-to-end on Safari < 15.

**Risk Level: HIGH** — Multiple code paths fail silently, leaving users with blank canvases or stuck spinners with no error message.

**Most likely root causes of the pattern creation failure on Mac/Safari:**
1. `ctx.filter` (canvas CSS filters) not available on Safari <15 — generation silently fails
2. Canvas tainting when `getImageData()` is called after drawing a data-URL image
3. `canvas.toBlob()` hanging indefinitely on Safari in some scenarios
4. Worker fallback blocking the main thread (no timeout guard)

## Pattern Creation Flow (as-implemented)

1. **Image Import** → User selects/drags image → `FileReader.readAsDataURL` → `Image()` loads → crop/orient in canvas
2. **Image Processing** → `embroidery.js` bilateral filter → Canny edge detection → saliency map (main canvas or OffscreenCanvas)
3. **Pattern Generation** → spawn `Worker` → post pixel `ArrayBuffer` → quantise/dither/cleanup in worker → `postMessage` result back
4. **Canvas Rendering** → `drawPatternBaseOnCanvas`/`drawPatternOverlayOnCanvas` via `canvasRenderer.js` (`getImageData`/`putImageData`)
5. **User Interaction** → mouse/touch events with `setPointerCapture`, marching ants animation
6. **Export** → `canvas.toDataURL` or `canvas.toBlob` for PDF preview captures

## Findings

### F-01: FileReader.readAsDataURL Inconsistency With Large/Complex Images
- **File**: [creator/useImportWizard.js](../creator/useImportWizard.js), lines around image loading
- **Code**: `rd.readAsDataURL(f)` followed by `img.src = dataUrl`
- **Issue**: Safari has historically had issues with `FileReader.readAsDataURL` for large binary files or certain JPEG formats. Data URLs can exceed size limits and cause silent load failures. No fallback to `readAsArrayBuffer`.
- **Severity**: high
- **Failure mode**: Image doesn't load in the crop preview; user sees blank canvas; no error message; UI appears stuck

### F-02: Canvas Context willReadFrequently Hint May Throw on Older Safari
- **File**: [creator/PatternCanvas.js](../creator/PatternCanvas.js#L103), [import-formats.js](../import-formats.js#L346)
- **Code**: `canvas.getContext("2d", { willReadFrequently: true })`
- **Issue**: The `willReadFrequently` hint was added to WebKit late (Safari 15.4). Older Safari versions ignore it without throwing, but on some configurations it can cause unexpected behaviour. Code has no try/catch fallback.
- **Severity**: medium
- **Failure mode**: Canvas context returns normally but hint is ignored; no error, just reduced performance

### F-03: Image Constructor Loads Data URLs Differently on Safari/Mac
- **File**: [embroidery.js](../embroidery.js#L901)
- **Code**: `var img = new Image(); img.src = ev.target.result` (data URL)
- **Issue**: Safari on macOS has stricter same-origin policies for data URLs and can fail silently when `Image.onload` does not fire. No `onerror` handling is attached at this point. The `Image` constructor also has slower startup on Safari.
- **Severity**: high
- **Failure mode**: Image loads but `onload` never fires; preview canvas stays blank; user thinks app crashed

### F-04: Canvas filter API Not Available on Safari < 15 — ROOT CAUSE
- **File**: [creator/useCreatorState.js](../creator/useCreatorState.js#L1195)
- **Code**: `cx.filter = "brightness(" + (100 + bri) + "%) contrast(" + (100 + con) + "%) saturate(" + (100 + sat) + "%)"`
- **Issue**: `ctx.filter` is **not available in Safari < 15**. Safari 15+ added it. Code does not check for feature support or provide a pixel-manipulation fallback. Assignment to `ctx.filter` on an unsupported browser silently does nothing or throws a TypeError.
- **Severity**: **BLOCKER**
- **Failure mode**: Filter silently does nothing → generation produces wrong colours → user sees incorrect pattern preview; or TypeError → generation fails entirely → blank canvas

### F-05: Web Worker Message Passing May Not Transfer ArrayBuffers Reliably
- **File**: [creator/useCreatorState.js](../creator/useCreatorState.js#L978)
- **Code**: `worker.postMessage({ ..., pixels: imageData.data.buffer, ... }, [imageData.data.buffer])`
- **Issue**: Transferable `ArrayBuffer` is not fully supported in older Safari, or the transfer list does not work as expected. No fallback to `postMessage` without transfer.
- **Severity**: medium
- **Failure mode**: Worker receives corrupted/empty pixel data → pattern comes out blank or monochrome

### F-06: canvas.toBlob Async Behaviour and Callback May Never Fire on Safari — ROOT CAUSE
- **File**: [creator/ExportTab.js](../creator/ExportTab.js#L196), [components-stats.js](../components-stats.js#L1280)
- **Code**: `c.toBlob(function (blob) { ... })` without timeout or error handling
- **Issue**: Safari's `toBlob` can hang indefinitely on large canvases or certain compositing operations. No timeout guard, no rejection handler. If the callback never fires, the UI appears frozen.
- **Severity**: **BLOCKER**
- **Failure mode**: User clicks Export → spinner never stops → no error; app appears crashed

### F-07: Canvas Tainted by Data URL — getImageData Throws SecurityError — ROOT CAUSE
- **File**: [creator/canvasRenderer.js](../creator/canvasRenderer.js), [embroidery.js](../embroidery.js#L631), [creator/PatternCanvas.js](../creator/PatternCanvas.js#L56)
- **Code**: `ctx.getImageData(0, 0, w, h)` after drawing a data-URL image
- **Issue**: If an `Image` was loaded from a data URL, Safari may mark the canvas as cross-origin ("tainted") and throw a `SecurityError` when `getImageData` is called. This is particularly likely if the image was filtered before being drawn.
- **Severity**: **BLOCKER**
- **Failure mode**: Pattern generation throws "canvas has been tainted" error → user sees error toast but no explanation → pattern creation fails silently

### F-08: navigator.clipboard API Missing Fallback
- **File**: [creator/useCreatorState.js](../creator/useCreatorState.js#L1180)
- **Code**: `navigator.clipboard.writeText(txt).then(...).catch(...)`
- **Issue**: `navigator.clipboard` can be unavailable or blocked in Safari on older iOS. No fallback to older Clipboard API or copy-to-input workaround. Error is silently caught.
- **Severity**: low
- **Failure mode**: Copy-to-clipboard silently fails; user pastes nothing; no feedback

### F-09: setPointerCapture Support — Touch Drag Erratic on Safari
- **File**: [creator/useCanvasInteraction.js](../creator/useCanvasInteraction.js#L637)
- **Code**: `if (e.target && e.target.setPointerCapture) { try { e.target.setPointerCapture(e.pointerId); } catch (_) {} }`
- **Issue**: Code wraps `setPointerCapture` in try/catch (correct), but on Safari iOS, pointer events may not fire correctly after `setPointerCapture` fails. Lasso drawing and brush strokes can be erratic.
- **Severity**: medium
- **Failure mode**: Brush strokes are jerky or stop mid-stroke; lasso selection doesn't track finger accurately

### F-10: Worker Instantiation Fails Without Clear Error
- **File**: [creator/useCreatorState.js](../creator/useCreatorState.js#L978)
- **Code**: `try { var w = new Worker('generate-worker.js'); } catch (ex) { console.warn(...); workerRef.current = 'unavailable'; return null; }`
- **Issue**: Worker creation can fail on Safari if the page is served over `file://` protocol or the script contains a syntax error. The catch handler only logs a warning and falls back to main-thread generation, which blocks UI for 30+ seconds and appears to hang.
- **Severity**: high
- **Failure mode**: Worker fails silently → main thread generation blocks UI → user sees spinner that doesn't progress for 30+ seconds

### F-11: OffscreenCanvas Feature Not Detected in embroidery.js
- **File**: [embroidery.js](../embroidery.js)
- **Code**: Heavy use of `getImageData`, `putImageData`, canvas compositing
- **Issue**: If `embroidery.js` uses `OffscreenCanvas` (added in Safari 16.4), it will fail on older Safari. Code does not check `typeof OffscreenCanvas`.
- **Severity**: medium
- **Failure mode**: Embroidery tool (magic wand, lasso) throws error or hangs; user cannot use advanced selection tools

### F-12: canvas.toDataURL Quality Parameter Format Differences
- **File**: [creator/pdfExport.js](../creator/pdfExport.js#L122)
- **Code**: `canvas.toDataURL("image/jpeg", quality || 0.85)`
- **Issue**: Safari handles the quality parameter inconsistently across versions. PNG export via `toDataURL` is very slow on Safari. No error handling around `toDataURL` failures.
- **Severity**: low
- **Failure mode**: PDF preview capture takes 10+ seconds or produces very large data URLs

## TODO — Priority-Ordered Fix List

### BLOCKER (Fix First — Most Likely Root Causes of Safari Failure)

1. **Add `ctx.filter` feature detection** (F-04): Check `if (typeof ctx.filter !== 'undefined')` before using; fallback to manual pixel manipulation via `getImageData`/`putImageData` when not supported. This is the single most likely cause of blank canvas output on Safari <15.
2. **Handle canvas tainting from data URLs** (F-07): Set `img.crossOrigin = "anonymous"` before drawing, OR catch `SecurityError` from `getImageData` and show a user-friendly message. Test on Safari with local image files.
3. **Add `canvas.toBlob` timeout guard** (F-06): Wrap `toBlob` in `Promise.race` with a 5-second `setTimeout` fallback that uses `toDataURL` instead. This prevents the UI from appearing frozen on export.
4. **Add Worker error handling and main-thread fallback timeout** (F-10): Set a maximum execution time for main-thread generation; if it exceeds 15 seconds, abort and show "Processing took too long. Try a smaller image."

### HIGH (Fix Soon)

5. **Improve Image loading reliability** (F-03, F-01): Add `onerror` handler and CORS attribute to all `Image()` constructor usages; add 3-second timeout fallback; show "image failed to load" error to user.
6. **Add FileReader fallback** (F-01): Try `readAsDataURL` first; if it fails or takes >2s, fallback to `readAsArrayBuffer` + manual base64 encoding.

### MEDIUM (Fix in Next Sprint)

7. **Add `navigator.clipboard` fallback** (F-08): Use `execCommand('copy')` fallback for older Safari/iOS.
8. **Add pointer event feature detection** (F-09): Test `setPointerCapture`; add fallback to mouse/touch events without capture.
9. **Add `OffscreenCanvas` feature detection** (F-11): Check `typeof OffscreenCanvas`; fallback to regular canvas if not available.
10. **Fix transferable ArrayBuffer handling** (F-05): Test if transfer list works; fallback to `postMessage` without transfer if it fails.

### LOW (Polish)

11. **Optimise shadow performance on Safari** (F-12): Disable shadow effects on Safari or use simpler styling.
12. **Add comprehensive error boundaries** around image import, generation, and export with user-facing error messages.
