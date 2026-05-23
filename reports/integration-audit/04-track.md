# 04 — Track mode

> Phase 2, area 4. Covers `tracker-app.js` (the Stitch Tracker page,
> ~377 KB). Cross-references [00-system-map.md](00-system-map.md) (data
> shapes), [01-create.md](01-create.md) (creator → tracker handoff
> outbound), and [03-edit.md](03-edit.md) (palette ops). UX density was
> covered separately in
> [reports/track-mode-ui-audit.md](../track-mode-ui-audit.md) and is
> not repeated here.

---

## 1. Surface scope

| Code | Role |
|---|---|
| [tracker-app.js](../../tracker-app.js) | `TrackerApp` component (~14k lines); render loop, view modes, marking, sessions, stats integration |
| [useDragMark.js](../../useDragMark.js) | Pointer drag → batched `done`-array updates |
| [stats-page.js](../../stats-page.js), [stats-activity.js](../../stats-activity.js), [stats-insights.js](../../stats-insights.js), [insights-engine.js](../../insights-engine.js) | Stats overlay (read-only consumer of `statsSessions`/`doneSnapshots`) |
| [coaching.js](../../coaching.js) | Per-project coaching prompts |
| [helpers.js](../../helpers.js) `saveProjectToDB` / `loadProjectFromDB` | Single-project key (legacy `auto_save`); used by Tracker for DB durability |
| [project-storage.js](../../project-storage.js) | Multi-project layer (`proj_*` ids); Tracker also writes here in parallel |

Tracker surface: marking (block / colour / whole-piece modes),
park-marker placement, partial-stitch toggles, backstitch view-only
overlay, session timer, stats overlay, edit-in-creator handoff, and
stats milestones / breadcrumbs / doneSnapshots / coaching.

---

## 2. Wiring correctness

### 2.1 Dual-database persistence

Every save path in the Tracker writes to **both**:

```js
ProjectStorage.save(snap).then(id => ProjectStorage.setActiveProject(id))
saveProjectToDB(snap)   // legacy auto_save key
```

The two writes are concurrent fire-and-forget. The legacy `auto_save`
key is still consumed by some load fallbacks. Both writes succeeding is
ideal; one succeeding is acceptable; both failing surfaces a toast.
**Correct**, but worth noting that this doubles write amplification.

### 2.2 Counter refs vs `done` array

`doneCountRef` and `colourDoneCountsRef` (lines ~730-760) are
incrementally maintained via `applyDoneCountsDelta` instead of being
recomputed from `done` on every change. Spot-checked the mutation
sites:

- `undoTrack` → calls `applyDoneCountsDelta(redoChanges)` ✓
- `redoTrack` → calls `applyDoneCountsDelta(undoChanges)` ✓
- `markBlockDone` / `markBlockUndone` → apply delta ✓
- `useDragMark` → applies delta on drag-end ✓
- `processLoadedProject` → calls `recomputeAllCounts(done)` after load ✓

No `setDone(` call observed without a corresponding delta or full
recompute. **Correct, but fragile**: any new code path that calls
`setDone` directly will silently desync the counters.

### 2.3 In-page bridges

`window.__updateCreatorTrackerFields`, `__setCreatorAppMode`,
`__setCreatorProjectName`, `__switchToDesign`, `__switchToTrack`,
`__goHome` — set by `index.html` (UnifiedApp), used by tracker at:
- `handleEditInCreator` line 2934 (`onSwitchToDesign`), 2941
  (`__updateCreatorTrackerFields`), 2957 (`__setCreatorProjectName`).
- Header back/home buttons (consumed by `header.js` via props).

When the page is loaded as `stitch.html` instead of `index.html`, these
bridges are undefined; the tracker falls back to `window.location.href`
navigation and writes `crossstitch_handoff_to_creator` to localStorage.
**Both paths exercised and correct.**

### 2.4 Handoff key lifecycle

