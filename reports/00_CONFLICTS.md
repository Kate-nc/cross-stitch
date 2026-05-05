# Spec Conflict Resolution

> Phase 3 output. Surveys all Phase 1 + Phase 2 reports for inconsistencies.
> Each conflict is presented with both versions verbatim and a proposed resolution.

## Methodology

- Scanned all 8 area specs (`home.md`, `creator-prepare-materials.md`, `creator-pattern-canvas.md`, `creator-legend-export.md`, `creator-modals.md`, `tracker.md`, `manager.md`, `shared-shell.md`) for duplicate EL-IDs and contradictory element behaviours.
- Scanned all 8 cross-cutting reports (`navigation.md`, `auth-session.md`, `data-flow.md`, `error-handling.md`, `loading-empty-states.md`, `responsive.md`, `feedback.md`, `keyboard-a11y.md`) for cross-area contradictions, severity disagreements, and element-reference mismatches.
- Verified all referenced SCR-IDs exist in `00_INTERFACE_MAP.md`.
- Checked for deprecated CSS tokens (`--ws-*`), emoji/unicode rule violations (AGENTS.md house rules), and pattern inconsistencies.

## Inventory snapshots

- **Total area specs**: 8
- **Total cross-cutting reports**: 8
- **Distinct EL-IDs**: 240+ (no exact duplicates across files detected)
- **Distinct VER-IDs**: 200+ verification TODOs
- **Distinct SCR-IDs referenced**: 61 (all validated present in interface map)
- **Deprecated tokens found**: 0 (--ws-* prefix successfully removed in Phase 8)
- **Emoji/unicode violations in specs**: 0 (â†’ â† characters only used in keyboard legend contexts per AGENTS.md rules; âš ï¸ âœ… symbols only in audit/branch reports, not user-facing specs)

## 1. Duplicate EL-IDs across files

_(no conflicts found in this category)_

**Rationale**: All EL-IDs are unique within their screen context. While `EL-SCR-052-01` and `EL-SCR-061-01` both exist, they are intentionally part of separate screens (SCR-052 on home/manager, SCR-061 on home-screen context), and no EL-ID is defined identically in two different area specs.

## 2. Inconsistent element behaviour

**VER-CONF-001 [P1]** â€” Header element EL-SCR-001-01 defined inconsistently across specs.

