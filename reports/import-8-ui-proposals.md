# Import 8 — UI Proposals & Wireframes

> Phase 2, Step 4. Three end-to-end UI flows that wrap the review
> screen designed in [import-7-review-ui.md](import-7-review-ui.md),
> consume the engine from [import-5-architecture.md](import-5-architecture.md),
> and use the DMC adapter described in [import-6-dmc-adapter.md](import-6-dmc-adapter.md).
>
> Wireframes live in [import-wireframes/](import-wireframes/) and use
> realistic content from the actual analysed DMC files (`PAT1968_2.pdf`,
> `PAT2171_2.pdf`).

---

## TL;DR

- **Approach A — "Single-screen import":** the simplest. File picker → progress overlay → review screen. One route, modal-style. Best for power users and for the mobile case.
- **Approach B — "Wizard with page tour":** explicit step-by-step. Drop file → analysis summary with page thumbnails → review per-page → final review. Best for first-time users and complex multi-page files.
- **Approach C — "Inline canvas import":** import happens _inside_ the Creator canvas. The empty-state Creator becomes a drop zone; analysed pages render onto a "draft layer" that the user can accept cell-by-cell. Best for the editing-as-you-import philosophy but adds the most surface area.

Recommendation appears in §6.

---

## 1. Design constraints (carried from prior reports)

- Every flow must surface confidence, never silently guess (per §10 rules).
- Every flow must work for fast-path (≥ 0.95 confidence, zero edits) and worst-case (guided wizard) extractions.
- The original PDF must remain accessible after import.
- Workshop-only theme; no emoji; SVG icons via `window.Icons.{name}()`.
- Worker-isolated parsing — the UI must never block the main thread.

All three approaches share the same underlying engine, the same `ImportResult`, and the same review components from [import-7](import-7-review-ui.md). They differ only in how the user is sequenced through the experience.

---

## 2. Approach A — Single-screen import

### Flow

```
┌─ Library / Project list ────────────────────────────────────────┐
│  [+ New project ▾]                                              │
│   ├─ Start blank                                                │
│   ├─ From image…                                                │
│   └─ From pattern file…  ← user picks this                      │
└─────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─ ImportModal (full-viewport) ───────────────────────────────────┐
│  Pick a pattern file                                            │
│  [drop zone]   or [Browse…]                                     │
│  Supported: DMC PDF · OXS · Project JSON · Image                │
└─────────────────────────────────────────────────────────────────┘
                       │ file dropped
                       ▼
┌─ Same modal, processing state ──────────────────────────────────┐
│  Reading PAT1968_2.pdf…                                         │
│  ████████████████████░░░░  78%   Step 4 of 6 — Resolving palette│
│  [Cancel]                                                       │
└─────────────────────────────────────────────────────────────────┘
                       │ result.ok === true
                       ▼
                Pick mode (per import-7 §1)
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   fast-path        standard        guided
   confirmation     review pane     wizard (4 steps)
        │              │              │
        └──────────────┼──────────────┘
                       │ Import pattern
                       ▼
              [Open in Creator]
```

### Click counts

| Path | Clicks | Steps |
|---|---|---|
| Fast-path | **3** | New project menu → file pick → Import |
| Standard, no edits | **3** | Same as above |
| Standard, with edits | 3 + N corrections | One click per corrected cell or palette entry |
| Guided wizard | **6** | Menu → file → 4 wizard Next clicks |

### Multi-page handling

The processing modal shows a one-line page-classification ticker: `Page 3 of 4 — chart (vector)`. Once parsing finishes, the standard review screen is the same regardless of how many pages were involved — the user sees the assembled pattern, not the individual pages.

If the user wants to see per-page diagnostics, they click `Inspect parse` in the review header → opens the side panel with page list + roles + confidences. This is opt-in.

### Manual page-role override

In the standard review's `Inspect parse` panel, every page has a role dropdown. Changing a page's role triggers a re-extraction (re-runs strategy from Stage 3). This is the escape hatch when the page classifier was wrong.

### Mobile

Modal becomes full-screen route. Sidebar collapses into a bottom sheet. Side-by-side stacks vertically with a swipe.

---

## 3. Approach B — Wizard with page tour

### Flow

```
File pick → Analysis summary → Per-page review (optional) → Final review → Import
```

The wizard structure is _always_ shown, regardless of confidence. Even fast-path imports show the page-tour briefly, but with all "Next" buttons pre-enabled and a "Skip to review" link prominent.

### Step 1 — Analysis summary

