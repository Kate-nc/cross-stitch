# Phase 4: Small screens and touch

> **Agent prompt.** You are making the stitch tracker in `kate-nc/cross-stitch` work properly on
> laptops, tablets and phones held beside the work: the chart gets the room, controls are
> big enough, a swipe cannot scribble marks, and the working context is remembered. Read
> [phase-00-working-agreement.md](phase-00-working-agreement.md) in full first, then the findings
> below in [reports/tracking-audit.md](../../tracking-audit.md). Phases 1 to 3 must be merged into
> `main`; confirm. Do not start Phase 5 until told.

## Goal

At every size the chart gets most of the screen; nothing covers the global navigation or the chart
edge; targets are at least 44 px; ordinary touch gestures never mark by accident; and reopening a
project restores colour, mode and view. No slowdown.

## Findings in scope

TRACK-06, TRACK-07, TRACK-08, TRACK-05, TRACK-11, COMMON-01.

## Evidence to reproduce first

- TRACK-06: 1440x900 and 1024x768 with the legend panel open: logo, Create, Edit and "Track" are
  covered by `.lpanel` (320 px, fixed, full height); banners start under it (`harness/e3`-style
  check using `elementFromPoint`).
- TRACK-07: Pixel 5 portrait (393x727): chart box 600 px fixed; landscape 851x393: about 11 rows;
  rail covers the right column; "Palette" pill overlaps the hint banner; save badge clipped;
  rail buttons 40x40 and close button 21x21 (`harness/m1`/`m2.js`).
- TRACK-08: `harness/m2.js`: a 120 px one-finger swipe in Mark mode marked 7 stitches and did not scroll.
- TRACK-05: reopen via Resume: highlighted colour, mode, view reset; stacked first-run dialogs; the
  recap needs a click.
- TRACK-11: wake-lock chip labelled "Sleep"/"Awake", off by default.

## Recommended solution (chosen options)

### TRACK-06 (quick win, ship first)

Offset the header and main column by the panel width when the panel is open, via one CSS variable
(for example `--lpanel-w`) set on `body` by the tracker, or start the panel below the 48 px header.
Keep hint banners inside the main column. Verify at 1024, 1280, 1440, 1920.

### TRACK-07: give the chart the screen

- Size the chart box to the remaining viewport: `height: calc(100dvh - chrome)` using a measured
  chrome height variable (no fixed 600 px). Handle iOS dynamic toolbars (`dvh`, `visualViewport`).
- Make the existing Focus mode (F, "Focus" chip) the **default on phone**: it collapses the header, info
  strip and banners to one thin progress line with a clear way back. Auto-hide the three hint
  banners after the first successful mark (persist "seen" in `UserPrefs`/coaching so they do not
  return every session).
- Rail: 44 px minimum targets, spacing, optional left/right placement (a `UserPrefs` handedness
  setting, default right); reserve right padding in the chart equal to the rail width so the last
  column is reachable; move "Palette" off the banner. Close button at least 44 px.
- Save badge on phone: icon-only with `aria-label` (it is clipped today).
- Do not change desktop behaviour beyond TRACK-06.

### TRACK-08: scrolling must not mark

On touch (pointer type touch/pen) require intent before drag-painting begins: start painting only
after a press-and-hold of about 120 ms **or** 8 px of movement predominantly along the row/column
from a cell that was first touched and held; a quicker swipe scrolls natively (set `touch-action`
correctly so the browser can pan). Keep tap-to-mark instant. Add an explicit **Paint** mode toggle
(visible indicator) for fast runs, and a **Lock touches** toggle (hold to unlock) for propped-up
devices. After any single gesture that marks more than 5 cells show an "Undo N stitches" Toast
(auto-dismiss, reuse `Toast`). Persisting undo across reload is out of scope here but note it.
Re-read `useDragMark.js`, `touch-constants.js` and `tests/e2e/tracker-touch.spec.js`; update that spec
to the new contract and keep two-finger pan, pinch and long-press rectangle working. Mouse and trackpad
behaviour is unchanged.

*Alternative considered:* make Navigate the default on phones. Rejected (adds a tap per session); do not
implement unless the user asks.

### TRACK-05: resume the working context

