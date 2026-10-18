# Stitch Tracker Guide

Track your stitching progress, mark stitches as done, and see when you'll finish.

## Overview

The **Stitch Tracker** is a digital replacement for a printed chart while you stitch. Mark stitches as you complete them, keep your place, and see estimated completion dates.

**Perfect for:** stitching from a phone or tablet instead of paper
**Works offline:** yes — everything is saved on your device

## Getting Started

### Opening a project

1. Go to **Home** (`home.html`).
2. Find your project in the **Projects** tab.
3. Press **Track**.

You can also press **Track** in the Pattern Creator's action bar, use **File > Switch Project…** from any page, or open `stitch.html` directly (it opens your active project).

### The first time

The first time you open the Tracker, a short welcome tour explains Mark and Navigate modes and then asks how you like to stitch — one section at a time, one colour at a time, or no fixed method. Your answer sets up Spotlight; change it later from **More controls > Tools > Stitching style**, or in **Preferences > Stitch Tracker**.

### What you'll see

- **Chart** — your pattern in symbols, colours, or a highlight view.
- **Palette** — every colour with its progress. Tap a colour to focus on it.
- **Mode buttons** — **Mark**, **Navigate** and **More controls**.
- **Session chip** — the current session's time and stitches, once you start marking.

## Marking Stitches

### Mark mode (`T`)

- **Click or tap** a stitch to mark it done; again to unmark.
- **Drag** across stitches to mark them all.
- **Rectangle:** hold **Shift** and click a stitch to mark everything between it and the last stitch you marked (Shift-drag shows the rectangle first). On a touch screen, press and hold a stitch, then tap the opposite corner.
- **On a touch screen**, one finger marks and **two fingers** pan and pinch-zoom.
- **French knots:** tap or click a knot to mark it done (it fills in); again to unmark. Knots count towards progress, one each, and **Undo** covers them.

### Navigate mode (`N`)

A hand tool for moving around without marking anything.

- **Drag** to pan the chart.
- **Click or tap** a cell to place a guide crosshair across its row and column. Click it again, or press **Esc**, to clear it.
- With the chart focused, the **arrow keys** move the guide (hold **Shift** for 10 stitches), and **Menu** or **Shift+F10** parks a thread at it.

The bar under the chart shows the guide's row, column and thread, with a **Clear guide** button. Clearing it returns focus to the chart. **Shift+G** focuses the chart; **G** focuses the selected thread's Select button. Thread details and Done are separate buttons. Enter or Space activates buttons; Space toggles layer checkboxes.

The chart summary gives dimensions and zoom. After a short pause in input, an accessible status reports the guide position, full-cross mark state, stitch-unit progress, selected thread and zoom. Rapid marking produces one settled update. Hidden full crosses cannot be marked on the chart; show the layer first. More moves focus into its controls, keeps Tab inside and returns focus when closed with Escape or Close. Import errors remain available until the next import. This compact status avoids creating a screen-reader item for every chart cell; it does not provide a complete spoken description of all specialty geometry.

### Undo & redo

- **Ctrl+Z** (Cmd+Z on Mac) — undo
- **Ctrl+Y** or **Ctrl+Shift+Z** — redo

Undo covers marking stitches and parking. The history lasts until you leave the page.

## Views

Press **V** to cycle between **Symbol**, **Colour + Symbol** and **Highlight**, or use **More controls > View**.

### Highlight view

Focuses on one colour at a time. Step through colours with `[` and `]` (or the left and right arrow keys), or tap a colour in the palette. In Mark or Navigate mode, right-click a chart stitch (Ctrl+click on a Mac) to select its colour and enter Highlight view, even if already done. Empty/background cells are ignored. Then choose how it's shown with `1`–`4` or **More controls > Highlight**:

| Mode | Effect |
|----------|--------|
| **Isolate** (`1`) | Every other colour becomes a flat, faded fill |
| **Outline** (`2`) | All colours stay visible; the focused colour is outlined |
| **Tint** (`3`) | All colours stay visible; the focused colour gets a translucent tint |
| **Spotlight** (`4`) | Every other colour turns pale grey; the focused colour keeps its colour and symbols |

The fade level, tint colour and Spotlight dimming are set in **Preferences > Stitch Tracker**. **J** jumps to the next stitch of the focused colour still to do.

### Layers

**More controls > Layers** (or `F`, `H`, `K`, `L`, and `Shift+A` for all) shows or hides full stitches, half stitches, French knots and backstitch.

