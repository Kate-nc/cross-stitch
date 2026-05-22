# Create-From-Image Flow Audit

> **Phase 1 of 3.** This document covers the current create-from-image flow end to end:
> every step, every control, the conversion pipeline, create/edit overlap, and friction
> analysis. Phase 2 (redesign proposals) begins after the questions at the end are answered.

---

## 1. The Current Flow, End to End

### 1.1 Entry Points

A user can reach the create-from-image flow by:

1. **Direct URL** — `create.html` or `index.html` (which redirects to `create.html`)
2. **Home page** — "Create new pattern" → image upload card on `home.html`
3. **Deep link from home** — when an image is dropped onto `home.html`, it is serialised into `sessionStorage` under the key `pending_home_image` and the page navigates to `create.html?action=home-image-pending`; the creator reads it on mount ([create.html](../create.html), [creator/useCreatorState.js](../creator/useCreatorState.js))

### 1.2 Page Load and Initialisation

**File:** [create.html](../create.html), [creator-main.js](../creator-main.js), [creator/useCreatorState.js](../creator/useCreatorState.js), [creator/context.js](../creator/context.js)

1. `pako` (URL compression) is loaded first, before Babel.
2. All shared scripts are loaded in dependency order via `<script>` tags.
3. `ReactDOM.createRoot(...).render(<CreatorApp />)` is called.
4. `useCreatorState()` initialises five React contexts: `GenerationContext`, `AppContext`, `CanvasContext`, `PatternDataContext`, `HoverContext`.
5. Six derived hooks mount: `useEditHistory`, `useCanvasInteraction`, `useProjectIO`, `usePreview`, `useKeyboardShortcuts`, and optionally `useCleanupMode`.
6. **Implicit:** `appMode` starts as `"create"`, `hasGenerated` starts as `false`.

**What the user sees:** An upload zone or, if returning to an existing project, the pattern canvas in edit mode.

### 1.3 Upload / Image Selection

**Files:** [creator/useCreatorState.js](../creator/useCreatorState.js) (`setImg`), [creator-main.js](../creator-main.js)

Ways to provide an image:
- Drag-and-drop onto the upload zone
- Click "Upload image" button → native file picker
- Image passed from home page via `sessionStorage`

**What happens automatically (user does not see this):**
- Image is loaded as an `HTMLImageElement` and stored as `ctx.img`
- Original pixel dimensions are captured as `ctx.origW` / `ctx.origH`
- `isUploading` flag is set while loading
- If the `experimental.importWizard` user preference is **on**: the Import Wizard modal opens
- If it is **off**: the legacy parameter panel is shown

### 1.4a Legacy Path: Single Parameter Panel

**File:** [creator-main.js](../creator-main.js) (inline in sidebar render)

A sidebar panel exposes all conversion controls (see §2 for the full list) with a prominent **"Generate Pattern"** button at the bottom. There is no step indicator, no progress through the settings — everything is visible at once.

The panel is always visible once an image is loaded; the user can press Generate immediately without changing anything.

### 1.4b New Path: Import Wizard (experimental flag)

**File:** [creator/ImportWizard.js](../creator/ImportWizard.js), [creator/import-wizard-bundle.js](../creator/import-wizard-bundle.js)

A 5-step modal replaces the parameter panel:

| Step | Title | What the user configures | Notes |
|------|-------|--------------------------|-------|
| 1 | Crop & Orient | Rotate 90°, flip H, flip V, aspect-ratio guide (Free / 1:1 / 4:3 / 3:4 / 16:9) | The crop is visual only — it is **not** applied until Generate is clicked; the image preview reflects transforms immediately |
| 2 | Choose a palette | DMC full palette / From my stash / Limited palette; Max colours (5–80); Allow 2-thread blends | Stash mode requires the user to already have threads marked owned in the Stash Manager |
| 3 | Size & fabric count | Width and height in stitches (10–300); Aspect-ratio lock; Fabric count dropdown; Live stitch count + skein/time estimate | Warning shown if total stitches > 40,000 |
| 4 | Preview & tune | Dithering toggle; Contrast slider (–50 to +50); Saliency preservation toggle; Skip background toggle + threshold | "Live preview is coming in a follow-up" — the preview pane in step 4 is **not yet live** |
| 5 | Confirm + Generate | Summary of settings; **Generate Pattern** button | On click, closes wizard and runs the pipeline |

