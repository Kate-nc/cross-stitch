# Help System — Information Architecture Audit

**Audit date:** 2026-05-02  
**Files examined:** `help-drawer.js`, `home-app.js`, `creator-main.js`, `tracker-app.js`, `manager-app.js`, `creator/Sidebar.js`, `creator/ExportTab.js`, `creator/PatternTab.js`, `creator/ProjectTab.js`, `creator/PrepareTab.js`, `creator/MaterialsHub.js`, `creator/LegendTab.js`, `creator/ActionBar.js`, `creator/ImportWizard.js`, `onboarding-wizard.js`, `coaching.js`

---

## Executive Summary

The help drawer (`help-drawer.js`) provides a usable foundation — a three-tab structure (Help / Shortcuts / Getting Started), a search bar with British/American spelling aliases, and a well-written Glossary — but it covers only a fraction of the application's surface area. Of the roughly 70 discrete user-facing features mapped below, 25 have no help content at all, 17 have only a keyboard-shortcut entry (but no explanatory prose), and a further 13 have content that is either significantly incomplete or describes the UI at a previous point in the app's evolution. The most critical gap is the Creator's confetti cleanup and stitch score system, which is complex, highly consequential (it can destroy pattern detail), and entirely unmentioned. A second major gap is the Stitch Tracker's "Stitching style" picker, which is the very first screen new users interact with; it too has no help coverage. Several whole sub-systems — the Materials & Output hub reorganisation, the Stats page, the Tracker's session goals and breadcrumb trail, and the Stash Manager's thread-filter UI — have zero coverage.

---

## Feature → Help Coverage Map

### Key

| Symbol | Meaning |
|---|---|
| FULL | Dedicated section in HELP_TOPICS with accurate prose |
| PARTIAL | Mentioned but without sufficient detail to be useful |
| SHORTCUT | Appears in the Shortcuts tab only — no explanatory prose |
| NONE | No coverage anywhere in the help system |
| OUTDATED | Content references UI that no longer exists or has moved |

---

### Home Page (`home.html` / `home-app.js`)

| Feature | Coverage | Notes |
|---|---|---|
| Home page tabs (Projects / Create new / Stash / Stats) | NONE | New entry point, not mentioned anywhere |
| Active project card (progress bar, ETA, last session) | NONE | ETA calculation logic completely undocumented |
| Projects list with per-row Track / Edit buttons | NONE | |
| "Create new" tab — From image / From blank tiles | NONE | |
| Stash summary tile on Home | NONE | |
| Stats quick-link on Home | NONE | |

---

### Pattern Creator — Generation (`create.html`)

| Feature | Coverage | Notes |
|---|---|---|
| Image-based pattern generation (upload / drop) | FULL | Well described in "Generating a pattern from an image" |
| Palette size control (max colours) | FULL | Covered as "Palette Control" bullet |
| Minimum stitches per colour | FULL | Covered as its own bullet |
| Remove background colour (Pick tool) | FULL | Covered with "Pick" action described |
| Image filters (brightness, contrast, bilateral filter, edge enhance, saliency boost) | NONE | The Prepare/Generate sidebar has multiple filter controls not mentioned anywhere |
| Confetti cleanup (levels 0–4, orphan stitch removal) | NONE | **Critical gap.** Multi-level, consequential feature with aggressive defaults |
| Stitch score / confetti quality badge (0–100) | NONE | Novel UI element; "What is this?" tooltip exists but help does not |
| Comparison slider (original vs preview) | NONE | Interactive drag widget with zoom lens and sweep mode |
| Diff overlay (changed-pixels flash after regeneration) | NONE | Auto-dismissing visual aid; confuses users who don't expect it |
| Heatmap overlay (generation density map) | NONE | Toggle hidden in preview toolbar |
| Random seed / reproducibility | NONE | Seed editing is available but no help explaining what it does |
| QA / Quick-add thread by DMC ID input | NONE | Small input at the bottom of the palette chips panel |

