# Edit Mode UI Redesign Proposals

> Phase 2 of the edit-mode UI redesign.  
> Confirmed one-click tools: **Paint · Fill · Erase · Undo/Redo · Colour selection · Zoom (in/out/fit)**  
> Sources: [edit-mode-ui-audit.md](edit-mode-ui-audit.md)

---

## Comparison at a glance

| | Option A — Tidy Drawers | Option B — Essentials First | Option C — Canvas First |
|---|---|---|---|
| **Approach** | Regroup + fix accessibility | Trim pill to essentials, "More" panel | Vertical mini-strip + command palette |
| **Pill control count** | ~13 (grouped, tier-weighted) | 9 (trimmed to confirmed list) | 3 primary (icon-only) |
| **Swatch touch target** | 32 px | 40 px | 44 px |
| **Cleanup placement** | Overflow menu `···` | "More" panel | Command palette |
| **Canvas height gained** | 0 px (no rows added/removed) | Up to 38 px (selection strip merges) | ~90 px (strips replaced) |
| **Secondary tool discovery** | Same as today (pill + sidebar) | "More" panel (persistent flyout) | Cmd palette (Ctrl+K / ?) |
| **Implementation effort** | Low — CSS + minor JSX moves | Medium — new flyout component | High — full layout change |
| **Risk** | Low | Medium | High |

---

## Option A — "Tidy Drawers"

### Rationale

The clutter in the current pill is not about the number of controls — it is about the absence of visual hierarchy. Seven buttons in the brush group look identical despite representing three completely different tiers of action. This option imposes that hierarchy with visual separators and weight differences, moves the one non-brush item (Cleanup) out of the group, and fixes the two most critical accessibility failures (swatch size, hover-only swap button) without hiding any functionality from the top level.

The philosophy: **every control stays reachable in one step, but you can now scan the toolbar instead of reading it.**

### Changes

1. **Three tiers inside the brush group**, delimited by a hairline separator (`border-right: 1px solid var(--line)`):
   - Tier 1 — Core marking tools: `[Paint] [Fill] [Erase]` — full-weight `.tb-btn`
   - Tier 2 — Navigation helpers: `[Pick] [Hand]` — same size, subdued by `color: var(--text-secondary)` when inactive
   - Tier 3 — Bulk op: `[Replace]` — same size, placed just before the inter-group separator; labelled visually as distinct by a small gap
2. **Cleanup removed from the brush group.** It becomes an entry in the `···` overflow menu and a ghost icon button in the ActionBar (next to "Export…"). When Cleanup mode is active, a clearly labelled banner replaces the swatch row — its own distinct visual surface.
3. **Swatch targets: 20 px → 32 px** (still compact, but a 2.56× area increase). Swatch row height: 36 px → 44 px. The `palette-chip` in the sidebar Palette tab also grows to 28 px.
4. **Swatch scroll affordance:** replace `scrollbar-width: none` with scroll-shadow fade gradients at the left and right edges of the swatch row when the list overflows. No explicit arrows needed — the gradient is the affordance.
5. **Palette chip swap button:** on `pointer: coarse`, set `opacity: 1` unconditionally and increase the hit target to 24×24 px. Keep the hover animation on mouse devices.
6. **Highlight controls consolidated:** remove P10–P17 (the highlight mode toggles + sliders from below the canvas in PatternTab). They already exist identically in the View tab. Users click the View tab when they want to adjust highlight.
7. **Duplicate "Open in Tracker" removed** from the ActionBar (A2). The ContextBar version (C6) is retained — it is the natural home (same bar as the project name).
8. **Undo/Redo below the canvas (P7/P8) removed.** The pill Undo/Redo (T16/T17) are always in viewport on desktop. On mobile (where the pill may scroll off), the keyboard shortcut Ctrl+Z still works, and the View tab can be extended with a persistent Undo/Redo pair if needed later.
9. All `.tb-btn` default height: **32 px → 36 px**. The `pointer: coarse` override stays at 44 px.

### Desktop wireframe

