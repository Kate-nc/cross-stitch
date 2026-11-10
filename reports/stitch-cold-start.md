# Stitch Tracker cold startup: revalidation and measurement blocker

10 November 2026. Baseline: latest `origin/main` at
`700515ff5875281e0cdc01f33f4f11d708234ab2` (v1.0.246), fetched and verified
before work on the isolated `perf/stitch-cold-start` branch. The earlier audit
examined `efb1ef0d48d1f9fdd6c965d8fbdc01909f2f4d33`.

**No application optimisation is shipped by this change. No startup latency
improvement has been measured.** The request-chain hypothesis below remains
unverified because neither available browser path can run the local app.
This is a reproduction and audit hand-off, not an acceptance claim.

## What has already shipped

Read [mobile-freeze-large-patterns.md, Part 10](mobile-freeze-large-patterns.md),
[track-mode-performance-baseline.md](track-mode-performance-baseline.md),
[track-progress-write-cost.md](track-progress-write-cost.md), and the existing
startup, navigation, load-baseline and precache tests.

- Help and backup/restore already load on demand through `lazy-modules.js`.
- Anchor/conversion data and the import engine already have lazy loaders.
- PDF importing/exporting already load their pipelines on first use.
- Current Tracker code avoids a full save merely for reopening an unchanged
  project, avoids repeated analysis/palette work and writes progress deltas.
  These are separate from HTML request discovery and are not repeated here.
- The earlier trace report explicitly found that byte size did not predict
  evaluation cost. Removing six large modules did not establish a wall-clock
  win. Its phone figures were throttled software-browser figures, not device
  measurements. They cannot establish current cold-network performance.

Comparing the earlier audit commit to current main shows no changes to
`stitch.html`, `runtime-loaders.js` or `lazy-modules.js`, but substantial
Tracker changes. This preserves the request-discovery hypothesis; it does not
preserve the old hydration costs as a valid current baseline.

## Current dependencies and counted work

Counts and byte sizes below are from the actual checkout and a successful
`node scripts/build-dist.js` on the baseline, not inferred from old reports.

| Item | Current count/size |
| --- | ---: |
| Static script tags in `stitch.html` | 81 |
| Static scripts without `defer`/`async` | 79 |
| Local static scripts | 78 |
| CDN static scripts | 3 (React, ReactDOM, Pako) |
| Local eager script bytes, unminified | 2,238,343 |
| Late compiled Tracker entry, checkout | 648,314 bytes / 189,679 gzip |
| Late compiled Tracker entry, `dist/` | 351,613 bytes / 104,133 gzip |

Gzip sizes are Node `gzipSync` sizes, not measured transfer sizes. The static
script count excludes the dynamically loaded entry and optional modules.
**79 parser-blocking scripts does not imply 79 serial network round trips.**
The browser preload scanner can overlap their fetches; a trace is needed to
identify the actual critical chain and contention.

The logical load path is HTML and recovery-storage, ordered dependency
scripts, body hook/component scripts, the inline `loadScript` call for
`compiled/tracker-app.compiled.js`, React mount, `ProjectStorage.get`, project
processing and chart/font drawing. The entry URL is currently discovered by
executing JavaScript near the end of the document. It has no early preload.
An entry preload is the smallest candidate: fetch earlier, execute through
the same loader at the same point. The harness can compare it without editing
application files (`CANDIDATE=1`). Its cold-cache benefit and bandwidth
contention, warm-cache effect, failed-preload retry and offline behaviour are
not established here.

Dependency inspection rules out several tempting removals:

| Script group | Why it remains required or needs separate evidence |
| --- | --- |
| React, ReactDOM, Pako | Runtime globals, project hand-off/legacy decompression, backups and sync. Pako's head ordering is an explicit repository requirement. |
| `creator/symbolFontSpec.js`, `creator/pdfChartLayout.js`, symbol font bytes, `symbol-glyphs.js` | Screen symbols use the same codepoint assignment as the PDF; these are real chart dependencies despite their names. |
| `components-stats.js`, `insights-engine.js` | Shared statistics/session helpers and progress UI are used by the Tracker outside the full Stats screen. |
| Project storage, tracking merge/sync, thread accounting, stash bridge, cross-tab resolution/locks | Hydration, durability, accounting and conflict handling cannot be postponed behind the first mark without further work and evidence. |
| Onboarding | Must exist before the compiled Tracker's first render; deferring it alone has an explicitly documented first-visit race. |
| `starter-kits.js` | Only direct source consumer is Creator's `BulkAddModal`; possible removable Tracker request, but small and no measured startup gain. Not changed speculatively. |
| Preferences and command palette | Already `defer`; their synchronous feature tests and first use need coverage before further laziness. |

