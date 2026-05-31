# Release Verification — Phase 1 System Map

## Scope locked by reconciliation

Shipped verification set, per `00-reconciliation.md`:

1. Navigation bug + recurrence safeguard
2. Delete bug + toast undo
3. Stash partial-skein fix
4. Size & thread calculator
5. Lineart cleanup mode
6. Denoise mode
7. Crop / canvas resize
8. Cross-tab sync (INT-7)

## Runtime map

### Entry points
- `home.html` + `home-app.js`: default landing and project hub
- `create.html` / `index.html`: Creator surface
- `stitch.html` + `tracker-app.js`: Tracker surface
- `manager.html` + `manager-app.js`: stash and library surface

### Shared persistence
- `project-storage.js`: primary IndexedDB project store (`CrossStitchDB`) plus active-project pointer in `localStorage`
- `helpers.js` `saveProjectToDB(...)`: legacy single-project persistence still used as a safety net and handoff fallback
- `stash-bridge.js`: sync path into the manager database
- `cross-tab-coord.js`, `cross-tab-lock.js`, `cross-tab-resolution.js`: multi-tab notifications, advisory locking, and stale-read conflict handling

### Creator-specific notes
- `creator/useProjectIO.js` owns load, autosave, and Creator→Tracker handoff
- `creator/*.js` ship through `creator/bundle.js`; bundle was regenerated after the Creator-side INT-7 fix

### Tracker-specific notes
- `tracker-app.js` owns autosave, import paths, Tracker→Creator handoff, and active-project recovery
- Empty-state routing depends on `?from=home` / `?id=` healing plus `ProjectStorage.getActiveProject()` fallback

## Verification surfaces actually exercised

### Live smoke-walked
- `home.html`
- `create.html`: generated a pattern and reached the `Edit` tab with no blocking errors
- `manager.html?from=home`: loaded expected empty-state manager UI
- `stitch.html?from=home`: loaded expected empty-state tracker UI

### Code/test-audited in depth
- Creator/tracker persistence and handoff code paths
- Cross-tab save-resolution wiring
- Existing shipped guardrail suites for routing, delete undo, stash accounting, calculators, cleanup, denoise, resize, and cross-tab coordination

## Existing automated suite state

Final post-fix Jest run:
- Test Suites: `180 passed, 180 total`
- Tests: `2249 passed, 2249 total`
- Snapshots: `1 passed`

Most relevant suites for the shipped set:
- Routing/navigation: `landingRedirect.test.js`, `trackNavigationGuardrail.test.js`, `homeApp.test.js`, `projectLibrary.test.js`
- Delete/undo: `deleteUndoGuardrail.test.js`, `deletion-persistence.test.js`, `homeBulkDelete.test.js`
- Stash accounting: `stashPartialSkein.test.js`, `stashReacquisitionTracking.test.js`, `stashAwareCreator.test.js`, `limitToStashWarning.test.js`
- Calculator/resize: `size-calculator.test.js`, `threadCalc.test.js`, `canvasResize.test.js`
- Cleanup/denoise: `cleanupMode.test.js`, `cleanupSharedHelpers.test.js`, `cleanupSlimPatCache.test.js`, `denoiseMode.test.js`
- Cross-tab: `crossTabCoord.test.js`, `crossTabLock.test.js`, `crossTabResolution.test.js`, `crossTabSaveWiring.test.js`, `activeProjectPointerRace.test.js`, `cross-mode-persistence.test.js`

## Findings from mapping

### Material issue found during verification
The shipped INT-7 implementation was incomplete when this pass started: `ProjectStorage.saveChecked(...)` existed, but Creator and Tracker save paths were not actually routing through it. That meant stale-read conflict detection UI existed without live pre-save enforcement. This was fixed during the pass by introducing `saveWithConflictResolution(...)` in `cross-tab-resolution.js`, wiring Creator and Tracker persistence through it, rebuilding `creator/bundle.js`, and adding regression coverage.

### Minor hygiene issue found during smoke
`stitch.html?from=home` used to log a warning on the normal no-project empty-state path. That warning is now gated behind a real failed load attempt and has a regression test.

## Phase 1 outcome

System map is coherent, shipped scope is bounded, and the verification pass can rely on both live smoke coverage and a green automated suite. No remaining structural blockers were found after the INT-7 wiring repair.
