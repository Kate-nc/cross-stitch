# P1 Verification: Cross-cutting (25)

| ID | Result | File:line | Notes |
|---|---|---|---|
| VER-AUTH-003 | PASS | project-storage.js:320; header.js:134; home-screen.js:1250; manager-app.js:420; home-app.js:1008 | cs:projectsChanged dispatched; multi-listener |
| VER-AUTH-004 | PASS | stash-bridge.js:60; home-app.js:1011; manager-app.js:444; stats-insights.js:129 | cs:stashChanged propagates without race |
| VER-AUTH-005 | PASS | preferences-modal.js:43; header.js:402; coaching.js:65,382; apply-prefs.js:74 | cs:prefsChanged with detail payload |
| VER-FB-001 | PASS | home-screen.js:524-568 | BulkDeleteModal lists ≤5 names; Delete/Cancel |
| VER-FB-002 | FAIL | home-screen.js:521+ | Single project delete from card menu has no styled confirmation modal |
| VER-FB-003 | PARTIAL | preferences-modal.js:910,948,961,971,1220,1243; header.js:456,835; ExportTab.js:344 | 7+ window.confirm() calls remain unconverted |
| VER-FB-004 | PASS | header.js:290 | SaveStatus uses Icons.check() — no unicode glyph (P0 fix verified) |
| VER-FB-006 | PASS | pdf-export-worker.js:76-77,144-261 | progress() messages dispatched |
| VER-FB-017 | PARTIAL | manager-app.js:871,1248,1500 | Manager has undoActions; Creator delete project not verified |
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

1. **VER-FB-002 (FAIL)** — Single project delete from card menu lacks a styled confirmation modal. Implement using BulkDeleteModal pattern.
2. **VER-FB-003 (PARTIAL)** — 9 window.confirm() calls across preferences-modal.js (6), header.js (2), creator/ExportTab.js (1) need conversion to styled Overlay dialog modals.
3. **VER-FB-017 (PARTIAL)** — Audit Creator delete-project flow for missing undoAction callback.

## Final result
- 25 items: 20 PASS / 1 FAIL / 2 PARTIAL / 1 UNVERIFIABLE
