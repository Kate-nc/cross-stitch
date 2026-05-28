# Conversion Noise Cleanup — Phase 1 Plan

**Tool name (internal):** Denoise Mode  
**Distinct from:** the existing Lineart Cleanup Mode (`activeTool === 'cleanup'`)  
**Proposed `activeTool` value:** `'denoise'`

---

## 1. Conversion Pipeline Audit

### 1.1 Stages and their outputs

```
Raw image pixels (RGBA Uint8ClampedArray)
    │
    ▼ (optional) Pre-processing
    │   applyGaussianBlur / applyMedianFilter (radius = settings.smooth)
    │
    ▼ 1. Quantization — quantize()
    │   K-means++ in CIELAB space, up to maxC iterations (20 max).
    │   Uses dE2() (Euclidean LAB², fast) for per-pixel distance.
    │   Maps each cluster centroid to the nearest DMC thread entry (no
    │   reuse per palette — each centroid maps to a unique DMC color).
    │   Result: a palette of ≤ maxC DMC entries.
    │
    ▼ 2. Mapping / Dithering — doMap() | doDither() | doBayerDither()
    │   dithMode ∈ { "off", "weak", "balanced", "strong",
    │                "bayer2", "bayer4", "bayer8" }
    │   "off"             → doMap(): each pixel → nearest palette color, no error propagation
    │   "weak/balanced/strong" → doDither(): Atkinson error diffusion +
    │                   confetti-aware 2nd-best penalty (threshold scaled by saliency)
    │   "bayer*"          → doBayerDither(): ordered Bayer matrix (2×2, 4×4, or 8×8)
    │
    ▼ 3. Background removal (if skipBg)
    │   Pixels within bgTh ΔE of bgCol → { id:'__skip__' }
    │
    ▼ 4. Rarity removal — up to 3 passes
    │   Colors with stitch count < minSt are snapped to nearest kept color.
    │   Uses dE() (Euclidean LAB).
    │
    ▼ 5. Orphan cleanup — removeOrphanStitches() (if enabled)
    │   Uses saliency map + optional edge map to protect details.
    │   Controlled by STRENGTH_MAP { gentle, balanced, thorough }.
    │
    ▼ 6. maxC enforcement — iterative removal of least-used thread
    │
    ▼ Final mapped[] array: flat Array of DMC cell objects, length = W × H
```

**Color-distance functions:**

| Function | Formula | Speed | Where used |
|----------|---------|-------|------------|
| `dE2(a,b)` | ΔL²+Δa²+Δb² (squared Euclidean LAB) | Fast | quantize, doDither inner loop |
| `dE(a,b)` | √(ΔL²+Δa²+Δb²) (Euclidean LAB) | Medium | rarity removal, bg check |
| `dE2000(a,b)` / `dE00` | CIEDE2000 (perceptually uniform) | Slow (5-8×) | findBest blends, useCleanupMode neighbour vote |

### 1.2 Noise sources, by stage

| Stage | Noise form | Why it happens |
|-------|-----------|---------------|
| **Source image** | Anti-aliased edges | PNG/JPG pre-renders sub-pixel smooth edges. The transitional pixels at each edge are a mix of the two bordering colors. |
| **Quantize** | Near-duplicate palette entries | K-means finds clusters that are very close in LAB space. Two clusters that differ only slightly (e.g., two very similar skin tones) map to adjacent DMC colors. Users see "why are there two barely-different yellows?" | 
| **Quantize** | Edge fringes | Anti-aliased source pixels sit between two dominant palette colors, so they cluster into a third "transitional" color. |
| **doMap (no dither)** | Isolated speckle pixels | Single pixels at anti-aliased corners or textured areas that snap to a "wrong" color because their lab value happens to be closest to a minority palette entry. |
| **doDither (Atkinson)** | Intentional scatter | Error diffusion deliberately spreads quantization error. Isolated pixels are the intended output, not noise. The confetti-aware penalty (`confettiDitherThreshold`) reduces this, but not to zero. |
| **doBayerDither** | Regular pattern of mixed pixels | Ordered dithering produces a predictable checkerboard/matrix of alternating colors. Completely intentional. |
| **Rarity removal** | Boundary artifacts | Rare-color stitches are snapped to nearest kept color, occasionally creating small patches of wrong color at their original position if the nearest color isn't perceptually adjacent. |
| **Orphan cleanup** | None (it removes noise) | This pass already removes some isolated pixels, but it's parameterized and may not run if disabled, or may be too conservative. |

### 1.3 Noise not addressed by existing pipeline steps

The rarity removal and orphan cleanup catch some noise, but leave:
- **Near-duplicate palette entries** — the pipeline never merges palette entries post-quantization unless `minSt` evicts the rarer color entirely.
- **Edge fringe colors** — transitional anti-aliasing colors that have enough stitches to survive rarity removal.
- **Residual speckle** — especially with `doMap`, since no confetti avoidance is applied; and even with Atkinson, low-saliency areas still get scattered pixels.

---

## 2. Pattern Data Model

Pattern cells are plain objects stored in a flat `pat[]` array of length `sW × sH`:

```js
{ id: "310",          // DMC thread code (string); or "__skip__" / "__empty__"
  type: "solid",      // "solid" | "blend" | "skip" | "empty"
  rgb: [0, 0, 0]      // display RGB (used for rendering; stripped pre-save)
}
// Blend cell:
{ id: "310+550", type: "blend", rgb: [...], threads: [{id:"310",...},{id:"550",...}] }
```

Palette is a parallel `pal[]` array of `cmap`-indexed entries (keyed by `id`):

```js
cmap["310"] = { id:"310", name:"Black", rgb:[0,0,0], lab:[0,0,0], symbol:"A", count: 1234 }
```

**Index arithmetic:** `idx = y * sW + x` — column-major row order.

**Neighbor lookup:** 8-connected; boundary clamp (no wrapping). For a cell at `(x, y)`:
```
for dy in [-1,0,1], dx in [-1,0,1], skip (0,0):
    nx = x+dx, ny = y+dy
    if 0 ≤ nx < sW and 0 ≤ ny < sH: valid neighbor
```

**LAB values:** stored per palette entry in `cmap`. Pattern cells reference LAB via `cmap[cell.id].lab`. The workers receive a slim `{id, lab}[]` copy to avoid transferring full React objects.

---

## 3. Existing Lineart Cleanup Mode — Audit

### 3.1 Architecture

- **Hook:** `creator/useCleanupMode.js` → `window.useCleanupMode(state, history)`
- **Worker:** `cleanup-worker.js` — 4-phase auto-detect algorithm
- **Canvas overlay:** `drawPatternOverlayOnCanvas` in `creator/canvasRenderer.js` at `activeTool === 'cleanup'` branch
- **Toolbar controls:** `creator/ToolStrip.js` — a `cleanupRow` rendered when `activeTool === 'cleanup'`
- **State vars** in `useCreatorState.js`: `cleanupTargetColorId`, `cleanupTolerance`, `cleanupSelTool`, `cleanupBrushSize`, `cleanupPendingMask`, `cleanupAutoRunning`, `cleanupAutoError`, `cleanupHandlersRef`

### 3.2 Module-root constants (useCleanupMode.js)

```js
CLEANUP_TOLERANCE_MAX_DE = 30          // slider 0–100 maps to 0–30 ΔE
AUTODETECT_INTERIOR_CARDINAL_THRESHOLD = 3
AUTODETECT_MIN_FOREIGN_RATIO = 0.35
AUTODETECT_MIN_RUN_LENGTH = 2
CLEANUP_WIDE_NEIGHBOURHOOD_RADIUS = 2  // wide tie-break neighbourhood
CLEANUP_OVERLAY_COLOR = 'rgba(255,90,0,0.50)'  // warm orange
CLEANUP_BRUSH_MIN = 1
CLEANUP_BRUSH_MAX = 10
```

### 3.3 What can be shared

| Component | What it does | Sharing plan |
|-----------|-------------|-------------|
| `_neighbourVote(idx, prePat, selectedSet, sW, sH)` | Determines replacement color for a cell using 8-connected majority vote + 2 tie-breaks | **Extract** to `creator/cleanupSharedHelpers.js` as `window.cleanupNeighbourVote`. Both cleanup and denoise modes call it. |
| `_findEntry(prePat, id)` | Finds a palette entry by id | **Extract** with `_neighbourVote` |
| `getOrCreateMask(sW, sH, existing)` | Creates/reuses a Uint8Array mask | **Copy**: tiny one-liner, no value in a shared export |
| Brush rAF coalescing pattern | Batch mask updates at 60fps | **Copy the pattern** — it's local to the hook |
| `applyCleanup` logic | Atomic snapshot → vote → apply → palette rebuild → undo push → toast | **Similar logic in useDenoiseMode.js** but with `type: 'denoise'` history entry. Palette-zeroed-color toast is identical; copy the toast call. |
| Canvas overlay rendering | `if (activeTool === 'cleanup' && cleanupPendingMask)` | **Add parallel branch** for `'denoise'` in `drawPatternOverlayOnCanvas` |
| ToolStrip row | `cleanupRow` — target chip, tolerance slider, sub-tool buttons, apply/cancel | **Add parallel `denoiseRow`** with different controls (threshold slider, op toggles) |
| `useCreatorState` state vars | `cleanupPendingMask`, `cleanupAutoRunning`, etc. | **Add parallel `denoise*` vars** |
| `creator-main.js` hook wiring | `cleanupMode = useCleanupMode(state, history)` | **Add parallel** `denoiseMode = useDenoiseMode(state, history)` |
| Worker + postMessage protocol | `new Worker('cleanup-worker.js')` | **New worker** `noise-cleanup-worker.js` |

### 3.4 What NOT to share

The lineart mode's **target-color selection** (pick one dark color and replace it) is specific to that tool. The denoise tool operates globally on the whole palette, not targeting a single color.

The lineart mode's **auto-detect algorithm** (color match → interior filter → boundary filter → run-length filter) is designed to find dark border lines. The denoise tool needs entirely different detection logic.

---

## 4. Recommended Cleanup Operations

### 4.1 Operation mix, justified against the pipeline

Three layered operations, applied in this order in the auto pass:

#### Op 1 — Palette Consolidation

