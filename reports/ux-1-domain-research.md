# UX-1 — Cross Stitch Domain & Competitor Research

> Foundation for the Q3 UX overhaul. Read before any audit document
> ([ux-4](ux-4-navigation.md) onwards) or proposal. Conclusions sit in
> [ux-3-domain-reference.md](ux-3-domain-reference.md).

---

## 1. The physical workflow

### 1.1 How stitchers read a chart

Counted cross stitch is, mechanically, **rendering a raster image one X at a
time onto an evenweave grid using coloured floss**. The chart is a printed
or on-screen grid of *symbols* (1 symbol = 1 DMC/Anchor colour). Every
symbol cell becomes one cross stitch on the fabric.

The chart conventions are remarkably stable across designers:

- **Major grid every 10 cells**, minor grid every 1.
  Stitchers count in tens. *Without the heavy 10×10 lines a chart is
  effectively unreadable* — repeat complaints on r/CrossStitch when a PDF
  ships without them.
- **Centre arrows** on the top and left edges so the stitcher knows where
  the centre stitch lands when they pre-grid the fabric.
- **Symbols, not colours**, in printed charts — many DMC colours are
  visually indistinguishable on paper or in low light, and colour-blind
  stitchers need a non-colour signal. Premium digital tools render
  *symbol-on-coloured-cell* so both signals are present.
- **Page tiling** — large charts span many pages. A 200×200 chart at the
  conventional ~50 stitches per A4 page becomes a 4×4 page grid plus a
  legend. Stitchers expect overlap rows and column letters/numbers
  identical across page edges so they can stitch across page joins
  without losing count.
- **Legend / key** — must list every symbol with its DMC + Anchor IDs,
  the colour name, and (ideally) the stitch count and number of skeins
  to buy.

### 1.2 Working methods

There are two dominant methods, and digital tools must respect both:

**Cross-country (a.k.a. "one colour at a time")**
- Stitch every cell of one colour across the whole pattern, then move to
  the next colour.
- Dominant for smaller / less-shaded patterns. Fastest in pure stitches
  per hour.
- Software supported by: *highlight all cells of one colour*; *count
  remaining of this colour*; *show only this colour*.

**Parking ("section" or "block")**
- Work a small block (often 10×10 — one major grid square — or one
  page). Within the block, stitch each colour, then "park" the
  needle/thread at the *next* place that colour will be needed when you
  return.
- Dominant for full-coverage / heavily shaded patterns (HAED-style)
  because cross-country becomes confusing once the palette is very
  large or the colour adjacency is dense.
- Software needs: *parking marker / pin per thread on the chart*; *where
  is colour X next?*; *jump to next instance of X*.

A third: **page-by-page** (work the whole of page 1, then page 2…). Common
hybrid with parking. Software needs: *highlight current page bounds;
jump to next/previous page*.

### 1.3 Thread management (the part most apps under-serve)

Stitchers think about thread at two scales:

- **Stash** — the entire collection of skeins they own (dozens to
  thousands of skeins for serious stitchers; LordLibidan reports
  serious WIP-managers with 500+ DMC numbers in stash).
- **Project palette** — the subset needed for *this* pattern, with
  required quantities.

The bridge between them is a **shopping list**: "for this pattern, what
do I have, what do I need to buy, and how many skeins?".

Brand substitution is constant:

- DMC ↔ Anchor cross-reference is mainstream — many UK shops stock both.
- Hand-dyed brands (Weeks Dye Works, GAST, DMC Coloris, Carrie's Creations)
  are common upgrades to designer-specified DMC.
- Conversion charts are *approximate* — most stitchers want to *see the
  swatch* and confirm visually before committing.

Pain point #1 from r/CrossStitch surveys: **"I bought thread I already
owned"** — without an organised stash + per-pattern shopping list, this
happens constantly.

### 1.4 Tracking progress

How stitchers *manually* track:

- **Highlighter on a printed chart** — the dominant method for decades.
  Each completed cell is yellow-highlighted; partially-stitched cells
  often diagonally hatched.
- **Magnetic board + line magnets** to mark the current row and avoid
  losing count.
- **Bullet journals / spreadsheet** for stitch counts per session, total
  hours, projected finish date, financial cost.
- **Pictures every N hours** posted to FlossTube or Instagram
  ("Snapshot Saturdays"). This is partly a social ritual but also a
  visual timeline of progress that stitchers genuinely use to gauge pace
  and decide whether to push through or move to a different WIP.

What digital tools should add over highlighters:

1. **Reliable, undoable progress marking** — hand-highlighted charts
   can't be unmarked.
2. **Auto-counted percentages and per-colour remaining counts** — manual
   tallying is the most-skipped step.
3. **Search/find** — "where else is colour X on this chart?" is awful
   on paper.
4. **Cross-device continuity** — start tracking on the iPad in the
   stitching chair, pick up on the phone on the train.
5. **Time tracking + pace estimate** — mostly aspirational; few
   stitchers actually log this on paper, but a frictionless timer is
   widely loved (Pattern Keeper testimonials).

### 1.5 Pain points from physical-only workflows

Drawn from r/CrossStitch threads, FlossTube channels, and the LordLibidan
software roundups:

| Pain | Frequency | What software should do |
|---|---|---|
| Losing count on full-coverage charts | Very high | Reliable progress marking + grid overlay |
| Buying duplicate threads | Very high | Stash inventory + shopping diff |
| Highlighter fades / can't unmark | High | Digital tracking with undo |
| Frogging (unpicking mistakes) takes hours | High | Easy "unmark" of done stitches |
| Picking the next WIP is a paralysing decision | High | Multi-WIP dashboard with last-stitched + % |
| Pattern PDF is 60 pages and the legend is on page 3 | High | One scrollable chart, sticky legend |
| Phone screen too small to read symbols | High | Pinch-zoom + symbol-only mode |
| Eyes get tired in evening | High | Dark mode, large symbols, high-contrast modes |

---

## 2. The digital workflow

### 2.1 What stitchers expect from each tool category

Stitchers do **not** treat creation, tracking, and stash management as one
problem. They commonly own:

- **One creation tool** — used rarely (when starting a pattern from a
  photo or designing original work). They tolerate complexity here in
  exchange for control.
- **One tracker** — used *every stitching session*. Must be effortless on
  a phone or tablet held in a non-dominant hand. Pattern Keeper's
  success is almost entirely about being a brilliant *tracker*; it
  doesn't try to do creation or stash.
- **A stash app or spreadsheet** — used when shopping or tidying
  thread organisers. Must be searchable, fast, and accurate.

This app's three-tools-in-one structure is genuinely unusual. The
opportunity is huge (no context switching, one project flows from
photo → chart → tracking) but the **risk** is that any one of the three
"surfaces" is mediocre and pushes users to a dedicated competitor.

### 2.2 Image → pattern conversion expectations

What stitchers *want* the conversion to do:

- **Sensible defaults that look good immediately** — most users tweak
  ≤ 2 settings before printing. The default palette size (typically 20–40
  colours) and stitch count (commonly 100–200 wide) need to be near-right.
- **Honest preview** — what they see on screen should look like what
  they'll stitch. The killer test is: can the user pre-judge whether the
  pattern will look "muddy", before printing 60 pages?
- **Background removal** — *the* most-requested feature for portrait /
  product photos.
- **Colour-count slider** — adjust palette size and re-quantise live.
- **Brand choice** — DMC by default; Anchor and hand-dyed users want to
  pick. Mixed-brand palettes are a power feature.
- **Floss reduction** — auto-merge near-duplicate colours; warn about
  colours used in <N stitches (confetti).
- **Confetti control** — confetti = isolated single-cell stitches of a
  unique colour. Stitchers *hate* confetti. Tools that don't surface
  this metric are at a serious disadvantage.

What they *don't* want but get sold anyway:

- "AI-powered" anything. Stitchers are pragmatic; they want to see the
  algorithm's effect, not be told it's magic.
- Cloud uploads of their personal photos.
- A 27-step wizard before they see the first preview.

### 2.3 Export expectations

**PDF (printable chart) is non-negotiable.** A pattern that can't print to
a usable PDF is, for most stitchers, not a pattern.

The published PDF must include:

- A title page or header with size, fabric count, finished dimensions in
  inches and cm, total stitches, total skeins.
- A symbol-on-colour chart, paginated with overlap rows, page index,
  centre arrows, 10×10 major grid.
- A full legend (DMC ID, name, symbol, stitch count, skeins, optional
  Anchor cross-ref).
- Backstitch overlay if the pattern uses backstitch.

Other formats:

- **OXS** (KG-Chart XML) — interchange with Pattern Keeper, KG-Chart,
  Pattern Maker. Lets the user track in their preferred app.
- **JPG/PNG** — for sharing previews, blog posts, FlossTube cover art.
- **JSON / native** — for re-loading later in the same tool.

Designers (selling on Etsy) additionally need:

- Branding / cover page slot.
- A clean ZIP bundle (PDF + thread list + instructions + cover image).
- Watermarking / copyright text.
- Multi-fabric-count sizing notes.

### 2.4 Mobile vs desktop split

Observed roles, with strong consensus across community discussions:

| Activity | Primary device |
|---|---|
| Image conversion / pattern design | **Desktop** (mouse, big screen, multi-window) |
| Heavy editing (paint, fill, palette swap) | **Desktop / tablet w/ stylus** |
| Reading / tracking while stitching | **Phone or tablet** (held one-handed, often propped) |
| Stash management | **Mostly desktop**, sometimes phone in shop |
| Shopping list | **Phone** (used in-shop) |

Key implication: tracking *must* be a first-class mobile experience. The
person stitching has needle in dominant hand, hoop or Q-snap in the
other; the phone is propped on a table or in a stand. Touch targets are
hit clumsily and from awkward angles.

---

## 3. Competitive landscape

### 3.1 Pattern Keeper (Datadromeda AB — Android, iOS in beta)

**What it is:** A specialist *PDF chart reader + tracker*. Imports
Pattern-Keeper-compatible PDFs from supported designers; you stitch and
mark cells off; per-colour counts decrement. Sold once for $9.

**What it does well:**

- **One screen does the job.** Chart + legend + counts in a single view.
  The user testimonials repeatedly say "I never miss a stitch". This is
  the gold standard for *reading* and *marking*.
- **Symbol highlight** — tap a symbol or legend row and every instance
  on the chart lights up. Removes the need to search by eye. This is
  the single biggest win Pattern Keeper has over paper.
- **Per-colour remaining stitch count** that decrements live. Tiny
  feature, huge psychological boost.
- **Stitches finished today** — small persistent counter that
  apparently keeps people stitching ("just 50 more for the day").
- **Drag selection across page breaks** — you can sweep a finger across
  diagonal runs and across the page boundary in one gesture.
- **Onboarding by "buy a chart, open it, it works"** — there is no
  setup. Users can be up and running inside a minute.

**What it does poorly / doesn't do:**

- **Android-only** for years (iOS still in beta). Has driven a huge
  Pattern-Keeper-tax on iPad-first stitchers and is the single biggest
  community complaint.
- No pattern *creation*. PK is a reader.
- No stash management. You can't ask "for this chart, what should I buy?".
- Dependent on the designer's PDF being PK-compatible. Many free /
  amateur charts don't render correctly.
- Visual appearance is functional but utilitarian — not a strong design
  language.

**UX pattern to borrow:** the *symbol-tap → highlight all instances on
chart* gesture, the *per-colour decrementing counter*, and the
*stitches-finished-today* mini stat.

### 3.2 Stitch Fiddle (web — stitchfiddle.com)

**What it is:** A free-with-Pro-tier web app that designs cross stitch,
crochet, knitting, and other grid-based patterns. Has a community
gallery of user patterns.

**What it does well:**

- **Multi-craft, single grid abstraction.** The same editor handles
  cross stitch, crochet, fuse beads, etc. Smart for a small team.
- **Browser-based, no install.** Fast onboarding for newcomers.
- **Live web preview of in-progress patterns** in a public gallery.
- **Photo conversion is dead simple** — upload, slide colour-count, get
  a chart. Not the best quality, but the most accessible UX.

**What it does poorly:**

- The editor is **dense and dated** — small icons, ambiguous labels, no
  consistent panel structure. New users routinely ask "where is X" in
  the help forum.
- **Conversion is single-shot** — set parameters then click convert; no
  live preview, no comparison view.
- **Mobile is essentially unusable** for editing (palettes overflow,
  toolbars stack vertically).
- **Tracking is rudimentary** — you can mark cells done, but no per-
  colour counters, no symbol-tap-to-find.
- **Saving requires an account.** Loses anonymous users instantly.

**UX pattern to borrow (carefully):** the multi-craft idea is interesting
but out-of-scope. The free-tier-without-account onboarding is something
this app already does and should keep.

**UX anti-pattern to avoid:** dense unsigned-icon toolbars, single-shot
conversion with no live preview.

### 3.3 WinStitch / MacStitch (Ursa Software — desktop)

**What it is:** The "professional" desktop app — used by many
self-employed pattern designers. £30+ one-time, Windows / macOS
download. Around since the 2000s.

**What it does well:**

- **Professional output quality** — page layouts, legends, watermarks,
  colour-perfect printing. Designers selling on Etsy pick it because
  the PDFs look polished.
- **Real backstitch tooling** — half/quarter/three-quarter stitches and
  backstitch are first-class, with separate layers and per-stitch
  control.
- **Vast import/export support** — OXS, PDF, JPG, native PAT, and
  designer-specific formats.
- **Floss conversion** between many brands with named substitution
  schemes (e.g. DMC → Anchor for an entire palette in one click).
- **Pattern statistics** — finished-size table for every fabric count,
  thread length, skein count.

**What it does poorly:**

- **Looks like Windows XP.** Discoverable through tutorials only — no
  modern visual hierarchy.
- **No web / mobile / tracking** — you design on the desktop, then go
  print and stitch on paper.
- **License model** locks out casual users.

**UX pattern to borrow:** professional output (page tiling, legend,
finished size table); per-brand floss conversion; first-class partial
stitches.

### 3.4 Pixel-Stitch (web — pixel-stitch.net)

**What it is:** A free single-purpose web tool that converts a photo
into a printable PDF chart. No account, no editor, no tracking. One
form, one result.

**What it does well:**

- **Brutally simple** — one screen, four inputs, click Generate, get
  PDF. Privacy is a selling point ("no images stored").
- **No login.**
- **Fast** — the entire flow is under a minute.

**What it does poorly:**

- **No editing whatsoever.** What the algorithm chose is what you get.
- **No comparison preview.** You see thumbnails only.
- **No stash, no tracking, no library.**
- **Conversion quality is mediocre** for portraits / detailed images.

**UX pattern to borrow:** the *one-screen-from-photo-to-PDF* path is
the right onboarding for first-time users; many never need anything more
sophisticated. The current Creator UX hides this simple path behind too
much chrome.

### 3.5 KG-Chart for Cross Stitch (Kaori Goto — Windows desktop)

**What it is:** Long-running shareware editor (creator of the OXS
format). Used heavily by Eastern European designers.

**What it does well:**

- **OXS format** is the de facto interchange format for cross stitch
  charts. Anything that reads OXS roundtrips.
- **Stitch-by-stitch editing precision** — granular tools with
  excellent keyboard control.
- **Layered stitch types** — full, half, quarter, three-quarter,
  backstitch, French knot, beads — all separately editable.

**What it does poorly:**

- Windows-only.
- Free version is restricted; full version requires payment that's hard
  to complete outside Japan.
- UI is dense and entirely in fixed menus.

**UX pattern to borrow:** OXS interchange (this app already imports);
explicit per-stitch-type layers with toggleable visibility (this app's
tracker has this; the creator could surface it more clearly).

### 3.6 Adjacent: Aseprite (pixel art editor)

**What it is:** A paid, beloved pixel-art editor used by indie game
artists.

**Lessons applicable to a stitch grid editor:**

- **Tool selection is one-key, with a persistent toolstrip on the left.**
  Users learn `B` (brush), `G` (fill), `M` (selection), `I` (eyedropper)
  inside a session. The same letters work everywhere.
- **The canvas owns 95% of the screen.** Tools are slim icon strips;
  panels collapse to icon rails when not in use.
- **Onion-skin / preview overlays** are toggled with a single keystroke
  and are visually distinct from the main grid.
- **Colour palette is a sticky strip with a search and recent-colour
  history.** Picking a colour never moves the cursor far from the
  canvas.

The Creator's right-rail Sidebar should look more like Aseprite's
collapsible right panel and less like a stacked accordion of forms.

### 3.7 Adjacent: Procreate (iPad illustration)

**What it is:** The dominant iPad drawing app.

**Lessons:**

- **Gestures are the toolset** on touch — pinch zoom, two-finger undo,
  three-finger swipe redo. Users learn five gestures and never touch a
  menu mid-stroke.
- **The canvas is the source of truth.** Every chrome panel is
  optional, hidden by default, and *floats* when invoked rather than
  squeezing the canvas.
- **Quickmenu** — radial menu under your finger for the four most-used
  actions. A better answer than a tiny floating toolbar.

Tracking on this app on a phone or tablet should learn from Procreate:
canvas first, gestures for the common path, panels appear on demand.

### 3.8 Adjacent: Figma / Linear (web tooling)

**Lessons applicable to multi-page apps with shared chrome:**

- **One persistent header**, never scrolls away, holds project context
  + global actions only.
- **The active region is a single, full-bleed canvas.** Sidebars are
  resizable and rememberable, not fixed.
- **Command palette (Cmd+K)** for everything that's not a primary tool.
  This app already has one (`command-palette.js`). Should be promoted.
- **Comment / share / export sit on the right rail** away from the
  primary tools to avoid muscle-memory clashes.

---

## 4. Real-user complaints (community signal)

Aggregated from r/CrossStitch software-tag threads, FlossTube software
reviews (LordLibidan, Peacock & Fig, Notforgotten Farm), and Pattern
Keeper's Facebook group.

| Complaint | Implication for this app |
|---|---|
| "I just want to convert a photo and print it, why are there 47 settings" | The Creator's first-run path needs a *prominent simple-mode* with one preview and 4 sliders max |
| "I need to stitch on my iPad / iPhone and Pattern Keeper is Android-only" | This app's biggest possible wedge: a great web tracker that works on iOS |
| "My stash spreadsheet is out of date again" | Bulk-add + barcode-style ID input is essential |
| "Pattern Keeper doesn't tell me what to buy" | The cross-tool integration (tracker ↔ stash ↔ shopping) is genuinely differentiated |
| "I can't tell what 645 looks like vs 646 on my screen" | DMC colour rendering must use the actual swatch, not approximate RGB; show a name + ID together |
| "Charts are unreadable on my phone screen" | Symbol-only mode + zoom that respects pixel boundaries |
| "I lost my place when the app updated" | Tracking state must be durable, syncable, and exportable as backup |
| "The free conversion sites add watermarks / paywall the PDF" | Free, no-watermark export is a strong differentiator |
| "I converted a photo and it looks muddy / nothing like the photo" | Need a comparison view and confetti / saturation controls *before* the user commits |
| "I have 200 colours in my pattern, I'll never finish" | Pre-conversion difficulty estimate (palette size, confetti %) on the preview |

---

## 5. Sources

- r/CrossStitch (subreddit, ~480k members) — software discussion threads
  2019–2026, particularly `Pattern Keeper`, `Stitch Fiddle`, `WinStitch`,
  `apps for tracking`, `iPad alternatives` topics.
- LordLibidan — "Best cross stitch apps", "Is cross stitch dead",
  "Subversive cross stitch", FlossTube channel index.
- Pattern Keeper (patternkeeper.app) — landing page, user testimonials,
  Help Centre articles on importing, supported designers.
- Stitch Fiddle (stitchfiddle.com) — feature pages, pricing, help.
- Pixel-Stitch (pixel-stitch.net) — feature page, FAQ.
- Pattern Keeper Facebook group public posts — common feature requests.
- Wikipedia: *Cross-stitch*, *Counted-thread embroidery*, *Aida cloth*,
  *DMC*, *Tatreez*.
- Personal observation of FlossTube videos by *Sirithre*, *Peacock & Fig*,
  *Notforgotten Farm*, *Flosstube Lord*.
- Aseprite manual + community threads.
- Procreate handbook excerpts.

---

## 6. What this means for our app

The headline insights for the audit and proposals:

1. **The Creator already does roughly what Pixel-Stitch does, but
   buried under more chrome.** The simple-path (drop a photo, see chart,
   download PDF) is theoretically there but not foregrounded.
2. **The Tracker is the single biggest competitive opportunity.** A web
   PWA that does Pattern Keeper-level tracking on iOS is currently
   absent from the market. This is the wedge.
3. **The Stash Manager is the integration that nobody else has.** Cross-
   referencing this pattern's required threads against my actual
   inventory is a genuine workflow win that justifies the three-in-one
   bundle.
4. **Mobile tracking is non-negotiable**, and "shrunken desktop" will
   not cut it. The tracking surface needs gesture-first, large-target,
   single-handed interaction.
5. **DMC colour fidelity is sacred.** Every place we render a swatch we
   must use the canonical RGB and pair it with the DMC ID and name —
   never colour alone.
6. **The grid is sacred.** Every panel, modal, toolbar must be designed
   to *reveal* the chart, not cover it. Every UI choice that obscures
   the canvas costs us trust against Pattern Keeper.