```
 topbar (48px):
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │ [logo]  [Pattern] [Materials] [Stats]          [project▾] [Import] [Download]       │
 └─────────────────────────────────────────────────────────────────────────────────────┘
 context bar (32px):
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │ [project name]  80×80 · 12 colours · 34% done   [○ Saved]   [Open in Tracker] [↓]  │
 └─────────────────────────────────────────────────────────────────────────────────────┘
 action bar (40px):
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │ Editing pattern   [Cleanup]            [Stats]  [Print PDF]  [Export▾]  ◆ Intermed  │
 └─────────────────────────────────────────────────────────────────────────────────────┘
 toolbar pill (36px → 40px pill height):
 ┌───────────────────────────────────────────────────────────────────────────────────────────┐
 │ [Paint][Fill][Erase] ╎ [Pick][Hand] ╎ [Replace] ║ [Wand][Lasso][×12] ║ ──────── 100% [Fit] ║ [↩][↪] │ [···] │
 └───────────────────────────────────────────────────────────────────────────────────────────┘
 swatch row (44px, visible fade at right edge when overflow):
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │ COLOUR  [■310·Black ▾]    [■][░][░][░][░][░][░][░][░][░][░][░][░][░][░][░][░] ░░  │
 │                           ←─ 32×32 px swatches, fade gradient shows more exist ──→  │
 └─────────────────────────────────────────────────────────────────────────────────────┘
 [ canvas ]                                          ┌─ rpanel 280px ──────────────────┐
                                                     │ [×][×][Pal][Tools][View][Prev]  │
                                                     │ (tab content)                   │
                                                     └─────────────────────────────────┘
 status bar (28px):
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │ Click to paint with DMC 310                X: 24  Y: 31        ■ 310 Black (482 st) │
 └─────────────────────────────────────────────────────────────────────────────────────┘
```

### Mobile wireframe (≤ 799 px, portrait)

```
 topbar (48px): [logo]  [Pattern▾]          [project▾]
 context bar: [project name]          [Open in Tracker]
 action bar: Editing  [Print PDF] [Export▾]
 pill (44px touch targets):
  [Paint][Fill][Erase] ╎ [Pick][Hand]  ──── 100% [Fit]  [↩][↪] [···]
 swatch row (44px): COLOUR [■310] [■][■][■][■][■] ░░░░

 [ canvas — full width ]

 ─────── bottom sheet (rpanel) ─────────────────────────────
 [×][×][Pal][Tools][View][Prev]  (tray handle)
 ▲───────── expands to 70dvh on tap ────────────────────────
```

### Control mapping

| Current control | Option A placement | Change |
|---|---|---|
| Paint, Fill, Erase | Pill tier 1 | Unchanged position; tier visually distinct |
| Pick, Hand | Pill tier 2 | Unchanged position; visually lighter when inactive |
| Replace | Pill tier 2.5 | Unchanged position; small gap before group separator |
| Cleanup | Overflow `···` + ActionBar ghost button | **Moved out of brush group** |
| Wand, Lasso | Pill select group | Unchanged |
| Clear selection | Pill select group (conditional) | Unchanged |
| Zoom range, %, Fit | Pill nav group | Unchanged |
| Undo, Redo | Pill nav group | Unchanged; 36 px height |
| P7/P8 Undo/Redo (canvas) | **Removed** | — |
| P10–P17 Highlight controls (canvas) | **Removed** | Already in View tab |
| A2 "Open in Tracker" (ActionBar) | **Removed** | Kept in ContextBar |
| Swatch row swatches | Swatch row | 20 px → 32 px, scroll fade added |
| Palette chip swap button | Sidebar Palette tab | Always visible on touch (24 px target) |

### Touch notes

- All `.tb-btn` minimum height goes to 36 px (44 px on `pointer: coarse`). No other button-class changes.
- The 32 px swatches still fall short of 44 px; this is a deliberate compromise to keep the row compact. If a user is painting on a touch device they are using the sidebar Palette tab which has larger chips.
- The scroll fade gradient does not require `overflow: visible` — it is a `::after` pseudo-element overlay.

### Risks

- **Cleanup discoverability.** Moving it out of the pill means first-time users may not find it. Mitigated by keeping a ghost button in the ActionBar and a tooltip hint.
- **"Replace" still at equal weight to Pick/Hand.** It is a more consequential action but shares tier 2. A future iteration could demote it further.
- **32 px swatches** are still suboptimal for touch. Users who primarily paint on a tablet will still find this row fiddly.
- Removing P7/P8 (canvas Undo/Redo) assumes the pill toolbar stays in view. If a future layout change scrolls the toolbar off, users lose undo reachability until addressed.

---

## Option B — "Essentials First"

### Rationale

The confirmed one-click tools map cleanly to a **9-widget pill**: three drawing tools, one zoom control group (slider + % display + Fit), and Undo/Redo. Everything else — including Hand, Pick, Wand, Lasso, Replace, Cleanup, stitch type, brush size — moves to a **persistent "More" panel** that behaves like a drawer attached to the toolbar: it opens when the user wants auxiliary tools and stays open while they are using them, then closes. This does not bury tools — it acknowledges that auxiliary tools are session-level choices, not stroke-level choices.

