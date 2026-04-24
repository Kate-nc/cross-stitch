# Cross Stitch — Phases A & B User Walkthrough

A guided tour of every change shipped in **Quarter 1 (Proposal A, A1–A7)** and
**Quarter 2 (Proposal B, B1–B6)** on the `ui-improvements` branch.

> Set-up: pull `ui-improvements`, run `node serve.js`, then open
> <http://localhost:8000>. The walkthrough is written so you can follow it
> top-to-bottom in one sitting; each step lists the exact button, page, and
> what to look for.

---

## Quick map

| Phase | Ticket | Headline change | Page |
|---|---|---|---|
| A | A1 | Honest "limit to stash" warning + Substitute / Add-to-shopping CTAs | Creator → Pattern sidebar |
| A | A2 | Bold red **Edit mode** banner + "Mark"→"Modify" relabel | Tracker |
| A | A3 | "Welcome back" resume modal with last-session recap | Tracker |
| A | A4 | 44 × 44 touch targets across header, toolbars, action bars | All pages, mobile |
| A | A5 | Project picker with cover thumbnail, progress bar, last-stitched | Tracker / Home |
| A | A6 | Stash search + brand filter + low-stock chip | Manager |
| A | A7 | Honest copy pass — no fake percentages or "AI-powered" claims | Throughout |
| B | B1 | Partial-stitch dashboard thumbnails (real progress overlay) | Home dashboard |
| B | B2 | Drag-mark stitching (one-finger sweep) — **flag-gated** | Tracker |
| B | B3 | Creator sub-pages collapsed 5 → 3; mode-aware sidebar | Creator |
| B | B4 | New Materials & Output hub + Manager **Shopping** tab | Creator + Manager |
| B | B5 | Multi-select on the dashboard (bulk archive, bulk delete) | Home dashboard |
| B | B6 | Unified Help drawer (replaces three help systems) | Press `?` anywhere |

---

# Phase A — Quarter 1

## A1 · Honest "limit to stash" warning

**Where:** Creator → Pattern page → right-rail Sidebar → "Limit to stash" toggle.

1. Open any pattern in the Creator.
2. In the right sidebar, switch on **Limit to stash**.
3. If your pattern uses any threads you don't own, a yellow warning panel now
   appears with the **Icons.warning** glyph saying:
   > "N threads in this pattern aren't in your stash. The filter only hides
   > swatches — it doesn't change the pattern."
4. The panel shows two buttons:
   - **Substitute from stash** — opens the existing substitution modal,
     pre-filled with the unowned set. **No re-quantise** is triggered.
   - **Add to shopping list** — flips the `tobuy` flag on every unowned
     thread in one IndexedDB transaction and toasts you the count actually
     added (duplicates skipped).
5. Toggle the filter back off — the panel disappears. The "X colours hidden"
   subtitle that used to lie about the filter's behaviour is gone.

> Why: closes audit issue **D8 🔴** (silent stash filter). The user always
> sees the truth and is given two ways to act on it.

---

## A2 · Bold edit-mode banner + "Modify" relabel

**Where:** Tracker → toolbar.

1. Open any project in the Tracker.
2. Tap **Edit pattern** (the pencil icon) to enter edit mode.
3. A **40 px red strip** appears directly above the toolbar with:
   - the warning icon,
   - the copy "**Edit mode** — grid taps modify the pattern, not your
     progress",
   - a prominent **Exit edit mode** button.
4. The toolbar row picks up a subtle red tint and the primary action button
   relabels from **Mark** (green) to **Modify** (red). Tooltip becomes
   "Modify stitches (T)".
5. Press **Exit edit mode** — if you have unapplied edits, the existing
   confirm-exit modal appears; otherwise you go straight back to normal
   mode in one tap.
6. Resize to a phone width: the explanatory hint collapses but the Exit
   button stays reachable without horizontal scroll.

> Why: closes **D5 🔴** (silent edit-mode mishit). It's now impossible to
> accidentally edit the pattern thinking you're tracking progress.

---

## A3 · Tracker resume modal with last-session recap

**Where:** Tracker, on opening any project that has at least one prior session.

