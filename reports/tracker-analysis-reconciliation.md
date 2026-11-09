# Tracker analysis demand and reconciliation

2026-11-09. Base: `08c78b4fa3d6e02974eacc43cc7b4cbc004c64c5` (latest main at checkout). The earlier `efb1ef0` audit was treated as hypotheses. Read alongside [the baseline](track-mode-performance-baseline.md), [the performance plan](track-view-performance-plan.md) and [save/sync costs](track-save-sync-cost.md).

## Scope and evidence limits

The compact, transferred analysis pattern, cached static arrays, clipped mark paints, synchronous marking refs, incremental counts/accounting, progress records, overlay saves and worker sync compression were already shipped. This change does not repeat or replace them.

**Browser validation is unavailable in this environment.** Chromium was actually launched with Playwright, after moving its temporary directory to a writable workspace. Startup fails at `chrome/browser/process_singleton_posix.cc:297`: `socket() failed: Operation not permitted (1)`. There is no browser result, measured interaction-latency improvement, physical-device measurement, full Tracker React profile, layout/paint measurement or browser worker-message timing to report. CPU throttling was not used. The isolated Node evidence below justifies reducing counted work; it does not establish the end-to-end latency acceptance criterion. Browser and device validation remain required before this draft is ready.

## Every analysis consumer

| Consumer | Data needed | Demand and freshness |
| --- | --- | --- |
| Suggested-area overlay (`recEnabled`) | Region completion and impact scores | Dynamic, while the tracking chart is active, outside Stats and edit mode. It is enabled by default: ordinary default tracking still legitimately analyses progress. |
| `_computeNextFocusBlock` and block-completion auto-advance | The same region rankings | Dynamic whenever non-Royal, non-cross-country Spotlight navigation is enabled, **even if recommendations are hidden**. Navigation is not gated on overlay visibility. Existing Royal Rows ordering is independent. |
| Distance/cluster overlay | Pattern-only nearest distances and cluster sizes | Static: one analysis per pattern; marking needs no worker refresh. There is currently no visible UI setter for `threadUsageMode`, but the consumer remains supported. |
| Counting-aid ninja markers | Pattern-only cluster sizes; completion comes from current `done` | Static while the overlay is visible (Highlight, selected colour, enabled counting aids/ninja markers, cell size at least 12 px). The immediate neighbour fallback now matches the worker's cardinal-connectivity singleton definition, including when neighbours are done. |
| Derived recommendations and quick wins | Region and colour aggregates | Derived only for dynamic demand. Work-area filtering and dismissals rerank locally, immediately; changing work area does not change the worker's whole-pattern calculation. |
| `threadUsageSummary` | Full scan of cluster sizes plus colour summaries | No consumers in current code. Removed the dead memo rather than repeatedly scanning the chart after every reply. |
| Save/progress, undo/redo, sessions, consumption accounting, cross-tab conflict handling, sync, backups, imports | None | No analysis dependency. These paths and their synchronous refs are preserved. Navigation is a behaviour-sensitive consumer, retained above. |

`analysisRunning` also had no consumers, but its true/false updates rendered TrackerApp. It is removed.

## Scheduling

The scheduler lazily starts a worker when demand appears. Activation or a project change posts immediately; ordinary dynamic progress uses the existing 500 ms trailing debounce. Only one request is in flight. Further updates replace one pending snapshot, and completion drains the newest snapshot immediately. This is coalescing, not a queue of work to finish later.

Request IDs, input revision, pattern identity/ID, project ID, dimensions, progress identity and region size prevent obsolete replies from reaching consumers. A superseded first reply still supplies the pattern-only arrays: the worker transfers them only once. Cached results may be reused only for compatible inputs. Turning demand off suppresses reply state updates. A static-to-dynamic activation while a request is in flight may publish its reply only when progress and region size still match. Rendering also validates the envelope, and dynamic publication checks the synchronous `doneRef` so a concurrent mark transition cannot publish older counts.

A native worker error terminates it and releases the flight; the next demanded input recreates it and retransfers the pattern. A protocol error releases the request and drains newer inputs. There is no retry loop on an unchanged failing input, and no new silent-hang watchdog. Disposal cancels timers, terminates the worker and rejects late replies.

**No changed-region algorithm was added.** Region impact scores depend on adjacent regions; colour totals and global ranking must also remain exact. Active dynamic computation is not the main-thread bottleneck demonstrated here. The existing worker calculation and compact transfer remain unchanged and are covered by its equivalence tests.

## React boundaries

- `TrackerPaletteRow` is memoised. Props contain immutable display values (count text, percentage, completion, selection, parking and backstitch state), not references to the mutable count tables. A mark changes only affected rows. Sorting still moves keyed rows correctly. Palette/key data are stable until palette or fabric changes.
- A stable action dispatcher reads handlers installed after each commit, preserving current work-area, colour, edit-mode and confirmation behaviour. It never pins an old closure or reads handlers from an abandoned concurrent render.
- Save presentation has a small local `useSyncExternalStore` subscription in `TrackerSaveHeader`. The existing status derivation, save generations, epochs, failure, retry and conflict producers are unchanged. Save status does not notify TrackerApp or the palette.
- The progress strip was **already extracted**. It is now memoised with stable session and action props, so unrelated updates can skip it while marks and session changes still update its labels. Its elapsed-time subscription remains independent.

TrackerApp still renders for marks and owns marking, progress and session data. Toolbar/control subtrees have not all been isolated. No wholesale state store rewrite was attempted without a full-app profile.

## Reproductions and measured work

Run from the repository root after `npm ci`:

