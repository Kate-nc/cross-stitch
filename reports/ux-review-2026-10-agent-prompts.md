# Agent prompts for the October 2026 UX review

Source: [ux-review-2026-10.md](ux-review-2026-10.md) (finding IDs like UX-001 refer to it; evidence screenshots are in `ux-review-2026-10/`).

Each prompt is self-contained: paste one into a fresh agent session. Run them in order where possible. Prompts 1 to 3 are the most important. Prompts 5 and 6 share vocabulary decisions, so do 5 before 6.

## Shared rules (every prompt below assumes these)

Paste this block at the top of each prompt, or confirm the agent has read `AGENTS.md` and `.github/copilot-instructions.md`:

> Follow `AGENTS.md` and `.github/copilot-instructions.md`. Key rules: no emojis or symbol glyphs such as ✓ → ✕ in user-facing UI (use `Icons.*` from `icons.js`; arrow/modifier glyphs inside `<kbd>` are allowed); British spelling; use design tokens, not raw hex; keep files UTF-8. After editing `creator/*` run `node build-creator-bundle.js`; after editing `tracker-app.js`, `creator-main.js`, `manager-app.js` or `embroidery.js` run `node build-runtime-js.js` and commit `compiled/`. User-visible changes also need `help-drawer.js` and `APP_CHANGELOG` in `version.js` updated. Do NOT modify `pdf-export-worker.js`, `creator/pdfChartLayout.js` or `creator/pdfExport.js` without an explicit Pattern Keeper compatibility regression check. Run `npm test` and `npm run lint:terminology` before committing. Work on a branch, commit in small steps, and do not open a PR unless asked. Add or update Jest tests for every behaviour change.

---

## Prompt 1: Never reuse a chart symbol (Critical) - UX-001, UX-002, UX-005

