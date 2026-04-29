# Stash-Adapt — Phase 1.3 — UX Research

Reference patterns from analogous features in adjacent tools.

## 1. Cross-stitch tools

### 1.1 Stitch Fiddle (web)

- Has a "convert palette" feature when uploading a chart. Auto-suggests
  DMC equivalents per cell. Conversion is **single-step**, no review:
  user uploads → tool converts → the result is what you get. To override,
  you have to manually paint over individual stitches.
- **Borrow:** speed of the auto-pass. **Avoid:** lack of a review step
  before commit.

### 1.2 Pattern Keeper (mobile, paid)

- No "adapt" feature. Patterns are static once loaded. Threads are
  tracked separately.
- **Take-away:** this is a market gap. Mobile-first stitchers regularly
  ask for it.

### 1.3 KG-Chart / WinStitch (Windows desktop, paid)

- "Replace colour" dialog exists: pick a pattern colour from a list, pick
  any DMC/Anchor as the replacement. Single-colour-at-a-time. No stash
  awareness, no auto-match, no preview.
- "Convert palette" dialog runs ΔE-style auto-match across the whole
  palette but produces a flat list with no quality indicator. Apply or
  cancel — no per-row override before applying.
- **Borrow:** a clear "Apply" / "Cancel" terminal step. **Avoid:**
  no-context flat list.

### 1.4 MyStitchPath, Pattern Wizard, etc.

- Various smaller tools, mostly desktop. None offer "adapt to my
  inventory" specifically. The closest pattern is "constrain palette to
  N colours" at *generation* time — which is what this app's
  `creatorStashOnlyDefault` preference already does.

## 2. Knitting / crochet

### 2.1 Ravelry — yarn substitution

- Per-pattern "Yarn substitution" tab lists every yarn the pattern calls
  for, with a "Find substitutes" button. The substitute search opens a
  filter UI (weight, fibre, gauge, colour) over Ravelry's yarn database.
- The user picks substitutes one yarn at a time; the result is added to
  the user's project as a yarn note, **not** auto-applied to the pattern.
- **Borrow:** the project-note model — preserves the original pattern
  while attaching the user's substitution decisions.
- **Avoid:** browsing the entire global database when the user *already
  has* yarn at home. The "what do I own that fits?" question is barely
  surfaced.

### 2.2 Knit Companion

- Lets the user mark a chart's colour key with their own yarn. Stored as
  a per-pattern overlay; original chart colours unchanged. User can
  toggle between "designer's colours" and "my colours" in the chart
  view.
- **Borrow heavily:** the toggle between designer view and adapted view.
  This is the simplest possible "preview" UI and exactly fits the spec's
  "side-by-side or toggle preview" requirement.

## 3. Design tools

### 3.1 Figma — Swap Library / Variables modes

- Component instances bind to a library; user can swap the bound library
  on an instance and every property remaps automatically by *name*. If a
  property has no equivalent in the new library, it stays bound to the
  old value and is flagged.
- **Borrow:** the "remap by name where possible, leave originals where
  not" pattern → maps cleanly to "use the conversion table where
  possible, fall back to algorithmic, leave the original colour where
  neither works."

### 3.2 Sketch — Symbol overrides

- An adapted symbol carries an override map per instance, not a deep
  copy. Saves storage. **Not applicable here** — pattern files are
  already small enough that deep-copy is fine and the override-layer
  approach makes "delete the original" hard to handle correctly.

## 4. Photo / colour tooling

### 4.1 Adobe Lightroom — Profile / LUT

- Apply a colour profile non-destructively; toggle preview on/off; reset
  individual sliders. Strong "before/after" UX.
- **Borrow:** the always-available "Reset this one" affordance per
  substitution row. Lightroom never makes you start over.

### 4.2 Affinity Photo / Procreate — recolour

- Both have a single-target colour picker that highlights the affected
  pixels live as you change the replacement. **Borrow** for Flow B
  (single-colour swap): when the user opens the picker for "swap colour
  X," the cells using X should pulse/highlight on the canvas so the user
  immediately sees the scope.

## 5. Forum & video research highlights

From r/CrossStitch ("DMC to Anchor conversion" threads, 2020–2024) and a
selection of YouTube tutorials on converting LoraS designs to Anchor:

- **The #1 frustration is silent quality drops.** Auto-conversion tools
  show "matched" without saying *how well*. Stitchers learn the hard way
  that a particular online converter's "match" for a dark navy was
  actually a charcoal grey.
- **The #2 frustration is no batch view.** Converting one colour at a
  time is fine for a 12-colour pattern; tedious for an 80-colour HAED.
- **The #3 frustration is no record of what was changed.** After
  finishing a substituted piece, stitchers often want to know "what did
  I actually use?" months later. Persisting the substitution map is
  high-value.
- **What works well in real workflows:** writing it down in a notebook,
  with the original colour and its substitute side by side. Our table
  view should literally look like that paper notebook.

## 6. Distillation — design rules to follow

1. **Honesty above brightness.** Show ΔE-derived quality on every row,
   prominently. Never hide a poor match behind a vague label.
2. **Spreadsheet for review, picker for edits.** Default to a complete
   table view (mirrors the paper-notebook mental model). Tap a row to
   open a picker for that specific colour.
3. **Always-on toggle: original ↔ adapted.** Single button at the top of
   the canvas. No modal, no separate "preview screen."
4. **The original is sacred.** Visual language must make it impossible
   to confuse the original and the adapted view. Adapted patterns get a
   distinct badge/colour scheme on the project list, in the editor title
   bar, and in any export.
5. **Re-run partial.** After manual edits, "re-run auto-match on
   remaining rows" — never blow away the user's manual choices.
6. **Mobile-first table.** Stitchers will use this in craft stores. The
   table must be readable on a phone (compact rows, swatches large
   enough to discriminate, tap target ≥ 44 pt).
