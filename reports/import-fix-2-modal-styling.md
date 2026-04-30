# Import Fix #2 — Import Review Modal Styling Audit

**Date:** 2026-04-29
**Files involved:**
- [import-engine/ui/ImportReviewModal.js](../import-engine/ui/ImportReviewModal.js)
- [styles.css](../styles.css) — `.import-review-*` block ~L6376–L6510

## Summary

The modal uses CSS variables that **don't exist in the Workshop token set**
and bypasses the canonical `.g-btn` button classes. Almost every visual
oddity (off-spacing, off-colour, plain HTML buttons that look unstyled in
some contexts) traces back to broken token names that fall back to defaults.

## Token mismatches in `styles.css`

| Used in modal CSS | Defined? | Should be |
|---|---|---|
| `var(--space-1)`–`var(--space-4)` | **No** | `var(--s-1)`–`var(--s-4)` |
| `var(--surface-2)` | **No** | `var(--surface-tertiary)` |
| `var(--font-mono)` | **No** | `monospace` (fallback OK, but make explicit) |
| `var(--line)` | Yes | Keep — Workshop token. |
| `var(--border)` | Yes | Already used elsewhere — equivalent. |

Because the bogus tokens fall back to their CSS defaults (`undefined` →
fallback in `var(--space-2, 8px)` style — but the modal CSS doesn't supply
fallbacks), spacing collapses to zero in some browsers and the layout looks
"loose" / "mis-aligned" compared to other modals.

## Button mismatches

The footer uses `.btn-primary` / `.btn-secondary` (defined locally inside
`.import-review-actions button` — bespoke 1-px border, 2-px radius, plain
surface). Every other modal in the app uses **`.g-btn` / `.g-btn primary`**
([creator/BulkAddModal.js#L221](../creator/BulkAddModal.js#L221),
[creator/ConvertPaletteModal.js](../creator/ConvertPaletteModal.js)).

The close button is also a bespoke `.import-review-close` instead of
`window.Overlay.CloseButton`.

## Header / scrim

- Scrim uses `rgba(0,0,0,0.5)` — the canonical scrim is
  `rgba(15, 23, 42, 0.45)` (`.overlay-scrim` in styles.css L308).
- The modal `border-radius: var(--radius-lg)` is fine; `box-shadow:
  var(--shadow-lg)` is fine.
- z-index `10000` is outside the canonical scale (`--z-modal: 1000`).

## Recommended fix (minimal, no layout change)

Per the brief — **do not redesign the modal**. The fixes are:

1. Replace bogus token names with real Workshop tokens in
   `styles.css` (the `.import-review-*` block).
2. Swap `.btn-primary` / `.btn-secondary` for `.g-btn primary` / `.g-btn`
   in `ImportReviewModal.js`.
3. Drop the bespoke scrim colour (use `rgba(15,23,42,.45)` matching
   `.overlay-scrim`).
4. Lower z-index to `1000` to match `--z-modal`.
5. Add a `@media (max-width: 720px)` block that collapses the
   `header / tabs / body warn / footer` grid into a single column so
   the warnings rail stacks below the body on phones.

This keeps the existing imperative mount (`openReview()` createRoot) and
the existing tab/preview/palette/metadata layout untouched.
