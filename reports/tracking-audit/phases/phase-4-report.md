# Phase 4 report: small screens and touch

Status: all six findings are done across five batches (PRs 294 to 298, all merged). This closing PR holds the end-of-phase hunt (two bugs fixed, eight new browser tests), the whole-phase performance check and this report.

## What shipped

| PR | Batch | Findings | Outcome |
|---|---|---|---|
| #294 | 1: legend panel, targets, save badge | TRACK-06 | The open colour panel no longer covers the logo, Create, Edit and Track at 1024 and 1440 px; dismiss and close controls 44 px on touch; the save badge is a whole icon on a phone, not a clipped sliver |
| #295 | 2: give the chart the screen | TRACK-07 | The chart box fills what is left of the screen (no fixed 600 px) and refits on rotation; Focus is the default on a phone; the hint banners go after the first marked stitch and stay gone; the controls strip has 44 px buttons, an optional left-handed side, and the last column is reachable; the floating Palette pill is gone |
| #296 | 3: scrolling must not mark | TRACK-08 | A quick one-finger swipe scrolls and marks nothing; rest a finger on a stitch and drag to paint; a tap still marks at once; Paint mode and Lock touches; "Undo N stitches" after any stroke or rectangle that marks more than five |
| #297 | 4: remember where you were | TRACK-05 | A project reopens on the colour, Mark or Navigate, and chart view it was left in (one optional field, carried by sync, backup and the Creator); the welcome-back recap is a strip, not a dialog; the first-run tour no longer covers an open chart, so the first tap marks |
| #298 | 5: keep the screen on, plainer words | TRACK-11, COMMON-01 | Wake lock is Automatic (first mark on a touch screen), Always or Never; Sleep / Awake is Keep screen on; "Live tracking (RT)" is "Use up stash thread as I stitch"; the chart view moved into the Highlight tab, with Colour + symbol replacing a Realistic button the chart could not draw |
| this PR | closing | end-of-phase hunt | A palm (three or more fingers) no longer marks; the controls strip scrolls on a very short viewport; hunt specs, screenshot harness, this report |

Changelog entries 1.0.126 to 1.0.131 and the in-app help (Mark mode, Paint and Lock touches, Undoing a stroke, Coming back to a project, Keeping the screen on, Highlight tab, A hand on the screen) cover all of it. Every batch had a Copilot review round; all findings were checked, fixed or answered, and the threads resolved (the details are in `phase-4-bughunt.md`).

## Acceptance criteria against the prompt

| Criterion | Result |
|---|---|
| 1440x900 and 1024x768 with the panel open: logo, Create, Edit, Track visible and clickable; banners not clipped | Pass (batch 1 spec, `elementFromPoint`) |
| 393x727: chart at least 65% of the viewport; 851x393 landscape at least 50% with Focus on; no rail overlap of the last column; every control at least 44x44; badge not clipped | Pass (batch 1 and 2 specs, an automated size audit over visible buttons in both orientations) |
| A 120 px one-finger swipe in Mark mode marks 0 and scrolls; rest-hold-drag across 5 cells marks 5 (6 with the cell rested on); tap marks 1 at once; Paint marks along a quick drag; Lock blocks marks until released; "Undo N stitches" after more than 5 | Pass (batch 3 spec, real touch events through CDP) |
| Two-finger pan and pinch mark nothing; mouse and trackpad unchanged | Pass, and tightened: three or more fingers also mark nothing now (hunt, below); mouse drag, wheel and Ctrl+wheel covered by specs |
| Highlight 666, close, reopen: 666 highlighted, same mode and view, same scroll and zoom; the first tap marks even while the recap shows | Pass (batch 4 spec and unit tests; the recap is a strip so there is nothing to tap through); scroll and zoom were already saved |
| On a Wake Lock capable tablet the first mark acquires the lock, the chip shows Keep screen on, it re-acquires on returning to the tab | Pass against a mocked Wake Lock (hook tests in jsdom, a browser spec). Not run on a real device |
| `npm run test:mobile-audit` and the touch e2e project pass; no horizontal page scroll at any tested size | Touch e2e project passes (80 specs in the final run). `test:mobile-audit` cannot run in this sandbox (no local CDN support; its specs time out on `main` too), so its `pan-ownership` spec was updated to the new contract but not run. No sideways scroll at 196, 360, 384, 393, 720, 768, 851 and 1440 px in the specs |

## End-of-phase bug hunt

See `phase-4-bughunt.md`. Two real bugs found and fixed: a palm of three or more fingers marked the odd-numbered fingers' stitches (a finger landing on a French knot, which the Tracker handles itself, was not counted either; fixed in the review round), and at browser zoom 200% on a phone (196x364) the More button sat below the fold and could not be reached. Checked and fine: 200% on a tablet and desktop, rotation mid-session with marks made, mouse and trackpad wheel, Ctrl+wheel (zooms the chart, not the page), stylus tap and quick swipe, a halved viewport with the More panel open, and Creator, Home and Manager before and after. What was not driven is listed there and below.

## Performance

