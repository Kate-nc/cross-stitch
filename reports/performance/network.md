# Performance Audit — Agent 3: Network & Data Fetching

> Read-only audit. Branch: `performance-upgrades-2`. Captured 2026-05-06.
> Scoring uses the I0–I4 scale defined in [reports/00_PERFORMANCE_CONTEXT.md](../00_PERFORMANCE_CONTEXT.md#6-shared-impact-scale-referenced-by-every-agent).
> Cross-references the baseline numbers in [reports/00_PERFORMANCE_CONTEXT.md](../00_PERFORMANCE_CONTEXT.md).

The app has **no backend HTTP API of its own**. "Network" here means:
1. The CDN-hosted runtime (React, ReactDOM, Babel Standalone, pako, pdf-lib, pdf.js).
2. The service worker precache list in [sw.js](../../sw.js).
3. The static asset payload (large SVGs, fonts, pdf worker, fontkit).
4. IndexedDB read patterns that masquerade as "fetches" (most reads are full-project loads inside loops).
5. The optional file-based [sync-engine.js](../../sync-engine.js) (no HTTP — `.csync` files round-trip via the user's cloud drive).

---

## Top 3 (read this first)

1. **N+1 IndexedDB read storm on `/stats` and several dashboard surfaces.** Four `ProjectStorage.*` aggregators (`getLifetimeStitches`, `getOldestWIP`, `getMostUsedColours`, `getOldestWIPs`) each independently call `listProjects()` then loop `await this.get(meta.id)` per project. Stats-page fires all four in parallel ([stats-page.js](../../stats-page.js#L1046-L1054)) so a user with N projects pays roughly **4×N full-project IDB reads** on every dashboard mount, each deserialising the whole `pattern` array. **I1**.
2. **Service-worker install eagerly precaches ~2.0 MB of "PDF only" assets** every user pays even if they never export to PDF: `pdf.worker.min.js` (1062 KB), `assets/fontkit.umd.min.js` (741 KB), `assets/CrossStitchSymbols.*`, plus the CDN `pdf-lib` (~283 KB) and `pdf.min.js` (~329 KB) URLs. The precache list also includes `tracker-app.js` (434 KB) and `manager-app.js` for users who only ever visit `/home` or `/create`. **I1**.
3. **`assets/Books and Blossoms - BW.svg` (2,624 KB) is in `assets/` but referenced by zero application code** — only by [reports/00_PERFORMANCE_CONTEXT.md](../00_PERFORMANCE_CONTEXT.md#L55) (which flagged it). It is not in the SW precache list and is not served, but it is in `assets/` where the casual reader assumes everything ships. Confirms the file is dead weight in the working tree (Agent 9 territory) but worth flagging here because if anyone ever adds it to the precache list by mistake it would *triple* the install payload. **I3**.

---

## Findings

### I1 — High impact

#### N1. N+1 full-project loads from `ProjectStorage` aggregators
- **Files:** [project-storage.js](../../project-storage.js#L709-L817), [project-storage.js](../../project-storage.js#L915-L935), [stats-page.js](../../stats-page.js#L1046-L1054).
- **Problem:** `getLifetimeStitches`, `getStitchLogByDay`, `getOldestWIP`, `getOldestWIPs`, and `getMostUsedColours` each call `listProjects()` (cheap — reads `project_meta` only) and then iterate the result calling `await this.get(meta.id)` (expensive — full `pattern` array). On `/stats` four of these run in parallel without sharing data; with N projects this is roughly 4N full reads. The data each one needs (stitchLog, finishStatus, palette, lastTouchedAt, pattern cells for blend splitting) is a strict subset of one full project — a single shared loop could service all five.
- **Why it matters:** Each full read deserialises a `pattern` array of `w*h` cells. For an 80×80 chart that's ~6,400 cell objects per project per call. The repo already caches `totalStitches` and `completedStitches` per pattern via `WeakMap` ([project-storage.js](../../project-storage.js#L18-L46)) but the IDB read itself is unavoidable per-call.
- **Measurement method:** In DevTools Application > IndexedDB, wrap `ProjectStorage.get` to count calls; load `/stats` and observe the count is `~4 × project_count`. Then time the `await Promise.all([...])` block at [stats-page.js](../../stats-page.js#L1046) before/after consolidating into a single shared "load all full projects once, derive everything else" helper. Expected improvement: ~75% reduction in reads, plus less garbage from re-deserialised pattern arrays.
- **Suggested fix (one-line summary; not implementing):** add a `ProjectStorage.getAllFullProjects()` cached helper (memoise on `(project_count, max(updatedAt))` like the existing `__csMostUsedCache` at [project-storage.js](../../project-storage.js#L805-L808)) and rewrite the five aggregators to derive their result from the shared array.

#### N2. Service-worker precache list ships ~2 MB of opt-in assets to every user
- **File:** [sw.js](../../sw.js#L2-L69).
- **Problem:** `PRECACHE_URLS` is one undifferentiated cache-first list. On install (and on every `CACHE_NAME` bump — currently v41) the SW eagerly downloads:
  - PDF export stack: `pdf.worker.min.js` (1062 KB), `assets/fontkit.umd.min.js` (741 KB), CDN `pdf-lib` (~283 KB), CDN `pdf.min.js` (~329 KB), `assets/fonts/CrossStitchSymbols.base64.js` (14 KB), `.ttf` (10 KB), `pdf-export-worker.js`, `pdf-importer.js`. Combined ≈ **2.4 MB**.
  - Tool-specific bundles: `tracker-app.js` (434 KB), `manager-app.js`, `creator/bundle.js` (854 KB), `creator-main.js` (88 KB).
  - Sync surface: `sync-engine.js` (cloud-sync feature most users never touch).
  - `import-engine/bundle.js` (~126 KB) — already lazy-loaded at runtime via [import-engine/lazy-shim.js](../../import-engine/lazy-shim.js); precaching it forces the eager download anyway.
- A `/home`-only visitor on first load thus pays the bandwidth cost for Tracker, Manager, Creator, full PDF export stack, and import engine before any of those tabs are opened.
- **Measurement method:** In DevTools Application > Service Workers, click "Update" then watch Network panel filtered by "from ServiceWorker"; sum the transfer column for the install event. Compare against a stripped precache that only includes the page the user is actually visiting plus shared chrome (`styles.css`, `dmc-data.js`, `helpers.js`, `icons.js`, `header.js`, `home-screen.js`, `home-app.js`, the React/Babel/pako CDN trio).
- **Suggested fix:** split into `CORE_PRECACHE` (always cached on install) and `LAZY_RUNTIME_CACHE` (cached on first fetch via the existing stale-while-revalidate fall-through at [sw.js](../../sw.js#L195-L215)). Move the PDF stack and the tool-specific bundles to lazy.
- **Risk note:** the offline-first promise weakens slightly — a user who installs offline and then flies on a plane won't have the Tracker bundle. Mitigation: warm the lazy cache from `requestIdleCallback` on the relevant page (e.g. `home-app.js` warms tracker on idle). The existing `<link rel="prefetch" href="tracker-app.js">` on [create.html](../../create.html#L46) already proves the pattern.

#### N3. CDN scripts have no Subresource Integrity (SRI) and are not pinned for long-term HTTP cache
- **Files:** [home.html](../../home.html#L21-L25), [create.html](../../create.html#L60-L70), [stitch.html](../../stitch.html), [manager.html](../../manager.html), [index.html](../../index.html), [embroidery.html](../../embroidery.html).
- **Problem:** None of the six CDN scripts (React 18.2.0, ReactDOM 18.2.0, Babel Standalone 7.23.9, pako 2.1.0, pdf-lib 1.17.1, pdf.js 3.11.174) carry an `integrity=` attribute. cdnjs serves these immutably-versioned URLs with a long `Cache-Control: public, max-age=31536000, immutable`, so the HTTP cache *should* hold them for a year — but without SRI the browser cannot verify the cached bytes against a hash the page asserts, so any tampering goes unnoticed and (relevant to this audit) the page can't get the security-quality benefits of a long-term shared HTTP cache that depends on hash equality.
- **Measurement method:** Open DevTools Network panel on a cold-cache load of `/home`, sort by Initiator, confirm each cdnjs URL is "from disk cache" on a warm reload (it already is). Then check `chrome://net-internals/#hsts` style validation of integrity — there is no integrity guarantee; document this as the trade-off.
- **Suggested fix:** add `integrity="sha384-..."` and `crossorigin="anonymous"` to each CDN tag. Hashes are reproducible from the cdnjs pages. This is mostly a security/hygiene improvement (hence I1 not I0) but it also enables Vercel's edge to cache hash-tagged responses more aggressively if the project ever proxies them.
- **Alternative:** self-host the six libraries under `assets/vendor/` (combined ~870 KB minified; React 42 KB, ReactDOM 130 KB, Babel 313 KB, pako 47 KB, pdf-lib 283 KB, pdf.js 329 KB). Removes the third-party origin entirely (better LCP because no second TLS handshake needed), enables CSP tightening (drop `https://cdnjs.cloudflare.com` from `script-src`/`connect-src`), and lets the SW precache them under same-origin cache rules. Trade-off: ~870 KB added to repo and to the same-origin install payload — but the SW already precaches them via the cdnjs URL, so the bytes are downloaded either way; the only delta is repo size and the loss of a shared cache hit if the user visited another cdnjs-using site recently (rare for this niche audience).

#### N4. `stash-bridge.js` does not cache `manager_state` reads inside a single dashboard render
- **File:** [stash-bridge.js](../../stash-bridge.js#L130-L765).
- **Problem:** The module performs ~12 separate `store.get("threads")` calls and ~5 separate `store.get("patterns")` calls across its public methods. The Manager dashboard and `/stats` call several of these in succession (e.g. `getGlobalStash`, `getStashAgeDistribution`, `getAcquisitionTimeseries`, `getManagerPatterns` from [stats-page.js](../../stats-page.js#L1048-L1055)). Each one opens a fresh transaction.
- **Why it matters:** `stitch_manager_db` is small (one row per store) so each read is cheap, but transaction setup + structured-clone of the entire threads object on every call is non-trivial when N stash entries grow to thousands. There's also no in-flight de-duplication so two callers in the same tick double-fetch.
- **Measurement method:** Wrap `IDBObjectStore.prototype.get` with a counter; load `/stats` and observe ≥10 `manager_state` reads. Then add a 250 ms in-memory cache keyed by `("threads"|"patterns")` invalidated on any write — should drop to 2 reads per dashboard mount.
- **Suggested fix:** add a tiny shared promise cache at the top of `stash-bridge.js` that returns the same `Promise<threads>` / `Promise<patterns>` to concurrent callers within the same task. Invalidate on writes (the module already has all the write paths centralised).

### I2 — Medium impact

#### N5. Babel Standalone (~313 KB gzipped) blocks `<head>` parsing on every page load
- **Files:** all five HTML entry points (e.g. [home.html](../../home.html#L24), [create.html](../../create.html#L62)).
- **Problem:** Loaded as a non-`defer`, non-`async` `<script>` so HTML parsing pauses while it downloads + parses Babel Standalone. The repo already caches the *output* of Babel transforms in localStorage ([create.html](../../create.html#L150-L165)) but the Babel script itself is still fetched and executed on every page load — even on a warm cache where every transform is a hit and Babel is never invoked.
- **Why it can't be deferred:** Babel must be present before the inline `loadTrackerApp()`/`loadCreatorMain()` IIFEs that may need to run a transform on a cache miss.
- **Measurement method:** Lighthouse "Total Blocking Time" before/after wrapping the Babel `<script>` in a guard that only injects it if `localStorage.getItem(TRACKER_CACHE_KEY) == null` (i.e. cold cache). Expected savings: ~150 ms TBT on warm-cache loads on a mid-range mobile device.
- **Suggested fix:** add a `babel-loader-shim.js` that lazily injects Babel only when a cached transform is missing. Cross-cuts with Agent 1.
- **Score:** I2 because the workaround (cache hit common) already exists; the bytes are real but rarely block in steady state.

#### N6. `home-screen.js` is loaded on `/home` but its primary export is consumed by the Manager via [project-library.js](../../project-library.js)
- **Files:** [home.html](../../home.html#L55), [home-screen.js](../../home-screen.js).
- **Problem:** `MultiProjectDashboard` (the legacy home screen) is loaded into `/home` but `/home`'s actual UI is `home-app.js`. Per repo memory and [AGENTS.md](../../AGENTS.md) the legacy file is still required for `manager.html` (which uses `MultiProjectDashboard` via `project-library.js`). On `/home` it is dead weight in the script graph.
- **Measurement method:** `Get-Item home-screen.js | Select-Object -ExpandProperty Length` then check Coverage tab in DevTools on `/home` — confirm 0% executed.
- **Suggested fix:** drop the `<script src="home-screen.js">` tag from `home.html`. Verify that no `/home` code path references `MultiProjectDashboard`.

#### N7. SW navigation requests use `network-first` with `cache: 'no-cache'` — kills the SW's offline benefit for the HTML shell on a flaky mobile connection
- **File:** [sw.js](../../sw.js#L107-L130).
- **Problem:** Every navigation goes to the network first with `cache: 'no-cache'` (forcing a conditional revalidate even when the HTTP cache has a fresh copy). On a slow-3G connection or captive-portal-blocked Wi-Fi, the user sits with a blank screen until the network either returns or fails over to cache. Comments at [sw.js](../../sw.js#L168-L178) explain the change to network-first was made because stale HTML kept hiding bug-fix deploys; that reasoning is sound, but the additional `cache: 'no-cache'` flag means we don't even use the browser's local HTTP cache as an intermediate fast-path.
- **Measurement method:** Lighthouse with "Slow 4G" throttling on `/home` cold-load → `/home` reload; observe FCP for the second visit. Then drop `{ cache: 'no-cache' }` and remeasure.
- **Suggested fix:** drop the `cache: 'no-cache'` option on the navigation branch (let the browser HTTP cache handle 304s) but keep network-first ordering. Bug-fix deploys still get picked up because Vercel's `Cache-Control` on HTML is short.

#### N8. `getLifetimeStitches` and `getStitchLogByDay` use `await` inside a `for` loop — sequential IDB reads
- **Files:** [project-storage.js](../../project-storage.js#L709-L725), [project-storage.js](../../project-storage.js#L730-L755).
- **Problem:** `for (const meta of projects) { const proj = await this.get(meta.id); ... }` serialises N IDB reads when they could run in parallel. Same shape exists in `getOldestWIP` ([project-storage.js](../../project-storage.js#L765-L782)) and `getMostUsedColours` ([project-storage.js](../../project-storage.js#L815-L890)). `getOldestWIPs` ([project-storage.js](../../project-storage.js#L919-L926)) already does this correctly with `Promise.all(metas.map(m => this.get(m.id)))` — that pattern should be lifted into the others.
- **Measurement method:** Performance-tab recording of `/stats` mount; sum the `IDBRequest` "Pending" durations.
- **Suggested fix:** convert the four serial loops to `Promise.all`. (This is a partial mitigation for N1; the *real* fix is to share one full-project load — see N1.)

#### N9. `home-app.js` re-fetches the project list inside an event handler (re-renders re-trigger reads)
- **File:** [home-app.js](../../home-app.js#L907-L910).
- **Problem:** Spot-check: `listProjects()` is called in a `useEffect` on mount and again in change handlers (search via the matching site). Without a shared cache layer, frequent UI interactions can trigger redundant IDB reads for unchanged data.
- **Measurement method:** Wrap `ProjectStorage.listProjects` to count calls, interact with `/home` for 30 s, observe call count. (I did not run this — flagging for the implementer.)
- **Suggested fix:** memoise `listProjects` results behind a 1-second TTL or invalidate-on-write cache.

### I3 — Low / opportunistic

#### N10. CDN preconnect is correct but missing on [stitch.html](../../stitch.html) (verified — only `preconnect` is present), no `rel=preload` on the largest local assets
- Adding `<link rel="preload" as="script" href="creator/bundle.js">` to [create.html](../../create.html) would parallelise the bundle fetch with the React/Babel/pako downloads. Trivial change, mid-single-digit-ms FCP win at most.

#### N11. `assets/Books and Blossoms - BW.svg` (2,624 KB) is unreferenced anywhere outside [reports/](../../reports) — see Top 3 #3.
- Action belongs to Agent 9 (repo cleanup) but flagged here so nobody mistakenly adds it to the SW precache.

#### N12. `manifest.json` icon list — confirm no oversized PNG icons. (Not opened during this audit; quick check recommended.)

#### N13. Backup-restore loads the entire DB into one in-memory JSON string, then optionally pako-deflates and base64-encodes it ([backup-restore.js](../../backup-restore.js#L40-L65)). For a user with many large projects this can spike memory by 3-5× the on-disk DB size during the chunked `String.fromCharCode.apply` + `btoa` sequence.
- The code already chunks at 32 KB to avoid stack overflow but does not stream. Could be migrated to a `Blob` + `Response.body` `ReadableStream` pipeline so the JSON string never fully materialises. **I3** because this only runs on the user-initiated "Export backup" action and most users do it rarely; not a steady-state perf cost.

### I4 — Hygiene / nice-to-have

#### N14. `vercel.json` — confirm long-term `Cache-Control: public, max-age=31536000, immutable` on `creator/bundle.js`, `tracker-app.js`, `manager-app.js`, fonts, fontkit, pdf worker. (Not opened during this audit — quick check recommended; if missing, the SW masks it but direct CDN visitors don't benefit.)

#### N15. `pdf.worker.min.js` and `pdf-lib` versions in the SW precache list and in the inline `loadPdfStack` ([create.html](../../create.html#L121-L130)) must stay in lockstep with the corresponding cdnjs URLs. There is no test asserting they match — if they drift, the cache becomes mixed-version. Add an assertion in `tests/swPrecache.test.js`.

#### N16. The existing `<link rel="prefetch">` tags on [create.html](../../create.html#L46-L52) reference `tracker-app.js`, `pdf-lib` CDN, `pdf-export-worker.js`, `creator-main.js`, `stats-page.js`, `stats-activity.js` — verify these are still the right list (e.g. `stats-activity.js` may be superseded; this audit did not validate each one).

---

## What I deliberately did NOT investigate

- React render performance on home tiles (Agent 2).
- Image processing in [embroidery.js](../../embroidery.js) (Agent 4 / image pipeline).
- `creator/bundle.js` size composition (Agent 1 — bundling).
- Whether `TestUploads/` should be in git (Agent 9).
- Whether the 257 reports under `reports/` are stale (Agent 8).

---

## Confirmation

This file is the only artefact created or modified by Agent 3.
