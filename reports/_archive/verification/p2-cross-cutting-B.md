# P2 Verification: Cross-cutting B (16)

| ID | Result | File:line | Notes |
|---|---|---|---|
| VER-FB-019 | PASS | toast.js:40 | Container uses bottom:max(24px, env(safe-area-inset-bottom)) |
| VER-FB-020 | PASS | toast.js:17,91-97 | Default max 3 visible; max-width clamps for narrow viewports |
| VER-FB-021 | PASS | toast.js:7-14 | toastsEnabled() honoured; errors bypass preference |
| VER-FB-024 | PARTIAL | creator-main.js:1309-1320 | Coachmark renders + auto-completes on first edit; no explicit 6s timer |
| VER-FB-025 | PARTIAL | coaching.js:10-14 | firstStitch_tracker step defined; rendering path not located |
| VER-FB-028 | PASS | apply-prefs.js:25; styles.css:433; onboarding-wizard.js:32 | prefers-reduced-motion suppressed via @media + pref class |
| VER-FB-029 | PASS | components/Overlay.js:60-100 | Focus trap; ESC close; Tab cycles |
| VER-FB-030 | PASS | modals.js:325; creator/AdaptModal.js:515; components/Overlay.js:159,163 | aria-modal=true + aria-labelledby auto-derived |
| VER-NAV-022 | PASS | sw.js:1-2,118-129 | home.html in PRECACHE_URLS; navigation fallback to cached entry |
| VER-NAV-023 | UNVERIFIABLE | (no swipe handler in home-app.js) | Spec acknowledges P3 opportunity if not implemented |
| VER-NAV-024 | PASS | creator-main.js:1179,1189,1204 | history.replaceState used (no new entries) |
| VER-NAV-025 | PASS | header.js:555,665 | Logo → home.html via __goHome() / location.href |
| VER-NAV-026 | PARTIAL | header.js:595-620 | Recent projects render on cs:projectsChanged; 100ms timing not enforced |
| VER-NAV-027 | PASS | help-drawer.js:588-592; header.js:689-700 | HelpDrawer.open + focus trap on first focusable |
| VER-NAV-028 | PARTIAL | help-drawer.js:542-546 | Tab persisted; per-tab scroll position not preserved |
| VER-NAV-029 | PASS | header.js:743-782 | File menu actions wired (New/Preferences/Backup) |

## Defects to file

1. **VER-FB-024** — Add explicit 6s auto-dismiss timer to first-stitch coachmark.
2. **VER-FB-025** — Wire Tracker first-stitch coachmark rendering (step ID exists, rendering missing).
3. **VER-NAV-026** — No 100ms timing enforcement on project switcher updates.
4. **VER-NAV-028** — Help drawer tab switching resets scroll; preserve per-tab scroll.

## Final result
- 16 items: 10 PASS / 0 FAIL / 5 PARTIAL / 1 UNVERIFIABLE
