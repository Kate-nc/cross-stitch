# Pattern Creator Tutorial

Learn to convert images into cross-stitch patterns using StitchX, edit them, and export your first chart.

## Overview

The Pattern Creator is where you turn images into stitchable charts or design patterns from scratch. This tutorial covers the complete image-to-pattern workflow.

**Time:** 10–20 minutes (depending on how much you customize)  
**Required:** A JPG or PNG image (photo, artwork, screenshot, etc.)

## Starting a New Project

### Method 1: From Image (Recommended for Beginners)

1. Open the app at **home.html**
2. Click **Create New** tab → **Create from image**
3. You'll see the **Image Import Wizard**

### Method 2: Blank Canvas

1. Go to **Create New** tab → **Blank canvas**
2. Enter width and height (in stitches) — e.g., 100 × 100
3. Click **Create**
4. Skip to "Editing Your Pattern" section below

## Step 1: Upload Your Image

In the Image Import Wizard:

1. **Click the upload area** or drag-and-drop your image
2. **Supported formats:** JPG, PNG, GIF, WebP, BMP
3. **Image tips:**
   - **Best:** Landscape or portrait photos, artwork, simple graphics, logos
   - **Avoid:** Very small images (<50 pixels), photos with lots of detail, text
   - **Size:** Any resolution works, but 500–2000 pixels wide is ideal

**Your image appears in the preview once uploaded.**

## Step 2: Choose Pattern Size

### Maximum Colours

This controls how many different thread colours will appear in your pattern.

| Setting | Use Case | Tip |
|---------|----------|-----|
| **2–5 colours** | Minimalist, simple designs, large stitches | Fastest to stitch |
| **10–15 colours** | Average pattern, most photos | Good balance |
| **20–40 colours** | Complex photos, detailed artwork | More realistic, slower to stitch |
| **50–80 colours** | Photo-realistic, highly detailed | Most stitches, most threads |

**Recommended for beginners:** Start with 10–15 colours.

You'll see a **live preview** of your pattern with the chosen colour count. The preview updates as you change settings.

### Minimum Stitch Count

Colours used fewer times than this threshold are automatically removed. For example:
- If set to **10**, colours with fewer than 10 stitches are dropped
- If set to **50**, very rare colours disappear, simplifying the palette

**Default:** 0 (no minimum)

## Step 3: Adjust Image Quality Settings

These controls affect how the image converts to a pattern. Experiment with the preview!

### Brightness

Slide to make the image lighter (↗) or darker (↙).

**Use when:** Image is too dark/washed out in the preview.

### Contrast

Slide to increase (↗) or decrease (↙) contrast between light and dark areas.

**Use when:** Image looks flat or too harsh.

### Saturation

Slide to increase (↗) colour vibrancy or decrease (↙) for muted tones.

**Use when:** Colours look wrong or boring.

### Smoothing

Reduces image noise before conversion (useful for photos).

| Option | Effect |
|--------|--------|
| **Off** | No smoothing (keep sharp edges) |
| **Median** | Removes small noise spots |
| **Gaussian** | Blurs slightly (smooths jagged edges) |

**Use when:** Photo has lots of texture/grain.

### Background Removal

Click **Enable background removal** to:

1. **Pick a colour** from the image (click on the background area you want to remove)
2. **Adjust tolerance** (0–100) — Higher = more similar colours removed
3. The preview updates to show what will become empty fabric

**Use when:** You want to stitch on a specific background colour (e.g., a logo on white background).

## Step 4: Choose Dithering

Dithering blends colours by mixing two threads in adjacent stitches, creating gradients and smoother transitions.

| Setting | What It Does | When to Use |
|---------|--------------|------------|
| **Off** | Solid colours only | Simple graphics, logos, blocks of colour |
| **Weak** | Minimal dithering | Subtle gradients |
| **Balanced** | Moderate blending | Most photos (default) |
| **Strong** | Heavy dithering (may add stitches) | Detailed photos, gradients |

**Tip:** Start with **Balanced** and adjust based on preview.

The preview updates in real-time — you'll see the pattern change as you adjust this slider.

## Step 5: Preview Your Pattern

The **low-resolution preview** shows approximately what your final pattern will look like:

- **Green grid** = Chart grid overlay
- **Coloured stitches** = Your pattern
- **Real size reference** = How many inches/cm the finished pattern will be (at different fabric counts)

### Pattern Size

At the bottom of the preview, you'll see:

```
100 × 100 stitches
At 14-count fabric: 7.1 × 7.1 inches
At 18-count fabric: 5.6 × 5.6 inches
```

> **Fabric count?** That's the number of stitches per inch of fabric. 14-count is standard. See [Fabric Counts Explained](#fabric-counts-explained) below.

### Satisfied?

Click **Finalise pattern** to continue to the full editor.

**Not happy?** Go back and adjust settings, then preview again.

## Step 6: Your Pattern is Ready!

You're now in the **Pattern Creator's full editor** where you can:

- **Paint individual stitches** — Click to change a stitch colour
- **Fill regions** — Use the bucket tool (flood fill)
- **Add backstitches** — Draw outlines and details
- **Place half-stitches** — Stitch fractions for smoother details
- **Adjust colours** — Swap threads, remove unused colours
- **Export** — Save as PDF, PNG, JSON, or share
- **Track** — Open in the Stitch Tracker to start stitching

