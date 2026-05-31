# Plan: Estimated Completion & Improved Tracking Stats

> Competitive context: MRXP's primary differentiator over Pattern Keeper is
> per-project stats (estimated completion date, daily/monthly progress graphs,
> average stitch rate). stitchx already does the hard maths inside
> `insights-engine.js` (`computeCompletionProjection`, `generateProjections`),
> but that data only appears on the cross-project **Stats** page — not inside
> the Tracker where the user spends most of their time.
>
> The work here is almost entirely UI wiring, not new logic.

---

## What already exists

| Component | File | What it provides |
|---|---|---|
| `computeCompletionProjection(total, done, remaining, pace, now)` | `insights-engine.js` L163 | Completion date, days remaining, projected text — already tested |
| `generateProjections(projects, opts)` | `insights-engine.js` L182 | Batch version; returns `[{ name, completionDate, daysRemaining, stitchesPerHour, recentPaceStPerDay, percent, projectedText, status }]` |
| `ProjectionCard` | `stats-insights.js` | Already-rendered card component for one project's projection |
| `lastSessionSummary(project)` | `helpers.js` L91 | `{ count, ms, perHour, perHourAvg }` — shown in `SessionSummaryModal` |
| `computeWeeklyStreak` | `insights-engine.js` | Weekly streak count |
| `statsSessions` array on project | Project JSON schema | `{ netStitches, durationSeconds, date, ... }` — the raw data |

---

## Deliverables

### 1. Completion projection banner in the Tracker

**Where:** `tracker-app.js` — in the header/project info area that already shows
project name and progress percentage.

**What to add:** A single line beneath the progress bar:
```
~14 Jun 2026 at current pace  ·  312 st/hr recently
```

**Data source:** Call `InsightsEngine.generateProjections([project])` on the
loaded project. Requires `insights-engine.js` to be loaded on `stitch.html` —
check the script tag order in `stitch.html`.

**Show condition:** Only render when `status !== 'complete'` and
`status !== 'paused'` (i.e. at least one session exists and `recentPaceStPerDay > 0`).

**Edge cases:**
- Project has 0 sessions → show nothing (don't show "No recent sessions" in the tracker — that's for the stats page)
- Project is 100% complete → show a done state (already handled by existing `SessionSummaryModal`)

**Files to touch:** `tracker-app.js`, `stitch.html` (add `insights-engine.js` script tag if missing)

---

### 2. Per-project mini progress graph

**Where:** Same header area, or inside a collapsible "Details" panel in the tracker.

**What to add:** A sparkline bar chart — one bar per active day — showing
`netStitches` per session grouped by date. Width: ~200 px, height: ~40 px.
No library needed; build with `<canvas>` or flex divs.

**Data source:** `project.statsSessions` — group by `date` (already `YYYY-MM-DD`
strings), sum `netStitches` per day, render last 30 active days.

**Reference:** `stats-activity.js` has the existing heatmap/activity chart
patterns to copy the grouping logic from.

**Files to touch:** `tracker-app.js` only

---

### 3. Goal date (reverse projection)

**Where:** A small "Set a goal date" prompt in the project details panel or
alongside the completion projection.

**What it does:** User picks a target finish date → app computes required
stitches/day to meet it and shows "You need ~450 st/day to finish by 1 Jul".

**Data source:** Simple arithmetic on `remaining` stitches and `daysUntilTarget`.
No new storage field required (keep target date in localStorage keyed by project
id, or add an optional `targetDate` field to the project JSON — schema bump to v9).

**Show condition:** Show the required pace as a prompt, not a warning. If the
required pace is less than their recent pace, add a positive note ("you're on
track!").

**Files to touch:** `tracker-app.js`, optionally `helpers.js` for the calc,
`project-storage.js` if adding `targetDate` to the schema.

---

### 4. Tracker header stats row

**Where:** Replace or augment the current "X% complete" text in the tracker
header with a compact stats row visible at a glance without opening the stats
page.

Suggested row (fits on one line even on mobile):

```
47% · 8,421 done · 9,502 to go · ~14 Jun
```

`fmtNum` from `helpers.js` handles the number formatting.

**Files to touch:** `tracker-app.js` only

---

## Implementation order

1. **Add `insights-engine.js` to `stitch.html`** — required for 1, 3, 4 above.
   Confirm script load order matches `create.html` (after `helpers.js`).
2. **Deliverable 4 (stats row)** — purely additive, no new data fetch, ~20 lines.
3. **Deliverable 1 (completion projection banner)** — wire `generateProjections`
   into the tracker's project load callback, render projected text.
4. **Deliverable 2 (mini sparkline)** — new render component, self-contained.
5. **Deliverable 3 (goal date)** — add optional `targetDate` field + reverse calc.

---

## Acceptance criteria

- [ ] Completion date shows in the tracker for a project with ≥1 session
- [ ] "No projection available" state renders nothing (not an error state)
- [ ] Goal date picker updates immediately on change
- [ ] Mini graph shows at least the last 30 active days
- [ ] Stats page `ProjectionCard` is unchanged (no regression)
- [ ] All strings use British English ("colour", "grey", etc.)
- [ ] No emojis — use `window.Icons.*` for any new icons

---

## Estimated scope

| Deliverable | Effort |
|---|---|
| 1. Completion banner | Small (~30–50 lines) |
| 2. Mini sparkline | Medium (~80–120 lines) |
| 3. Goal date | Medium (~60–100 lines + optional schema bump) |
| 4. Stats row | Tiny (~15–25 lines) |
