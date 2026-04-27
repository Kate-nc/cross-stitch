# Cross Stitch Studio

A feature-rich, fully client-side web application suite for creating, managing, and tracking cross-stitch patterns directly in your browser. No installation, backend, or build step required—just open and start stitching.

## The Suite

The application is split into three integrated tools accessible from a unified Home Screen at [`home.html`](home.html). The per-tool pages still work as direct entry points if you have a saved project loaded — see *Direct entry* below.

### Pattern Creator (`index.html?mode=design`)
Turn your images into stitchable art or design patterns from scratch.
- **Intelligent Image Conversion:** Upload JPG or PNG files and generate patterns using k-means color quantization and optional Floyd-Steinberg dithering.
- **Customizable Canvas:** Set width and height (up to 300x300 stitches), with optional aspect ratio locking.
- **Advanced Palette Control:** Set maximum skein limits, minimum stitches per color, and let the app automatically remove orphan stitches.
- **Smart Color Blending:** Automatically suggests two-thread blends when they produce a significantly better color match than a single DMC thread.
- **Image Pre-Processing:** Adjust brightness, contrast, and saturation. Apply median or Gaussian smoothing to reduce noise before generation.
- **Background Removal:** Pick a background color to skip with configurable tolerance.
- **Rich Pattern Editor:** Fine-tune the result using a suite of tools including paint, flood-fill, backstitch lines, and **half stitches**. Full undo/redo history is supported.
- **Live Preview:** Instantly see a low-resolution preview as you adjust settings before committing to a full generation.

### Stitch Tracker (`stitch.html`)
Your digital companion while stitching, designed to replace printed charts.
- **Interactive Tracking:** Click, tap, or drag to mark stitches (including full and half stitches) as completed. Supports full undo history.
- **Universal Import:** Load projects from existing `.oxs` (KG-Chart / Pattern Keeper XML) files, saved `.json` projects, or pixel art images (`.png`, `.jpg`).
- **Flexible Views:** Toggle between Symbol only, Color + Symbol, or Highlight mode to focus on a single active color.
- **Navigation & Parking:** Place a guide crosshair on the canvas and drop parking markers per color.
- **Session & Time Management:** Built-in session timer records your stitching sessions and estimates completion time based on your actual stitching speed.
- **Comprehensive Progress:** View overall progress, per-color completion percentages, and detailed stitch counts.

### Stash Manager (`manager.html`)
Keep track of your thread inventory and plan your shopping.
- **DMC Inventory Tracking:** Mark skeins as 'owned' or 'to buy'. Your stash status is synced across the Creator and Tracker.
- **Shopping Lists:** Easily copy a formatted "to-buy" list or your full thread requirements to the clipboard.
- **Advanced Skein Calculator:** Estimates thread usage for both single colors and blends based on stitch counts, fabric count (assumes 2 strands, 8m per skein), and waste factors. Includes a standalone manual calculator and batch mode for entire patterns.
- **Cost Estimation:** Set a price per skein to keep a running total of your stash value and remaining cost.

## Export & Sharing

- **Save / Load (.json):** Save your entire project—including the pattern, stitching progress, parking markers, thread inventory, and session history—as a `.json` file. Reload it at any time.
- **URL Sharing:** Generate a compressed link to open a pattern directly in the Stitch Tracker without needing to share a file.
- **PDF Export:** Generate high-quality, multi-page chart PDFs using pure vector primitives for crisp symbols. Includes a thread legend, a cover sheet with pattern summary, finished sizes, cost estimates, stash status, and a notes section.
- **PNG Chart:** Export the pattern as a high-resolution PNG image, with an optional A4 page layout mode.

## Technical Details & Architecture

This project is a testament to what modern browsers can achieve without a backend.
- **React 18:** Loaded via CDN (no Node.js build step required).
- **Babel Standalone:** Compiles JSX in the browser on the fly. Compiled output is cached in `localStorage` for fast subsequent loads.
- **jsPDF & PDF.js:** Handles complex PDF generation and vector extraction natively.
- **Pako:** Handles compression for URL-based pattern sharing.
- **Web Workers:** Heavy processing tasks (like image analysis and pattern generation) are offloaded to Web Workers (`analysis-worker.js`, `generate-worker.js`) to keep the UI responsive.
- **Storage:** Project data and thread stash states are securely stored locally using IndexedDB (`project-storage.js`, `stash-bridge.js`) and `localStorage`.

## Usage & Installation

Because it's fully client-side, you don't need a build environment to run it.

1. Clone or download the repository.
2. Open `home.html` in any modern web browser to access the unified Home Screen.

```bash
git clone https://github.com/Kate-nc/cross-stitch.git
cd cross-stitch
# Just open the file:
open home.html
```

### Direct entry

You can also open one of the per-tool pages directly:

- `index.html` — Pattern Creator
- `stitch.html` — Stitch Tracker
- `manager.html` — Stash Manager

If there's no active project the tool pages redirect to `home.html` so you always pick a project first; PWA shortcuts and bookmarks therefore remain valid.

> **Note:** Browsers enforce strict CORS policies for `file://` protocols, which may block Web Workers or local storage. If the app doesn't load correctly, serve it using a simple local server:
> ```bash
> # Using Node.js
> npm run start
> # Or using Python
> python -m http.server 8000
> ```

### Offline Use (PWA)
The application functions as a Progressive Web App (PWA). Once loaded, a Service Worker (`sw.js`) caches all assets, allowing the app to work entirely offline.
- **Desktop:** Click the install icon in the URL bar (Chrome/Edge).
- **Mobile (iOS):** Tap Share → "Add to Home Screen".
- **Mobile (Android):** Open browser menu → "Install" or "Add to Home Screen".

## Development & Testing

The project uses [Jest](https://jestjs.io/) for unit tests (e.g., color distance calculations, time formatting) and [Playwright](https://playwright.dev/) for end-to-end browser automation testing.

```bash
# Install dependencies (only needed for testing)
npm install

# Run Jest unit tests
npm test

# Generate test coverage report
npm test -- --coverage

# Install Playwright browsers (first time only)
npx playwright install chromium

# Run end-to-end UI tests
npm run test:e2e
```

## Key File Structure

```
├── home.html           # Unified Home Screen (canonical landing)
├── home-app.js         # React app for the Home Screen
├── index.html          # Pattern Creator (direct entry)
├── stitch.html         # Stitch Tracker (direct entry)
├── manager.html        # Stash Manager (direct entry)
├── styles.css          # Shared global styles
├── constants.js        # Configs: fabric counts, skein length, defaults
├── dmc-data.js         # Full DMC thread palette (ID, Name, RGB, Lab values)
├── colour-utils.js     # Core logic: Quantization, dithering, color matching
├── threadCalc.js       # Core logic: Skein estimation calculations
├── helpers.js          # Shared utilities (formatting, grid math)
├── components.js       # Shared React UI components (synchronous load)
├── header.js           # Shared navigation header component
├── modals.js           # Shared modal dialogs
├── creator-app.js      # React logic for Pattern Creator (loaded via Babel)
├── tracker-app.js      # React logic for Stitch Tracker (loaded via Babel)
├── manager-app.js      # React logic for Stash Manager (loaded via Babel)
├── import-formats.js   # Parsing logic for .oxs, .json, and images
├── project-storage.js  # IndexedDB wrapper for project data
├── stash-bridge.js     # IndexedDB wrapper for thread inventory
├── sw.js               # Service Worker for offline PWA support
└── tests/              # Jest unit test suites
```
