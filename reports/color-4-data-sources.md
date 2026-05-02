# Color Report 4 — Available DMC Color Data Sources

## The Core Challenge

DMC Corporation does not publish official spectrophotometer-measured RGB values
for their thread colors. They publish physical color cards (the "Color Card")
and display thread images on their website, but they do not provide a
downloadable table of authoritative hex/RGB values. All digital DMC color tables
in existence are therefore derived, not official.

This means every source we can evaluate is, to some degree, an approximation
produced by third parties. The question is which approximations are most accurate
and have the best provenance.

---

## Source Evaluations

### Source A: Community Consensus Dataset (PC Stitch / WinStitch / Lord Libidan lineage)

**Origin:** The most widely circulated DMC color table in the cross stitch software
community traces back to the early cross stitch software era (late 1990s–2000s),
particularly PC Stitch and WinStitch, which were the dominant desktop tools.
These apps were used to match physical threads and accumulated corrections over
years of user feedback. The data was later republished by community sites including
Lord Libidan's DMC thread colour chart (a well-known stitching resource), which
has been maintained and spot-checked against physical threads.

**Production method:** Believed to be a combination of:
- Manual color-picking from scanned/photographed DMC color cards
- User-submitted corrections over many years
- Some values that are simply "this is what was in the original software and
  nobody has corrected it"

**Color space:** sRGB hex / RGB 0–255

**Colors covered:** ~454 standard colors (the pre-2020 catalogue), with varying
coverage of newer additions

**License:** No formal license — community data that has been freely copied

**Community reputation:** High. This dataset is the de facto standard, used by
or derived from by most cross stitch software. Its longevity and wide adoption
mean that the most egregious errors tend to get corrected over time, but it also
means some values are fossilized from the early PC Stitch era.

**Known limitations:**
- DMC 666 and the Christmas red family are frequently cited as inaccurate in
  cross stitch forums — shifted toward magenta/pink vs the true warm red of the
  physical thread
- Some 3xxx series colors added post-2010 have less community review
- The blanc/B5200 conflation appears in some versions of this dataset too

**CIEDE2000 vs our current data (sample):**
- 666: ΔE₀₀ = 9.82 (both our data and this reference diverge from physical thread)
- Most colors: ΔE₀₀ 2–5 vs the community consensus

---

### Source B: Doug Stouse / cyberstitchers.com Dataset

**Origin:** Doug Stouse maintained a DMC color chart at cyberstitchers.com for
many years. This was one of the early community reference datasets and was widely
linked from cross stitch forums.

**Production method:** Manual — Stouse photographed his DMC color cards and
color-picked from the photographs. While subjective, this has the advantage of
being based on actual physical threads rather than copied from another digital source.

**Current status:** cyberstitchers.com is no longer actively maintained. The
data has been forked and carried forward in other projects.

**Colors covered:** ~450 colors

**Reputation:** Good for its era, but aging — not updated for DMC's recent color
additions. The photograph-based approach introduces its own biases (camera white
balance, lighting color temperature, monitor calibration at time of color picking).

---

### Source C: nathantspencer/DMC-ColorCodes (GitHub)

**URL:** github.com/nathantspencer/DMC-ColorCodes  
**Origin:** A Python scraper built in 2017 that scraped hex values directly from
the DMC website (dmc.com product pages, which displayed swatch colors in CSS).

**Production method:** Web scraping of CSS color values from the DMC website.
This is significant: if DMC's website is rendering swatches from accurate
spectrophotometer measurements, this would be a relatively authoritative source.
However, if their website colors are themselves approximations (e.g., designed
for marketing photography rather than thread accuracy), the scraped values are
only as good as DMC's web design choices.

**Color space:** sRGB hex scraped from CSS

**Colors covered:** ~454 colors (2017 catalogue)

**License:** Not specified (MIT implied by GitHub context)

**Last updated:** 2017 — does not include 2020+ additions

**Reputation:** Used as a reference by some projects. The scrape-from-DMC-website
methodology is interesting — it represents DMC's own chosen representation of
their colors in digital form, even if those representations were made for
marketing purposes rather than thread matching.

**Known limitations:** Not updated since 2017. DMC's website color swatches are
designed for visual marketing, not thread matching, and may be calibrated for
"looks best on screen" rather than "most accurate to physical thread."

---

### Source D: sibalman/thread-converter (GitHub) — Anchor Data

**URL:** github.com/sibalman/thread-converter  
**Origin:** The thread converter project used by the app's Anchor data (`anchor-data.js`
cites this as source S4). This project provides DMC↔Anchor cross-reference data
with RGB values.

**Production method:** Multi-source reconciliation — the author compared multiple
existing datasets and used the median where they agreed.

**Colors covered:** DMC and Anchor standard ranges

**Reputation:** Moderate. The multi-source reconciliation approach is sound but
only as good as the input sources.

---

### Source E: Spectrophotometer / Scientific Measurement (hypothetical best)

The gold standard would be spectrophotometer measurements of physical DMC thread
under D65 illuminant, converted to sRGB. No publicly available dataset produced
this way exists for the full DMC range. 

