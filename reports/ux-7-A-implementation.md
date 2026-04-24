# UX Audit · Phase 5 — Quarter 1 (A) implementation notes

> Implementation log for tickets A1–A7 from
> [ux-6-roadmap-A-then-B.md](ux-6-roadmap-A-then-B.md). One section per ticket
> records what changed, where, why, and what to test. The final section is a
> consolidated user-test plan that any reviewer can run end-to-end.
>
> The "measure for two weeks" gate between Quarters A and B was waived for
> this batch (no users yet); see request from project owner.

---

## A1 · Honest "Limit to stash" warning + Substitute CTA

**Closes:** D8 🔴 (silent stash filter), partial F-2.5
**Wireframe:** [a-creator-toolstrip](wireframes/a-creator-toolstrip.html) (sidebar half)

### What changed

- [stash-bridge.js](../stash-bridge.js)
  - New batch helper `StashBridge.markManyToBuy(keysOrIds, toBuy)` — flips the
    `tobuy` flag on many threads in one IndexedDB transaction. Returns the
    count of entries actually changed so callers can tell the user how many
    were already on their list.
  - New pure helper `StashBridge.computeUnownedPaletteIds(displayPal,
    globalStash, options)` — returns composite keys (`'dmc:310'`, `'anchor:403'`)
    of palette threads that are **not** sufficiently owned. Pure (no
    IndexedDB, no DOM) so it can be exercised under Node.
- [creator/Sidebar.js](../creator/Sidebar.js)
  - Replaces the old "X unowned colour(s) hidden — turn off the filter" line
    (which hid the truth and offered no fix) with an `aria-live="polite"`
    warning panel that:
    - states the count of unowned threads still in the pattern,
    - explains "the filter only hides chips, it does not change the pattern",
    - exposes two actions — **Substitute from stash** (opens the existing
      `SubstituteFromStashModal` pre-filled with the unowned set, no
      re-quantise triggered) and **Add to shopping list** (calls
      `markManyToBuy` then toasts via `app.addToast({type:'success'})`).
  - The unowned-key collection mirrors the existing `stashStatusForChip`
    logic so the warning panel and the per-chip status dots agree.
  - The legacy "X hidden" subtle banner is now dead code (panel above always
    fires when the filter is on and any thread is unowned). Left in place as
    a safety net for the impossible case `hiddenByFilter > 0 && unownedKeys
    === 0`; can be removed in a later cleanup.
- [creator/bundle.js](../creator/bundle.js) — regenerated via
  `node build-creator-bundle.js` (CREATOR_CACHE_KEY bumped automatically).
- [tests/limitToStashWarning.test.js](../tests/limitToStashWarning.test.js)
  — new. Extracts `computeUnownedPaletteIds` via `fs.readFileSync` + a small
  brace-balancing regex (the same pattern used by
  `tests/embroidery-image-processing.test.js`) and covers: empty palette;
  fully owned; missing entry; partial-owned (insufficient skeins); blends
  expand to both components; blend with one owned component; placeholder ids
  skipped; deduplication when an id appears in multiple entries; per-entry
  `brand` override; null stash.

### Acceptance check

- [x] Warning shows the count of unowned threads, never "5 of 18 visible".
- [x] "Substitute from stash" opens the existing modal pre-filled with the
  unowned set (re-uses the same `analyseSubstitutions` call as the
  ProjectTab Replace button — does **not** re-quantise the pattern).
- [x] "Add to shopping list" appends without duplicates and toasts
  confirmation via `window.Toast`-shaped `app.addToast({message,type:'success'})`.
- [x] Toggling the filter does not trigger re-generation.
- [x] No new emoji; uses `Icons.warning`.

### Test status

- 735 / 735 Jest tests pass (`npm test -- --runInBand`), including
  10 new cases in `limitToStashWarning.test.js`.

---