### Row mode

**R** (or **More controls > Layers > Row mode**) washes out every row but one so you can work a row at a time. It starts on the first unfinished row from your starting corner; the row bar shows what is left in the row, with buttons for the row above and below and **Next unfinished row**. The up and down arrow keys move between rows (outside Navigate mode). Finishing a row moves you on to the next unfinished one. With a work area, rows run across the area only.

### Counting aids

**C** toggles a 10×10 grid overlay that matches the bold lines on printed charts.

## Work Areas

On a large pattern, a work area shows just the part you're stitching.

1. Press **W** (or tap **Area**).
2. Choose an area size and tap the overview, or drag across sections for a custom area.
3. A faded margin around the area helps you line up its edges; it can't be marked while you're in the area.

The colour list, counts and **Mark all done** cover only the area. The arrows in the work area bar move to the previous or next unfinished area, and you're offered the next one when you finish. The area is saved with the project and syncs to your other devices.

## Spotlight

If you stitch one section at a time, Section spotlight focuses on one block (10×10 by default) and dims the rest. Press **S** (or **More controls > Tools > Highlight active section**) to turn it on or off; **Alt** + the arrow keys move it one block at a time. Inside a work area, it works through the area's blocks first.

## Parking Threads

Mark where a thread is parked so you can pick it up again.

**Park a thread:** Shift + right-click the stitch (in Mark or Navigate mode; Shift+Ctrl+click on a Mac). On a touch screen, press and hold the stitch: in **Navigate mode** that parks straight away; in **Mark mode** it starts a rectangle, and the bar that appears has a **Park thread here** button. A small triangle in the stitch's colour, outlined so it shows on any background, appears in its corner. It stays visible through Spotlight and work-area dimming, since threads are usually parked ahead of where you're stitching.

**Keyboard parking:** with the chart focused, move the guide with the arrow keys and press **Menu** or **Shift+F10**.

**Remove a marker:** do the same again. You rarely need to: marking the parked stitch done clears its marker (undo brings it back).

**Find a parked thread:** tap the **P** on a colour in the palette. The chart scrolls to where it's parked and the guide marks the spot; tap again for the next place.

**Hide or clear markers:** **More controls > Layers > Park markers** lists every parked colour with a checkbox to hide it, plus **Clear all**.

## Sessions and Timing

### Sessions are automatic

A session starts when you mark your first stitch and records the time and stitches. It ends when you press **End session** (**More controls > Session**), or after 10 minutes without stitching (change this in **Preferences > Stitch Tracker > End session after inactivity**). **P** pauses and resumes the timer; marking a stitch resumes it.

**Session settings** lets you set the time you have (15 minutes to 2 hours, or open-ended) and a stitch goal for the session.

When a session ends, a summary shows the time, stitches, your speed against your average, progress gained and any colours you finished.

### Timing mode

**Preferences > Stitch Tracker > Session timing mode**:

- **Classic** — short breaks (up to 1½ minutes by default) count as stitching time.
- **Batch-friendly** — allows longer gaps when you mark a large run at once.
- **Manual timer** — counts the whole visible, unpaused session.

### Completion estimate

Your finish date is estimated from your actual stitching speed and gets more accurate after a few sessions.

## Live Thread Tracking

**More controls > Tools > Use up stash thread as I stitch** deducts thread from your stash in the Stash Manager as you mark stitches, allowing for thread tails and waste. Set up your stash in the Stash Manager first.

## Importing Patterns

- **From the Creator:** press **Track** in the action bar, or **Open in Stitch Tracker** on **Materials & Output > Export**.
- **From a file:** **File > Open…**, or **Home > Create new > New from pattern file**:

| Format | Notes |
|--------|-------|
| **.json** | stitchx project file |
| **.oxs** | Open X-Stitch charts from other design programs. Backstitch retains its thread colours over empty cells; charts need not contain full crosses. Supported diagonal halves, three-quarter stitches, XSPro diagonal quarters and equal two-thread blends are preserved. French knots are read; beads have a separate tracking list. Unsupported content is reported by type and count. |
| **Image** | Converted into a pattern |
| **PDF** | Multi-page, scanned and booklet charts. A review screen shows how many stitches matched the colour key and lets you fix pages and threads before saving. |

## Phones and Tablets

