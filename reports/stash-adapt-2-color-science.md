# Stash-Adapt — Phase 1.2 — Colour Science

## 1. Distance formulas — which to use

### 1.1 The candidates

| Formula | Cost | Perceptual accuracy | Where used today |
|---|---|---|---|
| Euclidean RGB | trivial | poor; especially bad in blue-purple and dark navies | nowhere serious |
| CIE76 ΔE (Euclidean in Lab) | low | OK at moderate distances; over-weights chroma | hot loops in `quantize`/`doDither` (`dE`, `dE2`) |
| CIE94 | medium | better; weights chroma down | not used |
| **CIEDE2000** | medium-high (~3–5× CIE76) | best published; corrects hue, lightness, chroma all together | `dE2000` — used in conversions, substitute modal, "good/fair/poor" buckets |
| OKLAB / OKLCH ΔE | low (similar to CIE76 in OKLab) | very close to CIEDE2000 in practice; simpler maths | `palette-swap.js` for hue-rotation only |

### 1.2 Recommendation

**Use CIEDE2000 (`dE2000`) for all match-quality decisions in the
adaptation feature.** Reasons:

1. The performance cost is acceptable. The user's stated worst case is
   80 pattern colours × 200 stash threads = 16 000 pairs. On a modern
   laptop CIEDE2000 runs ~250 ns per call (Node 22, hot path) → **~4 ms
   total**. Even on a low-end mobile that's < 50 ms. Well under the
   "complete in under a second" rule.
2. It already powers the existing substitute modal and the conversion
   modal; reusing it keeps results consistent across the feature.
3. CIE76 is genuinely misleading in cross-stitch's dominant problem
   regions: dark blues vs dark purples (e.g. DMC 823 / 939 / 3750), and
   dark reds vs dark browns (e.g. DMC 814 / 902 / 3777). CIE76 ranks
   these incorrectly often enough that stitchers visibly notice.
4. It's the formula most cross-stitch tooling and academic literature
   converged on (post-2001).

**Cache aggressively.** A single `Map` keyed by
`min(keyA,keyB) + "|" + max(...)` over the comparison's lifetime is
sufficient — same pairs get compared many times during a single review
session (recompute on filter change, on "re-run match," etc.).

**Keep CIE76 for in-loop generation work** (`quantize`, `doDither`).
Don't change those — they're at the wrong granularity to need 2000 and
the existing tests pin their behaviour.

### 1.3 Tier thresholds

The substitute modal already uses `<5` / `<10` / `≥10` ΔE2000 to bucket
into good/fair/poor. Aligning the new feature with these thresholds and
adding one more for "exact":

| Tier | ΔE2000 | Plain-language label | Visual cue |
|---|---|---|---|
| Exact | < 1 | "Same colour" | filled green dot |
| Close | < 3 | "Looks the same" | filled green dot |
| Good | < 5 | "Very close" | green dot |
| Fair | < 10 | "Noticeable but acceptable" | amber dot |
| Poor | < 20 | "Visibly different" | red dot |
| No match | ≥ 20 | "Not a match" | red ring, no fill |

These match Sharma & Wu (2005) commonly-cited tolerance ranges and align
with what the cross-stitch community calls the "skim test" — at ΔE2000 < 5
a stitched substitution is invisible from a metre away under daylight; at
ΔE2000 > 10 it stands out even in dim light.

> Single source of truth: define `MATCH_TIERS` in a new file `creator/matchQuality.js`
> with a pure `classifyMatch(deltaE) → tier` and an exported `MATCH_TIERS` array
> so the UI, the export metadata, and the tests all read the same numbers.

## 2. Colour space for comparisons

- Always compare in **CIE Lab D65** (already pre-computed on every DMC
  and Anchor entry — zero conversion cost at compare time).
- The alternative (OKLab) is fine but the existing data is in CIE Lab.
  Switching now would require regenerating the catalogues' lab arrays and
  re-pinning the dither tests. Not worth it.

## 3. Cross-brand mappings — official vs algorithmic

### 3.1 What "official" means

- **DMC's published Anchor chart** and **Coats/Anchor's published DMC chart
  do not agree.** They were produced independently, decades apart, often
  by colour-mapping individual visual references. ΔE2000 between the two
  "official" answers can exceed 10 for some IDs.
- "Official" therefore means *one of the historic chart positions*, not
  *the perceptually closest match.* The catch is that stitchers have used
  these charts for 30+ years and many treat them as ground truth. A pure
  algorithmic match for, say, DMC 310 → Anchor 403 looks weird if it
  contradicts the chart users learned on.

### 3.2 The repo's reconciliation

[thread-conversions.js](../thread-conversions.js) reconciles by:

- Cross-checking 5 sources (DMC official, Coats official, Stitchtastic,
  Cross-Stitched.com, sibalman/thread-converter).
- Tagging the result `official` (all agree, ΔE2000 < 3),
  `reconciled` (sources disagreed, median picked, ΔE2000 3–5), or
  `single-source` (only one chart had a mapping).
- Algorithmic fallback when no chart has a mapping at all → tagged
  `nearest`.

That tagging is the single most important honesty signal we should
surface in the UI. A "match" sourced from the official chart with ΔE2000
4 is perceptually a worse match than an algorithmic ΔE2000 1.5 — but it's
the answer experienced stitchers expect to see. **Show both pieces of
information.**

### 3.3 Recommendation for new feature

- For cross-brand conversion (Flow C): use `CONVERSIONS` first; show the
  confidence tag *and* the ΔE2000 distance. Let the user opt in to
  "prefer perceptual closest match over chart match" via a toggle (the
  power user lever) but default to chart-first.
- For stash-based adaptation (Flow A): chart mappings don't help — the
  stash contents are arbitrary. Pure ΔE2000 ranking against stash items.
- For general single-colour swap (Flow B): no automatic suggestion — let
  the user search. Optionally show "closest in catalogue" as a hint.

## 4. Practical considerations stitchers raise

These are recurring themes from r/CrossStitch threads on substitution
(2019-present) and the CrossStitchTotallyForum:

1. **Floss texture differs.** DMC mercerised cotton has a higher sheen
   than Anchor in some shades; the colour can match perfectly but the
   substituted area "reads" differently in raked light. *Out of scope to
   model, but worth a one-liner in the export PDF metadata so the
   stitcher knows.*

2. **Variegated, metallic, glow-in-the-dark, satin, light-effects
   threads.** The DMC catalogue in this repo includes a few — `E…`
   (light effects), `B5200` (snow white), some satin variants. **These
   should be excluded from automatic matching** (they're not solid
   colours; mapping a solid 310 to a satin 310 changes the visual
   outcome dramatically) but should remain *manually* selectable. We can
   detect them by id-prefix (`E*`, `S*`, `4***` for variegated) — define
   a `SPECIALTY_PREFIXES` list with conservative defaults and let the
   user opt-in to including them.

3. **Dye-lot variation.** Two skeins of the same DMC 310 from different
   batches can have ΔE2000 ~ 1. **Explicitly out of scope** per spec.
   Mention in the README so it's clear to the user.

4. **"There is no equivalent" vs "you don't own one"** — already
   captured in the existing modal's `no_stash_match` skip reason. Surface
   this distinction prominently in the new UI: a colour with no Anchor
   equivalent at all is a *catalogue limitation* and the user must accept
   ΔE > threshold; a colour with no stash match is a *shopping
   opportunity* — link it to the stash's "add to shopping list" flow.

5. **Workflow today (from forum scraping):** experienced stitchers
   typically (a) print or export the chart, (b) manually walk the colour
   list with their stash drawer open, (c) cross out and write
   replacements, (d) keep a written "substitution sheet" with the
   pattern. The mental model is *spreadsheet-like* — they want to see
   *every* substitution at once, not a wizard. This biases UI design
   toward a table/list view over a one-at-a-time picker for the *review*
   step (manual edits *within* the table can still pop a picker).

## 5. Failure modes to guard against

- **The "blue-purple cluster".** RGB-near, perceptually-far. Test fixture
  pairs where CIE76 chooses badly:
  - DMC 824 (Blue Very Dark) ↔ DMC 823 (Navy Blue Dark) — RGB looks like
    a swap but stitched they're distinct.
  - DMC 791 (Cornflower Blue Very Dark) vs 939 (Navy Blue Very Dark).
  - Browns ↔ dark reds: DMC 938, 898, 3371, 814.
  - Yellow-green vs olive: DMC 730, 731, 732 vs 580, 581.

  Add a unit-test fixture asserting the CIE2000 ranking for these.

- **Monochrome stash.** A user with only blacks/greys/whites attempts to
  adapt a multi-colour pattern. Most colours hit `no_stash_match`. UI
  must not feel broken — "this stash can't cover most of this pattern"
  is the answer; we should still let them stitch the parts that do
  match.

- **Single-colour pattern.** Pure black-on-aida blackwork. Algorithm
  must not crash on a one-thread palette.

- **Blends.** Pattern cell `id: "310+550"`. The substitute modal already
  decomposes blends to component threads — preserve that. Substituting a
  blend always requires substituting *both* components; if one has no
  match, treat the blend as unmatched.

- **Empty palette / corrupt cell.** Cells with `id: "__empty__"` /
  `__skip__` — already handled by the existing engines; preserve.
