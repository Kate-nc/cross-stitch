# UX Copy Audit — Content Consistency & Tone
**Audited:** May 2026  
**Standard:** British English, sentence case for UI labels, conversational but consistent voice.

---

## Executive Summary

The app has a warm, crafting-focused voice that works well in long-form help text and empty states, but **three systemic problems undermine consistency**: (1) the terms "project", "pattern", and "colour" are used interchangeably in contexts where the Glossary draws explicit distinctions between them; (2) several American spellings ("color", "color code") appear in user-visible strings, most critically in `manager-app.js`; (3) capitalisation is inconsistent — title case and sentence case alternate within the same component, most visibly in the MaterialsHub sub-tabs and the Creator landing cards. Beyond terminology, five error messages expose raw JavaScript `.message` strings to users with no recovery guidance. Priority fixes are achievable in a single pass over three files.

---

## Terminology Conflicts

| Concept | Variants found | Recommended canonical term | Notes |
|---|---|---|---|
| A DMC/Anchor thread | "thread", "colour", "floss" | **thread** (noun); **colour** only for the visual hue | "floss" appears in internal comments only — acceptable there |
| The DMC colour palette | "colours", "DMC colours", "palette" | **palette** for the set; **colour** for a single entry | Avoid "DMC colours" as a count — use "palette colours" |
| Image → stitches conversion | "generate", "create", "convert", "match" | **generate** (verb); result is **a pattern** | `create.html` says "Create New Pattern" but the Glossary says "generate" |
| The working artefact in IDB | "project", "pattern", "file" | **project** when it includes progress; **pattern** for the chart only | Most confusion in ExportTab, home-app.js, and creator-main.js welcome screen |
| How many threads needed | "skeins needed", "skeins to buy", "need to buy" | **skeins to buy** | PrepareTab badge says "Need to buy"; shopping list copy says "need X skeins" |
| The user's physical thread collection | "stash", "thread stash", "thread collection", "inventory" | **stash** (no modifier) | help-drawer uses "thread stash" once; rest of the app just says "stash" |
| Removing lone single stitches | "confetti cleanup", "stray stitches", "isolated stitches", "orphans" (internal) | **isolated stitches** in user-facing copy | "confetti cleanup" is internal jargon that leaks into PatternTab warning |
| Shade/hue picker input | "colour" (correct), "color" (American, incorrect) | **colour** | `manager-app.js:1619` and `:1798` use American "color" |

---

## Worst Offenders — Before → After

### 1. American "color" in user-facing alert (`manager-app.js:1619`)
```
BEFORE: alert("Invalid blend color.")
AFTER:  Toast.show({ message: 'Enter a valid colour code for both threads in the blend.', type: 'error' });
```
Two problems: uses `alert()` instead of Toast, and uses American spelling. The message also gives no guidance on what format is valid.

### 2. American "color code" in placeholder (`manager-app.js:1798`)
```
BEFORE: placeholder="Second color code..."
AFTER:  placeholder="Second colour code…"
```

### 3. Raw error exposed in backup failure (`manager-app.js:601`)
```
BEFORE: setBackupStatus({ type: "error", message: "Backup failed: " + e.message });
AFTER:  setBackupStatus({ type: "error", message: "Backup failed. Check your storage space and try again." });
```

### 4. Raw error exposed in home import (`home-app.js:486`)
```
BEFORE: window.Toast.show({ message: 'Could not import: ' + (err && err.message || err), type: 'error', duration: 10000 });
AFTER:  window.Toast.show({ message: 'Could not import this file. Make sure it is a supported format (JSON, OXS, PDF) and try again.', type: 'error', duration: 10000 });
```

### 5. "confetti cleanup" jargon in user-facing warning (`creator/PatternTab.js:120`)
```
BEFORE: "Cleanup removed X stitches (Y% of pattern). You may want to regenerate with a lower confetti cleanup level."
AFTER:  "Cleanup removed X stitches (Y% of pattern). Try reducing the isolated-stitch removal level and regenerating."
```

### 6. Capitalisation: "Create New Pattern" with mismatched sub-label (`creator-main.js:905`)
```
BEFORE: heading "Create New Pattern",  sub-label "Upload an image, PDF, or pattern file"
AFTER:  heading "Create new pattern",  sub-label "Upload an image, PDF, or pattern file"
```

