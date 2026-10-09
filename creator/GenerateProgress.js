/* creator/GenerateProgress.js — what the Creator shows while it generates a
 * pattern (audit IMG-07).
 *
 * A card in the style of the import progress card (import-engine/ui/
 * ImportReviewModal.js showImportProgress): the stage in stitcher's words
 * from the worker's progress messages (GENERATE_STAGES in
 * useCreatorState.js), a progress bar, and Cancel. A light scrim keeps the
 * Convert settings from being changed underneath it.
 *
 * Props: stage (a GENERATE_STAGES key or null), onCancel.
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 */
window.CreatorGenerateProgress = function CreatorGenerateProgress(props) {
  var h = React.createElement;
  var info = typeof window.generateStageInfo === "function"
    ? window.generateStageInfo(props.stage)
    : { label: "Generating pattern…", pct: null };
  var _stopping = React.useState(false); var stopping = _stopping[0], setStopping = _stopping[1];
  var cancelRef = React.useRef(null);

  React.useEffect(function () {
    function onKey(e) { if (e.key === "Escape" && props.onCancel) { setStopping(true); props.onCancel(); } }
    document.addEventListener("keydown", onKey);
    return function () { document.removeEventListener("keydown", onKey); };
  }, [props.onCancel]);

  var known = typeof info.pct === "number";
  return h("div", { className: "generate-busy-scrim" },
    h("div", { className: "generate-busy", role: "status", "aria-live": "polite", "data-generate-stage": props.stage || "" },
      h("div", { className: "import-busy-title" }, "Generating pattern"),
      h("div", { className: "import-busy-label" }, stopping ? "Stopping…" : info.label),
      h("div", { className: "import-busy-track", role: "progressbar", "aria-label": "Generating pattern",
          "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": known ? info.pct : undefined },
        h("div", { className: "import-busy-bar" + (known ? "" : " indeterminate"), style: known ? { width: info.pct + "%" } : undefined })),
      props.onCancel ? h("button", {
        ref: cancelRef, type: "button", className: "g-btn import-busy-cancel", disabled: stopping,
        onClick: function () { if (stopping) return; setStopping(true); props.onCancel(); }
      }, "Cancel") : null
    )
  );
};
