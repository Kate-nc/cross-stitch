# Agent 10 — Configuration & Tooling Debt

**Audit date:** 2026-05-06 · **Branch:** `performance-upgrades-2` · **Scope:**
[package.json](../../package.json), [playwright.config.js](../../playwright.config.js),
[sw.js](../../sw.js), [manifest.json](../../manifest.json), [vercel.json](../../vercel.json),
[.gitignore](../../.gitignore), [.github/](../../.github), [.husky/](../../.husky),
[.githooks/](../../.githooks), [scripts/install-hooks.js](../../scripts/install-hooks.js),
the inline Jest config and the `tests/` `readFileSync + eval` scaffolding.

Read-only audit. No code changed. Cross-references existing audits in
[reports/performance/build-pipeline.md](../performance/build-pipeline.md) and
[reports/performance/dependencies.md](../performance/dependencies.md) where relevant — this
report focuses on the **config surface** specifically and does not re-litigate findings already
filed there.

Severity scale per [00_PERFORMANCE_CONTEXT.md](../00_PERFORMANCE_CONTEXT.md) §6.

---

## Top 3

1. **Service-worker precache list is materially out of sync with the actual `<script>` graph
   (I1).** ~17 first-party JS files loaded on `create.html`/`stitch.html` are NOT in
   [sw.js](../../sw.js) `PRECACHE_URLS`, including the two Web Workers
   ([analysis-worker.js](../../analysis-worker.js), [generate-worker.js](../../generate-worker.js))
   and the four lazy-loaded Babel-transpiled stats/tracker pages. Result: first offline visit
   after install fails for any user who routes through the tracker, stats, or magic-wand
   features. See finding §C1 below for the full list.
2. **Three "shadow" config commitments with no actual config (I2).** `prettier` and
   `acorn` are declared as production `dependencies` with **zero** `require()` references
   anywhere in the repo and **no `.prettierrc`** to make `prettier` runnable as a formatter
   (already noted in [reports/performance/dependencies.md](../performance/dependencies.md);
   tracked here as a config-surface item). The Husky install path also configures
   `core.hooksPath` but the only hook installed
   ([.husky/pre-commit](../../.husky/pre-commit)) duplicates the older
   [.githooks/pre-commit](../../.githooks/pre-commit), so two competing hook trees ship
   in the repo.
3. **No CI workflow runs `npm test` or either lint script (I1).** The only file under
   [.github/workflows/](../../.github/workflows) is
   [bump-version.yml](../../.github/workflows/bump-version.yml), which only bumps the
   patch version after a merge. The terminology lint runs only via the local pre-commit
   hook (which a contributor can bypass with `--no-verify` or by skipping `npm install`
   on a fresh clone), and `lint:css-tokens` runs nowhere automatically. Tests therefore
   only fail on a developer's own machine.

---

## I0 — Critical

_None._ The current configuration boots and serves the app correctly. All findings below
are degradation, debt, or policy gaps rather than active breakage.

---

## I1 — High

### C1. `sw.js` precache omits ~17 first-party scripts and both Web Workers

**Files:** [sw.js](../../sw.js) lines 1–68, vs. the canonical script graph in
[create.html](../../create.html) lines 71–113.

**Evidence (cross-referenced list_dir + grep against the precache array):**

