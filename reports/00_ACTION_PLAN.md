# 00 — Prioritised Action Plan

> Synthesises the 6 performance + 4 cleanup audit reports into one decision document.
> **Nothing in this plan is executed.** Every change requires explicit human
> approval. The orchestrator does not delete files, modify code, or rewrite
> history. Cross-references throughout link back to the agent reports for full
> evidence and measurement methods.
>
> Source reports (read these for evidence):
>
> | # | Domain | Report |
> |---|---|---|
> | 1 | Bundle size & code splitting | [reports/performance/bundle-size.md](performance/bundle-size.md) |
> | 2 | Runtime rendering | [reports/performance/rendering.md](performance/rendering.md) |
> | 3 | Network & data | [reports/performance/network.md](performance/network.md) |
> | 4 | Build & dev pipeline | [reports/performance/build-pipeline.md](performance/build-pipeline.md) |
> | 5 | Dependency audit | [reports/performance/dependencies.md](performance/dependencies.md) |
> | 6 | Algorithmic patterns | [reports/performance/patterns.md](performance/patterns.md) |
> | 7 | Dead code | [reports/cleanup/dead-code.md](cleanup/dead-code.md) |
> | 8 | Stale reports/docs | [reports/cleanup/stale-artifacts.md](cleanup/stale-artifacts.md) |
> | 9 | Git & repo health | [reports/cleanup/repo-health.md](cleanup/repo-health.md) |
> | 10 | Config & tooling | [reports/cleanup/config-debt.md](cleanup/config-debt.md) |
> | — | Baseline metrics | [reports/00_PERFORMANCE_CONTEXT.md](00_PERFORMANCE_CONTEXT.md) |

---

## Headline numbers (potential, if all approved items shipped)

| Surface | Today | After plan | Source |
|---|---:|---:|---|
| `node_modules/` | 238.5 MB / 265 packages | **~75 MB / ~150 packages** | Agent 5 F1 + F2 |
| `.git/` | 107.1 MB | **~10–15 MB** (no history rewrite) | Agent 9 I0-1 |
| Working tree (excl. `.git`) | 25.4 MB | **~22 MB** (delete unused fixtures + SVG) | Agents 7, 9 |
| Reports/ files | 257 | **~92** (~165 archived to `reports/_archive/`) | Agent 8 |
| Per-page JS shipped (home) | ~1.2 MB | ~700 KB (split components.js, drop stats components from non-stats pages) | Agent 1 |
| Stats page mount cost | 4–5× full-DB read | 1× full-DB read | Agents 3, 6 |
| Jest local runtime | 5.6 s `--runInBand` (or 19.7 s if user follows AGENTS.md) | 5.2 s parallel | Agent 4 |

---

## Section 1 — Quick Wins

> **Criteria**: <30 min, zero risk of breakage, clear measurable improvement or clear clutter removal, no architectural decision.
> Each item is a single executable command or a tiny PR.

