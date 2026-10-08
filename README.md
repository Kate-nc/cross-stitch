# stitchx

A fully client-side web application suite for creating, managing, and tracking cross-stitch patterns. No backend, account or installation required — open it in any modern browser and start stitching. Your data stays on your device.

---

## The Suite

Three integrated tools sit behind a unified Home page ([`home.html`](home.html)). Each tool can also be opened directly.

### Pattern Creator ([`create.html`](create.html))

Convert images into stitchable charts, or design patterns from scratch.

**Image conversion**
- Start from a JPG, PNG, GIF, WebP or BMP image. Colours are matched to DMC threads with CIEDE2000 colour distance.
- Dithering: Off, Atkinson (Subtle / Balanced / Strong) or ordered Bayer (2×2 / 4×4 / 8×8).
- Adjust brightness, contrast and saturation, smooth or pre-sharpen the image, and treat a background colour as empty fabric (pick it from the image, with adjustable tolerance).
- The preview updates as you change settings, before the full pattern is generated.
- An experimental five-step guided import wizard is available under Preferences > Pattern Creator.

**Palette controls**
- Maximum number of colours: 2–100.
- Minimum stitches per colour, Confetti Cleanup (merges isolated stitches) and Stitch Cleanup.
- Smart two-thread blends where a pair of DMC threads matches noticeably better than any single thread.
- Use only stash threads: restrict matching to the DMC and Anchor threads you own.
- Shift Colours (hue rotation) and Palette Presets (themes, harmonies, your saved palettes).

**Pattern editor**
- Cross, half (both directions), quarter, three-quarter and backstitch tools; paint, fill, erase and eyedropper, with brushes up to 10×10 stitches.
- Magic Wand and Lasso (freehand, polygon, magnetic) selection, with a Move tool and Delete to clear everything in a selection.
- Replace colour: swap every stitch of one colour for another thread, with a preview (right-click, palette swap button, or `R`).
- Cleanup mode for line-art borders and Denoise mode (palette merge, speckle, fringe).
- Full undo / redo history.
- Realistic preview from plain chart up to a hoop or frame mock-up, and a split-pane view of chart and preview side by side.
- Stitch Score: a 0–100 stitchability rating (100 minus the percentage of confetti stitches).

