# User Journeys — Pattern Creator

---

## Journey 1: First-Time Pattern Creation (Mobile — Tablet)

**Persona:** Katie — crafting enthusiast who has stitched from bought patterns before but wants to create a custom pattern from a photo of her cat. Using a 10" iPad. No prior experience with this app.

### Step by step

**1. Landing (0:00)**
Katie opens the PWA. The home screen loads with a hero section explaining the three capabilities (Create, Track, Manage). She taps "Create a Pattern". The creator page loads.

→ **What she sees:** Header (48px) + an empty workspace with a large "Upload an image or start from scratch" prompt in the canvas area. The right panel (sidebar) shows generation controls but they're all disabled/greyed because there's no image yet.
→ **Good:** Clear first action — the upload prompt is unmissable.
→ **Confusing:** The sidebar shows 7 collapsible sections with unfamiliar terms (Stitch Cleanup, Orphan Removal, Dithering). She doesn't know what any of this means yet.

**2. Uploading an image (0:15)**
She taps the upload area and selects a photo from her camera roll. The image appears in the Image Card section of the sidebar. The canvas shows a comparison slider with the original image on the left.

→ **What she touches:** File picker, then "Generate" button at the bottom of the sidebar.
→ **Pain point (mobile):** The sidebar is a full-height panel on the right. On a 10" iPad in portrait (768px width), the sidebar is 280px and the canvas is 488px. She can see both, but the sidebar dominates for what should be a canvas-centric task. On a phone (375px), the sidebar collapses to the bottom drawer — she has to open the drawer to find the Generate button.
→ **What she never adjusts:** Stitch Cleanup settings, Fabric & Floss, Adjustments sliders. She doesn't know what these do and wants to use defaults.

**3. First generation (0:45)**
She taps "Generate Pattern" with defaults (80×80, 30 colours, 14-count Aida). A spinner appears. After 2-3 seconds, the pattern renders on the canvas. The swatch strip appears above the canvas. The comparison slider shows source vs pattern.

→ **What she sees:** Header (48px) + ContextBar (36px) + ToolStrip pill row (52px) + Swatch strip (36px) = 172px chrome before the canvas. On her iPad (1024px portrait), she still has ~852px — comfortable.
→ **First reaction:** "It looks pixelated" — she expected more detail. The 80×80 grid at 14-count is ~14.5cm, which she doesn't realise yet.
→ **What helps:** The comparison slider lets her see source vs output side-by-side. This is great for first-time users.
→ **What she doesn't notice:** The toolbar buttons are all still unfamiliar. She doesn't know what the wand, lasso, or diagnostics icons mean.

**4. Adjusting (1:00–3:00)**
She wants more colours and a bigger pattern. She scrolls the sidebar to find "Dimensions" and increases to 120×120. She finds "Max Colours" and bumps it to 40. She taps "Regenerate".

→ **What she touches:** Sidebar scroll, slider controls, Regenerate button.
→ **Pain point (mobile drawer):** On a phone, she has to open the bottom drawer, scroll through 7 sections to find the right sliders, adjust, then scroll to the bottom for Regenerate. Then the drawer covers the canvas, so she can't see the result until she dismisses it.
→ **What works well (desktop/tablet):** With the sidebar always visible, the adjust→regenerate→preview loop is tight and responsive.

**5. Happy with result (3:00)**
The pattern looks good. She wants to save it. She's asked to name the project. She types "Mr Whiskers" and saves.

