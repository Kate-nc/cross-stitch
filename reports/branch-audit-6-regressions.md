# Branch Audit · Report 6 — Functional Regressions

Audit question for each surface: **does anything that worked on
main now work less well, fail outright, or hide?** Severity:
🔴 break · 🟠 hidden / much harder to find · 🟡 minor.

## Confirmed *not regressed* (the no-loss invariant)

- All keyboard shortcuts in [help-drawer.js](../help-drawer.js) `SHORTCUTS` are still bound on this branch — verified against the source registries in [creator/useKeyboardShortcuts.js](../creator/useKeyboardShortcuts.js) and the tracker handler in `tracker-app.js`.
- All 12 dialogs migrated to Overlay still expose their original options. Tested in `tests/Overlay.test.js`.
- Pattern Keeper PDF compatibility is bit-stable (covered by `tests/pdfTheme.test.js` + `tests/pdfThemePref.test.js`).
- IndexedDB schema unchanged; existing user data loads.
- Preferences keys unchanged; user-prefs schema migration not required.
- The legacy project-picker modal (`TrackerProjectPicker`) is still mounted as the "View all" fallback under HeaderProjectSwitcher.
- The standalone `StitchingStyleOnboarding` is still mounted as the toolbar-reopener path even after the Phase-5 wizard merge.
- `home-screen.js` is still mounted by `creator-main.js` when `mode === 'home'` per the documented intent.

## R1 · Tracker `lpanel` no longer offers a side-pane variant — 🟠 high

- See [report 5 V1](branch-audit-5-visual-regressions.md). Same root cause.
- **Pre-program behaviour.** On desktop the lpanel could sit beside the canvas.
- **Now.** Bottom-sheet at all viewports.
- **Effect.** Power users on desktop lose simultaneous canvas+settings visibility.

## R2 · Project switch from tracker rail = full reload — 🟠 high

- **Pre-program behaviour.** No rail existed; project switch was a modal that re-initialised the tracker in-page (no reload).
- **Now.** `TrackerProjectRail.openProject` does `window.location.reload()` ([tracker-app.js#L455](../tracker-app.js)).
- **Effect.** Same click count, much worse perceived performance.
- **Note.** The legacy modal path (TrackerProjectPicker) does not reload; it picks via `onPick(p)`. So the rail is *worse* than the surface it nominally replaces.

## R3 · Manager → Editor / Tracker buttons still missing — 🟠 high (carry-forward, not introduced)

- **Status.** Persisted from main per N-H1, N-M8.
- **Pre-program behaviour.** Manager Patterns cards have a "Track" button but no "Edit". To edit a Manager pattern you must navigate to Creator and re-open via project list.
- **Now.** Same. The redesign did not add the symmetric buttons even though `plan-c-*` wireframes call for them.
- **Verdict.** Not a regression introduced by this program — but a **carried-over** regression visible in this redesign because the program's stated intent (Hybrid 4) included Plan C's "Manager Patterns gain Edit and Track buttons". Worth listing as a critical fix before final ship.

## R4 · Sidebar density unchanged — 🟡 medium (carry-forward)

- **Status.** Same as main. ux-2 Bea persona's biggest friction (sidebar density) is not addressed.
- **Verdict.** Out of scope per ux-12 (Plan C Creator restructure deferred to a later cycle).

## R5 · "Limit to stash" warning shown to users with no stash — 🟡 medium (carry-forward)

- F-W1-H2 in ux-5. Not regressed; not fixed.

## R6 · No watermark control / no Anchor cross-ref in legend — 🟡 medium (carry-forward)

- F-W6-H3, F-W6-M2 in ux-5. Devi is still blocked. Out of scope per Hybrid 4 prioritisation.

## R7 · `/home` is the new default landing — 🟡 medium

- **Status.** Intentional per Phase 7 plan and `vercel.json` rewrite.
- **Pre-program behaviour.** `/` resolved to `index.html` (Creator).
- **Now.** `/` → `home.html`. Per-tool URLs still work and skip the redirect when an active project exists.
- **Effect.** Power users with a saved project hitting `index.html` directly see no change. Users on `/` see the new landing — this is the desired Phase-7 behaviour. Listed here only for transparency.

## R8 · `command-palette.js` action-set differences — 🟢 minor

- **Pre-program.** ~5 actions: switch creator/tracker/manager, help, shortcuts, preferences.
- **Now.** ~13 static actions plus dynamic recent-projects. The `act_reset_tour` action was deliberately removed (`onboarding.js` retired); a comment marks the spot.
- **Verdict.** Pure capability gain. No regression.

## R9 · `home-screen.js` standalone landing — 🟢

- **Status.** Trimmed by ~84 LOC but still mounted via `creator-main.js` `mode === 'home'`. Documented in `AGENTS.md`. Honest deferred-cleanup.
- **Verdict.** Acceptable.

## R10 · `setInterval` file-picker hacks removed — 🟢

- **Where.** `ca398f0 fix: remove setInterval file-picker hacks`.
- **Effect.** Two flaky import paths replaced with cleaner handlers + toast guidance. **Improvement, not regression.**

## R11 · Service-worker cache name v9 → v10 — 🟢

- Bumped twice: once to ship the new bundle (P7), once to evict the broken v9 bundle. Acceptable churn during the program. End state correct.

## R12 · `--ws-*` aliases removed — 🟢

- **Status.** Phase-8 cleanup as planned. Any third-party CSS or external customisation that used `--ws-accent` etc. would now break, but no such customisation is supported by this app. Internal use migrated.

## Summary

| Severity | Count | Carry-over | New |
|---|---|---|---|
| 🔴 critical | 0 | — | — |
| 🟠 high | 3 | 1 (R3) | 2 (R1, R2) |
| 🟡 medium | 4 | 4 | 0 |
| 🟢 cosmetic | 5 | — | 5 |

Net result: **2 new functional regressions introduced by the
program** (R1, R2 — both in the Tracker, both fixable in <50 LOC).
**1 carry-over regression** (R3) that was nominally in scope and
should be closed before ship.
