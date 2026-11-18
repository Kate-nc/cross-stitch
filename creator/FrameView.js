/* creator/FrameView.js — Frame the picture: the first part of Convert
   (reports/create-from-image-workflow, Phase B).

   A picture just added opens here, full width, before any pattern setting:
   crop it (Free, Square, 4:3 or 3:4), turn it, and check what the Creator
   took it for and its background, with fixes to the picture folded away
   (creator/ConvertPanel.js CreatorPictureSections). Each crop or turn is
   applied straight away, so the type and background are worked out again
   from what is kept (useProjectIO.examinePicture); Undo puts the previous
   picture back. Continue (applying a rectangle still drawn) goes on to the
   preview and the Size, Threads and Detail steps; Reframe, beside the
   picture there, comes back. Preferences > Pattern Creator > Start with
   Frame the picture turns off opening here.

   Reuses the crop pointer handlers, applyCrop and replacePicture from
   useCanvasInteraction (GenerationContext). Exposes window.CreatorFrameView,
   plus CROP_RATIOS and rotatePictureCanvas. */

// The crop shapes, as width / height (null: any shape).
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

// Pictures smaller than this (pixel art, icons) are shown larger, with hard
// pixel edges, so they can be seen and cropped; at their own size a 9×7
// sprite was a dot. The crop maps from the size shown, so it stays exact.
window.FRAME_SMALL_PICTURE_PX = 360;
window.framePictureMinSize = function framePictureMinSize(w, h) {
  if (!w || !h || Math.max(w, h) >= window.FRAME_SMALL_PICTURE_PX) return {};
  var px = window.FRAME_SMALL_PICTURE_PX + "px";
  // The longer side grows; the shorter one follows the picture's shape.
  // Capped by the screen, not the box: the box shrinks to fit the picture.
  return w >= h ? { minWidth: "min(" + px + ", 80vw)" } : { minHeight: "min(" + px + ", 50vh)" };
};

// The CSS filter that shows brightness, contrast and saturation on the
// picture as Generate applies them (useCreatorState: brightness((100+bri)%)…).
window.framePictureFilter = function framePictureFilter(bri, con, sat) {
  if (!bri && !con && !sat) return "none";
  return "brightness(" + (100 + (bri || 0)) + "%) contrast(" + (100 + (con || 0)) + "%) saturate(" + (100 + (sat || 0)) + "%)";
};

// Reframe, beside the picture in Convert: back to Frame the picture.
window.CreatorReframeButton = function CreatorReframeButton() {
  var gen = window.useGeneration();
  return React.createElement("button", {
    type: "button", className: "cvp-source__btn", "data-reframe": "",
    title: "Crop or turn the picture, and check its type and background",
    onClick: function () { gen.setConvertStage("frame"); }
  }, "Reframe");
};

