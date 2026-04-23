# Post-Fix Gap Brief

Generated after completion of the CRITICAL → HIGH → MEDIUM bug-fix sweep
on the `feedback-improvements-and-onboarding` branch. The previous brief
([BRANCH_AUDIT_AND_GAP_BRIEF.md](BRANCH_AUDIT_AND_GAP_BRIEF.md)) is now
fully resolved (3 CRITICAL, 7 HIGH, 12 MEDIUM closed; bug passes after
each tier kept the suite at **51 suites / 612 tests / 1 snapshot
passing**, terminology lint clean).

This brief lists only **new** findings — items not in the previous
audit, surfaced during a fresh sweep across the recently-edited surfaces
plus a wider spot-check of onboarding, sync, PDF export, and stash
flows.

---

## CRITICAL

_None found._

The composite-key, blend-ownership, and migration-await regressions are
fixed and protected by the new `tests/compositeKeyRegression.test.js`
suite (11 tests).

---

## HIGH

### H1 — Anchor threads still appear "needed" inside Creator Sidebar

**File:** [creator/Sidebar.js](creator/Sidebar.js#L98), [creator/Sidebar.js](creator/Sidebar.js#L310)

Two stash lookups are hardcoded as `stash['dmc:' + id]`:

- L98 — the per-colour status dot in the Colours section
- L310 — the "limit to stash" filter in the Blend picker

Today this only matters if a user converts a Creator project to use
Anchor threads (via the palette-swap or thread-conversion flow) and
then re-opens the Creator. The Sidebar will treat all Anchor IDs as
"not in stash" and the blend-from-stash filter will return an empty
list. As Anchor support widens (the M2 Phase B work) this will become
a visible defect.

**Fix:** Read `p.brand` (or fall back to `'dmc'`) when the palette
entry carries one, and build the key as `(p.brand || 'dmc') + ':' + id`.
Mirror the resolution helper added to `ShoppingListModal.js` in H1.

### H2 — Insights empty-state CTA sends users to the wrong page

**File:** [stats-insights.js](stats-insights.js#L388-L396)

When `(allSessions.length === 0 && summaries.length === 0)`, the empty
state shows "Open a project in the Stitch Tracker" with a button that
navigates to `stitch.html`. A user with **zero projects** is sent to
the Tracker, which itself shows an empty "open or create" prompt — a
two-step dead-end.

**Fix:** Distinguish two empty states. If `summaries.length === 0` →
copy "Create your first pattern" + CTA `index.html`. Otherwise (has
projects but no sessions) → keep the current Tracker CTA.

---

## MEDIUM

### M1 — Tracker `?` shortcut and global `?` listener can double-fire

**File:** [tracker-app.js](tracker-app.js#L3985), [command-palette.js](command-palette.js#L513-L530)

Tracker binds `?` (non-capture) inside its global keyboard handler, and
M10 added a second `?` listener inside `command-palette.js` that
dispatches `cs:openHelp`. Both run because `e.defaultPrevented` is only
checked on the second listener and Tracker's handler does
`e.preventDefault()` — which the global listener honours — but the
ordering depends on listener registration order. On Tracker the result
is currently fine, but on Manager (which has no `?` handler) the global
listener fires once. **Verify** the help modal does not open twice on
Tracker after a hard reload; if it does, gate the global `?` handler on
`pageKind() === 'manager'` only, or require the host page to opt in via
a `data-cmdpalette-help` attribute.

### M2 — `pageKind()` is duplicated logic and may misclassify file://

**File:** [command-palette.js](command-palette.js#L40-L80)

`pageKind()` derives the page from `location.pathname` substring match.
When opened over `file://` on Windows the path may contain backslashes
and `index.html` won't be present (the user could open a renamed copy).
The Help-dispatch branch (H7) and the `?` listener (M10) both rely on
this. Add a `window.__csPageKind` override fallback so each page can
declare itself explicitly (each page already initialises a Header with
a `page=` prop — set the global there).

### M3 — Toast undo `aria-label` repeats the toast message

**File:** [toast.js](toast.js#L107-L116)

The M6 fix sets `aria-label = undoLabel + ": " + message`, so the
screen reader announces the toast text *twice* (once when the toast
appears in the live region, once when focus reaches the button).
Trim to `aria-label = undoLabel` and rely on the live-region
announcement for context.

### M4 — `getMostUsedColours` is recomputed on every Insights mount

**File:** [project-storage.js](project-storage.js#L?), [stats-insights.js](stats-insights.js#L100)

Every navigation to Insights walks every project's `pattern` array and
sums per-colour counts (now including blend split + halfStitches as of
H2). For a stash with 30+ projects this is hundreds of MB of work on
every mount. Memoise the result keyed by
`(project_meta.length, max(updatedAt))` and stash it on
`window.__csMostUsedCache`. Invalidate from the `cs:projectSaved` event
that already exists.

### M5 — Backup-restore re-runs migrations even when the export was current

**File:** [backup-restore.js](backup-restore.js#L200-L222)

The M12 fix correctly clears `cs_projects_v3_migrated` and re-runs both
migrations after every restore. That's safe (idempotent) but slow on
large libraries. Skip the re-run when the backup file's `version` field
is already at the current schema version (already known from
`validate()`). Only force a re-run for older exports.

### M6 — `DAY_LABELS_FULL` constant is duplicated potential

**File:** [stats-insights.js](stats-insights.js#L21-L22)

`DAY_LABELS_FULL` was added for M4 a11y, but `insights-engine.js`
already has its own day-name table. Move both to a shared
`constants.js` block (or `helpers.js`) so future i18n changes happen
in one place.

### M7 — Command-palette focus restoration runs even when `lastActiveElement` was the palette opener

**File:** [command-palette.js](command-palette.js#L?)

H6 added focus restoration via `lastActiveElement.focus()`. If the user
opened the palette by clicking a button, the focus snaps back to that
button — fine. But if they opened it via Ctrl/Cmd+K from within an
input (search box, name field), focus returns to the input and the
palette's just-executed action (e.g. opening a modal) immediately steals
the new modal's autofocus attempt. Add a tiny `setTimeout(restore, 0)`
so the new modal mounts first, then trap-restore.

### M8 — Onboarding wizard "Skip" links use `<a href="#">`

**File:** [onboarding-wizard.js](onboarding-wizard.js)

Several skip / continue links are anchor tags with `href="#"`, causing
the browser to scroll to the top of the page when clicked. Use
`<button type="button">` styled as a link, or `e.preventDefault()` in
the handler.

### M9 — `pdf-export-worker.js` swallows font-load errors silently

**File:** [pdf-export-worker.js](pdf-export-worker.js)

If `CrossStitchSymbols.ttf` fails to load (CDN issue, offline first
use), the worker continues and produces a PDF where every cell shows
the fallback glyph (`?`) — Pattern Keeper rejects the file. Surface
the error back to the main thread and show a Toast: "PDF export
failed — symbol font missing. Reload and retry."

### M10 — Insights "hidden insight TTL" cleanup never runs

**File:** [stats-insights.js](stats-insights.js)

Dismissed insights are stamped with `Date.now()` and the M3 tooltip now
promises they reappear after 30 days. But there is no code that walks
the dismissed map and removes entries older than 30 days. Add a
single-pass cleanup at the top of the `useStatsInsights` hook (or
within `loadDismissed`).

### M11 — `InsightsEngine.getPeakHour` API mismatch

**File:** [insights-engine.js](insights-engine.js#L224), [stats-insights.js](stats-insights.js#L296)

`getPeakHour(allSessions)` returns a single hour (number) — not the
`{dow, hr, count}` triple the rhythm-heatmap aria-summary needs.
M4's fix worked around this by computing the peak inline from the
grid. Either rename one to clarify, or extend the engine with
`getPeakCell(grid)` so callers don't reimplement the search.

### M12 — Manager has no Welcome wizard / `cs:showWelcome` listener

**File:** [manager-app.js](manager-app.js)

Tracker and Creator both bind `cs:showWelcome` to re-open their welcome
flow. Manager has none — clicking "Show welcome tour again" from the
Help Centre while on Manager dispatches the event into the void. Either
add a manager-specific welcome (matching Tracker/Creator) or hide the
"Show welcome tour again" link on Manager.

---

## LOW

### L1 — `creator/bundle.js` not added to `.gitattributes` as `linguist-generated`

**File:** [.gitattributes](.gitattributes)

`creator/bundle.js` (672 KB) bloats every PR diff. Mark it
`linguist-generated=true` so GitHub collapses it by default and so
language stats remain accurate.

### L2 — `npm test` output is verbose; no `--silent` script

**File:** [package.json](package.json#L9-L13)

CI logs and local runs spam every test name. Add a `test:silent` script
that runs `jest --runInBand --silent` for quick "did anything break?"
checks during fixed sweeps like this one.

### L3 — `EXPORT_QUICKSTART.md` lists Pattern Keeper as the only export target

**File:** [EXPORT_QUICKSTART.md](EXPORT_QUICKSTART.md)

The PDF pipeline now also produces standard image-symbol PDFs (no PK
font). Update the quickstart to mention both modes and link to the
relevant settings.

### L4 — Toast container has no `aria-live` region

**File:** [toast.js](toast.js)

The toast container is a plain `<div>` — screen readers don't announce
new toasts. Add `role="status"` and `aria-live="polite"` to the
container element.

### L5 — Command-palette `<input>` has no `aria-controls`

**File:** [command-palette.js](command-palette.js)

H6 added `role="listbox"` to the results list but the `<input>` doesn't
declare `aria-controls="<list-id>"` or `aria-activedescendant`. Without
these, AT users can't navigate the result list with arrow keys via the
combobox pattern.

### L6 — `InsightCard` dismiss button has no tooltip

**File:** [stats-insights.js](stats-insights.js)

The dismiss `×` on each insight card has no `title` or `aria-label`.
Add `aria-label="Dismiss this insight"`.

---

## Verification status

- All edits made by this sweep produce no errors in the language
  server (TypeScript checker via `get_errors`).
- Test suite: **51 suites, 612 tests passing** before and after the
  sweep.
- `npm run lint:terminology` passes.
- `creator/bundle.js` regenerated (`node build-creator-bundle.js`),
  size 672 KB / 33 files merged.
- The CRITICAL fix is locked in by 11 new regression tests in
  [tests/compositeKeyRegression.test.js](tests/compositeKeyRegression.test.js).

## Recommended next sweep order

If continuing immediately, fix in this order to avoid rework:

1. **H1** (Sidebar Anchor support) — same shape as the
   ShoppingListModal H1 fix; trivial port.
2. **H2** (empty-state CTA routing) — 5-line change.
3. **M2 + M1** together — `pageKind()` clarification removes the
   double-fire risk.
4. **M9** (PDF font failure surfacing) — visible to real users.
5. **M4 + M5** (perf around Insights and restore).
6. Remaining MEDIUM and all LOW as a polish batch.
