# Architecture Pass — Quarter C

> **Audience:** engineers and AI coding agents about to pick up any C-series
> ticket from [reports/ux-8-post-B-audit.md](ux-8-post-B-audit.md).
> **Status:** living document; update when subsystems shift.

---

## 1. Purpose

Quarter C ticket work touches a wide cross-section of the app — help and
onboarding (C1, C8, C11), preferences (C2, C3), Materials Hub layout (C4),
shopping list scoping (C5), bundle export (C6), image import (C7), the home
screen (C9), and the sidebar shell (C10). Without a shared mental model of
the entry points, storage, and cross-cutting subsystems, every ticket
re-discovers the same constraints (no module system, three IndexedDBs, the
creator bundle build, the no-emoji rule). This document captures that model
once so each ticket can start with implementation rather than orientation.
It is **not** a per-ticket plan; per-ticket plans live in
`reports/c<n>-plan-*.md` (see C3 and C8 for the template).

---

## 2. High-level architecture

The app is a fully client-side PWA. There is **no module system** in the
runtime: everything is loaded via plain `<script>` tags and exposes itself
as a `window.*` global.

### Three HTML entry points

| File | Page | React root | Hosts |
|---|---|---|---|
| [index.html](../index.html) | Pattern Creator | `creator-main.js` → `creator/bundle.js` | image → pattern conversion, palette/legend, materials, export |
| [stitch.html](../stitch.html) | Stitch Tracker | `tracker-app.js` | per-cell stitching progress, parking, stats |
| [manager.html](../manager.html) | Stash Manager | `manager-app.js` | DMC inventory, pattern library, shopping |

All three pages share the same script load order — see [index.html](../index.html) lines 1–120 for the canonical sequence. Roughly:

```
constants → dmc-data → colour-utils → helpers → import-formats
→ components → header → modals → threadCalc → project-storage
→ stash-bridge → backup-restore → home-screen → palette-swap
→ user-prefs → apply-prefs → toast → icons → help-drawer
→ (page-specific app) → creator/bundle.js (Creator only)
```

### React + Babel via CDN

- React 18 and ReactDOM are CDN globals (`window.React`, `window.ReactDOM`).
- `@babel/standalone` compiles JSX **at runtime in the browser**, with
  compiled output cached in `localStorage` under keys like
  `babel_tracker_v15`, `babel_creator_v9`, `babel_stats_v4`. Bumping the
  cache key (e.g. `CREATOR_CACHE_KEY` in [index.html](../index.html)) busts
  every user's stale compile.
- There is no Babel pre-compilation step on disk for the page-level JSX.

### The creator bundle (the only real "build")

Everything under [creator/](../creator/) is **concatenated** (not
transpiled) into [creator/bundle.js](../creator/bundle.js) by
[build-creator-bundle.js](../build-creator-bundle.js). The concatenation
order is hard-coded in `ORDER` at the top of that file (currently 38 files,
ending with `MaterialsHub.js` because it depends on its sub-tabs). The
build script also auto-bumps `CREATOR_CACHE_KEY` when bundle content
changes, so users pick up the new bundle automatically.

**Never edit `creator/bundle.js` directly.** Edit the source file and run
`node build-creator-bundle.js`.

---

## 3. Storage topology

### Three IndexedDB databases

| Database | Version | Object stores | Owner |
|---|---|---|---|
| `CrossStitchDB` | 3 | `projects`, `project_meta`, `stats_summaries` | Creator + Tracker |
| `stitch_manager_db` | 1 | `manager_state` (keyed: `threads`, `patterns`, …) | Stash Manager |
| (browser-managed) Cache Storage v* | n/a | service-worker asset cache | [sw.js](../sw.js) |

- Project rows in `CrossStitchDB.projects` are keyed `proj_<timestamp>`,
  with a legacy `auto_save` row for the pre-multi-project format.
  [project-storage.js](../project-storage.js) is the singleton API.
- [stash-bridge.js](../stash-bridge.js) is the cross-DB shim — any page can
  read/write the Stash Manager's threads and patterns without owning that DB.

