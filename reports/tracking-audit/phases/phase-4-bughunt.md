# Phase 4 bug hunt log

## Batch 1 (TRACK-06, targets and the save badge)

### Exercised
- `npm test` (304 suites, 4,059 tests), terminology lint, `node build-runtime-js.js --check`. Playwright (Chromium, local CDN): `phase4-batch1` (9 tests: reachability at 1024x768, 1280x800, 1440x900 and 1920x1080; the 44 px size audit and the save status at 393x727 and 851x393; no sideways scroll on Creator, Home and Manager at 393 px).
- Reproduced before fixing: the reachability test failed at 1024, 1280 and 1440 (Create covered by the panel) and passed at 1920, as the audit found.
- Visual check (screenshots): 1440x900 header clear and banners inside the main column; phone portrait and landscape; Creator at 393 px (its own compact header, unaffected).
- Performance: tap latency interleaved against `main`, 3 pairs of 90 taps: medians main 10.8 / 10.6 / 11.6, branch 11.1 / 10.9 / 11.0 (`perf/phase4-batch1/tap.txt`). The change is CSS and one wrapping span, so nothing on the mark path moved.

### Bugs found
- **Fixed here:** the older rule meant to hide the project/save pill on phones (`.tb-proj-badge{display:none}` under 600 px) never applied, because a later rule with equal specificity set it back to `display:flex`; the pill was squeezed to a 22 px sliver instead. The new compact icon replaces it.
- **Found, fixed here:** the save status shares the class of the percentage chip (`tb-proj-badge-pct`), so hiding the percentage on phones would also have hidden the save status; the rule excludes it.
- **Noted, not changed:** the project name in the top bar (editable by tapping) is hidden under 900 px because it was already unusable there; renaming is still possible from the project switcher menu.

### Not verified
`npm run test:mobile-audit`: its specs do not install the local library server, so every spec that needs React times out in this sandbox (cdnjs is blocked), on `main` as well as here; the unit tests that read the same CSS and header source pass. Safari, Firefox, real devices; 200% browser zoom (next batches); the Toast dismiss button on the Creator and Home pages at 44 px (CSS applies on coarse pointers only; not screenshotted on those pages).
