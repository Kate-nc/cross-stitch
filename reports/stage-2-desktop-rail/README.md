# Stage 2: one home for every tool on desktop

Screenshots of the Pattern Creator's Edit step with the tool rail
(`creator.desktopRail` on, the default) and with the old toolbar
(`creator.desktopRail` off), at 1440 × 900 and 1280 × 720, taken at 2× from
the logo fixture (`tests/fixtures/logo.png`) just after Generate.

| File | What it shows |
|---|---|
| `<size>-rail-on-window.png`, `<size>-rail-off-window.png` | The whole window after Generate, with "Your pattern is ready" |
| `<size>-rail-on-<tool>.png` | The header, the options bar and the top of the rail with that tool chosen |
| `<size>-rail-off-<tool>.png` | The header, action bar and toolbar with the same tool chosen in the old layout |
| `<size>-rail-on-selection.png`, `<size>-rail-off-selection.png` | The Wand with every stitch selected (Ctrl+A) |

Tools: `paint`, `fill`, `erase`, `pick`, `wand`, `lasso`, `shapes`, `text`, `hand`.

## Measurements (Chromium, mouse, `tests/e2e/creator-desktop-rail.spec.js`)

| | Before (toolbar) | Tool rail |
|---|---|---|
| Chart's top edge at 1440 × 900 | 311 px, with "Your pattern is ready" above the chart | 92 px (that bar floats over the chart's top) |
| Canvas area at 1280 × 720 | 518 px (72%) | 628 px (87%) |
| Chart's top edge at 1024 × 768 | not measured | 141 px (the pattern actions keep their own row under 1280 px) |

## Where every control went

With the tool rail on. "Clicks" counts from Edit; the old layout is unchanged
while the preference is off.

| Was in | Control | Now | Clicks |
|---|---|---|---|
| Pill | Paint, Fill, Erase | Rail | 1 |
| Pill | Navigate badge | Removed: the rail's Hand button shows the mode | – |
| Pill | Tool badge (Eyedropper, Magic Wand, Lasso, Line…) | Removed: the pressed rail button and the options bar say it | – |
| Pill | Selection count and clear | Options bar: "N stitches selected" and Deselect | 1 |
| Pill | Zoom slider, Fit | Options bar, right end (Zoom out, slider, Zoom in, Fit; 32 px tall) | 1 |
| Pill | Undo, Redo | Rail foot, tooltips "Undo (Ctrl+Z)", "Redo (Ctrl+Y)" | 1 |
| Pill | More | Removed (see the More rows) | – |
| Colour row | Selected thread chip and swatches | Rail foot: the working thread's swatch opens the Palette tab; choose a thread in its rows | 1–2 |
| Wand strip | Tolerance, Connected only / All matching, New / Add / Subtract / Intersect | Options bar (Wand) | 1 |
| Wand strip | Selection count, Deselect, Invert, All | Options bar: count, Deselect, Invert, Select all | 1 |
| Wand strip | Delete | Options bar > Selection > Delete selected stitches (and the Delete key) | 2 |
| Wand strip | Confetti…, Reduce Colours…, Replace Colour…, Stitch Info…, Outline… | Options bar > Selection menu | 2 |
| More | Navigate | Rail > Hand (H unchanged) | 1 |
| More | Pick, Wand, Lasso, Text | Rail | 1 |
| More | Line, Rectangle, Ellipse | Rail > Shapes menu | 2 |
| More | Move | Options bar > Selection > Move selection | 2 |
| More | Paste | Options bar > Paste, once something is copied (and Ctrl+V) | 1 |
| More | Mirror | Options bar > Mirror (Paint, Erase, Shapes) | 2 |
| More | Replace | Pattern menu > Replace colour (and R) | 2 |
| More | Fix outline colours, Reduce confetti | Options bar > Clean up | 2 |
| More | Stitch type | Options bar > Stitch (Paint, Fill) | 2 |
| More | Brush size | Options bar > Size (Paint, Erase, Shapes) | 2 |
| More | Resize canvas, Re-generate from image | Pattern menu | 2 |
| More | Petite and long stitches | Pattern menu > Petite and long stitches | 2 |
| More | Overlay | Side panel > View > Show the picture | 2 |
| More | Pen draws; fingers navigate, Magnifier, Precision cursor | File > Preferences (opens on Pattern Creator) > Touch and pen | 2 |
| Tools tab | Chart mode (Navigate / Draw) | Rail > Hand; any other tool is Draw | 1 |
| Tools tab | Stitch type, Backstitch continuous | Options bar (Paint; Continuous with Backstitch) | 2 |
| Tools tab | Brush size | Options bar > Size | 2 |
| Tools tab | Line, Rectangle, Ellipse, Text | Rail (Shapes menu, Text) | 1–2 |
| Tools tab | Outline / Filled, Keep lines straight | Options bar (Shapes) | 2 |
| Tools tab | Mirror on, axis, Centre the axis | Options bar (Mirror, axis, Centre) | 2 |
| Tools tab | Magic Wand, Lasso | Rail | 1 |
| Tools tab | Lasso mode | Options bar (Lasso) | 2 |
| Tools tab | Copy, Cut, Paste, Duplicate, Flip, Rotate | Options bar > Selection menu; Paste in the options bar; also the right-click menu and shortcuts | 2 |
| Tools tab | Delete selected stitches, Clear selection | Options bar > Selection > Delete; Deselect | 1–2 |
| Tools tab | Fix outline colours, Reduce confetti | Options bar > Clean up | 2 |
| Tools tab | Resize canvas, Crop to the stitches | Pattern menu | 2 |
| Side panel | View and Preview tabs | One View tab | 1 |
| Side panel | Back to Convert | Removed: the Convert tab in the top bar | 1 |
| Action bar | Convert / Edit / Materials | Header row, left of the actions (own row under 1280 px) | 1 |
| Action bar | Print PDF | Header row, the one primary button (secondary for a picture from the Tracker) | 1 |
| Action bar | Export…, Open in Tracker | Header row, secondary buttons (Open in Tracker is primary for a picture from the Tracker); icon with its name as tooltip under 1600 px | 1 |
| Action bar | Difficulty badge | Pattern info (header row, information icon) | 2 |
| Action bar | Pattern info | Header row | 1 |

Controls with no obvious new home went to the Pattern menu (the dropdown
beside Stats): Replace colour, Crop to the stitches and Petite and long
stitches.
