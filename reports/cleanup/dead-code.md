# Dead Code & Unused Files — Audit Report

> Agent 7 (Read-only audit). Cross-stitch repo at branch `performance-upgrades-2`.
> Captured 2026-05-06. Methodology and confidence are noted on every item.
> See [reports/00_PERFORMANCE_CONTEXT.md](../00_PERFORMANCE_CONTEXT.md) for the
> baseline this audit references.

## Top 3 Summary

1. **[assets/Books and Blossoms - BW.svg](../../assets/Books%20and%20Blossoms%20-%20BW.svg) (2.6 MB)** — **Confirmed dead.** Zero references in any `.js` / `.html` / `.css` / `.json`. Independently flagged by [reports/performance/bundle-size.md](../performance/bundle-size.md) and [reports/performance/network.md](../performance/network.md). Working-tree weight only (not in SW precache, not served). Single-file delete. **Confidence: high.** I3 (working-tree hygiene; not user-facing).
2. **3 unused icons in [icons.js](../../icons.js): `gridOverlay`, `shoppingCart`, `sync`.** **Confirmed dead** by exhaustive scan of all `.js`/`.html` for both `Icons.<name>(` calls and quoted-string occurrences (catches dynamic `Icons[name]` lookups in [preferences-modal.js](../../preferences-modal.js), [creator/Sidebar.js](../../creator/Sidebar.js), [creator/ImportWizard.js](../../creator/ImportWizard.js), [import-engine/ui/ImportReviewModal.js](../../import-engine/ui/ImportReviewModal.js), [embroidery.js](../../embroidery.js), [help-drawer.js](../../help-drawer.js)). [tests/icons.test.js](../../tests/icons.test.js) only verifies that *used* icons exist; it does not flag unused ones. **Confidence: high.** I4.
3. **`scripts/` one-off audit / migration helpers (8 files, ~12 KB) appear stale.** [scripts/split-p1.js](../../scripts/split-p1.js)..[split-p4.js](../../scripts/split-p4.js), [scripts/split-pq.js](../../scripts/split-pq.js), [scripts/extract-specs.ps1](../../scripts/extract-specs.ps1), [scripts/extract-specs-2.ps1](../../scripts/extract-specs-2.ps1), [scripts/extract-verification.ps1](../../scripts/extract-verification.ps1), [scripts/extract-crosscutting.ps1](../../scripts/extract-crosscutting.ps1), [scripts/build-master-todo.ps1](../../scripts/build-master-todo.ps1), [scripts/trim-spec-tails.ps1](../../scripts/trim-spec-tails.ps1), [scripts/fix-tracker-icons.js](../../scripts/fix-tracker-icons.js), [scripts/audit-dmc-colors.js](../../scripts/audit-dmc-colors.js). Not referenced by any `npm run` target, no `.git/hooks/` reference, no other `.js`/`.md` mentions outside their own header comments (sole exception: [extract-specs-2.ps1](../../scripts/extract-specs-2.ps1) chains [trim-spec-tails.ps1](../../scripts/trim-spec-tails.ps1)). **Likely dead — verify.** Each looks like a one-shot run from a past report-generation phase. I4.

---

## Inventory and methodology

| Bucket | Total | Live | Dead/suspect | Method |
|---|---:|---:|---:|---|
| Repo-root `.js` | 54 | 53 | 0 (1 false alarm) | Substring scan across all `.js`/`.html`/`.json` |
| `creator/*.js` | 44 (42 source + 2 generated bundles) | 44 | 0 | Cross-checked against [build-creator-bundle.js](../../build-creator-bundle.js) `ORDER` and `WIZARD_ORDER` |
| `components/*.js` | 2 | 2 | 0 | `<script src=>` scan (loaded by all 5 HTML pages) |
| `import-engine/**/*.js` | 26 | 25 | 1 | Cross-checked against [build-import-bundle.js](../../build-import-bundle.js) `ORDER` |
| `scripts/` | 16 | 5 | ~10 (likely) | Cross-checked against `npm` scripts and full-text scan |
| `assets/` | 5 | 4 | 1 | Substring scan of all source files |
| `TestUploads/` | 6 (5 PDFs + README) | 3 | 2 (1 placeholder + 1 unused fixture) | `tests/` + `reports/` reference scan |
| Root HTML pages | 6 | 6 | 0 | All linked from each other or default-loaded |
| Icons in [icons.js](../../icons.js) | 98 | 95 | 3 | `Icons.<name>(` and `'<name>'` quoted-string scan |

