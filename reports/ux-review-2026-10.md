# UX review: confusion and consistency (October 2026)

Reviewer brief: find places where stitchers are likely to get confused, and places where the app is inconsistent with itself or with stitching conventions. This is a review, not a redesign.

**What was reviewed**

| | |
|---|---|
| App name | stitchx (also shown as "stitch." and "stitch✕"; see UX-024) |
| Platforms | Client-side web app / PWA. One code base serves desktop browsers, tablets and phones (layouts switch at about 900 px) |
| What it does | Convert a picture to a chart, draw on a blank grid, import PDF/.oxs charts, edit, export a PDF (Pattern Keeper compatible), track stitching progress, manage a DMC/Anchor thread stash and a pattern library, view stats |
| Target users | Hobby stitchers from beginner to experienced; the Tracker is built as a replacement for a paper chart beside the hoop (tablet and phone first) |
| Access | Source code at v1.0.172, plus the live app served locally (`node serve.js`) and driven with Playwright/Chromium at 1366×900 (desktop, mouse), iPad Mini (touch, dark mode) and Pixel 5 (touch) |
| Test data | A synthetic 600×450 picture converted to 150×113 stitches, Threads (max) 40, which gave 38 threads and 71 chart symbols (46 blends) |
| Out of scope | Embroidery planner (`embroidery.html`), sync/WebDAV setup, backup internals |

Screenshots cited below are in [`reports/ux-review-2026-10/`](ux-review-2026-10/).

---

## 1. Summary

stitchx is unusually complete, and the code shows many past fixes for specific audits, for example a luminance gap so done stitches stand out in greyscale, Lock touches for a propped-up device, a confirmation before Regenerate clears progress, and friendly import errors. The problems that remain are mostly about the same thing meaning different things in different places.

The three most important problems:

1. **Charts with more than 43 symbols reuse symbols on screen** (UX-001). In the test pattern, "⊜" stood for four different threads and "♥" for three. In Symbol view a stitcher cannot tell which thread a cell needs. The PDF uses a different set of 112 glyphs (UX-002), so the printed chart and the on-screen chart also disagree with each other.
2. **One-tap whole-colour actions in the Tracker look like status badges** (UX-003). Every row in the colour list has a green "✓ Done" chip that marks every stitch of that colour as done. On a finished colour it becomes a red "Undo" chip that silently unmarks all of it. The word "Undo" is also the name of the step-undo button.
3. **The same key, word or mode means different things in the Creator and the Tracker** (UX-004, UX-008). F is Fill in the Creator. In the Tracker, F hides every full stitch, so the chart goes blank (verified), and a tooltip there says F is focus mode. "Paint" means change the pattern in the Creator and mark progress in the Tracker.

Patterns behind several findings:

- The Creator and the Tracker were designed separately and still use separate vocabularies: view names, mode names, ruler numbering, key layout, shortcut keys and how a thread code is written (UX-007, UX-008, UX-010, UX-014).
- One stitching concept often has four or five names in the UI: confetti, orphans, isolated stitches, stray stitches and single stitches (UX-012); and Export, Print PDF, Export PDF… and Materials > Export (UX-029).
- Large blend-heavy palettes (common when converting photos) push past what the symbol set, the key and the beginner copy were designed for (UX-001, UX-005, UX-013).

---

## 2. App map

### Pages and main surfaces

```
Home (home.html)                      default landing
├─ Tabs: Projects · Create new · Stash · Stats   (in-page tabs, not the app header tabs)
├─ Projects: active-project card [Resume tracking · Edit pattern · Export pattern · Update chart]
├─ Create new: Turn a photo into a pattern · Draw on a blank grid · Import a chart
├─ Stash: Stash at a glance (skeins, colours, patterns), Shopping list, Ready to start
└─ Stats: summary, links to Stats page

App header (all tool pages): logo · Create · Edit · Track · Stash · Stats · [Pattern ▾ on Creator]
   · project switcher chip · project/save chip · sync icon · command palette · shortcuts · Help · File ▾
File ▾: theme · New Project · Switch Project… · Preferences… · Open… · Download (.json) ·
   Open in Stitch Tracker · Export PDF… · Export Backup · Restore from Backup… ·
   Export Sync (.csync) · Import Sync (.csync)… · Review sync

Pattern Creator (create.html)          header tab "Create" while converting, "Edit" after Generate
├─ Sub-tabs: Convert · Edit · Materials           (phone: icon-only image / pencil / layers)
├─ Convert: Original image (Crop, Change) · Preview (split slider, Auto-sweep, Magnifier,
│   Show changes, Heatmap) · Compare options (Size / Threads / Brand) · Preview estimates ·
│   Confetti stitches · right panel: picture type, Size & fabric, Colours (DMC/Anchor,
│   Threads (max)), Background, Clean-up, Adjust image, Project · Generate Pattern (x2)
├─ Edit: toolbar (Paint · Fill · Erase · Zoom · Undo/Redo · More ▾) · colour strip ·
│   chart · right panel tabs Palette · Tools · View · Preview · Project
│   More ▾: Canvas, Tools (Navigate, Pick, Wand, Lasso, Move, Line, Rectangle, Ellipse,
│   Text, Mirror, Replace), Fix outline colours, Tidy stray stitches, Stitch type, Brush size
│   Action bar: Print PDF · Export… ▾ · Open in Tracker · difficulty pill · Pattern info ▾
└─ Materials ("Materials & Output"): Ready to stitch · Threads · Stash status · Export

Stitch Tracker (stitch.html)
├─ Left: colour list (sort Remaining / % done / DMC ID; per-row Done/Undo, Lines, P chips)
├─ Chart with rulers, centre lines, minimap, guide crosshair, hint banners
├─ Right rail: Colours · Mark · Nav · Fit · Area · Undo · More
├─ More ("Controls"): Keep screen on · Focus · [touch: Paint · Lock touches] ·
│   tabs Highlight · View · Session · Layers · Tools
├─ Phone: opens in focus mode (header hidden), bottom zoom bar, "Exit focus"
└─ Modals: Mark-all question, Work area picker, Session settings, Stitching style,
   Thread consumption history, Progress info

Stash Manager (manager.html)
├─ Thread Stash: search, filters (All/Owned/Low Stock/Remnants/Used Up, brand), Sort,
│   Bulk Add, alert panels (Thread Conflicts, Low Stock), thread grid, detail panel
└─ Pattern Library: filters, Your Projects, project cards, Up Next, Currently Tracking

Stats (index.html?mode=stats): Stitching · Stash · Showcase · Activity · Insights
Overlays everywhere: Help drawer (Help · Shortcuts · Getting Started), command palette,
   Preferences, welcome tours (Creator ×3 variants, Tracker, Manager), coachmarks, toasts
```

