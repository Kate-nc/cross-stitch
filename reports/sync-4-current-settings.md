# Sync 4 — Current Sync Settings & UI Audit

> Read-only inventory of every sync touch-point in the existing UI.

## 1. Where sync UI lives today

| Surface | File / Line | What it offers |
|---------|-------------|----------------|
| Home dashboard "Cross-device sync" card (legacy) | [home-screen.js#L1180–L2050](../home-screen.js#L1180) | All sync controls — folder picker, device name, auto-sync toggle, manual export, manual import, "check for updates", updates list |
| Header File menu (every page) | [header.js#L640–L700](../header.js#L640) | "Export .csync" and "Import .csync" only — no folder, no status |
| Preferences modal → "Sync, backup & data" | [preferences-modal.js#L897–L920](../preferences-modal.js#L897) | Empty placeholder — actual sync prefs are commented out as "Auto-sync stitch progress hidden — multi-device sync not implemented yet" |
| Sync Summary modal | [modals.js#L408–L575](../modals.js#L408) | Per-import preview + per-conflict resolution buttons |
| `/home` (new landing, default) | [home-app.js](../home-app.js) | **None** — no sync UI was ported across the Workshop refresh |
| `/stitch.html` and `/manager.html` | — | None (header File menu only) |

## 2. Setup flow today (Device 2 onboarding)

1. User installs the PWA on Device 2 / opens it in a browser.
2. User navigates to `index.html` (the legacy dashboard) — **not** the default `/home`.
3. User scrolls past project list to find a "Cross-device sync" card.
4. User clicks "Choose sync folder", `showDirectoryPicker` opens.
5. User picks the folder previously chosen on Device 1 (must remember which one — there is no hint).
6. App calls `setWatchDirectory`, then `checkForUpdates`.
7. If updates exist, an "Updates available" panel appears with one row per other device.
8. User clicks each row → `SyncSummaryModal` opens → user reviews and applies.
9. (Future loads) Same flow, except the folder is remembered and only permission needs re-granting on first interaction.

There is no welcome wizard, no "first time" branding, no warning that they're about to merge with existing local data.

## 3. Status feedback today

`SyncEngine.getSyncStatus()` returns:

```js
{
  deviceId, deviceName, lastExportAt, lastImportAt,
  hasFolderWatch, hasWatchDir, autoSync
}
```

…but the only place this is rendered is the legacy dashboard card (last-export / last-import shown as "Last exported: 5 minutes ago", "Last imported: never"). The header has no status pill. The new `/home` has no status. Per-project status (`syncMeta.lastSyncedAt`) is not rendered anywhere.

## 4. Error feedback today

| State | Surface | Quality |
|-------|---------|---------|
| Permission denied on folder pick | `setSyncResult({ type: 'error', message: ... })` shown as a toast-like row in the dashboard card | Adequate |
| Auto-export skipped due to permission | `console.warn` only | Invisible to user |
| Corrupt/partial `.csync` in folder | `console.warn` only, file silently dropped from updates list | Invisible to user |
| Sync file decompression error during import | `setSyncResult({ type: 'error' })` with raw exception message | Acceptable but jargon-y |
| Disk full / write failure | Same | Same |
| Folder gone / handle stale | Same | Same |
| Conflict during merge | Renders SyncConflictCard | Good (clear three-way choice) |
| First-time sync vs ongoing sync | No distinction | Bug surface |

## 5. Preferences related to sync

In [preferences-modal.js → DataPanel](../preferences-modal.js#L832):

```js
var autosync = usePref("autoSyncEnabled", true);   // declared but UI hidden
var autoLib  = usePref("autoLibraryLink", true);   // visible (Stash auto-link)
```

The "Sync" section currently only exposes the "Add new patterns to the library automatically" switch. The auto-sync toggle is intentionally suppressed — see the comment at [preferences-modal.js#L901](../preferences-modal.js#L901):

> Auto-sync stitch progress hidden — multi-device sync not implemented yet.

So the sync prefs that *should* be in this central location are duplicated/scattered:
- "Enable folder auto-sync" lives only in the legacy Home dashboard card.
- "Sync stash" / "Sync prefs" don't exist as toggles at all (hard-coded in `exportSync`).
- "Device name" lives only in the legacy Home dashboard card.

## 6. What happens if the user never configures sync

Everything works locally. No nags, no surfaces, no degradation. ✅

## 7. Summary of UX gaps

1. **No surface on the default landing page (`/home`).** The user has to discover the legacy `index.html` dashboard.
2. **No header status pill.** No "synced 2 minutes ago" / "syncing…" / "sync paused".
3. **No central preferences entry.** Prefs panel is stubbed with a TODO comment.
4. **No first-time experience.** First-sync is the same modal as ongoing sync.
5. **No per-project sync indicator.** `syncMeta` is written but invisible.
6. **No undo.** Once a conflict is resolved, the loser is gone.
7. **No granular controls.** Stash and prefs sync are all-or-nothing.

These gaps directly inform the Phase 2.3 "preferences design" and Phase 2.4 "UI proposals" reports.

---

## End of current settings audit