---

## I0 — Critical

None.

---

## I1 — High

None at this severity from a *dead-code* perspective. The largest dead asset
(2.6 MB SVG) is working-tree-only and does not ship to users; classified at I3
to match its actual user-impact ceiling.

---

## I2 — Medium

None confirmed at this severity. (Several "looks dead but isn't" items below
would have qualified if they really were dead — see the False-positives table.)

---

## I3 — Low

### D-3.1 [assets/Books and Blossoms - BW.svg](../../assets/Books%20and%20Blossoms%20-%20BW.svg) — **Confirmed dead** (2.6 MB)

- Zero references in `.js`, `.html`, `.css`, `.json` (manifest, sw.js precache).
- Already flagged in [reports/performance/bundle-size.md](../performance/bundle-size.md#L10) and [reports/performance/network.md](../performance/network.md#L20).
- **Verify**: `grep -r "Books and Blossoms - BW" .` → only matches in `reports/`.
- **Action**: `git rm "assets/Books and Blossoms - BW.svg"` (consider also rewriting history given the .git pack already carries the historical 20 MB blob `Books and Blossoms - 5mm color.pdf` — that's a job for Agent 9, not this audit).

### D-3.2 [TestUploads/Books and Blossoms - 5mm color.pdf](../../TestUploads/Books%20and%20Blossoms%20-%205mm%20color.pdf) — **Confirmed dead** (2-byte placeholder)

- 2-byte file (was 20.4 MB, see [reports/00_PERFORMANCE_CONTEXT.md](../00_PERFORMANCE_CONTEXT.md#L70)).
- Documented as "rejected by pdf.js (`Invalid PDF structure`). Skipped." in [reports/import-2-dmc-file-analysis.md#L30](../import-2-dmc-file-analysis.md#L30).
- Not referenced by any test fixture loader.
- **Action**: `git rm` plus follow-up history cleanup by Agent 9 to evict the 20 MB historical blob.

### D-3.3 [TestUploads/exported_pattern.pdf](../../TestUploads/exported_pattern.pdf) — **Likely dead — verify** (1.78 MB)

- Not loaded by [tests/perf/import.spec.js](../../tests/perf/import.spec.js) (only `PAT1968_2.pdf`, `PAT2171_2.pdf`, `Books and Blossoms.pdf` are).
- Sole reference outside `reports/`: prose in [reports/import-2-dmc-file-analysis.md#L31](../import-2-dmc-file-analysis.md#L31) ("Reference for our own export.")
- **Verify**: confirm no developer is using it for manual round-trip QA. If still desired as a golden, move under `tests/fixtures/` and reference from a real test.
- **Action**: delete, or relocate + add a regression test that opens it.

### D-3.4 [import-engine/pdf/pdfDocLoader.js](../../import-engine/pdf/pdfDocLoader.js) — **Likely dead — verify**

- Not in [build-import-bundle.js](../../build-import-bundle.js) `ORDER` list.
- Not loaded as a worker, not script-included, not `require`d by any other source file.
- **Sole consumer**: [tests/import/pdfInfra.test.js](../../tests/import/pdfInfra.test.js) `require()`s it.
- The exported `loadPdf` symbol does not collide with `window.loadPdfStack` (defined in [create.html#L124](../../create.html#L124), [index.html#L116](../../index.html#L116), [stitch.html#L46](../../stitch.html#L46)) — different function, different signature.
- **Verify**: read `tests/import/pdfInfra.test.js` to confirm it tests behaviour the production importer also exercises (in which case the test plus this file are both dead) versus an alternative loader path that is genuinely used through some other entry. If tests pass with this file removed, remove both.
- **Action**: investigate, then either delete (file + test) or wire it into the bundle.

---

## I4 — Hygiene

### D-4.1 Three unused icons in [icons.js](../../icons.js) — **Confirmed dead**

- `gridOverlay` ([icons.js](../../icons.js)): no `Icons.gridOverlay`, no `'gridOverlay'`, no `iconName: "gridOverlay"` anywhere outside `icons.js` itself.
- `shoppingCart` ([icons.js](../../icons.js)): same.
- `sync` ([icons.js](../../icons.js)): same. (`syncEngine` etc. are unrelated identifiers; the regex match was anchored to quoted strings and `Icons.sync\b`.)
- Methodology: ran a single-pass scan over every tracked `.js`/`.html` (excluding `node_modules`, `test-results`, `.git`, and `icons.js` itself) checking for both `Icons\.<name>\b` and `['"]<name>['"]` to cover dynamic dispatch in [preferences-modal.js#L27](../../preferences-modal.js#L27), [creator/Sidebar.js#L1142](../../creator/Sidebar.js#L1142), [creator/ImportWizard.js#L111](../../creator/ImportWizard.js#L111), [import-engine/ui/ImportReviewModal.js#L24](../../import-engine/ui/ImportReviewModal.js#L24), [embroidery.js#L1467](../../embroidery.js#L1467), [help-drawer.js#L1019](../../help-drawer.js#L1019).
- The dynamic-dispatch sweep eliminated 15 *initial* false positives (`accessibility`, `bell`, `compass`, `confidenceHigh`, `confidenceLow`, `frame`, `globe`, `gradCap`, `magnifier`, `redo`, `settings`, `splitView`, `stop`, `user`, `wandFix`) — all genuinely referenced by string from [preferences-modal.js](../../preferences-modal.js), [help-drawer.js](../../help-drawer.js), [command-palette.js](../../command-palette.js), or [creator/ImportWizard.js](../../creator/ImportWizard.js).
- **Action**: delete the three unused functions from [icons.js](../../icons.js). [tests/icons.test.js](../../tests/icons.test.js) only checks that *used* icons exist, so it will not regress.

### D-4.2 `scripts/` one-off audit/migration helpers — **Likely dead — verify**

| File | Size | Referenced by |
|---|---:|---|
| [scripts/split-p1.js](../../scripts/split-p1.js) | 1.5 KB | None outside its own header |
| [scripts/split-p2.js](../../scripts/split-p2.js) | 1.5 KB | None |
| [scripts/split-p3.js](../../scripts/split-p3.js) | 1.2 KB | None |
| [scripts/split-p4.js](../../scripts/split-p4.js) | 1.2 KB | None |
| [scripts/split-pq.js](../../scripts/split-pq.js) | 1.6 KB | None (most recent commit message says batches were created from it once) |
| [scripts/extract-specs.ps1](../../scripts/extract-specs.ps1) | 1.5 KB | None |
| [scripts/extract-specs-2.ps1](../../scripts/extract-specs-2.ps1) | 1.2 KB | Calls `trim-spec-tails.ps1` |
| [scripts/extract-verification.ps1](../../scripts/extract-verification.ps1) | 1.6 KB | None |
| [scripts/extract-crosscutting.ps1](../../scripts/extract-crosscutting.ps1) | 2.1 KB | None |
| [scripts/build-master-todo.ps1](../../scripts/build-master-todo.ps1) | 3.7 KB | None |
| [scripts/trim-spec-tails.ps1](../../scripts/trim-spec-tails.ps1) | 1.3 KB | Called by extract-specs-2.ps1 |
| [scripts/fix-tracker-icons.js](../../scripts/fix-tracker-icons.js) | 0.6 KB | None |
| [scripts/audit-dmc-colors.js](../../scripts/audit-dmc-colors.js) | 18.4 KB | Mentioned in [reports/color-8-technical-design.md](../color-8-technical-design.md#L106) as a one-shot |

- All look like one-shot helpers used during past report generations or audits. None are wired into `npm` scripts, husky hooks, CI, or other source files (the live `npm`-referenced scripts are [scripts/lint-terminology.js](../../scripts/lint-terminology.js), [scripts/lint-css-tokens.js](../../scripts/lint-css-tokens.js), [scripts/install-hooks.js](../../scripts/install-hooks.js)).
- **Verify**: confirm with the repo owner that no future audit will re-run them. If a script is genuinely a "tool", move it under `scripts/oneshot/` (or git-archive a tag and delete) so live scripts stand out.
- **Action**: archive or delete after owner sign-off. Keep `audit-dmc-colors.js` if still useful for future palette review.

### D-4.3 Long commented-out blocks (>5 lines) — **Not surveyed**

- This audit did not enumerate them (would require an AST-aware sweep to avoid false positives in JSDoc / banner blocks). Recommend a follow-up pass if a tool like `eslint --rule no-warning-comments` or a custom script is added.

### D-4.4 CSS classes in [styles.css](../../styles.css) with zero JS/HTML references — **Not surveyed**

- Initial Get-Content-based PowerShell scan of all `.js`/`.html` for ~1,200 candidate classes did not finish within 2 minutes.
- Recommend a Node-based scan (single mmap, single regex sweep) as a separate task — the file is 6,517 lines and almost certainly has dead rules from the UX-12 → Workshop migration.

### D-4.5 Feature flags hard-coded `true`/`false` — **Confirmed: none found**

- Grep for `if (false)`, `if (0)`, `if (true) { … } else`, `FEATURE_FLAG`, `DEPRECATED:`, `TODO_REMOVE`, `XXX_REMOVE` returned zero matches.
- The repo uses [user-prefs.js](../../user-prefs.js) `UserPrefs.get(...)` for runtime toggles; no compile-time dead branches.

### D-4.6 Tests of files that no longer exist — **Confirmed: none**

- Scanned all 146 `tests/**/*.test.js` for `readFileSync('…/xxx.js')`. Every referenced source file exists.

---

## "Looks dead but isn't" — verified live (do **not** delete)

| File | Why it looks dead | Why it isn't |
|---|---|---|
| [embroidery.html](../../embroidery.html), [embroidery.js](../../embroidery.js) | Not in any HTML's `<script src=>` graph from the 5 main pages | Opt-in experimental — gated by `experimental.embroideryTool` UserPref ([user-prefs.js#L194](../../user-prefs.js#L194)). Linked from [home-app.js#L563](../../home-app.js#L563) and intentionally kept off the SW precache list ([sw.js#L10](../../sw.js#L10)). Several functions from `embroidery.js` (`sobelMag`, `cannyEdges`) are also globals consumed by [colour-utils.js](../../colour-utils.js) when both are loaded. |
| [analysis-worker.js](../../analysis-worker.js), [generate-worker.js](../../generate-worker.js), [pdf-export-worker.js](../../pdf-export-worker.js), [pdf.worker.min.js](../../pdf.worker.min.js) | Never appear in `<script src=>` | Spawned via `new Worker(...)` ([tracker-app.js#L2127](../../tracker-app.js#L2127), [creator/bundle.js#L1757](../../creator/bundle.js#L1757) and L6281), or set as `pdfjsLib.GlobalWorkerOptions.workerSrc` ([create.html#L127](../../create.html#L127), [index.html](../../index.html), [stitch.html](../../stitch.html), [pdf-importer.js#L40](../../pdf-importer.js#L40)). |
| [pdf-importer.js](../../pdf-importer.js) | Not in any HTML script graph | Lazy-loaded via `loadScript('pdf-importer.js')` from `window.loadPdfStack()` defined in [create.html#L124](../../create.html#L124), [index.html#L116](../../index.html#L116), [stitch.html#L46](../../stitch.html#L46), and from [import-engine/strategies/pdfGlyphStrategy.js#L57](../../import-engine/strategies/pdfGlyphStrategy.js#L57). |
| [import-engine/lazy-shim.js](../../import-engine/lazy-shim.js), [import-engine/worker.js](../../import-engine/worker.js) | Not in [build-import-bundle.js](../../build-import-bundle.js) `ORDER` | `lazy-shim.js` loaded as `<script src>` from each main HTML; `worker.js` spawned via `new Worker('import-engine/worker.js')`. |
| [creator/bundle.js](../../creator/bundle.js), [creator/import-wizard-bundle.js](../../creator/import-wizard-bundle.js) | Generated artifacts | Loaded by every page that mounts the creator. Also tracked in git, see [reports/00_PERFORMANCE_CONTEXT.md#L80](../00_PERFORMANCE_CONTEXT.md#L80) (separate concern). |
| [build-creator-bundle.js](../../build-creator-bundle.js), [build-import-bundle.js](../../build-import-bundle.js), [build-symbol-font.js](../../build-symbol-font.js), [serve.js](../../serve.js) | Not loaded by any HTML | Node-side build / dev tooling — `build:creator` npm script and manual invocations. |
| [playwright.config.js](../../playwright.config.js) | No textual reference outside itself | Picked up implicitly by the `playwright` CLI invoked from `test:e2e`, `perf:baseline`, `perf:mobile` npm scripts. |
| [home-screen.js](../../home-screen.js) | Mostly superseded by [home-app.js](../../home-app.js) for `/home` | Still loaded by [manager.html](../../manager.html) for `MultiProjectDashboard`, consumed by [project-library.js](../../project-library.js) (documented in [AGENTS.md](../../AGENTS.md)). Do not delete without refactoring those consumers. |
| [version.js](../../version.js) | One-line file | Loaded by every page; contains release-stamp. |

---

## Notes on what was **not** investigated

- AST-based dead-function detection within live source files. The scan only catches *file-level* dead code. There may be unreferenced top-level functions inside live files; a future pass with an unused-export linter (or hand-written acorn walker, since `acorn` is already a dependency) would catch these.
- `proposals/` (18 files) and `docs/` (10 files) were not graded — Agent 8 (reports/docs cleanup) territory.
- 257 files in `reports/` not graded for staleness — Agent 8 territory.
- `node_modules/` weight (238 MB, 265 packages) — Agent 6 (deps) territory.
- `.git` history rewrite for the 20 MB historical PDF blob and 249 historical `creator/bundle.js` blobs (~150 MB cumulative) — Agent 9 (git-history) territory.

---

## Suggested follow-up tasks

1. Delete the 2.6 MB SVG and 2-byte placeholder PDF (D-3.1, D-3.2). Single PR.
2. Delete the three unused icons (D-4.1). Single PR; verify [tests/icons.test.js](../../tests/icons.test.js) still passes.
3. Owner triage on `scripts/` one-off helpers (D-4.2). Either delete or move under `scripts/oneshot/`.
4. Decide fate of [import-engine/pdf/pdfDocLoader.js](../../import-engine/pdf/pdfDocLoader.js) and [TestUploads/exported_pattern.pdf](../../TestUploads/exported_pattern.pdf) (D-3.3, D-3.4) — both need a 5-minute conversation with the maintainer.
5. (Future) Run a Node-based CSS-class usage scan across `.js`/`.html` to surface dead [styles.css](../../styles.css) rules (D-4.4).
