# Rendering Performance Audit (Agent 2)

> Scope: React re-render hotspots, canvas redraw paths, list rendering,
> drag/move handlers, animations, listener cleanup, and worker offload across
> the Creator, Tracker, Manager and Stats surfaces.
> Read-only audit. All findings are hypotheses backed by source citations and
> include a measurement method for I0–I2 items per
> [reports/00_PERFORMANCE_CONTEXT.md](../00_PERFORMANCE_CONTEXT.md).

## Top-3 summary

The single biggest rendering win is in the Creator: `cvCtx` (the
`CanvasContext.Provider` value built in [creator-main.js](../../creator-main.js#L542))
includes `hoverCoords` and `setHoverCoords`, so every cross-cell mousemove
re-renders **every** consumer of `useCanvas()` — including the 115 KB
[creator/Sidebar.js](../../creator/Sidebar.js) and its full
`displayPal.map(...)` chip list (each chip allocates ~6 inline style objects
and 3 fresh closures). Splitting hover state into its own micro-context (or
moving it to a ref consumed only by `PatternCanvas`) is the highest-leverage
change in this report. Second: `manager-app.js` renders the entire
filtered-thread grid (up to ~900 cards across DMC + Anchor) unwindowed with
inline arrow handlers and `style={{...}}` objects on every card, and the
search input rebuilds the whole grid on every keystroke. Third: the Tracker
already has a strong incremental render path (`drawCellDirectly`, tier-aware
fallbacks, RAF coalescing), but the palette-chip JSX duplicated at
[tracker-app.js:6277](../../tracker-app.js#L6277) and
[tracker-app.js:6520](../../tracker-app.js#L6520) packs a ~600-char inline
`onClick` closure with two `getBoundingClientRect` calls into a list rendered
once per palette colour — fine on a 12-colour chart, costly on 80+ colours.

---

## I0 — critical

_None observed._ The known-hot paths (drag-paint, drag-mark, generation,
PDF export) all already use either dedicated workers
([generate-worker.js](../../generate-worker.js),
[analysis-worker.js](../../analysis-worker.js),
[pdf-export-worker.js](../../pdf-export-worker.js)) or imperative canvas
writes that bypass React.

---

## I1 — high

### I1-R1. `cvCtx` re-publishes `hoverCoords` on every mousemove → Sidebar (115 KB) re-renders per cell

`cvCtx` (built via `useMemo` in [creator-main.js:542](../../creator-main.js#L542))
includes `hoverCoords: state.hoverCoords` and ~70 other fields. `useCanvasInteraction`
calls `state.setHoverCoords(gc)` whenever the pointer crosses a cell
([creator/useCanvasInteraction.js:551](../../creator/useCanvasInteraction.js#L551))
and to `null` on every leave/cancel (12 sites in that file). Every such update
mutates `cvCtx`, which is consumed by `Sidebar` via
`var cv = window.useCanvas()` ([creator/Sidebar.js:8](../../creator/Sidebar.js#L8))
plus by `PatternCanvas`, `Toast`, `ContextMenu`, `MagicWandPanel`,
`ColourReplaceModal` and others. None of these consumers actually need
`hoverCoords` — only `PatternCanvas`'s overlay-redraw effect does.

Knock-on cost in `Sidebar`: `displayPal.map(function(p) {...})` at
[creator/Sidebar.js:139](../../creator/Sidebar.js#L139) recomputes
`stashStatusForChip(p)` and `_trackUnowned(p)` (which itself calls
`splitBlendId` and walks the stash) for every chip on every hover move,
and allocates a fresh inline `style` object plus 3 inline arrow handlers
per chip. Charts with 60–120 colours allocate hundreds of objects per
mouse-move event.

- **Impact**: I1.
- **Measure**: Open `create.html` with a 100×100 generated pattern (60+
  colours), open Chrome DevTools → Performance → record, then sweep the
  pointer across the chart for 3 seconds. In the flame chart, look for
  repeated frames containing `Sidebar` / `displayPal.map` calls. Expected
  before: one Sidebar render per cell crossed (dozens/sec). Add a render
  counter (`React.useRef(0); console.log('Sidebar render', ++c.current)` at
  the top of `Sidebar`) and confirm it ticks on every hover. Target after
  fix: 0 ticks while only the cursor moves.
- **Fix shape (out of scope here)**: extract `hoverCoords` into a separate
  context (e.g. `HoverContext`) consumed only by `PatternCanvas`; or store
  hover in a `useRef` exposed via a stable getter, with `PatternCanvas`
  driving its own RAF redraw from `pointermove` directly.

### I1-R2. Manager thread grid renders ~900 cards unwindowed, inline objects/handlers per row, re-renders on every search keystroke

[manager-app.js:1128](../../manager-app.js#L1128) renders
`{filteredThreads.map(d => ...)}` against the union of DMC (~454) and Anchor
(~454) threads ([manager-app.js:729-730](../../manager-app.js#L729)). Each
row builds ~6 React elements with literal `style={{...}}` objects
(`background: rgb(${d.rgb})`, the gauge segments, the brand pill at
[manager-app.js:1141](../../manager-app.js#L1141)) and an inline
`onClick={() => { setSelectedThread(...); ... }}` arrow that captures
`isSelected`. The `searchQuery` state lives on the same component, so every
typed character re-runs the `filteredThreads` `useMemo` and re-renders all
matching rows. There is no `React.memo`, no row component split, and no
windowing.

- **Impact**: I1.
- **Measure**: Open `manager.html`, ensure the stash filter is "All" so
  ~900 rows render. In DevTools Performance, record while typing a 5-char
  search ("anc h o r" with 100 ms between keys). Expected before: each
  keystroke produces a long task (>50 ms on a mid-tier laptop) dominated by
  React reconciliation of the grid. After splitting into a memoised `<ThreadCard>`
  with stable handlers + windowing (e.g. only render rows within the
  visible scroll viewport), each keystroke should produce a single
  short task (<16 ms).

### I1-R3. PatternCanvas Effect 1 base-cache invalidation list is ~25 deps; any one change forces a full `getImageData` round-trip

[creator/PatternCanvas.js:106-117](../../creator/PatternCanvas.js#L106) lists
`ctx.pat, ctx.cmap, cv.cs, ctx.sW, ctx.sH, cv.view, cv.hiId, cv.showCtr,
cv.bsLines, app.tab, cv.showOverlay, cv.overlayOpacity, gen.img,
ctx.partialStitches, cv.stitchType, ctx.partialStitchTool,
gen.showCleanupDiff, gen.cleanupDiff, cv.dimFraction, cv.dimHiId,
cv.bgDimOpacity, cv.bgDimDesaturation, cv.highlightMode, cv.tintColor,
cv.tintOpacity, cv.spotDimOpacity, ctx.fabricColour, ctx.canvasTexture` as
deps. Every change re-runs `drawPatternBaseOnCanvas` then
`baseCacheRef.current = context.getImageData(0, 0, canvas.width, canvas.height)`
— `getImageData` on a 100×100 chart at 20 px/cell is a 2000×2000 readback
(~16 MB ImageData). That's fine for genuinely structural changes (pat,
cmap, sW, sH) but is also forced by every `view`, `hiId`, `showCtr`,
`bsLines.push`, `tintColor`, `tintOpacity` slider drag, etc.

The hover-only overlay effect ([creator/PatternCanvas.js:120-138](../../creator/PatternCanvas.js#L120))
is correctly cheap — but it shares the dep list with structural changes.

- **Impact**: I1 on large charts during slider drags (e.g. tint-opacity
  scrubbing).
- **Measure**: Open a 200×200 pattern in Edit mode. Drag the
  `tintOpacity` / `bgDimOpacity` slider continuously for 3 seconds. In
  DevTools Performance, look for repeated `getImageData` and
  `drawPatternBaseOnCanvas` calls per RAF. Add `console.time('baseRedraw')`
  around the RAF callback. Expected before: ~16–40 ms per frame on a
  large chart, tying up the main thread during the entire drag. Target
  after split (cache base only when structural deps change; let overlay
  effect handle highlight/tint changes via cached base + an additional
  pass): <2 ms per frame for slider scrubs.

### I1-R4. Stats `neverUsedData` loads every project sequentially

[stats-page.js:1156-1175](../../stats-page.js#L1156) does `for (const m of metas) { proj = await ProjectStorage.get(m.id); ... }` to walk every saved
project's pattern array looking for unused stash threads. The neighbouring
`patternSourceData` effect ([stats-page.js:1216](../../stats-page.js#L1216))
already uses `Promise.all(metas.map(...))`. Both effects fire on stash or
project changes (and on first stats nav). Sequential walks block on disk
IO each iteration.

- **Impact**: I1 for users with 30+ saved projects (not unusual for the
  target user — see `getProjectsReadyToStart` in
  [project-storage.js](../../project-storage.js)).
- **Measure**: Use the existing `npm run perf:baseline` Playwright project,
  but seed IndexedDB with 50 dummy projects (call `ProjectStorage.save` in
  beforeAll). Record stats-page navigation under DevTools Performance.
  Expected before: long await chain (>1 s). After switching to
  `Promise.all(metas.map(m => ProjectStorage.get(m.id).catch(() => null)))`
  + a single `usedKeys` aggregation pass: <200 ms on the same fixture.
  The sequential walk's only justification (per the comment) is "peak
  memory"; for a typed worker offload that argument is moot, but for the
  current main-thread aggregation a chunked `Promise.all(metas.slice(...))`
  in batches of 10 keeps memory bounded while parallelising IO.

### I1-R5. Marching-ants `setInterval` redraws full overlay every 100/120 ms even when tab is hidden or canvas off-screen

[creator/PatternCanvas.js:42-57](../../creator/PatternCanvas.js#L42) and
[creator/PatternCanvas.js:67-79](../../creator/PatternCanvas.js#L67) start a
`setInterval(..., 100)` / `setInterval(..., 120)` for the highlight-outline
and selection-mask ants. Each tick calls `context.putImageData(baseCacheRef.current, 0, 0)`
and `drawPatternOverlayOnCanvas(...)` — i.e. paints the entire base ImageData
plus the overlay. They run regardless of `document.visibilityState`, and
`setInterval` continues to tick (and queue work) when the tab is backgrounded.

- **Impact**: I1 for backgrounded tabs / multitab workflows; I2 in
  foreground.
- **Measure**: Enable an outline highlight, switch to another tab, return
  60 s later. Compare `performance.measureUserAgentSpecificMemory()` (or
  `performance.memory.usedJSHeapSize` in Chromium) before and after. Also
  `chrome://process-internals` should show the page consuming CPU while
  hidden. After moving to `requestAnimationFrame`-driven ticks (which the
  browser throttles when hidden) plus a `visibilitychange` listener that
  pauses the loop: 0% CPU when hidden.

---

## I2 — medium

### I2-R6. Tracker palette chip JSX has a ~600-char inline `onClick` arrow with `getBoundingClientRect`, duplicated at lines 6277 and 6520

[tracker-app.js:6277](../../tracker-app.js#L6277) and
[tracker-app.js:6520](../../tracker-app.js#L6520) contain near-identical
JSX for a swatch button: `onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setPaletteDetail({...});}}` plus a
matching `onKeyDown` handler. The closure is recreated per chip per
re-render, the entire 600-char string is re-parsed by Babel-Standalone on
each refresh of the inline-transpiled JSX, and the duplication means a
single fix needs to be applied twice.

- **Impact**: I2 (per-render allocation, code-size, maintenance).
- **Measure**: In Performance → Memory, allocation timeline while
  hovering the palette legend should show repeated tiny allocations on
  every chip render. Extract a `<PaletteSwatchButton p={p} pal={pal}
  onClick={openDetail} />` memoised component and verify allocation
  spikes flatten.

### I2-R7. `displayPal.map` in `Sidebar` inlines `style={{}}` objects (~6 per chip) and 3 closures per chip

[creator/Sidebar.js:139-200](../../creator/Sidebar.js#L139) — the chip,
swatch span, symbol span, label span, status dot span and "swap" button
each have a fresh inline `style` object. With the I1-R1 fix in place this
matters less, but with 100+ colours it still produces 600+ object
allocations per legitimate render (e.g. after a paint stroke that updates
counts).

- **Impact**: I2.
- **Measure**: Same memory-allocation profile as I2-R6, scoped to
  Sidebar. Move static styles to CSS classes; keep dynamic ones (`background:
  "rgb(" + p.rgb + ")"`) inline. Confirm allocation count drops by ≥80%.

### I2-R8. `useCanvasInteraction.redrawCanvasFromState` calls full `drawPatternOnCanvas` (no base-cache reuse) on certain drag-erase paths

[creator/useCanvasInteraction.js:74-90](../../creator/useCanvasInteraction.js#L74)
re-renders the whole pattern by spreading a merged `state` object into
`drawPatternOnCanvas`. The PatternCanvas component carefully maintains
`baseCacheRef` to avoid this exact cost during normal drag-paint, but the
imperative `redrawCanvasFromState` helper in `useCanvasInteraction` ignores
that cache and is invoked from drag-erase / partial-stitch paths.

- **Impact**: I2 (only on backstitch/partial-stitch erase drags).
- **Measure**: Record Performance during a 2-second drag-erase of a long
  diagonal backstitch run on a 150×150 chart. Expected: a frame containing
  `drawPatternOnCanvas` per pointermove — typically 30–80 ms each. Fix by
  routing erase commits through the same `setBsLines`/`setPartialStitches`
  state that PatternCanvas already watches (Effect 1 will then redraw
  via the cached base path).

### I2-R9. Tracker `getBoundingClientRect` reads inside scroll/zoom RAF callbacks

[tracker-app.js:4851](../../tracker-app.js#L4851) and
[tracker-app.js:4886](../../tracker-app.js#L4886) call
`container.getBoundingClientRect()` inside RAF callbacks driven by zoom
and scroll. Combined with the imperative `style.top = ... + 'px'` writes
in `updateHoverOverlay` ([tracker-app.js:4502-4519](../../tracker-app.js#L4502)),
this can read–write–read across the same frame and force layout. The
writes are batched into the same callback so it's not a classic loop, but
mixing read (`getBoundingClientRect`) and write (`style.top=`) inside one
RAF is the textbook layout-thrash setup.

- **Impact**: I2.
- **Measure**: Performance recording during a zoom slider drag. Look for
  purple "Layout" bars adjacent to "Recalculate Style" within the same
  frame. After caching the rect once at scroll/zoom start and using
  `transform: translate(...)` instead of `top`/`left`, those bars should
  collapse.

### I2-R10. Tracker `breadcrumb`, `recOverlay`, `threadUsage`, `focusOverlay`, `countingAids` each maintain separate `<canvas>` overlays + RAF loops

[tracker-app.js:6406-6412](../../tracker-app.js#L6406) stacks 5 separate
absolutely-positioned canvases on top of the main stitch canvas, each with
its own redraw effect and RAF (`threadUsageRafRef`,
`countingAidsRafRef`, `recPulseRef`, etc.). They all paint from the same
underlying state. A `recPulseRef` "pulse" RAF loop runs continuously
([tracker-app.js:4229](../../tracker-app.js#L4229)) any time recording
mode is on.

- **Impact**: I2.
- **Measure**: Open Performance, enable record + counting aids + thread
  usage simultaneously, observe baseline CPU. Each independent loop
  contributes ≥1 paint per frame. Consolidating overlays into a single
  composited overlay canvas (or pausing the recPulse RAF when nothing
  changed) should drop idle CPU to near zero.

### I2-R11. Many stats `useMemo` blocks re-run on every state change because of broad deps

[stats-page.js:1338-1500](../../stats-page.js#L1338) — `hueData`,
`familyData`, `dmcCoverage`, `streakData`, `paceData`, `buyingImpact`,
`useWhatYouHaveRecs`, etc. each take `projectDetails` / `allSessions` /
`stash` etc. as deps. Switching the active stats tab toggles a parent state
that triggers parent re-render, which re-runs all of these (since
`React.useMemo` only skips when deps are reference-equal). Most of the
results aren't even read by the currently-visible tab.

- **Impact**: I2.
- **Measure**: Add `useTraceUpdate` (small custom hook printing changed
  deps) to the stats-page top component. Switch tabs five times.
  Confirm `hueData` / `familyData` recompute even when on an unrelated
  tab. Fix by lifting per-tab calculations into the tab subcomponents so
  they only run when their tab is mounted (or wrap each tab's contents
  in `React.lazy` / mount-on-demand).

### I2-R12. `tracker-app.js` palette swatch JSX exists in two duplicate copies (~6277 and ~6520)

Same code in two render branches (Edit-mode legend vs Track-mode legend).
Per I2-R6 the closures are heavy; but the duplication means any future
change risks divergence. Hygiene-adjacent perf concern because the second
copy renders even when not visible (depending on `mode`).

- **Impact**: I2.
- **Measure**: Render counter on a wrapping component. Confirm only one
  branch renders at a time. If both are reachable simultaneously, that's
  2× the chip work for no reason.

### I2-R13. `pdCtx` (`PatternDataContext`) carries `pat`, `partialStitches`, `bsLines` together — any cell paint re-renders all consumers

[creator-main.js:651](../../creator-main.js#L651) memoises `pdCtx` from
the full pattern objects. When a single drag-paint commits a new `pat`
reference, every consumer of `usePatternData()` re-renders, including
`Sidebar`, `LegendTab`, `MaterialsHub`, `ProjectTab`, etc. Many of those
only need palette/cmap, not the raw pattern array. Splitting `pat` (huge,
changes per stroke) from `cmap`/`pal` (small, changes only when colours
add/remove) into two contexts would let chip lists skip re-renders during
drag-paint.

- **Impact**: I2.
- **Measure**: Render counter on `LegendTab` while drag-painting. Each
  pointer-up that commits a stroke should trigger one render today; after
  splitting, only renders when the palette structure actually changes.

### I2-R14. Sidebar `_trackUnowned` walks every cell of every blend chip on every render

[creator/Sidebar.js:121-140](../../creator/Sidebar.js#L121) — for every
chip whose status is `'needed'`, splits the blend id, walks `stash`,
calls `skeinEst`. With 100+ chips this is an O(palette × stash) pass on
every Sidebar render (which, per I1-R1, is per-mousemove today).

- **Impact**: I2 (collapses to I3 once I1-R1 is fixed).
- **Measure**: `performance.mark`/`measure` around the `chips =
  displayPal.map(...)` loop. After memoising the unowned-keys computation
  to depend only on `[displayPal, stash, fabricCtForStash]`, expect the
  measure to disappear from per-mousemove frames.

---

## I3 — low

- **I3-R15.** [stats-page.js](../../stats-page.js) has 30+ `useEffect`
  blocks, each with its own listener subscription and IndexedDB walk.
  Each is correctly cleaned up but the sheer count means stats-page
  mount triggers ~30 microtasks back-to-back. Consolidating effects that
  share dep lists (`stash` + `loading` triggers four effects) would
  reduce churn.
- **I3-R16.** [creator/PreviewCanvas.js:40-85](../../creator/PreviewCanvas.js#L40)
  rebuilds an `ImageData` per render via `octx.createImageData(sW, sH)`.
  Cache the buffer between renders when `sW`/`sH` haven't changed.
- **I3-R17.** Inline `style={{}}` objects throughout
  [tracker-app.js](../../tracker-app.js) (hundreds of occurrences in
  modal, panel and toolbar JSX). Most are static. Extract to CSS classes
  to reduce per-render allocations and Babel parse cost. Hygiene unless
  the parent re-renders frequently.
- **I3-R18.** [tracker-app.js:6349](../../tracker-app.js#L6349) — the
  scroll handler arrow `onScroll={()=>{if(!scrollRafRef.current){scrollRafRef.current=requestAnimationFrame(()=>{renderStitch();...})}}}` is correctly RAF-coalesced but the outer arrow is still allocated
  every parent render. Wrap in `useCallback`.
- **I3-R19.** CSS animations in [styles.css](../../styles.css#L171)
  (`@keyframes card-pickbg-pulse`, `sheet-slide-up`,
  `overlay-scrim-fade`, etc.) all animate `transform`/`opacity` — good,
  no layout thrash from CSS. The only outlier is
  [styles.css:550](../../styles.css#L550) (`@keyframes lpanel-slide-up`)
  which animates `transform` (also fine). No action.
- **I3-R20.** Marching-ants `setInterval` callback in
  [creator/PatternCanvas.js:43-48](../../creator/PatternCanvas.js#L43)
  reads `cv.setAntsOffset` from a captured ref but also calls
  `latest.setAntsOffset(p => (p+1)%20)` — the React state update is
  unused (only `antsOffsetRef.current` drives the redraw). Either drop
  the state update or drop the ref-driven branch; today both fire.

---

## I4 — hygiene

- **I4-R21.** [embroidery.js](../../embroidery.js) (98 KB image
  processing module) is loaded only by [embroidery.html](../../embroidery.html#L37)
  (a demo page). It is _not_ loaded by `create.html`, `stitch.html`,
  `manager.html` or `home.html`. Generation in the main app uses
  [generate-worker.js](../../generate-worker.js) and tracker analysis
  uses [analysis-worker.js](../../analysis-worker.js). No action needed
  for the main pipeline; consider whether `embroidery.html` is still a
  shipped surface or a dev-only artifact.
- **I4-R22.** [tracker-app.js:1](../../tracker-app.js#L1) destructures
  `useState,useRef,useCallback,useEffect,useMemo` from `React` once,
  then [tracker-app.js:1](../../tracker-app.js#L1) (same line, reported
  twice in grep — likely a single line repeated). Source-of-truth
  cleanup only.
- **I4-R23.** [project-library.js:75-82](../../project-library.js#L75)
  subscribes to three custom events with proper cleanup — symmetry
  intact. `tracker-app.js` listeners checked at lines 886, 888, 890,
  1062, 1248, 1358, 1402, 1429 — all add/remove pairs verified.
- **I4-R24.** No naked `setInterval`/`setTimeout` without cleanup found
  in the hot files audited. The intervals in `PatternCanvas` and the
  timers in `tracker-app.js` (`hlIntroTimerRef`, `focusFadeTimerRef`,
  `analysisRequestIdRef`) all have cleanup.

---

## Out of scope / verified-clean

- **Embroidery image processing on the main thread**: Verified via
  [creator/useCreatorState.js:978](../../creator/useCreatorState.js#L978)
  and [tracker-app.js:2127](../../tracker-app.js#L2127) — generation,
  analysis and PDF export all run in dedicated Web Workers. The 98 KB
  `embroidery.js` is restricted to the standalone demo page.
- **Tracker incremental rendering**: `drawCellDirectly` at
  [tracker-app.js:4533](../../tracker-app.js#L4533) plus the tier-aware
  fast path (tier 1 = flat fill only) and `requestAnimationFrame`
  coalescing on scroll/zoom are well-engineered. The Tracker grid is
  not a render hotspot today; the issues above are around the React
  shell that surrounds it.
- **Drag-mark hook**: [useDragMark.js](../../useDragMark.js) is a pure
  reducer-driven state machine with no DOM listeners of its own (the
  caller spreads `{...handlers}` on the canvas). No leaks.

---

## Suggested implementation order

1. **I1-R1** (split hover out of `cvCtx`) — single-file change in
   [creator-main.js](../../creator-main.js) + a new tiny context;
   automatically degrades I1-R3, I2-R7, I2-R14 from "every mousemove"
   to "every legitimate paint commit".
2. **I1-R2** (memoise + window the manager thread grid) — biggest win
   for the manager surface; isolated change in
   [manager-app.js](../../manager-app.js).
3. **I1-R4** (parallelise stats `neverUsedData` walk) — ~5-line change in
   [stats-page.js](../../stats-page.js).
4. **I1-R5** (RAF-driven ants + visibilitychange pause).
5. **I1-R3** (split PatternCanvas base-cache deps) — needs care because
   the dep list encodes correctness; do after I1-R1 lands so the test
   surface is smaller.
6. The remaining I2 items can be batched as nearby code is touched.

