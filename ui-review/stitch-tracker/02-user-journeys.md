# User Journeys — Stitch Tracker

---

## Journey 1: Mobile Tracking Session

**Persona:** Katie — experienced cross-stitcher, tracking an 80×80 pattern at ~50% completion. Using a 10" tablet propped on a stand beside her stitching frame. One hand holds the needle; one hand operates the tablet. Session length: 30 minutes.

### Step by step

**1. Opening (0:00)**
Katie taps the PWA icon. The home screen loads. Her active project appears as the hero card with a thumbnail and "Continue" button. She taps Continue.

→ **What she touches:** One tap on hero card or Continue button.
→ **What's in the way:** Nothing — the home screen is clean for this case.
→ **What she never uses:** The "Start New" panel, format list. These are invisible because her project exists.

**2. Loading into tracker (0:05)**
The tracker loads. She sees: Header (48px) + ContextBar (~44px) + Pill Toolbar (52px) + Progress Bar (~34px) + MiniStatsBar (~48px) = **~226px of chrome** before the canvas. On her 10" tablet (800px portrait viewport), she has ~574px for the canvas.

→ **Immediate reaction:** Wants to see the canvas. The MiniStatsBar and ContextBar feel redundant — she can see her progress % in the progress bar. She's already oriented from the home screen.
→ **What draws the eye but she doesn't need:** ContextBar metadata (dimensions, palette count), MiniStatsBar streak/today count (she hasn't started yet).

**3. Getting oriented (0:10)**
She's in highlight mode from last session (state persisted). She sees DMC 310 (black) highlighted. Her last area of work is off-screen, so she pinch-zooms out, spots where she was (coloured stitches show her progress), then pinch-zooms back in and pans to the right area.

→ **What she touches:** Two-finger pinch, one-finger drag. Zero toolbar interactions.
→ **What's not great:** The canvas `maxHeight` is capped at 600px via inline style. On tablet this may clip.
→ **Good:** Pinch and drag work well. Highlight mode from last session is correctly persisted.

**4. Marking stitches (0:15–25:00)**
She taps individual cells on the pattern grid. Each tap toggles the `done` state. She's working through a row of black stitches. Tap, tap, tap. When she completes a section, she drags across 3–4 cells at once.

→ **What she touches:** Canvas cells. Only the canvas.
→ **Interaction quality:** Good. Single taps are responsive; the canvas redraws incrementally (`drawCellDirectly`). Drag marking works for horizontal/vertical runs.
→ **Pain point:** When she mistaps, she wants to undo. The undo button (↩) is in the toolbar — she has to reach up to the top of the screen. On a propped tablet, this is awkward. She'd prefer a floating "undo" bubble or a shake-to-undo gesture.
→ **What she never uses during this phase:** Everything in the toolbar except maybe ◀/▶ colour cycling. The right panel (if visible) is off-screen or behind the canvas on mobile. View toggles, zoom buttons, layers, thread usage, preview — none of these are touched.

**5. Switching colours (×3 during session)**
She finishes a patch of black and moves to DMC 321 (red). She taps ▶ in the toolbar to advance to the next unfinished colour.

→ **What she touches:** One tap on ▶ arrow (or swipe gesture if Pattern-Keeper-style was available).
→ **Pain point:** The ▶ button is small (minimum 44px thanks to `pointer: coarse` rule, but finding it in the toolbar requires visual scanning). She'd prefer larger carousel arrows or a swipe gesture on the canvas to cycle.
→ **What works well:** The canvas immediately dims non-focused colours. The colour swatch + ID in the toolbar confirms the switch.

**6. Pausing (15:00)**
She puts down the needle to answer the phone. After 10 minutes of inactivity, the session auto-pauses (IDLE_THRESHOLD_MS = 10 minutes). When she returns, the chip shows "⏸ Idle".

→ **What she touches:** Nothing — auto-pause is automatic. Good.
→ **Pain point:** 10 minutes is long. She may want to manually pause. The only way is to tap the session chip in the toolbar — but it's a tiny target and the interaction model (tap to pause, tap to resume) isn't obvious.

**7. Finishing (30:00)**
She's satisfied with the session. She doesn't explicitly "stop" — she navigates away or closes the tab. The `beforeunload` handler and visibility-change handler save the session.

→ **What she touches:** Home button or back gesture.
→ **What pops up:** Session saved toast with "Add note" button. This is a good touch — but on mobile the toast may be clipped or hard to reach.

