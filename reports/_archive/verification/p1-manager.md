# P1 Verification: Manager (27)

| ID | Result | File:line | Notes |
|---|---|---|---|
| VER-EL-SCR-029-02-01 | PASS | manager-app.js:53,720-722,954 | brandFilter 'all'/'dmc'/'anchor'; filter applied |
| VER-EL-SCR-029-03-01 | PASS | manager-app.js:747-757 | rgbToHue() returns 361 when sat<0.05 to sort grays to end |
| VER-EL-SCR-029-05-01 | PASS | manager-app.js:1125,1200-1210 | Card click opens panel; +/- persists via updateThread |
| VER-EL-SCR-029-06-01 | PASS | manager-app.js:681-689 | partialStatus='used-up' auto-zeros owned; owned>0 clears used-up |
| VER-EL-SCR-029-07-01 | PASS | manager-app.js:424-451 | cs:stashChanged listener suppresses auto-save, reloads from IDB |
| VER-EL-SCR-029-09-01 | PASS | manager-app.js:1057-1072; stash-bridge.js:496 | Conflict cards sorted by deficit desc |
| VER-EL-SCR-029-10-01 | PASS | manager-app.js:591-606 | lowStockNeeded excludes completed; lowStockNotNeeded excludes active |
| VER-EL-SCR-030-02-01 | PASS | manager-app.js:56,930-935 | patternFilter defaults to 'all' |
| VER-EL-SCR-030-03-01 | PASS | manager-app.js:772-783 | date_desc/date_asc compare IDs; status priority order |
| VER-EL-SCR-030-04-01 | PASS | stash-bridge.js:485-495 | Auto-synced entries get linkedProjectId |
| VER-EL-SCR-030-05-01 | PASS | stash-bridge.js:485-495 | syncProjectToLibrary preserves designer/tags |
| VER-EL-SCR-030-07-01 | UNVERIFIABLE | project-library.js:144-146 | Pseudo-projects created; button impl needs UI verification |
| VER-EL-SCR-031-02-01 | PASS | manager-app.js:73,509 | stashDefaultBrand UserPref read/write |
| VER-EL-SCR-031-03-01 | PASS | preferences-modal.js:39-43 | UserPrefs.set() + cs:prefsChanged dispatched |
| VER-EL-SCR-032-01-01 | PASS | creator/BulkAddModal.js:161-163 | threadKey(brand,id) composite keys |
| VER-EL-SCR-032-02-01 | PASS | stash-bridge.js:60 | _dispatchStashChanged after updateThreadOwned |
| VER-EL-SCR-032-03-01 | PASS | creator/BulkAddModal.js:212-235 | Kit selector resolves ids to threads with brand |
| VER-EL-SCR-033-02-01 | PASS | onboarding-wizard.js:57,71,79,241-254 | dismissOnTargetClick=true closes tour |
| VER-EL-SCR-051-01-01 | PASS | project-library.js:96-115,144-146; home-screen.js:355-359,464-468 | patternToPseudoProject sets managerOnly:true; ProjectCard renders “Stash Manager only” badge at home-screen.js:358 (full card) and CompactProjectRow at line 466 |
| VER-EL-SCR-051-02-01 | PASS | manager-app.js:1334 | onOpenManagerOnly invoked on pseudo-project click |
| VER-EL-SCR-051-03-01 | PASS | project-library.js:77-78 | Reconciliation re-runs on visibilitychange |
| VER-EL-SCR-057-02-01 | PASS | insights-engine.js:167 | Insights suppressed if activeDays<3 |
| VER-EL-SCR-057-03-01 | PASS | stats-insights.js:56 | durationSeconds preferred over durationMinutes*60 |
| VER-EL-SCR-059-01-01 | PASS | stats-page.js:1045 | Promise.all() loads summaries in parallel |
| VER-MANAGER-GLOBAL-01 | PASS | stash-bridge.js:54-60 | cs:stashChanged after writes |
| VER-MANAGER-GLOBAL-02 | PASS | backup-restore.js:391 | restore() dispatches cs:backupRestored |
| VER-MANAGER-GLOBAL-04 | PASS | help-drawer.js:741-742 | "Restore tutorials" calls WelcomeWizard.reset(page) |

## Defects to file

1. **VER-EL-SCR-030-07-01 (UNVERIFIABLE)** — Verify “Open in Creator” button conditional on linkedProjectId presence.

## Final result
- 27 items: 26 PASS / 0 FAIL / 0 PARTIAL / 1 UNVERIFIABLE
