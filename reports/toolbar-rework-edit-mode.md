# Toolbar rework — Pattern Creator (Edit mode)

> Read-only analysis produced by exploration sub-agent.
>
> Already shipped in the same change-set as this report:
> - Removed the Preview ▾ dropdown from the top toolbar.
> - Removed the standalone Compare / split-view button from the top toolbar.
> - Added a small Overlay toggle + opacity slider in their place.
> - Sidebar Preview tab now hosts every preview chart-mode / quality /
>   coverage / grid / fabric control plus the Compare button.

## Current top-bar inventory (after the just-shipped trims)

| Control | State | Redundant? |
|---|---|---|
| Paint / Fill / Erase / Pick | `cv.brushMode`, `cv.activeTool`, `cv.stitchType` | No |
| Stitch type ▾ (Cross / ¼ / ½ / ¾ / Backstitch) | `cv.stitchType`, `partialStitchTool` | Could move to sidebar |
| Brush size 1/2/3 | `cv.brushSize` | Visible only for cross/half/erase |
| Backstitch continuous toggle | `cv.bsContinuous` | Only for backstitch — orphaned |
| Selection ▾ (Wand / Lasso / Poly / Magnetic / Clear) | `cv.activeTool`, `cv.lassoMode` | Sub-modes could move |
| Selected colour chip | display of `cv.selectedColorId` | Already in Palette tab |
| Active-tool badge | read-only summary | Could be a sidebar status |
| Zoom slider + % + Fit | `cv.zoom` | No |
| Undo / Redo | `cv.editHistory`, `cv.redoHistory` | No |
| Overlay toggle + opacity | `cv.showOverlay`, `cv.overlayOpacity` | New (replaced Preview ▾) |
| Overflow ⋯ | mixed | Mixed contents |

## Current sidebar (Edit mode)

`palette | view | preview | more` — Preview now contains all the
relocated chart-mode controls plus Compare.

## Redundancies & friction

1. **Selected-colour chip** in the toolbar duplicates the highlighted
   swatch in the Palette tab.
2. **Selection ▾ sub-modes** (Freehand / Polygon / Magnetic) are picked
   once per session — overkill for a top-bar dropdown.
3. **Backstitch continuous toggle** is an orphan — only meaningful for
   one of six stitch types but always reserves toolbar real-estate.
4. **Stitch-type ▾** is the most-clicked dropdown but it's also the
   biggest space-eater on narrow screens.

## Proposed top toolbar (mockup)

Goal: only the things clicked dozens of times per minute remain.

```
┌──────────────────────────────────────────────────────────────────┐
│ [Paint][Fill][Erase][Pick] | [Cross▾] [1][2][3] | [Wand][Lasso]  │
│ [↶][↷]  |  Zoom [──●──] 100% [Fit]  |  [Overlay]  ⋯               │
└──────────────────────────────────────────────────────────────────┘
```

Removed compared to today:
- Selected-colour chip (now visible in the Palette tab swatch and in the
  active-tool badge tooltip).
- Selection sub-mode picker (Freehand / Polygon / Magnetic) — moves to
  the Tools sidebar tab.
- Backstitch continuous toggle — moves to the Tools tab beside the
  backstitch stitch type.

## Proposed sidebar tabs

### Tab 1 — Palette  (unchanged)
Colour chips with stash status, stash filter, single/blend picker,
shopping list CTA.

### Tab 2 — Tools  (NEW — absorbs toolbar dropdowns)
```
┌─ TOOLS ──────────────────────────────────┐
│ Stitch type                               │
│   ◉ Cross   ○ ¼   ○ Half /  ○ Half \     │
│   ○ ¾       ○ Backstitch                  │
│                                           │
│ ▸ Backstitch options (when Backstitch)   │
│   [☑] Continuous mode                    │
│                                           │
│ Brush size  [────●────] 2  presets [1][2][3] │
│                                           │
│ Selection                                 │
│   ◉ Magic Wand                           │
│   Lasso mode  ○ Freehand ○ Polygon ○ Mag │
│   Modifier hint: Shift = add, Alt = subt │
└───────────────────────────────────────────┘
```
Reasoning: groups every "what does my brush do" decision in one tab. The
toolbar keeps Paint/Fill/Erase/Pick + Wand/Lasso primary buttons so a
selection or wand can be activated in one click; mode tweaks live here.

### Tab 3 — View  (existing, slightly enriched)
```
┌─ VIEW ───────────────────────────────────┐
│ Display [Chart] [Symbol] [Both]           │
│ Highlight  [Isolate][Outline][Tint][Spot] │
│   (mode-specific sliders below)           │
│ [☑] Grid overlay                          │
│ [☑] Fabric background                     │
└───────────────────────────────────────────┘
```

### Tab 4 — Preview  (already updated)
Chart / Pixel / Realistic switch, quality level, coverage slider with
presets, and the Compare side-by-side button.

### Tab 5 — More  (unchanged)
Generation settings (collapsed accordion) + project metadata + Regenerate.

## Phasing recommendation

- **Phase 1 (low risk, do now)** — already shipped: Preview dropdown out,
  Overlay in, Compare moved to sidebar.
- **Phase 2 (medium risk)** — move Selection sub-modes and Backstitch
  continuous to the new Tools tab, with new keyboard shortcuts so power
  users don't lose speed.
- **Phase 3 (higher risk)** — relocate Stitch type ▾ to Tools tab; only
  ship after a coaching pass and a `T` shortcut to cycle stitch types.

## Risks / migration notes

- Muscle memory for the stitch-type dropdown is strong; do not move it
  without first introducing a discoverable shortcut.
- `cv.activeTool` / `cv.brushMode` / `cv.stitchType` already drive every
  affected toggle, so moving the UI doesn't require a state-shape change.
- The Tools tab needs a new `editTabs` entry; reorder so the most-used
  tabs (Palette, Tools, View) sit on the left.
- Tests in `tests/toolstripCompare.test.js` already point at the new
  Sidebar location; further moves will need similar test updates.
