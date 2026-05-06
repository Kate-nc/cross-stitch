# Stats Data Flow Diagnosis

For every broken stat, traces the full pipeline from source to screen and identifies the exact failure point.

---

## Failure Type Definitions

- **A** — Source doesn't update the display (event not subscribed)
- **B** — Computation is stale (missing dep, cached without invalidation)
- **C** — Computation produces wrong result
- **D** — Delivery is broken (component doesn't receive the value)
- **E** — Rendering is wrong (receives correct value but displays it incorrectly)
- **F** — Timing issue (correct eventually but stale at first view)

---

## 1. Stash Staleness on Stats Page

**Affected stats:** S4, S8–S16, S18–S23 (Coverage Ratio, SABLE, Colour Families, HueWheel, DMC Coverage, Ready to Start, Use What You Have, Buying Impact, Duplicate Alerts, Stash Age, Most-Used stash badge, Threads Never Used, Colour Fingerprint, Brand Alignment)

**Failure type: A**

### Data flow

```
IDB stitch_manager_db (threads)
        │ user adds/removes thread in Manager
        ▼
StashBridge.setStashEntry() / removeStashEntry()
        │ writes to IDB
        │ dispatches window 'cs:stashChanged'
        ▼
window event 'cs:stashChanged'
        │
        ├─► home-app.js   ✅ subscribed → reloadCurrentTab()
        ├─► manager-app.js ✅ subscribed → handleStashChanged()
        │
        └─► stats-page.js  ❌ NOT subscribed
            stats-insights.js ❌ NOT subscribed
            tracker-app.js    ❌ NOT subscribed
```

**Exact code locations:**

`stats-page.js` — `GlobalStatsDashboard` component — line 1022:
```js
useEffect(() => {
  // ... loads stash once
}, []);   // ← empty deps, no stashChanged listener anywhere in the component
```

`stats-insights.js` — `useInsightsData()` — line 85:
```js
useEffect(() => {
  async function load() {
    // ... StashBridge.getGlobalStash() called once
  }
  load();
  return () => { cancelled = true; };
}, []);   // ← no listener
```

`tracker-app.js` — line 1400:
```js
useEffect(() => {
  if (typeof StashBridge !== 'undefined') {
    StashBridge.getGlobalStash().then(setGlobalStash)...
  }
}, []);   // ← no listener
```

**Fix:** In each component's `useEffect`, also add:
```js
const handler = () => StashBridge.getGlobalStash().then(setGlobalStash);
window.addEventListener('cs:stashChanged', handler);
return () => window.removeEventListener('cs:stashChanged', handler);
```

For stats-page.js `GlobalStatsDashboard`, a full `reload()` call (which re-fetches all data) is cleaner than per-state refreshes, since many stats depend on both stash AND project data.

---

## 2. Project Data Staleness on Stats Page

**Affected stats:** S1–S3, S5–S7, S14, S17, S22–S25 (Lifetime stitches, Active/Finished counts, Streaks, Pace, WIPs, Designer Leaderboard, Quarter Portfolio, Difficulty Scatter)

**Failure type: A**

### Data flow

```
IDB CrossStitchDB (projects)
        │ user tracks stitches / creates / archives project
        ▼
ProjectStorage.save() / tracker recordAutoActivity()
        │ dispatches window 'cs:projectsChanged'
        ▼
window event 'cs:projectsChanged'
        │
        ├─► home-app.js   ✅ subscribed
        └─► stats-page.js  ❌ NOT subscribed
```

**Exact location:** `stats-page.js` — `GlobalStatsDashboard` — same `useEffect([], ...)` block. Also `useEffect([])` for `projectDetails` and `richProjects` at line ~1248:
```js
useEffect(() => {
  // ... loads projectDetails + richProjects
}, []);   // ← no cs:projectsChanged listener
```

**Fix:** Register `cs:projectsChanged` and `cs:backupRestored` listeners that re-run the initial load.

---

## 3. Colour Fingerprint — Bare ID Rendering (S21)

**Failure type: E**

### Data flow

```
mostUsed   (top-20 colours from ProjectStorage.getMostUsedColours)
stash      (top-20 owned by skein count from stash state)
        │ useMemo([mostUsed, stash])
        ▼
colourFingerprint = {
  jaccardPct,
  usedNotOwned: ["310", "3801", "826"],   ← bare string IDs
  ownedNotUsed: ["712", "822", "739"]     ← bare string IDs
}
        │
        ▼
render (stats-page.js L2095, L2101):
  colourFingerprint.usedNotOwned.map(id =>
    h('div', {...}, id)   // ← id = "310" — just a number string
  )
```

**Root cause:** The `colourFingerprint` computation (line 1518–1519) produces arrays of raw ID strings. The render site never looks up the thread info.

**Fix (two-part):**
1. In the `colourFingerprint` useMemo, enrich the arrays:
```js
const usedNotOwned = [...usedIds].filter(x => !ownedIds.has(x)).slice(0, 5)
  .map(id => { const t = findThreadInCatalog('dmc', id); return { id, name: t ? t.name : id, rgb: t ? t.rgb : [128,128,128] }; });
const ownedNotUsed = [...ownedIds].filter(x => !usedIds.has(x)).slice(0, 5)
  .map(id => { const t = findThreadInCatalog('dmc', id); return { id, name: t ? t.name : id, rgb: t ? t.rgb : [128,128,128] }; });
```

2. In the render site, use `Swatch` + label:
```js
colourFingerprint.usedNotOwned.map(t =>
  h('div', { key: t.id, style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)' } },
    h(Swatch, { rgb: t.rgb }),
    t.id + ' — ' + t.name
  )
)
```

---

## 4. Showcase Oldest Stash Thread — No Swatch (SC2)

**Failure type: E**

### Data flow

```
StashBridge.getStashAgeDistribution()
        │ returns { oldest: { id, name, addedAt } }
        ▼
setAgeData(results[3])
        │
        ▼
render (stats-page.js ~L996):
  'Oldest: ' + (ageData.oldest.name || ageData.oldest.id) + ' · in stash since ' + fmtDate(ageData.oldest.addedAt)
  // ← name only, no colour swatch
```

The `ageData.oldest` object has the stash key (from `StashBridge.getStashAgeDistribution`). Checking that function:

**Fix:**
```js
ageData.oldest && h('div', { style: {...} },
  (() => {
    const colon = (ageData.oldest.id || '').indexOf(':');
    const brand = colon >= 0 ? ageData.oldest.id.slice(0, colon) : 'dmc';
    const id = colon >= 0 ? ageData.oldest.id.slice(colon + 1) : (ageData.oldest.id || '');
    const info = typeof findThreadInCatalog === 'function' ? findThreadInCatalog(brand, id) : null;
    return h('span', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
      info && h(Swatch, { rgb: info.rgb }),
      'Oldest tracked: ' + (ageData.oldest.name || id) + ' · ' + new Date(ageData.oldest.addedAt).toLocaleDateString(...)
    );
  })()
)
```

The same fix applies to the Showcase tab's "oldest stash item" display.

---

## 5. Stash Age Card Oldest Thread — No Swatch (CR8)

**Failure type: E** — Same pattern as CR3/SC2.

`stats-page.js` line ~1989:
```js
ageData.oldest && h('div', { ... },
  'Oldest tracked: ' + (ageData.oldest.name || ageData.oldest.id) + ' · ' + ...
)
```

**Fix:** Same as SC2 fix above.

---

## 6. Kitting Check Missing Threads — No Swatch (CR13)

**Failure type: E**

In `creator/ProjectTab.js`, the "Kit This Project" modal result shows missing threads as text:
```js
// Approximate - actual code in kitting section
h('div', null, 'DMC ' + id + ' (need ' + skeins + ' sk)')
```

**Fix:** For each missing thread, look up `ctx.cmap[id]` or `findThreadInCatalog('dmc', id)` for the rgb, then render a `Swatch` before the text.

---

## 7. Tracker Stash Ownership Staleness (T23)

**Failure type: A**

```
Stash Manager: user adds "dmc:310"
        │ StashBridge.setStashEntry('dmc', '310', { owned: 2 })
        │ dispatches 'cs:stashChanged'
        ▼
tracker-app.js globalStash state
        │ loaded once on mount at line 1400
        │ useEffect([], ...) — no listener for 'cs:stashChanged'
        ▼
TrackerProjectRail (line 535):
  const gs = (globalStash && (globalStash['dmc:' + d.id] || globalStash[d.id])) || null;
  // gs is stale → shows "To buy" when user has just added the thread
```

**Fix:** Add `cs:stashChanged` listener in tracker-app.js that calls `StashBridge.getGlobalStash().then(setGlobalStash)`.

---

## Summary Table

| # | Stat | Failure type | File | Line | Fix summary |
|---|---|---|---|---|---|
| F1 | All stash-dependent stats on stats-page | A | stats-page.js | 1022 | Add `cs:stashChanged` → reload |
| F2 | All project-dependent stats on stats-page | A | stats-page.js | 1022, 1248 | Add `cs:projectsChanged` → reload |
| F3 | Stash-dependent stats in stats-insights | A | stats-insights.js | 85 | Add `cs:stashChanged` → reload |
| F4 | Tracker thread ownership pips | A | tracker-app.js | 1400 | Add `cs:stashChanged` → re-fetch stash |
| F5 | Colour Fingerprint bare ID lists | E | stats-page.js | 1518–1519, 2095, 2101 | Enrich computation + render with Swatch |
| F6 | Showcase oldest stash — no swatch | E | stats-page.js | ~996, ~1989 | Look up thread + render Swatch |
| F7 | Stash Age card oldest thread — no swatch | E | stats-page.js | ~1989 | Same as F6 |
| F8 | Kitting check missing threads — no swatch | E | creator/ProjectTab.js | kitting section | Lookup rgb + prepend Swatch |
