# Phase 2: One truth for the numbers, plus quick bug fixes

> **Agent prompt.** You are making every progress and statistics figure in
> `kate-nc/cross-stitch` come from one shared definition, so the strip, header, popover, project
> Stats, global Stats, Home cards, share text and exports agree, and fixing the small bugs the audit
> found. Read [phase-00-working-agreement.md](phase-00-working-agreement.md) in full first, then
> the findings below in [reports/tracking-audit.md](../../tracking-audit.md). Phase 1 must be merged
> into `main` before you start; confirm it. Do not start Phase 3 until told.

## Goal

A stitcher sees one answer to "how far along am I" and "when will I finish", everywhere. Unpicking
and midnight are handled sensibly. The Activity calendar opens. The small text and encoding bugs
are gone.

## Findings in scope

STATS-01 (Major), STATS-04, STATS-05, STATS-02, STATS-07; BUG-01 (Activity tab crash), BUG-02
(share card streak), BUG-03 (mojibake title), BUG-04 (Fit fits width only), BUG-05 (wording).

## Evidence to reproduce first

- STATS-01: `harness/gen.js` special fixture; mark 2 full, 2 half, 1 knot. Strip "2 done",
  popover and header "4 / 1,759 (0.2%)", session chip "5 st", Today 5.
- STATS-02: `harness/hist.js` history fixture (expected values in audit section 2.4): Stats
  "Est. finish 13 Oct" vs popover and Insights "~17 Oct"; paces 135, 138, 145; speed 172 vs 162
  after unpicking 80.
- STATS-04: unmark 80 stitches from earlier days; Today clamps to 0, Speed in Stats stays 172
  (`harness/s5.js`).
- STATS-05: `harness/c1.js`: 23:50, 23:54 and 00:02 marks; popover "Today 30" then Today 0 and
  all 30 under "Yesterday".
- BUG-01: `index.html?mode=stats`, click Activity: "Identifier 'useState' has already been declared".

## Recommended solution (chosen options)

### Batch ordering note

Do the quick bug fixes first in their own small PR (BUG-01 to BUG-05). They are independent and
low risk, and BUG-01 unblocks verification of calendar figures in later batches.

### STATS-01: a single progress definition

Create one shared module (for example `progress-units.js`, plain script, also `require()`-able for
tests; loaded on `stitch.html`, `index.html`, `home.html`, `manager.html` as needed and added to
`sw.js` precache) exporting pure functions:

- `progressUnits({totals, done})` returning `{doneUnits, totalUnits, percent, breakdown}` where
  breakdown lists per type `{full, half, quarter, petite, knot, backstitch}` with `done/total`.
- Weights (documented, in one table, easy to change): full 1, half 0.5, quarter 0.25, petite 0.25,
  French knot 1, backstitch counted **separately** (not in percent) until Phase 6 adds tracking.
  Phase 6 will extend the table, so write the module so adding a type is one table row.
- `sessionUnits(change)` that converts a mark event into units so sessions use the same unit as
  progress. Store on new sessions as `units` (and keep `netStitches` for compatibility).

Use it everywhere a figure is shown: info strip ("N / total stitches" plus a short breakdown
when special stitches exist), header chip, legend header, popover, project Stats page (it
currently receives full stitches only), session chip, Home card %, project library and
dashboard, `stats-page.js`, share text, CSV, progress image, `stash-bridge` completion status.
Delete the duplicate computations. Maintain the incremental counters in `useStitchCounts.js`
(extend, do not rescan): add counters for each type so the shared function is O(types).

*Old sessions:* they mixed units (a half stitch counted 1). Leave them as they are, never rewrite
them. `progressUnits` is computed from `done` data, not from sessions, so the percentage is exact
for old projects. Daily totals for old sessions stay in the old unit; new sessions carry
`units`; the history helpers sum `units ?? netStitches`. State this in the help text
("counts before version X may include half stitches as full").

### STATS-04: unpicking

Keep `stitchesCompleted` and `stitchesUndone` separate in every display. "Today" is stitches
added today and never negative; show "Unpicked 80" as its own line; speed and pace use additions
only; a day with only unpicking is not an active day for streaks. Compute `netStitches` for
progress charts but never use it for pace.

### STATS-05: day boundaries

Attribute each stitch event by its own timestamp (the event log already stores `t` per `stitch`
event) so a session crossing the boundary contributes to both days; split into two session records
sharing a `groupId` at finalise (keep `id` unique). Use the single `getStitchingDate(now,
dayEndHour)` helper everywhere, including `stats-page.js`, `stats-insights.js`, `stats-activity.js`
and `insights-engine.js`. Move "Day ends at" next to the goals and add it to Preferences with a
one-line explanation ("Late-night stitching counts for the previous day until this hour").
Live and finalised "today" must be identical in value (no retroactive change at finalise).

### STATS-02: one estimator that states its basis

