# Terminology Glossary

This glossary defines the canonical user-facing terms across the Pattern
Creator, Stitch Tracker, and Stash Manager. Use these terms consistently in
new UI strings, help content, modals, error messages, and documentation.

---

## Core Concepts

### Project
An end-to-end stitching effort tracked by the app. A Project always has:
- a generated or imported pattern,
- progress state (which stitches are done),
- a history (timer sessions, optional notes).

Projects are stored in `CrossStitchDB.projects`. They appear on Home
(Projects tab), in File > Switch Project…, and in the Stash Manager's
Pattern Library.

> Use **Project** when referring to something a user opens, edits, or stitches.

### Pattern
The visual chart itself — a grid of stitches plus colour metadata. A Pattern
is a *property* of a Project (`project.pattern`). It can also exist
independently in the Stash Manager's library (a "Pattern entry") to plan
stitching that hasn't been started yet.

> Use **Pattern** when referring to the chart/design as data, or to entries
> in the Manager that aren't linked to a started Project.

### Stash
The user's personal collection of physical thread skeins, tracked in the
Stash Manager. Each entry has a brand (DMC or Anchor), thread ID, owned
count, and optional history.

> Use **Stash** in user-facing copy. Avoid "Inventory" (legacy term).

### DMC / Anchor
Brand names of the supported thread manufacturers. Always capitalised as
**DMC** and **Anchor**. Composite stash keys use lowercase: `dmc:310`,
`anchor:403`. A pattern's thread brand (settings.threadBrand) is chosen
under **Threads** in Convert; call it the pattern's brand, and label a
thread with its brand and number ("Anchor 403"), never the number alone
when the brand could be either.

### Skein
A single physical bundle of thread (315 inches per skein, by default).

### Thread vs. symbol
A **thread** is one colour of stranded cotton (DMC 310). A **symbol** is a
mark on the chart. A solid stitch's symbol is one thread; a **blend** is one
symbol made of two threads stitched together (310+550), so a chart can have
more symbols than threads. The Convert limit is **Threads (max)**, and it
caps distinct threads, blends included.

Counts say which they mean, never "colours":

- success toast: "... now editing at 130×130 with 24 threads, 40 chart
  symbols (16 are blends of two threads). Use the Convert tab ...", or "with
  24 threads." when there are no blends. The counts sentence is never wrapped
  in another pair of brackets;
- counts are formatted with thousands separators (`fmtNum`, `plural` in
  `helpers.js`) and agree in number: "1 pattern", "16,950 full-cross cells";
- Palette header and summaries: "24 threads · 40 symbols".

`creatorThreadCounts(pal)` in `creator/useCreatorState.js` returns
`{ threads, symbols, blends }`; `threadCountsSentence` and
`threadCountsShort` format it. The terminology lint flags "Max colours".

### One thread label
Every surface writes a thread through `formatThread` in `helpers.js`, so the
same thread reads the same on the Creator Palette tab and chips, the Tracker
colour list, active tile and status bar, the Stash Manager and Home:

| Format | Solid | Blend |
|---|---|---|
| full (default) | **DMC 3799 Pewter Very Dark** | **DMC 341 + 826 (blend)** |
| short (tight spaces: id only) | DMC 3799 | DMC 341 + 826 |
| name | Pewter Very Dark | Blue Violet Light + Blue Medium |
| title (tooltip, accessible name) | DMC 3799 Pewter Very Dark | DMC 341 Blue Violet Light + DMC 826 Blue Medium (blend: one strand of each thread) |

The brand is always written with the number (Anchor 403). Catalogue
abbreviations are spelled out for display (`VDk` is Very Dark, `Antq` is
Antique); the catalogue data keeps the short forms. A name wraps; it is never
cut short. The Tracker sort by thread number is called **Number**, not "DMC ID".

A key row also says what the symbol takes: **2 strands · 1.3 skeins** for a
solid, **1 strand of each · 0.4 skeins each** for a blend (`threadKeyRow` in
`helpers.js`, `threadKeyUsage` in `threadCalc.js`: the fabric count on the
project, 2 strands and the 20 % allowance the shopping list uses).

### Blends
A **blend** is one chart symbol worked with two threads together in the same
needle: one strand of each. The needle still holds two strands, so a blend uses
half as much of each thread as a plain stitch. The Convert setting is **Allow
two-thread blends**. The wording lives in `BLEND_HELP` (`helpers.js`) and the
Help glossary entry *What's a blend?*; the Palette tab, the Tracker colour list
and the Convert result toast link to it.

### Confetti stitches
**Confetti stitches** are single stitches of a colour on their own; slow to
stitch. Define the term where it first appears (`CONFETTI_HELP` in
`helpers.js`). Always say "confetti stitches", never "stray stitches", "isolated
stitches/crosses", "orphans" or "single stitches". The count is one number:
full crosses with no same-colour neighbour above, below, left or right
(`confettiSummary` in `colour-utils.js`), and Ready to stitch, Pattern info and
the Convert preview all show it. Crosses in small connected groups of two or
three are counted separately as "small groups". The Convert slider and the
tool are both **Reduce confetti**. The terminology lint flags the old names in
string literals.

### Plain names for the settings
Settings and tools are named for what they do to the pattern, not for the
algorithm behind them. The technical name may appear only inside an
**Advanced** disclosure in the Convert sidebar, for people who want it.

