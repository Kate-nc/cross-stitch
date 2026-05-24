# INT-7 — Cross-tab project coordination

Status: **shipped on `tracking-fixes`** through commit `90c9eba`.

## Why

A user opening the same project in two browser tabs would silently lose
work: whichever tab auto-saved second overwrote the first tab's edits with
no warning, no merge, no recovery. The visibility tier shipped earlier
turned that into a sticky toast ("This project was changed in another tab,
reload to see the latest version"); INT-7 builds on top of it to add
detection, resolution UI, and destructive-op coordination.

The architecture is intentionally **best-effort cooperative**, not a true
distributed mutex. Every signal degrades gracefully when peer tabs are
absent or BroadcastChannel is unavailable. Nothing here blocks a tab from
saving — the worst case is the existing silent-overwrite behaviour, which
is what we had before INT-7.

## Module map

| File | Phase | Role |
|---|---|---|
| [cross-tab-coord.js](../cross-tab-coord.js) | A + B-1 | Tab identity, broadcast channel, subscriber fan-out, last-seen cache. |
| [project-storage.js](../project-storage.js) | B-1 + B-2 | Stamps `lastWriteAt` / `lastWriteTabId` on save; ships `saveChecked()` with stale-read detection. |
| [user-prefs.js](../user-prefs.js) | B-3 | New default `crossTabConflictPolicy: "prompt"`. |
| [cross-tab-resolution.js](../cross-tab-resolution.js) | B-3 | Subscribes to peer saves on the active project, shows Reload / Keep modal. |
| [cross-tab-lock.js](../cross-tab-lock.js) | C | Advisory locks over `BroadcastChannel('cs-project-lock')`. |
| [backup-restore.js](../backup-restore.js) | C | `restore()` requests a wildcard lock before wiping the DB. |

## Phase A — subscription hook

`window.CrossTabCoord.onProjectChanged(cb) → unsubscribe`. The existing
visibility-tier broadcast (`{type:'project-saved', projectId, sourceTabId,
updatedAt}` on `BroadcastChannel('cs-project-changed')`) now fans out to
arbitrary subscribers in addition to the default toast. Self-broadcasts
are filtered by `sourceTabId === TAB_ID`. Errors in any one subscriber
must not break delivery to the others (each invocation is wrapped).

Public surface kept tiny: just `onProjectChanged` plus the existing
`broadcastProjectSaved` and the per-tab `tabId`.

## Phase B-1 — stamp + last-seen cache

Every `ProjectStorage.save()` now stamps two fields on the project object
**before** writing:

- `project.lastWriteAt = Date.now()` (epoch ms, numeric, used for
  comparisons).
- `project.lastWriteTabId = window.CrossTabCoord?.tabId || null`.

In the same `tx.oncomplete` it calls `CrossTabCoord.noteSeen(...)` for
the local tab and broadcasts the extended payload (`lastWriteAt` +
`lastWriteTabId` appended to the existing message).

Loaders ([creator/useProjectIO.js](../creator/useProjectIO.js),
[tracker-app.js](../tracker-app.js)) call `noteSeen(...)` in
`processLoadedProject()` so the cache is seeded the moment a project is
opened. Legacy projects without the new fields are tolerated — the cache
entry just holds `null` until the first stamped save.

`getSeen(projectId)` returns `{lastWriteAt, lastWriteTabId} | null` and
is the input to the Phase B-2 conflict check.

## Phase B-2 — `saveChecked()` with stale-read detection

`ProjectStorage.saveChecked(project)` is the new opt-in conflict-aware
save:

```js
{ ok: true,  id }
{ ok: false, reason: 'conflict', id, remoteWriteAt, remoteWriteTabId }
```

A conflict requires **all** of:

1. `CrossTabCoord.getSeen(id)` returned a baseline with a numeric
   `lastWriteAt` (i.e. we've actually loaded or saved this project in
   this tab).
2. The in-IDB `current.lastWriteAt` is greater than `seen.lastWriteAt`.
3. The in-IDB `current.lastWriteTabId` is a non-empty string different
   from `seen.lastWriteTabId`.

Any failure of the detection path (missing IDB record, missing
CrossTabCoord, thrown read) falls through to the existing `save()` so
saveChecked is always safe to call. The legacy `save()` is untouched —
existing callers keep their last-write-wins behaviour until we wire them
up explicitly (see *Follow-ups*).

## Phase B-3 — resolution UI

`window.CrossTabResolution.handle(info) → Promise<'reload' | 'keep'>`,
plus an `init()` that:

- Subscribes to `CrossTabCoord.onProjectChanged` and gates on
  `localStorage[crossstitch_active_project]` so the modal only fires for
  the project this tab actually has open.
- Sets `CrossTabCoord._suppressActiveToast = true` so the visibility-
  tier warning toast steps aside — no double-notification.

The policy is read from `UserPrefs.get('crossTabConflictPolicy')` (new
default `"prompt"`):

- `"prompt"` — `ConfirmDialog` with **Reload** / **Keep my edits**. On
  reload: `window.location.reload()`. On keep: do nothing; this tab's
  next save wins.
- `"reload"` — silently reload to pick up the remote save.
- `"keep"` — no-op.

Re-entrancy guard: while a modal is open, further calls resolve as
`'keep'` without re-opening. Safe fallbacks: missing UserPrefs →
`prompt`; missing ConfirmDialog → `keep`; missing CrossTabCoord (Safari
without BroadcastChannel) → init no-ops, direct `handle()` still works.

## Phase C — destructive-op advisory locks

`window.CrossTabLock.requestLock(projectId, opLabel, opts) → Promise<{ok,
denials}>`. Mechanism:

1. Requester broadcasts `{type:'lock-request', requestId, sourceTabId,
   projectId, opLabel}` on `BroadcastChannel('cs-project-lock')`.
2. Peers whose `localStorage[crossstitch_active_project]` equals
   `projectId` — or, when `projectId === '*'`, any peer with a non-null
   active project — reply with `{type:'lock-deny', requestId,
   denyingTabId, denyingActiveProject}`.
3. Requester collects denials for `opts.timeoutMs` (default 250 ms,
   clamped 50–2000 ms) and resolves `{ok: denials.length === 0,
   denials}`.

Integration: [backup-restore.js](../backup-restore.js) `restore()` awaits
a wildcard lock before the IDB write loop. On denials it prompts via
`ConfirmDialog` with `danger:true` ("Restore anyway" / "Cancel") and
throws `Restore cancelled — another tab has a project open.` on refusal.
Missing `CrossTabLock` or `ConfirmDialog` falls back to today's
behaviour; internal lock errors don't block the restore. Wildcard
fail-closed when `ConfirmDialog` is absent prevents silent destruction of
peer state.

The lock module reuses `CrossTabCoord.tabId` when available so logs line
up across the two channels.

## Dropped — Phase E

Phase E (cross-tab stash signalling) was dropped during planning. The
existing `cs:stashChanged` CustomEvent is same-window only; promoting it
to a BroadcastChannel would touch the Stash Manager's persistence path
and the Creator's `MaterialsHub` ownership reconciliation simultaneously,
and the user-visible cost of *not* having it is low (the stash data
itself doesn't race the way active projects do — adds/removes are
commutative). Tracked as future work; no scaffolding left in.

## Follow-ups (deliberately deferred)

| Follow-up | Why deferred |
|---|---|
| Wire `saveChecked()` into Creator `persistAll`, Tracker auto-save effects, `EditProjectDetailsModal`, and `creator/AdaptModal.js`. | The B-3 broadcast → modal is the primary UX. `saveChecked` is defence-in-depth and the affected save sites are the highest-blast-radius code in the app; needs its own focussed PR with regression sweep. |
| Wire advisory broadcasts from `applyResultRef` and `resetAll` in [creator/useCreatorState.js](../creator/useCreatorState.js). | Both are called from sync worker callbacks. Awaiting a 250 ms lock check would restructure the regenerate flow; better tackled with the lock module already in place and proven. |
| Storage-event fallback for Safari < 15.4. | Listed in [cross-tab-coord.js](../cross-tab-coord.js) header as Phase D. Today's behaviour on those browsers is **no cross-tab signal at all** — same as pre-INT-7 — which is acceptable. |

## Safari fallback

Every module guards on `typeof BroadcastChannel !== 'undefined'`. When
absent (Safari < 15.4):

- `CrossTabCoord` loads with the full public surface; `broadcastProjectSaved`
  is a silent no-op; subscribers register normally and simply never fire.
- `CrossTabResolution.init()` still attaches its subscriber to
  CrossTabCoord, which is harmless given the above.
- `CrossTabLock.requestLock()` always resolves `{ok:true, denials:[]}`,
  so `BackupRestore.restore()` proceeds exactly as it did before INT-7.

## Tests

| Suite | Count | Covers |
|---|---|---|
| [tests/crossTabCoord.test.js](../tests/crossTabCoord.test.js) | 33 | TAB_ID, subscriber fan-out, last-seen cache, broadcast payload shape, toast throttle, suppression hook. |
| [tests/projectStorageSaveChecked.test.js](../tests/projectStorageSaveChecked.test.js) | 17 | saveChecked conflict matrix; falls through to save() on any baseline / read failure. |
| [tests/crossTabResolution.test.js](../tests/crossTabResolution.test.js) | 29 | Public surface, policy decisions, ConfirmDialog wiring, re-entrancy, active-project gate, HTML load order, SW precache. |
| [tests/crossTabLock.test.js](../tests/crossTabLock.test.js) | 31 | requestLock + auto-deny over isolated `BroadcastChannel` stub, wildcard semantics, multi-peer denials, timeout clamping, Safari no-op, restore-path integration. |

Full suite at the end of Phase C: **164 suites / 1896 tests** passing.

## Manual smoke tests

Setup: serve over HTTP (`node serve.js`) so the SW activates. Open two
browser windows side-by-side, **not** two tabs in the same Chrome window
if you want to confirm the broadcast crosses windows.

### Test 1 — peer-save modal (Phase A + B-3)

1. Window A: open the Pattern Creator, generate or load a project,
   confirm it auto-saves (Save status pip green).
2. Window B: open the same project from Home / library.
3. Window A: make any edit that triggers a save (paint a cell).
4. **Expect** Window B to show a **"Project changed in another tab"**
   ConfirmDialog within ~1 second with **Reload** / **Keep my edits**
   buttons.
5. Click **Keep my edits** — modal dismisses, no reload, the next edit
   you make in Window B will overwrite Window A's change on save.
6. Repeat steps 1–3, this time click **Reload** — Window B reloads and
   shows Window A's change.

### Test 2 — pref `crossTabConflictPolicy = "reload"`

1. In either window, open DevTools console and run:
   ```js
   window.UserPrefs.set('crossTabConflictPolicy', 'reload');
   ```
2. Repeat Test 1 step 3. **Expect** Window B to **silently reload**
   without a modal.
3. Reset with `UserPrefs.set('crossTabConflictPolicy', 'prompt')`.

### Test 3 — pref `crossTabConflictPolicy = "keep"`

1. `UserPrefs.set('crossTabConflictPolicy', 'keep')` in Window B.
2. Repeat Test 1 step 3. **Expect** Window B to show **no modal and no
   toast**; the next save from Window B overwrites Window A's change.
3. Reset to `'prompt'`.

### Test 4 — toast suppression (Phase B-3 hook)

1. Open a project in two windows. Confirm the modal fires per Test 1.
2. In Window B's console: `window.CrossTabCoord._suppressActiveToast`
   should be `true`.
3. Confirm there is **no warning toast** behind the modal — modal-only.

### Test 5 — backup restore lock (Phase C)

1. Window A: open any project in the Creator and leave it open.
2. Window B: open the Stash Manager → Settings → Restore from backup.
   Pick any `.json` / `.csb` backup file.
3. **Expect** Window B to prompt:
   > **"Other tabs have projects open** — Restoring a backup will
   > overwrite all projects, including any that another tab may be
   > editing. Unsaved work in those tabs will be lost. Continue?"
4. Click **Cancel** — restore aborts with the error "Restore cancelled —
   another tab has a project open." Window A's project is intact.
5. Repeat, this time clicking **Restore anyway** — restore proceeds
   normally, Window A's tab will be on stale data until reload.

### Test 6 — restore with no peers (Phase C happy path)

1. Close all other tabs / windows (or just don't open any project).
2. Restore the same backup. **Expect** no lock prompt — restore runs
   straight through as it did before INT-7.

### Test 7 — Safari fallback

If you have Safari < 15.4 (or DevTools-disable BroadcastChannel):

1. Console: `window.CrossTabCoord && window.CrossTabCoord.tabId` should
   still return a UUID — the module loaded.
2. Open the same project in two tabs and save in one. **Expect** no
   toast, no modal in the other tab (pre-INT-7 silent overwrite is the
   documented fallback).
3. Backup restore should run without the lock prompt regardless of how
   many tabs are open.

### Test 8 — stale-read conflict (Phase B-2, optional)

`saveChecked` is not wired into any UI today, so this needs DevTools:

1. Window A: open a project, note its id from the URL or
   `localStorage.crossstitch_active_project`.
2. Window B: open the same project (this stamps `seen` for Window B).
3. Window A: paint, wait for the save pip to go green.
4. Window B console:
   ```js
   const id = localStorage.crossstitch_active_project;
   const p = await ProjectStorage.get(id);
   await ProjectStorage.saveChecked(p);
   ```
   **Expect** `{ ok: false, reason: 'conflict', remoteWriteAt, remoteWriteTabId }`.
5. Re-run after a `processLoadedProject` (reload the page so the seen
   cache reseeds) — **expect** `{ ok: true, id }`.
