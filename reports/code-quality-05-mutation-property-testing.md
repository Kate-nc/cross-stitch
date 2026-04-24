# Code Quality Audit: Mutation Testing & Property-Based Testing Opportunities

## Summary

This audit identifies 28 high-ROI opportunities to harden the cross-stitch codebase using **fast-check property-based testing** and **Stryker mutation testing**.

**Current state:** Jest test suite (~40+ files); no property-based testing; no mutation testing framework.

**Approach:** Start with 3–5 fast-check template tests (easy wins), then enable Stryker on colour-utils.js as proof-of-concept.

---

## TODO Checklist (ordered by ROI)

### Phase 1: Tooling Setup

- [ ] **Install fast-check & Stryker** — Add `fast-check ^3.20.0` and `@stryker-mutator/core ^8.0.0` to devDependencies.
- [ ] **Create .strykerrc.json** — Baseline Stryker config excluding IndexedDB-touching code (helpers.js:71–180, project-storage.js, backup-restore.js); include colour-utils.js, threadCalc.js, sync-engine.js as priority mutants.

### Phase 2: Property-Based Test Templates (Easy)

- [ ] **tests/colour-distance-properties.test.js** — `dE2000` symmetry + reflexivity + bounds invariants. Target: colour-utils.js `dE2000(lab1, lab2)`. Invariants: `dE(a,a)===0`, `dE(a,b)===dE(b,a)`. Arbitrary: Lab tuples. **Easy.**
- [ ] **tests/rgb-to-lab-properties.test.js** — `rgbToLab` output bounds + mono inputs. Invariants: `L ∈ [0,100]`, mono → `a=0,b=0`. **Easy.**
- [ ] **tests/skein-calculation-properties.test.js** — `stitchesToSkeins` linearity + monotonicity + positivity. Invariants: `skeinsExact≥0`, `skeinsToBuy=⌈skeinsExact⌉`, doubling stitches ≈ doubling skeins. **Easy.**
- [ ] **tests/time-formatting-properties.test.js** — `fmtTime` & `fmtTimeL` correctness + plurals. **Easy.**
- [ ] **tests/difficulty-rating-properties.test.js** — `calcDifficulty` always valid rating + monotonicity. **Easy.**

### Phase 3: Colour-Related Properties

- [ ] **tests/colour-matching-properties.test.js** — `findSolid` always finds valid DMC; result.id ∈ palette IDs; matching input → dist ≈ 0. **Easy.**
- [ ] **tests/quantize-properties.test.js** — `quantize` output ⊆ palette + no duplicates + deterministic seeding. **Medium.**
- [ ] **tests/blend-id-properties.test.js** — Blend ID round-trip + canonical sort + no self-blends. **Easy.**
- [ ] **tests/dither-properties.test.js** — `doDither` preserves cell count + output ⊆ palette. **Medium.**

### Phase 4: Parsing & Schema Properties

- [ ] **tests/composite-key-properties.test.js** — Encode/decode round-trip + format validation. Edge cases: null, undefined, non-string. **Easy.**
- [ ] **tests/project-schema-v8-properties.test.js** — Schema v8 validation + serialize round-trip. Pattern length = w×h. **Hard** (requires complex arbitrary).
- [ ] **tests/oxs-roundtrip-properties.test.js** — OXS XML parse → DMC consistency. **Hard.**

### Phase 5: Undo/Redo & Persistence Properties

- [ ] **tests/undo-redo-properties.test.js** — `apply(undo(apply(action,s0),s1)) = s0`. **Hard** (stateful).
- [ ] **tests/half-stitch-toggle-properties.test.js** — Toggle idempotence + state machine consistency. **Hard.**
- [ ] **tests/backup-restore-roundtrip-properties.test.js** — `restore(backup(projects)) ≈ projects` (modulo timestamps). **Hard** (needs IndexedDB mock).

### Phase 6: Mutation Testing

- [ ] **Enable Stryker on colour-utils.js** (priority 1) — k-means + Floyd-Steinberg + matching. ~150–200 mutants. **Medium.**
- [ ] **Enable Stryker on threadCalc.js** (priority 1) — Arithmetic + rounding. ~80–120 mutants. **Easy.**
- [ ] **Enable Stryker on sync-engine.js** (priority 2) — Fingerprinting + merge. **Medium.**
- [ ] **Enable Stryker on helpers.js** (priority 2) — Time formatting + grid coords + difficulty. **Easy.**
- [ ] **Enable Stryker on import-formats.js** (priority 3) — OXS XML + colour matching. **Hard.**
- [ ] **Enable Stryker on creator/generate.js** (priority 3) — Image processing pipeline. **Hard.**
- [ ] **Enable Stryker on insights-engine.js** (priority 3) — Analytics + dates. **Medium.**
- [ ] **Enable Stryker on analysis-worker.js** (priority 2) — Connectivity analysis. **Medium.**
- [ ] **Enable Stryker on palette-swap.js** (priority 3) — Substitution mapping. **Easy.**
- [ ] **Enable Stryker on stash-bridge.js** (priority 2) — Schema migrations. **Hard.**
- [ ] **Baseline mutation score report** — Run Stryker; aim for >80% kill rate.

### Phase 7: Arbitrary Definitions

- [ ] **tests/arbitraries.js** — Library of custom fast-check arbitraries: `fcRgb()`, `fcLab()`, `fcDmcId()`, `fcAnchorId()`, `fcPatternCell()`, `fcProjectV8()`, `fcOxsXml()`, `fcStashEntry()`. **Easy.**
- [ ] **tests/README-property-tests.md** — Guide for writing new property tests. **Easy.**

---

## Tooling Setup

### Installation
```bash
npm install --save-dev fast-check@^3.20.0 @stryker-mutator/core@^8.0.0
```

### .strykerrc.json (Minimal)
```json
{
  "testRunner": "jest",
  "testRunnerNodeArgs": ["--runInBand"],
  "files": ["colour-utils.js", "threadCalc.js", "helpers.js", "sync-engine.js", "creator/generate.js", "analysis-worker.js"],
  "mutate": ["colour-utils.js", "threadCalc.js", "helpers.js"],
  "reporters": ["html", "json"],
  "thresholds": { "high": 85, "medium": 70, "low": 50 },
  "timeoutMS": 10000,
  "maxConcurrentTestRunners": 4,
  "incremental": true
}
```

### Running
```bash
npm test -- tests/colour-distance-properties.test.js
npx stryker run --mutate colour-utils.js --files colour-utils.js
```

---

## Implementation Tips

1. Start with 1–2 property tests to learn fast-check API
2. Reuse arbitraries in `tests/arbitraries.js`
3. Property + example tests complement each other; keep both
4. Use fast-check's automatic shrinking to find minimal counterexamples
5. Mutation testing iteration: run → see uncaught mutations → write properties → re-run
6. Use `fake-indexeddb` for IndexedDB-dependent tests
