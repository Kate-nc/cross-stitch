/* creator/StitchTypeChoice.js — "Stitch type" for a selection.
 *
 * Three buttons, Cross / Half / / Half \, that turn every stitch in the
 * selection into that stitch, keeping each one's colour
 * (cv.convertSelectionStitchType, StitchTypeConvert). The one matching the
 * whole selection is shown pressed; a mixed selection presses none.
 *
 * Used by the desktop rail's Selection menu, the right-click menu and the
 * Tools tab. (The touch selection bar has its own buttons, which act on
 * pointer-up like the rest of that bar: SelectionBar.js.) Props:
 *   labels   "always" (default) | "auto": "auto" hides the words on narrow
 *            screens and keeps the symbols (styles.css, .cs-sttype--auto).
 *   onPicked optional, called after a choice (menus close themselves).
 *   inMenu   true inside a role="menu": the buttons are menuitemradio with
 *            aria-checked, so the menu's items stay menu items.
 *   className extra class for the group.
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 */
window.CreatorStitchTypeChoice = function CreatorStitchTypeChoice(props) {
  var h = React.createElement;
  var cv = window.useCanvas();
  var I = window.Icons;
  var kind = cv.selectionStitchKind;
  var choices = [
    ["full", "Cross", "Make every stitch in the selection a cross stitch", I.stitchFull],
    ["half-fwd", "Half /", "Make every stitch in the selection a half stitch (/)", I.stitchHalfFwd],
    ["half-bck", "Half \\", "Make every stitch in the selection a half stitch (\\)", I.stitchHalfBck]
  ];
  return h("div", {
    role: "group", "aria-label": "Stitch type",
    className: "cs-sttype" + (props.labels === "auto" ? " cs-sttype--auto" : "") + (props.className ? " " + props.className : "")
  },
    choices.map(function (c) {
      var on = kind === c[0];
      return h("button", {
        key: c[0], type: "button", className: "cs-sttype__btn", "data-stitch-type": c[0],
        role: props.inMenu ? "menuitemradio" : undefined,
        "aria-pressed": props.inMenu ? undefined : (on ? "true" : "false"),
        "aria-checked": props.inMenu ? (on ? "true" : "false") : undefined,
        "aria-label": c[1], title: c[2],
        onPointerDown: function (e) { e.stopPropagation(); },
        onClick: function (e) {
          e.stopPropagation();
          if (cv.convertSelectionStitchType) cv.convertSelectionStitchType(c[0]);
          if (props.onPicked) props.onPicked(c[0]);
        }
      }, c[3](), h("span", { className: "cs-sttype__label" }, c[1]));
    })
  );
};
