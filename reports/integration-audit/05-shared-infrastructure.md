# 05 — Shared infrastructure

> Phase 2, area 5. Covers cross-page utilities: storage (CrossStitchDB +
> stitch_manager_db + legacy `auto_save`), the stash bridge, backup/
> restore, the service worker, shortcuts/command palette/help drawer,
> modals, toasts, user preferences, onboarding wizard, wake lock, and
> palette swap. Out of scope: PDF export, colour-maths, sync internals
> (already audited under `reports/sync/`), UX density.

---

## 1. Surface scope

| File | Role |
|---|---|
| [project-storage.js](../../project-storage.js) | `ProjectStorage` — CrossStitchDB v3 (`projects`, `project_meta`, `stats_summaries`); v4 includes `sync_snapshots` |
| [helpers.js](../../helpers.js) `saveProjectToDB` / `loadProjectFromDB` | Legacy single-key `auto_save` write/read |
| [stash-bridge.js](../../stash-bridge.js) | `StashBridge` — stitch_manager_db v1; pattern library sync; `BroadcastChannel("cs-stash-changed")` |
| [backup-restore.js](../../backup-restore.js) | Full-database export/import |
| [sw.js](../../sw.js) + [sw-register.js](../../sw-register.js) | Service worker registration, caching, controllerchange handling |
| [shortcuts.js](../../shortcuts.js), [command-palette.js](../../command-palette.js), [help-drawer.js](../../help-drawer.js) | Keyboard dispatch, palette UI |
| [modals.js](../../modals.js), [toast.js](../../toast.js), [header.js](../../header.js) | Shared chrome |
| [user-prefs.js](../../user-prefs.js), [apply-prefs.js](../../apply-prefs.js), [preferences-modal.js](../../preferences-modal.js) | User preference storage and application |
| [onboarding-wizard.js](../../onboarding-wizard.js) | First-visit overlay per page |
| [wake-lock.js](../../wake-lock.js) | Screen wake lock |
| [palette-swap.js](../../palette-swap.js) | Preset palette swap |

---

## 2. Wiring correctness

### 2.1 Two-database co-existence

The app has three storage layers:

1. **CrossStitchDB v3/v4** via `ProjectStorage` — multi-project store keyed by `proj_*` ids; the source of truth.
2. **CrossStitchDB legacy `auto_save` key** via `helpers.js` `saveProjectToDB` — single-project mirror in the same `projects` store, key `"auto_save"`.
3. **stitch_manager_db v1** via `StashBridge` — thread inventory and pattern library mirror.

