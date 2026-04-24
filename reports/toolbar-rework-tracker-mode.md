# Toolbar rework — Stitch Tracker

> Read-only analysis produced by exploration sub-agent. No code has been
> changed in tracker-app.js for this report — it is a proposal.

## Current top-bar inventory

### Header (shared)
- Project name (editable inline)
- `sW × sH · n colours` metadata
- "All changes saved" indicator
- Edit Pattern button
- Download (save project file)

### Toolbar pill (shrinks aggressively at <1300px)
- Stitch mode: Mark / Navigate
- View mode: Symbol / Colour+Sym / Highlight
- Highlight-only: ◀ / ▶ colour cycle, counting-aids ⊞ toggle
- Focus area button (eye)
- Zoom group (desktop only): − / slider / + / % / Fit
- Overflow ⋯ (50+ items mixed without grouping)

### Below the toolbar
- Live session chip (only when session active)
- Progress bar + today-stitches segment + live timer
- Floating FAB (mobile undo only)
- Edit-mode warning banner (yellow strip when editing the pattern)

### Right-hand sidebar (rpanel)
Three tabs: **Colours / Session / More** — but the More tab is itself a
mini-overflow holding View, Highlight, Focus, Layers, Suggestions and
Thread-usage sections. Discoverability is poor.

## Redundancies & friction

| Control | Locations today | Problem |
|---|---|---|
| Highlight mode | Toolbar + More tab | Adjusting Isolate/Outline/Tint/Spotlight requires switching tabs |
| Colour cycle ◀ ▶ | Toolbar + More tab arrows | Two interaction models for the same action |
| View mode toggles | Toolbar + More tab pill | Duplicate; toolbar pill collapses on narrow screens leaving only the More-tab copy |
| Zoom controls | `.tb-desktop-only` only | Mobile users have no touch-friendly zoom |
| Session controls | Session chip + Session tab + info-strip Play button | Three competing entry points |
| Counting aids | Toolbar ⊞ + More tab checkbox | Same toggle, two places |
| Overflow menu | 50+ items mixed | Cognitive overload, no hierarchy |
| Progress bar | Header + info strip + Stats page | Three displays of the same number |

## Proposed top bar (mockup)

```
┌─────────────────────────────────────────────────────────────┐
│ ≡  My Pattern                                    [✓ saved]  │
├─────────────────────────────────────────────────────────────┤
│ 80×80 · 4 colours                              [↶]  ⋯   ?   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Progress ████████████░░░░░░ 62.5%       Today 18 st  ⏱ 45m  │
└─────────────────────────────────────────────────────────────┘
```

- Hamburger opens the (new) left sidebar.
- Undo elevated to the top bar — currently buried in the FAB on mobile
  and the overflow on desktop.
- The metadata + progress strip stays glanceable but de-emphasised.

## Proposed toolbar pill (simplified)

```
┌─ Stitch ─┬─ View ───────────────────────┬─ Zoom ─────────────┐
│ Mark Nav │ Sym Col HL  ◀ ▶ ⊞   [Eye]    │ [−] 100% [+] Fit   │
└──────────┴───────────────────────────────┴────────────────────┘
```

Only the most-used controls remain; everything else moves into a
proper left sidebar with grouped tabs.

## Proposed left sidebar — five tabs

### Tab 1 — Highlight
```
┌─ HIGHLIGHT ──────────────────────────────┐
│ Colour focus                              │
│   ◀ DMC 310 ▶   [✕ clear]                 │
│                                           │
│ Mode  [Isolate][Outline][Tint][Spotlight] │
│ Mode-specific controls (visibility /      │
│   tint colour + opacity / dim slider)     │
│                                           │
│ Counting aids                             │
│   [☑] Show       Runs [Off][3+][5+][10+]  │
│   Direction [Horizontal][Vertical]        │
│   [☐] Highlight ninja stitches            │
│                                           │
│ Colour list (compact, click to focus)     │
└───────────────────────────────────────────┘
```

### Tab 2 — View
```
┌─ VIEW ───────────────────────────────────┐
│ Mode [Symbol][Colour][Highlight]          │
│ Zoom [−] 100% [+] [Fit]                   │
│ Rendering                                 │
│   [☐] Lock detail tier                    │
│   Zoomed-out fade [Off][Subtle][Strong]   │
│ Layers (collapsible)                      │
│   [☑] Full   [☑] Half   [☑] Backstitch    │
│   [☐] Quarter  [☐] French knot  …         │
└───────────────────────────────────────────┘
```

### Tab 3 — Session
```
┌─ SESSION ────────────────────────────────┐
│ ▶ Start session                           │
│ Time goal     [____] min                  │
│ Stitch goal   [____]                      │
│ Quick presets [15] [30] [60] min          │
│ [☑] Auto-pause after 10 min idle          │
│                                           │
│ Live (when active)                        │
│   Duration  2:15:42                       │
│   Stitches  1247                          │
│   Speed     551 st/hr                     │
│   [⏸ Pause]  [⏹ End]                       │
│                                           │
│ Last session summary + note input         │
└───────────────────────────────────────────┘
```

### Tab 4 — Tools
```
┌─ TOOLS ──────────────────────────────────┐
│ Realistic preview                         │
│   [Open realistic preview]                │
│                                           │
│ Thread usage                              │
│   Mode [Cluster][Isolation]               │
│   Confetti 23 (5.2%)                      │
│   Small 12  Medium 156  Large 289         │
│   Est. thread changes ≈ 42                │
│                                           │
│ Focus area                                │
│   [☑] Spotlight                           │
│   Block size [10×10][20×20][custom…]      │
│   Stitching style [Block ▾]               │
│   [☑] Show breadcrumbs                    │
│                                           │
│ Suggestions (when enabled)                │
└───────────────────────────────────────────┘
```

### Tab 5 — Notes (optional)
Project metadata (designer/description), start date, time logged,
estimated remaining time.

## Right-hand panel becomes the legend

```
┌─ PALETTE LEGEND ─────────────┐
│ DMC 310  Black     ██ 42/120 │
│ DMC 550  Vy dk grn ████ 87/200│
│ DMC 738  Vy lt tan ████ 156/150│
│ ...                          │
└──────────────────────────────┘
```

One row per colour with a per-colour progress bar. Click to focus
(hands off to the Highlight tab). Sortable by DMC / done % / count.

## Mobile (≤768px)

- Sidebar opens as a left drawer from the ≡ icon.
- Session controls become a bottom sheet triggered by the `▶ Start
  session` row in the info strip.
- Right-side legend folds into a tab inside the left drawer.

## Risks / migration notes

- Removing the overflow menu is a big behaviour change — keep keyboard
  shortcuts (Ctrl+Z, T, V, N, etc.) and add visible affordances for the
  ones that matter.
- The Tracker today re-implements its own session UI in three places;
  consolidating them needs careful audit so an in-flight session isn't
  ended by mistake during the migration.
- Recommended phasing:
  1. Build the left sidebar scaffold and migrate Highlight, View, Session.
  2. Trim the toolbar pill (delete duplicated copies).
  3. Refactor the info strip + session chip to defer to the sidebar.
  4. Add Notes tab + legend polish.
  5. Mobile drawer + bottom-sheet polish.

## Why this matters

The Tracker has accreted controls organically: every new feature added a
toolbar button or another item to the overflow menu. The result is that
core actions (highlight a colour, start a session) are scattered across
three UI areas. Consolidating into a tabbed left sidebar mirrors the
Creator's structure and gives the rest of the app a consistent mental
model.
