# UX Audit · 1 · App Map

> Phase 1 / Step 1 — full inventory of the Cross Stitch Pattern Generator's
> screens, navigation, components, and modes. Source for everything that
> follows.

---

## 1. Entry points

The app is a fully client-side PWA shipping **three top-level HTML pages**. Each
loads a shared script stack (constants, DMC data, shared components, header,
modals, preferences, command palette) plus its own page-specific React app.

| Page | URL | Primary purpose | React app |
|---|---|---|---|
| **Pattern Creator** | `index.html` | Generate, design and edit a pattern | `creator-main.js` + `creator/bundle.js` |
| **Stitch Tracker** | `stitch.html` | Stitch a pattern, mark progress | `tracker-app.js` |
| **Stash Manager** | `manager.html` | Manage thread inventory & pattern library | `manager-app.js` |
| (sub-mode) Stats | `index.html?mode=stats` | Cross-project statistics | `stats-page.js` (lazy) |
| (legacy) Embroidery sandbox | `embroidery.html` | One-off image-processing playground | `embroidery.js` |

There is also a Home Screen (`home-screen.js` / `project-library.js`) that
mounts inside the Creator page when no project is loaded, and is also
embedded inside the Manager's Pattern Library tab via the shared
`ProjectLibrary` component.

---

## 2. Screen / view inventory

### 2.1 Home Screen (Creator page, no project loaded)

| View | Trigger | Contains |
|---|---|---|
| **Greeting + empty state** | First visit, no projects, no stash | "Good morning, stitcher" + drag-and-drop zone, Create blank, Browse, Import .oxs/.pdf/.json |
| **Hero card layout** (≤1 project) | Single project exists | Stats row (projects · skeins · % · stitched), Hero "Continue stitching" card, Recent rows, Showcase link |
| **Multi-project dashboard** (>1 project) | More than one project exists | Sticky Continue bar, Summary bar (active count · monthly stitches · streak), Suggestion card, Active project cards grid, Up-next list, Paused (collapsed), Completed (collapsed), My designs (collapsed), View detailed stats link |

### 2.2 Pattern Creator

The Creator runs in two **app modes** (`appMode` state):

- **Create mode** — pre-generation: source image / blank canvas, palette picker, generate button.
- **Edit mode** — post-generation: full toolbar, sub-tabs, multi-canvas preview.

A right-hand sidebar hosts five **sub-pages** (visible as a dropdown in the
header, or as tabs in the sidebar):

| Sub-page | File | Purpose |
|---|---|---|
| **Pattern** | `creator/PatternTab.js` | Interactive grid editing (the actual canvas) |
| **Project** | `creator/ProjectTab.js` | Metadata, difficulty/stitchability badges, time + cost estimates |
| **Materials** (`legend`) | `creator/LegendTab.js` | Thread legend + fabric calculator + clipboard export |
| **Prepare** | `creator/PrepareTab.js` | Shopping list + stash cross-reference |
| **Export** | `creator/ExportTab.js` | PDF/PNG export with quick presets and detailed settings |

In addition the Creator has these screens-within-a-screen:

- **Generate panel** (Create mode) — image preview + "Generate" CTA + parameters
  (palette size, dithering, edge enhancement).
- **ToolStrip** — editing tools (cross / half-fwd / half-bck / backstitch /
  erase / paint / fill / wand / eyedropper / lasso / partials / preview mode /
  zoom).
- **Magic Wand floating panel** — tolerance slider, selection ops,
  selection actions.
- **Split-pane preview** — second canvas (toggleable) with chart / symbol /
  realistic / realistic+grid renders.

### 2.3 Stitch Tracker

| View | Trigger | Contains |
|---|---|---|
| **Resume modal** | Open project | Last position, last colour, time-since indicator |
| **Stitch Style Wizard** | First visit | Block / cross-country / freestyle, block shape, start corner |
| **Tracking canvas** | Default | Pattern grid with marking overlay |
| **Highlight mode** | Click colour swatch | Single-colour focus, dim other cells, auto-advance toggle |
| **Edit mode** | Edit toggle | Single-cell colour swap, remove stitches, half-stitch toggles, parking markers |
| **Plan mode** | Plan toggle | Section grid (50×50 blocks) heat-map, royal-rows path |
| **Stats page** (per-project) | "Stats" tab | Sessions list, weekly bar chart, milestone badges, breadcrumb replay |
| **Session Config modal** | "Start session" | Time available + stitch goal |
| **Session Summary modal** | End session | Duration, stitches, speed, breadcrumb trail, save-note prompt |
| **Project Picker modal** | Header → switch project | List of saved projects with progress + last-update |

