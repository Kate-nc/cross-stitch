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
      style:{display:"flex",alignItems:"center",gap:'var(--s-2)',cursor:"pointer",marginBottom:'var(--s-2)',userSelect:"none"}
    },
      h("span", {"aria-hidden":"true", style:{position:"relative",display:"inline-block",width:32,height:18,flexShrink:0}},
        h("span", {style:{display:"block",position:"absolute",inset:0,borderRadius:9,
          background:props.checked?"var(--accent)":"var(--border)",transition:"background 0.15s"}}),
        h("span", {style:{display:"block",position:"absolute",width:14,height:14,top:2,
          left:props.checked?16:2,borderRadius:"50%",background:"var(--surface)",
          transition:"left 0.15s",boxShadow:"0 1px 3px rgba(0,0,0,0.18)"}})
      ),
      h("span", {style:{flex:1}},
        h("span", {style:{fontSize:'var(--text-sm)',fontWeight:500,color:"var(--text-primary)",display:"block"}}, props.label),
        props.help && h("span", {style:{fontSize:10,color:"var(--text-tertiary)",display:"block",marginTop:1}}, props.help)
      )
    );
  }

  // ── Palette chips (top of right panel, when pattern loaded) ─────────────────
  var palChipsSection = (ctx.pat && ctx.pal) ? (function() {
    var displayPal = ctx.displayPal || ctx.pal || [];
    var isHsTool = ctx.partialStitchTool && ctx.partialStitchTool !== "erase";
    var isPaintMode = cv.activeTool === "paint" || cv.activeTool === "fill" || isHsTool;
    var selInfo = cv.selectedColorId && ctx.cmap && ctx.cmap[cv.selectedColorId];
    // Brief D — compute per-thread stash status. `stashHas` flags whether the
    // global stash has any data at all (graceful no-op when empty).
    var stash = ctx.globalStash || {};
    var stashHas = Object.keys(stash).length > 0;
    var fabricCtForStash = ctx.fabricCt || 14;
    // Brand-aware lookup: prefer DMC, fall back to Anchor. Mirrors the
    // resolution used in ShoppingListModal.
    function resolveBrand(id) {
      if (findThreadInCatalog('dmc', id)) return 'dmc';
      if (typeof ANCHOR !== 'undefined' && ANCHOR.find(function(d){ return d.id === id; })) return 'anchor';
      return 'dmc';
    }
    function stashStatusForChip(p) {
      if (!stashHas) return null;
      // Blend: status = worst component status.
      var ids = (p.type === 'blend' && typeof p.id === 'string' && p.id.indexOf('+') !== -1)
        ? splitBlendId(p.id)
        : [p.id];
      var worst = 'owned';
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        if (!id || id === '__skip__' || id === '__empty__') continue;
        var brand = p.brand || resolveBrand(id);
        var key = brand + ':' + id;
        var entry = stash[key];
        var owned = entry && entry.owned ? entry.owned : 0;
        var needed = (typeof skeinEst === 'function' && p.count) ? skeinEst(p.count, fabricCtForStash) : 1;
        var s = owned >= needed ? 'owned' : owned > 0 ? 'partial' : 'needed';
        if (s === 'needed') return 'needed';
        if (s === 'partial' && worst === 'owned') worst = 'partial';
      }
      return worst;
    }
    var STASH_DOT = { owned: 'var(--success)', partial: 'var(--warning)', needed: 'var(--danger)' };
    var hiddenByFilter = 0;
    // A1 (UX Phase 5) — collect composite keys of unowned palette threads so
    // the warning panel can wire its CTAs honestly. Mirrors stashStatusForChip.
    var unownedKeys = [];
    var unownedSeen = Object.create(null);
    function _trackUnowned(p) {
      if (!stashHas) return;
      var ids = (p.type === 'blend' && typeof p.id === 'string' && p.id.indexOf('+') !== -1)
        ? splitBlendId(p.id)
        : [p.id];
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        if (!id || id === '__skip__' || id === '__empty__') continue;
        var brand = p.brand || resolveBrand(id);
        var key = brand + ':' + id;
        if (unownedSeen[key]) continue;
        var entry = stash[key];
        var owned = entry && entry.owned ? entry.owned : 0;
        var needed = (typeof skeinEst === 'function' && p.count != null) ? skeinEst(p.count, fabricCtForStash) : 1;
        if (owned < needed) { unownedSeen[key] = true; unownedKeys.push(key); }
      }
    }
    var chips = displayPal.map(function(p) {
      var ips = isPaintMode && cv.selectedColorId === p.id;
      var ihs = cv.hiId === p.id;
      var isUnused = ctx.isScratchMode && p.count === 0;
      var stashStatus = stashStatusForChip(p);
      if (stashStatus === 'needed') _trackUnowned(p);
      // Brief D — when "limit to stash" filter is on, hide unowned chips.
      if (ctx.creatorStashFilter && stashHas && stashStatus === 'needed') {
        hiddenByFilter++;
        return null;
      }
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
          cursor:"pointer",fontSize:'var(--text-xs)',position:"relative",
          border: ips ? "2px solid var(--accent)" : ihs ? "2px solid var(--accent-hover)" : "0.5px solid var(--border)",
          background: ips ? "var(--accent-light)" : ihs ? "#F8EFD8" : "var(--surface)",
          opacity: isUnused ? 0.6 : 1
        }
      },
        h("span", {style:{width:12,height:12,borderRadius:2,background:"rgb("+p.rgb+")",border:"1px solid var(--border)",display:"inline-block",flexShrink:0}}),
        h("span", {style:{fontFamily:"monospace",color:"var(--text-secondary)",fontSize:10}}, p.symbol),
        h("span", {style:{fontWeight:500}}, p.id),
        isUnused && h("span", {
          onClick: function(e) { e.stopPropagation(); ctx.removeScratchColour(p.id); },
          style:{fontSize:9,color:"var(--text-tertiary)",cursor:"pointer",marginLeft:2,lineHeight:1}
        }, "\xD7"),
        // Brief D — stash status dot (top-right corner). Hidden when stash empty.
        stashStatus && h("span", {
          title: stashStatus === 'owned' ? 'In your stash' : stashStatus === 'partial' ? 'May need more' : 'Not in stash',
          "aria-label": "Stash status: " + stashStatus,
          style: {
            position:"absolute", top:-2, right:-2, width:6, height:6, borderRadius:"50%",
            background: STASH_DOT[stashStatus], boxShadow:"0 0 0 1px #fff"
          }
        })
      );
    }).filter(Boolean);
    return h("div", {style:{borderBottom:"0.5px solid var(--border)"}},
      h("div", {
        onClick:function(){setPalChipsOpen(function(o){return !o;});},
        style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px 8px",cursor:"pointer",userSelect:"none"}
      },
        h("div", {style:{display:"flex",alignItems:"center",gap:6}},
          h("span", {style:{fontSize:9,color:"var(--text-tertiary)",display:"inline-block",transform:palChipsOpen?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s"}}, "\u25B6"),
          h("span", {style:{fontSize:'var(--text-sm)',fontWeight:600,color:"var(--text-secondary)"}}, "Palette")
        ),
        h("span", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}, displayPal.length + " colour" + (displayPal.length !== 1 ? "s" : ""))
      ),
      palChipsOpen && h("div", {style:{padding:"0 12px 12px"}},
      // Brief D — stash filter toggle + "Need to buy" button (only when stash has data)
      stashHas && h("div", {
        style:{display:"flex",alignItems:"center",gap:'var(--s-2)',marginBottom:'var(--s-2)',fontSize:'var(--text-xs)',color:"var(--text-secondary)",flexWrap:"wrap"}
      },
        h("label", {style:{display:"flex",alignItems:"center",gap:5,cursor:"pointer",userSelect:"none"}},
          h("input", {
            type:"checkbox",
            checked: !!ctx.creatorStashFilter,
            onChange: function(e) { if (typeof ctx.setCreatorStashFilter === 'function') ctx.setCreatorStashFilter(e.target.checked); },
            style:{margin:0}
          }),
          h("span", null, "Only show threads I own")
        ),
        h("button", {
          onClick: function() { if (typeof app.setModal === 'function') app.setModal('shopping_list'); },
          title: "What do I need to buy?",
          style:{marginLeft:"auto",fontSize:10,padding:"2px 8px",cursor:"pointer",border:"0.5px solid var(--border)",borderRadius:'var(--radius-sm)',background:"var(--surface)",color:"var(--text-secondary)",fontWeight:500,display:"inline-flex",alignItems:"center",gap:'var(--s-1)'}
        }, typeof Icons !== 'undefined' && Icons.cart ? Icons.cart() : null, "Shopping list")
      ),
      // A1 (UX Phase 5) — honest warning panel + actionable CTAs.
      // Always show when filter is on and unowned threads remain in the
      // pattern (regardless of whether chips are currently hidden), so the
      // user can never believe they are stash-ready when they are not.
      ctx.creatorStashFilter && stashHas && unownedKeys.length > 0 && h("div", {
        role: "status",
        "aria-live": "polite",
        style:{marginBottom:'var(--s-2)',padding:"8px 10px",borderRadius:7,background:"#FAF5E1",border:"1px solid #E5C97D",fontSize:'var(--text-xs)',color:"var(--accent-ink)",display:"flex",flexDirection:"column",gap:6}
      },
        h("div", {style:{display:"flex",alignItems:"center",gap:6,fontWeight:600}},
          typeof Icons !== 'undefined' && Icons.warning ? Icons.warning() : null,
          h("span", null,
            unownedKeys.length + " unowned thread" + (unownedKeys.length !== 1 ? "s" : "") + " still in this pattern"
          )
        ),
        h("div", {style:{color:"#78350f",lineHeight:1.4}},
          "The filter only hides chips \u2014 it does not change the pattern. Substitute or buy these threads to be truly stash-ready."
        ),
        h("div", {style:{display:"flex",gap:6,flexWrap:"wrap"}},
          h("button", {
            onClick: function() {
              if (typeof StashBridge === 'undefined' || typeof analyseSubstitutions !== 'function') {
                if (app.addToast) app.addToast("Substitute is unavailable right now.", {type:"error", duration:3000});
                return;
              }
              StashBridge.getGlobalStash().then(function(s) {
                var result = analyseSubstitutions(
                  ctx.skeinData || [],
                  ctx.threadOwned || {},
                  s,
                  ctx.fabricCt || 14,
                  { maxDeltaE: ctx.substituteMaxDeltaE != null ? ctx.substituteMaxDeltaE : 15, dmcData: typeof DMC !== 'undefined' ? DMC : [] }
                );
                if (typeof ctx.setSubstituteProposal === 'function') ctx.setSubstituteProposal(result);
                if (typeof ctx.setSubstituteModalKey === 'function') ctx.setSubstituteModalKey(function(k){ return k + 1; });
                if (typeof ctx.setSubstituteModalOpen === 'function') ctx.setSubstituteModalOpen(true);
              }).catch(function() {
                if (app.addToast) app.addToast("Could not load your stash.", {type:"error", duration:3000});
              });
            },
            style:{fontSize:'var(--text-xs)',padding:"5px 10px",borderRadius:'var(--radius-sm)',border:"1px solid #D49B45",background:"var(--surface)",color:"var(--accent-ink)",fontWeight:600,cursor:"pointer"}
          }, "Substitute from stash"),
          h("button", {
            onClick: function() {
              if (typeof StashBridge === 'undefined' || typeof StashBridge.markManyToBuy !== 'function') {
                if (app.addToast) app.addToast("Shopping list is unavailable right now.", {type:"error", duration:3000});
                return;
              }
              var keys = unownedKeys.slice();
              StashBridge.markManyToBuy(keys, true).then(function(changed) {
                if (!app.addToast) return;
                if (changed === 0) {
                  app.addToast("Already on your shopping list.", {type:"info", duration:2500});
                } else if (changed === keys.length) {
                  app.addToast("Added " + changed + " thread" + (changed !== 1 ? "s" : "") + " to your shopping list.", {type:"success", duration:2800});
                } else {
                  app.addToast("Added " + changed + " new thread" + (changed !== 1 ? "s" : "") + "; " + (keys.length - changed) + " already on your list.", {type:"success", duration:2800});
                }
              }).catch(function() {
                if (app.addToast) app.addToast("Could not update your shopping list.", {type:"error", duration:3000});
              });
            },
            style:{fontSize:'var(--text-xs)',padding:"5px 10px",borderRadius:'var(--radius-sm)',border:"1px solid #D49B45",background:"var(--warning-soft)",color:"var(--accent-ink)",fontWeight:600,cursor:"pointer"}
          }, "Add to shopping list")
        )
      ),
      // Brief D — banner when filter hides chips (kept as a quieter follow-up
      // line for users who still need the "turn off the filter" hint).
      ctx.creatorStashFilter && stashHas && hiddenByFilter > 0 && unownedKeys.length === 0 && h("div", {
        style:{marginBottom:'var(--s-2)',padding:"5px 8px",borderRadius:'var(--radius-sm)',background:"#FAF5E1",border:"0.5px solid #E5C97D",fontSize:10,color:"var(--accent-ink)"}
      }, hiddenByFilter + " unowned colour" + (hiddenByFilter !== 1 ? "s" : "") + " hidden \u2014 turn off the filter to see all."),
      ctx.creatorStashFilter && !stashHas && h("div", {
        style:{marginBottom:'var(--s-2)',padding:"5px 8px",borderRadius:'var(--radius-sm)',background:"var(--danger-soft)",border:"0.5px solid var(--danger-soft)",fontSize:10,color:"var(--danger)"}
      }, "Your stash is empty \u2014 turn off this filter, or add threads in the Stash Manager."),
      isPaintMode && h("div", {
        style:{
          marginBottom:'var(--s-2)',padding:"5px 8px",borderRadius:7,
          background: selInfo ? "var(--accent-light)" : "#FAF5E1",
          border: selInfo ? "1px solid var(--accent-border)" : "1px solid #E5C97D",
          display:"flex",alignItems:"center",gap:7,fontSize:'var(--text-xs)',minHeight:30
        }
      },
        selInfo
          ? h(React.Fragment, null,
              h("span", {style:{width:16,height:16,borderRadius:3,flexShrink:0,background:"rgb("+selInfo.rgb+")",border:"1px solid var(--border)"}}),
              h("span", {style:{fontWeight:600,color:"var(--accent)"}}, "DMC " + selInfo.id),
              h("span", {style:{color:"var(--text-secondary)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}, selInfo.name || ""),
              h("button", {
                onClick:function(){cv.setSelectedColorId(null);},
                title:"Clear selection",
                style:{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"var(--text-tertiary)",fontSize:'var(--text-md)',lineHeight:1,padding:"0 2px",flexShrink:0}
              }, "\xD7")
            )
          : h(React.Fragment, null,
              h("span", {style:{fontSize:'var(--text-sm)'}}, Icons.pointing()),
              h("span", {style:{color:"var(--accent-ink)"}}, "Select a colour to paint \u2014 or right-click the canvas")
            )
      ),
      displayPal.length > 0
        ? h("div", {className:"creator-pattern-chips", style:{display:"flex",flexWrap:"wrap",gap:3}}, chips)
        : h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",textAlign:"center",padding:"8px 0"}}, "No colours yet")
      )
    );
  })() : null;

  // ── Crop image card ──────────────────────────────────────────────────────────
  // When pickBg is active the card grows a pulsing orange outline and a
  // prominent banner so the user knows this is the click target. ESC cancels
  // (wired in useKeyboardShortcuts.js).
  var imageCard = (ctx.pat && gen.img && gen.img.src) ? h("div", {id:"bg-pick-target", className:"card"+(gen.pickBg?" card--pickBg":"")},
    gen.pickBg && h("div", {style:{padding:"10px 12px",fontSize:'var(--text-sm)',color:"var(--accent-hover)",fontWeight:600,background:"#F8EFD8",borderBottom:"1px solid #E5C99A",display:"flex",alignItems:"center",gap:'var(--s-2)'}},
      h("span", {style:{flex:1}}, "Click anywhere on the image to set the background colour."),
      h("button", {
        onClick:function(){gen.setPickBg(false);},
        title:"Cancel pick (Esc)",
        style:{fontSize:'var(--text-xs)',padding:"3px 8px",border:"1px solid #D4A570",borderRadius:'var(--radius-sm)',background:"var(--surface)",color:"var(--accent-hover)",cursor:"pointer",fontWeight:600}
      }, "Cancel")
    ),
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
        border:"2px dashed var(--accent)",background:"rgba(184, 92, 56,0.2)",
        boxSizing:"border-box",pointerEvents:"none"
      }})
    ),
    gen.isCropping
      ? h("div", {style:{padding:"6px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"0.5px solid var(--surface-tertiary)"}},
          h("span", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}, "Draw a rectangle"),
          h("div", {style:{display:"flex",gap:6}},
            h("button", {
              onClick:function(){gen.setIsCropping(false); gen.setCropRect(null);},
              style:{fontSize:'var(--text-xs)',padding:"3px 8px",cursor:"pointer",border:"0.5px solid var(--border)",borderRadius:'var(--radius-sm)',background:"var(--surface-secondary)"}
            }, "Cancel"),
            h("button", {
              onClick:gen.applyCrop,
              style:{fontSize:'var(--text-xs)',padding:"3px 8px",cursor:"pointer",border:"none",borderRadius:'var(--radius-sm)',background:"var(--accent)",color:"var(--surface)"}
            }, "Apply")
          )
        )
      : h("div", {style:{padding:"6px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"0.5px solid var(--surface-tertiary)"}},
          h("span", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}, gen.origW+"×"+gen.origH+"px"),
          h("div", {style:{display:"flex",gap:6}},
            h("button", {
              onClick:function(){gen.setIsCropping(true); gen.setCropRect(null);},
              style:{fontSize:'var(--text-xs)',padding:"3px 8px",cursor:"pointer",border:"0.5px solid var(--border)",borderRadius:'var(--radius-sm)',background:"var(--surface-secondary)"}
            }, "Crop"),
            h("button", {
              onClick:function(){gen.fRef.current.click();},
              style:{fontSize:'var(--text-xs)',padding:"3px 8px",cursor:"pointer",border:"0.5px solid var(--border)",borderRadius:'var(--radius-sm)',background:"var(--surface-secondary)"}
            }, "Change")
          )
        )
  ) : null;

  // ── Colours section (scratch mode) ─────────────────────────────────────────
  var coloursBadge = h("span", {style:{fontSize:'var(--text-xs)',fontWeight:500,color:"var(--accent)",background:"var(--accent-light)",padding:"1px 8px",borderRadius:'var(--radius-lg)'}},
    (ctx.displayPal ? ctx.displayPal.filter(function(p){return p.count>0;}).length : 0)+" used"
  );
  // ── Blend picker local state ──────────────────────────────────────────────
  var _bl1 = React.useState(null); var blendThread1 = _bl1[0], setBlendThread1 = _bl1[1];
  var _bl2 = React.useState(null); var blendThread2 = _bl2[0], setBlendThread2 = _bl2[1];
  var _blSearch = React.useState(""); var blendSearch = _blSearch[0], setBlendSearch = _blSearch[1];
  var _blMode = React.useState(false); var blendMode = _blMode[0], setBlendMode = _blMode[1];

  var blendFiltered = React.useMemo(function() {
    var base = DMC;
    // Brief D — when "limit to stash" is on, restrict to owned threads.
    // Blends are DMC-only today (no Anchor blend picker), so the 'dmc:'
    // key here is intentional. If the blend picker grows Anchor support,
    // switch to the brand-aware resolver used above.
    if (ctx.creatorStashFilter && ctx.globalStash && Object.keys(ctx.globalStash).length > 0) {
      base = DMC.filter(function(d) {
        var entry = ctx.globalStash['dmc:' + d.id];
        return entry && (entry.owned || 0) > 0;
      });
    }
    if (!blendSearch.trim()) return base;
    var q = blendSearch.toLowerCase();
    return base.filter(function(d) { return d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q); });
  }, [blendSearch, ctx.creatorStashFilter, ctx.globalStash]);

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
    h("div", {style:{marginTop:'var(--s-2)'}},
      ctx.isScratchMode && h("div", {style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:'var(--s-1)',marginBottom:'var(--s-2)',padding:"6px 8px",background:"var(--surface-tertiary)",borderRadius:'var(--radius-md)'}},
        [["1","Add colour","\u2192"],["2","Select chip","\u2192"],["3","Paint!",""]].map(function(item,i) {
          return h(React.Fragment, {key:i},
            h("div", {style:{display:"flex",alignItems:"center",gap:'var(--s-1)'}},
              h("span", {style:{width:16,height:16,borderRadius:"50%",background:"var(--accent)",color:"var(--surface)",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}, item[0]),
              h("span", {style:{fontSize:10,color:"#52525b",fontWeight:500,whiteSpace:"nowrap"}}, item[1])
            ),
            item[2] && h("span", {style:{fontSize:10,color:"var(--text-tertiary)"}}, item[2])
          );
        })
      ),
      // Toggle between single thread and blend mode
      h("div", {style:{display:"flex",gap:'var(--s-1)',marginBottom:'var(--s-2)'}},
        h("button", {
          onClick:function(){ setBlendMode(false); },
          style:{flex:1,padding:"4px 8px",fontSize:'var(--text-xs)',fontWeight:blendMode?500:700,cursor:"pointer",
            border:blendMode?"1px solid var(--border)":"1px solid var(--accent)",borderRadius:'var(--radius-sm)',
            background:blendMode?"var(--surface)":"var(--accent-light)",color:blendMode?"var(--text-secondary)":"var(--accent)"}
        }, "Single thread"),
        h("button", {
          onClick:function(){ setBlendMode(true); },
          style:{flex:1,padding:"4px 8px",fontSize:'var(--text-xs)',fontWeight:blendMode?700:500,cursor:"pointer",
            border:blendMode?"1px solid var(--accent)":"1px solid var(--border)",borderRadius:'var(--radius-sm)',
            background:blendMode?"var(--accent-light)":"var(--surface)",color:blendMode?"var(--accent)":"var(--text-secondary)"}
        }, "Blend (2 threads)")
      ),
      !blendMode ? h(React.Fragment, null,
        h("input", {
          type:"text", "aria-label":"Search DMC palette", placeholder:"Search by DMC # or name\u2026",
          value:ctx.dmcSearch, onChange:function(e){ctx.setDmcSearch(e.target.value);},
          style:{width:"100%",padding:"6px 10px",border:"0.5px solid var(--border)",borderRadius:'var(--radius-md)',fontSize:'var(--text-sm)',marginBottom:'var(--s-2)',boxSizing:"border-box"}
        }),
        h("div", {style:{maxHeight:200,overflow:"auto",display:"flex",flexDirection:"column",gap:2}},
          ctx.dmcFiltered.slice(0,60).map(function(d) {
            var inPal = ctx.cmap && ctx.cmap[d.id];
            return h(Tooltip, {key:d.id, text:inPal?"Already in your palette":"Click to add to your palette", width:160},
              h("div", {
                onClick:function(){ctx.addScratchColour(d);},
                style:{display:"flex",alignItems:"center",gap:'var(--s-2)',padding:"4px 8px",borderRadius:'var(--radius-sm)',cursor:"pointer",
                  background:inPal?"var(--accent-light)":"var(--surface)",
                  border:inPal?"1px solid var(--accent-border)":"1px solid transparent",
                  opacity:inPal?0.7:1,width:"100%"}
              },
                h("span", {style:{width:16,height:16,borderRadius:3,flexShrink:0,background:"rgb("+d.rgb[0]+","+d.rgb[1]+","+d.rgb[2]+")",border:"1px solid var(--border)"}}),
                h("span", {style:{fontFamily:"monospace",fontSize:'var(--text-sm)',fontWeight:600,minWidth:36,color:"var(--text-primary)"}}, d.id),
                h("span", {style:{fontSize:'var(--text-xs)',color:"var(--text-secondary)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}, d.name),
                inPal ? h("span", {style:{fontSize:10,color:"var(--accent)"}}, "\u2713") : h("span", {style:{fontSize:10,color:"var(--text-tertiary)"}}, "+")
              )
            );
          }),
          ctx.dmcFiltered.length === 0 && h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",padding:"8px 0",textAlign:"center"}}, "No colours found")
        )
      ) : h(React.Fragment, null,
        // Blend mode UI: pick two threads
        h("div", {style:{display:"flex",gap:'var(--s-1)',marginBottom:6,alignItems:"center"}},
          h("div", {style:{flex:1,padding:"4px 8px",borderRadius:'var(--radius-sm)',border:"1px solid var(--border)",fontSize:'var(--text-xs)',minHeight:24,display:"flex",alignItems:"center",gap:'var(--s-1)',background:blendThread1?"var(--accent-light)":"var(--surface)"}},
            blendThread1 ? h(React.Fragment, null,
              h("span", {style:{width:12,height:12,borderRadius:2,background:"rgb("+blendThread1.rgb+")",border:"1px solid var(--border)",flexShrink:0}}),
              h("span", {style:{fontWeight:600}}, blendThread1.id),
              h("span", {onClick:function(){setBlendThread1(null);},style:{cursor:"pointer",color:"var(--text-tertiary)",marginLeft:2}}, "\u2715")
            ) : h("span", {style:{color:"var(--text-tertiary)"}}, "Thread 1\u2026")
          ),
          h("span", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",fontWeight:600}}, "+"),
          h("div", {style:{flex:1,padding:"4px 8px",borderRadius:'var(--radius-sm)',border:"1px solid var(--border)",fontSize:'var(--text-xs)',minHeight:24,display:"flex",alignItems:"center",gap:'var(--s-1)',background:blendThread2?"var(--accent-light)":"var(--surface)"}},
            blendThread2 ? h(React.Fragment, null,
              h("span", {style:{width:12,height:12,borderRadius:2,background:"rgb("+blendThread2.rgb+")",border:"1px solid var(--border)",flexShrink:0}}),
              h("span", {style:{fontWeight:600}}, blendThread2.id),
              h("span", {onClick:function(){setBlendThread2(null);},style:{cursor:"pointer",color:"var(--text-tertiary)",marginLeft:2}}, "\u2715")
            ) : h("span", {style:{color:"var(--text-tertiary)"}}, "Thread 2\u2026")
          )
        ),
        blendThread1 && blendThread2 && blendThread1.id !== blendThread2.id && h("button", {
          onClick:addBlend,
          style:{width:"100%",padding:"6px 0",fontSize:'var(--text-sm)',fontWeight:600,cursor:"pointer",
            border:"1px solid var(--accent)",borderRadius:'var(--radius-sm)',background:"var(--accent-light)",color:"var(--accent)",marginBottom:'var(--s-2)'}
        }, "Add blend " + blendThread1.id + "+" + blendThread2.id),
        blendThread1 && blendThread2 && blendThread1.id === blendThread2.id && h("div", {style:{fontSize:'var(--text-xs)',color:"var(--danger)",marginBottom:'var(--s-2)'}}, "Pick two different threads"),
        h("input", {
          type:"text", "aria-label":"Search DMC threads", placeholder:"Search DMC threads\u2026",
          value:blendSearch, onChange:function(e){setBlendSearch(e.target.value);},
          style:{width:"100%",padding:"6px 10px",border:"0.5px solid var(--border)",borderRadius:'var(--radius-md)',fontSize:'var(--text-sm)',marginBottom:'var(--s-2)',boxSizing:"border-box"}
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
              style:{display:"flex",alignItems:"center",gap:'var(--s-2)',padding:"4px 8px",borderRadius:'var(--radius-sm)',cursor:"pointer",
                background:(isSel1||isSel2)?"var(--accent-light)":"var(--surface)",
                border:(isSel1||isSel2)?"1px solid var(--accent-border)":"1px solid transparent",
                opacity:(isSel1||isSel2)?0.7:1,width:"100%"}
            },
              h("span", {style:{width:16,height:16,borderRadius:3,flexShrink:0,background:"rgb("+d.rgb[0]+","+d.rgb[1]+","+d.rgb[2]+")",border:"1px solid var(--border)"}}),
              h("span", {style:{fontFamily:"monospace",fontSize:'var(--text-sm)',fontWeight:600,minWidth:36,color:"var(--text-primary)"}}, d.id),
              h("span", {style:{fontSize:'var(--text-xs)',color:"var(--text-secondary)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}, d.name),
              (isSel1||isSel2) ? h("span", {style:{fontSize:10,color:"var(--accent)"}}, isSel1?"\u27981":"\u27982") : h("span", {style:{fontSize:10,color:"var(--text-tertiary)"}}, "+")
            );
          }),
          blendFiltered.length === 0 && h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",padding:"8px 0",textAlign:"center"}}, "No colours found")
        )
      )
    )
  ) : null;

  // ── Dimensions section ──────────────────────────────────────────────────────
  var dimBadge = h("span", {style:{fontSize:'var(--text-xs)',fontWeight:500,color:"var(--text-secondary)",background:"var(--surface-tertiary)",padding:"1px 8px",borderRadius:'var(--radius-lg)'}}, ctx.sW+"×"+ctx.sH);
  var dimSection = h(Section, {title:"Dimensions", isOpen:app.dimOpen, onToggle:app.setDimOpen, badge:dimBadge},
    h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:'var(--text-sm)',cursor:"pointer",marginBottom:'var(--s-2)',marginTop:'var(--s-2)'}},
      h("input", {type:"checkbox", checked:ctx.arLock, onChange:function(e){ctx.setArLock(e.target.checked);}}),
      h("span", null, "Lock aspect ratio"),
      h(InfoIcon, {text:"Keep width and height proportional when resizing", width:200})
    ),
    ctx.arLock
      ? h("div", null,
          h(SliderRow, {label:"Size", value:ctx.sW, min:10, max:300, onChange:ctx.slRsz, suffix:" st"}),
          h("div", {style:{fontSize:10,color:"var(--text-tertiary)",marginTop:2}}, "Pattern will be "+ctx.sW+"\xD7"+ctx.sH+" stitches (aspect ratio preserved)")
        )
      : h("div", {style:{display:"flex",gap:10}},
          h("div", {style:{flex:1}},
            h("label", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",display:"block",marginBottom:2}}, "Width"),
            h("input", {type:"number", value:ctx.sW, onChange:function(e){ctx.chgW(e.target.value);}, style:{width:"100%",padding:"5px 8px",border:"0.5px solid var(--border)",borderRadius:'var(--radius-sm)',fontSize:'var(--text-md)'}})
          ),
          h("div", {style:{flex:1}},
            h("label", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",display:"block",marginBottom:2}}, "Height"),
            h("input", {type:"number", value:ctx.sH, onChange:function(e){ctx.chgH(e.target.value);}, style:{width:"100%",padding:"5px 8px",border:"0.5px solid var(--border)",borderRadius:'var(--radius-sm)',fontSize:'var(--text-md)'}})
          )
        )
  );

  // ── Palette section (non-scratch) ───────────────────────────────────────────
  var palSection = !ctx.isScratchMode ? h(Section, {title:"Palette", isOpen:app.palOpen, onToggle:app.setPalOpen},
    h("div", {style:{marginTop:'var(--s-2)'}},
      h(SliderRow, {label:"Max colours", value:gen.maxC, min:10, max:gen.stashConstrained && gen.stashThreadCount ? Math.max(10, gen.stashThreadCount) : 40, onChange:gen.setMaxC,
        helpText:"Limits the colour palette. Fewer colours = faster to stitch but less detail"}),
      gen.stashConstrained && gen.stashThreadCount && gen.maxC > gen.stashThreadCount && h("div", {style:{fontSize:10,color:"#A06F2D",marginTop:2}},
        "Clamped to " + gen.stashThreadCount + " (stash size)"
      )
    ),
    h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:'var(--text-sm)',cursor:gen.blendsAutoDisabled?"not-allowed":"pointer",marginBottom:'var(--s-2)',marginTop:'var(--s-2)',opacity:gen.blendsAutoDisabled?0.5:1}},
      h("input", {type:"checkbox", checked:gen.allowBlends, disabled:gen.blendsAutoDisabled, onChange:function(e){gen.setAllowBlends(e.target.checked);}}),
      h("span", null, "Allow blended threads"),
      h(InfoIcon, {text:"Allow the algorithm to blend two DMC colours in a single stitch for smoother gradients", width:200})
    ),
    gen.blendsAutoDisabled && h("div", {style:{fontSize:10,color:"var(--text-tertiary)",marginBottom:'var(--s-2)'}},
      "Auto-disabled \u2014 fewer than 6 stash threads"
    ),
    typeof StashBridge !== "undefined" && h("label", {
      style:{display:"flex",alignItems:"center",gap:6,fontSize:'var(--text-sm)',cursor:"pointer",marginBottom:'var(--s-2)',marginTop:'var(--s-1)'}
    },
      h("input", {type:"checkbox", checked:gen.stashConstrained, onChange:function(e){gen.setStashConstrained(e.target.checked);}}),
      h("span", null, "Use only stash threads"),
      h(InfoIcon, {text:"Constrains the palette to threads you physically own. Produces a pattern you can stitch immediately without buying anything.", width:240})
    ),
    gen.stashConstrained && typeof StashBridge !== "undefined" && h(React.Fragment, null,
      h("div", {style:{fontSize:'var(--text-xs)',color:"var(--accent)",background:"var(--accent-light)",border:"1px solid var(--accent-border)",borderRadius:'var(--radius-md)',padding:"6px 10px",marginBottom:'var(--s-2)'}},
        (gen.stashThreadCount || 0) + " thread" + ((gen.stashThreadCount || 0) !== 1 ? "s" : "") + " in stash" +
          (gen.effectiveMaxC && gen.effectiveMaxC < gen.maxC ? " \u2014 palette limited to " + gen.effectiveMaxC + " colours" : "")
      ),
      gen.stashPalette && gen.stashPalette.length > 0 && h("div", {style:{marginBottom:'var(--s-2)'}},
        h("div", {style:{display:"flex",flexWrap:"wrap",gap:2,marginBottom:2}},
          (stashStripExpanded ? gen.stashPalette : gen.stashPalette.slice(0,60)).map(function(t) {
            return h(Tooltip, {key:t.id, text:"DMC " + t.id + " \u2014 " + t.name, width:140},
              h("div", {style:{width:12,height:12,borderRadius:2,background:"rgb(" + t.rgb.join(",") + ")"}})
            );
          })
        ),
        gen.stashPalette.length > 60 && h("button", {
          onClick:function(){setStashStripExpanded(function(o){return !o;});},
          style:{fontSize:10,color:"var(--accent)",background:"none",border:"none",cursor:"pointer",padding:"0 2px"}
        }, stashStripExpanded ? "Show less" : "+" + (gen.stashPalette.length - 60) + " more")
      ),
      gen.coverageGaps && gen.coverageGaps.hasGaps && h("div", {style:{
        fontSize:'var(--text-xs)',background:"var(--danger-soft)",border:"1px solid var(--danger-soft)",borderRadius:'var(--radius-md)',
        padding:"6px 10px",marginBottom:'var(--s-2)',color:"var(--danger)",display:"flex",alignItems:"flex-start",gap:6
      }},
        h("span", {style:{fontSize:'var(--text-md)',lineHeight:1,flexShrink:0}}, Icons.warning()),
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
      h("div", {style:{marginBottom:'var(--s-2)'}},
        h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-secondary)",marginBottom:'var(--s-1)',fontWeight:500}}, "Quick-add thread to stash"),
        h("div", {style:{display:"flex",alignItems:"center",gap:6}},
          h("input", {
            type:"text", value:qaVal,
            placeholder:"DMC number\u2026",
            onChange:function(e){setQaVal(e.target.value);},
            style:{flex:1,padding:"4px 8px",fontSize:'var(--text-sm)',borderRadius:'var(--radius-sm)',border:"0.5px solid var(--border)",fontFamily:"inherit"}
          }),
          (function(){
            var dmc = findThreadInCatalog('dmc', qaVal.trim());
            return dmc ? h(Tooltip, {text:"DMC " + dmc.id + " \u2014 " + dmc.name, width:160},
              h("div", {style:{width:18,height:18,borderRadius:3,background:"rgb(" + dmc.rgb.join(",") + ")"}})
            ) : null;
          })(),
          h("button", {
            disabled:qaLoading || !findThreadInCatalog('dmc', qaVal.trim()),
            onClick:function(){
              var trimmed = qaVal.trim();
              if (!trimmed || !findThreadInCatalog('dmc', trimmed)) return;
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
            style:{fontSize:'var(--text-xs)',padding:"4px 10px",borderRadius:'var(--radius-sm)',border:"0.5px solid var(--accent-border)",background:qaLoading?"var(--border)":"var(--accent-light)",color:"var(--accent)",cursor:"pointer",fontFamily:"inherit"}
          }, qaLoading ? "\u2026" : "+ Add")
        )
      ),
      h("div", {style:{borderTop:"0.5px solid var(--border)",marginTop:'var(--s-2)',paddingTop:10}},
        h("div", {style:{display:"flex",alignItems:"center",gap:6,marginBottom:'var(--s-1)',flexWrap:"wrap"}},
          h("button", {
            onClick:function(){ gen.randomise(); },
            disabled:!(gen.stashPalette && gen.stashPalette.length > 0) || !gen.img,
            style:{display:"flex",alignItems:"center",gap:'var(--s-1)',fontSize:'var(--text-sm)',fontWeight:500,padding:"5px 12px",borderRadius:'var(--radius-md)',border:"0.5px solid var(--accent-border)",background:"var(--accent-light)",color:"var(--accent)",cursor:"pointer",fontFamily:"inherit"}
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
                style:{width:70,padding:"2px 4px",fontSize:10,borderRadius:4,border:"0.5px solid var(--accent-border)",fontFamily:"inherit"}
              })
            ) :
            h("span", {
              onClick:function(){setSeedEditing(true);setSeedTmp(String(gen.variationSeed));},
              title:"Click to enter a specific seed",
              style:{fontSize:10,color:"var(--text-tertiary)",cursor:"pointer",userSelect:"none",fontVariantNumeric:"tabular-nums"}
            }, "#" + gen.variationSeed)
          ) : null
        ),
        gen.stashConstrained && gen.variationSeed && gen.variationSubset && gen.stashPalette && gen.stashPalette.length >= 3 && h("div", {
          style:{fontSize:10,color:"var(--accent)",marginBottom:6,display:"flex",alignItems:"center",gap:'var(--s-1)'}
        }, Icons.dice(), " Roulette \u2014 using " + gen.variationSubset.length + " of " + gen.stashPalette.length + " threads"),
        h("button", {
          onClick:function(){
            gen.setGalleryOpen(function(o){return !o;});
            if (!gen.galleryOpen) gen.generateGallery();
          },
          style:{fontSize:'var(--text-xs)',color:"var(--text-secondary)",background:"none",border:"none",cursor:"pointer",padding:"0",fontFamily:"inherit",display:"flex",alignItems:"center",gap:'var(--s-1)',marginBottom:'var(--s-1)'}
        },
          h("span", {style:{fontSize:9,display:"inline-block",transform:gen.galleryOpen?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s"}}, "\u25B6"),
          "Explore variations"
        ),
        gen.galleryOpen && h("div", {style:{marginTop:'var(--s-1)'}},
          h("div", {style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:'var(--s-2)'}},
            gen.gallerySlots.map(function(slot, i) {
              return h("div", {
                key:i,
                onClick:function(){ if (!slot.loading && slot.url) { gen.promoteVariation(slot); gen.setGalleryOpen(false); } },
                style:{
                  borderRadius:'var(--radius-md)',overflow:"hidden",border:"0.5px solid var(--border)",
                  cursor:(!slot.loading && slot.url) ? "pointer" : "default",
                  background:"var(--surface-secondary)",transition:"border-color 0.15s"
                }
              },
                slot.loading ?
                  h("div", {style:{height:60,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"var(--text-tertiary)"}}, "\u2026") :
                slot.url ?
                  h("div", null,
                    h("img", {src:slot.url, style:{width:"100%",display:"block",imageRendering:"pixelated"}}),
                    h("div", {style:{padding:"3px 6px",fontSize:9,color:"var(--text-secondary)"}},
                      "#" + slot.seed + " \u00B7 " + slot.threadCount + " threads"
                    )
                  ) :
                  h("div", {style:{height:60,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#B85555"}}, "Error")
              );
            })
          ),
          h("div", {style:{display:"flex",justifyContent:"center"}},
            h("button", {
              onClick:function(){ gen.generateGallery(); },
              style:{fontSize:'var(--text-xs)',padding:"4px 12px",borderRadius:'var(--radius-sm)',border:"0.5px solid var(--border)",background:"var(--surface)",color:"var(--text-secondary)",cursor:"pointer",fontFamily:"inherit"}
            }, "New batch")
          )
        ),
        gen.variationHistory.length > 0 && h("div", {style:{marginTop:'var(--s-2)'}},
          h("div", {style:{fontSize:10,color:"var(--text-tertiary)",marginBottom:'var(--s-1)'}}, "Recent variations"),
          h("div", {style:{display:"flex",gap:'var(--s-1)',overflowX:"auto",paddingBottom:4}},
            gen.variationHistory.map(function(entry, i) {
              return h("div", {
                key:(entry.timestamp || i) + "-" + i,
                onClick:function(){ gen.applyVariationSeed(entry.seed, entry.subset !== undefined ? entry.subset : null); },
                title:"Seed #" + entry.seed,
                style:{flexShrink:0,cursor:"pointer",borderRadius:4,overflow:"hidden",border:"0.5px solid var(--border)"}
              },
                entry.previewUrl ?
                  h("img", {src:entry.previewUrl, style:{width:32,height:32,display:"block",imageRendering:"pixelated",objectFit:"cover"}}) :
                  h("div", {style:{width:32,height:32,background:"var(--surface-tertiary)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"var(--text-tertiary)"}}, "?"),
                h("div", {style:{fontSize:7,color:"var(--text-tertiary)",textAlign:"center",padding:"1px 2px"}}, "#" + entry.seed)
              );
            })
          )
        )
      )
    ),
    h("div", {style:{marginTop:'var(--s-2)'}},
      h(SliderRow, {label:"Min stitches per colour", value:gen.minSt, min:0, max:50, onChange:gen.setMinSt,
        format:function(v){return v===0?"Off":v;},
        helpText:"Colours used fewer than this many times will be merged into the nearest similar colour"})
    ),
    h("div", {style:{marginTop:'var(--s-2)'}},
      h(SliderRow, {label:"Remove Orphans", value:gen.orphans, min:0, max:3, onChange:gen.setOrphans,
        format:function(v){return v===0?"Off":String(v);},
        helpText:"Removes isolated stitches with no same-colour neighbours — reduces confetti and makes the pattern easier to stitch"}),
      gen.orphans > 0 && (function() {
        var desc;
        if (gen.orphans === 1) {
          desc = h("span", null, "Removes ", h("strong", null, "isolated single stitches"), " \u2014 cells with no same-colour neighbour. On your ", ctx.sW, "\xD7", ctx.sH, " grid, this targets clusters of exactly 1 stitch.");
        } else if (gen.orphans === 2) {
          desc = h("span", null, "Removes clusters of ", h("strong", null, "1\u20132 stitches"), " that are isolated from their colour group. On your ", ctx.sW, "\xD7", ctx.sH, " grid (", (ctx.sW*ctx.sH).toLocaleString(), " cells), this is ", ctx.sW <= 50 ? h("span", {style:{color:"#A06F2D",fontWeight:600}}, "moderately aggressive") : "a balanced cleanup", ".");
        } else {
          desc = h("span", null, "Removes clusters of ", h("strong", null, "1\u20133 stitches"), " that are isolated. On your ", ctx.sW, "\xD7", ctx.sH, " grid, this is ", ctx.sW <= 40 ? h("span", {style:{color:"var(--danger)",fontWeight:600}}, "very aggressive") : ctx.sW <= 80 ? h("span", {style:{color:"#A06F2D",fontWeight:600}}, "moderately aggressive") : "a thorough cleanup", ".");
        }
        return h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-secondary)",marginTop:'var(--s-1)',lineHeight:1.5}}, desc);
      })()
    ),
    gen.orphans > 0 && app.previewStats && app.previewStats.confettiCleanSingles != null && h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",marginTop:2}},
      "Preview estimate: removes ~", (app.previewStats.confettiSingles - app.previewStats.confettiCleanSingles).toLocaleString(), " isolated stitches",
      " (", ((app.previewStats.confettiSingles - app.previewStats.confettiCleanSingles) / Math.max(1, app.previewStats.stitchable) * 100).toFixed(1), "% of pattern)"
    ),
    ctx.pat && gen.cleanupDiff && h("div", {style:{marginTop:6,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}},
      h("button", {
        onClick:function(){gen.setShowCleanupDiff(function(d){return !d;});},
        style:{
          fontSize:'var(--text-xs)',padding:"3px 8px",borderRadius:'var(--radius-sm)',cursor:"pointer",
          border:gen.showCleanupDiff?"1px solid var(--accent)":"0.5px solid var(--border)",
          background:gen.showCleanupDiff?"var(--accent-light)":"var(--surface)",
          color:gen.showCleanupDiff?"var(--accent)":"var(--text-secondary)",
          fontWeight:gen.showCleanupDiff?600:400,
          display:"flex",alignItems:"center",gap:'var(--s-1)',lineHeight:1.4
        }
      }, Icons.eye(), " " + (gen.showCleanupDiff ? "Hide changes" : "Show changes"))
    ),
    gen.showCleanupDiff && gen.cleanupDiff && h("div", {style:{
      fontSize:'var(--text-xs)',color:"var(--text-secondary)",padding:"6px 10px",
      background:"var(--surface-secondary)",border:"1px solid #f0abfc",borderRadius:'var(--radius-md)',
      marginTop:'var(--s-1)',lineHeight:1.5
    }},
      h("span", {style:{color:"var(--accent)",fontWeight:700,marginRight:'var(--s-1)'}}, "\u25CF"),
      gen.cleanupDiff.count.toLocaleString(), " stitches changed",
      ctx.totalStitchable > 0 ? " (" + (gen.cleanupDiff.count / ctx.totalStitchable * 100).toFixed(1) + "%)" : "",
      Object.keys(gen.cleanupDiff.byColour).length > 0 && h("span", {style:{marginLeft:'var(--s-2)',color:"var(--text-tertiary)"}},
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
        marginTop:6,padding:"8px 10px",borderRadius:'var(--radius-md)',fontSize:'var(--text-xs)',lineHeight:1.5,
        background:isDanger?"var(--danger-soft)":"#FAF5E1",
        border:"1px solid "+(isDanger?"var(--danger-soft)":"#E5C97D"),
        color:isDanger?"var(--danger)":"var(--accent-ink)",
        display:"flex",alignItems:"flex-start",gap:6
      }},
        h("span", {style:{fontSize:'var(--text-lg)',lineHeight:1,flexShrink:0}}, isDanger?Icons.warning():Icons.lightbulb()),
        h("span", null, warning.message)
      );
    })(),
    h("button", {
      onClick:function(){app.setPalAdvanced(function(o){return !o;});},
      style:{marginTop:'var(--s-2)',display:"flex",alignItems:"center",gap:'var(--s-1)',fontSize:'var(--text-xs)',color:"var(--text-secondary)",background:"none",border:"none",cursor:"pointer",padding:"2px 0",fontFamily:"inherit"}
    },
      h("span", {style:{fontSize:9,display:"inline-block",transform:app.palAdvanced?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s"}}, "\u25B6"),
      "Dithering",
      gen.dith ? h("span", {style:{width:6,height:6,borderRadius:"50%",background:"var(--accent)",display:"inline-block",marginLeft:2}}) : null
    ),
    app.palAdvanced && h(React.Fragment, null,
      h("div", {style:{marginTop:6,padding:"8px 10px",background:"#F8EFD8",borderRadius:'var(--radius-md)',border:"0.5px solid #E5C99A",fontSize:10,color:"var(--accent-ink)"}},
        "Dithering blends colours by mixing stitches. Direct mapping uses solid colours only."
      ),
      h("div", {style:{display:"flex",gap:6,marginTop:6}},
        h("div", {style:{display:"flex",gap:2,background:"var(--surface-tertiary)",borderRadius:'var(--radius-md)',padding:2,flex:1}},
          h(Tooltip, {text:"Maps each pixel directly to its closest DMC colour. Fewer scattered stitches", width:200},
            h("button", {
              onClick:function(){gen.setDith(false);},
              style:{padding:"5px 12px",fontSize:'var(--text-sm)',fontWeight:!gen.dith?500:400,background:!gen.dith?"var(--surface)":"transparent",borderRadius:'var(--radius-sm)',color:!gen.dith?"var(--text-primary)":"var(--text-secondary)",border:"none",cursor:"pointer",boxShadow:!gen.dith?"0 1px 2px rgba(0,0,0,0.04)":"none",flex:1}
            }, "Direct")
          ),
          h(Tooltip, {text:"Uses Floyd-Steinberg error diffusion for smoother colour gradients, but creates more scattered stitches", width:220},
            h("button", {
              onClick:function(){gen.setDith(true);},
              style:{padding:"5px 12px",fontSize:'var(--text-sm)',fontWeight:gen.dith?500:400,background:gen.dith?"var(--surface)":"transparent",borderRadius:'var(--radius-sm)',color:gen.dith?"var(--text-primary)":"var(--text-secondary)",border:"none",cursor:"pointer",boxShadow:gen.dith?"0 1px 2px rgba(0,0,0,0.04)":"none",flex:1}
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
      fontSize:'var(--text-xs)',fontWeight:500,padding:"1px 8px",borderRadius:'var(--radius-lg)',
      color:sc2.enabled?"var(--accent)":"var(--text-tertiary)",background:sc2.enabled?"var(--accent-light)":"var(--surface-tertiary)"
    }}, sc2.enabled ? "On \u2014 "+(sc2.strength[0].toUpperCase()+sc2.strength.slice(1)) : "Off");
    var strengthKeys=["gentle","balanced","thorough"];
    var strengthLabels=["Gentle","Balanced","Thorough"];
    var strengthDescs=["Keeps 2-stitch clusters. Best for detail-heavy designs.","Removes 3-stitch clusters. Balanced stitchability & detail.","Removes up to 5-stitch clusters. Smoothest, easiest to sew."];
    var strengthIdx=strengthKeys.indexOf(sc2.strength);
    return h(Section, {title:"Stitch Cleanup", isOpen:app.cleanupOpen, onToggle:app.setCleanupOpen, badge:scBadge},
      h("div", {style:{marginTop:'var(--s-2)'}},
        h(Toggle, {
          checked:sc2.enabled,
          onChange:function(v){gen.setStitchCleanup(function(s){return Object.assign({},s,{enabled:v});});},
          label:"Stitch Cleanup",
          help:"Automatically removes scattered single stitches that are hard to sew. Turn off if you want to keep the full dithered detail."
        }),
        sc2.enabled && h(React.Fragment, null,
          h("div", {style:{marginBottom:10,padding:"8px 10px",background:"var(--accent-light)",borderRadius:'var(--radius-md)',border:"0.5px solid var(--accent-border)",fontSize:'var(--text-xs)',color:"var(--accent)",fontWeight:500}},
            "Removes scattered single stitches (confetti) that are impractical to sew \u2014 especially in dithered areas and gradients."
          ),
          h("div", {style:{marginTop:'var(--s-1)',marginBottom:10}},
            h("div", {style:{display:"flex",alignItems:"center",gap:'var(--s-1)',marginBottom:'var(--s-1)'}},
              h("span", {style:{fontSize:'var(--text-sm)',color:"#52525b",fontWeight:500}}, "Cleanup strength"),
              h(InfoIcon, {text:"How aggressively scattered stitches are merged into nearby colours. Gentle keeps more detail. Thorough creates smoother, easier-to-sew blocks.", width:220})
            ),
            h("input", {
              type:"range",min:0,max:2,step:1,value:strengthIdx,
              onChange:function(e){gen.setStitchCleanup(function(s){return Object.assign({},s,{strength:strengthKeys[+e.target.value]});});},
              style:{width:"100%",accentColor:"var(--accent)"}
            }),
            h("div", {style:{display:"flex",justifyContent:"space-between",marginTop:6,gap:'var(--s-1)'}},
              strengthLabels.map(function(l,i) {
                return h(Tooltip, {key:l, text:strengthDescs[i], width:160},
                  h("span", {
                    style:{fontSize:10,color:strengthIdx===i?"var(--accent)":"var(--text-tertiary)",fontWeight:strengthIdx===i?600:400,cursor:"pointer",padding:"2px 4px",borderRadius:4,transition:"all 0.15s",background:strengthIdx===i?"#e0f7f4":"transparent"},
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
  var fabBadge = h("span", {style:{fontSize:'var(--text-xs)',fontWeight:500,color:"var(--text-secondary)",background:"var(--surface-tertiary)",padding:"1px 8px",borderRadius:'var(--radius-lg)'}}, ctx.fabricCt+"ct");
  var fabSection = h(Section, {title:"Fabric & Floss", isOpen:app.fabOpen, onToggle:app.setFabOpen, badge:fabBadge},
    h("div", {style:{marginTop:'var(--s-2)'}},
      h("div", {style:{display:"flex",alignItems:"center",gap:'var(--s-1)',marginBottom:'var(--s-1)'}},
        h("span", {style:{fontSize:'var(--text-sm)',color:"var(--text-secondary)",fontWeight:600}}, "Fabric count"),
        h(InfoIcon, {text:"The thread count of your Aida or evenweave fabric — affects finished size and skein estimates", width:220})
      ),
      h("select", {
        value:ctx.fabricCt, onChange:function(e){ctx.setFabricCt(Number(e.target.value));},
        style:{width:"100%",padding:"6px 10px",borderRadius:'var(--radius-md)',border:"0.5px solid var(--border)",fontSize:'var(--text-md)',background:"var(--surface)"}
      }, FABRIC_COUNTS.map(function(f) {
        return h("option", {key:f.ct, value:f.ct}, f.label);
      })),
      h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",marginTop:6}}, "Affects skein & finished size estimates. Assumes 2 strands, 8m per skein.")
    )
  );

  // ── Adjustments section (non-scratch) ──────────────────────────────────────
  var adjBadge = (gen.bri||gen.con||gen.sat||gen.smooth) ? h("span", {style:{width:6,height:6,borderRadius:"50%",background:"var(--accent)",display:"inline-block"}}) : null;
  var adjSection = !ctx.isScratchMode ? h(Section, {title:"Adjustments", isOpen:app.adjOpen, onToggle:app.setAdjOpen, badge:adjBadge},
    h("div", {style:{marginTop:'var(--s-2)'}},
      h(SliderRow, {label:"Smooth", value:gen.smooth, min:0, max:4, step:0.1, onChange:gen.setSmooth,
        format:function(v){return v===0?"Off":v.toFixed(1);},
        helpText:"Blur filter to reduce noise in grainy or low-resolution photos"}),
      gen.smooth===0 && h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",marginTop:2}}, "Try 1\u20132 for noisy or low-resolution photos"),
      gen.smooth>0 && h("div", {style:{display:"flex",gap:6,margin:"6px 0"}},
        h("div", {style:{display:"flex",gap:2,background:"var(--surface-tertiary)",borderRadius:'var(--radius-md)',padding:2,flex:1}},
          h(Tooltip, {text:"Preserves edges better. Best for most photos", width:180},
            h("button", {onClick:function(){gen.setSmoothType("median");}, style:{padding:"5px 12px",fontSize:'var(--text-sm)',fontWeight:gen.smoothType==="median"?500:400,background:gen.smoothType==="median"?"var(--surface)":"transparent",borderRadius:'var(--radius-sm)',color:gen.smoothType==="median"?"var(--text-primary)":"var(--text-secondary)",border:"none",cursor:"pointer",boxShadow:gen.smoothType==="median"?"0 1px 2px rgba(0,0,0,0.04)":"none",flex:1}}, "Median")
          ),
          h(Tooltip, {text:"Stronger overall blur. Better for very grainy or pixelated images", width:180},
            h("button", {onClick:function(){gen.setSmoothType("gaussian");}, style:{padding:"5px 12px",fontSize:'var(--text-sm)',fontWeight:gen.smoothType==="gaussian"?500:400,background:gen.smoothType==="gaussian"?"var(--surface)":"transparent",borderRadius:'var(--radius-sm)',color:gen.smoothType==="gaussian"?"var(--text-primary)":"var(--text-secondary)",border:"none",cursor:"pointer",boxShadow:gen.smoothType==="gaussian"?"0 1px 2px rgba(0,0,0,0.04)":"none",flex:1}}, "Gaussian")
          )
        )
      ),
      h(SliderRow, {label:"Brightness", value:gen.bri, min:-50, max:50, onChange:gen.setBri, format:function(v){return (v>0?"+":"")+v+"%";}}),
      h(SliderRow, {label:"Contrast", value:gen.con, min:-50, max:50, onChange:gen.setCon, format:function(v){return (v>0?"+":"")+v+"%";}}),
      h(SliderRow, {label:"Saturation", value:gen.sat, min:-50, max:50, onChange:gen.setSat, format:function(v){return (v>0?"+":"")+v+"%";}})
    )
  ) : null;

  // ── Background section (non-scratch) ───────────────────────────────────────
  // The "Skip background" toggle auto-enters pick mode the first time it's
  // turned on so the user is never left wondering what to click. Re-toggling
  // off and on doesn't keep re-arming pick mode (only on the 0→1 transition
  // when no bgCol has been customised).
  var bgBadge = gen.skipBg ? h("span", {style:{width:6,height:6,borderRadius:"50%",background:"var(--success)",display:"inline-block"}}) : null;
  function armBgPick() {
    // Switch the user to the Image tab so the pick target is visible.
    if (app.appMode === "create" && app.setSidebarTab) app.setSidebarTab("image");
    gen.setPickBg(true);
    // Scroll the source-image card into view so users know where to click
    // next. Defer twice so the tab switch + pickBg re-render have committed.
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(function(){
        window.requestAnimationFrame(function(){
          var el = document.getElementById("bg-pick-target");
          if (el && el.scrollIntoView) {
            try { var __reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; el.scrollIntoView({behavior: __reduced ? "auto" : "smooth", block:"center"}); }
            catch (_) { el.scrollIntoView(); }
          }
        });
      });
    }
  }
  var bgSection = !ctx.isScratchMode ? h(Section, {title:"Background", isOpen:app.bgOpen, onToggle:app.setBgOpen, badge:bgBadge},
    h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:'var(--text-sm)',cursor:"pointer",marginTop:'var(--s-2)'}},
      h("input", {type:"checkbox", checked:gen.skipBg, onChange:function(e){
        var on = e.target.checked;
        gen.setSkipBg(on);
        // Auto-arm pick mode on the first enable (0→1 when no custom colour
        // has been chosen yet). Re-toggling after a pick skips auto-arming.
        var isDefaultWhite = gen.bgCol[0]===255 && gen.bgCol[1]===255 && gen.bgCol[2]===255;
        if (on && isDefaultWhite) armBgPick();
        else if (!on && gen.pickBg) gen.setPickBg(false);
      }}),
      h("span", null, "Skip background"),
      h(InfoIcon, {text:"Exclude pixels matching a chosen colour, leaving them unstitched. Good for solid colour backgrounds", width:220})
    ),
    gen.skipBg && h("div", {style:{marginTop:10}},
      h("div", {style:{display:"flex",alignItems:"center",gap:'var(--s-2)',marginBottom:10}},
        h("div", {
          onClick:armBgPick,
          title:"Pick background colour from the source image",
          style:{width:24,height:24,borderRadius:'var(--radius-sm)',background:"rgb("+gen.bgCol+")",border:"2px solid var(--border)",cursor:"pointer"}
        }),
        h("button", {
          onClick:armBgPick,
          style:{fontSize:'var(--text-xs)',padding:"3px 8px",border:"0.5px solid var(--border)",borderRadius:'var(--radius-sm)',background:gen.pickBg?"#F8EFD8":"var(--surface-secondary)",color:gen.pickBg?"var(--accent-hover)":"var(--text-primary)",cursor:"pointer"}
        }, gen.pickBg ? "Picking…" : "Pick")
      ),
      h(SliderRow, {label:"Tolerance", value:gen.bgTh, min:3, max:50, onChange:gen.setBgTh,
        helpText:"How closely a pixel must match the background colour to be skipped. Higher = more pixels removed"}),
      ctx.pat && h("div", {style:{marginTop:10,padding:"8px",background:"var(--surface-tertiary)",borderRadius:'var(--radius-md)',fontSize:'var(--text-xs)',color:"var(--text-secondary)"}},
        h("div", {style:{marginBottom:6}}, "Want to shrink the pattern to fit only the stitches?"),
        h("button", {
          onClick:gen.autoCrop,
          style:{width:"100%",padding:"6px",fontSize:'var(--text-sm)',fontWeight:500,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:'var(--radius-sm)',cursor:"pointer",color:"var(--text-primary)"}
        }, "Auto-Crop to Stitches")
      )
    )
  ) : null;

  // ── Generate / Reset button ─────────────────────────────────────────────────
  var actionBtn = ctx.isScratchMode
    ? h("button", {
        onClick:function(){ctx.initBlankGrid(ctx.sW, ctx.sH);},
        style:{padding:"8px 14px",fontSize:'var(--text-sm)',fontWeight:600,background:"var(--danger)",color:"var(--surface)",border:"none",borderRadius:'var(--radius-md)',cursor:"pointer"}
      }, "Reset Canvas")
    : h("button", {
        onClick:gen.generate, disabled:gen.busy,
        style:{padding:"8px 14px",fontSize:'var(--text-sm)',fontWeight:600,
          background:gen.busy?"var(--text-tertiary)":"var(--accent)",color:"var(--surface)",
          border:"none",borderRadius:'var(--radius-md)',cursor:gen.busy?"wait":"pointer"}
      }, gen.busy ? "Generating..." : (ctx.pat ? "Regenerate" : "Generate Pattern"));

  // ─── Mode-aware sidebar tab bar ────────────────────────────────────────────
  var mode = app.appMode || "edit";
  var rawTab = app.sidebarTab;
  // Back-compat: legacy "settings" (single-Settings-accordion) → first new tab.
  if (rawTab === "settings") rawTab = "image";
  var sTab = rawTab || (mode === "create" ? "image" : "palette");

  var createTabs = [
    {id:"image",      label:"Image",      icon:"image"},
    {id:"dimensions", label:"Dimensions", icon:"ruler"},
    {id:"palette",    label:"Palette",    icon:"palette"},
    {id:"preview",    label:"Preview",    icon:"layers"},
    {id:"project",    label:"Project",    icon:"folder"}
  ];
  // Polish A — locked to share Palette/Preview slots with createTabs
  // (positions 3 and 4) so users don't lose their place when the Generate
  // step swaps the bar from create to edit. Tools/View take the first two
  // slots that Image/Dimensions occupied; More keeps the trailing slot.
  var editTabs = [
    {id:"tools",   label:"Tools",   icon:"pencil"},
    {id:"view",    label:"View",    icon:"eye"},
    {id:"palette", label:"Palette", icon:"palette"},
    {id:"preview", label:"Preview", icon:"layers"},
    {id:"more",    label:"More",    icon:"menu"}
  ];
  var tabs = mode === "create" ? createTabs : editTabs;

  // Ensure sidebarTab is valid for current mode
  var validIds = tabs.map(function(t) { return t.id; });
  if (validIds.indexOf(sTab) === -1) sTab = validIds[0];

  var tabBar = h("div", {
    role:"tablist", "aria-label":mode === "create" ? "Create mode panels" : "Edit mode panels",
    style:{display:"flex",background:"var(--surface)",flexDirection:"column"}
  },
    h("div", {"aria-hidden":"true", className:"rpanel-handle-wrap", style:{paddingTop:6,paddingBottom:2,display:"flex",justifyContent:"center"}},
      h("div", {className:"rpanel-handle-bar"})
    ),
    h("div", {className:"creator-sidebar-tabs"},
      tabs.map(function(t) {
        var isActive = sTab === t.id;
        var isDisabled = !!t.disabled;
        var iconFn = (window.Icons && window.Icons[t.icon]) ? window.Icons[t.icon] : null;
        return h("button", {
          key: t.id,
          role: "tab",
          className: "creator-sidebar-tab",
          "aria-selected": isActive ? "true" : "false",
          "aria-disabled": isDisabled ? "true" : "false",
          "aria-controls": "sidebar-panel-" + t.id,
          tabIndex: isActive ? 0 : -1,
          title: isDisabled ? (t.disabledHint || "Generate a pattern to unlock") : t.label,
          onClick: function() {
            if (isDisabled) return;
            var isMobile = window.matchMedia && window.matchMedia("(max-width: 899px)").matches;
            if (isMobile) {
              var panelIsOpen = typeof app.panelOpen === "boolean" ? app.panelOpen : !!app.sidebarOpen;
              var setPanelOpen = typeof app.setPanelOpen === "function" ? app.setPanelOpen : (typeof app.setSidebarOpen === "function" ? app.setSidebarOpen : null);
              if (app.sidebarTab === t.id && panelIsOpen) {
                if (setPanelOpen) setPanelOpen(false);
              } else {
                app.setSidebarTab(t.id);
                if (setPanelOpen) setPanelOpen(true);
              }
            } else {
              app.setSidebarTab(t.id);
            }
          }
        },
          iconFn ? iconFn() : null,
          h("span", {className:"creator-sidebar-tab__label"}, t.label),
          isDisabled && window.Icons && window.Icons.lock
            ? h("span", {className:"creator-sidebar-tab__lock", "aria-hidden":"true"}, window.Icons.lock())
            : null
        );
      })
    )
  );

  // ─── View toggle (shared between View tab content in both modes) ─────────
  var viewToggle = (ctx.pat && ctx.pal) ? h("div", {
    style:{padding:"8px 12px",display:"flex",alignItems:"center",gap:'var(--s-2)'}
  },
    h("span", {style:{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginRight:'var(--s-1)'}}, "View"),
    h("div", {style:{display:"flex",gap:2,background:"var(--surface-tertiary)",borderRadius:'var(--radius-md)',padding:2,flex:1}},
      [["color","Colour"],["symbol","Symbol"],["both","Both"]].map(function(kl) {
        return h("button", {
          key:kl[0],
          onClick:function(){cv.setView(kl[0]);},
          title:"Cycle view (V)",
          style:{
            flex:1,padding:"4px 6px",fontSize:'var(--text-xs)',fontWeight:cv.view===kl[0]?600:400,
            border:"none",cursor:"pointer",borderRadius:'var(--radius-sm)',fontFamily:"inherit",
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
    h("div", {style:{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",marginBottom:6}}, "Highlight Mode"),
    h("div", {style:{display:"flex",gap:3,flexWrap:"wrap"}},
      [["isolate","Isolate"],["outline","Outline"],["tint","Tint"],["spotlight","Spotlight"]].map(function(kl) {
        return h("button", {
          key:kl[0],
          onClick:function(){ cv.setHighlightMode(kl[0]); },
          style:{
            flex:1,padding:"4px 6px",fontSize:10,fontWeight:cv.highlightMode===kl[0]?600:400,
            border:"1px solid "+(cv.highlightMode===kl[0]?"var(--accent)":"var(--border)"),
            cursor:"pointer",borderRadius:'var(--radius-sm)',fontFamily:"inherit",
            background:cv.highlightMode===kl[0]?"var(--accent-light)":"transparent",
            color:cv.highlightMode===kl[0]?"var(--accent)":"var(--text-secondary)",
          }
        }, kl[1]);
      })
    ),
    cv.highlightMode === "isolate" && h("div", {style:{marginTop:6}},
      h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:'var(--text-xs)',color:"var(--text-secondary)"}},
        "Dim strength",
        h("input", {type:"range",min:0,max:1,step:0.05,value:cv.bgDimOpacity,
          onChange:function(e){cv.setBgDimOpacity(parseFloat(e.target.value));}})
      )
    ),
    cv.highlightMode === "tint" && h("div", {style:{marginTop:6,display:"flex",alignItems:"center",gap:6}},
      h("label", {style:{fontSize:'var(--text-xs)',color:"var(--text-secondary)"}}, "Tint"),
      h("input", {type:"color",value:cv.tintColor,onChange:function(e){cv.setTintColor(e.target.value);},style:{width:24,height:20,border:"none",padding:0,cursor:"pointer"}}),
      h("input", {type:"range",min:0,max:1,step:0.05,value:cv.tintOpacity,
        onChange:function(e){cv.setTintOpacity(parseFloat(e.target.value));}})
    ),
    cv.highlightMode === "spotlight" && h("div", {style:{marginTop:6}},
      h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:'var(--text-xs)',color:"var(--text-secondary)"}},
        "Dim strength",
        h("input", {type:"range",min:0,max:1,step:0.05,value:cv.spotDimOpacity,
          onChange:function(e){cv.setSpotDimOpacity(parseFloat(e.target.value));}})
      )
    )
  ) : null;

  // ─── Preview panel (shared between Create and Edit) ──────────────────────
  var isRealistic = app.previewMode === "realistic";
  var previewPanel = h("div", {style:{padding:"12px"}},
    h("div", {style:{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",marginBottom:'var(--s-2)'}}, "Chart Mode"),
    h("div", {style:{display:"flex",gap:3,marginBottom:'var(--s-3)'}},
      [["chart","Chart"],["pixel","Pixel"],["realistic","Realistic"]].map(function(kl) {
        var active = (!app.previewActive && kl[0]==="chart") || (app.previewActive && app.previewMode===kl[0]);
        return h("button", {
          key:kl[0],
          onClick:function(){
            if(kl[0]==="chart"){app.setPreviewActive(false);}
            else{app.setPreviewActive(true);app.setPreviewMode(kl[0]);}
          },
          style:{
            flex:1,padding:"6px 4px",fontSize:'var(--text-xs)',fontWeight:active?600:400,
            border:"1px solid "+(active?"var(--accent)":"var(--border)"),
            cursor:"pointer",borderRadius:'var(--radius-sm)',fontFamily:"inherit",
            background:active?"var(--accent-light)":"transparent",
            color:active?"var(--accent)":"var(--text-secondary)",
          }
        }, kl[1]);
      })
    ),
    isRealistic && app.previewActive && h(React.Fragment, null,
      h("div", {style:{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",marginBottom:'var(--s-1)'}}, "Quality Level"),
      h("div", {style:{display:"flex",gap:3,marginBottom:'var(--s-3)'}},
        [1,2,3,4].map(function(lv) {
          return h("button", {
            key:lv,
            onClick:function(){app.setRealisticLevel(lv);},
            style:{
              flex:1,padding:"5px 4px",fontSize:'var(--text-xs)',fontWeight:app.realisticLevel===lv?600:400,
              border:"1px solid "+(app.realisticLevel===lv?"var(--accent)":"var(--border)"),
              cursor:"pointer",borderRadius:'var(--radius-sm)',fontFamily:"inherit",
              background:app.realisticLevel===lv?"var(--accent-light)":"transparent",
              color:app.realisticLevel===lv?"var(--accent)":"var(--text-secondary)",
            }
          }, "Level "+lv);
        })
      )
    ),
    h("div", {style:{display:"flex",alignItems:"center",gap:'var(--s-2)',marginBottom:6}},
      h("label", {style:{fontSize:'var(--text-xs)',color:"var(--text-secondary)",flexShrink:0}}, "Coverage"),
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
    h("div", {style:{display:"flex",gap:3,marginBottom:'var(--s-3)'}},
      [["Sparse",0.25],["Standard",0.50],["Dense",0.80],["Full",0.95]].map(function(preset) {
        var active = app.coverageOverride!=null && Math.abs(app.coverageOverride - preset[1]) < 0.03;
        return h("button", {
          key:preset[0],
          onClick:function(){app.setCoverageOverride(preset[1]);},
          style:{
            flex:1,fontSize:9,padding:"3px 0",
            border:"1px solid "+(active?"var(--accent)":"var(--border)"),
            borderRadius:4,background:active?"var(--accent)":"transparent",
            color:active?"var(--surface)":"var(--text-secondary)",cursor:"pointer"
          }
        }, preset[0]);
      })
    ),
    h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:'var(--text-xs)',color:"var(--text-secondary)",marginBottom:'var(--s-1)'}},
      h("input", {type:"checkbox",checked:app.previewShowGrid,onChange:function(){app.setPreviewShowGrid(!app.previewShowGrid);}}),
      "Grid overlay"
    ),
    h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:'var(--text-xs)',color:"var(--text-secondary)"}},
      h("input", {type:"checkbox",checked:app.previewFabricBg,onChange:function(){app.setPreviewFabricBg(!app.previewFabricBg);}}),
      "Fabric background"
    ),
    // ── Split / compare view (moved here from the top toolbar) ──────────
    (ctx.pat && ctx.pal) && h("div", {style:{marginTop:14,paddingTop:10,borderTop:"1px solid var(--border)"}},
      h("div", {style:{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",marginBottom:'var(--s-2)'}}, "Compare"),
      h("button", {
        onClick:function(){
          var next = !app.splitPaneEnabled;
          app.setSplitPaneEnabled(next);
          if (typeof window.UserPrefs !== "undefined") window.UserPrefs.set("splitPaneEnabled", next);
        },
        "aria-pressed": app.splitPaneEnabled ? "true" : "false",
        title: app.splitPaneEnabled ? "Exit compare view (\\)" : "Compare chart vs realistic preview (\\)",
        style:{
          width:"100%",padding:"8px 10px",fontSize:'var(--text-sm)',fontWeight:app.splitPaneEnabled?600:500,
          border:"1px solid "+(app.splitPaneEnabled?"var(--accent)":"var(--border)"),
          background:app.splitPaneEnabled?"var(--accent-light)":"transparent",
          color:app.splitPaneEnabled?"var(--accent)":"var(--text-secondary)",
          borderRadius:'var(--radius-sm)',cursor:"pointer",fontFamily:"inherit",
          display:"flex",alignItems:"center",justifyContent:"center",gap:6
        }
      },
        h("svg", {width:14,height:12,viewBox:"0 0 14 12",fill:"none","aria-hidden":"true"},
          h("rect",{x:"0.7",y:"0.7",width:"5.3",height:"10.6",rx:"1",stroke:"currentColor",strokeWidth:"1.3"}),
          h("rect",{x:"8",y:"0.7",width:"5.3",height:"10.6",rx:"1",stroke:"currentColor",strokeWidth:"1.3"})
        ),
        app.splitPaneEnabled ? "Exit compare" : "Compare side-by-side"
      ),
      h("div", {style:{fontSize:10,color:"var(--text-tertiary)",marginTop:6,lineHeight:1.4}},
        "Shows the editable chart on the left and the realistic preview on the right."
      )
    )
  );

  // ─── Create Mode Sidebar ─────────────────────────────────────────────────
  if (mode === "create") {
    // Project info — name, designer, description. Always-visible at top so
    // users can name a pattern before generating it.
    var projectInfoSection = h(Section, {title:"Project info", defaultOpen:true},
      h("div", {style:{display:"flex",flexDirection:"column",gap:'var(--s-2)',padding:"4px 0 2px"}},
        h("label", {style:{display:"flex",flexDirection:"column",gap:3,fontSize:'var(--text-xs)',color:"var(--text-secondary)"}},
          "Pattern name",
          h("input", {
            type:"text", value: app.projectName || "", maxLength:60,
            placeholder: ctx.pat ? (ctx.sW + "\xD7" + ctx.sH + " pattern") : "e.g. Sunflower sampler",
            onChange: function(e) { var v = e.target.value.slice(0,60); if (typeof app.setProjectName === "function") app.setProjectName(v); },
            style:{padding:"6px 8px",fontSize:'var(--text-sm)',border:"1px solid var(--border)",borderRadius:'var(--radius-sm)',background:"var(--surface)",color:"var(--text-primary)"}
          })
        ),
        h("label", {style:{display:"flex",flexDirection:"column",gap:3,fontSize:'var(--text-xs)',color:"var(--text-secondary)"}},
          "Designer (optional)",
          h("input", {
            type:"text", value: app.projectDesigner || "", maxLength:80,
            placeholder: "Your name or studio",
            onChange: function(e) { var v = e.target.value.slice(0,80); if (typeof app.setProjectDesigner === "function") app.setProjectDesigner(v); },
            style:{padding:"6px 8px",fontSize:'var(--text-sm)',border:"1px solid var(--border)",borderRadius:'var(--radius-sm)',background:"var(--surface)",color:"var(--text-primary)"}
          })
        ),
        h("label", {style:{display:"flex",flexDirection:"column",gap:3,fontSize:'var(--text-xs)',color:"var(--text-secondary)"}},
          "Description / notes (optional)",
          h("textarea", {
            value: app.projectDescription || "", maxLength:500, rows:3,
            placeholder: "Source, copyright, stitching notes\u2026",
            onChange: function(e) { var v = e.target.value.slice(0,500); if (typeof app.setProjectDescription === "function") app.setProjectDescription(v); },
            style:{padding:"6px 8px",fontSize:'var(--text-sm)',border:"1px solid var(--border)",borderRadius:'var(--radius-sm)',background:"var(--surface)",color:"var(--text-primary)",resize:"vertical",minHeight:54,fontFamily:"inherit"}
          })
        )
      )
    );
    // ── Image tab — file picker, source thumbnail (with Crop / Change),
    //   plus the canonical Source-overlay toggle + opacity slider. The
    //   toolbar overlay button still works as a quick toggle.
    var overlayRow = h("div", {style:{padding:"12px",borderTop:ctx.pat&&gen.img?"1px solid var(--border)":"none"}},
      h("div", {style:{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}, "Source overlay"),
      h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:'var(--text-sm)',color:"var(--text-secondary)",marginBottom:'var(--s-2)',cursor:gen.img?"pointer":"not-allowed",opacity:gen.img?1:0.5}},
        h("input", {type:"checkbox", disabled:!gen.img, checked:!!cv.showOverlay,
          onChange:function(){cv.setShowOverlay(function(v){return !v;});}}),
        h("span", null, "Show source image over chart")
      ),
      h("div", {style:{display:"flex",alignItems:"center",gap:'var(--s-2)',opacity:(gen.img&&cv.showOverlay)?1:0.4}},
        h("label", {style:{fontSize:'var(--text-xs)',color:"var(--text-secondary)",flexShrink:0}}, "Opacity"),
        h("input", {type:"range",min:0,max:1,step:0.05,
          value:cv.overlayOpacity!=null?cv.overlayOpacity:0.3,
          disabled:!gen.img||!cv.showOverlay,
          onChange:function(e){cv.setOverlayOpacity(Number(e.target.value));},
          style:{flex:1}}),
        h("span", {style:{fontSize:10,color:"var(--text-tertiary)",minWidth:32,textAlign:"right",fontVariantNumeric:"tabular-nums"}},
          Math.round((cv.overlayOpacity!=null?cv.overlayOpacity:0.3)*100)+"%")
      ),
      !gen.img && h("div", {style:{fontSize:10,color:"var(--text-tertiary)",marginTop:6}},
        "Load an image to enable the overlay.")
    );
    var imageContent = h(React.Fragment, null,
      h("div", {style:{padding:"12px",display:"flex",flexDirection:"column",gap:'var(--s-2)'}},
        h("button", {
          onClick:function(){ if(gen.fRef && gen.fRef.current) gen.fRef.current.click(); },
          style:{padding:"8px 14px",fontSize:'var(--text-sm)',fontWeight:600,border:"1px solid var(--border)",borderRadius:'var(--radius-md)',background:"var(--surface-tertiary)",color:"var(--text-primary)",cursor:"pointer",fontFamily:"inherit"}
        }, gen.img ? "Change image\u2026" : "Choose image\u2026"),
        !gen.img && h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}},
          "Pick a photo or drawing to convert into a cross-stitch chart.")
      ),
      imageCard,
      overlayRow
    );

    // ── Dimensions tab — size controls + image adjustments + fabric count.
    var dimensionsContent = h(React.Fragment, null,
      dimSection,
      adjSection,
      fabSection
    );

    // ── Palette tab — palette source, quality cleanup, and palette swap.
    //   Background-removal moved to the Preview tab so users can colocate
    //   "what to skip" with the canvas they click on to pick the colour.
    var paletteContent = h(React.Fragment, null,
      palSection,
      cleanupSection,
      ctx.pat && ctx.pal && cv.paletteSwap && cv.paletteSwap.shiftSection,
      ctx.pat && ctx.pal && cv.paletteSwap && cv.paletteSwap.presetSection
    );

    // ── Preview tab — chart-mode controls + Background section first
    //   because picking the BG colour means clicking the preview canvas.
    var previewContent = h(React.Fragment, null,
      bgSection,
      previewPanel
    );

    // ── Project tab — name/designer/notes plus a live cost/size summary.
    var projectSummary = (function() {
      var palLen = ctx.pat && ctx.pal ? (ctx.displayPal || ctx.pal || []).length : 0;
      var stitchable = ctx.totalStitchable || (ctx.pat ? (ctx.sW * ctx.sH) : 0);
      var fabricCt = ctx.fabricCt || 14;
      var finishedW = (ctx.sW / fabricCt).toFixed(1);
      var finishedH = (ctx.sH / fabricCt).toFixed(1);
      var skeins = (ctx.pat && typeof skeinEst === "function" && palLen > 0)
        ? (ctx.displayPal || ctx.pal || []).reduce(function(t,p){ return t + (p && p.count ? skeinEst(p.count, fabricCt) : 0); }, 0)
        : 0;
      var cost = skeins * (ctx.skeinPrice || (typeof DEFAULT_SKEIN_PRICE !== "undefined" ? DEFAULT_SKEIN_PRICE : 0.95));
      function row(label, value) {
        return h("div", {style:{display:"contents"}},
          h("span", {style:{color:"var(--text-tertiary)"}}, label),
          h("span", {style:{textAlign:"right",fontVariantNumeric:"tabular-nums"}}, value)
        );
      }
      return h(Section, {title:"Live summary", defaultOpen:true},
        h("div", {style:{display:"grid",gridTemplateColumns:"auto 1fr",columnGap:12,rowGap:4,fontSize:'var(--text-sm)',padding:"4px 0"}},
          row("Size", ctx.sW + " \u00D7 " + ctx.sH + " stitches"),
          row("Finished", finishedW + " \u00D7 " + finishedH + " in (" + fabricCt + "ct)"),
          row("Colours", ctx.pat ? (palLen + " colour" + (palLen === 1 ? "" : "s")) : "\u2014"),
          row("Stitches", ctx.pat ? stitchable.toLocaleString() : "\u2014"),
          row("Skeins", ctx.pat && skeins > 0 ? ("\u2248 " + Math.ceil(skeins)) : "\u2014"),
          row("Estimated cost", ctx.pat && cost > 0
            ? ("\u2248 " + (typeof window.AppPrefs !== "undefined" && window.AppPrefs.formatCurrency
                ? window.AppPrefs.formatCurrency(cost)
                : ("\u00A3" + cost.toFixed(2))))
            : "\u2014")
        )
      );
    })();
    var projectContent = h(React.Fragment, null,
      projectInfoSection,
      projectSummary
    );

    var tabContentMap = {
      image: imageContent,
      dimensions: dimensionsContent,
      palette: paletteContent,
      preview: previewContent,
      project: projectContent
    };
    var activeContent = tabContentMap[sTab] || imageContent;
    // ── Create mode bottom action bar ─────────────────────────────────────
    var createActions = h("div", {style:{
      flexShrink:0, borderTop:"1px solid var(--border)", padding:"12px",
      background:"var(--surface)", display:"flex", flexDirection:"column", gap:'var(--s-2)'
    }},
      // Generate / Regenerate button
      gen.img && h("button", {
        onClick:function(){ gen.generate(); },
        disabled:gen.busy,
        "aria-label":gen.hasGenerated?"Regenerate pattern":"Generate pattern",
        style:{width:"100%",padding:"10px",fontSize:'var(--text-md)',fontWeight:600,cursor:gen.busy?"wait":"pointer",
          border:"none",borderRadius:'var(--radius-md)',
          background:gen.busy?"var(--text-tertiary)":gen.hasGenerated?"var(--surface-tertiary)":"var(--accent)",
          color:gen.hasGenerated?"var(--text-primary)":"var(--surface)"}
      }, gen.busy ? "Generating\u2026" : (gen.hasGenerated ? "\u21BB Regenerate" : "\u21BB Generate Pattern")),
      // Continue to Edit → (only after generation)
      gen.hasGenerated && h("button", {
        "aria-label":"Continue to Edit mode",
        onClick:function(){
          // Brief D — flush the freshly-generated pattern to IndexedDB now,
          // so leaving Creator immediately doesn't lose the pattern and the
          // Stash Manager pattern library + shopping list pick it up. The
          // flush calls ProjectStorage.save() which in turn fires
          // StashBridge.syncProjectToLibrary().
          if (typeof window.__flushProjectToIDB === 'function') {
            try { window.__flushProjectToIDB(); } catch (e) {}
          }
          app.setAppMode("edit");
          app.setSidebarTab("palette");
          if(window.__switchToEdit) window.__switchToEdit();
          app.addToast("Switched to Edit mode", {type:"info", duration:2000});
        },
        style:{width:"100%",padding:"10px",fontSize:'var(--text-md)',fontWeight:600,cursor:"pointer",
          border:"none",borderRadius:'var(--radius-md)',background:"var(--accent)",color:"var(--surface)",
          display:"flex",alignItems:"center",justifyContent:"center",gap:6}
      }, "Edit Pattern \u2192"),
      // Hint text
      !gen.img && h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",textAlign:"center",padding:"4px 0"}},
        "Upload an image to get started")
    );
    return h(React.Fragment, null,
      tabBar,
      h("div", {
        id:"sidebar-panel-"+sTab,
        role:"tabpanel",
        "aria-label":"Create mode "+sTab+" panel",
        style:{overflowY:"auto",flex:1}
      }, activeContent),
      createActions
    );
  }

  // ─── Edit Mode Sidebar ────────────────────────────────────────────────────

  // Tools tab — absorbs the stitch-type, brush-size, lasso-mode and
  // backstitch-continuous controls that used to live in the top toolbar.
  // The toolbar keeps Paint/Fill/Erase/Pick + Wand/Lasso primary buttons;
  // every "what does my brush do" mode tweak lives here.
  var stitchOpts = [
    ["cross",         "Cross"],
    ["quarter",       "\u00BC Stitch"],
    ["half-fwd",      "Half /"],
    ["half-bck",      "Half \\"],
    ["three-quarter", "\u00BE Stitch"],
    ["backstitch",    "Backstitch"]
  ];
  var curStitch = cv.stitchType || "cross";
  var stitchTypeSection = h("div", {style:{padding:"12px"}},
    h("div", {style:{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:'var(--s-2)'}},
      "Stitch type"),
    h("div", {role:"radiogroup", "aria-label":"Stitch type",
      style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}},
      stitchOpts.map(function(kl) {
        var on = curStitch === kl[0];
        return h("button", {
          key:kl[0],
          role:"radio",
          "aria-checked": on ? "true" : "false",
          onClick:function(){ cv.selectStitchType(kl[0]); },
          style:{
            padding:"7px 8px",fontSize:'var(--text-sm)',fontWeight:on?600:400,
            border:"1px solid "+(on?"var(--accent)":"var(--border)"),
            background:on?"var(--accent-light)":"transparent",
            color:on?"var(--accent)":"var(--text-secondary)",
            borderRadius:'var(--radius-sm)',cursor:"pointer",fontFamily:"inherit",textAlign:"left"
          }
        }, kl[1]);
      })
    ),
    h("div", {style:{fontSize:10,color:"var(--text-tertiary)",marginTop:6,lineHeight:1.4}},
      "Shortcuts: 1\u20134 for Cross / Half\u2009/ / Half\u2009\\ / Backstitch \u00B7 T cycles, Shift+T reverses.")
  );

  var bsContSection = (curStitch === "backstitch") ? h("div", {
    style:{padding:"0 12px 12px"}
  },
    h("div", {style:{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}},
      "Backstitch options"),
    h("label", {style:{display:"flex",alignItems:"center",gap:'var(--s-2)',fontSize:'var(--text-sm)',color:"var(--text-secondary)",cursor:"pointer"}},
      h("input", {type:"checkbox", checked: !!cv.bsContinuous,
        onChange:function(e){ cv.setBsContinuous(e.target.checked); cv.setBsStart(null); }}),
      h("span", null, "Continuous mode \u2014 chain segments without re-clicking the start")
    )
  ) : null;

  var brushSizeSection = h("div", {style:{padding:"0 12px 12px",borderTop:"1px solid var(--border)",paddingTop:12}},
    h("div", {style:{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:'var(--s-2)'}},
      "Brush size"),
    h("div", {style:{display:"flex",alignItems:"center",gap:'var(--s-2)'}},
      h("input", {type:"range", min:1, max:3, step:1, value:cv.brushSize||1,
        onChange:function(e){ cv.setBrushSize(parseInt(e.target.value,10)); },
        "aria-label":"Brush size",
        style:{flex:1}}),
      h("div", {style:{display:"flex",gap:3}},
        [1,2,3].map(function(sz) {
          var on = cv.brushSize === sz;
          return h("button", {
            key:sz,
            onClick:function(){ cv.setBrushSize(sz); },
            "aria-pressed": on ? "true" : "false",
            style:{
              minWidth:28,padding:"4px 8px",fontSize:'var(--text-sm)',fontWeight:on?600:400,
              border:"1px solid "+(on?"var(--accent)":"var(--border)"),
              background:on?"var(--accent-light)":"transparent",
              color:on?"var(--accent)":"var(--text-secondary)",
              borderRadius:'var(--radius-sm)',cursor:"pointer",fontFamily:"inherit"
            }
          }, sz);
        })
      )
    ),
    h("div", {style:{fontSize:10,color:"var(--text-tertiary)",marginTop:6,lineHeight:1.4}},
      "Applies to Cross and Half stitches, and the Erase tool.")
  );

  var lassoModes = [["freehand","Freehand"],["polygon","Polygon"],["magnetic","Magnetic"]];
  var curLasso = cv.lassoMode || "freehand";
  var selectionSection = h("div", {style:{padding:"0 12px 12px",borderTop:"1px solid var(--border)",paddingTop:12}},
    h("div", {style:{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:'var(--s-2)'}},
      "Selection"),
    h("div", {style:{display:"flex",gap:6,marginBottom:10}},
      h("button", {
        onClick:function(){
          if (cv.activeTool === "magicWand") { cv.setActiveTool(null); }
          else { cv.setActiveTool("magicWand"); ctx.setPartialStitchTool(null); cv.setBsStart(null); if (cv.cancelLasso) cv.cancelLasso(); }
        },
        "aria-pressed": cv.activeTool === "magicWand" ? "true" : "false",
        style:{
          flex:1,padding:"6px 8px",fontSize:'var(--text-sm)',
          fontWeight:cv.activeTool==="magicWand"?600:400,
          border:"1px solid "+(cv.activeTool==="magicWand"?"var(--accent)":"var(--border)"),
          background:cv.activeTool==="magicWand"?"var(--accent-light)":"transparent",
          color:cv.activeTool==="magicWand"?"var(--accent)":"var(--text-secondary)",
          borderRadius:'var(--radius-sm)',cursor:"pointer",fontFamily:"inherit"
        }
      }, "Magic Wand (W)"),
      h("button", {
        onClick:function(){
          if (cv.activeTool === "lasso") { if (cv.cancelLasso) cv.cancelLasso(); cv.setActiveTool(null); }
          else { cv.setActiveTool("lasso"); cv.setLassoMode(curLasso); ctx.setPartialStitchTool(null); cv.setBsStart(null); }
        },
        "aria-pressed": cv.activeTool === "lasso" ? "true" : "false",
        style:{
          flex:1,padding:"6px 8px",fontSize:'var(--text-sm)',
          fontWeight:cv.activeTool==="lasso"?600:400,
          border:"1px solid "+(cv.activeTool==="lasso"?"var(--accent)":"var(--border)"),
          background:cv.activeTool==="lasso"?"var(--accent-light)":"transparent",
          color:cv.activeTool==="lasso"?"var(--accent)":"var(--text-secondary)",
          borderRadius:'var(--radius-sm)',cursor:"pointer",fontFamily:"inherit"
        }
      }, "Lasso")
    ),
    h("div", {style:{fontSize:10,fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}},
      "Lasso mode"),
    h("div", {role:"radiogroup", "aria-label":"Lasso mode",
      style:{display:"flex",gap:'var(--s-1)',marginBottom:'var(--s-2)'}},
      lassoModes.map(function(kl) {
        var on = curLasso === kl[0];
        return h("button", {
          key:kl[0],
          role:"radio",
          "aria-checked": on ? "true" : "false",
          onClick:function(){
            cv.setLassoMode(kl[0]);
            // If lasso isn't active yet, picking a mode here activates it.
            if (cv.activeTool !== "lasso") {
              cv.setActiveTool("lasso"); ctx.setPartialStitchTool(null); cv.setBsStart(null);
            }
          },
          style:{
            flex:1,padding:"5px 6px",fontSize:'var(--text-xs)',fontWeight:on?600:400,
            border:"1px solid "+(on?"var(--accent)":"var(--border)"),
            background:on?"var(--accent-light)":"transparent",
            color:on?"var(--accent)":"var(--text-secondary)",
            borderRadius:'var(--radius-sm)',cursor:"pointer",fontFamily:"inherit"
          }
        }, kl[1]);
      })
    ),
    h("div", {style:{fontSize:10,color:"var(--text-tertiary)",lineHeight:1.4}},
      "Modifier hint: Shift = add to selection, Alt = subtract."),
    (cv.hasSelection || cv.lassoInProgress) && h("button", {
      onClick:function(){ if (cv.cancelLasso) cv.cancelLasso(); if (cv.clearSelection) cv.clearSelection(); },
      style:{
        marginTop:'var(--s-2)',width:"100%",padding:"6px 8px",fontSize:'var(--text-xs)',
        border:"1px solid var(--border)",borderRadius:'var(--radius-sm)',
        background:"var(--surface)",color:"var(--text-secondary)",
        cursor:"pointer",fontFamily:"inherit"
      }
    }, "Clear selection (" + (cv.selectionCount || 0).toLocaleString() + ")")
  );

  var toolsContent = h(React.Fragment, null,
    stitchTypeSection,
    bsContSection,
    brushSizeSection,
    selectionSection
  );

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
        style:{width:"100%",padding:"8px",fontSize:'var(--text-sm)',fontWeight:600,cursor:"pointer",border:"none",borderRadius:'var(--radius-md)',background:"var(--accent)",color:"var(--surface)",marginTop:'var(--s-2)'}
      }, "\u21BB Regenerate")
    ),
    h(Section, {title:"Project Info",defaultOpen:false},
      h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-secondary)",padding:"4px 0"}},
        ctx.sW + " \xD7 " + ctx.sH + " stitches \u00B7 " + (ctx.displayPal||ctx.pal||[]).length + " colours"
      )
    )
  );

  // ── Edit mode bottom action bar (removed in Option 2) ───────────────────
  // The `[← Create] [Start Tracking →]` row that used to sit at the bottom
  // of the edit-mode sidebar has been promoted into the action bar's
  // segmented mode switch (Create / Edit / Track). Removing it here gives
  // the palette tab back ~50px of vertical space and removes a duplicate
  // "Track" entry point — see creator/ActionBar.js.
  var editActions = null;

  // ─── B3: mode-aware sidebar — hide on Materials, summarise on Project ─────
  // Only applies when a pattern is loaded (edit mode); the create-mode early
  // return above already governs pre-generation rendering.
  if (ctx.pat && ctx.pal && app && app.tab === 'materials') {
    return null;
  }
  if (ctx.pat && ctx.pal && app && app.tab === 'project') {
    var palLen = (ctx.displayPal || ctx.pal || []).length;
    return h('aside', { className: 'cs-sidebar-fade', style: { padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 } },
      h('div', { style: { fontSize:'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: 0.4 } }, 'Project at a glance'),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 4, fontSize:'var(--text-sm)' } },
        h('span', { style: { color: 'var(--text-tertiary)' } }, 'Size'),
        h('span', null, ctx.sW + ' \u00D7 ' + ctx.sH + ' stitches'),
        h('span', { style: { color: 'var(--text-tertiary)' } }, 'Colours'),
        h('span', null, palLen),
        h('span', { style: { color: 'var(--text-tertiary)' } }, 'Fabric'),
        h('span', null, (ctx.fabricCt || 14) + ' count'),
        ctx.totalSkeins != null && h('span', { style: { color: 'var(--text-tertiary)' } }, 'Skeins'),
        ctx.totalSkeins != null && h('span', null, ctx.totalSkeins)
      ),
      h('div', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', lineHeight: 1.4 } },
        'Use the canvas tools on the Pattern page to edit. Generation parameters are above on this page.')
    );
  }

  return h(React.Fragment, null,
    tabBar,
    h("div", {style:{overflowY:"auto",flex:1}},
      sTab === "palette" && h(React.Fragment, null,
        palChipsSection,
        coloursSection
      ),
      sTab === "tools" && toolsContent,
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
