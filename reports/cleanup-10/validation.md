# PR 10 — Tracker unread local bindings (F-014)

Base: `74e506ce6d487ca22f5d7a878f9cbe860c846770`, latest fetched `origin/main` at start.
Prerequisites are merged ancestors: #362 (01), #363 (02), #364 (03), #365 (04).
The original checkout on `work` was left untouched; implementation uses a new worktree.

## Candidates and preservation

- `allParkLayersHidden` (2248): no references or reassignments in the TrackerApp lexical scope, including nested closures, JSX, computed expressions, registrations, aliases, returned objects or global exports. Only the `const` binding is removed. The `useMemo` call, callback body, property enumeration/accesses and dependency evaluation remain byte-equivalent AST expressions at the same position. No hook or memo computation was removed.
- `setAllParkLayersVisible` (2254–2261): unreferenced local function declaration, not a hook result. No caller, escape, self-reference, getter, property access or initializer executes at declaration time. The function body (including its state updater) was never invoked. Removing the declaration removes no observable operation; the function object had no observer. No public contract is changed.
- `toggleParkLayer`: retained; the parking legend checkbox calls it (9281 on base).
- `liveParkMarkersRef`, `liveParkKey`, `totalParkedColours`, `parkCountsByColour`, `parkLayers`, and all hook invocations are retained. Other unread locals outside the audited block are deferred to keep this PR targeted.

`node reports/cleanup-10/binding-audit.cjs` runs Babel scope analysis and compares all 482 hook-call expressions in TrackerApp and its nested functions, in traversal order, against the exact base. Results are in `binding-audit.json`; these are static call sites, not a runtime hook count. Both candidates have zero reads and writes; the remaining toggle retains one reference. No direct eval/Function calls exist in TrackerApp's subtree. Whole-repository name searches found only the candidate declarations outside generated output. Lexical const/function locals cannot be reached by external computed global keys. TrackerApp itself remains exported.

## Loading and consumers

`stitch.html` loads React, shared globals, runtime loaders, tracker hooks, minimap/layer components, then loads `compiled/tracker-app.compiled.js` through `window.loadScript`. `creator-main.js` also consumes the existing `window.TrackerApp` for embedded tracking. `build-runtime-js.js` wraps the entry in an IIFE. Neither local escapes this boundary. Runtime output was rebuilt, then `build-sw.js` regenerated only the Tracker asset fingerprint and aggregate build ID. Other compiled entries are unchanged.

## Validation

Node 22.23.3 was installed in the task workspace for CI parity; existing dependency versions/lockfile were unchanged. Jest uses two workers in parallel. Browser tests use installed `/usr/bin/chromium`, local CDN fixtures, blocked service workers, a fresh owned server on port 8010 and the PR 04 lifecycle configuration with only the Chromium executable overridden.

The Tracker lifecycle case now additionally checks committed hook structure, stable ref objects and callback identity when dependencies are unchanged across preference updates and isActive rerenders. It enables automatic snapshots via UserPrefs, navigates Home and back to Tracker, and checks saved progress. This extends existing coverage of marking, undo, persistence, reload, subscription balance, BroadcastChannel closure, interval/frame cleanup and post-unmount save fallback. React fibre introspection is test-only and tied to the current React 18 implementation; it introduces no production global.

Base browser runs explicitly overlay the base compiled Tracker and supporting assets through the existing BENCH_SOURCE_ROOT helper. All other assets are unchanged. The enhanced four-case Chromium lifecycle suite passed on base (4/4) and head (4/4). Creator comparison, Stats and Home/Stash are focused adjacent smoke checks, not exhaustive product validation. Browser elapsed times are not performance measurements.

Commands:

- `npm test -- --ci --maxWorkers=2`: base 387 suites passed, 1 skipped; 5464 tests passed, 4 skipped; 1 snapshot passed. Head identical: 387 suites passed, 1 skipped; 5464 tests passed, 4 skipped; 1 snapshot passed.
- `npm run lint:terminology`: base and head passed.
- `npm run lint:css-tokens`: base and head exit 0; the same 13 existing advisory findings remain.
- `node build-runtime-js.js --check`, `node build-sw.js --check`: base and head passed.
- `node scripts/check-generated-bundles.js`: head passed.
- `git diff --check`: passed.
- `E2E_LOCAL_CDN=1 node node_modules/@playwright/test/cli.js test --config=<scratch Chromium lifecycle config>`: base/head 4 passed each; baseline uses `BENCH_SOURCE_ROOT=<base asset directory>`.

Early sandboxed attempts could not bind network sockets or spawn generator subprocesses. These were rerun with supported network permission. Preliminary overlapping Node 24 Jest runs were interrupted after a PDF timeout; they are not used as validation evidence. The completed Node 22 runs are the evidence.

## Limits and impact review

No user-visible behaviour is intended, so help/changelog stay unchanged. No PDF sources, storage formats, workers, preference keys or globals changed. PK byte comparison was not required/run. Firefox/WebKit, full touch/mobile matrices and offline service-worker execution were not run. SW integrity is checked by fingerprints and Jest; browser tests block service workers.

Home/navigation, Creator, Stash/library and Stats have focused browser smoke coverage. Tracker marking/undo/save/reopen/preference lifecycle is exercised. Imports use the existing real JSON import fixture. Conversion/materials, recovery, export/backup/sync and experimental tools have no modified consumers or interfaces; their browser flows were inspected for scope only, not exercised. Full Jest covers their existing unit tests. No performance improvement is claimed: hook allocations and computation remain intact; only an inaccessible helper allocation is eliminated.