Users can jump back to a completed step by clicking its step indicator. Forward navigation is linear (each step has a "Next" button). The wizard can be dismissed (with a discard confirmation) at any time.

### 1.5 Conversion Pipeline (Generate clicked)

**Files:** [creator/generate.js](../creator/generate.js) (`runGenerationPipeline`), [colour-utils.js](../colour-utils.js)

The entire pipeline runs synchronously on the main thread (a `generate-worker.js` exists but is not yet integrated). On a modern device a typical 80×80 pattern takes 300–800 ms; larger patterns can take several seconds with no progress indication.

```
Image → Canvas resize to (sW × sH) → CSS filters (brightness/contrast/saturation)
      → getImageData (RGBA bytes)
      → [optional] Gaussian or median blur (smooth > 0)
      → K-means quantisation to maxC colours, all matched to nearest DMC thread
      → [if dithering on] Floyd-Steinberg error diffusion with confetti-aware selection
      → [if dithering off] Direct nearest-colour mapping
      → [if skipBg] Background removal via ΔE threshold
      → Min-stitches rebucketing (up to 3 passes, merging rare colours)
      → Orphan / confetti analysis (connected-component labelling)
      → [if stitchCleanup or orphans > 0] Orphan removal (edge-aware)
      → maxC safety check (up to 5 passes)
      → buildPalette() → { pat, pal, cmap, confettiData }
```

Full algorithm details are in §4.

### 1.6 Post-Generation Transition

**Files:** [creator/useCreatorState.js](../creator/useCreatorState.js) (lines ~900–1030), [creator-main.js](../creator-main.js)

After the pipeline completes:
- `setAppMode("edit")` — the sidebar switches from parameter controls to editing tools
- `setTab("pattern")` — the pattern canvas becomes the main view
- `setHasGenerated(true)` — the Generate button changes to "Regenerate"
- `setLastGenSnapshot({sW, sH, maxC, fabricCt})` — snapshot stored for the "Re-generate (values changed)" CTA
- The pattern canvas renders the new pattern
- Palette chips appear in the right sidebar
- A confetti banner may appear if cleanup removed > 15% of stitches

**Implicit step the user may not notice:** The sidebar has changed mode. Nothing in the UI explicitly says "you are now in Edit mode." The "Create" / "Edit" mode distinction is surfaced only in the action bar phase label and the change in sidebar content.

### 1.7 Re-generation

At any point in edit mode, the user can change conversion parameters (via sliders still visible in the sidebar). If the parameters differ from the last snapshot, a **"Re-generate (values changed)"** CTA appears. Clicking it re-runs the full pipeline, replacing the entire pattern and **discarding all manual edits**. The CTA copy includes an edit count warning ("Re-generate (will replace 7 edits)") when the undo history contains edits.

There is no way to merge a re-generation with manual edits.

### 1.8 Live Preview

**File:** [creator/useCreatorState.js](../creator/useCreatorState.js) (preview hook, lines ~1180–1215)

A debounced preview runs whenever conversion parameters change (300 ms delay). It uses the same `runCleanupPipeline` as the full generation but does not update the committed pattern. The comparison slider on the canvas area shows original vs. preview.

**Important:** The preview runs on the main thread at 300 ms debounce. On slow hardware or large patterns, the UI is unresponsive during preview generation.

### 1.9 From Pattern to Stitching

Once the user is satisfied, they can:
- Click **"Open in Tracker"** in the action bar — opens `stitch.html` pre-loaded with the current project
- Export via **"Print PDF"** or **"Export"** (Save JSON, etc.)
- Simply close the browser — the project is auto-saved every 5 s to IndexedDB

There is no explicit "I'm done" step; the flow just stops when the user decides to leave.

---

## 2. Every Control in Create Mode

Controls are split into three groups: controls that only affect generation (must be set before or re-generate to take effect), controls that affect the live preview in real-time, and controls that don't affect the pattern at all (display/output only).

### 2.1 Generation / Conversion Controls