**Targets:** near-duplicate palette entries (quantization artifact)  
**How:** cluster all DMC colors currently in `pal[]` by perceptual proximity; merge clusters where any pair is within `DENOISE_PALETTE_THRESHOLD_DE` (CIEDE2000); remap all stitches in merged-away colors to the representative color.  
**Representative choice:** the cluster member with the highest stitch count (most prevalent color in the cluster "wins").  
**Safety:** does not inspect cell neighborhoods; operates purely on the palette. Safe for dithered patterns — if two colors are within 5 ΔE, the dithering effect between them is imperceptible to humans anyway.  
**Order-independent?** Yes — palette membership does not change during remapping (all remaps are computed from the pre-consolidation state, then written atomically).

**Single-linkage note:** the union-find algorithm produces single-linkage clustering — if A is within threshold of B, and B is within threshold of C, then A and C are merged even if their direct distance exceeds the threshold. The calibration confirms this: at ΔE=8 in the portrait scenario, DMC 3856 (ΔE=9.40 from 3774) is pulled in because it is within ΔE=8 of 951, which was already merged into 3774. At the default threshold of **5 ΔE** this is a non-issue in practice — chains this long require multiple hops of near-duplicate colors, which is extremely rare. It becomes a user-visible concern only above ~8 ΔE, which is in the "expert" range of the slider. The tooltip or slider label should note "higher values may merge colors transitively".

**Blend-cell handling:** consolidation operates on palette entries and remaps cell IDs. Blend cells (`type: 'blend'`, composite `id = 'A+B'`) are treated as opaque: they are never auto-created, never merged with other entries, and their constituent thread IDs are not individually consolidated. The two constituent thread IDs in a blend are not part of `pal[]` independently — if the user has a blend whose component threads are near-duplicates of solid colors, they remain unaffected. Rationale: auto-modifying blend composition introduces risk without clear benefit; the user who set up a blend made a deliberate choice.

#### Op 2 — Isolated Pixel (Speckle) Removal

**Targets:** isolated single-cell or very small connected components of a "wrong" color surrounded by a dominant neighbor color

**Blend-cell handling:** blend cells are treated as their own distinct color for connected-component labelling (a blend `A+B` is a unique token, not the same as solid `A` or solid `B`). The neighbor vote **never produces a blend** as a replacement — it can only return solid thread IDs from `prePat`. If a blend cell is marked for replacement (e.g., via the brush in manual mode), `cleanupNeighbourVote` returns a solid replacement from its 8-connected neighborhood.

**Skip/empty boundary handling:** `__skip__` and `__empty__` cells are excluded from component membership and from the neighbor pool when computing dominance ratios. A speckle component adjacent to a skip region has fewer valid neighbors; if the remaining valid neighbors still meet the dominance ratio (`≥ DENOISE_SPECKLE_DOMINANCE_RATIO` share a single color), the component is replaced. This is correct behavior — a stitch sitting at the pattern boundary surrounded by skip on two sides and a dominant color on the other six is still a speckle.

**How:**
1. Label connected components of each non-skip, non-empty color.
2. For each component with size ≤ `DENOISE_SPECKLE_MAX_SIZE`:
   - Collect all 8-connected neighbors of the component (excluding cells within the component itself).
   - Count neighbor IDs. If the most-frequent neighbor color accounts for ≥ `DENOISE_SPECKLE_DOMINANCE_RATIO` of all valid neighbors, the component is "surrounded" → mark all component cells for replacement via `cleanupNeighbourVote`.
   - If the component has ≥ 2 distinct dominant neighbor colors, it may be an intentional edge vertex — skip.
3. Replace atomically (all votes computed from pre-op snapshot).