### `localStorage` keys (the load-bearing ones)

| Key | Purpose |
|---|---|
| `crossstitch_active_project` | Pointer into `CrossStitchDB.projects` |
| `babel_tracker_v15` / `babel_creator_v9` / `babel_stats_v4` | Compiled JSX cache |
| `crossstitch_prefs` | `UserPrefs` JSON blob (see §4) |
| `crossstitch_onboarding_*` | One-shot wizard / coachmark dismiss flags |

### Preferences

[user-prefs.js](../user-prefs.js) owns the `DEFAULTS` map and exposes
`window.UserPrefs.{get,set,setDebounced}`. [apply-prefs.js](../apply-prefs.js)
listens for `cs:prefsChanged` and updates `<html>` classes (theme, accent,
a11y) plus `window.AppPrefs.formatCurrency / formatLength` helpers.
[preferences-modal.js](../preferences-modal.js) is the workbench UI.

Adding a new preference is always three steps:

1. Add to `DEFAULTS` in `user-prefs.js`.
2. Add a `Row` to the relevant category in `preferences-modal.js`.
3. Read it in the consuming page's lazy initialiser (with the legacy
   `localStorage` fallback if applicable — see
   [creator/useCreatorState.js](../creator/useCreatorState.js) `loadUserPref`).

---

## 4. Cross-cutting subsystems

These are the systems any C-series ticket is likely to touch. Treat them as
load-bearing — do not fork or shadow them.

### Help drawer + search — [help-drawer.js](../help-drawer.js)

Renders the in-app help overlay on every page. Owns the topic index, the
search box, and the alias map (C11). New help content adds a topic entry
plus, where the search term is non-obvious, a row in the alias table so
British/US/colloquial spellings resolve to the same topic.

### Onboarding wizard + coachmarks

- [onboarding-wizard.js](../onboarding-wizard.js) — first-run multi-step
  modal already in production. Uses `localStorage` one-shot flags.
- **Planned:** `coaching.js` (C8) — single-step coachmark primitive that
  spotlights a target element with copy + "Got it" dismiss. C7's image
  import wizard is expected to reuse C8's overlay chrome rather than build
  its own. See [reports/c8-plan-first-stitch-coaching.md](c8-plan-first-stitch-coaching.md).

### Toast — [toast.js](../toast.js)

Single API: `window.Toast.show({ message, type, duration, undoAction })`.
**Passing a raw string yields an empty toast** — always use the options
object. Types are `info | success | warn | error`.

### Icons — [icons.js](../icons.js)

`window.Icons.{name}()` returns inline SVG (24×24, 1.6 stroke-width,
`currentColor`). **No emoji in user-facing UI** — see [AGENTS.md](../AGENTS.md).
If a needed icon doesn't exist, add it (matching the existing line/style)
and update the snapshot in [tests/icons.test.js](../tests/icons.test.js)
with `--updateSnapshot`.

### Preferences modal — [preferences-modal.js](../preferences-modal.js)

12-category sidebar workbench. Categories include Accessibility, Theme,
Behaviour, Materials, Export, etc. Settings flagged "Coming soon" persist
to `UserPrefs` but aren't yet wired to runtime — be explicit about which
state a new toggle is in.

### Project & Stash storage — [project-storage.js](../project-storage.js), [stash-bridge.js](../stash-bridge.js)

Use the singletons. Don't open IndexedDB directly from a feature file —
that bypasses migration handling and the cross-DB bridge.

### Worker offload

| Worker | Owner | Used for |
|---|---|---|
| [analysis-worker.js](../analysis-worker.js) | Creator | image analysis (saliency, edges) |
| [generate-worker.js](../generate-worker.js) | Creator | pattern generation pipeline |
| [pdf-export-worker.js](../pdf-export-worker.js) | Creator | Pattern Keeper-compatible PDF render (pdf-lib + bundled symbol font) |

Workers receive plain data, post plain data back. They cannot touch
`window`/IndexedDB directly. Heavy work added by a C ticket (e.g. C6 zip
bundling) should consider whether it belongs on a worker, especially since
zipping a multi-MB PDF on the main thread will jank the UI.

