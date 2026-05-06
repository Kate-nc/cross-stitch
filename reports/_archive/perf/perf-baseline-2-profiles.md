# Perf Baseline 2 — Profiles

> The full CPU flame-graph / GC pause analysis specified in the brief
> requires Chrome DevTools running on a real device. This file
> documents the harness that captures the equivalent data
> (`tests/perf/*.spec.js`) and the **Node-side microbenchmarks** that
> can be run from the agent environment without a browser.

## Harness — what to run, what it produces

| Spec | Drives | Output |
|---|---|---|
| [tests/perf/startup.spec.js](../tests/perf/startup.spec.js) | Loads each entry HTML, captures every script response (size + status), reads `performance.getEntriesByType('navigation')` and `paint`, samples `performance.memory` | `reports/perf-results/startup.json` |
| [tests/perf/interactions.spec.js](../tests/perf/interactions.spec.js) | Seeds a synthetic 400×600 project into IndexedDB, opens it, drives 60 wheel pans + 30 zooms, samples rAF frame times, then runs save + load round-trip | `reports/perf-results/interactions.json` |
| [tests/perf/import.spec.js](../tests/perf/import.spec.js) | Calls `window.ImportEngine.importPattern` against the three `TestUploads/*.pdf` fixtures, samples `performance.memory` peak, captures stage-by-stage progress messages | `reports/perf-results/import.json` |

Run with:

```powershell
npm run perf:baseline   # desktop Chromium @ 1440×900
npm run perf:mobile     # Pixel 5 emulation
```

The Playwright config (`playwright.config.js`) registers two new
projects, `perf-desktop` and `perf-mobile`, both rooted at
`tests/perf/`. They share the same `webServer` block as the e2e
project (`node serve.js 8000`).

After running, paste the resulting JSON tables into the “HARNESS-PENDING”
rows of [perf-baseline-1-measurements.md](./perf-baseline-1-measurements.md)
and the “before” / “after” columns of
[perf-results-1-final-measurements.md](./perf-results-1-final-measurements.md).

## Hot-path candidates identified by static reading

These are the spots that *will* show up at the top of any flame graph
once it is captured. Listed in approximate decreasing static cost:

1. **Eager parse + execute of `import-engine/bundle.js` (126 KB)** on
   every entry page that isn’t the manager. This is pure parse cost on
   the main thread before the React app can mount. (See
   [perf-baseline-3-new-lag-diagnosis.md](./perf-baseline-3-new-lag-diagnosis.md)
   §1.)
2. **Eager parse + execute of `creator/bundle.js` (889 KB)** on
   `index.html` / `create.html`. Pre-existing, not introduced by the
   import feature — but it is the single biggest startup cost.
3. **Babel-standalone runtime compilation** of `tracker-app.js`,
   `creator-main.js`, `stats-page.js`, `stats-activity.js`,
   `stats-insights.js`, `manager-app.js`, `home-app.js`. The
   in-browser Babel pass for the Tracker (386 KB JSX) is the longest
   single main-thread task on `stitch.html` first-load. Cached in
   `localStorage` after first run, so this is a **first-visit** cost
   only.
4. **`creator/canvasRenderer.js` full-grid redraws** during pan/zoom
   on a 400×600 grid. Static read shows the renderer iterates every
   cell in the visible viewport on every transform; whether dirty
   regions are tracked depends on
   [creator/PatternCanvas.js](../creator/PatternCanvas.js) — to be
   confirmed by the harness.
5. **`tracker-app.js` re-renders on stitch placement** — large
   component tree, props passed by reference; whether
   `React.memo` / `useMemo` boundaries break the cascade is unclear
   from a static read.
6. **`pipeline.runPipeline` synchronous CPU** on PDF import — the
   classifier sniffs, the strategy parses, the assembler stitches
   pages, the validator runs colour matching, the materialiser
   builds the v8 project. Today most of this runs on the **main
   thread** (the Web Worker fallback path in `workerClient.js` is
   present but the picker uses the main-thread path on `home.html`).

## Node microbenchmarks (runnable without a browser)

The following pure-function paths can be timed with `node --expose-gc
scripts/perf/microbench.js` (script not yet created — to add in
Phase 2 if Cat A doesn’t move the needle enough):

- `colour-utils.findBest` — colour matching for a synthetic 400×600
  pattern against the full DMC palette (this is the inner loop of
  the materialiser).
- `threadCalc.stitchesToSkeins` — bulk skein estimation across a
  240,000-cell pattern.
- `helpers.gridCoord` and friends — touched on every pointer move.

These would establish a Node-side baseline for the V8 cost of the
core algorithms, so any Cat-A optimisation that touches them can be
proven unaffected even before the harness is run.