### Main journeys walked

1. **Photo to pattern:** Home > Create new > Turn a photo into a pattern > Convert (size, fabric, threads) > Generate > Edit > Materials (Ready to stitch) > Print PDF / Open in Tracker.
2. **Stitch a pattern:** Home > Resume tracking > select a colour > mark stitches (tap, drag, rectangle) > Highlight a colour > park > Undo > close.
3. **Plan threads:** Stash > see what is needed > Shopping list > Pattern Library.
4. **Return later:** Home > active project > Stats.

Each journey was walked as a beginner, as an experienced stitcher working on a large chart, and as a low-vision / colour-vision-deficient tablet user.

---

## 3. Findings

Sorted by severity, then journey. Confidence is High unless stated otherwise.

### Critical

#### UX-001: Symbols are reused when a chart has more than 43 symbols
- **Type:** Both · **Severity:** Critical · **Confidence:** High (reproduced in the app and in a unit-level check)
- **Location:** Creator after Generate, colour strip and Palette tab; Tracker Symbol view and colour list. Steps: convert any photo with Threads (max) high enough to produce more than 43 chart symbols (blends count separately).
- **Who:** all, most of all experienced stitchers on large charts
- **What happens:** `SYMS` in `dmc-data.js:75` has 43 glyphs. `buildPalette()` (`colour-utils.js:745-770`) assigns `SYMS[i % SYMS.length]`; once all 43 are claimed it keeps the wrapped symbol. The 38-thread / 71-symbol test pattern showed 28 shared symbols, for example:
  - "⊜" = 798+799, 166 Moss Grn MLt, 159+823 and 31+798
  - "♥" = 3838+804, 32+3888 and 581+973
  - "♧" = 336 Navy Blue and 799+804
  - "◁" = 912 Emerald Lt and 159+809
  Screenshot: [01-creator-edit-duplicate-symbols.png](ux-review-2026-10/01-creator-edit-duplicate-symbols.png); zoomed Symbol view: [04-tracker-symbol-view-lookalikes.png](ux-review-2026-10/04-tracker-symbol-view-lookalikes.png).
- **Why it's a problem:** A symbol chart's single job is a one-to-one symbol-to-thread mapping. With duplicates, a stitcher working from Symbol view (or a screenshot or print of it) stitches the wrong thread and only finds out much later. The Creator's success toast even reports "71 chart symbols", which implies 71 distinct symbols.
- **Recommendation:** Never reuse a symbol in one chart. Extend the on-screen set (the 112-glyph PDF font already exists; see UX-002), or block Generate or warn when the symbol count exceeds the set. Add a unit test asserting unique symbols for 112 entries.
- **Related:** UX-002, UX-005, UX-013

### High

#### UX-002: The printed PDF and the on-screen chart use different symbols for the same thread
- **Type:** Inconsistency · **Severity:** High · **Confidence:** High for the mechanism (code); a PDF was not rendered side by side
- **Location:** Print PDF / Export PDF vs Creator and Tracker Symbol views
- **Who:** experienced stitchers who print the chart and track in the app
- **What happens:** Screen symbols come from Unicode `SYMS` by usage rank. The PDF builds its own map from the 112-glyph `CrossStitchSymbols` font (`creator/symbolFontSpec.js`, `pdf-export-worker.js:186` `Layout.buildCodepointMap`). Nothing ties the two together.
- **Why it's a problem:** Stitchers often use a printed chart at the hoop and the Tracker for progress, or check a confusing cell on screen. "★ on paper, ◆ on screen" for the same thread breaks trust and invites errors.
- **Recommendation:** Use one symbol assignment for both. Render the screen chart with the same font and code points (it is already loaded on `create.html`), or store the PDF code point on each palette entry and draw that glyph on screen. Do not change the PDF worker without the Pattern Keeper regression check required by AGENTS.md.
- **Related:** UX-001

