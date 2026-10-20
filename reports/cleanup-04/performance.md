# Same-environment performance protocol

The user confirmed that no target device or numerical budget has been agreed and authorised proceeding without one. No pass/fail latency, memory or slowdown threshold is invented. Historical single-run observations (import 1057/3774 ms; mark p95 34/46 ms; save 732/2056 ms; reopen 2302/5304 ms) remain smoke observations only.

The final harness uses one explicit discarded warmup and at least three measured fresh-context runs for each browser/size. Warmup samples remain in the JSON with `warmup: true`, but distributions exclude them. Each mark sample measures dispatched input to two animation frames, not CPU-only work. `markP95Ms` is the distribution of per-run mark p95 values (20 input samples/run); with three runs, the cross-run p95 is simply the maximum, not a precise tail estimate. Import/save/reopen retain their raw samples too.

Both runs serve whole clean-base/head worktrees from separate ports. They use the same harness, local CDN dependencies, catalogue, deterministic 60-colour v11 JSON fixtures (400×500 and 600×800), Chromium version, viewport and container. Product code is byte-identical: this PR adds tests only. This is therefore an A/A noise baseline for subsequent extractions, not evidence of a product speedup. The reports' `sourceSha` is the product/base revision before the test-only commit; the final branch SHA is recorded separately in the PR/review.

Environment: Linux 6.18.55 x64, Intel Xeon Platinum 8573C; three visible logical CPUs, cgroup quota `200000 100000` (two CPU equivalents), memory cgroup `8589934592` bytes (8 GiB), host-reported memory 9.73 GiB. Node 22.23.3, Playwright 1.59.1, headless Chromium 147.0.7727.15, 1440×900 at DPR 1, no added CPU throttling, service workers blocked. These container results do not substitute for a physical device budget.

Reproduce from the head checkout with the server for the entire base tree on port 8001 and entire head tree on port 8002:

```sh
# Terminal 1, base worktree
node serve.js 8001
# Terminal 2, head worktree
node serve.js 8002
# Terminal 3, head harness; run the batches sequentially, without other tests
E2E_LOCAL_CDN=1 BROWSERS=chromium WARMUPS=1 REPEATS=3 BASE_URL=http://127.0.0.1:8001 BENCH_SERVER_ROOT=/path/to/base-worktree BENCH_SOURCE_LABEL=base node tests/perf/focused-journey.cjs base
E2E_LOCAL_CDN=1 BROWSERS=chromium WARMUPS=1 REPEATS=3 BASE_URL=http://127.0.0.1:8002 BENCH_SERVER_ROOT=/path/to/head-worktree BENCH_SOURCE_LABEL=head node tests/perf/focused-journey.cjs head
node tests/perf/compare-focused.cjs reports/perf-results/focused-base.json reports/perf-results/focused-head.json > comparison.json
```

`BENCH_SERVER_ROOT` identifies the complete tree being served when the head harness measures another worktree; `sourceSha` and `harnessSha` are recorded separately.

Use the same installed browser path for both batches if `PLAYWRIGHT_BROWSERS_PATH` is needed. The comparator rejects mismatched environments, versions, fixture definitions, incomplete runs and diagnostic source overlays. `BENCH_SOURCE_ROOT` remains available for the older five-file diagnostic overlay, documented in `reports/focused-tracking-accessibility.md`; it is not the whole-worktree comparison protocol. Its earlier `REPEATS=1` command should now use `WARMUPS=1 REPEATS=3` when running this harness.

Every run checks exact saved cell indices after 20 keyboard marks, 10 pointer marks and 10 undos. Expected keyboard indices come from the live guide's announced row/column, not an assumed origin; the initial guide centres in the viewport. Full saved records are read directly from IndexedDB, bypassing the progress-record overlay/cache. Reopen waits for a real mounted chart and flushes its restored state before rechecking the same indices. Canvas backing bytes/node counts and Chromium forced-GC heap usage before save and after reopen are retained. These heap figures do not include all native canvas/process allocations and do not establish an absence of leaks. Save timing now includes a direct full-record read, so the historical save values are not an exact comparator.

