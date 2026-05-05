# Help Audit 3 — Contextual Help Placement

**Date:** 2026-05-02  
**Scope:** All four entry points — `home.html`, `create.html`, `stitch.html`, `manager.html`  
**Method:** Full source-code review of 19 specified files covering all user flows  
**Reviewer role:** UX researcher; no access to analytics — frequency ratings are inferred from flow position and feature complexity

---

## Executive Summary

The application is technically sophisticated and largely well-engineered, but help coverage is uneven. The **onboarding wizard** (`onboarding-wizard.js`) exists for all three tool pages and is a good foundation. However it only fires on first visit and covers orientation — it does not guide users through the most complex individual operations.

The biggest risk areas are:

- **Generation settings** (12+ parameters, all unlabelled as to consequence) — first-time users face these immediately after uploading an image.
- **Fabric count** — a single number that silently dictates physical output size and material cost, yet is pre-filled with a default (14ct) and never explained inline.
- **Confetti cleanup / orphan removal** — internal jargon with no plain-language equivalent in the UI.
- **Export presets** — "Pattern Keeper" is the default but is unexplained; most users printing at home want "Home Printing".
- **Cross-app workflow** — the connection between Creator → Tracker → Stash Manager is never surfaced as a single coherent workflow.

**Seven flows** would benefit from a short guided walkthrough (coachmarks or multi-step overlay). The remaining pain points are addressable with inline explanatory text, info-icon popovers, or improved empty states.

---

## Top 10 Most Dangerous Stuck Points

### 1. Generation Settings Overwhelm (Creator — first pattern)

**Where:** `create.html` — sidebar Dimensions / Palette / Image tabs, immediately after image upload.

**What happens:** The user drops an image and is immediately confronted with controls for pattern width/height, fabric count, maximum colour count (with an "Advanced" section hiding dithering mode, smoothing type/strength, min stitches per colour, orphan removal strength, blend stitches, and background removal). There are 12+ parameters with zero inline explanation of what any of them do or why they matter. The only explanation of generation is the WelcomeWizard's two-sentence description shown on first visit.

**Current mitigation:** The 5-step ImportWizard (`creator/ImportWizard.js`) exists and provides a guided path, but is gated behind `UserPrefs experimental.importWizard` (off by default). The standard flow receives no contextual guidance.

**Why it is critical:** This is the central feature of the entire application. Every new user hits this on their very first session. Getting stuck here means generating a bad pattern, not understanding why, and potentially not returning.

**Severity:** Critical  
**Frequency:** Every new user, every first pattern  
**Recommended fix:** Enable the ImportWizard by default (remove the experimental flag), OR add a collapsible "Help me choose" section to the sidebar that expands to show plain-language explanations of the most important 3 settings (fabric count, max colours, dithering).

---

### 2. Fabric Count — Silent Physical Size Determiner

**Where:** `create.html` sidebar (Dimensions tab), `manager.html` (user profile), `creator/PrepareTab.js` (fabric calculator).

**What happens:** Fabric count (e.g. 14ct, 18ct, 11ct) is a number the user must type or select before generating. It directly controls:
- The physical finished size (a 100×100 pattern on 14ct = ~18cm; on 11ct = ~23cm)
- How many skeins of thread are required (shown in PrepareTab)
- Whether the pattern is physically achievable on fabric the user already owns

The default is 14ct (loaded from UserPrefs). A user who doesn't know what "count" means will leave the default and potentially generate a pattern that won't fit their fabric.

**Current mitigation:** The PrepareTab's fabric calculator shows sizes after the fact. The ImportWizard step 3 shows a live estimate, but only if the wizard is enabled.

**Why it is critical:** Incorrect fabric count is irreversible without regenerating. The user may have already bought fabric. Skein counts on the shopping list will also be wrong.

**Severity:** High  
**Frequency:** Every user who doesn't already understand count (i.e. most beginners)  
**Recommended fix:** Add an inline info-icon popover next to "Fabric count" explaining: "14 count = 14 holes per inch. Higher count = finer detail, smaller stitches. A 80×80 pattern on 14ct will measure approximately X cm × Y cm." The live size estimate in the ImportWizard wizard should be surfaced in the standard flow's Dimensions tab as well.