Rule: nothing slows the app by more than 5%. Every batch was measured interleaved against `main` and none moved outside noise (the numbers are in each batch's section of `phase-4-progress.md`). Whole phase, interleaved against the commit before Phase 4 (`7395a58`), on the 300x300 fixture with phone emulation (393x727 touch, 4x CPU throttle) and a desktop mouse run. I am reporting every run, because they did not all agree at first.

| Run | What | Phone tap | Stroke commit | Load to chart |
|---|---|---|---|---|
| 1 | 3 pairs, before always run first | +12% (86 to 97 ms) | +15% (8 strokes per run) | +4% |
| 2 | Bisect: 6 builds (before, after each batch, now), 3 rounds | -6% | +5% | +5% |
| 3 | 24 loads each, interleaved | | | -1% |
| 4 | 4 rounds of 80 taps and 60 strokes, alternating order | +2% | +5.6% | +6.6% |
| 5 | Same, and a copy of "now" without the per-mark effects of batches 4 and 5 | +5.8% (without the effects: -0.6%) | +4.6% (without: +2.9%) | noise (+15% with, +1% without, which cannot be the effects) |
| 6 | After trimming those effects (below) | +0.8% (control -1.8%) | +3.3% (control +3.9%) | +3.5% (control +3.4%) |
| desktop | 3 pairs of 120 mouse taps | +1% (11.3 vs 11.4 ms) | | |

Reading it: run 1 was one early run with the older build always first, and the bisect did not reproduce it (the phone tap was *faster* after every batch than before). The load figure swings between -1% and +15% from run to run between builds that differ only in code that cannot affect loading, so I treat it as noise; 24 interleaved loads gave -1%. Runs 4 and 5 did show a small, repeatable cost on taps and strokes, and the copy without the per-mark effects of batches 4 and 5 recovered it, so I cut their cost: the wake lock's per-mark call read `localStorage` and reset a timer on every mark; it now reads the mode from a cache that the preference event refreshes and restarts the idle clock at most every 30 seconds. Run 6, after that, has the current build level with the control, all under 5%. Bundle size grew about 3% for the tracker and 2% for the stylesheet over the phase (compiled tracker 483 KB to 498 KB), which is the cost of the features, not a measured slowdown.

One caveat, stated plainly: these are interleaved runs on a shared sandbox whose speed drifted by about 30% during the phase, and run-to-run noise on a single figure is 5% or more, so a result inside 5% of the before build is "not distinguishable", not "identical".

## Data and migration statement (as shipped)

- **Projects:** no schema change, version stays 11. One new optional field, `workingContext` (`colour`, `mode`, `view`, `highlight`); a default context writes nothing. Validated on load (the colour must still be in the pattern, values must be known), carried through the Creator's preserve paths and ignored by the cross-tab merge.
- **Preferences (all global):** `trackerFocusOnPhone` (true), `trackerHandedness` ("right"), `trackerHintsSeen` (false), and `trackerWakeLock`, which was a boolean and is now `"auto"` (default) | `"always"` | `"never"`. An older stored `true` reads as Always, `false` and unset as Automatic. A one-time flag `cs_wakelock_told` in `localStorage` remembers the "keeping the screen on" message.
- **Not saved on purpose:** Paint mode and Lock touches (a reload is a clean start, so nobody is locked out by a stale setting).
- **Old projects** open with defaults; nothing to migrate. Backup and restore pass the new field through.

## Decisions and deviations you may want to revisit

- **Painting starts after a 120 ms rest only.** The prompt said "about 120 ms *or* 8 px of movement along the row or column". I did the rest only: a quick row-wise swipe that painted would be the accident this phase removes. Paint mode is the fast route.
- **Navigate keeps its name.** `TERMINOLOGY.md` lists "Mark mode (and Navigate mode)", so the doc settles it; the prompt said to ask only if it did not. Renaming it later is a copy change.
- **"Group the highlight options under one tab"** is done by moving the chart view picker into the Highlight tab (it was in View); the Preferences page for highlight appearance is unchanged. The picker's Realistic button is now Colour + symbol, the real view.
- **The recap strip clears on the first mark or after 20 seconds** (and waits while it has keyboard focus); the Home "Resume" path does not skip it.
- **The first-run style question is skipped** when a pattern is already open on a first visit (Block applies; it is under More controls > Tools); someone who opens the Tracker empty still gets the whole tour.
- **The wake lock is released after 15 minutes without a mark** and when the Tracker closes, not when the timer stops, and a lock is taken by a mark, so someone only watching the chart in Navigate is not kept awake (the chip does it on demand).
- **Restoring the working context applies when a different project is loaded**, not on a reload of the one on screen, so a cross-tab merge never flips someone's mode.
- **Persisting Undo across a reload** is out of scope, as the prompt says; "Undo N stitches" is bound to the history entry it offers and goes when anything else is marked.
- **Two test fixes outside the findings**, each found by a failing run: a weekday-dependent streak test (`phase3Batch4` failed on `main` on Tuesdays; its dates are now relative to the weekday) and a goal spec that waited for the recap's old Continue button. The order of two tied entries in Manager's thread-conflicts list changes between loads; noted, not touched.

## Open items

- `save-durability` has failed once or twice intermittently (undiagnosed, older than this phase); one cross-tab spec failed once under two workers and passes on its own.
- Two `creator-touch` specs are stale (they pre-date this phase).
- At 720 px (a desktop at 200% zoom) the colour panel opens as an overlay whose backdrop covers the controls strip until you tap outside it; the build before Phase 4 did the same. A phone's project name is not shown in the Tracker's top bar under 600 px (the switcher names it), and the Tracker has no rename control below desktop widths in either build.
- The Realistic view the old picker offered never drew anything; it is gone from the Tracker. The Creator's Realistic preview is a different feature and is untouched.

## Not verified

Safari and Firefox (including Safari's dynamic viewport units, which batch 2 relies on, and whether iOS starts scrolling in the first few pixels of a rested drag); real phones and tablets; the Wake Lock itself on iOS (a home-screen app behaves differently) and Android; a real on-screen keyboard (only a halved viewport was emulated); a real stylus (pressure, hover) and the OS's palm rejection; the dark theme on the Phase 4 additions; screen-reader behaviour of the recap strip, Keep screen on and the Highlight tab; `npm run test:mobile-audit` (cannot run here).