**8. After session**
She wants to see her stats. She taps the 📊 button in MiniStatsBar. The full stats dashboard replaces the canvas. She sees today's stitches, streak, pace.

→ **Pain point:** The stats dashboard is desktop-optimised. Charts render fullwidth but the timeline and goal panels are cramped on 10" tablets.

### Summary: Mobile tracking session
- **Touched frequently:** Canvas (tapping stitches), ◀/▶ colour cycle
- **Touched occasionally:** Zoom (pinch gesture), undo, stats button
- **Never touched:** Half stitch tools, layer panel, thread usage, preview, view toggles, zoom slider, navigate mode, range mode, edit mode, thread organiser, project info, save button (auto-saves), load button
- **In the way:** ContextBar (redundant info), MiniStatsBar (takes vertical space), contextual banners (up to 3 stacking)
- **Missing:** Floating undo, swipe-to-cycle-colours, manual pause that's easy to reach

---

## Journey 2: Desktop Tracking Session

**Persona:** Same user, now at a desktop with a 27" monitor, mouse, and keyboard. Same project.

### Step by step

**1. Opening**
Opens the browser bookmark. Home screen loads, clicks "Continue" on the active project.

**2. Tracker loads**
226px of chrome, but on a 1080p monitor she has ~850px for the canvas + right panel. The right panel takes 280px, leaving 720px for the canvas. Comfortable.

**3. Getting oriented**
She scrolls the mouse wheel to zoom (handled by `handleStitchWheel`), then drags to pan. Or uses Ctrl+scroll. Or uses keyboard: `0` to fit, then `+` to zoom.

→ **Works well.** Keyboard shortcuts are rich and well-mapped.

**4. Marking stitches**
Click to mark. Click-drag to mark multiple. Shift+click for rectangle fill.

→ **Desktop advantage:** Precise cursor, rectangle fill with Shift+click, keyboard undo (Ctrl+Z).
→ **Right panel visible:** She can see the colour list, session card, and view settings simultaneously. This is where the 280px panel earns its keep.

**5. Highlight workflow**
She presses `V` to enter highlight mode, then `]` and `[` to cycle colours. She doesn't need to leave the keyboard.

→ **Excellent keyboard UX.** This is where the tracker shines on desktop.

**6. Quick reference**
She hovers over a stitch — the status bar at the bottom shows "Row 34, Col 12 — DMC 310 Black". Useful for cross-referencing with her physical chart.

**7. Session management**
Identical to mobile — auto-tracks, auto-pauses on inactivity. The session chip in the toolbar is more visible on desktop (more horizontal space, less crowding).

### Summary: Desktop tracking session
- **Touched frequently:** Canvas, keyboard shortcuts, right panel colour list
- **Touched occasionally:** View toggles (keyboard), zoom (keyboard/wheel), stats
- **Never touched:** Half-stitch tools, thread usage, preview, most toolbar buttons
- **Works well:** Keyboard workflow, right panel layout, status bar hover info
- **Could improve:** Right panel has too many sections for the panel height — requires scrolling to reach colours past the Suggestions and Session sections.

---

## Journey 3: First-Time Tracking Session

**Persona:** New user who just created their first pattern in the Creator and wants to track it.

### Step by step

**1. Transition from Creator**
She's in the Pattern Creator, just finished adjusting a pattern. She clicks "Track" in the Header or ContextBar.

→ **What happens:** The tracker loads with the active project. Same pattern, zero progress.
→ **Confusing:** The URL changes to `stitch.html` — on some browsers this triggers a full page reload losing Creator state. If using the home-screen routing (SPA mode), it's smoother.

**2. First impression**
She sees: the toolbar with ~15 controls she's never seen, a progress bar at 0%, an empty canvas with symbols, a right panel with sections.

→ **Overwhelming:** The toolbar contains Cross, Half▾, Nav, ⊞Range, Sym, Col+Sym, HL, ◀, ▶, zoom controls, session chip, eye icon, globe icon, undo/redo, Layers — all at once. Some are contextually hidden, but she still sees ~12 buttons on first load.
→ **Not overwhelming:** The contextual banner says "Tap any stitch on the canvas to mark it as done" — this is the single most important instruction and it's correctly present.

**3. First interaction**
She (hopefully) follows the hint and clicks a stitch. It marks as done. A second click unmarks it. The progress bar updates. The session auto-starts. The onboarding toast appears: "Sessions are tracked automatically as you stitch."