#### UX-003: Per-colour "Done" and "Undo" chips mark or unmark a whole colour in one tap
- **Type:** Both · **Severity:** High
- **Location:** Tracker colour list, every row (desktop left panel; phone/tablet Colours drawer). `tracker-app.js:8669-8676`
- **Who:** all; highest risk for one-handed touch use
- **What happens:** Each row ends in a small green "✓ Done" chip (styled like a success badge, about 16 px tall). Tapping it marks every stitch of that colour as done. A native `confirm()` appears only when more than 50 stitches remain; below that there is no confirmation. On a completed colour the chip turns red and reads "Undo"; tapping it unmarks every stitch of that colour with no confirmation (`markColourDone(cid,false)`). Step Undo can reverse it, but no toast with Undo appears. Screenshot: [02-tracker-colour-list-done-buttons.png](ux-review-2026-10/02-tracker-colour-list-done-buttons.png).
- **Why it's a problem:**
  - At 0% every row says "Done", which reads as a status, not an action.
  - "Undo" on a row looks like "undo my last mark", yet it wipes the colour's progress, possibly thousands of stitches over weeks.
  - The row itself is also a tap target (it selects the colour), so near-misses are likely on touch.
- **Recommendation:**
  - Rename the chips to "Mark all done" and "Mark all not done" (or move them into a row menu).
  - Always confirm with the stitch count, using the app's styled dialog rather than `confirm()`.
  - Show a toast with Undo after either action, as the drag-mark toast already does ("11 stitches marked · Undo 11 stitches").
  - Never use the bare word "Undo" for anything except step undo.
- **Related:** UX-031

#### UX-004: Single-key shortcuts mean different things in the Creator and the Tracker; F blanks the Tracker chart
- **Type:** Both · **Severity:** High · **Confidence:** High (F verified in the browser)
- **Location:** Keyboard shortcuts on `create.html` vs `stitch.html`; `help-drawer.js:555-631`; `tracker-app.js:2076-2091`, `:7413` and `:8986`
- **Who:** experienced keyboard users; anyone who presses F expecting Fill or Focus
- **What happens:**

  | Key | Creator | Tracker |
  |---|---|---|
  | F | Fill bucket | Hides the full-stitch layer **and** a second listener toggles focus mode; the More panel tooltip says "Enter focus mode (F)" |
  | H | Navigate/Draw toggle | Hides half stitches |
  | P | Paint brush | Pause session timer |
  | W | Magic wand | Work area picker |
  | R | Replace colour | Row mode |
  | T | Next stitch type | Mark mode |
  | Navigate | H | N |

  On the iPad, pressing F at a zoom where symbols show turned the whole chart blank, leaving only the grid, with no message: [05-tracker-after-pressing-F.png](ux-review-2026-10/05-tracker-after-pressing-F.png).
- **Why it's a problem:** People move between the two tools on the same project. A blank chart looks like lost data. Hidden layers persist and are easy to forget.
- **Recommendation:**
  - Give F one meaning in the Tracker and fix the tooltip to match.
  - Show a persistent chip such as "Full stitches hidden · Show" whenever any layer is hidden.
  - Align the shared verbs: Navigate on the same key in both tools; layer toggles on Shift+key so a bare key never hides content.
- **Related:** UX-008, UX-027

#### UX-005: Look-alike symbols, assigned without regard to colour similarity
- **Type:** Confusion · **Severity:** High
- **Location:** `SYMS` in `dmc-data.js:75`; Creator and Tracker Symbol and Colour + symbol views
- **Who:** low vision; experienced stitchers on large charts; anyone at tablet distance
- **What happens:** The set contains many near-identical pairs and families:
  - ◆ / ♦ / ⬥ / ⬧ / ⬩ (five filled diamonds or lozenges)
  - ◇ / ♢ / ⬦ / ⬨ (outline diamonds)
  - ⊙ ⊚ ⊛ ⊜ ⊝ (circles that differ by a tiny inner mark)
  - ⊕ / ⊗ and ⊞ / ⊠ (the same shape rotated)
  - ○ / ●, ☆ / ★, ◁ / ◄, ▷ / ►, △ / ▲, ♡ / ♥ (outline vs filled)

  Symbols follow frequency rank, so similar colours can get near-identical symbols. In the test chart, 912 Emerald Lt (◁) and 911 Emerald Med (◄) are adjacent greens with the outline and filled versions of the same triangle. In the zoomed tablet view (screenshot 04), ◆ and ♦ cells are hard to tell apart at normal reading distance.
- **Why it's a problem:** Paper-chart convention is that similar colours get clearly different symbols. Outline-vs-filled distinctions disappear for low-vision users and at small cell sizes.
- **Recommendation:**
  - Remove near-duplicates from the screen set; reuse the PDF font's families, which were designed for distinctness.
  - When assigning, keep the closest colour pairs (ΔE) out of the same shape family.
  - If look-alike pairs still exist, show a warning in Ready to stitch.
- **Related:** UX-001, UX-002

#### UX-006: Editing a pattern in the Creator keeps "done" marks on cells whose colour changed
- **Type:** Confusion · **Severity:** High · **Confidence:** Medium (code reading; not reproduced end to end)
- **Location:** Creator Edit (Paint, Fill, Replace colour, Erase) on a project that already has progress
- **Who:** all, especially experienced stitchers who fix a chart mid-project
- **What happens:**
  - Regenerate is guarded ("Regenerate will clear your progress", `creator/useCreatorState.js:1901`), but cell edits do not touch `done` (no `done` handling in `creator/useCanvasInteraction.js`).
  - The Creator canvas has no indication of which cells are already stitched.
  - The Regenerate warning tells users to back up via "Project › Backup", which does not exist; the real path is File > Export Backup.