These live in the sidebar when `appMode === "create"` and persist (with the Re-generate CTA) when `appMode === "edit"`.

| Control | Type | Default | Range | What it does | Live preview? | When it takes effect | File |
|---------|------|---------|-------|--------------|---------------|----------------------|------|
| Grid Width (`sW`) | Number input + slider | 80 | 10–500 | Pattern width in stitches | Yes (300 ms debounce) | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Grid Height (`sH`) | Number input + slider | 80 | 10–500 | Pattern height in stitches | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Aspect Ratio Lock | Toggle | ON | ON/OFF | Auto-scales `sH` when `sW` changes | Immediate | Immediate | [useCreatorState.js](../creator/useCreatorState.js) |
| Max Colours (`maxC`) | Slider | 30 (user pref) | 2–100 | Max thread types after quantisation | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Dithering (`dithMode`) | Radio group | "balanced" (user pref) | off / weak / balanced / strong | Floyd-Steinberg error diffusion strength | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Brightness (`bri`) | Slider | 0 | –100 to +100 | CSS brightness filter on source image | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Contrast (`con`) | Slider | 0 | –100 to +100 | CSS contrast filter | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Saturation (`sat`) | Slider | 0 | –100 to +100 | CSS saturation filter | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Smoothing (`smooth`) | Slider | 0 | 0–10 px | Gaussian or median blur radius | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Smooth Type (`smoothType`) | Radio (gaussian / median) | "median" | — | Blur algorithm | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Skip Background (`skipBg`) | Checkbox | OFF | ON/OFF | Remove near-background-colour cells | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Background Colour (`bgCol`) | Colour picker | White `[255,255,255]` | RGB | Colour to treat as background | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Background Threshold (`bgTh`) | Slider | 15 | 0–50 | ΔE tolerance for background removal | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Min Stitches per Colour (`minSt`) | Slider | 0 (user pref) | 0–20 | Merge colours with fewer cells into nearest neighbour | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Allow Blends (`allowBlends`) | Checkbox | ON (user pref) | ON/OFF | Enable 2-thread blend stitches | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Stitch Cleanup toggle | Toggle | OFF (user pref) | ON/OFF | Enable automatic orphan removal | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Cleanup Strength | Radio (gentle / balanced / thorough) | "balanced" | — | Maps to `maxOrphanSize` 2/3/5 | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Protect Details | Checkbox | ON (user pref) | ON/OFF | Use edge map to protect thin lines during cleanup | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Remove Orphans (`orphans`) | Slider | 0 (user pref) | 0–5+ | Alternative orphan removal override | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Constrain to Stash | Checkbox | OFF (user pref) | ON/OFF | Only allow threads the user owns | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| Variation Seed | Number input (hidden by default) | 0 | 0–9999 | Controls k-means random seed for reproducibility | Yes | On Generate | [useCreatorState.js](../creator/useCreatorState.js) |
| **Generate / Regenerate** | Primary button | — | — | Runs the full pipeline | — | Immediate | [creator-main.js](../creator-main.js) |

### 2.2 Non-Conversion Controls in Create Mode

| Control | What it does | Live? | File |
|---------|-------------|-------|------|
| Fabric Count (`fabricCt`) | Affects skein and time estimates only; does **not** change pattern pixels | Immediate | [useCreatorState.js](../creator/useCreatorState.js) |
| Project Name | Renames the project | Immediate | [creator-main.js](../creator-main.js) |
| Comparison slider | Drag to reveal original vs. preview | Immediate | [creator-main.js](../creator-main.js) (`ComparisonSlider`) |
| Diff overlay (auto) | Orange highlight of changed cells appears 1.5 s after a preview update, then fades | Automatic | [creator-main.js](../creator-main.js) |
| Heatmap overlay | Toggle; shows per-pixel saliency map | Immediate | [creator-main.js](../creator-main.js) |

---

## 3. Edit Mode Controls

Controls available after `appMode === "edit"`:

### 3.1 Tool Strip ([creator/ToolStrip.js](../creator/ToolStrip.js))

