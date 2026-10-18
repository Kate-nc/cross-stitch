# Designer export preset validation

Reusable presets are global browser preferences. Full backup/restore includes their version and scope; project JSON, project bundles and sync do not. Existing density and branding controls are reused. Presets store branding inclusion, not profile content or project metadata.

## Reproduce

- `npm test` (requires loopback sockets for existing WebDAV tests)
- `node scripts/verify-export-presets.cjs`
- `node scripts/verify-pdf-symbols.cjs work/pdf-symbol-check`
- `node scripts/verify-pdf-pk-baseline.cjs` (frozen-clock byte comparison against revision `986fd1d2`)
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
- Branding lines shrink to fit, down to 6 pt; longer lines stop with an actionable error. Existing non-Latin text support remains unchanged.

## Separate review after opening draft PR #349

The review covered PDF drawing bounds, page and progress totals, saved settings, preview invalidation, legend inclusion, preset backup scope and worker safeguards. Fixes and regression coverage:

- Corrected two-stitch overlap for the minimum 10-stitch custom page size.
- Derived legend row capacity from usable height, preventing clipping with 30 mm Letter margins; large Workshop knot keys now continue across pages with headings.
- Kept long branding inside margins by shrinking to a readable minimum or stopping with an explanation; moved large-margin cover metadata above its copyright/footer.
- Preserved older custom densities such as 88 × 99 and their existing snap-to-tens behaviour.
- Added chart-page selection to the illustration, absolute grid alignment on overlap pages, current settings validation and a visible Workshop/Pattern Keeper reminder. Preview selection clamps when chart dimensions change.
- Enforced branding exclusion and positive integer chart dimensions at the worker boundary. Chart-only exports retain all symbol checks.
- Made quick presets reset the Workshop theme, switched PDF presets back to PDF format, and cleared stale quick-preset highlighting after edits.
- Verified that a full preset store or failed browser storage write retains previously saved presets.

No unresolved implementation issues were identified in this pass. Real-device Pattern Keeper import remains the manual compatibility limit described above.

## Final validation results

- Full `npm test`: **359 suites passed; 4,941 tests passed; 4 existing tests skipped** (one skipped suite).
- PDF/preset, compatibility, backup and build checks: **36 suites / 482 tests passed**.
- Final review regression checks, including the last UI reminder and build fingerprints: **6 suites / 53 tests passed**.
- Frozen-clock PK baseline: **all six PDFs byte-identical** to revision `986fd1d2` (1, 100 and 112 threads, A4 and Letter).
- Actual example generation: all five PDFs matched the shared plan and final progress totals; `validation.json` records their options and counts.
- Required `verify-pdf-symbols.cjs`: generated 100/112-symbol PDFs at small, medium and large density and a 300 dpi colour/B&W contact sheet; visually checked.
- Desktop and 390 px mobile Chromium: save/update/apply lifecycle and live count verified; no horizontal overflow. Refreshed screenshots use the production Export component, isolated with representative pattern data and service workers blocked.
- Terminology lint, generated Creator/runtime bundles, service-worker fingerprints and `git diff --check` pass. CSS token lint reports pre-existing non-blocking warnings in unrelated styles.

Initial restricted-sandbox runs could not create the loopback WebDAV server or spawn the build-check subprocesses. Those checks were rerun with the required execution access and passed; they are not outstanding failures.
