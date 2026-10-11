# Tracking and Statistics Audit

Audit of the Stitch Tracker and every statistic the site shows (app v1.0.105, commit `cd4e987`).
No application code was changed. Screenshots are in [reports/tracking-audit/](tracking-audit/).

**Method and honesty notes.** Everything marked **Observed** was run in headless Chromium 1194 (Playwright 1.59) against `node serve.js` on localhost. Everything marked **Inferred** comes from reading code only.

- **CDN libraries.** The sandbox blocks cdnjs, so React, ReactDOM and pako were served from the npm packages (same versions) by request interception. Nothing else was altered.
- **Browsers.** Only Chromium was available. Safari and Firefox were **not** tested. Behaviour that depends on WebKit (iOS storage eviction, `beforeunload`/`pagehide` timing, Wake Lock) is inferred from code.
- **Devices.** Touch was emulated (Pixel 5 and iPad Mini profiles, CDP touch events). No real phone or tablet, so real mid-range-phone performance is **not measured**.
- **Clock.** "Today" and midnight tests used Playwright's fake clock (`page.clock`, `Europe/London`, BST) inside one browser context. The system clock and timezone were never changed. Other multi-day history is **synthetic**: sessions were injected into a fixture project's `statsSessions` (dates relative to 2026-10-11), then every figure was recomputed by hand and compared.
- **Fixtures.** All fixtures were generated, not real patterns:
  - Small 40x40, 6 colours.
  - Large 300x300, 64 colours, full coverage.
  - 50x50 with half stitches, quarter stitches, backstitch and French knots.
  - A "history" project: 10 sessions over 25 days, with gaps.
  - A "resized after tracking" project.
  - The three creation paths (converted image, drawn, imported chart) were **not** run end to end. Their tracker behaviour is inferred from the shared load path (`processLoadedProject`), which does not branch on origin.
- **Left behind.** Nothing in the repo except this report and the screenshots. Test data lives in throwaway Playwright profiles under the session scratchpad. The dev server was started by me and should be stopped.
- **Competitors.** Verified where noted from web searches on 2026-10-11 (app-store listings, aggregators). Everything else is from the briefing and marked *unverified*.
- **Creation audit.** `docs/creation-audit.md` does **not** exist. The closest document is [reports/create-flow-audit.md](create-flow-audit.md), which has no finding IDs. Cross-references use its section numbers (for example "create-flow-audit §6.9").
- **Prior tracker audits** exist: `reports/track-mode-ui-audit.md`, `track-mode-ui-redesign-proposals.md`, `mobile-experience-audit.md`. They describe an older UI (for example a "Notes" tab that no longer exists). Everything here was re-verified against the current code.

---

## 1. Summary

Tracking basics are strong. Marking by click, drag and rectangle works; undo works; the legend with per-colour counts is fast; parking and Spotlight exist; and large charts load and mark quickly. The problems are in **trust** (will my progress survive?), **statistics that disagree with each other**, and **phone ergonomics**.

What matters most:

1. **Progress can be lost (Blocker, TRACK-01).** Marks made in the last few seconds before a refresh, tab close or tab kill are lost.
   - Reproduced: mark 10 stitches, reload within 5 s, and the 10 marks are gone.
   - Root cause: the debounced save has no maximum wait, and three code paths write the project record. One of them (`__flushProjectToIDB`, called by the sync engine on every page unload) writes a stale `done` array and, before the first autosave, a record with **no pattern at all**. Reproduced: after marking and reloading within about 0.2 s of opening, the project no longer opened ("Could not load a project").
   - The header meanwhile always says "All changes saved" (TRACK-02).
2. **The numbers do not agree (STATS-01, STATS-02).**
   - On one screen of the special-stitch project, four different "progress" figures appeared (2 done, 4/1,759, 0.2%, "5 st").
   - Completion dates differ between views (13 Oct vs 17 Oct for the same project).
   - Four different pace figures appear (135, 138, 145 stitches/day, and 172 vs 162 stitches/hour).
   - The estimate assumes stitching every single day, so it is optimistic for anyone who stitches three evenings a week.
3. **Time and speed are unreliable for the way people stitch (STATS-03).** Time is the time between taps, capped at 90 s per gap. Someone who stitches ten stitches, marks them, and repeats gets a speed of 300–400 stitches/hour when 100–200 is realistic. Sessions cannot be edited or deleted (STATS-06). Midnight sessions move retroactively (STATS-05).
4. **Backstitch, quarter, petite and long stitches cannot be tracked (TRACK-04).** The Layers panel offers toggles for them, but they have no done state and no counts. Clicking a backstitch silently marks the full stitch beneath it.
5. **Phone and small laptop layout (TRACK-06, TRACK-07, TRACK-08).**
   - At 1440x900 the left legend panel covers the logo and the Create/Edit/Track tabs.
   - In phone landscape only about 11 rows of chart are visible.
   - A natural one-finger swipe in Mark mode marks stitches instead of scrolling.
   - Controls are 40 px, below the usual 44–48 px.
   - At 300x300 "Fit" leaves a third of the chart off-screen, and zoomed out the chart is a blank grid (no colour overview).
6. **The Stats > Activity (calendar) tab crashes the whole Stats page (BUG-01).** It is a hard error ("Identifier 'useState' has already been declared").
7. **Two tabs or devices (TRACK-03).** Conflicts are all-or-nothing ("Reload" or "Keep my edits") and only surface at the next save. Progress is naturally mergeable (union of done cells). There is no cross-device sync except manual or folder `.csync` files, and no backup reminder.

What to keep: one-click resume from Home plus a "Welcome back" recap, the legend with per-colour counts, highlight styles with run-length counting aids, parking, work areas, the cross-tab warning at all, the hand-checkable arithmetic in the project stats page (milestones, streaks, best day, weekly comparison all verified correct), and the generous undo.

---

## 2. Feature map

### 2.1 Where things are

| Surface | File(s) | Notes |
|---|---|---|
| Home "Pick up where you left off" + Resume tracking | `home.html`, `home-app.js` | 1 click to resume. [home-with-project-desktop.png] |
| Tracker page | `stitch.html`, `tracker-app.js` (8.3k lines), `useDragMark.js`, `useStitchCounts.js`, `useAutoSession.js`, `useCanvasOverlays.js`, `work-area.js`, `useWakeLock.js` | Redirects to Home if no active project. `?id=proj_...` deep-links a project (bookmarkable). |
| Left legend panel | `tracker-app.js` (`.lpanel`) | Sort: Remaining / % done / DMC ID. Tap a row to highlight. Per-colour done/total. |
| Right rail | `tracker-app.js` (`.ppal-rail`) | COLOURS, MARK, NAV, FIT, AREA, UNDO, MORE. |
| More panel tabs | `tracker-app.js` | Controls, Highlight (Isolate/Outline/Tint/Spotlight, Counting aids, Skip done), View (Symbol/Highlight/Realistic, zoom, lock detail), Session, Layers (Full/Half/Backstitch/Quarter/Petite/French knot/Long, Row mode), Tools (Mark/Navigate, Section spotlight, Stitching style, Shortcuts, Live tracking (RT)). [track-more-*.png] |
| Progress info popover | `tracker-app.js` info strip | [track-progress-info-history-desktop.png] |
| Resume recap modal | `tracker-app.js` (A3), `helpers.js` `lastSessionSummary` | [track-resume-recap-desktop.png] |
| First-run: welcome tour, "How do you usually work" questionnaire, coach marks | `onboarding-wizard.js`, `coaching.js` | [track-firstrun-tour-*.png] |
| In-tracker Stats (per project) | `components-stats.js` (`StatsContainer`, `StatsDashboard`), `helpers.js` | [stats-project-dashboard-desktop-full.png], [stats-project-phone-full.png] |
| Global Stats page | `index.html?mode=stats`, `stats-page.js`, `stats-activity.js`, `stats-insights.js`, `insights-engine.js` | Tabs: Stitching, Stash, Showcase, Activity (crashes), Insights. [stats-global-*.png] |
| Save and backup | `tracker-app.js` autosave, `project-storage.js` (IndexedDB), `backup-restore.js`, `sync-engine.js` (`.csync`, folder watch), `cross-tab-*.js` | |
| Settings | `preferences-modal.js` (`trackerIdleMinutes` 10, `trackerTimingMode` classic, `trackerActiveGapCapSec` 90, `trackerWakeLock`) | |

