# 01 — Create mode

> Phase 2, area 1. Covers `appMode === "create"` in the Creator: import,
> prepare, generation pipeline, and the create→edit transition. The cleanup
> overlay, edit tools, and tracker are out of scope for this file (covered in
> [02-cleanup.md](02-cleanup.md), [03-edit.md](03-edit.md), [04-track.md](04-track.md)).

Existing UX inventory for this surface lives at [reports/create-flow-audit.md](../create-flow-audit.md);
this report is correctness-only and does not duplicate it.

---

## 1. Surface scope

Code that is active while `appMode === "create"`:

| File | Role |
|---|---|
| [creator/useCreatorState.js](../../creator/useCreatorState.js) | Owns all React state; defines `applyResultRef` (post-pipeline reducer) and `getOrCreateWorker` |
| [creator/generate.js](../../creator/generate.js) | `runGenerationPipeline` (main-thread fallback) and shared helpers |
| [generate-worker.js](../../generate-worker.js) | Web Worker for quantize → dither → map → orphan-removal |
| [analysis-worker.js](../../analysis-worker.js) | Separate worker for stash-constrained palette analysis |
| [creator/PrepareTab.js](../../creator/PrepareTab.js) | Image preparation sidebar tab |
| [creator/CropModal.js](../../creator/CropModal.js) | Crop dialog |
| [creator/ImportWizard.js](../../creator/ImportWizard.js) + [creator/import-wizard-bundle.js](../../creator/import-wizard-bundle.js) | Five-step new-import wizard |
| [import-formats.js](../../import-formats.js) | `.oxs`, `.json`, image, and PDF parsers |
| [pdf-importer.js](../../pdf-importer.js) | Pattern Keeper-compatible PDF reader |
| [colour-utils.js](../../colour-utils.js) | `quantize`, `doDither`, `doMap`, `removeOrphanStitches` |
| [embroidery.js](../../embroidery.js) | Bilateral filter, edge map, saliency |

Sidebar tabs visible in create mode: **Image**, **Dimensions**, **Palette**,
**Fabric**, **Adjust**, **Background**, **Cleanup**. ActionBar shows
**Generate** (primary) and **Start blank**.

---

## 2. Wiring correctness

### 2.1 File → state

