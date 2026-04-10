/* creator/ContextMenu.js — Right-click context menu for the pattern canvas.
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: CreatorContext (context.js) */

window.CreatorContextMenu = function CreatorContextMenu() {
  var ctx = React.useContext(window.CreatorContext);
  var h = React.createElement;
  var menu = ctx.contextMenu;
  if (!menu) return null;

  var cell = menu.cell;
  var hasCellColour = cell && cell.id !== "__skip__" && cell.id !== "__empty__" && ctx.cmap && ctx.cmap[cell.id];
  var cellInfo = hasCellColour ? ctx.cmap[cell.id] : null;

  // Close menu on outside click or Escape
  React.useEffect(function() {
    function close() { ctx.setContextMenu(null); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return function() {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function item(label, onClick, opts) {
    opts = opts || {};
    return h("button", {
      key: label,
      onPointerDown: function(e) { e.stopPropagation(); },
      onClick: function(e) { e.stopPropagation(); onClick(); ctx.setContextMenu(null); },
      disabled: opts.disabled,
      style: {
        display:"block", width:"100%", textAlign:"left",
        padding:"5px 12px", fontSize:12, fontFamily:"inherit",
        border:"none", background:opts.disabled ? "transparent" : "transparent",
        color:opts.disabled ? "#a1a1aa" : "#18181b",
        cursor:opts.disabled ? "default" : "pointer",
        borderRadius:4
      },
      onMouseEnter: function(e) { if (!opts.disabled) e.target.style.background = "#f4f4f5"; },
      onMouseLeave: function(e) { e.target.style.background = "transparent"; }
    }, label);
  }

  function sep() {
    return h("div", {style:{height:1,background:"#e4e4e7",margin:"3px 0"}});
  }

  return h("div", {
    style:{
      position:"fixed", left:menu.x, top:menu.y, zIndex:9999,
      background:"#fff", border:"1px solid #d4d4d8", borderRadius:8,
      boxShadow:"0 4px 16px rgba(0,0,0,0.12)", padding:"4px 0",
      minWidth:180, maxWidth:240
    }
  },
    // Header: cell info
    hasCellColour && h("div", {
      style:{padding:"5px 12px 4px",fontSize:11,color:"#71717a",display:"flex",alignItems:"center",gap:5,borderBottom:"1px solid #f4f4f5",marginBottom:2}
    },
      h("span", {style:{width:10,height:10,borderRadius:2,display:"inline-block",border:"1px solid #d4d4d8",
        background:"rgb("+cellInfo.rgb+")"}}),
      "DMC " + cellInfo.id + (cellInfo.name ? " \xB7 " + cellInfo.name : "")
    ),
    !hasCellColour && h("div", {
      style:{padding:"5px 12px 4px",fontSize:11,color:"#a1a1aa",borderBottom:"1px solid #f4f4f5",marginBottom:2}
    }, "Empty cell (" + (menu.gx + 1) + ", " + (menu.gy + 1) + ")"),

    // Pick this colour
    item("\uD83D\uDCA7 Pick this colour", function() {
      if (cellInfo) ctx.setSelectedColorId(cellInfo.id);
    }, {disabled: !hasCellColour}),

    // Fill from here — switch to fill tool so user can click the area
    item("\uD83E\uDEA3 Switch to fill tool", function() {
      ctx.selectStitchType("cross");
      ctx.setBrushAndActivate("fill");
    }, {disabled: !ctx.selectedColorId}),

    sep(),

    // Select similar
    item("\u2728 Select similar (wand)", function() {
      ctx.setActiveTool("magicWand");
      ctx.setHalfStitchTool(null);
      ctx.setBsStart(null);
      ctx.applyWandSelect(menu.gx, menu.gy, ctx.wandOpMode);
    }, {disabled: !hasCellColour}),

    // Select all of this colour
    item("\uD83C\uDFA8 Select all of this colour", function() {
      if (cellInfo) ctx.selectAllOfColorId(cellInfo.id);
    }, {disabled: !hasCellColour}),

    sep(),

    // Highlight this colour
    item(ctx.hiId === (cellInfo ? cellInfo.id : null) ? "\uD83D\uDD0D Remove highlight" : "\uD83D\uDD0E Highlight this colour", function() {
      if (cellInfo) ctx.setHiId(ctx.hiId === cellInfo.id ? null : cellInfo.id);
    }, {disabled: !hasCellColour}),

    // Stitch info
    hasCellColour && item("\u2139\uFE0F Stitch info", function() {
      if (cellInfo) {
        ctx.setActiveTool("magicWand");
        ctx.setHalfStitchTool(null);
        ctx.applyWandSelect(menu.gx, menu.gy, "replace");
        ctx.setWandPanel("info");
      }
    })
  );
};