**Thin-line preservation:** a real thin line has many neighbors on *both sides* of different colors (see lineart cleanup's `AUTODETECT_MIN_FOREIGN_RATIO`). Our dominance test (`≥ DENOISE_SPECKLE_DOMINANCE_RATIO` single color) preserves 1-px lines because a line pixel's neighbors are split between two regions, not dominated by one.

**Dithering:** intentionally scattered pixels from Atkinson/Bayer dithering produce many small components. This op **should be off by default** and carry a dithering warning (see §6).

#### Op 3 — Edge Fringe Smoothing

**Targets:** transitional anti-aliasing bands between two large solid regions

**Blend-cell handling:** same as speckle — blend cells may be fringe candidates, but replacement via `cleanupNeighbourVote` always returns a solid ID. The flanking region size check (`≥ DENOISE_FRINGE_MIN_REGION_SIZE`) counts only solid cells with the same ID; blends are excluded from region size counts, so a blend-heavy region does not satisfy the minimum-region guard.

**Skip/empty boundary handling:** if one of the two top-frequency neighbor IDs is `__skip__` or `__empty__`, the fringe test is skipped (a cell at the boundary of the pattern is not a fringe cell — it is an edge). The `DENOISE_FRINGE_MIN_REGION_SIZE` check naturally handles this: skip/empty cells are never counted as part of a solid region, so a region that is mostly skip will not reach the minimum size threshold.

**How:**
1. For each non-skip cell C:
   - Collect its 8-connected neighbors (excluding C). Record their color IDs.
   - Find the two most-frequent neighbor colors A and B.
   - Skip if: A or B are `__skip__`/`__empty__`, or fewer than 4 distinct valid neighbors exist, or C.id === A or C.id === B (C is already in a dominant region), or there are more than 2 dominant colors (≥ 3 colors tied in the top 2 positions → C is a corner vertex, not a fringe cell).
2. If C.id ≠ A and C.id ≠ B: C may be a fringe cell. Compute:
   - `midLab` = LAB midpoint of `cmap[A].lab` and `cmap[B].lab`
   - `fringe_score = dE2000(C.lab, midLab)` — how "transitional" C is
   - If `fringe_score ≤ DENOISE_FRINGE_TRANSITION_DE`: C is transitional
   - Replace C with whichever of A or B is closer in CIEDE2000 to C.
3. Conservative guard: require both A and B to each span ≥ `DENOISE_FRINGE_MIN_REGION_SIZE` contiguous cells. This prevents "fringe smoothing" at texture/gradient edges that aren't actually anti-aliasing artifacts.

**Gradient preservation:** a genuine gradient has many different colors in sequence, none of which are "mid-points" of just two dominant regions. The `fringe_score ≤ DENOISE_FRINGE_TRANSITION_DE` test is strict enough that smoothly varying colors (which produce many distinct mid-point clusters) won't all collapse.

**Dithering:** Atkinson dithering doesn't produce the two-solid-region signature of fringe cells (it scatters across many regions). This op is relatively safe for dithered patterns, but should still be used conservatively.

### 4.2 Module-root constants (noise-cleanup-worker.js and useDenoiseMode.js)

```js
// ── Palette Consolidation ─────────────────────────────────────────────────
// Pairs of palette colors closer than this (CIEDE2000) are merged.
// Default: 5.0. Aggressive: 10–15.
// Rationale: calibration against the full DMC palette shows 311 pairs
// with ΔE2000 < 4 (quantization noise zone) and 1858 pairs with 4 ≤ ΔE < 8
// (legitimate distinct threads). A default of 5.0 catches accidental
// near-duplicates without touching intentional thread choices.
// The slider range goes up to 30 ΔE for expert use.
var DENOISE_PALETTE_THRESHOLD_DE = 5.0;

// ── Speckle Removal ───────────────────────────────────────────────────────
// Connected components with stitch count ≤ this are candidates.
// 3 covers isolated pixels (1) and small L-shapes/pairs (2-3).
// Above 4 risks eating legitimate 1-pixel lineart.
var DENOISE_SPECKLE_MAX_SIZE = 3;

// Fraction of a candidate's neighbor cells that must share one color for
// the candidate to be considered "surrounded" (not intentional).
// 0.6 = 3 out of 5 neighbors. Conservative.
var DENOISE_SPECKLE_DOMINANCE_RATIO = 0.6;

// ── Edge Fringe Smoothing ─────────────────────────────────────────────────
// Max CIEDE2000 from the midpoint of the two flanking region colors for a
// cell to be classified as a fringe (anti-aliasing signature).
// 6.0 is conservative — genuine gradient steps are typically > 8 ΔE apart.
var DENOISE_FRINGE_TRANSITION_DE = 6.0;

// Both flanking regions must span this many cells to be considered "solid".
// Prevents fringe smoothing at texture corners.
var DENOISE_FRINGE_MIN_REGION_SIZE = 4;

// ── UI / Rendering ────────────────────────────────────────────────────────
// Overlay color (teal) — visually distinct from lineart cleanup's orange.
var DENOISE_OVERLAY_COLOR = 'rgba(0,160,200,0.50)';

// Brush limits.
var DENOISE_BRUSH_MIN = 1;
var DENOISE_BRUSH_MAX = 10;

// Wide neighbourhood for vote tie-breaking (same as lineart cleanup).
var DENOISE_WIDE_NEIGHBOURHOOD_RADIUS = 2;

// Slider (0–100) maps to this ΔE range for the palette threshold.
var DENOISE_PALETTE_THRESHOLD_MAX_DE = 30;

// Fraction of cells that are fully surrounded by different colors; if
// exceeded at tool entry, shows the dithering-warning banner.
// Defined here (canonical) and also used in §5.3 where the UX is described.
var DENOISE_DITHER_WARN_RATIO = 0.15;
```

### 4.3 Representative-color tradeoff

Calibration data (see `reports/denoise-calibration-report.md`) shows:

| Pattern | Threshold | Most-used rep | Centroid rep | Agree? |
|---------|-----------|--------------|--------------|--------|
| Floral (745 ↔ 744 yellows, ΔE 4.54) | ΔE = 5 | 745 Yellow Lt Pale | 745 Yellow Lt Pale | SAME |
| Portrait (3774 ↔ 951 skin, ΔE 4.43) | ΔE = 5 | 3774 Desert Sand VLt | 948 Peach VLt | DIFFERENT |

In the portrait case, the centroid→nearest DMC approach would introduce **DMC 948** (not already in the palette) as the representative of a merge between 3774 and 951. The most-used approach keeps 3774 (the dominant member). **Most-used wins**: it never introduces a third DMC color not already in the pattern, and in practice the representativeness difference is small (centroid ΔE from nearest in both cases was < 1.5).

### 4.4 Auto-pass composition

When the user triggers the auto pass, operations run in this order:
1. **Op 1 (palette consolidation)** — operate on the palette first, remap cells, update the working pattern
2. **Op 2 (speckle removal)** — operate on the post-consolidation pattern
3. **Op 3 (fringe smoothing)** — operate on the post-speckle pattern

Each operation is computed from its input snapshot and applied atomically before the next operation runs. The auto-pass result is a single undo step ("denoise pass"). Individual brush strokes are each their own undo step.

**Why this order?** Palette consolidation should run first — it reduces the color set so that speckle and fringe detection work with the cleaned palette. Running speckle first could cause fringe detection to see the same inflated palette, potentially missing some transitions.

**One combined undo step per auto pass (Q2 answer):** Op toggles provide granularity without requiring per-operation undo entries. Ctrl+Z after an auto pass restores the entire pre-pass state in one step.

---

## 5. Dithering Caveat and Decision

### 5.1 The problem

The saved project JSON (`project.v8`) **does not record whether the pattern was generated with dithering**. The `dithMode` state is a user-preference-level setting, not saved per-project. So when a user opens the denoise tool on an existing pattern, we don't know whether its scatter was intentional.

Atkinson and Bayer dithering both produce the signatures that the speckle detector targets: many small, isolated pixels surrounded by neighbors of different colors.

### 5.2 Decision: Warn, then let the user decide (Q4 answer)

Attempting to auto-detect dithering from the pattern itself is fragile (especially for Atkinson). **The recommended approach is:**

1. **Measure the "isolation ratio"** at tool entry: count cells where all 8 neighbors are a different color, divided by total non-skip cells. If this exceeds `DENOISE_DITHER_WARN_RATIO` (suggested: **0.15** = 15% isolated pixels), display a prominent informational banner: *"This pattern may have been generated with dithering. Speckle removal will undo intentional scattered pixels — use with care, or stick to palette consolidation only."*

2. **Palette consolidation is always safe** — enabled by default in the auto pass regardless of dither status.

3. **Speckle removal is off by default** in the auto pass. The user must opt in. The toggle UI carries a brief note about dithering risk.

4. **Edge fringe smoothing is on by default** — it's the most conservative of the three and is unlikely to harm intentionally dithered patterns (dithering doesn't produce the two-solid-flanking-region signature).

