# INT-7 — Cross-tab Project Coordination

> **Status (May 2026):** Visibility tier landed in commit-after-675b9db.
> The full coordination layer is queued behind the items below.

## What's in place now (visibility tier)

- `cross-tab-coord.js` — per-tab UUID, single `BroadcastChannel('cs-project-changed')`
  subscription, throttled warning toast.
- `project-storage.js` — `ProjectStorage.save()` broadcasts
  `{type:'project-saved', projectId, sourceTabId, updatedAt}` after the
  IndexedDB transaction commits. Only `proj_*` ids are broadcast (legacy
  `auto_save` ignored).
- All five HTML entry points (`home.html`, `index.html`, `create.html`,
  `stitch.html`, `manager.html`) load `cross-tab-coord.js` before
  `project-storage.js`.

### Behaviour

If two tabs are open on the same project (`localStorage.crossstitch_active_project`
matches the broadcast `projectId`) and the **other** tab saves, the receiving
tab shows a `Toast.show({type:'warning', duration:10000})`:

> This project was changed in another tab. Reload to see the latest version —
> unsaved edits in this tab will be lost.

Toast is throttled to one per 8 seconds (avoids spam when both tabs autosave
in quick succession). The tab that emitted the save does not see its own
broadcast (`BroadcastChannel` does not deliver to the originating context).

### Known limits of the visibility tier

- No automatic conflict detection — both tabs continue to save independently.
  Last-writer-wins on the next save round-trip.
- No state reconciliation — user must reload to pick up the other tab's data,
  which discards any unsaved edits in the active tab.
- Safari < 15.4: `BroadcastChannel` is undefined; `cross-tab-coord.js`
  silently no-ops. Affected users get the same silent-overwrite behaviour
  as before.
- The Stash Manager's `cs-stash-changed` channel is separate. Stash and
  project broadcasts do not share a layer.

## Plan of action for the full feature (INT-7-full)

### Phase A — Detection (1–2 days)

1. Stamp each `ProjectStorage.save()` write with `lastWriteAt: Date.now()`
   and `lastWriteTabId: TAB_ID` inside the project JSON itself (not just
   the broadcast).
2. On every `ProjectStorage.get()`, return the stamps alongside the project.
3. Each tab caches `lastSeenWriteAt` for the active project.
4. Before each save, re-read the IndexedDB record's `lastWriteAt`. If it
   has advanced past `lastSeenWriteAt` and `lastWriteTabId !== TAB_ID`,
   the local copy is stale → enter conflict resolution (Phase B).

### Phase B — Resolution UI (2–3 days)

Three resolution modes, picked by the user from a sticky banner the first
time a conflict is detected:

| Mode | What happens on conflict |
|------|--------------------------|
| **Read-only** (default) | Tab switches to read-only; toast tells user to close one tab. Safest. |
| **Refresh on conflict** | Tab automatically reloads after a 3-second countdown; unsaved edits in the focused tool (Edit / Tracker) are flushed first. |
| **Merge** | Three-way merge: only allowed for tracker (the `done` byte array, halves, sessions). Not safe for Creator (palette changes are non-mergeable). Auto-disabled for Creator tabs. |

User preference stored under `userPrefs.crossTab.conflictMode`. Default
`read-only`.

### Phase C — Locks for high-risk ops (1–2 days)

Some operations can't tolerate a stale read in any mode:

- Palette swap (writes a new `pal` + `cmap` + remapped `pat`).
- Re-generate (full pattern replacement).
- Backup restore (whole-DB overwrite).

For these, acquire a transient lock via
`BroadcastChannel('cs-project-lock')`:

```
{type:'lock-acquire', projectId, sourceTabId, op, expiresAt}
{type:'lock-release', projectId, sourceTabId, op}
```

Locks are advisory + time-boxed (5-second TTL). A tab that wants the lock
posts `acquire`, waits 100 ms for any other tab to reply with their own
`acquire` (later timestamp wins; lower `sourceTabId` breaks ties).

### Phase D — Storage-event fallback (1 day)

For Safari < 15.4, add a `storage` event fallback by writing the broadcast
payload to `localStorage.cs_xt_signal` and immediately removing it. Every
other tab gets a `storage` event with `oldValue`. Less reliable
(serialised, no MessageChannel), but matches the existing degradation in
the Stash Manager.

### Phase E — Stash channel unification (0.5 day)

Fold the existing `cs-stash-changed` channel into a single
`cross-tab-coord.js` so both signals share the same TAB_ID, throttling,
and storage-event fallback. Keep the legacy channel name as an alias for
one release.

## Total estimated effort

5–8 working days. Phase A alone is enough to surface "your edits will be
lost in 3 seconds" countdowns; Phase B is what users actually want.

## Test plan

- Open the same project in two windows of the same browser.
- Edit in tab A; verify toast in tab B within ~200 ms.
- Verify toast does NOT appear when editing in the *same* tab.
- Verify toast does NOT appear when the second tab is looking at a
  different project (`localStorage.crossstitch_active_project` differs).
- Verify Safari < 15.4 silently no-ops (no console errors).
- Verify the toast is throttled (rapid saves do not produce multiple
  toasts within 8 seconds).

## File touch list (visibility tier shipped)

- `cross-tab-coord.js` (new)
- `project-storage.js` (broadcast on save)
- `sw.js` (added to PRECACHE, cache version bumped to v46)
- `create.html`, `stitch.html`, `index.html`, `home.html`, `manager.html`
  (script tag before project-storage.js)
