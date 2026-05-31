# Plan: OXS Export

> Competitive context: FlossCross and MacStitch/WinStitch both support OXS
> (Open X-Stitch) import **and** export. stitchx currently only imports OXS.
> Adding export closes the interop gap and lets users move patterns **out** of
> stitchx into any OXS-compatible app (MacStitch, WinStitch, FlossCross,
> KG-Chart).

---

## OXS format reference

Based on the existing import parser (`import-formats.js` L77–330), the
canonical OXS 2021 XML structure is:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<chart>
  <properties chartwidth="80" chartheight="60" />
  <palette>
    <color index="0" name="White" number="BLANC" red="255" green="255" blue="255" />
    <color index="1" name="Black" number="310" red="0" green="0" blue="0" />
    <!-- one entry per unique DMC colour in the pattern -->
  </palette>
  <fullstitches>
    <stitch x="0" y="0" palindex="1" />
    <stitch x="1" y="0" palindex="0" />
    <!-- one per non-skip, non-empty cell -->
  </fullstitches>
  <backstitches>
    <backstitch x1="0.5" y1="0.5" x2="1.5" y2="0.5" palindex="1" />
    <!-- one per bsLines entry -->
  </backstitches>
</chart>
```

Attributes used by the import parser (these are what other apps will read back):
- `<chart>` root or `<properties>` child carries `chartwidth`/`chartheight`
- `<color>` carries `index` (0-based int), `name`, `number` (DMC code), `red`/`green`/`blue`
- `<stitch>` carries `x`, `y` (0-based ints), `palindex` (matches `<color index>`)
- `<backstitch>` carries `x1`, `y1`, `x2`, `y2` (float grid coords), `palindex`

---

## Scope and constraints

**In scope:**
- Solid stitches (the common case)
- Backstitch lines (`bsLines` array on the project)
- All valid DMC colours in the palette

**Out of scope (v1):**
- Blend stitches (id `"310+550"`) — OXS has no standard blend representation.
  Export blends as their primary thread (the first ID) with a code comment, or
  skip entirely. Add a warning in the export UI if blends are present.
- Half stitches (`halfStitches` map) — OXS has a `<halfstitches>` element but
  it's rarely supported; omit for now.
- Tracking progress (`done` array) — OXS is a pattern format, not a tracker format.
- `__skip__` and `__empty__` cells — omit from `<fullstitches>` (correct behaviour).

---

## Implementation

### Step 1 — Write `generateOXS(project)` in `import-formats.js`

Add a new exported function after `parseOXS`:

```js
function generateOXS(project) {
  // project shape: { w, h, pattern[], bsLines[], name }
  // 1. Build palette: collect unique DMC ids (skip __skip__, __empty__, blends)
  // 2. Assign palette indexes (0-based, deterministic order matches first appearance)
  // 3. Build <fullstitches> — iterate pattern[], emit <stitch> for non-skip cells
  // 4. Build <backstitches> — iterate bsLines[], look up thread colour from adjacent cell
  // 5. Serialise to XML string and return it

  const palMap = {};   // dmcId → { index, name, number, r, g, b }
  const blendWarning = [];
  let palIndex = 0;

  // Pass 1: palette
  for (const cell of project.pattern) {
    if (!cell || cell.id === '__skip__' || cell.id === '__empty__') continue;
    if (cell.type === 'blend') {
      // Record blend warning, export as primary thread
      const primaryId = cell.id.split('+')[0];
      if (!palMap[primaryId]) {
        // look up DMC entry ...
        palMap[primaryId] = { index: palIndex++, ... };
        blendWarning.push(cell.id);
      }
      continue;
    }
    if (!palMap[cell.id]) {
      palMap[cell.id] = { index: palIndex++, name: cell.name, number: cell.id, r: cell.rgb[0], g: cell.rgb[1], b: cell.rgb[2] };
    }
  }

  // Pass 2: stitches XML
  // ...

  // Return { xml: string, warnings: string[] }
}
window.generateOXS = generateOXS;
```

The function returns `{ xml: string, warnings: string[] }` so the UI can
show a warning toast if blends were downgraded.

**Files to touch:** `import-formats.js`

---

### Step 2 — Add "Export as OXS" button to `creator/ExportTab.js`

The Export tab already has buttons for PDF and JSON export. Add an OXS row
in the same section.

**Button label:** "Open X-Stitch (.oxs)"  
**On click:**
1. Call `window.generateOXS(project)`
2. If `warnings.length > 0`, show a toast: "X blend colours were exported as their primary thread — blend support is not part of the OXS standard."
3. Download via a dynamic `<a download="patternname.oxs">` with a `data:application/xml` URL

**Files to touch:** `creator/ExportTab.js`, then `node build-creator-bundle.js`

---

### Step 3 — Add "Export as OXS" button to the Tracker

Users who import a pattern and track it in the tracker may also want to export
(e.g. to open in MacStitch for a printed reference).

**Where:** The project menu / overflow options in `tracker-app.js` — the same
place as the existing JSON export or backup options.

**Files to touch:** `tracker-app.js`

---

### Step 4 — Canonicalise BLANC / ECRU / special IDs

The import parser already normalises `"blanc"` → `"BLANC"` and `"ecru"` → `"ECRU"`.
The export must write those same strings in the `number` attribute so a
round-trip import is lossless. Confirm the DMC data entries for BLANC and ECRU
use those exact ids.

**Files to check:** `dmc-data.js` — verify `DMC.find(t => t.id === 'BLANC')` exists.

---

## Testing

Add a round-trip test in `tests/`:

```
generateOXS(project) → xmlString → parseOXS(xmlString) → project2
assert project2.pattern deepEquals project.pattern (for solid cells)
assert project2.bsLines deepEquals project.bsLines
assert project2.width === project.w
assert project2.height === project.h
```

This follows the existing pattern of extracting functions via `fs.readFileSync`
+ regex + eval (see `embroidery-image-processing.test.js` for the pattern).

**New test file:** `tests/oxs-roundtrip.test.js`

---

## Acceptance criteria

- [ ] `generateOXS(project)` returns well-formed XML parseable by `parseOXS`
- [ ] Round-trip test passes: solid stitches and backstitches survive encode → decode
- [ ] Blend warning toast appears when blends are present; export still proceeds
- [ ] Downloaded file has `.oxs` extension
- [ ] BLANC and ECRU round-trip correctly (number attribute = "BLANC" / "ECRU")
- [ ] Button text has no emoji
- [ ] `creator/bundle.js` is regenerated after changes to `creator/ExportTab.js`

---

## Estimated scope

| Step | Effort |
|---|---|
| 1. `generateOXS()` in `import-formats.js` | Medium (~80–120 lines) |
| 2. Export tab button | Small (~20–30 lines + bundle regen) |
| 3. Tracker export button | Small (~15–20 lines) |
| 4. BLANC/ECRU validation | Tiny (~5 min check, no code likely needed) |
| Round-trip test | Small (~60–80 lines) |
