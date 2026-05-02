# Color Report 3 — Color Science: Why Screen ≠ Thread

## 1. Subtractive vs Additive Color

Physical thread and screens operate on fundamentally different physical principles.

### Screen (additive)
A monitor emits light. Each pixel is a combination of red, green, and blue light
emitters. When all three are at maximum, the result is white (all wavelengths).
When all are off, the result is black (no light). Colors are formed by mixing
emitted light. The RGB value (255, 0, 0) means "emit maximum red photons, emit
no green or blue photons."

### Thread (subtractive)
Thread is dyed with pigments that absorb certain wavelengths and reflect the
remainder back to the viewer. A "red" thread absorbs greens and blues, reflecting
red. The color you see depends on:
- What wavelengths are in the ambient light hitting the thread
- Which of those wavelengths the dye absorbs
- The physical structure of the thread (twist, sheen, fiber alignment)

### The implication for color matching
There is no lossless conversion between the two systems. When you measure a physical
thread with a spectrophotometer under a specific standard illuminant (e.g., D65,
which models average daylight), you get a spectral reflectance curve. Converting
that to an sRGB value for display is a mathematical operation that:

1. Assumes a specific observer (CIE 2° standard observer)
2. Assumes a specific display white point (D65)
3. Clips any colors outside the sRGB gamut (some highly saturated dye colors
   genuinely cannot be represented in sRGB)
4. Discards the spectral information — all the information about how the color
   will look under different lighting is thrown away

The resulting sRGB value is the "best sRGB equivalent of this thread under D65
daylight." It is not the thread's color — it is a sRGB approximation of how the
thread looks under one specific lighting condition.

---

## 2. Metamerism

**Metamerism** is the phenomenon where two colors that look identical under one
light source look different under another. It is fundamental to dye chemistry.

A thread dyed with one pigment combination and a second thread dyed with different
pigments to match under daylight may diverge under fluorescent or incandescent
light. The single RGB value in our data table represents the thread's appearance
under (approximately) D65 daylight.

A stitcher buying thread based on our screen display may find:
- It looks right in natural daylight
- It looks different in their craft room under warm tungsten or fluorescent lights
- It looks different again under a daylight-balanced LED

**What can we do about metamerism?** Very little with current tooling.
Professional color matching tools (textile industry, paint) address this by
measuring the full spectral reflectance curve and computing the color under
multiple illuminants. This data would require spectrophotometer measurements of
every thread — information DMC does not publish. Even the best community datasets
are working from a single-illuminant representation. 

Some high-end textile tools show a "color shift" indicator for colors known to be
highly metameric. This is not feasible without raw spectral data.

**Practical implication for this app:** The screen display represents the thread
under D65 daylight. For stitchers in warm-light environments, colors may appear
more yellow/orange on the physical thread than on screen. This is worth noting
in a general disclaimer but cannot be corrected per-color without measurement data.

---

## 3. Dye Lot Variation

DMC thread is produced in batches. The same color code can vary slightly between
production lots due to:
- Minor variations in dye concentration
- Differences in fiber batch (natural fiber has slight color variation)
- Aging and oxidation in storage

**How significant is this variation?** Industry experience and community observation
suggests lot-to-lot variation for DMC thread is typically ΔE₀₀ 0.5–2.0 for most
colors. Some colors (particularly bright reds, turquoises, and pastels) can vary
more. This means that even a perfect spectrophotometer measurement of one skein
of DMC 321 might differ by ΔE₀₀ 1–2 from a different skein of DMC 321.

**Implication:** There is no single "correct" RGB for any DMC color. Any dataset,
no matter how carefully measured, represents a sample of the thread at a specific
dye lot. The achievable accuracy for any single stored value is approximately
ΔE₀₀ ± 1.0 due to dye lot variation alone.

This means the goal for our data should be "within ΔE₀₀ 2.0 of the community
consensus" rather than "exact match," since exact matching across dye lots is
physically impossible.

---

## 4. Display Variation

The same RGB value looks different across devices:

| Factor | Typical variation | Impact |
|--------|-------------------|--------|
| White point (screen color temperature) | 5000K–7000K | Colors shift warm/cool |
| Gamma | 2.0–2.4 | Mid-tones lighter/darker |
| Color gamut | sRGB to wide-gamut P3 | Saturated colors more vivid on P3 |
| Brightness | 50–500 nits | Perceived saturation changes |
| Viewing angle (IPS vs OLED vs TN) | Significant | Colors shift with angle |
| Color profile (calibrated vs uncalibrated) | Large | Uncalibrated screens can be 3–8 ΔE₀₀ off |

**Consumer device reality:** Most users are on uncalibrated consumer devices.
A typical mid-range laptop panel may have a white point of 6500K ± 500K, a gamma
curve that varies by ±0.2, and no color profile applied. This means the same
sRGB value may differ by ΔE₀₀ 2–5 between two different users' screens.

**Implication:** Even if our data is perfectly accurate sRGB, a user on a screen
with a warm white point (common on Windows laptops) will see colors shifted warm.
A user on a high-brightness OLED (phone) will see colors more saturated. We cannot
control for this.

**What other apps do:** Professional print tools use ICC profiles and display
calibration. For cross stitch software, this is out of scope — our users are
hobbyists on consumer devices. The correct approach is:
1. Ensure our data is the best available sRGB approximation under D65
2. Acknowledge in the UI that screen colors are approximations
3. Recommend physical color card verification for important color choices

---

## 5. Thread Texture and Visual Appearance

Embroidery floss has physical properties that a flat sRGB rectangle cannot represent:

### Sheen and specularity
DMC Stranded Cotton has a slight sheen from the cotton fiber's structure. When
light hits at an angle, some areas of the thread reflect more light (appear lighter)
while others absorb more (appear darker). This creates the characteristic "life"
of embroidery thread that flat swatches lack.

### Twist and directional texture
The six-strand construction creates a slight helical texture. When stitched, the
direction of the stitch relative to the light creates subtle lightness variation
across the thread width.

### Color depth
The dye penetrates differently at the thread surface vs. the interior. The color
you see is a composite of surface reflection and sub-surface scattering. This
gives thread colors a subtle depth that flat color cannot replicate.

### Fabric interaction
When stitched into Aida or linen fabric, the thread color is affected by:
- The fabric's base color (white Aida reads colors slightly differently than
  natural linen or black)
- The stitch coverage (partial coverage means fabric color bleeds through)
- Adjacent colors in the pattern (simultaneous contrast affects perceived hue)

### Practical implication
A stitcher looking at a 14×14px color chip on screen is seeing a flat, matte,
evenly-lit simulation of a thread that is shiny, textured, and context-dependent.
Even the most accurate possible RGB value will read "flat" compared to the actual
thread.

There are two approaches to address this:
1. **Thread texture simulation**: A CSS or canvas effect that adds directional
   shimmer and texture to swatches (Approach B in the proposal). Visually richer
   but requires care to not shift the perceived hue.
2. **Photography**: Actual photographs of each thread swatch (Approach C).
   This captures real-world appearance including sheen, but introduces its own
   accuracy issues (lighting, camera response, image compression).

---

## Summary: What Is and Is Not Fixable

| Problem | Fixable? | How |
|---------|---------|-----|
| Data errors (blanc=B5200, 666 wrong) | Yes | Replace with accurate values |
| Colors off by ΔE₀₀ 3–10 vs reference | Yes | Use better dataset |
| Subtractive vs additive color gap | No | Inherent physics |
| Metamerism (looks different in different lighting) | No | Would need full spectral data DMC doesn't publish |
| Dye lot variation | No | Real-world variation ≈ ΔE₀₀ 0.5–2.0 |
| Display variation across devices | Partially | Ensure correct sRGB; cannot fix uncalibrated displays |
| Flat swatch vs textured thread appearance | Partially | Texture simulation helps visually; not physically accurate |
| Fabric interaction | Partially | Fabric preview toggle helps user understand context |

**The honest ceiling for this app:**
With the best available data, rendered correctly in sRGB, on a typical consumer
display, the achievable accuracy is approximately **ΔE₀₀ 1–3 for most colors**.
This is in the "barely perceptible to noticeable" range — better than the current
situation for several colors, but still not a perfect match to physical thread.
An app that claims perfect color accuracy is lying. An app that provides the
best available approximation and honestly contextualizes its limitations builds
genuine trust.
