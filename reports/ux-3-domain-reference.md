# UX-3 — Canonical Domain Reference

> **The most important document in this overhaul.** Every audit, plan,
> wireframe, and implementation should defer to this file when there's
> a question about terminology, workflow, or design principle. If a
> design choice contradicts this document, the design is wrong (or this
> document is wrong and should be updated first).
>
> Built from [ux-1](ux-1-domain-research.md) (research) and
> [ux-2](ux-2-user-journeys.md) (personas / journeys). Read those for
> evidence; read *this* for verdicts.

---

## 1. Glossary of cross stitch terms

The minimum vocabulary a UI designer working on this app needs to wield
correctly. Every term in this glossary should appear in the help drawer
and be respected in the UI copy.

### Stitches and stitch types

- **Cross stitch / full stitch** — the basic X. One thread crosses
  another at right angles inside one cell of the fabric grid.
- **Half stitch** — one diagonal only (`/` or `\`). Used for shading and
  light backgrounds.
- **Quarter stitch** — a stitch that occupies one quadrant of a cell;
  used to round curves.
- **Three-quarter stitch (¾)** — a half stitch plus a quarter stitch
  in the same cell.
- **Petite stitch** — a full cross worked in one quadrant of a cell;
  doubles the resolution locally.
- **Backstitch (BS)** — a continuous outline drawn along grid lines
  (not on cells). Drawn after the X's are done.
- **French knot** — a small raised knot, often used for eyes / berries.
- **Beads** — sometimes substituted for cross stitches for sparkle.

### Materials

- **Floss / thread** — six-stranded embroidery cotton sold in skeins.
  *DMC* and *Anchor* are the two dominant brands.
- **Strand count** — how many of the six strands in the skein you
  separate and stitch with. 14ct fabric: typically 2 strands. Higher
  strand counts cover better but use thread faster.
- **Skein** — one bundle of floss. DMC skeins are 8 m / ~315 inches
  (this app uses `SKEIN_LENGTH_IN = 315` in `constants.js`).
- **Aida** — stiff fabric with clearly visible square holes. Beginner-
  friendly. Sold in *counts* (holes per inch).
- **Evenweave / linen** — finer fabric where you stitch over 2 threads.
  Higher counts (28ct stitched over 2 = 14ct effective) for advanced
  work.
- **Fabric count** — holes (and thus stitches) per inch. Common counts:
  11, 14, 16, 18, 22, 25, 28, 32, 36, 40.
- **Hoop / Q-snap / scroll frame** — fabric tensioning tools.

### Patterns and charts

- **Chart** — the printed or on-screen grid of symbols representing the
  stitches.
- **Symbol** — the printed glyph representing one DMC colour in the
  chart. Each colour gets a unique symbol.
- **Legend / key** — list mapping each symbol to its DMC ID, name, and
  stitch count.
- **Major grid (10×10)** — the bold grid lines drawn every 10 cells.
  Without these the chart is unreadable.
- **Centre arrows** — arrows on the top and left edges of the chart
  marking the centre stitch.
- **Page tiling / overlap** — large charts span multiple printed pages
  with one row/column of overlap so users can stitch across page
  boundaries.
- **Confetti** — isolated single cells of a unique colour. The bane of
  every stitcher's existence. Patterns with high confetti are slow and
  frustrating to stitch.
- **Full coverage** — the entire chart is stitched (no fabric showing).
  Often very large with 80+ colours; HAEDs are the canonical example.
- **Subject pattern** — only the subject is stitched, fabric shows in
  the background. More common in beginner-friendly designs.

### Process

- **Cross-country method** — work all of one colour at a time across
  the whole chart, then move to the next.
- **Parking method** — work one block (often 10×10 or one page); within
  the block, stitch each colour and "park" the thread at the next place
  it'll be needed when you return.
- **Page-by-page method** — work the whole of page 1, then page 2.
  Often combined with parking.
- **Frogging** — unpicking a mistake. Named after "rip-it, rip-it".
  Universally hated, often fatal to motivation.
- **WIP** — Work In Progress. Most stitchers have several.
- **HD / HAED / Heaven and Earth** — Heaven and Earth Designs, a
  designer famous for huge photorealistic full-coverage charts. Often
  used as shorthand for "very large pattern".

### Brands & systems

- **DMC** — Dollfus-Mieg & Compagnie. The default thread brand
  worldwide. ~500 colours, identified by a 3–4 digit number (e.g. 310 =
  black, 666 = bright red).
- **Anchor** — UK/European competitor brand. Cross-references to DMC
  via published conversion charts (approximate, never identical).
- **Hand-dyed brands** — Weeks Dye Works, Gentle Art Sampler Threads
  (GAST), Carrie's Creations, Classic Colorworks. Variegated colours
  that change along the strand.
- **OXS** — XML interchange format originated by KG-Chart; the de
  facto standard for cross-stitch chart exchange.
- **Pattern Keeper compatible PDF** — a PDF that meets Pattern
  Keeper's parsing rules (specific font, no compressed object streams,
  symbols as text). Not all PDFs work; designers must test.

---

## 2. The three personas (summary)

For full journeys see [ux-2-user-journeys.md](ux-2-user-journeys.md).
A one-paragraph summary that should be in every PR description and
design discussion:

- **Beginner Bea (34, ≤1 year stitching).** Wants to convert a photo to a
  printable chart. On Android. Hates jargon. *If she can't get to a
  printable PDF in under 5 minutes without confusion, we lose her.*
- **Experienced Eli (47, 15+ years).** Power-user with 30+ WIPs and
  500+ skein stash. Tracks on a Samsung tablet. Already uses Pattern
  Keeper + a spreadsheet — keeping him requires our integration story
  (tracker + stash + shopping) to be airtight and our tracker to feel
  *as fast as Pattern Keeper*. Cross-device sync is the make-or-break.
- **Designer Devi (29, sells on Etsy).** Power user designer. Wants a
  WinStitch-quality PDF (cover, watermark, Anchor cross-ref, finished-
  size table, ZIP bundle) without leaving the app. Without those her
  workflow stays in WinStitch + Photoshop.

**Persona priority for *this* overhaul:**

1. **Bea** (largest growth potential; current journey has the most
   blockers).
2. **Eli** (largest competitive moat; tracker is the wedge).
3. **Devi** (smaller user base but high willingness to pay; not the
   focus of *this* round).

This priority is **not negotiable** for the proposals in
[ux-10](ux-10-proposals.md). Plans that optimise for Devi at the cost
of Bea will be rejected.

---

## 3. Core workflows the app must support

These workflows define our sense of "done". Every navigation, layout,
and copy choice must keep these short and obvious.

### W1 — Photo to printable PDF (Bea's primary)

> Drop photo → see chart → adjust 0–4 settings → download PDF.

Target: ≤ 5 clicks from drop to download. ≤ 3 minutes wall time.
The Pattern tab must offer a primary "Download PDF" action without
requiring tab switches.

### W2 — Photo to track-on-phone (cross-persona)

> Drop photo → see chart → save → open Tracker on phone → mark first
> stitch.

Target: ≤ 8 clicks total, including the device handoff. The handoff
must be discoverable from the Pattern tab ("Continue in Tracker" or a
QR-code share).

### W3 — Daily stitching session (Eli's primary)

> Open tracker → resume current project → mark stitches for ~1 hour →
> close.

Target: ≤ 2 taps to be marking. The tracker must:

- Remember the last project and last position.
- Show *progress made today* prominently.
- Never lose data when the screen sleeps or the app is backgrounded.
- Support drag-mark (multi-cell selection) by default.

### W4 — Stash management (Eli's secondary)

> Bulk-add a kit of skeins → search → confirm a thread is in stash
> before buying.

Target: ≤ 1 click to "do I own this DMC ID?". The Manager must:

- Have a search bar that works as fast as a stitcher can type.
- Allow multi-select bulk add by typing IDs separated by spaces /
  commas.
- Show clear "owned / not owned" badge on every per-thread render
  across the app.

### W5 — Cross-pattern shopping list (Eli's killer)

> Open Manager → Shopping → see what to buy across all my active WIPs →
> sort by deficit → take to local stitch shop.

Target: ≤ 3 clicks to "show me my shopping list". Must support a
print- or share-friendly view.

### W6 — Designer publishes a paid pattern (Devi's primary)

> Design / import → set title + designer info + cover → export ZIP
> bundle (PDF with watermark + cover, JSON, JPG).

Target: ≤ 6 clicks from "ready to publish" to ZIP downloaded. (Aspect
of this is deferred to a later round; the design must *not block* it.)

### W7 — Resume after a break (cross-persona)

> Open the app cold → see what I was last doing → resume in one click.

The Welcome Back card on the home screen serves this. It must always
work and never lie about state.

---

## 4. Design principles for craft software

These principles trump generic SaaS / dashboard design rules. They are
specific to *creative tools used by hand-craft hobbyists*.

### P1 — The grid is sacred

Every panel, modal, and chrome element must be designed to *reveal*
the chart, not cover it. The canvas is the product. Panels collapse to
icon rails by default.

### P2 — DMC colour fidelity is non-negotiable

Every place we render a thread swatch, we use the canonical RGB *and*
pair it with the DMC ID and name. Never colour alone. Never name alone.
Use the swatch as the primary visual but always within a chip with a
text label. (See `dmc-data.js`.)

### P3 — Symbols are equal partners with colours

Charts must always offer a symbol-on-coloured-cell rendering. Symbol-
only mode (no fill) must be available for accessibility, low-ink
printing, and high-contrast viewing. Two DMC colours that look similar
on screen *must* be distinguishable by symbol alone.

### P4 — One-handed mobile is the tracker's design constraint

Every primary tracker action must be reachable with one thumb on a
phone in portrait, with the canvas filling the rest of the viewport.
Toolbars float above the canvas, not beside it.

### P5 — Defaults that flatter, knobs that don't intimidate

The first preview a user sees must already look good. Knobs are
present but secondary; they reveal themselves as the user grows. The
Sidebar's default state should expose ≤ 5 controls; advanced controls
hide behind a "More" disclosure.

### P6 — Confetti is a measurable evil; surface it

Every conversion result must show a *confetti percentage* and a
*difficulty estimate*. Adjusting palette size or smoothing must update
this metric live. Stitchers should know *before they print* whether
this chart is going to drive them mad.

### P7 — Progress is precious; never destroy it without explicit consent

The `done[]` array, half-stitch state, parking markers, and time tracker
state are all sacred. Every operation that *could* destroy them
(re-import, palette swap, re-quantise on edit) must surface a clear,
undoable warning. Welcome Back state must be byte-accurate.

### P8 — Patterns and threads are first-class nouns; everything else is verb

The two persistent objects in this app are **patterns** and
**threads**. Every screen should make it obvious which one(s) you're
looking at and let you act on them directly. Settings, exports, and
modes are verbs and live behind icon affordances or menus.

### P9 — Speak British craft English

This app is for stitchers, not engineers. Use the words stitchers use:
*colour* (not color), *floss* and *thread* interchangeably, *skein* (not
"hank" or "spool"), *Aida* (capitalised), *backstitch* (one word),
*frogging* (use it; stitchers will smile). Avoid "render", "deserialize",
"export pipeline", "pipeline", "asset".

### P10 — No emojis in UI

Codified house rule (see [AGENTS.md](../AGENTS.md)). Use the SVG icons
in [icons.js](../icons.js); add new ones rather than reaching for an
emoji.

### P11 — Free, no-watermark, no-account by default

Every conversion the user does for personal use must be exportable
without a paywall, watermark, or sign-up. The integration features
(stash, sync, library) are the value. The conversion must remain a
loss-leader.

### P12 — Honour the three working methods

The tracker must support, equally, cross-country (highlight one colour),
parking (markers + jump to next instance), and page-by-page (page
overlay + jump to next page). No method is "primary"; the user picks
based on the pattern.

---

## 5. Platform considerations

### Desktop (laptop / desktop with mouse + keyboard)

- **Primary surface for Creator and Manager.**
- Expects keyboard shortcuts for everything frequent. Tool-letter
  shortcuts (`B` brush, `G` fill, `M` select) à la Aseprite.
- Expects right-click context menus on the canvas.
- Expects drag-and-drop (image in, file in, swatches between palettes).
- Multi-window users should be able to keep Tracker open in a second
  window while using Manager in the first.

### Tablet (iPad, Galaxy Tab)

- **Primary surface for Tracker.**
- Holds in two hands or one hand on a stand. Touch and stylus.
- Pinch-zoom must respect cell boundaries (snap zoom levels at 1×, 2×,
  4× of native cell size).
- Two-finger pan + tap to mark. Optional Apple Pencil / S Pen for
  precision marking on dense charts.
- Toolbars are floating panels, not edge-docked rails.

### Phone (Android, iOS)

- **Secondary surface for Tracker.** Used in transit, in waiting
  rooms, and as a backup when the tablet isn't to hand.
- Portrait-first design. Landscape is acceptable but not the priority.
- Bottom sheet pattern (drawer) for the colour picker / current colour
  context. Above the OS gesture bar always.
- Persistent "keep screen awake" toggle.
- The Manager and Creator are *secondary* on phone — usable but
  optimised for "I need to look something up", not "I need to design".

### Print

- **PDF is a first-class platform.** Every conversion must produce a
  print-ready chart. Defaults must match the conventions in §1
  (10×10 grid, centre arrows, page tiling, sticky legend).
- Black-and-white-printer-friendly mode (symbol-only, no colour fills,
  bold grid).

---

## 6. Anti-patterns from competitive research

These mistakes are common in competing tools and *must not* appear in
ours. If a proposal includes any of these, it is wrong.

### A1 — The wizard wall

(*Stitch Fiddle*) — A multi-step wizard before showing the first
preview. Bea bounces. Always show a default preview first; let the user
tune *after*.

### A2 — The dense unsigned-icon toolbar

(*Stitch Fiddle, KG-Chart*) — Rows of identical 16×16 icons with no
labels. Users learn by trial and error. Our icons must always be paired
with labels (visible or aria, with hover/long-press tooltips).

### A3 — The single-shot conversion

(*Pixel-Stitch*) — Set parameters, click "Generate", get one result.
No live preview, no comparison, no easy retry. Our conversion must
update live; tweaks are cheap.

### A4 — The "platform-locked" tracker

(*Pattern Keeper*) — Android-only locks out half the market. Our
tracker is a PWA; it must work anywhere a modern browser runs and must
be installable as a PWA on iOS and Android.

### A5 — The pop-up forest

Every modal that appears unprompted is a tax. The current Welcome
Wizard, the project picker, the help drawer, and the conversion
warning each pop in their own way. Coalesce into a single, calm onboarding
surface.

### A6 — The desktop site that pretends to be mobile

(*Stitch Fiddle on iPhone*) — Compressed-but-identical layout. Our
mobile views must be *redesigned*, not *resized*. Tracker on phone is
a different screen, not a smaller one.

### A7 — The hidden cost of conversion

(*Pixel-Stitch and free competitors*) — Watermarks, paywalls, accounts.
We don't.

### A8 — The chart cover-up

Any UI that obscures more than ~25% of the chart while the user is
actively reading it is broken. Tools, panels, and overlays must yield
to the canvas.

### A9 — Disrespect for partial stitches

(Most free tools.) Half, quarter, three-quarter, French knots,
backstitch are not optional polish; they are integral to fine work.
Treat them as first-class.

### A10 — Brand monoculture

(Many free tools.) DMC-only with no Anchor / hand-dyed support.
Especially in the UK/Europe, this excludes a third of the stitching
market.

---

## 7. Vocabulary in app copy — the dos and don'ts

| Don't say | Do say | Why |
|---|---|---|
| Color | Colour | British English (P9) |
| Convert image | Make pattern *or* Convert photo | "Convert image" is engineer-speak |
| Render | Preview, draw, show | "Render" is engineer-speak |
| Export | Download, Print, Share | Mode-appropriate verb |
| Materials & Output | (varies — see ux-10 proposals) | Not a stitcher term; mixes nouns |
| Magic Wand | Magic Wand (keep) | Universal in image editors |
| Quantise | Reduce colours, Match palette | Quantise is engineer-speak |
| Backstitch | Backstitch (one word, lowercase b mid-sentence) | Standard |
| French knots | French knots (capitalised F) | Standard |
| Three-quarter | Three-quarter, ¾, or 3/4 (consistent throughout) | Pick one and stick to it |
| Stash | Stash (keep) | Universal among stitchers |
| Skein | Skein (keep, never "spool" or "hank") | Domain |
| Confetti | Confetti (use the word, define it on first use) | Domain |
| WIP | WIP, Project, Work in Progress | "WIP" is fine in card lists; spell out in long copy |

---

## 8. Quick checklist for any future design

A reviewer can paste this into a PR comment and run through it. If
*any* answer is "no", the design needs work.

- [ ] Does it serve one of W1–W7 explicitly?
- [ ] Is the canvas (chart, photo, or grid) ≥ 60% of the viewport at
      default density?
- [ ] If thread is shown, is it always *swatch + DMC ID + name*
      together?
- [ ] If symbols are shown, can they be distinguished without colour?
- [ ] Is there a primary action that completes the workflow this screen
      exists for? Is it visually dominant?
- [ ] On a 360 px wide phone, can the primary action be performed with
      one thumb?
- [ ] Does it use any emoji or non-icon glyphs in user-facing strings?
      (If yes — fail.)
- [ ] Does it respect British craft English (§7)?
- [ ] Does it preserve the user's progress (`done[]`, halfStitches,
      sessions, time)?
- [ ] Does it honour at least one of the three working methods (cross-
      country / parking / page-by-page)?
- [ ] Does it work without a sign-up?
- [ ] If it's an export, is the result watermark-free?
