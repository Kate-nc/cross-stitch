# Pattern Creator Tutorial

Learn to convert images into cross-stitch patterns with stitchx, edit them, and export your first chart.

## Overview

The Pattern Creator turns images into stitchable charts, or lets you design from scratch.

**Time:** 10–20 minutes (depending on how much you customise)
**You need:** an image — a photo, artwork or graphic (JPG, PNG, GIF, WebP or BMP)

## Starting a New Project

### From an image

1. Open the app at **home.html**.
2. Go to **Create new** and choose **New from pattern file**.
3. Pick your image. The Pattern Creator opens with it loaded.

You can also open an image inside the Creator with **File > Open…**.

### From scratch

1. Go to **Create new** and choose **New from scratch**.
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

The Creator guesses the type when you add the picture; choose another at any time. Every setting stays editable, and once you change one the choice shows **Custom**. To start every picture from your own defaults (threads, blends and dithering) instead, turn off **Guess the picture type** in **Preferences > Pattern Creator**.

### Image

- **Brightness / Contrast / Saturation** — tune the image before conversion.
- **Smooth** — reduce noise before matching colours (Median removes small specks; Gaussian softens edges).
- **Pre-sharpen detail** — keeps fine lines crisp.
- **Background** — tick **Skip background**, press **Pick**, click the background colour in the image, then adjust **Tolerance** to treat it as empty fabric.
- **Crop** — crop the image to the part you want.

### Dimensions

Set the size in **Stitches** (width and height, with an aspect-ratio lock) or as a **Finished size** in centimetres or inches on the chosen fabric: 18 cm wide on 14-count is 99 stitches. The fabric count is set alongside.

- **Bookmark** (5 × 18 cm), **Card** (5 × 7 in), **15 cm hoop** and **A4** fit the picture inside that frame.
- **Picture size** uses one stitch per pixel, scaled evenly to stay between 10 and 500 stitches.

A new picture starts with its long side at 100 stitches, never more than the picture has pixels. The line underneath always shows the size in stitches and the finished size. A note appears when a very wide or tall picture leaves its short side under 20 stitches (try cropping), or when the pattern has more stitches than the picture has pixels and each pixel becomes a block. Larger patterns hold more detail but take longer to stitch.

### Palette

**Threads (max)** — how many threads can appear (2–100). Each thread is one colour of stranded cotton, so this is how many to buy.

A blend stitches two threads together in one stitch and gets its own chart symbol, so a chart can have more symbols than threads. Counts say which they mean: "24 threads, 40 chart symbols (16 are blends of two threads)" is 24 threads to buy and 40 symbols to follow.

| Threads | Use case |
|---------|----------|
| **2–5** | Minimalist designs, logos |
| **10–15** | Most photos — a good balance for beginners |
| **20–40** | Complex photos, detailed artwork |
| **50–100** | Photo-realistic patterns |

**Use only stash threads** — match only to DMC and Anchor threads you own.

**Dithering** — blends neighbouring stitches to suggest in-between colours.

| Setting | Effect | When to use |
|---------|--------|------------|
| **Off** | Each area takes its closest thread | Logos, simple graphics |
| **Atkinson — Subtle** | Gentle blending, few isolated stitches | Soft gradients |
| **Atkinson — Balanced** | Smooth gradients in clean colour zones | Most photos |
| **Atkinson — Strong** | Richest gradients, more scattered stitches | Detailed photos |
| **Bayer 2×2 / 4×4 / 8×8** | A regular geometric blending pattern | A deliberate textured look |

**Min stitches per colour** — colours used fewer times than this are dropped.
**Confetti Cleanup** — merges isolated stitches into the surrounding colour (0–3).
**Stitch Cleanup** — tidies small regions, with options to protect fine details and separate similar neighbours.

### Compare options

Under the preview, **Compare options** shows the picture at three neighbouring settings side by side:

- **Size**: 25% smaller, the current size, 25% larger;
- **Threads**: 5 fewer, the current number, 5 more.

Each shows its stitches, threads, roughly how many hours it would take and its confetti level. Choose one to use its setting. The previews are smaller versions made in the background, so the real pattern can differ slightly. On a phone, tap **Compare options** to open it, then swipe sideways.

### Generate

