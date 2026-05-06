# P2 Verification: Cross-cutting A (16)

| ID | Result | File:line | Notes |
|---|---|---|---|
| VER-AUTH-006 | PARTIAL | project-storage.js:262,442,447; helpers.js:240 | _deletedIds set + saveProjectToDB skip; no user-facing "deleted" message |
| VER-AUTH-007 | PASS | header.js:394; user-prefs.js | Expected — no cross-tab StorageEvent listener for prefs |
| VER-AUTH-008 | PASS | tracker-app.js:6575; manager-app.js:420,449; home-app.js:1008,1014 | cs:projectsChanged dispatched + multi-listener |
| VER-AUTH-009 | PASS | sync-engine.js:152+,780-900,920+ | exportSync + classifyProjects + mergeTrackingProgress all present |
| VER-AUTH-010 | PASS | user-prefs.js:193-194; create.html:139; stitch.html:102; home-app.js:442 | experimental.* defaults false; conditional script load |
| VER-DATA-025 | PASS | tracker-app.js:1215,1599-1600 | Proposal D real-time stash deduction implemented |
| VER-FB-007 | FAIL | generate-worker.js:73,215 | Worker sends only error messages; no progress (Quantizing/Dithering/Cleanup) |
| VER-FB-008 | FAIL | analysis-worker.js:282,284 | Worker silent during analysis; no progress callback |
| VER-FB-009 | PARTIAL | manager-app.js:624,652,654; backup-restore.js:188-230 | Status messages exist but not granular per-stage |
| VER-FB-010 | FAIL | header.js:851; home-screen.js:1357 | Sync completion toast exists; no "Syncing…" toast during merge |
| VER-FB-011 | FAIL | manager-app.js:626; backup-restore.js:188-230 | Modal status only; no Toast.show success on download |
| VER-FB-012 | FAIL | manager-app.js:654; backup-restore.js | Modal status only; no "Restore complete: N projects" toast |
| VER-FB-013 | FAIL | command-palette.js:131,402 | Error toasts only; no success feedback for high-impact actions |
| VER-FB-014 | FAIL | helpers.js:252 | saveProjectToDB only console.error; no toast surface |
| VER-FB-015 | PARTIAL | generate-worker.js:73,215; create.html:57 | Worker sends error postMessages; worker.onerror surface uncertain |
| VER-FB-016 | PASS | import-engine/bundle.js:3026-3032,3161; import-formats.js:105-290 | showImportError dispatches descriptive error toasts |

## Defects to file

1. **VER-AUTH-006** — Surface "project deleted in another tab" toast on save-skip.
2. **VER-FB-007** — Add progress postMessages in generate-worker.js (Quantizing/Dithering/Cleanup).
3. **VER-FB-008** — Add progress callback in analysis-worker.js if duration >1s observed.
4. **VER-FB-009** — Add granular per-stage progress to backup/restore modal.
5. **VER-FB-010** — Dispatch persistent "Syncing…" toast before SyncEngine.executeImport.
6. **VER-FB-011** — Toast.show("Backup downloaded successfully") after download completes.
7. **VER-FB-012** — Toast.show("Restore complete: N projects imported") after restore succeeds.
8. **VER-FB-013** — Audit command-palette handlers; add success toasts for delete/export/sync.
9. **VER-FB-014** — Wrap saveProjectToDB callers; toast on error.
10. **VER-FB-015** — Verify worker.onerror callback in Creator surfaces error toasts.

## Final result
- 16 items: 6 PASS / 7 FAIL / 3 PARTIAL / 0 UNVERIFIABLE
