# touch-6 — Panel & Full-Screen Design

Two related concerns: making the tracker left panel collapsible and
adding an explicit full-screen mode. Both apply to tracker primarily;
full-screen extends to the creator.

──────────────────────────────────────────────────────────────────────
## Tracker left panel — three-state design
──────────────────────────────────────────────────────────────────────

Today the lpanel has two states: **open** (full overlay — covers
left 320 px on desktop, bottom 70 dvh on tablet/phone) and **hidden**.
We add a third state, **rail**, that sits between them.

### State 1 — Open (existing, unchanged on tablet/phone)

- Desktop ≥ 1024 px: 320 px wide left dock (current behaviour).
- Tablet 900 – 1023 px: bottom-sheet (max-height 70 dvh).
- Tablet portrait < 900 px: bottom-sheet.
- Phone < 600 px: bottom-sheet.

### State 2 — Rail (new)

A thin vertical strip on the left (desktop + tablet landscape) /
horizontal strip at the bottom (tablet portrait + phone), surfacing:

- A **highlight-colour swatch** — large (40 × 40 px), tappable, opens
  the highlight tab when clicked. Shows the current highlight colour
  if one is set, or a "no filter" indicator.
- A **legend mini-jump button** (icon `Icons.swatches` or similar) —
  taps open the legend tab.
- An **expand button** at top/end with `Icons.chevronRight` (or
  `chevronUp` for the bottom rail) — taps expand to Open state.

Width / height: 56 px (just enough to contain a 40 × 40 swatch with
8 px padding and meet the 44 px floor).

The rail is **always overlay, never push** — the canvas underneath
keeps its layout. The user pans/zooms the chart with the rail still
visible. The 56 px strip is a small permanent overlay.

### State 3 — Hidden (new on desktop; same as today on mobile)

A floating "show panel" button appears when the panel is hidden, in a
consistent position (bottom-left corner above the action bar / FAB on
mobile; top-left in the toolbar area on desktop). The icon is the
existing `tracker-hamburger`.

### Recommended defaults per viewport

| Viewport | Default state | Rationale |
|---|---|---|
| Desktop ≥ 1280 px | Open | Plenty of horizontal room |
| Desktop 1024 – 1279 px | Rail | Tighter screens benefit from canvas room |
| Tablet landscape 900 – 1023 px | Rail | Same |
| Tablet portrait 600 – 899 px | Hidden (rail-on-edge swipe-to-reveal) | Bottom-sheet eats too much vertical space if rail is shown by default |
| Phone < 600 px | Hidden | No room for a rail |

Once the user explicitly changes state, **persist their choice per
viewport class** in `UserPrefs` under `trackerLpanelState.{desktop,
tablet, phone}` ∈ `{ open, rail, hidden }`. So a user who opens on
desktop, then opens the same project on iPad, gets sensible defaults
on each.

### Triggers

| Trigger | Action |
|---|---|
| Tap hamburger in top-bar | Cycle: hidden → rail → open → hidden |
| Tap rail-collapse chevron | rail → hidden (or open → rail if currently open) |
| Tap rail-expand chevron | rail → open |
| Swipe right from the left edge (mobile/tablet) | hidden → rail (then again to open) |
| Swipe left on the open panel (mobile/tablet) | open → rail or hidden |
| ESC key | open → previous (rail or hidden) |
| Long-press on rail swatch | Open the legend tab inside open state |

### Push or overlay?

**Overlay** in every state. Rationale (from `touch-3` research +
stitcher physical context):

- Stitchers reference the legend / highlight without intending to move
  the chart. Pushing the chart causes the cells they were looking at
  to move under their finger, which breaks concentration.
- The Open-state desktop dock is currently overlay (320 px column over
  canvas). The rail (56 px) is also a small overlay that the user pans
  the chart underneath when needed.
- Edge cases handled: if the user pans the chart to the leftmost edge
  while the panel is open/rail, they can still see the whole chart by
  pinching out — no chart content becomes permanently inaccessible.

### Transition

- Slide-in / slide-out, 220 ms (already used for current `lpanel-slide-
  right`). Respect `prefers-reduced-motion` (instant).
- Rail ↔ Open transitions cross-fade the contents: rail's swatch fades
  out, full panel content fades in.

### Accessibility

- All three states have a `role="region"` with `aria-label="Pattern
  controls panel"`.
- The hamburger button reflects state via `aria-expanded` and an
  `aria-label` of "Show pattern controls" / "Collapse to rail" /
  "Hide pattern controls".
- Focus is moved into the panel when it expands open, and returned
  to the trigger button when it closes. (Existing behaviour likely;
  verify in implementation.)

### Data preservation

- All panel state — current tab, scroll position, form values
  (highlight colour, dim level, view mode, focus block, session
  notes draft) — survives state changes.
- Hidden state stores nothing extra; the React component remains
  mounted (just CSS-hidden via translate-x or display:none) so input
  values persist.

### Edge cases

| Case | Behaviour |
|---|---|
| User rotates iPad (portrait → landscape) | Apply the new viewport's default state IF the user hasn't explicitly chosen for that viewport class yet; otherwise keep their preference |
| User opens a different project | Panel state retained |
| User triggers full-screen mode | Panel forces to hidden; restore on full-screen exit |

