# Difficulty Calculator Redesign — Proposal Ranking

Five interactive proposals for the difficulty calculator redesign. Each has been scored
on eight criteria on a 1–5 scale (5 = best). Proposals are listed with their HTML files
for hands-on review.

---

## Proposals at a Glance

| Proposal | Model | Key Output |
|---|---|---|
| **A** — Weighted Linear | `proposal-A-weighted-linear.html` | Single 0–100 score with factor bars |
| **B** — Decision Tree | `proposal-B-decision-tree.html` | Gate-based tier: gates must all pass |
| **C** — Radar Chart | `proposal-C-radar-chart.html` | 6 independent axes, no single number |
| **D** — Primary + Modifier | `proposal-D-primary-modifier.html` | Base tier + named modifier arrows |
| **E** — Bottleneck Rule | `proposal-E-bottleneck-rule.html` | Composite + floor from worst factor |

---

## Scoring Rubric

| # | Criterion | Definition |
|---|---|---|
| 1 | **Accuracy** | Does output match real-world difficulty as experienced by stitchers? (15 archetypes from `reports/difficulty/08_CALIBRATION.md`) |
| 2 | **Interpretability** | How quickly does a user — especially a non-technical stitcher — understand what the number/tier means? |
| 3 | **Comparability** | Can two patterns be meaningfully ranked or sorted against each other? |
| 4 | **Informativeness** | How much useful "why" information is conveyed alongside the result? |
| 5 | **Dual-Audience Fit** | Serves both personal tracking (stitcher detail) AND public marketplace display (compact summary)? |
| 6 | **Computation Cost** | How expensive is the calculation? Lower cost = higher score. |
| 7 | **Graceful Degradation** | If input data is partial (e.g. no confetti analysis, no backstitch data), does the model remain usable? |
| 8 | **Extensibility** | How easily can new factors or weight adjustments be introduced later? |

Score scale: **1** = poor, **2** = below average, **3** = adequate, **4** = good, **5** = excellent.

---

## Scores

### Proposal A — Weighted Linear (`proposal-A-weighted-linear.html`)

> Single 0–100 numeric score from a 6-factor weighted sum. Tiers at 0–25 / 26–50 / 51–75 / 76–100.

| Criterion | Score | Notes |
|---|:---:|---|
| Accuracy | 4 | Weights are tunable; calibration against the 15 archetypes is straightforward. Confetti handled by dedicated 28% weight, preventing the X-2 edge case failure. |
| Interpretability | 4 | The number is familiar (like a test score); tier name provides anchor. Factor bars explain the breakdown without requiring the user to do maths. |
| Comparability | 5 | Single number is unambiguous — trivially sortable and diffable. "Pattern B is 62, Pattern A is 44" is immediately understood. |
| Informativeness | 4 | Factor bars with weights shown give a clear picture of contributors. Personal adjustment layer adds relative context. |
| Dual-Audience Fit | 4 | Market view can show tier + score; stitcher view can show full breakdown. Both are natural extractions of the same data. |
| Computation Cost | 4 | O(w×h) factor scans, all linear. No BFS or secondary passes beyond what analysis-worker already does. |
| Graceful Degradation | 4 | Missing factors default to 0 contribution. A pattern with no confetti data simply omits that component — score is still valid, just narrower. |
| Extensibility | 5 | Adding a factor = adding a weight entry and a computation function. Weights can be re-tuned via a config object. |
| **Total** | **34 / 40** | |

---

### Proposal B — Decision Tree (`proposal-B-decision-tree.html`)

> Gate-based tier classification. Three gates per tier (Expert/Advanced/Intermediate). Tier = highest level where ALL gates pass. Floor = Beginner.

| Criterion | Score | Notes |
|---|:---:|---|
| Accuracy | 3 | Gate thresholds are brittle. Edge cases near thresholds can produce unexpected jumps (a pattern with 9 confusable pairs vs 10 can land two tiers apart). Requires extensive threshold tuning to match stitcher intuition. |
| Interpretability | 5 | Binary pass/fail gates are the most intuitive output possible. Users understand "you need all three gates to reach Expert." No ambiguity about what the tier means. |
| Comparability | 2 | Two patterns in the same tier cannot be ranked. A low-Advanced and a high-Advanced are indistinguishable. Sorting is only by tier (4 buckets). |
| Informativeness | 4 | Gate visualisation shows exactly which dimension blocked a higher tier. "You would be Advanced but confetti gate failed" is directly actionable. |
| Dual-Audience Fit | 3 | Market view is clean (tier only). Stitcher view is informative. But the gate detail is too technical for casual marketplace browsing. |
| Computation Cost | 5 | No aggregation needed — just threshold comparisons. Fastest model of the five. |
| Graceful Degradation | 3 | A missing factor means a gate cannot be evaluated. Model falls back to ignoring that gate, which may under-report difficulty. Missing confetti data silently removes the confetti gate. |
| Extensibility | 3 | Adding a new tier requires rewriting gate logic. Adjusting thresholds changes tier boundaries non-locally. Difficult to guarantee calibration stability after edits. |
| **Total** | **28 / 40** | |

