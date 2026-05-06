# Pattern Creator Tutorial

Learn to convert images into cross-stitch patterns using StitchX, edit them, and export your first chart.

## Overview

The Pattern Creator is where you turn images into stitchable charts or design patterns from scratch. This tutorial covers the complete image-to-pattern workflow.

**Time:** 10–20 minutes (depending on how much you customise)  
**Required:** A JPG or PNG image (photo, artwork, screenshot, etc.)

## Starting a New Project

### Method 1: From Image (Recommended for Beginners)

1. Open the app at **home.html**
2. Click **Create New** tab → **Create from image**
3. The **Image Import Wizard** opens — a 5-step guided flow

### Method 2: Blank Canvas

1. Go to **Create New** tab → **Blank canvas**
2. Enter width and height (in stitches) — e.g., 100 × 100
3. Click **Create**
4. Skip to "Editing Your Pattern" below

## The Image Import Wizard

The wizard has 5 steps that walk you through setting up your pattern before generating it.

### Step 1: Upload Your Image

1. **Click the upload area** or drag-and-drop your image
2. **Supported formats:** JPG, PNG, GIF, WebP, BMP
3. **Image tips:**
   - **Best:** Landscape or portrait photos, artwork, simple graphics, logos
   - **Avoid:** Very small images (<50 pixels), photos with lots of detail, text
   - **Size:** Any resolution works, but 500–2000 pixels wide is ideal

Your image appears in the preview once uploaded.

### Step 2: Crop & Rotate

Rotate or mirror your image and choose an aspect-ratio guide. The crop is applied when the pattern is generated.

### Step 3: Choose Dimensions & Colours

**Pattern dimensions** — Width and height in stitches. Larger = more detail but more time to stitch.

**Maximum colours** — How many different thread colours appear in the pattern.

| Setting | Use Case |
|---------|----------|
| **2–5 colours** | Minimalist, logos, simple designs |
| **10–15 colours** | Most photos — good balance for beginners |
| **20–40 colours** | Complex photos, detailed artwork |
| **50–80 colours** | Photo-realistic patterns |

**Minimum stitch count** — Colours used fewer than this many times are dropped from the palette (default: 0).

### Step 4: Adjustments & Dithering

**Brightness / Contrast / Saturation** — Sliders to tune the image before conversion. Experiment until the preview looks right.

**Smoothing**

| Option | Effect |
|--------|--------|
| **Off** | No smoothing — keep sharp edges |
| **Median** | Removes small noise spots |
| **Gaussian** | Slight blur — smooths jagged edges |

**Background removal** — Enable to click a colour on the image to remove it (e.g., a white background behind a logo). Adjust tolerance to remove more or fewer similar shades.

**Dithering** — Blends two threads in adjacent stitches to simulate smoother gradients.

| Setting | Effect | When to Use |
|---------|--------|------------|
| **Off** | Solid colours only | Logos, simple graphics |
| **Weak** | Subtle blending | Gentle gradients |
| **Balanced** | Moderate blending | Most photos (default) |
| **Strong** | Heavy blending | Detailed photos, gradients |

### Step 5: Confirm

Review the pattern details and click **Generate pattern** to create your pattern. A progress indicator appears while the pattern is generated (10–30 seconds for most images).

**Not happy with the result?** Use the Back button to change any setting and regenerate.

## The Pattern Editor

After generating, you're in the full Pattern Creator. The interface has three main pages accessible from the top navigation bar.

### Page 1: Pattern (Canvas)

The main editing area showing your full cross-stitch chart. On the right is a collapsible **sidebar** with contextual tabs:

**During image setup (Create mode):**
- **Image** — Re-upload or swap the source image
- **Dimensions** — Change pattern size and colour count
- **Palette** — Fine-tune colour matching and quality
- **Project** — Name and settings for this project

**After generating (Edit mode):**
- **Palette** — Palette management, colour quality controls
- **Tools** — Brush, fill, lasso, magic wand, half-stitches, backstitch tools
- **View** — Symbols, grid, zoom presets, and canvas appearance
- **Preview** — Realistic canvas mockup showing the finished look

An **action bar** above the canvas gives quick access to **Print PDF** and an **Export...** menu. The mode-switch buttons (**Create / Edit / Track**) let you jump between the import wizard, the editor, and the Stitch Tracker.

### Page 2: Materials

The Materials page has three sub-tabs:

| Sub-tab | Contents |
|---------|----------|
| **Threads** | Full thread list: DMC number, colour name, stitch count, skeins needed, cost |
| **Stash status** | Which threads you own (from your Stash) vs. which you need to buy |
| **Output** | All export options — PDF, PNG, JSON, ZIP, URL share |

### Page 3: Project

Project-level settings — name, fabric count, strand count, and other preferences.

## Editing Your Pattern

### Toolbar & Brush Tools

Select tools from the **Tools** sidebar tab:

- **Paint Brush** — Click/drag to paint individual stitches
- **Fill Bucket** — Flood-fill a region with one colour
- **Eraser** — Remove stitches (turn to background)
- **Magic Wand** — Click a stitch to select all matching stitches; refine threshold in the panel
- **Lasso** — Draw freehand to select a region

### Half-Stitches & Backstitches

Switch modes from the Tools panel or the toolbar:

- **Half-stitch mode** — Click to place quarter, half, or three-quarter stitches in any quadrant
- **Backstitch mode** — Click-and-drag to draw outline and detail lines

### Undo & Redo

- **Ctrl+Z** (Cmd+Z on Mac) — Undo last action
- **Ctrl+Y** (Cmd+Shift+Z on Mac) — Redo
- Full history — go back as many steps as needed

### Replacing a Colour

