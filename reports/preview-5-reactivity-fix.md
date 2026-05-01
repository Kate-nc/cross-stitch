# Preview-5 — Reactivity fix design

## Core principle

Every conversion setting that affects the engine must trigger a
preview refresh, and the path of least resistance for adding the
*next* setting must be the correct path.

## The single root cause

`runCleanupPipeline` is called from four sites with hand-built opts
objects. Each site re-derives stash → palette, blends, dither
strength etc. independently. Drift is inevitable; we have it now in
3 places (S1, C3, C5) and a near-miss in C4.

The fix is to introduce a **single canonical "ConversionSettings"
contract** and a **single derivation function** that takes the raw
state and returns:

```
ConversionSettings = {
  // raw image / geometry
  sW, sH, bri, con, sat, smooth, smoothType,

  // engine inputs (these are exactly what runCleanupPipeline reads)
  maxC,           // = effectiveMaxC
  dith,           // boolean derived from dithMode
  dithStrength,   // 0.5 / 1.0 / 1.5
  allowBlends,    // = effectiveAllowBlends
  allowedPalette, // [] | null  — built by ONE helper
  skipBg, bgCol, bgTh,
  stitchCleanup, orphans, minSt,
  seed, subset,
}
```

All four call-sites construct settings via the same helper:

```js
function buildConversionSettings(state) { … }
```

The helper:

- Lives in [creator/useCreatorState.js](../creator/useCreatorState.js)
  alongside the `useMemo`-derived values it depends on, and is
  exposed as `state.conversionSettings` (memoised).
- Handles the stash → `allowedPalette` translation in **one place**,
  using `_extractDmcId`. The other three call sites of the same
  builder are deleted.
- Returns a *frozen* plain object. Cheap to JSON-stringify for the
  guard described below.

### How this fixes each broken setting

| Bug | Fix |
|---|---|
| S1 (stash-only no-op in preview) | Preview path no longer hand-builds `allowedPalette`. It reads `settings.allowedPalette` from the canonical helper, which already uses `_extractDmcId`. |
| C3 (dither strength ignored in preview) | `settings.dithStrength` is set by the helper from `dithMode`. Preview forwards the whole `settings` object to `runCleanupPipeline` (or its enginewrapper). |
| C5 (min-stitches ignored in preview) | Move the rebucketing pass *into* `runCleanupPipeline` so it lives in the engine, not the worker-only wrapper. The preview gets it for free. Also `minSt` lands in `settings`. |
| C4 (fast pre-pass forces blends-off) | Either drop the fast pre-pass when blends are on, or pass `settings.allowBlends` to it. Fixed in the same commit. |
| Future additions | Anyone adding a new setting must add it to the helper. Forgetting means the engine-coverage guard (below) fires immediately at dev time. |

## Reactive trigger mechanism

The preview hook should watch a **single dependency** — the canonical
settings object identity — instead of 25 individual primitives:

```js
var generatePreview = React.useCallback(function() {
  var s = state.conversionSettings;  // memoised upstream
  …
  runCleanupPipeline(raw, pw, ph, s);
  …
}, [state.img, state.conversionSettings]);
```

The `useMemo` inside `useCreatorState` controls re-derivation. New
settings get picked up automatically because they're already in the
memo's dependency list (the developer adding the new setting must
add it there — same place as the `useState` declaration, hard to miss).

## Debounce & cancellation strategy

### Discrete vs continuous

- **Discrete controls** (toggles, dropdowns, button-groups,
  radio): trigger the preview pipeline immediately, no debounce.
- **Continuous controls** (sliders, numeric inputs): debounce
  300 ms after the last change.

Mechanism: each setter exposes a flag, e.g.

```js
state.scheduleConversion({ debounce: 300 });   // for slider onChange
state.scheduleConversion({ debounce: 0 });     // for toggles
```

