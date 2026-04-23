# Tailored per-style onboarding tour — Test Plan

Phase 6 follow-up to `HELP_AND_ONBOARDING_TEST_PLAN_PHASE5.md`. Replaces the
generic 10-stitch first-run tour with four method-specific flows backed by
purpose-built sample projects. Captures the research that informed the
re-design and the manual + automated checks needed to verify each flow.

---

## Background — what cross-stitchers actually do

Wikipedia's [Cross-stitch article](https://en.wikipedia.org/wiki/Cross-stitch)
plus established Flosstube / HAED community vocabulary describes three
deliberate working methods, plus one ad-hoc approach common to beginners:

1. **Cross-country** — work one DMC colour to completion across the whole
   canvas before changing thread. Best for traditional samplers and
   low-confetti charts.
2. **Block / section ("10×10")** — work an entire 10×10 (or 20×20) chart
   square fully before moving on. Common for medium-to-busy patterns and
   gridded fabric.
3. **Parking** — variant of block where instead of cutting thread when
   leaving a colour, the needle is "parked" at the next chart cell where
   that same colour appears. Standard for HAED-style full-coverage photo
   conversions (which is exactly what this app generates).
4. **Freestyle** — no fixed method. Most common for absolute beginners and
   small kits.

The previous tour asked the user to pick a style, then ignored it: every
user landed on the same 10×10 heart with the same "Mark your first 10
stitches" banner. It also mapped the **Minimal / Parking** option onto
internal style `freestyle`, which is the opposite of what parking means in
cross-stitch (parking is highly structured; freestyle is the absence of
structure).

This phase wires up four real branches.

---

## 1. What changed

| Area | Change |
|---|---|
| Style picker | Now offers four real options: **One colour at a time** (cross-country), **Section by section** (block / 10×10), **Parking method**, **No fixed method** (freestyle). Sub-labels explain when each method is used. |
| Sample projects | Four purpose-built samples replace the single 10×10 heart. Each is shaped to make its method's "win" visible: scattered 2-colour grid for cross-country, single-colour quadrants for block, confetti for parking, original heart for freestyle. |
| Auto-applied prefs | Picking block or parking turns on Focus mode (`cs_focusEnabled='1'`) and sets `cs_blockW='10'`, `cs_blockH='10'`, `cs_startCorner='TL'`. Parking also sets a new flag `cs_useParking='1'`. Every style stamps `cs_stitchStyle` to the matching tracker value. |
| Tracker hint banners | Per-style copy + per-style completion criteria. Cross-country goal = finish one colour (any colour at 100%); block = complete the top-left 10×10 block; parking = drop ≥1 parking marker, then complete the focus block; freestyle = ≥10 stitches. |
| Persona-aware verbosity | Newbies (picked "I'm new to cross stitch" on the welcome step) get an extra one-line tip appended to each banner. Experienced users see the terse version. |
| Reset | `OnboardingTour.reset()` now clears all four sample project ids plus the legacy `proj_onboarding_sample` so older installs are cleaned up too. |

### New / changed localStorage keys

| Key | Values | Set by |
|---|---|---|
| `cs_user_style` | `cross_country` \| `block` \| `parking` \| `freestyle` | style picker |
| `cs_stitchStyle` | `crosscountry` \| `block` \| `freestyle` | applyStyleSettings → tracker |
| `cs_useParking` | `'0'` \| `'1'` | applyStyleSettings (new) |
| `cs_focusEnabled`, `cs_blockW`, `cs_blockH`, `cs_startCorner` | as before, but auto-set per style | applyStyleSettings |
| `cs_onboarding_step` | adds intermediate value `parking_marker_set` (between `sample_loaded` and `first_stitches`) | tour state machine |

---

## 2. Where users see each change

| Style picked | What loads in the Tracker | First banner | Goal |
|---|---|---|---|
| **One colour at a time** | 10×6 scatter, 2 colours (red 321 + blue 798), ~30 stitches | "Open the Colours drawer at the bottom, pick one colour, then mark every X of it across the canvas." | Any single colour at 100%. |
| **Section by section** | 20×20 with one colour per 10×10 quadrant (red / blue / green / yellow), Focus mode on, focus block = TL | "Focus mode is on — the current 10×10 block is highlighted. Complete every stitch in it." | TL block complete. |
| **Parking method** | 20×20 confetti with 5 colours, Focus mode on, focus block = TL | "Switch to Navigate mode (Space). Pick a colour from the palette, then click the next chart cell where it appears to drop a parking marker." | ≥1 parking marker placed → second banner asks for block completion → tour completes when TL block is done. |
| **No fixed method** | Original 10×10 red heart (DMC 321), no chrome | "Mark your first 10 stitches to complete the tour. Tap any cell to mark it done." | ≥10 stitches done. |

After tour completion, every style shows a follow-up banner inviting the user
to the Stash Manager. Manager visit → toast "Tour complete!" → step set to
`complete`.

---

## 3. Manual QA steps

### Reset

1. DevTools → Application → Local Storage → delete `cs_onboarding_step`,
   `cs_onboarding_persona`, `cs_user_style`, `cs_welcome_creator_done`,
   `cs_welcome_tracker_done`, `cs_welcome_manager_done`, `cs_styleOnboardingDone`,
   `cs_focusEnabled`, `cs_useParking`. (Or use Help Centre → "Reset onboarding tour".)
2. Reload `index.html`. The welcome modal appears — step 1 (persona).

### Cross-country flow

1. Pick **I'm new to cross stitch**, then **One colour at a time**.
2. Toast appears: "Loaded a sample tuned for one colour at a time." Page
   navigates to `stitch.html`.
