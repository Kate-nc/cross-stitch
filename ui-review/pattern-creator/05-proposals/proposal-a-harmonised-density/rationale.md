# Proposal A: "Harmonised Density" — Proposal B's Twin for the Creator

## Design Philosophy
Apply the exact same structural decisions accepted in Tracker Proposal B to the Creator: merge ContextBar into Header, consolidate chrome layers, tabbed right panel with mobile bottom drawer. Maintain all features, add nothing new — just reorganise. The Creator legitimately needs more toolbar controls than the Tracker, so the toolbar stays two rows (pill + swatch strip) but gains visual clarity.

This is the **lowest-risk proposal** — it's the Tracker Proposal B decisions applied verbatim to the Creator.

---

## Key Structural Changes

### 1. Merge ContextBar into Header (−36px)
Current: Header (48px) + ContextBar (36px) = 84px. Replace with **one 48px row**: logo, nav tabs, project name (click-to-edit), colour count badge, File menu, Save. The "Track ›" shortcut button moves to the Export tab (where "Open in Tracker" already lives).

### 2. Consolidate Pill Row (52px → 44px)
Reduce internal padding from `4px` to `2px`. Tighter button spacing. Visual groups separated by `tb-sdiv` dividers. Same controls, 8px recovered.

Toolbar groups:
- **Left:** Brush (Paint / Fill / Erase / Eyedropper) + Stitch Type dropdown + Brush Size
- **Centre:** Selection (Wand / Lasso ▾) + Colour Chip
- **Right:** Zoom (± Fit) + Undo/Redo + Preview ▾ + Split + Diag + Overflow ⋯

### 3. Keep Swatch Strip (36px)
The swatch strip is unique to the Creator and heavily used during editing. It stays as Row 2. Total toolbar: 44px + 36px = 80px.

### 4. Sidebar — same 4 tabs, mobile drawer
Desktop: 260px tabbed panel (reduced from 280px).
Mobile: bottom drawer (44px collapsed tab bar, 55dvh open).

Sidebar content stays identical — Pattern | Project | Threads | Export tabs with the same sections in each.

### 5. Merge Fabric & Floss into Dimensions
The single fabric count dropdown merges into the Dimensions section. 7 sidebar sections become 6.

---

## Chrome Budget

### Desktop

| Layer | Height | Content |
|---|---|---|
| Header (merged) | 48px | Logo, nav, project name, colour count, file menu |
| Pill Row (tightened) | 44px | All toolbar tools |
| Swatch Strip | 36px | Colour swatches |
| **Total** | **128px** | |

**Savings:** 44px less than current 172px (26% reduction). Canvas gains 44px vertical space.

**rpanel:** 260px (vs current 280px). Canvas width gains 20px.

### Mobile

| Layer | Height | Content |
|---|---|---|
| Header (merged) | 48px | Compact nav |
| Pill Row (tightened) | 44px | Scrollable tools |
| Swatch Strip | 36px | Scrollable swatches |
| Drawer (collapsed) | 44px | Tab bar |
| **Total** | **172px** | |

**Savings:** 44px vs current 216px (20%). Canvas on 667px phone: **495px** (vs current 451px).

### Harmony with Tracker Proposal B

| Element | Tracker B | Creator A | Match? |
|---|---|---|---|
| Header | 48px merged | 48px merged | ✅ Identical |
| Toolbar | 44px consolidated | 44px pill + 36px swatch strip = 80px | ⚠️ Creator has extra row (justified) |
| Info strip | 28px | None (no progress tracking in Creator normally) | ✅ N/A |
| Right panel | 260px desktop / drawer mobile | 260px desktop / drawer mobile | ✅ Identical |
| Bottom drawer | 44px collapsed, 55dvh open | 44px collapsed, 55dvh open | ✅ Identical |

---

## What Stays On Screen

### Mobile Layout
```
┌──────────────────────────────┐
│ 🧵 StitchCraft  Create ▾  ⋯ │  ← 48px header (merged)
├──────────────────────────────┤
│ ✏P F ⌫ I │ ╳▾ │ 🪄▾│ ■ │±0│↩↪│  ← 44px toolbar
├──────────────────────────────┤
│ ■■■■■■■■■■■■■■■■■■ ⋯ [+]   │  ← 36px swatch strip
├──────────────────────────────┤
│                              │
│                              │
│         CANVAS               │  ← 495px on 667px phone
│                              │
│                              │
├──────────────────────────────┤
│ 📐Pattern 📋Project 🧵Thread 📤│  ← 44px drawer tabs
└──────────────────────────────┘
```

### Desktop Layout
```
┌────────────────────────────────────────────────────────────────┐
│ 🧵 StitchCraft Studio  Create Track Stash │Victorian Roses·35c│ ⋯│
├────────────────────────────────────────────────────────────────┤
│ ✏P F ⌫ I │ ╳ ¼ /▾│ 1 2 3 │ 🪄▾│ ■310│ −●100%+│ ↩↪│ 👁▾│⊞│🔍│⋯│
├────────────────────────────────────────────────────────────────┤
│ ■  ■  ■  ■  ■  ■  ■  ■  ■  ■  ■  ■  ⋯  [+20 more]          │
├──────────────────────────────────┬─────────────────────────────┤
│                                  │ 📐Pattern│📋│🧵│📤            │
│                                  ├─────────────────────────────┤
│                                  │ [Palette Chips]             │
│         CANVAS                   │ [View: Col│Sym│Both]        │
│         (fills remaining)        │ [Image Card]                │
│                                  │ ▸ Dimensions & Fabric       │
│                                  │ ▸ Palette                   │
│                                  │ ▸ Stitch Cleanup            │
│                                  │ ▸ Adjustments               │
│                                  │ ▸ Background                │
│                                  │ ▸ Palette Swap              │
│                                  │ [  ⟳ Regenerate  ]          │
├──────────────────────────────────┴─────────────────────────────┤
```

---

## Pros and Cons

| | |
|---|---|
| ✅ Maximum harmony with Tracker Proposal B | |
| ✅ Lowest implementation effort — minimal new patterns | |
| ✅ Familiar to users who've seen the accepted tracker layout | |
| ✅ Recovers 44px chrome on all viewports | |
| ❌ Sidebar still shows 6 sections (was 7, merged one) — long scroll | |
| ❌ Toolbar is still dense (~15 items in one row) — just tighter | |
| ❌ No change to sidebar behaviour — all sections visible regardless of workflow stage | |
| ❌ Mobile drawer still requires discovering pull-up gesture | |

---

## Implementation Effort: Low

1. Merge ContextBar fields into Header (same work as Tracker)
2. Tighten pill row padding (CSS only)
3. Reduce rpanel width 280→260 (CSS only)
4. Merge Fabric & Floss into Dimensions section (React restructure, small)
5. Mobile drawer already has CSS — just needs state wiring for creator (low effort, may already partially work)

**Estimated changes:** ~5 files (header.js, Sidebar.js, ToolStrip.js, styles.css, possibly creator-main.js)
