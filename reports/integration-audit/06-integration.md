# 06 — Integration seams

> Phase 2, area 6. Pulls forward the cross-mode INT-* findings from
> [00-system-map.md](00-system-map.md) and adds verified seam-level
> issues that don't belong inside any single area report. This is the
> last Phase-2 document; the consolidated cross-cutting view follows in
> Phase 3 (`MASTER-SUMMARY.md`).
>
> The five integration boundaries audited here:
> 1. Creator ↔ Tracker (project handoff in both directions)
> 2. Creator ↔ Stash Manager (palette-swap, adapt-to-stash)
> 3. UnifiedApp in-page bridges vs. standalone-page localStorage
> 4. Home (`home.html` + `home-app.js`) ↔ all entry points
> 5. Cross-tab BroadcastChannel + IndexedDB

---

## 1. Creator ↔ Tracker

### 1.1 Creator → Tracker (outbound)

The Creator writes the project to both DBs ([useProjectIO.js](../../creator/useProjectIO.js)) then either:
- (UnifiedApp) calls `onSwitchToTrack()` and the bridge functions, **OR**
- (standalone) writes `crossstitch_handoff` to localStorage and navigates to `stitch.html`.

The Tracker reads in priority order ([tracker-app.js:3440-3500](../../tracker-app.js#L3440-L3500)): `incomingProjectRef` → `crossstitch_handoff` localStorage → URL hash → `getActiveProject()`.

**Verified correct.** The version stamp is correct on this leg (creator writes v11; tracker accepts).

### 1.2 Tracker → Creator (inbound)

`handleEditInCreator` ([tracker-app.js:2925-2980](../../tracker-app.js#L2925-L2980)) builds a fresh snapshot then either:
- (UnifiedApp) calls `__updateCreatorTrackerFields(...)` with all tracker-only fields and `onSwitchToDesign()`.
- (standalone) writes `crossstitch_handoff_to_creator` and navigates.

The Creator consumes at [useProjectIO.js:509-521](../../creator/useProjectIO.js#L509-L521) and clears the key.

### 1.3 Integration bugs

#### INT-1 — Tracker writes version 9; Creator writes version 11
**File**: [tracker-app.js:2957](../../tracker-app.js#L2957) (`version:9`); [useProjectIO.js buildSaveSnapshot](../../creator/useProjectIO.js) (v11)
**Severity**: medium
**Classification**: [auto-fix]

`handleEditInCreator` stamps `version: 9` on the outbound project. The Creator's load path ([useProjectIO.js processLoadedProject](../../creator/useProjectIO.js#L217-L324)) accepts any version ≥ 8 today, but the version number is the contract for forward-migration: stamping v9 on a project that was authored under v11 conventions risks future migration code applying a v9→v10 step that's already implicit in the data.

Fix is mechanical: bump the literal at [tracker-app.js:2957](../../tracker-app.js#L2957) from `version:9` to `version:11`, matching the Creator's current stamp.

**Pre-condition**: confirm the Tracker's `buildSnapshot()` includes every field the v11 contract requires. Inspection of `buildSnapshot` (search the auto-save path at lines 3543-3590) — it includes `statsSessions`, `statsSettings`, `achievedMilestones`, `doneSnapshots`, `breadcrumbs`, `stitchingStyle`, `blockW/H`, `focusBlock`, `startCorner`, `colourSequence`, `originalPaletteState`, `singleStitchEdits`, `halfStitches`, `halfDone`, `wastePrefs`, plus the v3 ref fields (`finishStatus`, `startedAt`, `lastTouchedAt`, `completedAt`, `stitchLog`). These exceed the v11 spec, so the bump is safe.

**Regression test**: Mock `buildSnapshot()`, call `handleEditInCreator` in standalone mode, parse `localStorage.crossstitch_handoff_to_creator`, assert `project.version === 11`.

---

#### INT-2 — Tracker-only fields are preserved across creator round-trip (verified NOT a bug)
**Verified non-bug** — see [00-system-map.md §3](00-system-map.md#3-mode-to-mode-flow) for the full mechanism. `state.trackerFieldsRef.current` mirror at [useProjectIO.js:298-324](../../creator/useProjectIO.js#L298-L324), spread back into auto-save at [useProjectIO.js:60](../../creator/useProjectIO.js#L60) and [:126](../../creator/useProjectIO.js#L126), refreshed by the `becameActive` effect at [:624-655](../../creator/useProjectIO.js#L624-L655). Left here for cross-reference.

---

#### INT-3 — "Generate" silently wipes `done`/`parkMarkers` when project already has progress
**File**: [useCreatorState.js applyResultRef.current ~983-987](../../creator/useCreatorState.js#L976-L1040)
**Severity**: high
**Classification**: [auto-fix] — user pre-approved
> "Add confirm dialog at Generate time when `done` has any 1s."

`applyResultRef.current` unconditionally calls `setDone(new Uint8Array(result.mapped.length))` and `setParkMarkers([])`. If the user has stitching progress in the active project and clicks Generate (after tweaking convert settings or reuploading), all `done` and `parkMarkers` data is lost without warning.

Same finding as [01-create.md C-3](01-create.md#c-3--regenerate-silently-wipes-done--parkmarkers-when-project-has-progress) — written here as well because it's the canonical creator-tracker seam.

**Fix** (per user decision):
1. Inside `applyResultRef.current`, before the `setDone(new Uint8Array(...))` call, check `state.done && state.done.some(v => v === 1)`.
2. If true, surface a confirm modal: *"Re-generating will replace the pattern and clear your stitching progress (X stitches marked, N park markers). Do you want to download a backup first?"*
3. Options: Download backup → trigger backup-restore export; Continue → proceed with reset; Cancel → abort the apply.

**Regression test**: Set `done` to a `Uint8Array` with `done[0] = 1`, call `applyResultRef.current({...})`, assert the confirm flow is triggered and the underlying reset is NOT applied unless confirmed.

---

#### INT-4 — Handoff key staleness window
**Cross-ref**: [04-track.md T-3](04-track.md#t-3--handleeditincreator-outbound-writes-do-not-re-load-if-navigation-aborts)

A `crossstitch_handoff_to_creator` written by the tracker persists across an aborted navigation. The Creator consumes it whenever it next opens — possibly hours later — and shows the misleading "tracking progress may be lost" alert at an irrelevant moment.

Pending user decision per T-3.

---

## 2. Creator ↔ Stash Manager

### 2.1 Adapt-to-stash

[creator/AdaptModal.js](../../creator/AdaptModal.js) + [creator/adaptationEngine.js](../../creator/adaptationEngine.js) build a *parallel* project; the source is untouched. **No integration bug.** The adapted project carries `adaptation.fromProjectId` so the Manager can render "Adapted from …" badges ([project-storage.js buildMeta](../../project-storage.js#L156-L160)).

### 2.2 Bulk add to stash

`BulkAddModal` writes to the stash via `StashBridge.updateThreadOwned`. **No integration bug.**

### 2.3 Pattern library sync

`ProjectStorage.save` triggers `StashBridge.syncProjectToLibrary` fire-and-forget. Cross-ref [05-shared-infrastructure.md S-4](05-shared-infrastructure.md#s-4--stashbridgesyncprojecttolibrary-failures-after-projectstoragesave-are-silently-swallowed) — failures are silently swallowed; covered there.

---

## 3. UnifiedApp bridges vs. standalone

### 3.1 Bridges set by `index.html`

| Bridge | Set by UnifiedApp? | Used by |
|---|---|---|
| `window.__setCreatorAppMode` | yes | Tracker `handleEditInCreator` (sets target appMode) |
| `window.__setCreatorProjectName` | yes | Tracker `handleEditInCreator` |
| `window.__updateCreatorTrackerFields` | yes | Tracker `handleEditInCreator` |
| `window.__switchToDesign`, `__switchToTrack` | yes | Tracker (props `onSwitchToDesign`/`onSwitchToTrack`) |
| `window.__goHome` | yes | Header |

When the page is loaded as `create.html`, `stitch.html`, or `manager.html`, none of these are set. The receiving code uses `typeof window.X === 'function'` guards and falls back to URL navigation + localStorage handoff.

### 3.2 INT-5 — Bridge fallback asymmetry
**Severity**: low
**Classification**: [question]

The bridge-vs-fallback decision is made independently at each call site (e.g. `handleEditInCreator` checks `if(onSwitchToDesign)` first, falling through to URL nav otherwise). If a future regression breaks a bridge midway through a session (e.g. UnifiedApp unmounts after Tracker mounts), the Tracker would silently switch to the standalone fallback and write the localStorage handoff — but the page would also still be in the UnifiedApp surface, leading to a state mismatch.

This is currently theoretical (UnifiedApp owns the whole page), but the fragility merits a note.

**Question**: Document the UnifiedApp lifetime invariant ("bridges live as long as the app shell") in `index.html` and add a one-shot assertion in `__switchToDesign`?

---

## 4. Home ↔ entry points

`home.html` + [home-app.js](../../home-app.js) is the landing page (per [AGENTS.md](../../AGENTS.md#workshop-is-the-sole-theme)). Direct URLs to `create.html`, `stitch.html`, `manager.html` still work.

### 4.1 Pending-action handoff from Home

When the user picks "New blank pattern" or "Upload image" from home, the home app sets `window.__pendingCreatorAction` and/or `sessionStorage.cs_pending_image_dataurl` + `cs_pend_meta`, then navigates to `create.html?action=...`. The Creator consumes these in `useProjectIO.js processPendingAction`.

Verified handoff keys (cross-ref [00-system-map.md §3](00-system-map.md#3-mode-to-mode-flow)):
- `pending_home_image` (localStorage, set by home)
- `cs_pending_image_dataurl` (sessionStorage, set by home)
- `cs_pend_meta` (sessionStorage)
- `window.__pendingCreatorAction` (set by `processPendingAction` mid-load to suppress SW reload — never cleared, by design)

### 4.2 INT-6 — Home pending-image handoff has no expiry
**File**: home-app.js sessionStorage write; useProjectIO.js consume
**Severity**: low
**Classification**: [question]

If a user picks "Upload image" on home, the image is stashed in `sessionStorage.cs_pending_image_dataurl`, then navigation to `create.html` is initiated. If the user instead clicks back / cancels the navigation in another tab interaction, the dataURL sits in sessionStorage for the rest of the tab's lifetime. When the user later opens create.html via a different entry-point (e.g. menu → New from blank), the stale image is silently consumed as if they had just chosen it.

Note: sessionStorage is per-tab, so this can't leak across tabs. The window is small but real.

**Question**: Add a timestamp to the pending image and have the Creator ignore entries older than ~60 seconds? Or accept the current behaviour (worst case: user is briefly confused, then dismisses)?

---

## 5. Cross-tab consistency

### 5.1 BroadcastChannel coverage

Only the Stash uses `BroadcastChannel("cs-stash-changed")`. Project edits in one tab do **not** notify other tabs of the same project — the second tab will overwrite the first tab's changes on next auto-save.

### 5.2 INT-7 — Two tabs editing the same project both auto-save, last-write-wins
**Severity**: medium
**Classification**: [needs-approval]

Open the same project in two tabs (creator). Edit in tab A → auto-save fires → CrossStitchDB updated. Tab B still has its in-memory state from the load time. Edit in tab B → auto-save fires → tab A's changes are lost.

No tab-coordination layer exists. Detection requires a per-tab UUID and a server (impossible client-side) or a last-known-`updatedAt` check on load + a `BroadcastChannel("cs-project-changed")` to invalidate stale tabs.

The audit of [reports/sync](../sync/) covers some of this for the multi-device sync flow but does not address two-same-browser-tabs.

**Question**: Add a `BroadcastChannel("cs-project-changed")` that posts `{projectId, sourceTabId, updatedAt}` after every save? Receivers compare against their own `projectId` and, if matched, surface a banner: "This project is being edited in another tab — reload to see changes (your unsaved edits will be lost)."

Cost: small. Risk: low. Impact: defends against silent data loss in the same-browser-multi-tab case.

---

## 6. TODO / open questions

`[auto-fix]` queue for Phase 4 (user pre-approved):
- **INT-1** — bump `version:9` to `version:11` at [tracker-app.js:2957](../../tracker-app.js#L2957).
- **INT-3** — add the confirm-modal flow at Generate-time (per user direction).

`[question]` / `[needs-approval]` for the user batch:
- **INT-4** — handoff-key staleness policy (see also T-3).
- **INT-5** — UnifiedApp bridge-lifetime invariant assertion.
- **INT-6** — pending-image expiry.
- **INT-7** — same-browser two-tab project edit collision.

Cross-references resolved here:
- All five area reports' findings have been linked back where they cross the integration boundary.
- INT-2 confirmed non-bug.
- INT-3 / C-3 are the same finding viewed from two angles (data-flow vs UI flow).