No blanket `defer` conversion is proposed. The inline boot/wizard loaders
would otherwise race their globals. Nothing changes storage, autosave,
sessions, undo/redo, cross-tab conflict handling, sync, backups or imports.

## Reproduction and attribution

[`tests/perf/stitch-startup.cjs`](../tests/perf/stitch-startup.cjs) is a new,
**browser-unverified** focused runner. From this checkout:

```sh
node scripts/build-dist.js
CHROME=/usr/bin/chromium REPEATS=3 OUT=reports/perf-results/startup-before.json node tests/perf/stitch-startup.cjs
CANDIDATE=1 CHROME=/usr/bin/chromium REPEATS=3 OUT=reports/perf-results/startup-candidate.json node tests/perf/stitch-startup.cjs
```

Set `ROOT=source` for the compiled, unminified checkout; default is the actual
minified `dist/`. On hosts without writable `/tmp`, set `TMPDIR` to a writable
scratch directory before starting Chromium. Alternate before/candidate runs
on a working host to check drift and compare distributions, not one pair.

The runner serves a deterministic 100 by 100 project through the public
`ProjectStorage` path. It keeps the HTTP cache enabled (no Playwright route
interception), clears it for cold loading, and reuses the same context for a
warm reopen. Each navigation starts from a newly restored test seed (including
clearing the disposable context's journal, session and accounting databases),
so the warm arm measures HTTP caching rather than storage migrations performed
by the cold arm. Seed scripts include the real progress-unit and tracking-sync
dependencies. HTTP-cache cold does not mean a fresh browser process or cold
JavaScript compilation cache. Only CDN transport is mirrored: exact production
npm bytes with
the HTML's existing SRI, gzip and cache headers. Latency is simulated at 80 ms
and 200,000 bytes/s, with no CPU throttle. This is a controlled HTTP experiment,
not a live CDN/TLS benchmark, Vercel cache measurement or physical-device test.
Service workers are blocked so a previous build cannot replace measured bytes.

The JSON is intended to separate:

- **User-visible readiness proxy:** an animation-frame check finds a visible
  chart after drawing starts, with the symbol font loaded and the flush API
  installed; the next frame rechecks those conditions. Font failure is an
  error. This is not proof that every first interaction works.
- **Requests:** resource timing records completed by readiness,
  decoded/encoded/transfer sizes, start/end times and initiator types. Check that the entry is fetched once
  and is discovered earlier in the candidate.
- **JavaScript:** main-renderer `EvaluateScript` inclusive time by URL and
  main-thread compile time reported separately. Do not add compile time to
  evaluation: they overlap. User Timing marks bound all trace totals to the
  current navigation before readiness; matching uses both process and thread
  IDs, and nested/duplicate duration events are counted once per category.
  Background parsing and hydration callbacks outside script evaluation are
  not completely represented by these totals.
- **Hydration:** `ProjectStorage.get` start/settle and its completion-to-usable
  interval for the first successful observed read completed before readiness
  (otherwise null). The latter includes project processing, React, font
  readiness and drawing; it is deliberately not labelled JavaScript-only hydration time.
- **Rendering:** main-renderer layout/style/paint trace time, plus full/partial
  chart paints and React commits from the existing `trackProbes` counters.
  This omits compositor/raster-thread time; software drawing is not a GPU test.
- **Storage and workers:** existing probe counts, synchronous IDB/clone costs,
  write transaction completion and worker post/reply time. These overlap
  other wall-clock spans and must not be summed into one latency total. Async
  completions after readiness are left incomplete in the startup snapshot.

New unit tests verify SRI after decompression, actual cacheable responses,
byte-identical compiled assets, candidate-only HTML changes, renderer/worker
trace-window boundaries, process/thread separation, nested-event accounting,
font/visibility readiness, warm-seed isolation and cleanup on failure. They
validate the measurement helpers, not browser startup performance. Results also
record dirty-tree status and SHA-256 hashes of the served HTML, compiled entry
and worker; a change to those files during a run fails the experiment.

## Available verification and unavailable acceptance checks

| Validation | Result |
| --- | --- |
| Final full Jest suite (`npm test -- --maxWorkers=2`) | 453 suites passed, 1 skipped; 6,650 tests passed, 4 skipped; 1 snapshot passed |
| New measurement-helper tests | 22 passed after the follow-up audit |
| `node scripts/build-dist.js` | Passed: 229 files, 208 minified; generated minified service-worker manifest; `node build-sw.js --root dist --check` and minified HTML transport smoke passed |
| `node build-runtime-js.js --check` | Passed; committed compiled assets current |
| `node build-sw.js --check` | Passed; committed worker fingerprints current |
| Seed and HTTP transport smoke checks | Public storage save/read passed in Node VM with fake IndexedDB; source/dist baseline/candidate responses and an actual local HTTP minified response passed |
| Terminology lint | Passed |
| CSS token lint | Passed with 7 existing advisories in unchanged CSS |
| Cold network / warm HTTP cache usable-chart timing | Unavailable: Chromium launch blocked |
| Direct project link / Home navigation / legacy project browser loading | Unavailable: browser cannot run local app |
| Offline reopen / lazy-feature availability / mixed-version cache prevention | Unavailable: service-worker browser lifecycle cannot run here |
| CDN failure, entry preload failure and successful reload/retry | Unavailable: browser cannot run local app |
| First mark, undo/redo, persistence/reopen, sync/backup first use | Unavailable in browser; existing unit coverage passes |
| Physical phone/iPad and live deployed-site timing | Not performed; no deployment requested or made |

The attempted runner first failed because `/tmp` is unavailable. Retrying
with a workspace `TMPDIR` reached the installed Chromium binary, which exited
before creating a page:

```text
FATAL:chrome/browser/process_singleton_posix.cc:297
Check failed: . socket() failed: Operation not permitted (1)
```

The supported shared browser was also tried against the running `dist/`
server at `http://127.0.0.1:8000/stitch.html?from=home`; it displayed
`{"detail":"Missing or invalid bearer token."}` rather than the application.
It does not have access to this executor's local server. Neither attempt
produced a usable chart, a trace or a latency result. No permission bypass
was attempted.

Before shipping any preload or deferral, run both asset modes, real
service-worker cold install and offline reopen, navigation from Home, direct
IDs and a legacy compact `.p` project. Inject CDN and entry failures and prove
recovery. Mark immediately, undo, redo, flush and reopen; exercise lazy Help,
backup, import and sync offline. Use the existing service-worker lifecycle
suite (`npm run test:sw`) for cache consistency and the navigation/load/session
browser suites for durable data. A local mirrored run supplements rather than
replaces a live-network/device check.

There is no user-visible change, so the help, app changelog and generated
application assets are unchanged. The report and harness live under existing
non-deployment directories; no new directory exclusion is needed.

## Follow-up audit of the draft

The audit covered all three changed files. It found and fixed defects in the
measurement tooling; no application runtime changes were introduced:

| Finding | Correction and regression coverage |
| --- | --- |
| Trace totals included unload/late work and matched thread IDs without process IDs; nested aliases could inflate compile/render time | Bound to navigation-specific User Timing marks, match process plus thread, clip and union durations; synthetic traces cover pre/post-window work, PID collisions and nesting |
| Warm reload inherited journals, sessions and migrations from cold; seed omitted real storage dependencies | Restore disposable storage before both navigations; include progress-units and tracking-sync; test deletion and preference isolation |
| A background/hidden chart or missing font could count as usable | Require font success and visible chart geometry, recheck next frame; test delayed/failed fonts and a chart hidden between frames |
| Post-readiness reads/completions could produce negative hydration intervals or inflate startup storage time | Select only successful reads completed by readiness; bound async completion records; test failed/late reads and immutable snapshots |
| HTTP failures could be missed; gzip;q=0 was ignored and responses lacked Vary | Reject failed required-resource requests; honour encoding negotiation and Vary; test uncompressed, compressed and HEAD responses with exact SRI |
| Resource cleanup could stop if browser.close failed; launch was outside the main cleanup guard | Guard launch and close context/browser/server with nested finally; test launch, page and close failures |
| Env-mutating tests, truthy CANDIDATE=0, invalid repeats and even-run median | Use explicit handler configuration, validate env and calculate median correctly; regression tests cover each |
| Output identified HEAD but not the served build | Record dirty state and hashes of actual transformed HTML, entry and worker; check again before saving results; test baseline/candidate HTML fingerprints |

Chromium was retried after the fixes with a writable workspace TMPDIR and
still failed at the same denied socket operation before creating a page.
The runner remains browser-unverified; neither this audit nor its tests
establishes startup latency or offline acceptance.