window.CreatorFrameView = function CreatorFrameView(props) {
  var gen = window.useGeneration();
  var pd = window.usePatternData ? window.usePatternData() : null;
  var h = React.createElement;
  var Icons = window.Icons || {};

  var _shape = React.useState("free"); var shape = _shape[0], setShape = _shape[1];
  // Pictures before each crop or turn, newest last, for Undo.
  var _hist = React.useState([]); var history = _hist[0], setHistory = _hist[1];
  // The picture Frame itself last put in place (a crop, turn or Undo). Any
  // other new picture (Change picture) starts a fresh Undo list, so Undo
  // never brings back a different picture.
  var ownImgRef = React.useRef(gen.img);
  React.useEffect(function () {
    if (gen.img === ownImgRef.current) return;
    ownImgRef.current = gen.img;
    setHistory([]); setShape("free");
    if (gen.cropRatioRef) gen.cropRatioRef.current = null;
  }, [gen.img]); // eslint-disable-line react-hooks/exhaustive-deps
  function mine(img) { ownImgRef.current = img; }

  // Dragging crops, except while the background colour is being picked:
  // then a click on the picture picks it (srcClick).
  React.useEffect(function () {
    gen.setIsCropping(!gen.pickBg);
  }, [gen.pickBg]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(function () {
    return function () {
      gen.setIsCropping(false); gen.setCropRect(null);
      if (gen.cropRatioRef) gen.cropRatioRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  var rect = gen.cropRect;
  var cropReady = !!(rect && rect.w >= 10 && rect.h >= 10);

  function ratioOf(id) {
    var r = window.CROP_RATIOS.filter(function (x) { return x.id === id; })[0];
    return r ? r.ratio : null;
  }
  // The largest rectangle of the chosen shape, centred on the picture shown.
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
  function remember() { var prev = gen.img; setHistory(function (hs) { return hs.concat([prev]).slice(-10); }); }
  function applyRect() {
    if (!cropReady) return false;
    remember();
    var ok = gen.applyCrop({ onDone: mine });
    setShape("free");
    if (gen.cropRatioRef) gen.cropRatioRef.current = null;
    return ok;
  }
  function turn(by) {
    remember();
    var keep = shape;
    gen.setCropRect(null);
    gen.applyCrop({ source: window.rotatePictureCanvas(gen.img, by), whole: true, onDone: function (img) {
      mine(img);
      // A shape chosen before turning starts again on the turned picture.
      if (keep !== "free") window.requestAnimationFrame(function () { startShape(keep); });
    } });
  }
  function undo() {
    if (!history.length) return;
    var prev = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setShape("free");
    if (gen.cropRatioRef) gen.cropRatioRef.current = null;
    mine(prev);
    gen.replacePicture(prev);
  }
  function clearRect() {
    gen.setCropRect(null);
    setShape("free");
    if (gen.cropRatioRef) gen.cropRatioRef.current = null;
  }
  function next() {
    // A rectangle drawn but not applied is what the user meant to keep.
    if (cropReady) applyRect();
    if (gen.pickBg) gen.setPickBg(false);
    gen.setConvertStage("make");
  }

  // Enter applies the crop; Escape stops picking the background colour,
  // or clears the rectangle. Not while typing.
  var keysRef = React.useRef(null);
  keysRef.current = { applyRect: applyRect, clearRect: clearRect, rect: cropReady, pickBg: gen.pickBg, setPickBg: gen.setPickBg };
  React.useEffect(function () {
    function onKey(e) {
      var t = e.target, tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
      // Keys in a dialog over Frame (Help, Preferences, a rename) are the
      // dialog's: Escape closes it rather than clearing the crop.
      if (t && t.closest && t.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')) return;
      var k = keysRef.current;
      // Enter on a button presses that button.
      if (e.key === "Enter" && k.rect && tag !== "BUTTON") { e.preventDefault(); k.applyRect(); }
      else if (e.key === "Escape" && (k.pickBg || k.rect)) {
        e.preventDefault(); e.stopPropagation();
        if (k.pickBg) k.setPickBg(false); else k.clearRect();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return function () { window.removeEventListener("keydown", onKey, true); };
  }, []);
  // The phone top bar's Continue does the same as the one in the panel.
  var nextRef = React.useRef(next); nextRef.current = next;
  React.useEffect(function () {
    function onContinue() { nextRef.current(); }
    window.addEventListener("cs:frameContinue", onContinue);
    return function () { window.removeEventListener("cs:frameContinue", onContinue); };
  }, []);

  if (!gen.img || !gen.img.src) return null;
  var hasChart = !!(pd && pd.pat);
  var w = gen.origW || gen.img.naturalWidth || gen.img.width, hh = gen.origH || gen.img.naturalHeight || gen.img.height;
  var small = Math.max(w, hh) < window.FRAME_SMALL_PICTURE_PX;

  var hint = gen.pickBg ? "Click the background in the picture to choose its colour."
    : cropReady ? "Apply the crop, or drag again. Escape clears it."
    : shape !== "free" ? "Drag on the picture to draw a new " + (shape === "square" ? "square" : shape) + " area."
    : "Drag on the picture to crop it to the part you want to stitch.";

  var tools = h("div", { className: "fr-tools" },
    h("div", { className: "lp-segmented cv-seg fr-shapes", role: "radiogroup", "aria-label": "Crop shape" },
      window.CROP_RATIOS.map(function (r) {
        var on = r.id === shape;
        return h("button", {
          key: r.id, type: "button", role: "radio", "aria-checked": on ? "true" : "false",
          className: "lp-seg" + (on ? " lp-seg--on" : ""), title: r.title || r.label,
          "data-crop-shape": r.id, onClick: function () { chooseShape(r.id); }
        }, r.label);
      })),
    h("div", { className: "fr-tools__group" },
      h("button", { type: "button", className: "cs-seltools__btn", onClick: function () { turn(-1); }, "aria-label": "Turn left" },
        Icons.rotateCcw ? Icons.rotateCcw() : null, h("span", null, "Turn left")),
      h("button", { type: "button", className: "cs-seltools__btn", onClick: function () { turn(1); }, "aria-label": "Turn right" },
        Icons.rotateCw ? Icons.rotateCw() : null, h("span", null, "Turn right")),
      h("button", { type: "button", className: "cs-seltools__btn", onClick: undo, disabled: !history.length, "aria-label": "Undo crop or turn", title: "Undo the last crop or turn" },
        Icons.undo ? Icons.undo() : null, h("span", null, "Undo")),
      props && props.onChangePicture && h("button", { type: "button", className: "cs-seltools__btn", onClick: props.onChangePicture },
        Icons.image ? Icons.image() : null, h("span", null, "Change picture"))));

  var picture = h("div", { id: "bg-pick-target", className: "fr-picture" + (gen.pickBg ? " fr-picture--pick" : "") },
    h("div", {
      ref: gen.cropRef, className: "fr-picture__crop",
      onPointerDown: gen.handleCropPointerDown,
      onPointerMove: gen.handleCropPointerMove,
      onPointerUp: gen.handleCropPointerUp,
      onPointerCancel: gen.handleCropPointerCancel,
      onLostPointerCapture: gen.handleCropPointerCancel
    },
      h("img", {
        src: gen.img.src, alt: "Your picture", draggable: false,
        onDragStart: function (e) { e.preventDefault(); },
        onClick: gen.pickBg ? gen.srcClick : undefined,
        className: "fr-picture__img" + (small ? " fr-picture__img--small" : ""),
        style: Object.assign({ filter: window.framePictureFilter(gen.bri, gen.con, gen.sat) }, window.framePictureMinSize(w, hh))
      }),
      rect && h("div", { className: "fr-picture__rect", "data-crop-rect": "",
        style: { left: rect.x, top: rect.y, width: rect.w, height: rect.h } })));

  var cropBar = h("div", { className: "fr-cropbar" },
    h("span", { className: "fr-cropbar__hint", role: "status" }, hint),
    h("span", { className: "fr-cropbar__size" }, w + "×" + hh + "px"),
    cropReady && h("button", { type: "button", className: "cs-seltools__btn", onClick: clearRect }, "Clear"),
    cropReady && h("button", { type: "button", className: "cs-seltools__btn cs-seltools__btn--on", onClick: applyRect },
      Icons.crop ? Icons.crop() : null, h("span", null, "Apply crop")));

  return h("div", { className: "fr-layout", "data-frame-view": "" },
    h("div", { className: "fr-stage" }, tools, picture, cropBar),
    h("aside", { className: "fr-panel", "aria-labelledby": "fr-title" },
      h("div", { className: "fr-panel__head" },
        h("h2", { id: "fr-title", className: "fr-panel__title" }, "Frame your picture"),
        h("p", { className: "cs-toolsec__hint" }, "Crop to the part you want to stitch and check what the Creator took it for. Next come the size, threads and detail."),
        hasChart && h("p", { className: "cs-toolsec__hint fr-panel__chart-note", "data-frame-chart-note": "" },
          "Your chart stays as it is until you Regenerate, so its edits and stitching are safe while you try a new crop.")),
      h("div", { className: "fr-panel__body" },
        window.CreatorPictureSections ? h(window.CreatorPictureSections, null) : null),
      h("footer", { className: "fr-footer" },
        h("button", { type: "button", className: "fr-continue", "data-onboard": "frame-continue", onClick: next },
          h("span", null, "Continue"), Icons.chevronRight ? Icons.chevronRight() : null),
        h("p", { className: "cs-toolsec__hint fr-footer__note" }, "Reframe, beside your picture, brings you back here."))));
};