5. **Manual brush** — all three operations are available regardless; the user is in full control.

This approach is unambiguous: we neither silently destroy dithering nor refuse to help. The user gets accurate information and can choose.

### 5.3 New constant

`DENOISE_DITHER_WARN_RATIO = 0.15` — fraction of cells that are fully surrounded by different colors; if exceeded at tool entry, triggers the dithering-warning banner. Canonical definition is in the §4.2 constants block.

---

## 6. Shared Helper Plan

### 6.0 Composition with lineart cleanup mode

The two modes are **fully composable in either order**:

- **Denoise first, then lineart cleanup**: after denoise reduces the palette and smooths fringes, lineart cleanup can be used to remove the darkest color. This is the recommended flow for users who converted a lineart illustration.
- **Lineart cleanup first, then denoise**: valid. The denoise pass will operate on the post-cleanup pattern. The lineart cleanup's undo entry and the denoise's undo entry are each their own independent undo steps — no interaction.
- **Both active simultaneously**: impossible by design — `activeTool` is a single-value string. Entering one mode exits the other (same as the current cleanup/brush/wand mutex).

### 6.1 Composition with regeneration

If the user triggers **Regenerate** (new conversion pass) after applying a denoise pass, the pattern is fully replaced. The app already shows a confirmation dialog before regenerating when there are unsaved edits (`hasEdited` flag). The denoise pass writes standard `{type:'denoise', changes:[...]}` history entries; `hasEdited` correctly becomes `true` after a denoise apply. The existing regeneration guard therefore applies: the user sees "Regenerating will discard your edits — continue?" before losing the denoise work. No special handling needed beyond ensuring the denoise apply sets `hasEdited`.

### 6.2 New file: `creator/cleanupSharedHelpers.js`

Extract from `useCleanupMode.js` into a new standalone file:

```js
/* creator/cleanupSharedHelpers.js
   Pure functions shared by useCleanupMode.js and useDenoiseMode.js.
   No React dependencies, no DOM, no globals except the module-root
   CLEANUP_WIDE_NEIGHBOURHOOD_RADIUS constant defined here.
*/

var CLEANUP_SHARED_WIDE_NEIGHBOURHOOD_RADIUS = 2;

// Find a palette entry by id by scanning prePat.
window.cleanupFindEntry = function cleanupFindEntry(prePat, id) { ... };

// 8-connected neighbor vote with 2 tie-breaks.
// Identical algorithm to the current _neighbourVote in useCleanupMode.js.
window.cleanupNeighbourVote = function cleanupNeighbourVote(
  idx, prePat, selectedSet, sW, sH, wideRadius
) { ... };
```

`useCleanupMode.js` is updated to call `window.cleanupNeighbourVote` and `window.cleanupFindEntry` instead of its private copies. Existing behavior is byte-identical — the only change is call site.

### 6.3 Build-system change: `build-creator-bundle.js`

Add to the `files` array, **before** `useCleanupMode.js`:
```js
'cleanupSharedHelpers.js',
```
And **after** `useCleanupMode.js`:
```js
'useDenoiseMode.js',
```

### 6.4 New file: `noise-cleanup-worker.js`

Root-level Web Worker (parallel to `cleanup-worker.js`). Imports `constants.js`, `dmc-data.js`, `colour-utils.js`. Message protocol:

