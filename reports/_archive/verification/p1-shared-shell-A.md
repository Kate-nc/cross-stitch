# P1 Verification: Shared Shell A (27)

| ID | Result | File:line | Notes |
|---|---|---|---|
| VER-EL-SCR-035-01-01 | PARTIAL | header.js:536-550; styles.css:140,462 | Logo nav home + scroll-to-top OK; safe-area inset via body padding rather than 1px from logo (cosmetic interpretation) |
| VER-EL-SCR-035-02-01 | PASS | header.js:564 | App-section tabs hidden on home; aria-current="page" on active |
| VER-EL-SCR-035-03-01 | PASS | header.js:574-593 | Sub-page dropdown only on creator/editor; legacy mapping to 'materials' |
| VER-EL-SCR-035-04-01 | PASS | header.js:100-176 | Async recents; empty fallback; "All projects…" → onOpenAll |
| VER-EL-SCR-035-05-01 | PASS | header.js:621-651; ContextBar:43-49 | maxLength 60; Enter commits; Escape reverts |
| VER-EL-SCR-035-06-01 | PASS | header.js:179-237 | 5 SaveStatus states; Retry → onRetry |
| VER-EL-SCR-035-07-01 | PASS | header.js:656-675 | Sync indicator status; click → home; icon reflects state |
| VER-EL-SCR-035-08-01 | PASS | header.js:677-686 | Visible only if window.CommandPalette; Ctrl/Cmd+K opens |
| VER-EL-SCR-035-09-01 | PASS | header.js:694-702 | Opens HelpDrawer Shortcuts tab; focus moves to search |
| VER-EL-SCR-035-10-01 | PASS | header.js:437-445 | aria-expanded reflects HelpDrawer.isOpen(); cs:helpStateChange listener |
| VER-EL-SCR-035-11-01 | PASS | header.js:728-858 | File menu conditionally renders by page context |
| VER-EL-SCR-035-11b-01 | PASS | header.js:412-425 | Theme cycle + UserPrefs.set + cs:prefsChanged |
| VER-EL-SCR-035-11d-01 | PASS | header.js:774-815 | Backup/Restore wired; legacy + CSB1; confirmation modal |
| VER-EL-SCR-035-11e-01 | PASS | header.js:847-890 | Sync visible only if SyncEngine; sync-plan-ready or confirm |
| VER-EL-SCR-036-01-01 | PASS | header.js:1-87 | Context bar editable; metadata + completion % progress |
| VER-EL-SCR-037-01-01 | PASS | help-drawer.js:559-583 | open/close; tab persisted; cs:helpStateChange dispatched |
| VER-EL-SCR-037-02-01 | PASS | help-drawer.js:1161-1206 | Tabs switchable; search filters; tab persisted |
| VER-EL-SCR-037a-01-01 | PASS | help-drawer.js:85-394 | Topics grouped by area; searchable; no emoji |
| VER-EL-SCR-037b-01-01 | PASS | help-drawer.js:688-734,621-633 | Shortcuts grouped/filtered; allowed kbd glyphs only |
| VER-EL-SCR-037c-01-01 | PASS | help-drawer.js:735-804 | Getting Started actions wired; drawer closes |
| VER-EL-SCR-038-01-01 | PASS | command-palette.js:362-367,398-402 | Ctrl/Cmd+K or button; Esc closes; Enter selects; arrows |
| VER-EL-SCR-038-02-01 | PASS | command-palette.js:212-223,336 | fuzzyScore; IME composition skipped |
| VER-EL-SCR-038-03-01 | PASS | command-palette.js:190-207,424-480 | Sections; async recents; "No matching actions" empty |
| VER-EL-SCR-038-04-01 | PASS | command-palette.js:351 | Hint footer with kbd glyphs only |
| VER-EL-SCR-039-01-01 | PASS | preferences-modal.js:38-45 | Auto-save; cs:prefsChanged dispatched |
| VER-EL-SCR-039-03-01 | PASS | preferences-modal.js:113-130 | Label/desc/control grid `1fr auto` |
| VER-EL-SCR-039-04-01 | PASS | preferences-modal.js:217-253 | Designer fields → UserPrefs; logo downscale 600×600 → data URL |

## Defects to file

1. **VER-EL-SCR-035-01-01 (PARTIAL)** — Cosmetic: logo position respects safe-area via body padding (16px), not literal 1px gap. Likely no fix required; spec wording was loose.

## Final result
- 27 items: 26 PASS / 0 FAIL / 1 PARTIAL / 0 UNVERIFIABLE
