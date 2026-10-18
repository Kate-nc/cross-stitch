# Tablet editing and exact pixel-art import

## Interaction rules

- Existing pen drawing is retained. Mouse and reported pen input use the selected
  tool in Draw; Navigate never edits.
- **More tools > Pen draws; fingers navigate** is an opt-in, device-local setting.
  With it enabled, one finger pans even with Paint selected, and two fingers
  pan/pinch. Mixed pen/finger contact interrupts the drawing; all contacts must
  lift before another edit. This deliberately makes no hardware palm-rejection
  claim.
- Fallback: leave the option off and switch explicitly between Navigate and Draw
  when a stylus is reported as touch or mouse. Touch screens still start in
  Navigate. The option does not attempt to infer pen capability.
- In fallback Draw, brush strokes retain the existing finger drawing behaviour.
  Fill, erase-backstitch, colour replacement and wand touches now wait for lift.
  A touch outside a floating selection also waits for lift before placing it.
- Navigation owns the complete multi-contact sequence. Starting it discards an
  unfinished brush stroke, shape or selection drag. A remaining finger cannot
  resume that edit. Existing selection masks and floating selections survive.
- Pointer cancellation, lost capture, blur, a hidden page and viewport resize end
  gestures. A cancelled brush stroke is committed as one undoable action; an
  unfinished shape, lasso or move/float preview is discarded. Late releases and
  unknown pointer IDs cannot commit twice. Crop cancellation clears its preview
  and releases capture too.

## Exact import rules

**Exact pixel-art import** is separate from the editable Pixel art preset. It
supports sources up to 500 by 500 pixels, including motifs below 10 pixels.
Native dimensions are used without resampling. Filters, sharpening, dithering,
blends, the colour cap, background removal and region cleanup are bypassed.
Isolated source pixels remain intentional details. Larger sources are rejected,
not silently resized into exact mode.

The existing `prepareConversionPixels` transparency pipeline supplies the mask:
alpha below 128 is empty, alpha at or above 128 is stitched using uncomposited
RGB. Hidden RGB does not enter thread matching. Opaque background stays stitched.
Preview PNGs carry empty-pixel alpha instead of flattening holes onto grey.

Geometry is exact; thread RGB is approximate. Each unique visible source RGB
maps deterministically to a solid thread in the selected brand or stash. The
preview's **Source colours mapped to threads** table exposes source RGB, matched
thread RGB, ID/name and counts. Several source colours may share one thread.
Empty stash pools and unloaded non-DMC pools cannot silently preview DMC.
Preview and Generate share the same native-resolution function. Exact generation
uses the bounded main-thread path, so it does not offer mid-conversion Cancel.
Resized variation galleries require leaving exact mode.

Drafts and saved Creator settings retain the mode. The source-size lock only
applies in Convert, allowing later editor canvas resizing. No renderer or PDF
export changes are included.

## Verification evidence

Fixtures: `tests/fixtures/pixel-art-crisp.png` and `pixel-art-alpha.png`, both
9 by 7. They include alternating one-pixel hard edges, opaque black, one isolated
green pixel, transparent cyan and alpha 127/128 columns. Tests assert all 63
positions, 49 stitched pixels for the alpha fixture, the one-pixel accent, native
preview dimensions, preview/generation ID equality and serialisation round trips.
A one-thread pool explicitly tests many-to-one remapping. Invalid/empty pools and
oversized sources are rejected.

`tests/useCanvasInteraction.test.js` executes mouse, touch and pen handlers. It
covers cancellation and idempotence, undo reconstruction after interruption,
barrel-button rejection, unrelated pointer-up, mixed input, residual fingers,
Fill/pinch arbitration, crop capture and preservation of existing selections.

`tests/e2e/tablet-exact-pixel.spec.js` observes the real application hook from a
test-only wrapper. It checks the real import UI and alpha-bearing preview,
Chromium touch navigation/pinch, synthetic pen cancellation/mixed input with
actual Undo, portrait/landscape viewport changes, 300% bottom-right mouse drawing,
and trusted mouse pointer capture released mid-stroke. The latter checks capture
state, interruption history and recovery after Undo. Other selected browser
suites cover jittered touch placement, precision cursor, double-tap zoom,
Navigate defaults and Tracker pan/pinch/mid-drag navigation protections.

