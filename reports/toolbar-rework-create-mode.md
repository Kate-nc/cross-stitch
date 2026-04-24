# Toolbar rework — Pattern Creator (Create mode)

> Read-only analysis produced by exploration sub-agent. No code has been
> changed for this mode yet — this is a proposal.

## Current top-bar inventory

| Control | State | Redundant? |
|---|---|---|
| Generate / Regenerate | `gen.generate()` | YES — also at sidebar bottom |
| Overlay toggle | `cv.showOverlay` | Tertiary; could move to Preview tab |
| Zoom slider + % | `cv.zoom` | No |
| Fit | resets `cv.zoom` to `cv.fitZ` | No |

## Current sidebar (Create mode)

Two tabs: **Settings** (project info, image card, dimensions, palette,
cleanup, fabric, adjustments, background, palette swap) and **Preview**.
The Settings tab is a tall accordion (8+ sections).

## Redundancies & friction

1. **Generate** lives in the toolbar AND the sidebar action bar — two
   buttons doing the same thing within 200px of each other.
2. **Overlay** toggle is the only non-zoom control on the toolbar but only
   matters once an image is loaded; it logically belongs with the source
   image controls or the Preview tab.
3. **Settings tab** is a single long accordion — discovery of "Stitch
   cleanup", "Background", "Palette swap" suffers.
4. There is no clean home for **project metadata** (name/designer/desc) —
   today they sit at the top of Settings, mixed with image-processing.

## Proposed top toolbar (mockup)

```
┌──────────────────────────────────────────────────────────┐
│ [Generate]   |   [↶] [↷]   |   Zoom [────●──] 150% [Fit] │
└──────────────────────────────────────────────────────────┘
```

- Drop the Overlay button (moves into the Image / Preview tab).
- Add Undo / Redo so the keyboard shortcuts have a visible affordance.

## Proposed sidebar tabs

Replace the two broad tabs with five task-oriented ones following the
generation flow.

### Tab 1 — Image
```
┌─ IMAGE ─────────────────────────────────┐
│ [Choose file]   [Clear]                  │
│                                          │
│ ┌── Source preview ──┐                   │
│ │  [200×150 thumb]   │  [Crop] [Remove]  │
│ └────────────────────┘                   │
│                                          │
│ Overlay   [OFF]──●──[ON]   opacity 60%   │
└──────────────────────────────────────────┘
```
Reasoning: the Overlay control belongs with the image it overlays.

### Tab 2 — Dimensions
```
┌─ DIMENSIONS ────────────────────────────┐
│ Aspect lock [☑]                          │
│ Width  [────80────]  stitches            │
│ Height [────80────]  stitches            │
│ Finished: 5.7 × 5.7 in (14ct)            │
│                                          │
│ Adjustments                              │
│   Smooth      [────0────]  Off           │
│   Brightness  [────0────]                │
│   Contrast    [────0────]                │
│   Saturation  [────0────]                │
│                                          │
│ Fabric count [14 ▾]                      │
└──────────────────────────────────────────┘
```
Reasoning: "how big and how sharp" belong together; fabric count drives
the finished-size calculation shown above.

### Tab 3 — Palette
```
┌─ PALETTE ───────────────────────────────┐
│ Source                                   │
│   [☐] Stash threads only                 │
│   [☐] Allow blends                       │
│   Max colours [────20────]               │
│                                          │
│ Quality                                  │
│   Min stitches/colour [──5──]            │
│   Remove orphans      [──1──] (0–3)      │
│   Dithering   [Direct] [Dithered]        │
│   Cleanup     [ON]   Balanced            │
│                                          │
│ Exploration                              │
│   [Randomise]   seed #12345              │
│   [Explore variations]                   │
│                                          │
│ Background                               │
│   [☐] Skip background                    │
│   Tolerance [──20──]                     │
│   [Auto-crop to stitches]                │
└──────────────────────────────────────────┘
```
Reasoning: every palette-defining decision in one place.

### Tab 4 — Preview
Already exists with all the right controls. Add the (now-moved) source
overlay toggle here as a third row:
```
[Show grid]   [Show fabric]   [Show source overlay]
```

### Tab 5 — Project
```
┌─ PROJECT ───────────────────────────────┐
│ Name        [Sunflower sampler  ]        │
│ Designer    [Katie               ]       │
│ Description [...                ]        │
│                                          │
│ Live summary                             │
│   80 × 80 stitches                       │
│   18 colours used                        │
│   ≈ 6,400 stitches, ≈ 22 skeins ≈ £20.90 │
└──────────────────────────────────────────┘
```
Reasoning: separates metadata from image processing and gives users a
constantly-visible cost/size estimate.

## Risks / migration notes

- `app.sidebarTab` currently only knows `"settings"` and `"preview"` —
  needs to accept `image | dimensions | palette | preview | project`,
  with a back-compat remap for old `"settings"` localStorage values.
- Tab persistence is already a `setSidebarTab` setter — no schema change.
- All sub-sections referenced (`imageCard`, `dimSection`, etc.) are
  already isolated React subtrees inside `creator/Sidebar.js`, so the
  move is mechanical.
- Mobile: existing `<900px` collapse logic still applies; tabs just need
  scroll-overflow at narrow widths.