---

### 3. "Confetti Cleanup" and "Orphan Removal" — Unexplained Jargon

**Where:** `create.html` — sidebar (Advanced section, `orphans` slider), `creator/PatternTab.js` (confetti score widget), `creator/MagicWandPanel.js` (Confetti panel).

**What happens:** Two separate but conceptually related settings use internal technical names:

- **Orphan Removal** (`orphans` slider in Advanced): removes "isolated" stitches — single cells of a colour surrounded only by other colours. Labelled "Orphan removal strength (0 = off)". No explanation of why this matters.
- **Confetti Cleanup** (MagicWandPanel): post-generation tool to apply a minimum cluster size. Labelled "Min cluster size" with a range input. The resulting "Stitch Score" widget shows a score /100 with a `title="..."` hover tooltip that explains it — but the tooltip requires knowing to hover over the "What is this?" text.
- **Confetti Score widget** (`PatternTab.js`): shows `score/100` and `X isolated stitches remaining`. Accessible via a dotted underline "What is this?" link — good, but easy to miss.

**Current mitigation:** The "What is this?" hover on the stitch score is the only in-context explanation. The MagicWandPanel's "Confetti Cleanup" is labeled with a header but not explained.

**Why it is critical:** Confetti stitches directly affect how difficult and time-consuming a pattern is to stitch. Users who don't understand this will generate patterns that are much harder to stitch than they expect, or conversely, will apply cleanup that removes too many stitches (>15% — a warning banner appears, which is good).

**Severity:** High  
**Frequency:** Every user who generates from a photo (very common)  
**Recommended fix:**  
- Rename "Orphan removal strength" → "Remove isolated stitches (clean up confetti)" with inline text: "Isolated single stitches are slow to stitch and use excessive thread. Higher values remove more."  
- In the stitch score widget, expand the "What is this?" from a hover title to an always-visible micro-explanation: "A lower score means more isolated stitches — harder to stitch. Increase 'orphan removal' to improve."

---

### 4. Export Preset: "Pattern Keeper" Default Is Unexplained

**Where:** `create.html` → Materials & Output → Output tab → `creator/ExportTab.js`.

**What happens:** The export panel defaults to the "Pattern Keeper" preset (stored in UserPrefs as `"patternKeeper"`). This is the PDF format optimised for the companion Pattern Keeper app. Most home users printing directly will want "Home Printing" instead — smaller file, portrait layout.

The preset cards show `"Pattern Keeper"` and `"Home Printing"` as labels, but there is no explanation of what Pattern Keeper is. A user not familiar with the app ecosystem will not know which to choose.

Additionally, the export settings include "Chart modes: B&W / Colour" checkboxes, page size, margin, stitches-per-page density, overlap, and several include/exclude options. If both B&W and Colour are unchecked, export fails with an error (this is caught, but the error message is "Pick at least one chart mode" — shown inline, which is correct).

**Current mitigation:** The preset cards exist and are labelled. Export errors are shown inline. The designer branding section is collapsible. Page count is shown as a live preview.

**Why it is critical:** Export is the end goal of the entire creation flow. A user who exports with the wrong preset may produce a file that looks different from what they expected, or may not understand why a PDF has symbols instead of colour squares.

**Severity:** High  
**Frequency:** Every user who exports  
**Recommended fix:**  
- Add a two-sentence description under each preset card: "Pattern Keeper: for use with the Pattern Keeper app. Optimised layout with symbols and colour codes." / "Home Printing: standard A4/Letter, colour squares, good for printing at home."  
- Add an info popover explaining what B&W vs Colour chart modes produce.

---

### 5. Cross-App Workflow Is Never Explained

**Where:** `home.html`, navigation links between all pages.

**What happens:** The app has three distinct tools — Creator (make a pattern), Tracker (stitch it), Stash Manager (manage threads). The intended workflow is:
1. Build your stash in the Manager
2. Use the Creator to generate a pattern constrained to your stash
3. Track progress in the Tracker

This workflow is never surfaced. A new user landing on `home.html` sees four tabs (Projects, Create new, Stash, Stats) with no indication that the tools reinforce each other. The "Create new" tab has tiles for "From image" and "From scratch" but no mention of stash integration.

