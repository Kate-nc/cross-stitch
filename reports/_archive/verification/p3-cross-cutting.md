# P3 Verification: Cross-cutting (12)

| ID | Result | File:line | Notes |
|---|---|---|---|
| VER-AUTH-011 | PASS | sw-register.js:6-7 | 10-min interval (10*60*1000); controllerchange + refreshing flag prevents reload loops |
| VER-AUTH-012 | PASS | home-app.js:80-81,246 | activateAndGo calls setActiveProject(id) before navigating to stitch.html |
| VER-AUTH-013 | PASS | sync-engine.js:76-96 | computeFingerprint hashes pattern cell IDs + dimensions; tracking-only changes classified as merge-tracking |
| VER-FB-005 | PASS | modals.js:664; command-palette.js:131 | Toasts use plain text only; Icons.check() etc used for visual indicators |
| VER-FB-026 | PASS | manager-app.js:37-43 | British spelling consistent ("inventory", "colour", "organisation") in user-facing strings |
| VER-FB-027 | PASS | coaching.js:18 | Header notes "No emoji in user-visible copy. SVG icons via window.Icons." |
| VER-NAV-030 | PASS | creator-main.js:1366-1410 | Unknown ?action= param falls through; only known values handled |
| VER-NAV-031 | PASS | creator-main.js:1142 | mode=showcase → history.replaceState to ?mode=stats&tab=showcase |
| VER-NAV-032 | PASS | creator-main.js:1210-1222 | switchToStats stores prevModeRef; closeStats restores track/design/home |
| VER-NAV-033 | PASS | manager-app.js:1467,1472 | Track button: ProjectStorage.setActiveProject(p.id) + redirect to stitch.html?source=manager |
| VER-NAV-034 | PASS | command-palette.js:141-153 | File picker opens; selection dispatches cs:paletteImportFile CustomEvent |
| VER-NAV-035 | PASS | onboarding-wizard.js:70-105; preferences-modal.js:1140 | WelcomeWizard.shouldShow + reset() callable from Preferences |

## Defects to file

None — all 12 items PASS.

## Final result
- 12 items: 12 PASS / 0 FAIL / 0 PARTIAL / 0 UNVERIFIABLE
