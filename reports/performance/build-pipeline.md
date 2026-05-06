# Build & Development Pipeline — Performance Audit

**Agent:** 4 (Build & Development Pipeline)
**Branch:** `performance-upgrades-2`
**Date:** 2026-05-06
**Scope:** Read-only audit of [build-creator-bundle.js](../../build-creator-bundle.js), [build-import-bundle.js](../../build-import-bundle.js), [build-symbol-font.js](../../build-symbol-font.js), Jest config, [scripts/install-hooks.js](../../scripts/install-hooks.js), and the lint scripts.

Reference baseline: [reports/00_PERFORMANCE_CONTEXT.md](../00_PERFORMANCE_CONTEXT.md).

---

## Top 3 summary

1. **`npm test -- --runInBand` is ~3.7× slower than default parallel Jest** on this machine (~19.7 s vs ~5.2 s end-to-end). The published baseline (5.59 s for runInBand) is inconsistent with current measurements; in any case the suite *is* parallel-safe (it has been running with `--runInBand` only by convention, not necessity). Dropping `--runInBand` from the recommended developer workflow saves ~14 s per local run with zero code changes. **(I1)**
2. **`build-creator-bundle.js` rewrites `creator/bundle.js` (854 KB) on every invocation, even when nothing changed.** Combined with the artefact being committed, this is the single biggest contributor to `.git` bloat (107 MB pack — the baseline calls this out). The cache-key bumps in `index.html` ARE already idempotent (they diff before writing); the bundle write is not. **(I2)**
3. **No aggregated `npm run build` and no incremental skip across the three build scripts.** [build-creator-bundle.js](../../build-creator-bundle.js), [build-import-bundle.js](../../build-import-bundle.js), and [build-symbol-font.js](../../build-symbol-font.js) are independent ad-hoc Node entry points; only the first is wired into a script. Easy to forget one before committing. **(I3)**

---

## Measurements (this audit, 2026-05-06)

| Command | Wall time |
|---|---:|
| `node build-creator-bundle.js` | **130 ms** |
| `node build-import-bundle.js` | **109 ms** |
| `node scripts/lint-terminology.js` | **199 ms** |
| `node scripts/lint-css-tokens.js` | **152 ms** |
| `npm test --silent` (default, parallel workers) | **5,228 ms** |
| `npm run test:silent` (= `jest --runInBand --silent`) | **19,673 ms** |
| `npx jest --listTests` (count) | **146 files** |

The `--runInBand` regression vs the published 5.6 s baseline is large enough that either (a) the baseline was captured against a substantially smaller suite, or (b) the test count has grown but the worker model is now genuinely faster on this Node 22 / Windows machine. Either way, the recommendation below stands.

---

## Findings (prioritised)

### I1-1 — Drop `--runInBand` from the default developer workflow

- **Evidence:** parallel default 5.2 s vs serial 19.7 s (this audit). [AGENTS.md](../../AGENTS.md) tells contributors to run `npm test -- --runInBand`; [.github/copilot-instructions.md](../../.github/copilot-instructions.md) does too.
- **Why it's parallel-safe today:** every test that touches storage / DOM either uses `fake-indexeddb` (worker-local) or the read-then-eval pattern (entirely in-process). The `tests/.tmp/` directory is the only on-disk state; spot-check shows tests write under `os.tmpdir()` or a per-test path. No global file mutation observed.
- **Action:**
  - Update `package.json` `test:silent` script to drop `--runInBand` (or rename it `test:serial` and add a parallel `test:fast`).
  - Update [AGENTS.md](../../AGENTS.md) and [.github/copilot-instructions.md](../../.github/copilot-instructions.md) to recommend `npm test` (parallel) for local iteration; keep `--runInBand` only for CI flake-investigation.
- **Measurement method:**
  ```pwsh
  $t = Measure-Command { npm test --silent 2>&1 | Out-Null }; $t.TotalSeconds
  $t = Measure-Command { npm run test:silent --silent 2>&1 | Out-Null }; $t.TotalSeconds
  ```
  Repeat 3× and take the median to neutralise warm-cache effects.
- **Risk:** Low. If a worker-isolation issue surfaces, revert the package.json change; CI can keep using `--runInBand`.

### I2-1 — `build-creator-bundle.js` should hash-skip when output is unchanged

