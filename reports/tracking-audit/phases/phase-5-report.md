# Phase 5 report: legibility, orientation and accessibility

Status: TRACK-09, TRACK-10 and COMMON-02 are done across four batches (PRs 300, 302, 303 and 304, all merged), with the screen-reader parts left out on purpose, as you asked at the start ("remove the screen reader aspects for now, we can add them in in a later work"). The true Fit bug had been fixed in Phase 2; batch 2 added the last piece (the lowest zoom). This closing PR holds the end-of-phase hunt, the whole-phase performance check and this report. I have not started Phase 6.

## What shipped

| PR | Batch | Findings | Outcome |
|---|---|---|---|
| #300 | 1: done state and low-zoom colour | TRACK-09 | A done stitch is its thread colour with a dimmed symbol (or, by choice, a corner tick); a not-done one is paler. Zoomed far out, every stitch is one coloured pixel, done in full colour and not done faded, so a 300x300 pattern at Fit is no longer a blank grid. Clear in greyscale at 3, 8 and 19 px |
| #302 | 2: pattern overview and Fit | TRACK-09, Fit | A small map of the whole pattern with the visible part outlined, tap or drag to jump, arrow keys when focused; built once in idle time, updated per mark for only the blocks it falls in, at most 200 px, hidden when the pattern fits, closed behind a button on a phone in Focus. Fit now holds a 300x300 pattern in a 600 px box (the lowest cell size is 1 px, was 2) |
| #303 | 3: keyboard | TRACK-10 | Enter, Space and Shift+Enter mark, unmark and fill a rectangle at the guide; the arrow keys move the guide in Mark and Navigate mode (Row mode keeps Up and Down); `[` and `]` change colour in every view; `G` and `Shift+G` go to the legend and back to the chart; Esc clears the guide; the shut More panel is out of the tab order; the chart shows an outline when the keyboard has it |
| #304 | 4: contrast, focus, 200% zoom, not colour alone | COMMON-02 | axe `color-contrast` nodes on the Tracker and both Stats pages: 166 to 0 in both themes, desktop and phone. The dark theme now gets its own accent; text tokens are 4.5:1 or better; the focus ring is the accent; the palette starts shut below 1024 px so a 200% zoom shows the chart; the selected colour, milestones and progress-chart lines differ in more than colour |
| this PR | closing | end-of-phase hunt | Nothing needed a code change; hunt harness, evidence, this report |

Changelog entries 1.0.132 to 1.0.135 and the in-app help (Finished stitches, Pattern overview, Marking with the keyboard, Zoomed in or on a narrow screen, and the shortcut list) cover all of it. Every batch had a Copilot review round except #304, which was merged before the review landed; the findings (4 on #300, 4 on #302, 3 on #303) were all real, were fixed, answered and resolved (details in `phase-5-bughunt.md`).

## Acceptance criteria against the prompt

| Criterion | Result |
|---|---|
| A screenshot with 20% of stitches marked is distinguishable in greyscale at 3, 8 and 19 px cells (automated, with a stated threshold) | Pass. Mean-luminance gap between a done and a not-done block, threshold 40: Symbol 95, 94, 121; Colour 95, 94, 65. Held by a unit test over every DMC colour and a colour grid (minimum 41.5) and a browser spec |
| At 300x300 Fit shows the whole pattern in colour with done areas visibly brighter; the overview rectangle follows scrolling and tapping it jumps there | Pass, with a reading to flag: done areas are in full thread colour and not-done ones are faded, so done is the more vivid and the darker of the two, not literally brighter. The prompt's own chosen option was "fill with thread colour". The rectangle follows scroll and a tap or drag jumps, in the browser spec |
| The whole pattern fits on both axes at Fit for square, wide and tall fixtures | Pass (300x300, 400x120, 120x400) |
| A keyboard-only user can move the guide, mark, unmark, undo, cycle colours, open the legend and change mode without a pointer; announcements read row, column, thread and state | Pass for everything except the announcements, which are deferred by instruction. The browser spec drives the whole loop with real key presses and fails on `main` |
| axe-core reports no serious or critical violations on `stitch.html` and the Stats pages; contrast 4.5:1 on banners; usable at 200% zoom | Contrast: pass (0 nodes of 166; the first-use banner is 8.96:1). 200%: pass at 720 by 450 for the Tracker, global Stats and Home. **Not met:** two axe rules remain on the Tracker, `aria-required-children` (4 nodes, critical) and `nested-interactive` (24, serious), both the palette's ARIA structure, deferred with the screen-reader work |

## End-of-phase bug hunt

See `phase-5-bughunt.md`. Nothing new needed fixing; what was checked: pixel diffs of 36 view, zoom and theme cases against the build before Phase 5 (Highlight view differs in 0% of pixels in all 16 cases; Symbol and Colour differ only by the intended new look), half stitches, partial stitches, knots, backstitch, counting aids, the spotlight, a work area and a parking marker all drawing correctly, reduced motion and forced colours, the overview at 300x300, 500x500 and 800x800, and the PDF export files (unchanged since the start of the phase). The hunts in the batches found and fixed real faults along the way (listed per batch in `phase-5-bughunt.md`), among them: the dark theme never getting its own accent; a white panel in dark Stats; a palette sheet covering the chart at 200% zoom; a Space key that both panned and marked; a Clear guide button that left the keyboard's anchor behind; a help-sync test that never checked keys named `[` or `]`.

