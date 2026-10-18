# Focused tracking accessibility and large-chart review

Reviewed 18 October 2026 against checkout `66ba416c` (not the conclusions of previous audits). Scope: import a chart, choose a thread, mark progress, undo, save and reopen. Retains the current tiled renderer. This is a focused engineering review, not a claim of WCAG conformance.

## Current evidence and fixes

- A fresh axe 4.10.3 scan of the 400×500/60-thread tracker found 61 nested-interactive instances (60 palette rows and the progress strip), plus the palette list's invalid children. Palette rows now contain independent native Select, thread-detail and Done buttons under list items. Select exposes pressed state, thread identity, name and percentage. G focuses that native button. Session controls have their own button rather than an interactive parent around the timer button.
- The guide announced only coordinates/thread, with no full-cross state after marking or undo. A single atomic polite status now reports coordinates, thread, **full-cross** state, stitch-unit progress and its all/visible-layer scope, selection and zoom. Updates settle for 250 ms; pending timers cancel when input/state changes or the component unmounts. There is no per-cell DOM/accessibility tree. Broad progress-strip, row-count and estimated-finish live regions no longer compete with it. Existing error and discrete-operation messages retain their own semantics.
- The global Space-to-pan binding intercepted native buttons and checkboxes. It now yields to native controls; Space still marks at the keyboard guide and still pans after pointer navigation. Dedicated checks exercise thread selection, More, layer checkboxes, zoom and Undo with Space.
- More opened while focus stayed behind it, and Escape did not close it. It now uses the existing overlay focus-trap hook and Escape stack, restores the opener, and makes the closed panel inert immediately (including during its closing transition). Clear guide returns focus to the chart when its own button disappears.
- Import errors were unlabelled and disappeared after four seconds. They now use an alert and remain until the next import. No timeout is required to finish reading an error.
- Completed palette rows used 50% opacity, reducing text contrast. They now retain the normal text tokens and their numeric 100% state. Small palette actions now have at least 24×24 CSS px targets, 44 px on coarse pointers. The chart continues to offer zoom and keyboard guide marking for small cells rather than creating hundreds of thousands of touch targets.
- Full-cross keyboard/tap/range marking could act on the hidden full-cross layer. Those chart paths now honour its visibility; Undo remains available. Specialty geometry is outside this particular guard.

## Performance diagnosis

A Chromium CPU profile of twelve keyboard mark/move pairs on 600×800 identified full-project structured-clone callbacks in `saveSessionCheckpoint` and `saveProgress` as the dominant sampled work, ahead of canvas drawing. The original checkpoint writer's comment promised no pattern clone, but it fetched the full project on each write. The progress writer also boxed typed arrays and computed causal changes redundantly.

The fix keeps session retirement IDs and a fresh cache token in the existing metadata row, atomically with full writes. Checkpoints read that compact fence; old metadata takes a full-read fallback and upgrades once. A single compact progress base retains marks and causal metadata, never chart cells. Each progress transaction reads the metadata token and latest progress row together. It uses the cached base only on an exact token match; a full write, recovery or older writer invalidates it and triggers an authoritative full-record fallback. Pending progress is always reread, so the cache cannot bypass causal transitions or ordering fences. The cache holds one project, not an accumulating map.

The progress writer also retains typed arrays internally and computes its causal transition once; public project reads still return the established array format. `TrackingSync.marks` walks typed arrays without an intermediate boxed array. Tests count full-record reads, exercise legacy upgrades and an external token change at the same timestamp, and retain the existing closed-session, chart-revision, cross-tab and causal-sync checks.

## Repeatable checks

```sh
npm ci
npx playwright install chromium firefox webkit
npm start
# In another terminal; local CDN copies keep network variability out of measurements:
E2E_LOCAL_CDN=1 npm run test:tracking-accessibility -- --project=chromium --project=firefox
E2E_LOCAL_CDN=1 BROWSERS=chromium,firefox REPEATS=3 npm run perf:tracking -- current
```

`playwright.focused.config.js` also supports WebKit when host libraries are installed. The benchmark defaults to trying all three engines and records launch failures rather than inventing results. Output is `reports/perf-results/focused-<label>.json` (ignored); committed observations live in `reports/focused-tracking/`. Run before and after sequentially on the same idle machine. Do not run other tests or installs alongside timings. Repeat an entire batch when conditions change; retain raw samples, not just the fastest run.

Fixtures are deterministic version-11 JSON charts: 400×500 (200,000 cells) and 600×800 (480,000 cells), 60 genuine DMC colours distributed across the chart, initially unmarked, saved at 100% zoom. These cover large standard cross-stitch tracking; they do not model every chart's confetti, dense marks, PDF/OXS parsing or specialty geometry.

Import and reopen use wall time through a chart tile plus two animation frames. Other input samples use in-page event dispatch through **two animation frames**: 20 keyboard marks, 10 pointer marks, 10 undos, six alternating zoom changes and 20 scroll positions. The benchmark asserts that zoom changes cell size and that 20 marks survive save/reopen. These include frame scheduling and rendering, not just handler execution; they are not OS-input-to-display latency. Save measures the real Tracker flush and subsequent storage read. The old performance spec's cross-navigation marks and placeholder canvas selector are not used.

