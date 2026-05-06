# Stitch Tracker Guide

Learn to track your stitching progress, mark stitches as done, and monitor your project completion.

## Overview

The **Stitch Tracker** is your digital replacement for a printed chart while you physically stitch. Mark stitches as you complete them, track progress, and see estimated completion dates.

**Perfect for:** Stitching while looking at your phone/tablet instead of a printed chart  
**Works offline:** Yes — data saved locally on your device

## Getting Started

### Opening a Project

1. Go to **Home Screen** (`home.html`)
2. Find your project in the **Projects** tab
3. Click the **Track** button next to your project
4. The Stitch Tracker opens with your pattern ready to use

**Or directly:** Go to `stitch.html` and select a project from the picker.

### Your First View

You'll see:

- **Chart grid** — Your cross-stitch pattern on the left (colours or symbols)
- **Colours drawer** — Thread list on the right showing progress per thread
- **Session timer** — Top bar showing how long you've been stitching
- **Controls** — Toolbar with different view options and settings

## Marking Stitches as Done

### Mark Your Progress

There are three ways to mark stitches:

#### 1. Click (Desktop/Tablet)

- **Click** on an unstitched stitch to mark it done
- **Click again** to unmark (undo)
- **Drag across multiple stitches** to mark them in a line

#### 2. Tap (Phone/Tablet)

- **Tap** a stitch to mark it done
- **Tap again** to undo
- **Drag** to mark multiple stitches in a line

#### 3. Keyboard

- **Arrow keys** — Navigate across the chart
- **Space** — Mark/unmark the current stitch
- **Shift+Arrow** — Navigate while marking

### Undo & Redo

Mistakes? No problem:

- **Ctrl+Z** (Cmd+Z on Mac) — Undo last mark
- **Ctrl+Y** (Cmd+Shift+Z on Mac) — Redo
- Full history — Go back as many steps as you need

## Understanding Views

The Stitch Tracker has three viewing modes. Switch between them using the view buttons in the toolbar:

### 1. Symbol View

Shows **stitches as symbols** (letters, shapes, or icons) on a light background.

**Use when:** Colours in your pattern are hard to tell apart, or you find symbols easier to read.

### 2. Colour View

Shows **stitches in their actual DMC colours** without symbols.

**Use when:** You prefer to see the pattern as it will look when stitched.

### 3. Highlight View

Focuses on one thread colour at a time. Click a thread in the palette panel to pick a focus colour, then choose how the rest of the chart is rendered:

| Sub-mode | Effect |
|----------|--------|
| **Isolate** | Everything except the focus colour fades to near-white |
| **Outline** | The focus colour's region is outlined with marching ants; others render normally |
| **Tint** | A colour wash is applied to the focus colour stitches |
| **Spotlight** | A radial spotlight highlights the focus colour; outer stitches dim |

**Use when:** Working stitch-by-stitch on one colour for an extended time. Counting aids and stitch-run guides activate automatically in Highlight mode.

## Thread Panel

The **Threads needed** panel appears in the right sidebar. It shows every thread in your pattern with ownership and consumption data.

### Basic Mode

| Info | Description |
|------|-------------|
| **Colour swatch** | Visual colour sample |
| **Thread ID** | DMC number and colour name |
| **Skeins needed** | How many skeins the pattern requires |
| **Stash pip** | Green check if you own enough; orange count if you need to buy more |

Threads are grouped:
- **To buy** — threads you don't yet own enough of
- **In stash** — threads you own

**Click any thread row** to switch to Highlight view focused on that colour.

### Live Stash Deduction

Toggle **Live** in the Threads panel header to activate real-time thread consumption tracking.

When Live is on, the app calculates how much thread each stitch actually uses (based on your waste settings) and deducts it from your stash as you mark stitches:

- Each thread row shows **consumed / owned** fractions (e.g., `1.23/3.0`)
- Threads running low show a **Low** badge
- Threads that have run out move to a **Need more** group at the top, highlighted in red

**Gear icon** (next to the Live toggle) — opens the waste settings flyout:

| Setting | Default | What it controls |
|---------|---------|------------------|
| **Tail allowance (in)** | 1.5 in | Thread wasted per cut for starting/ending tails |
| **Run length (stitches)** | 30 | How many stitches you stitch before cutting |
| **General waste (%)** | 10% | Extra buffer for general wastage |
| **Strands** | 2 | Number of strands used per stitch |

The flyout shows a live estimate of thread consumed per stitch based on your settings.

> **Requirement:** Live mode reads your stash from the Stash Manager. If your stash isn't set up, toggle it on after adding your thread inventory in the Stash Manager.

## Navigation & Parking Markers

### Crosshair Guide

Place a guide crosshair on the chart to help you find your spot.

1. Click the **Crosshair button** (target icon) in the toolbar
2. Click on the chart where you want the crosshair
3. The crosshair appears at that location, helping you navigate

**Use when:** Chart is zoomed in or you've had a break and need to find where you were.

### Parking Markers

Mark where you "parked" so you know exactly where to pick up next time.

**Set a marker:**
1. Click **Navigate mode** in the toolbar
2. Click on the chart where you want to mark
3. A circle appears on that stitch

**Multiple markers:** You can place multiple parking markers (one per colour you're actively stitching).

**Clear markers:** Click **Clear all markers** to remove them.

## Session Timer & Completion Estimates

### Starting a Session

The session timer tracks how long you've been stitching and how many stitches you complete.

1. Click the **Start Session** button in the toolbar
2. A modal opens — optionally set:
   - **Time available** — 15 min, 30 min, 1 hr, 2 hr, or open-ended
   - **Stitch goal** — a target number of stitches for this session
3. Click **Start** — the timer begins

> **Auto-tracking:** The timer and stitch count update in real time as you mark stitches. You can see the current session's elapsed time and stitch count in the sidebar under **Today**.

### Ending a Session

Click the stop or end-session button in the toolbar. A **Session complete** summary shows:
- Time elapsed and stitches completed
- Speed in stitches per hour (with comparison to your average)
- Progress gained (% before and after)
- Any colours finished during this session

The session is saved to your project history automatically.

### Completion Estimate

Based on your accumulated stitching speed across all sessions:

- Shown in the sidebar and Home Screen as an estimated finish date
- Becomes more accurate after a few sessions of real data
- Recalculates after each session ends

## Importing Patterns

### From the Creator

1. In the **Pattern Creator**, click **Export** tab
2. Click **Open in Stitch Tracker**
3. Tracker opens with your pattern ready to track

### From Files

1. Open **Stitch Tracker** (`stitch.html`)
2. Click the **Import** tab
3. Choose what to import:

| Format | How to Use |
|--------|-----------|
| **JSON Project** | stitchx project file — click to load |
| **OXS File** | Pattern Keeper or KG-Chart format — upload file |
| **Image** | PNG or JPG file — converted to pattern |
| **PDF** | Scanned pattern (experimental) — upload file |

Follow the import wizard for any additional options.

## Your Progress

### Progress Overview

At the top of the Tracker, you'll see:

- **Progress percentage** — "42% complete"
- **Stitches done / total** — "4,200 / 10,000 stitches"
- **Est. completion date** — "June 15, 2025" (based on your pace)
- **Time spent** — Total hours stitched so far

### Track Multiple Colours Simultaneously

You can work on different colours in any order. The app:

- Tracks progress per colour in the colours drawer
- Shows which colours are complete
- Lets you switch between colours with a single click

## Tips for Mobile & Small Screens

### Phone-Optimised Layout

On small screens:
- **Chart** takes up most of the screen (larger for easier tapping)
- **Colours drawer** collapses into a sidebar (slide in from right)
- **Toolbar** minimises to essential buttons only

### Tap Accuracy

On touchscreens, stitches are slightly larger to prevent mis-taps:
- Zoom in (pinch) for finer control if needed
- Zoom out (pinch) to see more of the chart

### Landscape vs. Portrait

- **Landscape** — Chart on left, colours drawer on right (ideal for most patterns)
- **Portrait** — Chart takes full width, drawer slides over top (easier on small phones)
- Rotate your device to switch modes

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| **Mark stitch** | Space |
| **Undo** | Ctrl+Z (Cmd+Z on Mac) |
| **Redo** | Ctrl+Y (Cmd+Shift+Z on Mac) |
| **Navigate** | Arrow keys |
| **Mark while navigating** | Shift+Arrow keys |
| **Zoom in** | Ctrl+= (Ctrl+Plus) |
| **Zoom out** | Ctrl+- (Ctrl+Minus) |
| **Fit to screen** | Ctrl+0 (Ctrl+Zero) |
| **Start session timer** | ? (check Help for full list) |
| **Open help** | ? |
| **Open preferences** | Ctrl+, (Ctrl+Comma) |

## Customising Your Experience

### Preferences

Press **Ctrl+,** (Ctrl+Comma) to open Preferences:

| Setting | What It Does |
|---------|--------------|
| **Theme** | Light or dark mode |
| **Canvas zoom** | Default zoom level |
| **Interaction** | How clicking/tapping behaves |
| **Session timer** | Show/hide timer bar |
| **Grid size** | Adjust grid density for easier/harder clicking |

### Viewing Options

- **Grid on/off** — Hide the grid lines if they're distracting
- **Canvas background** — Adjust canvas colour
- **Symbol style** — Choose symbol appearance (letters, shapes, etc.)

## Session History

Your stitching sessions are recorded in your project:

- **When you stop the session timer**, it's saved to your project history
- **Home screen shows** "Last stitched: 2 hours ago"
- **Stats page shows** Breakdown of your stitching activity over time

### View Session History

1. Go to **Home Screen** → **Stats** tab
2. See your stitching activity (time per day, stitches per session, etc.)

## Saving Your Progress

Your progress is **automatically saved** as you mark stitches. No manual save needed.

**Your project appears in:**
- Home Screen **Projects tab** (with updated progress %)
- Your **Stats page** (session history and estimates)

## Common Questions

### Q: Can I track progress without stitching?

**A:** Yes, but we don't recommend it. The session timer won't be accurate, and the completion estimate will be wrong. For dry runs, use the Preview tab in the Creator instead.

### Q: What if I accidentally mark stitches done that I didn't stitch?

**A:** Just undo! Press Ctrl+Z as many times as needed to go back. Your changes are saved, so you can undo even after closing and reopening the Tracker.

### Q: Can I track the same project on two devices?

**A:** Not simultaneously. But you can:
1. Export progress on Device A (via **Backup & Restore**)
2. Import on Device B
3. Continue tracking on Device B

See **[Cross-Device Sync](Cross-Device-Sync.md)** for detailed instructions.

### Q: How do I print a chart to reference while stitching?

**A:** In the **Pattern Creator**, open the **Materials** page → **Output** sub-tab → **Print PDF** → Print it. You can cross-stitch from the printed PDF while using the Tracker on a separate device.

### Q: Can I change the pattern while tracking?

**A:** No. Once you start tracking, the pattern is locked to preserve your progress. To edit the pattern, go back to the Creator (**Home Screen** → Project → **Edit** button).

## Next Steps

### While Stitching

- Use the **Session Timer** to track time per session
- Click colours in the drawer to stay focused on one thread
- Use **Parking Markers** to remember where you left off
- Check **Completion estimate** regularly (it improves with more data)

### After Completing Your Project

1. Stop the session timer
2. View your **project stats** on the Home Screen
3. Save a **backup** of your finished project via Preferences → **Sync, backup & data** → **Download backup**

### Other Guides

- **[Getting Started Guide](Getting-Started-Guide.md)** — Overview of all three tools
- **[Pattern Creator Tutorial](Pattern-Creator-Tutorial.md)** — Generate and edit patterns
- **[Stash Manager Guide](Stash-Manager-Guide.md)** — Manage your thread inventory
- **[Organizing Your Projects](Organizing-Projects.md)** — Project management strategies

---

**Last Updated:** May 2026  
**Questions?** Press `?` in the app for in-app help.

