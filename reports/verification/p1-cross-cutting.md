# P1 Verification: Cross-cutting (25)

| ID | Result | File:line | Notes |
|---|---|---|---|
| VER-AUTH-003 | PASS | project-storage.js:320; header.js:134; home-screen.js:1250; manager-app.js:420; home-app.js:1008 | cs:projectsChanged dispatched; multi-listener |
| VER-AUTH-004 | PASS | stash-bridge.js:60; home-app.js:1011; manager-app.js:444; stats-insights.js:129 | cs:stashChanged propagates without race |
| VER-AUTH-005 | PASS | preferences-modal.js:43; header.js:402; coaching.js:65,382; apply-prefs.js:74 | cs:prefsChanged with detail payload |
| VER-FB-001 | PASS | home-screen.js:524-568 | BulkDeleteModal lists ≤5 names; Delete/Cancel |
| VER-FB-002 | PASS | home-screen.js:484-510,766-771,778-825 | StateChangeMenu “Delete project…” wired to BulkDeleteModal via confirmDelete state (commit d514c6b) |
| VER-FB-003 | PASS | modals.js (ConfirmDialog helper); preferences-modal.js:910,953,972,988,1243,1266; header.js:456,824; creator/ExportTab.js:344 | All 9 window.confirm() calls replaced with window.ConfirmDialog.show() (commit b1fed92) |
| VER-FB-004 | PASS | header.js:290 | SaveStatus uses Icons.check() — no unicode glyph (P0 fix verified) |
| VER-FB-006 | PASS | pdf-export-worker.js:76-77,144-261 | progress() messages dispatched |
| VER-FB-017 | PASS | manager-app.js:871,1248,1500; home-screen.js:778-825 | Manager + Home (post-fix) snapshot → deleteMany → toast undoAction restores via ProjectStorage.save(); Creator has no delete-project flow (deletion lives in Home/Manager only) |
| VER-FB-018 | PASS | toast.js:169-171 | Undo callback + "Undone" follow-up toast |
| VER-FB-022 | PASS | creator/Sidebar.js:23-26 | Cleanup warnings displayed |
| VER-FB-023 | PASS | creator/LegendTab.js:63 | Status owned/partial/needed → success/mid/danger |
| VER-NAV-009 | PASS | header.js:256-261,211 | "All projects…" → onOpenAll → setActiveProject + navigate |
| VER-NAV-010 | PASS | header.js:558 | Logo → home.html; full page load clears state |
| VER-NAV-011 | PASS | command-palette.js:549 | Ctrl/Cmd+K opens palette globally |
| VER-NAV-012 | PASS | command-palette.js:364,533 | Esc + scrim close without nav |
| VER-NAV-013 | PASS | project-storage.js:461,320 | setActiveProject + cs:projectsChanged listeners |
| VER-NAV-014 | PASS | create.html:37 | ?from=home OR ?action= bypasses redirect guard |
| VER-NAV-015 | PASS | creator-main.js:811 | confirm() blocks new project on Cancel |
| VER-NAV-016 | PASS | manager-app.js:37-43,929 | Inventory tab default |
| VER-NAV-017 | PASS | manager-app.js:537-551 | beforeunload saves via StashBridge + ProjectLibrary |
| VER-NAV-018 | PASS | manager-app.js:41,914 | ?tab=patterns deep link |
| VER-NAV-019 | PASS | creator-main.js:1385 | action=home-image-pending reconstructs from sessionStorage |
| VER-NAV-020 | PASS | creator/ExportTab.js:391; creator/useProjectIO.js:103-130 | handleOpenInTracker saves + setActiveProject + navigates |
| VER-NAV-021 | UNVERIFIABLE | styles.css:5614 | Mobile Track button works; touch swipe-interference prevention not explicitly coded |

## Defects to file

_All P1 cross-cutting defects from this batch have been resolved — see commits 9ad978f, d514c6b, b1fed92, and the home-screen.js undoAction wiring._

## Final result
- 25 items: 23 PASS / 0 FAIL / 0 PARTIAL / 1 UNVERIFIABLE
