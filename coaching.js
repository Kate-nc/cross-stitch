// coaching.js — One-off coachmark tips (C8) and shared onboarding plumbing.
//
// Public API:
//   window.Coachmark                         React component (props below)
//   window.useCoachingSequence(mode, eligible)
//                                            hook → { active, complete, skip, skipAll }
//   window.resetCoaching()                   resets EVERY tutorial: coachmarks,
//                                            welcome walkthroughs, the Tracker
//                                            style picker and the "?" help hint
//   window.Coaching                          helpers (some used by tests):
//     ._SEQUENCES                            per-mode ordered step IDs
//     ._filter(steps, completed)             → first un-coached step ID or null
//     ._resolvePlacement(rect, vw, vh, prefer, size) → {top,left,placement,width}
//     ._isCoached(stepId) / ._markCoached(stepId)
//     .overlayOpened() / .overlayClosed() / .isOverlayOpen()
//                                            registry of blocking onboarding
//                                            overlays (walkthroughs, the style
//                                            picker); coachmarks wait for them
//
// Behaviour (see reports/tutorial-popups-analysis.md for why):
//   - Any way of dismissing a tip — Got it, Skip tips, Escape, clicking
//     elsewhere, Learn more — is remembered. Tips never come back on their
//     own; Help > Getting Started > Restart guided tours brings them back.
//   - Tips are non-modal by default: no scrim, the page stays usable, so
//     "click a cell to paint" can actually be done (and auto-completes the
//     tip). `modal: true` restores a blocking scrim for purely
//     informational tips.
//   - Position is measured from the rendered card and re-checked every
//     frame while visible, so it follows a target that moves.
//   - Escape goes through the shared window.useEscape stack, so it closes
//     only the topmost thing.
//
// House rules: no emoji in copy (SVG icons via window.Icons); British English.
// Completion persists in UserPrefs as `onboarding.coached.<stepId>`.

