// onboarding-wizard.js — Shared first-visit welcome wizard.
//
// Exposes window.WelcomeWizard — a multi-step modal that introduces a page
// (Creator, Manager, or Tracker) on the user's first visit. State is tracked
// per page via localStorage flags so it shows once and never again unless
// explicitly reopened from the Help menu.
//
// Usage:
//   <WelcomeWizard page="creator" onClose={...} />
// or imperatively check whether to show:
//   if (window.WelcomeWizard.shouldShow('creator')) setOpen(true);
//
// Each page owns its own steps list; Tracker reuses its existing
// StitchingStyleOnboarding modal instead, but is included here so we have a
// single place to read/clear flags.

(function () {
  if (typeof window === "undefined" || typeof React === "undefined") return;
  var h = React.createElement;

  // Inject a small stylesheet once for visible-focus outlines on the wizard
  // controls (a11y improvement so keyboard users can see where focus is).
  try {
    if (typeof document !== "undefined" && !document.getElementById("ob-wiz-styles")) {
      var s = document.createElement("style");
      s.id = "ob-wiz-styles";
      s.textContent = ".onboarding-focusable:focus-visible{outline:3px solid #14b8a6;outline-offset:2px;border-radius:6px}";
      document.head.appendChild(s);
    }
  } catch (_) {}

  // ─── Step content per page ───────────────────────────────────────────────
  var STEPS = {
    creator: [
      {
        title: "Welcome to the Pattern Creator",
        body: "Convert any image into a printable cross-stitch pattern. We'll give you a 60-second tour.",
        tip: "Everything runs in your browser — your photos never leave this device."
      },
      {
        title: "1. Upload an image",
        body: "Drag-and-drop a photo onto the canvas or click 'From image'. The Creator will quantise it to a DMC palette.",
        tip: "Click the highlighted 'From image' button to continue. Smaller images give a clearer pattern — aim for 300–1000 px on the long edge.",
        target: "[data-onboard=\"home-from-image\"]",
        placement: "right",
        requireClick: true
      },
      {
        title: "2. Tune the palette",
        body: "Choose how many colours to use, set a minimum stitches-per-colour to drop noise, and optionally pick a background colour to skip.",
        tip: "You can always re-generate after changing settings without losing other edits."
      },
      {
        title: "3. Edit & save",
        body: "Use Paint, Fill, Magic Wand or Lasso to refine the pattern. Save with File \u2192 Save Project (.json), or export a printable PDF chart.",
        tip: "Open the Help Centre any time from the gear menu for keyboard shortcuts."
      }
    ],
    manager: [
      {
        title: "Welcome to the Stash Manager",
        body: "Track which DMC and Anchor threads you own, and manage a library of patterns. We'll give you a 60-second tour."
      },
      {
        title: "1. Build your stash",
        body: "Switch to the Threads tab and tick the threads you own. Use 'Bulk Add' to paste a list of IDs in one go.",
        tip: "Click the highlighted Threads tab to continue.",
        target: "[data-onboard=\"mgr-stash-tab\"]",
        placement: "bottom",
        requireClick: true
      },
      {
        title: "2. Browse your patterns",
        body: "Patterns saved in the Creator/Tracker auto-sync here. You can also add patterns manually \u2014 these are flagged 'Stash Manager only'.",
        tip: "Click the highlighted Patterns tab to continue.",
        target: "[data-onboard=\"mgr-patterns-tab\"]",
        placement: "bottom",
        requireClick: true
      },
      {
        title: "3. Plan a shopping trip",
        body: "Tick patterns to add them to a shopping list. The Manager calculates the threads you'd need to buy."
      }
    ],
    tracker: [
      // Tracker has its own deeper onboarding (StitchingStyleOnboarding); this
      // generic welcome is shown before that domain-specific one.
      {
        title: "Welcome to the Stitch Tracker",
        body: "Track your progress on saved patterns interactively. Click stitches as you complete them; the timer logs your sessions automatically."
      },
      {
        title: "Track and Navigate modes",
        body: "Toggle between Track (tap to mark stitches done) and Navigate (move a guide crosshair, place parking markers).",
        tip: "Press Space to switch modes quickly."
      }
    ]
  };

  function flagKey(page) { return "cs_welcome_" + page + "_done"; }

  function shouldShow(page) {
    if (!STEPS[page]) return false;
    try { return !localStorage.getItem(flagKey(page)); } catch (_) { return false; }
  }

  function markDone(page) {
    try { localStorage.setItem(flagKey(page), "1"); } catch (_) {}
  }

  function reset(page) {
    try { localStorage.removeItem(flagKey(page)); } catch (_) {}
  }

  // Clear ALL onboarding flags (every page's WelcomeWizard plus the Tracker
  // StitchingStyleOnboarding). Used by Preferences → Restore tutorials.
  function resetAll() {
    try {
      Object.keys(STEPS).forEach(function (p) { localStorage.removeItem(flagKey(p)); });
      localStorage.removeItem("cs_styleOnboardingDone");
    } catch (_) {}
  }

  function WelcomeWizard(props) {
    var page = props.page || "creator";
    // Steps are the page's built-in steps plus any caller-supplied extraSteps.
    // extraSteps lets pages append domain-specific steps (e.g. Tracker's
    // stitching-style picker) without mutating the shared STEPS table. Each
    // entry may be either a regular { title, body, ... } step or a custom step
    // { customComponent: Fn, hideDefaultNav: true|undefined, onCommit: fn }.
    var extraSteps = Array.isArray(props.extraSteps) ? props.extraSteps : [];
    var steps = (STEPS[page] || []).concat(extraSteps);
    var _idx = React.useState(0);
    var idx = _idx[0], setIdx = _idx[1];
    // Position of the popover relative to the target element. Recomputed on
    // step change, window resize, and scroll. Falls back to centred when the
    // step has no target or the target isn't in the DOM yet.
    var _anchor = React.useState(null);
    var anchor = _anchor[0], setAnchor = _anchor[1];
    // When step.requireClick is true, the user must click the anchored target
    // before the Next button enables. Reset to false on every step change.
    var _clicked = React.useState(false);
    var clicked = _clicked[0], setClicked = _clicked[1];
    React.useEffect(function () { setClicked(false); }, [idx]);

    // Focus-trap container ref + initial-focus management for a11y.
    var contentRef = React.useRef(null);
    var titleId = React.useMemo(function () { return "ob-title-" + Math.random().toString(36).slice(2, 8); }, []);

    function handleClose(skipFlag) {
      if (!skipFlag) markDone(page);
      if (typeof props.onClose === "function") props.onClose();
    }

    function handleLast() {
      // Final-step button: mark done, then either chain into onLastStep
      // (used by Tracker to launch StitchingStyleOnboarding seamlessly) or
      // simply close.
      markDone(page);
      if (typeof props.onLastStep === "function") {
        if (typeof props.onClose === "function") props.onClose();
        props.onLastStep();
      } else {
        if (typeof props.onClose === "function") props.onClose();
      }
    }

    if (window.useEscape) window.useEscape(function () { handleClose(false); });

    if (!steps.length) return null;
    var step = steps[Math.min(idx, steps.length - 1)];
    var isLast = idx >= steps.length - 1;
    var lastLabel = isLast ? (props.lastStepLabel || "Get started") : null;

    // Focus trap: keep Tab/Shift+Tab inside the popover. Set initial focus
    // to the primary action when the step changes.
    React.useEffect(function () {
      var node = contentRef.current;
      if (!node) return;
      // Move focus to the primary action button on each step change.
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
    }, [idx]);

    // Recompute anchor rect whenever the step (or viewport) changes.
    React.useEffect(function () {
      function recompute() {
        if (!step.target) { setAnchor(null); return; }
        var el = document.querySelector(step.target);
        if (!el) { setAnchor(null); return; }
        var r = el.getBoundingClientRect();
        setAnchor({
          top: r.top, left: r.left, right: r.right, bottom: r.bottom,
          width: r.width, height: r.height,
          placement: step.placement || "bottom"
        });
      }
      recompute();
      window.addEventListener("resize", recompute);
      window.addEventListener("scroll", recompute, true);
      // For requireClick steps, listen for a click on the target and unlock Next.
      var clickEl = step.requireClick && step.target ? document.querySelector(step.target) : null;
      function onTargetClick() { setClicked(true); }
      if (clickEl) clickEl.addEventListener("click", onTargetClick);
      return function () {
        window.removeEventListener("resize", recompute);
        window.removeEventListener("scroll", recompute, true);
        if (clickEl) clickEl.removeEventListener("click", onTargetClick);
      };
    }, [idx, step.target, step.placement, step.requireClick]);

    // Compute the popover style — either floating near the anchor, or centred.
    var popoverStyle = { maxWidth: 420, padding: 22, position: "relative" };
    var overlayStyle = null;        // when targeted, dim background but cut hole
    var arrowStyle = null;
    if (anchor) {
      var pad = 12, gap = 14;
      var vw = window.innerWidth, vh = window.innerHeight;
      var top, left;
      if (anchor.placement === "right") {
        top = anchor.top + anchor.height / 2 - 80;
        left = anchor.right + gap;
      } else if (anchor.placement === "left") {
        top = anchor.top + anchor.height / 2 - 80;
        left = anchor.left - 420 - gap;
      } else if (anchor.placement === "top") {
        top = anchor.top - 200 - gap;
        left = anchor.left + anchor.width / 2 - 210;
      } else { // bottom
        top = anchor.bottom + gap;
        left = anchor.left + anchor.width / 2 - 210;
      }
      // Clamp into viewport.
      top = Math.max(pad, Math.min(top, vh - 200 - pad));
      left = Math.max(pad, Math.min(left, vw - 420 - pad));
      popoverStyle = Object.assign({}, popoverStyle, {
        position: "fixed", top: top, left: left, margin: 0
      });
      // Highlight ring around the target.
      overlayStyle = {
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1
      };
      arrowStyle = {
        position: "fixed", top: anchor.top - 4, left: anchor.left - 4,
        width: anchor.width + 8, height: anchor.height + 8,
        border: "3px solid #0d9488", borderRadius: 8,
        boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.45)",
        pointerEvents: "none", zIndex: 2,
        transition: "all 0.18s ease"
      };
    }

    var primaryDisabled = !!(step.requireClick && !clicked && !isLast);

    // Custom-component step: hand off rendering to caller-supplied component.
    // The wizard still renders the close button + step indicator and the
    // a11y wrapper, but skips title/body/Next-button.
    var isCustom = typeof step.customComponent === "function";
    function advanceCustom(payload) {
      if (typeof step.onCommit === "function") { try { step.onCommit(payload); } catch (_) {} }
      if (isLast) handleLast(); else setIdx(idx + 1);
    }

    var children = [
        h("button", { key: "close", className: "modal-close onboarding-focusable", onClick: function () { handleClose(false); }, "aria-label": "Close" }, "\u00d7"),
        // Step indicator
        h("div", { key: "ind", style: { display: "flex", gap: 6, marginBottom: 16 }, "aria-hidden": "true" },
          steps.map(function (_, i) {
            return h("div", {
              key: i,
              style: {
                flex: 1, height: 4, borderRadius: 2,
                background: i <= idx ? "#0d9488" : "#e2e8f0",
                transition: "background 0.2s"
              }
            });
          })
        ),
        // Live region — announces step title + body to screen readers on change.
        h("div", { key: "live", "aria-live": "polite", "aria-atomic": "true" },
          isCustom
            ? h(step.customComponent, {
                key: "custom",
                onComplete: advanceCustom,
                onBack: idx > 0 ? function () { setIdx(idx - 1); } : null,
                onSkip: function () { handleClose(false); },
                isLast: isLast,
                idx: idx,
                titleId: titleId
              })
            : [
                h("h3", { key: "t", id: titleId, style: { margin: "0 0 10px 0", fontSize: 19, color: "#1e293b" } }, step.title),
                h("p", { key: "b", style: { margin: "0 0 12px 0", fontSize: 14, lineHeight: 1.55, color: "#475569" } }, step.body),
                step.tip && h("div", {
                  key: "tip",
                  style: {
                    padding: "8px 12px", background: "#f0fdfa", border: "1px solid #99f6e4",
                    borderRadius: 6, fontSize: 12, color: "#065f46", marginBottom: 12
                  }
                }, h("strong", null, "Tip: "), step.tip)
              ]
        ),
        // Custom steps render their own controls, so we skip the default nav row.
        !isCustom && h("div", { key: "nav", style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 } },
          h("button", {
            onClick: function () { handleClose(false); },
            className: "onboarding-focusable",
            style: { padding: "6px 12px", fontSize: 12, color: "#64748b", background: "transparent", border: "none", cursor: "pointer" }
          }, "Skip tour"),
          h("div", { style: { display: "flex", gap: 8 } },
            idx > 0 && h("button", {
              onClick: function () { setIdx(idx - 1); },
              className: "onboarding-focusable",
              style: { padding: "8px 14px", fontSize: 13, borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", color: "#475569" }
            }, "Back"),
            h("button", {
              "data-ob-primary": true,
              onClick: function () { if (isLast) handleLast(); else setIdx(idx + 1); },
              disabled: primaryDisabled,
              className: "onboarding-focusable",
              style: { padding: "8px 16px", fontSize: 13, borderRadius: 6, border: "none",
                background: primaryDisabled ? "#94a3b8" : "#0d9488",
                color: "#fff", cursor: primaryDisabled ? "not-allowed" : "pointer", fontWeight: 600 },
              title: primaryDisabled ? "Complete the highlighted action to continue" : ""
            }, isLast ? lastLabel : (step.requireClick && !clicked ? "Waiting…" : "Next"))
          )
        )
    ];

    var dialogProps = { role: "dialog", "aria-modal": "true", "aria-labelledby": titleId };

    if (anchor) {
      // Targeted popover: dim backdrop with a hole, place panel near anchor.
      // The wrapper itself MUST be click-through (pointerEvents:none) so that
      // requireClick steps can still receive the click on the highlighted
      // target underneath. The popover re-enables pointer events on itself so
      // its own buttons remain interactive.
      return h("div", {
        className: "onboarding-targeted-overlay",
        style: { position: "fixed", inset: 0, zIndex: 5000, pointerEvents: "none" }
      },
        h("div", { style: arrowStyle }),
        h("div", Object.assign({}, dialogProps, {
          ref: contentRef,
          className: "modal-content onboarding-content",
          onClick: function (e) { e.stopPropagation(); },
          style: Object.assign({}, popoverStyle, { zIndex: 5001, pointerEvents: "auto" })
        }), children)
      );
    }

    // Centred fallback.
    return h("div", { className: "modal-overlay", onClick: function () { handleClose(false); } },
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

  window.WelcomeWizard = WelcomeWizard;
})();
