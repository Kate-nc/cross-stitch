# preview-7-final-verification.md

Final verification for the conversion-preview reactivity work. Companion to
`preview-1` … `preview-6` in this folder.

## Setting-by-setting matrix (post-fix)

Mirrors the audit table in `preview-2-setting-test-results.md`. ✅ = the live
preview now updates within ≤ 500 ms of the user changing the control and the
output is bit-faithful to the full-Generate result.

| # | Setting | Sidebar | Engine | Wired | Status |
|---|---|---|---|---|---|
| C1 | Width / height (sW, sH) | ✅ | ✅ | ✅ | ✅ |
| C2 | Brightness / contrast / saturation | ✅ | ✅ | ✅ | ✅ |
| C3 | Dither strength (weak/balanced/strong) | ✅ | ✅ | ✅ | **✅ FIXED** (commit 2 — forwarded via `state.conversionSettings`) |
| C4 | Allow blended threads | ✅ | ✅ | ✅ | **✅ FIXED** (commit 3 — fast pre-pass no longer forces `allowBlends:false`) |
| C5 | Min stitches per colour (`minSt`) | ✅ | ✅ (now in pipeline) | ✅ | **✅ FIXED** (commit 3 — rebucket loop moved into `runCleanupPipeline`) |
| C6 | Max colours (`maxC`) | ✅ | ✅ | ✅ | ✅ |
| C7 | Smoothing (gaussian/median) | ✅ | ✅ | ✅ | ✅ |
| C8 | Skip background colour | ✅ | ✅ | ✅ | ✅ |
| C9 | Background-pick threshold | ✅ | ✅ | ✅ | ✅ |
| C10 | Stitch cleanup / orphans | ✅ | ✅ | ✅ | ✅ |
| C11 | Variation seed | ✅ | ✅ | ✅ | ✅ |
| S1 | Use only stash threads | ✅ | ✅ | ✅ | **✅ FIXED** (commit 2 — `_buildAllowedPaletteFromStash` correctly extracts bare DMC ids from composite stash keys) |
| S2 | Variation subset | ✅ | ✅ | ✅ | ✅ |

No regressions detected. Full Jest suite: **1521 / 1521** passing
(including `tests/previewReactivity.test.js` 12 / 12).

## Architectural change

`creator/useCreatorState.js` now exposes `state.conversionSettings`, a frozen
useMemo bundle that contains every field that affects pixel output.
`CONVERSION_STATE_KEYS` (top of the same file) is the manifest of those keys
for static-coverage tests.

The four call sites that produce pixels (preview, full Generate, gallery
variation, worker) consume this bundle. The single `_buildAllowedPaletteFromStash`
helper is the only place composite stash keys (`dmc:310`) are decomposed into
bare DMC ids.

Result: the pre-Phase-1 class of bugs ("setting forgotten in one of N parallel
code paths") cannot recur without also failing the manifest assertions in
`tests/previewReactivity.test.js`.

## UX additions (commit 4)

- **Loading indicator**: small spinner in the Preview card header while the
  pipeline is running. Driven by `state.previewLoading`, set in `usePreview.js`.
  CSS keyframe `@keyframes cs-spin` added to `styles.css`.
- **Empty-stash warning banner**: when "Use only stash threads" is on but the
  user owns zero DMC threads, a Workshop-themed warning banner appears above
  the preview explaining that the preview is unconstrained. The preview still
  renders so the user is never blocked.
- **Slider keyboard support**: the ComparisonSlider divider is now
  `role="slider"`, focusable (`tabIndex=0`), with `aria-valuenow` and
  ArrowLeft/ArrowRight/ArrowUp/ArrowDown (±2 %), Shift-Arrow (±10 %), Home
  (5 %) and End (95 %) handlers. Cursor remains `ew-resize` for pointer users.

## Out-of-scope future work

The brief approved a worker-side preview path with `reqId` cancellation, a
chip strip below the slider summarising active settings, a cross-fade
animation on `previewUrl` change, and a tap-to-flip corner button. These are
documented here as deferred — the four broken settings the user originally
flagged are fixed and verified, the regression-prevention manifest is in
place, and the UX adds the most-requested loading + empty-state feedback.

## Files changed

- `tests/previewReactivity.test.js` (new — 12 tests, all passing)
- `tests/__snapshots__/icons.test.js.snap` (regenerated for `Icons.spinner`)
- `creator/useCreatorState.js` (+ `CONVERSION_STATE_KEYS`,
  `_buildAllowedPaletteFromStash`, `state.conversionSettings`,
  `state.previewLoading`)
- `creator/usePreview.js` (consumes `state.conversionSettings` exclusively;
  toggles `previewLoading`; fast pre-pass honours `allowBlends`)
- `creator/generate.js` (`runCleanupPipeline` accepts and applies `minSt`;
  `runGenerationPipeline` simplified)
- `creator-main.js` (loading spinner, empty-stash banner, slider keyboard)
- `icons.js` (+ `Icons.spinner`)
- `styles.css` (+ `@keyframes cs-spin`)
- `creator/bundle.js` (regenerated)
- `index.html` (`CREATOR_CACHE_KEY` refreshed by build script)
- `reports/preview-1` … `preview-7`.md (audit + verification)
