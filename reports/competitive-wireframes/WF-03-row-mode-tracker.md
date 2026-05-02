# WF-03: Row Mode in Stitch Tracker

**Addresses:** FI-03, R11
**Phase:** 2 (medium effort)
**Location:** Stitch Tracker (stitch.html / tracker-app.js)

---

## Tracker Toolbar — Row Mode Toggle

```
┌─────────────────────────────────────────────────────────────────┐
│  [Back]   Autumn Barn — 48% complete                   [Menu]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Mode:  [ Cell ]  [ Row  ]            [Zoom -] 100% [Zoom +]   │
│                                                                 │
│  (Row mode selected:)                                           │
│  [ Cell ]  [ Row  ]    ◀ Prev row    Row 14 / 80    Next ▶      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**In Cell mode (default):** existing behaviour — tap any stitch to mark done.
**In Row mode:** tap ◀/▶ to navigate rows; current row is highlighted; other
rows are dimmed.

---

## Canvas in Row Mode

```
┌──────────────────────────────────────────────────────────────┐
│  Row 12:  ░░░░░░░░░░░░░░░░░░░░░░  (dimmed — done)            │
│  Row 13:  ░░░░░░░░░░░░░░░░░░░░░░  (dimmed — done)            │
│                                                              │
│  Row 14:  ████████████████████████  ← CURRENT ROW           │
│           [clear, full contrast, white background]           │
│                                                              │
│  Row 15:  ░░░░░░░░░░░░░░░░░░░░░░  (dimmed — not done)        │
│  Row 16:  ░░░░░░░░░░░░░░░░░░░░░░  (dimmed — not done)        │
│                                                              │
│  (Stitching row 14: tap any stitch to mark done)             │
└──────────────────────────────────────────────────────────────┘
```

**Dimming:** non-current rows rendered at ~40% opacity using CSS filter.
**Current row:** full opacity, subtle highlight background (--accent at 8% alpha).

---

## Row Counter Behaviour

```
  Row 14 / 80

  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░
  Rows 1–13 complete                Row 80

  14 / 80 rows done
```

Row completeness: a row is "done" when all stitches in that row are marked.
The row counter shows the current row's number, not how many rows are complete.

---

## Navigation: Reaching a Done Row

If the user navigates back to a row that is fully marked:

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  Row 12  (all done)                                          │
│                                                              │
│  ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓          │
│                                                              │
│  This row is complete.  [Undo last stitch]  [Mark undone]    │
└──────────────────────────────────────────────────────────────┘
```

---

## Mobile Layout

On mobile (portrait), the row navigation bar moves below the canvas:

```
┌──────────────────────────────────────┐
│  Autumn Barn                 [Menu]  │
│  Mode: [Cell] [Row]    48% done      │
├──────────────────────────────────────┤
│                                      │
│       Canvas (row 14 highlighted)    │
│                                      │
├──────────────────────────────────────┤
│  ◀ Prev    Row 14 / 80    Next ▶     │
└──────────────────────────────────────┘
```

This keeps the row navigation within thumb reach while the canvas is full-width.

---

## State Machine

```
[Cell mode]   ──── toggle ────▶   [Row mode, row 1]
                                       │
                              ◀ / ▶ navigation
                                       │
                              [Row mode, row N]
                                       │
                              ──── toggle ──────▶   [Cell mode]
                              (row state discarded on toggle)
```

Row position is session-local (not persisted to IndexedDB). On page reload,
row mode is off and the user starts in cell mode.

---

## Accessibility Notes

- Row counter has `aria-label="Row 14 of 80"`
- Prev/Next buttons: `aria-label="Previous row"` / `"Next row"`
- Dimmed rows remain in DOM (not `display:none`) to allow screen readers to read stitch states
- Mode toggle has `role="group"` with `aria-label="Stitch mode"`
