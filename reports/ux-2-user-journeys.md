# UX Audit · 2 · User Journeys

> Phase 1 / Step 2 — first-person walkthroughs of the six core journeys.
> Each step is a real action; friction notes are tagged so they can be
> referenced from the problems report.

Notation:
- **F-{ID}** — friction observation (referenced from
  [ux-3-problems.md](ux-3-problems.md))
- **🟢 / 🟡 / 🔴** — minor / moderate / major

---

## Journey 1 — New user → first pattern

**Persona:** First-time visitor, lands on `index.html`. Has heard about the
app from a craft forum. Wants to see what it can do.

| # | Action | What happens | Friction |
|---|---|---|---|
| 1 | Open `index.html` | Welcome wizard modal appears (`onboarding-wizard.js`); behind it, the home greeting "Good evening, stitcher ★". | **F-1.1 🟡** Two onboarding systems exist (`onboarding.js` and `onboarding-wizard.js`); on a clean profile both can fire. |
| 2 | Read welcome wizard | 3-4 step intro, can skip. | **F-1.2 🟢** Wizard steps don't actually point at any UI element ("hold on while we describe Create / Track / Stash"); a tour-style highlight would teach more. |
| 3 | Close wizard | Empty home: greeting + drag-and-drop zone + buttons "Create blank" / "Browse" / "Import". | **F-1.3 🟡** The drop zone and the "Create blank" button compete visually — neither is clearly primary. No "Try a sample pattern" path despite `starter-kits.js` existing. |
| 4 | Click "Create blank" | Modal asks for canvas size (W × H). | **F-1.4 🟡** No preset sizes ("greeting card 50×70", "sampler 100×100"); first-timers must pick numbers blind. |
| 5 | Submit | Creator opens in Edit mode with a blank grid; sidebar shows palette tab; ToolStrip is fully populated. | **F-1.5 🔴** Toolbar throws ~12 tools at the user with no guidance. The "?" help shortcut is not visible anywhere. |
| 6 | Try clicking a cell | Nothing happens — no thread selected. Status bar may say "select a colour first". | **F-1.6 🔴** No "first stitch" coaching: the natural action (click a cell) silently fails. |
| 7 | Open palette tab → add colour | Colour picker opens. Add DMC 310 (black). | OK. |
| 8 | Click cell | Stitch appears. Repeat. | OK. |
| 9 | Save | Header File menu → Save (or Ctrl+S). Name prompt modal appears. | **F-1.7 🟡** No autosave indication during the first save; if user closes tab without saving, IndexedDB still keeps `auto_save` but they don't know that. |

**Total time-to-first-stitch:** ~7 deliberate actions. Could be 2 with a
"Click anywhere to start" empty-canvas hint and a default selected colour.

---

## Journey 2 — Design a pattern from scratch

**Persona:** Hobbyist who wants to design a 60×60 floral motif over an evening.

| # | Action | What happens | Friction |
|---|---|---|---|
| 1 | Home → Create blank → enter 60×60 | Canvas appears in Edit mode. | OK. |
| 2 | Add several colours | Each colour requires opening the picker, picking, confirming. | **F-2.1 🟡** No bulk "add starter palette" inside Creator (it exists in Manager bulk-add); you add one colour at a time. |
| 3 | Choose paint, click cells | Standard. Cells fill. | OK. |
| 4 | Need to fill an area | Switch to fill bucket (F or button). | **F-2.2 🟢** The fill bucket icon is small and shares space with paint; tooltip is the only differentiator. |
| 5 | Make a mistake | Ctrl+Z works. ✓ | OK — undo is reliable. |
| 6 | Try freehand draw / drag-paint | Drag paints multiple cells. ✓ | OK. |
| 7 | Want to draw a circle | No shape tool. Must paint cell-by-cell. | **F-2.3 🟡** No primitive shape tools (line / rectangle / circle / ellipse) for designers; lasso doesn't double as a shape primitive. |
| 8 | Compare with realistic preview | Need to enable split-pane. There's no toolbar button — only the `\` keyboard shortcut. | **F-2.4 🔴** Split-pane preview is power-user-only; new designers never discover it. |
| 9 | Decide to clean up isolated stitches | Sidebar → Settings → Cleanup slider. Drag too far → warning. | **F-2.5 🟡** Cleanup is destructive **and not undoable** ([ux-3-problems.md](ux-3-problems.md) C5). User has to trust slider. |
| 10 | Preview legend | Switch sub-page to Materials → see thread list. | **F-2.6 🟢** The sub-page dropdown (next to the project name) is the only path on narrow screens, but the right sidebar already has these as tabs — same tabs in two places confuses (which is canonical?). |
| 11 | Save with name | Ctrl+S → name prompt → saved. | OK. |

---

## Journey 3 — Import an image and adapt to stash

