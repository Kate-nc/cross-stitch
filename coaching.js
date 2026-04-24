// coaching.js — First-stitch interactive coaching primitive (C8 Phase 1).
//
// Public API:
//   window.Coachmark                  React component (props in §Props below)
//   window.useCoachingSequence(mode)  hook → { active, complete, skip }
//   window.resetCoaching()            clears onboarding.coached.* prefs
//   window.Coaching                   pure-helper bag for tests:
//     ._SEQUENCES                     per-mode ordered step IDs
//     ._filter(steps, completed)      → first un-coached step ID or null
//     ._resolvePlacement(rect, vw, vh, prefer) → {top,left,placement}
//     ._isCoached(stepId)             reads UserPrefs
//
// Phase 1 wires only `firstStitch` for "creator" and "tracker" modes.
// The other step IDs (import, undo, progress, save) are reserved in
// _SEQUENCES so future phases slot in without changing call sites.
//
// House rules:
//   - No emoji in user-visible copy. SVG icons via window.Icons.
//   - British English throughout.
//   - Persists per-step completion in UserPrefs under flattened keys
//     `onboarding.coached.<stepId>` and dispatches `cs:prefsChanged`.

(function () {
  if (typeof window === "undefined") return;

  // ── Sequence definition ────────────────────────────────────────────────
  // Phase 1 active steps marked; reserved steps included so the state
  // machine has a consistent ordering for Phase 2.
  var SEQUENCES = {
    creator: [
      // "import",        // Phase 2
      "firstStitch_creator",
      // "undo",          // Phase 2
      // "save"           // Phase 2
    ],
    tracker: [
      "firstStitch_tracker",
      // "undo",          // Phase 2
      // "progress"       // Phase 2
    ],
    manager: []
  };

  function prefKey(stepId) { return "onboarding.coached." + stepId; }

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

  // Pure helper: place a popover relative to a target rect.
  // Returns {top, left, placement, width}. Falls back to viewport centre
  // when the rect is missing or off-screen. Prefers the requested placement
  // but flips to the opposite side if there isn't room (≥ 12px gutter).
  function resolvePlacement(rect, vw, vh, prefer) {
    var POPOVER_W = vw <= 480 ? 300 : 360;
    var POPOVER_H = 160;          // estimate; popover sizes itself, this is for flip math
    var GAP = 12;
    if (!rect || rect.width <= 0 || rect.height <= 0
        || rect.bottom < 0 || rect.right < 0
        || rect.top > vh || rect.left > vw) {
      return {
        top: Math.max(GAP, (vh - POPOVER_H) / 2),
        left: Math.max(GAP, (vw - POPOVER_W) / 2),
        placement: "centre",
        width: POPOVER_W
      };
    }
    var p = (prefer || "bottom");
    function fits(side) {
      if (side === "bottom") return rect.bottom + GAP + POPOVER_H <= vh;
      if (side === "top")    return rect.top    - GAP - POPOVER_H >= 0;
      if (side === "right")  return rect.right  + GAP + POPOVER_W <= vw;
      if (side === "left")   return rect.left   - GAP - POPOVER_W >= 0;
      return false;
    }
    var opp = { top: "bottom", bottom: "top", left: "right", right: "left" };
    if (!fits(p) && fits(opp[p])) p = opp[p];
    var top, left;
    if (p === "bottom") {
      top = rect.bottom + GAP;
      left = Math.max(GAP, Math.min(vw - POPOVER_W - GAP, rect.left + rect.width / 2 - POPOVER_W / 2));
    } else if (p === "top") {
      top = Math.max(GAP, rect.top - GAP - POPOVER_H);
      left = Math.max(GAP, Math.min(vw - POPOVER_W - GAP, rect.left + rect.width / 2 - POPOVER_W / 2));
    } else if (p === "right") {
      top = Math.max(GAP, Math.min(vh - POPOVER_H - GAP, rect.top + rect.height / 2 - POPOVER_H / 2));
      left = rect.right + GAP;
    } else if (p === "left") {
      top = Math.max(GAP, Math.min(vh - POPOVER_H - GAP, rect.top + rect.height / 2 - POPOVER_H / 2));
      left = Math.max(GAP, rect.left - GAP - POPOVER_W);
    } else {
      top = Math.max(GAP, (vh - POPOVER_H) / 2);
      left = Math.max(GAP, (vw - POPOVER_W) / 2);
    }
    return { top: top, left: left, placement: p, width: POPOVER_W };
  }

  // ── React hook: useCoachingSequence ────────────────────────────────────
  // Reads completion flags from UserPrefs on first render. Returns the
  // first un-coached step in the mode's sequence, or null. `complete`
  // persists the step and advances. `skip` advances WITHOUT persisting,
  // so the step replays on the next mount (per the plan).
  function useCoachingSequence(mode) {
    var React = window.React;
    if (!React || typeof React.useState !== "function") {
      // Tests / non-react environment — return inert object.
      return { active: null, complete: function () {}, skip: function () {} };
    }
    var sequence = SEQUENCES[mode] || [];
    var initial = React.useMemo(function () {
      var arr = [];
      for (var i = 0; i < sequence.length; i++) {
        if (isCoached(sequence[i])) arr.push(sequence[i]);
      }
      return arr;
    }, [mode]);
    var st = React.useState(initial);
    var completed = st[0];
    var setCompleted = st[1];
    // Per-session skip set — replay-on-next-mount semantics.
    var sessionSkippedRef = React.useRef({});

    var pool = [];
    for (var k = 0; k < sequence.length; k++) {
      if (sessionSkippedRef.current[sequence[k]]) continue;
      pool.push(sequence[k]);
    }
    var active = pickNext(pool, completed);

    var complete = React.useCallback(function (stepId) {
      var id = stepId || active;
      if (!id) return;
      markCoached(id);
      setCompleted(function (prev) {
        if (prev.indexOf(id) !== -1) return prev;
        return prev.concat([id]);
      });
    }, [active]);

    var skip = React.useCallback(function (stepId) {
      var id = stepId || active;
      if (!id) return;
      sessionSkippedRef.current[id] = true;
      // Force a re-render by bumping completed (no-op append).
      setCompleted(function (prev) { return prev.slice(); });
    }, [active]);

    return { active: active, complete: complete, skip: skip };
  }

  // ── React component: Coachmark ─────────────────────────────────────────
  // Props:
  //   id              string (required) — used for ARIA ids
  //   target          CSS selector OR DOM element (optional)
  //   placement       "top" | "bottom" | "left" | "right" | "centre"
  //   title           string
  //   body            string
  //   buttons         [{ label, action: "skip" | "complete", primary }]
  //   showHighlight   boolean — dim background + ring around target
  //   onComplete      () => void
  //   onSkip          () => void
  //   focusTrap       boolean (default true)
  function Coachmark(props) {
    var React = window.React;
    if (!React) return null;
    var h = React.createElement;
    var popoverRef = React.useRef(null);
    var prevFocusRef = React.useRef(null);
    var ts = React.useState(0);
    var bumpLayout = ts[1];
    var Icons = window.Icons || {};

    var reduceMotion = false;
    try {
      reduceMotion = !!(window.UserPrefs && window.UserPrefs.get && window.UserPrefs.get("a11yReducedMotion"));
    } catch (_) {}

    // Resolve target rect.
    function resolveTarget() {
      var t = props.target;
      if (!t) return null;
      var el = null;
      if (typeof t === "string") {
        try { el = document.querySelector(t); } catch (_) {}
      } else if (t && t.getBoundingClientRect) {
        el = t;
      }
      if (!el) return null;
      try { return el.getBoundingClientRect(); } catch (_) { return null; }
    }

    // Re-layout on resize / scroll.
    React.useEffect(function () {
      var fn = function () { bumpLayout(function (n) { return n + 1; }); };
      window.addEventListener("resize", fn);
      window.addEventListener("scroll", fn, true);
      return function () {
        window.removeEventListener("resize", fn);
        window.removeEventListener("scroll", fn, true);
      };
    }, []);

    // Focus management: store previous focus, move focus to popover.
    React.useEffect(function () {
      try { prevFocusRef.current = document.activeElement; } catch (_) {}
      var node = popoverRef.current;
      if (node) {
        var primary = node.querySelector("[data-coach-primary]") || node.querySelector("button");
        if (primary && typeof primary.focus === "function") {
          try { primary.focus(); } catch (_) {}
        }
      }
      return function () {
        var prev = prevFocusRef.current;
        if (prev && typeof prev.focus === "function") {
          try { prev.focus(); } catch (_) {}
        }
      };
    }, []);

    function handleSkip() {
      if (typeof props.onSkip === "function") props.onSkip();
    }
    function handleComplete() {
      if (typeof props.onComplete === "function") props.onComplete();
    }

    // ESC = skip.
    React.useEffect(function () {
      function onKey(e) {
        if (e.key === "Escape") { e.stopPropagation(); handleSkip(); return; }
        if (e.key === "Tab" && props.focusTrap !== false) {
          var node = popoverRef.current;
          if (!node) return;
          var btns = node.querySelectorAll("button");
          if (btns.length === 0) return;
          var first = btns[0], last = btns[btns.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); try { last.focus(); } catch (_) {} }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); try { first.focus(); } catch (_) {} }
        }
      }
      document.addEventListener("keydown", onKey, true);
      return function () { document.removeEventListener("keydown", onKey, true); };
    }, [props.onSkip, props.onComplete, props.focusTrap]);

    var rect = resolveTarget();
    var vw = (typeof window.innerWidth === "number") ? window.innerWidth : 1024;
    var vh = (typeof window.innerHeight === "number") ? window.innerHeight : 768;
    var pos = resolvePlacement(rect, vw, vh, props.placement || "bottom");

    var titleId = "cs-coach-title-" + (props.id || "");
    var bodyId  = "cs-coach-body-"  + (props.id || "");

    var buttons = props.buttons || [
      { label: "Skip", action: "skip" },
      { label: "Got it", action: "complete", primary: true }
    ];

    // Highlight ring around target (when target resolved + showHighlight).
    var highlight = null;
    if (props.showHighlight && rect) {
      var pad = 6;
      highlight = h("div", {
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
      h("div", {
        key: "scrim",
        className: "cs-coachmark-scrim" + (reduceMotion ? " cs-coachmark-no-motion" : ""),
        onClick: handleSkip,
        "aria-hidden": "true"
      }),
      highlight,
      h("div", {
        key: "popover",
        ref: popoverRef,
        className: "cs-coachmark-popover" + (reduceMotion ? " cs-coachmark-no-motion" : ""),
        role: "alertdialog",
        "aria-modal": "false",
        "aria-labelledby": titleId,
        "aria-describedby": bodyId,
        style: {
          position: "fixed",
          top: pos.top + "px",
          left: pos.left + "px",
          width: pos.width + "px"
        }
      },
        h("h2", { id: titleId, className: "cs-coachmark-title" }, props.title || ""),
        h("p",  { id: bodyId,  className: "cs-coachmark-body"  }, props.body  || ""),
        h("div", { className: "cs-coachmark-buttons" },
          buttons.map(function (btn, i) {
            var primary = !!btn.primary;
            return h("button", {
              key: i,
              type: "button",
              "data-coach-primary": primary ? "true" : null,
              className: "cs-coachmark-btn" + (primary ? " cs-coachmark-btn--primary" : ""),
              onClick: btn.action === "complete" ? handleComplete : handleSkip
            }, btn.label);
          })
        )
      )
    ];

    return h("div", { className: "cs-coachmark" }, children);
  }

  // ── Reset (Help drawer integration) ────────────────────────────────────
  function resetCoaching() {
    var changed = [];
    try {
      if (window.UserPrefs && window.UserPrefs.DEFAULTS) {
        var keys = Object.keys(window.UserPrefs.DEFAULTS);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (k.indexOf("onboarding.coached.") === 0) {
            window.UserPrefs.set(k, false);
            changed.push(k);
          }
        }
      }
    } catch (_) {}
    try {
      window.dispatchEvent(new CustomEvent("cs:prefsChanged", {
        detail: { key: "onboarding.coached.*", value: false, reset: true }
      }));
    } catch (_) {}
    try {
      if (window.Toast && typeof window.Toast.show === "function") {
        window.Toast.show({
          message: "Tutorials reset. They will show again when you start a new project.",
          type: "info",
          duration: 4000
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
    _prefKey: prefKey
  };
})();
