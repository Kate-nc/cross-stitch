# Report 05 — File I/O, Blobs, and Downloads

## Summary

Audited file I/O, blob handling, and download compatibility. The app relies on modern Web APIs (Web Workers, Blob URLs, FileReader, Canvas operations) without comprehensive Safari fallbacks.

**Overall Risk Level: HIGH**

Critical issues include:
- Blob URL revocation race conditions (Safari downloads may not have started when the URL is revoked)
- `OffscreenCanvas` and `createImageBitmap` usage in the PDF worker (Safari <16.4)
- `sessionStorage` size limits being hit silently when large images are stored as data URLs
- `canvas.toBlob()` hanging indefinitely on Safari in low-memory conditions

## Findings

### F-01: Blob URL Revocation Race Condition in ExportTab — BLOCKER
- **File**: [creator/ExportTab.js](../creator/ExportTab.js#L208), lines 208–213
- **Code**:
  ```javascript
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  ```
- **Issue**: Safari (especially on iOS) does not start downloads synchronously on `a.click()`. The blob URL can be revoked before the download stream starts. Safari's download handling is asynchronous and queues requests. Revoking after 1 second may fail if the system is slow.
- **Severity**: blocker

### F-02: Blob URL Revocation in Backup/Restore (Finally Block) — BLOCKER
- **File**: [backup-restore.js](../backup-restore.js#L200), lines 200–229
- **Code**: Revoke happens in `finally` block immediately after `a.click()`
- **Issue**: Revoke happens immediately after click, before download completes. Safari's blob URL downloads are deferred on iOS. No delay or user interaction check before revocation.
- **Severity**: blocker

### F-03: Synchronous URL.revokeObjectURL in Stats Download — HIGH
- **File**: [components-stats.js](../components-stats.js#L1280), lines 1280–1289
- **Code**:
  ```javascript
  canvas.toBlob(function(blob) {
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);  // Synchronous! Download may not have started
  });
  ```
- **Issue**: `revokeObjectURL` called inside `toBlob` callback, immediately after `click()`. Download may not start. `setTimeout` needed.
- **Severity**: high

### F-04: OffscreenCanvas in PDF Worker (Safari <16.4) — BLOCKER
- **File**: [pdf.worker.min.js](../pdf.worker.min.js#L22), line 22 (bundled pdf.js)
- **Code**: `new OffscreenCanvas(width, height)` and `convertToBlob()` in the PDF worker
- **Issue**: OffscreenCanvas was added in Safari 16.4 (March 2023). Earlier versions lack it entirely. The PDF worker does `isOffscreenCanvasSupported` detection but does not gracefully fallback when `convertToBlob()` is missing (a separate API from OffscreenCanvas itself). PDF export fails on Safari <16.4.
- **Severity**: blocker

### F-05: createImageBitmap in PDF Worker — HIGH
- **File**: [pdf.worker.min.js](../pdf.worker.min.js#L22)
- **Code**: `await createImageBitmap(t)` where `t` is a Blob
- **Issue**: `createImageBitmap` polyfill not loaded for Safari <15.4. Async image processing in worker will throw `ReferenceError`. PDFs with images will fail to export.
- **Severity**: high

### F-06: sessionStorage Overflow With Large Image Data URLs — HIGH
- **File**: [home-app.js](../home-app.js#L498), lines 498–520
- **Code**:
  ```javascript
  var reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = function() {
    sessionStorage.setItem('cs_pending_image_dataurl', dataUrl);
  };
  ```
- **Issue**: Safari on iOS has strict limits on `sessionStorage` size (~5 MB). Large image data URLs will exceed quota silently. `FileReader` result encoding (UTF-16 overhead) can inflate size 2–4×. No fallback to Blob URL or ArrayBuffer.
- **Severity**: high

### F-07: canvas.toBlob May Hang Indefinitely on Safari — HIGH
- **File**: [stats-page.js](../stats-page.js#L480), line 480
- **Code**: `const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));`
- **Issue**: Safari's `toBlob` can hang indefinitely on large canvases or low-memory devices (iPad). No timeout. Promise never resolves; UI hangs.
- **Severity**: high

### F-08: Image Loading Race With Data URL
- **File**: [creator/useProjectIO.js](../creator/useProjectIO.js#L442), lines 442–449
- **Code**: `i.onload = proceed; i.src = ev.target.result;`
- **Issue**: Setting `img.src` after setting `onload` can miss the load event if the image is already cached (Safari synchronously fires `onload` before handler assignment completes in some versions). No `img.complete` check or `img.decode()` usage.
- **Severity**: high

### F-09: DataTransfer.items.getAsFile() Unavailable on Older Safari
- **File**: [creator/bundle.js](../creator/bundle.js#L7508), line 7508
- **Code**:
  ```javascript
  for (var i = 0; i < e.clipboardData.items.length; i++) {
    var item = e.clipboardData.items[i];
    if (item.kind === 'file') { var blob = item.getAsFile(); }
  }
  ```
- **Issue**: `clipboardData.items` is undefined on older Safari (<13). Fallback to `e.clipboardData.files` is missing. Paste image feature will silently fail.
- **Severity**: medium

### F-10: Service Worker Caching Strategy on iOS
- **File**: [sw.js](../sw.js#L150), lines 150–160
- **Code**: Network-first strategy for navigation requests
- **Issue**: Safari iOS aggressively clears SW cache (Intelligent Tracking Prevention). `cache: 'no-cache'` forces revalidation, but network errors on poor connections will not serve the stale copy. No fallback to manual cache keys.
- **Severity**: medium

### F-11: Worker Initialisation Throws Without Graceful Fallback
- **File**: [creator/pdfExport.js](../creator/pdfExport.js#L32), lines 32–45
- **Code**: Error thrown from Worker constructor is not caught by caller; PDF export crashes if Safari disables workers in private mode or strict CSP policies.
- **Severity**: medium

## TODO — Priority-Ordered Fix List

1. **[BLOCKER]** Fix Blob URL lifecycle in [creator/ExportTab.js](../creator/ExportTab.js) and [backup-restore.js](../backup-restore.js): Defer `revokeObjectURL` to at least 5 seconds after click, or use `navigator.msSaveOrOpenBlob()` pattern with proper detection.
2. **[BLOCKER]** Fix synchronous `revokeObjectURL` in [components-stats.js](../components-stats.js#L1280): Add `setTimeout(() => URL.revokeObjectURL(url), 5000)` instead of immediate call.
3. **[BLOCKER]** Add `OffscreenCanvas`/`convertToBlob` fallback in [pdf-export-worker.js](../pdf-export-worker.js): Detect availability of `convertToBlob` specifically and fall back to main-thread canvas + `toBlob()` via message.
4. **[HIGH]** Add `createImageBitmap` polyfill or fallback: Use `Image()` + `canvas.drawImage()` instead in Safari <15.4. Detect support before calling in Worker.
5. **[HIGH]** Fix `sessionStorage` overflow in [home-app.js](../home-app.js): Replace data URLs with `Blob URL` (`URL.createObjectURL()`), test with files >5 MB, add quota error handling.
6. **[HIGH]** Add `canvas.toBlob` timeout in [stats-page.js](../stats-page.js#L480): Wrap in `Promise.race` with 5-second timeout fallback to `toDataURL`.
7. **[HIGH]** Fix Image loading race in [creator/useProjectIO.js](../creator/useProjectIO.js): Check `img.complete` before proceeding; add `onerror` handler; add timeout guard.
8. **[MEDIUM]** Add `DataTransfer.items` fallback: check existence, fall back to `files` array on Safari <13.
9. **[MEDIUM]** Improve Service Worker cache recovery for iOS ITP eviction.
10. **[MEDIUM]** Add Worker initialisation error handling in [creator/pdfExport.js](../creator/pdfExport.js): Provide graceful error UI when worker cannot be spawned.
