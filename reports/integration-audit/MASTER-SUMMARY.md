# Master summary — integration audit

> Phase 3 consolidation. Cross-cuts the six Phase-2 reports:
> [00-system-map.md](00-system-map.md), [01-create.md](01-create.md),
> [02-cleanup.md](02-cleanup.md), [03-edit.md](03-edit.md),
> [04-track.md](04-track.md), [05-shared-infrastructure.md](05-shared-infrastructure.md),
> [06-integration.md](06-integration.md). Flat actionable list is in
> [CHECKLIST.md](CHECKLIST.md).

---

## 1. By severity

### High (2)
- **C-3 / INT-3** — Generate silently wipes `done`/`parkMarkers`. User pre-approved fix: confirm dialog at Generate-time when `done` has any 1s.

### Medium (10)
- **C-1** — Stale-error worker `terminate()` does not null `workerRef.current`.
- **C-3** — (see High; cross-listed with INT-3)
- **C-6** — JSON import doesn't validate `pattern.length === width × height`.
- **E-1** — Selection mask survives image upload and pattern regeneration.
- **E-3** — `removeUnusedColours` does not clean up `parkMarkers` (also infects tracker via T-1).
- **INT-1** — Tracker stamps `version:9` instead of v11 on outbound handoff.
- **S-1** — `ProjectStorage.save` and legacy `saveProjectToDB` not coordinated; silent divergence under storage failure.
- **S-2** — `backup-restore.restore()` skips cross-field consistency checks.
- **T-1** — Tracker doesn't filter orphan `parkMarkers` on load.
- **INT-7** — Same-browser two-tab edits are last-write-wins with no detection.

### Low (~22)
See per-area reports. Headlines: stale toast on image decode (C-5), missing worker unmount cleanup (C-2, CL-1), brush-mask per-pointermove allocation (CL-3), cleanup race on sub-tool switch (CL-5), wrong-named undo entry on `removeScratchColour` (E-5), misleading back-to-convert copy (E-6), `blockW` localStorage flicker (T-2/S-6), stale handoff on aborted nav (T-3/INT-4), prop-vs-mount load race (T-4), counter-ref invariant doc gap (T-5), onboarding-wizard `catch` fail-closed (S-3), silent stash-sync failure (S-4), shortcuts conflict logging (S-5), unversioned user-prefs (S-7), bridge-lifetime invariant (INT-5), pending-image expiry (INT-6).

### Info / question (~10)
`scratchPalette` persistence across regen (E-4), selection persists across tools (E-2), park-marker placement not undoable (E-7), cleanup undo asymmetry (CL-2), autodetect re-serialises full pat (CL-4), missing `stitchCleanup &&` guard (CL-7), worker pipeline timeout (C-7), generation cancellation worker leak (C-8), `bsLines` survive re-convert (C-9), `lastGenSnapshot` incomplete (C-4).

---

## 2. By theme

### 2.1 Worker lifecycle and termination (4)
- **C-1** — generate worker ref not nulled on error.
- **C-2** — generate worker not terminated on Creator unmount.
- **C-8** — cancelling generation does not terminate in-flight worker.
- **CL-1** — cleanup worker not terminated on cleanup unmount.

Pattern: every Web Worker site needs a paired `useEffect` cleanup. Best resolved with a single `useWorker(scriptUrl)` hook that owns the ref and the unmount handler.

### 2.2 Orphan references after palette mutation (3)
- **E-3** — `removeUnusedColours` doesn't filter `parkMarkers`.
- **E-5** — `removeScratchColour` removes palette entry but leaves cells pointing at it.
- **T-1** — Tracker doesn't filter orphan `parkMarkers` on load (defence-in-depth).

Pattern: any palette-removal operation must also sweep `parkMarkers`, `pat` cells, `partialStitches`, and `halfStitches` for the removed id.

