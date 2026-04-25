# UX-2 — Personas & Journey Maps

> Three personas grounded in the domain reference
> ([ux-1](ux-1-domain-research.md)). Each persona walks the *current*
> app end-to-end so Phase 2 audits have a concrete frame for "what
> friction does this surface cause?".
>
> Legend: ✅ smooth · ⚠️ friction · 🛑 blocker

---

## Persona 1 — "Beginner Bea"

**Snapshot.** Bea, 34, started cross-stitching during lockdown after
seeing a kit on TikTok. She has finished two small kit patterns from
Hobbycraft. She wants to turn a photo of her cat into a stitchable
pattern as a birthday gift for her mum.

| Attribute | Value |
|---|---|
| Stitching experience | ≤ 1 year, two small kits |
| Patterns owned | 0 self-made, 2 store-bought (still in their packets) |
| Stash | A Hobbycraft starter set (~30 DMC skeins), no tracking |
| Tech comfort | Comfortable with Instagram, Canva, online shopping. Not technical. |
| Devices | Android phone (always), Windows laptop (sometimes) |
| Goal | "Convert this cat photo into a chart and print it." |
| Frustration triggers | Jargon (skeins, count, evenweave), busy screens, anything that demands a sign-up before showing results |
| What makes her give up | A 5-step wizard before the preview; a pop-up that asks her to "manage her palette" before she's seen anything |

### Bea's first journey — image to printed PDF

| Step | Surface | Status | Note |
|---|---|---|---|
| 1. Lands on `index.html` from a friend's link | Home | ✅ | Welcome wizard fires (correctly first-run only) |
| 2. Skims welcome wizard | Modal | ⚠️ | Three steps feel "salesy". Bea clicks Skip. |
| 3. Sees Home dashboard with "Start New" panel | Home | ✅ | Drop zone is clearly labelled "DROP IMAGE HERE" |
| 4. Drags her cat photo onto the drop zone | Home | ✅ | Image accepted, Creator opens with photo loaded |
| 5. Lands on Pattern tab; sees a generated chart immediately | Creator → Pattern | ✅ | Default 80×80, ~30 colours — looks like the cat |
| 6. Right-rail Sidebar is dense (image, dimensions, palette, preview, project, multiple sub-sections each) | Creator → Sidebar | ⚠️ | Bea doesn't know which knob does what; the *preview* is already what she wants |
| 7. Tries to make the cat bigger; finds Dimensions section, drags slider | Creator → Sidebar > Dimensions | ⚠️ | Slider re-quantises slowly. Bea is unsure if it's broken. |
| 8. Notices "limit to stash" toggle and the warning panel about unowned threads | Creator → Sidebar | 🛑 | She doesn't have a stash. The warning is irrelevant and confusing. |
| 9. Tries to print/download | Creator → top tab | ⚠️ | Has to click *Materials & Output* which doesn't read as "print" or "download" |
| 10. Inside Materials & Output, finds the Output sub-tab | Creator → Materials | ⚠️ | Three other sub-tabs first; she clicks Threads, Stash, Shopping by mistake |
| 11. Clicks "Export PDF" | Creator → Output | ✅ | PDF generates and downloads |
| 12. Opens PDF on her phone to print at the library | PDF reader | ✅ | Pattern is readable, has legend and grid |

**Outcome:** Success, but with two near-abandonment moments
(steps 8 + 10). She has not tried the Tracker or Stash and has no idea
what they're for.

**Top friction for Bea:**

- The "limit to stash" warning is shown to a user with no stash.
- "Materials & Output" is the wrong label for a beginner who wants to
  *print*.
- Sidebar density when most controls are irrelevant for her use case.
- No "Print PDF" CTA visible from the Pattern tab.

### Bea's second journey — tracking her stitching from her phone