The hook tracks one `setTimeout` handle. Calls with a smaller
debounce override a pending longer one (so a toggle change after a
slider drag fires immediately, not after the slider's 300 ms).

### Cancellation

Today the pipeline runs on the main thread synchronously — it
**cannot be cancelled**. The fix:

1. **Move the preview pipeline to the existing Web Worker.** Reuse
   `generate-worker.js`. Add a `type:'preview'` message that returns
   only `{ mapped, dims, stats }` (no full `pat/pal/cmap`).
2. **Cancellation by request id.** Mirror the existing
   `genReqIdRef` pattern from [useCreatorState.js#L838](../creator/useCreatorState.js#L838):
   each scheduled run increments `prevReqIdRef`; the worker echoes
   the id; the main thread ignores results whose id ≠ latest.
3. The in-flight worker run isn't actually killed (Web Workers
   can't be interrupted from inside) but the *result* is dropped
   and the new run is dispatched immediately. The user sees the
   loading state continuously.

Net effect: rapid slider drag → many "scheduleConversion" calls →
debounced to one → fired in worker → result accepted. Mid-drag
toggle → fired immediately → previous run's eventual result is
discarded by id check.

## Loading & feedback design

| Element | Behaviour |
|---|---|
| **Preview overlay** | Semi-transparent (`rgba(0,0,0,0.04)`) panel + 1.6 stroke spinner (use `Icons.spinner` if it exists, otherwise add one) centred over the preview thumbnail. Appears as soon as `scheduleConversion()` fires; dismissed when the matching reqId resolves. |
| **Setting interactivity** | Sidebar controls **must remain enabled** while the overlay is up. The cancellation mechanism handles back-pressure. |
| **Cross-fade** | When a new `previewUrl` arrives, fade-in over 120 ms (`var(--motion-fast)`). Avoid a hard swap to mask the worker latency. |
| **Setting summary strip** | Below the slider: small chip-row showing the active settings that produced the visible preview. Updated when the preview updates, not when the controls do. Confirms "what you see was made with these values". |
| **Empty stash banner** | When `stashConstrained` is on and `allowedPalette` is empty, replace the preview with an inline notice (icon + text + "Open Stash Manager" link). No silent fallback. |
| **Stale-preview hint** | If a worker run takes >800 ms, show "Generating preview…" text under the spinner with the current request settings. |

## Coverage guard (to prevent recurrence)

Even with a unified pipeline, a developer could still add a state
variable, *forget* to put it in `buildConversionSettings`, and ship
a dead toggle. To catch that at dev time:

- Define a manifest list of conversion-setting state keys at the top
  of `useCreatorState.js`:

  ```js
  const CONVERSION_STATE_KEYS = [
    'sW','sH','bri','con','sat','smooth','smoothType',
    'maxC','dithMode','allowBlends','minSt',
    'skipBg','bgCol','bgTh','stitchCleanup','orphans',
    'stashConstrained','globalStash','variationSeed','variationSubset',
  ];
  ```

- A single tiny dev-only assertion runs once at app startup
  (`if (process.env.NODE_ENV !== 'production')` doesn't apply here —
  use a `window.location.search.includes('dev')` or simply
  `console.warn`-on-mismatch). It compares the manifest to the keys
  the helper actually reads via `Object.keys(state.conversionSettings)`
  + a list of "raw inputs touched by the helper". If a manifest key
  has no consumer, warn. If a consumer uses an off-manifest key,
  warn.

- A unit test in `tests/preview-coverage.test.js` does the same
  comparison statically (regex-extracts the manifest, regex-extracts
  reads inside the helper) so CI catches divergence before review.

## Comparison-slider improvements

Already-correct: position survives, touch works, alt-key zoom, RAF
batching, diff overlay.

Add:

1. **Tap-to-flip**: a small "↔" button in a corner that swaps
   between original-only and converted-only. Faster than dragging
   for a quick check, especially on mobile.
2. **Keyboard support**: focusable slider thumb, arrow keys move
   ±2 % (Shift = ±10 %). `role="slider"`, `aria-valuenow={splitPos}`,
   `aria-valuemin={5}`, `aria-valuemax={95}`,
   `aria-label="Comparison split position"`.
3. **Pause auto-sweep** when the user touches the slider, resume
   only on explicit re-toggle. (Currently `setSweeping(false)` on
   pointerdown — keep that, but also stop on focus to support keyboard.)

## Summary of changes

| Change | Purpose | Risk |
|---|---|---|
| Add `state.conversionSettings` memoised helper | Single source of truth | Low |
| Refactor `usePreview` to read it | Fixes S1, C3 | Low |
| Move `minSt` rebucket into `runCleanupPipeline` | Fixes C5 | Low–medium (engine change) |
| Drop fast pre-pass *or* honour blends in it | Fixes C4 | Low |
| Move preview compute into `generate-worker.js` (`type:'preview'`) | Cancellation + responsiveness | Medium |
| Per-control debounce flag (0 vs 300 ms) | Better UX | Low |
| Loading overlay + cross-fade | Feedback | Low |
| Setting-summary chip-strip | Trust | Low |
| Stash-empty inline notice | Edge case | Low |
| Coverage manifest + dev assertion + unit test | Recurrence prevention | Low |
| Slider keyboard + tap-to-flip | Accessibility | Low |
