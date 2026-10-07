# Track view performance — plan of action

**Date:** 2026-10-07 · **Branch:** `perf/track-phase0`
**Status:** Phase 0 emulated measurements done (see
[Phase 0 results](#phase-0-results)); real-device pass outstanding.
**Scope:** the remaining performance work in the tracker (`stitch.html`), and
where a work-area mode fits into it. Builds on
[mobile-freeze-large-patterns.md](mobile-freeze-large-patterns.md), which records
Parts 1–10 of the earlier work. Item numbers R1–R12 refer to that report.

Prototype for the work-area mode: [work-area-prototype.html](work-area-prototype.html)
(open it directly in a browser; it is self-contained).

---

## Where things stand

The expensive structural problem is solved. The chart and its overlays are
viewport-sized tiles (R4), drawing is bounded to the tile, panning inside the
painted margin repaints nothing, a single tap paints one cell
(`drawCellDirectly`), bulk marks skip off-tile cells (§9.3), the 1 Hz idle
re-render no longer rebuilds the rulers (§9.2), autosave stops re-serialising an
unchanged pattern (R7 cheap half), and secondary modules are lazy-loaded
(Part 10).

So **drawing is no longer proportional to pattern size**. What still is:

| Cost | Scales with | Status |
| --- | --- | --- |
| Per-tap React reconcile of `TrackerApp` (~7 500 lines) | component size, not pattern | measured: ~550 elements, 48 ms tap-to-paint at 4× — **acceptable** |
| Marching-ants highlight: 10 full repaints + 10 reconciles per second | viewport | F1 **fixed**: was 11 920 elements/s and 48 980 fills/s idle, now 0 |
| Analysis worker re-post on every progress change | **pattern** | F2 **fixed**: was 352 ms per tap on 600×800, now 0.4 ms |
| Stats "sections" memo when the stats view opens | **pattern** | F3: **downgraded** — not per-tap, see below |
| Desktop hover: state update per cell crossed | component size | F4 **fixed**: was 1 176 elements per cell, now 0 |
| `pat` as one JS object per cell (R10) | **pattern** (memory + GC) | open |
| Autosave writes whole snapshot (R7 proper) | **pattern** | open — 564 ms save on the large fixture ([perf-results/interactions.json](perf-results/interactions.json)) |
| Static/dynamic layer split (R5 proper) | viewport | open, low priority since §9.3 |

Everything here has been verified in emulated engines only. No pass has run on a
physical phone or tablet (each report part says so). That's the biggest gap in
what we know.

---

## New findings from this pass

Found by reading the source; the measured numbers are in
[Phase 0 results](#phase-0-results).

### F1 — Marching ants re-render the whole tracker 10× a second

[tracker-app.js:4934](../tracker-app.js#L4934) drives the outline highlight with
`setInterval(() => setAntsOffset(...), 100)`. `antsOffset` is React state and is
in `renderStitch`'s dependency list
([tracker-app.js:4434](../tracker-app.js#L4434)), so every tick:

1. reconciles all of `TrackerApp`, and
2. repaints the full visible chart tile, not just the outline.

The code comment acknowledges this ("a meaningful share of a phone's frame
budget"); the mitigation was to stop it when hidden. While a stitcher is
actually using outline highlight — the mode meant for finding scattered
stitches on a big chart — it runs continuously.

**Fix:** move the ants to their own overlay canvas driven by
`requestAnimationFrame` and a ref, never React state. Cache the outline as a
`Path2D` per `(focusColour, tile, scs, done version)` and only re-stroke it with
a new `lineDashOffset` each frame. Remove `antsOffset` from `renderStitch`'s
deps. Expected: zero reconciles and zero chart repaints while idle in outline
mode.

### F2 — The analysis worker is re-fed the whole pattern on every tap

[tracker-app.js:2037–2059](../tracker-app.js#L2037-L2059) re-posts to the
analysis worker 500 ms after any `done` change. `done` is a cheap memcpy, but
`minPat` is an array of N `{id}` objects. `postMessage` structured-clones it
object by object on the main thread: 200 000 objects for the large fixture,
480 000 for huge. The cache avoids *rebuilding* the array but not *cloning*
it. A stitcher who taps every couple of seconds pays this on most pauses.

**Fix:** send the pattern once per `pat` change as a `Uint16Array` of palette
indices (transferable, ~400 KB for huge) plus a small palette table, and keep it
in the worker. On progress changes send only `done`, or, later, only the
changed indices.

### F3 — Stats "sections" scans the whole pattern (downgraded)

[tracker-app.js:1584](../tracker-app.js#L1584) rebuilds every section's
total/completed counts from `pat` and `done` whenever `done` changes, while the
stats view is open.

**Downgraded in Phase 0:** the stats view replaces the chart
(`!statsView&&pat&&pal` at [tracker-app.js:6343](../tracker-app.js#L6343)), so
nobody can tap while it is open. The scan runs once when the view opens, and
again only if `done` changes underneath it (a sync merge). That's one
O(pattern) pass on a navigation, not per tap. No spec, no Phase 1 work.
Fold it into the F2 worker later if the stats view ever feels slow to open.

### F4 — Desktop hover reconciles on every cell crossed

[tracker-app.js:4960](../tracker-app.js#L4960) calls `setHoverInfoCell` each time
the pointer enters a new cell, re-rendering `TrackerApp` to update the bottom
bar. Sweeping across a 600-wide chart is hundreds of reconciles. The crosshair
itself is already done with direct DOM writes, so the bottom bar can be too.
Desktop-only, so lower priority than F1 and F2.

---

## Plan

Ordered by information first, then return per unit of risk. Each phase is
shippable on its own.

### Phase 0 — Measure what's still unmeasured · **emulated part done**

Follows the existing harness conventions (counted work rather than wall time,
per §H of mobile-experience-audit.md; the `large` and `huge` fixtures from
[tests/_helpers/trackerFixture.js](../tests/_helpers/trackerFixture.js)). Shared
counters live in [tests/_helpers/perfProbes.js](../tests/_helpers/perfProbes.js).

| Spec | Project | Measures |
| --- | --- | --- |
| [tap-cost.spec.js](../tests/mobile-audit/tap-cost.spec.js) | `mobile-audit` (Pixel 5, 4× CPU) | Per tap: re-render size (immediate and after analysis returns), fills, analysis post main-thread time, blocking time, tap-to-paint. Plus a steady-rhythm run that overlaps taps with the posts |
| [desktop-highlight-idle-cost.spec.js](../tests/mobile-audit/desktop-highlight-idle-cost.spec.js) | `mobile-audit-desktop` | Elements and fills per second, idle, outline highlight vs the isolate control |
| [desktop-hover-cost.spec.js](../tests/mobile-audit/desktop-hover-cost.spec.js) | `mobile-audit-desktop` | Elements per stitch crossed by the pointer |
| [desktop-perf-hud.spec.js](../tests/mobile-audit/desktop-perf-hud.spec.js) | `mobile-audit-desktop` | The `?perf=1` readout is absent by default and its counters move when on |

The planned `stats-tap-cost` spec was dropped: see F3.

All four run with `npm run test:mobile-audit`. They assert that the
measurement is real (taps marked, React was wrapped, the highlight was on),
not budgets. Phase 1 adds the ceilings.

**Real-device pass — outstanding.** Open the tracker with `?perf=1` added to
the URL (e.g. `stitch.html?perf=1`), load the largest real pattern you have,
and run through: idle 10 s, steady tapping for 20 s, outline highlight idle
10 s. Press **Copy** after each and paste the JSON into this report. The
readout ([perf-hud.js](../perf-hud.js)) works on iOS Safari: blocking time
comes from animation-frame gaps rather than the Long Tasks API, which Safari
lacks.

### Phase 0 results

All emulated (Chromium, 4× CPU throttle for the phone runs). Wall times are
indicative; the counts are deterministic.

**Per tap** (8 taps, 1.5 s apart):

| | large 400×500 | huge 600×800 |
| --- | ---: | ---: |
| Re-render right after the tap (median elements) | 547 | 547 |
| Re-render when the analysis reply lands (median) | 612 | 612 |
| Chart fills per tap | 1 | 1 |
| Analysis post, main-thread ms (median / max) | 124 / 149 | **352 / 436** |
| Total blocking time, 8 taps | 675 ms | **3 150 ms** |
| Tap to next paint (median / max) | 48 / 64 ms | 48 / 72 ms |

**Steady tapping** (12 taps, one every 650 ms, so each tap lands just after the
previous tap's analysis post starts):

| | large | huge |
| --- | ---: | ---: |
| Tap to next paint (median / max) | 48 / 64 ms | **224 / 248 ms** |
| Taps over 200 ms | 0 of 12 | **11 of 12** |

**Idle with outline highlight** (5 s, nothing touched):

| | outline | isolate (control) |
| --- | ---: | ---: |
| React elements / s | **11 920** | 0 |
| Canvas fills / s | **48 980** | 0 |

**Hover** (30-stitch sweep, desktop): **1 176 elements per stitch crossed**,
35 287 in total. Each cell entered is a full `TrackerApp` re-render.

**What the numbers say**

1. **F2 is the lag stitchers feel on big patterns.** The tap itself is cheap
   and does not grow with the pattern (547 elements, 1 fill, 48 ms). But
   500 ms after each tap the main thread spends 124 ms (large) to 352 ms (huge)
   cloning the pattern into the analysis worker. Tap at a steady pace and
   most taps land inside that clone: on the huge pattern 11 of 12 taps took
   over 200 ms, the threshold browsers class as a poor response. It grows
   with pattern size, which matches "large patterns lag".
2. **F1 is the worst steady-state cost in the app.** Outline highlight
   turns an idle tracker into ~12 000 elements and ~49 000 fills a second,
   against zero for every other highlight style. On a phone that's battery
   and heat, and it competes with every tap for the main thread.
3. **F4 is real but desktop-only.** Roughly a tap's worth of re-render per
   stitch the mouse crosses.
4. **The per-tap reconcile does not justify Phase 2 yet.** 547 elements and a
   48 ms tap-to-paint at 4× throttle, flat across pattern sizes. Revisit only
   if the real-device pass disagrees (D4).

### Phase 1 — Quick wins (2–3 days total)

Reordered by the Phase 0 numbers. Each is small, local and independently
revertible.

1. **F2 analysis payload** — **done.** See [F2 result](#f2-result) below.
2. **F1 ants off React** — **done.** See [F1 result](#f1-result) below.
3. **F4 hover via direct DOM** — **done.** See [F4 result](#f4-result) below.

F3 is dropped from Phase 1.

**Verify:** re-run the Phase 0 specs and turn their measurements into
ceilings, the same way §9 pinned its fixes, so they can't regress silently.

#### F2 result

**What changed.** [analysis-worker.js](../analysis-worker.js) now holds the
pattern. The tracker sends it once per pattern (and per worker instance) as
`setPattern`: a `Uint16Array` of colour indices with its buffer transferred,
so nothing is cloned. A stitch mark posts only `done`. The worker caches
everything that depends on the pattern alone — clusters, neighbour counts,
nearest-same-colour distances, per-colour shape metrics, per-region colour
make-up — so a progress change is one pass over `done`. The per-stitch arrays
(`clusterSize`, `nearestDist`, ...) go back once per pattern, transferred,
and the tracker re-attaches them to every later result. `clusterSize` is now
an `Int32Array` rather than a plain array.

Output is unchanged. A one-off comparison of the old and new worker on
1 800 random cases (mixed DMC/blend/text ids, skip cells, ties, block sizes
5–20, both message paths) found no differences. That includes the
dominant-colour tie-break, which follows the old `Object.keys` order exactly.

**Measured** (same specs, Pixel 5 emulation, 4× CPU):

| | before | after |
| --- | ---: | ---: |
| Analysis post, main thread, huge (median / max) | 352 / 436 ms | **0.4 / 0.6 ms** |
| Analysis post, main thread, large (median / max) | 124 / 149 ms | **0.2 / 0.4 ms** |
| Steady tapping, huge: taps over 200 ms | 11 of 12 | **0 of 12** |
| Steady tapping, huge: tap to next paint (median) | 224 ms | **48 ms** |
| Total blocking, 8 taps, huge | 3 150 ms | 309 ms |
| Total blocking, 8 taps, large | 675 ms | 71 ms |

The remaining blocking is a single long task per run, which this change did
not produce. The likeliest source is the 5 s debounced autosave (R7 proper,
Phase 4); that's not yet confirmed.

**Guards.** [tap-cost.spec.js](../tests/mobile-audit/tap-cost.spec.js) now
fails if an analyse post carries the pattern, if the pattern is re-sent while
tapping, if the post exceeds 25 ms, or if more than 2 of 12 steady taps exceed
200 ms. The first and last were confirmed to fail against the pre-fix code.
[analysisWorkerProtocol.test.js](../tests/analysisWorkerProtocol.test.js)
holds the cached message path to a full `runAnalysis` and pins the
once-per-pattern contract.
[desktop-analysis-protocol.spec.js](../tests/mobile-audit/desktop-analysis-protocol.spec.js)
checks the tracker's side in the real app.

#### F1 result

**What changed.** The ants are no longer drawn into the chart canvas. They
are an SVG overlay (`svg.tracker-ants`) that follows the chart tile like the
other overlays. Its dash offset is animated by the browser through the Web
Animations API, stepped to 10 updates a second at the old speed of 1 px per
100 ms. `antsOffset` state, the 100 ms interval and the chart repaint it
forced are gone. The outline path is rebuilt only when the tile, zoom,
pattern or colour changes.

An SVG was chosen over the planned overlay canvas because a sixth overlay
canvas would raise `CONCURRENT_CHART_CANVASES` to 7. On an iPad that budget
is tight enough to drop the chart from 2× to 1.5× sharpness. SVG doesn't
count against Safari's canvas memory limit.

Two small visual differences, both deliberate:
- Straight boundaries are one merged segment, so the dashes flow along an
  edge instead of restarting at every stitch.
- The loop is seamless: the old offset jumped from 19 back to 0 every 2 s
  regardless of the dash length.

Under reduced motion the ants are drawn but not animated, as before. Taps no
longer briefly erase the ants on the tapped cell, because the ants are no
longer in the chart canvas.

**Measured** (desktop, 5 s idle, outline highlight):

| | before | after | isolate control |
| --- | ---: | ---: | ---: |
| React elements / s | 11 920 | **0** | 0 |
| Canvas fills / s | 48 980 | **0** | 0 |

**Guards.**
[desktop-highlight-idle-cost.spec.js](../tests/mobile-audit/desktop-highlight-idle-cost.spec.js)
fails if outline mode re-renders or repaints while idle. Because "costs
nothing" would also be true of ants that stopped drawing, it also checks that
the overlay is present, sits on the chart tile, and is animating, and that
reduced motion leaves it drawn but still.
[trackerOutlinePath.test.js](../tests/trackerOutlinePath.test.js) holds the
path to exactly the edges the old per-cell loop drew.
[chartCanvasSizeCap.test.js](../tests/chartCanvasSizeCap.test.js) now forbids
`antsOffset` and any interval driving the ants.

#### F4 result

**What changed.** The read-out under the chart ("Row: 14  Col: 33 — DMC 355
Terra Cotta Dk") was two pieces of React state, `hoverInfoCell` and
`hoverInfo`. Each stitch the pointer entered re-rendered all of
`TrackerApp` to change that one line. Both now live in refs, and
`renderHoverBar()` writes the line's text directly, the way the crosshair
above it already worked. The text is unchanged.

**Measured** (desktop, 30-stitch sweep): **35 287 → 7 elements**, i.e. from
1 176 per stitch to 0.

**Guard.** [desktop-hover-cost.spec.js](../tests/mobile-audit/desktop-hover-cost.spec.js)
fails if the sweep re-renders the tracker. It also checks the bar names the
row, column and thread under the pointer, and clears when the pointer leaves.

### After Phase 1: the autosave is now the biggest stall

With F2 fixed, one long task per run remained in `tap-cost` on the huge
fixture. Attributed by timing the storage calls (Pixel 5 emulation, 4× CPU,
600×800, 4 taps then idle). It is the tracker autosave, 5 s after the last
tap:

| Step | Main thread |
| --- | ---: |
| Build the save snapshot (`buildSnapshot`: pattern map, `Array.from(done)`, ...) | ~430 ms |
| `put` to `projects` under the project id (structured clone of the record) | ~350 ms |
| `put` to `projects` under the legacy `auto_save` key, the same record again | ~350 ms |
| **Total, one autosave** | **~1.3 s** |

A stitcher who pauses for five seconds and then taps again can land in that
window. Each `put` clones a record holding one object per stitch (`pattern`)
and one boxed number per stitch (`done` as a plain array).

**Options, cheapest first** (each needs a decision, since they touch storage
other pages read, or sync):

1. **Drop the duplicate `auto_save` write from the tracker autosave.** Halves
   the write cost. The key is still read as a fallback by the Creator's resume
   path ([creator/useProjectIO.js:656](../creator/useProjectIO.js#L656)) and
   the Stash Manager ([manager-app.js:386](../manager-app.js#L386)). Both prefer
   the active-project pointer first, so the fallback should only matter for
   data from before `ProjectStorage` existed. Needs confirming that nothing
   else depends on it being fresh.
2. **Store `done` as a `Uint8Array` in the record.** It clones as one memcpy
   instead of 480 000 boxed numbers. But every path that JSON-serialises a
   project (sync export, backups, downloads) would need converting, since
   `JSON.stringify` turns a typed array into an object.
3. **R7 proper:** `done` as its own record, written as deltas, so an autosave
   during stitching never touches the pattern. The real fix. Interacts with
   `exportSync` / `prepareImport` and needs the sync test plan.
4. **R10:** typed-array pattern. It removes the per-stitch objects
   everywhere, including from this clone, and is the largest change.

### Phase 2 — Per-tap reconcile (3–5 days, only if the device pass says so)

If `tap-cost` shows the `TrackerApp` reconcile is a large share of a tap, the
fix is to stop a `done` change from re-rendering the whole tree:

- Hold `done` in a small external store (`useSyncExternalStore`) instead of
  `useState`. The chart already paints taps imperatively. Only the
  components that display progress (header %, legend counts, block toast)
  subscribe, and they already key on `countsVer`.
- Split the legend/rail and the toolbar into `React.memo` children with stable
  props (the remainder of R9).

This is the riskiest item in the plan because `done` is read in many effects
(sync merge, undo history, autosave). Do it behind the Phase 0 numbers, not
ahead of them.

### Phase 3 — Work-area mode · **built on `feat/work-area`**

**Status (2026-10-07).** Built in four commits on `feat/work-area` (cut
from `perf/track-phase0`, which must merge first):

| Commit | What |
| --- | --- |
| Data model, persistence, sync | `work-area.js` (pure geometry and rules); `workArea` project field saved, exported, kept through Creator saves, validated on load; sync merge by the area's own `setAt` |
| Clipping | Scroller extent, rulers and tile cover only the area plus margin, via one coordinate offset; margin faded and unmarkable; area outlined; enter fits, exit re-centres |
| Picker and controls | `components/WorkAreaPicker.js` (section-grid overview; tap an area or drag sections); work area bar (progress, previous/next unfinished, margin, Change, Show whole pattern); Area button, `W`, Fit fits the area |
| Scoping | Colour list, counts, highlight cycling, jump, "mark all", recommendations and Spotlight all confined to the area; finishing offers the next area |

As decided: an area is a group of whole Spotlight sections, Spotlight steps
through the sections inside it, the default margin is 3, and the area is
saved and synced.

**Not built.** The prototype's always-visible mini overview map. The picker
already shows the whole pattern with progress, and the work area bar names
the range, so it was left as a follow-up rather than a fifth canvas.

**Tests.** [workArea.test.js](../tests/workArea.test.js) covers the module
and sync merge (24 cases).
[desktop-work-area.spec.js](../tests/mobile-audit/desktop-work-area.spec.js)
has 12 browser checks: clipping, marking, leaving, reload, the picker, the
bar, `W`/Fit, the colour list, "mark all", Spotlight and finishing.
[work-area-phone.spec.js](../tests/mobile-audit/work-area-phone.spec.js)
covers the phone sheet. Persistence and Creator round-trip field lists
include `workArea`.

The original plan text follows.


See the prototype. The performance case is honest but specific: hiding the
rest of the chart **doesn't make drawing faster**, because drawing is
already viewport-bound. It helps because it bounds the remaining
O(pattern) work to the area:

- legend counts and colour list scoped to colours present in the area,
- "mark colour done" scoped to the area (also a better UX on huge charts),
- highlight and counting aids searching only the area,
- analysis/recommendations run per area,
- panning clamped to the area, so the tile never needs to move far.

The main product case is focus: stitchers already work block by block, and
the app currently shows them 480 000 cells to do it.

**Decided (2026-10-07):** the prototype's design is approved; the work area
extends the Spotlight focus block rather than being a separate system; the
default margin is 3 stitches; and **the work area is saved with the project
and synced across devices**, like `focusBlock` today. Build the project-schema
and sync-engine changes (export, merge, and the sync tests) in from the
start rather than shipping a local-only version first.

The original design questions, kept for reference:

1. **Relationship to the spotlight focus block.** The focus block
   (`focusBlock`, `blockW`/`blockH`) is already a block-sized region with
   auto-advance and breadcrumbs, but it only dims. Recommendation: make the work
   area the same concept with a "clip" option, rather than adding a second,
   competing block system.
2. **Context margin.** How many cells outside the area stay visible (faded) so
   edges line up. Prototype defaults to 3.
3. **Progress readout.** Show area and overall progress together, or area only
   while inside the mode.
4. **Persistence.** Save the current area with the project (as `focusBlock` is
   today) so it survives reloads and sync.

Implementation outline: an `area` rect in tracker state; `chartTileFor` and the
scroll clamp take the area as their bounds; the counters gain an area-scoped
pair maintained by the same delta path; the legend filters by
area-present colours; a minimap is rendered once per `pat` from the existing
thumbnail path and overlaid with area and viewport rects.

### Phase 4 — Structural, pattern-proportional costs (later)

Only worth doing once Phases 0–2 have removed the noise.

- **R10 typed-array pattern.** `Uint16Array` of palette indices replacing
  N objects: ~400 KB instead of 20–26 MB resident, far less GC. Touches creator,
  tracker and sync. F2 is the first consumer and proves the shape.
- **R7 proper.** Store `done` as its own IndexedDB record and write deltas,
  addressing the 564 ms large-pattern save. Interacts with `exportSync` /
  `prepareImport`, so it needs the sync tests in
  [SYNC_TEST_PLAN.md](../SYNC_TEST_PLAN.md) run against it.
- **R5 proper** (static/dynamic layer split), **R11** (worker rasterisation) and
  **R12** (WebGL): still deferred. Nothing measured so far justifies them.

---

## Decisions

| # | Decision | Outcome |
| --- | --- | --- |
| D1 | Do Phase 0 before any fix? | **Done.** It dropped F3 and reordered Phase 1 |
| D2 | Add the `?perf=1` readout to the shipped app? | **Done**, opt-in only. Loaded only when the flag is present; not precached |
| D3 | Work area: extend the Spotlight focus block or a separate feature? | **Extend the focus block** (confirmed) |
| D4 | Phase 2 store refactor | **Not now.** Tap-to-paint is 48 ms at 4× throttle and flat across sizes. Revisit if the real-device pass shows taps over 100 ms with F2 fixed |
| D5 | Work area saved and synced? | **Yes, both** (confirmed) |
