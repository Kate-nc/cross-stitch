# UX Audit · 3 · Problems by Category

> Phase 1 / Step 3 — every issue surfaced from the journeys, screen
> inventory, and visual audit, organised by category and rated.
> IDs are quoted from later proposals.

Severity legend: **🔴 major** (blocks or confuses users regularly) ·
**🟡 moderate** (causes friction; users work around) ·
**🟢 minor** (polish, low impact).

---

## A. Information architecture

| ID | Issue | Severity | Evidence |
|---|---|---|---|
| **A1** | **Two parallel navigations in the header** — app-section tabs (Create / Edit / Track / Stash / Stats) AND a sub-page dropdown (Pattern / Project / Materials / Prepare / Export). Their relationship isn't visually obvious; the dropdown only applies to Creator/Editor and is hidden elsewhere. | 🔴 | [ux-1-app-map.md](ux-1-app-map.md) §3, F-X.1 |
| **A2** | **Three separate ways to open a project** (Home cards, command palette "Recent projects", `ProjectComparison` modal in [components.js](components.js)) with subtly different loading paths. | 🟡 | [ux-1-app-map.md](ux-1-app-map.md) §4 |
| **A3** | **Project lifecycle split between two pages**: state-change menu lives on Home; permanent delete + tags + designer/description edit live in Manager Pattern Library. | 🟡 | F-5.2 / F-5.3 |
| **A4** | **Sub-page tabs are duplicated** — same tabs (Pattern, Project, Materials, Prepare, Export) appear both as a header dropdown *and* as the right-sidebar tab strip. Which is canonical? | 🟡 | F-2.6, [creator/Sidebar.js] |
| **A5** | **Stash filter / stash substitution / "Add all to stash" / shopping list** are spread across four locations (Sidebar accordion, Palette chips, Legend tab, Prepare tab). Each is a different angle on the same idea but they don't reference each other. | 🟡 | F-3.4 |
| **A6** | **Stats has three doors**: header tab, multi-project dashboard link, single-project Showcase link — and the link only appears in the single-project home layout. | 🟢 | [ux-1-app-map.md](ux-1-app-map.md) §3 |
| **A7** | **Embroidery sandbox** (`embroidery.html`) is reachable only by typing the URL; it's effectively orphaned but still ships. | 🟢 | [ux-1-app-map.md](ux-1-app-map.md) §1 |
| **A8** | **Preferences modal has 12 categories** in a Workbench but no search and no obvious grouping into "essential" vs "advanced". Cognitive load on first visit is high. | 🟡 | [preferences-modal.js], [PREFERENCES_REDESIGN_PROPOSAL.md] |

## B. Visual hierarchy and clarity

| ID | Issue | Severity | Evidence |
|---|---|---|---|
| **B1** | **Toolbar competes with canvas.** ToolStrip + Header + ContextBar + Sidebar consume ~40% of viewport width on tablet at 1024px. The canvas — the primary content — gets the leftover. | 🔴 | [creator/ToolStrip.js], styles.css responsive media queries |
| **B2** | **Primary vs. secondary actions blur.** "Generate", "Save", "Export" and "Track ›" all use the same green/teal pill. Users can't immediately tell what's the next step. | 🟡 | header.js ContextBar, ToolStrip Generate button |
| **B3** | **UI accent (teal) overlaps with thread colour space.** Teal/cyan DMC threads (e.g., 597–600) read as "active state" or "selection" because the same hue is used for selection rings, focus, and progress. | 🟡 | styles.css token `--accent: #0d9488`; F-X.7 |
| **B4** | **Progress fills look like swatches.** Card progress bars use the accent colour as a solid fill block; on a small thumbnail that block can be confused with a thread sample. | 🟢 | mpd-card-progress |
| **B5** | **Twelve+ button styles** with no shared primitive — buttons in modals, toolbar, header and dashboards all have different padding/weight, so users can't predict size from style. | 🟡 | styles.css; multi-system audit |
| **B6** | **No clear "you are here" cue across header + sub-page** — both the active app tab AND the active sub-page button highlight, but with different active treatments (underline vs. teal pill). | 🟢 | header.js |
| **B7** | **Difficulty / stitchability badges** in the Project tab use 5 levels and emojis (Excellent → High confetti) — emoji-coded levels conflict with the no-emoji rule and don't read clearly. | 🟢 | creator/ProjectTab.js |
| **B8** | **Persistent "Auto-saved" hint** flashes briefly. There is no equivalent to "All changes saved 2s ago" that lingers. | 🟡 | F-X.3 |

## C. Workflow efficiency

