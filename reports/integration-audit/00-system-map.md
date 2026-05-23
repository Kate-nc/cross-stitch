# 00 — System Map

> Phase 1 of the integration audit. Traces how state flows between the four
> primary surfaces (create, cleanup, edit, track) and inventories shared
> infrastructure. Focus is on **integration seams** — the seams between
> areas. Per-mode UX inventories already exist under [reports/](../) (see
> [edit-mode-ui-audit.md](../edit-mode-ui-audit.md),
> [track-mode-ui-audit.md](../track-mode-ui-audit.md),
> [create-flow-audit.md](../create-flow-audit.md)); this audit deliberately
> does not duplicate them.

---

## 1. The four surfaces

The user-visible "modes" do not all map to the same kind of construct:

| User-visible mode | Implementation | Lives in |
|---|---|---|
| **create** (import → pattern) | `appMode === "create"` in `useCreatorState` | [creator-main.js](../../creator-main.js) + [creator/useCreatorState.js](../../creator/useCreatorState.js) |
| **cleanup** (manual lineart removal post-import) | An **overlay** on top of `appMode === "edit"`, gated by `cleanupOpen` boolean | [creator/useCleanupMode.js](../../creator/useCleanupMode.js) |
| **edit** (refine pattern) | `appMode === "edit"` | [creator-main.js](../../creator-main.js) + creator hooks |
| **track** (stitch progress) | Separate React root in a separate HTML | [stitch.html](../../stitch.html) + [tracker-app.js](../../tracker-app.js) |

Cleanup is **not** a peer of create/edit — it is a sub-mode of edit. This
matters for the audit: cleanup state lives in the same `useCreatorState`
context as edit state, sharing `pat`/`pal`/`cmap`/`editHistory` directly.
Track, by contrast, runs in a different document with its own React tree
and its own state shape.

A separate **auto-cleanup** ("stitch cleanup") also exists as a pipeline
step inside `runGenerationPipeline` — it is configured via the
`stitchCleanup` state object, *not* the same code as the manual
`useCleanupMode` hook. The two share no code and have different invariants.
The naming overlap is a documented foot-gun (see §6).

---

## 2. Pattern data shape — the canonical contract

Every surface reads and writes a flat `pat` array indexed by
`idx = row * sW + col`. Each cell is one of:

```text
solid:   { id: "310",    type: "solid", rgb: [r,g,b], lab?, name?, symbol?, count? }
blend:   { id: "310+550", type: "blend", rgb: [r,g,b], threads: [{id,rgb}, ...] }
skip:    { id: "__skip__" }                         // background, never stitched
empty:   { id: "__empty__", rgb: [255,255,255] }    // scratch-mode placeholder
```

`pal` is the unique-by-id list of solid/blend entries plus zero-count "unused"
entries that the user can still see in the palette UI. `cmap` is `id → entry`.

Persisted format adds: `done` (Uint8Array, length === pat.length), `bsLines`,
`parkMarkers`, `partialStitches` (v10+) / `halfStitches` (v9), `singleStitchEdits`,
plus tracker-only fields (`statsSessions`, `achievedMilestones`, `doneSnapshots`,
`breadcrumbs`, …).

### 2.1 Version stamps