- **Evidence:** [build-creator-bundle.js](../../build-creator-bundle.js) lines 65–73 unconditionally call `fs.writeFileSync('creator/bundle.js', ...)`. Same for `creator/import-wizard-bundle.js` at lines 88–96. Only the `index.html` cache-key updates check `updated !== html` before writing.
- **Cost:** every regeneration produces a new 854 KB blob. The baseline notes "`creator/bundle.js` appears dozens of times in history (every regen is a new blob)" as the dominant cause of the 107 MB `.git` pack.
- **Action:**
  1. Compute `sha256(bundle)`; read the existing file (if it exists), compare. Only `writeFileSync` when bytes differ.
  2. Same for the import-wizard bundle.
  3. Optionally print `bundle.js unchanged (cache hit)` for visibility.
- **Measurement method:**
  - Before: `Measure-Command { node build-creator-bundle.js }` then again immediately — currently ~130 ms both times, and `git status` shows the file modified.
  - After: second run should show `git status` clean and complete in <80 ms (skips two `writeFileSync` calls totalling ~880 KB of disk I/O).
- **Combined with I4-1 (un-tracking the artefact):** removes the recurring blob-per-build entirely.

### I2-2 — Tests re-read large source files in many suites; share a per-worker cache

- **Evidence (read-only audit):** `tracker-app.js` (434 KB) is `fs.readFileSync`'d in at least 6 different test files (commandPalettePhase6, headerProjectSwitcher, cross-mode-persistence, editModeBanner, liveAutoStitchesClamp, parkMarkerCorners, dragMark, c3DragMarkColourLock, c3LegacyHandlersRemoved). `helpers.js`, `colour-utils.js`, and `creator/useCreatorState.js` are each read by 5+ suites. Many are also `eval`-ed (per the documented test pattern in [.github/copilot-instructions.md](../../.github/copilot-instructions.md)).
- **Cost:** at parallel (4 workers on this box) the I/O hit is mostly absorbed, but the eval cost is not: a 434 KB JSX string is parsed by V8 every time it appears in a fresh suite. Likely accounts for a measurable slice of the 5.2 s parallel total.
- **Action:**
  - Add `tests/_fixtures.js`: `function loadSrc(rel) { return CACHE[rel] ||= fs.readFileSync(...) }` — Node's CommonJS module cache makes this a per-worker singleton automatically.
  - For evals, expose a `loadAndEval(rel, sandbox)` helper that caches the *parsed function form* (e.g. `new Function(...)`) keyed by relative path.
- **Measurement method:**
  ```pwsh
  npx jest --runInBand --logHeapUsage 2>&1 | Tee-Object jest-heap.log
  # Sort suites by reported time after the run; baseline the worst 10.
  ```
  Then re-run after wiring the cache and compare the same 10 suite times.
- **Complexity:** moderate — needs touching ~30 test files. Consider opening as I3 if the per-suite times turn out to be small.

### I2-3 — Two unrelated "build" scripts share confusing names

- **Evidence:** [build-creator-bundle.js](../../build-creator-bundle.js) builds `creator/bundle.js` AND inline-builds `creator/import-wizard-bundle.js` (lines 75–96). [build-import-bundle.js](../../build-import-bundle.js) is a completely separate script that builds `import-engine/bundle.js`. Very easy to mistake one for the other; only the first is in `package.json` (`build:creator`).
- **Action:**
  - Add `npm run build:import` → `node build-import-bundle.js`.
  - Add `npm run build:font` → `node build-symbol-font.js` (gated on `opentype.js` being installed; today the script `process.exit(1)`s otherwise).
  - Add `npm run build` → runs all three, ideally with the I2-1 hash-skip so unchanged outputs are no-ops.
- **Measurement method:** before/after `git status` after a fresh `npm run build` — should be empty when source is unchanged.

### I3-1 — One-time JSX pre-transpile for development

- **Evidence:** [.github/copilot-instructions.md](../../.github/copilot-instructions.md) and the baseline pain-points both flag in-browser Babel as the largest startup cost. The repo already invalidates compiled output via the auto-bumped `*_CACHE_KEY` constants in [index.html](../../index.html), so a pre-transpile step would slot in cleanly.
- **Action (incremental):**
  1. Add `npm run dev:transpile` → reads each Babel-cached source (`creator-main.js`, `tracker-app.js`, `stats-activity.js`, `stats-insights.js`, `stats-page.js`), uses `@babel/core` (already in devDeps) with `@babel/preset-react` (also in devDeps) to write `*.compiled.js` siblings.
  2. Have [serve.js](../../serve.js) optionally serve `*.compiled.js` when present for `*.js` requests when a `?dev=1` query is set, so production behaviour is untouched.
  3. Production deploys keep using Babel Standalone (no architectural change).