| File | Loaded by | In `PRECACHE_URLS`? |
|---|---|---|
| [analysis-worker.js](../../analysis-worker.js) | `new Worker(...)` from [tracker-app.js](../../tracker-app.js#L2127) | **No** |
| [generate-worker.js](../../generate-worker.js) | `new Worker(...)` from [creator/useCreatorState.js](../../creator/useCreatorState.js#L978) and [creator/bundle.js](../../creator/bundle.js#L6281) | **No** |
| [coaching.js](../../coaching.js) | `<script>` in `create.html` | **No** |
| [keyboard-utils.js](../../keyboard-utils.js) | `<script>` in `create.html` | **No** |
| [shortcuts.js](../../shortcuts.js) | `<script>` in `create.html` | **No** |
| [touch-constants.js](../../touch-constants.js) | `<script>` in `create.html` | **No** |
| [useDragMark.js](../../useDragMark.js) | `<script>` in `create.html` | **No** |
| [components/PartialStitchThumb.js](../../components/PartialStitchThumb.js) | `<script>` in `create.html` | **No** |
| [components/Overlay.js](../../components/Overlay.js) | `<script>` in `create.html` | **No** |
| [help-drawer.js](../../help-drawer.js) | `<script>` in `create.html` | **No** |
| [onboarding-wizard.js](../../onboarding-wizard.js) | `<script>` in `create.html` | **No** |
| [project-library.js](../../project-library.js) | `<script>` in `create.html` | **No** |
| [apply-prefs.js](../../apply-prefs.js) | `<script>` in `create.html` | **No** |
| [toast.js](../../toast.js) | `<script>` in `create.html` | **No** |
| [command-palette.js](../../command-palette.js) | `<script>` in `create.html` | **No** |
| [preferences-modal.js](../../preferences-modal.js) | `<script>` in `create.html` | **No** |
| [insights-engine.js](../../insights-engine.js) | `<script>` in `create.html` | **No** |
| [stats-page.js](../../stats-page.js) | lazy `fetch()` in `create.html` | **No** |
| [stats-activity.js](../../stats-activity.js) | lazy `fetch()` in `create.html` | **No** |
| [stats-insights.js](../../stats-insights.js) | lazy `fetch()` in `create.html` | **No** |

**Why this matters:** the runtime fetch handler does fall back to a stale-while-revalidate
write for same-origin assets (see [sw.js](../../sw.js) lines 184–202), so most of these
files _will_ be cached after the first online navigation. But:

- A user who installs the PWA and immediately goes offline without first opening the
  tracker / stats panels will get a broken app on next load (workers and stats files
  never reached the cache).
- The "lazy app code" branch in [sw.js](../../sw.js) is **network-first** (lines 168–183),
  not stale-while-revalidate, so on the first post-deploy visit the SW must reach the
  network for every uncached file. Precaching them at install time avoids the
  every-deploy waterfall.

**Recommendation:** add the 20 paths above to `PRECACHE_URLS` and bump `CACHE_NAME` to
`v42`. Consider auto-generating the list from a list_dir of root + creator/ + components/
during the build step so it cannot drift again.

**Measurement:**
```powershell
# Before:
$precache = (Get-Content sw.js -Raw) -split "`n" | Where-Object { $_ -match "^\s*'\./" }
$precache.Count   # currently 38 local entries

# After: should equal first-party JS file count + html + assets.
```

### C2. No CI: tests, terminology lint, css-token lint never run on PRs

**Files:** [.github/workflows/](../../.github/workflows) (only `bump-version.yml` exists).

The pre-commit hook ([.husky/pre-commit](../../.husky/pre-commit)) only runs
`scripts/lint-terminology.js` and only on staged `.js | .jsx | .md | .html` files, and
relies on `npm install` having executed successfully on each contributor's machine to
wire up `core.hooksPath`. There is no enforcement that:

- `npm test` passes before merge,
- `node scripts/lint-css-tokens.js` passes,
- `creator/bundle.js` is up to date with its source files (the existing
  [tests/creatorBundleCompleteness.test.js](../../tests/creatorBundleCompleteness.test.js)
  test would catch this — but only if tests actually run).

**Recommendation:** add `.github/workflows/ci.yml` that runs on every push and pull
request to `main`/`performance-upgrades-2` and executes:

```yaml
- run: npm ci
- run: node build-creator-bundle.js
- run: node build-import-bundle.js
- run: git diff --exit-code creator/bundle.js import-engine/bundle.js
- run: npm test -- --runInBand
- run: node scripts/lint-terminology.js
- run: node scripts/lint-css-tokens.js
```

The `git diff --exit-code` step catches the most common contributor mistake (editing a
`creator/*.js` file without re-running the bundler).

**Measurement:** before — zero workflow runs `npm test`; after — every PR shows a passing
CI tick.

---

## I2 — Medium

### C3. Two parallel hook trees: `.husky/` and `.githooks/`

**Files:** [.husky/pre-commit](../../.husky/pre-commit),
[.githooks/pre-commit](../../.githooks/pre-commit),
[scripts/install-hooks.js](../../scripts/install-hooks.js) (lines 50–79).

`scripts/install-hooks.js` prefers `.husky/` when the `husky` package is present (always
true after `npm install`) and falls back to `.githooks/` only if Husky resolution fails.
This means `.githooks/pre-commit` is effectively dead in normal developer setup, but it
is still tracked and could drift from `.husky/pre-commit` (currently the two are
near-identical but not byte-for-byte: the Husky version uses a literal `✗` character in
its own warning message — see line 17 — which is a pictographic character the project's
own AGENTS.md house rule forbids in user-facing strings).

**Recommendations:**

1. Pick one path. Husky 9 is already a devDependency and removes the husky.sh shim, so
   `.husky/pre-commit` is the leaner choice. Delete `.githooks/` and the fallback branch
   in `scripts/install-hooks.js` (lines 65–82).
2. While editing the surviving hook, replace the `✗` in the failure message with plain
   ASCII (`X` or `[FAIL]`) to comply with [AGENTS.md](../../AGENTS.md) — terminal output
   to a developer is still "user-facing" by the wording of the rule.

### C4. Husky pre-commit assumes a POSIX shell — won't run on Windows `cmd.exe`

**File:** [.husky/pre-commit](../../.husky/pre-commit) (lines 1, 9).

The hook uses `#!/usr/bin/env sh` and a POSIX `if [ -z "$STAGED" ]` test plus a `grep -E`
pipe. On Windows, Git for Windows ships its own `sh.exe` and Git invokes hooks through
it, so this works for **most** Windows contributors — but anyone using a Git client that
bypasses the bundled bash (e.g. SourceTree configured to use system Git, Tower with a
custom binary, or a barebones MSYS install missing `grep -E`) will see a no-op hook with
no warning.

**Recommendation:** rewrite the hook in Node so it has the same portability guarantees as
`scripts/install-hooks.js`. Two-line change in
[.husky/pre-commit](../../.husky/pre-commit):

```sh
#!/usr/bin/env sh
exec node scripts/lint-terminology.js --staged-only
```

…and have `lint-terminology.js` accept `--staged-only`, calling `git diff --cached
--name-only` itself (it already shells `git` in some paths). This makes the hook
self-test on every CI run too (see C2).

### C5. `vercel.json` rewrites omit `/stitch` and `/manager`

**File:** [vercel.json](../../vercel.json) (lines 6–10).

```json
"rewrites": [
  { "source": "/", "destination": "/home.html" },
  { "source": "/home", "destination": "/home.html" },
  { "source": "/create", "destination": "/create.html" }
]
```

The audit context describes "five HTML entry points (home/index/create/stitch/manager)"
and the SW precaches all five, but only three of them are reachable via clean URLs in
production. A user who bookmarks `https://<host>/stitch` instead of
`https://<host>/stitch.html` will hit a 404. `cleanUrls: false` is set so Vercel will not
auto-rewrite for us.

**Recommendation:** add the missing rewrites:

```json
{ "source": "/index",   "destination": "/index.html" },
{ "source": "/stitch",  "destination": "/stitch.html" },
{ "source": "/manager", "destination": "/manager.html" }
```

The existing `tests/vercel-config.test.js` would benefit from a parametrised assertion
that every page in the precache list has a matching rewrite (or at minimum every
entry-point page).

### C6. Jest config is inline in `package.json` and `testMatch` is implicit

**File:** [package.json](../../package.json) lines 21–27.

```json
"jest": {
  "testPathIgnorePatterns": [ "/node_modules/", "/tests/e2e/", "/tests/perf/" ]
}
```

Three issues:

- **Implicit testMatch.** Jest defaults to `**/*.test.js` + `**/__tests__/**`. This works
  today but means a test file accidentally named `*.spec.js` (the Playwright convention,
  used in [tests/perf/*.spec.js](../../tests/perf/) and
  [tests/e2e/*.spec.js](../../tests/e2e/)) outside the ignored directories would be picked
  up as a Jest test and crash. Setting an explicit `testMatch: ["<rootDir>/tests/**/*.test.js"]`
  would also let `testPathIgnorePatterns` shrink because `tests/perf/*.spec.js` and
  `tests/e2e/*.spec.js` would no longer match `testMatch`.
- **No `testEnvironment`.** Defaults to `node`. Several tests use `fake-indexeddb`
  (declared as a devDep) but nothing in the config wires it as a setup file — every
  test that needs IDB has to import it manually. A `setupFilesAfterEach: ["fake-indexeddb/auto"]`
  declaration would centralise this.
- **No shared scaffold for the `readFileSync + eval` test pattern.** 20+ test files
  duplicate `const SRC = fs.readFileSync(path.join(__dirname, "..", "<file>"), "utf8")`
  (sample: [tests/c8CoachmarkProps.test.js](../../tests/c8CoachmarkProps.test.js#L60),
  [tests/c7ImportWizardA11y.test.js](../../tests/c7ImportWizardA11y.test.js#L9),
  [tests/c3LegacyHandlersRemoved.test.js](../../tests/c3LegacyHandlersRemoved.test.js#L12),
  [tests/c6ZipBundleManifest.test.js](../../tests/c6ZipBundleManifest.test.js#L94)). A
  small helper in `tests/_lib/readSource.js` exposed via `globalSetup` or a tiny
  `require()` would dedupe this and make refactors safer.

**Recommendation:** extract the Jest config into a top-level `jest.config.js`, make
`testMatch` explicit, add `fake-indexeddb/auto` to `setupFilesAfterEach`, and introduce
`tests/_lib/readSource.js` with a single `readSource(relativePath)` helper.

### C7. `prettier` declared but unconfigured; `acorn` declared but unused

Already covered in detail in
[reports/performance/dependencies.md](../performance/dependencies.md) findings #2 and #3.
Logged here only as a config-surface item: the absence of `.prettierrc` /
`.prettierignore` means anyone who runs `npx prettier --write .` would reformat the
entire repo to default-style, including the deliberately-minified files like
[constants.js](../../constants.js) that the Copilot instructions describe as "match the
style of the file you are editing". Either commit a `.prettierrc` that documents the
exclusions (and add `npm run format`) or drop the dep.

**Recommendation:** drop both. Re-add `prettier` later only when paired with
`.prettierrc` + `.prettierignore` + a `format` / `format:check` script + a CI step.

### C8. `manifest.json` ships only one icon, no maskable variant

**File:** [manifest.json](../../manifest.json), [assets/icons/](../../assets/icons).

```json
"icons": [
  { "src": "./assets/icons/app-icon.svg", "sizes": "any",
    "type": "image/svg+xml", "purpose": "any maskable" }
]
```

`assets/icons/` contains exactly one file ([app-icon.svg](../../assets/icons/app-icon.svg))
so the file references resolve. Two real-world install issues remain:

- **Combined `purpose: "any maskable"` is deprecated.** The W3C
  [manifest spec](https://www.w3.org/TR/appmanifest/#purpose-member) and Chrome's
  install audit recommend listing the same icon twice with separate purposes
  (`"any"` and `"maskable"`) so the browser can pick the right rendering. The combined
  form still works in Chrome but Lighthouse downgrades the PWA score.
- **No PNG raster fallback.** iOS Safari ignores SVG icons in manifests and falls back
  to scraping `<link rel="apple-touch-icon">` from the HTML — there is no such tag in
  any of the five entry pages (verified via grep for `apple-touch-icon` returning zero
  matches). iOS Add-to-Home-Screen will use a screenshot of the page, not the brand
  icon.

**Recommendation:** generate `app-icon-192.png`, `app-icon-512.png`, and
`app-icon-512-maskable.png` from the SVG, list each separately in the manifest with the
correct `purpose`, and add `<link rel="apple-touch-icon" href="./assets/icons/app-icon-180.png">`
to all five HTML entry points.

---

## I3 — Low

### C9. No top-level `npm run build`; `build:creator` does not run `build-import-bundle.js`

Already documented in
[reports/performance/build-pipeline.md](../performance/build-pipeline.md) finding #3.
Recap for the config-surface picture:

- `npm run build:creator` → `node build-creator-bundle.js` (covers `creator/bundle.js`
  AND the inline `creator/import-wizard-bundle.js`).
- [build-import-bundle.js](../../build-import-bundle.js) — not wired to any npm script.
- [build-symbol-font.js](../../build-symbol-font.js) — not wired either; output is
  committed binary in [assets/fonts/](../../assets/fonts).

**Recommendation:** add to `package.json`:

```json
"build": "npm run build:creator && npm run build:import",
"build:import": "node build-import-bundle.js"
```

…so the README, CONTRIBUTING (see C12), and CI workflow can all just say `npm run build`.

### C10. `lint:css-tokens` script runs nowhere automatically

**Files:** [package.json](../../package.json) line 18,
[scripts/lint-css-tokens.js](../../scripts/lint-css-tokens.js).

It exists, it works, no hook or CI step calls it, and nothing in the README mentions it.
Either wire it into the pre-commit hook alongside `lint-terminology` (cheap — both lints
are pure file scans) or delete it.

### C11. `start` script + Playwright `webServer` both bind port 8000 with no fallback

**Files:** [package.json](../../package.json) line 11,
[playwright.config.js](../../playwright.config.js) lines 46–51.

`reuseExistingServer: true` is set, so a developer running `npm start` in one terminal
and `npm run perf:baseline` in another will work. But a developer who has port 8000
bound by a different process gets a confusing failure (Playwright will time out on
`http://127.0.0.1:8000` after 120 s with no hint of the port collision). [serve.js](../../serve.js)
already reads `process.env.PORT`, so:

**Recommendation:** change `webServer.command` to `"node serve.js 0"` and `webServer.url`
to a value derived from a `--port` arg, OR document the port collision in the README
troubleshooting section. Lower priority because it's a developer-machine issue, not a
shipped one.

### C12. `.github/` is missing CODEOWNERS, PR template, and CONTRIBUTING

**Directory:** [.github/](../../.github) currently contains only `copilot-instructions.md`
and the single workflow.

For a single-maintainer repo this is acceptable, but with the agent-driven cleanup
audits in flight (see [reports/00_MASTER_TODO.md](../00_MASTER_TODO.md)) a
`PULL_REQUEST_TEMPLATE.md` that prompts the contributor to confirm "ran
`node build-creator-bundle.js`?", "ran `npm test`?", and "no emojis added to UI?" would
catch the most common review findings up front.

**Recommendation (low priority):** add `.github/PULL_REQUEST_TEMPLATE.md` with those three
checkboxes once C2's CI workflow lands so the boxes can link to the workflow run.

---

## I4 — Hygiene

### C13. `.gitignore` blocks `test_*.js`, `debug_*.js`, etc. — but several committed test files match

**File:** [.gitignore](../../.gitignore) line 4 (`test_*.js`).

The pattern `test_*.js` ignores files like `test_foo.js`, but the repo contains
[tests/test_proj.json](../../tests/test_proj.json) and
[tests/test-project.json](../../tests/test-project.json) (both `.json`, not affected),
plus the convention is that every real test file ends in `.test.js` (matched by Jest)
so the `test_*.js` block exists to stop one-off scratch scripts from being committed.
Worth keeping as-is, but the same line ignores `debug_*.js`, `dump_*.js`, `run_*.js`,
`inspect_*.js` — a legacy set from before the project moved to a structured
`scripts/` folder. Document this convention in the README so contributors know not to
name a real script `run_migration.js` and watch it silently disappear.

### C14. SW precache lists `./index.html` as the offline navigation fallback

**File:** [sw.js](../../sw.js) line 130 (`return cached || caches.match('./index.html');`).

Now that `home.html` is the default landing (per [AGENTS.md](../../AGENTS.md)), the
offline fallback should arguably be `./home.html` to match. Functionally `index.html`
still loads the creator app so users see content, but the URL bar shows `index.html`
after every offline navigation regardless of where they were trying to go.

### C15. No `engines` field in `package.json`

The audit context records Node 22.12.0 / npm 10.9.0 as the verified-working pair, but
nothing in `package.json` enforces a minimum. A contributor on Node 18 will hit
silent-but-confusing failures (`fetch` is global on Node 18 too, but native test runner
behaviour and some `fake-indexeddb` features differ). Add:

```json
"engines": { "node": ">=20" }
```

Not enforced by `npm install` by default — but `npm ci` in the proposed CI workflow can
add `--engine-strict`.

---

## Cross-references

This audit deliberately does not duplicate findings already filed in:

- [reports/performance/build-pipeline.md](../performance/build-pipeline.md) — covers the
  three build scripts in detail (cache-key invalidation logic, build-time profile,
  ordering correctness). This report's C9 references it for the `npm run build`
  recommendation.
- [reports/performance/dependencies.md](../performance/dependencies.md) — covers unused
  npm packages and dep/devDep classification. This report's C7 references it for
  `prettier` / `acorn`.
- [reports/perf-opt-2-spec.md](../perf-opt-2-spec.md) — covers the lazy-loading shim
  for `import-engine/`; touched only because C1 lists `import-engine/lazy-shim.js` and
  `import-engine/bundle.js` as currently in the precache (they correctly are).

---

## Verification commands used

```powershell
# SW precache vs first-party JS files
Get-Content sw.js -Raw | Select-String "'\./[^']+'" -AllMatches | %{ $_.Matches.Value } | Sort-Object | Get-Unique
# (then diff against)
Get-ChildItem -Recurse -File -Include *.js | Where-Object { $_.FullName -notmatch 'node_modules|tests|reports|scripts|creator\\|import-engine\\(?!bundle|lazy-shim)' }

# Process.env audit
grep -r "process\\.env\\." --include="*.js"   # 7 hits, all in serve.js + tests/vercel-config.test.js

# Hook tree comparison
diff .husky/pre-commit .githooks/pre-commit

# Jest setup files
file_search jest.setup*   # 0 results
```

All commands are read-only.