──────────────────────────────────────────────────────────────────────
## Full-screen mode
──────────────────────────────────────────────────────────────────────

A new explicit user-invoked mode that hides app chrome and gives the
canvas the entire viewport.

### What is hidden

| Element | In full-screen? |
|---|---|
| Top header (logo, nav, project name) | **Hidden** |
| Top toolbar (`ToolStrip` / tracker top toolbar) | **Hidden** |
| Progress bar | Hidden by default; opt-in to show as a thin overlay |
| Status bar | Hidden |
| Tracker action bar (mobile) | Replaced by the floating mini-bar |
| Lpanel | Forced to hidden; floating "show panel" button still works |
| Rpanel (creator) | Forced to hidden; can be reopened |

### What remains (floating mini-bar)

A semi-transparent rounded pill at the **bottom-center** (thumb-zone
on a tablet in lap; reachable on a propped iPad without leaning),
56 px tall, ~ 320 px wide. Contents from left to right:

- **Active tool indicator** (icon + label, tap → opens tool overflow)
- **Active colour swatch** (tap → opens palette)
- **Undo** (`Icons.undo`)
- **Zoom out / zoom %% / zoom in** (3 small buttons)
- **Exit full-screen** (`Icons.x` + label "Exit"; permanent, never
  auto-hides)

The exit button **always renders**, never auto-hides, never goes below
80 % opacity. It is the panic-exit and must be obvious.

### Optional — auto-fade everything *except* the exit button after
inactivity

After 4 s of no touch, the floating mini-bar fades to 30 % opacity
(except the exit button which stays at 100 %). Any touch on the
canvas restores it to 100 %.

This is opt-in via UserPrefs `trackerFullScreenAutoFade` (default
`true` on phones, `false` on tablets — phones benefit from less
clutter, tablets have room).

### Entry

- **Toolbar button** in both creator and tracker top toolbars, icon
  `Icons.fullscreen` (add this to icons.js — outline of expanding
  arrows is conventional). Label "Focus" (matches tracker's existing
  vocabulary; cross-stitchers don't always recognise "full-screen" but
  recognise "focus mode" from PK and similar).
- **Keyboard shortcut**: `F` (when not in a text input). Already free
  in the shortcut map (verify in `shortcuts.js`).
- **Long-press the canvas + select "Focus mode"** from the context
  menu (also reachable on touch).

### Exit

- **Tap the Exit button** in the mini-bar.
- **Press Escape** on keyboard.
- **Press F again** on keyboard.
- **Three-finger swipe down** (Procreate-style, optional polish).

### Browser Fullscreen API?

Two-tier approach:

1. **Default: app-only chrome-hide**, no native Fullscreen API. This
   means the browser URL bar may still be visible on mobile Safari
   but everything app-side is hidden. Predictable, no surprise lock-
   out.
2. **Optional: tap-and-hold "Focus" → menu offers "True full-screen
   (fills browser)"** which calls `document.documentElement
   .requestFullscreen()`. The exit button must remain visible because
   browser exit gestures vary per platform.

### Persistence

- Full-screen does **not** persist across sessions. Re-opening the app
  starts in normal layout. (Risk of confusion if a user enters full-
  screen by accident, then can't find chrome on next visit, is real.
  Better to require an explicit re-entry.)
- The mini-bar's auto-fade preference does persist via UserPrefs.

### Modes

Full-screen works in **both Edit and Track modes**. The mini-bar
contents adapt:

| Element | Edit mini-bar | Track mini-bar |
|---|---|---|
| Active tool indicator | Yes | Yes |
| Active colour swatch | Yes | Yes (the highlight colour, or "no filter") |
| Undo / Redo | Yes | Yes |
| Zoom controls | Yes | Yes |
| Mark / Unmark switch | — | Yes (replaces undo if user prefers — TBD via prefs) |
| Exit | Yes | Yes |

──────────────────────────────────────────────────────────────────────
## Interaction between full-screen and panel
──────────────────────────────────────────────────────────────────────

- Entering full-screen forces lpanel/rpanel to hidden. Their previous
  state is remembered.
- Exiting full-screen restores previous panel state.
- While in full-screen, the user can still summon the panel with
  the swipe-from-edge gesture or by tapping the active-colour swatch
  in the mini-bar (which opens the highlight tab as a temporary
  overlay above the mini-bar). When dismissed, the panel returns
  to hidden.

──────────────────────────────────────────────────────────────────────
## Visual specification (high-level)
──────────────────────────────────────────────────────────────────────

- Mini-bar background: `var(--surface)` with `box-shadow: 0 4px 16px
  rgba(0,0,0,0.18)` and 8 px border-radius (28 px on the pill ends).
- 92 % opacity baseline; 100 % on touch.
- Mini-bar buttons: 44 × 44 px each, 8 px gap. Active states use
  `var(--accent-light)` background.
- Rail: 56 px wide on desktop / tall on phone, `var(--surface)`,
  border-end of 1 px `var(--border)`. Swatches inside are 40 × 40 px
  with 8 px padding.
- Both surfaces respect `prefers-reduced-motion` for transitions.
