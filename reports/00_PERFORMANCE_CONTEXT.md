# 00 — Performance Context (Baseline Snapshot)

> Single source of truth for the May 2026 Performance & Cleanup audit.
> All Phase 1 / Phase 2 agents reference these numbers. Nobody overwrites them.
> The "after" snapshot is captured separately, after implementation, using the same commands.

Captured: **2026-05-06**, branch `performance-upgrades-2`, Windows / PowerShell 5.1.

---

## 1. Framework, bundler, and runtime

| Aspect | Value |
|---|---|
| App type | **Client-side PWA**. No SSR. Five HTML entry points (`home.html`, `index.html`, `create.html`, `stitch.html`, `manager.html`). |
| Framework | React 18 + Babel Standalone, both loaded from CDN. **All JSX is transpiled in the browser at runtime** — no React build step. |
| Module system | None at runtime. Every script is a classic `<script>` tag exposing `window.*` globals. No `import` / `export` / `require` in app code. |
| "Bundler" | A custom Node script: [build-creator-bundle.js](../build-creator-bundle.js) **concatenates** the 44 files in [creator/](../creator/) into [creator/bundle.js](../creator/bundle.js). No minification, no tree-shaking, no source maps. A second script ([build-import-bundle.js](../build-import-bundle.js)) does the same for the import wizard. |
| Service worker | [sw.js](../sw.js) precaches a static asset list keyed by `CACHE_NAME` (currently v40-ish — verify in file). [sw-register.js](../sw-register.js) reloads the page on `controllerchange`. |
| Package manager | **npm 10.9.0** (lockfile: `package-lock.json`, 186 KB). |
| Node | **v22.12.0**. |
| Production "build" | `node build-creator-bundle.js` (also runs the import-wizard build inline). There is no `npm run build` for the app itself — files are served as-is. |
| Min. supported browsers | Modern evergreen (Chrome / Edge / Safari / Firefox). Service worker + IndexedDB v4 + ES2022 features used freely. No IE / no legacy mobile WebView guarantees. |

## 2. Source layout summary

| Bucket | Count | Notes |
|---|---|---|
| Repo root `.js` files | **54** | Each loaded as a separate `<script>`. See `create.html` for canonical load order. |
| `creator/*.js` source files | **44** | All concatenated into `creator/bundle.js`. **Never edit `bundle.js` directly.** |
| `<script>` tags across all 5 HTML entry points | **235** | High — Phase 1 Agent 1 should investigate dedup / deferred loading. |
| Total tracked files (excl. `.git`, `node_modules`) | **629** | |
| Reports under `reports/` | **257 files** | Phase 2 Agent 8 priority — audit which are stale. |

## 3. Baseline metrics (the "before" snapshot)

| Metric | Value | How it was measured |
|---|---|---|
| `creator/bundle.js` size (concat output, unminified) | **874,048 bytes / 853.6 KB** | `Get-Item creator\bundle.js` after `node build-creator-bundle.js` |
| `creator/import-wizard-bundle.js` size | **30,298 bytes / 29.6 KB** | same |
| Build time (`node build-creator-bundle.js`) | **151 ms** | `Measure-Command { node build-creator-bundle.js }` |
| Jest test suite (`npm test -- --runInBand --silent`) | **5,588 ms** for 1,509 tests / 135 suites | `Measure-Command { npm test --silent ... }` |
| `node_modules/` size | **238.52 MB** across **265 top-level packages** | `Get-ChildItem node_modules -Recurse -File` |
| Total dependency count (`npm audit --json` total) | **375** packages | `npm audit --json` |
| `npm audit` vulnerabilities | **0** (clean) | `npm audit --json` |
| `.git/` size | **107.10 MB** | `Get-ChildItem .git -Recurse -File` |
| Repository working tree size (excl. `.git`, `node_modules`) | **25.40 MB** (26,634,378 bytes) | as above |
| Tracked file count | 629 | as above |

### Top 10 largest tracked files

