/* creator/CropModal.js — Full-screen crop modal for the Convert tab.
   Mounts when GenerationContext.isCropping === true.
   Reuses the existing cropRef, handleCropPointer*, and applyCrop
   machinery from useCanvasInteraction (accessed via GenerationContext).
   A shape (Free, Square, 4:3, 3:4) keeps the dragged rectangle to that
   shape and starts from the largest one that fits; the picture can be
   turned a quarter at a time. Escape cancels; Enter applies.
   Exposes window.CropModal. */

// The shapes, as width / height (null: any shape).
window.CROP_RATIOS = [
  { id: "free", label: "Free", ratio: null },
  { id: "square", label: "Square", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3, title: "Landscape, 4 wide by 3 tall" },
  { id: "3:4", label: "3:4", ratio: 3 / 4, title: "Portrait, 3 wide by 4 tall" }
];

// The picture turned by `quarters` quarter turns clockwise, as a canvas.
window.rotatePictureCanvas = function rotatePictureCanvas(img, quarters) {
  var q = ((quarters % 4) + 4) % 4;
  var w = img.naturalWidth || img.width, hgt = img.naturalHeight || img.height;
  var c = document.createElement("canvas");
  c.width = q % 2 ? hgt : w; c.height = q % 2 ? w : hgt;
  var cx = c.getContext("2d");
  cx.translate(c.width / 2, c.height / 2);
  cx.rotate(q * Math.PI / 2);
  cx.drawImage(img, -w / 2, -hgt / 2);
  return c;
};

