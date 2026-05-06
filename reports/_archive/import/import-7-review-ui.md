# Import 7 — Review & Correction UI

> Phase 2, Step 3. Designs the review screen the user sees after the
> import engine has done its automated extraction. Consumes the
> `ImportResult` defined in [import-5-architecture.md §6](import-5-architecture.md#6-error-and-confidence-model)
> and the per-cell confidence model in [import-6-dmc-adapter.md §7](import-6-dmc-adapter.md#7-confidence-model-dmc-specific).

---

## TL;DR

- **Three review modes** triggered by overall confidence: fast-path confirmation (≥ 0.95), standard review (0.80–0.95), guided wizard (< 0.80).
- The review screen is **a single React route** (`/import/review`) that renders different layouts per mode, sharing the same underlying state.
- **Confidence is communicated visually**, not numerically — coloured halos around uncertain cells, badges on uncertain palette entries. Numbers appear only when the user opens the per-cell inspector.
- All corrections write to a **draft `ImportResult`** kept in component state. "Import" commits the draft to the v8 project store; "Cancel" discards. Nothing touches IndexedDB until commit.
- The **side-by-side view** is the "show your work" pane: original PDF page rendered to a canvas at the same scale as the extracted preview, scroll-synced.

---

## 1. Mode selection

```js
function pickReviewMode(result) {
  const c = result.confidence.overall;
  if (!result.ok) return 'failure';
  if (result.warnings.some(w => w.severity === 'error')) return 'guided';
  if (c >= 0.95 && result.warnings.length === 0) return 'fast-path';
  if (c >= 0.80) return 'standard';
  return 'guided';
}
```

| Mode | Trigger | What the user sees |
|---|---|---|
| `fast-path` | confidence ≥ 0.95, zero warnings | Single screen: pattern thumbnail + "Looks good?" + Import button |
| `standard` | confidence 0.80–0.95 | Three-pane review (pattern + palette + metadata), uncertain cells highlighted |
| `guided` | confidence < 0.80, OR error-severity warnings, OR partial extraction | Step-by-step wizard with manual confirmation at each gate |
| `failure` | `result.ok === false` and no `partial` | Error screen with file diagnostics + "try again as image import" link |

User can always **escalate down** ("show me the full review even though it looks fine") via a Show details link on the fast-path screen. They can never **escalate up** — once in guided mode they cannot skip to fast path.

---

## 2. Screen anatomy (standard mode)

```
┌─ Header ─────────────────────────────────────────────────────────┐
│  ← Cancel    Importing PAT1968_2.pdf            [Import pattern] │
│              DMC pattern · 80×80 · 12 colours                    │
│              ●●●●●●●●○○  92% confident                           │
├──────────────────────────────────┬───────────────────────────────┤
│                                  │  Palette (12)                  │
│     ┌──────────────────────┐     │  ┌──────────────────────────┐ │
│     │                      │     │  │ ▣ 310  Black     • 1244  │ │
│     │   Extracted pattern  │     │  │ ▣ 550  Violet    • 802   │ │
│     │   preview            │     │  │ ▣ 666  Bright Red• 614 ⚠ │ │
│     │   (with confidence   │     │  │ ▣ 740  Tangerine • 412   │ │
│     │    overlay)          │     │  │ ▣ 911  Emerald   • 388   │ │
│     │                      │     │  │ ▣ B5200 Snow Wht • 320 ⚠ │ │
│     │                      │     │  │   …                       │ │
│     └──────────────────────┘     │  └──────────────────────────┘ │
│                                  │                                │
│  [⊞ Show original]  [⊡ Inspect]  │  Pattern info                  │
│                                  │  Title:    │ Bouquet Floral │ │
│                                  │  Designer: │ DMC Studio     │ │
│                                  │  Fabric:   │ 14ct Aida      │ │
│                                  │  Size:     │ 14.5 × 14.5 cm │ │
│                                  │                                │
│                                  │  ⓘ 6 cells need review        │
└──────────────────────────────────┴───────────────────────────────┘
```

### Components

```
ImportReviewScreen
├── ImportReviewHeader            // title, confidence pip, Cancel + Import
├── ImportReviewBody
│   ├── PatternPreviewPane        // canvas with confidence overlay
│   │   ├── ConfidenceOverlay     // coloured cell halos
│   │   ├── CellInspector         // pop-over on click
│   │   └── PreviewToolbar        // Show original / Inspect modes
│   └── ImportSidebar
│       ├── PaletteList           // each entry with confidence badge
│       │   └── PaletteEntryRow   // expandable for correction
│       ├── MetadataForm          // editable fields
│       └── WarningsBanner        // count + jump-to-issue
└── ImportSideBySide              // overlay when Show original active
    ├── PdfPageCanvas
    └── ScrollSync
```

All component names follow the existing creator pattern (PascalCase, in `import-engine/ui/` per [import-5 §2](import-5-architecture.md#2-module-layout)).

---

## 3. Pattern preview pane

Renders the v8 `pattern[]` exactly as the Creator's [PreviewCanvas.js](../creator/PreviewCanvas.js) does, then overlays per-cell confidence.

### Confidence overlay

| Confidence band | Visual treatment |
|---|---|
| ≥ 0.95 | No overlay (clean) |
| 0.80–0.95 | Subtle 1 px ring in `--accent` at 30 % opacity |
| 0.60–0.80 | 2 px ring in `--warning` at 60 % opacity |
| < 0.60 | Full cell tint in `--warning` at 30 % opacity + dashed border |

The overlay is rendered on a separate `<canvas>` layered over the pattern preview so toggling it doesn't trigger a full re-render.

### Cell inspector (click on a cell)

Pops a small panel anchored to the cell:

```
┌──────────────────────────────────┐
│  Cell (45, 12)        ✕ Close    │
├──────────────────────────────────┤
│  Detected:  ▣ 666 Bright Red     │
│  Confidence: 72%                 │
│  Source: legend (RGB match)      │
│                                  │
│  Alternatives:                   │
│    ▣ 321 Christmas Red  (68%)    │
│    ▣ 304 Med Christmas  (61%)    │
│                                  │
│  [Use 666] [Pick another...]     │
└──────────────────────────────────┘
```

"Pick another…" opens the full DMC palette picker (reuses [creator/Sidebar.js](../creator/Sidebar.js)'s palette grid).

### Bulk corrections

If many cells share a low-confidence assignment to the same code, the inspector offers **Apply to all 87 cells assigned 666**. This is the path the user takes when the parser misidentified an entire colour rather than a single cell.

---

## 4. Palette list

Each row:

```
┌───────────────────────────────────────────────┐
│ ▣ 666  Bright Red       614 stitches  ⚠       │
│   ↳ tap to expand                             │
└───────────────────────────────────────────────┘
```

Expanded:

```
┌───────────────────────────────────────────────┐
│ ▣ 666  Bright Red       614 stitches  ⚠       │
│ ─────────────────────────────────────────     │
│ Confidence: 78%                               │
│ Reason: legend swatch RGB drifted 3.2 ΔE      │
│         from DMC reference                    │
│                                               │
│ [Change DMC code]  [Confirm correct]          │
│                                               │
│ Used in 614 cells. Highlight on chart [⌘]     │
└───────────────────────────────────────────────┘
```

**Change DMC code** opens the DMC picker. **Confirm correct** boosts the entry's confidence to 1.0 and removes its review marker (the user has explicitly accepted it).

**Highlight on chart** is the inverse of the cell inspector: clicking it dims every cell on the preview pane that isn't this colour, so the user can verify the colour was applied to the right region.

---

## 5. Metadata form

Plain editable fields. All extracted values pre-populate; missing values show a placeholder like `(not detected)` and the field is highlighted in `--warning`. Required fields (`title`, `fabricCount`) block the Import button until filled.

---

## 6. Side-by-side view

Toggled by `[⊞ Show original]`. Splits the body 50/50:

```
┌────────────────────┬────────────────────┐
│  Original PDF page │  Extracted pattern │
│  (rendered canvas) │  (live preview)    │
│                    │                    │
│      [page 2]      │                    │
│                    │                    │
└────────────────────┴────────────────────┘
       ⇅ scroll-synced
```

Implementation:

- PDF rendering uses pdfjs-dist (already in project) at scale matching the extracted pattern's bbox.
- Scroll containers share a single `useScrollSync` hook (zoom + pan locked together).
- A "Show grid alignment" toggle overlays the parser's detected grid lines on the original PDF page so the user can see what the parser saw.

This is the "show your work" affordance — the user can verify the parse is faithful without reading the full pattern cell-by-cell.

### Mobile

On viewports < 900 px, side-by-side stacks vertically with a swipe gesture between original/extracted. The grid-alignment overlay is the same.

---

## 7. Guided wizard mode

Triggered by confidence < 0.80 or error-severity warnings. Replaces the single-screen layout with sequential steps:

```
Step 1 of 4 — Confirm pages
   [list of pages with detected role + thumbnail]
   [user can change a page's role via dropdown]
   → Next

Step 2 of 4 — Confirm palette
   [all extracted legend rows]
   [user accepts or rejects each row]
   → Next

Step 3 of 4 — Confirm pattern
   [extracted pattern preview]
   [user can crop to actual chart bbox if assembly was wrong]
   → Next

Step 4 of 4 — Confirm details
   [metadata form]
   → Import pattern
```

Each step has a Back button. The step indicator is a horizontal progress bar (no emoji; uses [icons.js](../icons.js)' `check` icon for completed steps).

**Manual page-region selection** (Step 3 alternate path): if the user clicks "I don't see the right pattern here," a region-select tool appears over the original PDF page. They drag a rectangle around the actual chart, and the parser re-runs grid extraction with that bbox forced.

---

## 8. Failure mode UI

When `result.ok === false` and no `result.partial` exists:

```
┌────────────────────────────────────────────────────┐
│  We couldn't read this pattern                     │
│                                                    │
│  PAT1968_2.pdf · 4 pages · 1.2 MB                 │
│                                                    │
│  What we found:                                    │
│   • Page 1: cover image (recognised)               │
│   • Page 2: chart (couldn't extract grid)          │
│   • Page 3: chart (couldn't extract grid)          │
│   • Page 4: legend (recognised, 12 colours)        │
│                                                    │
│  What you can try:                                 │
│                                                    │
│   ┌──────────────────────────────────────────┐    │
│   │ Import as image                          │    │
│   │ Pick a chart page; we'll trace the grid  │    │
│   │ from the rendered image instead.         │    │
│   └──────────────────────────────────────────┘    │
│                                                    │
│   ┌──────────────────────────────────────────┐    │
│   │ Start with the palette only              │    │
│   │ We extracted 12 DMC colours; we can      │    │
│   │ pre-load them into a blank pattern.      │    │
│   └──────────────────────────────────────────┘    │
│                                                    │
│   ┌──────────────────────────────────────────┐    │
│   │ Try a different file                     │    │
│   └──────────────────────────────────────────┘    │
│                                                    │
└────────────────────────────────────────────────────┘
```

This is the **graceful degradation** path from [import-5-architecture.md §6](import-5-architecture.md#6-error-and-confidence-model) and the §10 rules. Even a complete extraction failure leaves the user with two productive next steps and the partial palette.

---

## 9. State machine

```
                  ┌─────────────────┐
                  │   selecting     │
                  └────────┬────────┘
                           │ file picked
                           ▼
                  ┌─────────────────┐
                  │   processing    │  (worker running, progress bar)
                  └────────┬────────┘
                           │ result returned
              ┌────────────┼────────────┬─────────────┐
              ▼            ▼            ▼             ▼
          fast-path    standard      guided        failure
              │            │            │             │
              │            │            │             ├─ try-image-import → (back to processing)
              │            │            │             ├─ palette-only-mode → standard
              │            │            │             └─ try-different-file → selecting
              │            │            │
              ▼            ▼            ▼
          confirmed    edited       wizard-completed
              │            │            │
              └────────────┴────┬───────┘
                                │ user clicks Import
                                ▼
                       ┌─────────────────┐
                       │   committing    │  (write to IndexedDB)
                       └────────┬────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ open-in-creator │
                       └─────────────────┘
```

Cancel from any state returns to `selecting` and discards the draft. Browser back button is treated as Cancel (with a "Discard import?" confirm if any edits were made).

---

## 10. Accessibility

- Every confidence indicator is visual + textual. The palette badges read `"⚠ low confidence — confirm or change"` to a screen reader.
- Cell inspector is a real `<dialog>` (keyboard-focusable, Esc to close).
- The pattern preview supports keyboard navigation: arrow keys move a cursor cell, Enter opens the inspector, Tab cycles through sidebar.
- Confidence colour bands always coexist with shape changes (ring vs dashed border vs tint), so the UI works for users who can't distinguish hue.
- Mobile target size: every interactive element ≥ 44×44 px.

---

## 11. Iconography

Per [.github/copilot-instructions.md](../.github/copilot-instructions.md), no emoji. New icons that may need to be added to [icons.js](../icons.js):

| Icon name | Purpose |
|---|---|
| `confidence-high` | Pip indicator on header |
| `confidence-low` | Pip indicator on header |
| `magnifier` | Cell inspector toggle |
| `splitView` | Show original / show extracted toggle |
| `gridOverlay` | Show grid alignment toggle |
| `wandFix` | Apply correction to all matching cells |

Existing icons reused: `check`, `x`, `warning`, `pointing` (already in `icons.js`).

---

## 12. What user actions write to the v8 project

Only the `Import pattern` button. Specifically:

- Stage 6 materialise re-runs over the **draft** ImportResult (with user edits applied).
- A v8 project object is written to `CrossStitchDB.projects` with a new ID.
- Project metadata mirror written to `project_meta`.
- `meta.rawSourcePages` and the original PDF bytes are persisted under `meta.attachments` (per §10 "preserve the original file" rule).
- Designer + copyright land in `meta.attribution` (per §10 "handle copyright respectfully").
- The active project pointer (`localStorage.crossstitch_active_project`) flips to the new project.
- The user is navigated to the Creator (`/index.html?project=<id>`).

If `Cancel` is clicked, none of the above happens; the worker is terminated; the draft is dropped; the user returns to the file picker.

---

## 13. Telemetry hooks (privacy-respecting)

No remote telemetry — this is a local-first app. But the review screen logs to `console` (gated by `window.__importDebug`) the following anonymised events for local debugging:

- Time spent in review (per mode)
- Number of cell inspector opens
- Number of palette corrections
- Whether the user clicked Import or Cancel

This is purely a developer aid; it produces no network requests and no IndexedDB writes.

---

## Next

[import-8-ui-proposals.md](import-8-ui-proposals.md) — three end-to-end UI flows that wrap this review screen, with wireframes.
