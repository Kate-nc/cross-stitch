# Track Mode UI Redesign Proposals

> Phase 2 of the track-mode redesign.  
> Confirmed one-tap controls: **Pick / switch colour · Jump to next stitch · Zoom · Mark/Nav mode toggle · Pause timer · Progress glance**  
> Marking preference: open to **press-and-hold → drag mode** (instead of immediate drag-on-move).  
> Focus view: **yes — a lockable minimal shell**.  
> Sources: [track-mode-ui-audit.md](track-mode-ui-audit.md)

---

## Comparison at a glance

| | Option 1 — Essential Bar | Option 2 — Shell Mode | Option 3 — Split Palette |
|---|---|---|---|
| **Approach** | Six large permanent controls; one "More" drawer for everything else | Immersive canvas-only shell, all chrome on-demand | Always-visible large colour tiles alongside canvas |
| **Persistent chrome** | Bottom bar (phone) / left action rail (desktop) | Colour ring + lock icon only (shell state) | Palette panel (320 px) + minimal mode strip |
| **Marking interaction** | Press-and-hold → drag mode; tap toggles one stitch | Press-and-hold → drag mode; tap marks (no toggle) | Same as current (tap toggle), long-press drag |
| **Focus / shell view** | Collapse button hides bar entirely; swipe from edge to restore | Default IS the shell; lock icon keeps it locked | N/A — palette panel is the persistent chrome |
| **Colour-change flow** | Tap colour circle in bar → colour picker bottom sheet | Tap colour ring → full-screen colour chooser | Tap tile in palette panel |
| **Undo** | Action bar button (always visible) + Ctrl+Z | Swipe left on colour ring; Ctrl+Z | Floating button on mode strip |
| **Progress glance** | Persistent pill in bottom bar | Progress arc on colour ring; tap for full breakdown | Inline in palette panel header |
| **Canvas space gained (phone)** | ~72 px (removes floating dock + toolbar pill) | ~120 px (removes all persistent chrome) | ~0 px (trading chrome areas) |
| **Implementation effort** | Medium | High | High |
| **Disruption to current patterns** | Low–Medium | High | High |

---

## Phase 1 answers summary

- **Most-used controls**: pick/switch colour, jump to next stitch, zoom (in/out/fit), mark/nav mode toggle, pause timer, progress glance.
- **Marking**: open to press-and-hold to enter drag mode (less accidental drags while panning).
- **Focus view**: yes — lockable minimal mode.

---

## Option 1 — "Essential Bar"

### Rationale

The current UI has the six most-used controls spread across three competing surfaces: the toolbar pill, the floating tool dock (draggable), and the bottom action bar. Each is partially redundant, partially incomplete, and inconsistently sized. This option retires the floating dock and the complex toolbar pill and promotes exactly the six confirmed controls to a permanent, full-width, large-target bar.

Everything else — counting aids, highlight modes, sessions, layers, notes, settings — lives in a single "All controls" panel opened by one button. There is no overflow menu, no sidebar tab system, no hidden 3-state hamburger.

The philosophy: **what you always need is always reachable; everything else is one tap behind a single button**.

### Changes

1. **Essential Bar (phone, 72 px, fixed bottom)**: `[Colour ⌀48] [Find next] [Zoom Fit] [M|N] [Pause] [Progress]` — each button ≥48×48 px, labelled below the icon.
2. **"More" button** (right edge of essential bar) opens a single slide-up panel with grouped controls: Session, Highlight view, Layers, Counting aids, Thread tools, Notes, Settings.
3. **Floating tool dock** retired entirely.
4. **Toolbar pill** retained on desktop/tablet but simplified to: `[Hamburger] [M|N toggle] [Row mode] [Zoom −/fit/+]` — 4 groups, no overflow menu.
5. **Overflow menu (`···`)** retired. Its 30 items are redistributed: ~20 move to the "More" panel, ~6 become first-class controls, ~4 (reset, revert, edit) move to a project actions menu reachable from the header project-name chip.
6. **Marking interaction change**: Immediate drag on pointer-move is replaced by a 300 ms press-and-hold → drag mode. Visual indicator ("Drag: ON") flashes for 1.5 s after activation. This prevents accidental drags when tapping quickly.
7. **Progress glance**: Bottom bar progress pill shows `47%` + a tiny bar. Tap to open inline breakdown popover (same data as current `progressInfoOpen` state).
8. **Focus / shell mode**: Tap the collapse button (small tab at top of essential bar) to retract the bar to a 12 px handle at the bottom. Any swipe upward or tap on the handle restores it.

### Desktop layout

