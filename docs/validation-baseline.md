# Validation baseline

Use Node **22** (the CI major), a clean checkout and the committed lockfile.
The commands below run from the repository root. Do not run browser commands
concurrently: they use port 8000. Baseline runs must own that port; stop your
own development server first. An occupied port is an error in fresh-server mode.

## Install and check

```sh
node --version                     # must report v22.x for CI parity
npm ci
npx playwright install chromium
npm test -- --ci --reporters=default --maxWorkers=2
npm run lint:terminology
npm run lint:css-tokens
node build-creator-bundle.js
node build-import-bundle.js
node build-runtime-js.js --check
node build-sw.js --check
node scripts/check-generated-bundles.js  # read-only Creator/import verification
# Generators must leave the committed outputs unchanged:
git diff --exit-code -- creator/bundle.js creator/extras-bundle.js creator/import-wizard-bundle.js import-engine/bundle.js compiled/ sw.js
E2E_FRESH_SERVER=1 E2E_LOCAL_CDN=1 npm run test:e2e -- --workers=2
```

The explicit worker count keeps Jest parallel even on this two-CPU environment,
where its default resolves to one worker. Do not use `--runInBand` for the
baseline. CSS token lint currently reports advisory findings and exits successfully; a successful exit
does not mean there are no findings. CI (`.github/workflows/ci.yml`) uses Node 22,
`npm ci`, isolated Creator/import bundle verification, SW fingerprint check and full Jest. The checks
above deliberately also cover the import bundle, runtime output and both lints.
`npm run build` does not generate the import bundle. Do not regenerate stale
outputs merely to hide a discrepancy; investigate the source first.

The recorded full head run uses two browser workers; isolated cases use the
configured default of one. Install Playwright's OS dependencies if Chromium
reports missing shared libraries; they were already available in this image.

`npm run test:e2e` selects **touch-tablet-chromium**, an iPad Mini emulation on
Chromium. Some describe blocks explicitly override it with desktop or Pixel 5
settings. It is not iPad WebKit, the separate mobile-audit projects, performance
projects or the service-worker suite. The configuration blocks service workers,
so this suite cannot establish offline behaviour. No retries, skips or larger
timeouts are added by this baseline.

`E2E_FRESH_SERVER=1` disables Playwright's existing-server reuse. Every invocation
starts and stops `node serve.js 8000` from its own checkout; a cached server from
another checkout cannot supply the app. Without the flag, the existing developer
server reuse behaviour is preserved.

`E2E_LOCAL_CDN=1` enables the existing per-spec routing helper
(`tests/e2e/local-cdn.js`) in specs that install it. It substitutes React,
ReactDOM, Pako, PDF-lib and PDF.js from `node_modules`, aborts other cdnjs requests
and removes HTML SRI attributes. It neither validates production CDN delivery nor
SRI correctness, and is not a general offline mirror (for example, JSZip is not
mapped). Omit the variable for an additional production-CDN run when reachable.

The optional `tests/import/xsdReferences.test.js` requires an authorised upstream
fixture checkout via `XSD_REFERENCE_ROOT`; see [XSD import](xsd-import.md).
Without it, four reference tests in one suite are skipped. Do not report them as
passed or download/redistribute copyrighted charts to fill the gap.

## Isolated historical cases

Run each invocation separately with port 8000 free. Preserve failures and their
screenshots/logs; the logo and PDF-name product contracts must stay in place.

```sh
E2E_FRESH_SERVER=1 E2E_LOCAL_CDN=1 npx playwright test tests/e2e/convert-compare-options.spec.js --project=touch-tablet-chromium --grep 'three size options'
E2E_FRESH_SERVER=1 E2E_LOCAL_CDN=1 npx playwright test tests/e2e/convert-picture-presets.spec.js --project=touch-tablet-chromium --grep 'a logo is guessed'
E2E_FRESH_SERVER=1 E2E_LOCAL_CDN=1 npx playwright test tests/e2e/creator-behaviour.spec.js --project=touch-tablet-chromium --grep 'Print PDF offers a name'
E2E_FRESH_SERVER=1 E2E_LOCAL_CDN=1 npx playwright test tests/e2e/backup-save-failure.spec.js --project=touch-tablet-chromium --grep 'Creator propagates a failed flush'
E2E_FRESH_SERVER=1 E2E_LOCAL_CDN=1 npx playwright test tests/e2e/convert-size-field.spec.js --project=touch-tablet-chromium --grep '18 cm wide at 14-count'
```