---

## 5. Quarter C dependency graph

```
Phase 1 — leaf / shipped fixes (no inter-dependencies)
  C1  visible help                ──┐
  C2  drag-mark Pref toggle       ──┤
  C5  shopping list scope caption ──┤   independent; shipped in fix-3.x branch
  C9  home bulk-delete modal      ──┤
  C10 sidebar fade cue            ──┤
  C11 help search aliases         ──┘

Phase 2 — independent medium tickets
  C2 (shipped) ──► C3  drag-mark default-on coordination
                       (gated by C2's toggle existing; see
                        reports/c3-plan-b2-default-on.md)
  C4  Materials Hub visual hierarchy   (independent; touches MaterialsHub.js
                                        and its three sub-tabs)
  C6  zip bundle export                (reuses existing PDF / OXS / JSON
                                        exporters; pure composition)

Phase 3 — large, ordered
  C8  first-stitch coaching primitive  (introduces coaching.js overlay)
        │
        ▼
  C7  image import wizard              (reuses C8's overlay chrome for
                                        per-step spotlight + copy)
```

Key edges to remember:

- **C8 → C7**: do C8 first so C7 can reuse the primitive. Building C7's
  wizard ad-hoc and then retrofitting it onto C8 is strictly more work.
- **C2 → C3**: C2 ships the Preferences toggle; C3 flips its default and
  coordinates the migration of existing users. Don't change defaults
  without C2 already in production.
- **C6 ⟂ everything else**: zip export only depends on the existing
  exporters (`creator/pdfExport.js`, the OXS exporter in
  [import-formats.js](../import-formats.js), `JSON.stringify` of the
  project). It's a parallelisable workstream.

---

## 6. Recommended ordering

| Phase | Tickets | Size | Notes |
|---|---|---|---|
| **1 — already shipped** (this PR) | C1, C2, C5, C9, C10, C11 + 3.x pinch fixes | S | Leaf fixes, no inter-deps; verified by current test suite. |
| **2 — next, sequential, M-sized** | C3 → C4 → C6 | M | C3 first because the default-on flip has the highest UX risk; C4 is purely visual; C6 is composition over existing exporters. |
| **3 — L-sized, sequential** | C8 → C7 | L | Build the coachmark primitive (C8), then build the wizard (C7) on top of it. |

Phase 2 and 3 should each go in their own PR per ticket — the diffs are
non-trivial and the review surface is different.

---

## 7. Conventions every Quarter C ticket must follow

- **British English** in user-facing strings ("colour", "organiser",
  "behaviour", "centre"). [scripts/lint-terminology.js](../scripts/lint-terminology.js)
  catches the common slips.
- **No emoji** anywhere a user might see it — buttons, toasts, modals,
  help-overlay markdown, status badges. Use `window.Icons.{name}()`. The
  symbol marks ✓ ✗ ⚠ ℹ → ← ▸ ✕ count as emoji for this rule; use
  `Icons.check`, `Icons.x`, `Icons.warning`, `Icons.info`, `Icons.pointing`.
- **After editing any `creator/*.js` file**, run
  `node build-creator-bundle.js`. The script auto-bumps `CREATOR_CACHE_KEY`
  in [index.html](../index.html); only bump it manually if you've changed
  `creator-main.js` itself or want to force-bust the legacy cache.
- **Before committing**: `npm test -- --runInBand` (Jest, ~30 suites,
  in-band for determinism) **and** `npm run lint:terminology`.
- **Mobile form hygiene** — every new form input needs:
  `inputMode="numeric"` for numeric fields, `enterkeyhint="search"` on
  search boxes, `autocomplete` hints on personal-data fields, `maxLength`
  on bounded text, scrollable modal containers, and inline error messages
  (not `alert()`).
- **Test file pattern** — tests load source via `fs.readFileSync` + `eval`
  or `new Function(...)` rather than `require()`, because the runtime files
  are browser globals not CJS modules. Provide minimal stubs for `window`,
  `React`, `ReactDOM`, `navigator`, `CustomEvent`, `localStorage`, etc., at
  module scope. [tests/helpDrawer.test.js](../tests/helpDrawer.test.js) is
  the canonical reference template.

