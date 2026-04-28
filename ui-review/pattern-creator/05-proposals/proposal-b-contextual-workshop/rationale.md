# Proposal B: "Contextual Workshop" — Tools Follow the Task

## Design Philosophy
The Creator's complexity is justified — it IS a power tool. But the current UI shows **all controls all the time**, regardless of what the user is doing. A pattern designer iterating on generation settings needs different controls than one fine-tuning individual stitches.

This proposal introduces **mode-aware UI**: the sidebar and toolbar adapt based on which phase of work the user is in. Two phases: **Generation** (adjusting settings, generating patterns) and **Editing** (painting, selecting, refining). The controls for each phase are all present but only the relevant set is prominent.

Harmonises with Tracker Proposal B via the same structural skeleton (merged header, tabbed panel, mobile drawer) but adds context-sensitivity unique to the Creator's richer workflow.

---

## Key Structural Changes

### 1. Merge ContextBar into Header (−36px)
Same as Proposal A and Tracker Proposal B. One 48px row.

### 2. Phase-Aware Toolbar
The pill toolbar shows different tool sets based on context:

**Generation Phase** (no pattern yet, or sidebar generation sections focused):
```
[ Dimensions: 200×180 │ Colours: 35 │ ▸ Advanced… │ ⟳ Generate ]
```
A slim generation summary bar. All details are in the sidebar, but the most-changed settings (dimensions, colour count) have inline controls in the toolbar for quick adjustment.

**Editing Phase** (pattern loaded, Pattern tab active):
```
[ ✏P 🪣F ⌫ 💧│ ╳ Cross ▾│ 1 2 3 │ 🪄▾│ ■310 │ ±% Fit │ ↩↪ │ 👁▾│ ⊞ │⋯]
```
Full editing toolbar — same tools as now, but without Diagnostics (moved to ⋯ overflow).

The switch is automatic based on state (pattern exists? which tab is active?) with a manual override toggle.

### 3. Sidebar — Smart Section Visibility
Sidebar sections show/hide based on phase:

**Generation Phase** (Pattern tab, no pattern or focus on generation):
- ✅ Image Card
- ✅ Dimensions & Fabric (merged)
- ✅ Palette
- ✅ Stitch Cleanup
- ✅ Adjustments
- ✅ Background
- ✅ Palette Swap
- ✅ Generate button

**Editing Phase** (Pattern tab, pattern loaded, tool active):
- ✅ Palette Chips (expanded, larger — primary colour selection)
- ✅ View Toggle
- ✅ Highlight Mode controls
- ❌ Generation sections collapsed into a single "Generation Settings ▸" expandable heading
- ✅ Generate button (always available for regeneration)

Other tabs (Project, Threads, Export) remain unchanged — they're phase-independent.

### 4. Swatch Strip — Contextual
**Generation Phase:** Hidden (not needed — no pattern to paint on).
**Editing Phase:** Visible (36px) — colour selection for painting.

This recovers 36px of chrome during the generation loop when the swatch strip is irrelevant.

### 5. Mobile Drawer — Phase-Aware Content
On mobile, the drawer content follows the same phase rules. In Generation Phase, the drawer shows generation controls front-and-centre. In Editing Phase, it shows palette chips + highlight controls.

---

## Chrome Budget

### Desktop — Generation Phase

| Layer | Height | Content |
|---|---|---|
| Header (merged) | 48px | Logo, nav, project name |
| Generation toolbar | 36px | Dimensions + Colours + Generate inline |
| **Total** | **84px** | No swatch strip, no pill row |

Canvas on 1080p: **996px** minus 260px rpanel = **736px canvas width**, 996px height.

### Desktop — Editing Phase

| Layer | Height | Content |
|---|---|---|
| Header (merged) | 48px | Logo, nav, project name |
| Pill Row | 44px | Full editing tools |
| Swatch Strip | 36px | Colour swatches |
| **Total** | **128px** | Same as Proposal A |

### Mobile — Generation Phase

| Layer | Height |
|---|---|
| Header | 48px |
| Generation toolbar | 36px |
| Drawer (collapsed) | 44px |
| **Total** | **128px** → **539px canvas** on 667px |

### Mobile — Editing Phase

| Layer | Height |
|---|---|
| Header | 48px |
| Pill Row | 44px |
| Swatch Strip | 36px |
| Drawer (collapsed) | 44px |
| **Total** | **172px** → **495px canvas** on 667px |

### Harmony with Tracker Proposal B

