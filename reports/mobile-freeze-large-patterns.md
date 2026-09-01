# Mobile freeze on large patterns — diagnosis and ranked solutions

**Date:** 2026-08-30 · **Branch:** `feat/ipad-sync-workflow`
**Scope:** why the tracker freezes on mobile at large pattern sizes, what
comparable apps do instead, and a ranked set of options.
Companion to [mobile-experience-audit.md](mobile-experience-audit.md) (§A is the
original canvas diagnosis) and [ipad-sync-workflow.md](ipad-sync-workflow.md).

> **Provenance of the numbers.** Nothing here was measured on a device in this
> pass. Figures are either (a) **computed** by executing the app's own formulas
> (`maxCellSize`, `computeDetailTier`) over a range of pattern sizes, or
> (b) **quoted** from the measured runs already recorded in
> [mobile-experience-audit.md](mobile-experience-audit.md). Each is labelled.
> Claims about competitors' internals are labelled **inferred** where I could
> not verify them from source.

---

## Executive summary

The 2026-08-28 audit correctly identified the freeze as canvas allocation and
shipped a mitigation: clamp zoom so a single canvas stays inside a device
budget ([useCanvasOverlays.js:46–99](../useCanvasOverlays.js#L46-L99)). That
stopped the *blank chart*. It did not fix the underlying design, and it
introduced a second problem.

**The architecture is unchanged: every canvas is still allocated at
full-pattern-size × zoom.** The audit's real fix — item 11, viewport-tiled
rendering — was never done. Four passes of work went to items 1–5, 10 and 12.

Three things follow from that, and together they explain a freeze on a large
pattern:

| # | Root cause | Severity |
| --- | --- | --- |
| **1** | The device budget is **per canvas**, but up to **six** full-size canvases mount simultaneously | **Critical** |
| **2** | The iOS budget is gated on `pointer: coarse`, which is **false on an iPad with a trackpad** — such a device gets the 134 Mpx *desktop* budget, i.e. ~500 MB per canvas | **Critical** |
| **3** | Where the clamp *does* engage, it silently caps zoom below the symbol-rendering threshold — patterns ≥ 300 × 400 **can never display symbols on iOS** | **High (usability)** |

Causes 1 and 2 are the freeze. Cause 3 is why the current mitigation cannot be
the final answer even if 1 and 2 are fixed: it trades a crash for an unusable
chart.

---

## Part 1 — What actually happens on a large pattern

### 1.1 The clamp, computed

Running the app's own `maxCellSize()` and `computeDetailTier()` over a range of
sizes, under the iOS arm of the budget (16.78 Mpx, no `deviceMemory`):

| Pattern | Cells | max `scs` | max zoom | Canvas | Memory | Tier | Symbols? |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| 100 × 100 | 10 000 | 40 | 2.00 | 16.2 Mpx | 62 MB | 4 | yes |
| 200 × 250 | 50 000 | 18 | 0.90 | 16.4 Mpx | 63 MB | 3 | yes |
| 250 × 300 | 75 000 | 14 | 0.70 | 14.9 Mpx | 57 MB | 3 | yes |
| **300 × 400** | 120 000 | 11 | **0.55** | 14.8 Mpx | 56 MB | 2 | **no** |
| **400 × 500** | 200 000 | 9 | **0.45** | 16.4 Mpx | 63 MB | 2 | **no** |
| **500 × 700** | 350 000 | 6 | **0.30** | 12.8 Mpx | 49 MB | 2 | **no** |
| **600 × 800** | 480 000 | 5 | **0.25** | 12.2 Mpx | 47 MB | 2 | **no** |

Two things to read off this:

**The chart never gets small.** The clamp holds *area* roughly constant at the
budget, so every row is still a 47–63 MB backing store. It caps the peak; it
does not reduce the steady-state cost. That is by design — but it means the
budget is the whole story, and the budget is per-canvas (§1.2).

**Symbols vanish above ~250 × 300.** `computeDetailTier`
([tracker-app.js:3730](../tracker-app.js#L3730)) requires `cSz >= 13` to enter
Tier 3, and Tier 3 is where symbols are drawn. The clamp caps `scs` at 11 for a
300 × 400 pattern, so Tier 3 is **unreachable at any zoom level**. The user is
locked into flat colour blocks on exactly the patterns where symbol
identification matters most.

### 1.2 The budget is per canvas; six canvases mount

The budget in [useCanvasOverlays.js:70–79](../useCanvasOverlays.js#L70-L79) is
computed once and applied to `scs`, which every canvas then uses. There is no
accounting for *how many* canvases exist. Six size themselves to the same
geometry:

| Canvas | Sizing site | Mount condition |
| --- | --- | --- |
| Chart | [tracker-app.js:4033](../tracker-app.js#L4033) | always |
| Thread usage | [4132](../tracker-app.js#L4132) | `threadUsageMode` |
| Recommendations | [4188](../tracker-app.js#L4188) | recommendations on |
| Focus block | [4245](../tracker-app.js#L4245) | `focusEnabled && focusBlock` |
| Breadcrumbs | [4294](../tracker-app.js#L4294) | `breadcrumbVisible` |
| Counting aids | [4325](../tracker-app.js#L4325) | highlight + focus colour |

All five overlays are absolutely positioned on the same origin
([tracker-app.js:6127–6135](../tracker-app.js#L6127-L6135)).

A user in highlight mode with counting aids and focus blocks on — an entirely
ordinary configuration, and the one the app nudges people toward — mounts four
canvases. On a 400 × 500 pattern that is **4 × 63 MB = 252 MB of canvas backing
store**, against a per-canvas budget that thought it was spending 63 MB.

iOS Safari begins discarding canvas backing stores under total-canvas-memory
pressure well before the tab is killed. A discarded-and-repainted backing store
on every frame is precisely what "the app freezes" feels like.

**This is the single highest-value defect in the report.** The budget needs to
be divided by the number of *mountable* canvases, not spent six times over.

### 1.3 The `pointer: coarse` gate has a hole

[useCanvasOverlays.js:70–77](../useCanvasOverlays.js#L70-L77):

```js
var mem = navigator.deviceMemory || 0;
var coarse = window.matchMedia('(pointer: coarse)').matches;
if (mem && mem <= 1)      area = 16777216;
else if (mem && mem <= 4) area = 33554432;
else if (!mem && coarse)  area = 16777216;   // ← the iOS arm
else                      area = 134217728;  // ← desktop
```

Safari reports no `navigator.deviceMemory`, so iOS depends entirely on
`coarse`. **iPadOS 13.4+ reports `pointer: fine` when a trackpad or mouse is
attached** — a Magic Keyboard, a Smart Keyboard Folio with trackpad, or any
Bluetooth mouse. Such an iPad falls through to the **desktop** arm.

Computed consequence:

| Pattern | Budget applied | max `scs` | Canvas | Memory **per canvas** |
| --- | --- | ---: | ---: | ---: |
| 200 × 250 | desktop 134 Mpx | 51 | 130.7 Mpx | **499 MB** |
| 300 × 400 | desktop 134 Mpx | 33 | 131.4 Mpx | **501 MB** |
| 400 × 500 | desktop 134 Mpx | 25 | 125.7 Mpx | **479 MB** |

A single half-gigabyte canvas on an iPad is an immediate hard freeze or tab
kill. **If the reported device has a keyboard case, this alone is the bug.**

The fix is one line and the helper already exists: this branch added
`Platform.isIOS()` ([helpers.js:264](../helpers.js#L264)), which disambiguates
iPadOS-reporting-as-desktop via `maxTouchPoints` and is correct regardless of
attached pointers. `useCanvasOverlays.js` predates it and never adopted it.

### 1.4 Secondary costs (real, but not the freeze)

Worth fixing, but none of these alone produces a hard freeze:

- **Panning is still entirely main-thread.** The chart canvas is
  `touchAction: "none"` ([tracker-app.js:6100](../tracker-app.js#L6100)), so the
  compositor never scrolls the area — every pan frame is JS writing
  `scrollLeft`/`scrollTop`. Audit item 12 was listed as covered in §H, but what
  actually shipped was the scroll-repaint skip; `touch-action` was not changed.
- **A 1 Hz full re-render.** `setLiveAutoElapsed` fires every second while a
  session is active ([useAutoSession.js:269–281](../useAutoSession.js#L269-L281)).
  `TrackerApp` is one component with **130 `useState`, 80 `useEffect` and zero
  `React.memo`**, so the entire tree — palette rail, legend, toolbar —
  reconciles once per second. It does *not* trigger a repaint (`renderStitch`'s
  deps exclude it), so this is reconciliation cost only.
- **Autosave re-serialises the whole pattern.** Every 5 s of activity,
  `buildSnapshot` runs `serializePattern(pat)`
  ([tracker-app.js:3535](../tracker-app.js#L3535), 5 s debounce at
  [3594](../tracker-app.js#L3594), `done` in the dep array at
  [3596](../tracker-app.js#L3596)), allocating a fresh object per cell — 200 000
  objects for a 400 × 500 pattern — then structured-clones the lot into
  IndexedDB. The per-cell work is O(1) (`findThreadInCatalog` is a memoised map
  lookup, [helpers.js:1624](../helpers.js#L1624)), so this is an allocation and
  clone cost, not an algorithmic one — but it is a recurring multi-megabyte
  main-thread spike during stitching.
- **The pattern itself is 200 000 JS objects.** `pat` is an array of
  `{id, type, rgb: [r,g,b]}`. At roughly 100–130 bytes per cell that is
  20–26 MB resident for a 400 × 500 pattern, transiently doubled during save.

---

## Part 2 — How comparable apps solve this

The core problem — an arbitrarily large grid on a device with a hard surface
budget — is not specific to cross stitch. It is the same problem as a map, a
spreadsheet, or a design canvas, and the solutions are well established.

### The standard technique: viewport-sized surface, not content-sized

**Nothing outside this codebase allocates a surface proportional to the
document.** Google Maps, Figma, Photopea, Excalidraw, deck.gl, and every
virtualised grid (AG Grid, react-window) all allocate a surface proportional to
the *viewport* and redraw as the user moves. A 10 000 × 10 000 map is not a
10 000 × 10 000 canvas; it is a screen-sized canvas plus a transform.

This is exactly what audit item 11 proposed and it remains the right answer.

### What the stitch-tracking apps appear to do

I can observe behaviour but not source, so this is **inferred**:

- **Pattern Keeper** (native iOS/Android) handles 500 × 700+ charts with
  smooth pan and no zoom ceiling, and renders symbols at close zoom on charts
  far larger than 300 × 400. A content-sized surface at that size would be
  hundreds of megabytes, so it is near-certainly tiled or drawn per-frame from
  the viewport. It also degrades detail with zoom — solid blocks far out,
  symbols close in — which is the same tier idea this codebase already has.
- **Markup for Cross Stitch / MRXP** similarly shows no size-dependent zoom
  limit, which a content-sized surface cannot achieve.
- **Stitch Fiddle** (web) keeps large charts responsive in-browser; a web app
  cannot do that with a content-sized canvas under Safari's 16.78 Mpx cap, so
  it is drawing a viewport tile.

The useful conclusion is not what any one competitor does internally, but that
**no app in this category exposes a zoom ceiling that scales down with pattern
size** — which is the visible symptom of the current mitigation. Users
comparing stitchx against Pattern Keeper on a 400 × 500 chart will see stitchx
refuse to zoom past 45 % and never show a symbol.

### Techniques, and which are relevant here

| Technique | Used by | Fit for stitchx |
| --- | --- | --- |
| Viewport-sized canvas + translate | Excalidraw, tldraw, most 2D editors | **Best fit.** Draw call already takes a `viewportRect` |
| Fixed tile grid + LRU cache of rendered tiles | Google Maps, Photopea | Good fit; more machinery, better pan smoothness |
| Static/dynamic layer split | Most canvas editors | Cheap, composes with either of the above |
| `OffscreenCanvas` + worker rasterisation | Figma, Photopea | Available in Safari 16.4+; good phase 2 |
| WebGL / instanced quads | Figma, deck.gl | Highest ceiling, largest rewrite. Not warranted yet |
| Detail tiers by zoom | Maps (LOD), Pattern Keeper (inferred) | **Already implemented** — `computeDetailTier` |
| Viewport culling of draw work | Every virtualised list | **Already implemented** — `drawStitch` bounds |
| Native scroll / compositor panning | Everything | Regressed here by `touch-action: none` |

The important observation: **stitchx already has the two hardest pieces** —
per-tier level-of-detail and viewport-bounded drawing. `drawStitch` already
accepts a `viewportRect` and only paints inside it
([tracker-app.js:3841–3846](../tracker-app.js#L3841-L3846)). The only thing
still content-sized is the *canvas element itself*. That makes the real fix far
smaller than it would be from a standing start.

---

## Part 3 — Ranked solutions

Ranked by **user-visible improvement per unit of risk**, which is why the
two-line fixes lead even though item R4 is the architecturally correct answer.

| Rank | Solution | Effort | Risk | Fixes |
| --- | --- | --- | --- | --- |
| **R1** | Divide the canvas budget by the number of mountable overlays | ~1 h | Very low | §1.2 — the freeze |
| **R2** | Gate the iOS budget on `Platform.isIOS()`, not `pointer: coarse` | ~15 min | Very low | §1.3 — the 500 MB iPad |
| **R3** | Give the chart canvas a memory-pressure escape hatch | ~2 h | Low | Residual OOM |
| **R4** | **Viewport-sized chart canvas** (audit item 11) | 3–5 d | High | §1.1–1.3 properly; removes the zoom ceiling |
| **R5** | Static/dynamic layer split | 1–2 d | Medium | Pan and mark latency |
| **R6** | Restore compositor panning (`touch-action`) | ~4 h | Medium | Pan jank |
| **R7** | Incremental autosave (write `done` deltas, not whole snapshots) | 1–2 d | Medium | 5 s stitching hitch |
| **R8** | Collapse the five overlays into one | 1–2 d | Medium | 5× overlay memory |
| **R9** | Split `TrackerApp`; `React.memo` the rail and legend | 3–5 d | Medium | 1 Hz reconcile |
| **R10** | Typed-array (SoA) pattern representation | 3–5 d | High | 20–26 MB resident, GC pressure |
| **R11** | `OffscreenCanvas` + worker rasterisation | 1–2 w | High | Main-thread paint entirely |
| **R12** | WebGL renderer | 3–4 w | Very high | Everything, at great cost |

### R1 — Divide the budget by mountable canvases · **do first**

The budget is spent once and charged six times. Count the canvases that *can*
mount and divide:

```js
// useCanvasOverlays.js, inside canvasLimits()
// The chart plus every overlay in tracker-app.js sizes to the same geometry.
// Budget the total, not each one, or four active overlays spend 4x the cap.
var MAX_CONCURRENT_CHART_CANVASES = 4;   // chart + 3 typical overlays
area = Math.floor(area / MAX_CONCURRENT_CHART_CANVASES);
```

Honest trade-off: this halves-or-quarters the zoom ceiling, making §1.1 worse
before R4 makes it better. If that is unacceptable as a standalone change, pair
it with a dynamic count — recompute `maxZoom` from the number of *currently
mounted* overlays, so a user with everything off keeps today's ceiling and a
user with three overlays on gets a safe one. That is the better version and
still under a day.

### R2 — Use `Platform.isIOS()` · **do first, trivially**

```js
var coarse = false;
try {
  // Platform.isIOS() disambiguates iPadOS-as-desktop via maxTouchPoints, so it
  // stays correct when a trackpad flips the primary pointer to `fine`.
  coarse = (window.Platform && window.Platform.isIOS())
           || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
} catch (_) {}
```

Guard the `window.Platform` access — `useCanvasOverlays.js` must not hard-depend
on `helpers.js` load order.

**Verification that matters:** the existing
`tests/chartCanvasSizeCap.test.js` stubs `deviceMemory` away *and* sets coarse.
Add a case with `deviceMemory` absent and `pointer: fine` and a touch-capable
`maxTouchPoints: 5` — that case currently returns the desktop budget and should
fail before the fix.

### R3 — Memory-pressure escape hatch

Even correctly budgeted, the failure is silent. Two cheap guards:

- After sizing the chart canvas, read back one pixel. A zero-alpha read where
  an opaque fill was written means the backing store was discarded — drop `scs`
  a step and repaint, and surface a Toast rather than showing a blank chart.
- Listen for `document.visibilitychange` and release overlay backing stores
  (`canvas.width = 0`) when hidden, restoring on return. Safari reclaims
  aggressively on background anyway; doing it deliberately avoids the
  discard-storm on return.

### R4 — Viewport-sized chart canvas · **the actual fix**

Size the canvas to the viewport plus an overscan margin, translate its origin to
the scroll offset, and redraw on scroll. Concretely:

1. `canvas.width = min(needW, clientWidth + 2 * overscan)`, likewise height,
   hard-capped at 4096/side.
2. Position it `absolute` inside the existing scroller at the current scroll
   offset; the scroller keeps a sized spacer div so scrollbars stay honest.
3. `ctx.translate(-originX, -originY)` before drawing, then call `drawStitch`
   **unchanged** — it already culls to `viewportRect`.
4. Redraw on scroll, rAF-throttled. The existing `paintedRectRef` logic
   ([tracker-app.js:4073–4081](../tracker-app.js#L4073-L4081)) already decides
   when a repaint is needed and can be reused as-is.

What this buys, all at once:

- **Memory becomes O(viewport), not O(pattern).** A 1024 × 1366 iPad viewport
  with 200 px overscan is ~2.7 Mpx / 11 MB, *regardless of pattern size*. Six
  overlays then cost 66 MB total, less than one canvas costs today.
- **The zoom ceiling disappears.** `maxCellSize` becomes unnecessary; a
  600 × 800 pattern zooms to 400 % like a 60 × 60 one, and symbols come back at
  every size (fixes §1.1).
- **It unblocks DPR-correct rendering** (audit item A5/15). At 11 MB per canvas
  there is headroom to render at DPR 2 and stop shipping a soft, upscaled chart
  on every phone and iPad.

Risks, stated plainly: this touches the interaction maths. Hit-testing,
pinch-zoom, the drag-mark path in [useDragMark.js](../useDragMark.js),
`drawCellDirectly` ([tracker-app.js:4549](../tracker-app.js#L4549)) and
`savedScroll` restore all convert between client and chart coordinates and all
need the origin offset applied. That is the bulk of the 3–5 days, and it is why
`drawCellDirectly` should be converted **first, on its own**, as a behaviour-
preserving refactor with the existing full-size canvas still in place.

### R5 — Static/dynamic layer split

Independent of R4 and composes with it. Today any change to `done` can repaint
the whole visible slice. Split into a **base** layer (pattern, grid, symbols —
changes only on view mode, zoom or palette edits) and a **progress** layer
(done fills, focus, crosshair — changes constantly). Marking a stitch then
touches only the small layer.

`drawCellDirectly` already gets most of this benefit for single marks. The split
pays off for bulk operations — `markColourDone`
([tracker-app.js:1970](../tracker-app.js#L1970)) walks the entire pattern and
issues a direct draw per changed cell, which for a common colour on a large
pattern is thousands of draws in one synchronous burst.

### R6 — Restore compositor panning

Set `touch-action: pan-x pan-y` at rest and switch to `none` only once the
handler has classified the gesture as a mark. In Nav mode, never set `none`.
The audit's §H measurement caveat stands — the true cost of main-thread panning
on a real device is still unmeasured — so **measure before and after**, and do
this after R4, since a viewport-sized canvas changes the calculus completely.

### R7 — Incremental autosave

Two options, increasing in ambition:

- **Cheap:** skip `serializePattern` when `pat` is referentially unchanged since
  the last save (the common case while stitching — only `done` changes). Cache
  the serialised pattern against the `pat` reference. This removes the 200 000
  allocations from the steady-state stitching path for a few lines of code and
  is the best effort-to-payoff ratio in this section.
- **Proper:** write `done` to its own IndexedDB record as a `Uint8Array` and
  persist deltas, reuniting them on load. `done` is already a `Uint8Array`
  ([tracker-app.js:1970](../tracker-app.js#L1970)), and IndexedDB stores typed
  arrays natively without a per-element clone, so this is both smaller and
  faster. It interacts with sync — `exportSync`/`prepareImport` merge `done`
  arrays — so it needs care there.

### R8–R12 — later

**R8** (one overlay canvas, drawn in z-order) removes 5× overlay memory but is
largely subsumed by R4; do it only if R4 is deferred. **R9** is real but yields
reconciliation time, not paint time — worth doing when the component is next
touched, not as a freeze fix. **R10** (typed-array SoA `pat`: `Uint16Array` of
palette indices plus a palette lookup, replacing 200 000 objects with ~400 KB)
is a large win on memory and GC but touches every consumer of `pat` across the
creator, tracker and sync engine. **R11** and **R12** are the right long-term
architecture but are not justified until R4 has shipped and been measured.

---

## Part 4 — Recommended sequence

**Immediately (half a day, very low risk).** R2, then R1 with the dynamic
overlay count, then the cheap half of R7. This addresses both critical causes
and removes the recurring stitching hitch. Expect the freeze to stop; expect the
zoom ceiling of §1.1 to remain or tighten.

**Next (3–5 days).** R4. This is the fix. It removes the zoom ceiling, restores
symbols at every pattern size, drops memory to O(viewport), and unblocks
DPR-correct rendering. Sequence it as: convert coordinate conversion sites
first → viewport-size the chart canvas → viewport-size the overlays → delete
`maxCellSize` and the zoom clamp.

**Then, measured rather than assumed.** R6 and R5, each with a before/after on
the harness. R3 as a permanent guard.

**Deliberately deferred.** R9–R12.

---

## Part 5 — What to measure, and the harness gap

The audit's §H warning applies here and should be respected: blocking time on
the Playwright harness varies **4–5× between identical runs**, so wall-clock
before/after claims below ~5× are not meaningful. Assert on **counted work**,
which is deterministic.

Guards worth adding:

- **Total canvas bytes, not per-canvas.** Sum `width * height * 4` across every
  mounted canvas after loading a 400 × 500 fixture with highlight, counting aids
  and focus blocks enabled, and assert it stays under a budget. The existing
  `chartCanvasSizeCap.test.js` checks canvases one at a time and therefore
  cannot catch §1.2.
- **The `pointer: fine` iPad.** A WebKit context with `deviceMemory` absent,
  `pointer: fine`, and `maxTouchPoints: 5`. Should fail today.
- **Symbol reachability.** For a 400 × 500 fixture, assert that some zoom level
  reaches Tier 3. Fails today; passes after R4. This is the regression guard
  that stops a future memory fix from silently making the chart unusable again.
- **Allocation count on autosave.** Assert `serializePattern` is not called when
  only `done` changed.

**The harness gap worth closing first:** there is no fixture larger than
200 × 250 anywhere in `tests/`. Every measurement in the existing audit stops
below the size at which symbols become unreachable, which is why §1.1 was never
caught. Adding a 400 × 500 and a 600 × 800 fixture is a prerequisite for
trusting any of the above.

---

## Part 6 — Implementation record

Branch `perf/viewport-chart-canvas`. **R1, R2, R3 and R4 are implemented**;
R5–R12 are untouched. The fixture gap in Part 5 is closed.

### What changed

| Item | Change | Files |
| --- | --- | --- |
| — | Shared large-pattern fixture builder, up to 600 × 800 | [tests/_helpers/trackerFixture.js](../tests/_helpers/trackerFixture.js) |
| R2 | iOS budget keyed on `Platform.isIOS()`, media query kept as fallback | [useCanvasOverlays.js](../useCanvasOverlays.js) |
| R1 | Budget divided by the number of concurrent chart canvases | [useCanvasOverlays.js](../useCanvasOverlays.js) |
| R3 | Backing-store liveness probe; tile halves and repaints on failure | [tracker-app.js](../tracker-app.js) |
| R4 | Viewport-tiled chart **and all five overlays** | [tracker-app.js](../tracker-app.js), [helpers.js](../helpers.js) |

**On the tiling.** `chartTileFor()` returns the slice that should be showing;
`applyChartTile()` resizes the canvas, moves the element, and calls
`ctx.setTransform` so every existing draw call keeps addressing cells in
absolute chart coordinates. `drawStitch` is unchanged apart from honouring an
explicit overdraw of 0 — the tile already contains the margin, so growing past
it would only paint cells that get clipped.

The five overlays register a redraw function in one registry; `renderStitch`
invokes them when the tile moves. Two of them gained viewport culling as a
consequence: the thread-usage overlay walked all 200 000 cells on every redraw,
which was affordable when redraws were rare and would not have been once the
tile started moving.

`gridCoord()` (helpers.js) takes an optional `origin`. It defaults to `{0,0}`,
so every creator call site — those canvases are still whole-surface — is
untouched.

**On `maxCellSize`.** With a tile, the surface saturates at
`viewport + 2 × overscan` regardless of cell size, so if that constant fits the
budget then *every* cell size does and there is no ceiling to impose. The
pattern-proportional clamp survives as the fallback for when there is no window
to measure. This is what restores symbols: the clamp is what held a 400 × 500
chart at scs 9.

### Verified

**Jest: 208 suites / 2 756 tests green** (206 / 2 733 before; +18 from
[tests/chartCanvasBudget.test.js](../tests/chartCanvasBudget.test.js)). All 10
of that suite's target assertions were confirmed to **fail against the pre-fix
module** before the fix was written.

**Real WebKit at an iPad viewport** — [tests/ipad/ipad-chart.spec.js](../tests/ipad/ipad-chart.spec.js),
6 checks green. This is the first chart measurement in the repo on the engine
the bug was reported against; every other harness runs Chromium, which has a
268 Mpx budget and reports `deviceMemory`, i.e. neither of the conditions that
produced the failure.

| Pattern | Total canvas, all mounted | Scroll extent | Zoom ceiling |
| --- | ---: | ---: | ---: |
| 200 × 250 | 3.32 Mpx / 13.3 MB | 4030 | scs 80 |
| 400 × 500 | **3.32 Mpx / 13.3 MB** | 8030 | scs 80 |
| 600 × 800 | **3.32 Mpx / 13.3 MB** | 12030 | scs 80 |

The figure is *identical* at every size — that is the O(viewport) property, and
it is the whole claim. The scroll extent still spans the full pattern, so the
chart itself is unchanged; only its backing store is bounded. The zoom ceiling
is scs 80 (400 %) at every size, against 18 / 9 / 5 before.

Also confirmed on WebKit: an iPad reporting `pointer: fine` (trackpad attached)
now takes the 16.7 Mpx iOS budget rather than the 134 Mpx desktop one, and the
chart paints rather than coming up blank.

**Mobile audit: 48 of 49 green.** Before/after on the same harness, same
conditions, `main` vs branch:

| Scenario | Metric | main | branch |
| --- | --- | ---: | ---: |
| tracker + 100 × 100 | total canvas | 8.28 Mpx | **2.34 Mpx** |
| tracker + 100 × 100 | post-load idle blocking | 4 448 ms | **26 ms** |
| tracker + 200 × 250 | total canvas | 40.58 Mpx | **2.34 Mpx** |
| tracker + 200 × 250 | open blocking | 19 837 ms | **10 762 ms** |
| tracker + 200 × 250 | post-load idle blocking | 48 843 ms | **764 ms** |

Per §H's warning, the blocking figures are single samples on a harness with
4–5× run-to-run variance and should be read as direction, not magnitude. The
canvas figures are deterministic.

**The coordinate round trip is verified by mutation, not by inspection.**
`chart-canvas-budget.spec.js` scrolls a 400 × 500 chart 1500 × 1800 px, taps a
point, and compares the cell the app *saved to IndexedDB* against a cell index
computed independently from the scroller's own offsets. It marked exactly one
cell, 42484 = row 106 × 400 + col 84, matching the oracle. Removing the tile
origin from `_dragMarkCellAtPoint` makes it mark 12424 instead — off by exactly
the tile offset — so the test demonstrably bites.

That check was arrived at the hard way: two earlier versions of it passed
against deliberately broken code. The first sampled pixels under the tap, which
change on any repaint; the second mutated `handleStitchMouseDown`, which is not
the path a touch device takes (marking goes through `useDragMark` →
`_dragMarkCellAtPoint`). Both are recorded here because "the test passed" was
not evidence in either case.

### Pre-existing failures, confirmed unchanged

- The four `touch-tablet-chromium` specs fail identically on `main`. In
  particular `tracker-touch.spec.js` — the one inside this change's blast
  radius — fails at the same line with the same
  `locator('input[type="file"]')` timeout on both trees, checked by running it
  on each.
- `mobile-audit.spec.js`'s 100 × 100 tracker-open tripwire (`totalBlockingMs <
  8000`) fails on both: **10 978 ms on `main`, 9 136 ms on this branch**. The
  branch improves it and still exceeds the budget. It is the time-based
  tripwire §H already flagged as flaking one run in two; left alone rather than
  widened, since widening it here would disguise the fact that it was already
  failing.
- CSS-token lint unchanged at its pre-existing warnings; terminology lint clean.

### Tests updated rather than added

Five existing assertions pinned "the canvas is pattern-sized", which is exactly
what this change makes false. Each was moved to the invariant that still holds —
the chart's **scroll extent**, `G + sW*scs + 2` — rather than deleted:

- `desktop-regression.spec.js` × 3 (400 % zoom reachable, large pattern
  unclamped, zoom-in behaviour);
- `verify-fixes.spec.js` × 2 (iOS clamp, zoom-out still shrinks the chart).

`verify-fixes.spec.js`'s iOS check also moved from the largest canvas to the
**sum** across all of them, which is the figure §1.2 showed was never checked.

---

## Part 7 — Second pass: panning, autosave, and two bugs from Part 6

Same branch. **R6, R7 (cheap half) and the second half of R3** are implemented.
R5, R8–R12 remain untouched. DPR-correct rendering was assessed and
deliberately **not** done — see the end of this section.

### First: what panning actually costs now

§H retracted the original pan figure, so R6 was implemented against a fresh
measurement rather than the report's assumption. Eight pan gestures at 4× CPU
throttle, `main` vs this branch **before** any R6 work:

| Chart | Metric | main | after R4 |
| --- | --- | ---: | ---: |
| 100 × 100 | total blocking | 332 ms | 199 ms |
| 200 × 250 | total blocking | **13 929 ms** | **532 ms** |
| 200 × 250 | canvas paints | 7 741 | 5 998 |

R4 had already removed 96 % of the cost of panning a large chart, which nothing
had measured. That reframed R6 from "the fix for pan jank" to "a smoothness
improvement on an already-cheap path", and it is why R6 below is scoped
narrowly rather than applied everywhere.

### Two bugs in the Part 6 work, found by that measurement

Cleared pixels had gone **up** (27.8 → 45.7 Mpx on 200 × 250) rather than down.
Chasing that found two defects:

1. **`applyChartTile` promised a blank surface it had not delivered.** It
   reported `invalidated` for a tile that had *moved*, and the recommendation
   pulse uses that flag to skip its incremental clear. But assigning
   `canvas.width` blanks a canvas — *moving* it does not. The old pixels stayed,
   painted for the old origin, and the pulse drew on top of them. It now
   actually clears on a move, so the flag means what its callers assume.
2. **Overlays were chasing the scroll position at 60 fps.**
   `prepareOverlayTile` recomputed the tile from the live scroll offset, and
   the recommendation pulse calls it every animation frame — so during a pan
   every overlay moved and re-blanked on every frame. Overlays now follow
   `chartTileRef`, the tile the *chart* is on, which is also the correct
   coupling: they must show the same slice the chart does.

A third, smaller thing: the chart canvas opts out of the clear-on-move, because
`drawStitch` begins by filling the entire chart rect and so repaints the tile
unconditionally.

After those: 200 × 250 pan blocking **163 ms** on the run that produced the
other figures here. Repeated runs range 163–932 ms, consistent with §H's 4–5×
variance — the honest reading is "an order of magnitude better than `main`, not
a precise number".

### R6 — who owns a one-finger drag

The report proposed `touch-action: pan-x pan-y` at rest, switching to `none`
once a gesture is classified as a mark. That does not work: `touch-action` is
consulted when a gesture *starts*, so a mid-gesture switch is too late. The
workable version is the report's own alternative — gate on mode:

| Mode | `touch-action` | Why |
| --- | --- | --- |
| Track (marking) | `none` | A one-finger drag **is** drag-marking. Handing it to the compositor would break the app's primary interaction. |
| Nav / edit | `pan-x pan-y` | A one-finger drag is only ever a pan, and the compositor does it better. |

`preventDefault` also became conditional — calling it unconditionally on
`touchstart` is what forced every pan onto the main thread, since it cancels
the native scroll before it starts. It is still called for two-finger gestures,
which are always the chart's (pinch-zooms the chart, not the page), and that is
what stops the browser panning a two-finger drag.

Measured, [tests/mobile-audit/pan-ownership.spec.js](../tests/mobile-audit/pan-ownership.spec.js):

| Mode | `touch-action` | Scrolled? | JS scroll writes |
| --- | --- | --- | ---: |
| Nav | `pan-x pan-y` | yes | **0** |
| Track | `none` | yes | 10 |

Both assertions are kept, as a pair. A change that made everything native
would pass the first and fail the second; the pre-R6 code does the reverse.
Counting *JS scroll writes* is what distinguishes them — a compositor scroll
never goes through the `scrollLeft` setter.

**A behaviour change this creates, checked rather than assumed.** Dropping the
unconditional `preventDefault` means the browser now synthesises mouse events
from a nav-mode tap where it previously did not, which could plausibly place
the guide crosshair twice or in the wrong cell. `hlRow`/`hlCol` are part of the
saved project, so the test taps and compares the app's own saved record against
an independently computed cell: it lands on exactly one cell, the right one.

### R7 (cheap half) — autosave stops re-serialising the pattern

`serializePattern` is now memoised on the pattern array's identity
([helpers.js](../helpers.js)). `pat` is replaced wholesale on any pattern edit
and is never mutated in place — verified, there are no `pat[i] = …`
assignments — so identity is a sound cache key.

The consequence, measured in the browser rather than reasoned about
([autosave-cost.spec.js](../tests/mobile-audit/autosave-cost.spec.js)): a
stitching session that triggers 2 autosaves produces **1** distinct serialised
array. Disabling the cache makes it 2, so the test bites. On a 400 × 500
pattern each avoided save is 200 000 object allocations.

One consequence worth knowing and commented at the call site: callers now share
one array rather than each getting a fresh one, so the result must be treated
as read-only. Every current caller hands it straight to a structured clone or a
JSON serialiser; nothing mutates `project.pattern`, which was checked.

### R3 (second half) — release backing stores when hidden

Overlay canvases are zeroed on `visibilitychange` to hidden and repainted on
return. Safari reclaims canvas memory aggressively and picks *for* us what to
discard; doing it deliberately makes the return path a clean repaint. The chart
itself is deliberately left alone — it is the one canvas the user is guaranteed
to be looking at on return, and blanking it risks a visible flash.

### Verified

- **Jest 208 suites / 2 760 tests green** (2 756 before; +4 from the new
  `serializePattern` memoisation cases).
- **Mobile audit 54 checks green**, both projects, including the three new
  pan-ownership checks and the autosave one.
- **iPad WebKit 16 checks green**, unchanged.
- The four `touch-tablet-chromium` failures are the same pre-existing ones,
  already confirmed identical on `main` in Part 6.
- Terminology lint clean; CSS-token lint unchanged.

### DPR-correct rendering — assessed, not done

Part 6 listed this as unblocked. Working through the arithmetic, it is not, at
the current budget:

- The chart tile on the iPad harness is 1371 × 1193 CSS px. At
  `devicePixelRatio` 2 that is **6.5 Mpx**, against a per-canvas budget of
  16.7 / 4 = **4.2 Mpx**.
- `maxTileArea()` would therefore reject the tile and fall back to the
  pattern-proportional clamp — reinstating exactly the zoom ceiling Part 6
  removed. A naive DPR change makes large patterns unusable again.

It can be made to fit — shrink the overscan from 300 px to ~100 px, or apply
DPR only to the chart and leave the overlays at 1× — but both are trade-offs
against pan repaint frequency, and the 16.7 Mpx figure is itself conservative
(it is iOS Safari's documented *per-canvas* area limit, being used here as a
whole-page budget). Choosing between those needs its own measured pass, so it
is left open rather than guessed at inside this one.

### Still open

- **R5** (static/dynamic layer split), **R8**–**R12** unchanged. R8 remains
  largely subsumed by R4.
- **DPR-correct rendering**, per above — now with a concrete reason and a
  concrete decision to make, rather than "unblocked".
- **Track-mode panning is still main-thread**, deliberately and by necessity.
  Cheap now that a pan no longer repaints, but it is the one place the
  compositor still cannot help.
- **Untested on hardware.** Verified on real WebKit at an iPad viewport, which
  is the right engine but not a real device.

## Reproducing the computed figures

The zoom-ceiling and tier tables in §1.1 and §1.3 come from executing
`maxCellSize` ([useCanvasOverlays.js:86](../useCanvasOverlays.js#L86)) and
`computeDetailTier` ([tracker-app.js:3730](../tracker-app.js#L3730)) directly
over the size list, with `side = 16384` and the iOS and desktop area budgets
from [useCanvasOverlays.js:74–77](../useCanvasOverlays.js#L74-L77).
