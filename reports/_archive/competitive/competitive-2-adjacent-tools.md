# Competitive Report 2: Adjacent Tools — Pixel Art, Knitting, and Embroidery

> **Scope:** Tools from adjacent craft/design domains whose UX patterns,
> features, or positioning carry lessons for cross-stitch software.
> Includes pixel art editors, knitting/crochet planners, embroidery software,
> row-counter apps, and stash management tools from other fibre crafts.

---

## 1. Why Adjacent Tools Matter

Cross-stitch sits at the intersection of:
- **Grid-based pixel art** (every stitch is a pixel)
- **Counted needlework** (thread management, stitch counting, row tracking)
- **Fibre craft project management** (multiple WIPs, stash, shopping lists)
- **Printable chart publishing** (Etsy sellers, pattern designers)

Users draw comparisons and form expectations from adjacent tools in all four
domains. Understanding those expectations reveals features we should borrow —
and traps we should avoid.

---

## 2. Pixel Art Editors

### Aseprite ($20 one-time; ~$7 Steam sale)
- **Relevance:** The professional standard for grid-based pixel art; directly
  analogous to cross-stitch pattern editing
- **Features that translate to our domain:**
  - **Onion skinning** (layer transparency for reference) → analogous to
    "show original image as overlay" during editing
  - **Timeline/animation** panel → irrelevant for us
  - **Indexed colour mode** (palette-locked editing) → our palette restriction
    model matches this
  - **Colour palette remapping** with history → our palette swap feature
  - **Selection tools:** rect, lasso, magic wand, contiguous fill — all
    present in our app ✓
  - **Tile mode** (seamless repeat preview) → interesting for sampler/repeat
    patterns — not in our app
- **Pricing lesson:** $20 one-time for a well-regarded professional tool. Users
  who come from Aseprite find per-export pricing models (StitchMate, Thread-Bare)
  frustrating.
- **UX lesson:** Aseprite's keyboard-first workflow (every tool has a single
  key shortcut, visible in toolbar) makes power users very fast. Our Command
  Palette (Cmd+K) is a step in this direction but hotkeys are not shown
  on-canvas.

### Piskel (free, web)
- **Relevance:** Popular free pixel art editor; many cross-stitchers use it
  before discovering dedicated tools
- **Features:**
  - Real-time animated preview beside the editing canvas
  - Frame/animation timeline
  - Very limited colour management (no palette matching to thread brands)
- **Lesson:** The split-pane view (edit on left, preview on right) is a UX
  pattern users find intuitive. Our SplitPane component delivers this.

### Lospec Palette List (web, free)
- **Relevance:** Community-curated pixel art colour palettes, used by pixel
  artists and cross-stitchers to find harmonious limited palettes
- **Lesson:** Users want **named palette presets with visual swatches**, not
  just hex values. Our palette swap feature has presets but no visual swatch
  grid before applying. Adding a preview swatch grid would lower friction.

### LibreSprite / GrafX2 (free, desktop)
- Niche; used by retro game developers; not directly relevant

---

## 3. Knitting and Crochet Planning Tools

### Ravelry (free, web)
- **Relevance:** The dominant social platform and pattern library for yarn
  crafts; 10M+ members; widely considered the gold standard for fibre-craft
  project management
- **Features relevant to cross-stitch:**
  - **Project pages:** track status (queue/in-progress/finished/frogged),
    start/finish dates, yarn used, needle size, notes, photos
  - **Yarn stash:** detailed inventory with photos, meterage, weight, colour
    tags; searchable
  - **Pattern library:** personal library + Ravelry's commercial marketplace
  - **Queuing system:** wishlist of future projects linked to stash
  - **Notes field:** free-text journal per project (session notes equivalent)
  - **Social layer:** project pages can be public, comment threads, "made this
    pattern" linking
  - **Search and filter:** find patterns by yarn weight, needle size, project
    type, difficulty
- **Lesson 1 — Stash photos:** Ravelry users photograph their yarn; cross-
  stitchers also photograph their thread collection. We have no photo field on
  thread records or project entries.
- **Lesson 2 — Social project pages:** Making projects shareable (public URL,
  progress photos) is a missing feature across all cross-stitch tools. This
  is the feature users request in reviews of XStitch Plus.
- **Lesson 3 — Queue (wishlist) integration:** Ravelry's queue shows what
  yarns you already own vs need to buy for queued projects. Our app has a
  pattern library with wishlist status but does not show thread gap analysis
  per queued pattern.

### Knit Companion (iOS/Android, ~$10)
- **Relevance:** The dominant row-counter app for lace/complex knitting;
  comparable to Pattern Keeper for cross-stitch
- **Features:**
  - Highlights the current row on a PDF chart (exactly like Pattern Keeper)
  - Multiple stitch counters per row
  - Custom row counts with increment/decrement
  - "Sticky note" annotations on chart
  - Sync via iCloud
- **Lesson:** Pattern Keeper and Knit Companion serve essentially the same use
  case. The row-highlight metaphor (one bright row, everything else dimmed) is
  the single most-loved feature in both apps. Our tracker marks individual
  cells but does not have a "current row" highlight mode.

### Gauge (knitting) / Row Counter apps
- Hundreds of these exist (Row Counter by Tappily, iKnit, etc.)
- **Common pattern:** Simple +/- counter, sometimes with section breaks
- **Lesson:** Users in all fibre crafts want a minimal "where am I?" view that
  is usable during stitching without looking away from fabric. Our tracker is
  richer but also heavier. A "minimal overlay mode" has been requested by
  users of similar apps.

### Stitch Fiddle (cross stitch + knitting + crochet)
- Already covered in Report 1; its multi-craft support means it absorbs users
  who would otherwise use separate apps.
