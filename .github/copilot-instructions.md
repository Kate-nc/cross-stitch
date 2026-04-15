# Copilot Instructions — Cross Stitch Pattern Generator

## Project Overview

A fully client-side Progressive Web App (PWA) for creating, managing, and tracking cross-stitch patterns. No build step is required to run the application — open an HTML file in a browser. The only build step in this project is bundling the `creator/` module (see below).

## Architecture

The project has **three main HTML entry points**, each a self-contained page:

| File | Purpose |
|---|---|
| `index.html` | Pattern Creator — convert images to cross-stitch patterns, edit them, and export |
| `stitch.html` | Stitch Tracker — track stitching progress on an existing pattern |
| `manager.html` | Stash Manager — manage DMC thread inventory and a personal pattern library |

All three pages share a common set of scripts loaded via `<script>` tags (see `index.html` for the canonical load order):

```
constants.js → dmc-data.js → colour-utils.js → helpers.js → import-formats.js
→ components.js → header.js → modals.js → threadCalc.js → project-storage.js
→ stash-bridge.js → backup-restore.js → home-screen.js → palette-swap.js
→ creator/bundle.js
```

React 18 and Babel Standalone are loaded from CDN. All JSX is compiled in-browser at runtime — there is no pre-compilation step for the main app files.

### Creator Module (`creator/`)

The Pattern Creator's logic lives in individual files inside `creator/`. These are **concatenated** (not transpiled) into `creator/bundle.js` using a custom build script:

```bash
node build-creator-bundle.js
```

**Always regenerate `creator/bundle.js` after editing any file in `creator/`.** The source files and their required concatenation order are defined in `build-creator-bundle.js`. Never edit `creator/bundle.js` directly.

## Key Files and Responsibilities

| File | Role |
|---|---|
| `constants.js` | Fabric counts, skein length (`SKEIN_LENGTH_IN = 315` inches), default price (`DEFAULT_SKEIN_PRICE = 0.95` GBP), canvas checkerboard size (`CK = 4`) |
| `dmc-data.js` | Full DMC palette — array `DMC` of `{id, name, rgb, lab}` objects |
| `colour-utils.js` | k-means quantisation, Floyd-Steinberg dithering, CIE ΔE colour distance, colour matching (`findSolid`, `findBest`), image filters |
| `helpers.js` | Utility functions: `fmtTime`, `fmtTimeL`, `calcDifficulty`, `skeinEst`, `gridCoord`, IndexedDB helpers (`getDB`, `saveProjectToDB`, `loadProjectFromDB`) |
| `project-storage.js` | Multi-project IndexedDB storage — `ProjectStorage` singleton with `save`, `get`, `listProjects`, `delete`, `getActiveProject` |
| `stash-bridge.js` | Cross-database bridge — reads/writes the Stash Manager's `stitch_manager_db` IndexedDB from any page |
| `tracker-app.js` | React component tree for the Stitch Tracker |
| `manager-app.js` | React component tree for the Stash Manager |
| `import-formats.js` | Import parsers for `.oxs` (KG-Chart XML), `.json`, image files, and `.pdf` patterns |
| `threadCalc.js` | `stitchesToSkeins()` — calculates skeins needed from stitch count, fabric count, strand count, and waste factor |
| `embroidery.js` | Image processing pipeline (bilateral filter, Canny edge detection, saliency map) used during pattern generation |
| `backup-restore.js` | Full-database export/import for backup and restore |
| `palette-swap.js` | Palette swap UI and logic |
| `modals.js` | Shared modal components |
| `components.js` | Shared React UI components |
| `header.js` | Shared navigation header component |

## Data Storage

There are **three separate IndexedDB databases**:

| Database | Version | Object Stores | Used By |
|---|---|---|---|
| `CrossStitchDB` | 3 | `projects`, `project_meta`, `stats_summaries` | Creator, Tracker (generated patterns & progress) |
| `stitch_manager_db` | 1 | `manager_state` | Stash Manager (thread inventory, pattern library) |

