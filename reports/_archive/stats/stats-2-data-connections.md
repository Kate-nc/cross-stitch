# Stats Data Connections Test Results

Static analysis of each data display against its source, testing update paths.

> Note: This is a code-based static analysis audit. Because the app has no automated
> integration test harness that exercises the full React render pipeline across pages,
> each data connection is verified by tracing: (1) the write path when source data changes,
> (2) whether any subscription/event mechanism bridges the write to the display component,
> and (3) whether the display component re-derives its value or holds stale state.

---

## Test Matrix

| # | Stat | Location | Source action | Updated? | Correct? | Notes |
|---|---|---|---|---|---|---|
| S1 | Lifetime Stitches | stats-page.js GlobalStatsDashboard | Complete stitches in Tracker | ❌ No | N/A | Loads once on mount; no `cs:projectsChanged` listener in stats-page. Must reload page |
| S2 | Active Projects count | Same | Create or archive a project | ❌ No | N/A | `projectDetails` loaded once; no event listener |
| S3 | Finished This Year | Same | Mark a project complete | ❌ No | N/A | Same |
| S4 | Coverage Ratio | Same | Add a thread to stash | ❌ No | N/A | Stash loaded once; `computeCoverage` not re-triggered on stash change |
| S5/S6 | Weekly Streak | Same | Stitch a session today | ❌ No | N/A | `richProjects` loaded once; no live reload |
| S7 | Recent Pace | Same | Stitch sessions | ❌ No | N/A | Same |
| S8/S9 | SABLE index | Same | Add threads to stash | ❌ No | N/A | `sableData` from `getAcquisitionTimeseries` loaded once |
| S10 | Colour Families | Same | Add/remove stash threads | ❌ No | N/A | `stash` state loaded once; `familyData` useMemo depends on it but never refreshes |
| S11 | HueWheel | Same | Same | ❌ No | N/A | Same |
| S12 | DMC Palette Coverage | Same | Same | ❌ No | N/A | Same |
| S13 | Ready to Start | Same | Add/remove stash threads | ❌ No | N/A | `readyToStart` loaded once |
| S14 | Use What You Have | Same | Add stash thread matching a wishlist pattern | ❌ No | N/A | `neverUsedData` depends on stash (via `useEffect([stash, loading])`), but `stash` never refreshes |
| S15 | Buying Impact | Same | Add stash thread | ❌ No | N/A | `useMemo` depends on `managerPatterns` + `stash` both loaded once |
| S16 | Duplicate Alerts | Same | Add duplicate thread | ❌ No | N/A | `stash` loaded once |
| S17 | Oldest WIPs | Same | Start stitching an older project | ❌ No | N/A | `oldestWips` loaded once |
| S18 | Stash Age | Same | Add a new thread | ❌ No | N/A | `ageData` loaded once |
| S19 | Most-Used + stash badge | Same | Add most-used colour to stash | ❌ No (badge) | N/A | `mostUsed` data loads once; stash-owned badge (built from stash state) also stale |
| S20 | Threads Never Used | Same | Add a new thread that's never been in a project | ❌ No | N/A | `useEffect([stash, loading])` depends on `stash`, which never updates |
| S21 | Colour Fingerprint IDs | Same | Stitch heavily with a new colour | ❌ No + ❌ Rendering | ❌ Plain IDs (no swatch) | Both stale AND renders as bare string IDs e.g. "310" with no colour swatch |
| S22 | Designer Leaderboard | Same | Add/update a project designer | ❌ No | N/A | `richProjects` loaded once |
| S23 | Brand Alignment | Same | Add Anchor stash thread | ❌ No | N/A | `stash` + `managerPatterns` loaded once |
| S24 | Quarter Portfolio | Same | Complete a project | ❌ No | N/A | `richProjects` loaded once |
| S25 | Difficulty vs Completion | Same | Start stitching (change completion %) | ❌ No | N/A | `richProjects` loaded once |
| SC2 | Oldest stash thread | StatsShowcase | Add an older-dated thread | ❌ No + ❌ Rendering | ❌ No colour swatch | Stash loaded once; rendered as plain text name only |
| SC3 | Ready-to-start chip | StatsShowcase | Add all needed threads | ❌ No + ❌ Rendering | ❌ No thread swatches | Stale; no thread-colour information displayed |
| H12 | Stash skeins KPI | home-app.js StashPanel | Add threads in manager while Stash tab is open | ❌ No | N/A | `refreshStash()` only fires on **tab switch**; if already on Stash tab, stash doesn't refresh. `cs:stashChanged` handler calls `reloadCurrentTab` which calls `refreshStash()` only if `tabRef.current === 'stash'` — **this is actually wired** but see note |
| H13 | Stash colours KPI | Same | Same | ✅ Yes (with caveat) | ✅ Yes | `cs:stashChanged` → `reloadCurrentTab` → `refreshStash()` — wired correctly if stash tab is active |
| H14 | Patterns KPI | Same | Add a pattern | ✅ Yes (with caveat) | ✅ Yes | Same caveat |
| T23 | Tracker thread ownership | tracker-app.js rail | Add thread to stash in another tab | ❌ No | N/A | `globalStash` loaded once on mount via `useEffect([])`; no `cs:stashChanged` listener |
| T17–T22 | Tracker skein calc | Same | Change fabric count in creator | ✅ Yes | ✅ Yes | Derived from `pal` + `fabricCt` via `useMemo`, updates correctly within Tracker |
| M1–M8 | Manager badges/chips | manager-app.js | Add/remove thread | ✅ Yes | ✅ Yes | Manager owns its state; `setState` on every mutation + `cs:stashChanged` listener |
| I4 | ColourHeatmap stash badge | stats-insights.js | Add most-used colour to stash | ❌ No | N/A | Stash loaded once in `useInsightsData`; no `cs:stashChanged` listener |
| C10 | LegendTab "In stash" count | creator/LegendTab.js | Add thread to stash | ✅ Yes | ✅ Yes | `globalStash` refreshed on every `cs:stashChanged` via creator context |
| C23 | ProjectTab "Still to buy" cost | creator/ProjectTab.js | Add thread to stash | ✅ Yes | ✅ Yes | Derived from `ctx.toBuyList` which updates with stash |
| C25 | ProjectTab kitting check | creator/ProjectTab.js | Add thread to stash | ✅ Yes (modal) | ✅ Yes | Fetches fresh stash on button click |