---

### Pattern Creator — Editing Tools

| Feature | Coverage | Notes |
|---|---|---|
| Cross-stitch paint tool (paint / fill) | FULL | Described in "Editing the generated pattern" |
| Half-stitch tool (forward `/` and back `\`) | PARTIAL | Named in editing section but direction difference not explained |
| Backstitch tool (draw lines between corners) | PARTIAL | Mentioned; right-click to cancel and "Erase Line" sub-tool not documented |
| Erase tool | SHORTCUT | Key `5` listed; no prose about what it erases vs the backstitch erase |
| Eyedropper tool | SHORTCUT | Key `I` listed only |
| Hand / pan tool | FULL | Listed in "Creator tools" with correct key |
| Magic wand (select by colour region) | PARTIAL | One-line description; Shift/Alt modifier modes (add/subtract/intersect) undocumented |
| Lasso select (freehand / polygon / magnetic-edge modes) | PARTIAL | Named in "Creator tools" but three sub-modes not explained |
| Selection operations (select all, invert) | SHORTCUT | Ctrl+A, Ctrl+Shift+I listed only |
| Palette swap (replace one colour with another) | NONE | Entire feature undocumented |
| Scratch mode / blank canvas creation | NONE | A distinct creation flow (start from blank rather than from image) |
| Undo / Redo | PARTIAL | Mentioned in "Creator tools" as keyboard shortcut context only |
| Zoom in / out / fit | SHORTCUT | Keys listed; pinch-to-zoom on mobile not mentioned |

---

### Pattern Creator — Views

| Feature | Coverage | Notes |
|---|---|---|
| Colour / Symbol / Both view cycle (`V`) | SHORTCUT | No explanation of when symbols appear or what they are |
| Highlight view modes (Isolate / Outline / Tint / Spotlight) | SHORTCUT | The four sub-modes are listed in shortcuts but never explained in prose |
| Split-pane preview (`\`) | SHORTCUT | No explanation of what the two panes show |
| Realistic preview modal (4 sheen levels: Flat / Shaded / Detailed / Detailed+blend) | NONE | No help at all; 4-level quality picker is novel UI |

---

### Pattern Creator — Sidebar / Palette Panel

| Feature | Coverage | Notes |
|---|---|---|
| Palette chips with stash-status dots (green/yellow/red) | NONE | Dot colour system unexplained |
| "Limit to stash" filter (hide unowned colours from palette) | NONE | Important workflow tool for stash-constrained generation |
| Stash strip warning (unowned threads call-to-action) | NONE | |
| Pattern info popover (dimensions, difficulty, skein count, ETA) | NONE | Replaced the inline summary block — not in help |

---

### Pattern Creator — Materials & Output Hub

The hub replaced three separate top-level tabs with a single tabbed page. The old tab names ("Materials", "Prepare", "Export") no longer exist.

| Feature | Coverage | Notes |
|---|---|---|
| Materials & Output hub navigation (Threads / Stash status / Output sub-tabs) | NONE | The reorganisation is invisible to help; old tab names in user's memory will be wrong |
| Thread legend (LegendTab) — sorted list with stitch and skein counts | NONE | |
| Fabric background colour picker (5 presets + custom) | NONE | |
| Over-two toggle (stitching over two on evenweave) | NONE | Important for evenweave users, no explanation of what it does |
| Shopping list / skein calculator (PrepareTab) | NONE | |
| Fabric size calculator (add margin in inches or cm) | NONE | |
| "Add all to stash" button | NONE | |
| PDF export — presets (Pattern Keeper / Home Printing) | PARTIAL | Mentioned in "Saving and Backup" but preset difference not explained |
| PDF settings (page size, margins, chart modes B&W/Colour, overlap) | NONE | |
| PDF page-count preview | NONE | |
| Cover page / info page / index page toggles | NONE | |
| Mini-legend option | NONE | |
| Workshop PDF theme (opt-in via pref) | NONE | |
| Designer branding section (logo, name, website on PDF) | NONE | |
| PNG export | NONE | "Export PDF" is mentioned; PNG is not |

---

### Pattern Creator — Project Tab

| Feature | Coverage | Notes |
|---|---|---|
| Time estimate calculator (adjustable stitches/hour) | NONE | Not in help at all; actual-session-derived speed shown but unexplained |
| Finished size table (by fabric count, with 2-inch margin column) | NONE | |
| Cost estimate (price per skein, "Still to buy" split) | NONE | |
| Thread organiser (owned / need-to-buy / substitute counts) | NONE | |

---

### Pattern Creator — Action Bar

| Feature | Coverage | Notes |
|---|---|---|
| Mode switch (Create / Edit / Track) in action bar | NONE | This is how you navigate between the creator and tracker |
| Print PDF button (primary action) | PARTIAL | "Export PDF" mentioned in Saving section; action bar context not explained |
| "More export options…" menu (jumps to Output sub-tab) | NONE | |
| Import / Open pattern | NONE | |

---

### Import Wizard (experimental)

| Feature | Coverage | Notes |
|---|---|---|
| 5-step guided import flow (Crop / Palette / Size / Preview / Confirm) | NONE | Gated by `experimental.importWizard` pref; still no help when enabled |

---

### Stitch Tracker (`stitch.html` / `tracker-app.js`)

| Feature | Coverage | Notes |
|---|---|---|
| Load / open a saved project | NONE | First step for new users; no help explaining how |
| Track mode (click/drag to mark stitches done) | FULL | Described in "Tracking progress" |
| Navigate mode (crosshair guide placement) | PARTIAL | Named but the guide's visual purpose and how to move it not explained |
| Parking markers | PARTIAL | Mentioned in Navigate mode bullet; no explanation of the concept |
| **Stitching style picker** (block / cross-country / freestyle) | **NONE** | **First screen new users see. No help whatsoever.** |
| Start corner picker | NONE | Part of stitching style setup; also undocumented |
| Session timer (auto-pause after 5 min inactivity) | FULL | Covered in "Sessions and timer" |
| Session config modal (time available + stitch goal) | NONE | Two-field pre-session setup screen with no help |
| Session summary modal (speed, progress delta, blocks, colours) | NONE | Post-session stats screen undocumented |
| Breadcrumb trail (visual path of stitching order) | NONE | Significant feature, "View breadcrumb trail" button in session summary |
| Colours drawer (per-colour progress bars, click to highlight) | PARTIAL | Named in "Tracking progress"; click-to-highlight behaviour not described |
| Highlight view modes (Isolate / Outline / Tint / Spotlight) | SHORTCUT | Same four modes as creator; shortcuts listed but no prose |
| Previous / next colour in highlight view (`[` / `]`) | SHORTCUT | |
| Layer visibility toggles (full / half / knot / backstitch) | SHORTCUT | F/H/K/L keys listed; what "layer" means and why you'd toggle not explained |
| Tracker project rail (tablet/desktop — left side panel) | NONE | Rail, collapse button, project thumbnails all undocumented |
| "Threads needed" side panel (owned vs to-buy split) | NONE | Key buying-decision tool; completely undocumented |
| "Today" stats card in side panel | NONE | |
| Stitch toggle (quick ownership toggle from tracker) | NONE | +/- buttons on thread rows in side panel |
| Realistic preview in Tracker | NONE | Same 4-level modal as Creator; no help |
| PDF export from Tracker | NONE | Different entry point from Creator; not mentioned |
| Project picker modal ("Switch project") | NONE | |
| Counting aids (`C` key) | SHORTCUT | |
| Space to pan | SHORTCUT | |

---

### Stash Manager (`manager.html` / `manager-app.js`)

| Feature | Coverage | Notes |
|---|---|---|
| Thread inventory overview (DMC + Anchor) | FULL | Described in "Thread stash" |
| Bulk add (paste list of IDs) | FULL | Covered as "Bulk Add" bullet |
| Brand toggle (DMC / Anchor / both) | FULL | Covered as "Brand toggle" bullet |
| Thread filter (all / owned / to-buy / low stock) | NONE | Filter bar controls undocumented |
| Thread search | NONE | |
| Partial skein gauge (remnant / about-half / mostly-full / used-up) | NONE | 4-state gauge UI with no explanation |
| Low stock alerts | NONE | Threshold-based alert system |
| Stash info chip + popover (stash completeness summary) | NONE | |
| Thread expansion (click thread to see full detail row) | NONE | |
| Thread conflicts / "ready to start" indicator | NONE | |
| Pattern library | FULL | Described in "Pattern Library" section |
| Pattern filter (all / wishlist / owned / in-progress / completed) | NONE | |
| Pattern sort (date / title / designer / status) | NONE | |
| Pattern coverage indicator per card | FULL | Covered as "Coverage" bullet |
| Add / edit pattern manually | NONE | |
| Auto-sync from Creator / Tracker | PARTIAL | Body text in Pattern Library briefly mentions "Auto-synced" |
| Thread conversion table (DMC ↔ Anchor equivalents) | NONE | `thread-conversions.js` provides full tables; UI may expose them |
| Profile settings (fabric count, strands, waste factor, brand) | NONE | |
| Storage usage indicator | NONE | |

---

### Cross-App Features

| Feature | Coverage | Notes |
|---|---|---|
| Command palette (`Ctrl+K` / `⌘K`) | SHORTCUT | Shortcut listed as "Open the command palette" — what it can do is not described |
| Preferences modal (global settings) | NONE | Extensive settings modal with no help coverage |
| Full-app backup / restore (`.csbackup`) | FULL | Covered in "Full-app backup" |
| Folder sync (Dropbox / iCloud / OneDrive) | FULL | Covered as sub-bullet |
| Auto-export to sync folder | FULL | Covered as sub-bullet |
| Stats page (sessions history, sparkline, velocity) | NONE | Entire major section with zero coverage |
| Stats activity calendar (heatmap per day) | NONE | |
| Stats insights (AI-style observations panel) | NONE | |
| Dark mode / light mode | NONE | |
| Welcome wizard (first-visit guided tour per page) | PARTIAL | Getting Started references "Replay" buttons; wizard content itself not previewed |
| Coachmarks / in-app tooltips (coaching.js) | PARTIAL | "Restart guided tours" button exists in Getting Started; coachmarks themselves not explained |
| Glossary | FULL | Well-written with 7 entries |
| Save vs Download vs Export disambiguation | FULL | Clear and accurate |
| OXS export (KG-Chart format) | NONE | Listed nowhere; implied by "export" reference but not named |

---

## Prioritised TODO List

### Group: Pattern Creator — Generation & Confetti

- [ ] [Priority: HIGH] Write a "Confetti cleanup" help section explaining: what orphan stitches are, what the four cleanup levels do, when each is recommended, and that aggressive levels can destroy fine details (refer users to the stitch score to assess impact).
- [ ] [Priority: HIGH] Write a "Stitch score" help section explaining the 0–100 score, why it matters for stitchability, and how to improve it (reduce cleanup level, increase grid size, or adjust palette).
- [ ] [Priority: MED] Write a brief "Image filters" help section covering brightness/contrast/saturation, the bilateral filter (smooths, reduces colour noise), and the edge-enhance option — explaining which filters are good for portraits vs busy patterns.
- [ ] [Priority: MED] Document the comparison slider: explain it compares the original photo against the current pattern preview, and describe the zoom-lens (Alt-hold) and auto-sweep button.
- [ ] [Priority: LOW] Document the diff overlay (brief: orange flash highlights what changed since the last generation) and the heatmap overlay.
- [ ] [Priority: LOW] Document the random seed control and what it's useful for (reproducible generations for A/B comparisons).

### Group: Pattern Creator — Editing Tools & Views

- [ ] [Priority: HIGH] Expand the "Highlight view" entry from a shortcut-only listing to a prose explanation: describe the four modes (Isolate, Outline, Tint, Spotlight), when you'd use each one, and how `[` / `]` cycle between colours. This applies to both Creator and Tracker (see also Tracker group below).
- [ ] [Priority: HIGH] Document "Scratch mode" (blank canvas creation): explain it's for designing from scratch rather than from an image, how to add colours, and that the palette chips act differently (no stitch counts until you paint).
- [ ] [Priority: MED] Expand the Magic Wand entry to cover Shift (add to selection), Alt (subtract), and Shift+Alt (intersect) modifier modes.
- [ ] [Priority: MED] Expand the Lasso entry to cover its three sub-modes: freehand drag, polygon (click to add anchors), and magnetic-edge (snaps to colour boundaries).
- [ ] [Priority: MED] Document the Realistic Preview modal: explain the four sheen levels and note that higher levels better represent how a finished piece will actually look.
- [ ] [Priority: MED] Document Palette Swap: explain the workflow (select source colour, pick replacement), and that it replaces all instances across the canvas.
- [ ] [Priority: LOW] Write a short entry for the Split-pane preview (`\`): what the two halves show, how to resize the split, and that the preview renders at full pattern scale.
- [ ] [Priority: LOW] Document the Colour/Symbol/Both view cycle and note that symbols only become legible above ~6× zoom.

### Group: Pattern Creator — Materials & Output Hub

- [ ] [Priority: HIGH] Add a "Materials & Output" help section documenting the hub's three sub-tabs (Threads / Stash status / Output), replacing any mental model users may have from the old tab names. This is the most significant structural navigation change in the app.
- [ ] [Priority: HIGH] Document the "Stash status" sub-tab (PrepareTab): shopping list, how owned/partial/needed status is determined, the fabric size calculator, the over-two toggle (with a brief explanation of "stitching over two threads"), and the "Add all to stash" button.
- [ ] [Priority: MED] Expand the "Export PDF" help to cover: the two presets (Pattern Keeper vs Home Printing) and the key difference (cell size / margin defaults), the chart modes (B&W symbols vs colour blocks), the overlap option, and the page-count preview.
- [ ] [Priority: MED] Document the Designer Branding section: what it is, how it persists via UserPrefs, and the Pattern Keeper compatibility note.
- [ ] [Priority: MED] Add a "Threads" sub-tab help entry (LegendTab) covering the fabric background colour picker (with presets for Aida, evenweave, black Aida, linen), the sort options, and the stash-status column.
- [ ] [Priority: LOW] Document PNG export and how it differs from PDF (raster export of the chart canvas, no legend pages).
- [ ] [Priority: LOW] Document OXS export and what KG-Chart is.

### Group: Pattern Creator — Project Tab & Action Bar

- [ ] [Priority: MED] Document the Project tab's four sections (Time Estimate, Finished Size, Cost Estimate, Thread Organiser) in help. In particular, explain that the time estimate is refined by actual tracked session data.
- [ ] [Priority: MED] Document the Action Bar's mode switch: explain what "Create / Edit / Track" means, and that "Track" navigates to the Stitch Tracker with the current project pre-loaded.
- [ ] [Priority: LOW] Add a note in the Saving section that the action bar's "Print PDF" opens the same export flow as the Output sub-tab, so users who click the wrong thing aren't lost.

### Group: Pattern Creator — Palette Panel

- [ ] [Priority: MED] Document the stash-status dots on palette chips (green = fully owned, yellow = partially owned, red = not in stash) and the "Limit to stash" filter that hides unowned colours from the palette.
- [ ] [Priority: MED] Document the Pattern Info popover (accessed from the action bar chip): list what it shows (dimensions, fabric count, stitch count, difficulty stars, skeins, ETA) and note that the ETA updates as you log sessions.
- [ ] [Priority: LOW] Document the quick-add thread input at the bottom of the palette chips panel (type a DMC ID → "+ Add").

### Group: Stitch Tracker

- [ ] [Priority: HIGH] Write a "Stitching style" help section — the stitching style picker is the very first screen new users see in the Tracker and has zero documentation. Cover the three working styles (block sections / one colour at a time / freestyle), the block-shape picker, and the start-corner picker. Include a note that this can be changed at any time from the tracker toolbar.
- [ ] [Priority: HIGH] Document how to open/load a project in the Tracker: explain the relationship between the Home page, the Creator, and the Tracker — specifically that you need a saved project before the Tracker is useful.
- [ ] [Priority: HIGH] Document the Tracker's "Threads needed" side panel: explain the owned vs to-buy split, how to toggle ownership directly from the tracker (the +/- buttons), and that changes sync to the Stash Manager.
- [ ] [Priority: MED] Expand the Highlight view entry (see Creator group) to explicitly cover the Tracker context: explain `[` / `]` to cycle colours and the four modes. Note that pressing `1–4` in Highlight view selects the mode.
- [ ] [Priority: MED] Document the Session Config modal: explain the "time available" presets and the optional stitch goal, and note that completing either goal triggers the session summary.
- [ ] [Priority: MED] Document the Session Summary modal: explain what each metric means (speed in stitches/hr, vs-average comparison, blocks completed, colours finished) and the breadcrumb trail link.
- [ ] [Priority: MED] Document the Breadcrumb Trail: what it records (the sequence of cells marked done), why it's useful (shows your stitching path), and how to access it (session summary button).
- [ ] [Priority: MED] Document the Tracker project rail (tablet/desktop): explain the left-side switcher, the Today stats card, and the collapsible state.
- [ ] [Priority: MED] Expand the Navigate mode entry to explain parking markers in more detail: what they are (visual bookmarks), how to place one (select a colour in Navigate mode, then click), and why stitchers use them (hold your place between sessions).
- [ ] [Priority: LOW] Document layer visibility toggles (F/H/K/L) with a brief explanation of what each layer is and when you'd want to hide it.
- [ ] [Priority: LOW] Document the project picker modal ("Switch project") and when you'd use it vs going back to Home.

### Group: Stash Manager

- [ ] [Priority: HIGH] Document the thread filter bar (All / Owned / To buy / Low stock) and the brand filter (DMC / Anchor / Both).
- [ ] [Priority: MED] Document the Partial Skein gauge: explain the four states (mostly-full, about-half, remnant, used-up), how to set it, and how it interacts with skein count estimates (a "remnant" counts as less than one skein for shopping list purposes).
- [ ] [Priority: MED] Document pattern filter and sort options: explain the five status filters (wishlist / owned / in-progress / completed / all) and the four sort options.
- [ ] [Priority: MED] Document Low Stock Alerts: explain the threshold setting, where to find the alert, and how it interacts with shopping lists.
- [ ] [Priority: LOW] Document the Add / Edit Pattern flow for manually-added patterns (non-auto-synced entries).
- [ ] [Priority: LOW] Document thread conversions (DMC ↔ Anchor equivalents): explain what the conversion table provides and note its limitations (conversions are approximate — colour-matching, not exact dye matches).
- [ ] [Priority: LOW] Document the Profile Settings panel (fabric count, strands, waste factor) and explain how these values affect the skein estimates shown throughout the app.

### Group: Cross-App / Infrastructure

- [ ] [Priority: HIGH] Add a "Stats page" help section covering: sessions view (calendar, sparkline), the activity heatmap, the velocity metric (stitches/hr), completion ETA, and the Insights panel.
- [ ] [Priority: HIGH] Expand the Command Palette entry from a one-line shortcut to a short help section: explain what kinds of actions are available (navigation, opening modals, triggering exports), that the list is context-sensitive per page, and give 3–4 example commands.
- [ ] [Priority: MED] Document the Preferences modal: the major preference categories (Creator defaults, Tracker defaults, Stash defaults, theme/appearance) and note that changes take effect immediately.
- [ ] [Priority: MED] Add a "Home page" help section explaining the four tabs, the active project card (with ETA), and how clicking "Edit" vs "Track" on a project card differs.
- [ ] [Priority: MED] Expand the Glossary to add: Blend (two threads blended together in one needle), Half stitch (diagonal stitch covering half a cell), French knot, Confetti (isolated single-colour stitches), Fabric count (threads per inch), Over two (stitching through two fabric threads on evenweave).
- [ ] [Priority: LOW] Add a "Dark mode" entry in Preferences help or the Glossary explaining the theme toggle location.
- [ ] [Priority: LOW] Clarify the "Open in Stitch Tracker (Link)" entry in Saving to note the URL length limit for pattern size and that large patterns must be saved as a file instead.

### Group: Accuracy / Outdated Content

- [ ] [Priority: HIGH] Update the "Colours Drawer" description in the Tracker help section — it is described as being "at the bottom" of the screen, but the current UI shows it as a slide-up sheet toggled via the `D` key and the dock. The description is functionally accurate but the location is wrong.
- [ ] [Priority: MED] The "Creator tools" section lists "Hand (H)" — the actual shortcut is not `H`; `H` in the Tracker toggles the half-stitch layer. In the creator, space-hold pans. Verify the hand-tool shortcut and correct if wrong.
- [ ] [Priority: MED] The "Track Mode" help description says "Use the timer to estimate your completion date" — the timer now feeds a velocity-based ETA displayed on the Home page project card, not within the tracker itself. Update to reflect this.
- [ ] [Priority: LOW] The "Pattern Library" help mentions "Patterns added here without a linked project are flagged so you don't expect Tracker progress." The current UI uses a "Stash Manager only" badge rather than a generic flag — update the copy to match the badge label.

### Group: Missing Cross-References

- [ ] [Priority: MED] Add cross-references between the "Confetti cleanup" help entry (when written) and the "Stitch score" entry — users who encounter the score need to know cleanup is the primary lever to improve it.
- [ ] [Priority: MED] Add a cross-reference from "Thread stash" to "Shopping list" (PrepareTab): explain that the stash data populated in the Manager is what drives the owned/needed status in the Creator's shopping list and palette chips.
- [ ] [Priority: MED] Add a cross-reference from "Sessions and timer" to the new Stats page help entry: explain that session data feeds the Stats page charts and that the stats page is the best place to review velocity trends.
- [ ] [Priority: LOW] Cross-reference "Palette Control" (generation) → "Thread stash" (Manager): explain that enabling "Use only stash threads" in the Creator automatically limits the palette to threads you own.
- [ ] [Priority: LOW] Cross-reference "Full-app backup" → "Saving" section: note that `.csbackup` also captures your stash, not just pattern projects.

---

## Coverage Summary

| Status | Count |
|---|---|
| FULL coverage | 17 |
| PARTIAL coverage | 13 |
| SHORTCUT only (no prose) | 17 |
| NONE | 27 |
| OUTDATED (inaccurate) | 4 |
| **Total features mapped** | **78** |

---

## Appendix: HELP_TOPICS Coverage by Topic Area

| Topic area | Sections | Assessment |
|---|---|---|
| Pattern Creator | 3 sections | Covers only generation basics and 4 tools; entire Materials hub, Sidebar, Project tab, views undocumented |
| Stitch Tracker | 2 sections | Covers basics; stitching style, session goals, highlight modes, side panel absent |
| Stash Manager | 2 sections | Covers basics; filters, partial gauge, pattern management absent |
| Saving and Backup | 2 sections | Mostly accurate; PDF detail and link-size caveat missing |
| Glossary | 2 sections | Good foundation; 6 important craft terms missing |
