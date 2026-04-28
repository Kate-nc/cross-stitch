# Cross Stitch Studio

A fully client-side web application suite for creating, managing, and tracking cross-stitch patterns. No backend or installation required — open `home.html` in any modern browser and start stitching.

---

## The Suite

Three integrated tools are accessible from a unified Home Screen ([`home.html`](home.html)). Each tool can also be opened directly as a standalone page.

### Pattern Creator ([`index.html`](index.html))

Convert images into stitchable charts, or design patterns from scratch.

**Image conversion**
- Upload JPG or PNG images and generate a pattern using k-means colour quantisation.
- Optional Floyd-Steinberg dithering with four strength levels (off / weak / balanced / strong).
- Adjust brightness, contrast, and saturation. Apply median or Gaussian smoothing before generation to reduce image noise.
- Background removal: pick a colour from the source image to treat as empty fabric, with configurable tolerance.
- Live low-resolution preview updates as you change settings, before committing to a full generation.

**Palette controls**
- Set the maximum number of colours (2–80).
- Set a minimum stitch count per colour — colours used fewer times are automatically dropped.
- Automatic orphan-stitch removal with four strength levels.
- Smart two-thread blend detection: the generator suggests blends where a pair of DMC threads achieves a significantly better CIEDE2000 colour match than any single thread.
- Stash-only mode: restricts colour matching to threads you already own.

**Pattern editor**
- Paint individual stitches, flood-fill regions, draw backstitch lines, and place half-stitches (quarter, half, three-quarter in all quadrants).
- Magic Wand tool selects a colour region by clicking; refine the selection via a side panel.
- Lasso tool for freeform selection.
- Full undo / redo history (Ctrl+Z / Ctrl+Y).
- Palette swap: replace one thread with another across the whole pattern.
- Realistic canvas preview with a configurable fabric colour and mockup types (hoop, frame).
- Split-pane view: show the realistic preview and the editable chart side by side.

**Materials & thread management**
- Materials Hub: per-colour stitch counts, skein estimates, cost totals, stash status, and Anchor conversion.
- Substitute from stash: find the closest owned thread for any colour in the pattern.
- Bulk add threads to stash from inside the Creator.
- Designer branding section: embed your name, logo, copyright, and contact details in exported PDFs.

---

### Stitch Tracker ([`stitch.html`](stitch.html))

A digital replacement for a printed chart while you stitch.

- **Tracking:** Click, tap, or drag to mark full stitches and half-stitches as done. Full undo history.
- **Views:** Symbol, Colour + Symbol, or Highlight mode (isolate, outline, tint, or spotlight a single active colour).
- **Navigation:** Place a guide crosshair on the canvas. In navigate mode, clicking sets per-colour parking markers.
- **Colours drawer:** Per-colour progress percentages and stitch counts. Click a colour to highlight only those stitches.
- **Session timer:** Records the start/end of each stitching session and estimates your completion date based on actual stitching speed.
- **Import:** Load projects from `.oxs` (KG-Chart / Pattern Keeper XML), `.json` project files, pixel-art images (`.png`, `.jpg`), or extracted PDF patterns.

---

### Stash Manager ([`manager.html`](manager.html))

Thread inventory management and shopping planning.

- **Inventory:** Mark DMC and Anchor skeins as owned or to-buy. Stash status is reflected in the Creator and Tracker in real time via a cross-database bridge.
- **Skein calculator:** Estimates thread usage for single colours and blends from stitch count, fabric count, strand count, and waste factor. Includes a standalone manual calculator and a batch mode for entire patterns.
- **Shopping list:** Copy a formatted to-buy list or full requirements to the clipboard.
- **Cost tracking:** Set a price per skein for a running total of stash value and outstanding cost.
- **Thread catalogue:** Browse the full DMC and Anchor palettes. Bulk-add preset starter kits (DMC Essentials, Anchor Starter) with one click.
- **Pattern library:** Store and browse the patterns you own, separate from the projects you are actively stitching.

---

## Home Screen ([`home.html`](home.html))

The canonical landing page and project hub.

- **Projects tab:** Active project card (progress %, last updated), full project list with per-row Track and Edit actions, and multi-select bulk delete.
- **Create new tab:** Start from an image or open a blank canvas.
- **Stash tab:** Thread ownership summary and a link to the Stash Manager.
- **Stats tab:** Link to the Stats dashboard.
- Time-aware greeting, project initials avatar, and relative timestamps.
- Live refresh on `cs:projectsChanged`, `cs:backupRestored`, `cs:stashChanged`, and `visibilitychange` events — data stays current when another tab makes changes.

---

## Export & Sharing

