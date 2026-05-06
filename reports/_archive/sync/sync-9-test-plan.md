# Sync — manual test plan

This is the verification checklist for the audit, the proposed fix
strategy, and (once it lands) the Phase 5 implementation. Most
scenarios use **two browser profiles + a single shared local folder**
so they can be run on one machine without needing real cloud accounts.

> Cloud providers behave differently. Re-run the **Cross-provider matrix**
> (§7) on at least Dropbox + Google Drive before declaring a release
> "sync-ready". Other providers should be smoke-tested.

## 0. Test environment setup

### 0.1 Create the simulated cloud folder

1. `mkdir C:\sync-sim\stitch` (or `~/sync-sim/stitch` on macOS).
2. Open two **separate** browser profiles — Chrome → New profile.
   Name them `DeviceA` and `DeviceB`. Profiles isolate IndexedDB,
   so they behave like two physical devices.
3. Open the dev build (`node serve.js`) at `http://localhost:8000`
   in both profiles.
4. In each profile, open Preferences → Data → set the device name
   ("Laptop A" / "Laptop B"). Pick the same `C:\sync-sim\stitch`
   folder when prompted in each.

### 0.2 Snapshot helpers

Keep these terminals open for every test:

```pwsh
# watch the sync folder
Get-ChildItem C:\sync-sim\stitch\ -File | Format-Table Name, Length, LastWriteTime
```

```pwsh
# wipe sync folder (between scenarios)
Remove-Item C:\sync-sim\stitch\* -Force
```

For the in-browser DB:

```js
// run in DevTools console of each profile
indexedDB.databases().then(console.log)
// or to nuke a profile back to zero:
indexedDB.deleteDatabase('CrossStitchDB');
indexedDB.deleteDatabase('stitch_manager_db');
indexedDB.deleteDatabase('cross_stitch_sync_meta');
localStorage.clear();
```

---

## 1. Reproduce the duplication bug (current behaviour — should FAIL after fix)

This is the regression you reported. After Phase 5 lands, scenarios
1.1–1.3 must all PASS.

### 1.1 Two devices with the same pre-existing pattern

| Step | Action | Expected after fix |
|------|--------|--------------------|
| 1 | DeviceA, **before** connecting sync: import `Cottage Garden Sampler.oxs`. | Project visible in /home. |
| 2 | DeviceB, **before** connecting sync: import the same `.oxs` file. | Project visible in /home, different internal id. |
| 3 | DeviceA: connect sync to `C:\sync-sim\stitch`. | Folder gets one `.csync` file from A. |
| 4 | DeviceB: connect sync to the same folder. | First-time wizard fires. Step 2 shows the two patterns matched as a "Strong match" pair (same chart fingerprint, same name). |
| 5 | Confirm in step 3. | DeviceB ends up with **one** Cottage Garden Sampler, not two. Stitch progress is the union of A and B. |
| 6 | DeviceA: pull updates. | Same — still one project. Both devices share the same canonical `id`. |

**Currently fails at step 5** (you get two copies). Validates the
root cause described in [sync-2-duplication-bug.md](sync-2-duplication-bug.md).

### 1.2 Pre-existing identical patterns with progress on both sides

Same as 1.1 but stitch ~50 cells on A and ~30 (different cells) on B
before connecting. After merge:

- Both devices show one project, ~80 stitched cells (the union).
- No stitched cell is reverted to "not done" on either device.
- A `cs:projectsChanged` event fires once on each device.

### 1.3 Three devices

Run 1.1 with a third profile DeviceC that imports the same `.oxs`
**before** connecting. After C connects: still one project across all
three devices. Verify by reading
`C:\sync-sim\stitch\*.csync` count — exactly three files (one per
device), but each file references the same project id.

---

## 2. First-time setup wizard (new behaviour)

### 2.1 Cold start, empty folder