**Persona:** Returning user with their own DMC stash recorded; wants to convert
a holiday photo to a stitch pattern using only colours they already own.

| # | Action | What happens | Friction |
|---|---|---|---|
| 1 | Home → drop JPG on canvas | Goes to Creator Create mode with the image preview. | OK. |
| 2 | Choose palette size, click Generate | Worker runs; takes a few seconds; pattern appears in Edit mode. | **F-3.1 🟡** No progress indication beyond a spinner; for a 200×200 image it can take ~10-15 s on a phone with no ETA. |
| 3 | Look at result | Thread palette uses any DMC, not the user's stash. | OK so far. |
| 4 | Want to limit to stash | Sidebar → "Limit to stash" toggle. Threads disappear from the chips. | **F-3.2 🔴** The toggle silently *hides* unused-by-stash threads from the palette but does **not** re-quantise the pattern. The pattern still uses unowned colours; user thinks they're done but exporting will list threads they don't have. |
| 5 | Try "Substitute from stash" | Sidebar action → modal with comparison slider. | OK — the modal is the right pattern, but it's buried in a kebab menu in the sidebar accordion. |
| 6 | Apply substitution | Pattern updates. Some colours look off. | **F-3.3 🟡** The substitution is global and atomic — no per-thread review or per-region sampling. ΔE is shown but not actionable. |
| 7 | Manual touch-ups | Use eyedropper + paint to fix faces. | OK — eyedropper exists and works. |
| 8 | Re-check materials | Sub-page → Materials. Some threads still flagged "Need to buy". | **F-3.4 🟡** "Limit to stash" toggle in palette and the legend's "Add all to stash" interact in surprising ways — opposite directions of the same idea live in different tabs. |

---

## Journey 4 — Track stitching progress

**Persona:** Crafter on a tablet, propped up next to the stitching frame. Has a
saved 100×100 pattern in IndexedDB.

| # | Action | What happens | Friction |
|---|---|---|---|
| 1 | Open `stitch.html` (PWA icon) | Resume modal appears with last position + last colour + "X days ago". | OK — resumability is genuinely good here. |
| 2 | Tap "Resume" | Tracker loads with project. First-time-only Stitch Style Wizard appears (block / cross-country / freestyle). | **F-4.1 🟡** Wizard runs *every* first visit per device — if the same user opens on a new tablet they have to re-pick. |
| 3 | Tap a swatch in the bottom drawer | Highlight mode engaged; other colours dim. | OK. The bottom-sheet quick-drawer is the best touch UX in the app. |
| 4 | Tap a cell | Stitch is marked. Tap again to unmark. | OK. |
| 5 | Try to drag-mark a row | Doesn't work — only single taps. | **F-4.2 🟡** No drag-to-mark on touch. Long-press range-select exists but is undiscoverable. |
| 6 | Pinch to zoom in | Zoom works smoothly. | OK. |
| 7 | Scroll down | Header and bottom toolbar slide off ("immersive mode"). Scroll up brings them back. | OK — nice. But the scroll-up reveal can be touchy with two-finger pan. |
| 8 | Want to undo a stitch | FAB undo button exists on desktop, hidden on mobile (collapsed into action bar). | **F-4.3 🟡** On mobile, the undo affordance is a tiny icon at the right edge of the action bar, not signposted. |
| 9 | Want to see overall progress | Has to open the project sub-stats / scroll the full canvas. | **F-4.4 🟡** The persistent progress indicator on mobile (in the immersive header) shows % only — no visible "you're filling in" reward. |
| 10 | Pause for the night | Just close the tab — auto-session pauses on visibility change. | OK. |
| 11 | Resume next day | Back to step 1. **Resume modal does not show what they did yesterday** — only "last position". | **F-4.5 🔴** Returning to a project after weeks gives no "you stitched 2 hours over 3 sessions, here's the area you filled in". The breadcrumb trail exists but is buried in the Session Summary modal. |

---

## Journey 5 — Manage a collection

**Persona:** User with 9 projects accumulated over a year — some finished,
some abandoned, one in progress, several queued.

| # | Action | What happens | Friction |
|---|---|---|---|
| 1 | Open home | Multi-project dashboard fires (>1 project). | OK. |
| 2 | See sticky Continue bar at top | Shows the most recently touched project. | OK. |
| 3 | Look for a specific project from 6 months ago | Scroll past Active section, expand "Paused", expand "Completed". | **F-5.1 🟡** No search. With 9+ projects, finding one by name requires scrolling and expanding sections. |
| 4 | Want to mark one as "in progress" again | Click the `…` menu on the row → state menu pops over. | OK. |
| 5 | Want to delete | Have to go to the **Stash Manager** Pattern Library tab to delete (Home dashboard has no delete). | **F-5.2 🟡** Project lifecycle (state change, edit details) is on Home; permanent destructive actions (delete) are in the Manager. Two-place inconsistency. |
| 6 | Want to add a tag like "gift" | No tagging on Home; only the Manager Pattern Library has tags, and only for entries linked into the pattern library. | **F-5.3 🟡** Creator/Tracker projects don't have tags unless they've been auto-mirrored into the Manager pattern library. |
| 7 | Want to bulk-archive 3 finished projects | One at a time only. | **F-5.4 🟡** No multi-select on either Home or Manager pattern library. |
| 8 | Want to back up everything | Header → File → Backup → download .json (gzip-wrapped). | OK — backup is well-implemented. |