### 2.4 Stash Manager

| View | Tab | Contains |
|---|---|---|
| **Thread Stash** | tab 1 | Smart hub alerts (conflicts, low-stock-needed, low-stock-not-needed), Filter chips (All / To Buy / Owned / Low Stock / Remnants / Used Up), Brand toggle, Bulk Add button, Thread grid (2–4 cols), Thread Detail right drawer |
| **Pattern Library** | tab 2 | Filter bar (search + status chips + sort), Stats strip, Smart Hub "Ready to Start", `ProjectLibrary` cards (Creator/Tracker projects + manager-only patterns), Shopping list preview |
| **Showcase link** | tab 3 (in some configs) | Cross-project gallery (`stats-showcase.js`) |

Both tabs feed a right-hand drawer (`mgr-rpanel`) that mounts a thread or
pattern detail card.

### 2.5 Stats / Showcase / Insights

Dynamically loaded React surfaces:

- `stats-page.js` — global cross-project stats (sessions chart, streak, goal panel, achievements).
- `stats-activity.js` — calendar heatmap + recent activity log.
- `stats-insights.js` — pattern-level insights (cluster analysis, thread changes).
- `stats-showcase.js` — gallery view of finished and in-flight projects.

### 2.6 Global / cross-page surfaces

| Surface | File | Purpose |
|---|---|---|
| **Top header bar** | `header.js` | Logo, app-section tabs (Create / Edit / Track / Stash / Stats), sub-page dropdown, project badge, sync status, File menu, preferences, help |
| **Context bar** | `header.js` (`ContextBar`) | Below header on Creator/Tracker — name + dimensions + colour count + % + actions (Edit / Track / Download) |
| **Command Palette** | `command-palette.js` | Cmd/Ctrl+K — fuzzy search across ~40 actions |
| **Preferences modal** | `preferences-modal.js` | "Workbench" with 12 categories (Profile, Theme, Accent, Canvas, A11y, Export defaults, Designer branding, …) |
| **Help Centre** | `modals.js` + `help-content.js` | Tabbed reference content |
| **Shortcuts modal** | `modals.js` | Scope-organised keyboard reference |
| **Welcome Wizard** | `onboarding-wizard.js` | Per-page first-visit modal (cs_welcome_*_done flags) |
| **Onboarding Tour** | `onboarding.js` | Cross-page step-by-step tour (cs_onboarding_step) |
| **Toasts** | `toast.js` | `Toast.show({ message, type, duration, undoAction })` |
| **About modal** | `modals.js` | Version, tech stack, privacy note |
| **Sync summary / conflict** | `modals.js` + `sync-engine.js` | Folder-watch import preview |
| **Backup / restore** | `backup-restore.js` | Inline file picker + confirm dialog |

---

## 3. Navigation tree

```
┌─ Home Screen (in Creator page when no project)
│   ├─ "Continue" → Tracker (with project)
│   ├─ Project card → Tracker
│   ├─ "+ New" / drop image → Creator (Create mode)
│   ├─ Browse → Project Library
│   └─ Stats link → Stats page
│
├─ Top Header (always present)
│   ├─ Logo                → Home
│   ├─ Create tab          → Creator (Create mode)
│   ├─ Edit tab            → Creator (Edit mode, current project)
│   ├─ Track tab           → Tracker (current project)
│   ├─ Stash tab           → Manager
│   ├─ Stats tab           → Stats page
│   ├─ Sub-page dropdown   (Creator only) → Pattern / Project / Materials / Prepare / Export
│   ├─ Project badge       → rename inline
│   ├─ File menu           → New / Open / Save / Backup / Restore / Sync
│   ├─ Preferences gear    → Workbench modal
│   └─ Help (?)            → Help Centre
│
├─ Context Bar (Creator/Tracker, project loaded)
│   ├─ Project name (rename)
│   ├─ Edit Pattern (Tracker only) → Creator Edit
│   ├─ Track › (Creator only)      → Tracker
│   └─ Download (.json)
│
├─ Command Palette (global, Cmd/Ctrl+K)
│   └─ ~40 fuzzy-search actions
│
└─ Browser back/forward — partially supported via querystring (?mode=stats)
```

