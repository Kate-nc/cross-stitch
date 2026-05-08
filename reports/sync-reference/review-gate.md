# Agent 2 — What does "Review sync" check before showing content?

> Companion to [00_DIAGNOSIS.md](00_DIAGNOSIS.md) and
> [reference-storage.md](reference-storage.md).

## The gate is one condition, no rescan

[modals.js:1155-1178](../../modals.js#L1155-L1178), inside
`SyncReviewGateInner`'s mount effect:

```js
React.useEffect(function() {
  if (!plan) { setGateState({ noPlan: true }); return; }
  Promise.resolve()
    .then(() => SyncEngine.readSnapshot())
    .then(snapshot => setGateState(SyncEngine.analyseConflicts(plan, snapshot)));
}, []);
```

That is the entire decision. There is **one** condition: was a non-null
`plan` prop passed in. The empty-state render at
[modals.js:1311-1318](../../modals.js#L1311-L1318) is fired purely on
`gateState.noPlan === true`:

```js
h('h3', { id: 'srg-header' }, 'Nothing new to review'),
h('p', …, 'Import a .csync file to review changes from another device.')
```

There is **no** check for: file existence on disk, file readability,
last-synced timestamp, version match, device-id allow-list, or "is this
file newer than the last review". The user-visible message conflates
two distinct states ("no file ever connected" vs. "connected but
nothing new") into one string.

The mount effect has an empty dependency array — opening the gate does
not trigger `SyncEngine.checkForUpdates()` and does not re-scan the watch
folder. **Opening "Review sync" is a pure read of in-memory state.**

## Why Device B sees the empty state

`plan` is supplied by `window.SyncReviewGate.open(plan, …)`. The header
"Review sync" button at [header.js:865-874](../../header.js#L865-L874)
calls `open(_lastReceivedPlan, { autoTrigger: false })`.

`_lastReceivedPlan` is the module-scoped variable from
[header.js:14-30](../../header.js#L14-L30), populated **only** by the
`sync-plan-ready` event listener. As [reference-storage.md](reference-storage.md)
documents, `sync-plan-ready` is dispatched from exactly one site —
[header.js:850-862](../../header.js#L850-L862), the manual
"Import Sync (.csync)…" file picker.

The background watcher is a separate event channel. When the watcher
finds a new `.csync` and the plan is **auto-applicable**, it imports
silently and dispatches `cs:backupRestored`
([sync-engine.js:1786-1830](../../sync-engine.js#L1786-L1830)). When the
plan **has conflicts**, it dispatches `cs:syncUpdatesAvailable`, which is
only consumed by `/home` (it drives the "N updates available" banner via
[home-screen.js:1361-1362](../../home-screen.js#L1361-L1362)).

So on Device B, regardless of whether the watcher succeeded, navigated
to `/create` and clicking "Review sync" finds `_lastReceivedPlan === null`
and shows the empty state. The watcher path **never** populates the
variable the header button reads.

## Event channel summary

| Trigger | Event dispatched | Updates `_lastReceivedPlan`? | Where the user sees the result |
|---|---|---|---|
| Manual file picker (header or home) | `sync-plan-ready` | **Yes** | `SyncReviewGate` opens immediately; "Review sync" works on every page until reload |
| Watcher finds auto-applicable file | `cs:backupRestored` | No | Silent import; project list refresh on `/home` |
| Watcher finds file with conflicts | `cs:syncUpdatesAvailable` | No | Banner on `/home` → opens older `SyncSummaryModal` (not `SyncReviewGate`) |
| User clicks "Review sync" with no manual import this session | (none) | (no change) | "Nothing new to review" — even if the watcher silently applied an update 2 minutes ago |

## Two modal layers, easy to confuse

There are two distinct review surfaces and they don't share state:

- `SyncSummaryModal` ([modals.js:402-…](../../modals.js#L402)) — opened
  from the `/home` banner via `setSyncPlan(plan)` in
  [home-screen.js:1622-1632](../../home-screen.js#L1622-L1632). Used for
  watcher-detected conflicts.
- `SyncReviewGate` ([modals.js:1155-1318](../../modals.js#L1155-L1318)) —
  opened by the header "Review sync" menu item or via `window.SyncReviewGate.open()`.
  Used for manual file-picker imports.

Both display the same kind of plan, but each is wired to a different
event. The two were never unified.

## DevTools verification (copy-paste)

```js
// Confirm "Review sync" doesn't trigger a folder rescan
const orig = window.SyncEngine.checkForUpdates;
window.SyncEngine.checkForUpdates = function(...a) { console.log('checkForUpdates fired'); return orig.apply(this, a); };
// Now click File menu → Review sync. Console stays silent.
// For comparison, click /home's "Check for updates" button — console prints.

// Confirm the empty state is purely "_lastReceivedPlan is null"
window.SyncReviewGate.open(null);                    // → "Nothing new to review"
window.SyncReviewGate.open({ projects: [], stash:{}, prefs:{} }); // → analyser runs
```

## What the prior audit missed

The [reports/sync/](../sync/) audit identified the polling-loop gap
(Link [4]) but did not call out the **two-event-channel split**. Even
once polling fires, conflict-bearing updates land in
`cs:syncUpdatesAvailable` and never reach the header's `_lastReceivedPlan`
or `SyncReviewGate`. That is a separate, additive bug from the polling
gap, and it explains the user's specific symptom: "Review sync still
says nothing to review" even on a device whose watcher is working
perfectly.
