# Comparative Calibration — Reference Points & Validation Methodology
## Difficulty Calculator Redesign, Report 08

**Author:** Research Agent  
**Date:** 2026-05-04  
**Status:** Pre-implementation — ready for test-suite authoring  
**Relates to:** `helpers.js → calcDifficulty()`, reports 00–07, `tests/difficultyCalibration.test.js` (proposed)

---

## Table of Contents

1. [The Calibration Problem](#1-the-calibration-problem)
2. [Reference Pattern Library — 15 Archetypes](#2-reference-pattern-library--15-archetypes)
3. [Calibration Data Points Table](#3-calibration-data-points-table)
4. [Validation Methodology](#4-validation-methodology)
5. [Real-World Community References](#5-real-world-community-references)
6. [Proposed Calibration Test File Structure](#6-proposed-calibration-test-file-structure)
7. [Feedback Loop for Future Refinement](#7-feedback-loop-for-future-refinement)
8. [Technical Difficulty vs. Perceived Difficulty](#8-technical-difficulty-vs-perceived-difficulty)
9. [Minimum Viable Calibration Set](#9-minimum-viable-calibration-set)
10. [Open Questions & TODOs](#10-open-questions--todos)

---

## 1. The Calibration Problem

### 1.1 Why a Correct Formula Can Still Be Wrong

A difficulty formula can be internally consistent and mathematically sound while producing scores that experienced stitchers find absurd. Consider this hypothetical scenario using the framework from reports 01–07:

> **Pattern X:** 200 colours, 3,000 total stitches, zero confetti (all solid blocks), 14-count Aida, no fractionals, no backstitching.  
> **Pattern Y:** 12 colours, 40,000 total stitches, 90% confetti density, 28-count evenweave, half-stitches throughout.

A naive linear weighting might give Pattern X a higher difficulty score because raw colour count dominates the formula — yet the cross-stitch community would near-unanimously call Pattern Y harder. The formula is not "wrong" in a mathematical sense; its weights are miscalibrated against human experience.

Calibration is the process of adjusting factor weights until the output tier distribution matches community consensus about representative pattern archetypes.

### 1.2 The Three Calibration Failure Modes

**Tier inflation:** The formula awards too many high scores. Even moderately complex patterns reach "Expert." Effect: users of intermediate skill lose trust in the rating system and ignore it.

**Tier compression:** Too many patterns cluster at "Intermediate" because the weights don't spread the score range. Effect: the rating loses discriminatory power; Beginner and Expert look the same.

**Tier inversion:** A harder pattern receives a lower tier than an easier one. This is the most damaging failure mode — it can mislead a beginner into starting a project that will overwhelm them.

### 1.3 Why Reference Archetypes Are Necessary

The new calculator will be written, weights will be chosen, and thresholds will be set — all before the implementation agent has run it against real patterns. Without a pre-agreed set of ground-truth tier assignments, there is no external validity check. The archetypes in §2 serve as:

- **Acceptance tests:** the calculator must classify each archetype into its expected tier (within tolerance).
- **Regression tests:** future weight changes cannot move an archetype more than one tier without a deliberate, reviewed decision.
- **Weight-tuning targets:** when a calibration test fails, the archetype profile makes the miscalibration diagnosable ("it's scoring Pattern 14 as Intermediate because `confettiScore` is under-weighted relative to `palLen`").

### 1.4 What Calibration Cannot Guarantee

Calibration against archetypes validates the scoring system at known anchor points, but does not guarantee:

- Correct scoring for every possible pattern (just those near an archetype).
- Agreement among individual stitchers (experienced stitchers' difficulty perceptions vary by ±1 tier for borderline patterns).
- Correctness after parameter changes that weren't tested (see §10 open question 4).

A passing calibration suite establishes that the formula is *defensible* — not perfect. The feedback loop in §7 is how perfection is approached iteratively.

---

## 2. Reference Pattern Library — 15 Archetypes

The archetypes below are community-level categories, not specific copyrighted patterns. They are defined by their structural characteristics so any implementation agent can construct synthetic test profiles matching them precisely.

---

### BEGINNER TIER

---

#### B-1: Counted Alphabet Sampler

**Description:** A classic first-project sampler featuring individual letters and simple decorative borders, designed to teach the basic cross-stitch movement. Sold in kit form by every major manufacturer for beginners.

**Characteristics:**
- Simple geometric letter shapes, entirely full cross-stitches
- 3–5 solid colours: typically one dominant letter colour, 1–2 border colours, 1–2 accent colours
- 14-count Aida (standard beginner fabric — large holes, clear grid)
- No fractional stitches, no backstitching, no blends
- Pattern is highly repetitive — counting from A to Z builds muscle memory

**Expected Tier:** Beginner

**Why this tier:**
- Very low colour count (3–5): thread management is trivial
- No confetti: all colours appear in contiguous blocks (each letter is solid)
- Low stitch count (2,000–6,000): achievable in a few evenings
- Standard fabric count: no eyestrain or piercing difficulty
- Highly structured: the alphabet itself guides navigation; miscounting is easy to detect

**Key discriminating factor:**
- Easier → go to 1–2 colours only (monochrome samplers exist and are trivially simple)
- Harder → add backstitched outlines around every letter (pushes to Intermediate because the stitcher must navigate a completely different stitch type in a detailed grid)

---

#### B-2: Small Animal Silhouette

**Description:** A small, solid-filled motif of a recognisable animal (cat, rabbit, bird). Found in beginner kit packs and children's craft sets. The design is a simple outline filled with a few colours.

**Characteristics:**
- Animal outline filled with solid colour blocks
- 4–8 colours: body colour, eye/nose details, background, 1–3 accent shades
- 14-count Aida
- Occasional backstitch for eye detail (1–2 segments, not a complexity driver)
- Very small (1,500–4,000 stitches; typically 30×40 to 50×60 cells)
- Zero or near-zero confetti: animal body is one large block

**Expected Tier:** Beginner

**Why this tier:**
- The body of the animal is typically a single colour in a connected region — no confetti
- Few enough colours that all bobbins can sit in front of the stitcher simultaneously
- Small enough to complete in one weekend
- Any backstitching is minimal (1–3 eye/whisker lines)

**Key discriminating factor:**
- Easier → remove the backstitching entirely (pure beginner)
- Harder → increase the colour count to 15+ shading colours for the fur (becomes B-2+, approaching Intermediate)

---

#### B-3: Geometric Repeating Border

**Description:** A band or border pattern made of repeating geometric units — triangles, diamonds, chevrons, Greek key motifs, or similar. Common in traditional folk-embroidery sampler designs.

**Characteristics:**
- 2–4 colours in a repeating geometric scheme
- Very high spatial regularity: the pattern repeats every 10–20 stitches
- 14-count Aida or 16-count (geometric designs work well on 16ct)
- No fractionals, no backstitching, no blends
- Moderate stitch count (3,000–8,000) depending on border length

**Expected Tier:** Beginner

**Why this tier:**
- The repeating structure makes counting errors self-correcting (the stitcher can see when the repeat breaks)
- 2–4 colours is the lowest practical palette — no thread management cognitive load
- Geometric shapes have no "confetti" — solid regions only

**Key discriminating factor:**
- Easier → single colour on white background (technically trivial; pattern is pure counting exercise)
- Harder → shrink to 28-count or finer fabric (geometric patterns on linen in a fine count become eye-strain exercises and tip to Intermediate)

---

#### B-4: Small Ornament / Gift Tag

**Description:** A tiny decorative project — a Christmas ornament, bookmark, or gift-tag insert. Sold in single-project "starter kits" specifically targeted at first-time stitchers.

**Characteristics:**
- 3–5 colours maximum
- Tiny footprint: 25×25 to 40×40 cells (600–1,600 stitches)
- 14-count Aida
- No specialty techniques whatsoever
- Simple iconic shapes (star, heart, snowflake, Christmas tree)

**Expected Tier:** Beginner

**Why this tier:**
- So small it can be completed in 1–3 hours
- The stitch count is low enough that even slow beginners can finish it in a single sitting, providing the psychological "first finish"
- Palette is minimal: the stitcher can likely hold all colours in one hand

**Key discriminating factor:**
- Easier → there is no easier tier; this is as simple as a counted pattern can be while remaining a counted pattern (not free-form embroidery)
- Harder → increase to 25+ colours with fractional star-point details (immediately moves to Intermediate by adding technique requirements and palette management)

---

### INTERMEDIATE TIER

---

#### I-1: Seasonal Landscape (Mountains / Sky / Trees)

**Description:** A scenic landscape with layered sky, mountain ridgeline, tree silhouettes, and foreground ground. A staple of Dimensions™ and DMC seasonal kit ranges.

**Characteristics:**
- 12–22 colours: several sky blues/pinks, multiple greens, earth tones, possibly snow whites
- The sky usually has 3–6 shades creating a "gradient" effect — achieved by row-mixing colours rather than true blends
- 14-count Aida (sometimes 18-count for detailed variants)
- Minimal backstitching (tree branch outlines only, optional)
- Moderate stitch count: 8,000–20,000
- Low–moderate confetti: sky gradient rows may have some scatter, but tree blocks are solid

**Expected Tier:** Intermediate

**Why this tier:**
- Colour count (12–22) exceeds the beginner palette management comfort zone
- Sky rows mix colours that look similar on the bobbin — risk of placing the wrong shade
- Moderate stitch count means the project spans multiple sittings, introducing the challenge of "finding your place" on re-entry
- Not quite Advanced because: confetti is low (mostly block stitching), no blends, no fractionals

**Key discriminating factor:**
- Easier → reduce to 8 colours with clearly distinct hues (tips to Beginner)
- Harder → increase sky shading to 30+ subtle colour changes with confetti scatter in the cloud areas (tips to Advanced)

---

#### I-2: Botanical Illustration

**Description:** A single flower or plant stem with detailed outlines, leaves, and petals. Botanical cross-stitch has its own dedicated community and is characterised by the importance of backstitching for leaf veins and petal outlines.

**Characteristics:**
- 15–25 colours: several greens (leaf shading), several pinks/reds/purples (petal gradients), stem brown, background white/cream
- Moderate–high backstitch density: leaf veins and petal edges require 50–200 backstitch segments
- 14-count or 18-count Aida/linen
- Some fractional stitches at petal tips (3–8 in a typical design)
- Stitch count: 6,000–15,000

**Expected Tier:** Intermediate

**Why this tier:**
- Backstitching adds a new technique that beginners have not mastered — the stitcher must switch needle, work in a different motion, navigate fine detail
- Colour count is moderate — similar shades (leaf greens, petal tints) require attention
- Fractionals introduce a new technique complication but are limited in number

**Key discriminating factor:**
- Easier → remove backstitching (tips to Beginner — remaining complexity is just moderate colour count)
- Harder → increase to a full bouquet with 30+ colours and dense confetti at flower centres where multiple colours meet (tips to Advanced)

---

#### I-3: Floral Wreath

**Description:** A circular or oval arrangement of flowers and foliage. Popular as decorative pieces and wedding gifts. The wreath format means many different flower types share the same canvas.

**Characteristics:**
- 18–30 colours: multiple flower types (rose, daisy, lavender) each have 2–4 shades, plus foliage greens
- Moderate confetti: flower detail areas have some scatter, but wreath arms are largely block-stitching
- 1–3 blended pairs (e.g., subtle petal highlighting)
- Moderate backstitch for stem lines (30–80 segments)
- 14-count Aida or 28-count evenweave (depends on publisher)
- Stitch count: 10,000–25,000

**Expected Tier:** Intermediate

**Why this tier:**
- Colour count crosses the 20+ threshold where palette management becomes a genuine organizational challenge
- Blends introduce a new technique (two threads on the needle simultaneously) even if only a few colours use it
- Moderate confetti in flower detail areas slows progress in those sections
- Large enough that it takes multiple weeks to complete, requiring motivation management

**Key discriminating factor:**
- Easier → remove blends and reduce to 12 colours (tips to Beginner/low-Intermediate)
- Harder → increase to 40+ colours with many near-identical shade pairs and high confetti at every flower junction (tips to Advanced)

---

#### I-4: Small Portrait / Face Close-Up

**Description:** A simplified portrait or face, typically a pet or a stylised human. Not photorealistic — more illustrative, with clearly defined colour regions for skin, hair, eyes.

**Characteristics:**
- 15–25 colours: 4–8 skin tone shades, 3–5 hair shades, eye and clothing colours
- Skin tone area has moderate confetti (individual pixels of highlight/shadow shades)
- 14-count Aida (18-count for more detailed versions)
- Some backstitching for facial features (eye outlines, lips) — 10–50 segments
- Stitch count: 8,000–20,000

**Expected Tier:** Intermediate

**Why this tier:**
- Skin tone shading introduces the first real confetti challenge: individual scattered shading stitches
- Multiple near-identical skin tone shades (the stitcher must distinguish between DMC 3774, 3779, 950, 407) — the first encounter with perceptually similar colours on the palette
- Backstitching for facial features is important (errors in eye outlines are very visible) and adds technique variety

**Key discriminating factor:**
- Easier → stylise the face with flat colour blocks and no shading (tips to Beginner)
- Harder → increase to full photorealistic portrait with 40+ skin tones and 60%+ confetti density in the face (tips to Expert — see E-1)

---

### ADVANCED TIER

---

#### A-1: Detailed Landscape with Sky Gradients

**Description:** A landscape with a detailed sky (sunset, dawn, twilight) where the sky itself forms the compositional centrepiece rather than the background. Cloud formations, colour washes, and horizon gradients.

**Characteristics:**
- 30–45 colours: 10–15 sky shades (purples, oranges, pinks, magentas), 8–12 foreground colours, 5–8 water/reflection colours
- High confetti in sky and water areas (cloud edges and water ripples are the primary confetti sources)
- `confettiScore_est`: 0.45–0.65
- 14-count or 18-count; 28-count for fine-detail versions
- Minimal backstitching except for horizon detail
- Stitch count: 20,000–50,000

**Expected Tier:** Advanced

**Why this tier:**
- Colour count (30–45) requires real organisational discipline — many near-identical sky shades
- Confetti in sky areas (0.45–0.65) means a substantial portion of stitches require individual thread management
- Size (20k–50k stitches) means weeks or months of stitching — motivation and re-entry difficulty both elevate
- Many similar colours for sky shades (perceptual ΔE between adjacent shades may be < 10, possibly < 5)

**Key discriminating factor:**
- Easier → replace the detailed sky with a solid flat-colour sky — immediate drop in confetti and similar-colour count (tips to Intermediate)
- Harder → make it photorealistic throughout including foreground foliage and water reflections (tips to Expert)

---

#### A-2: Large Realistic Animal Portrait

**Description:** A large detailed depiction of a single animal — wolf, horse, tiger, owl — emphasising realistic fur/feather texture achieved through many shades and confetti stitching.

**Characteristics:**
- 30–55 colours: multiple shades of the base coat colour, highlight and shadow shades, eye detail colours, background colours
- High confetti in fur/feather texture areas: individual stitches of highlight or shadow colours scattered throughout
- `confettiScore_est`: 0.50–0.70
- Some fractional stitches at fur tip detail (10–50 cells)
- Occasional backstitch for eye detail, whisker lines
- 14-count or 18-count
- Stitch count: 25,000–60,000

**Expected Tier:** Advanced

**Why this tier:**
- The fur/feather effect requires confetti — no amount of clever block-stitching can replicate the natural texture
- High confetti (0.50–0.70) means the majority of work involves individual thread cuts and re-threads
- Large palette with many near-identical shades (e.g., 8 shades of grey for a wolf) — perceptually similar colours throughout

**Key discriminating factor:**
- Easier → flatten the rendering to stylised illustration with visible colour blocks (drops to Intermediate because confetti is eliminated)
- Harder → increase to 70+ colours with full photorealism and fine-count fabric (tips to Expert)

---

#### A-3: Classic Cottage / Building Scene

**Description:** A detailed building scene — cottage, castle, house — featuring stone or brick textures, tiled roofs, window details, garden, and sky. The iconic "English country cottage" design. One of the most recognisable advanced kit archetypes.

**Characteristics:**
- 35–55 colours: stone/brick shading (5–10 similar grey/brown shades), roof tiles, window glass, garden flowers, sky
- Moderate–high confetti in stone/brick texture: the texture effect requires scattered similar-shade stitches
- `confettiScore_est`: 0.35–0.55
- Extensive backstitching: window frames, door edges, stone outline, garden fence — 200–600 backstitch segments
- Fractional stitches at roof angles and window corners
- 14-count or 18-count
- Stitch count: 30,000–65,000

**Expected Tier:** Advanced

**Why this tier:**
- Extensive backstitching is the primary differentiator from Intermediate — hundreds of backstitch segments require careful navigation and are time-consuming
- Fractional stitches at architectural angles (eaves, window arches) require technique precision
- High colour count with many similar stone/brick shades
- Large size (30k–65k stitches) adds duration/endurance difficulty

**Key discriminating factor:**
- Easier → remove all backstitching and fractionals (the remaining cross-stitching is just high-colour-count Intermediate work)
- Harder → scale to a full-scale Victorian manor with 70+ colours and extend the stone texture confetti throughout (approaches Expert)

---

#### A-4: Large Floral Centrepiece

**Description:** A large, densely-packed floral design — a vase of flowers, a garden scene, or a floral border filling the entire canvas. Characterised by many flower varieties sharing space, each with their own shading palettes.

**Characteristics:**
- 35–60 colours: each flower type has 3–5 shades; 8–15 greens for foliage
- Moderate confetti at flower junctions and in shaded petal areas
- `confettiScore_est`: 0.30–0.50
- Includes 2–6 blended colour pairs for subtle petal highlights
- Moderate backstitch for stem lines and petal outlines (100–250 segments)
- 14-count or 18-count (some luxury versions on 28-count)
- Metallic accent threads on 1–3 colours (stamens, dewdrops) — technique difficulty addition
- Stitch count: 30,000–70,000

**Expected Tier:** Advanced

**Why this tier:**
- Many similar greens (8–15 foliage shades) are among the hardest colour management challenges in all of cross-stitch
- Blends in petal highlights require technique (two threads simultaneously)
- Metallic accent threads add handling difficulty (cut short, tangles, different needle)
- Moderate confetti throughout creates persistent thread management overhead
- Large size demands multi-month project management

**Key discriminating factor:**
- Easier → remove the metallic threads, reduce to 20 colours, and eliminate blends (tips to Intermediate)
- Harder → increase the petal shading to 80+ colours with high confetti throughout (tips to Expert)

---

### EXPERT TIER

---

#### E-1: Hyperrealistic Human Portrait

**Description:** A full-face or bust photorealistic portrait converted from a photograph. The human face is the hardest single subject in cross-stitch because skin tones are perceived with extreme precision — the human visual system is highly tuned to detect off-model skin colours.

**Characteristics:**
- 50–80+ colours: 20–40 skin tone shades, 10–20 hair shades, eye/clothing/background colours
- Skin tone palette features many colours with ΔE < 5 between adjacent entries — the hardest palette management task in cross-stitch
- Very high confetti throughout face area: individual pixels of highlight and shadow
- `confettiScore_est`: 0.70–0.90
- Virtually no large solid blocks (even the forehead has multiple shading stitches)
- Possible fractional stitches (quarter, three-quarter) for fine detail at eye corners and lip curves
- Some backstitching for eye and lip outlines (20–100 segments), but main detail is cross-stitches
- 18-count or 28-count (fine count required to capture facial proportions at reasonable physical size)
- Stitch count: 30,000–80,000+

**Expected Tier:** Expert

**Why this tier:**
- Skin tone confusion is uniquely unforgiving: a misplaced skin shade is visible in a completed portrait in a way that a misplaced background shade is not
- Very high confetti (0.70–0.90) means virtually every stitch requires individual thread management
- Many perceptually similar colours (ΔE < 5 between adjacent shades) is the hardest palette navigation task
- Fine fabric count (18ct, 28ct) adds eyestrain and piercing difficulty
- Large stitch count at high confetti density creates enormous total time investment

**Key discriminating factor:**
- Easier → simplify to a pop-art style with posterised flat colour blocks, ~10 colours, no confetti (tips directly to Intermediate)
- Harder → full life-size (canvas 40cm × 50cm on 28-count) with 100+ colours — there is no "harder than Expert" tier in this system

---

#### E-2: Large-Format Map or Historical Sampler

**Description:** A large counted sampler or historical reproduction map — the kind sold in kits based on 18th or 19th-century embroidered maps or elaborate samplers with alphabets, motifs, borders, and commemorative text.

**Characteristics:**
- 25–45 colours (moderate palette count, but the difficulty driver is scale and technique variety)
- Many specialty stitch types: cross-stitch, half-stitch, quarter-stitch, long-arm cross stitch, running stitch, Algerian eye, four-sided stitch, satin stitch, woven wheel
- Extensive backstitching for place names, county boundaries, decorative lettering: 500–2,000+ backstitch segments
- Very large stitch count: 80,000–200,000+ stitches
- 28-count or 32-count linen (historically accurate fabric) — fine count adds piercing and eyestrain difficulty
- Low–moderate confetti (`confettiScore_est`: 0.10–0.30) — difficulty comes from scale and technique variety, not pixel-level scatter

**Expected Tier:** Expert

**Why this tier:**
- Scale alone (100k–200k stitches) puts this in a category most stitchers will spend a year or more on
- Specialty stitch variety requires the stitcher to switch technique frequently — each specialty stitch has its own needle, motion, and tension requirement
- Fine linen fabric on large canvas is difficult to manage in a frame
- The extensive backstitched text requires precise positioning and constant chart consultation

**Key discriminating factor:**
- Easier → resize to a quarter of the stitch count and remove specialty stitches (tips to Advanced)
- Harder → add gold thread metallic for coastlines and borders — adds handling difficulty on top of an already Expert-level project

---

#### E-3: High-Confetti Photorealistic Landscape

**Description:** A photographic landscape (forest path, seascape, field of flowers) converted to cross-stitch with near-photographic colour fidelity. Unlike A-1 (which has a specific centrepiece), this pattern has extreme confetti *everywhere* — every area of the canvas is equally scattered.

**Characteristics:**
- 50–80 colours
- `confettiScore_est`: 0.80–0.95 — essentially no large solid blocks anywhere on the canvas; every 2–3 cells changes colour
- `changeRateScore_est`: 0.85–0.95 — colour change rate per row approaches 1.0
- 18-count or 28-count (required to capture photographic detail at reasonable physical size)
- No large block sections providing "rest" — stitcher cannot relax into a rhythm anywhere on the canvas
- Stitch count: 40,000–100,000+

**Expected Tier:** Expert

**Why this tier:**
- The combination of extreme confetti (0.80–0.95), very high colour count, and fine fabric count creates an impossible-to-resolve triple difficulty stack
- There are no "easy sections" to provide motivational relief — the entire canvas is equally demanding
- Even experienced stitchers working this kind of pattern typically require parking technique (moving between multiple in-progress needles) to manage thread waste, adding a layer of technique complexity
- Fine fabric count on a large canvas (physical size: 30–50cm on 28-count) creates eye fatigue and frame-management challenges

**Key discriminating factor:**
- Easier → apply a posterisation filter during generation to merge similar colours into large blocks (reduces confetti dramatically — tips to Advanced)
- Harder → there is no harder tier, but increasing the physical size (go from 18-count to 32-count) could be argued as increasing the Expert difficulty ceiling

---

## 3. Calibration Data Points Table

The following table provides specific numeric estimates for each archetype. These are the values the implementation agent should use to construct synthetic test profiles in `tests/difficultyCalibration.test.js`.

Notes on the columns:
- `confettiScore_est` and `changeRateScore_est` are 0–1 floating-point estimates; the implementation will compute these from actual pattern data. These estimates should be cross-checked against the formulas proposed in report 02.
- `bsLines_est` is total backstitch segment count (one segment = one line in `bsLines` array).
- `halfStitches_est` is count of keys in the `halfStitches` object.
- All ranges are `[min, mid, max]`; the test suite should use the `mid` value for nominal tests and the `min`/`max` values for boundary tests.

| ID | Name | `totalStitchable` | `palLen` | `blendCount` | `fabricCt` | `confettiScore_est` | `changeRateScore_est` | `bsLines_est` | `halfStitches_est` | `expectedTier` |
|----|------|-------------------|----------|--------------|------------|--------------------|-----------------------|---------------|--------------------|----------------|
| B-1 | Alphabet Sampler | 2,000–4,500–6,000 | 3–4–5 | 0 | 14 | 0.02–0.04–0.06 | 0.03–0.05–0.08 | 0 | 0 | Beginner |
| B-2 | Small Animal Silhouette | 1,500–2,800–4,000 | 4–6–8 | 0 | 14 | 0.02–0.04–0.07 | 0.03–0.05–0.09 | 0–2–5 | 0 | Beginner |
| B-3 | Geometric Border | 3,000–5,500–8,000 | 2–3–4 | 0 | 14 | 0.00–0.02–0.04 | 0.02–0.04–0.07 | 0 | 0 | Beginner |
| B-4 | Small Ornament | 600–1,100–1,600 | 3–4–5 | 0 | 14 | 0.01–0.03–0.05 | 0.02–0.04–0.06 | 0 | 0 | Beginner |
| I-1 | Seasonal Landscape | 8,000–13,000–20,000 | 12–17–22 | 0–0–2 | 14 | 0.06–0.12–0.20 | 0.10–0.18–0.28 | 0–15–40 | 0 | Intermediate |
| I-2 | Botanical Illustration | 6,000–10,500–15,000 | 15–20–25 | 0–0–2 | 14 | 0.05–0.10–0.18 | 0.08–0.15–0.25 | 50–120–200 | 3–8–15 | Intermediate |
| I-3 | Floral Wreath | 10,000–17,000–25,000 | 18–24–30 | 1–2–3 | 14 | 0.10–0.20–0.32 | 0.12–0.22–0.35 | 30–55–80 | 0–2–5 | Intermediate |
| I-4 | Small Portrait | 8,000–14,000–20,000 | 15–20–25 | 0–1–2 | 14 | 0.20–0.32–0.45 | 0.18–0.28–0.38 | 10–30–50 | 0–2–5 | Intermediate |
| A-1 | Detailed Landscape | 20,000–35,000–50,000 | 30–38–45 | 0–2–5 | 14 | 0.35–0.52–0.65 | 0.30–0.48–0.62 | 0–20–60 | 0–5–15 | Advanced |
| A-2 | Large Animal Portrait | 25,000–42,000–60,000 | 30–42–55 | 0–3–6 | 14 | 0.45–0.60–0.72 | 0.40–0.55–0.68 | 5–20–40 | 10–30–50 | Advanced |
| A-3 | Cottage / Building | 30,000–47,000–65,000 | 35–44–55 | 1–3–5 | 14 | 0.30–0.44–0.55 | 0.28–0.42–0.55 | 200–380–600 | 15–35–70 | Advanced |
| A-4 | Large Floral Centrepiece | 30,000–50,000–70,000 | 35–46–60 | 2–4–6 | 14 | 0.28–0.40–0.50 | 0.25–0.38–0.50 | 100–175–250 | 5–15–30 | Advanced |
| E-1 | Hyperrealistic Portrait | 30,000–55,000–80,000 | 50–65–80 | 3–8–15 | 18 | 0.65–0.80–0.90 | 0.60–0.75–0.88 | 20–55–100 | 20–50–100 | Expert |
| E-2 | Map / Historical Sampler | 80,000–130,000–200,000 | 25–34–45 | 0–2–4 | 28 | 0.08–0.18–0.30 | 0.10–0.20–0.32 | 500–1,100–2,000 | 50–200–500 | Expert |
| E-3 | High-Confetti Landscape | 40,000–70,000–100,000 | 50–65–80 | 5–10–18 | 18 | 0.78–0.87–0.95 | 0.80–0.88–0.95 | 0–10–30 | 0–10–30 | Expert |

### 3.1 Interpreting the Table for Test Construction

For each archetype, the implementation agent should create **three mock profiles** using the min, mid, and max values:
- **Nominal test** (mid values): must output exactly the `expectedTier`.
- **Min boundary test** (min values): must output `expectedTier` or the adjacent easier tier.
- **Max boundary test** (max values): must output `expectedTier` or the adjacent harder tier.

The "exactly the expected tier" requirement applies only to the `mid` (nominal) profile. Boundary tests may tolerate ±1 tier. This prevents edge-case parameter sensitivity from causing false test failures while still catching large miscalibrations.

### 3.2 Profiles That Test Specific Factor Interactions

Two additional synthetic profiles are needed to test that the algorithm handles unusual factor combinations correctly (see §9):

| ID | Name | Description | `totalStitchable` | `palLen` | `confettiScore_est` | `bsLines_est` | `expectedTier` | Notes |
|----|------|-------------|-------------------|----------|---------------------|---------------|----------------|-------|
| X-1 | Block-Heavy High Palette | Many colours but all in solid blocks | 25,000 | 48 | 0.03 | 20 | Advanced | Tests that high palLen alone doesn't inflate to Expert |
| X-2 | High-Confetti Small Palette | Few colours but extreme scatter | 15,000 | 8 | 0.85 | 5 | Advanced | Tests that confetti difficulty registers even with low palLen |

---

## 4. Validation Methodology

### 4.1 The Validation Process

```
Step 1 — Build mock profiles
  → Construct 15 archetype objects + 2 edge-case objects
  → Each object must have all fields that the new calcDifficulty() function accepts
  → Use the mid values from §3 for nominal tests

Step 2 — Run the calculator
  → Call calcDifficulty(profile) for each mock profile
  → Capture {label, stars, score, subscores} output

Step 3 — Check tier match
  → Assert output.label === archetype.expectedTier (nominal profiles)
  → Assert |output.stars - archetype.expectedStars| <= 1 (boundary profiles)

Step 4 — Flag mismatches
  → Any nominal profile where the tier is wrong by 1: log as WARNING, flag factor weights for review
  → Any nominal profile where the tier is wrong by >1: FAIL — the formula has a structural error

Step 5 — Sensitivity analysis for each failing profile
  → Run the failing profile 10 times, each time zeroing out one factor contribution
  → The factor whose removal most improves the score alignment is the over-weighted factor
  → The factor whose zeroing most worsens the score is the under-weighted factor relative to the problem
```

### 4.2 Definition of "Passing" Calibration

**Initial release threshold:**
- **100% of archetypes** (nominal profiles) within ±1 tier of expected.
- **At least 12 of 15 archetypes** (nominal profiles) exactly matching the expected tier.
- **0 archetypes** more than 1 tier off.
- **Both edge-case profiles** (X-1, X-2) must be within ±1 tier of expected.

**Justification:** The ±1 tolerance on the "12 of 15" standard acknowledges that the Intermediate/Advanced boundary is the most contested in the community (see §5). The zero-tolerance rule on >1-tier errors prevents catastrophic misclassifications (labelling an Expert pattern as Beginner, or vice versa).

**Stretch goal for v1.1:**
- 15 of 15 nominal profiles exactly match.
- All boundary min/max profiles within ±1 tier.

### 4.3 Sensitivity Analysis Protocol

For each parameter in the formula (e.g., `confettiWeight`, `palLenThresholds`, `bsWeight`, `sizeWeight`), the test suite should include a sensitivity sweep:

```
For each archetype A that is near a tier boundary (within 10% of the threshold):
  For each parameter P:
    Compute score with P * 1.2
    Compute score with P * 0.8
    Record whether the tier changes
    
Report: "Parameter P can shift archetype A from Tier X to Tier Y with a 20% change"
```

This identifies which boundaries are fragile and which are robust. A robust boundary (no tier change under ±20% parameter perturbation) needs no special attention. A fragile boundary (tier change under ±5% perturbation) is a risk that should trigger additional calibration review.

### 4.4 Visual Calibration Aid

The implementation agent should produce a simple calibration scatter plot as part of the test output:

```
Tier Score vs Expected Tier:
  
Expert    ·        ·    E-2·  E-3·  E-1·
Advanced  ·   A-4·  A-3·  A-2·  A-1·
Intermediate I-4· I-3· I-2· I-1·
Beginner  B-4·  B-3·  B-2·  B-1·
          ├───────────────────────────→
          0    0.2   0.4   0.6   0.8   1.0
                    normalised score
```

If any archetype dot appears in the wrong row, the formula needs weight adjustment. This is not a Jest assertion — it is diagnostic output to aid weight tuning.

---

## 5. Real-World Community References

### 5.1 Dimensions™ Difficulty Ratings

Dimensions™ kits use a five-tier system printed on kit packaging:

| Dimensions™ Label | Approximate Mapping | Criteria |
|---|---|---|
| **Easy** | Beginner | Very few colours (3–6), large areas, simple shapes, full cross-stitches only |
| **Easy Plus** | Beginner / low-Intermediate | 6–12 colours, some detail work, still predominantly block stitching |
| **Intermediate** | Intermediate | 12–20 colours, some backstitching, moderate detail |
| **Complex** | Advanced | 20–35 colours, extensive backstitching, some fractionals, requires experience |
| **Advanced** | Expert | 35+ colours, fine fabric count, metallics, highly detailed, very high stitch count |

The Dimensions™ five-tier system maps reasonably onto this app's four-tier system, with "Easy" and "Easy Plus" both mapping to Beginner (this app's system does not have a "beginner plus" sub-tier). Dimensions™ explicitly mentions stitch count as a secondary factor — their "Easy" designs are typically also small (under 5,000 stitches).

**Key insight:** Dimensions™ places backstitching as the primary gating factor between "Easy" and "Intermediate". Their assessment matches the position in report 06: backstitch presence and density is a reliable tier-elevation indicator.

### 5.2 Vervaco Difficulty Ratings

Vervaco (a Belgian kit manufacturer with a strong European following) uses three tiers:

| Vervaco Label | Criteria |
|---|---|
| **Beginner** | Simple shapes, limited colours (≤8), full cross-stitches, pre-printed fabric (sometimes printed canvas, not counted grid) |
| **Intermediate** | 8–25 colours, some backstitch, counted design, moderate complexity |
| **Advanced** | 25+ colours, detailed designs, fine fabrics, technical stitches, portraits |

Vervaco's three-tier system is coarser than this app's four-tier system. Their "Advanced" spans what this app would call both "Advanced" and "Expert." The implication is that this app's separation of Advanced and Expert is finer-grained than the industry norm — which is valuable for helping stitchers at the top of the skill range, but means the app's "Expert" tier has less external validation available.

### 5.3 DMC Official Kit Difficulty

DMC's official kit range uses internal difficulty indicators (often displayed as a star count) but these are not consistently labelled on public materials. Based on community analysis:

- **1 star (Easy):** Small, simple, 5–8 colours, standard stitches only
- **2 stars (Moderate):** 10–20 colours, some detail work, some backstitching
- **3 stars (Advanced):** 20+ colours, complex charts, backstitching required, fine fabrics

DMC does not appear to use a four-tier or "Expert" distinction in their commercial kits. Their hardest kits (portrait conversions) are rated 3 stars, which suggests that even the very top of the commercial kit market is labelled "Advanced" not "Expert." This means the app's "Expert" tier may need careful positioning — it should represent patterns beyond what commercial kits sell, i.e., patterns generated by power users who are converting high-resolution photographs.

### 5.4 Etsy and Marketplace Sellers

Etsy pattern sellers have no standardised difficulty labelling. Practices vary widely:

- Many sellers use a colour count as a proxy: "Over 30 colours = Advanced."
- A minority mention confetti explicitly: "High confetti — for experienced stitchers only."
- Some use physical size as the primary indicator, which is not well-aligned with the community's understanding of difficulty.
- A few sophisticated sellers provide stitch counts, colour counts, and expected hours — the most useful combination.

Community discussions on Etsy pattern subreddits frequently cite frustration with sellers who label portraits as "Intermediate" when experienced stitchers consider them "Expert." This is the clearest evidence of inflation bias in marketplace ratings — sellers have commercial incentives to make their patterns seem accessible.

### 5.5 Cross-Stitch Forum Community Consensus

From r/CrossStitch, The Cross-Stitch Forum, and similar community sources, there is broad consensus on what constitutes "Expert" difficulty:

**Signs a pattern is Expert:**
1. Confetti covering more than 50% of the canvas (frequently cited threshold)
2. Skin tone shading in a realistic portrait (universally cited as uniquely hard)
3. More than 40–50 unique colours, especially with many near-identical shades
4. Working on 28-count or finer fabric (25-count, 32-count, 40-count)
5. Multiple specialty stitch types required in the same project
6. Project estimated at more than 200–300 hours

**Signs a pattern is Beginner:**
1. Under 10 colours
2. No backstitching
3. All large blocks of colour
4. Under 5,000 stitches
5. Available as a "learn to cross-stitch" kit

**The hardest community argument:** the Intermediate/Advanced boundary. There is genuine community disagreement about where 20-colour moderate-confetti patterns land. Some experienced stitchers find them "definitely Intermediate," while others (particularly those who came to cross-stitch from other needlework) rate them as "Advanced." This is the most contested tier boundary and explains why the calibration test tolerance allows ±1 tier for boundary profiles.

---

## 6. Proposed Calibration Test File Structure

The following is a structural proposal for `tests/difficultyCalibration.test.js`. This is not a complete implementation — it is the scaffolding and data structure for the implementation agent to fill in.

```javascript
/**
 * tests/difficultyCalibration.test.js
 *
 * Calibration test suite for the cross-stitch pattern difficulty calculator.
 *
 * Each archetype mock profile represents a community-consensus cross-stitch
 * pattern category. The test checks that calcDifficulty (or its successor)
 * assigns the expected tier to each archetype.
 *
 * Tolerance:
 *   - Nominal profiles (mid values): must match expectedTier exactly.
 *   - Boundary profiles (min/max values): may be within ±1 tier.
 *   - No profile may be more than 1 tier off.
 *
 * See reports/difficulty/08_CALIBRATION.md for full archetype definitions,
 * factor estimates, and validation methodology.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Test data — one object per archetype
// Each profile mirrors the fields that calcDifficulty() accepts.
// ─────────────────────────────────────────────────────────────────────────────

const ARCHETYPES = [
  // ── BEGINNER ────────────────────────────────────────────────────────────────
  {
    id: 'B-1',
    name: 'Alphabet Sampler',
    profile: {
      totalStitchable: 4500,
      palLen: 4,
      blendCount: 0,
      fabricCt: 14,
      confettiScore: 0.04,      // derived — very low, all solid blocks
      changeRateScore: 0.05,    // derived
      bsLines: [],              // length = 0
      halfStitchCount: 0,
    },
    expectedTier: 'Beginner',
  },
  {
    id: 'B-2',
    name: 'Small Animal Silhouette',
    profile: {
      totalStitchable: 2800,
      palLen: 6,
      blendCount: 0,
      fabricCt: 14,
      confettiScore: 0.04,
      changeRateScore: 0.05,
      bsLines: new Array(2),    // length = 2
      halfStitchCount: 0,
    },
    expectedTier: 'Beginner',
  },
  // ... B-3, B-4 ...

  // ── INTERMEDIATE ─────────────────────────────────────────────────────────────
  {
    id: 'I-1',
    name: 'Seasonal Landscape',
    profile: {
      totalStitchable: 13000,
      palLen: 17,
      blendCount: 0,
      fabricCt: 14,
      confettiScore: 0.12,
      changeRateScore: 0.18,
      bsLines: new Array(15),
      halfStitchCount: 0,
    },
    expectedTier: 'Intermediate',
  },
  // ... I-2, I-3, I-4 ...

  // ── ADVANCED ─────────────────────────────────────────────────────────────────
  {
    id: 'A-1',
    name: 'Detailed Landscape',
    profile: {
      totalStitchable: 35000,
      palLen: 38,
      blendCount: 2,
      fabricCt: 14,
      confettiScore: 0.52,
      changeRateScore: 0.48,
      bsLines: new Array(20),
      halfStitchCount: 5,
    },
    expectedTier: 'Advanced',
  },
  // ... A-2, A-3, A-4 ...

  // ── EXPERT ───────────────────────────────────────────────────────────────────
  {
    id: 'E-1',
    name: 'Hyperrealistic Portrait',
    profile: {
      totalStitchable: 55000,
      palLen: 65,
      blendCount: 8,
      fabricCt: 18,
      confettiScore: 0.80,
      changeRateScore: 0.75,
      bsLines: new Array(55),
      halfStitchCount: 50,
    },
    expectedTier: 'Expert',
  },
  // ... E-2, E-3 ...

  // ── EDGE CASES ───────────────────────────────────────────────────────────────
  {
    id: 'X-1',
    name: 'Block-Heavy High Palette',
    // Many colours but all in solid blocks — must not inflate to Expert
    profile: {
      totalStitchable: 25000,
      palLen: 48,
      blendCount: 0,
      fabricCt: 14,
      confettiScore: 0.03,       // essentially zero confetti
      changeRateScore: 0.08,
      bsLines: new Array(20),
      halfStitchCount: 0,
    },
    expectedTier: 'Advanced',
  },
  {
    id: 'X-2',
    name: 'High-Confetti Small Palette',
    // Few colours but extreme scatter — must register as hard despite low palLen
    profile: {
      totalStitchable: 15000,
      palLen: 8,
      blendCount: 0,
      fabricCt: 14,
      confettiScore: 0.85,       // extreme confetti
      changeRateScore: 0.88,
      bsLines: new Array(5),
      halfStitchCount: 0,
    },
    expectedTier: 'Advanced',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tier ordering — needed for ±1 tolerance checks
// ─────────────────────────────────────────────────────────────────────────────
const TIER_ORDER = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
function tierDistance(a, b) {
  return Math.abs(TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b));
}

// ─────────────────────────────────────────────────────────────────────────────
// Load calcDifficulty from helpers.js
// (Pattern: read raw JS via fs.readFileSync and eval — same as other tests)
// ─────────────────────────────────────────────────────────────────────────────
// const src = require('fs').readFileSync('./helpers.js', 'utf8');
// eval(src);  // exposes calcDifficulty as a global

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Difficulty Calibration — Archetype Tier Tests', () => {
  // Nominal tier test for every archetype
  test.each(ARCHETYPES)(
    '$id ($name) should score as $expectedTier',
    ({ id, profile, expectedTier }) => {
      const result = calcDifficulty(profile);
      expect(result.label).toBe(expectedTier);
    }
  );

  // Structural rule: no archetype more than 1 tier off
  // (This is a safety net that catches compound failures)
  test.each(ARCHETYPES)(
    '$id ($name) must not deviate more than 1 tier from expected',
    ({ id, profile, expectedTier }) => {
      const result = calcDifficulty(profile);
      const distance = tierDistance(result.label, expectedTier);
      expect(distance).toBeLessThanOrEqual(1);
    }
  );

  // At-least-12-of-15 passing test (reported as a count, not individual failures)
  test('at least 12 of 15 archetypes score exactly correct', () => {
    const nominalArchetypes = ARCHETYPES.filter(a => !a.id.startsWith('X'));
    const exactMatches = nominalArchetypes.filter(({ profile, expectedTier }) =>
      calcDifficulty(profile).label === expectedTier
    );
    expect(exactMatches.length).toBeGreaterThanOrEqual(12);
  });

  // Edge-case structural tests
  test('X-1: high palette count with zero confetti does not reach Expert', () => {
    const result = calcDifficulty(ARCHETYPES.find(a => a.id === 'X-1').profile);
    expect(TIER_ORDER.indexOf(result.label)).toBeLessThanOrEqual(
      TIER_ORDER.indexOf('Advanced')
    );
  });

  test('X-2: high confetti with low palette count reaches at least Advanced', () => {
    const result = calcDifficulty(ARCHETYPES.find(a => a.id === 'X-2').profile);
    expect(TIER_ORDER.indexOf(result.label)).toBeGreaterThanOrEqual(
      TIER_ORDER.indexOf('Advanced')
    );
  });
});
```

### 6.1 Notes on the Proposed Structure

**`profile` shape:** The mock profile object's fields will need to match whatever interface the new `calcDifficulty()` accepts. If the redesigned function accepts a full pattern object (not just derived metrics), the test will need to build synthetic `pattern` arrays or pre-compute derived scores and pass them directly. Pre-computed scores (confettiScore, changeRateScore) passed as floats is the recommended approach to avoid making the calibration test depend on the analysis worker's implementation.

**`test.each` pattern:** Using Jest's `test.each` with the archetype array produces one named test per archetype, making failures easy to identify in CI output.

**Separation from main suite:** Calibration tests should be tagged with a Jest `--testPathPattern` filter or placed in a `calibration/` subdirectory so they can be run independently. They are slower than unit tests (more complex mock data) but still fast enough (< 1 second total) to include in the main suite's `--runInBand` run.

---

## 7. Feedback Loop for Future Refinement

### 7.1 In-App Post-Completion Rating

When the Stitch Tracker marks a project as complete (100% of stitches done), the app could prompt:

> "How difficult did you find this pattern?"  
> [ Very Easy ] [ Easy ] [ About Right ] [ Hard ] [ Very Hard ]

This is a one-tap interaction, appropriate immediately after the satisfying completion moment. The response maps to a signed offset from the calculated tier:

| User response | Interpretation |
|---|---|
| Very Easy | Score was ≥2 tiers too high |
| Easy | Score was 1 tier too high |
| About Right | Score was correct |
| Hard | Score was 1 tier too low |
| Very Hard | Score was ≥2 tiers too low |

**Data storage:** Append a `{ ratedDifficulty, calculatedDifficulty, timestamp }` record to the `stats_summaries` store or a new `difficulty_feedback` store in `CrossStitchDB`.

**Privacy note:** This data is stored locally in IndexedDB and never transmitted. It cannot be aggregated across users without an explicit cloud-sync feature.

### 7.2 Local Weight Adjustment

With even 5–10 completed projects with ratings, the app could compute:
- **Mean offset** = average (calculatedTierIndex − ratedTierIndex) across all rated projects
- If mean offset > 0.5: the formula is inflating scores; reduce all tier thresholds by one step
- If mean offset < -0.5: the formula is deflating scores; increase all tier thresholds

This is a simple personal recalibration — it shifts the tier boundaries for that individual user without changing the formula weights. It's appropriate as a "v1.5" feature after the base calibration is stable.

### 7.3 Community Aggregation (Speculative)

If the app were to gain community features (pattern sharing, a public pattern library), user difficulty ratings on shared patterns could be aggregated:

- **Bayesian average** across multiple user ratings per pattern
- Patterns with > 10 ratings and a mean offset of > ±0.5 tiers from the calculated score would flag the formula for review
- The pattern profiles that generate the most disagreement (high variance in user ratings) likely expose inter-individual difficulty factors (see §8)

This is speculative because the app is currently fully client-side with no backend. It is mentioned here so that if a backend is ever added, the difficulty calibration system has a clear path to community validation.

### 7.4 A/B Testing Framework

If the app adds a metrics backend, a rigorous calibration improvement path would be:
- Deploy two formula variants (A and B) to different user segments
- Compare the distribution of user "about right" responses for each
- The variant with more "about right" responses and fewer "too easy/too hard" responses is the better-calibrated formula

This is industry-standard practice for subjective quality metrics (Netflix star rating system, Spotify recommendation confidence) and represents the eventual gold standard for difficulty calibration in this app.

---

## 8. Technical Difficulty vs. Perceived Difficulty

The algorithm can compute objective structural metrics from pattern data. The following factors create a gap between that objective score and what a real stitcher experiences.

### 8.1 Parking Technique

**What it is:** An advanced stitching method where a stitcher works multiple threads simultaneously, "parking" each thread at the position where it will next be needed. Instead of cutting and re-threading for each isolated confetti stitch, the thread is simply parked on the front of the fabric and returned to when the work reaches that region.

**Effect on difficulty:** Parking effectively eliminates most of the overhead of confetti stitching. An Expert-level portrait that would require thousands of individual thread cuts and re-threads becomes manageable because the stitcher never cuts the thread between uses.

**What the algorithm can't know:** Whether the stitcher is a parking practitioner. The same pattern could be:
- Expert difficulty for a stitcher who cuts and re-threads every confetti stitch
- Advanced (maybe Intermediate) difficulty for an experienced parker

**Implication for calibration:** The archetype tier assignments in §2 are calibrated for a "non-parking" stitcher (since most beginners and many Intermediate stitchers do not park). Parking is an Advanced/Expert technique that the stitcher-relative adjustment (Report 07) could account for: if the user's profile indicates parking experience, the confetti contribution could be weighted lower.

### 8.2 Pattern Format Preferences

Cross-stitch charts are printed in two formats:
- **Colour charts:** each cell shows the actual thread colour as a coloured square
- **Symbol charts:** each cell shows a letter or symbol; a legend maps symbols to thread colours

Colour charts are easier for most beginners (the colour chart looks like the finished work), but symbol charts are sometimes preferred for fine-count work (colour printing at 18-count can make very small squares hard to read; a printed black symbol is clearer).

The difficulty of *reading* the chart is a real factor that the algorithm ignores. Patterns that rely on symbol charts (more common in European kits) have an additional layer of chart-reading overhead that is real for many stitchers.

### 8.3 Motivation and Repetition Factors

**Meditative vs. tedious repetition:** A 30,000-stitch monochrome sampler is objectively easy (score: low Intermediate) but subjectively hard to complete for most stitchers because of motivational fatigue. Conversely, a highly confetti-dense portrait is objectively Expert but many experienced stitchers find it engaging precisely because it is challenging — high subjective motivation.

The algorithm measures structural complexity, not emotional engagement. These diverge most strongly for:
- Very large, low-complexity patterns (overestimated by completion-rate-adjusted difficulty, underestimated by structural difficulty)
- Challenging patterns that happen to be personally meaningful (underestimated by structural difficulty due to motivation overcoming apparent barriers)

### 8.4 Error Recovery

**What it means:** When a stitcher makes a misplacement error, removing it (frogging) and re-stitching is a real difficulty cost. Experienced stitchers frog confidently and quickly; beginners find it distressing and sometimes abandon a project after a serious misplacement.

**Algorithm implication:** The algorithm assigns difficulty based on the initial stitching challenge. It cannot measure the psychic cost of error recovery. This particularly affects confetti-dense patterns (where misplacements are common) and fine-fabric-count patterns (where removing stitches risks damaging the fabric).

### 8.5 Physical Factors

Several physical factors are real difficulty drivers that are entirely outside the algorithm's scope:

| Factor | Effect | Who is affected |
|---|---|---|
| Hand/arm fatigue | Large canvases on inflexible frames cause wrist and shoulder strain over long sessions | Everyone for very large projects |
| Visual acuity | Fine counts (28-count, 32-count) require good close-vision or magnification | Stitchers over 40 are significantly affected |
| Thread tangling | Long working sessions with many colours increase tangle probability | Higher palette counts; silk and metallic threads |
| Lighting quality | Working under poor lighting makes colour matching and confetti navigation harder | Home stitchers without daylight bulbs |
| Fabric handling | Very large canvases must be rolled and re-framed; distortion is possible | Any project over ~40cm × 40cm on a standard scroll frame |

None of these can be computed from pattern data. They are documented here so the implementation agent knows to position the difficulty score as "an estimate of the structural and technical challenge of the pattern, independent of individual physical conditions."

### 8.6 Summary: What the Score Should Claim to Measure

The difficulty score should be described in the UI as:

> "Pattern difficulty: an estimate of the structural complexity of this pattern, based on colour count, confetti density, size, technique requirements, and fabric count. Individual experience will vary."

This framing:
- Claims accuracy for what can be measured
- Acknowledges the gap with perceived difficulty
- Does not promise to predict the stitcher's actual experience

---

## 9. Minimum Viable Calibration Set

For an implementation agent working under time pressure, the full 15-archetype suite is the target, but the following **minimum 8-profile set** provides the most coverage per test written.

### 9.1 The Core 8

These profiles are chosen to:
- Place at least one clear anchor in each tier
- Test the two most important factor interactions (confetti vs. palette count)
- Include the two edge cases

| Priority | ID | Justification |
|---|---|---|
| 1 | B-1 (Alphabet Sampler) | Clear lower bound — everything about it is minimally complex |
| 2 | E-1 (Hyperrealistic Portrait) | Clear upper bound — everything about it is maximally complex |
| 3 | I-3 (Floral Wreath) | Middle of Intermediate — moderate on all factors simultaneously |
| 4 | A-2 (Large Animal Portrait) | Middle of Advanced — high confetti is the defining driver |
| 5 | X-1 (Block-Heavy High Palette) | Edge case: must test that palette alone doesn't inflate to Expert |
| 6 | X-2 (High-Confetti Small Palette) | Edge case: must test that confetti difficulty registers with low palLen |
| 7 | E-2 (Map / Historical Sampler) | Expert via scale + technique variety (not confetti) — tests that large scale + high bsLines can reach Expert without extreme confetti |
| 8 | B-3 (Geometric Border) | Beginner via structure — tests that repetitive low-colour patterns are reliably Beginner |

### 9.2 First Expansion: 4 Additional Profiles

If time allows, add these four for tier boundary coverage:

| ID | Boundary it tests |
|---|---|
| I-1 (Seasonal Landscape) | Beginner → Intermediate boundary |
| A-1 (Detailed Landscape) | Intermediate → Advanced boundary |
| A-3 (Cottage Scene) | Advanced with high backstitch count |
| E-3 (High-Confetti Landscape) | Expert via pure confetti (no portrait-specific factors) |

### 9.3 Deceptive Profile Principle

The X-1 "Block-Heavy High Palette" profile is the most important non-obvious profile in the set. Many naive implementations heavily weight palette count and will over-score X-1. The test:

```
48 colours + near-zero confetti → must not score Expert
```

...is the single most useful test for catching an over-weighted palette factor. If the implementation passes all tier tests except X-1 (scores Expert instead of Advanced), the fix is clear: reduce the palette weight or add a "confetti relief" modifier that reduces the palette contribution when confetti is very low.

Similarly, X-2 catches the mirror failure mode — an implementation that ignores confetti will score X-2 as Beginner (8 colours, small pattern) when the extreme confetti should push it to Advanced.

---

## 10. Open Questions & TODOs

### Q1: How many test patterns are enough for initial calibration?

**Recommendation:** 8 minimum (see §9.1); 15 target (the full archetype set in §2). 8 patterns guarantees at least two anchors per tier; 15 patterns adds coverage of tier boundaries and factor interaction edge cases.

Adding more than 15 patterns has diminishing returns unless the additional patterns test specific factor combinations not covered by the existing set (e.g., a pattern that is Expert solely because of fine fabric count with otherwise low complexity — currently not covered because no archetype isolates that case).

### Q2: Should calibration tests run on every commit?

**Recommendation:** Yes, with the following caveats:

- The calibration tests should take < 500ms total (they are pure function calls on mock data, not full analysis-worker runs).
- They should not be in `--watch` mode (they are not the primary TDD feedback loop).
- They should be in the `--runInBand` standard test run.
- A clear comment in the test file should explain that a calibration failure requires human review of factor weights, not just a code fix.

The value of running them on every commit is catching accidental weight regressions — e.g., a change to the confetti formula that inadvertently makes the E-3 portrait score as Advanced. This is exactly the kind of silent regression that would slip through a unit test suite that only tests the formula's arithmetic correctness.

### Q3: Who validates the archetype tier assignments?

**Concern:** The tier assignments in §2 are based on community knowledge synthesised from cross-stitch forums, commercial kit literature, and general experience. The implementation developer cannot personally stitch all 15 patterns.

**Options:**

1. **Accept the research-based assignments** (recommended for v1.0): The archetypes in §2 are based on well-documented community consensus (Dimensions™ ratings, forum threads, commercial kit literature). They are unlikely to be wrong by more than ±1 tier for any pattern. The ±1 tolerance in the calibration test deliberately accommodates the known uncertainty at tier boundaries.

2. **Community review** (recommended for v1.5): Post the archetype table to r/CrossStitch or similar with a survey: "How would you rate each of these patterns?" Even 10–20 experienced responses would provide meaningful validation data.

3. **Commercial kit cross-reference**: Compare 3–5 of the archetypes against physical kit ratings from Dimensions™ or DMC. For example, a large-animal portrait kit (matching A-2 archetype parameters) rated "Complex" by Dimensions™ confirms that "Advanced" is the correct tier assignment.

### Q4: What happens when the algorithm changes?

When factor weights are updated (e.g., the confetti weight is tuned based on the feedback loop in §7), the calibration tests will either pass (the change was a safe improvement) or fail (the change miscalibrated some archetype). A failing calibration test should not be "fixed" by changing the expected tier — it should trigger a review of whether the weight change is actually correct.

The correct workflow:

```
1. Update factor weights in calcDifficulty().
2. Run calibration tests.
3. If a test fails:
   a. Check whether the new tier assignment for that archetype is defensible 
      by community standards.
   b. If yes: update the expectedTier in the test with a comment explaining why.
   c. If no: revert or adjust the weight change.
4. Document the weight change and the calibration outcome in a commit message.
```

### Q5: Should the calibration test also test the stitcher-relative layer (Report 07)?

**Not yet.** The stitcher-relative adjustment layer in Report 07 is personalised (it depends on user history data). Calibration of the objective layer must be validated independently of the personalisation layer. Once the objective layer is calibrated, a separate calibration test for the relative layer can be added using synthetic user profiles.

### Q6: Is the Expert tier too sparse commercially?

As noted in §5.3, commercial kits rarely label anything "Expert" — even difficult portrait kits are "Advanced." This means there are fewer real-world reference points for the Expert tier. The Expert calibration relies more heavily on community consensus (which is well-documented for the most extreme patterns) and less on commercial kit validation.

The implementation agent should be aware that the Expert tier is the least validated externally, and the tier boundary between Advanced and Expert should be set conservatively: a pattern should only reach Expert if it genuinely combines multiple high-difficulty factors (not just one extreme factor, unless it is truly off-the-chart in that dimension).

---

*End of Report 08 — Comparative Calibration*  
*Next: Report 09 should be a combined scoring formula proposal that integrates findings from reports 01–08.*
