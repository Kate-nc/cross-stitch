# Project Context — Single Source of Truth for Spec Agents

> Read this first. All Phase 1, 2, 3, and 4 agents reference this document for
> structural facts and MUST NOT re-derive them. If anything here is wrong,
> escalate to the orchestrator before writing specs against it.

---

## 1. Framework & language

- **Language**: Vanilla JavaScript (ES2017+), JSX compiled in-browser by
  **Babel Standalone** loaded from CDN. No TypeScript. No npm-based build.
- **UI framework**: **React 18** (UMD globals, `window.React` /
  `window.ReactDOM`) loaded from CDN. Function components + hooks.
- **Module system**: **None.** All files are classic `<script>` tags. Files
  expose APIs via `window.*` assignments (e.g. `window.useCreatorState =
  function ...`). Top-level `const` does **not** attach to `window` —
  several globals are explicitly mirrored (`window.ProjectStorage`,
  `window.StashBridge`).
- **Build step**: Only one — [build-creator-bundle.js](../build-creator-bundle.js)
  concatenates `creator/*.js` source files into [creator/bundle.js](../creator/bundle.js).
  All other JS runs unbuilt. Never edit `creator/bundle.js` directly.
- **CSS**: Single global stylesheet [styles.css](../styles.css). Workshop
  is the sole theme (UX-12). Light tokens on `:root`, dark on
  `[data-theme="dark"]`.
- **PWA**: [sw.js](../sw.js) + [sw-register.js](../sw-register.js).
  Cache-versioned (currently `v40` at time of writing; bump on deploy).
- **Third-party CDN**: React 18, ReactDOM 18, Babel 7.23.9, pako 2.1.0,
  jszip 3.10.1 (creator only), pdf.js (creator only via
  [pdf.worker.min.js](../pdf.worker.min.js)).

---

## 2. Entry points

There is **no client-side router**. Each HTML file is a separate entry
point loaded directly by the browser. Navigation between them is done
with full-page loads (`<a href>` and `location.href = ...`).

| HTML file | Default landing? | Purpose | Mount root | Root component |
|---|---|---|---|---|
| [home.html](../home.html) | Yes (`/`) | Project dashboard, hub, recent activity, stats glance | `<div id="root">` | `HomeApp` ([home-app.js](../home-app.js)) |
| [create.html](../create.html) | No | Pattern Creator (image → chart, edit, export) | `<div id="root">` | `CreatorApp` ([creator-main.js](../creator-main.js) + [creator/bundle.js](../creator/bundle.js)) |
| [index.html](../index.html) | Legacy URL alias | Forwards/loads same Creator app as `create.html` | `<div id="root">` | `CreatorApp` |
| [stitch.html](../stitch.html) | No | Stitch Tracker — mark stitches done, track time | `<div id="root">` | `TrackerApp` ([tracker-app.js](../tracker-app.js)) |
| [manager.html](../manager.html) | No | Stash Manager — DMC/Anchor inventory, pattern library, stats | `<div id="root">` | `ManagerApp` ([manager-app.js](../manager-app.js)) |
| [embroidery.html](../embroidery.html) | No (experimental) | Standalone embroidery experiment (image filters preview) | `<div id="root">` | Inline; out of scope unless surfaced in nav |

**Route manifest equivalent**: there isn't one. Inter-page navigation
strings are scattered (`window.location.href = 'create.html'` etc.) and
must be discovered by grep during Phase 2 navigation cross-cutting.

**No lazy loading, no code splitting, no auth gates, no role checks,
no feature flags wired into routing.** Some UI is gated by
**user preferences** (see §6) but that's per-element rendering, not
routing.

---

## 3. State management

- **No external state library** (no Redux, Zustand, MobX, Pinia,
  Context-as-store pattern).
- **Per-page React state**: each top-level component owns its tree's
  state via `useState` / `useReducer` / `useMemo`. The Creator's state
  is centralised in the [creator/useCreatorState.js](../creator/useCreatorState.js)
  hook (large reducer-style hook).
