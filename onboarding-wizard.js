// onboarding-wizard.js — Shared first-visit welcome walkthrough.
//
// Exposes window.WelcomeWizard — a short multi-step tour that introduces a
// page (Creator, Manager, or Tracker) on the user's first visit. State is
// tracked per page via localStorage flags so it shows once and never again
// unless replayed from Help > Getting Started or Preferences.
//
// Usage:
//   <WelcomeWizard page="creator" onClose={...} />
// or imperatively check whether to show:
//   if (window.WelcomeWizard.shouldShow('creator')) setOpen(true);
//
// Behaviour:
//   - While open it registers with window.Coaching's overlay registry, so
//     coachmark tips wait until it has closed instead of stacking on top.
//   - A step with a `target` highlights that element and places the card
//     beside it, using the card's measured size and re-checking positions
//     every frame (targets move as panels open and tabs unlock).
//   - The highlighted target stays clickable; clicking the dimmed area
//     around it closes the tour, like clicking outside a dialog.
//   - Every way out (Skip tour, ✕, Escape, clicking outside, finishing,
//     navigating away) marks the page done.

(function () {
  if (typeof window === "undefined" || typeof React === "undefined") return;
  var h = React.createElement;

  // Inject a small stylesheet once for visible-focus outlines on the wizard
  // controls (a11y improvement so keyboard users can see where focus is).
  try {
    if (typeof document !== "undefined" && !document.getElementById("ob-wiz-styles")) {
      var s = document.createElement("style");
      s.id = "ob-wiz-styles";
      // UX-12 Phase 7: Workshop tokens, focus ring, reduced-motion suppression.
      s.textContent =
        ".onboarding-focusable:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:var(--radius-sm,6px)}" +
        ".onboarding-content{background:var(--surface);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-lg,10px);box-shadow:var(--shadow-lg,0 12px 28px rgba(60,40,20,.14))}" +
        ".onboarding-step-counter{font-size:var(--text-sm,12px);color:var(--text-tertiary);font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-bottom:8px}" +
        "@media (prefers-reduced-motion: reduce){.onboarding-content,.onboarding-content *{transition:none !important;animation:none !important}}" +
        "@media (pointer: coarse){.onboarding-content button{min-height:44px}}";
      document.head.appendChild(s);
    }
  } catch (_) {}

  // ─── The Creator's tours (audit COMMON-06) ────────────────────────────────
  // One per way in: converting a picture, drawing on a blank grid, or an
  // imported chart. Each names only controls that exist on this device: "Tap"
  // on touch screens and "Click" otherwise; the Settings sheet on phones and
  // upright tablets, the panel on the right on wider screens; Print PDF and
  // Open in Tracker in the top bar's More menu on phones. Built when the tour
  // opens (creatorDevice()), at most 4 steps each.
  function creatorDevice() {
    var coarse = false, compact = false;
    try {
      coarse = window.Platform && typeof window.Platform.isCoarsePointer === "function"
        ? window.Platform.isCoarsePointer()
        : !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    } catch (_) {}
    try { compact = !!(document.body && document.body.classList.contains("creator-compact")); } catch (_) {}
    return {
      coarse: coarse, compact: compact,
      Tap: coarse ? "Tap" : "Click", tap: coarse ? "tap" : "click",
      settings: compact ? "the Settings sheet" : "the panel on the right",
      actions: compact ? "the More menu at the top" : "the bar at the top"
    };
  }

  var CREATOR_TOURS = {
    convert: function (d) {
      return [
        {
          title: "Turn your picture into a pattern",
          body: "Choose what kind of picture it is, then set the size, fabric and threads in " + d.settings + ". The preview updates as you go, and Compare options shows neighbouring sizes and thread counts side by side."
        },
        {
          title: "Generate",
          body: "When the preview looks right, " + d.tap + " Generate. You can cancel while it works.",
          tip: "Pressing the highlighted button generates the pattern and closes this tour.",
          target: "[data-onboard=\"creator-generate\"]",
          placement: "bottom",
          dismissOnTargetClick: true
        },
        {
          title: "Edit, then print or stitch",
          body: "Edit has the drawing tools and Materials lists the threads to buy. Print PDF and Open in Tracker are in " + d.actions + " once the pattern is made. Press ? at any time for help."
        }
      ];
    },
    scratch: function (d) {
      return [
        {
          title: "Draw your design",
          body: d.Tap + " a thread in the Palette, then " + d.tap + " or drag on the grid to stitch. Add more threads to the Palette whenever you need them."
        },
        {
          title: "Canvas: size and fabric",
          body: "The Canvas tab holds the grid size, the fabric and an optional tracing picture to draw over. Its settings open in " + d.settings + "."
        },
        {
          title: "Print or stitch it",
          body: "Once the grid has stitches, Print PDF and Open in Tracker appear in " + d.actions + ". Press ? at any time for help."
        }
      ];
    },
    import: function (d) {
      return [
        {
          title: "Your imported chart",
          body: "Check the chart, then use Edit to change stitches and Materials to see the threads you need."
        },
        {
          title: "Print or stitch it",
          body: "Print PDF makes a printable chart and Open in Tracker lets you mark stitches as you go; both are in " + d.actions + ". Press ? at any time for help."
        }
      ];
    }
  };

  // ─── Step content per page ───────────────────────────────────────────────
  // A step's `target` must exist on the page the walkthrough runs on; if it
  // doesn't (e.g. no image loaded yet), the card is centred and its tip,
  // which talks about the highlight, is left out.
  var STEPS = {
    manager: [
      {
        title: "Welcome to the Stash Manager",
        body: "Track which DMC and Anchor threads you own, and manage a library of patterns. We'll give you a 60-second tour."
      },
      {
        title: "Build your stash",
        body: "The Thread Stash tab is where you record the threads you own. Use Bulk Add to paste a list of thread numbers in one go.",
        tip: "Clicking the highlighted tab will close this tour and take you straight there.",
        target: "[data-onboard=\"mgr-stash-tab\"]",
        placement: "bottom",
        dismissOnTargetClick: true
      },
      {
        title: "Browse your patterns",
        body: "The Pattern Library lists every pattern saved in the Creator or Tracker automatically, plus any you add here.",
        tip: "Clicking the highlighted tab will close this tour.",
        target: "[data-onboard=\"mgr-patterns-tab\"]",
        placement: "bottom",
        dismissOnTargetClick: true
      }
    ],
    tracker: [
      // The Tracker appends its stitching-style picker as a final custom step.
      {
        title: "Welcome to the Stitch Tracker",
        body: "Track your progress on saved patterns. Mark stitches as you complete them; your stitching time is logged automatically."
      },
      {
        title: "Mark and Navigate modes",
        body: "Switch between Mark (tap or drag across stitches to mark them done; use two fingers to move around) and Navigate (drag to move around, tap to place a guide crosshair). To park a thread, right-click its stitch, or press and hold it in Navigate mode.",
        tip: "Press T for Mark and N for Navigate."
      }
    ]
  };

  // The Creator's tours, by way in. "creator" is the picture tour, kept for
  // callers and replays that name the page only.
  STEPS["creator-convert"] = CREATOR_TOURS.convert;
  STEPS["creator-scratch"] = CREATOR_TOURS.scratch;
  STEPS["creator-import"] = CREATOR_TOURS.import;
  STEPS.creator = CREATOR_TOURS.convert;
  var CREATOR_VARIANTS = ["creator-convert", "creator-scratch", "creator-import"];

  // A page's steps: an array, or a function of the device for the Creator.
  function stepsFor(page) {
    var st = STEPS[page];
    if (typeof st === "function") st = st(creatorDevice());
    return Array.isArray(st) ? st : [];
  }

  function flagKey(page) { return "cs_welcome_" + page + "_done"; }

  function shouldShow(page) {
    if (!STEPS[page]) return false;
    // Fail-open: if localStorage is unavailable (private browsing, blocked
    // cookies, quota exceeded), we can't tell whether the user has seen
    // the wizard before. Showing it is the friendlier default — at worst
    // a returning private-browsing user sees a brief tour twice.
    try {
      if (localStorage.getItem(flagKey(page))) return false;
      // Someone who saw the Creator tour before it was split by way in
      // isn't shown another.
      if (page.indexOf("creator-") === 0 && localStorage.getItem(flagKey("creator"))) return false;
      return true;
    } catch (_) { return true; }
  }

  function markDone(page) {
    try { localStorage.setItem(flagKey(page), "1"); } catch (_) {}
  }

  function reset(page) {
    try {
      localStorage.removeItem(flagKey(page));
      // Replaying "the Creator tour" replays every way in.
      if (page === "creator") CREATOR_VARIANTS.forEach(function (v) { localStorage.removeItem(flagKey(v)); });
    } catch (_) {}
  }

  // Clear ALL walkthrough flags (every page plus the Tracker style picker).
  function resetAll() {
    try {
      Object.keys(STEPS).forEach(function (p) { localStorage.removeItem(flagKey(p)); });
      localStorage.removeItem("cs_styleOnboardingDone");
    } catch (_) {}
  }

  // Card placement. Uses coaching.js's resolver (measured size, flips sides,
  // stays on screen) when it is loaded; a simple clamp otherwise.
  function placeCard(rect, size, placement) {
    var vw = window.innerWidth, vh = window.innerHeight;
    if (window.Coaching && typeof window.Coaching._resolvePlacement === "function") {
      return window.Coaching._resolvePlacement(rect, vw, vh, placement || "bottom", size);
    }
    var pad = 12;
    return {
      top: Math.max(pad, Math.min(rect.bottom + 14, vh - size.height - pad)),
      left: Math.max(pad, Math.min(rect.left, vw - size.width - pad)),
      placement: "bottom", width: size.width
    };
  }

  function WelcomeWizard(props) {
    var page = props.page || "creator";
    // Steps are the page's built-in steps plus any caller-supplied extraSteps.
    // extraSteps lets pages append domain-specific steps (e.g. Tracker's
    // stitching-style picker) without mutating the shared STEPS table. Each
    // entry may be either a regular { title, body, ... } step or a custom step
    // { customComponent: Fn, onCommit: fn }.
    var extraSteps = Array.isArray(props.extraSteps) ? props.extraSteps : [];
    // Built once per tour, so the device wording doesn't change mid-tour.
    var _base = React.useState(function () { return stepsFor(page); });
    var steps = _base[0].concat(extraSteps);
    var _idx = React.useState(0);
    var idx = _idx[0], setIdx = _idx[1];
    var step = steps.length ? steps[Math.min(idx, steps.length - 1)] : {};
    var isLast = idx >= steps.length - 1;
    // Measured target rect and card height for the current step.
    var _layout = React.useState(null);
    var layout = _layout[0], setLayout = _layout[1];
    // A targeted step whose target has not appeared after a short grace
    // period (lazy mounts, animations) falls back to a centred card.
    var _missing = React.useState(false);
    var targetMissing = _missing[0], setTargetMissing = _missing[1];
    // Another modal dialog is open (e.g. the Creator's Name Your Project
    // prompt): stay mounted but out of the way until it closes, rather than
    // stacking on top of it and fighting it for focus and Escape.
    var _blocked = React.useState(false);
    var blocked = _blocked[0], setBlocked = _blocked[1];

    var contentRef = React.useRef(null);
    var liveRef = React.useRef(null);
    var prevFocusRef = React.useRef(null);
    var propsRef = React.useRef(props);
    propsRef.current = props;
    var titleId = React.useMemo(function () { return "ob-title-" + Math.random().toString(36).slice(2, 8); }, []);

    // Tell coachmarks to wait while the walkthrough is open.
    React.useEffect(function () {
      var C = window.Coaching;
      if (C && C.overlayOpened) C.overlayOpened();
      return function () { if (C && C.overlayClosed) C.overlayClosed(); };
    }, []);

    // If the wizard is unmounted while still open (the host component
    // navigated away mid-tour), still mark the page as done so it doesn't
    // resurrect on next visit. The user clearly knew enough to leave.
    React.useEffect(function () {
      return function () { try { markDone(page); } catch (_) {} };
    }, [page]);

    // Defensive re-check on mount: if the page was already marked done
    // (e.g. the user navigated away earlier and is now returning to a host
    // that still has welcomeOpen=true in its state), close immediately so
    // we don't replay the tour.
    React.useEffect(function () {
      if (!shouldShow(page) && typeof props.onClose === "function") {
        props.onClose();
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Store the previously-focused element on mount; restore it when the wizard closes.
    React.useEffect(function () {
      prevFocusRef.current = document.activeElement;
      return function () {
        if (prevFocusRef.current && typeof prevFocusRef.current.focus === "function") {
          try { prevFocusRef.current.focus({ preventScroll: true }); } catch (_) {}
        }
      };
    }, []);

    function handleClose() {
      markDone(page);
      var p = propsRef.current;
      if (typeof p.onClose === "function") p.onClose();
    }

    function handleLast() {
      // Final-step button: mark done, then either chain into onLastStep or close.
      markDone(page);
      var p = propsRef.current;
      if (typeof p.onClose === "function") p.onClose();
      if (typeof p.onLastStep === "function") p.onLastStep();
    }

    React.useEffect(function () {
      function check() {
        var own = contentRef.current;
        var dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]');
        var other = false;
        for (var i = 0; i < dialogs.length; i++) {
          var d = dialogs[i];
          if (own && (d === own || own.contains(d) || d.contains(own))) continue;
          other = true; break;
        }
        setBlocked(other);
      }
      check();
      var t = setInterval(check, 300);
      return function () { clearInterval(t); };
    }, []);

    // Escape closes the tour, through the shared stack (stable handler, so
    // it registers once rather than jumping to the top on every render).
    // While waiting behind another dialog it doesn't claim Escape at all.
    var onEscape = React.useCallback(function () { handleClose(); }, []);
    (window.useEscape || function () {})(blocked ? null : onEscape);

    // Focus trap + initial focus on the primary action at each step.
    React.useEffect(function () {
      var node = contentRef.current;
      if (!node) return;
      if (liveRef.current) { liveRef.current.textContent = (step && step.title) ? step.title : ""; }
      var primary = node.querySelector("[data-ob-primary]") || node.querySelector("button");
      if (primary && typeof primary.focus === "function") {
        try { primary.focus({ preventScroll: true }); } catch (_) { primary.focus(); }
      }
      function trap(e) {
        if (e.key !== "Tab") return;
        var focusables = node.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
        focusables = Array.prototype.filter.call(focusables, function (el) { return !el.disabled && el.offsetParent !== null; });
        if (!focusables.length) return;
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      node.addEventListener("keydown", trap);
      return function () { node.removeEventListener("keydown", trap); };
    }, [idx, blocked]);

    // Track the target and the card every frame while this step is shown,
    // re-rendering only when something moved.
    React.useEffect(function () {
      setLayout(null);
      setTargetMissing(false);
      if (!step.target) return;
      var raf = window.requestAnimationFrame, caf = window.cancelAnimationFrame;
      var handle = null, last = "", found = false;
      var missingTimer = setTimeout(function () { if (!found) setTargetMissing(true); }, 600);
      function tick() {
        var r = null;
        if (step.target) {
          var el = document.querySelector(step.target);
          if (el) {
            var b = el.getBoundingClientRect();
            if (b.width > 0 || b.height > 0) { r = b; found = true; }
          }
        }
        var node = contentRef.current;
        var ch = node ? node.offsetHeight : 0;
        var key = [ch, window.innerWidth, window.innerHeight].concat(r ? [Math.round(r.top), Math.round(r.left), Math.round(r.width), Math.round(r.height)] : []).join(",");
        if (key !== last) {
          last = key;
          setLayout({
            height: ch,
            rect: r ? { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null
          });
        }
        if (raf) handle = raf(tick);
      }
      if (raf) handle = raf(tick); else tick();
      // dismissOnTargetClick: clicking the highlighted target closes the tour
      // cleanly (and marks the page done).
      var clickEl = step.dismissOnTargetClick && step.target ? document.querySelector(step.target) : null;
      function onTargetClick() { handleClose(); }
      if (clickEl) clickEl.addEventListener("click", onTargetClick);
      return function () {
        clearTimeout(missingTimer);
        if (handle != null && caf) caf(handle);
        if (clickEl) clickEl.removeEventListener("click", onTargetClick);
      };
    }, [idx, step.target, step.dismissOnTargetClick]);

    var anchor = (step.target && layout && layout.rect) ? layout.rect : null;

    // In targeted mode, hide background content from assistive technology so
    // screen readers are constrained to the wizard. aria-hidden (not inert) is
    // used so the highlighted target can still be clicked.
    React.useEffect(function () {
      if (!anchor) return;
      var wrapperEl = contentRef.current;
      if (!wrapperEl) return;
      var bodyChild = wrapperEl;
      while (bodyChild && bodyChild.parentNode !== document.body) {
        bodyChild = bodyChild.parentNode;
      }
      var toHide = bodyChild
        ? Array.prototype.filter.call(document.body.children, function (c) {
            return c !== bodyChild && !c.getAttribute("aria-hidden");
          })
        : [];
      toHide.forEach(function (c) { c.setAttribute("aria-hidden", "true"); });
      return function () {
        toHide.forEach(function (c) { c.removeAttribute("aria-hidden"); });
      };
    }, [!!anchor]);

    if (!steps.length || blocked) return null;

    var lastLabel = isLast ? (props.lastStepLabel || "Get started") : null;
    var vwInit = window.innerWidth || 420;
    var cardW = Math.min(420, Math.max(240, vwInit - 24));
    var popoverStyle = { maxWidth: cardW, padding: 22, position: "relative" };
    var holeStyle = null, blockers = null;
    if (anchor) {
      var pos = placeCard(anchor, { width: cardW, height: (layout && layout.height) || 220 }, step.placement);
      popoverStyle = Object.assign({}, popoverStyle, {
        position: "fixed", top: pos.top, left: pos.left, width: cardW, margin: 0,
        visibility: layout && layout.height ? "visible" : "hidden"
      });
      var hp = 4;
      var hx0 = Math.max(0, anchor.left - hp), hy0 = Math.max(0, anchor.top - hp);
      var hx1 = anchor.right + hp, hy1 = anchor.bottom + hp;
      holeStyle = {
        position: "fixed", top: hy0, left: hx0, width: hx1 - hx0, height: hy1 - hy0,
        border: "3px solid var(--accent)", borderRadius: 8, boxSizing: "border-box",
        boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.45)",
        pointerEvents: "none", zIndex: 2
      };
      // Four click-catchers around the hole: the target stays usable, a click
      // anywhere else closes the tour like clicking outside a dialog.
      var blk = { position: "fixed", pointerEvents: "auto", zIndex: 1 };
      blockers = [
        { top: 0, left: 0, right: 0, height: hy0 },
        { top: hy1, left: 0, right: 0, bottom: 0 },
        { top: hy0, left: 0, width: hx0, height: hy1 - hy0 },
        { top: hy0, left: hx1, right: 0, height: hy1 - hy0 }
      ].map(function (r, i) {
        return h("div", { key: "blk" + i, "aria-hidden": "true", onClick: handleClose, style: Object.assign({}, blk, r) });
      });
    }

    var isCustom = typeof step.customComponent === "function";
    function advanceCustom(payload) {
      if (typeof step.onCommit === "function") { try { step.onCommit(payload); } catch (_) {} }
      if (isLast) handleLast(); else setIdx(idx + 1);
    }
    // The tip describes the highlight, so leave it out when there is none.
    var showTip = !!step.tip && (!step.target || !!anchor);

    var closeIcon = (window.Icons && window.Icons.x) ? window.Icons.x() : null;
    var children = [
        h("button", {
          key: "close", className: "modal-close onboarding-focusable",
          onClick: handleClose, "aria-label": "Close",
          style: { background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }
        }, closeIcon),
        // Visually hidden live region — step title is injected here on each
        // step change so screen readers announce the transition.
        h("div", { key: "live-announce", ref: liveRef, "aria-live": "polite", "aria-atomic": "true",
          style: { position: "absolute", width: "1px", height: "1px", overflow: "hidden",
            clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 } }),
        steps.length > 1 && h("div", { key: "sc", className: "onboarding-step-counter" },
          "Step " + (idx + 1) + " of " + steps.length
        ),
        h("div", { key: "ind", style: { display: "flex", gap: 6, marginBottom: 16 }, "aria-hidden": "true" },
          steps.map(function (_, i) {
            return h("div", {
              key: i,
              style: {
                flex: 1, height: 4, borderRadius: 2,
                background: i <= idx ? "var(--accent)" : "var(--border)",
                transition: "background var(--motion-fast, 120ms ease-out)"
              }
            });
          })
        ),
        h("div", { key: "live" },
          isCustom
            ? h(step.customComponent, {
                key: "custom",
                onComplete: advanceCustom,
                onBack: idx > 0 ? function () { setIdx(idx - 1); } : null,
                onSkip: handleClose,
                isLast: isLast,
                idx: idx,
                titleId: titleId
              })
            : [
                h("h3", { key: "t", id: titleId, style: { margin: "0 0 10px 0", fontSize: 19, color: "var(--text-primary)" } }, step.title),
                h("p", { key: "b", style: { margin: "0 0 12px 0", fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)" } }, step.body),
                showTip && h("div", {
                  key: "tip",
                  style: {
                    padding: "8px 12px", background: "var(--accent-soft, var(--accent-light))",
                    border: "1px solid var(--accent-border)",
                    borderRadius: "var(--radius-sm, 6px)", fontSize: 12,
                    color: "var(--accent-ink, var(--text-primary))", marginBottom: 12
                  }
                }, h("strong", null, "Tip: "), step.tip)
              ]
        ),
        // Custom steps render their own controls, so skip the default nav row.
        !isCustom && h("div", { key: "nav", style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 } },
          h("button", {
            onClick: handleClose,
            className: "btn onboarding-focusable",
            style: { padding: "6px 12px", fontSize: 12, color: "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer" }
          }, "Skip tour"),
          h("div", { style: { display: "flex", gap: 8 } },
            idx > 0 && h("button", {
              onClick: function () { setIdx(idx - 1); },
              className: "btn onboarding-focusable",
              style: { padding: "8px 14px", fontSize: 13, borderRadius: "var(--radius-sm, 6px)", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", color: "var(--text-secondary)" }
            }, "Back"),
            h("button", {
              "data-ob-primary": true,
              onClick: function () { if (isLast) handleLast(); else setIdx(idx + 1); },
              className: "btn btn-primary onboarding-focusable",
              style: { padding: "8px 16px", fontSize: 13, borderRadius: "var(--radius-sm, 6px)", border: "none",
                background: "var(--accent)",
                color: "var(--text-on-accent, #fff)", cursor: "pointer", fontWeight: 600 }
            }, isLast ? lastLabel : "Next")
          )
        )
    ];

    var dialogProps = { role: "dialog", "aria-modal": "true", "aria-labelledby": titleId };

    if (anchor) {
      return h("div", {
        className: "onboarding-targeted-overlay",
        style: { position: "fixed", inset: 0, zIndex: 5000, pointerEvents: "none" }
      },
        blockers,
        h("div", { style: holeStyle }),
        h("div", Object.assign({}, dialogProps, {
          ref: contentRef,
          className: "modal-content onboarding-content",
          onClick: function (e) { e.stopPropagation(); },
          style: Object.assign({}, popoverStyle, { zIndex: 5001, pointerEvents: "auto" })
        }), children)
      );
    }

    // Centred: an ordinary dialog; clicking the backdrop closes the tour.
    // While a targeted step is still looking for its target, stay invisible
    // rather than flashing up centred and then jumping.
    var waiting = !!step.target && !targetMissing;
    return h("div", { className: "modal-overlay", style: { zIndex: 5000, visibility: waiting ? "hidden" : "visible" }, onClick: handleClose },
      h("div", Object.assign({}, dialogProps, {
        ref: contentRef,
        className: "modal-content onboarding-content",
        onClick: function (e) { e.stopPropagation(); },
        style: Object.assign({}, popoverStyle, { maxWidth: 460, padding: 24 })
      }), children)
    );
  }

  WelcomeWizard.shouldShow = shouldShow;
  WelcomeWizard.markDone = markDone;
  WelcomeWizard.reset = reset;
  WelcomeWizard.resetAll = resetAll;
  WelcomeWizard.STEPS = STEPS;
  WelcomeWizard.stepsFor = stepsFor;
  WelcomeWizard.creatorDevice = creatorDevice;
  WelcomeWizard.CREATOR_TOURS = CREATOR_TOURS;

  window.WelcomeWizard = WelcomeWizard;
})();
