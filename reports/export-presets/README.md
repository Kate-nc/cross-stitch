# Designer export preset validation

Reusable presets are global browser preferences. Full backup/restore includes their version and scope; project JSON, project bundles and sync do not. Existing density and branding controls are reused. Presets store branding inclusion, not profile content or project metadata.

## Reproduce

- `npm test` (requires loopback sockets for existing WebDAV tests)
- `node scripts/verify-export-presets.cjs`
- `node scripts/verify-pdf-symbols.cjs work/pdf-symbol-check`
- `npm run lint:terminology`
- `npm run lint:css-tokens` (existing non-blocking token warnings)
- `node build-creator-bundle.js` and `node build-sw.js --check`

## Example outputs

| PDF | Dimensions | Purpose |
| --- | --- | --- |
| [wide-letter.pdf](wide-letter.pdf) | 137 × 3 | Custom 50 × 30 density, Letter, two-stitch overlap |
| [tall-a4.pdf](tall-a4.pdf) | 3 × 173 | A4, large print, no overlap |
| [multipage-a4.pdf](multipage-a4.pdf) | 121 × 97 | Multiple rows/columns, both modes, overlap and index |
| [chart-only.pdf](chart-only.pdf) | 73 × 41 | B&W, no cover/info/index or legends |
| [branded-letter.pdf](branded-letter.pdf) | 17 × 13 | 30 mm margins, copyright, contact and studio branding |

`validation.json` records resolved geometry, options and actual PDF page counts. Each example's chart has a PNG render. `preset-panel.png` and `preset-panel-mobile.png` show the production Export component using representative chart data.

## Automated checks

Preset CRUD, rename, duplicate/invalid names, invalid settings, persistence across remounts, project changes, full backup/restore, older backup defaults and rejected project-scoped data are covered. Actual worker PDF tests compare page counts/progress with the shared preview plan; check symbol bounds, legend inclusion, paper dimensions and capacity checks even with legends disabled. Existing PK tests verify full embedded font bytes, selectable text symbols, distinct symbols through 112 threads/blends, missing glyph/palette errors and no object streams.

## Known limits

- The preview illustrates chart bounds and colours, not final symbol typography. Auto paper follows the browser locale.
- Pattern Keeper import on a real device remains manual; automated checks cover its PDF primitives.
- Branding uses the existing Helvetica text support (Latin/WinAnsi). French knots remain Workshop-only; petite/long stitches are rejected and beads are omitted as before.
- Poppler emits existing font-type mismatch warnings while rendering the embedded symbol font; PDF.js extraction and embedded-font checks pass.
- Comprehensive post-PR review and final validation results will be appended before completion.
