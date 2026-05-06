# Perf Opt 1 — Prioritised Fix List (Category A — Quick Wins)

Each row scored as **impact × frequency × breadth**. Confirmed scope is
Category A only this pass.

| # | Bottleneck | Static cost | Frequency | Breadth | Risk | Tests cover it? | Fix |
|---|---|---:|---|---|---|---|---|
| 1 | `import-engine/bundle.js` eager-loaded on home/index/create/stitch | 126 KB JS parse + execute | every page load on 4 of 5 entry pages | every user, every session | LOW (3 narrow public-API entry points) | partial — `tests/import/*` exercise the engine but not the load mechanism | Replace the eager `<script>` tag with a tiny shim that defines the public surface and lazy-loads the bundle on first call. |
| 2 | wireApp sessionStorage breadcrumb drain at parse time | <1 ms | every page load | every user | n/a | n/a | Subsumed by #1 — once the bundle is lazy, this only runs after first import. |
| 3 | Global `unhandledrejection` listener installed at parse time | n/a (allocation-only) | every page load | every user | n/a | n/a | Subsumed by #1. |
| 4 | (Out of scope this pass) `creator/bundle.js` 889 KB eager | 889 KB | every load of index/create | creator users | HIGH (would need a bundler) | yes (creator suites) | Defer to Cat C. |
| 5 | (Out of scope this pass) `anchor-data.js` 45 KB + `thread-conversions.js` 65 KB eager | 110 KB | every page load | every user | MEDIUM (Adapt UI must wait) | partial | Defer. |

**Decision: ship #1 as a single commit.** It collapses #1, #2, and
#3 into one mechanical change and is the highest-impact, lowest-risk
fix in the entire baseline.

Estimated improvement (parse cost only — actual delta to be filled in
by `npm run perf:baseline` before/after):

- ~80–150 ms saved on `home.html`, `stitch.html` first-paint on
  mid-range mobile (where the engine is *never* used unless the user
  picks a pattern file).
- ~30–60 ms saved on desktop.
- Bytes downloaded: −126 KB on first visit per page (after the SW
  caches it the byte cost is one-off; the parse cost is paid every
  navigation).
