# Preview-1 — Architecture & Pipeline Map

## 1. Where the preview lives

The image-to-pattern conversion screen is the Creator app **Prepare**
mode (`create.html` → [creator-main.js](../creator-main.js)). The live
preview the user reacts to is the **comparison-slider thumbnail** built
by [`window.ComparisonSlider`](../creator-main.js#L30) and rendered at
[creator-main.js#L937](../creator-main.js#L937). It consumes:

- `state.img.src` — the original image (left side of slider)
- `state.previewUrl` — the converted thumbnail data-URL (right side)
- `state.previewHeatmap`, `state.previewHighlight` — overlay layers
- `state.previewDims`, `state.sW`, `state.sH` — geometry

`state.previewUrl` and friends are produced exclusively by the hook
[`window.usePreview`](../creator/usePreview.js). There is **no second
preview path**; the full-size pattern canvas
([CreatorPreviewCanvas](../creator/PreviewCanvas.js#L5)) only renders
once the user clicks **Generate** — it shows `ctx.pat`, not the live
preview.

## 2. Setting inventory (everything in the Prepare sidebar)

All state lives in [creator/useCreatorState.js](../creator/useCreatorState.js);
the controls are rendered in [creator/Sidebar.js](../creator/Sidebar.js).

### Image dimensions & fabric
| # | Setting | Control | State (file:line) | Default | Range |
|---|---|---|---|---|---|
| D1 | Width (stitches) | Number input | `sW` [useCreatorState.js#L38](../creator/useCreatorState.js#L38) | 80 | 10–300 |
| D2 | Height (stitches) | Number input | `sH` [useCreatorState.js#L39](../creator/useCreatorState.js#L39) | 80 | 10–300 |
| D3 | Lock aspect ratio | Checkbox | `arLock` [useCreatorState.js#L40](../creator/useCreatorState.js#L40) | true | bool |
| D4 | Fabric count | Dropdown | `fabricCt` [useCreatorState.js#L123](../creator/useCreatorState.js#L123) | 14 | 11/14/16/18 |

### Image filters (raw-pixel stage)
| # | Setting | Control | State | Default | Range |
|---|---|---|---|---|---|
| F1 | Brightness | Slider | `bri` [useCreatorState.js#L89](../creator/useCreatorState.js#L89) | 0 | -50…+50 |
| F2 | Contrast | Slider | `con` [useCreatorState.js#L90](../creator/useCreatorState.js#L90) | 0 | -50…+50 |
| F3 | Saturation | Slider | `sat` [useCreatorState.js#L91](../creator/useCreatorState.js#L91) | 0 | -50…+50 |
| F4 | Smooth amount | Slider | `smooth` [useCreatorState.js#L109](../creator/useCreatorState.js#L109) | 0 | 0–4 (0.1) |
| F5 | Smooth type | Toggle | `smoothType` [useCreatorState.js#L110](../creator/useCreatorState.js#L110) | "median" | median/gaussian |

### Quantisation, dithering, blends
| # | Setting | Control | State | Default | Range |
|---|---|---|---|---|---|
| C1 | Max colours | Slider | `maxC` [useCreatorState.js#L84](../creator/useCreatorState.js#L84) | 30 | 10–40 |
| C2 | Dither mode | 4-button group | `dithMode` [useCreatorState.js#L52](../creator/useCreatorState.js#L52) | "off" | off/weak/balanced/strong |
| C3 | Dither strength (derived) | (from C2) | `dithStrength` [useCreatorState.js#L57](../creator/useCreatorState.js#L57) | 1.0 | 0.5/1.0/1.5 |
| C4 | Allow blended threads | Checkbox | `allowBlends` [useCreatorState.js#L74](../creator/useCreatorState.js#L74) | true | bool |
| C5 | Min stitches per colour | Slider | `minSt` [useCreatorState.js#L67](../creator/useCreatorState.js#L67) | 0 | 0–50 |

### Background removal
| # | Setting | Control | State | Default | Range |
|---|---|---|---|---|---|
| B1 | Skip background | Checkbox | `skipBg` [useCreatorState.js#L100](../creator/useCreatorState.js#L100) | false | bool |
| B2 | Background colour | Picker (click-on-image) | `bgCol` [useCreatorState.js#L101](../creator/useCreatorState.js#L101) | [255,255,255] | RGB |
| B3 | Background ΔE threshold | Slider | `bgTh` [useCreatorState.js#L102](../creator/useCreatorState.js#L102) | 15 | 1–50 |

### Stitch cleanup
| # | Setting | Control | State | Default | Range |
|---|---|---|---|---|---|
| K1 | Cleanup enabled | Toggle | `stitchCleanup.enabled` | true | bool |
| K2 | Cleanup strength | 3-button group | `stitchCleanup.strength` | "balanced" | gentle/balanced/thorough |
| K3 | Protect fine details | Toggle | `stitchCleanup.protectDetails` | true | bool |
| K4 | Smooth dithering | Toggle | `stitchCleanup.smoothDithering` | true | bool |
| K5 | Orphan-removal level | Slider | `orphans` [useCreatorState.js#L112](../creator/useCreatorState.js#L112) | 0 | 0–3 |

### Stash / variation
| # | Setting | Control | State | Default | Range |
|---|---|---|---|---|---|
| S1 | Use only stash threads | Checkbox | `stashConstrained` [useCreatorState.js#L291](../creator/useCreatorState.js#L291) | false | bool |
| S2 | Variation seed | Gallery click | `variationSeed` [useCreatorState.js#L346](../creator/useCreatorState.js#L346) | null | string/null |
| S3 | Variation subset | derived from S2 | `variationSubset` | null | array/null |

(`pickBg` is a UI mode, not a conversion input. `creatorStashFilter`
filters the palette picker on the *Edit* tab and does not affect the
conversion preview.)

## 3. Preview pipeline trace

```
User changes setting in Sidebar
        │  (onChange handler)
        ▼
gen.setX(...)   in useCreatorState.js
        │  (React re-render)
        ▼
generatePreview useCallback rebuilds (deps array, usePreview.js#L176-L184)
        │
        ▼
useEffect [generatePreview]   usePreview.js#L189-L197
        │  (clearTimeout previous, setTimeout 400ms)
        ▼
generatePreview() runs on the MAIN THREAD
        │  ├─ canvas.drawImage with brightness/contrast/saturate filter
        │  ├─ applyGaussianBlur / applyMedianFilter (if smooth>0)
        │  ├─ raw RGBA cached by geoSig (img.src|pw|ph|bri|con|sat|smooth|smoothType)
        │  └─ (if dith) progressive: fast pass with allowBlends:false → setTimeout(0) → full pass
        ▼
runCleanupPipeline(raw, pw, ph, opts)   creator/generate.js#L26
        │  ├─ quantize(raw, … allowedPalette …)
        │  ├─ doDither / doMap (allowBlends, dithStrength)
        │  ├─ skip-background pass
        │  └─ removeOrphanStitches (cleanup)
        ▼
state.setPreviewUrl(dataURL)
state.setPreviewStats(...)
state.setPreviewMapped(...)
state.setPreviewDims(...)
state.setPreviewHeatmap(...)
        │
        ▼
ComparisonSlider re-renders (creator-main.js#L937) — right-side <img src={previewUrl}>
```

### Key facts about the pipeline

- **Main-thread, not worker**: the preview uses the main thread; the
  Web Worker (`generate-worker.js`) is only used by the Generate
  button. Typical preview cost: 50–250 ms for a 200×200 source.
- **Debounce**: 400 ms ([usePreview.js#L194](../creator/usePreview.js#L194)).
  All settings — discrete and continuous — share this debounce.
- **Cancellation**: only the *timer* is cancelled. There is no
  cancellation of an in-flight pipeline run. A second change while
  the synchronous `runCleanupPipeline` is executing will not be
  visible until that run finishes (then debounce restarts).
- **Geometric cache** ([usePreview.js#L48](../creator/usePreview.js#L48)):
  raw RGBA is cached when only "pipeline" settings (palette/cleanup
  etc.) change — avoids re-blurring on every slider tick.
- **Loading state**: there is **no overlay or spinner** on the
  preview thumbnail while the debounced generation is in progress.
  The user sees the previous preview frozen, then a sudden swap.
- **Progressive paint** ([usePreview.js#L81](../creator/usePreview.js#L81)):
  when dithering is on the user briefly sees a fast non-dithered,
  non-blended pass before the real pass paints over it ~1 frame later.
- **Comparison slider position** is local to the slider component
  (`splitPos` state, [creator-main.js#L29](../creator-main.js#L29))
  and survives `previewUrl` changes — it does NOT reset on update.
  Touch is supported via Pointer Events with RAF batching.

## 4. Wiring asymmetries (preview vs. full-generate)

The preview's `generatePreview` and the worker-backed `generate` are
*separate code paths* that re-implement the same call to
`runCleanupPipeline`. They have drifted:

| Setting passed to `runCleanupPipeline` | Preview ([usePreview.js#L82-L91](../creator/usePreview.js#L82-L91)) | Generate ([useCreatorState.js#L887-L915](../creator/useCreatorState.js#L887-L915)) |
|---|:-:|:-:|
| maxC | ✓ (effMaxC) | ✓ |
| dith (boolean) | ✓ | ✓ |
| **dithStrength** | ✗ **missing** | ✓ |
| allowBlends | ✓ (effAllowBlends) | ✓ |
| skipBg / bgCol / bgTh | ✓ | ✓ |
| stitchCleanup | ✓ | ✓ |
| orphans | ✓ | ✓ |
| **minSt** | ✗ **missing** (and not in deps) | ✓ |
| allowedPalette | ✓ (but built incorrectly — see preview-3) | ✓ |
| seed | ✓ | ✓ |

`generatePreview`'s dependency array
([usePreview.js#L176](../creator/usePreview.js#L176)) further omits
`minSt`. So changing the **Min stitches per colour** slider has zero
effect on the preview at any point — neither does it re-run nor would
it pass the value through if it did.

The "regenerate-warning" snapshot
([Sidebar.js#L1322-L1325](../creator/Sidebar.js#L1322-L1325)) tracks
`sW/sH/fabricCt/bri/con/sat/maxC/dithMode/allowBlends/skipBg` — it
omits `dithStrength` (covered by dithMode), `minSt`, `smooth`,
`smoothType`, `bgTh`, `bgCol`, `stitchCleanup`, `orphans`,
`stashConstrained`. Edits to those after a Generate will not surface
the "values changed" CTA.

## 5. Files that matter

| File | Role |
|---|---|
| [creator/usePreview.js](../creator/usePreview.js) | Live preview pipeline (main thread, debounced) |
| [creator/useCreatorState.js](../creator/useCreatorState.js) | Single state hook; also owns the Generate worker call |
| [creator/Sidebar.js](../creator/Sidebar.js) | All conversion-setting controls |
| [creator/generate.js](../creator/generate.js) | Pure `runCleanupPipeline` + `runGenerationPipeline` |
| [creator-main.js](../creator-main.js) | `ComparisonSlider` and Prepare-tab layout |
| [generate-worker.js](../generate-worker.js) | Worker copy of `runGenerationPipeline` (Generate only) |
| [colour-utils.js](../colour-utils.js) | `quantize`, `doDither`, `doMap`, `findBest` (the actual blend + palette logic) |
| [stash-bridge.js](../stash-bridge.js) | `getGlobalStash()` returns composite-keyed object `{ "dmc:310": { owned, … } }` |