The critical breakthrough: **the swatch row becomes the primary colour-picking surface**, growing to 40 px swatches in a 48 px row, with left/right chevron buttons when overflow exists. The sidebar Palette tab remains for adding new colours.

The MagicWand options strip and selection status strip **merge into a single row** rather than stacking, halving the canvas-height loss when a selection is active.

### Changes

1. **Pill reduced to the confirmed essential controls only:**
   `[Paint] [Fill] [Erase]` + separator + `[──zoom──] [100%] [Fit]` + separator + `[↩] [↪]` + `[More ▾]`
   - 9 interactive widgets total (down from 15–17)
   - `[More ▾]` is a labelled button (not `···`), 44 px wide, opening the "More" panel

2. **"More" panel** — a 220 px wide persistent panel that appears below the `[More ▾]` button (desktop: floats as a popover anchored below the button; mobile: slides up from the bottom):
   - Tool group: `[Hand] [Pick] [Replace] [Wand] [Lasso]`
   - Mode group: `[Cleanup]` (clearly labelled "Enter cleanup mode" with description text)
   - Stitch type: radio buttons (Cross / ¼ / Half/ / Half\ / ¾ / Backstitch)
   - Brush size: 1 / 2 / 3 toggle row
   - Stays open; closed by clicking `[More ▾]` again, pressing Esc, or clicking outside

3. **Swatch row promoted:** swatches grow to **40 px** (nearly touch-compliant). Row height: 48 px. Scroll affordance: visible left/right chevron buttons appear when overflow exists (not the auto-hide approach of Option A).

4. **MagicWand panel: merge two strips into one.** When wand is active and selection exists:
   ```
   [ Wand | Tolerance ──── | Connected/All | New/Add/Sub/Int ] [8 sel | Deselect | Invert | All | Confetti… | Stitch Info… | ···]
   ```
   The five operation panel buttons collapse into a `···` sub-menu on that row. This keeps the wand active + selection state to **one strip** (38 px) instead of two (76 px). The inline sub-panels (Confetti, Reduce, Replace, Outline) still expand below, but they are triggered less often and their height is acceptable.

5. **Palette chip swap button:** visible always on touch; minimum 28×28 px.

6. **ActionBar simplified:** remove A2 "Open in Tracker" (duplicate; kept in ContextBar). Remove A1 phase label "Editing pattern" (it is obvious). ActionBar becomes: `[Print PDF] [Export▾]  ◆ Intermediate [ⓘ]` — three elements instead of seven.

7. **Highlight controls:** same as Option A — consolidate to View tab, remove from PatternTab canvas area.

8. **Undo/Redo below canvas (P7/P8):** removed; covered by pill.

9. **Stitch type in the pill toolbar (currently only in sidebar):** no change to where the *setting* lives — stitch type stays in the More panel. Its keyboard shortcuts (1/2/3/4/5) continue to work.

### Desktop wireframe

```
 topbar (48px):
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │ [logo]  [Pattern] [Materials] [Stats]          [project▾] [Import] [Download]       │
 └─────────────────────────────────────────────────────────────────────────────────────┘
 context bar (32px):
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │ [project name]  80×80 · 12 colours · 34% done   [○ Saved]   [Open in Tracker] [↓]  │
 └─────────────────────────────────────────────────────────────────────────────────────┘
 action bar (40px):
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │                                          [Print PDF]  [Export▾]   ◆ Intermediate    │
 └─────────────────────────────────────────────────────────────────────────────────────┘
 pill (40px):
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │  [Paint][Fill][Erase]  ║  ──────── zoom slider ──────── 100%  [Fit]  ║  [↩][↪]  [More ▾]  │
 └──────────────────────────────────────────────────────────────────────────────────┘
 swatch row (48px, 40px swatches, chevrons when overflow):
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │  COLOUR  [■310·Black]    [‹]  [■][■][■][■][■][■][■][■][■][■][■][■][■][■][■]  [›]  │
 └─────────────────────────────────────────────────────────────────────────────────────┘

 "More" panel (when open, floats below [More ▾]):                          rpanel (280px)
 ┌───────────────────────────────┐                                 ┌───────────────────┐
 │ Tools                         │   [ canvas ]                    │[×][×][Pal][Tools] │
 │ [Hand] [Pick] [Wand] [Lasso]  │                                 │[View][Prev]       │
 │ [Replace]  [Enter Cleanup…]   │                                 │                   │
 │ ─────────────────────────── │                                 │ (tab content)     │
 │ Stitch type                   │                                 │                   │
 │ (•) Cross  ( ) ¼  ( ) Half/   │                                 │                   │
 │ ( ) Half\  ( ) ¾  ( ) Bstitch │                                 │                   │
 │ ─────────────────────────── │                                 │                   │
 │ Brush size   [1] [2] [3]      │                                 │                   │
 └───────────────────────────────┘                                 └───────────────────┘

 status bar (28px):
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │ Click to paint with DMC 310                X: 24  Y: 31        ■ 310 Black (482 st) │
 └─────────────────────────────────────────────────────────────────────────────────────┘
```

