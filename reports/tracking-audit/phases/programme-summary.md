# Tracking and statistics remediation: programme summary

Six phases, pull requests #275 to #312, app version 1.0.106 to 1.0.143. Every phase was merged by you; each has its own `phase-N-report.md` with the detail. This page is the whole programme in one place: where every finding ended up, what it cost in speed, what is still unverified, and what I need from you.

## 1. Every finding and its final status

"Fixed" means the behaviour the audit asked for ships and is covered by tests and, where it is visible, a browser check. "Partly" and "Deferred" say exactly what is missing.

| Finding | Status | PR(s) | Note |
|---|---|---|---|
| TRACK-01 Marks lost on refresh, tab close, tab kill (Blocker) | Fixed | 275, 276 | Durable flush on hide/unload/backup/sync; separate progress record every 0.4 s. Backups were empty (wrong database version): fixed |
| TRACK-02 Save badge always "saved" | Fixed | 277 | Saving, Saved just now, Save failed with Retry, Not saved yet |
| TRACK-03 Two tabs / devices | Fixed (merge and backup, not hosted sync) | 278, 279 | Marks, half stitches, knots, sessions merge across tabs and devices. No server: see open question 1 |
| TRACK-04 Backstitch, quarter, petite, long stitches | Partly | 307, 308, 309 | Backstitch and quarter stitches are tracked, undoable, counted, merged and synced. **Petite and long stitches have no data model** in the app, so there is nothing to track; the layer stays 0. Imported OXS backstitch has no colour, so it has no legend row |
| TRACK-05 Resume context / stacked dialogs | Fixed | 297 | Reopens on colour, mode, view; recap is a strip; tour no longer covers a chart |
| TRACK-06 Legend panel covers navigation | Fixed | 294 | Checked at 1024 and 1440 px |
| TRACK-07 Small-screen layout and targets | Fixed | 295 | Chart fills the screen, Focus default on phones, 44 px targets, left-handed option |
| TRACK-08 One-finger swipe marks | Fixed | 296 | Swipe scrolls; press-and-drag paints; Paint mode, Lock touches, "Undo N stitches"; a palm (3+ fingers) does not mark |
| TRACK-09 Done vs not done faint, blank zoomed-out, Fit | Fixed | 300, 302 (Fit also in 282) | Done = thread colour; one-pixel colour at far zoom; overview map; Fit holds 300 rows in 600 px |
| TRACK-10 Keyboard and screen-reader parity | **Partly** | 303 | Keyboard fully done (mark, fill, move guide, colour, legend, Esc). **Screen-reader parts deferred by your instruction** |
| TRACK-11 Screen awake chip | Fixed | 298 | Keep screen on: Automatic, Always, Never |
| TRACK-12 Editing the pattern after tracking | Fixed | 280, 308 | Marks held back and the user asked; quarter marks were added to the reconciliation in Phase 6 after the hunt found them missing |
| TRACK-13 Unpick area | Fixed | 310 | One undo step; touch, mouse and keyboard; logged as a `frog` event, never a negative day |
| TRACK-14 Notes and photos | Fixed (photos not in device Sync) | 311 | Notes and up to 12 compressed photos; in backups; deleted with the project |
| STATS-01 "Progress" defined four ways | Fixed | 283 | One `ProgressUnits` source; full 1, half 0.5, quarter 0.25, knot 1; backstitch its own row |
| STATS-02 Estimates disagree, hidden basis | Fixed | 286 | One estimate, basis shown, hidden under 3 stitching days or 5% |
| STATS-03 Time/speed = time between taps | Fixed | 290 | Explicit timer; auto-timed figures labelled estimated; "Forgot to stop?" |
| STATS-04 Unpicking invisible, negative days | Fixed | 284, 288 | Additions and removals recorded separately; Unpicked N |
| STATS-05 Midnight and "today" | Fixed | 285 | One app-wide day end; sessions split per stitching day |
| STATS-06 History cannot be corrected | Fixed | 289 | Edit, delete, merge sessions with Undo; sync honours deletions |
| STATS-07 Bulk actions count as stitching | Fixed | 284, 288 | Ask "today or catch-up" for mark-all and rectangle fills over 50 |
| STATS-08 Stats on phones | Fixed | 291 | No sideways scroll at 360 to 430 px; headline first; charts readable by tap |
| STATS-09 Streaks and goals | Fixed | 292 | Preference; weekly default; plain wording |
| BUG-01 Activity tab crash | Fixed | 282 | |
| BUG-02 Share card streak | Fixed | 282 | |
| BUG-03 Mojibake | Fixed | 282 | |
| BUG-04 Fit width only | Fixed | 282, 302 | |
| BUG-05 "~1 sessions" wording | Fixed | 282 | |
| BUG-06 Stale recap totals | Fixed | 280 | |
| BUG-07 Badge vs dialog disagree | Fixed | 277 | |
| COMMON-01 Terminology | Fixed | 298 | "Use up stash thread as I stitch", Keep screen on, Highlight tab |
| COMMON-02 Accessibility, colour, zoom | **Partly** | 304 | `color-contrast` nodes 166 to 0 in both themes; focus ring; 200% zoom; not colour alone. **Two axe rules remain** (`aria-required-children`, `nested-interactive`) and **screen-reader work is deferred** |