| KB | Path | Notes |
|---:|---|---|
| 8,077 | `TestUploads/Books and Blossoms.pdf` | **Test fixture in source tree.** Candidate for Git LFS or removal — see Agent 9. |
| 2,624 | `assets/Books and Blossoms - BW.svg` | Single SVG asset. Verify it ships to users. |
| 1,784 | `TestUploads/exported_pattern.pdf` | Test fixture. |
| 1,385 | `TestUploads/PAT2171_2.pdf` | Test fixture. |
| 1,062 | `pdf.worker.min.js` | pdf.js worker, served at runtime. |
| 854 | `creator/bundle.js` | Generated artifact — **also tracked in git** (see "Known pain points" below). |
| 741 | `assets/fontkit.umd.min.js` | Used by PDF export. |
| 434 | `tracker-app.js` | Single-file React tree, JSX transpiled at runtime. |
| 342 | `TestUploads/PAT1968_2.pdf` | Test fixture. |
| 250 | `styles.css` | 6,500+ lines. |

### Largest blobs ever in git history

A historical blob `Books and Blossoms - 5mm color.pdf` is **20.4 MB** and sits in the pack. `creator/bundle.js` appears dozens of times in history (every regen is a new blob). These two together explain the 107 MB `.git`.

## 4. Performance probes already in the repo

- `npm run perf:baseline` → `playwright test --project=perf-desktop`
- `npm run perf:mobile` → `playwright test --project=perf-mobile`
- Existing reports: [reports/perf-baseline-1-measurements.md](perf-baseline-1-measurements.md), [perf-baseline-2-profiles.md](perf-baseline-2-profiles.md), [perf-baseline-3-new-lag-diagnosis.md](perf-baseline-3-new-lag-diagnosis.md), [perf-results-1-final-measurements.md](perf-results-1-final-measurements.md). Phase 2 Agent 8 should grade these for staleness.

## 5. Known pain points (priority targets)

These are inferred from the architecture itself, not from a user complaint — agents should treat them as starting hypotheses, not facts.

1. **Babel Standalone runs in the browser on every page load.** Every `.js` file under a `type="text/babel"` tag is parsed by Babel at startup. The repo mitigates this with a hand-rolled cache (`babel_creator_*` keys in `index.html`), but the underlying cost is real on first load and on cache-bust.
2. **`creator/bundle.js` is regenerated and committed**, contributing to repo size growth (see `.git` 107 MB). Generated artifacts in source control.
3. **`TestUploads/` ships ~13 MB of binary PDF fixtures** in the working tree. They are not served to users but they bloat clones, the working tree, and any IDE indexer.
4. **`reports/` directory has 257 files** including many superseded audits, wireframe sets, and per-area working notes. Phase 2 Agent 8 should grade them.
5. **235 `<script>` tags across 5 HTML pages** — heavy script-graph at startup; lots of small files individually fetched (mitigated only by SW cache after first visit).
6. **`styles.css` is 6,517 lines / 250 KB**, monolithic, served on every page. No critical-CSS split.
7. **`tracker-app.js` (434 KB) and `creator-main.js` (88 KB)** are inline-transpiled JSX that grew organically — likely re-render and memoisation hotspots (Agent 2 priority).

## 6. Shared impact scale (referenced by every agent)

| Score | Label | Definition |
|-------|-------|------------|
| **I0** | Critical | Directly causing user-visible lag, crashes, or build failures. Fix immediately. |
| **I1** | High | Measurably degrading performance (>100ms added latency, >50KB unnecessary bundle weight, >5s added build time). Fix soon. |
| **I2** | Medium | Contributing to gradual degradation or blocking future optimization. Fix when touching nearby code. |
| **I3** | Low | Minor inefficiency or cleanliness issue. Fix opportunistically. |
| **I4** | Hygiene | No measurable performance impact but reduces cognitive load, repo clutter, or maintenance burden. Batch and fix periodically. |

**Rule:** every I0–I2 finding MUST include a measurement method (a specific command or before/after metric).

## 7. Metrics not yet captured (deferred to "after" snapshot)

The following metrics were not collected in this baseline because they require a browser-driven harness; the orchestrator should run them on the same machine before committing changes for the after-comparison:

- Lighthouse score, LCP, INP, CLS, TBT for `home.html`, `create.html`, `stitch.html` (the heaviest pages).
- Total transfer size on first visit (no SW cache) for each entry page.
- `serve.js` cold-start time and any HMR equivalent (none today — this would have to be added).
- Per-chunk transfer breakdown, since there is no chunk graph.

If captured later, append them to a new `00_PERFORMANCE_CONTEXT_AFTER.md` rather than editing this file.