### 7. Ambiguous restore confirmation — no irreversibility warning (`manager-app.js:620`)
```
BEFORE: `Restore backup from ${date}? This will replace all current data.`
AFTER:  `Restore backup from ${date}? This will permanently replace all current data and cannot be undone.`
```

### 8. Non-actionable empty state (`manager-app.js:1040`)
```
BEFORE: "No threads found."
AFTER:  "No threads match your search. Try a different number or name, or clear the filter."
```

### 9. MaterialsHub sub-tab capitalisation inconsistency (`creator/MaterialsHub.js`)
```
BEFORE: "Threads" / "Stash status" / "Output"   (mixed: title / sentence / title)
AFTER:  "Threads" / "Stash"         / "Output"   (all title case — proper tab names)
```
"Stash status" is also redundant since every tab in the hub relates to stash/materials.

### 10. "Yes, Restore" button capitalisation (`manager-app.js:798`)
```
BEFORE: "Yes, Restore"
AFTER:  "Yes, restore"
```

---

## Per-File Audit Summary

### `help-drawer.js`
**Voice/tone:** Excellent — informative, friendly, well-structured. British spelling throughout.  
**Issues:**
- Saving topic bullet "Loadable in either Creator or Tracker" is a sentence fragment. Rewrite: "Opens in either the Creator or Tracker."
- SHORTCUTS table: `"Cross stitch tool (or switch highlight view to Isolate)"` — mixes two unrelated functions under a single description; users in Highlight view will be confused.