## Performance

Rule: nothing slows the app by more than 5%. Every batch was measured interleaved against `main` and its numbers are in `phase-5-progress.md`. Whole phase, interleaved against the commit before Phase 5 (1.0.131), on the 300x300 fixture with 20% done, desktop, medians (4 rounds at 1x, 2 at 4x CPU throttle; the single mark from a dedicated 100-mark run, 4 rounds):

| | 1x | 4x |
|---|---|---|
| full repaint, per zoom step | -10.9% | -16.3% |
| pan, per step | -16.3% | -20.0% |
| drag of 60 cells | -2.5% | -1.5% |
| single mark | +1.4% | +3.9% |
| JS heap after GC | +1.6% (19.02 to 19.33 MB) | +1.8% |

The full repaint and pan got faster because batch 1's look caches replaced per-cell colour work in the drawing path. The single mark is the closest to the line, at +3.9% under 4x throttle, and the first, shorter run read +7.8% at 4x from two rounds (141.7 and 139.8 ms against 152.8 and 143.9), so I ran the dedicated 100-mark bench to settle it. Run-to-run noise in this sandbox is 5% or more on one figure (an A/A run of `main` against itself swung up to 8% on drag), so a result inside 5% is "not distinguishable", not "identical". The whole phase adds about 0.3 MB of heap; the overview alone adds nothing measurable (heap with it on and off at 300x300, 500x500 and 800x800 is the same within 0.1 MB). Bundle size grew a few percent for the tracker over the phase, which is the cost of the features, not a measured slowdown.

## Data and migration statement (as shipped)

- **Projects:** no change. Version stays 11. Nothing new is stored in a project.
- **Preferences (global):** `trackerDoneStyle` (`"fill"` default, or `"tick"`), `trackerMinimap` (`true` default). The accent preference `appAccentColour` is unchanged, but the default accent is no longer written onto the page inline (it was overriding the dark theme's own); a chosen, non-default accent still is.
- **Old projects and old preferences** open as before; nothing to migrate.

## Decisions and deviations you may want to revisit

- **Screen-reader work is deferred, as instructed.** That is: the live region and announcements, the screen-reader walkthrough, ARIA names, roles and `aria-pressed` states, `aria-required-children` and `nested-interactive` (palette tiles). The keyboard-only parts of those items were done. The existing Navigate-mode guide announcement is untouched.
- **Done is full colour, not-done is faded** (Pattern Keeper style), so Colour view's not-done stitches are paler than before (before they looked like done ones). The audit's word was "brighter"; I made the wording in help and the Preferences honest rather than the rendering match the word.
- **The lowest cell size is 1 px** (was 2) so Fit can hold a 300-stitch side in a 600 px box. It also lowers the minimum zoom for every pattern.
- **Navigate mode never marks**, from the keyboard either, narrower than the prompt's "in Navigate mode (or whenever the chart has focus)".
- **Space marks only once the arrow keys have the guide**; a click, Esc or a change of mode gives it back to hold-to-pan.
- **The colour legend starts shut below 1024 px** on any device (it already did on compact touch).
- **`--text-tertiary` is darker in the light theme and lighter in the dark theme**, so captions look a little stronger everywhere.
- **The overview is on by default**, shows only when the chart is bigger than its box, and has Preferences and View-tab controls.
- **Orientation aids:** the 10-stitch ruler emphasis and centre lines were already there; page or section boundaries are not drawn because an imported chart's page layout is not stored with the project.
- **Left alone:** the Stats activity heatmap's colour ramp and the multi-project chart colours (their values are also given as text or in the chart's table).

## Open items

- `aria-required-children` and `nested-interactive` on the palette (see above); the nested colour swatch is also a second keyboard stop on every tile.
- Tests that fail on `main` too, not caused by Phase 5: `creator-touch` x2 (stale since Phase 4), `import-review-phone` "Start stitching ... 0%", and two `phase3-hunt` two-tab specs (a "saved in another tab" dialog sometimes covers a button; it was already failing at a Phase 4 commit; not diagnosed). `save-durability` and the Keep screen on chip fail occasionally under load and pass on a rerun.
- A user-chosen custom accent colour is not checked for contrast. The Creator and Manager were looked at but not run through axe. Windows high-contrast mode, OS text-only zoom and large-text settings were not exercised.

## Not verified

Safari and Firefox (including the chart outline's `:has(canvas:focus-visible)`); real phones and tablets; a physical Mac keyboard; the 1000x1000 pattern in a browser (800x800 was run); half stitches and French knots at the keyboard guide (Enter toggles the full stitch only); a colour lock refusing a keyboard mark in the browser (pinned at source level); any screen reader; `npm run test:mobile-audit` (cannot run in this sandbox).