3. Tracker opens with the 10×6 scatter pattern (red + blue). The colour
   drawer at the bottom lists exactly two threads (DMC 321, DMC 798).
4. The hint banner reads (newbie verbosity): "Open the Colours drawer at the
   bottom, pick one colour, then mark every X of it across the canvas. Tip:
   clicking a colour highlights only those stitches so you can find them
   quickly."
5. Open the colours drawer, click DMC 321 → only the red Xs are highlighted.
6. Mark every red X. Within ~2 s the banner replaces with: "You finished a
   colour — that's cross-country in a nutshell. Visit the Stash tab next…"
   plus an "Open Stash" button.
7. Click Open Stash → Manager opens, toast: "Tour complete! You're all set."

### Block flow

1. Reset, pick **I know my way around**, then **Section by section**.
2. Tracker opens with a 20×20 pattern. Focus mode is on, the TL 10×10 block
   is highlighted with a teal outline. The other three blocks are dimmed.
3. Hint banner (experienced verbosity): "Focus mode is on — the current
   10×10 block is highlighted. Complete every stitch in it."
4. Mark every red stitch in the TL block (~10 stitches). The focus auto-jumps
   to the next block (TR or BL depending on advance order), and the banner
   replaces with the Stash invitation.

### Parking flow

1. Reset, pick **I'm new**, then **Parking method**.
2. Tracker opens with a 20×20 confetti pattern (5 colours scattered across
   every quadrant). Focus mode is on, TL block highlighted.
3. Banner: "Switch to Navigate mode (Space). Pick a colour from the
   palette, then click the next chart cell where it appears to drop a
   parking marker. Tip: parking markers show where each thread is 'waiting'
   so you can stop and start without re-threading."
4. Press **Space** → mode toggles to Navigate. Click a colour in the palette
   → click any cell of that colour outside the TL block. A marker appears.
5. Within ~2 s the banner replaces with: "Marker placed. Switch back to Track
   mode and finish the highlighted 10×10 block — your 'parked' thread is
   waiting at the marker."
6. Press **Space** to return to Track. Mark every stitch in the TL block.
7. Banner replaces with the Stash invitation. Click Open Stash → tour
   complete.

### Freestyle flow

1. Reset, pick **No fixed method**.
2. Tracker opens with the 10×10 red heart. No focus chrome.
3. Banner: "Mark your first 10 stitches to complete the tour. Tap any cell
   to mark it done."
4. Mark 10+ stitches → banner replaces with Stash invitation.

### Skip path

1. Reset and click **Skip tour** on either the welcome or style step.
2. `cs_onboarding_step = 'complete'`, all welcome flags set to `1`. No
   sample project is saved. Reload — no modal appears.

### Reset clears all sample projects

1. Run any flow above so a sample project is saved.
2. Open Help Centre → click **Reset onboarding tour**. Page reloads.
3. DevTools → Application → IndexedDB → `CrossStitchDB` → `projects` store →
   confirm there is no entry whose id starts with `proj_onboarding_`.
4. Run a different flow → only the matching sample project appears.

---

## 4. Automated tests

`tests/onboardingStyles.test.js` (new, 9 tests) covers:

- All four `STYLE_KEYS` are exposed.
- Every `STYLE_DEFS[k].build()` returns a `version: 11` project with a
  non-zero stitched cell count and a `pattern.length === w * h`.
- The cross-country sample has ≥2 distinct DMC ids (otherwise the
  "finish one colour" goal is meaningless).
- The block + parking samples are 20×20 and pre-set
  `focusBlock: { bx: 0, by: 0 }` so the tracker boots with the right block
  highlighted.
- The parking sample contains stitches in **every** 10×10 quadrant (so
  parking actually pays off — a confetti pattern that's empty in 3
  quadrants would defeat the demo).
- The block sample has stitches in every quadrant (visual sanity).
- `_projectStats(p)` correctly reports `perColour[id].done/total`,
  `firstBlockDone/firstBlockTotal`, and `parkMarkers` length — these are
  the signals the per-style tour evaluators read.

`npm test -- --runInBand` → **557 passed / 47 suites** (was 548 / 46
before this phase).

`npm run lint:terminology` → clean.

---

## 5. Files changed

**New:**

- `tests/onboardingStyles.test.js` — Jest coverage for STYLE_DEFS, the four
  per-style sample builders, and the `_projectStats` evaluator.
- `docs/test-plans/HELP_AND_ONBOARDING_TEST_PLAN_PHASE6.md` — this document.

**Modified:**

- `onboarding.js` — added `STYLE_DEFS` (single source of truth for the four
  styles), `applyStyleSettings(styleKey)`, four sample builders
  (`buildCrossCountrySample`, `buildBlockSample`, `buildParkingSample`,
  `buildFreestyleSample`), `_projectStats(p)`, four per-style advance
  evaluators, per-style banner copy with persona-aware verbosity, a new
  `parking_marker_set` step value, and updated `OnboardingTour` exports.
  `reset()` now clears all five known sample project ids. The style picker
  in `WelcomeModal` now offers four buttons sourced from `STYLE_DEFS` and
  applies the matching prefs before navigation.

No edits to `creator/*` (so no bundle rebuild required) and no edits to
`tracker-app.js` — the existing `StitchingStyleStepBody` continues to work
for the toolbar's "change style" affordance because it commits the same
`cs_stitchStyle` value.

---

## 6. Validation summary

| Check | Result |
|---|---|
| `npm test -- --runInBand` | **557 passed / 47 suites** (was 548 / 46) |
| `npm run lint:terminology` | clean |
| `node build-creator-bundle.js` | not required (no creator/* edits) |
| Per-style sample shapes | verified by 6 new tests |
| Per-style stats evaluator | verified by 3 new tests |