| Tool | Shortcut | Description |
|------|----------|-------------|
| Paint (Cross stitch) | P | Click/drag to paint selected colour |
| Fill (Flood fill) | F | Fill contiguous region of same colour |
| Erase | E | Remove stitches (set to `__empty__`) |
| Eyedropper | D | Pick colour from canvas cell |
| Backstitch | B | Draw lines between grid intersections |
| Backstitch Erase | — | Erase backstitch lines |
| Half stitch forward / Half stitch back | — | Place half stitches |
| Three-quarter stitch | — | |
| Quarter stitch | — | |
| Magic Wand | W | Select by colour, with Shift (add) and Alt (subtract) modifiers |
| Lasso (freehand / polygon / magnetic) | L | Shape-based selection |
| Cleanup | Ctrl+K | Interactive orphan removal |
| Zoom In / Zoom Out | = / – | Adjust cell size |
| Grid Toggle | Ctrl+G | Show/hide grid |
| Symbol view | Ctrl+1/2/3 | Color / symbol / both rendering modes |
| Pan (Hand) | Space (hold) | Pan canvas |
| Undo | Ctrl+Z | Revert last edit (up to 50 deep) |
| Redo | Ctrl+Y | Reapply |

### 3.2 Right Sidebar in Edit Mode

- **Palette chips** — select active paint colour, highlight colour, view stash status
- **Colour swap button** (per chip) — swap all uses of a colour for another
- **Colour replace** (right-click context menu on chip or canvas cell) — `ColourReplaceModal`
- **Stash Adapt** button — opens `AdaptModal` to propose a stash-constrained palette
- **Brightness / contrast / saturation sliders** — same controls as create mode, but here they immediately show a "Re-generate (values changed)" CTA
- **Smoothing, Min Stitches, Orphan removal sliders** — same as create

### 3.3 Action Bar ([creator/ActionBar.js](../creator/ActionBar.js))

| Control | What it does |
|---------|-------------|
| Print PDF | Opens PDF export flow |
| Export dropdown | Save JSON, export image, etc. |
| Open in Tracker | Saves project and opens `stitch.html` |
| Pattern Info popover | Shows dimensions, colour count, difficulty, skein estimate |
| Mode label | Shows "Create" or "Edit" as a phase indicator |

---

## 4. The Conversion Pipeline in Detail

**Entry point:** `window.runGenerationPipeline(img, opts)` in [creator/generate.js](../creator/generate.js)

### Step 1: Image Preprocessing

```
canvas.width = sW; canvas.height = sH;
ctx.filter = "brightness(…) contrast(…) saturate(…)";
ctx.drawImage(img, 0, 0, sW, sH);
raw = ctx.getImageData(0, 0, sW, sH).data;  // RGBA Uint8ClampedArray

if (smooth > 0) {
  smoothType === "gaussian"
    ? applyGaussianBlur(raw, sW, sH, smooth)
    : applyMedianFilter(raw, sW, sH, smooth);
}
```

The image is scaled to the target stitch grid at this point. **There is no separate crop step** — the CSS `drawImage` call scales the entire image; the wizard's crop/rotate/flip transforms are applied via CSS transforms on the `<img>` preview but are not yet wired to the canvas draw call.

### Step 2: K-Means Colour Quantisation

**File:** [colour-utils.js](../colour-utils.js), `quantize()`

- Converts all pixels to CIELAB
- Seeded D²-weighted random initialisation (`variationSeed`)
- Up to 20 Lloyd's iterations until convergence (< 0.25 ΔE² movement)
- Each cluster centre is matched to the nearest DMC thread (no duplicates)
- If `allowedPalette` is set (stash-constrained mode), the search is limited to that subset
- Result: `palette[]` of `{id, name, rgb, lab}` — at most `maxC` entries

### Step 3: Colour Mapping (Dithering OFF)

**File:** [colour-utils.js](../colour-utils.js), `doMap()`

For each pixel: nearest solid (fast Euclidean LAB ΔE²), or nearest blend (perceptual CIEDE2000). Blends are used if ΔE(blend) < ΔE(solid) − 3 AND ΔE(solid) > 5.

### Step 3 (alt): Floyd-Steinberg Dithering (Dithering ON)

**File:** [colour-utils.js](../colour-utils.js), `doDither()`

