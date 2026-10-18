# Pattern Creator Tutorial

Learn to convert images into cross-stitch patterns with stitchx, edit them, and export your first chart.

## Overview

The Pattern Creator turns images into stitchable charts, or lets you design from scratch.

**Time:** 10–20 minutes (depending on how much you customise)
**You need:** an image — a photo, artwork or graphic (JPG, PNG, GIF, WebP or BMP)

## Starting a New Project

### From an image

1. Open the app at **home.html**.
2. Go to **Create new** and choose **Convert a picture**.
3. Pick your image. The Pattern Creator opens with it loaded.

You can also open an image inside the Creator with **File > Open…**.

### From scratch

1. Go to **Create new** and choose **Draw a pattern**.
2. A blank grid opens. Add colours in the **Palette** tab and skip to [Editing Your Pattern](#editing-your-pattern).

### Guided import (experimental)

**File > Preferences > Pattern Creator > Use guided import wizard** replaces the sidebar set-up with a five-step wizard (Crop, Choose a palette, Size, Preview, Confirm). It is off by default.

## Setting Up the Conversion

Before a pattern exists, the right-hand sidebar shows the set-up tabs. The preview updates as you change settings.

### What kind of picture is this?

The first setting picks good starting values for the picture:

| Type | Starting values |
|------|-----------------|
| **Graphic or logo** | Up to 8 threads, no shading, no blends; a plain border background is left unstitched |
| **Photo** | Up to 20 threads, subtle shading, blends, balanced cleanup |
| **Pixel art** | The picture's own colours (up to 30) at its own size, one stitch per pixel (pictures up to 500 pixels across) |

The Creator guesses the type when you add the picture; choose another at any time. Every setting stays editable, and once you change one the choice shows **Custom**. To start every picture from your own defaults (threads, blends and shading) instead, turn off **Guess the picture type** in **Preferences > Pattern Creator**.

### Image

- **Brightness / Contrast / Saturation** — tune the image before conversion.
- **Soften grainy photos** — smooths away noise before the threads are chosen. The method is under **Advanced**.
- **Sharpen details** — keeps fine lines crisp.
- **Background** — transparent pictures use their alpha mask automatically. After resizing, alpha below 128 becomes empty fabric; alpha 128 or above keeps its colour without compositing. Transparent pixels use no threads, and fully transparent pictures create empty patterns. In these pictures, **Skip background** preserves opaque details even when they match the background RGB. For opaque pictures, tick **Skip background**, press **Pick**, click the background colour, then adjust **Tolerance**. Only matching regions connected to the outside edge are removed; enclosed matching details remain.
- **Crop** — crop the image to the part you want.

### Dimensions

Set the size in **Stitches** (width and height, with an aspect-ratio lock) or as a **Finished size** in centimetres or inches on the chosen fabric: 18 cm wide on 14-count is 99 stitches. The fabric count is set alongside.

- **Bookmark** (5 × 18 cm), **Card** (5 × 7 in), **15 cm hoop** and **A4** fit the picture inside that frame.
- **Picture size** uses one stitch per pixel, scaled evenly to stay between 10 and 500 stitches.

A new picture starts with its long side at 100 stitches, never more than the picture has pixels. The line underneath always shows the size in stitches and the finished size. A note appears when a very wide or tall picture leaves its short side under 20 stitches (try cropping), or when the pattern has more stitches than the picture has pixels and each pixel becomes a block. Larger patterns hold more detail but take longer to stitch.

### Palette

**Threads** — **DMC** or **Anchor**. The pattern's colours are matched to that brand's stranded cotton, and its key, shopping list, Stitch Tracker, PDF and `.oxs` files use that brand's numbers.

Screen colours are approximations; check physical threads when choosing materials. Catalogue corrections update patterns saved by thread number alone. Explicit imported or custom colours keep their saved colour when reopened. The [DMC catalogue audit](../reports/dmc-colour-audit.md) records source disagreements.

**Threads (max)** — how many threads can appear (2–100). Each thread is one colour of stranded cotton, so this is how many to buy.

A blend stitches two threads together in one stitch and gets its own chart symbol, so a chart can have more symbols than threads. Counts say which they mean: "24 threads, 40 chart symbols (16 are blends of two threads)" is 24 threads to buy and 40 symbols to follow. No two threads on a chart share a symbol, and the symbols on screen are the same shapes the PDF prints. A chart needing more than 112 symbols shows a warning after converting.

| Threads | Use case |
|---------|----------|
| **2–5** | Minimalist designs, logos |
| **10–15** | Most photos — a good balance for beginners |
| **20–40** | Complex photos, detailed artwork |
| **50–100** | Photo-realistic patterns |

**Use only stash threads** — match only to threads you own, in the brand chosen under **Threads**.

**Shading** (in **Clean-up**) — mixes neighbouring threads to suggest in-between colours.

| Setting | Effect | When to use |
|---------|--------|------------|
| **Off** | Each area takes its closest thread | Logos, simple graphics |
| **Smooth blend — Subtle** | Gentle blending, few single stitches | Soft gradients |
| **Smooth blend — Balanced** | Smooth gradients in clean colour zones | Most photos |
| **Smooth blend — Strong** | Richest gradients, more scattered stitches | Detailed photos |
| **Pattern blend — Coarse / Medium / Fine** | A regular geometric blending pattern | A deliberate textured look |

With Smooth blend, **Fewer single stitches in blends** keeps the mix in small clumps. The technical names (Atkinson error diffusion, ordered Bayer dithering) are under **Advanced**.

**Min stitches per colour** — colours used fewer times than this are dropped.
**Confetti Cleanup** — merges isolated stitches into the surrounding colour (0–3).
**Stitch Cleanup** — tidies small regions, with options to protect fine details and **Keep look-alike colours apart** (with **How strict**).

### Compare options

Under the preview, **Compare options** shows the picture at three neighbouring settings side by side:

- **Size**: 25% smaller, the current size, 25% larger;
- **Threads**: 5 fewer, the current number, 5 more;
- **Brand**: the picture in DMC and in Anchor.

Each shows its stitches, threads, roughly how many hours it would take and its confetti level. Choose one to use its setting. The previews are smaller versions made in the background, so the real pattern can differ slightly. On a phone, tap **Compare options** to open it, then swipe sideways.

### Generate

Press **Generate pattern** in the action bar. Generation runs in the background; most images take a few seconds. Not happy? Change any setting and **Regenerate**.

## The Pattern Creator Layout

The top bar has three page tabs:

| Page | Contents |
|---|---|
| **Pattern** | The chart, tool strip and sidebar. A Ready to stitch review link sits above the chart. |
| **Project** | Name, designer, fabric, strands, stitching speed, Adapt to my stash / Adapt to brand. |
| **Materials & Output** | Sub-tabs **Ready to stitch**, **Threads**, **Stash status** and **Export**. |

The **action bar** has the **Create / Edit / Track** phase buttons, **Generate pattern**, **Print PDF** and **Export options**.

After generating, the sidebar gains **Tools** and **View** tabs alongside **Palette**, **Preview** and **Project**.

## Editing Your Pattern

### Tools

Choose a colour in the **Palette** tab, then a tool:

| Tool | Key | What it does |
|---|---|---|
| Paint | `P` | Click or drag to paint stitches |
| Fill | `F` | Fill a connected area with one colour |
| Erase | `5` | Remove stitches, part stitches and backstitch under the brush |
| Eyedropper | `I` | Pick up a stitch's colour |
| Magic Wand | `W` | Select connected stitches of one colour; refine in the panel |
| Lasso | — | Freehand, polygon or magnetic selection (mode chosen in the Tools tab) |
| Hand | `H` | Pan without painting |
| Replace colour | `R` | Click a stitch to replace every stitch of its colour |

**More tools** in the tool strip holds Move (drag a selection, or nudge it with the arrow keys), **Fix outline colours** and **Tidy stray stitches**.

### Shapes and mirror drawing

- **Line**, **Rectangle** and **Ellipse** are in the **Tools** tab under **Shapes**, and under **More tools**. Drag from one end, or corner, to the other; a preview follows you and the shape is stitched when you let go, in the selected colour and as wide as the brush. Rectangles and ellipses are an **Outline** or **Filled**. **Keep lines straight or at 45°** snaps lines to rows, columns and diagonals (on by default on touch screens).
- **Mirror drawing** (Tools tab or More tools) copies Paint, Erase, Fill, shapes and part stitches across a dashed axis: **Left–right**, **Top–bottom** or **Both**. Half stitches turn to match. The axis starts at the centre; drag its round handle at the chart's edge, or use the arrow keys on it, to move it half a stitch at a time.

Each shape, and each mirrored stroke with its copies, is one undo step.

### Text

Choose **Text** (Tools tab, under Shapes, or **More tools**), tap or click where the text should start, and type. The text appears on the chart as you type, in the selected colour. Choose the **Block** (7 stitches tall) or **Serif** (9 stitches tall) font, the letter and line spacing, and the alignment. Capitals, small letters, numbers, common punctuation (including £ and &) and accented letters are covered. **Place** leaves the text floating to drag into position; **Done** stitches it as ordinary cross stitches in one undo step. Text wider than the pattern is flagged, with **Resize canvas** and **Use a smaller font**.

### Brush size

Paint, half stitches and Erase cover a square of stitches from 1×1 up to 10×10. Set the size with the slider or the quick sizes (1, 2, 3, 5, 7, 10) in the **Tools** tab, or under **More tools > Brush size**. The outline under the cursor shows the area the brush will cover.

### Copy, paste, flip and rotate

With stitches selected:

- **Copy** (`Ctrl+C`) and **Cut** (`Ctrl+X`) keep the stitches, part stitches and the backstitch lines inside the selection; Cut also clears them.
- **Paste** (`Ctrl+V`, or **Paste** in More tools) puts the copy back where it came from, floating on the chart. Drag it into place, then press **Done** or tap outside it; **Cancel** or `Esc` puts it back. Anything outside the pattern is left out.
- **Duplicate** (`Ctrl+D`) floats a copy two stitches down and to the right.
- **Flip horizontally** (`Shift+H`), **Flip vertically** (`Shift+V`), **Rotate left** (`,`) and **Rotate right** (`.`) turn the floating copy, or lift the selection and turn it where it is. Half stitches change direction and quarter stitches change corner to match.

On a phone or tablet these actions sit on a bar over the selection; on a computer they are in the Tools tab and the right-click menu. Placing a paste or a turn is one undo step.

### Deleting a selection

With stitches selected (Magic Wand or Lasso), press `Delete` or `Backspace`, click **Delete** on the selection bar, or right-click and choose **Delete selected stitches**. Every stitch in the selection is cleared, along with part stitches in those cells and backstitch lines lying entirely inside the selection; lines along its edge are kept. It is one undo step, and the selection stays in place so you can paint into the cleared area.

### Stitch types

Cross (`1`), Half / (`2`), Half \ (`3`), Backstitch (`4`) and Erase (`5`), plus quarter and three-quarter stitches and French knots. `T` / `Shift+T` steps through them.

- **Part stitches** — click the quadrant of a cell to place a quarter, half or three-quarter stitch.
- **Backstitch** — click a grid corner, then another, to draw a line.
- **French knot** — tap or click a grid corner or the middle of a stitch; the knot goes on the nearest one, in the selected colour. Tap a knot again to remove it. Each tap is one undo step, and mirror drawing places the mirrored knots too. Knots move, copy, flip and rotate with a selection, and **Delete** clears the knots of the selected stitches. Each knot adds about one cross stitch's worth of thread, and **Materials** lists *French knots* under their thread. Knots are saved in `.oxs` exports; PDFs draw them only with the **Workshop print theme**, since the *For Pattern Keeper* preset is kept exactly as Pattern Keeper expects.

### Undo & redo

- **Ctrl+Z** (Cmd+Z on Mac) — undo
- **Ctrl+Y** or **Ctrl+Shift+Z** — redo

### Replacing a colour

1. Right-click a stitch of the colour and choose **Replace this colour…**, click the swap button on a colour in the **Palette** tab, or press `R` and click a stitch.
2. Search for or click a replacement thread. The preview and stitch count update.
3. Press **Apply** (or double-click a thread to apply it straight away). Part stitches and backstitch are recoloured too, and the change is one undo step.

### Recolouring the whole palette

Once a pattern exists, the sidebar's **Shift Colours** section rotates every colour around the colour wheel, and **Palette Presets** applies a themed, harmonious or saved palette. **Revert to generated palette** undoes both.

### Removing unused colours

Colours with no stitches show a remove button in the palette; **Remove unused (N)** clears them all at once.

### Cleaning up

- **Fix outline colours** (More tools) — removes dark border lines left over from line-art images. **How strict** (Gentle, Balanced, Strong) widens or narrows the selection.
- **Tidy stray stitches** (More tools) — merges threads that are almost the same, removes speckle, and smooths colour fringes. Nothing changes until you press **Apply**.

### Split pane

Press `\` (or the split-pane button) to see the editable chart and a realistic preview side by side. Drag the divider to resize.

### Adapting the pattern to your stash

1. On the **Project** page, choose **Adapt to my stash** (or **Adapt to brand** to convert to Anchor or DMC).
2. Pick **Match my stash** or **Convert to brand**.
3. Review the table of original and replacement threads; override any suggestion, and use the difference limit to control how close matches must be.
4. Press **Save adapted copy** — this creates a **new project**; the original is unchanged.

When **Convert to brand** moves every colour to Anchor, the copy is an **Anchor pattern**: it keeps Anchor numbers and names when you reopen it, in the palette, Materials, shopping list, Stitch Tracker, PDF key and `.oxs` export. A copy that mixes DMC and Anchor threads keeps each thread's own brand.

## Materials & Output

Start with **Ready to stitch**. Compare the source image (if present), actual chart and a full-cross stitch simulation. Check recognisable details and colour relationships yourself; screen thread colours are approximate and do not calibrate physical materials. Review finished dimensions (including blank cells, excluding finishing margins), fabric count and over-two settings, two-strand and 20% waste assumptions, colour/symbol counts and the existing Threads estimates. Isolated crosses and colours used in five or fewer crosses describe effort; they can also be intentional highlights. Links open existing adjustment and cleanup controls without applying changes.

Choose the first column/row and sample width/height (up to 80 stitches each). The sample chart and stitches use the selected cells. **Export sample chart PNG** includes the exact region, coordinates, symbol key, current fabric assumptions and sample finished size. Try several meaningful regions and stitch a sample if colour or detail matters. The simulation shows full crosses only; inspect other stitch types in the chart. Drawn charts and projects with no source image remain reviewable.


### Threads

Every thread in the pattern with its stitch count, estimated skeins (from the fabric count and strands) and cost at your skein price.

### Stash status

Which threads you own, are low on, or need to buy, from your Stash Manager inventory.

### Export

- **Open in Stitch Tracker** — opens the pattern in the Tracker, no file needed.
- **Quick presets** — *For Pattern Keeper* or *For printing (home)*.
- **Format & settings** — PDF or PNG, page size (Auto / A4 / US Letter), margins, stitches per page, chart modes (symbols on white, colour blocks with symbols), overlap zone, cover / info / index / mini-legend pages, Workshop print theme.
- **Export PDF** / **Export .oxs**. OXS retains explicit backstitch threads over empty cells, supported fractional stitches and equal blends of two known threads of the same brand. Review every warning: unsupported blend proportions, miniature crosses and other unsupported objects are reported with affected types and counts. Diagonal quarters use the XSPro `petit="false"` extension; other programs may display them differently.
- **Download bundle** — one `.zip` with the PDF, `.oxs`, a PNG preview, the `.json` project and a manifest.

PDF charts support up to **112 used threads or blends**, with a distinct embedded symbol for each one in both chart modes, the thread key and page summaries. Unused palette colours and empty cells do not count. Above the limit, export stops with an error; reduce the used colours or blends first. On-screen symbols follow the same assignment, so they match the PDF unless you changed one with Change symbol (the PDF ignores those). Adding or removing a thread can move later threads to a different symbol.

Designer branding (name, copyright, contact, logo) is set once in **File > Preferences > Profile & branding**. See [EXPORT_QUICKSTART.md](../EXPORT_QUICKSTART.md) for a walk-through.

## Saving Your Work

Your pattern saves **automatically** on this device and appears in **Home > Projects**. To keep a file copy, use **File > Download (.json)** or press **Ctrl+S**.

## Tips & Tricks

### Choosing the right image

| Image type | Result | Tips |
|------------|--------|------|
| **Photo** | Photo-realistic | Needs more stitches for detail; crop to the subject |
| **Portrait** | Realistic | Adjust saturation if skin tones look wrong |
| **Logo** | Sharp, defined | Excellent for cross-stitch; little or no smoothing or shading |
| **Digital art** | Depends on style | Flat colours convert more cleanly than painted textures |

### Too many isolated stitches?

Raise **Confetti Cleanup** or **Min stitches per colour**, use less shading, or run **Tidy stray stitches** on the finished pattern. Compare the current chart and representative regions in Ready to stitch before applying cleanup: isolated details can be intentional.

### Stitching time

A rough guide is **one stitch per minute**:

- 100 × 100 pattern = ~10,000 stitches = ~170 hours
- 50 × 50 pattern = ~2,500 stitches = ~42 hours

The **Project** page estimates this from your own stitching speed.

### Large patterns

- Zoom out with `-` or `0` (fit), or the scroll wheel.
- Use the Magic Wand to select large regions quickly.

## Fabric Counts

**Fabric count** = stitches per inch.

| Count | Stitch size | Finished size (100 stitches) |
|-------|------------|-----|
| **11-count** | Large | 9.1 inches |
| **14-count** | Standard | 7.1 inches |
| **16-count** | Medium | 6.3 inches |
| **18-count** | Small | 5.6 inches |
| **22-count** | Very small | 4.5 inches |
| **28-count linen (over two)** | Same as 14-count | 7.1 inches |

Set the fabric count before exporting so the finished size and thread estimates are right.

## Next Steps

- **Ready to stitch?** Press **Track** in the action bar, or open the project from **Home > Projects > Track**. See the **[Stitch Tracker Guide](Stitch-Tracker-Guide.md)**.
- **Manage your threads:** add what you own in the **Stash Manager** (`manager.html`), then use **Adapt to my stash** or **Use only stash threads**.

---

**Last Updated:** October 2026
**Questions?** Press `?` in the app for in-app help.

Import review shows separate verification checks for recognised cells, legend matches, stitch types, dimensions, unsupported content and declared counts. Unknown source totals are unverified, and a PDF key percentage describes only legend matching. Use Palette for unresolved symbols, Pages for PDF page arrangements, or repair the source and re-import missing objects. The original file is retained with the import and can be downloaded during review.

## Petite and long stitches

In Creator, use **More tools > Petite and long stitches** to add objects with a thread and half-cell coordinates, select them, edit their geometry or delete them. Undo and Redo restore edits. These objects use their own panel; general canvas selection tools edit the other stitch types. In Tracker, click the geometry or use **Layers > Petite and long stitches** to mark overlapping objects independently. A petite counts as 0.25 units and a long stitch as 0.5; each is marked as a whole. Native JSON retains their identities and marks. PNG renders both. OXS exports petites and warns about unsupported long stitches. PDF export stops with an explanation. See the [capability matrix](../docs/petite-long-lifecycle.md).

## Exact pixel-art import

The editable **Pixel art** preset is a starting point. For pixel-for-pixel
geometry, enable **Exact pixel-art import** in Convert. Sources up to 500 by
500 pixels retain their original dimensions, including small motifs below
10 pixels. Larger sources must be resized explicitly before import.

Exact mode ignores size controls, brightness/contrast/saturation, sharpening,
smoothing, background removal, the colour limit, blends, dithering and cleanup.
Even isolated single-pixel details remain. Transparent alpha below 128 becomes
an empty stitch; alpha at or above 128 is stitched without flattening onto a
background. Opaque background pixels stay stitched.

Thread colours are an approximation: each visible source RGB maps to the nearest
solid thread in the selected brand or stash. Expand **Source colours mapped to
threads** beside the preview to compare source RGB, thread RGB, thread identity
and counts. Multiple source colours can map to the same thread. Preview and
Generate use the same native-resolution conversion. Resized variation galleries
require leaving exact mode.

## Editing a pattern you have already stitched

Every pattern opens in **Navigate**, on a computer as well as a touch screen, so
a stray click edits nothing. Choosing a tool or a colour swatch switches to
**Draw**. A new blank design (**Start drawing**) opens in Draw.

When the project has stitching progress, the Edit tab says so (for example
"This project is 34% stitched"). Changing the colour or stitch type of a cell
you have marked done (painting, filling, erasing, replacing a colour, a palette swap or Revert to
generated palette, Keep look-alike colours apart, cleanup, moving or pasting
over it) sets that cell back to not done, so your progress
never counts a stitch in the wrong thread. A toast tells you how many cells were
reset and has an **Undo** button; Undo and Redo in the toolbar bring the marks
back, or clear them again, together with the edit. Choose **Show stitched** in
the note to tint the cells marked done on the chart. Before regenerating from a
picture, which clears progress, export a backup with **File > Export Backup**.

## Tablet pen and finger rules

Enable **More tools > Pen draws; fingers navigate** for devices that reliably
report stylus input as a pen. In Draw, the selected tool acts with a pen or mouse;
one finger pans and two fingers pan/pinch. Navigate prevents all drawing.
Simultaneous pen and finger contact interrupts drawing and requires every contact
to lift before starting again. This conservative policy does not claim hardware
palm rejection.

Leave the option off when the browser cannot distinguish the stylus. Use
**Navigate** to move around and **Draw** to edit explicitly. Finger taps with
single-action tools such as Fill commit on lift, allowing a second finger to
cancel them. Two-finger navigation discards unfinished strokes and previews;
a finger left down cannot continue drawing.

A cancelled pointer, lost capture, hidden page, blur or viewport resize ends the
gesture. Interrupted brush strokes retain one Undo step. Unfinished shapes and
selection drags are cancelled without clearing the existing selection. Rotate,
resize or zoom, then start a fresh gesture after the canvas settles.

### Reusable PDF export presets

In **Materials & Output > Export**, choose a saved preset and **Apply preset**, or name the current settings and **Save as new preset**. Change the existing Format & settings controls, then **Update selected preset** to save edits or a new name. **Delete preset** keeps the active settings. Names are unique (ignoring case), up to 80 characters; up to 50 presets are supported.

Presets are **global preferences on this browser**, shared by all projects. Full backups restore them; project JSON, project bundles and sync do not carry them. Opening older projects uses current global export settings. Presets include page size, margins, density/custom rows and columns, chart modes, overlap, optional pages, legends, profile branding inclusion and print theme. They do not capture project metadata or a copy of the profile branding. Enabled branding uses the current Profile & branding preferences; a project designer takes precedence. Branding appears on cover/info pages, not chart pages.

**Chart only** disables cover, info, index, thread legend pages and mini-legends while preserving paper size, density and chart modes. Enable **Thread legend pages** if the recipient needs a key. Mini-legends are independent summaries of colours used on a chart page.

The live layout illustration shows the first chart page to scale, resolved paper dimensions, margins, cell size, chart regions and a page count from the export pagination plan. It illustrates bounds and colours; PDF symbols and typography are rendered during export. Auto resolves from the exporting browser locale, so choose A4 or Letter for a fixed paper size. Custom density accepts 10–200 stitches, rounded down to tens as shown in the preview; margins allow whole millimetres from 10–30. Branding lines shrink to fit, down to 6 pt; longer lines stop export with an explanation. Overlap repeats two rows/columns on adjacent pages. Unused palette entries do not add legend pages.

All presets use the existing worker and its 112-symbol limit, missing-glyph and unsupported-stitch checks. Use the standard print theme for Pattern Keeper. Actual Pattern Keeper import remains a manual device check.