### Mobile wireframe (≤ 799 px, portrait)

```
 topbar (48px): [logo]  [Pattern▾]       [project▾]
 context bar:   [project name]    [Open in Tracker]
 action bar:    [Print PDF] [Export▾]

 pill (44px touch targets):
  [Paint] [Fill] [Erase]  ──── zoom ──── 100% [Fit]  [↩][↪]  [More ▾]

 swatch row (48px, 40px swatches):
  [‹]  [■][■][■][■][■][■][■][■][■]  [›]

 [ canvas — full width ]

 ─── "More" bottom sheet (slides up when [More ▾] tapped) ──
 ▲ drag handle
 [Hand] [Pick]  [Wand] [Lasso]  [Replace]
 [Enter Cleanup mode →]
 Stitch: (•)Cross (○)¼ (○)Half/ (○)Half\ (○)¾ (○)Backstitch
 Brush size: [1] [2] [3]
 ─────────────────────────────────────────────────────────────
 ─── rpanel bottom sheet (separate, existing behaviour) ────
 [×][×][Pal][Tools][View][Prev]
```

### Control mapping

| Current control | Option B placement | Change |
|---|---|---|
| Paint, Fill, Erase | Pill | Unchanged |
| Pick, Hand | More panel | **Moved from pill** |
| Replace | More panel | **Moved from pill** |
| Cleanup | More panel (prominent CTA) | **Moved from pill** |
| Wand, Lasso | More panel + keyboard W | **Moved from pill** |
| Clear selection | Merged wand strip (conditional) | Stays one step |
| Wand options (tolerance, mode) | Merged wand strip | Merged into one row |
| Selection operations (Confetti etc.) | Merged wand strip `···` menu | Collapsed to sub-menu |
| Zoom range, %, Fit | Pill | Unchanged |
| Undo, Redo | Pill | Unchanged |
| P7/P8 Undo/Redo (canvas) | **Removed** | — |
| P10–P17 Highlight controls (canvas) | **Removed** | Already in View tab |
| A1 phase label | **Removed** | — |
| A2 "Open in Tracker" (ActionBar) | **Removed** | Kept in ContextBar |
| A3 Stats link | **Removed from ActionBar** | Available via header Stats tab |
| Swatch row swatches | Swatch row | 20 px → 40 px, chevron buttons |
| Stitch type (sidebar Tools) | More panel + sidebar Tools tab | Also in More panel now |
| Brush size (sidebar Tools) | More panel + sidebar Tools tab | Also in More panel now |

### Touch notes

- 40 px swatches are close to 44 px minimum; the chevron buttons provide an always-visible secondary path (tap chevron, see more, tap swatch).
- The "More" bottom sheet on mobile uses the existing rpanel bottom-sheet mechanism, or a second independently dismissible bottom sheet if the rpanel is also open.
- The merged wand strip items should be 44 px height on `pointer: coarse`.
- All pill buttons are 44 px minimum on touch. With only 9 controls, the pill comfortably fits a 375 px phone without overflow.

### Risks

- **"More" panel discovery.** Users accustomed to seeing Hand and Pick in the top-level pill will have to find `[More ▾]`. Mitigated by the explicit label (not `···`) and by the keyboard shortcuts for all moved tools remaining identical.
- **Wand now requires two taps on mobile** (open More panel, tap Wand). Mitigated by the keyboard shortcut `W` and the fact that wand is a session-level mode: once set it persists until changed.
- **More panel as a new component** adds approximately 80–120 lines of JSX and a small amount of state management. It follows existing patterns (the Export dropdown, the overflow menu) so the implementation risk is low.
- The merged wand strip must be careful not to lose the current selection-operation panel open state when re-rendering. Existing strip state management would need to be verified.