> **Problem.** `SYMS` in `dmc-data.js:75` has 43 glyphs, and `buildPalette()` in `colour-utils.js` assigns `SYMS[i % SYMS.length]`. Charts with more than 43 symbols therefore reuse symbols (in a 71-symbol test chart, 28 were shared: "⊜" stood for four different threads). The set also contains many look-alike pairs (◆/♦/⬥/⬧/⬩, ◇/♢/⬦/⬨, ⊙⊚⊛⊜⊝, ⊕/⊗, ⊞/⊠, outline-vs-filled pairs). The printed PDF uses a different 112-glyph font (`creator/symbolFontSpec.js`, `assets/fonts/CrossStitchSymbols`), so paper and screen disagree for the same thread.
>
> **Goal.** Every palette entry in a chart gets a unique symbol, visually distinct from the others, and the on-screen symbol matches the PDF symbol for the same thread.
>
> **Do this.**
> 1. Write a failing Jest test first: for palettes of 43, 71 and 112 entries, `buildPalette()` returns all-unique symbols. Add a test that user-chosen symbols (carried on cells) are still respected.
> 2. Decide the symbol source. Preferred: draw on-screen symbols from the same `CrossStitchSymbols` glyph set the PDF uses (the font is already loaded on `create.html`; check whether `stitch.html` loads it and add it if not, plus the service worker precache in `sw.js` and `tests/swPrecacheSync.test.js`). Read-only reuse of the font spec is fine; do not edit the three PDF files listed in the shared rules. If you cannot render the font everywhere, instead extend `SYMS` with distinct glyphs, drop near-duplicates, and map to the PDF code points.
> 3. Make assignment colour-aware: when choosing symbols, keep the most similar colour pairs (use the existing CIEDE2000 helper) in different shape families. Avoid outline/filled variants of the same shape for similar colours.
> 4. Beyond the largest supported set (112), block or warn clearly in Convert/Generate rather than silently reusing. The Generate toast and Palette header must keep the "N threads · M symbols" wording from `TERMINOLOGY.md`.
> 5. Migrate saved projects: existing projects with duplicate symbols should be repaired on load (keep each colour's user-chosen symbol where it is unique; reassign only duplicates) without changing `done` data. Add a test with a saved project fixture.
> 6. Add a test asserting that the screen symbol and the PDF code point for a given palette entry resolve to the same glyph.
> 7. Update help (Glossary/Chart topics), `APP_CHANGELOG`, and run both builds.
>
> **Verify.** Generate a 150×113 picture at Threads (max) 40 (about 70 symbols with blends) in the Creator and Tracker, and confirm in the browser that no symbol repeats and the PDF legend matches the screen. Report what you checked.

---

## Prompt 2: Make bulk "mark colour done" safe and obviously named (High) - UX-003, UX-031, UX-033

> **Problem.** In the Stitch Tracker colour list (`tracker-app.js` around lines 8660 to 8680), each row has a small green "✓ Done" chip that marks every stitch of the colour as done and a red "Undo" chip that unmarks every stitch of it. There is only a native `confirm()` when more than 50 stitches remain, none when unmarking, and no undo toast. "Undo" collides with the step-undo button. Other destructive actions use native `confirm()` (lines about 3428, 8673, 9772) where the app has a styled `ConfirmDialog`, and "Clear all" for park markers has no confirmation.
>
> **Goal.** Whole-colour changes can never be done by accident, are named for what they do, and can always be reversed.
>
> **Do this.**
> 1. Rename the chips: "Mark all done" and "Mark all not done" (shorter responsive labels are fine if the full text is the accessible name). Never use the bare word "Undo" for anything except step undo. Use `Icons.*`, not glyphs.
> 2. Always confirm through the styled `ConfirmDialog` (not `window.confirm`), showing the colour label and the exact stitch count ("Mark all 1,573 stitches of DMC 05 Light Driftwood as done?"). Respect the existing `trackerMarkAllAs` preference flow (`requestMarkColourDone`).
> 3. After either action show a toast with an Undo action (the drag-mark toast "11 stitches marked · Undo 11 stitches" is the pattern to copy). The whole-colour action must be one step in `trackHistory` so step Undo reverses it.
> 4. Replace the remaining `confirm()` calls in `tracker-app.js` with `ConfirmDialog`, and add confirmation plus an undo toast to the park-marker "Clear all".
> 5. Make the row's own tap target (select colour) and the action chip separate, with at least 44 px touch targets on coarse pointers and enough spacing to avoid near-misses.
> 6. Add a two-swatch legend ("To stitch" / "Stitched") near the progress strip explaining the done/not-done look. Done cells are drawn in the thread colour capped at mid-grey luminance (`doneStitchLook` in `colour-utils.js`), so a done white/ecru stitch looks grey. Mention the "Corner tick" style option from More > View in the legend or first-run tip.
> 7. Tests: extend or add Jest tests for the new labels, the confirm path, and undo of a bulk mark. Update help and changelog; run `node build-runtime-js.js`.
>
> **Verify.** In the browser, mark a colour done, confirm the dialog and toast, press toast Undo and step Undo, and check the state returns exactly. Test on a touch viewport (Pixel 5 and iPad Mini emulation).

---

## Prompt 3: Fix the Tracker F key and make hidden layers visible (High) - UX-004 (F key part)

> **Problem.** In `tracker-app.js`, pressing F at a zoom where symbols are visible blanks the chart (it toggles the full-stitch layer via the `tracker.layer.full` shortcut at about line 7413), while a separate window `keydown` listener (about lines 2076 to 2091) also toggles focus mode, and the More panel tooltip says "Enter focus mode (F)". The help list says F toggles the full-stitch layer. Hidden layers persist and nothing on screen says content is hidden.
>
> **Goal.** F does one thing, the tooltip and help agree with it, and a hidden layer is always signposted.
>
> **Do this.**
> 1. Find every handler bound to F (and H, K, L, Shift+A) in `tracker-app.js` and the `Shortcuts` registry (`shortcuts.js`). Remove the duplicate raw listener so each key has a single registered owner.
> 2. Decide: layer toggles should not be bare keys. Move them to Shift+F (full), Shift+H (half), Shift+K (knots), Shift+L (backstitch), keep Shift+A for all layers, and give focus mode the bare F. Check for collisions with existing Shift bindings (`Shift+G`, `Shift+F10`, `Shift+Enter`). If you find a better scheme, explain it in the commit message.
> 3. Show a persistent chip in the chart header or progress strip whenever any layer is hidden ("Full stitches hidden · Show"), with one click to restore, with an accessible name.
> 4. Update tooltips, the `trackerShortcuts` array, and `help-drawer.js`. `tests/helpDrawerShortcutsSync.test.js` must pass.
> 5. Tests: a test that only one handler responds to F, and that hiding a layer renders the chip.
>
> **Verify.** In the browser at several zoom levels, press F and each layer key, confirm only the documented action happens, and that the chip appears and works.

---

## Prompt 4: Protect progress when editing a stitched pattern (High) - UX-006, UX-009

> **Problem.** The Creator guards Regenerate when progress exists (`creator/useCreatorState.js` about lines 1880 to 1915), but ordinary cell edits (Paint, Fill, Replace colour, Erase) do not touch `done`, and the Creator canvas does not show which cells are stitched. A cell repainted from one colour to another can stay "done". The Regenerate warning also says "Project › Backup", which does not exist (the real path is File > Export Backup, and menu paths must be written "File > …", never with an arrow glyph). On desktop the Edit tab opens in Paint mode after Generate (status bar "Cross stitch — paint mode"), while on touch devices it opens in Navigate.
>
> **Goal.** The user always knows when they are editing stitched cells, and edits cannot leave inconsistent progress.
>
> **Do this.**
> 1. First write a test (or an exploratory script) that confirms the current behaviour: change a done cell's colour and check `done` and per-colour counts. Report what you find before changing anything. If it is not actually a bug, say so and stop that part.
> 2. If confirmed: when an edit changes the colour/type of a cell that is marked done, either reset it to not done or ask once per edit session (recommended: reset, with a toast "N stitched cells reset to not done. Undo"). The reset must be part of the same undo step in `useEditHistory.js`.
> 3. When the project has any progress, show a banner in Edit ("This project is 34% stitched. Changing stitched cells resets them to not done.") and add an optional "Show stitched" overlay toggle on the Creator canvas.
> 4. Fix the Regenerate warning wording to "File > Export Backup".
> 5. Make the Edit tab open in Navigate on all devices until the user picks a tool or colour (UX-009). Update `tests/e2e` expectations that assume Paint (search `creator-draw-navigate.spec.js` and related specs) and the first-run tour text if needed.
> 6. Rebuild: `node build-creator-bundle.js`, `node build-runtime-js.js`. Update help and changelog.
>
> **Verify.** In the browser: stitch a few cells in the Tracker, return to the Creator, repaint them, confirm banner, reset, toast and undo.

---

## Prompt 5: One vocabulary for modes, views and shortcuts across Creator and Tracker (High) - UX-004 (shortcut table), UX-007, UX-008, UX-026, UX-029, UX-030, UX-024

> **Problem.** The same concepts have different names and keys in each tool (full list in the report, section 4). Examples: Creator View options "Colour · Symbol · Both" vs Tracker "Symbol · Colour + symbol · Highlight"; "Paint" changes the pattern in the Creator but marks progress in the Tracker (touch "Paint" chip relabels the Mark button); "Draw"/"Paint" both name the Creator edit mode; "Nav"/"Navigate"; dead Tracker "Modify" / edit-mode code that can never show; Navigate is H in the Creator but N in the Tracker; stitch-type labels differ between panels ("¼ St" vs "¼ Stitch" vs "Quarter", "Full Cross" vs "Cross"); export and open-in-Tracker actions have many labels ("Print PDF", "Export…", "Export pattern", "Open in Tracker", "Open in Stitch Tracker", "Resume tracking", "Continue →"); "Update chart" is ambiguous; labels use "→"; page titles vary ("stitch. — Home", "stitchx Manager"); Tracker footer says "Tap" on mouse devices.
>
> **Goal.** One agreed vocabulary, applied everywhere, enforced by the terminology lint.
>
> **Do this.**
> 1. Start by adding the decisions below to `TERMINOLOGY.md` and `help-drawer.js` Glossary (keep the two in step), then extend `scripts/lint-terminology.js` with rules for the banned variants. Decisions (change only with a stated reason):
>    - Display modes: "Colours", "Symbols", "Colours + symbols" in both tools; Tracker keeps "Highlight" as a fourth mode. Same V cycle order in both. Remove the duplicated "VIEW" heading in the Creator View tab. In the Tracker, replace the low-zoom "Symbol" colour-block state's confusing banner with honest wording, or default to a zoom where symbols render.
>    - Pattern editing is "Draw" (tools: Paint, Fill, Erase). Progress is "Mark". Pan is "Navigate" (spell it out where space allows; icon with accessible name on phones). The touch option in the Tracker is "Drag to mark" and must never relabel the Mark button.
>    - Shortcuts: Navigate on the same key in both tools (N). Do not change Tracker layer keys here (Prompt 3 owns them).
>    - Stitch types, sentence case, one list everywhere: "Full cross", "Half cross (/)", "Half cross (\)", "Quarter", "Three-quarter", "Backstitch", "French knot" (and keep "Petite", "Long stitch" consistent).
>    - Actions: "Print PDF…" (PDF), "Export…" (other formats), "Open in Tracker" (action), "Track" (header). Rename Home "Update chart" to "Import updated chart…". Remove "→" from labels ("Continue →", "View detailed stats across all projects →").
>    - Page titles: "stitchx — Home", "stitchx — Create", "stitchx — Track", "stitchx — Stash", "stitchx — Stats". Logo wordmark is "stitchx".
>    - Device-aware wording: use "Click" on fine pointers and "Tap" on touch in the Tracker footer and palette hint (reuse the approach of `creatorDeviceWords` in `onboarding-wizard.js`).
> 2. Delete the unreachable Tracker edit-mode UI (`isEditMode` strip, "Modify" label, `showExitEditModal`, related styles and tests such as `tests/editModeBanner.test.js`) after confirming nothing calls `setIsEditMode(true)`.
> 3. Apply the renames across `creator/*`, `tracker-app.js`, `home-app.js`, `manager-app.js`, `header.js`, `command-palette.js`, `help-drawer.js`, `README.md` and `wiki/`, and update existing tests that assert old strings.
> 4. Rebuild all bundles. Update changelog.
>
> **Verify.** Run `npm test` and `npm run lint:terminology`, then click through Home, Creator, Tracker and Manager in the browser to confirm the labels match.

---

## Prompt 6: A complete, consistent colour key with blends explained (High) - UX-013, UX-014, UX-012

> **Problem.** Thread codes and key contents are formatted differently on each surface ("3799  Pewter…", "3799 · Pewter VDk", "DMC 3799  Pewter VDk", "05  Light Driftwood", sort button "DMC ID"). Names are truncated at about 8 characters even on wide screens. Neither key shows strand count or skeins needed. Blends dominate converted palettes (46 of 71 symbols in the test) and show as "341+826", the colour chip reads "341+826 · 341+826", and nowhere does the UI say how to stitch a blend. Confetti-related terms vary: "confetti", "orphans", "isolated full crosses", "stray stitches", "single stitches".
>
> **Goal.** One thread-label formatter, a key that shows what a stitcher needs, and blends and confetti explained once, in plain words.
>
> **Do this.**
> 1. Create or extend a single shared formatter (start from `threadLabel` in `helpers.js`/related code) producing "DMC 3799 Pewter Very Dark" for solids and "DMC 341 + 826 (blend)" for blends, with a short variant for tight spaces and a full-name `title`/accessible name. Use it in the Creator Palette tab and chips, Tracker colour list, active tile, status bar, Manager and Home. Rename the Tracker sort "DMC ID" to "Number".
> 2. Let key names wrap or show in a detail row instead of truncating at about 8 characters. Add strands and skeins-needed to both keys (Creator Palette tab and Tracker colour list) using existing `stitchesToSkeins`/`threadCalc.js` logic, with the fabric count already on the project. Blends cost half a skein per component (see `useCreatorState.js` near line 99).
> 3. Add a short "What's a blend?" explanation (one strand of each thread in the needle) reachable from the key and the Convert result toast, in plain language, plus a glossary entry.
> 4. Review whether blends are on by default for photo conversion. Do not change the default yourself; instead surface the setting clearly in Convert ("Allow two-thread blends") with the effect described, and report in your summary what the current default is and the effect on a typical photo.
> 5. Use "confetti stitches" as the one user-facing term. Define it where it first appears ("single stitches of a colour on their own; slow to stitch"), rename "Tidy stray stitches" to "Reduce confetti" (keep `TERMINOLOGY.md` plain-name table in step), and make "Ready to stitch" and Pattern info use the same term and counts.
> 6. Tests for the formatter (solid, blend, Anchor, long names) and snapshot-style tests for the key rows. Rebuild bundles; update help and changelog.
>
> **Verify.** Compare the key on the Creator, Tracker and Manager for the same pattern and confirm identical labels.

---

## Prompt 7: Stash Manager conflicts and shopping list (High) - UX-011, UX-021

> **Problem.** After creating one pattern with an empty stash, Stash Manager shows a red "Thread Conflicts (38) … needed by multiple patterns but you don't have enough" panel (`StashBridge.detectConflicts` in `stash-bridge.js` flags any shortfall, even with one pattern). Home > Stash simultaneously says "Nothing on your shopping list." Home > Stash also says "0 COLOURS" next to "0 SKEINS" (the terminology rules say "threads").
>
> **Goal.** "Conflict" means two or more active patterns competing for the same thread. A shortfall for one pattern is a neutral "to buy" list shared by Home and Manager.
>
> **Do this.**
> 1. Write tests first for `detectConflicts`: one pattern with a shortfall gives no conflict; two patterns whose combined demand exceeds the stash give a conflict naming both patterns.
> 2. Change `detectConflicts` accordingly, and add a "To buy" view (per project and total) from the same demand data. Make Home's Shopping list read from it so Manager and Home always agree.
> 3. Manager: show a neutral "To buy for {pattern} (N threads)" panel with an "Add to shopping list" action; keep the red "Thread Conflicts" panel only for real conflicts, with correct copy. Keep the collapse persistence behaviour (`stashConflictsCollapsed`).
> 4. Replace "Colours" with "Threads" on Home > Stash and add `home-app.js` to the terminology lint scope. Replace the jargon "fully kitted" and fix "1 patterns" with a plural helper.
> 5. Run `node build-runtime-js.js`; update help, README Stash Manager section and changelog.
>
> **Verify.** Create one project with an empty stash (no conflict, shopping list shows 38 threads), then a second project sharing threads (conflict appears).

---

## Prompt 8: Consistent chart rulers and readable counting aids (Medium) - UX-010, UX-016

> **Problem.** The Creator labels rulers 1, 11, 21… (`creator/canvasRenderer.js` around lines 290 to 296 and 644 to 648) while the Tracker labels 10, 20, 30…, with bold 5s and 10s when zoomed in. Creator ruler text is `#A89E89` on white (2.65:1) at 7 to 11 px. In the Tracker's Highlight view the counting aids (run-length badges and sparkles) are drawn in the accent colour, overlap into unreadable stacks at fit zoom, and the hint banner is clipped on the left ("ounting aids, [ ] to cycle colours").
>
> **Do this.**
> 1. Use the Tracker's numbering (labels on the heavy 10-lines: 10, 20, 30; first cell labelled 1) in the Creator, matching paper charts. Use `--text-tertiary` (or the dark equivalent) for ruler text, at least 4.5:1 in light and dark. Check there is a test or add one for the ruler label positions. Do not touch the PDF files (the PDF has its own axis labels).
> 2. Draw counting aids in a neutral high-contrast style (dark outline with light fill) rather than the accent colour; hide them below a minimum cell size; make them off by default for new users (keep existing users' saved preference).
> 3. Fix the clipped Tracker hint banner (check overflow and padding at 1366 px and phone widths).
> 4. Rebuild; update help and changelog; check dark mode screenshots.
>
> **Verify.** Screenshot both tools at the same zoom to compare rulers; screenshot Highlight view on a red-heavy pattern.

---

## Prompt 9: One truth for progress numbers (Medium) - UX-019

> **Problem.** With 16 stitches marked, the Tracker says "0.1% · 16,934 to go", while Stats says "Total stitches 0 across 1 project" and "Lifetime 0" on the same page as "16,934 left". The Pattern Library card repeats the percentage three times ("0.1% stitched", "0.1%", the bar), and time estimates are in different units (hours in the Creator, days in the Library). Read `docs/progress-contract.md` and `reports/progress-consistency.md` first.
>
> **Do this.**
> 1. Find out whether Stats "Total stitches" is only updated when a session finishes. If so, either count marks directly, or relabel to "Stitches in finished sessions" and say so.
> 2. Show progress once per card. Use one time-estimate format everywhere ("about 424 hours, about 28 days at your pace" or equivalent).
> 3. Add a test that the Tracker, Home, Library and Stats progress for the same project agree after marking stitches (use `ProgressUnits`).
> 4. Update changelog and docs if the contract changes.

---

## Prompt 10: Navigation, dark mode and first-run polish (Medium) - UX-015, UX-017, UX-022, UX-028

> **Problem.** (a) The header tabs Create · Edit · Track · Stash · Stats overlap with the Creator's own Convert · Edit · Materials sub-tabs ("Edit" appears twice; the header shows "Create" while converting and "Edit" after Generate). Home has a different tab set whose "Stash" is a summary. Stats has a "Back to grid" button with no obvious grid. (b) In dark mode every header tab is drawn in the accent colour so the active one cannot be seen; at 768 px the File button is clipped and the project/progress chip renders as an empty capsule (see screenshot `ux-review-2026-10/09-tablet-dark-nav.png`). (c) Pressing ? in the Tracker opens the Shortcuts tab with the Pattern Creator keys first. (d) Home first-run says "No projects yet — create one to get started." then shows a "NO ACTIVE PROJECT · Pick a project below" card and an "NP No project" initials chip.
>
> **Do this.**
> 1. Header: keep only tool tabs; document the model (header = tool; sub-tabs = steps inside the Creator) and make the header highlight consistent (stay on "Edit" or "Create" through Convert/Edit/Materials, whichever you choose, and say why). Rename "Back to grid" to "Back to projects".
> 2. Dark mode: inactive tabs use `--text-secondary` with an underline on the active tab, as in light mode. At tablet widths collapse the project and save chips into one so nothing clips. Check 768, 1024 and 1366 px in both themes.
> 3. Help drawer: open Shortcuts on the current tool's section (`__csPageKind`), with the other sections collapsed.
> 4. Home empty state: hide the active-project card when no projects exist, show the three Create cards on Projects, and show a plain "No project" chip without initials.
> 5. Rebuild; update help and changelog; add or adjust e2e specs.

---

## Prompt 11: Phone and touch layout (Medium) - UX-018, UX-020

> **Problem.** On a phone the Tracker stacks first-run toasts and a coachmark over about 40% of the chart while the user is learning to mark ("Keeping the screen on while you stitch. Turn off" and "Sessions are tracked automatically… Open" wrap into a narrow 10-line column; the right rail also covers the last columns; see `ux-review-2026-10/07-phone-tracker-toasts.png`). The Creator's phone UI is icon-only (image / pencil / layers switcher; hand, pencil, brush, bucket, eraser, swatch, undo, more) with an ambiguous fill icon, and the status hint under the canvas is cut off ("Dra… for…"; `ux-review-2026-10/11-phone-creator-icon-only.png`).
>
> **Do this.**
> 1. Phones: queue first-run notices into one bottom banner (or the More panel), make toasts full width, auto-dismiss informational ones, and never show more than one at a time over the chart. Keep `Coaching` overlay rules (`coaching.js`) in mind.
> 2. Creator phone bars: add short labels under the tool icons (copy the Tracker rail), label the Convert / Edit / Materials switcher, replace the fill icon with a clearer bucket-pour icon added to `icons.js` (24×24, 1.6 stroke, `currentColor`), and let the hint text wrap.
> 3. Keep 44 px minimum touch targets. Test at 360×640, 393×851 (Pixel 5), 768×1024 and 1024×768, portrait and landscape.
> 4. Rebuild; update changelog; extend `tests/mobile-audit` where suitable.

---

## Prompt 12: Small fixes and polish (Low) - UX-023, UX-025, UX-027, UX-032

> **Do these small, independent fixes** (one commit each):
> 1. **UX-023:** the "Ready to stitch review" banner button (`creator/PatternTab.js` about line 160) and the "Thread consumption history" button (`tracker-app.js` about line 9233) render with browser-default styling; use the standard secondary button class.
> 2. **UX-025:** use a plural helper and `toLocaleString` for counts ("1 patterns", "16950 full-cross cells", "Full Cross (16950)"); fix the Generate toast that ends with a double bracket "…(46 are blends of two threads))." by restructuring the sentence in `threadCountsSentence`/`useCreatorState.js` (keep the `TERMINOLOGY.md` wording rule).
> 3. **UX-027:** the "Name this pattern … It will appear on the PDF and in your library" dialog (`creator-main.js` about line 1161) appears on "Open in Tracker" even when the pattern already has a name. Ask only when the name is still a default, and only once; use wording that fits the action.
> 4. **UX-032:** fabric count is editable in three places (Convert > Size & fabric, Edit > Project > Fabric, Materials > Ready to stitch) and the Convert "FABRIC COUNT" select is clipped at 1366×900. Keep one editable control (Project) with read-only values and an "Edit" link elsewhere, or confirm they stay in sync, and fix the card overflow.
> 5. Rebuild bundles, update changelog, run `npm test`.
