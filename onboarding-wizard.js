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
        body: "Drag-and-drop a photo onto the canvas or click 'Open image…'. The Creator will quantise it to a DMC palette.",
        tip: "Tip: smaller images give you a clearer pattern. Aim for 300\u20131000 px on the long edge."
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
        body: "Switch to the Threads tab and tick the threads you own. Use 'Bulk Add' to paste a list of IDs in one go."
      },
      {
        title: "2. Browse your patterns",
        body: "Patterns saved in the Creator/Tracker auto-sync here. You can also add patterns manually \u2014 these are flagged 'Stash Manager only'.",
        tip: "Each card shows how many of its required threads you already own."
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

  function WelcomeWizard(props) {
    var page = props.page || "creator";
    var steps = STEPS[page] || [];
    var _idx = React.useState(0);
    var idx = _idx[0], setIdx = _idx[1];

    function handleClose(skipFlag) {
      if (!skipFlag) markDone(page);
      if (typeof props.onClose === "function") props.onClose();
    }

    if (window.useEscape) window.useEscape(function () { handleClose(false); });

    if (!steps.length) return null;
    var step = steps[Math.min(idx, steps.length - 1)];
    var isLast = idx >= steps.length - 1;

    return h("div", { className: "modal-overlay", onClick: function () { handleClose(false); } },
      h("div", {
        className: "modal-content onboarding-content",
        onClick: function (e) { e.stopPropagation(); },
        style: { maxWidth: 460, padding: 24 }
      },
        h("button", { className: "modal-close", onClick: function () { handleClose(false); }, "aria-label": "Close" }, "\u00d7"),
        // Step indicator
        h("div", { style: { display: "flex", gap: 6, marginBottom: 16 } },
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
        h("h3", { style: { margin: "0 0 10px 0", fontSize: 19, color: "#1e293b" } }, step.title),
        h("p", { style: { margin: "0 0 12px 0", fontSize: 14, lineHeight: 1.55, color: "#475569" } }, step.body),
        step.tip && h("div", {
          style: {
            padding: "8px 12px", background: "#f0fdfa", border: "1px solid #99f6e4",
            borderRadius: 6, fontSize: 12, color: "#065f46", marginBottom: 12
          }
        }, h("strong", null, "Tip: "), step.tip),
        h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 } },
          h("button", {
            onClick: function () { handleClose(false); },
            style: { padding: "6px 12px", fontSize: 12, color: "#64748b", background: "transparent", border: "none", cursor: "pointer" }
          }, "Skip tour"),
          h("div", { style: { display: "flex", gap: 8 } },
            idx > 0 && h("button", {
              onClick: function () { setIdx(idx - 1); },
              style: { padding: "8px 14px", fontSize: 13, borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", color: "#475569" }
            }, "Back"),
            h("button", {
              onClick: function () { if (isLast) handleClose(false); else setIdx(idx + 1); },
              style: { padding: "8px 16px", fontSize: 13, borderRadius: 6, border: "none", background: "#0d9488", color: "#fff", cursor: "pointer", fontWeight: 600 }
            }, isLast ? "Get started" : "Next")
          )
        )
      )
    );
  }

  WelcomeWizard.shouldShow = shouldShow;
  WelcomeWizard.markDone = markDone;
  WelcomeWizard.reset = reset;
  WelcomeWizard.STEPS = STEPS;

  window.WelcomeWizard = WelcomeWizard;
})();