```
IN  { type: 'detect', pat, sW, sH, paletteThresholdDe, speckleMaxSize,
      speckleDominanceRatio, fringeTransitionDe, fringeMinRegionSize,
      enablePalette, enableSpeckle, enableFringe }

OUT { type: 'result', mask: Array<0|1>, report: { paletteCount, speckleCount, fringeCount, mergeMap } }
  | { type: 'error', message: string }
```

`mergeMap` is an object `{ [removedId]: representativeId }` — used by the apply step to remap palette entries without re-running detection.

### 6.5 `useCreatorState.js` additions

```js
// Denoise tool state (parallel to cleanup* vars)
var _denoisePendingMask = useState(null);
var denoisePendingMask = _denoisePendingMask[0]; var setDenoisePendingMask = _denoisePendingMask[1];
var _denoiseAutoRunning = useState(false);
var denoiseAutoRunning = _denoiseAutoRunning[0]; var setDenoiseAutoRunning = _denoiseAutoRunning[1];
var _denoiseAutoError = useState(null);
var denoiseAutoError = _denoiseAutoError[0]; var setDenoiseAutoError = _denoiseAutoError[1];
var _denoiseSelTool = useState('auto');  // 'auto' | 'brush'
var denoiseSelTool = _denoiseSelTool[0]; var setDenoiseSelTool = _denoiseSelTool[1];
var _denoiseBrushSize = useState(1);
var denoiseBrushSize = _denoiseBrushSize[0]; var setDenoiseBrushSize = _denoiseBrushSize[1];
var _denoiseThreshold = useState(17);   // slider 0–100; maps to 0–30 ΔE; 17 ≈ 5 ΔE default
var denoiseThreshold = _denoiseThreshold[0]; var setDenoiseThreshold = _denoiseThreshold[1];
var _denoiseOps = useState({ palette: true, speckle: false, fringe: true });
var denoiseOps = _denoiseOps[0]; var setDenoiseOps = _denoiseOps[1];
var _denoisePreviewReport = useState(null);
var denoisePreviewReport = _denoisePreviewReport[0]; var setDenoisePreviewReport = _denoisePreviewReport[1];
var _denoiseDitherWarning = useState(false);
var denoiseDitherWarning = _denoiseDitherWarning[0]; var setDenoiseDitherWarning = _denoiseDitherWarning[1];
```

---

## 7. Auto / Brush / Preview / Undo UX

### 7.0 Brush apply UX (Q1 answer)

Two-step paint → Apply, matching the lineart brush. No immediate-apply mode. Each pointer-drag paints cells into the mask; pressing Apply commits them as a single undo step.

### 7.1 Entry point

A new button/toggle in `ToolStrip.js`, grouped with (or just after) the cleanup tool button:
- Icon: `Icons.sparkles()` (already in icons.js, line 544)
- Label: "Denoise" (below icon in tool strip, consistent with other tools)
- `aria-label`: "Conversion noise cleanup"
- `aria-pressed`: true when `activeTool === 'denoise'`
- Activates: `enterDenoise()` from `useDenoiseMode`; deactivates all other tools

Pressing the button while denoise is active → `exitDenoise()` (cancels, returns to previous tool or null).

### 7.2 Denoise toolbar row (when `activeTool === 'denoise'`)

```
[ Denoise ]  [Mode: Auto | Brush]  [Palette ΔE: ── 30 ──]  [ops: Palette ✓  Speckle ✗  Fringe ✓]
             [Run Auto / Running…]                          [ Apply (320 cells)  Cancel ]
```

Controls:
- **Mode toggle**: Auto / Brush (same sub-tool pattern as cleanup mode)
- **Palette threshold slider** (only when `denoiseOps.palette`): 0–100 → 0–30 ΔE; live updates preview
- **Op toggles**: three checkboxes — Palette, Speckle, Fringe. Speckle shows `⚠ dithering` tooltip.
- **Run Auto** button (Auto mode only): triggers the worker; auto-triggers on first entry and on settings change when a result is already showing (same `useEffect` pattern as cleanup auto-trigger)
- **Brush size** controls (Brush mode only)
- **Apply** (disabled when mask is empty; label shows affected count)
- **Cancel** — clears mask and exits tool

### 7.3 Dithering warning banner

If `denoiseDitherWarning === true` (computed once at `enterDenoise()`):
```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠ This pattern may have been generated with dithering. Speckle      │
│   removal can undo intentional scattered pixels. Palette            │
│   consolidation and fringe smoothing are safe to use.    [Dismiss]  │
└─────────────────────────────────────────────────────────────────────┘
```
Rendered inline in the toolbar row. `Icons.warning()` replaces ⚠.

### 7.4 Preview overlay

When `activeTool === 'denoise' && denoisePendingMask`:
- Canvas overlay in `drawPatternOverlayOnCanvas`: fill `DENOISE_OVERLAY_COLOR` (`rgba(0,160,200,0.50)`, teal) over every cell where `denoisePendingMask[i] === 1`.
- Distinct from the cleanup mode's orange (`rgba(255,90,0,0.50)`).
- After the worker returns, the toolbar shows: *"Will merge 14 near-identical colors, remove 320 speckle stitches, smooth 90 fringe stitches"* (from `denoisePreviewReport`).

### 7.5 Manual brush

