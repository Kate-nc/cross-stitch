/* creator/TextToolSheet.js — the text tool's sheet (audit DRAW-04 item 5).
 *
 * Tapping the chart with the Text tool opens this sheet (state.textSheet
 * holds the tapped stitch). As you type, the text is shown on the chart as a
 * floating selection in the current colour (useSelectionClipboard
 * floatClip / replaceClip), built from the bitmap fonts in stitchFonts.js.
 * Place closes the sheet and leaves the text floating, to drag into
 * position and finish with Done; Cancel removes it. Once placed it is
 * ordinary cross stitches, no longer editable as text.
 *
 * Text wider than the pattern gets a warning with Resize canvas and Use a
 * smaller font. The sheet isn't modal, so the chart stays usable: on phones
 * it sits at the bottom above the tool rail, on wider screens it's a card.
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 */
window.CreatorTextToolSheet = function CreatorTextToolSheet() {
  var h = React.createElement;
  // The font settings last chosen, for the next sheet (the text starts empty).
  var LAST = window.CreatorTextToolSheet.last;
  var cv = window.useCanvas();
  var app = window.useApp();
  var ctx = window.usePatternData();
  var SF = window.StitchFonts;
  var at = cv.textSheet;
  var clip = cv.clip;

  // The sheet's contents live in state.textSheet with the tapped stitch, not
  // in this component: the Pattern tab unmounts on other tabs, and coming
  // back must find the text as it was, still floating. `floating` says the
  // float on the chart is this text's.
  var text = at && at.text || "";
  var fontId = at && at.fontId || LAST.fontId;
  var letterSpacing = at && at.letterSpacing != null ? at.letterSpacing : LAST.letterSpacing;
  var lineSpacing = at && at.lineSpacing != null ? at.lineSpacing : LAST.lineSpacing;
  var align = at && at.align || LAST.align;
  var inputRef = React.useRef(null);
  var floatingRef = React.useRef(false);
  floatingRef.current = !!(at && at.floating);

  function update(patch) {
    if (!cv.setTextSheet) return;
    cv.setTextSheet(function (t) { return t ? Object.assign({}, t, patch) : t; });
  }
  function setting(key) {
    return function (v) { LAST[key] = v; var p = {}; p[key] = v; update(p); };
  }
  var setFontId = setting("fontId"), setLetterSpacing = setting("letterSpacing"),
    setLineSpacing = setting("lineSpacing"), setAlign = setting("align");

  var open = !!at && !!SF && app.tab === "pattern";
  var colour = cv.selectedColorId && ctx.cmap ? ctx.cmap[cv.selectedColorId] : null;
  var opts = { letterSpacing: letterSpacing, lineSpacing: lineSpacing, align: align };
  var rendered = open && text ? SF.renderText(text, fontId, opts) : null;
  var width = rendered ? rendered.w : 0;
  var tooWide = !!rendered && width > ctx.sW;

  // Each change re-draws the floating text where it is.
  React.useEffect(function () {
    if (!open || !clip) return;
    if (!rendered || !rendered.cells.length || !colour) {
      if (floatingRef.current && clip.floatActive) clip.cancel();
      if (floatingRef.current) update({ floating: false });
      floatingRef.current = false;
      return;
    }
    var c = SF.textClip(rendered, Object.assign({}, colour));
    if (floatingRef.current && clip.floatActive) clip.replaceClip(c);
    else if (clip.floatClip(c, at.x, at.y, "text")) { floatingRef.current = true; update({ floating: true }); }
  }, [open, text, fontId, letterSpacing, lineSpacing, align, colour && colour.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The float was placed or cancelled from its own bar (or Esc / Undo /
  // another tool): the sheet's job is done.
  React.useEffect(function () {
    if (floatingRef.current && clip && !clip.floatActive) {
      floatingRef.current = false;
      if (cv.setTextSheet) cv.setTextSheet(null);
    }
  }, [clip && clip.floatActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Another tool picked before any text was typed: the sheet goes with it.
  // (Once text floats the tool is "float", and leaving that places it.)
  React.useEffect(function () {
    if (at && cv.activeTool !== "text" && cv.activeTool !== "float" && cv.setTextSheet) cv.setTextSheet(null);
  }, [cv.activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the text box when the sheet appears.
  React.useEffect(function () {
    if (!open) return undefined;
    var t = setTimeout(function () { try { inputRef.current && inputRef.current.focus(); } catch (_) {} }, 30);
    return function () { clearTimeout(t); };
  }, [open, at && at.x, at && at.y]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  function close() { if (cv.setTextSheet) cv.setTextSheet(null); }
  function cancel() {
    if (floatingRef.current && clip && clip.floatActive) clip.cancel();
    floatingRef.current = false;
    close();
  }
  function place() {
    // Leave the text floating for dragging; Done on its bar places it.
    floatingRef.current = false;
    close();
  }
  function smaller() {
    if (fontId !== "block") { setFontId("block"); return; }
    if (letterSpacing > 0) setLetterSpacing(0);
  }
  var canShrink = fontId !== "block" || letterSpacing > 0;

  function stepper(label, value, set, min, max) {
    return h("div", { className: "cs-textsheet__row" },
      h("span", { className: "cs-textsheet__label" }, label),
      h("div", { className: "cs-textsheet__stepper", role: "group", "aria-label": label },
        h("button", { type: "button", "aria-label": "Less " + label.toLowerCase(), disabled: value <= min,
          onClick: function () { set(Math.max(min, value - 1)); } }, window.Icons.minus()),
        h("span", { "aria-live": "polite" }, value),
        h("button", { type: "button", "aria-label": "More " + label.toLowerCase(), disabled: value >= max,
          onClick: function () { set(Math.min(max, value + 1)); } }, window.Icons.plus())
      )
    );
  }
  function segmented(label, value, set, options) {
    return h("div", { className: "cs-textsheet__row" },
      h("span", { className: "cs-textsheet__label" }, label),
      h("div", { role: "radiogroup", "aria-label": label, className: "cs-textsheet__seg" },
        options.map(function (o) {
          var on = value === o[0];
          return h("button", { key: o[0], type: "button", role: "radio", "aria-checked": on ? "true" : "false",
            className: on ? "is-on" : "", onClick: function () { set(o[0]); } }, o[1]);
        })
      )
    );
  }

  return h("div", { className: "cs-textsheet", role: "dialog", "aria-modal": "false", "aria-labelledby": "cs-textsheet-title",
      onKeyDown: function (e) { if (e.key === "Escape") { e.stopPropagation(); cancel(); } } },
    // Place sits in the header, so it's in reach without scrolling the
    // sheet on a phone.
    h("div", { className: "cs-textsheet__head" },
      h("span", { id: "cs-textsheet-title", className: "cs-textsheet__title" }, "Add text"),
      h("div", { className: "cs-textsheet__head-actions" },
        h("button", { type: "button", className: "cs-textsheet__btn cs-textsheet__btn--primary", disabled: !rendered || !colour,
          onClick: place }, "Place"),
        h("button", { type: "button", className: "cs-textsheet__close", "aria-label": "Cancel", onClick: cancel }, window.Icons.x())
      )
    ),
    h("textarea", {
      ref: inputRef, className: "cs-textsheet__input", rows: 2, value: text, maxLength: 200,
      placeholder: "Type a name, a date or a word", "aria-label": "Text",
      onChange: function (e) { update({ text: e.target.value }); },
      // Undo, redo and select-all belong to the text box while typing, not
      // to the chart (Ctrl+Z there would cancel the text being typed).
      onKeyDown: function (e) {
        var k = (e.key || "").toLowerCase();
        if ((e.ctrlKey || e.metaKey) && (k === "z" || k === "y" || k === "a")) e.stopPropagation();
      }
    }),
    !colour && h("p", { className: "cs-textsheet__note" }, "Choose a colour in the palette first."),
    segmented("Font", fontId, setFontId, [["block", "Block"], ["serif", "Serif"]]),
    stepper("Letter spacing", letterSpacing, setLetterSpacing, 0, 4),
    stepper("Line spacing", lineSpacing, setLineSpacing, 0, 4),
    segmented("Align", align, setAlign, [["left", "Left"], ["centre", "Centre"], ["right", "Right"]]),
    rendered && h("p", { className: "cs-textsheet__size" },
      width + " × " + rendered.h + " stitches, " + rendered.cells.length.toLocaleString() + " stitch" + (rendered.cells.length === 1 ? "" : "es")),
    rendered && rendered.missing.length > 0 && h("p", { className: "cs-textsheet__note" },
      "Not in this font, shown as a question mark: " + rendered.missing.join(" ")),
    tooWide && h("div", { className: "cs-textsheet__warn", role: "status" },
      h("span", { className: "cs-textsheet__warn-icon", "aria-hidden": "true" }, window.Icons.warning()),
      h("span", null, "This text is " + width + " stitches wide; your pattern is " + ctx.sW + "."),
      h("div", { className: "cs-textsheet__warn-actions" },
        h("button", { type: "button", onClick: function () { if (app.openResizeCanvas) app.openResizeCanvas(); } }, "Resize canvas"),
        canShrink && h("button", { type: "button", onClick: smaller }, "Use a smaller font")
      )
    ),
    h("p", { className: "cs-textsheet__hint" }, "After Place, drag the text into position and press Done.")
  );
};
window.CreatorTextToolSheet.last = { fontId: "block", letterSpacing: 1, lineSpacing: 1, align: "left" };