```sh
node tests/perf/tracker-palette-node.cjs
AFTER=1 OUT=reports/track-mode-baseline/palette-node-after.json node tests/perf/tracker-palette-node.cjs
node tests/perf/tracker-analysis-node.cjs
```

The palette reproduction extracts the exact old inline row/actions from the recorded base commit, and the current memoised components for `AFTER=1`. It uses React's Profiler and jsdom: 200 colours, 30 individual row-count changes, each followed by an unchanged parent update (representing the old save-status/render pattern). Callbacks are inert; behavioural checks are separate. All 60 parent updates still happen in this comparison, making the row saving independent of save-status isolation.

| Palette state | Elements, before | Elements, after | React render duration, before | after |
| --- | ---: | ---: | ---: | ---: |
| Closed, comfortable | 0 | 0 | 0.68 ms | 0.80 ms |
| Closed, compact | 0 | 0 | 0.39 ms | 0.39 ms |
| Open, comfortable | 228,000 | 12,600 | 1047.93 ms | 80.35 ms |
| Open, compact | 120,000 | 12,300 | 568.72 ms | 74.38 ms |

One process per side, development React, no layout or paint. Times are illustrative, not a stable benchmark or an interaction measurement. Counts show 94.5% fewer elements for comfortable rows and 89.8% fewer for compact rows. Raw outputs: [before](track-mode-baseline/palette-node-before.json), [after](track-mode-baseline/palette-node-after.json). The independent save-subscription test additionally verifies that status/failure/conflict/reset updates leave parent and row render counts at one (their initial mount).

The analysis reproduction executes the **old lifecycle effects** and the new scheduler against the same worker protocol in a Node VM, with a controlled debounce clock, a 400 × 500 pattern, 60 colours and 50% initial completion. It clones each message with `structuredClone`, and distinguishes startup from 30 steady marks spaced beyond debounce. These are isolated computation and cloning costs: not browser worker threads, queue delay, IPC or React commits.

| Steady 30 marks | Analyses | Pattern transfers | Requested React state updates |
| --- | ---: | ---: | ---: |
| Before, irrespective of feature demand | 30 | 0 | 90 |
| After, no demand | 0 | 0 | 0 |
| After, static-only consumer | 0 | 0 | 0 |
| After, dynamic consumer | 30 | 0 | 30 |

Static-only demand still pays one startup analysis and one pattern transfer; inactive demand pays neither. Active dynamic work is intentionally unchanged. Requested state updates are **not commits**: React can batch the old result/running-false calls. See [raw computation/clone timings](track-mode-baseline/analysis-node.json); the algorithm is unchanged, so differences in dynamic timings are noise, not a claimed speedup.

Cost separation:

- **JavaScript/React:** isolated palette render duration and element counts above; full Tracker reconciliation remains unmeasured.
- **Worker computation:** separately timed `handleMessage` work in Node, plus exact analysis counts. No claimed improvement in per-request computation.
- **Messages:** outgoing/incoming structured-clone time recorded separately in Node. Browser transport, worker scheduling and reply-handler overhead remain unmeasured.
- **Rendering:** jsdom does not layout, paint or rasterise; no rendering result.
- **Storage:** no production storage changes; isolated reproductions do no IDB work. Existing durability/accounting/sync tests are the regression evidence, not a storage benchmark.
- **User-visible latency:** unavailable. Nothing in these figures is a physical-device or CPU-throttled browser result.

`tests/perf/tracker-reconciliation.cjs` is the runnable browser continuation: large palette open/closed, analysis on/off, real steady marks, the existing interaction/paint/storage probes, component-body JS costs, worker execution and round trips. It serves instrumented source without changing production bundles. Example: `CHROME=/path/to/chromium REPEATS=3 OUT=reports/track-mode-baseline/reconciliation-browser.json node tests/perf/tracker-reconciliation.cjs`. Its runtime remains unverified here because Chromium cannot start. Full controls-open/closed profiling and device testing are outstanding, not inferred from the palette reproduction.

## Regression coverage and checks

New behavioural coverage exercises inactive-to-active demand, rapid inputs, overlapping requests, static-to-dynamic activation, same-input hide/show, stale replies, retained statics, project replacement, region-size changes, work-area filtering, protocol/native worker errors and disposal. Existing worker equivalence tests still compare cached progress results to full analysis.

React/jsdom coverage checks changed-row-only rendering, rapid count changes, completion/bulk/undo/redo display snapshots, selection, latest action arguments, project replacement, backstitch/detail actions, save success/failure/conflict/reset without parent renders, and progress/session label updates. Existing mark, history, session, storage, cross-tab, backup, sync and legacy-import suites remain in the full Jest run. Source-wiring assertions were updated to check both dispatcher calls and their original target handlers; no behavioural expectation was relaxed.

Final checks:

- `npm test -- --maxWorkers=2`: **448 suites passed**, one existing skipped suite; **6,590 tests passed**, four existing skips. Two workers bound resource usage; the run remains parallel.
- `node build-runtime-js.js --check` and `node build-sw.js --check`: passed. Regenerated runtime and service-worker fingerprints are committed.
- `node scripts/build-dist.js`: passed, 229 files / 208 minified; no deployment.
- `npm run lint:terminology`: passed.
- `npm run lint:css-tokens`: passed with seven existing non-blocking advisories in unchanged `styles.css`.
- Syntax checks for all three new reproduction scripts and `git diff --check`: passed.
- Browser/E2E/WebKit/physical-device checks: unavailable, with the Chromium startup failure described above. Full-app interactions including rapid taps, bulk marks, undo/redo and cross-tab replacement have unit coverage but were not newly exercised in a browser here.

No merge or deployment is part of this change.
