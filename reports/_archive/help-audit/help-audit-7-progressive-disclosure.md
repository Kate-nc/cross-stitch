# Progressive Disclosure Audit — Cross Stitch Pattern Generator
**help-audit-7** · May 2026 · Scope: home.html, create.html, stitch.html, manager.html

---

## Executive Summary

This app has deep, capable features — but the UX assumes expert knowledge far
too early. The Pattern Creator's sidebar presents ~15 generation controls in one
scrollable column with no indication of which matter most. The Preferences modal
lists 17 settings in the "Pattern Creator" category, many with terms like
"dithering mode" or "orphan removal strength" that beginner stitchers have no
frame of reference for. The Export tab names its default preset "Pattern Keeper",
which is opaque unless you know the iOS/Android app.

At the same time, some critical concepts get almost no explanation. The "Stitch
Score" widget is labelled with a dotted-underline "What is this?" that doesn't
work on mobile or keyboard. The "Over two" checkbox in the shopping list is
bare. The tolerance slider on the Magic Wand panel gives 4-word hints like
"(broad)" but no sense of what to try first.

The coaching layer (`coaching.js`) fires one `firstStitch` event per mode.
The help drawer (`help-drawer.js`) gives clean evergreen articles but is reached
only via `?` and is invisible to first-time users who haven't discovered the
keyboard shortcut.

**Impact ranking of problems found (by estimated user-facing pain):**

| Rank | Area | Type | Pain |
|------|------|------|------|
| 1 | Creator Sidebar — generation settings | OVERLOAD | High |
| 2 | Preferences Modal — Pattern Creator tab | OVERLOAD | High |
| 3 | Export Tab — preset selection | SCARCITY | High |
| 4 | First-run: no image loaded, blank sidebar | SCARCITY | High |
| 5 | MagicWand + Lasso toolbar rows | OVERLOAD | Medium |
| 6 | "Stitch Score" / "Confetti" concept | SCARCITY | Medium |
| 7 | PrepareTab "Over two" checkbox | SCARCITY | Medium |
| 8 | Dithering mode selector | SCARCITY | Medium |
| 9 | Manager inventory — bulk/filter/sort on same row | OVERLOAD | Low |
| 10 | Tracker sidebar with layers, modes, timer at once | OVERLOAD | Low |

---

## Part 1 — Top 5 Information Dump Screens

### 1. Creator Sidebar (Sidebar.js) — Generation Settings Avalanche

**Screen:** `create.html`, right sidebar, before first generation

**What appears simultaneously** (all at the same nesting level, most open by
default):

- Palette chips section (collapsed header, but colour chips appear immediately
  when a pattern loads)
- Dimensions accordion: Size slider + Lock aspect ratio + "Max: 5000×5000" note
- Colours accordion (non-scratch mode): Max colours slider, Allow blended
  threads checkbox (with info icon), Use only stash threads checkbox (with info
  icon), stash thread count, coverage-gap warning, quick-add input, Randomise
  button + seed editor, Explore variations gallery toggle
- Image adjustments accordion: Brightness/Contrast/Saturation sliders
- Smoothing accordion: smooth strength, smooth type dropdown (median/gaussian)
- Confetti Cleanup accordion: toggle + strength + detail-protection checkbox +
  contextual warning
- Orphan Removal slider (0-4)
- Background Removal toggle + Pick button + threshold slider + colour swatch
- Fabric Count dropdown

**Count of interactive controls:** 25–30 when all sections are open, 10–15 in
default collapsed state.

**Who is hurt:** Beginners who upload a photo and are immediately confronted
with terms like "dithering", "confetti cleanup", "orphan removal", and
"smoothing type: median/gaussian". Most of these settings have sensible
defaults; showing them all implies the user must decide each one.

**What makes this worse:** The sidebar has no visual hierarchy separating "you
should care about this" from "advanced, leave at default". Every accordion
section has the same visual weight. The accordion headers themselves (Section
component) all use the same text style and background.

---

### 2. Preferences Modal — Pattern Creator Panel (preferences-modal.js)