---

## Option C — "Canvas First"

### Rationale

This option treats the canvas as the primary surface and moves all tooling to the periphery. A vertical icon-only mini-strip on the left edge of the canvas holds the five most common tools; everything else is accessed through a command palette (Ctrl+K or clicking a search icon). Undo/Redo float at the bottom-right of the canvas viewport, always visible regardless of toolbar state. This recovers approximately 90 px of vertical canvas space — significant on laptops.

The downside is that it represents a paradigm shift. Users who know the current toolbar must re-learn locations. It also requires the most implementation work and carries the highest regression risk.

### Changes

1. **Toolbar pill replaced** by a vertical strip (`position: sticky; left: 0`) attached to the left edge of the canvas area, 48 px wide, full canvas height:
   - `[Paint]` (32×32 px icon with tooltip)
   - `[Fill]`
   - `[Erase]`
   - `[Hand]`
   - `[Wand]`
   - `─` separator
   - `[More…]` (opens command palette)

2. **Colour swatch row** moves from below the toolbar to **above the canvas**, full width, 44 px swatches, visible left/right scroll controls.

3. **Zoom controls** become a floating chip `[–] 100% [+] [Fit]` that sits at the **bottom-left of the canvas** (below the status bar), `position: sticky; bottom: 0`.

4. **Undo/Redo** become a floating pair at **bottom-right of the canvas**: `[↩ Undo (n)] [↪ Redo]`, always visible.

5. **ActionBar removed entirely.** The stats/export actions move to a new `…` menu in the topbar (right of Download).

6. **MagicWandPanel** becomes a **floating panel** (not a DOM-flow strip). When wand or selection is active, a panel appears over the canvas (like a floating toolbar) at the top-right or draggable by the user. This preserves full canvas height.

7. **Command palette** (Ctrl+K): a full-screen modal search for any action — "Replace colour", "Cleanup mode", "Stitch type: Backstitch", "Open in Tracker" etc. This is the single access point for infrequently-used tools.

8. **Stitch type:** shown in the left strip as a small badge below the active tool icon (e.g. a tiny "×" for cross stitch). Clicking it cycles types; right-clicking opens the type picker inline.

9. Swatch sizes: **44 px** (true touch compliance).

### Desktop wireframe

```
 topbar (48px):
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │ [logo]  [Pattern] [Materials] [Stats]          [project▾] [Import] [Download] […]   │
 └─────────────────────────────────────────────────────────────────────────────────────┘
 context bar (32px):
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │ [project name]  80×80 · 12 colours · 34% done   [○ Saved]   [Open in Tracker] [↓]  │
 └─────────────────────────────────────────────────────────────────────────────────────┘
 swatch row (48px, 44px swatches, full width, above canvas):
 ┌─────────────────────────────────────────────────────────────────────────────────────┐
 │ COLOUR [■310·Black]    [‹]  [■][■][■][■][■][■][■][■][■][■][■][■][■][■][■][■]  [›] │
 └─────────────────────────────────────────────────────────────────────────────────────┘

 ┌─ vertical strip (48px) ─┐
 │ [Paint]                 │
 │ [Fill]                  │
 │ [Erase]                 │
 │ [Hand]                  │   [ canvas — maximum width ]          ┌─ rpanel 280px ──┐
 │ [Wand]                  │                                        │[×][×][Pal][View]│
 │ ────                    │   ┌────────── floating wand panel ──┐  │[Tools][Prev]    │
 │ [More…]                 │   │ Wand | Tol ── | Conn/All | ops  │  │                 │
 │                         │   └──────────────────────────────────┘  │                 │
 │                         │                                        │                 │
 │                         │   [– zoom –]  100%  [+]  [Fit]       [↩ Undo(3)] [↪]   │
 └─────────────────────────┘                                        └─────────────────┘
 status bar: Click to paint with DMC 310          X: 24  Y: 31       ■ 310 Black
```

### Mobile wireframe (≤ 799 px, portrait)

```
 topbar: [logo]  [Pattern▾]       [project▾] […]
 context: [project name]    [Open in Tracker]

 swatch row (48px): [‹] [■][■][■][■][■][■][■][■][■][■][■][■] [›]

 ┌─ strip (48px) ─┬────────────────────────────────────────────┐
 │ [Paint]        │                                            │
 │ [Fill]         │   [ canvas — maximum area ]               │
 │ [Erase]        │                                            │
 │ [Hand]         │                                            │
 │ [Wand]         │         [– 100% +] [Fit]    [↩] [↪]      │
 │ [More…]        │                                            │
 └────────────────┴────────────────────────────────────────────┘

 (rpanel bottom sheet, separate)
 [×][×][Pal][View][Tools][Prev]
```

