# Feature Specification — Sync Review Gate (SCR-062)

> Area: shared-shell / sync  
> Depends on: `sync-engine.js`, `modals.js`, `home-screen.js`, `header.js`,
> `project-storage.js`, `manager-app.js`, `tracker-app.js`  
> Cross-references: VER-AUTH-009, VER-AUTH-013, VER-CONF-004,
> VER-EL-SCR-035-07-01, VER-EL-SCR-035-11e-01, VER-FB-010,
> VER-SYNC-002, VER-SYNC-004, VER-SYNC-005, VER-SYNC-008,
> VER-SYNC-009, VER-SYNC-010

---

## 1. Feature Summary

The Sync Review Gate is a blocking modal that fires when the app detects
incoming sync data — either at load time (via folder-watch auto-scan) or
immediately after a manual `.csync` file import from the sync menu. It
silently merges all additive, non-conflicting changes (new projects, new
stitches, stash increases that only the remote device made) and reports them
as facts in a compact summary. Only genuine conflicts — the same data changed
to different values on both devices since the last shared snapshot — require
user input. The user resolves each conflict with a binary "Keep mine" / "Use
synced" choice; there is no dismiss or cancel path. Once all conflicts are
resolved (or if none exist), a single Continue button finalises the merge,
dispatches `cs:stashChanged` and `cs:backupRestored`, and loads the app
normally. The gate is also accessible on demand from the sync menu
(EL-SCR-035-11e) after initial load.

---

## 2. Interface Map Entry (for 00_INTERFACE_MAP.md)

| Screen ID | Name | Type | Page (HTML) | Component file | Render condition | Est. elements |
|---|---|---|---|---|---|---|
| SCR-062 | Sync Review Gate | modal | all pages | `modals.js` (new `SyncReviewGate` component) | `sync-plan-ready` event received with a non-null plan; or `SyncReviewGate.open()` called manually | ~21 |

Add to the **Area: shared-shell** section of 00_INTERFACE_MAP.md alongside
SCR-043 (Backup & Restore Modal) and SCR-039 (Preferences Modal).

---

## 3. Full Element Specification

### EL-SCR-062-01 — Gate Modal Container

- **Type**: dialog overlay (uses the existing `Overlay` component,
  `variant="dialog"`, `dismissOnScrim={false}`)
- **Render condition**: always present when SCR-062 is active
- **Behaviour**: full-screen scrim with centred panel. `dismissOnScrim` is
  explicitly `false`; there is no close/X button. Body scroll is locked. Focus
  is trapped inside the panel. Escape key is consumed and does nothing.
- **Dimensions**: max-width 520 px on desktop; full-screen on viewports
  narrower than 540 px. Max-height 85 vh with `overflow-y: auto` on the
  panel's scrollable body region (everything between the header and footer).
- **Accessibility**: `role="dialog"`, `aria-modal="true"`,
  `aria-labelledby="srg-header"`. Initial focus placed on the first
  interactive element inside the panel on open.
- **State variants**: loading (plan is being built), empty (no changes),
  summary-only (changes but no conflicts), conflict-pending (unresolved
  conflicts remain), resolving (applying merge in progress).
- **CSS tokens**: `--surface`, `--text-primary`, `--radius-sm`,
  `--shadow-sm`, `--motion`.

---

### EL-SCR-062-02 — Modal Header

- **Type**: heading row
- **Render condition**: always visible within SCR-062
- **Content**:
  - Primary text: "Changes from [Device Name]" if `plan.summary.deviceName`
    is non-empty; otherwise "Sync Review".
  - Secondary text (subtitle): "Synced on [date/time formatted as
    `fmtTimeL(plan.summary.createdAt)`]". Omit if `createdAt` is
    "unknown".
- **Layout**: icon (`Icons.sync()`) left of the heading text. No
  close/X button — intentionally absent.
- **Accessibility**: `id="srg-header"` so `aria-labelledby` on the container
  resolves correctly.

---

### EL-SCR-062-03 — "You're up to date" State

- **Type**: empty-state block
- **Render condition**: active when the plan contains zero changes across all
  four data types AND the gate was triggered automatically (not manually).
- **Content**: icon (`Icons.check()`), heading "You're up to date", body
  "Nothing has changed since your last sync." Continue button
  (EL-SCR-062-21) is the only interactive element and is immediately enabled.
- **Behaviour**: if the gate was triggered automatically by a folder-watch
  scan and this state is reached, auto-dismiss after 2 seconds by invoking
  the same path as the Continue button. A 2-second countdown is not shown to
  the user; the modal simply disappears. If the user focuses the Continue
  button before the 2-second timer fires, cancel the timer and wait for
  explicit click.
- **No-emoji rule**: "You're up to date" — no tick emoji. Use `Icons.check()`
  SVG at 20 × 20 px.

---

### EL-SCR-062-04 — "Nothing New to Review" State (manual trigger)

- **Type**: empty-state block
- **Render condition**: active when the gate was triggered MANUALLY from the
  sync menu (EL-SCR-035-11e) but there is no pending sync file loaded (i.e.
  `SyncReviewGate.open()` was called with `null` plan or a plan that has
  already been applied since the last import).
- **Content**: icon (`Icons.sync()`), heading "Nothing new to review", body
  "Import a .csync file to review changes from another device." A single
  "Close" button that dismisses the modal (unlike the automatic trigger, the
  manual trigger IS dismissible when there is nothing to review). The "Close"
  label is used instead of "Continue" to signal that no action was taken.
- **Note**: this state differs from EL-SCR-062-03 because EL-SCR-062-03
  arises when a plan WAS loaded but contained zero differences. This state
  arises when the gate is opened manually with no plan at all.

---

### EL-SCR-062-05 — Summary Section Container

- **Type**: section block
- **Render condition**: visible whenever a plan with at least one change is
  present (i.e. not in the EL-SCR-062-03 or EL-SCR-062-04 states).