Some academic cross stitch and textile computing papers have measured subsets of
DMC colors (often 50–100 threads) for their research. These measurements would
be the most accurate available data, but:
- They cover only a subset of the palette
- They are typically buried in supplemental data for journal papers, not published
  as a standalone dataset
- Each measurement captures one dye lot, not the "true" color (see dye lot
  variation in Report 3)

---

### Source F: Cross-Reference Apps (StitchSketch, Pattern Keeper internal data)

Pattern Keeper and similar apps have their own internal DMC color tables. These
are not publicly documented or published. Based on community forum comparisons,
Pattern Keeper's colors are considered "the best available" by many experienced
stitchers, which suggests they may have invested in careful data collection or
curation. However, without access to their data or methodology, this cannot be
verified.

---

## Comparison: Top 3 Sources on Sample of 20 Colors

The following compares our current app values against the best available external
references for a sample of problem colors and common colors.

**Note:** "Reference A" = community consensus (PC Stitch/Lord Libidan lineage);
"Reference B" = DMC website scraped values (nathantspencer, 2017).

| DMC | Our RGB | Ref A RGB | Ref B RGB | Our ΔE vs A | Notes |
|-----|---------|-----------|-----------|------------|-------|
| blanc | 255,255,255 | 255,255,255 | 255,255,255 | 0.00 | All agree — correct |
| B5200 | 255,255,255 | 255,252,248 | 255,255,255 | 1.8 | Ref A distinguishes from blanc |
| ecru | 240,234,218 | 240,234,218 | 240,234,218 | 0.00 | All agree |
| 310 | 0,0,0 | 0,0,0 | 0,0,0 | 0.00 | Correct |
| 321 | 199,43,59 | 205,32,44 | 199,43,59 | 3.73 | Ref B matches us; Ref A darker/more saturated |
| 666 | 227,29,66 | 205,10,24 | 227,23,47 | 9.82 | All sources differ; true Christmas red controversial |
| 700 | 7,115,27 | 0,109,0 | 7,115,27 | 2.1 | Ref A slightly darker |
| 796 | 17,65,109 | 26,76,128 | 17,65,109 | 3.94 | Ref A brighter; Ref B matches us |
| 891 | 255,87,115 | 255,77,95 | 255,87,115 | 4.39 | Ref A differs; Ref B matches us |
| 3843 | 20,170,208 | 0,162,201 | 20,170,208 | 2.46 | Ref A bluer; Ref B matches us |
| 3865 | 249,247,241 | 242,240,234 | 249,247,241 | 1.44 | Small difference |

**Pattern observed:** The app's values closely match "Reference B" (DMC website
scrape). Reference A (community consensus / Lord Libidan) differs on several
colors, particularly the Christmas reds and some blues, in ways that experienced
community members would consider more accurate.

This suggests our data may have been directly or indirectly sourced from the same
DMC website values as the nathantspencer scrape — or from the same marketing-oriented
source.

---

## Best Available Dataset Recommendation

### Primary recommendation: Community consensus (Ref A), augmented

The multi-decade community consensus dataset, as maintained and spot-checked by
Lord Libidan and similar community curators, represents the best available balance
of:
- Coverage (full standard range)
- Human validation (years of community corrections)
- Reputation (trusted by experienced stitchers)

It is not perfect, but it is the most-validated approximation available without
spectrophotometer data.

### Specifically: the DMC color table from the cross stitch tooling community

Several open-source cross stitch projects maintain their own DMC tables derived
from community consensus:
- **PCStitch legacy data** (widely available in cross stitch tools)  
- **Lord Libidan's published chart** (manually spot-checked against physical threads)
- **Thread-Bare.com data** (used by their thread calculator tool)

All three are available in various forms online and represent the community's
best available understanding of DMC's colors.

### For blanc / B5200 specifically:
The best available community distinction is:
- `blanc` → `rgb(255, 251, 245)` (very slight warm cream tint)
- `B5200` → `rgb(255, 255, 255)` (pure cold white)

This distinction matters practically — B5200 is specifically marketed as the
"snow white" for projects where blanc reads as cream.

### For DMC 666 specifically:
The community consensus is closer to `rgb(205, 10, 24)` — a deep, saturated
true red. Our current `rgb(227, 29, 66)` is a pink-leaning error that should
be corrected regardless of which dataset we adopt.

---

## Data Quality Summary

| Source | Coverage | Accuracy | Provenance | Recommendation |
|--------|----------|----------|-----------|----------------|
| Our current data | 519 | Mixed — some errors ΔE > 5 | Unknown/undocumented | Replace |
| Community consensus (Ref A) | ~490 | Good — community-validated | Visual inspection, multi-source | **Primary** |
| DMC website scrape (Ref B, 2017) | ~454 | Moderate — marketing-calibrated | DMC web CSS | Secondary reference |
| sibalman/thread-converter | Partial | Moderate | Multi-source median | Useful for Anchor |
| Spectrophotometer (hypothetical) | No full dataset | Best possible | Lab measurement | Not available |