- **Why it's a problem:**
  - A cell repainted from 310 to 321 would still count as done, now as a 321 stitch, so per-colour counts and stash deductions drift.
  - The user has no way to see that they are editing stitched areas.
- **Recommendation:**
  - In Edit, show a subtle "stitched" overlay toggle and a banner ("This project is 34% stitched. Changing stitched cells resets them to not done.").
  - Reset `done` for cells whose colour changes, and say so in a toast.
  - Correct the menu path in the Regenerate warning.
- **Related:** UX-008

#### UX-007: The chart display modes have different names, options and behaviour in each tool
- **Type:** Inconsistency · **Severity:** High
- **Location:**
  - Creator: Edit > View tab, "VIEW / VIEW: Colour · Symbol · Both" (`creator/Sidebar.js:1488`); V cycles colour / symbol / both
  - Tracker: More > Highlight, "Chart view: Symbol · Colour + symbol · Highlight"; V cycles symbol / colour / highlight
- **Who:** all
- **What happens:**
  - The same idea is called "Both" in one tool and "Colour + symbol" in the other; Colour-only exists only in the Creator; Highlight exists only in the Tracker.
  - In the Tracker, "Symbol" view at fit zoom shows faded colour blocks with no symbols, plus a banner "To see symbols, you may need to zoom in." (screenshots 02 and 07).
  - The Creator's View tab shows the label "VIEW" twice ([10-creator-view-tab.png](ux-review-2026-10/10-creator-view-tab.png)).
- **Why it's a problem:** Stitchers learn one vocabulary and expect it everywhere. A mode called "Symbol" that shows colour at the default zoom contradicts its name.
- **Recommendation:**
  - Use one set of names in both tools: "Symbols", "Colours", "Colours + symbols", and Highlight in the Tracker.
  - Use the same V cycle order in both tools.
  - In the Tracker, rename the low-zoom state honestly (for example "Overview: zoom in for symbols") or default to a zoom where symbols render.
  - Remove the duplicate heading.
- **Related:** UX-008, UX-010

#### UX-008: "Paint", "Draw", "Mark", "Modify" and "Nav" mix up editing the pattern and recording progress
- **Type:** Both · **Severity:** High
- **Location:**
  - Creator: toolbar "Paint · Fill · Erase" plus a green "• Paint" status pill; Tools tab "Chart mode: Navigate | Draw"; shortcut help "Switch between Navigate and Draw"
  - Tracker: rail "MARK · NAV"; Tools "Stitch mode: Mark | Navigate"; on touch, More > "Paint" chip ("one finger paints a run of stitches"), which relabels the Mark button to "Paint" (`tracker-app.js:8952`)
- **Who:** beginners; anyone who uses both tools
- **What happens:**
  - "Paint" changes the pattern in the Creator but marks progress in the Tracker.
  - "Draw" and "Paint" are both used for the Creator's editing mode.
  - "Nav" and "Navigate" are both used.
  - Dead code still carries "Modify" and an edit-mode strip ("grid taps modify the pattern") that can never show, because `setIsEditMode(true)` is never called.
- **Why it's a problem:** The most serious risk in a stitch app is confusing "change the chart" with "record what I stitched". Sharing the word Paint across the two removes the verbal guardrail the app otherwise has.
- **Recommendation:**
  - Reserve Draw and Paint for pattern editing.
  - Call the Tracker's touch option "Drag to mark" and never relabel Mark.
  - Spell out "Navigate" (the rail has room on tablets; use an icon with an accessible name on phones).
  - Delete the unreachable Tracker edit-mode UI.
- **Related:** UX-004, UX-009

#### UX-011: "Thread Conflicts" alarms appear for a single pattern and contradict the Shopping list
- **Type:** Both · **Severity:** High
- **Location:** Stash > Thread Stash, top panel; Home > Stash tab. `stash-bridge.js` `detectConflicts()`; `manager-app.js:1166`
- **Who:** beginners and anyone with an empty stash
- **What happens:**
  - After creating one pattern with an empty stash, the Manager opens with a large red panel "Thread Conflicts (38). These threads are needed by multiple patterns but you don't have enough." Each row reads "own 0, need 2 synthetic".
  - The code flags any shortfall, even when only one pattern needs the thread.
  - At the same time, Home > Stash says "Shopping list: Nothing on your shopping list."
  - Screenshot: [06-manager-thread-conflicts.png](ux-review-2026-10/06-manager-thread-conflicts.png).
- **Why it's a problem:** The panel claims something false ("multiple patterns") in alarm styling on the first visit, while another screen says there is nothing to buy.
- **Recommendation:**
  - Show "Conflicts" only when two or more active patterns compete for the same thread.
  - Otherwise show a neutral "To buy for synthetic (38 threads)" with an "Add to shopping list" action.
  - Make the Home Shopping list and this panel draw from the same data.
- **Related:** UX-021

#### UX-013: Blends dominate converted palettes but are never explained, and are labelled inconsistently
- **Type:** Both · **Severity:** High
- **Location:** Convert result toast; Creator Palette tab; Tracker colour list; Pattern info
- **Who:** beginners; experienced stitchers buying threads
- **What happens:**
  - The test conversion gave 71 symbols, 46 of them blends.
  - The Creator Palette lists blends as "341+826" with no names and no brand, while solids show "987 Forest Gr…". The colour chip reads "341+826 · 341+826" and the highlight chip "DMC 341+826 341+826".
  - The Tracker shows "159+809 Blue Gray Lt+Delft Blue".
  - No screen says how to stitch a blend (normally one strand of each thread in the needle). The only explanation is an inline hint ("A blend uses two of these threads in one stitch"). The code assumes one strand each (`useCreatorState.js:99`), but the UI never says it.