### Dead ends and circular paths

- The **Embroidery sandbox** (`embroidery.html`) has no link in or out — only
  reachable by typing the URL.
- The **Stats page** uses a query param (`?mode=stats`) but doesn't push a
  history entry, so the browser back button skips it.
- The **Showcase view** is reachable from the Home single-project layout
  ("✦ See your Showcase →") but **not** from the multi-project dashboard.
- The **Creator sub-page dropdown** is the only entry to Materials / Prepare /
  Export when sidebar tabs are collapsed; on narrow screens this is the
  single critical control.
- Pressing the **logo on the Tracker** uses `window.__goHome` if defined,
  otherwise falls back to `index.html` — this can lose unsaved tracking
  state if no warn-on-leave is registered.
- The **Preferences modal** can be opened from the header gear OR the
  command palette — there is no other entry, but two icons in the header
  area cause confusion (gear vs. File menu's "Settings").

---

## 4. Component inventory

### 4.1 Buttons (visual variants found across the codebase)

| Class family | Used in | Notes |
|---|---|---|
| `tb-btn`, `tb-btn--on/--green/--blue/--red` | Header & ToolStrip | Toolbar / dropdown buttons; padding 3px → ~22 px tall (below the 44 px touch guideline) |
| `tb-context-btn`, `--primary` | Context bar | Pill action buttons |
| `tb-app-tab`, `--active` | Header app nav | Underline-style tabs |
| `home-btn`, `--primary/--secondary` | Home screen | 7 px padding, larger feel |
| `mpd-btn`, `--primary/--ghost` | Multi-project dashboard | Card actions |
| `g-btn`, `g-btn primary` | Creator modals | "Generic" buttons, different palette |
| `emb-btn`, `--primary/--sm` | Embroidery sandbox | Independent system |
| `goal-set-btn`, `goal-preset-btn` | Stats goals panel | Yet another shape |
| Inline-styled buttons | Manager modals | Raw `<button style={...}>` re-implementations |

Twelve+ button styles, no shared primitive — see [ux-3-problems.md](ux-3-problems.md) E1.

### 4.2 Modals (3 architectural patterns)

1. **Simple overlay** — `.modal-overlay` + `.modal-content`. Used by
   `SharedModals.Help`, `.About`, `.Shortcuts`, `NamePromptModal`. Backdrop
   click + Esc close via `window.useEscape`.
2. **Boxed header** — `.modal-box` + `.modal-header` + `.modal-title` +
   `.modal-close`. Used by Creator modals (`BulkAddModal`,
   `ConvertPaletteModal`, `ShoppingListModal`, `SubstituteFromStashModal`).
3. **Inline-styled** — raw overlays with per-instance `style={{...}}`. Used
   throughout the Manager (Pattern modal, User Profile modal, Shopping List
   modal). Each duplicates layout primitives.

### 4.3 Toolbars & control strips

- **Header strip** (`header.js`) — global, persistent.
- **Context bar** (`header.js`) — appears under the header on Creator and
  Tracker when a project is loaded.
- **ToolStrip** (`creator/ToolStrip.js`) — Creator's main editing toolbar,
  responsive collapse to overflow `⋯` menu.
- **Magic Wand panel** (`creator/MagicWandPanel.js`) — floating tool panel.
- **Tracker action bar** (`tracker-app.js`) — fixed bottom bar on mobile
  with colour indicator, mark, undo.
- **Manager filter bar** — tabbed search + status chips + sort dropdown.
- **Stats sub-nav** — embedded tabs inside the stats page.

### 4.4 Panels & drawers

- Right sidebar (Creator) — sticky, accordion sections (Cleanup, Stash filter,
  QA seed, Conversion, Stash preview).
- Right drawer (Manager) — `mgr-rpanel`, slide-in detail panel.
- Bottom sheet (Tracker mobile) — `colour-quick-drawer`, swipeable.
- Floating popover — Wand panel; `StateChangeMenu` (project state); home
  screen state-menu (`mpd-state-menu`).

### 4.5 Cards

- `home-hero-card` — single-project hero.
- `home-stat-card` — number + label.
- `mpd-card` — full project card on the multi-project dashboard.
- `mpd-compact-row` — compact list row.
- Manager thread card and pattern card — separate styles, different from
  any of the above.

### 4.6 Data displays

- **Progress bars**: `home-hero-progress`, `mpd-card-progress`,
  `tb-context-pct`, plus a custom one in tracker-app, plus stats-page bars.
  At least 5 implementations.
- **Badges**: `mpd-card-badge`, `mgr-status-badge`, plus difficulty /
  stitchability badges in `ProjectTab`. Inconsistent shape and sizing.
- **Charts**: stats page bar / line / heat-map (3 separate render paths).

### 4.7 Inputs

- Native inputs styled via global `input` selectors plus per-component
  overrides — no shared `Field` component.
- Number steppers are custom in some places (Manager partial-skein gauge),
  native in others (preferences "min stock").

---

## 5. State / mode map

| Mode | Where it lives | Enter | Exit | Visible cue |
|---|---|---|---|---|
| **Home** | Creator page, no project | First load, "Home" logo click | Open or create project | Greeting + dashboard |
| **Create** | Creator | Header "Create" tab, drop image, blank canvas | Click "Generate" → switches to Edit, or back to Home | Sidebar shows palette+source only; ToolStrip shows Generate / overlay |
| **Edit** | Creator | After generation; header "Edit" tab; "Edit Pattern" from Tracker | Back to Home; Track ›; close project | ToolStrip full, sub-page dropdown enabled |
| **Track** | Tracker page | Header "Track" tab; "Track ›" from Creator; project card | Header tab change; back to Home | Tracker chrome, action bar |
| **Highlight** (sub-mode of Track) | Tracker | Click a colour swatch | Click again or Esc | Other colours dim, "Working on DMC 310" hint |
| **Edit (Tracker)** | Tracker | Edit toggle | Toggle off (warns if unsaved) | Edit-mode banner |
| **Plan** | Tracker | Plan toggle | Toggle off | Section heat-map overlay |
| **Stash** | Manager | Header "Stash" tab | Tab change | Tabs: Threads / Library |
| **Stats** | Anywhere | Header "Stats" tab; mpd link; per-project tab | Tab change | Stats page chrome |
| **Selection** (Creator) | Creator Pattern tab | Lasso / wand | Esc | Marching ants outline; Wand panel visible |
| **Generating** | Creator | "Generate" click | Worker callback | Spinner + progress text |
| **Exporting** | Creator | Export tab → "Export" | Worker done | Progress bar in Export tab |
| **Session active** (Tracker) | Tracker | Auto on first stitch, or "Start session" | Pause / inactivity / manual end | Session timer in toolbar |

### Mode-boundary clarity (key findings)

- The **Create vs. Edit** split is implicit. The header shows two separate
  tabs ("Create" and "Edit"), but they go to the same URL and the page
  decides which mode is appropriate. Returning users who clicked "Create"
  and already have a project loaded get put into Edit mode silently — fine
  in practice but surprising if they wanted to start over.
- The **Highlight** sub-mode in the Tracker is entered by clicking a
  swatch and exited by clicking the same swatch again or pressing Esc.
  The cue ("Working on DMC 310") sits in the action bar, easy to miss
  during stitching.
- **Edit mode in the Tracker** is destructive and is *not* visually distinct
  enough — only a small banner — so it is easy to accidentally remove
  stitches when meaning to mark them.
- **Selection** mode in the Creator: the Wand panel appears, but if the
  user switches to a different tool the selection is silently dropped
  (no "selection lost" toast).
- **Generating** and **Exporting** both lock the relevant area but do not
  fully disable navigation — switching tabs mid-generate cancels work.
