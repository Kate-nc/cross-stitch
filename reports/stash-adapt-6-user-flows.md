# Stash-Adapt — Phase 2.3 — User Flows

> Click counts assume keyboard or mouse. Touch counts are 1:1 with mouse
> in this app's UI (no extra tap-to-confirm anywhere).

## Flow A — Adapt to my stash

### Entry points

1. **Pattern editor (Creator) → Adapt menu → "Adapt to my stash"**
   (primary).
2. **Project list → row context menu → "Adapt to my stash"**.
3. **Manager → patterns tab → row → "Adapt to my stash"**.
4. **Command palette** (`Ctrl/Cmd-K`) → "Adapt to my stash".

### Steps

| # | Screen / state | User action | Notes |
|---|---|---|---|
| 1 | Editor with original loaded | Click *Adapt* in toolbar | Always visible in toolbar's right-hand cluster. |
| 2 | Adapt menu opens | Click "To my stash" | One menu, three options (stash / brand / pick colours manually). |
| 3 | App computes proposal (≤1s; spinner if >300 ms) | wait | Engine: `proposeStash(pattern, stash)`. |
| 4 | **Review screen** opens with adapted-copy already created behind the scenes | scan rows | New project mounted; original untouched. Title bar reads *"Untitled (adapted from My Pattern)"*. |
| 5 | Optional: tap any row → opens picker | choose alt thread | Picker default = stash matches; tabs for "All DMC" and "All Anchor". |
| 6 | Optional: toggle preview (button in toolbar) | see original ↔ adapted | Same canvas, swaps `pat`/`pal` from a held-back original snapshot. |
| 7 | Click *Done* | persists name change ("My Pattern (adapted)") and exits review mode | Adapted copy is saved at this point; future edits flow through normal autosave. |
| 8 | Editor returns to normal, now editing the adapted copy | continue stitching, re-export, etc. | The original remains in project list, untouched. |

**Click count to a "good enough" outcome on a 30-colour pattern with all
auto-matches accepted: 3 clicks** (Adapt → To stash → Done).

### Decision points

- **Empty stash** (Step 3 detects 0 owned threads): screen renders
  with all rows in `no-stash-match` state, plus a banner: *"Your stash
  is empty. Try Brand conversion or pick replacements manually."* with
  inline buttons to switch flow.
- **All matches good** (no `fair`/`poor`/`no-match` rows): banner: *"Every
  colour has a close match in your stash."* — Done becomes the default
  focus-button.
- **Some `no-match` rows**: banner counts them and offers two buttons:
  *"Add missing to shopping list"* (uses existing
  `StashBridge.markManyToBuy`) and *"Keep originals"* (sets those
  substitutions to `state: "skipped"`, `target: null`).
- **Cancel**: explicit *Cancel* button. Confirms via toast undo, then
  deletes the adapted copy from storage.

### Error cases

- `getGlobalStash()` rejects → toast error, fall back to all
  `no-stash-match`, banner: *"Couldn't read your stash — try Brand
  conversion or pick manually."*
- Source pattern has no palette (corrupt project) → block flow with a
  clear error and "Open in editor to fix."

## Flow B — Swap a single colour (general substitution)

### Entry points

1. **Editor → palette panel → row hover → … menu → "Swap colour"**.
2. **Editor → palette panel → row right-click / long-press → "Swap colour"**.
3. **Command palette → "Swap colour…"** (then opens picker for "which colour to swap").

### Steps

| # | State | Action | Notes |
|---|---|---|---|
| 1 | Editor with palette panel visible | Open menu on a colour row | Discoverable as a single icon button on the row's hover state on desktop, always-visible on mobile (the row already has an overflow menu). |
| 2 | "Swap colour" picker opens | search / scroll / pick | Highlight cells using this colour on the canvas while picker is open. |
| 3 | Click target thread | applies swap immediately to all cells | One operation goes onto the global undo stack. |
| 4 | Toast: *"Swapped DMC 310 (152 stitches) for DMC 939. Undo"* | optional undo | 5-second undo. |

**Click count: 3** (open menu → choose Swap → pick target).

### Picker contents

Single tabbed panel. Tab order:

1. **In your stash** (default if non-empty) — sorted by ΔE2000 ascending,
   showing owned/needed.
2. **All DMC** — searchable by id or name.
3. **All Anchor** — same.

Each row shows: swatch, brand badge, id, name, ΔE2000 chip, "in stash"
chip when applicable.

### Edge cases

- Swapping to a thread already in the palette: cells merge; the source
  palette entry disappears; `done`/`halfStitches` for those cells move
  to the merged colour. (Behaviour identical to existing
  `applyMapping`.)
- Swapping to itself: no-op with toast.

## Flow C — Convert to a different brand

### Entry points

Same as Flow A; the *Adapt* menu's third option is "To Anchor"
(or "To DMC" if the current pattern's dominant brand is Anchor).

### Steps

Identical to Flow A from step 3 onward. The engine is `proposeBrand`
instead of `proposeStash`. Review screen is the same UI.

Differences in the review UI:

- The *Source* column header reads *DMC* (or Anchor); *Replacement*
  column header reads the target brand.
- Each row shows the *chart confidence* tag (`Official` / `Reconciled` /
  `Single source` / `Algorithmic`) in addition to the ΔE2000 quality
  tier.
- Default picker tab in row-detail is "All [target brand]" (no stash bias).
- A toggle at the top of the screen: *"Prefer chart matches over closest
  match"* (default ON). Off → re-runs proposal using ΔE2000 only.

**Click count: 3** (Adapt → To Anchor → Done).

## State transitions diagram

```
  ┌──────────┐  Adapt → Stash    ┌────────────────┐
  │ Editing  │ ────────────────► │ Review (stash) │
  │ original │  Adapt → Brand    └────┬───────────┘
  │          │ ────────────────►      │
  │          │  Adapt → Manual        │ accept all
  │          │ ────────────────► ┌────▼───────────┐
  └──────────┘                   │ Editing copy   │
                                 │ (autosaved)    │
                                 └────┬───────────┘
                                      │ user can re-Adapt
                                      └─► Review (any mode)
```

## Common review-screen interactions (shared by A and C)

- **Sort** rows by stitch-count desc / by ΔE asc / by name. Default:
  stitch-count desc (most-used colours first → biggest visual impact).
- **Filter** chips at top: *All*, *Issues only* (status `fair` / `poor` /
  `no-match`), *Manual edits* (rows the user touched).
- **Re-run auto-match** button at top — locks any row the user manually
  edited and re-runs the algorithm on the rest. Surfaces in a
  confirmation toast: *"Re-matched 17 colours, kept your 4 manual picks."*
- **Per-row reset** affordance — single-click reverts a row to the
  algorithm's original suggestion.
- **Per-row "Keep original"** option — explicit "I don't want to
  substitute this one." Marks `state: "skipped"`.
- **Preview toggle** at top (single button: *Original* / *Adapted*) —
  swaps the canvas thumbnail between the two states. Live, no modal.

## Mobile adaptation

- Review screen becomes a single full-height list. The canvas thumbnail
  collapses to a sticky header (~120 px tall) with the preview toggle.
- Sort / filter chips become a single horizontal scroll strip.
- Per-row picker opens as a bottom-sheet, not a modal.
- Done button is a sticky bottom bar, full width.