Dragging in Brush mode paints the mask at the brush radius, applying all enabled operations locally (cell-by-cell, using the pure operation functions). The live-preview rAF coalescing pattern from `useCleanupMode.js._brushPaint` is reused verbatim. Each brush stroke, once the pointer is released, is one undo step.

**Brush-mode behavior:** unlike the lineart brush (which marks cells of the target color), the denoise brush marks any non-skip, non-empty cell in the brushed region. All enabled operations are applied to marked cells when Apply is pressed (or immediately on release in auto-apply brush mode — see question Q4 below).

### 7.6 Performance — confirmed against worst-case ceiling

**Grid size:** `useCreatorState.js` clamps both `sW` and `sH` to `[10, 300]`, giving a ceiling of **300×300 = 90,000 cells**.  
**Palette size:** the normal Sidebar slider cap is **40 colours**; the Import Wizard allows up to **80**. The denoise tool must be safe at 80.

Calibration timing (node, single-core, run on host machine — see `reports/denoise-calibration-report.md`):

| Operation | Input | Measured time |
|-----------|-------|---------------|
| dE2000 distance matrix | 50 colours = 1,225 pairs | 0.279 ms |
| Simulated remap scan | 90,000 cells | 0.438 ms |
| Full consolidation (estimated at 80 colours = 3,160 pairs) | — | < 1 ms |
| Speckle BFS + dominance check | O(n·8) at 90,000 cells | < 20 ms (estimated) |
| Fringe scan | O(n·8) at 90,000 cells | < 20 ms (estimated) |
| **Total auto pass, worst case** | 80 colours, 300×300 | **< 50 ms** |

All operations run inside `noise-cleanup-worker.js` — they never block the main thread. The 100ms perceptual threshold for a spinner is comfortably satisfied even in the worst case.