- **Layout**: a vertical stack of summary lines (EL-SCR-062-06 through
  EL-SCR-062-09), preceded by a short heading: "Applied automatically". Each
  line is rendered only for data types that have at least one change. If no
  data type has a non-conflicting change to report (every detected difference
  is a conflict), the heading and section are hidden.
- **Behaviour**: all changes described here have already been silently merged
  into the local database by the time the gate is shown. They are facts, not
  pending actions.

---

### EL-SCR-062-06 — Stitching Progress Summary Line

- **Type**: text row with leading icon
- **Render condition**: visible when `gateState.stitchSummary.totalAdded > 0`
- **Content format**: "[N] stitches added across [M] project[s]"
  - N = total cells where remote.done[i]=1 and local.done[i]=0 across all
    projects classified as `merge-tracking` or `new-remote`
  - M = count of affected projects
  - "project" is pluralised to "projects" when M > 1.
- **Icon**: `Icons.needle()` (or nearest equivalent in icons.js; add if
  absent — 24 × 24, stroke-based, `currentColor`) at 16 × 16 px display
  size.
- **Non-conflicting definition**: a stitch cell is non-conflicting if
  `remote.done[i] = 1` and `local.done[i] = 0` (the remote device added
  a stitch this device had not marked). These cells are merged additively via
  the existing `mergeDoneArrays()` logic before the gate renders. Conflicting
  cells (see EL-SCR-062-13) are NOT counted in this summary line and are NOT
  auto-merged.

---

### EL-SCR-062-07 — Thread Stash Summary Line

- **Type**: text row with leading icon
- **Render condition**: visible when `gateState.stashSummary.updatedCount > 0`
  and the plan includes stash data (`plan.stashMerge !== null`).
- **Content format**: "[N] thread count[s] updated"
  - N = number of distinct thread IDs where the owned count changed and the
    change is non-conflicting per the snapshot comparison (see Snapshot
    Storage Spec §4.3).
  - "count" is pluralised to "counts" when N > 1.
- **Icon**: `Icons.thread()` (or nearest equivalent; add if absent) at
  16 × 16 px display size.
- **Non-conflicting definition**: a thread count update is non-conflicting
  when the snapshot records value S, local current value is L, remote value
  is R, and exactly one of L ≠ S or R ≠ S is true (only one device changed
  it). The gate applies `Math.max(L, R)` for threads where R > S and L = S
  (remote-only increase). For threads where L > S and R = S (local-only
  change), local value is preserved. These rules extend the existing additive
  `mergeStash()` behaviour and apply it only to non-conflicting cases.

---

### EL-SCR-062-08 — Project Metadata Summary Line

- **Type**: text row with leading icon
- **Render condition**: visible when `gateState.metaSummary.updatedCount > 0`
- **Content format**: "[N] project[s] updated (name / status / completion)"
  - N = count of projects where at least one metadata field was merged
    non-conflictingly.
  - The parenthetical "name / status / completion" is present verbatim and
    acts as a visual hint of what "metadata" means; it is not dynamically
    populated with the specific fields that changed.
- **Icon**: `Icons.folder()` (or nearest equivalent; add if absent) at
  16 × 16 px display size.
- **Non-conflicting definition**: a metadata field is non-conflicting when
  the snapshot records value S, local current value is L, remote value is R,
  and exactly one of L ≠ S or R ≠ S is true. Fields covered: `name`,
  `state` (project status), `completionPct` if present. Chart-structural
  fields (`pattern`, `w`, `h`, `bsLines`) are NOT covered here — they are
  handled by the existing `classifyProjects()` fingerprint logic.
- **Merge rule**: take the non-snapshot-divergent device's value (the device
  whose value matches the snapshot keeps the other device's newer change).

---

### EL-SCR-062-09 — Preferences Summary Line

- **Type**: text row with leading icon
- **Render condition**: visible when `gateState.prefsSummary.updatedCount > 0`
  and the plan includes prefs data (`plan.syncObj.prefs !== undefined`).
- **Content format**: "[N] preference[s] updated"
- **Icon**: `Icons.settings()` (or nearest equivalent) at 16 × 16 px display
  size.
- **Non-conflicting definition**: a pref key is non-conflicting when exactly
  one device changed it since the snapshot. Conflicting prefs (both devices
  changed the same key to different values) are NOT auto-applied; they are
  surfaced as conflict cards (EL-SCR-062-13).
- **Default rule for unresolvable pref conflicts**: if the snapshot does not
  exist, all pref differences are treated as non-conflicting using the
  timestamp-wins rule: whichever device's `syncObj._createdAt` is more recent
  wins per key. This eliminates most pref conflicts without user input on
  first-ever sync. Surface this rule to the user by appending "(applied by
  date)" to the summary line text when the timestamp-wins fallback was used.

---

### EL-SCR-062-10 — Conflict Section Container

- **Type**: section block
- **Render condition**: visible only when `gateState.conflicts.length > 0`.
  Hidden entirely when there are no conflicts.
- **Layout**: vertical stack containing EL-SCR-062-11 (heading),
  EL-SCR-062-12 (counter chip), then the list of EL-SCR-062-13 conflict
  cards. A visible divider (`border-top: 1px solid var(--line)`) separates
  the conflict section from the summary section above.

---

### EL-SCR-062-11 — Conflict Section Heading

- **Type**: subheading text
- **Render condition**: visible when EL-SCR-062-10 is visible
- **Content**: "Resolve conflicts"
- **Behaviour**: purely informational; no interaction.

---

### EL-SCR-062-12 — Conflict Counter Chip

- **Type**: inline badge
- **Render condition**: visible when EL-SCR-062-10 is visible
- **Content format**: "[R] of [T] resolved"
  - R = count of conflict cards where the user has chosen "Keep mine" or
    "Use synced"
  - T = total number of conflict cards (`gateState.conflicts.length`)