| Source | Version written | File |
|---|---|---|
| Creator save (download .json) | **11** | [useProjectIO.js:60](../../creator/useProjectIO.js#L60) |
| Creator handoff to Tracker (`crossstitch_handoff`) | **11** | [useProjectIO.js:128](../../creator/useProjectIO.js#L128) |
| Tracker auto-save (`buildSnapshot`) | **9** | [tracker-app.js](../../tracker-app.js) |
| Tracker handoff to Creator (`crossstitch_handoff_to_creator`) | **9** | [tracker-app.js:3461](../../tracker-app.js#L3461) |

**Finding INT-1 (high).** The tracker never bumps `version` past 9, even
though the creator stamps 11 (and the live serializer migrates v9 → v10/11
half-stitch shape on load). A round-trip create → track → create keeps a
project labelled v9 after the round-trip, even though it now contains v10/11
fields. This is benign for the load path (everyone reads optionally) but
makes "the latest version stamp" a meaningless metric. See
[06-integration.md](06-integration.md#int-1).

---

## 3. Mode-to-mode data flow

```
                ┌───────────────┐
                │   home.html   │
                └──────┬────────┘
                       │  Image drop / "Create new pattern"
                       │  → sessionStorage[pending_home_image]
                       │  → navigate to create.html?action=home-image-pending
                       ▼
        ┌─────────────────────────────┐
        │  create.html (Creator)      │
        │  appMode = "create"         │
        │  Sources: image / .oxs /    │
        │  .pdf / .json / paste / DnD │
        └──────┬──────────────────────┘
               │  Generate clicked → runGenerationPipeline()
               │  applyResultRef.current(result):
               │    setPat, setPal, setCmap,
               │    setDone(new Uint8Array(len)),
               │    setParkMarkers([]),
               │    setEditHistory([]), setRedoHistory([]),
               │    setAppMode("edit")
               ▼
        ┌─────────────────────────────┐    ┌───────────────────────────────┐
        │  appMode = "edit"           │◄──►│ Cleanup overlay (cleanupOpen) │
        │  Brush / lasso / wand /     │    │ useCleanupMode shares state   │
        │  palette ops / scratch /    │    │ directly with edit:           │
        │  partial stitches.          │    │   setPat, setPal, setCmap,    │
        │  All ops push into          │    │   setEditHistory               │
        │  editHistory (max 50).      │    │ Apply pushes ONE history entry│
        └──────┬──────────────────────┘    └───────────────────────────────┘
               │ handleOpenInTracker():
               │   1. ProjectStorage.save(project) → CrossStitchDB v3
               │   2. saveProjectToDB(project)     → legacy "auto_save" key
               │   3. localStorage["crossstitch_handoff"] = JSON.stringify(project)
               │   4. window.location = "stitch.html?source=creator"
               │      (UNLESS UnifiedApp.onSwitchToTrack: in-page handoff)
               ▼
        ┌─────────────────────────────┐
        │  stitch.html (Tracker)      │
        │  Mount order:                │
        │   1. incomingProjectRef     │  (in-page handoff: ip.project | ip.id)
        │   2. localStorage           │  ("crossstitch_handoff")
        │   3. URL hash p=…           │  (compressed payload)
        │   4. ProjectStorage         │  .getActiveProject()
        └──────┬──────────────────────┘
               │ Mark stitches → autoSave 5 s debounce →
               │   buildSnapshot() → ProjectStorage.save() +
               │   saveProjectToDB() + StashBridge.syncProjectToLibrary()
               │
               │ handleEditInCreator():
               │   onSwitchToDesign callback   ← in-page (UnifiedApp)
               │   OR
               │   localStorage["crossstitch_handoff_to_creator"]
               │   window.location = "create.html?source=tracker"
               ▼
        (back to Creator via processLoadedProject)
```

### 3.1 Inline handoff payload keys (localStorage)

| Key | Direction | Set by | Consumed by | Cleared by consumer? |
|---|---|---|---|---|
| `crossstitch_handoff` | Creator → Tracker | [useProjectIO.js:175](../../creator/useProjectIO.js#L175) | [tracker-app.js:3457](../../tracker-app.js#L3457) | **Yes** (`removeItem` line 3461) |
| `crossstitch_handoff_to_creator` | Tracker → Creator | [tracker-app.js:2964](../../tracker-app.js#L2964) | `useProjectIO.js` initial-load effect | **Yes** (handled in `processLoadedProject` initial-load branch) |
| `pending_home_image` | Home → Creator | [home-app.js](../../home-app.js) | `useCreatorState` initial effect | Yes |
| `cs_pending_image_dataurl` | Home → Creator (image data) | home-app.js | useProjectIO.js consumes via `window.__pendingCreatorFile` | Yes |
| `crossstitch_active_project` | Any | `ProjectStorage.setActiveProject` | Any (`getActiveProject`) | Cleared on `clearActiveProject()` |

### 3.2 In-page handoff path (UnifiedApp on `index.html`)

`index.html` mounts a `UnifiedApp` with three modes (`home`/`design`/`track`)
and bridges Creator ↔ Tracker without a page reload. The bridges are:

* `window.__setCreatorProjectName(name)` — tracker pushes name before edit-handoff
* `window.__setCreatorAppMode(mode)`     — tracker can force creator into "edit"
* `window.__updateCreatorTrackerFields(fields)` — tracker pushes its
  tracker-only fields into creator's `trackerFieldsRef` so the next creator
  auto-save doesn't overwrite them with stale values
* `window.__goHome`, `window.__switchToDesign`, `window.__switchToTrack` —
  mode-switch callbacks

These are set up in `creator-main.js` lines 288-302 and torn down on unmount.
**`index.html` is the only entrypoint that wires these**; `create.html`,
`stitch.html`, and `manager.html` do not, so navigation between those pages
is always a hard reload.

**Finding INT-2 (resolved — verified non-issue).** The same risk that the
in-page bridge mitigates also applies on the hard-reload path
(`crossstitch_handoff_to_creator`): the Creator does not have React state
slots for `statsSessions`, `achievedMilestones`, `doneSnapshots`,
`breadcrumbs`, … so they could be dropped on its next auto-save.
However, [useProjectIO.js:298-324](../../creator/useProjectIO.js#L298-L324)
explicitly *does* mirror every one of those fields into
`state.trackerFieldsRef.current` inside `processLoadedProject`, and
[useProjectIO.js:60](../../creator/useProjectIO.js#L60) /
[:126](../../creator/useProjectIO.js#L126) both spread that ref into the
auto-saved project before applying creator-specific overrides. There is
also a `becameActive` effect at line 624 that refreshes the ref from IDB
whenever the Creator regains focus, so a stale cache cannot survive a
tracker round-trip in the same SPA session. **No bug.** Keeping the
finding in case the field list ever diverges silently (a regression test
in Phase 4 would catch that — see [06-integration.md](06-integration.md)
checklist item).

---

## 4. Shared state inventory

For each piece of shared state: who owns it, who reads it, who writes
it, and whether the write path is observed correctly by every reader.

| State | Owner | Readers | Writers | Notes |
|---|---|---|---|---|
| `pat` | `useCreatorState` (creator) / `pat` in `tracker-app` (track) | every render of every canvas / sidebar / generator / export | Creator: pipeline result, brushes, lasso, wand, cleanup, palette ops. Tracker: `processLoadedProject`, edit-mode tools. | Two independent copies — no shared source of truth. Hard handoff between pages is the only sync. |
| `pal` / `cmap` | same as `pat` | every render | Same as `pat`. Always rebuilt together via `buildPalette()` or `buildPaletteWithScratch()`. | `cmap` can lag `pal` briefly (e.g. unused-colour zeroed entries) — both must be set in the same React commit. |
| `done` | Each surface owns its own. | All renders. | Creator: pipeline reset, partial-stitch helpers. Tracker: drag handlers, `markColourDone`, undo. | `done.length` must equal `pat.length`. **Tracker’s `processLoadedProject` defensively allocates a fresh `Uint8Array` if lengths mismatch** ([useProjectIO.js:235](../../creator/useProjectIO.js#L235)) — this silently throws away progress on a corrupted load. Creator `applyResultRef` always resets to zeros after generation. |
| `editHistory` / `redoHistory` | `useEditHistory` hook (creator only) | Sidebar undo button, keyboard shortcut handler | Every brush stroke / palette op / cleanup apply. | Max 50 entries. **Cleared on generation** and on `setAppMode("create")`. Track mode has its own `trackHistory` — independent. |
| `appMode` | `useCreatorState` | every render in creator | `applyResultRef` (→"edit"), `confirmBackToConvert` (→"create"), `startScratch` (→"edit"), incoming-project effect | Only 2 values: "create" / "edit". Cleanup is overlaid via `cleanupOpen`. |
| `cleanupOpen` + `cleanupPendingMask` etc. | `useCreatorState` | `useCleanupMode`, sidebar, canvas overlay renderer | `enterCleanup`/`exitCleanup`/`applyCleanup` | Lives only in creator; not part of saved project. |
| `selectedColorId` / `activeTool` / `partialStitchTool` | `useCreatorState` | toolstrip, canvas interaction | sidebar, keyboard shortcuts | UI-only — never persisted. |
| `zoom` / `scrollRef` | each surface | canvas renderer | user gestures | **Persisted** in v11 project as `savedZoom` / `savedScroll` (creator only — tracker has no equivalent on its own save). |
| `globalStash` | StashBridge IndexedDB (`stitch_manager_db`) | creator (palette constraint, shopping list), tracker (badges) | Stash Manager UI, tracker auto-sync | Cross-tab change is broadcast via the `cs-stash-changed` BroadcastChannel (see [tests/rtExternalStashChange.test.js](../../tests/rtExternalStashChange.test.js)). |
| Project list | `ProjectStorage` (CrossStitchDB) | Home, Manager, project switcher, auto-save | `ProjectStorage.save` from creator + tracker | Save also fans out to `stats_summaries` and `project_meta`. |
| Active project pointer | `localStorage["crossstitch_active_project"]` | Creator + Tracker initial load | `ProjectStorage.setActiveProject` | Race condition documented as fixed ([tests/setActiveProjectSync.test.js](../../tests/setActiveProjectSync.test.js), [tests/activeProjectPointerRace.test.js](../../tests/activeProjectPointerRace.test.js)). |

---

## 5. Navigation / transitions catalogue

| Transition | Trigger | What's preserved | What's reset | Path |
|---|---|---|---|---|
| home → create (blank) | "Start from scratch" tile | nothing | — | sets `pending_home_image=null`, navigates |
| home → create (image) | drag/drop or upload on home | image dataURL | — | `pending_home_image` + `cs_pending_image_dataurl` |
| home → track | click project card | project id (via `setActiveProject`) | — | navigates stitch.html OR in-page if UnifiedApp |
| home → manager | "Stash" | — | — | hard navigate to manager.html |
| create → edit | generate completes | settings, image | `done`, `editHistory`, `redoHistory`, `parkMarkers`, `threadOwned`, `confettiData`, `bgOpen`, `cleanupOpen`, `isCropping`, `cropRect` ([useCreatorState.js:818-822](../../creator/useCreatorState.js#L818-L822) via `setHasGenerated(false)` reset path + the generate apply ref) | inline (no nav) |
| edit → create (re-convert) | "Back to convert" button + confirm | settings, image | clears `pat`/`pal`/`cmap`/`done` so the panel can re-run | `setAppMode("create")` |
| edit → cleanup | sidebar Cleanup panel open | everything | nothing — additive overlay | `setCleanupOpen(true)` |
| cleanup → edit | exit / apply / cancel | pattern (with applied changes if applied) | `cleanupPendingMask`, `cleanupTargetColorId` | `setCleanupOpen(false)` |
| edit → track | "Open in Stitch Tracker" | full project payload (json) | — | localStorage handoff + page nav, OR `onSwitchToTrack` if UnifiedApp |
| track → edit | "Edit pattern" in tracker | full project payload (v9) — see INT-2 caveats | — | localStorage handoff + page nav, OR `onSwitchToDesign` if UnifiedApp |
| any → home | header logo click | — | — | `window.__goHome()` if available, else hard nav |

### 5.1 Transitions that exist but are not symmetric

* **create→edit** clears `parkMarkers` but does **not** clear `bsLines`.
  Going `create → edit → re-convert → edit` should reset both, but bsLines
  survive a re-generation. Likely intentional (backstitch lines belong to
  the user's work, not the pipeline), but worth confirming because
  bsLines drawn over the *old* generated pattern can now overlap entirely
  different colours after re-conversion. (See [03-edit.md](03-edit.md), item E-1.)
* **track→edit** carries `done` into the creator, but the creator's
  Generate button is still live in edit mode — pressing it after a
  track→edit handoff will silently wipe progress (the post-generate effect
  resets `done` to all zeros, no confirmation modal). (See [06-integration.md INT-3](06-integration.md#int-3).)

---

## 6. Naming collision: "cleanup" means two things

This is documented enough times in the code that it qualifies as a
project-wide hazard worth calling out at the top of every audit report.

| Term used | Code path | Meaning |
|---|---|---|
| `stitchCleanup` (state object) | [useCreatorState.js:373-381](../../creator/useCreatorState.js#L373-L381), passed into `runGenerationPipeline` | **Auto-cleanup pass during generation** (orphan removal, edge-aware morphological clean) |
| `useCleanupMode` (hook) | [creator/useCleanupMode.js](../../creator/useCleanupMode.js), `cleanupOpen`, `cleanupPendingMask` | **Manual post-generation cleanup overlay** (user selects mask, neighbour-vote replace) |

Files like `cleanup-worker.js`, `cleanupMode.test.js`, and the
`creator.stitchCleanup` preference are spread between both meanings; the
former is on by default, the latter is user-triggered.

---

## 7. Test infrastructure state (Phase 1 audit)

* **Runner:** Jest 30 (no Playwright in `npm test`; e2e suite under
  [tests/e2e/](../../tests/e2e/) is excluded by `testPathIgnorePatterns`).
* **Tests passing:** 154 suites, 1742 tests, 1 snapshot. ~5.5 s wall clock.
  No tests failing or skipped on a clean `npm test`.
* **Style:** Mixed. Some tests `require()` modules directly; many older
  ones extract functions with `fs.readFileSync` + regex + `eval` because
  the source files are plain script globals, not CommonJS. New tests
  generally follow whichever pattern already exists for the file under
  test.
* **Dependencies:** `fake-indexeddb`, `jest-environment-jsdom`,
  `fast-check`, `pako`, `pdf-lib`. IndexedDB-dependent code is exercised
  via `fake-indexeddb`.
* **CI:** None configured. There is a Husky `prepare` script that installs
  hooks ([scripts/install-hooks.js](../../scripts/install-hooks.js)) but no
  GitHub Actions / similar workflow file. Tests must be run manually.

**Findings about the test infrastructure itself:**

1. **TI-1 (low, inconsistent setup):** Two coexisting test patterns
   (require-vs-eval) force every new contributor to first read the file
   under test to decide which to follow. Listed as observation only; not
   actionable in this audit.
2. **TI-2 (low):** No CI. All assurances are local-only. Adding even a
   basic GitHub Actions workflow would catch regressions before merge.
   Not in scope for this audit but recorded.
3. **TI-3 (medium):** Per-mode test coverage is **uneven**.
   * Strong: cleanup-mode (`cleanupMode.test.js`), palette swap
     (`paletteSwapPreservesDone.test.js`), persistence
     (`persistence.test.js`, `cross-mode-persistence.test.js`,
     `deletion-persistence.test.js`), sync infra.
   * Weak: tracker view modes (`stitchView` switching, highlight + skip-done
     interactions), edit→track handoff data fidelity, creator
     re-generate-after-progress flow. These are the seams most likely to
     harbour latent bugs and are where this audit focuses its bug hunt.

### 7.1 Coverage gaps that map to the seams we're auditing

| Seam | Test coverage today | Gap |
|---|---|---|
| Create → Edit (post-generation reset) | Property tests on quantize, dither | No test asserts that `editHistory`/`done`/`parkMarkers` are reset together on regeneration |
| Cleanup apply → Edit history | `cleanupMode.test.js` covers apply | No test asserts that a single cleanup apply pushes exactly **one** undo entry that fully reverses both `pat` and any zeroed `pal` entries |
| Edit → Track handoff | `trackerHandoffFallback.test.js`, `cross-mode-persistence.test.js` | No test for the **version field** (creator writes 11, tracker writes 9 on round-trip) |
| Track → Edit handoff | `useProjectIOIsActive.test.js` | `processLoadedProject` does not restore tracker-only fields (`statsSessions`, `achievedMilestones`, etc.) — see INT-2 |
| Re-generate after track progress | none found | None |

These gaps drive the regression-test plan in Phase 4.

---

## 8. What this audit will not cover

To set scope honestly:

* **UI / UX redesign.** Already covered in
  [reports/create-flow-audit.md](../create-flow-audit.md),
  [reports/edit-mode-ui-audit.md](../edit-mode-ui-audit.md),
  [reports/track-mode-ui-audit.md](../track-mode-ui-audit.md). This audit
  is correctness-only.
* **Browser-platform / Safari issues.** Covered in
  [reports/03-pattern-creation-safari.md](../03-pattern-creation-safari.md).
* **Pure colour-maths / quantization correctness.** Covered by the
  existing property-based test suite (`*-properties.test.js`,
  `dE2000.test.js`, `quantize.test.js`, etc.).
* **PDF export / Pattern Keeper compatibility.** Out of scope per
  [AGENTS.md](../../AGENTS.md) — touching that path requires an explicit
  PK-compat regression check.
* **Sync engine internals.** Already audited under
  [reports/sync/](../sync/) and [reports/sync-reference/](../sync-reference/).