- The chart takes most of the screen; the palette and **More controls** open as panels.
- One finger marks, two fingers pan and zoom.
- Install the app (Share > Add to Home Screen on iPhone and iPad) so Safari doesn't clear stored patterns after a week without a visit.

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Mark / Navigate mode | T / N |
| Cycle view | V |
| Previous / next colour (Highlight) | [ / ] |
| Isolate / Outline / Tint / Spotlight | 1 / 2 / 3 / 4 |
| Jump to next stitch of colour | J |
| Pick a work area | W |
| Section spotlight on / off | S |
| Row mode on / off | R |
| Row mode: row above / below | ↑ / ↓ |
| Move the spotlight | Alt + arrow keys |
| Colours drawer | D |
| Counting aids | C |
| Pause / resume timer | P |
| Layers: full / half / knots / backstitch / all | F / H / K / L / Shift+A |
| Hold to pan | Space |
| Zoom in / out / fit | + / - / 0 |
| Undo / redo | Ctrl+Z / Ctrl+Y |
| Download project (.json) | Ctrl+S |
| Help and all shortcuts | ? |

## Saving

Progress is **saved automatically** as you mark stitches. **Ctrl+S** or **File > Download (.json)** keeps a file copy.

## Common Questions

### I marked stitches I didn't stitch.

Undo with Ctrl+Z, or switch to Mark mode and tap them again.

### Can I track the same project on two devices?

Yes, with sync. Set up folder sync (desktop Chrome or Edge) or move `.csync` files by hand (any browser, including iPad). Changes from both devices are merged, and a review screen appears if they conflict; see **[Cross-Device Sync](Cross-Device-Sync.md)**.

### How do I print a chart as well?

**File > Export PDF…** in the Tracker. It uses the same saved settings as the Pattern Creator's **Materials & Output > Export** tab, which has the full set of options.

### Can I change the pattern while tracking?

Open the project in the Pattern Creator — **Edit** in the top bar, or **Edit** on Home. Your progress is kept.

## Other Guides

- **[Getting Started Guide](Getting-Started-Guide.md)** — overview of all three tools
- **[Pattern Creator Tutorial](Pattern-Creator-Tutorial.md)** — make and edit patterns
- **[Cross-Device Sync](Cross-Device-Sync.md)** — stitch on more than one device

---

**Last Updated:** October 2026
**Questions?** Press `?` in the app for in-app help.


## Compare snapshots

In a project's Stats > Compare, save a manual snapshot to compare your marked stitches later. Automatic daily Compare snapshots are **off by default**, including for existing users. Enable the global toggle in File > Preferences > Stitch Tracker to start from the current stitching day, without filling missed days. The first mark of a later stitching day saves a snapshot; up to 60 automatic snapshots are kept. The stitching day follows your configured day-end hour. Disabling also stops any automatic snapshot waiting for the browser to be idle.

Select a snapshot and choose **Delete snapshot**, or choose **Delete all automatic snapshots**. Confirm the deletion to proceed; cancelling keeps your history. Bulk deletion preserves manual snapshots (even one labelled “auto”) and **Before pattern change** recovery snapshots. A deleted selection clears safely. Read-only views disable saving and deletion. Deletions persist through project saves, reloads, backups and Sync.

Manual snapshots, existing snapshots, pattern-change recovery, project autosave and session recording are independent of the automatic-snapshot preference.

## Timer and crash recovery

Start timer records elapsed time even without marked stitches. Pauses and hidden-tab time are excluded. Active sessions are checkpointed locally about every five seconds and alongside progress writes. Reopening after a crash saves only through the last successful checkpoint and starts any further stitching as a new session; downtime is never counted. Writes can fail or be delayed, so recent time may be lost. An unattended timer is trimmed to its last mark, or capped at the idle threshold when nothing was marked (30 minutes if idle finalisation is disabled). Finish a session before exporting a portable backup to include its time. Use one tab per project on browsers without Web Locks.


## Live stash deductions

In More > Tools, enable **Use up stash thread as I stitch**. New full, half, quarter and petite stitches, French knots and backstitch create durable consumption events with their original fabric, strand, blend, tail and waste assumptions. Changing preferences affects later stitches. Backstitch is estimated by line length; knots use a full-cross allowance.

On first use, an explicit baseline preserves existing stock without inventing earlier usage. Ordinary unmark, Undo and Reset correct accidental progress: only an actual recorded debit is credited. **Unpick area** records physical removal without returning stock; stitching that area again charges a new occurrence. Undoing an accidental Unpick area restores its state without using more thread.

