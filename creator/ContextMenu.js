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
        padding:"5px 12px", fontSize:12, fontFamily:"inherit",
        border:"none", background:opts.disabled ? "transparent" : "transparent",
        color:opts.disabled ? "#94a3b8" : "#1e293b",
        cursor:opts.disabled ? "default" : "pointer",
        borderRadius:4
      },
      onMouseEnter: function(e) { if (!opts.disabled) e.target.style.background = "#f1f5f9"; },
      onMouseLeave: function(e) { e.target.style.background = "transparent"; }
    }, label);
  }

  function sep() {
    return h("div", {style:{height:1,background:"#e2e8f0",margin:"3px 0"}});
  }

  return h("div", {
    style:{
      position:"fixed", left:menu.x, top:menu.y, zIndex:9999,
      background:"#fff", border:"1px solid #cbd5e1", borderRadius:8,
      boxShadow:"0 4px 16px rgba(0,0,0,0.12)", padding:"4px 0",
      minWidth:180, maxWidth:240
    }
  },
    // Header: cell info
    hasCellColour && h("div", {
      style:{padding:"5px 12px 4px",fontSize:11,color:"#475569",display:"flex",alignItems:"center",gap:5,borderBottom:"1px solid #f1f5f9",marginBottom:2}
    },
      h("span", {style:{width:10,height:10,borderRadius:2,display:"inline-block",border:"1px solid #cbd5e1",
        background:"rgb("+cellInfo.rgb+")"}}),
      "DMC " + cellInfo.id + (cellInfo.name ? " \xB7 " + cellInfo.name : "")
    ),
    !hasCellColour && h("div", {
      style:{padding:"5px 12px 4px",fontSize:11,color:"#94a3b8",borderBottom:"1px solid #f1f5f9",marginBottom:2}
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