One function (in `helpers.js` or the new module) returning `{stitchesPerStitchingDay,
stitchingDaysPerWeek, calendarDaysRemaining, finishDate, rangeLow, rangeHigh, basis, confidence}`.
Convert stitching days to calendar days using recent frequency (stitching days in the last 28 days
divided by 28, minimum 1 per 14 days). Show one line of basis ("Based on your last 4 weeks: 3
stitching days a week, 145 stitches per stitching day"), a range, and hide the estimate until at
least 3 stitching days and 5% progress exist ("Not enough history yet"). Replace every copy:
Stats "Est. finish", popover, milestone future dates, `insights-engine.js` projections,
global RECENT PACE and the "What-if" slider. Pace shown in different places must use the same
window and definition, labelled.

### STATS-07: catch-up marks

Tag bulk actions (`markColourDone`, edit-mode changes, undo of marks from an earlier session) as
catch-up: they raise progress but are excluded from today's pace, speed, goals and celebrations.
Add an optional `catchUp` count on the session and a "Catch-up N" line in the journal. Mark-all
for a colour should ask once "Count as today's stitching or as catch-up?" the first time, with a
remembered preference.

### Bug fixes

- **BUG-01:** wrap `stats-activity.js` and `stats-page.js` in IIFEs like `stats-insights.js` (no
  top-level `const`/`function` leakage), keeping `window.StatsActivity`/`window.StatsPage`. Add a
  test that loads both scripts into one VM context without a redeclaration error, and an e2e
  test that opens Activity.
- **BUG-02:** `components-stats.js` `handleExportCard` must read `streakInfo.current`.
- **BUG-03:** repair `home.html`'s `<title>` (and the mojibake comments in `stitch.html`);
  add a test that scans HTML/JS for the double-encoded sequences (`â€`, `Ã`) in shipped
  files. Keep all files UTF-8.
- **BUG-04:** "Fit" (`fitSZ`) must contain both axes with the cell size no smaller than the
  chart's minimum; at 300x300 in a 1086x600 box the whole pattern fits.
- **BUG-05:** pluralise "~N sessions" and change "Projects 0 / 1" to "0 finished, 1 in progress".

## Files likely to change

`helpers.js`, new `progress-units.js`, `useStitchCounts.js`, `useAutoSession.js`, `tracker-app.js`,
`components-stats.js`, `stats-page.js`, `stats-activity.js`, `stats-insights.js`,
`insights-engine.js`, `home-app.js`, `home-screen.js`, `project-library.js`, `stash-bridge.js`,
`preferences-modal.js`, `user-prefs.js`, `help-drawer.js`, `version.js`, `sw.js`, the HTML pages,
tests.

## Acceptance criteria (worked examples)

- **Units:** project with 1,742 full, 30 half, 2 knots; mark 2 full, 2 half, 1 knot. Units total =
  1,742 + 15 + 2 = 1,759; done = 2 + 1 + 1 = 4. Strip, header, popover, project Stats, Home card,
  share text, CSV and image all read 4 / 1,759 (0.2%); the day total reads 4.
- **Unpicking:** a day with +50 and -80: Today +50, "Unpicked 80", streak counts the day because of
  the +50; a day with only -80 is not an active day; speed uses additions only.
- **Midnight (day end Midnight):** 10 marks at 23:50 and 20 at 00:02: 10 appear on the 10th and 20 on
  the 11th; with day end 2:00 AM all 30 on the 10th; "today" identical in popover, project Stats
  and global Stats before and after the session closes.
- **Estimate (history fixture):** 250 remaining, 145 stitches per stitching day, 10 stitching days in
  25 (0.4 per day): "about 5 days (around 16 Oct)" in every place the estimate appears with one basis line.
  A project with fewer than 3 stitching days shows "Not enough history yet".
- **Catch-up:** marking a colour of 387 stitches done as catch-up adds 387 to progress and 0 to
  today's pace, speed, goal and streak; the journal shows "Catch-up 387".
- All statistics previously hand-verified in the audit (milestone dates 18 Sep, 24 Sep, 2 Oct, 8
  Oct; streaks 1/3; best day 300; average session 47 m; week 440 vs 250, +76%; weekly streak 4)
  are unchanged for the history fixture.
- Activity tab opens and renders the calendar; share image shows the streak; page titles correct.

## Performance guard

No per-mark recomputation beyond O(1) counter updates; the Stats pages open no slower than before
(measure on a project with 500 sessions: generate with `harness/hist.js` variant); the shared
module is tiny and loaded where already needed.

## Data and migration statement (include in the PR)

New optional session fields `units`, `groupId`, `catchUp`; a new preference for day end (existing
`statsSettings.dayEndHour` remains the per-project value). No change to `done`. Old sessions are
read as before (`units ?? netStitches`); past daily totals for projects with half stitches
remain in the old unit and are labelled approximate in help; percentages are exact because they
derive from `done`. No migration; nothing recomputed destructively.

## Suggested batches

1. BUG-01 to BUG-05 (small, independent).
2. Shared `progress-units` module, counters, every display switched (STATS-01).
3. Unpicking and catch-up semantics (STATS-04, STATS-07).
4. Day-boundary attribution and the single date helper (STATS-05).
5. Shared estimator and its presentation (STATS-02).

## Phase bug-hunt additions

Build a figure-consistency matrix test: for the special, history and "only halves" fixtures, assert
that every place a figure appears yields the same value (percent, done, remaining, today, week,
speed, estimate). Re-run with fake clock across midnight and a DST change (BST ends 25 Oct 2026).
Check the CSV export and share text for stale labels. Verify global Stats and Home for a user with
a legacy project that has only `totalTime` and no sessions.