- DeviceA, fresh profile, no patterns, empty sync folder → wizard
  shows the cold-start hero (matches
  [A2-prefs-cold-start-desktop.svg](sync-wireframes/A2-prefs-cold-start-desktop.svg)),
  not the reconciliation wizard.
- After choosing folder: header pill goes "Syncing…" once, then
  resting. One `.csync` file appears named
  `cross-stitch-sync-DeviceA-<id>.csync`.

### 2.2 Cold start, folder already populated by another device

- Folder pre-seeded with DeviceB's `.csync` file. DeviceA has no
  patterns. → wizard step 1 shows "0 local · N from Tablet". Step 2
  shows everything in the "Import as new" column. Step 3 confirms.
- After apply: DeviceA has all of DeviceB's projects.

### 2.3 Cold start with overlap (the painful case)

- Folder pre-seeded with DeviceB. DeviceA has 2 of the same projects
  + 1 unique. → wizard step 2 shows: 2 strong matches, 1 "Keep local
  only", N "Import as new". Step 3 confirm → all three sets present
  with no duplicates.

### 2.4 User aborts the wizard

- During step 2 click Cancel. → No changes to local DB. Folder stays
  set in preferences but a banner says "Sync paused — finish set-up".

### 2.5 Backup is created

- After every successful first-time merge, an automatic backup
  exists in `localStorage.crossstitch_pre_sync_backup_<timestamp>`
  (or wherever the implementation stores it). Restorable from
  Preferences → Backup → Restore.

---

## 3. Steady-state reconciliation (existing SyncSummaryModal flow,
   improved)

### 3.1 Trivial case — only progress changed

- A: stitch 5 cells in Cottage Garden, wait 30s for auto-export, see
  `.csync` updated.
- B: header pill turns to "⬇ 1 update from Laptop A". Click → modal
  opens.
- Modal shows only the Progress merges section (no duplicate
  warning, no conflicts). Apply → done.

### 3.2 Stash update

- A: mark DMC 310 as owned in stash.
- B: receives sync update. Modal shows a Stash section: "+1 thread
  owned" (no project changes). Apply → DMC 310 owned on B.

### 3.3 Possible duplicate detected after first sync

- This validates the new "Possible duplicates" badge
  ([A7-syncsummary-with-duplicates-desktop.svg](sync-wireframes/A7-syncsummary-with-duplicates-desktop.svg)).
- A: import a new `.oxs` (so it gets a fresh A-side id) without
  letting B sync first. B: import the same `.oxs` (different B-side
  id). A syncs. B receives → SyncSummaryModal flags both as
  Possible duplicates. Default action "Merge" → one project.

### 3.4 Real conflict — chart edited on both devices

- Both: open Cottage Garden, change pattern[0] cell to a different
  colour, save. Wait for auto-export.
- B (or whichever syncs second) sees Conflict section. Choose
  "Keep local" / "Keep remote" / "Keep both". Verify result matches
  the choice — including for "Keep both" producing a properly-renamed
  copy with a fresh id.

### 3.5 Tracking-only conflict resolves automatically

- Both devices have the same project. Both stitch different cells of
  it. Sync. → No conflict shown — progress merged via union, no
  modal popup if "Auto-merge safe" preference is on.

---

## 4. Header pill behaviour

Validates [A3-header-pill-states.svg](sync-wireframes/A3-header-pill-states.svg).

| State | How to reach | Expected pill |
|-------|--------------|---------------|
| Resting | Idle, in sync | No pill, or muted "Synced 4 min ago" tooltip on hover only |
| Syncing | Click Save on a project | "Syncing…" pill with pulsing dot, max 3s |
| Updates | Other device exports while you're idle | "⬇ N updates" pill, persists until clicked |
| Error | Revoke folder permission in browser site settings, then save | "⚠ Sync paused" pill, persists, click opens prefs |

### 4.1 Pill is keyboard-accessible

Tab to the pill → Enter opens the relevant modal/preferences.
Screen-reader announces the live region update once per state change,
not every poll.