- **Why it's a problem:** A beginner sees "341+826" and does not know it means "thread two different colours together". Duplicated codes look like a bug.
- **Recommendation:**
  - Label blends everywhere as "DMC 341 + 826 (blend: 1 strand of each)".
  - Show both names, truncated together.
  - Add a one-line "What's a blend?" link in the key.
  - Make blend use an explicit Convert option ("Allow blends: on"), described in plain words, rather than a silent default.
- **Related:** UX-001, UX-014

### Medium

#### UX-009: The Creator's default tool after Generate differs by device; desktop starts in Paint
- **Type:** Inconsistency · **Severity:** Medium
- **Location:** Creator, first view after Generate
- **What happens:** On desktop the Edit tab opens with Paint active and the top colour selected; the status bar reads "Cross stitch — paint mode." One stray click on the chart changes the pattern. On phone and tablet it opens in Navigate (hand highlighted).
- **Why it's a problem:** A user who just wants to look at the result edits it by accident. Undo exists, but they may not notice the change.
- **Recommendation:** Open in Navigate everywhere until the user picks a tool or a colour.
- **Related:** UX-008

#### UX-010: Ruler numbering differs between the Creator and the Tracker, and Creator ruler labels are low contrast
- **Type:** Inconsistency · **Severity:** Medium
- **Location:** Creator chart rulers (`creator/canvasRenderer.js:290-296`) vs Tracker rulers
- **What happens:**
  - The Creator labels 1, 11, 21, 31… (the first cell after each heavy line).
  - The Tracker labels 10, 20, 30… on the heavy line, and every column (with 5s and 10s bold) when zoomed in.
  - Creator labels are `#A89E89` on white (2.65:1) at 7–11 px.
- **Why it's a problem:** Paper charts and most apps number the 10-lines (10, 20, 30). "Row 21" means different things depending on which tool you read it in, which matters when cross-checking a mistake.
- **Recommendation:** Use the Tracker's convention in both tools, and raise the Creator ruler to `--text-tertiary` (at least 4.5:1).

#### UX-012: One concept, five names: confetti, orphans, isolated, stray and single stitches
- **Type:** Both · **Severity:** Medium
- **Location:**
  - Convert: "CONFETTI STITCHES · High confetti · Very tedious — strongly consider removing orphans · 1,426 after cleanup"; Compare options cards "Confetti: Good / Excellent"
  - Ready to stitch: "1426 isolated full crosses"
  - Edit > More: "Tidy stray stitches"
  - Convert Advanced: "Fewer single stitches in blends"
  - Pattern info: "Confetti density"
- **Who:** beginners
- **Why it's a problem:** "Confetti" is real stitcher jargon but is never defined where it first appears. "Orphans" appears only once. A beginner cannot tell that these all describe the same thing, or whether "Tidy stray stitches" fixes the "High confetti" warning.
- **Recommendation:** Pick one user-facing term ("confetti stitches"), define it the first time it appears ("single stitches of a colour on their own; slow to stitch"), and name the tool after it ("Reduce confetti"). Add the term to `TERMINOLOGY.md` and the terminology lint.

#### UX-014: Thread codes and key contents are formatted differently on every surface
- **Type:** Inconsistency · **Severity:** Medium
- **Location / what happens:**

  | Surface | Format seen |
  |---|---|
  | Creator Palette row | "3799  Pewter…" (no brand, name truncated) |
  | Creator colour chip | "3799 · Pewter VDk" |
  | Creator highlight chip | "DMC 3799  Pewter VDk" |
  | Tracker colour list | "05  Light Driftwood"; sort button "DMC ID" |
  | Tracker active tile | "DMC 799 / Delft Blue Med" |
  | Tracker status bar | "DMC 336+799 Navy Blue+Delft Blue Med" |
  | Manager | "DMC 05  Light Driftwood" / grid "05 Light Driftwood" |

  Neither key shows strand count or per-colour skeins; the Tracker shows only stitch counts. Creator names are truncated at about 8 characters even on a 1366 px screen.
- **Why it's a problem:** `TERMINOLOGY.md` already says to label a thread with brand and number. Experienced stitchers need symbol, swatch, brand + code, name, strands and skeins in one place, as on the paper key.
- **Recommendation:**
  - Use one formatter (`threadLabel`) everywhere: "DMC 3799 Pewter Very Dark".
  - Let names wrap instead of truncating.
  - Add Strands and Skeins columns to both keys (the PDF key could be the reference).
  - Rename the "DMC ID" sort to "Number".

#### UX-015: Two overlapping navigation systems, with "Edit" used twice
- **Type:** Inconsistency · **Severity:** Medium
- **Location:** App header (Create · Edit · Track · Stash · Stats) and Creator sub-tabs (Convert · Edit · Materials); Home tabs (Projects · Create new · Stash · Stats)
- **What happens:**
  - On `create.html` the header highlights "Create" while converting and "Edit" after Generate, while the sub-tab bar also shows "Edit".
  - Materials keeps the header on "Edit" but switches the dropdown to "Materials & Output".
  - Home has no Create/Edit/Track tabs, and its "Stash" tab is a summary, while the header's "Stash" opens the Manager.
  - Stats has a "Back to grid" button with no "grid" in sight.