After parsing completes, the user sees a **single page** showing all pages of the source file as thumbnails with auto-classification labels:

```
┌─────────────────────────────────────────────────────────────────┐
│  PAT1968_2.pdf                                                   │
│  We found a DMC pattern.                                         │
│                                                                   │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐                  │
│  │   1    │  │   2    │  │   3    │  │   4    │                  │
│  │ cover  │  │ chart  │  │ chart  │  │ legend │                  │
│  │ 99%    │  │ 96%    │  │ 96%    │  │ 88%    │                  │
│  └────────┘  └────────┘  └────────┘  └────────┘                  │
│                                                                   │
│  [Skip to review →]            [Review each page →]              │
└─────────────────────────────────────────────────────────────────┘
```

The user can click any thumbnail to override its role. This is the natural place to recover from misclassification.

### Step 2 — Per-page review (optional)

If the user clicks "Review each page", they walk through pages one at a time. For chart pages, the parser overlays its detected grid on the rendered page so the user can confirm the alignment. For the legend page, the parser overlays its row segmentation.

This is the most thorough mode and the slowest. It exists for the user who wants to verify everything before committing.

### Step 3 — Final review

Same as Approach A's standard review screen. By this point all per-page corrections have been applied, so the chance of further edits is low.

### Click counts

| Path | Clicks | Steps |
|---|---|---|
| Fast-path with skip | **4** | Menu → file → Skip to review → Import |
| Standard, no edits | **4** | Same |
| Per-page review | 4 + N pages | One Next per page |
| Guided / corrections | 4 + N corrections | |

### Multi-page handling

This is where Approach B shines: the page tour _is_ the multi-page story. Multi-page assembly diagnostics naturally fit between Step 1 and Step 3 as a "we joined these pages — does this look right?" gate.

### Mobile

Page thumbnails wrap into a 2-column grid. Per-page review uses one page per screen with swipe between pages. Otherwise identical to A.

---

## 4. Approach C — Inline canvas import

### Flow

The empty-state Creator (when the user has no project loaded) is itself a drop zone:

```
┌─ Creator with empty canvas ─────────────────────────────────────┐
│  Tools  │                                                        │
│  Sidebar│         ┌──────────────────────────────────┐          │
│         │         │                                  │          │
│         │         │       Drop a pattern file        │          │
│         │         │       or click to browse         │          │
│         │         │                                  │          │
│         │         │       DMC PDF · OXS · Image      │          │
│         │         │                                  │          │
│         │         └──────────────────────────────────┘          │
│         │                                                        │
└─────────┴────────────────────────────────────────────────────────┘
```

On drop, parsing happens in-place; the canvas reveals the extracted pattern as it materialises (page-by-page). The sidebar's palette panel populates as the legend extractor returns rows.

### "Draft layer" model

The extracted pattern is rendered to a special **draft layer** distinct from the project's stitch layer. Cells appear with their confidence overlay baked in. The user can:

- Click a single cell to confirm or change it (writes to the project layer, removes from draft).
- Marquee-select a region to bulk-confirm or bulk-change.
- Click `Accept all` in a top banner to commit every draft cell at once.
- Click `Accept high-confidence only` to commit cells with conf ≥ 0.95 and leave the rest as draft.

```
┌─ Top banner during draft mode ───────────────────────────────────┐
│  Imported draft from PAT1968_2.pdf · 6394 cells · 92% confident  │
│  [Accept all]  [Accept high-confidence only]  [Discard]          │
└──────────────────────────────────────────────────────────────────┘
```

### Click counts

| Path | Clicks | Steps |
|---|---|---|
| Fast-path | **3** | Menu → file → Accept all |
| Standard, no edits | 3 | Same |
| Cell-by-cell verify | 3 + N cells | High overhead by design |
| Discard and retry | 4 | |

### Trade-offs

Pros:
- Zero "review screen" — editing _is_ the review.
- Encourages cell-level scrutiny by making it free.
- Side-by-side with the original PDF panel becomes a Creator dock, reusable for non-import workflows.

Cons:
- Ships the largest amount of new code (canvas needs a draft layer; selection model needs to handle draft-vs-committed; undo stack needs to know about both).
- Risky for the "I just want to import this" user — they _must_ click Accept all, which is a habituation hazard.
- No clean "Cancel" semantics — discarding a partial accept means the user has been editing for 10 minutes and now wants to throw work away.
- Worst story for failure modes — if the parser produces nothing, the canvas just sits there.

---

## 5. Side-by-side comparison

