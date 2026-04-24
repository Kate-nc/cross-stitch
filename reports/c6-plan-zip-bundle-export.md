# C6 — Zip Bundle Export Plan

## **C6 — Zip Bundle Export Plan**

### **Executive Summary**

- **Goal:** Add a single "Download bundle" action to the Creator's Export tab that packages PDF + OXS + PNG preview + JSON snapshot into one `.zip` for hand-off or archive.
- **Honest current state:** [creator/ExportTab.js](creator/ExportTab.js) only ships PDF and PNG today; the radio at [ExportTab.js#L252](creator/ExportTab.js#L252) is a 2-way switch. JSON save lives separately in [useProjectIO.js#L31](creator/useProjectIO.js#L31) (`doSaveProject`). **No OXS exporter exists** in the repo — [import-formats.js#L102](import-formats.js#L102) parses OXS but nothing writes it. C6 must therefore add an OXS writer **and** the bundler.
- **Library choice:** JSZip (~95 kB min) loaded lazily from `cdnjs.cloudflare.com` (already on the CSP allow-list at [index.html#L6](index.html#L6)). `pako` is present but only does deflate streams — not the central directory + headers a `.zip` needs. Hand-rolling that is out of scope.
- **Sequencing:** five PRs, each <200 LOC: (1) OXS writer + Jest tests, (2) JSZip lazy loader + bundler core + manifest, (3) Export-tab "Download bundle" button + checklist UI, (4) Mobile share-sheet + memory guard, (5) Honest-copy fix for the deferred B4 toast called out in [reports/ux-8-post-B-audit.md#L259](reports/ux-8-post-B-audit.md#L259).
- **Outcome:** one-tap archival download containing every export the user could otherwise produce piecemeal, plus a `manifest.json` so a future "Restore from bundle" import path is feasible without spec archaeology.

---

### **1. Goal**

C6 closes the "Bulk export" placeholder surfaced by the [home-screen.js](home-screen.js) toast that the [ux-8 audit](reports/ux-8-post-B-audit.md#L259) flagged as dishonest after B4 shipped without it. A user finishing a pattern should be able to click **once** and receive a self-contained `.zip` they can email to a stitcher, attach to a Ravelry-style listing, or drop into cloud storage as the canonical artefact for that project. The bundle must contain every shipping format (PDF, OXS, PNG preview, JSON) plus enough metadata that the bundle alone is sufficient to reconstruct the project later — no reliance on IndexedDB or the user's stash. The Export tab keeps its existing per-format controls; the bundle is an additive convenience, not a replacement.

---

### **2. Current Export Surface**

| Format | Trigger | Implementation | Notes |
|---|---|---|---|
| **PDF** | "Export PDF" CTA, [ExportTab.js#L340-343](creator/ExportTab.js#L340-L343) | `window.PdfExport.runExport` → worker → `downloadBytes`, [pdfExport.js#L70-L114](creator/pdfExport.js#L70-L114) | Heavy — runs in [pdf-export-worker.js](pdf-export-worker.js); ~2–10 s on a typical 80×80 chart. Returns `Uint8Array`. |
| **PNG** | Same CTA when `exportFormat === "png"`, [ExportTab.js#L171-L201](creator/ExportTab.js#L171-L201) | `canvas.toBlob(..., "image/png")` from a hidden render canvas | Already returns a `Blob`; trivial to redirect into a zip entry instead of an `<a download>`. |
| **JSON** | "Save project" in the Project tab → `doSaveProject`, [useProjectIO.js#L31-L93](creator/useProjectIO.js#L31-L93) | `Blob([JSON.stringify(project)])` + `<a download>` | Same project object the bundler needs; we should call this codepath in "build, don't download" mode. |
| **OXS** | **Does not exist.** [import-formats.js#L102](import-formats.js#L102) `parseOXS` is read-only. | — | Must be added. KG-Chart's OXS schema is small; ~150 LOC writer is realistic. |

The Export tab's "Quick presets" section (Pattern Keeper / Home printing) only changes PDF settings — the bundle button sits beside those, not inside them.

---

### **3. Proposed UX**

A new section in [ExportTab.js](creator/ExportTab.js), placed **above** the existing Format radio, titled **"Download as bundle"**:

```
┌─ Download as bundle ─────────────────────────────────┐
│ One .zip containing every format below. Useful for   │
│ archiving or sharing a finished pattern.             │
│                                                      │
│  ☑ PDF chart            (uses current PDF settings)  │
│  ☑ OXS (KG-Chart)       (universal pattern format)   │
│  ☑ PNG preview          (square thumbnail, 1024 px)  │
│  ☑ JSON snapshot        (full project, re-importable)│
│                                                      │
│  [ Icons.download ]  Download bundle                 │
│  Estimated size: ~2.4 MB                             │
└──────────────────────────────────────────────────────┘
```

Behaviour:

- All four checkboxes default on. Persisted under `UserPrefs` keys `exportBundlePdf` / `exportBundleOxs` / `exportBundlePng` / `exportBundleJson` (see the [preferences memory](#) — add four `DEFAULTS` entries).
- The CTA reuses `EXPORT_CTA_STYLE` from [ExportTab.js#L20](creator/ExportTab.js#L20) and calls `window.Icons.download()` for its leading glyph (no emoji).
- Progress is reported through the existing `progressState` / `runningRef` machinery so the spinner, percentage, and cancel affordance work exactly as for PDF export. Stages: `oxs` → `png` → `json` → `pdf` → `zip`.
- On completion: a `Toast.show({ message: "Bundle saved (2.4 MB)", type: "success", undoAction: null })`. On mobile, also call the Web Share Target path described in §11.
- Failure of any single format degrades gracefully: a warning toast lists the missing entry, and the bundle is still produced (e.g. PDF rendering crash should not block JSON+OXS+PNG export). Errors per format are surfaced via the existing `errorState`.

---

### **4. Bundle Structure**

```
my-cushion-pattern-2026-04-24-v11.zip
├── manifest.json              ← bundle metadata (see below)
├── pattern.pdf                ← Pattern Keeper preset by default
├── pattern.oxs                ← KG-Chart XML
├── preview.png                ← square 1024 px realistic render
├── project.json               ← full project snapshot (version 11)
└── README.txt                 ← short human-readable note
```

`manifest.json` schema (deliberately minimal — extend later, never break):

```json
{
  "bundleVersion": 1,
  "createdAt": "2026-04-24T12:34:56.789Z",
  "creatorApp": "cross-stitch-pwa",
  "creatorAppVersion": "<git short sha at build time>",
  "project": {
    "id": "proj_1712345678",
    "name": "My Cushion Pattern",
    "designer": "Katie",
    "schemaVersion": 11,
    "width": 80,
    "height": 80,
    "fabricCt": 14,
    "colourCount": 24
  },
  "files": {
    "pattern.pdf":  { "format": "pdf",  "preset": "patternKeeper", "bytes": 1843201 },
    "pattern.oxs":  { "format": "oxs",  "spec":   "kg-chart-1.0",  "bytes":  124003 },
    "preview.png":  { "format": "png",  "width":  1024, "height": 1024, "bytes": 287413 },
    "project.json": { "format": "json", "schema": 11,                    "bytes":  98221 }
  }
}
```

`README.txt` is plain ASCII (so it opens cleanly when a user double-clicks it on Windows), explaining what each file is for and pointing back to the project URL — this is **for the human recipient**, not the app. British English throughout.

The bundle must be re-importable: a future C6.1 "Open bundle…" path can detect `manifest.json`, prefer `project.json` for state, and fall back to `pattern.oxs` if the JSON is missing. The schema above gives that path enough to dispatch on.

---

### **5. Library Choice**

**Recommendation: JSZip 3.10.1 from cdnjs.**

| Option | Verdict | Rationale |
|---|---|---|
| **JSZip via CDN** | ✅ pick this | ~95 kB minified; battle-tested for browser zip authoring; supports streaming and `Uint8Array` inputs; cdnjs is already on the CSP allow-list at [index.html#L6](index.html#L6) so no policy change. |
| **pako-only** | ❌ no | `pako` (already loaded at [index.html#L34](index.html#L34)) only does raw DEFLATE. Producing a real `.zip` means writing local file headers, central directory, end-of-central-directory record, CRC32 calculation, and ZIP64 fallback for >4 GB. That's ~400 LOC of error-prone bit-twiddling we'd have to test ourselves — out of scope. |
| **fflate** | Considered | Smaller (~30 kB) and faster than JSZip but its zip writer is less ergonomic for our async/progress reporting needs. JSZip's `generateAsync({ type: "blob" }, onUpdate)` gives us the progress callback essentially for free. |

**Load strategy — lazy:** the bundle button is a low-traffic affordance, so JSZip should not block first paint. Use the existing `window.loadScript` helper (see [index.html#L82](index.html#L82) for the pdf.js precedent) and load `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js` on first click. Cache the promise so subsequent clicks are instant.

```js
// new helper in creator/bundleExport.js
function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (window.__jszipPromise) return window.__jszipPromise;
  window.__jszipPromise = window.loadScript(
    "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
  ).then(function () { return window.JSZip; });
  return window.__jszipPromise;
}
```

No `index.html` script tag needed; CSP already permits the host. Add a `<link rel="prefetch">` next to the existing pdf-lib prefetch at [index.html#L18](index.html#L18) so the file is warm in the cache before the user clicks.

---

### **6. Naming Convention**

```
{slug}-{yyyy-mm-dd}-v{schemaVersion}.zip
```

- `{slug}` — `state.projectName` lower-cased, ASCII-folded, non-`[a-z0-9]` collapsed to `-`, trimmed, capped at 48 chars. Reuse the `EXPORT_UNSAFE_FILENAME_CHARS` regex from [ExportTab.js#L17](creator/ExportTab.js#L17) but extend it to lower-case the result. Empty / all-stripped names fall back to `pattern`.
- `{yyyy-mm-dd}` — local date in user's timezone (matches what their file system shows). Not ISO timestamp — the seconds are noise in a filename and the colon (`:`) is illegal on Windows.
- `v{schemaVersion}` — the project JSON version (currently `11`, see [useProjectIO.js#L66](creator/useProjectIO.js#L66)). Lets the recipient eyeball whether their app can read it.

Examples:

```
my-cushion-pattern-2026-04-24-v11.zip
pattern-2026-04-24-v11.zip          ← no project name set
floral-sampler-x100-2026-04-24-v11.zip
```

Inside the zip, file names are **fixed** (`pattern.pdf`, `pattern.oxs`, etc.) regardless of project name — recipients can rename the outer zip without breaking the manifest's file map.

---

### **7. PDF / OXS / PNG / JSON — Re-use vs Re-generation**

The bundler must not duplicate work the existing pipelines already do. Plan:

| Format | Strategy | Implementation note |
|---|---|---|
| **PDF** | **Re-generate via worker** | Call `window.PdfExport.runExport(project, options, onProgress)` directly ([pdfExport.js#L70](creator/pdfExport.js#L70)) and capture the returned `Uint8Array` — instead of `downloadBytes`, we hand it to JSZip. No code duplication; the existing worker is the source of truth. |
| **OXS** | **Generate fresh** | New module `creator/oxsExport.js` exposing `window.OxsExport.serialize(project) → string`. Pure function over the project object; trivially unit-testable. ~150 LOC for the full KG-Chart schema (palette, fullstitches, backstitches; quarter-stitches optional in v1). |
| **PNG** | **Re-use existing capture** | Refactor [ExportTab.js#L171-L201](creator/ExportTab.js#L171-L201) `doExportPng` so the canvas-to-blob portion is extracted into `window.RealisticCanvas.captureBlob({ size: 1024 })` (or co-located helper). Bundler calls the helper; `doExportPng` keeps using it for solo export. |
| **JSON** | **Re-use snapshot, skip download** | Extract the project-object construction in [useProjectIO.js#L48-L75](creator/useProjectIO.js#L48-L75) into `state.buildProjectSnapshot()` returning the object (no Blob, no `<a>` click). `doSaveProject` calls it then handles the download; bundler calls it then `JSON.stringify`s into a zip entry. |

Refactor cost is small (one helper per format, no behaviour change to the standalone download buttons). The unit tests added in §10 run against the helpers, not the download wrappers, so we get coverage on paths the existing tests don't exercise.

---

### **8. Sequencing — five PRs, each <200 LOC**

Each PR is independently mergeable, ships green tests, and leaves the app in a working state.

#### **PR 1 — OXS writer + Jest tests** (~180 LOC)

- New file `oxs-export.js` (root, sibling of `import-formats.js`) exposing `window.OxsExport.serialize(project)`.
- New test `tests/oxsExport.test.js`: round-trip a fixture project through `serialize` → `parseOXS` ([import-formats.js#L102](import-formats.js#L102)) and assert palette + dimensions + stitch grid match.
- Add `<script src="oxs-export.js">` to [index.html](index.html) load order, immediately after `import-formats.js`.
- No UI change; the writer is just available on `window` for PR 3.

#### **PR 2 — Bundler core + JSZip lazy loader + manifest** (~180 LOC)

- New `creator/bundleExport.js` exposing `window.BundleExport.build(project, options, onProgress)` returning `Promise<Blob>`.
- Lazy `loadJSZip()` helper as in §5.
- `manifest.json` builder + filename slug helper (with Jest tests at `tests/bundleNaming.test.js` and `tests/bundleManifest.test.js`).
- Refactor `doSaveProject` ([useProjectIO.js#L31](creator/useProjectIO.js#L31)) to expose `buildProjectSnapshot()` per §7.
- Wire into `build-creator-bundle.js` so `bundleExport.js` is in the concatenation.
- No UI yet — verifiable by pasting `await window.BundleExport.build(state, {...})` into DevTools.

#### **PR 3 — Export tab "Download bundle" UI** (~150 LOC)

- New "Download as bundle" section in [ExportTab.js](creator/ExportTab.js) (above the Format radio at [L252](creator/ExportTab.js#L252)).
- Four checkboxes wired to new `UserPrefs` keys (`exportBundle{Pdf,Oxs,Png,Json}` defaulting to `true`).
- CTA uses `window.Icons.download()`; existing `EXPORT_CTA_STYLE` for the button.
- Progress UI reuses the existing `progressState` machinery already wired for PDF.
- Estimated-size readout: sum of last-known sizes (PDF from prior export if present in `UserPrefs.lastPdfBytes`, JSON via `JSON.stringify(state).length` cheap probe, OXS via a quick dry-run, PNG via canvas dimensions × 0.4). Hide the readout if any unknown.
- Rebuild the creator bundle (`node build-creator-bundle.js`) and bump `CREATOR_CACHE_KEY` per the cached creator-build memory.

#### **PR 4 — Mobile share-sheet + memory guard** (~120 LOC)

- After successful bundle build, on touch viewports (`window.matchMedia("(pointer: coarse)").matches`), call `navigator.share({ files: [new File([blob], filename)] })` if `navigator.canShare` returns true. Fall back to the standard download.
- Memory guard: if `state.sW * state.sH > 200 * 200`, show a confirm modal first ("Large pattern — bundle may be ~10 MB and could crash on older phones. Continue?"). Modal uses the existing modals.js shell, no `window.confirm`.
- `URL.revokeObjectURL` after the download/share completes (5 s timeout).

#### **PR 5 — Honest-copy fix + docs** (~60 LOC)

- Replace the dishonest "Bulk export coming in B4" toast in [home-screen.js](home-screen.js) (called out in [audit §8](reports/ux-8-post-B-audit.md#L259)) with either removal of the placeholder or, now that C6 ships, a deep-link to the Creator's Export tab.
- Update README + `EXPORT_QUICKSTART.md` with the new bundle option.
- Add `BUNDLE_EXPORT_TEST_PLAN.md` per the docs convention captured in repo memory (`*_TEST_PLAN.md` suffix).

---

### **9. Tests Required**

#### **Jest (extracted via fs+eval per the existing pattern)**

| Test file | Coverage |
|---|---|
| `tests/oxsExport.test.js` | Serialize a fixture project → parse the result with `parseOXS` → assert dimensions, palette, full-stitch positions match. Edge case: blend cells (`"310+550"`) round-trip as two stitches at the same position with both colours. |
| `tests/bundleNaming.test.js` | `bundleFilename({name:"My Cushion!", schemaVersion:11, date:"2026-04-24"})` → `"my-cushion-2026-04-24-v11.zip"`. Empty name, unicode name, 100-char name, name with path separators (`../etc/passwd` → `etc-passwd` after sanitisation). |
| `tests/bundleManifest.test.js` | Manifest object shape: required keys present, byte counts non-negative, file map only includes formats actually requested, ISO 8601 `createdAt`. |
| `tests/bundleSnapshot.test.js` | `buildProjectSnapshot(state)` returns an object with `version: 11` and is JSON-serialisable (no `Map`, no `Set`, no `undefined` cycles). Same shape as what `doSaveProject` writes to disk. |

JSZip itself is not tested — it's a third-party library and assertions on the zip binary would be brittle. We assert on the inputs we hand to it.

#### **Playwright (end-to-end)**

`tests/playwright/bundle-export.spec.js`:

1. Generate a small (16×16) test pattern via the deterministic fixture path used by other Playwright tests.
2. Open the Export tab, scroll to "Download as bundle".
3. Toggle off PNG to verify checkboxes work.
4. Click "Download bundle"; capture the download via Playwright's `page.waitForEvent("download")`.
5. Save to a temp dir; unzip with Node's `adm-zip` (dev-dep) or `unzipper`.
6. Assert: `manifest.json` exists, lists exactly `pattern.pdf`, `pattern.oxs`, `project.json` (no PNG), and the byte counts match the file sizes on disk.
7. Assert: `project.json` parses and has `version: 11` and the test pattern's name.

#### **Manual QA — `BUNDLE_EXPORT_TEST_PLAN.md`**

- Cancel mid-export — partial blob must not be downloaded; spinner clears.
- Slow 3G simulated network — JSZip CDN load shows progress, doesn't block UI.
- `navigator.share` available (Android Chrome) → share sheet appears, no double download.
- Run twice in succession — second click reuses cached JSZip, < 200 ms to first progress event.
- Refresh during export — IndexedDB autosave still completes, no orphan workers.

---

### **10. Mobile (≤480 px) Considerations**

- **Memory ceiling:** iOS Safari typically tabs-out around 1 GB resident; a 200×200 chart with PDF + OXS + 1024 px PNG may peak near that during JSZip's compression pass. The PR 4 confirm-prompt for >200×200 is a hard guard, not a polish item. Recipe: stream entries through JSZip's `generateAsync({ streamFiles: true })` rather than holding all four formats in memory simultaneously, and `null` out each entry's source `Uint8Array` immediately after passing it to JSZip.
- **Share-sheet:** `navigator.share({ files })` is the right primitive on mobile — saves the user a trip to Files / Photos. Feature-detect with `navigator.canShare?.({ files: [testFile] })`; fall back silently if missing (older iOS versions, Firefox Android).
- **Touch target:** the bundle CTA must be ≥44 px tall (existing `EXPORT_CTA_STYLE` is 14+22+14 = 50 px ✓). Checkboxes wrap each in an `<label>` with `display: flex; gap: 12px; min-height: 44px;` per the mobile-form conventions in repo memory.
- **Filename input:** on iOS the share-sheet filename comes from the `File` constructor's name argument — must use the slug from §6, not a random hash, or users see `tmp_47Qa.zip` in their share sheet.
- **Spinner overflow:** repo memory flags this as a recurring B4 mobile bug. Confine the progress spinner inside the bundle section's container; do not let it set its own width based on percentage text.
- **Background tab:** browsers throttle workers in background tabs. Display a "Keep this tab in the foreground until the bundle finishes" hint once the user clicks, dismiss after first progress tick.

---

### **11. Effort Estimate**

**Size: M** (matches the audit's original sizing in [reports/ux-8-post-B-audit.md#L276](reports/ux-8-post-B-audit.md#L276)).

Rough breakdown:

| PR | Complexity | Notes |
|---|---|---|
| PR 1 (OXS writer + tests) | Medium | Schema is small but round-trip tests need real fixtures. |
| PR 2 (bundler core) | Medium | JSZip is friendly; the work is in the snapshot refactor, not the zip itself. |
| PR 3 (UI) | Low | Boilerplate + UserPrefs wiring matches existing Export tab patterns. |
| PR 4 (mobile + memory) | Medium | Share-sheet feature detection has gotchas across Android Chrome / iOS Safari versions. |
| PR 5 (copy fix + docs) | Low | One toast string + two markdown files. |

Total LOC across all PRs: ~700 (well under the 1 000 LOC ceiling that would have argued for splitting differently).

---

### **12. Risks**

- **Browser memory limits.** Large patterns (>200×200) plus a high-res cover image can push the simultaneous in-memory footprint over 500 MB. Mitigation: confirm-prompt + streaming generate (§10). Worst case: the PR 4 guard can be tightened to refuse rather than warn.
- **Service-worker `Content-Disposition` interference.** [sw.js](sw.js) currently passes-through fetch responses, but if a future caching policy intercepts the JSZip CDN load it could serve a stale version. Mitigation: pin JSZip to `3.10.1` in the URL (immutable on cdnjs), exclude `cdnjs.cloudflare.com` from any future SW cache rule.
- **CSP regressions.** [index.html#L6](index.html#L6) lists `cdnjs.cloudflare.com` for both `script-src` and `connect-src`. JSZip is fine. If a future tightening removes the host, this feature breaks silently — add a console error in the lazy loader's catch path so the regression is loud.
- **OXS round-trip fidelity.** Quarter-stitches and french knots are not in the v1 OXS writer. Mitigation: emit a `<!-- partial-stitches: dropped -->` comment in the OXS and surface a warning toast to the user when the project contains them.
- **Deterministic builds.** `creator/bundle.js` is a committed artefact (per repo memory). A bundler that touches `useProjectIO.js` will produce a diff in `bundle.js` — must be regenerated and committed atomically per the cache-key memory.
- **JSON snapshot grows over time.** Today the project object is ~50–500 kB. Future schemas (photo references, multi-stitch types) could push it past Gmail's 25 MB attachment cap when bundled with PDF. Mitigation: surface bundle size in the UI (§3) so the user can de-select PDF for email-bound bundles.
- **Filename collisions on download.** Browsers append `(1)` to duplicate filenames; that's fine, but if the user exports twice in 30 s with the same project, the date-only filename is identical. Acceptable for v1.

---

### **13. Open Questions**

1. **Should `manifest.json` include the user's `designer` field** (already in the project object at [useProjectIO.js#L62](creator/useProjectIO.js#L62)) **or omit it for privacy?** Recommendation: include it because it's already in `project.json` inside the same bundle — no new disclosure — but make this explicit in the README.txt.
2. **PNG preview source:** the realistic-canvas render or the chart-with-symbols render? The realistic render reads better as a thumbnail; the chart render is more useful for "preview before I print". Lean realistic; add a checkbox sub-option in v2 if requested.
3. **Should "Download bundle" replace the per-format buttons** once it ships? Recommendation: keep both. The bundle is for archival; per-format export is for when the user wants only the PDF for the printer.
4. **Backstitch in OXS:** `parseOXS` reads them ([import-formats.js#L102](import-formats.js#L102)+); does the writer need to emit them? Yes, otherwise round-trip drops user data. Adds ~30 LOC to PR 1.
5. **Bundle import path (C6.1?)** — out of scope for C6 itself, but the manifest format should be designed assuming we'll want it. Done in §4.
6. **Telemetry** — do we need to know how often this is used? The repo currently has no analytics; leave as a future concern.

---

### **14. References**

- [reports/ux-8-post-B-audit.md#L259](reports/ux-8-post-B-audit.md#L259) — original C6 line item + dishonest-toast callout.
- [reports/ux-8-post-B-audit.md#L276](reports/ux-8-post-B-audit.md#L276) — Quarter C backlog table.
- [reports/c3-plan-b2-default-on.md](reports/c3-plan-b2-default-on.md) — style template followed here.
- [creator/ExportTab.js](creator/ExportTab.js) — current Export panel (PDF + PNG only).
- [creator/pdfExport.js#L70](creator/pdfExport.js#L70) — `runExport` returning `Uint8Array`, the bundler's PDF source.
- [creator/useProjectIO.js#L31](creator/useProjectIO.js#L31) — `doSaveProject`, the JSON snapshot codepath to refactor.
- [import-formats.js#L102](import-formats.js#L102) — `parseOXS` (the only existing OXS code; writer must be added).
- [index.html#L6](index.html#L6) — CSP that already permits `cdnjs.cloudflare.com`.
- [index.html#L18](index.html#L18) — pdf-lib `<link rel="prefetch">` precedent for the JSZip prefetch.
- [index.html#L82](index.html#L82) — `loadScript` precedent for lazy CDN loading.
- [icons.js](icons.js) — `Icons.download` (must exist; if not, add it per the icon convention).
- [build-creator-bundle.js](build-creator-bundle.js) — must include the new `creator/bundleExport.js`.
- JSZip docs: <https://stuk.github.io/jszip/documentation/howto/write_zip.html>
- Web Share API (Files): <https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share>
