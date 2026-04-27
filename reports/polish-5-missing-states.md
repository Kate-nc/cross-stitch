# Polish Pass 5 — Missing States & Edge Case Visuals

**Audit date:** 2026-04-27  
**Headline:** **8 empty-state gaps** (a hard requirement per the audit spec), 7 silent-error sites, 8 async ops with no loading indicator, 6 missing selected-state surfaces, and several focus-ring regressions where `outline:none` lacks a `focus-visible` replacement.

---

## 1. Disabled states (no consistent CSS)

The repo lacks a generic `button:disabled` rule in [styles.css](styles.css). Only `.ttd-btn:disabled` ([styles.css](styles.css#L2339)) is styled. Affected:

- [tracker-app.js](tracker-app.js#L5710) — Undo/Redo `disabled={!trackHistory.length}` with no visual.
- [creator/ExportTab.js](creator/ExportTab.js#L21) — `EXPORT_DISABLED_CTA` style is defined but never wired up.
- [creator/ProjectTab.js](creator/ProjectTab.js#L284) — Export button disabled when palette empty, no visual.
- [home-screen.js](home-screen.js#L824) — Bulk delete/duplicate buttons.
- [components.js](components.js#L973) — Stats settings inputs.

**Fix:** add a single CSS block for `button:disabled, input:disabled, select:disabled`.

## 2. Selected / active states

- [manager-app.js](manager-app.js#L920) — filtered thread list rows have no selected highlight.
- [project-library.js](project-library.js#L75) — no `--active` styling for the currently-open project.
- [creator/MaterialsHub.js](creator/MaterialsHub.js#L88) — tab strip uses **hardcoded `#6366f1`** instead of `var(--accent)`.
- [creator/BulkAddModal.js](creator/BulkAddModal.js#L260) — kit chips selected state has insufficient contrast in light theme.
- [palette-swap.js](palette-swap.js#L1555) — disabled harmony toggle has no visual difference.

## 3. Focus rings missing replacement

Outline:none without focus-visible:

- [styles.css](styles.css#L725) — `.tb-proj-badge-input`
- [styles.css](styles.css#L740) — `.tb-context-name-input`
- [styles.css](styles.css#L2710) — `.session-toast input`

Reference correct implementation: [command-palette.js](command-palette.js#L288) `.cs-cmdp-input:focus-visible`.

## 4. Loading states (8 missing)

| File | Operation | Missing |
|---|---|---|
| [generate-worker.js](generate-worker.js) | Pattern generation (5–30s) | No spinner; user stares at blank canvas |
| [pdf-export-worker.js](pdf-export-worker.js) | PDF export | No progress UI for 2–10s |
| [creator/ExportTab.js](creator/ExportTab.js) | PDF/PNG/OXS export | Click → silence |
| [sync-engine.js](sync-engine.js) | Cloud sync | No spinner |
| [tracker-app.js](tracker-app.js) | Project + palette load race | No skeleton on legend |
| [project-library.js](project-library.js#L45) | `loading` flag set but not rendered | No skeleton cards |
| [backup-restore.js](backup-restore.js#L137) | Restore | Only error toast, no progress |
| [command-palette.js](command-palette.js#L439) | Recent commands fetch | "Loading…" text but no animated indicator |

## 5. Error states (silent failures)

- [backup-restore.js](backup-restore.js#L216) — `catch (_) {}` swallows backup-download errors.
- [project-storage.js](project-storage.js) — IDB save errors not surfaced.
- [import-formats.js](import-formats.js), [pdf-importer.js](pdf-importer.js) — silent on parse failure.
- [creator/generate.js](creator/generate.js) — worker errors not propagated.
- [stash-bridge.js](stash-bridge.js), [helpers.js](helpers.js) — DB read/write errors silent.

Reference correct pattern: [components.js](components.js#L1048) — `'Could not save snapshot — try again.'`

## 6. ⚠️ Empty states MISSING (hard requirement)

| # | Surface | File | Suggested copy |
|---|---|---|---|
| 1 | Manual patterns library | [project-library.js](project-library.js#L75) | "No patterns saved. Add a pattern from the Stash Manager." |
| 2 | Filtered thread inventory (no matches) | [manager-app.js](manager-app.js#L920) | "No threads match '{filter}'." |
| 3 | Shopping list (all covered) | [manager-app.js](manager-app.js#L1448) | "Your stash covers every thread in this project." |
| 4 | Activity heatmap (no data) | [stats-activity.js](stats-activity.js) | "No stitching logged yet." |
| 5 | Insights panel (none yet) | [stats-insights.js](stats-insights.js) | "Insights appear after a few stitching sessions." |
| 6 | Tracker session list | [tracker-app.js](tracker-app.js) | "No sessions yet. Start stitching to log one." |
| 7 | Export (no stitches) | [creator/ExportTab.js](creator/ExportTab.js) | "Add colours to the palette before exporting." |
| 8 | Aggregate shopping list | [manager-shopping.js](manager-shopping.js) | "All active projects are covered by stash." |

Reference correct empty state: [creator/MaterialsHub.js](creator/MaterialsHub.js#L150) — `"Your stash already covers every thread."`

**Fix:** introduce a shared `EmptyState` component in [components.js](components.js) consuming the canonical icon set; replace bare `null` / blank renders with it.

## 7. Success feedback gaps

- [home-screen.js](home-screen.js#L824) — bulk delete: no toast.
- [creator/ExportTab.js](creator/ExportTab.js#L310) — PDF export complete: no toast.
- [manager-app.js](manager-app.js#L1700) — add thread: no toast.
- [project-library.js](project-library.js) — rename project: no toast.
- [sync-engine.js](sync-engine.js) — sync complete: no toast.

## 8. Edge cases

- **Long names:** project / thread / insight headlines lack `text-overflow: ellipsis` patterns. Add a shared `.text-truncate-1` utility.
- **Many items:** [manager-app.js](manager-app.js#L920) renders all 500+ DMC threads; consider virtualisation if profiling shows lag on mobile.
- **5×5 patterns:** Tracker / Creator canvases zoom-to-fit but cells may render <10px. Enforce a min cell size at the canvas layer.
- **Special chars:** project names accept emoji/RTL but no `direction: auto` on the inputs. Low priority.

## Implementation priority

| Phase | Work |
|---|---|
| Block-the-PR | 8 empty states, generic disabled CSS, error toasts on async failures |
| Pre-release | Loading spinners, success toasts, focus-visible coverage |
| Future | Virtualisation, RTL/special-char handling |
