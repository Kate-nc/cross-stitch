# Atomic, recoverable application updates

## Asset contract

The required offline set is the five stable HTML entry points, their eager
scripts/styles, compiled Creator/Tracker/Manager entry points, shared catalogues,
project-storage helpers, Stats modules, generation/analysis/import workers, and
existing offline help/import/backup dependencies. React, ReactDOM, Pako, JSZip
and the pinned PDF.js modules are required too. Missing a startup helper can
throw before React mounts; loading HTML alone is not a successful installation.

Experimental embroidery, fontkit and the PDF export worker's separate source
modules/library are optional on first use. Their local bytes are fingerprinted,
and the CDN library is integrity-pinned. They can fail offline before first use;
a newer deployment cannot silently supply different local code to an old build.
No changes were made to the Pattern Keeper PDF implementation.

`build-sw.js` embeds SHA-256 for local files and SRI for all CDN dependencies in
`sw.js`. Its build identity includes the manifest and worker logic, so even a
change without a manual cache-version bump produces a different candidate.
The existing `cross-stitch-cache-vN` convention is retained (v70), with build
identity and, for subpath deployments, a scope suffix. Query strings do not
create extra asset copies. `/`, `/home`, `/create`, `/stitch`, `/manager` and the
original `.html` URLs resolve to the corresponding cached entry points.

## State transitions

1. Installation writes only its candidate. Every required fetch must succeed,
   reject redirects and opaque responses, and match its expected bytes. Writes
   are sequential, so failure cleanup cannot race outstanding writes.
2. A ready record is written last, then the required entries are checked. A
   rejected install deletes its candidate and never activates. Process death
   may leave an uncommitted cache; it cannot become a serving build.
3. The browser's normal waiting phase remains in place. There is no
   `skipWaiting`, forced reload, or `clients.claim`. Existing stitching/editing
   tabs keep their controller until all controlled app windows close.
4. Activation rechecks the completion record and required entries before
   cleaning up. Fetches use only the active worker's own build cache. Missing
   entries may be repaired only with that build's expected bytes; otherwise the
   request returns 503. Network-first mutation and cross-cache matching are gone.
5. Cleanup removes only caches owned by this application and deployment scope.
   It retains the current cache and one complete predecessor, removes abandoned
   candidates and older generations, and is idempotent. During the first upgrade
   from the old scheme, the newest numbered legacy cache is retained instead.

An uncontrolled first visit continues using its network-loaded scripts. It is
not claimed halfway through startup. Reopen/navigate after installation to get
the coherent offline build. An active tab must finish and close to permit an
update; a reload while another old tab remains intentionally serves the old
build. Repeated identical update checks do not install or reload anything.

## Recovery and storage boundaries

A failed/interrupted download preserves the active worker and its cache; reopen
that version offline or retry the update online. A retained predecessor is an
operational rollback resource, not an automatic per-file fallback: mixing its
files into a newer application would defeat validation. A hosting rollback to
that coherent release can reinstall/reuse its validated cache. When diagnosing,
inspect Cache Storage and the worker state without clearing site data.

The worker never opens or deletes IndexedDB and never changes localStorage.
`CrossStitchDB`, `stitch_manager_db`, sync metadata, project blobs and active
project pointers remain separate from application Cache Storage. Unrelated
Cache Storage names are excluded from cleanup.

The previously shipped v69 worker retains its original network-first behaviour
while it remains active; new code cannot change an already-running old worker.
The migration failure test verifies that its offline fallback survives a failed
candidate. The stronger byte-pinning contract begins when v70 naturally activates.
Browser storage eviction and user-cleared site data remain outside this lifecycle.

## Build and deployment

Run the existing source generators when applicable, then `node build-sw.js`
(`npm run build` includes it). Commit the generated worker. CI and the pre-commit
hook run `--check`; the automatic version-bump workflow regenerates the manifest
after modifying `version.js`. Vercel remains a static deployment with its existing
null build command, output directory, cache headers and rewrites unchanged.

## Validation evidence

- Full Jest run: 339 suites, 4,538 tests and one snapshot passed, using four
  workers. Focused lifecycle checks additionally cover cache-scope isolation,
  HTTP failures, fetch rejection, byte mismatch, incomplete activation,
  repeated activation/installation, aliases/queries, missing-entry repair,
  unrelated caches, and non-GET/user-file passthrough.
- Final focused run: 5 suites and 34 tests passed.
- Chromium uses a dedicated Playwright configuration with service workers
  enabled. Seven checks use real application files and real versioned CDN bytes from
  an isolated local mirror; React/DOM/Pako match the production SRI. The mirror
  affects transport only, keeping browser Request integrity validation active. Offline
  checks also shut off origin transport so worker fetches cannot evade the
  browser context's offline emulation.
- Browser checks cover missing required HTML, disconnected fetch, wrong build
  bytes, wrong CDN bytes, offline app mounts, two open tabs, no forced session
  reload, eventual activation after both tabs close, all stable offline routes
  including Stats, three sequential releases, bounded cache retention, repeated
  identical update checks, legacy migration failure, and real project saves.
- A Chromium DevTools Protocol stop of all service workers during a held
  installation exercises process interruption. A distinct retry succeeds and
  activation removes the interrupted candidate while retaining recovery.
- Separate bug-hunting pass found and fixed compiled/lazy/worker dependency
  omissions, unsafe first-visit claiming, global-cache matching/deletion,
  query-key cache growth, updates without cache-number bumps, deployment-scope
  interference, trailing-slash navigation resolving relative scripts in the
  wrong directory, and missing integrity on the PDF CDN modules. Storage sentinels
  and real saved projects survive both failed and successful upgrades.
- Runtime compiled output and creator bundles are current; terminology lint
  and whitespace checks pass. CSS token lint reports 13 existing advisory
  findings in unchanged `styles.css`.

Reproduce with `npm test -- --maxWorkers=4`, `npm run test:sw`,
`node build-sw.js --check` and `node build-runtime-js.js --check`. Browser tests
need installed Chromium and curl access to the pinned CDN URLs on their first
run; subsequent runs use mirrors under `work/sw-browser-cdn/`.