The onboarding wizard for Creator (`onboarding-wizard.js`, step 2) says "Your stash and pattern library live one click away under 'Open Stash Manager'" — this is the only mention of the cross-app workflow in the entire onboarding.

**Current mitigation:** WelcomeWizard exists. The Creator has a "Use only my stash threads" toggle. The PrepareTab shows stash status for each thread.

**Why it is critical:** Users who don't set up their stash first miss the most valuable personalisation feature (stash-constrained generation). Users who don't know about the Tracker after creating a pattern lose the progress-tracking value.

**Severity:** Medium-High  
**Frequency:** All new users  
**Recommended fix:**  
- Add a "How it works" panel to `home.html` Create new tab: three steps with icons. (1) Set up your stash → (2) Generate a pattern → (3) Track your stitching.  
- On the WelcomeWizard step 3 (pick a starting option), add a note: "Tip: build your stash first for personalised colour matching."

---

### 6. Stitch Tracker: Empty State When No Pattern Exists

**Where:** `stitch.html` — `tracker-app.js`, initial load.

**What happens:** If a user navigates to `stitch.html` directly (URL, bookmark, or clicking "Track" on home before a project exists), the app boots with an empty project picker or a blank canvas. There is no clear call to action explaining that they need to create a pattern in the Creator first.

The `TrackerProjectPicker` modal shows "No saved projects yet" — correct but not actionable. The "stitching style" onboarding shows only after a project is loaded.

**Current mitigation:** "No saved projects yet" empty state text. WelcomeWizard for Tracker says "Track your progress on saved patterns" but doesn't direct users to the Creator.

**Why it is critical:** A user who bookmarks `stitch.html` or clicks it from the home page will be confused about why it appears empty.

**Severity:** Medium  
**Frequency:** Medium — mainly first-time users trying to start tracking  
**Recommended fix:**  
- Change the empty state to: "No patterns saved yet. Create a pattern in the Creator, then come back here to track your progress." with a link to `create.html`.  
- The WelcomeWizard for Tracker should add a step: "Before tracking, make sure you've created and saved a pattern in the Creator."

---

### 7. Blend Stitches — What They Are and When They're Worth It

**Where:** `create.html` sidebar (Advanced section) — `allowBlends` toggle; `creator/PatternTab.js` — palette chips showing blend IDs like "310+550".

**What happens:** "Allow blend stitches" is an Advanced toggle. Blends (two thread colours combined in the needle) are shown in the palette as compound IDs (e.g. `"310+550"`) and use a "+" visual in the palette chips. But the toggle has no explanation of what a blend is, why you'd want them, or what the stitching implication is (you need two separate threads, one of each colour, in the same needle).

On the PrepareTab shopping list, blends show as combined names ("Blanc + 3865") with a "Low stock" / "Need to buy" badge. Users who don't understand blends may not realise they need both threads.

**Current mitigation:** None in the UI; blends are documented in the README but not surfaced in-app.

**Why it is critical:** A user who doesn't understand blends may stitch a section with the wrong thread, or buy only one of the two threads needed for a blend.

**Severity:** Medium  
**Frequency:** Common — blends are enabled by default  
**Recommended fix:**  
- Add an info popover next to "Allow blend stitches": "A blend uses two thread colours twisted together in the needle to create an intermediate shade. Blends improve colour accuracy but use two skeins per blend combination."  
- On PrepareTab shopping list rows that are blends, add a small badge: "Blend — need both threads."

---

### 8. Adapt to Stash Modal — ΔE and Threshold Terminology

**Where:** `create.html` → AdaptModal (`creator/AdaptModal.js`), opened via "Match my stash" action.

**What happens:** The modal lets users swap their pattern's colours for ones in their stash. It exposes:
- Mode toggle: "Match my stash" / "Convert to brand"
- Threshold slider: 1–25 ΔE2000 (default 10)
- Per-row pickers with "MatchChip" showing tier label + "ΔE X.XX"

`ΔE2000` is a perceptual colour distance metric. It is the correct technical term but it is completely opaque to embroiderers. The threshold description "Only suggest substitutes within ΔE X" is not explained.

