# Cross Stitch Pattern Generator

A feature-rich, client-side web application for creating, managing, and tracking cross-stitch patterns directly in your browser. No installation or build step required — just open and stitch.

## Features

### Pattern Creator (`index.html`)
- **Image Conversion** — Upload any JPG or PNG and automatically generate a cross-stitch pattern using k-means colour quantisation and optional Floyd-Steinberg dithering.
- **Customisable Dimensions** — Set width and height in stitches (10–300), with optional aspect ratio lock.
- **Palette Control** — Configure maximum skein count, minimum stitches per colour, and orphan stitch removal to keep your pattern clean.
- **Colour Blending** — Automatically suggests two-thread blends when a blend produces a significantly better colour match than any single DMC thread.
- **Image Adjustments** — Tweak brightness, contrast, and saturation, plus median or Gaussian smoothing for noise reduction.
- **Background Removal** — Skip a selected background colour with configurable tolerance.
- **Pattern Editor** — Fine-tune the generated pattern using backstitch, paint, and flood-fill tools, with full undo support.
- **Live Preview** — See a quick low-resolution preview as you adjust settings, before committing to a full generation.

### Stitch Tracker (`stitch.html`)
- **Interactive Tracking** — Click or drag to mark stitches as done, with undo support.
- **Import Patterns** — Load existing patterns from `.oxs` (KG-Chart / Pattern Keeper XML), `.json`, or pixel art images (`.png`, `.jpg`, etc.).
- **Multiple Views** — Symbol, colour+symbol, and highlight modes to focus on one colour at a time.
- **Navigate Mode** — Place a guide crosshair on the canvas and add parking markers per colour.
- **Session Timer** — Records stitching sessions and estimates time to completion based on actual stitching speed.
- **Progress Bar** — Per-colour and overall progress displayed at a glance.

### Project & Export
- **Save / Load** — Save your entire project (pattern, progress, parking markers, thread inventory, session history) as a `.json` file and reload it at any time.
- **URL Sharing** — Export a compressed link to open a pattern directly in the Stitch Tracker — no file needed.
- **PDF Export** — Generate a multi-page chart PDF with a thread legend, or a separate cover sheet with pattern summary, finished size, cost estimate, thread list with owned/to-buy status, and a notes section.
- **PNG Chart** — Preview and export the pattern as a PNG, with optional A4 page mode.

### Thread Organiser
- **DMC Inventory** — Mark each skein as owned or to-buy across both the Pattern Creator and Stitch Tracker.
- **Shopping List** — Copy a formatted to-buy list or full thread list to your clipboard.
- **Skein Estimation** — Calculates skeins needed per colour based on stitch count and fabric count (assumes 2 strands, 8 m per skein).
- **Cost Estimate** — Configurable price per skein with a running total and still-to-buy cost.

### Project Info
- **Finished Size** — Shows completed dimensions across all supported fabric counts (14–28 ct).
- **Difficulty Rating** — Beginner to Expert based on colour count, blend count, and total stitches.
- **Time Estimate** — Configurable stitching speed (stitches/hr) with remaining time estimate.

## Technologies

- [React 18](https://react.dev/) via CDN (no build step)
- [Babel Standalone](https://babeljs.io/docs/babel-standalone) for in-browser JSX compilation
- [jsPDF](https://github.com/parallax/jsPDF) for PDF generation
- [pako](https://github.com/nodeca/pako) for URL pattern compression

## Usage

No installation required. This is a fully client-side application.

1. Clone or download the repository.
2. Open `index.html` in a modern browser to create a new pattern.
3. Open `stitch.html` to track progress on an existing project.

```bash
git clone https://github.com/Kate-nc/cross-stitch.git
cd cross-stitch
open index.html
```

> **Note:** Some browsers restrict local file access. If the app doesn't load correctly, serve it with a simple local server:
> ```bash
> npx serve .
> # or
> python -m http.server
> ```

## Saving & Loading

Click **Save (.json)** in the Export tab to save your project, including:

- Generated pattern and palette
- Stitching progress
- Parking markers
- Thread organiser state (owned/to-buy)
- Session history and total time

To resume, click **Open** and select your saved `.json` file. Projects can also be opened directly in the Stitch Tracker.

## Running Tests

The project uses [Jest](https://jestjs.io/) for unit tests covering colour distance calculation and time formatting utilities.

```bash
npm install
npm test
```

## File Structure

```
├── index.html        # Pattern Creator app
├── stitch.html       # Stitch Tracker app
├── styles.css        # Shared styles
├── constants.js      # Fabric counts, skein length, defaults
├── dmc-data.js       # Full DMC thread palette with Lab colour values
├── colour-utils.js   # Quantisation, dithering, colour matching, filters
├── helpers.js        # Utility functions (formatting, grid, difficulty)
├── components.js     # Shared React UI components
├── header.js         # Shared navigation header
├── modals.js         # Shared modal components
├── creator-app.js    # React logic for Pattern Creator
├── tracker-app.js    # React logic for Stitch Tracker
├── import-formats.js # Import parsing logic
└── tests/            # Jest unit tests
```
