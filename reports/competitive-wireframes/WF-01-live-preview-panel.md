# WF-01: Live 2-Panel Generation UI

**Addresses:** FI-01, R08
**Phase:** 2 (medium effort)
**Replaces:** Current 5-step Import Wizard (for the settings + preview steps)

---

## Desktop Layout (≥900px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  [← Back]   Create pattern from image                                        │
├───────────────────────────────┬──────────────────────────────────────────────┤
│  SETTINGS                     │  PREVIEW                                     │
│                               │                                              │
│  Image                        │  ┌────────────────────────────────────┐      │
│  [Crop / rotate ▸]            │  │                                    │      │
│                               │  │                                    │      │
│  ─────────────────────────    │  │         Pattern preview            │      │
│                               │  │           (updates live)           │      │
│  Colours                      │  │                                    │      │
│  ○──────────●───────── 18     │  │                                    │      │
│  1                       30   │  └────────────────────────────────────┘      │
│                               │                                              │
│  Dithering                    │  Quality                                     │
│  [Balanced             ▾]     │  ┌────────────────────────────────────┐      │
│                               │  │  Stitch Score: 87 / 100  [?]       │      │
│  ─────────────────────────    │  │                                    │      │
│                               │  │  Confetti:  4.2%  [Show overlay]   │      │
│  Confetti cleanup             │  │  Thread changes: ~34               │      │
│  [On — Balanced        ▾]     │  │  Colours used: 18                  │      │
│                               │  └────────────────────────────────────┘      │
│  ─────────────────────────    │                                              │
│                               │  Size: 120 × 90 stitches (8.6 × 6.4 in)     │
│  Size                         │  Fabric: 14 count                            │
│  Width  [120 stitches]        │                                              │
│  Height [90  stitches]        │                                              │
│  Fabric [14 count      ▾]     │                                              │
│                               │                                              │
│  [Advanced options      ▾]    │             [Generate pattern  ▶]            │
│                               │                                              │
└───────────────────────────────┴──────────────────────────────────────────────┘
```

**Interaction notes:**
- Slider and dropdown changes trigger a debounced (300ms) regeneration
- Preview updates in place with a subtle loading indicator during regeneration
- "Stitch Score" and quality block below the preview update simultaneously
- "Show overlay" highlights isolated stitches in amber on the preview canvas
- "Generate pattern" confirms and opens the full editor
- "Crop / rotate" expands to the crop UI above the 2-panel layout; collapses back after confirming

---

## Mobile Layout (<900px, stacked)

```
┌──────────────────────────────────────┐
│  [← Back]   Create from image        │
├──────────────────────────────────────┤
│  PREVIEW                             │
│  ┌──────────────────────────────┐    │
│  │                              │    │
│  │     Pattern preview          │    │
│  │                              │    │
│  └──────────────────────────────┘    │
│                                      │
│  Score: 87/100  Confetti: 4.2%       │
│                 [Show overlay]       │
│                                      │
├──────────────────────────────────────┤
│  SETTINGS                            │
│                                      │
│  Colours  ○──────●────────  18       │
│  Dithering  [Balanced  ▾]            │
│  Cleanup    [On — Balanced ▾]        │
│  Size       [120 × 90  ▾]            │
│                                      │
│  [Advanced ▾]                        │
│                                      │
│  [Generate pattern  ▶]               │
└──────────────────────────────────────┘
```

**Mobile notes:**
- Preview at top, settings below — "preview first" matches the mobile mental model
- Settings are collapsed to the most common 4 options; advanced expands
- Score is shown as a compact single line below the preview

---

## State: Regenerating (spinner)

```
  PREVIEW
  ┌──────────────────────────────────────────┐
  │  [faded previous preview]                │
  │                                          │
  │          [●  Updating…]                  │
  │                                          │
  └──────────────────────────────────────────┘
  Score: calculating…
```

---

## State: Confetti overlay active

```
  PREVIEW
  ┌──────────────────────────────────────────┐
  │                                          │
  │      [normal pattern]                    │
  │       ████ amber dots = isolated         │
  │       ████ stitches overlaid             │
  │                                          │
  └──────────────────────────────────────────┘
  [Hide overlay]   52 isolated stitches shown
```
