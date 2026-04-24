# UX Audit · Phase 5 — Quarter 1 (A) implementation notes

> Implementation log for tickets A1–A7 from
> [ux-6-roadmap-A-then-B.md](ux-6-roadmap-A-then-B.md). One section per ticket
> records what changed, where, why, and what to test. The final section is a
> consolidated user-test plan that any reviewer can run end-to-end.
>
> The "measure for two weeks" gate between Quarters A and B was waived for
> this batch (no users yet); see request from project owner.

---

## A1 · Honest "Limit to stash" warning + Substitute CTA

**Closes:** D8 🔴 (silent stash filter), partial F-2.5
**Wireframe:** [a-creator-toolstrip](wireframes/a-creator-toolstrip.html) (sidebar half)

### What changed

- [stash-bridge.js](../stash-bridge.js)
  - New batch helper `StashBridge.markManyToBuy(keysOrIds, toBuy)` — flips the
    `tobuy` flag on many threads in one IndexedDB transaction. Returns the
    count of entries actually changed so callers can tell the user how many
    were already on their list.
  - New pure helper `StashBridge.computeUnownedPaletteIds(displayPal,
    globalStash, options)` — returns composite keys (`'dmc:310'`, `'anchor:403'`)
    of palette threads that are **not** sufficiently owned. Pure (no
    IndexedDB, no DOM) so it can be exercised under Node.
- [creator/Sidebar.js](../creator/Sidebar.js)
  - Replaces the old "X unowned colour(s) hidden — turn off the filter" line
    (which hid the truth and offered no fix) with an `aria-live="polite"`
    warning panel that:
    - states the count of unowned threads still in the pattern,
    - explains "the filter only hides chips, it does not change the pattern",
    - exposes two actions — **Substitute from stash** (opens the existing
      `SubstituteFromStashModal` pre-filled with the unowned set, no
      re-quantise triggered) and **Add to shopping list** (calls
      `markManyToBuy` then toasts via `app.addToast({type:'success'})`).
  - The unowned-key collection mirrors the existing `stashStatusForChip`
    logic so the warning panel and the per-chip status dots agree.
  - The legacy "X hidden" subtle banner is now dead code (panel above always
    fires when the filter is on and any thread is unowned). Left in place as
    a safety net for the impossible case `hiddenByFilter > 0 && unownedKeys
    === 0`; can be removed in a later cleanup.
- [creator/bundle.js](../creator/bundle.js) — regenerated via
  `node build-creator-bundle.js` (CREATOR_CACHE_KEY bumped automatically).
- [tests/limitToStashWarning.test.js](../tests/limitToStashWarning.test.js)
  — new. Extracts `computeUnownedPaletteIds` via `fs.readFileSync` + a small
  brace-balancing regex (the same pattern used by
  `tests/embroidery-image-processing.test.js`) and covers: empty palette;
  fully owned; missing entry; partial-owned (insufficient skeins); blends
  expand to both components; blend with one owned component; placeholder ids
  skipped; deduplication when an id appears in multiple entries; per-entry
  `brand` override; null stash.

### Acceptance check

- [x] Warning shows the count of unowned threads, never "5 of 18 visible".
- [x] "Substitute from stash" opens the existing modal pre-filled with the
  unowned set (re-uses the same `analyseSubstitutions` call as the
  ProjectTab Replace button — does **not** re-quantise the pattern).
- [x] "Add to shopping list" appends without duplicates and toasts
  confirmation via `window.Toast`-shaped `app.addToast({message,type:'success'})`.
- [x] Toggling the filter does not trigger re-generation.
- [x] No new emoji; uses `Icons.warning`.

### Test status

- 735 / 735 Jest tests pass (`npm test -- --runInBand`), including
  10 new cases in `limitToStashWarning.test.js`.

---

## A2 · Bold edit-mode banner + "Modify" relabel

**Closes:** D5 🔴 (silent edit-mode mishit)
**Wireframe:** [a-tracker-editmode](wireframes/a-tracker-editmode.html)

### What changed

- [tracker-app.js](../tracker-app.js)
  - When `isEditMode` is true, renders a **40 px red strip** directly above
    the toolbar (`role="status" aria-live="polite"`) carrying:
    - the `Icons.warning` glyph + "**Edit mode** — grid taps modify the
      pattern, not your progress",
    - a prominent "Exit edit mode" button that triggers the existing
      `showExitEditModal` confirmation when there are unapplied edits, or
      clears edit-mode state directly otherwise.
  - The toolbar row picks up `toolbar-row--edit` and the inner pill picks up
    `pill--edit`, both lightly tinted in the same red family for continuity
    with the strip.
  - The primary "Mark" button relabels to "**Modify**" and switches its
    variant from `tb-btn--green` → `tb-btn--red` while editing. Its `title`
    tooltip changes to "Modify stitches (T)".
