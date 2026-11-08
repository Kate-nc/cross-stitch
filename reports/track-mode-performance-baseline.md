# Track Mode performance baseline

**Date:** 2026-11-08 · **Build:** `1.0.240`, commit `efb1ef0` (the commit the earlier audit examined; still `main` when this ran)
**Scope:** the Stitch Tracker (`stitch.html`) before any further optimisation: what it costs today, where that cost comes from, and which budgets can guard it without making runs flaky.

## Summary

**Marking is fixed; opening is not.** Every full-cross marking case measured, at 50% and 90% done, with a 50 000-event thread-usage history and with 150 other projects, shows a tap in 64-104 ms (median, 4× phone emulation) with no long task, one clipped repaint per tap, no full save and no project-record write. Historically the same cases took 0.1-6.8 s. What a stitcher on a large chart still waits for is everything *around* marking: opening the project, a sync folder export, and any full save.

## Ranked findings

Ranked by user-visible stall × how often it happens. Times are emulated (see [Method](#method)); counts are not.

| # | Finding | Evidence (fresh) | When | Fix direction (not done here) |
|---|---|---|---|---|
| 1 | **Reopening an unchanged project reads it twice and rewrites it twice before the chart can draw.** Every Tracker unload (`beforeunload` *and* `pagehide`) writes a recovery journal (the whole `done` array in localStorage), a progress record, a full save and the legacy `auto_save` copy, changed or not. On open, `ProjectStorage.get` first runs `_recoverProgress`, which applies that journal through the legacy path (`TrackingSync.record` over the whole chart) and puts the whole project back; then applies the progress record (`withDelta`, whole chart again). The header calls `getActiveProject()` for its badge at the same moment, so all of it runs twice. Then `processLoadedProject` runs `TrackingSync.merge(project, {})` over the whole chart only to normalise `halfDone`. | Large 50%, phone: first chart paint **12.2 / 13.0 / 14.4 s** (3 runs), longest task 3.8-5.2 s, 9-13 s blocked in the first 10 s; 2 reads and 2 full puts every run. Huge: **41.8 s**. Desktop, no throttle: large 3.4 s, huge 7.1 s. Profile (large 50%, phone): `_recoverProgress` 2.2 s + 3.6 s, `get`'s read and `rememberProgressBase` ~1.0 s, `TrackingSync.merge` in `processLoadedProject` 1.45 s (2.4 s unprofiled with probes), `rtThreadUsage` 0.33 s, thread-usage snapshot ~0.5 s. Transient heap on huge, desktop: 903 MB before GC, 274 MB after | Every open of a large project, every reload, every return from another tool | Header reads `project_meta`, not the project; one in-flight `get` per id; skip the journal and full writes on unload when nothing changed since the last save; normalise `halfDone` without a full merge. Each touches durability, so each needs the recovery and cross-tab tests run against it |
| 2 | **A sync folder export blocks the main thread for seconds.** It flushes a full save, reads every project back, rebuilds library thread demand, and compresses the file with pako on the main thread. | Huge, phone: 19.7 s end to end, longest task 5.4 s (compress 4.4 s; save 5.0 s; thread demand 3.3 s; read 2.5 s). Large + 150 projects: one **10.1-10.4 s** task (compress). Desktop: 4.5 s / 1.0 s and 4.9 s / 2.2 s | With a sync folder connected (desktop Chrome or Edge; iPad Safari and Android Chrome have no folder access), at most every 30 s after a save | Compress in a worker (pako runs there); export changed projects only (incremental mode exists in `exportSync`) |
| 3 | **Every full save recomputes the project's library thread demand stitch by stitch.** `ProjectStorage.save`'s completion handler calls `projectThreadEntries`, which does an `Object.assign` and a `JSON.stringify` key per stitch. The result depends on the pattern, not the marks. | 3.3 s of one task on the huge chart at 4× (`tx.oncomplete` > `projectThreadEntries` > `add`) | Every full save of a `proj_` project: the open-time save, unload, flushes, the idle autosave | Cache by `chartRevision`, or key by palette index instead of per-stitch JSON |
| 4 | **On a mixed-stitch chart most taps repaint the whole tile**, and the live thread accounting re-estimates the non-full kinds on each tap. | Every run: 9 full and 7 clipped paints for 8 taps (full-cross: 0 and 8). Large mixed: tap p95 336-464 ms, handler up to 175-198 ms. Profile: `ThreadAccounting.sync` > `restOf` > `addRest` 74 + 35 ms per tap | Every tap on a chart with half stitches, backstitch, knots, beads or specialty stitches | Route the mixed mark through the clipped repaint; re-estimate only the changed kind |
| 5 | **A zoom step costs 0.2-0.5 s at 4×.** Each step is a full repaint (correct), plus extra full repaints from the tier fade animation, symbol `fillText` dominating, and the minimap forcing layout. | 16 steps 20% to 100% and back: step p50 232 ms, max 464-488 ms; 20 full paints for 16 steps; long frames 1.4-1.7 s script vs 0.34-0.36 s render; `relayout` (`tracker-minimap.js`) `getBoundingClientRect` 13-46 ms a step | Each keyboard/button zoom step (pinch is previewed and commits once) | Skip the fade repaints when the tier does not change; read minimap geometry once |
| 6 | **Panning still produces 150-280 ms frames on the phone profile**, with no script in them. | Pan, mark, pan: 26-41 of ~900 frames over 50 ms, worst 167-283 ms, Long Animation Frames show 0 ms of script; desktop: 0 frames over 50 ms | Every tile move while panning | Probably SwiftShader raster of the tile copy (as the pan audit found). **Device hypothesis, untested**: on a GPU these are a few ms |
| 7 | **~8.7 React commits per tap** (~1 300 elements a tap: ~516 at once, ~765 when the analysis reply lands). | 67-70 commits for 8 taps in every run | Every tap | Not user-visible today (taps 64-104 ms). Revisit only if a device disagrees |

**Re-validated from the earlier audit and reports**

| Hypothesis | Now |
|---|---|
| Taps at 90% wait 1.2-1.6 s behind the progress write | **Resolved.** 64-88 ms median, no long task (progress record holds only changed registers) |
| A long thread-usage history slows taps (~1.9 s) | **Resolved.** 72-96 ms |
| Opening a project schedules a full save ~5 s later even when nothing changed | **Still true**, and now the smallest part of opening: on large charts it fires 5 s after the chart appears, so outside the 10 s window on the phone profile (inferred, ~17 s; not measured). Measured inside the window on the small and desktop-large runs (the third full put, a `ProjectStorage.save` with no change behind it) |
| Full save on large charts rebuilds sync metadata for the whole chart | **Still true**, but it waits for a minute without marking (fix #8). It costs more on the save's completion side (finding 3) |
| A second tab pays for the first tab's marking | **No.** The watching tab ran no long task and read no project while the other tab marked 7 stitches |
| Work area and overlays cost extra per tap | **No.** Work area taps 72-88 ms; overlay view taps 80-144 ms, with pan frames as without overlays |

---

## Which build was measured

- **Served from the checkout, not `dist/`.** `tests/perf/track-baseline.cjs` starts its own `serve.js` on a free port in this working tree and records `APP_VERSION`, the commit, the number of uncommitted files and the service-worker `BUILD_ID` in every results file. Vercel serves a minified `dist/` (esbuild, ES2020); its script parse time will be lower than measured here, and nothing else should differ.
- **No service worker in the loop.** Every Playwright configuration here, and this runner, blocks service workers, so no cached build can stand in for the checkout.
- **How a real install picks up a build** (`sw.js`, `sw-register.js`): a new worker installs into its own cache named after the build's content hash (`cross-stitch-cache-v71-<BUILD_ID>`), verifies every required file against the SHA-256 or SRI fingerprints baked into `sw.js`, and writes a ready record last. It never calls `skipWaiting()` or `clients.claim()`: it activates only after **every** tab of the app has closed, and an open tab keeps the scripts it started with. Registration polls for updates every 10 minutes. So on a device, "is the fix running?" means: close every stitchx tab (on iPad, also swipe the Home Screen app away), reopen, and check **File > Preferences > Version history** or the `v1.0.xxx` badge.
- **Disposable data only.** Each scenario runs in a fresh browser context whose IndexedDB and localStorage are created for the run and discarded with it. Nothing reads or clears a real profile.

## Method

Runner: [`tests/perf/track-baseline.cjs`](../tests/perf/track-baseline.cjs), `npm run perf:track-baseline` (all scenarios, or `ONLY=` a subset; `PROFILE=1` adds a CPU profile; `REPEATS=n`). Counters: [`tests/_helpers/trackProbes.js`](../tests/_helpers/trackProbes.js), checked in jsdom by [`tests/trackProbes.test.js`](../tests/trackProbes.test.js). Raw results: [`track-mode-baseline/`](track-mode-baseline/).

| Measure | How | Deterministic? |
|---|---|---|
| Interaction latency | Event Timing: input to next paint per tap (INP-style), split into input delay, handler time and presentation; p50 / p75 / p95 / max | No (emulated time) |
| Longest tasks, blocking | Long Tasks and Long Animation Frames (LoAF); TBT = sum of each task beyond 50 ms | No |
| Attribution | LoAF script entries (invoker, function, file:line), and with `PROFILE=1` a 0.5 ms CPU profile aligned to page time, reduced per long frame to self time and the chain of app functions | Mostly |
| Rendering vs script | LoAF: time after `renderStart` (style, layout, paint) vs script time | No |
| Chart paints | `drawStitch` calls, told apart by its opening whole-chart fill on the chart canvas: **full** (unclipped tile) vs **partial** (under a clip: a tapped stitch or a strip after a tile move); kept tile moves (canvas drawn onto itself) | Yes |
| React updates | Commits, through a stub of the DevTools hook (`onCommitFiberRoot`), and `createElement` calls | Yes |
| Persistence | Every IndexedDB put/get with its synchronous main-thread time (a put's structured clone runs inside the call), write transactions and their time to complete, localStorage writes; named spans for `ProjectStorage.save` / `saveProgress` / `get`, `TrackingSync.*`, `ThreadAccounting.*`, `StashBridge.*`, `SyncEngine.*` | Counts yes, times no |
| Workers | `postMessage` main-thread time and the round trip to the reply | Counts yes |
| Memory | `Runtime.getHeapUsage`, before and after a forced GC | Roughly |

The probes wrap `fillRect`, `save`/`restore`/`clip`, `drawImage`, IndexedDB and localStorage calls and the app modules named above. That adds a small cost per call to every scenario alike; the profiled runs (`PROFILE=1`) add more and are used for attribution only, never for the latency figures.

**Profiles.** *Phone*: Pixel 5 emulation (393 × 851, DPR 2.75, touch) with Chromium's 4× CPU throttle. *Desktop*: 1440 × 900, DPR 1, no throttle. A fixed loop timed inside each run confirms the throttle held (~21 ms phone, ~5 ms desktop), including across a reload.

**What these numbers are not.** Headless Chromium draws canvases in software (SwiftShader, reported by WebGL as "SwiftShader driver"); a phone or iPad draws them on the GPU. CPU throttling slows script but not the raster or compositor threads in the same proportion. The host is a 4-core cloud VM. **No figure here is a physical-device measurement**, and the phone column is a stress profile, not a prediction for any particular phone. The counts (paints, commits, saves, storage operations) are the same on any device; that is why the budgets below lean on them.

**Fixtures** ([`tests/_helpers/trackerFixture.js`](../tests/_helpers/trackerFixture.js)): small 100 × 100 (12 colours), large 400 × 500 (60), huge 600 × 800 (80), full crosses only, done stitches spread evenly; *mixed* adds half stitches, backstitch, knots, beads, petites and long stitches. *History*: a 50 000-event thread-usage ledger from another project. *Collection*: 150 other projects of 120 × 120, saved through `ProjectStorage`. Zoom 100% unless marked *low* (30%).

## Fresh measurements (2026-11-08)

All emulated: Chromium 153 headless, SwiftShader, 4-core VM. *Phone* = Pixel 5 emulation at 4× CPU; *desktop* = no throttle. One run per row unless stated; the budget cases were run three times (see [Budgets](#budgets)). Raw data: [baseline-2026-11-08.json](track-mode-baseline/baseline-2026-11-08.json) (32 scenarios), [-desktop-extra](track-mode-baseline/baseline-2026-11-08-desktop-extra.json), [-overlays](track-mode-baseline/baseline-2026-11-08-overlays.json), and with CPU profiles [-profiled](track-mode-baseline/baseline-2026-11-08-profiled.json). Tables generated by `node tests/perf/track-baseline-table.cjs <files>`.

### Opening an unchanged project (first 10 s)

| Scenario | Profile | First chart paint | Longest task | TBT 0-10 s | Full puts | Heap after GC |
|---|---:|---:|---:|---:|---:|---:|
| small 50% | phone | 1,309 ms | 161 ms | 410 ms | 3 | 12 MB |
| large 50% | phone | 12,248 ms | 4,110 ms | 10,564 ms | 2 | 121 MB |
| large 90% | phone | 17,217 ms | 3,018 ms | 9,063 ms | 2 | 160 MB |
| huge 50% | phone | 41,824 ms | 6,986 ms | 11,400 ms | 2 | 273 MB |
| large mixed 50% | phone | 12,519 ms | 3,885 ms | 10,412 ms | 2 | 131 MB |
| large 50%, 50k history | phone | 12,673 ms | 4,675 ms | 10,473 ms | 2 | 137 MB |
| large 50%, 150 projects | phone | 10,192 ms | 3,218 ms | 8,951 ms | 2 | 121 MB |
| huge 50% | desktop | 7,139 ms | 2,451 ms | 6,155 ms | 2 | 274 MB |
| large 50% | desktop | 3,362 ms | 881 ms | 2,942 ms | 3 | 128 MB |

### Marking (12 taps 1 s apart; rapid: 20 taps 0.4 s apart)

| Scenario | Profile | Marked | Tap p50 / p75 / p95 / max | Handler max | Paints full / partial | Commits / tap | Progress writes | Full saves | Longest task |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| small 50% | phone | 12/12 | 88 / 96 / 128 / 128 ms | 11 ms | 0 / 12 | 8.0 | 12 | 1 | 88 ms |
| large 50% | phone | 12/12 | 80 / 88 / 104 / 104 ms | 9 ms | 0 / 12 | 8.3 | 12 | 0 | 0 ms |
| large 90% | phone | 12/12 | 80 / 80 / 88 / 88 ms | 14 ms | 0 / 12 | 8.3 | 12 | 0 | 0 ms |
| huge 50% | phone | 12/12 | 72 / 80 / 104 / 104 ms | 18 ms | 0 / 12 | 8.3 | 12 | 0 | 0 ms |
| huge 90% | phone | 12/12 | 64 / 72 / 72 / 72 ms | 13 ms | 0 / 12 | 8.3 | 12 | 0 | 63 ms |
| large mixed 50% | phone | 9/12 | 72 / 80 / 336 / 336 ms | 175 ms | 12 / 10 | 7.3 | 11 | 0 | 286 ms |
| large 50%, 50k history | phone | 12/12 | 72 / 80 / 96 / 96 ms | 15 ms | 0 / 12 | 8.3 | 12 | 0 | 66 ms |
| large 50%, 150 projects | phone | 12/12 | 64 / 72 / 96 / 96 ms | 15 ms | 0 / 12 | 8.3 | 12 | 0 | 0 ms |
| large 50% @30% | phone | 12/12 | 80 / 88 / 120 / 120 ms | 13 ms | 0 / 12 | 7.7 | 12 | 0 | 62 ms |
| huge 50% @30% | phone | 12/12 | 80 / 96 / 120 / 120 ms | 12 ms | 0 / 12 | 7.9 | 12 | 0 | 102 ms |
| huge 50% | desktop | 12/12 | 24 / 24 / 32 / 32 ms | 3 ms | 0 / 12 | 6.5 | 12 | 0 | 0 ms |
| rapid huge 50% | phone | 20/20 | 72 / 80 / 88 / 88 ms | 16 ms | 0 / 20 | 5.3 | 10 | 0 | 0 ms |
| rapid large 90% | phone | 20/20 | 80 / 88 / 104 / 104 ms | 21 ms | 0 / 20 | 5.2 | 10 | 0 | 54 ms |

### Pan, mark, pan (4 x: 60 scroll frames, 3 taps); work area and overlays

| Scenario | Profile | Tap p50 / max | Frames > 50 ms | Worst frame | Kept tile moves | Paints full / partial | TBT |
|---|---:|---:|---:|---:|---:|---:|---:|
| large 50% | phone | 72 / 104 ms | 26 of 929 | 167 ms | 25 | 0 / 62 | 2,075 ms |
| huge 50% @30% | phone | 80 / 120 ms | 29 of 891 | 200 ms | 25 | 0 / 58 | 2,499 ms |
| large mixed 50% | phone | 72 / 408 ms | 41 of 859 | 283 ms | 25 | 12 / 60 | 2,524 ms |
| huge 90% | desktop | 16 / 32 ms | 0 of 889 | 33 ms | 25 | 0 / 62 | 0 ms |
| huge 50%, work area | phone | 72 / 88 ms | 19 of 907 | 167 ms | 16 | 1 / 34 | 1,295 ms |
| large 50%, overlays | phone | 80 / 144 ms | 28 of 918 | 250 ms | 24 | 1 / 54 | 2,359 ms |

### Zoom steps across the detail tiers (16 key presses: 20% to 100% and back)

| Scenario | Step p50 / p95 / max | Handler max | Full paints | Script / render in long frames | Zooms |
|---|---:|---:|---:|---:|---:|
| large 50% @20% | 232 / 464 / 464 ms | 167 ms | 20 | 1,438 / 335 ms | 20 30 40 50 60 70 80 90 100 90 80 70 60 50 40 30 20 |
| huge 50% @20% | 232 / 480 / 480 ms | 192 ms | 20 | 1,706 / 358 ms | 20 30 40 50 60 70 80 90 100 90 80 70 60 50 40 30 20 |

### Sync: one folder export; two tabs on one project

| Scenario | Profile | Export total | Longest task | TBT | File |
|---|---:|---:|---:|---:|---:|
| huge 50% | phone | 19,691 ms | 5,443 ms | 19,109 ms | 868 KB |
| large 50%, 150 projects | phone | 20,949 ms | 10,080 ms | 15,306 ms | 2,742 KB |
| huge 50% | desktop | 4,515 ms | 1,003 ms | 4,047 ms | 868 KB |
| large 50%, 150 projects | desktop | 4,918 ms | 2,210 ms | 3,010 ms | 2,741 KB |

Two tabs (large 50%): tab A marked 7 of 8, taps p50 / max 72 / 88 ms; tab B meanwhile: 0 long tasks, 1 commit, 0 project reads.

Notes on these rows:

- *Open*: "Full puts" counts whole-project writes in the first 10 s; heap is measured at 10 s, when the huge phone run had not finished loading. On the phone profile the large and huge charts first paint after the 10 s window, so the open-time full save (and its thread-demand rebuild) falls outside it.
- *Marked* counts full stitches whose stored mark changed. On the mixed chart 3 of 12 taps changed no full stitch: the count does not cover half stitches and the other kinds, so they may have marked one of those. Overlays (Highlight view, outline, counting aids, Spotlight): only the highlighted colour can be marked and only ~3 of its stitches are on screen at a time, so 6 of 12 taps marked.
- *Pan, mark, pan* moves the scroll position per animation frame inside the page, as a drag or fling does; two-finger gestures and pinches are covered by `pan-large.spec.js`.
- *Zoom*: the keyboard steps go 20% to 100% on this chart and back, crossing the low tiers into symbols; Tier 4 (26 px cells) is not reached.
- *Sync export* goes through `SyncEngine.exportToFolder` with a stand-in folder handle, so it includes the flush, the read-back and compression, not the disk write.

## Historical results (not re-measured here)

From earlier reports, same harness and fixtures unless noted. These are the fixes the baseline builds on; none is repeated here.

| Change | Before | After | Source |
|---|---|---|---|
| Analysis worker holds the pattern (F2) | 352 ms main thread per tap (huge, 4×) | 0.4 ms | [track-view-performance-plan.md](track-view-performance-plan.md) |
| Outline ants off React (F1) | 11 920 elements/s idle | 0 | same |
| Hover bar via DOM (F4) | 1 176 elements per stitch crossed | 0 | same |
| Tap paints before the transition commit (#1) | handler ~1.2 s (large 50%) | ~4 ms | same, 2026-10-31 update |
| Live thread accounting (#6) | ~0.7 s snapshot per tap | none | same |
| Interned sync registers (#7) | `TrackingSync.record` ~900 ms at 1× | ~130 ms | same |
| Marks-only full save waits for a pause (#8) | full save in every 5 s pause | after 60 s idle, 5 min cap | same |
| Shared ledger event parts (#9) | 29 MB, ~0.7 s per ledger write | ~15 MB, ~90 ms | same |
| Tile shift, edge check, pinch dead band, zoom preview | up to 120 paints per 120-frame edge pan | 6 | [track-pan-performance-audit.md](track-pan-performance-audit.md) |
| Navigation record instead of full saves | a full save per zoom or colour change | none | same |
| Progress record holds only changed registers | 410-1 070 ms per progress write (large 30%) | 17-80 ms | same, last follow-up |

Re-checked in passing: `pan-large.spec.js` "right edge" gives 6 paints in 120 frames, as recorded.

## Budgets

**Review of the existing assertions.**

| Assertion | Was | Verdict |
|---|---|---|
| `tap-cost.spec.js` progress taps: median tap-to-paint < **5 000 ms** | Set while taps queued behind saves (medians 0.1-1.9 s) | 50-70× the current median. Replaced (below) |
| same: handler median < 250 ms | Guards fix #1 | Kept the idea, tightened to 100 ms (measured 4-7 ms) |
| same: snapshot rebuilds = 0 | Counted | Kept |
| `tap-cost.spec.js`: analysis post < 25 ms; ≤ 2 of 12 rhythm taps > 200 ms | F2 guards | Kept: measured ≤ 1 ms, 0 of 12 |
| `mobile-audit.spec.js`: TBT after open < 8 / 20 s | Documented as a tripwire for a 4-5× noisy figure | Left alone; the open now has its own counted spec |
| `tests/perf/*.spec.js`: import < 60 s, page load < 30 s | Not Track Mode | Left alone |

**New budgets.** Set from three runs of each case on this build (Pixel 5 emulation, 4× CPU). Counted contracts were identical in every run and are asserted exactly or as ratchets; time ceilings sit at ~2.5× the worst median and ~5× the worst single sample seen, so harness noise does not trip them but the regressions they exist for (a tap waiting behind a save: 1-7 s; the re-render back in the handler: ~1.2 s) do.

| Spec | Contract | Measured | Budget |
|---|---|---|---|
| `tap-cost.spec.js` "tap cost with progress" (large 50%, 90%, long history; medium mixed) | Clipped repaints per tap, full-cross | exactly 1 | `=== taps` |
| | Full repaints, full-cross | 0 | `0` |
| | Full repaints, mixed | 9 for 8 taps | `≤ taps + 1` (ratchet, finding 4) |
| | React commits | 67-70 for 8 taps | `≤ 12 per tap` |
| | Full saves / project-record puts / whole-chart `TrackingSync.record` while tapping | 0 / 0 / 0 | `0` each |
| | Progress writes | 8 for 8 taps | `1..taps` (durable, never more than one a tap) |
| | Handler median | 4-7 ms | `< 100 ms` |
| | Tap-to-paint median | 72-104 ms | `< 250 ms` |
| | Slowest tap | 96-256 ms | `< 1 200 ms` |
| `open-cost.spec.js` (new): reopen large 50% unchanged | Full project reads before first paint | 2, 2 | `≤ 2` (ratchet, finding 1) |
| | Full project writes before first paint | 2, 2 | `≤ 2` (ratchet) |
| | First chart paint | 12.2, 13.0, 14.4 s | `< 30 s` |
| `tests/trackProbes.test.js` (Jest, runs in CI) | The counters count what the budgets assume: full vs clipped paints, kept tile moves, React commits through the DevTools hook, IndexedDB and localStorage writes, spans, Event Timing reduction, percentiles, windowing | – | exact |

The ratchets pin today's figures so a regression fails; they should be lowered as findings 1 and 4 are fixed. CI runs Jest only, so the browser budgets are run by hand (`npm run test:mobile-audit`, or with `PW_OFFLINE_CDN=1` where cdnjs is unreachable); none of them can make CI flaky.

## Not covered, and validation that was not possible

- **No physical device.** Every figure is emulated; see [the procedure below](#validating-on-an-ipad-or-android-device).
- **No WebKit.** Only Chromium is installed in this environment, so the `ipad-webkit` project and an iPad-like engine run of these scenarios were not possible. WebKit's IndexedDB structured clone and memory limits are the most likely place a device disagrees with finding 1 (hypothesis: slower, and the huge chart's transient heap on open may exceed an iPad tab's limit).
- **WebDAV and relay sync** were not measured; only the folder export.
- **Pinch zoom and two-finger pans** are not in this matrix; `pan-large.spec.js` covers them by counted work.
- The overlay row marked 6 of 12 taps (see notes above).

## Validating on an iPad or Android device

Not done: this environment has neither. The procedure below needs about 15 minutes per device and no developer tools.

1. **Get the build.** Close every stitchx tab (iPad: also swipe the Home Screen app away). Reopen and confirm the version in **File > Preferences > Version history** matches the build under test. A new build only takes over once every tab has closed.
2. **Use a throwaway project.** Never a real one: import the generated fixture (`node -e "console.log(require('./tests/_helpers/trackerFixture').fixtureFor('large',{doneFraction:0.5}))"` prints its path; AirDrop or copy it to the device) and open it in the Tracker. Use the huge fixture too on a device with 4 GB or more.
3. **Open with the readout.** Add `?perf=1` to the Tracker URL (`stitch.html?perf=1`). Its counters work on iOS Safari, which has no Long Tasks API: blocking comes from animation-frame gaps.
4. **First 10 s.** Reload, do nothing for 10 s, press **Copy** in the readout and paste the JSON into a note labelled "open".
5. **Steady marking.** At 100% zoom, tap 12 different stitches about one a second. Copy ("mark-100"). Repeat at the lowest zoom that still marks ("mark-low").
6. **Pan, mark, pan.** Pan with one finger for 2 s, tap 3 stitches, pan back; four times. Copy ("pan-mark").
7. **Zoom crossings.** Pinch from fully out to fully in and back, slowly, twice. Copy ("zoom"). Check that symbols appear and that the chart is sharp after each pinch.
8. **Note** the device model, OS and browser version, whether it was on battery, and anything that felt slow, with the time.
9. Paste the notes into this report under a "Device results" heading, next to the emulated row for the same scenario. A device row that disagrees with the ranking above (for example, raster time dominating rather than script) changes the ranking; say so.

Pass/fail guide for a device: a tap that shows in under 100 ms most of the time and never over 300 ms; no frame gap over 200 ms while panning at 100%; the first 10 s after opening with no gap over 1 s once the chart is visible.