Memory includes allocated canvas RGBA backing bytes (sum of width×height×4, not process RSS) on both engines, and Chromium CDP post-GC JS heap, V8 backing storage and embedder fields. Firefox exposes no equivalent deterministic heap API here. DOM node counts and tile geometry are recorded. The separate regression pass includes five reopen/GC cycles to detect retained growth, rather than equating one heap sample with absence of leaks.

## Environment and measurements

Linux 6.18.55, Debian 13, x86-64; Intel Xeon Platinum 8573C, three reported logical CPUs with a **2-CPU cgroup quota**, **8 GiB cgroup memory limit**. Node 24.19.0, locked Playwright 1.59.1; headless Chromium 147.0.7727.15 and Firefox 148.0.2, 1440×900 CSS px, DPR 1, no CPU throttling, local production CDN libraries, service workers blocked. This is a shared cloud CPU with software/headless graphics; there is no claim of physical desktop/tablet equivalence.

Values below are **before / after**. Each is the median of three per-run summaries, not a pooled percentile or a significance test. Input latency includes two animation frames. The harness uses sorted index `floor(n * 0.95)` (capped at the last sample); for 20 events this is the maximum sampled latency, so these tails are deliberately conservative. Three runs on a shared headless host do not establish a hard latency guarantee.

| Browser | Chart | Mark tail ms | Pointer tail ms | Undo tail ms | Zoom tail ms | Pan tail ms |
|---|---|---:|---:|---:|---:|---:|
| Chromium | 400×500 | 150.1 / 96.1 | 36.4 / 37.9 | 131.6 / 39.6 | 100.2 / 65.6 | 78.5 / 96.8 |
| Chromium | 600×800 | 301.0 / 72.6 | 361.1 / 33.2 | 316.7 / 53.7 | 332.5 / 87.7 | 42.9 / 54.7 |
| Firefox | 400×500 | 287.0 / 43.0 | 187.0 / 33.0 | 269.0 / 38.0 | 288.0 / 103.0 | 270.0 / 77.0 |
| Firefox | 600×800 | 136.0 / 45.0 | 360.0 / 49.0 | 622.0 / 53.0 | 654.0 / 103.0 | 568.0 / 79.0 |

Full cold-path wall times, seconds:

| Browser | Chart | Import | Full flush + read | Reopen |
|---|---|---:|---:|---:|
| Chromium | 400×500 | 1.35 / 1.83 | 0.86 / 1.15 | 2.56 / 3.17 |
| Chromium | 600×800 | 5.16 / 7.48 | 2.25 / 3.15 | 5.39 / 7.57 |
| Firefox | 400×500 | 1.18 / 1.14 | 1.62 / 1.46 | 3.62 / 3.57 |
| Firefox | 600×800 | 1.93 / 1.94 | 22.69 / 3.52 | 6.06 / 7.37 |

Marking and undo tails improved in all four primary comparisons. Pointer tails were similar or lower. **Chromium pan tails and cold import/full-save/reopen times were higher in the final primary batch. Reopen also remained slow in Firefox. These results do not support an across-the-board performance win.**

An alternating exact-source diagnostic on Chromium 600×800 (three fresh-browser pairs) measured pan at 44.5 / 45.3 ms, marking at 429.3 / 189.8 ms and undo at 345.8 / 52.2 ms. It was captured after the compact-base fix but before the final unchanged-autosave retirement fix. Cold import ranged from 5.26 to 8.88 seconds even in its baseline runs. The diagnostic supports the hot-path improvement and shows substantial host/save-phase variability; it does not dismiss the adverse cold-path measurements above. Reopen latency and cold serialization/restoration remain limitations rather than targets declared solved.

After-only thread selection tails were about 181 / 169 ms for Chromium (400×500 / 600×800) and 104 / 109 ms for Firefox. There are only three selection samples per run; these are weak upper-tail observations, not reliable population percentiles.

Post-GC V8 memory and canvas allocation, MiB:

| Engine / chart | JS heap before / after | V8 backing storage before / after | Canvas RGBA before / after |
|---|---:|---:|---:|
| Chromium 400×500 | 33.46 / 33.54 | 5.86 / 6.05 | 15.67 / 15.67 |
| Chromium 600×800 | 68.68 / 68.18 | 10.88 / 10.89 | 15.70 / 15.70 |
| Firefox 400×500 | unavailable | unavailable | 15.67 / 15.67 |
| Firefox 600×800 | unavailable | unavailable | 15.70 / 15.70 |

Canvas allocation remained bounded by the viewport/tile and unchanged between revisions. No material JS-heap increase was observed; this is not a measurement of total browser/GPU resident memory. [Before samples](focused-tracking/before.json), [after samples](focused-tracking/after.json), and [diagnostic replay / retained outlier](focused-tracking/diagnostics.json) contain the raw observations. The diagnostic retains a 1,575 ms Firefox marking outlier from an earlier intermediate batch; it is labelled separately and is not a result from the final batch.