- **Why it's a problem:** Users cannot build a stable mental model of where they are. "Edit" in the header and "Edit" in the sub-tab bar do different things on the same screen.
- **Recommendation:** Keep the header for tools only (Home · Creator · Tracker · Stash · Stats), keep Convert / Edit / Materials as the only sub-navigation, use the same header on Home, and rename "Back to grid" to "Back to projects".

#### UX-016: Highlight "counting aids" use the app's accent colour and clutter the chart by default
- **Type:** Confusion · **Severity:** Medium
- **Location:** Tracker, right-click a colour (Highlight > Isolate, Counting aids on by default)
- **What happens:** Run-length badges and isolated-stitch sparkles are drawn in terracotta (the UI accent). At fit zoom they overlap into unreadable stacks along diagonals. The hint banner is clipped on the left ("ounting aids, [ ] to cycle colours"). Screenshot: [03-tracker-highlight-counting-aids.png](ux-review-2026-10/03-tracker-highlight-counting-aids.png).
- **Why it's a problem:** On a pattern full of reds and oranges the markers look like stitches. For low-vision users the overlapping badges are noise.
- **Recommendation:** Draw counting aids in a neutral high-contrast style (dark outline, white fill), hide them below a minimum cell size, default them off for new users, and fix the banner clipping.

#### UX-017: Dark mode hides the active header tab; the tablet header overflows
- **Type:** Inconsistency · **Severity:** Medium · **Confidence:** High (observed on iPad Mini, dark)
- **Location:** App header in dark theme
- **What happens:** All five section tabs are drawn in the accent colour, so the active one ("Track") cannot be picked out. At 768 px the File button is cut off at the right edge, and the progress chip renders as an empty orange capsule. Screenshot: [09-tablet-dark-nav.png](ux-review-2026-10/09-tablet-dark-nav.png).
- **Recommendation:** In dark mode, use `--text-secondary` for inactive tabs plus an underline for the active one, as in light mode. Collapse the project chips into one at tablet widths.

#### UX-018: Toasts and tours cover the chart on phones while marking
- **Type:** Confusion · **Severity:** Medium
- **Location:** Tracker on Pixel 5, first session
- **What happens:**
  - After the first taps, two toasts stack over about 40% of the chart: "Keeping the screen on while you stitch. Turn off" and "Sessions are tracked automatically… Open". They wrap to 10+ lines in a narrow column ([07-phone-tracker-toasts.png](ux-review-2026-10/07-phone-tracker-toasts.png)).
  - The "Mark your first stitch" coachmark also sits over the chart, and the right rail covers the last columns.
- **Why it's a problem:** The stitcher's place on the chart is hidden at the moment they are learning to mark.
- **Recommendation:** On phones, queue first-run notices into the More panel or a single bottom banner, give toasts the full width, and auto-dismiss informational ones.

#### UX-019: Progress numbers disagree between screens
- **Type:** Inconsistency · **Severity:** Medium · **Confidence:** Medium (Stats probably catches up when the session ends)
- **What happens:**
  - With 16 stitches marked, the Tracker shows "0.1% · 16,934 to go".
  - Stats > All projects shows "Total stitches 0 across 1 project", "Lifetime 0" and "16,934 left" on the same page.
  - The Pattern Library card shows "0.1% stitched", "0.1%" and a bar (three times), plus "Est. remaining ≈28 days", while the Creator says "Time @ 40/hr 423 hrs 45 min".
- **Recommendation:** Count stitches from marks, not from finished sessions (or label the figure "Stitches in finished sessions"). Show progress once per card. Use the same time estimate unit everywhere, or show both ("≈424 hours, about 28 days at your pace").

#### UX-020: Phone Creator controls are icon-only, and the Fill icon is ambiguous
- **Type:** Confusion · **Severity:** Medium
- **Location:** Creator on phone: top switcher (image / pencil / layers = Convert / Edit / Materials) and bottom tool bar (hand, pencil, brush, bucket, eraser, swatch, undo, more)
- **What happens:** No visible labels. The fill bucket renders like a jar. The status hint under the canvas is cut off ("Dra… for…"). Screenshot: [11-phone-creator-icon-only.png](ux-review-2026-10/11-phone-creator-icon-only.png).
- **Recommendation:** Add short labels under the tool icons (the Tracker rail already does this). Label the Convert / Edit / Materials switcher. Let the hint text wrap.

#### UX-021: Stash summary says "0 Colours" while the rest of the app says "threads"
- **Type:** Inconsistency · **Severity:** Medium
- **Location:** Home > Stash: "0 SKEINS · 0 COLOURS · 1 PATTERN"
- **Why it's a problem:** `TERMINOLOGY.md` bans "N colours" for thread counts. Here it sits next to "skeins", so "colours" reads as a different unit.
- **Recommendation:** Use "threads". Add a lint rule covering `home-app.js`.

#### UX-022: The Help drawer is not context-aware
- **Type:** Inconsistency · **Severity:** Medium
- **Location:** Press ? in the Tracker
- **What happens:** The Shortcuts tab opens with "Pattern Creator" shortcuts first ("1 Cross stitch (or, in highlight view, Isolate)"). Tracker keys are further down. Screenshot: [12-tracker-help-shows-creator-keys.png](ux-review-2026-10/12-tracker-help-shows-creator-keys.png).
- **Recommendation:** Open on the current tool's section and show the other tools collapsed.

### Low

