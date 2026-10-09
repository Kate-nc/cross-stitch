// ════════════════════════════════════════════════════════════════════
// version.js — app version string + DOM badge
// Bumped automatically by .github/workflows/bump-version.yml on each
// PR merge to main. Do not edit APP_VERSION manually.
// APP_CHANGELOG is maintained manually alongside each release.
// ════════════════════════════════════════════════════════════════════
window.APP_VERSION = '1.0.75';

window.APP_CHANGELOG = [
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