### Control mapping

| Current control | Option C placement | Change |
|---|---|---|
| Paint, Fill, Erase | Left vertical strip | **New location** |
| Hand | Left vertical strip | **New location** |
| Wand | Left vertical strip | **New location** |
| Pick, Lasso, Replace, Cleanup | Command palette (`More…`) | **Moved to palette** |
| Stitch type | Badge on strip + cycle via T or 1–5 keys | **New interaction** |
| Brush size | Command palette / More… | **Moved to palette** |
| Zoom | Floating bottom-left chip | **New location** |
| Undo, Redo | Floating bottom-right pair | **New location** |
| ActionBar | **Removed** | Merged into topbar `…` |
| Wand/selection strips | Floating panel | **New presentation** |
| Swatch row | Full-width row above canvas | **Moved above canvas** |

### Touch notes

- The vertical strip buttons are 48×48 px — exceeds touch minimum.
- The floating zoom chip and undo pair are 44 px minimum.
- 44 px swatches in the full-width row are fully touch-compliant.
- The floating wand panel requires careful drag-handle support on touch so it does not block the canvas permanently.
- The command palette is a full-screen modal on mobile — safe for touch.

### Risks

- **Paradigm shift.** Vertical toolbars are unusual in browser-based canvas tools (Figma and Photoshop use them, but most web tools do not). Some users will find it unfamiliar.
- **Left-strip on small screens** (< 375 px) may compete with canvas space.
- **Floating wand panel** is a new UI pattern in this codebase. The existing MagicWandPanel is DOM-flow; making it a positioned float requires z-index management and a drag implementation.
- **Command palette requires a new component.** The codebase has `command-palette.js` in the root — it may be usable or adaptable, but integration with the Creator state system needs investigation.
- **Navigation regression risk** is the highest of all three options. Export, Stats, and PDF export lose a permanent home and must be discoverable through `…` or the command palette.
- **Keyboard shortcut consistency** — all current shortcuts still work, but the visual location of every tool changes, breaking the current mental mapping of "button → shortcut".

---

## Recommendation

**Option B — "Essentials First"** is the recommended approach.

**Why not Option A:** Option A improves clarity and fixes the critical accessibility failures, but the toolbar still has ~13 controls in the pill. The density problem identified in audit item 4.2 is improved but not solved. Touch users still face 32 px swatches. It is the right choice if implementation time is highly constrained.

**Why not Option C:** Option C recovers the most canvas space and achieves the best touch compliance, but it is a paradigm change with high regression risk. The floating wand panel is a new interaction pattern in this codebase, and moving the ActionBar into the topbar risks losing discoverability for PDF export and stats. It is the right choice for a future 2.0 redesign, not an incremental improvement.

**Why Option B:**
- The confirmed one-click tools map exactly to the trimmed pill — no compromises.
- The "More" panel pattern directly mirrors how the existing Export dropdown and overflow menu work; it is familiar to users and straightforward to implement.
- Swatch swatches growing to 40 px eliminates the worst daily touch failure without a layout change.
- Merging the wand strips into one row recovers 38 px of canvas height on every selection — a meaningful improvement at laptop resolution.
- The ActionBar simplification (removing the phase label, duplicate Tracker link, and Stats shortcut) reduces to 3 clearly-purposeful elements.
- All keyboard shortcuts are unchanged.
- Implementation touches 4 files: `creator/ToolStrip.js` (pill trim + More panel), `creator/MagicWandPanel.js` (strip merge), `creator/ActionBar.js` (simplify), `styles.css` (swatch sizing + More panel styles). No changes to the Sidebar, header, or modals.

---

## Phase 2 question for you

**Which option do you want to implement?**

- **Option A — Tidy Drawers:** Low risk, low effort. Fixes accessibility and grouping. Toolbar still dense but scannable.
- **Option B — Essentials First:** Medium risk/effort. Trimmed pill to your exact list. "More" panel for everything else. Best balance of improvement and stability. *(Recommended)*
- **Option C — Canvas First:** High risk/effort. Maximum canvas space. Full paradigm change. Better suited to a future v2 redesign.

If you choose Option B, I will also need to know: should the "More" panel open as a **dropdown below the button** (desktop) + **bottom sheet** (mobile), or should it always open inline below the toolbar as a second row (simpler, no absolute positioning)?
