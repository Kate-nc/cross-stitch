/* creator/LegendTab.js — Materials tab: thread legend + fabric calculator.
   Reads from CreatorContext. Loaded as a plain <script> before the main Babel script.
   Depends on: skeinEst (helpers.js), stitchesToSkeins (threadCalc.js),
               FABRIC_COUNTS (constants.js), StashBridge (stash-bridge.js),
               CreatorContext (context.js) */

// PERF (perf-1 #7 / perf-2 #1): hoist Intl.Collator to module scope so it isn't
// reallocated on every component render.
var _LEGEND_THREAD_ID_COLLATOR = new Intl.Collator(undefined, {numeric: true, sensitivity: "base"});
var _LEGEND_NUMERIC_RE = /^\d+$/;

window.CreatorLegendTab = function CreatorLegendTab() {
  var ctx = window.usePatternData();
  var cv  = window.useCanvas();
  var app = window.useApp();
  var h   = React.createElement;

  var useState = React.useState;
  var useMemo  = React.useMemo;

  // ── All hooks BEFORE any conditional returns ───────────────────────────────
  var _units    = useState("in");     var units    = _units[0];    var setUnits    = _units[1];
  var _margin   = useState(3);        var margin   = _margin[0];   var setMargin   = _margin[1];
  var _overTwo  = useState(false);    var overTwo  = _overTwo[0];  var setOverTwo  = _overTwo[1];
  var _sort     = useState("number"); var sort     = _sort[0];     var setSort     = _sort[1];
  var _copied   = useState(false);    var copied   = _copied[0];   var setCopied   = _copied[1];
  var _addedAll = useState(false);    var addedAll = _addedAll[0]; var setAddedAll = _addedAll[1];

  var stash           = ctx.globalStash || {};
  var fabricCt        = ctx.fabricCt || 14;
  var effectiveFabric = overTwo ? fabricCt / 2 : fabricCt;

  // color-2 (B3): fabric background colour preview. Reads from ctx; setter is
  // also on ctx (wired via creator-main → useCreatorState).
  var fabricColour = (typeof ctx.fabricColour === "string") ? ctx.fabricColour : "#FFFFFF";
  function setFabricColour(v) { if (typeof ctx.setFabricColour === "function") ctx.setFabricColour(v); }
  // Curated fabric presets — labels and hex values match the popover wireframes.
  var FABRIC_PRESETS = [
    { id: "white",     label: "White Aida",       hex: "#FFFFFF" },
    { id: "antique",   label: "Antique White",    hex: "#FAEBD7" },
    { id: "cream",     label: "Cream Evenweave",  hex: "#FFF8E7" },
    { id: "linen",     label: "Natural Linen",    hex: "#D2B48C" },
    { id: "blackaida", label: "Black Aida",       hex: "#1A1A1A" }
  ];

  var rows = useMemo(function() {
    if (!(ctx.pat && ctx.pal)) return [];
    return ctx.pal.map(function(p) {
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
      var stashEntry = stash[threadKey('dmc', p.id)] || {};
      var owned      = stashEntry.owned || 0;
      var status     = owned >= needed ? "owned" : owned > 0 ? "partial" : "needed";
      var name = (p.type === "blend" && p.threads)
        ? p.threads[0].name + " + " + p.threads[1].name
        : (p.name || p.id);
      var confettiCount = (app.confettiData && app.confettiData.clean && app.confettiData.clean.colorConfetti)
        ? app.confettiData.clean.colorConfetti[p.id] : null;
      var dc = (ctx.colourDoneCounts && ctx.colourDoneCounts[p.id]) || {total: 0, done: 0};
      return {p: p, owned: owned, needed: needed, status: status, name: name, confettiCount: confettiCount, dc: dc};
    });
  }, [ctx.pat, ctx.pal, stash, effectiveFabric, app.confettiData, ctx.colourDoneCounts]);

  var threadIdCollator = _LEGEND_THREAD_ID_COLLATOR;
  function compareThreadIds(aId, bId) {
    var aStr = String(aId == null ? "" : aId);
    var bStr = String(bId == null ? "" : bId);
    var aIsNumeric = _LEGEND_NUMERIC_RE.test(aStr);
    var bIsNumeric = _LEGEND_NUMERIC_RE.test(bStr);
    if (aIsNumeric && bIsNumeric) {
      var aNum = parseInt(aStr, 10);
      var bNum = parseInt(bStr, 10);
      if (aNum !== bNum) return aNum - bNum;
    }
    return threadIdCollator.compare(aStr, bStr);
  }

  var sortedRows = useMemo(function() {
    var copy = rows.slice();
    if (sort === "number") {
      copy.sort(function(a, b) { return compareThreadIds(a.p.id, b.p.id); });
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

  // ── color-2 (Approach B3): similar-colour pairs in the active palette ──────
  // For every thread, find the nearest other thread in the palette by ΔE₀₀.
  // If ΔE₀₀ < 3.0 we surface a small warning so users know the two shades
  // will likely be indistinguishable on screen and easy to mix up in person.
  // Solid threads only — blends compare on their composite rgb (already on p.rgb).
  var similarPairs = useMemo(function() {
    var byId = {}; // id -> nearest match {otherId, otherName, dE}
    if (typeof window === "undefined" || typeof window.dE00 !== "function" || typeof window.rgbToLab !== "function") return byId;
    if (!ctx.pal || ctx.pal.length < 2) return byId;
    var labs = ctx.pal.map(function(p) {
      var rgb = p.rgb || [128, 128, 128];
      return window.rgbToLab(rgb[0], rgb[1], rgb[2]);
    });
    for (var i = 0; i < ctx.pal.length; i++) {
      var nearest = null, nearestDe = 3.0; // threshold
      for (var j = 0; j < ctx.pal.length; j++) {
        if (i === j) continue;
        var de = window.dE00(labs[i], labs[j]);
        if (de < nearestDe) { nearestDe = de; nearest = ctx.pal[j]; }
      }
      if (nearest) {
        byId[ctx.pal[i].id] = {
          otherId: nearest.id,
          otherName: nearest.name || nearest.id,
          dE: nearestDe
        };
      }
    }
    return byId;
  }, [ctx.pal]);
  var similarCount = Object.keys(similarPairs).length;

  // ── color-2 (Approach B3): dismissible screen-colour disclaimer ────────────
  var _disclaimerDismissed = useState(function() {
    try { return !!(window.UserPrefs && window.UserPrefs.get("creatorColourDisclaimerDismissed")); }
    catch (_) { return false; }
  });
  var disclaimerDismissed = _disclaimerDismissed[0];
  var setDisclaimerDismissedRaw = _disclaimerDismissed[1];
  function dismissDisclaimer() {
    setDisclaimerDismissedRaw(true);
    try { if (window.UserPrefs) window.UserPrefs.set("creatorColourDisclaimerDismissed", true); } catch (_) {}
  }

  // ── color-3 (C2): swatch detail popover ───────────────────────────────────
  // Tracks the thread whose swatch was clicked. Single popover at a time.
  var _popover = useState(null); // { id, name, rgb, similarThread, anchorRect } | null
  var popoverThread = _popover[0];
  var setPopoverThread = _popover[1];

  // ── color-3 (C3): expanded similar-colour comparator + dismissed pairs ────
  var _expanded = useState(null); // pairKey | null
  var expandedPair = _expanded[0];
  var setExpandedPair = _expanded[1];
  var dismissedPairsRef = React.useRef(null);
  if (dismissedPairsRef.current === null) dismissedPairsRef.current = new Set();

  var totalColours   = rows.length;
  var totalSkeins    = rows.reduce(function(s, r) { return s + r.needed; }, 0);
  var ownedColours   = rows.filter(function(r) { return r.status === "owned"; }).length;
  var partialColours = rows.filter(function(r) { return r.status === "partial"; }).length;
  var needSkeins     = rows.reduce(function(s, r) { return s + Math.max(0, r.needed - r.owned); }, 0);
  var hasStash       = Object.keys(stash).length > 0;

  // ── Early returns after all hooks ─────────────────────────────────────────
  if (!(ctx.pat && ctx.pal)) return null;
  // B3/B4: rendered as the 'threads' sub-tab inside MaterialsHub.
  if (app.tab !== "materials" || app.materialsTab !== "threads") return null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  var fabCounts = (typeof FABRIC_COUNTS !== "undefined") ? FABRIC_COUNTS : [
    {ct:11,label:"11 count"},{ct:14,label:"14 count"},{ct:16,label:"16 count"},{ct:18,label:"18 count"}
  ];
  var sW = ctx.sW || 0;
  var sH = ctx.sH || 0;
  var canShare = typeof navigator !== "undefined" && !!navigator.share;
  var allOwned = hasStash && ownedColours === totalColours;

  function thSt(align) {
    return {padding:"6px 10px", textAlign:align, borderBottom:"2px solid var(--border)",
            color:"var(--text-tertiary)", fontWeight:600, fontSize:10, textTransform:"uppercase",
            background:"var(--surface-secondary)", whiteSpace:"nowrap"};
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
      owned:   {label:"In stash",   bg:"var(--success-soft)", color:"var(--success)", icon:true},
      partial: {label:"Partial",     bg:"#F8EFD8", color:"var(--accent-hover)"},
      needed:  {label:"Need to buy", bg:"var(--danger-soft)", color:"var(--danger)"}
    };
    var s = cfg[status] || cfg.needed;
    var children = s.icon && window.Icons && window.Icons.check
      ? [h("span", {key:"i", "aria-hidden":"true", style:{display:"inline-flex", verticalAlign:"middle", marginRight:3}}, window.Icons.check()), s.label]
      : s.label;
    return h("span", {style:{padding:"2px 7px", borderRadius:'var(--radius-lg)', fontSize:10, fontWeight:600,
                              background:s.bg, color:s.color, whiteSpace:"nowrap", display:"inline-flex", alignItems:"center"}}, children);
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

  // ── Section heading style ─────────────────────────────────────────────────
  var secHead = {
    fontSize:'var(--text-xs)', fontWeight:700, color:"var(--text-secondary)", textTransform:"uppercase",
    letterSpacing:"0.05em", marginBottom:'var(--s-2)', display:"block"
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return h("div", {style:{maxWidth:980, padding:"16px 16px 20px"}},

    // ── Summary bar ──────────────────────────────────────────────────────────
    h("div", {style:{
      display:"flex", alignItems:"center", gap:10, flexWrap:"wrap",
      padding:"9px 14px", borderRadius:'var(--radius-md)', marginBottom:14, fontSize:'var(--text-sm)',
      background: allOwned ? "var(--success-soft)" : "var(--surface-secondary)",
      border:"0.5px solid " + (allOwned ? "var(--success-soft)" : "var(--border)")
    }},
      h("span", {style:{fontSize:'var(--text-xs)', color:"var(--text-tertiary)"}},
        totalColours + " colour" + (totalColours !== 1 ? "s" : "") + ", " + totalSkeins + " skein" + (totalSkeins !== 1 ? "s" : "")
      ),
      hasStash && h("span", {style:{fontWeight:600, color: allOwned ? "var(--success)" : "var(--text-secondary)", display:"inline-flex", alignItems:"center", gap:4}},
        allOwned
          ? [window.Icons && window.Icons.check ? h("span", {key:"i", "aria-hidden":"true", style:{display:"inline-flex"}}, window.Icons.check()) : null, "All colours in stash!"]
          : "Stash: " + ownedColours + "/" + totalColours + " owned"
            + (partialColours > 0 ? ", " + partialColours + " partial" : "")
      ),
      hasStash && !allOwned && h("span", {style:{color:"var(--danger)", fontSize:'var(--text-xs)'}},
        "\u2014 ~" + needSkeins + " skein" + (needSkeins !== 1 ? "s" : "") + " still needed"
      ),
      h("div", {style:{marginLeft:"auto", display:"flex", gap:6}},
        h("button", {onClick:handleCopy, style:{
          fontSize:'var(--text-xs)', padding:"4px 10px", borderRadius:'var(--radius-sm)', cursor:"pointer",
          border:"0.5px solid var(--border)", background:copied?"var(--accent)":"var(--surface)",
          color:copied?"var(--surface)":"var(--text-secondary)", fontWeight:500,
          display:"inline-flex", alignItems:"center", gap:4
        }}, copied ? [window.Icons && window.Icons.check ? h("span", {key:"i", "aria-hidden":"true", style:{display:"inline-flex"}}, window.Icons.check()) : null, "Copied"] : "Copy list"),
        canShare && !allOwned && h("button", {onClick:handleShare, style:{
          fontSize:'var(--text-xs)', padding:"4px 10px", borderRadius:'var(--radius-sm)', cursor:"pointer",
          border:"0.5px solid var(--border)", background:"var(--surface)", color:"var(--text-secondary)", fontWeight:500
        }}, "Share"),
        h("a", {href:"manager.html", target:"_blank", style:{
          fontSize:'var(--text-xs)', padding:"4px 10px", borderRadius:'var(--radius-sm)',
          border:"0.5px solid var(--border)", background:"var(--surface)", color:"var(--text-secondary)",
          fontWeight:500, textDecoration:"none", display:"inline-flex", alignItems:"center", gap:4
        }}, ["Thread stash", window.Icons && window.Icons.chevronRight ? h("span", {key:"a", "aria-hidden":"true", style:{display:"inline-flex"}}, window.Icons.chevronRight()) : null])
      )
    ),

    // ── Two-column body ───────────────────────────────────────────────────────
    h("div", {className:"materials-cols"},

      // ── LEFT: Threads ───────────────────────────────────────────────────────
      h("div", {style:{minWidth:0}},
        // Sub-header + controls
        h("div", {style:{display:"flex", alignItems:"center", gap:'var(--s-2)', marginBottom:'var(--s-2)', flexWrap:"wrap"}},
          h("span", {style:secHead}, "Threads"),
          h("span", {style:{fontSize:'var(--text-sm)', color:"#CFC4AC", marginBottom:'var(--s-2)'}}, "|"),
          h("span", {style:{fontSize:'var(--text-sm)', color:"var(--text-secondary)", marginBottom:'var(--s-2)'}}, "Sort:"),
          h("select", {
            value:sort, onChange:function(e){setSort(e.target.value);},
            style:{fontSize:'var(--text-xs)', padding:"3px 8px", borderRadius:'var(--radius-sm)', border:"0.5px solid var(--border)",
                   background:"var(--surface)", marginBottom:'var(--s-2)'}
          },
            h("option", {value:"number"},  "Thread number"),
            h("option", {value:"stitches"}, "Stitch count"),
            h("option", {value:"skeins"},  "Skeins needed"),
            hasStash && h("option", {value:"status"}, "Stash status")
          ),
          hasStash && !allOwned && h("button", {onClick:handleAddAll, style:{
            fontSize:'var(--text-xs)', padding:"3px 10px", borderRadius:'var(--radius-sm)', cursor:"pointer", marginBottom:'var(--s-2)',
            border:"0.5px solid var(--border)", background:addedAll?"var(--accent)":"var(--surface)",
            color:addedAll?"var(--surface)":"var(--text-secondary)", fontWeight:500, marginLeft:"auto",
            display:"inline-flex", alignItems:"center", gap:4
          }}, addedAll ? [window.Icons && window.Icons.check ? h("span", {key:"i", "aria-hidden":"true", style:{display:"inline-flex"}}, window.Icons.check()) : null, "Added"] : "Mark all owned")
        ),
        // ── color-2 (B3): Screen-colour disclaimer (dismissible) ────────────
        !disclaimerDismissed && h("div", {style:{
          display:"flex", alignItems:"flex-start", gap:8, padding:"8px 12px",
          background:"var(--surface-secondary)", border:"0.5px solid var(--border)",
          borderRadius:'var(--radius-sm)', marginBottom:'var(--s-2)',
          fontSize:'var(--text-xs)', color:"var(--text-secondary)", lineHeight:1.45
        }},
          h("span", {"aria-hidden":"true", style:{display:"inline-flex", flexShrink:0, marginTop:1, color:"var(--text-tertiary)"}},
            window.Icons && window.Icons.info ? window.Icons.info() : null
          ),
          h("span", {style:{flex:1}},
            "Colours are screen approximations. Use the DMC code as the authoritative reference and verify critical colours against a physical thread card."
          ),
          h("button", {onClick:dismissDisclaimer, "aria-label":"Dismiss colour-accuracy notice", style:{
            background:"none", border:"none", color:"var(--text-tertiary)", cursor:"pointer",
            padding:2, display:"inline-flex", alignItems:"center", borderRadius:'var(--radius-sm)', flexShrink:0
          }}, window.Icons && window.Icons.x ? window.Icons.x() : "\u00d7")
        ),
        // ── color-2 (B3): Inline summary if any palette pairs are too close ──
        similarCount > 0 && h("div", {style:{
          display:"flex", alignItems:"center", gap:6, padding:"6px 10px",
          background:"#FBF1E1", border:"0.5px solid var(--border)",
          borderRadius:'var(--radius-sm)', marginBottom:'var(--s-2)',
          fontSize:'var(--text-xs)', color:"var(--accent-hover, #B7500A)", lineHeight:1.45
        }},
          h("span", {"aria-hidden":"true", style:{display:"inline-flex"}},
            window.Icons && window.Icons.warning ? window.Icons.warning() : null
          ),
          h("span", null,
            similarCount + " palette colour" + (similarCount !== 1 ? "s have" : " has") +
            " a near-match \u2014 hover the warning icon next to a thread name to see which."
          )
        ),
        // Thread table
        h("div", {style:{overflow:"auto", maxHeight:440, border:"0.5px solid var(--border)", borderRadius:'var(--radius-md)'}},
          h("table", {style:{width:"100%", borderCollapse:"collapse", fontSize:'var(--text-sm)'}},
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
                var rowBg = isHi ? "#F8EFD8"
                  : (hasStash && r.status === "owned") ? "var(--success-soft)"
                  : i % 2 === 0 ? "transparent" : "var(--surface-secondary)";
                var pairKey = similarPairs[p.id]
                  ? window.similarPairKey(p.id, similarPairs[p.id].otherId)
                  : null;
                var showComparator = pairKey
                  && expandedPair === pairKey
                  && !dismissedPairsRef.current.has(pairKey);
                var otherThread = null;
                if (showComparator) {
                  for (var oi = 0; oi < ctx.pal.length; oi++) {
                    if (ctx.pal[oi].id === similarPairs[p.id].otherId) {
                      otherThread = ctx.pal[oi]; break;
                    }
                  }
                }
                var colSpan = 6 + (hasStash ? 2 : 0) + (ctx.done ? 1 : 0);
                return h(React.Fragment, { key: p.id },
                  h("tr", {
                  onClick: function() { cv.setHiId(isHi ? null : p.id); app.setTab("pattern"); },
                  style:{borderBottom:"0.5px solid var(--surface-tertiary)", cursor:"pointer", background:rowBg}
                },
                  h("td", {style:{padding:"5px 10px", fontFamily:"monospace", fontSize:15}}, p.symbol),
                  h("td", {style:{padding:"5px 8px"}},
                    h("div", {
                      className: "colour-swatch",
                      role: "button",
                      tabIndex: 0,
                      "aria-label": "Show colour details for " + p.id,
                      title: "Click for colour details",
                      onClick: function(ev) {
                        ev.stopPropagation();
                        var rect = ev.currentTarget.getBoundingClientRect();
                        var nearest = (window.findNearestSimilarThread && p.lab)
                          ? window.findNearestSimilarThread(p, ctx.pal, 8)
                          : null;
                        setPopoverThread({
                          id: p.id, name: p.name || r.name, rgb: p.rgb,
                          similarThread: nearest,
                          anchorRect: rect
                        });
                      },
                      onKeyDown: function(ev) {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault(); ev.stopPropagation();
                          var rect = ev.currentTarget.getBoundingClientRect();
                          var nearest = (window.findNearestSimilarThread && p.lab)
                            ? window.findNearestSimilarThread(p, ctx.pal, 8)
                            : null;
                          setPopoverThread({
                            id: p.id, name: p.name || r.name, rgb: p.rgb,
                            similarThread: nearest,
                            anchorRect: rect
                          });
                        }
                      },
                      style:{width:20, height:20, borderRadius:3, background:"rgb("+p.rgb+")",
                              border:"0.5px solid var(--border)", display:"inline-block", cursor:"pointer"}
                    })
                  ),
                  h("td", {style:{padding:"5px 10px", fontWeight:600}}, p.id),
                  h("td", {style:{padding:"5px 10px", color:"var(--text-secondary)", whiteSpace:"nowrap"}},
                    r.name,
                    r.confettiCount ? h("span", {
                      title: r.confettiCount + " isolated stitch" + (r.confettiCount !== 1 ? "es" : ""),
                      style:{marginLeft:5, color:"var(--danger)", fontSize:10, fontWeight:600, cursor:"default"}
                    }, "\u25cf " + r.confettiCount) : null,
                    similarPairs[p.id] ? h("span", {
                      title: "Click to compare with DMC " + similarPairs[p.id].otherId + " (" + similarPairs[p.id].otherName + ") \u2014 \u0394E\u2080\u2080 " + similarPairs[p.id].dE.toFixed(1),
                      "aria-label": "Compare with similar colour DMC " + similarPairs[p.id].otherId,
                      role: "button",
                      tabIndex: 0,
                      onClick: function(ev) {
                        ev.stopPropagation();
                        var key = window.similarPairKey(p.id, similarPairs[p.id].otherId);
                        setExpandedPair(expandedPair === key ? null : key);
                      },
                      onKeyDown: function(ev) {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault(); ev.stopPropagation();
                          var key = window.similarPairKey(p.id, similarPairs[p.id].otherId);
                          setExpandedPair(expandedPair === key ? null : key);
                        }
                      },
                      style:{marginLeft:6, color:"var(--accent-hover, #B7500A)", display:"inline-flex", verticalAlign:"middle", cursor:"pointer"}
                    }, window.Icons && window.Icons.warning ? window.Icons.warning() : null) : null
                  ),
                  h("td", {style:{padding:"5px 10px"}},
                    h("span", {style:{
                      padding:"2px 6px", borderRadius:'var(--radius-lg)', fontSize:10, fontWeight:600,
                      background: p.type === "blend" ? "#F8EFD8" : "var(--success-soft)",
                      color:       p.type === "blend" ? "var(--accent-hover)" : "var(--success)"
                    }}, p.type === "blend" ? "Blend" : "Solid")
                  ),
                  h("td", {style:{padding:"5px 10px", textAlign:"right"}}, p.count.toLocaleString()),
                  h("td", {style:{padding:"5px 10px", textAlign:"right", fontWeight:600}}, r.needed),
                  hasStash && h("td", {style:{padding:"5px 10px", textAlign:"right",
                                              color: r.owned > 0 ? "var(--success)" : "var(--text-tertiary)"}},
                    r.owned > 0 ? r.owned : "\u2014"
                  ),
                  hasStash && h("td", {style:{padding:"5px 10px"}}, statusBadge(r.status)),
                  ctx.done && h("td", {style:{padding:"5px 10px", textAlign:"right"}},
                    h("span", {style:{color: r.dc.done >= r.dc.total ? "var(--success)" : "var(--text-secondary)"}},
                      r.dc.done + "/" + r.dc.total)
                  )
                ),
                showComparator && otherThread && h("tr", {
                  key: pairKey + "-cmp",
                  style: { background: "var(--surface)" }
                },
                  h("td", { colSpan: colSpan, style: { padding: "0 10px 8px" } },
                    h(window.SimilarColourComparator, {
                      threadA: { id: p.id, name: p.name || r.name, rgb: p.rgb },
                      threadB: { id: otherThread.id, name: otherThread.name || similarPairs[p.id].otherName, rgb: otherThread.rgb },
                      dE: similarPairs[p.id].dE,
                      onDismiss: function() {
                        dismissedPairsRef.current.add(pairKey);
                        setExpandedPair(null);
                      }
                    })
                  )
                )
                );
              })
            )
          )
        )
      ),

      // ── RIGHT: Fabric ──────────────────────────────────────────────────────
      h("div", {style:{minWidth:0}},
        h("span", {style:secHead}, "Fabric"),

        // Fabric count + over-two
        h("div", {style:{
          padding:"10px 12px", background:"var(--surface-secondary)", border:"0.5px solid var(--border)",
          borderRadius:"8px 8px 0 0", display:"flex", flexDirection:"column", gap:'var(--s-2)'
        }},
          h("label", {style:{display:"flex", alignItems:"center", gap:6, fontSize:'var(--text-sm)', color:"var(--text-secondary)"}},
            "Count:",
            h("select", {
              value: ctx.fabricCt,
              onChange: function(e) { ctx.setFabricCt(Number(e.target.value)); },
              style:{flex:1, padding:"3px 8px", borderRadius:'var(--radius-sm)', border:"0.5px solid var(--border)",
                     fontSize:'var(--text-sm)', background:"var(--surface)"}
            }, fabCounts.map(function(f) { return h("option", {key:f.ct, value:f.ct}, f.label); }))
          ),
          h("label", {style:{display:"flex", alignItems:"center", gap:6, fontSize:'var(--text-sm)', color:"var(--text-secondary)"}},
            h("input", {type:"checkbox", checked:overTwo,
              onChange: function(e) { setOverTwo(e.target.checked); }}),
            "Stitching over two"
          ),
          h("label", {style:{display:"flex", alignItems:"center", gap:6, fontSize:'var(--text-sm)', color:"var(--text-secondary)"}},
            "Margin:",
            h("input", {
              type:"number", min:0, max:10, step:0.5, value:margin,
              onChange: function(e) { setMargin(Number(e.target.value) || 0); },
              style:{width:52, padding:"3px 6px", fontSize:'var(--text-sm)', borderRadius:'var(--radius-sm)',
                     border:"0.5px solid var(--border)", background:"var(--surface)"}
            }),
            h("span", {style:{fontSize:'var(--text-xs)', color:"var(--text-tertiary)"}}, "\" each side")
          ),
          h("div", {style:{display:"flex", gap:'var(--s-1)'}},
            ["in","cm"].map(function(u) {
              return h("button", {key:u, onClick:function(){setUnits(u);}, style:{
                flex:1, fontSize:'var(--text-xs)', padding:"3px 0", borderRadius:'var(--radius-sm)', cursor:"pointer",
                border:"0.5px solid " + (units===u?"var(--accent)":"var(--border)"),
                background: units===u?"var(--accent-light)":"var(--surface)",
                color:       units===u?"var(--accent)":"var(--text-secondary)", fontWeight:units===u?600:400
              }}, u === "in" ? "Inches" : "Centimetres");
            })
          ),
          // ── color-2 (B3): Fabric background colour preview ─────────────
          h("div", {style:{display:"flex", flexDirection:"column", gap:'var(--s-1)', marginTop:'var(--s-1)'}},
            h("span", {style:{fontSize:'var(--text-xs)', color:"var(--text-tertiary)"}},
              "Preview against fabric:"),
            h("div", {style:{display:"flex", gap:6, flexWrap:"wrap"}},
              FABRIC_PRESETS.map(function(f) {
                var on = fabricColour && fabricColour.toUpperCase() === f.hex.toUpperCase();
                return h("button", {
                  key: f.id,
                  type: "button",
                  onClick: function() { setFabricColour(f.hex); },
                  title: f.label,
                  "aria-label": "Preview against " + f.label,
                  "aria-pressed": on,
                  style: {
                    width: 26, height: 26, borderRadius: 'var(--radius-sm)', cursor: "pointer",
                    background: f.hex,
                    border: "1.5px solid " + (on ? "var(--accent)" : "var(--border)"),
                    boxShadow: on ? "0 0 0 2px var(--accent-light, rgba(160,103,52,0.18))" : "none",
                    padding: 0, position: "relative"
                  }
                });
              })
            ),
            h("p", {style:{fontSize:10, color:"var(--text-tertiary)", margin:0, lineHeight:1.4}},
              "Stitched cells appear over this fabric in the Pattern view.")
          )
        ),

        // Fabric size table
        h("div", {style:{border:"0.5px solid var(--border)", borderTop:"none",
                          borderRadius:"0 0 8px 8px", overflow:"hidden"}},
          h("table", {style:{width:"100%", borderCollapse:"collapse", fontSize:'var(--text-sm)'}},
            h("thead", null,
              h("tr", null,
                h("th", {style:thSt("left")}, "Count"),
                h("th", {style:thSt("right")}, "W"),
                h("th", {style:thSt("right")}, "H")
              )
            ),
            h("tbody", null,
              fabCounts.map(function(f) {
                var dims      = calcFab(f.ct, overTwo ? 2 : null);
                var isCurrent = f.ct === fabricCt;
                return h("tr", {key:f.ct, style:{
                  borderBottom:"0.5px solid var(--surface-tertiary)",
                  background: isCurrent ? "var(--success-soft)" : "transparent"
                }},
                  h("td", {style:{padding:"6px 10px", fontWeight:isCurrent?700:400, color:isCurrent?"var(--accent)":"inherit"}},
                    f.ct + (overTwo ? " (×2)" : "") + " ct"
                  ),
                  h("td", {style:{padding:"6px 10px", textAlign:"right", fontWeight:600, fontVariantNumeric:"tabular-nums"}}, dims.w),
                  h("td", {style:{padding:"6px 10px", textAlign:"right", fontWeight:600, fontVariantNumeric:"tabular-nums"}}, dims.h)
                );
              })
            )
          )
        ),
        h("p", {style:{fontSize:10, color:"var(--text-tertiary)", marginTop:6, marginBottom:0, lineHeight:1.4}},
          sW + "\u00d7" + sH + " stitches"
          + (margin > 0 ? " + " + margin + "\" margin" : "")
          + (overTwo ? ", over two" : "")
        )
      )

    ), // end two-column

    // ── color-3 (C2): swatch detail popover (portalled to body) ─────────────
    popoverThread && window.SwatchDetailPopover && h(window.SwatchDetailPopover, {
      thread: popoverThread,
      anchorRect: popoverThread.anchorRect,
      onClose: function() { setPopoverThread(null); }
    })
  );
};