The compare card delegates to `estFormatHours` in `helpers.js`, whose supported
text is `about N hour(s)` (with British thousands separators) or `under an hour`.
The browser assertion follows that contract while retaining the thumbnail count,
thread count, stitch count, dimensions, estimate, confetti and selection checks.
Application copy is unchanged. The logo maximum and Pixel 5 naming prompt remain
product discrepancies if reproduced; fixes belong to PRs 31 and 32 respectively.

Two further test contracts were checked against `TERMINOLOGY.md`, the current
Materials legend and shared thread formatter: legend rows show `DMC N`, and a
swatch tooltip reads `DMC N Name · count stitches`. The corrected tests still
verify symbol replacement and Undo on desktop/Pixel 5, and that long-press
shows thread/count information without selecting the swatch. All three failed
on unchanged base and passed after the test-only corrections.

The Tracker XSD test now selects its existing file input without requiring an
`accept` attribute. `Platform.fileAccept` deliberately omits this filter on iOS;
the import verification and existing-project preservation assertions remain.
No production file-picker or import code changes.

The other two historical failures were a File-button lookup timeout in the
Creator backup-flush test and a `route.fetch` socket hang-up in the 18 cm size
field test. Both cleared on historical isolated reruns; neither was a confirmed
product defect. Record their current isolated results separately from that history.

## Recorded evidence

Current evidence was collected on 20 October 2026, Linux x64, Node 22.23.3,
Playwright 1.59.1 and its Chromium headless shell 147.0.7727.15 (revision 1217),
with local CDN routing enabled. Base: `07750e3b388bc093c9f523dfbe3b811930af457b`
(verified remote `main`). Head uses a separate worktree and a clean `npm ci`. Base used the preinstalled
packages: all installed required package versions match the lockfile. Its
missing `axe-core` package is only used by the separate tracking-audit suites,
not these selected tests (the touch suite computes contrast directly); head's
clean install contains it. Those separate audit suites were not run.
Node 24.19.0 was initially present. Its sandbox-blocked Jest attempt was
interrupted without a complete result summary; counts are unavailable. The
first sandbox browser attempt failed to start its server, so all 447 tests
were unrun. Neither attempt is CI-parity evidence. Local HTTP listeners, subprocess checks and the configured outbound proxy require access
outside this environment's default command sandbox. These are execution
permissions, not reasons to change application code or test timeouts.

| Check | Base | Head |
| --- | --- | --- |
| Full Jest | 376 suites / 5,348 tests passed; one timing test failed; one suite / four XSD tests skipped; one snapshot passed (330.467 s) | 377 suites / 5,349 tests passed; one suite / four XSD tests skipped; one snapshot passed (89.815 s; final run after test corrections) |
| Compare size options, isolated | Failed: `about 129 hours` rejected by old regex | Passed |
| Logo preset, isolated | Failed: six threads, maximum five | Failed: same discrepancy |
| Pixel 5 PDF name, isolated | Failed: name prompt absent | Failed: same discrepancy |
| Creator backup flush, isolated | Passed | Passed |
| 18 cm size field, isolated | Passed | Passed |
| Terminology lint | Passed | Passed |
| CSS token lint | Successful exit, 13 advisories | Successful exit, same 13 advisories |
| Creator/import bundle regeneration | No tracked output changes | No tracked output changes |
| Runtime and SW checks | Passed | Passed |
| Full touch-tablet browser suite | Exploratory run bounded: 42 passed, three failed, one interrupted, 401 unrun, zero intentionally skipped | 406 passed; 41 failed (nine timeouts); zero skipped, interrupted or unrun (32.1 min) |

The exploratory base browser run was deliberately interrupted after reproducing
the three persistent cases; all five historical cases were subsequently run in
separate invocations, with each invocation owning its server. The base Jest
run used its resolved default of one worker while browsers were running. Its
`backstitch.test.js` nearest-line lookup took 255 ms against a 200 ms ceiling;
a separate unchanged base rerun without browser load passed all 27 backstitch
tests in 0.385 s. This establishes sensitivity to load, not a waived full-suite
failure. The final head Jest validation uses two workers and no concurrent browsers.
The elapsed times above use different worker/load conditions and are not
performance comparisons.

