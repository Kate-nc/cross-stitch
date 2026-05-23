# Integration audit — actionable checklist

> Flat, ordered, status-trackable list. Kept current as Phase 4
> proceeds. See [MASTER-SUMMARY.md](MASTER-SUMMARY.md) for grouping by
> theme/severity and [per-area reports](.) for context.

Legend:
- `[ ]` open
- `[~]` in progress
- `[x]` done
- `[?]` blocked on user decision
- `[!]` blocked on regression test design

---

## Phase 4A — Low-risk auto-fixes (copy / log changes)

- [ ] **S-3** — Flip `WelcomeWizard.shouldShow` catch to `return true`. ([onboarding-wizard.js:81-86](../../onboarding-wizard.js#L81-L86)). Test: mock `localStorage.getItem` to throw, assert `true`.
- [ ] **S-4** — `console.warn` (and optional `cs_stash_sync_degraded` flag) on `StashBridge.syncProjectToLibrary` rejection. ([project-storage.js:~356-370](../../project-storage.js#L356-L370)). Test: stub bridge to reject, assert warn emitted.
- [ ] **C-5** — Show toast when image decode fails. ([creator/useProjectIO.js:417-419](../../creator/useProjectIO.js#L417-L419)). Test: invalid image input → toast called.
- [ ] **CL-6** — Persist `stitchCleanup.strength` in user prefs alongside `enabled` / `protectDetails` / `smoothDithering`. ([creator/PrepareTab.js](../../creator/PrepareTab.js) + [user-prefs.js](../../user-prefs.js)). Test: set strength, reload, assert restored.
- [ ] **E-6** — Reword back-to-convert modal copy ("Your edits are saved — undo history will be cleared"). ([creator-main.js confirmBackToConvert](../../creator-main.js)). No code-test; visual.

## Phase 4B — Worker lifecycle (refactor)

- [ ] **C-1** — Null `workerRef.current` after stale-error `terminate()`. ([creator/useCreatorState.js:1058-1062](../../creator/useCreatorState.js#L1058-L1062)).
- [ ] **C-2** — `useEffect` unmount cleanup for generate worker. ([creator/useCreatorState.js:1042-1080](../../creator/useCreatorState.js#L1042-L1080)).
- [ ] **CL-1** — `useEffect` unmount cleanup for cleanup worker. ([creator/useCleanupMode.js](../../creator/useCleanupMode.js)).
- [ ] **CL-5** — Drop cleanup-worker result if sub-tool switched mid-flight. ([creator/useCleanupMode.js:248-256](../../creator/useCleanupMode.js#L248-L256)).
- [ ] **Refactor opportunity**: factor `useWorker(scriptUrl, onMessage)` hook that owns the ref and unmount handler. Regression test: mount/unmount Creator 10× and assert no orphan workers.

## Phase 4C — Palette / orphan fixes

- [ ] **E-3** — Filter `parkMarkers` in `removeUnusedColours` and `removeScratchColour`. ([creator/useCreatorState.js:946-961](../../creator/useCreatorState.js#L946-L961), [:933-944](../../creator/useCreatorState.js#L933-L944)). Test: state with marker referencing soon-removed colour → marker removed.
- [ ] **E-5** — Refuse to remove an in-use scratch colour (option a; toast). ([creator/useCreatorState.js:933-944](../../creator/useCreatorState.js#L933-L944)). Test: cell uses "310", call `removeScratchColour("310")`, assert no-op + toast.
- [ ] **T-1** — Filter `parkMarkers` against `cmap` in tracker `processLoadedProject`. ([tracker-app.js processLoadedProject](../../tracker-app.js)). Test: project JSON with stale `colorId` marker → dropped on load + info toast if any dropped.

## Phase 4D — State reset on regenerate / new image

- [ ] **E-1** — Clear `wand.selectionMask` in `resetAll` and `applyResultRef`. ([creator/useCreatorState.js:818-822](../../creator/useCreatorState.js#L818-L822), [:976-1040](../../creator/useCreatorState.js#L976-L1040)). Test: set mask non-null, call applyResult, assert null.
- [ ] **INT-1** — Bump `version:9` → `version:11` in `handleEditInCreator`. ([tracker-app.js:2957](../../tracker-app.js#L2957)). Test: parse outbound handoff, assert `version === 11`.

## Phase 4E — Validation / data integrity

- [ ] **S-2** — Extend `backup-restore.validate()` with cross-field checks (`pattern.length === sW × sH`, `done.length === pattern.length`, marker bounds). ([backup-restore.js:236-297](../../backup-restore.js#L236-L297)). Test: hand-crafted corrupt backup → validate returns `{valid:false, error:...}`.
- [ ] **C-6** — JSON import validates `pattern.length === width × height`. ([creator/useProjectIO.js import path](../../creator/useProjectIO.js)). Test: bad JSON → toast + reject; valid JSON → load.

## Phase 4F — Init order / minor

- [ ] **T-2** — Fix `blockW/blockH/startCorner` initialisation order so project-level value wins on first render. ([tracker-app.js:907-914](../../tracker-app.js#L907-L914)). Test: set localStorage to 20, mount with project `blockW=10`, assert first-stable render uses 10.

## Phase 4G — High-impact, user-gated (pre-approved)

- [ ] **INT-3 / C-3** — Confirm dialog at Generate-time when `done.some(v=>v===1)`. ([creator/useCreatorState.js:976-1040](../../creator/useCreatorState.js#L976-L1040)). Test: state with `done[0]=1` → apply → modal shown, reset blocked unless confirmed.
  - Modal options: Download backup → triggers backup-restore export; Continue → proceeds; Cancel → aborts.

---

## Phase 4H — Pending user decision (blocked)

- [?] **S-1** — Dual-write coordination strategy (drop legacy / wrap helper / accept).
- [?] **C-4** — `lastGenSnapshot` field completeness.
- [?] **C-7** — Worker pipeline wall-clock timeout.
- [?] **C-8** — Terminate in-flight worker on cancel/supersede.
- [?] **C-9** — Reset `bsLines` on re-convert.
- [?] **CL-2** — Cleanup-apply + remove-unused undo asymmetry.
- [?] **CL-3** — Brush-mask per-pointermove allocation (rAF/throttle).
- [?] **CL-4** — Cleanup auto-detect re-serialise gating.
- [?] **CL-7** — Add `stitchCleanup &&` guard in generate-worker.js.
- [?] **E-2** — Auto-clear selection mask on tool change.
- [?] **E-4** — Clear `scratchPalette` on regenerate.
- [?] **E-7** — Park-marker placement undoable.
- [?] **T-3 / INT-4** — Handoff-key timestamp + max-age.
- [?] **T-4** — `hasLoadedOnce` guard for mount-vs-prop race.
- [?] **T-5** — Document counter-ref invariant or refactor.
- [?] **INT-5** — UnifiedApp bridge-lifetime invariant assertion.
- [?] **INT-6** — Pending-image expiry.
- [?] **INT-7** — Cross-tab `BroadcastChannel("cs-project-changed")`.
- [?] **S-5** — Shortcuts conflict policy.
- [?] **S-7** — User-prefs schema versioning.

---

## Test-suite baseline

- **154 suites / 1742 tests pass on `npm test`** in ~5.5s.
- No CI configured.
- Re-run after every Phase-4 PR.
- New regression tests are part of each fix; do not land an auto-fix without one.

## Out of scope (do not touch)
- PDF export bit-stable path: [pdf-export-worker.js](../../pdf-export-worker.js), [creator/pdfChartLayout.js](../../creator/pdfChartLayout.js), [creator/pdfExport.js](../../creator/pdfExport.js).
- Pure colour-maths (already covered).
- Sync engine internals (already audited under [reports/sync/](../sync/)).
- UX density (already covered in `reports/edit-mode-ui-audit.md`, `reports/track-mode-ui-audit.md`, `reports/create-flow-audit.md`).

arbitary change
