# Proposal C: "Spotlight" — Command Palette + Adaptive Chrome

## Design Philosophy
Minimal persistent chrome. The canvas is virtually full-screen at all times. All features are accessed through a **spotlight / command palette** (Ctrl+K on desktop, swipe-up or long-press on mobile). The palette combines search, navigation, and settings into one fuzzy-search overlay — like VS Code's Ctrl+Shift+P or macOS Spotlight.

A thin **persistent status ribbon** (24px) and a **floating action cluster** (3 buttons) are the only permanent UI. Everything else appears on demand.

---

## Key Concepts

### 1. Spotlight Palette
A centred, half-screen overlay invoked by:
- **Desktop:** Ctrl+K or click the search icon in the status ribbon
- **Mobile:** Swipe up from bottom edge, or long-press with two fingers

The palette contains:
- **Fuzzy search** — type "zoom 200" to set zoom, "colour 310" to highlight DMC 310, "sym" to toggle symbol view, "save" to save
- **Recent actions** — last 5 used commands shown instantly
- **Category sections** — View, Mark, Colours, Session, Analysis, Project — browseable without typing
- **Inline results** — colour swatches appear next to colour commands, settings show current value with toggle

### 2. Status Ribbon (24px)
```
  ✕◞     23.4% ▓▓▓▓░░░░  310 Black  ◀ ▶     ⌘K
```
A single row showing: active tool icon, progress bar, current colour, cycle arrows, and a palette trigger. This replaces Header + ContextBar + Progress bar + MiniStatsBar (174px → 24px).

Page navigation (Create / Track / Stash) moves into the palette: type "create" or "stash" to switch pages. Or a three-dot hamburger at the far left of the ribbon.

### 3. Floating Action Cluster
Three buttons floating at the bottom-right corner:
```
       ✏   ← Mark (primary action, large)
      ✋ ↩  ← Pan + Undo (smaller, stacked above)
```
- **Mark** (56×56px): primary action. Tap to activate mark mode, canvas taps register as stitches.
- **Pan** (40×40px): activate pan mode.
- **Undo** (40×40px): undo last action.

On desktop, these can be hidden entirely (keyboard shortcuts suffice). They appear as a floating cluster on touch devices.

---

## What Stays On Screen

### Mobile Layout
```
┌──────────────────────────────┐
│ ≡  23% ▓▓▓░░  310 ◀▶    🔍 │  ← 24px status ribbon
├──────────────────────────────┤
│                              │
│                              │
│                              │
│         CANVAS               │  ← Fills nearly everything
│                              │
│                              │
│                              │
│                         ✏    │  ← Floating action cluster
│                       ✋ ↩   │
│                              │
└──────────────────────────────┘
```

**Total persistent chrome: 24px.** Maximum possible canvas space.

When spotlight is invoked:
```
┌──────────────────────────────┐
│ ≡  23% ▓▓▓░░  310 ◀▶    🔍 │
├──────────────────────────────┤
│▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│  ← dimmed canvas
│▒▒▒┌────────────────────┐▒▒▒▒│
│▒▒▒│ 🔍 mark half...     │▒▒▒▒│  ← spotlight search box
│▒▒▒├────────────────────┤▒▒▒▒│
│▒▒▒│ ✏ Mark mode  (active)│▒▒▒│
│▒▒▒│ ½ Half stitch ▸     │▒▒▒│  ← fuzzy-matched results
│▒▒▒│ ⊞ Range mark        │▒▒▒│
│▒▒▒│ ✋ Pan mode          │▒▒▒│
│▒▒▒│ ──────────────────  │▒▒▒│
│▒▒▒│ Recently used:       │▒▒▒│
│▒▒▒│   Highlight colour   │▒▒▒│
│▒▒▒│   Toggle symbols     │▒▒▒│
│▒▒▒└────────────────────┘▒▒▒▒│
│▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│
└──────────────────────────────┘
```

### Desktop Layout
```
┌──────────────────────────────────────────────────────────────────┐
│ ≡  23.4% ▓▓▓▓▓▓░░░░  310 Black ◀ ▶   15m·42st   1,230/5,254   ⌘K │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                                                                  │
│                        CANVAS                                    │
│                        (fills nearly all viewport)               │
│                                                                  │
│                                                                  │
│                                                                  │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ Row 12, Col 8 · DMC 310 Black                                    │  ← 20px hover status (auto-hides)
└──────────────────────────────────────────────────────────────────┘
```

Desktop has no floating buttons (keyboard + mouse right-click context menu). Status ribbon expands slightly (shows session timer + stitch count inline). A colour legend can be pinned from the palette ("pin colours" command) as a floating sidebar, dismissable any time.

---

## Where Everything Moves

| Current Location | Feature | New Location |
|---|---|---|
| Header (48px) | Logo, nav tabs, file menu | **Ribbon hamburger (≡)** for nav; palette for file ops |
| ContextBar (44px) | Name, dims, progress, actions | **Ribbon** (progress); palette for all else |
| Pill toolbar (52px) | 15+ buttons | **Floating cluster** (3 buttons) + **palette** for everything else |
| Progress bar (34px) | Completion bar + text | **Ribbon** (inline progress bar) |
| MiniStatsBar (48px) | Today/streak/view all | **Palette** → "stats" or "today" |
| Right panel — Colours | Colour list | **Palette** → "colours" → pinnable floating panel |
| Right panel — Session | Live time, speed | **Ribbon** (session timer on desktop); palette → "session" |
| Right panel — Suggestions | Next-region tips | **Palette** → "suggestions" |
| Right panel — Thread Usage | Confetti analysis | **Palette** → "thread usage" or "analysis" |
| Right panel — View | View settings | **Palette** → "view", "highlight", "symbols" etc. |
| Right panel — Actions | Summary, Edit | **Palette** → "summary", "edit in creator" |
| Below-canvas — Thread Organiser | Thread management | **Palette** → "threads" → opens in Stash Manager |
| Below-canvas — Project Info | Metadata grid | **Palette** → "project info" |
| Below-canvas — Save/Load | Save/Load buttons | **Palette** → "save" / "load" (Ctrl+S still works) |
| Status bar | Hover position | **Auto-hiding status line** at bottom (desktop), hidden on mobile |
| Zoom controls | Zoom ± / fit | **Pinch on mobile, Ctrl+scroll on desktop; palette → "zoom 150"** |
| Undo/Redo | Undo/Redo | **Floating button (mobile); Ctrl+Z/Y (desktop); palette → "undo"** |

