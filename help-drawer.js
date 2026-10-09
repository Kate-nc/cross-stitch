// help-drawer.js — Unified Help, Shortcuts, and Getting Started side drawer.
//
// MIGRATED FROM help-content.js + shortcuts.js (display) + onboarding.js
// (replacement) — original wording in git history. Replaces F3 🔴 dual
// onboarding by collapsing the legacy step-by-step tour into evergreen
// "Getting Started" hints inside the drawer.
//
// Public API:
//   window.HelpDrawer.open({ tab, context, query })
//   window.HelpDrawer.open({ topic, section })  → a help topic's article,
//     e.g. { topic: "creator", section: "What can I import?" }
//   window.HelpDrawer.close()
//   window.HelpDrawer.toggle(opts)
//   window.HelpDrawer.isOpen() → boolean
//   window.HelpDrawer._filter(items, query) → filtered subset (test hook)
//
// Behaviours:
//   • Slides in from the right; 380px desktop / 100vw mobile (≤480px).
//   • role="dialog" aria-modal="false" — page behind remains scrollable
//     and interactive. Click outside or press Escape to close.
//   • Global "?" toggles the drawer.
//   • Listens for cs:openHelp, cs:openHelpDesign, cs:openShortcuts events
//     so existing dispatchers (command-palette, page header) still work.
//   • Persists last-open tab in localStorage["cs_help_drawer_tab"].
//
// This file owns no state outside its own module. The drawer mounts once
// into a body-level <div id="cs-help-drawer-root"> and renders via a
// tiny subscribe-render loop — no JSX, no Babel needed.

