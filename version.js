// ════════════════════════════════════════════════════════════════════
// version.js — app version string + DOM badge
// Bumped automatically by .github/workflows/bump-version.yml on each
// PR merge to main. Do not edit APP_VERSION manually.
// APP_CHANGELOG is maintained manually alongside each release.
// ════════════════════════════════════════════════════════════════════
window.APP_VERSION = '1.0.56';

window.APP_CHANGELOG = [
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
