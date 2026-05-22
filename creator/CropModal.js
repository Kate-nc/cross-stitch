/* creator/CropModal.js — Full-screen crop modal for the Convert tab.
   Mounts when GenerationContext.isCropping === true.
   Reuses the existing cropRef, handleCropPointer*, and applyCrop
   machinery from useCanvasInteraction (accessed via GenerationContext).
   Exposes window.CropModal. */

window.CropModal = function CropModal() {
  var gen = window.useGeneration();
  var h = React.createElement;

  if (!gen.isCropping || !gen.img) return null;

  var cropReady = !!(gen.cropRect && gen.cropRect.w >= 10 && gen.cropRect.h >= 10);

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

  var footerStyle = {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
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
    maxHeight: "calc(100vh - 180px)",
    width: "auto", height: "auto",
    opacity: 0.8
  };

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
          onClick: function() { gen.setIsCropping(false); gen.setCropRect(null); },
          style: {
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-secondary)", padding: 4,
            display: "inline-flex", alignItems: "center"
          },
          "aria-label": "Cancel crop"
        }, window.Icons && window.Icons.x ? window.Icons.x() : "\u00D7")
      ),

      // ── Image area with draggable crop rectangle ───────────────────────
      h("div", { style: imageAreaStyle },
        h("div", {
          ref: gen.cropRef,
          style: containerStyle,
          onPointerDown: gen.handleCropPointerDown,
          onPointerMove: gen.handleCropPointerMove,
          onPointerUp: gen.handleCropPointerUp,
          onPointerCancel: gen.handleCropPointerCancel
        },
          h("img", {
            src: gen.img.src,
            alt: "Source image for cropping",
            draggable: false,
            onDragStart: function(e) { e.preventDefault(); },
            style: imgStyle
          }),
          gen.cropRect && h("div", {
            style: {
              position: "absolute",
              left: gen.cropRect.x, top: gen.cropRect.y,
              width: gen.cropRect.w, height: gen.cropRect.h,
              border: "2px dashed var(--accent)",
              background: "rgba(184,92,56,0.15)",
              boxSizing: "border-box", pointerEvents: "none"
            }
          })
        )
      ),

      // ── Footer ────────────────────────────────────────────────────────
      h("div", { style: footerStyle },
        h("span", {
          style: { fontSize: "var(--text-xs)", color: "var(--text-secondary)" }
        }, "Drag to select the area to keep"),
        h("div", { style: { display: "flex", gap: 8 } },
          h("button", {
            type: "button",
            onClick: function() { gen.setIsCropping(false); gen.setCropRect(null); },
            style: {
              padding: "7px 14px", fontSize: "var(--text-sm)", fontWeight: 500,
              border: "1px solid var(--line)", borderRadius: "var(--radius-sm)",
              background: "var(--surface)", color: "var(--text-secondary)",
              cursor: "pointer", fontFamily: "inherit"
            }
          }, "Cancel"),
          h("button", {
            type: "button",
            disabled: !cropReady,
            onClick: function() { if (cropReady) gen.applyCrop(); },
            style: {
              padding: "7px 14px", fontSize: "var(--text-sm)", fontWeight: 600,
              border: "none", borderRadius: "var(--radius-sm)",
              background: cropReady ? "var(--accent)" : "var(--line-2)",
              color: cropReady ? "var(--surface)" : "var(--text-tertiary)",
              cursor: cropReady ? "pointer" : "not-allowed",
              fontFamily: "inherit"
            }
          }, "Apply crop")
        )
      )
    )
  );
};
