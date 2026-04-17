/* creator/ProjectTab.js — Project statistics, time estimate, finished size, cost, thread organiser.
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: Section, SliderRow (components.js), window.confettiTier (helpers.js),
               fmtTimeL, skeinEst (helpers.js), FABRIC_COUNTS (constants.js),
               StashBridge (stash-bridge.js, optional), CreatorContext (context.js) */

window.CreatorProjectTab = function CreatorProjectTab() {
  var ctx = window.usePatternData();
  var app = window.useApp();
  var h = React.createElement;

  if (!(ctx.pat && ctx.pal)) return null;
  if (app.tab !== "project") return null;

  var confettiTier = window.confettiTier;

  // ── Pattern Summary ─────────────────────────────────────────────────────────
  function renderPatternSummary() {
    var rows = [
      ["Pattern size", ctx.sW + " \xD7 " + ctx.sH + " stitches"],
      ["Total cells", (ctx.sW * ctx.sH).toLocaleString()],
      ["Stitchable", ctx.totalStitchable.toLocaleString()],
      ["Skipped", (ctx.sW * ctx.sH - ctx.totalStitchable).toLocaleString()],
      ["Colours", ctx.pal.length + " (" + ctx.blendCount + " blend" + (ctx.blendCount !== 1 ? "s" : "") + ")"],
      ["Skeins needed", ctx.totalSkeins + " (at " + ctx.fabricCt + "ct)"]
    ];

    var difficultyBadge = ctx.difficulty && h("div", {
      style:{marginTop:12,padding:"8px 12px",background:"#f8f9fa",borderRadius:8,border:"0.5px solid #e2e8f0",display:"flex",alignItems:"center",gap:10}
    },
      h("div", {style:{fontSize:11,color:"var(--text-tertiary)",textTransform:"uppercase",fontWeight:600}}, "Difficulty"),
      h("div", {style:{display:"flex",gap:2}},
        [1,2,3,4].map(function(s) {
          return h("span", {key:s, style:{fontSize:16,color:s<=ctx.difficulty.stars?ctx.difficulty.color:"#e2e8f0"}}, "\u2605");
        })
      ),
      h("span", {style:{fontSize:13,fontWeight:700,color:ctx.difficulty.color}}, ctx.difficulty.label),
      h("span", {style:{fontSize:11,color:"var(--text-tertiary)",marginLeft:"auto"}},
        ctx.pal.length + " colours \xB7 " + (ctx.blendCount > 0 ? ctx.blendCount + " blends \xB7 " : "") + ctx.totalStitchable.toLocaleString() + " stitches"
      )
    );

    var confettiBadge = app.confettiData && (function() {
      var cd = app.confettiData.clean;
      var t = confettiTier(cd.pct);
      var barW = Math.max(3, Math.min(100, Math.round(100 - cd.pct * 5)));
      return h("div", {style:{marginTop:8,padding:"8px 12px",background:"#f8f9fa",borderRadius:8,border:"0.5px solid #e2e8f0"}},
        h("div", {style:{display:"flex",alignItems:"center",gap:8,marginBottom:6}},
          h("div", {style:{fontSize:11,color:"var(--text-tertiary)",textTransform:"uppercase",fontWeight:600}}, "Stitchability"),
          h("span", {style:{fontSize:11,fontWeight:700,color:t.color,padding:"1px 7px",borderRadius:10,background:t.color+"18",marginLeft:"auto"}}, t.label)
        ),
        h("div", {style:{display:"flex",alignItems:"center",gap:8}},
          h("div", {style:{flex:1,height:6,background:"#e2e8f0",borderRadius:3,overflow:"hidden"}},
            h("div", {style:{height:"100%",width:barW+"%",background:t.color,borderRadius:3,transition:"width 0.4s"}})
          ),
          h("span", {style:{fontSize:12,fontWeight:600,color:t.color,flexShrink:0}},
            cd.singles.toLocaleString() + " isolated (" + cd.pct.toFixed(1) + "%)"
          )
        ),
        app.confettiData.raw.singles !== cd.singles && h("div", {style:{fontSize:10,color:"var(--text-tertiary)",marginTop:4}},
          app.confettiData.raw.singles.toLocaleString() + " before orphan removal"
        )
      );
    })();

    var progressBadge = ctx.done && ctx.doneCount > 0 && h("div", {
      style:{marginTop:8,padding:"8px 12px",background:"#f0fdf4",borderRadius:8,border:"1px solid #bbf7d0"}
    },
      h("div", {style:{fontSize:12,fontWeight:600,color:"#16a34a"}},
        "Progress: " + ctx.progressPct + "% \u2014 " + ctx.doneCount.toLocaleString() + " of " + ctx.totalStitchable.toLocaleString() + " stitches"
      )
    );

    return h(Section, {title:"Pattern Summary"},
      h("div", {
        style:{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 20px"}
      },
        rows.map(function(r, i) {
          return h("div", {key:i},
            h("div", {style:{fontSize:11,color:"var(--text-tertiary)",textTransform:"uppercase",fontWeight:600,marginBottom:2}}, r[0]),
            h("div", {style:{fontSize:14,fontWeight:600,color:"#1e293b"}}, r[1])
          );
        })
      ),
      difficultyBadge,
      confettiBadge,
      progressBadge
    );
  }

  // ── Time Estimate ───────────────────────────────────────────────────────────
  function renderTimeEstimate() {
    return h(Section, {title:"Time Estimate"},
      h("div", {style:{marginTop:8}},
        h(SliderRow, {
          label:"Stitching speed", value:ctx.stitchSpeed, min:10, max:120, step:5,
          onChange:ctx.setStitchSpeed, format:function(v){return v+" stitches/hr";}
        }),
        h("div", {style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 20px",marginTop:10}},
          h("div", null,
            h("div", {style:{fontSize:11,color:"var(--text-tertiary)",textTransform:"uppercase",fontWeight:600,marginBottom:2}}, "Total estimate"),
            h("div", {style:{fontSize:16,fontWeight:700,color:"#1e293b"}},
              fmtTimeL(Math.round(ctx.totalStitchable / ctx.stitchSpeed * 3600))
            )
          ),
          h("div", null,
            h("div", {style:{fontSize:11,color:"var(--text-tertiary)",textTransform:"uppercase",fontWeight:600,marginBottom:2}}, "Remaining"),
            h("div", {style:{fontSize:16,fontWeight:700,color:ctx.doneCount>=ctx.totalStitchable?"#16a34a":"#0d9488"}},
              ctx.doneCount >= ctx.totalStitchable ? "Done!" : fmtTimeL(Math.round((ctx.totalStitchable - ctx.doneCount) / ctx.stitchSpeed * 3600))
            )
          )
        ),
        ctx.totalTime > 0 && ctx.doneCount > 0 && h("div", {
          style:{marginTop:8,padding:"8px 12px",background:"#f8f9fa",borderRadius:8,border:"0.5px solid #e2e8f0",fontSize:12,color:"#475569"}
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
      h("div", {style:{marginTop:8,overflow:"auto"}},
        h("table", {style:{width:"100%",borderCollapse:"collapse",fontSize:12}},
          h("thead", null,
            h("tr", {style:{background:"#f8f9fa"}},
              ["Fabric","Width","Height","With margin"].map(function(hd, i) {
                return h("th", {key:i, style:{padding:"7px 10px",textAlign:"left",borderBottom:"2px solid #e2e8f0",color:"#475569",fontWeight:600,fontSize:11,textTransform:"uppercase"}}, hd);
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
                style:{borderBottom:"0.5px solid #f1f5f9",background:isCurrent?"#f0fdfa":"transparent"}
              },
                h("td", {style:{padding:"6px 10px",fontWeight:isCurrent?700:400}}, f.label+(isCurrent?" \u2713":"")),
                h("td", {style:{padding:"6px 10px"}}, wIn.toFixed(1)+"\u2033 / "+wCm.toFixed(1)+" cm"),
                h("td", {style:{padding:"6px 10px"}}, hIn.toFixed(1)+"\u2033 / "+hCm.toFixed(1)+" cm"),
                h("td", {style:{padding:"6px 10px",fontSize:11,color:"var(--text-tertiary)"}}, (wIn+2).toFixed(0)+"\u2033 \xD7 "+(hIn+2).toFixed(0)+"\u2033")
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
      h("div", {style:{marginTop:8}},
        h("div", {style:{display:"flex",alignItems:"center",gap:8,marginBottom:10}},
          h("span", {style:{fontSize:12,color:"#475569"}}, "Price per skein (\xA3)"),
          h("input", {
            type:"number", value:ctx.skeinPrice, min:0, step:0.05,
            onChange:function(e){ctx.setSkeinPrice(Math.max(0,parseFloat(e.target.value)||0));},
            style:{width:70,padding:"5px 8px",border:"0.5px solid #e2e8f0",borderRadius:6,fontSize:13,textAlign:"right"}
          })
        ),
        h("div", {style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 20px"}},
          h("div", null,
            h("div", {style:{fontSize:11,color:"var(--text-tertiary)",textTransform:"uppercase",fontWeight:600,marginBottom:2}}, "Thread cost"),
            h("div", {style:{fontSize:16,fontWeight:700,color:"#1e293b"}}, "\xA3"+(ctx.totalSkeins*ctx.skeinPrice).toFixed(2)),
            h("div", {style:{fontSize:11,color:"var(--text-tertiary)"}}, ctx.totalSkeins+" skeins \xD7 \xA3"+ctx.skeinPrice.toFixed(2))
          ),
          ctx.toBuyCount < ctx.skeinData.length && h("div", null,
            h("div", {style:{fontSize:11,color:"var(--text-tertiary)",textTransform:"uppercase",fontWeight:600,marginBottom:2}}, "Still to buy"),
            h("div", {style:{fontSize:16,fontWeight:700,color:"#ea580c"}},
              "\xA3"+(ctx.toBuyList.reduce(function(s,d){return s+d.skeins;},0)*ctx.skeinPrice).toFixed(2)
            ),
            h("div", {style:{fontSize:11,color:"var(--text-tertiary)"}},
              ctx.toBuyList.reduce(function(s,d){return s+d.skeins;},0)+" skeins"
            )
          )
        ),
        h("div", {style:{fontSize:11,color:"var(--text-tertiary)",marginTop:8}},
          "Doesn\u2019t include fabric, needles, hoop, or frame. DMC skeins typically \xA30.85\u2013\xA31.10 in UK shops."
        )
      )
    );
  }

  // ── Thread Organiser ────────────────────────────────────────────────────────
  function renderThreadOrganiser() {
    return h(Section, {title:"Thread Organiser"},
      h("div", {style:{marginTop:8,display:"flex",gap:12,marginBottom:10}},
        h("div", {style:{padding:"6px 14px",background:"#f0fdf4",borderRadius:8,border:"1px solid #bbf7d0",fontSize:12}},
          h("span", {style:{fontWeight:700,color:"#16a34a"}}, ctx.ownedCount), " ",
          h("span", {style:{color:"#475569"}}, "owned")
        ),
        h("div", {style:{padding:"6px 14px",background:"#fff7ed",borderRadius:8,border:"1px solid #fed7aa",fontSize:12}},
          h("span", {style:{fontWeight:700,color:"#ea580c"}}, ctx.toBuyList.length), " ",
          h("span", {style:{color:"#475569"}}, "to buy")
        ),
        h("div", {style:{marginLeft:"auto",display:"flex",gap:4}},
          h("button", {
            onClick:function(){
              var n = {};
              ctx.skeinData.forEach(function(d){n[d.id]="owned";});
              ctx.setThreadOwned(n);
            },
            style:{fontSize:11,padding:"4px 10px",border:"1px solid #bbf7d0",borderRadius:6,background:"#f0fdf4",color:"#16a34a",cursor:"pointer"}
          }, "Own all"),
          h("button", {
            onClick:function(){ctx.setThreadOwned({});},
            style:{fontSize:11,padding:"4px 10px",border:"0.5px solid #e2e8f0",borderRadius:6,background:"#fff",color:"#475569",cursor:"pointer"}
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
              style:{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",borderRadius:6,
                background:isOwned?"#f0fdf4":"#fff",
                border:"1px solid "+(isOwned?"#bbf7d0":"#f1f5f9")}
            },
              h("span", {style:{width:16,height:16,borderRadius:3,background:"rgb("+d.rgb[0]+","+d.rgb[1]+","+d.rgb[2]+")",border:"1px solid #cbd5e1",flexShrink:0}}),
              h("span", {style:{fontWeight:700,fontSize:13,minWidth:44}}, "DMC "+d.id),
              h("span", {style:{fontSize:11,color:"#475569",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}, d.name),
              h("span", {style:{fontSize:11,color:"var(--text-tertiary)",flexShrink:0}}, d.skeins+"sk"),
              h("button", {
                onClick:function(){ctx.toggleOwned(d.id);},
                style:{fontSize:11,padding:"3px 10px",borderRadius:5,cursor:"pointer",fontWeight:600,minWidth:55,textAlign:"center",
                  border:"1px solid "+(isOwned?"#bbf7d0":"#fed7aa"),
                  background:isOwned?"#f0fdf4":"#fff7ed",
                  color:isOwned?"#16a34a":"#ea580c"
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
                  background:ctx.altOpen===d.id?"#e0e7ff":"#fff",
                  color:"#4338ca"
                },
                title:"Show similar threads from stash"
              }, "\u2248")
            ),
            ctx.altOpen === d.id && (function() {
              var alts = StashBridge.suggestAlternatives(d.id, 5, ctx.globalStash);
              return alts.length > 0
                ? h("div", {style:{padding:"6px 12px 8px 36px",display:"flex",gap:6,flexWrap:"wrap",fontSize:11,alignItems:"center"}},
                    h("span", {style:{color:"#475569",fontWeight:600}}, "Similar in stash:"),
                    alts.map(function(a) {
                      return h("span", {key:a.id, style:{display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:10,background:"#f0f0ff",border:"1px solid #e0e7ff"}},
                        h("span", {style:{width:10,height:10,borderRadius:2,background:"rgb("+a.rgb[0]+","+a.rgb[1]+","+a.rgb[2]+")",border:"1px solid #cbd5e1"}}),
                        h("span", {style:{fontWeight:600}}, "DMC "+a.id),
                        h("span", {style:{color:"#475569"}}, a.name),
                        h("span", {style:{color:"var(--text-tertiary)"}}, "\u0394E "+a.deltaE),
                        h("span", {style:{color:"#4338ca"}}, a.owned+"sk")
                      );
                    })
                  )
                : h("div", {style:{padding:"6px 12px 8px 36px",fontSize:11,color:"var(--text-tertiary)"}},
                    "No similar threads found in your stash."
                  );
            })()
          );
        })
      ),
      h("div", {style:{display:"flex",gap:8,marginTop:10,flexWrap:"wrap",alignItems:"center"}},
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
            return !Object.keys(ctx.globalStash).some(function(id) { return ctx.globalStash[id] && ctx.globalStash[id].owned > 0; });
          })(),
          title: (function() {
            if (typeof StashBridge === "undefined") return "Stash bridge not available";
            if (!ctx.pat) return "No pattern loaded";
            if (ctx.toBuyList.length === 0) return "All threads are already marked as owned";
            if (!Object.keys(ctx.globalStash).some(function(id) { return ctx.globalStash[id] && ctx.globalStash[id].owned > 0; })) return "Add threads to your stash first";
            return "Find stash alternatives for unowned threads";
          })(),
          style:{padding:"8px 18px",fontSize:13,borderRadius:8,border:"1px solid #a78bfa",background:"#f5f3ff",color:"#7c3aed",cursor:"pointer",fontWeight:600,
            opacity:(function() {
              if (typeof StashBridge === "undefined" || !ctx.pat || ctx.toBuyList.length === 0) return 0.5;
              if (!Object.keys(ctx.globalStash).some(function(id) { return ctx.globalStash[id] && ctx.globalStash[id].owned > 0; })) return 0.5;
              return 1;
            })()
          }
        }, "Substitute from Stash"),
        h("button", {
          onClick: function() {
            if (typeof StashBridge === "undefined") { alert("Stash bridge not loaded."); return; }
            StashBridge.getGlobalStash().then(function(stash) {
              var missing = [], short = [];
              ctx.skeinData.forEach(function(d) {
                var owned2 = (stash[d.id] || {}).owned || 0;
                if (owned2 === 0) missing.push("DMC "+d.id+" (need "+d.skeins+"sk)");
                else if (owned2 < d.skeins) short.push("DMC "+d.id+" (have "+owned2+", need "+d.skeins+"sk)");
              });
              ctx.setKittingResult({missing:missing, short:short, total:ctx.skeinData.length});
            });
          },
          style:{padding:"8px 18px",fontSize:13,borderRadius:8,border:"1px solid #a78bfa",background:"#f5f3ff",color:"#7c3aed",cursor:"pointer",fontWeight:600}
        }, "Kit This Project")
      ),
      ctx.kittingResult && h("div", {style:{marginTop:8,padding:"10px 14px",borderRadius:8,border:"1px solid #e2e8f0",background:"#f8f9fa",fontSize:12}},
        h("div", {style:{fontWeight:700,marginBottom:4}}, "Kitting check ("+ctx.kittingResult.total+" colours)"),
        ctx.kittingResult.missing.length===0 && ctx.kittingResult.short.length===0 && h("div", {style:{color:"#16a34a",fontWeight:600}}, "\u2713 You have everything!"),
        ctx.kittingResult.missing.length > 0 && h("div", null,
          h("div", {style:{color:"#dc2626",fontWeight:600,marginBottom:2}}, "Missing ("+ctx.kittingResult.missing.length+"):"),
          ctx.kittingResult.missing.map(function(m, i) { return h("div", {key:i, style:{color:"#dc2626",marginLeft:8}}, m); })
        ),
        ctx.kittingResult.short.length > 0 && h("div", {style:{marginTop:4}},
          h("div", {style:{color:"#d97706",fontWeight:600,marginBottom:2}}, "Low stock ("+ctx.kittingResult.short.length+"):"),
          ctx.kittingResult.short.map(function(m, i) { return h("div", {key:i, style:{color:"#d97706",marginLeft:8}}, m); })
        ),
        h("div", {style:{display:"flex",gap:6,marginTop:8}},
          h("button", {
            onClick:function(){
              var lines = ctx.kittingResult.missing.concat(ctx.kittingResult.short);
              app.copyText(lines.join("\n"), "kit");
            },
            style:{fontSize:11,padding:"4px 10px",borderRadius:6,border:"0.5px solid #e2e8f0",background:"#fff",cursor:"pointer"}
          }, "Copy gaps"),
          typeof StashBridge !== "undefined" && h("button", {
            onClick:function(){
              var toBuy2 = ctx.kittingResult.missing.concat(ctx.kittingResult.short).map(function(l){
                var m = l.match(/DMC (\S+)/); return m ? m[1] : null;
              }).filter(Boolean);
              Promise.all(toBuy2.map(function(id){return StashBridge.updateThreadToBuy(id, true);}))
                .then(function(){alert("Marked "+toBuy2.length+" thread(s) as To Buy in Stash Manager.");});
            },
            style:{fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid #fed7aa",background:"#fff7ed",color:"#ea580c",cursor:"pointer",fontWeight:600}
          }, "Mark all To Buy"),
          h("button", {
            onClick:function(){ctx.setKittingResult(null);},
            style:{fontSize:11,padding:"4px 10px",borderRadius:6,border:"0.5px solid #e2e8f0",background:"#fff",cursor:"pointer",marginLeft:"auto"}
          }, "Dismiss")
        )
      ),
      h("div", {style:{display:"flex",gap:6,marginTop:10}},
        h("button", {
          onClick:function(){
            var txt=ctx.toBuyList.map(function(d){return "DMC "+d.id+" "+d.name+" \xD7 "+d.skeins;}).join("\n");
            app.copyText(txt, "shopping");
          },
          style:{padding:"8px 18px",fontSize:13,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:600}
        }, "Copy To-Buy List"),
        h("button", {
          onClick:function(){
            var txt=ctx.skeinData.map(function(d){return "DMC "+d.id+" "+d.name+" \xD7 "+d.skeins;}).join("\n");
            app.copyText(txt, "full");
          },
          style:{padding:"8px 18px",fontSize:13,borderRadius:8,border:"0.5px solid #e2e8f0",background:"#fff",cursor:"pointer",fontWeight:500}
        }, "Copy Full List")
      ),
      app.copied && h("div", {style:{marginTop:6,fontSize:12,color:"#16a34a",fontWeight:600}}, "Copied!")
    );
  }

  return h("div", {style:{display:"flex",flexDirection:"column",gap:12}},
    renderPatternSummary(),
    renderTimeEstimate(),
    renderFinishedSize(),
    renderCostEstimate(),
    renderThreadOrganiser(),
    typeof window.SubstituteFromStashModal !== "undefined"
      ? h(window.SubstituteFromStashModal, null)
      : null
  );
};
