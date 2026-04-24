# UX Audit · Phase 4 — Roadmap (A then B)

> Direction chosen: **"Go A then B"**.
>
> This document turns Proposal A into seven PR-sized tickets ready to pick up, then sketches a two-quarter plan for Proposal B contingent on what Proposal A teaches us.

Source documents:
- Problems → [ux-3-problems.md](ux-3-problems.md)
- Proposals & wireframes → [ux-4-proposals.md](ux-4-proposals.md)
- Decision rationale → [ux-5-decision-summary.md](ux-5-decision-summary.md)

---

## Sequencing principle

A is **seven independent PRs**. Each:

- Ships behind no flag (they're small, reversible bug fixes more than features).
- Has its own acceptance criteria and test surface.
- Is independently revertable — none depends on another landing first.

The order below is **shipping order**, optimised for "user-visible trust win first, then onboarding, then polish". Open them in parallel if review capacity allows; the merge order is what matters.

A typical PR in this batch is 1–4 files, ~150 LOC, plus one new test or test extension. None require `creator/bundle.js` rebuild *unless* the file lives under `creator/` (called out per ticket).

---

## Quarter 1 — Proposal A (seven PRs)

### A1 · Honest "Limit to stash" warning + Substitute CTA

**Wireframe:** [a-creator-toolstrip](wireframes/a-creator-toolstrip.html) (sidebar half)
**Problems closed:** D8 🔴, partial F-2.5
**Why first:** It's a trust bug. The current toggle silently hides palette chips even when the pattern still uses unowned threads — the user thinks they're stash-ready when they aren't.

**Files (creator bundle rebuild required):**
- `creator/Sidebar.js` — when `limitToStash` is on, compute `unownedInPattern = pattern.filter(c => !c.skip && !stash.has(c.id))`. If non-zero, render warning block with two CTAs.
- `creator/SubstituteFromStashModal.js` — already exists; new entry point opens it pre-filled with `unownedInPattern` selection.
- `stash-bridge.js` — add `addToShoppingList(threadIds, projectId)` if not already present (check first; may live in `manager-app.js`).
- `tests/limitToStashWarning.test.js` — new. Mock pattern + stash; assert warning renders iff unowned IDs exist; assert CTAs call the right handlers.

**Acceptance:**
- Warning shows count of unowned threads, never just "5 of 18 visible".
- "Substitute from stash" opens the existing modal with the unowned set preselected.
- "Add to shopping list" appends without duplicates and toasts confirmation via `window.Toast.show({message, type:'success'})`.
- Re-quantise is **not** triggered on toggle (deferred to explicit Substitute action — keep the toggle cheap).

**Out of scope:** new substitute matching algorithm; that's a B-tier item.

---

### A2 · Bold edit-mode banner + "Modify" relabel

**Wireframe:** [a-tracker-editmode](wireframes/a-tracker-editmode.html)
**Problems closed:** D5 🔴
**Why second:** Destructive-action bug. The current banner is too subtle; users tap "Mark" expecting to record progress and instead overwrite stitches.

**Files (no bundle):**
- `tracker-app.js` — when `editMode` is true:
  - Render a 40 px red strip directly under the header (`background:#fef2f2; border-bottom:2px solid #dc2626`).
  - Tint the bottom action bar with the same colour family.
  - Change the primary button label from "Mark" to "Modify"; keep the variant red.
  - Add an always-visible "Exit edit mode" link in the strip.
- `styles.css` — add `.edit-mode-strip`, `.edit-mode-bar` rules.
- `tests/editModeBanner.test.js` — new (DOM-only via JSDOM). Mount tracker with `editMode=true`, assert strip exists and `aria-live="polite"`.

**Acceptance:**
- Strip is announced once on enter (aria-live polite).
- "Exit edit mode" returns to normal mode in one tap.
- Action-bar primary reads "Modify" only in edit mode; "Mark" otherwise.
- Mobile and desktop renders both pass touch-target ≥ 44 × 44 px.

---

### A3 · Resume modal with last-session recap

**Wireframe:** [a-tracker-resume](wireframes/a-tracker-resume.html)
**Problems closed:** D2 🔴, F-4.5
**Why third:** Highest emotional ROI per line of code. Returning users immediately see what they did last time.

**Files (no bundle):**
- `tracker-app.js` — extend the existing resume modal:
  - Pull the last entry from `project.sessions[]`.
  - Render the three-stat grid (`stitches`, `stitch time`, `per-hour vs avg`).
  - Below: a one-line description of "where you stitched" — cluster last session's stitch coords by thread ID and pick the dominant one.
- `helpers.js` — add `lastSessionSummary(project) → {count, ms, perHour, dominantThreadId, dominantThreadCount} | null`. Pure function. Returns null when `sessions.length === 0`.
- `tests/lastSessionSummary.test.js` — new. Cases: empty sessions; one session; multi-thread session; degenerate (all skip cells).
- `styles.css` — `.resume-recap-grid`, mobile full-screen modal class.

**Acceptance:**
- New users (first launch) see the existing layout — recap renders only when `sessions.length > 0`.
- Per-hour comparison is omitted when fewer than 3 sessions have been recorded (otherwise the comparison is noise).
- Modal becomes full-screen on viewports < 480 px (addresses G6 as a bonus).
- No emoji; uses `Icons.clock`, `Icons.target`, `Icons.lightning` (add `lightning` to icons.js if missing).

---

### A4 · Touch targets &amp; header sub-page strip

**Wireframe:** [a-header](wireframes/a-header.html)
**Problems closed:** G1 🔴, A1 partial, B6 🟡, D9 🟡
**Why fourth:** Unblocks mobile use. Sub-page becomes a visible strip rather than a hidden dropdown.

**Files (no bundle for header.js if it stays vanilla; bundle if it pulls anything from creator/):**
- `header.js` — promote sub-page from dropdown to a second-row tab strip (`pattern / project / materials / prepare / export`). Show `in {projectName}` prefix.
- `styles.css` — add `@media (pointer: coarse)` block forcing `.tb-btn`, `.home-btn`, `.mpd-btn` to `min-height:44px; min-width:44px`. Add `.subpage-strip` with horizontal scroll on phones.
- Persist the existing "All changes saved" tag instead of flashing it (5 s TTL → "remains until next change"). State lives in `tracker-app.js` / `creator-main.js`.
- `tests/touchTargets.test.js` — new. Render header, simulate `pointer:coarse` via `matchMedia` mock, assert computed `min-height >= 44`.

**Acceptance:**
- Every interactive element in the global header passes 44 × 44 on coarse-pointer devices.
- Sub-page strip is visible on all three pages; selected sub-page reflects URL hash on load.
- Existing keyboard shortcuts still navigate sub-pages.

**Risk:** header.js is shared between three HTML entry points — verify Manager and Tracker still render correctly.

---

### A5 · Coachmark + sample row on empty Home

**Wireframes:** [a-home-empty](wireframes/a-home-empty.html), [a-creator-firstcanvas](wireframes/a-creator-firstcanvas.html)
**Problems closed:** F1 🔴, F2 🔴, F7 🟡
**Why fifth:** Onboarding without a wizard. Replaces the multi-step welcome talk with one coachmark + one sample CTA.

**Files (creator bundle rebuild required for the canvas coachmark):**
- `home-screen.js` — when `projects.length === 0`, render the new "Try a sample pattern" row sourcing from `starter-kits.js`. Hook "Open sample" to `ProjectStorage.save` + `setActiveProject` + redirect to `index.html`.
- `creator/PatternCanvas.js` (or the canvas wrapper component) — render an empty-canvas hint over the grid when `pattern.length === 0` AND `palette.length === 0`. Dismisses on first stitch or palette add.
- `creator/Sidebar.js` — when palette is empty AND coachmark hasn't been dismissed (`localStorage["cs_coach_first_canvas"]`), render a one-shot callout pointing at the "+ Add a colour" button. Dismisses on first palette open.
- `onboarding-wizard.js` — gate Creator-page invocation behind `localStorage["cs_seen_creator_wizard"]` so the new coachmark replaces the wizard for fresh installs only. Existing users keep the wizard for now.
- `tests/sampleStarter.test.js` — extend or new. Assert "Open sample" creates a `proj_*` entry and points active project at it.

**Acceptance:**
- Empty-Home sample row uses an Icons.* glyph, not an emoji.
- Coachmark dismisses on the *natural* next interaction (palette open / first stitch) — no extra "Got it" button.
- Coachmark never reappears once dismissed (per-device).
- Sample stays editable; deleting it is a normal project deletion.

---

### A6 · Dashboard de-dup &amp; emoji removal

**Wireframe:** [a-dashboard](wireframes/a-dashboard.html)
**Problems closed:** D-1, D-2, D-3, D-4, D-7, partial E6
**Why sixth:** House-rule alignment + clarity. Hides the duplicate "Suggestion" card when it equals the Continue project, replaces emoji with icons.

**Files (no bundle):**
- `home-screen.js`:
  - Skip the "Suggestion" render when `suggestionId === continueId`.
  - Replace inline emoji (`🔥` streak, `💡` tip, `📊` stats, `✦` greeting) with `Icons.fire`, `Icons.lightbulb`, `Icons.barChart`, `Icons.star`. Add any missing icons to `icons.js`.
  - Drop the per-card emoji thread badge unless `threadStatus` is actually computed (don't render an empty placeholder).
- `icons.js` — add `fire`, `lightbulb`, `barChart`, `star` if absent (24×24, 1.6 stroke, currentColor). Update `tests/icons.test.js` snapshot.
- `tests/homeDedup.test.js` — new. Render with `continueId === suggestionId`; assert only one card renders.

**Acceptance:**
- No `🔥 💡 📊 ✦` (or any other emoji) appear in DOM under `home-screen` after this PR. Add a grep-based test guard:
  ```js
  expect(homeRoot.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}\u{2600}-\u{26FF}]/u);
  ```
- Duplicate suggestion card is hidden in single-project state.

---

### A7 · Compare button in toolstrip

**Wireframe:** [a-creator-toolstrip](wireframes/a-creator-toolstrip.html) (toolstrip half)
**Problems closed:** C6 🔴
**Why last:** Smallest change with the lowest risk; can ride along with any of the above if review bandwidth allows.

**Files (creator bundle rebuild required):**
- `creator/ToolStrip.js` — add a `<button class="tb-btn" title="Compare chart vs realistic preview (\\)">⫴ Compare</button>` that toggles split-pane (same handler the `\` key already wires).
- `creator/PreviewCanvas.js` (or wherever the split state lives) — confirm the existing toggle accepts a click as well as a keypress.
- `tests/toolstripCompare.test.js` — new. Click the button, assert split-pane state flips.

**Acceptance:**
- Button is visible in the right-hand cluster of the toolstrip on all viewports ≥ 600 px; collapses into the overflow menu below that.
- Tooltip shows the keyboard shortcut.
- No regression to the `\` shortcut.

---

### A roadmap summary

| PR | 🔴 closed | 🟡 closed | Bundle rebuild | New tests |
|---|---|---|---|---|
| A1 stash honesty | D8 | F-2.5 | yes | 1 |
| A2 edit banner | D5 | — | no | 1 |
| A3 resume recap | D2 | F-4.5 | no | 1 |
| A4 touch + sub-page | G1, A1* | B6, D9 | no | 1 |
| A5 sample + coachmark | F1, F2 | F7 | yes | 1 (extend) |
| A6 dashboard de-dup | — | D-1..D-4, D-7, E6* | no | 2 (1 + icons snapshot) |
| A7 compare button | C6 | — | yes | 1 |
| **Total** | **9 / 11 🔴** | **11 / 34 🟡** | 3 of 7 | 7 |

\* partial.

The two 🔴 not closed by Quarter 1:
- **A2 image-import wizard friction** — needs full Materials/Prepare rework (Quarter 2 / B).
- **F3 dual onboarding** — resolved by retiring `onboarding.js` once the new coachmark proves out (track as a follow-up; gated on telemetry from A5).

---

## Between A and B — measure for two weeks

Before opening B work, capture:

1. **Stash-honesty interaction rate** — what % of users who toggle "Limit to stash" then click Substitute or Add-to-shopping? (target: > 50%; if much lower, the wording needs another iteration before we build the Materials hub.)
2. **Edit-mode mishit rate** — count of edit-mode taps within 2 s of entering edit mode (proxy for "I didn't realise I was in edit mode"). Should drop sharply post-A2.
3. **First-stitch latency for new users** — time from `home-screen` render to first marked stitch. A5 should reduce this; if it doesn't, the wizard wasn't actually the bottleneck.
4. **Resume modal engagement** — does the recap correlate with longer subsequent sessions? Soft signal.
5. **Coachmark dismissal source** — `palette open` vs `first stitch` vs `manual close` — tells us whether users are inferring intent or fighting it.

If all five point the right way, proceed to B. If 1 or 2 doesn't, fix the wording or the gesture model in A space before adding more surface area.

---

## Quarter 2 — Proposal B (six work-streams)

Sequenced by user value × dependency, not difficulty.

### B1 · Partial-stitched thumbnails (foundation)

**Wireframes:** [b-dashboard](wireframes/b-dashboard.html), [b-tracker](wireframes/b-tracker.html)
**Problems closed:** D-5, D7, B4

A new shared component `<PartialStitchThumb pattern done size>` that renders a pattern's `done` mask onto a small offscreen canvas. Used by the dashboard, the tracker mini-preview, the resume modal, and the Showcase.

**Why first in B:** Every other B item benefits from it. It is also the most "delight" per LOC.

Estimated effort: M (worker offload for big patterns; LRU cache by `projectId + updatedAt`).

---

### B2 · Drag-mark + long-press range select

**Wireframe:** [b-tracker](wireframes/b-tracker.html)
**Problems closed:** C7

Tracker gesture upgrade. 200 ms guard so it doesn't fight pinch zoom; long-press for range. Bigger than it sounds — every existing tap path needs to opt in.

Estimated effort: M.

---

### B3 · Mode-aware sidebar &amp; sub-page consolidation

**Wireframe:** [b-creator-edit](wireframes/b-creator-edit.html)
**Problems closed:** A4, A5, C2, partial D8 (with A1)

Reduce Creator sub-pages from 5 → 3 (`Pattern / Project / Materials &amp; Output`). Sidebar shows context for the active sub-page only — no more dual-tab mirroring.

Estimated effort: L. **Touches `creator/PrepareTab.js`, `LegendTab.js`, `ExportTab.js`** and the bundle build script. Deserves its own milestone.

---

### B4 · Materials &amp; Output hub + Manager Shopping tab

**Wireframe:** [b-materials](wireframes/b-materials.html)
**Problems closed:** A4, C2, F-6.1

New `<MaterialsHub>` collapses Materials, Prepare, Export into side-tabs. New "Shopping" tab in Manager aggregates across patterns. ZIP export bundles PDF + thread list + stash-add JSON.

Estimated effort: L. Pairs naturally with B3 — open them as a tracked epic.

---

### B5 · Multi-select dashboard &amp; rich cards

**Wireframe:** [b-dashboard](wireframes/b-dashboard.html)
**Problems closed:** C3, B4 (with B1), and unlocks bulk archive

Long-press / Cmd-click → multi-select with bulk action bar. Search field. "This week" timeline.

Estimated effort: M. Depends on B1 thumbnails.

---

### B6 · Help &amp; Shortcuts merged drawer

**Wireframe:** [b-help](wireframes/b-help.html)
**Problems closed:** F5, F-X.9

Replace `help-content.js` modal + `shortcuts.js` modal with a single side drawer, two tabs, contextual `?` per surface.

Estimated effort: M. Mostly a re-arrangement of existing content.

---

### B sequencing within the quarter

| Week | Work-stream |
|---|---|
| 1 | B1 thumbnail component + cache + worker |
| 2 | B5 dashboard cards (consume B1) |
| 3–4 | B3 sub-page reduction + sidebar refactor |
| 5–6 | B4 Materials hub + Manager Shopping tab |
| 7 | B2 drag-mark + range select |
| 8 | B6 Help drawer + retire `onboarding.js` |

If anything slips, drop B6 — it's the most isolated.

---

## Cross-cutting hygiene (bundled into A and B PRs)

These are too small to be tickets but get done in adjacent PRs:

- Replace any new emoji introductions with `Icons.*` (and add an icons-snapshot guard test).
- All new modals respect the mobile-form conventions (inputMode, enterkeyhint, autocomplete, inline errors, `max-height` scrolling).
- `npm test -- --runInBand` must remain green; rebuild `creator/bundle.js` whenever a `creator/*.js` file changes; bump `CREATOR_CACHE_KEY` if a public API of `useCreatorState`, `context`, or any `window.*` exposed from creator changes.
- New user-facing strings use British English (colour, organiser).

---

## What is *not* in this roadmap

- **Proposal C** items (mode rail, command bar, focus mode, two-pane stash, welcome-back screen) — held as a strategic option per the decision summary. If/when those become priorities they need a separate Phase 4-C architecture doc, not a backlog ticket.
- **Image-import wizard rework** (closes the remaining 🔴 A2) — listed as a B+ candidate; the Materials hub work in B3+B4 is a soft dependency.
- **Stats redesign** (Showcase, Insights, charts) — out of scope for this audit. Revisit after B lands; thumbnails alone may shift the right design.
- **Sync conflict UX** — also out of scope; deserves its own audit.

---

## Definition of done (Quarter 1)

- All seven A PRs merged.
- Two-week telemetry window passed; metrics 1–5 above captured.
- A short retro doc (`reports/ux-6-A-retro.md`) summarising what shipped, what users said, and which B items the data supports.

Then we open the first B ticket.

---

*End of Phase 4 plan.*