Marks made while Live is off are recorded without a stock debit; re-enabling affects subsequent stitching. This replaces the old high-water catch-up behaviour. **Thread consumption history** in Tools explains estimates, debits, corrections and the historical baseline. Full backups and stash sync preserve all events and assumptions. Update every device before syncing. Incompatible histories or combined offline usage beyond recorded stock require inventory reconciliation. See [the accounting rules](../reports/thread-deduction-accounting.md).

### Undo, Redo and session totals

Undo corrects the last mark, including either half-stitch direction, without counting physical unpicking. Redo restores that action's original contribution. Repeating them does not add stitching, pace or streak activity, and catch-up remains catch-up. Drag and rectangle fills remain one step. History keeps 50 steps for the open project and clears when a project is loaded.

Corrections belong to the action's original session and stitching day, even after End session or a day boundary. A finished session keeps its measured time and notes. An explicitly edited, merged or deleted journal record takes precedence: subsequent chart Undo/Redo leaves that journal change intact. A session ended with every mark undone keeps a zero-addition record so Redo can restore the original attribution. Undoing Unpick area cancels its original unpicked contribution; it does not count restored marks as new stitching.

## Petite and long stitches

In Creator, use **More tools > Petite and long stitches** to add objects with a thread and half-cell coordinates, select them, edit their geometry or delete them. Undo and Redo restore edits. These objects use their own panel; general canvas selection tools edit the other stitch types. In Tracker, click the geometry or use **Layers > Petite and long stitches** to mark overlapping objects independently. A petite counts as 0.25 units and a long stitch as 0.5; each is marked as a whole. Native JSON retains their identities and marks. PNG renders both. OXS exports petites and warns about unsupported long stitches. PDF export stops with an explanation. See the [capability matrix](../docs/petite-long-lifecycle.md).

### Bead progress

Open **Beads** above the progress strip. Each bead shows its material label and chart position, a Select button and a Complete/Unmark button. These controls work with a keyboard as well as touch or mouse at every chart zoom. Chart taps select beads; repeated taps cycle overlapping objects without marking the cross or knot underneath. The list provides access to every overlap and the stitches beneath remain accessible through normal stitch controls.

Beads are quantities, separate from stitch units, percentages, thread requirements and session stitch totals. Undo and Redo reverse bead marks in the normal tracking history. Zero-bead projects show no bead controls.

Project saves, reloads, full backups/restores and .csync preserve the bead array and `beadsDone` object IDs. Version 11 projects remain readable; optional `uid` on a bead is distinct from material `id`, `brand`, `label` and colour. Legacy beads receive deterministic IDs. Move or edit an object while keeping its `uid` to retain completion. Deleting it removes it from live progress; a replacement or copy must receive a new ID. The Creator currently carries beads through saves but does not provide individual bead editing or copying. Canvas resize moves beads with the canvas, drops cropped beads from progress, and Undo restores both objects and their marks.

PDF and image exports omit beads. OXS exports bead labels, colours and positions, but omits completion and object IDs; repeated identical ornaments at the same position may be deduplicated on OXS import. Use project saves or backups for a complete progress round trip. Bead marks are managed individually in the Beads list; stitch bulk marking, colour locks, layer visibility and Unpick area do not change bead marks.

## Corrected charts and stitch-along pages

On Home, use **Update chart** for the existing project. End and save your session
first. Review the imported design, then choose a corrected full chart or added
pages. Confirm page placement and whole-cell coordinate offsets in the difference
preview. For an inserted page, the advanced region mappings move only the old
rectangle after the insertion. Geometry and thread identity drive matching;
symbol changes and palette reordering alone do not reset completion.

Every ambiguous overlap, changed stitch and deletion needs an explicit decision.
Transfer accepts your existing work for that target; archive leaves the
replacement unmarked and keeps the old work in the recovery snapshot. Notes and
sessions are retained; old edit caches and displaced annotations are archived
with acknowledgement. Updates and rollback consume no thread. Existing matching
stitches retain their inventory history for later correction or unpicking.

Use **Update chart > Recovery snapshots** to download the pre-update project and
source or review a rollback. A rollback first saves your current state in another
snapshot. Snapshots are local to this browser and excluded from portable backups
and sync attachments; download them before clearing browser storage. Import
limitations still apply. Repair unsupported objects in the source application.
