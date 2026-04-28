/* creator/ContextMenu.js — Right-click context menu for the pattern canvas.
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: CreatorContext (context.js) */

window.CreatorContextMenu = function CreatorContextMenu() {
  var ctx = window.usePatternData();
  var cv = window.useCanvas();
  var h = React.createElement;
  var menu = cv.contextMenu;

  // Close menu on outside click. ESC handling is delegated to the global
  // useEscape stack so a context menu open on top of an open modal correctly
  // takes priority.
  React.useEffect(function() {
    if (!menu) return;
    function close() { cv.setContextMenu(null); }
    document.addEventListener("pointerdown", close);
    return function() {
      document.removeEventListener("pointerdown", close);
    };
  }, [menu]);
  if (typeof window !== "undefined" && window.useEscape) {
    window.useEscape(function() { if (menu) cv.setContextMenu(null); });
  }

  if (!menu) return null;

  // Clamp menu position to viewport once rendered, so right-clicks / long-presses
  // near the edges don't push it off-screen on mobile.
  var menuRef = React.useRef(null);
  var _pos = React.useState({ x: menu.x, y: menu.y });
  var pos = _pos[0], setPos = _pos[1];
  React.useLayoutEffect(function() {
    if (!menuRef.current) return;
    var r = menuRef.current.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight, pad = 8;
    var nx = Math.max(pad, Math.min(menu.x, vw - r.width - pad));
    var ny = Math.max(pad, Math.min(menu.y, vh - r.height - pad));
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
  }, [menu.x, menu.y]);

  var cell = menu.cell;
  var hasCellColour = cell && cell.id !== "__skip__" && cell.id !== "__empty__" && ctx.cmap && ctx.cmap[cell.id];
  var cellInfo = hasCellColour ? ctx.cmap[cell.id] : null;

  function item(label, onClick, opts) {
    opts = opts || {};
    var key = opts.k || (typeof label === 'string' ? label : undefined);
    return h("button", {
      key: key,
      onPointerDown: function(e) { e.stopPropagation(); },
      onClick: function(e) { e.stopPropagation(); onClick(); cv.setContextMenu(null); },
      disabled: opts.disabled,
      style: {
        display:"block", width:"100%", textAlign:"left",
        padding:"5px 12px", fontSize:'var(--text-sm)', fontFamily:"inherit",
        border:"none", background:opts.disabled ? "transparent" : "transparent",
        color:opts.disabled ? "var(--text-tertiary)" : "var(--text-primary)",
        cursor:opts.disabled ? "default" : "pointer",
        borderRadius:4
      },
      onMouseEnter: function(e) { if (!opts.disabled) e.target.style.background = "var(--surface-tertiary)"; },
      onMouseLeave: function(e) { e.target.style.background = "transparent"; }
    }, label);
  }

  function sep() {
    return h("div", {style:{height:1,background:"var(--border)",margin:"3px 0"}});
  }

  return h("div", {
    ref: menuRef,
    style:{
      position:"fixed", left:pos.x, top:pos.y, zIndex:9999,
      background:"var(--surface)", border:"1px solid var(--border)", borderRadius:'var(--radius-md)',
      boxShadow:"0 4px 16px rgba(0,0,0,0.12)", padding:"4px 0",
      minWidth:180, maxWidth:240
    }
  },
    // Header: cell info
    hasCellColour && h("div", {
      style:{padding:"5px 12px 4px",fontSize:'var(--text-xs)',color:"var(--text-secondary)",display:"flex",alignItems:"center",gap:5,borderBottom:"1px solid var(--surface-tertiary)",marginBottom:2}
    },
      h("span", {style:{width:10,height:10,borderRadius:2,display:"inline-block",border:"1px solid var(--border)",
        background:"rgb("+cellInfo.rgb+")"}}),
      "DMC " + cellInfo.id + (cellInfo.name ? " \xB7 " + cellInfo.name : "")
    ),
    !hasCellColour && h("div", {
      style:{padding:"5px 12px 4px",fontSize:'var(--text-xs)',color:"var(--text-tertiary)",borderBottom:"1px solid var(--surface-tertiary)",marginBottom:2}
    }, "Empty cell (" + (menu.gx + 1) + ", " + (menu.gy + 1) + ")"),

    // Pick this colour
    item([Icons.eyedropper(), " Pick this colour"], function() {
      if (cellInfo) cv.setSelectedColorId(cellInfo.id);
    }, {disabled: !hasCellColour, k: 'pick'}),

    // Fill from here — switch to fill tool so user can click the area
    item([Icons.bucket(), " Switch to fill tool"], function() {
      cv.selectStitchType("cross");
      cv.setBrushAndActivate("fill");
    }, {disabled: !cv.selectedColorId, k: 'fill'}),

    sep(),

    // Select similar
    item([Icons.wand(), " Select similar (wand)"], function() {
      cv.setActiveTool("magicWand");
      ctx.setPartialStitchTool(null);
      cv.setBsStart(null);
      cv.applyWandSelect(menu.gx, menu.gy, cv.wandOpMode);
    }, {disabled: !hasCellColour, k: 'wand'}),

    // Select all of this colour
    item([Icons.palette(), " Select all of this colour"], function() {
      if (cellInfo) cv.selectAllOfColorId(cellInfo.id);
    }, {disabled: !hasCellColour, k: 'selectall'}),

    sep(),

    // Highlight this colour
    item(cv.hiId === (cellInfo ? cellInfo.id : null) ? [Icons.magnifyMinus(), " Remove highlight"] : [Icons.magnify(), " Highlight this colour"], function() {
      if (cellInfo) cv.setHiId(cv.hiId === cellInfo.id ? null : cellInfo.id);
    }, {disabled: !hasCellColour, k: 'highlight'}),

    // Stitch info
    hasCellColour && item([Icons.info(), " Stitch info"], function() {
      if (cellInfo) {
        cv.setActiveTool("magicWand");
        ctx.setPartialStitchTool(null);
        cv.applyWandSelect(menu.gx, menu.gy, "replace");
        cv.setWandPanel("info");
      }
    }, {k: 'info'})
  );
};
