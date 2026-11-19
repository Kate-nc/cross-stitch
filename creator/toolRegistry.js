/* creator/toolRegistry.js — the one list of Edit tools.
 *
 * Every surface that shows a tool button reads it from here: the touch
 * bottom rail (CompactBar / ToolStrip `compact`), the More panel and, behind
 * the creator.desktopRail preference, the desktop tool rail. A tool's label,
 * icon, shortcut and what a click does are written once.
 *
 * Fields
 *   id          stable id (also the button's data-tool attribute)
 *   label       accessible name ("Paint tool")
 *   text        short visible word under or beside the icon ("Paint")
 *   title       tooltip; includes the shortcut where there is one
 *   icon        name of a window.Icons function
 *   shortcut    the key as registered in creator/useKeyboardShortcuts.js
 *               (null when the tool has none)
 *   shortcutId  that registration's id, so a test can check they agree
 *   group       draw | select | shape | view | adjust | cleanup | history
 *   kind        tool (a mode the chart click uses), toggle (on/off setting)
 *               or action (does something once)
 *   surfaces    where the button appears:
 *                 touchRail   the bottom rail on phones and narrow windows
 *                 more        the More panel
 *                 desktopRail the left tool rail (creator.desktopRail on)
 *   railLabel, railText  the rail's wording when it differs (Hand)
 *   pointer     "fine" when the button only appears with a mouse
 *   parent      for Line, Rectangle and Ellipse: the "shapes" rail button
 *
 * Behaviour
 *   isOn(api)     whether the button shows as pressed
 *   activate(api) what a click does
 *   visible(api)  optional; false hides the button
 *   disabled(api) optional; true disables it
 * `api` is { cv, ctx, coarse, palData } from the component rendering it.
 */
