# DMC colour calibration — 30 October 2026

The app's DMC colours matched [threadcolors.com](https://threadcolors.com/) exactly (454 of 454; see the [source audit](dmc-colour-audit.md)), and nothing in the app changes a colour between the catalogue and the screen. On screen, though, threads looked lighter and paler than the real floss. This calibration darkens the whole table with one tone curve and corrects 37 threads by a fixed rule. Thread IDs, names, order and coverage are unchanged (525 entries); 523 RGB values change (pure white B5200 and black 310 do not).

These are still screen approximations. None of the inputs is a calibrated physical measurement.

## Inputs

All inputs are in [dmc-colour-calibration.csv](dmc-colour-calibration.csv), one row per catalogue entry:

- **community_hex** — the table the app used up to this change (threadcolors.com and its copies). No measurement provenance is stated by its sources.
- **scan_hex** — the median colour of each swatch on a scanned DMC thread card (the 20-column card photographed by Lord Libidan, supplied by the project owner). 482 threads are on the card; `scan_card_column`/`scan_card_row` give each swatch's position. Each sample is an 11 × 38 px patch at the centre of the swatch, with the row grid fitted per column so no patch crosses a separator. The image itself is not committed. The scan is uncalibrated and compressed, and its medians include the small shadows between fibres, so it is used for direction, not copied in.
- **older_hex** — the older camelia.sk palette (Nathan Spencer's scrape, see the source audit), 454 threads. It does not share an origin with the community table.

No measured (spectrophotometer) DMC dataset was found. The other published tables checked, such as the R `dmc` package, carry the same community hex values.

## Findings

Against the scan, the community table is lighter at every lightness level: the scan is darker by 9.4 L* on average, with a median ΔE2000 gap of 10.3. The older palette agrees with the direction: it is closer to the scan than the community table is for 364 of 447 threads compared.

Most of the gap is one consistent shift, not scattered typos. A single tone curve explains about half of it, which suggests the community table was made from a brightened photograph or scan.

## Method

Run by [scripts/calibrate-dmc-colours.js](../scripts/calibrate-dmc-colours.js), using the app's own `rgbToLab`, `labToRgb` and `dE2000`.

1. **Tone curve.** Every channel becomes `255 × (v / 255)^1.3`. Gamma 1.4 fits the scan best (median ΔE 6.1) and 1.2–1.25 fits the older palette best (5.6). 1.3 sits between the two and improves the fit to both. 0 and 255 do not move, and no channel gets lighter. The plain curve also reduces hue error against both references (median 10.2° to 9.0° against the scan, 6.4° to 5.7° against the older palette); a hue-preserving variant was tried and fitted worse.
2. **Hand corrections.** A thread is corrected only when all three hold:
   - after the curve it is still at least ΔE 12 from the scan;
   - the older palette is closer to the scan than the curved value is;
   - the older palette differs from the curved value by at least ΔE 5.

   The new value is the Lab average of the curved value, the scan and the older palette. The last two conditions keep a scanner colour cast from moving a thread when only the scan disagrees. For example, the scan shows 740 Tangerine, 3842 Wedgewood Dk and 223 Shell Pink Lt much redder or bluer, but the older palette agrees with the curved value, so those keep the curve.

## Result

| | Before | After |
|---|---|---|
| vs scan, median ΔE2000 (482) | 10.3 | 6.4 |
| vs scan, 90th percentile | 17.5 | 10.5 |
| vs scan, mean lightness difference | −9.4 L* | −2.6 L* |
| vs older palette, median ΔE2000 (454) | 7.0 | 5.3 |
| vs older palette, 90th percentile | 12.9 | 10.3 |

### Hand-corrected threads (37)

| ID | Name | Community | Scan | Older palette | New |
|---|---|---|---|---|---|
| 333 | Blue Violet VDk | `#5c5478` | `#322882` | `#6e2e9b` | `#4e327f` |
| 340 | Blue Violet Med | `#ada7c7` | `#6c73c3` | `#996dc3` | `#8c7cc0` |
| 470 | Avocado Lt | `#94ab4f` | `#627523` | `#72813e` | `#718533` |
| 500 | Blue Grn VDk | `#044d33` | `#0e1b18` | `#1d362a` | `#112d20` |
| 553 | Violet | `#a3638b` | `#683d87` | `#a449ac` | `#8a468d` |
| 580 | Moss Grn Dk | `#888d33` | `#4f5515` | `#355f0b` | `#526315` |
| 581 | Moss Green | `#a7ae38` | `#707820` | `#838a29` | `#828a25` |
| 680 | Old Gold Dk | `#bc8d0e` | `#9f5e30` | `#b07b46` | `#a9702e` |
| 729 | Old Gold Med | `#d0a53e` | `#c07438` | `#ce9657` | `#c6893e` |
| 730 | Olive Green VDk | `#827b30` | `#4b3c0c` | `#63520b` | `#5d5012` |
| 732 | Olive Green | `#948c36` | `#645311` | `#725c0c` | `#716115` |
| 733 | Olive Green Med | `#bcb34c` | `#977b2a` | `#a78a44` | `#a38d37` |
| 780 | Topaz UVDk | `#94631a` | `#872f15` | `#945026` | `#894419` |
| 783 | Topaz Med | `#ce9124` | `#ca6226` | `#d0883d` | `#c97729` |
| 824 | Blue VDk | `#396987` | `#122e66` | `#284779` | `#214270` |
| 825 | Blue Dk | `#4781a5` | `#1d3f7a` | `#34588f` | `#2c5589` |
| 829 | Golden Olive VDk | `#7e6b42` | `#603412` | `#64480c` | `#644519` |
| 830 | Golden Olive Dk | `#8d784b` | `#593915` | `#6e501d` | `#6a4d22` |
| 831 | Golden Olive Med | `#aa8f56` | `#76501b` | `#7c5f20` | `#836228` |
| 832 | Golden Olive | `#bd9b51` | `#905e22` | `#9c7230` | `#9e722e` |
| 926 | Gray Green Med | `#98aeae` | `#647974` | `#617674` | `#6d8381` |
| 956 | Geranium | `#ff9191` | `#f52e73` | `#f7566d` | `#f95973` |
| 957 | Geranium Pale | `#fdb5b5` | `#f573ab` | `#fd99af` | `#fa90aa` |
| 970 | Pumpkin Lt | `#f78b13` | `#f64530` | `#fb6721` | `#f86222` |
| 995 | Elec Blue Dk | `#2696b6` | `#116ccd` | `#0061b0` | `#156fb6` |
| 3011 | Khaki Dk | `#898a58` | `#544822` | `#655935` | `#645c32` |
| 3012 | Khaki Med | `#a6a75d` | `#766838` | `#8b7b4e` | `#867d44` |
| 3688 | Mauve Med | `#e7a9ac` | `#cb5984` | `#dc7c86` | `#d8798c` |
| 3705 | Melon Dk | `#ff7992` | `#f42440` | `#f2494f` | `#f84859` |
| 3706 | Melon Med | `#ffadbc` | `#f64f81` | `#fd6e70` | `#fc7489` |
| 3708 | Melon Lt | `#ffcbd5` | `#f676a9` | `#fda0ae` | `#fc9db6` |
| 3765 | Peacock VDk | `#347f8c` | `#215585` | `#175e78` | `#1f5e7b` |
| 3829 | Old Gold VDk | `#a98204` | `#954e22` | `#a7671d` | `#9b6019` |
| 3844 | Bright Turq Dk | `#12aeba` | `#1182bb` | `#1f7fa0` | `#1889ac` |
| 3845 | Bright Turq Med | `#04c4ca` | `#24a7d7` | `#2badd1` | `#21aecc` |
| 3846 | Bright Turq Lt | `#06e3e6` | `#46c7eb` | `#5eccec` | `#44cfe7` |
| 3850 | Bright Grn Dk | `#378477` | `#278655` | `#208b46` | `#267f54` |

The 43 catalogue entries absent from the card (for example 506–516, 633, 802–808, 3880–3895) receive the curve only.

## Effects in the app

- **Saved projects.** Cells saved by thread ID (all current saves) show the new colours when reopened. Older files that stored explicit RGB for a catalogue thread keep their saved colour, as before; see the restoration limitation in the source audit.
- **Converting pictures.** Pictures are matched against the new colours, so the same picture may choose different threads than before, generally a lighter thread for a given picture colour, because each thread's screen colour is now darker. This is the intended effect: the chart preview now looks like the stitched piece.
- **Colour family chips** (All DMC filter). The chips classify by Lab hue and lightness, so 49 borderline threads move chip, mostly by a few degrees: for example several Topaz and Old Gold threads from Yellows to Oranges, several pinks to Reds as they get darker, 336 and 939 Navy to Purples, and 347 Salmon VDk and 817 Coral Red VDk to Oranges (hue 35–36°, just over the 35° red/orange line). The classifier is unchanged.
- **PDF export.** Key swatches use the catalogue RGB, so their printed colours are darker. Pattern Keeper compatibility checks pass unchanged; symbols, codes and layout are unaffected.
- **Anchor** colours are not changed by this calibration. Anchor and DMC share the same kind of community source and may be similarly light. DMC↔Anchor conversion uses a fixed ID table and is unaffected.

## Tests changed with the data

Fixtures that sat on a colour boundary were moved so each test still checks the same behaviour with the new values, without loosening an assertion except one:

- 317 + 3799 blend tests: the blend's grey moved from 87 to 64; fixtures use grey 63, where the blend matches within ΔE 0.3 and 3799 is still the nearest single thread.
- Sky-blue ΔE2000-versus-Lab test uses `rgb(72,136,248)` (margins 3.6 both ways); orphan guard uses 321 / 606; rare-colour fold uses 435 as the brown; anti-speck dither searches greys between its two threads; nearest-threads uses 666.
- **Logo budget** (`tests/logoThreadBudget.test.js`): the logo has white lettering enclosed in navy. With the old colours its pixels folded into grey 03; now 10 pure-white pixels keep white B5200 and the other lettering pixels map to grey 168. The assertion is narrowed from "no white thread at all" to "white thread only where the source pixel is white", which still catches background edges and fringing. The 5-thread limit, coverage and confetti checks are unchanged.
- `tests/dmcColourAudit.test.js` checks that every shipped value equals the script's output, that the curve never lightens, and that hand corrections need both references.

## Regenerating

```
node scripts/calibrate-dmc-colours.js --check   # CI-style check
node scripts/calibrate-dmc-colours.js --write   # after changing the CSV inputs or constants
node build-sw.js                                # dmc-data.js is precached
```

Do not hand-edit `DMC_RAW`. To correct a thread, change its inputs in the CSV (for example a better scan sample) or the rule, and regenerate. Best next evidence: a photograph of physical threads beside a colour checker card under daylight, which would give calibrated values.