- **Lesson:** Offering charting for multiple crafts from a single account is a
  strong retention mechanism. Not recommended for our app (scope creep risk)
  but worth noting as a competitive moat for Stitch Fiddle.

---

## 4. Embroidery Software

### Hatch Embroidery ($699–$2799, desktop)
- **Relevance:** Machine embroidery digitising — adjacent but different
  (stitch type is machine fill, not counted cross-stitch)
- **Features of note:**
  - **Stitch density simulation:** shows how the final embroidery will look on
    fabric in near-photorealistic preview — more detailed than our 4-level
    preview
  - **Thread colour matching across brands:** comprehensive multi-brand
    catalogue including regional brands
  - **Run-time stitch estimation:** estimates machine time + thread usage
    before stitching begins
- **Lesson:** Their "realistic preview" pipeline is more mature than ours.
  Their thread calculator provides per-brand estimates accounting for stitch
  density and direction — closer to what a "materials cost" view could show.

### Wilcom EmbroideryStudio (enterprise, $3000+)
- Not relevant to this market; cited for completeness

---

## 5. Stash Management from Adjacent Crafts

### Thread Stash (Android, free — cross-stitch specific)
- Already covered in Report 1; supports DMC/Anchor/Sullivans/Weeks Dye Works
- **Lesson:** Weeks Dye Works and hand-dyed brands are a growing segment of
  the premium cross-stitch community. Our stash manager only supports DMC and
  Anchor.

### Yarn Buddy / StashBot (Ravelry integration)
- Allow photographing yarn with auto-tag suggestions
- **Lesson:** Barcode-scan or photo-match to thread colour is a feature users
  would find valuable for adding threads to stash quickly. Currently we require
  manual entry.

### Notion / Airtable (used for cross-stitch by enthusiasts)
- Some power users maintain thread inventories in spreadsheets or no-code
  databases (Notion, Airtable, Google Sheets)
- **Why:** No dedicated app gives them full control (filtering, sorting,
  tagging by project, bulk editing)
- **Lesson:** A CSV/spreadsheet export of the thread stash would reduce
  friction for these users and encourage migration to our app.

---

## 6. Project Management and Productivity Tools

### Trello / Kanban boards (used by pattern designers)
- Pattern designers managing multiple commissions use Kanban-style boards
  to track pattern state: Idea → In Progress → Sent for Testing → Published
- **Lesson:** Our project library has basic status (wishlist/owned/in-progress/
  completed) but no pipeline view, notes, or attachment capability.

### Notion project pages (used by serious stitchers)
- Some dedicated stitchers maintain elaborate Notion databases with photos,
  stitch counts, thread lists, and session notes
- **Lesson:** The desire for richer project journaling (notes, photos, external
  links) is latent but real. XStitch Plus (iOS) captured this niche and has a
  loyal user base despite a small review count.

---

## 7. Social and Sharing Platforms

### Instagram / TikTok (#crossstitch)
- Both are primary discovery and sharing channels for the cross-stitch community
- **#crossstitch** TikTok has billions of views; progress videos are hugely popular
- **Lesson:** Users want to share progress easily. A "share progress" feature
  that exports a clean composite image (e.g., "X% complete, photo of work,
  colour bar of threads used") would serve this instinct.

### Etsy (pattern marketplace)
- Many of our target users are pattern designers selling on Etsy
- StitchMate explicitly targets this segment with "commercial licensing + brandless exports"
- **Lesson:** Features that save Etsy sellers time (batch export, designer
  branding on PDFs, per-pattern licensing) have commercial appeal. We already
  support designer branding on PDF cover pages.

---

## 8. UX Patterns Worth Borrowing

| Pattern | Source | How it maps to our app |
|---|---|---|
| FLOW / quality score shown during generation | StitchMate | Add a stitchability score to the generation step |
| Confetti overlay highlighting problem areas | StitchMate (ConfettiScope) | Visual diagnostic overlay on generated pattern |
| Current-row highlight in tracker | Pattern Keeper, Knit Companion | "Row mode" in Stitch Tracker |
| Palette preset swatch grid | Lospec, colour picker tools | Visual palette preview before applying swap |
| Social project page (shareable URL) | Ravelry, XStitch Plus | Project share link with progress snapshot |
| Thread gap analysis for queued projects | Ravelry | "What do I need to buy for this wishlist pattern?" |
| CSV stash export | Ravelry, general expectation | Export stash to CSV for power users |
| Keyboard shortcut overlay (single-key) | Aseprite | Show current shortcut in tooltip on toolbar buttons |
| Tile/repeat mode for samplers | Aseprite | Optional — low priority |

---

## 9. Key Takeaways

1. **Ravelry is the benchmark for stash + project management** in adjacent
   crafts. Its queue-to-stash linkage ("do I have enough yarn for this queued
   pattern?") is a feature cross-stitch tools lack entirely.

2. **Pattern Keeper and Knit Companion** share the same UX model. Their
   "current row" highlight is the single most-praised interaction pattern in
   counting-craft tracker apps. Our tracker marks individual stitches but has
   no row-level navigation aid.

3. **Aseprite's keyboard-first workflow** is the expectation for power users
   coming from pixel art. We have a Command Palette but should surface
   single-key shortcuts more visibly.

4. **Social sharing is an unmet need** in cross-stitch software. No tool
   makes sharing a work-in-progress (WIP) shot easy. This is an opportunity.

5. **Etsy sellers are an underserved power-user segment** that StitchMate is
   actively targeting. We have the PDF tooling (cover page branding, PK
   compat) but lack commercial-specific messaging and workflow features.

6. **Hand-dyed and specialty brands** (Weeks Dye Works, etc.) are growing
   in popularity but absent from most tools, including ours.