**Conflict locations**:
- [home.md](reports/specs/home.md#L25): `### EL-SCR-001-01: Header (shared)` â€” describes Header component as part of SCR-001
- [shared-shell.md](reports/specs/shared-shell.md#L15): `### EL-SCR-035-01: Logo/Home Link` â€” Header is part of SCR-035, not SCR-001

**Statement 1 (home.md:25-28)**: "EL-SCR-001-01: Header (shared) â€” Location: top of page â€” Type: navigation overlay â€” Component: `Header` ([header.js](../../header.js)) â€” Visible when: always"

**Statement 2 (shared-shell.md:15-43)**: "EL-SCR-035-01: Logo/Home Link â€” Location: Top-left corner of topbar â€” Type: Navigation link... â€” Component: [header.js](header.js#L232-L250)"

**Proposed resolution**: `home.md` should NOT specify EL-SCR-001-01 as the Header. The Header (SCR-035) is a shared component that appears on all pages. Instead, home.md should begin with EL-SCR-001-02 (Home Tab Bar) or reference that "SCR-001 includes the shared Header (SCR-035) at the top; see [shared-shell.md](shared-shell.md#L15) for Header element specs." This avoids duplication and confusion about which spec owns the Header's behaviour.

**Action for Phase 4**: Update home.md to remove EL-SCR-001-01 definition and add a forward reference: "The Header (EL-SCR-035-01) is shared across all pages; see shared-shell.md for specifications."

---

## 3. Area-spec vs cross-cutting contradictions

**VER-CONF-002 [P1]** â€” Responsive report references wrong EL-ID for Home project grid.

**Conflict locations**:
- [responsive.md](reports/cross-cutting/responsive.md#L510): VER-RESP-P2-004 references `"EL-SCR-001-01"`
- [home.md](reports/specs/home.md#L25-L40): EL-SCR-001-01 is actually the Header, not the project grid

**Statement 1 (responsive.md:510)**: "`VER-RESP-P2-004` â€” Home project grid (EL-SCR-001-01) on tablet portrait shows â‰¥ 2 project cards per row..."

**Statement 2 (home.md:25-40)**: "EL-SCR-001-01: Header (shared)... Type: navigation overlay â€” Component: `Header`"

**Proposed resolution**: responsive.md VER-RESP-P2-004 should reference `EL-SCR-053-01` (Project Card Container, the repeating element in the project list) or `EL-SCR-001-10` (Projects List Section), not EL-SCR-001-01. The correct EL-ID depends on the level of granularity intended (per-card vs. whole list).

**Action for Phase 4**: Audit all references to EL-SCR-001-01 in responsive.md and replace with the correct element ID (likely EL-SCR-001-10 for the list container or describe as "Home project cards").

---

**VER-CONF-003 [P2]** â€” Severity labelling inconsistency for same behaviour across files.

**Conflict locations**:
- [feedback.md](reports/cross-cutting/feedback.md#L338): VER-FB-004 marked `[P3]` (cosmetic)
- [responsive.md](reports/cross-cutting/responsive.md#L382): Creator top toolbar buttons `[P1]` (misleading)

**Statement 1 (feedback.md:338)**: "`VER-FB-004` [P3] â€” SaveStatus badge displays "Saved âœ“" using unicode `âœ“`. Replace with `Icons.check()` SVG + "Saved" text or icon-only style."

**Statement 2 (responsive.md:382)**: "`VER-RESP-P1-001` [P1] â€” Creator ToolStrip buttons (EL-SCR-011-*) measure â‰¥ 44 Ã— 44 CSS px on touch-tablet... Current size 22 Ã— 22 px; must increase button or padding to pass."

**Proposed resolution**: The SaveStatus badge emoji replacement (P3 cosmetic) and the ToolStrip button sizing (P1 critical) are distinct issues and should keep separate severity. However, the SaveStatus item in feedback.md should note that this is a house-rule violation (AGENTS.md: no emoji in user-facing UI), which elevates it to **P1 (Blocking)** if it appears in user-facing text. Verify whether SaveStatus is visible to end users; if so, upgrade feedback.md VER-FB-004 to P1.

**Action for Phase 4**: Review feedback.md VER-FB-004 and verify whether SaveStatus badge is user-facing. If yes, mark as **[P1]** (house-rule violation). If no (internal debug only), keep as **[P3]**.

---

## 4. Screen ID drift / dangling references

_(no conflicts found in this category)_

**Rationale**: All SCR-IDs referenced in specs exist in `00_INTERFACE_MAP.md`. Cross-reference spot-check:
- responsive.md mentions SCR-001, SCR-005â€“009, SCR-014â€“020, SCR-024â€“028, SCR-029â€“033, SCR-035â€“050 âœ… All valid
- loading-empty-states.md mentions SCR-001â€“004, SCR-007â€“010, SCR-012â€“027, SCR-029â€“031, SCR-037â€“039, SCR-043â€“048 âœ… All valid
- No orphaned or future-tense SCR-IDs detected.

## 5. Severity disagreements

**VER-CONF-004 [P0]** â€” BulkAddModal StashBridge availability severity mismatch.

**Conflict locations**:
- [feedback.md](reports/cross-cutting/feedback.md#L68): Marked as error (non-blocking, 8s timeout)
- [shared-shell.md](reports/specs/shared-shell.md) or [creator-prepare-materials.md](reports/specs/creator-prepare-materials.md): Should describe fallback behaviour

**Statement 1 (feedback.md:68)**: "Creator: BulkAdd missing StashBridge â€” `creator/BulkAddModal.js:150` â€” error â€” 'StashBridge is not available. Make sure stash-bridge.js is loaded.' â€” 8000 â€” No window.StashBridge not defined"

**Proposed resolution**: If StashBridge is unavailable when Creator BulkAddModal attempts to call it, this should be **P1 (Blocking)** because the feature is unusable. Either:
1. BulkAddModal should not render if StashBridge is not available (graceful degradation), or
2. The error must be surfaced with a clear recovery path (e.g., "Reload the page to ensure all scripts loaded").

Verify that `creator/BulkAddModal.js:150` includes a guard clause and the error toast message.

**Action for Phase 4**: Confirm StashBridge guard clause exists in creator/BulkAddModal.js. If missing, add it and mark as **P1 TODO** in specs.

---

## 6. Pattern inconsistencies (confirmation, feedback, focus, etc.)

**VER-CONF-005 [P2]** â€” Deletion confirmation patterns inconsistent across modals.

**Conflict locations**:
- [feedback.md](reports/cross-cutting/feedback.md#L321): "BulkDeleteModal correctly lists â‰¤5 project names; click Delete executes; Escape or Cancel closes without action."
- [feedback.md](reports/cross-cutting/feedback.md#L323): "Single project delete from card menu ([home-screen.js](home-screen.js) card detail panel) currently shows NO confirmation."

**Statement 1**: Multi-project delete uses styled BulkDeleteModal with explicit confirmation.

**Statement 2**: Single project delete has no confirmation (described as gap).

**Proposed resolution**: Standardize on a single confirmation pattern:
- **Option A** (recommended): All destructive deletions use the same BulkDeleteModal component (even for single item).
- **Option B**: Single deletes use a smaller inline confirmation, BulkDeletes use BulkDeleteModal.

**Action for Phase 4**: Phase 1 or Phase 2 should have resolved this. Verify that single project delete now shows a styled confirmation modal matching BulkDeleteModal (if Option A chosen) or implement Option B if preferred. This is currently marked as a P1 TODO in feedback.md.

---

**VER-CONF-006 [P1]** â€” Toast undo button pattern inconsistently described.

**Conflict locations**:
- [feedback.md](reports/cross-cutting/feedback.md#L372): "All destructive actions that can be reversed must offer `undoAction` callback in toast."
- [loading-empty-states.md](reports/cross-cutting/loading-empty-states.md#L275): No undo pattern mentioned for Project Keeper import failures or similar long operations.

**Statement 1 (feedback.md:372)**: "`VER-FB-017` [P1] â€” All destructive actions that can be reversed must offer `undoAction` callback in toast. Audit: delete project, remove thread, archive thread, clear edits (if implemented)."

**Statement 2 (loading-empty-states.md:275)**: "Creator Realistic preview canvas failure... displays inline error message "Preview failed. Try reducing pattern size or switching to symbol view." with a "Retry" button that re-triggers preview generation."

**Proposed resolution**: Clarify whether "undo" (data restoration) and "retry" (operation restart) are treated as the same pattern. If undo and retry are distinct UX patterns, both should be documented. If they should use the same Toast pattern, unify the naming: `retryAction` or `undoAction`.

**Action for Phase 4**: Decide whether undo and retry are the same pattern. If distinct, document both in feedback.md. If same, rename to a unified term and apply consistently across all related toast scenarios.

---

## 7. Token / theme inconsistencies

_(no conflicts found in this category)_

**Rationale**: 
- No deprecated `--ws-*` tokens found in any spec.
- All spec files use canonical Workshop token names: `--accent`, `--surface`, `--text-primary`, `--text-secondary`, `--radius-sm`, `--shadow-sm`, `--line`, `--accent-2`, `--success`, `--motion`.
- Light/dark theme handling correctly documented: light tokens on `:root`, dark on `[data-theme="dark"]` per [styles.css](styles.css) and [reports/showcase/_workshop.css](reports/showcase/_workshop.css).

---

## 8. House-rule citation inconsistencies

**VER-CONF-007 [P1]** â€” Emoji usage rule violations cited with inconsistent severity.

**Conflict locations**:
- [feedback.md](reports/cross-cutting/feedback.md#L338): VER-FB-004 flags unicode `âœ“` (emoji-like character) as P3 (cosmetic)
- [AGENTS.md](AGENTS.md#L27-L32): House rule explicitly forbids unicode characters (âœ“ âœ— â†’ â† â–¸ etc.) in user-facing UI as "emoji for this rule"

**Statement 1 (feedback.md:338)**: "`VER-FB-004` [P3] â€” SaveStatus badge displays "Saved âœ“"... Replace with `Icons.check()` SVG..."

**Statement 2 (AGENTS.md:27-32)**: "The unicode characters âœ“ âœ— â†’ â† â–¸ etc. count as emoji for this rule â€” use [icons.js](../icons.js)'s `check`, `x`, `pointing` etc instead."

**Proposed resolution**: If SaveStatus badge is user-facing, this violates AGENTS.md house rule (forbidden emoji-like character) and should be **P1 (Blocking)**. If SaveStatus is internal only (debug mode, not visible to end users), then P3 is acceptable. Verify user visibility and upgrade severity to P1 if needed.

**Action for Phase 4**: Audit all user-facing strings in toasts, modals, headers, and inline UI for unicode emoji characters (âœ“ âœ— â†’ â† â–¸ âš  â„¹). Replace any found with appropriate `Icons.*()` SVG calls. Re-run check to ensure AGENTS.md house rule compliance.

---

## SPEC UNCLEAR â€” questions for human review

1. **SCR-061 vs SCR-052 scope ambiguity**: [home.md](reports/specs/home.md#L2128) states SCR-061 is "the same `MultiProjectDashboard` component rendered on `manager.html` (and historically on home.html before Phase 7 refactoring)." However, [00_INTERFACE_MAP.md](reports/specs/00_INTERFACE_MAP.md#L89-L98) assigns SCR-052 to "home.html, manager.html" and SCR-061 to "home.html" only. **Question**: Are SCR-052 and SCR-061 truly identical components or do they have platform-specific rendering differences? If identical, should they be consolidated into a single SCR-ID with environment-specific notes?
   
   **Answer in specs**: SCR-061 "Behaviour: All elements and interactions are identical to SCR-052. Refer to EL-SCR-052-01 through EL-SCR-052-20 for complete specification." This is clear (intentional duplicate for context).
   
   **Resolution**: Status is CLARIFIED. No action needed; SCR-061 is intentionally a reference copy for home-screen context. Keep as-is.

2. **Home Tab Badge (EL-SCR-001-03) rendering condition unclear**: [home.md](reports/specs/home.md#L63) describes badge "Visible when: count > 0" but doesn't specify whether the badge is hidden or the entire tab bar layout shifts. On small viewports, does badge shifting reflow the tab bar?
   
   **Current spec**: "Hides if count === 0" (implies complete hiding, no space reservation).
   
   **Question for review**: Should the badge reserve space even when count === 0 (empty state) to prevent layout shift? Or is zero-width acceptable?
   
   **Action**: Clarify in home.md EL-SCR-001-03 whether badge uses `display: none` (no space) or `visibility: hidden` + width reservation (predictable layout).

3. **BulkDeleteModal capacity (EL-SCR-052-09)**: [home.md](reports/specs/home.md#L2174) TODO specifies "show up to 5 project names and "+N more" text; test with 3, 5, 10 selected projects." This is written as a verification goal, not a spec. Is 5 the hard limit, or is this a design recommendation?
   
   **Current spec**: Not explicitly stated; only verified in VER-EL-SCR-052-09-01.
   
   **Question for review**: Confirm 5 is the intended capacity limit (not 3, not 10).
   
   **Action**: home.md EL-SCR-052-08 or EL-SCR-052-09 should explicitly state "BulkDeleteModal shows up to 5 project names. If more than 5 are selected, remaining count shown as '+N more'."

---

## Resolution actions taken in this report

**Summary of proposed changes**:

1. **home.md** â€” Remove EL-SCR-001-01 Header definition; replace with forward reference to shared-shell.md (resolves VER-CONF-001).
2. **responsive.md** â€” Fix VER-RESP-P2-004 to reference correct EL-ID (EL-SCR-001-10 or EL-SCR-053-01 for project grid, not EL-SCR-001-01) (resolves VER-CONF-002).
3. **feedback.md** â€” Verify SaveStatus badge user visibility and upgrade VER-FB-004 severity to P1 if needed (resolves VER-CONF-007).
4. **creator/BulkAddModal.js** â€” Confirm StashBridge guard clause exists; if missing, add it and document as P1 TODO (resolves VER-CONF-004).
5. **feedback.md** â€” Verify single project delete now shows styled confirmation; if not, implement as P1 (resolves VER-CONF-005).
6. **feedback.md** â€” Unify undo vs retry pattern naming and document consistently (resolves VER-CONF-006).
7. **home.md** â€” Clarify EL-SCR-001-03 badge rendering (display vs visibility) (resolves ambiguity #2).
8. **home.md** â€” Explicitly state BulkDeleteModal 5-item capacity in element spec, not just TODO (resolves ambiguity #3).

---

## VERIFICATION TODO

_(Resolved 2026-05-05 by user decisions on Phase 3 review. All items below were either applied as spec edits or verified against the codebase.)_

- [x] `VER-CONF-001-P1` — **DONE**: home.md EL-SCR-001-01 replaced with forward reference to shared-shell.md.
- [x] `VER-CONF-002-P1` — **DONE**: responsive.md VER-RESP-P2-004 corrected to reference EL-SCR-001-10 (list container, per user decision).
- [x] `VER-CONF-003-P1` — **DONE**: feedback.md VER-FB-004 raised from P3 to P1 (SaveStatus is user-facing; house-rule violation).
- [x] `VER-CONF-004-P0` — **VERIFIED**: StashBridge guard clause exists at `creator/BulkAddModal.js:150` with toast/alert fallback. No code change needed.
- [x] `VER-CONF-005-P1` — **DONE (Option A)**: home.md EL-SCR-052-08 now states all destructive deletes (single or multi) MUST route through BulkDeleteModal; new `VER-EL-SCR-052-08-02` [P1] tracks the single-delete fold-in.
- [x] `VER-CONF-006-P1` — **DONE**: feedback.md now documents `undoAction` and `retryAction` as distinct patterns (different semantics, placement, labels).
- [ ] `VER-CONF-007-P1` — Carried forward into Phase 4 verification: audit ALL user-facing strings (toasts, modals, headers, inline UI) for unicode glyphs (✓ ✗ → ← ▸ ⚠ ℹ) and replace with `Icons.*()` per AGENTS.md.
- [x] `VER-CONF-AMBIG-001` — **CONFIRMED**: SCR-061 vs SCR-052 intentional duplicate. No action.
- [x] `VER-CONF-AMBIG-002` — **DONE**: home.md EL-SCR-001-03 now explicitly uses `display: none` (no space reservation), per user decision.
- [x] `VER-CONF-AMBIG-003` — **DONE**: home.md EL-SCR-052-08 now explicitly states the 5-item hard limit; `VER-EL-SCR-052-09-01` raised P3 → P2.

## Duplicate ID reconciliation (Phase 3)

The master TODO aggregator flagged 4 duplicate VER-IDs. Canonical files chosen by user direction:

| ID | Canonical file | De-duplicated file | Action taken |
|---|---|---|---|
| `VER-A11Y-001` | `reports/cross-cutting/keyboard-a11y.md` (focus trap in Overlay — global contract) | `reports/specs/creator-legend-export.md` | Renamed area-local check to `VER-LEGEXP-A11Y-001` with cross-reference. |
| `VER-A11Y-002` | `reports/cross-cutting/keyboard-a11y.md` (Help button aria-expanded — global contract) | `reports/specs/creator-legend-export.md` | Renamed area-local check to `VER-LEGEXP-A11Y-002` with cross-reference. |
| `VER-EL-SCR-032-01-01` | `reports/specs/manager.md` bottom verification list (single source for SCR-032 IDs) | `reports/specs/manager.md` inline EL-SCR-032-02 block | Inline duplicate removed; element block now refers to bottom list. |
| `VER-EL-SCR-032-02-01` | `reports/specs/manager.md` bottom verification list | `reports/specs/manager.md` inline EL-SCR-032-02 block | Inline duplicate removed; element block now refers to bottom list. |

After regenerating `00_MASTER_TODO.md` the duplicate-IDs section should be empty.