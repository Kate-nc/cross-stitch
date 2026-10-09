/* creator/NewDesignSheet.js — set up a design drawn from scratch (audit DRAW-02).
 *
 * Shown for Home > Create new > Draw on a blank grid, before the grid is
 * made, so the size and fabric are chosen up front rather than found later
 * under More > Resize canvas:
 *   - Size: Small motif 30 × 30, Card 50 × 70, Medium 100 × 100,
 *     Large 150 × 150 or Custom W × H, with the finished size;
 *   - Fabric: count and colour (creator/FabricBlock.js);
 *   - Trace over a picture (optional): a picture shown faintly under the
 *     grid, with its opacity (30 % to start).
 * Start drawing calls props.onStart({ w, h, fabricCt, fabricColour,
 * trace: { file, opacity } | null }); Cancel calls props.onCancel.
 *
 * A full-screen sheet on phones, a centred dialog on wider screens (CSS).
 *
 * window.SCRATCH_SIZE_PRESETS is exported for tests.
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 */

(function () {
  var PRESETS = [
    { id: "small",  label: "Small motif", w: 30,  h: 30 },
    { id: "card",   label: "Card",        w: 50,  h: 70 },
    { id: "medium", label: "Medium",      w: 100, h: 100 },
    { id: "large",  label: "Large",       w: 150, h: 150 }
  ];
  window.SCRATCH_SIZE_PRESETS = PRESETS;

  function clampSize(v) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return 10;
    return Math.max(10, Math.min(500, n));
  }
  window.clampScratchSize = clampSize;

  window.CreatorNewDesignSheet = function CreatorNewDesignSheet(props) {
    var h = React.createElement;
    var Icons = window.Icons || {};
    var _preset = React.useState("medium"); var preset = _preset[0], setPreset = _preset[1];
    var _cw = React.useState(80); var customW = _cw[0], setCustomW = _cw[1];
    var _ch = React.useState(80); var customH = _ch[0], setCustomH = _ch[1];
    var _ct = React.useState(props.fabricCt || 14); var fabricCt = _ct[0], setFabricCt = _ct[1];
    var _col = React.useState(props.fabricColour || "#FFFFFF"); var fabricColour = _col[0], setFabricColour = _col[1];
    var _trace = React.useState(null); var trace = _trace[0], setTrace = _trace[1];
    var _op = React.useState(30); var opacity = _op[0], setOpacity = _op[1];
    var fileRef = React.useRef(null);
    var startRef = React.useRef(null);

    var p = PRESETS.filter(function (x) { return x.id === preset; })[0];
    var w = p ? p.w : clampSize(customW);
    var hgt = p ? p.h : clampSize(customH);

    React.useEffect(function () {
      if (startRef.current) startRef.current.focus();
      function onKey(e) { if (e.key === "Escape" && props.onCancel) props.onCancel(); }
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("keydown", onKey); };
    }, []);

    // A preview URL for the chosen tracing picture.
    var _url = React.useState(null); var traceUrl = _url[0], setTraceUrl = _url[1];
    React.useEffect(function () {
      if (!trace) { setTraceUrl(null); return undefined; }
      var u = URL.createObjectURL(trace);
      setTraceUrl(u);
      return function () { URL.revokeObjectURL(u); };
    }, [trace]);

    function start() {
      if (props.onStart) props.onStart({
        w: w, h: hgt, fabricCt: fabricCt, fabricColour: fabricColour,
        trace: trace ? { file: trace, opacity: opacity / 100 } : null
      });
    }

    var finished = typeof window.fabricSizes === "function" ? window.fabricSizes(w, hgt, fabricCt).finished : "";

    return h("div", { className: "new-design-overlay" },
      h("div", { className: "new-design-sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": "new-design-title" },
        h("header", { className: "new-design-sheet__head" },
          h("h2", { id: "new-design-title" }, "New design"),
          h("button", { type: "button", className: "new-design-sheet__close", "aria-label": "Cancel", onClick: props.onCancel },
            Icons.x ? Icons.x() : null)
        ),
        h("div", { className: "new-design-sheet__body" },
          h("section", { className: "new-design-sheet__section", "aria-labelledby": "nd-size" },
            h("h3", { id: "nd-size" }, "Size"),
            h("div", { className: "new-design-sheet__chips", role: "radiogroup", "aria-labelledby": "nd-size" },
              PRESETS.concat([{ id: "custom", label: "Custom" }]).map(function (x) {
                var on = preset === x.id;
                return h("button", {
                  key: x.id, type: "button", role: "radio", "aria-checked": on ? "true" : "false",
                  className: "new-design-chip" + (on ? " new-design-chip--on" : ""),
                  onClick: function () { setPreset(x.id); }
                },
                  h("span", { className: "new-design-chip__label" }, x.label),
                  x.w ? h("span", { className: "new-design-chip__size" }, x.w + " × " + x.h) : null
                );
              })
            ),
            preset === "custom" && h("div", { className: "new-design-sheet__custom" },
              h("label", null, "Width",
                h("input", { type: "number", inputMode: "numeric", min: 10, max: 500, value: customW,
                  onChange: function (e) { setCustomW(e.target.value); }, onBlur: function () { setCustomW(clampSize(customW)); } })),
              h("span", { "aria-hidden": "true" }, "×"),
              h("label", null, "Height",
                h("input", { type: "number", inputMode: "numeric", min: 10, max: 500, value: customH,
                  onChange: function (e) { setCustomH(e.target.value); }, onBlur: function () { setCustomH(clampSize(customH)); } }))
            ),
            h("p", { className: "new-design-sheet__readout", "data-new-design-size": "" },
              w + " × " + hgt + " stitches" + (finished ? " · " + finished : ""))
          ),
          h("section", { className: "new-design-sheet__section", "aria-labelledby": "nd-fabric" },
            h("h3", { id: "nd-fabric" }, "Fabric"),
            window.CreatorFabricBlock ? h(window.CreatorFabricBlock, {
              fabricCt: fabricCt, setFabricCt: setFabricCt,
              fabricColour: fabricColour, setFabricColour: setFabricColour,
              sW: w, sH: hgt, showSizes: false
            }) : null
          ),
          h("section", { className: "new-design-sheet__section", "aria-labelledby": "nd-trace" },
            h("h3", { id: "nd-trace" }, "Trace over a picture ", h("span", { className: "new-design-sheet__optional" }, "(optional)")),
            h("p", { className: "new-design-sheet__hint" }, "The picture shows faintly under the grid for you to draw over. It isn’t converted."),
            h("input", { ref: fileRef, type: "file", accept: "image/*", className: "new-design-sheet__file",
              "aria-label": "Choose a picture to trace",
              onChange: function (e) { var f = e.target.files && e.target.files[0]; if (f) setTrace(f); e.target.value = ""; } }),
            trace
              ? h("div", { className: "new-design-sheet__trace" },
                  traceUrl ? h("img", { src: traceUrl, alt: "", style: { opacity: opacity / 100 } }) : null,
                  h("div", { className: "new-design-sheet__trace-controls" },
                    h("div", { className: "new-design-sheet__trace-name" }, trace.name || "Picture"),
                    h("label", null, "Opacity ", h("span", null, opacity + "%"),
                      h("input", { type: "range", min: 5, max: 90, step: 5, value: opacity, "aria-label": "Tracing picture opacity",
                        onChange: function (e) { setOpacity(Number(e.target.value)); } })),
                    h("div", { className: "new-design-sheet__trace-buttons" },
                      h("button", { type: "button", className: "g-btn", onClick: function () { fileRef.current && fileRef.current.click(); } }, "Change"),
                      h("button", { type: "button", className: "g-btn", onClick: function () { setTrace(null); } }, "Remove"))
                  ))
              : h("button", { type: "button", className: "g-btn", onClick: function () { fileRef.current && fileRef.current.click(); } },
                  Icons.image ? Icons.image() : null, "Choose a picture")
          )
        ),
        h("footer", { className: "new-design-sheet__foot" },
          h("button", { type: "button", className: "g-btn", onClick: props.onCancel }, "Cancel"),
          h("button", { ref: startRef, type: "button", className: "g-btn primary", onClick: start },
            Icons.pencil ? Icons.pencil() : null, "Start drawing")
        )
      )
    );
  };
})();