#### UX-023: Two buttons render with browser-default styling
- **Location:** Creator Edit "Ready to stitch review" banner button (`creator/PatternTab.js:160`); Tracker More > Tools "Thread consumption history" (`tracker-app.js:9233`)
- **Recommendation:** Apply the standard secondary button class.

#### UX-024: The app name differs across pages
- **What happens:** Page titles: "stitch. — Home", "Create a Pattern — stitchx", "Stitch Tracker", "stitchx Manager", "stitchx"; logo "stitch✕".
- **Recommendation:** Use "stitchx — {Page}" everywhere.

#### UX-025: Number and plural formatting slips
- **What happens:**
  - "1 patterns" (`manager-app.js:1408`)
  - "16950 full-cross cells" and "Full Cross (16950)" next to "16,950" elsewhere
  - The Generate toast ends "…(46 are blends of two threads))." with two closing brackets (`useCreatorState.js:1797`)
  - Pattern Library: "0 fully kitted" (jargon)
- **Recommendation:** Use `toLocaleString` everywhere and a plural helper. Restructure the toast sentence. Write "0 ready to start" instead of "fully kitted".

#### UX-026: Stitch-type labels change case and abbreviation between panels
- **What happens:**
  - Edit > More: "Cross · ¼ St · Half / · Half \ · ¾ St · Backstitch · French knot"
  - Tools tab: "¼ Stitch", "¾ Stitch"
  - Tracker Layers: "Full Cross", "Half Stitch", "Quarter", "French Knot", "Long Stitch"
  - "Petite and long stitches (0)" uses a browser disclosure triangle and a larger font than its neighbours
  - Tools help: "1–4 for Cross / Half / / Half \ / Backstitch" (slashes collide)
- **Recommendation:** Use one sentence-case list ("Full cross, Half cross (/), Half cross (\), Quarter, Three-quarter, Backstitch, French knot") in every panel.

#### UX-027: "Open in Tracker" asks to name an already-named pattern, with PDF wording
- **Location:** Creator > Open in Tracker (desktop) when the name came from the file name
- **What happens:** The "Name this pattern — It will appear on the PDF and in your library" dialog (`creator-main.js:1161`) appears while the header already shows "synthetic · All changes saved". Screenshot: [08-name-modal-on-open-in-tracker.png](ux-review-2026-10/08-name-modal-on-open-in-tracker.png).
- **Recommendation:** Ask once, at first save. Do not ask again on navigation. Use wording that fits the action.

#### UX-028: Home's empty state contradicts itself
- **What happens:** On first run: "No projects yet — create one to get started." followed by a card "NO ACTIVE PROJECT · Pick a project below, or start something new." There is nothing below. The header shows an avatar-style chip "NP No project", which looks like a signed-out user.
- **Recommendation:** Hide the active-project card when there are no projects and show the three Create new cards on Projects. Drop the initials avatar for "No project".