Press **Generate pattern** in the action bar. Generation runs in the background; most images take a few seconds. Not happy? Change any setting and **Regenerate**.

## The Pattern Creator Layout

The top bar has three page tabs:

| Page | Contents |
|---|---|
| **Pattern** | The chart, tool strip and sidebar. The Stitch Score (0–100, higher is easier to stitch) sits above the chart. |
| **Project** | Name, designer, fabric, strands, stitching speed, Adapt to my stash / Adapt to brand. |
| **Materials & Output** | Sub-tabs **Threads**, **Stash status** and **Export**. |

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

**More tools** in the tool strip holds Move (drag a selection, or nudge it with the arrow keys), Cleanup mode and Denoise mode.

### Brush size

Paint, half stitches and Erase cover a square of stitches from 1×1 up to 10×10. Set the size with the slider or the quick sizes (1, 2, 3, 5, 7, 10) in the **Tools** tab, or under **More tools > Brush size**. The outline under the cursor shows the area the brush will cover.

### Deleting a selection

With stitches selected (Magic Wand or Lasso), press `Delete` or `Backspace`, click **Delete** on the selection bar, or right-click and choose **Delete selected stitches**. Every stitch in the selection is cleared, along with part stitches in those cells and backstitch lines lying entirely inside the selection; lines along its edge are kept. It is one undo step, and the selection stays in place so you can paint into the cleared area.

### Stitch types

Cross (`1`), Half / (`2`), Half \ (`3`), Backstitch (`4`) and Erase (`5`), plus quarter and three-quarter stitches. `T` / `Shift+T` steps through them.

- **Part stitches** — click the quadrant of a cell to place a quarter, half or three-quarter stitch.
- **Backstitch** — click a grid corner, then another, to draw a line.

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

- **Cleanup mode** (More tools) — removes dark border lines left over from line-art images.
- **Denoise mode** (More tools) — merges near-duplicate threads, removes speckle, and smooths colour fringes. Nothing changes until you press **Apply**.

### Split pane

Press `\` (or the split-pane button) to see the editable chart and a realistic preview side by side. Drag the divider to resize.

### Adapting the pattern to your stash

1. On the **Project** page, choose **Adapt to my stash** (or **Adapt to brand** to convert to Anchor or DMC).
2. Pick **Match my stash** or **Convert to brand**.
3. Review the table of original and replacement threads; override any suggestion, and use the ΔE threshold to control how close matches must be.
4. Press **Save adapted copy** — this creates a **new project**; the original is unchanged.

## Materials & Output

### Threads

Every thread in the pattern with its stitch count, estimated skeins (from the fabric count and strands) and cost at your skein price.

### Stash status

Which threads you own, are low on, or need to buy, from your Stash Manager inventory.

### Export

- **Open in Stitch Tracker** — opens the pattern in the Tracker, no file needed.
- **Quick presets** — *For Pattern Keeper* or *For printing (home)*.
- **Format & settings** — PDF or PNG, page size (Auto / A4 / US Letter), margins, stitches per page, chart modes (symbols on white, colour blocks with symbols), overlap zone, cover / info / index / mini-legend pages, Workshop print theme.
- **Export PDF** / **Export .oxs**.
- **Download bundle** — one `.zip` with the PDF, `.oxs`, a PNG preview, the `.json` project and a manifest.

Designer branding (name, copyright, contact, logo) is set once in **File > Preferences > Profile & branding**. See [EXPORT_QUICKSTART.md](../EXPORT_QUICKSTART.md) for a walk-through.

## Saving Your Work

Your pattern saves **automatically** on this device and appears in **Home > Projects**. To keep a file copy, use **File > Download (.json)** or press **Ctrl+S**.

## Tips & Tricks

### Choosing the right image

| Image type | Result | Tips |
|------------|--------|------|
| **Photo** | Photo-realistic | Needs more stitches for detail; crop to the subject |
| **Portrait** | Realistic | Adjust saturation if skin tones look wrong |
| **Logo** | Sharp, defined | Excellent for cross-stitch; little or no smoothing or dithering |
| **Digital art** | Depends on style | Flat colours convert more cleanly than painted textures |

### Too many isolated stitches?

Raise **Confetti Cleanup** or **Min stitches per colour**, use less dithering, or run **Denoise mode** on the finished pattern. Watch the Stitch Score rise.

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
