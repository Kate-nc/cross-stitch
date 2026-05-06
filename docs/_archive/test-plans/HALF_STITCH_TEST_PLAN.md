# Half Stitch Feature — Comprehensive Test Plan

## Files Modified
- `helpers.js` — Added 5 drawing/hit-test helper functions
- `tracker-app.js` — Half stitch state, rendering, toolbar, interactions, save/load (v9), legend, onboarding, disambiguation
- `creator-app.js` — Half stitch state, toolbar, rendering, placement, save/load (v9)
- `styles.css` — Animation keyframes (scale-in, fade-out, flash, badge-pulse)

---

## Part 1: Rendering (Tracker — stitch.html)

### 1.1 Triangle Tint Fill
- [ ] Open a project in the tracker
- [ ] Select the `/` half stitch tool from the toolbar
- [ ] Place a half stitch on a cell — **verify** a coloured triangle tint appears in the bottom-left triangle of the cell
- [ ] Select the `\` tool and place on a different cell — **verify** triangle tint appears in the top-left triangle
- [ ] **Verify** the triangle tint is a low-opacity fill (≈12% alpha) of the stitch colour

### 1.2 Diagonal Line
- [ ] Zoom in past ~40% — **verify** a diagonal line appears across the half stitch, matching the stitch colour
- [ ] Zoom below ~40% — **verify** only the triangle tint is visible (no line)
- [ ] Zoom past ~80% — **verify** the symbol appears at the triangle centroid

### 1.3 View Modes
- [ ] Switch to **Symbol** view — **verify** half stitches show triangle + symbol in correct triangle position
- [ ] Switch to **Colour** view — **verify** half stitches show triangle tint + line
- [ ] Switch to **Highlight** view, highlight a colour — **verify** half stitches of that colour are bright, others are dimmed (4% alpha)

### 1.4 Tracker States
- [ ] Place a half stitch, do NOT mark it done — **verify** it shows with faded opacity (6% triangle, ~25-30% line)
- [ ] Mark the half stitch done by tapping it (no tool active) — **verify** it brightens (40% triangle, full opacity line)
- [ ] **Both states visible**: Have marked and unmarked half stitches on screen — **verify** clear visual difference

### 1.5 Mixed Cell (Full + Half)
- [ ] Place a `/` half stitch on a cell that already has a full stitch — **verify** the full stitch renders normally and the triangle overlays only the relevant half
- [ ] Place both `/` and `\` on the same cell — **verify** two separate triangles visible without overlapping incorrectly

### 1.6 Skip/Empty Cells
- [ ] Place a half stitch on a cell that has the `__skip__` checkerboard pattern — **verify** the half stitch triangle renders ON TOP of the checkerboard (since half stitches are on skip cells too if the data model allows)
- [ ] Place a half stitch on an `__empty__` cell — **verify** it renders correctly

---

## Part 2: Toolbar UI (Tracker)

### 2.1 Button Appearance
- [ ] Open the tracker toolbar — **verify** three new buttons appear: `/` (forward slash SVG), `\` (backslash SVG), and eraser (X with horizontal line SVG)
- [ ] **Verify** the buttons are in a group, separated from existing tools by a divider
- [ ] **Verify** each button is approximately 36×28px with rounded corners

### 2.2 Active States
- [ ] Click the `/` button — **verify** it highlights with blue/teal border and background
- [ ] Click the `\` button — **verify** the `/` deselects and `\` highlights
- [ ] Click the eraser button — **verify** it highlights with red tones
- [ ] Click the same active button again — **verify** it deselects (toggles off)

### 2.3 "New" Badge
- [ ] Before placing any half stitch in a session — **verify** small coloured dots appear on the `/` and `\` buttons
- [ ] Place your first half stitch — **verify** the dots disappear and don't come back

### 2.4 Tool Active Hint
- [ ] Select the `/` tool — **verify** a blue info banner appears below the toolbar: "Half stitch / tool active — using cell colour · Click to place, click again to remove"
- [ ] Select a colour from the palette, then select the tool — **verify** the hint says "using DMC [id]"
- [ ] Select the eraser — **verify** the hint disappears (eraser doesn't show the placement hint)

---

## Part 3: Contextual Guidance (Tracker)

### 3.1 Onboarding Walkthrough
- [ ] Click a half stitch tool for the first time — **verify** a 3-step blue walkthrough panel appears
- [ ] Step 1: "Select a half stitch direction — / or \" — **verify** "Next →" button
- [ ] Click Next — Step 2: "Tap a cell to place. The coloured triangle shows which half is covered." — **verify** "Next →" button
- [ ] Click Next — Step 3: "Tap again to remove. You can place both directions in one cell." — **verify** "Got it" button
- [ ] Click "Got it" — **verify** the walkthrough dismisses permanently for the session
- [ ] Click the tool again — **verify** the walkthrough does NOT reappear

### 3.2 Same-Colour Toast
- [ ] Place a `/` half stitch using colour DMC 310 on a cell
- [ ] Place a `\` half stitch using the SAME colour DMC 310 on the SAME cell
- [ ] **Verify** a warning toast appears: suggesting to convert to a full cross
- [ ] Click "Convert" — **verify** both halves are removed (the full stitch remains)
- [ ] Repeat and click "Keep" — **verify** both halves remain as-is

### 3.3 Disambiguation Popup
- [ ] Place both `/` and `\` on the same cell with no tool active (tracker mode)
- [ ] Tap the CENTER of that cell — **verify** a popup appears with two buttons: "Mark /" and "Mark \"
- [ ] Each button should have a small triangle SVG icon
- [ ] Click "Mark /" — **verify** the `/` half stitch toggles done state
- [ ] Tap near the bottom-left corner of the cell — **verify** it directly marks the `/` half (no popup, hit test determines direction)
- [ ] Tap near the top-left corner — **verify** it directly marks the `\` half

---

## Part 4: Legend/Stats Updates (Tracker)

### 4.1 Progress Bar
- [ ] Place some half stitches — **verify** the top progress bar percentage updates
- [ ] **Verify** half stitches count as 0.5× weight toward total progress
- [ ] **Verify** the stats display shows separate counts, e.g., "X/Y full · A/B half"

### 4.2 Colour Drawer
- [ ] Open the colour drawer — **verify** each colour row shows half stitch counts if that colour has half stitches
- [ ] The format should show: `done/total +halfDone△/halfTotal△` in blue
- [ ] **Verify** per-colour progress bars account for half stitches (weighted at 0.5×)
- [ ] **Verify** the "All ✓" button correctly checks completion including half stitches
- [ ] In edit mode — **verify** colours show stitch count + half stitch count: "X st + Y△"

### 4.3 Half Stitch Tool + Colour Selection
- [ ] Select a half stitch tool (/ or \) — **verify** clicking a colour in the drawer sets `selectedColorId`
- [ ] **Verify** the selected colour indicator appears in the toolbar area

---

## Part 5: Tracker Marking Interactions

### 5.1 Placement
- [ ] Select `/` tool, tap a cell — **verify** a half stitch appears with triangle + line
- [ ] Tap the same cell again — **verify** the half stitch is removed (toggle)
- [ ] Select `\` tool, tap a cell that already has a `/` half — **verify** the `\` is added alongside, creating a two-half cell

### 5.2 Eraser
- [ ] Select the eraser tool
- [ ] Tap a cell with half stitches — **verify** ALL half stitches on that cell are removed (both / and \)
- [ ] Tap a cell with no half stitches — **verify** nothing happens

### 5.3 Done Marking (No Tool Active)
- [ ] Deselect all tools
- [ ] Tap a cell with a single half stitch — **verify** it toggles the done state (brightens/dims)
- [ ] Tap a cell with two half stitches — **verify** hit testing: corner taps mark the relevant half, center taps show disambiguation popup

### 5.4 Mixed Full + Half Cell
- [ ] Place a half stitch on a cell with a full stitch
- [ ] With no tool active, tap the cell — **verify** the full stitch done state toggles (half stitches are independently tracked)
- [ ] With no tool active, and the full stitch already done, tap a cell that has a half stitch — **verify** the half stitch toggles done

---

## Part 6: Save/Load

### 6.1 Save Format
- [ ] Place several half stitches in the tracker
- [ ] Save the project (manual save to JSON)
- [ ] Open the JSON file — **verify** `version: 9`, `halfStitches` array present, `halfDone` array present
- [ ] **Verify** halfStitches format: `[[idx, {fwd: {id, rgb}, bck: {id, rgb}}], ...]`

### 6.2 Load
- [ ] Close and reopen the tracker — **verify** half stitches are auto-restored from IndexedDB
- [ ] Load the saved JSON file — **verify** half stitches appear correctly with same positions and colours
- [ ] **Verify** done states are preserved for half stitches

### 6.3 Backward Compatibility
- [ ] Load a project saved with version 7 or 8 (no halfStitches key) — **verify** it loads normally with empty half stitch state
- [ ] **Verify** no errors in the console

---

## Part 7: Creator App (index.html)

### 7.1 Toolbar
- [ ] Open the creator with a generated pattern
- [ ] **Verify** three half stitch buttons (/, \, eraser) appear in the tools row, after Fill and before the undo area
- [ ] **Verify** a vertical divider separates them from the Paint/Fill buttons

### 7.2 Placement
- [ ] Select the `/` tool
- [ ] Select a colour from the palette strip — **verify** it highlights with teal border
- [ ] Click a cell — **verify** a half stitch triangle appears
- [ ] Click the same cell again — **verify** the half stitch is removed
- [ ] With no colour selected, click a cell — **verify** the cell's own full stitch colour is used

### 7.3 Eraser
- [ ] Select the half stitch eraser
- [ ] Click a cell with half stitches — **verify** all halves are cleared from that cell

### 7.4 Rendering
- [ ] **Verify** half stitches render in all view modes: Colour, Symbol, Both
- [ ] In Symbol/Both mode — **verify** half stitch symbols appear at triangle centroid position
- [ ] With a colour highlighted — **verify** half stitches of other colours dim, matching half stitches stay bright

### 7.5 Save/Load in Creator
- [ ] Save a project with half stitches from the creator
- [ ] Reload — **verify** half stitches are restored from auto-save
- [ ] Load from JSON — **verify** half stitches restored
- [ ] Click "Track" to open in tracker — **verify** half stitches transfer correctly

### 7.6 Tool Interaction
- [ ] Select Paint tool, then select `/` tool — **verify** Paint deselects
- [ ] Select `/` tool, then select Paint tool — **verify** `/` deselects
- [ ] Only one tool class (regular or half stitch) should be active at a time

---

## Part 8: Animations

### 8.1 Scale-In
- [ ] Trigger the onboarding walkthrough — **verify** it animates in with a subtle scale effect (150ms)
- [ ] Trigger the disambiguation popup — **verify** scale-in animation

### 8.2 Toast Animation
- [ ] Trigger the same-colour toast — **verify** it animates in with scale effect

---

## Part 9: Edge Cases

### 9.1 Zoom Extremes
- [ ] Zoom to minimum (5%) — **verify** half stitch triangles are still visible as tiny coloured areas
- [ ] Zoom to maximum (300%) — **verify** triangles, lines, and symbols all render cleanly

### 9.2 Large Pattern
- [ ] Open a large pattern (200×200+) — **verify** half stitches render without significant performance lag
- [ ] Scroll rapidly — **verify** viewport culling works (half stitches outside viewport are not drawn)

### 9.3 Rapid Tool Switching
- [ ] Quickly alternate between /, \, and eraser — **verify** no state corruption
- [ ] Place half stitches while rapidly switching — **verify** correct directions are placed

### 9.4 Empty State
- [ ] Open a project with no half stitches — **verify** no errors, toolbar works, legend shows 0 half counts only when relevant (no "0△" clutter)
- [ ] **Verify** progress calculation works correctly with 0 half stitches

### 9.5 Regenerate Pattern (Creator)
- [ ] Place half stitches in the creator, then click "Regenerate" — **verify** half stitches survive if pat[] structure doesn't change, or gracefully clear if it does

---

## Part 10: Console Error Check
- [ ] Open browser DevTools console
- [ ] Perform all major operations (place, mark, save, load, switch views, zoom)
- [ ] **Verify** no JavaScript errors or warnings related to half stitch functionality
- [ ] **Verify** no React key warnings or state update warnings