**Materials & Output**
- Threads: per-colour stitch counts, skein estimates and cost.
- Stash status: what you own, what is low, what you need to buy.
- Export: PDF, PNG, `.oxs` and a `.zip` bundle (see [Export & Sharing](#export--sharing)).
- Adapt to my stash / Adapt to brand: make a copy of the pattern that uses threads you own, or another brand.

---

### Stitch Tracker ([`stitch.html`](stitch.html))

A digital replacement for a printed chart while you stitch.

- **Marking:** Mark mode — click, tap or drag to mark stitches done; Shift+drag (or press-and-hold then tap on touch) marks a rectangle. On touch, one finger marks and two fingers pan and zoom.
- **Navigate mode:** a hand tool — drag to move around, click to place a guide crosshair across a row and column.
- **Parking:** right-click a stitch (or press and hold in Navigate mode) to park a thread there; jump back to parked threads from the palette.
- **Views:** Symbol, Colour + Symbol, or Highlight (Isolate, Outline, Tint, Spotlight) to focus on one colour.
- **Work areas:** show just one part of a large pattern; counts, Spotlight and "Mark all done" are scoped to it.
- **Stitch layers:** show or hide full stitches, half stitches, French knots and backstitch.
- **Row mode** and **Section spotlight:** work one row, or one block, at a time.
- **Sessions:** start automatically when you stitch and end after a configurable idle time; three timing modes. Used to estimate your completion date and feed the Stats page.
- **Import:** `.json` projects, `.oxs` (KG-Chart / Pattern Keeper XML), images, and PDF charts — including multi-page, scanned and booklet PDFs, with a review screen before saving.

---

### Stash Manager ([`manager.html`](manager.html))

Thread inventory and pattern library.

- **Thread Stash:** DMC and Anchor threads with skein counts, part-used status (Mostly full / About half / Remnant / Used up), per-thread minimum stock and low-stock alerts. Stash status shows in the Creator and Tracker in real time.
- **Bulk Add:** paste a list of thread numbers, or add a preset starter kit.
- **Pattern Library:** every project saved in the Creator or Tracker appears automatically, plus patterns you add by hand. Shows how many of each pattern's threads you own. Projects are deleted from here (with a short Undo).
- **Shopping and cost:** shopping lists and stash value at your skein price.

---

## Home ([`home.html`](home.html))

The default landing page and project hub.

- **Projects:** greeting, the active project card (progress, last edited), and every other project with Track, Edit and Export actions.
- **Create new:** New from pattern file (image, `.json`, `.oxs` or `.pdf`) or New from scratch (blank grid).
- **Stash:** thread ownership summary and shopping list, linking to the Stash Manager.
- **Stats:** lifetime stitches, recent activity and your oldest work in progress, linking to the Stats page.
- Refreshes live on `cs:projectsChanged`, `cs:backupRestored`, `cs:stashChanged` and `visibilitychange`, so changes made in another tab show up.

---

## Export & Sharing

| Format | Description |
|--------|-------------|
| `.json` | Full project — pattern, progress, sessions, parking markers, thread ownership. File > Download (.json), or Ctrl+S. Reload at any time in the Creator or Tracker. |
| PDF chart | Multi-page, Pattern Keeper-compatible chart using the embedded `CrossStitchSymbols.ttf` symbol font. Presets for Pattern Keeper and home printing; Auto / A4 / US Letter; four print sizes; B&W and colour chart modes; optional cover, info, chart index and mini-legend pages; 2-row overlap zone; designer branding. See [EXPORT_QUICKSTART.md](EXPORT_QUICKSTART.md). |
| PNG image | Single image of the pattern grid. |
| `.oxs` | Open X-Stitch XML for MacStitch, WinStitch, FlossCross and Pattern Keeper. |
| `.zip` bundle | One archive with the PDF, `.oxs`, a PNG preview, the `.json` project and a `manifest.json`. |
| Backup (`.csb`) | Every project, the stash and settings in one compressed file (older backups are `.json`). File > Export Backup / Restore from Backup. |
| `.csync` | Cross-device sync file — see [Cross-device sync](#cross-device-sync). |

---

## Cross-device sync

Optional, account-free sync through a folder your cloud drive already syncs (Dropbox, OneDrive, Google Drive, iCloud Drive…).

- Set it up in Preferences > Sync, backup & data: choose the folder on each device and turn on auto-sync. The app writes `.csync` files after saves and checks the folder every 10 seconds while visible.
- Conflicting edits open a review screen; a cloud icon in the top bar shows sync status.
- Optional AES-GCM passphrase encryption of sync files, and pairing codes to name devices consistently.
- iPhone and iPad browsers cannot watch folders, so they sync by sharing and importing `.csync` files by hand.

See [wiki/Cross-Device-Sync.md](wiki/Cross-Device-Sync.md).

---

## Stats & Insights

A Stats page (Stats in the top bar) aggregates data across all projects and the stash, in Stitching, Stash, Showcase, Activity and Insights tabs.

- Lifetime stitch count, active and finished projects, weekly streaks and recent pace.
- SABLE Index (Stash Acquired Beyond Life Expectancy) — how many years of stitching your stash represents.
- Colour-family breakdown and DMC palette coverage.
- "Ready to start" projects (all threads owned), "Use what you have" and "Buying impact" advisors, duplicate-risk warnings and an oldest-WIP detector.
- Designer leaderboard, brand-alignment chart, difficulty vs. completion scatter plot.
- An activity heatmap and a weekly summary comparing this week with last.
- Sections can be shown or hidden with the Stats page's Customise button.

---

## Thread Data

- **DMC:** full stranded-cotton catalogue — 525 colours with pre-computed CIE L\*a\*b\* values for fast CIEDE2000 matching.
- **Anchor:** full Anchor Stranded Cotton catalogue with reconciled RGB values from the official colour card, Stitchtastic, Cross-Stitched.com and sibalman/thread-converter. Contested colours are flagged.
- **DMC ↔ Anchor conversions:** bidirectional table with confidence labels (`official`, `reconciled`, `single-source`). Both directions are stored independently so asymmetric mappings are preserved.
- **Fabrics:** 11–22 count Aida, 25 count evenweave, and 28 / 32 count linen (worked over two).

---

## Application-wide Features

### Command Palette

**Ctrl+K** (or **Cmd+K**) on any page opens a fuzzy-search command palette for navigation, project actions, tools, help and preferences. The hotkey can be changed or turned off in Preferences > Advanced.

### Help

Press **?** or use the Help button in the top bar to open the Help drawer: topic articles, a searchable shortcuts reference, and Getting Started guides that can replay each page's walkthrough. All content lives in [`help-drawer.js`](help-drawer.js).

### Keyboard Shortcuts

The Help drawer's Shortcuts tab is the reference. Common ones:

| Key | Action |
|-----|--------|
| `?` | Help and shortcuts |
| `Ctrl+K` | Command palette |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+S` | Download the project as `.json` |
| `V` | Cycle view mode |
| `W` | Creator: Magic Wand · Tracker: pick a work area |
| `H` | Creator: Hand (pan) · Tracker: toggle half-stitch layer |
| `T` / `N` | Tracker: Mark / Navigate mode |
| `[` / `]` | Tracker highlight view: previous / next colour |

### Preferences

File > Preferences opens a 12-category panel (Profile & branding, Regional & units, Notifications, Accessibility, Pattern Creator, Stitch Tracker, Stash Manager, Preview & display, PDF export, Sync backup & data, Onboarding & help, Advanced). Settings persist via `window.UserPrefs`. The bottom of every panel shows the version history from [`version.js`](version.js).

### Onboarding

- **Welcome walkthroughs** ([`onboarding-wizard.js`](onboarding-wizard.js)): a short tour the first time you open the Creator, Tracker or Stash Manager. Steps highlight real controls; the tour waits behind any other open dialog. The Tracker's tour ends by asking how you like to stitch; skipping keeps the default.
- **Coachmarks** ([`coaching.js`](coaching.js)): one-off tips — the Tools tab unlocking after you generate, painting your first stitch, marking your first stitch, marking a rectangle. They never block the page, wait for walkthroughs to finish, and are remembered however they are dismissed (Skip tips hides them all).
- **Help hint:** a small "Press ? for help" pill after 30 seconds of idleness on a first visit.
- **Reset:** Help > Getting Started > Restart guided tours and Preferences > Onboarding & help > Reset every walkthrough both reset all of the above.

---

## Progressive Web App

The service worker ([`sw.js`](sw.js)) pre-caches the app shell on first load; the app then works offline.

- **Desktop (Chrome / Edge):** click the install icon in the address bar.
- **iOS / iPadOS Safari:** Share > Add to Home Screen. Installing also stops Safari clearing stored patterns after seven days without a visit.
- **Android:** browser menu > Install app.

---

## Getting Started

### Serve locally

```bash
npm install          # dev dependencies: Jest, Playwright, build tooling
npm run start        # node serve.js on port 8000
# or: python -m http.server 8000
```

Then open `http://localhost:8000/home.html`. Opening the HTML files from `file://` mostly works, but some browsers block Web Workers and IndexedDB there.

### Entry points

| URL | Tool |
|-----|------|
| `home.html` | Home (start here) |
| `create.html` | Pattern Creator |
| `index.html` | Legacy Creator URL: redirects to Home when no project is active; also hosts the Stats page (`?mode=stats`) |
| `stitch.html` | Stitch Tracker |
| `manager.html` | Stash Manager |
| `embroidery.html` | Experimental embroidery planner (enable in Preferences > Pattern Creator > Experimental) |

---

## Development

Requires Node.js 22 or later.

### Testing

```bash
npm test                         # Jest, parallel (~240 suites, a few seconds)
npm test -- --runInBand          # serial, for debugging cross-suite state
npm test -- --coverage

npx playwright install chromium webkit   # first time only
npm run test:e2e                 # touch-tablet Chromium
npm run test:ipad                # iPad WebKit
npm run test:mobile-audit        # phone / tablet / desktop layout audit
npm run perf:baseline            # desktop perf (also perf:mobile)

npm run lint:terminology         # banned terms in user-facing copy
npm run lint:css-tokens          # raw hex / removed --ws-* aliases in CSS
```

Tests are CommonJS and mostly load browser source with `fs.readFileSync` + `new Function`/`eval`, since the app has no module system.

### Build steps

The app runs without a bundler, but some files are generated and committed:

| Command | Output | When |
|---|---|---|
| `node build-creator-bundle.js` (`npm run build:creator`) | `creator/bundle.js`, `creator/extras-bundle.js`, `creator/import-wizard-bundle.js` | After editing anything in `creator/` |
| `node build-runtime-js.js` (`npm run build:runtime-js`) | `compiled/*.compiled.js` | After editing `tracker-app.js`, `creator-main.js`, `manager-app.js` or `embroidery.js` (JSX, precompiled so there is no in-browser Babel) |
| `node build-import-bundle.js` | `import-engine/bundle.js` | After editing anything in `import-engine/` |
| `node build-symbol-font.js` | `assets/fonts/CrossStitchSymbols.ttf` (+ base64) | After changing the PDF symbol set |
| `npm run build` | creator bundle + runtime JS | — |

Never edit generated files by hand. `npm test` and the pre-commit hook fail when `compiled/` is stale (`node build-runtime-js.js --check` says which file).

### Git hooks

`npm install` points Git at `.husky/`. The pre-commit hook runs the terminology lint and, when runtime entry files are staged, the `compiled/` staleness check.

### Versioning

`APP_VERSION` in [`version.js`](version.js) is bumped automatically on each merge to `main`. `APP_CHANGELOG` in the same file is written by hand — add a plain-English entry for user-visible changes.

---

## Architecture

### Runtime stack

| Component | Detail |
|-----------|--------|
| **React 18** | Loaded from cdnjs as browser globals (`window.React`, `window.ReactDOM`). |
| **Plain `<script>` globals** | No module system in the browser; files expose APIs on `window`. |
| **Precompiled entry files** | `compiled/*.compiled.js`, loaded lazily by [`runtime-loaders.js`](runtime-loaders.js). |
| **pdf-lib** | PDF generation in a worker. Produces Pattern Keeper-compatible output. |
| **PDF.js** | Reads imported PDF charts. |
| **Pako** | Compression for backups, `.csync` files and project hand-off. |
| **JSZip** | `.zip` bundle export. |

[`lazy-modules.js`](lazy-modules.js) defers `help-drawer.js` and `backup-restore.js` until first use; [`import-engine/lazy-shim.js`](import-engine/lazy-shim.js) does the same for the import engine.

### Web Workers

| Worker | Job |
|---|---|
| `generate-worker.js` | Pattern generation: quantisation, dithering, cleanup |
| `analysis-worker.js` | Image analysis and Tracker stitch analysis |
| `cleanup-worker.js` | Line-art Cleanup mode |
| `noise-cleanup-worker.js` | Denoise mode |
| `pdf-export-worker.js` | PDF chart generation (pdf-lib) |
| `pdf-raster-worker.js` | Rasterising scanned / image PDF pages |
| `import-engine/worker.js` | PDF and pattern import pipeline |

### Storage

| Database | Version | Object stores | Used by |
|----------|---------|---------------|---------|
| `CrossStitchDB` | 5 | `projects`, `project_meta`, `stats_summaries`, `sync_snapshots`, `importerTelemetry`, `pendingImports` | Creator, Tracker, Stats, sync, importer |
| `stitch_manager_db` | opened without a version (see `openManagerDB` in [`helpers.js`](helpers.js)) | `manager_state` (`threads`, `patterns`) | Stash Manager and the stash bridge |
| `cross_stitch_sync_meta` | 1 | `sync_state` | Sync engine |

`localStorage` holds lightweight pointers and per-device UI state: the active project ID (`crossstitch_active_project`), user preferences (`cs_pref_*`), per-project view state (`cs_pview_*`), and onboarding flags (`cs_welcome_*_done`, `cs_styleOnboardingDone`).

### Cross-page communication

Pages communicate through `CustomEvent`s on `window` (and `BroadcastChannel` for cross-tab coordination — see `cross-tab-*.js`). The main ones:

| Event | Purpose |
|-------|---------|
| `cs:projectsChanged` | A project was saved, deleted or renamed |
| `cs:backupRestored` | A backup was restored |
| `cs:stashChanged` | Thread inventory changed |
| `cs:patternsChanged` | Pattern library changed |
| `cs:prefsChanged` | A user preference changed |
| `cs:syncStatusChanged` | Sync state changed (drives the cloud icon) |
| `cs:openHelp`, `cs:openShortcuts`, `cs:openPreferences` | Open the Help drawer / shortcuts / Preferences |
| `cs:showWelcome` | Replay a page's welcome walkthrough |

---

## Key File Reference

```
home.html / home-app.js        Home — project hub and landing page
create.html / creator-main.js  Pattern Creator entry and app mount
index.html                     Legacy Creator URL + Stats host
stitch.html / tracker-app.js   Stitch Tracker
manager.html / manager-app.js  Stash Manager
stats-page.js                  Stats page (with stats-insights.js, stats-activity.js,
                               insights-engine.js, components-stats.js)

styles.css                     Workshop design tokens and shared styles
constants.js                   Fabric counts, skein length, price defaults
dmc-data.js / anchor-data.js   Thread catalogues
thread-conversions.js          DMC <-> Anchor conversion table
starter-kits.js                Preset thread collections
colour-utils.js                Quantisation, dithering, CIEDE2000, colour matching
threadCalc.js                  Skein estimation (stitchesToSkeins)
helpers.js                     Shared utilities, pattern (de)serialisation, DB openers
import-formats.js              .oxs / .json / image parsers
import-engine/                 PDF and pattern import pipeline (bundled)
pdf-importer.js                Legacy PDF importer

project-storage.js             Multi-project storage (CrossStitchDB)
stash-bridge.js                Bridge to stitch_manager_db from any page
project-library.js             Pattern Library (wraps home-screen.js dashboard)
backup-restore.js              Full backup and restore
sync-engine.js                 Folder / file sync (.csync)
cross-tab-*.js                 Cross-tab locking and conflict resolution

header.js                      Top bar, File menu, sync popover
components.js / modals.js      Shared React components and modals
icons.js                       SVG icon library (window.Icons.name())
toast.js                       Toasts
command-palette.js             Ctrl+K palette
help-drawer.js                 Help, shortcuts and Getting Started content
shortcuts.js / keyboard-utils.js  Shortcut registry, Esc stack, "?" key
onboarding-wizard.js           Welcome walkthroughs
coaching.js                    Coachmarks
user-prefs.js / apply-prefs.js / preferences-modal.js  Preferences
palette-swap.js                Shift Colours and Palette Presets
work-area.js                   Tracker work areas

creator/                       Creator components and hooks (see build-creator-bundle.js)
creator/pdfExport.js, creator/pdfChartLayout.js, pdf-export-worker.js
                               Pattern Keeper-compatible PDF export (bit-stable)
sw.js / manifest.json          Service worker and PWA manifest
version.js                     App version and in-app changelog

tests/                         Jest suites
tests/e2e, tests/ipad, tests/perf, tests/mobile-audit   Playwright suites
reports/                       Audits, plans and investigations
wiki/                          User guides
```

---

## Project Data Format

Projects are stored and downloaded as JSON (`version: 11`):

```json
{
  "version": 11,
  "id": "proj_1712345678",
  "page": "creator",
  "name": "My Pattern",
  "designer": "",
  "description": "",
  "createdAt": "2026-04-05T12:00:00.000Z",
  "updatedAt": "2026-04-05T12:00:00.000Z",
  "settings": { "sW": 80, "sH": 80, "fabricCt": 14, "maxC": 30, "...": "..." },
  "pattern": [ { "id": "310", "type": "solid" }, { "id": "__skip__" } ],
  "bsLines": [],
  "done": null,
  "halfStitches": [],
  "halfDone": [],
  "partialStitches": [],
  "parkMarkers": [],
  "sessions": [],
  "statsSessions": [],
  "threadOwned": {},
  "workArea": null
}
```

- `settings.sW` × `settings.sH` are the dimensions; `pattern` is a flat array of that length.
- Each cell is `{ id, type }` for a solid DMC thread (the RGB is rebuilt from the catalogue on load), `{ id, type, rgb }` where it cannot be rebuilt, `{ id: "310+550", type: "blend" }` for a two-thread blend, or `{ id: "__skip__" }` / `{ id: "__empty__" }` for background and empty cells. See `stripCellForSave` in [`helpers.js`](helpers.js) and `restoreStitch` in [`colour-utils.js`](colour-utils.js).
- `done` is `null` (not started) or an array the same length as `pattern` with `1` for done stitches.
- The Tracker adds its own fields (`statsSessions`, `doneSnapshots`, `breadcrumbs`, `stitchingStyle`, `focusBlock`, `workArea`, …).
- Older files (`v: 8` and earlier, `.oxs`, compact `.p` grids) are still read.

---

## Contributing

Pull requests are welcome. Before submitting:

1. Run `npm test` and make sure every suite passes.
2. Run `npm run lint:terminology` and `npm run lint:css-tokens`.
3. Rebuild and commit any generated files you affected (see [Build steps](#build-steps)).
4. No emoji or emoji-like symbols (✓ → ⚠ …) in user-facing strings — use the SVG icons in `icons.js` via `window.Icons.name()`, adding one if needed (24×24 viewBox, 1.6 stroke-width, `currentColor`). See [AGENTS.md](AGENTS.md).
5. British English in user-visible text ("colour", "organiser").
6. Canonical CSS design tokens (`--accent`, `--surface`, `--text-primary`, …) — no raw hex in component CSS.
7. If you change something users can see, update the Help drawer ([`help-drawer.js`](help-drawer.js)) and add an `APP_CHANGELOG` entry.

---

## Licence

ISC