(function () {
  if (typeof window === "undefined") return;

  // ── Sequence definition ────────────────────────────────────────────────
  var SEQUENCES = {
    creator: [
      // "import",        // Phase 2
      "toolsTab_unlocked",  // after a pattern is generated: Tools/View unlock
      "firstStitch_creator",
      // "undo",          // Phase 2
      // "save"           // Phase 2
    ],
    tracker: [
      "firstStitch_tracker",
      "rectSelect_tracker",  // teach rectangle marking once tapping is familiar
      // "undo",          // Phase 2
      // "progress"       // Phase 2
    ],
    manager: []
  };

  var PREF_PREFIX = "onboarding.coached.";
  function prefKey(stepId) { return PREF_PREFIX + stepId; }

  function isCoached(stepId) {
    try {
      if (window.UserPrefs && typeof window.UserPrefs.get === "function") {
        return !!window.UserPrefs.get(prefKey(stepId));
      }
    } catch (_) {}
    return false;
  }

  function markCoached(stepId) {
    try {
      if (window.UserPrefs && typeof window.UserPrefs.set === "function") {
        window.UserPrefs.set(prefKey(stepId), true);
      }
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent("cs:prefsChanged", {
        detail: { key: prefKey(stepId), value: true }
      }));
    } catch (_) {}
  }

  // Pure helper: pick the first step in `steps` whose ID is NOT in `completed`.
  // Returns null if every step is complete or `steps` is empty.
  function pickNext(steps, completed) {
    if (!Array.isArray(steps) || steps.length === 0) return null;
    var done = {};
    if (Array.isArray(completed)) {
      for (var i = 0; i < completed.length; i++) done[completed[i]] = true;
    }
    for (var j = 0; j < steps.length; j++) {
      if (!done[steps[j]]) return steps[j];
    }
    return null;
  }

  // Pure helper: place a popover of `size` ({width, height}, measured) next
  // to a target rect. Falls back to the viewport centre when the rect is
  // missing or off-screen. Prefers the requested side and flips to the
  // opposite one if there isn't room (12px gutter). Without `size`, uses an
  // estimate (360×160, 300 wide on phones) — only good for the first frame.
  function resolvePlacement(rect, vw, vh, prefer, size) {
    var GAP = 12;
    var POPOVER_W = (size && size.width > 0) ? size.width : (vw <= 480 ? 300 : 360);
    var POPOVER_H = (size && size.height > 0) ? size.height : 160;
    function centred() {
      return {
        top: Math.max(GAP, (vh - POPOVER_H) / 2),
        left: Math.max(GAP, (vw - POPOVER_W) / 2),
        placement: "centre",
        width: POPOVER_W
      };
    }
    if (!rect || rect.width <= 0 || rect.height <= 0
        || rect.bottom < 0 || rect.right < 0
        || rect.top > vh || rect.left > vw) {
      return centred();
    }
    var p = (prefer || "bottom");
    if (p === "centre") return centred();
    // Over the bottom of a large target (e.g. the chart), centred across it.
    if (p === "inside-bottom") {
      var visBottom = Math.min(rect.bottom, vh);
      return {
        top: Math.max(GAP, Math.min(vh - POPOVER_H - GAP, visBottom - GAP - POPOVER_H)),
        left: Math.max(GAP, Math.min(vw - POPOVER_W - GAP, Math.max(rect.left, 0) + (Math.min(rect.right, vw) - Math.max(rect.left, 0)) / 2 - POPOVER_W / 2)),
        placement: "inside-bottom",
        width: POPOVER_W
      };
    }
    function fits(side) {
      if (side === "bottom") return rect.bottom + GAP + POPOVER_H <= vh;
      if (side === "top")    return rect.top    - GAP - POPOVER_H >= 0;
      if (side === "right")  return rect.right  + GAP + POPOVER_W <= vw;
      if (side === "left")   return rect.left   - GAP - POPOVER_W >= 0;
      return false;
    }
    var opp = { top: "bottom", bottom: "top", left: "right", right: "left" };
    if (!fits(p)) {
      if (fits(opp[p])) p = opp[p];
      else {
        // Neither side of the preferred axis fits (narrow phone): try the other axis.
        var other = (p === "left" || p === "right") ? ["bottom", "top"] : ["right", "left"];
        if (fits(other[0])) p = other[0]; else if (fits(other[1])) p = other[1];
      }
    }
    function clampTop(t) { return Math.max(GAP, Math.min(vh - POPOVER_H - GAP, t)); }
    function clampLeft(l) { return Math.max(GAP, Math.min(vw - POPOVER_W - GAP, l)); }
    var top, left;
    if (p === "bottom") {
      top = clampTop(rect.bottom + GAP);
      left = clampLeft(rect.left + rect.width / 2 - POPOVER_W / 2);
    } else if (p === "top") {
      top = clampTop(rect.top - GAP - POPOVER_H);
      left = clampLeft(rect.left + rect.width / 2 - POPOVER_W / 2);
    } else if (p === "right") {
      top = clampTop(rect.top + rect.height / 2 - POPOVER_H / 2);
      left = clampLeft(rect.right + GAP);
    } else {
      top = clampTop(rect.top + rect.height / 2 - POPOVER_H / 2);
      left = clampLeft(rect.left - GAP - POPOVER_W);
    }
    return { top: top, left: left, placement: p, width: POPOVER_W };
  }

  // ── Blocking-overlay registry ──────────────────────────────────────────
  // Welcome walkthroughs and the Tracker's style picker register here while
  // they are open; coachmarks stay hidden until the count is back to zero,
  // so onboarding pop-ups queue instead of stacking.
  var openOverlays = 0;
  function notifyOverlay() {
    try {
      window.dispatchEvent(new CustomEvent("cs:onboardingOverlayChange", { detail: { open: openOverlays > 0 } }));
    } catch (_) {}
  }
  function overlayOpened() { openOverlays++; notifyOverlay(); }
  function overlayClosed() { openOverlays = Math.max(0, openOverlays - 1); notifyOverlay(); }
  function isOverlayOpen() { return openOverlays > 0; }

  function useOverlayOpen() {
    var React = window.React;
    var st = React.useState(isOverlayOpen());
    var setOpen = st[1];
    React.useEffect(function () {
      function onChange() { setOpen(isOverlayOpen()); }
      window.addEventListener("cs:onboardingOverlayChange", onChange);
      onChange();
      return function () { window.removeEventListener("cs:onboardingOverlayChange", onChange); };
    }, []);
    return st[0];
  }

  // ── React hook: useCoachingSequence ────────────────────────────────────
  // Returns the first step of the mode's sequence that is not yet coached
  // and is eligible right now, or null. `eligible` is an optional
  // {stepId: boolean} map from the host: an ineligible step is passed over
  // without being marked, so a later step can show (e.g. first-stitch on a
  // blank grid, where the "Tools unlocked" step doesn't apply).
  //   complete(id)  the user did it, or pressed Got it — remembered
  //   skip(id)      dismissed (Escape, clicking away, Learn more) —
  //                 remembered; later tips in the sequence still show
  //                 when their moment comes
  //   skipAll()     Skip tips — every step in the sequence is remembered
  function useCoachingSequence(mode, eligible) {
    var React = window.React;
    if (!React || typeof React.useState !== "function") {
      return { active: null, complete: function () {}, skip: function () {}, skipAll: function () {} };
    }
    var sequence = SEQUENCES[mode] || [];
    function readCompleted() {
      var arr = [];
      for (var i = 0; i < sequence.length; i++) {
        if (isCoached(sequence[i])) arr.push(sequence[i]);
      }
      return arr;
    }
    var st = React.useState(readCompleted);
    var completed = st[0];
    var setCompleted = st[1];
    var quiet = useOverlayOpen();

    // Pick up resets and completions made elsewhere (another component,
    // the Help drawer, Preferences) without needing a reload.
    React.useEffect(function () {
      function onPrefs(e) {
        var d = (e && e.detail) || {};
        if (d.reset) {
          setCompleted(readCompleted());
          return;
        }
        if (typeof d.key === "string" && d.key.indexOf(PREF_PREFIX) === 0) {
          setCompleted(readCompleted());
        }
      }
      window.addEventListener("cs:prefsChanged", onPrefs);
      return function () { window.removeEventListener("cs:prefsChanged", onPrefs); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    var pool = [];
    for (var k = 0; k < sequence.length; k++) {
      var id = sequence[k];
      if (eligible && !eligible[id]) continue;
      pool.push(id);
    }
    var active = quiet ? null : pickNext(pool, completed);

    function remember(ids) {
      ids.forEach(function (sid) { markCoached(sid); });
      setCompleted(function (prev) {
        var next = prev.slice();
        ids.forEach(function (sid) { if (next.indexOf(sid) === -1) next.push(sid); });
        return next;
      });
    }

    var complete = React.useCallback(function (stepId) {
      var sid = stepId || active;
      if (sid) remember([sid]);
    }, [active]);

    var skip = React.useCallback(function (stepId) {
      var sid = stepId || active;
      if (sid) remember([sid]);
    }, [active]);

    var skipAll = React.useCallback(function () {
      remember(sequence.slice());
    }, [mode]);

    return { active: active, complete: complete, skip: skip, skipAll: skipAll };
  }

  // ── React component: Coachmark ─────────────────────────────────────────
  // Props:
  //   id                    string (required) — used for ARIA ids
  //   target                CSS selector OR DOM element (optional)
  //   placement             "top" | "bottom" | "left" | "right" | "centre" |
  //                         "inside-bottom" (over the bottom of a large target)
  //   title, body           strings
  //   buttons               [{ label, action: "skip" | "skipAll" | "complete", primary }]
  //   showHighlight         boolean — ring around the target
  //   modal                 boolean (default false) — blocking scrim; click
  //                         on it dismisses. Non-modal tips leave the page usable.
  //   completeOnTargetClick boolean — clicking the target completes the tip
  //   helpTopic             string — adds a Learn more link (Help search)
  //   onComplete, onSkip, onSkipAll   callbacks (onSkipAll falls back to onSkip)
  function Coachmark(props) {
    var React = window.React;
    if (!React) return null;
    var h = React.createElement;
    var popoverRef = React.useRef(null);
    var prevFocusRef = React.useRef(null);
    var modal = props.modal === true;
    // Measured card size and target rect; null until the first measurement.
    var ls = React.useState(null);
    var layout = ls[0], setLayout = ls[1];
    var propsRef = React.useRef(props);
    propsRef.current = props;

    var reduceMotion = false;
    try {
      reduceMotion = !!(window.UserPrefs && window.UserPrefs.get && window.UserPrefs.get("a11yReducedMotion"));
    } catch (_) {}

    function targetEl() {
      var t = propsRef.current.target;
      if (!t) return null;
      if (typeof t === "string") {
        try { return document.querySelector(t); } catch (_) { return null; }
      }
      return (t && t.getBoundingClientRect) ? t : null;
    }
    function targetRect() {
      var el = targetEl();
      if (!el) return null;
      try { return el.getBoundingClientRect(); } catch (_) { return null; }
    }

    function doComplete() { var p = propsRef.current; if (typeof p.onComplete === "function") p.onComplete(); }
    function doSkip() { var p = propsRef.current; if (typeof p.onSkip === "function") p.onSkip(); }
    function doSkipAll() {
      var p = propsRef.current;
      if (typeof p.onSkipAll === "function") p.onSkipAll();
      else if (typeof p.onSkip === "function") p.onSkip();
    }

    // Track the card's real size and the target's position every frame
    // while visible; only re-render when something actually moved.
    React.useEffect(function () {
      var raf = window.requestAnimationFrame, caf = window.cancelAnimationFrame;
      var handle = null, last = "";
      function tick() {
        var node = popoverRef.current;
        var r = targetRect();
        var pw = node ? node.offsetWidth : 0, ph = node ? node.offsetHeight : 0;
        var vw = window.innerWidth, vh = window.innerHeight;
        var key = [pw, ph, vw, vh].concat(r ? [Math.round(r.top), Math.round(r.left), Math.round(r.width), Math.round(r.height)] : []).join(",");
        if (key !== last) {
          last = key;
          setLayout({
            size: { width: pw, height: ph },
            rect: r ? { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null
          });
        }
        if (raf) handle = raf(tick);
      }
      if (raf) handle = raf(tick); else tick();
      return function () { if (handle != null && caf) caf(handle); };
    }, []);

    // Modal tips take focus (and give it back); non-modal ones never steal
    // it from what the user is doing.
    React.useEffect(function () {
      if (!modal) return;
      try { prevFocusRef.current = document.activeElement; } catch (_) {}
      var node = popoverRef.current;
      if (node) {
        var primary = node.querySelector("[data-coach-primary]") || node.querySelector("button");
        if (primary && typeof primary.focus === "function") {
          try { primary.focus({ preventScroll: true }); } catch (_) {}
        }
      }
      return function () {
        var prev = prevFocusRef.current;
        if (prev && typeof prev.focus === "function") {
          try { prev.focus({ preventScroll: true }); } catch (_) {}
        }
      };
    }, []);

    // Escape dismisses, through the shared stack so only the topmost thing closes.
    var onEscape = React.useCallback(function () { doSkip(); }, []);
    (window.useEscape || function () {})(onEscape);

    // Non-modal: a press outside the card dismisses the tip (remembered) but
    // still reaches the page. A press on the target completes it when asked.
    React.useEffect(function () {
      if (modal) return;
      function onDown(e) {
        var node = popoverRef.current;
        var t = e.target;
        if (node && t && node.contains && node.contains(t)) return;
        var el = targetEl();
        if (propsRef.current.completeOnTargetClick && el && t && el.contains && el.contains(t)) { doComplete(); return; }
        doSkip();
      }
      document.addEventListener("pointerdown", onDown, true);
      return function () { document.removeEventListener("pointerdown", onDown, true); };
    }, []);

    // Modal: keep Tab inside the card.
    React.useEffect(function () {
      if (!modal) return;
      function onKey(e) {
        if (e.key !== "Tab") return;
        var node = popoverRef.current;
        if (!node) return;
        var btns = node.querySelectorAll("button");
        if (!btns.length) return;
        var first = btns[0], last = btns[btns.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); try { last.focus(); } catch (_) {} }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); try { first.focus(); } catch (_) {} }
      }
      document.addEventListener("keydown", onKey, true);
      return function () { document.removeEventListener("keydown", onKey, true); };
    }, []);

    var vw = (typeof window.innerWidth === "number") ? window.innerWidth : 1024;
    var vh = (typeof window.innerHeight === "number") ? window.innerHeight : 768;
    var rect = layout ? layout.rect : targetRect();
    // Fixed width (CSS caps it at the viewport); the height is measured.
    var cardW = Math.min(vw <= 480 ? 300 : 360, vw - 24);
    var pos = resolvePlacement(rect, vw, vh, props.placement || "bottom",
      { width: cardW, height: layout ? layout.size.height : 0 });

    var titleId = "cs-coach-title-" + (props.id || "");
    var bodyId  = "cs-coach-body-"  + (props.id || "");

    var buttons = props.buttons || [
      { label: "Skip tips", action: "skipAll" },
      { label: "Got it", action: "complete", primary: true }
    ];

    var highlight = null;
    if (props.showHighlight && rect && rect.width > 0) {
      var pad = 6;
      highlight = h("div", {
        key: "ring",
        className: "cs-coachmark-highlight-ring" + (reduceMotion ? " cs-coachmark-no-motion" : ""),
        "aria-hidden": "true",
        style: {
          position: "fixed",
          top: Math.max(0, rect.top - pad) + "px",
          left: Math.max(0, rect.left - pad) + "px",
          width: (rect.width + pad * 2) + "px",
          height: (rect.height + pad * 2) + "px"
        }
      });
    }

    var children = [
      modal ? h("div", {
        key: "scrim",
        className: "cs-coachmark-scrim" + (reduceMotion ? " cs-coachmark-no-motion" : ""),
        onClick: doSkip,
        "aria-hidden": "true"
      }) : null,
      highlight,
      h("div", {
        key: "popover",
        ref: popoverRef,
        className: "cs-coachmark-popover" + (reduceMotion ? " cs-coachmark-no-motion" : ""),
        role: modal ? "alertdialog" : "dialog",
        "aria-modal": modal ? "true" : "false",
        "aria-labelledby": titleId,
        "aria-describedby": bodyId,
        style: {
          position: "fixed",
          top: pos.top + "px",
          left: pos.left + "px",
          width: cardW + "px",
          // Hidden until measured so it never flashes at a guessed spot.
          visibility: layout ? "visible" : "hidden"
        }
      },
        h("h2", { id: titleId, className: "cs-coachmark-title" }, props.title || ""),
        h("p",  { id: bodyId,  className: "cs-coachmark-body", "aria-live": modal ? null : "polite" }, props.body  || ""),
        props.helpTopic && h("button", {
          type: "button",
          className: "cs-coachmark-learn-more",
          onClick: function () {
            doSkip();
            try {
              if (window.HelpDrawer && typeof window.HelpDrawer.open === "function") {
                window.HelpDrawer.open({ tab: "help", query: props.helpTopic });
              }
            } catch (_) {}
          }
        }, "Learn more"),
        h("div", { className: "cs-coachmark-buttons" },
          buttons.map(function (btn, i) {
            var primary = !!btn.primary;
            var onClick = btn.action === "complete" ? doComplete
              : btn.action === "skipAll" ? doSkipAll : doSkip;
            return h("button", {
              key: i,
              type: "button",
              "data-coach-primary": primary ? "true" : null,
              className: "cs-coachmark-btn" + (primary ? " cs-coachmark-btn--primary" : ""),
              onClick: onClick
            }, btn.label);
          })
        )
      )
    ];

    return h("div", { className: "cs-coachmark" + (modal ? " cs-coachmark--modal" : "") }, children);
  }

  // ── Reset: every tutorial, in one place ────────────────────────────────
  // Used by Help > Getting Started > Restart guided tours and by
  // Preferences > Onboarding & help > Reset every walkthrough, which used to
  // reset different, non-overlapping things.
  function resetCoaching() {
    var changed = [];
    try {
      if (window.UserPrefs && window.UserPrefs.DEFAULTS) {
        var keys = Object.keys(window.UserPrefs.DEFAULTS);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (k.indexOf(PREF_PREFIX) === 0) {
            window.UserPrefs.set(k, false);
            changed.push(k);
          }
        }
      }
    } catch (_) {}
    try { if (window.WelcomeWizard && window.WelcomeWizard.resetAll) window.WelcomeWizard.resetAll(); } catch (_) {}
    try { localStorage.removeItem("cs_styleOnboardingDone"); } catch (_) {}
    try { if (window.HelpHintBanner && window.HelpHintBanner.reset) window.HelpHintBanner.reset(); } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent("cs:prefsChanged", {
        detail: { key: PREF_PREFIX + "*", value: false, reset: true }
      }));
    } catch (_) {}
    try {
      if (window.Toast && typeof window.Toast.show === "function") {
        window.Toast.show({
          message: "Tutorials reset. Walkthroughs show the next time you open each page, and tips appear as you go.",
          type: "info",
          duration: 5000
        });
      }
    } catch (_) {}
    return changed;
  }

  // ── Exports ────────────────────────────────────────────────────────────
  window.Coachmark = Coachmark;
  window.useCoachingSequence = useCoachingSequence;
  window.resetCoaching = resetCoaching;
  window.Coaching = {
    _SEQUENCES: SEQUENCES,
    _filter: pickNext,
    _resolvePlacement: resolvePlacement,
    _isCoached: isCoached,
    _markCoached: markCoached,
    _prefKey: prefKey,
    overlayOpened: overlayOpened,
    overlayClosed: overlayClosed,
    isOverlayOpen: isOverlayOpen
  };
})();
