# Import Fix #3 — Related Issues in the PDF/Pattern Import Flow

**Date:** 2026-04-29

The two known bugs (action reload + modal styling) were investigated alongside
a sweep of the rest of the pipeline. Findings below; only items marked
**[fixing now]** are in scope for this PR per the brief.

## Functionality

- **[fixing now]** No success feedback after import. After the page reload
  there's no toast, no highlight, no navigation cue.
- **[fixing now]** No failure feedback for save errors beyond a raw
  `alert()`. Migrate to `Toast.show({ type: 'error', ... })`.
- **OK** — `ProjectStorage.save()` correctly resolves on
  `tx.oncomplete` and dispatches `cs:projectsChanged`, which `home-app.js`
  already listens for. So in-place refresh works once the navigation is
  removed.

## Modal interactions

- **OK** — Cancel button calls `onClose('cancel')`, which cleanly
  unmounts the host element ([ImportReviewModal.js#L232](../import-engine/ui/ImportReviewModal.js#L232)).
- **OK** — The `× Close` button in the header also calls `onClose('cancel')`.
- **NOT FIXED (out of scope)** — There is no Escape-key handler on the
  modal; ARIA dialog semantics are present (`role="dialog" aria-modal="true"`)
  but no focus trap. Tracked separately.
- **NOT FIXED (out of scope)** — The "Open guided wizard" branch
  (`onClose('wizard', ...)`) is currently a no-op past the modal — wireApp
  only handles `confirm` and falls through. Tracked separately.

## Mobile

- **[fixing now]** The grid template uses a fixed 280px sidebar
  (`1fr 280px`); on phones the warnings rail squashes the preview to nothing.
  Adding a `@media (max-width: 720px)` collapse moves the warnings under the
  body.

## Console / errors

- No unhandled rejections in the happy path.
- `ProjectStorage.save` errors are caught and re-thrown with an `alert()`.
  Replaced with `Toast.show` in fix #1.

## Data validity

- The materialised project from the import engine is v8-shaped and passes
  `processLoadedProject()`. No data-integrity issues observed.

## Tests

- Added regression tests:
  - `tests/import/wireAppSaveAndNavigate.test.js` covers the
    same-page-no-reload behaviour.
  - `tests/import/uiReviewModalStyling.test.js` asserts the modal renders
    `.g-btn primary` (not `.btn-primary`) for the confirm button.
