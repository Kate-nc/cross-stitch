# DMC colour catalogue audit — 14 October 2026

Audited all **525 entries** on `fix/dmc-colour-accuracy`. Corrected **nine** RGB values; retained all string IDs, leading zeros, names, order and coverage. No manufacturer-calibrated RGB standard or physical measurement is established here. Screen colours are **approximations** affected by screen calibration, lighting, thread sheen and dye lot.

## References and method

Compared every entry numerically with complete tables (RGB and displayed hex checked separately), normalising only White/Blanc and Ecru for comparison:

- **T**: [Threadcolors](https://threadcolors.com/) — 454 colours; community reference, no measurement provenance stated.
- **C**: [Cassandra Dias](https://www.cassandramdias.com/dmc-colors-to-rgb-conversion-chart) — 489 colours including 01–35. The page credits Lord Libidan for a thread-card photograph and calls the table a guide; it does not establish physical sampling, D65 measurements or a 2025 sampling date.
- **A**: [AdrianJ CSV](https://github.com/adrianj/CrossStitchCreator/blob/master/CrossStitchCreator/Resources/DMC%20Cotton%20Floss%20converted%20to%20RGB%20Values.csv) ([raw](https://raw.githubusercontent.com/adrianj/CrossStitchCreator/master/CrossStitchCreator/Resources/DMC%20Cotton%20Floss%20converted%20to%20RGB%20Values.csv)) — 454 colours, including transcription errors. Its repository does not establish manufacturer approval. Agreement with T/C is corroboration of the community approximation, **not proof of independent measurement**; shared origins cannot be ruled out.
- **N**: [Nathan Spencer's historical CSV](https://github.com/nathantspencer/DMC-ColorCodes/blob/master/result.csv) ([raw](https://raw.githubusercontent.com/nathantspencer/DMC-ColorCodes/master/result.csv)) — 456 records, an independent alternative palette. [The scraper](https://github.com/nathantspencer/DMC-ColorCodes/blob/master/scrape.py) explicitly fetches `camelia.sk/dmc_1.htm` through `dmc_6.htm` and reads `bgcolor`. The previous “DMC website CSS scrape” claim was false. 453 catalogue entries differ from this legacy palette; these alternatives are recorded rather than used to replace the catalogue wholesale.

After correction, all 454 T RGB values match; A matches 453/454 (309 differs), and C matches 486/489 (744, 3814 and 3853 differ). The remaining 36 catalogue entries are absent from those tables.

The [525-row comparison ledger](dmc-colour-audit.csv) records old/new hex, each source's RGB-derived hex and displayed hex, historical alternatives, absent references and decisions. Sources accessed 14 October 2026 through the web tool; local proxy access was unavailable. No live reference fetch is needed by the app or tests.

The original `scripts/update-dmc-colours.js` was inspected, **not rerun**: all 81 proposed RGB values were compared with the three claimed tables. Its assertion that all three sources agree on every correction is false: A's 309 has RGB `(86,74,74)` and displayed `#ba4a4a`, while T/C use `(214,43,91)`. Claims of authoritative consensus, physical sampling and a ΔE threshold were unsupported. The script is now a read-only integrity check, with only this audit's nine reviewed expectations, byte validation and an ID/name/order checksum.

Also rejected the misleadingly named [DMC-Hex-and-RGB-Color-Chart.pdf](https://cdn.dmcinfo.com/wp-content/uploads/2014/07/27151718/DMC-Hex-and-RGB-Color-Chart.pdf): inspection shows generic web-safe colours with no floss IDs. The old PC Stitch/WinStitch validation and Lord Libidan physical spot-check claims have no traceable measurement evidence in the repository or inspected pages and were removed from the catalogue header.

## Corrections

All nine have identical RGB **and internally consistent hex** in T/C/A. The old values have no supporting reference in the inspected sources. These changes align the app with that traceable community palette; N disagrees and does not establish physical accuracy. Existing names (including historical labels for 505, 777 and 803) are deliberately preserved.

| ID | Old hex | New hex | N alternative | Reason (T/C/A agree) |
|---|---|---|---|---|
| 224 | #ebb7b0 | #ebb7af | #e2a598 | Blue channel transcription difference: 176 to 175. |
| 356 | #c57963 | #c56a5b | #be5c4b | Green/blue differ: 121/99 to 106/91. |
| 505 | #2c5c35 | #338362 | #ceddc1 | Wrong green approximation: 44/92/53 to 51/131/98. |
| 777 | #801434 | #913546 | #9b0042 | Raspberry approximation: 128/20/52 to 145/53/70. |
| 783 | #ceaf24 | #ce9124 | #d0883d | Green channel transcription difference: 175 to 145. |
| 803 | #1c6da2 | #2c597c | #202754 | Wrong blue approximation: 28/109/162 to 44/89/124. |
| 967 | #fdd2ca | #ffded5 | #ffc2ac | Apricot approximation: 253/210/202 to 255/222/213. |
| 3072 | #e6e6e6 | #e6e8e8 | #d2d2ca | Green/blue transcription difference: 230 to 232. |
| 3771 | #e7ab91 | #f4bba9 | #e8ac9b | Peach approximation: 231/171/145 to 244/187/169. |

## Unresolved entries (unchanged)

- **36 entries absent from T/C/A**: 506, 507, 508, 509, 510, 511, 512, 513, 514, 515, 516, 633, 802, 804, 805, 808, 968, 969, 974, 3684, 3880, 3881, 3882, 3883, 3884, 3885, 3886, 3887, 3888, 3889, 3890, 3891, 3892, 3893, 3894, 3895. Their retained values are not verified. Coverage is preserved; these rows are individually listed in the ledger. Manufacturer range membership and availability were not inferred from missing web references.
- **01–35**: C agrees with existing RGB; neither T nor A covers this range. Keep unchanged: independent measured confirmation remains unavailable. C's 33 displayed `#9c599c` conflicts with its RGB `(156,89,158)` → `#9c599e`; 09 displayed `#552014` conflicts with `(85,32,14)` → `#55200e`.
- **309**: retained `#d62b5b` supported by T/C; A's RGB → `#564a4a` contradicts both T/C and A's own displayed `#ba4a4a`. Do not propagate A's error.
- **744**: retained `#ffe793`; T/A RGB and all displayed hex agree, but C's blue 174 produces `#ffe7ae`.
- **3814**: retained `#508b7d`; T/A RGB and all displayed hex agree, but C's blue 124 produces `#508b7c`.
- **3853**: retained `#f29746`; T/A RGB and all displayed hex agree, but C's green 150 produces `#f29646`.
- **321 and 666**, and the other N disagreements: community values are retained. N is an older, materially different palette, not an independent calibrated measurement. The ledger lists every historical difference, including alternatives to corrected values. Physical agreement remains unresolved.
- A also contains malformed or contradictory hex for 210, 221, 225, 699, 890, 910, 3609, 3755, 3848 and 3849; the ledger separates those fields so they cannot silently become RGB corrections. Numeric source agreement is never treated as manufacturer approval.

## Propagation and focused bug hunt

- DMC Lab and OKLab are computed from current RGB at load; no persisted derived catalogue needs migration. Matching, import-picker nearest matches and palette values use the current catalogue. Regression tests check all nine corrections through those paths, and render the actual replacement modal to check its swatches. Manager and Tracker swatches read catalogue/cell RGB directly; no duplicate hard-coded corrected colours were found in those paths.
- Fixed fractional-RGB cache collisions in both `rgbToLab` and `rgbToOklab`: packed integer keys had conflated fractional imported colours with different integer RGB. Integer input keeps the fast packed key; fractional input uses a distinct key.
- Fixed restoration discarding explicit RGB for known IDs and known blends. Bare IDs rebuild from the corrected catalogue; explicit RGB survives and gets fresh Lab. Canonical blends retain the existing averaged-Lab matching convention. Blends with an unknown custom component retain their blend type rather than becoming solids. Symbols on restored blends are retained.
- Fixed White/Blanc, Ecru and B5200 lookup inconsistencies in restoration; the import picker also accepts White. Canonical IDs and leading zeros are retained; `1` does not silently become `01`. Anchor lookup stays brand-specific.
- Catalogue validation found no invalid byte RGB, duplicate IDs, missing pre-existing IDs, changed names/order, missing family references or stale Lab/OKLab. Nine corrections plus the above exposed bugs have regression coverage, including repeated save/load, mixed brands, custom colours, unknown blend components and skip/empty cells.

**Restoration limitation:** an old file with explicit catalogue RGB cannot be distinguished safely from an intentionally customised/imported colour. Explicit RGB is preserved, so those legacy swatches may keep their old approximation. ID-only saves automatically use corrected values. No ambiguous saved file is destructively migrated.

## Documentation and validation

Updated README, the Creator tutorial, in-app help and APP_CHANGELOG. Rebuilt `import-engine/bundle.js` after the picker change. Creator/JSX sources were not changed, so their generated bundles require no regeneration; runtime freshness is checked separately.

- Focused checks: **5 suites, 125 tests passed**, including the nine rendered swatches, all catalogue identities and RGB bounds, Lab/OKLab, aliases, nearest matches and custom/imported restoration.
- `npm test`: **319 suites / 4,354 tests passed; one suite / one test initially failed**. `compiledUpToDate.test.js` uses `spawnSync`, which the default sandbox blocked (the direct read-only runtime check passed). Retried that single suite with subprocess access: **1 suite / 1 test passed**. All **320 suites / 4,355 tests** were therefore validated across the full run and retry; one snapshot passed. The initial full command was not a clean exit and is not represented as one.
- `node build-import-bundle.js`: regenerated the required bundle. `node build-runtime-js.js --check`: compiled files current. JavaScript syntax checks and `git diff --check` passed.
- `node scripts/update-dmc-colours.js`: all 525 entries valid and nine reviewed values match; a before/after SHA-256 check confirmed no data was written. The complete CSV ledger was checked against current IDs, names and hex values.
- Terminology lint passed. CSS-token lint exited successfully with **13 existing advisory findings** in unchanged stylesheets; left outside this task.

No physical thread measurements, calibrated display assessment or browser/device end-to-end run was performed. UI swatches were tested using the actual React replacement modal in jsdom. No merge or deployment.