- Saliency map computed first (`generateSaliencyMap`)
- Left-to-right, top-to-bottom scan
- For each pixel: best colour match (solid or blend)
- **Confetti-aware selection:** if best colour does not match any processed neighbour, the second-best colour is considered; it is used if its extra ΔE penalty is below a threshold (4.0 with `smoothDithering`, 0.0 without). This reduces isolated stitches at the cost of slight colour accuracy.
- Error diffused to 4 neighbours with weights 7/16, 5/16, 3/16, 1/16, scaled by `ditherStrength` (weak=0.5, balanced=1.0, strong=1.5)

### Step 4: Background Removal

If `skipBg` is on: cells whose source-pixel LAB is within `bgTh` ΔE of `bgCol` are replaced with `{id:"__skip__"}`. The threshold default is 15 ΔE.

### Step 5: Min-Stitches Rebucketing

Up to 3 passes: any colour with fewer than `minSt` cells is merged into its nearest surviving colour by ΔE. Prevents tiny palette slots from polluting the thread list.

### Step 6: Orphan / Confetti Analysis and Removal

1. **Connected-component labelling** — flood-fill assigns each cluster of same-colour adjacent stitches a component ID
2. **Confetti analysis** — `analyzeConfetti()` counts components with size = 1 (isolated stitches), reports count and percentage
3. **Orphan removal** — if `orphans > 0` or `stitchCleanup.enabled`:
   - Edge map optionally generated (Sobel → Canny-style threshold) to protect fine details
   - Each orphan cell (component size ≤ `maxOrphanSize`) is replaced with the most common colour among its 4 neighbours
   - Saliency weighting can increase the effective threshold in high-detail areas

**Strength presets:**

| Preset | maxOrphanSize | saliencyMultiplier |
|--------|--------------|-------------------|
| gentle | 2 | 1.0 |
| balanced | 3 | 2.0 |
| thorough | 5 | 3.0 |

### Step 7: Safety Cap

If the palette still has more than `maxC` unique threads after all the above, the top `maxC` by usage are kept and all others are migrated to their nearest survivor. Repeated up to 5 times.

### Parameters That Are Genuinely Conversion-Time Only

These cannot be changed after generation without re-running the full pipeline:

| Parameter | Why it's conversion-time |
|-----------|--------------------------|
| `sW`, `sH` | Determines the physical pixel grid |
| `maxC` | Sets the number of quantisation clusters |
| `dithMode` | Changes which mapping algorithm is used |
| `bri`, `con`, `sat` | Applied before pixel extraction |
| `smooth`, `smoothType` | Applied before quantisation |
| `skipBg`, `bgCol`, `bgTh` | Determines which cells become transparent |
| `allowBlends` | Whether blend pairs are generated |
| `stashConstrained` | Restricts the quantisation palette |
| `variationSeed` | Seeded RNG — same inputs + same seed → same output |

### Parameters That Are Post-Conversion Edits Dressed as Conversion Controls

| Parameter | Why it could live in edit |
|-----------|--------------------------|
| `minSt` | Equivalent to a "merge rare colours" edit — could be a post-gen operation |
| `orphans` / `stitchCleanup` | Could be an interactive edit tool — this is essentially what cleanup mode already does |
| `fabricCt` | Never affects the pixel output; only skein/time estimates |

---

## 5. The Create/Edit Overlap Table

The central diagnostic artifact. Every control that appears in both phases.

