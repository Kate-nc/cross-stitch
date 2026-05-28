// navigation.js
// ════════════════════════════════════════════════════════════════════════════
// Unified project-aware navigation API (window.NavigationAPI).
//
// All global navigation surfaces (header app-section tabs, command palette)
// delegate here instead of making raw routing decisions. Three-tier dispatch:
//
//   1. Handoff tier — a page-specific save+handoff function registered by the
//      owning tool when a project is loaded (window.__navigateToTracker,
//      window.__navigateToEditor). Calls the existing full save/snapshot path.
//
//   2. In-page switch tier — a UnifiedApp mode-switch function exposed by
//      creator-main.js (window.__switchToCreate/Edit/Track/Stats/__goHome).
//      Switches modes without leaving the page.
//
//   3. Cross-page tier — sets window.__navigatingAway = true, calls
//      ProjectStorage.setActiveProject(id), appends ?id= when navigating to
//      editor or tracker, then sets location.href. The editor cross-page URL
//      uses ?from=home (not ?action=open, which clears the active project).
//
// Handoff registrations are owned by their respective tools:
//   window.__navigateToTracker  — registered by CreatorApp in creator-main.js
//   window.__navigateToEditor   — registered by TrackerApp in tracker-app.js
// ════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NavigationAPI) return; // idempotent

  // ── Cross-page URL fallbacks ───────────────────────────────────────────────
  // All URLs are project-safe: no action=open, tracker URLs use ?from=home so
  // the boot guard allows the load when no active project is set.
  var _CROSS_PAGE_URL = {
    creator: 'home.html?tab=create',
    editor:  'create.html?from=home',
    tracker: 'stitch.html?from=home',
    stash:   'manager.html?from=home',
    stats:   'index.html?mode=stats&from=home',
    home:    'home.html',
  };

  // ── In-page switch function names ─────────────────────────────────────────
  var _SWITCH_FN = {
    creator: '__switchToCreate',
    editor:  '__switchToEdit',
    tracker: '__switchToTrack',
    stats:   '__switchToStats',
    home:    '__goHome',
  };

  // ── Page-specific save-and-handoff function names ─────────────────────────
  // Registered by the owning tool when a project is loaded; deregistered on
  // unmount. Checked before _SWITCH_FN so unsaved work is flushed first.
  var _HANDOFF_FN = {
    tracker: '__navigateToTracker',  // Creator → Tracker (save + handoff)
    editor:  '__navigateToEditor',   // Tracker → Editor  (snapshot + handoff)
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _activeProjectId() {
    try {
      if (typeof ProjectStorage !== 'undefined' && ProjectStorage.getActiveProjectId) {
        return ProjectStorage.getActiveProjectId();
      }
      return localStorage.getItem('crossstitch_active_project') || null;
    } catch (_) { return null; }
  }

  function _setActive(id) {
    try {
      if (typeof ProjectStorage !== 'undefined' && ProjectStorage.setActiveProject) {
        ProjectStorage.setActiveProject(id);
      } else {
        localStorage.setItem('crossstitch_active_project', id);
      }
    } catch (_) {}
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.NavigationAPI = {
    // navigateTo(target, opts)
    //   target: 'creator' | 'editor' | 'tracker' | 'stash' | 'stats' | 'home'
    //   opts.projectId: override active project id (optional)
    //   Returns true when handled in-page; false when cross-page navigation fires.
    navigateTo: function (target, opts) {
      opts = opts || {};
      var projectId = opts.projectId || _activeProjectId();

      // Tier 1 — project-aware handoff (saves before switching).
      var handoffName = _HANDOFF_FN[target];
      if (handoffName && typeof window[handoffName] === 'function') {
        window[handoffName]();
        return true;
      }

      // Tier 2 — in-page UnifiedApp mode switch.
      var switchName = _SWITCH_FN[target];
      if (switchName && typeof window[switchName] === 'function') {
        window[switchName]();
        return true;
      }

      // Tier 3 — cross-page URL navigation with project context preserved.
      var url = _CROSS_PAGE_URL[target];
      if (!url) return false;

      if (projectId && (target === 'tracker' || target === 'editor')) {
        var sep = url.indexOf('?') !== -1 ? '&' : '?';
        url += sep + 'id=' + encodeURIComponent(projectId);
        _setActive(projectId);
      }

      window.__navigatingAway = true;
      window.location.href = url;
      return false;
    },
  };
})();