- Tracker writes `crossstitch_handoff_to_creator` at
  [tracker-app.js:2964](../../tracker-app.js#L2964) then
  `window.location.href = "create.html?source=tracker"`.
- Creator reads at [useProjectIO.js:509](../../creator/useProjectIO.js#L509)
  and removes it at line 513.
- The handoff key is one-shot. **Correct happy path.**

### 2.5 Session backup recovery

`finaliseAutoSession` writes `cs_pending_session_<projectId>` to
localStorage as a backup ([line 1814](../../tracker-app.js#L1814)).
- Cleared by the 5-second auto-save success path
  ([line 3556](../../tracker-app.js#L3556)).
- Recovered on next load at [line 3232-3236](../../tracker-app.js#L3232-L3236)
  with dedupe-by-id, then removed.

Verified the recovery is **idempotent** (id-keyed). If a session is
finalised, backup-written, then auto-saved successfully (backup
cleared), nothing is recovered — no duplicate. If the auto-save fails
and the user reloads, the session is recovered exactly once.
**Correct.**

---

## 3. State correctness

### 3.1 `done` writes are batched

`useDragMark` accumulates pointer-traversed cells into
`dragChangesRef.current` and flushes one `setDone` + one
`applyDoneCountsDelta` at pointer-up. Pushes one undo entry per drag.
**Correct.**

### 3.2 Park markers — placement

Park markers added/removed via single-click in "park" mode
([line 4609](../../tracker-app.js#L4609)). The handler toggles by exact
`(x, y, colorId)` match. Not added to undo history (consistent with
creator side — see [03-edit.md E-7](03-edit.md#e-7--park-markers-cannot-be-undone)).

### 3.3 Persisted vs session-only state

Persisted to project snapshot (`buildSnapshot`):
- `done`, `parkMarkers`, `bsLines`, `halfStitches`, `halfDone`,
  `partialStitches`, `singleStitchEdits`, `threadOwned`.
- `statsSessions`, `statsSettings`, `achievedMilestones`,
  `doneSnapshots`, `breadcrumbs`, `stitchingStyle`, `colourSequence`,
  `originalPaletteState`.
- `blockW`, `blockH`, `focusBlock`, `startCorner`.
- `v3FieldsRef.current` (`finishStatus`, `startedAt`, `lastTouchedAt`,
  `completedAt`, `stitchLog`).
- `wastePrefs`, `fabricCt`, `skeinPrice`, `stitchSpeed`, `stitchZoom`.

Session-only (lost on reload):
- View toggles: `viewMode`, `statsView`, `colorPanelOpen`, `parkLayers`.
- Highlight cursors: `hlRow`, `hlCol`.
- Dirty/loading flags: `dirtyRef`, `lastSnapshotRef`, `incomingProjectRef`.

`hlRow`/`hlCol` are persisted in the snapshot but only consumed for
their "last position" cursor visual; not a correctness issue.

---

## 4. Per-feature behaviour

### 4.1 View modes — block / colour / whole

Switching `viewMode` is pure UI: changes which cells are rendered, but
does not mutate `done`, `pat`, or any persisted field. `focusBlock`,
`blockW`, `blockH` are updated when entering block view and are
persisted, so the user returns to the same block on reload. **Correct.**

### 4.2 Marking — single, drag, block-fill

- Single click on a cell in colour mode: toggles `done[idx]`.
- Drag: `useDragMark` accumulates and flushes on up.
- "Mark block done": iterates the focus-block cells and applies a single
  delta. Verified the block-fill path only marks cells whose
  `pat[idx].id === selectedColorId` (in colour-aware modes) — does not
  accidentally mark `__skip__`/`__empty__` cells.

### 4.3 Partial-stitch toggle

Toggle dispatched from a tap with `partialStitchTool` active; updates
`halfStitches`/`halfDone` maps. Persists. **Correct.**

### 4.4 Sessions

`startAutoSession` triggered by first mark after inactivity threshold
(default `inactivityPauseSec: 90`). `finaliseAutoSession` closes the
session and pushes onto `statsSessions`. `totalAtEnd` is recomputed by
the load path (line 3225-3227) from `netStitches` running totals.

Verified the inactivity timeout uses `setTimeout` with a ref, not the
React state (so no stale-closure issue). **Correct.**

### 4.5 Stats integration

Read-only consumer. Stats overlay reads `statsSessions`,
`achievedMilestones`, `doneSnapshots`, `breadcrumbs` from the project
snapshot. No write-back to the project from stats UI. **Correct.**

### 4.6 Coaching

`coaching.js` evaluates prompts based on session/progress patterns;
shows toasts. Read-only. **Correct.**

### 4.7 `handleEditInCreator` — outbound handoff

Two paths:
- **UnifiedApp path** (`onSwitchToDesign` prop present): saves project
  to both DBs synchronously then calls bridge functions and
  `onSwitchToDesign()`. No URL change. Verified at lines 2925-2960.
- **Standalone path**: writes `crossstitch_handoff_to_creator` and
  navigates to `create.html?source=tracker`. Falls back to base64+pako
  URL hash if localStorage write throws (quota); aborts with alert
  if compressed > 8000 chars.

The serialised project stamps `version: 9` — see INT-1 in
[00-system-map.md §3](00-system-map.md#3-mode-to-mode-flow).

---

## 5. Bugs found

### T-1 — Park markers are not validated against current palette
**File**: [tracker-app.js processLoadedProject + render loop](../../tracker-app.js#L3999-L4015)
**Severity**: medium
**Classification**: [auto-fix]

The render path uses `pm.rgb` (stored on the marker), so visually the
marker still draws fine even if `pm.colorId` is no longer in `cmap`.
But the **colour-layer toggle panel** keys off `cmap` ids; an orphaned
marker has no row in the panel and can never be hidden, dimmed, or
removed via the layer UI. The bare cell-click toggle still works.

This becomes user-visible if a project round-trips through a creator
that removed the colour ([03-edit.md E-3](03-edit.md#e-3--removeunusedcolours-does-not-clean-up-park-markers)).
Fixing E-3 prevents new occurrences; this fix protects existing
projects that may already be broken.

**Repro**: Hand-craft a project JSON where `parkMarkers` contains an
entry with a `colorId` not present in `pattern`/`pal`. Load it in the
tracker. The marker draws but is not toggleable from the layer panel.

**Fix**: In `processLoadedProject`, after the palette is restored and
`cmap` built, filter `parkMarkers`:
```js
const validMarkers = (project.parkMarkers || []).filter(pm =>
  pm && pm.colorId && newCmap && newCmap[pm.colorId]
);
setParkMarkers(validMarkers);
```

If the filter drops any, surface a one-time info toast: "Removed N park
markers for colours no longer in the palette".

**Regression test**: Build a project with a stale-colorId marker, run
through `processLoadedProject`, assert the marker is dropped.

---

### T-2 — `blockW`/`blockH`/`startCorner` localStorage overrides per-project values on load
**File**: [tracker-app.js useState initialisers ~907-914](../../tracker-app.js#L907) and [processLoadedProject ~3135](../../tracker-app.js#L3135)
**Severity**: low
**Classification**: [auto-fix]

The initial `useState` for `blockW`/`blockH`/`startCorner` reads from
`localStorage` (`cs_blockW`, `cs_blockH`, `cs_startCorner`).
`processLoadedProject` then overrides from the project snapshot if the
field is present. Result: a fresh tracker mount briefly shows
*another project's* block size during the first render, then snaps to
the loaded project's saved value once the load effect resolves.

**Repro**:
1. Open project A in tracker with `blockW=20`. (Stored in localStorage.)
2. Switch to project B with `blockW=10`.
3. On B's mount, the initial render uses `blockW=20`; the next render
   snaps to `10`.

**Fix**: Demote localStorage from "initial state" to "fallback when
project doesn't specify". Initialise with the defaults and let
`processLoadedProject` set the values; only fall back to localStorage
when the project has no value.

Alternative: clear the localStorage keys at the end of
`processLoadedProject` if the project specifies its own values.

**Regression test**: Set localStorage `cs_blockW=20`, mount tracker
with a project specifying `blockW=10`, assert the first stable render
uses `10`.

---

### T-3 — `handleEditInCreator` outbound writes do not re-load if navigation aborts
**File**: [tracker-app.js:2962-2966](../../tracker-app.js#L2962-L2966)
**Severity**: low
**Classification**: [needs-approval]

In the standalone path, the tracker writes `crossstitch_handoff_to_creator`
then immediately calls `window.location.href = "create.html?source=tracker"`.
If the user hits back/Esc or the navigation otherwise aborts (e.g.
beforeunload prompt cancelled), the localStorage handoff key is left
populated. The Creator consumes and clears it on next load — but if the
user reloads the **tracker** instead, no harm: the tracker doesn't read
this key.

However, the Creator's consumption at [useProjectIO.js:509](../../creator/useProjectIO.js#L509)
will fire **on the next Creator load**, possibly hours later — and
will alert "This pattern has tracking progress that may be lost"
unrelated to what the user is doing at that moment.

**Question**: Add a timestamp to the handoff and have the Creator
ignore handoffs older than ~30 seconds? Or: add a `pagehide` listener
in the tracker that clears the key if navigation didn't succeed? Or:
accept current behaviour (Creator consumes whenever it next opens —
worst case is a stale alert)?

Out of scope without a decision. No code change yet.

---

### T-4 — Initial-load race: prop-change effect can run after mount effect already loaded
**File**: [tracker-app.js:3428-3500](../../tracker-app.js#L3428-L3500)
**Severity**: low
**Classification**: [question]

Two effects compete on mount:
- The `incomingProject` prop-change effect (line 3428) processes the
  prop if `incomingProject !== incomingProjectRef.current`.
- The mount effect (line 3440) short-circuits on `incomingProjectRef.current`
  but otherwise reads handoff / hash / active project.

If the prop arrives *during* the mount effect (e.g. UnifiedApp sets
the prop in the same tick), the mount effect runs first with an empty
ref, loads from `crossstitch_handoff` or `ProjectStorage`, then the
prop effect runs and overrides. The user sees a brief flicker of the
wrong project. Data is not lost — the prop's project wins.

Empirically UnifiedApp sets the incoming prop *before* the tracker
mounts, so this race rarely triggers. If a future refactor changes
that order, it could become visible.

**Question**: Add a guard flag (`hasLoadedOnce`) that suppresses the
mount effect's fallback chain when an incoming prop is queued?

---

### T-5 — Counter ref invariant is unsignposted and fragile
**File**: [tracker-app.js doneCountRef + applyDoneCountsDelta](../../tracker-app.js#L730-L760)
**Severity**: info (not a bug)
**Classification**: [question]

`doneCountRef` and `colourDoneCountsRef` must stay in sync with `done`
via `applyDoneCountsDelta`. Today this is correct (every `setDone`
call is paired). The invariant is undocumented and any future
contributor calling `setDone` directly will silently desync progress
display.

**Question**: Add a comment block near the refs declaring the
invariant, or factor a `setDoneAndUpdateCounts(delta)` helper that's
the only entry-point?

No behaviour change requested — just hardening.

---

## 6. TODO / open questions

`[auto-fix]` queue for Phase 4:
- **T-1** — filter `parkMarkers` against `cmap` in `processLoadedProject`.
- **T-2** — fix `blockW`/`blockH`/`startCorner` initialisation order.

`[needs-approval]` and `[question]` for user batch:
- **T-3** — handoff key staleness policy (timestamp / `pagehide` clear / accept).
- **T-4** — load-race guard flag.
- **T-5** — counter-ref invariant: document or refactor.

Cross-references:
- INT-1 ([00-system-map.md §3](00-system-map.md#3-mode-to-mode-flow)) — `version:9` stamp at line 2957 instead of bumping to creator's 11.
- INT-3 ([00-system-map.md §4](00-system-map.md#4-shared-state)) / [01-create.md C-3](01-create.md#c-3--regenerate-silently-wipes-done--parkmarkers-when-project-has-progress) — regen silently wipes `done`. The tracker has no notification path; user discovers loss only when opening the tracker again.
- [03-edit.md E-3](03-edit.md#e-3--removeunusedcolours-does-not-clean-up-park-markers) — source-side cause of T-1 (creator removes a colour but leaves the marker).