Counts (32 findings): 29 fixed (TRACK-14 and TRACK-03 with the limits noted), 3 partly fixed (TRACK-04, TRACK-10, COMMON-02), 0 untouched. Nothing was dropped silently.

### Deferred, and why

- **Screen-reader behaviour** (TRACK-10, COMMON-02, announcements of the save badge, the dialogs, the new Phase 6 controls): you asked to leave it for a later piece of work.
- **Petite and long stitches**: the pattern format has no way to store them, so tracking them means a Creator change first. It is a separate design decision, not tracking work.
- **Two axe rules** (`aria-required-children`, `nested-interactive`): the markup is shared with parts that need screen-reader testing to change safely.
- **Photos and notes in device Sync**: photos are large and go through the BlobStore; sync today moves project data only. They travel in a backup.
- **Imported OXS backstitch colour**: the format gives lines no thread, so they cannot be given a legend row.

## 2. Measured performance across the programme

The rule was "no update may slow the app by more than 5%". Every batch was measured interleaved against its predecessor on the 300x300 fixture; per-phase tables are in each phase report. In-sandbox noise is 5 to 8% on a single figure, so a result inside 5% means "not distinguishable", not "identical".

| Phase | Whole-phase result (interleaved) |
|---|---|
| 1 | Load 1,346 to 1,740 ms vs 1,513 to 1,719; 60-move drag 1,176 to 1,314 vs 1,215 to 1,340 (noise) |
| 2 | Load -1.2% / -5.5%; tap -6%; drag +0.5% / -2.9%; project Stats open +8.8% then 0% (noise, ranges overlap); global Stats -5% |
| 3 | First Stats open about -12%; tap +8% on first run, then +2% and -1% on re-runs (reported all three) |
| 4 | Phone tap +0.8%, stroke +3.3%, load +3.5%, each level with a control build after trimming per-mark effects found in the bisect |
| 5 | Zoom step -10.9%, pan -16.3%, drag -2.5%, single mark +1.4% (4x throttle +3.9%), heap +1.6% |
| 6 | Zoom +4.3% / +5.0%, pan +2.3% / +7.7%, drag +1.3%, mark +2.6%, heap +0.6%. These sit at or above the line on two figures; I judged them not distinguishable from noise but not clearly zero |

### Programme-wide check, start to now

One more interleaved run, `main` at 1.0.106 (before Phase 1, `23f9ae6`) against 1.0.143 (now): 4 rounds x 2 browser sessions each, `drawbench`, desktop, 300x300 fixture with 20% done. Raw files in `perf/programme-end/`.

