# Copilot Instructions — stitchx

> **No emojis in user-facing UI.** Use the SVG icons in [icons.js](../icons.js)
> via `window.Icons.{name}()`. If a suitable icon doesn't exist, ADD one to
> `icons.js` (24×24 viewBox, 1.6 stroke-width, currentColor) rather than
> reaching for an emoji. This includes:
> - Button labels, menu items, badges, status indicators
> - Toast and modal copy
> - Category lists and tab headers
> - Help drawer articles ([help-drawer.js](../help-drawer.js))
>
> Emojis are forbidden because they render inconsistently across OS/browser,
> can't be coloured to match the theme, and clash with the rest of the app's
> visual language. The unicode characters ✓ ✗ → ← ▸ etc. count as emoji for
> this rule — use [icons.js](../icons.js)'s `check`, `x`, `pointing` etc instead.
> Write menu paths as "File > Preferences", never with an arrow glyph.
> Exceptions (box-drawing dividers in source headers, legacy test fixtures,
> and key glyphs inside `<kbd>`) are listed in [AGENTS.md](../AGENTS.md).

## Project Overview

A fully client-side Progressive Web App (PWA) for creating, managing, and tracking cross-stitch patterns. There is no server and no bundler: pages are plain HTML that load `<script>` globals. A few files are **generated and committed** (see [Build steps](#build-steps)) — always regenerate them after editing their sources.

## Workshop is the sole theme

The Workshop visual direction (UX-12) is the only theme — see [AGENTS.md](../AGENTS.md#workshop-is-the-sole-theme) for the canonical summary. Key reminders:

- All `--ws-*` aliases were removed in Phase 8. Use canonical token names directly (`--accent`, `--surface`, `--text-primary`, `--text-secondary`, `--radius-sm`, `--shadow-sm`, plus the non-conflicting Workshop tokens defined in [styles.css](../styles.css) such as `--line`, `--accent-2`, `--success`, `--motion`).
- Light tokens live on `:root` in [styles.css](../styles.css); dark tokens on `[data-theme="dark"]`. The mirror reference is `reports/showcase/_workshop.css`.
- `/home` ([home.html](../home.html) + [home-app.js](../home-app.js)) is the default landing. `create.html`, `index.html`, `stitch.html`, and `manager.html` URLs still work and skip the landing.
- The Pattern Keeper-compatible PDF export path is bit-stable. The Workshop print theme is opt-in via the `creator.pdfWorkshopTheme` user preference (a checkbox on the Export tab). Do **not** modify [pdf-export-worker.js](../pdf-export-worker.js), [creator/pdfChartLayout.js](../creator/pdfChartLayout.js), or [creator/pdfExport.js](../creator/pdfExport.js) without an explicit PK-compat regression check.

## Architecture

### HTML entry points

| File | Purpose |
|---|---|
| `home.html` | Home — default landing page; project hub |
| `create.html` | Pattern Creator — convert images to patterns, edit, export |
| `index.html` | Legacy Creator URL — redirects to Home when no project is active; also hosts the Stats page (`?mode=stats`) |
| `stitch.html` | Stitch Tracker |
| `manager.html` | Stash Manager — thread inventory and pattern library |
| `embroidery.html` | Experimental embroidery planner (behind a preference) |

Each page lists its own `<script>` tags — read the page's HTML for the canonical load order rather than assuming one. React 18 and ReactDOM come from cdnjs as globals; Pako (and JSZip on the Creator) load from the CDN in `<head>`.

### JSX and generated files

There is **no in-browser Babel**. The large JSX entry files (`tracker-app.js`, `creator-main.js`, `manager-app.js`, `embroidery.js`) are precompiled to `compiled/*.compiled.js` by `build-runtime-js.js`, and pages load the compiled copy through `window.loadScript` ([runtime-loaders.js](../runtime-loaders.js)). Everything else is plain ES5/ES2015 using `React.createElement`.

### Build steps

| Edit | Then run | Regenerates |
|---|---|---|
| any `creator/*.js` | `node build-creator-bundle.js` | `creator/bundle.js`, `creator/extras-bundle.js`, `creator/import-wizard-bundle.js` |
| `tracker-app.js`, `creator-main.js`, `manager-app.js`, `embroidery.js` | `node build-runtime-js.js` | `compiled/*.compiled.js` |
| any `import-engine/**` | `node build-import-bundle.js` | `import-engine/bundle.js` |

Never edit the generated files directly. File order for the creator bundles is defined in `build-creator-bundle.js` (`ORDER` and `EXTRAS_ORDER`). `npm test` and the pre-commit hook fail when `compiled/` is stale.

### Lazy loading

[lazy-modules.js](../lazy-modules.js) installs stubs for `HelpDrawer` and `BackupRestore` and loads `help-drawer.js` / `backup-restore.js` on first use. [import-engine/lazy-shim.js](../import-engine/lazy-shim.js) does the same for `import-engine/bundle.js`. Lazily loaded files must stay in `sw.js`'s precache list (checked by `tests/swPrecacheSync.test.js`).

## Key Files and Responsibilities

| File | Role |
|---|---|
| `constants.js` | Fabric counts, skein length (`SKEIN_LENGTH_IN = 315` inches), default price (`DEFAULT_SKEIN_PRICE = 0.95` GBP), canvas checkerboard size (`CK = 4`) |
| `dmc-data.js` / `anchor-data.js` | Thread catalogues — `DMC` is an array of `{id, name, rgb, lab}` |
| `colour-utils.js` | Quantisation, Atkinson / Bayer dithering, CIEDE2000, colour matching (`findSolid`, `findBest`), image filters |
| `helpers.js` | Shared utilities (`fmtTime`, `skeinEst`, `gridCoord`…), pattern serialisation (`stripCellForSave`, `serializePattern`; the matching `restoreStitch` is in `colour-utils.js`), DB openers (`getDB`, `openManagerDB`) |
| `project-storage.js` | Multi-project storage — `ProjectStorage` singleton (`save`, `get`, `listProjects`, `delete`, `getActiveProject`, …) |
| `stash-bridge.js` | Reads/writes the Stash Manager's `stitch_manager_db` from any page |
| `sync-engine.js` | `.csync` export/import, folder watching, merge and conflict review |
| `tracker-app.js` | Stitch Tracker React tree (shortcuts are the `trackerShortcuts` array) |
| `creator-main.js` + `creator/` | Pattern Creator — state in `creator/useCreatorState.js`, shortcuts in `creator/useKeyboardShortcuts.js` |
| `manager-app.js` | Stash Manager React tree |
| `home-app.js` | Home page |
| `import-formats.js`, `import-engine/`, `pdf-importer.js` | Import parsers (`.oxs`, `.json`, images, PDF charts) |
| `threadCalc.js` | `stitchesToSkeins()` |
| `backup-restore.js` | Full backup (`.csb` compressed, or `.json`) and restore |
| `header.js` | Top bar, File menu, sync status popover |
| `help-drawer.js` | **All in-app help content**: topics, shortcut list, Getting Started |
| `onboarding-wizard.js` / `coaching.js` | Welcome walkthroughs / coachmarks |
| `user-prefs.js` / `preferences-modal.js` | Preference defaults (`UserPrefs.DEFAULTS`) / the Preferences panel |
| `version.js` | `APP_VERSION` (auto-bumped) and `APP_CHANGELOG` (hand-written) |

## Data Storage

| Database | Version | Object Stores | Used By |
|---|---|---|---|
| `CrossStitchDB` | 5 | `projects`, `project_meta`, `stats_summaries`, `sync_snapshots`, `importerTelemetry`, `pendingImports` | Creator, Tracker, Stats, sync, importer |
| `stitch_manager_db` | versionless (use `openManagerDB()`) | `manager_state` | Stash Manager, stash bridge |
| `cross_stitch_sync_meta` | 1 | `sync_state` | Sync engine |

- `projects` is keyed by project ID (e.g. `"proj_1712345678"`); `project_meta` mirrors lightweight metadata for listing.
- The active project pointer is in `localStorage["crossstitch_active_project"]`.
- `manager_state` holds `"threads"` (keyed `dmc:310` / `anchor:403`) and `"patterns"` (library array).
- `CrossStitchDB` is opened in several files (`helpers.js`, `project-storage.js`, `sync-engine.js`) — a schema change must bump the version and upgrade path in **all** of them.
- Never open `stitch_manager_db` with a hard-coded version; see the comment above `openManagerDB` in `helpers.js`.

## Project JSON Format

Current saves use `version: 11`:

```json
{
  "version": 11,
  "id": "proj_1712345678",
  "page": "creator",
  "name": "My Pattern",
  "createdAt": "2026-04-05T12:00:00.000Z",
  "updatedAt": "2026-04-05T12:00:00.000Z",
  "settings": { "sW": 80, "sH": 80, "fabricCt": 14 },
  "pattern": [ { "id": "310", "type": "solid" }, { "id": "__skip__" } ],
  "bsLines": [],
  "done": null,
  "halfStitches": [],
  "halfDone": [],
  "partialStitches": [],
  "parkMarkers": [],
  "sessions": [],
  "threadOwned": {}
}
```

- Dimensions are `settings.sW` × `settings.sH`; `pattern` is a flat array of that length.
- Cells: `{ id, type }` for DMC solids (RGB rebuilt from the catalogue on load — always go through `serializePattern` / `restoreStitch`), `{ id, type, rgb }` when the RGB can't be rebuilt, `{ id: "310+550", type: "blend" }` for blends, `{ id: "__skip__" }` / `{ id: "__empty__" }` for background/empty.
- `done` is `null` or an array of the same length with `1` = done.
- Readers must still accept `v: 8` and older files, the compact `.p` grid format and imports.

## Running and Testing

```bash
npm install
npm test                    # Jest, parallel by default (~5 s)
npm test -- --runInBand     # only when debugging cross-suite state leaks
npm run lint:terminology
npm run lint:css-tokens
npm run start               # node serve.js, port 8000
```

Playwright suites: `npm run test:e2e` (touch tablet), `npm run test:ipad` (WebKit), `npm run test:mobile-audit`, `npm run perf:baseline`.

### Test Suite (`tests/`)

Tests use **Jest** with CommonJS `require`. Most tests read browser source with `fs.readFileSync` and evaluate it (`eval` / `new Function`) in a stubbed environment, or assert on the source text — there is no module system to import from. `fake-indexeddb` and `jest-environment-jsdom` are available for storage and DOM tests. `tests/*.py` are legacy Selenium scripts and are not run by `npm test`.

## Code Style Conventions

- **Minified-style JS** is common in older/utility files (e.g. `constants.js`, `helpers.js`) and much of `tracker-app.js`: terse names, little whitespace. Match the style of the file you are editing.
- **Modern React style** (hooks, function components) everywhere else. Non-compiled files use `React.createElement` (often aliased `h`), not JSX.
- **No module system in the browser**: plain `<script>` globals. Do not use `import`/`export` or `require()` in browser files.
- **Creator files** (`creator/*.js`) expose their exports via `window.*` assignments.
- British English in user-facing strings ("colour", "organiser"). Default currency GBP (£0.95 per skein).
- Keep source files UTF-8. An editor saving a file in a legacy encoding once turned every `×`, `—` and `£` in the Preferences panel into `�`.

## Keeping docs in step

User-visible changes need matching updates to:

1. [help-drawer.js](../help-drawer.js) — the in-app help and shortcut list. `tests/helpDrawerShortcutsSync.test.js` fails if the shortcut list and the real registrations disagree.
2. `APP_CHANGELOG` in [version.js](../version.js) — the Version history in Preferences.
3. [README.md](../README.md) and the user guides in [wiki/](../wiki/) when a feature is added, renamed or moved.

## Common Pitfalls

1. **Never edit generated files** (`creator/*bundle.js`, `compiled/*`, `import-engine/bundle.js`) — rebuild them.
2. **IndexedDB is browser-only** — tests that touch storage use `fake-indexeddb` or mock it.
3. **React is a CDN global** — never bundle it; it is a devDependency only for tests.
4. **Pako must load in `<head>`** before the app scripts (backups, sync files and project hand-off use it).
5. **Shortcut scopes**: the most specific active scope wins (`tracker.notedit` beats `tracker`), so two entries bound to the same key in nested scopes shadow each other.

## Errors and Workarounds Encountered

- **Local file access restrictions**: some browsers block workers and IndexedDB over `file://`. Use `node serve.js` or `python -m http.server`.
- **iOS file pickers**: `accept` values iOS can't map to a UTI (e.g. `.csync`, `.oxs`) grey out every file. Use `window.Platform.fileAccept(...)`, which drops the filter on iOS.
