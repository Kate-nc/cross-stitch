/* creator/LegendTab.js — Threads tab: legend, stash status & fabric calculator.
   Combined from former LegendTab + PrepareTab.
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: skeinEst (helpers.js), stitchesToSkeins (threadCalc.js),
               FABRIC_COUNTS (constants.js), StashBridge (stash-bridge.js),
               CreatorContext (context.js) */

window.CreatorLegendTab = function CreatorLegendTab() {
  var ctx = window.usePatternData();
  var cv  = window.useCanvas();
  var app = window.useApp();
  var h   = React.createElement;

  var useState = React.useState;
  var useMemo  = React.useMemo;

  // ── All hooks BEFORE any conditional returns ───────────────────────────────
  var _units    = useState("in");    var units    = _units[0];    var setUnits    = _units[1];
  var _margin   = useState(3);       var margin   = _margin[0];   var setMargin   = _margin[1];
  var _overTwo  = useState(false);   var overTwo  = _overTwo[0];  var setOverTwo  = _overTwo[1];
  var _fabOpen  = useState(false);   var fabOpen  = _fabOpen[0];  var setFabOpen  = _fabOpen[1];
  var _sort     = useState("number"); var sort    = _sort[0];     var setSort     = _sort[1];
  var _copied   = useState(false);   var copied   = _copied[0];   var setCopied   = _copied[1];
  var _addedAll = useState(false);   var addedAll = _addedAll[0]; var setAddedAll = _addedAll[1];

  var stash      = ctx.globalStash || {};
  var fabricCt   = ctx.fabricCt || 14;
  var effectiveFabric = overTwo ? fabricCt / 2 : fabricCt;

  // Build enriched rows — guards handled inside
  var rows = useMemo(function() {
    if (!(ctx.pat && ctx.pal)) return [];
    return ctx.pal.map(function(p) {
      // Skein calculation: use stitchesToSkeins for accuracy, fall back to skeinEst
      var skResult = (typeof stitchesToSkeins === "function")
        ? stitchesToSkeins({ stitchCount: p.count, fabricCount: effectiveFabric, strandsUsed: 2 })
        : null;
      var needed;
      if (skResult) {
        needed = skResult.colorA
          ? Math.max(skResult.colorA.skeinsToBuy || 0, skResult.colorB.skeinsToBuy || 0)
          : (skResult.skeinsToBuy || 0);
      } else {
        needed = (typeof skeinEst === "function") ? skeinEst(p.count, effectiveFabric) : Math.ceil(p.count / 800);
      }
      if (needed < 1) needed = 1;

      // Stash ownership
      var stashEntry = stash["dmc:" + p.id] || {};
      var owned  = stashEntry.owned || 0;
      var status = owned >= needed ? "owned" : owned > 0 ? "partial" : "needed";

      // Name string
      var name = (p.type === "blend" && p.threads)
        ? p.threads[0].name + " + " + p.threads[1].name
        : (p.name || p.id);

      // Confetti (isolated stitches) count
      var confettiCount = (app.confettiData && app.confettiData.clean && app.confettiData.clean.colorConfetti)
        ? app.confettiData.clean.colorConfetti[p.id]
        : null;

      // Done counts (stitch tracker)
      var dc = (ctx.colourDoneCounts && ctx.colourDoneCounts[p.id]) || {total: 0, done: 0};

      return {p: p, owned: owned, needed: needed, status: status, name: name, confettiCount: confettiCount, dc: dc};
    });
  }, [ctx.pat, ctx.pal, stash, effectiveFabric, app.confettiData, ctx.colourDoneCounts]);

  var sortedRows = useMemo(function() {
    var copy = rows.slice();
    if (sort === "number") {
      copy.sort(function(a, b) { return a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0; });
    } else if (sort === "stitches") {
      copy.sort(function(a, b) { return b.p.count - a.p.count; });
    } else if (sort === "skeins") {
      copy.sort(function(a, b) { return b.needed - a.needed; });
    } else if (sort === "status") {
      var ord = {needed: 0, partial: 1, owned: 2};
      copy.sort(function(a, b) { return ord[a.status] - ord[b.status]; });
    }
    return copy;
  }, [rows, sort]);

  // Summary stats
  var totalColours  = rows.length;
  var totalSkeins   = rows.reduce(function(s, r) { return s + r.needed; }, 0);
  var ownedColours  = rows.filter(function(r) { return r.status === "owned"; }).length;
  var partialColours = rows.filter(function(r) { return r.status === "partial"; }).length;
  var needSkeins    = rows.reduce(function(s, r) { return s + Math.max(0, r.needed - r.owned); }, 0);
  var hasStash      = Object.keys(stash).length > 0;

  // ── Early returns after all hooks ─────────────────────────────────────────
  if (!(ctx.pat && ctx.pal)) return null;
  if (app.tab !== "legend") return null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  var fabCounts = (typeof FABRIC_COUNTS !== "undefined") ? FABRIC_COUNTS : [
    {ct:11,label:"11 count"},{ct:14,label:"14 count"},{ct:16,label:"16 count"},{ct:18,label:"18 count"}
  ];
  var sW = ctx.sW || 0;
  var sH = ctx.sH || 0;
  var canShare = typeof navigator !== "undefined" && !!navigator.share;

  function thSt(align) {
    return {padding:"7px 10px", textAlign:align, borderBottom:"2px solid #e2e8f0",
            color:"#475569", fontWeight:600, fontSize:11, textTransform:"uppercase", background:"#f8f9fa"};
  }

  function calcFab(ct, div) {
    var ef  = div ? ct / div : ct;
    var wIn = sW / ef + margin * 2;
    var hIn = sH / ef + margin * 2;
    return units === "cm"
      ? {w: (wIn * 2.54).toFixed(1) + " cm", h: (hIn * 2.54).toFixed(1) + " cm"}
      : {w: wIn.toFixed(1) + '"',             h: hIn.toFixed(1) + '"'};
  }

  function statusBadge(status) {
    var cfg = {
      owned:   {label:"In stash \u2713", bg:"#f0fdf4", color:"#16a34a"},
      partial: {label:"Partial",         bg:"#fff7ed", color:"#ea580c"},
      needed:  {label:"Need to buy",     bg:"#fef2f2", color:"#dc2626"}
    };
    var s = cfg[status] || cfg.needed;
    return h("span", {style:{padding:"2px 7px", borderRadius:10, fontSize:10, fontWeight:600,
                              background:s.bg, color:s.color}}, s.label);
  }

  function handleCopy() {
    var lines = ["Shopping List",
      sW + "\u00d7" + sH + " stitches @ " + fabricCt + " count" + (overTwo ? " over two" : ""), ""];
    sortedRows.forEach(function(r) {
      var mark = r.status === "owned" ? "\u2713" : r.status === "partial" ? "~" : "\u25cb";
      var own  = r.owned > 0 ? " (own " + r.owned + ")" : "";
      lines.push(mark + " DMC " + r.p.id + " \u2014 " + r.name + " \u2014 " + r.needed + " skein" + (r.needed !== 1 ? "s" : "") + own);
    });
    lines.push("", "Total: " + ownedColours + "/" + totalColours + " colours owned");
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(lines.join("\n")).then(function() {
        setCopied(true); setTimeout(function() { setCopied(false); }, 2000);
      }).catch(function() {});
    }
  }

  function handleShare() {
    if (!canShare) return;
    var lines = ["Shopping List \u2014 " + sW + "\u00d7" + sH + " @ " + fabricCt + " count", ""];
    sortedRows.forEach(function(r) {
      if (r.status !== "owned") {
        var diff = Math.max(0, r.needed - r.owned);
        var own  = r.owned > 0 ? " (own " + r.owned + ")" : "";
        lines.push("DMC " + r.p.id + " " + r.name + " \u2014 need " + diff + " skein" + (diff !== 1 ? "s" : "") + own);
      }
    });
    navigator.share({title:"Cross Stitch Shopping List", text:lines.join("\n")}).catch(function() {});
  }

  function handleAddAll() {
    if (typeof StashBridge === "undefined") return;
    var promises = rows.filter(function(r) { return r.status !== "owned"; }).map(function(r) {
      return StashBridge.updateThreadOwned(r.p.id, r.needed);
    });
    Promise.all(promises).then(function() {
      setAddedAll(true);
      setTimeout(function() { setAddedAll(false); }, 2500);
      StashBridge.getGlobalStash().then(function(s) { ctx.setGlobalStash(s); }).catch(function() {});
    }).catch(function() {});
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  var allOwned = hasStash && ownedColours === totalColours;

  return h("div", {style:{maxWidth:960}},

    // ── Top bar ──────────────────────────────────────────────────────────────
    h("div", {style:{
      display:"flex", alignItems:"center", gap:10, flexWrap:"wrap",
      padding:"10px 14px", borderRadius:8, marginBottom:12, fontSize:12,
      background: allOwned ? "#f0fdf4" : "#f8f9fa",
      border: "0.5px solid " + (allOwned ? "#bbf7d0" : "#e2e8f0")
    }},
      // Fabric selector
      h("label", {style:{display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#475569"}},
        "Fabric:",
        h("select", {
          value: ctx.fabricCt,
          onChange: function(e) { ctx.setFabricCt(Number(e.target.value)); },
          style:{padding:"3px 8px", borderRadius:6, border:"0.5px solid #e2e8f0", fontSize:12, background:"#fff"}
        }, fabCounts.map(function(f) { return h("option", {key:f.ct, value:f.ct}, f.label); }))
      ),
      h("span", {style:{fontSize:11, color:"#94a3b8"}}, totalSkeins + " skeins total"),
      // Stash summary (only when stash is configured)
      hasStash && h("span", {style:{fontWeight:600, color: allOwned ? "#15803d" : "#475569"}},
        allOwned
          ? "\u2713 All " + totalColours + " colours in stash!"
          : "Stash: " + ownedColours + "/" + totalColours + " owned"
            + (partialColours > 0 ? ", " + partialColours + " partial" : "")
      ),
      hasStash && !allOwned && h("span", {style:{color:"#dc2626", fontSize:11}},
        "\u2014 ~" + needSkeins + " more skein" + (needSkeins !== 1 ? "s" : "") + " needed"
      ),
      // Buttons
      h("div", {style:{marginLeft:"auto", display:"flex", gap:6, flexWrap:"wrap"}},
        h("button", {
          onClick: handleCopy,
          style:{fontSize:11, padding:"4px 10px", borderRadius:6, cursor:"pointer",
                 border:"0.5px solid #e2e8f0", background:copied?"#0d9488":"#fff",
                 color:copied?"#fff":"#475569", fontWeight:500}
        }, copied ? "\u2713 Copied" : "Copy list"),
        canShare && !allOwned && h("button", {
          onClick: handleShare,
          style:{fontSize:11, padding:"4px 10px", borderRadius:6, cursor:"pointer",
                 border:"0.5px solid #e2e8f0", background:"#fff", color:"#475569", fontWeight:500}
        }, "Share"),
        h("a", {
          href:"manager.html", target:"_blank",
          style:{fontSize:11, padding:"4px 10px", borderRadius:6, cursor:"pointer",
                 border:"0.5px solid #e2e8f0", background:"#fff", color:"#475569",
                 fontWeight:500, textDecoration:"none", display:"inline-block"}
        }, "Thread stash \u2192")
      )
    ),

    // ── Controls row ─────────────────────────────────────────────────────────
    h("div", {style:{display:"flex", alignItems:"center", gap:10, marginBottom:10, flexWrap:"wrap"}},
      h("label", {style:{fontSize:12, color:"#475569", display:"flex", alignItems:"center", gap:4}},
        h("input", {type:"checkbox", checked:overTwo, onChange:function(e){setOverTwo(e.target.checked);}}),
        "Over two"
      ),
      h("span", {style:{fontSize:12, color:"#cbd5e1"}}, "|"),
      h("span", {style:{fontSize:12, color:"#475569"}}, "Sort:"),
      h("select", {
        value:sort, onChange:function(e){setSort(e.target.value);},
        style:{fontSize:11, padding:"3px 8px", borderRadius:6, border:"0.5px solid #e2e8f0", background:"#fff"}
      },
        h("option", {value:"number"}, "Thread number"),
        h("option", {value:"stitches"}, "Stitch count"),
        h("option", {value:"skeins"}, "Skeins needed"),
        hasStash && h("option", {value:"status"}, "Stash status")
      ),
      hasStash && !allOwned && h("button", {
        onClick: handleAddAll,
        style:{fontSize:11, padding:"4px 10px", borderRadius:6, cursor:"pointer",
               border:"0.5px solid #e2e8f0", background:addedAll?"#0d9488":"#fff",
               color:addedAll?"#fff":"#475569", fontWeight:500, marginLeft:"auto"}
      }, addedAll ? "\u2713 Added to stash" : "Mark all as owned")
    ),

    // ── Thread table ─────────────────────────────────────────────────────────
    h("div", {style:{overflow:"auto", maxHeight:450, marginBottom:16}},
      h("table", {style:{width:"100%", borderCollapse:"collapse", fontSize:12}},
        h("thead", null,
          h("tr", null,
            h("th", {style:thSt("left")}, "Sym"),
            h("th", {style:thSt("left")}, ""),
            h("th", {style:thSt("left")}, "DMC"),
            h("th", {style:thSt("left")}, "Name"),
            h("th", {style:thSt("left")}, "Type"),
            h("th", {style:thSt("right")}, "Stitches"),
            h("th", {style:thSt("right")}, "Skeins"),
            hasStash && h("th", {style:thSt("right")}, "In stash"),
            hasStash && h("th", {style:thSt("left")}, "Status"),
            ctx.done && h("th", {style:thSt("right")}, "Done")
          )
        ),
        h("tbody", null,
          sortedRows.map(function(r, i) {
            var p    = r.p;
            var isHi = cv.hiId === p.id;
            var rowBg = isHi ? "#fff7ed"
              : (hasStash && r.status === "owned") ? "#f0fdf4"
              : i % 2 === 0 ? "transparent" : "#fafafa";
            return h("tr", {
              key: p.id,
              onClick: function() { cv.setHiId(isHi ? null : p.id); app.setTab("pattern"); },
              style:{borderBottom:"0.5px solid #f1f5f9", cursor:"pointer", background:rowBg}
            },
              h("td", {style:{padding:"6px 10px", fontFamily:"monospace", fontSize:16}}, p.symbol),
              h("td", {style:{padding:"6px 10px"}},
                h("div", {style:{width:22, height:22, borderRadius:4, background:"rgb("+p.rgb+")",
                                  border:"0.5px solid #e2e8f0", display:"inline-block"}})
              ),
              h("td", {style:{padding:"6px 10px", fontWeight:600}}, p.id),
              h("td", {style:{padding:"6px 10px", color:"#475569"}},
                r.name,
                r.confettiCount ? h("span", {
                  title: r.confettiCount + " isolated stitch" + (r.confettiCount !== 1 ? "es" : ""),
                  style:{marginLeft:6, color:"#dc2626", fontSize:10, fontWeight:600, cursor:"default", whiteSpace:"nowrap"}
                }, "\u25cf " + r.confettiCount) : null
              ),
              h("td", {style:{padding:"6px 10px"}},
                h("span", {style:{
                  padding:"2px 7px", borderRadius:10, fontSize:10, fontWeight:600,
                  background: p.type === "blend" ? "#fff7ed" : "#f0fdf4",
                  color:       p.type === "blend" ? "#ea580c" : "#16a34a"
                }}, p.type === "blend" ? "Blend" : "Solid")
              ),
              h("td", {style:{padding:"6px 10px", textAlign:"right"}}, p.count.toLocaleString()),
              h("td", {style:{padding:"6px 10px", textAlign:"right", fontWeight:600}}, r.needed),
              hasStash && h("td", {style:{padding:"6px 10px", textAlign:"right",
                                          color: r.owned > 0 ? "#15803d" : "#94a3b8"}},
                r.owned > 0 ? r.owned : "\u2014"
              ),
              hasStash && h("td", {style:{padding:"6px 10px"}}, statusBadge(r.status)),
              ctx.done && h("td", {style:{padding:"6px 10px", textAlign:"right"}},
                h("span", {style:{color: r.dc.done >= r.dc.total ? "#16a34a" : "#475569"}},
                  r.dc.done + "/" + r.dc.total)
              )
            );
          })
        )
      )
    ),

    // ── Fabric calculator (collapsible) ──────────────────────────────────────
    h("div", {style:{border:"0.5px solid #e2e8f0", borderRadius:8, overflow:"hidden"}},
      h("button", {
        onClick: function() { setFabOpen(function(o) { return !o; }); },
        style:{width:"100%", textAlign:"left", padding:"9px 14px", fontSize:12,
               fontWeight:600, color:"#475569", background:"#f8f9fa", border:"none",
               cursor:"pointer", display:"flex", alignItems:"center", gap:6}
      },
        h("span", {style:{fontSize:9, opacity:0.6}}, fabOpen ? "\u25be" : "\u25b8"),
        "Fabric Calculator"
      ),
      fabOpen && h("div", {style:{padding:"12px 14px"}},
        // Controls
        h("div", {style:{display:"flex", alignItems:"center", gap:10, marginBottom:12, flexWrap:"wrap"}},
          h("span", {style:{fontSize:12, color:"#475569"}}, "Margin:"),
          h("input", {
            type:"number", min:0, max:10, step:0.5, value:margin,
            onChange: function(e) { setMargin(Number(e.target.value) || 0); },
            style:{width:56, padding:"3px 8px", fontSize:12, borderRadius:6, border:"0.5px solid #e2e8f0"}
          }),
          h("span", {style:{fontSize:12, color:"#94a3b8"}}, "inches each side"),
          h("span", {style:{fontSize:12, color:"#cbd5e1"}}, "|"),
          h("span", {style:{fontSize:12, color:"#475569"}}, "Units:"),
          ["in","cm"].map(function(u) {
            return h("button", {key:u, onClick:function(){setUnits(u);}, style:{
              fontSize:11, padding:"3px 10px", borderRadius:6, cursor:"pointer",
              border:"0.5px solid " + (units===u?"#0d9488":"#e2e8f0"),
              background: units===u?"#f0fdfa":"#fff",
              color:       units===u?"#0d9488":"#475569", fontWeight:units===u?600:400
            }}, u === "in" ? "Inches" : "Centimetres");
          })
        ),
        // Table
        h("div", {style:{overflow:"auto"}},
          h("table", {style:{borderCollapse:"collapse", fontSize:12}},
            h("thead", null,
              h("tr", null,
                h("th", {style:thSt("left")}, "Count"),
                h("th", {style:thSt("right")}, "Width"),
                h("th", {style:thSt("right")}, "Height"),
                h("th", {style:thSt("left")}, "")
              )
            ),
            h("tbody", null,
              fabCounts.map(function(f) {
                var dims      = calcFab(f.ct, overTwo ? 2 : null);
                var isCurrent = f.ct === fabricCt;
                return h("tr", {key:f.ct, style:{
                  borderBottom:"0.5px solid #f1f5f9",
                  background: isCurrent ? "#f0fdf4" : "transparent"
                }},
                  h("td", {style:{padding:"5px 10px", fontWeight:isCurrent?700:400}},
                    f.label + (overTwo ? " (over 2)" : "")),
                  h("td", {style:{padding:"5px 10px", textAlign:"right", fontWeight:600}}, dims.w),
                  h("td", {style:{padding:"5px 10px", textAlign:"right", fontWeight:600}}, dims.h),
                  h("td", {style:{padding:"5px 10px"}},
                    isCurrent && h("span", {style:{fontSize:10, color:"#0d9488", fontWeight:600}}, "\u2190 current")
                  )
                );
              })
            )
          )
        ),
        h("p", {style:{fontSize:11, color:"#94a3b8", marginTop:8, marginBottom:0}},
          "Pattern: " + sW + "\u00d7" + sH + " stitches. Margin: " + margin + "\" each side."
          + (overTwo ? " Stitching over two threads." : "")
        )
      )
    )
  );
};
