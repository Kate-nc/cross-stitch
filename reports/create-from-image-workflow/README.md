# Create from an image: workflow order audit

November 2026, v1.0.253. This audit is about the **order** of the steps, not
the quality of the conversion. It covers the journey from choosing a picture
on Home to having a chart, compares that order with eight other cross-stitch
tools, and proposes a new order.

Earlier work this builds on: [create-flow-audit.md](../create-flow-audit.md)
(October; partly out of date now), [create-flow-redesign-proposals.md](../create-flow-redesign-proposals.md)
and [convert-panel-audit.md](../convert-panel-audit.md). Those reports fixed
the panel's look, its feedback and the live preview. The order the decisions
come in has not been looked at since.

How this was checked: the current code was read, and the flow was walked in
Chromium at 1440×900 and on an iPhone 13 profile with a 1600×1200 photo
(subject off-centre, a fence post to crop away). The screenshots are in this
folder.

---

## 1. Summary

The order of the Convert steps is **Picture, Size, Threads, Detail, Project**.
Every other tool checked starts by **framing the picture** (crop, rotate,
clean it up), then sets **size**, then **colours**, then **style**. stitchx's
order looks like that at first, but has five problems:

1. **Cropping is a side action that happens too late.** It is a small button
   under a thumbnail, outside the steps. By the time someone crops, the app
   has already guessed the picture type, found the background, set the size
   and drawn a preview, all from the *uncropped* photo. Cropping does not
   repeat those choices.
2. **The first step mixes up two kinds of decision.** "Picture type" looks like
   a fact about the picture, but it actually sets the thread count, blends,
   detail and (for pixel art) the size. It sits next to brightness and
   contrast, which most people never need to touch.
3. **Related settings are split, and the important ones come last.** Settings
   about confetti stitches are spread across Threads and Detail. "Only use
   threads I own" changes every other thread setting, but it is at the bottom
   of Threads.
4. **The steps look like a wizard but don't work like one.** There are step
   tabs and Next buttons, and the tour says "work through the steps from left
   to right". But the preview is already finished when Convert opens, and
   Generate appears twice and works from any step. The last Next leads to the
   pattern's name and notes, not to Generate. On phones, every setting is
   inside a closed sheet and Generate is the main button.
5. **After Generate there is no review step.** The user is taken straight into
   Edit, where a tour tip, a five-line message, a "Ready to stitch review"
   bar and the palette list all appear at once.

There are also **three separate ways to turn a picture into a pattern**:
Convert in the Creator, the Tracker's own import dialog, and an experimental
five-step wizard. Each one uses a different order.

**Recommendation:** use three stages, the same split as Stitchmate and close
to Ursa's wizard:

> **Frame the picture** (crop, rotate, background, picture fixes; the app then
> looks at the framed picture) → **Make the pattern** (Size, Colours, Style,
> ending in one Create button) → **Review** (what you've made, then Print,
> Stitch or Edit).

Keep the parts where stitchx is already ahead of the other tools: the live
preview that looks like real stitches, the automatic guesses about the
picture, automatic background removal and the side-by-side Compare options.
They fit into the new order without changes. Section 6 gives a phased plan.
The first phase is mostly small fixes.

---

## 2. The journey today