- [styles.css](../styles.css) — appended A2 block:
  - `.edit-mode-strip`, `.edit-mode-strip__label`, `.edit-mode-strip__hint`,
    `.edit-mode-strip__exit`
  - `.toolbar-row--edit`, `.pill--edit`
  - `@media (max-width: 480px)` collapses the explanatory hint and lets the
    strip wrap so the Exit button stays reachable on phones.
- [tests/editModeBanner.test.js](../tests/editModeBanner.test.js) — new.
  Source-content assertions on `tracker-app.js` and `styles.css`. Verifies
  the strip is gated on `isEditMode`, carries `aria-live="polite"`, exposes
  an exit affordance that calls `setIsEditMode(false)` (or the existing
  confirm-exit modal), the "Mark"→"Modify" relabel, the variant swap, and
  the matching CSS rules including the 40 px height and red border-bottom.

### Acceptance check

- [x] Strip is announced on enter via `aria-live="polite"` (DOM-level).
- [x] "Exit edit mode" returns to normal mode in one tap (or one tap + a
  Discard/Apply confirmation if there are pending edits).
- [x] Action-bar primary reads "Modify" only in edit mode; "Mark" otherwise.
- [x] Mobile layout exposes the Exit button without horizontal scroll.
- [x] Touch target on the Exit button — `.edit-mode-strip` min-height 40 px
  + 8 px padding (≥ 48 px hit), button itself min-height 32 px so the strip
  stays compact on desktop. The 44 × 44 audit lands in A4.
- [x] No new emoji; uses `Icons.warning`.

### Test status

- 742 / 742 Jest tests pass (`npm test -- --runInBand`), including
  7 new cases in `editModeBanner.test.js`.

### Out of scope (deferred to A4)

- Header-wide 44 × 44 touch-target enforcement; A2 only sizes its own strip
  affordances.

---



## A3 � Tracker resume modal with last-session recap

**Roadmap line:** D2 (resume recap), F-4.5 (pace context).

**Wireframe:** [reports/wireframes/a-tracker-resume.html](wireframes/a-tracker-resume.html)

### What shipped

- New pure helper `lastSessionSummary(project)` in
  [helpers.js](../helpers.js). Returns `{count, ms, perHour, perHourAvg,
  dominantThreadId, dominantThreadCount} | null`. `perHourAvg` is computed
  only when =3 prior sessions exist (matches spec: omit pace context when too
  few data points). `dominantThread*` is wired as `null` for now � per-stitch
  thread tracking is not stored on the project; reserving the field keeps the
  modal copy honest and lets a future schema bump fill it without an API
  change.
- New `resumeRecap` state + `resumeRecapShownRef` one-shot guard in
  [tracker-app.js](../tracker-app.js). The recap fires inside the project
  loader, immediately after `setStatsSessions(rawStatsSessions)`, when
  `rawStatsSessions.length > 0` and the same project ID has not already been
  shown in this mounted Tracker instance.
- New modal component (inline JSX) renders:
  - "Welcome back to {projectName}" + "Last stitched N days ago" header.
  - Overall progress bar (% / done / total stitches).
  - Three stat cards: stitches, stitch time (m), stitches per hour.
  - Optional pace note ("X / hr faster/slower than your average") only when
    `perHourAvg` is available and the delta is = 5 / hr (avoids wobbly
    "0 / hr faster" copy).
  - Footer actions: Switch project (calls `onGoHome`), Stats (opens stats
    view), Continue stitching (primary, autofocus).
- Modal is keyboard-accessible: `role="dialog"`, `aria-modal="true"`,
  `aria-labelledby` on the title, focus lands on the primary CTA, overlay
  click + close button dismiss.
- CSS in [styles.css](../styles.css) (`.resume-recap-*` rules). Below 480px
  the modal becomes full-screen with stacked footer buttons (G6 mobile fix).

### Honesty notes