### `CrossStitchDB` details
- `projects` store: keyed by project ID (e.g. `"proj_1712345678"`) or `"auto_save"` for the legacy single-project key
- `project_meta` store: lightweight metadata mirrors of all `proj_*` entries
- Active project pointer stored in `localStorage` under key `"crossstitch_active_project"`

### `stitch_manager_db` details
- `manager_state` store: all data under named keys — `"threads"` (inventory object) and `"patterns"` (pattern library array)

## Project JSON Format

A saved project object (version 8) has this shape:

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
  "pattern": [ { "id": "310", "type": "solid", "rgb": [0, 0, 0] } ],
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

- `pattern` is a flat array of length `w * h`; each cell is `{ id, type, rgb }` for a solid or `{ id: "310+550", type: "blend", ... }` for a blend, or `{ id: "__skip__" }` / `{ id: "__empty__" }` for background/empty cells
- `done` is `null` (no tracking started) or a flat `Int8Array`/plain array of same length as `pattern`, with `1` = done, `0` = not done
- Blend IDs are two DMC IDs joined with `+` (e.g. `"310+550"`)

## Running and Testing

```bash
# Install dependencies (only needed for tests)
npm install

# Run Jest unit tests
npm test

# Serve locally (optional — you can also just open index.html directly)
node serve.js          # serves on port 8000
node serve.js 3000     # or specify a port
```

### Test Suite (`tests/`)

Tests use **Jest** with CommonJS `require`. Test files extract functions from source files by reading the raw JS with `fs.readFileSync` and calling `eval()` — there is no module system to import from. When adding tests, follow the same pattern.

Key test files:
- `helpers.test.js` — `fmtTimeL` formatting
- `threadCalc.test.js` — skein estimation
- `dE.test.js`, `rgbToLab.test.js` — colour maths
- `embroidery-image-processing.test.js` — image filters (extracts functions from `embroidery.js` using regex + eval)
- `test_frontend.py`, `test_frontend_drag.py`, `test_modals.py` — Playwright/Selenium Python tests (not run by `npm test`)

## Code Style Conventions

- **Minified-style JS** is common in older/utility files (e.g. `constants.js`, `helpers.js`): terse variable names, no whitespace, everything on one line. Match the style of the file you are editing.
- **Modern React style** (hooks, function components, JSX) is used in `tracker-app.js`, `manager-app.js`, and all `creator/` files. These files use destructured React hooks at the top.
- **No module system**: all files use plain `<script>` globals. Do not use `import`/`export` or `require()` in files that run in the browser.
- **Creator files** (`creator/*.js`) expose their exports via `window.*` assignments (e.g. `window.useCreatorState = function useCreatorState() {...}`).
- Use British English spelling in user-facing strings (e.g. "colour" not "color", "organiser" not "organizer").
- Default skein price is in GBP (£0.95).

## Common Pitfalls

1. **Never edit `creator/bundle.js` directly** — regenerate it with `node build-creator-bundle.js` after modifying any `creator/*.js` file.
2. **No build step for non-creator files** — changes to `helpers.js`, `tracker-app.js`, etc. take effect immediately in the browser.
3. **IndexedDB is browser-only** — unit tests that touch storage must mock it or skip those code paths.
4. **React and Babel are CDN globals** — do not add them as npm dependencies; they are available as `window.React`, `window.ReactDOM`, `window.Babel`.
5. **`creator/bundle.js` is a pre-built concatenation** — after running the build script, verify the output is correct before committing.
6. **`pako` is required at startup** (URL pattern compression) — it must remain in the `<head>` before any Babel scripts.

## Errors and Workarounds Encountered

- **Local file access restrictions**: Some browsers block `fetch()` and IndexedDB when opening HTML files directly from the filesystem (`file://`). Use `node serve.js` or `python -m http.server` to serve the files over HTTP during development.
- **Jest + browser globals**: Test files that exercise browser-only code (IndexedDB, `navigator`, `canvas`) must be excluded or mock those APIs. Existing tests avoid this by extracting pure functions with regex+eval rather than importing the module.