The raw reports and comparisons alongside this file retain warmup, measured samples, correctness state, browser version and memory observations. Fresh contexts are closed each run; CDP sessions are detached after sampling. Cross-browser/device coverage and true peak-memory measurement remain limitations; the reference environment is not a target-device requirement.

## Recorded measurements

Times below are medians across three measured runs; “mark p95” is the median of each run's 20-sample p95. Raw distributions, all maxima and warmups are retained in [perf-base.json](perf-base.json), [perf-head.json](perf-head.json), [comparison.json](comparison.json) and [perf-noise-repeat.json](perf-noise-repeat.json).

| Size | Batch | Import ms | Mark p95 ms | Save + read ms | Reopen ms | JS heap after GC MiB |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 400×500 | Base | 1042.2 | 35.2 | 896.8 | 2620.5 | 45.07 |
| 400×500 | Head | 1039.1 | 39.6 | 887.5 | 2591.2 | 45.06 |
| 400×500 | Head repeat | 1038.7 | 34.3 | 884.5 | 2616.3 | 45.05 |
| 600×800 | Base | 3459.0 | 48.3 | 2422.9 | 5677.4 | 94.94 |
| 600×800 | Head | 3577.1 | 47.9 | 2542.9 | 5863.6 | 94.95 |

The first 400×500 head batch's per-run mark p95 values were 147.9, 39.6 and 33.9 ms, versus base 34.0, 36.4 and 35.2 ms. A separate warmup + three-run repeat on the same head gave 34.7, 32.4 and 34.3 ms. That same first head run also had save/read 2113.1 ms and reopen 6974.4 ms; the repeat had save/read 869.2–999.2 ms and reopen 2400.8–2641.2 ms. The spikes did not recur; this establishes observable noise, not its root cause. The base import batch also varied from 1025.2 to 1504.9 ms. Six measured samples for the 600×800 pair span import 3429.6–3936.4 ms, mark p95 42.2–56.0 ms, save/read 2408.7–2786.6 ms and reopen 5595.3–6338.1 ms. Treat these as environment-specific reference distributions, not universal device ceilings or statistically precise regression limits.

All 20 journeys (five size/batch groups × one warmup + three measurements) succeeded, including exact persisted/restored mark identities. For 600×800, the JS heap after the reopened-state flush is about 182.7 MiB in both batches, versus about 94.9 MiB before save; backing canvases occupy 16,458,624 bytes at the sampled view. This difference is retained in the raw evidence and its cause is not diagnosed here. Observations at each phase are similar between batches; retained-state correctness is established for these fixtures, not arbitrary project fields or long sessions. No product change is made to explain, hide or “fix” performance variation.

### Median / p95 timings

Each cell is median / p95 in milliseconds. Mark timings pool the 60 measured input-to-two-frame samples per size/batch; the preceding table instead summarises per-run mark p95 values. Import/save/reopen have only three measured samples each, so their p95 is the maximum.

| Size | Batch | Import | Mark | Save + read | Reopen |
| --- | --- | ---: | ---: | ---: | ---: |
| 400x500 | Base | 1042.2 / 1504.9 | 32.2 / 34.9 | 896.8 / 897.6 | 2620.5 / 2915.4 |
| 600x800 | Base | 3459.0 / 3644.0 | 32.3 / 42.2 | 2422.9 / 2506.2 | 5677.4 / 5716.9 |
| 400x500 | Head | 1039.1 / 1091.0 | 32.3 / 41.3 | 887.5 / 2113.1 | 2591.2 / 6974.4 |
| 600x800 | Head | 3577.1 / 3936.4 | 32.3 / 47.3 | 2542.9 / 2786.6 | 5863.6 / 6338.1 |
| 400x500 | Head repeat | 1038.7 / 1064.2 | 32.3 / 33.2 | 884.5 / 999.2 | 2616.3 / 2641.2 |

Memory limitations: these are forced-GC retained JS heap observations and canvas backing-byte counts, not an allocation timeline. True peak JS heap, total browser RSS/GPU/native-image peak and a long-session retained-memory slope were not sampled. No peak-memory budget or leak-free claim is inferred from them.
