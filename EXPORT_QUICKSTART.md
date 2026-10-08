# PDF Export — Quick-start guide

The Pattern Creator's **Export** tab produces cross-stitch chart PDFs in
two flavours:

1. **Pattern Keeper–compatible** PDFs that load cleanly in the
   [Pattern Keeper](https://patternkeeper.app/) app (symbols embedded
   via the bundled CrossStitchSymbols font).
2. **Standard image-symbol** PDFs for home printing — colour blocks,
   symbols on white, or both, with no special font requirements.

Both are produced by the same pipeline; your choice of **chart mode**
and **preset** determines which you end up with. This guide walks a
first-time user through the workflow.

---

## 1. Open a pattern in the Creator

1. Launch the app from `home.html`. Open an existing project from **Home > Projects** (choose **Edit**), or start one from **Home > Create new**.
2. Generate the pattern and edit it until you're happy.

## 2. Open the Export tab

Choose **Materials & Output** in the Creator's page tabs, then the **Export** sub-tab. (**File > Export PDF…** skips this screen and exports straight away with standard settings — all optional pages, overlap on, automatic page size — ignoring the choices made here apart from branding and the Workshop theme.) From top to bottom you'll see:

| Section | What it does |
|---|---|
| Open in Stitch Tracker | Opens the current pattern in the Tracker (no file required). |
| Quick presets | One-tap configurations for the two most common scenarios. |
| Format & settings | Collapsible controls — format, page size, margins, stitches per page, chart modes, optional pages, Workshop print theme. |
| Export PDF / Export .oxs | Produce the files. |
| Download as bundle | One `.zip` with the PDF, `.oxs`, a PNG preview, the `.json` project and a manifest. |

## 3. Set your designer branding (one-off)

Branding lives in **File > Preferences > Profile & branding** and is applied to every PDF:

- **Your name or studio name** — appears on PDF cover pages.
- **Copyright line** — shown in the footer of every chart page (e.g. _© 2026 Your Name. For personal use only._).
- **Contact or website** — printed on cover pages.
- **Logo** — PNG or JPEG, up to 600 × 600 px, stored on this device only.
- **Logo position on cover page** — top-left or top-right.

## 4. Pick a preset

| Preset | Use when |
|---|---|
| **For Pattern Keeper** _(default)_ | You're selling or sharing the PDF for use in the [Pattern Keeper](https://patternkeeper.app/) app. Symbols + colour, medium-print pages, 2-row overlap between pages, cover page included. |
| **For printing (home)** | You'll print the chart and stitch from paper. Larger cells (≈4 mm), no overlap zone, no cover page. |

Tap a preset and the **Format & settings** controls update to match. You can still tweak individual settings afterwards.

## 5. Adjust settings (optional)

Expand **Format & settings** for fine control:

- **Format** — PDF (default) or PNG (single-image pattern, fixed 10 px per cell).
- **Page size** — `Auto` (A4 outside US/CA, Letter inside), `A4`, or `US Letter`.
- **Page margin** — millimetres (10–30 mm; 12 mm default).
- **Stitches per page** — Small (~80×100, ~2 mm cells), Medium (~60×70, ~2.8 mm cells, ideal for PK), Large (~40×50, ~4 mm cells), or Custom (snapped to multiples of 10).
- **Chart modes** — choose any combination of:
  - _Symbols on white (B&W)_ — clean black-on-white chart, easy to photocopy.
  - _Colour blocks with symbols_ — full-colour cells with contrasting symbol overlay.
- **2-row/column overlap zone** — repeats the last 2 rows/cols on the next page, tinted, so multi-page charts stitch together cleanly. Recommended for Pattern Keeper.
- **Cover page / Info page / Chart index / Mini-legend strip** — toggle individual sections.
- **Workshop print theme** — terracotta grid on a linen background. Off by default; leave it off for Pattern Keeper, which expects the standard black grid.

The footer of the panel shows a live page-count estimate so you know what you'll get before clicking export.

## 6. Export

1. Click **Export PDF** at the bottom.
2. A progress bar appears: _Generating PDF — page X of Y_. You can **Cancel** at any time.
3. When generation finishes the PDF downloads automatically. The filename is taken from the project name.

The PDF is built in a dedicated background worker so the rest of the Creator stays responsive.

## 7. Verify Pattern Keeper compatibility

Open the saved PDF in any reader and use the text-selection tool over a chart symbol. The symbol should highlight as **selectable text**, not as an image. That's the signal Pattern Keeper uses to track stitches — if it highlights, PK will work.

Then:

1. Open Pattern Keeper on your tablet.
2. Import the PDF.
3. Tap any chart cell — Pattern Keeper should recognise the symbol and let you mark it complete.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| **Export PDF button is greyed out** | You unticked both _B&W_ and _Colour_ chart modes. Tick at least one. |
| **No download starts** | Check the browser allowed the download; some browsers prompt the first time. |
| **Cancel button does nothing** | The worker is mid-flush of an internal page; cancellation completes within a second. |
| **PDF is very large (> 50 MB)** | You probably picked _small_ stitches per page on a huge pattern with both chart modes — try _medium_ or disable the colour mode. |
| **Pattern Keeper shows blank cells** | Make sure the symbol cells highlight as text in your PDF reader. If not, your reader may have re-saved the PDF with images flattened — re-export a fresh copy from the Creator. |

## Where things are stored

- Designer branding and last-used export settings: user preferences in browser **localStorage** (per device).
- Patterns themselves: IndexedDB (`CrossStitchDB` → `projects`).
- The exported PDF is **not** stored — it downloads directly to your browser's downloads folder.

---

*Need to share this guide with collaborators?* It lives at `EXPORT_QUICKSTART.md` in the repository root.
