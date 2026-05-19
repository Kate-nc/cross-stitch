# Cross-Platform Audit — Master Summary

> **Phase 2 synthesis** of Reports 01–08. Individual reports are in this directory.
>
> This summary identifies the root causes of the pattern creation failure on Safari,
> consolidates all findings into a single ordered TODO list, and flags which items
> are the highest-priority fixes.

---

## Root Causes of Pattern Creation Failure on Safari

These 6 issues together explain why pattern creation is broken or severely degraded on Safari. They should be fixed before anything else.

### ROOT CAUSE 1 — ctx.filter Not Available on Safari <15
**Report**: [03-pattern-creation-safari.md](03-pattern-creation-safari.md), F-04  
**File**: [creator/useCreatorState.js](../creator/useCreatorState.js#L1195)  
**What happens**: `cx.filter = "brightness(...) contrast(...) saturate(...)"` — the canvas filter API doesn't exist on Safari <15. The assignment silently does nothing, or throws a `TypeError` depending on context. Pattern generation produces incorrect colours or fails entirely. The user sees a blank canvas with no error message.  
**Likely occurrence frequency**: Every time a user adjusts image brightness/contrast/saturation before generating.

### ROOT CAUSE 2 — IDB Transaction Auto-Commit on `await` (Stash Data Silently Lost)
**Report**: [08-timing-async-microtask.md](08-timing-async-microtask.md), F-01/F-02  
**File**: [stash-bridge.js](../stash-bridge.js#L158)  
**What happens**: Safari closes IDB read/write transactions when execution yields to the microtask queue via `await`. `migrateSchemaToV2()`, `migrateSchemaToV3()`, `detectConflicts()`, and `whatCanIStart()` all use `await` inside transaction callbacks. On Safari, these writes are silently lost. Thread ownership data never migrates. Shopping list calculations return wrong results.  
**Likely occurrence frequency**: First time a Safari user's stash data is accessed after a schema change.

### ROOT CAUSE 3 — canvas.toBlob() Hangs Indefinitely
**Report**: [03-pattern-creation-safari.md](03-pattern-creation-safari.md), F-07; [05-file-io-blobs-downloads.md](05-file-io-blobs-downloads.md), F-07  
**Files**: [creator/ExportTab.js](../creator/ExportTab.js#L196), [stats-page.js](../stats-page.js#L480)  
**What happens**: Safari's `toBlob()` can hang indefinitely when the canvas is large or when system memory is constrained. No timeout guard exists. The export UI appears frozen; no error is shown. Closing and reopening the browser is the only recovery.  
**Likely occurrence frequency**: On large patterns (>150×150) or iOS devices with constrained memory.

### ROOT CAUSE 4 — Canvas Tainting / SecurityError from Data URLs
**Report**: [03-pattern-creation-safari.md](03-pattern-creation-safari.md), F-07; [08-timing-async-microtask.md](08-timing-async-microtask.md), F-03  
**Files**: [creator/canvasRenderer.js](../creator/canvasRenderer.js), [embroidery.js](../embroidery.js#L631)  
**What happens**: When an image loaded from a data URL is drawn to a canvas, Safari may mark that canvas as cross-origin tainted. Subsequent `getImageData()` throws `SecurityError`. Pattern generation aborts. In embroidery mode, `getImageData()` immediately after `drawImage()` may also return blank data due to synchronous-rendering differences between Safari and Chromium.  
**Likely occurrence frequency**: Every import workflow using data URLs.

### ROOT CAUSE 5 — OffscreenCanvas in PDF Worker (Safari <16.4)
**Reports**: [05-file-io-blobs-downloads.md](05-file-io-blobs-downloads.md), F-04; [06-fonts-media-codecs.md](06-fonts-media-codecs.md), F-02  
**File**: [pdf.worker.min.js](../pdf.worker.min.js)  
**What happens**: `OffscreenCanvas` and `convertToBlob()` are used in the bundled pdf.js worker. Safari <16.4 does not support `OffscreenCanvas`. PDF export fails entirely. The error propagates from the worker but is not surfaced to the user.  
**Likely occurrence frequency**: Every PDF export on Safari <16.4 (most users on macOS 12 or iOS 15).

### ROOT CAUSE 6 — CDN Resources Potentially Blocked by Safari ITP
**Report**: [07-storage-permissions-security.md](07-storage-permissions-security.md), F-03  
**Files**: [create.html](../create.html#L64), [home.html](../home.html#L28)  
**What happens**: React, ReactDOM, Babel Standalone, and Pako are loaded from `cdnjs.cloudflare.com`. Under Safari's Intelligent Tracking Prevention, third-party CDN resources can be blocked. If any of these are unavailable, the app fails entirely with "React is not defined" or similar. Users have no way to recover.  
**Likely occurrence frequency**: Uncommon but catastrophic when it happens (users may interpret the blank page as the app being broken).

---

## Consolidated Ordered TODO List

Items are ordered by severity and user impact. "Safari blocker" means the feature does not work at all on Safari without the fix.

### TIER 1 — Fix Immediately (Safari blockers / data loss)

| # | Fix | File(s) | Reports |
|---|---|---|---|
| 1 | Add `ctx.filter` feature detection; fallback to pixel manipulation | [creator/useCreatorState.js](../creator/useCreatorState.js) | 03 |
| 2 | Fix `await` inside IDB transactions in stash-bridge.js (remove awaits from transaction scope) | [stash-bridge.js](../stash-bridge.js) | 08 |
| 3 | Add `canvas.toBlob()` timeout via `Promise.race`; fall back to `toDataURL` | [creator/ExportTab.js](../creator/ExportTab.js), [stats-page.js](../stats-page.js) | 03, 05 |
| 4 | Handle canvas SecurityError from data URL tainting; check `img.complete` before `drawImage` | [embroidery.js](../embroidery.js), [creator/canvasRenderer.js](../creator/canvasRenderer.js) | 03, 08 |
| 5 | Add graceful fallback for OffscreenCanvas/convertToBlob unavailability in PDF worker | [pdf-export-worker.js](../pdf-export-worker.js) | 05, 06 |
| 6 | Fix Blob URL revocation race condition (defer `revokeObjectURL` to 5+ seconds post-click) | [creator/ExportTab.js](../creator/ExportTab.js), [backup-restore.js](../backup-restore.js), [components-stats.js](../components-stats.js) | 05 |
| 7 | Add IndexedDB private-browsing fallback + user-facing banner | [helpers.js](../helpers.js), [project-storage.js](../project-storage.js) | 01, 07 |
| 8 | Wrap `sessionStorage` access in sw-register.js in try/catch | [sw-register.js](../sw-register.js) | 07, 08 |

### TIER 2 — High Impact, Fix Soon

| # | Fix | File(s) | Reports |
|---|---|---|---|
| 9 | Add `metaKey` to tracker wheel zoom guard | [tracker-app.js](../tracker-app.js#L4914) | 04 |
| 10 | Normalise wheel `deltaY` for `deltaMode` (pixels/lines/pages) | [tracker-app.js](../tracker-app.js), [embroidery.js](../embroidery.js) | 04 |
| 11 | Add canvas size cap (16384px) before canvas assignment | [creator/PatternCanvas.js](../creator/PatternCanvas.js), [creator/PreviewCanvas.js](../creator/PreviewCanvas.js), [creator/RealisticCanvas.js](../creator/RealisticCanvas.js) | CQ-04 |
| 12 | Add `onerror`/timeout to all `Image()` constructor usages | [embroidery.js](../embroidery.js), [creator/useCreatorState.js](../creator/useCreatorState.js) | 03 |
| 13 | Add BroadcastChannel fallback via storage events (Safari <15.4) | [tracker-app.js](../tracker-app.js) | 07 |
| 14 | Add user warning for approaching Safari 7-day storage eviction | All pages | 07 |
| 15 | Add feature detection for `imageSmoothingQuality` | [tracker-app.js](../tracker-app.js), [creator/bundle.js](../creator/bundle.js), [creator/RealisticCanvas.js](../creator/RealisticCanvas.js) | 06 |
| 16 | Fix FileReader + sessionStorage overflow for large images | [home-app.js](../home-app.js) | 05 |
| 17 | Self-host or detect failure of CDN resources (React/Babel/Pako) | HTML entry points | 07 |
| 18 | Add fallback for `navigator.clipboard.write([ClipboardItem])` (Safari <15.1) | [stats-page.js](../stats-page.js) | 01 |

### TIER 3 — Medium Impact, Fix in Next Sprint

| # | Fix | File(s) | Reports |
|---|---|---|---|
| 19 | Add explicit locale to all `toLocaleString()` calls | [header.js](../header.js), [components-stats.js](../components-stats.js) | 01 |
| 20 | Fix `overscroll-behavior: none` (not supported in Safari) | [styles.css](../styles.css) | 02 |
| 21 | Add `aspect-ratio` width/height fallbacks for Safari <15 | [styles.css](../styles.css) | 02 |
| 22 | Add `gap` flex fallback margins for Safari <14.1 | [styles.css](../styles.css) | 02 |
| 23 | Verify `-webkit-line-clamp` parent display context | [styles.css](../styles.css) | 02 |
| 24 | Add `createImageBitmap` try/catch and fallback | [pdf-export-worker.js](../pdf-export-worker.js) | 06 |
| 25 | Reduce MAX_DIM in PDF worker from 65536 to 16384 (iOS limit) | [pdf-export-worker.js](../pdf-export-worker.js) | 06 |
| 26 | Fix double-requestAnimationFrame navigation timing | [home-app.js](../home-app.js) | 08 |
| 27 | Consolidate touch/pointer event strategy on Tracker canvas | [tracker-app.js](../tracker-app.js) | 01, 04 |
| 28 | Add Worker message request IDs for ordering guarantees | [generate-worker.js](../generate-worker.js), [analysis-worker.js](../analysis-worker.js) | 08 |

### TIER 4 — Polish and Robustness

| # | Fix | File(s) | Reports |
|---|---|---|---|
| 29 | Fix `DataTransfer.items` → `files` fallback on paste | [creator/bundle.js](../creator/bundle.js) | 05 |
| 30 | Add `:focus-visible` fallback for Safari 13–14 | [styles.css](../styles.css) | 02 |
| 31 | Test `calc() + env()` on iOS Safari 13–14 for notch layouts | [styles.css](../styles.css), [command-palette.js](../command-palette.js) | 02 |
| 32 | Document minimum supported Safari version | README, help overlay | — |
| 33 | Add `navigator.storage.estimate` UI fallback for Safari | [project-storage.js](../project-storage.js) | 07 |
| 34 | Document Safari 16.4+ requirement for PDF export | In-app UI | 06 |

---

## Cross-Report Theme Analysis

### Canvas and Rendering (Reports 03, 05, 06, 08)
Canvas operations are the biggest source of cross-browser bugs. The combination of `ctx.filter` unavailability, `getImageData` security errors, `toBlob` hanging, and `OffscreenCanvas` absence in the PDF worker means that on Safari <16, **both pattern generation and PDF export are likely broken**. These are all independent fixes.

### IndexedDB and Storage (Reports 07, 08)
The async/await-inside-transaction pattern in [stash-bridge.js](../stash-bridge.js) is the single highest-impact correctness bug. It causes **silent data loss** on Safari without any error surfacing to the user. Private browsing mode makes the app completely non-functional. Safari's 7-day eviction policy is an invisible data-loss risk.

### Input and Events (Reports 01, 04)
The `metaKey` missing from wheel zoom is a one-line fix with high user-experience impact. The event handling inconsistency between pointer events and touch events is a Safari iOS quality issue.

### Deployment Security (Report 07)
CDN dependency is a fragility risk. If `cdnjs.cloudflare.com` is blocked (ITP, corporate proxies, outages), the app fails entirely with no user feedback.

---

## Test Plan for Validation

Once fixes are applied, verify on:
1. **Safari 15.0 on macOS** — tests `ctx.filter` fallback, `toBlob` timeout, canvas tainting
2. **Safari 16.4 on macOS** — tests OffscreenCanvas PDF export
3. **iOS 16 Safari** — tests IDB private browsing, `toBlob` under memory pressure, canvas size cap
4. **Safari 14.1 on macOS** — tests flexbox `gap`, `aspect-ratio`, CSS baseline
5. **Chrome 120 on Windows** — regression check for all changes
6. **Firefox 121** — regression check, particularly for CSS and event handling