| ID | Issue | Severity | Evidence |
|---|---|---|---|
| **C1** | **No "click anywhere to start" empty-canvas hint.** New users open a blank Creator and clicking does nothing because no thread is selected. | 🔴 | F-1.6 |
| **C2** | **Export = visit two sub-pages** to ship a pattern + thread list. No bundled export. | 🟡 | F-6.1 |
| **C3** | **No bulk operations on Home dashboard or Manager pattern library.** Archiving 3 finished projects is 3 individual menu opens. | 🟡 | F-5.4 |
| **C4** | **No project search.** Once you have ≥ 6 projects, finding one means scroll + expand sections. | 🟡 | F-5.1 |
| **C5** | **Cleanup operation is destructive and not undoable.** Slider-based orphan removal cannot be reverted via Ctrl+Z. | 🟡 | creator/Sidebar.js Cleanup section |
| **C6** | **Split-pane preview only via `\` shortcut.** No toolbar button. New designers never discover real-time chart-vs-realistic compare. | 🔴 | F-2.4 |
| **C7** | **No drag-to-mark on touch tracker.** Marking a row of 12 cells is 12 individual taps. | 🟡 | F-4.2 |
| **C8** | **No primitive shape tools** (line, rect, circle, ellipse) for designers. Power-stitchers expect them. | 🟡 | F-2.3 |
| **C9** | **First save asks for a name immediately.** Disrupts flow; could autosave with a smart default ("Untitled · 2026-04-24") and let user rename later. | 🟢 | NamePromptModal |
| **C10** | **Long operations (generate, export) lock the area but don't disable nav.** Switching tabs mid-generate cancels the worker silently. | 🟡 | [ux-1-app-map.md](ux-1-app-map.md) §5 |

## D. Feedback and system status

| ID | Issue | Severity | Evidence |
|---|---|---|---|
| **D1** | **Session active state is invisible** in tracker chrome. The session timer hides into a corner; new users don't realise they're being tracked. | 🟡 | tracker-app.js |
| **D2** | **Resume modal lacks a "what you did last time" recap.** Only "where" you left off, not what was achieved. | 🔴 | F-4.5 |
| **D3** | **Cleanup warning is advisory only** — no preview of what will be removed before commit. | 🟡 | F-2.5 |
| **D4** | **Generate has no ETA**, just a spinner. On phones for big images this feels broken. | 🟡 | F-3.1 |
| **D5** | **Edit-mode-in-Tracker is too subtle.** A small banner is the only cue that taps will *delete* stitches rather than mark them. | 🔴 | tracker-app.js Edit toggle |
| **D6** | **Selection lost when switching tools** with no toast or undo affordance. | 🟡 | creator/MagicWand workflow |
| **D7** | **Progress is percent-only on mobile.** The progress bar in the immersive header doesn't *show the pattern filling in* — that's the most motivating visualisation and we use a thin bar. | 🟡 | tracker-app.js mobile chrome |
| **D8** | **"Limit to stash" toggle hides chips but doesn't recolour the pattern.** The pattern still uses unowned threads — a silent dishonesty. | 🔴 | F-3.2 |
| **D9** | **Save status not persistent.** "Auto-saved" appears for ~1.5s then disappears; no confidence indicator afterward. | 🟡 | F-X.3 |

## E. Consistency and predictability

| ID | Issue | Severity | Evidence |
|---|---|---|---|
| **E1** | **12+ button visual variants** across the app with no shared primitive — `tb-btn`, `home-btn`, `mpd-btn`, `g-btn`, `emb-btn`, `goal-btn`, inline-styled, etc. | 🟡 | shared-UI audit |
| **E2** | **3 modal architectures** (overlay+content, boxed-header, inline-styled). Close affordances vary (× top-right vs. "Close" button vs. both). | 🟡 | shared-UI audit |
| **E3** | **5+ progress bar implementations** with subtly different heights, colours, and label positions. | 🟢 | shared-UI audit |
| **E4** | **5 responsive breakpoints used inconsistently** (399, 480, 599, 600, 899, 1024 px). | 🟢 | styles.css |
| **E5** | **Two onboarding systems** (`onboarding.js` cross-page tour and `onboarding-wizard.js` per-page wizard) can both fire on first visit. | 🟡 | shared-UI audit; F-1.1 |
| **E6** | **Emoji used in user-facing strings against the no-emoji house rule** — 12 violations across `command-palette.js`, `embroidery.js`, `help-content.js`, plus 🔥 streak / 💡 suggestion / 📊 stats / ✦ showcase in `home-screen.js`. | 🟡 | shared-UI audit |
| **E7** | **Ctrl+Z works in Creator but not for cleanup** — breaks the user's expectation that undo is universal. | 🟡 | C5 |
| **E8** | **Right-click context menu** exists on Creator canvas but not on tracker canvas — same surface, different conventions. | 🟢 | creator/PatternCanvas.js, tracker-app.js |
| **E9** | **Project name editing** is in two places: Header project badge (pencil) AND ContextBar name (also editable), with overlapping behaviour. Edits to one update the other but the duplication confuses. | 🟢 | header.js `Header` + `ContextBar` |
| **E10** | **Stats appears as both a "tab" (Stats global)** and a per-project Stats sub-route in the tracker. Same word, different scope. | 🟢 | [ux-1-app-map.md](ux-1-app-map.md) §3 |

## F. Onboarding and learnability

| ID | Issue | Severity | Evidence |
|---|---|---|---|
| **F1** | **No first-stitch coaching.** Welcome wizard talks *about* features instead of *guiding* the first action. Compare with figma/canva-style "click here to add your first colour" overlays. | 🔴 | F-1.5, F-1.6 |
| **F2** | **No sample pattern.** `starter-kits.js` has data but the home screen offers no "open a sample pattern to learn the tracker" path. | 🟡 | F-1.3 |
| **F3** | **Hidden power features:** split-pane preview (`\`), command palette (Ctrl+K), long-press range-select on tracker, parking markers, magic wand selection ops, royal-rows planning — all undiscoverable without reading docs. | 🟡 | F-2.4, F-4.2 |
| **F4** | **Wizard for stitch-style runs every fresh device** — no per-account memory; user re-onboards on every tablet. | 🟢 | F-4.1 |
| **F5** | **Help Centre and Shortcuts are separate modals**, both opened from "?" — users have to know which to pick. | 🟢 | F-X.9 |
| **F6** | **No tooltip or coachmark on the Continue bar** explaining the suggestion algorithm. | 🟢 | home-screen.js |
| **F7** | **Welcome wizard's "skip" defaults to "Take the tour"** — phrasing is unclear about what tour and how long. | 🟢 | onboarding-wizard.js |

## G. Responsive and multi-device

| ID | Issue | Severity | Evidence |
|---|---|---|---|
| **G1** | **Touch targets in header are ~22 px tall.** App-section tabs and sub-page dropdown are below the 44 px guideline; users tapping with one hand on a propped tablet routinely mis-tap. | 🔴 | F-X.5; styles.css padding 3-4 px |
| **G2** | **Creator toolbar collapses tools into a `⋯` overflow menu on tablets.** Discoverability collapses too. | 🔴 | F-X.10 |
| **G3** | **Pinch-zoom on tracker canvas works**, but the *immersive scroll* heuristic conflicts with two-finger gestures — bringing the toolbar back can be tricky. | 🟡 | F-4.7 |
| **G4** | **Tracker undo on mobile** is a small icon in the action bar — not labelled, easy to miss. The desktop FAB is hidden on mobile. | 🟡 | F-4.3 |
| **G5** | **Manager right-drawer covers the grid** when open on phones. Comparing two threads requires open-close-open. | 🟡 | manager-app.js right-panel pattern |
| **G6** | **Modals are not full-screen on phones**, leaving a tiny scrollable card and a non-tappable backdrop strip. | 🟡 | shared modals on narrow widths |
| **G7** | **Form inputs lack mobile hints** in many places (no `inputMode="numeric"`, no `enterKeyHint`); fixed in a few hot spots already, still patchy. | 🟢 | repo memory note about mobile form conventions |
| **G8** | **Drop-zone is hidden behind the dashboard** when projects exist. There's no in-page "import another image" affordance on Home. | 🟢 | home-screen.js HomeScreen function |

---

## Priority heat map

```
                     A  B  C  D  E  F  G       Total
                    ─────────────────────────