To replace one DMC colour with another across the whole pattern:

1. Right-click a stitch of the colour to replace, then choose **Replace this colour...**  
   — or click the swap icon on a palette chip  
   — or select the Replace tool from the toolbar
2. The **Colour Replace** modal opens, showing the current colour
3. Search for or click a replacement DMC colour
4. Click **Replace** — all stitches update immediately

### Remove Unused Colours

Colours with 0 stitches show an **X** button in the palette panel. Click the X individually, or click **Remove unused** to clear all zero-stitch colours at once.

### Split-Pane View

See the editable chart and the realistic preview side-by-side:

1. Click the **Split Pane** button in the toolbar (two-rectangle icon)
2. Drag the divider to resize the panes
3. Paint on the left; see a realistic render on the right in real-time

### Adapt Pattern to Your Stash

The **Adapt** feature finds substitutes from your thread stash for colours you don't own, or converts the whole palette to a different brand:

1. Click the **Adapt** button in the action bar or palette panel
2. Choose mode:
   - **Match my stash** — Auto-suggests stash threads as closest-match replacements
   - **Convert to brand** — Converts all threads to an equivalent Anchor or other brand
3. Review the substitution table — override any individual suggestion using the dropdown
4. Adjust the **threshold** (ΔE2000 slider) to control how close matches must be
5. Click **Save** — creates a **new project** with the adapted palette (the original is unchanged)

## Materials & Thread Info

### Threads Sub-tab

Shows all threads in your pattern:

| Column | Info |
|--------|------|
| **Thread** | DMC number and colour name |
| **Stitches** | How many stitches use this thread |
| **Skeins** | How many skeins you'll need (based on fabric count) |
| **Cost** | Price per skein × skeins needed |

### Stash Status Sub-tab

- Shows which threads you own (from your Stash Manager inventory)
- Shows threads you need to buy
- Toggle thread ownership directly from here

### Output Sub-tab (Export Options)

**Open in Stitch Tracker**
- Launches the pattern in the Stitch Tracker — no file download needed

**Print PDF**
- Multi-page Pattern Keeper–compatible chart
- Includes thread legend, finished size, and cost summary
- Choose colour symbols, image symbols, or black-and-white

**Download PNG**
- Full-resolution raster image of the pattern
- Choose full resolution or A4 page layout

**Download JSON**
- Complete project file (pattern, any progress, session history)
- Reload anytime to continue editing

**Download ZIP**
- All formats in one archive: PDF, PNG, JSON, OXS (Pattern Keeper format)

**Share via URL**
- Encodes the pattern into a compressed, shareable link
- Opens directly in the Stitch Tracker on any device
- No file transfer needed

See **[Export Formats Explained](Export-Formats.md)** for detail on each format.

## Saving Your Work

Your pattern saves **automatically** to local storage. No manual save is needed. The project appears in the Home Screen's Projects list.

## Tips & Tricks

### Choosing the Right Image

| Image Type | Result | Tips |
|------------|--------|------|
| **Photo** | Photo-realistic | Large stitches needed for detail; consider cropping |
| **Portrait** | Portrait-realistic | Works well; adjust saturation if colours are wrong |
| **Logo** | Sharp, defined | Excellent for cross-stitch; use minimal smoothing |
| **Artwork** | Depends on style | Digital art works better than painted photos |
| **Screenshot** | Pixelated | Can work if subject is clear; boost contrast |

### Stitch Count

**Too many stitches?** Reduce max colours or increase minimum stitch count.

**Too few stitches?** Increase max colours or lower smoothing.

### Stitching Time

Rough estimate: **1 stitch per minute** = Pattern time in hours.

- 100 × 100 pattern = ~10,000 stitches = ~170 hours
- 50 × 50 pattern = ~2,500 stitches = ~42 hours

Use the **Materials tab** for exact stitch count.

### Editing Large Patterns

For patterns with 100,000+ stitches:
- Zoom out (scroll wheel or Ctrl+- to see entire pattern)
- Use Magic Wand to select large regions quickly
- Paint in smaller sections if the canvas feels slow

## Fabric Counts Explained

**Fabric count** = stitches per inch

| Count | Stitch Size | Finished Size (100 stitches) |
|-------|------------|-----|
| **11-count** | Large | 9.1 inches |
| **14-count** | Standard | 7.1 inches |
| **16-count** | Medium | 6.3 inches |
| **18-count** | Small | 5.6 inches |
| **22-count** | Very small | 4.5 inches |

**Higher count = smaller stitches = more detail but harder to see.**

Choose your fabric count before exporting the PDF so the chart dimensions print correctly.

## Next Steps

### Ready to Stitch?

1. Export your pattern as **PDF chart** or **JSON project**
2. Open the **Stitch Tracker** (from Home Screen or `stitch.html`)
3. Load your pattern
4. Start marking stitches as you physically stitch

See **[Stitch Tracker Guide](Stitch-Tracker-Guide.md)** for tracking help.

### Manage Your Threads

1. Go to the **Stash Manager** (`manager.html`)
2. Add the threads you own
3. Back in the Creator, use **Adapt → Match my stash** to replace colours you don't own
4. Generate patterns that use threads you already have

See **[Stash Manager Guide](Stash-Manager-Guide.md)** for details.

### Learn Advanced Techniques

- **[Advanced Pattern Editing](Advanced-Pattern-Editing.md)** — Magic Wand, Lasso, blends, selection masks
- **[Thread Blends & Colour Matching](Thread-Blends-Colour-Matching.md)** — How blends work and why the app suggests them
- **[Export Formats Explained](Export-Formats.md)** — When to use each export option

---

**Last Updated:** May 2026  
**Questions?** Press `?` in the app for in-app help.

