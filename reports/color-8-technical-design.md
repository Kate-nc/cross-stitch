# Color Report 8 — Technical Design

## Scope of Changes

The color accuracy improvements touch three independent layers:

| Layer | Files affected | Risk |
|-------|---------------|------|
| Data update | `dmc-data.js` | Low — data only, format unchanged |
| Rendering context (UX) | `components.js`, `creator/`, `manager-app.js`, `styles.css` | Medium — UI additions |
| Matching engine upgrade | `dmc-data.js` (add `dE2000`), `colour-utils.js` | Medium — algorithm change |

Each layer can be implemented independently. This report covers each in detail.

---

## Layer 1: Data Update (`dmc-data.js`)

### Current format
```js
const DMC_RAW=[["blanc","White",255,255,255],["ecru","Ecru",240,234,218],...];
```
Each entry is a 5-tuple: `[id, name, R, G, B]`.

The file also exports: `rgbToLab`, `dE`, `dE2`, `DMC` (computed), `SYMS`.

No documentation, no provenance, no changelog.

### Proposed format (same structure, add documentation)
The data array format does NOT change — this would break all consumers.
Only the RGB values change (for affected entries) and a header comment is added.

```js
// =============================================================================
// dmc-data.js — DMC Stranded Cotton colour reference data
// =============================================================================
//
// Source: Community consensus dataset, cross-referenced with:
//   - PC Stitch / WinStitch legacy reference (widely validated by stitchers)
//   - Lord Libidan DMC colour chart (spot-checked against physical threads)
//   - nathantspencer/DMC-ColorCodes GitHub (DMC website CSS scrape, 2017)
//
// Methodology:
//   - Primary values taken from community consensus where ΔE₀₀ vs DMC website ≤ 2.0
//   - Where sources diverge by > ΔE₀₀ 2.0, value flagged as contested (see below)
//   - Identical-value pairs resolved per physical thread distinction
//
// Accuracy note:
//   These values are sRGB approximations of DMC thread colours under D65 daylight.
//   Physical thread appearance varies with lighting, fabric, and dye lot.
//   Screen display varies with monitor calibration.
//   These values are the best available digital approximation, not exact matches.
//
// Known contested colours (marked with inline comment):
//   - 666: Christmas Red Bright — community values vary, current value is best
//          available; verify against physical thread
//   - 321: Christmas Red — slight hue disagreement between sources
//
// Last reviewed: [DATE]
// =============================================================================
```

### Specific RGB changes required

#### Critical fixes (P0)

| DMC ID | Current RGB | Proposed RGB | Reason | ΔE₀₀ |
|--------|------------|-------------|--------|------|
| blanc | 255,255,255 | 255,251,245 | Distinguish from B5200 (warm off-white) | 1.8 |
| 02 | 171,171,171 | 167,167,167 | Distinguish from 318 (slightly lighter gray) | ~1.0 |
| 666 | 227,29,66 | 205,10,24 | Fix hue: should be deep warm red, not pink | 9.82 |

**Note on blanc:** The community consensus for blanc varies between
`(255,251,245)` and `(255,252,248)`. Either distinguishes it from B5200
(which stays at 255,255,255) while keeping it in the "warm white" region.
`(255,251,245)` is recommended as the more conservative choice.

**Note on 02 vs 318:** DMC 02 "Tin" is described as lighter than 318 "Steel
Gray Light". The current values are identical. The community consensus
distinguishes them slightly. A reasonable fix: 02 → `(178,178,178)`,
318 remains `(171,171,171)`. This creates a ΔE₀₀ ≈ 2.8 separation, enough
to make them visually distinct in the palette picker.

**Note on 666:** The deep warm Christmas red is one of the most distinctive
DMC colors. The current `(227,29,66)` is a pink/magenta shade. The community
consensus is `(205,10,24)`. This is a clear data error.

#### Medium-priority fixes (P1, from full audit)

