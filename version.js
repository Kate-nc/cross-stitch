// ════════════════════════════════════════════════════════════════════
// version.js — app version string + DOM badge
// Bumped automatically by .github/workflows/bump-version.yml on each
// PR merge to main. Do not edit APP_VERSION manually.
// APP_CHANGELOG is maintained manually alongside each release.
// ════════════════════════════════════════════════════════════════════
window.APP_VERSION = '1.0.224';

window.APP_CHANGELOG = [
  {
    version: 'Unreleased',
    date: 'October 2026',
    notes: [
      'Fixed: two-thread blends work independently of spatial shading, including conversions with shading off.',
      'Fixed: Track no longer skips cells in fast strokes or the release cell, and off-centre diagonal strokes follow the actual path. Two fingers cannot accidentally mark half stitches. Space-drag pans without marking, turning off drag gestures keeps plain clicks and taps working, and half-stitch clicks preserve a completed full stitch underneath. Slower touch and pen taps no longer disappear before long-press selection begins. Stroke previews update separately once per frame and unchanged pointer moves no longer rebuild the tracker.',
      'Fixed: project material planning converts thread length when substituting between brands with different skein lengths, so an 8 m requirement does not become a full 10 m requirement. Recorded consumption amounts are preserved.',
      'Fixed: thread planning uses a documented, lower estimate (about 1,575 full crosses per 8 m skein on 14-count with two strands and 20% allowance). Materials, Stash and library sync share unrounded per-thread demand, brand lengths and unequal blend ratios. Usable partial stash is subtracted before rounding whole-skein purchases. Fractional stitches and outlines contribute thread, and estimates just above a whole skein are explained. Future project reservations use the same planning model; recorded consumption and stock balances are preserved.',
      'Fixed: pinned preview comparisons count changes when stash threads are replaced without changing their number. Phones draw only the selected comparison picture, and smaller previews label their changed-stitch counts as estimates.',
      'Added: pin a completed Convert preview, compare it with later choices and apply all pinned settings. Pinned and Current show together on wide screens and switch on phones; the difference line compares stitches, confetti, threads and skeins. Changing or cropping the picture clears the pin. Pattern estimates now uses the shared section styles, with one set of estimates and a tappable thread list that highlights in every preview view. Show what changed now uses the same cell comparison in Stitched, Flat and Before / after. Phones and tablets below 900 pixels put the picture, Crop and Change above a full-width preview. Fixed: undithered logos no longer spend extra threads on anti-aliased background edges and pale lettering; coverage is preserved.',
      'Improved: Convert is laid out like Edit. Its settings are now steps across the top of the panel, in the order you make the choices: Picture (the picture type, its background and fixes such as brightness), Size (the size and fabric), Threads (brand, how many, blends and your stash) and Detail (how much shading and small detail to keep, with every individual control below), then Project. Each step ends with a Next button, and Generate stays at the bottom under a line saying what it will make, such as Photo \u00B7 100 \u00D7 67 stitches \u00B7 up to 24 DMC threads \u00B7 Balanced. The accordions, the long introduction and Show all conversion controls are gone, every setting is shown once, and labels, headings and hints use the same sizes as Edit. Skip background is now Leave background unstitched, and Tolerance is How close a match. Shift Colours and Palette Presets, which recolour a finished pattern, have moved to Edit > Palette, and Auto-crop to stitches is now Crop to the stitches in Edit > Tools.',
      'Improved: the Convert preview now shows the finished piece. Its new Stitched view, the default, draws each stitch as a cross of thread on your fabric and in your fabric colour, with as much fabric showing between stitches as two strands leave on that count, and blends as one strand of each thread; Close up shows the stitches larger. Flat shows the whole pattern as coloured squares, and Before / after keeps the slider, which used to be the only view and always hid half of the pattern. A line under the preview now says what your last change did: the setting, how many stitches changed and which counts moved, such as threads 24 to 12 and confetti 4.6% to 2.6%, or that nothing visible changed. Threads says how many threads and chart symbols the preview uses, and Detail how many stitches tidying changed, with Show them on the preview. Fixed: once a pattern had been made, Convert showed that pattern instead of the preview, so changing a setting appeared to do nothing until Regenerate. Convert now always shows the live preview and says when it differs from your pattern. Show tidied stitches no longer paints over the preview itself, and now shows in every view. Sliders now have names for screen readers. Regenerate, from any button, now asks before replacing a pattern you edited or reopened, and Convert says whether your pattern was made with the current settings, counting every setting and the picture. Crop to the stitches crops the pattern itself, keeping progress, backstitches and knots, and can be undone; cropping your picture keeps your pattern until you Regenerate. Large close-ups stay within what phones can draw.',
      'Added: every Convert setting now has an information icon beside it. Hover over it, tab to it or tap it to read what the setting does, in plain words; screen readers read the hint with the setting. The picture types and the Detail and tidiness steps also explain themselves when you hover over them. Fixed: with Guess the picture type turned off, Detail and tidiness now follows what the picture looks like, so a step never shades a logo or pixel art, and the picture type you chose is kept with an unsaved conversion. The warning that tidying may be too strong for a small pattern now shows beside the steps instead of inside the closed Fine-tune. Importing pixel art straight into the Stitch Tracker no longer blends neighbouring pixels when the picture is only slightly larger than the pattern. A generated pattern now remembers its picture type and its exact shading, so reopening a logo and choosing a Detail and tidiness step no longer shades it like a photo; patterns saved before this follow what their picture looks like. The confetti count under Detail and tidiness is now the finished chart\'s, counted after Keep look-alike colours apart and the Threads (max) limit, says Updating preview while the new preview is worked out instead of showing the last step\'s count, and starts with about when a large chart is previewed smaller (without a background worker). The preview made on the page then also keeps to Threads (max), as Generate does.',
      'Improved: Convert is simpler to start with. A new Detail and tidiness choice sets shading and tidying together in four steps, from More detail to Easiest to stitch, and shows how many confetti stitches the preview has at each. Photos and graphics start at Balanced and pixel art at More detail. Every individual control is still there under Fine-tune. Min stitches per colour has moved to Colours, and Exact pixel-art import now appears under Pixel art. The preview is now worked out in the background at the pattern\'s full size, so the page no longer pauses while it updates, and for large patterns its counts match the pattern Generate makes instead of a smaller copy.',
      'Improved: photos convert more accurately. The picture is now shrunk to stitches as light, so edges and bright details are no longer darkened, and the Photo picture type starts with 24 threads, so faces and other small subjects get threads of their own instead of a grey beige. Stitch Cleanup now works on photos: it used to leave alone almost every confetti stitch near an outline, which on a photo was half of them. Clean-up is simpler. Stitch Cleanup turns tidying on or off and Reduce confetti sets how much (Off, 1 to 3), with the sizes it merges stated. Cleanup strength, Fewer confetti stitches in shading and Strong shading are gone: none of them made charts better (a saved Strong opens as Balanced). Min stitches per colour now starts at Off, because stray colours are folded away automatically and a minimum also removed catchlights. Logos saved as JPEGs are recognised as graphics more reliably, and the Pixel art picture type turns Stitch Cleanup off so every pixel is kept. Importing a picture straight into the Stitch Tracker shrinks it the same light-correct way, and very large photos are reduced in smooth steps instead of being sampled. Brightness, contrast and saturation now update the preview almost instantly once a picture has been read.',
      'Fixed: converting a picture no longer adds splotches of a made-up colour to areas that should be one solid colour, and no longer loses small details that are clearly a different colour. Threads (max) is now a limit, not a target: the Creator no longer spends threads on near-identical shades of a big flat area, which picture noise then scattered across it, and a small detail such as a catchlight or a spot of another colour gets a thread of its own. Stitches are matched to threads by how different the colours look, the same way the threads are chosen. Two-thread blends pair only threads close in colour, so a flat grey is no longer stitched as gold with blue or black with white. Removing rarely used colours keeps a small patch that stands out from everything around it, and redraws one that does not in a colour it touches. The edges of logos fold into the colours they actually sit between, so thin outlines and lettering are kept. Cleanup now protects a change between two colours of similar brightness, such as a brown spot on green grass. With shading on, Fewer confetti stitches in shading now works as intended. Soften grainy photos, at its default setting, no longer invents colours along edges. Converting with shading and blends is also several times faster.',
      'Improved: a clearer Home. A first visit now says what stitchx is (free, no account, and your files stay on this device) and asks What are you starting with?: A pattern I already have, A photo or picture, or A blank canvas. Which files work? explains the formats and printed-chart photos once, instead of three warnings. The practice pattern is a visible card, and How stitchx fits together introduces the Pattern Creator, Stitch Tracker and Stash Manager. With projects, Home opens on a Continue card and shows every project as a card with a preview, its size, progress and status. Each card has one main action (Start stitching, Continue stitching or Open in Tracker), and Edit, Export or print, Update chart and Project details are in a More menu. Filter by In progress, Not started or Finished, and Show all lists projects past 12; Home no longer stops silently at 8. Project cards now show progress, which they had stopped doing. Projects you own every thread for say so. Drop a file anywhere on Home; a dropped picture, or one chosen as a pattern, asks once whether it is a printed chart. The Home top bar now has Home, Stash and Stats instead of tabs and a project switcher, and phones no longer cut off project names and buttons.',
      'Fixed: the experimental guided image importer now has a live preview that matches Generate. Crop and orientation, finished dimensions, stash-only palettes, blends, contrast, smoothing, shading and background tolerance are applied consistently. Empty stashes and failed previews block generation until corrected, and the detail-importance overlay stays out of the stitched pattern.',
      'Fixed: Convert preview failures now clear stale results and offer Retry preview. Cropping or replacing an image clears the previous preview. Show what changed compares completed previews, including transparency changes; heatmaps and colour highlights stay on the preview side and hide while updating. The magnifier divider now follows the magnified image accurately.',
      'Fixed: the Convert preview now shows what the pattern will be. Cells left unstitched (such as a background removed by Skip background) show as your fabric colour instead of letting the original picture show through, so a background threshold that cuts into the picture is visible before you generate. The Show what changed overlay no longer flashes orange blocks over the picture after every adjustment: it is off until you turn it on, and it covers only the preview side. The preview keeps the picture\'s shape while a new size is worked out instead of stretching, and the Updating spinner no longer gets stuck or switches off early. On Safari versions without canvas filters, brightness, contrast and saturation now take effect in the preview and the pattern.',
      'Fixed: the Creator\'s Convert > Size & fabric card no longer clips its content on a laptop-sized window, so the Fabric count and colour are always reachable. The fabric count is now edited in one place: Convert > Size & fabric before you generate and Edit > Project > Fabric afterwards (they are the same setting). Materials > Ready to stitch and Threads show the count read-only with an Edit link that opens Edit > Project > Fabric.',
      'Fixed: the name prompt before printing, exporting or opening in the Stitch Tracker only appears while a pattern is still called Untitled design, \u201C80\u00D780 pattern\u201D or a camera file name such as IMG_2041, and only once. A name you chose, or a file name worth keeping, is not questioned. Opening in the Tracker has its own wording and a Save and open button.',
      'Fixed: counts read correctly everywhere: \u201C1 pattern\u201D, \u201C16,950 full-cross cells\u201D and \u201CFull Cross (16,950)\u201D in the Stitch Tracker layers list, the restore-from-backup summary, sync conflicts and Ready to stitch. The Generate toast no longer ends in a double closing bracket.',
      'Fixed: the \u201CReady to stitch review\u201D and \u201CThread consumption history\u201D buttons now look like the app\'s other secondary buttons.',
      'Improved: phones and touch screens. The Stitch Tracker shows one notice at a time as a full-width banner above the bottom controls, instead of stacking "Keeping the screen on" and "Sessions are tracked automatically" in narrow columns over the chart. Waiting notices queue (errors and Undo offers first, first-run notices last), information clears itself in a few seconds, buttons are 44px, and tips about marking wait until the banner has gone. The Creator does the same. Its phone bars now name every control: Navigate, Draw, Paint, Fill, Erase, Colour, Undo and More under the bottom icons, and Convert, Edit and Materials under the top ones. Fill has a clearer tipped-bucket icon, the hint under the canvas wraps instead of being cut off, the bottom bar now fits a 360px screen with More inside it, and landscape phones no longer scroll past the screen.',
      'Improved: clearer navigation and a calmer first run. The top bar now lists only tools (Create, Track, Stash, Stats) and stays on Create through the Creator\'s Convert, Edit and Materials steps, which used to repeat "Edit" and flip the highlight. In dark mode the inactive tabs are no longer the accent colour, so the current tab stands out again. At tablet widths the project name, progress and save state share one chip, so the File menu is no longer clipped. Shortcuts opens on the tool you are in with the other sections collapsed. On a first run Home no longer shows a "No active project" card or a "NP" chip. Stats\' Back to grid button now reads Back to projects.',
      'Fixed: progress numbers now agree everywhere. Stats Total stitches and Lifetime used to add up finished sessions only, so a project with 16 stitches marked and no finished session read 0 beside \u201c16,934 left\u201d. They now count the stitches marked on your charts (the same figure as the Tracker, Home and the Library), straight away; speed and time still come from your recorded sessions. A Library card shows its progress once, as a bar with its percentage, instead of three times. Time left reads the same in the Creator, Tracker, Home, Library and Stats: hours first, then calendar time once you have a pace, such as about 424 hours, about 4 weeks at your pace. With no stitching history the Library now uses the Creator\'s 40 stitches an hour instead of 100.',
      'Improved: chart rulers and counting aids are easier to read. The Creator now numbers its rulers like the Stitch Tracker and a printed chart (1, then 10, 20, 30, on the stitch before each bold line), in a darker colour that passes 4.5:1 contrast on the fabric. In the Tracker\'s Highlight view, counting aids are drawn as dark-outlined light badges instead of accent-coloured ones, are hidden when the cells are under 12 px so they no longer pile up, and are off by default for new users (your saved choice is kept). The Highlight hint banner no longer starts under the open side panel.',
      'Fixed: Stash Manager no longer calls a single pattern\'s shortfall a conflict. After creating one pattern with an empty stash you now get a neutral To buy for (pattern) panel, with the number of threads and an Add to shopping list button, and Home\'s Shopping list shows the same threads instead of saying nothing. Thread Conflicts appears only when two or more active patterns need the same thread and your stash can\'t cover them together, and names those patterns. Home > Stash now says Threads instead of Colours, and Fully kitted is now Ready to start. Counts such as 1 pattern and 1 thread now read correctly.',
      'Improved: one thread label and a fuller colour key everywhere. A thread now reads the same on the Creator Palette tab and chips, the Stitch Tracker colour list, active colour and status bar, the Stash Manager and Home: DMC 3799 Pewter Very Dark, or DMC 341 + 826 (blend), with Anchor numbers written as Anchor 403 and shade abbreviations spelled out. Names wrap instead of being cut short, and each key row now shows the strands in the needle and the skeins the symbol takes. The Tracker sort button is now Number instead of DMC ID. A short What\'s a blend? note (one strand of each thread in the needle) is under both keys, on the Convert result toast and in the Help glossary. Convert\'s blend setting is now Allow two-thread blends, with what it does written beside it. Confetti stitches (single stitches of a colour on their own; slow to stitch) is the one term everywhere: Tidy stray stitches and Confetti Cleanup are now Reduce confetti, and Ready to stitch and Pattern info show the same confetti count.',
      'Custom thread catalogue CSV imports now preview errors and duplicates before an atomic save, with safe export, optional approximate colours, provenance and explicit discontinued/substitution records. New project saves retain their stored colours and names across catalogue updates. Bulk stash imports reject opposite-brand tokens and save atomically.',
      'Fixed: editing a stitched pattern in the Creator no longer leaves stitching progress that disagrees with the chart. Repainting, filling, erasing, replacing a colour, swapping the palette (or reverting it), re-applying Keep look-alike colours apart (which can now be undone), cleaning up, moving or pasting over cells you have marked done sets those cells back to not done in the same undo step, with a toast ("N stitched cells reset to not done") and an Undo button. The Edit tab shows how much of the project is stitched and a Show stitched option that tints the cells marked done. The Regenerate warning now points to File > Export Backup.',
      'Improved: the Creator opens in Navigate on a computer as well as a touch screen, so a stray click on a freshly opened pattern edits nothing. Choosing a tool or a colour swatch switches to Draw; a new blank design opens in Draw.',
      'Added: project material reservations and shopping lists in Stash Manager. Track owned, reserved, available and estimated-needed thread separately, adjust fractional claims, explicitly confirm brand-qualified substitutions, and export a deduplicated combined shopping list. Planning never consumes stock; completed and abandoned projects release claims.',
      'Fixed: in the Stitch Tracker, F now only enters or leaves focus mode; it no longer also hides the full stitches and blanks the chart. The layer toggles are Shift+F (full), Shift+H (half), Shift+K (knots) and Shift+L (backstitch); Shift+A still shows or hides all of them. Esc leaves focus mode. A layer that is hidden is now signposted by a chip, such as Full stitches hidden · Show, in the progress strip (above the bar in focus mode), and one click shows everything again.',
      'Improved: marking a whole colour in the Stitch Tracker colours list is safe and clearly named. The chips read Mark all done and Mark all not done, always ask first in a styled dialog with the colour and the exact stitch count, and show a toast with Undo afterwards. The change is a single undo step. Chips are separate 44 px touch targets from the row, which only selects the colour. Start fresh, Remove stitch and park marker Clear all use the same dialog (Clear all can be undone, including which colours were hidden), and the backstitch chip now reads Mark all lines done, asks first and offers Undo too. Danger dialogs start on Cancel, and keyboard shortcuts such as Ctrl+Z wait while a question is open. A key under the progress bar explains To stitch and Stitched, and points pale-thread users to the Corner tick option.',
      'Fixed: Tracker palette control semantics and native Space activation, completed-thread contrast, dark-theme thread swatches and action targets; coalesced chart status, persistent import errors, a quiet empty import screen and More-panel keyboard focus. Large-chart tracking avoids redundant chart copies and unchanged saves; tiled rendering is retained. Background summary refresh preserves newer progress, closed sessions and project deletions.',
      'Added: named global PDF export presets with save, apply, update and delete; chart-only output, optional thread legends and profile branding, and a layout preview sharing the export pagination plan. Full backups preserve presets separately from projects.',
      'Fixed: a chart never reuses a symbol. Every thread and blend gets its own, and the symbol on screen in the Creator and Tracker is now the same shape the PDF prints for that thread. Charts of up to 112 symbols are supported; converting a picture that needs more shows a warning and a mark in the Palette header. Projects saved with repeated symbols are repaired on opening: symbols you chose are kept, and only repeats change. Done stitches are untouched.',
      'Added: opt-in pen drawing with finger navigation, safe gesture interruption and native-size exact pixel-art import. Preview each source colour matched to a solid thread; hard edges, one-pixel details and transparent holes are preserved. Exact mode supports sources up to 500 by 500 pixels.',
      'Improved: Home exposes Stitch an existing chart, Convert a picture and Draw a pattern, explains printed-chart photographs, and offers an isolated practice chart. Browser Back restores Home tabs, conversion draft settings save promptly, advanced conversion controls expand on demand, and import warnings link to available repair tabs. Existing PDF density, symbol reassignment and backup controls are easier to find.',
      'Added: initial unencrypted PCStitch 7 PAT import with DMC identifiers, dimensions, full crosses, supported fractions and backstitch. Review reports omitted objects and unverified blends, palette attributes and header options. Other versions are rejected; the original file is retained for comparison and repair.',
      'Added: version-gated Pattern Maker XSD 4.8.4.12 import with bounded binary parsing, original thread identities and geometry, counted unsupported objects and explicit verification limits. Other XSD versions and XML schemas are rejected.',
      'Added: optional automatic WebDAV sync for private, user-configured servers. Visible online pages exchange verified version-2 sync files with photos and tracing pictures. Credentials stay in page memory; reconnect after navigation. Retry, cancel and disconnect retain local work. Revoked access stops transfers. iOS background sync is not guaranteed; local saves, sync and backups retain separate status.',

      'Added: Home project actions now offer reviewed chart corrections and stitch-along page additions. Explicit coordinate alignment, geometry and thread matching preserve progress; ambiguous overlaps and changed stitches require decisions. Atomic local recovery snapshots retain sources and support reviewed rollback. Migrated completion keeps its consumption identity and never deducts thread again.',
      'Added: Ready to stitch review in Materials & Output compares the source, current chart and stitch simulation, gathers size and material assumptions, explains actionable effort metrics and exports selected sample charts. Stitch Score is replaced by a review link. Material summaries now share the Threads estimate, including blend shares and a 20% waste allowance. Loading a chart without a source clears the previous image and ignores stale image decodes.',
      'Fixed: sync uses causal edit history, explicit note and stash conflicts, durable deletion evidence and verified photo/trace manifests. Replayed imports do not consume thread twice. Missing attachments stay pending; failed writes remain retryable. Version-1 files remain readable; update every device to read new version-2 sync files.',
      'Backup recovery now validates archives and attachment integrity, includes tracing pictures and session checkpoints, and stages data and portable settings before publishing them together. Existing projects are retained; conflicting identifiers stop the import. Old files remain readable with completeness warnings. Failed or interrupted imports leave the previous storage intact.',
      'Added: bead progress with stable object IDs, chart selection, an accessible list, completion and unmarking, Undo/Redo and separate bead quantities. Project saves, backups and sync preserve bead marks. OXS carries bead appearance and position only; PDF and image exports omit beads.',
      'Improved: durable thread consumption events retain their original estimates and travel with stash backups and sync. Fractional stitches, knots and backstitch are included. Accidental mark corrections return only recorded debits; physical unpicking keeps thread consumed and restitching charges again. Existing inventory is preserved by an explicit historical baseline. Tools includes a readable consumption history.',
      'Fixed: app updates validate the complete offline application before becoming available. Close all stitchx tabs and app windows, then reopen to use an update without interrupting editing or stitching. Failed downloads keep the working version; project saves remain separate.',
      'Improved: import review separates cell recognition, legend matches, stitch preservation, dimensions, unsupported content and declared counts. Unknown coverage stays explicit, limitations include repair guidance, and the original source is retained. PDF key-matching figures keep their existing meaning.',
      'Added: petite crosses and long stitches have independent identities, thread references and geometry, creation/editing controls, chart rendering, weighted progress, marking, undo/redo and native save/reload. OXS preserves petites and reports unsupported long-stitch export; PDF export reports unsupported objects instead of omitting them.',
      'Fixed: transparent image areas stay unstitched through resizing, smoothing, dithering, cleanup and saving. Alpha below 128 is empty; alpha 128 or above keeps its uncomposited colour. Transparent pixels do not consume threads. Skip background preserves opaque details in transparent pictures, and enclosed matching details in opaque pictures. Fully transparent pictures create empty patterns.',
      'Fixed: PDF charts now give every used thread or blend a distinct embedded symbol, with the same assignment in the key and page summaries. The font supports 112 symbols and clearer shapes; larger exports stop with an error instead of reusing symbols. Unused palette colours and empty cells do not count towards the limit.'
    ]
  },
  {
    version: '1.0.156',
    date: 'October 2026',
    notes: [
      'Fixed: OXS imports and exports retain backstitch thread references over empty cells, accept charts without full crosses, and preserve supported fractional stitches and two-thread blends. Import and export report unsupported or malformed objects with counts; bundle exports use the same writer.',
      'Fixed: half-stitch marks now undo and redo in order. Undo and Redo restore original session totals and catch-up classification without inflating additions or pace, including after End session and across stitching days. Physical unpick restoration keeps its separate accounting.',
      'Fixed: fractional progress stays consistent across Track, Stats, colour figures and project summaries. Half marks refresh colour counters immediately. Incomplete charts stay below 100%, and hidden layers cannot trigger project completion or stash deduction.',
      'Fixed: live stash deductions persist per-project checkpoints, so reopening and retrying do not deduct the same thread twice. Atomic updates preserve other projects and stash edits on this device. Existing marks in older projects are checkpointed without another historical deduction.',
      'Fixed: blended crosses split thread usage by constituent strands, brands stay separate, and tracker tabs exchange bounded announcements without heartbeat reply loops.',
      'Live stash corrections now reverse only recorded deductions and preserve purchases. Unmarking and resetting progress do not return usable thread to stock.'
    ]
  },
  {
    version: '1.0.154',
    date: 'October 2026',
    notes: [
      'Fixed: explicit timers keep recorded time without marked stitches. Active sessions now have local crash-recovery checkpoints; reopening excludes downtime and deduplicates recovered sessions. Checkpoint failures are reported.',
      'Fixed: Sync preserves half-stitch directions and distinct parking markers. Full, half and quarter stitches, knots and backstitch now sync unpicking with per-mark removal history. Concurrent mark/unpick edits resolve to unpicked; sync, then mark again to restore. Older files remain readable but cannot supply missing removal history. Chart changes still require review.',
      'Fixed: Stats tiles fit their content and screen width, with wrapping colour labels, flexible progress bars and readable controls and counts. Dense section grids and charts scroll within their panel.',
      'Fixed: Before / After comparison pictures stay visible for large patterns and keep their proportions when resized. Choosing no snapshot clears the old picture; unreadable snapshots show a message. Snapshot saving also works with loaded completion arrays.',
      'Fixed: narrow Stats and stash views, session editing and chart layouts at enlarged zoom; global charts use the available tile width. The Tracker recap no longer covers Stats controls. Empty Stats keeps its tabs and no longer redirects to Home from the hidden Creator.'
    ]
  },
  {
    version: '1.0.153',
    date: 'October 2026',
    notes: [
      'Automatic daily Compare snapshots are now optional and off by default, including for existing users. Enable them in Preferences > Stitch Tracker to start from today without filling missed days. Turning them off also cancels queued automatic snapshots; manual snapshots, pattern-change recovery, autosave and session recording continue.',
      'Stats > Compare can delete a selected snapshot or all automatic snapshots, with confirmation. Bulk deletion keeps manual and Before pattern change snapshots. Deleted snapshots stay deleted after reload and Sync; read-only views disable these controls.'
    ]
  },
  {
    version: '1.0.151',
    date: 'October 2026',
    notes: [
      'Corrected nine DMC screen colour approximations after a complete catalogue audit. All 525 thread IDs and names are retained; reference disagreements are documented.',
      'Fixed: explicit imported and custom colours survive reopening a pattern, including blends with a known thread number. White/Blanc aliases resolve consistently, and fractional RGB colours no longer reuse another colour\'s cached Lab values.'
    ]
  },
  {
    version: '1.0.147',
    date: 'October 2026',
    notes: [
      'Track: right-click a chart stitch (Ctrl+click on a Mac) to select its colour and enter Highlight view, just like the palette. Shift + right-click parks or unparks a thread instead; keyboard parking and touch press-and-hold keep their controls.',
      'Fixed: secondary clicks cannot start Space-panning or mark knots, quarters or backstitch on a Mac. Keyboard parking is disabled in Edit mode, and pending touch parking is cancelled when switching modes.'
    ]
  },
  {
    version: '1.0.146',
    date: 'October 2026',
    notes: [
      'Fixed: opening the Stash Manager no longer clears per-thread minimum stock levels from current inventory data.',
      'Stash: tuck away Thread Conflicts, Low Stock — Needed and Low stash — not currently needed independently using their heading buttons. The current count stays visible, and each choice is remembered on this device even when alerts disappear and return. Hiding a panel does not dismiss alerts or change inventory.'
    ]
  },
  {
    version: '1.0.144',
    date: 'October 2026',
    notes: [
      'Fixed: Resize canvas now moves older half stitches and their completion marks with the grid, including cropping and Undo/Redo. Projects containing both half stitches and equivalent quarters count that work once.',
      'Fixed: full backups now restore portable global preferences, including designer branding, PDF export defaults, tracking behaviour and accessibility choices. Device controls, pattern view positions and Sync setup stay on the destination device. Older backups remain supported.',
      'Fixed: stitches marked just before reloading or leaving the Tracker are kept, including an unfinished drag.',
      'Fixed: Export Backup stops with a clear error if the latest project changes cannot be saved, instead of downloading older data and recording it as a successful backup.',
      'Stats, Visuals: Colour progress and the Colour timeline are now one Colours panel. Each colour shows how much is left, the dates you worked it and how many sessions, with a filter (all, in progress, not started, complete) and a sort (most remaining, palette order, recently worked, longest untouched). One percentage now counts whole and half stitches together.'
    ]
  },
  {
    version: '1.0.142',
    date: 'October 2026',
    notes: [
      'New: notes and photos for each project. Open More, then the Session tab. Write notes (where you stopped, a thread change) in the Notes box, and keep up to 12 pictures of your work with Add photo. Photos are shrunk to fit, shown as thumbnails and opened full size with a tap. Notes travel with the project, its backups and Sync; photos stay on this device and in backups, are removed with the project, and are only read when you open the Session tab, so the chart is not affected.'
    ]
  },
  {
    version: '1.0.141',
    date: 'October 2026',
    notes: [
      'New: Unpick area. To take a whole section back out in one go, choose a rectangle and unpick it: it unmarks every kind of stitch in it (whole, half, quarter, French knots, and backstitch lines inside it) as a single undo step. With a finger, press and hold a corner stitch and tap Unpick area on the bar, then tap the opposite corner. With a mouse, click a corner, Shift+click the opposite corner and hold Alt as you let go. With the keyboard, press Ctrl+Shift+Enter (Cmd+Shift+Enter on a Mac) at the opposite corner.',
      'An unpicked area is recorded in your session and shown in the journal and Stats as, for example, Unpicked 80. It is never taken off the day\'s stitches and does not make a negative day.'
    ]
  },
  {
    version: '1.0.140',
    date: 'October 2026',
    notes: [
      'Backstitch lines can be marked as done. In Mark mode, tap or click a line, or press and drag along a run of lines (one undo step), and it turns from dashed and faint to solid. With a finger, a magnifier shows the cells around your fingertip. With the keyboard, press B at the guide to choose a line and Enter to mark it. Where the stitch under your finger is nearer than the line, the press still marks the stitch.',
      'The colours drawer counts backstitch per colour (for example 3/8 lines) and gives each colour a Lines button that marks or unmarks all of its lines. Progress info and the strip show Backstitch as its own row, in lines; it is not part of the percentage. A colour used only for backstitch now appears in the drawer.'
    ]
  },
  {
    version: '1.0.139',
    date: 'October 2026',
    notes: [
      'Quarter stitches can be marked as done. In Mark mode, tap or click the quarter you have stitched (with a mouse, a finger or Enter at the keyboard guide); each shows faded until it is done, Undo and Redo cover it, and it is saved, kept in a backup and synced like every other mark. The colours drawer counts them as, for example, 2/3 fractional, and a colour used only in quarter stitches no longer reads 0/0.',
      'Progress now includes quarter stitches, each worth a quarter of a full stitch. A chart that has them can therefore show a lower percentage than before until they are stitched (the Home cards, the library, Stats and the share text all agree). Backstitch still has its own count and is not in the percentage.'
    ]
  },
  {
    version: '1.0.138',
    date: 'October 2026',
    notes: [
      'The Stats page now uses the whole width of your screen. Every tab is a grid of tiles that wrap to fit (one column on a phone), instead of one narrow column down the middle.',
      'Each figure now lives in one place. The Stitching tab holds your totals, streak, recent pace and the week summary; the Stash tab no longer repeats lifetime stitches, active projects, the weekly streak or the recent pace, and Insights no longer repeats the weekly summary.',
      'In a project\'s Stats, streaks and milestones sit beside the summary and your goals sit beside the chart. Showcase stays on the all-projects page only.',
      'A project\'s Stats has a new Visuals view (the button above the tiles). Sections, the Before / After comparison, Colour progress and the Colour timeline are open and full size there, instead of folded away at the bottom.'
    ]
  },
  {
    version: '1.0.136',
    date: 'October 2026',
    notes: [
      'Beads in an imported .oxs chart are now kept with the project (their position, name and colour) instead of being left out, and are written back when you export .oxs. They are not threads and are not counted in your progress. Nothing draws them on the chart yet.',
      'Behind the scenes: projects can now store which backstitch lines and quarter stitches are done, ready for marking them. Nothing changes on screen yet; older projects open as before and older versions of the app ignore the new fields.'
    ]
  },
  {
    version: '1.0.135',
    date: 'October 2026',
    notes: [
      'Easier to read. Small and secondary text, the active tab, the save status, the milestone figures and the Stats colour list now meet a 4.5 to 1 contrast against their background in the light and dark themes (several were between 2 and 4). In the dark theme the Stats colour panel was a white box under pale text; it is now dark.',
      'The dark theme now uses its own, lighter accent colour everywhere. It was being overridden by the light one, which left accent text hard to read on dark.',
      'On a narrow screen, including a desktop browser zoomed to 200%, the colour legend now starts shut so the chart is what you see. Open it with the Colours button.',
      'State is no longer shown by colour alone: the selected colour in the legend has an edge bar, a finished milestone is ticked, the next one says Next and upcoming ones are dashed, and the progress chart tells its three lines apart by solid, dashed and dotted. The keyboard focus ring on buttons is now the accent rather than a pale peach.'
    ]
  },
  {
    version: '1.0.134',
    date: 'October 2026',
    notes: [
      'You can now mark stitches without a mouse or touch screen. Tab to the chart, move the guide with the arrow keys (Shift moves 10 stitches), and press Enter to mark or unmark the stitch at the guide. Shift+Enter marks the rectangle from the last stitch you marked with the keyboard to the guide, as Shift+click does. Space marks too once the arrow keys have the guide; Esc or a click gives it back to hold-to-pan.',
      '[ and ] now change the colour in every view (they only worked in Highlight view), G moves keyboard focus into the colour legend and Shift+G back to the chart. In row mode Up and Down still change the row.',
      'The controls panel, when it is shut, can no longer be tabbed into. The chart shows an outline when the keyboard has it.'
    ]
  },
  {
    version: '1.0.133',
    date: 'October 2026',
    notes: [
      'A pattern overview in the corner of the Tracker chart. When the pattern is bigger than the chart box, a small map shows the whole of it with finished areas in full thread colour, the rest faded, and the part you are looking at outlined. Tap or drag it to jump there. It updates as you mark stitches without slowing the chart, and you can hide it in More > View or Preferences > Stitch Tracker.',
      'On a phone in Focus mode the overview starts closed; the map button opens it.'
    ]
  },
  {
    version: '1.0.132',
    date: 'October 2026',
    notes: [
      'Finished stitches are easier to tell from the rest. In Symbol and Colour views a done stitch now fills with its thread colour and keeps a dimmed symbol (the old pale green wash is gone), and zoomed far out every stitch is one pixel: done in its thread colour, not done faded, so a big pattern at Fit is no longer a blank grid.',
      'New choice: Corner tick (More > View, or Preferences > Stitch Tracker > Finished stitches) keeps each stitch as it was and adds a dark tick in its corner. Both are clear in greyscale.'
    ]
  },
  {
    version: '1.0.131',
    date: 'October 2026',
    notes: [
      'A resting palm no longer marks stitches: with three or more fingers on the chart, nothing is marked until every finger has lifted (a finger landing on a French knot counts too).',
      'On a very short screen, such as a phone with the browser zoomed in to 200%, the row of controls beside the chart now scrolls, so More can always be reached.'
    ]
  },
  {
    version: '1.0.130',
    date: 'October 2026',
    notes: [
      'On a phone or tablet the screen now stays on while you stitch: it is kept lit from your first mark, lets go after 15 minutes without one, and says so once with a Turn off button. The old Sleep / Awake chip is now Keep screen on, and Preferences has Automatic, Always and Never.',
      'Plainer wording: "Live tracking (RT)" is now "Use up stash thread as I stitch". The Highlight tab now holds the chart view and the highlight style together, and the chart view has Colour + symbol where a Realistic button used to do nothing useful.'
    ]
  },
  {
    version: '1.0.129',
    date: 'October 2026',
    notes: [
      'The Tracker remembers where you were. Reopen a project and you are back on the colour you were highlighting, in Mark or Navigate, with the same chart view. It is kept with the project, so it follows it to another device.',
      'The "welcome back" summary is now a thin strip instead of a dialog: the chart is usable straight away, and your first mark (or a few seconds) clears it.',
      'First run is one short sequence. The welcome tour no longer sits over a chart you have already opened, so your first tap marks a stitch instead of closing the tour.'
    ]
  },
  {
    version: '1.0.128',
    date: 'October 2026',
    notes: [
      'A swipe no longer marks stitches. On a touch screen a quick one-finger swipe scrolls the chart and marks nothing; a tap still marks one stitch at once. To paint a run, rest a finger on a stitch for a moment and then drag.',
      'New Paint mode (More > Controls): a one-finger drag paints at once, for long rows. New Lock touches: the chart ignores fingers so a propped-up tablet cannot mark by accident; hold the Touches locked pill and lift to unlock. Neither changes the mouse, and neither is kept after a reload.',
      'After one drag or rectangle marks more than five stitches, a message offers Undo N stitches for a few seconds. The buttons on messages are now at least 44 px on a touch screen.'
    ]
  },
  {
    version: '1.0.127',
    date: 'October 2026',
    notes: [
      'More room for the chart on a phone or tablet. The chart now fills the screen instead of a fixed 600 px box that ran off the bottom, so the page no longer needs scrolling to reach the bar under it.',
      'On a phone the Tracker opens in Focus: the top bar and progress strip tuck away behind a thin progress line, with Exit focus at the bottom. Focus now really hides them (it did not before). You can turn this off under Preferences > Stitch Tracker > Phones and small screens.',
      'The controls beside the chart no longer cover the last column (you can scroll clear of them), their first button shows your current colour (the floating Palette pill is gone), and you can put them on the left for left-handed stitching.',
      'The how-to-mark hints go away after your first marked stitch and stay away.'
    ]
  },
  {
    version: '1.0.126',
    date: 'October 2026',
    notes: [
      'On a laptop, the colour panel no longer covers the logo and the Create, Edit and Track tabs: it now sits below the top bar.',
      'On a phone or tablet, the buttons beside the chart, the close buttons and the Dismiss buttons are all at least 44 px, so they are easier to hit. The save status in the top bar is now a small tick or pencil you can see, instead of a clipped sliver.'
    ]
  },
  {
    version: '1.0.125',
    date: 'October 2026',
    notes: [
      'Deleting a session in one browser tab no longer gets undone by another tab that still had the project open. The other tab now picks up the deletion along with your marks instead of asking which version to keep.'
    ]
  },
  {
    version: '1.0.124',
    date: 'October 2026',
    notes: [
      'A calmer way to stitch. New in Preferences (Stitch Tracker): "Show streaks and goals". Turned off, there are no streak cards, goal bars or goal settings, and no messages when a goal or milestone is reached, in the Tracker, on the Stats pages or in what you share. Every figure and chart stays. If you already had goals or a stitching history it starts on, so nothing you see today disappears; for a new person it starts off.',
      'Streaks now count weeks in a row by default, so a few days off cost nothing; "days in a row" is shown too only if you turn on "Show the daily streak too". The wording is plainer: "Weeks in a row", with no "keep it going".',
    ]
  },
  {
    version: '1.0.123',
    date: 'October 2026',
    notes: [
      'The project Stats page is easier to use on a phone. It no longer scrolls sideways (the milestones now wrap, and a long project name no longer widens the page), and the top card shows how far along you are, today, this week and the estimated finish with what it is based on, all on the first screen. Goals and streaks come next, then the charts and the session journal (the latest five days to start with). Colour timeline, Sections, Comparison and Settings are collapsed groups that remember whether you opened them. Progress info has an Open Stats button.',
      'Charts can be read without hovering: tap a chart, or move the slider under it (it works from the keyboard and with a screen reader), and the value for that day or session is written under the chart. Each chart also has its data as a table, a description for screen readers, and larger axis labels. The calendar shows a day\'s stitches when you tap it.',
      'Smaller fixes: "~1 stitching days" now reads "~1 stitching day"; a project with no recorded colours says so once instead of "No session data" on every colour; the goal and date fields have labels for screen readers; small grey text on the Stats pages is darker so it passes contrast checks.',
    ]
  },
  {
    version: '1.0.122',
    date: 'October 2026',
    notes: [
      'A timer you control. "Start timer" (on the colour palette header and in the Session panel) starts a session now and counts the whole time it runs, minus pauses and time the tab was hidden. Stop it from the timer in the progress strip or the Session panel: you are shown "You stitched for 46 min" and can change the minutes before it is saved.',
      'Time and speed now say how they were measured. Sessions you timed show "(timed)", ones where you set the minutes show "(edited)", and everything else (the default, and every session from before this update) shows "(estimated)", because it is worked out from when you marked stitches. Time and speed totals, the share text and the Time stitched figure carry "(estimated)" when any of the time was worked out. Sessions are unchanged; only the labels are new. The CSV has a new "Time measured" column at the end. A session saved from automatic timing that is shorter than 10 minutes no longer shows a speed.',
      'Forgot to stop? If a timer runs past your idle time with nothing marked, you are asked whether to trim it to your last stitch. Leaving the page or switching project with a timer left idle ends it at your last stitch, and switching project with a session running now keeps the session on the project it belonged to (before, it was lost).',
    ]
  },
  {
    version: '1.0.121',
    date: 'October 2026',
    notes: [
      'You can now correct your session journal. In a project\'s Stats, each session has Edit session (date, start time, minutes and stitches), Delete session and, when there is another session the same day, Merge with next. Undo is offered straight away. Totals, milestone dates, the cumulative chart, streaks, best day and the finish estimate all follow the corrected journal, and a session you delete stays deleted when you sync with another device. Edited sessions show a small "edited" label.',
    ]
  },
  {
    version: '1.0.120',
    date: 'October 2026',
    notes: [
      'Filling a rectangle of more than 50 stitches now asks the same question as marking a whole colour done: count it as today\'s stitching, or as catch-up (progress goes up, but not today\'s count, pace, goals or streak). Your answer is remembered and can be changed in Preferences, under Stitch Tracker.',
    ]
  },
  {
    version: '1.0.119',
    date: 'October 2026',
    notes: [
      'The progress text you copy from Stats now says what each figure measures: speed in stitches per hour, pace in stitches per stitching day, and the one finish estimate with its range and what it is based on. The progress picture says "Per stitching day" instead of "Stitches/day".',
      'The "Pace calculation" choice (active days or calendar days) in Stats settings is gone. Every pace and estimate now counts stitching days, from one calculation, so the choice no longer changed anything.',
    ]
  },
  {
    version: '1.0.118',
    date: 'October 2026',
    notes: [
      'One estimate for when a project will be finished. It looks at your last 4 weeks, works out how many stitches you add on a stitching day and how often you stitch, and converts the stitching days you still need into calendar days. It shows a range and says what it is based on (for example "2.8 stitching days a week, 145 stitches per stitching day"). The Tracker, Progress info, Stats, Insights, milestones, the what-if slider, Home cards and the share text now all give the same answer; before, they disagreed and assumed you stitch every day.',
      'Until you have at least 3 stitching days and 5% done, the estimate says "Not enough history yet" instead of guessing from one short session. A pace figure now always means stitches per stitching day, and the goals panel says so.',
      'Home project cards no longer count hours of stitching as days; they use the same estimate. They fill in the first time Home opens after this update.',
    ]
  },
  {
    version: '1.0.117',
    date: 'October 2026',
    notes: [
      'Stitches now count for the day they were made. A session that runs past the end of the day is saved as one record per day, so Today no longer changes (and yesterday no longer gains stitches) when the session is saved. Past sessions are not changed.',
      '\'Day ends at\' is now one setting for the whole app. It sits beside your goals in Stats and in Preferences, with a one-line explanation, and the Tracker, project Stats, global Stats, Activity and Insights all use it. A value you had already set in a project becomes the app-wide setting the first time you open that project.',
    ]
  },
  {
    version: '1.0.116',
    date: 'October 2026',
    notes: [
      'Unpicking no longer drags your numbers down. Today, your speed and your best day count the stitches you added; stitches you take out show on their own as Unpicked, and a day of only unpicking does not count towards your streak. Your overall progress still goes down when you unpick.',
      'Marking a whole colour done in the palette can now be counted as catch-up. It raises your progress but is left out of today\'s count, your pace, your goals and your streak, and the journal shows it as Catch-up. You are asked the first time, and you can change it in Preferences under Stitch Tracker. The session CSV has a new Catch-up column at the end.',
      'The pace in Progress info now comes from the stitches your sessions added, so it matches the Stats page.',
    ]
  },
  {
    version: '1.0.115',
    date: 'October 2026',
    notes: [
      'Progress now means the same thing everywhere. A full stitch counts as one, a half stitch as half and a French knot as one, and the Tracker\'s strip, header and Progress info, the project and global Stats, the Home cards and library, the share text, the CSV export and the session figures all read from that one definition. Before, a project with half stitches could show different totals in different places (for example "2 done" in the strip and 4 / 1,759 in Progress info). The strip also names the half stitches and knots that are included. New sessions record their stitches in these units; sessions from before counted a half stitch as a whole one and are left as they were, so older daily totals for projects with half stitches can read a little high.',
      'Home and the library refresh their progress figures once, in the background, the first time they open after this update, so older projects with half stitches agree with the Tracker.',
    ]
  },
  {
    version: '1.0.114',
    date: 'October 2026',
    notes: [
      'The Activity tab on the Stats page opens again (it failed to load because two of the Stats scripts clashed). The progress share image now shows your streak, the home page title shows its dash correctly, "Projects" on global Stats reads "N finished, M in progress", and "~1 sessions" is now "~1 session".',
      'Fit in the Stitch Tracker now fits the whole pattern in the box on both width and height, so a tall pattern no longer runs off the bottom.',
      'A daily snapshot of your marked stitches is now saved on your first mark of each stitching day, as the Compare view always intended (it never worked before, so history starts from this update). It is saved when the browser is idle, so marking is not slowed. Compare now explains when a snapshot is from before the pattern changed size instead of drawing it wrongly.',
      'Home now offers the backup reminder too, once per visit, when you have stitched something and it has been 14 days since your last backup.',
    ]
  },
  {
    version: '1.0.113',
    date: 'October 2026',
    notes: [
      'Restoring a backup while a project is open in the Stitch Tracker now restores the backup. Before, the open page could write its own copy back over the restored project as it reloaded. Also, answering "Keep my edits" to the "changed in another tab" question no longer makes the next save ask the same question again.',
    ]
  },
  {
    version: '1.0.112',
    date: 'October 2026',
    notes: [
      'A pattern that changed size after you stitched it no longer loses your progress silently. The Stitch Tracker now asks whether to keep your marks where cells still match, start again, or leave the project as it is, writes nothing until you choose, and saves your earlier marks as a snapshot under Stats > Compare. The "Welcome back" recap waits for the figures you chose. In the Creator, resizing a blank design now keeps marked stitches in place and the long warning pop-up is a short note.',
    ]
  },
  {
    version: '1.0.111',
    date: 'October 2026',
    notes: [
      'The File menu now shows when you last backed up ("Last backed up 5 days ago"), and the Stitch Tracker offers a backup once a session after 14 days without one. "Not now" holds the offer for a week. Your projects are stored only in this browser, so a backup file is the safety net.',
    ]
  },
  {
    version: '1.0.110',
    date: 'October 2026',
    notes: [
      'Two tabs open on the same project in the Stitch Tracker now share their stitches. Marks made in either tab are kept in both, a stitch unpicked in one tab is not brought back by the other, and sessions recorded in either tab are kept. You are only asked "Project changed in another tab" when the other tab changed something other than stitches, such as the pattern or its name.',
    ]
  },
  {
    version: '1.0.109',
    date: 'October 2026',
    notes: [
      'The save status at the top of the Stitch Tracker is now truthful. It shows "Saving…" while changes are not yet written, "Saved just now" once they are, and "Save failed" with a Retry button if the browser could not store them. It no longer claims "All changes saved" while a save is pending or failing, and it says "Not saved yet" while the "changed in another tab" question is waiting for your answer. Zooming does not count as a change.',
    ]
  },
  {
    version: '1.0.108',
    date: 'October 2026',
    notes: [
      'Stitches you mark in the Stitch Tracker are now saved within about half a second, by a small separate record that takes a fraction of a millisecond even on a large chart. If the browser closes the tab or your phone discards it right after you mark, the marks are still there when you reopen the project.',
    ]
  },
  {
    version: '1.0.106',
    date: 'October 2026',
    notes: [
      'Stitches you mark are now kept safe much more reliably in the Stitch Tracker. Refreshing, closing the tab or switching away right after marking no longer loses them, a long run of marking is saved at least every 10 seconds (every 20 seconds on charts over 40,000 stitches), and Backup and sync export always include your latest marks.',
      'Export Backup and Restore now include your projects. They were opening the project database at an old version and failing, so a backup file held no patterns or progress.',
      'The Stitch Tracker can no longer overwrite a saved pattern with an empty record. A save that would have erased a pattern is refused and you are told.',
    ]
  },
  {
    version: '1.0.105',
    date: 'October 2026',
    notes: [
      'Convert a picture in Anchor threads: choose DMC or Anchor under Threads in the Convert panel and the colours are chosen from that brand directly. The pattern keeps Anchor numbers and names everywhere, from the palette and Materials to the Stitch Tracker, PDF and .oxs export. Use only stash threads uses your threads in that brand, and Compare options can show the picture in each brand side by side. When you edit an Anchor pattern, Add colour, blends and Replace colour offer Anchor threads.',
    ]
  },
  {
    version: '1.0.104',
    date: 'October 2026',
    notes: [
      'On the Pattern Creator\'s Project page, the "in stash" count beside each thread and Kit This Project now read your stash correctly; before, they showed every thread as missing.',
      'A pattern adapted to Anchor threads with Adapt to brand now stays in Anchor when you reopen it: its palette, Materials, shopping list, Stitch Tracker, PDF key and .oxs export show Anchor numbers and names. Adapted copies that mix DMC and Anchor threads keep each thread\'s own brand too.',
    ]
  },
  {
    version: '1.0.103',
    date: 'October 2026',
    notes: [
      'Zooming a large pattern in the Pattern Creator is much smoother. Pinch-zoom follows your fingers straight away and redraws once when you lift them; the zoom slider applies when it comes to rest; and every zoom or edit draws the stitches on screen first and the rest of the chart a moment later, without freezing the page.',
      'A large selection no longer slows the Pattern Creator down: switching tools straight after selecting thousands of stitches is now instant.',
      'On a computer the Pattern Creator now fits the window: the sidebar scrolls on its own, so you can go through every tool with the pattern still in view beside it.',
    ]
  },
  {
    version: '1.0.102',
    date: 'October 2026',
    notes: [
      'French knots: choose French knot as the stitch type and tap a grid corner or the middle of a stitch to place one, or tap it again to remove it. Knots copy, flip, rotate and mirror with your stitches, count towards thread and appear under their thread in Materials. In the Stitch Tracker, tap a knot to mark it done; knots count towards your progress. They are read from and written to .oxs files, and the Workshop print theme draws them in PDFs.',
    ]
  },
  {
    version: '1.0.101',
    date: 'October 2026',
    notes: [
      'A Text tool for names, dates and words: tap the chart, type, and the text appears in stitches in the selected colour, in a Block or Serif stitch font with your choice of letter spacing, line spacing and alignment. Drag it into place and press Done; one Undo takes it away. Accented letters, £ and & are included, and you are told if the text is wider than the pattern.',
    ]
  },
  {
    version: '1.0.100',
    date: 'October 2026',
    notes: [
      'Line, Rectangle and Ellipse tools: drag to draw a border, frame or circle in one go, outlined or filled and as wide as the brush, with lines that keep to straight and 45° on request. Mirror drawing copies what you paint, erase, fill or draw across a left–right or top–bottom axis, or both, with a handle to move the axis; half stitches turn to match, and each stroke is one undo step.',
    ]
  },
  {
    version: '1.0.99',
    date: 'October 2026',
    notes: [
      'Copy, cut, paste and duplicate a selection, and flip or rotate it. The copy floats on the chart until you drag it into place and press Done; half and quarter stitches and backstitch lines turn with it, and each paste or turn is one undo step. On a touch screen the actions are on a bar over the selection; on a computer they are in the Tools tab, the right-click menu and on Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D, Shift+H, Shift+V and the comma and full stop keys.',
    ]
  },
  {
    version: '1.0.98',
    date: 'October 2026',
    notes: [
      'The Creator\'s welcome tour now matches how you started: turning a picture into a pattern, drawing on a blank grid, or an imported chart, each in four steps or fewer. It names buttons as they appear on your device (Tap and the Settings sheet on a phone, Click and the panel on the right on a computer), and it shows once for each way in. If you already finished the old tour you won\'t see it again; Help > Getting Started replays it.',
      'Plainer names for the Convert settings and editing tools: Quality is now Clean-up, Dithering is Shading (Off, Smooth blend or Pattern blend), Smooth is Soften grainy photos, Pre-sharpen detail is Sharpen details, Separate similar neighbours is Keep look-alike colours apart, and colour distances show as a Difference instead of ΔE. In More tools, Cleanup mode is Fix outline colours and Denoise mode is Tidy stray stitches, with a How strict choice (Gentle, Balanced or Strong) in place of the numeric thresholds. The technical names are kept under Advanced for anyone who wants them.',
    ]
  },
  {
    version: '1.0.97',
    date: 'October 2026',
    notes: [
      'While a pattern is generating, a card shows what the Creator is doing (choosing threads, matching colours, cleaning up stray stitches, building the chart) with a progress bar, and Cancel stops it and leaves your settings and any earlier pattern as they were. Large patterns with shading can take a minute or more on a phone.',
    ]
  },
  {
    version: '1.0.96',
    date: 'October 2026',
    notes: [
      'Compare options before you generate: under the Convert preview, see the picture 25% smaller and larger, or with 5 fewer or 5 more threads, side by side, each with its stitches, threads, hours and confetti, and choose one to use it. The preview estimates now count chart symbols rather than colours.',
    ]
  },
  {
    version: '1.0.95',
    date: 'October 2026',
    notes: [
      'Set a pattern\'s size as a finished size in centimetres or inches as well as in stitches, or fit the picture to a Bookmark, Card, 15 cm hoop or A4 in one tap; Picture size uses one stitch per pixel. A new picture now starts with its long side at 100 stitches and is never enlarged beyond its own pixels, and the Creator tells you when a very wide picture leaves a thin short side or when each pixel will become a block of stitches.',
      'Logos and other flat pictures come out cleaner at more sizes: when shading is off, the thin in-between shades along their edges are folded into the colours on either side more reliably, instead of becoming scattered stitches of extra threads.',
    ]
  },
  {
    version: '1.0.94',
    date: 'October 2026',
    notes: [
      'Convert now starts by asking what kind of picture it is: Graphic or logo, Photo or Pixel art. Each sets good starting values (pixel art keeps its own colours and size), and the Creator guesses the type when you add the picture. Every setting stays editable, and changing one shows Custom; to start from your own defaults instead, turn off Guess the picture type in Preferences > Pattern Creator. The colour limit is now called Threads (max), and counts say threads and chart symbols instead of colours: a blend is one symbol made of two threads, so a pattern might use 24 threads and 40 chart symbols.',
      'On wider screens a newly generated pattern now fills the chart area instead of opening as a small chart in the corner.',
    ]
  },
  {
    version: '1.0.93',
    date: 'October 2026',
    notes: [
      'Draw on a blank grid now starts with a New design sheet: pick a size (Small motif, Card, Medium, Large or your own), the fabric count and colour, and optionally a picture to trace over, shown faintly under the grid. The tracing picture stays with the design and can be shown, hidden, faded, changed or removed from the Canvas tab.',
    ]
  },
  {
    version: '1.0.92',
    date: 'October 2026',
    notes: [
      'Photos of any size can be turned into patterns from Home; the 4 MB limit is gone. Convert setup is no longer lost if the page reloads or your phone closes the browser before you generate: the Creator offers to continue setting it up, and unfinished conversions are listed on Home > Projects with Continue and Discard.',
    ]
  },
  {
    version: '1.0.91',
    date: 'October 2026',
    notes: [
      'Each pattern now keeps its own fabric colour, and the Pattern Creator and Stitch Tracker both draw the chart on it; Preferences sets the colour new patterns start with. The Fabric settings group counts into Aida and evenweave or linen (over two), offer White, Antique white, Cream, Black, Navy or any colour, and show the finished size and how much fabric to cut, in centimetres and inches with your preferred unit first. Fabric can be changed later from Edit > Project.',
    ]
  },
  {
    version: '1.0.90',
    date: 'October 2026',
    notes: [
      'Home > Create new has three clear ways to start: Turn a photo into a pattern, Draw on a blank grid and Import a chart, each opening only the files it can use. Pick a file meant for the other tile and you are asked whether to use that one instead. Files can be dropped onto the tab. In the Creator, a blank grid shows only the drawing tools until it has stitches, and a design drawn from scratch has a Canvas tab (grid size and fabric) instead of Convert.',
    ]
  },
  {
    version: '1.0.89',
    date: 'October 2026',
    notes: [
      'Importing a chart now ends with a choice: Start stitching opens it straight in the Stitch Tracker, Edit first in the Pattern Creator. On a phone the import review fits the screen, every tab is labelled and notes fold into one line, and symbols the chart\'s key doesn\'t list show as unassigned (a hatched square with a question mark) rather than as a made-up colour.',
    ]
  },
  {
    version: '1.0.88',
    date: 'October 2026',
    notes: [
      "The Pattern Creator's Palette tab now starts with your pattern's own colours, each with its symbol, number, name and stitch count. Add colour opens a picker with your stash, threads close to the selected colour, and all DMC threads with colour-family filters. You can change any colour's symbol (Undo puts it back), and the colour strip shows each thread's symbol on its swatch; press and hold a swatch to see its details.",
    ]
  },
  {
    version: '1.0.87',
    date: 'October 2026',
    notes: [
      'Placing single stitches by touch in the Pattern Creator is more precise. While you draw, a magnifier above your finger shows the stitches under it, and a tap places its stitch when you lift your finger, so you can slide onto the right square first. An optional precision cursor draws a crosshair above your finger instead. Turn either on or off under More tools. In Navigate, double-tap to zoom in on a spot and double-tap again to fit the chart, and touch screens can now zoom in to 400%.',
    ]
  },
  {
    version: '1.0.86',
    date: 'October 2026',
    notes: [
      'Logos and other flat pictures convert to far fewer threads: the in-between shades along their edges are folded into the colours on either side instead of getting threads of their own. The sample logo now needs 5 threads instead of 12.',
      'On phones the Pattern Creator gives the chart most of the screen. One bar at the top holds the pattern name, the save status and a More menu (Print PDF, Export, Open in Tracker, Pattern info, Help); a bar at the bottom holds Navigate | Draw, Paint, Fill, Erase, your colour, Undo and More tools, which now has zoom and an optional colour strip. Tablets in landscape and computers are unchanged.',
    ]
  },
  {
    version: '1.0.85',
    date: 'October 2026',
    notes: [
      'The Pattern Creator has a Navigate | Draw switch, like Mark and Navigate in the Stitch Tracker, so you can always see whether a touch will draw or scroll. On phones and tablets it is the first button in the toolbar and new patterns open in Navigate; on a computer it is in the Tools tab and H switches between them. Navigate replaces the Hand tool.',
    ]
  },
  {
    version: '1.0.84',
    date: 'October 2026',
    notes: [
      'On phones and tablets the Pattern Creator no longer shows mouse and keyboard tips such as \u201CRight-click any cell\u201D, \u201CHold Alt to zoom\u201D or \u201CPress ? for help\u201D; it says \u201CLong-press a stitch for more options\u201D instead. The labels under the Convert preview are larger and easier to read, in light and dark themes.',
    ]
  },
  {
    version: '1.0.83',
    date: 'October 2026',
    notes: [
      'New patterns start with 15 colours and no dithering, and plain backgrounds are left unstitched automatically. This only changes the starting values if you haven\u2019t set your own in Preferences.',
      'The Convert settings now start with Size & fabric and Colours. Image adjustments have moved further down as Adjust image, folded away until you need them.',
    ]
  },
  {
    version: '1.0.81',
    date: 'October 2026',
    notes: [
      'Clearer messages when a file can\u2019t be imported: they say what went wrong in plain English and link to a new help article, What can I import?. Files from other design programs (such as Pattern Maker .xsd or PCStitch .pat) are turned away with a note on how to export them as OXS or PDF, instead of failing as a picture.',
    ]
  },
  {
    version: '1.0.80',
    date: 'October 2026',
    notes: [
      'New patterns are named for you, so no box pops up while you create: a converted image takes the image\u2019s file name and a blank grid starts as \u201CUntitled design\u201D. The first time you print, export or track an automatically named pattern you\u2019re asked once whether to rename it. On a phone, rename a pattern from the project button at the top of the screen.',
    ]
  },
  {
    version: '1.0.79',
    date: 'October 2026',
    notes: [
      'On touch screens the chart now scrolls with one finger until you pick a drawing tool. Tap Paint, Fill or Erase again to go back to scrolling, and drag with two fingers to pan.',
      'Fast brush strokes in the Pattern Creator no longer leave gaps: Paint and Erase fill in every square the stroke passes over, and the whole stroke still undoes in one step.',
      'If you close the "Name your project" box, it no longer comes back each time you reopen that pattern.',
      'The Convert panel is tidier: Skip background and the fabric count each appear once (Background and Output), instead of twice.',
    ]
  },
  {
    version: '1.0.78',
    date: 'October 2026',
    notes: [
      'Finished size and skein estimates are now correct for evenweave and linen stitched over two (25, 28 and 32 count). They used to show half the real size and about half the thread.',
      'Shopping lists and Stash status count threads, not blends: a blend adds to the two threads it is made from instead of appearing as an extra colour to buy. The fabric size tables use each fabric\'s own setting, so the separate Over two boxes have gone.',
    ]
  },
  {
    version: '1.0.77',
    date: 'October 2026',
    notes: [
      '.oxs charts can be imported from the Home screen again. Imported Anchor threads are matched properly (using the official Anchor to DMC conversion) and flagged in the review, instead of being swapped for an unrelated DMC colour.',
      'Import warnings no longer show doubled brackets, as in “((colour))”.',
    ]
  },
  {
    version: '1.0.76',
    date: 'October 2026',
    notes: [
      'Pattern Creator settings and palette are available on phones and tablets again. On a phone, tap Settings at the bottom of the screen to change the size, colours and fabric before generating. On an iPad in landscape the panel sits beside the chart instead of covering it.',
      'Fit now fills the space you have: a new pattern opens sized to your screen instead of a fixed width.',
    ]
  },
  {
    version: '1.0.75',
    date: 'October 2026',
    notes: [
      'Bigger brushes in the Pattern Creator: Paint and Erase now go up to 10 × 10 stitches, with quick sizes of 1, 2, 3, 5, 7 and 10.',
      'You can now delete everything in a selection. Press Delete or Backspace, choose Delete on the selection bar, or right-click and choose Delete selected stitches. Undo brings it all back.',
    ]
  },
  {
    version: '1.0.74',
    date: 'October 2026',
    notes: [
      'Large patterns no longer freeze the Pattern Creator\'s Edit view. Moving the mouse over a big chart stays smooth at any zoom, and the chart draws faster.',
      'The Pattern Creator no longer opens a pattern at 100% zoom just because it was last open in the Stitch Tracker. It fits the pattern to the screen, or uses the zoom you last chose in the Creator.',
    ]
  },
  {
    version: '1.0.72',
    date: 'October 2026',
    notes: [
      'Tips no longer get in the way. They don\'t cover the chart or block clicks, so you can do what a tip suggests straight away, and once you close one (any way at all) it stays closed. Skip tips turns them all off.',
      'Skip tour in the Stitch Tracker now really skips, instead of opening the stitching-style questions. Walkthroughs wait for other windows to close, point at the right buttons, and the Pattern Creator\'s walkthrough is now about the Pattern Creator.',
      'Fixed first-visit walkthroughs sometimes never appearing, and the "Sessions are tracked automatically" message appearing two or three times.',
      'Restart guided tours (Help) and Reset every walkthrough (Preferences) now both reset every walkthrough and tip.',
      'Row mode works again: a row bar shows what is left in the row, with buttons and the up and down arrow keys to move between rows. Finishing a row moves you on to the next one.',
      'Section spotlight can now be turned on and off with S. The old F shortcut never worked because F toggles full stitches.',
      'File > Export PDF and Print PDF now use the settings from the Export tab, and the PDF is named after your project. The Stitch Tracker now makes the same Pattern Keeper-compatible PDF as the Pattern Creator.',
      'The Preferences window shows ×, —, £, € and … properly again, and backups (.csb files) can be chosen when restoring on iPhone, iPad and Android.',
    ]
  },
  {
    version: '1.0.71',
    date: 'October 2026',
    notes: [
      'Fixed the Stats page failing with "Stats failed to render" when you opened the stats for a project other than the one loaded in the Stitch Tracker.',
    ]
  },
  {
    version: '1.0.70',
    date: 'October 2026',
    notes: [
      'On a touchscreen in Mark mode, one finger now marks stitches and two fingers pan and zoom. Panning with two fingers keeps gliding briefly after you let go.',
      'A press-and-hold rectangle is no longer lost when you tap its opposite corner.',
    ]
  },
  {
    version: '1.0.69',
    date: 'October 2026',
    notes: [
      'Parking a thread now puts the marker on the stitch you clicked, in that stitch\'s colour, and it stays visible in Colour view and through Spotlight dimming. A marker clears itself when you mark its stitch done.',
      'Only a real right-click parks a thread; on a Mac, Ctrl+click works too.',
      'Navigate mode is now a hand tool: drag to move around the chart, and click to place the guide crosshair.',
    ]
  },
  {
    version: '1.0.68',
    date: 'October 2026',
    notes: [
      'New in the Stitch Tracker: work areas. Press W (or tap Area) to show just the part of a large pattern you are stitching. The colour list, counts, Spotlight and "Mark all done" then cover only that area, and the area is saved and synced with the project.',
    ]
  },
  {
    version: '1.0.67',
    date: 'October 2026',
    notes: [
      'The Stitch Tracker responds faster while you move the pointer over the chart, and the Outline highlight animates more smoothly.',
    ]
  },
  {
    version: '1.0.66',
    date: 'October 2026',
    notes: [
      'Importing a PDF chart: when a symbol needs a thread, you can now choose one by colour, and symbols that look alike in a scan can be merged into one.',
      'A booklet with several designs is read as separate charts. Choose one design, or import them all at once.',
      'Charts from MacStitch, charts printed in both colour and black and white, symbols drawn as pictures, half stitches drawn as a heavy diagonal line, and backstitch that ends mid-cell are all read correctly.',
      'A large import shows its progress in a card with a Cancel button, and pages can be rearranged with a finger on a tablet.',
    ]
  },
  {
    version: '1.0.65',
    date: 'October 2026',
    notes: [
      'New Replace colour window in the Pattern Creator. Right-click a stitch, use the swap button on a palette colour, or press R and click a stitch, then pick the new thread and see a preview before you apply it. It also recolours part stitches and backstitch, and can swap two colours.',
    ]
  },
  {
    version: '1.0.64',
    date: 'October 2026',
    notes: [
      'PDF charts printed over several pages are now put together in the right order, using the row and column numbers on each page. You can check and rearrange the pages before importing.',
      'Scanned charts and PDFs that are only a picture can now be imported, including every page of a scan. Three-quarter and quarter stitches drawn as triangles are read too.',
      'Symbols the importer could not match to the colour key are listed so you can choose a thread for each.',
    ]
  },
  {
    version: '1.0.63',
    date: 'September 2026',
    notes: [
      'Pages start faster: the Help pane and the backup tools now load the first time you open them. They still work offline.',
    ]
  },
  {
    version: '1.0.62',
    date: 'September 2026',
    notes: [
      'The Stitch Tracker chart is sharper on high-resolution screens and better sized on tablets and Android phones.',
    ]
  },
  {
    version: '1.0.61',
    date: 'September 2026',
    notes: [
      'Moving around a large chart in the Stitch Tracker is smoother, especially in Navigate mode, and uses less memory on phones and tablets.',
    ]
  },
  {
    version: '1.0.60',
    date: 'August 2026',
    notes: [
      'On iPad, importing a sync file no longer stops at a folder step that iPad browsers cannot do.',
    ]
  },
  {
    version: '1.0.59',
    date: 'August 2026',
    notes: [
      'Sync now works on iPad and iPhone. Use Share sync file in the cloud menu to save changes into your cloud drive, and Import file to bring them back. Files in the picker are no longer greyed out.',
      'iPhone and iPad users are now warned that the browser may clear stored patterns after a week without a visit. Adding the app to the Home Screen avoids this, and it now has a proper icon.',
    ]
  },
  {
    version: '1.0.58',
    date: 'August 2026',
    notes: [
      'Dragging around a large chart in the Stitch Tracker is dramatically smoother. The chart was being redrawn from scratch on every frame of a drag, and a highlight overlay was wiping and repainting itself across the whole pattern sixty times a second, even while you were just moving around.',
      'More of the Stitch Tracker\'s panel controls are big enough to tap: the highlight style buttons, the palette chip, the panel close button and the tick boxes.',
    ]
  },
  {
    version: '1.0.57',
    date: 'August 2026',
    notes: [
      'The Stash Manager opens roughly twice as fast. The thread list was building about a third more of the page than it needed to, which was the slowest thing in the app on a phone.',
      'The Pattern Creator no longer downloads around 350 KB of files for other parts of the app on phones and metered connections. It still does so on desktop, where it makes later pages open instantly.',
    ]
  },
  {
    version: '1.0.56',
    date: 'August 2026',
    notes: [
      'Fixed controls being cut off the right-hand side of the top bar on a phone. The File menu was completely unreachable on the Pattern Creator. The row now scrolls sideways so everything in it can be reached.',
      'The top bar no longer sits underneath the notch or status bar on phones that have one.',
      'Buttons, tabs, filter chips and the sort control are now big enough to tap accurately.',
      'Tapping a text field no longer makes the page zoom in and stay zoomed on iPhone and iPad.',
      'Pressing and holding on the chart no longer pops up the "Save Image" menu, and dragging to mark stitches no longer selects text.',
      'Buttons, cards and menu items no longer stay highlighted after you tap them.',
      'Removed a strip of empty space below the chart on tablets.',
      'The keyboard shortcuts button is now hidden on touch devices, where there is no keyboard to use them with. The shortcuts list is still available from the Help panel.',
    ]
  },
  {
    version: '1.0.55',
    date: 'August 2026',
    notes: [
      'Fixed the Stitch Tracker freezing or showing a blank chart on phones and tablets with larger patterns. The chart was being drawn at a size the device could not actually handle, so it silently gave up. It is now capped to what your device supports.',
      'On very large patterns the maximum zoom is lower than it used to be, and lower on a phone than on a desktop. The zoom levels that have gone were the ones that produced the blank chart, so they never worked.',
      'Fixed the Stash Manager sliding sideways on a phone. The filter row now scrolls on its own instead of stretching the whole page, which also puts the bottom panel back where it belongs rather than partway down the page.',
      'Buttons no longer stay highlighted after you tap them on a touchscreen.',
      'The Stitch Tracker no longer animates in the background, and pages load faster across the app.',
    ]
  },
  {
    version: '1.0.54',
    date: 'August 2026',
    notes: [
      'The colour panel in the Stitch Tracker now always sits beside your chart rather than on top of it. If you had the projects list collapsed, opening Colours used to hide part of the chart behind the panel.',
      'Removed the projects list from the left edge of the Stitch Tracker. Switching projects now happens entirely through the project menu in the top bar, and the chart gets the reclaimed space.',
    ]
  },
  {
    version: '1.0.53',
    date: 'August 2026',
    notes: [
      'Fixed a sync bug where patterns imported from another device could show up in the Pattern Library count but never actually appear on screen.',
      'Fixed a bug where deleting all patterns and then reconnecting a sync folder could permanently stop that device from receiving future updates to those patterns — even after they came back.',
      'When a sync skips a pattern because it was deleted on this device, you now see a prompt explaining why, with a one-tap Restore.',
      'Freshly synced patterns no longer get hidden inside a collapsed section of the Projects list.',
      'Legacy and URL-shared pattern files now sync automatically instead of getting stuck waiting for manual review.',
      'Checking a sync folder for updates is lighter on battery — files that have not changed since the last check are no longer re-read every time.',
      'The sync status panel no longer reports a successful export when the write actually failed.',
    ]
  },
  {
    version: '1.0.51',
    date: 'August 2026',
    notes: [
      'Cross-device sync overhaul. Patterns now keep their real "last edited" dates when they arrive on another device — previously every imported pattern was stamped with the moment it landed, which put your oldest work at the top of the list and buried recent changes at the bottom.',
      'Changes to a pattern you have already synced now arrive on their own. Before, only brand-new patterns appeared automatically and every later edit sat waiting behind a manual review step.',
      'Connecting a sync folder now sends your changes as well as receiving them. A device could previously be connected for months and never send anything.',
      'More of your work travels between devices: fractional stitches, daily stitch history, completion status, project colour, notes, designer and description, and thumbnails.',
      'Deleting a pattern on one device no longer blocks it forever. If you carry on working on it elsewhere, it comes back.',
      'Sync status now appears on every page, including a prompt to reconnect when your browser drops permission for the sync folder — the most common reason sync stops silently.',
      'Sync files are much smaller and written far less often. Source photos are no longer included by default; you can switch them back on in Preferences under What to sync.',
      'Fixed an error that could stop the thread stash saving during a sync import ("One of the specified object stores was not found").',
      'Added a way to rebuild a device’s library from another device, for when its copies have gone wrong.',
    ]
  },
  {
    version: '1.0.4',
    date: 'May 2026',
    notes: [
      'Service worker now reloads the page automatically when a new version deploys — no more stale cache.',
      'Thread sheen and canvas rendering improvements in the Stitch Tracker.',
      'Version number now visible in Settings and in the bottom corner on desktop.',
    ]
  },
  {
    version: '1.0.3',
    date: 'Apr 2026',
    notes: [
      'Live stash deduction: inline skein meter per thread row in the Stitch Tracker.',
      'Direct colour swap via right-click context menu, palette chip hover, or Replace tool.',
      'Remove-unused colours now works correctly in generated-pattern edit mode.',
      'Thread usage stats correctly split blended colour counts.',
    ]
  },
  {
    version: '1.0.2',
    date: 'Mar 2026',
    notes: [
      'Anchor (and other brand) threads are now correctly included when generating from stash.',
      'PDF import now saves patterns properly and opens them in the Pattern Creator.',
    ]
  },
  {
    version: '1.0.1',
    date: 'Feb 2026',
    notes: [
      'Sync, backup and restore reliability improvements.',
      'Onboarding wizard and coachmark polish.',
    ]
  },
  {
    version: '1.0.0',
    date: 'Jan 2026',
    notes: [
      'Initial release of stitchx.',
      'Pattern Creator: convert images to cross-stitch patterns and export to PDF.',
      'Stitch Tracker: follow stitching progress on any pattern.',
      'Stash Manager: manage thread inventory and a personal pattern library.',
    ]
  }
];

(function () {
  try {
    var cleanupKey = 'stitchx_babel_cleanup_version';
    if (localStorage.getItem(cleanupKey) === window.APP_VERSION) return;
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var key = localStorage.key(i);
      if (key && /^babel_/i.test(key)) localStorage.removeItem(key);
    }
    localStorage.setItem(cleanupKey, window.APP_VERSION);
  } catch (_) {}
})();

(function () {
  function inject() {
    if (document.getElementById('app-version-badge')) return;
    var el = document.createElement('div');
    el.id = 'app-version-badge';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = 'v' + window.APP_VERSION;
    document.body.appendChild(el);
  }
  if (document.body) {
    inject();
  } else {
    document.addEventListener('DOMContentLoaded', inject);
  }
})();
