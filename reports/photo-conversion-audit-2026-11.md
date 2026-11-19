# Photo conversion audit (combined)

18 November 2026, stitchx 1.0.253 (commit `34cd287`). Two audits of turning a photo into a
chart were made independently on the same code:

- **Audit A**: this repository's own audit. It measured the pipeline on ten photos, listed
  the assumptions it makes and compared other tools.
- **Audit B**: a second agent's report. It traced the Creator path and the Tracker import,
  built small test fixtures and ran spot checks on three photos.

Every claim from both was checked again for this combined report: in the code, by rerunning
B's fixtures and spot checks, and against other tools' published pages where they could be
reached. The **Checked** column says how. No app code is changed by this report.

Earlier work: [photo-conversion-accuracy-review.md](photo-conversion-accuracy-review.md) and
[photo-conversion-accuracy-audit.md](photo-conversion-accuracy-audit.md) (October), and the
[DMC colour calibration](dmc-colour-calibration.md).

**Status (implemented on `claude/trusting-volta-1bnstq`):** recommendations 1 to 4.
- **Edge-shade fold off for photos** (`stitchCleanup.foldEdgeShades`, false at every Photo
  step; unset in older saves, so they fold as before). Measured on the ten photos with the
  shipped code: Balanced colour error 5.27 to 4.74, boundary error 7.18 to 6.16, confetti
  3.8% to 4.9%. Every Photo step gained accuracy; the figures in `STITCH_STYLES` are
  updated.
- **Background:**
  - for a photo, removal is offered in a toast instead of applied;
  - the Background step counts the unstitched stitches and can mark them on the preview;
  - Brightness, Contrast and Saturation now apply after the mask (in the pipeline, not
    `gridPixels`);
  - only a genuinely see-through stitch (alpha below 128) switches colour removal off.

  The crop fixes (recommendation 6) came with `main`'s Frame the picture. The ΔE2000
  tolerance is done since (see below).
- **Wording:** *Stitch Cleanup* text follows the picture type and says what Off still
  changes; the tidied count is now exactly what Reduce confetti changed (`tidiedCells`).
- **Blends** are mixed as light everywhere a blend's colour is worked out
  (`blendThreadRgb`), including saving and restoring. A saved colour equal to the old
  stored-value average is recognised and updated.

**Also implemented on this branch since:**
- the *At stitch size* comparison and finished sizes in Compare options (recommendation 7);
- the browser tests running in CI;
- *Colours to keep* (recommendation 10): pick a colour on the preview and its nearest thread is always in the palette, never folded away, and kept through the thread limit. On the test portrait, keeping one skin thread (DMC 841) lowered the face's colour error from 5.56 to 5.05 (mean of four seeds), with the whole picture 4.72 to 4.66.
- **Steadier conversions** (after a stitcher found that Sharpen details, and leaving the
  background out or putting it back, changed the colours of unrelated parts of the pattern):
  - *Background:* the whole picture is converted first (threads, matching, cleanup and the
    thread limit) and the background left out last (`blankUncovered`). Before, the threads
    were chosen again from the subject alone, from a random start, and toggling the
    background changed the thread of about 45% of the subject's stitches, the same as a new
    random start. Now only stitches beside the background change: 1 to 3.5% of the stitched
    area on three photos and 4% on the logo, all within two stitches of the background. A stitch
    at the edge that is a blur of the background and the subject takes the subject's thread,
    and a pale edge drawn in the background's own thread takes the neighbouring subject
    thread. The background is never left out by default: a plain border, for a logo too, is
    only offered. (At `HEAD` before this, the logo's small white lettering came out white
    with the background in and grey, DMC 168, with it out; it is now white either way.)
  - *Palette start:* without a Variation seed, k-means starts from the picture's own main
    colours (greedy over OKLab bins), so the same settings always give the same pattern;
    centres move freely before snapping to threads. Colour error on the ten photos is
    unchanged (4.71 to 4.75). This replaces recommendation 9's best-of-several starts.
  - *Sharpen details:* the threads are chosen from the stitches before sharpening. With the
    old Sharpen, on a 200-pixel picture, that cut the stitches it changed from 28.5% to 8.0%.
  - *Sharpen details at stitch size* (`sharpenStitches`, colour-utils.js), replacing the
    unsharp mask on the full picture. A stitch on a blurred edge (between its two most
    different neighbours, off-centre) takes the colour of the nearer side. On the ten photos
    at 100 stitches, Amount 50%:

    | | Old Sharpen, 200-pixel picture | Old, full-size picture | Stitch-level, either |
    |---|---|---|---|
    | Edge contrast (none: 18.7) | 20.7 | 19.3 | 20.5 to 20.8 (shading on or off, either size) |
    | Stitches with a colour not beside them | 5.2% | 1.9% | 0% |

    It sharpens a big photo as much as a small one; the old one was averaged away. It
    changes 9% of the stitches without shading (95% of them beside a stitch it sharpened)
    and 14% with shading (84%: shading carries some changes further). Colour error against
    the unsharpened picture rises 4.74 to 4.90, as any sharpening must; on average one
    thread of the final pattern differs, a rarely used one dropping out. The background
    mask no longer depends on it: sharpening comes after.
