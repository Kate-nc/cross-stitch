/* creator/Sidebar.js — Settings sidebar for the Creator app.
   Reads from CreatorContext and GenerationContext.
   Loaded as a plain <script> before the main Babel script.
   Depends on: Section, SliderRow, Tooltip (components.js), CreatorContext, GenerationContext (context.js) */

window.CreatorSidebar = function CreatorSidebar() {
  var ctx = window.usePatternData();
  var cv = window.useCanvas();
  var app = window.useApp();
  var gen = window.useGeneration();
  var h = React.createElement;
  var _pco = React.useState(false); var palChipsOpen = _pco[0], setPalChipsOpen = _pco[1];
  var _stashExp = React.useState(false); var stashStripExpanded = _stashExp[0], setStashStripExpanded = _stashExp[1];
  var _qaVal = React.useState(""); var qaVal = _qaVal[0], setQaVal = _qaVal[1];
  var _qaLoad = React.useState(false); var qaLoading = _qaLoad[0], setQaLoading = _qaLoad[1];
  var _seedEd = React.useState(false); var seedEditing = _seedEd[0], setSeedEditing = _seedEd[1];
  var _seedTmp = React.useState(""); var seedTmp = _seedTmp[0], setSeedTmp = _seedTmp[1];

  function getCleanupWarning(sW, sH, orphans, previewStats) {
    if (orphans === 0) return null;
    var area = sW * sH;
    if (area <= 900 && orphans > 0) {
      return {level:"danger",message:"Your grid is very small ("+sW+"\xD7"+sH+"). Any orphan removal may destroy fine details. Consider turning it off or increasing grid size."};
    }
    if (area <= 1600 && orphans >= 2) {
      return {level:"danger",message:"Orphan removal level "+orphans+" is aggressive for a "+sW+"\xD7"+sH+" grid. Important details like eyes, text, or thin lines may be lost. Consider using level 1 or increasing grid size."};
    }
    if (area <= 2500 && orphans >= 3) {
      return {level:"warning",message:"Level 3 cleanup on a "+sW+"\xD7"+sH+" grid may remove more detail than expected. Try level 1 or 2 first."};
    }
    if (previewStats && previewStats.confettiSingles != null && previewStats.confettiCleanSingles != null) {
      var removed = previewStats.confettiSingles - previewStats.confettiCleanSingles;
      var pctRemoved = removed / Math.max(1, previewStats.stitchable) * 100;
      if (pctRemoved > 20) {
        return {level:"danger",message:"Cleanup would remove ~"+removed.toLocaleString()+" stitches ("+pctRemoved.toFixed(0)+"% of the pattern). This will likely cause visible detail loss. Consider reducing the cleanup level."};
      }
      if (pctRemoved > 10) {
        return {level:"warning",message:"Cleanup would remove ~"+removed.toLocaleString()+" stitches ("+pctRemoved.toFixed(0)+"% of the pattern). Check the preview to make sure you\u2019re happy with the result."};
      }
    }
    return null;
  }

  // Note: sidebar always renders — now shown as a right panel (rpanel)
  // The sidebarOpen state is kept for accordion sections but the panel itself stays visible

  // ── Inline Toggle component (used only in Stitch Cleanup section) ──────────
  function Toggle(props) {
    return h("div", {
      role: "switch",
      tabIndex: 0,
      "aria-checked": props.checked,
      onClick: function() { props.onChange(!props.checked); },
      onKeyDown: function(e) {
        if (e.repeat) return;
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          props.onChange(!props.checked);
        }
      },
      style:{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:8,userSelect:"none"}
    },
      h("span", {"aria-hidden":"true", style:{position:"relative",display:"inline-block",width:32,height:18,flexShrink:0}},
        h("span", {style:{display:"block",position:"absolute",inset:0,borderRadius:9,
          background:props.checked?"#0d9488":"#cbd5e1",transition:"background 0.15s"}}),
        h("span", {style:{display:"block",position:"absolute",width:14,height:14,top:2,
          left:props.checked?16:2,borderRadius:"50%",background:"#fff",
          transition:"left 0.15s",boxShadow:"0 1px 3px rgba(0,0,0,0.18)"}})
      ),
      h("span", {style:{flex:1}},
        h("span", {style:{fontSize:12,fontWeight:500,color:"#1e293b",display:"block"}}, props.label),
        props.help && h("span", {style:{fontSize:10,color:"#94a3b8",display:"block",marginTop:1}}, props.help)
      )
    );
  }

  // ── Palette chips (top of right panel, when pattern loaded) ─────────────────
  var palChipsSection = (ctx.pat && ctx.pal) ? (function() {
    var displayPal = ctx.displayPal || ctx.pal || [];
    var isHsTool = ctx.partialStitchTool && ctx.partialStitchTool !== "erase";
    var isPaintMode = cv.activeTool === "paint" || cv.activeTool === "fill" || isHsTool;
    var selInfo = cv.selectedColorId && ctx.cmap && ctx.cmap[cv.selectedColorId];
    var chips = displayPal.map(function(p) {
      var ips = isPaintMode && cv.selectedColorId === p.id;
      var ihs = cv.hiId === p.id;
      var isUnused = ctx.isScratchMode && p.count === 0;
      return h("div", {
        key: p.id,
        role: "button",
        tabIndex: 0,
        "aria-pressed": ips || ihs,
        onClick: function() {
          if (isPaintMode) {
            cv.setSelectedColorId(cv.selectedColorId === p.id ? null : p.id);
          } else {
            cv.setHiId(cv.hiId === p.id ? null : p.id);
          }
        },
        onKeyDown: function(e) {
          if (e.repeat) return;
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            if (isPaintMode) {
              cv.setSelectedColorId(cv.selectedColorId === p.id ? null : p.id);
            } else {
              cv.setHiId(cv.hiId === p.id ? null : p.id);
            }
          }
        },
        style: {
          display:"flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:5,
          cursor:"pointer",fontSize:11,
          border: ips ? "2px solid #0d9488" : ihs ? "2px solid #ea580c" : "0.5px solid #e2e8f0",
          background: ips ? "#f0fdfa" : ihs ? "#fff7ed" : "#fff",
          opacity: isUnused ? 0.6 : 1
        }
      },
        h("span", {style:{width:12,height:12,borderRadius:2,background:"rgb("+p.rgb+")",border:"1px solid #cbd5e1",display:"inline-block",flexShrink:0}}),
        h("span", {style:{fontFamily:"monospace",color:"#475569",fontSize:10}}, p.symbol),
        h("span", {style:{fontWeight:500}}, p.id),
        isUnused && h("span", {
          onClick: function(e) { e.stopPropagation(); ctx.removeScratchColour(p.id); },
          style:{fontSize:9,color:"#94a3b8",cursor:"pointer",marginLeft:2,lineHeight:1}
        }, "\xD7")
      );
    });
    return h("div", {style:{borderBottom:"0.5px solid var(--border)"}},
      h("div", {
        onClick:function(){setPalChipsOpen(function(o){return !o;});},
        style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px 8px",cursor:"pointer",userSelect:"none"}
      },
        h("div", {style:{display:"flex",alignItems:"center",gap:6}},
          h("span", {style:{fontSize:9,color:"var(--text-tertiary)",display:"inline-block",transform:palChipsOpen?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s"}}, "\u25B6"),
          h("span", {style:{fontSize:12,fontWeight:600,color:"var(--text-secondary)"}}, "Palette")
        ),
        h("span", {style:{fontSize:11,color:"var(--text-tertiary)"}}, displayPal.length + " colour" + (displayPal.length !== 1 ? "s" : ""))
      ),
      palChipsOpen && h("div", {style:{padding:"0 12px 12px"}},
      isPaintMode && h("div", {
        style:{
          marginBottom:8,padding:"5px 8px",borderRadius:7,
          background: selInfo ? "#f0fdfa" : "#fffbeb",
          border: selInfo ? "1px solid #99f6e4" : "1px solid #fde68a",
          display:"flex",alignItems:"center",gap:7,fontSize:11,minHeight:30
        }
      },
        selInfo
          ? h(React.Fragment, null,
              h("span", {style:{width:16,height:16,borderRadius:3,flexShrink:0,background:"rgb("+selInfo.rgb+")",border:"1px solid #cbd5e1"}}),
              h("span", {style:{fontWeight:600,color:"#0d9488"}}, "DMC " + selInfo.id),
              h("span", {style:{color:"var(--text-secondary)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}, selInfo.name || ""),
              h("button", {
                onClick:function(){cv.setSelectedColorId(null);},
                title:"Clear selection",
                style:{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"var(--text-tertiary)",fontSize:13,lineHeight:1,padding:"0 2px",flexShrink:0}
              }, "\xD7")
            )
          : h(React.Fragment, null,
              h("span", {style:{fontSize:12}}, Icons.pointing()),
              h("span", {style:{color:"#92400e"}}, "Select a colour to paint \u2014 or right-click the canvas")
            )
      ),
      displayPal.length > 0
        ? h("div", {className:"creator-pattern-chips", style:{display:"flex",flexWrap:"wrap",gap:3}}, chips)
        : h("div", {style:{fontSize:11,color:"var(--text-tertiary)",textAlign:"center",padding:"8px 0"}}, "No colours yet")
      )
    );
  })() : null;

  // ── Crop image card ──────────────────────────────────────────────────────────
  var imageCard = (ctx.pat && gen.img && gen.img.src) ? h("div", {className:"card"},
    h("div", {
      style:{position:"relative",touchAction:"none",userSelect:"none",WebkitUserSelect:"none",WebkitTouchCallout:"none"}, ref:gen.cropRef,
      onPointerDown:gen.handleCropPointerDown,
      onPointerMove:gen.handleCropPointerMove,
      onPointerUp:gen.handleCropPointerUp,
      onPointerCancel:gen.handleCropPointerCancel,
      onPointerLeave:gen.handleCropPointerUp
    },
      h("img", {
        src:gen.img.src, alt:"",
        style:{width:"100%",display:"block",
          cursor:gen.isCropping?"crosshair":(gen.pickBg?"crosshair":"default"),
          opacity:gen.isCropping?0.7:1
        },
        onClick:gen.srcClick
      }),
      gen.isCropping && gen.cropRect && h("div", {style:{
        position:"absolute",left:gen.cropRect.x,top:gen.cropRect.y,
        width:gen.cropRect.w,height:gen.cropRect.h,
        border:"2px dashed #0d9488",background:"rgba(13,148,136,0.2)",
        boxSizing:"border-box",pointerEvents:"none"
      }})
    ),
    gen.isCropping
      ? h("div", {style:{padding:"6px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"0.5px solid #f1f5f9"}},
          h("span", {style:{fontSize:11,color:"#94a3b8"}}, "Draw a rectangle"),
          h("div", {style:{display:"flex",gap:6}},
            h("button", {
              onClick:function(){gen.setIsCropping(false); gen.setCropRect(null);},
              style:{fontSize:11,padding:"3px 8px",cursor:"pointer",border:"0.5px solid #e2e8f0",borderRadius:6,background:"#f8f9fa"}
            }, "Cancel"),
            h("button", {
              onClick:gen.applyCrop,
              style:{fontSize:11,padding:"3px 8px",cursor:"pointer",border:"none",borderRadius:6,background:"#0d9488",color:"#fff"}
            }, "Apply")
          )
        )
      : h("div", {style:{padding:"6px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"0.5px solid #f1f5f9"}},
          h("span", {style:{fontSize:11,color:"#94a3b8"}}, gen.origW+"×"+gen.origH+"px"),
          h("div", {style:{display:"flex",gap:6}},
            h("button", {
              onClick:function(){gen.setIsCropping(true); gen.setCropRect(null);},
              style:{fontSize:11,padding:"3px 8px",cursor:"pointer",border:"0.5px solid #e2e8f0",borderRadius:6,background:"#f8f9fa"}
            }, "Crop"),
            h("button", {
              onClick:function(){gen.fRef.current.click();},
              style:{fontSize:11,padding:"3px 8px",cursor:"pointer",border:"0.5px solid #e2e8f0",borderRadius:6,background:"#f8f9fa"}
            }, "Change")
          )
        ),
    gen.pickBg && h("div", {style:{padding:"6px 12px",fontSize:11,color:"#ea580c",fontWeight:600,background:"#fff7ed"}},
      "Click to pick BG"
    )
  ) : null;

  // ── Colours section (scratch mode) ─────────────────────────────────────────
  var coloursBadge = h("span", {style:{fontSize:11,fontWeight:500,color:"#0d9488",background:"#f0fdfa",padding:"1px 8px",borderRadius:10}},
    (ctx.displayPal ? ctx.displayPal.filter(function(p){return p.count>0;}).length : 0)+" used"
  );
  // ── Blend picker local state ──────────────────────────────────────────────
  var _bl1 = React.useState(null); var blendThread1 = _bl1[0], setBlendThread1 = _bl1[1];
  var _bl2 = React.useState(null); var blendThread2 = _bl2[0], setBlendThread2 = _bl2[1];
  var _blSearch = React.useState(""); var blendSearch = _blSearch[0], setBlendSearch = _blSearch[1];
  var _blMode = React.useState(false); var blendMode = _blMode[0], setBlendMode = _blMode[1];

  var blendFiltered = React.useMemo(function() {
    if (!blendSearch.trim()) return DMC;
    var q = blendSearch.toLowerCase();
    return DMC.filter(function(d) { return d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q); });
  }, [blendSearch]);

  function addBlend() {
    if (!blendThread1 || !blendThread2 || blendThread1.id === blendThread2.id) return;
    var blendId = blendThread1.id + "+" + blendThread2.id;
    var blendEntry = {
      type: "blend",
      id: blendId,
      name: blendId,
      rgb: [Math.round((blendThread1.rgb[0] + blendThread2.rgb[0]) / 2), Math.round((blendThread1.rgb[1] + blendThread2.rgb[1]) / 2), Math.round((blendThread1.rgb[2] + blendThread2.rgb[2]) / 2)],
      lab: [(blendThread1.lab[0] + blendThread2.lab[0]) / 2, (blendThread1.lab[1] + blendThread2.lab[1]) / 2, (blendThread1.lab[2] + blendThread2.lab[2]) / 2],
      threads: [blendThread1, blendThread2]
    };
    ctx.addScratchColour(blendEntry);
    setBlendThread1(null); setBlendThread2(null); setBlendSearch(""); setBlendMode(false);
  }

  var coloursSection = ctx.pat ? h(Section, {
    title:"Colours", isOpen:ctx.colPickerOpen, onToggle:ctx.setColPickerOpen, badge:coloursBadge
  },
    h("div", {style:{marginTop:8}},
      ctx.isScratchMode && h("div", {style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:4,marginBottom:8,padding:"6px 8px",background:"#f1f5f9",borderRadius:8}},
        [["1","Add colour","\u2192"],["2","Select chip","\u2192"],["3","Paint!",""]].map(function(item,i) {
          return h(React.Fragment, {key:i},
            h("div", {style:{display:"flex",alignItems:"center",gap:4}},
              h("span", {style:{width:16,height:16,borderRadius:"50%",background:"#0d9488",color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}, item[0]),
              h("span", {style:{fontSize:10,color:"#52525b",fontWeight:500,whiteSpace:"nowrap"}}, item[1])
            ),
            item[2] && h("span", {style:{fontSize:10,color:"#94a3b8"}}, item[2])
          );
        })
      ),
      // Toggle between single thread and blend mode
      h("div", {style:{display:"flex",gap:4,marginBottom:8}},
        h("button", {
          onClick:function(){ setBlendMode(false); },
          style:{flex:1,padding:"4px 8px",fontSize:11,fontWeight:blendMode?500:700,cursor:"pointer",
            border:blendMode?"1px solid #e2e8f0":"1px solid #0d9488",borderRadius:6,
            background:blendMode?"#fff":"#f0fdfa",color:blendMode?"#475569":"#0d9488"}
        }, "Single thread"),
        h("button", {
          onClick:function(){ setBlendMode(true); },
          style:{flex:1,padding:"4px 8px",fontSize:11,fontWeight:blendMode?700:500,cursor:"pointer",
            border:blendMode?"1px solid #0d9488":"1px solid #e2e8f0",borderRadius:6,
            background:blendMode?"#f0fdfa":"#fff",color:blendMode?"#0d9488":"#475569"}
        }, "Blend (2 threads)")
      ),
      !blendMode ? h(React.Fragment, null,
        h("input", {
          type:"text", placeholder:"Search by DMC # or name\u2026",
          value:ctx.dmcSearch, onChange:function(e){ctx.setDmcSearch(e.target.value);},
          style:{width:"100%",padding:"6px 10px",border:"0.5px solid #e2e8f0",borderRadius:8,fontSize:12,marginBottom:8,boxSizing:"border-box"}
        }),
        h("div", {style:{maxHeight:200,overflow:"auto",display:"flex",flexDirection:"column",gap:2}},
          ctx.dmcFiltered.slice(0,60).map(function(d) {
            var inPal = ctx.cmap && ctx.cmap[d.id];
            return h(Tooltip, {key:d.id, text:inPal?"Already in your palette":"Click to add to your palette", width:160},
              h("div", {
                onClick:function(){ctx.addScratchColour(d);},
                style:{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",borderRadius:6,cursor:"pointer",
                  background:inPal?"#f0fdfa":"#fff",
                  border:inPal?"1px solid #99f6e4":"1px solid transparent",
                  opacity:inPal?0.7:1,width:"100%"}
              },
                h("span", {style:{width:16,height:16,borderRadius:3,flexShrink:0,background:"rgb("+d.rgb[0]+","+d.rgb[1]+","+d.rgb[2]+")",border:"1px solid #cbd5e1"}}),
                h("span", {style:{fontFamily:"monospace",fontSize:12,fontWeight:600,minWidth:36,color:"#1e293b"}}, d.id),
                h("span", {style:{fontSize:11,color:"#475569",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}, d.name),
                inPal ? h("span", {style:{fontSize:10,color:"#0d9488"}}, "\u2713") : h("span", {style:{fontSize:10,color:"#94a3b8"}}, "+")
              )
            );
          }),
          ctx.dmcFiltered.length === 0 && h("div", {style:{fontSize:11,color:"#94a3b8",padding:"8px 0",textAlign:"center"}}, "No colours found")
        )
      ) : h(React.Fragment, null,
        // Blend mode UI: pick two threads
        h("div", {style:{display:"flex",gap:4,marginBottom:6,alignItems:"center"}},
          h("div", {style:{flex:1,padding:"4px 8px",borderRadius:6,border:"1px solid #e2e8f0",fontSize:11,minHeight:24,display:"flex",alignItems:"center",gap:4,background:blendThread1?"#f0fdfa":"#fff"}},
            blendThread1 ? h(React.Fragment, null,
              h("span", {style:{width:12,height:12,borderRadius:2,background:"rgb("+blendThread1.rgb+")",border:"1px solid #cbd5e1",flexShrink:0}}),
              h("span", {style:{fontWeight:600}}, blendThread1.id),
              h("span", {onClick:function(){setBlendThread1(null);},style:{cursor:"pointer",color:"#94a3b8",marginLeft:2}}, "\u2715")
            ) : h("span", {style:{color:"#94a3b8"}}, "Thread 1\u2026")
          ),
          h("span", {style:{fontSize:11,color:"#94a3b8",fontWeight:600}}, "+"),
          h("div", {style:{flex:1,padding:"4px 8px",borderRadius:6,border:"1px solid #e2e8f0",fontSize:11,minHeight:24,display:"flex",alignItems:"center",gap:4,background:blendThread2?"#f0fdfa":"#fff"}},
            blendThread2 ? h(React.Fragment, null,
              h("span", {style:{width:12,height:12,borderRadius:2,background:"rgb("+blendThread2.rgb+")",border:"1px solid #cbd5e1",flexShrink:0}}),
              h("span", {style:{fontWeight:600}}, blendThread2.id),
              h("span", {onClick:function(){setBlendThread2(null);},style:{cursor:"pointer",color:"#94a3b8",marginLeft:2}}, "\u2715")
            ) : h("span", {style:{color:"#94a3b8"}}, "Thread 2\u2026")
          )
        ),
        blendThread1 && blendThread2 && blendThread1.id !== blendThread2.id && h("button", {
          onClick:addBlend,
          style:{width:"100%",padding:"6px 0",fontSize:12,fontWeight:600,cursor:"pointer",
            border:"1px solid #0d9488",borderRadius:6,background:"#f0fdfa",color:"#0d9488",marginBottom:8}
        }, "Add blend " + blendThread1.id + "+" + blendThread2.id),
        blendThread1 && blendThread2 && blendThread1.id === blendThread2.id && h("div", {style:{fontSize:11,color:"#dc2626",marginBottom:8}}, "Pick two different threads"),
        h("input", {
          type:"text", placeholder:"Search DMC threads\u2026",
          value:blendSearch, onChange:function(e){setBlendSearch(e.target.value);},
          style:{width:"100%",padding:"6px 10px",border:"0.5px solid #e2e8f0",borderRadius:8,fontSize:12,marginBottom:8,boxSizing:"border-box"}
        }),
        h("div", {style:{maxHeight:200,overflow:"auto",display:"flex",flexDirection:"column",gap:2}},
          blendFiltered.slice(0,60).map(function(d) {
            var isSel1 = blendThread1 && blendThread1.id === d.id;
            var isSel2 = blendThread2 && blendThread2.id === d.id;
            return h("div", {
              key:d.id,
              onClick:function(){
                if (!blendThread1) setBlendThread1(d);
                else if (!blendThread2 && d.id !== blendThread1.id) setBlendThread2(d);
              },
              style:{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",borderRadius:6,cursor:"pointer",
                background:(isSel1||isSel2)?"#f0fdfa":"#fff",
                border:(isSel1||isSel2)?"1px solid #99f6e4":"1px solid transparent",
                opacity:(isSel1||isSel2)?0.7:1,width:"100%"}
            },
              h("span", {style:{width:16,height:16,borderRadius:3,flexShrink:0,background:"rgb("+d.rgb[0]+","+d.rgb[1]+","+d.rgb[2]+")",border:"1px solid #cbd5e1"}}),
              h("span", {style:{fontFamily:"monospace",fontSize:12,fontWeight:600,minWidth:36,color:"#1e293b"}}, d.id),
              h("span", {style:{fontSize:11,color:"#475569",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}, d.name),
              (isSel1||isSel2) ? h("span", {style:{fontSize:10,color:"#0d9488"}}, isSel1?"\u27981":"\u27982") : h("span", {style:{fontSize:10,color:"#94a3b8"}}, "+")
            );
          }),
          blendFiltered.length === 0 && h("div", {style:{fontSize:11,color:"#94a3b8",padding:"8px 0",textAlign:"center"}}, "No colours found")
        )
      )
    )
  ) : null;

  // ── Dimensions section ──────────────────────────────────────────────────────
  var dimBadge = h("span", {style:{fontSize:11,fontWeight:500,color:"#475569",background:"#f1f5f9",padding:"1px 8px",borderRadius:10}}, ctx.sW+"×"+ctx.sH);
  var dimSection = h(Section, {title:"Dimensions", isOpen:app.dimOpen, onToggle:app.setDimOpen, badge:dimBadge},
    h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",marginBottom:8,marginTop:8}},
      h("input", {type:"checkbox", checked:ctx.arLock, onChange:function(e){ctx.setArLock(e.target.checked);}}),
      h("span", null, "Lock aspect ratio"),
      h(InfoIcon, {text:"Keep width and height proportional when resizing", width:200})
    ),
    ctx.arLock
      ? h("div", null,
          h(SliderRow, {label:"Size", value:ctx.sW, min:10, max:300, onChange:ctx.slRsz, suffix:" st"}),
          h("div", {style:{fontSize:10,color:"#94a3b8",marginTop:2}}, "Pattern will be "+ctx.sW+"\xD7"+ctx.sH+" stitches (aspect ratio preserved)")
        )
      : h("div", {style:{display:"flex",gap:10}},
          h("div", {style:{flex:1}},
            h("label", {style:{fontSize:11,color:"#94a3b8",display:"block",marginBottom:2}}, "Width"),
            h("input", {type:"number", value:ctx.sW, onChange:function(e){ctx.chgW(e.target.value);}, style:{width:"100%",padding:"5px 8px",border:"0.5px solid #e2e8f0",borderRadius:6,fontSize:13}})
          ),
          h("div", {style:{flex:1}},
            h("label", {style:{fontSize:11,color:"#94a3b8",display:"block",marginBottom:2}}, "Height"),
            h("input", {type:"number", value:ctx.sH, onChange:function(e){ctx.chgH(e.target.value);}, style:{width:"100%",padding:"5px 8px",border:"0.5px solid #e2e8f0",borderRadius:6,fontSize:13}})
          )
        )
  );

  // ── Palette section (non-scratch) ───────────────────────────────────────────
  var palSection = !ctx.isScratchMode ? h(Section, {title:"Palette", isOpen:app.palOpen, onToggle:app.setPalOpen},
    h("div", {style:{marginTop:8}},
      h(SliderRow, {label:"Max colours", value:gen.maxC, min:10, max:gen.stashConstrained && gen.stashThreadCount ? Math.max(10, gen.stashThreadCount) : 40, onChange:gen.setMaxC,
        helpText:"Limits the colour palette. Fewer colours = faster to stitch but less detail"}),
      gen.stashConstrained && gen.stashThreadCount && gen.maxC > gen.stashThreadCount && h("div", {style:{fontSize:10,color:"#d97706",marginTop:2}},
        "Clamped to " + gen.stashThreadCount + " (stash size)"
      )
    ),
    h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:gen.blendsAutoDisabled?"not-allowed":"pointer",marginBottom:8,marginTop:8,opacity:gen.blendsAutoDisabled?0.5:1}},
      h("input", {type:"checkbox", checked:gen.allowBlends, disabled:gen.blendsAutoDisabled, onChange:function(e){gen.setAllowBlends(e.target.checked);}}),
      h("span", null, "Allow blended threads"),
      h(InfoIcon, {text:"Allow the algorithm to blend two DMC colours in a single stitch for smoother gradients", width:200})
    ),
    gen.blendsAutoDisabled && h("div", {style:{fontSize:10,color:"#94a3b8",marginBottom:8}},
      "Auto-disabled \u2014 fewer than 6 stash threads"
    ),
    typeof StashBridge !== "undefined" && h("label", {
      style:{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",marginBottom:8,marginTop:4}
    },
      h("input", {type:"checkbox", checked:gen.stashConstrained, onChange:function(e){gen.setStashConstrained(e.target.checked);}}),
      h("span", null, "Use only stash threads"),
      h(InfoIcon, {text:"Constrains the palette to threads you physically own. Produces a pattern you can stitch immediately without buying anything.", width:240})
    ),
    gen.stashConstrained && typeof StashBridge !== "undefined" && h(React.Fragment, null,
      h("div", {style:{fontSize:11,color:"#0d9488",background:"#f0fdfa",border:"1px solid #99f6e4",borderRadius:8,padding:"6px 10px",marginBottom:8}},
        (gen.stashThreadCount || 0) + " thread" + ((gen.stashThreadCount || 0) !== 1 ? "s" : "") + " in stash" +
          (gen.effectiveMaxC && gen.effectiveMaxC < gen.maxC ? " \u2014 palette limited to " + gen.effectiveMaxC + " colours" : "")
      ),
      gen.stashPalette && gen.stashPalette.length > 0 && h("div", {style:{marginBottom:8}},
        h("div", {style:{display:"flex",flexWrap:"wrap",gap:2,marginBottom:2}},
          (stashStripExpanded ? gen.stashPalette : gen.stashPalette.slice(0,60)).map(function(t) {
            return h(Tooltip, {key:t.id, text:"DMC " + t.id + " \u2014 " + t.name, width:140},
              h("div", {style:{width:12,height:12,borderRadius:2,background:"rgb(" + t.rgb.join(",") + ")"}})
            );
          })
        ),
        gen.stashPalette.length > 60 && h("button", {
          onClick:function(){setStashStripExpanded(function(o){return !o;});},
          style:{fontSize:10,color:"#0d9488",background:"none",border:"none",cursor:"pointer",padding:"0 2px"}
        }, stashStripExpanded ? "Show less" : "+" + (gen.stashPalette.length - 60) + " more")
      ),
      gen.coverageGaps && gen.coverageGaps.hasGaps && h("div", {style:{
        fontSize:11,background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,
        padding:"6px 10px",marginBottom:8,color:"#991b1b",display:"flex",alignItems:"flex-start",gap:6
      }},
        h("span", {style:{fontSize:13,lineHeight:1,flexShrink:0}}, Icons.warning()),
        h("span", null, "Your stash may lack coverage in: ",
          gen.coverageGaps.gaps.map(function(g, i) {
            return h("span", {key:g.hue},
              (i > 0 ? ", " : ""),
              h("strong", null, g.hue),
              g.severity === "high" ? " (significant)" : ""
            );
          })
        )
      ),
      h("div", {style:{marginBottom:8}},
        h("div", {style:{fontSize:11,color:"#475569",marginBottom:4,fontWeight:500}}, "Quick-add thread to stash"),
        h("div", {style:{display:"flex",alignItems:"center",gap:6}},
          h("input", {
            type:"text", value:qaVal,
            placeholder:"DMC number\u2026",
            onChange:function(e){setQaVal(e.target.value);},
            style:{flex:1,padding:"4px 8px",fontSize:12,borderRadius:6,border:"0.5px solid #e2e8f0",fontFamily:"inherit"}
          }),
          (function(){
            var dmc = typeof DMC !== "undefined" && DMC.find(function(d){return d.id === qaVal.trim();});
            return dmc ? h(Tooltip, {text:"DMC " + dmc.id + " \u2014 " + dmc.name, width:160},
              h("div", {style:{width:18,height:18,borderRadius:3,background:"rgb(" + dmc.rgb.join(",") + ")"}})
            ) : null;
          })(),
          h("button", {
            disabled:qaLoading || !(typeof DMC !== "undefined" && DMC.find(function(d){return d.id === qaVal.trim();})),
            onClick:function(){
              var trimmed = qaVal.trim();
              if (!trimmed || !(typeof DMC !== "undefined" && DMC.find(function(d){return d.id === trimmed;}))) return;
              setQaLoading(true);
              StashBridge.addToStash(trimmed, 1).then(function(){
                setQaVal(""); setQaLoading(false);
                ctx.setGlobalStash(function(s){
                  var n = Object.assign({}, s);
                  if (!n[trimmed]) n[trimmed] = {};
                  n[trimmed] = Object.assign({}, n[trimmed], {owned: (n[trimmed].owned || 0) + 1});
                  return n;
                });
              }).catch(function(){ setQaLoading(false); });
            },
            style:{fontSize:11,padding:"4px 10px",borderRadius:6,border:"0.5px solid #99f6e4",background:qaLoading?"#e2e8f0":"#f0fdfa",color:"#0d9488",cursor:"pointer",fontFamily:"inherit"}
          }, qaLoading ? "\u2026" : "+ Add")
        )
      ),
      h("div", {style:{borderTop:"0.5px solid #e2e8f0",marginTop:8,paddingTop:10}},
        h("div", {style:{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}},
          h("button", {
            onClick:function(){ gen.randomise(); },
            disabled:!(gen.stashPalette && gen.stashPalette.length > 0) || !gen.img,
            style:{display:"flex",alignItems:"center",gap:4,fontSize:12,fontWeight:500,padding:"5px 12px",borderRadius:8,border:"0.5px solid #99f6e4",background:"#f0fdfa",color:"#0d9488",cursor:"pointer",fontFamily:"inherit"}
          }, Icons.shuffle(), " Randomise"),
          gen.variationSeed ? (seedEditing ?
            h("span", {style:{display:"flex",alignItems:"center",gap:3}},
              h("input", {
                type:"number", value:seedTmp, autoFocus:true,
                onChange:function(e){setSeedTmp(e.target.value);},
                onKeyDown:function(e){
                  if (e.key==="Enter"){ var n=parseInt(seedTmp,10); if(!isNaN(n)&&n>0){gen.applyVariationSeed(n>>>0);} setSeedEditing(false); }
                  else if(e.key==="Escape"){setSeedEditing(false);}
                },
                onBlur:function(){setSeedEditing(false);},
                style:{width:70,padding:"2px 4px",fontSize:10,borderRadius:4,border:"0.5px solid #99f6e4",fontFamily:"inherit"}
              })
            ) :
            h("span", {
              onClick:function(){setSeedEditing(true);setSeedTmp(String(gen.variationSeed));},
              title:"Click to enter a specific seed",
              style:{fontSize:10,color:"#94a3b8",cursor:"pointer",userSelect:"none",fontVariantNumeric:"tabular-nums"}
            }, "#" + gen.variationSeed)
          ) : null
        ),
        gen.stashConstrained && gen.variationSeed && gen.variationSubset && gen.stashPalette && gen.stashPalette.length >= 3 && h("div", {
          style:{fontSize:10,color:"#0d9488",marginBottom:6,display:"flex",alignItems:"center",gap:4}
        }, Icons.dice(), " Roulette \u2014 using " + gen.variationSubset.length + " of " + gen.stashPalette.length + " threads"),
        h("button", {
          onClick:function(){
            gen.setGalleryOpen(function(o){return !o;});
            if (!gen.galleryOpen) gen.generateGallery();
          },
          style:{fontSize:11,color:"#475569",background:"none",border:"none",cursor:"pointer",padding:"0",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4,marginBottom:4}
        },
          h("span", {style:{fontSize:9,display:"inline-block",transform:gen.galleryOpen?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s"}}, "\u25B6"),
          "Explore variations"
        ),
        gen.galleryOpen && h("div", {style:{marginTop:4}},
          h("div", {style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}},
            gen.gallerySlots.map(function(slot, i) {
              return h("div", {
                key:i,
                onClick:function(){ if (!slot.loading && slot.url) { gen.promoteVariation(slot); gen.setGalleryOpen(false); } },
                style:{
                  borderRadius:8,overflow:"hidden",border:"0.5px solid #e2e8f0",
                  cursor:(!slot.loading && slot.url) ? "pointer" : "default",
                  background:"#f8fafc",transition:"border-color 0.15s"
                }
              },
                slot.loading ?
                  h("div", {style:{height:60,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#94a3b8"}}, "\u2026") :
                slot.url ?
                  h("div", null,
                    h("img", {src:slot.url, style:{width:"100%",display:"block",imageRendering:"pixelated"}}),
                    h("div", {style:{padding:"3px 6px",fontSize:9,color:"#475569"}},
                      "#" + slot.seed + " \u00B7 " + slot.threadCount + " threads"
                    )
                  ) :
                  h("div", {style:{height:60,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#ef4444"}}, "Error")
              );
            })
          ),
          h("div", {style:{display:"flex",justifyContent:"center"}},
            h("button", {
              onClick:function(){ gen.generateGallery(); },
              style:{fontSize:11,padding:"4px 12px",borderRadius:6,border:"0.5px solid #e2e8f0",background:"#fff",color:"#475569",cursor:"pointer",fontFamily:"inherit"}
            }, "New batch")
          )
        ),
        gen.variationHistory.length > 0 && h("div", {style:{marginTop:8}},
          h("div", {style:{fontSize:10,color:"#94a3b8",marginBottom:4}}, "Recent variations"),
          h("div", {style:{display:"flex",gap:4,overflowX:"auto",paddingBottom:4}},
            gen.variationHistory.map(function(entry, i) {
              return h("div", {
                key:(entry.timestamp || i) + "-" + i,
                onClick:function(){ gen.applyVariationSeed(entry.seed, entry.subset !== undefined ? entry.subset : null); },
                title:"Seed #" + entry.seed,
                style:{flexShrink:0,cursor:"pointer",borderRadius:4,overflow:"hidden",border:"0.5px solid #e2e8f0"}
              },
                entry.previewUrl ?
                  h("img", {src:entry.previewUrl, style:{width:32,height:32,display:"block",imageRendering:"pixelated",objectFit:"cover"}}) :
                  h("div", {style:{width:32,height:32,background:"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#94a3b8"}}, "?"),
                h("div", {style:{fontSize:7,color:"#94a3b8",textAlign:"center",padding:"1px 2px"}}, "#" + entry.seed)
              );
            })
          )
        )
      )
    ),
    h("div", {style:{marginTop:8}},
      h(SliderRow, {label:"Min stitches per colour", value:gen.minSt, min:0, max:50, onChange:gen.setMinSt,
        format:function(v){return v===0?"Off":v;},
        helpText:"Colours used fewer than this many times will be merged into the nearest similar colour"})
    ),
    h("div", {style:{marginTop:8}},
      h(SliderRow, {label:"Remove Orphans", value:gen.orphans, min:0, max:3, onChange:gen.setOrphans,
        format:function(v){return v===0?"Off":String(v);},
        helpText:"Removes isolated stitches with no same-colour neighbours — reduces confetti and makes the pattern easier to stitch"}),
      gen.orphans > 0 && (function() {
        var desc;
        if (gen.orphans === 1) {
          desc = h("span", null, "Removes ", h("strong", null, "isolated single stitches"), " \u2014 cells with no same-colour neighbour. On your ", ctx.sW, "\xD7", ctx.sH, " grid, this targets clusters of exactly 1 stitch.");
        } else if (gen.orphans === 2) {
          desc = h("span", null, "Removes clusters of ", h("strong", null, "1\u20132 stitches"), " that are isolated from their colour group. On your ", ctx.sW, "\xD7", ctx.sH, " grid (", (ctx.sW*ctx.sH).toLocaleString(), " cells), this is ", ctx.sW <= 50 ? h("span", {style:{color:"#d97706",fontWeight:600}}, "moderately aggressive") : "a balanced cleanup", ".");
        } else {
          desc = h("span", null, "Removes clusters of ", h("strong", null, "1\u20133 stitches"), " that are isolated. On your ", ctx.sW, "\xD7", ctx.sH, " grid, this is ", ctx.sW <= 40 ? h("span", {style:{color:"#dc2626",fontWeight:600}}, "very aggressive") : ctx.sW <= 80 ? h("span", {style:{color:"#d97706",fontWeight:600}}, "moderately aggressive") : "a thorough cleanup", ".");
        }
        return h("div", {style:{fontSize:11,color:"#475569",marginTop:4,lineHeight:1.5}}, desc);
      })()
    ),
    gen.orphans > 0 && app.previewStats && app.previewStats.confettiCleanSingles != null && h("div", {style:{fontSize:11,color:"#94a3b8",marginTop:2}},
      "Preview estimate: removes ~", (app.previewStats.confettiSingles - app.previewStats.confettiCleanSingles).toLocaleString(), " isolated stitches",
      " (", ((app.previewStats.confettiSingles - app.previewStats.confettiCleanSingles) / Math.max(1, app.previewStats.stitchable) * 100).toFixed(1), "% of pattern)"
    ),
    ctx.pat && gen.cleanupDiff && h("div", {style:{marginTop:6,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}},
      h("button", {
        onClick:function(){gen.setShowCleanupDiff(function(d){return !d;});},
        style:{
          fontSize:11,padding:"3px 8px",borderRadius:6,cursor:"pointer",
          border:gen.showCleanupDiff?"1px solid #0d9488":"0.5px solid #e2e8f0",
          background:gen.showCleanupDiff?"#f0fdfa":"#fff",
          color:gen.showCleanupDiff?"#0d9488":"#475569",
          fontWeight:gen.showCleanupDiff?600:400,
          display:"flex",alignItems:"center",gap:4,lineHeight:1.4
        }
      }, Icons.eye(), " " + (gen.showCleanupDiff ? "Hide changes" : "Show changes"))
    ),
    gen.showCleanupDiff && gen.cleanupDiff && h("div", {style:{
      fontSize:11,color:"#475569",padding:"6px 10px",
      background:"#fdf4ff",border:"1px solid #f0abfc",borderRadius:8,
      marginTop:4,lineHeight:1.5
    }},
      h("span", {style:{color:"#a855f7",fontWeight:700,marginRight:4}}, "\u25CF"),
      gen.cleanupDiff.count.toLocaleString(), " stitches changed",
      ctx.totalStitchable > 0 ? " (" + (gen.cleanupDiff.count / ctx.totalStitchable * 100).toFixed(1) + "%)" : "",
      Object.keys(gen.cleanupDiff.byColour).length > 0 && h("span", {style:{marginLeft:8,color:"#94a3b8"}},
        Object.entries(gen.cleanupDiff.byColour)
          .sort(function(a,b){return b[1]-a[1];})
          .slice(0,4)
          .map(function(e){return "DMC "+e[0]+": "+e[1];})
          .join(" \xB7 ") +
          (Object.keys(gen.cleanupDiff.byColour).length > 4 ? " \xB7 +" + (Object.keys(gen.cleanupDiff.byColour).length - 4) + " more" : "")
      )
    ),
    (function() {
      var warning = getCleanupWarning(ctx.sW, ctx.sH, gen.orphans, app.previewStats);
      if (!warning) return null;
      var isDanger = warning.level === "danger";
      return h("div", {style:{
        marginTop:6,padding:"8px 10px",borderRadius:8,fontSize:11,lineHeight:1.5,
        background:isDanger?"#fef2f2":"#fffbeb",
        border:"1px solid "+(isDanger?"#fecaca":"#fde68a"),
        color:isDanger?"#991b1b":"#92400e",
        display:"flex",alignItems:"flex-start",gap:6
      }},
        h("span", {style:{fontSize:14,lineHeight:1,flexShrink:0}}, isDanger?Icons.warning():Icons.lightbulb()),
        h("span", null, warning.message)
      );
    })(),
    h("button", {
      onClick:function(){app.setPalAdvanced(function(o){return !o;});},
      style:{marginTop:8,display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#475569",background:"none",border:"none",cursor:"pointer",padding:"2px 0",fontFamily:"inherit"}
    },
      h("span", {style:{fontSize:9,display:"inline-block",transform:app.palAdvanced?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s"}}, "\u25B6"),
      "Dithering",
      gen.dith ? h("span", {style:{width:6,height:6,borderRadius:"50%",background:"#0d9488",display:"inline-block",marginLeft:2}}) : null
    ),
    app.palAdvanced && h(React.Fragment, null,
      h("div", {style:{marginTop:6,padding:"8px 10px",background:"#fff7ed",borderRadius:8,border:"0.5px solid #fed7aa",fontSize:10,color:"#b45309"}},
        "Dithering blends colours by mixing stitches. Direct mapping uses solid colours only."
      ),
      h("div", {style:{display:"flex",gap:6,marginTop:6}},
        h("div", {style:{display:"flex",gap:2,background:"#f1f5f9",borderRadius:8,padding:2,flex:1}},
          h(Tooltip, {text:"Maps each pixel directly to its closest DMC colour. Fewer scattered stitches", width:200},
            h("button", {
              onClick:function(){gen.setDith(false);},
              style:{padding:"5px 12px",fontSize:12,fontWeight:!gen.dith?500:400,background:!gen.dith?"#fff":"transparent",borderRadius:6,color:!gen.dith?"#1e293b":"#475569",border:"none",cursor:"pointer",boxShadow:!gen.dith?"0 1px 2px rgba(0,0,0,0.04)":"none",flex:1}
            }, "Direct")
          ),
          h(Tooltip, {text:"Uses Floyd-Steinberg error diffusion for smoother colour gradients, but creates more scattered stitches", width:220},
            h("button", {
              onClick:function(){gen.setDith(true);},
              style:{padding:"5px 12px",fontSize:12,fontWeight:gen.dith?500:400,background:gen.dith?"#fff":"transparent",borderRadius:6,color:gen.dith?"#1e293b":"#475569",border:"none",cursor:"pointer",boxShadow:gen.dith?"0 1px 2px rgba(0,0,0,0.04)":"none",flex:1}
            }, "Dithered")
          )
        )
      )
    )
  ) : null;

  // ── Stitch Cleanup section (non-scratch) ────────────────────────────────────
  var cleanupSection = !ctx.isScratchMode ? (function() {
    var sc2 = gen.stitchCleanup;
    var scBadge = h("span", {style:{
      fontSize:11,fontWeight:500,padding:"1px 8px",borderRadius:10,
      color:sc2.enabled?"#0d9488":"#94a3b8",background:sc2.enabled?"#f0fdfa":"#f1f5f9"
    }}, sc2.enabled ? "On \u2014 "+(sc2.strength[0].toUpperCase()+sc2.strength.slice(1)) : "Off");
    var strengthKeys=["gentle","balanced","thorough"];
    var strengthLabels=["Gentle","Balanced","Thorough"];
    var strengthDescs=["Keeps 2-stitch clusters. Best for detail-heavy designs.","Removes 3-stitch clusters. Balanced stitchability & detail.","Removes up to 5-stitch clusters. Smoothest, easiest to sew."];
    var strengthIdx=strengthKeys.indexOf(sc2.strength);
    return h(Section, {title:"Stitch Cleanup", isOpen:app.cleanupOpen, onToggle:app.setCleanupOpen, badge:scBadge},
      h("div", {style:{marginTop:8}},
        h(Toggle, {
          checked:sc2.enabled,
          onChange:function(v){gen.setStitchCleanup(function(s){return Object.assign({},s,{enabled:v});});},
          label:"Stitch Cleanup",
          help:"Automatically removes scattered single stitches that are hard to sew. Turn off if you want to keep the full dithered detail."
        }),
        sc2.enabled && h(React.Fragment, null,
          h("div", {style:{marginBottom:10,padding:"8px 10px",background:"#f0fdfa",borderRadius:8,border:"0.5px solid #99f6e4",fontSize:11,color:"#0d9488",fontWeight:500}},
            "Removes scattered single stitches (confetti) that are impractical to sew \u2014 especially in dithered areas and gradients."
          ),
          h("div", {style:{marginTop:4,marginBottom:10}},
            h("div", {style:{display:"flex",alignItems:"center",gap:4,marginBottom:4}},
              h("span", {style:{fontSize:12,color:"#52525b",fontWeight:500}}, "Cleanup strength"),
              h(InfoIcon, {text:"How aggressively scattered stitches are merged into nearby colours. Gentle keeps more detail. Thorough creates smoother, easier-to-sew blocks.", width:220})
            ),
            h("input", {
              type:"range",min:0,max:2,step:1,value:strengthIdx,
              onChange:function(e){gen.setStitchCleanup(function(s){return Object.assign({},s,{strength:strengthKeys[+e.target.value]});});},
              style:{width:"100%",accentColor:"#0d9488"}
            }),
            h("div", {style:{display:"flex",justifyContent:"space-between",marginTop:6,gap:4}},
              strengthLabels.map(function(l,i) {
                return h(Tooltip, {key:l, text:strengthDescs[i], width:160},
                  h("span", {
                    style:{fontSize:10,color:strengthIdx===i?"#0d9488":"#94a3b8",fontWeight:strengthIdx===i?600:400,cursor:"pointer",padding:"2px 4px",borderRadius:4,transition:"all 0.15s",background:strengthIdx===i?"#e0f7f4":"transparent"},
                    onClick:function(){gen.setStitchCleanup(function(s){return Object.assign({},s,{strength:strengthKeys[i]});});}
                  }, l)
                );
              })
            )
          ),
          h(Toggle, {
            checked:sc2.protectDetails,
            onChange:function(v){gen.setStitchCleanup(function(s){return Object.assign({},s,{protectDetails:v});});},
            label:"Protect fine details",
            help:"Uses edge detection to preserve small stitches in important outlines \u2014 eyes, lettering, thin lines. Turn off for simpler designs."
          }),
          h(Toggle, {
            checked:sc2.smoothDithering,
            onChange:function(v){gen.setStitchCleanup(function(s){return Object.assign({},s,{smoothDithering:v});});},
            label:"Smooth dithering",
            help:"Reduces confetti during dithering itself (before cleanup runs). Cleaner output, but may slightly shift colors in gradient areas."
          })
        )
      )
    );
  })() : null;

  // ── Fabric & Floss section ──────────────────────────────────────────────────
  var fabBadge = h("span", {style:{fontSize:11,fontWeight:500,color:"#475569",background:"#f1f5f9",padding:"1px 8px",borderRadius:10}}, ctx.fabricCt+"ct");
  var fabSection = h(Section, {title:"Fabric & Floss", isOpen:app.fabOpen, onToggle:app.setFabOpen, badge:fabBadge},
    h("div", {style:{marginTop:8}},
      h("div", {style:{display:"flex",alignItems:"center",gap:4,marginBottom:4}},
        h("span", {style:{fontSize:12,color:"#475569",fontWeight:600}}, "Fabric count"),
        h(InfoIcon, {text:"The thread count of your Aida or evenweave fabric — affects finished size and skein estimates", width:220})
      ),
      h("select", {
        value:ctx.fabricCt, onChange:function(e){ctx.setFabricCt(Number(e.target.value));},
        style:{width:"100%",padding:"6px 10px",borderRadius:8,border:"0.5px solid #e2e8f0",fontSize:13,background:"#fff"}
      }, FABRIC_COUNTS.map(function(f) {
        return h("option", {key:f.ct, value:f.ct}, f.label);
      })),
      h("div", {style:{fontSize:11,color:"#94a3b8",marginTop:6}}, "Affects skein & finished size estimates. Assumes 2 strands, 8m per skein.")
    )
  );

  // ── Adjustments section (non-scratch) ──────────────────────────────────────
  var adjBadge = (gen.bri||gen.con||gen.sat||gen.smooth) ? h("span", {style:{width:6,height:6,borderRadius:"50%",background:"#0d9488",display:"inline-block"}}) : null;
  var adjSection = !ctx.isScratchMode ? h(Section, {title:"Adjustments", isOpen:app.adjOpen, onToggle:app.setAdjOpen, badge:adjBadge},
    h("div", {style:{marginTop:8}},
      h(SliderRow, {label:"Smooth", value:gen.smooth, min:0, max:4, step:0.1, onChange:gen.setSmooth,
        format:function(v){return v===0?"Off":v.toFixed(1);},
        helpText:"Blur filter to reduce noise in grainy or low-resolution photos"}),
      gen.smooth===0 && h("div", {style:{fontSize:11,color:"#94a3b8",marginTop:2}}, "Try 1\u20132 for noisy or low-resolution photos"),
      gen.smooth>0 && h("div", {style:{display:"flex",gap:6,margin:"6px 0"}},
        h("div", {style:{display:"flex",gap:2,background:"#f1f5f9",borderRadius:8,padding:2,flex:1}},
          h(Tooltip, {text:"Preserves edges better. Best for most photos", width:180},
            h("button", {onClick:function(){gen.setSmoothType("median");}, style:{padding:"5px 12px",fontSize:12,fontWeight:gen.smoothType==="median"?500:400,background:gen.smoothType==="median"?"#fff":"transparent",borderRadius:6,color:gen.smoothType==="median"?"#1e293b":"#475569",border:"none",cursor:"pointer",boxShadow:gen.smoothType==="median"?"0 1px 2px rgba(0,0,0,0.04)":"none",flex:1}}, "Median")
          ),
          h(Tooltip, {text:"Stronger overall blur. Better for very grainy or pixelated images", width:180},
            h("button", {onClick:function(){gen.setSmoothType("gaussian");}, style:{padding:"5px 12px",fontSize:12,fontWeight:gen.smoothType==="gaussian"?500:400,background:gen.smoothType==="gaussian"?"#fff":"transparent",borderRadius:6,color:gen.smoothType==="gaussian"?"#1e293b":"#475569",border:"none",cursor:"pointer",boxShadow:gen.smoothType==="gaussian"?"0 1px 2px rgba(0,0,0,0.04)":"none",flex:1}}, "Gaussian")
          )
        )
      ),
      h(SliderRow, {label:"Brightness", value:gen.bri, min:-50, max:50, onChange:gen.setBri, format:function(v){return (v>0?"+":"")+v+"%";}}),
      h(SliderRow, {label:"Contrast", value:gen.con, min:-50, max:50, onChange:gen.setCon, format:function(v){return (v>0?"+":"")+v+"%";}}),
      h(SliderRow, {label:"Saturation", value:gen.sat, min:-50, max:50, onChange:gen.setSat, format:function(v){return (v>0?"+":"")+v+"%";}})
    )
  ) : null;

  // ── Background section (non-scratch) ───────────────────────────────────────
  var bgBadge = gen.skipBg ? h("span", {style:{width:6,height:6,borderRadius:"50%",background:"#16a34a",display:"inline-block"}}) : null;
  var bgSection = !ctx.isScratchMode ? h(Section, {title:"Background", isOpen:app.bgOpen, onToggle:app.setBgOpen, badge:bgBadge},
    h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",marginTop:8}},
      h("input", {type:"checkbox", checked:gen.skipBg, onChange:function(e){gen.setSkipBg(e.target.checked);}}),
      h("span", null, "Skip background"),
      h(InfoIcon, {text:"Exclude pixels matching a chosen colour, leaving them unstitched. Good for solid colour backgrounds", width:220})
    ),
    gen.skipBg && h("div", {style:{marginTop:10}},
      h("div", {style:{display:"flex",alignItems:"center",gap:8,marginBottom:10}},
        h("div", {
          onClick:function(){gen.setPickBg(true);},
          style:{width:24,height:24,borderRadius:6,background:"rgb("+gen.bgCol+")",border:"2px solid #e2e8f0",cursor:"pointer"}
        }),
        h("button", {
          onClick:function(){gen.setPickBg(true);},
          style:{fontSize:11,padding:"3px 8px",border:"0.5px solid #e2e8f0",borderRadius:6,background:"#f8f9fa",cursor:"pointer"}
        }, "Pick")
      ),
      h(SliderRow, {label:"Tolerance", value:gen.bgTh, min:3, max:50, onChange:gen.setBgTh,
        helpText:"How closely a pixel must match the background colour to be skipped. Higher = more pixels removed"}),
      ctx.pat && h("div", {style:{marginTop:10,padding:"8px",background:"#f1f5f9",borderRadius:8,fontSize:11,color:"#475569"}},
        h("div", {style:{marginBottom:6}}, "Want to shrink the pattern to fit only the stitches?"),
        h("button", {
          onClick:gen.autoCrop,
          style:{width:"100%",padding:"6px",fontSize:12,fontWeight:500,background:"#fff",border:"1px solid #cbd5e1",borderRadius:6,cursor:"pointer",color:"#1e293b"}
        }, "Auto-Crop to Stitches")
      )
    )
  ) : null;

  // ── Generate / Reset button ─────────────────────────────────────────────────
  var actionBtn = ctx.isScratchMode
    ? h("button", {
        onClick:function(){ctx.initBlankGrid(ctx.sW, ctx.sH);},
        style:{padding:"8px 14px",fontSize:12,fontWeight:600,background:"#dc2626",color:"#fff",border:"none",borderRadius:8,cursor:"pointer"}
      }, "Reset Canvas")
    : h("button", {
        onClick:gen.generate, disabled:gen.busy,
        style:{padding:"8px 14px",fontSize:12,fontWeight:600,
          background:gen.busy?"#94a3b8":"#0d9488",color:"#fff",
          border:"none",borderRadius:8,cursor:gen.busy?"wait":"pointer"}
      }, gen.busy ? "Generating..." : (ctx.pat ? "Regenerate" : "Generate Pattern"));

  // ─── Mode-aware sidebar tab bar ────────────────────────────────────────────
  var mode = app.appMode || "edit";
  var sTab = app.sidebarTab || "settings";

  var createTabs = [["settings","Settings"],["preview","Preview"]];
  var editTabs = [["palette","Palette"],["view","View"],["preview","Preview"],["more","More"]];
  var tabs = mode === "create" ? createTabs : editTabs;

  // Ensure sidebarTab is valid for current mode
  var validIds = tabs.map(function(t) { return t[0]; });
  if (validIds.indexOf(sTab) === -1) sTab = validIds[0];

  var tabBar = h("div", {
    role:"tablist", "aria-label":mode === "create" ? "Create mode panels" : "Edit mode panels",
    style:{display:"flex",borderBottom:"1px solid var(--border)",background:"var(--surface)"}
  }, tabs.map(function(kl) {
    return h("button", {
      key:kl[0],
      role:"tab",
      "aria-selected":sTab===kl[0],
      "aria-controls":"sidebar-panel-"+kl[0],
      onClick:function(){ app.setSidebarTab(kl[0]); },
      style:{
        flex:1,padding:"8px 2px",fontSize:11,fontWeight:sTab===kl[0]?600:400,
        border:"none",borderBottom:sTab===kl[0]?"2px solid var(--accent)":"2px solid transparent",
        cursor:"pointer",fontFamily:"inherit",
        background:"transparent",
        color:sTab===kl[0]?"var(--accent)":"var(--text-secondary)",
      }
    }, kl[1]);
  }));

  // ─── View toggle (shared between View tab content in both modes) ─────────
  var viewToggle = (ctx.pat && ctx.pal) ? h("div", {
    style:{padding:"8px 12px",display:"flex",alignItems:"center",gap:8}
  },
    h("span", {style:{fontSize:11,fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginRight:4}}, "View"),
    h("div", {style:{display:"flex",gap:2,background:"var(--surface-tertiary)",borderRadius:8,padding:2,flex:1}},
      [["color","Colour"],["symbol","Symbol"],["both","Both"]].map(function(kl) {
        return h("button", {
          key:kl[0],
          onClick:function(){cv.setView(kl[0]);},
          title:"Cycle view (V)",
          style:{
            flex:1,padding:"4px 6px",fontSize:11,fontWeight:cv.view===kl[0]?600:400,
            border:"none",cursor:"pointer",borderRadius:6,fontFamily:"inherit",
            background:cv.view===kl[0]?"var(--surface)":"transparent",
            color:cv.view===kl[0]?"var(--text-primary)":"var(--text-secondary)",
            boxShadow:cv.view===kl[0]?"var(--shadow-sm)":"none"
          }
        }, kl[1]);
      })
    )
  ) : null;

  // ─── Highlight mode controls (shared between Edit and Track View tabs) ──
  var highlightControls = cv.hiId ? h("div", {style:{padding:"8px 12px",borderTop:"0.5px solid var(--border)"}},
    h("div", {style:{fontSize:11,fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",marginBottom:6}}, "Highlight Mode"),
    h("div", {style:{display:"flex",gap:3,flexWrap:"wrap"}},
      [["isolate","Isolate"],["outline","Outline"],["tint","Tint"],["spotlight","Spotlight"]].map(function(kl) {
        return h("button", {
          key:kl[0],
          onClick:function(){ cv.setHighlightMode(kl[0]); },
          style:{
            flex:1,padding:"4px 6px",fontSize:10,fontWeight:cv.highlightMode===kl[0]?600:400,
            border:"1px solid "+(cv.highlightMode===kl[0]?"var(--accent)":"var(--border)"),
            cursor:"pointer",borderRadius:6,fontFamily:"inherit",
            background:cv.highlightMode===kl[0]?"var(--accent-light)":"transparent",
            color:cv.highlightMode===kl[0]?"var(--accent)":"var(--text-secondary)",
          }
        }, kl[1]);
      })
    ),
    cv.highlightMode === "isolate" && h("div", {style:{marginTop:6}},
      h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"var(--text-secondary)"}},
        "Dim strength",
        h("input", {type:"range",min:0,max:1,step:0.05,value:cv.bgDimOpacity,
          onChange:function(e){cv.setBgDimOpacity(parseFloat(e.target.value));}})
      )
    ),
    cv.highlightMode === "tint" && h("div", {style:{marginTop:6,display:"flex",alignItems:"center",gap:6}},
      h("label", {style:{fontSize:11,color:"var(--text-secondary)"}}, "Tint"),
      h("input", {type:"color",value:cv.tintColor,onChange:function(e){cv.setTintColor(e.target.value);},style:{width:24,height:20,border:"none",padding:0,cursor:"pointer"}}),
      h("input", {type:"range",min:0,max:1,step:0.05,value:cv.tintOpacity,
        onChange:function(e){cv.setTintOpacity(parseFloat(e.target.value));}})
    ),
    cv.highlightMode === "spotlight" && h("div", {style:{marginTop:6}},
      h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"var(--text-secondary)"}},
        "Dim strength",
        h("input", {type:"range",min:0,max:1,step:0.05,value:cv.spotDimOpacity,
          onChange:function(e){cv.setSpotDimOpacity(parseFloat(e.target.value));}})
      )
    )
  ) : null;

  // ─── Preview panel (shared between Create and Edit) ──────────────────────
  var isRealistic = app.previewMode === "realistic";
  var previewPanel = h("div", {style:{padding:"12px"}},
    h("div", {style:{fontSize:11,fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",marginBottom:8}}, "Chart Mode"),
    h("div", {style:{display:"flex",gap:3,marginBottom:12}},
      [["chart","Chart"],["pixel","Pixel"],["realistic","Realistic"]].map(function(kl) {
        var active = (!app.previewActive && kl[0]==="chart") || (app.previewActive && app.previewMode===kl[0]);
        return h("button", {
          key:kl[0],
          onClick:function(){
            if(kl[0]==="chart"){app.setPreviewActive(false);}
            else{app.setPreviewActive(true);app.setPreviewMode(kl[0]);}
          },
          style:{
            flex:1,padding:"6px 4px",fontSize:11,fontWeight:active?600:400,
            border:"1px solid "+(active?"var(--accent)":"var(--border)"),
            cursor:"pointer",borderRadius:6,fontFamily:"inherit",
            background:active?"var(--accent-light)":"transparent",
            color:active?"var(--accent)":"var(--text-secondary)",
          }
        }, kl[1]);
      })
    ),
    isRealistic && app.previewActive && h(React.Fragment, null,
      h("div", {style:{fontSize:11,fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",marginBottom:4}}, "Quality Level"),
      h("div", {style:{display:"flex",gap:3,marginBottom:12}},
        [1,2,3,4].map(function(lv) {
          return h("button", {
            key:lv,
            onClick:function(){app.setRealisticLevel(lv);},
            style:{
              flex:1,padding:"5px 4px",fontSize:11,fontWeight:app.realisticLevel===lv?600:400,
              border:"1px solid "+(app.realisticLevel===lv?"var(--accent)":"var(--border)"),
              cursor:"pointer",borderRadius:6,fontFamily:"inherit",
              background:app.realisticLevel===lv?"var(--accent-light)":"transparent",
              color:app.realisticLevel===lv?"var(--accent)":"var(--text-secondary)",
            }
          }, "Level "+lv);
        })
      )
    ),
    h("div", {style:{display:"flex",alignItems:"center",gap:8,marginBottom:6}},
      h("label", {style:{fontSize:11,color:"var(--text-secondary)",flexShrink:0}}, "Coverage"),
      h("input", {type:"range",min:0,max:1,step:0.05,
        value:app.coverageOverride!=null?app.coverageOverride:0.5,
        onChange:function(e){app.setCoverageOverride(parseFloat(e.target.value));},
        style:{flex:1}
      }),
      app.coverageOverride!=null && h("button", {
        onClick:function(){app.setCoverageOverride(null);},
        style:{fontSize:10,padding:"2px 6px",border:"1px solid var(--border)",borderRadius:4,background:"var(--surface)",cursor:"pointer",color:"var(--text-secondary)"}
      }, "\u21BA Auto")
    ),
    h("div", {style:{display:"flex",gap:3,marginBottom:12}},
      [["Sparse",0.25],["Standard",0.50],["Dense",0.80],["Full",0.95]].map(function(preset) {
        var active = app.coverageOverride!=null && Math.abs(app.coverageOverride - preset[1]) < 0.03;
        return h("button", {
          key:preset[0],
          onClick:function(){app.setCoverageOverride(preset[1]);},
          style:{
            flex:1,fontSize:9,padding:"3px 0",
            border:"1px solid "+(active?"var(--accent)":"var(--border)"),
            borderRadius:4,background:active?"var(--accent)":"transparent",
            color:active?"#fff":"var(--text-secondary)",cursor:"pointer"
          }
        }, preset[0]);
      })
    ),
    h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"var(--text-secondary)",marginBottom:4}},
      h("input", {type:"checkbox",checked:app.previewShowGrid,onChange:function(){app.setPreviewShowGrid(!app.previewShowGrid);}}),
      "Grid overlay"
    ),
    h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"var(--text-secondary)"}},
      h("input", {type:"checkbox",checked:app.previewFabricBg,onChange:function(){app.setPreviewFabricBg(!app.previewFabricBg);}}),
      "Fabric background"
    )
  );

  // ─── Create Mode Sidebar ─────────────────────────────────────────────────
  if (mode === "create") {
    var settingsContent = h(React.Fragment, null,
      imageCard,
      dimSection,
      palSection,
      cleanupSection,
      fabSection,
      adjSection,
      bgSection,
      ctx.pat && ctx.pal && cv.paletteSwap && cv.paletteSwap.shiftSection,
      ctx.pat && ctx.pal && cv.paletteSwap && cv.paletteSwap.presetSection
    );
    // ── Create mode bottom action bar ─────────────────────────────────────
    var createActions = h("div", {style:{
      flexShrink:0, borderTop:"1px solid var(--border)", padding:"12px",
      background:"var(--surface)", display:"flex", flexDirection:"column", gap:8
    }},
      // Generate / Regenerate button
      gen.img && h("button", {
        onClick:function(){ gen.generate(); },
        disabled:gen.busy,
        "aria-label":gen.hasGenerated?"Regenerate pattern":"Generate pattern",
        style:{width:"100%",padding:"10px",fontSize:13,fontWeight:600,cursor:gen.busy?"wait":"pointer",
          border:"none",borderRadius:8,
          background:gen.busy?"#94a3b8":gen.hasGenerated?"var(--surface-tertiary)":"#0d9488",
          color:gen.hasGenerated?"var(--text-primary)":"#fff"}
      }, gen.busy ? "Generating\u2026" : (gen.hasGenerated ? "\u21BB Regenerate" : "\u21BB Generate Pattern")),
      // Continue to Edit → (only after generation)
      gen.hasGenerated && h("button", {
        "aria-label":"Continue to Edit mode",
        onClick:function(){
          app.setAppMode("edit");
          app.setSidebarTab("palette");
          if(window.__switchToEdit) window.__switchToEdit();
          app.addToast("Switched to Edit mode", {type:"info", duration:2000});
        },
        style:{width:"100%",padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer",
          border:"none",borderRadius:8,background:"#0d9488",color:"#fff",
          display:"flex",alignItems:"center",justifyContent:"center",gap:6}
      }, "Edit Pattern \u2192"),
      // Hint text
      !gen.img && h("div", {style:{fontSize:11,color:"var(--text-tertiary)",textAlign:"center",padding:"4px 0"}},
        "Upload an image to get started")
    );
    return h(React.Fragment, null,
      tabBar,
      h("div", {style:{overflowY:"auto",flex:1}},
        sTab === "settings" && settingsContent,
        sTab === "preview" && previewPanel
      ),
      createActions
    );
  }

  // ─── Edit Mode Sidebar ────────────────────────────────────────────────────
  var moreContent = h(React.Fragment, null,
    h(Section, {title:"Generation Settings",defaultOpen:false},
      imageCard,
      dimSection,
      palSection,
      cleanupSection,
      fabSection,
      adjSection,
      bgSection,
      ctx.pat && ctx.pal && cv.paletteSwap && cv.paletteSwap.shiftSection,
      ctx.pat && ctx.pal && cv.paletteSwap && cv.paletteSwap.presetSection,
      h("button", {
        onClick:function(){
          if(cv.editHistory.length > 0 && !confirm("Regenerating will replace your current edits. Continue?")) return;
          gen.generate();
        },
        disabled:gen.busy,
        style:{width:"100%",padding:"8px",fontSize:12,fontWeight:600,cursor:"pointer",border:"none",borderRadius:8,background:"var(--accent)",color:"#fff",marginTop:8}
      }, "\u21BB Regenerate")
    ),
    h(Section, {title:"Project Info",defaultOpen:false},
      h("div", {style:{fontSize:11,color:"var(--text-secondary)",padding:"4px 0"}},
        ctx.sW + " \xD7 " + ctx.sH + " stitches \u00B7 " + (ctx.displayPal||ctx.pal||[]).length + " colours"
      )
    )
  );

  // ── Edit mode bottom action bar ──────────────────────────────────────────
  var editActions = (ctx.pat && ctx.pal) ? h("div", {style:{
    flexShrink:0, borderTop:"1px solid var(--border)", padding:"12px",
    background:"var(--surface)", display:"flex", gap:8
  }},
    h("button", {
      "aria-label":"Switch to Create mode",
      onClick:function(){
        if(cv.editHistory.length > 0 && !confirm("Switch to Create mode? Your edits are auto-saved.")) return;
        app.setAppMode("create");
        app.setSidebarTab("settings");
        if(window.__switchToCreate) window.__switchToCreate();
        app.addToast("Switched to Create mode", {type:"info", duration:2000});
      },
      style:{flex:1,padding:"10px",fontSize:12,fontWeight:500,cursor:"pointer",
        border:"1px solid var(--border)",borderRadius:8,background:"var(--surface)",
        color:"var(--text-secondary)"}
    }, "\u2190 Create"),
    h("button", {
      "aria-label":"Open pattern in Stitch Tracker",
      onClick:function(){ app.handleOpenInTracker(); },
      style:{flex:2,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer",
        border:"none",borderRadius:8,background:"#0d9488",color:"#fff",
        display:"flex",alignItems:"center",justifyContent:"center",gap:6}
    }, "Start Tracking \u2192")
  ) : null;

  return h(React.Fragment, null,
    tabBar,
    h("div", {style:{overflowY:"auto",flex:1}},
      sTab === "palette" && h(React.Fragment, null,
        palChipsSection,
        coloursSection
      ),
      sTab === "view" && h(React.Fragment, null,
        viewToggle,
        highlightControls
      ),
      sTab === "preview" && previewPanel,
      sTab === "more" && moreContent
    ),
    editActions
  );
};
