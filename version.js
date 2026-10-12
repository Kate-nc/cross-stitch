// ════════════════════════════════════════════════════════════════════
// version.js — app version string + DOM badge
// Bumped automatically by .github/workflows/bump-version.yml on each
// PR merge to main. Do not edit APP_VERSION manually.
// APP_CHANGELOG is maintained manually alongside each release.
// ════════════════════════════════════════════════════════════════════
window.APP_VERSION = '1.0.126';

window.APP_CHANGELOG = [
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