| Element | Tracker B | Creator B | Match? |
|---|---|---|---|
| Header | 48px merged | 48px merged | ✅ Identical |
| Toolbar | 44px always | 36-80px phase-dependent | ⚠️ Different — but creator's complexity justifies adaptive toolbar |
| Info strip | 28px | None | ✅ N/A for creator |
| Right panel | 260px / drawer | 260px / drawer | ✅ Identical structure |
| Mobile drawer | 44px / 55dvh | 44px / 55dvh | ✅ Identical |

---

## What Stays On Screen

### Desktop — Generation Phase
```
┌────────────────────────────────────────────────────────────────┐
│ 🧵 StitchCraft  Create Track Stash │ Victorian Roses · 35c  │⋯│
├────────────────────────────────────────────────────────────────┤
│   200 × 180  ·  35 colours  ·  14 ct   │ ▸ Advanced │⟳ Gen. │
├──────────────────────────────────┬─────────────────────────────┤
│                                  │ 📐Pattern│📋│🧵│📤            │
│                                  ├─────────────────────────────┤
│                                  │ [Image Card]                │
│    COMPARISON SLIDER             │ ▾ Dimensions & Fabric  200× │
│    (source vs preview)           │ ▾ Palette        35 colours │
│                                  │ ▸ Stitch Cleanup            │
│                                  │ ▸ Adjustments               │
│                                  │ ▸ Background                │
│                                  │ ▸ Palette Swap              │
│                                  │ [  ⟳ Regenerate  ]          │
├──────────────────────────────────┴─────────────────────────────┤
```

### Desktop — Editing Phase
```
┌────────────────────────────────────────────────────────────────┐
│ 🧵 StitchCraft  Create Track Stash │ Victorian Roses · 35c  │⋯│
├────────────────────────────────────────────────────────────────┤
│ ✏P F ⌫ I │ ╳ Cross ▾│ 1 2 3 │ 🪄▾│ ■310│ −●100%+│ ↩↪│ 👁▾│⊞│⋯│
├────────────────────────────────────────────────────────────────┤
│ ■  ■  ■  ■  ■  ■  ■  ■  ■  ■  ■  ■  ⋯  [+20 more]          │
├──────────────────────────────────┬─────────────────────────────┤
│                                  │ 📐Pattern│📋│🧵│📤            │
│                                  ├─────────────────────────────┤
│                                  │ [310] [321] [699] [797]     │
│         CANVAS                   │ [725] [603] [333] [740]     │
│         (pattern editing)        │ [Col│Sym│Both]              │
│                                  │ [Highlight: Isolate▾]       │
│                                  │ ▸ Generation Settings       │
│                                  │ [  ⟳ Regenerate  ]          │
├──────────────────────────────────┴─────────────────────────────┤
```

---

## Pros and Cons

| | |
|---|---|
| ✅ Only relevant controls visible at any time — reduces cognitive load | |
| ✅ Generation phase gains 36-44px (no swatch strip, compact toolbar) | |
| ✅ Editing phase gains sidebar space (generation sections collapsed) | |
| ✅ Same structural skeleton as Tracker Proposal B | |
| ✅ Sidebar palette chips get more room in editing phase | |
| ❌ Phase detection logic adds implementation complexity | |
| ❌ Users may be confused when toolbar changes (need smooth transition) | |
| ❌ "Where did the Generate button go?" if user doesn't understand phases | |
| ❌ Medium implementation effort — new state machine + conditional rendering | |

---

## Phase Transition Rules

| Trigger | Transitions To |
|---|---|
| App loads with no pattern | Generation Phase |
| Image uploaded | Generation Phase |
| "Generate" clicked → pattern rendered | Editing Phase (after 500ms) |
| User clicks a generation section in sidebar | Generation Phase (toolbar switches) |
| User clicks a tool button or canvas | Editing Phase |
| User switches to Project/Threads/Export tab | Phase-neutral (toolbar hides) |
| Manual toggle in toolbar corner | Override between phases |

The transition should be animated (200ms crossfade) to avoid jarring UI shifts.

---

## Implementation Effort: Medium

1. Merge ContextBar (same as Proposal A)
2. Create phase state: `creatorPhase` = `"generation" | "editing"` with auto-detection
3. Conditional toolbar rendering based on phase
4. Sidebar section visibility toggles based on phase
5. Swatch strip conditional render
6. Generation inline toolbar component (new, ~100 lines)
7. Transition animations (CSS only)

**Estimated changes:** ~8 files (header.js, ToolStrip.js, Sidebar.js, PatternTab.js, styles.css, useCreatorState.js, creator-main.js, new generation-toolbar component)