| Format | Description |
|--------|-------------|
| `.json` | Full project save — pattern, progress, session history, parking markers, thread ownership. Reload at any time. |
| `.zip` bundle | Single archive containing the PDF chart, `.oxs`, PNG image, and `.json`, with a `manifest.json` index. |
| PDF chart | Multi-page, Pattern Keeper-compatible chart. Vector symbols from an embedded `CrossStitchSymbols.ttf` font. Includes a cover sheet, thread legend, finished-size table, cost and stash summary, and optional designer branding. Black-and-white and colour chart modes; configurable page sizes (A4 / Letter / auto) and grid density. |
| PNG image | Full-resolution PNG of the pattern grid. Optional A4 page layout mode. |
| URL share | Pako-compressed pattern encoded into a URL query string — opens directly in the Stitch Tracker with no file transfer. |
| `.oxs` | KG-Chart / Pattern Keeper XML export for interoperability with other cross-stitch software. |
| `.csync` | Compressed cross-device sync file. Export from one device and import on another via any cloud drive or manual file transfer (no account required). |

---

## Stats & Insights

A dedicated Stats page aggregates data across all projects and the stash.

- Lifetime stitch count, active project count, and finished-project count.
- Weekly streak tracker and recent stitching pace.
- SABLE Index (Stash Acquired Beyond Life Expectancy) — how many years of stitching your current stash represents.
- Colour-family breakdown and DMC palette coverage percentage.
- "Ready to start" counter — projects whose required threads are all owned.
- "Use what you have" and "Buying impact" purchasing advisors.
- Duplicate-risk warnings and oldest WIP detector.
- Designer leaderboard, brand-alignment chart, difficulty vs. completion scatter plot.
- AI-style weekly summary text that compares this week's stitching against last week.
- All visible sections are individually toggleable via the preferences panel.

---

## Thread Data

- **DMC:** Full stranded-cotton catalogue — 500 colours with CIE L\*a\*b\* values pre-computed for fast CIEDE2000 matching.
- **Anchor:** Full Anchor Stranded Cotton catalogue with reconciled RGB values sourced from the official colour card, Stitchtastic, Cross-Stitched.com, and sibalman/thread-converter. Contested colours are flagged.
- **DMC ↔ Anchor conversions:** Bidirectional conversion table with confidence labels (`official`, `reconciled`, `single-source`). Both directions are stored independently so asymmetric mappings are preserved.
- **Fabric counts:** 14, 16, 18, 20, 22 count Aida and 28 count evenweave (over two).

---

## Architecture

This project demonstrates what modern browsers can do without a build pipeline or server.

### Runtime stack

| Component | Detail |
|-----------|--------|
| **React 18** | Loaded from CDN. No npm build step for main app files. |
| **Babel Standalone** | Compiles JSX in-browser at runtime. Compiled output is cached in `localStorage` for fast subsequent loads. |
| **pdf-lib** | Pure-JS PDF generation. Produces Pattern Keeper-compatible output. |
| **PDF.js** | Extracts pattern data from imported PDF files. |
| **Pako** | Deflate/inflate compression used for URL sharing and `.csync` files. |
| **JSZip** | Packages the `.zip` bundle export (loaded lazily). |

### Web Workers

Two dedicated workers keep the UI responsive during heavy computation:

- **`analysis-worker.js`** — image analysis: bilateral filtering, Canny edge detection, saliency mapping.
- **`generate-worker.js`** — pattern generation pipeline: colour quantisation, dithering, orphan removal.

### Storage

| Database | Object stores | Used by |
|----------|--------------|---------|
| `CrossStitchDB` (v3) | `projects`, `project_meta`, `stats_summaries` | Creator, Tracker — patterns, progress, stats |
| `stitch_manager_db` (v1) | `manager_state` | Stash Manager — thread inventory, pattern library |

`localStorage` holds lightweight pointers: the active project ID (`crossstitch_active_project`), user preferences (`cs_pref_*`), and per-project view state (`cs_pview_*`).

### Creator module (`creator/`)

The Pattern Creator's logic is split across individual source files inside `creator/`. They are **concatenated** (not transpiled) into `creator/bundle.js` by a custom build script:

```bash
node build-creator-bundle.js
```

**Always regenerate `creator/bundle.js` after editing any file in `creator/`.** Never edit `creator/bundle.js` directly.

### Cross-page communication

Pages communicate via `CustomEvent` on `window`:

