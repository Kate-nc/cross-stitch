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

  // ─── Step content per page ───────────────────────────────────────────────
  var STEPS = {
    creator: [
      {
        title: "Welcome to the Pattern Creator",
        body: "Convert any image into a printable cross-stitch pattern. We'll show you around in under a minute.",
        tip: "Everything runs in your browser — your photos never leave this device."
      },
      {
        title: "What lives where",
        body: "The dashboard above lists projects you've already started. The 'Start New' panel below is how you begin something fresh: from an image, from scratch, or by importing a saved file.",
        tip: "Your stash and pattern library live one click away under 'Open Stash Manager'."
      },
      {
        title: "Pick a starting point",
        body: "When you're ready, click any option in 'Start New'. We'll highlight 'From image' as the most common one — drop a photo or click to browse.",
        tip: "Clicking any starting option will close this tour and take you into the editor.",
        target: "[data-onboard=\"home-from-image\"]",
        placement: "right",
        dismissOnTargetClick: true
      }
    ],
    manager: [
      {
        title: "Welcome to the Stash Manager",
        body: "Track which DMC and Anchor threads you own, and manage a library of patterns. We'll give you a 60-second tour."
      },
      {
        title: "1. Build your stash",
        body: "The Threads tab is where you tick the threads you own. Use 'Bulk Add' to paste a list of IDs in one go.",
        tip: "Clicking the highlighted tab will close this tour and take you straight there.",
        target: "[data-onboard=\"mgr-stash-tab\"]",
        placement: "bottom",
        dismissOnTargetClick: true
      },
      {
        title: "2. Browse your patterns",
        body: "The Patterns tab lists patterns saved in the Creator/Tracker (auto-synced) plus any you add manually here.",
        tip: "Clicking the highlighted tab will close this tour.",
        target: "[data-onboard=\"mgr-patterns-tab\"]",
        placement: "bottom",
        dismissOnTargetClick: true
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
    // True once we've confirmed the current step's target selector is missing
    // from the DOM after a brief grace period. When set, the popover centres
    // itself instead of pinning to a stale rect at (0, 0).
    var _targetMissing = React.useState(false);
    var targetMissing = _targetMissing[0], setTargetMissing = _targetMissing[1];
    React.useEffect(function () { setTargetMissing(false); }, [idx]);

    // Focus-trap container ref + initial-focus management for a11y.
    var contentRef = React.useRef(null);
    var titleId = React.useMemo(function () { return "ob-title-" + Math.random().toString(36).slice(2, 8); }, []);

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
      var missingTimer = null;
      function recompute() {
        if (!step.target) { setAnchor(null); return; }
        var el = document.querySelector(step.target);
        if (!el) { setAnchor(null); return; }
        var r = el.getBoundingClientRect();
        // Defensive: an offscreen / display:none button reports a 0×0 rect.
        // Treat that the same as missing so the popover centres itself.
        if (r.width === 0 && r.height === 0) { setAnchor(null); return; }
        setAnchor({
          top: r.top, left: r.left, right: r.right, bottom: r.bottom,
          width: r.width, height: r.height,
          placement: step.placement || "bottom"
        });
      }
      recompute();
      // If the target wasn't found on first paint, give it 600 ms (covers
      // animations / lazy mounts) before falling back to centred mode.
      if (step.target && !document.querySelector(step.target)) {
        missingTimer = setTimeout(function () {
          if (!document.querySelector(step.target)) setTargetMissing(true);
        }, 600);
      }
      window.addEventListener("resize", recompute);
      window.addEventListener("scroll", recompute, { capture: true, passive: true });
      // dismissOnTargetClick: clicking the highlighted target closes the
      // tour cleanly (and marks the page done), so navigating away as a
      // result of that click won't leave the user stranded.
      var clickEl = step.dismissOnTargetClick && step.target
        ? document.querySelector(step.target) : null;
      function onTargetClick() { handleClose(false); }
      if (clickEl) clickEl.addEventListener("click", onTargetClick);
      return function () {
        if (missingTimer) clearTimeout(missingTimer);
        window.removeEventListener("resize", recompute);
        window.removeEventListener("scroll", recompute, { capture: true });
        if (clickEl) clickEl.removeEventListener("click", onTargetClick);
      };
    }, [idx, step.target, step.placement, step.dismissOnTargetClick]);

    // Compute the popover style — either floating near the anchor, or centred.
    // maxWidth is clamped to the viewport so the popover never overflows on
    // narrow phones (the original 420 caused right-edge clipping at <440 px).
    var vwInit = (typeof window !== 'undefined' ? window.innerWidth : 420);
    var popoverMaxWidth = Math.min(420, Math.max(240, vwInit - 24));
    var popoverStyle = { maxWidth: popoverMaxWidth, padding: 22, position: "relative" };
    var overlayStyle = null;        // when targeted, dim background but cut hole
    var arrowStyle = null;
    if (anchor) {
      var pad = 12, gap = 14;
      var vw = window.innerWidth, vh = window.innerHeight;
      var pw = popoverMaxWidth;
      var top, left;
      if (anchor.placement === "right") {
        top = anchor.top + anchor.height / 2 - 80;
        left = anchor.right + gap;
      } else if (anchor.placement === "left") {
        top = anchor.top + anchor.height / 2 - 80;
        left = anchor.left - pw - gap;
      } else if (anchor.placement === "top") {
        top = anchor.top - 200 - gap;
        left = anchor.left + anchor.width / 2 - pw / 2;
      } else { // bottom
        top = anchor.bottom + gap;
        left = anchor.left + anchor.width / 2 - pw / 2;
      }
      // Clamp into viewport.
      top = Math.max(pad, Math.min(top, vh - 200 - pad));
      left = Math.max(pad, Math.min(left, vw - pw - pad));
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
        border: "3px solid var(--accent)", borderRadius: 8,
        boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.45)",
        pointerEvents: "none", zIndex: 2,
        transition: "all var(--motion, 160ms ease-out)"
      };
    }

    var primaryDisabled = false;

    // Custom-component step: hand off rendering to caller-supplied component.
    // The wizard still renders the close button + step indicator and the
    // a11y wrapper, but skips title/body/Next-button.
    var isCustom = typeof step.customComponent === "function";
    function advanceCustom(payload) {
      if (typeof step.onCommit === "function") { try { step.onCommit(payload); } catch (_) {} }
      if (isLast) handleLast(); else setIdx(idx + 1);
    }

    var closeIcon = (window.Icons && window.Icons.x) ? window.Icons.x() : null;
    var children = [
        h("button", {
          key: "close", className: "modal-close onboarding-focusable",
          onClick: function () { handleClose(false); }, "aria-label": "Close",
          style: { background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }
        }, closeIcon),
        // Step counter — visible "Step N of M" text for screen readers and sighted users.
        !isCustom && steps.length > 1 && h("div", { key: "sc", className: "onboarding-step-counter" },
          "Step " + (idx + 1) + " of " + steps.length
        ),
        // Step indicator dots — decorative, paired with the counter above.
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
                h("h3", { key: "t", id: titleId, style: { margin: "0 0 10px 0", fontSize: 19, color: "var(--text-primary)" } }, step.title),
                h("p", { key: "b", style: { margin: "0 0 12px 0", fontSize: 14, lineHeight: 1.55, color: "var(--text-secondary)" } }, step.body),
                step.tip && h("div", {
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
        // Custom steps render their own controls, so we skip the default nav row.
        !isCustom && h("div", { key: "nav", style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 } },
          h("button", {
            onClick: function () { handleClose(false); },
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
              disabled: primaryDisabled,
              className: "btn btn-primary onboarding-focusable",
              style: { padding: "8px 16px", fontSize: 13, borderRadius: "var(--radius-sm, 6px)", border: "none",
                background: primaryDisabled ? "var(--text-tertiary)" : "var(--accent)",
                color: "var(--text-on-accent, #fff)", cursor: primaryDisabled ? "not-allowed" : "pointer", fontWeight: 600 }
            }, isLast ? lastLabel : "Next")
          )
        )
    ];

    var dialogProps = { role: "dialog", "aria-modal": "true", "aria-labelledby": titleId };

    if (anchor) {
      // Targeted popover: dim backdrop with a hole, place panel near anchor.
      // The wrapper itself MUST be click-through (pointerEvents:none) so
      // that clicks on the highlighted target underneath still register —
      // crucial for dismissOnTargetClick steps. The popover re-enables
      // pointer events on itself so its own buttons remain interactive.
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
