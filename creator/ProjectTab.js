/* creator/ProjectTab.js — Project planning: time estimate, finished size, cost, thread organiser.
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: Section, SliderRow (components.js),
               fmtTimeL, skeinEst (helpers.js), FABRIC_COUNTS (constants.js),
               StashBridge (stash-bridge.js, optional), CreatorContext (context.js) */

window.CreatorProjectTab = function CreatorProjectTab() {
  var ctx = window.usePatternData();
  var app = window.useApp();
  var cv  = window.useCanvas();
  var h = React.createElement;
  var _cvtOpen = React.useState(false); var convertOpen = _cvtOpen[0], setConvertOpen = _cvtOpen[1];

  if (!(ctx.pat && ctx.pal)) return null;
  if (app.tab !== "project") return null;

  // ── Pattern Summary (removed in Option 2) ──────────────────────────────────
  // The Pattern Summary section that listed dimensions, fabric, colours,
  // skeins, difficulty, stitchability and progress used to live here. All
  // that data now lives behind the `Pattern info` chip in the action bar
  // (see creator/PatternInfoPopover.js). The discoverability callout
  // further down points users at it.

  // ── Time Estimate ───────────────────────────────────────────────────────────
  function renderTimeEstimate() {
    return h(Section, {title:"Time Estimate"},
      h("div", {style:{marginTop:'var(--s-2)'}},
        h(SliderRow, {
          label:"Stitching speed", value:ctx.stitchSpeed, min:10, max:120, step:5,
          onChange:ctx.setStitchSpeed, format:function(v){return v+" stitches/hr";}
        }),
        h("div", {style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 20px",marginTop:10}},
          h("div", null,
            h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",textTransform:"uppercase",fontWeight:600,marginBottom:2}}, "Total estimate"),
            h("div", {style:{fontSize:'var(--text-xl)',fontWeight:700,color:"var(--text-primary)"}},
              fmtTimeL(Math.round(ctx.totalStitchable / ctx.stitchSpeed * 3600))
            )
          ),
          h("div", null,
            h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",textTransform:"uppercase",fontWeight:600,marginBottom:2}}, "Remaining"),
            h("div", {style:{fontSize:'var(--text-xl)',fontWeight:700,color:ctx.doneCount>=ctx.totalStitchable?"var(--success)":"var(--accent)"}},
              ctx.doneCount >= ctx.totalStitchable ? "Done!" : fmtTimeL(Math.round((ctx.totalStitchable - ctx.doneCount) / ctx.stitchSpeed * 3600))
            )
          )
        ),
        ctx.totalTime > 0 && ctx.doneCount > 0 && h("div", {
          style:{marginTop:'var(--s-2)',padding:"8px 12px",background:"var(--surface-secondary)",borderRadius:'var(--radius-md)',border:"0.5px solid var(--border)",fontSize:'var(--text-sm)',color:"var(--text-secondary)"}
        }, "Based on your actual sessions: " + Math.round(ctx.doneCount / (ctx.totalTime / 3600)) + " stitches/hr average")
      )
    );
  }

  // ── Finished Size ───────────────────────────────────────────────────────────
  function renderFinishedSize() {
    var fabrics = [
      {ct:14,label:"14 count Aida"},{ct:16,label:"16 count Aida"},{ct:18,label:"18 count Aida"},
      {ct:20,label:"20 count Aida"},{ct:22,label:"22 count Aida"},
      {ct:25,label:"25 count Evenweave"},{ct:28,label:"28 count Evenweave (over 2)"}
    ];
    return h(Section, {title:"Finished Size"},
      h("div", {style:{marginTop:'var(--s-2)',overflow:"auto"}},
        h("table", {style:{width:"100%",borderCollapse:"collapse",fontSize:'var(--text-sm)'}},
          h("thead", null,
            h("tr", {style:{background:"var(--surface-secondary)"}},
              ["Fabric","Width","Height","With margin"].map(function(hd, i) {
                return h("th", {key:i, style:{padding:"7px 10px",textAlign:"left",borderBottom:"2px solid var(--border)",color:"var(--text-secondary)",fontWeight:600,fontSize:'var(--text-xs)',textTransform:"uppercase"}}, hd);
              })
            )
          ),
          h("tbody", null,
            fabrics.map(function(f) {
              var div = f.ct === 28 ? 14 : f.ct;
              var wIn = ctx.sW / div, hIn = ctx.sH / div;
              var wCm = wIn * 2.54, hCm = hIn * 2.54;
              var isCurrent = f.ct === ctx.fabricCt;
              return h("tr", {
                key:f.ct,
                style:{borderBottom:"0.5px solid var(--surface-tertiary)",background:isCurrent?"var(--accent-light)":"transparent"}
              },
                h("td", {style:{padding:"6px 10px",fontWeight:isCurrent?700:400}}, f.label+(isCurrent?" \u2713":"")),
                h("td", {style:{padding:"6px 10px"}}, wIn.toFixed(1)+"\u2033 / "+wCm.toFixed(1)+" cm"),
                h("td", {style:{padding:"6px 10px"}}, hIn.toFixed(1)+"\u2033 / "+hCm.toFixed(1)+" cm"),
                h("td", {style:{padding:"6px 10px",fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}, (wIn+2).toFixed(0)+"\u2033 \xD7 "+(hIn+2).toFixed(0)+"\u2033")
              );
            })
          )
        )
      )
    );
  }

  // ── Cost Estimate ───────────────────────────────────────────────────────────
  function renderCostEstimate() {
    return h(Section, {title:"Cost Estimate", defaultOpen:false},
      h("div", {style:{marginTop:'var(--s-2)'}},
        h("div", {style:{display:"flex",alignItems:"center",gap:'var(--s-2)',marginBottom:10}},
          h("span", {style:{fontSize:'var(--text-sm)',color:"var(--text-secondary)"}}, "Price per skein (\xA3)"),
          h("input", {
            type:"number", inputMode:"decimal", value:ctx.skeinPrice, min:0, step:0.05,
            onChange:function(e){ctx.setSkeinPrice(Math.max(0,parseFloat(e.target.value)||0));},
            style:{width:70,padding:"5px 8px",border:"0.5px solid var(--border)",borderRadius:'var(--radius-sm)',fontSize:'var(--text-md)',textAlign:"right"}
          })
        ),
        h("div", {style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 20px"}},
          h("div", null,
            h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",textTransform:"uppercase",fontWeight:600,marginBottom:2}}, "Thread cost"),
            h("div", {style:{fontSize:'var(--text-xl)',fontWeight:700,color:"var(--text-primary)"}}, "\xA3"+(ctx.totalSkeins*ctx.skeinPrice).toFixed(2)),
            h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}, ctx.totalSkeins+" skeins \xD7 \xA3"+ctx.skeinPrice.toFixed(2))
          ),
          ctx.toBuyCount < ctx.skeinData.length && h("div", null,
            h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",textTransform:"uppercase",fontWeight:600,marginBottom:2}}, "Still to buy"),
            h("div", {style:{fontSize:'var(--text-xl)',fontWeight:700,color:"var(--accent-hover)"}},
              "\xA3"+(ctx.toBuyList.reduce(function(s,d){return s+d.skeins;},0)*ctx.skeinPrice).toFixed(2)
            ),
            h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}},
              ctx.toBuyList.reduce(function(s,d){return s+d.skeins;},0)+" skeins"
            )
          )
        ),
        h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",marginTop:'var(--s-2)'}},
          "Doesn\u2019t include fabric, needles, hoop, or frame. DMC skeins typically \xA30.85\u2013\xA31.10 in UK shops."
        )
      )
    );
  }

  // ── Thread Organiser ────────────────────────────────────────────────────────
  function renderThreadOrganiser() {
    // Cache: scanning the global stash is O(n) and was previously called 3x per render
    // (disabled / title / opacity props on the substitute button below).
    var hasOwnedStash = false;
    if (ctx.globalStash) {
      var _stashKeys = Object.keys(ctx.globalStash);
      for (var _i = 0; _i < _stashKeys.length; _i++) {
        var _e = ctx.globalStash[_stashKeys[_i]];
        if (_e && _e.owned > 0) { hasOwnedStash = true; break; }
      }
    }
    return h(Section, {title:"Thread Organiser"},
      h("div", {style:{marginTop:'var(--s-2)',display:"flex",gap:'var(--s-3)',marginBottom:10}},
        h("div", {style:{padding:"6px 14px",background:"var(--success-soft)",borderRadius:'var(--radius-md)',border:"1px solid var(--success-soft)",fontSize:'var(--text-sm)'}},
          h("span", {style:{fontWeight:700,color:"var(--success)"}}, ctx.ownedCount), " ",
          h("span", {style:{color:"var(--text-secondary)"}}, "owned")
        ),
        h("div", {style:{padding:"6px 14px",background:"#F8EFD8",borderRadius:'var(--radius-md)',border:"1px solid #E5C99A",fontSize:'var(--text-sm)'}},
          h("span", {style:{fontWeight:700,color:"var(--accent-hover)"}}, ctx.toBuyList.length), " ",
          h("span", {style:{color:"var(--text-secondary)"}}, "to buy")
        ),
        h("div", {style:{marginLeft:"auto",display:"flex",gap:'var(--s-1)'}},
          h("button", {
            onClick:function(){
              var n = {};
              ctx.skeinData.forEach(function(d){n[d.id]="owned";});
              ctx.setThreadOwned(n);
            },
            style:{fontSize:'var(--text-xs)',padding:"4px 10px",border:"1px solid var(--success-soft)",borderRadius:'var(--radius-sm)',background:"var(--success-soft)",color:"var(--success)",cursor:"pointer"}
          }, "Own all"),
          h("button", {
            onClick:function(){ctx.setThreadOwned({});},
            style:{fontSize:'var(--text-xs)',padding:"4px 10px",border:"0.5px solid var(--border)",borderRadius:'var(--radius-sm)',background:"var(--surface)",color:"var(--text-secondary)",cursor:"pointer"}
          }, "Clear")
        )
      ),
      h("div", {style:{display:"flex",flexDirection:"column",gap:2,maxHeight:320,overflow:"auto"}},
        ctx.skeinData.map(function(d) {
          var st = ctx.threadOwned[d.id] || "";
          var isOwned = st === "owned";
          var gs = ctx.globalStash[d.id] || {};
          var owned = gs.owned || 0;
          var enough = owned >= d.skeins;
          return h(React.Fragment, {key:d.id},
            h("div", {
              style:{display:"flex",alignItems:"center",gap:'var(--s-2)',padding:"4px 8px",borderRadius:'var(--radius-sm)',
                background:isOwned?"var(--success-soft)":"var(--surface)",
                border:"1px solid "+(isOwned?"var(--success-soft)":"var(--surface-tertiary)")}
            },
              h("span", {style:{width:16,height:16,borderRadius:3,background:"rgb("+d.rgb[0]+","+d.rgb[1]+","+d.rgb[2]+")",border:"1px solid var(--border)",flexShrink:0}}),
              h("span", {style:{fontWeight:700,fontSize:'var(--text-md)',minWidth:44}}, "DMC "+d.id),
              h("span", {style:{fontSize:'var(--text-xs)',color:"var(--text-secondary)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}, d.name),
              h("span", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",flexShrink:0}}, d.skeins+"sk"),
              h("button", {
                onClick:function(){ctx.toggleOwned(d.id);},
                style:{fontSize:'var(--text-xs)',padding:"3px 10px",borderRadius:5,cursor:"pointer",fontWeight:600,minWidth:55,textAlign:"center",
                  border:"1px solid "+(isOwned?"var(--success-soft)":"#E5C99A"),
                  background:isOwned?"var(--success-soft)":"#F8EFD8",
                  color:isOwned?"var(--success)":"var(--accent-hover)"
                }
              }, isOwned ? "Owned" : "To buy"),
              h("span", {className:"stash-badge "+(enough?"stash-badge--in":"stash-badge--out")}, owned+"/"+d.skeins+" in stash"),
              typeof StashBridge !== "undefined" && h("button", {
                onClick:function(e){
                  e.stopPropagation();
                  ctx.setAltOpen(ctx.altOpen === d.id ? null : d.id);
                },
                style:{fontSize:10,padding:"2px 6px",borderRadius:4,cursor:"pointer",fontWeight:600,
                  border:"1px solid #e0e7ff",
                  background:ctx.altOpen===d.id?"#e0e7ff":"var(--surface)",
                  color:"#4338ca"
                },
                title:"Show similar threads from stash"
              }, "\u2248")
            ),
            ctx.altOpen === d.id && (function() {
              var alts = StashBridge.suggestAlternatives(d.id, 5, ctx.globalStash);
              return alts.length > 0
                ? h("div", {style:{padding:"6px 12px 8px 36px",display:"flex",gap:6,flexWrap:"wrap",fontSize:'var(--text-xs)',alignItems:"center"}},
                    h("span", {style:{color:"var(--text-secondary)",fontWeight:600}}, "Similar in stash:"),
                    alts.map(function(a) {
                      return h("span", {key:a.id, style:{display:"inline-flex",alignItems:"center",gap:'var(--s-1)',padding:"2px 8px",borderRadius:'var(--radius-lg)',background:"#f0f0ff",border:"1px solid #e0e7ff"}},
                        h("span", {style:{width:10,height:10,borderRadius:2,background:"rgb("+a.rgb[0]+","+a.rgb[1]+","+a.rgb[2]+")",border:"1px solid var(--border)"}}),
                        h("span", {style:{fontWeight:600}}, "DMC "+a.id),
                        h("span", {style:{color:"var(--text-secondary)"}}, a.name),
                        h("span", {style:{color:"var(--text-tertiary)"}}, "\u0394E "+a.deltaE),
                        h("span", {style:{color:"#4338ca"}}, a.owned+"sk")
                      );
                    })
                  )
                : h("div", {style:{padding:"6px 12px 8px 36px",fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}},
                    "No similar threads found in your stash."
                  );
            })()
          );
        })
      ),
      h("div", {style:{display:"flex",gap:'var(--s-2)',marginTop:10,flexWrap:"wrap",alignItems:"center"}},
        h("button", {
          onClick: function() {
            if (typeof StashBridge === "undefined") { alert("Stash bridge not loaded."); return; }
            StashBridge.getGlobalStash().then(function(stash) {
              var result = analyseSubstitutions(
                ctx.skeinData,
                ctx.threadOwned,
                stash,
                ctx.fabricCt,
                { maxDeltaE: ctx.substituteMaxDeltaE, dmcData: DMC }
              );
              ctx.setSubstituteProposal(result);
              ctx.setSubstituteModalKey(function(k) { return k + 1; });
              ctx.setSubstituteModalOpen(true);
            }).catch(function() {
              app.addToast("Failed to load stash data.", { type: "error", duration: 3000 });
            });
          },
          disabled: (function() {
            if (typeof StashBridge === "undefined") return true;
            if (!ctx.pat) return true;
            if (ctx.toBuyList.length === 0) return true;
            return !hasOwnedStash;
          })(),
          title: (function() {
            if (typeof StashBridge === "undefined") return "Stash bridge not available";
            if (!ctx.pat) return "No pattern loaded";
            if (ctx.toBuyList.length === 0) return "All threads are already marked as owned";
            if (!hasOwnedStash) return "Add threads to your stash first";
            return "Find stash alternatives for unowned threads";
          })(),
          style:{padding:"8px 18px",fontSize:'var(--text-md)',borderRadius:'var(--radius-md)',border:"1px solid var(--accent-light)",background:"var(--surface-secondary)",color:"var(--accent)",cursor:"pointer",fontWeight:600,
            opacity:(function() {
              if (typeof StashBridge === "undefined" || !ctx.pat || ctx.toBuyList.length === 0) return 0.5;
              if (!hasOwnedStash) return 0.5;
              return 1;
            })()
          }
        }, "Replace with Stash Threads"),
        h("button", {
          onClick: function() {
            if (typeof StashBridge === "undefined") { alert("Stash bridge not loaded."); return; }
            StashBridge.getGlobalStash().then(function(stash) {
              var missing = [], short = [];
              ctx.skeinData.forEach(function(d) {
                var stashEntry2 = stash[d.id];
                var owned2 = (stashEntry2 && typeof stashEntry2 === 'object' && typeof stashEntry2.owned === 'number') ? stashEntry2.owned : 0;
                if (owned2 === 0) missing.push("DMC "+d.id+" (need "+d.skeins+"sk)");
                else if (owned2 < d.skeins) short.push("DMC "+d.id+" (have "+owned2+", need "+d.skeins+"sk)");
              });
              ctx.setKittingResult({missing:missing, short:short, total:ctx.skeinData.length});
            });
          },
          style:{padding:"8px 18px",fontSize:'var(--text-md)',borderRadius:'var(--radius-md)',border:"1px solid var(--accent-light)",background:"var(--surface-secondary)",color:"var(--accent)",cursor:"pointer",fontWeight:600}
        }, "Kit This Project"),
        typeof window.ConvertPaletteModal !== "undefined"
          ? h("button", {
              onClick: function() { setConvertOpen(true); },
              disabled: !ctx.pat || !ctx.pal || ctx.pal.length === 0,
              title: "Convert this pattern's palette between DMC and Anchor thread brands",
              style:{padding:"8px 18px",fontSize:'var(--text-md)',borderRadius:'var(--radius-md)',border:"1px solid var(--accent-light)",background:"var(--surface-secondary)",color:"var(--accent)",cursor:"pointer",fontWeight:600,
                opacity:(!ctx.pat || !ctx.pal || ctx.pal.length === 0) ? 0.5 : 1}
            }, "Change Thread Brand")
          : null
      ),
      ctx.kittingResult && h("div", {style:{marginTop:'var(--s-2)',padding:"10px 14px",borderRadius:'var(--radius-md)',border:"1px solid var(--border)",background:"var(--surface-secondary)",fontSize:'var(--text-sm)'}},
        h("div", {style:{fontWeight:700,marginBottom:'var(--s-1)'}}, "Kitting check ("+ctx.kittingResult.total+" colours)"),
        ctx.kittingResult.missing.length===0 && ctx.kittingResult.short.length===0 && h("div", {style:{color:"var(--success)",fontWeight:600}}, "\u2713 You have everything!"),
        ctx.kittingResult.missing.length > 0 && h("div", null,
          h("div", {style:{color:"var(--danger)",fontWeight:600,marginBottom:2}}, "Missing ("+ctx.kittingResult.missing.length+"):"),
          ctx.kittingResult.missing.map(function(m, i) { return h("div", {key:i, style:{color:"var(--danger)",marginLeft:'var(--s-2)'}}, m); })
        ),
        ctx.kittingResult.short.length > 0 && h("div", {style:{marginTop:'var(--s-1)'}},
          h("div", {style:{color:"#A06F2D",fontWeight:600,marginBottom:2}}, "Low stock ("+ctx.kittingResult.short.length+"):"),
          ctx.kittingResult.short.map(function(m, i) { return h("div", {key:i, style:{color:"#A06F2D",marginLeft:'var(--s-2)'}}, m); })
        ),
        h("div", {style:{display:"flex",gap:6,marginTop:'var(--s-2)'}},
          h("button", {
            onClick:function(){
              var lines = ctx.kittingResult.missing.concat(ctx.kittingResult.short);
              app.copyText(lines.join("\n"), "kit");
            },
            style:{fontSize:'var(--text-xs)',padding:"4px 10px",borderRadius:'var(--radius-sm)',border:"0.5px solid var(--border)",background:"var(--surface)",cursor:"pointer"}
          }, "Copy gaps"),
          typeof StashBridge !== "undefined" && h("button", {
            onClick:function(){
              var toBuy2 = ctx.kittingResult.missing.concat(ctx.kittingResult.short).map(function(l){
                var m = l.match(/DMC (\S+)/); return m ? m[1] : null;
              }).filter(Boolean);
              Promise.all(toBuy2.map(function(id){return StashBridge.updateThreadToBuy(id, true);}))
                .then(function(){alert("Marked "+toBuy2.length+" thread(s) as To Buy in Stash Manager.");});
            },
            style:{fontSize:'var(--text-xs)',padding:"4px 10px",borderRadius:'var(--radius-sm)',border:"1px solid #E5C99A",background:"#F8EFD8",color:"var(--accent-hover)",cursor:"pointer",fontWeight:600}
          }, "Mark all To Buy"),
          h("button", {
            onClick:function(){ctx.setKittingResult(null);},
            style:{fontSize:'var(--text-xs)',padding:"4px 10px",borderRadius:'var(--radius-sm)',border:"0.5px solid var(--border)",background:"var(--surface)",cursor:"pointer",marginLeft:"auto"}
          }, "Dismiss")
        )
      ),
      h("div", {style:{display:"flex",gap:6,marginTop:10}},
        h("button", {
          onClick:function(){
            var txt=ctx.toBuyList.map(function(d){return "DMC "+d.id+" "+d.name+" \xD7 "+d.skeins;}).join("\n");
            app.copyText(txt, "shopping");
          },
          style:{padding:"8px 18px",fontSize:'var(--text-md)',borderRadius:'var(--radius-md)',border:"none",background:"var(--accent)",color:"var(--surface)",cursor:"pointer",fontWeight:600}
        }, "Copy To-Buy List"),
        h("button", {
          onClick:function(){
            var txt=ctx.skeinData.map(function(d){return "DMC "+d.id+" "+d.name+" \xD7 "+d.skeins;}).join("\n");
            app.copyText(txt, "full");
          },
          style:{padding:"8px 18px",fontSize:'var(--text-md)',borderRadius:'var(--radius-md)',border:"0.5px solid var(--border)",background:"var(--surface)",cursor:"pointer",fontWeight:500}
        }, "Copy Full List")
      ),
      app.copied && h("div", {style:{marginTop:6,fontSize:'var(--text-sm)',color:"var(--success)",fontWeight:600}}, "Copied!")
    );
  }

  // ── Project info (name, designer, description) ─────────────────────────────
  var projectInfoSection = h(Section, {title:"Project info", defaultOpen:true},
    h("div", {style:{display:"flex",flexDirection:"column",gap:'var(--s-2)',padding:"4px 0 2px"}},
      h("label", {style:{display:"flex",flexDirection:"column",gap:3,fontSize:'var(--text-xs)',color:"var(--text-secondary)"}},
        "Pattern name",
        h("input", {
          type:"text", value: app.projectName || "", maxLength:60,
          placeholder: ctx.sW + "\xD7" + ctx.sH + " pattern",
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

  // ── Pattern info discoverability callout ────────────────────────────────
  // The Pattern Summary section that used to sit at the top of this tab was
  // duplicating the dimensions / fabric / colours / skeins values that now
  // live behind the `Pattern info` chip in the action bar. We point the
  // user at the chip rather than reprinting the same numbers here.
  var infoChipCallout = h("div", {
      style: {
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px",
        background: "var(--surface-secondary)",
        border: "1px dashed var(--border)",
        borderRadius: "var(--radius-md)",
        fontSize: "var(--text-sm)",
        color: "var(--text-secondary)"
      }
    },
    window.Icons && window.Icons.info ? h("span", {style:{flexShrink:0,color:"var(--accent)"}}, window.Icons.info()) : null,
    h("span", null,
      "Pattern stats live in the ",
      h("strong", {style:{color:"var(--text-primary)"}}, "Pattern info"),
      " chip up top \u2014 size, fabric, colours, skeins, difficulty. This tab is for planning your stitching session."
    )
  );

  return h("div", {style:{display:"flex",flexDirection:"column",gap:'var(--s-3)'}},
    projectInfoSection,
    infoChipCallout,
    renderTimeEstimate(),
    renderFinishedSize(),
    renderCostEstimate(),
    renderThreadOrganiser(),
    typeof window.SubstituteFromStashModal !== "undefined"
      ? h(window.SubstituteFromStashModal, null)
      : null,
    convertOpen && typeof window.ConvertPaletteModal !== "undefined"
      ? h(window.ConvertPaletteModal, {
          onClose: function() { setConvertOpen(false); },
          onApply: function(remap) {
            var np = ctx.pat.slice();
            var changes = [];
            for (var i = 0; i < np.length; i++) {
              var cell = np[i];
              if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;
              if (cell.type === "blend" && cell.threads) {
                var needsChange = false;
                var newThreads = cell.threads.map(function(t) {
                  if (remap[t.id]) { needsChange = true; return {id:remap[t.id].compositeKey,type:"solid",name:remap[t.id].name,rgb:remap[t.id].rgb,brand:remap[t.id].brand}; }
                  return t;
                });
                if (needsChange) {
                  changes.push({idx:i, old:Object.assign({},cell)});
                  var newBlendId = newThreads.map(function(t){return t.id;}).sort().join("+");
                  np[i] = Object.assign({},cell,{id:newBlendId,threads:newThreads,rgb:[
                    Math.round((newThreads[0].rgb[0]+newThreads[1].rgb[0])/2),
                    Math.round((newThreads[0].rgb[1]+newThreads[1].rgb[1])/2),
                    Math.round((newThreads[0].rgb[2]+newThreads[1].rgb[2])/2)]});
                }
                continue;
              }
              if (remap[cell.id]) {
                changes.push({idx:i, old:Object.assign({},cell)});
                np[i] = {id:remap[cell.id].compositeKey, type:"solid", name:remap[cell.id].name, rgb:remap[cell.id].rgb, brand:remap[cell.id].brand};
              }
            }
            if (changes.length === 0) {
              app.addToast("No cells were changed.", {type:"info", duration:2000});
              setConvertOpen(false);
              return;
            }
            cv.setEditHistory(function(prev) {
              var entry = {type:"paletteConversion", changes:changes};
              var n = prev.concat([entry]);
              if (n.length > (cv.EDIT_HISTORY_MAX || 100)) n = n.slice(n.length - (cv.EDIT_HISTORY_MAX || 100));
              return n;
            });
            cv.setRedoHistory([]);
            ctx.setPat(np);
            var result = ctx.buildPaletteWithScratch(np);
            ctx.setPal(result.pal);
            ctx.setCmap(result.cmap);
            setConvertOpen(false);
            app.addToast(changes.length + " stitches converted. Ctrl+Z to undo.", {type:"success", duration:4000});
          }
        })
      : null
  );
};
