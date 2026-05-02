# Color Report 5 — Competitor Approaches

## Cross Stitch Apps

### Pattern Keeper (iOS/Android)
Pattern Keeper is the most widely used and widely praised cross stitch pattern
app. It is the closest comparator to this app.

**Color approach:**
- Uses flat color swatches rendered in a grid interface
- Color data source is not publicly documented, but community members consistently
  describe its colors as "the most accurate" of any app — suggesting careful
  data curation, possible physical thread measurement, or at minimum extensive
  community feedback integration
- Does not offer texture simulation or photographic swatches
- No built-in "verify against physical card" guidance

**What they do well:** Color data quality. Users report that PK's colors "look
right" more often than other apps. The PDF export renders patterns using the same
color data, which gives end-to-end consistency.

**What they don't do:** Any acknowledgment of screen-vs-thread limitations. No
similar-color warnings. No fabric background preview.

**User sentiment:** App Store reviews very rarely mention color accuracy as a
complaint — which is significant compared to some competitors.

---

### Stitch Fiddle (web app)
**Color approach:**
- Flat swatches in standard DMC colors
- Colors are broadly recognizable but community discussion notes they lean slightly
  different from physical thread — particularly blues and greens
- No special color accuracy features

**What they lack:** No similar-color warnings, no fabric preview, no accuracy
disclaimer. Just flat swatches.

---

### WinStitch (Windows desktop)
The original desktop cross stitch software standard.

**Color approach:**
- Uses the "PC Stitch legacy" community consensus dataset
- Colors displayed as flat swatches in a color picker dialog
- Most Windows cross stitch users have used WinStitch to manually match colors
  from printed color cards — the workflow explicitly assumes screen colors are
  approximate

**Historical influence:** The WinStitch/PC Stitch color table is the lineage for
most community datasets. The data has been through decades of community corrections.

---

### MacStitch / PCStitch
Legacy desktop tools, similar to WinStitch. Use the community consensus dataset.
Colors are generally considered "good enough for planning, verify in person for
critical choices."

---

## Pantone-Dependent Tools (Print Design)

Pantone's approach to the screen-vs-physical problem is instructive:

### Pantone Connect
Pantone licenses its color data and has strict rules about how colors are displayed:
- All digital Pantone representations come with **mandatory disclaimers** that
  the screen color is an approximation
- The actual Pantone color is identified by its code (PMS number), not by the
  screen representation
- Pantone's official guidance: "Digital representations are provided for
  visualization purposes only. Always reference a physical Pantone color chip
  for accuracy."
- Colors are shown on a neutral mid-gray background to minimize simultaneous
  contrast effects

**Key lesson:** Pantone has solved the screen-vs-physical trust problem not by
making better screen colors, but by being honest that the screen color is
approximate and the code is the authoritative reference. Stitchers can do the
same — the DMC code number is the authoritative reference; the swatch is a visual
aid.

### Adobe Color / Photoshop Pantone swatches
When Pantone lost its Adobe integration deal (2023), this became news because
professionals had relied on Pantone swatches in Photoshop. The lesson: even in
professional tools, color matching ultimately requires physical samples.

---

## Textile and Fashion Design Tools

### Adobe Illustrator / InDesign with Pantone libraries
These tools show Pantone swatches with the implicit understanding that "this
is approximate." No disclaimers are shown inline (they used to be, before
Pantone's deal expired).

### Fashion CAD / CLO3D / Browzwear (virtual garment tools)
High-end 3D garment visualization tools simulate fabric color, texture, and sheen
on virtual garments. Their color approach is relevant:

- They maintain material libraries with both sRGB representations AND physical
  reference codes (Pantone, Coloro, etc.)
- They render fabric with texture, directionality, and simulated specularity
- They explicitly state that screen rendering is for "visualization only" and
  physical fabric must be ordered and approved before production
- The best tools allow lighting environment selection to preview fabric under
  different illuminants (daylight, showroom, office)

**Lesson:** Even the most sophisticated textile visualization tools still require
physical approval. The screen is a planning tool, not a procurement decision tool.

---

## Photography and Color-Critical Tools

### Lightroom / Capture One (professional photo editing)
These tools operate in wide-gamut color spaces (ProPhoto RGB, AdobeRGB) internally,
and convert to display profiles using ICC color management. The user never needs
to think about it — the tool handles display calibration transparently.

**Relevance:** These tools assume a calibrated display. Cross stitch app users
are not photographers with calibrated displays. The ICC approach is technically
correct but requires hardware calibration that our users don't have.

### Print shops / soft proofing
Designers use "soft proofing" — simulating how a color will look in a specific
print process (CMYK offset, inkjet, etc.) by applying a process-specific ICC
profile. The designer sees an approximation of the printed result.

**Could we adapt this for cross stitch?** Theoretically yes — we could apply a
"DMC thread profile" that adjusts sRGB values to better represent how thread
looks compared to screen colors. In practice, this would require spectrophotometer
data we don't have, and would need to be profile-per-thread rather than a single
transformation.

---

## Approaches Used Across Tools

### 1. Best available flat color (universal)
Every tool does this. Varies in quality. This is the baseline.

### 2. Explicit disclaimer + code-is-authoritative
Pantone's approach. Very effective for trust. Adopted by: Pantone Connect,
professional print software.  
Not yet adopted by any cross stitch app.

### 3. Neutral background for swatches
Showing swatches on a neutral mid-gray background (rather than white) minimizes
simultaneous contrast effects. Adopted by: Pantone Connect, color design tools.
Reduces the influence of surrounding UI chrome on perceived swatch color.

### 4. Similar-color warnings
Some palette tools show "this color is very close to another in your palette"
warnings. Not common in cross stitch apps but used in paint mixing apps (e.g.,
Procreate's palette management).

### 5. Fabric background preview
Some needlework chart software allows setting a background color to represent
the fabric. WinStitch supports this. Useful for seeing how light colors look
on dark fabric.

### 6. Textured swatch rendering
Not common in cross stitch software. CLO3D and similar tools do this for
fabric swatches (simulated thread/weave texture). One indie iOS cross stitch
app (Knitbird adjacent) attempted this but it was considered cluttered at small sizes.

### 7. Photography-based swatches
No major cross stitch app uses photographic thread swatches. Thread photography
is challenging: professional lighting setup required, all 500+ colors need
consistent photography, file sizes are large. The closest analog is paint apps
(BM Color Capture, Sherwin-Williams ColorSnap) which show physical paint chip
photography — but these are marketing photos, not measurement tools.

### 8. User-adjustable display calibration
No cross stitch app does this. Some professional color tools (SpectraView II for
NEC monitors) allow per-display calibration. Not relevant for hobbyist consumers.

---

## Summary: What Competitors Do and Don't Do

| Feature | Pattern Keeper | Stitch Fiddle | WinStitch | This App |
|---------|---------------|--------------|----------|---------|
| Flat color swatches | Yes | Yes | Yes | Yes |
| Accurate color data | Good | Moderate | Good | Mixed |
| Similar-color warnings | No | No | No | No |
| Fabric background preview | No | No | Yes (basic) | No |
| Screen-vs-thread disclaimer | No | No | Implicit | No |
| Texture simulation | No | No | No | No |
| Photographic swatches | No | No | No | No |

**The opportunity:** No competitor currently shows similar-color warnings or
explicit screen-vs-thread guidance. Being the first to do this honestly and
unintrusively would differentiate the app and build stitcher trust.

The fabric background preview exists in WinStitch but not in modern mobile-first
apps — another gap to fill.
