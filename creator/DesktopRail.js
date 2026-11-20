/* creator/DesktopRail.js — the tool-rail layout for Edit with a mouse (Stage 2).
 *
 * Behind the creator.desktopRail preference (Preferences > Pattern Creator >
 * Editing layout). With it on and a fine pointer:
 *   - CreatorDesktopRail: a 56px rail down the left edge with every drawing
 *     tool (creator/toolRegistry.js DESKTOP_RAIL), and at its foot the working
 *     thread's swatch (opens the Palette tab), Undo and Redo.
 *   - CreatorOptionsBar: one 44px row above the chart, replacing the toolbar
 *     pill, the colour row and the wand strip. What it shows depends on the
 *     tool; Zoom and Fit sit at its right end.
 * creator/ToolStrip.js renders both in place of the pill; creator-main.js sets
 * body.creator-drail-layout / body.creator-drail-tools for the CSS (styles.css,
 * "Desktop tool rail").
 *
 * Exposes window.useCreatorDesktopRail, window.creatorDesktopRailOn,
 * window.CreatorDesktopRail and window.CreatorOptionsBar.
 */
(function () {
  "use strict";

  var FINE_QUERY = "(pointer: fine)";

  function compactQuery() { return window.CREATOR_COMPACT_QUERY || "(max-width: 899px)"; }

  // On by default (Stage 2 D); Preferences turns it off for one release.
  function prefOn() {
    try { return !window.UserPrefs || window.UserPrefs.get("creator.desktopRail") !== false; } catch (_) { return true; }
  }
  function finePointer() {
    try {
      if (!window.matchMedia) return false;
      return window.matchMedia(FINE_QUERY).matches && !window.matchMedia(compactQuery()).matches;
    } catch (_) { return false; }
  }

  // True when the preference is on and this is a mouse at desktop width.
  window.creatorDesktopRailOn = function creatorDesktopRailOn() { return prefOn() && finePointer(); };

  window.useCreatorDesktopRail = function useCreatorDesktopRail() {
    var st = React.useState(window.creatorDesktopRailOn);
    var on = st[0], setOn = st[1];
    React.useEffect(function () {
      function update() { setOn(window.creatorDesktopRailOn()); }
      var mqs = [];
      if (window.matchMedia) {
        mqs = [window.matchMedia(FINE_QUERY), window.matchMedia(compactQuery())];
        mqs.forEach(function (mq) { if (mq.addEventListener) mq.addEventListener("change", update); else if (mq.addListener) mq.addListener(update); });
      }
      function onPref(e) { var k = e && e.detail && e.detail.key; if (k == null || k === "creator.desktopRail") update(); }
      window.addEventListener("cs:prefchange", onPref);
      update();
      return function () {
        mqs.forEach(function (mq) { if (mq.removeEventListener) mq.removeEventListener("change", update); else if (mq.removeListener) mq.removeListener(update); });
        window.removeEventListener("cs:prefchange", onPref);
      };
    }, []);
    return on;
  };

  var STITCH_TYPES = [
    ["cross", "Cross"],
    ["half-fwd", "Half /"],
    ["half-bck", "Half \\"],
    ["quarter", "¼ stitch"],
    ["three-quarter", "¾ stitch"],
    ["backstitch", "Backstitch"],
    ["knot", "French knot"]
  ];
  var BRUSH_SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  var SHAPES = [["line", "Line"], ["rect", "Rectangle"], ["ellipse", "Ellipse"]];

  function icon(name) {
    return window.Icons && typeof window.Icons[name] === "function" ? window.Icons[name]() : null;
  }
  function threadText(p, variant) {
    if (!p) return "";
    return typeof window.formatThread === "function" ? window.formatThread(p, variant ? { variant: variant } : undefined) : String(p.id);
  }
  function sortedPalette(ctx) {
    return (ctx.displayPal || ctx.pal || []).slice().sort(function (a, b) { return (b.count || 0) - (a.count || 0); });
  }

  function keepFocus(e) { if (e.button === 0) e.preventDefault(); }

  // Esc goes through the shared stack (keyboard-utils.js), so only the
  // topmost overlay closes: a menu or sheet here, or a dialog opened over it.
  function useEscapeWhile(open, close) {
    var ref = React.useRef(close); ref.current = close;
    var handler = React.useCallback(function () { ref.current(); }, []);
    if (typeof window.useEscape === "function") window.useEscape(open ? handler : null);
  }

  // Menus open with position: fixed (the options bar scrolls sideways when
  // a tool has many options, which would clip an absolutely placed menu).
  function menuSpot(el, side) {
    if (!el || !el.getBoundingClientRect) return { top: 96, left: 64 };
    var r = el.getBoundingClientRect();
    if (side === "right") return { top: Math.round(r.bottom + 4), right: Math.max(8, Math.round(window.innerWidth - r.right)) };
    if (side === "beside") return { top: Math.round(r.top), left: Math.round(r.right + 6) };
    return { top: Math.round(r.bottom + 4), left: Math.round(r.left) };
  }

  // The shape picked last, so the Shapes button goes back to it.
  var lastShapeStore = { id: "line" };

  // ─── Rail ────────────────────────────────────────────────────────────────
  window.CreatorDesktopRail = function CreatorDesktopRail() {
    var ctx = window.usePatternData();
    var cv = window.useCanvas();
    var app = window.useApp();
    var h = React.createElement;
    var Reg = window.CreatorToolRegistry;

    var _menu = React.useState(false); var shapesOpen = _menu[0], setShapesOpen = _menu[1];
    var menuRef = React.useRef(null);
    var shapesBtnRef = React.useRef(null);

    React.useEffect(function () {
      var t = cv.activeTool;
      if (t === "line" || t === "rect" || t === "ellipse") lastShapeStore.id = t;
    }, [cv.activeTool]);

    React.useEffect(function () {
      if (!shapesOpen) return undefined;
      function onDown(e) {
        if (menuRef.current && menuRef.current.contains(e.target)) return;
        if (shapesBtnRef.current && shapesBtnRef.current.contains(e.target)) return;
        setShapesOpen(false);
      }
      document.addEventListener("pointerdown", onDown);
      return function () { document.removeEventListener("pointerdown", onDown); };
    }, [shapesOpen]);
    useEscapeWhile(!!shapesOpen, function () { setShapesOpen(false); if (shapesBtnRef.current) shapesBtnRef.current.focus(); });

    var palData = sortedPalette(ctx);
    var api = { cv: cv, ctx: ctx, coarse: false, palData: palData, surface: "desktopRail", lastShape: lastShapeStore.id };
    var current = Reg.currentRailTool(api);

    function railButton(t) {
      var isShapes = t.id === "shapes";
      var on = current === t.id;
      var props = {
        key: t.id, type: "button", "data-tool": t.id,
        className: "creator-drail__btn" + (on ? " creator-drail__btn--on" : ""),
        "aria-label": t.railLabel || t.label,
        title: t.title,
        "aria-pressed": on ? "true" : "false",
        // A mouse click leaves focus where it was, so Space still pans.
        onMouseDown: keepFocus,
        onClick: function (e) {
          Reg.railActivate(t, api);
          if (isShapes) { var el = e.currentTarget; setShapesOpen(function (o) { return o ? false : menuSpot(el, "beside"); }); }
        }
      };
      if (isShapes) {
        props.ref = shapesBtnRef;
        props["aria-haspopup"] = "menu";
        props["aria-expanded"] = shapesOpen ? "true" : "false";
      }
      var shown = isShapes && on ? Reg.get(cv.activeTool) : t;
      return h("button", props,
        icon(shown.icon),
        h("span", { className: "creator-drail__label" }, t.railText || t.text));
    }

    var shapesMenu = shapesOpen ? h("div", { ref: menuRef, className: "creator-drail__menu", role: "menu", "aria-label": "Shapes", style: shapesOpen },
      Reg.get("shapes").children.map(function (id) {
        var t = Reg.get(id);
        var on = cv.activeTool === id;
        return h("button", {
          key: id, type: "button", role: "menuitemradio", "aria-checked": on ? "true" : "false",
          className: "creator-drail__menu-item" + (on ? " creator-drail__menu-item--on" : ""),
          onClick: function () { if (!on) t.activate(api); lastShapeStore.id = id; setShapesOpen(false); }
        }, icon(t.icon), h("span", null, t.text));
      })
    ) : null;

    var selCol = cv.selectedColorId && ctx.cmap ? ctx.cmap[cv.selectedColorId] : null;
    var swatch = h("button", {
      type: "button", className: "creator-drail__btn creator-drail__colour",
      "aria-label": selCol ? ("Working thread " + threadText(selCol) + " — open the palette") : "Choose a thread — open the palette",
      title: selCol ? threadText(selCol, "title") : "Choose a thread",
      onClick: function () {
        if (app.setSidebarTab) app.setSidebarTab("palette");
        if (app.setPanelOpen) app.setPanelOpen(true);
      }
    },
      h("span", { className: "creator-drail__swatch", style: { background: selCol ? "rgb(" + selCol.rgb + ")" : "var(--surface-tertiary)" } }),
      h("span", { className: "creator-drail__label" }, selCol ? selCol.id : "Thread"));

    function footButton(t) {
      var dis = Reg.isDisabled(t, api);
      return h("button", {
        key: t.id, type: "button", "data-tool": t.id,
        className: "creator-drail__btn",
        "aria-label": t.label, title: t.title,
        disabled: dis,
        onMouseDown: keepFocus,
        onClick: function () { t.activate(api); }
      }, icon(t.icon), h("span", { className: "creator-drail__label" }, t.text));
    }

    return h("nav", { className: "creator-drail", "aria-label": "Tools", "data-onboard": "creator-drail" },
      h("div", { className: "creator-drail__tools", role: "toolbar", "aria-orientation": "vertical", "aria-label": "Drawing tools" },
        Reg.list(Reg.DESKTOP_RAIL).map(railButton)
      ),
      shapesMenu,
      h("div", { className: "creator-drail__foot" },
        swatch,
        Reg.list(Reg.DESKTOP_RAIL_FOOT).map(footButton)
      )
    );
  };

  // ─── Options bar ─────────────────────────────────────────────────────────
  window.CreatorOptionsBar = function CreatorOptionsBar(props) {
    var ctx = window.usePatternData();
    var cv = window.useCanvas();
    var app = window.useApp();
    var h = React.createElement;
    var Reg = window.CreatorToolRegistry;
    props = props || {};

    var _sm = React.useState(false); var selMenuOpen = _sm[0], setSelMenuOpen = _sm[1];
    var _cm = React.useState(false); var cleanMenuOpen = _cm[0], setCleanMenuOpen = _cm[1];
    var selMenuRef = React.useRef(null);
    var cleanMenuRef = React.useRef(null);
    React.useEffect(function () {
      if (!selMenuOpen && !cleanMenuOpen) return undefined;
      function onDown(e) {
        if (selMenuRef.current && selMenuRef.current.contains(e.target)) return;
        if (cleanMenuRef.current && cleanMenuRef.current.contains(e.target)) return;
        setSelMenuOpen(false); setCleanMenuOpen(false);
      }
      document.addEventListener("pointerdown", onDown);
      return function () { document.removeEventListener("pointerdown", onDown); };
    }, [selMenuOpen, cleanMenuOpen]);
    useEscapeWhile(!!(selMenuOpen || cleanMenuOpen), function () { setSelMenuOpen(false); setCleanMenuOpen(false); });

    var palData = sortedPalette(ctx);
    var api = { cv: cv, ctx: ctx, coarse: false, palData: palData, surface: "desktopRail" };
    var tool = Reg.currentRailTool(api);

    // Commands from the header's Pattern menu (creator-main.js).
    var _sp = React.useState(false); var specialtyOpen = _sp[0], setSpecialtyOpen = _sp[1];
    var apiRef = React.useRef(api); apiRef.current = api;
    React.useEffect(function () {
      function onCommand(e) {
        var id = e && e.detail && e.detail.id;
        if (id === "specialty") setSpecialtyOpen(true);
        else if (id === "replace") {
          var t = Reg.get("replace");
          if (!t.isOn(apiRef.current)) t.activate(apiRef.current);
        }
      }
      window.addEventListener("cs:creator-command", onCommand);
      return function () { window.removeEventListener("cs:creator-command", onCommand); };
    }, []);
    var specialtyRef = React.useRef(null);
    React.useEffect(function () {
      if (!specialtyOpen || !specialtyRef.current) return undefined;
      // Open its list straight away, and give it focus.
      var d = specialtyRef.current.querySelector("details");
      if (d) d.open = true;
      specialtyRef.current.focus();
    }, [specialtyOpen]);
    useEscapeWhile(specialtyOpen, function () { setSpecialtyOpen(false); });
    var raw = cv.activeTool;

    // Small building blocks ---------------------------------------------------
    function label(text) { return h("span", { className: "creator-optbar__label" }, text); }
    function sep(key) { return h("span", { key: key, className: "creator-optbar__sep", "aria-hidden": "true" }); }
    function hint(text) { return h("span", { className: "creator-optbar__hint" }, text); }
    function btn(text, onClick, o) {
      o = o || {};
      return h("button", {
        key: o.key || text, type: "button",
        className: "creator-optbar__btn" + (o.on ? " creator-optbar__btn--on" : "") + (o.danger ? " creator-optbar__btn--danger" : ""),
        onClick: onClick, title: o.title, disabled: o.disabled,
        "aria-pressed": o.pressed == null ? undefined : (o.pressed ? "true" : "false"),
        "aria-label": o.ariaLabel
      }, o.icon || null, text);
    }
    function segmented(ariaLabel, options, value, onPick) {
      return h("div", { className: "creator-optbar__seg", role: "radiogroup", "aria-label": ariaLabel },
        options.map(function (o) {
          var on = value === o[0];
          return h("button", {
            key: o[0], type: "button", role: "radio", "aria-checked": on ? "true" : "false",
            className: "creator-optbar__seg-btn" + (on ? " creator-optbar__seg-btn--on" : ""),
            title: o[2], onClick: function () { onPick(o[0]); }
          }, o[1]);
        })
      );
    }
    function select(ariaLabel, options, value, onPick) {
      return h("select", {
        className: "creator-optbar__select", "aria-label": ariaLabel, value: value,
        onChange: function (e) { onPick(e.target.value); }
      }, options.map(function (o) { return h("option", { key: o[0], value: o[0] }, o[1]); }));
    }

    // Shared groups ------------------------------------------------------------
    var curStitch = cv.stitchType && cv.stitchType !== "erase" ? cv.stitchType : "cross";
    function stitchTypeGroup() {
      return h(React.Fragment, { key: "st" },
        label("Stitch"),
        select("Stitch type", STITCH_TYPES, curStitch, function (v) { cv.selectStitchType(v); })
      );
    }
    function brushSizeGroup() {
      var size = cv.brushSize || 1;
      return h(React.Fragment, { key: "bs" },
        label("Size"),
        select("Brush size", BRUSH_SIZES.map(function (n) { return [String(n), n + "×" + n]; }), String(size),
          function (v) { cv.setBrushSize(parseInt(v, 10)); })
      );
    }
    var mir = cv.mirror || { on: false, axis: "v" };
    function setMir(patch) { if (cv.setMirror) cv.setMirror(function (m) { return Object.assign({}, m, patch); }); }
    function mirrorGroup() {
      return h(React.Fragment, { key: "mir" },
        btn("Mirror", function () { setMir({ on: !mir.on }); }, { pressed: !!mir.on, on: !!mir.on, icon: icon("mirror"), title: "Mirror drawing across the dashed axis" }),
        mir.on && select("Mirror axis", [["v", "Left–right"], ["h", "Top–bottom"], ["both", "Both"]], mir.axis || "v",
          function (v) { setMir({ axis: v, on: true }); }),
        mir.on && btn("Centre", function () { setMir({ ax: ctx.sW / 2, ay: ctx.sH / 2 }); }, { key: "mircentre", title: "Put the mirror axis back in the centre of the pattern", ariaLabel: "Centre the mirror axis" })
      );
    }
    function opGroup() {
      var ops = [["replace", "New", "New selection — replaces any existing"],
        ["add", "Add", "Add to selection (hold Shift)"],
        ["subtract", "Subtract", "Subtract from selection (hold Alt)"],
        ["intersect", "Intersect", "Keep only the overlap (hold Shift+Alt)"]];
      return h("div", { key: "ops", className: "creator-optbar__seg", role: "radiogroup", "aria-label": "Selection mode" },
        ops.map(function (o) {
          var on = cv.wandOpMode === o[0];
          var held = cv.selectionModifier === o[0];
          return h("button", {
            key: o[0], type: "button", role: "radio", "aria-checked": on ? "true" : "false",
            className: "creator-optbar__seg-btn" + (on ? " creator-optbar__seg-btn--on" : "") + (held ? " creator-optbar__seg-btn--held" : ""),
            title: o[2], onClick: function () { cv.setSelectionOpMode(o[0]); }
          }, o[1]);
        })
      );
    }

    // "Replace colour…" from a selection: the shared modal, for the most
    // common colour in it (as the wand strip did).
    function openReplaceModal() {
      var rows = cv.selectionStats && cv.selectionStats.rows;
      cv.setWandPanel(null);
      if (!rows || !rows.length) {
        if (app.addToast) app.addToast("Select some stitches first.", { type: "info", duration: 2500 });
        return;
      }
      var top = rows[0];
      cv.setColourReplaceModal({ srcId: top.id, srcName: top.name || top.id, srcRgb: top.rgb });
    }

    function selectionGroup() {
      var n = cv.selectionCount || 0;
      var panel = cv.wandPanel;
      var items = [
        ["confetti", "Reduce confetti…"],
        ["reduce", "Reduce colours…"],
        ["replace", "Replace colour…"],
        ["info", "Stitch info…"],
        ["outline", "Outline…"]
      ];
      return h(React.Fragment, { key: "sel" },
        h("span", { className: "creator-optbar__count", role: "status" },
          n.toLocaleString("en-GB") + " stitch" + (n === 1 ? "" : "es") + " selected"),
        btn("Deselect", function () { if (cv.cancelLasso) cv.cancelLasso(); cv.clearSelection(); }, { title: "Deselect (Esc)" }),
        btn("Invert", cv.invertSelection, { title: "Invert the selection (Ctrl+Shift+I)" }),
        btn("Select all", cv.selectAll, { title: "Select every stitch (Ctrl+A)" }),
        h("div", { key: "selmenu", ref: selMenuRef, className: "creator-optbar__menu-wrap" },
          btn("Selection", function (e) { var el = e.currentTarget; setSelMenuOpen(function (o) { return o ? false : menuSpot(el, "left"); }); }, {
            on: selMenuOpen || !!panel, icon: null, title: "Things to do with the selection",
            ariaLabel: "Selection menu"
          }),
          selMenuOpen && h("div", { className: "creator-optbar__menu", role: "menu", "aria-label": "Selection", style: selMenuOpen },
            items.map(function (it) {
              return h("button", {
                key: it[0], type: "button", role: "menuitem",
                className: "creator-optbar__menu-item" + (panel === it[0] ? " creator-optbar__menu-item--on" : ""),
                onClick: function () {
                  setSelMenuOpen(false);
                  if (it[0] === "replace") { openReplaceModal(); return; }
                  cv.setWandPanel(panel === it[0] ? null : it[0]);
                }
              }, it[1]);
            }),
            h("button", {
              type: "button", role: "menuitem", "data-tool": "move",
              className: "creator-optbar__menu-item" + (raw === "move" ? " creator-optbar__menu-item--on" : ""),
              title: Reg.get("move").title,
              onClick: function () { setSelMenuOpen(false); if (raw !== "move") Reg.get("move").activate(api); }
            }, icon("move"), "Move selection"),
            // Copy, cut, duplicate, flip and rotate (the Tools tab had them;
            // the right-click menu and the shortcuts do too).
            cv.clip && h("div", { className: "creator-optbar__menu-sep", role: "separator" }),
            cv.clip && [
              ["copy", "Copy", "Copy (Ctrl+C)", "copy", function () { cv.clip.copy(); }],
              ["cut", "Cut", "Cut (Ctrl+X)", "scissors", function () { cv.clip.cut(); }],
              ["dup", "Duplicate", "Duplicate (Ctrl+D)", "duplicate", function () { cv.clip.duplicate(); }],
              ["flipH", "Flip horizontally", "Flip left to right (Shift+H)", "flipHorizontal", function () { cv.clip.transform("flipH"); }],
              ["flipV", "Flip vertically", "Flip upside down (Shift+V)", "flipVertical", function () { cv.clip.transform("flipV"); }],
              ["rotCCW", "Rotate left", "Rotate anticlockwise (,)", "rotateCcw", function () { cv.clip.transform("rotCCW"); }],
              ["rotCW", "Rotate right", "Rotate clockwise (.)", "rotateCw", function () { cv.clip.transform("rotCW"); }]
            ].map(function (a) {
              return h("button", {
                key: a[0], type: "button", role: "menuitem", className: "creator-optbar__menu-item", title: a[2],
                onClick: function () { setSelMenuOpen(false); a[4](); }
              }, icon(a[3]), a[1]);
            }),
            // Cross / half / half for every stitch in the selection.
            h("div", { className: "creator-optbar__menu-sep", role: "separator" }),
            h("div", { className: "cs-sttype-row" },
              h("span", { className: "cs-sttype-row__label", "aria-hidden": "true" }, "Stitch type"),
              h(window.CreatorStitchTypeChoice, { inMenu: true, onPicked: function () { setSelMenuOpen(false); } })),
            h("div", { className: "creator-optbar__menu-sep", role: "separator" }),
            h("button", {
              type: "button", role: "menuitem", className: "creator-optbar__menu-item creator-optbar__menu-item--danger",
              onClick: function () { setSelMenuOpen(false); cv.deleteSelection(); }
            }, "Delete selected stitches")
          )
        )
      );
    }

    // What the chosen tool shows -------------------------------------------
    var parts = [];
    // Fix outline colours and Reduce confetti bring their own controls
    // (props.modeRow), drawn outside the sideways-scrolling tool area so the
    // target-colour picker can open below the bar.
    if (!props.modeRow) {
      if (tool === "paint") {
        parts.push(stitchTypeGroup());
        if (curStitch === "backstitch") {
          parts.push(h("label", { key: "bscont", className: "creator-optbar__check" },
            h("input", { type: "checkbox", checked: !!cv.bsContinuous, onChange: function (e) { cv.setBsContinuous(e.target.checked); cv.setBsStart(null); } }),
            h("span", null, "Continuous")));
        } else if (curStitch !== "knot") {
          parts.push(brushSizeGroup());
        }
        parts.push(sep("s1"), mirrorGroup());
      } else if (tool === "erase") {
        parts.push(label("Erase"),
          segmented("What to erase", [["eraseAll", "Everything", "Erase every kind of stitch"], ["eraseBs", "Backstitch only", "Erase only backstitch lines"]],
            raw === "eraseBs" ? "eraseBs" : "eraseAll", function (v) { cv.setActiveTool(v); }));
        if (raw !== "eraseBs") parts.push(brushSizeGroup());
        parts.push(sep("s1"), mirrorGroup());
      } else if (tool === "fill") {
        parts.push(stitchTypeGroup(),
          hint(cv.hasSelection ? "Fills this patch: the touching stitches of the colour you click, inside the selection."
            : "Fills this patch: the touching stitches of the colour you click."));
      } else if (tool === "pick") {
        parts.push(hint("Click a stitch to make its thread the working thread."));
      } else if (tool === "wand") {
        parts.push(label("Tolerance"),
          h("input", { key: "tol", type: "range", min: 0, max: 100, step: 1, value: cv.wandTolerance, className: "creator-optbar__range",
            "aria-label": "Tolerance", onChange: function (e) { cv.setWandTolerance(Number(e.target.value)); } }),
          h("span", { key: "tolv", className: "creator-optbar__value" },
            cv.wandTolerance + " " + (cv.wandTolerance === 0 ? "exact" : cv.wandTolerance <= 5 ? "similar" : cv.wandTolerance <= 15 ? "broad" : "very broad")),
          segmented("What a click selects", [["conn", "Connected only", "Only stitches connected to the one you click"], ["all", "All matching", "Every stitch of this colour anywhere on the chart"]],
            cv.wandContiguous ? "conn" : "all", function (v) { cv.setWandContiguous(v === "conn"); }),
          opGroup());
      } else if (tool === "lasso") {
        parts.push(label("Lasso"),
          segmented("Lasso mode", [["freehand", "Freehand"], ["polygon", "Polygon"], ["magnetic", "Magnetic"]], cv.lassoMode || "freehand",
            function (v) { cv.setLassoMode(v); }),
          opGroup());
      } else if (tool === "shapes") {
        // Picking the shape that is already on keeps it (activate() toggles).
        parts.push(segmented("Shape", SHAPES, raw, function (v) { if (v !== raw) Reg.get(v).activate(api); lastShapeStore.id = v; }));
        if (raw === "line") {
          parts.push(h("label", { key: "snap", className: "creator-optbar__check" },
            h("input", { type: "checkbox", checked: !!cv.lineSnap, onChange: function (e) { if (cv.setLineSnap) cv.setLineSnap(e.target.checked); } }),
            h("span", null, "Straight or 45°")));
        } else {
          parts.push(segmented("Rectangle and ellipse", [["outline", "Outline"], ["filled", "Filled"]], cv.shapeFilled ? "filled" : "outline",
            function (v) { if (cv.setShapeFilled) cv.setShapeFilled(v === "filled"); }));
        }
        parts.push(brushSizeGroup(), sep("s1"), mirrorGroup());
      } else if (tool === "text") {
        parts.push(hint("Click where the text should start, then type."));
      } else if (tool === "hand") {
        parts.push(hint("Drag to move around the chart. Space and drag, or drag with the middle button, moves it with any tool."));
      } else if (raw === "colourReplace") {
        parts.push(label("Replace colour"), hint("Click a stitch to replace every stitch of its colour."),
          btn("Done", function () { cv.setActiveTool(null); }, {}));
      } else if (raw === "move" || raw === "float") {
        parts.push(hint("Drag the selection to move it. Arrow keys nudge it one square."));
      } else if (!cv.hasSelection) {
        parts.push(hint("Choose a tool on the left."));
      }
      // A selection's controls come first, so they stay in view when the
      // tool's own options need more room than the bar has.
      if (cv.hasSelection) {
        if (parts.length) parts.unshift(sep("s-sel"));
        parts.unshift(selectionGroup());
      }
    }

    // Clean up: Fix outline colours and Reduce confetti (they used to be in More).
    var cleanTools = Reg.list(Reg.MORE_CLEANUP);
    var cleanOn = cleanTools.some(function (t) { return t.isOn(api); });
    var cleanUp = h("div", { key: "clean", ref: cleanMenuRef, className: "creator-optbar__menu-wrap" },
      btn("Clean up", function (e) { var el = e.currentTarget; setCleanMenuOpen(function (o) { return o ? false : menuSpot(el, "right"); }); }, {
        on: cleanMenuOpen || cleanOn, icon: icon("cleanup"), title: "Fix outline colours or reduce confetti",
        ariaLabel: "Clean up menu"
      }),
      cleanMenuOpen && h("div", { className: "creator-optbar__menu", role: "menu", "aria-label": "Clean up", style: cleanMenuOpen },
        cleanTools.map(function (t) {
          var on = t.isOn(api);
          return h("button", {
            key: t.id, type: "button", role: "menuitemcheckbox", "aria-checked": on ? "true" : "false", "data-tool": t.id,
            className: "creator-optbar__menu-item" + (on ? " creator-optbar__menu-item--on" : ""),
            title: t.id === "denoise" && window.CONFETTI_HELP
              ? "Reduce confetti: merge confetti stitches (" + window.CONFETTI_HELP.definition + "), smooth ragged edges and combine near-duplicate threads"
              : t.title,
            onClick: function () { setCleanMenuOpen(false); t.activate(api); }
          }, icon(t.icon), h("span", null, t.text));
        })
      )
    );

    // A highlighted thread (Palette > Show on chart).
    var hi = cv.hiId && ctx.cmap ? ctx.cmap[cv.hiId] : null;
    var hiChip = cv.hiId ? h("div", { key: "hi", className: "creator-optbar__hi", role: "status" },
      h("span", { className: "creator-optbar__hi-swatch", style: { background: hi ? "rgb(" + hi.rgb + ")" : "var(--surface-tertiary)" }, "aria-hidden": "true" }),
      h("span", null, "Showing " + (hi ? threadText(hi, "short") : cv.hiId) + " on chart"),
      btn("Clear", function () { cv.setHiId(null); }, { title: "Stop showing this thread", ariaLabel: "Clear the highlighted thread" })
    ) : null;

    var zoom = h("div", { key: "zoom", className: "creator-optbar__zoom", role: "group", "aria-label": "Zoom" },
      h("button", { type: "button", className: "creator-optbar__icon-btn", "aria-label": "Zoom out", title: "Zoom out (−)",
        onClick: function () { cv.setZoom(Math.max(0.05, Math.round((cv.zoom - 0.1) * 100) / 100)); } }, icon("minus")),
      h(window.CreatorZoomSlider, { zoom: cv.zoom, setZoom: cv.setZoom, maxZoom: cv.maxZoom, style: { width: 90 }, labelClassName: "creator-optbar__zoom-pct" }),
      h("button", { type: "button", className: "creator-optbar__icon-btn", "aria-label": "Zoom in", title: "Zoom in (+)",
        onClick: function () { cv.setZoom(Math.min(cv.maxZoom || 3, Math.round((cv.zoom + 0.1) * 100) / 100)); } }, icon("plus")),
      h("button", { type: "button", className: "creator-optbar__btn creator-optbar__fit", title: "Fit the chart to the window (0)", onClick: cv.fitZ }, "Fit")
    );

    // Paste, once something is copied (Ctrl+V does the same).
    var pasteTool = Reg.get("paste");
    var paste = Reg.isVisible(pasteTool, api) ? btn("Paste", function () { pasteTool.activate(api); }, {
      key: "paste", icon: icon(pasteTool.icon), title: pasteTool.title
    }) : null;

    var specialty = specialtyOpen && window.SpecialtyStitchPanel ? h("div", {
      ref: specialtyRef, tabIndex: -1, className: "creator-optbar__sheet", role: "dialog", "aria-label": "Petite and long stitches"
    },
      h("div", { className: "creator-optbar__sheet-head" },
        h("strong", null, "Petite and long stitches"),
        h("button", { type: "button", className: "creator-optbar__icon-btn", "aria-label": "Close petite and long stitches", title: "Close (Esc)",
          onClick: function () { setSpecialtyOpen(false); } }, icon("x"))),
      h(window.SpecialtyStitchPanel, {
        objects: ctx.specialtyStitches || [], w: ctx.sW, h: ctx.sH, threads: ctx.displayPal || ctx.pal || [], brand: ctx.threadBrand,
        onSelect: cv.setSpecialtySelected,
        onChange: function (next) {
          cv.setEditHistory(function (prev) { return prev.concat([{ type: "specialty", changes: [], specialtyStitches: ctx.specialtyStitches || [] }]).slice(-cv.EDIT_HISTORY_MAX); });
          cv.setRedoHistory([]);
          ctx.setSpecialtyStitches(next);
        }
      })
    ) : null;

    return h("div", { className: "creator-optbar", role: "toolbar", "aria-label": "Tool options", "data-tool-options": tool || raw || "none" },
      props.modeRow
        ? h("div", { className: "creator-optbar__mode" }, props.modeRow)
        : h("div", { className: "creator-optbar__tool" }, parts),
      h("div", { className: "creator-optbar__end" }, paste, hiChip, cleanUp, props.more || null, zoom),
      specialty
    );
  };
})();