A diagnostic head browser run before the additional test corrections was
interrupted to restart against the final tests: 124 passed, 12 failed (including
three timeouts), two interrupted, 309 unrun, zero intentionally skipped. It is
not the final full-suite result. The unchanged-base palette rerun failed all
three cases; the corrected head rerun passed all three. These additional base
reruns used an independently owned server on port 8001 so they could not reuse
the head checkout's port 8000 server. The unchanged-base
Tracker XSD case timed out locating the iOS-omitted `accept`; corrected head
passed with the same verification/preservation checks.

Additional discrepancies reproduced on unchanged base: three cross-tab merge
tests show an unexpected conflict dialog or retained mark count, and both old
Creator gesture tests time out in their fixture loader at the removed `Open
file` control. These gesture tests do not reach their behavioural assertions;
this is a harness limitation, not evidence of broken gestures. Repairing that
legacy gesture journey requires separate investigation rather than weakening
its gesture assertions. A large-chart case hit a `route.fetch` socket error
during the interrupted diagnostic run; its isolated unchanged-base rerun passed.
It also passed in the final head run, with no recurrence in that case. The historical backup-flush
case passed isolated base/head checks but its File-button timeout recurred in
the full head run: the page snapshot showed an uncaught injected
`QuotaExceededError` before the menu could be clicked. Preserve this failure;
isolated success does not establish that the journey is stable.

The historical audit's 377 passing suites / 5,349 tests and bounded browser
counts (37 passed, five failed, three interrupted, 402 unrun) remain historical.
They must not substitute for the results above. A failing or unavailable check
blocks a ready-to-merge baseline; keep the PR draft. Production CDN/SRI delivery,
optional upstream XSD fixtures, WebKit and service-worker offline behaviour are
not established by these runs.

The blocking check is the full fresh-server touch-tablet command above. All
five corrected test cases pass in that full run; the remaining 41 failures are
preserved rather than hidden behind retries, skips or changed product behaviour.
All 41 failing case names also failed on unchanged base. Seven cases were
already covered by the earlier individual/group checks; the final comparison
ran the remaining 34 on an owned port-8000 server with the same Node/browser
versions and two workers: 34 failed (eight timeouts), zero passed, skipped,
interrupted or unrun (558.314 s). Forty cases have the same substantive failure;
the two-tabs session-deletion case fails an assertion on head and hits the test
timeout on base. Poll-attempt counts also vary. These are baseline discrepancies
under local-CDN routing, not a diagnosis that every case is a product defect.
Further stale contracts and product problems remain to be investigated; this
PR does not waive their assertions or claim a green browser baseline.

| Browser spec | Head failures | Same cases failed on base |
| --- | ---: | ---: |
| `backup-save-failure.spec.js` | 1 | 1 |
| `convert-picture-presets.spec.js` | 1 | 1 |
| `creator-behaviour.spec.js` | 1 | 1 |
| `creator-touch.spec.js` | 2 | 2 |
| `cross-tab-merge.spec.js` | 3 | 3 |
| `phase1-hunt.spec.js` | 1 | 1 |
| `phase2-batch5.spec.js` | 2 | 2 |
| `phase2-matrix.spec.js` | 2 | 2 |
| `phase3-batch3.spec.js` | 5 | 5 |
| `phase3-hunt.spec.js` | 2 | 2 |
| `phase4-batch1.spec.js` | 2 | 2 |
| `phase4-batch2.spec.js` | 3 | 3 |
| `phase5-batch4.spec.js` | 1 | 1 |
| `ready-review.spec.js` | 4 | 4 |
| `resize-half-stitches.spec.js` | 4 | 4 |
| `save-badge.spec.js` | 1 | 1 |
| `scratch-new-design.spec.js` | 1 | 1 |
| `specialty-lifecycle.spec.js` | 1 | 1 |
| `stash-collapsible-alerts.spec.js` | 2 | 2 |
| `thread-brand.spec.js` | 2 | 2 |
