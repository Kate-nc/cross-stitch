# Track Mode: changed cells in progress writes, and what panning still costs

**Date:** 2026-11-09 · **Base:** `main` at `88819f0` (`1.0.244`) · **Follows:** [track-save-sync-cost.md](track-save-sync-cost.md), [track-mode-performance-baseline.md](track-mode-performance-baseline.md) (which examined `efb1ef0`) and [track-pan-performance-audit.md](track-pan-performance-audit.md).

## Summary

| | Before | After |
|---|---|---|
| Cells compared per progress write, huge chart (600 × 800) | 480 000 | the cells changed since the last write (1–4 when tapping) |
| `TrackingSync.recordDelta` main-thread time, 12 taps on the huge chart, 4× phone emulation | 109 ms (max 14.5 ms a write) | 16 ms (11 ms of it the first write after opening) |
| Same, desktop | 26 ms | 5 ms |
| One progress write, huge chart, 4× (call to settled) | 22.5 ms (31.3 ms with 2 000 marks changed since the last full save) | 12.1 ms (22.4 ms) |

**Part 2 (panning): no renderer change is justified by what can be measured here.** No physical device was available. In headless Chromium the chart canvas is drawn in software on the renderer's main thread (the GPU process is idle), and there the tile copy is not the dominant cost: panning with `?tileshift=0` (a full repaint per tile move) takes the same time within noise, app JavaScript is under 7% of the main thread during a pan, and the rest scales with the device pixels drawn. That is a property of software rendering, not evidence about a phone's or iPad's GPU, so the fixed-tile-grid rewrite stays undone. What was added instead lets the real-device check compare the cheaper options directly: `?overscan=N` and `?chartscale=1` beside the existing `?tileshift=0`, and the `?perf=1` readout now reports which settings were in effect, the canvas memory and the tile copies made.

## Part 1: progress writes

### What was revalidated first

The audit's hypothesis was that progress writes still copy and compare whole completion arrays even though the stored format is already a delta. On `88819f0`:

| Hypothesis | On `88819f0` |
|---|---|
| The record stores sync registers for the whole chart | **No longer** (fixed in the pan audit's last follow-up: `trackingSyncDelta` holds only the marks changed since the last full save) |
| Each write compares the whole `done` array | **Yes.** `TrackingSync.recordDelta` walks every cell of `previous.done` against `next.done`: 480 000 comparisons per write on the huge chart, whatever was tapped |
| Each write copies the whole `done` array | **Yes, but cheap.** `Uint8Array.from(data.done)` is a memory copy: 0.2 ms desktop, 1.2 ms at 4× on the huge chart. Kept (see below) |
| Each write re-normalises every register already in the delta | **Yes.** `cleanDelta` rebuilds the frontier of each stored register read back from IndexedDB: proportional to the marks changed since the last full save (up to five minutes of marking on a large chart) |
| Each write clones the whole record into IndexedDB | **Yes.** The put clones the 480 KB `done` and every delta register; separate from the comparison, measured below |

Measured with [`tests/perf/progress-write-cost.cjs`](../tests/perf/progress-write-cost.cjs): a bare page loading only the storage scripts (no Tracker, no canvas), a chart saved in full, then 12 progress writes of 3 changed stitches each, made the way the Tracker makes them, after `since` changes already written since the full save. *Compare* (`TrackingSync.recordDelta`, which includes rebuilding the stored registers) and *put* (the IndexedDB `put`, whose structured clone runs inside the call) are main-thread time per write, median of the last 10; *total* is the call to its promise settling and includes IndexedDB's own threads. Compare and put run in one task, inside the write's transaction.

| Case | `main`: total / compare / put | this branch, cells named: total / compare / put | cells compared, `main` → named |
|---|---|---|---:|
| huge 50%, since 0, desktop | 6.3 / 2.1 / 0.9 ms | 4.8 / 0.1 / 1.0 ms | 480 000 → 3 |
| huge 50%, since 2 000, desktop | 9.4 / 3.4 / 1.8 ms | 6.5 / 0.4 / 1.8 ms | 480 000 → 3 |
| huge 50%, since 0, 4× phone | 22.5 / 9.5 / 5.0 ms | 12.1 / 0.5 / 4.1 ms | 480 000 → 3 |
| huge 50%, since 2 000, 4× phone | 31.3 / 13.8 / 7.4 ms | 22.4 / 1.2 / 9.0 ms | 480 000 → 3 |
| large 50%, since 2 000, 4× phone | 17.0 / 5.3 / 4.5 ms | 13.7 / 1.6 / 5.0 ms | 200 000 → 3 |

The copy of `done` is 0.1–0.3 ms on desktop and 0.2–1.4 ms at 4× in both builds. This branch with `MODE=full` (nothing named) gives `main`'s figures within run-to-run noise (huge, since 2 000, 4×: 32.5 / 10.9 / 9.1 ms), so the shortcut, not anything else in the change, is what moved. Times vary by 10–30% between runs; the counts do not. (`main` has no cell counter; its count is the chart's size, which the full comparison always walks.)