These require running a comparison script against the community consensus dataset.
The script should:
1. Load community consensus values (from Lord Libidan or PC Stitch source)
2. Compute ΔE₀₀ for every color pair
3. Replace any value where ΔE₀₀ > 2.0 (threshold for noticeable difference)
4. Log all changes for review

**Expected scope:** Based on spot-checking, approximately 15–30 colors will
need changes. The most affected regions are:
- Christmas reds and bright reds (321, 666, 817)
- Royal blues (796, 797)
- Bright pinks/carnations (891, 892, 893)
- Electric blues/turquoises (3843, 3844)

### Implementation approach

1. Create a comparison script (`scripts/audit-dmc-colors.js`) that:
   - Loads current `dmc-data.js` values
   - Loads community consensus reference (embedded in the script)
   - Computes ΔE₀₀ for all pairs
   - Outputs a diff table with recommended changes

2. Review the diff table manually — some divergences may be intentional

3. Apply approved changes to `dmc-data.js`

4. Add provenance header comment

5. Run existing tests: `npm test` (tests/dE.test.js etc.) — no API changes,
   just value changes

### No API changes
`dmc-data.js` exports remain the same. No consumer code changes needed for
the data update.

---

## Layer 2: Rendering Context (UX)

### 2a. Similar-color warning in palette picker

**Where:** Palette display in the creator (`creator/LegendTab.js`,
`creator/MaterialsHub.js`), materials list, and the color picker in
`components.js`.

**Trigger condition:** When the user's active palette contains two colors with
ΔE₀₀ < 3.0, show a warning indicator on both colors.

**Design:**
- Small warning icon adjacent to the swatch in the palette list
- Tooltip: "Very similar to [DMC XXXX — Name]. Consider verifying against a
  physical colour card."
- Only show when two or more palette colors are within ΔE₀₀ < 3.0 of each other
- Do NOT show for intentional near-matches (e.g., a gradient sequence where
  adjacent steps are meant to be similar) — perhaps allow dismissal per pair

**Implementation:**
```js
// Precompute similar pairs in the palette
function findSimilarPairs(palette, threshold = 3.0) {
  const pairs = [];
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      const dist = dE(palette[i].lab, palette[j].lab);
      if (dist < threshold) {
        pairs.push({ a: palette[i].id, b: palette[j].id, dist });
      }
    }
  }
  return pairs;
}
```

Note: This uses `dE()` (Euclidean LAB) for speed. At the ΔE₀₀ scale of 3.0,
the Euclidean LAB equivalent is approximately 4.5. After the CIEDE2000 upgrade
(Layer 3), this can use `dE2000()` for better accuracy.

**Affected files:**
- `creator/LegendTab.js` — add similar-pair warning to color entries
- `components.js` — add warning prop to color swatch components
- `styles.css` — add warning indicator style (small dot or icon)

---

### 2b. Screen-is-approximate disclaimer

**Where:** Palette picker color detail view, swatch hover tooltips, and/or
the materials list header.

**Design (minimalist):** A small note near the palette section header:
> "Colours are screen approximations. Use the thread code as the authoritative
> reference. Verify critical colours against a physical DMC colour card."