- **Cross-component event bus**: a handful of named **`CustomEvent`**
  dispatches on `window` / `document`:
  - `cs:helpStateChange` — HelpDrawer open/close
  - `cs:prefsChanged` — UserPrefs set (`{ detail: { key, value } }`)
  - `cs:projectChanged`, `cs:projectListChanged` — ProjectStorage writes
  - `cs:stashChanged` — StashBridge writes
  - `cs:openCommand`, `cs:openHelp`, `cs:openOnboarding` — global UI triggers
  - `cs:toast` — toast notifications
  - (Cross-cutting agents must enumerate these — list above is non-exhaustive.)
- **Persistence layers** (see §4 for storage details):
  - `localStorage` — user preferences (`cs_pref_*`), active project
    pointer (`crossstitch_active_project`), small UI state.
  - **IndexedDB `CrossStitchDB` (v3)** — projects, project metadata,
    stats summaries.
  - **IndexedDB `stitch_manager_db` (v1)** — Stash Manager threads &
    pattern library.
- **Singleton globals** that act as stores:
  - `window.ProjectStorage` ([project-storage.js](../project-storage.js)) — multi-project IDB facade.
  - `window.StashBridge` ([stash-bridge.js](../stash-bridge.js)) — cross-DB read/write into Manager DB from any page.
  - `window.UserPrefs` ([user-prefs.js](../user-prefs.js)) — preferences with default fallback.
  - `window.SyncEngine` ([sync-engine.js](../sync-engine.js)) — optional cloud sync (verify scope during Phase 2).

---

## 4. API / backend layer

- **The app has no backend.** It is a fully client-side PWA.
- **All persistence is local** (localStorage + IndexedDB). See §3.
- **Optional cloud sync** is implemented in [sync-engine.js](../sync-engine.js).
  Cross-cutting agents must determine whether it is currently active,
  what endpoints it talks to (if any), and treat it as the only
  "API layer" for purposes of error-handling / data-flow specs.
- **Service Worker** ([sw.js](../sw.js)) intercepts fetches for app
  assets only (network-first for HTML/JS, cache-first for static).
  Not a backend.
- **Web Workers** used:
  - [generate-worker.js](../generate-worker.js) — image → pattern generation.
  - [analysis-worker.js](../analysis-worker.js) — image analysis for Magic Wand etc.
  - [pdf-export-worker.js](../pdf-export-worker.js) — Pattern Keeper-compatible PDF export (**bit-stable; do not modify**).
  - [pdf.worker.min.js](../pdf.worker.min.js) — pdf.js bundled worker for PDF import.

---

## 5. Component inventory method

Because there is no module system, **the canonical inventory method is
file enumeration plus grep for component declarations.**

```powershell
# Top-level page components (root of repo)
Get-ChildItem -Path . -Filter *.js -File | Where-Object {
    $_.Name -notmatch '^(serve|build-|sw|sw-register|.*-worker|pdf\.worker)' }

# Creator module source files (concatenated into bundle.js)
Get-ChildItem -Path .\creator -Filter *.js -File |
    Where-Object { $_.Name -ne 'bundle.js' -and $_.Name -ne 'import-wizard-bundle.js' }

# Shared React components
Get-ChildItem -Path .\components -Filter *.js -File
```

```powershell
# Find every React component declaration
Select-String -Path .\*.js, .\creator\*.js, .\components\*.js `
    -Pattern '^\s*(function|const)\s+[A-Z][A-Za-z0-9_]*\s*[\(=]' `
    -CaseSensitive
```

**Modal/drawer/popover discovery** (these are "screens" without routes):

```powershell
Select-String -Path .\*.js, .\creator\*.js -Pattern '(Modal|Drawer|Popover|Overlay|Sheet)\s*[:=]\s*function' -List
```