| Step | Surface | Status | Note |
|---|---|---|---|
| 1. Opens `stitch.html` on Android Chrome | Tracker (loading) | ⚠️ | Babel compiles in-browser; first paint is delayed (~3-5 s on mid-range Android) |
| 2. Sees the project picker / dashboard | Tracker home | ✅ | Cat project listed, with thumbnail and 0% |
| 3. Taps project, lands in tracker view | Tracker | ⚠️ | Toolbar is dense at phone width; the canvas only takes ~50% of the viewport |
| 4. Tries to mark her first stitch | Tracker → grid | ⚠️ | Tap target on a 14ct preview cell at default zoom is too small; she pinches in |
| 5. Pinch-zoom feels reasonable but cell-detection wobbles at edges | Tracker → grid | ⚠️ | Off-by-one taps mark wrong cells |
| 6. Discovers the "Edit pattern" pencil and accidentally enters edit mode | Tracker | ✅ | Phase A2's red banner correctly warns her she's in edit mode; she taps Exit |
| 7. Wants to see "what colour am I about to stitch" | Tracker | ⚠️ | The colour drawer is at the bottom and partly covered by Android nav bar |
| 8. Sets phone down to actually stitch a few X's | Phone | ⚠️ | Screen sleeps; she has to unlock and find the app every minute |
| 9. Comes back later — does it remember her place? | Tracker | ✅ | The Welcome Back modal (A3) summarises her last session |

**Outcome:** Tracking is workable but feels like "a desktop site on my
phone". She would not recommend the tracker on its own.

**Top friction for Bea:**

- First load is slow on a mid-range phone.
- Default cell size at default zoom is too small for fingertip taps.
- Bottom drawer collides with the OS gesture bar.
- No "keep screen awake while stitching" toggle.

---

## Persona 2 — "Experienced Eli"

**Snapshot.** Eli, 47, has stitched for 15 years. He has 30+ WIPs, a
500-skein DMC stash, and works mainly on full-coverage HAEDs (Heaven and
Earth Designs — photorealistic 200×300+ charts with 80–120 colours).
He uses Pattern Keeper on his Samsung tablet to track and currently
keeps his stash in a Google Sheet that's perpetually 6 months out of
date.

| Attribute | Value |
|---|---|
| Stitching experience | 15+ years |
| Patterns owned | 200+, mostly purchased |
| Stash | ~500 DMC skeins, 50+ Anchor, some hand-dyed |
| Tech comfort | Power user (built his own NAS, runs Plex). Not a developer but unafraid of options. |
| Devices | Samsung Galaxy Tab S9 (always while stitching), Windows desktop, Pixel phone |
| Goal | Manage 30+ WIPs, track stitching pace, keep stash accurate, plan next purchase |
| Frustration triggers | Anything slow, anything that doesn't sync, lost progress, hand-holding tutorials |
| What makes him give up | Crashes / data loss; missing pro features (parking, pages, layers); poor performance on 200×200+ charts |

### Eli's first journey — import an existing PDF chart and start tracking

| Step | Surface | Status | Note |
|---|---|---|---|
| 1. Opens `stitch.html` on his desktop | Tracker home | ✅ | |
| 2. Imports a 60-page Heaven and Earth PDF | Tracker → import | ⚠️ | PDF importer is feature-flagged; Eli has to discover it; supported designer detection is partial |
| 3. Pattern loads — 250×280, 90 colours | Tracker | ⚠️ | First render takes 2-4 s; canvas is responsive after but pan jitters at high zoom-out |
| 4. Switches to highlight mode and taps a colour to find all instances | Tracker | ✅ | Highlight modes (1–4) are powerful; he learns them via shortcuts |
| 5. Marks his first session done by drag-selecting | Tracker | ⚠️ | Drag-mark is feature-flagged off (B2); tap-to-mark only by default |
| 6. Wants parking markers because it's full-coverage | Tracker → Navigate mode | ✅ | Navigate mode + parking markers exist and work |
| 7. Switches to tablet to continue stitching | Tablet | 🛑 | No sync. He must re-import the PDF and lose marked progress unless he exports/imports JSON manually |
| 8. Opens File → Sync folder | Header | ⚠️ | Sync exists but requires picking a folder; behaviour around iCloud/OneDrive is undocumented; not a real cross-device live sync |
| 9. Falls back to "save → email JSON to himself" workflow | Manual | 🛑 | This is exactly what Eli was trying to escape |

**Outcome:** Eli concludes the tracker is "promising but not
Pattern-Keeper-grade for a power user", primarily because of cross-device
continuity and the drag-mark gate.

**Top friction for Eli:**

- No live cross-device sync; the file-sync folder is a partial answer.
- Drag-mark feature-flagged off by default.
- PDF import is buried; supported designers list isn't surfaced.
- Tracker performance noticeably slower than Pattern Keeper on the same
  pattern.