| Control / Tool | Exists in Create | Exists in Edit | Behaviour Identical? | Notes |
|---------------|:---:|:---:|:---:|-------|
| Grid Width / Height | ✓ | ✓ (via Re-gen CTA) | Yes | In edit, changing these shows the Re-gen CTA but doesn't auto-re-generate |
| Max Colours | ✓ | ✓ (via Re-gen CTA) | Yes | Same |
| Dithering | ✓ | ✓ (via Re-gen CTA) | Yes | |
| Brightness / Contrast / Saturation | ✓ | ✓ (via Re-gen CTA) | Yes | Identical sliders |
| Smoothing | ✓ | ✓ (via Re-gen CTA) | Yes | |
| Skip Background | ✓ | ✓ (via Re-gen CTA) | Yes | |
| Min Stitches | ✓ | ✓ (via Re-gen CTA) | Yes | |
| Allow Blends | ✓ | ✓ (via Re-gen CTA) | Yes | |
| Stitch Cleanup toggle | ✓ | ✓ (via Re-gen CTA) | Yes | |
| Remove Orphans slider | ✓ | ✓ (via Re-gen CTA) | Yes | Also has an interactive equivalent in the Cleanup tool |
| Fabric Count | ✓ | ✓ | Yes | Display-only; no Re-gen needed |
| **Cleanup tool** | ✗ | ✓ | — | Edit-only interactive orphan removal |
| **Paint** | ✗ | ✓ | — | Edit-only |
| **Fill** | ✗ | ✓ | — | Edit-only |
| **Erase** | ✗ | ✓ | — | Edit-only |
| **Eyedropper** | ✗ | ✓ | — | Edit-only |
| **Backstitch** | ✗ | ✓ | — | Edit-only |
| **Magic Wand / Lasso** | ✗ | ✓ | — | Edit-only |
| **Undo / Redo** | ✗ | ✓ | — | Edit-only |
| **Colour Replace** | ✗ | ✓ | — | Edit-only |
| **Palette Swap** | ✗ | ✓ | — | Edit-only |
| **Stash Adapt** | ✗ | ✓ | — | Edit-only |
| Comparison slider | ✓ | ✓ (if preview URL present) | Yes | Shows original vs. preview in create; shows before/after edit in edit |
| Palette chips (display) | ✗ | ✓ | — | Not visible until pattern exists |

**Key finding:** Every generation control is **duplicated** in edit mode. The sidebar does not switch to a "clean edit" state after generation; it retains all the conversion sliders alongside a "Re-generate (values changed)" CTA. The user is simultaneously in an edit surface and a create surface.

---

## 6. Flow Clarity Problems

### 6.1 Mode Transition Is Invisible

After generation, `appMode` transitions from `"create"` to `"edit"` but the only visible signal is:
- The sidebar content changes (tools appear, conversion controls move down)
- The action bar shows "Edit" phase label

There is no "success" moment — no toast, no animation, no clear "you are now editing." Users who are watching the canvas will see the pattern appear; users who were looking at the sidebar will see it rearrange without explanation.

### 6.2 Generate vs. Regenerate Ambiguity

The Generate button changes to "Regenerate" after first use, but the consequences are very different:
- **First Generate:** non-destructive (no work to lose)
- **Regenerate:** destroys all manual edits

The warning ("will replace N edits") is on the Re-gen CTA in the sidebar, but the main Generate/Regenerate button in the sidebar footer does not have this warning. A user who forgets they've made edits and clicks the button will lose their work.

### 6.3 Conversion Parameters Visible in Edit Mode Without Clear Reason

All the image-processing sliders (brightness, contrast, dithering, etc.) remain visible in edit mode below the palette chips. A new user may interpret these as "live adjustments to the current pattern" (they are not — they only take effect after Re-generate). The sidebar does not label them as "Conversion settings" or indicate that they require a re-generate.

### 6.4 No Progress During Generation

Generation runs synchronously on the main thread. On a 200×200 pattern, this can take 2–5 seconds with no progress indicator. The Generate button label changes to "Generating…" but there is no spinner, progress bar, or percentage.

### 6.5 Live Preview and Final Generate Can Disagree

The live preview (300 ms debounce) runs the same pipeline but on a separate canvas. However, if the user moves a slider quickly and then clicks Generate before the debounce fires, they may get a different result from what they last saw in the preview. The diff overlay helps spot this, but the timing is not always predictable.

### 6.6 Crop Is Not Applied

The Import Wizard step 1 shows rotate/flip/aspect controls, but the description says "crop is applied when the pattern is generated." There is no visual crop rectangle on the image — the aspect ratio guide is shown as a label, not as a visual overlay. Users may not realise the crop has not been applied until they see the generated pattern.

### 6.7 No Way to Compare Multiple Generations

Re-generating replaces the pattern. There is no history of past generations. If a user generates, adjusts parameters, and re-generates, they cannot go back to the first generation (undo only covers manual edits, not re-generations).

### 6.8 Settings Silently Reset Context