- **How close a match in ΔE2000** (`prepareConversionPixels`, `BG_TOLERANCE_DEFAULT`):
  the tolerance was ΔE76, which doesn't weigh differences as they look. Its default, 15,
  is ΔE2000 9 for a shade of white that much darker, 9.5 to 10 for pale greys and
  creams, 13.5 for mid grey, but 3.1 to 3.2 towards a more or less saturated version of
  a saturated yellow or red. The default is now ΔE2000 9 (a white background is left out
  exactly as before); the slider runs 1 to 30. Saved projects and drafts carry
  `bgThUnit: 'de2000'`; without it, `bgToleranceFromDE76` converts the saved value for the
  saved background colour along lightness (the mean ΔE2000 of a shade that much lighter
  and darker), so what a lighter or darker shade left out before it leaves out now. The
  stripe fixtures (240 border) behave as before at the default: 225, 215 and 205 go
  (ΔE2000 3.2, 5.5, 7.9), 195 stays (10.3).
  - Global changes such as Brightness +3 still change many stitches (52% before, 47% now;
    13 to 19% even with the palette held fixed), because they really do change the colours.

## Summary

1. **Background removal can erase part of the subject, or silently not run (B).** It is
   switched on automatically whenever the picture's border is plain, photos included.
   Several problems follow:
   - It removes everything joined to the border within ΔE76 15. A pale stripe 12 L* darker
     than a pale background was erased with it.
   - A single pixel with alpha 254 anywhere turns the colour removal off for the whole
     picture, while the control still shows it as on.
   - The mask is tested after brightness, contrast and saturation, so moving those sliders
     moves the mask.
2. **The edge-shade fold costs photos the most accuracy (A).** It is meant to remove blurry
   in-between shades around logos, and its code assumes photos are left alone. In fact it
   changes 11% of every photo's stitches, and it runs even at *More detail* (B). Turning it
   off for photos lowers colour error from 5.32 to 4.77, and boundary error from 7.23 to
   6.15. That beats every variant B tested, on B's own photos too.
3. **The cleanup labels and the "tidied" count say more than the code does (B).**
   - *Stitch Cleanup* Off says "every stitch stays exactly as matched", but the rare-colour
     fold and the thread caps still change stitches.
   - The tidied count misses the folds, and counts later changes as tidying.
4. **"Fuzzy" has three causes, and each needs its own fix (A and B):**
   - the grid is too coarse for the detail, which no setting can recover;
   - each stitch is the average of what it covers, so outlines blur by up to a stitch;
   - the fold then makes some edges blocky.

   *Sharpen details* and *Soften* both make things worse. B suggests showing the photo at
   stitch size beside the chart, so a user can see where detail was lost. A's prototype
   "dominant colour" shrink makes outlines visibly crisper.
5. **The thread range and blend maths limit accuracy (A, confirmed by B for blends).**
   - Even with all 525 DMC threads, a quarter of photo stitches have no thread within ΔE 5.
     The gaps are muted greys, olives, browns and skin.
   - Blends close most of that gap, but their colours are worked out in gamma space, which
     predicts them too dark (more than ΔE 2 off for 13% of pairs).
6. **Previews and side paths don't always match Generate (B, A).**
   - With stash-only on and an empty stash, the preview uses the full catalogue, while
     Generate refuses.
   - The stash gallery runs at 2,500 cells and skips look-alike separation; its "threads"
     figure is really a symbol count.
   - The Tracker's picture import is a separate, noisier pipeline that also skips white
     anywhere in the picture.

## How the two audits compare

