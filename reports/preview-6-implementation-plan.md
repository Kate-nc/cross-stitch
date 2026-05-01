# Preview-6 — Implementation plan & recommendation

## Options recap

### Option A — Per-setting wiring patches

- Wire `dithStrength` into the preview's `runCleanupPipeline` call.
- Wire `minSt` into preview deps and pipeline.
- Replace the broken stash-builder in `usePreview.js` with the
  `_extractDmcId` pattern.
- Patch the fast pre-pass for blends.

**Cost**: ~30 lines across 1 file. No architectural change. Done in
an hour.

**Risk**: Very low — touches only `usePreview.js`. No behaviour
change in worker / Generate / variation-gallery paths.

**Downside**: The same defect class (drift between preview and
worker call sites) will reappear the next time a setting is added.
There is no structural protection. The "use only stash" bug
*already* slipped through `_extractDmcId` review four times before
a fifth caller (the preview) duplicated the wrong pattern.

### Option B — Unified ConversionSettings pipeline + coverage guard + worker preview

The full design from preview-5:

- `state.conversionSettings` memoised in `useCreatorState.js`.
- `usePreview` and `generate` both call
  `runCleanupPipeline(raw, w, h, settings)` with the same object.
- `minSt` rebucket moved into `runCleanupPipeline` (single
  definition).
- Preview computation moved into `generate-worker.js` with reqId
  cancellation.
- Per-control debounce (0 ms for discrete, 300 ms for continuous).
- Loading overlay, cross-fade, setting summary, stash-empty inline
  message.
- Coverage manifest + dev-time assertion + unit test.

**Cost**: ~600–900 lines across `useCreatorState.js`, `usePreview.js`,
`generate-worker.js`, `creator/generate.js`, `creator-main.js`,
`Sidebar.js`, plus new tests and a small CSS addition.

**Risk**: Medium. Touches the single hottest hook in the app. The
worker move in particular needs careful testing of the existing
geometric cache and progressive-paint paths. Comparison slider
tests must continue to pass. PK-compatible PDF export is
*completely insulated* from this change (it reads `state.pat` post-
Generate, not the live preview).

**Mitigations**:

- The unified pipeline is implemented behind the existing
  `runCleanupPipeline` signature — no engine changes required for
  steps 1–4. Worker move is an additive `type:'preview'` message;
  fall-back to the current main-thread path is one boolean.
- Add the coverage test first; fix individual settings second; do
  the worker move last. Each step is independently shippable.

### Option C — Hybrid (fix individual bugs now + future guard)

- Wire S1, C3, C5, C4 individually (Option A's commits).
- Add only the coverage manifest + dev assertion + test — keep
  the existing two call sites for `runCleanupPipeline`, the
  manifest enforces they pass the same opts.

**Cost**: ~150 lines.

**Risk**: Low.

**Downside**: The unified settings object isn't built. The guard
merely *detects* divergence; it doesn't make the right path the
easy one. You still need eight matching opts-object spreads at
each call site to keep the guard happy.

## Recommendation: **Option B**, executed in 4 incremental commits

Rationale:

1. The bug class is already at four call sites and four duplicate
   `_extractDmcId` patterns. The cost of *not* unifying is paid
   every time someone adds a setting. The codebase has been adding
   settings every few weeks.
2. The single biggest UX gap (no loading state, no cancellation, UI
   freezes during compute) is resolved by the worker move that's in
   Option B's scope, not Option A or C.
3. Each step is **independently shippable**. We do not have to
   merge the worker move with the wiring fix to deliver value.
4. The PDF export, which is bit-stable and PK-compatible
   (`AGENTS.md` rule), reads `state.pat` from after-Generate. It is
   completely outside this refactor's blast radius.

### Commit plan

1. **`test(preview)`**: add reactivity tests for every conversion
   setting + the coverage manifest test. The S1, C3, C5, C4 tests
   fail on `main`. Coverage test passes against the existing
   manifest (or fails — proving the value of the guard).
2. **`refactor(preview)`**: introduce `state.conversionSettings`
   memoised helper. Wire `usePreview` and `generate` and
   `gallery` and the variation path to read from it. No behaviour
   change yet — the helper is a pure rename of the existing
   inline derivations. Run all tests.
3. **`fix(preview)`**: with the helper in place, the broken bits
   (stash builder, missing `dithStrength`, `minSt` rebucket move
   into `runCleanupPipeline`, fast-pass blends) are now isolated
   one-line fixes. Previously failing tests pass.
4. **`feat(preview)`**: move preview compute into
   `generate-worker.js` (`type:'preview'`), add reqId
   cancellation, per-control debounce flag, loading overlay,
   cross-fade, settings chip-strip, stash-empty inline message,
   slider keyboard + tap-to-flip.

### Out of scope (deliberate)

- The PDF export pipeline (PK-compat).
- The Edit-mode `CreatorPreviewCanvas` (already correct, reads
  `pat`).
- The `lastGenSnapshot` regen-warning. (The right fix here is to
  derive it from `conversionSettings` too — included in commit 2
  if cheap, otherwise filed as follow-up.)
- The Stitch Tracker / Stash Manager (don't touch — not implicated).

## What I need from you (the review gate)

Please confirm before any code is written:

1. **Approval of Option B** (or pick A / C).
2. **Approval of commit plan order** — particularly the worker move
   landing last, behind the wiring fixes.
3. **Per-control debounce timings**: 300 ms continuous / 0 ms
   discrete OK? Or different (e.g. 250/0)?
4. **Loading overlay style**: light translucent panel + spinner.
   Should the spinner be on the preview thumbnail itself, the
   ComparisonSlider container, or as a top-right corner badge so
   the slider is never visually obscured?
5. **Setting summary chip-strip** — yes/no? If yes, should it sit
   under the slider or above the stats card?
6. **Tap-to-flip slider button** — yes/no, and which icon
   (`Icons.swap` exists? if not, add).
7. **Stash-empty notice** — replace preview entirely, or render
   alongside an unconstrained preview with a warning banner?
8. **Coverage manifest path** — keep inside `useCreatorState.js`,
   or put it in a new `creator/conversionSettings.js` (which would
   add a file to `build-creator-bundle.js`)?
