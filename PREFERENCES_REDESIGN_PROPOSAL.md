# Preferences Redesign Proposal

A consolidated proposal for expanding the Preferences area so it can absorb settings that currently clutter the Creator, Tracker and Manager surfaces.

Rendered mockups (open in a browser):

- [previews/preferences-proposal-1-tabbed.html](previews/preferences-proposal-1-tabbed.html) — **Sidebar Workbench**
- [previews/preferences-proposal-2-search.html](previews/preferences-proposal-2-search.html) — **Search‑First Command Centre**
- [previews/preferences-proposal-3-hub.html](previews/preferences-proposal-3-hub.html) — **Hub & Spokes**

---

## 1. Audit Summary

Two parallel passes over the codebase produced these findings.

### What already lives in Preferences (3 panels, 4 tabs)

| Panel | Notable settings |
|---|---|
| Your profile | designer name, logo + position, copyright, contact |
| PDF defaults | preset, page size, margins, stitches/page, custom rows·cols, BW/colour charts, overlap, cover/info/index/mini‑legend toggles |
| Preview defaults | preferred level, fabric colour, grid overlay, split‑pane |
| Tutorials | reset wizards (creator/manager/tracker), reset hint banner, list & clear per‑pattern view state, “reset all” |

### Hidden prefs that exist but are not exposed in any UI

`splitPaneRatio`, `splitPaneSyncEnabled`, `rightPaneMode`, `previewQualityAuto`, `coverageAutoSync`, `coverageManualValue`, `preferredMockupType`, `preferredHoopStyle`, `preferredFrameStyle`, `preferredMountColour`, `preferredMountWidth`.

### Candidates currently scattered across the app (selection of ~65 found)

Grouped by destination category. **M** = move entirely, **D** = duplicate (keep in‑context control + add a global default).

| Category | Candidate | Source location | M / D |
|---|---|---|---|
| Creator generation | Default palette size | Sidebar slider | D |
| Creator generation | Allow blends | Sidebar toggle | D |
| Creator generation | Stash‑only mode | Sidebar toggle | D |
| Creator generation | Dithering strength + smooth | Prepare tab | D |
| Creator generation | Orphan removal strength | Sidebar slider | D |
| Creator generation | Min stitches per colour | Sidebar slider | D |
| Creator generation | Stitch cleanup + protect details | Prepare tab | D |
| Creator generation | Default fabric count | Manager profile (and used by Creator) | M |
| Creator view | Grid overlay default | ToolStrip | D |
| Creator view | View mode (colour / symbol / both) | ToolStrip toggle | D |
| Creator view | Overlay image opacity | Canvas settings | M |
| Tracker behaviour | Stitching style (block / cross‑country / freestyle) | Onboarding + style picker | M |
| Tracker behaviour | Block shape, start corner | Style picker | M |
| Tracker behaviour | Half‑stitch handling | In‑session | D |
| Tracker behaviour | Parking markers default | In‑session | D |
| Tracker behaviour | Counting style | UI | D |
| Tracker behaviour | Completion celebrations (sound/animation) | Session summary | D |
| Tracker behaviour | Undo history depth | Hard‑coded 50 | M |
| Tracker behaviour | Auto‑sync stitches across devices | Sync engine | D |
| Manager defaults | Low‑stock threshold | Hard‑coded 1 skein | M |
| Manager defaults | Default thread brand | User profile | D |
| Manager defaults | Pattern sort order + default filter | Patterns tab dropdowns | M |
| Manager defaults | Strands used, waste factor | User profile | M |
| Data & storage | Backup download / restore | File menu | D |
| Data & storage | Clear per‑pattern view states | Tutorials panel ✓ already | – |
| Data & storage | Clear projects / stash IndexedDB | Not exposed | M |
| Data & storage | Export / import projects | File menu | D |
| Onboarding | Replay tour, show hints toggle | Help modal + Tutorials ✓ | M |
| Accessibility | Font size scale | Not exposed | M |
| Accessibility | High contrast | Not exposed | M |
| Accessibility | Reduced motion override | Not exposed | M |
| Accessibility | Colour‑blind palette aid | Not exposed | M |
| Accessibility | Symbol‑only chart default | Creator view toggle | D |
| Accessibility | Dark mode override | Currently OS‑driven only | M |
| Notifications | Toast master switch + queue size | Hard‑coded | M |
| Notifications | Milestone toasts | Auto | D |
| Notifications | Sound / haptics | Not exposed | M |
| Notifications | Low‑stock alert threshold | Manager hard‑coded | M |
| Regional | Currency (GBP/USD/EUR) | Hard‑coded £ | M |
| Regional | Thread length unit (in/cm) | Hard‑coded 315 in | M |
| Regional | Default skein price | Hard‑coded £0.95 | M |
| Theme | App accent colour | Hard‑coded teal | M |
| Keyboard | Customise shortcuts, undo depth | Not exposed | M |
| Cache & runtime | Force reload / clear cache, SW status | Not exposed | M |
| Privacy | Analytics, crash reports, cloud‑sync opt‑in | Not implemented | M |
| Experimental | Realistic preview default, breadcrumb trail, variation gallery | Per‑page toggles | D |

