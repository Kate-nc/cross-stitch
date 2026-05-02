# Stats Systemic Issues

---

## Pattern 1: Stash Staleness — Same Root Cause Across Four Components

**Affected components:** `GlobalStatsDashboard` (stats-page.js), `StatsShowcase` (stats-page.js), `useInsightsData` hook (stats-insights.js), `TrackerApp` (tracker-app.js)

**Root cause:** All four components load stash data in a one-shot `useEffect([], ...)` hook on mount. None subscribe to the `cs:stashChanged` event that `StashBridge` dispatches whenever the stash is modified.

**Why this happened:** The `cs:stashChanged` event was added to `home-app.js` and `manager-app.js` (the primary stash-owning pages) early in development. The stats and tracker pages were built later and use stash data read-only, so the subscription was not added as an afterthought.

**Systemic fix:** In each component's mount `useEffect`, add the `cs:stashChanged` (and where applicable `cs:projectsChanged`) listener that re-fetches stash data. Because all four components already have a `load()` async function inside their effect, the fix is identical across all four: extract `load` to a ref or re-call it from the event handler.

**Pattern to standardise:** All components that consume stash data should follow the pattern established in `home-app.js`:
```js
useEffect(() => {
  load(); // initial load

  const reloadOnStashChange = () => load();
  window.addEventListener('cs:stashChanged', reloadOnStashChange);
  return () => window.removeEventListener('cs:stashChanged', reloadOnStashChange);
}, []);
```

---

## Pattern 2: Colour as Bare ID — Two Instances, One Root Behaviour

**Affected locations:**
- `stats-page.js` Colour Fingerprint: `usedNotOwned` and `ownedNotUsed` are string arrays
- `creator/ProjectTab.js` kitting check: missing thread list shows "DMC N" text

**Root cause:** Both locations are list-building code paths where the developer computed the set of IDs correctly but stopped short of enriching them with visual data (`rgb`, `name`). The `Swatch` component exists and is used correctly in many other places; these two were overlooked.

**There is no missing shared component.** The `Swatch` component in `stats-page.js` and the swatch div pattern in `creator/ProjectTab.js` are already adequate — they just need to be applied at these two sites. No new component needed; two targeted fixes resolve all bare-ID rendering.

**Pattern to follow:** Any code that builds a list of thread IDs for display should always call `findThreadInCatalog(brand, id)` and include `{ id, name, rgb }` in the data shape. The render site should never receive a bare string where a visual colour is expected.

---

## Pattern 3: Load-Once Architecture for Read-Only Stash Consumers

Three of the four stale components (stats-page.js, stats-insights.js, tracker-app.js) are read-only consumers of stash data — they never write to the stash. Yet they all load stash data as if it's static configuration rather than live user data.

**Architectural observation:** The app has a well-designed event system (`cs:stashChanged`, `cs:projectsChanged`, `cs:backupRestored`) specifically for this purpose. The event system is correctly implemented in `StashBridge` (dispatches on every write) and consumed by `home-app.js` and `manager-app.js`. The stats and tracker pages simply need to join the same subscription club.

**No architectural overhaul needed.** The fix is not a new state management layer but a consistent application of the existing event pattern to the three missing consumers.

---

## Pattern 4: No Shared "Thread with Swatch" Display Component

**Observation:** Across the app, the "thread identity" display (swatch + brand + id + name) is implemented independently in many places:
- Stats page: `Swatch` component (local to stats-page.js)
- Manager: inline swatch div with `background: rgb(...)`
- Tracker: `.tsp-sw` div + text spans
- Creator Legend: table cells with 20×20 div
- Creator ProjectTab: 16×16 inline div

Each implementation is correct for its context. However, the two broken rendering sites (Colour Fingerprint, kitting check) could have benefited from a shared "ThreadChip" component.

**Recommendation:** Do not create a new component now. The existing `Swatch` helper in stats-page.js and the inline swatch pattern in creator/ are adequate. What matters is that the data shape includes `rgb` before the render site. Fix the two specific cases rather than introducing a new component whose adoption would require changes in many files.

---

## What Is NOT a Systemic Issue

- **Number formatting:** Consistent across the app. No systemic problem.
- **Percentage calculation:** No errors found. All divisions guard against 0 total.
- **Color accuracy:** All swatches use actual DMC/Anchor RGB values from dmc-data.js / anchor-data.js. No inaccurate colours.
- **Cross-feature stats computation:** The complex multi-source stats (Coverage Ratio, Use What You Have, SABLE) compute correctly — they just become stale because of pattern 1 above.
