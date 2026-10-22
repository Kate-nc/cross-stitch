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
          body: "Start from Home: it asks What are you starting with? on a first visit, and offers the same three cards under Start something new once you have projects. A photo or picture takes a picture (JPG, PNG, GIF, WebP or BMP) and chooses the threads for you. A blank canvas asks first for the size (Small motif 30 × 30, Card 50 × 70, Medium 100 × 100, Large 150 × 150 or your own), the fabric, and optionally a picture to trace over, then opens an empty grid to design stitch by stitch. A pattern I already have opens a PDF, .oxs or supported .xsd chart, or a saved .json project. If you pick a chart file as a picture, you're asked whether to import it instead. You can also drop a file anywhere on Home, or use File > Open… inside the Creator. A picture you drop, or choose as a pattern, gets one question: is it something to turn into a pattern, or a printed chart? stitchx can't read a printed chart from a photo yet, so for a chart it suggests opening the PDF or chart file instead.",
          bullets: [
            ["The top bar and the Creator's steps", "The top bar tabs are the tools: Create, Track, Stash and Stats. Convert, Edit and Materials are steps inside the Creator, so they sit in the Creator's own bar, and the top bar stays on Create through all of them. From another tool, Create opens the project you have open in the Creator, or Home's start cards when no project is open. Home's own bar has Home, Stash and Stats."],
            ["Practice and recovery", "On a first visit, Try the practice pattern opens a small practice chart on Home. Choose a thread, mark or unmark stitches, and undo. The practice is held only in page memory: it never writes a project, inventory, progress or a session, and starts fresh on reload. Home lists your saved projects, each with a preview and its progress, and pictures not converted yet. File > Export Backup protects saved projects and stash; conversion drafts are local only and excluded from backups. Convert chooses colours from a photograph or artwork; it does not read a printed chart grid or thread key from an image file. Use the original PDF or supported chart file for an existing chart."],
            ["Exact pixel-art import", "In Convert, enable Exact pixel-art import for sources up to 500 by 500 pixels. Each source pixel becomes one stitch at the original dimensions. No resizing, smoothing, image adjustments, colour-limit reduction, dithering or cleanup is applied. Alpha below 128 is empty; other pixels keep their uncomposited colour before matching the nearest solid thread in the selected brand or stash. Opaque background pixels remain stitched. Expand Source colours mapped to threads in the preview to review every source RGB, matched thread RGB and pixel count. Different source colours may share a thread. The ordinary Pixel art preset remains editable and is not exact mode."],
            ["What kind of picture is this?", "The first Convert setting picks good starting values for the picture. Graphic or logo uses up to 8 threads, no shading and no blends, and leaves a plain border background unstitched. Photo uses up to 20 threads, subtle shading, blends and balanced cleanup. Pixel art uses the picture's own colours (up to 30) at its own size, one stitch per pixel, for pictures up to 500 pixels across. The Creator guesses the type when you add the picture; choose another at any time. Every setting stays editable, and once you change one the choice shows Custom. To start every picture from your own defaults instead, turn off Guess the picture type in Preferences > Pattern Creator."],
            ["Convert settings", "Until a pattern has been generated, the sidebar shows how the image will be converted, in this order: What kind of picture is this?, Size & fabric (the size in stitches and the fabric count), Colours, Background, Clean-up, then Adjust image (brightness, contrast and sharpening, folded away because most pictures don't need it). Clean-up starts folded away. Show all conversion controls expands the sections for experienced users. The technical names for a few settings are kept in an Advanced section under them, for anyone who wants them. The preview updates as you change them. On a phone, or a tablet held upright, the sidebar is a sheet at the bottom of the screen: tap Settings to open it."],
            ["Generating", "While a pattern is being made, a card shows each step (choosing threads, matching colours, reducing confetti, building the chart) and how far along it is. Large patterns with shading can take a minute or more on a phone. Cancel, or the Escape key, stops it and leaves your settings, and any pattern you already had, as they were."],
            ["Convert preview", "Drag the divider to compare your picture (left) with the stitched preview (right). Anything the pattern will leave unstitched, such as a plain background removed by Skip background, shows as your fabric colour in the preview, as it will in the finished pattern, so a threshold that cuts into the picture is visible before you generate. Show what changed is off until you ask for it: it marks, on the preview side only, the cells that differ from the previous completed preview, including cells becoming stitched or unstitched. Heatmap and colour highlights also stay on the preview side and hide while a new result is being worked out. While a new size is being worked out the preview keeps the shape of the picture on screen. Cropping or replacing the source clears the old preview. If a preview fails, use Retry preview, adjust the settings or choose another image."],
            ["Compare options", "Under the preview, Compare options shows the picture at three neighbouring settings side by side: Size (25% smaller, the current size and 25% larger), Threads (5 fewer, the current number and 5 more) or Brand (the picture in DMC and in Anchor). Each shows its stitches, threads, about how many hours it would take and how much confetti it has. Choose one to use its setting. The previews are smaller versions made in the background, so the real pattern can differ slightly. On a phone, tap Compare options to open it, then swipe sideways."],
            ["Pattern size", "Set the size in Stitches (width × height, with Lock aspect ratio) or as a Finished size in centimetres or inches on the chosen fabric: type 18 cm wide on 14-count and the pattern becomes 99 stitches wide. The chips fit the picture to a Bookmark (5 × 18 cm), Card (5 × 7 in), 15 cm hoop or A4, and Picture size uses one stitch per pixel, scaled evenly to stay between 10 and 500 stitches. A new picture starts with its long side at 100 stitches, or fewer if the picture is smaller than that (a picture under 10 pixels across is scaled up evenly to the 10-stitch minimum). The line underneath always shows the size in stitches and the finished size. You'll see a note if a very wide or tall picture leaves its short side under 20 stitches (cropping helps), or if the pattern has more stitches than the picture has pixels, when each pixel becomes a block of stitches. Sizes go from 10 to 500 stitches each way."],
            ["Threads", "Choose DMC or Anchor. The pattern's colours are matched to that brand's stranded cotton, and its key, shopping list, Stitch Tracker, PDF and .oxs files use that brand's numbers. Anchor's thread list loads the first time you choose it. Screen colours are approximations: check physical threads when choosing materials. Catalogue corrections update colours stored by thread number alone; explicit imported or custom colours keep their saved colours."],
            ["Threads (max)", "Limits the pattern to between 2 and 100 threads. Each thread is one colour of stranded cotton, so this is how many to buy. The picture type sets a starting value; with Guess the picture type turned off in Preferences > Pattern Creator, pictures start from the value set there (15 unless you change it)."],
            ["Threads and symbols", "A blend stitches two threads together in one needle (one strand of each), and gets its own symbol on the chart. So a pattern can have more chart symbols than threads: 24 threads, 40 chart symbols (16 are blends of two threads) means 24 threads to buy and 40 symbols to follow. Every symbol on a chart is different, and each one is the same shape the printed PDF uses for that thread. A chart can have up to 112 symbols; if a conversion needs more, a warning appears and the Palette header shows a warning mark. Lower Threads (max) or turn off blends and convert again."],
            ["Use only stash threads", "Restricts colour matching to the threads you own in the Stash Manager, in the brand chosen under Threads."],
            ["Shading", "Off (the default) gives each pixel its closest thread. Smooth blend (Subtle, Balanced or Strong) mixes neighbouring threads for softer gradients; Pattern blend (Coarse, Medium or Fine) mixes them in a regular pattern. More shading means more confetti stitches. With Smooth blend, Fewer confetti stitches in shading keeps the mix in small clumps."],
            ["Keep look-alike colours apart", "Gives colours that look almost the same next to each other different chart symbols that are easy to tell apart. How strict sets how alike two colours must be before this happens."],
            ["Soften grainy photos and Sharpen details", "In Adjust image, Soften grainy photos smooths away noise before the threads are chosen, which helps photos taken in low light. Sharpen details brings out fine lines and edges."],
            ["Min stitches per colour", "Drops colours that are only used a few times — useful for tidying up speckled areas."],
            ["Allow two-thread blends", "A blend is one chart symbol worked with two threads together in the same needle (one strand of each), which gives an in-between shade. On, the Creator can use blends to make shading smoother, at the cost of more chart symbols to follow. Off, every stitch is a single thread: fewer symbols, but coarser shading. The Photo picture type turns it on and Graphic or logo and Pixel art turn it off, and you can change it at any time. See What's a blend? in the Glossary."],
            ["Reduce confetti", "Merges confetti stitches (single stitches of a colour on their own; slow to stitch) into the surrounding colour, so there are fewer thread changes. It also folds away the in-between shades that appear along the edges of logos and other flat pictures, where two stitched colours meet, so they don't each need a thread of their own."],
            ["Skip background", "Transparent pictures always use their transparency as empty fabric: after resizing, alpha below 128 is unstitched and alpha 128 or above keeps its original colour, without blending against a background. Skip background does not remove opaque colours from these pictures. For opaque pictures, it removes only matching background regions connected to the outside edge, preserving enclosed details of the same colour. Fully transparent pictures produce an empty pattern. When the edges of a picture are one plain colour this is switched on for you, with an Undo button in the message that appears. To choose the colour yourself, press Pick, click it in the source image, then adjust Tolerance."],
            ["If you leave before generating", "Until the first pattern is made, the picture and every Convert setting are kept on this device. Reload the page, go back, or come back after your phone closes the browser, and the Creator offers to continue setting it up. Home also lists these drafts as pictures not converted yet, with Continue and Discard."],
            ["Fabric", "Each pattern remembers its own fabric: the count (Aida from 11 to 22, or evenweave and linen at 25, 28 or 32, stitched over two) and the colour (White, Antique white, Cream, Black, Navy or any colour you pick). The chart is drawn on that colour in the Creator and the Stitch Tracker. Set it in Size & fabric before generating, in the Canvas tab for a design drawn from scratch, or later in Edit > Project. The block also shows the finished size and how much fabric to cut, with 5 cm (2 in) spare on every side. New patterns start with the fabric colour set in Preferences > Pattern Creator."],
            ["Centimetres and inches", "Sizes show in both, with your preferred unit first: centimetres unless your device is set to US English. Change it in Preferences > Regional & units."],
            ["Canvas", "A design drawn from scratch has no picture to convert, so its first tab is Canvas instead of Convert: the grid's size (change it with Resize canvas; half stitches and their completion marks move with the grid, and Undo restores cropped stitches), the fabric and the tracing picture. A chart imported without a picture has neither tab."],
            ["Tracing picture", "A design drawn from scratch can have a picture shown faintly under the grid to draw over. It is never converted into stitches. Choose it when you start the design, or add, change or remove it in the Canvas tab, where you can also hide it and set how strongly it shows. The picture is kept with the design on this device, and included in full backups. Sync includes the tracing picture with an integrity-checked attachment manifest."],
            ["Printing and tracking", "Print PDF, Export and Open in Tracker appear once the pattern has stitches in it; an empty grid shows only the drawing tools."],
            ["Guided import (experimental)", "Preferences > Pattern Creator > Use guided import wizard walks you through Crop, Palette, Size, Preview and Confirm. Preview and Generate use the same rotation, mirroring, centred aspect crop, finished dimensions, DMC palette, blends, shading, smoothing, contrast and background tolerance. From my stash uses only owned DMC threads, including partial skeins. An empty stash blocks generation. Preview updates after you pause an adjustment; Generate becomes available when the current preview succeeds. The optional detail-importance overlay is only a viewing aid and is not stitched."]
          ]
        },
        {
          heading: "What can I import?",
          body: "Import a file from Home > A pattern I already have, by dropping it anywhere on Home or on the Creator, or with File > Open….",
          bullets: [
            ["PDF charts", "Charts saved as PDF by the designer, including Pattern Keeper-compatible PDFs. The colours, symbols and size are read from the chart and you can check them before saving. Scanned or photographed charts can't be read yet, and nor can password-protected PDFs."],
            [".xsd files", "Pattern Maker binary charts from version 4.8.4.12 only. XML Schema files are not charts. Known DMC and Anchor identities, equal blends of two threads of the same brand, full and fractional crosses, petites, backstitch, straight stitches and representable French knots are preserved. Beads retain material labels, colours and half-cell positions; size and rotation are reported as limitations. Curves, special motifs, other thread brands and blend proportions are omitted with affected-object counts. Unknown versions and malformed files stop the import. The review always marks XSD completeness as limited because undocumented data and display/strand settings are unverified. Compare with your original before saving. Limits: 16 MiB and 250,000 grid cells. Export OXS or PDF from the source program for other versions."],
            [".oxs files", "The open cross-stitch format. Most design programs can export it, including Pattern Maker, PCStitch, WinStitch, MacStitch and FlossCross. Backstitch keeps its own thread colours, including over empty cells. Charts can contain backstitch or fractional stitches without full crosses. Two known threads of the same brand blended in equal proportions, diagonal halves, three-quarter stitches and XSPro diagonal quarters are preserved where representable. Other blend ratios, miniature crosses and unsupported objects are reported by type and count; review all warnings. French knots come in too. Beads keep their material labels, colours and positions. The Tracker draws them and offers a Beads list for selecting, completing and unmarking each bead, including overlapping beads. Undo and Redo include bead marks. Bead quantities are separate from stitch progress. Unsupported ornaments are left out, and the review gives their types and counts."],
            ["PCStitch .pat files", "Initial support reads unencrypted PCStitch 7 files: full crosses, diagonal halves, quarters, three-quarter stitches and backstitch. Dimensions and DMC identifiers are retained. Blends, custom palette attributes and header options remain unverified; other thread schemes use placeholders. French knots, petite stitches and unknown objects are omitted with review notes. Other versions are rejected. Compare with the source and review every limitation before saving. Other programs also use .pat; their files are not PCStitch charts."],
            ["stitchx .json files and backups", "Projects downloaded with File > Download (.json). A full backup of every project is restored with File > Restore from Backup… instead."],
            ["Images", "JPG, PNG, GIF, WebP and BMP pictures are converted into a new pattern."],
            ["Not supported yet", "Files saved in another program's own format: unsupported Pattern Maker (.xsd) and PCStitch (.pat) versions, XStitch Pro (.xsp) and others. Photos of a paper chart are converted as pictures, not read as charts."],
            ["Exporting from another program", "In Pattern Maker, PCStitch, WinStitch or MacStitch, use the program's Export (or Save as) option and choose OXS. If OXS isn't offered, print the chart to PDF instead, then import that file here."],
            ["Checking an import", "A review opens before anything is saved: Pages (for a chart over several pages), Preview, Palette, Details and Compare with the original. The review distinguishes fully verified imports from usable imports with limitations. Verification lists recognised cells, legend matches, stitch types, dimensions, unsupported content and declared counts separately; unknown source totals stay unverified. A PDF key percentage describes only matches to that key. Use Assign threads beside a warning to open Palette, Review page layout to open Pages when available, or Compare source to check the original. Expand Verification and repairs for the full report. Invalid imports cannot be saved; repair supported fields or cancel, correct the source and re-import missing objects. Download original source preserves the file for repair. On a phone the review fills the screen and any notes about the import fold into one line; tap it to read them."],
            ["Symbols with no thread", "A symbol the chart's key doesn't list shows as a hatched square with a question mark, in the review and in the Creator's palette and legend, until you give it a thread: enter its number in the Palette tab, or choose its colour."],
            ["Update an existing chart", "Update chart (in a project's More menu on Home) imports a corrected full chart or adds pages to the same project. Review the import first, then set whole-cell offsets and confirm alignment in the difference preview. Unique geometry and thread matches keep progress; symbols and palette order do not identify stitches. Choose every ambiguous overlap, substitution or deletion explicitly. Region mappings support local shifts such as inserted pages. Notes and sessions stay with the project; displaced annotations and old edit caches require archival acknowledgement. Updates consume no thread. Recovery snapshots include original sources and before/after projects locally; use Update chart > Recovery snapshots to download or review a rollback. End sessions first. These local snapshots are not included in portable backups; download them before clearing browser storage. Format coverage is limited to the existing importer's supported content."],
            ["Start stitching or Edit first", "Start stitching saves the pattern and opens it in the Stitch Tracker, ready to mark. Edit first opens it in the Pattern Creator instead, and is the main button when you import from inside the Creator. A PDF holding several designs can be imported all at once with Import all; they are then listed under Your projects on Home."]
          ]
        },
        {
          heading: "Painting and editing stitches",
          body: "Once a pattern exists, the Tools and View tabs unlock in the sidebar. Choose a colour in the Palette tab, then pick a tool. Painting, filling and erasing are all undoable with Ctrl+Z.",
          bullets: [
            ["Stitch types", "Cross (1), Half / (2), Half \\ (3), Backstitch (4) and Erase (5), plus quarter and three-quarter stitches and French knots in the tool strip. Press T to step through the stitch types."],
            ["French knots", "Choose French knot as the stitch type, then tap or click a grid corner or the middle of a stitch: the knot goes on the nearest one, in the selected colour. Tap a knot again to remove it. Knots copy, flip, rotate and mirror with the stitches around them, count towards the thread you need (each about as much as one cross stitch) and are listed under their thread in Materials. They are saved in .oxs files, and drawn in PDFs that use the Workshop print theme; the Pattern Keeper preset leaves them out, as Pattern Keeper doesn't track knots."],
            ["Paint (P) and Fill (F)", "Paint colours the stitches you click or drag across; Fill colours a whole connected area."],
            ["Backstitch", "Click one grid corner and then another to draw a line between them."],
            ["Row and column numbers", "The rulers along the top and left number the chart the way the Tracker and a printed chart do: 1 for the first stitch, then every tenth (10, 20, 30), on the stitch just before the bold line. A cropped preview keeps the pattern's own numbers."],
            ["Brush size", "Paint, half stitches, Erase and shapes cover a square up to 10 × 10 stitches. Set the size in the Tools tab or under More tools."],
            ["Line, Rectangle and Ellipse", "In the Tools tab under Shapes, or under More tools. Drag from one end, or corner, to the other: a preview follows your finger or mouse, and the shape is stitched when you let go, in the selected colour and as wide as the brush. Rectangles and ellipses are an Outline or Filled. Keep lines straight or at 45° snaps a line to rows, columns and diagonals; it is on by default on touch screens. Each shape is one undo step."],
            ["Text", "Choose Text in the Tools tab under Shapes, or under More tools, then tap or click where the text should start and type it: a name, a date, a word. It appears on the chart as you type, in the selected colour. Pick the Block (7 stitches tall) or Serif (9 stitches tall) font, the letter and line spacing, and the alignment for more than one line; capitals, small letters, numbers, common punctuation including £ and &, and accented letters such as é and ñ are covered. Place leaves the text floating so you can drag it into position, then Done stitches it as ordinary cross stitches (it is no longer editable as text) in one undo step. If the text is wider than the pattern you are told, with Resize canvas and Use a smaller font to hand."],
            ["Mirror drawing", "Turn on Mirror in the Tools tab or under More tools, and choose the axis: Left–right, Top–bottom or Both. Paint, Erase, Fill, shapes and part stitches are copied across the dashed axis, half stitches turned to match, and each stroke with its mirror images is one undo step. The axis starts at the centre of the pattern; drag its round handle at the edge of the chart, or focus it and use the arrow keys, to move it half a stitch at a time (Home puts it back in the centre)."],
            ["Erase (5)", "Clears full and part stitches under the brush, and any backstitch line you drag across."],
            ["Eyedropper (I)", "Click a stitch to make its colour the current colour."],
            ["Navigate and Draw (H)", "The Navigate | Draw switch says what a touch or click will do, like Mark and Navigate in the Stitch Tracker. Navigate moves around without changing anything: drag the chart to pan it, tap a stitch to see its thread, and press and hold (or right-click) for its menu. Draw makes touches and clicks change the chart with the tool you picked. Choosing Paint, Fill, Erase or any other tool, or a colour swatch in the toolbar, switches to Draw; choosing Navigate keeps your tool. Every pattern opens in Navigate, on a computer as well as a touch screen, so a stray click edits nothing until you choose a tool. A new blank design (Start drawing) opens in Draw. Press H to switch."],
            ["On a phone", "The Creator keeps the chart as big as it can. The bar at the top has Home, the pattern's name (tap to rename it), whether your changes are saved, Convert / Edit / Materials (each with its name under its icon) and a More button for Print PDF, Export, Open in Tracker, Pattern info, Ready to stitch review and Help. The bar at the bottom names each control under its icon: Navigate | Draw, Paint, Fill (a tipped bucket pouring paint), Erase, Colour (tap it to open the palette), Undo and More. The line under the chart says what a touch will do, and wraps rather than being cut off. A notice from the Creator appears as one banner above it, one at a time. More has zoom (pinching works too), Fit, Show colour strip and the settings panels. The settings panel opens above the bottom bar and hides again when you close it."],
            ["Pen and finger navigation", "More tools > Pen draws; fingers navigate is opt-in. In Draw, a reported pen uses the selected tool and one finger pans; two fingers pan and pinch. Navigate still prevents pen edits. Mixed pen and finger contact interrupts the drawing and stays suppressed until all contacts lift. If a device reports its stylus as touch or mouse unreliably, leave this option off and switch explicitly between Navigate and Draw. No automatic pen detection is assumed. Mouse drawing stays available."],
            ["Interrupted gestures", "Pointer cancellation, lost capture, a hidden page, window blur or a viewport resize ends the gesture. An interrupted brush stroke remains one undoable action; an unfinished shape, lasso or selection drag is discarded, preserving the existing selection. Starting a two-finger navigation gesture discards the unfinished brush stroke too. The remaining finger cannot resume it. Fill and other single-action touch tools wait for lift so a pinch cannot trigger them."],
            ["On a touch screen", "The switch is the first control in the toolbar, and a new pattern opens in Navigate so the first swipe scrolls. In Draw, drag one finger to draw and use two fingers to pan and zoom; a second finger cancels a stroke you've started. Tapping the active Paint, Fill or Erase button again goes back to Navigate. On a computer the switch is in the Tools tab, and the Creator opens in Navigate too."],
            ["Editing a pattern you have stitched", "When a project has stitching progress, Edit shows a note such as \"This project is 34% stitched\". Changing the colour or stitch type of a cell you have marked done (painting, filling, erasing, replacing a colour, a palette swap or Revert to generated palette, Keep look-alike colours apart, cleanup, moving or pasting over it) sets that cell back to not done, so your progress never counts a stitch in the wrong thread. A toast says how many cells were reset and has an Undo button; Undo (and Redo) in the toolbar bring the marks back (or clear them again) together with the edit. Turn on Show stitched in the note to tint the cells marked done on the chart; turn it off the same way. Painting a stitched cell with the colour it already has changes nothing. Generating a new pattern from a picture still clears progress after asking first; export a backup first with File > Export Backup."],
            ["Placing stitches by touch", "In Draw, with Paint, Erase, a part stitch, backstitch or the eyedropper, a magnifier appears above your finger (below it near the top of the screen) showing the stitches under it, with a crosshair on the one you'll change. A tap places its stitch when you lift your finger, so you can slide onto the right square before letting go; move further and you draw a line as usual. For the finest work, turn on Precision cursor in More tools: a crosshair sits a little above your finger, your finger moves it, and lifting places the stitch there. Turn the magnifier off in More tools if you don't want it."],
            ["Zooming by touch", "Pinch with two fingers to zoom. In Navigate, double-tap a spot to zoom to 300% centred on it, and double-tap again to fit the whole chart. Touch screens can zoom in to 400%."]
          ]
        },
        {
          heading: "Selecting stitches",
          bullets: [
            ["Magic wand (W)", "Click a stitch to select every connected stitch of that colour; the side panel refines the selection and offers actions on it."],
            ["Lasso", "Draw a freehand, polygon or magnetic selection. Choose the lasso and its mode in the Tools tab."],
            ["Select all and invert", "Ctrl+A selects every stitch; Ctrl+Shift+I inverts the selection. Esc clears it."],
            ["Deleting a selection", "Press Delete or Backspace, or choose Delete on the selection bar, to clear every stitch in the selection, including part stitches and backstitch lines that sit inside it. Ctrl+Z brings them back."],
            ["Moving a selection", "Choose Move in More tools, then drag the selection or nudge it one stitch at a time with the arrow keys."],
            ["Copy, cut and paste", "With stitches selected, Copy (Ctrl+C) keeps them, including part stitches and the backstitch lines inside the selection, and Cut (Ctrl+X) keeps them and clears them. Paste (Ctrl+V, or Paste in More tools) puts the copy back where it came from, floating on top of the chart: drag it into place, then press Done or tap outside it. Cancel or Esc puts it back. Anything that lands outside the pattern is left out, and you are told. The copy stays while you switch to another project in the same tab, so you can paste it there."],
            ["Duplicate, flip and rotate", "Duplicate (Ctrl+D) floats a copy two stitches down and to the right. Flip horizontally (Shift+H), Flip vertically (Shift+V), Rotate left (,) and Rotate right (.) work on the floating copy, or lift the selection and turn it where it is; half stitches change direction and quarter stitches change corner to match. On a touch screen these actions are on the bar over the selection; on a computer they are in the Tools tab and the right-click menu. Placing it is one undo step, however much it was moved and turned."]
          ]
        },
        {
          heading: "The palette",
          body: "The Palette tab starts with the threads in your pattern: each row shows the thread's symbol on its swatch, its brand and number, its full name, how many stitches use it, and the strands and skeins it takes. Tap a row to paint with that colour (or to highlight it when no paint tool is chosen).",
          bullets: [
            ["Strands and skeins", "Each row says how many strands go in the needle and about how many skeins of thread that symbol takes on its own, from the stitch count and the fabric count (20% allowance for waste). The Materials tab adds up the threads several symbols share, so it can need fewer skeins than the rows added together."],
            ["What's a blend?", "A blend is one symbol worked with two threads together in the same needle: one strand of each. Its row reads, for example, DMC 341 + 826 (blend), and shows the skeins for each thread, which is half what a plain stitch of that thread would take."],
            ["Add colour", "Opens the thread picker. My stash lists the DMC threads you own (it appears when the Stash Manager is available), Suggested lists the threads closest to the colour you've selected, and All DMC has a search by number or name plus colour-family filters such as Reds, Blues and Neutrals. Tap a thread to add it. Blend (2 threads) builds a blended colour."],
            ["Change symbol", "The shapes button on a row offers the symbols no other colour uses. Pick one and the chart, the colour strip and the Materials legend all switch to it. Undo puts the old symbol back. Symbols you choose are kept when you reopen the project, but the Pattern Keeper PDF still chooses its own, so a changed symbol will differ on paper."],
            ["Symbols on swatches", "The colour strip shows each thread's symbol on its swatch, in black or white so it stands out, which helps tell similar colours apart. Press and hold a swatch to see its number, name and stitch count."],
            ["Replace a colour", "The swap button on a row replaces that thread throughout the pattern."]
          ]
        },
        {
          heading: "View modes and preview",
          body: "Switch display modes at any time with the V key or the View tab — view modes never change the underlying pattern.",
          bullets: [
            ["Colour, symbol or both (V)", "Shows each stitch in its thread colour, as a printed symbol, or as colour with the symbol on top."],
            ["Preview tab", "Renders the pattern as real stitches on fabric, from a plain chart up to a hoop or frame mock-up. The detail level and fabric colour are set in Preferences > Preview & display."],
            ["Split pane (\\)", "Shows the editable chart and a live preview side by side. Drag the centre handle to resize."],
            ["Ready to stitch", "Open the review from the Pattern tab or Materials. Compare the chart and stitch simulation, dimensions and material assumptions. Confetti stitches describe effort, not colour fidelity or retained detail."]
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
          heading: "Fix outline colours",
          body: "Fix outline colours removes dark border lines left over from converting a line-art illustration. Open More tools in the tool strip and choose Fix outline colours.",
          bullets: [
            ["Auto", "Finds the main dark line colour and shows an overlay of the stitches that will be replaced. How strict (Gentle, Balanced or Strong) narrows or widens the selection."],
            ["Brush", "Paint the stitches you want to clean up by hand — useful when only a small area needs it."],
            ["Apply", "Nothing changes until you press Apply, and the whole clean-up is a single undo step."]
          ]
        },
        {
          heading: "Reduce confetti",
          body: "Converting a picture always leaves some confetti stitches: single stitches of a colour on their own, which are slow to stitch. Reduce confetti finds and fixes three kinds of clutter without repainting by hand. Open it from More tools in the tool strip.",
          bullets: [
            ["Palette", "Merges threads that are almost the same, which colour matching sometimes picks by accident — for example two almost identical yellows. How strict (Gentle, Balanced or Strong) sets how close two colours must be; the more-used colour absorbs the rarer one."],
            ["Confetti (off by default)", "Merges groups of up to 3 stitches completely surrounded by one colour. Off by default because shading looks like confetti; a warning appears if your pattern has a lot of shading."],
            ["Fringe", "Smooths the thin band of in-between colours that forms along the edges of solid areas in an anti-aliased image."],
            ["Auto and Brush", "Auto shows an overlay of every stitch that would change, with counts for each kind; press Look again after changing settings. Brush lets you paint the area to fix by hand."],
            ["Apply / Cancel", "Nothing changes until you press Apply, and the whole operation is one undo step."]
          ]
        },
        {
          heading: "Adapting to your stash or another brand",
          body: "Adapt makes a copy of the pattern that uses threads you own, or a different brand. Use Adapt to my stash or Adapt to brand on the Project tab.",
          bullets: [
            ["Suggestions", "Each colour is matched to the available thread that looks most like it; the difference shown is how far apart they look, and lower is closer. Review the suggestions before confirming."],
            ["A new project", "The adapted pattern is saved as a separate project, so the original is untouched."],
            ["Anchor patterns", "When Adapt to brand moves every colour to Anchor, the copy is an Anchor pattern: the palette, Materials, shopping list, Stitch Tracker, PDF key and .oxs files show Anchor numbers and names. A copy that mixes brands keeps each thread's own brand."]
          ]
        },
        {
          heading: "Ready to stitch review",
          body: "Open Materials & Output > Ready to stitch before buying thread or fabric. Compare the original (when available), current chart and a full-cross stitch simulation rendered from chart cells. Screen colours are approximate, not physical colour calibration or a guarantee of retained detail. Review recognisable features, edges and text yourself. Finished size includes empty grid cells and excludes finishing margins. Material estimates use the Threads calculation: two strands, 20% waste and 8 m skeins; blends assume equal shares. Other stitch types may need extra materials. Confetti stitches (single stitches of a colour on their own; slow to stitch) and rarely used symbols measure stitching effort, not quality. Pattern info shows the same confetti count. They may be intentional detail: open Edit > Tools to inspect cleanup and preview changes before applying. Choose a representative region by its first row/column and width/height (up to 80 stitches each). Export sample chart PNG includes exactly that region, coordinates, key, finished size and current fabric assumptions. Try several regions and stitch a sample when colour or detail matters.",
        },
        {
          heading: "Threads needed and skein estimates",
          body: "The Materials & Output tab shows what the pattern needs, in four sub-tabs: Ready to stitch, Threads, Stash status and Export.",
          bullets: [
            ["Skein count", "Estimated skeins per thread, from the stitch count, fabric count, strand count and a waste allowance. A standard skein is 315 inches (8 metres). 25, 28 and 32 count are worked over two threads, so 28 count uses thread (and gives a finished size) like 14 count Aida."],
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
            ["Mark mode (T)", "Click or drag across the chart to mark stitches done. On a touch screen a tap marks one stitch, and a quick swipe scrolls the chart without marking anything. To paint a run of stitches, rest one finger on a stitch for a moment and then drag. Use two fingers to pan and zoom."],
            ["Paint and Lock touches (touch screens)", "In More (Controls), Paint makes a one-finger drag paint at once, with no rest first: good for long rows, but the chart no longer scrolls under one finger (use two). The Mark button reads Paint while it is on. Lock touches makes the chart ignore fingers, so a propped-up tablet cannot mark by accident; to unlock, hold the Touches locked pill until it says Lift to unlock, then lift your finger. Neither is remembered after you reload, and neither changes the mouse."],
            ["Coming back to a project", "The Tracker remembers the colour you were highlighting, Mark or Navigate, and the chart view (Symbol, Colour or Highlight), and puts them back when you reopen the project, even on another device. The welcome-back summary is a strip at the top of the chart rather than a dialog: you can start stitching straight away, and your first mark clears it."],
            ["Keeping the screen on", "On a phone or tablet the Tracker keeps the screen lit from your first mark and lets it sleep after 15 minutes without one; it says so once, with a Turn off button. Keep screen on, at the top of More, switches it for now and remembers your choice. Preferences > Stitch Tracker > Phones and small screens has Automatic, Always and Never. Not every browser can do this."],
            ["A hand on the screen", "Two fingers pan and zoom the chart. With three or more fingers down (a resting palm or a whole hand) nothing is marked until every finger has lifted, including a finger that lands on a French knot. When the screen is very short, such as a phone with the browser zoomed in, the row of controls beside the chart scrolls so More is still within reach."],
            ["Live stash deductions", "Tools > Use up stash thread as I stitch records full, half, quarter and petite stitches, long stitches, French knots and backstitch. Events retain their original fabric, strand, blend, tail and waste assumptions; changing preferences affects later stitches. Existing stock is preserved through an explicit baseline with unknown earlier usage. Ordinary unmark and Undo correct accidental progress and return only recorded debits. Use Unpick area for physical removal: used thread stays consumed and restitching charges again. Undoing an accidental Unpick area uses no new thread. Marks made while live deductions are off are recorded without a debit; re-enabling affects subsequent stitching. Tools > Thread consumption history explains estimates, debits and corrections. Full backups and stash sync preserve the complete event history; update every device before syncing. Conflicting history or combined usage beyond recorded stock needs inventory reconciliation."],
            ["Keyboard chart status", "Focus the chart with Shift+G. The summary gives dimensions and zoom; after a short pause, the status reports the guide position, full-cross mark state, progress in stitch units, selected thread and zoom. Rapid marking is announced as one settled update. G focuses a separate Select button in the thread list; thread details and Done are independent buttons. Thread-detail swatches keep their colour in both themes. Enter or Space activates buttons, including Undo and zoom; Space toggles layer checkboxes. More moves focus into the controls, keeps Tab inside and returns focus on Escape or Close. Import errors remain until the next import; the normal empty import screen does not warn about a missing project. Hidden full crosses cannot be marked on the chart; show their layer first."],
            ["Highlight tab", "The chart view (Symbol, Colour + symbol or Highlight), the highlight style (Isolate, Outline, Tint or Spotlight), Counting aids and Skip done stitches are all in the Highlight tab of More. The V key cycles the three chart views. Use up stash thread as I stitch is in the Tools tab."],
            ["Zoomed in, or on a narrow screen", "Below 1024 pixels wide, which includes a desktop browser zoomed to 200%, the colour legend starts shut so the chart is what you see; open it with the Colours button (or G, then Tab through the colours). Text and controls are held to a 4.5 to 1 contrast against their background in both themes, the dark theme has its own lighter accent, a focus ring shows on whatever the keyboard is on, and a selected colour, a finished milestone, the next one and an upcoming one each differ in more than colour (an edge bar, a tick, the word Next, a dashed border)."],
            ["Marking with the keyboard", "Tab to the chart (it gets an outline). The arrow keys move the guide crosshair (Shift moves 10 stitches); in row mode Up and Down change the row instead. In Mark mode, Enter marks or unmarks the stitch at the guide (the first Enter just shows the guide), and Space does too once the arrow keys have the guide. Shift+Enter marks or unmarks the rectangle from the last stitch you marked with the keyboard to the guide, as Shift+click does. [ and ] change colour, G goes to the colour legend and Shift+G back to the chart, T and N switch Mark and Navigate mode, Ctrl+Z undoes. Esc clears the guide, and a click on the chart gives Space back to hold-to-pan. Navigate mode never marks: the keyboard only moves the guide there."],
            ["Pattern overview", "When the pattern is bigger than the chart box, a small map of the whole pattern sits in the corner of the chart. Finished areas show in full thread colour and the rest is faded, and the outlined rectangle is what you are looking at. Tap or drag the map to jump there, or focus it and use the arrow keys (Shift for bigger steps). It hides itself when the whole pattern fits, and you can turn it off in More > View or Preferences > Stitch Tracker. On a phone in Focus mode it starts closed; the map button opens it."],
            ["Finished stitches", "In Symbol and Colour views a done stitch fills with its thread colour and keeps a dimmed symbol, so finished areas stand out even in greyscale; not-done stitches stay pale. The key under the progress bar shows both looks. A done stitch is drawn in its thread colour, but very pale threads are toned down to light grey, so white and ecru look grey once stitched. Choose Corner tick instead (More > View, or Preferences > Stitch Tracker) to keep each stitch as it was and add a dark tick in its corner. Zoomed out until cells are too small for symbols, every stitch is one coloured pixel: done in its thread colour, not done faded, so the whole pattern still reads at Fit."],
            ["Marking a whole colour", "In the colours list, Mark all done on a colour's row marks every full stitch of that colour, and Mark all not done (shown once the colour is finished) clears them. Half stitches, knots and quarters are marked on the chart, and backstitch has its own Mark all lines done chip. You are always asked first, with the colour and the exact number, and the change is one step: press Undo on the toast that follows, or the ordinary Undo, to put everything back. Tapping the row itself only selects the colour. In a work area the change covers only that part. Clear all on the park markers asks first too, and Undo also brings back which colours were hidden. While a question is open, keyboard shortcuts such as Ctrl+Z are held back until you answer."],
            ["Undoing a stroke", "When one drag or rectangle marks (or unmarks) more than five stitches, a message offers Undo N stitches for a few seconds. It is the ordinary Undo, so the whole stroke goes in one step."],
            ["Navigate mode (N)", "Move around without marking anything: drag the chart to pan it. Click a cell to place a guide crosshair across its row and column; click it again, or press Esc, to clear it. On a touch screen, drag to scroll and tap to place or clear the guide."],
            ["Marking a rectangle", "Hold Shift and click a stitch to mark the whole rectangle between it and the last stitch you marked (Shift-drag shows the rectangle before you let go). On a touch screen, press and hold a stitch, then tap another one."],
            ["Parking", "Shift + right-click a stitch (in Mark or Navigate mode; Shift+Ctrl+click on a Mac) to mark that a thread is parked there. Menu or Shift+F10 parks at the guide with the chart focused. On a touch screen, press and hold the stitch: in Navigate mode that parks straight away; in Mark mode it starts a rectangle, and the bar that appears has a Park thread here button. The marker is a small triangle in the stitch's colour, outlined so it shows on any background, and it stays visible through the Spotlight and work-area dimming. Do the same again to remove it. It also clears itself when you mark that stitch done, and comes back if you undo."],
            ["Finding a parked thread", "Tap the P on a colour in the palette to jump to where that thread is parked; the guide crosshair marks the spot. If it is parked in more than one place, tap again for the next."],
            ["Park markers list", "The Park markers list in the sidebar shows each parked colour, with a checkbox to hide its markers and a Clear all button."],
            ["Undo", "Undo (Ctrl+Z) and Redo cover whole stitches, either half-stitch direction, quarters, knots, backstitch, strokes and parking. A new mark clears Redo. History holds the latest 50 steps while this project is open; loading a project clears it."],
            ["Beads", "Open Beads above the progress strip to select and complete or unmark each bead with the mouse, touch or keyboard. Tapping a bead on the chart selects it; repeated taps cycle overlaps without marking stitches beneath. Bead totals stay separate from stitch percentages and session stitch counts. Save, reload, backups and sync preserve marks. An edit or move retaining the bead object ID retains completion; deletion removes it from live counts. Copies require a new object ID. Creator drawing tools currently do not edit beads. PDF and image exports omit beads; OXS preserves appearance and position but omits completion and object IDs. Use project saves or backups to retain the full tracking lifecycle."],
            ["French knots", "In Mark mode, tap or click a knot to mark it done: it fills in. Tap it again to unmark it; Undo works too. Knots count towards your progress, one each, and the colours drawer shows them under their thread."],
            ["Notes and photos", "Open More, then the Session tab. Notes is a text box for things you want to remember about this project (where you stopped, a thread or fabric change); it saves by itself and travels with the project and its backups. Photos keeps up to 12 pictures of your work: choose Add photo and pick one or take one with the camera; it is shrunk to fit (about 1600 pixels across and under 700 KB), shown as a small thumbnail, and opens full size when you tap it, where you can delete it. Photos are kept on this device and in backups, are removed with the project, and travel with Sync through verified attachment manifests. Nothing about them is read until you open the Session tab, so they cannot slow the chart."],
            ["Unpick area", "To take a whole section back out, say a few rows you stitched wrongly: with a finger, press and hold a corner stitch, tap Unpick area on the bar, then tap the opposite corner. With a mouse, click a corner stitch, then Shift+click the opposite corner and hold Alt as you let go (with Alt held the rectangle is unpicked instead of filled). With the keyboard, mark a corner stitch with Enter, move the guide to the opposite corner and press Ctrl+Shift+Enter (Cmd+Shift+Enter on a Mac). Whole stitches, half stitches, quarters, French knots and the backstitch lines wholly inside the rectangle are all unmarked, as one undo step; Undo brings them all back. The corners need to be stitches. A colour lock only unpicks that colour. The journal and Stats show it as, for example, Unpicked 80, on its own line: it is never taken off the day's stitches or counted as a negative day."],
            ["Backstitch lines", "Each backstitch line shows dashed and faint until it is done, then solid. In Mark mode, tap or click on a line to mark it; press and drag along a run of lines to mark every one you pass, as a single undo step. A press counts as on a line when it is within about 14 pixels of it with a mouse and 20 with a finger, never more than half a stitch, so it scales with the zoom; where the stitch beneath is nearer than the line, the press marks the stitch as before. With a finger, a magnifier shows the cells around your fingertip while you press. With the keyboard, put the guide on a stitch, press B to choose a line that touches it (B again for the next, once more to clear the choice) and press Enter to mark or unmark it; an arrow key moves the guide. In the colours drawer a colour shows its lines as, for example, 3/8 lines, and its Lines button marks or unmarks every backstitch line of that colour. Backstitch is counted on its own row, in lines (Progress info and the strip), and is not part of the percentage. A colour lock only lets you mark lines of that colour; the Backstitch layer switch hides them."],
            ["Petite and long stitches", "In Creator, open More tools > Petite and long stitches. Choose a thread, then add a petite cross using its top-left position or a long stitch using two endpoints. Coordinates start at zero in chart cells and use half-cell steps. Select an entry to edit or delete it; Undo and Redo restore the object. Use this panel for these objects; general canvas selection tools edit other stitch types. In Tracker, click a drawn object or open Layers > Petite and long stitches to select and mark overlapping objects separately. Hidden layers cannot be selected or marked. Each petite counts as 0.25 progress units and each long stitch as 0.5; marking covers the whole object. Area unpick includes objects wholly inside its rectangle. Native JSON saves both types and their marks; PNG draws them. OXS preserves petites and warns with a count for unsupported long stitches. PDF and PDF-containing ZIP export stop with an explanation. Realistic previews and material estimates do not include these objects."],
            ["Quarter stitches", "A cell with quarter stitches shows each one faded until it is done. In Mark mode, tap or click the quarter you have stitched: the one nearest your finger or pointer fills in, and a second tap unmarks it. If the cell also has a whole stitch, mark that first; the next taps then mark the quarters. With the keyboard, Enter at the guide marks the first quarter not yet done, and again for the next; when all are done it unmarks the last. Undo and Redo cover each one. A colour lock only lets you mark quarters of that colour. The colours drawer shows them as, for example, 2/3 fractional."],
            ["Stitching on a phone", "On a phone the Tracker opens in Focus: the top bar and the progress strip are tucked away, so the chart fills the screen above a thin progress line (the percentage and how many stitches are left). Tap Exit focus at the bottom to bring them back. Preferences > Stitch Tracker > Phones and small screens can turn this off. The buttons beside the chart (Colours, Mark, Nav, Fit, Area, Undo, More) can sit on the left instead of the right there too. The first button shows the colour you are on; tap it to choose another."],
            ["Notices on a phone", "A phone shows one notice at a time, as a banner the width of the screen just above the bottom controls, so the chart stays clear. When two arrive together, such as Keeping the screen on and Sessions are tracked automatically on your first mark, the second waits for the first. Errors and Undo offers go first, and a notice that is only information goes by itself after a few seconds. A tip about marking waits until the banner has gone."],
            ["The how-to-mark banners", "The short hints above and below the chart go away as soon as you have marked your first stitch, and they do not come back. The gestures are listed here, under Mark mode."],
            ["Colours drawer (D)", "Shows your progress per colour, with each colour's brand, number and full name, the strands in the needle and the skeins it takes. Sort by Remaining, % done or Number. A blend is shown as, for example, DMC 341 + 826 (blend); tap What's a blend? above the list for how to stitch one. Click a colour, or right-click a chart stitch (Ctrl+click on a Mac), to select its colour and enter Highlight view. This works in Mark and Navigate modes, including stitches already done; empty cells are ignored. On a laptop it sits at the left, below the top bar, so the logo and the Create, Edit and Track tabs stay clickable; on a phone it opens over the chart from the Colours button."]
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
            ["Toggle (C)", "Press C or tap the counting aid button in the toolbar to show or hide the overlay. They are off until you turn them on, and the Tracker remembers your choice."],
            ["Highlight view", "With a colour selected in Highlight view, counting aids show how many stitches of that colour are left in each block, the length of each horizontal run of three or more unstitched stitches, and a star on confetti stitches (a stitch with no neighbour of the same colour). They are drawn as dark-outlined light badges so they read on any thread colour, in light or dark mode."],
            ["Zoom in to see them", "Counting aids are hidden when the cells are smaller than 12 px, where the badges would pile on top of each other. Zoom in and they come back; the Highlight tab says so when this is why you see none."],
            ["10×10 grid", "Thin lines divide the canvas into 10×10 stitch blocks, matching the bolded squares on most printed charts."],
            ["Crosshair", "The guide crosshair runs across a whole row and column, so you can follow a line of the chart. Place it in Navigate mode by clicking a cell (or, with the chart focused, with the arrow keys). The bar under the chart shows its row, column and thread, with a Clear guide button; clicking the same cell again or pressing Esc also clears it."]
          ]
        },
        {
          heading: "Stitch layers",
          body: "Full stitches, half and part stitches, French knots and backstitch are drawn as separate layers, so you can hide the ones you are not working on.",
          bullets: [
            ["Shift+F, Shift+H, Shift+K and Shift+L", "Show or hide the full-stitch, half-stitch, French-knot and backstitch layers. They need Shift so that a stray keypress cannot blank the chart; the bare F key switches focus mode on and off."],
            ["Shift+A", "Shows or hides all layers at once."],
            ["Hidden layers", "Layers stay hidden when you reopen the project. While a layer that has stitches is hidden, a chip in the progress strip (above the focus mode bar, when the strip is hidden) says which, for example Full stitches hidden · Show. Choose it to show them all again."]
          ]
        }
      ]
    },
    {
      id: "manager", area: "Stash Manager",
      sections: [
        {
          heading: "Thread stash",
          body: "The Thread Stash tab tracks which DMC and Anchor threads you own, how many skeins, and what is running low. Custom thread catalogues imports user-owned CSV reference records after validation and duplicate preview. Export preserves codes, names, optional approximate RGB, status, substitutions and user-supplied provenance. Custom records stay separate from matching palettes and projects; substitutions are never automatic. Bulk Add requires all unrecognised or opposite-brand tokens to be corrected or removed, and saves the batch atomically.",
          bullets: [
            ["Skeins owned", "Select a thread to set how many skeins you have. Composite keys (for example anchor:403) keep DMC and Anchor numbers that look the same apart."],
            ["Part-used skeins", "Mark a thread as Mostly full, About half, Remnant or Used up. Used up sets the skein count to zero."],
            ["To buy and conflicts", "A pattern that needs threads your stash doesn't cover gets a To buy panel (for example, To buy for Meadow (12 threads)) listing what is short. It is a plain shopping list, not a problem. The Stash Manager's Shopping list already includes these threads; Add to shopping list pins them there with the quantities shown, so they stay on the list if the pattern changes. Thread Conflicts appears only when two or more active patterns need the same thread and your stash can't cover them between them; it names the patterns. A pattern on its own never causes a conflict, and completed patterns are left out."],
            ["Alert panels", "To buy, Thread Conflicts, Low Stock — Needed and Low stash — not currently needed each have a heading button. Tap it, or focus it and press Enter or Space, to hide or show the description and list. The heading keeps the current count. Each choice is remembered on this device across visits, reloads and periods with no alerts; hiding a panel does not dismiss alerts or change your stash."],
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
            ["Stash-constrained generation", "When Use only stash threads is on in the Creator, every thread you own in the brand chosen under Threads (DMC or Anchor) is available to the generator."]
          ]
        },
        {
          heading: "Project material reservations",
          body: "Stash Manager > Project materials separates owned, reserved, available and estimated-needed skeins. Reserve estimated needs or set a fractional skein limit. Reserving never consumes stock. Claims use stable project-ID order, adjust with unfinished chart estimates and release for completed, archived, abandoned (UFO) or deleted projects. Available excludes all claims. Shopping lists share remaining free stock once; use the combined list to avoid duplicate purchases. Only the combined shortage is rounded up to whole skeins. Refresh after edits or purchases. Confirm substitutions explicitly using brand:number; the original chart identity stays unchanged and subsequent consumption uses the confirmed replacement. Remove a substitution before changing its replacement. Estimates use saved live-deduction geometry, count, strands, tails and waste, with 1,890 single-strand inches per skein. These differ from the older rounded Creator shopping estimator. Fabric and beads are excluded. Export shopping list JSON for a portable snapshot; full backups preserve reservation intent with stock and consumption history. Project-only exports do not reserve stock on another device.",
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
            ["Save status", "The badge beside the project name in the Tracker says where things stand: Saving… while changes are not yet written, Saved just now (or Saved 2 min ago) once they are, Save failed with a Retry button if the browser could not store them, and Not saved yet while the question about the project having changed in another tab is waiting for you. If a save fails, try File > Export Backup. If the latest changes cannot be saved for export, the backup stops with an error and the last backup time stays unchanged. Keep the page open, resolve the storage problem and retry; do not reload while changes are unsaved. On a phone or small tablet the badge is just its icon (a tick when everything is saved, a pencil while changes are waiting) to save room; a save problem still shows its words."],
            ["Stitch marks in the Tracker", "Stitches you mark are saved within about half a second, on their own, so closing the tab, or your phone putting the page to sleep, right after marking does not lose them. The rest of the project (your session history, settings, park markers and view) is saved every few seconds and whenever you leave or switch project."],
            ["Two tabs on one project", "If you have the same project open in two tabs and mark stitches in both, the Tracker combines them: a stitch marked in either tab stays marked, one you unpicked in either tab stays unpicked, and a message tells you when the other tab's stitches were added. Your undo history in the tab that received them is cleared. If the other tab changed something other than stitches (the pattern, name or settings), you are asked whether to reload or keep your edits instead."],
            ["Backup reminder", "The File menu shows when you last downloaded a backup (File > Export Backup) under that item. Because projects are stored only in this browser, the Tracker offers a backup once a session when it has been 14 days since your last one (or since you first marked stitches, if you have never backed up). Choose Back up now to download one, or Not now to hear about it again in a week. The same offer appears once per visit on Home if you have stitched something."],
            ["If a pattern changes after you have stitched it", "If the saved stitch marks no longer fit the pattern (it has a different number of stitches), the Tracker asks before changing anything: keep your progress where cells still match, start progress again, or leave the project as it is. Keeping assumes rows or columns were added or removed at the bottom or right edge. If you keep your progress or start again, your earlier full-stitch marks are saved as a snapshot, listed under Stats > Compare; if you leave the project as it is, nothing is changed or saved. In the Creator, resizing the canvas keeps your marks in place, and generating a new pattern from a picture asks first and saves a snapshot."],
            ["Download (.json)", "File > Download (.json) writes a copy of the project to a file: the pattern, your edits and your tracking progress. Open it again in the Creator or the Tracker."],
            ["Export PDF and .oxs", "Materials & Output > Export has named global PDF presets. Save current settings, apply, rename/update or delete a preset. Full backups preserve them; project files and sync do not. Chart only removes cover, info, index and all legends; enable Thread legend pages for a key. The layout illustration shows paper dimensions, chart bounds, overlap and exact page counts. Profile branding is optional on cover/info pages and uses your current profile, with the project designer taking precedence. Leave Workshop print theme off for Pattern Keeper. File > Export PDF… exports a chart straight away with your saved export settings — the ones on the Export tab of Materials & Output. In the Tracker it first shows the main settings. Export .oxs writes a file other cross-stitch software (MacStitch, WinStitch, FlossCross) can open."],
            ["Storage", "The top of the File menu shows how much space the app is using, and whether the browser has made it Protected (kept) or Temporary (may be cleared when space runs low)."]
          ]
        },
        {
          heading: "Full backup",
          body: "File > Export Backup downloads every project, your stash and portable global preferences as one file (.csb, or .json). These preferences include designer branding and logo, PDF export defaults, creation and tracking defaults, accessibility, display, notification and regional choices. Restore it with File > Restore from Backup…, or from Preferences > Sync, backup & data. Restore validates the entire archive and stages projects, attachments, stash and settings before publishing them together. Existing projects are retained; identical records are skipped and conflicting identifiers stop the import. Use a fresh browser profile to recover a conflicting version. Portable preferences in the file replace your current choices. Close other stitchx tabs first; the page reloads after import. Missing or invalid portable preferences use defaults. Older backups without preferences keep your current choices, or use defaults on a new device.",
          bullets: [
            ["When to back up", "Before clearing your browser data, switching browser, or deleting projects you might want back."],
            ["Device settings stay here", "Per-pattern zoom and scroll positions, pane layouts, touch and keyboard controls, wake-lock settings, onboarding dismissals and experimental switches are not transferred. Sync configuration, folder permissions, credentials, temporary handoffs and migration markers are not transferred either. Set up Sync separately on each device; its preference-sharing option is unchanged."],
            ["Recovery limits", "New backups include photo originals, thumbnails, tracing pictures and session checkpoints, with an integrity manifest. Legacy backups remain readable but cannot prove attachment completeness. Corrupt archives, missing attachments and files above 64 MiB (including expanded compressed data) stop before publication. Staging needs room for another copy; if storage is full, your current data remains usable. A backup download request does not prove the browser saved the file: check your Downloads folder. Local save, backup and Sync have separate status."],
            ["Not encrypted", "Backup files are not encrypted and can contain your designer contact details and logo. Keep them somewhere private."]
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
          heading: "Automatic WebDAV sync",
          body: "Open Preferences > Sync, backup & data > Automatic WebDAV sync. Use a private collection on an existing or self-hosted WebDAV server, such as Nextcloud. Enter its HTTPS collection URL, username and an app password, then Connect and sync on each device. This shares your whole local library plus enabled stash/settings; keep unrelated accounts in separate browser profiles. No account or server is created by stitchx.",
          bullets: [
            ["Server setup", "Create a private stitchx folder under your account. For Nextcloud, use https://your-host/remote.php/dav/files/your-username/stitchx/. Keep the app’s narrow Content Security Policy: proxy WebDAV under the same origin, or ask the deployment administrator to add only the chosen server origin to connect-src on each app page. The server must allow your exact stitchx origin through CORS for OPTIONS, PROPFIND, GET and PUT; allow Authorization, Depth, Content-Type, If-Match and If-None-Match; expose ETag and Content-Length. Require atomic PUT and strong ETags with conditional writes. Ask your server administrator to configure these; public shares and servers that strip conditions are unsuitable."],
            ["Security", "Use HTTPS and a dedicated revocable app password. The server enforces per-account folder access. All projects in this collection are shared with authorised devices; there is no project-level sharing UI. Do not put passwords in URLs. Credentials stay only in the connected page’s memory; reconnect after reloading, closing or navigating to another page."],
            ["Foreground only", "Visible online pages poll every 15 seconds and coalesce local saves with a one-minute upload cooldown; Retry now sends immediately. Hidden/offline pages pause and recheck on return. iOS can suspend the app in the background: continuous background sync is not available. Keep a single connected tab per device."],
            ["Retry, cancel and disconnect", "Retry now resumes paused transfers. Temporary failures retry with bounded backoff; revoked credentials stop requests until you reconnect. Cancel sync pauses this connection. Disconnect cancels network work, waits for any local import already committing, and forgets credentials and its pending review. Local projects, attachments and backups remain; remote files and other connected tabs are retained."],
            ["Status and conflicts", "The cloud popover and Preferences show WebDAV transfer status separately from local-save and backup status. Transfer completion cannot prove peer receipt. Open File > Review sync for conflicts; other deliveries wait while you review. Photos and tracing pictures use the existing integrity and conflict rules. Interrupted transfers restart the complete file; byte-range resume is not provided."],
            ["Limits", "Up to 100 device files, 64 MiB compressed and 128 MiB expanded per delivery. Older v1 exports remain available through manual import. No credentials or connection setup travel in sync files or backups."]
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
            ["Stitch progress", "Full, half and quarter stitches, petites, long stitches, beads, knots and backstitch merge independently, including unpicking. If devices mark and unpick the same stitch without seeing each other’s changes, unpicked wins. Sync first, then mark it again to restore it."],
            ["Attachments and status", "Photos, thumbnails and tracing pictures travel with a manifest and content checks. A missing required file stays pending; corruption or an interrupted write is failed and can be retried. Optional source pictures can be explicitly excluded. Completed means this import finished or this export was handed to the existing transport; it does not confirm receipt on another device."],
            ["Older sync files", "Version-1 files still open, but cannot prove attachment completeness. New files use version 2: update every device before exchanging them. Without removal history, empty or missing marks do not mean unpicked. Update every device for reliable unpicking; older apps cannot preserve the new removal history."],
            ["Notes and parking", "Notes, session edits and parking changes retain removal and edit history. Concurrent incompatible edits need an explicit choice; timestamps do not decide which text survives."],
            ["Conflicts", "Different chart structures, concurrent notes and incompatible stash baselines need review. Consumption events merge once with the selected stash baseline. Deleted projects stay deleted until you explicitly restore them, even if another device has a later clock."],
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
            ["Chart symbols", "PDF charts assign their own embedded symbols. Unless you changed a symbol with Change symbol, the symbol on screen is the same shape as in the PDF for that thread, because both come from the same set and the same order. Adding or removing a thread can move later threads to a different symbol, in the chart and in the PDF alike, so reprint if you change the threads. Each used thread or blend gets a distinct symbol in both chart modes, the key and page summaries. Up to 112 used threads and blends are supported; unused palette colours and empty cells do not count. Exports above this limit stop with an error so stitches cannot share a symbol."],
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
          body: "Home is the hub for all your projects. Every pattern you create, open or import appears there, with a preview, its size and its progress. Filter by In progress, Not started or Finished; past 12 projects, Show all lists the rest. Each card opens the project in the Stitch Tracker; its More menu has Edit pattern, Export or print, Update chart and Project details. A project you have every thread for is marked You own every thread.",
          bullets: [
            ["Active project", "The project you most recently opened. It is the one the Creator and Tracker open by default, and the one Home's Continue card offers first."],
            ["Switching projects", "Pick a project on Home, or use File > Switch Project… from any page."],
            ["Renaming", "Click the project name in the top bar to rename it. On a phone, tap the project button at the top left and choose Rename. A pattern still called Untitled design, 80×80 pattern or a camera file name such as IMG_2041 is offered a name, once, the first time you print or export it or open it in the Tracker. A name you chose, or a file name worth keeping, is never questioned."],
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
            ["Thread", "One colour of stranded cotton, such as DMC 310. Thread counts are how many to buy."],
            ["Symbol", "A mark on the chart. A solid stitch's symbol stands for one thread; a blend's symbol stands for two threads stitched together, so a chart can have more symbols than threads. No two threads or blends on a chart share a symbol, and the symbols match the printed PDF."],
            ["Active project", "The project you most recently opened; the Creator and Tracker open it by default."],
            ["Ready to stitch", "The review in Materials compares the source, chart, full-cross simulation, finished size and material assumptions before buying."],
            ["Fabric count", "Stitches per inch of fabric. Common values: 11 count (large stitches), 14 count (standard — 14 stitches ≈ 1 inch), 18 count (fine), 28 count (very fine, usually worked over two threads). Change it in Convert > Size & fabric (before you generate) or Edit > Project > Fabric; Materials shows it with an Edit link to the same setting, so there is only one value."],
            ["Difference", "How different two colours look — lower means a closer match. Shown when matching picture colours to threads and when suggesting replacement threads."]
          ]
        },
        {
          heading: "Blends and confetti",
          bullets: [
            ["What's a blend?", "A blend is one chart symbol worked with two threads together in the same needle. Put one strand of each thread in the needle, so the needle holds the same two strands as a normal stitch, and stitch as usual. The two colours mix into the in-between shade. Each thread gives only one strand, so a blend uses half as much of each thread as a plain stitch of that colour. A blend reads, for example, DMC 341 + 826 (blend)."],
            ["Allow two-thread blends", "The Convert setting that lets the Creator use blends. On: smoother shading, but more chart symbols to follow. Off: every stitch is one thread, so there are fewer symbols and coarser shading."],
            ["Confetti stitches", "Single stitches of a colour on their own; slow to stitch. Each one needs its own thread pass, so a chart with many of them takes longer. Ready to stitch, Pattern info and the Convert preview all count them the same way."],
            ["Reduce confetti", "Merges confetti stitches into the colour around them. It is a setting in Convert and a tool in More tools once a pattern exists."]
          ]
        },
        {
          heading: "Save vs. Download vs. Export",
          bullets: [
            ["App updates", "Updates download and validate in the background. Finish your work, close all stitchx tabs and app windows, then reopen to use the update. An incomplete download keeps the working offline version. Project saves are stored separately from application caches."],
            ["Save", "Write to the app's own storage on this device (no file appears). Happens automatically as you work. Recent Tracker marks are also kept when you reload or leave the page."],
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
          body: "The Stats page (Stats in the top bar) summarises your stitching across all projects, in Stitching, Stash, Showcase, Activity and Insights tabs. Each figure appears in one place only: the Stitching tab holds your totals, streak, recent pace and the week-by-week summary, and Stash keeps just the stash figures. Showcase is only for all projects, not for a single project.",
          bullets: [
            ["Total stitches and Lifetime", "Count the stitches marked on your charts across all projects, in the same units as each project's own progress, so they agree with the Tracker, Home and the Library. They count marks straight away, without waiting for a session to finish. Speed and time still come from your recorded sessions."],
            ["Time", "Adds up the time from your Tracker sessions."],
            ["Stash", "Shows what your stash covers, which projects you could start with threads you own, and how long your stash would last at your current pace."],
            ["How progress is counted", "Progress keeps exact fractional units, including in Stats and saved project summaries. Incomplete counted work displays at most 99.9%; completion prompts always use the whole project, regardless of hidden layers or a work area. Progress is counted in stitch units: a full cross stitch is one, a half stitch is half, a quarter stitch is a quarter and a French knot is one, so a pattern with 1,742 full stitches, 30 half-stitch sides and 2 knots has 1,759 units. Quarter stitches are marked and counted now, so a pattern that has them can show a lower percentage than before until they are stitched; backstitch is counted on its own and is not in the percentage. The same figures appear in the Tracker's strip, header and Progress info, the project and global Stats, the Home cards and library, the share text and the CSV export. Sessions recorded before this was introduced counted a half stitch as a whole one, so their daily totals can read a little high; the percentage is always exact because it is worked out from your marks, not from sessions. Each project card shows its progress once, as a bar with its percentage; the stitch counts are in its hover text."],
            ["Compare snapshots", "In a project's Stats, Compare shows your marked stitches as they were on an earlier day beside how they are now. Automatic daily Compare snapshots are off by default for everyone, including existing users. Enable them in File > Preferences > Stitch Tracker to start from the current stitching day without filling missed days; the first mark of a new stitching day saves a snapshot (the last 60 automatic snapshots are kept). Save snapshot works whether automatic snapshots are on or off. Select a snapshot and use Delete snapshot, or Delete all automatic snapshots to keep manual and Before pattern change recovery snapshots. Both actions ask for confirmation and are disabled in read-only views. Deletions are saved with the project and travel through Sync. These controls do not affect project autosave or session recording. A snapshot taken before the pattern changed size cannot be drawn against the new pattern; it says so and still shows its stitch count."]
          ]
        },
        {
          heading: "Sessions and streaks",
          body: "Each Tracker session is logged with its start time, duration and the stitches added.",
          bullets: [
            ["Streaks and goals", "A streak counts weeks in a row with some stitching, so a few days off cost nothing; days in a row are shown too only if you turn that on. A day counts when you added stitches; a day where you only unpicked, or only marked catch-up, does not. Streaks, goals and the messages when a goal or milestone is reached can all be turned off in Preferences (Stitch Tracker, Streaks, goals and celebrations): every figure and chart stays, and nothing is ever counted against you for a day or a week off. If you already had goals or a stitching history when this was added, it starts on; otherwise it starts off."],
            ["Finish estimates", "Every estimated finish date comes from one calculation. It looks at your last 4 weeks (or the days since you started, if that is fewer): how many stitches you add on a stitching day and how often you stitch, then spreads the stitching days you still need over the calendar at that rhythm. The estimate shows a range and says what it is based on, for example \"2.8 stitching days a week, 145 stitches per stitching day\". Until you have at least 3 stitching days and 5% done, it says \"Not enough history yet\" instead of guessing. Time left is worded the same way everywhere, hours of stitching first and then, once there is a pace to go on, calendar time: \"about 424 hours, about 4 weeks at your pace\". With no stitching history the hours use the default speed of 40 stitches an hour, the same as the Creator. The Tracker, Progress info, Stats, Insights, Home cards, milestones, the what-if slider and the share text all use it."],
            ["Day boundaries", "Each stitch counts for the day it was made. A session that runs past the end of the day is saved as one record per day, so Today does not change when the session is saved. \"Day ends at\" (beside your goals in Stats, and in Preferences) sets when the day turns over: late-night stitching counts for the previous day until then. The same setting is used in the Tracker, project Stats, global Stats, Activity and Insights."],
            ["Unpicking", "Today, your pace and your best day count the stitches you added. Stitches you take out again show on their own as Unpicked, in the progress details and the session journal, and never reduce Today or your speed. Your overall progress does go down."],
            ["Undo and session totals", "Undo corrects the original action rather than recording physical unpicking; Redo restores its original contribution, including catch-up. Repeating them adds no stitching, pace or streak activity. Corrections belong to the action's original stitching day and session, even after End session or a day boundary. A finished session keeps its measured time and notes. If you explicitly edit, merge or delete that journal record, later chart Undo/Redo leaves that journal change intact. Undoing Unpick area removes its original unpicked contribution; Redo restores it without recording it twice."],
            ["Catch-up", "Marking a whole colour done in the palette, or filling a rectangle of more than 50 stitches, can be counted as catch-up: it raises your progress but not today's count, your pace, your goals or your streak, which suits recording stitching you did on paper. The first time, you are asked; change the answer any time in Preferences, under Stitch Tracker."],
            ["Reading the Stats page", "The page fills the width of your screen in tiles that wrap to fit, and goes to a single column on a phone. The top tile has the figures you usually want: how far along you are, what you stitched today and this week, and the estimated finish with what it is based on. Streaks and milestones sit beside it, then the chart with your goals next to it. Tap a chart (or move the slider under it, which also works from the keyboard) to read the value for that day, and open \"Show the data as a table\" for the same numbers as text. The Visuals button above the tiles switches to the picture-based views: Sections, the Before / After comparison, and one Colours panel (how much of each thread is left, when you worked it, with filter and sort), all open and full size. Colour names wrap, bars use the available width and counts stay readable. Dense section grids and charts scroll inside their tile; comparison pictures keep the pattern’s proportions, including large patterns (the page remembers which view you used last). Settings is closed to start with; open it and it stays open next time. The same figures are in Progress info while you stitch, which has an Open Stats button."],
            ["Timer and estimated times", "Stitching starts a session by itself, and its time is worked out from when you marked stitches, so it is shown as an estimate. For an exact time, press Start timer (on the colour palette header or in the Session panel): it counts the whole time it runs, except pauses and time the tab was hidden. Press the timer in the progress strip to open the Session panel and stop it; you are shown the time and can change the minutes before it is saved. Journal entries say whether their time was timed, edited or estimated, and no speed is shown for an estimated session under 10 minutes. If a timer sits past your idle time with nothing marked, you are asked whether to trim it to your last stitch."],
            ["Session recovery", "Explicit timers can save time even when no stitches were marked. Active sessions are checkpointed on this device about every five seconds, and alongside the short progress saves. After a crash, reopening saves the session only through its last successful checkpoint; time while the app was gone is excluded. Recent time can be lost if writes fail or the browser delays them. A recovery-save error asks you to save again. Unattended timers are trimmed to the last mark, or capped at the idle threshold if no stitches were marked. Finish your session before exporting a backup to include its time. On browsers without Web Locks, use one tab per project."],
            ["Correcting your journal", "In the Session journal, Edit session changes a session's date, start time, minutes and stitches, Delete session removes it, and Merge with next joins it to the next session of the same day. Undo appears straight after. A session that ran past the end of the day is stored as one record per day: deleting it removes all of them. Everything else (totals, milestones, charts, streaks, the finish estimate) follows the corrected journal, and a deleted session does not come back when you sync."],
            ["Activity", "A calendar heatmap of how much you stitched each day — darker squares mean more stitches."]
          ]
        },
        {
          heading: "Stitching effort",
          body: "Ready to stitch in Materials shows effort metrics from the current chart. These do not measure colour fidelity, retained detail or physical results.",
          bullets: [
            ["What the counts mean", "Confetti stitches are single stitches of a colour on their own: full crosses with no same-colour neighbour in the four cardinal directions. Tiny connected groups of two or three crosses are counted separately. Rarely used symbols appear in five or fewer full crosses."],
            ["Inspect before cleanup", "Eyes, highlights and text may be isolated on purpose. Compare regions and preview cleanup changes before applying them."]
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
    { id: "c.copy",   scope: "creator", keys: ["Ctrl+C", "⌘C"], description: "Copy the selection" },
    { id: "c.cut",    scope: "creator", keys: ["Ctrl+X", "⌘X"], description: "Cut the selection" },
    { id: "c.paste",  scope: "creator", keys: ["Ctrl+V", "⌘V"], description: "Paste, then drag it into place" },
    { id: "c.dup",    scope: "creator", keys: ["Ctrl+D", "⌘D"], description: "Duplicate the selection" },
    { id: "c.flipH",  scope: "creator", keys: ["Shift+H"], description: "Flip the selection left to right" },
    { id: "c.flipV",  scope: "creator", keys: ["Shift+V"], description: "Flip the selection upside down" },
    { id: "c.rotCW",  scope: "creator", keys: ["."], description: "Rotate the selection clockwise" },
    { id: "c.rotCCW", scope: "creator", keys: [","], description: "Rotate the selection anticlockwise" },

    // Tracker
    { id: "t.track",   scope: "tracker", keys: ["T"], description: "Switch to Mark mode (mark stitches done)" },
    { id: "t.nav",     scope: "tracker", keys: ["N"], description: "Switch to Navigate mode (drag to pan, click to place the guide)" },
    { id: "t.guide",   scope: "tracker", keys: ["Esc"], description: "Clear the guide crosshair" },
    { id: "t.selectColour", scope: "tracker", keys: ["Right-click"], description: "Select a stitch's colour and enter Highlight view" },
    { id: "t.park",    scope: "tracker", keys: ["Shift+Right-click"], description: "Park a thread on a stitch (again to remove)" },
    { id: "t.guideKeys", scope: "tracker", keys: ["←", "↑", "→", "↓"], description: "Chart focused: move the guide (hold Shift for 10 stitches). In row mode Up and Down change the row instead" },
    { id: "t.markGuide", scope: "tracker", keys: ["Enter", "Space"], description: "Mark mode, chart focused: mark or unmark the stitch at the guide (the first Enter shows the guide; Space marks once the arrow keys have the guide)" },
    { id: "t.bsSelect", scope: "tracker", keys: ["B"], description: "Mark mode: choose a backstitch line at the guide (press again for the next line); Enter then marks or unmarks it" },
    { id: "t.markRange", scope: "tracker", keys: ["Shift+Enter"], description: "Mark mode, chart focused: mark or unmark the rectangle from the last stitch you marked with the keyboard to the guide" },
    { id: "t.unpick", scope: "tracker", keys: ["Ctrl+Shift+Enter", "⌘⇧Enter"], description: "Mark mode, chart focused: unpick the rectangle (every kind of stitch: whole, half, quarter, knots, backstitch) from the last stitch you marked with the keyboard to the guide" },
    { id: "t.legend",  scope: "tracker", keys: ["G"], description: "Go to the colour legend: Tab walks the colours, Enter selects one" },
    { id: "t.chartFocus", scope: "tracker", keys: ["Shift+G"], description: "Go back to the chart, so you do not have to Tab to it" },
    { id: "t.parkGuide", scope: "tracker", keys: ["Shift+F10", "Menu"], description: "Park a thread at the guide" },
    { id: "t.view",    scope: "tracker", keys: ["V"], description: "Cycle view: symbol / colour / highlight" },
    { id: "t.focusMode", scope: "tracker", keys: ["F"], description: "Enter or leave focus mode (Esc also leaves it)" },
    { id: "t.full",    scope: "tracker", keys: ["Shift+F"], description: "Toggle full-stitch layer visibility" },
    { id: "t.half",    scope: "tracker", keys: ["Shift+H"], description: "Toggle half-stitch layer visibility" },
    { id: "t.knot",    scope: "tracker", keys: ["Shift+K"], description: "Toggle French-knot layer visibility" },
    { id: "t.bs",      scope: "tracker", keys: ["Shift+L"], description: "Toggle backstitch layer visibility" },
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
    { id: "th.prev", scope: "tracker", keys: ["[", "←"], description: "Previous colour in any view ([). In Highlight view, with focus off the chart, the Left arrow does the same" },
    { id: "th.next", scope: "tracker", keys: ["]", "→"], description: "Next colour in any view (]). In Highlight view, with focus off the chart, the Right arrow does the same" },
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
      body: "A short tour for the way you are working: turning a picture into a pattern, drawing on a blank grid, or an imported chart. It names the buttons as they appear on your device.",
      action: { label: "Replay the Creator walkthrough", kind: "wizard", page: "creator" }
    },
    {
      id: "shortcuts",
      heading: "Learn the shortcuts",
      body: "Press ? anytime to open this drawer on the Shortcuts tab, at the section for the tool you are in (the other sections are collapsed until you open them). Most tools have a single-letter shortcut, and undo / redo / save use the standard Ctrl (or ⌘) combinations.",
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

  // The tool the user is in: 'creator' | 'tracker' | 'manager', or null (Home, Stats), where no tool
  // section applies. window.__csActiveTool is set by the unified page (index.html) as it switches between
  // the Creator and the Tracker; __csPageKind is what each page declares.
  function currentTool() {
    var k = window.__csActiveTool || window.__csPageKind;
    if (k === "creator" || k === "tracker" || k === "manager") return k;
    if (k === "home" || k === "stats") return null;
    try {
      var b = document.body;
      if (b && b.classList.contains("page-creator")) return "creator";
      if (b && b.classList.contains("page-tracker")) return "tracker";
      if (b && b.classList.contains("page-manager")) return "manager";
    } catch (_) {}
    try {
      var p = (window.location && window.location.pathname || "").toLowerCase();
      if (p.indexOf("stitch") !== -1) return "tracker";
      if (p.indexOf("manager") !== -1) return "manager";
      if (p.indexOf("create") !== -1 || p.indexOf("index") !== -1) return "creator";
    } catch (_) {}
    return null;
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
    // Opened on Shortcuts without a context (the header's keyboard button): use the current tool's, so
    // "?" in the Tracker never starts on the Pattern Creator's keys.
    if (!ctx && tab === "shortcuts") ctx = currentTool();
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
    _currentTool: currentTool,
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
    var searching = !!(props.query && String(props.query).trim());
    return h("div", null, order.filter(function (s) { return groups[s] && groups[s].length; }).map(function (scope) {
      // The current tool's section is open and the rest are collapsed (each opens on a click). Off a tool
      // page (Home) Global is the open one. A search opens every section that has a match.
      var expanded = searching || (contextScope ? scope === contextScope : scope === "global");
      return h("details", {
        key: scope + ":" + props.openSeq + (searching ? ":q" : ""),
        className: "cs-help-shortcut-group",
        open: expanded,
        style: { marginBottom: 12 }
      },
        h("summary", {
          style: {
            fontSize:'var(--text-xs)', textTransform: "uppercase", letterSpacing: 0.5,
            color: "var(--text-secondary)", fontWeight: 700, marginBottom:'var(--s-2)',
            paddingBottom: 4, borderBottom: "1px solid var(--border)", cursor: "pointer"
          }
        }, (SCOPE_LABEL[scope] || scope) + " (" + groups[scope].length + ")"),
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
              ? h(ShortcutsSection, { items: shortcutsFiltered, context: state.context, query: state.query, openSeq: state.openSeq })
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
  function pageContextFromBody() { return currentTool(); }
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
