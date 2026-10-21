# PR 09 — Unread hook-result bindings in Stats (F-014)

Base: `a0a5a7f7` (`origin/main`, v1.0.199). Prerequisites #362–#365 are merged ancestors (#366, #367 and #368 are merged too). Scope: `stats-page.js` only.

## The audited lines have moved

The audit commit (`07750e3b`) has `hueData` at 1246–1267 and `familyData` at 1269–1281, which is where lines 1273–1292 fell. Since then PR 05 removed the `HueWheel` component (the only reader of `hueData`), so `stats-page.js` now differs from the audit commit by 1 insertion and 28 deletions, all of them that removal and a header comment. The finding is still live, but narrower than the audited range suggests: of the hook results around those lines only `hueData` is unread. `familyData` and `dmcCoverage` are both read by JSX (`ColourFamilyWheel`, `RadialGauge`).

## Candidates and verdicts

A Babel scope analysis (the same `@babel/core` the build uses; every binding with no reference and no reassignment) of the whole file on `main` lists:

| Binding | Kind | Verdict |
|---|---|---|
| `hueData` (`const hueData = useMemo(…, [stash])`) | hook result | **binding dropped**, `useMemo` call kept |
| `projects` (`const [projects, setProjects] = useState([])`) | hook result | **binding dropped** (`const [, setProjects] = …`), `useState` call kept |
| `ymd` | hoisted top-level function, only mentioned in a comment | retained: not a hook/callback result, no reader, but a function declaration is private dead-code removal, which is PR 05's class of change, not this PR's |
| `rgb` in `classifyColourFamily` | plain local `info.rgb \|\| [128,128,128]` | retained: not a hook result; removing it would drop a property read and a default allocation from a function other code calls, and nothing in this task needs that |
| `e` ×10, `_` ×2 | `catch` parameters | not bindings to clean up (optional catch binding is a syntax-level change outside this task) |

After the change the same analysis lists only `ymd`, `rgb` and the catch parameters, so no newly unread binding was left behind.

## How "unread" was established

- `grep -w` over every `*.js`, `*.html`, `*.json` and `*.md` outside `node_modules` and `compiled/` finds `hueData` only at its declaration, and `projects` in `stats-page.js` only at its declaration (the other hits are the words "projects" in strings and comments). Tests never name either.
- `stats-page.js` has no `window[...]`, `eval`, `new Function` or `Reflect` use, so neither name can be reached by a computed or string-built key. Both are function-scoped `const`s inside `GlobalStatsDashboard`, so they cannot be reached from another file; neither is returned, stored in a ref or object, passed as a prop, put in a dependency array, or assigned to `window`. The only public export is `window.StatsPage`.
- `setProjects(results[1])` is still called by the load effect, so the state hook keeps receiving the same updates and re-renders exactly as before.

## What was changed and why it is behaviour-neutral

- `const hueData = useMemo(fn, [stash])` becomes `useMemo(fn, [stash])`. The callback still runs during the same renders, in the same position, with the same `[stash]` dependency, so every `findThreadInCatalog` / `rgbToLab` lookup it makes still happens in the same order. The comment above it was reworded because it described the retired hue wheel.
- `const [projects, setProjects] = useState([])` becomes `const [, setProjects] = useState([])`. The array hole skips the first element and takes the second from the same two-element array React returns.
- Nothing is conditional, reordered or removed: 62 hook calls per render before and after (25 `useState`, 5 `useEffect`, 26 `useMemo`, 5 `useCallback`, 1 `useRef`), no cleanup moves, and the preceding statements end in `;` so there is no ASI hazard.
- `stats-page.js` is a plain script (no JSX, no compile step), so `compiled/` is unaffected. It is in the service-worker precache, so `sw.js` was regenerated with `node build-sw.js`: only `BUILD_ID` and the `./stats-page.js` hash changed.

## Retained, not removed

- **The `hueData` memo itself.** It still walks the whole stash and does a catalogue lookup per owned thread on every stash change, for a result nothing reads. That is wasted work, but removing it removes a hook (changes the hook sequence) and its lookups, which the task says to preserve. It is a possible follow-up for a PR that is allowed to change the hook chain.
- **The `projects` state.** `listProjects()` result is stored and never read. Dropping the state would remove a hook and a render trigger; deferred.

## Evidence

Run on Node 22.22.0 against the unchanged base, then this head.

| Check | Base | Head |
|---|---|---|
| `npm test` (parallel) | 386 suites passed, 1 failed, 1 skipped; 5457 passed, 5 failed, 4 skipped | 387 passed, 1 failed, 1 skipped; 5458 passed, 5 failed, 4 skipped (the +1 is the new `tests/statsHookSequence.test.js`) |
| `npm run lint:terminology` | passed | passed |
| `npm run lint:css-tokens` | exit 0 | exit 0 |
| `node build-runtime-js.js --check` | up to date | up to date |
| `node build-sw.js --check` | exit 0 | exit 0 (after regenerating) |
| `git diff --check` | n/a | clean |
| `critical-lifecycle.spec.js`, Chromium only | n/a | 4 passed (Tracker, Creator comparison hooks, Stats, Home/Stash entry points) |
| `stats-sizing.spec.js`, Chromium only | 7 passed, 2 failed | 7 passed, 2 failed (the same two) |

