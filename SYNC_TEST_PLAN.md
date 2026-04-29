# SYNC IMPROVEMENTS — TEST PLAN

> Manual QA companion to the sync engine fixes shipped alongside this document.
> Run through every section before sign-off. Automated unit tests live in
> [tests/sync-engine.test.js](tests/sync-engine.test.js) — they should all pass
> with `npm test -- --runInBand` before manual testing begins.

---

## What changed in the engine

1. **Fingerprint-first classifier** (root cause fix). When a sync file arrives
   from another device, the classifier no longer looks up local matches by
   project id alone. If the remote id is unknown locally it falls back to
   matching by chart fingerprint (computed from dimensions + cell ids,
   ignoring tracking state). A fingerprint match is treated as
   `merge-tracking` instead of `new-remote`.
2. **Canonical-id reconciliation.** When the classifier matches a remote and
   local with differing ids, it picks a canonical id (lexicographically
   smallest — deterministic on every device, no clocks needed) and rewrites
   both records to that single id during `executeImport`. The orphaned local
   record is deleted.
3. **`plan.idRewrites` array** is exposed on the import plan so the Sync
   Summary modal can show a "Reconciled duplicates" section, and so the
   user understands what just happened.
4. **Per-feature sync toggles** wired through `UserPrefs`:
   `sync.includeStash`, `sync.includePrefs`, `sync.includePalettes`,
   `sync.conflictBehaviour`, `sync.pollIntervalSec`,
   `sync.defaultConflictAction`, `sync.firstTimeWizardComplete`.
5. **Preferences → Data panel rebuilt** to expose all sync controls (folder,
   device name, what to sync, behaviour, status). The previous "hidden until
   implemented" comment is gone.

Files touched:

- [sync-engine.js](sync-engine.js) — classifier, executeImport, exportSync feature toggles.
- [tests/sync-engine.test.js](tests/sync-engine.test.js) — 8 new test cases covering reconciliation + idempotency + plan accounting.
- [user-prefs.js](user-prefs.js) — 7 new `sync.*` DEFAULTS.
- [preferences-modal.js](preferences-modal.js) — DataPanel rewrite.
- [modals.js](modals.js) — SyncSummaryModal "Reconciled duplicates" section.

---

## Section A — Automated regression (must pass)

```powershell
npm test -- --runInBand
npm run lint:terminology
```

Expected: 1257 passing, 0 failures, terminology lint passes.

The new sync-engine tests to look out for:

- `classifyProjects: fingerprint reconciliation` (5 tests).
- `executeImport: canonical-id reconciliation` (2 tests).
- `prepareImport: idRewrites + localOnly accounting` (1 test).

---

## Section B — Manual smoke (single browser)

Use Chrome/Edge — folder watching needs the File System Access API. Open
`/home` from a local server (`node serve.js`).

1. **Preferences open.** Click the gear icon → "Sync, backup & data".
   - Confirm the new sections render in this order: Sync folder · What to
     sync · Behaviour · Library · Backup · Start over.
   - No emoji anywhere; use of `Icons.*` only.
2. **Folder section.**
   - Click "Choose folder…", pick any local folder.
   - "Connected: <folder name>" appears, "This device's name" input is
     editable, "Status" shows "Last exported / imported …".
   - Click "Disconnect" → confirm dialog → returns to "Not connected".
3. **What to sync.**
   - Toggle "Thread stash" off, then export to folder. Confirm the .csync
     file in the folder has no `stash` key (open in a JSON viewer; it's
     deflated, run `pako.inflate` mentally or use the engine's
     `readSyncFile`).
   - Toggle "Custom palettes" off → export → no `prefs.crossstitch_custom_palettes`.
   - Toggle "Preferences" on → export → all `cs_pref_*` localStorage keys
     present in `prefs`.
4. **Behaviour controls.**
   - All four `Segmented` controls render and persist after page reload
     (they use `UserPrefs.set` which persists to localStorage).
   - "Auto-sync stitch progress" switch is disabled until a folder is
     connected.

---

## Section C — The duplication bug (the critical one)

This is the scenario the user reported. Reproduce on **two profiles** —
either two browser profiles, or one Chrome window + one Edge window with the
same OneDrive/Dropbox/iCloud folder mounted.

### C-1. Reproduce the OLD bug (must not happen)

> Skip the engine and feed the modal directly so you can see the wireup is
> right. The automated tests already verify the engine path.

Setup:

1. On Device A (browser profile #1) — open `/home`. Click "Create new" → import
   any pattern (a small `.oxs` works best, e.g. `TestUploads/` samples).
2. Save the project. Note its name.
3. Connect Device A to a sync folder (Preferences → Sync, backup & data →
   "Choose folder…"). Export to folder (the `Auto-sync` toggle does this on
   every save).
4. **Wipe Device B's IndexedDB** (DevTools → Application → IndexedDB → delete
   `CrossStitchDB`). Refresh.
