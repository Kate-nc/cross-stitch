/* creator/FabricBlock.js — one Fabric block for the Creator (audit COMMON-08).
 *
 * The fabric a pattern is stitched on, saved with the pattern
 * (settings.fabricCt and settings.fabricColour):
 *   - count, grouped Aida (11–22) and Evenweave / linen, over two (25–32);
 *   - colour swatches (White, Antique white, Cream, Black, Navy, Custom);
 *   - finished size and a suggested cut size (5 cm / 2 in each side), in
 *     both unit systems with the preferred one first (pattern-size-calc.js).
 *
 * Used in Convert › Size & fabric, the Canvas tab and Edit › Project.
 *
 * window.CreatorFabricBlock(props): fabricCt, setFabricCt, fabricColour,
 * setFabricColour, sW, sH, showSizes (default true).
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 */

(function () {
  var FABRIC_COLOURS = [
    { id: "white",   label: "White",         hex: "#FFFFFF" },
    { id: "antique", label: "Antique white", hex: "#FAEBD7" },
    { id: "cream",   label: "Cream",         hex: "#FFF8E7" },
    { id: "black",   label: "Black",         hex: "#1A1A1A" },
    { id: "navy",    label: "Navy",          hex: "#1F2A44" }
  ];
  window.CREATOR_FABRIC_COLOURS = FABRIC_COLOURS;

  function isPreset(hex) {
    var u = String(hex || "").toUpperCase();
    return FABRIC_COLOURS.some(function (f) { return f.hex.toUpperCase() === u; });
  }

  window.CreatorFabricBlock = function CreatorFabricBlock(props) {
    var h = React.createElement;
    var Icons = window.Icons || {};
    var counts = (typeof FABRIC_COUNTS !== "undefined" ? FABRIC_COUNTS : window.FABRIC_COUNTS) || [];
    var aida = counts.filter(function (f) { return !f.over; });
    var even = counts.filter(function (f) { return f.over; });
    var ct = props.fabricCt || 14;
    var colour = props.fabricColour || "#FFFFFF";
    var sizes = (props.showSizes !== false && props.sW > 0 && props.sH > 0 && typeof window.fabricSizes === "function")
      ? window.fabricSizes(props.sW, props.sH, ct) : null;
    function opt(f) { return h("option", { key: f.ct, value: f.ct }, f.label.replace(/\s*\(over 2\)/, "")); }

    return h("div", { className: "fabric-block" },
      h("label", { className: "fabric-block__field" },
        h("span", { className: "fabric-block__label" }, "Fabric count"),
        h("select", {
          className: "fabric-block__select", value: ct,
          onChange: function (e) { if (props.setFabricCt) props.setFabricCt(Number(e.target.value)); }
        },
          h("optgroup", { label: "Aida" }, aida.map(opt)),
          even.length ? h("optgroup", { label: "Evenweave / linen, over two" }, even.map(opt)) : null
        )
      ),
      h("div", { className: "fabric-block__field" },
        h("span", { className: "fabric-block__label", id: "fabric-colour-label" }, "Fabric colour"),
        h("div", { className: "fabric-block__swatches", role: "group", "aria-labelledby": "fabric-colour-label" },
          FABRIC_COLOURS.map(function (f) {
            var on = colour.toUpperCase() === f.hex.toUpperCase();
            return h("button", {
              key: f.id, type: "button",
              className: "fabric-block__swatch" + (on ? " fabric-block__swatch--on" : ""),
              style: { background: f.hex },
              title: f.label, "aria-label": f.label, "aria-pressed": on ? "true" : "false",
              onClick: function () { if (props.setFabricColour) props.setFabricColour(f.hex); }
            });
          }),
          h("label", {
            className: "fabric-block__swatch fabric-block__swatch--custom" + (!isPreset(colour) ? " fabric-block__swatch--on" : ""),
            title: "Custom colour",
            style: !isPreset(colour) ? { background: colour } : null
          },
            h("span", { className: "fabric-block__custom-icon", "aria-hidden": "true" }, Icons.eyedropper ? Icons.eyedropper() : null),
            h("input", {
              type: "color", value: colour, "aria-label": "Custom fabric colour",
              onChange: function (e) { if (props.setFabricColour) props.setFabricColour(e.target.value.toUpperCase()); }
            })
          )
        )
      ),
      sizes ? h("dl", { className: "fabric-block__sizes" },
        h("dt", null, "Finished size"), h("dd", { "data-fabric-finished": "" }, sizes.finished),
        h("dt", null, "Cut fabric"), h("dd", { "data-fabric-cut": "" }, sizes.cut,
          h("span", { className: "fabric-block__note" }, sizes.units === "imperial" ? " with 2 in each side" : " with 5 cm each side"))
      ) : null
    );
  };
})();