### Eli's second journey — manage stash + plan a thread purchase

| Step | Surface | Status | Note |
|---|---|---|---|
| 1. Opens `manager.html` | Manager → Threads | ✅ | Search + brand filter (A6) is genuinely useful |
| 2. Bulk-adds 50 DMC IDs from a kit he just unboxed | Manager → Bulk Add | ✅ | Modal works; round-trips into stash |
| 3. Switches to Patterns tab — sees his pattern library | Manager → Patterns | ✅ | Auto-synced cards show progress, missing-thread badges |
| 4. Switches to Shopping tab — sees aggregate deficits across his active WIPs | Manager → Shopping (B4) | ✅ | This is the killer feature — no other tool does this |
| 5. Sorts shopping list by deficit and "Add all to shopping list" | Manager → Shopping | ✅ | |
| 6. Wants to print or share the shopping list to take to his LNS | Manager → Shopping | ⚠️ | No "share" / "print shopping list" affordance; he'd take a screenshot |
| 7. Wants to see "what brands does each pattern use" cross-referenced | Manager | ⚠️ | Brand info is per-thread, not aggregated per-pattern |
| 8. Tries the Anchor cross-conversion for a discontinued DMC | Manager → Threads | ⚠️ | Conversion data exists but isn't surfaced in the per-thread view as "X is your Anchor equivalent" |

**Outcome:** This *is* the workflow that keeps Eli on the app. The
integration is genuinely better than Pattern Keeper + spreadsheet.
Three points of polish would make it self-recommending.

**Top friction for Eli:**

- Shopping list can't be exported or shared as text/PDF for shop trips.
- Brand cross-conversion isn't surfaced inline.
- No way to view "this pattern uses X DMC + Y Anchor + Z hand-dyed".

### Eli's third journey — designing a custom modification of an existing pattern

| Step | Surface | Status | Note |
|---|---|---|---|
| 1. Opens his existing project in Creator (Edit) | Creator | ⚠️ | Has to know that Creator doubles as an editor; "Edit" is not on the project card |
| 2. Selects the Magic Wand and clicks a colour region to recolour | Creator → tools | ✅ | Wand + paint flow is good |
| 3. Wants to swap palette to a different DMC subset | Creator → Palette Swap | ⚠️ | Palette Swap is powerful but discoverability is low (buried in modals) |
| 4. Saves and re-opens in Tracker | Switch | ⚠️ | Has to manually open the project from Tracker; no "open in Tracker" CTA |
| 5. Notices his progress was preserved through the edit | Tracker | ✅ | The data model handles edits without losing `done[]` |

**Top friction for Eli:**

- Creator-as-editor isn't framed as such on existing projects.
- Palette Swap discoverability is low.

---

## Persona 3 — "Designer Devi"

**Snapshot.** Devi, 29, runs a small Etsy shop selling original cross-
stitch patterns (~50 designs published, ~1500 sales). She designs in
WinStitch on her Windows desktop, exports a PDF, and spends ~30 minutes
per pattern in Photoshop adding her cover, watermark, and finishing
touches. She uses no app for her own stitching (stitches from her own
PDFs).

| Attribute | Value |
|---|---|
| Stitching experience | 8 years (designer for 4) |
| Patterns published | ~50 paid, ~10 free |
| Stash | Modest (~150 DMC) — uses thread on demand for sample stitching |
| Tech comfort | Power user, designer-tool fluent (Photoshop, Illustrator, Affinity) |
| Devices | Windows desktop (primary), iPad Pro (sample stitching) |
| Goal | Produce a sellable PDF pattern: cover page + chart + legend + designer info, watermarked, multi-language friendly |
| Frustration triggers | Locked-down output (no branding control), unprofessional defaults (poor symbol set, broken kerning), no Anchor cross-ref, missing partial stitches |
| What makes her give up | Output that isn't print-shop-ready; missing pro features (e.g. watermark, copyright page) |

### Devi's first journey — design original pattern from scratch

