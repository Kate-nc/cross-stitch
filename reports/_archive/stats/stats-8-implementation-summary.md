# Stats Validation Report — Implementation Summary

All fixes from the Phase 2 fix list (FIX-1 through FIX-10) have been implemented and verified. This report documents what was done, how each fix was verified, and what the test coverage looks like.

---

## Commits Applied

| Commit | SHA | Description |
|---|---|---|
| 1 | `847b244` | fix(stats): refresh stash and project stats on cs:stashChanged / cs:projectsChanged |
| 2 | `16d3562` | fix(stats): render thread colour swatches in Fingerprint and Stash Age cards |
| 3 | `a7c087e` | fix(stats,creator): add thread names, accessible labels, and swatches to remaining displays |

---

## FIX-1 + FIX-2: Stats page stash and project staleness

**Files changed:** `stats-page.js` (GlobalStatsDashboard useEffect)  
**Lines changed:** `return () => { cancelled = true; };` → 9 lines subscribing to and cleaning up `cs:stashChanged`, `cs:projectsChanged`, `cs:backupRestored`.

**Stats now live-updating:**
- Coverage Ratio (stash + project)
- HueWheel, Colour Families, DMC Coverage (stash)
- SABLE chart, Stash Age, Duplicate Alerts, Threads Never Used (stash)
- Colour Fingerprint, Buying Impact, Brand Alignment, Use What You Have (stash + project)
- Lifetime Stitches, Active Projects, Finished Count, Week Streak, Pace (project)
- Designer Leaderboard, Quarter Portfolio, Difficulty Chart (project)
- Pattern Queue / Ready to Start (project + stash)

**Verification:** Tests in `tests/statsDataConnections.test.js` — 4 tests verify addEventListener / removeEventListener calls are present.

---

## FIX-3: stats-insights.js staleness

**Files changed:** `stats-insights.js` (useInsightsData useEffect)  
**Lines changed:** Same pattern as FIX-1 — subscribe + cleanup for `cs:stashChanged`.

**Stats now live-updating:**
- ColourHeatmap stash-owned badges

**Verification:** Tests in `tests/statsDataConnections.test.js` — 2 tests.

---

## FIX-4: tracker-app.js thread ownership pips staleness

**Files changed:** `tracker-app.js` (globalStash useEffect)  
**Lines changed:** Extracted `loadStash` function, subscribed to `cs:stashChanged`.

**Stats now live-updating:**
- Thread ownership pips in Tracker side panel
- "To buy" / "In stash" split in the colour count summary

**Verification:** Tests in `tests/statsDataConnections.test.js` — 2 tests.

---

## FIX-5: Colour Fingerprint bare IDs → swatches

**Files changed:** `stats-page.js` (colourFingerprint useMemo + render site)

**Before:** `usedNotOwned` and `ownedNotUsed` were `string[]` arrays of bare DMC codes like `['310', '826', ...]`.

**After:** Arrays are now `Array<{id, name, rgb}>` enriched via `findThreadInCatalog`. Render site changed from:
```js
h('div', {}, id)
```
to:
```js
h('div', { display: 'flex', gap }, h(Swatch, { rgb, size: 16 }), 'DMC N — Name')
```

**Verification:** Tests in `tests/statsDataConnections.test.js` — 3 tests (computation enrichment + both render sites).

---

## FIX-6 + FIX-7: Stash Age oldest thread — swatches

**Files changed:** `stats-page.js` (GlobalStatsDashboard Stash Age card + StatsShowcase age section)

**Before:** `'Oldest tracked: [name] · [date]'` as a plain string node.

**After:** `div[display:flex]` containing `Swatch` (14/16px, brand+id parsed from the stash key via `findThreadInCatalog`) + text span.

**Verification:** Tests in `tests/statsDataConnections.test.js` — 2 tests.

---

## FIX-8: Kitting check — missing/short thread swatches

**Files changed:** `creator/ProjectTab.js` + `creator/bundle.js` (regenerated)

**Before:** `missing.push("DMC N (need Nsk)")` — plain string.  
**After:** `missing.push({id, rgb, label:"DMC N (need Nsk)"})` — object with rgb from `findThreadInCatalog`.

Render site: each row now shows a 14px inline swatch before the label.  
Copy and Mark-as-To-Buy buttons use `.label` property (backward-compatible).

**Verification:** Visual — no unit test (requires UI mount). Bundle regenerated and full test suite passes.

---

## FIX-9: Duplicate Alerts — thread name

**Files changed:** `stats-page.js` (duplicates render)

**Before:** `d.brand.toUpperCase() + ' ' + d.id` — no name.  
**After:** `d.brand.toUpperCase() + ' ' + d.id + ' — ' + d.name` (name was already available from findThreadInCatalog in the data build, just unused in render).

**Verification:** Source-level review — `d.name` is populated in the `duplicates` useMemo at the same time `d.rgb` is.

---

## FIX-10: Threads Never Used — accessible labels

**Files changed:** `stats-page.js` (neverUsedData samples render)

**Before:** `h('div', { title: '...' })` — tooltip only, touch-invisible.  
**After:** Added `role="img"` and `aria-label="DMC N — Name"` to each swatch div.

**Verification:** Source-level review — `aria-label` attribute set from `s.brand + s.id + s.name`.

---

## Test Coverage Added

**New test file:** `tests/statsDataConnections.test.js` — 13 tests  

| Test group | Count | Coverage |
|---|---|---|
| stats-page.js live subscriptions | 4 | FIX-1, FIX-2 |
| stats-insights.js live subscription | 2 | FIX-3 |
| tracker-app.js live subscription | 2 | FIX-4 |
| Colour Fingerprint rendering | 3 | FIX-5 |
| Stash Age swatch | 2 | FIX-6, FIX-7 |

**Total tests after all changes:** 1531 (no regressions, all 136 test suites pass).

---

## Known Remaining Issues (Not In Scope)

- **FIX-11** (Empty stash zero-state CTA in home-app.js) — medium effort, not a data connection bug
- **FIX-12** (Flash of "0" on Home Stats tab) — minor, not affecting data correctness

Both are cosmetic/UX improvements that can be addressed in a separate pass.