When `stashConstrained` is turned on, the `allowedPalette` changes. If the user then turns it off and back on, the stash is re-read. If the stash changed between reads, the palette may be different. This is silent and has no confirmation.

When `sW` / `sH` change, any existing `arLock` behaviour applies automatically, but the `sH` field can jump unexpectedly if the user types in `sW` quickly.

### 6.9 No Back Path

Once a user has generated a pattern and is in edit mode, they cannot return to "create mode" (the pre-generation parameter panel view) without either:
- Discarding the whole project and starting over
- Clicking "Re-generate" (which destroys edits)

There is no "back to settings" button.

### 6.10 Orphan Slider and Cleanup Toggle Are Redundant

There are two separate mechanisms for orphan removal: the `orphans` slider (0–5+ cells) and the `stitchCleanup` toggle with its Strength sub-option. They map to the same underlying function with overlapping parameters. The slider is labelled "Remove Orphans" and the toggle is "Stitch Cleanup" — users often don't know which to use or that they interact.

Additionally, the Cleanup tool in edit mode does the same thing interactively. So the feature exists in three forms: conversion-time automatic (slider), conversion-time toggle (Stitch Cleanup), and post-generation interactive (Cleanup tool). This is the most severe example of create/edit overlap.

---

## 7. First-Time-User Friction

Concepts the UI assumes users already understand with no in-app explanation:

| Concept | Where assumed | Why it's not obvious |
|---------|--------------|----------------------|
| Stitch count (grid width × height) | Size inputs in create | Not the same as image pixel dimensions |
| Aida / fabric count | Fabric count dropdown | "14 count" means 14 holes per inch — total jargon to non-crafters |
| Skein | Shopping list, estimates | What is a skein? How many stitches does one cover? |
| DMC thread palette | Palette mode options | Why is "DMC" the default? What about other brands? |
| Dithering | Dithering radio group | No tooltip. "Balanced" vs "strong" — balanced what? |
| CIEDE2000 / ΔE | Not exposed, but affects threshold controls | The background threshold slider uses ΔE units (0–50) with no unit label |
| Thread blends | Allow Blends checkbox | What is a blend? How do you stitch one? |
| Confetti / isolated stitches | Confetti banner, stitch score | Shown as "High confetti" with no explanation of why it matters |
| Saliency | Saliency preservation toggle (wizard step 4) | Completely opaque to non-technical users |
| "Over two" | PrepareTab, fabric calculator | Over-two stitching technique |

Additional friction points:
- **No image quality feedback.** The UI does not tell users whether their image is suitable (too low resolution, too complex, solid logo that would work better as lineart, etc.)
- **No undo for generation.** Users cannot undo the first generation; if they don't like the result, their only option is to change settings and re-generate.
- **No colour count feedback before generating.** Users set `maxC = 30` without knowing if their image has 3 or 300 colours; the estimate shows only after generation.
- **No size feedback in physical units.** The size inputs are in stitches only; the finished physical size (which depends on fabric count) is shown in the PrepareTab shopping list, but not in the create flow itself.

---

## 8. Power-User Friction

Things a returning user has to redo every time:

| Friction | Current workaround |
|----------|-------------------|
| Re-enter `maxC`, `dithMode`, etc. every time | User preferences save some defaults (palette size, dithering mode, etc.) but not all |
| No ability to save a "create preset" for a specific image type (lineart, photo, cartoon) | None |
| Background removal must be re-configured for every image | The background colour picker resets to white; users working with coloured backgrounds must re-set it each time |
| Variation Seed is hidden behind an expand | Power users who rely on seed reproducibility need to find this each time |
| No batch processing | Images must be processed one at a time |
| Re-generate destroys edits | Users must either accept the trade-off or avoid any conversion-time-only changes after editing |

---