- **State variants**:
  - Incomplete (R < T): `background: var(--accent-2)`, `color: var(--text-primary)`
  - Complete (R = T): `background: var(--success)`, `color: #fff`
- **Live update**: re-renders on each card resolution without page reload.
- **Accessibility**: `aria-live="polite"` so screen readers announce count
  changes.

---

### EL-SCR-062-13 — Conflict Card Container

- **Type**: card (list item within EL-SCR-062-10)
- **Render condition**: one card rendered per item in `gateState.conflicts`.
  All cards are visible simultaneously (list layout, not one-at-a-time
  carousel). Justification: showing all conflicts at once lets the user
  assess total scope before deciding; typical syncs have ≤5 conflicts; a
  progress counter (EL-SCR-062-12) provides orientation within the list.
- **Conflict types and their card subtypes**:
  1. **Stitch conflict** — a project where at least one cell has
     `local.done[i] = 1` and `remote.done[i] = 0`. Resolution applies to
     the whole project's `done` array, not per-cell.
  2. **Stash conflict** — a thread where L ≠ S AND R ≠ S AND L ≠ R
     (both devices changed the same thread's owned count since the snapshot).
  3. **Metadata conflict** — a specific project field (name, state) where
     L ≠ S AND R ≠ S AND L ≠ R.
  4. **Preference conflict** — a pref key where L ≠ S AND R ≠ S AND L ≠ R
     AND the snapshot-based rule could not auto-resolve it (both edits have
     the same timestamp or no timestamps are available).
- **Layout**: card background `var(--surface)`, border `1px solid var(--line)`,
  border-radius `var(--radius-sm)`. Contains EL-SCR-062-14 through
  EL-SCR-062-20.
- **State variants**: unresolved (default), resolved (after "Keep mine" or
  "Use synced" chosen — card dims to 0.7 opacity, resolution indicator
  EL-SCR-062-20 appears, choice buttons show checkmark on chosen option).

---

### EL-SCR-062-14 — Conflict Card Subject Line

- **Type**: text, heading within card
- **Render condition**: always present inside EL-SCR-062-13
- **Content by conflict type**:
  - Stitch: "Project: [project name]" + subtext "N stitches in disagreement"
  - Stash: "Thread: [brand] [id] [name]" (e.g. "DMC 310 Black" or
    "Anchor 403 Black") + subtext "Owned count differs"
  - Metadata: "Project: [project name]" + subtext "[field name] differs"
    (e.g. "Name differs")
  - Preference: "Setting: [human-readable pref label]" (not the raw
    `cs_pref_*` key — use a mapping table of pref keys to human labels) +
    subtext "Updated on both devices"
- **No-emoji rule**: no emoji or unicode symbols in any of these strings.

---

### EL-SCR-062-15 — Conflict Card — This Device Value

- **Type**: labelled value block
- **Label**: "This device"
- **Content by conflict type**:
  - Stitch: "[N] stitches done out of [T] total"
    (count of `local.done[i] === 1`)
  - Stash: "Owned: [L]" (local owned count)
  - Metadata: the local field value (e.g. local project name)
  - Preference: the local pref value (human-readable where possible;
    e.g. "Centimetres" not "cm")
- **Styling**: `color: var(--text-primary)`, bordered box with label above
  value.

---

### EL-SCR-062-16 — Conflict Card — Synced Value

- **Type**: labelled value block
- **Label**: "Synced from [Device Name]" if device name known;
  "Synced version" otherwise
- **Content**: same structure as EL-SCR-062-15 but populated from the remote
  data.
- **Styling**: identical to EL-SCR-062-15. Both value blocks sit side by side
  on desktop (2-column grid); stack vertically on narrow viewports
  (< 400 px).

---

### EL-SCR-062-17 — Conflict Card — "Keep mine" Button

- **Type**: button
- **Label**: "Keep mine"
- **Render condition**: always present inside EL-SCR-062-13
- **Behaviour**: sets the resolution for this conflict item to `"keep-local"`.
  Updates EL-SCR-062-12 counter. Sets resolved styling on the card.
  Idempotent — clicking again when already chosen is a no-op.
- **Accessibility**: `aria-pressed` reflects current selection state.
- **Styling**: secondary button style (`background: var(--surface)`,
  `border: 1px solid var(--line)`). Chosen state: `border-color: var(--accent)`,
  `color: var(--accent)`.

---

### EL-SCR-062-18 — Conflict Card — "Use synced" Button

- **Type**: button
- **Label**: "Use synced"
- **Render condition**: always present inside EL-SCR-062-13
- **Behaviour**: sets the resolution for this conflict item to `"keep-remote"`.
  Symmetric to EL-SCR-062-17.
- **Accessibility**: `aria-pressed` reflects current selection state.
- **Styling**: secondary button style; chosen state matches EL-SCR-062-17.
- **Note**: there is no "keep both" option in the gate (unlike the existing
  `SyncConflictCard` in `SyncSummaryModal` which offers "Keep Both"). The
  gate is designed for binary resolution at the field level; keeping both
  versions of a project name or stash count is not meaningful. For
  chart-structural conflicts (where the existing `SyncConflictCard` does
  offer "Keep Both"), chart-level conflicts bypass the gate entirely and
  retain the existing `SyncSummaryModal` flow (see Integration §5.1).

---

### EL-SCR-062-19 — Continue Button

- **Type**: button (primary action, in the modal footer)
- **Render condition**: always present within SCR-062 except in the
  EL-SCR-062-04 "Nothing new to review" state (which shows "Close" instead).
- **Label**: "Continue"
- **State variants**:
  - Disabled: `gateState.unresolvedCount > 0`. Tooltip / `aria-description`:
    "Resolve all conflicts above to continue".
  - Enabled: all conflicts resolved (or zero conflicts).
  - Applying: button label changes to "Applying…", button disabled, spinner
    icon shown, while `executeGateMerge()` runs.
- **Behaviour on click** (enabled state):
  1. Transition to "Applying…" state.
  2. Call `SyncEngine.executeImport(plan, conflictResolutions)` with the
     gate's collected `conflictResolutions` map.
  3. Write the new snapshot to IDB (`writeSnapshot()`).
  4. Dispatch `cs:stashChanged` and `cs:backupRestored` on `window`.
  5. Dismiss the modal.
  6. Show a 5-second success toast: "Sync complete — [summary line]".
- **Accessibility**: `aria-disabled="true"` when disabled (not `disabled`
  attribute alone, so it remains reachable by keyboard for the tooltip).

---

### EL-SCR-062-20 — Conflict Card Resolution Indicator

- **Type**: inline badge / checkmark overlay on the card
- **Render condition**: visible inside EL-SCR-062-13 after the user has
  chosen a resolution.
- **Content**: `Icons.check()` + short label: "Mine kept" or "Synced used"
  depending on the chosen resolution.
- **Styling**: `color: var(--success)`, rendered at the top-right of the
  card. Cards with a resolution are shown at 0.7 opacity to visually
  de-emphasise resolved items; the resolution indicator itself is at full
  opacity.

---

### EL-SCR-062-21 — Continue Button (alias for EL-SCR-062-19)

Elements 19 and 21 refer to the same button. Element 21 is the canonical
reference used in the "You're up to date" state (EL-SCR-062-03) where no
conflict section exists.

---

## 4. Snapshot Storage Specification

### 4.1 What is stored

The snapshot captures the state of this device at the moment it last
successfully completed a sync (or on `beforeunload` if no sync has ever
been applied). It covers the same four data types as the gate:

```jsonc
{
  "_snapshotAt": "2026-05-05T10:00:00.000Z",   // ISO timestamp
  "_deviceId": "dev_abc123",                     // this device's ID
  "projects": {
    "proj_1712345678": {
      "name": "Blue Bird",
      "state": "active",
      "updatedAt": "2026-05-04T09:00:00.000Z"
      // chart-structural fields (pattern, bsLines) are NOT stored;
      // fingerprinting already handles structural conflict detection.
      // totalTime and sessions are not stored because done-array conflicts
      // are detected without a snapshot (direct cell comparison).
    }
  },
  "stash": {
    "dmc:310": 3,
    "anchor:403": 2
    // keys use brand-prefixed format as stored in stitch_manager_db
  },
  "prefs": {
    "cs_pref_units": "cm",
    "cs_pref_currency": "GBP"
    // only keys in SYNC_PREF_ALLOWLIST + "crossstitch_custom_palettes"
  }
}
```

Stitching progress (`done` arrays) is NOT stored in the snapshot. Cell-level
conflicts are detected by direct comparison of local current `done` vs remote
`done` — the snapshot is not needed for this check because the conflict
definition (local=done, remote=undone) does not require a baseline.

### 4.2 Where it is stored

**IDB object store `sync_snapshots`** in the existing `CrossStitchDB`
database, keyed by the string `"latest"`.

Rationale:
- Stash thread maps (450+ DMC + 450+ Anchor entries) can reach 15–30 KB
  serialised. localStorage's ~5 MB per-origin limit is shared with
  everything else the app stores; IDB has a much larger quota.
- All other persistent app data already uses IDB. This keeps the data tier
  consistent.
- A single `"latest"` key gives O(1) read/write; there is no need for a
  history of snapshots.
- **CrossStitchDB version bump**: from v3 to v4. The `onupgradeneeded`
  handler in `helpers.js` `getDB()` must create the `sync_snapshots` store
  during the v3→v4 upgrade: `db.createObjectStore("sync_snapshots")`.

### 4.3 When it is written

Two triggers:

1. **On each successful gate/import completion**: immediately after
   `executeGateMerge()` resolves and before `cs:backupRestored` is
   dispatched. This ensures the snapshot always reflects the post-merge
   state, so the NEXT sync can correctly diff from this point.

2. **On `beforeunload`**: a debounced snapshot is written when the user
   closes or navigates away from the page, capturing any changes the user
   made during the session (stitch progress, stash edits, metadata renames)
   so they are available for the next sync's three-way comparison. Use a
   synchronous IDB write via the `sync_snapshots` store (same pattern as
   `helpers.js` `saveProjectToDB`). This is a best-effort write;
   `beforeunload` handlers can be truncated by the browser on mobile — the
   gate's conflict detection degrades gracefully when the snapshot is stale
   (see §4.4).

Snapshots are NOT written on every individual save because the overhead of
reading all project names, all stash counts, and all synced prefs on every
keystroke would be prohibitive.

### 4.4 Stale and missing snapshots

When no snapshot exists (first install, storage cleared, IDB migration not
yet run), the gate cannot perform three-way conflict detection for stash,
metadata, or prefs. It behaves as follows:

- **Stitching progress**: unaffected — conflicts are detected by direct cell
  comparison, no snapshot needed. Normal conflict cards are shown.
- **Stash**: all differences are treated as non-conflicting. The gate adopts
  the additive `Math.max(local, remote)` rule (same as the existing
  `mergeStash()`) and reports the result in EL-SCR-062-07. A notice is added
  to the summary section: "No sync history found — stash counts merged
  conservatively." No stash conflict cards are shown.
- **Metadata**: all differences default to taking the remote value (remote
  device is the source of change in the import context). Summary line
  EL-SCR-062-08 is shown; no metadata conflict cards.
- **Prefs**: timestamp-wins rule applies (see EL-SCR-062-09). No pref
  conflict cards.

The net effect is that a first-ever sync on a device can never produce stash,
metadata, or pref conflicts; only stitch-progress conflicts are possible.

### 4.5 Snapshot timestamp and device ID

Both fields are embedded for auditability:
- `_snapshotAt`: ISO 8601 timestamp at the moment of write.
- `_deviceId`: value from `localStorage.getItem("cs_sync_deviceId")`. If
  localStorage is unavailable, stored as `"dev_unknown"` (matching the
  existing `getDeviceId()` fallback).

These fields are not used in conflict detection logic but are surfaced in
developer-mode logging and will be useful for diagnosing future edge cases
without requiring a production repro.

---

## 5. Integration Notes

### 5.1 SyncEngine integration

The gate consumes the plan object produced by the existing
`SyncEngine.prepareImport()` — it does not replace it. The gate is a new
presentation and decision layer on top of the existing pipeline.

**Trigger mechanism**: the gate listens for the existing `sync-plan-ready`
CustomEvent (dispatched by `header.js` after `prepareImport()` completes).
No new event or SyncEngine method is needed. The event's `detail` is
`{ plan }` — the gate reads `plan.classified`, `plan.stashMerge`,
`plan.syncObj.prefs`, and `plan.summary`.

The gate then:
1. Runs the additional field-level conflict analysis (stash/metadata/prefs)
   using the local IDB snapshot.
2. Calls `SyncEngine.executeImport(plan, resolutions)` once the user confirms
   Continue — using the same `executeImport` function already tested by the
   existing VER-SYNC-* suite.

**Chart-structural conflicts** (classification `"conflict"` in `classifyProjects()`)
are handled differently from the gate's field-level conflicts: a project with
a differing fingerprint STILL goes through the existing `SyncConflictCard`
path (Keep Local / Keep Remote / Keep Both). The gate calls this as a
sub-modal within its own conflict section, or delegates to a purpose-built
card — but the resolution is stored in the same `conflictResolutions` map
that `executeImport()` expects. This maintains backward compatibility with
VER-SYNC-007.

### 5.2 Conflict classification mapping

| Existing classification | Gate behaviour |
|---|---|
| `identical` | Silent pass. Not reported in summary — would create noise. |
| `new-remote` | Silent auto-import via `executeImport`. Counted in the projects section of the summary if the project is actually new (not reported if it's an incremental-mode absence). |
| `merge-tracking` | Auto-merged via `mergeTrackingProgress()`. Stitch additions reported in EL-SCR-062-06. Cell-level stitch conflicts within a tracking-merge project ARE surfaced as conflict cards (EL-SCR-062-13 type: stitch). |
| `conflict` (fingerprint-level) | Passed to conflict card using the existing "Keep mine" / "Use synced" binary. "Keep Both" is omitted from the gate's binary choice — this is an intentional design difference (binary resolution is simpler for the blocking gate context). A future enhancement can re-add "Keep Both" if user research shows demand. |

Cross-reference: VER-AUTH-009 (confirmed `identical`/`new-remote`/`merge-tracking`
classifications remain correct); VER-AUTH-013 (fingerprint accuracy — extends
to cover bsLines per VER-SYNC-002); VER-SYNC-008 (additive done merge
unchanged by gate).

### 5.3 Event dispatch order

The gate dispatches events AFTER `executeImport()` resolves and AFTER the
snapshot is written:

```
executeImport() resolves
  → writeSnapshot()
  → dispatchEvent(new CustomEvent('cs:stashChanged'))
  → dispatchEvent(new CustomEvent('cs:backupRestored'))
  → dismiss gate modal
  → show success toast
```

`cs:stashChanged` and `cs:backupRestored` must never be dispatched before
`executeImport()` completes — doing so would cause `manager-app.js` and
`tracker-app.js` to reload stale pre-merge state. This ordering is consistent
with the fix recorded in VER-SYNC-005 (commit `aaefd64`).

Cross-reference: VER-SYNC-005 (events dispatched from `handleApplySync` —
the gate's `executeGateMerge` replaces this call site for the new flow).
VER-FB-010 (progress toast — gate shows "Applying…" button state + a
"Syncing…" toast during `executeImport`; this extends the existing behaviour
confirmed as PASS in ver-sync-phase4-audit.md).

### 5.4 App load sequence

The gate overlays the already-rendered page rather than delaying the DOM
render. It does not gate the HTML parsing, CSS application, or React
hydration. The sequence on `home.html` load is:

```
1. Browser parses HTML, applies CSS
2. React mounts home-app.js / home-screen.js components
3. home-screen.js componentDidMount calls SyncEngine.checkForUpdates()
   (existing folder-watch poll — unchanged)
4. If checkForUpdates finds a new file, prepareImport() runs async
5. sync-plan-ready event fires
6. SyncReviewGate mounts as a dialog overlay on top of the rendered home UI
   (body scroll locked, scrim covers home content)
7. User resolves the gate
8. Gate dismisses; home UI becomes interactive
```

The gate thus "blocks" the app in a UX sense (user cannot interact with the
home UI while it is open) but does NOT block the render itself. This is
consistent with how the existing `SyncSummaryModal` works and avoids the
flash-of-unstyled-content problem that a pre-render gate would introduce.

On pages other than `home.html`, the gate fires in the same way: the
`sync-plan-ready` listener in `header.js` mounts the gate. Since the gate
uses the shared `Overlay` component, it works on any page.

### 5.5 EL-SCR-035-11e (sync menu manual trigger)

When the user clicks the sync menu's "Review sync" item (the new manual
trigger entry in EL-SCR-035-11e), `SyncReviewGate.open()` is called with
either:
- The most recent `plan` object from the last `sync-plan-ready` event (if
  one has been received in this session and not yet applied), OR
- `null` (if no plan is pending), which renders EL-SCR-062-04.

**State difference from automatic trigger**: in the manual case, the
gate can be opened even when there are no unresolved conflicts — it
functions as a post-facto review of "what was merged". In the automatic
case, the gate only fires when there is a new plan to apply.

If the user manually opens the gate AFTER a successful auto-merge (the plan
has already been applied), the gate renders EL-SCR-062-04 ("Nothing new to
review") with a "Close" button rather than Continue. The user can import a
new `.csync` file directly from the sync menu to load a fresh plan, which
causes a new `sync-plan-ready` event and a new gate session.

Cross-reference: VER-EL-SCR-035-11e-01 (sync operations visibility guard
confirmed PASS — gate must be subject to the same
`typeof SyncEngine !== 'undefined'` guard).

---

## 6. Edge Case Handling

### EC-1 — No snapshot exists (first install or cleared storage)

When no `"latest"` record exists in the `sync_snapshots` IDB store, the gate
cannot perform snapshot-based three-way conflict detection. Stitch progress
conflicts are still detected by direct cell comparison and surface normally.
For stash, metadata, and prefs, the gate silently applies the conservative
defaults described in §4.4 and adds a single informational line to the
summary section: "No sync history found on this device — changes merged
conservatively." No conflict cards are shown for stash/metadata/prefs in this
case. The gate does NOT block or show an error; it proceeds as if all
stash/metadata/pref differences are non-conflicting. After the gate completes,
the first snapshot is written and subsequent syncs gain full three-way
conflict detection. This is an intentionally soft first-run experience.

### EC-2 — Sync file from an older or newer app version

The existing `SyncEngine.validate()` function already rejects files with
`_version !== SYNC_VERSION` (currently 1) with a human-readable error:
"Unsupported sync file version: N. Please update the app." This error is
raised during `prepareImport()`, before the `sync-plan-ready` event fires.
The gate therefore never receives a plan for an incompatible file. The gate
does not need to handle version migration itself; that is `validate()`'s
responsibility. Cross-reference: VER-SYNC-011 (deferred — migration needed
when `SYNC_VERSION` is incremented).

### EC-3 — Local changes made after the last snapshot write

If the user stitched 10 cells, then immediately imported a sync file without
closing the app (so `beforeunload` has not fired and the IDB snapshot still
reflects the pre-session state), the gate performs a three-way comparison
using a stale snapshot: `snapshot = pre-session state`, `local current =
post-10-stitches state`, `remote = sync file state`. This means those 10
stitches are correctly treated as a LOCAL change (since `local > snapshot`).
If the remote device also stitched in those same cells, a stitch conflict
card is shown correctly. If the remote device did not stitch those cells, the
gate correctly treats the local progress as non-conflicting and preserves
it. The worst case is a stale snapshot for stash or metadata: if the user
added 2 skeins of DMC 310 during the session and the snapshot records the old
count, the snapshot comparison may incorrectly classify the count change as
"both devices changed" even if only the local device changed it. To mitigate
this, the gate should ALWAYS call `window.__flushProjectToIDB()` and attempt
a fresh snapshot write from current in-memory state BEFORE running conflict
analysis, mirroring the existing VER-SYNC-010 pattern in `executeImport()`.

### EC-4 — All changes are non-conflicting

When `gateState.conflicts.length === 0` and at least one change exists, the
gate renders EL-SCR-062-05 (summary section) with one or more change lines
and the Continue button (EL-SCR-062-21) immediately enabled. There is no
conflict section. The user reads the summary and clicks Continue. This is the
expected happy path for regular day-to-day sync usage (stitching progress
merged from the other device). The gate should be fast to dismiss in this
case — no user decision required beyond the single click.

### EC-5 — Zero changes detected

When the plan contains no differences at all (all projects classified
`identical`, no stash delta, no prefs delta), the gate renders
EL-SCR-062-03 ("You're up to date") and auto-dismisses after 2 seconds if
the user does not interact. The 2-second auto-dismiss applies only in this
state and only for automatic triggers. For manual triggers with zero changes,
`SyncReviewGate.open()` renders EL-SCR-062-04 ("Nothing new to review")
with a "Close" button and no auto-dismiss. Cross-reference: VER-SYNC-014
(double-import idempotency — confirmed that re-importing the same file
produces `identical` for all projects, which maps to this zero-changes state).

### EC-6 — Browser closed mid-resolution (partial conflict resolution)

Partial conflict resolutions are held only in React component state inside
the gate modal; they are NOT persisted to IDB or localStorage. If the user
closes the browser tab while the gate is open with three of five conflicts
resolved, on next load the gate checks whether a `sync-plan-ready` event is
fired again (from folder-watch auto-scan). If the same `.csync` file is
present in the watched folder, `prepareImport()` runs again, a new plan is
built, and the gate starts from scratch with zero pre-filled resolutions. If
the file is not present (manual import with no watched folder), no gate fires
on next load. The partial resolutions are lost. This is acceptable because:
(a) the prior import was never committed — `executeImport()` was never called
— so no data was changed; (b) the user can simply re-import the file. A
future enhancement could persist partial resolutions to `sessionStorage` to
survive within-session reloads.

### EC-7 — Remote project deleted locally (tombstone interaction)

The existing VER-SYNC-009 tombstone mechanism (commit `ef78b12`) handles this
case at the `classifyProjects()` level: tombstoned project IDs are skipped
before they can be classified as `new-remote`. The gate therefore never sees a
conflict card for a locally-deleted project — deletion is silently respected,
consistent with the tombstone contract. If the user deleted a project on this
device and the remote device also modified it, the tombstone takes precedence
and the remote's changes are discarded without user input. This is a
deliberate design: "I deleted it" is treated as a stronger intent signal than
"the other device edited it". The summary section does NOT report
tombstone-suppressed projects; they are invisible to the gate. If the user
wants the remote's version back, they can import via Backup & Restore
(SCR-043) which is not subject to tombstone filtering.

---

## 7. Verification TODO

### Snapshot write and read

- [ ] `VER-SYNC-GATE-001` [P0] — IDB `sync_snapshots` store is created during
  CrossStitchDB v3→v4 upgrade; existing data in other stores is not affected
  by the version bump.  
  <sub>[helpers.js getDB()]</sub>

- [ ] `VER-SYNC-GATE-002` [P0] — Snapshot is written after a successful gate
  completion; reading it back produces the correct post-merge values for
  stash counts, project names, and pref keys.  
  <sub>[sync-engine.js writeSnapshot()]</sub>

- [ ] `VER-SYNC-GATE-003` [P1] — `beforeunload` snapshot write captures
  current in-memory state (stash, project metadata, prefs); stale snapshot
  does not persist across a session where edits were made.  
  <sub>[sync-engine.js writeSnapshot() / beforeunload handler]</sub>

- [ ] `VER-SYNC-GATE-004` [P2] — Snapshot write on `beforeunload` does not
  block or delay the page unload on mobile browsers (write must be
  best-effort, not awaited synchronously in a blocking loop).

- [ ] `VER-SYNC-GATE-005` [P1] — When no snapshot exists, the gate runs
  without errors and produces no stash/metadata/pref conflict cards.
  Summary includes "No sync history found" informational line.  
  <sub>[EC-1]</sub>

- [ ] `VER-SYNC-GATE-006` [P2] — Snapshot `_deviceId` matches `getDeviceId()`
  output; `_snapshotAt` is a valid ISO 8601 timestamp.

### Conflict detection accuracy

- [ ] `VER-SYNC-GATE-007` [P0] — Stitch progress: cells where local=1 and
  remote=0 produce a conflict card; cells where local=0 and remote=1 are
  merged additively (no conflict card). Verified across projects with all
  three classifications: `merge-tracking`, `conflict` (fingerprint-level),
  and `new-remote`.  
  Cross-reference: VER-AUTH-013, VER-SYNC-002, VER-SYNC-008.

- [ ] `VER-SYNC-GATE-008` [P1] — Stash: thread where both L ≠ S and R ≠ S
  and L ≠ R produces a conflict card. Thread where only one device changed
  since snapshot produces a summary-only line. Test with DMC and Anchor
  brand-prefixed keys (`dmc:310`, `anchor:403`).  
  Cross-reference: VER-SYNC-GATE-002, VER-CONF-004 (StashBridge guard).

- [ ] `VER-SYNC-GATE-009` [P1] — Metadata: project name changed on both
  devices since snapshot to different values → conflict card. Project name
  changed on one device only → summary line, not conflict.

- [ ] `VER-SYNC-GATE-010` [P2] — Prefs: pref key changed on both devices to
  different values AND timestamps equal (no tie-break) → conflict card. Pref
  key changed on both devices AND one timestamp is later → timestamp-wins
  rule applied silently, summary line shows "(applied by date)".

- [ ] `VER-SYNC-GATE-011` [P1] — Fingerprint-level chart `conflict`
  classification surfaces binary "Keep mine" / "Use synced" card (no "Keep
  Both" option in gate context). Resolution stored in `conflictResolutions`
  map compatible with `SyncEngine.executeImport()`.  
  Cross-reference: VER-SYNC-007 (existing "Keep Both" path via
  SyncSummaryModal remains accessible for the manual on-demand trigger when
  operating outside the gate).

- [ ] `VER-SYNC-GATE-012` [P1] — `identical` classification produces no
  summary line and no conflict card. Zero noise for unchanged projects.

- [ ] `VER-SYNC-GATE-013` [P2] — Tombstoned projects (VER-SYNC-009) are
  never shown as conflict cards; they are silently skipped before the gate
  analyses the plan.

### Modal rendering

- [ ] `VER-SYNC-GATE-014` [P0] — Gate modal renders on all five HTML entry
  points (home.html, create.html, stitch.html, manager.html, embroidery.html)
  when `sync-plan-ready` fires; body scroll is locked; Escape does nothing.

- [ ] `VER-SYNC-GATE-015` [P1] — EL-SCR-062-03 "You're up to date" state
  auto-dismisses after 2 seconds; timer cancels if Continue button is focused
  before timer fires.

- [ ] `VER-SYNC-GATE-016` [P1] — EL-SCR-062-04 "Nothing new to review" state
  renders a "Close" button (not "Continue") and does not auto-dismiss.

- [ ] `VER-SYNC-GATE-017` [P1] — Conflict counter chip (EL-SCR-062-12)
  updates live as each card is resolved; counter colour transitions to
  `--success` when all resolved; `aria-live="polite"` announces count changes.

- [ ] `VER-SYNC-GATE-018` [P1] — Continue button (EL-SCR-062-19) is disabled
  (`aria-disabled="true"`) while unresolvedCount > 0; transitions to
  "Applying…" + spinner during `executeImport()`; re-enabled on error.

- [ ] `VER-SYNC-GATE-019` [P2] — No emoji or unicode symbol characters
  (including ✓ ✗ → ← ▸) appear anywhere in the gate's user-facing strings.
  All icons via `Icons.*()` SVGs.

- [ ] `VER-SYNC-GATE-020` [P2] — Device name in EL-SCR-062-02 header falls
  back to "Sync Review" when `plan.summary.deviceName` is empty or
  whitespace-only.

- [ ] `VER-SYNC-GATE-021` [P2] — On viewports narrower than 400 px,
  EL-SCR-062-15 and EL-SCR-062-16 value blocks stack vertically (not
  side-by-side); card layout does not overflow horizontally.

- [ ] `VER-SYNC-GATE-022` [P3] — Gate modal has correct `role="dialog"`,
  `aria-modal="true"`, `aria-labelledby="srg-header"`. Focus trapped inside
  panel; Tab cycles focusable elements; focus restored to trigger element on
  dismiss.

### Merge correctness

- [ ] `VER-SYNC-GATE-023` [P0] — After Continue, all non-conflicting changes
  are persisted in IDB (`ProjectStorage` and `stitch_manager_db`). Re-opening
  the same project confirms merged done arrays and correct stash counts.

- [ ] `VER-SYNC-GATE-024` [P0] — "Keep mine" resolution: local data is
  unchanged after executeImport for the conflicted item. Remote value is
  discarded.

- [ ] `VER-SYNC-GATE-025` [P0] — "Use synced" resolution: remote value
  overwrites local value for the conflicted item. Local pre-merge value is
  not recoverable (confirm with undo not available).

- [ ] `VER-SYNC-GATE-026` [P1] — Executing the gate's merge flush
  (`window.__flushProjectToIDB()`) before conflict analysis does not lose
  any in-memory creator edits.  
  Cross-reference: VER-SYNC-010.

- [ ] `VER-SYNC-GATE-027` [P1] — `totalTime` for merge-tracking projects is
  summed (not max) across sessions, consistent with VER-SYNC-008 fix in
  commit `0abff0b`.

### Event dispatch order

- [ ] `VER-SYNC-GATE-028` [P0] — `cs:stashChanged` is dispatched AFTER
  `executeImport()` resolves and AFTER snapshot write; `manager-app.js`
  `handleStashChanged` fires with fully merged stash state (not pre-merge).  
  Cross-reference: VER-SYNC-005.

- [ ] `VER-SYNC-GATE-029` [P0] — `cs:backupRestored` is dispatched AFTER
  `executeImport()` resolves; `home-app.js` and `header.js` receive it and
  refresh their project lists with the merged data.  
  Cross-reference: VER-SYNC-005.

- [ ] `VER-SYNC-GATE-030` [P1] — Neither `cs:stashChanged` nor
  `cs:backupRestored` is dispatched if the user closes the gate before
  clicking Continue (i.e. the gate is dismissed via the "Nothing new to
  review" Close button or auto-dismiss); only actual merge completions emit
  these events.

### Manual trigger

- [ ] `VER-SYNC-GATE-031` [P1] — Manual trigger from EL-SCR-035-11e when a
  pending plan exists: gate opens with correct plan data, behaves identically
  to automatic trigger.  
  Cross-reference: VER-EL-SCR-035-11e-01.

- [ ] `VER-SYNC-GATE-032` [P1] — Manual trigger when no plan is pending:
  EL-SCR-062-04 state renders, "Close" button dismisses without dispatching
  events.

- [ ] `VER-SYNC-GATE-033` [P2] — Sync Review Gate is not rendered when
  `typeof SyncEngine === 'undefined'`; sync menu item that triggers it is
  also suppressed.  
  Cross-reference: VER-EL-SCR-035-07-01, VER-SYNC-020.

### Edge cases

- [ ] `VER-SYNC-GATE-034` [P1] — EC-1 (no snapshot): gate opens without
  error; zero stash/metadata/pref conflict cards; "No sync history found"
  informational line present in summary section.

- [ ] `VER-SYNC-GATE-035` [P2] — EC-2 (wrong version file): `validate()`
  error is surfaced as a toast before the gate opens; gate is never shown
  for an invalid file.  
  Cross-reference: VER-SYNC-011, VER-SYNC-019.

- [ ] `VER-SYNC-GATE-036` [P1] — EC-3 (local edits after last snapshot):
  `__flushProjectToIDB()` + fresh in-memory snapshot attempt is called before
  conflict analysis; edits made in the current session are not classified as
  remote changes.

- [ ] `VER-SYNC-GATE-037` [P1] — EC-4 (all non-conflicting): conflict section
  (EL-SCR-062-10) is not rendered; Continue button is immediately enabled.

- [ ] `VER-SYNC-GATE-038` [P1] — EC-5 (zero changes): EL-SCR-062-03 renders;
  auto-dismiss fires after 2 seconds; no events dispatched (no merge to apply).

- [ ] `VER-SYNC-GATE-039` [P2] — EC-6 (tab closed mid-resolution): on
  re-opening the app, if the `.csync` file is still present in the watched
  folder, `prepareImport()` runs again and produces a fresh gate with zero
  pre-filled resolutions. No partial-resolution state bleeds from previous
  session.

- [ ] `VER-SYNC-GATE-040` [P1] — EC-7 (tombstoned project in sync file):
  tombstoned project ID is never surfaced as a conflict card; confirmed by
  checking `getLocalTombstones()` contains the ID and verifying the plan's
  `classified` array omits it.  
  Cross-reference: VER-SYNC-009.

- [ ] `VER-SYNC-GATE-041` [P1] — Large sync file (> 50 MB): informational
  toast "Large file (N MB) — import may take a moment" fires before gate
  opens; gate does not open until `prepareImport()` resolves.  
  Cross-reference: VER-SYNC-012 (commit `a8d8444`).

- [ ] `VER-SYNC-GATE-042` [P2] — `QuotaExceededError` during `executeImport`
  inside the gate surfaces the human-readable "Not enough browser storage"
  message as a toast; gate remains open (not auto-dismissed) so the user can
  see the error.  
  Cross-reference: VER-SYNC-019 (commit `a8d8444`).

---

## Cross-reference summary

| Existing VER-ID | Relationship to gate spec |
|---|---|
| `VER-AUTH-009` | Gate uses the same `classifyProjects()` function; classification correctness confirmed by existing suite. Gate adds field-level analysis on top. |
| `VER-AUTH-013` | Fingerprint accuracy (extended by VER-SYNC-002 to include bsLines). Gate's stitch conflict detection uses current `done` arrays, not fingerprints — orthogonal. |
| `VER-CONF-004` | StashBridge availability guard — gate reads stash snapshot via IDB directly (not StashBridge); guard remains relevant for other stash-write paths triggered by gate completion. |
| `VER-EL-SCR-035-07-01` | Sync indicator — continues to reflect sync state; gate completion should update the sync indicator to "up to date". |
| `VER-EL-SCR-035-11e-01` | Sync menu visibility guard — gate trigger button subject to same `typeof SyncEngine` check. Manual trigger spec in §5.5. |
| `VER-FB-010` | Progress state during sync — PASS as of `aaefd64`. Gate extends this by showing "Applying…" button state + "Syncing…" toast during `executeImport()`. |