### 2.3 Silent reset of progress / state (4)
- **C-3 / INT-3** — Generate wipes `done`/`parkMarkers`.
- **E-1** — Wand selection mask survives regeneration / new image.
- **E-4** — `scratchPalette` survives regeneration.
- **C-9** — `bsLines` survive re-convert.

Pattern: `resetAll` and `applyResultRef` need an explicit list of state they reset. Today the list is a series of `setX(default)` calls accumulated over time; some state (mask, scratchPalette, bsLines) was forgotten or left intentionally without a documented decision.

### 2.4 Storage divergence and durability (4)
- **S-1** — Two-database writes not coordinated.
- **S-2** — Backup validation incomplete.
- **S-4** — Stash sync failures swallowed.
- **INT-7** — Two-tab edits last-write-wins.

Pattern: every write path goes through 2-3 storage layers concurrently with no coordinator. Solution paths: factor `saveProjectDualWrite()`; add per-project `lastWriteAt` invariants; consider `BroadcastChannel("cs-project-changed")` for cross-tab signalling.

### 2.5 Handoff key staleness (3)
- **T-3 / INT-4** — `crossstitch_handoff_to_creator` persists across aborted navigation.
- **INT-6** — Pending-image sessionStorage has no expiry.
- **T-4** — Prop-vs-mount load race can double-load on first paint.

Pattern: every handoff key should carry a timestamp and the consumer should ignore entries older than ~60 seconds (or per-key bound). The Creator already clears the handoff key on consume; adding a timestamp is cheap.

### 2.6 Initial-state precedence bugs (1)
- **T-2 / S-6** — `blockW/H/startCorner` localStorage initialiser wins on first render before `processLoadedProject` overrides.

Pattern: never seed React `useState` with a value that will be overridden in an effect on the same tick. Either delay rendering until load resolves, or seed with the default and let the load update it.

### 2.7 Silent error swallowing (3)
- **C-5** — Image decode failure produces no toast.
- **S-3** — Onboarding wizard fails closed on localStorage error.
- **S-4** — Stash sync failures swallowed.

Pattern: `catch (_) {}` blocks should at minimum `console.warn`, and user-visible degradations should surface a toast.

---

## 3. By classification

### [auto-fix] — Phase 4 immediate work
| ID | Severity | One-line |
|---|---|---|
| INT-1 | medium | Bump tracker version stamp to v11 |
| INT-3 / C-3 | high | Confirm dialog at Generate when `done` has 1s (user pre-approved) |
| C-1 | medium | Null `workerRef.current` after stale-error terminate |
| C-2 | low | Add `useEffect` cleanup for generate worker |
| C-5 | low | Toast on image decode failure |
| C-6 | medium | Validate `pattern.length === w × h` on JSON import |
| CL-1 | low | Add `useEffect` cleanup for cleanup worker |
| CL-5 | low | Drop cleanup-worker result if sub-tool switched |
| CL-6 | low | Persist `stitchCleanup.strength` in user prefs |
| E-1 | medium | Clear `selectionMask` in `resetAll` and `applyResultRef` |
| E-3 | medium | Filter `parkMarkers` in `removeUnusedColours` and `removeScratchColour` |
| E-5 | low | Refuse to remove in-use scratch colour (option a) |
| E-6 | low | Revise back-to-convert modal copy |
| T-1 | medium | Filter `parkMarkers` against `cmap` in tracker `processLoadedProject` |
| T-2 | low | Fix `blockW/H/startCorner` init order |
| S-2 | medium | Cross-field consistency checks in backup `validate()` |
| S-3 | low | Flip onboarding-wizard catch to fail-open |
| S-4 | low | Log stash-sync failures |

### [needs-approval] — pick a path before fix
| ID | Question |
|---|---|
| S-1 | Drop legacy `auto_save` entirely, wrap helper, or accept divergence? |
| C-8 | Cancel/abort generation: terminate in-flight worker? |
| C-9 | Reset `bsLines` on re-convert? |
| CL-3 | Brush-mask per-pointermove allocation: throttle/rAF? |
| INT-7 | Add cross-tab `BroadcastChannel("cs-project-changed")` listener? |