| # | Where | What the user sees and does | What the app decides for them |
|---|---|---|---|
| 1 | Home | "What are you starting with?" Choose **A photo or picture**, or drop a file anywhere. A dropped picture gets "What's in this picture?" first. | — |
| 2 | Creator › Convert ([01](01-convert-landing-desktop.jpg)) | Three columns: **Your picture** (thumbnail with small **Crop** and **Change** buttons), a large **Preview** that is already stitched, and the settings panel open on the **Picture** step. The tour says to work through the steps. | Size set to 100×75 (from the full photo's shape). Picture type guessed (Photo), which sets 24 threads, blends on, Balanced. Background checked: if the picture's border is one plain colour it is left unstitched, with Undo. Name taken from the file name. |
| 3 | Picture step | Picture type (Graphic or logo / Photo / Pixel art / Custom), Background, Adjust picture (brightness, contrast, saturation, sharpen, soften). | — |
| 4 | Size step | Stitches or finished size, size presets (Bookmark, Card, 15 cm hoop, A4, Picture size), fabric count, fabric colour, cut fabric size. | — |
| 5 | Threads step | Brand, Threads (max), Blends, Rare colours (min stitches per colour), Stash (only threads I own, add a thread, variations). | — |
| 6 | Detail step | Detail and tidiness (4 steps), Shading pattern, Tidying, Look-alike colours. The first choice sets the three below it. | — |
| 7 | Project step | Pattern name, designer, notes. No Next: this is the end of the steps. | — |
| 8 | Crop (any time) ([02](02-crop-dialog-desktop.jpg)) | A dialog. Drag a rectangle, then **Apply crop**. No aspect ratios, no rotate, and Escape does not close it. | After the crop, height is recalculated if aspect lock is on. **Picture type, background and the starting values are not worked out again.** |
| 9 | Generate | Two buttons: the action bar's **Generate Pattern** and the panel's footer button. A progress overlay with Cancel. | The full conversion runs. Large patterns can differ slightly from the preview, which is an approximation above 40,000 stitches. |
| 10 | Creator › Edit ([03](03-after-generate-desktop.jpg)) | Chart, edit toolbar, colour strip, the "Tools and View are now unlocked" tip, the "Pattern generated and saved…" message (five lines), the "Ready to stitch review" bar, and the palette panel with an explanation paragraph. Convert, Edit and Materials tabs. | Saved to the library. |

On a phone ([04](04-convert-landing-phone.jpg)), steps 3–7 are inside a
**Settings** sheet that starts closed. The top bar's **Generate** is the
most obvious next action, so most people will make a pattern without seeing
any setting.

---

## 3. Findings

Ranked by how much each one affects the order. Each lists the evidence.

### F1. Framing comes last instead of first (high)

- Crop is not a step. It is an outlined `Crop` button under a 220px thumbnail
  ([creator-main.js](../../creator-main.js), `cvp-source__controls`). None of
  the steps mention it.
- Everything the app works out automatically happens on upload, from the
  uncropped picture: picture type, background, starting size and preview
  ([creator/useProjectIO.js](../../creator/useProjectIO.js) `handleFile` →
  `examinePicture`, `autoSkipBackground`, `creatorInitialSize`).
- `applyCrop` ([creator/useCanvasInteraction.js](../../creator/useCanvasInteraction.js))
  replaces the picture and fixes the height, but does not run
  `examinePicture` again. So if you crop a photo down to a logo, it is still
  treated as a photo. The background found on the old border is still left
  unstitched. And with pixel art, the size taken from the picture
  (`sizeFromSourceMax`) still uses the old picture's dimensions.
- The crop dialog only lets you drag freely. There are no ratios, even though
  the Size step offers hoop, card and A4 presets, which have fixed shapes.
  There is no rotate or straighten. Escape does not close it (Playwright
  confirmed this: the dialog was still open and blocking clicks 30 s after
  Escape was pressed).
- Every other tool in section 4 crops before any other choice. Ursa's own help
  says "Step 1 is to crop the image to just the subject area". Stitchmate's
  whole first stage is "Photo (crop, straighten, erase the background)".

### F2. "Picture type" is a recipe, shown as a fact about the picture (high)

- `PICTURE_PRESETS` ([creator/useCreatorState.js](../../creator/useCreatorState.js))
  sets `maxC`, `allowBlends`, the Detail step, background skipping and, for
  pixel art, `sW/sH`. Those settings are on the Size, Threads and Detail
  steps, not on Picture.
- Changing any one of them switches the type control to **Custom**. So moving
  the Threads slider from 24 to 20 says the *picture* is no longer a "Photo",
  which confuses people. The hint has to explain this: "Custom: you have
  changed settings since choosing a type…".
- The same step has Adjust picture (five controls), which the panel itself
  says "most pictures need none of", and a note about printed charts. The
  first screen someone sees is therefore spent on controls they will rarely
  use.

### F3. The order of the settings doesn't follow which choices depend on which (medium)

- **Stash first, not last.** "Use only stash threads" sets the maximum for
  Threads (max), can turn off blends, and limits which colours are possible.
  It is the final section of Threads, after the settings it overrides.
- **Confetti settings are split.** "Rare colours: min stitches per colour" is
  on Threads. "Reduce confetti", "Detail and tidiness", "Shading pattern" and
  "Look-alike colours" are on Detail. All of them trade likeness for ease of
  stitching.
- **Brand gets prominent space but is rarely changed.** DMC/Anchor is set
  once by most people. It is the first thing on Threads, ahead of the thread
  count, which matters far more.
- **Project info is not a conversion setting.** Name, designer and notes are
  the fifth step, and the Next buttons end there. The name is already taken
  from the file name automatically, and the app asks for one before the first
  export (`NamePromptModal`, reason `export`). Edit has its own Project tab.

### F4. It's unclear whether the steps are required (medium)

- On desktop, step tabs plus "Next: …" buttons
  ([creator/ConvertPanel.js](../../creator/ConvertPanel.js) `CONVERT_TABS`)
  and the tour's "Work through the steps in the panel on the right from left
  to right" say *you must do these in order*.
- But the preview is already finished, **Generate Pattern** is in the action
  bar *and* the panel footer from the first second, and nothing changes if
  you skip the steps. That says *the steps are optional*. Users get both
  messages at once.
- On phone, the reverse is true: the settings sheet starts closed and the
  top-bar **Generate** is the main action.
- Pick one approach. Every step already has a working default, so the honest
  message is "these are optional adjustments, in the order you'd think about
  them". Section 5 is built on that.

### F5. No review between Generate and Edit (medium)

- Generate switches to Edit, the Edit tab and the Pattern view in one go
  (`setAppMode("edit")`). The first screen ([03](03-after-generate-desktop.jpg))
  shows four messages at the same time. They compete for attention, and the
  tour tip covers part of the palette.
- There is a review screen already (`ReadyReview`, "Compare the current
  chart, stitch preview, size and material assumptions before buying"). But
  it is shown only as a bar in Edit, after the user has been dropped into the
  editing tools.
- Most people's next step after converting is *look → print or stitch*, not
  *edit stitches*. Every competitor drops you into its editor too, so this is
  not behind the field. But the review screen stitchx already has could be
  the place users land.

### F6. Three ways to convert a picture, each in a different order (medium)

| Path | Where | Order |
|---|---|---|
| Convert | Creator | Picture → Size → Threads → Detail → Project; crop is separate |
| Import Image Pattern dialog | Tracker, open a picture file ([tracker-app.js](../../tracker-app.js) ~10680) | **Project name first**, then settings, in one dialog |
| ImportWizard (experimental, off by default) | Tracker, `experimental.importWizard` ([creator/ImportWizard.js](../../creator/ImportWizard.js)) | Crop → Palette → Size → Preview → Confirm |

The experimental wizard is the only one that puts crop first, and it is
switched off. Some combinations of these paths mean users meet different
orders, labels and defaults for the same job.

### F7. Smaller order and wayfinding problems (low)

- The header says **No project** while Convert is open, and the phone top bar
  says **New pattern**, even though the name is already set from the file
  (it appears only after Generate).
- The Picture step ends with "Next: Size and fabric" and the Detail step with
  "Next: Project". None of the Next buttons lead to Generate.
- After Generate, a block of explanation in the palette panel ("Use Change
  symbol beside a thread…") appears at body-text size, larger than the rest
  of the panel ([03](03-after-generate-desktop.jpg)). It looks like a style
  rule was missed. This was seen once and its cause was not investigated.

### What already works and should stay

- **Good starting values with no effort**: the type guess, automatic
  background removal with Undo, a sensible size and a name from the file.
  None of the other tools checked guess the picture type and change their
  starting values to match.
- **The live preview looks like real stitches** and says what each change
  did. Ursa's preview is a separate window; PCStitch and Pixel-Stitch show
  the result only after converting.
- **Compare options** (neighbouring sizes and thread counts side by side).
- **Going back to Convert asks first only when there are manual edits**
  (`handleRequestBackToConvert`), and Regenerate says how many edits it will
  replace. Every competitor that reports this (PCStitch, Stitchmate) also
  replaces edits when you convert again, so stitchx is not behind here.

---

## 4. How other tools order it

The page fetches were blocked by this environment's network, so this comes
from search results that quote the tools' own help pages where possible.
Official sources are marked; the rest are third-party guides and may describe
older versions.

| Tool | Order from picture to chart | Source |
|---|---|---|
| **MacStitch / WinStitch** (Ursa) wizard | 1 **Crop** to the subject → 2 brightness and contrast → 3 maximum colours ("allow many colours initially, and reduce them manually afterwards") → 4 **Photo** (dithered) or **Clip art** (solid). The Advanced import adds a Preview window and a mask so only part of the picture is imported. | Official: [The Import Wizard](https://ursasoftware.com/help/2023/TheImportWizard.html), [Advanced Image Import](https://ursasoftware.com/help/2023/AdvancedImageImport.html), [Importing Pics (2012)](https://www.ursasoftware.com/help/2012_en/filemenu/page14/page14.html) |
| **PCStitch** | Picture → **crop** → **size** (stitches or measurement) → floss type and number of colours → preview. To change size or colours later, you import the picture again. | Official: [PCStitch Import](https://www.pcstitch.com/PCSStandard/Features/Import/Import.aspx); forums: [Creating a Pattern from Photo](https://www.pcstitch.com/forums/topic.asp?TOPIC_ID=170), [Conversion of picture](https://www.pcstitch.com/forums/topic.asp?TOPIC_ID=2089) |
| **Stitchmate** (web) | **Photo** stage: crop, straighten, rotate, flip, erase background, *say what kind of picture it is* → **Pattern** stage: size, threads, colours, detail, clean up, with a live chart and quality score → **PDF**. "Re-import replaces everything." | Official: [Image Import handbook](https://stitchmate.app/handbook/image-import), [Handbook](https://stitchmate.app/handbook) |
| **KG-Chart** | One dialog: title, author, cloth (Aida or linen) → **size** (cm or stitches) → palette (DMC…) → number of colours ("roughly, never more"). | Official: [Converting an image to a chart](https://www.iktsoft.net/kgchart-en/manual-cs/9189) |
| **KXStitch** | Import options: **crop**, scale to finished size, maximum colours, limit to a palette, ignore a colour (background), fractional stitches. | Official: [KDE UserBase features](https://userbase.kde.org/KXStitch/Features); review: [LinuxLinks](https://www.linuxlinks.com/kxstitch/) |
| **DMC Stitch Your Photos** | Upload → filter and fabric count → finished size and number of colours → chart by email. No crop step. | Official: [Help and advice](https://www.dmc.com/US/en/stitch-your-photos/help_and_advice) |
| **Pixel-Stitch** | Upload → **width** (height follows) → **number of colours** → turn off individual palette colours. | Official: [Instructions](https://www.pixel-stitch.net/sites/instruction.html) |
| **Pic2Pat** | Upload → width in stitches and number of colours → brand → Convert. | Third party: [Pixotter guide](https://pixotter.pages.dev/blog/photo-to-cross-stitch/) |
| **Stitch Fiddle** (crochet and knitting import) | Upload → width and height + gauge + colours. Guides say to "crop tight around your subject first", before uploading. | Third party: [Willow Crochet](https://www.willowcrochet.com/how-to-make-graphgan-charts-with-stitch-fiddle/), [Patterns Here](https://patternshere.com/crochet-from-photo-pattern/) |

**What they agree on:**

1. **Framing comes first.** Every tool with a crop step puts it before
   anything else. Tools without one (DMC, Pixel-Stitch, Pic2Pat) tell you to
   crop before uploading.
2. **Picture fixes go with framing.** Brightness and contrast are Ursa's
   step 2, straight after crop. Background removal is in Stitchmate's Photo
   stage and Ursa's mask, before any pattern setting.
3. **Size before colours.** Every tool asks for the size, or size and
   fabric, before the number of colours. That makes sense: how many colours
   are worth having depends on how many stitches there are.
4. **Style comes last, and is a single choice.** Ursa: Photo or Clip art.
   DMC: a filter. stitchx's four-step Detail and tidiness already works
   like this.
5. **The pattern's name isn't part of converting.** KG-Chart and the stitchx
   Tracker dialog ask for it first. The rest don't ask during conversion.
6. **Converting again replaces your edits.** This is the same everywhere.

The tool closest to the proposal below is Stitchmate. It splits the job into
a **picture** stage and a **pattern** stage, and asks what kind of picture it
is in the picture stage.

---

## 5. Proposed workflow

```
Home: choose a picture
   │
   ▼
1. FRAME THE PICTURE     (full width; opens on arrival)
   Crop: Free · Square · 4:3 · 3:4 · Hoop   Rotate · Straighten
   Background: shown highlighted on the picture; click to change it
   "This looks like a Photo" — Graphic or logo · Pixel art
   ▸ Fix the picture: brightness, contrast, saturation, sharpen, soften
   [ Continue ]  (if nothing was changed, the whole picture is used)
   │      the app looks at the framed picture here: type, background, size
   ▼
2. MAKE THE PATTERN      (today's preview and panel; three steps)
   Size     size and fabric, presets, finished and cut size
   Colours  [ ] Only threads I own   Threads (max)   Blends
            ▸ More: brand, rare colours, variations
   Style    More detail · Balanced · Tidier · Easiest to stitch
            ▸ Fine-tune: shading, tidying, look-alike colours
   [ Create pattern ]  (one button; always available)
   │
   ▼
3. REVIEW                (today's ReadyReview, opened first)
   Chart · stitched preview · threads and skeins · time · confetti
   Name: [dog-photo]   (prefilled; editable)
   [ Print PDF ]  [ Start stitching ]  [ Edit stitches ]  [ Change settings ]
```

### Why this order

- **Framing comes before the guesses.** Picture type, background and starting
  size are guessed from the picture the user actually chose. F1's stale
  guesses after a crop can no longer happen. This is also what every
  competitor does.
- **Stage 1 is about the picture; stage 2 is about the pattern.** The picture
  type becomes a fact about the picture, as it looks. It decides the
  *starting values* in stage 2 but no longer shows "Custom" when a thread
  setting changes (F2). That job moves to Style's "Custom", which is honest:
  you've changed the style, not the picture.
- **Within stage 2, each choice comes before the ones that depend on it.**
  Size limits how much detail the colours can show. "Only threads I own"
  limits Threads (max) and blends. Style tidies whatever the first two made
  (F3).
- **No step is required.** The steps have no Next buttons. The panel footer's
  **Create pattern** is the only main action, and the action bar's copy is
  removed. The tour says "adjust anything you like, in any order" rather
  than "work through the steps" (F4). On a phone, the Frame stage takes the
  whole screen, and stage 2 opens with the settings sheet half-open on Size
  rather than closed.
- **Review before editing.** Most users want to look, then print or stitch.
  Showing the existing ReadyReview first, with the name field there (where
  the name is used), replaces the four overlapping messages (F5) and removes
  the Project step from conversion (F3).
- **One way to convert.** The Tracker's image import sends the picture to
  this same flow and comes back to the Tracker afterwards. The experimental
  ImportWizard is removed (F6).

### Mapping today's settings to the new places

| Today | Proposed |
|---|---|
| Crop button under the thumbnail; crop dialog | Stage 1, full width, with ratios and rotate. "Reframe" on the source card in stage 2. |
| Picture › Picture type | Stage 1, shown as the guess with two alternatives. Changing it resets stage 2's starting values. |
| Picture › Background | Stage 1. Shown as a highlight on the picture, not a checkbox and an eyedropper. |
| Picture › Adjust picture | Stage 1, folded away under "Fix the picture". |
| Size › everything | Stage 2 › Size (unchanged). The crop ratios match the size presets. |
| Threads › Stash | Stage 2 › Colours, **first**. |
| Threads › Threads (max), Blends | Stage 2 › Colours. |
| Threads › Brand, Rare colours, Variations | Stage 2 › Colours › More. Brand defaults from Preferences. |
| Detail › Detail and tidiness | Stage 2 › Style. |
| Detail › Shading, Tidying, Look-alike | Stage 2 › Style › Fine-tune. |
| Project › Name | Stage 3 (prefilled from the file name). |
| Project › Designer, notes | Edit › Project (already there) and the export dialog. |
| Action-bar Generate | Removed. One **Create pattern** button in the panel footer, or the phone top bar. |

---

## 6. Phased plan

Each phase works on its own and can ship separately.

**Phase A: small fixes, no change to the structure**
1. Escape closes the crop dialog. Add Free / Square / 4:3 / 3:4 ratios and
   rotate 90° (the ImportWizard's crop step already has the ratios and
   rotate code).
2. After a crop, run `examinePicture` again, so the type, background and
   pixel-art size come from the cropped picture. Show the "Background left
   unstitched" message again if that result changes.
3. Move Stash to the top of Threads. Move Rare colours into Detail, next to
   Tidying.
4. Remove the Project step from Convert. Detail's Next becomes **Generate**.
   The name stays automatic from the file, with the existing prompt before
   export.
5. Remove the action bar's duplicate Generate while in Convert, on desktop.
6. Show the file-based name in the header during Convert instead of "No
   project" / "New pattern".

**Phase B: the Frame stage**
7. A full-width Frame view opens when a picture arrives. It holds crop,
   rotate, background, Fix the picture and the type guess, with Continue. A
   preference can skip it for people who always use the whole picture.
8. Convert's steps become **Size, Colours, Style**. "Custom" moves from
   picture type to Style.
9. Rewrite the creator tour. Update the help ([help-drawer.js](../../help-drawer.js)),
   `APP_CHANGELOG`, and the e2e specs that check the step names
   (`tests/e2e/convert-steps-and-preview.spec.js`,
   `convert-picture-presets.spec.js` and others).

**Phase C: Review, and one conversion path**
10. After the first Create pattern, open ReadyReview with Print / Start
    stitching / Edit stitches / Change settings and the name field. Hold back
    the first-stitch tip and the long success message until the user chooses
    Edit.
11. Send the Tracker's picture import to Convert, coming back to the Tracker
    afterwards. Remove `experimental.importWizard` and the legacy Tracker
    dialog.

## 7. Decisions needed

1. **Should the Frame stage always appear, or only when the picture probably
   needs it?** For example: very wide or tall pictures, a busy border, or a
   subject well off-centre. Showing it every time is simpler and matches the
   other tools. Showing it only sometimes saves a click for pictures that are
   already framed.
2. **Step tabs or one scrolling column for stage 2?** The panel audit moved
   away from a long accordion. With only three short steps, a single column
   might now fit on desktop. This proposal keeps the tabs.
3. **After Create: Review or Edit?** This proposal says Review. People who
   mostly hand-edit converted charts may prefer a preference to go straight
   to Edit.

---

## 8. Decisions and status (November 2026)

- **Frame stage:** shown every time a picture arrives, with a Preferences
  option to turn it off.
- **Stage 2:** keeps the step tabs.
- **After Create:** land in Edit, with one "Your pattern is ready" bar in
  place of the separate Review page (item 10, reduced). The Convert preview
  already does most of a review's job, so a separate page would mostly add a
  click for people who edit.

**Phase A is done.** Items 1–6 shipped as written, with these differences:

- The last step has no Next button. Instead, a note points to the Generate
  button at the foot of the panel, so there is still only one Generate.
- Stash is split in two. "Use only stash threads" opens Threads, and the
  stash tools (your threads, Add a thread, variations) come after the brand.
- Brand moved below Threads (max) and Blends.
- The crop re-check keeps choices the user made: the picture type's starting
  values are reapplied only while the settings are not Custom, and a
  background the user picked is kept.
- Tests: `tests/cropReframe.test.js` (unit) and
  `tests/e2e/convert-crop-reframe.spec.js` (browser).

**"Your pattern is ready" is done** (`creator/ReadyBar.js`). After Generate,
one bar above the chart says what was made: size, threads, chart symbols,
about how many skeins, and that it is saved. It has Print PDF, Open in
Tracker and Threads to buy (Materials > Threads), plus links to Ready to
stitch review and What's a blend?. It replaces the success toast and, while
it shows, the Tools tab tip, the first-stitch tip, the review note and the
shortcuts hint. It closes on its buttons, the first edit or leaving Edit.
The Palette panel's notes, which were showing at body-text size, got their
missing small-print style.

**Phase B is done.** Items 7–9 shipped as written, with these differences:

- Frame shows the picture with the settings beside it, rather than every
  control on top of the picture. Each crop or turn applies straight away,
  with Undo (up to ten steps), so the type and background update as you go.
  A rectangle still drawn is applied by Continue.
- The background was not at first shown as a highlight on the picture. It
  was a checkbox and a colour picker, now in Frame. The stripes came in the
  follow-ups below. Brightness, contrast and
  saturation do show on the picture as they change.
- Stage 2's steps keep their names: Size, Threads, Detail. They were not
  renamed to Size, Colours, Style, because "threads" is the app's word
  throughout.
- On a phone, Continue replaces Generate in the top bar during Frame. Stage 2
  opens with the settings sheet closed, as before, not half-open, so the
  preview stays visible.
- The picture type no longer turns into Custom. It records whether the
  Creator guessed it: after a crop the Creator guesses again only if it made
  the guess and nothing it set has changed.
- A Convert draft keeps its crop, and continuing a draft skips Frame.
- The crop dialog is gone. The steps no longer include Picture, and an old
  stored "picture" step opens Size.
- Preference: Preferences > Pattern Creator > Start with Frame the picture
  (on by default; portable in backups).
- Tests: `tests/cropReframe.test.js`, `tests/convertPanel.test.js`,
  `tests/e2e/convert-crop-reframe.spec.js` and
  `tests/e2e/creator-ready-bar.spec.js`, plus the existing specs moved to the
  new flow.

**Phase C is done.** Item 11 shipped as written:

- Opening a picture in the Stitch Tracker (File > Open) now saves the open
  project, then hands the picture to Convert in the same way Home does.
  `BlobStore.handOffPicture` is shared by both and is the same code Home used
  before. The picture opens on Frame the picture, and "Your pattern is
  ready" puts Open in Tracker first, with a line saying to start stitching
  it there.
- The Tracker's own one-dialog image import has been removed, along with its
  ten pieces of state.
- The experimental five-step wizard has been removed: `creator/ImportWizard.js`,
  `creator/useImportWizard.js`, `creator/import-wizard-bundle.js` and its
  build step, the page loaders, the precache entry, the
  `experimental.importWizard` preference and its switch, its help entry, and
  its tests (`c7ImportWizard*`, `smallHelpersWizard`, and the two
  `import-wizard-*` browser specs).
- `parseImagePattern` stays. The import engine's image strategy uses it, and
  `tests/imageImportWizardPipeline.test.js` still covers it. The crop, rotate
  and saliency options it gained for the wizard are now used only by that
  test.
- Tests: `tests/blobStore.test.js` covers the shared handoff and both of its
  callers. `tests/e2e/tracker-picture-to-creator.spec.js` covers the whole
  path from the Tracker, and checks that a picture from Home keeps Print
  PDF first.

All three phases of section 6 are now done, so there are now one way to
convert a picture and one order to do it in.


## 9. Review and audit passes (PR 425)

**First-use review.** These were found by walking the flow as a new user, with
tours on, on desktop and phone. All are fixed:

- Small pictures were almost invisible in Frame (a 9×7 sprite showed at
  9×7 px). They are now shown at least 360 px across, with sharp pixels.
- **Dark mode (bug already on `main`).** The chosen option in every row of
  choices, the chosen Convert step, and the Generate and Continue buttons all
  showed in the same grey. The cause: the blanket
  `html.pref-dark button:not(…)` rule outweighed the overrides once Stock-take
  added two more exclusions. The exclusions are now wrapped in `:where()`, so
  the rule's weight no longer grows.
- **Notices.** Closing the ready bar brought back three notices at once. The
  shortcuts hint and the review note now wait while a one-off tip is showing.
- **Tips.** The Tools tab tip named tabs that no longer exist, and showed on
  phones, where those tabs are hidden. On phones, tours said "Press ?".
- **Empty stash.** Use only stash threads gave a confusing result: a preview
  that "uses every thread", Generate stopping with a 3-second message, and a
  stray "0" in the panel. Now the box can't be ticked and a note links to the
  Stash Manager.

**Code audit.** All of these are fixed:

- In Frame, Undo after Change picture brought back the previous picture. A
  picture Frame did not put in place now starts a new Undo list.
- Use only stash threads was locked, and showed the empty-stash note, while
  the stash was still loading. The Creator now waits until the stash has been
  read.
- On a phone, the floating ready bar covered the settings drawer. It now sits
  under the drawer.
- Reframing a picture that already has a chart didn't say the chart is kept.
  Frame now says so.
- The Tracker hand-off gave no message when the open project's save was held
  or merged. It now explains why the picture didn't open, and it uses the
  shared `noWriteReason` check.
- Frame's Escape and Enter keys could act inside a dialog opened over it.
  Keys typed in dialogs are now left to the dialog.
- The "from the Tracker" flag survived Change picture. It is now cleared.

**Help and tutorials.**

- A two-step Frame tour now runs the first time someone adds a picture, and
  hands on to the converting tour after Continue. Making the pattern no
  longer starts a third ("Your chart") tour. Replaying from Help plays the
  tour for the current screen. On phones the tour points at the top bar's
  Continue.
- The help drawer, the wiki (Pattern Creator tutorial, Getting started,
  Stitch Tracker guide, Home), `TERMINOLOGY.md` and stale code comments now
  describe Frame the picture, the Size, Threads and Detail steps, Your
  pattern is ready, and opening pictures from the Tracker.

**Follow-ups, done:**

- **A crop box that can be moved and resized.** Dragging inside a drawn box
  moves it, and its handles resize it. The corners keep a chosen shape, and a
  Free box also has edge handles. The handles are larger on touch screens.
  Arrow keys move the focused box, and Alt with the arrows resizes it. A
  second finger or a cancelled pointer puts a moved box back. The geometry is
  in `moveCropRect`, `resizeCropRect` and `nudgeCropRect`
  (`creator/useCanvasInteraction.js`).
- **A background highlight on the picture.** While Leave background
  unstitched is on, Frame stripes the stitches Generate will leave out. It
  uses the same grid (`gridPixels`) and the same test
  (`prepareConversionPixels`) as Generate, so the count under the picture is
  exactly what Generate leaves out. It updates with the colour and How close
  a match. Hide stripes turns it off. If nothing at the edges matches, it says
  every stitch is kept.
- **A progress indicator.** A step bar across the top of Frame and Convert
  reads Frame, Size, Threads, Detail, Generate. It marks the step on screen,
  ticks the steps opened since the picture came in, says "Step N of 5", and
  opens any step clicked. From Frame it continues first, applying a box still
  drawn. On a phone it opens the settings sheet on that step, and only the
  step on screen is named.

Tests: `tests/cropReframe.test.js` (geometry) and
`tests/e2e/frame-crop-background-steps.spec.js`.