### `creator-main.js`
**Issues:**
- Line 901: welcome copy is good ✓.
- Line 905: "Create New Pattern" uses title case inconsistent with adjacent sentence-case sub-label (§#6 above).
- Line 946: stash preview warning uses "unconstrained" (technical). Rewrite: *"No threads marked as owned — the preview uses the full DMC palette. Add threads in the Stash Manager to limit it to your stash."*
- ErrorBoundary: renders raw stack trace on-screen. The heading `'CreatorApp Error: '` is developer-facing; soften to *"Something went wrong in the pattern editor."* for users who see this.

### `creator/useCreatorState.js`
No user-facing strings. No issues.

### `creator/ImportWizard.js`
**Voice/tone:** Good — sentence case, no emoji, British spelling.  
**Issues:**
- Skein estimate `"Estimate: ~N skein(s), ~X"` reads awkwardly as a single line; consider splitting into two sentences.
- Step 5 label "Confirm" is ambiguous — "Generate" or "Finish" better signals what happens next.

### `creator/ExportTab.js`
**Issues:**
- `setError("Pick at least one chart mode (B&W or Colour).")` — good ✓, but expand "B&W" to "black and white" on first use in any message.
- `setError("Bundle export unavailable — JSZip failed to load.")` — exposes library name to users. Rewrite: *"Download bundle is unavailable. Try refreshing the page."*
- `setError("Nothing to export yet — create or open a pattern first.")` — good ✓.
- `"Preparing bundle…"` — good use of ellipsis ✓.

### `creator/PrepareTab.js`
**Issues:** All badge labels, summary text, and action copy are consistent and clear ✓. No significant issues.

### `creator/PatternTab.js`
**Issues:**
- Line 95: "Add colours using the Colours panel on the right…" — capitalises "Colours" as a proper-noun panel name; check this matches the heading used in Sidebar.js.
- Line 120: "confetti cleanup" jargon (§#5 above).
- Line 147 tooltip: "counting fatigue" is acceptable domain vocabulary in a tooltip ✓.
- Internal state names `selectedColorId`, `tintColor` use American "color" — acceptable for JS identifiers not exposed to users.

### `creator/MaterialsHub.js`
**Issues:**
- Sub-tab label case inconsistency (§#9 above).
- `aria-label: 'Materials and Output'` versus breadcrumb text "Materials & Output" — align to one form (spell out "and" in prose/ARIA; ampersand acceptable in compact UI labels).

### `tracker-app.js`
**Issues:**
- Line 600: `'No threads in this pattern'` — no action hint. Add: *"Open a saved project to start tracking."*
- Line 263: `"I don't have a fixed method"` — first-person voice in a button; inconsistent with all other buttons which use imperative or noun phrases. Rewrite: `"No fixed method"`.
- Line 285 warning: fine ✓.
- Undo tooltip: "Nothing to undo" / "Tap to undo · Long-press for redo" — good ✓.
- Stitching style options "One section at a time" / "One colour at a time" — good ✓.
- Block size "Tall towers (10 wide × 20 tall)" — charming and clear ✓.

### `manager-app.js`
**Issues (most issues of any file):**
- `alert("Invalid blend color.")` — American spelling; uses browser `alert()`; non-actionable (§#1).
- `placeholder="Second color code..."` — American spelling (§#2).
- `"Backup failed: " + e.message` — raw error (§#3).
- `"Invalid file: could not parse JSON."` — tech jargon. Rewrite: *"Could not read this file — it may be corrupted or not a valid backup."*
- `"Creating backup..."` / `"Backup downloaded!"` — inconsistent styles (gerund vs exclamation). Use `"Creating backup…"` / `"Backup saved."`.
- `"Restoring..."` / `"Restored! Reloading..."` — same issue. Use `"Restoring…"` / `"Restored. Reloading…"`.
- Restore confirmation missing irreversibility warning (§#7).
- Button `"Yes, Restore"` — unnecessary title case (§#10).
- Conflict panel `"own {c.owned}, need {c.totalNeeded}"` — terse shorthand acceptable in dense list context ✓.
- `"No threads found."` — non-actionable (§#8).
- `"No patterns match your filters."` — good ✓.

### `home-app.js`
**Issues:**
- Line 196: `'No projects yet — create one to get started.'` — good ✓.
- Line 199 greeting `'ready to stitch?'` — good ✓.
- Line 263: `p.name || 'Untitled project'` — good ✓.
- Line 387: `p.name || 'Untitled'` — inconsistent fallback (same project, different string). Align to `'Untitled project'`.
- Line 486: raw error in Toast (§#4).

### `modals.js`
**Issues:**
- Thread swap UI: clear and correct ✓.
- Help fallback: "The help panel could not be opened. Please reload the page to restore full functionality." — good ✓.
- About modal description is developer-centric ("client-side web application", "Technologies Used"). Remove the tech stack list or move to a help article. Replace description with: *"A browser-based tool for creating and tracking cross-stitch patterns. Everything runs on your device — no account or internet connection needed."*
- `"Version 1.0.0"` — hardcoded; will become misleading if never bumped.

### `toast.js`
No user-facing strings in the module itself. Default `undoLabel: "Undo"` is correct ✓.

### `preferences-modal.js`
**Issues:**
- "Tidy stray stitches" / "remove strays" — use "isolated stitches" consistently.
- "How aggressively to remove strays" — plain-language alternative: "How many isolated stitches to remove (0 = none, 3 = most)".
- `"Surfaces a link…"` — developer jargon. Rewrite: "Shows a link to the experimental embroidery pattern planner."
- Tracker section "Tint mode colour" description is accurate ✓ but sits in a section called "Highlight appearance" which covers all four highlight modes; grouping is clear enough.
- `subtitle: "Defaults used when starting a new pattern. You can still adjust everything per‑project…"` — uses non-breaking hyphen `per‑project` which is fine.

---

## Prioritised TODO List

```
- [ ] [Priority: HIGH] [Type: SPELLING]      [File: manager-app.js:1619]  Replace alert("Invalid blend color.") with Toast using British "colour" and actionable copy
- [ ] [Priority: HIGH] [Type: SPELLING]      [File: manager-app.js:1798]  Fix placeholder="Second color code..." → "Second colour code…"
- [ ] [Priority: HIGH] [Type: ERROR_QUALITY] [File: manager-app.js:601]   Replace raw e.message in backup failure with user-friendly message
- [ ] [Priority: HIGH] [Type: ERROR_QUALITY] [File: home-app.js:486]      Replace raw err.message in import Toast with format-hint message
- [ ] [Priority: HIGH] [Type: TERMINOLOGY]   [File: creator/PatternTab.js:120] Replace "confetti cleanup" with "isolated-stitch removal" in warning
- [ ] [Priority: HIGH] [Type: CONFIRMATION]  [File: manager-app.js:620]   Add "This cannot be undone" to backup restore confirmation
- [ ] [Priority: MED]  [Type: CAPITALISATION][File: creator-main.js:905]  Change "Create New Pattern" → "Create new pattern" (sentence case)
- [ ] [Priority: MED]  [Type: CAPITALISATION][File: creator/MaterialsHub.js] Align sub-tabs to title case: "Threads" / "Stash" / "Output"
- [ ] [Priority: MED]  [Type: CAPITALISATION][File: manager-app.js:798]   Fix button "Yes, Restore" → "Yes, restore"
- [ ] [Priority: MED]  [Type: ERROR_QUALITY] [File: manager-app.js:634]   Replace "could not parse JSON" with plain-English backup error
- [ ] [Priority: MED]  [Type: ERROR_QUALITY] [File: creator/ExportTab.js] Replace "JSZip failed to load" with user-friendly message
- [ ] [Priority: MED]  [Type: EMPTY_STATE]   [File: manager-app.js:1040]  Improve "No threads found." → add search-clear action hint
- [ ] [Priority: MED]  [Type: EMPTY_STATE]   [File: tracker-app.js:600]   Improve "No threads in this pattern" → add open-project guidance
- [ ] [Priority: MED]  [Type: TONE]          [File: manager-app.js:596-626] Normalise backup status messages: remove "!" from success, use ellipsis not "..."
- [ ] [Priority: MED]  [Type: TERMINOLOGY]   [File: creator-main.js:946]  Rewrite stash-preview warning — replace "unconstrained" with plain language
- [ ] [Priority: MED]  [Type: TONE]          [File: tracker-app.js:263]   Change first-person button "I don't have a fixed method" → "No fixed method"
- [ ] [Priority: MED]  [Type: TERMINOLOGY]   [File: home-app.js:387]      Align fallback p.name||'Untitled' → p.name||'Untitled project'
- [ ] [Priority: MED]  [Type: TERMINOLOGY]   [File: preferences-modal.js] Replace "stray stitches"/"strays" with "isolated stitches" throughout
- [ ] [Priority: LOW]  [Type: TONE]          [File: preferences-modal.js] Replace "Surfaces a link" → "Shows a link"
- [ ] [Priority: LOW]  [Type: CAPITALISATION][File: creator/ImportWizard.js] Rename step 5 "Confirm" → "Generate" to match app terminology
- [ ] [Priority: LOW]  [Type: TERMINOLOGY]   [File: creator/PatternTab.js:95] Check "Colours panel" capitalisation matches Sidebar.js heading
- [ ] [Priority: LOW]  [Type: TONE]          [File: modals.js (About)]    Simplify description; remove "Technologies Used" from user-facing About modal
- [ ] [Priority: LOW]  [Type: TERMINOLOGY]   [File: help-drawer.js]       Fix "Loadable in either Creator or Tracker" sentence fragment
- [ ] [Priority: LOW]  [Type: ERROR_QUALITY] [File: creator-main.js (ErrorBoundary)] Soften "CreatorApp Error:" heading to user-friendly message
- [ ] [Priority: LOW]  [Type: SPELLING]      [File: creator/ExportTab.js] Expand "B&W" → "black and white" on first use in error messages
```

---

## Proposed Style Guide — Top 20 Canonical Terms

| Concept | Canonical term | Avoid |
|---|---|---|
| A DMC/Anchor thread | **thread** (noun) | floss, fibre |
| A single hue in the palette | **colour** | color (American) |
| The set of colours in a pattern | **palette** | color palette, colour map |
| One physical bundle of thread | **skein** | ball, spool |
| The app's chart/design data | **pattern** | design (ambiguous) |
| Pattern + progress + history | **project** | file, work, document |
| The user's physical thread collection | **stash** | inventory, thread library, collection |
| Stitch type: over a full square | **cross stitch** | full stitch, whole stitch |
| Stitch type: over half a square | **half stitch** | half-cross stitch |
| Stitch type: outline stitching | **backstitch** | back stitch |
| Stitch type: decorative knot | **French knot** | knot |
| Image → chart conversion | **generate (a pattern)** | create, convert, process |
| Saving to the browser's storage | **save** | sync (reserve for folder sync) |
| Writing a file to the device | **download** | save-as |
| Creating a share-ready artefact (PDF/OXS) | **export** | download (use "Export and download" if a download is involved) |
| Loading data from a file | **import** or **open** | load, upload |
| The stitching count that drives fabric estimates | **fabric count** (e.g. 14 count) | aida count |
| Finishing a colour region in tracking | **complete** (adj: "completed") | done, finished |
| The view showing only one colour at a time | **Highlight view** (proper name) | focus view, spotlight view |
| Thread progress percentage | **coverage** | completion (reserve for overall project %) |
