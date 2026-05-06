// ════════════════════════════════════════════════════════════════════
// version.js — app version string + DOM badge
// Bumped automatically by .github/workflows/bump-version.yml on each
// PR merge to main. Do not edit APP_VERSION manually.
// ════════════════════════════════════════════════════════════════════
window.APP_VERSION = '1.0.3';

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