Final verification against rebased main `b091d65c`:

- `npm test`: 355 suites passed, 4,869 tests passed, 4 skipped, one snapshot
  passed (exit 0). Jest emitted a non-fatal open-handle warning before exiting.
- After the final loupe cleanup and unavailable-stash guard, focused
  `useCanvasInteraction|transparentConversion|creatorLoupe|blobStore|swBuild|previewReactivity|generateCancel|stashPalette`
  checks: 7 suites, 106 tests passed (exit 0).
- `tablet-exact-pixel.spec.js`: 4 browser tests passed, including real capture
  loss, native touch pan/pinch and the unavailable-stash generation guard.
- `creator-draw-navigate.spec.js`, `creator-touch-no-auto-paint.spec.js`,
  `creator-touch-magnifier.spec.js`, `tracker-touch.spec.js`: 19 passed on the
  rebased application. Together these runs provide 23 passing browser scenarios.
- `node build-runtime-js.js --check`, `node build-sw.js --check`,
  `npm run lint:terminology` and `git diff --check` pass.
- `npm run lint:css-tokens` exits 0 with pre-existing advisory findings in the
  upstream stylesheet; this change adds no CSS rules.

Browser commands used `PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright-browsers`,
`E2E_LOCAL_CDN=1` and `--project=touch-tablet-chromium`.

Generated Creator,
runtime and service-worker assets were regenerated and checked. Terminology lint
passes. CSS token lint has existing advisory findings in unchanged `styles.css`.

## Separate bug-hunting pass

| Risk inspected | Finding and action |
| --- | --- |
| Accidental edits | Touch Fill and touching outside a float could commit before a pinch was recognised; defer those actions to lift. Suppress the remaining contacts after navigation. |
| Coordinate drift | Reject drawing while a pinch transform settles; interrupt on viewport and editor geometry changes. Verify a single bottom-right cell at 300% and after portrait/landscape resize. |
| Stuck capture/tools | Track capture owner and pointer identity. Handle lost capture, cancellation and lifecycle interruption. Clear pending timers, loupe, shapes and selection drags; test recovery and late releases. |
| Smoothing | Exact import bypasses progressive prescale, filtering and cleanup. Compare every fixture location and retain the isolated accent. |
| Dropped alpha | Reuse the corrected coverage function; keep preview holes transparent and test alpha 127/128 plus PNG save/restore. |
| Gesture conflicts | Only two reported touches start pinch. Pen/finger mixtures interrupt drawing, not zoom. Navigation cannot resume a brush on the surviving finger. Existing Tracker arbitration is retained and regression-tested. |
| Size/persistence | Restrict source-size locking to Convert; preserve exact mode in drafts/projects. Preserve the newly merged first-use and PAT-import work during rebase. |
| Palette surprises | Expose source-to-thread matches; reject empty/unloaded pools instead of falling back silently. |

Two old tests in `tests/e2e/creator-touch.spec.js` were attempted but time out in
`loadCreatorFixture` waiting for obsolete `text=Open file`, before any canvas
input. Their shared loader was left unchanged. The current-flow tablet spec
provides direct pan/pinch, paint, capture and undo coverage instead.

## Device-testing limits

Executed in headless Chromium with Playwright tablet/phone emulation, CDP touch,
synthetic PointerEvents for pen, and browser-generated mouse input. Viewport
swaps exercise resize/rotation handling but do not establish physical rotation
behaviour. No physical tablet or stylus is exposed in this environment. WebKit,
Safari/iPadOS/Apple Pencil, Android/S Pen, palm rejection, OS interruption timing,
pressure, tilt and native stylus-to-pointer classification remain unverified.
Before relying on those devices, exercise the above rules on hardware, especially
mixed contact and interruption, and use the explicit Navigate/Draw fallback if
pointer classification is unreliable.
