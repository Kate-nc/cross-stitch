# Stats Fix List — Prioritised

Consolidated from all Phase 1 audit findings.

---

## Critical — data is wrong or missing

### FIX-1: Stats page does not refresh on `cs:stashChanged`

**What:** Every stash-derived stat on the Stats page (Coverage Ratio, Colour Families, HueWheel, DMC Coverage, SABLE, Duplicate Alerts, Stash Age, Most-Used stash badge, Threads Never Used, Colour Fingerprint, Buying Impact, Brand Alignment, Use What You Have) stays permanently stale after any stash mutation.

**Failure type:** A — Source doesn't update display  
**Files affected:** `stats-page.js` (GlobalStatsDashboard, StatsShowcase)  
**Specific location:** `GlobalStatsDashboard` — `useEffect([], ...)` at line ~1022  
**Specific location:** `StatsShowcase` — `useEffect([], ...)` at line ~830  
**Code change needed:**
- In the existing `useEffect` hook that loads all data, subscribe to `cs:stashChanged` and `cs:projectsChanged` to re-run the load function.
- Since the stats page loads stash AND project data in a combined async block, a single reload function handles both.

**Tests:** `tests/statsPage.test.js` (need to create)  
**Effort:** Quick (3 lines per component)

---

### FIX-2: Stats page does not refresh on `cs:projectsChanged`

**What:** All project-derived stats (Lifetime Stitches, Active Projects, Finished This Year, Weekly Streak, Recent Pace, Oldest WIPs, Designer Leaderboard, Quarter Portfolio, Difficulty Chart) stay stale after any project is created, tracked, or archived.

**Failure type:** A  
**Files affected:** `stats-page.js` (GlobalStatsDashboard)  
**Code change needed:** Same as FIX-1 — include `cs:projectsChanged` in the re-load subscription  
**Tests:** Same test file  
**Effort:** Quick (combined with FIX-1)

---

### FIX-3: `stats-insights.js` stash data never refreshes

**What:** The `useInsightsData` hook loads stash once on mount. The `ColourHeatmap` stash-owned badge stays stale after stash changes.

**Failure type:** A  
**Files affected:** `stats-insights.js`  
**Specific location:** `useInsightsData` hook — `useEffect([], ...)` at line ~85  
**Code change needed:** Add `cs:stashChanged` listener that re-runs the load  
**Tests:** `tests/statsInsights.test.js` (need to create)  
**Effort:** Quick

---

### FIX-4: Tracker thread ownership pips never refresh after stash changes

**What:** The Tracker side panel "To buy / In stash" split and per-thread ownership pip use stale stash data from mount. Adding a thread to the stash in the Manager while the Tracker is open shows outdated "To buy" indicators.

**Failure type:** A  
**Files affected:** `tracker-app.js`  
**Specific location:** `useEffect([], ...)` at line 1400  
**Code change needed:** Add `cs:stashChanged` listener that calls `StashBridge.getGlobalStash().then(setGlobalStash)`  
**Tests:** `tests/trackerStashStaleness.test.js` (need to create)  
**Effort:** Quick

---

## High — display is misleading or incomplete

### FIX-5: Colour Fingerprint shows raw DMC IDs without swatches

**What:** The "Used a lot but not stocked" and "Stocked but rarely used" lists in the Colour Fingerprint card show bare numbers like "310 / 3801 / 826". No visual indication of what colour these represent.

**Failure type:** E — Rendering wrong  
**Files affected:** `stats-page.js`  
**Specific location:** `colourFingerprint` useMemo at line ~1518; render at lines 2095, 2101  
**Code change needed:**
1. Enrich `usedNotOwned` and `ownedNotUsed` in the useMemo to include `{id, name, rgb}` objects.
2. In the render, use `Swatch` component + "DMC N — name" label.

**Tests:** `tests/statsPage.test.js` — colour rendering assertions  
**Effort:** Quick

---