→ **What she touches:** Save (Ctrl+S on desktop, or File menu, or ContextBar Save button). Name prompt modal appears.
→ **Pain point:** Three different save triggers — not confusing for first-timers (they'll find one), but the duplication is unnecessary.

**6. Exploring export (4:00)**
She taps the "Export" tab in the sidebar. She sees "Open in Stitch Tracker" and "Download Pattern PDF". She downloads the PDF to print.

→ **What works well:** Export tab is discoverable and the primary action (PDF) is prominent.
→ **What she doesn't explore:** PNG chart, JSON save/load, cover sheet. These are advanced features she doesn't need yet.

### Summary: First-time creation (mobile)
- **Touched frequently:** Upload, Generate/Regenerate, Dimensions slider, Colour slider
- **Touched once:** Export tab, Save, Name prompt
- **Never touched:** Brush/Fill/Erase tools, Selection tools, Diagnostics, Split View, Preview modes, Stitch Cleanup, Adjustments, Background, Palette Swap, Thread Organiser, Backstitch, Partial stitches, Highlight modes
- **In the way:** 7 unfamiliar sidebar sections visible by default; ContextBar adds chrome without first-timer value; mobile drawer hides both Generate button and canvas simultaneously
- **Missing:** A "quick start" flow that shows only Image → Dimensions → Colours → Generate, with advanced sections hidden until explicitly revealed

---

## Journey 2: Iterative Pattern Editing (Desktop)

**Persona:** An experienced pattern designer working on a complex 200×180 floral design with 35 colours including backstitch border and blended threads. Using a 27" 1440p monitor with keyboard. Spending 2+ hours refining.

### Step by step

**1. Opening (0:00)**
Opens the browser, loads the app, continues their in-progress "Victorian Roses" project from the home screen.

→ **Chrome:** 172px on a 1440p monitor (1440px viewport height) leaves 1268px for canvas+sidebar. Canvas area: 1268px × (1920-280) = 1268px × 1640px. Extremely comfortable.
→ **All controls visible:** Toolbar, swatch strip, sidebar all render without scrolling. This is the ideal desktop experience.

**2. Colour editing loop (0:05–0:45)**
The designer selects a colour from the swatch strip, switches between Paint (P) and Fill (F) using keyboard shortcuts, and edits individual cells. They use Brush Size 2 for larger areas, toggle back to 1 for precision. They periodically undo (Ctrl+Z) mistakes.

→ **What they touch:** Swatch strip (click colour), Canvas (paint/fill), Keyboard (P/F/I/Ctrl+Z/+/−/0).
→ **Frequency:** Hundreds of interactions, all at canvas level or swatch strip. The toolbar is used via keyboard, not clicks.
→ **What works well:** Keyboard shortcuts for tools are excellent. Swatch strip provides quick colour selection without leaving the canvas area. Alt+click eyedropper is a power-user delight.
→ **Pain point:** When cycling between 35 colours, the swatch strip shows only 20 by default. They must expand it, which still requires scanning the strip. The sidebar palette chips provide an alternative with DMC IDs, but require moving the eye off the canvas.

**3. Backstitch work (0:45–1:15)**
The designer switches to backstitch mode (press 4), enables "Continuous" mode, and draws outline strokes around flower petals. They zoom in (+ key) for precision.

→ **What they touch:** Keyboard (4 for backstitch tool, + to zoom), Canvas (click endpoints). Continuous checkbox appears in the toolbar — they toggle it once.
→ **Good:** Continuous backstitch mode is a significant quality-of-life feature. The snap-to-grid behaviour makes precise line placement easy.
→ **Pain point:** The backstitch start/end feedback is subtle — a stronger visual indicator of the current anchor point would help.

**4. Selection operations (1:15–1:30)**
The designer notices confetti in a background area. They select the Magic Wand (W), set tolerance to 5, and click to select the noisy region. The Magic Wand panel appears with operation buttons. They click "Confetti Cleanup", set min cluster to 3, preview, then apply.

→ **What they touch:** Keyboard (W), Canvas (click to select), Magic Wand floating panel (tolerance slider, confetti button, cluster slider, apply).
→ **Good:** The Magic Wand + operations panel is a powerful editing pipeline. Tolerance + preview + apply is professional-grade.
→ **Pain point:** The floating panel can overlap with the canvas area, especially when the selection is in the same region. No way to reposition it.

**5. Quality check (1:30–1:40)**
The designer clicks the Diagnostics button to check confetti score and readability. They toggle on the readability diagnostic, note two colour pairs with poor contrast, and use Replace Colour (via wand panel) to swap one of them.

→ **What they touch:** Diagnostics button (toolbar), toggle switches in diagnostics panel, then back to wand for colour replace.
→ **Good:** Diagnostics → Identify problem → Fix via selection tools is a coherent workflow. All tools are accessible without page switches.
→ **Observation:** This workflow bounces between: toolbar button → floating panel → another toolbar tool → different floating panel. The tools are there but the user's attention ping-pongs across the screen.

**6. Preview check (1:40–1:50)**
The designer clicks the Preview dropdown, switches to Realistic Level 3, and inspects how the pattern looks with thread textures. They adjust thread coverage to "Dense" preset.

→ **What they touch:** Preview dropdown (toolbar), Realistic level radio buttons, coverage preset buttons.
→ **Pain point:** Coverage controls are nested inside the Preview dropdown which itself is a mega-menu. Finding Realistic → Level 3 → Coverage → Dense preset requires 4 clicks in a dropdown that closes if they misclick outside.

**7. Split view comparison (1:50–2:00)**
The designer presses `\` to enter split view, seeing chart + realistic preview side-by-side. They scroll the chart and the preview follows via scroll sync.

→ **Good:** Split view + sync scroll is an excellent workflow for verifying the pattern looks right.
→ **Pain point:** On narrower desktops (<1200px), the split pane leaves little space per pane when the sidebar takes 280px. At <560px each pane, wide mode switches to stacked (vertical) — but with sidebar, the switch happens at ~840px total width.

**8. Export (2:00)**
The designer switches to the Export tab, configures PDF (Colour+Symbols, Medium cells), downloads, then JSON-saves the project.

→ **Straightforward.** Export tab is well-organised for this.

### Summary: Iterative editing (desktop)
- **Touched constantly:** Canvas, Swatch strip, Keyboard shortcuts (P/F/I/W/4/V/+/−/0/Ctrl+Z)
- **Touched frequently:** Paint/Fill toggle, Brush size, Colour selection, Zoom, Undo
- **Touched occasionally:** Magic Wand + operations, Backstitch tools, Preview, Split View, Diagnostics
- **Touched once:** Export tab, Save, Dimensions, Generation settings
- **Never touched in this session:** Palette Swap, Stitch Cleanup sliders, Adjustments, Background, Thread Organiser, Lasso tools, Highlight modes (used more in tracker)
- **Good:** Keyboard shortcuts support the power workflow excellently. Tool variety covers all editing needs.
- **Friction:** Preview settings are too deeply nested. Floating panels can overlap. 35-colour swatch strip needs better navigation.

---

## Journey 3: Mobile Pattern Creation — Quick Project

**Persona:** A stitcher on a train with 15 minutes, wanting to quickly convert a simple logo into a pattern on their phone (375px wide, portrait).

### Step by step

**1. Upload (0:00)**
Opens the PWA on their phone. Taps "Create" in the header. Gets the empty workspace. The sidebar is collapsed to a 44px bottom drawer tab bar. They can't see the Generate button or any settings.

→ **Problem:** How do they upload? The canvas area shows the upload prompt, which works. But after uploading, the Generate button is in the drawer — they need to discover that tapping the drawer tabs reveals it.
→ **Discovery:** They tap the "Pattern" tab at the bottom, the drawer slides up to 55dvh (showing ~55% of screen). They can see the image card, dimensions, palette controls, and Generate button.
→ **Canvas hidden:** With the drawer open, only 45% of the screen shows the canvas. On a 667px phone, that's ~300px.

**2. Generate (0:30)**
They keep defaults and tap "Generate". The drawer stays open. They need to dismiss it to see the pattern.

→ **Pain point:** No auto-dismiss of drawer after Generate. The user must swipe down or tap outside. First-time users may not know this.

**3. Review result (0:45)**
With the drawer collapsed (44px at bottom), the canvas area is: 667px − 48px (header) − 36px (context bar) − 52px (pill row) − 36px (swatch strip) − 44px (drawer tab bar) = **451px**. This is workable.

→ **Problem:** The pill toolbar has ~15 buttons in a scrollable row. The user can see maybe 8 on a 375px screen. They don't know there are more tools off-screen to the right (no scroll indicator).

**4. Quick edit (1:00–5:00)**
They want to clean up a few cells. They tap a colour in the swatch strip (which scrolls horizontally), then tap cells on the canvas. Pinch to zoom, single-finger drag to pan.

→ **Good:** Basic paint workflow works. Touch interactions are functional.
→ **Pain point:** Undo requires reaching the floating FAB button (bottom-right, above the drawer). It's functional but always present even when not needed.

**5. Save and export (5:00)**
They open the drawer, switch to the Export tab, tap "Download PDF". Done.

→ **Works.** The drawer-based export is fine for this quick workflow.

### Summary: Quick mobile creation
- **Touched:** Upload, Generate, Swatch strip, Canvas (paint), Drawer tabs, Export
- **Pain points:** Drawer doesn't auto-dismiss after Generate; toolbar scrolls off-screen without hints; 216px of chrome on mobile is heavy for phone screens
- **Good:** Core create→export loop works in under 5 minutes

---

## Journey 4: Creator → Tracker Transition

**Persona:** A user who has just finished creating their pattern and wants to start tracking progress in the stitch tracker.

### Step by step

**1. Starting point**
Pattern is open in the Creator, last edits saved. They want to start stitching.

**2. Finding the transition**
Two paths available:
- **Export tab → "Open in Stitch Tracker"** (green primary button) — the intended path
- **ContextBar → "Track ›"** button — duplicate path
- **Header → "Track" tab** — navigates to the general tracker page, not necessarily this project

→ **Confusion risk:** Three different "go to tracker" affordances, each subtly different. The Export tab button and ContextBar button do the same thing (serialise + handoff). The Header tab just navigates without project context.

**3. Handoff mechanism**
On click, the project is serialised to JSON. For small patterns (< URL length limit), it's pako-compressed into a URL hash parameter. For larger patterns, it's passed via `localStorage`. The browser navigates to `stitch.html`.

→ **Good:** Seamless — the tracker loads with the pattern ready to go.
→ **Gap:** No confirmation dialog ("Open in Tracker? Unsaved changes will be lost."). If the user has unsaved edits, they silently transfer.
→ **Gap:** After opening in the tracker, there's no obvious way to return to the creator and resume editing. The Header "Create" tab re-opens the creator but may load the home screen instead of the in-progress pattern.

**4. In the tracker**
The tracker loads with the pattern. The user can immediately start marking stitches.

→ **Good:** Zero-friction transition for the pattern data.
→ **Gap:** Creator-specific features (backstitch lines, partial stitches) transfer, but the tracker's editing capabilities for these are limited. If the user needs to fix something, they must go back to the Creator.

### Summary: Creator → Tracker
- **Works well:** Data handoff is seamless, pattern appears correctly in tracker
- **Friction:** Three different navigation paths cause confusion. No unsaved-changes warning. Return path to creator is unclear.

---

## Journey 5: Scratch Mode (Blank Grid)

**Persona:** An experienced designer who wants to create a pattern from scratch without an image — drawing directly on a grid.

### Step by step

**1. Starting scratch mode**
From the home screen, they choose "Start from scratch" (or create new → scratch option). This creates an empty grid at a specified size.

→ **Difference from image flow:** No source image, no comparison slider, no generation settings (Adjustments, Background, Stitch Cleanup are irrelevant). The sidebar should simplify — but it doesn't fully.

**2. Building palette**
They need to add DMC colours manually. In the sidebar, the Palette Chips section transforms: shows a DMC search input and an "Add" button. They search "310", add it, search "321", add it, etc.

→ **Good:** DMC search with fuzzy matching works well.
→ **Pain point:** Adding colours one at a time is tedious for a 20+ palette. No "import palette" or "paste DMC list" option.

**3. Drawing**
They select colours from the palette chips and draw on the grid using Paint and Fill tools. Backstitch is added for outlines.

→ **Same as Journey 2 editing workflow.** All canvas tools work identically in scratch mode.

**4. Export**
Standard export via Export tab — PDF, PNG, JSON, or open in Tracker.

### Summary: Scratch mode
- **Works:** All editing tools function
- **Waste:** 7 sidebar generation sections (Dimensions, Palette generation, Stitch Cleanup, Fabric, Adjustments, Background, Palette Swap) are mostly irrelevant in scratch mode but still visible. Only Dimensions and Fabric matter.
- **Missing:** Bulk palette import, template grids, ruler guides

---

*End of User Journeys*
