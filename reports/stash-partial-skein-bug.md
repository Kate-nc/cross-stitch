# Stash Partial Skein Bug — Diagnosis Report

## Summary

The "make from my stash" feature in Pattern Creation silently ignores partially-used skeins when deciding whether a colour is "owned". A user with `owned = 0` but `partialStatus = "about-half"` is treated identically to a user who owns nothing, causing the colour to be excluded from generated patterns, hidden in the palette sidebar, and reported as "not in stash" in statistics.

---

## Data Model

Each thread entry in `stitch_manager_db.manager_state["threads"]` has the shape:

```js
{
  owned:         number,       // integer full-skein count (Manager UI increments/decrements by 1)
  partialStatus: string|null,  // enum — see below
  tobuy:         boolean,
  // ...
}
```

`partialStatus` represents a single opened skein:

| Value | Remaining fraction | Effective skeins contributed |
|---|---|---|
| `null` | — (no open skein) | 0 |
| `"mostly-full"` | ≈ 3/4 | 0.75 |
| `"about-half"` | ≈ 1/2 | 0.50 |
| `"remnant"` | ≈ 1/4 | 0.25 |
| `"used-up"` | 0 (exhausted) | 0 |

The **effective quantity** is `owned + PARTIAL_STATUS_FRACTIONS[partialStatus]`.

---

## Root Cause

Every ownership check used a variant of:

```js
const owned = entry && entry.owned ? entry.owned : 0;
// or
if ((entry.owned || 0) > 0) ...
// or
if (entry.owned > 0) ...
```

None of these look at `partialStatus`. A user with 0 full skeins and a half-skein partial is reported as owning nothing.

---

## Confirmed Reproduction

```js
// Stash: one colour with only a partial skein
const stash = { 'dmc:310': { owned: 0, partialStatus: 'about-half' } };

// _buildAllowedPaletteFromStash in creator/useCreatorState.js:
if ((globalStash[key].owned || 0) <= 0) return; // fires! 310 is excluded

// stashStatusForChip in creator/Sidebar.js:
var owned = entry && entry.owned ? entry.owned : 0; // 0
// → status = 'needed' → chip hidden by creatorStashFilter, dot red
```

---

## Call Sites (11 total)

| # | File | Approx. line | Pattern | Impact |
|---|---|---|---|---|
| 1 | `creator/useCreatorState.js` | 118 | `(globalStash[key].owned \|\| 0) <= 0` | Excludes colour from generated pattern |
| 2 | `creator/Sidebar.js` | ~108 | `entry.owned ? entry.owned : 0` | Wrongly returns `'needed'` from `stashStatusForChip` |
| 3 | `creator/Sidebar.js` | ~130 | `entry.owned ? entry.owned : 0` | Wrongly adds to `unownedKeys` in `_trackUnowned` |
| 4 | `creator/Sidebar.js` | ~428 | `(entry.owned \|\| 0) > 0` | Excludes colour from blend picker |
| 5 | `stash-bridge.js` | ~1080 | `entry.owned ? entry.owned : 0` | Wrong warning dots via `computeUnownedPaletteIds` |
| 6 | `stash-bridge.js` | ~1093 | `!entry.owned \|\| entry.owned <= 0` | Age distribution misses partial-only threads |
| 7 | `stash-bridge.js` | ~27 | `(entry.owned)` only | `_getOwnedCount` ignores partials in conflict detection |
| 8 | `stats-insights.js` | 249 | `(stash[...].owned \|\| 0) > 0` | "In stash" dot missing in colour heatmap |
| 9 | `home-screen.js` | 1665 | `stash[k].owned > 0` | Thread not counted in stash summary |
| 10 | `home-screen.js` | 1715 | `stash[k].owned > 0` | Project stash-coverage indicator wrong |
| 11 | `home-screen.js` | 1744 | `thread.owned > 0 && owned <= threshold` | Low-stock count misses partial-only threads |
| 12 | `home-screen.js` | 1760 | `s.owned < neededSkeins` | Project "needs thread" check ignores partials |
| 13 | `home-screen.js` | 2114, 2120 | `(v.owned \|\| 0) > 0` | Stash donut stats wrong |
| 14 | `backup-restore.js` | 291 | `threadsEntry.value[id].owned > 0` | Backup summary count wrong |

---

## Fix Architecture

### New helpers in `stash-bridge.js` (before the IIFE)

Three module-level globals are defined so every page loaded after `stash-bridge.js` shares one canonical implementation:

```js
var PARTIAL_STATUS_FRACTIONS = Object.freeze({
  'mostly-full': 0.75,
  'about-half':  0.50,
  'remnant':     0.25,
});
var LOW_STASH_SKEIN_THRESHOLD = 1; // advisory warning when effective qty < this

function stashEffectiveQty(entry) { ... } // owned + partial fraction
function isColorOwned(entry) { return stashEffectiveQty(entry) > 0; }
```

All 14 call sites are routed through `isColorOwned(entry)` (ownership gate) or `stashEffectiveQty(entry)` (quantity comparison). No per-call-site re-implementation.

### Low-quantity advisory warning (Phase 3)

The existing `'partial'` status in `stashStatusForChip` already serves as the non-blocking advisory. After the fix:

- `{ owned: 0, partialStatus: 'about-half' }` → effective qty = 0.5, needed = 1 → `'partial'` (yellow dot, tooltip updated)
- The chip is **not** hidden by `creatorStashFilter` (filter only hides `'needed'`)
- The colour **is** included in pattern generation (`isColorOwned = true`)

This is purely additive: no colour moves from "owned" to "unowned" as a result of the fix.