---

## Journey 6 — Export & share

**Persona:** Designer who wants to give a printed PDF + thread shopping list to
a friend.

| # | Action | What happens | Friction |
|---|---|---|---|
| 1 | Open project, header sub-page → Export | Export tab loads with two preset buttons ("Pattern Keeper", "Home Printing") and a collapsed Settings section. | OK — presets are well-judged. |
| 2 | Click "Home Printing" | Worker runs; progress bar shows; PDF downloads. | OK — this is one of the best flows in the app. |
| 3 | Want to also send the shopping list | Nav back to Prepare sub-page → "Copy list" → paste into messages. | **F-6.1 🟡** Two artefacts (pattern PDF + thread list) require visiting two sub-pages. No "package" export combining them. |
| 4 | Want to share a low-res preview to social media | No PNG-of-realistic-preview export. | **F-6.2 🟡** PNG export exists but only of the symbol chart, not the realistic preview that's most shareable. |
| 5 | Want to print a working copy with checkboxes per row | Pattern Keeper PDF is the only chart-style output. | **F-6.3 🟢** Power-stitcher conventions (per-row checkboxes, parking page) not surfaced. |
| 6 | Send via cloud sync | Sync engine exists (folder-watch via File System Access API) — desktop only. | **F-6.4 🟡** No mobile share-sheet integration; user must download then attach manually. |

---

## Cross-cutting friction (any journey)

| ID | Observation | Severity |
|---|---|---|
| **F-X.1** | The header has *two* navigation hierarchies: app-section tabs (Create / Edit / Track / Stash / Stats) AND the sub-page dropdown (Pattern / Project / Materials / Prepare / Export). On narrow screens both show; the relationship between them isn't visually obvious. | 🟡 |
| **F-X.2** | The project badge in the header is tappable to rename — no obvious affordance beyond a small pencil icon. | 🟢 |
| **F-X.3** | "Auto-saved" hint flashes briefly, then disappears. No persistent "all changes saved" indicator. | 🟡 |
| **F-X.4** | Modals are inconsistent: 3 architectural patterns ([ux-1-app-map.md](ux-1-app-map.md) §4.2). Close buttons are sometimes top-right `×`, sometimes bottom-right "Close" button, sometimes both. | 🟡 |
| **F-X.5** | Touch targets in the Header (`tb-app-tab`, `tb-page-btn`) are ~22 px tall — half the recommended 44 px. On a tablet propped up this is missable. | 🔴 |
| **F-X.6** | Emoji 🔥 / 💡 / ✓ / ⚠️ etc. used in user-facing strings against the project's no-emoji rule (12 violations identified by audit). | 🟡 (cosmetic but explicitly forbidden) |
| **F-X.7** | The teal accent (#0d9488) is used for *both* primary buttons and progress fills — when a thread happens to be teal, the colour swatch can read like an active UI state. | 🟢 |
| **F-X.8** | Resumability is good for tracking but missing for design — the Creator drops you back into the same sub-page but doesn't tell you "you were last working on the legend tab; here's what you changed". | 🟡 |
| **F-X.9** | "Help" and "Shortcuts" are separate modals. Users hunt between them when looking for "how do I undo on mobile?". | 🟢 |
| **F-X.10** | Mobile/tablet usability of the **Creator** is poor — toolbar tools collapse into an overflow `⋯` menu; many tools become invisible. The Creator is implicitly desktop-first. | 🔴 |

---

## Summary of journey health

| Journey | Critical (🔴) | Moderate (🟡) | Minor (🟢) |
|---|---|---|---|
| 1. New user first pattern | 2 | 4 | 1 |
| 2. Design from scratch | 1 | 4 | 2 |
| 3. Import & adapt | 1 | 3 | 0 |
| 4. Track progress | 2 | 3 | 0 |
| 5. Collection management | 0 | 4 | 0 |
| 6. Export & share | 0 | 3 | 1 |
| Cross-cutting | 2 | 5 | 3 |

The two most painful sequences are **first-stitch onboarding** (the user can
silently fail and not know why) and **resumability after weeks away** (the
Tracker tells you *where* you left off but not *what* you did, and the
Creator doesn't even attempt this).