### 4.2 Pill does not appear before sync is configured

In a fresh profile with no folder, no pill is ever shown.

---

## 5. Preferences panel

Validates [A1-prefs-configured-desktop.svg](sync-wireframes/A1-prefs-configured-desktop.svg)
and [A1-prefs-configured-mobile.svg](sync-wireframes/A1-prefs-configured-mobile.svg).

### 5.1 Toggles persist

For every checkbox/dropdown in the new sync section: change the value,
reload the page, confirm value is preserved (`UserPrefs.get(...)` in
console).

### 5.2 Toggles take effect immediately

- "Stash & shopping" off → make a stash change → no `.csync` write.
- "User preferences" off (default) → change theme → no `.csync` write
  (verify by file mtime).
- "When changes arrive: Auto-merge safe / ask on conflict" → §3.5
  case stays silent; §3.4 case opens modal.

### 5.3 Disconnect

- Click Disconnect → confirmation modal → after confirm: pill goes
  away, folder permission cleared from `cross_stitch_sync_meta`,
  no further auto-export. Local data untouched.

### 5.4 Mobile layout

Open Chrome DevTools device toolbar at 380×720. Verify the panel
matches the mobile wireframe — single column, tap targets ≥ 44 px,
no horizontal scroll.

### 5.5 Cold-start prefs panel

Fresh profile → Preferences → Data → matches
[A2-prefs-cold-start-desktop.svg](sync-wireframes/A2-prefs-cold-start-desktop.svg).
Backup section still works.

---

## 6. Per-project badge

Validates [A8-per-project-badge-variants.svg](sync-wireframes/A8-per-project-badge-variants.svg).

| Variant | Setup | Expected |
|---------|-------|----------|
| Green dot | Project that has been synced and is up-to-date | Tooltip "Synced N min ago" |
| Grey dot | Project user kept local-only (never synced) | Tooltip "Local only — not synced" |
| Amber dot + badge | Other device has a newer version | Tooltip + visible "Review (N changes)" CTA |