window.CropModal = function CropModal() {
  var gen = window.useGeneration();
  var h = React.createElement;
  var open = !!(gen.isCropping && gen.img);

  var _shape = React.useState("free"); var shape = _shape[0], setShape = _shape[1];
  var _turns = React.useState(0); var turns = _turns[0], setTurns = _turns[1];
  // The turned picture while turns is not 0: { canvas, url }. Made at once,
  // so Apply never waits for it to load.
  var _turned = React.useState(null); var turned = _turned[0], setTurned = _turned[1];

  function ratioOf(id) {
    var r = window.CROP_RATIOS.filter(function (x) { return x.id === id; })[0];
    return r ? r.ratio : null;
  }
  // Each time the dialog opens it starts free and unturned.
  React.useEffect(function () {
    if (!open) return;
    setShape("free"); setTurns(0); setTurned(null);
    if (gen.cropRatioRef) gen.cropRatioRef.current = null;
  }, [open]);

  function close() {
    gen.setIsCropping(false); gen.setCropRect(null);
    if (gen.cropRatioRef) gen.cropRatioRef.current = null;
  }
  var cropReady = !!(gen.cropRect && gen.cropRect.w >= 10 && gen.cropRect.h >= 10);
  var canApply = cropReady || turns !== 0;
  function apply() {
    if (!canApply) return;
    gen.applyCrop(turns !== 0 && turned ? { source: turned.canvas } : undefined);
    if (gen.cropRatioRef) gen.cropRatioRef.current = null;
  }

  // Escape cancels and Enter applies, wherever focus is in the dialog.
  var applyRef = React.useRef(apply); applyRef.current = apply;
  var closeRef = React.useRef(close); closeRef.current = close;
  React.useEffect(function () {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current(); }
      else if (e.key === "Enter" && !(e.target && e.target.tagName === "BUTTON")) { e.preventDefault(); applyRef.current(); }
    }
    window.addEventListener("keydown", onKey, true);
    return function () { window.removeEventListener("keydown", onKey, true); };
  }, [open]);

  // The largest rectangle of the chosen shape, centred, once the picture
  // shown has its size on screen.
  function startShape(id) {
    var ratio = ratioOf(id);
    if (gen.cropRatioRef) gen.cropRatioRef.current = ratio;
    var el = gen.cropRef && gen.cropRef.current;
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    gen.setCropRect(ratio ? window.centredCropRect({ w: r.width, h: r.height }, ratio) : null);
  }
  function chooseShape(id) { setShape(id); startShape(id); }
  function turn(by) {
    var next = (((turns + by) % 4) + 4) % 4;
    setTurns(next);
    gen.setCropRect(null);
    if (next === 0) { setTurned(null); return; }
    var c = window.rotatePictureCanvas(gen.img, next);
    setTurned({ canvas: c, url: c.toDataURL("image/png") });
  }

  if (!open) return null;
  var shownSrc = turns !== 0 && turned ? turned.url : gen.img.src;

  var backdropStyle = {
    position: "fixed", inset: 0, zIndex: 2000,
    background: "rgba(0,0,0,0.82)",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    padding: 16
  };

  var wrapStyle = {
    width: "100%", maxWidth: 860,
    display: "flex", flexDirection: "column",
    background: "var(--surface)",
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
    maxHeight: "calc(100vh - 40px)"
  };

  var headerStyle = {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    borderBottom: "1px solid var(--line)",
    flexShrink: 0
  };

  var toolsStyle = {
    display: "flex", alignItems: "center", flexWrap: "wrap",
    gap: 8, padding: "8px 14px",
    borderBottom: "1px solid var(--line)", flexShrink: 0
  };

  var footerStyle = {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", gap: 8, flexWrap: "wrap",
    padding: "10px 14px",
    borderTop: "1px solid var(--line)",
    background: "var(--surface)", flexShrink: 0
  };

  // Image container — must be inline-block (tight to displayed image) so
  // that cropRect pixel coords (relative to getBoundingClientRect) map
  // correctly to the crop overlay's position:absolute children.
  var imageAreaStyle = {
    flex: 1, overflow: "auto",
    display: "flex", justifyContent: "center", alignItems: "flex-start",
    background: "var(--surface-secondary)",
    cursor: "crosshair"
  };

  var containerStyle = {
    position: "relative",
    display: "inline-block",
    touchAction: "none",
    userSelect: "none"
  };

  var imgStyle = {
    display: "block",
    maxWidth: "100%",
    maxHeight: "calc(100vh - 230px)",
    width: "auto", height: "auto",
    opacity: 0.8
  };

  var iconBtnStyle = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "5px 10px", fontSize: "var(--text-sm)",
    border: "1px solid var(--line)", borderRadius: "var(--radius-sm)",
    background: "var(--surface)", color: "var(--text-primary)",
    cursor: "pointer", fontFamily: "inherit"
  };

  var Icons = window.Icons || {};
  var hintText = shape === "free"
    ? (turns ? "Drag to select the area to keep, or apply to keep the whole picture turned" : "Drag to select the area to keep")
    : "Drag to draw a new " + (shape === "square" ? "square" : shape) + " area";

  return h("div", {
    style: backdropStyle,
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Crop image"
  },
    h("div", { style: wrapStyle },
      // ── Header ────────────────────────────────────────────────────────
      h("div", { style: headerStyle },
        h("span", {
          style: { fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)" }
        }, "Crop image"),
        h("button", {
          type: "button",
          onClick: close,
          style: {
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-secondary)", padding: 4,
            display: "inline-flex", alignItems: "center"
          },
          "aria-label": "Cancel crop"
        }, Icons.x ? Icons.x() : null)
      ),

      // ── Shape and turning ─────────────────────────────────────────────
      h("div", { style: toolsStyle },
        h("div", { className: "lp-segmented cv-seg", role: "radiogroup", "aria-label": "Crop shape" },
          window.CROP_RATIOS.map(function (r) {
            var on = r.id === shape;
            return h("button", {
              key: r.id, type: "button", role: "radio", "aria-checked": on ? "true" : "false",
              className: "lp-seg" + (on ? " lp-seg--on" : ""), title: r.title || r.label,
              "data-crop-shape": r.id, onClick: function () { chooseShape(r.id); }
            }, r.label);
          })),
        h("div", { style: { display: "flex", gap: 6, marginLeft: "auto" } },
          h("button", { type: "button", style: iconBtnStyle, onClick: function () { turn(-1); }, "aria-label": "Turn left" },
            Icons.rotateCcw ? Icons.rotateCcw() : null, h("span", null, "Turn left")),
          h("button", { type: "button", style: iconBtnStyle, onClick: function () { turn(1); }, "aria-label": "Turn right" },
            Icons.rotateCw ? Icons.rotateCw() : null, h("span", null, "Turn right")))
      ),

      // ── Image area with draggable crop rectangle ───────────────────────
      h("div", { style: imageAreaStyle },
        h("div", {
          ref: gen.cropRef,
          style: containerStyle,
          onPointerDown: gen.handleCropPointerDown,
          onPointerMove: gen.handleCropPointerMove,
          onPointerUp: gen.handleCropPointerUp,
          onPointerCancel: gen.handleCropPointerCancel,
          onLostPointerCapture: gen.handleCropPointerCancel
        },
          h("img", {
            key: "turn-" + turns,
            src: shownSrc,
            alt: "Source image for cropping",
            draggable: false,
            onDragStart: function(e) { e.preventDefault(); },
            // A shape chosen before turning starts again on the turned picture.
            onLoad: function () { if (shape !== "free") startShape(shape); },
            style: imgStyle
          }),
          gen.cropRect && h("div", {
            "data-crop-rect": "",
            style: {
              position: "absolute",
              left: gen.cropRect.x, top: gen.cropRect.y,
              width: gen.cropRect.w, height: gen.cropRect.h,
              border: "2px dashed var(--accent)",
              background: "transparent",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
              boxSizing: "border-box", pointerEvents: "none"
            }
          })
        )
      ),

      // ── Footer ────────────────────────────────────────────────────────
      h("div", { style: footerStyle },
        h("span", {
          style: { fontSize: "var(--text-xs)", color: "var(--text-secondary)" }
        }, hintText),
        h("div", { style: { display: "flex", gap: 8 } },
          h("button", {
            type: "button",
            onClick: close,
            style: {
              padding: "7px 14px", fontSize: "var(--text-sm)", fontWeight: 500,
              border: "1px solid var(--line)", borderRadius: "var(--radius-sm)",
              background: "var(--surface)", color: "var(--text-secondary)",
              cursor: "pointer", fontFamily: "inherit"
            }
          }, "Cancel"),
          h("button", {
            type: "button",
            disabled: !canApply,
            onClick: apply,
            style: {
              padding: "7px 14px", fontSize: "var(--text-sm)", fontWeight: 600,
              border: "none", borderRadius: "var(--radius-sm)",
              background: canApply ? "var(--accent)" : "var(--line-2)",
              color: canApply ? "var(--surface)" : "var(--text-tertiary)",
              cursor: canApply ? "pointer" : "not-allowed",
              fontFamily: "inherit"
            }
          }, cropReady ? "Apply crop" : "Apply")
        )
      )
    )
  );
};
