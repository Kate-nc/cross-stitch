# Competitor Analysis — Stitch Tracker

---

## 1. Pattern Keeper (Android, planned iOS)

**The gold standard for cross-stitch tracking.** $9 lifetime purchase, 500K+ downloads, overwhelmingly positive reviews. Developed by a stitcher (Åsa Falkenjack).

### Core UI Philosophy
Pattern Keeper is brutally minimal. The primary view is: **chart + legend, nothing else.** Three modes (Move, Search, Mark) are toggled via three icons in a thin top toolbar. Everything else is accessed through long-press context menus or settings cog.

### Specific Interactions Worth Borrowing

| Feature | How PK Does It | How This App Does It | Gap |
|---|---|---|---|
| **Colour highlighting** | Tap a symbol in the legend to highlight all instances on the chart. Thread number shows inline. One tap to engage, one tap to disengage. | Three-step: switch to HL mode → select colour → view. Or: tap colour in rpanel. | PK's one-tap highlight from the legend is simpler. |
| **Mark mode** | Dedicated "Mark" toggle in top bar. Tap individual stitches or **swipe/drag in any direction including diagonally** to select. Selected stitches get a purple border. Confirm button at bottom marks them done/undone. | Tap to toggle done/undone. Drag to mark multiple. No confirmation step — immediate toggle. | This app's immediate toggle is faster for small corrections but PK's batch-then-confirm model is safer for large areas. |
| **Finished stitch display** | Finished stitches are filled with the thread colour, making the chart look like the finished piece. Symbols disappear. | Dimming/strikethrough on done stitches. Highlight mode dims non-focus. | PK's colour-fill approach is more satisfying and doubles as a preview. |
| **Diagonal drag** | Users can mark stitches by swiping diagonally, following the pattern flow. | Drag only marks in the drag direction, not arbitrary diagonal. | Diagonal marking could be adopted. |
| **Thread list sidebar** | Expandable legend panel on the side that shows: thread colour, symbol, ID, count remaining (descending). Tap to highlight. Sortable by remaining count. | Right panel colour list with similar info but more UI elements (progress bar, done/total, mark-all button). | PK keeps the legend leaner. |
| **Progress display** | "Stitches finished today" and "total" shown as two numbers at the top. Percentage not prominently displayed — focus is on absolute count. | Three separate progress displays (ContextBar, progress bar, MiniStatsBar). | Over-displayed. One is enough. |
| **Settings** | Behind a cog icon. Page breaks, translucent highlights, search colour, parking colour, diagonal lines. That's it. | Settings are scattered: right panel View section, highlight mode dropdown, dim sliders, layer panel, plus toolbar toggles. | PK centralises settings. This app scatters them. |

### Things PK Does That This App Should NOT Copy
- **PDF-only input:** PK reads PDF charts — it can't create patterns. This app creates AND tracks, which is a significant advantage. Don't limit input to PDF.
- **No stats/analytics:** PK shows today's count and total. No charts, streaks, goals, sessions. This app's stats are a differentiator — but they shouldn't be in the way during tracking.
- **No half-stitch or fractional support (partial):** PK struggles with fractional stitches. This app handles halves, quarters, three-quarters — a genuine feature advantage.
- **Android-only (as of 2026):** iOS version in early development. This app's web-based approach is platform-agnostic — significant advantage.

### Key Takeaway from PK
**Simplicity is PK's brand.** The core tracking loop is: highlight a colour → mark stitches → see progress. Every interaction is one or two taps. This app should match that core-loop simplicity while keeping its power features accessible but out of the way.

---

## 2. Markup R Stitch (iOS)

**PK's closest iOS equivalent.** Similar concept: PDF chart reader with marking and highlighting capabilities.

### What It Does Well
- **iPad-optimised with split view** — chart on one side, legend on the other
- **Apple Pencil support** — precise stitch marking with stylus
- **Symbol search** — tap a symbol to find all instances, similar to PK's Search mode
- **Simple mark mode** — tap or drag to mark done
- **Minimal chrome** — one thin toolbar, majority of screen is chart

### What To Borrow
- **Split-pane for iPad:** On large tablets, a chart + legend side-by-side view is natural. This app's `rpanel` achieves this on desktop but not optimally on iPad.
- **Stylus precision:** PK and Markup both benefit from tablet stylus input. This app works with touch but doesn't distinguish stylus from finger (e.g., stylus could mark, finger could pan).

### What Not To Copy
- **iOS-only patterns:** Platform-specific gestures (Force Touch, etc.) don't translate to the web.
- **Limited customisation:** Markup has fewer view modes than this app — that's fine for Markup's audience but this app's flexibility (sym/col/highlight/isolate/tint/spotlight) is a strength.

---

## 3. Stitch Fiddle (Web)

**Closest structural analogue** — web-based, handles both creation and tracking.

### What It Does Well
- **Unified web UI** — creator and tracker in one interface, no page switching
- **Clean grid editor** — the pattern grid is the dominant element with minimal surrounding chrome
- **Simple palette panel** — colour list with click-to-select, no progress tracking per colour
- **Free tier available** — accessible to beginners