| Event | Purpose |
|-------|---------|
| `cs:projectsChanged` | A project was saved, deleted, or renamed |
| `cs:backupRestored` | A backup was imported |
| `cs:stashChanged` | Thread inventory changed |
| `cs:patternsChanged` | Pattern library changed |
| `cs:prefsChanged` | A user preference was updated |
| `cs:openHelp` | Open the Help drawer |
| `cs:openShortcuts` | Open the keyboard shortcuts panel |

---

## Application-wide Features

### Command Palette

Press **Ctrl+K** (or **Cmd+K** on Mac) from any page to open the command palette. Supports fuzzy search across all available actions: navigation, project management, tool activation, help, and preferences.

### Help Drawer

Press **?** from any page to open the contextual Help drawer. Contains topic-based help, a keyboard shortcuts reference, and getting-started hints. Slides in from the right; press Escape or click outside to dismiss.

### Keyboard Shortcuts

Each tool registers its own shortcuts. Common shortcuts include:

| Key | Action |
|-----|--------|
| `?` | Toggle Help drawer |
| `Ctrl+K` | Command palette |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `H` | Hand (pan) tool |
| `W` | Magic Wand tool |
| `L` | Lasso tool |
| `[` / `]` | Previous / next colour |

### Preferences

A 12-category preferences panel (accessible from the header on every page) persists all settings via `window.UserPrefs`. Categories include:

- Pattern Creator generation defaults (palette size, dithering, orphan removal, fabric count)
- Stitch Tracker view and highlight defaults
- PDF export presets
- Stash and cost display options
- Appearance (theme, accent colour, font size)
- Accessibility options

### Coaching

First-use coachmarks guide new users through key actions (first pattern generation, first stitch). Each coachmark is shown once and then permanently dismissed via `UserPrefs`. The coaching sequence can be reset from Preferences.

### Onboarding Wizard

A multi-step wizard walks first-time users through the main workflow the first time they open the app.

---

## Progressive Web App

The Service Worker (`sw.js`) pre-caches all assets on first load. The app then works entirely offline.

**Install instructions:**
- **Desktop (Chrome / Edge):** Click the install icon in the address bar.
- **iOS Safari:** Tap the Share button, then "Add to Home Screen".
- **Android:** Open the browser menu and select "Install" or "Add to Home Screen".

---

## Getting Started

### Open locally

```bash
git clone https://github.com/Kate-nc/cross-stitch.git
cd cross-stitch
open home.html   # macOS
start home.html  # Windows
```

> **Note:** Some browsers block Web Workers and IndexedDB under the `file://` protocol. If the app does not load correctly, use the local server instead.

### Serve locally

```bash
# Node.js (included)
npm run start        # serves on port 8000

# Python
python -m http.server 8000
```

Then open `http://localhost:8000/home.html`.

### Direct entry points

| URL | Tool |
|-----|------|
| `home.html` | Home Screen (start here) |
| `index.html` | Pattern Creator |
| `stitch.html` | Stitch Tracker |
| `manager.html` | Stash Manager |

If there is no active project, the per-tool pages redirect to `home.html` automatically, so bookmarks and PWA shortcuts remain valid.

---

## Development

### Prerequisites

```bash
npm install   # installs Jest, Playwright, and build tooling
```

No build step is needed to run the application. The `npm install` is only required for running tests and the creator bundle build.

### Testing

```bash
# Jest unit tests (recommended: run in-band for deterministic output)
npm test -- --runInBand

# With coverage
npm test -- --coverage

# End-to-end browser tests (Playwright)
npx playwright install chromium   # first time only
npm run test:e2e

# Terminology lint (flags disallowed terms in source files)
npm run lint:terminology

# CSS design-token lint (flags raw hex and removed --ws-* aliases)
npm run lint:css-tokens
```

The test suite contains 100+ Jest test files covering colour maths, skein calculation, image processing, PDF layout, storage, UI component behaviour, and regression cases for fixed bugs.

### Rebuilding the creator bundle

```bash
npm run build:creator
# or equivalently:
node build-creator-bundle.js
```

Run this after editing any file in `creator/`. The source files and their required concatenation order are defined in `build-creator-bundle.js`.

---

## Key File Reference

