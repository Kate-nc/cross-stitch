# Branch Audit Summary — `double-checking` → `main`

**Audited at HEAD**: `f36436a` ("Fixes for difficulty")
**Merge base**: `ca4519f` (`main`)
**Commits in branch**: 18
**Code files changed**: 27 (excluding 38 markdown/HTML research artefacts)
**Generated artefact**: `creator/bundle.js` regenerated

## Defect totals

| Severity | Count | IDs |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 4 | DEFECT-001 (RT restore), DEFECT-004 (revert wipes progress), DEFECT-009 (manager-edit clobber), DEFECT-015 (test coverage) |
| MEDIUM | 3 | DEFECT-002 (silent unknown dst), DEFECT-007 (per-project wastePrefs), DEFECT-008 (multi-tab) |
| LOW | 8 | DEFECT-003, 005, 006, 010, 011, 012, 013, 014 |

## Merge readiness

**Verdict: NOT READY**

Three HIGH defects involve **silent data loss** for users on plausible workflows:
- DEFECT-001: Disable+restore loses earlier sessions' deductions.
- DEFECT-004: "Revert to generated palette" wipes all stitching progress with no warning and no undo path for the lost progress.
- DEFECT-009: Mid-session manager edits are silently overwritten by the next debounced flush.

A fourth HIGH (DEFECT-015) is the cumulative test gap. None of the four require deep architectural rework; all four are individually fixable in 1–4 hours.

The remainder are MEDIUM/LOW and can ship as documented follow-ups.

**Recommendation**: Fix DEFECT-001, DEFECT-004, and DEFECT-009 before merging. DEFECT-015 can be partially addressed (pure-function tests at minimum) before merge; UI/integration tests can follow.

## Commit-quality heatmap

| Commit | Defects originated | Notes |
|---|---|---|
| `7e34511` (Live stash deduction) | 001, 007, 008, 009, 011 | Largest single source of HIGH defects. The feature's safety-net flows (restore on disable, multi-actor coordination) were under-engineered. |
| `bcca388` (Restore original colours) | 004 | Pattern-restore destroys progress silently. |
| `fa3c594` (mis-labelled, ships colour-swap source) | 002, 003, 005, 012, 014 | Five LOW/MED defects + the misleading message. |
| `5b2ebff` (split blends in 3 more sites) | 013 | Symbol named in message not located; verify with author. |
| `d5cf109` (canvas fabric colour) | 006 | Pref-key migration missed. |
| `0f528c9` (net stitches) | 011 | Negative-clamp missed. |
| `3044d38` (project-stats visibility) | 010 | Silent polling timeout. |
| `e54d5c1`, `e9342bb`, `ee6bf97`, `be2e2b6`, `7575577`, `dde642f`, `f36436a`, `255142d`, `9d3bab5`, `3c41d15`, `410da6f` | — | Clean (or the defects they would have introduced are already covered by other commits). |

## Top 5 highest-risk areas post-merge

1. **Live stash deduction safety nets** — DEFECT-001/008/009 all combine to make the new feature look correct in single-tab single-session use but lose data in realistic multi-tab or mid-session scenarios. **Most likely to generate user-reported data loss.**
2. **Palette revert** — DEFECT-004 destroys progress on a plausible misclick (the revert button sits inside the palette-swap flow, which users will explore).
3. **Wastefully untested pure helpers** — DEFECT-015. `threadCostPerStitch`, `calcDifficulty`, `splitBlendId` are pure functions; lack of tests means the next refactor will break them silently.
4. **Stats palette derivation grey-swatch placeholder** — covered by current consumers but a future "render every palette swatch" view will show grey for blend components and confuse users.
5. **Spelling drift `colorReplace` ↔ `colourReplace`** — small now, accumulates with every new colour-swap related feature.

## Recommended fix order (minimises effort + unblocks merge)

1. **DEFECT-004** (Trivial-Moderate) — gate `revertToGenPalette` behind `confirm()` if `done?.some(v => v === 1)`, OR add `oldDone` to the history entry. Either way, this removes the silent data-loss path.
2. **DEFECT-001** (Moderate) — only capture `rtStashSnapshotRef` on first toggle-on per project. Hold the snapshot across enable/disable cycles within the same project session; clear on `rt_complete_summary` confirm and on `resetAll`.
3. **DEFECT-009** (Moderate) — listen for `cs:stashChanged` in tracker and refresh `rtStashSnapshotRef` from IDB when the event came from outside this tab. Recompute baseline so already-flushed consumption isn't double-counted.
4. **DEFECT-015** (partial — Significant) — add unit tests for `threadCostPerStitch`, `splitBlendId`, `calcDifficulty`. ~30 min each. Defer hook/UI tests.
5. **DEFECT-002** (Trivial) — add toast on unknown destination.
6. **DEFECT-011** (Trivial) — `Math.max(0, ...)` on `setLiveAutoStitches`.
7. **DEFECT-007** (Moderate) — write `settings.wastePrefs` on project save.
8. **DEFECT-006, DEFECT-010** (Trivial each) — pref migration + polling-timeout warning.

Total: ≈8–14 hours of work to clear all merge-blockers and the trivial follow-ups.

## Tech-debt items (not bugs today)

- Spelling drift `colorReplace`/`colourReplace` (DEFECT-005) — will accumulate as new entry points are added.
- `useEditHistory.js` generic handler (DEFECT-012) — implicit contract for two history types.
- Misleading commit messages on `fa3c594`/`255142d` (DEFECT-014) — corrupts `git blame`.
- `[128,128,128]` placeholder for blend-component palette entries (in `buildStatsSummary`) — invisible today, will surface if palette swatches are ever rendered for stats.
- `stashDeducted` state in tracker is set but never read.
- Per-project vs global `wastePrefs` source-of-truth ambiguity even after DEFECT-007 is fixed (which override-cascade rule? Document.).
- `rtWastePrefs` may not be registered in `user-prefs.js` DEFAULTS schema (subagent reports absence).
- `proj.palette` derivation is O(n) per `buildStatsSummary` call; for users with many large Creator projects this scales linearly.
- Inter-tab race for stash writes (DEFECT-008) — design assumption that single-tab use is enforced.
