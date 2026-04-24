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
    exportGridInterval:     10,
    exportCentreMarks:      true,

    // ─── Pattern Creator generation defaults (read by Sidebar on init) ──
    creatorDefaultPaletteSize:    24,
    creatorDefaultFabricCount:    16,
    creatorAllowBlends:           true,
    creatorStashOnlyDefault:      false,
    creatorDefaultDithering:      "balanced",   // off | weak | balanced | strong
    creatorSmoothDithering:       true,
    creatorOrphanRemovalStrength: 2,            // 0..3
    creatorMinStitchesPerColour:  6,
    creatorProtectDetails:        true,
    creatorStitchCleanup:         true,
    creatorDefaultViewMode:       "colour",     // colour | symbol | both
    creatorReferenceOpacity:      35,           // 0..100

    // ─── Stitch Tracker behaviour defaults ──────────────────────────────
    trackerStitchingStyle: "freestyle",         // freestyle | block | crosscountry | royal
    trackerBlockShape:     "10x10",             // WxH; "10x10" | "5x5" | etc.
    trackerStartCorner:    "TL",                // TL | TR | BL | BR | C
    trackerHalfStitchMode: "full",              // half | full | ignore
    trackerShowParking:    true,
    trackerUndoDepth:      50,
    trackerCelebrate:      true,
    // C3 — the unified pointer pipeline (useDragMark) is now the default.
    // Set this preference to false to fall back to plain tap-to-mark only
    // (no drag-mark, no long-press range). The legacy global override
    // `window.B2_DRAG_MARK_ENABLED = false` also disables the gesture.
    trackerDragMark:       true,

    // ─── Tracker left sidebar (toolbar-rework) ──────────────────────────
    // Persisted open/closed state and active tab for the new left sidebar
    // that consolidates Highlight / View / Session / Tools / Notes
    // controls. Default is closed — users opt in via the hamburger button.
    trackerLeftSidebarOpen: false,
    trackerLeftSidebarTab:  "highlight",
    // Palette legend sort: id | done | count
    trackerLegendSort:      "id",

    // ─── Stash Manager defaults ─────────────────────────────────────────
    stashDefaultBrand:        "DMC",            // DMC | Anchor | both
    stashLowStockThreshold:   1,
    stitchStrandsUsed:        2,
    stitchWasteFactor:        0.20,             // fraction (0..1)
    skeinPriceDefault:        0.95,
    patternsDefaultSort:      "date_desc",      // date_desc | date_asc | title_asc | designer_asc | status
    patternsDefaultFilter:    "all",            // all | wishlist | owned | inprogress | completed
    managerDetailGrid:        false,

    // ─── Accessibility ──────────────────────────────────────────────────
    a11yFontScale:        "m",                  // s | m | l | xl
    a11yHighContrast:     false,
    a11yReducedMotion:    false,
    a11yColourBlindAid:   "off",                // off | protan | deutan | tritan
    a11ySymbolOnly:       false,
    a11yDarkMode:         "system",             // system | light | dark

    // ─── Notifications ──────────────────────────────────────────────────
    toastsEnabled:    true,
    toastMaxVisible:  3,
    notifSound:       false,
    notifHaptic:      true,
    notifMilestones:  true,
    notifLowStock:    true,

    // ─── Regional & units ───────────────────────────────────────────────
    currency:               "GBP",              // GBP | USD | EUR | CAD | AUD
    threadLengthUnit:       "in",               // in | cm
    fabricMeasurementUnit:  "in",               // in | cm

    // ─── Sync, branding ─────────────────────────────────────────────────
    autoSyncEnabled:        true,
    autoLibraryLink:        true,
    appAccentColour:        "#0d9488",

    // ─── Advanced ───────────────────────────────────────────────────────
    commandPaletteHotkey:     "ctrl+k",         // ctrl+k | ctrl+/ | off
    flagExperimentalPreview:  false,

    // ─── Experimental features (opt-in, may change without notice) ──────
    "experimental.importWizard": false,         // C7: guided 5-step image-import wizard

    // ─── Onboarding coaching (C8 — flattened keys, one per coachmark) ──
    // Phase 1 active:
    "onboarding.coached.firstStitch_creator": false,
    "onboarding.coached.firstStitch_tracker": false,
    // Phase 2 reserved (declared so resetCoaching() finds them):
    "onboarding.coached.import":   false,
    "onboarding.coached.undo":     false,
    "onboarding.coached.progress": false,
    "onboarding.coached.save":     false,
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

  // ─── Persisted-state schema migration ──────────────────────────────────
  // STATE_SCHEMA_VERSION is bumped whenever a code change makes existing
  // localStorage values invalid (e.g. a renamed key, a new field that older
  // entries lack and that breaks read paths, or a hashing scheme change).
  // SCHEMA_BREAKS describes, per version, which keys (or key prefixes ending
  // in `*`) should be wiped when migrating. Entries are processed in order;
  // a fresh install gets the latest version stamped without any wipes.
  //
  // To declare a future break:
  //   1. Bump STATE_SCHEMA_VERSION to N.
  //   2. Add SCHEMA_BREAKS[N] = { wipe: ['cs_pview_*', 'cs_pref_someKey'] }.
  //   3. Document the reason in the same commit so users can see a changelog.
  var STATE_SCHEMA_VERSION = 1;
  var SCHEMA_VERSION_KEY = 'cs_state_schema_version';
  var SCHEMA_BREAKS = {
    // Example placeholder — future break would look like:
    // 2: { wipe: ['cs_pview_*'], reason: 'pview shape changed in vNext' }
  };

  function migrateState() {
    try {
      var raw = localStorage.getItem(SCHEMA_VERSION_KEY);
      var stored = raw == null ? 0 : (parseInt(raw, 10) || 0);
      if (stored >= STATE_SCHEMA_VERSION) return;
      for (var v = stored + 1; v <= STATE_SCHEMA_VERSION; v++) {
        var brk = SCHEMA_BREAKS[v];
        if (!brk || !Array.isArray(brk.wipe)) continue;
        brk.wipe.forEach(function (pattern) {
          var isPrefix = pattern.charAt(pattern.length - 1) === '*';
          var prefix = isPrefix ? pattern.slice(0, -1) : pattern;
          for (var i = localStorage.length - 1; i >= 0; i--) {
            var k = localStorage.key(i);
            if (!k) continue;
            if (isPrefix ? k.indexOf(prefix) === 0 : k === pattern) {
              try { localStorage.removeItem(k); } catch (_) {}
            }
          }
        });
      }
      localStorage.setItem(SCHEMA_VERSION_KEY, String(STATE_SCHEMA_VERSION));
    } catch (_) {}
  }
  migrateState();

  window.UserPrefs = {
    DEFAULTS: DEFAULTS,
    PVIEW_DEFAULTS: PVIEW_DEFAULTS,
    STATE_SCHEMA_VERSION: STATE_SCHEMA_VERSION,
    SCHEMA_BREAKS: SCHEMA_BREAKS,
    loadAll: loadAll,
    get: get,
    set: set,
    setDebounced: setDebounced,
    reset: reset,
    getPatternState: getPatternState,
    savePatternState: savePatternState,
    savePatternStateNow: savePatternStateNow,
    // Lists every per-pattern view-state entry as { id, key }. Used by the
    // Tutorials tab to display a name preview before bulk-clearing.
    listPatternStateIds: function () {
      var out = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(PREFIX_PVIEW) === 0) {
            out.push({ id: k.slice(PREFIX_PVIEW.length), key: k });
          }
        }
      } catch (_) {}
      return out;
    },
  };
})();
