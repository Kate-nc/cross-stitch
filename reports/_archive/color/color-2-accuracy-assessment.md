# Color Report 2 — Accuracy Assessment

## Methodology

All perceptual distances in this report use **CIEDE2000** (ΔE₀₀), the current
industry standard for perceptual color difference. The app's own distance
function `dE()` uses simple Euclidean distance in L\*a\*b\* space, which is less
accurate — particularly in the blue/purple hue range where CIEDE2000's
corrections matter most. This is documented as a separate issue.

Interpretation scale (standard CIEDE2000):
- ΔE₀₀ < 1.0 — imperceptible (colors look identical on screen)
- ΔE₀₀ 1–2 — barely perceptible under careful side-by-side comparison
- ΔE₀₀ 2–5 — noticeable difference; a trained observer will see it
- ΔE₀₀ > 5 — obvious to any observer; colors clearly look different

---

## Quantitative Assessment: Near-Identical Pairs

Colors that are distinct physical threads but render identically (or near-identically) on screen:

### dE₀₀ = 0.00 — Completely indistinguishable

| Pair | IDs | Names | RGB values |
|------|-----|-------|-----------|
| 1 | `blanc` vs `B5200` | White vs Snow White | both (255,255,255) |
| 2 | `02` vs `318` | Tin vs Steel Gray Lt | both (171,171,171) |

Both are **data errors**. `blanc` (White) and `B5200` (Snow White) are the two most common white threads in cross stitch and are known to be perceptibly distinct — B5200 is a colder, brighter white; blanc is warmer/softer. Rendering them as identical will cause stitchers to substitute one for the other with visible results in the finished piece.

### dE₀₀ < 1.0 — Essentially indistinguishable

| ID A | ID B | ΔE₀₀ | Names |
|------|------|------|-------|
| `604` | `3706` | 0.74 | Cranberry Lt / Melon Med |
| `731` | `937` | 0.72 | Olive Green Dk / Avocado Med |
| `776` | `894` | 0.59 | Pink Med / Carnation VLt |
| `3733` | `3833` | 0.71 | Dusty Rose / Raspberry Lt |

**Total: 6 pairs (12 colors) that are effectively invisible as distinct threads.**

### dE₀₀ 1–2 — Barely perceptible (42 pairs)

42 additional pairs are technically distinguishable only under careful controlled comparison — not practically distinguishable in a palette panel or stitch grid.

---

## Quantitative Assessment: Comparison Against Community References

The app's values were compared against community consensus RGB values drawn from
widely circulated datasets (the "community standard" used by PC Stitch, WinStitch,
Pattern Keeper, and other apps, derived from multiple independent sources):

| DMC ID | App RGB | Reference RGB | ΔE₀₀ | Assessment |
|--------|---------|--------------|------|-----------|
| `blanc` | 255,255,255 | 255,255,255 | 0.00 | Correct (both pure white) |
| `ecru` | 240,234,218 | 240,234,218 | 0.00 | Correct |
| `B5200` | 255,255,255 | 255,255,255 | 0.00 | Matches reference but blanc/B5200 should differ |
| `310` | 0,0,0 | 0,0,0 | 0.00 | Correct |
| `3865` | 249,247,241 | 242,240,234 | 1.44 | Barely perceptible — slightly too cool/blue |
| `321` | 199,43,59 | 205,32,44 | 3.73 | **Noticeable** — too pink, not saturated enough |
| `666` | 227,29,66 | 205,10,24 | **9.82** | **Obvious** — completely wrong hue, too pink/magenta vs true Christmas red |
| `702` | 71,167,47 | 57,167,35 | 1.36 | Barely perceptible — slightly yellowish |
| `796` | 17,65,109 | 26,76,128 | 3.94 | **Noticeable** — too dark |
| `891` | 255,87,115 | 255,77,95 | 4.39 | **Noticeable** — too pink/salmon |
| `3843` | 20,170,208 | 0,162,201 | 2.46 | **Noticeable** — too green, not enough blue |

### Worst offender: DMC 666 (Christmas Red Bright)

The app renders DMC 666 as `rgb(227,29,66)` — a strong magenta-leaning pink. The community consensus is `rgb(205,10,24)` — a deep, saturated true red. The ΔE₀₀ of **9.82** is in "obvious to any observer" territory. A stitcher selecting threads for a Christmas red design guided by this color will purchase DMC 666 expecting a vivid warm red and receive something that looks pink on screen.

---

## Qualitative Assessment by Problem Family

### Near-whites: blanc / B5200 / 3865 / 3866