(function () {
  if (typeof window === "undefined") return;
  if (typeof document === "undefined") return;
  if (typeof React === "undefined" || typeof ReactDOM === "undefined") return;

  var h = React.createElement;
  var TAB_KEY = "cs_help_drawer_tab";

  // ── Help topics ────────────────────────────────────────────────────────
  // Keep this in step with the UI: every menu path, tab name and shortcut
  // named here should exist under that name. Menu paths are written
  // "File > Preferences" (no arrow glyphs — see AGENTS.md house rule).
  var HELP_TOPICS = [
    {
      id: "creator", area: "Pattern Creator",
      sections: [
        {
          heading: "Starting a pattern",
          body: "Start from Home > Create new. New from pattern file accepts an image (JPG, PNG, GIF, WebP or BMP), a saved .json project, an .oxs file or a PDF chart; New from scratch opens a blank grid. Inside the Creator you can also use File > Open….",
          bullets: [
            ["Convert settings", "Until a pattern has been generated, the sidebar shows how the image will be converted, in this order: Size & fabric (the size in stitches and the fabric count), Colours, Background, Quality, then Adjust image (brightness, contrast and sharpening, folded away because most pictures don't need it). The preview updates as you change them. On a phone, or a tablet held upright, the sidebar is a sheet at the bottom of the screen: tap Settings to open it."],
            ["Max colours", "Limits the palette to between 2 and 100 colours, to keep the project manageable. New patterns start at 15; change the starting value in Preferences > Pattern Creator."],
            ["Use only stash threads", "Restricts colour matching to the DMC and Anchor threads you own in the Stash Manager."],
            ["Dithering", "Off (the default) maps each pixel to its closest thread. Atkinson (Subtle, Balanced or Strong) blends neighbouring colours for smoother gradients; Bayer (2×2, 4×4 or 8×8) blends with a regular pattern. More dithering means more isolated stitches."],
            ["Min stitches per colour", "Drops colours that are only used a few times — useful for tidying up speckled areas."],
            ["Confetti Cleanup", "Merges isolated single stitches into the surrounding colour, so there are fewer thread changes."],
            ["Skip background", "Treats a background colour as empty fabric. When the edges of a picture are one plain colour this is switched on for you, with an Undo button in the message that appears. To choose the colour yourself, press Pick, click it in the source image, then adjust Tolerance."],
            ["Guided import (experimental)", "Preferences > Pattern Creator > Use guided import wizard walks you through Crop, Palette, Size, Preview and Confirm steps instead."]
          ]
        },
        {
          heading: "What can I import?",
          body: "Import a file from Home > Create new > New from pattern file, by dropping it on the Creator, or with File > Open….",
          bullets: [
            ["PDF charts", "Charts saved as PDF by the designer, including Pattern Keeper-compatible PDFs. The colours, symbols and size are read from the chart and you can check them before saving. Scanned or photographed charts can't be read yet, and nor can password-protected PDFs."],
            [".oxs files", "The open cross-stitch format. Most design programs can export it, including Pattern Maker, PCStitch, WinStitch, MacStitch and FlossCross."],
            ["stitchx .json files and backups", "Projects downloaded with File > Download (.json). A full backup of every project is restored with File > Restore from Backup… instead."],
            ["Images", "JPG, PNG, GIF, WebP and BMP pictures are converted into a new pattern."],
            ["Not supported yet", "Files saved in another program's own format: Pattern Maker (.xsd), PCStitch (.pat), XStitch Pro (.xsp) and others. Photos of a paper chart are converted as pictures, not read as charts."],
            ["Exporting from another program", "In Pattern Maker, PCStitch, WinStitch or MacStitch, use the program's Export (or Save as) option and choose OXS. If OXS isn't offered, print the chart to PDF instead, then import that file here."]
          ]
        },
        {
          heading: "Painting and editing stitches",
          body: "Once a pattern exists, the Tools and View tabs unlock in the sidebar. Choose a colour in the Palette tab, then pick a tool. Painting, filling and erasing are all undoable with Ctrl+Z.",
          bullets: [
            ["Stitch types", "Cross (1), Half / (2), Half \\ (3), Backstitch (4) and Erase (5), plus quarter and three-quarter stitches in the tool strip. Press T to step through the stitch types."],
            ["Paint (P) and Fill (F)", "Paint colours the stitches you click or drag across; Fill colours a whole connected area."],
            ["Backstitch", "Click one grid corner and then another to draw a line between them."],
            ["Brush size", "Paint, half stitches and Erase cover a square up to 10 × 10 stitches. Set the size in the Tools tab or under More tools."],
            ["Erase (5)", "Clears full and part stitches under the brush, and any backstitch line you drag across."],
            ["Eyedropper (I)", "Click a stitch to make its colour the current colour."],
            ["Navigate and Draw (H)", "The Navigate | Draw switch says what a touch or click will do, like Mark and Navigate in the Stitch Tracker. Navigate moves around without changing anything: drag the chart to pan it, tap a stitch to see its thread, and press and hold (or right-click) for its menu. Draw makes touches and clicks change the chart with the tool you picked. Choosing Paint, Fill, Erase or any other tool switches to Draw; choosing Navigate keeps your tool for next time. Press H to switch."],
            ["On a touch screen", "The switch is the first control in the toolbar, and a new pattern opens in Navigate so the first swipe scrolls. In Draw, drag one finger to draw and use two fingers to pan and zoom; a second finger cancels a stroke you've started. Tapping the active Paint, Fill or Erase button again goes back to Navigate. On a computer the switch is in the Tools tab, and the Creator opens in Draw."]
          ]
        },
        {
          heading: "Selecting stitches",
          bullets: [
            ["Magic wand (W)", "Click a stitch to select every connected stitch of that colour; the side panel refines the selection and offers actions on it."],
            ["Lasso", "Draw a freehand, polygon or magnetic selection. Choose the lasso and its mode in the Tools tab."],
            ["Select all and invert", "Ctrl+A selects every stitch; Ctrl+Shift+I inverts the selection. Esc clears it."],
            ["Deleting a selection", "Press Delete or Backspace, or choose Delete on the selection bar, to clear every stitch in the selection, including part stitches and backstitch lines that sit inside it. Ctrl+Z brings them back."],
            ["Moving a selection", "Choose Move in More tools, then drag the selection or nudge it one stitch at a time with the arrow keys."]
          ]
        },
        {
          heading: "View modes and preview",
          body: "Switch display modes at any time with the V key or the View tab — view modes never change the underlying pattern.",
          bullets: [
            ["Colour, symbol or both (V)", "Shows each stitch in its thread colour, as a printed symbol, or as colour with the symbol on top."],
            ["Preview tab", "Renders the pattern as real stitches on fabric, from a plain chart up to a hoop or frame mock-up. The detail level and fabric colour are set in Preferences > Preview & display."],
            ["Split pane (\\)", "Shows the editable chart and a live preview side by side. Drag the centre handle to resize."],
            ["Stitch Score", "The Pattern tab shows a 0–100 Stitch Score: 100 minus the percentage of confetti stitches. Higher is easier to stitch."]
          ]
        },
        {
          heading: "Replacing a colour",
          body: "Replace every stitch of one colour with a different thread, without regenerating the pattern.",
          bullets: [
            ["Opening it", "Right-click a stitch and choose Replace this colour, press the swap button on a colour in the Palette tab, or press R and click a stitch."],
            ["Choosing the new thread", "Pick a thread to preview the change and see how many stitches it affects, then press Apply. Double-click a thread to apply it straight away."],
            ["Undo", "A replacement is one undo step (Ctrl+Z)."]
          ]
        },
        {
          heading: "Shift Colours and Palette Presets",
          body: "Once a pattern exists, these sidebar sections recolour the whole pattern at once.",
          bullets: [
            ["Shift Colours", "Rotates every colour around the colour wheel. Drag the Shift slider or use a quick-shift button; the mapping preview shows each thread and its replacement."],
            ["Palette Presets", "Applies a ready-made palette from the Themes or Harmony tabs, or one you saved earlier under Saved."],
            ["Revert", "Revert to generated palette returns to the colours the pattern was generated with."]
          ]
        },
        {
          heading: "Cleanup mode",
          body: "Cleanup mode removes dark border lines left over from converting a line-art illustration. Open More tools in the tool strip and choose Cleanup mode.",
          bullets: [
            ["Auto", "Detects the main dark line colour and shows an overlay of the stitches that will be replaced. Adjust the tolerance to widen or narrow the selection."],
            ["Brush", "Paint the stitches you want to clean up by hand — useful when only a small area needs it."],
            ["Apply", "Nothing changes until you press Apply, and the whole clean-up is a single undo step."]
          ]
        },
        {
          heading: "Denoise mode",
          body: "Converting an image always introduces some noise. Denoise mode finds and fixes three kinds of artefact without repainting by hand. Open it from More tools in the tool strip.",
          bullets: [
            ["Palette", "Merges near-duplicate threads that colour matching created by accident — for example two almost identical yellows. The slider (0 to 30) sets how close two colours must be; the more-used colour absorbs the rarer one."],
            ["Speckle (off by default)", "Removes stray groups of up to 3 stitches completely surrounded by one colour. Off by default because dithering looks like speckle; a warning appears if your pattern looks heavily dithered."],
            ["Fringe", "Smooths the thin band of in-between colours that forms along the edges of solid areas in an anti-aliased image."],
            ["Auto and Brush", "Auto shows an overlay of every stitch that would change, with counts for each operation; press Re-run after changing settings. Brush lets you paint the area to fix by hand."],
            ["Apply / Cancel", "Nothing changes until you press Apply, and the whole operation is one undo step."]
          ]
        },
        {
          heading: "Adapting to your stash or another brand",
          body: "Adapt makes a copy of the pattern that uses threads you own, or a different brand. Use Adapt to my stash or Adapt to brand on the Project tab.",
          bullets: [
            ["Suggestions", "Each colour is matched to the nearest available thread by ΔE, a measure of how different two colours look — lower is closer. Review the suggestions before confirming."],
            ["A new project", "The adapted pattern is saved as a separate project, so the original is untouched."]
          ]
        },
        {
          heading: "Threads needed and skein estimates",
          body: "The Materials & Output tab shows what the pattern needs, in three sub-tabs: Threads, Stash status and Export.",
          bullets: [
            ["Skein count", "Estimated skeins per colour, from the stitch count, fabric count, strand count and a waste allowance. A standard skein is 315 inches (8 metres). 25, 28 and 32 count are worked over two threads, so 28 count uses thread (and gives a finished size) like 14 count Aida."],
            ["Stash status", "Each thread shows whether you own enough (In stash), some but not enough (Partial), or none (Need to buy). A blend is not a separate thread to buy: its stitches count towards each of its two threads."],
            ["Shopping list", "Lists only the threads you still need, with an estimated cost at your skein price (£0.95 by default; change it in Preferences > Stash Manager)."]
          ]
        }
      ]
    },
    {
      id: "tracker", area: "Stitch Tracker",
      sections: [
        {
          heading: "Tracking progress",
          body: "Open a project in the Stitch Tracker to mark stitches as you finish them.",
          bullets: [
            ["Mark mode (T)", "Click or drag across the chart to mark stitches done. On a touch screen, drag one finger to mark and use two fingers to pan and zoom."],
            ["Navigate mode (N)", "Move around without marking anything: drag the chart to pan it. Click a cell to place a guide crosshair across its row and column; click it again, or press Esc, to clear it. On a touch screen, drag to scroll and tap to place or clear the guide."],
            ["Marking a rectangle", "Hold Shift and click a stitch to mark the whole rectangle between it and the last stitch you marked (Shift-drag shows the rectangle before you let go). On a touch screen, press and hold a stitch, then tap another one."],
            ["Parking", "Right-click a stitch (in either mode) to mark that a thread is parked there. On a touch screen, press and hold the stitch: in Navigate mode that parks straight away; in Mark mode it starts a rectangle, and the bar that appears has a Park thread here button. The marker is a small triangle in the stitch's colour, outlined so it shows on any background, and it stays visible through the Spotlight and work-area dimming. Do the same again to remove it. It also clears itself when you mark that stitch done, and comes back if you undo."],
            ["Finding a parked thread", "Tap the P on a colour in the palette to jump to where that thread is parked; the guide crosshair marks the spot. If it is parked in more than one place, tap again for the next."],
            ["Park markers list", "The Park markers list in the sidebar shows each parked colour, with a checkbox to hide its markers and a Clear all button."],
            ["Undo", "Undo (Ctrl+Z) covers parking too: placing or removing a park marker, and Clear all, are steps like marking stitches."],
            ["Colours drawer (D)", "Shows your progress per colour. Click a colour to highlight only those stitches on the chart."]
          ]
        },
        {
          heading: "Sessions and timer",
          body: "A session starts by itself when you mark your first stitch, and is logged with its start and end times and the stitches you added. The Stats page uses these sessions.",
          bullets: [
            ["Pause (P)", "Pauses and resumes the session timer. Marking a stitch resumes it automatically."],
            ["Ending a session", "If you stop stitching for 10 minutes the session is closed and saved. Change this under Preferences > Stitch Tracker > End session after inactivity."],
            ["Timing mode", "Classic counts short breaks (up to 1½ minutes by default) as stitching time; Batch-friendly allows longer gaps when you mark a large run at once; Manual timer counts the whole visible, unpaused session. Choose in Preferences > Stitch Tracker."]
          ]
        },
        {
          heading: "Highlight view modes",
          body: "Highlight view focuses on one colour at a time. Press V until you reach Highlight, step through colours with [ and ] (or the left and right arrow keys), then choose how the colour is shown with 1–4.",
          bullets: [
            ["Isolate (1)", "Every other colour is replaced by a flat, faded fill so the focused colour is the only one you can see. How faded is set in Preferences > Stitch Tracker."],
            ["Outline (2)", "All colours stay visible and the focused colour's stitches are outlined."],
            ["Tint (3)", "All colours stay visible and the focused colour is washed with a translucent tint. The tint colour and strength are set in Preferences > Stitch Tracker."],
            ["Spotlight (4)", "Every other colour turns pale grey while the focused colour keeps its full colour and symbols."],
            ["Jump (J)", "Moves to the next stitch of the focused colour that is still to do."]
          ]
        },
        {
          heading: "Work area",
          body: "On a large pattern, a work area shows just the part you are stitching. The colour list, counts and “Mark all done” then cover only that part.",
          bullets: [
            ["Pick an area (W)", "Tap Area in the toolbar or press W. Choose an area size and tap the overview, or drag across sections for a custom area. Areas are made of whole sections, the same ones Spotlight uses."],
            ["Margin", "A few stitches around the area stay visible, faded, so you can line up its edges. They cannot be marked while you are in the area."],
            ["Next area", "The arrows in the work area bar move to the previous or next unfinished area. When you finish an area, you are offered the next one."],
            ["Section spotlight (S)", "Highlights one section at a time. With it on, it works through the sections inside the area before moving on. Alt and the arrow keys move it one section at a time."],
            ["Saved and synced", "The area is saved with the project, so it is still selected when you come back or open the project on another device."]
          ]
        },
        {
          heading: "Row mode",
          body: "Row mode washes out every row but one, so you can work across the chart a row at a time. Turn it on with R, or More controls > Layers > Row mode.",
          bullets: [
            ["Where it starts", "On the first row with stitches still to do, counting from the corner you start from (Preferences > Stitch Tracker)."],
            ["Moving between rows", "Use the arrows in the row bar, or the up and down arrow keys (outside Navigate mode). Next unfinished row skips rows that are already done."],
            ["Finishing a row", "When you mark the last stitch of the row, row mode moves on to the next unfinished row."],
            ["With a work area", "Rows run across the work area only, and stay inside it."]
          ]
        },
        {
          heading: "Counting aids",
          body: "Counting aids overlay reference markers to help you count stitches accurately — essential when navigating a large pattern without a printed chart.",
          bullets: [
            ["Toggle (C)", "Press C or tap the counting aid button in the toolbar to show or hide the overlay."],
            ["10×10 grid", "Thin lines divide the canvas into 10×10 stitch blocks, matching the bolded squares on most printed charts."],
            ["Crosshair", "The guide crosshair runs across a whole row and column, so you can follow a line of the chart. Place it in Navigate mode by clicking a cell (or, with the chart focused, with the arrow keys). The bar under the chart shows its row, column and thread, with a Clear guide button; clicking the same cell again or pressing Esc also clears it."]
          ]
        },
        {
          heading: "Stitch layers",
          body: "Full stitches, half and part stitches, French knots and backstitch are drawn as separate layers, so you can hide the ones you are not working on.",
          bullets: [
            ["F, H, K and L", "Show or hide the full-stitch, half-stitch, French-knot and backstitch layers."],
            ["Shift+A", "Shows or hides all layers at once."]
          ]
        }
      ]
    },
    {
      id: "manager", area: "Stash Manager",
      sections: [
        {
          heading: "Thread stash",
          body: "The Thread Stash tab tracks which DMC and Anchor threads you own, how many skeins, and what is running low.",
          bullets: [
            ["Skeins owned", "Select a thread to set how many skeins you have. Composite keys (for example anchor:403) keep DMC and Anchor numbers that look the same apart."],
            ["Part-used skeins", "Mark a thread as Mostly full, About half, Remnant or Used up. Used up sets the skein count to zero."],
            ["Low stock", "A thread is low when you have fewer skeins than its minimum (1 by default; change it per thread or in Preferences > Stash Manager)."],
            ["Filters", "Show All, Owned, Low Stock, Remnants or Used Up threads, for DMC, Anchor or both, and search by number or name."],
            ["Bulk Add (B)", "Paste a list of thread numbers (for example 310, 550, 3821) to add them all at once."]
          ]
        },
        {
          heading: "Thread brands and conversions",
          body: "Both DMC and Anchor stranded cotton are supported, tracked separately so overlapping numbers never collide.",
          bullets: [
            ["Anchor ↔ DMC equivalents", "Conversions come from a reconciled table, labelled official, reconciled or single-source. They are close matches, not exact."],
            ["Stash-constrained generation", "When Use only stash threads is on in the Creator, every thread you own (DMC and Anchor) is available to the generator."]
          ]
        },
        {
          heading: "Pattern Library",
          body: "The Pattern Library tab lists every project you save in the Creator or Tracker automatically, plus any pattern you add by hand here.",
          bullets: [
            ["Coverage", "Each pattern shows how many of its threads you already own."],
            ["Stash Manager only", "Patterns added here without a linked project are flagged so you don't expect Tracker progress."],
            ["Showcase", "The Showcase link opens the Stats page's Showcase tab, a summary of your stitching so far."]
          ]
        }
      ]
    },
    {
      id: "saving", area: "Saving and Backup",
      sections: [
        {
          heading: "Saving your work",
          body: "Projects save themselves to this device as you work — there is no Save button to remember. Ctrl+S downloads a .json copy, the same as File > Download (.json).",
          bullets: [
            ["Project names", "Nothing asks for a name while you create. A pattern converted from an image is named after the image file (IMG_2041.jpg becomes IMG_2041), an imported chart keeps its title or file name, and a blank grid starts as Untitled design. The first time you print or export an automatically named pattern, or open it in the Tracker, you're asked once whether to give it a name; Skip keeps the current one."],
            ["Download (.json)", "File > Download (.json) writes a copy of the project to a file: the pattern, your edits and your tracking progress. Open it again in the Creator or the Tracker."],
            ["Export PDF and .oxs", "File > Export PDF… exports a chart straight away with your saved export settings — the ones on the Export tab of Materials & Output. In the Tracker it first shows the main settings. Export .oxs writes a file other cross-stitch software (MacStitch, WinStitch, FlossCross) can open."],
            ["Storage", "The top of the File menu shows how much space the app is using, and whether the browser has made it Protected (kept) or Temporary (may be cleared when space runs low)."]
          ]
        },
        {
          heading: "Full backup",
          body: "File > Export Backup downloads every project, your stash and your settings as one file (.csb, or .json on older backups). Restore it with File > Restore from Backup…, or from Preferences > Sync, backup & data. Restoring replaces what is on this device.",
          bullets: [
            ["When to back up", "Before clearing your browser data, switching browser, or deleting projects you might want back."],
            ["Not encrypted", "Backup files are not encrypted. Keep them somewhere private."]
          ]
        },
        {
          heading: "Sync status indicator (cloud icon)",
          body: "The cloud icon in the top bar shows the state of folder sync. Click it on any page for a quick-status popover with actions.",
          bullets: [
            ["Cloud with a downward arrow", "A sync folder is connected, but auto-sync is off. To sync automatically, tick the checkbox in the popover or turn it on in Preferences > Sync, backup & data."],
            ["Cloud with a tick (green)", "Auto-sync is on. The app writes updates to the folder and picks up changes from other devices every few seconds."],
            ["Cloud with a line through it", "No sync folder is connected. Choose one in Preferences > Sync, backup & data."],
            ["Red dot on the cloud", "Changes from another device are waiting for you to review — usually because they conflict with edits made here. Click the icon to open the review screen."]
          ]
        },
        {
          heading: "Setting up folder sync",
          body: "Folder sync keeps several devices in step through a folder your cloud drive already syncs (Dropbox, iCloud Drive, OneDrive, Google Drive and so on). No account is needed.",
          bullets: [
            ["Step 1", "On each device, open Preferences > Sync, backup & data, press Choose folder… and pick the same cloud-synced folder."],
            ["Step 2", "Turn on auto-sync. The app then writes a .csync file to the folder shortly after each save."],
            ["Step 3", "While the app is open and visible, it checks the folder every 10 seconds and brings in newer changes from your other devices."],
            ["Pairing code", "Show pairing code… on one device and Enter pairing code… on the other gives both devices matching names and settings. The code contains no data or passwords."],
            ["Encryption (optional)", "Turn on encryption in the same panel to protect sync files with a passphrase. Every device needs the passphrase to read them."],
            ["Conflicts", "If both devices changed the same project, a review screen lets you choose which version to keep."],
            ["iPad and iPhone", "These browsers cannot watch a folder. Use Share sync file and Import file in the cloud popover to move changes by hand."]
          ]
        },
        {
          heading: "Sync troubleshooting",
          body: "If changes from another device are not appearing, work through these checks in order.",
          bullets: [
            ["Tab must be visible", "The app only checks the folder while its tab is visible. Bring the tab to the front to check straight away."],
            ["Auto-sync must be on", "If the popover says auto-sync is off, turn it on in Preferences > Sync, backup & data."],
            ["Folder permission expired", "Browsers can drop folder access after a restart. If the popover asks you to reconnect, do so and choose the same folder."],
            ["Same folder on both devices", "Both devices must use the same folder in the same cloud drive."],
            ["Cloud drive not syncing", "The .csync files have to reach the other device through your cloud drive. Check its app says it is up to date."],
            ["Review waiting", "A pending review (red dot) holds back some changes until you resolve it. Click the cloud icon and choose Review sync."]
          ]
        },
        {
          heading: "PDF export options",
          body: "The Export sub-tab of Materials & Output sets up a printable chart. File > Export PDF… and Print PDF use the same saved settings.",
          bullets: [
            ["Quick presets", "For Pattern Keeper: symbols and colour, medium print, 2-row overlap, cover page. For printing (home): large print, no overlap, no cover page."],
            ["Page size", "Auto (A4 or US Letter depending on where you are), A4 or US Letter."],
            ["Stitches per page", "Small, Medium (best for Pattern Keeper), Large or Custom — fewer stitches per page means bigger, easier-to-read cells."],
            ["Chart modes", "Symbols on white (B&W), Colour blocks with symbols, or both."],
            ["Optional pages", "Cover page, Info page, Chart index and a mini-legend strip on each page can each be turned on or off."],
            ["Workshop print theme", "A terracotta grid on a linen background, ticked in the same panel. Leave it off for Pattern Keeper, which expects the standard black grid."],
            ["Designer branding", "Your name, logo and copyright are set once in Preferences > Profile & branding and printed on every PDF."],
            ["Bundle", "Download bundle saves one .zip with the PDF, the .oxs file, a PNG preview and the .json project."]
          ]
        },
        {
          heading: "Managing projects",
          body: "Home is the hub for all your projects. Every pattern you create, open or import appears there.",
          bullets: [
            ["Active project", "The project you most recently opened. It is the one the Creator and Tracker open by default."],
            ["Switching projects", "Use Home > Projects, or File > Switch Project… from any page."],
            ["Renaming", "Click the project name in the top bar to rename it. On a phone, tap the project button at the top left and choose Rename."],
            ["Deleting", "Delete projects from the Stash Manager's Pattern Library (one at a time, or select several). An Undo button appears for a few seconds; after that, a deleted project can only be recovered from a backup."]
          ]
        }
      ]
    },
    {
      id: "glossary", area: "Glossary",
      sections: [
        {
          heading: "Core concepts",
          bullets: [
            ["Project", "An end-to-end stitching effort: a pattern + progress + history. What you open and stitch."],
            ["Pattern", "The chart / design itself. Lives inside a Project, or as a stand-alone entry in the Stash Manager library."],
            ["Stash", "Your physical thread collection (DMC + Anchor). Tracked in the Stash Manager."],
            ["Skein", "One physical bundle of thread (315 inches by default)."],
            ["Active project", "The project you most recently opened; the Creator and Tracker open it by default."],
            ["Confetti stitches", "Single isolated stitches surrounded by different colours. Each needs its own thread pass, so they are slow to stitch. Confetti Cleanup in the Creator merges them into the surrounding colour."],
            ["Stitch Score", "A 0–100 rating shown on the Pattern tab: 100 minus the percentage of confetti stitches. Higher is easier to stitch."],
            ["Fabric count", "Stitches per inch of fabric. Common values: 11 count (large stitches), 14 count (standard — 14 stitches ≈ 1 inch), 18 count (fine), 28 count (very fine, usually worked over two threads)."],
            ["Blend stitch", "A stitch sewn with two different thread colours in the same needle. Shown in the pattern as two DMC numbers joined with '+', e.g. '310+550'."],
            ["ΔE (delta-E)", "A measure of how different two colours look — lower means a closer match. Used when matching image colours to threads and when suggesting replacement threads."]
          ]
        },
        {
          heading: "Save vs. Download vs. Export",
          bullets: [
            ["Save", "Write to the app's own storage on this device (no file appears). Happens automatically as you work."],
            ["Download", "Write a file to your device (e.g. a backup or a .json project)."],
            ["Export", "Produce a file to print or share (PDF chart, .oxs, PNG)."],
            ["Open / Import", "Read a file into the app."],
            ["Sync (folder)", "Optional updates written to a chosen folder so your other devices can pick them up."]
          ]
        }
      ]
    },
    {
      id: "stats", area: "Stats & Progress",
      sections: [
        {
          heading: "Reading your stats",
          body: "The Stats page (Stats in the top bar) summarises your stitching across all projects, in Stitching, Stash, Showcase, Activity and Insights tabs.",
          bullets: [
            ["Stitches logged", "Counts every stitch marked done across all projects."],
            ["Time", "Adds up the time from your Tracker sessions."],
            ["Stash", "Shows what your stash covers, which projects you could start with threads you own, and how long your stash would last at your current pace."]
          ]
        },
        {
          heading: "Sessions and streaks",
          body: "Each Tracker session is logged with its start time, duration and the stitches added.",
          bullets: [
            ["Streaks", "Your streak counts consecutive weeks with at least one session."],
            ["Activity", "A calendar heatmap of how much you stitched each day — darker squares mean more stitches."]
          ]
        },
        {
          heading: "Stitch Score",
          body: "The Stitch Score (0–100) on the Pattern tab rates how pleasant the pattern will be to stitch before you start.",
          bullets: [
            ["How it is worked out", "100 minus the percentage of stitches that are confetti (isolated single stitches or tiny clusters)."],
            ["Improving the score", "Use Confetti Cleanup and Min stitches per colour in the Creator, or Denoise mode on a finished pattern."]
          ]
        }
      ]
    },
    {
      id: "stitching-style", area: "Stitching Style",
      sections: [
        {
          heading: "How you stitch",
          body: "The first time you open the Tracker it asks how you usually work through a pattern. Change the answer later in Preferences > Stitch Tracker.",
          bullets: [
            ["One section at a time", "Work block by block (10×10, 20×20, tall 10×20 towers or a custom size). Spotlight then focuses on one block at a time, starting from the corner you choose."],
            ["One colour at a time", "Cross-country: finish all of one colour before starting the next. Highlight view is the best way to see one colour."],
            ["No fixed method", "Freestyle: no blocks or colour order are suggested."]
          ]
        },
        {
          heading: "Choosing a stitching order",
          body: "There is no single correct order, but this approach suits most projects:",
          bullets: [
            ["Light before dark", "Start with lighter colours so any dark thread carried behind the fabric is less likely to show through."],
            ["Large areas first", "Complete large colour blocks before small details so you can park threads efficiently."],
            ["Row working", "Some stitchers work all half-stitches in one direction across a row, then return to complete the X — this keeps tension even."],
            ["One colour at a time", "Finish all stitches of one colour before starting the next to minimise thread changes. Use the Highlight view in the Tracker to isolate one colour at a time."]
          ]
        }
      ]
    }
  ];

  // ── Shortcut catalogue (display) ───────────────────────────────────────
  // Runtime registration lives in creator/useKeyboardShortcuts.js,
  // tracker-app.js (trackerShortcuts) and manager-app.js; this list is what
  // users see. tests/helpDrawerShortcutsSync.test.js checks every key listed
  // here against those registrations.
  // Each entry: { id, scope, keys: ['Ctrl+S'] | ['1'], description }.
  var SHORTCUTS = [
    // Global
    { id: "g.esc",  scope: "global", keys: ["Esc"], description: "Close the topmost open panel, modal, or menu" },
    { id: "g.help", scope: "global", keys: ["?"],   description: "Open this help and shortcuts drawer" },
    { id: "g.cmd",  scope: "global", keys: ["Ctrl+K", "⌘K"], description: "Open the command palette" },

    // Creator
    { id: "c.tool1", scope: "creator", keys: ["1"], description: "Cross stitch (or, in highlight view, Isolate)" },
    { id: "c.tool2", scope: "creator", keys: ["2"], description: "Half stitch / (or Outline)" },
    { id: "c.tool3", scope: "creator", keys: ["3"], description: "Half stitch \\ (or Tint)" },
    { id: "c.tool4", scope: "creator", keys: ["4"], description: "Backstitch (or Spotlight)" },
    { id: "c.tool5", scope: "creator", keys: ["5"], description: "Erase" },
    { id: "c.cycle", scope: "creator", keys: ["T", "Shift+T"], description: "Next / previous stitch type" },
    { id: "c.paint", scope: "creator", keys: ["P"], description: "Paint brush" },
    { id: "c.fill",  scope: "creator", keys: ["F"], description: "Fill bucket" },
    { id: "c.wand",  scope: "creator", keys: ["W"], description: "Magic wand (toggle)" },
    { id: "c.eye",   scope: "creator", keys: ["I"], description: "Eyedropper" },
    { id: "c.hand",  scope: "creator", keys: ["H"], description: "Switch between Navigate and Draw" },
    { id: "c.replace", scope: "creator", keys: ["R"], description: "Replace colour (toggle) — click a stitch to replace every stitch of that colour" },
    { id: "c.view",  scope: "creator", keys: ["V"], description: "Cycle view: colour / symbol / both" },
    { id: "c.split", scope: "creator", keys: ["\\"], description: "Toggle split-pane preview" },
    { id: "c.zoomIn",  scope: "creator", keys: ["+", "="], description: "Zoom in" },
    { id: "c.zoomOut", scope: "creator", keys: ["-"], description: "Zoom out" },
    { id: "c.zoomFit", scope: "creator", keys: ["0"], description: "Zoom to fit" },
    { id: "c.undo",  scope: "creator", keys: ["Ctrl+Z", "⌘Z"], description: "Undo" },
    { id: "c.redo",  scope: "creator", keys: ["Ctrl+Y", "Ctrl+Shift+Z"], description: "Redo" },
    { id: "c.save",  scope: "creator", keys: ["Ctrl+S", "⌘S"], description: "Save project" },
    { id: "c.selAll", scope: "creator", keys: ["Ctrl+A", "⌘A"], description: "Select all stitches" },
    { id: "c.invert", scope: "creator", keys: ["Ctrl+Shift+I", "⌘⇧I"], description: "Invert selection" },
    { id: "c.delSel", scope: "creator", keys: ["Delete", "Backspace"], description: "Delete the stitches in the selection" },
    { id: "c.move",   scope: "creator", keys: ["←", "↑", "→", "↓"], description: "Move tool: nudge the selection one stitch" },

    // Tracker
    { id: "t.track",   scope: "tracker", keys: ["T"], description: "Switch to Mark mode (mark stitches done)" },
    { id: "t.nav",     scope: "tracker", keys: ["N"], description: "Switch to Navigate mode (drag to pan, click to place the guide)" },
    { id: "t.guide",   scope: "tracker", keys: ["Esc"], description: "Navigate mode: clear the guide crosshair" },
    { id: "t.park",    scope: "tracker", keys: ["Right-click"], description: "Park a thread on a stitch (again to remove)" },
    { id: "t.guideKeys", scope: "tracker", keys: ["←", "↑", "→", "↓"], description: "Navigate mode, chart focused: move the guide (hold Shift for 10 stitches)" },
    { id: "t.parkGuide", scope: "tracker", keys: ["Shift+F10", "Menu"], description: "Park a thread at the guide" },
    { id: "t.view",    scope: "tracker", keys: ["V"], description: "Cycle view: symbol / colour / highlight" },
    { id: "t.full",    scope: "tracker", keys: ["F"], description: "Toggle full-stitch layer visibility" },
    { id: "t.half",    scope: "tracker", keys: ["H"], description: "Toggle half-stitch layer visibility" },
    { id: "t.knot",    scope: "tracker", keys: ["K"], description: "Toggle French-knot layer visibility" },
    { id: "t.bs",      scope: "tracker", keys: ["L"], description: "Toggle backstitch layer visibility" },
    { id: "t.allLay",  scope: "tracker", keys: ["Shift+A"], description: "Toggle all layers on / off" },
    { id: "t.drawer",  scope: "tracker", keys: ["D"], description: "Toggle the colours drawer" },
    { id: "t.count",   scope: "tracker", keys: ["C"], description: "Toggle counting aids" },
    { id: "t.pause",   scope: "tracker", keys: ["P"], description: "Pause / resume session timer" },
    { id: "t.pan",     scope: "tracker", keys: ["Space (hold)"], description: "Hold to pan the canvas freely" },
    { id: "t.section", scope: "tracker", keys: ["S"], description: "Toggle section spotlight" },
    { id: "t.row",     scope: "tracker", keys: ["R"], description: "Toggle row mode: work one row at a time" },
    { id: "t.rowKeys", scope: "tracker", keys: ["↑", "↓"], description: "Row mode (not in Navigate mode): the row above / below" },
    { id: "t.focus",   scope: "tracker", keys: ["Alt+←", "Alt+↑", "Alt+→", "Alt+↓"], description: "Move the spotlight one section" },
    { id: "t.zoomIn",  scope: "tracker", keys: ["+", "="], description: "Zoom in" },
    { id: "t.zoomOut", scope: "tracker", keys: ["-"], description: "Zoom out" },
    { id: "t.zoomFit", scope: "tracker", keys: ["0"], description: "Zoom to fit (the work area, when one is active)" },
    { id: "t.area",    scope: "tracker", keys: ["W"], description: "Pick a work area: show only one section of the pattern" },
    { id: "t.undo",    scope: "tracker", keys: ["Ctrl+Z", "⌘Z"], description: "Undo" },
    { id: "t.redo",    scope: "tracker", keys: ["Ctrl+Y", "Ctrl+Shift+Z"], description: "Redo" },
    { id: "t.save",    scope: "tracker", keys: ["Ctrl+S", "⌘S"], description: "Save project" },
    { id: "t.jump",    scope: "tracker", keys: ["J"], description: "Jump to next remaining stitch of the focused colour" },

    // Tracker — Highlight view
    { id: "th.prev", scope: "tracker", keys: ["[", "←"], description: "Highlight: focus the previous colour" },
    { id: "th.next", scope: "tracker", keys: ["]", "→"], description: "Highlight: focus the next colour" },
    { id: "th.iso",  scope: "tracker", keys: ["1"], description: "Highlight: Isolate — fade every other colour to a flat fill" },
    { id: "th.out",  scope: "tracker", keys: ["2"], description: "Highlight: Outline — outline the focused colour's stitches" },
    { id: "th.tint", scope: "tracker", keys: ["3"], description: "Highlight: Tint — wash the focused colour with a translucent tint" },
    { id: "th.spot", scope: "tracker", keys: ["4"], description: "Highlight: Spotlight — turn every other colour pale grey" },

    // Manager
    { id: "m.bulk", scope: "manager", keys: ["B"], description: "Open Bulk Add Threads" }
  ];
  var SCOPE_LABEL = {
    global:  "Global",
    creator: "Pattern Creator",
    tracker: "Stitch Tracker",
    manager: "Stash Manager"
  };

  // ── Getting Started — a short, evergreen list. The action buttons replay
  // each page's WelcomeWizard (or load the sample pattern).
  var GETTING_STARTED = [
    {
      id: "make-pattern",
      heading: "Make your first pattern",
      body: "The Pattern Creator turns any image into a cross-stitch chart. Choose an image, set the size and the number of colours, and stitchx does the heavy lifting. From there you can edit stitches by hand, preview them on fabric, and export a PDF.",
      action: { label: "Try a sample pattern", kind: "sample" }
    },
    {
      id: "track",
      heading: "Track your stitches",
      body: "Open any saved project in the Stitch Tracker to mark progress, log session time, and see per-colour completion. Use Highlight view when you're working a single thread to fade out everything else.",
      action: { label: "Replay the Tracker walkthrough", kind: "wizard", page: "tracker" }
    },
    {
      id: "stash",
      heading: "Manage your stash",
      body: "The Stash Manager keeps a tally of every DMC and Anchor skein you own, alongside a pattern library that fills itself from your saved projects.",
      action: { label: "Replay the Stash walkthrough", kind: "wizard", page: "manager" }
    },
    {
      id: "creator-walkthrough",
      heading: "Take the Creator walkthrough",
      body: "A short guided tour of where things live and how to start a new pattern.",
      action: { label: "Replay the Creator walkthrough", kind: "wizard", page: "creator" }
    },
    {
      id: "shortcuts",
      heading: "Learn the shortcuts",
      body: "Press ? anytime to open this drawer on the Shortcuts tab. Most tools have a single-letter shortcut, and undo / redo / save use the standard Ctrl (or ⌘) combinations.",
      action: null
    }
  ];

  // ── Search filter (pure helper — exposed for tests) ────────────────────
  // items: array of { searchText: string, ... }. Returns subset where
  // searchText (lowercased) contains the query. Empty / short query
  // returns all items unchanged.

  // C11 — American → British spelling alias map. The help drawer index is
  // authored in British English, but many users will type the American
  // form. We expand the user's query so either spelling matches. Mapping
  // is bidirectional and applied to both the query and every alias key
  // discovered inside it.
  var SPELLING_ALIASES = {
    "color": "colour",     "colour": "color",
    "colors": "colours",   "colours": "colors",
    "gray": "grey",        "grey": "gray",
    "customize": "customise", "customise": "customize",
    "organize": "organise",   "organise": "organize",
    "organizer": "organiser", "organiser": "organizer",
    "analyze": "analyse",   "analyse": "analyze",
    "center": "centre",     "centre": "center",
    "behavior": "behaviour", "behaviour": "behavior",
    "realize": "realise",   "realise": "realize",
    "favorite": "favourite", "favourite": "favorite",
    "favorites": "favourites", "favourites": "favorites",
    "neighbor": "neighbour", "neighbour": "neighbor"
  };

  // Returns an array of search terms to try in OR fashion: the original
  // query plus, for each known alias word it contains, a copy of the query
  // with that word substituted for its counterpart. Always lowercased.
  function expandAliases(query) {
    var q = (query == null ? "" : String(query)).trim().toLowerCase();
    if (!q) return [];
    var out = [q];
    for (var alias in SPELLING_ALIASES) {
      if (!Object.prototype.hasOwnProperty.call(SPELLING_ALIASES, alias)) continue;
      // Word-boundary regex avoids substituting "colorize" → "colourize" etc.
      var re = new RegExp("\\b" + alias + "\\b", "g");
      if (re.test(q)) {
        var sub = q.replace(re, SPELLING_ALIASES[alias]);
        if (out.indexOf(sub) === -1) out.push(sub);
      }
    }
    return out;
  }

  function filterItems(items, query) {
    if (!Array.isArray(items)) return [];
    var queries = expandAliases(query);
    if (queries.length === 0) return items.slice();
    return items.filter(function (it) {
      if (!it || typeof it.searchText !== "string") return false;
      for (var i = 0; i < queries.length; i++) {
        if (it.searchText.indexOf(queries[i]) !== -1) return true;
      }
      return false;
    });
  }

  // Build flat search-friendly arrays once.
  function buildHelpItems() {
    var out = [];
    HELP_TOPICS.forEach(function (t) {
      t.sections.forEach(function (s) {
        var bulletText = (s.bullets || []).map(function (b) { return b[0] + " " + b[1]; }).join(" ");
        out.push({
          area: t.area,
          heading: s.heading,
          body: s.body || "",
          bullets: s.bullets || [],
          searchText: (t.area + " " + s.heading + " " + (s.body || "") + " " + bulletText).toLowerCase()
        });
      });
    });
    return out;
  }
  function buildShortcutItems() {
    return SHORTCUTS.map(function (s) {
      var keysStr = s.keys.join(" ");
      return {
        id: s.id,
        scope: s.scope,
        scopeLabel: SCOPE_LABEL[s.scope] || s.scope,
        keys: s.keys,
        description: s.description,
        searchText: (s.scope + " " + keysStr + " " + s.description).toLowerCase()
      };
    });
  }

  var HELP_ITEMS = buildHelpItems();
  var SHORTCUT_ITEMS = buildShortcutItems();

  // ── Drawer state (subscribe / render store) ────────────────────────────
  var state = {
    open: false,
    tab: "help",        // 'help' | 'shortcuts' | 'getting-started'
    context: null,      // 'creator' | 'tracker' | 'manager' | null
    query: "",
    topic: null,        // help topic id to open on (with `section`)
    section: null,      // section heading inside that topic
    openSeq: 0          // bumped on every open() so the view resets
  };
  var subscribers = [];
  function setState(patch) {
    var changed = false;
    for (var k in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k) && state[k] !== patch[k]) {
        state[k] = patch[k]; changed = true;
      }
    }
    if (changed) subscribers.forEach(function (fn) { try { fn(); } catch (_) {} });
  }
  function subscribe(fn) {
    subscribers.push(fn);
    return function () {
      var i = subscribers.indexOf(fn);
      if (i !== -1) subscribers.splice(i, 1);
    };
  }

  function readPersistedTab() {
    try {
      var v = localStorage.getItem(TAB_KEY);
      if (v === "help" || v === "shortcuts" || v === "getting-started") return v;
      if (v != null) localStorage.removeItem(TAB_KEY);
    } catch (_) {}
    return null;
  }
  function persistTab(v) {
    try { localStorage.setItem(TAB_KEY, v); } catch (_) {}
  }

  // ── Public API ─────────────────────────────────────────────────────────
  function open(opts) {
    opts = opts || {};
    var tab;
    if (opts.topic) {
      tab = "help";
    } else if (opts.tab === "help" || opts.tab === "shortcuts" || opts.tab === "getting-started") {
      tab = opts.tab;
    } else if (opts.context === "creator" || opts.context === "tracker" || opts.context === "manager") {
      tab = "shortcuts";
    } else {
      tab = readPersistedTab() || "help";
    }
    var ctx = (opts.context === "creator" || opts.context === "tracker" || opts.context === "manager")
      ? opts.context : null;
    setState({
      open: true,
      tab: tab,
      context: ctx,
      query: typeof opts.query === "string" ? opts.query : "",
      topic: typeof opts.topic === "string" ? opts.topic : null,
      section: typeof opts.section === "string" ? opts.section : null,
      openSeq: state.openSeq + 1
    });
    persistTab(tab);
    try { window.dispatchEvent(new CustomEvent("cs:helpStateChange", { detail: { open: true } })); } catch (_) {}
  }
  function close() {
    setState({ open: false });
    try { window.dispatchEvent(new CustomEvent("cs:helpStateChange", { detail: { open: false } })); } catch (_) {}
  }
  function toggle(opts) {
    if (state.open) close();
    else open(opts);
  }
  function isOpen() { return !!state.open; }

  window.HelpDrawer = {
    // Distinguishes this from the load-on-demand stub in lazy-modules.js,
    // which stands in for the drawer until something asks to open it.
    __real: true,
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    _filter: filterItems,
    _expandAliases: expandAliases,
    _SPELLING_ALIASES: SPELLING_ALIASES,
    _helpItems: HELP_ITEMS,
    _shortcutItems: SHORTCUT_ITEMS,
    _gettingStarted: GETTING_STARTED
  };

  // Back-compat shim: anything that still tries to render the old
  // HelpCentre component just opens the drawer instead.
  window.HelpCentre = function HelpCentreShim(props) {
    React.useEffect(function () {
      var t = props && props.defaultTab;
      var ctx = null, tab = "help";
      if (t === "shortcuts") { tab = "shortcuts"; }
      else if (t === "creator") { ctx = "creator"; tab = "help"; }
      else if (t === "tracker") { ctx = "tracker"; tab = "help"; }
      else if (t === "manager") { ctx = "manager"; tab = "help"; }
      open({ tab: tab, context: ctx });
      if (props && typeof props.onClose === "function") props.onClose();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  };
  window.HELP_TOPICS = HELP_TOPICS;

  // ── Drawer view (no JSX — plain React.createElement) ───────────────────
  function kbd(label, key) {
    return h("kbd", {
      key: key,
      style: {
        display: "inline-block", padding: "1px 6px", marginRight:'var(--s-1)',
        fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
        fontSize:'var(--text-xs)', lineHeight: 1.4,
        background: "var(--surface)", border: "1px solid #CFC4AC",
        borderRadius: 4, color: "var(--text-primary)",
        boxShadow: "0 1px 0 rgba(0,0,0,0.05)"
      }
    }, label);
  }

  function HelpSection(props) {
    var items = props.items;
    if (!items.length) {
      return h("p", { style: { color: "var(--text-tertiary)", fontSize:'var(--text-md)', padding: "8px 4px" } }, "No matches.");
    }
    // Group by area, preserving first-seen order.
    var order = [];
    var groups = {};
    items.forEach(function (it) {
      if (!groups[it.area]) { groups[it.area] = []; order.push(it.area); }
      groups[it.area].push(it);
    });
    return h("div", null, order.map(function (area) {
      var sections = groups[area];
      return h("div", { key: area, style: { marginBottom: 18 } },
        h("div", {
          style: {
            fontSize:'var(--text-xs)', textTransform: "uppercase", letterSpacing: 0.5,
            color: "var(--text-tertiary)", fontWeight: 700, marginBottom:'var(--s-2)',
            paddingBottom: 4, borderBottom: "1px solid var(--border)"
          }
        }, area),
        sections.map(function (s, i) {
          return h("div", { key: i, style: { marginBottom: 14 } },
            h("h4", { style: { margin: "0 0 4px 0", fontSize:'var(--text-lg)', color: "var(--text-primary)" } }, s.heading),
            s.body && h("p", {
              style: { margin: "0 0 6px 0", color: "var(--text-secondary)", fontSize:'var(--text-md)', lineHeight: 1.55 }
            }, s.body),
            s.bullets && s.bullets.length > 0 && h("ul", {
              style: { margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize:'var(--text-md)', lineHeight: 1.55 }
            }, s.bullets.map(function (b, j) {
              return h("li", { key: j }, h("strong", null, b[0] + ":"), " " + b[1]);
            }))
          );
        })
      );
    }));
  }

  function ShortcutsSection(props) {
    var items = props.items;
    var contextScope = props.context;
    if (!items.length) {
      return h("p", { style: { color: "var(--text-tertiary)", fontSize:'var(--text-md)', padding: "8px 4px" } }, "No matches.");
    }
    var order = ["global", "creator", "tracker", "manager"];
    if (contextScope && order.indexOf(contextScope) !== -1) {
      order = [contextScope].concat(order.filter(function (x) { return x !== contextScope; }));
    }
    var groups = {};
    items.forEach(function (it) {
      (groups[it.scope] = groups[it.scope] || []).push(it);
    });
    return h("div", null, order.filter(function (s) { return groups[s] && groups[s].length; }).map(function (scope) {
      return h("div", { key: scope, style: { marginBottom: 18 } },
        h("div", {
          style: {
            fontSize:'var(--text-xs)', textTransform: "uppercase", letterSpacing: 0.5,
            color: "var(--text-tertiary)", fontWeight: 700, marginBottom:'var(--s-2)',
            paddingBottom: 4, borderBottom: "1px solid var(--border)"
          }
        }, SCOPE_LABEL[scope] || scope),
        groups[scope].map(function (s) {
          return h("div", {
            key: s.id,
            style: {
              display: "flex", gap:'var(--s-3)', padding: "5px 0",
              borderBottom: "0.5px solid var(--surface-tertiary)",
              alignItems: "baseline"
            }
          },
            h("div", { style: { minWidth: 130, flexShrink: 0 } },
              s.keys.map(function (k, i) {
                return h(React.Fragment, { key: i },
                  i > 0 && h("span", { style: { color: "var(--text-tertiary)", fontSize: 10, margin: "0 3px" } }, "/"),
                  kbd(k, "k" + i)
                );
              })
            ),
            h("div", { style: { fontSize:'var(--text-md)', color: "var(--text-secondary)" } }, s.description)
          );
        })
      );
    }));
  }

  function GettingStartedSection() {
    function handleAction(act) {
      if (!act) return;
      if (act.kind === "sample") {
        try {
          if (typeof window.buildSampleProject === "function" && window.ProjectStorage) {
            var p = window.buildSampleProject();
            window.ProjectStorage.save(p).then(function () {
              try { window.ProjectStorage.setActiveProject && window.ProjectStorage.setActiveProject(p.id); } catch (_) {}
              window.__navigatingAway = true;
              window.location.href = "stitch.html?id=" + encodeURIComponent(p.id);
            });
            close();
            return;
          }
        } catch (_) {}
        // Fallback: navigate to the Home screen so the user can pick a project.
        window.location.href = "home.html";
        close();
      } else if (act.kind === "wizard") {
        try {
          if (window.WelcomeWizard && window.WelcomeWizard.reset) {
            window.WelcomeWizard.reset(act.page);
          }
          window.dispatchEvent(new CustomEvent("cs:showWelcome", { detail: { page: act.page } }));
        } catch (_) {}
        close();
      }
    }
    return h("div", null,
      GETTING_STARTED.map(function (item) {
        return h("div", { key: item.id, style: { marginBottom: 18 } },
          h("h4", { style: { margin: "0 0 4px 0", fontSize:'var(--text-lg)', color: "var(--text-primary)" } }, item.heading),
          h("p", { style: { margin: "0 0 8px 0", color: "var(--text-secondary)", fontSize:'var(--text-md)', lineHeight: 1.55 } }, item.body),
          item.action && h("button", {
            onClick: function () { handleAction(item.action); },
            style: {
              padding: "6px 12px", fontSize:'var(--text-sm)', borderRadius:'var(--radius-sm)',
              border: "1px solid #CFC4AC", background: "var(--surface)",
              color: "var(--accent)", cursor: "pointer", fontWeight: 600,
              fontFamily: "inherit"
            }
          }, item.action.label)
        );
      }),
      // ── C8: Restart guided tours (Phase 1) ────────────────────────────
      h("div", {
        style: {
          marginTop: 18, paddingTop: 14,
          borderTop: "1px solid var(--border)"
        }
      },
        h("h4", { style: { margin: "0 0 4px 0", fontSize:'var(--text-lg)', color: "var(--text-primary)" } }, "Guided tours"),
        h("p", { style: { margin: "0 0 8px 0", color: "var(--text-secondary)", fontSize:'var(--text-md)', lineHeight: 1.55 } },
          "Bring back every welcome walkthrough and tip. Walkthroughs show the next time you open each page; tips appear as you go."),
        h("button", {
          type: "button",
          "data-action": "restart-tours",
          onClick: function () {
            try { if (typeof window.resetCoaching === "function") window.resetCoaching(); } catch (_) {}
          },
          style: {
            padding: "6px 12px", fontSize:'var(--text-sm)', borderRadius:'var(--radius-sm)',
            border: "1px solid #CFC4AC", background: "var(--surface)",
            color: "var(--accent)", cursor: "pointer", fontWeight: 600,
            fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", gap: 6
          }
        },
          (window.Icons && typeof window.Icons.replay === "function")
            ? h("span", { "aria-hidden": "true", style: { display: "inline-flex" } }, window.Icons.replay())
            : null,
          "Restart guided tours"
        )
      )
    );
  }

  // ── Category navigation components ────────────────────────────────────
  var TOPIC_ICONS = {
    creator: "wand", tracker: "needle", manager: "box",
    saving: "save", glossary: "gradCap",
    stats: "barChart", "stitching-style": "halfStitch"
  };

  function CategoryLanding(props) {
    var onSelect = props.onSelect;
    var onGettingStarted = props.onGettingStarted;
    var Ic = window.Icons || {};
    var cardStyle = {
      display: "flex", flexDirection: "column", alignItems: "flex-start",
      gap: 6, padding: "12px 14px", background: "var(--surface-secondary)",
      border: "1px solid var(--line)", borderRadius: "var(--radius-md)",
      cursor: "pointer", textAlign: "left", fontFamily: "inherit",
      color: "var(--text-primary)"
    };
    return h("div", null,
      h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } },
        HELP_TOPICS.map(function(topic) {
          var iconName = TOPIC_ICONS[topic.id];
          var icon = iconName && typeof Ic[iconName] === "function" ? Ic[iconName]() : null;
          return h("button", { key: topic.id, onClick: function() { onSelect(topic.id); }, style: cardStyle },
            icon && h("span", { "aria-hidden": "true", style: { color: "var(--accent)", display: "inline-flex" } }, icon),
            h("span", { style: { fontSize: "var(--text-md)", fontWeight: 600, lineHeight: 1.3 } }, topic.area),
            h("span", { style: { fontSize: "var(--text-xs)", color: "var(--text-secondary)" } },
              topic.sections.length + " " + (topic.sections.length === 1 ? "article" : "articles"))
          );
        }),
        h("button", { key: "gs", onClick: onGettingStarted, style: cardStyle },
          typeof Ic.lightbulb === "function" && h("span", { "aria-hidden": "true", style: { color: "var(--accent)", display: "inline-flex" } }, Ic.lightbulb()),
          h("span", { style: { fontSize: "var(--text-md)", fontWeight: 600, lineHeight: 1.3 } }, "Getting Started"),
          h("span", { style: { fontSize: "var(--text-xs)", color: "var(--text-secondary)" } }, GETTING_STARTED.length + " guides")
        )
      )
    );
  }

  function CategoryArticleList(props) {
    var topic = HELP_TOPICS.find(function(t) { return t.id === props.topicId; });
    if (!topic) return null;
    var backBtnStyle = {
      display: "inline-flex", alignItems: "center", gap: 6,
      background: "transparent", border: "none", cursor: "pointer",
      padding: "4px 0 12px", fontFamily: "inherit",
      fontSize: "var(--text-sm)", color: "var(--accent)", fontWeight: 600
    };
    return h("div", null,
      h("button", { onClick: props.onBack, style: backBtnStyle },
        (window.Icons && typeof window.Icons.chevronLeft === "function")
          ? h("span", { "aria-hidden": "true", style: { display: "inline-flex" } }, window.Icons.chevronLeft())
          : null,
        "All topics"
      ),
      h("div", {
        style: {
          fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: 0.5,
          color: "var(--text-tertiary)", fontWeight: 700, marginBottom: "var(--s-2)",
          paddingBottom: 4, borderBottom: "1px solid var(--border)"
        }
      }, topic.area),
      topic.sections.map(function(s, i) {
        return h("button", {
          key: i,
          onClick: function() { props.onSelect(i); },
          style: {
            display: "flex", width: "100%", alignItems: "center",
            justifyContent: "space-between", padding: "10px 0",
            background: "transparent", border: "none",
            borderBottom: "1px solid var(--line)",
            cursor: "pointer", textAlign: "left", fontFamily: "inherit",
            color: "var(--text-primary)", fontSize: "var(--text-md)"
          }
        },
          h("span", { style: { flex: 1, fontWeight: 600 } }, s.heading),
          (window.Icons && typeof window.Icons.chevronRight === "function")
            ? h("span", { "aria-hidden": "true", style: { color: "var(--text-tertiary)", display: "inline-flex", flexShrink: 0 } }, window.Icons.chevronRight())
            : null
        );
      })
    );
  }

  function CategoryArticleDetail(props) {
    var topic = HELP_TOPICS.find(function(t) { return t.id === props.topicId; });
    if (!topic) return null;
    var s = topic.sections[props.sectionIndex];
    if (!s) return null;
    var backBtnStyle = {
      display: "inline-flex", alignItems: "center", gap: 6,
      background: "transparent", border: "none", cursor: "pointer",
      padding: "4px 0 12px", fontFamily: "inherit",
      fontSize: "var(--text-sm)", color: "var(--accent)", fontWeight: 600
    };
    return h("div", null,
      h("button", { onClick: props.onBack, style: backBtnStyle },
        (window.Icons && typeof window.Icons.chevronLeft === "function")
          ? h("span", { "aria-hidden": "true", style: { display: "inline-flex" } }, window.Icons.chevronLeft())
          : null,
        topic.area
      ),
      h("h4", { style: { margin: "0 0 10px", fontSize: "var(--text-lg)", color: "var(--text-primary)" } }, s.heading),
      s.body && h("p", { style: { margin: "0 0 10px", color: "var(--text-secondary)", fontSize: "var(--text-md)", lineHeight: 1.55 } }, s.body),
      s.bullets && s.bullets.length > 0 && h("ul", {
        style: { margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: "var(--text-md)", lineHeight: 1.55 }
      },
        s.bullets.map(function(b, j) {
          return h("li", { key: j }, h("strong", null, b[0] + ":"), " " + b[1]);
        })
      )
    );
  }

  function TabButton(props) {
    var active = props.active;
    return h("button", {
      id: props.id,
      onClick: props.onClick,
      role: "tab",
      tabIndex: props.tabIndex != null ? props.tabIndex : (active ? 0 : -1),
      "aria-selected": active ? "true" : "false",
      "aria-controls": props["aria-controls"],
      style: {
        flex: 1, padding: "8px 6px", fontSize:'var(--text-md)', fontWeight: active ? 700 : 500,
        background: active ? "var(--surface)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        border: "none",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        cursor: "pointer", fontFamily: "inherit",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6
      }
    },
      props.icon && h("span", { "aria-hidden": "true", style: { display: "inline-flex" } }, props.icon),
      props.label
    );
  }

  // ── Focus trap helper ──────────────────────────────────────────────────
  function focusableIn(root) {
    if (!root) return [];
    var sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    var nodes = root.querySelectorAll(sel);
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.disabled) continue;
      if (n.getAttribute && n.getAttribute("aria-hidden") === "true") continue;
      if (n.offsetParent === null && n.tagName !== "INPUT") continue;
      out.push(n);
    }
    return out;
  }

  function Drawer() {
    var _t = React.useState(0);
    var rerender = _t[1];
    React.useEffect(function () {
      return subscribe(function () { rerender(function (n) { return n + 1; }); });
    }, []);
    var rootRef = React.useRef(null);
    var searchRef = React.useRef(null);
    var tablistRef = React.useRef(null);
    var _hv = React.useState("landing");
    var helpView = _hv[0]; var setHelpView = _hv[1];
    var _hc = React.useState(null);
    var helpCat = _hc[0]; var setHelpCat = _hc[1];
    var _ha = React.useState(null);
    var helpArt = _ha[0]; var setHelpArt = _ha[1];

    React.useEffect(function () {
      if (!state.open) return;
      // Focus the search input when opening.
      var t = setTimeout(function () {
        if (searchRef.current) {
          try { searchRef.current.focus(); } catch (_) {}
        }
      }, 30);
      return function () { clearTimeout(t); };
    }, [state.open, state.tab]);

    React.useEffect(function () {
      if (!state.open) return;
      // open({ topic, section }) lands on that article; otherwise the landing.
      var topic = state.topic ? HELP_TOPICS.find(function (t) { return t.id === state.topic; }) : null;
      if (topic) {
        var idx = -1;
        if (state.section) {
          idx = topic.sections.findIndex(function (sec) { return sec.heading === state.section; });
        }
        setHelpCat(topic.id);
        if (idx >= 0) { setHelpArt(idx); setHelpView("detail"); }
        else { setHelpArt(null); setHelpView("list"); }
        return;
      }
      setHelpView("landing"); setHelpCat(null); setHelpArt(null);
    }, [state.open, state.openSeq]); // eslint-disable-line react-hooks/exhaustive-deps

    React.useEffect(function () {
      if (!state.open) return;
      function onKey(e) {
        if (e.key === "Escape") {
          if (!e.defaultPrevented) {
            e.preventDefault(); e.stopPropagation();
            close();
          }
        } else if (e.key === "Tab" && rootRef.current) {
          var f = focusableIn(rootRef.current);
          if (!f.length) return;
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault(); last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault(); first.focus();
          }
        }
      }
      document.addEventListener("keydown", onKey, true);
      return function () { document.removeEventListener("keydown", onKey, true); };
    }, [state.open]);

    if (!state.open) return null;

    var helpFiltered = filterItems(HELP_ITEMS, state.query);
    var shortcutsFiltered = filterItems(SHORTCUT_ITEMS, state.query);
    if (state.context && shortcutsFiltered.length) {
      shortcutsFiltered = shortcutsFiltered.slice().sort(function (a, b) {
        var ax = a.scope === state.context ? 0 : 1;
        var bx = b.scope === state.context ? 0 : 1;
        return ax - bx;
      });
    }

    var Icons = window.Icons || {};
    var hasIcon = function (n) { return typeof Icons[n] === "function"; };

    return h(React.Fragment, null,
      // Click-outside catcher — semi-transparent edge tint, but does NOT
      // block scroll on the page behind. Pointer events go through except
      // on the catcher itself (a thin transparent strip).
      h("div", {
        onClick: close,
        "aria-hidden": "true",
        style: {
          // Use edge-anchored positioning so the scrim never gets a
          // negative width when the viewport is narrower than the
          // drawer (e.g. on phones where the drawer covers the screen).
          position: "fixed", top: 0, left: 0, right: 380, bottom: 0,
          background: "transparent",
          zIndex: 9998,
          pointerEvents: "auto"
        },
        className: "cs-help-drawer-scrim"
      }),
      h("aside", {
        ref: rootRef,
        role: "dialog",
        "aria-modal": "false",
        "aria-label": "Help and shortcuts",
        className: "cs-help-drawer",
        style: {
          position: "fixed", top: 0, right: 0,
          width: 380, maxWidth: "100vw", height: "100dvh",
          background: "var(--surface)",
          boxShadow: "-4px 0 16px rgba(15, 23, 42, 0.12)",
          borderLeft: "1px solid var(--border)",
          display: "flex", flexDirection: "column",
          zIndex: 9999,
          fontFamily: "inherit"
        }
      },
        // Header
        h("div", {
          style: {
            padding: "12px 14px 8px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0
          }
        },
          h("div", {
            style: {
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap:'var(--s-2)', marginBottom:'var(--s-2)'
            }
          },
            h("strong", { style: { fontSize: 15, color: "var(--text-primary)" } }, "Help"),
            h("button", {
              onClick: close,
              "aria-label": "Close help drawer",
              title: "Close",
              style: {
                background: "transparent", border: "none", cursor: "pointer",
                padding: 4, color: "var(--text-secondary)", display: "inline-flex",
                alignItems: "center", justifyContent: "center"
              }
            }, hasIcon("x") ? Icons.x() : h("span", { "aria-hidden": "true" }, "Close"))
          ),
          h("input", {
            ref: searchRef,
            type: "search",
            inputMode: "search",
            enterKeyHint: "search",
            autoComplete: "off",
            "aria-label": "Search help and shortcuts",
            placeholder: "Search help…",
            value: state.query,
            onChange: function (e) { setState({ query: e.target.value }); },
            style: {
              width: "100%", padding: "7px 10px", fontSize:'var(--text-md)',
              border: "1px solid var(--border)", borderRadius:'var(--radius-sm)',
              boxSizing: "border-box"
            }
          })
        ),
        // Tabs
        h("div", {
          ref: tablistRef,
          role: "tablist",
          "aria-label": "Help sections",
          onKeyDown: function(e) {
            var tabs = ["help", "shortcuts", "getting-started"];
            var ci = tabs.indexOf(state.tab);
            if (ci === -1) return;
            var ni = -1;
            if (e.key === "ArrowRight") { e.preventDefault(); ni = (ci + 1) % tabs.length; }
            else if (e.key === "ArrowLeft") { e.preventDefault(); ni = (ci - 1 + tabs.length) % tabs.length; }
            else if (e.key === "Home") { e.preventDefault(); ni = 0; }
            else if (e.key === "End") { e.preventDefault(); ni = tabs.length - 1; }
            if (ni === -1) return;
            var newTab = tabs[ni];
            setState({ tab: newTab }); persistTab(newTab);
            if (tablistRef.current) {
              var btns = tablistRef.current.querySelectorAll('[role="tab"]');
              if (btns[ni]) try { btns[ni].focus(); } catch (_) {}
            }
          },
          style: {
            display: "flex", borderBottom: "1px solid var(--border)",
            background: "var(--surface-secondary)", flexShrink: 0
          }
        },
          h(TabButton, {
            id: "cs-help-tab-help",
            "aria-controls": "cs-help-panel-help",
            tabIndex: state.tab === "help" ? 0 : -1,
            label: "Help",
            icon: hasIcon("info") ? Icons.info() : null,
            active: state.tab === "help",
            onClick: function () { setState({ tab: "help" }); persistTab("help"); }
          }),
          h(TabButton, {
            id: "cs-help-tab-shortcuts",
            "aria-controls": "cs-help-panel-shortcuts",
            tabIndex: state.tab === "shortcuts" ? 0 : -1,
            label: "Shortcuts",
            icon: hasIcon("keyboard") ? Icons.keyboard() : null,
            active: state.tab === "shortcuts",
            onClick: function () { setState({ tab: "shortcuts" }); persistTab("shortcuts"); }
          }),
          h(TabButton, {
            id: "cs-help-tab-getting-started",
            "aria-controls": "cs-help-panel-getting-started",
            tabIndex: state.tab === "getting-started" ? 0 : -1,
            label: "Getting Started",
            icon: hasIcon("lightbulb") ? Icons.lightbulb() : null,
            active: state.tab === "getting-started",
            onClick: function () { setState({ tab: "getting-started" }); persistTab("getting-started"); }
          })
        ),
        // Body
        h("div", {
          role: "tabpanel",
          id: "cs-help-panel-" + state.tab,
          "aria-labelledby": "cs-help-tab-" + state.tab,
          "aria-live": "polite",
          style: { flex: 1, overflowY: "auto", padding: "14px 16px" }
        },
          state.tab === "help"
            ? (state.query
                ? h(HelpSection, { items: helpFiltered })
                : (helpView === "list" && helpCat
                    ? h(CategoryArticleList, {
                        topicId: helpCat,
                        onBack: function() { setHelpView("landing"); setHelpCat(null); setHelpArt(null); },
                        onSelect: function(i) { setHelpArt(i); setHelpView("detail"); }
                      })
                    : (helpView === "detail" && helpCat !== null && helpArt !== null
                        ? h(CategoryArticleDetail, {
                            topicId: helpCat,
                            sectionIndex: helpArt,
                            onBack: function() { setHelpView("list"); setHelpArt(null); }
                          })
                        : h(CategoryLanding, {
                            onSelect: function(id) { setHelpCat(id); setHelpView("list"); },
                            onGettingStarted: function() { setState({ tab: "getting-started" }); persistTab("getting-started"); }
                          })
                      )
                  )
              )
            : state.tab === "shortcuts"
              ? h(ShortcutsSection, { items: shortcutsFiltered, context: state.context })
              : h(GettingStartedSection, null)
        )
      )
    );
  }

  // ── Mount once on DOM ready ────────────────────────────────────────────
  function mountDrawer() {
    if (document.getElementById("cs-help-drawer-root")) return;
    var root = document.createElement("div");
    root.id = "cs-help-drawer-root";
    document.body.appendChild(root);
    try {
      ReactDOM.createRoot(root).render(h(Drawer));
    } catch (e) {
      // React 17 fallback (shouldn't happen — repo uses React 18).
      try { ReactDOM.render(h(Drawer), root); } catch (_) {}
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountDrawer);
  } else {
    mountDrawer();
  }

  // ── Event bridges (preserve existing dispatchers) ──────────────────────
  function pageContextFromBody() {
    try {
      var b = document.body;
      if (!b) return null;
      if (b.classList.contains("page-creator")) return "creator";
      if (b.classList.contains("page-tracker")) return "tracker";
      if (b.classList.contains("page-manager")) return "manager";
    } catch (_) {}
    // Best-effort fallback by URL.
    try {
      var p = (window.location && window.location.pathname || "").toLowerCase();
      if (p.indexOf("stitch") !== -1) return "tracker";
      if (p.indexOf("manager") !== -1) return "manager";
      return "creator";
    } catch (_) {}
    return null;
  }
  window.addEventListener("cs:openHelp", function () { open({ tab: "help", context: pageContextFromBody() }); });
  window.addEventListener("cs:openHelpDesign", function () { open({ tab: "help", context: "creator" }); });
  window.addEventListener("cs:openShortcuts", function () { open({ tab: "shortcuts", context: pageContextFromBody() }); });

  // Global "?" toggle — shortcuts.js registry doesn't claim "?", and
  // command-palette.js only handled it on the manager page. Now drawer
  // owns it everywhere.
  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented) return;
    if (e.key !== "?") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.tagName === "SELECT")) return;
    e.preventDefault(); e.stopPropagation();
    toggle({ tab: "shortcuts", context: pageContextFromBody() });
  });
})();
