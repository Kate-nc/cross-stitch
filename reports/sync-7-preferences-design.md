# Sync 7 — Sync Preferences Design

> Phase 2 design. Every preference the user should control,
> grouped by purpose, with default values and the surface they
> live on.

The principles:

- **Sensible defaults so a user never has to open this panel.**
  Sync should "just work" the moment a folder is picked.
- **Anything potentially destructive is opt-in.**
- **Anything observable is shown, not hidden.**
- **Per-device prefs and synced prefs are clearly separated.**

---

## A — Folder configuration  *(per-device)*

| Pref | Type | Default | Notes |
|------|------|---------|-------|
| Sync folder | folder picker | unset | The mechanism that turns sync on at all |
| Device name | string ≤ 60 chars | "" | Shown to other devices in the file list |
| Disconnect from sync folder | action | — | Confirmation dialog warns local data unaffected |

## B — What to sync  *(per-device, but the choice itself is captured into each `.csync` so user can reason about it)*

| Pref | Type | Default | Notes |
|------|------|---------|-------|
| Sync project charts | switch | **on** | The whole point of sync |
| Sync stitch progress | switch | **on** | Off ⇒ each device tracks its own progress on the same chart |
| Sync stash inventory & shopping list | switch | **on** | |
| Sync user preferences (theme, units, etc.) | switch | off | Opt-in; surprises users today |
| Sync custom palettes | switch | on | Currently bundled with prefs; split into its own switch |

## C — Sync behaviour  *(per-device)*

| Pref | Type | Default | Notes |
|------|------|---------|-------|
| Automatic sync | switch | **on** when folder is configured | Off ⇒ "Sync now" button only |
| Auto-import incoming changes | "Always ask" / "Auto-merge safe changes / ask on conflict" / "Always auto-merge" | **Auto-merge safe / ask on conflict** | Defines whether `merge-tracking` and `new-remote` cases run without prompt |
| Polling interval | "Off" / "30s" / "60s" / "5min" | **60s** | Only used while page visible |
| Conflict default action | "Always ask" / "Keep local" / "Keep both" | **Always ask** | What the SyncSummaryModal shows pre-selected |
| Backup before destructive sync | switch | **on** | Snapshot local IDB to undo store before any "keep-remote" or merge-into-local |
| Local backup retention | 7 / 30 / 90 days | **7 days** | Capped at 20 entries also |

## D — Visibility & feedback  *(per-device)*

| Pref | Type | Default | Notes |
|------|------|---------|-------|
| Show sync pill in header | switch | on | The persistent status indicator |
| Show per-project sync badge | switch | on | The little dot on each project card |
| Notify on sync errors | switch | on | Toast when a real failure happens |
| Notify on every successful sync | switch | off | Quiet by default — only show when something needs attention |

## E — Diagnostics  *(per-device, not synced)*

| Pref / action | Type | Default | Notes |
|---------------|------|---------|-------|
| View sync activity log (last 100 events) | action | — | A read-only modal — what the engine has done recently |
| Reset device identity | action | — | Generate a fresh deviceId; useful for rare "I cleared browser data and now my files orphaned themselves" recovery |
| Forget all known devices | action | — | Drops the receipt store; next sync re-scans everything |

## F — Safety  *(per-device, mostly hidden in an "Advanced" disclosure)*

| Pref | Type | Default | Notes |
|------|------|---------|-------|
| What happens on first connection to populated sync folder | "Run reconciliation wizard" / "Replace local with remote" / "Replace remote with local" / "Always ask" | **Run reconciliation wizard** | The duplication-fix preference |
| Allow auto-import on visible-page focus | switch | off | When auto-import is "Always auto-merge", this controls whether visiting the page triggers it |

---

## Surface placement

All prefs live in **Preferences → Sync, backup & data** (the
existing Sync section, currently a stub). Layout:

```
Sync, backup & data
├── ── Folder ──
│   ├── Sync folder: [Choose folder…] [Disconnect]
│   ├── Device name: [_______________]
│   └── Status: ✓ Synced 2 minutes ago — 4 projects, 24 threads, 1 device
├── ── What to sync ──
│   ├── ☑ Project charts
│   ├── ☑ Stitch progress           ↑
│   ├── ☑ Stash & shopping list      ⎬ all-on by default
│   ├── ☐ User preferences
│   └── ☑ Custom palettes
├── ── Behaviour ──
│   ├── Automatic sync: ☑
│   ├── When changes arrive: ⦿ Auto-merge safe / ask on conflict
│   ├── Check for updates every: 60 s ▾
│   └── Default conflict action: Always ask ▾
├── ── Safety ──
│   ├── ☑ Backup local data before destructive sync
│   └── Keep backups for: 7 days ▾
├── ── Notifications ──
│   ├── ☑ Show sync pill in header
│   ├── ☑ Show per-project sync badge
│   ├── ☑ Notify on sync errors
│   └── ☐ Notify on every successful sync
├── ── Backup (manual) ──     (existing — unchanged)
│   ├── Download a backup
│   └── Restore from a backup file
├── ── Start over ──          (existing — unchanged)
│   ├── Delete all patterns
│   └── Delete my stash
└── ── Advanced ▸ ──          (collapsed by default)
    ├── First-connection behaviour: Reconciliation wizard ▾
    ├── Auto-import on focus: ☐
    ├── View sync activity log
    ├── Reset device identity
    └── Forget all known devices
```

The legacy Home dashboard sync card becomes **read-only status +
"Open settings"** — the controls move to Preferences. This unifies
where sync is configured and removes the conflicting source of
truth between dashboard and prefs.

---

## End of preferences design