- **Measurement method:** Lighthouse / DevTools "scripting" budget on `create.html` cold load before vs after enabling the dev flag. (Coordinate with Agent 1.)
- **Note:** other agents likely own the runtime side; this is the build-side enabler only.

### I3-2 — Add `css-tokens` lint to pre-commit (and CI)

- **Evidence:** [.husky/pre-commit](../../.husky/pre-commit) only runs `node scripts/lint-terminology.js`. `scripts/lint-css-tokens.js` is exposed via `npm run lint:css-tokens` but is not invoked anywhere automated. It runs in 152 ms — well under any "feels slow" threshold.
- **Action:** append `node scripts/lint-css-tokens.js` to the pre-commit hook (gated on `*.css` being staged), and add both lints to a CI workflow if one exists.
- **Measurement method:** combined pre-commit overhead ≈ 350 ms (terminology + css-tokens), still imperceptible.

### I3-3 — `scripts/install-hooks.js` is correct as-is; document the husky duality

- **Evidence:** [scripts/install-hooks.js](../../scripts/install-hooks.js) runs on every `npm install` via the `prepare` script. It's <100 ms (single `git config core.hooksPath` + a `chmod` loop on Unix). It correctly skips outside a git working tree (CI tarballs).
- **Action:** none required for performance. Optional I4: drop the legacy `.githooks/` fallback path now that Husky is a hard dep.

### I3-4 — `build-symbol-font.js` is idempotent in spirit but doesn't skip writes

- **Evidence:** [build-symbol-font.js](../../build-symbol-font.js) regenerates `assets/fonts/CrossStitchSymbols.ttf` and a base64 sibling whenever it runs. Not in `package.json`; only run manually when `creator/symbolFontSpec.js` changes.
- **Action:** apply the same hash-skip pattern as I2-1. Low priority — this script almost never runs.

### I4-1 — Stop tracking generated bundles in git

- **Evidence:** `creator/bundle.js`, `creator/import-wizard-bundle.js`, and `import-engine/bundle.js` are all marked `AUTO-GENERATED` in their banners and all tracked.
- **Action (coordinate with Agent 9 / repo cleanup):**
  - Add the three bundle paths to `.gitignore`.
  - Have CI / `serve.js` invoke `npm run build` on startup so they're never missing.
  - Combined with I2-1 this finally fixes the `.git` growth pattern.
- **Measurement method:** track `.git` pack size over the next 50 commits before and after.

### I4-2 — Optional: rename / reorganise build scripts under `scripts/`

- **Evidence:** all three top-level `build-*.js` files clutter the repo root; [scripts/](../../scripts/) already houses lint and install-hooks helpers.
- **Action:** move them to `scripts/build/` and update `package.json`. Hygiene only.

---

## Things explicitly checked and found OK

- **Jest CommonJS:** `package.json` declares `"type": "commonjs"` and tests use `require()`. No ESM transform overhead in the worker spin-up. Good.
- **`testPathIgnorePatterns`** correctly excludes `tests/e2e/` and `tests/perf/` (Playwright). No accidental Playwright runs in the unit suite.
- **Cache-key bumps in [build-creator-bundle.js](../../build-creator-bundle.js)** ARE idempotent — the loop at lines 142–162 only writes `index.html` when at least one key changed (`if (changed) fs.writeFileSync(...)`). No needless `index.html` churn.
- **`scripts/install-hooks.js` `prepare` hook** is fast (<100 ms) and a no-op outside a git repo. Not a perf hotspot.

---

## Suggested ordering

1. (I1) Drop `--runInBand` from docs & `test:silent` script — minutes of work, immediate ~14 s saving per local run.
2. (I2-1) Hash-skip in `build-creator-bundle.js` — straightforward, eliminates spurious bundle blobs even before I4-1 lands.
3. (I2-3) Add `npm run build` and `build:import` / `build:font` aliases.
4. (I3-2) Add css-tokens to pre-commit.
5. (I4-1) Un-track generated bundles (do this together with I2-1; needs Agent 9 coordination).
6. (I2-2) Test fixture cache — only if heap/timing measurements show a real win.
7. (I3-1) Pre-transpile dev mode — biggest UX win but largest scope; defer behind Agent 1's runtime work.