```
home.html / home-app.js        Home Screen — project hub and landing page
index.html / creator-main.js   Pattern Creator entry point and app mount
stitch.html / tracker-app.js   Stitch Tracker
manager.html / manager-app.js  Stash Manager

styles.css                     Shared Workshop design-token stylesheet
constants.js                   Fabric counts, skein length, price defaults
dmc-data.js                    Full DMC palette (ID, name, RGB, Lab)
anchor-data.js                 Full Anchor palette with reconciled RGB values
thread-conversions.js          Bidirectional DMC ↔ Anchor conversion table
starter-kits.js                Preset thread collections for bulk import

colour-utils.js                k-means quantisation, Floyd-Steinberg dithering,
                               CIEDE2000 distance, colour matching
threadCalc.js                  Skein estimation (stitchesToSkeins)
helpers.js                     Shared utilities: time formatting, grid maths,
                               IndexedDB helpers (getDB, saveProjectToDB, …)
import-formats.js              Parsers for .oxs, .json, image, and PDF imports
embroidery.js                  Image processing pipeline: bilateral filter,
                               Canny edges, saliency map (used by generate-worker)

project-storage.js             Multi-project IndexedDB storage (CrossStitchDB)
stash-bridge.js                Cross-database bridge to stitch_manager_db
backup-restore.js              Full-database export and import
sync-engine.js                 .csync cross-device sync (Pako-compressed)

components.js                  Shared React UI components
header.js                      Shared navigation header
modals.js                      Shared modal dialogs
icons.js                       SVG icon library (window.Icons.name())
toast.js                       Toast notification system
command-palette.js             Global command palette (Ctrl+K)
help-drawer.js                 Help, shortcuts, and getting-started drawer
shortcuts.js                   Keyboard shortcut registration and display
coaching.js                    First-use coachmark system
onboarding-wizard.js           Multi-step onboarding wizard
user-prefs.js                  Persistent user preferences (window.UserPrefs)
apply-prefs.js                 Applies a11y / theme / accent classes on load
preferences-modal.js           12-category preferences panel
palette-swap.js                Palette swap UI and logic

stats-page.js                  Stats dashboard entry point
stats-insights.js              Insights UI layer
insights-engine.js             Pure insight-text generation functions
stats-activity.js              Activity chart components
stats-showcase.js              Showcase / showcase report views

analysis-worker.js             Web Worker: image analysis (bilateral, Canny, saliency)
generate-worker.js             Web Worker: pattern generation pipeline

creator/                       Pattern Creator sub-components (see build-creator-bundle.js)
creator/bundle.js              Concatenated creator bundle — DO NOT edit directly

pdf-export-worker.js           PDF generation worker (pdf-lib, Pattern Keeper-compatible)
creator/pdfChartLayout.js      PDF page layout helpers
creator/pdfExport.js           Main-thread PDF export façade
build-creator-bundle.js        Script that concatenates creator/ into creator/bundle.js
build-symbol-font.js           Script that builds assets/fonts/CrossStitchSymbols.ttf

sw.js                          Service Worker (offline PWA caching)
manifest.json                  PWA manifest

tests/                         Jest unit test suites (100+ files)
tests/e2e/                     Playwright end-to-end tests
```

---

## Project Data Format

A saved project (schema version 8) is a plain JSON object:

```json
{
  "v": 8,
  "id": "proj_1712345678",
  "name": "My Pattern",
  "createdAt": "2024-04-05T12:00:00.000Z",
  "updatedAt": "2024-04-05T12:00:00.000Z",
  "w": 80,
  "h": 80,
  "settings": { "sW": 80, "sH": 80, "fabricCt": 14 },
  "pattern": [ { "id": "310", "type": "solid", "rgb": [0, 0, 0] }, "..." ],
  "bsLines": [],
  "done": null,
  "halfStitches": {},
  "halfDone": {},
  "parkMarkers": [],
  "totalTime": 0,
  "sessions": [],
  "threadOwned": {}
}
```

- `pattern` is a flat array of length `w × h`. Each cell is `{ id, type, rgb }` for a solid colour, `{ id: "310+550", type: "blend", … }` for a two-thread blend, or `{ id: "__skip__" }` / `{ id: "__empty__" }` for background and empty cells.
- `done` is `null` (no tracking started) or a flat array of the same length as `pattern`, where `1` = done and `0` = not done.
- Blend IDs are two DMC IDs joined with `+` (e.g. `"310+550"`).

---

## Contributing

Pull requests are welcome. Before submitting:

1. Run `npm test -- --runInBand` and ensure all tests pass.
2. Run `npm run lint:terminology` and `npm run lint:css-tokens` — both must exit cleanly.
3. If you edited any file in `creator/`, run `node build-creator-bundle.js` and commit the regenerated `creator/bundle.js`.
4. Do not add emoji to user-facing strings. Use the SVG icons in `icons.js` via `window.Icons.name()`. If a suitable icon does not exist, add one to `icons.js` (24×24 viewBox, 1.6 stroke-width, `currentColor`).
5. Use British English spelling in user-visible text (e.g. "colour", "organiser").
6. Use canonical CSS design tokens (`--accent`, `--surface`, `--text-primary`, etc.) — no raw hex values in component CSS.

---

## Licence

ISC
