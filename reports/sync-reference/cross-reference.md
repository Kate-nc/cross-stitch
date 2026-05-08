# Agent 3 — Same root cause as the broader sync audit, or separate?

> Companion to [00_DIAGNOSIS.md](00_DIAGNOSIS.md). Builds on
> [reference-storage.md](reference-storage.md) and [review-gate.md](review-gate.md).
> Cross-references the earlier [reports/sync/](../sync/) audit.

## Verdict

**Two overlapping problems, partial overlap with the prior audit.**

| Problem | Same as prior audit? | Fix locus |
|---|---|---|
| (P1) Each device must independently pick the watch folder via the OS picker. | Not in audit; this is a **browser-security invariant**, not a bug. | UX only — auto-discovery + clearer onboarding. |
| (P2) Even after both devices are pointed at the shared folder and the watcher works, "Review sync" on Device B shows the empty state. | **No** — the prior audit covered the watcher-not-firing case. This is a *separate* bug: the watcher's events don't populate `_lastReceivedPlan`. | `_processFolderUpdates` should also dispatch `sync-plan-ready` (or the header button should read from a different source). |
| (P3) Watcher never re-scans without manual trigger. | **Yes** — already documented in [00_DIAGNOSIS.md](../sync/00_DIAGNOSIS.md) Link [4]. | Polling loop fix recommended there. |

The user's symptom — "Review sync says nothing to review on Device B" —
is **mostly P1 and P2**. P3 is a separate sync-correctness issue that
also exists but produces a different user-visible failure ("patterns
don't appear at all").

## Re-using the prior audit's findings

Working through the directive's checklist against existing reports:

- *Does the app hold the file open?* No — confirmed by
  [reports/sync/cloud-sync.md](../sync/cloud-sync.md) (open→write→close
  via the File System Access API). So the file is readable from Device B
  whenever the cloud service has delivered it; the bug is **not**
  Device B failing to read.
- *Does the app have a file watcher?* The prior audit
  ([reports/sync/00_DIAGNOSIS.md](../sync/00_DIAGNOSIS.md) Link [4]) said
  no, but the current codebase shows
  `_runWatcherTick`/`_processFolderUpdates` at
  [sync-engine.js:1786-1943](../../sync-engine.js#L1786-L1943) and
  [home-screen.js:1338-1348](../../home-screen.js#L1338-L1348)
  starts the watcher on mount. So either the audit is now stale (the
  polling fix landed) or the watcher only runs on `/home`. **Worth a
  developer check** — see verification below.
- *Is the file path stored device-locally?* Yes — the
  `FileSystemDirectoryHandle` lives in IndexedDB
  ([reference-storage.md](reference-storage.md)). And it cannot move:
  it's not a path string, it's a permission token.

## Does the import flow write into the `.csync` file?

**No.** Confirmed by [reports/sync/file-format.md](../sync/file-format.md)
(no device-joining field) and the open→write→close write pattern in
[sync-engine.js:1568-1570](../../sync-engine.js#L1568-L1570). Device B
importing does not modify the file Device A wrote — it writes its own
file with a different filename
(`cross-stitch-sync-<DeviceB-name>-<DeviceB-id>.csync`).

So a Device B "user must independently set this up" prompt is
**partially correct behaviour** — but only for the watch-folder permission
grant. Once both devices are pointed at the folder, sync should be
automatic; it is not because of P2 and (possibly) P3.

## Is there meant to be a handshake?

There is no explicit handshake step in the code. The intended model,
inferred from naming and dataflow:

1. Each device picks the shared folder once (one-time per-device setup —
   forced by browser security).
2. Each device's watcher tick reads any `.csync` in the folder that
   wasn't written by itself.
3. Imports are auto-applied if conflict-free, otherwise queued for
   review.

Step 1 is the unavoidable manual step. Steps 2-3 are meant to be
automatic and silent. The "Review sync" header button is supposed to
re-open the most recent review session — currently it only knows about
sessions that came from the manual file picker, not the watcher.

## Auto-discovery is not implementable in this stack

The directive's "auto-discover by scanning common cloud folder paths"
option is **not viable** here: this is a PWA running in a browser sandbox,
not Electron. The browser cannot enumerate the filesystem without an
explicit `showDirectoryPicker()` call. P1 cannot be eliminated — only
made less mysterious.

## Verification the developer can run

```js
// (a) Is the watcher actually polling on /home?
const orig = window.SyncEngine._runWatcherTick || window.SyncEngine.checkForUpdates;
let ticks = 0;
const id = setInterval(() => console.log('watcher ticks observed:', ticks), 5000);
const sub = setInterval(() => { /* monkey-patch left as exercise */ }, 0);
// Easier: open DevTools → Sources → search "_runWatcherTick", set a logpoint,
// leave /home open for ~60s. If you see ≥1 hit, the polling fix has landed.

// (b) Confirm the watcher and "Review sync" use different channels
//     Drop a .csync with conflicts into the folder externally, wait 15s.
//     /home should show the "N updates available" banner.
//     Now click File → Review sync — empty state is the bug (P2).

// (c) Confirm the .csync file is genuinely readable on Device B
//     (i.e. it really is the same file, not a name collision)
//     Run on Device B in DevTools:
const handle = await window.SyncEngine.getWatchDirectory();
for await (const [name, h] of handle.entries()) {
  if (h.kind === 'file' && name.endsWith('.csync')) {
    const f = await h.getFile();
    console.log(name, f.size, new Date(f.lastModified).toISOString());
  }
}
// Compare names/sizes with what Device A wrote.
```

## Cross-references

- [reference-storage.md](reference-storage.md) — exact storage locations.
- [review-gate.md](review-gate.md) — the gate has only one condition.
- [reports/sync/00_DIAGNOSIS.md](../sync/00_DIAGNOSIS.md) — the polling
  gap (Link [4]).
- [reports/sync/file-format.md](../sync/file-format.md) — `.csync`
  carries no device-joining record.
- [reports/sync/cloud-sync.md](../sync/cloud-sync.md) — file is not
  held open.