### [question] — needs design decision
| ID | Question |
|---|---|
| C-4 | Include orphans/stitchCleanup/bgCol/bgTh/smooth/smoothType/minSt in `lastGenSnapshot`? |
| C-7 | Wall-clock timeout for PDF/worker pipeline? |
| CL-2 | Cleanup-apply + remove-unused: two-step undo or single? |
| CL-4 | Cleanup auto-detect: skip re-serialise when only tolerance changed? |
| CL-7 | Add `stitchCleanup &&` guard in generate-worker.js? |
| E-2 | Auto-clear selection mask on tool change? |
| E-4 | Clear `scratchPalette` on regenerate? |
| E-7 | Make park-marker placement undoable? |
| T-3 / INT-4 | Handoff-key timestamp + max-age? |
| T-4 | Add `hasLoadedOnce` guard for the mount-vs-prop race? |
| T-5 | Document the counter-ref invariant or factor `setDoneAndUpdateCounts`? |
| INT-5 | Document UnifiedApp bridge lifetime invariant? |
| INT-6 | Pending-image expiry? |
| S-5 | Shortcuts conflict policy (throw / dev-toast / silent)? |
| S-7 | User-prefs schema versioning + migrations? |

---

## 4. Verified non-bugs (subagent claims discarded)

These were explored, verified false, and explicitly noted:
- **INT-2** — Tracker-only fields preserved across creator round-trip via `trackerFieldsRef` mirror (00-system-map §3, useProjectIO:298-324).
- **sw-register `__creatorImageHandoffActive` "leak"** — intentionally never cleared per docstring (S-5 area, sw-register.js:33-37).
- **Toast cap bypass on rapid `show()`** — synchronous splice converges (05 §2.4).
- **Palette-swap "reset progress" misleading warning** — string not present in code (05 §4).

---

## 5. Out of scope (re-confirmed)
- **PDF export bit-stability** — Pattern Keeper-compat path; do not modify [pdf-export-worker.js](../../pdf-export-worker.js), [creator/pdfChartLayout.js](../../creator/pdfChartLayout.js), [creator/pdfExport.js](../../creator/pdfExport.js) without an explicit regression check.
- **Pure colour-maths** — covered by existing tests in `tests/dE.test.js`, `tests/rgbToLab.test.js`.
- **Sync engine internals** — already audited under `reports/sync/`.
- **UX density** — covered by `reports/edit-mode-ui-audit.md`, `reports/track-mode-ui-audit.md`, `reports/create-flow-audit.md`.

---

## 6. Phase 4 sequencing recommendation

1. **Land low-risk auto-fixes first** (in this order): S-3, S-4, C-5, CL-6, E-6 — pure copy/log changes.
2. **Worker lifecycle fixes**: C-1, C-2, CL-1, CL-5 — together, ideally factored into a shared `useWorker(url)` helper. Add a single regression test that mounts/unmounts the Creator 10× without leaking workers.
3. **Palette-orphan fixes**: E-3, T-1, E-5 — touch the same code paths; do as one PR with one regression-test suite.
4. **State-reset fixes**: E-1, INT-1 — small, isolated.
5. **Backup validation**: S-2 — independent, add a fixture-based test.
6. **Init-order fix**: T-2 — small, isolated.
7. **High-risk gated**: INT-3 / C-3 (Generate confirm dialog) — own PR with end-to-end test that mocks `done` with 1s and asserts the modal shows.
8. **JSON-import validation**: C-6 — small, paired test.
9. **Pause for user decisions** on the `[needs-approval]` and `[question]` queues.

Re-run `npm test` after each PR (baseline: **154 suites / 1742 tests pass in ~5.5s**) and add regression tests as part of each fix.