| Topic | Audit A | Audit B | Checked | Verdict |
|---|---|---|---|---|
| Background removal: subject loss, alpha bypass, mask after adjustments | Noted only the ΔE76 tolerance | **Found all three** | Fixtures rerun, code read | **B correct.** A missed it |
| Edge-shade fold on photos | **Main accuracy cost, 11% of stitches** | Noted it runs at *More detail*, treated as a labelling issue | Measured on all ten photos and on B's three | **A's stronger conclusion holds**; B's spot checks agree |
| Cleanup labels, tidied count | Not covered | **Found** | Code read | **B correct** |
| Grid size limits detail | Mentioned | **Diagnostic view and size comparison** | B's 150-stitch rows rerun | Agree; B's suggestion is new |
| Averaging blurs edges; Sharpen doesn't help | **Measured, crisp-edge prototype** | Not covered | Measured | A |
| Soften hurts | Carried over from October | Spot-checked | Rerun on three photos | Agree |
| Palette by area; faces | Carried over from October; eyedropper suggestion | Subject weighting or pinned threads | Code | Agree |
| Blends averaged in gamma space | **Measured on all 18,174 pairs** | Noted | Measured | Agree |
| Thread range sets an accuracy floor | **Measured** | Says physical validation is needed | Measured | Agree, complementary |
| Preview, gallery and stash parity | Not covered | **Found** | Code read | **B correct** |
| Crop edge cases | Not covered | **Found** | Code read | **B correct** |
| Tracker import differs | Second pipeline, no cleanup | Also skips white anywhere | Code read | Both correct |
| Palette seed, saliency map, fabric colour ignored | **Found** | Not covered | Measured or code read | A |
| Spot-check numbers | — | 18 rows | **All 18 reproduced exactly** with the shared harness | B's numbers stand |
| Competitor features | WinStitch, cstitch, KG-Chart, Stitch Fiddle, mySewnet | Pic2Pat, FlossCross, StitchXCross, Stitch Fiddle, Pixel-Stitch | Web search; some sites unreachable | Partly checked: see [Other tools](#other-tools) |

Where they differ, B recommends measuring before changing the Photo preset. That measurement
has now been done for the fold, on both audits' photos (finding 2). B's broader test set is
still worth running before shipping: faces, low light, fine lines, transparency, and stitchers
comparing previews.

## The assumptions the conversion makes

| # | Assumption | Where | Holds? | Evidence |
|---|---|---|---|---|
| 1 | The picture is sRGB | Browser canvas | Mostly | Browsers convert embedded profiles to sRGB on a canvas; wide-gamut (Display P3) phone photos lose their most saturated colours. HEIC opens only where the browser can decode it. |
| 2 | Shrinking a large upload to about 4 megapixels loses nothing that matters | `useProjectIO.js` | Mostly | Files over 2000 × 2000 or 5 MB are shrunk and kept as PNG. Crop then works on that copy, so a tight crop of a large photo has fewer pixels to work with (B). At 2000 pixels there are still 4 pixels per stitch even at 500 stitches. |
| 3 | A plain border means a background to leave unstitched, for any picture type | `examinePicture`, `detectUniformBorder` | **Not safely** | Auto-applied on upload, with an Undo toast. The border is plain when 85% of the outer 2% is within ΔE76 8 of one colour (finding 1). |
| 4 | Everything joined to the border within ΔE76 15 is background | `prepareConversionPixels` | **No** | A pale stripe up to 12 L* darker is erased; it survives only at 16 (finding 1). ΔE76 is also the only colour test not in ΔE2000. |
| 5 | Any partial transparency means the picture has its own mask | `prepareConversionPixels` | **No** | One pixel at alpha 254 switches colour removal off for the whole picture (finding 1). Opaque photos never trigger it: averaging keeps alpha 255 (0 of 231,828 stitches tested). |
| 6 | The background colour and the pixels it is tested against are in the same state | `gridPixels` then the mask | **No** | The colour comes from the source; the stitches it is compared with have brightness, contrast and saturation applied (finding 1). |
| 7 | A stitch shows the light-average of the picture under it | `gridPixels`, `linearAreaDownscale` | Yes, physically | Correct as light; reads as soft at edges (finding 4). |
| 8 | Stitches are square, one full cross per pixel | Everywhere | Yes for Aida and evenweave over two | |
| 9 | A thread looks like its catalogue RGB | `dmc-data.js` | Approximately | Calibrated against a scanned card, not measured. Floors every accuracy number (finding 8). |
| 10 | Two threads in one needle look like the average of their stored RGB values | `makeThreadBlend` | **No** | Strands mix as light; mean error ΔE 1.1, 13% over 2 (finding 9). |
| 11 | ΔE2000 under D65 is how different two colours look | Matching, palette | Yes | |
| 12 | The edge-shade fold leaves photos alone | `mergeEdgeBlendColours` comment | **No** | Changes 11% of photo stitches, at every Photo step except *Easiest* (finding 2). |
| 13 | *Stitch Cleanup* Off means stitches stay as matched | `ConvertPanel.js` text | **No** | The rare-colour fold and caps still run (finding 3). |
| 14 | The "detail" map separates flat areas from detailed ones | `generateSaliencyMap` | **No** | Mean 0.81 on photos; only 13% of stitches count as flat (finding 11). |
| 15 | One random palette start is good enough | `quantizeConstrained`, seed 1337 | Partly | Colour error 5.21–5.34 over six seeds; 1337 gives 5.32 (finding 10). |
| 16 | Threads should go to the largest areas | k-means | Partly | Faces get leftover threads (finding 12). |
| 17 | The fabric colour does not affect the conversion | Not passed to the pipeline | **No** | Fabric-coloured areas inside the picture are stitched (finding 13). |
| 18 | A preview or thumbnail shows the chart Generate makes | Preview, gallery | Mostly | The main preview and Generate share the worker; the exceptions are in finding 5. |
| 19 | The Tracker's picture import gives the Creator's chart | `parseImagePattern` | **No** | Separate pipeline; skips near-white anywhere (finding 7). |
| 20 | A crop keeps the chart within its limits and refreshes the picture's analysis | `applyCrop` | **No** | The locked height has no 500 maximum; the picture type and border are not re-examined (finding 6). |

## How this was checked

- **Code:** every path from a picture to stitches. That covers upload and crop, the
  picture-type guess and presets, `gridPixels`, the shared pipeline
  (`creator/generate.js` and `generate-worker.js`), the preview, the stash gallery, and the
  Tracker's `parseImagePattern`.
- **Measurements:** the harness in `scripts/conversion-accuracy/` runs the real worker in
  Node on ten standard photos, at 100 stitches on the long side unless stated. This audit's
  scripts, including B's background fixtures, are in
  [`scripts/conversion-accuracy/audit-2026-11/`](../scripts/conversion-accuracy/audit-2026-11/README.md).
  The measures:
  - **Colour error:** mean ΔE2000 per stitch against the photo's light-average.
  - **Viewed error:** the same after blurring by one stitch.
  - **Boundary error:** colour error on strong edges only.
  - **Confetti:** stitches with no same-colour neighbour.
  - **Small patches:** stitches in same-colour patches of 1 to 3.
- **Limits:**
  - The reference is the photo averaged per stitch, in the app's own thread colours. Crisper
    methods therefore score worse by construction, and catalogue errors are invisible.
  - Nothing was checked in a real browser, on a phone, or against stitched fabric. B could
    not start Chromium; A did not try.

## Findings

Grouped as B suggests: what undermines trust first, then accuracy.

### Trust and correctness

#### 1. Background removal (B; confirmed)

On upload, `examinePicture` calls `autoSkipBackground` for every picture whose border is
plain, photos included (a toast offers Undo). Then `prepareConversionPixels` removes every
stitch joined to the border within ΔE76 `bgTh` (15) of the border colour.

Fixtures rerun (7 × 7, pale grey 240 border, stripe through the middle touching both edges):

| Stripe | ΔE76 from border | Stitches kept |
|---|---|---|
| 225 | 5.3 | 0 of 49 |
| 215 | 8.8 | 0 of 49 |
| 205 | 12.4 | 0 of 49 |
| 195 | 16.0 | 7 of 49 (the stripe) |
| 225, one corner pixel alpha 254 | — | 49 of 49: colour removal off |

- **Pale subjects:** a pale shirt, white hair or a light object touching a pale studio
  backdrop goes with the background.
- **Partial transparency:** any pixel below alpha 255 sets `hasTransparency`, which skips the
  colour removal entirely. The *Leave background unstitched* control still shows as on.
  Averaging an opaque photo never causes this.
- **Adjustments move the mask:** the background colour is taken from the source (the
  automatic check and the eyedropper `srcClick`). The stitches it is compared with have
  already had brightness, contrast and saturation applied in `gridPixels`.

**Fix:**
- For photos, suggest background removal instead of applying it, and show the mask in the
  preview before it is used.
- Compute the mask from the unadjusted stitch colours.
- Make "use the picture's transparency" and "remove a colour" separate choices.
- Measure the tolerance in ΔE2000 (about 8 to 10 matches today's neutrals); this needs a
  migration for saved `bgTh`.
- Tests: the stripe, alpha 254 and 127/128, a white highlight inside the subject, and a
  brightness change with an unchanged mask.

#### 2. The edge-shade fold damages photos (A; confirmed on B's photos too)

`mergeEdgeBlendColours` was written for logos. It folds colours that are under 5% of the
stitches and lie mostly along other colours, assuming photos have none. With a 24-thread
photo palette and shading, nearly all of them do. It runs whenever *Stitch Cleanup* is on,
which for photos is every step except *Easiest to stitch*.

| Photo | Stitches the fold changes | Threads it removes entirely |
|---|---|---|
| chelsea (cat) | 19.5% | 2 |
| kodim15 | 17.6% | 4 |
| kodim23 (parrots) | 12.6% | 2 |
| astronaut (portrait) | 12.5% | 4 |
| rocket | 6.1% | 1 |
| **mean of 10** | **11.2%** | **2.2** |

What each stage costs (ten photos, everything else at the Photo default):

| Configuration | Colour error | Viewed error | Boundary error | Confetti | Small patches |
|---|---|---|---|---|---|
| **Photo default (Balanced)** | 5.32 | 3.36 | 7.23 | 3.98% | 8.60% |
| Default without the fold | **4.77** | **2.96** | **6.15** | 5.06% | 10.94% |
| Shading off, without the fold, Reduce confetti 2 | 4.70 | 3.12 | 6.05 | 4.86% | 9.94% |
| Shading on, Stitch Cleanup off | 4.57 | 2.68 | 5.72 | 12.64% | 23.73% |
| Plain matching (no shading, no cleanup) | 4.46 | 2.92 | 5.61 | 10.33% | 18.08% |
| More detail | 5.18 | 3.12 | 6.88 | 9.03% | 17.14% |
| Tidier | 5.55 | 3.48 | 8.09 | 0.14% | 5.68% |
| Easiest to stitch | 5.91 | 4.02 | 9.11 | 0.10% | 1.10% |

B's spot checks, rerun, with one row added. Confetti and small patches are measured on the
finished chart:

| Photo | Grid | Variant | Colour error | Boundary error | Confetti | Small patches | Threads / symbols |
|---|---|---|---:|---:|---:|---:|---:|
| Portrait | 100 × 100 | Balanced | 5.73 | 9.25 | 5.51% | 10.51% | 24 / 35 |
| Portrait | 100 × 100 | More detail | 5.52 | 8.89 | 8.66% | 15.96% | 24 / 36 |
| Portrait | 100 × 100 | Tidier | 6.09 | 10.52 | 0.80% | 6.04% | 24 / 32 |
| Portrait | 100 × 100 | Gaussian Soften 1 | 6.73 | 11.96 | 3.67% | 8.44% | 22 / 34 |
| Portrait | 100 × 100 | 40-thread cap | 5.29 | 7.89 | 6.49% | 12.44% | 25 / 37 |
| Portrait | 100 × 100 | **Balanced, no fold** | **4.59** | **6.26** | 6.72% | 13.02% | 24 / 36 |
| Portrait | 150 × 150 | Balanced | 5.16 | 8.55 | 4.92% | 9.46% | 24 / 36 |
| Cat | 100 × 67 | Balanced | 5.41 | 6.36 | 1.55% | 4.30% | 13 / 18 |
| Cat | 100 × 67 | More detail | 5.21 | 5.64 | 7.94% | 15.25% | 13 / 22 |
| Cat | 100 × 67 | Tidier | 5.40 | 6.60 | 0.21% | 5.37% | 13 / 21 |
| Cat | 100 × 67 | Gaussian Soften 1 | 5.75 | 8.79 | 0.48% | 1.34% | 15 / 23 |
| Cat | 100 × 67 | 40-thread cap | 5.56 | 6.12 | 2.04% | 4.88% | 16 / 23 |
| Cat | 100 × 67 | **Balanced, no fold** | **4.70** | 5.78 | 2.60% | 7.64% | 13 / 22 |
| Cat | 150 × 100 | Balanced | 5.18 | 5.90 | 1.43% | 3.89% | 15 / 23 |
| Motorbikes | 100 × 67 | Balanced | 6.36 | 7.08 | 8.99% | 18.78% | 21 / 28 |
| Motorbikes | 100 × 67 | More detail | 5.85 | 6.40 | 19.03% | 34.06% | 21 / 33 |
| Motorbikes | 100 × 67 | Tidier | 6.98 | 8.14 | 2.60% | 11.06% | 21 / 22 |
| Motorbikes | 100 × 67 | Gaussian Soften 1 | 8.33 | 10.98 | 3.34% | 9.25% | 22 / 34 |
| Motorbikes | 100 × 67 | 40-thread cap | 6.56 | 7.55 | 7.88% | 16.28% | 18 / 27 |
| Motorbikes | 100 × 67 | **Balanced, no fold** | 6.08 | 6.71 | 10.88% | 22.91% | 21 / 29 |
| Motorbikes | 150 × 100 | Balanced | 6.41 | 7.31 | 8.18% | 16.33% | 24 / 36 |

On the portrait, removing the fold does more than a 40-thread cap or a 150-stitch grid. On
the busiest photo (motorbikes) it costs a few points of confetti; the *Tidier* step can win
those back.

![Astronaut: photo at stitch size, Photo default, without the fold, shading off without the fold, plain matching](photo-conversion-audit-2026-11/astronaut.png)

Left to right: photo at stitch size; Photo default; without the fold; shading off, without the
fold; plain matching. In the default, the white shuttle breaks into black and white blocks and
the dark collar is blocked in.

![Parrots, same five panels](photo-conversion-audit-2026-11/kodim23.png)

**Fix:** run the fold for Graphic and Pixel art only, for example with a `foldEdgeShades`
flag in `PICTURE_PRESETS`, passed through both pipelines. Then re-measure the style steps and
update their figures and descriptions.

#### 3. Cleanup labels and the tidied count (B; confirmed)

- **What Off promises:** *Stitch Cleanup* Off says "Off: every stitch stays exactly as
  matched" (`ConvertPanel.js`). Several stages still change stitches:
  - the automatic rare-colour fold (colours under 0.5% of stitches, 2 to 15 stitches);
  - a user-set minimum per colour, which has no contrast guard;
  - *Threads (max)* and the blend limit.
- **The tidied count** (`usePreview.js`) compares `preCleanupIds` with the final chart.
  - The snapshot is taken inside Reduce confetti, *after* the rare-colour and edge-shade
    folds, so the fold's 11% is never shown.
  - It is compared with the chart *after* look-alike separation and the thread limit, so
    those changes count as tidying.
  - At Reduce confetti 0 there is no snapshot at all, so *More detail* reports nothing while
    the fold changes about one stitch in nine.

**Fix:**
- Reword the Off text now ("Stitches are only changed to fit the thread limit and to merge
  very rare colours").
- Record a snapshot after matching and one per stage, and report each stage's changes
  separately.
- Use a one-stitch accent fixture to test which stages can change it.

#### 4. Why charts look fuzzy, and how a user can tell why (A and B)

Three causes, in order:

1. **The grid is too coarse for the detail (B).** At 100 stitches across, the test portrait's face is
   about 13 stitches wide. An eye or whisker thinner than a stitch is averaged away before any thread
   is chosen. No setting recovers it.
2. **Averaging blurs edges (A).** A stitch straddling an edge becomes an in-between colour, so
   every outline gains a one-stitch band. This is correct to the light, but it reads as
   soft. The flat preview draws stitches crisply (`image-rendering: pixelated`), so the
   preview itself is not the cause.
3. **The fold makes edges blocky (A):** see finding 2.

*Sharpen details* and *Soften* do not help (Sharpen as it was then; it now works at
stitch size, see Status):

| | Colour error | Viewed error | Boundary error |
|---|---|---|---|
| Photo default | 5.32 | 3.36 | 7.23 |
| Sharpen details 0.5 | 5.45 | 3.52 | 7.55 |
| Sharpen details 1.0 | 5.67 | 3.82 | 8.04 |
| Soften, Gaussian 1 (change on B's three photos) | +1.1 | not measured | +3.0 |

**Fixes:**

- **Show where detail went (B).** Add *At stitch size* to Convert's comparison: the photo
  sampled one pixel per stitch, beside the chart, at the same zoom. If a feature is already
  gone there, crop tighter or enlarge the grid; if it survives sampling but not the chart,
  look at the palette, shading and cleanup.
  - Offer two or three sizes side by side, with finished size, stitch count and time. On the
    portrait, 150 stitches lowers colour error from 5.73 to 5.16, at 2.25 times the
    stitches.
  - Convert has no such view today.
- **Crisp edges (A).** A prototype "dominant colour" shrink splits the pixels under each
  stitch into two groups. When they are clearly different (ΔE over 12) and one covers at
  least 60%, the stitch takes that group's colour; otherwise it takes the average, as now.
  - 16% of photo stitches take a side, and outlines are visibly crisper.
  - It scores worse (5.23 against 4.70) because the reference *is* the averaged photo, so
    stitchers need to compare real charts.
  - cstitch offers a similar choice ("Median" and "Mode" squaring).

![Motorbikes: photo at stitch size, current shrink, dominant-colour shrink](photo-conversion-audit-2026-11/crisp-kodim05.png)

Left to right: photo; light-average shrink; dominant-colour shrink. Both use shading off and
no fold.

#### 5. Previews, the stash gallery and the empty stash (B; confirmed)

The main preview and Generate share the worker at full size, so they match. The exceptions:

- **Empty stash:** with stash-only on and an empty stash, `conversionSettings` sends no
  palette, so the preview uses the full catalogue. Generate stops with "Your stash is empty".
- **Stash gallery** (`generateGallery`):
  - thumbnails are made at most 2,500 cells, and Reduce confetti's sizes are counted in
    stitches, so a thumbnail is tidied more than its chart;
  - it skips look-alike separation;
  - its count is the number of distinct thread or blend IDs, so a blend counts as one and
    its two threads are not counted. It is a symbol count, labelled as threads.
- **Without workers** (opened from `file://`), the preview is capped at 40,000 stitches and
  its counts are scaled up. They are labelled as estimates.

**Fix:**
- Make the empty-stash preview say what Generate will say.
- Label gallery thumbnails as previews, and recompute the chosen one at full size.
- Count threads and symbols with `creatorThreadCounts`.

#### 6. Crop (B; confirmed)

`applyCrop` (`useCanvasInteraction.js`) has four problems:
- With the aspect lock on, it sets the height to `max(10, round(width / ratio))` with no
  500-stitch maximum. A 10:1 tall crop of a 100-wide chart asks for 1,000 rows.
- It does not re-run the picture check, so a crop that removes the plain border keeps the
  background removal decided for the uncropped picture.
- It crops the working copy (at most about 4 megapixels).
- It can't be undone back to the original.

**Fix:**
- Reuse the size helper that keeps both sides within 10 to 500.
- Re-examine the cropped picture, keeping settings the user changed.
- Crop from the original upload where it is still in memory.

#### 7. The Tracker's picture import (A and B; confirmed)

`parseImagePattern` shares shrinking and matching. It does not run:
- the rare-colour fold;
- the edge-shade fold;
- Reduce confetti;
- the thread and blend limits.

It also shades at full Atkinson strength. Its *skip white background* option leaves out any
stitch within ΔE76 `bgThreshold` of pure white *anywhere*, including highlights inside the
subject. It decides this after the palette is chosen, so white can still take a thread slot.

**Fix:** decide which differences are intended, then route it through `runCleanupPipeline`
and the Creator's border-connected background rule.

### Accuracy

#### 8. The thread range sets a floor; blends are the way round it (A)

For each stitch, the nearest thread in the *whole* catalogue:

| | Mean distance | Stitches with no thread within ΔE 5 |
|---|---|---|
| Current (calibrated) DMC colours | 3.84 | 25.0% |
| Pre-calibration colours | 4.26 | 31.4% |
| Current colours plus every allowed two-thread blend | 1.36 | — |

- The colours without a close thread are muted mid-tones: greys (28%), yellow-olives (20%),
  and muted reds, browns and skin (17%). That is why dirt comes out grey-mauve and foliage
  flatter than the photo.
- In a chart, blends help only a little (5.52 without, 5.32 with). They can only pair
  palette threads within ΔE 20, are used only when the nearest solid thread is over ΔE 5 away
  and the blend at least 3 nearer, and are capped at 12 recipes.
- Choosing threads *as blend pairs* aimed at poorly served colours is the largest remaining
  opportunity, but needs research.
- B adds that any accuracy claim needs physical swatches under consistent light. Agreed: the
  calibration report suggests photographing threads beside a colour checker card.

#### 9. Blend colours are averaged in gamma space (A and B; measured)

`makeThreadBlend` averages the two threads' stored sRGB values. Strands side by side mix as
light. Across the 18,174 pairs the app may blend:
- mean difference between the two models: ΔE 1.08;
- over ΔE 2: 13.1%; over ΔE 3: 4.4%;
- worst: 740 + 3771 (ΔE 7.4).

The light model is 0.5 L* lighter on average, so blends are chosen for colours slightly
darker than they are. The measurement harness already uses the light model.

**Fix:** average linear values in `makeThreadBlend` (IDs and symbols unchanged), and check
`restoreStitch` and the blend tests.

#### 10. The palette depends on one random start (A)

One k-means++ start with seed 1337. Over six seeds, colour error is 5.21 to 5.34; 1337 gives
5.32.

**Fix:** keep the best of three to five starts by mapping error. Time it on a 500 × 500 chart
first.

**Done instead:** a fixed start from the picture's main colours (see Status). It removes the
random reshuffle that made unrelated settings change colours, at the same accuracy.

#### 11. The detail map treats almost every photo as detailed (A)

`generateSaliencyMap` averages 0.81 on photos, and only 13% of stitches count as flat. So
Reduce confetti's larger flat-area patches, and Smooth shading's preference for a neighbour's
thread (about 0.8 ΔE at the mean), rarely act.

**Fix:** recalibrate the map at stitch size, or drop the two features. Do this after
finding 2, since Reduce confetti then has more to do.

#### 12. Faces and small subjects get leftover threads (A and B; open since October)

k-means gives each pixel one vote. Both audits suggest letting the user say what matters:
- A: a *Keep this colour* eyedropper that reserves the nearest thread;
- B: subject weighting, or pinned threads.

B also suggests showing local colour error and the nearest alternatives, so a user can see
*why* a face went grey. cstitch lets users click the picture to add colours.

#### 13. The fabric colour is ignored (A)

`fabricColour` never reaches the conversion. So white areas inside the picture are stitched
in white on white Aida, and nothing reflects a dark fabric.

**Fix:** an opt-in *Leave fabric-coloured areas unstitched*, shown over the fabric colour in
the preview.

## Other tools

Documented features only; this is not a ranking of chart quality. This session could not
fetch several vendors' pages, so some rows rest on search excerpts.

| Tool | What it documents | Lesson for stitchx | Checked |
|---|---|---|---|
| WinStitch / MacStitch | Photo or Clip art (Photo turns on dithering); cloth count sets finished size; thread count; Advanced Import with preview; can import using a saved palette (Premium); advises making the background one colour before import | Must-keep colours via a saved palette | Search excerpts of Ursa's 2012–2023 guides |
| cstitch | Number of colours or "all nearest DMC"; click the picture to add colours; "Median" or "Mode" squaring per stitch; replace rare colours | Must-keep colours; dominant-colour shrink (finding 4) | Page read |
| Pic2Pat | Size, fabric and colour count | Show results by colour count | Search excerpts. B also cites white balance and transparent areas left empty from its FAQ, which could not be reached; a Pic2Pat forum post says transparent areas became white, and the operator suggested editing colour balance elsewhere. **Unconfirmed** |
| FlossCross | Imports pictures; textures rendered from photos of 498 DMC flosses under even lighting; shows the source image "above" the chart | Keep simulated thread appearance clearly separate from chart data | Homepage via search. B's "overlays" may mean a layer or a position above; unclear |
| Stitch Fiddle | Import picture; suggests editing it in Canva first | Short path from an automatic palette to targeted edits | Help page via search. B's aspect-ratio point not checked |
| StitchXCross, Pixel-Stitch | B: shaped crops and optional background removal before matching (StitchXCross); a focus on stitch and colour count (Pixel-Stitch) | Reversible mask preview beside crop | **Not checked** |
| KG-Chart, mySewnet Cross Stitcher | Size, palette, colour count; mySewnet suggests an "optimal" colour count | | Search excerpts |

**Where stitchx leads:**
- light-correct shrinking;
- ΔE2000 matching with palette refinement;
- automatic blends;
- stash-only charts;
- picture-type presets;
- a live full-size preview that explains each change.

None of the other tools documents comparable shrinking or matching.

**Where others offer more:**
- must-keep colours;
- a dominant-colour option per stitch;
- (unconfirmed) white balance and a visible background mask before removal.

## Recommendations

Combined and ordered as B suggests: trust first, then diagnosis, then accuracy changes.

| # | Change | Finding | Effort | Effect | Risk |
|---|---|---|---|---|---|
| **Fix trust** |
| 1 | Don't run the edge-shade fold for photos | 2 | Small | Colour error 5.32 to 4.77, boundary 7.23 to 6.15; confetti +1 point | Changes new photo charts; update the style figures, help and changelog |
| 2 | Background: suggest instead of applying for photos, show the mask, mask before adjustments, separate transparency from colour removal, ΔE2000 tolerance | 1 | Medium | No more erased subjects or silent no-ops | Migrate saved `bgTh`; the PDF palette may change |
| 3 | Correct the *Stitch Cleanup* Off text; per-stage change counts | 3 | Small, then medium | Labels match behaviour | None |
| 4 | Mix blend colours as light | 9 | Small | Blend predictions correct | Blend swatches slightly lighter in existing projects |
| 5 | Empty-stash preview matches Generate; gallery labels and counts | 5 | Small | Previews honest | None |
| 6 | Crop: keep within 10 to 500, re-examine the picture, crop from the original | 6 | Small | No out-of-range charts or stale background | None |
| **Help users diagnose** |
| 7 | *At stitch size* view and a side-by-side size comparison | 4 | Medium | Users see whether detail was lost to the grid or to the chart | None |
| 8 | Local colour error and nearest alternatives for a selected region | 12 | Medium | Explains grey faces | UI design |
| **Improve accuracy** |
| 9 | Best of three to five palette starts | 10 | Small | About 0.1 lower colour error | Generation time |
| 10 | *Keep this colour* / pinned threads | 12 | Medium | Faces, logos and key colours get their thread | UI design |
| 11 | *Crisp edges* option | 4 | Medium | Sharper outlines | Needs stitchers to compare |
| 12 | Route the Tracker's import through the shared pipeline | 7 | Medium | Same chart from either tool | Changes another tool's output |
| 13 | *Leave fabric-coloured areas unstitched* | 13 | Medium | Truer look on coloured fabric | Opt-in |
| 14 | Recalibrate or remove the detail map | 11 | Medium | Two features start working | Measure after 1 |
| 15 | Palette chosen with blends in mind | 8 | Large | Most of the remaining colour error | Research; more symbols |

**Before shipping 1 and 2** (from B's verification plan):
- Run the harness on a broader set at 75, 100 and 150 stitches: faces, pets, low light,
  highlights, busy backgrounds, fine lines, plus transparent and plain-border fixtures.
- Ask stitchers to compare equal-size previews.
- Check that the final chart matches the settled preview in desktop Chromium and mobile
  WebKit, with and without workers.
- Run the Pattern Keeper PDF regression whenever the palette or symbols change.
- Get the browser tests running in CI; they have not run since October.

## Sources

- [cstitch documentation](https://cstitch.sourceforge.net/doc.shtml) (read in full).
- Ursa Software guides via search excerpts:
  [2012](https://www.ursasoftware.com/help/2012_en/manual/manual.html),
  [Importing Pics](https://www.ursasoftware.com/help/2012_en/filemenu/page14/page14.html),
  [2014](https://www.ursasoftware.com/help/2014_en/importexport/styled/page19.html),
  [Import Wizard 2023](https://ursasoftware.com/help/2023/TheImportWizard.html).
- [FlossCross](https://flosscross.com/) (homepage via search).
- [Pic2Pat FAQ](https://www.pic2pat.com/faq.en.php) (cited by B, not reachable here) and
  Pic2Pat community posts [1341](https://pic2pat.com/community/index.php?msg=1341),
  [2100](https://www.pic2pat.com/community/index.php?msg=2100).
- [Stitch Fiddle: Import picture](https://www.stitchfiddle.com/en/help/1pej-wc93j/import-picture).
- [StitchXCross](https://stitchxcross.com/photo-to-cross-stitch) and
  [Pixel-Stitch](https://www.pixel-stitch.net/) (cited by B, not checked).
- [KG-Chart / StitchSketch blog](https://www.iktsoft.net/kgchart-en/blog/?page=14),
  [mySewnet Cross Stitcher help](https://softwarehelp.mysewnet.com/MSM/120/CrossStitcher/Topics/Choose_Thread_Colors.htm)
  (search excerpts).
