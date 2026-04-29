# Stash-Adapt — Phase 4.1 — Interaction Spec

> Locks down behaviour for the chosen direction:
> **Approach A (Review Table)** with **Approach B's always-visible thumbnail**,
> made **resizable** (drag-to-resize divider), **Combo 1** match-quality viz,
> **tracking reset** on adapt, **auto-suffix** name, **threshold slider** in
> the toolbar, **specialty threads excluded** by default,
> **chart-first then ΔE2000 fallback** for brand mode, and the legacy
> `SubstituteFromStashModal` / `ConvertPaletteModal` retired.

---

## 1. Module map

```
creator/
  matchQuality.js         ← NEW pure: tier thresholds, classifyMatch, tier copy
  adaptationEngine.js     ← NEW pure: proposeStash, proposeBrand, applyProposal,
                            reRunAuto, findReplacement, resolveDuplicates,
                            enforceContrast, specialty filter
  AdaptModal.js           ← NEW UI: full-screen modal, review-table + thumbnail,
                            resizable divider, threshold slider, source toggle,
                            picker sub-modal, mobile bottom-sheet variant
  pickerSubModal.js       ← NEW UI (or kept inline in AdaptModal.js): per-row
                            substitution picker (in-stash / all DMC / all Anchor
                            tabs, search, near-miss group)
helpers.js                ← +duplicateProject(srcId, opts), +searchThreads(q,
                            brand?), +SPECIALTY_PREFIXES const
project-storage.js        ← +adaptation projection in buildMeta (no DB version
                            bump; data shape only)
icons.js                  ← +Icons.adapt (compass-needle), +Icons.shuffle
                            (already exists?), confirm both before adding
creator/Sidebar.js        ← Replace existing "Replace with Stash Threads"
                            button → "Adapt this pattern" entry that opens the
                            new modal in stash mode
creator/ProjectTab.js     ← Replace ConvertPaletteModal call site → "Adapt"
                            entry (brand mode preselected)
creator/ActionBar.js      ← Add "Adapt" button to the action bar (optional
                            second entry point — same modal)
project-library.js        ← Render adapted-from badge on cards
manager-app.js            ← Render adapted-from badge on pattern-library cards
build-creator-bundle.js   ← +matchQuality.js, +adaptationEngine.js, +AdaptModal.js
                            (concat order: matchQuality → adaptationEngine →
                            AdaptModal — before Sidebar)
                            Remove SubstituteFromStashModal.js and
                            ConvertPaletteModal.js from ORDER and delete files
```

---

## 2. Entry points

| Where | Trigger | Mode |
|---|---|---|
| `Sidebar.js` (Palette panel) — replaces existing "Replace with Stash Threads" button | "Adapt to my stash" button | `mode = "stash"` |
| `ProjectTab.js` — replaces existing "Convert Palette" button | "Adapt to a different brand…" button | `mode = "brand"` |
| `ActionBar.js` — single new top-level button | "Adapt…" button → small menu (Stash / Brand / Manual) | user-selected |

All three call `app.openAdaptModal({ mode })`. The modal opens in that initial mode but the user can switch via the in-modal source-toggle without losing the entry-point context.

The empty-stash case **does not disable** the entry point; it opens the modal with the source-toggle preselected to "Brand" and a banner above the table reading "Your stash is empty — pick a brand below or assign replacements manually."

---

## 3. Modal anatomy (desktop)

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back        Adapt: My Pattern                          [Done]      │  toolbar (top)
├──────────────────────────────────────────────────────────────────────┤
│  Source: [Stash][Brand][Manual]   Sort: [Stitches][Quality][Name]    │  sub-toolbar
│  Filter: [All][Issues][Manual]   Threshold: ●─────○ ΔE 10  [↻ Match] │
├──────────────────────────────────────────────────────────────────────┤
│  Banner: 23 close · 4 fair · 3 no match · stash snapshot just now    │  status banner
├──────────────────────────────────────┬───────────────────────────────┤
│                                       │                               │
│  REVIEW TABLE (scrollable)           │   PREVIEW (sticky)            │
│                                       │                               │
│  Original  →  Replacement  Match  …  │   ┌─────────────────────────┐ │
│  ─────────────────────────────────── │   │                         │ │
│  DMC 310   →  DMC 310      Exact     │   │  Adapted preview        │ │
│  DMC 824   →  DMC 939      Good      │   │                         │ │
│  DMC 3801  →  DMC 309      Fair      │   └─────────────────────────┘ │
│  DMC 3849  →  No match     None      │   [Original] [Adapted]        │
│  …                                    │   Issues: 7 · Manual: 1      │
│                                       │                               │
└─[ ║ ]────────────────────────────────┴───────────────────────────────┘
                ↑ draggable vertical divider (resizable)
