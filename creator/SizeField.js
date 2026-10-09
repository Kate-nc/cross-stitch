/* creator/SizeField.js — the pattern's size, in stitches or as a finished
 * size (audit IMG-03).
 *
 * Replaces the Size slider in Convert > Size & fabric:
 *   - Stitches: width × height, with the aspect lock;
 *   - Finished size: width or height in the user's unit (cm, or inches for
 *     US English) on the current fabric, converted with stitchesForLength
 *     (pattern-size-calc.js);
 *   - chips that fit the picture to a Bookmark (5 × 18 cm), Card (5 × 7 in),
 *     15 cm hoop or A4, or use the Picture size (1 stitch per pixel, scaled
 *     evenly to stay between 10 and 500);
 *   - a readout with stitches and finished size, and notes when a very wide
 *     or tall picture leaves a thin short side, or when the pattern has more
 *     stitches than the picture has pixels.
 *
 * Props: sW, sH, chgW, chgH, arLock, setArLock, ar, fabricCt, origW, origH.
 * chgW / chgH keep the 10–500 limits and the aspect lock.
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 */

(function () {
  var FRAMES = [
    { id: "bookmark", label: "Bookmark", w: 5, h: 18, unit: "cm" },
    { id: "card",     label: "Card",     w: 5, h: 7,  unit: "in" },
    { id: "hoop15",   label: "15 cm hoop", hoop: 15,  unit: "cm" },
    { id: "a4",       label: "A4",       w: 21, h: 29.7, unit: "cm" }
  ];
  window.SIZE_FIELD_FRAMES = FRAMES;

  // The size a frame chip sets, for a picture with aspect ratio ar
  // (width / height). A hoop holds the largest rectangle that fits inside
  // its circle.
  function frameSize(frame, ar, fabricCt) {
    var fw = frame.w, fh = frame.h;
    if (frame.hoop) {
      var a = ar > 0 ? ar : 1;
      var k = frame.hoop / Math.sqrt(1 + a * a);
      fw = a * k; fh = k;
    }
    return window.fitPatternToFrame(fw, fh, frame.unit, ar, fabricCt);
  }
  window.sizeFieldFrameSize = frameSize;

  // 1 stitch per pixel, scaled evenly to stay within 10–500
  // (pattern-size-calc.js pictureStitchSize).
  function pictureSize(origW, origH) {
    return window.pictureStitchSize(origW, origH);
  }
  window.sizeFieldPictureSize = pictureSize;

  function fmtLength(v) {
    var r = Math.round(v * 10) / 10;
    return String(r);
  }

  // A number input that can be typed into freely and commits once the value
  // is in range, or on blur / Enter (clamped by the caller).
  function DraftNumber(props) {
    var h = React.createElement;
    var _t = React.useState(null); var text = _t[0], setText = _t[1];
    function commit(raw) {
      var n = parseFloat(raw);
      if (isFinite(n) && n > 0) props.onCommit(n);
    }
    return h("input", {
      type: "number", inputMode: "decimal", step: props.step || 1, min: props.min, max: props.max,
      className: "size-field__input", "aria-label": props.label,
      value: text != null ? text : props.value,
      onChange: function (e) {
        setText(e.target.value);
        var n = parseFloat(e.target.value);
        if (isFinite(n) && n >= props.min && n <= props.max) props.onCommit(n);
      },
      onBlur: function (e) { commit(e.target.value); setText(null); },
      onKeyDown: function (e) { if (e.key === "Enter") { commit(e.target.value); setText(null); } }
    });
  }

  window.CreatorSizeField = function CreatorSizeField(props) {
    var h = React.createElement;
    var _mode = React.useState("stitches"); var mode = _mode[0], setMode = _mode[1];
    var unit = (typeof window.preferredUnits === "function" && window.preferredUnits() === "imperial") ? "in" : "cm";
    var ct = props.fabricCt || 14;
    var sW = props.sW, sH = props.sH;

    function setStitches(w, hgt) {
      if (props.arLock) { props.chgW(w); return; }
      if (w != null) props.chgW(w);
      if (hgt != null) props.chgH(hgt);
    }
    function applyFrame(f) {
      var s = frameSize(f, props.ar, ct);
      setStitches(s.w, s.h);
    }
    var pic = pictureSize(props.origW, props.origH);

    var modes = [{ id: "stitches", label: "Stitches" }, { id: "finished", label: "Finished size" }];
    var modeSwitch = h("div", { className: "lp-segmented size-field__mode", role: "radiogroup", "aria-label": "Size in" },
      modes.map(function (m, i) {
        var on = mode === m.id;
        return h("button", {
          key: m.id, type: "button", role: "radio", "aria-checked": on ? "true" : "false",
          className: "lp-seg" + (on ? " lp-seg--on" : ""), "data-size-mode": m.id, tabIndex: on ? 0 : -1,
          onClick: function () { setMode(m.id); },
          onKeyDown: function (e) {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(e.key) === -1) return;
            e.preventDefault();
            var next = modes[1 - i].id;
            setMode(next);
            var sib = e.currentTarget.parentNode && e.currentTarget.parentNode.querySelector('[data-size-mode="' + next + '"]');
            if (sib) sib.focus();
          }
        }, m.label);
      })
    );

    var fields;
    if (mode === "stitches") {
      fields = h("div", { className: "size-field__row" },
        h("label", { className: "size-field__label" }, "Width",
          h(DraftNumber, { label: "Width in stitches", value: sW, min: 10, max: 500, onCommit: function (n) { props.chgW(n); } })),
        h("span", { className: "size-field__x", "aria-hidden": "true" }, "×"),
        h("label", { className: "size-field__label" }, "Height",
          h(DraftNumber, { label: "Height in stitches", value: sH, min: 10, max: 500, onCommit: function (n) { props.chgH(n); } })),
        h("span", { className: "size-field__unit" }, "stitches")
      );
    } else {
      var minLen = window.lengthForStitches(10, unit, ct), maxLen = window.lengthForStitches(500, unit, ct);
      fields = h("div", { className: "size-field__row" },
        h("label", { className: "size-field__label" }, "Width",
          h(DraftNumber, { label: "Finished width in " + unit, step: 0.1, min: minLen, max: maxLen,
            value: fmtLength(window.lengthForStitches(sW, unit, ct)),
            onCommit: function (n) { props.chgW(window.stitchesForLength(n, unit, ct)); } })),
        h("span", { className: "size-field__x", "aria-hidden": "true" }, "×"),
        h("label", { className: "size-field__label" }, "Height",
          h(DraftNumber, { label: "Finished height in " + unit, step: 0.1, min: minLen, max: maxLen,
            value: fmtLength(window.lengthForStitches(sH, unit, ct)),
            onCommit: function (n) { props.chgH(window.stitchesForLength(n, unit, ct)); } })),
        h("span", { className: "size-field__unit" }, unit)
      );
    }

    var notes = window.patternSizeNotes(sW, sH, props.origW, props.origH);
    var noteEls = [];
    if (notes.shortSide) {
      noteEls.push(h("p", { key: "short", className: "size-field__note", "data-size-note": "short-side" },
        "This picture is very " + notes.shortSide.orientation + ". The short side will only be " +
        notes.shortSide.stitches + " stitches; consider cropping."));
    }
    if (notes.enlarged) {
      var e = notes.enlarged;
      noteEls.push(h("p", { key: "enlarged", className: "size-field__note", "data-size-note": "enlarged" },
        "Your picture is only " + e.px + " px " + e.axis + (e.block >= 2
          ? "; each pixel will become a " + e.block + " × " + e.block + " block."
          : "; it will be stretched to fit, so it may look soft.")));
    }

    return h("div", { className: "size-field" },
      modeSwitch,
      h("label", { className: "size-field__lock" },
        h("input", { type: "checkbox", checked: !!props.arLock, onChange: function (ev) { props.setArLock(ev.target.checked); } }),
        "Lock aspect ratio"),
      fields,
      h("div", { className: "size-field__chips", role: "group", "aria-label": "Size presets" },
        FRAMES.map(function (f) {
          return h("button", { key: f.id, type: "button", className: "size-field__chip", "data-size-preset": f.id,
            onClick: function () { applyFrame(f); } }, f.label);
        }),
        h("button", { type: "button", className: "size-field__chip", "data-size-preset": "picture", disabled: !pic,
          title: "One stitch per pixel, scaled evenly to stay between 10 and 500 stitches",
          onClick: function () { if (pic) setStitches(pic.w, pic.h); } }, "Picture size")
      ),
      h("p", { className: "size-field__readout", "data-size-readout": "" },
        sW + " × " + sH + " stitches · " + window.finishedSizeText(sW, sH, ct)),
      noteEls
    );
  };
})();