**Current mitigation:** The MatchChip shows human-readable tier labels: "Excellent", "Good", "Moderate", "Near miss", "No match". This is helpful, but the threshold slider still uses ΔE.

**Why it is critical:** The modal creates a **new project** (`AdaptationEngine.applyProposal`), which is the right non-destructive choice. But if users set the threshold too tight (low ΔE), no matches are found and they don't know why. If they set it too loose, they get poor colour substitutions.

**Severity:** Medium  
**Frequency:** Medium — only users with a populated stash reach this  
**Recommended fix:**  
- Replace the threshold label "ΔE2000 threshold (1–25)" with "Colour tolerance: tight ↔ loose" with a plain note: "Lower = only near-identical colours; higher = allow more variation. Default (10) is a good starting point."  
- Add a sentence below the threshold: "If no matches appear, increase the tolerance."

---

### 9. Bulk Add Threads — No Explanation of Expected Format

**Where:** `manager.html` → Bulk Add modal (`creator/BulkAddModal.js`).

**What happens:** The "Paste list" tab shows a textarea with placeholder text `"Paste a list of thread IDs, one per line or comma-separated."` This is minimal. The modal helpfully strips "DMC", "Anch", "Anchor" prefixes and handles comma/newline/semicolon delimiters, but the placeholder doesn't mention prefix-stripping. Users who have a list like "DMC 310, DMC 550" may not know if that format will work.

Unknown IDs are shown in red with "not found" — this is correct UX. But a user pasting a list from a pattern PDF (which often uses formats like "DMC White", "DMC Ecru") may get many red chips and not understand why.

**Current mitigation:** Visual feedback (green/red chips) is good. The "From a kit" tab with preset starter kits is a good alternative.

**Why it is critical:** Thread inventory setup is a prerequisite for stash-constrained generation. Users who can't figure out bulk add must add threads one by one, which is a significant friction barrier.

**Severity:** Medium  
**Frequency:** Common — most stash setup happens via bulk add  
**Recommended fix:**  
- Replace the textarea placeholder with a multi-line hint: "e.g. 310, 550, 3825\nOr: DMC 310\nDMC Ecru → use 'Ecru' (name-based search not supported; use the ID number)."  
- Add a "Supported formats" inline collapsible below the textarea.

---

### 10. Backup & Restore — Data Loss Risk Not Communicated

**Where:** `manager.html` and `create.html` — Preferences modal → Data & Storage section, `backup-restore.js`.

**What happens:** The "Restore from backup" action replaces ALL data in both IndexedDB databases (`CrossStitchDB` and `stitch_manager_db`) and relevant localStorage keys. This is a destructive, irreversible action. The modal shows a confirmation step (the `backupStatus` state in `manager-app.js` handles a `"confirm"` type), but the user needs to know what they're confirming before getting there.

Similarly, the "Export backup" produces a `.csb` file (compressed) by default. Users may not recognise this file format and may think the export failed.

**Current mitigation:** A confirmation step exists before restore. The backup includes a format description in the file content.

**Why it is critical:** Restoring a backup replaces all projects and all stash data with no undo. A user who accidentally restores an old backup loses all recent work.

**Severity:** High (if triggered accidentally)  
**Frequency:** Low (most users never use backup/restore)  
**Recommended fix:**  
- Before the confirmation, show a summary: "This will replace X projects and Y thread entries. This cannot be undone. Create a backup of your current data first?"  
- Explain the `.csb` file format on export: "Your backup is saved as a `.csb` file. Keep it somewhere safe — it contains all your projects and stash data."

---

## Prioritised TODO List

### home.html

- [ ] **[Priority: HIGH]** [Screen: home] [Flow: First visit / new user orientation] Add a "How it works" 3-step explainer to the "Create new" tab showing the Creator → Tracker → Stash Manager workflow with brief role descriptions for each tool.
- [ ] **[Priority: MED]** [Screen: home] [Flow: First-time navigation] Update WelcomeWizard step 2 copy to explicitly mention the workflow: "Build your stash first, then generate patterns that use only threads you own."
- [ ] **[Priority: MED]** [Screen: home] [Flow: Empty projects state] Ensure the empty projects state (no projects yet) includes a prompt pointing to "Create new" with a one-sentence description of what the Creator does.