### 2.2 Data model

- **Where it lives.** Browser IndexedDB only (`ProjectStorage`, store `projects`, plus meta and stats stores). There is no server and no account. Persistence is requested (`ensurePersistence`). Safari gets an eviction warning toast (`checkSafariEvictionRisk`).
- **A completed full stitch** is `done[idx] = 1` in a `Uint8Array` the same length as the pattern (saved as a JSON array).
- **Half stitches** are `halfStitches` Map plus `halfDone` Map (fwd/bck per cell). Cells that hold only half stitches are `__skip__` in `pattern`.
- **French knots** are `knots` plus `knotsDone` (keys `"x,y"`).
- **Not tracked:** `bsLines` (backstitch), `partialStitches` (quarter/petite). They are drawn only. Beads are dropped at import (`import-formats.js` ~381).
- **Position and view saved:** `savedZoom`, `savedScroll`, `hlRow/hlCol` (guide), park markers, work area, block/focus. **Not restored on load** (`processLoadedProject`): highlighted colour (`setFocusColour(null)`), Mark/Navigate mode, view mode, undo/redo history.
- **History:** `statsSessions[]`, one object per auto-session `{date (local YYYY-MM-DD at session START, shifted by dayEndHour), startTime, endTime, durationSeconds, stitchesCompleted, stitchesUndone, netStitches, totalAtEnd, coloursWorked, note, milestones}`. `stitchLog` is derived from `netStitches` per date at save. `doneSnapshots` holds up to 60 auto daily snapshots of `done` (deflated).
- **Save timing:** an autosave effect (`tracker-app.js` ~3956) sets a 5 s timer whose cleanup runs on every change to `done`, so it is a pure debounce with no maximum wait. Extra writers: `beforeunload`/`pagehide` handler (~4015), `__flushProjectToIDB` (~4087, called by Backup, Sync export/import, Stats refresh, session-note edit and the sync engine's own `beforeunload`), Ctrl+S, "Edit in Creator". Finished sessions are also mirrored to `localStorage` (`cs_pending_session_<id>`) so a closed tab can recover the *session*, but not the stitches.
- **Sessions:** any change in `doneCount + halfDone + knotDone` (a useEffect, ~2330) calls `recordAutoActivity`. This includes bulk "mark colour done", undo/redo, and edit-mode changes. A session closes after 10 idle minutes, on unload, or when the project changes. Active time comes from an event log with three modes (Classic: each gap credited up to 90 s; Batch-friendly: gap cap scales with burst size up to 6x; Manual: wall-clock minus hidden/paused).

### 2.3 Gestures and shortcuts (Mark mode, mouse)

Click toggles; drag paints the first cell's state; Shift+click rectangle; long-press rectangle (touch/mouse); Space+drag or middle-drag pans; Ctrl+scroll zooms; right-click parks; Alt+click moves the spotlight block.

- **Touch, per `tests/e2e/tracker-touch.spec.js`:** one finger marks and drags; two fingers pan and pinch; in Navigate mode one finger pans, a tap sets the guide, press-and-hold parks.
- **Keys:** T/N mode, V view, 1-4 highlight style, [ ] or arrows previous/next colour, J jump to next stitch of the focus colour, C counting aids, S spotlight (Alt+arrows move it), R row mode (Up/Down), F/H/L/K layers, D colour drawer, P pause timer, W work area, +/-/0 zoom, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, Ctrl+S, ? shortcuts.
- **Keyboard marking:** none. Arrow keys move the guide only in Navigate mode.

### 2.4 Statistics inventory

"Verified" means recomputed by hand from the synthetic history (10 sessions, 1,350 of 1,600 stitches; per-day net 100, 120, 90, 200, 150, 80, 110, 60, 300, 140 over 25 elapsed days, 470 min total).

| Statistic | Where shown | How computed (file) | Verified? |
|---|---|---|---|
| "N done · M to go" | Info strip | Full stitches only: `doneCount` vs `totalStitchable` (`tracker-app.js` 1844) | Yes, but ignores half stitches and knots (STATS-01) |
| Progress % (header chip, legend header, popover) | Header, panel, popover | `(done + 0.5*halfDone + knotDone) / (total + 0.5*halfTotal + knots)`, rounded to 0.1 (`tracker-app.js` 1868) | Yes (84.4% = 1350/1600). Differs from the strip when special stitches exist |
| Stats page "84%", "1,350 of 1,600" | Project Stats | `doneCount/totalStitchable` only (props at `tracker-app.js` 6955) | Yes; disagrees with the header % when halves/knots exist |
| Today | Popover, bar accent, goal | Sum of `netStitches` for sessions with `date === today`, plus live session (clamped at 0) | Observed: 38 after marking 38; 0 after the day rolled (STATS-05) |
| This week | Popover, global | Sum from Monday, `getStatsThisWeekStitches` | Yes (440 = 300 + 140) |
| Time spent / Time stitched | Popover, Stats | Sum of session `durationSeconds` | Yes (7h 50m). Meaning is questionable (STATS-03) |
| Average pace / "Speed" | Popover vs Stats | Popover: `done / time`. Stats: sum of session `netStitches` / time | 172 (Stats) vs 162 (popover) after unpicking 80 stitches (STATS-01) |
| Remaining time | Popover | `remaining / pace` ("1 hr 27 min") | Yes (250/172) |
| Est. finish | Stats card | `ceil(remaining / weightedPace14)` calendar days from today. Weighted pace uses the last 14 ACTIVE days, linearly weighted toward recent | Verified: pace 145/day, 2 days, 13 Oct. Assumes stitching every day (STATS-02) |
| "~17 Oct 2026 at current pace / 176 st/hr recently" | Popover, global Insights | Different algorithm in `insights-engine.js` | Disagrees (STATS-02) |
| Avg pace "135/day (10 active days of 25 elapsed)" | Goals panel | Active-day average, toggle to calendar days | Yes (1350/10; calendar 54) |
| RECENT PACE "138 stitches/day across 5 active days" | Global (Stash tab) | `stats-page.js` window | A third pace figure |
| Milestones 10/25/50/75/100% with dates | Stats | `getMilestones`: first session where `totalAtEnd >= floor(total*pct)`; future dates from avg pace | Yes (18 Sep, 24 Sep, 2 Oct, 8 Oct, ~13 Oct) |
| Streaks current/longest | Stats, global | `computeStreaks` over session dates | Yes (1 / 3). Counts a day with net 0 or negative as active |
| Best day, Avg session | Stats | max of per-date net; mean duration | Yes (300 on 8 Oct; 47m) |
| This week vs last week (stitches, time, st/hr, days active) | Global | `insights-engine.js` | Yes (440 vs 250 = +76%; days 2/7, -1) |
| Weekly streak | Global | week buckets | Yes (4 weeks) |
| Per-colour done/total, Colour Progress, "Most/Least remaining" | Legend, Stats | `colourDoneCounts` | Yes. Half/knots shown as separate "0/10 half" fragments; quarter-only colour shows 0/0 |
| Colour timeline | Stats | `coloursWorked` per session | Empty for sessions without that field. "~1 sessions" grammar |
| Sections (50x50 grid) | Stats | counts per block | Observed |
| Daily/Cumulative/Speed/Calendar chart, What-if pace | Stats | `StatsChartSection` | Rendered; hover behaviour not tested |
| Goals daily/weekly/monthly, target date | Stats, global | `GoalTracker`, celebration toasts | Rendered; optional ("Clear goal") |
| Lifetime stitches, "≈ 0 km of thread", Projects "0 / 1" | Global Showcase | `stats-page.js` | "0 / 1" is unexplained |
| Share text / CSV / progress image / year cards | Stats, global | `generateShareText`, `downloadCSV`, `drawProgressCard`, `ShareCardModal` | Streak missing on the image (BUG-02) |
| Resume recap ("187 st/hr, 16/hr faster than your average") | Modal on open | `lastSessionSummary` | Yes, compares with average excluding the last session |

---

## 3. Findings

Severity: Blocker = cannot track or loses progress; Major = significant confusion, wasted effort or incorrect statistic; Minor; Polish. Effort: S under 1 day, M 1–4 days, L over 4 days.

### TRACK-01 — Marked stitches can be lost on refresh, tab close or tab kill (Blocker)

- **Where:** `tracker-app.js` autosave effect (~3956), unload handler (~4015), `__flushProjectToIDB` (~4087); `sync-engine.js` ~1850 (`beforeunload` calls `writeSnapshot`, which calls `__flushProjectToIDB`).
- **Affects:** every screen size, mouse and touch. Chromium observed; iOS Safari and Android tab-kill inferred, and likely worse because mobile browsers freely kill background tabs.
- **User experience:**
  - A stitcher marks a block, then switches app, closes the tab, or hits refresh. The block is gone on return. A phone user who marks continuously and then locks the screen can lose the whole run.
  - **Observed (a):** mark 10, wait 6.5 s (saved), mark 10 more, reload at once: 10 done after reload, expected 20.
  - **Observed (b):** hard-close the page less than 1 s after marking: the marks were not in IndexedDB.
  - **Observed (c):** calling `__flushProjectToIDB()` right after marking left IndexedDB at the last autosave's `done` (10, strip showed 20). Backup and `.csync` export both flush first and then read the database, so exports silently omit recent marks.
  - **Observed (d), data loss:** open a project, mark, and reload within about 0.2 s. The stored record had `hasPattern:false`; the tracker then showed an empty "Load Project" screen and the console warned `Could not load a project on mount … hasPattern:false`. A 5 s autosave heals this if the tab lives that long. If the tab dies first, the pattern and progress are gone from the browser store (a backup is the only recovery).
- **Why:**
  - `__flushProjectToIDB` builds `{...lastSnapshotRef.current, …}`. It never sets `pattern`, `done`, `bsLines`, `statsSessions`, `parkMarkers` and similar fields. They come from the previous autosave snapshot, or are missing if none exists yet.
  - On unload two writers race (the tracker's `ProjectStorage.save` with fresh data, and the sync engine's flush with stale data); the last IndexedDB commit wins.
  - The 5 s timer is cleared and restarted by every `done` change, so continuous marking means nothing is saved until a 5 s pause.
- **Users:** all three, worst for the regular and power user working in long runs.
- **Evidence:** Observed (above), plus code.
- **Competitors:**
  - StitchGrid: "instant crash-safe saving" (briefing, unverified).
  - Stitchwork: per-stitch sync that merges offline edits (listing, verified as a developer claim).
  - Pattern Keeper: state saved as stitches are marked (briefing, unverified).
- **Recommendation:**
  1. Make persistence of `done` immediate and tiny: on every committed mark, write only `done` (or an append-only list of changed indices) to a small dedicated IndexedDB record, throttled to about 250 ms with a maximum wait of 2 s. Keep the full 5 s snapshot for everything else.
  2. Rewrite `__flushProjectToIDB` to call `buildSnapshotRef.current()` and save the result, or delete it and make callers await a single `saveNow()`. Never spread a stale snapshot.
  3. Add a `visibilitychange` (hidden) save, which is the reliable mobile hook.
  4. Remove `sync-engine`'s unload flush for the tracker, or make it a no-op when the page owns its own unload save.
  5. Add a max-wait to the debounce (for example 10 s).
- **Alternatives:** (a) Keep one full save but add `navigator.sendBeacon`/`localStorage` journal of `done` deltas replayed on load (cheap, covers kill during write). (b) Move to per-cell write-ahead log. I would choose the dedicated `done` record plus the visibility hook.
- **Acceptance:**
  - Automated test: mark 10, reload at +0.2 s, strip shows 10. Mark 10, `page.close({runBeforeUnload:false})` at +0.3 s, reopen, 10 present. Open and reload at +0.2 s, project still opens.
  - After `__flushProjectToIDB()`, IndexedDB `done` equals the strip.
  - Backup taken right after marking contains the marks.
- **Storage change:** adds a new small record or store, with no change to the existing project schema. Migration: none (absent record means use the project's `done`). Existing history is untouched.
- **Effort:** M. The write path is localized, but the race needs careful tests.
- **Dependencies:** TRACK-02, TRACK-03.

### TRACK-02 — The save badge always says "All changes saved" (Major)

- **Where:** `header.js` `SaveStatusBadge` (the Creator drives a state machine; `tracker-app.js` never passes `saveStatus`), `tracker-app.js` autosave catch blocks.
- **Affects:** all sizes. Observed (badge text unchanged immediately after marking while IndexedDB was unchanged; also unchanged while the "changed in another tab" dialog was up) plus code.
- **User experience:** the badge claims safety during the 5 s dirty window, during a failed write (errors only go to `console.error`) and during a cross-tab conflict. A stitcher cannot judge whether it is safe to close the tab.
- **Users:** all.
- **Competitors:** Stitchwork shows sync state across devices (briefing, unverified). The Creator on this same site already has Editing… / Saving… / Saved Ns ago / Save failed with Retry; reuse it.
- **Recommendation:** wire the tracker to the same `saveStatus/savedAt/saveError/onRetrySave` props. Show "Saving…" while the dirty timer or a write is pending, "Saved just now" afterwards, and an error state with Retry. Keep it one small chip; on phone show only the icon plus an aria-label.
- **Acceptance:** after a drag, the badge shows pending then saved within 6 s; with IndexedDB write forced to fail, it shows "Save failed" with Retry; in the conflict dialog it shows an unsaved state.
- **Storage change:** none. **Effort:** S. **Dependencies:** TRACK-01.

### TRACK-03 — Two tabs/devices, and "progress lives in this browser" (Major)

- **Where:** `cross-tab-coord.js`, `cross-tab-resolution.js`, `project-storage.js` `saveChecked`, `sync-engine.js`, `backup-restore.js`.
- **Affects:** desktop most; every device for the "other device" case. Observed on two Chromium tabs.
- **User experience:**
  - The second tab silently runs on stale state. In my run, tab B showed 0 done while A had saved 10, with no notice.
  - The warning appears only when B itself saves, 5 s or more after its next mark: "Project changed in another tab … Reload … or keep your current edits (your next save will overwrite the remote version)". The choice is all-or-nothing, although `done` from two tabs can be unioned.
  - Across devices there is no automatic sync. The options are manual `.csync` export/import, a watched folder (Chromium File System Access only), or full backup. Clearing site data or private windows start empty. The only reminders are the Safari eviction toast and the File menu items.
  - There is no "last backup" timestamp or reminder.
- **Users:** regular and power users with a phone plus a tablet or computer.
- **Evidence:** Observed (tabs); code (storage, backup).
- **Competitors:** Stitchwork merges per-stitch edits made offline and syncs via iCloud (verified listing claim). Cross Stitch Saga has no sync claim in the listing (unverified). ClickStitch (web) stores locally (unverified).
- **Recommendation:**
  1. On conflict for tracking fields, auto-merge: `done = old OR new` per cell, `halfDone`/`knotsDone` union, `statsSessions` union by `id`, and tell the user ("Merged 12 stitches from another tab"). Keep the dialog only for non-mergeable fields.
  2. Detect staleness earlier: the `cs-project-changed` BroadcastChannel message already exists; show a non-blocking banner as soon as another tab saves, with a "Refresh" action, rather than waiting for the local save.
  3. Add a "Back up now / last backed up N days ago" line to the badge menu and a gentle reminder after N days of activity (dismissable).
- **Alternatives:** make the second tab read-only with a banner (simple, but frustrating on an iPad where tabs stack up). I would choose merge.
- **Acceptance:** tab A marks 10, tab B marks 5 different cells, both saved. After merge the project has 15 and no dialog appears. A stale tab shows the banner within 1 s of A's save.
- **Storage change:** none for tracking merge. A `lastBackupAt` preference is new. **Migration:** none.
- **Effort:** M. **Dependencies:** TRACK-01, TRACK-02; cloud sync is out of scope (see Open questions).

### TRACK-04 — Backstitch, quarter, petite and long stitches cannot be tracked (Major)

- **Where:** `tracker-app.js` (`bsLines` drawn at ~4479; `partialStitches` drawn only; Layers panel lists Backstitch, Quarter, Petite, Long Stitch toggles with fixed zero counts, `layerCounts` ~1938); `useStitchCounts.js`. Beads are dropped at import (`import-formats.js` ~381).
- **Affects:** every screen and input; any pattern with those stitches. Observed (special-stitch fixture).
- **User experience:**
  - Clicking a backstitch line marks the full cross stitch underneath it (observed: "1 done").
  - Clicking a quarter-stitch cell does nothing (observed, no change in counts).
  - A colour used only in quarter stitches shows "0/0" with a Done button that does nothing.
  - Backstitch has no done state, no count, no per-thread remaining, and no "backstitch left" figure. Progress percentages therefore reach 100% with backstitch undone, the exact failure the community reports (Pattern Keeper users "forgot backstitch", per `docs/competitive-analysis.md`, unverified).
- **Users:** power and first-time users (backstitch is in most pictorial charts).
- **Evidence:** Observed.
- **Competitors:**
  - Stitchwork: tappable backstitch (briefing, unverified).
  - Cross Stitch Saga: supports backstitch, half, quarter, petite, long stitch, French knots and beads (verified from the store listing, third-party aggregators).
  - Markup R-XP: marks full and fractional stitches and backstitch (briefing, unverified).
  - Pattern Keeper: no backstitch; fractional stitches only tentatively in a 2025 beta (verified via store listings). That is a gap this site can win on.
- **Recommendation:**
  - Add `bsDone` (set of line indices or ids) and `partialDone` (per cell+corner). Count them as stitches in a separate "Backstitch 12/40 lines" and "Fractional 6/18" row, not mixed into the full-stitch percentage (see STATS-01 for the single definition of "progress").
  - Marking:
    - Backstitch: a "Backstitch" layer/mode where taps snap to the nearest line (use a 14–20 px hit tolerance, larger on touch), drag along a line to mark runs, and a "mark all backstitch of this colour" legend action.
    - Quarter and petite: tap the quadrant, like half stitches today (`hitTestHalfStitch`).
  - Desktop, tablet and phone: the same interaction; on touch show a magnified loupe as the Creator does (`creator/` touch magnifier, `tests/e2e/creator-touch-magnifier.spec.js`) because backstitch lines are 1–2 px wide.
- **Alternatives:** (a) group backstitch per colour and mark colour-wide only (cheap, matches how many people work backstitch last); (b) per-line marking (precise). I would build (a) first, then (b).
- **Acceptance:** worked example: a pattern with 8 backstitch lines of thread 310; mark 3; the legend row for 310 reads "3/8 lines", the progress panel shows "Backstitch 3/8", and after reload the same. Clicking a backstitch no longer marks the cross stitch under it.
- **Storage change:** new optional fields `bsDone`, `partialDone` on the project (version stays 11, like `knotsDone`). Old builds ignore them. **Migration:** none; past statistics unaffected (past sessions simply have no backstitch counts).
- **Effort:** L (hit testing, painting, undo entries, counts, sync merge). **Dependencies:** STATS-01; `create-flow-audit` §2 for how backstitch is created.

### TRACK-05 — Resume restores position, but not the working context; first open stacks dialogs (Minor)

- **Where:** `processLoadedProject` (restores zoom, scroll, guide, parking, work area; resets `focusColour`, mode, view, undo history), `onboarding-wizard.js`, `coaching.js`.
- **Affects:** all. Observed.
- **User experience:**
  - Resume is 1 click from Home (good), but a returning by-colour stitcher must re-pick the colour, highlight style, mode and view.
  - The 50-step undo is lost on reload.
  - First open stacks a welcome tour, a "How do you usually work through a pattern?" dialog and coach marks. The first click on the chart can be absorbed by a modal (I hit this in testing). The resume recap appears on every project open, so it needs a click ("Continue stitching") before marking.
- **Users:** regular and power.
- **Competitors:** Cross Stitch Saga auto-jumps between colours after marking (verified listing wording: "jump automation between colors after marking").
- **Recommendation:** persist `focusColour`, `stitchMode`, `stitchView`, highlight style per project (small fields in the project or per-project localStorage, as `cs_layerVis_` already does). Make the recap a non-blocking banner that auto-dismisses on the first mark, or let the Home "Resume" skip it. Collapse the three first-run dialogs into the existing coach marks.
- **Acceptance:** highlight 666, close tab, reopen via Resume: 666 is still highlighted and the chart is at the same place; first tap marks a stitch even with the recap showing.
- **Storage change:** optional new fields; no migration. **Effort:** S.

### TRACK-06 — The left legend panel covers the global navigation at laptop widths (Major)

- **Where:** `.lpanel` (fixed, 320 px, full height) vs the centred header; `styles.css`. Banners also start under the panel (the "Highlight mode" hint was clipped to "ounting aids").
- **Affects:** desktop windows around 1024–1900 px with the panel open (it is open by default). Observed at 1440x900 and 1024x768; at 1920 the header content clears it. [track-small-layout-1440.png], [track-small-layout-1920.png].
- **User experience:** the logo (the route to Home), Create, Edit and the active "Track" tab are hidden ("ck" shows). Users resort to the project switcher or File menu to leave.
- **Users:** regular and power users on laptops.
- **Recommendation:** make the header and main column offset by the panel width when it is open (shared layout variable), or start the panel below the 48 px header. Keep the hint banners inside the main column.
- **Acceptance:** at 1440x900 and 1024x768 with the panel open, Create/Edit/Track and the logo are visible and clickable.
- **Storage change:** none. **Effort:** S.

### TRACK-07 — Small-screen layout leaves little room for the chart; targets are small (Major)

- **Where:** header (48 px), info strip, hint banner, chart (`.tracker-chart-scroll`, fixed 600 px high), dark hover bar, "Tap any stitch" hint bar, floating "Palette" button and rail; `styles.css`.
- **Affects:** phone (portrait and especially landscape), small tablets. Touch. Observed on Pixel 5 and iPad Mini emulation. [track-small-phone-landscape.png], [track-small-phone-portrait.png].
- **User experience:**
  - Phone landscape (851x393): about 11 chart rows visible; the chart box is 600 px high (taller than the viewport) so the page scrolls instead.
  - The floating rail covers the right-most columns; the "Palette" pill overlaps the hint banner; the save badge is clipped.
  - All rail controls are 40x40 (the close-controls button is 21x21).
  - At default zoom a stitch is 19 CSS px on the phone, less than half the 44 px target guidance (chart cells are necessarily small; see TRACK-08 for protection).
  - Desktop 1440x900: the chart box is 600 px in a 900 px viewport, with about 130 px of hint bars below it.
- **Users:** regular users with a phone or tablet beside the work; first-time users.
- **Competitors:** Pattern Keeper and Cross Stitch Saga are full-screen charts with an on-demand tool strip (briefing, unverified). Browser canvas apps (maps, whiteboards) size the canvas to the viewport (`100dvh`) with overlay controls.
- **Recommendation:** size the chart box to the remaining viewport (`100dvh` minus chrome). Add a "Stitching focus" state (the existing F "Focus" chip) that collapses header, info strip and banners to a single thin progress line, and make it the default on phone. Auto-hide the three hint banners after the first successful mark. Raise rail targets to 44 px, and place the rail left/right per handedness preference. Keep banners out of the chart area.
- **Acceptance:** at 393x727 portrait chart height at least 65% of viewport; at 851x393 landscape at least 50% with Focus on; no rail overlap of the last column (chart gets right padding equal to the rail width); all controls at least 44x44 px.
- **Storage change:** none (a handedness pref is optional). **Effort:** M. **Dependencies:** TRACK-06; `reports/mobile-experience-audit.md` covers related items.

### TRACK-08 — A natural one-finger swipe marks stitches; no protection from accidental touches (Major)

- **Where:** `useDragMark.js`, `tracker-app.js` touch handlers; Mark vs Navigate toggle.
- **Affects:** phone and tablet, touch. Observed: a 120 px one-finger vertical swipe in Mark mode marked 7 stitches and did not scroll the chart.
- **User experience:** this is the designed behaviour (one finger marks, two fingers pan), documented only in a hint banner that disappears. A user who instinctively swipes to scroll, or rests a palm or needle hand on the screen, gets a trail of marks. Undo exists (Undo button shows "N steps"), but the 50-step history is lost on reload (TRACK-05) and a bulk mark that merges with real marks is hard to untangle.
  - Mitigations that exist: a "Mark/Navigate" mode switch; `touch-constants.js` slop; two-finger gestures.
  - Missing: an "accidental touch lock", a minimum drag-start distance before painting, and undoing by time.
- **Users:** first-time user most; also regular user one-handed.
- **Competitors:** Stitchwork "tap or drag to mark" plus "quick-park mode"; StitchGrid "paint mode" as an explicit mode for whole rows (briefing, unverified). Pattern Keeper separates scroll and mark (briefing, unverified). Knitting row counters use big explicit buttons to avoid accidents (adjacent).
- **Recommendation:**
  - On touch, require a short press before drag-painting begins (about 120 ms or 8 px of movement along the same row) so ordinary swipes scroll natively.
  - Add an explicit "Paint" mode for fast runs, with a visible indicator.
  - Add a "Lock touches" toggle (hold to unlock) for when the device is propped up.
  - Show an "Undo N stitches" toast after any single gesture that marks more than 5 cells.
- **Alternatives:** make Navigate the default on phones and Mark an explicit mode (simple, but adds a tap per session). I would choose the press-to-paint hold plus the toast.
- **Acceptance:** a 120 px swipe in Mark mode marks 0 stitches and scrolls the chart; press-hold-drag across 5 cells marks 5; Lock touches blocks marks until released.
- **Storage change:** none. **Effort:** M. **Dependencies:** TRACK-05 (persisted undo is a plus).

### TRACK-09 — Done vs not done is faint, zoomed-out views are blank, and "Fit" does not fit (Major)

- **Where:** chart rendering (`tracker-app.js` `drawStitch`, detail tiers `computeDetailTier`), `fitSZ`, Colour/Realistic views.
- **Affects:** all sizes; worst at large patterns and phones. Observed. [track-small-rect-desktop.png], [track-large-fit-desktop.png], [track-highlight-colour-desktop.png].
- **User experience:**
  - In Symbol view a done stitch is a faint green wash behind the same black symbol; at 19 px cells, done and not-done blocks are close in tone and rely on colour alone. Pattern Keeper-style "done turns to colour" is only available in the Colour/Realistic views.
  - On the 300x300 pattern, "Fit" gives 3 px cells: the chart is a blank grid ("To see symbols, you may need to zoom in"), with no colours and no visible progress. There is no minimap, so orientation depends on grid numbers.
  - "Fit" fits the width only: the content is 933 px tall in a 600 px box, so a third of the pattern is below the fold.
- **Users:** power user most; first-time user (cannot see what is left).
- **Competitors:** Pattern Keeper: finished stitches turn to colour so the screen can be compared with the fabric (briefing, unverified); Stitchwork: live completion percentage (briefing). Map viewers use minimaps and level-of-detail colour tiles (adjacent).
- **Recommendation:**
  - Add a done style that is not colour-only: either fill the cell with its thread colour while the symbol dims, or add a corner tick. Make it selectable in View.
  - At low zoom draw each cell as a solid thread-colour pixel (done bright, not-done desaturated) instead of an empty grid.
  - Add a corner minimap showing the same colour/progress pixels plus the viewport rectangle; tap or drag to jump.
  - Make Fit contain both axes.
- **Acceptance:** at 300x300 Fit shows the full pattern in colour with done areas visibly brighter; a screenshot with 20% marked is distinguishable in greyscale; the minimap viewport rectangle tracks scrolling.
- **Storage change:** none (view prefs only). **Effort:** M–L (rendering tier plus minimap). **Dependencies:** `reports/track-view-performance-plan.md` for rendering constraints.

### TRACK-10 — Keyboard and screen-reader parity is partial (Minor)

- **Where:** `handleStitchKeyDown` (guide only in Navigate), shortcut registry, `shortcuts.js`.
- **Affects:** desktop keyboard users, assistive tech. Inferred from code (not tested with a screen reader).
- **User experience:** there is no keyboard way to mark the stitch under the guide; arrow keys mean three things (previous/next colour, row mode up/down, guide movement) depending on mode. A live region announces the guide position (good). Not verified: focus visibility and contrast of the rail and legend; the legend rows are the only discoverable keyboard path to a colour.
- **Recommendation:** in Navigate mode (or when the chart has focus) let Enter/Space toggle the stitch at the guide, Shift+Enter fill rectangle to the previous guide; keep arrows for the guide when the chart is focused and [ ] for colours only; add the new keys to `trackerShortcuts` and `help-drawer.js` (`tests/helpDrawerShortcutsSync.test.js` will enforce the sync).
- **Acceptance:** a keyboard-only user can move the guide, mark, undo, and cycle colours without a pointer; announcements read row, column, thread and done state.
- **Storage change:** none. **Effort:** S–M.

### TRACK-11 — Screen stays awake only if the user finds an unlabeled chip (Minor)

- **Where:** `useWakeLock.js`; chip in More > Controls labelled "Sleep"/"Awake".
- **Affects:** phone and tablet. Inferred from code (Safari and Android wake-lock support not tested).
- **User experience:** wake lock is off by default and not tied to a session. The chip text names the current state ("Sleep" means screen may sleep), which reads like an action. Stitchers glance at the screen from a distance and the screen dims mid-row.
- **Competitors:** knitting row counters keep the screen on while open (adjacent, unverified).
- **Recommendation:** on touch devices, request the lock automatically when the first stitch of a session is marked (with a one-time toast "Screen will stay on while stitching; change in Preferences"), release it on session end or hidden tab; label the chip "Keep screen on".
- **Acceptance:** after the first mark on a tablet with Wake Lock support the chip shows on, and re-acquires after the tab returns to visible.
- **Storage change:** none. **Effort:** S.

### TRACK-12 — Editing the pattern after tracking can silently wipe progress (Major)

- **Where:** `processLoadedProject` (`project.done.length === restored.length` else a zero array), `creator/useProjectIO.js` (alert "Editing the pattern here will reset your stitching progress"), `creator/useCreatorState.js` ~1890 (confirm on regenerate), resume recap.
- **Affects:** all sizes. Observed with a project whose pattern was resized after 1,350 stitches (simulated by changing pattern length; the Creator's own remapping was not exercised, so the Creator-side behaviour is inferred).
- **User experience:** after the size change the tracker opened with 0 done and **no message**; the resume recap still said "82% – 1,350 / 1,640 stitches"; the next autosave overwrote `done` with zeros (observed `done:0` with 10 sessions intact), leaving history that says 1,350 stitches while the grid says 0. The Creator warns up front via `alert()`, but there is no "keep my progress" path for size-preserving or additive edits that could be remapped (crop, add row).
- **Users:** power user (large long-running pieces).
- **Evidence:** Observed (load path), code (Creator side).
- **Recommendation:** when `done.length` mismatches, do not silently zero. Show a blocking dialog "This pattern changed since you last stitched it. Keep progress where cells still match / Start progress again / Open the previous version", and save the old `done` in `doneSnapshots` before overwriting. In the Creator, remap `done` on crop/add-row/resize (offset map), and replace the `alert()` with the site's modal.
- **Acceptance:** adding a row at the bottom keeps all 1,350 marks; cropping a column removes only the cropped cells' marks; a mismatched load never saves zeros without a confirmation, and the old state is recoverable from a snapshot.
- **Storage change:** uses existing `doneSnapshots`; no schema change. **Migration:** none.
- **Effort:** M. **Dependencies:** create-flow-audit §6.9 (no back path), §6.8.

### TRACK-13 — No bulk "unpick this area" and thin guidance for frogging (Minor)

- **Where:** `useDragMark.js`, rectangle (shift/long-press) toggles, `markColourDone`, Undo.
- **Affects:** all. Code plus the e2e specs (inferred; observed unmarking by clicking, drag and Ctrl+Z).
- **User experience:** unmarking is available (click, drag, Mark-colour "Undo" button, Ctrl+Z, 50 steps), but there is no "mark this area for frogging, then clear in one step". Unpicking a section from an earlier day is possible but its effect on statistics is invisible (STATS-04).
- **Competitors:** Stitchwork: mark an area for frogging and clear it in one step (verified listing claim). StitchWIP logs frog entries so history stays accurate (verified from search listing).
- **Recommendation:** add "Unpick area" to the rectangle bar (with Park and Cancel): it unmarks the rectangle and records the frogging as its own session event, shown in the journal ("Unpicked 80 stitches"). Keep it in the existing rectangle bar so no new mode exists.
- **Acceptance:** drawing a rectangle over 80 done stitches and choosing Unpick area clears them in one undo step; the journal lists "Unpicked 80".
- **Storage change:** sessions gain an optional `kind:"frog"`; old sessions unaffected. **Effort:** S–M. **Dependencies:** STATS-04.

### TRACK-14 — No project-level notes or progress photos (Minor, expected by some users)

- **Where:** none. The only note facility is a per-session note (`NoteEditor`, `editSessionNote`).
- **Affects:** all. Inferred (searched the tracker and stats code; the older audit mentioned a Notes tab that is no longer present).
- **User experience:** stitchers cannot keep a note such as "using 2 strands, fabric 14ct antique white" or a photo of progress with the project.
- **Competitors:** Markup R-XP stores keys, reference pictures and notes with each project; StitchWIP has progress photos (briefing, unverified).
- **Recommendation:** a project Notes field and an optional photo strip in the existing `blob-store.js`; show a count on the Session tab. Low priority.
- **Acceptance:** a note and one photo survive reload and backup/restore.
- **Storage change:** new optional `notes`, and photos in the existing blob store (included in backup). **Effort:** M.

### STATS-01 — "Progress" is defined four ways, so the numbers on one screen disagree (Major)

- **Where:** `tracker-app.js` 1844–1875 (strip uses full stitches only; % uses half = 0.5 and knots = 1), 2330 (sessions count each half and knot as 1), 6955 (Stats page gets full stitches only), `components-stats.js`.
- **Affects:** all sizes. Observed in the special-stitch project after marking 2 full stitches, 2 half stitches and 1 knot:
  - Info strip: "2 done · 1,740 to go".
  - Progress popover and header %: "4 / 1,759 (0.2%)".
  - Session chip: "5 st"; popover "Today 5".
  - Per-project Stats page percent: full stitches only (84% in the history project would read the same only because it has no halves).
- **Why it is a problem:** a stitcher cannot tell how far along they are. "Today 5" does not match "4 done". A half stitch counts 0.5 in progress, 1 in the day's count and 0 in "done". Backstitch and quarter stitches count nowhere (TRACK-04).
- **Users:** power user (patterns with halves and knots), regular user.
- **Evidence:** Observed.
- **Competitors:** Stitchwork: live completion percentage and per-symbol remaining counts; Pattern Keeper: stitches today and total, remaining per thread (briefing, unverified; Pattern Keeper store listing verified for the tally feature).
- **Recommendation:** define one `progressUnits` function: total = full + half + quarter + petite + knots + backstitch lines, each weighted by an agreed work factor (for example full 1, half 0.5, quarter 0.25, knot 1, backstitch by length in half-cell units), and use it everywhere: strip, header, popover, Stats page, sessions, share text. Show the headline as one figure (percent) with a short breakdown ("Full 1,350/1,600 · Half 10/30 · Knots 1/2"). Document the weights in the help drawer. Record sessions in the same units (and keep raw counts per type).
- **Worked example for acceptance:** project with 1,742 full, 30 half, 2 knots; mark 2 full, 2 half, 1 knot. Units total = 1,742 + 15 + 2 = 1,759; done = 2 + 1 + 1 = 4. Strip, header, popover and Stats page all read 4 / 1,759 (0.2%); the day total reads 4 (not 5).
- **Storage change:** none to `done` data. **Migration:** old sessions store a single `netStitches` that mixed units (halves counted as 1). They can be left as-is (history is not recomputable exactly; new `units` field on new sessions, old sessions use `netStitches`). Past statistics are kept but slightly approximate for projects with halves.
- **Effort:** M. **Dependencies:** TRACK-04.

### STATS-02 — Completion estimates disagree, hide their basis and assume stitching every day (Major)

- **Where:** `helpers.js` `computeOverviewStats`/`computeWeightedPace` (Stats "Est. finish"), the progress popover's "~17 Oct at current pace / 176 st/hr recently" and `insights-engine.js` `generateProjections` (also the global Insights card), global RECENT PACE (`stats-page.js`).
- **Affects:** all sizes. Observed on the history project:
  - Stats "Est. finish 13 Oct 2026 (~2 hrs stitching)" and the milestone "100% ~13 Oct"; popover and global Insights "~17 Oct 2026"; "Remaining 1 hr 27 min" in the popover vs "~2 hrs" in Stats.
  - Pace appears as 135/day (Goals, active-day average), 145/day (weighted, drives Est. finish), 138/day (global RECENT PACE), 176 st/hr (popover recently) and 172 st/hr (overall).
  - After unpicking 80 stitches the dates moved (14, 18, 19 Oct) without the user understanding why.
- **Why it is a problem:**
  - The finish date uses stitches per active day but converts it into calendar days as if the user stitched daily. By hand: this stitcher worked 10 of 25 days (0.4 days per day), so 250 remaining stitches at 145/day is 2 stitching days, about 5 calendar days at that cadence, not 2.
  - Nothing says what the estimate is based on.
  - Early in a project (30 stitches in the midnight test) it shows "2 Dec 2026, ~4 hrs" from a single 5-minute session.
- **Users:** regular and power.
- **Competitors:** Cross Stitch Journal: "estimate of stitching days remaining" (briefing, unverified); Stitchwork: progress tab with pace and time estimates (briefing, unverified); Cross Stitch Saga: calendar and stats (verified listing).
- **Recommendation:** one estimator (a shared function) returning `{stitchesPerStitchingDay, stitchingDaysPerWeek, daysRemainingCalendar, basis, confidence}`. Convert using the recent frequency (stitching days in the last 28 days / 28), say it in one line ("Based on your last 4 weeks: 3 stitching days a week, 145 stitches per day"), show a range (optimistic/likely) and hide the estimate until at least 3 stitching days or 5% progress. Replace the other copies by calling it.
- **Worked example for acceptance:** history project: 10 active days in the last 25 and 250 remaining. With 145 stitches/active day and 10/25 = 0.4 stitching days per day, expected "about 5 days (around 16 Oct)" (2 stitching days divided by 0.4) wherever the estimate appears, and a project with fewer than 3 stitching days shows "Not enough history yet".
- **Storage change:** none. Estimates are recomputed from existing sessions. **Effort:** M. **Dependencies:** STATS-03.

### STATS-03 — Time and speed measure "time between taps", which misleads people who mark in batches (Major)

- **Where:** `tracker-app.js` 706–845 (`computeActiveMs*`), `useAutoSession.js`, prefs `trackerTimingMode` (classic), `trackerActiveGapCapSec` (90), `trackerIdleMinutes` (10); Stats "Session timing" setting.
- **Affects:** all. Observed (midnight test) plus code.
- **User experience:** Classic mode credits at most 90 s per gap between marks. A realistic stitcher works ten stitches (several minutes), then marks them: every ten-stitch burst earns 90 s, a speed of 400 stitches/hour. Observed: 30 stitches marked over a 22-minute span became "Active time 5m" and "Speed 400/hr". Typical hand speed is closer to 100–250/hr, so all derived estimates (remaining hours, finish date, "faster than your average") are about two to three times too optimistic. The three modes exist but the default is the misleading one; "Manual timer" has no visible start/stop timer in the Session panel (only "No active session. Stitching automatically starts a session"). The chip is a small "▷ 0m · 38 st · Classic".
- **Users:** regular and power.
- **Competitors:** Cross Stitch Journal: a built-in start/stop timer; Cross Stitch Saga: timed sprints; StitchWIP: sessions with time, stitch count and notes (briefing, unverified; StitchWIP listing seen in search).
- **Recommendation:** give the session an explicit, visible Start/Pause/Stop with elapsed time (the "p" shortcut and chip exist), make "Timer-based" the stated basis when it is used, and make the default for time estimates the session wall-clock between first and last mark plus the user's end-of-session confirmation ("You stitched for 46 min — edit"). Keep auto-sessions as a fallback and label the figure "estimated". Show speed only when time is timer-based or edited.
- **Alternatives:** keep auto timing but default to Batch-friendly and widen the cap. Less honest; I prefer the explicit timer.
- **Acceptance:** with the explicit timer running for 20 minutes and 30 stitches marked, Stats shows 20 min and 90/hr; with auto timing the figure carries an "estimated" label.
- **Storage change:** none for sessions (they already store `startTime`, `endTime`, `durationSeconds`, `timingModeUsed`). **Migration:** none; past sessions keep their durations (they remain classic-estimates and can be edited, see STATS-06).
- **Effort:** M. **Dependencies:** STATS-06.

### STATS-04 — Unpicking is invisible, and sessions can record negative days (Major)

- **Where:** `useAutoSession.js` (clamp for display only), `helpers.js` (daily totals sum `netStitches`), streaks.
- **Affects:** all. Observed (live) plus code.
- **User experience:** after unmarking 80 stitches from earlier days, the popover showed "Today 0" (clamped), progress went to 79.4%, but the Stats page "Speed" stayed 172/hr while the popover said 162; once the session finalises its `netStitches` is -80 (inferred from `finaliseAutoSession`, not observed finalised), so "Today" or "Best day" or weekly totals can go negative, and a day of only unpicking still counts toward streaks.
- **Users:** power user.
- **Recommendation:** keep `stitchesUndone` as unpicked, but separate it: Today = stitches added today (never negative); show "Unpicked 80" as its own line; compute speed from additions only; do not count an unpicking-only day as an active day.
- **Worked example for acceptance:** a day with +50 and -80: Today +50, "Unpicked 80", progress -30 net; streak counts the day only because of the +50.
- **Storage change:** none (both numbers already stored). **Effort:** S. **Dependencies:** STATS-01.

### STATS-05 — Sessions crossing midnight, and "today" differs between views (Major)

- **Where:** `useAutoSession.js` `getStitchingDateLocal` (documented: "Cross-midnight sessions are attributed to the day they started"), `helpers.js` `getStatsTodayStitches`, global stats (`stats-page.js`, `stats-insights.js`, `insights-engine.js` do not use `dayEndHour`).
- **Affects:** all; evening stitchers. Observed with the fake clock (Europe/London): marks at 23:50, 23:54 and 00:02 in one session. At 00:02 the popover said "Today 30"; after the session closed, the journal listed all 30 under "Yesterday" and Today reverted to 0.
- **User experience:** today's count changes retroactively; stitches made at 00:02 appear on yesterday's bar and streak. The "Day ends at" setting (Stats, bottom) exists but is buried at the end of a 4,000 px page, and the global pages ignore it for "today" (inferred).
- **Users:** regular user who stitches late.
- **Competitors:** StitchWIP and Cross Stitch Saga calendars attribute by day; the briefing gives no detail on midnight handling (unverified).
- **Recommendation:** split a session at the day boundary (two records sharing a group id) or attribute stitches by their own timestamp (each `stitch` event already has `t`). Move "Day ends at" next to the goals (and in Preferences) with a one-line explanation, and use one `getStitchingDate` helper everywhere.
- **Worked example for acceptance:** marks of 10 at 23:50 and 20 at 00:02 (day end Midnight): 10 appear on the 10th and 20 on the 11th; with day end 2:00 AM, all 30 appear on the 10th; "today" is identical in tracker popover, project Stats and global Stats.
- **Storage change:** existing sessions keep their `date`. New sessions may be split. **Migration:** none; past statistics unchanged.
- **Effort:** M. **Dependencies:** none.

### STATS-06 — History cannot be corrected (Major)

- **Where:** `components-stats.js` `SessionTimeline` (journal supports only "Add note"); no delete or edit anywhere (`grep` found no delete-session code).
- **Affects:** all. Inferred from code (observed that the journal shows only "Add note").
- **User experience:** a session logged by accident (a bulk "mark colour done", a timer left in a forgotten tab, testing), a wrong day, or inflated minutes stays forever in totals, streaks, speed and estimates. The only escape is to reset the project.
- **Users:** all, especially power users (months of data).
- **Competitors:** StitchWIP: sessions can be corrected or deleted later with totals updating automatically (briefing, unverified; listing seen). Stitchwork has a stitch journal of daily history (briefing).
- **Recommendation:** in the session journal add per-session Edit (date, minutes, stitches) and Delete with confirm and Undo toast; recompute `stitchLog`, `totalAtEnd` and milestones from the corrected list; add "Merge sessions". Mark edited sessions with a small "edited" label.
- **Acceptance:** deleting a 140-stitch session on 10 Oct removes 140 from week totals, the best-day figure and the cumulative chart; streak updates; undo restores it.
- **Storage change:** `statsSessions` edited in place; `totalAtEnd` backfill already exists (`processLoadedProject`). **Migration:** none. **Effort:** M. **Dependencies:** STATS-03.

### STATS-07 — Bulk actions and edits count as stitching activity (Minor)

- **Where:** `tracker-app.js` ~2330 (any `doneCount` change triggers `recordAutoActivity`), `markColourDone` (~2672).
- **Affects:** all. Inferred from code.
- **User experience:** pressing "Done" on a legend row (marking, say, 387 stitches at once, perhaps catching up from paper) adds 387 to today's count, the pace, the streak and the daily goal and fires celebrations, although no time was spent.
- **Recommendation:** tag bulk actions (colour done, edit-mode changes, undo of an older session) as "catch-up" and exclude them from today's pace and speed; offer "Add to today's count / Count as catch-up". Catch-up stitches also useful for users migrating from paper (first-time user): add a "Mark everything I've done on paper" flow in Rectangle/Colour tools that is excluded from speed.
- **Acceptance:** marking a colour done adds 0 to speed and pace, adds to progress, and appears in the journal as "Catch-up 387".
- **Storage change:** optional `catchUp` count on sessions. **Effort:** S–M.

### STATS-08 — Statistics presentation on phones and discoverability (Minor)

- **Where:** `components-stats.js` (`StatsDashboard`, a single 4,000 px column on phone), header "Stats" link, popover.
- **Affects:** phone. Observed: the project Stats page overflows the viewport by 55 px (448 vs 393 px wide; the last milestone card is clipped); the global Stats page does not overflow. [stats-project-phone-full.png]
- **User experience:**
  - The popover (Done/Today/This week/Time/pace/remaining) is a good glanceable summary but hidden behind "Progress info".
  - The project Stats page is very long (settings at the bottom). The "Colour timeline" shows "No session data" per colour when sessions lack `coloursWorked`, and "~1 sessions" is ungrammatical.
  - Chart hover/touch behaviour untested.
  - "Projects 0 / 1" on the global page is unexplained.
- **Users:** regular and power.
- **Recommendation:** fix the overflow; put the headline figures (percent, today, this week, estimate) at the top and collapse lower panels (Colour timeline, Sections, Comparison, Settings) into accordions; replace "~1 sessions" with a pluralised string and "Projects 0 / 1" with "0 finished · 1 in progress".
- **Acceptance:** no horizontal overflow at 360–430 px; the first screen on phone shows percent, today and estimate.
- **Storage change:** none. **Effort:** S–M.

### STATS-09 — Streaks and goals: optional but not clearly controllable, and slightly nagging copy (Polish)

- **Where:** `StreaksPanel`, `GoalTracker`, global "Daily streak — keep it going!", `CustomiseModal` (global page can hide cards).
- **Affects:** all. Observed (rendered; the weekly streak, which tolerates missed days, is a good model).
- **User experience:** goals are opt-in ("Clear goal" is available); streaks are always on and the global copy "keep it going!" implies a missed day is a failure. There is no per-project "hide streaks".
- **Competitors:** fitness and reading trackers favour weekly streaks and "rest days" (adjacent); StitchWIP offers day/week/month/year goals (briefing, unverified).
- **Recommendation:** default to the weekly streak, show the daily streak only if the user turns it on, and soften copy. Add a "Show streaks and goals" toggle in Preferences that hides them in the tracker popover, celebrations and global page.
- **Acceptance:** with the toggle off none of: streak card, goal bar, celebration toast appears.
- **Storage change:** new preference only. **Effort:** S.

### COMMON-01 — Terminology and cognitive load in the tracker chrome (Minor)

- **Where:** rail and More panel labels; `TERMINOLOGY.md`.
- **Affects:** all. Observed.
- **User experience:** "Mark" vs "Nav/Navigate" (Navigate is a hand tool that also places a guide and parks), "Sleep/Awake", "Live tracking (RT)", "Isolate/Outline/Tint/Spotlight" with number shortcuts, "Skip done stitches", three overlapping "Highlight" words (tab, view, style), "Stats" in the header opens a different page from "Stats" in the Session panel. The More panel's tabs do not all reveal different content in a quick pass (Controls and Highlight rendered the same list in my run). Cognitive load is high for the first-time user.
- **Recommendation:** adopt TERMINOLOGY.md for these labels; rename Navigate to "Move" or "Guide", "Sleep/Awake" to "Keep screen on", "Live tracking (RT)" to "Deduct thread from stash as I stitch"; keep the highlight options but group them under one "Highlight" tab.
- **Storage change:** none. **Effort:** S.

### COMMON-02 — Accessibility, colour reliance and zoom (Minor)

- **Where:** chart rendering, rail, legend.
- **Affects:** all; low-vision and colour-blind users. Partly observed, partly inferred (no assistive-technology testing, no browser-zoom test).
- **User experience:** the done state relies on colour (TRACK-09); the chart canvas has an `aria-label` and a live region for the guide (good); focus visibility, contrast of tinted banners (orange text on pale orange), and 200% text scaling were not verified; 40 px controls (TRACK-07).
- **Recommendation:** adopt TRACK-09's non-colour done cue; raise rail targets; run an axe/keyboard pass on the tracker and Stats pages and fix findings; ensure banners meet 4.5:1.
- **Acceptance:** axe reports no serious violations on `stitch.html` and the Stats page; done/not-done distinguishable in greyscale.
- **Storage change:** none. **Effort:** M.

---

## 4. What works well (preserve)

- **Resume:** Home shows "Active - pick up where you left off" with Resume tracking (1 click), `?id=` deep links work, and the "Welcome back" recap gives last-session context (140 stitches, 45 m, 187 st/hr).
- **Marking:** click, drag, Shift+click and long-press rectangles, Ctrl+Z / Ctrl+Y, 50-step undo, and half stitches that mark by triangle with a disambiguation popup for ambiguous hits.
- **Finding thread:** the legend with per-colour done/total and sort modes, highlight styles with run-length counting aids, Jump to next stitch of the focus colour (J), hover bar giving row/column/thread, parking markers and layers, work areas and Spotlight.
- **Performance (desktop headless):** the 300x300 / 64-colour pattern reached a drawn chart in about 1.5 s, idle frame gaps were about 17 ms, and a 23-cell drag marked at about 25 ms per move. (Real phones untested.)
- **Statistics arithmetic that checked out by hand:** milestone dates, streaks (1 current / 3 longest), best day (300), average session (47 m), this-week and last-week comparisons, weekly streak (4), per-colour counts, and `stitchLog` derived from sessions.
- **Safety features that exist:** persistence request, Safari eviction warning, `cs_pending_session_*` recovery of finished sessions, cross-tab conflict dialog (needs improving, but it exists), backup and `.csync`, the Creator's warning that editing resets progress.
- **Settings for different habits:** day-end hour, active-days vs calendar-days pace, three timing modes, goals that can be cleared.

---

## 5. Prioritised roadmap

**Group A: Trust in saved progress (do first, together).** TRACK-01, TRACK-02, then TRACK-03 (merge and stale-tab banner) and TRACK-12.
- Quick wins inside the group: TRACK-02 (S) and the `__flushProjectToIDB` rewrite (part of TRACK-01).

**Group B: One truth for the numbers.** STATS-01 (single progress definition), then STATS-04, STATS-05, STATS-02, STATS-07.
- Quick wins: STATS-04 (S), the share-card streak fix (BUG-02), the Activity crash (BUG-01).

**Group C: Honest time and correctable history.** STATS-03 (explicit timer), STATS-06 (edit and delete sessions).
- Build together; STATS-06 first because it also repairs existing history.

**Group D: Phone and tablet ergonomics.** TRACK-06 (S, desktop quick win), TRACK-07, TRACK-08, TRACK-11 (S), TRACK-05 (S).
- Build TRACK-07 and TRACK-08 together; both change how the chart area behaves.

**Group E: Legibility and orientation.** TRACK-09 (done style, low-zoom colour, minimap, true Fit), COMMON-02.

**Group F: Stitch types.** TRACK-04 (L); schedule after Group B since it needs the new progress definition.

**Group G: Polish and discovery.** STATS-08, STATS-09, COMMON-01, TRACK-10, TRACK-13, TRACK-14.

---

## 6. Bugs found along the way

- **BUG-01 — Stats > Activity tab crashes the whole page (Major).** Observed on a fresh load of `index.html?mode=stats`: clicking Activity shows "ERROR: Uncaught SyntaxError: Identifier 'useState' has already been declared (stats-activity.js)". Cause: `stats-activity.js` and `stats-page.js` are both loaded as classic scripts and both declare top-level `const { useState, … } = React;` and `const h = …` (and `stats-activity.js` more top-level names). The second script fails to parse, so the calendar/heatmap can never be reached once `stats-page.js` is loaded, and the page needs a reload. Fix: wrap each file in an IIFE like `stats-insights.js`. [stats-activity-tab-crash-desktop.png]. Effort: S.
- **BUG-02 — Progress image card never shows the streak.** `components-stats.js` (`handleExportCard`) reads `streakInfo.currentStreak`, but `computeStreaks` returns `{ current, longest }`. Code inspection only (the export was not run). Effort: S.
- **BUG-03 — `home.html` `<title>` is mojibake** ("stitch. â€” Home", a double-encoded em dash). Observed in the tab title and page title; AGENTS.md requires UTF-8. Several comments in `stitch.html` are also mojibake. Effort: S.
- **BUG-04 — "Fit" fits width only** (see TRACK-09): 300 rows at fit zoom need 933 px in a 600 px box. Observed. Effort: S.
- **BUG-05 — "~1 sessions" and "0 / 1 projects"** wording (STATS-08). Polish.
- **BUG-06 — Resume recap shows stale totals after a size mismatch** (82% / 1,350 while the strip says 0) (TRACK-12). Observed.
- **BUG-07 — Cross-tab dialog and header badge disagree** (badge says saved while the conflict dialog says the edit may overwrite) (TRACK-02/03). Observed.
- **Not reproduced, listed to save re-investigation:** the first click on a freshly loaded tracker was ignored in my Playwright runs. This was the stacked first-run dialogs and the resume recap swallowing the click, not a handler bug. Two-finger panning did not work with my simultaneous two-point synthetic touch (marks occurred instead); `tests/e2e/tracker-touch.spec.js` sends one finger first and then two, as a real gesture does, so I treat my result as a test artifact (unverified on a real device).

---

## 7. Open questions and assumptions

1. **Cloud sync scope.** Is a hosted account/sync in scope, or should "progress is in this browser" be solved with merging (TRACK-03), backup reminders and the existing `.csync` folder workflow? I assumed the latter (the product positions itself as "no account"; `docs/competitive-analysis.md` lists sync as low priority).
2. **Unit weights for progress.** STATS-01 proposes half = 0.5, quarter = 0.25, knot = 1 and backstitch by length. Confirm what stitchers expect ("one stitch" for a French knot?) and whether backstitch should count in percent at all or only in its own line.
3. **Timer model.** STATS-03 assumes an explicit timer is acceptable to stitchers who dislike fiddling with the app; alternatively keep auto timing but label it "estimated". Needs a product decision.
4. **Stats "Activity" and "Insights" tabs.** Activity is unreachable (BUG-01) so its calendar, heatmap and the 400 stitches/hour assumption in `stats-activity.js` (`STITCHES_PER_HOUR`) were not exercised. Findings about the calendar are inferred from code only.
5. **Safari and Firefox.** Not tested. Unload timing, Wake Lock, touch gestures on iPadOS and storage eviction should be re-run on real WebKit before settling the TRACK-01 design (the `visibilitychange` hook is the only reliable one on iOS).
6. **Creation paths.** I did not run converted-image, drawn and imported-chart projects through the tracker end to end. If any path produces patterns with `__empty__` cells, half-stitch-only cells, or symbols assigned in the Creator (`project.symbols`), counts could differ; worth a follow-up pass with real files (the `TestUploads/` PDFs and `tests/fixtures/sampler-color.oxs` are suitable). Cross-reference: create-flow-audit §1.9 (From Pattern to Stitching).
7. **Free vs paid tiers.** None exist in this codebase; no limit or paywall interrupts tracking or hides statistics.
8. **Real-device performance and time zones/DST.** Performance numbers are headless desktop. Time zone and DST behaviour is inferred (sessions store a local `date` string at record time, so a trip across zones does not rewrite history, but streak and "today" use the device's current zone); no DST transition was simulated.
9. **Large-pattern limit.** The tracker refuses patterns whose cell size would drop below 2 px (`maxChartCellSize`, message "too large to display"); I did not find that limit with the 300x300 fixture, so its practical threshold is unknown.