```
 top bar (52px):
 ┌────────────────────────────────────────────────────────────────────┐
 │ [≡ sidebar]  Spring Garden  [47% ████░░░░░░]  [▶ 0:32]  [⋮ More] │
 └────────────────────────────────────────────────────────────────────┘

 canvas + right panel:
 ┌──────────────────────────────────────────────┬─────────────────────┐
 │                                              │ PALETTE LEGEND      │
 │   CANVAS (scroll)                            │ Sort: % done        │
 │                                              │ ─────────────────── │
 │                                              │ ■ 310  Black        │
 │                                              │ ████░░  34/80  [P]  │
 │                                              │ ■ 321  Red          │
 │                                              │ ████████  80/80 ✓   │
 └──────────────────────────────────────────────┴─────────────────────┘

 bottom tool bar (56px):
 ┌────────────────────────────────────────────────────────────────────┐
 │ [● DMC 310 Black ▾]  [→ Find next]  [⊡ Fit]  [Mark|Nav]  [▐▌ 0:32]  47%  [More ⋮] │
 └────────────────────────────────────────────────────────────────────┘
```

### Phone layout

```
 top bar (44px — minimal):
 ┌──────────────────────┐
 │ Spring Garden  ≡ ⋮   │
 └──────────────────────┘
 ┌──────────────────────┐  canvas fills remaining height
 │  CANVAS              │
 │  (full width)        │
 └──────────────────────┘
 essential bar (72px):
 ┌──────────────────────┐
 │ [●][→][⊡][M][▐▌][47%│⋮]│
 │ col find fit md pau pro │
 └──────────────────────┘
```

---

## Option 2 — "Shell Mode"

### Rationale

When stitching with a hoop in your lap and a device propped at arm's length, the ideal UI is no UI at all — just the pattern, a hint of which colour to stitch next, and one button to mark it. This option makes that the default. All chrome is hidden behind a single reveal gesture. A lock icon prevents accidental reveals when your hand brushes the screen.

The colour indicator becomes a large (72 px) progress ring: the outer arc shows how much of the current colour is done. Tapping the ring opens the colour chooser. Tapping elsewhere on the canvas marks a stitch. Long-pressing enters drag mode.

The philosophy: **the pattern is the UI. Everything else reveals on request**.

### Changes

1. **Shell state** (default): Canvas fills 100% of screen. Bottom strip (72 px) shows only:  
   - Colour ring (72 px circle, progress arc, tap to pick colour, tap centre to find-next)  
   - Lock icon (tap to toggle locked / unlocked shell)  
   - Nothing else.
2. **Reveal gesture**: Swipe up from the colour ring area OR tap the lock icon (if unlocked) → control tray slides up 60% of screen height with all controls in a scrollable list.
3. **Lock mode**: When locked (padlock closed), canvas tap = mark stitch; reveal gesture is ignored. A brief "locked" label pulses when user tries to swipe in lock mode.
4. **Marking change**: Tap = mark one stitch (no toggle — tap always marks. To unmark: undo). Long-press 400 ms → drag mode. Intent still fixed by first cell's done state. This is the cleanest model for "hoop in hand": you only want to mark forward; the undo button handles corrections.
5. **Undo**: Swipe left on the colour ring; or tap colour ring + hold 1 s; or the undo button in the revealed tray. A persistent ghost undo area at the left edge of the colour ring strip is always visible.
6. **Progress arc**: The outer ring of the colour indicator shows % of current colour done. Inside: colour swatch. Below ring: "34 / 96 stitches" in small text. Tap the ring → jump to colour chooser. Tap the ring twice → jump to next stitch.
7. **Desktop behaviour**: Shell mode is a toggle (F key). Default desktop shows the full sidebar + toolbar. Pressing F collapses everything to the shell state; pressing again restores.

### Phone layout (shell mode, locked)

```
 ┌──────────────────────┐
 │                      │
 │                      │
 │      CANVAS          │
 │   (full screen)      │
 │                      │
 │                      │
 │                      │
 ├──────────────────────┤
 │  [← undo]  ( ● 34%) [🔒] │  ← 72px strip, nothing else
 └──────────────────────┘
```

### Phone layout (tray revealed, unlocked)

```
 ┌──────────────────────┐
 │  CANVAS (top 40%)    │
 ├──────────────────────┤
 │  Control tray        │
 │  ┌──────────────────┐│
 │  │ ● DMC 310 Black  ││  ← active colour header
 │  │ [Find next] [Nav]││
 │  │ [Zoom Fit] [Pause]││
 │  │ ─────────────── ││
 │  │ HIGHLIGHT        ││
 │  │ [Isolate][Outline]││
 │  │ [Tint][Spotlight] ││
 │  │ ─────────────── ││
 │  │ SESSION          ││
 │  │ 0:32 · 24 st     ││
 │  │ [End session]    ││
 │  └──────────────────┘│
 │  [Drag handle ─────] │  ← swipe to resize or close
 └──────────────────────┘
```

