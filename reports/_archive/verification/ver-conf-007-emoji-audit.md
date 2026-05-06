# VER-CONF-007: Emoji Audit

> Phase 4 cross-cutting verification. Audits the entire workspace for unicode pictograms and emoji-like glyphs in user-facing strings, per AGENTS.md house rule.

## Summary

- Total matches scanned: 100+
- **VIOLATIONS (must fix): 15**
- ALLOWED-KBD: 2 patterns
- ALLOWED-DIVIDER: multiple (expected)
- ALLOWED-FIXTURE: 3 test cases
- CODE-ONLY: 15+

## Violations (must fix)

| File:line | Glyph | Context | Suggested fix |
|---|---|---|---|
| helpers.js:981 | ✓ | `'[✓] ' + count + ' / ' + total` | Replace with text-only or `Icons.check()` rendered SVG |
| components.js:44 | ⓘ | `"\u24D8"` fallback info icon | Replace fallback with text or guarantee Icons.info() availability |
| components.js:201 | ✓ | `(activeGoal.met ? " \u2713" : "")` | Use `Icons.check()` instead of `\u2713` |
| components.js:562 | ‹ | `"\u2039"` Previous month button | Use new `Icons.chevronLeft()` |
| components.js:565 | › | `"\u203a"` Next month button | Use new `Icons.chevronRight()` |
| components.js:1000 | ✕ | `"\u2715"` Close section button | Use `Icons.x()` |
| components.js:1028 | × | `"\u00d7"` Section size display | Replace `" × "` with `" by "` |
| stats-page.js:382 | × | `'×'` Close modal button | Use `Icons.x()` |
| stats-page.js:489 | × | `'×'` Close modal button | Use `Icons.x()` |
| creator/BulkAddModal.js:72 | × | `'×'` Remove button in chip | Use `Icons.x()` |
| creator/BulkAddModal.js:86 | × | `'×'` Remove button in chip | Use `Icons.x()` |
| creator/BulkAddModal.js:237 | × | `'(click × to remove)'` Help text | Replace with `'(click icon to remove)'` and inline `Icons.x()` |
| creator/LegendTab.js:622 | × | `' (×2)'` Fabric count display | Replace with `' (2x)'` |
| tracker-app.js:356 | × | `Icons.x?Icons.x():'×'` JSX fallback | Remove fallback; ensure Icons.x always available |
| tracker-app.js:7157,7203 | × | `Icons.x?Icons.x():'×'` Multiple modals | Remove fallback; ensure Icons.x always available |

Plus the previously-tracked **SaveStatus badge** (VER-FB-004, severity raised to P1 in Phase 3).

## Allowed (no action)

### ALLOWED-KBD (keyboard legends in `<kbd>` tags)
- command-palette.js:350: `<kbd>↑</kbd> <kbd>↓</kbd> ... <kbd>↵</kbd>` — keyboard hint footer
- shortcuts.js:354-356: `formatKey()` returns `⌘ ⇧ ⌥ ← → ↑ ↓` for keyboard display

### ALLOWED-FIXTURE (test imports of legacy PDF patterns)
- tests/import/pdfLegendExtractor.test.js:35,66,95: `'★'`, `'◆'` in import test fixtures

### CODE-ONLY (not user-facing)
- helpers.js:1129-1146: `drawPDFSymbol()` — internal PDF rendering logic
- stats-page.js:1725: comment about no-emoji rule
- icons.js: inline comments documenting emoji→icon replacements

## Suggested order of fixes

**Priority 1 — Core modals & buttons**
1. stats-page.js:382, 489 — Replace `'×'` with `Icons.x()` in 2 modal close buttons
2. tracker-app.js:356, 7157, 7203 (and any other ?-fallback sites) — Remove the `'×'` fallback; ensure `Icons.x()` is always available

**Priority 2 — Creator forms**
3. creator/BulkAddModal.js:72, 86, 237 — Replace `'×'` with `Icons.x()` in ThreadChip buttons and help text

**Priority 3 — Navigation & display**
4. components.js:562, 565 — Replace chevron glyphs `‹ ›` with new `Icons.chevronLeft()` / `Icons.chevronRight()` (add to icons.js first)
5. components.js:1000 — Replace `\u2715` (✕) with `Icons.x()`
6. components.js:1028 — Replace `\u00d7` (×) with `" by "`

**Priority 4 — Math & status**
7. components.js:201 — Replace `\u2713` (✓) with `Icons.check()`
8. components.js:44 — Replace `\u24D8` (ⓘ) fallback with text label or guarantee `Icons.info()` loads
9. creator/LegendTab.js:622 — Replace `' (×2)'` with `' (2x)'`
10. helpers.js:981 — Replace `'[✓] '` in shareText with text-only format
11. **SaveStatus badge** (separate VER-FB-004 / VER-CONF-003 / VER-CONF-007 follow-up) — Replace `"Saved ✓"` unicode with `Icons.check()` SVG + `"Saved"` text

**Icons to add/verify:**
- `Icons.chevronLeft()` — for `‹`
- `Icons.chevronRight()` — for `›`
- Verify `Icons.x()` and `Icons.check()` exist and are loaded on all pages that use them (the `?` fallbacks suggest a load-order concern)

## Final result

**15 violations found across 9 files** (plus the SaveStatus badge already tracked separately). Primary offenders: tracker-app.js (multiple), components.js (6), creator/BulkAddModal.js (3), stats-page.js (2). All violations use either emoji-like symbol marks (✓ ✗ × ↻ ‹ › ⓘ ✕) or raw unicode escapes instead of `Icons.*()` SVG components per AGENTS.md house rule. Recommend fixing in priority order above; total estimated effort is small but spans many files.