---

## 8. Risks & failure modes

| Risk | Symptom | Mitigation |
|---|---|---|
| Forgetting to rebuild `creator/bundle.js` | Source change works in dev with hard reload of individual files but CI diff fails / users see old behaviour | `node build-creator-bundle.js` in pre-commit; the install-hooks script wires this up. |
| Stale `babel_*` localStorage cache | "Works on my machine" — old compiled JSX runs even after you edit source | Bump the relevant `*_CACHE_KEY` constant in the entry HTML; `build-creator-bundle.js` does this for `CREATOR_CACHE_KEY` automatically. |
| Missing browser stubs in new tests | `ReferenceError: React is not defined`, factory returns `undefined`, `CustomEvent is not defined` | Copy the stub block from `tests/helpDrawer.test.js`; declare stubs at module scope before the `eval`. |
| Emoji slips in (esp. via Markdown help copy or toast strings) | Inconsistent rendering across OS, fails accessibility review | `npm run lint:terminology` flags pictographic emoji and the symbol-mark shortlist; use `Icons.*` instead. |
| Touching [tracker-app.js](../tracker-app.js) while drag-mark code is dual-implemented (C3 transition) | Behaviour diverges between flag-on and flag-off paths; subtle stitching bugs | Read both branches before editing; prefer adding to the new path and mirroring to the old until C3 lands. |
| Adding heavy work (e.g. C6 zip) on the main thread | Long task warnings, jank during export, possibly the watchdog overlay firing | Push to a worker (mirror the pattern in [pdf-export-worker.js](../pdf-export-worker.js)); post `Transferable` buffers where possible. |
| Touching the Stash Manager DB without the bridge | Cross-page state desync, lost writes | Always go through [stash-bridge.js](../stash-bridge.js). |
| Help drawer search misses obvious queries | C11-style spelling/alias gaps | Add to the alias map in [help-drawer.js](../help-drawer.js) and a unit test asserting the alias resolves. |

---

## 9. References

### Project conventions
- [.github/copilot-instructions.md](../.github/copilot-instructions.md) — full project guidance
- [AGENTS.md](../AGENTS.md) — house rules (no-emoji, bundle rebuild)
- [TERMINOLOGY.md](../TERMINOLOGY.md) — British-English vocabulary

### Build & test
- [build-creator-bundle.js](../build-creator-bundle.js#L13-L48) — `ORDER` array & cache-key bump
- [package.json](../package.json#L8-L16) — `test`, `lint:terminology`, `build:creator` scripts
- [scripts/lint-terminology.js](../scripts/lint-terminology.js)

### Entry points
- [index.html](../index.html) — Creator (script load order)
- [stitch.html](../stitch.html) — Tracker
- [manager.html](../manager.html) — Stash Manager

### Subsystems
- Help: [help-drawer.js](../help-drawer.js)
- Onboarding: [onboarding-wizard.js](../onboarding-wizard.js)
- Toast: [toast.js](../toast.js#L60-L67)
- Icons: [icons.js](../icons.js), [tests/icons.test.js](../tests/icons.test.js)
- Preferences: [user-prefs.js](../user-prefs.js), [apply-prefs.js](../apply-prefs.js), [preferences-modal.js](../preferences-modal.js)
- Storage: [project-storage.js](../project-storage.js), [stash-bridge.js](../stash-bridge.js)
- Workers: [analysis-worker.js](../analysis-worker.js), [generate-worker.js](../generate-worker.js), [pdf-export-worker.js](../pdf-export-worker.js)

### Quarter C inputs & plans
- [reports/ux-8-post-B-audit.md](ux-8-post-B-audit.md) — source of all C tickets
- [reports/c3-plan-b2-default-on.md](c3-plan-b2-default-on.md) — C3 detailed plan
- [reports/c8-plan-first-stitch-coaching.md](c8-plan-first-stitch-coaching.md) — C8 detailed plan