**Screen:** Shared across all pages, opened via the header gear icon

**What appears simultaneously** in the "Pattern Creator" category:

1. Maximum colours (slider + number input)
2. Fabric count (select)
3. Allow blended threads (switch)
4. Use only stash threads (switch)
5. Default dithering (segmented: Off / Weak / Balanced / Strong)
6. Smooth dithering (switch) — labelled "Coming soon"
7. Orphan removal strength (slider 0-5)
8. Min stitches per colour (slider 0-50)
9. Protect details from cleanup (switch)
10. Stitch cleanup (switch)
11. Default view mode (Colour / Symbol / Both segmented)
12. Grid overlay (switch)
13. Reference image opacity (slider)
14. Import wizard beta (switch)
15. Embroidery tool beta (switch)
16. Thread sheen on canvas (switch)

**Count:** 16 settings, presented as a flat scrolling list in one section.

**Who is hurt:** Anyone who opens Preferences looking for one thing — they must
read through a wall of technical settings to find it. Beginners see "Orphan
removal strength" and wonder if they've broken something; "protect details from
cleanup" sounds like a system-level permission, not a pattern generator option.

**Mitigating factor:** Each row has a `desc` string (small grey text below the
label). But these are consistently terse (e.g. "How many DMC colours the Creator
may use when matching an image") and assume knowledge of what DMC colours,
matching, or confetti cleanup means.

---

### 3. Magic Wand / Lasso Toolbar Rows (MagicWandPanel.js, PatternTab.js)

**Screen:** `create.html` → Pattern tab → with Magic Wand or Lasso tool active

**What appears simultaneously:**

Row 1 (tool options, shown when wand/lasso is active):
- Tool label
- Tolerance slider + value + verbal hint (exact/similar/broad/very broad)
- Connected-only vs All-matching segmented toggle
- 4 op-mode buttons with custom SVG icons (New, Add, Subtract, Intersect)
- "Shift / Alt / Shift+Alt" label

Row 2 (selection status, shown when a selection exists):
- Selection count
- Deselect / Invert / All buttons
- 5 panel launchers: Confetti, Reduce Colours, Replace Colour, Stitch Info, Outline

Plus whichever panel is open (confetti cleanup, colour reduction with scrolling
table, replace with source/target dropdowns + fuzzy toggle + tolerance slider,
stitch info table).

**Total interactive elements visible**: up to 20 when a panel is open.

**Who is hurt:** Users who just wanted to "click that area and fill it with a
different colour". The intended primary workflow (select → replace colour) is
buried as one of 5 panel options in row 2, with no visual emphasis. A beginner
user is more likely to click "Confetti..." or "Reduce Colours..." by accident
because those labels appear first.

---

### 4. Export Tab (ExportTab.js)

**Screen:** `create.html` → Materials & Output tab → Output sub-tab

**What appears simultaneously:**

- Format toggle: PDF / PNG (affects which content below shows)
- 2 large preset cards (Pattern Keeper / Home Printing) — named with no explanation
- Page count preview ("~N pages")
- Collapsible "Format & settings" section (9 settings inside):
  - Page size, Margins (mm), Stitches per page (S/M/L/Custom), Custom cols/rows
  - Chart modes: B&W / Colour (two checkboxes)
  - Overlap, Include cover page, Include info page, Include index, Mini legend
- Collapsible "Designer branding" section (logo, name, copyright, contact)
- Large "Export PDF" CTA button + estimated page count
- "Download bundle" (PDF + OXS + PNG + JSON) secondary action
- Cancel button (when exporting)

**Who is hurt:** Users who just want to print their pattern. They see "Pattern
Keeper" (a third-party app name), a page-count preview that means nothing until
they know what "stitches per page" means, and must decide between B&W and Colour
(answer: both, which is already the default, but there's no "recommended"
label). The "Download bundle" option is especially confusing for new users —
what is an OXS file?

---

### 5. Stash Manager — Inventory Tab (manager-app.js)

**Screen:** `manager.html` → Inventory tab

**What appears simultaneously (main toolbar area):**

- Search input
- Thread filter dropdown: All / Owned / Need to buy / Low stock
- Brand filter dropdown: All / DMC / Anchor
- "Add thread" or "Bulk add" button
- Possibly an active-project conflict banner
- Low-stock alerts banner (if any threads below threshold)

**Per-row:**
- Thread swatch + number + name
- Owned spinner (increment/decrement)
- "To buy" checkbox
- Partial-gauge (4-segment indicator: None / Mostly full / About half / Remnant / Used up)
- Min-stock indicator
- Expand button → additional fields (notes, source, price)

**Who is hurt:** New users who added their threads and now want to use them with
the Creator. The partial-gauge (what is "Remnant"?), the min-stock concept, and
the multiple per-row controls are all visible on every single row even before
the user knows why they matter. With 500+ DMC threads in the list, this creates
a visually dense table that feels like an enterprise inventory system.

---

## Part 2 — Top 5 Information Desert Screens

### 1. First-Run Create Page — No Image Loaded

**Screen:** `create.html` when a user arrives for the first time (no pattern
in storage)

**What the user sees:**
- Empty canvas area with "Drag & drop or click to upload your image" hint
- The full sidebar with all generation controls already visible (but greyed out
  or at defaults)
- A 3-tab main header: Pattern | Project | Materials & Output

**What the user does NOT see:**
- Any indication of what format to upload
- Recommended starting settings (e.g. "Start with 14-count fabric and 20
  colours — you can always adjust")
- Any notion that they should upload FIRST before touching any of the settings
- An explanation of what a "cross-stitch pattern generator" actually produces

**Coaching state:** The `coaching.js` `firstStitch_creator` sequence fires only
after the user generates a pattern for the first time — so the very first
interaction (uploading an image and clicking Generate) gets zero guidance.

**Who is hurt:** First-time users of any skill level. Even experienced stitchers
who are new to this app don't know whether to change settings first or upload
first.

---

### 2. "Stitch Score" Widget (PatternTab.js)

**Screen:** `create.html` → Pattern tab, appears after generation

**What the user sees:**
- "Stitch Score: XX/100" in a small metric box
- A thin progress bar
- "N isolated stitches remaining"
- A dotted-underline link: "What is this?"

**What is missing:**
- "What is this?" is a CSS `title` attribute — it only appears on desktop hover,
  not on mobile, not on keyboard focus, not via touch.
- No sense of what a good score is (90+ is excellent, below 60 is poor — but
  this isn't shown anywhere near the number).
- No suggestion of what to do if the score is low (e.g. "Increase Cleanup level
  or use a larger canvas").
- The "isolated stitches" concept is not explained — beginners don't know why
  isolated stitches are a problem.

---

### 3. Export Tab — "Pattern Keeper" vs "Home Printing" Presets

**Screen:** `create.html` → Materials & Output → Output

**What the user sees:**
- Two large preset cards, side by side: "Pattern Keeper" and "Home Printing"

**What is missing:**
- Any explanation of what Pattern Keeper is (it's a paid iOS/Android app by a
  third party)
- Why you would choose one over the other
- What changes between the two (Pattern Keeper: A4 PDF, 14 stitches/page medium
  density, overlap, B&W+Colour, cover+info+index; Home Printing: A4, large
  density, no overlap)
- A "Recommended for most users" badge — a beginner who doesn't own Pattern
  Keeper will be confused by seeing an app name as the default preset

---

### 4. "Over Two" Checkbox (PrepareTab.js)

**Screen:** `create.html` → Materials & Output → Stash Status

**What the user sees:**
- A bare checkbox labelled "Over two"
- No tooltip, no info icon, no parenthetical

**What is missing:**
- "Over two" is a cross-stitch technique (stitching over 2 fabric threads instead
  of 1, used primarily on evenweave fabric like linen). It halves the effective
  fabric count for skein calculations.
- A beginner who has never heard of over-two stitching will not know if they are
  supposed to check this.
- An advanced stitcher using Aida fabric won't know this checkbox affects their
  calculations if they're not warned.

---

### 5. Magic Wand Tolerance Slider (MagicWandPanel.js)

**Screen:** `create.html` → Pattern tab → Magic Wand active

**What the user sees:**
- A "Tolerance" range slider (0–100) with the current value
- One of four hints: "(exact)", "(similar)", "(broad)", "(very broad)"

**What is missing:**
- What exactly does tolerance control? (It's ΔE colour distance — the higher the
  number, the more dissimilar colours get selected)
- What value should a beginner start with? (25 is a reasonable default for
  "select all stitches of approximately this colour" but the slider starts at
  whatever the user last set it to)
- What happens if you set it to 100? (Selects the entire canvas regardless of
  colour — the "Connected only" toggle changes this, but the interaction between
  the two is undiscovered)
- There's no reset-to-default button

---

## Part 3 — Prioritised TODO List

```
- [ ] [Priority: HIGH] [Screen: create.html] [Type: SCARCITY]
      Add a first-run "Start here" state when no image is loaded: display a
      prominent upload call-to-action, hide generation controls (or show them
      greyed with "Upload an image first"), and show 3 recommended defaults
      ("Try: 80×80 stitches · 14-count fabric · 20 colours — you can change
      these later").

- [ ] [Priority: HIGH] [Screen: create.html] [Type: OVERLOAD]
      Collapse the generation settings sidebar into 3 visible tiers. Tier 1
      (always visible): Size slider + Max colours slider + Generate button.
      Tier 2 (expandable "More options"): Dithering, Smoothing, Background
      removal. Tier 3 (expandable "Cleanup"): Confetti threshold, Orphan
      removal, Min stitches per colour. Use consistent "expand" affordance
      (matching the existing Section component accordion pattern).

- [ ] [Priority: HIGH] [Screen: create.html] [Type: SCARCITY]
      Replace the "What is this?" CSS title on the Stitch Score widget with
      an accessible info popover (button, role="button", aria-expanded) that
      explains: (a) what the score measures, (b) what good/bad looks like
      (show a colour-coded band: 90-100 Excellent, 75-89 Good, 60-74 Fair,
      <60 Challenging), (c) one sentence on what to do if the score is low.

- [ ] [Priority: HIGH] [Screen: create.html (Export)] [Type: SCARCITY]
      Rename or annotate the "Pattern Keeper" preset. Options:
      (a) Rename to "Pattern Keeper compatible" with a sub-label "For the iOS
      / Android app". (b) Add a "Recommended" badge to the preset and label
      both presets with their main difference in 1 line ("optimised for
      reading on screen" vs "for home printers"). The choice should be self-
      explanatory without knowing the app name.

- [ ] [Priority: HIGH] [Screen: preferences-modal.js] [Type: OVERLOAD]
      Split the "Pattern Creator" preferences panel into two visible groups:
      (a) "Common settings" (max colours, fabric count, dithering) — always
      visible, (b) "Advanced settings" — collapsed behind an expand button.
      This halves visible item count from 16 to ~6 on first view.

- [ ] [Priority: MED] [Screen: create.html] [Type: OVERLOAD]
      Add visible modifier-key labels to the Magic Wand / Lasso op-mode
      buttons in MagicWandPanel. Move the "Shift / Alt / Shift+Alt" hint to
      a tooltip on each button rather than a freestanding label. Consider
      collapsing Confetti, Reduce Colours, Replace Colour, Stitch Info, and
      Outline into a single "Selection actions…" dropdown or popover menu
      rather than 5 inline buttons. The primary action (replace colour) should
      be the most visually prominent.

- [ ] [Priority: MED] [Screen: create.html] [Type: SCARCITY]
      Add an info popover to the "Over two" checkbox in PrepareTab with a
      2-sentence explanation: "Over two means each stitch covers 2 threads of
      the fabric instead of 1 — common on linen evenweave. Checking this
      adjusts the fabric count used to calculate how many skeins you need."

- [ ] [Priority: MED] [Screen: create.html] [Type: SCARCITY]
      Replace the 4-word Tolerance hint on the Magic Wand slider ("exact" /
      "similar" / "broad" / "very broad") with a brief guidance line below
      the slider: "Lower = select only stitches very close in colour. Higher
      = include near-matches." Add a "Reset to default (25)" link.

- [ ] [Priority: MED] [Screen: create.html] [Type: DISCLOSURE]
      Convert the PatternTab Stitch Score panel from a status bar into a
      3-layer disclosure widget:
        Layer 1: Score number + colour band label (Excellent/Good/Fair/Poor)
        Layer 2: Info popover on click — explains isolated stitches and suggests
                 remediation based on score tier
        Layer 3: "Read more about stitch quality" → help drawer topic

- [ ] [Priority: MED] [Screen: create.html (Export)] [Type: DISCLOSURE]
      Add a collapsed "Format & settings" section that starts closed and
      shows only the most-used toggle ("Include cover page" + page-count
      preview) by default. Advanced export options (page size, margin mm,
      stitches per page, custom rows/cols, overlap) live behind a "Customise
      layout" expand. This preserves power while reducing decision fatigue.

- [ ] [Priority: MED] [Screen: all] [Type: SCARCITY]
      Surface the Help drawer ("?") more prominently on first visit.
      Suggestions: (a) add a visible "Help" text label to the header icon for
      first-time users (dismissable after first click), (b) emit a coachmark
      pointing at the "?" key after the first pattern is generated.

- [ ] [Priority: MED] [Screen: manager.html] [Type: OVERLOAD]
      Hide the "Partial-gauge" column in the inventory table by default.
      Show it only via a "Columns" toggle. The 4-segment gauge is meaningful
      to advanced stashers but adds visual noise for new users who have not
      yet entered partial-skein data. Similarly, "Min stock" and "Notes"
      columns should be opt-in.

- [ ] [Priority: MED] [Screen: manager.html] [Type: SCARCITY]
      Add a "What does coverage mean?" tooltip to the pattern library card's
      coverage bar. New users don't know why a pattern shows "3 of 12 colours
      owned" without understanding that coverage means their stash holdings.

- [ ] [Priority: LOW] [Screen: stitch.html] [Type: OVERLOAD]
      The Tracker's mode toolbar (Track / Navigate), layer toggles (full,
      half, BS, knot), view toggle (symbol/colour/highlight), zoom buttons,
      timer controls, and session config button are all visible simultaneously
      on the toolbar. For new users, collapse layer toggles into a "Layers"
      button that expands a popover, defaulting to all on. Timer controls
      should be secondary (the big Start/Stop button stays, but session config
      is an overflow item).

- [ ] [Priority: LOW] [Screen: stitch.html] [Type: SCARCITY]
      The WelcomeWizard/StitchingStyleStepBody for the Tracker asks "How do
      you usually work through a pattern?" but gives no guidance on what the
      choices mean. "One section at a time" vs "One colour at a time" vs
      "I don't have a fixed method" needs 1-sentence explanations to avoid
      arbitrary selection.

- [ ] [Priority: LOW] [Screen: create.html] [Type: DISCLOSURE]
      The "Dithering" setting (Sidebar.js) has an info icon but no description
      visible by default. Add a persistent 1-line subtitle under the section
      label: "Adds texture to colour transitions for a more natural look."
      The detailed explanation (weak/balanced/strong + smooth dithering) stays
      in the expandable tooltip.

- [ ] [Priority: LOW] [Screen: create.html] [Type: SCARCITY]
      The "Background removal" section provides a "Pick" affordance but doesn't
      explain what "background" means in the cross-stitch context (the fabric
      colour — areas that won't be stitched). Add a tooltip: "Mark a colour
      from your image as empty fabric — stitches in that colour won't appear
      on the chart."

- [ ] [Priority: LOW] [Screen: home.html] [Type: SCARCITY]
      The Stats tab on the home page links to the stats page but shows no
      preview. For users with no sessions, it shows only a link. Add a brief
      "You haven't tracked any stitching yet — start the timer in the Tracker
      to begin" empty-state message so users understand the value before they
      invest time.
```

---

## Part 4 — Layered Information Architecture for the 3 Most Complex Screens

### 4.1 Creator Sidebar — Generation Settings

**Current state:** A flat list of ~15 controls in 6–8 accordions, all at the
same visual weight.

**Proposed 3-layer architecture:**

#### Layer 1 — Essential (always visible, no expanding needed)
- Upload image CTA / image thumbnail + Crop/Change buttons
- Grid size (single "Size" slider when aspect ratio is locked)
- Max colours (slider, labelled "Colour palette size")
- Primary Generate button (prominent, e.g. full-width)

*Rationale:* These are the only settings a beginner needs to touch on their
first generation. Everything else has a sensible default.

#### Layer 2 — Adjustments (expandable, collapsed by default for new users,
open by default for returning users who have changed them)
- Brightness / Contrast / Saturation sliders (grouped under "Image adjustments")
- Dithering mode (with 1-line description: "Adds texture to colour transitions")
- Smoothing type + amount (collapsed sub-section under "Smoothing")
- Allow blended threads toggle
- Use only stash threads toggle
- Background removal

*Expandable trigger label:* "Adjust image & colours" with a badge showing
how many settings are non-default (e.g. "3 custom").

#### Layer 3 — Advanced cleanup (collapsed, behind a separate "Cleanup settings"
accordion)
- Confetti cleanup toggle + strength
- Protect fine details toggle
- Orphan removal level
- Min stitches per colour
- Variation seed / Randomise / Explore variations

*Expandable trigger label:* "Cleanup & quality" with a note: "These defaults
work for most images — only adjust if your pattern has speckled areas."

---

### 4.2 Export Tab

**Current state:** Preset cards, then collapsed Format & settings with 9
controls, then branding section, then CTA.

**Proposed 3-layer architecture:**

#### Layer 1 — Single-tap export (always visible)
- Two preset cards with sub-labels:
  - "Pattern Keeper compatible" — *for the iOS / Android Pattern Keeper app;
    includes both B&W and Colour charts*
  - "Home Printing" — *single colour chart, optimised for standard printers*
- Estimated page count preview
- "Export PDF" CTA button

*This covers ~80% of export use cases. No decisions required.*

#### Layer 2 — Layout customisation (expandable, shows after clicking
"Customise layout")
- Include cover page / info page / index (checkboxes, labelled "Include pages")
- Chart mode: B&W only / Colour only / Both (segmented)
- Page size (Auto / A4 / Letter / A3)
- Margins (slider, mm)
- Mini legend toggle

*Use plain labels, not jargon: "Include navigation index" is less clear than
"Include page-reference table at the front".*

#### Layer 3 — Advanced options + branding
- Stitches per page (Small/Medium/Large/Custom)
- Custom columns / rows inputs
- Overlap toggle + explanation ("Print the same stitches on adjacent pages so
  you never lose your place — recommended")
- Workshop theme toggle
- Full designer branding section (logo, copyright, contact)

---

### 4.3 Preferences Modal — Pattern Creator Panel

**Current state:** 16 settings listed in a flat scrolling section.

**Proposed 3-layer architecture:**

#### Layer 1 — Common settings (always visible in the panel)
- Maximum colours (slider + number input) — description: "How many thread
  colours the pattern may use. 15–25 is typical for most images."
- Fabric count (select) — description: "Aida count determines pattern size on
  fabric. 14 and 16 are the most common."
- Default dithering (segmented: Off / Balanced / Strong) — description:
  "Adds colour texture to gradients. Balanced works for most images."

#### Layer 2 — "More defaults" (expandable section)
- Allow blended threads toggle
- Use only stash threads toggle
- Orphan removal strength
- Min stitches per colour
- Default view mode (Colour/Symbol/Both)

#### Layer 3 — "Advanced / Experimental" (separate expandable, greyed heading)
- Smooth dithering (Currently "Coming soon")
- Protect details from cleanup
- Grid overlay
- Reference image opacity
- Import wizard (beta switch)
- Embroidery tool (beta switch)
- Thread sheen on canvas

*The "Coming soon" items should be the last thing visible in the modal, never
in Layer 1 or 2.*

---

## Part 5 — Where Beginner vs Expert Modes Would Provide the Most Value

### 5.1 High value: Creator Sidebar

An experience mode toggle at the top of the sidebar ("Simple" / "Advanced") or
a first-time prompt ("New to cross-stitch? We'll hide advanced settings until
you're ready") would have the highest impact here. In Simple mode:
- Show only the Layer 1 controls described in §4.1
- Replace all jargon sliders with a single "Detail quality" slider (Low → High)
  that adjusts orphan removal, min stitches, and confetti threshold together
- Provide a one-sentence explanation per visible control

In Advanced mode:
- Everything visible as today
- Technical labels kept (dithering, ΔE, orphan size)

**Implementation note:** UserPrefs already supports arbitrary keys. A new
`creator.experienceMode: "simple" | "advanced"` preference could gate which
accordion sections render, without changing the underlying state machinery.

### 5.2 High value: Preferences Modal

The 12-category, 16-settings-per-category structure rewards expert users but
overwhelms beginners. A "Getting started" landing page inside the modal (shown
on first open) could present the 4 most impactful preferences as a quick wizard:
1. "How do you usually stitch? On Aida fabric (14-count is most common) or
   evenweave (linen)?"
2. "About how many colours do you like working with at once?"
3. "Do you have a thread stash in the Stash Manager yet?"
4. "Would you like to see advanced options in the Creator, or keep it simple?"

Answers could pre-fill the main Creator and Stitch Tracker preferences, then
land the user on the expert-layout panel view.

### 5.3 Medium value: Stash Manager Inventory Table

Expert stitchers want the full table (partial gauge, min-stock, notes, per-row
edit) but beginners just want to mark threads as "I own this". A simplified
"Quick-add" mode (a search-and-tap list without the per-row gauge, sortable by
number only) alongside the current full table would serve both groups without
losing functionality.

### 5.4 Medium value: Export Tab

Non-expert users can export with two taps (preset + Export PDF) if the
customisation sections default to collapsed. Expert users (PDF designers, pattern
publishers with branding needs) benefit from the full three-layer architecture.
The key insight is that the current UI forces everyone through the expert
decision tree even when the presets are perfectly adequate.

### 5.5 Lower value: Stitch Tracker

The Tracker's audience is already narrower — users who have created a pattern
and are actively stitching it. They're more engaged and more likely to explore.
Simple vs expert mode here would primarily mean "fewer layer toggles visible by
default" rather than a major workflow change. The `StitchingStyleStepBody`
onboarding wizard already does good work here; it just needs the 3 choice labels
annotated (see TODO list item above).

---

## Appendix: Metrics for Measuring Improvement

If any of the above changes are implemented, the following are observable
proxies for success:

| Metric | Measurement approach |
|--------|----------------------|
| Time to first generation | Instrument window.perf or session timer from page load to first pattern render |
| Help drawer open rate | Track `cs:openHelp` event dispatch count per session |
| Export abandonment | Track "Export" tab open vs "Export PDF" button clicks |
| Preferences modal bounce | Track open → close in < 5 seconds (no settings changed) |
| Magic Wand panel engagement | Track which of the 5 panel buttons (confetti, reduce, replace, info, outline) are actually clicked vs panel-open rate |
| "Over two" confusion signal | Track toggle rate — a high toggle rate (check → uncheck in short succession) suggests confusion about the default |

---

*Report generated by GitHub Copilot UX analysis, May 2026.*
*Source files analysed: home-app.js, creator-main.js, creator/PrepareTab.js,*
*creator/PatternTab.js, creator/ExportTab.js, creator/MaterialsHub.js,*
*creator/MagicWandPanel.js, creator/Sidebar.js, creator/useCreatorState.js,*
*creator/generate.js, creator/AdaptModal.js, tracker-app.js, manager-app.js,*
*preferences-modal.js, help-drawer.js, coaching.js.*