### FIX-6: Stash Age card "Oldest tracked" shows name only — no swatch

**What:** The "Oldest tracked: [name] · [date]" line has no colour swatch. A user can't identify the colour without memorising the name.

**Failure type:** E  
**Files affected:** `stats-page.js`  
**Specific location:** Stash Age card render at line ~1989  
**Code change needed:** Look up thread via `findThreadInCatalog` from `ageData.oldest`, prepend a `Swatch`  
**Tests:** inline snapshot or rendering test  
**Effort:** Quick

---

### FIX-7: Showcase "Oldest stash thread" shows name only — no swatch

**What:** Same issue as FIX-6, in the Showcase tab's "Stash Age" oldest-item line (~L996 of StatsShowcase).

**Failure type:** E  
**Files affected:** `stats-page.js` (StatsShowcase)  
**Specific location:** `ageData.oldest` render in `StatsShowcase` at ~L996  
**Code change needed:** Same as FIX-6  
**Effort:** Quick

---

### FIX-8: Kitting check "Missing threads" list in ProjectTab has no swatches

**What:** After clicking "Kit This Project" in the Creator, the result list shows "DMC N (need N sk)" as plain text. No colour swatch to help identify threads at a glance.

**Failure type:** E  
**Files affected:** `creator/ProjectTab.js`  
**Code change needed:** For each missing thread in the kitting result, look up `rgb` from `ctx.cmap` or `findThreadInCatalog`, render a small swatch inline.  
**Tests:** Would require UI test; low ROI for a unit test  
**Effort:** Moderate (need to verify exact code structure first)

---

## Medium — formatting and consistency

### FIX-9: Duplicate Alerts card missing thread name

**What:** Duplicate Alert rows show "DMC N" but not the thread name alongside. Clicking to the stash is the only way to find the name.

**Failure type:** E  
**Files affected:** `stats-page.js`  
**Specific location:** Line ~1931 in the Duplicate Alerts map  
**Code change needed:** Add thread name lookup from stash data or `findThreadInCatalog`, display "DMC N — name"  
**Effort:** Quick

---

### FIX-10: Threads Never Used swatches: code not visible without hover

**What:** The "Threads Never Used" sample is shown as 24×24 swatch squares with colour ID and name in a `title` tooltip only. Users on touch devices can't see the thread identity.

**Failure type:** E  
**Files affected:** `stats-page.js`  
**Specific location:** Line ~2020 in Threads Never Used section  
**Code change needed:** Change from square-only swatches to swatch + id rows (similar to Most-Used format), or add an `aria-label`.  
**Effort:** Moderate (UI change, could affect layout)

---

### FIX-11: Empty stash KPIs on Home lack guidance

**What:** When stash is empty, the Home Stash tab shows bare "0"s for Skeins, Colours, Patterns. No CTA guides the user to add threads.

**Files affected:** `home-app.js`  
**Effort:** Moderate

---

## Low — enhancements

### FIX-12: Flash of "0" in Home Stats tab before data arrives

**Files affected:** `home-app.js`  
**Code change needed:** Initialise `lifetimeStitches` to `null` and show "—" until data arrives  
**Effort:** Quick

---

## Fix Order (recommended)

1. **FIX-1 + FIX-2** together — one useEffect in stats-page.js GlobalStatsDashboard (handles both stash + project staleness; highest impact, many stats fixed at once)
2. **FIX-3** — stats-insights.js (quick, same pattern)
3. **FIX-4** — tracker-app.js (quick, same pattern)
4. **FIX-5** — Colour Fingerprint rendering (visible bug, easy fix)
5. **FIX-6 + FIX-7** — Stash Age oldest thread swatch (quick, same line pattern)
6. **FIX-8** — Kitting check missing thread swatches
7. **FIX-9** — Duplicate Alerts thread name
8. **FIX-10** — Threads Never Used touch accessibility
9. **FIX-11, FIX-12** — Empty states and loading (low priority)
