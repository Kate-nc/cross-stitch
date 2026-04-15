/* creator/Sidebar.js — Settings sidebar for the Creator app.
   Reads from CreatorContext and GenerationContext.
   Loaded as a plain <script> before the main Babel script.
   Depends on: Section, SliderRow, Tooltip (components.js), CreatorContext, GenerationContext (context.js) */

window.CreatorSidebar = function CreatorSidebar() {
  var ctx = React.useContext(window.CreatorContext);
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
    var isPaintMode = ctx.activeTool === "paint" || ctx.activeTool === "fill" || isHsTool;
    var selInfo = ctx.selectedColorId && ctx.cmap && ctx.cmap[ctx.selectedColorId];
    var chips = displayPal.map(function(p) {
      var ips = isPaintMode && ctx.selectedColorId === p.id;
      var ihs = ctx.hiId === p.id;
      var isUnused = ctx.isScratchMode && p.count === 0;
      return h("div", {
        key: p.id,
        role: "button",
        tabIndex: 0,
        "aria-pressed": ips || ihs,
        onClick: function() {
          if (isPaintMode) {
            ctx.setSelectedColorId(ctx.selectedColorId === p.id ? null : p.id);
          } else {
            ctx.setHiId(ctx.hiId === p.id ? null : p.id);
          }
        },
        onKeyDown: function(e) {
          if (e.repeat) return;
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            if (isPaintMode) {
              ctx.setSelectedColorId(ctx.selectedColorId === p.id ? null : p.id);
            } else {
              ctx.setHiId(ctx.hiId === p.id ? null : p.id);
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
                onClick:function(){ctx.setSelectedColorId(null);},
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
  var coloursSection = ctx.isScratchMode ? h(Section, {
    title:"Colours", isOpen:ctx.colPickerOpen, onToggle:ctx.setColPickerOpen, badge:coloursBadge
  },
    h("div", {style:{marginTop:8}},
      h("div", {style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:4,marginBottom:8,padding:"6px 8px",background:"#f1f5f9",borderRadius:8}},
        [["1","Add colour","→"],["2","Select chip","→"],["3","Paint!",""]].map(function(item,i) {
          return h(React.Fragment, {key:i},
            h("div", {style:{display:"flex",alignItems:"center",gap:4}},
              h("span", {style:{width:16,height:16,borderRadius:"50%",background:"#0d9488",color:"#fff",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}, item[0]),
              h("span", {style:{fontSize:10,color:"#52525b",fontWeight:500,whiteSpace:"nowrap"}}, item[1])
            ),
            item[2] && h("span", {style:{fontSize:10,color:"#94a3b8"}}, item[2])
          );
        })
      ),
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
    )
  ) : null;

  // ── Dimensions section ──────────────────────────────────────────────────────
  var dimBadge = h("span", {style:{fontSize:11,fontWeight:500,color:"#475569",background:"#f1f5f9",padding:"1px 8px",borderRadius:10}}, ctx.sW+"×"+ctx.sH);
  var dimSection = h(Section, {title:"Dimensions", isOpen:ctx.dimOpen, onToggle:ctx.setDimOpen, badge:dimBadge},
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
  var palSection = !ctx.isScratchMode ? h(Section, {title:"Palette", isOpen:ctx.palOpen, onToggle:ctx.setPalOpen},
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
    gen.orphans > 0 && ctx.previewStats && ctx.previewStats.confettiCleanSingles != null && h("div", {style:{fontSize:11,color:"#94a3b8",marginTop:2}},
      "Preview estimate: removes ~", (ctx.previewStats.confettiSingles - ctx.previewStats.confettiCleanSingles).toLocaleString(), " isolated stitches",
      " (", ((ctx.previewStats.confettiSingles - ctx.previewStats.confettiCleanSingles) / Math.max(1, ctx.previewStats.stitchable) * 100).toFixed(1), "% of pattern)"
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
      var warning = getCleanupWarning(ctx.sW, ctx.sH, gen.orphans, ctx.previewStats);
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
      onClick:function(){ctx.setPalAdvanced(function(o){return !o;});},
      style:{marginTop:8,display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#475569",background:"none",border:"none",cursor:"pointer",padding:"2px 0",fontFamily:"inherit"}
    },
      h("span", {style:{fontSize:9,display:"inline-block",transform:ctx.palAdvanced?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s"}}, "\u25B6"),
      "Dithering",
      gen.dith ? h("span", {style:{width:6,height:6,borderRadius:"50%",background:"#0d9488",display:"inline-block",marginLeft:2}}) : null
    ),
    ctx.palAdvanced && h(React.Fragment, null,
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
    return h(Section, {title:"Stitch Cleanup", isOpen:ctx.cleanupOpen, onToggle:ctx.setCleanupOpen, badge:scBadge},
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
  var fabSection = h(Section, {title:"Fabric & Floss", isOpen:ctx.fabOpen, onToggle:ctx.setFabOpen, badge:fabBadge},
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
  var adjSection = !ctx.isScratchMode ? h(Section, {title:"Adjustments", isOpen:ctx.adjOpen, onToggle:ctx.setAdjOpen, badge:adjBadge},
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
  var bgSection = !ctx.isScratchMode ? h(Section, {title:"Background", isOpen:ctx.bgOpen, onToggle:ctx.setBgOpen, badge:bgBadge},
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

  return h(React.Fragment, null,
    palChipsSection,
    // ── View toggle (Colour / Symbol / Both) ───────────────────────────────────
    (ctx.pat && ctx.pal) ? h("div", {
      style:{borderBottom:"0.5px solid var(--border)",padding:"8px 12px",display:"flex",alignItems:"center",gap:8}
    },
      h("span", {style:{fontSize:11,fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginRight:4}}, "View"),
      h("div", {style:{display:"flex",gap:2,background:"var(--surface-tertiary)",borderRadius:8,padding:2,flex:1}},
        [["color","Colour"],["symbol","Symbol"],["both","Both"]].map(function(kl) {
          return h("button", {
            key:kl[0],
            onClick:function(){ctx.setView(kl[0]);},
            title:"Cycle view (V)",
            style:{
              flex:1,padding:"4px 6px",fontSize:11,fontWeight:ctx.view===kl[0]?600:400,
              border:"none",cursor:"pointer",borderRadius:6,fontFamily:"inherit",
              background:ctx.view===kl[0]?"var(--surface)":"transparent",
              color:ctx.view===kl[0]?"var(--text-primary)":"var(--text-secondary)",
              boxShadow:ctx.view===kl[0]?"var(--shadow-sm)":"none"
            }
          }, kl[1]);
        })
      )
    ) : null,
    imageCard,
    coloursSection,
    dimSection,
    palSection,
    cleanupSection,
    fabSection,
    adjSection,
    bgSection,
    ctx.pat && ctx.pal && ctx.paletteSwap && ctx.paletteSwap.shiftSection,
    ctx.pat && ctx.pal && ctx.paletteSwap && ctx.paletteSwap.presetSection,
    actionBtn
  );
};