---

## Palette Command Catalogue

| Command | Aliases | Action |
|---|---|---|
| `mark` | `cross`, `stitch` | Activate mark mode |
| `half /` | `half stitch forward` | Half-stitch forward slash |
| `half \` | `half stitch back` | Half-stitch backslash |
| `erase half` | `remove half` | Erase half-stitch |
| `range` | `rectangle`, `box` | Range-mark mode |
| `pan` | `navigate`, `move` | Pan mode |
| `undo` | `ctrl z` | Undo last action |
| `redo` | `ctrl y` | Redo |
| `zoom {n}` | `zoom in`, `zoom out`, `fit` | Set zoom level |
| `colour {id}` | `color`, `dmc` | Highlight specific DMC colour |
| `next colour` | `next` | Cycle to next colour |
| `prev colour` | `previous` | Cycle to previous colour |
| `colours` | `palette`, `legend` | Open/pin colour legend |
| `highlight` | `isolate`, `tint`, `dim` | Set highlight mode |
| `symbols` | `sym` | Toggle symbol view |
| `view colour` | `col` | Colour view mode |
| `layers` | `grid`, `backstitch` | Toggle layer visibility |
| `session` | `timer`, `speed` | Show session info |
| `stats` | `dashboard`, `progress` | Open stats dashboard |
| `suggestions` | `recommend`, `next region` | Show tracking suggestions |
| `analysis` | `thread usage`, `confetti` | Show thread usage analysis |
| `save` | `ctrl s` | Save project |
| `load` | `open` | Open project |
| `project info` | `info`, `metadata` | Show project details |
| `create` | `creator`, `edit pattern` | Switch to Creator page |
| `stash` | `manager`, `inventory` | Switch to Stash Manager |
| `summary` | `overview` | Generate stitching summary |
| `export` | `pdf` | Export options |
| `help` | `shortcuts`, `?` | Show help / keyboard shortcuts |
| `preview` | `realistic` | Toggle realistic preview |

---

## Mobile Interaction Model

### Swipe-up gesture
Swipe up from the bottom 20px of the screen opens the spotlight palette. This is the **only gesture beyond tap/pinch/pan**. It replaces all menus, tabs, settings panels.

### Floating action cluster
Three buttons in the bottom-right:
- **Mark** (primary, 56×56px, accent colour): toggles mark mode
- **Pan** (40×40px, above-left): toggles pan mode
- **Undo** (40×40px, above-right): undo

Long-press on Mark opens a radial sub-menu with Half /, Half \, Range, Erase.

### Colour cycling
◀ ▶ on the status ribbon. Or swipe left/right on the ribbon.

---

## Creator↔Tracker Harmony

| Aspect | Creator (currently) | Tracker (Proposal C) | Harmony |
|---|---|---|---|
| Header | Full header bar | **24px ribbon** — no header | ❌ Very different: Creator has full header, Tracker has minimal ribbon |
| Primary toolbar | Top pill row | **Floating cluster** + **palette** | ❌ Fundamentally different interaction model |
| Canvas | Centre with top toolbar | **Nearly full-screen** | Canvas layout differs |
| Right panel | Settings/palette tabs | **None (pinnable on demand)** | ❌ Creator has persistent panel, Tracker has none |
| Page navigation | Header tabs | **Palette command** | ❌ Different navigation model |

**Worst harmony of all three proposals.** The Tracker would feel like a completely different app from the Creator. This could be mitigated by applying the same palette model to the Creator — but that's a much larger redesign.

**Alternative:** Apply the ribbon+palette to all three pages (Create, Track, Stash), making it a unified design language. This is a significant commitment but would create the most modern and distinctive UX. See Figma's command palette and Linear's Ctrl+K for precedent.

---

## Main Risk / Trade-Off

**Risk: Discoverability is extremely poor.** New users see a nearly blank screen with three floating buttons and a thin ribbon. There is no visible hint that swipe-up or Ctrl+K opens a command palette. The learning curve is steep.

**Mitigation:**
- First-time overlay: "Swipe up or press Ctrl+K to access all tools and settings"
- Pulsing glow on 🔍 icon in ribbon for first 3 sessions
- Ribbon tooltip on hover: "Search commands (Ctrl+K)"
- Comprehensive keyboard shortcuts that muscle-memory users expect (Ctrl+S, Ctrl+Z, +/- for zoom)

**Risk: Command palette is slower for frequent actions.** Switching between Mark and Pan requires opening the palette on mobile (unless using the floating buttons). Changing highlight mode is 2 steps (open palette + select) vs 1 tap on a toolbar button.

**Mitigation:** The floating cluster handles the 90% case (mark/pan/undo). The palette is for the other 10%. Power users who frequently adjust highlight modes would be better served by Proposal B.

**Trade-off:** Maximum canvas space vs learnability. This is the right choice for an app where 95% of screen time is spent looking at and tapping the canvas. It is the wrong choice if users frequently adjust settings mid-session.