| Step | Surface | Status | Note |
|---|---|---|---|
| 1. Opens `index.html`, picks "Start From Scratch" | Creator → Project | ⚠️ | "From Scratch" is an option but the resulting blank canvas is small and unstyled |
| 2. Sets a palette manually using the palette controls | Creator → Sidebar | ⚠️ | Adding individual DMC IDs is fiddly — there's no "type DMC ID, autocomplete" |
| 3. Paints a small motif | Creator → Pattern | ✅ | Tools work, undo/redo solid |
| 4. Adds backstitch outlines | Creator → Pattern | ⚠️ | Backstitch tooling exists but the toolbar discoverability is low |
| 5. Adds a few half-stitches | Creator → Pattern | ⚠️ | Half-stitch toggle is two clicks deep |
| 6. Opens Project tab to set the title and designer name | Creator → Project | ⚠️ | The "Designer Branding" section exists but is collapsed and looks like a settings panel rather than a publishing step |

### Devi's second journey — export a sellable PDF

| Step | Surface | Status | Note |
|---|---|---|---|
| 1. Materials & Output → Output | Creator → Output | ✅ | PDF generation works, includes multi-page chart + legend |
| 2. Wants to add her cover image and shop URL | Creator → Output | ⚠️ | Designer Branding is on the Project tab, not Output — easy to miss |
| 3. Wants to watermark | Creator | 🛑 | No watermark control |
| 4. Wants Anchor cross-reference in the legend | Creator → Output | 🛑 | Legend shows DMC only by default |
| 5. Wants per-fabric-count finished-size table | Creator → Project | ✅ | Table exists in Project tab — but doesn't appear in the PDF |
| 6. Wants to publish a ZIP bundle | Creator → Output | ⚠️ | "Coming soon" (deferred B4 work) |
| 7. Opens PDF in Adobe Acrobat to add her own cover | External | 🛑 | The whole reason she still uses WinStitch + Photoshop |

**Outcome:** The app is interesting but not yet a WinStitch
replacement for her. She might use it for the *first draft* and finish
in WinStitch.

**Top friction for Devi:**

- No watermark or designer cover slot in the PDF.
- Legend doesn't optionally include Anchor / hand-dyed equivalents.
- Finished-size table doesn't make it into the PDF.
- ZIP bundle export deferred — she has to manually assemble files.
- Designer Branding controls are on the wrong tab.

### Devi's third journey — provide a tracker for her customers

| Step | Surface | Status | Note |
|---|---|---|---|
| 1. Reads docs on how to make her PDF Pattern-Keeper-compatible | Help drawer | ⚠️ | Help drawer mentions PK compat but doesn't explain how to ensure her exported PDFs work in PK |
| 2. Tries opening her exported PDF in this app's tracker | Tracker → import | ⚠️ | Works for her own export; brittle for her competitors' |
| 3. Wants to embed a "Stitch Tracker" link with her pattern URL | Sharing | ⚠️ | URL share works for small patterns only; large patterns must be re-imported as files |

**Top friction for Devi:**

- No "test in tracker" preview from inside the Creator.
- No URL sharing for large patterns.
- No story for distributing tracker-ready patterns to her customers.

---

## Cross-persona summary

| Friction theme | Beginner Bea | Experienced Eli | Designer Devi |
|---|---|---|---|
| Sidebar density / hidden controls | 🛑 | ⚠️ | ⚠️ |
| Mobile tracker performance + ergonomics | 🛑 | ⚠️ | — |
| Cross-device sync | — | 🛑 | — |
| "Print PDF" missing from Pattern tab | 🛑 | — | ⚠️ |
| Limit-to-stash shown when stash is empty | 🛑 | — | — |
| Creator-as-editor framing for existing projects | — | ⚠️ | — |
| Designer branding & watermark | — | — | 🛑 |
| Anchor cross-ref in legend | — | ⚠️ | 🛑 |
| Shopping list export | — | ⚠️ | — |
| Drag-mark default off | — | ⚠️ | — |

**The single biggest insight:** all three personas hit friction in the
**Creator's right-rail Sidebar** when their goal is *not* to fiddle with
generation parameters. A Pattern tab that surfaced "Print" and "Track"
as primary actions and pushed the parameter controls into a collapsible
"Tune" panel would unblock Bea, give Devi a clean path to the Output
tab, and not slow Eli down.

The second biggest insight: **the Tracker is the only one of the three
surfaces all three personas spend significant time in**. It is also the
weakest mobile experience and lacks live sync. Tracker improvement is
the highest-leverage investment.
