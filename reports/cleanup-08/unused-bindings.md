# PR 08 — Unread callback bindings in Creator (F-014)

Base: `27f7b1e0` (`main`). Prerequisites #362–#365 are merged ancestors. Scope: `creator-main.js` only; the other components have their own prompts.

## Candidates and verdicts

All seven audited bindings are `const x = React.useCallback(...)` inside `UnifiedApp`. The audit lines still match (1610, 1650–1716).

| Binding | Read anywhere? | Verdict |
|---|---|---|
| `switchToShowcase` | No | binding dropped, hook call kept |
| `handleHomeOpenCreatorWithImage` | No | binding dropped, hook call kept |
| `handleHomeOpenCreatorBlank` | Only named in a comment (`processPendingAction`) | binding dropped, hook call kept, comment reworded |
| `handleHomeOpenFile` | No | binding dropped, hook call kept |
| `handleHomeImportPattern` | No | binding dropped, hook call kept |
| `handleHomeOpenProject` | No | binding dropped, hook call kept |
| `handleHomeNavigateToStash` | No | binding dropped, hook call kept |

## How "unread" was established

- `grep -w` over every `*.js`, `*.html` and `*.json` outside `node_modules`, `compiled/` and `reports/` finds each name only at its declaration (plus the one comment above). Tests, HTML loaders, workers and `home-app.js` never name them.
- `creator-main.js` has no `window[...]`, `eval`, `new Function` or `Reflect` use, so no name can be reached by a computed or string-built key. The bindings are function-scoped `const`s inside `UnifiedApp`, so they cannot be reached from another file; none is returned, stored in a ref or object, passed as a prop, put in a dependency array, or assigned to `window`.
- The JSX returned by `UnifiedApp` receives `switchToTrack`, `switchToDesign` and `goHome` (all still bound) and no `handleHome*` or `switchToShowcase` value. The `__switch*` / `__goHome` globals are registered from the other six callbacks, not these seven.
- The Home screen these handlers served was retired (see the comment in the `mode` initialiser), which is why nothing calls them.

## What was changed and why it is behaviour-neutral

Only the `const name =` prefix of each declaration is removed. Every `React.useCallback(fn, deps)` call, its argument, its dependency array (including `[switchToTrack]` on `handleHomeOpenProject`) and its position in the hook sequence are unchanged, so:

- the 29-hook chain of `UnifiedApp` (14 memo, 6 effect, state and ref hooks) is the same length, order and kind;
- no hook is conditional, reordered or removed, and no cleanup moves;
- nothing is evaluated differently: the dropped bindings had no reader, and the remaining statements are expression statements that end in `;` (no ASI hazard: the preceding lines end in `);`).

Two comments were touched: one explains the bare hook calls, and the `processPendingAction` comment that referred to the now-unnamed `handleHomeOpenCreatorBlank` was reworded so it does not point at a missing name.

## Retained, not removed

- **The seven `useCallback` calls themselves.** They are pure memoisation with no cleanup, but the task requires every hook invocation to be preserved. Deleting them (a possible follow-up) would also leave `setCreatorResetKey` with no caller, and `creatorResetKey` would then be a constant `0`; that is a state-management decision, so it is not made here.
- **`window.__pendingCreatorJsonFile` and `window.__pendingTrackerImportFile`.** Their only producers in `creator-main.js` are the dead handlers; the consumers (`creator/useProjectIO.js`, `tracker-app.js`) stay untouched. Whether those consumers are still reachable from another producer is outside this PR.

## Evidence

Run on Node 22.22.0 against the unchanged base and then this head.

| Check | Base | Head |
|---|---|---|
| `npm test` (parallel) | 387 suites passed, 1 skipped; 5462 tests passed, 4 skipped | identical |
| `npm run lint:terminology` | passed | passed |
| `npm run lint:css-tokens` | exit 0 | exit 0 |
| `node build-runtime-js.js --check` | up to date | up to date (after regenerating) |
| `node build-sw.js --check` | exit 0 | exit 0 (after regenerating) |
| `git diff --check` | n/a | clean |
| `critical-lifecycle.spec.js`, Chromium only | n/a | 4 passed (Tracker, Creator comparison hooks, Stats, Home/Stash entry points) |

`creator-lifecycle-probe.cjs` (this directory) loads the real `create.html` in Chromium with an active project, locates the `UnifiedApp` fibre and records, at each step: the hook chain (kind, dependency count, `useCallback` function identity), the `__switch*` / `__goHome` / `__csActiveTool` / `__pending*` globals, live `window`/`document` listeners and intervals owned by `creator-main`, and the URL. Steps: mount, `cs:prefchange` rerender, `__switchToTrack`, `__switchToDesign`, `__switchToStats` open and close, `__switchToCreate`, `__switchToEdit`, `cs:openHelp` / `cs:openShortcuts`, then root unmount.

- Base, base repeated, and head produce byte-identical fingerprints (the A/A run shows the probe itself is deterministic).
- Every `useCallback` identity is stable across all rerenders and navigation steps; 8 owned listeners stay registered throughout and 0 remain after unmount; the globals are all removed on unmount.
- The same 3 console errors appear in every run: service-worker registration is blocked by the harness (`serviceWorkers: 'block'`) and one resource fails to load. They are environmental, not regressions.

## Limits

- Chromium only; Firefox and WebKit were not run (the Playwright build in this environment has no browsers installed, so the pre-installed Chromium was used through a scratchpad config).
- The full touch-tablet Playwright matrix (41 inherited failures on the base, per `docs/validation-baseline.md`) was not rerun and is not claimed green.
- The probe reads React internals, so it is diagnostic and not wired into `npm test`.
- Pattern Keeper PDF sources were not touched, so the PK comparator was not run.
- No user-visible change: `help-drawer.js` and `APP_CHANGELOG` are intentionally unchanged.