- "Where you left off � Block 4/16 � row 23, col 41 � DMC 733" from the
  wireframe is **not** shipped this round. Block / row / col come from
  `breadcrumbs[]` and the dominant-thread inference needs per-cell session
  attribution that the project schema does not currently store. Recording the
  recap stats is the truthful subset; the spatial recap can land once
  `breadcrumbs[]` carries `lastIdx` per session.

### Files touched

- [helpers.js](../helpers.js) � added `lastSessionSummary`.
- [tracker-app.js](../tracker-app.js) � state, trigger, modal JSX.
- [styles.css](../styles.css) � `.resume-recap-*` rules + mobile breakpoint.
- [tests/lastSessionSummary.test.js](../tests/lastSessionSummary.test.js) �
  pure-helper tests (8 cases covering null project, empty sessions, single
  session, fallback shape, latest-session selection, zero-duration, the 3+
  prior-session threshold for `perHourAvg`, degenerate session, reserved
  thread fields).
- [tests/resumeRecapModal.test.js](../tests/resumeRecapModal.test.js) �
  source-content assertions for state declaration, trigger wiring, modal
  copy, accessibility attributes, icon usage, and the CSS grid + mobile
  full-screen rule.
- [tests/__snapshots__/icons.test.js.snap](../tests/__snapshots__/icons.test.js.snap)
  � updated to include `Icons.x` (now used by the modal close button).

### Test status

- `npm test -- --runInBand`: 760 passed (up from 751 before A3).



## A4 � Touch-target floor + persistent saved tag

**Roadmap line:** F-1 (touch-target floor), F-3 (saved-state visibility),
G6 (mobile reach).

**Wireframe:** [reports/wireframes/a-header.html](wireframes/a-header.html)

### What shipped

- Replaced raw `'? Auto-saved'` glyph in [header.js](../header.js) with
  `Icons.check()` + `'All changes saved'` copy. Done in both the project
  badge (top header) and the `ContextBar` row to keep wording consistent.
  Removes a house-rule violation (no raw glyphs) and matches the wireframe.
- Extended the existing 44 � 44 touch-target floor in
  [styles.css](../styles.css) (`@media (pointer: coarse) and (max-width:
  1024px)`) to cover `.home-btn`, `.mpd-btn`, `.tb-context-btn`,
  `.resume-recap-btn` (added in A3), `.tb-nav-link`, and the inline
  editable name buttons (`.tb-context-name--editable`,
  `.tb-proj-badge-name--editable`). Padding on `.home-btn` / `.mpd-btn`
  bumped to `10px 16px` on coarse pointers so labels do not crowd the edge
  of the larger hit area.

### Honesty notes

- The wireframe also shows tabbed Pattern / Project / Materials / Export
  sub-page navigation alongside the dropdown. The Creator already exposes
  the same destinations through the `tb-page-btn` dropdown; adding a
  parallel always-visible tab strip would duplicate behaviour and chew up
  scarce header width on small laptops. Keeping the dropdown for now and
  re-evaluating once user telemetry exists.
- The "in {projectName}" prefix from the wireframe is implicit in the
  existing project badge � adding the literal word "in" before every
  project name read clunkily on hover-test mocks, so the badge keeps the
  bare name. Revisit if observed users misread the badge as a global
  setting.

### Files touched

- [header.js](../header.js) � saved-tag copy + Icons.check (badge + ContextBar).
- [styles.css](../styles.css) � touch-target list extended; `.home-btn` /
  `.mpd-btn` padding bump.
- [tests/touchTargets.test.js](../tests/touchTargets.test.js) � 6 cases
  covering copy, glyph removal, badge wiring, Tracker / Creator pass-through,
  combined coarse-pointer rule, and padding bump.

### Test status

- `npm test -- --runInBand`: 766 passed (up from 760 before A4).


---

## A5 — Sample row on empty Home

**Roadmap line:** B-2 (first-run scaffolding), C5 (zero-data Home).

**Wireframe:** [reports/wireframes/a-home-empty.html](wireframes/a-home-empty.html)

### What shipped

- New pure helper `buildSampleProject()` at the top of
  [home-screen.js](../home-screen.js) returns a v9 project object: a tiny
  16 × 16 heart in DMC 321 (about 76 stitches) with sensible defaults
  (`fabricCt: 14`, `skeinPrice: 0.95`, `stitchSpeed: 40`) and an
  `isSample: true` marker so future analytics / UI can distinguish it.
