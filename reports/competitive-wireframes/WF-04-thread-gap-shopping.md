# WF-04: Thread Gap Shopping List

**Addresses:** FI-05, R10
**Phase:** 2 (medium effort)
**Location:** Pattern library in Stash Manager (manager.html / manager-app.js)

---

## Pattern Library Entry — Before (current state)

```
┌─────────────────────────────────────────────────────────────┐
│  Autumn Barn                                  [Wishlist ▾]  │
│  80 × 60 stitches · 18 colours                              │
│  [Open in tracker]  [Edit]  [Export]  [Delete]              │
└─────────────────────────────────────────────────────────────┘
```

---

## Pattern Library Entry — After (proposed)

```
┌─────────────────────────────────────────────────────────────┐
│  Autumn Barn                                  [Wishlist ▾]  │
│  80 × 60 stitches                                           │
│                                                             │
│  Threads: 12 in stash, 6 to buy                [Details ▾] │
│           ████████████░░░░░░  (stash coverage bar)         │
│                                                             │
│  [Open in tracker]  [Edit]  [Export]  [Delete]              │
└─────────────────────────────────────────────────────────────┘
```

The stitch coverage bar shows how much of the pattern palette is in stash
(green = owned; grey = not owned).

---

## Expanded Details Panel

Clicking [Details] expands:

```
┌─────────────────────────────────────────────────────────────┐
│  Autumn Barn                                  [Wishlist ▾]  │
│  80 × 60 stitches                                           │
│                                                             │
│  Threads: 12 in stash, 6 to buy                [Details ▲] │
│           ████████████░░░░░░                               │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  IN YOUR STASH (12)          NEED TO BUY (6)         │   │
│  │                                                      │   │
│  │  ■ DMC 310  Black            ■ DMC 356  Terra Cotta  │   │
│  │  ■ DMC 317  Pewter Grey      ■ DMC 407  Desert Sand  │   │
│  │  ■ DMC 400  Dark Mahogany    ■ DMC 422  Light Hazel  │   │
│  │  ■ DMC 433  Brown            ■ DMC 435  Light Brown  │   │
│  │  ■ DMC 436  Tan              ■ DMC 801  Coffee Brown │   │
│  │  ...9 more ▸                 ■ DMC 869  Hazel        │   │
│  │                                                      │   │
│  │  [Add 6 threads to shopping list]                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  [Open in tracker]  [Edit]  [Export]  [Delete]              │
└─────────────────────────────────────────────────────────────┘
```

**"Add 6 threads to shopping list"** sets `toBuy: true` on each missing thread
in the stash database.

---

## Shopping List View (in Stash Manager)

After threads are flagged, the existing "To buy" filter in the stash shows them:

```
  STASH MANAGER
  ┌─────────────────────────────────────────────────────────┐
  │  All  |  To buy (6)  |  Low stock  |  By colour family  │
  └─────────────────────────────────────────────────────────┘

  To buy:
  ┌────────────────────────────────────────────────────────┐
  │  ■ DMC 356  Terra Cotta    Needed for: Autumn Barn     │
  │             [Mark as owned]  [Remove from list]        │
  │                                                        │
  │  ■ DMC 407  Desert Sand    Needed for: Autumn Barn     │
  │             [Mark as owned]  [Remove from list]        │
  │  ...4 more                                             │
  └────────────────────────────────────────────────────────┘

  [Export shopping list as text]
```

---

## Multi-Pattern Shopping List

When multiple wishlist patterns are flagged:

```
  To buy (11 threads across 3 patterns):

  Needed for multiple patterns:
  ■ DMC 310  Black       — Autumn Barn, Winter Cottage, Spring Garden
  ■ DMC 356  Terra Cotta — Autumn Barn, Winter Cottage

  Needed for one pattern:
  ■ DMC 407  Desert Sand — Autumn Barn
  ■ DMC 422  Light Hazel — Winter Cottage
  ...

  [Export full shopping list]
```

Multi-pattern aggregation shows which threads are needed most urgently.

---

## Edge Cases

**No stash set up:**
```
  Threads: not linked to stash yet

  [Set up stash to see gap analysis]
```

**All threads owned:**
```
  Threads: all 18 in stash — you're ready to stitch!
  [Open in tracker ▶]
```

**Pattern palette is all DMC (expected) — non-DMC note:**
```
  Note: This analysis covers DMC threads only.
  Anchor threads in your stash are not yet matched.
```
(This is the known DMC-only creator limitation; surfaced transparently.)

---

## Data Flow (for implementation reference)

```
1. User opens pattern library entry with [Details]
2. Read pattern palette:
   - Load pattern JSON from CrossStitchDB (via stash-bridge.js or directly)
   - Extract unique thread IDs: pattern.pattern.map(c => c.id).filter(unique)
   - Filter out __skip__ and __empty__
3. Read stash:
   - Call stash-bridge.js → reads stash_manager_db → manager_state["threads"]
   - threads is an object keyed by "dmc:310", "anchor:403", etc.
4. Compute gap:
   - For each pattern thread ID (bare DMC id, e.g. "310"):
     - Check if "dmc:310" exists in stash AND stash["dmc:310"].owned > 0
     - If not: it's a gap thread
5. Render:
   - inStash = gap threads where match found
   - toBy = gap threads where no match found
6. "Add to shopping list" action:
   - For each toBuy thread: stash["dmc:310"].toBuy = true
   - Save updated stash to stash_manager_db
```