The one failing Jest suite is `tests/import/pdfScannedImport.test.js` (5 tests) on base and head alike: pdfjs cannot polyfill `DOMMatrix`/`Path2D` because the nested optional `canvas` under `pdfjs-dist` could not be built here (`npm ci --ignore-scripts`, then `npm rebuild canvas` fixed only the top-level copy). It does not touch Stats.

The two `stats-sizing` failures are also identical on base: the populated global-tabs case leaves a "Loading…" label visible past its 5 s check, and the native 200% zoom case launches its own Chrome against a hard-coded `127.0.0.1:8000`. Neither is claimed green.

### New characterisation test

`tests/statsHookSequence.test.js` loads the real `stats-page.js`, mounts `StatsPage` with stubbed storage and a stash of four entries (one with zero owned), and records every hook call through a React wrapper. It asserts that every render calls an identical hook sequence, pins the per-kind counts above, and pins the stash lookups: each owned thread is looked up twice, once by the hue memo and once by the colour-family memo, and the zero-owned one not at all. It passes on base and on head, and fails against a variant with the two hook calls deleted (60 hook calls, 25 `useMemo`, 24 `useState`).

### Browser lifecycle fingerprint

`stats-lifecycle-probe.cjs` (this directory) loads the real pages in Chromium with a seeded project and ten stash entries, serves either the base or the head `stats-page.js` through a route override, and records, at every step: the `StatsPage` fibre's full hook chain (kind, dependency count, `useCallback`/`useMemo` function identity, and the JSON of each memo result), the window/document listeners and intervals owned by `stats-page.js` (attributed by call stack, so approximate), a hash of the rendered text, and the sha256 of the `stats-page.js` the browser actually received. Steps: Creator route mount, `cs:prefchange` rerender, the five tabs, `cs:stashChanged` + `cs:projectsChanged`, close (away), reopen (back), close; then the direct route (`index.html?mode=stats`) mount, `cs:prefchange`, the five tabs, and root unmount. `compare-fingerprints.cjs` diffs two outputs after stripping run-specific project ids and timestamps.

- Same-mode runs of the same script are identical (base vs base, head vs head: 0 differences), so the probe is deterministic apart from one environmental effect below.
- Base vs head, same project mode: **0 differences** in both modes (`base1`/`head2` in the summary-default mode, `base2`/`head1` and `base2`/`head3` in the migrated mode). That covers all 64 fibre hooks (the 62 hook calls the Jest test counts, plus the `useState` and `useEffect` inside the global `useMotivationPrefs()` from `helpers.js`, which the Jest harness does not define), every `useCallback`/`useMemo` identity, every memo result (including the unread `hueData` result, still `{"bins":[1,0,1,1,1,0,0,0,0,0,0,1],"neutral":3}`), listener sets, intervals and text hashes.
- Script hashes differ as intended: `e19b192c…` (base) and `16d93df5…` (head); control `c7a198a5…`.
- Sensitivity control: with the two hook calls deleted, the fibre has 62 hooks instead of 64 (30 memo / 25 state instead of 31 / 26) and the comparison reports about a thousand differences, so a changed hook chain is detected.
- Listeners (attributed to `stats-page.js` by call stack, so the `cs:prefchange` listener that `useMotivationPrefs` registers from `helpers.js` is not in this list; the preference-update step still exercises that rerender): three window listeners (`cs:backupRestored`, `cs:projectsChanged`, `cs:stashChanged`) while Stats is mounted, two more of the first and last type while the Showcase tab is open, back to three on the Stitching tab, none after close or unmount; no intervals at any step. Identical on base and head.
- Environmental effect: the Creator route sometimes reads the seeded project record before and sometimes after a `finishStatus`/`startedAt` migration write (the summary falls back to `'active'` when the field is missing), and this happens for the same script. The comparer therefore classifies each run and only compares runs in the same mode.
- The same console errors appear in every run: service-worker registration is blocked by the harness (`serviceWorkers: 'block'`) and one resource fails to load.

## Limits

- Chromium only; Firefox and WebKit were not run (no browsers installed here besides the pre-installed Chromium, used through a scratchpad config).
- The full touch-tablet Playwright matrix was not rerun and is not claimed green.
- The probe reads React internals, so it is diagnostic and not wired into `npm test`.
- Persistence is covered only as far as the existing Stats data-load path (migration, storage reads, reload on the three data events); Stats writes nothing for these bindings.
- Pattern Keeper PDF sources were not touched, so the PK comparator was not run.
- No user-visible change: `help-drawer.js` and `APP_CHANGELOG` are intentionally unchanged.
