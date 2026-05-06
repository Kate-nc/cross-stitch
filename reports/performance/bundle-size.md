# Bundle Size & Code Splitting — Audit (Agent 1)

> Read-only audit. Baselines and the I0–I4 scale are defined in
> [00_PERFORMANCE_CONTEXT.md](../00_PERFORMANCE_CONTEXT.md). Sizes below are
> raw on-disk bytes (no gzip), captured 2026-05-06 on branch
> `performance-upgrades-2`.

## TL;DR — top three findings

1. **`assets/Books and Blossoms - BW.svg` (2,687,411 B / 2.56 MB) is unreferenced anywhere in the source tree** — no `<link>`, `<img>`, `fetch`, `url(...)`, or string match outside the test fixture path. It costs zero bytes at runtime today, but it is precached by no service worker and shipped on every clone. **Delete it** (or move to `TestUploads/` if it is a fixture). I1.
2. **`creator/bundle.js` (874 KB) is a single-shot concat of 44 files**, downloaded and JSX-parsed on **every** Creator visit. The Creator page user pays the full 874 KB even before they click anything. The build script already proves split bundles are feasible (`creator/import-wizard-bundle.js`, 30 KB conditional). A split into ≥3 chunks (Prepare / Edit / Export) would defer ≈400–500 KB until the user changes tab. I1.
3. **`components.js` (148 KB) is loaded eagerly on every page including [home.html](../../home.html) and [manager.html](../../manager.html), but ~700 of its 2,280 lines are stats-only React components** (`StatsDashboard`, `GlobalStatsDashboard`, `StatsContainer`, `MonthCalendar`, `DailyBarChart`, `ColourTimeline`, `MilestoneTracker`, `SectionGrid`, `ComparisonView`, `ProjectComparison`, `RingChart`, etc.) that home/manager never render. Splitting `components.js` into `components-core.js` + `components-stats.js` would save ≈45–50 KB of parse on the landing page. I1.

---

## Per-page script payload

Source: scripts referenced from each HTML entry (CDN scripts excluded; deferred and lazy entries marked).

| Page | `<script>` tags | Eager local JS (KB, sum) | Lazy / on-demand |
|---|---:|---:|---|
| [home.html](../../home.html) | 36 | ≈ 720 | none — heavy app bundles deliberately omitted |
| [index.html](../../index.html) | 50 | ≈ 1,830 (incl. 854 KB `creator/bundle.js`) | tracker, stats-page, stats-activity, stats-insights, creator-main, pdf-lib, pdf.js, pdf-importer, import-wizard |
| [create.html](../../create.html) | 50 | ≈ 1,830 | same as index.html |
| [stitch.html](../../stitch.html) | 43 | ≈ 770 + tracker (434 KB Babel) | pdf.js + pdf-importer (lazy via `loadPdfStack`) |
| [manager.html](../../manager.html) | 41 | ≈ 770 | manager-app (134 KB Babel) |
| [embroidery.html](../../embroidery.html) | 15 | ≈ 250 | none |

### Things shipped to a page that never uses them