---

### create.html — Image & Pattern Generation

- [ ] **[Priority: HIGH]** [Screen: Creator / Image upload] [Flow: First pattern creation] Enable ImportWizard by default (remove `experimental.importWizard` flag gate), or add a "New to this? Take a 30-second guided setup" CTA above the standard sidebar that launches the wizard.
- [ ] **[Priority: HIGH]** [Screen: Creator / Dimensions sidebar tab] [Flow: First pattern creation] Add info popover next to "Fabric count" label explaining how count affects physical size. Include live physical size estimate (already in ImportWizard step 3 — surface in the standard flow too).
- [ ] **[Priority: HIGH]** [Screen: Creator / Advanced settings] [Flow: Pattern generation] Rename "Orphan removal strength" → "Remove isolated stitches (confetti cleanup)" with a one-line description: "Isolated single stitches make patterns harder to stitch. Raise this to remove them automatically."
- [ ] **[Priority: HIGH]** [Screen: Creator / Pattern tab] [Flow: Post-generation review] Make the "Stitch Score" widget's explanation always visible (not hover-only). Add: "Lower score = more isolated stitches. Use 'orphan removal' to improve."
- [ ] **[Priority: MED]** [Screen: Creator / Advanced settings] [Flow: First pattern creation] Add a "Help me choose" collapsible section at the top of the Advanced settings panel with 3-line plain-English summary of when to use dithering, when to reduce max colours, and what smoothing does.
- [ ] **[Priority: MED]** [Screen: Creator / Image sidebar tab] [Flow: Pattern generation] Add info popover next to "Dithering" options explaining: "Dithering blends colours at pixel level for smoother gradients. 'Balanced' is good for most photos; turn off for designs with solid blocks of colour."
- [ ] **[Priority: MED]** [Screen: Creator / Advanced settings] [Flow: Pattern generation] Add info popover next to "Min stitches per colour": "Colours with fewer stitches than this will be merged into nearby colours. Useful for reducing the final colour count."
- [ ] **[Priority: MED]** [Screen: Creator / Advanced settings] [Flow: Pattern generation — blends] Add info popover next to "Allow blend stitches": "A blend uses two thread colours in the same needle to create an intermediate shade. Improves colour accuracy but each blend needs two separate thread colours."
- [ ] **[Priority: MED]** [Screen: Creator / Pattern tab] [Flow: Post-generation] Add a one-line "Getting started" hint when a pattern is first generated: "Right-click any cell to change its colour. Use the tools above to paint, fill, or erase."
- [ ] **[Priority: LOW]** [Screen: Creator / Image sidebar] [Flow: Background removal] Add inline note next to "Remove background colour" explaining when to use it: "Use if your image has a solid white or flat-colour background you want to stitch on bare fabric."

---

### create.html — Materials & Output

- [ ] **[Priority: HIGH]** [Screen: Creator / Output tab] [Flow: First export] Add two-sentence descriptions under each export preset card: "Pattern Keeper: optimised for the Pattern Keeper iOS/Android app. Home Printing: standard single-file PDF, ideal for printing at home."
- [ ] **[Priority: HIGH]** [Screen: Creator / Output tab] [Flow: Export] Add info popover next to "Chart modes (B&W / Colour)" explaining: "B&W uses symbols for each colour — better when printing in greyscale. Colour shows filled squares matching each thread colour."
- [ ] **[Priority: MED]** [Screen: Creator / Stash tab (PrepareTab)] [Flow: Shopping list review] On blend rows in the shopping list, add a small badge: "Blend — both threads needed."
- [ ] **[Priority: MED]** [Screen: Creator / Stash tab] [Flow: Shopping list] Add an inline tooltip next to "Over-two" toggle: "Stitching over two threads of evenweave makes stitches larger. Tick if you're working on evenweave fabric over two threads."
- [ ] **[Priority: LOW]** [Screen: Creator / Output tab] [Flow: Export] Add live "Approximate file size" estimate near the page count preview.

---

### create.html — Pattern Editing Tools