1. Stitch on a project for a minute or two so a session is recorded.
2. Go back to the Home dashboard.
3. Reopen the project.
4. A modal appears: **"Welcome back to {project name}"** with:
   - "Last stitched N days ago" subhead.
   - Overall progress bar (% done / total stitches).
   - Three stat cards: stitches in last session, stitch time (m), stitches
     per hour.
   - Optional pace note ("X / hr faster than your average") that **only**
     shows when you have ≥ 3 prior sessions and the delta is ≥ 5 / hr.
   - Footer: **Switch project** • **Stats** • **Continue stitching**
     (autofocused).
5. The modal is keyboard-accessible (`role=dialog`, `aria-modal`,
   `aria-labelledby`) and below 480 px becomes full-screen with stacked
   buttons.

> Why: addresses **D2** (no resume context) and **F-4.5** (no pace context)
> without inventing data — block / row / column from the wireframe was
> deferred because the schema doesn't yet store per-cell session attribution,
> noted honestly in the implementation log.

---

## A4 · 44 × 44 touch targets

**Where:** Every page, on mobile.

1. Open Devtools → Device toolbar → iPhone SE (375 px) or similar.
2. Visit each of Creator, Tracker, Manager.
3. Every button in the header, toolbar strip, edit-mode strip, action bar,
   modal footers, and the dashboard cards now has a **minimum 44 × 44 px hit
   area** — verify by long-pressing or by Devtools' "Inspect → Box model".
4. Where icons are visually small, padding pushes the hit-area to 44 px;
   inline links inside body copy keep their text-size hit-area but get
   `min-height: 44px` on the surrounding wrapper.

> Why: WCAG 2.5.5 target size and a recurring complaint in the audit.

---

## A5 · Project picker with cover thumbnail, progress, last-stitched

**Where:** Home dashboard → "Continue stitching" / project list cards.

