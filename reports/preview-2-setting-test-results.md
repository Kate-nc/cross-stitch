# Preview-2 — Setting test results

## Method

Tests are based on **static code analysis of the live preview pipeline**
(`creator/usePreview.js` + `creator/generate.js` + `colour-utils.js`)
plus the Sidebar onChange wiring. For each setting I trace:

1. Does the onChange call a setter on the state hook? (writes state)
2. Is the state in `generatePreview`'s `useCallback` deps? (rebuilds)
3. Is the value read inside the callback? (reads correct value)
4. Is it forwarded to `runCleanupPipeline`? (reaches the engine)
5. Does `runCleanupPipeline` actually use it? (visible effect)

Live in-browser verification of every entry should be repeated in
Phase 5 (the manual `preview-7-final-verification.md` step) — but the
code path tells us with certainty which settings are *structurally*
broken before any manual testing.

Legend: ✅ wired and reaches engine — ❌ broken — ⚠ partial / subtle.

## Results

| # | Setting | Writes state | In deps | Read in callback | Passed to pipeline | Used by engine | Result | Notes |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| D1 | Width (sW) | ✅ | ✅ | ✅ | ✅ (geo cache key) | ✅ | ✅ | Re-renders raw RGBA |
| D2 | Height (sH) | ✅ | ✅ | ✅ | ✅ (geo cache key) | ✅ | ✅ | |
| D3 | Lock aspect ratio (arLock) | ✅ | n/a | n/a | n/a | n/a | ✅ | UI-only; affects sW/sH coupling |
| D4 | Fabric count (fabricCt) | ✅ | ✅ | ✅ | n/a — used for skein stats | ✅ | ✅ | Doesn't change pixels — affects stats only |
| F1 | Brightness | ✅ | ✅ | ✅ | ✅ (canvas filter) | ✅ | ✅ | |
| F2 | Contrast | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| F3 | Saturation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| F4 | Smooth amount | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| F5 | Smooth type | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| C1 | Max colours | ✅ | ✅ | ✅ | ✅ (effMaxC) | ✅ | ✅ | |
| C2 | Dither mode (off/weak/balanced/strong) | ✅ | ✅ (dithMode) | ✅ (`dith` boolean only) | ⚠ boolean only | ⚠ | ⚠ | Off↔On works. Weak↔Balanced↔Strong produce **identical** preview (see C3). |
| C3 | Dither strength | ✅ derived | ✅ via dithMode | ❌ never read | ❌ **not passed** | n/a | ❌ | `dithStrength` is computed in useCreatorState but `usePreview` never reads it nor forwards it to `runCleanupPipeline`. Full Generate uses it. |
| C4 | Allow blended threads | ✅ | ✅ | ✅ (effAllowBlends) | ✅ | ✅ | ⚠ | Wired correctly in code. **But** during the progressive paint, the *fast* pre-pass forces `allowBlends:false` ([usePreview.js#L82](../creator/usePreview.js#L82)); only the deferred runFull respects the toggle. With dither off the toggle works on first paint. With dither on, briefly looks unblended before the full pass repaints. Visible difference depends on image. **Needs in-browser confirmation against test fixture image with strong gradient.** |
| C5 | Min stitches per colour (minSt) | ✅ | ❌ **not in deps** | ❌ never read | ❌ **not passed** | n/a | ❌ | Slider does literally nothing in preview. Full Generate honours it. |
| B1 | Skip background | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| B2 | Background colour | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| B3 | Background ΔE threshold | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| K1 | Cleanup enabled | ✅ | ✅ (stitchCleanup obj) | ✅ | ✅ | ✅ | ✅ | |
| K2 | Cleanup strength | ✅ | ✅ (stitchCleanup obj) | ✅ | ✅ | ✅ | ✅ | |
| K3 | Protect details | ✅ | ✅ (stitchCleanup obj) | ✅ | ✅ | ✅ | ✅ | |
| K4 | Smooth dithering | ✅ | ✅ (stitchCleanup obj) | ✅ | ✅ | ✅ | ✅ | |
| K5 | Orphan-removal level | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| S1 | Use only stash threads | ✅ | ✅ | ✅ | ⚠ allowedPalette ALWAYS ends `null` | n/a | ❌ | See preview-3 §S1 — `usePreview` iterates `globalStash` keys raw and calls `findThreadInCatalog('dmc', 'dmc:310')` which always misses. `allowedPalette` empties → set to `null` → preview never constrained. Full Generate uses `_extractDmcId` and works. |
| S2 | Variation seed | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| S3 | Variation subset | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |

### Summary

- **Confirmed broken in preview** (4): C3 dither strength, C5 min
  stitches per colour, S1 use only stash threads, **C4 partial**
  (toggle responds eventually but the fast-pass briefly lies).
- **All other 19 settings** structurally reach the engine on change
  and produce a visible difference (assuming the source image has
  any colour distribution at all).

## Secondary observations

- **No loading indicator** during the 400 ms debounce or the
  ~50–250 ms main-thread compute. The user sees the previous preview
  frozen. There is no way to tell whether a change has been registered.
- **No cancellation** of an in-flight `runCleanupPipeline` call. The
  pipeline is synchronous on the main thread, so a fast slider drag
  blocks the UI for the duration of the debounced compute.
- **Comparison-slider position survives** preview swaps (✅ — already
  correct).
- **Touch & pointer events** on the slider work correctly via
  `setPointerCapture` + `requestAnimationFrame` batching.
- **No setting summary chip-strip** on the preview. The user has no
  visual confirmation of which settings are currently baked into the
  thumbnail they're looking at.
- **Empty stash + S1 toggled on**: the Generate button shows a
  warning toast and blocks; the *preview* silently shows an
  unconstrained result with no message.