Keyboard: Tab to the project card, the dot is included in the
accessible description (not focusable on its own — info should be in
the card's `aria-label`).

---

## 7. Cross-provider matrix

Repeat the smoke list below in each provider. The simulated folder
suffices for most CI runs; real providers must be checked at least
once per release.

Smoke list (≈ 5 minutes per provider):

1. Connect on Device A, save a project.
2. Wait for the provider to sync — open file explorer to confirm the
   `.csync` exists on the file-system mirror.
3. Connect on Device B (same provider account), confirm wizard sees
   it.
4. Save a stitch update on B, wait, observe A picks it up.
5. Disconnect on B, then reconnect — should not duplicate.

| Provider | Notes / known quirks to verify |
|----------|--------------------------------|
| Dropbox  | Watch for `.dropbox` lockfile in the folder — sync code must ignore non-`.csync` files. |
| Google Drive (File Stream) | Files sometimes land as `.gdoc` placeholders — ensure the worker only looks for `.csync`. |
| OneDrive | Files-on-Demand: a `.csync` may exist as a stub. Reading must trigger hydration without crashing. |
| iCloud Drive | macOS only. Confirm File System Access API permission survives macOS sleep. |
| Local folder (no cloud) | Sanity baseline — same folder, two profiles. |

---

## 8. Edge cases & adversarial input

### 8.1 Corrupt `.csync`

- Manually overwrite a `.csync` with random bytes.
- Other device polls → header pill goes to error state ("⚠ Sync
  paused — file unreadable"). Local data unaffected. Pill click opens
  prefs which has a "Show details" link to a small modal with the
  decoder error.

### 8.2 Future-version `.csync`

- Open `.csync`, change `version: 1` to `version: 99`, re-save.
- Other device: error pill says "This sync file was made by a newer
  version of the app. Please upgrade." Local data unaffected.

### 8.3 Empty folder (provider unmounted)

- Disconnect the network drive while sync is configured. Pill goes
  to error state, not "synced 0 projects". Reconnecting recovers
  without losing data.

### 8.4 Permission revoked by browser

- Chrome: Site settings → Files → Reset. Save a project. → error
  pill, click opens prefs which has a "Re-grant access" button.
  After re-grant, sync resumes; no duplicates produced by the gap.

### 8.5 Two devices write at the same second

- Pre-condition the same project on both. Hit Ctrl+S in each within
  1 second. Both auto-export.
- Whichever syncs second sees a Conflict if charts diverged, or a
  silent merge if only progress diverged. No `.csync` is left
  half-written (test: kill the tab during the write — the file
  should be either the previous good version or the new good
  version, never truncated).

### 8.6 Very large project (100k cells)

- Generate a 320×320 pattern with 60 colours. Save → `.csync` file
  size, export time, decompress time. Document numbers; warn user if
  > 50 MB.

### 8.7 Renamed device

- Change device name in prefs from "Laptop A" to "MacBook Pro". Next
  sync writes a new `.csync` with the new device name. **Old file is
  not orphaned** — same `deviceId` reused. Other devices see only
  the renamed device, not two.

### 8.8 Reset device id

- Preferences → Advanced → Reset device id. Confirms with a warning.
  Next sync creates a new `.csync` and stops writing to the old one
  (which becomes orphan and is cleaned up after N days per design).

---

## 9. Regression — Pattern Keeper PDF compatibility

Per [.github/copilot-instructions.md](.github/copilot-instructions.md):
"do not modify pdf-export-worker.js or creator/pdfChartLayout.js
without an explicit PK-compat regression check."

Even though the sync work doesn't touch the PDF path, run this once
per release branch:

1. Open a known-good project, Export → PDF (Pattern Keeper compatible).
2. Open the PDF in Pattern Keeper. Verify symbols render and the
   legend is recognised.
3. Compare bytes against the previous release's golden PDF for the
   same project (`scripts/golden-pdf-compare.js` or similar). They
   should be identical except for the embedded date.

---

## 10. Automated tests to add (Phase 5 task)

`tests/sync-engine.test.js` already covers fingerprint/classify/merge
units. Add:

- `tests/sync-engine.classifyByFingerprint.test.js` — verifies the
  new fingerprint-first classifier returns "merge-tracking" for two
  projects with different ids but the same chart.
- `tests/sync-engine.canonicalId.test.js` — verifies that after a
  merge the canonical id is lexicographically smallest of the
  candidates (or whatever rule we pick), and that subsequent saves
  reuse it.
- `tests/sync-engine.format-v2.test.js` — round-trip a v2 sync file
  via `exportSync` then `prepareImport`; verify deflate inflates to
  identical bytes.
- `tests/sync-engine.migration.test.js` — feed a v1 `.csync` into the
  v2 reader, expect successful upgrade with no data loss.
- `tests/sync-engine.idempotent.test.js` — apply the same import
  twice, second apply must produce an empty diff.

Run: `npm test -- --runInBand`.

---

## 11. Sign-off checklist

Before merging the sync rework PR:

- [ ] §1 (duplication) — all three scenarios pass.
- [ ] §2 (wizard) — all five scenarios pass.
- [ ] §3.1, §3.4, §3.5 (steady state, basic + conflict) — pass.
- [ ] §4 — pill states and a11y verified.
- [ ] §5 — every preference toggle persists & takes effect.
- [ ] §7 — Dropbox + Google Drive smoke list completed.
- [ ] §8.1, §8.2, §8.4 (most likely real-world failures) — error
      states explicit, no data loss.
- [ ] §9 — PK-compat PDF regression unchanged.
- [ ] §10 — new Jest tests written and `npm test` green.
- [ ] [reports/sync-1-architecture.md](sync-1-architecture.md) updated
      to reflect the actually-shipped behaviour.
