# Phase 3: Honest time and correctable history

> **Agent prompt.** You are making the time, speed and history figures in `kate-nc/cross-stitch`
> trustworthy and fixable by the user, and tidying how statistics are presented and how
> motivation features behave. Read [phase-00-working-agreement.md](phase-00-working-agreement.md)
> in full first, then the findings below in [reports/tracking-audit.md](../../tracking-audit.md).
> Phases 1 and 2 must be merged into `main`; confirm. Do not start Phase 4 until told.

## Goal

Time and speed reflect how the person actually stitches or are clearly labelled as estimates; any
session can be corrected or deleted with every dependent figure updating; the Stats pages lead
with the headline numbers and fit a phone; streaks and goals can be calm or off.

## Findings in scope

STATS-03 (Major), STATS-06 (Major), STATS-08, STATS-09.

## Evidence to reproduce first

- STATS-03: `harness/c1.js` style run: 30 stitches marked over a 22-minute span credited "Active
  time 5m", "Speed 400/hr". Code: `tracker-app.js` 706-845 (`computeActiveMs*`),
  `useAutoSession.js`, prefs `trackerTimingMode` classic, `trackerActiveGapCapSec` 90.
- STATS-06: Stats session journal offers only "Add note"; no edit or delete anywhere.
- STATS-08: `harness/s7`-style run at 393px: project Stats page scroll width 448 vs 393; last milestone
  card clipped; page about 4,000 px tall; "~1 sessions".
- STATS-09: global "Daily streak, keep it going!"; streaks cannot be hidden.

## Recommended solution (chosen options)

### STATS-03: explicit, visible timer; labelled estimates

1. **Session controls in the tracker.** Surface Start, Pause and Stop with elapsed time in the
   existing session chip and Session panel (the P shortcut and chip exist). The chip becomes a clear
   button with a text label, at least 44 px on touch. States: no session ("Start timer"), running
   (elapsed, Pause), paused, ended (summary with an editable duration, "You stitched for 46 min,
   edit"). Stopping offers to confirm or edit minutes.
2. **Timing basis.** Record on each session `timingBasis`: `"timer"` (explicit), `"auto"`
   (derived from taps) or `"edited"`. Keep the three existing modes as `auto` variants. When the
   basis is `auto`, label time and speed "estimated" wherever they appear and do not show speed
   for sessions shorter than 10 minutes. Default for **new** projects remains auto-sessions (no
   extra taps required), but an unobtrusive prompt after the first session offers the timer.
3. **Do not change how old sessions were measured.** Existing `durationSeconds` stay as recorded.
4. Idle finalisation, hidden-tab pause and manual pause behave as today (`trackerIdleMinutes`).
   Add a "Forgot to stop?" prompt when a timer-based session has run past the idle threshold
   with no marks: on return offer to trim to the last mark.

*Alternative considered:* keep auto timing and change defaults to Batch-friendly with a wider cap.
Rejected as less honest; do not implement unless the user asks.

### STATS-06: edit and delete sessions

In `SessionTimeline` (`components-stats.js`) add per-session Edit (date, start, minutes,
stitches) and Delete, plus Merge adjacent sessions. Confirm with an Undo toast (reuse `Toast`).
After any change recompute from the corrected list: `stitchLog`, each session's `totalAtEnd`
(the backfill code in `processLoadedProject` shows the method), milestone dates, cumulative and
speed charts, streaks, best day, weekly comparison, goals. Edited sessions carry `edited: true` and
show a small "edited" label. Changes go through the normal save path (Phase 1 durability) and are
included in backup and `.csync` merges (union by `id`, last edit wins by `editedAt`). Provide
a project-level "Recalculate history" action only if needed to repair totals.

### STATS-08: presentation and discoverability

- Remove the horizontal overflow on phones (cause the milestone row; make cards wrap or scroll
  intentionally). Test 360, 393, 430 px wide.
- Reorder the project Stats page: headline card (percent, today, this week, estimate with its basis line),
  then goals and streaks, then charts; collapse Colour timeline, Sections, Comparison and Settings
  into accordions (native `details`/`summary` with proper labels; keyboard accessible).
- Move "Day ends at", timing and pace settings next to what they affect and into Preferences.
- Fix "~1 sessions", "No session data" noise (show nothing when no per-session colours exist).
- Charts must work without hover: tap or focus shows the value in a visible readout; add text
  alternatives (table or `aria-label` summary); check colour contrast and do not rely on colour alone.
- Make the headline figures reachable from stitching in one tap (the popover) and link to Stats.

### STATS-09: calm motivation

Default to the weekly streak, show the daily streak only when turned on, and soften copy (no
"keep it going!"). Add a "Show streaks and goals" preference (one `UserPrefs` key, default on for
existing users who have goals or streaks visible today so nothing disappears; default calm for new
users) that hides streak cards, goal bars and celebration toasts everywhere (tracker, project
Stats, global Stats, Home). Missed days are never described as failures.

## Files likely to change

`tracker-app.js` (session chip/controls, `computeActiveMs*` callers), `useAutoSession.js`,
`components-stats.js`, `stats-page.js`, `insights-engine.js`, `helpers.js`, `preferences-modal.js`,
`user-prefs.js`, `styles.css` (tokens only), `help-drawer.js`, `version.js`, `sync-engine.js` (session
merge by id and `editedAt`), tests.

## Acceptance criteria

- With the explicit timer running 20 minutes and 30 stitches marked, Stats shows 20 min and 90/hr,
  basis "timer"; with auto timing the same activity shows an "estimated" label and no speed until the
  10-minute minimum.
- Forgot-to-stop prompt: leave a running timer 30 minutes with no marks; on return the prompt offers to
  trim to the last mark; accepting changes the stored duration and all derived figures.
- Deleting the 140-stitch session on 10 Oct reduces week totals, best-day, cumulative chart and
  milestone dates accordingly, updates the streak, and Undo restores everything byte-for-byte. Editing
  a session's date moves its stitches between days in every figure.
- Merging a session edited on two devices (`.csync`) keeps the later edit; deleting on one device does not
  resurrect it after a sync import (use a tombstone list `deletedSessionIds` on the project).
- No horizontal overflow at 360-430 px; first phone screen shows percent, today and estimate with basis;
  charts readable and operable without hover; axe reports no serious issues on the Stats pages.
- With "Show streaks and goals" off, no streak card, goal bar or celebration appears anywhere.

## Performance guard

Timer ticks update only the chip, not the tracker tree (isolate in a small component or ref; the
existing 1 s display timer in `useAutoSession.js` must not re-render the chart). Editing a
session recomputes derived figures once, not per render. Stats open time unchanged on a 500-session
project.

## Data and migration statement (include in the PR)

New optional session fields: `timingBasis`, `edited`, `editedAt`; project field `deletedSessionIds`;
one preference. Old sessions read as `timingBasis: "auto"`. No migration. Past statistics are
preserved exactly; they are simply labelled estimated. Sync merge unions sessions by `id` and honours
tombstones.

## Suggested batches

1. Session edit/delete/merge with recomputation and sync tombstones (STATS-06), the highest value.
2. Explicit timer, labelled estimates, forgot-to-stop prompt (STATS-03).
3. Stats page restructure, phone overflow, no-hover charts (STATS-08).
4. Calm streaks/goals and the preference (STATS-09).

## Phase bug-hunt additions

Delete the first and last session; delete all sessions (empty states, charts sparse, milestones);
edit a session across a day boundary; timer across midnight, backgrounded tab, device sleep, and
project switch while running; two tabs both editing sessions; restore an old backup (sessions
without new fields); verify global Stats and Home update after history edits without a reload.