5. On Device B — import the **same .oxs file** directly (do NOT use the sync
   file). Save the project. The two devices now have the same chart with
   different ids (the bug condition).
6. Connect Device B to the same sync folder. Use the header sync indicator
   (or Preferences "Choose folder…").
7. Auto-sync triggers a check for updates. The Sync Summary modal opens.

Expected (with the fix):

- The chart appears under **"Reconciled duplicates"**, NOT under "New projects".
- After clicking "Apply Sync":
  - Device B's project list contains exactly **one** copy of the chart.
  - The local id has been rewritten to the canonical id (visible if you
    inspect IndexedDB).
  - On Device A, the next auto-import (after Device B re-exports) likewise
    converges on the canonical id with no duplicate.

If you see two cards on Device B after applying, the fix has regressed.

### C-2. Idempotency

After the merge in C-1, click "Check for updates" again on Device B.
Expected: the Sync Summary should report nothing to sync (or only "identical")
— applying twice must never produce duplicates.

### C-3. Tracking progress preservation

Before C-1 step 7, stitch a different cell on each device:

- Device A: mark cell (0,0) as done.
- Device B: mark cell (1,0) as done.

After the reconciliation in C-1, both cells should be marked done on the
canonical record. (The engine does a union merge — `mergeDoneArrays` — and
the new code path uses it identically.)

---

## Section D — Conflict behaviour

1. Set `sync.conflictBehaviour` to "Always ask".
2. On both devices, edit the **same cell** of an already-synced chart in
   contradictory ways (Device A turns it red, Device B turns it blue).
3. After sync, the Sync Summary modal opens with that chart in the
   "Conflicts" section.
4. The default selection in each `SyncConflictCard` should match the value
   of `sync.defaultConflictAction` (try "Keep mine" / "Keep theirs" / no
   default).
5. "Keep both" creates a copy with " (synced)" suffix; "Keep mine" / "Keep
   theirs" overwrites.

---

## Section E — Reconciled-duplicates UI

With the modal open from any sync that has at least one fingerprint match
(use the C-1 setup):

- The "Reconciled duplicates" section is visible above "Local only".
- Each row shows the chart name and either "matched by chart contents" or
  `matches local "<other name>"` if the names differ.
- The section header is text-only (no emoji); the cloud-check SVG icon
  appears beside the header text.

---

## Section F — Browser-compat / fallback

1. Open `/home` in Firefox (no File System Access API).
2. Preferences → Sync, backup & data: Folder section shows the explanatory
   "Folder watching needs a Chromium-based browser …" message; the "Choose
   folder…" button is disabled.
3. Manual export still works via the header File menu (`SyncEngine.downloadSync`).

---

## Section G — Sign-off checklist

- [ ] All automated tests pass (Section A).
- [ ] Preferences DataPanel renders correctly in light + dark themes (open
      `apply-prefs.js` `data-theme` attribute via DevTools to flip).
- [ ] Section C-1 produces ONE card after sync, not two.
- [ ] Section C-2 second-apply produces no changes.
- [ ] Section C-3 union-merge preserves both devices' progress.
- [ ] Section D conflict ask + default action both work.
- [ ] Section E "Reconciled duplicates" section appears with correct copy.
- [ ] Section F fallback message + disabled button correct on Firefox.
- [ ] No emoji introduced anywhere; `Icons.*` everywhere.
- [ ] British spelling everywhere user-facing (colour, behaviour, organiser).
- [ ] PDF export untouched (regression-check by opening any chart and
      exporting — bytes must match a pre-change snapshot via the existing
      [tests/pdfExportSmoke.test.js](tests/pdfExportSmoke.test.js)).

---

## Known follow-ups (not in this PR)

The following items from the original plan are intentionally deferred to keep
this PR focused on the duplication bug and the supporting Preferences UI:

1. **First-time setup wizard** (modal triggered when sync folder is
   configured AND `sync.firstTimeWizardComplete` is false AND both local
   and remote projects exist). The pref already exists; the modal does not.
2. **Header sync pill 4-state rebuild** (resting / syncing / updates / error).
   The current single-state pill in [header.js](header.js) still works.
3. **Per-project sync badge dot** on `/home` project cards. Engine already
   stores `syncMeta.lastSyncedAt` per project so the dot can read it; UI
   still to do in [home-app.js](home-app.js).
4. **`.csync` v2 format** with explicit `_replaces` map for cross-device id
   redirect propagation. The current canonical-id reconciliation works
   without it because every device runs the same comparison; v2 only matters
   if a NEW device joins after reconciliation has happened (it can still
   re-derive the same canonical id from fingerprints, so this is theoretical
   robustness rather than a user-visible bug).

These can be picked up as separate PRs without re-touching the engine.