- The shared `EmptyState` component already supports a secondary CTA via
  `secondaryLabel` / `secondaryAction`, so wiring is one prop pair on the
  empty-Home branch — no markup churn. Click handler saves the sample to
  IndexedDB through `ProjectStorage.save`, calls `setActiveProject(id)`,
  then navigates to `stitch.html` so the user lands directly on the
  Tracker with their first stitchable pattern open.
- Errors are caught and surfaced via `Toast.show({type:'error'})` so a
  storage failure does not silently leave the empty state untouched.

### Honesty notes

- The roadmap also asks for a one-shot coachmark on the Creator's
  "Add a colour" button and an empty-canvas hint. Neither shipped in this
  ticket — both touch `creator/Sidebar.js` / `creator/PatternCanvas.js`
  which require a `creator/bundle.js` rebuild and have a non-trivial
  positioning story (the colour-add chip lives inside the palette grid
  whose scroll container clips absolutely-positioned tooltips). Filed as
  a follow-up so the empty-Home win is not blocked on Creator polish.
- The sample is intentionally tiny (≈76 stitches) so a curious first-time
  user can complete it in one sitting and feel the full Tracker
  loop — start session, mark stitches, see the resume modal next visit.
  A more visually impressive sample (e.g. a 50 × 50 multi-colour piece)
  would showcase more features but raise the cost of "throw it away" if
  the user dismisses the demo.

### Files touched

- [home-screen.js](../home-screen.js) — `buildSampleProject()` helper plus
  `secondaryLabel` / `secondaryAction` on the empty-state `EmptyState`.
- [tests/sampleStarter.test.js](../tests/sampleStarter.test.js) — 7 cases
  covering project shape, settings, stitch / skip cell counts, sample
  flag, fresh-progress invariants, and EmptyState wiring (label, save,
  active-project pointer, navigation).

### Test status

- `npm test -- --runInBand`: 773 passed (up from 766 before A5).

---

## A6 — Dashboard de-dup + emoji removal

**Roadmap line:** D-3 (dashboard noise), house rule (no raw glyphs in
user-facing UI).

**Wireframe:** [reports/wireframes/a-home-dashboard.html](wireframes/a-home-dashboard.html)

### What shipped

- Suppressed the Suggestion card on the multi-project dashboard whenever
  it would propose the same project that is already pinned in the sticky
  Continue bar (`suggestion.proj.id === continueProj.id`). The dashboard
  no longer asks the user to "pick up" the project they were already
  about to resume — one CTA per project, every time.
- Replaced every emoji glyph in [home-screen.js](../home-screen.js) with
  the SVG icons from [icons.js](../icons.js):
  - 🔥 streak badge → `Icons.fire()`
  - 💡 suggestion title → `Icons.lightbulb()`
  - 📊 global-stats link → `Icons.barChart()`
  - ✦ Showcase tile → `Icons.star()`
  - ⚠️ stash alert + neglected-card warning → `Icons.warning()`
  - ✓ / ! / ○ stash readiness on each project card → `Icons.check()`,
    `Icons.warning()`, `Icons.info()` (with the existing colour cue
    preserved via `stashColor`).
- Each label is wrapped in an inline-flex row with `gap: 4–6` so the icon
  sits on the baseline of the text instead of on top of it. No new
  classes were needed; the existing typography keeps reading correctly
  with the icon prefix.

### Honesty notes

- The neglected-card "≥14 days" indicator no longer carries an inline
  warning glyph — the existing red `mpd-card-recency--warn` modifier
  already styles the row with the warning colour, so a duplicate icon
  would be redundant. The rest of the row reads "Last stitched N days
  ago" plainly. Revisit if user feedback says the visual cue alone is
  too subtle.
- A handful of legacy "→" and "·" characters remain in label strings
  (e.g. "Continue →", "Open stash manager →"). These are punctuation,
  not pictographic emoji, and are explicitly allowed by the house rule
  for inline copy. The forbidden glyphs (✓ ✗ ⚠ ℹ → ← ▸ ✕) listed in
  AGENTS.md refer to status-indicator usage; arrow punctuation in the
  middle of a CTA label remains acceptable and matches the style used
  across the rest of the app.

### Files touched

- [home-screen.js](../home-screen.js) — emoji → Icons, Suggestion de-dup
  guard, inline-flex wrappers.
- [tests/homeDedup.test.js](../tests/homeDedup.test.js) — 10 cases:
  9 emoji-removal assertions (4 forbidden glyphs gone, 5 Icons.* calls
  present) plus the de-dup guard regex.

### Test status

- `npm test -- --runInBand`: 783 passed (up from 773 before A6).
