# Branch Audit & Gap‑Filling Brief
**Branch:** `feedback-improvements-and-onboarding`
**Date:** 23 April 2026
**Scope:** All work merged into the branch (Briefs A–E + onboarding/help/toast/command‑palette + storage/migration changes)

---

## Executive Summary

The branch ships seven major bodies of work — onboarding tour, help & hints, toast system, command palette, Brief D (Stash‑Aware Creator), Brief E (Insights dashboard), and supporting storage/migration upgrades. **All 50 test suites pass (601 tests)** and terminology lint is clean.

However, a deep audit surfaced **two CRITICAL functional defects**, **one CRITICAL data‑integrity defect**, and a long tail of accessibility, performance, and consistency gaps. The two critical functional defects silently break the user-visible promise of Brief D's stash‑constrained generation and Brief E's "owned thread" indicator on the colour heatmap. They are not caught by the existing test suite.

This brief lists every gap with a severity, file/line, and prescribed fix so the next pass can close them out.

---

## 🔴 CRITICAL — Must Fix Before Release

### C1. Stash‑constrained generation always falls back to "stash empty" path
**File:** [creator/useCreatorState.js](creator/useCreatorState.js#L671-L674), repeated at lines 757‑758, 802‑803, 868‑869.
**Symptom:** Toggling "Use only my stash" in the Creator and clicking **Generate**, **Randomise**, or **Surprise me** always shows the *"Your stash is empty — add threads to use stash‑only mode"* toast, even when the user owns hundreds of threads.

**Root cause:** `globalStash` is populated from `StashBridge.getGlobalStash()`, which returns **composite keys** (`'dmc:310'`, `'anchor:403'`). The generation code reads those keys and tries to match them against the bare DMC id list:

```javascript
Object.keys(globalStash).forEach(function(id) {           // id = 'dmc:310'
  if ((globalStash[id].owned || 0) > 0) {
    var dmcEntry = DMC.find(function(d) { return d.id === id; });   // d.id = '310' — never matches
    if (dmcEntry) allowedPalette.push(dmcEntry);
  }
});
```

`allowedPalette` therefore stays empty, the early‑exit fires, and `generate()`, `generateGallery()`, `randomise()`, and the coverage analyser all bail. **This entirely defeats Brief D's headline feature.**

**Fix (apply at all four occurrences):**
```javascript
Object.keys(globalStash).forEach(function(key) {
  if ((globalStash[key].owned || 0) <= 0) return;
  var parts = key.indexOf(':') > 0 ? key.split(':') : ['dmc', key];
  var brand = parts[0], bareId = parts[1];
  if (brand !== 'dmc') return;          // Anchor support: see G2 below
  var dmcEntry = DMC.find(function(d) { return d.id === bareId; });
  if (dmcEntry) allowedPalette.push(dmcEntry);
});
```

**Test to add:** seed `globalStash` with `{'dmc:310': {owned:1}, 'dmc:550': {owned:1}}` and assert `allowedPalette.length === 2`.

---

### C2. Owned‑thread indicator on Insights colour heatmap never lights up for blends
**File:** [stats-insights.js](stats-insights.js#L239)

```javascript
const owned = stash && stash['dmc:' + c.id] && (stash['dmc:' + c.id].owned || 0) > 0;
```

`getMostUsedColours()` can return blend ids like `"310+321"`. Querying `stash['dmc:310+321']` always misses (the stash stores only `dmc:310` and `dmc:321` separately). The green "owned" border is therefore silently dropped for every blended thread on the heatmap.

**Fix:**
```javascript
function isOwned(id) {
  if (!stash) return false;
  var ids = String(id).indexOf('+') !== -1 ? String(id).split('+').map(s => s.trim()) : [id];
  return ids.every(sub => stash['dmc:' + sub] && (stash['dmc:' + sub].owned || 0) > 0);
}
const owned = isOwned(c.id);
```

(Use `every` for "owned only if I have all components"; switch to `some` if the brief intent is "show owned if I have any component". Pick one and document in the legend.)

---

### C3. Schema v3 migration is fire‑and‑forget
**File:** [stash-bridge.js:628-630](stash-bridge.js#L628-L630)

```javascript
StashBridge.migrateSchemaToV2().then(function() {
  StashBridge.migrateSchemaToV3();          // ← not returned, not awaited
});
```

Any call to `updateThreadOwned()` immediately after page load will see `_schemaVersion < 3` and skip writing the v3 fields (`addedAt`, `lastAdjustedAt`, `acquisitionSource`, `history`). On busy pages (Manager Bulk‑Add at first paint) this can silently degrade new threads to v2 shape, breaking the SABLE timeseries and stash‑age stats.

**Fix:**
```javascript
StashBridge.migrateSchemaToV2()
  .then(function() { return StashBridge.migrateSchemaToV3(); })
  .catch(function(e) { /* swallow; migrations log internally */ });
```

---

## 🟠 HIGH — Address in next sweep

### H1. Anchor threads completely ignored by Brief D Shopping List
**File:** [creator/ShoppingListModal.js](creator/ShoppingListModal.js#L86)

```javascript
var entry = stash['dmc:' + id] || {};
var info = (typeof DMC !== 'undefined') ? DMC.find(function (d) { return d.id === id; }) : null;
```

If a pattern contains Anchor threads (e.g. after running thread‑conversion), every Anchor row reports `owned = 0` and "need to buy", and the swatch falls back to grey. Composite‑key lookup must derive the brand from the palette entry (or default profile `thread_brand`).

**Fix sketch:**
```javascript
var brand = (info && info.brand) || (profile && profile.thread_brand || 'DMC').toLowerCase();
var entry = stash[brand + ':' + id] || {};
var info = (brand === 'anchor' && typeof ANCHOR !== 'undefined')
  ? ANCHOR.find(function(d){return d.id === id;})
  : DMC.find(function(d){return d.id === id;});
```

Same patch needed in `useCreatorState.js` palette walker (C1) and in Sidebar dot indicators ([Sidebar.js:310](creator/Sidebar.js#L310)).

---

### H2. `getMostUsedColours()` mis‑attributes blend usage and ignores partial stitches
**File:** [project-storage.js:649-688](project-storage.js#L649-L688)

- Blend cells (`"310+550"`) are counted as a single id, so neither `310` nor `550` gets its share — they appear less‑used than they truly are on the heatmap.
- `halfStitches` / `partialStitches` are completely skipped, so colours that exist mostly as quarter/half stitches are under‑represented.
- `done`/`halfDone` is not consulted, so the result is "palette usage" not "stitched usage" — fine for current UI labelling, but worth noting.

**Fix:** split blend ids in the threadCounts pass; iterate `partialStitches` and credit each component proportionally.

---

### H3. Insights tab unreachable from Tracker / Manager
**Files:** [stitch.html](stitch.html), [manager.html](manager.html)

Neither page loads `insights-engine.js`, `stats-insights.js`, or the lazy loader, and neither loads `stats-page.js` either — so the Insights/Stats UI is currently only reachable from `index.html`. If the product intent is "Stats accessible everywhere" (the nav header suggests yes), add the same `<script src="insights-engine.js">` tag and `loadStatsInsights` lazy loader to both pages, plus wire a Stats route or navigation that imports `stats-page.js` consistently.

If the intent is "Stats only in the Creator app", explicitly hide the Stats nav link from the other two pages and document the decision.

---

### H4. Cross‑mode persistence: navigation can race autosave
**File:** [creator/useProjectIO.js](creator/useProjectIO.js) — `handleOpenInTracker`

The route `Creator → "Open in Tracker"` calls `ProjectStorage.save()` and then sets `window.location.href = 'stitch.html'`. If the IDB transaction is still committing when navigation begins, the browser may abort it (Chromium does this aggressively). The user lands in Tracker with stale data.

**Fix:** await both `ProjectStorage.save()` *and* `helpers.saveProjectToDB()`/`window.__flushProjectToIDB()` (whichever is in use), then navigate. The `HomeScreen` already does this for project loads ([components.js:1692](components.js#L1692)) — replicate the pattern here.

---

### H5. Lazy‑loader race on rapid tab switching
**File:** [stats-page.js:1025-1030](stats-page.js#L1025-L1030)

The lazy loader for Insights uses a 50ms `setInterval` poll *and* the `useEffect` re‑runs on every render where `tab === 'insights' && !insightsLoaded`. Clicking the tab twice in quick succession can spin up two intervals and call `loadStatsInsights` twice. The loader has its own `__statsInsightsLoading` guard so the second call is a no‑op, but the dual intervals leak until the component unmounts.

**Fix:** stash the interval id in a ref; clear before scheduling a new one; or replace polling with a one‑shot `Promise` that the loader resolves.

---

### H6. Command palette has no focus trap or focus restoration
**File:** [command-palette.js](command-palette.js#L477-L487)

- Tab key escapes the overlay, dropping focus onto the underlying page.
- On close, the previously focused element is not restored; focus falls to `<body>`.
- No `role="listbox"` on the results container (rows are `role="option"` — orphaned).
- No `aria-live` region announcing result count changes.

These are WCAG‑listed dialog/listbox patterns; add a focus trap (capture `document.activeElement` on open, restore on close, intercept Tab to cycle within the palette) and the missing roles.

---

### H7. Help action dispatches twice
**File:** [command-palette.js:151-152](command-palette.js#L151-L152)

```javascript
window.dispatchEvent(new CustomEvent('cs:openHelp'));
window.dispatchEvent(new CustomEvent('cs:openHelpDesign'));
```

Currently relies on each page only listening to its own event. Harmless today but a footgun if a page ever listens to both (e.g. a shared header). Branch on `pageKind()`.

---

## 🟡 MEDIUM — Polish, correctness in edge cases

### M1. `totalColours` recomputed inside the render path
**File:** [stats-insights.js:108-114](stats-insights.js#L108-L114)
Every render walks every project palette. Move the unique‑id set into `useStatsSummaries` (memoise on `summaries` length + last `updatedAt`), or add a `totalColours` field to `getMostUsedColours`'s return shape.

### M2. `pct` field in `getMostUsedColours()` is per‑mille, not per‑cent
**File:** [project-storage.js](project-storage.js#L649-L688)
Returned as `... / 10`. Easy to misread when rendering; either rename to `permille` or normalise to `0..100`.

### M3. Dismissed‑insight TTL is undocumented
**File:** [stats-insights.js:32-42](stats-insights.js#L32-L42)
30‑day silent restoration is sensible but should be communicated (tooltip on the "Show all hidden insights" link, e.g. *"Hidden cards reappear after 30 days"*).

### M4. Rhythm heatmap accessibility
**File:** [stats-insights.js:350-365](stats-insights.js#L350-L365)
Colour intensity is the only signal. Add: an `aria-label` summarising the peak ("Peak stitching: Saturday at 9pm, 432 stitches"), title attributes on each cell, and a screen‑reader fallback table behind `sr-only`.

### M5. Colour heatmap ownership signal is colour‑only
**File:** [stats-insights.js](stats-insights.js#L300)
A 2 px green border is the sole owned‑thread indicator. Add a corner dot, hatch, or "✓" overlay so colour‑blind users get a redundant cue.

### M6. Toast undo button missing aria-label
**File:** [toast.js:105-120](toast.js#L105-L120)
`<button>Undo</button>` is announced as just "Undo" with no context. Use `aria-label="Undo: " + opts.undoLabel`.

### M7. Insights tab loading spinner uses a global `@keyframes spin` it doesn't define
**File:** [stats-page.js](stats-page.js#L1010) (added in the Brief E wire‑up)
The spinner uses `animation: 'spin 0.8s linear infinite'`. If `styles.css` doesn't define `@keyframes spin`, the spinner is static. Verify or inline the keyframes.

### M8. `cs_user_style` localStorage key collision risk
**File:** [onboarding.js:11](onboarding.js#L11)
Used by both onboarding (persona pick) and possibly tracker style preferences. Audit `user-prefs.js` for a clash; namespace if needed (`cs_onboarding_user_style`).

### M9. Tracker registers no command‑palette page actions
**File:** `tracker-app.js`
Creator and Manager call `CommandPalette.registerPage([...])` for context‑specific actions (e.g. Save, Bulk Add). Tracker has no such call, so the palette is barren when stitching. Add at minimum: *Mark current stitch done*, *Open notes*, *Toggle highlight mode*, *Park here*.

### M10. "?" shortcut documented but never bound
**File:** [help-content.js:193](help-content.js#L193)
Shortcut list claims `?` opens help; only `Ctrl/Cmd+K` is bound in `command-palette.js`. Either bind `?` (when no input is focused) or remove the line.

### M11. `getMostUsedColours()` is a full project load × N — already noted as expensive in the brief but no caching layer exists. For Insights the result is fetched once per mount; if the user opens the tab repeatedly, it re‑runs. Cache by `(projects.length, latest updatedAt)`.

### M12. `backup-restore.js` does not reset migration markers on import
A user who restores a v2 stash backup onto a v3 device keeps `schema_version: 3` (from the backup) but lacks the v3 fields. Migrations don't re‑run because the version says 3. **Fix:** clear `schema_version` and `cs_projects_v3_migrated` after a restore, then call `StashBridge.migrateSchemaToV3()` and `ProjectStorage.migrateProjectsToV3()` explicitly.

---

## 🟢 LOW — Nice‑to‑have

- **L1.** Empty‑state message in Sidebar stash filter ([Sidebar.js:161](creator/Sidebar.js#L161)) could link to "Open Stash Manager" instead of just text.
- **L2.** Shopping list does not include cost in £ even though `DEFAULT_SKEIN_PRICE` exists. Add a "≈ £X.XX" subtotal.
- **L3.** Insights `WeeklySummaryCard` variant rotation seeds on the date — fine, but two adjacent weeks can pick the same phrasing if the seed maps similarly. Add a small offset by `lw.activeDays`.
- **L4.** Empty‑state CTA in `stats-insights.js` deep‑links to `stitch.html` even when the user has zero projects (Tracker is meaningless without one). Detect zero‑project state and route to `index.html` (Creator) instead.
- **L5.** No tests for `toast.js`, `help-content.js`, `onboarding.js` reset/resume flows. Add at least: max‑3 cap, undo callback fires once, dismiss button removes from queue, onboarding resume after partial completion.
- **L6.** `creator/ShoppingListModal.js` blend rounding is per‑aggregate (correct) but the displayed *stitches* count is rounded for *each* component independently — for "310+550" with 100 stitches, both rows show "50 stitches", which sums to 100 (good) but reads oddly. Add a tiny "(in blend)" suffix.

---

## Test Coverage Gaps

The audit relied on code reading, not test execution, for behavioural claims. The branch should add tests for:

| Area | Suggested test |
|---|---|
| C1 fix | Composite‑key extraction in `useCreatorState.generate()` |
| C2 fix | Heatmap owned indicator with blend ids |
| C3 fix | Migration ordering — call `updateThreadOwned` immediately after page load |
| H1 fix | Shopping list with mixed DMC + Anchor pattern |
| H2 fix | `getMostUsedColours` with blend cells and `partialStitches` |
| H4 fix | Open‑in‑Tracker flush guarantee |
| M9 fix | Tracker command‑palette page actions registered |

`tests/stashAwareCreator.test.js` exists but did not detect C1 — likely because it constructs `globalStash` with bare keys. Update its fixtures to use composite keys (`'dmc:310'`) so it matches what `StashBridge.getGlobalStash` actually returns.

---

## Suggested Sequencing

1. **Day 1:** C1, C2, C3 (single PR, ~2 hours, regression‑critical).
2. **Day 2:** H1, H2, H4 (data‑integrity sweep + tests).
3. **Day 3:** H3 (decide product intent first), H5, H6, H7.
4. **Day 4:** M‑series accessibility batch (M4, M5, M6, M9, M10).
5. **Backlog:** Remaining M and L items, test coverage gaps.

---

## Out of scope but worth flagging

- The branch concatenates `creator/bundle.js` (315 KB). Once stable, a one‑shot minify step would halve it.
- Multiple files duplicate `'dmc:' + id` composite‑key construction. Extract a `StashBridge.key(brand, id)` helper to centralise the convention and prevent future C1‑style bugs.
- `localStorage` keys are now numerous (`cs_*`). Consider a single namespaced object (`cs_settings = JSON.stringify({...})`) for atomic export/import.

---

*Findings synthesised from a parallel four‑agent code audit and verified by direct file reads. Any line numbers referenced were valid as of HEAD `9ee8699` "Implement E".*
