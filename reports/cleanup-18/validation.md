# Cleanup 18 — pure sync merge helpers (F-012)

Base: `origin/main` at `c2f67497` (1.0.209). Node v22.22.0.

## What moved

`sync-engine.js` held, inside the `SyncEngine` closure, eleven pure record-merge functions that
`mergeTrackingProgress` is built from. They moved verbatim (checked by diffing the removed lines against the new
file) into `sync-merge-helpers.js`, published as the classic-script global `SyncMergeHelpers` (CommonJS export for
tests), the same pattern as `tracking-sync.js` and `tracking-merge.js`.

| Function | Observable through |
|---|---|
| `mergeDoneArrays`, `mergeSessions`, `mergeIndexedPairs`, `mergeStitchLogs` | `SyncEngine.*` (already exported) |
| `recomputeMergedTotals`, `mergeDeletedIds`, `_sumSessionSeconds`, `_earlierIso`, `_laterIso`, `mergeWorkArea` | `SyncEngine.mergeTrackingProgress` |
| `mergeParkingMarkers` | `mergeTrackingProgress` and `classifyProjects` ("identical" vs "merge-tracking") |

Chosen because none owns a scheduler, storage, an encryption key or a resource lifetime. The only outside value
they used was the module-level `_clone` (structuredClone or the JSON fallback, chosen when sync-engine.js loads).
`mergeIndexedPairs` and `mergeParkingMarkers` now take it as an explicit last argument, and sync-engine.js passes
its own `_clone`, so the choice stays where it was.

Left in place: `META_NEWEST_WINS` / `META_PREFER_PRESENT` and `mergeTrackingProgress` itself (it reads
`TrackingSync`, the metadata registers and overrides). The facade, `SyncEngine.*` exports, field order, error
messages and sync v1/v2 behaviour are unchanged. `sync-engine.js` keeps thin wrappers with the original function
names, so the internal call sites and the facade object are textually unchanged. The helpers are looked up when
called, like `TrackingSync`, so no load-time dependency and no new asynchronous boundary.

## Loading contexts

- `home`, `index`, `create`, `stitch`, `manager` `.html`: `<script src="sync-merge-helpers.js">` immediately before
  `sync-engine.js` (the only five loaders; no worker, lazy loader or `loadScript` references `sync-engine.js`).
- `sw.js`: added to `PRECACHE_URLS`; fingerprints regenerated with `node build-sw.js`.
- Jest: `tests/setup/progress-units.js` sets the global (as it does for `TrackingSync`); the two `vm` harnesses that
  list script files (`tests/support/webdav-device.js`, `tests/syncProtocolSemantics.test.js`) load it.
- No creator bundle, runtime-JS or import-bundle inputs changed, so those generators were not needed.

## Evidence

| Check | Result |
|---|---|
| Characterisation battery (107 cases) generated on the pristine base, replayed on head | 107/107 identical, in Jest and in Chromium |
| Differential base vs head: battery plus 4000 seeded random iterations of six call shapes (24 000 comparisons), comparing value, error name and message, argument mutation and result identity | `reports/cleanup-18/differential-output.txt`: agree on every case |
| Sensitivity of the above | five deliberate one-token breakages: the battery caught four; the fifth is an equivalent mutant |
| Real pages in Chromium (all five load `SyncMergeHelpers` before `SyncEngine`, facade works, no page errors) | `page-smoke-output.txt` |
| Playwright `webdav-sync.spec.js` (real browser profiles, local WebDAV server) | 4/4 pass on base and on head |
| Playwright `cross-tab-merge.spec.js` | 3 of 4 fail identically on base and head (unrelated: `tracking-merge.js`) |
| Jest, full suite, parallel | base: 394 passed + 1 skipped suites, 5656 tests; head: 396 passed + 1 skipped, 5781 tests |
| `node build-runtime-js.js --check`, `node build-sw.js --check`, `npm run lint:terminology`, `git diff --check` | clean |
| `npm run lint:css-tokens` | prints the same non-blocking warnings as base |
| `mergeTrackingProgress` micro-benchmark (900-cell chart, 150-session journals, 12 merges, three alternating runs) | base 401.6/404.4/401.4 ms, head 384.9/394.8/405.8 ms: no measurable difference |
| Size | `sync-engine.js` 234 852 → 226 245 bytes; new file 11 630 bytes |

## Limitations

- One battery case (sorting sessions whose dates do not parse, so the comparator returns NaN) gives different
  orders in Node's V8 and in Chromium's. It is not in the committed golden; the differential run covers it
  base-vs-head on one engine.
- cdnjs is unreachable from this environment. Browser runs used the repo's `E2E_LOCAL_CDN=1` shim and Chromium
  1194 from `/opt/pw-browsers` (the npm Playwright expects a newer build, so a scratch config pointed at the
  installed executable).
- `tests/service-worker/lifecycle.spec.js` downloads CDN files with curl at start-up and could not run. Precache
  coverage here is `tests/swPrecacheSync.test.js`, `build-sw.js --check`, and the new loading test.
- Folder watching (File System Access API) is not drivable headless; its pure logic is in untouched code and its
  Jest suites pass.
