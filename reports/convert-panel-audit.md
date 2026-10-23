# Convert panel and preview audit

October 2026. Covers the Convert settings panel (`creator/ConvertPanel.js`,
formerly the create branch of `creator/Sidebar.js`) and the Convert preview
(`creator-main.js` `ConvertPreview`, `creator/StitchedPreview.js`,
`creator/usePreview.js`).

## What users reported

1. The panel felt clunky: fonts differed from section to section.
2. There was no logical flow from one choice to the next.
3. People weren't sure what a change did.
4. The preview didn't show what the finished piece would look like.

## What was wrong

### Layout and type

- One long column of accordion cards (Size & fabric, Colours, Detail and
  tidiness, Background, Adjust image, Shift Colours, Palette Presets, Project),
  with the picture type above them, a three-sentence introduction and a
  **Show all conversion controls** button to undo the collapsing. After the
  first Generate every card collapsed.
- Edit's panel uses a tab strip and flat sections with small uppercase
  headings (`.cs-toolsec`). Convert used none of that.
- Text sizes in the old panel: 7, 8, 9, 10 and 11 px, `--text-xs`,
  `--text-sm` and `--text-md`, in bold, semibold, medium and regular, with
  headings in sentence case, title case and upper case. Three different
  segmented-button styles (`.lp-segmented`, two hand-styled pill rows) and
  two kinds of on/off control (checkboxes and a custom switch).
- Raw colours (`#A06F2D`, `#F8EFD8`, `#B85555`) and a hard-coded `£`.

### Order

The order did not follow the decisions: Background and Adjust image (fixes
to the picture) came after Detail and tidiness (a choice about the result),
and Min stitches per colour sat between blends and the stash. Recolouring
tools for an existing pattern (Shift Colours, Palette Presets, Auto-Crop to
Stitches) were mixed in with conversion settings.

### Feedback

- **Once a pattern existed, Convert showed that pattern, not the preview.**
  Changing any setting therefore appeared to do nothing until Regenerate.
  This is the main reason people could not tell what a change did.
- The preview was one image split by a slider: half the original, half the
  pattern. The pattern was never visible whole.
- The pattern was drawn as flat squares, scaled up. A finished piece is
  crosses of thread with fabric between them, and a blend is two threads in
  one stitch, not their average colour.
- Nothing said what the last change did. Two buttons called "Show changes"
  and "Show what changed" did different things, and the first painted
  magenta into the preview itself.
- "x of y threads used" counted the old pattern, not the preview.

### Accessibility

- Sliders (`SliderRow`) had no accessible name.
- In dark mode a legacy `html.pref-dark button` rule painted every button
  grey with `!important`, so the chosen option in every segmented choice,
  the chosen Edit tab and swatch colours disappeared.

## Option by option

| Option | Before | Problem | Now |
|---|---|---|---|
| Introduction text | Three sentences at the top, always | Pushed every control down | One line per step; the chart-photo caveat is a hint under Picture type |
| Show all conversion controls | Button | Only existed because of the accordions | Removed |
| What kind of picture is this? | Above the accordions | Fine, but it set values in sections you couldn't see | **Picture > Picture type**, first thing in the first step; its hint says it sets threads and detail |
| Custom | Disabled fourth radio | Unclear what it meant | Kept as a state, explained in a hint; the footer summary also says Custom |
| Exact pixel-art import | Under the picture type | — | Unchanged, shown for pixel art |
| Skip background | Background accordion, after Detail | Name unclear; out of order | **Picture > Background**: **Leave background unstitched**, **Pick from picture**, **How close a match**; the Off state says what happens |
| Auto-Crop to Stitches | Background accordion, only after Generate | Cropped the picture and dropped the chart, so it only made sense before regenerating | **Edit > Tools > Correct > Crop to the stitches**: crops the chart itself through Resize canvas's undoable resize, keeping progress, backstitches, knots, beads and part stitches |
| Brightness, Contrast, Saturation | Adjust image accordion, last | — | **Picture > Adjust picture**, with **Reset adjustments** once anything is changed |
| Sharpen details, Amount | Adjust image | — | Same section |
| Soften grainy photos, method | Adjust image, method under Advanced | — | Same section, method still under Advanced |
| Size (stitches / finished size, presets) | Size & fabric accordion | — | **Size** step |
| Fabric count and colour | Size & fabric | — | **Size** step, with the skein assumption under it |
| Thread brand | Colours | Labelled "Threads", the same word as the next control | **Threads > Thread brand** |
| Threads (max) | Colours | Count shown was the old pattern's | **Threads > Number of threads**; says how many threads and symbols the preview uses |
| Allow two-thread blends | Colours | — | **Threads > Blends**, with what On and Off do |
| Min stitches per colour | Colours | Wedged between blends and stash | **Threads > Rare colours** |
| Use only stash threads, stash strip, quick add, Randomise, variations | Colours | 10 and 9 px text, raw colours | **Threads > Stash**, same type sizes as the rest |
| Detail and tidiness steps | Accordion | Four buttons in one row, cramped | **Detail** step, two-by-two grid; the preview's confetti count under it |
| Fine-tune disclosure | Closed by default | Hid what the steps change | The individual controls follow the steps in the Detail step, with one line saying changing them shows Custom |
| Shading | Fine-tune | Hand-styled segments | **Detail > Shading**, the shared segmented style |
| Stitch Cleanup | Custom switch | Different control from every other on/off | Checkbox, like the others |
| Reduce confetti, Protect fine details | Fine-tune | Estimate line repeated the count above it | **Detail > Tidying**; says how many stitches tidying changed in the preview, with **Show them on the preview** |
| Show changes (sidebar) | Only after Generate | Duplicated the preview's button | Removed; see the preview |
| Keep look-alike colours apart, How strict | Fine-tune | — | **Detail > Look-alike colours** |
| Shift Colours, Palette Presets, Revert | Convert, after Generate | Recolour the pattern; their confirm view is on Edit's chart | **Edit > Palette > Recolour the chart** |
| Project name, designer, notes | Collapsed accordion | — | **Project** step, with what the preview will take to stitch |
| Live summary | Defined, never shown | Dead code | Removed |
| Regenerate notice | A box above everything; compared 11 settings | Repeated the footer; missed brand, background, cleanup, stash and other changes | In the footer: made with these settings, edited since, made with other settings (every setting and the picture are compared), or unknown for a reopened project. Regenerate from any button asks before replacing an edited or reopened pattern |
| Generate | Bottom of the panel | Said nothing about what it would make | Bottom of the panel, under a one-line summary: picture type, size, threads, detail |