1. **`git gc --prune=now`** — recovers ~90 MB of `.git` storage (loose objects: 99 MB; pack: 7.7 MB; `prune-packable: 402`). Zero history change. Zero collaborator impact. Single command. *Verify*: `Get-ChildItem .git -Recurse -File | Measure-Object Length -Sum` before/after. Source: [Agent 9 I0-1](cleanup/repo-health.md#i0-1--git-is-99-mb-of-loose-objects--git-gc-recovers-90-mb).
2. **`npm prune`** — removes ~110 MB of *extraneous* `node_modules/` entries (`pdfjs-dist` 38.9 MB, `@napi-rs/canvas` 36.1 MB, `canvas` 35.1 MB) that are not in `package.json`. *Verify*: `Get-ChildItem node_modules -Recurse -File | Measure-Object Length -Sum` before/after. Source: [Agent 5 F1](performance/dependencies.md).
3. **Delete [assets/Books and Blossoms - BW.svg](../assets/Books%20and%20Blossoms%20-%20BW.svg) (2.6 MB)** — confirmed unreferenced in any `.js`/`.html`/`.css`/`.json`. Single `git rm`. Independently flagged by 3 agents. Source: [Agent 7 D-3.1](cleanup/dead-code.md#d-31-assetsbooks-and-blossoms---bwsvg--confirmed-dead-26-mb).
4. **Delete [TestUploads/exported_pattern.pdf](../TestUploads/exported_pattern.pdf) (1.8 MB)** — not referenced by [tests/perf/import.spec.js](../tests/perf/import.spec.js) or any other test. Source: [Agent 9 I1-3](cleanup/repo-health.md#i1-3--testuploads-cleanup--drop-unused-fixtures), [Agent 7 D-3.3](cleanup/dead-code.md).
5. **Delete [TestUploads/Books and Blossoms - 5mm color.pdf](../TestUploads/Books%20and%20Blossoms%20-%205mm%20color.pdf) (2-byte placeholder)** — documented as rejected by pdf.js. Source: [Agent 7 D-3.2](cleanup/dead-code.md).
6. **Delete 3 unused icons from [icons.js](../icons.js)** — `gridOverlay`, `shoppingCart`, `sync`. Confirmed via two-pass scan (catches dynamic `iconName: "..."` lookups). [tests/icons.test.js](../tests/icons.test.js) only checks *used* icons. Source: [Agent 7 D-4.1](cleanup/dead-code.md#d-41-three-unused-icons-in-iconsjs--confirmed-dead).
7. **Drop `npm test -- --runInBand` from local workflow** — measured 5.2 s parallel vs 19.7 s serial; the suite is parallel-safe. Update [AGENTS.md](../AGENTS.md) and [.github/copilot-instructions.md](../.github/copilot-instructions.md) to remove `--runInBand` from default examples (keep available for debugging). *Verify*: `Measure-Command { npm test --silent }`. Source: [Agent 4 top-1](performance/build-pipeline.md).
8. **Add the missing `.gitignore` entries** — `.DS_Store`, `Thumbs.db`, `.idea/`, `coverage/`, `.cache/`, `dist/`, `.env`, `.env.local`, `jest_inband.txt`, `*.tmp`, `*.swp`. Single PR; zero behaviour change. Source: [Agent 9 I2-1](cleanup/repo-health.md#i2-1--gitignore-gaps).
9. **Add `.gitattributes`** marking `creator/bundle.js`, `creator/import-wizard-bundle.js`, `import-engine/bundle.js`, `assets/fonts/CrossStitchSymbols.base64.js`, `pdf.worker.min.js`, `assets/fontkit.umd.min.js` as `linguist-generated=true -diff`. Stops GitHub showing diff churn. No history change. Source: [Agent 9 I1-2](cleanup/repo-health.md#i1-2--stop-committing-generated-artifacts).
10. **Remove the ~15 production `console.log`s on the import path** — [import-engine/wireApp.js](../import-engine/wireApp.js) ×9, [import-engine/ui/ImportReviewModal.js](../import-engine/ui/ImportReviewModal.js) ×4, [creator/useProjectIO.js](../creator/useProjectIO.js) ×2 — they serialise full project payloads on a UX-critical path. Either delete or guard behind a `DEBUG_IMPORT` flag in [user-prefs.js](../user-prefs.js). *Verify*: paste a >1 MB project import, compare wall-clock import time. Source: [Agent 6 top-3](performance/patterns.md).
11. **Swap `JSON.parse(JSON.stringify(srcProject))` for `structuredClone(srcProject)`** at [creator/adaptationEngine.js#L482](../creator/adaptationEngine.js#L482) — single-line change, 2–5× faster on >1 MB project payloads, already used elsewhere ([sync-engine.js#L11](../sync-engine.js#L11), [tracker-app.js#L8](../tracker-app.js#L8)). *Verify*: `console.time('clone')`/`console.timeEnd('clone')` around the call on a 200×200 project. Source: [Agent 6 top-2](performance/patterns.md).
12. **Self-host or SRI-pin the CDN scripts** (React, ReactDOM, Babel Standalone, pako, pdf-lib, pdf.js) — currently no `integrity=` attribute on any of the 5 HTML pages. Quickest path: add SRI hashes (5-min PR, no behaviour change). Bigger win = self-host under `assets/vendor/`. Source: [Agent 3 top-3](performance/network.md).

---

## Section 2 — Targeted Fixes

> Medium effort, clear path. Grouped by impact area, ordered within each group.

### 2A. Bundle weight (Agent 1)

| ID | Fix | Impact | Risk | Verify | Source |
|---|---|---|---|---|---|
| **2A.1** | **Split [components.js](../components.js)** (148 KB) into `components-core.js` + `components-stats.js`. ~700 of 2,280 lines are stats-only React components (`StatsDashboard`, `GlobalStatsDashboard`, `MonthCalendar`, `DailyBarChart`, `ColourTimeline`, `SectionGrid`, `ProjectComparison`). Load `-core` everywhere, `-stats` only on stats pages and home. | ~50 KB parse off home/manager landing | Low — pure module split | Lighthouse on [home.html](../home.html), TBT before/after | [Agent 1](performance/bundle-size.md) |
| **2A.2** | **Split [creator/bundle.js](../creator/bundle.js)** into 3 chunks loaded on tab activation: `creator-core` (Project, Pattern), `creator-prepare` (PrepareTab, MagicWandPanel, AdaptModal, adaptationEngine), `creator-export` (ExportTab, pdfChartLayout, zipBundle, RealisticCanvas). Mirror the existing `import-wizard-bundle.js` pattern. | ~35–45% of 854 KB deferred for users who never leave Project tab | Medium — touches build script and lazy-load wiring | Network panel: bytes sent on initial Creator load before/after | [Agent 1](performance/bundle-size.md) |
| **2A.3** | **Drop `pdf.worker.min.js` + `assets/fontkit.umd.min.js` (1.7 MB total) from the SW precache list** in [sw.js](../sw.js). Keep only true-critical first-party scripts; serve large opt-in assets on-demand via the runtime cache. | -1.7 MB on first visit / SW install | Low — SW falls back to network on cache miss | DevTools Application > Service Workers, check install size | [Agent 3 top-2](performance/network.md), [Agent 1](performance/bundle-size.md) |
| **2A.4** | **Lazy-load help/preferences/command-palette stack on home** — [help-drawer.js](../help-drawer.js), [preferences-modal.js](../preferences-modal.js), [command-palette.js](../command-palette.js), [onboarding-wizard.js](../onboarding-wizard.js) currently eager-load on every page. Defer to `requestIdleCallback` after first paint. | Faster LCP on home | Low | Lighthouse LCP before/after | [Agent 1](performance/bundle-size.md) |
| **2A.5** | **Add the cache-key (`babel_*`) lookup that `index.html` uses to `manager.html` and `stitch.html`** — those two pages currently re-Babel-transpile the entire app on every visit. | Faster repeat visits to manager/tracker | Low — same cache mechanism, different file | DevTools Performance, Babel call-tree before/after | [Agent 1](performance/bundle-size.md) |

### 2B. Rendering (Agent 2)

| ID | Fix | Impact | Risk | Verify | Source |
|---|---|---|---|---|---|
| **2B.1** | **Split `cvCtx` in [creator-main.js#L542](../creator-main.js#L542)** — currently bundles `hoverCoords` with ~70 other fields. Every mousemove forces every consumer (including the 115 KB Sidebar with its `displayPal.map` chip list) to re-render. Move `hoverCoords` to its own context or local state. | Eliminates 60 fps re-render storm during cursor hover in Creator | Medium — context-shape change touches many files | React DevTools Profiler render-count before/after | [Agent 2 R1](performance/rendering.md) |
| **2B.2** | **Virtualise the manager threads grid** — [manager-app.js#L1128](../manager-app.js#L1128) renders up to ~900 thread cards unwindowed; the search input rebuilds the entire grid on every keystroke. Add windowing (custom or `react-window`-style). | Search becomes responsive at large stash sizes | Medium | Type a search query, measure input-to-paint latency | [Agent 2 R2](performance/rendering.md) |
| **2B.3** | **Split [creator/PatternCanvas.js](../creator/PatternCanvas.js) Effect 1**'s ~25-entry dep list. Structural deps and visual deps share one effect, so a tint/dim slider tick triggers a full `getImageData` round-trip (16 MB on a 200×200 chart). Separate visual-only redraws. | Slider feels instant; ~16 MB/tick avoided on large charts | Medium | DevTools Performance trace while moving the tint slider | [Agent 2 R3](performance/rendering.md) |
| **2B.4** | **Stabilise inline `style={{}}` and `onClick={()=>...}` props** inside `.map()` calls in tracker-app.js, creator-main.js, manager-app.js. Hoist or memoise. | Reduces unnecessary child re-renders | Low | React DevTools "Highlight updates" | [Agent 2](performance/rendering.md) |
| **2B.5** | **Add useEffect cleanup audit** — agent flagged several `addEventListener`/`setInterval` setups; verify each has a paired remove. | Prevents long-session memory growth | Low | Heap snapshot after 30-min session | [Agent 2](performance/rendering.md) |

### 2C. Network & data (Agent 3)

| ID | Fix | Impact | Risk | Verify | Source |
|---|---|---|---|---|---|
| **2C.1** | **N+1 IndexedDB read storm on stats** — [stats-page.js](../stats-page.js#L1046) (and [stats-activity.js](../stats-activity.js#L48)) mount 4 independent `useEffect`s, each calling `ProjectStorage.listProjects()` then `Promise.all(metas.map(get))`. Replace with one shared `useProjectsAll()` hook memoised on `(count, max(updatedAt))`. | 4–5× → 1× full-DB read on every stats visit | Low | DevTools IndexedDB tab + console.time | [Agent 3 top-1](performance/network.md), [Agent 6 top-1](performance/patterns.md) |
| **2C.2** | **Move SW precache to `CORE_PRECACHE` + lazy runtime cache** — see 2A.3. | Faster install, smaller offline payload | Low | SW install size | [Agent 3 top-2](performance/network.md) |
| **2C.3** | **Add `loading="lazy"` to home-page project tile thumbnails and library list images** in [home-app.js](../home-app.js). | Faster home LCP on libraries with many projects | None | Lighthouse | [Agent 3](performance/network.md) |

### 2D. Build & test pipeline (Agent 4)

| ID | Fix | Impact | Risk | Verify | Source |
|---|---|---|---|---|---|
| **2D.1** | **Make [build-creator-bundle.js](../build-creator-bundle.js) idempotent**: hash inputs, only `writeFileSync` if the new content differs. Stops every CI run / pre-commit from re-touching `creator/bundle.js` (the dominant cause of the 107 MB `.git` pack). | History stops accumulating identical bundle blobs (249 already exist) | Low — guard around an existing write | `git status` after a no-op build | [Agent 4 top-2](performance/build-pipeline.md) |
| **2D.2** | **Add a top-level `npm run build`** that runs `build-creator-bundle.js` + `build-import-bundle.js` + `build-symbol-font.js` in sequence. Today they're three independently-named scripts with overlapping concerns; easy to forget one. | Catches forgotten regenerations in CI | None | `npm run build` succeeds, confirms no diff | [Agent 4 top-3](performance/build-pipeline.md) |
| **2D.3** | **Add a CI workflow** running `npm test`, `npm run build`, `npm run lint:terminology`, `npm run lint:css-tokens`, and `npm run lint:html-meta` on every PR. Currently `.github/workflows/` only contains `bump-version.yml`. | Catches regressions before merge | Low | First green run | [Agent 10 top-3](cleanup/config-debt.md) |
| **2D.4** | **Sync the SW `PRECACHE_URLS` list** in [sw.js](../sw.js) with the actual 17+ first-party scripts loaded by `create.html`/`stitch.html` (workers + lazy bundles missing). Add a unit test that diffs the precache list against the script-tag graph. | Stops every deploy waterfalling network for these files; offline-first works on first visit | Medium | Lighthouse "Offline" audit pass | [Agent 10 top-1](cleanup/config-debt.md) |
| **2D.5** | **Shared test scaffold for the `fs.readFileSync + eval` pattern** — currently 20+ tests duplicate the boilerplate. Extract a `tests/_helpers/loadSource.js` with a per-process cache so each source file is read once. | Trims jest startup; smaller test files | Low | `Measure-Command { npm test --silent }` | [Agent 4](performance/build-pipeline.md), [Agent 10 C6](cleanup/config-debt.md) |

### 2E. Algorithmic patterns (Agent 6)

| ID | Fix | Impact | Risk | Verify | Source |
|---|---|---|---|---|---|
| **2E.1** | **Memoise lookup tables in [dmc-data.js](../dmc-data.js), [anchor-data.js](../anchor-data.js), [thread-conversions.js](../thread-conversions.js)** — build id-indexed Maps once at module load instead of linear `.find()` per call. | Removes O(N) per palette-cell lookup during quantise / palette swap | Low | console.time around `findThreadInCatalog` over 1000 calls | [Agent 6](performance/patterns.md) |
| **2E.2** | **Audit colour-utils.js k-means inner loops** for `.find()` inside `.map()` and pairwise ΔE recomputation. Suspect-only — needs profiling first. *Suspected — profile to confirm.* | Faster pattern generation on large images | Medium | console.time around `kmeansQuantize` on a 600×600 image | [Agent 6](performance/patterns.md) |

### 2F. Repo & docs hygiene (Agents 8, 9, 10)

| ID | Fix | Impact | Risk | Source |
|---|---|---|---|---|
| **2F.1** | **`git mv` ~165 stale reports into `reports/_archive/<topic>/`**. Cuts working tree by ~65% with no information loss; git history preserved. | Faster IDE indexing, reduced cognitive load | None | [Agent 8](cleanup/stale-artifacts.md) |
| **2F.2** | **Resolve the duplicate sync-test-plan**: [SYNC_TEST_PLAN.md](../SYNC_TEST_PLAN.md), [reports/sync-9-test-plan.md](sync-9-test-plan.md), [reports/branch-audit/MANUAL_TEST_PLAN.md](branch-audit/MANUAL_TEST_PLAN.md). Pick a canonical home. | Less drift over time | None | [Agent 8](cleanup/stale-artifacts.md) |
| **2F.3** | **Delete `reports/perf-results/*.json`** — raw harness output, not docs. Add `reports/perf-results/` to `.gitignore`. | Cleaner reports tree | None | [Agent 8](cleanup/stale-artifacts.md) |
| **2F.4** | **Resolve hook duplication**: [.husky/](../.husky/) and [.githooks/](../.githooks/) carry near-identical pre-commit scripts. Pick one. Husky version uses a forbidden `✗` glyph (per copilot-instructions emoji rule) — replace with text. | Single source of truth; satisfies emoji rule | None | [Agent 10 top-2](cleanup/config-debt.md) |
| **2F.5** | **Update [vercel.json](../vercel.json)** rewrites — currently omits `/stitch` and `/manager` clean URLs. | Direct deep-links work | None | [Agent 10 C5](cleanup/config-debt.md) |
| **2F.6** | **Update SW offline navigation fallback** in [sw.js](../sw.js) from `./index.html` to `./home.html` (the actual landing page). | Correct offline experience | None | [Agent 10 C14](cleanup/config-debt.md) |
| **2F.7** | **Add `engines` field to [package.json](../package.json)** — declare Node ≥22. | CI / Vercel pinning | None | [Agent 10 C15](cleanup/config-debt.md) |
| **2F.8** | **Drop unused npm packages** — `acorn`, `prettier`, `@babel/cli`, `@babel/core`, `@babel/preset-react`, `@babel/standalone` (browser uses CDN). ~53 MB. *Verify first* with `grep -r "require('NAME')" .` per package. | -53 MB `node_modules` | Low — verified zero references in repo | [Agent 5 F2](performance/dependencies.md) |
| **2F.9** | **Owner-triage the `scripts/` one-off helpers** — 10 files (split-p1..p4, split-pq, extract-*, build-master-todo, trim-spec-tails, fix-tracker-icons, audit-dmc-colors). Either delete or move under `scripts/oneshot/`. | Surface live scripts | Low — needs maintainer confirmation | [Agent 7 D-4.2](cleanup/dead-code.md#d-42-scripts-one-off-auditmigration-helpers--likely-dead--verify) |

---

## Section 3 — Architectural Changes

> Significant refactor or architectural decision. **Do not start without explicit human approval.**
> Each item presents tradeoffs and a recommended option.

### 3.1 Pre-transpile JSX at build time (eliminate Babel Standalone in browser)

**Problem**: Every visit, Babel Standalone parses every `text/babel` script (tracker-app.js 434 KB, creator-main.js 88 KB, manager-app.js 131 KB, stats-page.js 134 KB). The repo mitigates with a hand-rolled localStorage cache (`babel_*` keys in [index.html](../index.html)), but the underlying cost is real on first visit, after every cache-bust, and on the two pages where the cache is missing (manager.html, stitch.html — see fix 2A.5).

**Approaches**:

| | **A. Keep Babel Standalone, fix the cache** | **B. Pre-transpile to plain JS at build time** | **C. Switch to esbuild + minimal bundling** |
|---|---|---|---|
| Effort | Small (already partially done) | Medium | Large |
| Architecture change | None | Add a build step; runtime stays no-ESM | Replace concat builds with esbuild |
| Babel CDN dependency | Stays | Goes | Goes |
| First-load cost | Down ~30 % (cache on more pages) | Down >80 % | Down >80 % + tree-shaking + minification |
| `<script>` tag count (235 today) | Unchanged | Unchanged | Could collapse to a few |
| Risk | Low | Low–medium (need to verify all JSX features parse) | High (changes the project's defining "no build step" character) |

**Recommendation: Option B**. Add `npm run build:transpile` that runs Babel against the few `text/babel` source files (tracker-app.js, creator-main.js, stats-page.js, manager-app.js, home-app.js, manager-app.js, etc.) and writes `*.transpiled.js` next to source. Switch the script tags to plain `<script src="…transpiled.js" defer>`. Drop the Babel Standalone CDN load. Project keeps its no-bundler character; only "transpile" is added.

### 3.2 Code-split [creator/bundle.js](../creator/bundle.js)

**Problem**: Single 854 KB bundle ships even when the user never leaves the Project tab. (See Quick-Win-style fix 2A.2 for the simple version; this entry is the deeper architectural cut.)

**Approaches**:

| | **A. Three chunks (core/prepare/export)** | **B. Per-tab lazy chunks** | **C. Switch to native ES modules + dynamic `import()`** |
|---|---|---|---|
| Effort | Medium | Medium–large | Large |
| Architecture | Stays no-ESM | Stays no-ESM | Drop the `window.*` global pattern |
| User impact | Saves ~35–45 % on Project-only sessions | Maximum (only-what's-needed) | Maximum + code can be tree-shaken |
| Risk | Low | Medium (more lazy-loading bugs) | High (every file changes) |

**Recommendation: Option A** as an iteration on top of fix 2A.2. Defer Option C unless the team is willing to abandon the no-ESM constraint; it has compounding wins (esbuild, real tree-shaking, native HMR via something like Vite) but materially changes the project.

### 3.3 IndexedDB read consolidation (single `useProjectsAll` hook)

**Problem**: Stats / Activity / Insights / Coaching / home dashboards each list and load every project independently. (See targeted fix 2C.1 for the localised version; this entry is the cross-cutting architectural cut.)

**Approaches**:

| | **A. Per-page memoised hook** | **B. App-wide projects context provider** | **C. Move to a worker-backed store with a query API** |
|---|---|---|---|
| Effort | Small | Medium | Large |
| Architecture | Each page solves its own duplication | Shared in-memory cache; single read on app boot, invalidated on save | Worker handles all DB I/O; UI thread asks for slices |
| Risk | Low | Low–medium (cache invalidation) | Medium |
| Bonus | — | — | Frees main thread during big sync events |

**Recommendation: Option B**. Add a `<ProjectsProvider>` that loads `project_meta` once, lazy-loads full projects on demand, and invalidates on storage events from [sync-engine.js](../sync-engine.js). Migrate stats/home/manager to consume it.

### 3.4 Git history rewrite

**Problem**: `creator/bundle.js` has 249 historical blobs (~143 MB uncompressed). The 20 MB historical `Books and Blossoms - 5mm color.pdf` blob lives in the pack.

**Decision**: **Defer.** [Agent 9 I1-1](cleanup/repo-health.md#i1-1--249-historical-creatorbundlejs-blobs--consider-history-rewrite-carefully) recommends not rewriting today: the pack is already compact (7.7 MB), and a rewrite forces every clone, fork, and CI cache to re-clone. Re-evaluate only if `.git` exceeds ~50 MB packed in future or the repo is being archived/forked.

### 3.5 Webfont / fontkit / pdf-lib stack consolidation

Already analysed by [Agent 5 F5](performance/dependencies.md) — no actual duplication between the vendored `assets/fontkit.umd.min.js` and the npm `@pdf-lib/fontkit`. **No action required.**

---

## Section 4 — Cleanup Manifest

> Consolidated from all Phase 2 reports. The orchestrator cross-checked each item against the
> "looks dead but isn't" tables in Agent 7 and the false-positive notes in Agents 8–10.

### Safe to delete (confirmed dead)

- [assets/Books and Blossoms - BW.svg](../assets/Books%20and%20Blossoms%20-%20BW.svg) — Agents 1, 3, 7. 2.6 MB. Zero references.
- [TestUploads/exported_pattern.pdf](../TestUploads/exported_pattern.pdf) — Agents 7, 9. 1.8 MB. Not loaded by [tests/perf/import.spec.js](../tests/perf/import.spec.js).
- [TestUploads/Books and Blossoms - 5mm color.pdf](../TestUploads/Books%20and%20Blossoms%20-%205mm%20color.pdf) — Agent 7. 2-byte placeholder (was 20.4 MB).
- 3 unused icon definitions in [icons.js](../icons.js): `gridOverlay`, `shoppingCart`, `sync` — Agent 7.
- `reports/perf-results/*.json` — Agent 8. Raw harness output; regenerable.
- [reports/b3-consolidation-map.md](b3-consolidation-map.md) — Agent 8. Stub.
- npm packages (after `grep -r "require('NAME')" .` confirms zero refs): `acorn`, `prettier`, `@babel/cli`, `@babel/core`, `@babel/preset-react`, `@babel/standalone` — Agent 5. ~53 MB.

### Likely safe to delete (verify first)

- [import-engine/pdf/pdfDocLoader.js](../import-engine/pdf/pdfDocLoader.js) — Agent 7 D-3.4. Only consumer is its own test. Verify the test isn't covering production behaviour another way.
- 10 files under [scripts/](../scripts/): `split-p1..p4.js`, `split-pq.js`, `extract-specs.ps1`, `extract-specs-2.ps1`, `extract-verification.ps1`, `extract-crosscutting.ps1`, `build-master-todo.ps1`, `trim-spec-tails.ps1`, `fix-tracker-icons.js`, `audit-dmc-colors.js` — Agent 7 D-4.2. Owner triage required.
- ~110 MB of *extraneous* `node_modules/` packages (`pdfjs-dist`, `@napi-rs/canvas`, `canvas`) — Agent 5 F1. `npm prune` is the verify+delete step.
- `.git` loose objects — Agent 9 I0-1. `git gc --prune=now` is non-destructive.

### Archive (move out of working tree, keep accessible)

Bulk-archive ~165 reports into `reports/_archive/<topic>/` via `git mv`. Topic groupings (Agent 8):

- `reports/_archive/perf/` — `perf-baseline-1..3`, `perf-opt-1..2`, `perf-results/` (excl. JSON), `perf-cat-b-plan.md`, `perf-results-1..4`
- `reports/_archive/branch-audit/` — entire [reports/branch-audit/](branch-audit/)
- `reports/_archive/color/` — `color-1..9` (keep `color-10-full-color-experience.md` active)
- `reports/_archive/competitive/` — `competitive-1..15`, `competitive-wireframes/`
- `reports/_archive/difficulty/` — entire [reports/difficulty/](difficulty/)
- `reports/_archive/import/` — `import-1..10`, `import-fix-1..3`, `import-2-raw/`, `import-wireframes/`
- `reports/_archive/preview/` — `preview-1..7`
- `reports/_archive/stats/` — `stats-1..8`
- `reports/_archive/sync/` — `sync-1..8`, `sync-wireframes/`
- `reports/_archive/touch/` — `touch-1..7`, `touch-wireframes/`
- `reports/_archive/verification/` — completed verification phases (keep `ver-sync-phase4-audit.md` active until SYNC_VERSION bump per Agent VER-SYNC-011)
- `reports/_archive/help-audit/` — `help-audit-1..8`, `help-consistency-audit.md`
- [docs/test-plans/](../docs/test-plans/) → `docs/_archive/test-plans/`

**Keep in active `reports/`** (~92 files): [reports/showcase/](showcase/), [reports/performance/](performance/) (the new audit), [reports/cleanup/](cleanup/) (this audit), [reports/specs/](specs/), [reports/cross-cutting/](cross-cutting/), [00_PERFORMANCE_CONTEXT.md](00_PERFORMANCE_CONTEXT.md), [00_PROJECT_CONTEXT.md](00_PROJECT_CONTEXT.md), this action plan, top-level READMEs, [.github/](../.github/), open touch / PQ items, `color-10-full-color-experience.md`, `import-reference-dmc-format.md`.

### Do not delete (looks dead but isn't)

- [embroidery.html](../embroidery.html), [embroidery.js](../embroidery.js) — opt-in via `experimental.embroideryTool` UserPref ([user-prefs.js#L194](../user-prefs.js#L194)). Linked from [home-app.js#L563](../home-app.js#L563).
- [analysis-worker.js](../analysis-worker.js), [generate-worker.js](../generate-worker.js), [pdf-export-worker.js](../pdf-export-worker.js), [pdf.worker.min.js](../pdf.worker.min.js) — spawned via `new Worker(...)`.
- [pdf-importer.js](../pdf-importer.js) — lazy-loaded via `loadPdfStack()`.
- [import-engine/lazy-shim.js](../import-engine/lazy-shim.js), [import-engine/worker.js](../import-engine/worker.js) — script-tag / worker-spawned.
- [home-screen.js](../home-screen.js) — still consumed by [manager.html](../manager.html) (`MultiProjectDashboard`).
- [build-creator-bundle.js](../build-creator-bundle.js), [build-import-bundle.js](../build-import-bundle.js), [build-symbol-font.js](../build-symbol-font.js), [serve.js](../serve.js) — dev tooling.
- [playwright.config.js](../playwright.config.js) — implicitly picked up by the Playwright CLI.
- [version.js](../version.js) — release stamp, loaded by every page.
- [TestUploads/](../TestUploads/) `Books and Blossoms.pdf`, `PAT2171_2.pdf`, `PAT1968_2.pdf` — referenced by [tests/perf/import.spec.js](../tests/perf/import.spec.js). Do not move to LFS (Agent 9 verdict).
- 15 icons in [icons.js](../icons.js) initially flagged as unused but actually referenced by string (`accessibility`, `bell`, `compass`, `confidenceHigh`, `confidenceLow`, `frame`, `globe`, `gradCap`, `magnifier`, `redo`, `settings`, `splitView`, `stop`, `user`, `wandFix`).
- [creator/bundle.js](../creator/bundle.js), [creator/import-wizard-bundle.js](../creator/import-wizard-bundle.js), [import-engine/bundle.js](../import-engine/bundle.js), [assets/fonts/CrossStitchSymbols.base64.js](../assets/fonts/CrossStitchSymbols.base64.js) — generated, but tracked deliberately so production deployment works without a build step. Mark `linguist-generated` (fix 2F-equivalent) but **do not untrack** until Vercel build hook is added (architectural change 3.1 / 3.2 territory).

---

## Section 5 — Before/After Measurement Plan

Run after implementation, comparing against the baselines captured in [00_PERFORMANCE_CONTEXT.md](00_PERFORMANCE_CONTEXT.md). Use the same machine and the same commands.

```
- [ ] node_modules size:               was 238.52 MB, now ___ MB    (target: <80 MB after npm prune + 2F.8)
- [ ] node_modules top-level packages: was 265,       now ___       (target: <160)
- [ ] .git size:                       was 107.10 MB, now ___ MB    (target: <20 MB after git gc)
- [ ] Working tree (excl .git):        was 25.40 MB,  now ___ MB    (target: <23 MB)
- [ ] Tracked file count:              was 629,       now ___       (target: <500 after archiving)
- [ ] reports/ file count:             was 257,       now ___       (target: ~92 active + ~165 archived)
- [ ] creator/bundle.js size:          was 853.6 KB,  now ___ KB    (target: <500 KB after split)
- [ ] build-creator-bundle.js wall:    was 151 ms,    now ___ ms    (target: <50 ms when no-op due to hash check)
- [ ] Jest suite (parallel default):   was 5.59 s,    now ___ s     (target: ≤5.6 s — should not regress)
- [ ] Jest suite (--runInBand legacy): was 19.7 s,    now ___ s     (informational)
- [ ] npm audit vulns:                 was 0,         now ___       (target: 0)
- [ ] Lighthouse perf score (home):    not captured,  now ___       (target: ≥90 mobile)
- [ ] LCP (home.html, mobile):         not captured,  now ___ ms    (target: <2,500 ms)
- [ ] TBT (home.html, mobile):         not captured,  now ___ ms    (target: <200 ms)
- [ ] First-visit transfer (home):     not captured,  now ___ KB    (target: <500 KB JS+CSS gzipped)
- [ ] First-visit transfer (create):   not captured,  now ___ KB    (target: <800 KB JS+CSS gzipped)
- [ ] SW install size:                 unmeasured,    now ___ KB    (target: -1.7 MB after dropping pdf.worker + fontkit)
- [ ] Stats page DB reads on mount:    4–5×,          now ___ ×     (target: 1×)
- [ ] Cursor mousemove re-renders/sec (Creator): unmeasured, now ___ (target: <5 from current ~60)
```

Capture browser-driven metrics with Lighthouse (DevTools or `lighthouse` CLI) after starting the dev server (`node serve.js`), and compare a clean SW install (DevTools > Application > Service Workers > Unregister, then hard-reload) against the baseline.

---

## Stop here

This plan is complete. **No code, file, dependency, branch, or commit has been modified.** The next step is human review:

1. Read this document.
2. Approve / strike items in §1 (Quick Wins) — they can be batched into a single PR.
3. Approve which §2 (Targeted Fixes) areas to attempt and in what order.
4. Decide whether any §3 (Architectural) items should enter design.
5. Approve / strike entries in §4 (Cleanup Manifest) — particularly anything in the **Likely safe to delete (verify first)** list.
6. Once changes ship, capture the §5 (Before/After) numbers and append them to a new `reports/00_PERFORMANCE_CONTEXT_AFTER.md` rather than editing the baseline.