---

### Proposal C — Radar Chart (`proposal-C-radar-chart.html`)

> No single score. Six independent axes (0–100 each), displayed as a radar polygon. Tier is a suggestion derived from the highest axis score.

| Criterion | Score | Notes |
|---|:---:|---|
| Accuracy | 4 | No aggregation means no blending errors; each axis is independently calibratable. However, "accuracy" is harder to define when there is no single ground-truth output. |
| Interpretability | 2 | Beautiful for experienced stitchers who understand radars, but confusing for beginners. "What does a Colour score of 73 mean for me?" requires extra explanation. No single number = no anchor. |
| Comparability | 1 | Comparing two radar polygons is nearly impossible without significant cognitive effort. Cannot sort a pattern list by this model. |
| Informativeness | 5 | Maximum information per dimension. Each axis conveys independent, actionable data. Personal overlay adds direct comparison to comfort zone. |
| Dual-Audience Fit | 2 | Radar is too information-dense for marketplace use. Market view would need to be reduced to 2–3 key highlights, losing the model's main advantage. |
| Computation Cost | 4 | Same O(w×h) scans as others. No extra overhead beyond the 6 independent computations. |
| Graceful Degradation | 5 | Missing axes simply don't render. The visible axes remain fully meaningful. Most robust model for partial data. |
| Extensibility | 5 | Adding an axis = add a computation function and extend the polygon. Axes are completely independent. |
| **Total** | **28 / 40** | |

---

### Proposal D — Primary + Modifier (`proposal-D-primary-modifier.html`)

> Base score from size + colour count (the "skeleton"), then named modifier layers applied additively. Output shows: "Intermediate base → +confetti → Advanced".

| Criterion | Score | Notes |
|---|:---:|---|
| Accuracy | 3 | Base score intentionally anchors to the two best-understood factors. Modifiers are additive integers, creating step-function discontinuities. A confetti fraction of 0.29 (no modifier) vs 0.31 (+1 modifier) is an artificial cliff. |
| Interpretability | 5 | Most narrative-friendly model. The "base → modifier chain → result" story maps directly to how stitchers describe difficulty ("it's a medium piece, but it's got a ton of confetti"). |
| Comparability | 3 | Same overall tier → comparable. Within a tier, no numeric sub-ranking is available. Between tiers, the path to result is visible but not a sortable number. |
| Informativeness | 5 | Named modifiers with plain-English descriptions are the most actionable output ("Backstitching: 40 segments per 100 stitches"). Users know exactly what to look out for. |
| Dual-Audience Fit | 4 | Market view: tier name + modifiers as badges. Stitcher view: full modifier chain with explanations. Clean separation works well. |
| Computation Cost | 4 | Modifier thresholds are integer checks. Very fast. Base score is the same two-factor lookup as current `calcDifficulty`. |
| Graceful Degradation | 4 | Missing modifier data = modifier not applied. Base score remains valid. Modifier absence doesn't invalidate the result, just makes it less precise. |
| Extensibility | 4 | New modifiers are independent additions to the modifier list. Base scoring does not change. However, modifier interactions (if added later) would require logic to avoid double-counting. |
| **Total** | **32 / 40** | |

---

### Proposal E — Bottleneck Rule (`proposal-E-bottleneck-rule.html`)

> Computes all 6 factors independently. Final tier = max(weighted-average tier, worst-single-factor tier). The bottleneck prevents easy factors from masking one extreme dimension.