## Preview

| Problem | Change |
|---|---|
| After a pattern existed, Convert showed the pattern | Convert always shows the live preview, and says when it differs from the pattern |
| Only half of the pattern visible | Three views: **Stitched** (default), **Flat** (whole), **Before / after** (the slider) |
| Flat squares don't look like stitching | **Stitched** draws crosses of thread on the fabric colour, with as much fabric between them as two strands leave on that count (about 18% of the square on 11-count, 13% on 14-count, 6% on 18-count), blends as one strand of each thread, and shading that rounds the strands without darkening them. Drawn at the size shown, in device pixels, so it never shimmers. **Close up** shows 16 px stitches |
| Nothing said what a change did | A line under the preview names the setting and what moved: stitches changed, threads, chart symbols, confetti, skeins; or that nothing visible changed |
| Tidied-stitch overlay painted into the preview | A separate overlay, **Show tidied stitches** |
| "Heatmap" | **Show confetti**, in every view |

The existing Edit realistic renderer was tried first. Its coverage tops out
near 55% and its shading darkens the under leg by about a third, so even at
its maximum a 16-count preview read as mostly white diamonds over darkened
colours; Convert has its own renderer.

## Not changed

- The conversion itself: the preview was already the chart Generate makes,
  stitch for stitch (checked by `convert-preview-fidelity.spec.js`).
- Pattern Keeper PDF export.
- `convert-picture-presets.spec.js` "a logo is guessed as a graphic"
  expects at most 5 threads and gets 7; it failed the same way before these
  changes.

## Review follow-up

A review of the first version found, and this branch fixes:

- Crop to the stitches, moved to Edit, still called the picture crop, which
  dropped the chart. It now crops the chart through the undoable resize. The
  picture's own Crop, reachable in Convert once a chart exists, keeps the
  chart until Regenerate.
- The "matches these settings" line compared only 11 settings: a brand
  change still read as a match. Generate now records a signature of every
  conversion setting and the picture; a reopened project is unknown.
- Only Convert's footer asked before discarding edits. The question is now
  inside Generate, so the top bars and stash variations ask too, and a
  reopened chart (whose edits are not in the undo history) is protected.
- Show tidied stitches did nothing in Before / after; it now shows there.
- Close up of a large chart asked for an 8,192 × 8,192 canvas, over the iOS
  limit; both canvases now keep within the device's canvas budget.
- The change line compared cells of previews with the same cell count but a
  different shape; it now needs the same width and height, matches cells by
  thread colour as well as number, and marks counts from a smaller preview
  as estimates.
- Detail's Next now leads to Project.

## Further ideas

- An **Actual size** view for Stitched. CSS inches are not physical inches on
  most screens, so it would need a calibration step.
- Thread sheen: satin and metallic threads look different from the flat
  colour a catalogue gives.
- Remember the last Convert step per project.