Persist per project `focusColour`, `stitchMode`, `stitchView`, highlight style (small optional fields in
the project record, or per-project keys like the existing `cs_layerVis_<id>`; choose the project
record so backup and sync carry them, and add them to `__updateCreatorTrackerFields` and the
Creator preserve path). Make the resume recap non-blocking: a dismissable banner that auto-dismisses on
the first mark (the Home "Resume" path may skip it). Collapse the welcome tour, the "How do you usually
work" question and the coach marks into one short first-run sequence that never swallows the first
chart tap.

### TRACK-11: keep the screen on

On touch devices, request the wake lock automatically at the first mark of a session (with a one-time
Toast explaining and pointing to Preferences), release at session end or when hidden, re-acquire when
visible again. Relabel the chip "Keep screen on". Respect `trackerWakeLock` (add an explicit "Never"
value). Wake Lock support differs on Safari and Android: feature-detect; mark unverified on real iOS.

### COMMON-01: terminology

Apply `TERMINOLOGY.md` and run `npm run lint:terminology`: rename Navigate to a clearer verb ("Move" or
"Guide", confirm against the terminology doc before deciding; ask the user if the doc does not settle
it), "Sleep/Awake" to "Keep screen on", "Live tracking (RT)" to plain language ("Use up stash thread as I
stitch"). Group the highlight options under one tab; update `help-drawer.js` and every
shortcut description (the sync test enforces this).

## Files likely to change

`styles.css`, `stitch.html`, `tracker-app.js`, `useDragMark.js`, `useWakeLock.js`, `touch-constants.js`,
`header.js`, `coaching.js`, `onboarding-wizard.js`, `icons.js`, `preferences-modal.js`, `user-prefs.js`,
`help-drawer.js`, `version.js`, `creator/useProjectIO.js` and creator preserve path, tests including
`tests/e2e/tracker-touch.spec.js`, `tests/mobileTouchErgonomics.test.js`, `tests/mobile-audit/`.

## Acceptance criteria

- 1440x900 and 1024x768 with the panel open: logo, Create, Edit, Track visible and clickable
  (`elementFromPoint` test); banners not clipped.
- 393x727 portrait: chart height at least 65% of the viewport; 851x393 landscape: at least 50% with Focus on;
  no rail overlap of the last column; every control at least 44x44 CSS px (automated size audit over
  visible buttons, as `harness/m2.js` does); badge not clipped.
- A 120 px one-finger swipe in Mark mode marks 0 stitches and scrolls; press-hold-drag across 5 cells marks
  5; tap marks 1 immediately; Paint mode marks along a quick drag; Lock touches blocks marks until
  released; an "Undo N stitches" Toast appears after a gesture marking more than 5.
- Two-finger pan and pinch still mark nothing (existing spec) and mouse/trackpad marking is unchanged.
- Highlight 666, close, reopen via Resume: 666 highlighted, same mode and view, same scroll and zoom;
  the first tap marks a stitch even while the recap shows.
- On a Wake Lock capable tablet the first mark acquires the lock, the chip shows "Keep screen on", and it
  re-acquires after returning to the tab.
- `npm run test:mobile-audit` and the touch e2e project pass at updated thresholds; no horizontal page scroll
  at any tested size.

## Performance guard

Chart sizing must not trigger a re-render storm: compute chrome height once and on resize via
`ResizeObserver`, not per mark. Touch intent logic is O(1) per pointer event. Re-measure drag-mark
latency, tap-to-paint latency and frame time on the 300x300 fixture with phone emulation and CPU throttling
(CDP `Emulation.setCPUThrottlingRate` 4x); no regression.

## Data and migration statement (include in the PR)

New optional project fields for working context and a few `UserPrefs` keys (handedness, wake-lock mode,
banner-seen flags). No migration. Old projects open with defaults.

## Suggested batches

1. TRACK-06 (S) and the touch-target and badge fixes.
2. Chart sizing, Focus-by-default on phone, banner auto-hide, rail changes (TRACK-07).
3. Touch intent, Paint mode, Lock touches, undo toast (TRACK-08) with updated e2e spec.
4. Persisted working context and the first-run/recap rework (TRACK-05).
5. Wake lock and terminology pass (TRACK-11, COMMON-01).

## Phase bug-hunt additions

Test with iPad Mini and Pixel emulation in both orientations and rotation mid-session; browser zoom 200%;
on-screen keyboard open while renaming; Safari-specific viewport units (unverified, say so); mouse,
trackpad two-finger scroll and Ctrl+wheel; stylus pointer type; accidental palm (multi-touch) cases;
confirm Creator and Home pages did not shift because of shared CSS changes (screenshots before/after).
