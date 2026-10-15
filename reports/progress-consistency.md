# Track progress consistency review

Base: `origin/main` at `31e6d191` (v1.0.157). The supplied checkout was clean; the branch was moved onto the latest fetched main before final validation. The newer sync, session-durability and thread-accounting changes are preserved.

## Contract

See [canonical progress contract](../docs/progress-contract.md). Full = 1, half side = 0.5, quarter/petite = 0.25, knot = 1. Keep exact units in arithmetic and summary storage. Backstitch is separate. Empty counted work is 0%, incomplete. Display percentages round to one decimal and cap at 99.9% until counted work is complete. Only exact, unfiltered project completion can trigger the stash prompt.

Existing scope distinctions remain: the strip can count visible layers; work areas count their full and half stitches; project Stats and completion use the whole project. Tracker colour completion additionally checks backstitch lines, while Stats colour visuals describe counted stitch units, as before.

## Stages and bug hunts

1. Canonical arithmetic and completion: fixed QA-04, conserved exact done + remaining = total, retained small fractional unit text, and prevented excess marks of one type compensating for pending work of another. Property-based and small-fixture tests passed before moving on.
   - Between-stage hunt found prematurely rounded summary storage, fractional milestone thresholds rounded down, and separately loaded Stats totals rounded before calculating percentages.
2. Counter invalidation: fixed QA-09 with a half-only invalidation effect. Full marks still use incremental deltas. A 500×500 / 100-colour hook fixture verifies no full-grid reads after initialisation for half marking or incremental full marking.
   - Between-stage hunt found overall half counts accepted orphan marks that colour counters ignored. Both now count only defined sides. Saved full marks on background cells are also excluded, with a cache keyed by both pattern and mark references.
3. UI consumers: fixed QA-11 and QA-12. Tracker passes exact units into Stats; colour visuals and legend rows use canonical weights. Read-only Stats builds colours from full, half, quarter and knot definitions, retains blends and fractional-only colours, and cancels outdated project loads.
   - Final hunt removed secondary rounding in header, Home/library, comparisons, Insights, project pickers, recap and Focus accessibility values. Share text, session percentages and exported cards retain capped percentages. Remaining colour units include fractional work rather than displaying zero or counting halves twice.
   - Summary version 3 repairs previously rounded metadata without rewriting projects. Global Stats also runs this migration when entered directly, without visiting Home.

## Before / after

| Fixture | Before | After |
| --- | --- | --- |
| 2,499 / 2,500 full stitches | 100%, completion prompt | 99.9%, no prompt |
| One done full + one pending half | Track 66.7%, Stats/colour visuals 50% | 66.7% on all three |
| One pending quarter | Rounded total could be 0 | 0 / 0.25 units, incomplete |
| Three done half sides | Summary stored 2 | Summary stores 1.5 |
| Pending half hidden; full layer complete | Could open project completion prompt | Visible scope complete; whole project incomplete |

## Validation

- Full Jest suite: 336 suites, 4,516 tests and one snapshot pass (108 seconds). Focused counter/storage/statistics tests and property-based conservation checks also pass.
- Seven passing Chromium browser cases (29 seconds) across `progress-units.spec.js` and `qa-track-review.spec.js`: cross-surface totals, fractional summary storage, session marks, another project loaded into Stats, near completion/work areas, half mark/unmark and reload, hidden layers.
- Behavioral exported-card and share-text checks, exact milestone thresholds, fractional-only/three-quarter/half-only fixtures, empty/reset/complete states, separate backstitch, colour aggregation, orphan marks and summary migration.
- Runtime bundle regenerated; `node build-runtime-js.js --check` and `git diff --check` pass. Terminology lint passes.
- CSS-token lint has 13 existing advisory findings in unchanged `styles.css`; no audit assertions were relaxed.

## Performance observations

On the 250,000-cell / 100-colour React hook fixture, the isolated run took about 125 ms for 100 half mark/unmark renders and 12 ms for 100 incremental full marks. A warmed full-suite run measured about 10 ms and 3 ms respectively. These include hook/render overhead, exclude canvas and autosave, and are observations rather than timing budgets. An instrumented full-grid cell getter confirms zero full-pattern scans on these mark paths. Structural loads still rebuild counters. Saved-record counting retains reference-based caches.

## Test environment

Browser checks use `E2E_LOCAL_CDN=1`, the installed `/usr/bin/chromium`, and a temporary Playwright configuration with video/trace disabled because bundled browser/ffmpeg binaries are absent. Local serving and remote Git operations require execution outside the restricted sandbox. The temporary configuration and logs are in `work/` and are not committed.
