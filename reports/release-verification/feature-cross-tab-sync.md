# Feature Verification — Cross-Tab Sync (INT-7)

## Outcome

Pass after repair during verification.

## Behaviours verified
- Cross-tab coordination, advisory locking, and resolution logic suites are green.
- Creator and Tracker save paths now route through conflict-aware persistence before normal save completion.
- Creator bundle was regenerated after the Creator-side wiring change.
- The active-project pointer race guardrails remain green.

## Evidence used
- Green suites: `crossTabCoord.test.js`, `crossTabLock.test.js`, `crossTabResolution.test.js`, `crossTabSaveWiring.test.js`, `activeProjectPointerRace.test.js`, `cross-mode-persistence.test.js`
- Code audit of `cross-tab-resolution.js`, `creator/useProjectIO.js`, `tracker-app.js`

## Behaviours that failed verification
- Initial failure: stale-read conflict detection was only partially shipped. `ProjectStorage.saveChecked(...)` existed, but Creator and Tracker were not actually using it on their main save paths.
- Resolution applied in this pass: added `saveWithConflictResolution(...)`, wired both surfaces through `persistProjectRecord(...)`, rebuilt `creator/bundle.js`, updated affected guardrail tests, and added `crossTabSaveWiring.test.js`.

## Spec items not fully tested
- A true multi-tab manual conflict prompt (`keep` vs `reload`) was not replayed in-browser across separate tabs; this area is covered primarily by automated tests in this pass.
- No cross-browser matrix was run for BroadcastChannel availability or degraded behaviour.