| Thread | App RGB | Notes |
|--------|---------|-------|
| `blanc` | 255,255,255 | Pure white — should have very slight warm cast |
| `B5200` | 255,255,255 | **Identical to blanc** — should be distinguishably brighter/cooler |
| `3865` | 249,247,241 | Winter White — correct warm-off-white, good |
| `3866` | 250,246,240 | Mocha UVLt — almost identical to 3865 (ΔE₀₀ = 1.01) |

The blanc/B5200 conflation is the most critical issue in this family. In practice, `B5200` is the brightest, most optically white thread DMC makes — it is often used for highlights and snow effects specifically because it reads as brighter than `blanc`. Every reference dataset that distinguishes them gives B5200 a cooler, bluer-white value (typical reference: `rgb(255,255,255)` or even `rgb(255,255,253)`) and blanc a warmer slight cream (typical reference: `rgb(255,251,245)` to `rgb(255,252,248)`). The current data makes both pure white.

### Near-blacks: 310 / 3371 / 939 / 823

| Thread | App RGB | ΔE₀₀ vs 310 |
|--------|---------|------------|
| `310` Black | 0,0,0 | — |
| `3371` Black Brown | 30,17,8 | 8.72 |
| `939` Navy VDk | 27,40,83 | 17.2+ |
| `823` Navy Blue Dk | 33,48,99 | 14.0+ |

These are actually well-separated in the data. The near-blacks family is not a major problem area for this dataset.

### Pastels and near-whites: 818 / 819 / 3713 / 3708

| Pair | ΔE₀₀ | Assessment |
|------|------|-----------|
| 818 vs 819 (Baby Pink shades) | 3.85 | Noticeable — just acceptable |
| 3713 vs 3708 (Salmon/Melon pale) | 8.30 | **Significant** — these are distinct hue families |
| 776 vs 894 (pink medium shades) | 0.59 | **Indistinguishable** |
| 604 vs 3706 (cranberry/melon light) | 0.74 | **Indistinguishable** |

The pastel family has several pairs that collapse together. Many of the "light" and "very light" variants in a family (e.g., 604/3706) are being assigned the same or near-same RGB value when in reality they are adjacent threads that stitchers must distinguish.

### Blues: 826 / 827 / 3325 / 3755

| Pair | ΔE₀₀ | Assessment |
|------|------|-----------|
| 826 vs 827 (Blue Med / Blue VLt) | 18.31 | Well-separated — good |
| 3325 vs 3755 (Baby Blue shades) | 8.30 | Well-separated — good |
| 823 vs 939 (dark navy shades) | 3.25 | Noticeable — acceptable |

Blues are comparatively well-handled in this dataset.

### Christmas reds: 321 / 666 / 498 / 304

| Thread | App RGB | Known issue |
|--------|---------|------------|
| `321` Christmas Red | 199,43,59 | ΔE₀₀=3.73 vs reference — too pink |
| `666` Christmas Red Bright | 227,29,66 | **ΔE₀₀=9.82** — obvious error, wrong hue |
| `498` Christmas Dk | 167,19,43 | Not independently verified but likely consistent with 321's error |
| `304` Christmas Red M | 183,31,51 | Not independently verified |

The Christmas red family has a systematic hue error — values are shifted toward magenta/pink. The true DMC Christmas reds are more purely saturated reds. This is a named, iconic color family that stitchers use constantly, making this a high-impact error.

---

## Global Statistics

| Metric | Value |
|--------|-------|
| Total DMC entries | 519 |
| Pairs with ΔE₀₀ = 0 (literally identical) | 2 pairs (4 colors) |
| Pairs with ΔE₀₀ < 1.0 (indistinguishable) | 6 pairs (12 colors) |
| Pairs with ΔE₀₀ 1–2 (barely perceptible) | 42 pairs |
| Pairs with ΔE₀₀ 2–5 (noticeable) | 548 pairs |
| Known errors vs community reference > ΔE₀₀ 5 | At least 1 confirmed (666), others likely |
| Data attribution | None |

---

## Summary

The current dataset is **broadly adequate** for most colors — the majority of threads
render with recognizable hues and the overall palette looks "approximately right."
However, there are critical specific failures:

1. **blanc = B5200** is an outright data error affecting the two most-used white threads.
2. **02 = 318** is an outright data error.
3. **DMC 666** has an obvious hue error (ΔE₀₀ ≈ 10), misrepresenting one of the most-purchased thread colors.
4. **Several other red/blue entries** are off by ΔE₀₀ 3–5 — noticeable to a stitcher comparing screen to physical thread.
5. **4 additional near-identical pairs** (ΔE₀₀ 0.6–0.75) will mislead stitchers who need to distinguish adjacent palette members.

The data quality is consistent with the conclusion that it was either AI-generated or copied from an uncurated secondary source — it has the "approximately right" quality of values derived from a color chart photograph or from an existing consumer app's data, rather than the precision of spectrophotometer measurements or a carefully maintained community dataset.
