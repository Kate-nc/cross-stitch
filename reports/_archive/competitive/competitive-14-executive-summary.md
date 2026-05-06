# Competitive Report 14: Executive Summary

> **Audience:** Decision-maker reading their first document in this series.
> Everything below is derived from Reports 1–13.

---

## The Situation in One Paragraph

This app is technically one of the most capable cross-stitch tools available
on the web — free, offline-capable, integrated across creation, tracking, and
stash management in a way no competitor achieves. Yet it is being evaluated
alongside tools that charge £1.60 per pattern export, require accounts, and
lack half its features. The problem is not capability; it is legibility. Users
cannot see what makes it better. The highest-return work is not building new
features: it is making existing advantages visible.

---

## Strategic Position

### Where We Win

| Advantage | Status | Nearest competitor |
|---|---|---|
| Fully integrated (create + track + stash) | Clear lead | No competitor has all three |
| Free, no account, no export limits | Clear lead | StitchMate: £1.60/pattern; Thread-Bare: $10/pattern |
| 22-widget statistics suite | Unique | No competitor has anything comparable |
| Offline PWA (works without internet) | Clear lead | All web competitors require connectivity |
| Parking marker tracking | On par with Pattern Keeper | Pattern Keeper; no web competitor has this |
| Pattern Keeper–compatible PDF export | Feature parity | PK itself is the only other source |
| Stash-aware palette generation | Unique | No competitor has this at all |
| Rich import formats (.oxs, .json, image, .pdf) | Competitive | StitchMate supports .oxs, .pat, .xsd |

### Where We Are Behind

| Gap | Nearest leader | Priority |
|---|---|---|
| No stitchability quality score | StitchMate FLOW Score | P1 |
| No live 2-panel preview during generation | StitchMate | P1 |
| No row mode in tracker | Pattern Keeper | P1 |
| No thread gap analysis (stash → purchase) | Ravelry (adjacent) | P1 |
| No text tool | StitchMate (48 fonts) | P2 |
| Creator limited to DMC (Anchor in stash) | StitchMate, Thread-Bare | P3 |
| PK compatibility not communicated | — (it exists; it's invisible) | P0 |
| Free tier not communicated | — (it's free; nobody knows) | P0 |

---

## Key Findings from User Research

1. **Power of free positioning:** In 1-star reviews of paid competitors,
   "too expensive" and "can't try before I buy" are the most common complaints.
   Being free-by-default is not a nice-to-have — it is a primary acquisition
   driver in this market.

2. **Pattern Keeper is the de-facto standard:** Among serious Android trackers,
   Pattern Keeper has 100k+ reviews and is considered the only acceptable
   tracking app. Being "PK compatible" is a trust signal of the same order as
   a safety certification. Our export is PK-compatible; zero users currently
   know this from our UI.

3. **"Confetti" is the primary complaint in image conversion:** "Too many
   single isolated stitches", "looks terrible when you try to stitch it", and
   "I had to manually fix 200 cells" are the primary 1-star patterns on
   StitchMate and Stitch Fiddle. Our orphan removal feature directly addresses
   this; the feature is named in a way that users do not recognise.

4. **Integrated workflow is the top unmet need:** Users across Reddit
   (r/CrossStitch, r/CrossStitchPattern) consistently report using 2–4
   separate apps for creation, tracking, and stash management. The market
   explicitly wants what we already have.

5. **Statistics depth is valued:** Power users on Ravelry demonstrate strong
   engagement with data features. Cross-stitch has the same demographic
   (crafters who enjoy data). Our 22-widget suite is an untapped retention
   mechanism.

---

## Top 5 Recommendations

### 1. Communicate the value proposition immediately (P0)
**Action:** Add "Free forever, no account, no export limits" and a Pattern
Keeper compatibility badge to the home page and export tab. Takes less than
a day.
**Impact:** Converts users who leave because they assume paywalls exist.

### 2. Rename "Orphan removal" to "Confetti cleanup" (P0)
**Action:** Find-and-replace in all UI strings.
**Impact:** Maps our existing quality tool to the vocabulary users already use
when complaining about the problem it solves.

### 3. Add a stitchability score to the generation output (P1)
**Action:** Compute confetti ratio and thread-change estimate from the generated
pattern grid; display below preview with an amber overlay for isolated stitches.
**Impact:** Makes our quality positioning tangible; gives users a feedback loop
when choosing dithering and cleanup settings.

### 4. Build the thread gap shopping list (P1)
**Action:** In the pattern library, compare a wishlist pattern's palette against
the user's stash and list the threads to buy; add to shopping list with one tap.
**Impact:** Activates the integrated suite in a way users feel daily; creates
a natural loop that keeps them returning.

### 5. Add row mode to the stitch tracker (P1)
**Action:** Row highlight + prev/next navigation buttons, toggled from the
toolbar.
**Impact:** Directly addresses the main Pattern Keeper advantage for
row-by-row stitchers; positions us as a serious tracking alternative.

---

## What Not to Do

The 10 anti-recommendations in Report 13 are equally important. In summary:

- Do **not** add multi-craft support — Stitch Fiddle owns this space.
- Do **not** add paywalls — "free" is our primary competitive moat.
- Do **not** build cloud sync — our no-account model is a trust advantage.
- Do **not** try to out-Pattern Keeper Pattern Keeper — instead, make our
  export the best PK-compatible export available.
- Do **not** simplify the statistics suite — it is a genuine differentiator;
  add tooltips, not deletions.

---

## The Integrated Suite Thesis

The single most important strategic conclusion from this analysis:

> No competitor occupies the "integrated create + track + stash" position.
> StitchMate, Stitch Fiddle, and Thread-Bare are creation-only.
> Pattern Keeper is tracking-only.
> Thread Stash is stash-only.
> We are the only tool that does all three — for free, in a browser, offline.

This is the product identity. Every feature decision should ask: "does this
deepen the integrated experience?" The thread gap analysis (stash → shopping
list) and stash-aware palette generation are examples of features that only
make sense in an integrated tool. Building them makes us more integrated and
harder to copy, not just more featured.

---

## Roadmap Summary

| Phase | Theme | Duration | Key deliverable |
|---|---|---|---|
| Phase 0 | Say what we already are | 1 week | PK badge + free copy + rename |
| Phase 1 | First run that works | 2–3 weeks | Stitchability score + first-run home |
| Phase 2 | The feedback loops | 4–6 weeks | Live preview + row mode + thread gap |
| Phase 3 | Polish and depth | 4–6 weeks | Text tool + stats sharing + stash CSV |
| Phase 4 | Expand | 6–10 weeks | Anchor in creator + sync UX |

Phase 0 has the highest ROI of any phase in this analysis. It requires
approximately 1–2 person-days of work and directly addresses the primary
discovery barriers identified in user research.

---

## Source Reports

| Report | Topic |
|---|---|
| 01 | Cross-stitch app landscape overview |
| 02 | Adjacent tools (Ravelry, fitness apps, art tools) |
| 03 | User needs from research (reviews, Reddit, forums) |
| 04 | Market map |
| 05 | Feature gap analysis |
| 06 | UX flow gaps |
| 07 | Clarity and communication gaps |
| 08 | Blue ocean opportunity mapping |
| 09 | Competitive strengths analysis |
| 10 | UX flow improvements from adjacent tools |
| 11 | Consolidated prioritised recommendations |
| 12 | Phased roadmap |
| 13 | Anti-recommendations |
| 14 | This document — executive summary |
| 15 | Landscape reference (competitor quick-lookup table) |
