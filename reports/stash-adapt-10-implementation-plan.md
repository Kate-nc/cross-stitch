# Stash-Adapt — Phase 4.2 — Implementation Plan

Step-by-step build order. Each step is a single conceptual commit (some grouped). Tests pass after every step.

---

## Step 1 — Pure modules (no UI)

**Files:**
- `creator/matchQuality.js` (new)
- `creator/adaptationEngine.js` (new)
- `tests/matchQuality.test.js` (new)
- `tests/adaptationEngine.test.js` (new)
- `build-creator-bundle.js` (add both to `ORDER`, before `SubstituteFromStashModal.js`)

`matchQuality.js` exports (assigned to `window.MatchQuality`):
```js
{ TIERS, classifyMatch(deltaE), tierLabel(tier), tierColor(tier),
  describeLabDiff(srcLab, tgtLab) }
```

`adaptationEngine.js` exports (assigned to `window.AdaptationEngine`):
```js
{ proposeStash, proposeBrand, applyProposal, reRunAuto,
  findReplacement, resolveDuplicateTargets, enforceContrast,
  isSpecialty, SPECIALTY_PREFIXES }
```

Internally it copies the proposal-building logic from `SubstituteFromStashModal.js` (lines 1–~250) and `ConvertPaletteModal.js` `proposeConversion`. **No UI yet.** Old modals continue to use their own copies until Step 5; that means temporary duplication, but it lets the engine ship test-covered before the legacy modals are deleted.

**Bundle:** rebuild via `node build-creator-bundle.js`.

**Verify:** `npm test -- --runInBand` passes; new tests cover the data-model §9 matrix.

---

## Step 2 — `duplicateProject` helper + schema v12

**Files:**
- `helpers.js` — add `duplicateProject(sourceProject, { adaptation, name })`. Pure: returns a deep-copy minus tracking, with new id/createdAt/updatedAt. Does NOT save.
- `project-storage.js` — bump `SCHEMA_VERSION` constant (if present) to 12; teach `buildMeta` to project `adaptation: { fromProjectId, fromName, modeAtCreate }` into the meta mirror; round-trip `adaptation` on load/save (no transform — `adaptation` rides on the project document as-is).
- `tests/duplicateProject.test.js` — covers byte-identical original, tracking reset, bsLines preserved with substituted ids, name disambiguation, meta projection.

No UI changes. Existing projects still load.

---

## Step 3 — Icons + AdaptedBadge

**Files:**
- `icons.js` — add `Icons.adapt` (compass + needle outline 24×24, 1.6 stroke, `currentColor`). Verify `Icons.shuffle` exists; if not, add it too.
- `tests/icons.test.js` — update snapshot via `--updateSnapshot`.
- `components.js` — add `<AdaptedBadge fromName onClick />` (lavender pill, "ADAPTED" word + Icons.adapt at 12 px).
- `project-library.js` — render `<AdaptedBadge>` when `meta.adaptation` is present; clicking it sets the original active.
- `manager-app.js` — render the same badge on pattern-library cards.

---

## Step 4 — `AdaptModal` UI (the meat)

**Files:**
- `creator/AdaptModal.js` (new) — full-screen modal, all behaviour from interaction spec §3–§14.
- `creator/context.js` — add modal-open state plumbing (mirrors existing `substituteModalOpen` plumbing) — `adaptModalOpen`, `adaptModalMode`, `adaptModalKey`, setters.
- `creator/useCreatorState.js` — wire `openAdaptModal({ mode })` helper; load draft from `localStorage` if present.
- `creator-main.js` — mount `<CreatorAdaptModal>` alongside the existing modal mounts; wire close handler.
- `build-creator-bundle.js` — concat `AdaptModal.js` after `ConvertPaletteModal.js` (which is still present this step).
- `helpers.js` — add `searchThreads(query, brand?)`.
- CSS in `styles.css` — `.adapt-modal`, `.adapt-modal__split`, `.adapt-modal__divider`, `.adapt-modal__row`, `.adapt-modal__quality-chip`, mobile media queries. Use Workshop tokens only.

Includes the resizable divider (drag, double-click reset, keyboard, `UserPrefs` persist) and the picker sub-component.

**Verify:** modal opens via direct call from devtools (`window.AppPrefs` not needed; just trigger via context). Run JSDOM smoke test.

---

## Step 5 — Wire entry points + retire legacy modals

**Files:**
- `creator/Sidebar.js` — replace the "Replace with Stash Threads" button block (around L259) with a single "Adapt to my stash" button calling `app.openAdaptModal({ mode: 'stash' })`.
- `creator/ProjectTab.js` — replace the "Convert Palette" button block (around L245) with "Adapt to a different brand…" calling `openAdaptModal({ mode: 'brand' })`.
- `creator/ActionBar.js` — add "Adapt…" trigger with a small dropdown (Stash / Brand / Manual). Style consistent with the existing Export menu.
- **Delete** `creator/SubstituteFromStashModal.js` and `creator/ConvertPaletteModal.js`.
- `build-creator-bundle.js` — remove both from `ORDER`.
- `creator/context.js` — remove `substituteModalOpen` / `substituteProposal` / `substituteModalKey` and `convertPaletteOpen` (replaced by adapt modal state).
- `creator-main.js` — remove the now-orphan modal mounts.
- Search the codebase for any other references and clean them up: `grep -r "SubstituteFromStashModal\|ConvertPaletteModal\|setSubstituteModalOpen\|setConvertPaletteOpen"`.

**Verify:** `npm test -- --runInBand`, manual click-through of all three entry points, lint:terminology, bundle rebuilt.

---

## Step 6 — Service worker + cache bump

**Files:**
- `sw.js` — bump `CACHE_NAME` to next version; ensure `creator/bundle.js` is in the precache list (it already is by reference — confirm).
- `tests/swPrecache.test.js` — update if version is asserted.

---

## Step 7 — Documentation + repo-memory

- README quick-reference of the new flow (one paragraph, optional).
- Update `.github/copilot-instructions.md` if the file roster expanded materially (likely just the new module names).

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Engine extraction subtly changes proposal output (duplicate-resolution, contrast enforcement) | Run the legacy modal output (Step 1) and the engine output side-by-side in a test fixture before deleting old modals (Step 5). |
| `applyProposal` breaks PDF export because of palette ordering | The pattern array is a deep clone of the existing pattern with cell ids/rgb swapped; palette is rebuilt by the existing `rebuildPaletteCounts` on load. PDF tests should catch any regression — re-run them as part of Step 5. |
| Resizable divider conflicts with mobile keyboard or iOS bounce-scroll | Disable divider below the 720 px breakpoint; preview becomes a fixed 200 px sticky panel. |
| Schema v12 breaks an old reader | Old reader silently drops `adaptation`. Acceptable per data-model §6. We control all readers. |
| Removing legacy modals breaks an unfamiliar code path | Step 5 grep + manual smoke test of every Stash/Convert entry point listed in stash-adapt-1-existing-code.md §3.2 / §3.3. |

---

## Out-of-scope follow-ups (to track separately)

- PDF cover-page "Adapted from" line.
- Live shopping-list integration (currently a "Add to list" toast button only).
- Cross-brand support beyond DMC/Anchor.
- Specialty-thread overrides UI.
- Adaptation-chain ancestry view.
