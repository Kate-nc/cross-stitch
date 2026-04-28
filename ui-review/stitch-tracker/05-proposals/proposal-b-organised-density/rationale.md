# Proposal B: "Organised Density" — Same features, better hierarchy

## Design Philosophy
Keep every feature the tracker currently offers, but **eliminate duplication, merge chrome layers, and impose a clear visual hierarchy**. Nothing moves to a separate page — instead controls are grouped, collapsed by default, and promoted/demoted based on actual task frequency. Ideal for power users who want everything at arm's reach.

This is the least disruptive proposal — it preserves the overall page shape while fixing the specific problems identified in the audit.

---

## Key Structural Changes

### 1. Merge ContextBar into Header
The current Header (48px) + ContextBar (44px) = 92px for navigation/metadata. Merge them into **one 48px row**: logo, nav tabs, project name (truncated), progress %, file menu, save button. Desktop gains 44px.

### 2. Collapse Pill Toolbar into two pill groups
Current pill toolbar: ~15 buttons in one long row (52px). Replace with:
- **Left pill:** Mark mode group (Cross | Half ▾ | Range) + Pan toggle
- **Right pill:** View mode group (Symbol | Colour | Highlight) with a single dropdown for highlight options
- **Session chip** stays but moves right-of-centre

Height stays 44px but visual clutter reduced by ~40%.

### 3. Replace progress bar + MiniStatsBar with a single inline strip
Current: progress bar (34px) + MiniStatsBar (48px) = 82px. Replace with a single-line **info strip** (28px): a thin progress bar with text overlay ("23.4% · 1,230/5,254 · Today: 42"). Clicking it opens the Stats Dashboard.

### 4. Right panel becomes a tabbed drawer
Current right panel: 280px always-visible sidebar with 6 sections stacked vertically. Replace with:
- **Tabbed panel** (260px desktop, full-width bottom drawer on mobile)
- **Three tabs:** Colours | Session | More
  - Colours: colour list (stays as-is, it works well)
  - Session: live timer, speed, stitch count, session chart
  - More: Suggestions, Thread Usage, Layers, View Settings, Project Info, Actions

On mobile: the panel collapses to a tab bar pinned at the bottom. Tapping a tab raises a half-screen drawer. Swiping down dismisses it.

### 5. Remove below-canvas sections
Thread Organiser → moves to Stash Manager (where it belongs)
Project Info → moves to "More" tab in right panel
Save/Load → already in Header File menu (remove duplicate)

---

## What Stays On Screen

### Mobile Layout
```
┌──────────────────────────────┐
│ 🧵 Cross Stitch  Track ▾  ⋯ │  ← 48px header (merged)
├──────────────────────────────┤
│ ✏Cross ½▾ ⊞  ✋ │Sym Col HL│  ← 44px consolidated toolbar
├──────────────────────────────┤
│ ▓▓▓▓▓▓▓▓░░░░░░  23.4%  42↑ │  ← 28px info strip (progress + today)
├──────────────────────────────┤
│                              │
│                              │
│         CANVAS               │  ← Fills remaining space
│                              │
│                              │
├──────────────────────────────┤
│  🎨 Colours  ⏱ Session  ⋯   │  ← 44px tab bar (drawer trigger)
└──────────────────────────────┘
```

**Total chrome: ~164px** (vs current 226px). Canvas gains ~62px.

When a tab is tapped, a half-screen bottom drawer slides up over the canvas.

### Desktop Layout
```
┌────────────────────────────────────────────────────────────────┐
│ 🧵 Cross Stitch Studio  Create Track Stash │ Rose Garden·80×80 │ 23% │ ⋯ │
├────────────────────────────────────────────────────────────────┤
│ ✏Cross ½▾ ⊞ ✋ │ Sym Col HL │  ·◀310▶·  │ 15m·42st │ −●120%+ │
├────────────────────────────────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░  23.4%  · 1,230 / 5,254       │
├────────────────────────────────────┬───────────────────────────┤
│                                    │ 🎨 Colours │ ⏱ │ ⋯       │
│                                    ├───────────────────────────┤
│           CANVAS                   │ ■ 310 Black     73%      │
│           (fills remaining)        │ ■ 321 Red       37%      │
│                                    │ ■ 550 Violet     0%      │
│                                    │ ■ 3799 Grey     53%      │
│                                    │ ...                       │
│                                    │                           │
├────────────────────────────────────┴───────────────────────────┤
│ Status: Row 12, Col 8 · DMC 310 Black · Full cross            │
└────────────────────────────────────────────────────────────────┘
```

