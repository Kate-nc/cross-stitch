# Import Fix #1 — "Use this pattern" Action Trace

**Date:** 2026-04-29
**Status:** Diagnosed
**Files involved:**
- [import-engine/ui/ImportReviewModal.js](../import-engine/ui/ImportReviewModal.js)
- [import-engine/wireApp.js](../import-engine/wireApp.js)
- [home-app.js](../home-app.js)
- [project-storage.js](../project-storage.js)

## 1. Click handler

The "Use this pattern" button lives in `ImportReviewModal.js` (~line 206):

```js
h('button', { className: 'btn-primary', onClick: function () {
  props.onClose && props.onClose('confirm', { project: working, edits: edits });
} }, I('check'), h('span', null, 'Use this pattern'))
```

- Plain `<button>` (default `type="button"` for React buttons not inside `<form>`). No form wrapper.
- No `event.preventDefault()` needed; no implicit submission.
- `onClose('confirm', ...)` resolves the `openReview()` promise.

## 2. Promise → wireApp `saveAndNavigate`

`importAndReview()` (wireApp.js L62) chains:

```js
if (out.action === 'confirm' && out.project) {
  return saveAndNavigate(out.project, opts);
}
```

`saveAndNavigate` (wireApp.js L67–L120):

```js
var destination = opts.navigateTo || 'home.html';
// … assigns id, timestamps, sets active pointer …
return Promise.resolve(storage.save(project)).then(function () {
  if (nav) window.location.href = destination;   // ← THE BUG
  return { action: 'confirm', project: project, id: id };
})
```

`home-app.js` (L394) calls `importAndReview(file)` with **no opts**, so:
- `nav = true` (default)
- `destination = 'home.html'`
- The user is already on `home.html`

`window.location.href = 'home.html'` therefore navigates the page to itself,
producing a **full-page reload**.

## 3. Is the data actually saved?

Yes. `ProjectStorage.save()` is properly awaited (returns a promise that
resolves on `tx.oncomplete`). The save fires `cs:projectsChanged` which the
home page already listens for. So the project IS in IndexedDB and the active
pointer IS set in localStorage before the navigation happens.

After the reload, `home-app.js` re-mounts and re-reads the projects list —
the imported project does appear in the list, but the user has no idea any
import happened because:

1. There is no toast or success indicator before/after the reload.
2. The modal vanishes simultaneously with the apparent "refresh", so
   the visual hand-off looks broken/identical to a no-op page reload.
3. The user is dropped back at the project list with no scroll or
   highlight on the new entry.

## 4. Root cause

**Type A + B hybrid.** The pattern is being saved (A: data exists), but the
flow performs a same-page `window.location.href` navigation that masks the
success and feels like a hung reload (B-flavoured UX failure).

## 5. Fix

In `saveAndNavigate`:
1. After `storage.save()` resolves, **check whether the destination is the
   current page**. If so, skip the navigation entirely — the
   `cs:projectsChanged` event already fired by `ProjectStorage.save()` will
   refresh the home list in place.
2. Show a `Toast.show({ type: 'success', message: 'Imported "<name>".' })`
   either way.
3. When navigating to a different page, still show the toast (it survives
   the navigation only briefly, but the user sees the success state).

This preserves all existing behaviour for the tracker handoff path
(`opts.navigateTo: 'stitch.html'`) where the navigation IS desired.