🔴  major            1  1  3  3  0  1  2        11
🟡  moderate         5  4  6  6  6  3  4        34
🟢  minor            2  3  1  0  4  3  2        15
                    ─────────────────────────
                     8  8 10  9 10  7  8        60
```

**Top 11 🔴 issues** (must-fix candidates for any redesign):

1. **A1** — two parallel navigations in the header.
2. **B1** — toolbar competes with canvas.
3. **C1** — no first-stitch coaching / silent click failure.
4. **C6** — split-pane preview hidden behind a shortcut.
5. **D2** — resume modal has no "what you did last time" recap.
6. **D5** — edit-mode-in-tracker too subtle (destructive action).
7. **D8** — "Limit to stash" toggle dishonest about palette state.
8. **F1** — onboarding talks instead of guiding.
9. **G1** — header touch targets below 44 px.
10. **G2** — Creator toolbar collapses tools into hidden overflow.
11. **F-X.10 / G2** — Creator is implicitly desktop-only.

**Top 6 🟡 issues with high leverage** (one fix dissolves several):

- **A4 + A5** — collapse Materials / Prepare / Export sub-pages and the
  scattered stash actions into a single coherent surface.
- **D7 + B4** — replace mobile percent-bar with a "fill-in" preview that
  also serves as the home thumbnail.
- **C3 + C4** — add multi-select + search to the dashboard.
- **E1 + E2** — adopt one Button and one Modal primitive.
- **G6 + G7** — modal full-screen on narrow + universal mobile-input
  hygiene helper.
- **F2 + F1** — sample pattern + interactive coachmark = onboarding.