---

## Where Everything Moves

| Current Location | Feature | New Location |
|---|---|---|
| Header (48px) | Logo, nav tabs, file menu, help | **Kept** — same row |
| ContextBar (44px) | Name, dimensions, progress %, Edit/Save/Home | **Merged into Header** — name+dims+progress join header row. Edit/Home removed (use nav tabs). Save stays in File menu. |
| Pill toolbar (52px) | 15+ buttons | **Consolidated toolbar** (44px) — two pill groups, fewer visual separators |
| Progress bar (34px) | Completion bar + text | **Info strip** (28px) — thinner, text overlaid |
| MiniStatsBar (48px) | Today/streak/view all | **Removed** — "today" count moves to info strip; streak moves to Stats Dashboard; "view all" becomes click on info strip |
| Right panel — Colours | Colour list | **Tab 1** (Colours) — same content, now in tabbed panel |
| Right panel — Session | Live time, speed, count | **Tab 2** (Session) — same content, own tab |
| Right panel — Suggestions | Next-region tips | **Tab 3** (More) → Suggestions section |
| Right panel — Thread Usage | Confetti analysis | **Tab 3** (More) → Thread Usage section |
| Right panel — View | View settings, highlight options | **Toolbar dropdown** — tapping HL opens a small popover for Isolate/Tint/Dim settings |
| Right panel — Actions | Summary, Edit | **Tab 3** (More) → Actions section |
| Below-canvas — Thread Organiser | Thread management | **Stash Manager page** (removed from tracker entirely) |
| Below-canvas — Project Info | Metadata grid | **Tab 3** (More) → Project Info section |
| Below-canvas — Save/Load | Save/Load buttons | **Removed** — File menu in header handles this |

---

## Mobile Interaction Model

### Tab bar behaviour
- Three tabs at bottom: **Colours** | **Session** | **More**
- Tapping a tab opens a half-screen bottom drawer (max 55dvh)
- Canvas remains visible behind (dimmed) — user can still see pattern while checking colour list
- Tapping tab again or swiping down closes the drawer
- Active tab is highlighted with accent colour underline

### Toolbar adaptations for mobile
- On screens <500px, the View pill (Sym/Col/HL) collapses into a single "View ▾" dropdown button
- Session chip hidden (info available in Session tab)
- Zoom controls hidden (pinch-to-zoom only)

### Touch targets
All toolbar buttons enforce min 44×44px touch area via padding even if visual size is smaller.

---

## Creator↔Tracker Harmony

| Aspect | Creator (currently) | Tracker (Proposal B) | Harmony |
|---|---|---|---|
| Header | Same header component | **Same** (with merged ContextBar) | ⚠️ Creator retains ContextBar; tracker merges it. Minor inconsistency. Could apply same merge to Creator for full harmony. |
| Primary toolbar | Top pill row | **Top pill row** (consolidated) | ✅ Same position and general shape |
| Right panel | Settings/palette/legend tabs | **Tabbed panel** (Colours/Session/More) | ✅ Same structure, different tab names |
| Canvas | Centre | Centre | ✅ Same |
| Below canvas | Export/project info | **Nothing** (moved to tabs) | ⚠️ Creator still has below-canvas content |

**Best harmony of all three proposals.** The structural shape is nearly identical between Creator and Tracker. The only dissonance is below-canvas content (Creator keeps it, Tracker removes it).

---

## Main Risk / Trade-Off

**Risk:** Still has three layers of chrome above the canvas (header + toolbar + info strip = 120px). More than Proposal A's 84px (mobile) or Proposal C's ~48px. Power users may feel the toolbar is "busy" even after consolidation.

**Mitigation:** The info strip is non-interactive dead space most of the time — it could auto-collapse to 0px after 3 seconds and reappear on scroll-up (like mobile browser chrome), saving another 28px during active stitching.

**Trade-off:** Feature discoverability vs canvas space. Proposal B optimises for discoverability — everything is at most 2 taps away. But it sacrifices ~62px of canvas compared to Proposal A's ~90px gain.