| Measure | Before Phase 1 | Now | Change |
|---|---|---|---|
| Zoom step (full repaint) | 103.1 ms | 85.5 ms | **-17.0%** |
| Pan step | 28.3 ms | 21.0 ms | **-25.7%** |
| Drag of 60 cells | 694 ms | 708 ms | +1.9% (one slow outlier round in "now": 865 ms; the other three are 705 to 709) |
| Single tap | 29.0 ms | 29.0 ms | -0.1% |
| JS heap after GC | 18.84 MB | 19.47 MB | +3.4% (about 0.6 MB) |

Reading it: drawing is clearly faster than at the start (Phase 5's look caches). Marking is level. Memory grew by about 0.6 MB across six phases of features. The Phase 6 zoom and pan readings that looked slightly slow are more than paid for by the Phase 5 gains, so nothing in the programme ended up slower on the paths a stitcher uses all day. The heap figure is the only one that moved against us, and 3.4% is inside the 5% line.

## 3. Remaining risks

**Browsers and devices never run.** All browser checks ran in desktop Chromium with phone and tablet emulation.
- **Safari / iOS:** BroadcastChannel, IndexedDB writes during unload, storage eviction, wake lock, Overlay focus trap, Blob storage of photos, image compression via canvas.
- **Firefox:** the same list.
- **Real devices:** touch feel of the rectangle bar, the loupe, press-and-drag painting and the palm rule; real 200% zoom; the wake lock in Automatic.
- **Mac keyboard:** Cmd+Shift+Enter (Unpick area) and Alt on release.

**Not exercised in a browser at all:** `.csync` round trip; three or more tabs; marking inside a work area (checked at source and in the unpick plan's tests only); the Creator resize dialog with backstitch marks; backup and restore of backstitch marks (photos are tested, marks are covered by unit tests); the Pattern Keeper PDF regression check (the three PDF files are unchanged, so there is nothing to re-test, but I did not open a PDF).

**Known behaviour gaps (small):** the loupe appears only for presses that land on a line; a closed session keeps its "Unpicked" figure if the unpick is undone later; quarter marks are not in the work-area figures; photos are not in Sync.

**Tests that fail on `main` and are not from this programme:** `creator-touch` (two), `import-review-phone`, two `phase3-hunt` two-tab specs, and an occasional `save-durability`. They were failing before the work reached them; I did not change them.

**Method risk:** performance was measured on one shared sandbox at 5 to 8% noise. A regression of 3 to 5% on a real, slower phone would not have shown here. If the app feels slower on a real device, the first places to look are the per-mark work (Phase 3 timer and preference reads, Phase 4 wake lock, Phase 6 quarter and backstitch hit tests) and the first draw of a project with many backstitch lines.

## 4. Open questions for you

1. **Hosted sync.** The audit asked whether progress should follow the user across devices. I built merge, backup and folder sync and said so in the app. Do you want a hosted account later, and does that change what counts as "the" copy of a project?
2. **Weights.** Quarter 0.25, half 0.5, knot 1 mean percentages moved for projects with fractional stitches (you accepted this). Should petite and long stitches get weights now, in case the format gains them?
3. **Petite and long stitches.** Should the Creator learn to store them? That is a pattern-format change and affects PDF, import and export; it is not a tracking-only job.
4. **Screen readers.** Do you want that as the next piece of work? It would cover the save badge, dialogs, the guide, marking announcements, the new Phase 6 controls, the two remaining axe rules, and testing with VoiceOver and NVDA.
5. **Browser and device coverage.** Can someone run the Safari, Firefox and phone checks above? If you can give me a list of devices you or your testers use, I can turn it into a short manual script.
6. **Photos in Sync.** Do you want them to travel between devices (adds large transfers) or stay in backups?
7. **Imported backstitch.** Show OXS backstitch in a neutral "Imported lines" row, or leave it untracked until the user assigns a colour?
8. **Tests failing on `main`.** Do you want a small clean-up pass for the six pre-existing failures?
9. **Estimates.** The pace is the mean per stitching day over four weeks. Is that what you want to keep, or the recency-weighted average the audit suggested?
10. **Performance budget.** Is 5% on a noisy sandbox the right rule, or should the next programme measure on a real mid-range phone first?

I have not started any further phase work. This summary PR is the end of the programme as written; anything above is yours to prioritise.
