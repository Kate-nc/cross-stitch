/* creator/ResizeCanvasModal.js — Modal for resizing (crop / expand) the
   cross-stitch pattern canvas.

   This is DISTINCT from CropModal.js, which crops the SOURCE IMAGE before
   pattern generation. This modal operates on the already-generated pattern
   grid: it lets users grow or shrink the canvas in any direction and
   reposition the existing stitches within the new bounds.

   Props:
     sW, sH        — current canvas dimensions
     done          — current done array (null | Uint8Array) — used only to
                     show the progress warning
     onApply(spec) — called with { newW, newH, offsetX, offsetY }
     onClose()     — called when the user cancels or closes

   Exposed as window.ResizeCanvasModal. */

window.ResizeCanvasModal = function ResizeCanvasModal(props) {
  var h = React.createElement;
  var Icons = window.Icons || {};
  var sW = props.sW || 80;
  var sH = props.sH || 80;
  var hasDone = !!(props.done);

  // ── State ────────────────────────────────────────────────────────────────
  // Padding inputs: how many rows/columns to add (positive) or remove
  // (negative) on each side.
  //   newW = sW + padLeft + padRight
  //   newH = sH + padTop  + padBottom
  //   offsetX = padLeft   (old (0,0) appears padLeft cells from left edge)
  //   offsetY = padTop
  var _padTop    = React.useState(0); var padTop    = _padTop[0],    setPadTop    = _padTop[1];
  var _padBottom = React.useState(0); var padBottom = _padBottom[0], setPadBottom = _padBottom[1];
  var _padLeft   = React.useState(0); var padLeft   = _padLeft[0],   setPadLeft   = _padLeft[1];
  var _padRight  = React.useState(0); var padRight  = _padRight[0],  setPadRight  = _padRight[1];

  // ── Computed values ──────────────────────────────────────────────────────
  var newW = Math.max(1, sW + padLeft + padRight);
  var newH = Math.max(1, sH + padTop  + padBottom);
  var offsetX = padLeft;
  var offsetY = padTop;

  var isIdentity = (newW === sW && newH === sH && offsetX === 0 && offsetY === 0);

  // Preview: what will be kept vs. cropped, at a glance.
  // Compute the intersection of old canvas (in new space) and new canvas.
  var keepLeft   = Math.max(0, offsetX);
  var keepTop    = Math.max(0, offsetY);
  var keepRight  = Math.min(newW, offsetX + sW);
  var keepBottom = Math.min(newH, offsetY + sH);
  var keptCols   = Math.max(0, keepRight - keepLeft);
  var keptRows   = Math.max(0, keepBottom - keepTop);

  var totalOldCells = sW * sH;
  var keptCells    = keptCols * keptRows;
  var droppedCells = totalOldCells - keptCells;
  var isDestructive = droppedCells > 0;
  var progressAffected = isDestructive && hasDone;

  // ── Anchor preset helper ─────────────────────────────────────────────────
  // Anchor sets all four pads so the content is aligned to the given corner.
  // 'c' = content anchor (e.g. 'TL' keeps top-left fixed)
  function setAnchor(hAnchor, vAnchor) {
    // After resize, where should old (0,0) be?
    // left-aligned: offsetX = 0 → padLeft = 0
    // centred:      offsetX = Math.round((newW - sW) / 2)
    // right-aligned: offsetX = newW - sW → padLeft = newW - sW
    // We keep current newW and newH, just redistribute the padding.
    var curNewW = Math.max(1, sW + padLeft + padRight);
    var curNewH = Math.max(1, sH + padTop  + padBottom);
    var totalHPad = curNewW - sW;
    var totalVPad = curNewH - sH;

    var newPadLeft, newPadRight, newPadTop, newPadBottom;

    if (hAnchor === 'L') {
      newPadLeft  = 0;
      newPadRight = totalHPad;
    } else if (hAnchor === 'R') {
      newPadRight = 0;
      newPadLeft  = totalHPad;
    } else { // C
      var half = Math.round(totalHPad / 2);
      newPadLeft  = half;
      newPadRight = totalHPad - half;
    }

    if (vAnchor === 'T') {
      newPadTop    = 0;
      newPadBottom = totalVPad;
    } else if (vAnchor === 'B') {
      newPadBottom = 0;
      newPadTop    = totalVPad;
    } else { // C
      var halfV = Math.round(totalVPad / 2);
      newPadTop    = halfV;
      newPadBottom = totalVPad - halfV;
    }

    setPadLeft(newPadLeft);
    setPadRight(newPadRight);
    setPadTop(newPadTop);
    setPadBottom(newPadBottom);
  }

  // ── Input helpers ────────────────────────────────────────────────────────
  function intOrZero(v) {
    var n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  }

  function inputStyle(hasError) {
    return {
      width: 68,
      padding: "4px 6px",
      border: "1px solid " + (hasError ? "var(--accent)" : "var(--line)"),
      borderRadius: "var(--radius-sm)",
      background: "var(--surface)",
      color: "var(--text-primary)",
      fontSize: "var(--text-sm)",
      fontFamily: "inherit",
      textAlign: "center"
    };
  }

  function labelStyle() {
    return { fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginBottom: 3 };
  }

  function numField(label, value, setter) {
    return h("label", {
        style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }
      },
      h("span", { style: labelStyle() }, label),
      h("input", {
        type: "number",
        value: value,
        onChange: function(e) { setter(intOrZero(e.target.value)); },
        style: inputStyle(false)
      })
    );
  }

  // ── Visual preview ───────────────────────────────────────────────────────
  // A simple SVG diagram: outer rect = new canvas, inner shaded rect = old
  // pattern content region.  Intersection is shown as a solid tint, overflow
  // as dimmed, new-empty area as white.
  var PV_W = 200, PV_H = 160;
  var PV_PAD = 12;

  var scaleX = (PV_W - PV_PAD * 2) / Math.max(newW, sW, 1);
  var scaleY = (PV_H - PV_PAD * 2) / Math.max(newH, sH, 1);
  var scale  = Math.min(scaleX, scaleY);

  // Old canvas position in preview space (offset = where old origin is in new grid)
  var pOldX = PV_PAD + Math.max(0, offsetX) * scale;
  var pOldY = PV_PAD + Math.max(0, offsetY) * scale;
  var pOldW = sW * scale;
  var pOldH = sH * scale;

  // New canvas in preview space (always starts at PV_PAD)
  var pNewX = PV_PAD + Math.max(0, -offsetX) * scale;
  var pNewY = PV_PAD + Math.max(0, -offsetY) * scale;
  var pNewW = newW * scale;
  var pNewH = newH * scale;

  // Intersection rect
  var pIsectX = Math.max(pOldX, pNewX);
  var pIsectY = Math.max(pOldY, pNewY);
  var pIsectW = Math.max(0, Math.min(pOldX + pOldW, pNewX + pNewW) - pIsectX);
  var pIsectH = Math.max(0, Math.min(pOldY + pOldH, pNewY + pNewH) - pIsectY);

  var preview = h("svg", {
      width: PV_W, height: PV_H,
      viewBox: "0 0 " + PV_W + " " + PV_H,
      style: { border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--surface-secondary)", display: "block", flexShrink: 0, overflow: "hidden" }
    },
    // Old canvas region (the bit being cropped) — dimmed
    h("rect", { x: pOldX, y: pOldY, width: pOldW, height: pOldH, fill: "var(--accent)", opacity: 0.18 }),
    // New canvas outline
    h("rect", { x: pNewX, y: pNewY, width: pNewW, height: pNewH, fill: "none", stroke: "var(--accent)", strokeWidth: 1.5 }),
    // Intersection (what survives) — solid tint
    pIsectW > 0 && pIsectH > 0 && h("rect", { x: pIsectX, y: pIsectY, width: pIsectW, height: pIsectH, fill: "var(--accent)", opacity: 0.35 }),
    // Labels
    h("text", { x: pNewX + 3, y: pNewY + 11, fontSize: 8, fill: "var(--accent)", fontWeight: 600 }, newW + "\xD7" + newH),
    pIsectW > 0 && pIsectH > 0 && h("text", { x: pIsectX + pIsectW / 2, y: pIsectY + pIsectH / 2 + 4, fontSize: 8, fill: "var(--text-primary)", textAnchor: "middle" }, keptCols + "\xD7" + keptRows + " kept")
  );

  // ── Anchor grid ──────────────────────────────────────────────────────────
  var ANCHORS = [
    { h: 'L', v: 'T', label: 'Top left' },
    { h: 'C', v: 'T', label: 'Top centre' },
    { h: 'R', v: 'T', label: 'Top right' },
    { h: 'L', v: 'C', label: 'Middle left' },
    { h: 'C', v: 'C', label: 'Centre' },
    { h: 'R', v: 'C', label: 'Middle right' },
    { h: 'L', v: 'B', label: 'Bottom left' },
    { h: 'C', v: 'B', label: 'Bottom centre' },
    { h: 'R', v: 'B', label: 'Bottom right' },
  ];

  function isActiveAnchor(hA, vA) {
    var expectedL, expectedT;
    var curNewW = Math.max(1, sW + padLeft + padRight);
    var curNewH = Math.max(1, sH + padTop  + padBottom);
    var totalH = curNewW - sW;
    var totalV = curNewH - sH;
    if (hA === 'L') expectedL = 0;
    else if (hA === 'R') expectedL = totalH;
    else expectedL = Math.round(totalH / 2);
    if (vA === 'T') expectedT = 0;
    else if (vA === 'B') expectedT = totalV;
    else expectedT = Math.round(totalV / 2);
    return padLeft === expectedL && padTop === expectedT;
  }

  var anchorGrid = h("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 24px)",
        gridTemplateRows: "repeat(3, 24px)",
        gap: 3
      }
    },
    ANCHORS.map(function(a) {
      var active = isActiveAnchor(a.h, a.v);
      return h("button", {
          key: a.h + a.v,
          type: "button",
          title: a.label,
          "aria-label": a.label,
          onClick: function() { setAnchor(a.h, a.v); },
          style: {
            width: 24, height: 24,
            border: "1.5px solid " + (active ? "var(--accent)" : "var(--line)"),
            borderRadius: 4,
            background: active ? "var(--accent)" : "var(--surface)",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center"
          }
        },
        h("span", {
          style: {
            width: 8, height: 8,
            border: "1.5px solid " + (active ? "var(--surface)" : "var(--text-secondary)"),
            borderRadius: 1,
            display: "block"
          }
        })
      );
    })
  );

  // ── Layout styles ────────────────────────────────────────────────────────
  var backdropStyle = {
    position: "fixed", inset: 0, zIndex: 2100,
    background: "rgba(0,0,0,0.72)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16
  };

  var wrapStyle = {
    width: "100%", maxWidth: 560,
    background: "var(--surface)",
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.24)"
  };

  var headerStyle = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 14px",
    borderBottom: "1px solid var(--line)",
    flexShrink: 0
  };

  var bodyStyle = {
    padding: "16px 16px 0",
    display: "flex", flexDirection: "column", gap: 16
  };

  var footerStyle = {
    display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
    padding: "12px 16px",
    borderTop: "1px solid var(--line)",
    marginTop: 16
  };

  var sectionLabelStyle = {
    fontSize: "var(--text-xs)", fontWeight: 600,
    color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em",
    marginBottom: 8
  };

  var smallBtnStyle = {
    background: "none", border: "none", cursor: "pointer",
    color: "var(--text-secondary)", padding: 4,
    display: "inline-flex", alignItems: "center"
  };

  // ── Warning section ──────────────────────────────────────────────────────
  var warning = null;
  if (isDestructive || progressAffected) {
    var msgs = [];
    if (droppedCells > 0) {
      msgs.push(droppedCells + " stitch cell" + (droppedCells !== 1 ? "s" : "") + " will be permanently removed.");
    }
    if (progressAffected) {
      msgs.push("Progress tracking will lose data for removed stitches.");
    }
    warning = h("div", {
        style: {
          display: "flex", gap: 8, alignItems: "flex-start",
          background: "var(--surface-secondary)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-sm)",
          padding: "8px 10px",
          fontSize: "var(--text-sm)",
          color: "var(--text-primary)"
        }
      },
      h("span", { style: { color: "var(--accent)", flexShrink: 0, lineHeight: 1 } },
        Icons.warning ? Icons.warning() : null
      ),
      h("div", { style: { display: "flex", flexDirection: "column", gap: 3 } },
        msgs.map(function(m, i) { return h("span", { key: i }, m); })
      )
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return h("div", {
      style: backdropStyle,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Resize canvas"
    },
    h("div", { style: wrapStyle },

      // ── Header ────────────────────────────────────────────────────────────
      h("div", { style: headerStyle },
        h("span", {
          style: { fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)" }
        }, "Resize canvas"),
        h("button", {
          type: "button",
          onClick: props.onClose,
          style: smallBtnStyle,
          "aria-label": "Cancel"
        }, Icons.x ? Icons.x() : "\u00D7")
      ),

      // ── Body ──────────────────────────────────────────────────────────────
      h("div", { style: bodyStyle },

        // Current dimensions reminder
        h("div", { style: { fontSize: "var(--text-sm)", color: "var(--text-secondary)" } },
          "Current size: ", h("strong", { style: { color: "var(--text-primary)" } }, sW + "\xD7" + sH),
          " \u2014 New size: ", h("strong", { style: { color: "var(--text-primary)" } }, newW + "\xD7" + newH)
        ),

        // Controls row: padding inputs + anchor grid + preview
        h("div", { style: { display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" } },

          // Left: padding controls
          h("div", { style: { display: "flex", flexDirection: "column", gap: 10, flex: "1 1 180px" } },

            h("div", null,
              h("div", { style: sectionLabelStyle }, "Add / remove rows and columns"),
              h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 } },
                // Top padding
                h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 } },
                  numField("Top", padTop, setPadTop)
                ),
                // Middle row: Left | Anchor | Right
                h("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                  numField("Left", padLeft, setPadLeft),
                  h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 } },
                    h("div", { style: sectionLabelStyle }, "Anchor"),
                    anchorGrid
                  ),
                  numField("Right", padRight, setPadRight)
                ),
                // Bottom padding
                numField("Bottom", padBottom, setPadBottom)
              )
            )
          ),

          // Right: preview diagram
          h("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: "0 0 auto" } },
            h("div", { style: sectionLabelStyle }, "Preview"),
            preview,
            h("div", { style: { fontSize: "var(--text-xs)", color: "var(--text-secondary)" } },
              h("span", { style: { display: "inline-block", width: 10, height: 10, background: "var(--accent)", opacity: 0.35, marginRight: 4, verticalAlign: "middle" } }),
              "Kept",
              h("span", { style: { display: "inline-block", width: 10, height: 10, background: "var(--accent)", opacity: 0.18, marginRight: 4, marginLeft: 10, verticalAlign: "middle" } }),
              "Removed"
            )
          )
        ),

        // Warning
        warning
      ),

      // ── Footer ────────────────────────────────────────────────────────────
      h("div", { style: footerStyle },
        h("button", {
          type: "button",
          onClick: props.onClose,
          style: {
            padding: "6px 14px",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface)",
            color: "var(--text-primary)",
            fontSize: "var(--text-sm)",
            cursor: "pointer",
            fontFamily: "inherit"
          }
        }, "Cancel"),
        h("button", {
          type: "button",
          disabled: isIdentity,
          onClick: function() {
            if (typeof props.onApply === "function") {
              props.onApply({ newW: newW, newH: newH, offsetX: offsetX, offsetY: offsetY });
            }
          },
          style: {
            padding: "6px 16px",
            border: "none",
            borderRadius: "var(--radius-sm)",
            background: isDestructive ? "var(--error, #c0392b)" : "var(--accent)",
            color: "#fff",
            fontSize: "var(--text-sm)",
            cursor: isIdentity ? "not-allowed" : "pointer",
            opacity: isIdentity ? 0.5 : 1,
            fontFamily: "inherit",
            fontWeight: 600
          }
        }, isDestructive ? "Apply resize (removes stitches)" : "Apply resize")
      )
    )
  );
};