## Verification and separate bug hunt

An explicit successful flush also left its unchanged five-second autosave queued: the regression probe counted two full-project writes after one flush. The flush now retires that dirty generation only after both primary and legacy writes succeed, while still owned by the same project. The regression test proves later marks still autosave.

The separate adversarial pass found an additional shared-overlay bug: a child with `autoFocus` stole focus before the trap captured its opener. The trap now captures the opener during render, before React commits child autofocus. Bulk-dialog cancellation returns to the chart. More's Escape callback stays stable so a nested Settings dialog closes first and returns to its own trigger.

The hard-close durability test originally assumed that opening a second tab would always finish before a five-second full autosave. On the loaded test host the raw record legitimately already contained all ten marks. The test now deliberately holds full saves, proving the small progress journal survives a hard close independently of host speed.

The 600×800 Chromium accessibility tree fell from 5,904 to 1,701 nodes after hiding redundant ruler labels. No gridcell nodes are generated. In five reopen/GC cycles before the final cache refinement, canvas backing allocation stayed at 16,458,624 bytes; heap ranged from 125,004,768 to 125,225,984 bytes (under 0.2%). A final compact-cache pass again held canvas bytes constant across five cycles; heap ranged from 125,030,208 to 125,235,656 bytes (under 0.2%).

Coarse-pointer emulation on both Chromium and Firefox measured palette Select buttons at 44 px high, Done buttons at about 54–56×44 px, and swatches at 48×109 px. Desktop actions meet the 24 px minimum. Large-chart symbol cells remain reachable above 20 CSS px; visual review at 100% found the rendered shapes legible in both themes. Existing pixel tests distinguish done/not-done in greyscale at 3, 8 and 19 px and verify cell-only repainting. These observations do not establish readability for every user or symbol.

[Light chart](focused-tracking/light.png) · [Dark chart](focused-tracking/dark.png)

- Full Jest: 4,809 passed, four skipped, 353 suites passed and one skipped, with `npm test -- --silent --maxWorkers=2 --testTimeout=30000`. The longer timeout accommodates PDF generation on this host. A broken optional nested canvas installation was removed locally so PDF.js used the working root canvas 3.2.3; no PDF source/export changes were made.
- Focused browser cases and final rechecks: keyboard import and thread choice, marking/undo, local save/reopen, JSON download and reimport into a fresh browser context, errors, coalesced announcements, dialog nesting/restoration, hidden layers, zoom and native Space activation passed in Chromium and Firefox. The two CDP-only memory/tree cases skip Firefox explicitly. The dedicated suite lives in `tests/tracking-audit/`, leaving the original performance suite's test discovery unchanged.
- Existing browser regressions: 12 legibility/repaint cases, six keyboard cases, 22 save/session durability cases (including renderer crashes), plus rechecks after the save/Space fixes. The deterministic hard-close test and the new unchanged-flush/later-mark regression pass.
- Runtime and service-worker freshness checks, terminology lint and diff whitespace checks pass. CSS-token lint reports the same 13 existing advisory findings; the new rules use tokens.

No spoken screen-reader result is inferred from the AX tree or axe. The manual visual review and automated contrast checks are bounded to the stated states and viewports.

## Remaining limitations

No installed screen reader, speech service or desktop accessibility session was available. Keyboard behavior and Chromium's platform accessibility tree were inspected; spoken announcements, browse/application-mode transitions and real touch/VoiceOver/TalkBack remain manual follow-up. Automated axe checks cannot establish full accessibility compliance. The canvas status describes the guide's full cross and overall stitch units; it does not describe every overlapping half, quarter, backstitch or specialty object's geometry. Existing specialist controls and tests remain relevant.

WebKit could not launch because host libraries were missing (GTK 4, Graphene, HarfBuzz ICU, Manette, Hyphen, WOFF2 and GLES). Automatic dependency installation required an unavailable root password; a workspace-only package download also lacked apt package indexes. No WebKit timings or spoken screen-reader results are claimed. This headless cloud host is not representative of real phone/tablet GPU, touch, battery or thermal conditions. Canvas memory estimates exclude compositor/GPU copies, image caches and browser process overhead.


For an alternating source replay, save `project-storage.js`, `tracking-sync.js`, `compiled/tracker-app.compiled.js`, `styles.css` and `components/Overlay.js` from the baseline into a scratch directory (preserving paths). Set `BENCH_SOURCE_ROOT` to that directory for a baseline run and to the current repository root for the paired run; set `BENCH_SOURCE_LABEL` in each command. The harness intercepts exactly those five sources with the same routing mechanism in both variants. Keep the same remaining sources, catalogue, libraries and fixtures; run pairs sequentially with `BROWSERS=chromium SIZES=600x800 REPEATS=1`. This is a diagnostic isolation mode, not a replacement for measuring the final full journey.
