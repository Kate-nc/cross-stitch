// ════════════════════════════════════════════════════════════════════
// version.js — app version string + DOM badge
// Bumped automatically by .github/workflows/bump-version.yml on each
// PR merge to main. Do not edit APP_VERSION manually.
// APP_CHANGELOG is maintained manually alongside each release.
// ════════════════════════════════════════════════════════════════════
window.APP_VERSION = '1.0.42';

window.APP_CHANGELOG = [
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