- Preview update on slider change: re-triggers the worker (same `useEffect` pattern as cleanup mode's tolerance re-run). Worker is terminated before a new one starts.
- Brush strokes: O(brushSize² · 8) per move event, coalesced into rAF batches — well within 60fps.

### 7.7 Undo

- **Auto pass Apply** → single undo step of type `'denoise'` with the `changes[]` array (same format as `'cleanup'` history entries, so `useEditHistory` handles it without modification).
- **Brush stroke Apply** (on pointer-up) → single undo step of type `'denoise'`.
- **Palette consolidation** remaps stitch ids, not just colors — the `changes[]` entries record `{ idx, old: { id, rgb, type } }` so undo restores both stitch and palette. The palette rebuild + zeroed-color logic is identical to `applyCleanup`.
- **Mode switch itself is not undoable** (consistent with cleanup mode).

### 7.8 Palette side-effects

Same behavior as cleanup mode: when consolidation removes a color from all stitches, it is **not auto-deleted** from the palette — instead it appears as a zero-count "unused" chip with the same toast notice and one-click "Remove" action from `applyCleanup`.

---

## 8. Pure Operation Functions (Phase 2 preview)

These are UI-agnostic and run both in the worker (for the auto pass) and inline (for brush strokes). They take a plain object pattern and return results without side effects.

```js
// Palette consolidation
paletteConsolidate(pat, pal, thresholdDe)
  → { pat: Array, mergeMap: {[removedId]: representativeId},
      paletteCount: number }

// Speckle removal
speckleRemove(pat, sW, sH, maxSize, dominanceRatio)
  → { indices: Set<number>, speckleCount: number }

// Edge fringe smoothing
fringeSmooth(pat, sW, sH, transitionDe, minRegionSize)
  → { indices: Set<number>, fringeCount: number }

// Combined
denoiseCombined(pat, pal, sW, sH, params, enabledOps)
  → { newPat, mask: Uint8Array, report: {...}, mergeMap }
```

All replacements are computed from the pre-operation snapshot (atomicity). Neighbors that are themselves marked for change do not vote for each other.

---

## 9. Test Plan (Phase 4 preview)

> **Note:** Tests follow the existing pattern: `fs.readFileSync` + regex extraction + `eval()` for pure functions from source files. Test file: `tests/denoiseMode.test.js`. Separate file: `tests/cleanupSharedHelpers.test.js` for the shared helper consistency test.


### Palette consolidation
- Two colors within threshold → merged to most-used one; all affected stitches remapped; positions unchanged
- Two colors beyond threshold → unchanged
- Three-way cluster → all collapse to single representative
- Single-color pattern → no change
- Empty pattern → no change

### Speckle removal
- Lone off-color pixel surrounded entirely by one color → replaced
- **Discriminating test (thin line preserved):** 5-pixel horizontal run of color X in a sea of color Y → NOT replaced (connected component is a line, neighbors are split on two sides)
- Neighbor-also-selected → excluded from vote (atomicity test)
- Corner pixel (only 3 valid neighbors) → behaves correctly
- Dominance ratio not met (2 competing neighbor colors) → NOT replaced

### Edge fringe smoothing
- 3-pixel band of transitional color between solid region A and solid region B → collapses to nearer region
- **Discriminating test (gradient preserved):** smoothly varying color sequence (6+ distinct colors) → not collapsed (fringe_score > threshold for all cells)
- **Discriminating test (real edge preserved):** two adjacent solid regions with no fringe cells → no change
- Small regions (< `DENOISE_FRINGE_MIN_REGION_SIZE`) flanking a cell → fringe NOT triggered

### Skip/empty boundary tests

**Speckle:**
- Single off-color pixel at pattern edge: 3 neighbors `__skip__`, 5 neighbors solid color X → replaced (5/5 valid = 1.0 ≥ dominance ratio)
- Single off-color pixel at pattern edge: 3 neighbors `__skip__`, 3 neighbors solid X, 2 neighbors same off-color → valid neighbors = 3+2 = 5; dominant = 3/5 = 0.6 = exactly threshold → boundary case (implementation should use `≥`)
- Speckle component completely surrounded by `__skip__` → 0 valid neighbors, dominance ratio undefined → NOT replaced

**Fringe:**
- Cell C where one of the two top-frequency neighbor IDs is `__skip__` → fringe test skipped entirely
- Cell C between solid region A (6+ cells) and `__skip__` background → skip side does not meet `DENOISE_FRINGE_MIN_REGION_SIZE` → NOT treated as fringe

### Blend cell handling
- Blend cell adjacent to speckle: speckle replaced by solid neighbor; blend cell itself unchanged
- Blend cell not counted when computing dominant-neighbor region sizes in fringe detection
- Palette consolidation: blend cell id not remapped even if constituent thread ids would be merged

### Combined / determinism
- Same input + same params → identical output (no randomness)
- Processing order independence: result identical regardless of cell visit order
- All-speckle pattern (every cell isolated) → correctly replaces all with dominant neighbor
- Dithered pattern (estimated via isolation ratio) → triggers warning flag correctly

### Integration
- Apply → single undo step of type `'denoise'`, fully reversible (stitches and palette restored)
- Brush stroke → single undo step
- Palette consolidation → stitch counts recalculated correctly
- Save/load round-trip: cleaned pattern persists (no special serialization needed — format unchanged)
- `cleanupNeighbourVote` returns same result whether called from cleanup mode or denoise mode (shared helper consistency test)
- Denoise apply sets `hasEdited = true` → regeneration guard fires correctly

---

## 10. File Changes Summary

| File | Change |
|------|--------|
| `creator/cleanupSharedHelpers.js` | **New** — `cleanupNeighbourVote`, `cleanupFindEntry` |
| `creator/useCleanupMode.js` | **Refactor** — call `window.cleanupNeighbourVote` instead of `_neighbourVote`; call `window.cleanupFindEntry` instead of `_findEntry` |
| `creator/useDenoiseMode.js` | **New** — full hook, parallel to `useCleanupMode.js` |
| `noise-cleanup-worker.js` | **New** — detection algorithms for auto pass |
| `creator/canvasRenderer.js` | **Add** — `activeTool === 'denoise'` overlay branch; `DENOISE_OVERLAY_COLOR` |
| `creator/ToolStrip.js` | **Add** — `denoiseRow` controls + "Denoise" toggle button |
| `creator/useCreatorState.js` | **Add** — `denoise*` state variables |
| `creator-main.js` | **Add** — `denoiseMode = useDenoiseMode(state, history)`; wire actions |
| `build-creator-bundle.js` | **Add** — `cleanupSharedHelpers.js`, `useDenoiseMode.js` to files list |
| `icons.js` | No change — `sparkles` already exists (line 544) |
| `tests/denoiseMode.test.js` | **New** — full test suite (see §9) |
| `tests/cleanupSharedHelpers.test.js` | **New** — `cleanupNeighbourVote` shared-helper consistency |

---

## 11. Resolved Decisions (formerly Open Questions)

**Q1 (brush) — RESOLVED:** Two-step paint → Apply, matching the lineart brush. No immediate-apply mode.

**Q2 (undo) — RESOLVED:** One combined undo step per auto pass. Op toggles provide the granularity; no per-operation undo entries.

**Q3 (defaults) — RESOLVED via calibration:** Default palette ΔE = **5** (not 8). Calibration shows the DMC palette has 311 pairs with ΔE2000 < 4 (genuine accidental near-duplicates) and 1858 pairs with 4 ≤ ΔE < 8 (legitimate distinct threads). A default of 5 catches only the former. Slider range remains 0–30. Speckle max size = 3 and fringe ΔE = 6 unchanged.

**Q4 (dithering) — RESOLVED:** Always-on isolation-ratio scan with a dismissible banner, persisted **per-project** in `localStorage` keyed to project ID (e.g., `denoise_ditherWarnDismissed_proj_1712345678`). Re-warns on a different project but stays silent on re-entry to the same one after dismissal.

---

## 12. Out-of-Scope Notes (Upstream Recommendations)

During this audit, two upstream improvements to the conversion pipeline were identified that would reduce noise at its source (rather than cleaning it post-conversion). These are **not** in scope for this tool but are noted for future consideration:

1. **Post-quantization palette merging**: run a CIEDE2000 clustering pass on the quantized palette before mapping, to collapse near-duplicate DMC entries before any pixels are assigned. This would reduce the palette-consolidation cleanup burden significantly.

2. **Atkinson confetti threshold tuning by fabric count**: the current `confettiDitherThreshold = 4.0` is independent of fabric count. At higher fabric counts (e.g., 18-count vs 11-count), each stitch is smaller and isolated pixels are more visible. A fabric-count-aware threshold would reduce residual speckle from dithering on fine fabrics.
