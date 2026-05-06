# 00 — Performance Context (AFTER Snapshot)

> Re-measurement after the `performance-upgrades-2` Phase 1–4 work.
> Same machine, same commands, same shell as the baseline in
> [00_PERFORMANCE_CONTEXT.md](00_PERFORMANCE_CONTEXT.md). Do not edit
> the baseline file — this is the comparison snapshot.

Captured: **2026-05-08**, branch `performance-upgrades-2`, Windows / PowerShell 5.1, Node v22.

---

## Headline deltas

| Metric | Before | After | Δ |
|---|---:|---:|---:|
| `creator/bundle.js` size | **854.0 KB** (874,048 B) | **643.4 KB** (658,808 B) | **−24.6%** |
| `creator/extras-bundle.js` (new, deferred) | — | **211.6 KB** (216,659 B) | new (loaded after core, lazy-mounted) |
| `creator/import-wizard-bundle.js` | 29.6 KB | 29.6 KB (30,298 B) | unchanged |
| `import-engine/bundle.js` | not separately tracked at baseline | 126.6 KB (129,662 B) | now lazy-loaded on first picker / DnD |
| Build time (`node build-creator-bundle.js`) | **151 ms** | **66 ms** | **−56%** |
| Jest test suite (parallel) | **5,588 ms** for 1,509 tests / 135 suites | **3,761 ms** for 1,597 tests / 147 suites | **−33%** wall-time, **+88 tests**, **+12 suites** |
| `node_modules/` size | **238.52 MB** | **80.60 MB** | **−157.9 MB / −66.2%** |
| `.git/` size | **107.10 MB** | **17.71 MB** | **−89.4 MB / −83.5%** |
| Repository working tree (excl. `.git`, `node_modules`) | **25.40 MB** | **20.94 MB** | **−4.46 MB / −17.6%** |
| Tracked file count (`git ls-files`) | 629 | **586** | −43 |
| `reports/` total file count | **257** | 227 | −30 (after archive sweep + deletes) |
| `reports/` *active* (excludes `_archive/`) | n/a | **49** | active surface area cut from 257 → 49 |

> **What the bundle split bought us**: `creator/bundle.js` is the synchronous critical path; it dropped 24.6%. The new `creator/extras-bundle.js` (legend / prepare / export / shopping-list / materials hub / pdf path) loads after the core via a sibling `<script defer>` and only mounts when the user actually opens those tabs (mount sites are guarded with `typeof window.X !== 'undefined'`). Total payload is roughly unchanged but the time-to-interactive cost moves out of the first paint.

> **What the git rewrite bought us**: dropping the 20 MB historical PDF blob and re-packing brings `.git/` down by ~89 MB; combined with the `node_modules` cleanup, a fresh `git clone && npm install` is now ~247 MB lighter.

---

## Raw measurements

```
BuildMs       : 66
TestMs        : 3761
Bundle        : 658,808
Extras        : 216,659
ImportWizard  : 30,298
ImportEngine  : 129,662
NodeModules   : 84,519,748
Git           : 18,573,103
Tree          : 21,964,949
ReportsTotal  : 227
ReportsActive : 49
Tracked       : 586
```

Commands used (identical to the baseline):

```powershell
# Build
node build-creator-bundle.js | Out-Null
Measure-Command { node build-creator-bundle.js }

# Tests (parallel, same as the baseline run)
Measure-Command { npm test --silent 2>&1 | Out-Null }

# Sizes
(Get-Item creator/bundle.js).Length
(Get-Item creator/extras-bundle.js).Length
(Get-Item creator/import-wizard-bundle.js).Length
(Get-Item import-engine/bundle.js).Length
(Get-ChildItem node_modules -Recurse -File | Measure-Object Length -Sum).Sum
(Get-ChildItem .git        -Recurse -File | Measure-Object Length -Sum).Sum
(Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch '\\(node_modules|\.git)\\' } | Measure-Object Length -Sum).Sum

# File counts
(Get-ChildItem reports -Recurse -File).Count
(Get-ChildItem reports -Recurse -File | Where-Object { $_.FullName -notmatch '\\_archive\\' }).Count
(git ls-files | Measure-Object).Count
```

