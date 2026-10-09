/* creator/GenerateProgress.js — what the Creator shows while it generates a
 * pattern (audit IMG-07).
 *
 * A card in the style of the import progress card (import-engine/ui/
 * ImportReviewModal.js showImportProgress): the stage in stitcher's words
 * from the worker's progress messages (GENERATE_STAGES in
 * useCreatorState.js), a progress bar, and Cancel. It is a modal dialog over
 * a light scrim: focus moves to Cancel, Tab stays inside, Escape cancels
 * through the shared window.useEscape stack, and focus goes back where it
 * was when the card closes.
 *
 * Props:
 *   stage       a GENERATE_STAGES key or null
 *   onCancel    stops the generation
 *   cancellable false when the generation runs on the page (no workers), where
 *               it can't be interrupted; the card then offers no Cancel
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 */
window.CreatorGenerateProgress = function CreatorGenerateProgress(props) {
  var h = React.createElement;
  var info = typeof window.generateStageInfo === "function"
    ? window.generateStageInfo(props.stage)
    : { label: "Generating pattern…", pct: null };
  var _stopping = React.useState(false); var stopping = _stopping[0], setStopping = _stopping[1];
  var cardRef = React.useRef(null);
  var canCancel = props.cancellable !== false && typeof props.onCancel === "function";

  var cancel = React.useCallback(function () {
    if (!canCancel) return;
    setStopping(true);
    props.onCancel();
  }, [canCancel, props.onCancel]);

  // Escape goes through the shared stack, so nothing underneath also reacts.
  if (typeof window.useEscape === "function") window.useEscape(canCancel ? cancel : function () {});

  // Move focus in, keep Tab inside, and put focus back afterwards.
  React.useEffect(function () {
    var card = cardRef.current;
    if (!card) return undefined;
    var prev = document.activeElement;
    var target = card.querySelector("[data-autofocus]") || card;
    try { target.focus({ preventScroll: true }); } catch (_) { try { target.focus(); } catch (__) {} }
    function onKey(e) {
      if (e.key !== "Tab") return;
      var btn = card.querySelector("button:not([disabled])");
      e.preventDefault();
      (btn || card).focus();
    }
    card.addEventListener("keydown", onKey);
    return function () {
      card.removeEventListener("keydown", onKey);
      if (prev && typeof prev.focus === "function" && document.contains(prev)) {
        try { prev.focus({ preventScroll: true }); } catch (_) {}
      }
    };
  }, []);

  var known = typeof info.pct === "number";
  return h("div", { className: "generate-busy-scrim" },
    h("div", { ref: cardRef, className: "generate-busy", role: "dialog", "aria-modal": "true",
        "aria-labelledby": "generate-busy-title", tabIndex: -1, "data-generate-stage": props.stage || "" },
      h("div", { id: "generate-busy-title", className: "import-busy-title" }, "Generating pattern"),
      h("div", { className: "import-busy-label", role: "status", "aria-live": "polite" }, stopping ? "Stopping…" : info.label),
      h("div", { className: "import-busy-track", role: "progressbar", "aria-label": "Generating pattern",
          "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": known ? info.pct : undefined },
        h("div", { className: "import-busy-bar" + (known ? "" : " indeterminate"), style: known ? { width: info.pct + "%" } : undefined })),
      canCancel ? h("button", {
        type: "button", className: "g-btn import-busy-cancel", disabled: stopping, "data-autofocus": "",
        onClick: function () { if (!stopping) cancel(); }
      }, "Cancel") : null
    )
  );
};