- [ ] **[Priority: MED]** [Screen: Creator / Pattern tab] [Flow: Pattern editing] Add a persistent "Tool hint" area below the canvas (separate from the status bar) showing a one-sentence description of the currently active tool with keyboard shortcut.
- [ ] **[Priority: MED]** [Screen: Creator / MagicWandPanel] [Flow: Selection operations] Add a small guide icon next to "Confetti Cleanup" panel header explaining: "Removes isolated stitches within your selection. Preview first to see what will be removed."
- [ ] **[Priority: MED]** [Screen: Creator / AdaptModal] [Flow: Stash adaptation] Replace "ΔE2000 threshold" label with "Colour tolerance" and add tooltip: "Controls how different a substitute can be. Lower = near-identical only; higher = allows more variation. Default 10 works for most cases."
- [ ] **[Priority: LOW]** [Screen: Creator / Pattern tab] [Flow: Backstitch] Add status bar hint when backstitch tool is active: "Click grid intersections to draw lines. Right-click to cancel a line in progress."

---

### stitch.html — Stitch Tracker

- [ ] **[Priority: HIGH]** [Screen: Tracker / empty state] [Flow: First visit with no projects] Replace "No saved projects yet" text with: "You need a pattern to track. Create one in the Pattern Creator, then come back here." with a link to `create.html`.
- [ ] **[Priority: MED]** [Screen: Tracker / WelcomeWizard] [Flow: First visit] Add a wizard step: "Before you can track, save a pattern in the Pattern Creator. If you've done that, select it from the project list." Ideally place this before the Track/Navigate modes step.
- [ ] **[Priority: MED]** [Screen: Tracker / first-time stitching style picker] [Flow: Stitching style setup] Add brief label descriptions to the style options: "One section at a time (block stitching) — finish one area before moving on." / "One colour at a time (cross-country) — finish all stitches in one colour across the whole pattern."
- [ ] **[Priority: MED]** [Screen: Tracker / session start] [Flow: Starting a session] Add a tooltip on the session time-goal input explaining: "Optional. If set, the timer will warn you when your time is running low."
- [ ] **[Priority: LOW]** [Screen: Tracker / realistic preview] [Flow: Preview levels] Add labels to the 4 level buttons in the realistic preview modal: "Flat / Shaded / Detailed / Detailed+blend" already exist in code — ensure they display at all viewport widths.

---

### manager.html — Stash Manager

- [ ] **[Priority: HIGH]** [Screen: Manager / Threads tab (first visit)] [Flow: Initial stash setup] Add a callout at the top of the empty Threads tab (no threads owned): "Your stash is empty. Add threads you own using Bulk Add (press B), or tick them one by one. Your stash is used in the Creator to suggest thread matches."
- [ ] **[Priority: MED]** [Screen: Manager / Bulk Add modal] [Flow: Bulk thread entry] Expand textarea placeholder to show accepted formats including examples: "310, 550, White\nOr: DMC 310\nPrefix 'Anchor' or 'Anch' for Anchor threads."
- [ ] **[Priority: MED]** [Screen: Manager / Bulk Add modal] [Flow: Bulk thread entry] Add a "Supported formats" expandable hint below the textarea covering: numeric IDs, DMC/Anchor prefix stripping, and a note that thread names (e.g. "Blanc") are not supported — only IDs.
- [ ] **[Priority: MED]** [Screen: Manager / Patterns tab] [Flow: Pattern library] In the empty patterns state, add a sentence: "Patterns you create in the Pattern Creator are added here automatically."
- [ ] **[Priority: LOW]** [Screen: Manager / Preferences → Data & Storage] [Flow: Backup restore] Before the restore confirmation, show a data summary: "This will replace X projects and Y thread entries. This action cannot be undone."
- [ ] **[Priority: LOW]** [Screen: Manager / Preferences → Data & Storage] [Flow: Backup export] Add a tooltip on the export button explaining the `.csb` file format: "Saves as a compressed backup file (.csb). Keep it safe — it includes all your patterns and stash data."

---

### Preferences Modal (all pages)