(function (root) {
  "use strict";

  function clearOthers(api) {
    api.ctx.setPartialStitchTool(null);
    api.cv.setBsStart(null);
  }

  // Paint and Fill: a second tap on the active button goes back to
  // Navigate on touch; the first pick chooses a colour if there is none.
  function pickBrush(api, mode, isOn) {
    var cv = api.cv;
    if (api.coarse && isOn) { cv.setDrawMode(false); return; }
    if (!cv.selectedColorId && api.palData && api.palData.length > 0) cv.setSelectedColorId(api.palData[0].id);
    cv.setBrushAndActivate(mode);
  }

  function shapeTool(id, label) {
    return {
      id: id, label: label + " tool", text: label,
      title: label + " — drag on the chart; outline or filled in the Tools tab",
      icon: id === "line" ? "shapeLine" : id === "rect" ? "shapeRect" : "shapeEllipse",
      shortcut: null, shortcutId: null,
      group: "shape", kind: "tool", parent: "shapes",
      surfaces: ["more"],
      isOn: function (api) { return api.cv.activeTool === id; },
      activate: function (api) {
        var cv = api.cv;
        if (cv.activeTool === id) { cv.setActiveTool(null); return; }
        cv.setActiveTool(id); clearOthers(api);
        if (cv.cancelLasso) cv.cancelLasso();
        if (!cv.drawMode) cv.setDrawMode(true);
      }
    };
  }

  var TOOLS = [
    {
      id: "paint", label: "Paint tool", text: "Paint", title: "Paint (P)",
      icon: "brush", shortcut: "p", shortcutId: "creator.tool.paint",
      group: "draw", kind: "tool", surfaces: ["touchRail", "desktopRail"],
      isOn: function (api) { return api.cv.activeTool === "paint" && api.cv.brushMode === "paint"; },
      activate: function (api) { pickBrush(api, "paint", TOOLS_BY_ID.paint.isOn(api)); }
    },
    {
      id: "fill", label: "Fill tool", text: "Fill", title: "Fill (F)",
      icon: "bucketPour", shortcut: "f", shortcutId: "creator.tool.fill",
      group: "draw", kind: "tool", surfaces: ["touchRail", "desktopRail"],
      isOn: function (api) { return api.cv.activeTool === "fill" && api.cv.brushMode === "fill"; },
      activate: function (api) { pickBrush(api, "fill", TOOLS_BY_ID.fill.isOn(api)); }
    },
    {
      id: "erase", label: "Erase tool", text: "Erase", title: "Erase (5)",
      icon: "eraser", shortcut: "5", shortcutId: "creator.stitch.erase",
      group: "draw", kind: "tool", surfaces: ["touchRail", "desktopRail"],
      isOn: function (api) { return api.cv.stitchType === "erase"; },
      // The touch rail always goes back to Navigate on a second tap; the
      // desktop pill only does on a coarse pointer.
      activate: function (api) {
        if (TOOLS_BY_ID.erase.isOn(api) && (api.coarse || api.surface === "touchRail")) api.cv.setDrawMode(false);
        else api.cv.selectStitchType("erase");
      }
    },
    {
      id: "pick", label: "Eyedropper tool", text: "Pick", title: "Eyedropper (I)",
      railLabel: "Pick colour (eyedropper)",
      icon: "eyedropper", shortcut: "i", shortcutId: "creator.tool.eyedropper",
      group: "select", kind: "tool", surfaces: ["more", "desktopRail"],
      isOn: function (api) { return api.cv.activeTool === "eyedropper"; },
      activate: function (api) { api.cv.setActiveTool("eyedropper"); clearOthers(api); }
    },
    {
      id: "wand", label: "Magic wand", text: "Wand", title: "Magic Wand (W)",
      icon: "wand", shortcut: "w", shortcutId: "creator.tool.wand",
      group: "select", kind: "tool", surfaces: ["more", "desktopRail"],
      isOn: function (api) { return api.cv.activeTool === "magicWand"; },
      activate: function (api) {
        var cv = api.cv;
        if (cv.activeTool === "magicWand") cv.setActiveTool(null);
        else { cv.setActiveTool("magicWand"); clearOthers(api); if (cv.cancelLasso) cv.cancelLasso(); }
      }
    },
    {
      id: "lasso", label: "Lasso", text: "Lasso", title: "Lasso — mode in Tools tab",
      icon: "lasso", shortcut: null, shortcutId: null,
      group: "select", kind: "tool", surfaces: ["more", "desktopRail"],
      isOn: function (api) { return api.cv.activeTool === "lasso"; },
      activate: function (api) {
        var cv = api.cv;
        if (cv.activeTool === "lasso") { if (cv.cancelLasso) cv.cancelLasso(); cv.setActiveTool(null); }
        else { cv.setActiveTool("lasso"); cv.setLassoMode(cv.lassoMode || "freehand"); clearOthers(api); }
      }
    },
    {
      id: "move", label: "Move selection", text: "Move",
      title: "Move selection — drag selected cells to a new position",
      icon: "move", shortcut: null, shortcutId: null,
      group: "select", kind: "tool", surfaces: ["more"],
      isOn: function (api) { return api.cv.activeTool === "move"; },
      disabled: function (api) { return !api.cv.hasSelection; },
      activate: function (api) {
        var cv = api.cv;
        if (cv.activeTool === "move") { if (cv.cancelMove) cv.cancelMove(); cv.setActiveTool(null); }
        else { cv.setActiveTool("move"); clearOthers(api); if (cv.cancelLasso) cv.cancelLasso(); }
      }
    },
    {
      id: "paste", label: "Paste", text: "Paste", title: "Paste, then drag it into place (Ctrl+V)",
      icon: "clipboard", shortcut: "mod+v", shortcutId: "creator.paste",
      group: "select", kind: "action", surfaces: ["more"],
      visible: function (api) { return !!(api.cv.clip && api.cv.clip.hasClipboard); },
      isOn: function () { return false; },
      activate: function (api) { api.cv.clip.paste(); }
    },
    // One rail button stands for Line, Rectangle and Ellipse.
    {
      id: "shapes", label: "Shapes", text: "Shapes", title: "Shapes: line, rectangle or ellipse",
      icon: "shapeRect", shortcut: null, shortcutId: null,
      group: "shape", kind: "tool", surfaces: ["desktopRail"],
      children: ["line", "rect", "ellipse"],
      isOn: function (api) { var t = api.cv.activeTool; return t === "line" || t === "rect" || t === "ellipse"; },
      activate: function (api) {
        // Picks the shape used last (or Line); the rail opens the menu too.
        var last = api.lastShape || "line";
        if (!TOOLS_BY_ID.shapes.isOn(api)) TOOLS_BY_ID[last].activate(api);
      }
    },
    shapeTool("line", "Line"),
    shapeTool("rect", "Rectangle"),
    shapeTool("ellipse", "Ellipse"),
    {
      id: "text", label: "Text tool", text: "Text", title: "Text — tap where it should start, then type",
      icon: "textTool", shortcut: null, shortcutId: null,
      group: "shape", kind: "tool", surfaces: ["more", "desktopRail"],
      isOn: function (api) { return api.cv.activeTool === "text"; },
      activate: function (api) {
        var cv = api.cv;
        if (cv.activeTool === "text") { cv.setActiveTool(null); return; }
        cv.setActiveTool("text"); clearOthers(api);
        if (cv.cancelLasso) cv.cancelLasso();
        if (!cv.drawMode) cv.setDrawMode(true);
      }
    },
    {
      id: "mirror", label: "Mirror drawing", text: "Mirror", title: "Mirror drawing — axis in the Tools tab",
      icon: "mirror", shortcut: null, shortcutId: null,
      group: "draw", kind: "toggle", surfaces: ["more"],
      // With the desktop rail on, Mirror is a switch in the options bar.
      inOptionsBar: true,
      isOn: function (api) { return !!(api.cv.mirror && api.cv.mirror.on); },
      activate: function (api) {
        if (api.cv.setMirror) api.cv.setMirror(function (m) { return Object.assign({}, m, { on: !m.on }); });
      }
    },
    {
      id: "replace", label: "Replace colour tool", text: "Replace",
      title: "Replace colour (R) — click a stitch to replace every stitch of that colour",
      icon: "colourSwap", shortcut: "r", shortcutId: "creator.tool.replace",
      group: "adjust", kind: "tool", surfaces: ["more"],
      isOn: function (api) { return api.cv.activeTool === "colourReplace"; },
      activate: function (api) {
        var cv = api.cv;
        if (cv.activeTool === "colourReplace") cv.setActiveTool(null);
        else { cv.setActiveTool("colourReplace"); clearOthers(api); if (cv.cancelLasso) cv.cancelLasso(); }
      }
    },
    // Hand: on a mouse it is the old Navigate mode (H still flips it).
    {
      id: "hand", label: "Navigate", text: "Navigate", railLabel: "Hand tool", railText: "Hand",
      title: "Navigate — drag to move around the chart (H)",
      icon: "hand", shortcut: "h", shortcutId: "creator.tool.hand",
      group: "view", kind: "tool", surfaces: ["more", "desktopRail"], pointer: "fine",
      isOn: function (api) { return !api.cv.drawMode; },
      activate: function (api) { api.cv.setDrawMode(!api.cv.drawMode); }
    },
    {
      id: "cleanup", label: "Fix outline colours", text: "Fix outline colours",
      title: "Fix outline colours: replace stitches where an outline was blended into the colours around it",
      icon: "cleanup", shortcut: null, shortcutId: null,
      group: "cleanup", kind: "tool", surfaces: ["more"],
      isOn: function (api) { return api.cv.activeTool === "cleanup"; },
      activate: function (api) {
        var cv = api.cv;
        if (cv.activeTool === "cleanup") { if (cv.exitCleanup) cv.exitCleanup(); return; }
        clearOthers(api); if (cv.cancelLasso) cv.cancelLasso(); if (cv.enterCleanup) cv.enterCleanup();
      }
    },
    {
      id: "denoise", label: "Reduce confetti", text: "Reduce confetti",
      // The title adds the confetti definition at render time (CONFETTI_HELP).
      title: "Reduce confetti: merge confetti stitches, smooth ragged edges and combine near-duplicate threads",
      icon: "sparkles", shortcut: null, shortcutId: null,
      group: "cleanup", kind: "tool", surfaces: ["more"],
      isOn: function (api) { return api.cv.activeTool === "denoise"; },
      activate: function (api) {
        var cv = api.cv;
        if (cv.activeTool === "denoise") { if (cv.exitDenoise) cv.exitDenoise(); return; }
        clearOthers(api); if (cv.cancelLasso) cv.cancelLasso(); if (cv.enterDenoise) cv.enterDenoise();
      }
    },
    {
      id: "undo", label: "Undo", text: "Undo", title: "Undo (Ctrl+Z)",
      icon: "undo", shortcut: "mod+z", shortcutId: "creator.undo",
      group: "history", kind: "action", surfaces: ["touchRail", "desktopRail"],
      isOn: function () { return false; },
      disabled: function (api) { return !(api.cv.editHistory && api.cv.editHistory.length); },
      activate: function (api) { api.cv.undoEdit(); }
    },
    {
      id: "redo", label: "Redo", text: "Redo", title: "Redo (Ctrl+Y)",
      icon: "redo", shortcut: "mod+y", shortcutId: "creator.redo",
      group: "history", kind: "action", surfaces: ["desktopRail"],
      isOn: function () { return false; },
      disabled: function (api) { return !(api.cv.redoHistory && api.cv.redoHistory.length); },
      activate: function (api) { api.cv.redoEdit(); }
    }
  ];

  // Where each control of the desktop More panel lives with the tool rail on
  // (Stage 2), and how many clicks it takes from Edit. More itself is gone
  // from that layout. tests/creatorRailHomes.test.js checks every row.
  var RAIL_HOMES = [
    { control: "Navigate", home: "Rail > Hand", clicks: 1 },
    { control: "Pick", home: "Rail > Pick", clicks: 1 },
    { control: "Wand", home: "Rail > Wand", clicks: 1 },
    { control: "Lasso", home: "Rail > Lasso", clicks: 1 },
    { control: "Line", home: "Rail > Shapes > Line", clicks: 2 },
    { control: "Rectangle", home: "Rail > Shapes > Rectangle", clicks: 2 },
    { control: "Ellipse", home: "Rail > Shapes > Ellipse", clicks: 2 },
    { control: "Text", home: "Rail > Text", clicks: 1 },
    { control: "Move", home: "Options bar > Selection > Move selection (with a selection)", clicks: 2 },
    { control: "Paste", home: "Options bar > Paste (once something is copied)", clicks: 1 },
    { control: "Mirror", home: "Rail > Paint, then Options bar > Mirror", clicks: 2 },
    { control: "Replace", home: "Pattern menu > Replace colour", clicks: 2 },
    { control: "Fix outline colours", home: "Options bar > Clean up > Fix outline colours", clicks: 2 },
    { control: "Reduce confetti", home: "Options bar > Clean up > Reduce confetti", clicks: 2 },
    { control: "Stitch type", home: "Rail > Paint, then Options bar > Stitch", clicks: 2 },
    { control: "Brush size", home: "Rail > Paint, then Options bar > Size", clicks: 2 },
    { control: "Resize canvas", home: "Pattern menu > Resize canvas", clicks: 2 },
    { control: "Re-generate from image", home: "Pattern menu > Re-generate from image", clicks: 2 },
    { control: "Petite and long stitches", home: "Pattern menu > Petite and long stitches", clicks: 2 },
    { control: "Overlay", home: "Side panel > View > Show the picture", clicks: 2 },
    { control: "Pen draws; fingers navigate", home: "File > Preferences (opens on Pattern Creator) > Touch and pen", clicks: 2 },
    { control: "Magnifier", home: "File > Preferences (opens on Pattern Creator) > Touch and pen", clicks: 2 },
    { control: "Precision cursor", home: "File > Preferences (opens on Pattern Creator) > Touch and pen", clicks: 2 }
  ];

  var TOOLS_BY_ID = {};
  TOOLS.forEach(function (t) { TOOLS_BY_ID[t.id] = t; });

  // The desktop rail's order, top to bottom (Stage 2 brief). Undo and Redo
  // sit at its foot under the working thread's swatch.
  var DESKTOP_RAIL = ["paint", "fill", "erase", "pick", "wand", "lasso", "shapes", "text", "hand"];
  var DESKTOP_RAIL_FOOT = ["undo", "redo"];
  var TOUCH_RAIL = ["paint", "fill", "erase"];
  var TOUCH_RAIL_FOOT = ["undo"];
  // The More panel's Tools section and its two clean-up buttons, in order.
  var MORE_TOOLS = ["hand", "pick", "wand", "lasso", "move", "paste", "line", "rect", "ellipse", "text", "mirror", "replace"];
  var MORE_CLEANUP = ["cleanup", "denoise"];

  function get(id) { return TOOLS_BY_ID[id] || null; }

  function on(surface) {
    return function (t) { return t.surfaces.indexOf(surface) !== -1; };
  }

  // Tools listed in the More panel. With the desktop rail on, anything the
  // rail already shows is left out, so no tool appears twice on screen.
  function moreTools(opts, ids) {
    opts = opts || {};
    return (ids || MORE_TOOLS).map(get).filter(function (t) {
      if (!t) return false;
      if (t.pointer === "fine" && opts.coarse) return false;
      if (opts.desktopRail) {
        if (t.surfaces.indexOf("desktopRail") !== -1 || t.inOptionsBar) return false;
        if (t.parent && get(t.parent) && get(t.parent).surfaces.indexOf("desktopRail") !== -1) return false;
      }
      return true;
    });
  }

  // Which desktop rail button the chart's current state belongs to. Paint
  // covers every stitch type it draws (half, quarter, backstitch, knot);
  // Move, Replace and the clean-up tools have no rail button (null).
  function currentRailTool(api) {
    var cv = api.cv, t = cv.activeTool;
    if (!cv.drawMode) return "hand";
    if (t === "eyedropper") return "pick";
    if (t === "magicWand") return "wand";
    if (t === "lasso") return "lasso";
    if (t === "line" || t === "rect" || t === "ellipse") return "shapes";
    if (t === "text") return "text";
    if (cv.stitchType === "erase" || t === "eraseAll" || t === "eraseBs") return "erase";
    if (t === "fill") return "fill";
    if (t === "paint" || t === "backstitch" || t === "knot" || (api.ctx && api.ctx.partialStitchTool)) return "paint";
    return null;
  }

  // A rail click picks the tool. Unlike the More panel, clicking the tool
  // that is already on keeps it on (a rail always has one tool chosen).
  function railActivate(t, api) {
    if (t.kind === "tool" && currentRailTool(api) === t.id) return false;
    t.activate(api);
    return true;
  }

  function isVisible(t, api) { return !t.visible || !!t.visible(api); }
  function isDisabled(t, api) { return !!(t.disabled && t.disabled(api)); }

  // The shortcut as people read it ("Ctrl+Z", "P").
  function shortcutLabel(t) {
    if (!t || !t.shortcut) return "";
    return t.shortcut.split("+").map(function (p) {
      if (p === "mod") return "Ctrl";
      if (p === "shift") return "Shift";
      return p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1);
    }).join("+");
  }

  var api = {
    TOOLS: TOOLS,
    DESKTOP_RAIL: DESKTOP_RAIL,
    DESKTOP_RAIL_FOOT: DESKTOP_RAIL_FOOT,
    TOUCH_RAIL: TOUCH_RAIL,
    TOUCH_RAIL_FOOT: TOUCH_RAIL_FOOT,
    MORE_TOOLS: MORE_TOOLS,
    MORE_CLEANUP: MORE_CLEANUP,
    RAIL_HOMES: RAIL_HOMES,
    get: get,
    list: function (ids) { return ids.map(get).filter(Boolean); },
    forSurface: function (surface) { return TOOLS.filter(on(surface)); },
    moreTools: moreTools,
    currentRailTool: currentRailTool,
    railActivate: railActivate,
    isVisible: isVisible,
    isDisabled: isDisabled,
    shortcutLabel: shortcutLabel
  };
  root.CreatorToolRegistry = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