Verified `ProjectStorage` documents the legacy key in [project-storage.js:4](../../project-storage.js#L4) and explicitly skips it in syncing ([line 346](../../project-storage.js#L346)). `manager-app.js:360` falls back to `loadProjectFromDB()` if `ProjectStorage.get` returns null.

The Creator and Tracker both write to **both** layers in parallel:
- Creator save: `ProjectStorage.save(p)` then `saveProjectToDB(p)` — sometimes awaited sequentially ([creator/bundle.js:8183](../../creator/bundle.js#L8183) `ProjectStorage.save(last).then(...saveProjectToDB(last))`), sometimes fire-and-forget ([creator/bundle.js:8261](../../creator/bundle.js#L8261), [tracker-app.js:3553](../../tracker-app.js#L3553)).
- Tracker save: same pattern; both happen in parallel during `beforeunload` ([tracker-app.js:3635-3641](../../tracker-app.js#L3635-L3641)).

**Inconsistency**: write coordination varies between call sites. See S-1.

### 2.2 StashBridge pattern-library sync

`ProjectStorage.save` triggers `StashBridge.syncProjectToLibrary` in the `tx.oncomplete` callback ([project-storage.js:~360](../../project-storage.js#L356)) as fire-and-forget. The stash's `BroadcastChannel("cs-stash-changed")` notifies other tabs of stash mutations. Pattern-library subscribers receive updates. **Verified channel exists** ([stash-bridge.js](../../stash-bridge.js)).

### 2.3 Service worker

[sw-register.js](../../sw-register.js) registers `./sw.js` with `updateViaCache: 'none'`, polls `reg.update()` every 10 min, and listens for `controllerchange` to reload the page after the new SW takes over. Three intentional skip conditions before reload:
- `sessionStorage.cs_pending_image_dataurl` is set (mid handoff)
- `window.__pendingCreatorAction` is set
- `window.__creatorImageHandoffActive` is set (intentionally never cleared — see comment at [sw-register.js:33-37](../../sw-register.js#L33-L37))

The "never cleared" decision is **documented design** to defend against a first-visit race, not a leak. Subagent flagged this as a bug; verified it is intentional.

### 2.4 Toast cap

`toast.js show()` ([line 105-107](../../toast.js#L105)) caps with a synchronous `while` loop that splices removed entries from the in-memory `toasts` array immediately via `removeToast(..., false)`. The fade animation runs asynchronously but the array length is decremented synchronously, so the cap converges. **No bug** despite subagent suggestion to the contrary.

---

## 3. Bugs found

### S-1 — `ProjectStorage.save` and legacy `saveProjectToDB` are not coordinated; silent divergence possible
**Files**: [project-storage.js:309-375](../../project-storage.js#L309-L375), [helpers.js:410-425](../../helpers.js#L410-L425), call sites at [tracker-app.js:3553](../../tracker-app.js#L3553), [creator/bundle.js:8261](../../creator/bundle.js#L8261), [creator/bundle.js:8201](../../creator/bundle.js#L8201)
**Severity**: medium
**Classification**: [needs-approval]

The two writes are paired at every save site, but coordination varies:

| Call site | Coordination |
|---|---|
| `creator/bundle.js:8183` | `ProjectStorage.save(p).then(...saveProjectToDB(p))` — sequential |
| `creator/bundle.js:8085`, `:8261` | Started in parallel via two Promise references |
| `creator/bundle.js:8201` | `try { saveProjectToDB(p); } catch (_) {}` — fire-and-forget, no await |
| `tracker-app.js:3553` (autosave) | Started in parallel |
| `tracker-app.js:3635-3641` (beforeunload) | Both fire-and-forget |
| `tracker-app.js:2933-2934` (`handleEditInCreator`) | Both fire-and-forget |

If one write succeeds and the other fails (quota, transient IDB error, tab close), the two stores diverge:
- ProjectStorage succeeds, auto_save fails → `manager-app.js:360`'s fallback path reads stale data.
- auto_save succeeds, ProjectStorage fails → ProjectStorage list is missing the project.

No error surfaces to the user beyond a `console.error`.

**Question for user**: choose one:
1. **Drop the legacy `auto_save` mirror entirely.** Pre-condition: confirm no remaining code path still relies on it as the *only* source (manager-app.js:360 uses it as a fallback, but if ProjectStorage is authoritative the fallback is dead code anyway).
2. **Wrap both into one helper** `saveProjectDualWrite(p)` that awaits both with `Promise.allSettled`, logs partial failures, and surfaces a toast on full failure.
3. **Keep current behaviour** and accept silent divergence in edge cases.

Out of scope for auto-fix without a decision. The cleanest path is (1) — every existing caller already calls both, so removing the legacy mirror is mechanical.

---

### S-2 — `backup-restore.restore()` does not validate cross-field consistency before overwriting stores
**File**: [backup-restore.js:236-297](../../backup-restore.js#L236-L297)
**Severity**: medium
**Classification**: [auto-fix]

`validate()` checks `_format === "cross-stitch-backup"` and `_version === 1` only. It does not check:
- `pattern.length === sW × sH`
- `done.length === pattern.length` (when `done` is present)
- `halfStitches` / `partialStitches` indices in `[0, pattern.length)`
- `parkMarkers[*].x` in `[0, sW)` and `.y` in `[0, sH)`

If the user imports a corrupted backup (manual edit, partial download, malicious file), `restore()` clears every store and re-writes the bad data. Subsequent loads then trigger defensive code paths that silently reset progress.

**Repro**: Hand-craft a backup with `pattern.length = 100` and `done.length = 50`. Restore. Open the project. `processLoadedProject` defensively rebuilds `done` from scratch — restored progress is silently lost.

**Fix**: Extend `validate()` to walk each project in `backup.databases.CrossStitchDB.projects` and verify the invariants. On failure, return `{ valid: false, error: "Project X has inconsistent pattern/done lengths" }` and refuse the restore (with a "Continue anyway?" escape hatch).

**Regression test**: Build a backup blob with `done.length !== pattern.length`, call `BackupRestore.validate(blob)`, assert `valid: false`.

---

### S-3 — `WelcomeWizard.shouldShow()` returns `false` when localStorage throws, hiding the wizard from first-visit users with disabled storage
**File**: [onboarding-wizard.js:81-86](../../onboarding-wizard.js#L81-L86)
**Severity**: low
**Classification**: [auto-fix]

```js
function shouldShow(page) {
  if (!STEPS[page]) return false;
  try { return !localStorage.getItem(flagKey(page)); }
  catch (_) { return false; }
}
```

If `localStorage` is unavailable (private browsing, security policy), the catch swallows and returns `false`, suppressing the wizard. A first-visit user who most needs the onboarding never sees it.

**Fix**: `catch (_) { return true; }` — fail-open. The wizard will re-show on every load (because we can't remember the dismissal), but that's better than hiding it forever. Optionally also suppress the persist-dismissal `setItem` attempt with a no-op so the next page load doesn't repeat the wizard if the user dismissed it in this session — track in an in-memory ref.

**Regression test**: Mock `localStorage.getItem` to throw, call `shouldShow("home")`, assert `true`.

---

### S-4 — `StashBridge.syncProjectToLibrary` failures after `ProjectStorage.save` are silently swallowed
**File**: [project-storage.js:~356-370](../../project-storage.js#L356-L370)
**Severity**: low
**Classification**: [auto-fix]

The stash mirror sync is wrapped `.catch(() => {})` — completely silent. If `stitch_manager_db` is unavailable (rare but possible: storage quota, db corruption), the user's pattern library in the Manager page drifts out of sync with their actual project list, and "Detect conflicts" produces false positives later.

**Fix**: Log `console.warn("[ProjectStorage] Stash mirror sync failed:", err)` at minimum. Optionally, set a flag in `localStorage.cs_stash_sync_degraded = "1"` so the Manager can surface a one-time toast on next visit ("Pattern library may be out of date; reload to retry").

**Regression test**: Stub `StashBridge.syncProjectToLibrary` to reject, save a project via `ProjectStorage.save`, assert a `console.warn` is emitted.

---

### S-5 — Shortcuts registry logs conflicts at register time but still adds duplicate entries
**File**: [shortcuts.js:~154-170](../../shortcuts.js#L154-L170)
**Severity**: low
**Classification**: [question]

`detectConflicts()` runs at registration and emits `console.error`, but `_entries.push(entry)` runs unconditionally afterward. At dispatch time `_dispatch` returns after the first match wins, so the duplicate is silently ignored.

For developers this is friendly (no thrown error at load), but it makes shortcut bugs hard to track in production where console output is invisible.

**Question**: Choose a policy:
1. **Throw at register-time conflict** during development (controlled by `?dev=1` query or `localStorage.cs_strict_shortcuts`) and warn-only in production.
2. **Surface as a developer-only toast** when `?dev=1`.
3. **Accept current silent override** — the first-write-wins behaviour is at least stable.

---

### S-6 — `blockW`/`blockH`/`startCorner` global localStorage keys leak between projects
**Files**: [tracker-app.js:907-914](../../tracker-app.js#L907-L914) — see [04-track.md T-2](04-track.md#t-2--blockwblockhstartcorner-localstorage-overrides-per-project-values-on-load)
**Severity**: cross-ref only

Documented in 04-track.md T-2 — the localStorage keys are written by the tracker on every change, regardless of which project is active, then read back as the initial state on next mount. Same root cause: per-project value should win over the global fallback during initial render.

---

### S-7 — User-preferences schema is unversioned and unmigrateable
**File**: [user-prefs.js](../../user-prefs.js)
**Severity**: info
**Classification**: [question]

`UserPrefs.get(key, default)` falls back to the supplied default when the key is missing; there is no schema version or migration path. Renaming a key, changing a value type, or removing a deprecated option leaves orphans in `localStorage` forever, and new defaults silently shadow old user choices.

Currently low-impact because prefs are mostly booleans, but as the surface grows this will accumulate technical debt.

**Question**: Add a `cs_prefs_schema_version` key and a `migrate(prev, next)` step on first read? Or accept current behaviour and live with the constraint?

---

## 4. Verified non-issues (subagent claims I checked and discarded)

- **`__creatorImageHandoffActive` "leak"**: intentionally never cleared, per [sw-register.js:33-37](../../sw-register.js#L33-L37) docstring. Not a bug.
- **Toast cap bypass on rapid `show()`**: the cap loop is fully synchronous; `removeToast(_, false)` splices the entry out of the in-memory array immediately even though the fade-out animation runs later. Cap is correct. Not a bug.
- **Palette-swap "reset progress" misleading warning**: searched [palette-swap.js](../../palette-swap.js) for any "reset progress" string — not present. Subagent claim could not be reproduced. Dropped.
- **SW network-first stale-JS risk**: the `controllerchange` reload handler is the standard mitigation and already implemented; specific guard cases (`__pendingCreatorAction`, image handoff) handle the known failure modes. Documented existing behaviour, not a new bug.

---

## 5. TODO / open questions

`[auto-fix]` queue for Phase 4:
- **S-2** — extend backup `validate()` with cross-field consistency checks.
- **S-3** — flip onboarding-wizard `catch` to fail-open (`return true`).
- **S-4** — log stash-sync failures and optionally set a degraded-flag.

`[needs-approval]` / `[question]` for user batch:
- **S-1** — pick the dual-write coordination strategy (drop legacy / wrap helper / accept).
- **S-5** — shortcuts conflict policy (throw in dev / dev-toast / silent).
- **S-7** — user-prefs schema versioning.

Cross-references:
- [04-track.md T-2](04-track.md#t-2--blockwblockhstartcorner-localstorage-overrides-per-project-values-on-load) — block/corner localStorage leak between projects (same shared-state class as S-1).
- [00-system-map.md §4](00-system-map.md#4-shared-state) — full shared-state inventory.