- [ ] **[Priority: MED]** [Screen: Preferences / Pattern Creator section] [Flow: First use] Add inline description for "Default fabric count": "Sets the starting count for new patterns. Change this to match the Aida or evenweave you typically buy."
- [ ] **[Priority: MED]** [Screen: Preferences / Pattern Creator section] [Flow: Advanced settings] Add inline description for "Default dithering": "Controls whether new patterns use dithering by default. Balanced is good for most photos."
- [ ] **[Priority: LOW]** [Screen: Preferences / Stash section] [Flow: Low stock alerts] Add tooltip on "Low stock threshold": "You'll be flagged when you own fewer than this many skeins of a thread in a pattern's shopping list."

---

## Flows Where a Guided Walkthrough Would Be Worth the Investment

These are flows where a coachmark sequence (3–6 steps, dismissible, with a "Don't show again" option) would have the highest ROI because the flow is both **frequent** and **non-obvious**:

1. **First Pattern Generation** (Creator) — Walk through: upload image → choose fabric count → set max colours → click Generate → review stitch score → export. _High ROI._ This is the core workflow. The ImportWizard already exists — enabling it by default IS this walkthrough.

2. **Post-Generate Editing Loop** (Creator) — After generating, a coachmark sequence pointing to: (a) the stitch score widget, (b) the right-click context menu, (c) the MagicWand tool, (d) the Palette chip for colour swaps. Users don't discover these tools organically. _Medium-High ROI._

3. **Stash Setup → Stash-Constrained Generation** (Manager → Creator) — A cross-page walkthrough: add threads to stash → return to Creator → enable "Use only my stash" → regenerate. This is the highest-value feature and is currently invisible to new users. _High ROI._

4. **Shopping List Review** (Creator / Prepare tab) — A single first-visit coachmark on the Prepare tab explaining the stash status column (owned / partial / need to buy) and the "Add all to stash" button. _Medium ROI._

5. **Tracker First Session** (Tracker) — Walk through: open a project → pick stitching style → start a session → mark some stitches done → end session → see summary. The StitchingStyleOnboarding already handles part of this — a broader welcome walkthrough tying all steps together would complete it. _Medium ROI._

---

## Pain Point Category Summary

| Category | # Issues Found | Highest Severity |
|---|---|---|
| Multi-step flows | 4 | Critical |
| Non-obvious settings | 7 | High |
| Destructive actions | 2 | High |
| Jargon-heavy UI | 4 | Medium-High |
| Complex forms | 3 | High |
| State-dependent UI | 3 | Medium |
| Error-prone actions | 4 | Medium |
| First-use moments | 5 | High |

---

## Appendix: Terms Needing Plain-Language Treatment

The following terms appear in the UI with no in-context explanation and are either embroidery-specific jargon or app-internal terminology:

| Term | Used In | Plain-Language Alternative / Explanation Needed |
|---|---|---|
| Fabric count / Aida count | Creator, Manager, PrepareTab | "How many holes per inch in your fabric. Standard Aida = 14." |
| Confetti | PatternTab, MagicWandPanel | "Isolated single stitches — hard to stitch, waste thread." |
| Orphan stitches | useCreatorState (sidebar label) | "Stitches with no neighbours — same as confetti." |
| Skein | PrepareTab, ShoppingListModal | "One pre-wound length of embroidery thread (~8m)." |
| Blend | Advanced settings, palette chips | "Two thread colours used simultaneously in one needle." |
| Half stitch | ToolStrip, PatternTab status bar | "A diagonal stitch covering half a square — the first leg of a cross stitch." |
| Backstitch | ToolStrip | "Thin outline stitch following the grid lines, not the squares." |
| Over two | PrepareTab | "Stitching over two fabric threads at once (for evenweave fabric)." |
| DMC / Anchor | Manager, Creator palette | "Thread brands. DMC is the default. Numbers identify specific colours." |
| ΔE / ΔE2000 | AdaptModal MatchChip, threshold | "A number measuring how different two colours look. Under 5 = hard to tell apart." |
| Stash | All pages | "Your personal thread inventory — the threads you own." |
| Pattern Keeper | ExportTab preset | "A companion app (iOS/Android) for viewing cross-stitch patterns on your phone." |
| Cross-country | Tracker style picker | "Stitching one colour across the whole pattern before switching — the alternative to block stitching." |