With cells named, the comparison and the register rebuild fall from 40–45% of a write at 4× to 4–12%. What remains is mostly the IndexedDB put: cloning the 480 KB `done` array costs 0.8 ms on desktop and 3.7 ms at 4×, and a delta of 2 000 registers another 1.0 / 4.4 ms (timed alone in the same browser). Removing those would need a different stored format (see [Not changed](#not-changed-part-1)).

In the Tracker itself ([`tests/perf/track-baseline.cjs`](../tests/perf/track-baseline.cjs), which now also reports how many writes named their cells and how many cells were compared), on the huge chart:

| Scenario (huge 600 × 800, 50% done) | Writes | Named | Cells compared, before | after | `recordDelta` main thread, before | after |
|---|---:|---:|---:|---:|---:|---:|
| 12 taps 1 s apart, 4× phone | 12 | 11 | 5 760 000 | 480 011 | 109 ms (max 14.5) | 16 ms (max 11) |
| 12 taps zoomed out, 4× phone | 12 | 11 | 5 760 000 | 480 011 | 130 ms | 12 ms |
| 20 taps 0.4 s apart, 4× phone | 10 | 9 | 4 800 000 | 480 018 | 101 ms | 24 ms |
| 12 taps in a work area, 4× phone | 11 | 10 | 5 280 000 | 480 010 | 92 ms | 16 ms |
| 12 taps, desktop | 12 | 11 | 5 760 000 | 480 011 | 26 ms | 5 ms |
| pan, mark, pan at 90% done, desktop | 8 | 7 | 3 840 000 | 480 011 | 20 ms | 5 ms |

The one full comparison left in each run is the first write after the project opened, which has no confirmed write to name (by design: see below). Tap latency is unchanged (64–112 ms median and p95 at 4× in both builds, within run-to-run noise): the progress write runs after the tap's frame, and was already under the 50 ms long-task line at this chart size. What changes is that a write's own task no longer grows with the chart: before, a progress write on the huge chart at 4× held the main thread for 15–25 ms inside its transaction (compare, rebuild, clone); now 6–11 ms, almost all of it the IndexedDB clone.

### What changed

**The Tracker keeps a journal of changed cells** (`ProjectStorage.progressChanges()`, one per Tracker page). Every incremental change to the marks already goes through `applyDoneCountsDelta(changes, pat, newDone, baseDone)`, which the live counts need with the exact changed cells: a tap, a stroke or rectangle, marking a colour, Undo, Redo and unpicking. The Tracker's wrapper of that function also tells the journal that `newDone` is `baseDone` with those cells changed. Arrays are known by a sequence number, never held (a chain of 1 000 taps on a 480 000-cell chart would otherwise keep 1 000 copies alive), and links are dropped once a later write is confirmed. A `done` array set any other way (opening a project, a cross-tab merge, a pattern-change reconcile) has no link, so the next write compares every cell.

**Each progress write names itself and, when it can, what changed since the last confirmed one.** `writeProgressNow` asks the journal for `{ writeId, since }`: a fresh `writeId` for this write, and `since = { writeId, indices }` naming the last write *confirmed* on disk and the cells changed since. A write becomes the confirmed base only when `saveProgress` returns `true` (put, accepted and applying), and never moves the base back if confirmations arrive out of order. A failed, aborted, turned-away or still-in-flight write is not the base, so its cells are named again by the next write.

**Storage believes `since` only inside its own transaction.** `saveProgress` stores `writeId` on the record. When the stored record it reads in the same transaction (a) carries exactly `since.writeId`, (b) is current for the same full save (`previous !== project`, so the same `baseWriteAt`), (c) is in the delta format and (d) has the same length, it calls `TrackingSync.recordDelta(previous, delta, next, author, { indices, trusted: true })`: only the named cells are compared, and the stored delta's registers, which this code wrote, are not rebuilt. In every other case it compares every cell exactly as before. That covers:

- **another tab's write** (its record carries its own `writeId`);
- **a full save, an import, a restore or a chart update** (a new `lastWriteAt` retires the record);
- **an overlay save** (it writes its own progress record with no `writeId`, unless it keeps this tab's newer record unchanged, which keeps its name);
- **navigation-journal recovery** (`saveProgressRecovery` strips `writeId` and `since` from the journal, and the recovered record is stored with `writeId: null`);
- **a record written by an older build** (no `writeId`).

`recordDelta` takes each named cell once, in index order, and writes a register only where the mark differs, so a mark then unmark between writes, a cell named twice, or a cell named but unchanged write what the full comparison writes. A list that is not a list of in-range cell indices, or arrays of different lengths, fall back to the full comparison.

**Unchanged:** the stored record still holds the whole `done` array (copied when the call is made, as before) and every other mark set in full, so what reloading, backups, sync, older builds and a downgrade read is exactly what they read before. Half stitches, quarter stitches, knots, backstitch, beads and specialty stitches are still compared in full (they are listed, and few). The full save, overlay save, sync merge and conflict review do not use `since`.

### Tests

New suite [`tests/progressChangedCells.test.js`](../tests/progressChangedCells.test.js) (18 tests):

- **Reference over random operation sequences.** 40 seeded sequences of 60 steps each, against `ProjectStorage` on fake IndexedDB with a second, separate `ProjectStorage` instance as another tab: single and multiple marks before a write, mark then unmark, half-stitch and knot changes, writes, writes that fail (the progress put is aborted), two writes overlapping with a mark between them, another tab's write, full saves, overlay saves, navigation-journal recovery, and `done` replaced without a link (a merge). Every `recordDelta` call that took the shortcut is repeated without it on the same inputs and must give the same registers; at the end the marks and registers read back must be the tab's. The run asserts it is not vacuous: over 200 shortcut writes, over 50 full comparisons and some failed writes.
- `recordDelta` with named cells against the full comparison over 300 random cases (carried deltas, duplicates, changed-back cells, unchanged named cells, other mark kinds); counted comparisons (a write compares only its named cells, each once, and a cell named three times gets one register write); invalid lists and size changes compare every cell.
- The journal: first write names nothing; failed or in-flight writes are named again; out-of-order confirmations; unlinked arrays; another project, a reset, and the size limit; two different links to one array; links dropped on confirmation.
- Storage: a write naming a record another tab has replaced compares every cell and stores what the full comparison does; a write naming the stored record compares only its cells; a full save retires the name; the navigation journal never carries a write name.
- Source guards for the Tracker wiring (the counts wrapper links, `begin` before and `confirm` only on `true`, reset on project switch).

Mutation checks (each made the suite fail, then reverted): storage ignoring the `writeId` check; the journal dropping one cell of a link; confirmation moving the base back; `recordDelta` dropping named cells; not de-duplicating named cells; the journal keeping `writeId` and `since`.

Also new: [`tests/chartDeviceCheckParams.test.js`](../tests/chartDeviceCheckParams.test.js) (5, Part 2).

Unit (Jest): `npm test`, 6 609 tests, all pass (the existing skip set of 4). `node build-runtime-js.js --check` and `build-sw.js` fingerprints are current; terminology and CSS-token lints pass.

Browser (Playwright, Chromium 1243 from `/opt/pw-browsers`; this sandbox cannot reach cdnjs, so an uncommitted local configuration mapped it to a local server answering with the same React, ReactDOM and pako files from `node_modules`, whose integrity hashes match):

- `tests/e2e` (tablet project): save-durability (13), session-durability, critical-lifecycle, recovery-safety, save-badge, autosave-marks-deferral, backup-save-failure, tracker-load-sessions, cross-tab-merge: 58 pass, 5 fail. The 5 are cross-tab-merge (3), autosave-marks-deferral "any other change still saves within the normal few seconds" and save-badge "says Not saved yet while the changed-in-another-tab question is open"; all 5 fail the same way on a worktree of `main` (`88819f0`) with the same configuration, and are the ones [track-save-sync-cost.md](track-save-sync-cost.md) lists as failing on its base.
- `tests/mobile-audit` (phone and desktop projects): desktop-open-save, tap-cost, open-cost, pan-cost, pan-large, desktop-pan-large: 35 of 35 pass.

### Not changed (Part 1)

- **The first progress write after opening a project, and the first after each full or overlay save, still compares every cell.** There is no confirmed write to name. Naming the loaded record would need the load to report which stored write its marks came from; one full comparison per open or full save was judged not worth that.
- **The IndexedDB put still clones the whole `done` array and the whole delta.** That is now most of a write: 3.7 ms for the array and 4.4 ms for 2 000 registers at 4× on the huge chart. Storing `done` as changes over the full save, or splitting the delta across rows, would change the record that older builds, backups and recovery read; not done.
- **The overlay save** (`ProjectStorage.save(..., { overlay: true })`) still compares every cell for its progress record. It runs after a minute's pause in marking (at most every five minutes) on large charts, or when something else changes.
- **Marking itself still copies `done`** (`new Uint8Array(cur)` per tap), which React state needs; 0.2 ms on desktop on the huge chart.

## Part 2: panning

### What was asked, and what this environment can answer

The audit's hypothesis (its finding 6, and recommendation 4 of the pan audit) was that the 150–280 ms frames still seen while panning on the phone profile are the tile copy (`shiftChartTile`'s `drawImage` of the canvas onto itself) and overlay compositing, and that on a real device these may be a few milliseconds. The brief was to compare normal operation with `?tileshift=0` on identical charts, zoom, overlays and gestures, separating script from raster and compositor work; to evaluate overscan, backing resolution and overlay activation first; and to build fixed-size cached tiles only if copying is shown to dominate and simpler changes are not enough.

**No physical device was available**: no iPad, no iPhone, no Android phone, no WebKit build. Everything below is headless Chromium 1243 on a 4-core VM. Its canvases are drawn by Skia on the CPU: the trace shows the GPU process busy for 0–16 ms in a 3–10 s pan, and every canvas cost lands on the renderer's main thread or its raster workers. On a phone or iPad the 2D canvas is GPU-backed and the copy is a texture copy. These figures cannot say what a device does, and they are not presented as if they could.

### Method

[`tests/perf/pan-copy-cost.cjs`](../tests/perf/pan-copy-cost.cjs). Every case opens the same generated chart (400 × 500, 60 colours, 30% done) at the same zoom and scroll, waits for the import to settle, then scrolls 24 px right and 12 px down per animation frame for 180 frames, as [`pan-large.spec.js`](../tests/mobile-audit/pan-large.spec.js) and the pan audit do. It records the animation-frame intervals, busy time per thread from a Chrome trace (top-level tasks: renderer main, renderer compositor, raster workers, GPU process, viz compositor), the counted work from [`panProbes.js`](../tests/_helpers/panProbes.js) (chart paints, tile moves that copied, device pixels copied) and the backing store of every canvas in the chart layer. `PROFILE=1` adds a CPU profile split into app JavaScript, canvas calls, garbage collection and the rest. Profiles: *phone 4×* (Pixel 5 emulation, DPR 2.75 so the chart renders at 2×, 4× CPU throttle), *phone 1×* (the same, unthrottled) and *desktop* (1440 × 900, DPR 1).

Variants: *normal*; *tileshift0* (`?tileshift=0`, a full repaint per tile move); *overscan150* and *overscan600* (`?overscan=`, the margin painted around the view, default 300 px); *scale1* (`?chartscale=1`, the chart's backing store at 1× instead of 2×); *overlays* (an outline highlight of one colour, a focus block and counting aids: three canvas overlays that follow a tile move) with and without tile shifting; *zoom30* (6 px cells, where a full repaint draws most cells) with and without.

### Results

Phone 4×, three runs each, interleaved ([`pan-copy-cost-phone4x-repeats.json`](track-mode-baseline/pan-copy-cost-phone4x-repeats.json)). An ideal pan is 180 frames in 3 000 ms.

| Variant | Pan took (ms) | Frames over 50 ms | Renderer main busy (ms) | Paints | Copies chart / overlay | Copied | Canvas memory |
|---|---|---|---|---:|---:|---:|---:|
| normal | 5 767 / 5 736 / 5 424 | 21 / 20 / 20 | 5 769 / 5 644 / 5 339 | 39 | 19 / 19 | 76 Mpx | 5.8 Mpx |
| tileshift0 | 4 502 / 5 170 / 5 678 | 20 / 20 / 21 | 4 418 / 5 149 / 5 664 | 20 | 0 | 0 | 5.8 Mpx |
| overscan150 | 5 164 / 4 344 / 4 474 | 32 / 13 / 20 | 4 863 / 3 690 / 3 864 | 71 | 35 / 35 | 78 Mpx | 3.0 Mpx |
| scale1 | 3 435 / 3 887 / 3 609 | 3 / 12 / 4 | 2 127 / 3 021 / 2 343 | 39 | 19 / 19 | 31 Mpx | 2.3 Mpx |
| zoom30 | 4 816 / 4 483 / 4 939 | 11 / 11 / 11 | 4 405 / 3 967 / 4 479 | 17 | 11 / 11 | 49 Mpx | 5.8 Mpx |
| zoom30-tileshift0 | 4 175 / 4 783 / 4 032 | 10 / 11 / 12 | 3 604 / 4 319 / 3 387 | 11 | 0 | 0 | 5.8 Mpx |
| overlays | 7 962 / 6 650 / 6 986 | 21 / 21 / 20 | 8 082 / 6 823 / 7 096 | 39 | 19 / 57 | 98 Mpx | 7.5 Mpx |
| overlays-tileshift0 | 6 246 / 5 799 / 6 596 | 22 / 21 / 21 | 6 359 / 5 896 / 6 696 | 20 | 0 | 0 | 7.5 Mpx |

In every case the renderer compositor took 0.1–0.2 s, the viz compositor 0.3–0.6 s, raster workers nothing, and the GPU process under 20 ms. With overlays on, a further 0.8–1.0 s ran on thread-pool workers (compositing the extra layers in software).

Phone 1× and desktop, one run each ([`pan-copy-cost.json`](track-mode-baseline/pan-copy-cost.json); that first run set the margin and the scale by overriding `window.chartTileOverscan` and `window.chartRenderScale` before the page loaded, rather than through the URL settings added later, so its overscan cases checked the canvas budget at 300 px): no variant had a frame over 50 ms except overscan 600 (6 on phone 1×). Renderer main busy, phone 1×: normal 1 133 ms, tileshift0 1 077, overscan150 871, overscan600 2 432, scale1 516, overlays 1 521. Desktop: normal 994, tileshift0 764, overscan150 948, overscan600 1 594, overlays 1 948 (plus 1.9 s on thread-pool workers).

Where the main-thread time goes (`PROFILE=1`, one run each, [`pan-copy-cost-profiled.json`](track-mode-baseline/pan-copy-cost-profiled.json); the profiler itself slows the throttled runs):

| Case | App JavaScript | Canvas calls (self) | Rest of main thread (native: canvas raster, paint, commit) |
|---|---:|---:|---:|
| phone 4×, normal | 282 ms | 183 ms | 7 590 ms |
| phone 4×, tileshift0 | 349 ms | 291 ms | 7 073 ms |
| phone 4×, scale1 | 364 ms | 171 ms | 3 971 ms |
| phone 1×, normal | 45 ms | 34 ms | 1 144 ms |
| desktop, overlays | 69 ms | 38 ms | 1 686 ms |

Reading it:

- **The copy is not what dominates here.** Copying 76 Mpx in 19 moves costs about what repainting 20 tiles costs: the two pans are within each other's run-to-run spread on every profile and zoom, and the copy's own `drawImage` call is 1–8 ms in the profile. Zoomed out, where the pan audit found shifting most useful, a full repaint is now cheap enough (after its per-cell drawing work) that shifting no longer wins in this environment either. Script is 5–7% of the main thread during a pan. What dominates is native rendering work proportional to device pixels: drawing the chart at 1× instead of 2× (2.3 Mpx of canvas instead of 5.8) cut the pan from about 5.6 s to 3.6 s and the long frames from 20 to 3–12. On a GPU-backed canvas that work is done by the GPU, so none of this predicts a device.
- **Overscan.** 150 px halves the canvas memory (5.8 to 3.0 Mpx on the phone profile) and makes twice as many tile moves (35 instead of 19) for the same pixels copied. On the 4× profile its long-frame count was the noisiest of all (13–32); its main-thread time was 15–35% lower. 600 px is worse everywhere measured (14 Mpx of canvas, the only variant with long frames on phone 1×). The default of 300 stays: the difference between 150 and 300 is within the noise of a software canvas, and a smaller margin means more frequent moves, which a fling on a device may run into.
- **Backing resolution.** The largest effect here, and the one least likely to carry over: a phone's GPU rasterises 2× and 1× at nearly the same cost, while 1× makes symbols visibly softer on a 2.75-DPR screen. Not changed without a device showing 2× is the problem.
- **Overlay activation.** Already as cheap as it can be made without a renderer change: each overlay canvas is mounted only while its overlay is on (`threadUsageMode`, `recEnabled`, `breadcrumbVisible`, `focusEnabled && focusBlock`, counting aids only in a highlight view with a colour chosen), and tile moves already shift each one's pixels instead of redrawing it (`shiftChartOverlays`). Three overlays on cost 20–40% more main thread and about 1 s of software compositing on the profiles here.

### Decision

No fixed-size tile grid, and no change of overscan or backing resolution defaults. The brief's condition for the tile grid ("evidence shows copying is the dominant bottleneck and simpler changes are insufficient") is not met in any environment available: copying is not dominant here, and here is not a device. Each of the simpler options trades memory or sharpness for raster work, and that trade can only be judged on a device's GPU.

### What changed (Part 2)

- [`useCanvasOverlays.js`](../useCanvasOverlays.js): `stitch.html?overscan=N` (clamped to 100–600 px) and `?chartscale=1`, for comparing on a device. The margin is set where the canvas budget reads it (`TILE_OVERSCAN`), so the budget check and the tile the Tracker allocates use the same figure, as they did; `chartscale=1` only ever needs less memory. Without either parameter nothing changes ([`tests/chartDeviceCheckParams.test.js`](../tests/chartDeviceCheckParams.test.js)).
- [`perf-hud.js`](../perf-hud.js) (`?perf=1` only): the readout counts tile copies and the device pixels copied, and **Copy** adds a `chart` section: whether tile shifting is on, the overscan, the chart's render scale, and each chart-layer canvas's size with their total backing store.
- [`tests/perf/pan-copy-cost.cjs`](../tests/perf/pan-copy-cost.cjs): the comparison above, repeatable (`ONLY=`, `REPEATS=`, `PROFILE=1`, `CHROME=`).

### Real-device check (outstanding)

On the largest real pattern available, at 100% zoom and zoomed out, on an iPad (Safari, and the Home Screen app) and an Android phone (Chrome):

1. Open `stitch.html?perf=1`, pan for 10 s with one finger (including along the right edge), press **Copy**, label it "normal".
2. Repeat with `?perf=1&tileshift=0`, `?perf=1&overscan=150`, `?perf=1&chartscale=1`, and, with counting aids and Spotlight on, `?perf=1` again.
3. Paste all five into this report. The `chart` section says which settings each reading had.

Fixed tiles are worth building only if "normal" is clearly worse than "tileshift=0" on a device (copying dominant) and neither overscan nor scale closes the gap. If `chartscale=1` is clearly better and the chart still reads well, a lower scale for large tiles on that class of device is the cheaper change.

### Not covered (Part 2)

- No physical device, no WebKit: see above. The raster, compositor and GPU columns are a software renderer's.
- Two-finger pans, flings with momentum, pinches and mixed-stitch charts were not re-measured here; the pan audit's specs (`pan-large.spec.js`, `desktop-pan-large.spec.js`) still guard their counted work and pass.
- Long Animation Frame entries are recorded in the raw data but undercount badly on the throttled profiles here (a few hundred milliseconds against seconds of main-thread work) and are not used.

## Raw results

- [`track-mode-baseline/progress-write-tracker-before.json`](track-mode-baseline/progress-write-tracker-before.json), [`-after.json`](track-mode-baseline/progress-write-tracker-after.json): the Tracker marking scenarios above, `main` and this branch, one after the other on the same host (CPU profiles removed).
- [`track-mode-baseline/progress-write-cost-main.json`](track-mode-baseline/progress-write-cost-main.json), [`-full.json`](track-mode-baseline/progress-write-cost-full.json), [`-named.json`](track-mode-baseline/progress-write-cost-named.json): the storage-only benchmark on `main`, and on this branch without and with named cells.
- [`track-mode-baseline/pan-copy-cost.json`](track-mode-baseline/pan-copy-cost.json): Part 2.

## Validation that was not possible

- **No physical device.** Every time here is from headless Chromium 1243 on a 4-core cloud VM; "phone" is Pixel 5 emulation, with or without a 4× CPU throttle. CPU throttling slows script but not IndexedDB's own threads, the raster workers or the GPU process in the same proportion. Counts (cells compared, writes named, paints, copies, pixels, canvas memory) are machine-independent.
- **No WebKit, no Safari, no iPad, no Android device.** Safari's IndexedDB clone costs, and every GPU-side cost of panning, are unmeasured.