| Dimension | A: Single-screen | B: Wizard | C: Inline canvas |
|---|---|---|---|
| Best-case clicks | 3 | 4 | 3 |
| Worst-case clicks | 3 + edits | 4 + per-page + edits | 3 + cells |
| New components | review screen, modal | + wizard, page tour | + draft layer, selection bridge |
| Surface area | small | medium | large |
| Multi-page UX | hidden by default | featured | irrelevant |
| Failure UX | clear | clear | poor |
| Mobile UX | good | good | poor (canvas density) |
| Discoverability of corrections | medium | high | very high |
| Risk of "blind import" | low | very low | high |
| Implementation complexity | low | medium | high |
| Reuses existing UI patterns | high | medium | high (Creator) |

---

## 6. Recommendation

**Build Approach A first; layer Approach B on as the default for low-confidence imports.**

Specifically:

- The default flow is Approach A. File picker → modal → review screen. Clean, fast, three clicks.
- When confidence < 0.80, the review screen automatically becomes the wizard from Approach B (which is identical to the guided mode already specified in [import-7 §7](import-7-review-ui.md#7-guided-wizard-mode)). The user gets the page tour exactly when they need it.
- Approach C is rejected for v1. The "blind import" risk and the canvas surface-area cost outweigh the editing-fluidity benefit. Re-evaluate after v1 ships.

This gives us:

- 3 clicks for the 80 % case (DMC PDF, well-formed, high confidence).
- 4–6 clicks + targeted corrections for the 20 % case.
- One implementation of the review machinery.
- Reuse of existing modal, file-picker, and Creator patterns; no new canvas concepts.

---

## 7. Wireframes

All wireframes live in [import-wireframes/](import-wireframes/) as SVG. Each is sized 960 × 640 (matching the Workshop reference frames in `reports/showcase/`).

| File | Scene |
|---|---|
| [import-wireframes/01-file-pick.svg](import-wireframes/01-file-pick.svg) | File-selection modal with drop zone and supported formats |
| [import-wireframes/02-processing.svg](import-wireframes/02-processing.svg) | Processing state with per-stage progress and per-page ticker |
| [import-wireframes/03-page-classification.svg](import-wireframes/03-page-classification.svg) | Approach B's analysis summary with page thumbnails + roles |
| [import-wireframes/04-extracted-preview.svg](import-wireframes/04-extracted-preview.svg) | Standard review screen — extracted pattern + palette + metadata |
| [import-wireframes/05-palette-review.svg](import-wireframes/05-palette-review.svg) | Palette list expanded with confidence reasons + correction affordances |
| [import-wireframes/06-correction.svg](import-wireframes/06-correction.svg) | Cell inspector mid-correction, side-by-side with original PDF page |
| [import-wireframes/07-success.svg](import-wireframes/07-success.svg) | Import complete — pattern open in Creator with attribution chip |

Wireframes use realistic content from the analysed DMC files: `PAT1968_2.pdf` for the multi-page case, palette codes drawn from the actual legend extraction (310, 550, 666, 740, 911, B5200), and dimensions consistent with the analysis JSONs.

---

## 8. Open implementation choices for the user

Beyond the architecture-level open questions in [import-5 §10](import-5-architecture.md#10-open-design-questions), the UI flow has its own:

1. **Default the file picker to Approach A or B?** Recommendation: A. (Resolved above; restated as a confirmation point.)
2. **Where does the import entry-point live?** Today there's a "From image…" entry on the project-list New menu. Add `From pattern file…` next to it, or replace `From image…` entirely (image becomes a strategy under the new engine)? Recommendation: replace, since image is now just one strategy among many.
3. **Default behaviour when confidence ≥ 0.95 and zero warnings:** auto-import without showing the review screen, or always show fast-path confirmation? Recommendation: always show fast-path confirmation. One-click acknowledgement is cheap and prevents "I didn't realise it imported something."
4. **Original-file persistence:** store the original PDF bytes inside the project (+1–2 MB per project), or only store a SHA-256 hash and a filename ("you imported `PAT1968_2.pdf`, please keep your copy")? Recommendation: store the bytes, but compress with `pako` (already a dependency).
5. **Re-import / "patch" workflow:** if the user re-imports the same file later (perhaps after a designer correction), do we offer to reconcile against the existing project? Defer to v2.
6. **Multi-file batch import:** drop 5 PDFs at once. Defer to v2.

---

## Next

Phase 3 — review gate. Stop and present everything to the user before any implementation.