### What To Borrow
- **Unified surface concept:** Stitch Fiddle doesn't force a hard boundary between "creating" and "tracking" — it's the same canvas with different tool modes. This could inform how Creator↔Tracker transitions work in this app.
- **Canvas dominance:** Stitch Fiddle gives ~80% of screen area to the grid. This app gives ~60% on desktop and less on mobile.

### What Not To Copy
- **Limited tracking features:** Stitch Fiddle's tracking is rudimentary compared to this app — no session recording, no stats, no auto-save. Don't regress.
- **Dated visual design:** Stitch Fiddle's UI feels older. The teal/white design system in this app is more modern.
- **No mobile optimisation:** Stitch Fiddle is desktop-focused. This app's mobile-first tracker ambition is better.

---

## 4. MacStitch / WinStitch (Desktop)

**Feature-dense pattern creators.** "What not to do" reference for tracking UX.

### What They Do (Relevant to Tracking)
- **Every possible option is visible simultaneously:** Toolbars, palettes, layers, properties panels, ruler bars, status bars — all permanently displayed.
- **Multiple floating palettes/panels** that can be docked or undocked.
- **Professional-grade features:** Full stitch editing, backstitch, French knots, speciality stitches, multiple thread strands, bead placement, etc.

### The Warning
MacStitch/WinStitch are **power-user tools designed for pattern designers**, not for stitchers-while-stitching. Their UI assumes:
- A desktop with a large monitor
- Full attention (not split with needlework)
- Expert knowledge of all features

This app's tracker is trending toward MacStitch's information density, particularly in the toolbar (15+ controls) and right panel (6+ sections). The Thread Organiser section below the canvas is a MacStitch-style feature dump.

### Anti-Patterns to Avoid
- **Everything visible simultaneously:** Not every feature needs to be on-screen at all times. The tracker shows suggestions, thread usage, session stats, view controls, layers, zoom, undo, preview, and more — simultaneously.
- **Floating/undocked panels:** Web apps can't easily do floating windows. The right panel is the equivalent — and when it scrolls past the viewport (long colour list + suggestions + view settings + session + actions), the user loses context.
- **Professional density on a consumer task:** Tracking stitches is a consumer task, not a professional one. Professional density is appropriate for the Creator; consumer simplicity is appropriate for the Tracker.

---

## 5. StitchSketch (iOS)

**Handles both creation and tracking on iPad.**

### What It Does Well
- **Smooth mode transitions:** Same canvas, different tool palette. Switching from design to tracking swaps the left-side tool palette without changing the canvas or zoom level.
- **iPad-native gestures:** Pinch, rotate, Apple Pencil for precise work.
- **Minimal during tracking:** When in tracking mode, the tool palette shrinks to just: mark, unmark, navigate. All design tools disappear.

### What To Borrow
- **Context-aware tool reduction:** When entering tracking mode, StitchSketch hides all design tools. This app should similarly reduce the toolbar to only tracking-relevant controls.
- **Same canvas, different tools:** StitchSketch doesn't reload or switch pages. The same canvas, same zoom level, same scroll position is maintained. This app's HTML-per-page architecture makes this harder, but persisting zoom/scroll state would help.

### What Not To Copy
- **iPad-only:** StitchSketch is iOS/iPad only. No web equivalent.
- **Expensive:** StitchSketch is paid. This app is free.
- **Limited pattern formats:** StitchSketch uses its own format primarily.

---

## Cross-Cutting Analysis

### Feature-Bloat Problems Seen in Competitors

| Problem | Who Has It | Does This App Have It? |
|---|---|---|
| Too many toolbar items | MacStitch, WinStitch | **Yes** — 15+ items in the pill toolbar |
| Settings scattered across UI | MacStitch | **Yes** — view settings in toolbar AND right panel |
| No mobile consideration | WinStitch, Stitch Fiddle | **Partially** — touch support exists but vertical chrome is excessive |
| Dense right panel requiring scroll | MacStitch | **Yes** — rpanel sections overflow on <900px screens |
| Mode confusion (edit vs track vs view) | WinStitch | **Mild** — track/navigate/edit modes exist but are labeled |

### Features This App Has That No Competitor Matches

1. **Auto-session tracking with stats, streaks, and charts** — Pattern Keeper has basic today/total counts. This app has full session history, speed trends, goal setting, milestone celebrations.
2. **Spatial analysis and recommendations** — No competitor offers "suggested next region to stitch" based on pattern analysis.
3. **Half-stitch and fractional stitch tracking** — Pattern Keeper struggles with these. This app handles them naturally.
4. **Web-based PWA** — Runs on any device without app store installation.
5. **Built-in pattern creation** — No need for separate design software.
6. **Thread organiser with stash integration** — Cross-references project needs against owned threads.
7. **Realistic stitch preview** — Multi-quality-tier preview rendering.

The opportunity is to keep these advantages while matching PK's tracking-session simplicity.