### Proposed canonical category set

1. **Profile & branding** — designer name, logo, copyright, contact, accent colour
2. **Pattern Creator** — generation defaults (palette size, dithering, blends, cleanup, orphan removal, default fabric count, stash‑only)
3. **Stitch Tracker** — stitching style, block shape, start corner, half‑stitch handling, parking markers, undo depth, completion celebrations
4. **Stash Manager** — default brand, low‑stock threshold, strands, waste factor, pattern sort + filter defaults, skein price
5. **Preview & display** — preview level, fabric colour, mockup type / hoop / frame / mount, split‑pane, grid overlay, view mode default
6. **PDF export** — preset, page size, margins, stitches/page, BW + colour, overlap, cover/info/index/mini‑legend, chart style, legend layout, grid interval, centre marks, progress overlay, separate backstitches
7. **Accessibility** — font scale, high contrast, reduced motion, colour‑blind palette, symbol‑only mode, dark mode override
8. **Notifications** — toast master, milestones, sounds, haptics, low‑stock alerts
9. **Regional & units** — currency, thread length unit, skein price
10. **Sync, backup & data** — auto‑sync, backup, restore, export/import, clear per‑pattern state, clear IndexedDB (projects / stash)
11. **Onboarding & help** — replay tours, hint visibility, dismiss reminders
12. **Advanced** — keyboard shortcuts, cache controls, service‑worker info, experimental flags, privacy/telemetry, factory reset

---

## 2. Three structural proposals

All three reuse the existing teal accent (`#0d9488`) and slate text palette so they slot into the current modal style with no rework.

### Proposal A — **Sidebar Workbench** (vertical category nav)

A wide modal (max 1100×720) with a left‑hand list of the 12 categories and a scrolling right pane. Each category groups settings into clearly titled sub‑sections. Mirrors macOS System Settings / VS Code Settings.

- **Strengths** — predictable, scales to dozens of categories, fast to navigate when you know where something lives, good keyboard arrowing.
- **Trade‑offs** — heavy on screen real‑estate (poorer on small laptops / tablet), category density makes the surface feel "settings‑y" rather than friendly.
- **Best for** — power users; mirrors how the Creator’s own sidebar already works, so it feels native to the existing app.

Render: [previews/preferences-proposal-1-tabbed.html](previews/preferences-proposal-1-tabbed.html)

### Proposal B — **Search‑First Command Centre** (one long page + sticky filter)

A single scrolling document (max 760 wide) with a sticky top bar containing a prominent search box, category chips and "Reset" / "Done" actions. Everything is on screen — the user filters by typing or jumps via the chip rail. Mirrors iOS Settings search and 1Password preferences.

- **Strengths** — discoverability is the highest of the three; users do not need to know which tab a setting lives in. Works well on narrow / mobile screens. Encourages cross‑category browsing.
- **Trade‑offs** — long page can feel overwhelming on first visit; visual hierarchy depends entirely on section headers; deep category content can scroll past the chip rail.
- **Best for** — apps where users only visit Preferences occasionally and don't memorise locations. Good fit for a PWA used across desktop + mobile.

Render: [previews/preferences-proposal-2-search.html](previews/preferences-proposal-2-search.html)

### Proposal C — **Hub & Spokes** (landing grid → focused detail)

The modal opens on a tile grid: each category is a card with an icon, one‑line description and a “3 changed” badge. Clicking a tile slides into a focused single‑category screen with a back button. Mirrors GitHub Settings landing or Notion Settings & Members.

- **Strengths** — calmest first impression, easiest to onboard new users, badge slots show what's been customised, leaves room for marketing copy or "what's new" tiles.
- **Trade‑offs** — extra click to reach any setting; back‑and‑forth between categories is slower; harder to skim a single screen for related settings (e.g. Tracker + Manager defaults at once).
- **Best for** — a brand‑forward Preferences experience that feels closer to a "Settings home" than a config dialog.

Render: [previews/preferences-proposal-3-hub.html](previews/preferences-proposal-3-hub.html)

---

## 3. Recommendation

If we were to pick one to implement, my recommendation is **B (Search‑First Command Centre)**:

- Search is the single biggest UX win when category count grows from 4 → 12.
- It works equally well on desktop and the PWA installed on mobile.
- It does not preclude grouping — chips + section headers still give the structure of A.
- The minimum viable migration is small: re‑skin the current modal as a single scrolling page, add a search input, then incrementally append new sections without redesigning navigation each time.

A pragmatic hybrid is also possible — adopt B's search and chip rail at the top, but render section bodies in a two‑column layout closer to A on wide screens.
