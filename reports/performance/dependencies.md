# Performance Audit — Dependencies (Agent 5)

> Read-only audit of [package.json](../../package.json) and `node_modules/`.
> Baseline: 238.52 MB across 265 top-level packages, 375 total. 0 vulns.
> Scale (I0-I4) defined in [00_PERFORMANCE_CONTEXT.md](../00_PERFORMANCE_CONTEXT.md#6-shared-impact-scale-referenced-by-every-agent).

---

## Top-3 summary

1. **~110 MB of extraneous packages sit in `node_modules/` with no `package.json` entry.** `pdfjs-dist` (38.9 MB), `@napi-rs/canvas` (36.1 MB), `canvas` (35.1 MB) are reported `extraneous` by `npm ls`. The next clean install will either silently drop them (then random PDF/canvas tests fail) or re-fetch them on every `npm install` because nothing pins them. Decide which are needed, add them to `devDependencies`, and `npm prune` the rest. **I1.**
2. **Six declared packages have zero `require()` references in the entire repo** — `acorn`, `prettier`, `@babel/cli`, `@babel/core`, `@babel/preset-react`, `@babel/standalone`. Together they account for 53+ MB of `node_modules/`. The browser pulls Babel and React from CDN, so the npm copies are only useful if a script ever shells into them — none does today. **I1.**
3. **`acorn` and `prettier` are listed under `dependencies` not `devDependencies`.** The app is no-build / no-runtime-Node, so nothing about them is a "runtime" dep. They should be moved (or removed entirely — see #2). The split currently misleads anyone who thinks `dependencies` ships to the user. **I3.**

---

## Findings

### F1 — Extraneous packages bloating `node_modules/` — **I1**

`npm ls --depth=0` reports:

```
@napi-rs/canvas-win32-x64-msvc@0.1.100  extraneous   (~36 MB native binary)
@napi-rs/canvas@0.1.100                 extraneous   (transitive of pdfjs-dist)
canvas@3.2.3                            extraneous   (~35 MB native binary)
pdfjs-dist@5.6.205                      extraneous   (~39 MB)
base64-js, bl, buffer, chownr, decompress-response, deep-extend, detect-libc,
end-of-stream, expand-template, fs-constants, github-from-package, ieee754,
ini, mimic-response, minimist, ...                  extraneous (transitives of canvas/pdfjs)
```

The repo loads `pdf.worker.min.js` (already vendored at the repo root, see [pdf.worker.min.js](../../pdf.worker.min.js)) and the bundled [assets/fontkit.umd.min.js](../../assets/fontkit.umd.min.js) at runtime — neither needs `pdfjs-dist` or `canvas` from npm.

`grep_search` for `require('pdfjs-dist'|'canvas')` returned **zero hits** anywhere in the repo. They are leftover from an experimental install that was never declared in [package.json](../../package.json).

Also flagged by the same `npm ls`: `fake-indexeddb@^6.2.5  UNMET DEPENDENCY` — declared but not actually resolved on disk. This means a fresh `npm ci` may currently be flaky.

**Action:** decide canonically (`pdfjs-dist`/`canvas` not needed → run `npm prune` then commit the resulting `package-lock.json`). If a test does need them, declare them in `devDependencies` so they survive `npm prune`. Resolve the `fake-indexeddb` UNMET state with a clean `rm -rf node_modules && npm install`.

**Measurement:**
```powershell
# Before
(Get-ChildItem node_modules -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
# 238.52
npm ls --depth=0 2>&1 | Select-String 'extraneous|UNMET' | Measure-Object | % Count
# 19+
# After: rerun the two commands; expect <130 MB and 0 extraneous lines.
```

---

### F2 — Six declared packages have zero references in source — **I1**

Verified with `grep_search` across the whole repo (`require('NAME')` and `from 'NAME'`):

| Package | Refs in source | Notes |
|---|---|---|
| `acorn` | 0 | No parser usage anywhere. |
| `prettier` | 0 (8.18 MB on disk) | No formatter script. No `.prettierrc`. |
| `@babel/cli` | 0 | No `babel` shell-out in any script. |
| `@babel/core` | 0 | Not required by [build-creator-bundle.js](../../build-creator-bundle.js) (it does plain string concatenation). |
| `@babel/preset-react` | 0 | The browser uses `@babel/standalone` from CDN, not a build-time preset. |
| `@babel/standalone` | 0 references locally; loaded from CDN in [create.html](../../create.html) etc. | The npm copy is never read. |

The `@babel/*` family alone occupies **44.9 MB** in `node_modules/` (largest top-level folder).

**Action:** remove all six from [package.json](../../package.json). If you ever decide to bundle Babel locally (e.g. to drop the CDN dependency), reintroduce only `@babel/standalone`. The CLI/core/preset-react trio is dead weight.

**Measurement:**
```powershell
foreach ($p in 'acorn','prettier','@babel/cli','@babel/core','@babel/preset-react','@babel/standalone') {
  $hits = Select-String -Path *.js,scripts/*.js,build-*.js,tests/**/*.js -Pattern "require\(['""]$p['""]" -SimpleMatch -ErrorAction SilentlyContinue
  "$p`t$($hits.Count)"
}
# Expect 0 for all six.
# After removal: npm install; node_modules drops by ~53 MB; tests still pass.
```

---

### F3 — `dependencies` vs `devDependencies` mis-split — **I3**

[package.json](../../package.json) lists `acorn` and `prettier` under `"dependencies"`. Because the app is fully client-side and ships zero JS from `node_modules/` to the browser, **everything** in [package.json](../../package.json) is logically a devDependency.

If the recommendation in F2 is taken, both keys disappear and the `"dependencies"` block becomes empty (or can be removed entirely). If they are kept for some script not yet written, move them to `devDependencies` so the split accurately reflects "developer tooling, never shipped to users".

**Action:** delete the `"dependencies"` block (preferred, after F2), or move both entries into `"devDependencies"`.

---

### F4 — Heaviest npm folders — diagnostic for F1/F2 — **I2 (already covered above)**

Top 10 by size on disk (`Get-ChildItem node_modules -Directory | Sort SizeMB -Descending`):

| MB | Folder | Status |
|---:|---|---|
| 44.90 | `@babel` | **All four `@babel/*` declared deps unused (F2)** |
| 38.92 | `pdfjs-dist` | **Extraneous (F1)** |
| 36.13 | `@napi-rs` | **Extraneous (F1)** |
| 35.12 | `canvas` | **Extraneous (F1)** |
| 19.34 | `pdf-lib` | Used by [tests/pdfExportSmoke.test.js](../../tests/pdfExportSmoke.test.js) — keep. |
| 9.98 | `playwright-core` | Used by perf and e2e suites — keep. |
| 8.18 | `prettier` | **Unused (F2)** |
| 7.81 | `@pdf-lib` | `@pdf-lib/fontkit` used by `pdfExportSmoke.test.js` — keep. |
| 4.29 | `react-dom` | See F8 below. |
| 3.61 | `opentype.js` | Used by [build-symbol-font.js](../../build-symbol-font.js) — keep. |

If F1 + F2 are both implemented, `node_modules/` shrinks by ~163 MB (238 → ~75 MB).

---

### F5 — Font / PDF stack overlap — **I3**

There are four packages in the area; mapping them clears up the apparent overlap:

| Where | Used at runtime by | Used at build/test time by |
|---|---|---|
| [assets/fontkit.umd.min.js](../../assets/fontkit.umd.min.js) (vendored, 741 KB) | [pdf-export-worker.js](../../pdf-export-worker.js#L44) (browser worker), precached by [sw.js](../../sw.js#L68) | — |
| [pdf.worker.min.js](../../pdf.worker.min.js) (vendored, 1062 KB) | All five HTML pages (worker for `pdfjsLib`) | — |
| `@pdf-lib/fontkit` (npm) | — | [tests/pdfExportSmoke.test.js](../../tests/pdfExportSmoke.test.js#L18) |
| `pdf-lib` (npm) | — | same test |
| `opentype.js` (npm) | — | [build-symbol-font.js](../../build-symbol-font.js#L26) |

No actual duplication: the vendored `.umd.min.js` files are needed in the browser and the npm copies are needed in Jest. The `pdfExportWorkerCSP.test.js` even *enforces* that fontkit is loaded locally rather than from a CDN ([tests/pdfExportWorkerCSP.test.js](../../tests/pdfExportWorkerCSP.test.js#L77)). All four are earning their keep — no action.

---

### F6 — `fake-indexeddb` and `fast-check` — **I3**

**`fake-indexeddb`** is required by exactly **one** test file: [tests/backupCompression.test.js](../../tests/backupCompression.test.js#L154). It is also currently in an `UNMET DEPENDENCY` state per `npm ls` (see F1) — a fresh install should fix that. One test file is thin justification for a polyfill, but the alternative is hand-rolling an IDB mock, which is worse. Keep, but resolve the UNMET state.

**`fast-check`** is required by **8 tests** (`grep_search require('fast-check')` returns 8 hits in `tests/`: `arbitraries.js`, `blend-id-properties.test.js`, `colour-distance-properties.test.js`, `composite-key-properties.test.js`, `colour-matching-properties.test.js`, `difficulty-rating-properties.test.js`, `rgb-to-lab-properties.test.js`, `skein-calculation-properties.test.js`, `time-formatting-properties.test.js`). Property-based testing is providing real coverage of the colour/skein maths. Keep.

---

### F7 — Outdated packages — **I3 / I4**

`npm outdated` output:

| Package | Current | Latest | Behind |
|---|---|---|---|
| `@babel/standalone` | 7.29.2 | 7.29.4 | patch |
| `fast-check` | 3.23.2 | 4.7.0 | 1 major |
| `opentype.js` | 1.3.4 | 1.3.5 | patch |
| `prettier` | 3.8.1 | 3.8.3 | patch |
| `react` | 18.2.0 | 19.2.5 | 1 major |
| `react-dom` | 18.2.0 | 19.2.5 | 1 major |

**None are >2 majors behind.** React 19 is a notable upgrade but is gated by the CDN script tags in the HTML files, not the npm copy — bumping the npm dep does nothing for users. `fast-check` 4 has breaking API changes that would require rewriting the 8 property tests; defer.

**Action:** patch-bump `@babel/standalone`, `opentype.js`, `prettier` (only if F2 keeps prettier). I4.

---

### F8 — Replaceable by Node 22 / browser built-ins — **I4**

Node 22 / modern browsers ship `structuredClone`, `fetch`, `AbortController`, `crypto.subtle`, `Blob`, `CompressionStream`, `DecompressionStream`. None of the current devDependencies are direct polyfills for these — `pako` predates `CompressionStream` but is still the easiest cross-environment gzip; `fake-indexeddb` polyfills IDB, which Node 22 still doesn't ship. **No action.**

One latent opportunity (out of scope for this report — flag only): the runtime use of `pako` for backup compression in the browser could in principle be replaced by the native `CompressionStream('gzip')` API, eliminating one CDN script tag. This is a code change, not a dep change, and the npm `pako` would still be needed by the test suite that builds compressed fixtures.

---

### F9 — `react` / `react-dom` npm copies are unused — **I3**

`grep_search` for `require('react')` and `require('react-dom')` returns **zero hits** in `tests/` and zero hits in repo source. The browser loads both from `unpkg.com` script tags. The npm copies (4.29 MB combined) exist only so editors can resolve the global `React` type if a contributor uses an IDE plugin that needs it.

**Action:** safe to remove from [package.json](../../package.json) once Agent 1/2 confirm no editor tooling depends on them. If retained, they belong in `devDependencies` (already correct). Low risk — drop only after the F1/F2 cleanup.

---

### F10 — `husky` install overhead — **I4 (no action)**

[scripts/install-hooks.js](../../scripts/install-hooks.js) runs as the npm `prepare` script. It:

- Skips silently when not inside a Git working tree (CI tarballs).
- Uses `require.resolve('husky')` to detect Husky, then **does not invoke the husky CLI** — it runs `git config core.hooksPath` directly.
- Falls back to [.githooks/](../../.githooks/) when Husky is absent.

So `husky` adds ~280 KB to `node_modules/` and zero install-time CPU. CI is fine. **No action.**

---

## Suggested order of operations

| # | Action | Impact |
|---|---|---|
| 1 | `npm prune` to drop the extraneous `pdfjs-dist` / `canvas` / `@napi-rs/canvas` tree (F1). | -~110 MB |
| 2 | Remove `acorn`, `prettier`, `@babel/cli`, `@babel/core`, `@babel/preset-react`, `@babel/standalone` from [package.json](../../package.json) (F2). | -~53 MB |
| 3 | Delete the now-empty `"dependencies"` block (F3). | hygiene |
| 4 | (Optional) remove `react` / `react-dom` after Agent 1/2 sign-off (F9). | -4 MB |
| 5 | (Optional) patch-bump `@babel/standalone`, `opentype.js` if retained (F7). | hygiene |

Combined effect after steps 1-3: `node_modules/` shrinks from 238.52 MB to roughly **75 MB** (-68%) with zero code changes. Verification command:

```powershell
(Get-ChildItem node_modules -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
npm test -- --runInBand --silent
```

Both numbers (size + test pass count) should be checked before/after; tests must remain at 1,509 passing.
