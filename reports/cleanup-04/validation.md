# Validation evidence

Base `31a510c936c267b9bf053ee5f6c295fef5372c45`; Node **22.23.3**, Playwright **1.59.1** and Chromium **147.0.7727.15**. Local runs reused the checkout's installed dependencies; there is no dependency or lockfile change. Browser commands ran sequentially with owned fresh servers; performance batches also ran sequentially, without concurrent suites.

| Check | Result |
| --- | --- |
| Unchanged base full Jest, Node 22, VM modules, two workers | 384 suites / 5,446 tests / one snapshot passed; one suite / four optional upstream XSD tests skipped |
| Final head `npm test -- --ci --reporters=default --maxWorkers=2` | 387 suites / 5,462 tests / one snapshot passed, 114.639 s; same one suite / four optional upstream XSD tests skipped |
| `npm run lint:terminology` | Passed |
| `npm run lint:css-tokens` | Exit 0; 13 existing advisory findings retained |
| `node build-runtime-js.js --check` | Passed; compiled output current |
| `node build-sw.js --check` | Passed |
| `node scripts/check-generated-bundles.js` | Passed for all Creator/import bundles |
| Generated-output `git diff --exit-code` and `git diff --check` | Passed; no deployment assets change |
| `E2E_LOCAL_CDN=1 node node_modules/playwright/cli.js test --config=playwright.lifecycle.config.js --project=chromium` | 4 passed, 6.9 s, owned port 8010; configurable with `LIFECYCLE_PORT` |
| `E2E_FRESH_SERVER=1 E2E_LOCAL_CDN=1 node node_modules/playwright/cli.js test tests/e2e/critical-lifecycle.spec.js --project=touch-tablet-chromium --workers=1` | 4 passed, 10.2 s, owned port 8000 |
| Repeated benchmark and persisted-state checks | 20 successful journeys, including warmups; exact saved/restored indices and v11 format preserved in the raw reports |
| `node tests/perf/compare-focused.cjs reports/cleanup-04/perf-base.json reports/cleanup-04/perf-head.json` | Passed, reproduced committed comparison; deliberate viewport-mismatch probe correctly rejected |

The final 16 new Jest cases execute complete scripts/real React/native canvas or extend the real storage/sync integration harness. New browser checks exercise real HTML/runtime loaders and compiled entries. These safeguards all run against unchanged product code; the production files and generated outputs match the fetched base exactly. No test was disabled, assertion weakened, golden refreshed, product bug fixed or deployment asset regenerated to make them pass. Earlier diagnostic runs with the restricted shell could not spawn subprocesses/open test sockets; those are superseded by complete Node 22 runs with the required capabilities.

The local CDN helper substitutes installed libraries and removes HTML SRI. This does not validate production CDN/SRI delivery. Service workers are blocked for these journeys; offline behaviour is inspected as unchanged, not newly browser-tested. Firefox and WebKit were attempted but could not launch in this container (see coverage map). Chromium touch emulation is not an iPad Safari check. True peak memory and long-session retained-memory growth remain unmeasured.

The prerequisite's [full browser baseline](../../docs/validation-baseline.md) documents 41 unrelated failures; the entire matrix is not rerun or labelled passed here. Keep the PR draft. Known behaviour and measurement limits are recorded separately, not silently corrected. Exact-head remote CI and the mandatory post-PR review are reported in the PR discussion after publication.