→ **What works:** Progressive disclosure. The first-use hints guide her.
→ **What confuses:** Why are there two sets of view buttons? (Toolbar has Sym/Col/HL; right panel has Symbol/Colour/Highlight.) Are they different? (No, they're duplicates.)
→ **What she doesn't understand yet:** Highlight mode. Range mode. Half stitches. Navigate mode. Thread usage. These are all power features she'll discover later — but their buttons are visible and potentially intimidating.

**4. Exploration**
She clicks around the toolbar trying things. Clicks "Nav" — her clicks stop marking stitches and instead place crosshair guides. Confusing — she clicks "Cross" to go back. Clicks "HL" — the pattern dims except one colour. She doesn't know what happened and clicks "Sym" to restore normality.

→ **Muscle memory break from Creator:** In the Creator, the toolbar has different tools (paint, fill, select). There's no direct equivalent of "track mode" vs "navigate mode" — the Creator's mode is always editing. The concept of mode-switching is new.

**5. Discovering stats**
After 30 minutes she sees the MiniStatsBar showing "Today: 45" and "🔥 Streak: 1". She clicks "📊" and sees the full stats dashboard. She's delighted — but doesn't know how to get back to the canvas. The close button for stats is a small "×" in the corner.

→ **Discoverability challenge:** Getting INTO stats is easy (prominent button). Getting OUT is less obvious.

### Summary: First-time session
- **Key confusion points:** Mode switching (track vs navigate), duplicate view toggles, too many toolbar items, Creator→Tracker transition
- **Key delights:** Auto-session tracking, first-stitch hint, progressive onboarding
- **What would help:** A "beginner mode" or progressive toolbar that reveals features as needed; a clearer Creator↔Tracker transition animation/explanation

---

## Journey 4: Switching Between Creator and Tracker

**Persona:** User editing a pattern in the Creator and periodically checking progress in the Tracker.

### Step by step

**1. In the Creator**
She's adjusting a colour in the Creator. The toolbar shows Creator-specific tools: Paint, Fill, Select, backstitch, export, etc. The right panel shows pattern settings, palette editor.

**2. Switch to Tracker**
She clicks the "Track" tab in the header.

→ **What changes:** The entire page reloads (different HTML file). The toolbar completely changes. The right panel changes from Creator settings to tracker sections. The canvas rendering changes from edit-optimised to tracking-optimised.
→ **What stays:** The header stays consistent. The ContextBar looks the same (name, dimensions, progress).

**3. Jarring moments**
- **Toolbar philosophy changes:** Creator has a native-app-style toolbar with grouped icons. Tracker has a pill-shaped floating toolbar with text labels on buttons.
- **Canvas cursor:** Creator uses crosshair for painting. Tracker uses crosshair for tracking. But the semantic meaning is different (paint vs. mark done).
- **Right panel:** Completely different content. Creator shows settings/palette/legend. Tracker shows session/view/colours.
- **Zoom:** Zoom level doesn't persist between Creator and Tracker. She may need to re-orient.

**4. Back to Creator**
She clicks "Create" tab. Full page reload again. Zoom level lost.

### Summary: Creator↔Tracker switching
- **Shared elements that anchor the transition:** Header, ContextBar, same colour palette, same zoom gesture semantics
- **Breaks:** Toolbar layout/philosophy, right panel content, zoom state, cursor semantics
- **Recommendation:** Persistent zoom/scroll state per project. Same toolbar philosophy (pill vs traditional). Same right-panel structure (same sections with different content).

---

## Key Findings Across All Journeys

1. **The canvas needs more vertical space on mobile.** Every pixel of chrome above the canvas costs real usability. Currently ~226px of stacked bars is too much.

2. **The right panel has no mobile alternative.** It renders at 280px width always, which on phones either overflows or never appears. A bottom sheet or slide-in drawer would serve mobile users.

3. **Colour cycling is the most-used toolbar interaction during stitching** — it deserves a larger, more discoverable touch target on mobile.

4. **Undo is critical but buried.** On mobile, reaching to the toolbar for undo is awkward when your hands are occupied. A floating undo button or gesture would help.

5. **Duplicate controls (view toggles, save, session info, progress %)** create cognitive load without adding value. Each feature should exist in exactly one place.

6. **The Tracker and Creator have diverged in toolbar philosophy.** Harmonising them is important for users who switch frequently.

7. **The below-canvas sections (Thread Organiser, Project Info, Save/Load)** are not tracking features. They're project management features wearing a tracking-page costume.
