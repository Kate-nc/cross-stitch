/* user-prefs.js — Persistent user preferences: global and per-pattern.
   Global preferences are stored in localStorage (prefixed cs_pref_*).
   Per-pattern view state is stored in localStorage (prefixed cs_pview_*).
   All reads fall back to defaults when keys are absent or data is corrupt.
   Exposes: window.UserPrefs */

(function() {
  "use strict";

  var PREFIX_GLOBAL = "cs_pref_";
  var PREFIX_PVIEW  = "cs_pview_";

  var DEFAULTS = {
    preferredPreviewLevel:  "level2",
    gridOverlayEnabled:     false,
    fabricColour:           "#F5F0E6",
    splitPaneEnabled:       false,
    splitPaneRatio:         0.5,
    splitPaneSyncEnabled:   true,
    rightPaneMode:          "level2",
    coverageAutoSync:       true,
    coverageManualValue:    0.5,
    preferredMockupType:    "hoop",
    preferredHoopStyle:     "light-maple",
    preferredFrameStyle:    "slim-black",
    preferredMountColour:   "#FFFFFF",
    preferredMountWidth:    0.08,
    previewQualityAuto:     true,

    // ─── Designer branding (consumed by the PDF export pipeline) ────────
    designerName:         "",
    designerLogo:         null,        // data URL (PNG/JPEG) or null
    designerLogoPosition: "top-right", // "top-left" | "top-right"
    designerCopyright:    "",
    designerContact:      "",

    // ─── PDF export defaults (last-used values for the Export panel) ────
    exportPreset:           "patternKeeper", // "patternKeeper" | "homePrinting"
    exportPageSize:         "auto",          // "auto" | "a4" | "letter"
    exportMarginsMm:        12,
    exportStitchesPerPage:  "medium",        // "small" | "medium" | "large" | "custom"
    exportCustomCols:       60,
    exportCustomRows:       70,
    exportChartModeBw:      true,
    exportChartModeColour:  true,
    exportOverlap:          true,
    exportIncludeCover:     true,
    exportIncludeInfo:      true,
    exportIncludeIndex:     true,
    exportMiniLegend:       true,
  };

  var PVIEW_DEFAULTS = {
    zoomLevel:            null,
    scrollLeft:           0,
    scrollTop:            0,
    activeViewMode:       "chart",
    splitPaneRightMode:   "level2",
    fabricColourOverride: null,
    coverageOverride:     null,
  };

  // Debounce timers keyed by localStorage key
  var saveTimers = {};
  var pviewTimers = {};

  function _read(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX_GLOBAL + key);
      if (raw === null) return fallback;
      var v = JSON.parse(raw);
      return v !== null ? v : fallback;
    } catch (_) { return fallback; }
  }

  function _write(key, value) {
    try { localStorage.setItem(PREFIX_GLOBAL + key, JSON.stringify(value)); } catch (_) {}
  }

  // Load all global prefs, merging with defaults
  function loadAll() {
    var prefs = {};
    Object.keys(DEFAULTS).forEach(function(k) {
      prefs[k] = _read(k, DEFAULTS[k]);
    });
    return prefs;
  }

  // Get a single global pref
  function get(key) {
    return _read(key, Object.prototype.hasOwnProperty.call(DEFAULTS, key) ? DEFAULTS[key] : undefined);
  }

  // Set a global pref immediately
  function set(key, value) {
    _write(key, value);
  }

  // Set a global pref with debounced write (500ms) — for slider drags
  function setDebounced(key, value) {
    if (saveTimers[key]) clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(function() {
      delete saveTimers[key];
      _write(key, value);
    }, 500);
  }

  // Reset all global prefs and per-pattern view states to defaults
  function reset() {
    try {
      var keysToRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && (k.indexOf(PREFIX_GLOBAL) === 0 || k.indexOf(PREFIX_PVIEW) === 0)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(function(k) { try { localStorage.removeItem(k); } catch (_) {} });
      Object.keys(saveTimers).forEach(function(k) { clearTimeout(saveTimers[k]); });
      saveTimers = {};
      Object.keys(pviewTimers).forEach(function(k) { clearTimeout(pviewTimers[k]); });
      pviewTimers = {};
    } catch (_) {}
  }

  // Read per-pattern state for a project ID
  function getPatternState(id) {
    if (!id) return Object.assign({}, PVIEW_DEFAULTS);
    try {
      var raw = localStorage.getItem(PREFIX_PVIEW + id);
      if (!raw) return Object.assign({}, PVIEW_DEFAULTS);
      var parsed = JSON.parse(raw);
      return Object.assign({}, PVIEW_DEFAULTS, parsed);
    } catch (_) { return Object.assign({}, PVIEW_DEFAULTS); }
  }

  // Save per-pattern view state with a 5-second debounce
  function savePatternState(id, viewState) {
    if (!id) return;
    if (pviewTimers[id]) clearTimeout(pviewTimers[id]);
    pviewTimers[id] = setTimeout(function() {
      delete pviewTimers[id];
      try { localStorage.setItem(PREFIX_PVIEW + id, JSON.stringify(viewState)); } catch (_) {}
    }, 5000);
  }

  // Save per-pattern view state immediately (on close / background)
  function savePatternStateNow(id, viewState) {
    if (!id) return;
    if (pviewTimers[id]) { clearTimeout(pviewTimers[id]); delete pviewTimers[id]; }
    try { localStorage.setItem(PREFIX_PVIEW + id, JSON.stringify(viewState)); } catch (_) {}
  }

  window.UserPrefs = {
    DEFAULTS: DEFAULTS,
    PVIEW_DEFAULTS: PVIEW_DEFAULTS,
    loadAll: loadAll,
    get: get,
    set: set,
    setDebounced: setDebounced,
    reset: reset,
    getPatternState: getPatternState,
    savePatternState: savePatternState,
    savePatternStateNow: savePatternStateNow,
  };
})();