[useProjectIO.js handleFile](../../creator/useProjectIO.js#L415-L460) is the
single funnel for image uploads. Flow:

1. `FileReader.readAsDataURL` (image) or `readAsText`/`readAsArrayBuffer` (oxs/pdf/json).
2. Decode `Image()`; if oversized, downscale through an offscreen canvas to
   `MAX_AREA = 2000 × 2000`.
3. `state.userActedRef.current = true`, `setOrigW/H`, default `sW=80`, `sH=80/aspect`.
4. `state.setImg(scaledImg)` then `state.resetAll()` then `setIsUploading(false)`.

`resetAll` ([useCreatorState.js:818-822](../../creator/useCreatorState.js#L818-L822))
clears: `pat`, `pal`, `cmap`, `done`, `parkMarkers`, `bsLines`, `editHistory`,
`redoHistory`, `confettiData`, `cleanupOpen`, `isCropping`, `cropRect`,
`hasGenerated`, `previewUrl`, `previewStats`. **Verified correct** — every
slot a fresh project needs to start from zero is in the list.

### 2.2 State → preview worker

[creator/usePreview.js](../../creator/usePreview.js) consumes
`state.conversionSettings` (a `useMemo` bundle) and `state.img`. Settings
bundle dependencies are explicit. Fast-pass (no dither) is rendered
synchronously; full pass is scheduled with `setTimeout(0)` and superseded
results are discarded by `reqId`. **Correct.**

### 2.3 Generate-worker lifecycle

`getOrCreateWorker` ([useCreatorState.js:1042-1080](../../creator/useCreatorState.js#L1042-L1080)):

- Creates `new Worker('generate-worker.js')` lazily.
- Caches in `workerRef.current`.
- On `onerror` (uncaught), terminates and sets `workerRef.current = 'unavailable'`.
- On `onmessage` with `type === 'error'`:
  * If `msg.reqId !== genReqIdRef.current` → terminate worker, **does not null `workerRef.current`** (see bug C-1).
  * Otherwise → terminate + null + clear progress + `setBusy(false)`.

The worker is **terminated** but not nulled on the stale-error branch. This
is a real bug; see §6 C-1.

There is **no `useEffect(() => () => workerRef.current?.terminate(), [])`**
cleanup on Creator unmount. In the SPA/UnifiedApp path on `index.html`,
unmounting the CreatorApp will leak the worker. In the hard-reload path
this is harmless because the page navigation kills the worker. See C-2.

### 2.4 Pipeline → state transition

`applyResultRef.current` ([useCreatorState.js:976-1040](../../creator/useCreatorState.js#L976-L1040))
is rebuilt every render so it captures fresh `sW/sH/hasGenerated`. It
short-circuits on superseded `reqId` and on grid-size mismatch. On success
it sets `pat`/`pal`/`cmap`, fresh `done` `Uint8Array`, empty
`parkMarkers`, empty `threadOwned`, empty `editHistory`/`redoHistory`,
captures `lastGenSnapshot`/`genPatSnapshot`, computes `cleanupDiff` from
`preCleanupIds`, collapses sidebar accordions on first-ever generation,
and finally `setAppMode("edit"); setSidebarTab("palette")`. **Wiring is
correct**, but the unconditional reset of `done` and `parkMarkers` is the
INT-3 bug surface — see C-3.

---

## 3. State correctness

| Question | Answer |
|---|---|
| Does a new image clear stale pattern state? | Yes (`resetAll`). |
| Does cancelling a pending generation leave dead state? | No — `reqId` short-circuit; preview debounce is cleared in `usePreview` effect cleanup. |
| Does an error abort the pipeline cleanly? | Mostly — see C-1 (stale-error path leaves a stale `workerRef`). |
| Are settings captured atomically for `lastGenSnapshot`? | Yes, captured inside the same `applyResultRef` call. |
| Is `lastGenSnapshot` complete? | **No** — missing `orphans`, `stitchCleanup`, `bgCol`, `bgTh`, `smooth`, `smoothType`. See C-4. |
| Are workers leaked on unmount? | Yes if Creator unmounts via UnifiedApp; see C-2. |

---

## 4. Per-feature behaviour and edge cases

### 4.1 Import: image (drag/drop, file input, paste)

Drop, paste and file-input all converge on `handleFile`. Decode pipeline
applies EXIF orientation via `img.decode()` (with `complete`-check fallback
when `decode()` rejects). Down-scales to ≤4 Mpx. Sets default `sW=80`,
`sH=Math.round(80/aspect)`.

Edge cases:
- **Transparent-only PNG**: `parseImagePattern` (not in create mode — it's
  called only by import-formats for image-as-pattern direct imports).
  Direct image upload goes to the prepare→generate path, where the
  generator will quantize transparent pixels as their underlying RGB
  (transparency is flattened on draw). No crash.
- **Animated GIF / WebP**: First frame is decoded. Subsequent frames are
  discarded. No issue.
- **HEIC**: Some Safari versions cannot decode HEIC via `Image()`.
  `onerror` handler fires, `setIsUploading(false)` runs, **no toast**. UX
  issue — see C-5.
- **Double-click upload button**: Two FileReaders race; both complete and
  call `setImg` + `resetAll` sequentially. Last-wins; harmless.
- **Drop while generating**: Drop handler fires, `setImg` + `resetAll`
  clears `hasGenerated` and `pat`. The in-flight worker response is
  discarded by `reqId` check. **Correct.**

### 4.2 Import: .oxs (KG-Chart XML)

[import-formats.js parseOXS](../../import-formats.js):

- Validates against DOMParser `parsererror`.
- Caps dimensions at 5000×5000 (throws otherwise).
- Maps palette by DMC number, then by DMC name, then by closest RGB.
- Extracts backstitches (`bsLines`).
- Throws `"No valid stitches found in pattern"` on empty result.

Edge case: an OXS that defines a palette colour twice with different DMC
ids — first wins. Verified by reading the dedup logic. Likely intentional.

### 4.3 Import: .json

Round-trips Creator's own exported JSON. Reads `result.pattern`,
`result.width`, `result.height`. **There is no explicit assertion that
`pattern.length === width * height`.** A truncated or hand-edited JSON
with mismatched dimensions will produce a broken project that fails later
in canvas rendering or `done`-array allocation. See C-6.

### 4.4 Import: .pdf

[pdf-importer.js](../../pdf-importer.js): Pattern Keeper-compatible.
Throws `"This PDF is password-protected"` on PasswordException. Yields to
browser between stages to keep UI responsive. **No wall-clock timeout** —
a malicious or pathological PDF could hang the import indefinitely. Low
risk in practice.

### 4.5 Import: drag-drop (window-level)

Window-level `dragover`/`drop` handler is registered by header.js. Handler
calls `handleFile` if the dropped file matches one of the supported
extensions. No issues found.

### 4.6 Prepare tab (crop, filters)

- Crop: [creator/CropModal.js](../../creator/CropModal.js). On commit,
  draws the cropped sub-rect to a new canvas and assigns to `state.img`.
  Aspect ratio is recomputed and `sW`/`sH` reset. **Correct.**
- Filters (brightness/contrast/saturation/smoothing): applied to the
  preview canvas via canvas `ctx.filter` first, falling back to per-pixel
  if `ctx.filter` unsupported. Preview cache key includes all filter
  values, so changing a slider invalidates the geometry cache correctly.

### 4.7 Generate pipeline (full pass)

Pipeline order (worker side):

1. **Downsample** to `sW × sH` via `drawImage`.
2. **Smooth** if `smooth > 0` (Gaussian or median per `smoothType`).
3. **Background skip** if `skipBg` (matches against `bgCol` within `bgTh`).
4. **Quantize** (k-means in CIELAB) to `maxC` colours, optionally
   constrained by `allowedPalette` (stash-only mode).
5. **Dither** if `dith` (Floyd-Steinberg by default; `dithMode` chooses
   variant).
6. **Map** every cell to the nearest DMC entry, optionally allowing
   blends (`allowBlends`).
7. **Minimum stitch count rebucket** (`minSt`): colours used below
   threshold are reassigned to their nearest neighbour and removed from
   the palette.
8. **Orphan removal** (controlled by `stitchCleanup`): connected-component
   labelling, removes components ≤ `maxOrphanSize` weighted by saliency.

Edge cases:
- **Pipeline stages have no individual timeout** — see C-7.
- **Stale-error worker bug** — see C-1.
- **Multiple rapid Generate clicks**: each bumps `genReqIdRef.current`,
  the result of the older request is discarded by the `reqId` check in
  `applyResultRef`. Correct.
- **Cancel during generation**: Setting `genReqIdRef.current` to a new
  value (e.g. via `resetAll`) does not currently `terminate()` the
  running worker — it merely discards the result on arrival. The CPU
  burn continues silently. Low impact but worth recording — see C-8.

### 4.8 Scratch mode (Start blank)

`startScratch` ([useCreatorState.js:904-925](../../creator/useCreatorState.js#L904-L925))
asks for confirmation if there is unsaved work, then `resetAll`,
`setIsScratchMode(true)`, `initBlankGrid(80, 80)` (`__empty__` cells),
sets `appMode="edit"`, `sidebarTab="palette"`. **Correct.** A scratch
project never goes through the worker pipeline.

### 4.9 Re-convert (back to convert from edit)

`confirmBackToConvert` sets `appMode="create"` without clearing `pat`/`pal`
— the panel becomes interactive again so the user can tweak settings.
The next Generate goes through `applyResultRef` and replaces everything.
This is intentional. However:

- `bsLines` are **not** cleared. After re-convert, the user can still
  see and edit backstitches drawn over the previous pattern. After the
  next generation those backstitches sit on top of an entirely different
  colourisation. Documented in [00-system-map.md §5.1](00-system-map.md#51-transitions-that-exist-but-are-not-symmetric). See C-9.
- `parkMarkers`, `threadOwned`, `done`, `editHistory`, and `redoHistory`
  are reset by the next `applyResultRef`. If the user backs out without
  regenerating, the in-edit state is still there — fine.

---

## 5. Integration points

### 5.1 Inbound from Home

| Key | Source | Consumed by |
|---|---|---|
| `pending_home_image` | [home-app.js](../../home-app.js) | `useCreatorState` initial effect |
| `cs_pending_image_dataurl` | home-app.js | useProjectIO initial-load branch (via `window.__pendingCreatorFile`) |
| `cs_pend_meta` | home-app.js typed metadata | Restored into `projectName`/`projectDesigner`/`projectDescription` after `resetAll`, then cleared |
| `window.__pendingCreatorAction` | home-app.js | Triggers scratch mode or wizard mode |

The pending-meta restore happens *after* `resetAll`, so the cleared state
is repopulated correctly. **Verified.**

### 5.2 Inbound from Tracker (back-edit)

`crossstitch_handoff_to_creator` is consumed by
[useProjectIO.js:509-521](../../creator/useProjectIO.js#L509-L521). Calls
`processLoadedProject`, which mirrors tracker-only fields into
`state.trackerFieldsRef.current` so subsequent Creator auto-saves preserve
them ([useProjectIO.js:298-324](../../creator/useProjectIO.js#L298-L324)).
On load, if the project has `done.some(v => v === 1)`, an `alert()` warns
that editing here may reset progress — but the wording is misleading: only
*regenerate* resets `done`, not normal editing. See C-3.

### 5.3 Outbound to Edit

The "outbound to edit" transition is internal (no navigation): triggered
by `applyResultRef` setting `appMode="edit"` and `sidebarTab="palette"`.

### 5.4 Outbound to Tracker

Triggered by `handleOpenInTracker` from edit mode, not from create mode.
Covered in [03-edit.md](03-edit.md) §5 and [06-integration.md](06-integration.md).

---

## 6. Bugs found

Each bug ID is unique within this report. Severity scale:
`critical` > `high` > `medium` > `low` > `info`. Classification:
`[auto-fix]` = behaviour-preserving correctness fix safe to apply,
`[needs-approval]` = behaviour change, `[question]` = design question.

### C-1 — Stale worker error leaves a terminated worker cached
**File**: [creator/useCreatorState.js:1058-1062](../../creator/useCreatorState.js#L1058-L1062)
**Severity**: medium
**Classification**: [auto-fix]

```js
if (msg.type === 'error') {
  // Ignore errors from superseded requests (stale worker responses)
  if (msg.reqId !== undefined && msg.reqId !== genReqIdRef.current) {
    w.terminate(); return;          // ← terminates but leaves workerRef.current pointing at it
  }
  console.error('Worker generation error:', msg.message, msg.stack || '');
  w.terminate();
  workerRef.current = null;          // ← only nulled in the non-stale branch
  ...
}
```

**Repro**: Click Generate. Before it completes, change settings and click
Generate again. If the *first* request errors out *after* the second
request was sent, the stale-error branch terminates the worker but does
not null `workerRef.current`. The second request's reply will arrive on
the terminated worker (no callback fires), and the user sees the spinner
hang. Subsequent Generate clicks call `getOrCreateWorker`, which returns
the cached terminated worker.

**Fix**: Null `workerRef.current` in the stale-error branch too:
```js
if (msg.reqId !== undefined && msg.reqId !== genReqIdRef.current) {
  w.terminate();
  workerRef.current = null;
  return;
}
```

**Regression test**: Mock `Worker`, post a `result` for `reqId=1`, then
post an `error` for `reqId=0`. Assert `workerRef.current === null` and
that a fresh `getOrCreateWorker()` call constructs a new Worker.

---

### C-2 — Generate worker not terminated on Creator unmount
**File**: [creator/useCreatorState.js:1042](../../creator/useCreatorState.js#L1042) (and surrounding scope)
**Severity**: low
**Classification**: [auto-fix]

`workerRef.current` is created in `getOrCreateWorker` but there is no
`useEffect(() => () => workerRef.current?.terminate?.(), [])` cleanup.
[creator/useCleanupMode.js:104](../../creator/useCleanupMode.js#L104)
already follows the correct pattern for its own worker.

**Repro**: On `index.html` (UnifiedApp), switch from `design` mode to
`track` mode while a generation is mid-flight. The Creator subtree
unmounts; the worker keeps spinning in the background.

**Fix**: Add a one-line cleanup `useEffect` next to the worker creation:
```js
React.useEffect(function() {
  return function() {
    if (workerRef.current && workerRef.current !== 'unavailable') {
      try { workerRef.current.terminate(); } catch (_) {}
      workerRef.current = null;
    }
  };
}, []);
```

---

### C-3 — Regenerate silently wipes `done` / `parkMarkers` when project has progress
**File**: [creator/useCreatorState.js:986-987](../../creator/useCreatorState.js#L986-L987)
**Severity**: high
**Classification**: [auto-fix] (per user direction on INT-3)

```js
setDone(new Uint8Array(result.mapped.length));
setParkMarkers([]); setTab("pattern"); setThreadOwned({});
```

This is the action layer behind [00-system-map.md INT-3](00-system-map.md#41-shared-state-inventory).
The load-time `alert("This pattern has tracking progress…")` in
[useProjectIO.js:515](../../creator/useProjectIO.js#L515) is the only
warning, and it fires on **load**, not on **Generate** — and it incorrectly
implies that *any* editing will reset progress when in fact only this
specific code path does.

**Repro**:
1. Mark some stitches in the Tracker.
2. Click "Edit pattern" → arrive in Creator with `done` populated.
3. Open the Image tab; press Generate.
4. Progress silently wiped; no confirm.

**Fix** (per user direction): Surface a confirm dialog at Generate time
when `done.some(v => v === 1)`. The check belongs in whichever callsite
invokes the worker (search for `genReqIdRef.current++` in
[creator/useCreatorState.js](../../creator/useCreatorState.js)). Show a
modal (use [modals.js](../../modals.js) `showConfirm`) with:

> Regenerating will reset your stitching progress on this pattern.
> *N* stitches will be marked unstitched again.
> [Cancel] [Regenerate anyway]

Also: revise the load-time alert in `useProjectIO.js` to:

> This pattern has stitching progress. Editing tools will not affect it,
> but regenerating from the Image tab will reset it.

**Regression test**: Mount Creator with a loaded project whose `done` has
non-zero entries. Trigger generate. Assert that `applyResultRef.current`
is *not* invoked unless the confirm dialog is resolved positively.

---

### C-4 — `lastGenSnapshot` does not include all pipeline inputs
**File**: [creator/useCreatorState.js:988-991](../../creator/useCreatorState.js#L988-L991)
**Severity**: low
**Classification**: [question]

```js
setLastGenSnapshot({
  sW: sW, sH: sH, fabricCt: fabricCt, maxC: maxC,
  bri: bri, con: con, sat: sat, dith: dith, dithMode: dithMode,
  allowBlends: allowBlends, skipBg: skipBg
});
```

Used by the Sidebar to detect "values changed" and surface a "Regenerate"
CTA. Missing: `orphans`, `stitchCleanup`, `bgCol`, `bgTh`, `smooth`,
`smoothType`, `minSt`, and stash-only mode. Tweaking any of those will
*not* surface the CTA, even though it would change the pipeline output.

**Question**: Is this intentional (e.g. those settings are accessible from
panels that don't need the drift CTA) or a genuine oversight?

---

### C-5 — Image decode failure shows no toast
**File**: [creator/useProjectIO.js:417-419](../../creator/useProjectIO.js#L417-L419)
**Severity**: low
**Classification**: [auto-fix]

```js
i.onerror = function() {
  console.warn("useProjectIO: could not decode uploaded image.");
  state.setIsUploading(false);
};
```

Console warning only — the user is left looking at the spinner gone and
nothing happening. HEIC and some malformed JPEGs end up here.

**Fix**: Add a toast:
```js
i.onerror = function() {
  console.warn("useProjectIO: could not decode uploaded image.");
  state.setIsUploading(false);
  state.addToast("Couldn't read that image. Try a PNG or JPEG.", { type: "error", duration: 4000 });
};
```

**Regression test**: Mount Creator, simulate file selection with an
unsupported MIME, assert toast queue receives an error toast.

---

### C-6 — JSON import does not validate `pattern.length === width × height`
**File**: [import-formats.js](../../import-formats.js) (search `importResultToProject`)
**Severity**: medium
**Classification**: [auto-fix]

A hand-edited or truncated JSON produces a broken project that crashes
on first render or first `done`-array allocation.

**Fix**: After parsing, assert dimensions match:
```js
if (!Array.isArray(result.pattern) || result.pattern.length !== result.width * result.height) {
  throw new Error("Invalid project file: pattern length (" + (result.pattern && result.pattern.length) +
                  ") does not match dimensions (" + result.width + " × " + result.height + ").");
}
```

**Regression test**: Construct a JSON with `pattern.length = w*h - 1`,
assert `importResultToProject` throws.

---

### C-7 — PDF and worker pipeline have no wall-clock timeout
**File**: [pdf-importer.js](../../pdf-importer.js), [generate-worker.js](../../generate-worker.js)
**Severity**: low
**Classification**: [question]

A pathological PDF or extreme-size image can keep the worker busy
indefinitely with no progress signal change. User can close the tab but
cannot cancel from inside the app.

**Question**: Should the pipeline expose a cancel button + enforce a
generous timeout (e.g. 60s per stage)?

---

### C-8 — Cancelling/superseding generation does not terminate the in-flight worker
**File**: [creator/useCreatorState.js](../../creator/useCreatorState.js) (search `genReqIdRef.current++`)
**Severity**: low
**Classification**: [needs-approval]

When the user supersedes a generation (settings change → click Generate
again), the running worker keeps computing the discarded result. CPU is
wasted; on slow devices this delays the second result.

**Possible fix**: On generate-start, if `workerRef.current` is alive and
busy, `terminate()` it and null it before re-creating. Trades worker
startup cost for not wasting CPU on a discarded result.

**Question**: Worth the rebuild cost? Worker creation on this codebase is
~5 ms vs. a long generation potentially burning seconds.

---

### C-9 — `bsLines` survive re-convert
**File**: [creator/useCreatorState.js:818-822](../../creator/useCreatorState.js#L818-L822) (`resetAll`)
**Severity**: low
**Classification**: [needs-approval]

`resetAll` clears `pat`/`pal`/`cmap` but does **not** clear `bsLines`. A
user who places backstitches in edit mode, returns to convert, and
regenerates will have those backstitches sitting on top of an entirely
different colour map. The visual is probably wrong; the cell coordinates
may even fall outside the new pattern if `sW`/`sH` changed.

**Possible fixes**:
- Clear `bsLines` in `resetAll`.
- OR keep them but clip to the new dimensions and warn the user.
- OR show a confirm dialog at re-convert time.

**Question**: Which behaviour is intended?

---

## 7. TODO / open questions for the user

The following items in this report require a design call from the user
before they can be auto-fixed. They are collected for the Phase 2
question batch:

1. **C-4** — Should `lastGenSnapshot` cover all pipeline inputs? (If yes,
   the "values changed" CTA fires for more cases — possibly too noisy.)
2. **C-7** — Cancel button + timeout for worker/PDF pipeline?
3. **C-8** — `terminate()` superseded workers, or let them finish silently?
4. **C-9** — Behaviour of `bsLines` across re-convert.

The remaining bugs (C-1, C-2, C-3, C-5, C-6) are scoped for auto-fix in
Phase 4 with regression tests.
