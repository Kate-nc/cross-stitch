# Phase 4 progress

Findings: TRACK-06, TRACK-07, TRACK-08, TRACK-05, TRACK-11, COMMON-01. Started from `main` at v1.0.125 (Phases 1 to 3 merged).

## Plan (batches, from the phase prompt)

1. TRACK-06 (legend panel over the header) and the touch-target and save-badge fixes.
2. Chart sizing, Focus by default on a phone, banner auto-hide, rail changes (TRACK-07).
3. Touch intent, Paint mode, Lock touches, "Undo N stitches" toast (TRACK-08) with the updated touch spec.
4. Persisted working context and the first-run / recap rework (TRACK-05).
5. Wake lock and the terminology pass (TRACK-11, COMMON-01).

## Things to settle on the way (conflicts with earlier phases and the repo's own docs)

- **COMMON-01 vs `TERMINOLOGY.md`:** the glossary already names the tracker's modes "Mark mode (and Navigate mode)". The audit recommends renaming Navigate to "Move" or "Guide"; the phase prompt says to confirm against the glossary and ask the user if it does not settle it. It does settle it (the other way), so this needs a decision from you in batch 5 before anything is renamed.
- **TRACK-08 vs Phase 2's catch-up question:** a rectangle fill of over 50 stitches already asks "today or catch-up" (batch 0 of Phase 3). The new "Undo N stitches" toast is for drag gestures over 5 cells; the two must not stack for the same gesture.
- **TRACK-05 vs Phase 1 (save safety):** new working-context fields (focus colour, mode, view, highlight style) must be written through the existing debounced save path and must not add a write on the mark path.
- **Phase 3 e2e specs** locate the timer chip by opening the palette; batch 2's rail and Palette changes must keep that reachable.

## Batch 1: legend panel and touch targets (TRACK-06, part of TRACK-07)

Reproduced first (new spec `tests/e2e/phase4-batch1.spec.js`): with the colour panel open the Create tab (and, by the same test, the others) was covered by `.lpanel` at 1024x768, 1280x800 and 1440x900; clear at 1920x1080, as the audit found.

- **TRACK-06:** the docked panel now starts below the header (`top: var(--app-header-height)`) instead of at the top of the window; the header is never covered, and the main column already clears the panel's width, so banners stay inside it. One CSS rule; no JavaScript, no layout variable needed.
- **Targets (phone and tablet, coarse pointer):** rail buttons 44 x 44 (were 40 below 480 px), palette and More close buttons, the legend close, the three tracker banner Dismiss buttons and the Toast Dismiss button all 44 x 44 minimum. The size audit in the new spec walks every visible button, link, input and select on 393x727 and 851x393 and expects none under 44 px.
- **Save badge:** on a phone (below 900 px) the header's project/save pill was a 22 px sliver, clipped and unreadable (the older rule meant to hide it never applied, because a later rule set it back to `display:flex`). It is now the save icon alone, with its words kept for screen readers; the project name stays in the project switcher beside it. A save error or conflict keeps its words on screen.

### Performance (batch 1)
Interleaved against `main`, 3 pairs of 90 taps: median ms main 10.8 / 10.6 / 11.6, branch 11.1 / 10.9 / 11.0. CSS and one wrapping span only; no regression (`perf/phase4-batch1/tap.txt`).

### Known limits
- The project name in the top bar is not shown under 900 px (it was clipped away already); the project switcher still shows it.
- Targets of dense controls elsewhere (More-panel chips, tabs) are the later batches' and the other audits' business; the audit here covers what is visible on the Tracker's first screen at 393x727 and 851x393.
