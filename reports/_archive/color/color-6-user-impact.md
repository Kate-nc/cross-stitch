# Color Report 6 — User Impact Analysis

## How Stitchers Use Color in This App

To understand impact, we must understand the user workflows that depend on color accuracy.

### Workflow 1: Pattern Generation (Creator)
A user uploads a photo and the app converts it to a cross stitch pattern.

**Color accuracy touchpoints:**
1. The palette selection step — the user sees swatches of the proposed DMC colors
   and decides which to include or swap
2. The preview canvas — the pattern is rendered using the stored RGB values,
   representing what the finished piece will look like
3. The export step — the PDF includes color swatches next to thread numbers

**Impact of inaccuracy:**
- If the preview shows a color incorrectly, the user may approve a palette that
  doesn't match their artistic intent
- If swatch colors are wrong, users may swap colors unnecessarily (perceiving
  a "wrong" color when the thread code is correct)
- If the PDF export shows the wrong swatch, stitchers may take it to a shop and
  ask for the wrong thread

### Workflow 2: Stash Matching (Stash Adaptation)
The app compares user-owned threads against the pattern requirements and suggests
substitutes using the colour matching engine.

**Color accuracy touchpoints:**
1. Thread substitution — `findBest()` uses Euclidean LAB distance to find the
   closest owned thread to a missing required thread
2. The substitution is shown to the user as a swatch with the delta highlighted

**Impact of inaccuracy:**
- If thread A and thread B are stored with identical RGB values (blanc/B5200,
  02/318), the matching engine cannot distinguish them — it will pick whichever
  comes first alphabetically, which may be wrong
- If colors are systematically off by ΔE₀₀ 3–5 in particular hue regions (blues,
  reds), the matching engine's "nearest neighbor" calculation is working from
  inaccurate coordinates — it may recommend a substitution that is perceptually
  further away than it calculates

### Workflow 3: Thread Shopping
A user looks at the palette list in the app and takes it to a craft shop or
orders online.

**Color accuracy touchpoints:**
1. Swatch display in the materials list — user is relying on this as a visual
   reference
2. The thread number is authoritative — if they write down "DMC 666" they will
   get the right thread
3. But if they are shopping online, they may compare the app's swatch against
   the retailer's swatch image, and if these differ significantly they may second-guess
   themselves or purchase the wrong thread

### Workflow 4: Colour Picker / Palette Building
A user manually adds colors to their pattern by picking from the DMC palette.

**Color accuracy touchpoints:**
1. The palette picker shows all ~519 DMC colors as swatches
2. The user browses visually, guided by color relationships
3. Near-identical pairs (blanc/B5200, 02/318) appear as duplicates in the picker

---

## Actual Reported Harms

### From cross stitch community observation

Cross stitch forums (r/CrossStitch on Reddit, Facebook cross stitch groups,
The Cross Stitch Guild forum) frequently contain posts with themes like:

**"My app said the color would look like X but the thread looks like Y"**
The most common complaint category. Usually: a color that looked saturated/bright
on screen appears duller or shifted in person. This is partly inherent physics
(additive vs subtractive, sheen, fabric) but partly data error. The Christmas
red (666) case, where the app shows a pink-magenta but the physical thread is a
deep warm red, is a specific case where data error likely causes this.

**"The app shows these two colors as identical but they're clearly different"**
Directly corresponds to the blanc/B5200 and 02/318 identical-value bugs. Users
building palettes that include both of these may see what appears to be a duplicate
and delete one, or be confused about which to buy.

**"I ordered the wrong color because I trusted the preview"**
Less frequent but more severe. A user who orders 10 skeins for a large project
based on the pattern preview may not discover the color is wrong until the project
is underway. Returning thread (especially from online retailers) is inconvenient
and may not be possible if the thread has been split or used.

---

## Financial and Time Impact

### Thread purchase errors
A skein of DMC Stranded Cotton costs approximately £0.95–£1.50 retail (the app's
default is £0.95). A purchase error is typically 1–3 skeins in the wrong color,
costing £1–£5 per error. This is minor individually but represents real wasted
money for a hobbyist.