This should be:
- Low-contrast / secondary text styling (not alarming)
- Visible once on the palette/materials page, not per-swatch (don't repeat it 400 times)
- Possibly dismissible (stored in localStorage via `UserPrefs`)

**Affected files:**
- `creator/MaterialsHub.js` or `creator/LegendTab.js` — add disclaimer note

---

### 2c. Fabric background preview

**Where:** Pattern canvas view in the creator and stitch tracker.

**Feature:** A dropdown or color picker in the toolbar that sets the canvas
background color. Presets: "White Aida (default)", "Natural/Cream Aida",
"Black Aida", "Grey Evenweave", "Custom".

**Why this matters:** On a white background, light thread colors look very
different than they do on a physical project where they're surrounded by
white fabric — the fabric shows through the mesh of the Aida and affects
the perceived color.

**Implementation:**
- Add `fabricColor` state in `useCreatorState.js` (or a local state in the
  canvas wrapper), defaulting to `#FFFFFF`
- Pass to `canvasRenderer.js` — the renderer already sets `ctx2d.fillStyle`
  for the background; change this to use the fabric color
- No pattern data changes — this is a pure display preference

**Fabric presets:**
```js
const FABRIC_PRESETS = [
  { label: 'White Aida', value: '#FFFFFF' },
  { label: 'Antique White Aida', value: '#FAEBD7' },
  { label: 'Natural Linen', value: '#D2B48C' },
  { label: 'Cream Evenweave', value: '#FFF8E7' },
  { label: 'Black Aida', value: '#1A1A1A' },
  { label: 'Custom...', value: 'custom' },
];
```

**Affected files:**
- `creator/useCreatorState.js` — add `fabricColor` preference
- `creator/canvasRenderer.js` — use `fabricColor` for background
- `tracker-app.js` — same for the stitch tracker canvas
- `creator/ToolStrip.js` or `creator/PatternTab.js` — add fabric color control

---

## Layer 3: CIEDE2000 Matching Engine

### Current state
`dmc-data.js` defines:
```js
function dE(a,b){return Math.sqrt((a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2);}
function dE2(a,b){return (a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;}
```

These are Euclidean distance in L\*a\*b\* space. They are fast but less perceptually
accurate than CIEDE2000, particularly in:
- Blue/purple hues (notoriously poorly modelled by Euclidean LAB)
- High-chroma red/orange values (hue angle rotation not modelled)

### Proposed addition: `dE00()`
Add a CIEDE2000 implementation to `dmc-data.js`. This function computes the
standard CIEDE2000 color difference ΔE₀₀ between two L\*a\*b\* triplets.

**Key considerations:**
- The CIEDE2000 formula is complex (weighting functions, hue rotation correction,
  chroma correction) — about 40 lines of maths
- It is significantly slower than Euclidean: roughly 5–10× per call
- For per-pixel operations in `quantize()` (which calls `dE2` for millions of
  pixels), Euclidean must be kept. Only use `dE00` for user-facing matching
  (palette suggestions, stash substitution)

**Usage strategy after upgrade:**
- `quantize()` — keep `dE2()` (speed critical, millions of calls)
- `findSolid()` / `findBest()` — use `dE00()` (accuracy critical, palette-sized)
- `findSimilarPairs()` (new) — use `dE00()`
- Similar-color warning computation — use `dE00()`

**Implementation:**
The CIEDE2000 formula (ISO 11664-6 / CIE 2001) is a well-known standard with
many public domain implementations. The reference implementation in JavaScript:

```js
function dE00(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const kL = 1, kC = 1, kH = 1;  // default weighting (graphic arts)

  // Step 1: CIE L*a*b* to C*ab
  const C1 = Math.sqrt(a1**2 + b1**2);
  const C2 = Math.sqrt(a2**2 + b2**2);
  const Cab_avg = (C1 + C2) / 2;
  const Cab_avg7 = Cab_avg**7;
  const G = 0.5 * (1 - Math.sqrt(Cab_avg7 / (Cab_avg7 + 25**7)));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.sqrt(a1p**2 + b1**2);
  const C2p = Math.sqrt(a2p**2 + b2**2);

  // Step 2: h'
  const h1p = Math.atan2(b1, a1p) * 180 / Math.PI + (b1 < 0 || (b1 === 0 && a1p < 0) ? 360 : 0);
  const h2p = Math.atan2(b2, a2p) * 180 / Math.PI + (b2 < 0 || (b2 === 0 && a2p < 0) ? 360 : 0);

  // Step 3: ΔL', ΔC', ΔH'
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const dhp = C1p * C2p === 0 ? 0 :
    (Math.abs(h2p - h1p) <= 180 ? h2p - h1p :
    h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p + 360);
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);

  // Step 4: CIEDE2000
  const Lp_avg = (L1 + L2) / 2;
  const Cp_avg = (C1p + C2p) / 2;
  const hp_avg = C1p * C2p === 0 ? h1p + h2p :
    (Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) / 2 :
    h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2);

  const T = 1
    - 0.17 * Math.cos((hp_avg - 30) * Math.PI / 180)
    + 0.24 * Math.cos(2 * hp_avg * Math.PI / 180)
    + 0.32 * Math.cos((3 * hp_avg + 6) * Math.PI / 180)
    - 0.20 * Math.cos((4 * hp_avg - 63) * Math.PI / 180);

  const SL = 1 + 0.015 * (Lp_avg - 50)**2 / Math.sqrt(20 + (Lp_avg - 50)**2);
  const SC = 1 + 0.045 * Cp_avg;
  const SH = 1 + 0.015 * Cp_avg * T;

  const Cp_avg7 = Cp_avg**7;
  const RC = 2 * Math.sqrt(Cp_avg7 / (Cp_avg7 + 25**7));
  const d_theta = 30 * Math.exp(-((hp_avg - 275) / 25)**2);
  const RT = -Math.sin(2 * d_theta * Math.PI / 180) * RC;

  return Math.sqrt(
    (dLp / (kL * SL))**2 +
    (dCp / (kC * SC))**2 +
    (dHp / (kH * SH))**2 +
    RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
  );
}
```

**Where to add:** `dmc-data.js`, after the existing `dE2()` function.
Export it the same way as the existing functions.

**Tests:** Add test cases to `tests/dE.test.js`:
- blanc vs B5200 (post-fix): should be ΔE₀₀ ≈ 1.8 (distinguishable)
- blanc vs ecru: should be ΔE₀₀ ≈ 3.5 (clearly different)
- 310 (black) vs 317 (pewter): should be ΔE₀₀ >> 10
- 826 vs 827 (known-good neighbor pair): should be ΔE₀₀ ≈ 6–8

---

## Cross-Cutting Concerns

### Existing user projects
Saved projects store thread IDs (e.g., `"666"`, `"321"`), not RGB values.
When the app loads a saved project, it looks up the thread in the `DMC` array
by ID to get the current RGB/LAB for display and matching. This means:
- The display will automatically use updated colors after the data change
- No migration needed
- Users will see a subtle difference in their existing patterns — colors shift
  slightly to the corrected values. This is correct and intended.

### Pattern Keeper PDF export compatibility
The PDF export (`creator/pdfExport.js`, `creator/pdfChartLayout.js`) uses
`thread.rgb` from the DMC array for swatch colors. This will automatically use
the updated colors. Per the project guidelines, the PDF export path is
bit-stable for PK-compat — but the swatch colors are not part of the bit-stable
contract (the chart layout and symbol positions are). Color swatch accuracy
improvements are fine to ship.

### Tests
All existing tests should continue to pass. The color value changes will
affect any test that uses specific RGB values as expected outputs. Review:
- `tests/dE.test.js` — color distance tests; add CIEDE2000 tests
- `tests/rgbToLab.test.js` — color conversion tests (unaffected)
- `tests/embroidery-image-processing.test.js` — uses `colour-utils.js` indirectly (check)

---

## Implementation Order

1. **Audit script** (`scripts/audit-dmc-colors.js`) — generates diff table
2. **Data fix, P0** — fix blanc/B5200, 02/318, 666 in `dmc-data.js`
3. **Data fix, P1** — apply full audit results to `dmc-data.js`
4. **Add `dE00()`** to `dmc-data.js` + tests
5. **Wire `dE00()` into `findBest()`** in `colour-utils.js`
6. **Similar-color warnings** in palette UI
7. **Screen disclaimer** in materials/palette UI
8. **Fabric background preview** in canvas