See **Editing Your Pattern** section below for details.

## Editing Your Pattern

### Main Editor Tabs

| Tab | What It Contains |
|-----|------------------|
| **Pattern** | The editable chart, colour palette, and brush tools |
| **Legend** | Thread list with counts, Anchor equivalents, and costs |
| **Materials** | Skein calculator, stash status, cost summary |
| **Preview** | Realistic canvas mockup (hoop, frame, etc.) |
| **Export** | Download options (PDF, PNG, JSON, ZIP, etc.) |

### Painting & Editing

#### Brush Tools

Located in the toolbar:

- **Paint Brush** — Click to paint individual stitches
- **Fill Bucket** — Click to fill a region with one colour
- **Eraser** — Click to remove stitches (turn to background)
- **Magic Wand** — Click a stitch to select all matching stitches; refine in the side panel
- **Lasso** — Draw to select a freeform region

#### Half-Stitches & Backstitches

- **Half-Stitch Button** — Switches to half-stitch mode (quarter, half, three-quarter in all quadrants)
- **Backstitch Button** — Switches to backstitch mode (draw lines)

#### Selection & Undo

- **Ctrl+Z** — Undo last action
- **Ctrl+Y** — Redo
- **Ctrl+A** — Select all stitches
- Full undo history (you can go back many steps)

### Adjusting Colours

#### Palette Swap

To replace one colour with another across the **entire pattern**:

1. Right-click a stitch of the colour you want to replace
2. Choose **Replace this colour...**
3. Select a new colour from the picker
4. All stitches of the old colour are replaced

Or use the **Replace tool** in the toolbar (swap icon) and click any stitch.

#### Remove Unused Colours

To clean up colours with very few stitches:

1. Look at the **palette panel** on the right
2. If a colour has 0 stitches (no longer used), it shows a faint **X button**
3. Click the X to remove it, or click the **Remove unused (N)** button at the top to remove all at once

### Split-Pane View

To see the editable chart and realistic preview side-by-side:

1. Click the **Split Pane** button (two rectangles icon)
2. Drag the divider to resize
3. Paint stitches on the left; see the result on the right in real-time

## Materials & Thread Info

### Legend Tab

Shows all threads in your pattern:

| Column | Info |
|--------|------|
| **Thread** | DMC number and colour name |
| **Stitches** | How many stitches use this thread |
| **Skeins** | How many skeins you'll need (based on fabric count) |
| **Anchor Equiv** | Equivalent Anchor thread (if different from DMC) |
| **Cost** | Price per skein × skeins needed |

### Materials Tab

**Thread Inventory:**
- Shows which threads you own (from your Stash)
- Shows threads you need to buy
- If a thread is in your stash, it's marked as ✓ owned

**Skein Calculator:**
- Adjust fabric count, stitch type (full, half, backstitch), strand count
- See estimated skein requirements update in real-time
- Cost summary

**Shopping List:**
- Copy a formatted list of threads you need
- Useful for online shopping or store visits

## Exporting Your Pattern

### Quick Export Options

**Open in Stitch Tracker**
- Launches the pattern directly in the Stitch Tracker (no file download needed)
- Start tracking your progress immediately

**Download PDF Chart**
- Multi-page pattern-keeper compatible chart
- Includes thread legend, finished size, cost summary
- Ready to print and stitch
- Choose between colour symbols, image symbols, or black-and-white

**Download PNG Image**
- Full-resolution screenshot of the pattern
- Choose full resolution or A4 page layout
- Good for digital reference on tablets

**Download JSON Project**
- Complete project file (save for later editing)
- Includes pattern, progress (if tracking), session history
- Reload anytime to continue editing

**Download ZIP Bundle**
- All formats in one archive:
  - PDF chart
  - PNG image
  - JSON project
  - OXS file (Pattern Keeper format)
  - Manifest

**Share via URL**
- Compressed pattern encoded into a shareable link
- Opens directly in the Stitch Tracker on any device
- No file transfer needed
- Useful for collaboration

See **[Export Formats Explained](Export-Formats.md)** for detailed info on each format.

## Saving Your Work

Your pattern is **automatically saved** to the app's local storage. You don't need to manually save.

**Your project appears in the Home Screen's Projects list**, where you can:
- See progress (if tracking)
- Edit it again later
- Track progress in the Stitch Tracker
- Delete it (with confirmation)

> **Backup:** Go to Home → Gear icon → **Export all data** to save a backup of all projects. See **[Backup & Restore](Backup-Restore.md)**.

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
3. Back in the Creator, enable **Stash-only mode** to restrict colours to threads you own
4. Generate patterns that use only your existing threads

See **[Stash Manager Guide](Stash-Manager-Guide.md)** for details.

### Learn Advanced Techniques

- **[Advanced Pattern Editing](Advanced-Pattern-Editing.md)** — Magic Wand, Lasso, blends, selection masks
- **[Thread Blends & Colour Matching](Thread-Blends-Colour-Matching.md)** — How blends work and why the app suggests them
- **[Export Formats Explained](Export-Formats.md)** — When to use each export option

---

**Last Updated:** May 2026  
**Questions?** Press `?` in the app for in-app help.