| Criterion | Score | Notes |
|---|:---:|---|
| Accuracy | 5 | Best handling of the calibration edge cases. X-1 (high confetti can't be washed out by easy other factors) and X-2 (extreme confetti floor) are structurally solved. Matches how stitchers talk: "it's not hard overall but the confetti will kill you." |
| Interpretability | 3 | "Composite tier" and "bottleneck tier" require a two-sentence explanation. Once understood, the output is compelling, but there is an initial learning curve compared to A or D. |
| Comparability | 4 | Single final tier is sortable. Composite score provides a numeric sub-ranking within tiers for fine-grained sorting. Better than B, D, and C. |
| Informativeness | 5 | Both the overall picture (composite) and the specific warning (bottleneck factor) are shown. The "limiting factor" callout is highly actionable. |
| Dual-Audience Fit | 4 | Market view shows tier + "hardest aspect: confetti density" chip — informative without being overwhelming. Stitcher view shows full per-factor breakdown. |
| Computation Cost | 3 | Requires computing all 6 factor scores, then an additional max() pass. BFS for confetti is the most expensive step, but is already pre-computed by analysis-worker. |
| Graceful Degradation | 4 | Missing factors default to 0 and are excluded from the max(). Floor logic is conservative: an unknown factor cannot raise the bottleneck. Missing data leaves composite score accurate for what is known. |
| Extensibility | 5 | New factors slot into the factor list with a weight. The bottleneck logic is factor-agnostic. Weights can be re-tuned without changing the floor mechanism. |
| **Total** | **33 / 40** | |

---

## Summary Table

| Criterion | A (Linear) | B (Tree) | C (Radar) | D (Modifier) | E (Bottleneck) |
|---|:---:|:---:|:---:|:---:|:---:|
| Accuracy | 4 | 3 | 4 | 3 | **5** |
| Interpretability | 4 | **5** | 2 | **5** | 3 |
| Comparability | **5** | 2 | 1 | 3 | 4 |
| Informativeness | 4 | 4 | **5** | **5** | **5** |
| Dual-Audience Fit | 4 | 3 | 2 | 4 | 4 |
| Computation Cost | 4 | **5** | 4 | 4 | 3 |
| Graceful Degradation | 4 | 3 | **5** | 4 | 4 |
| Extensibility | **5** | 3 | **5** | 4 | **5** |
| **Total** | **34** | **28** | **28** | **32** | **33** |

---

## Recommended Pick: Proposal A (Weighted Linear) with elements of Proposal E

### Primary recommendation: **Proposal A — Weighted Linear**

**Score: 34 / 40 — highest overall.**

**Rationale:**

Proposal A scores highest on comparability (5) and extensibility (5), and ties for second on
accuracy (4). These three criteria are the most important for a production feature that will:

1. Power a sortable pattern library in the Stash Manager
2. Be embedded in pattern exports and displayed on the marketplace/community surface
3. Evolve over time as more factors become measurable

The weighted-linear model is also the simplest to test and calibrate. Each weight is a
single constant in a config object — adjusting accuracy means tweaking numbers, not
rewriting branching logic. The 15-archetype calibration suite in `08_CALIBRATION.md` maps
directly to unit tests for weight validation.

The one genuine weakness of Proposal A is the edge case X-2: a pattern with extreme confetti
but simple colour/size can, in theory, have its confetti score diluted by the other easy
factors. The **mitigation** is straightforward: give confetti the highest single weight (28%,
already reflected in the proposal) and add a soft floor rule — if confettiScore > 0.7 AND
compositeTier < Intermediate, elevate to Intermediate. This is a one-line guard, not a model
change, and is far less complex than adopting Proposal E's full bottleneck architecture.

**Why not Proposal E?** E's bottleneck mechanism is theoretically sound and scores nearly
as well (33). The cost is interpretability (3 vs 4) and computation cost (3 vs 4). The dual
floor/composite display adds UI complexity that stitchers may find confusing. The accuracy
advantage of E over A is achievable in A with the soft-floor guard above.

**Why not Proposal D?** D has the best narrative clarity but its integer modifier steps
create artificial discontinuities. The calibration archetypes include cases near modifier
thresholds where D would produce incorrect tiers without per-pattern threshold tuning — a
maintenance burden.

**Why not Proposal B or C?** B's comparability score (2) is disqualifying for a sortable
pattern library. C's comparability score (1) and interpretability score (2) make it unsuitable
as the primary system — though its axis breakdown could be used as a supplementary stitcher
view alongside the Proposal A result.

---

### Alternative: **Proposal E — Bottleneck Rule** (if calibration accuracy is the top priority)

If the X-1/X-2 edge cases are judged as hard requirements rather than addressable by a soft
floor, Proposal E is the structurally safer choice. The implementation cost is similar to A
(same factor functions, same aggregation, plus a max() pass), and the "limiting factor"
callout in the UI adds genuine value for stitchers planning a project.

---

## Next Steps

**Human selection required before Phase 3 begins.**

Please indicate your choice:

- `A` — Weighted Linear (recommended)
- `B` — Decision Tree
- `C` — Radar Chart
- `D` — Primary + Modifier
- `E` — Bottleneck Rule
- `A+E hybrid` — Weighted Linear with explicit bottleneck floor (described in rationale above)

Phase 3 will not begin until a selection is confirmed.