```

---

## 4. Resizable divider — exact behaviour

Reuses the same idiom as `creator/SplitPane.js`:

- Divider is a 6 px-wide hit area centred on a 1 px line; `cursor: col-resize`.
- Default ratio: `0.66` (review-table 66%, preview 33%).
- Min preview width: **240 px**; min table width: **400 px**.
- If the container is narrower than `400 + 240 + 6` (≈ 650 px), the divider hides and the layout collapses to **stacked** (preview on top, sticky; table below) — same breakpoint used elsewhere is 560 px but the table needs more, so we use **720 px**.
- Drag persists ratio to `UserPrefs` under key `creator.adaptModalSplitRatio`.
- Double-click the divider resets to default.
- Keyboard: divider is `role="separator" aria-orientation="vertical" tabindex=0`; `ArrowLeft` / `ArrowRight` adjust ratio by 5 percentage points; `Home`/`End` snap to min/max.
- Below 720 px the preview becomes a sticky 200-px-tall panel above the table (mirrors mobile layout), the divider is removed.

---

## 5. Mobile layout

- Full-screen modal, no inset.
- Sticky top bar (back / title / kebab).
- Sticky 200 px preview thumb directly under the top bar with the source toggle below it.
- Filter chips below toggle, horizontally scrollable.
- Each row is the stacked variant from the wireframe (original line + arrow line, quality chip far-right of the original line).
- Tapping a row opens a **bottom sheet** picker (90 vh, drag-to-dismiss).
- Sticky bottom bar with "Save draft" + "Done".
- Threshold slider is in a "More options" disclosure under the filter chips so it doesn't eat row space.

---

## 6. Match-quality chip (Combo 1)

Component: `<MatchQualityChip tier deltaE diff?>`

Render:
- Filled coloured dot (8×8 px) using `--success` / `--warning` / `--danger` per tier.
- Tier word (`Exact`, `Close`, `Good`, `Fair`, `Poor`, `No match`).
- Side-by-side 14×14 swatches **only on the row hover/focus state and always on the picker rows**, to keep the table compact.
- `title` attribute: `"ΔE 4.2 · slightly less saturated"` (Lab-derived diff hint).
- `aria-label`: `"Match quality good, delta E 4.2"`.

Tier thresholds (canonical, from `creator/matchQuality.js`):

| Tier | ΔE2000 | Colour token | Word |
|---|---|---|---|
| `exact` | < 1 | `--success` | "Exact" |
| `close` | 1 – 3 | `--success` | "Close" |
| `good` | 3 – 5 | `--success` | "Good" |
| `fair` | 5 – 10 | `--warning` | "Fair" |
| `poor` | 10 – 20 | `--danger` | "Poor" |
| `none` | ≥ 20 OR `target===null` | `--danger` (hollow dot) | "No match" |

Lab-derived diff hint built by `describeLabDiff(srcLab, tgtLab)`:

- |ΔL| > 5 → "darker" / "lighter"
- |Δa or Δb| > 5 → "warmer" / "cooler" / "greener" / "redder" / "bluer" / "yellower"
- ΔC*ab > 5 → "less saturated" / "more saturated"
- Combine up to two strongest signals; fall back to "very close" when nothing crosses thresholds.

---

## 7. Threshold slider

- Position: top-right of the sub-toolbar.
- Range: ΔE 1 – 25, default 10 ("Fair" boundary), step 0.5.
- Live label updates: "ΔE 10 — accepts up to **Fair**".
- On change, **does not auto-rerun** matching; instead enables the `↻ Re-match remaining` button and shows a hint "Threshold changed — re-match to apply".
- Setting persists to `UserPrefs.set('creator.adaptThreshold', n)` debounced 500 ms.

---

## 8. Source toggle behaviour

| Switch from … to | Behaviour |
|---|---|
| Stash → Brand | Confirm modal "Replace your matches with brand conversion?" only if any manual edits exist. Otherwise re-runs `proposeBrand` with current target. |
| Brand → Stash | Confirm modal as above. Re-runs `proposeStash`. |
| Anything → Manual | No re-run. Existing matches stay; user is now expected to override row-by-row. |
| Within Brand: change target brand (DMC/Anchor) | Re-runs immediately (cheap). |

Manual edits are tracked per-substitution as `source: "manual"` and are **always preserved** by `reRunAuto`; the confirmation only fires when wholesale switching modes.

---

## 9. Picker (per-row)

Tabs (in order, with counts):
1. **In your stash (n)** — only owned threads, ranked by ΔE.
2. **All DMC** — full DMC catalogue, ranked by ΔE.
3. **All Anchor** — full Anchor catalogue, ranked by ΔE.

Search input filters by id substring or name substring (case-insensitive).

Top group (always shown when relevant): **"Near misses (not in stash)"** — same as `SubstituteFromStashModal` v3 behaviour, threshold = `1.5 × current_threshold`.

Per row in the list:
- 26×26 swatch
- `<brand> <id>` + name + ownership line ("In stash · 2 skeins" / "Not in stash" / "Not in stash · need 2 skeins")
- `<MatchQualityChip>` with explicit ΔE shown.

Bottom row of the picker: "Leave original (skip this colour)".

Mobile: bottom sheet, picker rows are taller (touch target ≥ 44 px), tabs become a segmented control above the search.

---

## 10. Done state

When the user clicks **Done**:

1. Build the final `Project` via `applyProposal(sourceProject, proposal)`:
   - Deep-copy via `serializePattern` → `deserializePattern`.
   - Drop tracking (`done`, `halfStitches`, `halfDone`, `sessions`, `totalTime`).
   - Mint new `id`, `createdAt`, `updatedAt`.
   - Auto-suffix name: `"<original> (adapted to stash)"` / `"(adapted to anchor)"` / `"(adapted)"` for manual mode. Disambiguate by appending `" 2"`, `" 3"` … if a project of the same name already exists in `project_meta`.
   - Attach `adaptation` metadata.
2. `ProjectStorage.save(newProject)`.
3. `ProjectStorage.setActive(newProject.id)`.
4. Show toast: "Adapted pattern saved" with action button "Open original" (sets active back to source).
5. Close modal; the editor reloads with the new project.

If any substitutions are `state === "no-match"`, the toast also includes a secondary button "Add 3 missing to shopping list" → calls `StashBridge.markManyToBuy(keys, true)`.

---

## 11. Cancel / Save draft

- **Cancel** (Esc, X, browser back): modal closes, no project written.
- **Save draft**: writes the current proposal to `localStorage` under key `creator.adaptDraft.<sourceProjectId>`. Reopening the modal on the same source project restores the draft (with a banner "Resumed your draft from <relative time>"). One draft per source project; overwriting the same source project clears it on Done.

---

## 12. Adapted-from badge

Locations:

| Surface | Badge |
|---|---|
| Project list cards (`project-library.js`) | Small lavender "ADAPTED" pill + sub-line "From <name>" |
| Editor title bar | "(adapted from <name>)" suffix in muted text; clickable → opens original |
| Manager pattern-library card | Same lavender pill |
| PDF chart cover page | "Adapted from <name> · <date>" line under the title (separate ticket — not in MVP, out of scope here) |

Pill component: `<AdaptedBadge fromName onClick? />` lives in `components.js`, no emoji, uses `Icons.shuffle` (or new `Icons.adapt`) at 12 px.

---

## 13. Telemetry / debug surfaces

None planned. Add a single `console.debug("[adapt]", payload)` at the start of `applyProposal` so QA can spot wholly broken flows.

---

## 14. Keyboard shortcuts (within modal)

| Key | Action |
|---|---|
| Esc | Close modal (with unsaved-changes confirm if dirty) |
| Cmd/Ctrl + Enter | Done |
| `/` | Focus filter chips |
| `r` | Re-match remaining (when enabled) |
| `1` / `2` / `3` | Switch source toggle to Stash / Brand / Manual |
| `?` | Open the existing help drawer (no new content) |

Picker: standard list-box semantics — Up/Down moves focus, Enter selects, Esc closes back to the table.

---

## 15. Tests (functional)

- `tests/matchQuality.test.js` — tier thresholds, edge cases at 1.0 / 3.0 / 5.0 / 10.0 / 20.0; `describeLabDiff` for known fixtures.
- `tests/adaptationEngine.test.js` — full coverage matrix from data-model report §9.
- `tests/duplicateProject.test.js` — original byte-identical before/after; tracking reset; bsLines preserved with substituted ids; new id minted; `project_meta` mirrors `adaptation`.
- `tests/adaptModal.test.js` — JSDOM smoke: modal renders, source toggle re-runs proposal, threshold slider gates the re-match button, picker selection updates row.
- `tests/swPrecache.test.js` — confirm new files are listed.
- Snapshot test for `icons.js` updated if a new icon is added.