**HTML-script-load order is the canonical "registration"**:
- [home.html](../home.html) lines 22–60+ for Home dependencies
- [create.html](../create.html) lines 60+ for Creator dependencies
- [stitch.html](../stitch.html) lines 36+ for Tracker dependencies
- [manager.html](../manager.html) lines 36+ for Manager dependencies

Discovery agents must read those four `<script>` blocks to know which
files are live on which page. A file existing in the repo does **not**
mean it's loaded everywhere.

---

## 6. User preferences as conditional rendering

Several UI elements only render based on a user pref. Treat these as
"feature flags" for spec purposes. Canonical list lives in
[user-prefs.js](../user-prefs.js) `DEFAULTS` object. Notable ones:

- `creator.pdfWorkshopTheme` — Workshop print theme on PDF export (off by default; PK-compat path is the default).
- `tracker.leftSidebarMode` — sidebar layout on the Tracker.
- (Full list to be enumerated by the Phase 2 data-flow agent.)

`UserPrefs.get(key)` falls back to `DEFAULTS[key]` even when the key
was never set — code that needs to detect "first run" must read
`localStorage.getItem('cs_pref_' + key)` directly. `UserPrefs.set()`
only writes; callers must dispatch `cs:prefsChanged` for live updates.

---

## 7. How to run the app

- **No dev server required.** You can open the HTML files directly in a
  browser (`file://`), but some browsers block IndexedDB on `file://` —
  prefer the bundled HTTP server.
- **Local server**: `node serve.js` (default port 8000) or
  `node serve.js 3000` for a custom port.
- **Tests**: `npm test -- --runInBand` (Jest, CommonJS, no JSX). Tests
  extract pure functions from source via `fs.readFileSync` + regex +
  `eval()` — there is no module system to import from.
- **E2E**: `npm run test:e2e` (Playwright, `touch-tablet-chromium`
  project — the project's primary Playwright target is **tablet
  touch**, which aligns with the user's tablet-friendliness emphasis
  for the responsive cross-cutting spec).
- **Perf**: `npm run perf:baseline` (desktop), `npm run perf:mobile`.
- **Creator bundle rebuild** (mandatory after any `creator/*.js` edit):
  `node build-creator-bundle.js`.

For verification (Phase 4) **a running dev server IS available**
(`node serve.js`). However, the directive's "stop after Phase 3" gate
means agents in this run only need code-path tracing, not live testing.

---

## 8. Severity scale (verbatim from directive)

| Severity | Label | Definition |
|---|---|---|
| **P0** | Broken | Feature does not work at all, user cannot complete the task |
| **P1** | Misleading | Feature appears to work but produces wrong results, loses data, or misleads the user |
| **P2** | Confusing | Feature works but the user is likely to struggle, make errors, or need external help |
| **P3** | Rough | Feature works and is usable but has cosmetic issues, inconsistencies, or minor friction |
| **P4** | Polish | Feature works well but could be improved for delight, efficiency, or edge cases |

---

## 9. Cross-cutting emphasis: tablet-friendliness

Per the user, **all areas are equal priority** but the
**responsive / tablet** cross-cutting spec is where tablet quality
must be explicitly verified. Tablet primary touch target is `touch-tablet-chromium`
in [playwright.config.js](../playwright.config.js). Use that viewport
as the canonical "tablet" reference. Touch gesture model is documented
in `reports/touch-*.md` — Phase 2 responsive agent should treat those
existing reports as the *intended* spec when writing TODOs.

---

## 10. Agent coordination quick rules (excerpt of directive Appendix)

- Area agents → `reports/specs/{area_slug}.md`
- Cross-cutting agents → `reports/cross-cutting/{name}.md`
- Orchestrator → `reports/00_*.md`
- Element IDs: `EL-{Screen ID}-{seq}`. Verification IDs: `VER-{EL-ID}-{seq}`.
- Cross-cutting agents reference existing `EL-` IDs; they do **not**
  create new element specs (only flag missing ones in `DISCOVERED.md`
  appendices).