---

## What changed by section of the action plan

### §1 Quick wins
- `.gitignore` already covered `reports/perf-results/`, jest stray captures, OS junk, IDE noise.
- `.gitattributes` marks all generated bundles (`creator/bundle.js`, new `creator/extras-bundle.js`, `creator/import-wizard-bundle.js`, `import-engine/bundle.js`, font base64, pdf worker, fontkit) as `linguist-generated`/`linguist-vendored` and `-diff`.
- `package.json` now declares `engines.node >= 22` (matches the baseline runtime).

### §2 Cleanup / dependency hygiene
- Six unused npm packages removed at the package-lock level: `acorn`, `prettier`, `@babel/cli`, `@babel/core`, `@babel/preset-react`, `@babel/standalone`. Combined with transitive prune, `node_modules` dropped 158 MB.
- Historical 20.4 MB blob (`Books and Blossoms - 5mm color.pdf`) excised from the pack via a controlled history rewrite; `.git` dropped 89 MB.
- Ten one-off `scripts/*.js` / `.ps1` helpers removed (only the three actively-referenced lint/install-hooks scripts retained).

### §3 Performance optimisations (this session)
- **§3.1 (pre-transpile JSX)** — *deferred*. Would require dismantling the 2A.5 babel-cache loaders; revisit when a real bundler is introduced.
- **§3.2 Bundle split** — `creator/bundle.js` core (28 files) vs `creator/extras-bundle.js` (12 deferred files: legend, prepare, export, shopping list, materials hub, adapt modal, pdfChartLayout, pdfExport, zipBundle, designer branding, adaptation engine, match quality). `CREATOR_CACHE_KEY` hash now includes both bundles and is patched into both `create.html` and `index.html` (previously they could drift).
- **§3.3 Project I/O cache** — `useProjectsAll()` hook in `helpers.js` wraps the H4 cached `ProjectStorage.getProjectsAll()` and listens to `cs:projectsChanged` for invalidation. Existing stats-page / stats-activity / stats-insights call sites already use the cache; future home / project-library callers can swap to the hook.

### §4 Reports / docs cleanup
- Three commits archived ~165 stale reports under `reports/_archive/<topic>/` via `git mv` (rename detection preserved full history). Active surface area cut from 257 → 49 files.
- Deleted: `reports/b3-consolidation-map.md`, `import-engine/pdf/pdfDocLoader.js`, three never-referenced icons (`gridOverlay`, `shoppingCart`, `sync`).
- `docs/test-plans/` archived to `docs/_archive/test-plans/`.
- `TestUploads/*.pdf` deliberately retained at user request — they are required by the importer integration tests.

### §5 Re-measure
- This document.

---

## Notes on the comparison

- The Jest suite **gained 88 tests and 12 suites** during this work yet runs **33% faster** wall-time. Parallelisation default + the cache work (H4 / 2A.5) are the two biggest contributors.
- The `creator/bundle.js` size reduction is real source-line savings (extras moved out), not minification. There is no minifier in the build.
- Browser TTI is not measured here — only build / install / test times and disk footprint. Use `npm run perf:baseline` (Playwright) for the rendering / paint metrics.

---

## Outstanding follow-ups

- §3.1 pre-transpile JSX (deferred — needs a real bundler before it pays off).
- §4 still leaves a small set of "looks dead but isn't" workers and PDF importer flagged in [reports/cleanup/dead-code.md](cleanup/dead-code.md); reviewed but intentionally left in place.
- Re-grade [reports/cleanup/](cleanup/) and [reports/performance/](performance/) once the next round of optimisation lands.