#### UX-029: Many names for the same actions
- **What happens:**
  - Exporting: "Print PDF", "Export… ▾", File > "Export PDF…", Materials > "Export", Library "Export pattern"
  - Moving to the Tracker: "Open in Tracker", File > "Open in Stitch Tracker", "Track", "Resume tracking", "Continue →", "Go to Tracker"
  - Home "Update chart" is ambiguous (it imports a designer's revised chart)
- **Recommendation:** Pick one label per action ("Print PDF…", "Export…", "Open in Tracker"). Rename "Update chart" to "Import updated chart…". Remove "→" from labels; the house rule forbids it ("Continue →", "View detailed stats across all projects →").

#### UX-030: "Tap" instructions shown on mouse devices
- **Location:** Tracker desktop: footer "Tap any stitch on the canvas to mark it as done", palette "Tap a colour below to select it". The top banner on the same screen says "Click…".
- **Recommendation:** Use the device-aware wording the Creator tours already have (`creatorDeviceWords`).

#### UX-031: Confirmation styles are inconsistent
- **What happens:** The Tracker uses native `confirm()` for "Mark all N stitches…" (`tracker-app.js:8673`) and "Remove stitch at Row…" (`:9772`). Elsewhere the app uses its styled `ConfirmDialog`. "Clear all" park markers has no confirmation and no undo toast.
- **Recommendation:** Use `ConfirmDialog` throughout and add an undo toast for Clear all.

#### UX-032: Fabric count lives in three places; the Convert control is clipped
- **What happens:** Fabric count appears in Convert > Size & fabric, Edit > Project > Fabric, and Materials > Ready to stitch. At 1366×900 the Convert "FABRIC COUNT" select is cut off at the bottom of its card on first view.
- **Recommendation:** Keep one editable control (Project) and show read-only values with an "Edit" link elsewhere. Fix the card overflow.

#### UX-033: The appearance of a done stitch is not explained, and light threads turn grey when done
- **Confidence:** Medium
- **What happens:** Done cells are drawn in the thread colour, capped at mid-grey luminance; not-done cells are lightened (`colour-utils.js` `doneStitchLook` / `pendingStitchLook`). That gives a good greyscale gap, but a done white or ecru stitch shows as grey, which can read as a grey thread. No legend says "darker = stitched".
- **Recommendation:** Add a two-swatch legend ("To stitch / Stitched") to the progress strip, and offer "Corner tick" (which already exists under More > View) during onboarding for users who find fills ambiguous.

### What works well (context for the recommendations)

- Import errors are specific and actionable ("This PDF couldn't be read. It may be damaged or password-protected.", "In that program, export the chart as OXS or PDF and import that file.").
- Pattern editing is impossible from the Tracker; the Creator guards Regenerate when progress exists.
- Lock touches, keyboard marking and a guide crosshair, Keep screen on, reduced-motion handling in tours, and the done/not-done luminance gap all serve the low-vision and propped-tablet scenarios well.
- The Generate toast and Palette header already follow the "N threads · M symbols" rule from `TERMINOLOGY.md`.

---

## 4. Terminology table

| Concept | Variants found (where) | Recommended |
|---|---|---|
| App name | stitchx, stitch., stitch✕, Stitch Tracker, Embroidery Pattern Planner (page titles, logo) | **stitchx** |
| Display mode: colour + symbol | Both (Creator View), Colour + symbol (Tracker), "colour / symbol / both" (help) | **Colours + symbols** |
| Display mode: symbol only | Symbol (both tools; Tracker shows colour blocks at low zoom) | **Symbols** |
| Pattern-editing mode | Draw (Tools tab, help), Paint (toolbar, status pill), Modify (dead code) | **Draw** (with Paint, Fill, Erase as tools) |
| Progress mode | Mark, MARK, Paint (Tracker touch option relabels Mark) | **Mark** |
| Pan mode | Navigate, Nav, NAV, hand | **Navigate** |
| Isolated single stitches | confetti, High confetti, orphans, isolated full crosses, stray stitches, single stitches, Confetti density | **confetti stitches** (defined once) |
| Thread label | 3799, DMC 3799, 3799 · Pewter VDk, DMC ID, "05" | **DMC 3799 Pewter Very Dark** |
| Blend label | 341+826, 341+826 · 341+826, DMC 341+826 341+826, 159+809 Blue Gray Lt+Delft Blue | **DMC 341 + 826 (blend)** |
| Thread count | threads, colours ("0 COLOURS", "Simplify colours…", "Add colour", "Colours" section, "COLOURS" rail) | **threads** for counts; "Colours" acceptable as a section name only |
| Key | Palette (Creator tab), Colours (Tracker rail), colour list, Colour palette (aria), legend (PDF/help) | **Key** in user copy, matching paper charts; or **Colours** consistently |
| Stitch types | Cross / Full Cross; ¼ St / ¼ Stitch / Quarter; Half / / Half Stitch; French knot / French Knot | **Full cross, Quarter, Half cross (/), French knot** |
| Fabric count | 16 count, 16ct, 16-count, Skeins (16ct) | **16-count** |
| Export | Print PDF, Export PDF…, Export…, Export pattern, Materials > Export | **Print PDF…** / **Export…** |
| Go to Tracker | Open in Tracker, Open in Stitch Tracker, Track, Resume tracking, Continue, Go to Tracker | **Open in Tracker** (actions), **Track** (header) |
| Ruler origin | 1, 11, 21 (Creator) vs 10, 20, 30 (Tracker) | **10, 20, 30** |
| Need-to-buy threads | Thread Conflicts, Low Stock — Needed, Shopping list, To buy, Stash not checked | **To buy** (single list), **Conflicts** only across 2+ patterns |
| Ready / fully kitted | Ready to start, fully kitted, Ready to stitch (a different feature) | **Ready to start**; keep "Ready to stitch" for the review |
| Session time | Classic (timing mode chip), Time (estimated), Start timer | Rename "Classic" to a descriptive label ("Estimated from stitches") |

---

## 5. Quick wins

1. Make the Tracker's F key do one thing, and show a "Full stitches hidden · Show" chip whenever a layer is hidden (UX-004).
2. Rename the per-colour chips to "Mark all done" / "Mark all not done" and always confirm with a count (UX-003).
3. Fix the Thread Conflicts copy and condition, so it shows only for 2+ patterns (UX-011).
4. Number the Creator ruler 10, 20, 30 like the Tracker, using `--text-tertiary` (UX-010).
5. Rename Creator View options to "Colours · Symbols · Colours + symbols" and remove the duplicate "VIEW" heading (UX-007).
6. Correct "Project › Backup" to "File > Export Backup" in the Regenerate warning (UX-006).
7. Fix "1 patterns", the "))" toast, and missing thousands separators (UX-025).
8. Style "Ready to stitch review" and "Thread consumption history" as normal buttons (UX-023).
9. Use device-aware "Click/Tap" wording in the Tracker footer and palette hint (UX-030).
10. Make inactive header tabs neutral in dark mode (UX-017).

---

## 6. Open questions

- **Symbol uniqueness intent (UX-001, UX-002):** Was the 43-glyph Unicode set ever meant to cover palettes above 43? Should the screen use the PDF symbol font? Any change to the PDF side needs the Pattern Keeper regression check.
- **Editing stitched cells (UX-006):** Should a colour change on a stitched cell reset it, keep it done, or ask? This needs a product decision, and the real behaviour should be confirmed with an end-to-end test.
- **Blends by default (UX-013):** Converting a photo produced 46 blends from 38 threads. Is that the intended default for photos? Many stitchers avoid blends.
- **Stats lag (UX-019):** Is "Total stitches 0" until a session ends intended?
- **Not covered or not verified:**
  - Screen-reader pass (only aria-labels were read in code)
  - Colour-vision-deficiency simulation of the chart and key (not run; symbol findings stand regardless)
  - 200% text scaling
  - The PDF import review flow
  - Rendering a PDF and comparing it with the screen symbols
  - Sync, backup and the embroidery planner
  - Landscape phone
  - WebKit/iPad Safari (Chromium device emulation only)
