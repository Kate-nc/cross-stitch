/* creator/useImportWizard.js — C7 image-import wizard state hook.
 *
 * Owns the 5-step wizard state machine, persists a draft to localStorage so
 * the user can resume after an accidental reload, and produces a settings
 * object that's drop-in compatible with parseImagePattern() (the same call
 * site the legacy single-step modal uses in tracker-app.js).
 *
 * Behind the experimental.importWizard pref. Legacy flow is untouched.
 *
 * No emoji in copy. British English. Public API:
 *
 *   const wiz = window.useImportWizard({ image, baseName });
 *   wiz.step / wiz.crop / wiz.palette / wiz.size / wiz.settings / wiz.name
 *   wiz.setCrop / setPalette / setSize / setSettings / setName
 *   wiz.next() / wiz.back() / wiz.goto(n)
 *   wiz.reset()                                // clears draft + state
 *   wiz.commit() -> { name, maxWidth, maxHeight, maxColours,
 *                     skipWhiteBg, bgThreshold, fabricCt,
 *                     crop, palette, settings }
 */
(function () {
  if (typeof window === "undefined") return;

  var STEPS = 5;
  var DRAFT_KEY = "cs_import_wizard_draft";
  var DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days

  function _readDraft(match) {
    try {
      var raw = (typeof localStorage !== "undefined") ? localStorage.getItem(DRAFT_KEY) : null;
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      if (typeof obj.ts === "number" && (Date.now() - obj.ts) > DRAFT_TTL_MS) {
        try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
        return null;
      }
      // Bug-hunt D2 — reject drafts that were written for a different
      // source image. Without this, importing image A then image B would
      // resume image B mid-wizard with image A's settings (auto-fit size,
      // base name, crop rectangle) silently applied.
      if (match && (typeof obj.imageW === "number" || typeof obj.imageH === "number")) {
        if (obj.imageW !== (match.imageW | 0) ||
            obj.imageH !== (match.imageH | 0) ||
            (obj.baseName || "") !== (match.baseName || "")) {
          try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
          return null;
        }
      }
      return obj;
    } catch (_) { return null; }
  }

  function _writeDraft(state, match) {
    try {
      if (typeof localStorage === "undefined") return;
      var payload = {
        v: 1, ts: Date.now(),
        step: state.step, crop: state.crop, palette: state.palette,
        size: state.size, settings: state.settings, name: state.name,
        imageW: match ? (match.imageW | 0) : 0,
        imageH: match ? (match.imageH | 0) : 0,
        baseName: match ? (match.baseName || "") : ""
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch (_) { /* QuotaExceededError etc. — fail silently */ }
  }

  function _clearDraft() {
    try { if (typeof localStorage !== "undefined") localStorage.removeItem(DRAFT_KEY); } catch (_) {}
  }

  function _clamp(n) {
    n = (n | 0);
    if (n < 1) return 1;
    if (n > STEPS) return STEPS;
    return n;
  }

  function _autoFitSize(image) {
    if (!image || !image.width || !image.height) return { w: 80, h: 80 };
    var TARGET = 80;
    var longest = Math.max(image.width, image.height);
    var scale = Math.min(1, TARGET / longest);
    return {
      w: Math.max(10, Math.round(image.width  * scale)),
      h: Math.max(10, Math.round(image.height * scale))
    };
  }

  function _initialState(image, baseName, draft) {
    var d = draft || {};
    var fitted = _autoFitSize(image);
    return {
      step: d.step || 1,
      crop: d.crop || { rotate: 0, flipH: false, flipV: false, aspect: "free" },
      palette: d.palette || { mode: "dmc", maxColours: 30, allowBlends: true },
      size: d.size || { w: fitted.w, h: fitted.h, lock: true, fabricCt: 14 },
      settings: d.settings || { dither: true, contrast: 0, saliency: false, skipBg: false, bgThreshold: 15 },
      name: d.name || baseName || ""
    };
  }

  function useImportWizard(opts) {
    var React = window.React;
    var image = (opts && opts.image) || null;
    var baseName = (opts && opts.baseName) || "";
    var match = {
      imageW: image && image.width  ? image.width  : 0,
      imageH: image && image.height ? image.height : 0,
      baseName: baseName
    };

    // Single state object so we can persist atomically on every action.
    var initial = (React && React.useMemo)
      ? React.useMemo(function () { return _initialState(image, baseName, _readDraft(match)); }, [])
      : _initialState(image, baseName, _readDraft(match));

    var st = React.useState(initial);
    var state = st[0], setState = st[1];

    // Read the latest state via the setState updater. Works in both real
    // React (where the updater fires synchronously) and our test fakes.
    function _peek() {
      var latest = state;
      setState(function (prev) { latest = prev; return prev; });
      return latest;
    }

    function _apply(patch) {
      setState(function (prev) {
        var next = Object.assign({}, prev, patch);
        _writeDraft(next, match);
        return next;
      });
    }

    function next() { setState(function (prev) { var n = Object.assign({}, prev, { step: _clamp(prev.step + 1) }); _writeDraft(n, match); return n; }); }
    function back() { setState(function (prev) { var n = Object.assign({}, prev, { step: _clamp(prev.step - 1) }); _writeDraft(n, match); return n; }); }
    function goto_(target) { setState(function (prev) { var n = Object.assign({}, prev, { step: _clamp(target) }); _writeDraft(n, match); return n; }); }

    function setCrop(v)     { setState(function (prev) { var nv = typeof v === "function" ? v(prev.crop)     : v; var n = Object.assign({}, prev, { crop: nv });     _writeDraft(n, match); return n; }); }
    function setPalette(v)  { setState(function (prev) { var nv = typeof v === "function" ? v(prev.palette)  : v; var n = Object.assign({}, prev, { palette: nv });  _writeDraft(n, match); return n; }); }
    function setSize(v)     { setState(function (prev) { var nv = typeof v === "function" ? v(prev.size)     : v; var n = Object.assign({}, prev, { size: nv });     _writeDraft(n, match); return n; }); }
    function setSettings(v) { setState(function (prev) { var nv = typeof v === "function" ? v(prev.settings) : v; var n = Object.assign({}, prev, { settings: nv }); _writeDraft(n, match); return n; }); }
    function setName(v)     { setState(function (prev) { var nv = typeof v === "function" ? v(prev.name)     : v; var n = Object.assign({}, prev, { name: nv });     _writeDraft(n, match); return n; }); }

    function reset() {
      _clearDraft();
      var fresh = _initialState(image, baseName, null);
      setState(fresh);
    }

    function commit() {
      _clearDraft();
      var s = _peek();
      var trimmedName = (s.name || "").trim().slice(0, 60);
      // Settings shape compatible with the existing parseImagePattern() call
      // site in tracker-app.js (and the wider generate-worker job message).
      return {
        name: trimmedName,
        maxWidth: s.size.w,
        maxHeight: s.size.h,
        maxColours: s.palette.maxColours,
        skipWhiteBg: !!s.settings.skipBg,
        bgThreshold: s.settings.bgThreshold,
        fabricCt: s.size.fabricCt,
        // Pass-through for downstream wiring (allowBlends, dither, etc.).
        crop:     s.crop,
        palette:  s.palette,
        settings: s.settings
      };
    }

    return {
      step: state.step,
      image: image,
      crop: state.crop,
      palette: state.palette,
      size: state.size,
      settings: state.settings,
      name: state.name,
      setCrop: setCrop,
      setPalette: setPalette,
      setSize: setSize,
      setSettings: setSettings,
      setName: setName,
      next: next,
      back: back,
      goto: goto_,
      reset: reset,
      commit: commit,
      STEPS: STEPS
    };
  }

  // Expose for tests + other modules.
  window.useImportWizard = useImportWizard;
  window.ImportWizardInternals = {
    DRAFT_KEY: DRAFT_KEY,
    DRAFT_TTL_MS: DRAFT_TTL_MS,
    STEPS: STEPS,
    _readDraft: _readDraft,
    _writeDraft: _writeDraft,
    _clearDraft: _clearDraft,
    _initialState: _initialState,
    _autoFitSize: _autoFitSize,
    _clamp: _clamp
  };
})();