---

## Option 3 — "Split Palette"

### Rationale

In practice, most tracker sessions follow a predictable rhythm: look at the palette to decide which colour to do next → tap that colour → work through it → check back. The palette legend is the most-used information surface in track mode, but it is currently tucked behind a sidebar tab (desktop) or a drawer (phone), with tiny tap targets.

This option makes the palette the persistent primary panel. Large colour tiles (56 px height on tablet, 48 px on phone) show swatch, DMC ID, name, progress bar, and stitch count. They are sorted by remaining stitches by default. Tapping a tile focuses that colour immediately — no sidebar navigation needed.

The canvas gets a minimal floating 3-button mode strip (Mark / Nav / Zoom Fit). No toolbar pill. No sidebar. No floating dock.

The philosophy: **the palette drives the session; the canvas is where the work happens**.

### Changes

1. **Palette panel** (persistent, 320 px desktop, slide-in from left on phone): vertically scrollable list of colour tiles. Each tile: `[48×48 swatch] [DMC ID · Name] [progress bar] [n/total]`. Active tile is pinned to top with a larger 80 px presentation.
2. **Active colour tile** (pinned top): 80 px height, includes find-next button and progress arc. Tapping it jumps to next stitch of that colour.
3. **Minimal mode strip** (floating, right of canvas, 48 px wide): `[Mark / Nav toggle] [Zoom Fit] [Undo] [More]`. Just 4 buttons.
4. **"More" button** on mode strip opens a thin slide-over panel (not a full sidebar) with: session controls, highlight modes, counting aids, layers.
5. **Marking**: Tap = toggle (same as current). Long-press 300 ms → drag mode. Drag intent still fixed by first cell.
6. **Progress summary**: Palette panel header shows `47% · 0:32 · [Pause]`.
7. **Phone layout**: Palette panel slides in from left (triggered by large colour chip at top-left of canvas, always visible). Canvas has: colour chip (top-left, 48×48), undo button (top-right), mode strip (right edge).

### Tablet landscape layout

```
 ┌──────────────────────┬──────────────────────────────────┐
 │ PALETTE              │                                  │
 │ Spring Garden   47%  │                                  │
 │ 0:32  [▐▌ Pause]     │  CANVAS                          │
 │ ─────────────────── │                                  │
 │ ┌─────────────────┐ │                          [Mark ] │
 │ │● 321 Red  (FOCUS)│ │                          [Nav  ] │
 │ │ ████████  80/80 │ │                          [Fit  ] │
 │ │ [→ Find next]   │ │                          [Undo ] │
 │ └─────────────────┘ │                          [More ] │
 │                     │                                  │
 │ ■ 310 Black         │                                  │
 │ ████░░░░  34/80     │                                  │
 │                     │                                  │
 │ ■ 3765 Teal         │                                  │
 │ ██░░░░░░  18/64     │                                  │
 │                     │                                  │
 │ ■ 743 Yellow        │                                  │
 │ ██████░░  46/56     │                                  │
 │                     │                                  │
 │ ■ 3816 Green        │                                  │
 │ ████████  32/32 ✓   │                                  │
 └─────────────────────┴──────────────────────────────────┘
```

---

## Marking interaction: across all options

All three options implement the same revised marking gesture model:

| Gesture | Old behaviour | New behaviour |
|---|---|---|
| Quick tap | Toggle (mark or unmark) | **Option 1 & 3**: toggle (unchanged). **Option 2**: mark only |
| Immediate pointer-move | Starts drag (can cause accidental drags while panning) | No drag until press-held for 300–400 ms |
| Press-and-hold (300 ms) | Starts range anchor (500 ms) | Enters **drag mode** — continue moving to mark/erase a run |
| Long-press (500 ms) | Range anchor for rectangle fill | Preserved in Options 1 & 3; in Option 2, second tap on different cell commits rectangle |
| Swipe/pan | Pan canvas (if not dragging) | Unchanged — pan still works because drag doesn't activate until 300 ms hold |

---

## Phase 3 implementation constraints (whichever option is chosen)

- All tap targets ≥ 48×48 px (current problematic elements: park toggle, mark/undo per-colour buttons, toolbar pill buttons)
- Minimum 8 px spacing between adjacent tap targets
- WCAG AA contrast: all text and iconography
- No state distinction by colour alone: add icon/text indicator alongside colour change
- Keyboard shortcuts preserved (full list in audit)
- `pointer: coarse` CSS media query used for all touch-specific overrides
- Marking feedback ≤ 100 ms (preserved via `drawCellDirectly`)
- Safari iOS: retain Touch Event model on canvas; Pointer Events only on chrome