1. Open the Home page (the landing screen of `stitch.html` or via the
   header's home button).
2. Each project card now shows:
   - **Cover thumbnail** (96 px) — the rendered pattern preview from saved
     project meta.
   - **Project name + fabric size** (e.g. "Forest fox · 80 × 80, 14 ct").
   - **Progress bar** (real % done from `done[]` over `pattern.length`).
   - **Last stitched** — relative time ("Stitched 2 days ago" / "Started
     today").
3. Cards are sortable: **Last stitched** (default), **Name**,
   **% complete**, **Created**.
4. Tap any card to jump straight into the Tracker on that project.

> Why: replaces the bare list-of-names picker. Resumes the right project
> immediately and shows progress at a glance.

---

## A6 · Stash search + brand filter + low-stock chip

**Where:** Manager → Threads tab.

1. Open the Manager (`manager.html`) and switch to **Threads**.
2. New top toolbar:
   - **Search box** (`enterKeyHint="search"`) — searches DMC ID, name,
     and brand simultaneously.
   - **Brand filter** dropdown (DMC, Anchor, Madeira, …).
   - **Low stock** chip — single tap to show only threads with skeins
     below your "low" threshold (default 1 skein). Live count in the chip
     label.
3. Filter combinations are AND-ed; clearing the search box restores the
   previous brand + chip state.
4. The empty state changes copy depending on the active filter — e.g.
   "No DMC threads match 'forest'" rather than a generic "Nothing here".

> Why: stash management becomes findable; you can answer "what am I about
> to run out of?" in one click.

---

## A7 · Honest copy pass

**Where:** Throughout — easiest to spot in Creator and onboarding.

1. Open Creator → Project tab. The old "AI-powered colour reduction"
   tagline is now **"Colour reduction (k-means quantisation)"**.
2. Open the Welcome wizard (Help → Show welcome wizard if available).
   The "97% accuracy" badge is gone; copy now says what the algorithm
   actually does without manufactured percentages.
3. Stash filter, palette swap, dithering controls — all relabelled to
   describe their actual behaviour rather than marketing claims.
4. Toast messages for export: previously "Exported successfully!" with
   no detail; now "PDF saved (12 pages, 1.4 MB)" with the actual figures.

> Why: closes **F-7.x** copy issues. The app should never tell the user
> something it didn't do.

---

# Phase B — Quarter 2

## B1 · Partial-stitch dashboard thumbnails

**Where:** Home dashboard.

1. Stitch a few rows of any project.
2. Return to the Home page.
3. The project card's cover thumbnail is no longer the *original* pattern
   preview — it's a **live composite** of the original pattern with your
   completed stitches highlighted (and incomplete cells dimmed).
4. The thumb is rendered by the new `<window.PartialStitchThumb>`
   component, cached per `(projectId, doneHash)` so subsequent renders are
   instant.
5. Inspect performance: thumbnails render in the main thread for projects
   ≤ 200 × 200; a perf flag (`window.PERF_FLAGS.partialThumbWorker`) is
   reserved for a future Web Worker offload if larger projects warrant it
   (the gate wasn't hit during testing).

> Why: at-a-glance progress without opening the project.

---

## B2 · Drag-mark stitching — **flag-gated**

**Where:** Tracker → main stitching grid. **Currently disabled by default.**

1. Open the JS console on the Tracker page and run:
   ```js
   window.B2_DRAG_MARK_ENABLED = true; location.reload();
   ```
2. With the flag on, you can press-and-drag across the grid to mark a
   continuous run of stitches in one motion (instead of tapping each
   cell). Works with mouse, touch, and pen via Pointer Events.
3. The drag respects edit mode: in edit mode it paints colours; in normal
   mode it marks stitches done.
4. Lifting the pointer commits the run as a single undoable action.

> Why it's flag-gated: the legacy touch handlers in `tracker-app.js` still
> exist and would fight the new pointer pipeline. Shipping behind a flag
> lets us validate the new path without ripping out thousands of lines in
> the same PR. A coordination PR will flip the default later.

---

## B3 · Creator sub-pages collapsed 5 → 3; mode-aware sidebar

**Where:** Creator.

1. Open the Creator. The page selector (top toolbar) now shows **three**
   pages instead of five:
   - **Pattern**
   - **Project**
   - **Materials & Output**
2. The legacy `Prepare` / `Legend` / `Export` pages have been folded into
   Materials & Output (see B4 below). If you had `creator.lastPage` set to
   one of the old IDs, you're auto-redirected to `materials` with the
   matching sub-tab pre-selected.
3. The right-rail **Sidebar is now mode-aware** within the Creator:
   - On **Pattern**: the rich palette/paint sidebar (unchanged).
   - On **Project**: a compact "Project at a glance" panel.
   - On **Materials & Output**: the sidebar is hidden so the hub takes
     full content width.
4. Switching between the three pages uses a **160 ms opacity fade** so the
   sidebar swap is perceptible, not jarring.

> See `reports/b3-consolidation-map.md` for the exact before/after table
> and rationale per moved section.

---

## B4 · Materials & Output hub + Manager Shopping tab

### Materials & Output hub (Creator)

**Where:** Creator → Materials & Output.

1. Open the new **Materials & Output** page.
2. A row of **side-tabs** runs across the top:
   - **Threads** — the old Legend tab content (full thread list with
     swatches, DMC IDs, stash status dots).
   - **Stash status** — the old Prepare tab's stash-related controls
     (limit-to-stash, substitute, ownership view).
   - **Shopping** — a project-scoped aggregate: which threads in *this*
     pattern are unowned, with an "Add all to shopping list" CTA that
     routes through `StashBridge.markManyToBuy`.
   - **Output** — the old Export tab content (PDF, PNG, OXS, JSON).
3. Active sub-tab is persisted in `UserPrefs` under `creator.materialsTab`
   so it restores on reload.

### Manager Shopping tab

**Where:** Manager → top tab strip → **Shopping** (new).

1. Open the Manager. There's a new top-level tab between Pattern Library
   and Threads: **Shopping**.
2. The Shopping page aggregates required threads across all your *active*
   projects (states `active` / `queued`):
   - Iterates `ProjectStorage.listProjects()`.
   - For each, computes skeins via the existing `skeinEst()` helper.
   - Aggregates by composite key (`dmc:310`, `anchor:403`).
   - Compares against the stash via `StashBridge`.
3. Each row shows: thread chip, name, brand, **total skeins needed**
   across N projects, **currently owned**, **deficit**.
4. Sorted by **deficit descending** so the biggest gaps are at the top.
5. Each row has an **Add** toggle; the page header has a bulk **Add all
   deficits** CTA.
6. Empty states:
   - "All your active projects have the threads they need." — when there
     are no deficits.
   - "No active projects yet." — when nothing is in `active` / `queued`.

> ZIP-bundle export (PDF + thread list + stash-add JSON) is **deferred** —
> documented in `reports/b3b4-complete.md`. It would need a CDN dependency
> or a from-scratch DEFLATE implementation, both larger pieces of work
> than the rest of this epic combined.

---

## B5 · Multi-select on the dashboard

**Where:** Home dashboard.

1. Long-press any project card (or click the new selection checkbox in
   the card's top-right corner).
2. The dashboard enters **selection mode**:
   - The "Continue stitching" hero bar is hidden.
   - Each card grows a checkbox; tap any other card to toggle it.
   - The header replaces with a count and a bulk-action bar:
     **Archive selected** • **Delete selected** • **Bulk export**.
3. **Archive** and **Delete** operate on every selected project in one
   transaction with an undo toast.
4. **Bulk export** currently shows a **"Bulk export coming in B4"** toast
   placeholder — when ZIP bundling lands (see deferral above) this will
   produce a single archive of every selection's PDF + thread list.
5. Cancel selection by tapping the X in the bulk bar or by deselecting
   the last card.
6. The "Move to category" button is intentionally hidden — there's no
   category infrastructure yet, so the affordance would be dishonest.

> Note: B5 reuses the B1 `<PartialStitchThumb>` component so each card's
> live progress thumbnail still renders in selection mode.

---

## B6 · Unified Help drawer

**Where:** Press `?` on any page (or open the help icon in the header).

1. Press the `?` key anywhere in the app — Creator, Tracker, or Manager.
2. A right-side **Help drawer** slides in (340 ms ease-out). It replaces:
   - the old `onboarding.js` help system (deleted),
   - the `help-content.js` static page (deleted),
   - the per-page modal-based help that lived inside `SharedModals.Help`.
3. The drawer is **page-aware**: it loads the help content relevant to the
   page you opened it from. The Tracker's help drawer does not show you
   Creator-only shortcuts and vice versa.
4. Search box at the top filters the topics live; ESC or clicking the
   backdrop closes the drawer.
5. Content is pure Markdown rendered with the existing renderer — easy
   to add new sections without touching the drawer plumbing.
6. The keyboard shortcut dispatcher (`shortcuts.js`) is unchanged; the
   drawer simply *renders* the same shortcut list.

> Why: closes **F3 🔴** (three competing help systems). Now there's one,
> and the only remaining onboarding affordance is the deliberate
> first-launch `WelcomeWizard` in `onboarding-wizard.js`.

> **Known limitation:** there's no American → British alias mapping in
> the search index, so a user typing "color" won't match "colour"
> entries. Logged for a future polish PR.

---

# How to verify the lot in one sitting

1. Pull `ui-improvements` and run `npm install` if you haven't.
2. `npm test -- --runInBand` — should report **902 passing across 79 suites**.
3. `node serve.js` and open <http://localhost:8000>.
4. Walk the table at the top in order: each row's "Where" column points
   you straight at the change.
5. For B2, set `window.B2_DRAG_MARK_ENABLED = true` in the console first.

# Reports index

Each ticket has a per-ticket implementation log in `reports/`:

| Ticket | Report |
|---|---|
| A1–A7 | [reports/ux-7-A-implementation.md](ux-7-A-implementation.md) |
| B1 | [reports/b1-complete.md](b1-complete.md) |
| B2 | [reports/b2-complete.md](b2-complete.md) |
| B3 + B4 | [reports/b3b4-complete.md](b3b4-complete.md) (+ [consolidation map](b3-consolidation-map.md)) |
| B5 | [reports/b5-complete.md](b5-complete.md) |
| B6 | [reports/b6-complete.md](b6-complete.md) |

**Quarter 2 (Proposal B) is closed.** Next milestones (Quarter C, ZIP
bundle, B2 default-on coordination, category infrastructure) live in
[reports/ux-6-roadmap-A-then-B.md](ux-6-roadmap-A-then-B.md).