| Page | Eager script | Size | Why it is unused there |
|---|---|---:|---|
| home.html | [components.js](../../components.js) (stats half) | ≈ 50 KB | home-app.js never references `StatsDashboard` / `GlobalStatsDashboard` / `MonthCalendar` etc. (`grep_search` returned 0 hits in [home-app.js](../../home-app.js)). |
| home.html | [sync-engine.js](../../sync-engine.js) | 71 KB | Loaded eagerly so the global "sync review gate" can mount on home. It runs `setTimeout`-driven background work that only matters once a project is open. Could defer with `<script defer>` or move to idle-load. |
| home.html | [help-drawer.js](../../help-drawer.js) | 63 KB | Help drawer is opened on user gesture; could lazy-load on first invocation (see also home.html, manager.html, stitch.html, index.html — all four pages eat the parse cost). |
| home.html | [onboarding-wizard.js](../../onboarding-wizard.js) | 21 KB | Only mounts for first-run users; idle-load. |
| home.html | [preferences-modal.js](../../preferences-modal.js) | 80 KB | Only opens on user gesture. |
| home.html | [command-palette.js](../../command-palette.js) | 27 KB | Lives behind ⌘K; idle-load is fine. |
| index.html / create.html | [insights-engine.js](../../insights-engine.js) | 23 KB | Eager script, but its only callers are [stats-page.js](../../stats-page.js) and [stats-insights.js](../../stats-insights.js) — both of which are themselves lazy-loaded. Move into the same `loadStatsPage`/`loadStatsInsights` shim. |
| index.html / create.html | [assets/fonts/CrossStitchSymbols.base64.js](../../assets/fonts/CrossStitchSymbols.base64.js) | 14 KB | Sets `window.CROSS_STITCH_SYMBOL_FONT_B64`. Grep confirms the **only consumer is [pdf-export-worker.js](../../pdf-export-worker.js) line 48**, which loads its own copy via `importScripts`. The eager main-thread tag is dead weight. |
| stitch.html / manager.html / index.html / create.html | [coaching.js](../../coaching.js) | 16 KB | Loaded on every tool page; verify it is actually used per page (likely lazy candidate). |
| stitch.html | [creator/import-wizard-bundle.js](../../creator/import-wizard-bundle.js) | 30 KB | Tagged eagerly in `<head>` (the conditional block runs in `requestIdleCallback` only when the experimental flag is on, but the static `<script>` tag at the bottom of the file load order has no such guard — verify). |

### Things duplicated (same byte-for-byte file shipped twice in one page)

None observed within a single page (browser dedupes by URL anyway). Across pages, every page reloads React/ReactDOM/Babel/pako from the CDN — this is fine because the files are pinned and SW-cached.

---

## The "concatenate every creator file" strategy

[build-creator-bundle.js](../../build-creator-bundle.js) lists 44 source files in `ORDER` and emits one 874 KB blob. Notable observations:

- The wizard split (`useImportWizard.js` + `ImportWizard.js` → `import-wizard-bundle.js`) already proves the model works and saves ≈30 KB for default users.
- Several large modules in the bundle are demonstrably tab-scoped:
  - `pdfChartLayout.js`, `pdfExport.js`, `zipBundle.js`, `ExportTab.js`, `DesignerBrandingSection.js`, `ShoppingListModal.js`, `MaterialsHub.js`, `LegendTab.js`, `PrepareTab.js` — only used after the user opens Materials/Export.
  - `RealisticCanvas.js`, `PreviewCanvas.js`, `useMagicWand.js`, `useLassoSelect.js`, `MagicWandPanel.js`, `AdaptModal.js`, `adaptationEngine.js` — only used in Edit mode.
  - `generate.js` + `canvasRenderer.js` — needed once per generate.
- A 3-chunk split (Prepare / Edit / Export, plus a small "core" with state + canvas + sidebar) is realistic. Conservative estimate: defer 35–45 % of bundle bytes (≈ 300–400 KB) until tab activation.
- The bundle is shipped as a regular `<script>` (not `text/babel`), so users do not pay JSX-parse cost for it — only download + V8 parse. The cost is real but not catastrophic.

**Risk:** the build script auto-bumps `CREATOR_CACHE_KEY` based on a sha256 of the bundle; multi-chunk splits would need their own cache keys (one per chunk) to retain the babel-compiled cache hit.

---

## Heavy assets always loaded