---

## Detailed Failure Analysis

### Bulk stash staleness failure (affects S1–S23, SC2, SC3, T23, I4)

**Root cause:** `GlobalStatsDashboard`, `StatsShowcase`, `useInsightsData`, and `TrackerApp` all
load stash data in a one-shot `useEffect([], ...)` on mount. None registers a `window.addEventListener('cs:stashChanged', ...)` handler.

Every stash-derived stat on the Stats page (all stash tab content, coverage ratio, colour
families, HueWheel, DMC coverage, SABLE, duplicate alerts, stash age, threads-never-used,
colour fingerprint, buying impact, brand alignment) becomes permanently stale the moment the
user modifies their stash in the Manager — even in the same browser tab/session.

**Fix type: A (Source doesn't update the component)**  
The underlying IDB data changes when a user adds/removes a thread in the Stash Manager. The
`cs:stashChanged` event is dispatched correctly by `StashBridge`. But none of the stats components
subscribe to it. Adding the listener and re-fetching stash resolves the staleness for all
stash-dependent stats simultaneously.

### Project data staleness failure (affects S1–S7, S14, S17, S22–S25)

Similar to stash staleness: `richProjects`, `projectDetails`, and project-derived stats all
load once on mount. No `cs:projectsChanged` listener exists in `stats-page.js`.

**Fix type: A**  
`cs:projectsChanged` is dispatched by `ProjectStorage` writers. Stats page must subscribe.

### Colour Fingerprint text rendering failure (S21)

`colourFingerprint.usedNotOwned` and `colourFingerprint.ownedNotUsed` are arrays of plain
DMC code strings (e.g. `["310", "3801", "826"]`). They are rendered directly as
`h('div', {...}, id)` — just the numeric code as text. There is no `Swatch` component, no
colour lookup, no name display.

A user looking at this panel sees a list like "310 / 3801 / 826 / 712 / 822" — meaningless
without memorising DMC codes.

**Fix type: E (Rendering is wrong)**  
Each ID needs a `Swatch` + the thread name. The `findThreadInCatalog` function is available;
call it per ID to get `rgb` and `name`.

### Showcase oldest stash text rendering failure (SC2)

`ageData.oldest.name` is rendered as plain text with no colour swatch. The `ageData.oldest`
object contains the stash key and name from `StashBridge.getStashAgeDistribution()` but the
display never looks up or renders the actual colour.

**Fix type: E**  
Look up the thread info via `findThreadInCatalog` from `ageData.oldest`'s brand/id, then
prepend a `Swatch`.

### Tracker stash ownership pip staleness (T23)

`globalStash` is loaded once on mount in tracker-app.js. The "In stash / To buy" split in
the side panel, and the ownership pip (green check vs. "need N more") on each thread row, use
this stale snapshot. If a user adds a thread while the Tracker is open, the pip still shows
"To buy" until they reload.

**Fix type: A**  
Add `window.addEventListener('cs:stashChanged', ...)` in tracker-app.js to call
`StashBridge.getGlobalStash().then(setGlobalStash)`.

---

## Edge Case Results

| Scenario | Result | Notes |
|---|---|---|
| Pattern with 1 colour | ✅ Calculates correctly | All useMemo/map operations handle length=1 |
| Pattern with 200+ colours | ✅ Calculates correctly | No artificial caps found; large arrays handled |
| 0 stitches completed | ✅ Shows 0 | `progressPct` guards against 0 total |
| 100% completed | ✅ Shows "Complete!" | Tracker has explicit conditional |
| Empty stash | ✅ Most stats show "empty" guidance | Some fallback to blank; see stats-5 for details |
| 500+ threads in stash | ✅ Calculations correct | Linear scans; no pagination limit |
| Large pattern (400×600) | ✅ Numbers correct | 240,000 cells iterate fine; `fmtNum` formats with commas |
| Stats page with no tracking data | ✅ Shows zero / placeholder guidance | Some graceful, some blank |