## 9. Mobile/Touch Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| Comparison slider is pointer-capture based — works on touch | Low (works) | Uses `setPointerCapture` / `releasePointerCapture` |
| Sidebar sliders on mobile are narrow; tap targets may be < 44×44 px | Medium | No explicit min-height on slider thumbs |
| Import Wizard steps are full-viewport modal — fine on mobile | Low | |
| Zoom slider in tool strip is small | Medium | Hard to hit precisely on phone portrait |
| Canvas panning requires a dedicated "Hand" tool — no two-finger pan | Medium | Common mobile pattern missing |
| No swipe gestures for wizard steps | Low | Next/back buttons work but swipe would be expected |
| The `Alt`-held zoom lens in the comparison slider does not translate to touch | Low | Alt key doesn't exist on mobile; lens is mouse-only |
| Colour picker for background colour may not have native touch support on all browsers | Medium | Uses `<input type="color">` — iOS Safari renders it differently |

---

## 10. Cross-Platform Considerations

| Issue | Affected platform | Notes |
|-------|------------------|-------|
| Drag-and-drop image upload may fail on iOS Safari (< 15) | iOS Safari | Some `dragover`/`drop` events require explicit `preventDefault` on `touchmove`; the existing code may not handle this |
| `canvas.filter` CSS filter support | Safari < 14, some edge cases | Used for brightness/contrast/saturation; may silently no-op on old Safari, producing wrong results with no error |
| `canvas.getContext("2d", { willReadFrequently: true })` | Chrome vs. Firefox | Missing on some paths; may cause performance warnings or hardware acceleration loss |
| `ImageData` allocation in quantise loop | All | Very large patterns may exceed device memory |
| 16384 px canvas limit | iOS Safari | Explicitly guarded in `PreviewCanvas` and `RealisticCanvas` but not in the main generation pipeline |
| `File.arrayBuffer()` for PDF import | Edge Legacy | Used in `pdf-importer.js`; not an issue for the create-from-image flow |
| `navigator.clipboard.writeText()` for shopping list copy | iOS Safari (insecure contexts) | Guarded with a try/catch; fails silently on `file://` |
| Web Worker generation | Not yet implemented | `generate-worker.js` exists but is unused; main-thread generation is the only path |

---

## 11. Summary of Create/Edit Boundary Issues

The core structural problem: **there is no clean create/edit boundary.** The current design is:

> *Create is the state before you click Generate for the first time. Edit is the state after. But all create controls remain visible in edit mode and can trigger a re-generation at any time.*

This means:
1. Users can change conversion settings while editing — sometimes intentionally, sometimes by accident
2. The Re-generate action is both the most powerful thing in create mode and the most destructive thing in edit mode
3. Edit-mode tools (cleanup, paint, fill) do the same things as some create-mode parameters (orphan slider, palette size) but non-destructively — yet there is no guidance on which approach to use
4. The comparison slider is designed for create (comparing original to preview) but exists in edit mode too, where it's less useful once edits have been made

---

## Phase 1 Questions for the User

Before beginning Phase 2 proposals, please answer these three questions. The proposals will be directly evaluated against your answers.

---

### Question 1: User Goals

Which of these scenarios do you most want the flow to serve well? Rank or mark the ones that matter, and add any that are missing.

- **Quick photo** — "I have a photo of my dog. I want a small pattern I can stitch this weekend. I want it to look OK, not perfect. I don't want to spend more than 5 minutes in the creator."
- **Clean lineart** — "I'm starting from a clean vector or line drawing. I want a specific limited palette (maybe just my stash). I'm happy to spend 10–15 minutes getting the colours exactly right."
- **Complex painting** — "I'm converting a detailed painting. I want a lot of colours, fine control, possibly an hour of tweaking. I know what dithering is."
- **Pattern Keeper export** — "I've made the pattern and just want to get it into a PDF I can take to my stitching group."
- **Stash-first** — "I want to use only threads I already own. The look of the pattern adapts to what I have."
- **Mobile / casual** — "I'm on a phone, I have two minutes, I want to see what the pattern would look like."

Are there other goals that belong on this list?

---

### Question 2: Essential Controls

Are there any controls in the current create flow you consider **essential** — meaning they should always be visible, always early in the flow, never hidden behind an "advanced" toggle? Which ones, and why?

---

### Question 3: Misplaced Controls

Are there any controls in the current create flow that feel like they're **in the wrong place**, but you're not sure where they belong? (These are good candidates for proposal differentiation — different proposals may put them in different places.)

---

*Phase 2 (proposals and HTML renders) begins after receiving answers to the above.*