| Asset | Size | When fetched today | Notes |
|---|---:|---|---|
| [pdf.worker.min.js](../../pdf.worker.min.js) | 1,062 KB | **Lazy** — `loadPdfStack()` only loads it on first PDF import action. Confirmed in [stitch.html](../../stitch.html#L48), [index.html](../../index.html), [create.html](../../create.html) — none have a `<script src="pdf.worker.min.js">` tag. Good. | Service worker still **precaches it on install** (see [sw.js](../../sw.js#L54)) — first SW install fetches 1 MB the user might never need. Consider runtime cache-only. |
| [assets/fontkit.umd.min.js](../../assets/fontkit.umd.min.js) | 741 KB | Loaded only by [pdf-export-worker.js](../../pdf-export-worker.js) via `importScripts`. The main thread never fetches it. Good. | Also precached by SW on install. Same recommendation as pdf.worker. |
| [assets/Books and Blossoms - BW.svg](../../assets/Books%20and%20Blossoms%20-%20BW.svg) | 2,624 KB | **Never** — `grep_search` for "Books and Blossoms - BW" across all `.js`/`.html`/`.css` returned 0 hits. | Dead asset. Delete (see I1 #1). |
| [creator/bundle.js](../../creator/bundle.js) | 854 KB | Eager on `index.html`/`create.html` only. | Split candidate. |
| [tracker-app.js](../../tracker-app.js) | 434 KB | Eager (`text/babel`) on `stitch.html`; lazy on `index.html` via `loadTrackerApp`. | Split candidate (Track view vs Stats view). Stats UI in `components.js` would need to move with it. |
| [creator-main.js](../../creator-main.js) | 88 KB | Lazy on `index.html` via `loadCreatorMain`. | OK. |
| [styles.css](../../styles.css) | 250 KB | Eager on every page. | See "CSS coverage" below. |

---

## Babel Standalone parse cost

Every `text/babel` script gets compiled by [babel.min.js](https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.9/babel.min.js) at runtime. The repo already mitigates this with a hand-rolled localStorage cache keyed by content hash (`TRACKER_CACHE_KEY`, `CREATOR_CACHE_KEY`, `STATS_CACHE_KEY`, `ACTIVITY_CACHE_KEY`, `INSIGHTS_CACHE_KEY` in [index.html](../../index.html)). The cache works only if `fetch()` succeeds and `localStorage` is writable.

JSX files transpiled in-browser:

| File | Bytes | Cached? |
|---|---:|---|
| [tracker-app.js](../../tracker-app.js) | 444,829 | yes (`TRACKER_CACHE_KEY`) on index.html; **no** on stitch.html (loaded as plain `text/babel`) |
| [manager-app.js](../../manager-app.js) | 134,797 | **no** — `<script type="text/babel" src="manager-app.js">` in [manager.html](../../manager.html) |
| [stats-page.js](../../stats-page.js) | 137,461 | yes |
| [creator-main.js](../../creator-main.js) | 90,218 | yes |
| [stats-activity.js](../../stats-activity.js) | 30,284 | yes |
| [stats-insights.js](../../stats-insights.js) | 22,990 | yes |
| [home-app.js](../../home-app.js) | 53,071 | **no** — plain `<script src="home-app.js">` in [home.html](../../home.html) (it doesn't actually use JSX, it uses `React.createElement` calls — verify; if confirmed, remove the misleading `text/babel` references) |

Recommendations:
- **Apply the same cache-or-fetch wrapper to `manager-app.js` and the `stitch.html` copy of `tracker-app.js`.** First load of these pages currently re-runs Babel on every visit. Measurement: open `stitch.html` with `localStorage.clear()`; in Performance panel observe a 200–600 ms script-evaluation block on `babel.min.js`. Apply fix and re-measure.
- The simpler-and-more-reliable solution is **pre-transpile at build time**. A minimal pipeline (`babel --presets react`) can be added to a single Node script that mirrors `build-creator-bundle.js`. Babel Standalone (3 MB CDN script) could then move to `defer` because it would only be needed on cache-miss fallback. Saves ~3 MB CDN download for first-time visitors who arrive on a tool page.

---

## Dead exports

`window.*` assignments inside `creator/*.js` (sample of 21 hits) all trace to a consumer somewhere in the bundle/creator-main.js — no obvious dead exports there.

Spot checks worth doing during cleanup (not blocking):

- `window.MultiProjectDashboard` (in [home-screen.js](../../home-screen.js)) is consumed only by [project-library.js](../../project-library.js). [home-screen.js](../../home-screen.js) (101 KB) loads on home, index, create, manager — only home actively renders the Home screen, the others use it for project-library/dashboard reuse. Audit how much of the 101 KB is actually unreachable on Creator and Manager.
- Internal helpers in [tracker-app.js](../../tracker-app.js) (434 KB) — no read pass done; recommend a `grep_search` of every top-level `function FooComponent` against the rest of the file to find unrendered components.
- Repeat for [stats-page.js](../../stats-page.js) and [manager-app.js](../../manager-app.js).

---

## Duplicate / overlapping code

| Area | Where it lives | Notes |
|---|---|---|
| `<kbd>` keyboard glyph formatting | [shortcuts.js](../../shortcuts.js), [help-drawer.js](../../help-drawer.js), [command-palette.js](../../command-palette.js) | Likely 3 small `formatKey()` look-alikes. Worth grep-confirming. |
| Skein math | [threadCalc.js](../../threadCalc.js) and (per repo memory) `creator/useCreatorState.js` does ad-hoc stash walks | Already centralised in `_splitStashKey` per the recent fix; verify no callers re-invented the wheel after that commit. |
| Icon set | [icons.js](../../icons.js) (single source) | OK. |
| Constants | [constants.js](../../constants.js), repeated in [creator/symbolFontSpec.js](../../creator/symbolFontSpec.js)? | Sample only — verify. |

No glaring duplication of *file-sized* magnitude found in this pass.

---

## styles.css coverage

[styles.css](../../styles.css) is 255,879 bytes / 6,517 lines, monolithic, served on every page. **Not measured** in this pass — Coverage requires Chrome DevTools.

**Measurement instruction:**

```text
1. Open Chrome DevTools → "More tools" → Coverage.
2. Click "Start instrumenting coverage and reload page" with home.html.
3. Exercise: open command palette (⌘K), open help drawer, open preferences modal, close.
4. Stop. Note the "Unused bytes" column for styles.css (expect 60–80 % unused on home).
5. Repeat per page: stitch.html (track a couple of cells, open stats), manager.html, create.html.
6. Tabulate per-page unused% — anything > 50 % is a strong split candidate.
```

A reasonable post-measurement split is `styles-core.css` (tokens, header, modal, buttons), `styles-creator.css`, `styles-tracker.css`, `styles-stats.css`, `styles-manager.css`, loaded per page.

---

## Prioritized TODO

### I0 — Critical
None identified. The app works; nothing here is causing crashes or > 1 s lag at the bundle layer.

### I1 — High

1. **Delete (or relocate) `assets/Books and Blossoms - BW.svg` (2.56 MB).**
   - Measurement: `grep_search` proved zero references. After delete, `git ls-files | xargs wc -c` working tree drops by 2.56 MB; clone time and `node_modules`-free checkout shrink correspondingly.
2. **Skip eager `<script src="assets/fonts/CrossStitchSymbols.base64.js">` on [index.html](../../index.html#L105) and [create.html](../../create.html#L113).** It is consumed only inside the PDF export worker.
   - Measurement: DevTools Network tab for [create.html](../../create.html), filter "fonts/" → file should not appear; localStorage `babel_creator_*` size unchanged. PDF export still works (smoke test: export a 50×50 pattern and open the PDF). Saves ~14 KB transfer + parse on every Creator load.
3. **Move [insights-engine.js](../../insights-engine.js) into the lazy `loadStatsPage` / `loadStatsInsights` flow.** Currently eager on Creator pages even though only stats consumes it.
   - Measurement: Performance panel "Scripting" total on [create.html](../../create.html) cold-load before vs. after; expect ≈ 23 KB less script eval.
4. **Apply babel-cache wrapper to [manager-app.js](../../manager-app.js) and the `stitch.html` copy of [tracker-app.js](../../tracker-app.js).** Both currently use raw `<script type="text/babel">`.
   - Measurement: open each page with `localStorage.clear()`, take a Performance recording, note the `babel.transform` self-time on `manager-app.js` (≈ 200 ms expected) / `tracker-app.js` (≈ 400 ms expected). Apply, reload twice, measure again — second-load Babel time should drop to ~0.
5. **Split [creator/bundle.js](../../creator/bundle.js) (874 KB) into Core + Edit + Export.** Mirror the existing import-wizard split pattern; load Edit/Export bundles via `loadScript` on tab activation.
   - Measurement: cold-load [create.html](../../create.html), DevTools Network → record `Transferred` for `bundle.js`. Target: ≤ 450 KB initial, with Edit (~250 KB) and Export (~150 KB) chunks deferred until tab click.
6. **Split [components.js](../../components.js) into `components-core.js` (Tooltip, Section, SliderRow, EmptyState, AppInfo*) and `components-stats.js` (StatsDashboard, GlobalStatsDashboard, StatsContainer, MonthCalendar, DailyBarChart, ColourTimeline, MilestoneTracker, SectionGrid, ComparisonView, ProjectComparison, RingChart, MetricCard, etc.).** Load `components-stats.js` only from pages that use the Stats UI (currently bundled with `loadStatsPage`).
   - Measurement: line-count split (~1,400 lines core + ~880 lines stats); cold-load [home.html](../../home.html), Network tab `components.js` transfer drops from 148 KB to ≈ 95 KB.
7. **Run Chrome DevTools Coverage on each page for `styles.css` and split.** See instruction above.
   - Measurement: per-page "Unused bytes" before vs. after split; aim for ≥ 50 % reduction in CSS bytes shipped to home.

### I2 — Medium

8. **Stop precaching [pdf.worker.min.js](../../pdf.worker.min.js) (1 MB) and [assets/fontkit.umd.min.js](../../assets/fontkit.umd.min.js) (741 KB) at SW install.** Both are exclusively loaded on demand (PDF import / PDF export). Precaching them costs every first-time installer 1.7 MB of network they may never use. Switch to runtime stale-while-revalidate.
   - Measurement: in [sw.js](../../sw.js#L54-L68), remove from `PRECACHE_URLS`; bump `CACHE_NAME`. Service worker install size drops from current ~3.5 MB to ~1.8 MB. Confirm export/import still hit the runtime cache after first use.
9. **Idle-load [help-drawer.js](../../help-drawer.js) (63 KB), [preferences-modal.js](../../preferences-modal.js) (80 KB), [command-palette.js](../../command-palette.js) (27 KB), [onboarding-wizard.js](../../onboarding-wizard.js) (21 KB) on home.html.** Wrap their `<script>` tags behind `requestIdleCallback`.
   - Measurement: home.html Lighthouse "Total JavaScript" → expect ≈ 190 KB drop on initial load.
10. **Defer or idle-load [sync-engine.js](../../sync-engine.js) (71 KB) on home.html.** It only matters when a sync gate fires; safe to delay 200–500 ms.
   - Measurement: same as #9.
11. **Pre-transpile JSX at build time** (one extra Node step in `build-creator-bundle.js` flow). Removes Babel Standalone (3 MB CDN) from the critical path on first load; keep it `defer` as a fallback.
   - Measurement: cold-load over throttled 3G (DevTools "Slow 3G"), TTI on home.html before vs. after.
12. **Audit [home-screen.js](../../home-screen.js) (101 KB) for what is dead on Creator/Manager.** Only `MultiProjectDashboard` is reused outside home. Remove the rest from those pages by splitting.
   - Measurement: line-walk by exported symbol; create `home-screen-shared.js` with the dashboard helpers and load only that on Creator/Manager.

### I3 — Low

13. **Verify the wizard preload guard at [stitch.html](../../stitch.html#L93-L114).** The conditional `requestIdleCallback` block looks correct, but a static `<script src="creator/import-wizard-bundle.js">` would not be — re-check that nothing else loads it eagerly.
14. **Audit `<kbd>`-formatting helpers** for duplication across [shortcuts.js](../../shortcuts.js), [help-drawer.js](../../help-drawer.js), [command-palette.js](../../command-palette.js). Likely candidate for one shared `formatKey()`.
15. **Check whether `home-app.js` actually uses JSX.** If it is pure `React.createElement`, the file does not need Babel and could be loaded as a plain script (it already is — but confirm no `<` JSX literal sneaks in to break that path).

### I4 — Hygiene

16. **Stop committing `creator/bundle.js` and `creator/import-wizard-bundle.js`.** The repo memory and `00_PERFORMANCE_CONTEXT.md` already note these inflate `.git` to 107 MB. Add to `.gitignore` and document a `npm run build` step that runs in `prebuild`/CI.
17. **Audit `window.*` assignments in [tracker-app.js](../../tracker-app.js), [stats-page.js](../../stats-page.js), [manager-app.js](../../manager-app.js) for unused exports.** Out of scope for this read-only pass; flag for Agent 2 (React render hot-paths).
