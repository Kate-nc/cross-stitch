// ════════════════════════════════════════════════════════════════════
// version.js — app version string + DOM badge
// Bumped automatically by .github/workflows/bump-version.yml on each
// PR merge to main. Do not edit APP_VERSION manually.
// The hand-written Version history (APP_CHANGELOG) lives in changelog.js,
// which is loaded only when someone opens it.
// ════════════════════════════════════════════════════════════════════
window.APP_VERSION = '1.0.233';

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