| Control | Plain name | Not |
|---|---|---|
| Convert section | **Detail and tidiness** | Clean-up, Quality |
| Convert's steps (tabs) | **Picture**, **Size**, **Threads**, **Detail**, **Project**; each ends with **Next: …** | Image, Dimensions, Palette, Settings |
| Convert's sections | **Picture type**, **Background**, **Adjust picture**; **Thread brand**, **Number of threads**, **Blends**, **Rare colours**, **Stash**; **Detail and tidiness**, **Shading**, **Tidying**, **Look-alike colours** | Size & fabric, Colours, Adjust image (accordions) |
| Detail and tidiness steps | **More detail**, **Balanced**, **Tidier**, **Easiest to stitch**; the individual controls below them in the Detail step | Style, Quality levels |
| Background removal | **Leave background unstitched**, **Pick from picture**, **How close a match** | Skip background, Tolerance |
| Convert preview views | **Stitched** (the default), **Flat**, **Before / after**; **Close up**, **Show confetti**, **Show tidied stitches** | Realistic, Pixel, Heatmap |
| Dither setting | **Shading**: Off, **Smooth blend** (Subtle, Balanced), **Pattern blend** (Coarse, Medium, Fine) | Dithering, Atkinson, Bayer, 2×2/4×4/8×8, Strong |
| Clean-up switch and amount | **Stitch Cleanup**, **Reduce confetti** (Off, 1–3) | Cleanup strength, Gentle/Thorough, Fewer confetti stitches in shading, Smooth dithering |
| Pre-smoothing | **Soften grainy photos** | Smooth, Median, Gaussian |
| Pre-sharpening | **Sharpen details** | Pre-sharpen, luminance, chroma |
| Symbol separation | **Keep look-alike colours apart**, **How strict** | Separate similar neighbours, Separation strength |
| Colour distance | **Difference** | ΔE, delta-E, dE |
| Line-art clean-up tool | **Fix outline colours** | Cleanup mode |
| Denoise tool | **Reduce confetti** | Tidy stray stitches, Denoise mode |
| Convert orphan-removal slider (and the tool inside a selection) | **Reduce confetti** | Confetti Cleanup, Remove orphans, Orphans |
| Two-thread mixing in Convert | **Allow two-thread blends** | Allow blended threads |
| Tool thresholds | **How strict**: Gentle, Balanced, Strong | Tol, Thr, ΔE values |

The terminology lint flags ΔE (and its source escape), luminance, chroma,
Gaussian, Bayer and Atkinson in string literals in the Creator, the help
drawer and the welcome tours. Add `// terminology-lint-allow` to a line
inside an Advanced disclosure.

---

## Verbs (Save vs. Download vs. Export)

### Save
Write data to the app's internal storage (IndexedDB). The user keeps using
the app afterwards; no file appears on disk.

> Examples: autosave to `CrossStitchDB`, "Save Pattern" (Manager pattern
> detail editor writes to `stitch_manager_db`).

### Download
Write a file to the user's device. The app does not retain a reference to
that file.

> Examples: "Download (.json)" (File menu), "Download bundle" (`.zip`).

### Export
A user-facing umbrella for "Download" when the output is a deliberately
share-able artefact (PDF chart, OXS file, image).

> Examples: "Export PDF…", "Export .oxs", "Export Backup" (full backup,
> `.csb`).

### Open / Import
Read data from a file or URL into the app. "Open" implies the user wants
to keep working with it; "Import" implies merging into existing state.

> Examples: "Open Project (.json)", "Import Pattern (.oxs)".

### Sync (folder)
Optional feature that writes incremental updates to a user-chosen folder
(typically inside Dropbox/iCloud/OneDrive). Distinct from Save: the user
opts in once per device.

---

## UI Surfaces

| Surface | Canonical name |
|---|---|
| The landing page (`home.html`) | **Home** |
| The thread and library page (`manager.html`) | **Stash Manager** (tabs: **Thread Stash**, **Pattern Library**) |
| The pattern-creation page | **Pattern Creator** |
| The progress-tracking page | **Stitch Tracker** |
| The full-app backup file (`.csb`, older `.json`) | **Backup** |
| The project opened by default | **Active project** |
| The Tracker's marking mode | **Mark mode** (and **Navigate mode**) |
| The side panel opened with `?` | **Help** (the Help drawer) |

---

## Anti-patterns (do not use)

| Avoid | Use instead |
|---|---|
| Inventory | Stash |
| Save (when you mean write to disk) | Download / Export |
| Pattern (when you mean the whole project) | Project |
| Project (when you mean only the chart) | Pattern |
| File (when you mean an entry in storage) | Project / Pattern |
| Convert (without context) | Convert palette / Convert to Anchor |
| Max colours, "N colours" for a palette count | Threads (max); "N threads · M symbols" |
| Stray stitches, isolated stitches/crosses, orphans, single stitches | Confetti stitches |
| "DMC ID" (a sort button), "3799  Pewter…", "341+826 · 341+826" | The one thread label: "DMC 3799 Pewter Very Dark", "DMC 341 + 826 (blend)" |
| ΔE, luminance, chroma, Gaussian, Bayer, Atkinson | Plain names (see "Plain names for the settings") |

---

## Quick reference for contributors

When adding a new UI string:

1. Decide if you're describing a **Project** or just a **Pattern**.
2. Choose **Save** vs. **Download/Export** based on whether a file appears.
3. Use **Stash** (not Inventory) for thread collections.
4. Capitalise brand names: **DMC**, **Anchor**.
5. Keep British spellings ("colour", "organiser", "favourite").

The same definitions appear in the in-app Help drawer under the
**Glossary** topic ([help-drawer.js](help-drawer.js)) — keep the two in step.