For large projects (150+ colors, buying 2–3 skeins each), a palette with several
wrong colors could represent £10–£30 of incorrect purchases.

### Time cost
The more significant impact is time. A stitcher who has completed 50% of a 20-hour
project and realizes a color is wrong faces:
- Re-purchasing the correct thread (days wait if ordered online)
- Potentially frogging (unstitching) completed sections
- The psychological impact of seeing their work "wrong"

**This is the trust-breaking scenario.** A stitcher who experiences this once
is unlikely to trust the app's color display again.

### Scale of the problem
The most vulnerable users are:
1. **Beginners** — who don't yet have the experience to spot when a screen color
   is obviously wrong. They trust the screen more.
2. **Users doing custom pattern generation** — who have no external reference for
   what "the right colors" are, since the palette was generated from their photo
3. **Users making color-critical projects** — realistic portraits, brand logos,
   skin tones, where the ΔE₀₀ error of 3–10 can make the difference between
   "it looks like them" and "it doesn't"

---

## The Trust Dimension

Color accuracy is a foundational trust issue, not just a quality-of-life issue.

### Why trust matters more here than in most apps
In most software, a visual inaccuracy is a cosmetic issue. In a cross stitch app,
it directly influences purchasing decisions. The user has a real economic
relationship with the app's color display.

### The "they should know it's approximate" defence
It might be argued: "Of course the screen isn't exactly right, every reasonable
person knows screens vary." This argument fails for three reasons:

1. **Beginners don't know this.** The app is the introduction to the craft for
   many users. They have no prior experience that tells them to distrust the
   screen.

2. **The app doesn't say this.** There is currently no disclaimer, no help text,
   no contextual warning. The app presents colors as factual, so users treat them
   as factual.

3. **The errors are too large.** A ΔE₀₀ of 1–2 is "approximately right" and
   understandable as screen variation. A ΔE₀₀ of 9.82 for DMC 666 is not — it
   is showing a pink instead of a red. Screen variation cannot explain this; it
   is simply wrong data.

### The reputation impact
A user who buys the wrong thread based on app colors may:
- Post about it on Reddit or in craft groups (high sharing likelihood)
- Leave a negative App Store review citing color inaccuracy
- Stop using the app

In the cross stitch community, stitchers are experienced reviewers who know
exactly why something went wrong. A post saying "this app shows DMC 666 as pink
but it's actually red, don't trust the colors" can reach thousands of potential
users.

---

## The Opportunity Cost of Inaction

If the color data is not fixed:
- The blanc/B5200 confusion will continue to affect anyone building patterns with
  those colors
- The 02/318 confusion will continue to affect gray palette work
- DMC 666 will continue to look pink on screen — the most-used Christmas red in
  the world displayed as a pink
- User trust cannot be built through other features if the foundational color
  accuracy problem is publicly known

If the color data is fixed and communicated:
- Users who previously found colors wrong will find the app more trustworthy
- A transparent "we've improved color accuracy" note in release notes signals
  quality commitment
- The blanc/B5200 fix specifically removes a confusing UX bug that makes the app
  appear to show duplicates

---

## Concrete Impact by Error Category

| Error | Affected DMC Code | User Impact | Severity |
|-------|-------------------|------------|---------|
| Identical values | blanc = B5200 | Palette shows duplicates; users can't distinguish warm/cool white | High |
| Identical values | 02 = 318 | Can't distinguish two different grays | High |
| Wrong hue | 666 | Christmas red shows as pink/magenta — most impactful color of the year for many projects | Critical |
| Off by ΔE₀₀ 3–5 | 321, 796, 891, 3843 | Colors visually shifted — may cause wrong shade selection | Medium |
| Off by ΔE₀₀ 1–3 | Many (~50 colors) | Barely perceptible — within acceptable tolerance | Low |

**Prioritised fix list (data only):**
1. DMC 666 — fix immediately, largest real-world error found
2. B5200 / blanc — fix immediately, removes confusion bug
3. 02 / 318 — fix immediately, removes confusion bug  
4. 321, 796, 891, 3843 — fix as part of broader data update
5. Full data re-sourcing — medium-term improvement
