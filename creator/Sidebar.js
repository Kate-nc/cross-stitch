/* creator/Sidebar.js — Settings sidebar for the Creator app.
   Reads from CreatorContext and GenerationContext.
   Concatenated into creator/bundle.js, which the page loads before creator-main.
   Depends on: Section, SliderRow, Tooltip (components.js), CreatorContext, GenerationContext (context.js) */

// Use the same stitch renderer as Ready to stitch, alongside the flat swatch.
window.BlendRecipePreview = function BlendRecipePreview(props) {
  var ref = React.useRef(null), recipe = props.recipe;
  React.useEffect(function() {
    var c=ref.current && ref.current.getContext('2d');
    if(!c || !window.drawStitchTile)return;
    var hex=(props.fabricColour||'').replace('#','');
    var fabric=/^[0-9a-f]{6}$/i.test(hex)?[0,2,4].map(function(i){return parseInt(hex.slice(i,i+2),16);}):[255,255,255];
    var strands=recipe.threads.map(function(t){return t.rgb;});
    window.drawStitchTile(c,48,fabric,strands,strands,window.stitchCoverage?window.stitchCoverage(props.fabricCt):0.9);
  }, [recipe.id, props.fabricColour, props.fabricCt]);
  return React.createElement('div',{className:'blend-recipe-preview',role:'group','aria-label':'Blend appearance preview'},
    React.createElement('span',{className:'blend-recipe-preview__swatch',style:{background:'rgb('+recipe.rgb+')'},role:'img','aria-label':'Approximate combined colour'}),
    React.createElement('canvas',{ref:ref,width:48,height:48,role:'img','aria-label':'Approximate two-thread stitch preview'}),
    React.createElement('span',null,'1 strand of each; 2 strands total. Screen colours are approximate.'));
};

window.CreatorSidebar = function CreatorSidebar() {
  var ctx = window.usePatternData();
  var cv = window.useCanvas();
  var app = window.useApp();
  var gen = window.useGeneration();
  var h = React.createElement;
  var traceInputRef = React.useRef(null);
  var _pco = React.useState(true); var palChipsOpen = _pco[0], setPalChipsOpen = _pco[1];
  var _anchorReady = React.useState(typeof ANCHOR !== 'undefined'); var anchorDataReady = _anchorReady[0], setAnchorDataReady = _anchorReady[1];

  React.useEffect(function () {
    if (anchorDataReady || typeof window.loadAnchorData !== 'function') return;
    var displayPal = ctx.displayPal || ctx.pal || [];
    var needsAnchor = displayPal.some(function (p) { return p && p.brand === 'anchor'; });
    if (!needsAnchor) {
      var stash = ctx.globalStash || {};
      for (var key in stash) {
        if (Object.prototype.hasOwnProperty.call(stash, key) && key.indexOf('anchor:') === 0) {
          needsAnchor = true;
          break;
        }
      }
    }
    if (!needsAnchor) return;
    var cancelled = false;
    window.loadAnchorData({ failMessage: 'Could not load the Anchor catalogue for this pattern. Reload and try again.' })
      .then(function () {
        if (!cancelled) setAnchorDataReady(true);
      })
      .catch(function () {});
    return function () {
      cancelled = true;
    };
  }, [anchorDataReady, ctx.displayPal, ctx.pal, ctx.globalStash]);

  // Note: sidebar always renders — now shown as a right panel (rpanel)
  // The sidebarOpen state is kept for accordion sections but the panel itself stays visible

  // ── Change symbol (audit DRAW-05) ───────────────────────────────────────────
  var _symFor = React.useState(null); var symbolPickerFor = _symFor[0], setSymbolPickerFor = _symFor[1];
  function symbolPanel(list) {
    if (!symbolPickerFor || !window.SymbolGlyphs || !window.PaletteTools) return null;
    var entry = (list || []).find(function(p) { return p.id === symbolPickerFor; });
    if (!entry) return null;
    var free = window.PaletteTools.unusedSymbols(ctx.pal || list, window.SymbolGlyphs.pool());
    return h("div", {className: "pal-symbols", role: "group", "aria-label": "Choose a symbol for " + formatThread(entry)},
      h("div", {className: "pal-symbols__head"},
        h("span", {className: "pal-row__swatch pal-row__swatch--" + window.PaletteTools.swatchInk(entry.rgb), style: {background: "rgb(" + entry.rgb + ")"}, "aria-hidden": "true"}, entry.symbol),
        h("span", {className: "pal-symbols__title"}, "Symbol for " + formatThread(entry)),
        h("button", {type: "button", className: "pal-row__btn", "aria-label": "Close", title: "Close", onClick: function() { setSymbolPickerFor(null); }}, Icons.x())
      ),
      free.length
        ? h("div", {className: "pal-symbols__grid"},
            free.map(function(sym) {
              return h("button", {
                key: sym, type: "button", className: "pal-symbols__btn",
                "aria-label": "Use symbol " + sym, title: "Use " + sym,
                onClick: function() { if (ctx.changeSymbol && ctx.changeSymbol(entry.id, sym) !== false) setSymbolPickerFor(null); }
              }, sym);
            }))
        : h("div", {className: "pal-symbols__empty"}, "Every symbol is in use. Remove a colour to free one.")
    );
  }

  // ── Palette chips (top of right panel, when pattern loaded) ─────────────────
  var PAL_ROW_CLASSES = {wrap: "pal-row__label", id: "pal-row__id", tag: "pal-row__tag", name: "pal-row__name", use: "pal-row__use"};
  var palChipsSection = (ctx.pat && ctx.pal) ? (function() {
    var displayPal = ctx.displayPal || ctx.pal || [];
    var symbolLimitMsg = window.symbolLimitWarning ? window.symbolLimitWarning(window.creatorThreadCounts(displayPal)) : "";
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
      // PERF (action plan §2E.1): prefer the cached id-map over O(n) Array.find.
      if (typeof getAnchorById === 'function' ? getAnchorById(id) : (typeof ANCHOR !== 'undefined' && ANCHOR.find(function(d){ return d.id === id; }))) return 'anchor';
      return 'dmc';
    }
    var demands = ctx.materialThreadRows || threadDemandRows(displayPal, {fabricCount:fabricCtForStash,stash:stash});
    var demandByKey = Object.fromEntries(demands.map(function(r) { return [r.key,r]; }));
    function stashStatusForChip(p) {
      if (!stashHas) return null;
      var parts = threadConstituents(p), worst = 'owned';
      parts.forEach(function(t) {
        var r = demandByKey[t.brand + ':' + t.id];
        if (r && r.status === 'needed') worst = 'needed';
        else if (r && r.status === 'partial' && worst === 'owned') worst = 'partial';
      });
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
      threadConstituents(p).forEach(function(t) {
        var key = t.brand + ':' + t.id, r = demandByKey[key];
        if (r && r.missing > 0 && !unownedSeen[key]) { unownedSeen[key] = true; unownedKeys.push(key); }
      });
    }

    var chips = displayPal.map(function(p) {
      var ips = isPaintMode && cv.selectedColorId === p.id;
      var ihs = cv.hiId === p.id;
      var isUnused = app.appMode === "edit" && p.count === 0;
      var stashStatus = stashStatusForChip(p);
      if (stashStatus === 'needed') _trackUnowned(p);
      // Brief D — when "limit to stash" filter is on, hide unowned chips.
      if (ctx.creatorStashFilter && stashHas && stashStatus === 'needed') {
        hiddenByFilter++;
        return null;
      }
      var countText = (Number(p.count) || 0).toLocaleString("en-GB");
      var ink = window.PaletteTools ? window.PaletteTools.swatchInk(p.rgb) : "black";
      // The one thread label and the strands and skeins this symbol takes (UX-013, UX-014).
      var keyRow = window.threadKeyRow ? window.threadKeyRow(p, { fabricCount: fabricCtForStash }) : null;
      function choose() {
        if (isPaintMode) {
          cv.setSelectedColorId(cv.selectedColorId === p.id ? null : p.id);
        } else {
          cv.setHiId(cv.hiId === p.id ? null : p.id);
        }
      }
      return h("div", {
        key: p.id,
        role: "button",
        tabIndex: 0,
        "aria-pressed": ips || ihs,
        "aria-label": (window.PaletteTools ? window.PaletteTools.swatchLabel(p) : threadLabel(p)) + (keyRow && keyRow.usageTitle ? ". " + keyRow.usageTitle : ""),
        title: keyRow ? keyRow.title : undefined,
        className: "pal-row" + (ips ? " pal-row--selected" : ihs ? " pal-row--hi" : "") + (isUnused ? " pal-row--unused" : ""),
        "data-colour-id": p.id,
        onClick: choose,
        onKeyDown: function(e) {
          if (e.repeat || e.target !== e.currentTarget) return;
          if (e.key === " " || e.key === "Enter") { e.preventDefault(); choose(); }
        }
      },
        (window.isPlaceholderThread && window.isPlaceholderThread(p.id))
          ? h("span", {className: "pal-row__swatch thread-placeholder-swatch", title: "No thread yet: use the swap button to choose one"}, Icons.help())
          : h("span", {className: "pal-row__swatch pal-row__swatch--" + ink, style: {background: "rgb(" + p.rgb + ")"}, "aria-hidden": "true"}, p.symbol),
        // The name wraps rather than being cut short; the strands and skeins sit on their own line.
        keyRow
          ? h(window.ThreadKeyLabel, {row: keyRow, classes: PAL_ROW_CLASSES})
          : h("span", {className: "pal-row__label"}, h("span", {className: "pal-row__id"}, threadLabel(p))),
        h("span", {className: "pal-row__count", title: countText + " stitches"}, countText),
        // Brief D — stash status dot. Hidden when stash empty.
        stashStatus && h("span", {
          className: "pal-row__stash pal-row__stash--" + stashStatus,
          title: stashStatus === 'owned' ? 'In your stash' : stashStatus === 'partial' ? 'You own this colour but quantity may be low' : 'Not in stash',
          "aria-label": "Stash status: " + stashStatus,
          style: { background: STASH_DOT[stashStatus] }
        }),
        app.appMode === "edit" && h("button", {
          type: "button",
          className: "pal-row__btn",
          title: "Change symbol",
          "aria-label": "Change symbol for " + formatThread(p),
          "aria-expanded": symbolPickerFor === p.id ? "true" : "false",
          onClick: function(e) { e.stopPropagation(); setSymbolPickerFor(symbolPickerFor === p.id ? null : p.id); }
        }, Icons.symbols ? Icons.symbols() : null),
        // Colour swap button
        app.appMode === "edit" && h("button", {
          key: "swap-" + p.id,
          type: "button",
          className: "pal-row__btn pal-chip-swap",
          title: "Replace " + (keyRow ? keyRow.label : threadLabel(p)) + " with another colour",
          "aria-label": "Replace " + (keyRow ? keyRow.label : threadLabel(p)) + " with another colour",
          onClick: function(e) {
            e.stopPropagation();
            cv.setColourReplaceModal({ srcId: p.id, srcName: p.name || p.id, srcRgb: p.rgb });
          }
        }, typeof Icons !== 'undefined' && Icons.colourSwap ? Icons.colourSwap() : null),
        isUnused && h("button", {
          type: "button",
          className: "pal-row__btn",
          title: "Remove from palette",
          "aria-label": "Remove " + formatThread(p) + " from the palette",
          onClick: function(e) { e.stopPropagation(); ctx.removeScratchColour(p.id); }
        }, Icons.x())
      );
    }).filter(Boolean);
    var unusedCount = displayPal ? displayPal.filter(function(p) { return p.count === 0; }).length : 0;
    return h("div", {style:{borderBottom:"0.5px solid var(--border)"}},
      h("div", {
        onClick:function(){setPalChipsOpen(function(o){return !o;});},
        style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px 8px",cursor:"pointer",userSelect:"none"}
      },
        h("div", {style:{display:"flex",alignItems:"center",gap:6}},
          h("span", {"aria-hidden":"true",style:{color:"var(--text-tertiary)",display:"inline-flex",transform:palChipsOpen?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s"}}, Icons.chevronRight()),
          h("span", {style:{fontSize:'var(--text-sm)',fontWeight:600,color:"var(--text-secondary)"}}, "In this pattern")
        ),
        h("div", {style:{display:"flex",alignItems:"center",gap:6}},
          app.appMode === "edit" && unusedCount > 0 && h("button", {
            onClick: function(e) { e.stopPropagation(); if (typeof ctx.removeUnusedColours === 'function') ctx.removeUnusedColours(); },
            title: "Remove all colours not used in the pattern",
            style:{fontSize:'var(--text-xs)',padding:"2px 7px",borderRadius:'var(--radius-sm)',border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text-secondary)",fontWeight:500,cursor:"pointer",lineHeight:1.4}
          }, "Remove unused (" + unusedCount + ")"),
          app.appMode === "edit" && ctx.pal && ctx.pal.length > 1 && h("button", {
            onClick: function(e) {
              e.stopPropagation();
              cv.setActiveTool("magicWand");
              ctx.setPartialStitchTool && ctx.setPartialStitchTool(null);
              cv.setBsStart && cv.setBsStart(null);
              cv.selectAll();
              cv.setWandPanel("reduce");
            },
            title: "Select all stitches and open the Simplify Colours panel to merge similar colours",
            style:{fontSize:'var(--text-xs)',padding:"2px 7px",borderRadius:'var(--radius-sm)',border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text-secondary)",fontWeight:500,cursor:"pointer",lineHeight:1.4}
          }, "Simplify colours\u2026"),
          h("span", {className:"palette-counts", style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}, window.threadCountsShort(window.creatorThreadCounts(displayPal))),
          symbolLimitMsg && h("span", {
            className: "palette-counts-warn", role: "img",
            title: symbolLimitMsg,
            "aria-label": symbolLimitMsg,
            style: {display:"inline-flex",width:16,height:16,color:"var(--danger)"}
          }, Icons.warning())
        )
      ),
      palChipsOpen && h("div", {style:{padding:"0 12px 12px"}},
      app.appMode === "edit" && h("p", {className:"convert-first-use"}, "Use Change symbol beside a thread to choose a different chart symbol."),
      // What the strands and skeins on each row mean, and what a blend is (UX-013, UX-014).
      displayPal.length > 0 && h("p", {className:"convert-first-use pal-key-note"}, "Strands and skeins are for each symbol on its own. Materials adds up the threads that several symbols share."),
      window.BlendHelpNote && window.creatorThreadCounts(displayPal).blends > 0 && h(window.BlendHelpNote, null),
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
        )
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
              if (typeof ctx.setAdaptModalMode === 'function') ctx.setAdaptModalMode('stash');
              if (typeof ctx.setAdaptModalOpen === 'function') ctx.setAdaptModalOpen(true);
            },
            style:{fontSize:'var(--text-xs)',padding:"5px 10px",borderRadius:'var(--radius-sm)',border:"1px solid #D49B45",background:"var(--surface)",color:"var(--accent-ink)",fontWeight:600,cursor:"pointer"}
          }, "Adapt to my stash"),
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
              h("span", {style:{fontWeight:600,color:"var(--accent)"}, title: formatThread(selInfo, {variant:"title"})}, formatThread(selInfo, {variant:"short"})),
              h("span", {style:{color:"var(--text-secondary)",flex:1,minWidth:0,overflowWrap:"anywhere"}}, formatThread(selInfo, {variant:"name"})),
              h("button", {
                onClick:function(){cv.setSelectedColorId(null);},
                title:"Clear selection",
                style:{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"var(--text-tertiary)",fontSize:'var(--text-md)',lineHeight:1,padding:"0 2px",flexShrink:0}
              }, "\xD7")
            )
          : h(React.Fragment, null,
              h("span", {style:{fontSize:'var(--text-sm)'}}, Icons.pointing()),
              h("span", {style:{color:"var(--accent-ink)"}}, (window.Platform && window.Platform.isCoarsePointer && window.Platform.isCoarsePointer())
                ? "Select a colour to paint \u2014 or long-press a stitch"
                : "Select a colour to paint \u2014 or right-click the canvas")
            )
      ),
      displayPal.length > 0
        ? h("div", {className:"creator-pattern-chips pal-rows", role:"list"}, chips)
        : h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",textAlign:"center",padding:"8px 0"}}, "No colours yet"),
      symbolPanel(displayPal)
      )
    );
  })() : null;

  // ── Blend picker local state ──────────────────────────────────────────────
  var _bl1 = React.useState(null); var blendThread1 = _bl1[0], setBlendThread1 = _bl1[1];
  var _bl2 = React.useState(null); var blendThread2 = _bl2[0], setBlendThread2 = _bl2[1];
  var _blSearch = React.useState(""); var blendSearch = _blSearch[0], setBlendSearch = _blSearch[1];
  var _blMode = React.useState(false); var blendMode = _blMode[0], setBlendMode = _blMode[1];

  var _blendShown = React.useState(60), blendShown = _blendShown[0], setBlendShown = _blendShown[1];

  // The pattern's thread brand (P4-5): new colours and blends come from that
  // brand's catalogue, and stash lookups use its brand:id keys.
  var patBrand = window.normaliseThreadBrand ? window.normaliseThreadBrand(ctx.threadBrand) : "dmc";
  var brandName = window.threadBrandLabel ? window.threadBrandLabel(patBrand) : "DMC";
  var catList = window.projectThreadList ? window.projectThreadList(patBrand) : DMC;
  var blendFiltered = React.useMemo(function() {
    var base = catList;
    // Brief D — when "limit to stash" is on, restrict to owned threads.
    if (ctx.creatorStashFilter && ctx.globalStash && Object.keys(ctx.globalStash).length > 0) {
      base = catList.filter(function(d) {
        var entry = ctx.globalStash[patBrand + ':' + d.id];
        return isColorOwned(entry);
      });
    }
    if (!blendSearch.trim()) return blendThread1 ? base.slice().sort(function(a,b){
      return dE2000(blendThread1.lab,a.lab)-dE2000(blendThread1.lab,b.lab);
    }) : base;
    var q = blendSearch.toLowerCase();
    return base.filter(function(d) { return d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q); });
  }, [blendSearch, blendThread1, ctx.creatorStashFilter, ctx.globalStash, catList, patBrand]);
  var blendPreview = blendThread1 && blendThread2 && blendThread1.id !== blendThread2.id ? makeThreadBlend(blendThread1,blendThread2) : null;
  if (blendPreview && patBrand !== 'dmc') blendPreview.brand=patBrand;
  var existingBlend = blendPreview && (ctx.pal || []).find(function(p){return blendRecipeKey(p)===blendRecipeKey(blendPreview);});

  function addBlend() {
    if (!blendThread1 || !blendThread2 || blendThread1.id === blendThread2.id) return;
    var blendEntry = makeThreadBlend(blendThread1, blendThread2);
    if (patBrand !== "dmc") blendEntry.brand = patBrand;
    ctx.addScratchColour(blendEntry);
    setBlendThread1(null); setBlendThread2(null); setBlendSearch(""); setBlendMode(false);
  }

  // ── Add colour picker (audit DRAW-05) ─────────────────────────────────────
  // The pattern's own colours come first (above). The catalogue of the
  // pattern's brand sits behind Add colour, in three tabs: My stash,
  // Suggested (close to the selected colour) and All (search plus
  // colour-family chips). With no colours yet (a blank scratch grid) the
  // picker is simply open.
  var PT = window.PaletteTools;
  var palIsEmpty = !(ctx.pal && ctx.pal.length);
  var pickerOpen = !!ctx.colPickerOpen || palIsEmpty;
  var stashAvailable = typeof StashBridge !== "undefined";
  var ownedThreads = React.useMemo(function() {
    if (!stashAvailable || !ctx.globalStash) return [];
    return catList.filter(function(d) { return isColorOwned(ctx.globalStash[patBrand + ":" + d.id]); });
  }, [ctx.globalStash, stashAvailable, catList, patBrand]);
  var familyOf = React.useMemo(function() {
    var m = Object.create(null);
    if (PT) catList.forEach(function(d) { m[d.id] = PT.colourFamily(d.lab); });
    return m;
  }, [!!PT, catList]);
  var _pickTab = React.useState(null); var pickTabState = _pickTab[0], setPickTab = _pickTab[1];
  var _family = React.useState(null); var familyFilter = _family[0], setFamilyFilter = _family[1];
  var suggestBase = (cv.selectedColorId && ctx.cmap && ctx.cmap[cv.selectedColorId])
    || (cv.hiId && ctx.cmap && ctx.cmap[cv.hiId])
    || (ctx.displayPal && ctx.displayPal[0]) || null;
  var pickTab = pickTabState
    || (stashAvailable && ownedThreads.length ? "stash" : (!palIsEmpty && suggestBase ? "suggested" : "all"));
  if (pickTab === "stash" && !stashAvailable) pickTab = "all";
  var suggested = React.useMemo(function() {
    if (!PT || !suggestBase || !suggestBase.lab) return [];
    return PT.nearestThreads(suggestBase.lab, catList, 12, ctx.cmap || {});
  }, [suggestBase && suggestBase.id, ctx.cmap, catList]);
  var allList = ctx.dmcFiltered || [];
  if (familyFilter) allList = allList.filter(function(d) { return familyOf[d.id] === familyFilter; });

  function threadRow(d) {
    // The palette is keyed by number, so a thread can't join a pattern that
    // already has that number in another brand (P4-5).
    var inPal = ctx.cmap && ctx.cmap[d.id];
    var clash = inPal && (inPal.brand || "dmc") !== (d.brand || "dmc");
    return h("button", {
      key: d.id, type: "button",
      className: "pal-pick-row" + (inPal ? " pal-pick-row--in" : ""),
      "aria-label": clash ? (formatThread(d) + ": this pattern already has " + threadLabel(inPal))
        : (inPal ? "In this pattern: " : "Add ") + formatThread(d),
      title: clash ? (threadLabel(inPal) + " already uses this number") : inPal ? "Already in this pattern" : "Add to this pattern",
      onClick: function() { if (!inPal) ctx.addScratchColour(d); }
    },
      h("span", {className: "pal-pick-row__swatch", style: {background: "rgb(" + d.rgb[0] + "," + d.rgb[1] + "," + d.rgb[2] + ")"}}),
      h("span", {className: "pal-pick-row__id"}, d.id),
      h("span", {className: "pal-pick-row__name"}, threadFullName(d.name)),
      h("span", {className: "pal-pick-row__mark", "aria-hidden": "true"}, inPal ? Icons.check() : Icons.plus())
    );
  }
  function threadList(list, emptyText) {
    return h("div", {className: "pal-pick-list"},
      list.slice(0, 60).map(threadRow),
      list.length === 0 && h("div", {className: "pal-pick-empty"}, emptyText)
    );
  }
  var tabs = [
    stashAvailable ? { id: "stash", label: "My stash" } : null,
    { id: "suggested", label: "Suggested" },
    { id: "all", label: "All " + brandName }
  ].filter(Boolean);
  var singlePicker = h(React.Fragment, null,
    h("div", {className: "pal-pick-tabs", role: "tablist", "aria-label": "Where to find a colour"},
      tabs.map(function(t) {
        return h("button", {
          key: t.id, type: "button", role: "tab",
          className: "pal-pick-tab" + (pickTab === t.id ? " pal-pick-tab--on" : ""),
          "aria-selected": pickTab === t.id ? "true" : "false",
          onClick: function() { setPickTab(t.id); }
        }, t.label);
      })
    ),
    pickTab === "stash" && threadList(ownedThreads, "No " + brandName + " threads in your stash yet. Add them in the Stash Manager."),
    pickTab === "suggested" && h(React.Fragment, null,
      suggestBase
        ? h("div", {className: "pal-pick-note"}, "Closest to " + formatThread(suggestBase))
        : null,
      threadList(suggested, "Select a colour in the pattern to see threads close to it.")
    ),
    pickTab === "all" && h(React.Fragment, null,
      h("input", {
        type:"text", "aria-label":"Search " + brandName + " palette", placeholder:"Search by " + brandName + " # or name\u2026",
        className: "pal-pick-search",
        value:ctx.dmcSearch, onChange:function(e){ctx.setDmcSearch(e.target.value);}
      }),
      PT && h("div", {className: "pal-pick-families", role: "group", "aria-label": "Colour family"},
        PT.FAMILIES.map(function(f) {
          var on = familyFilter === f.id;
          return h("button", {
            key: f.id, type: "button",
            className: "pal-pick-family" + (on ? " pal-pick-family--on" : ""),
            "aria-pressed": on ? "true" : "false",
            onClick: function() { setFamilyFilter(on ? null : f.id); }
          }, f.label);
        })
      ),
      threadList(allList, "No colours found")
    )
  );

  var coloursSection = !ctx.pat ? null : !pickerOpen
    ? h("div", {className: "pal-add"},
        h("button", {type: "button", className: "pal-add__btn", onClick: function() { ctx.setColPickerOpen(true); }},
          Icons.plus(), "Add colour"))
    : h("div", {className: "pal-picker", role: "region", "aria-label": "Add colour"},
      h("div", {className: "pal-picker__head"},
        h("span", {className: "pal-picker__title"}, "Add colour"),
        !palIsEmpty && h("button", {type: "button", className: "pal-row__btn", "aria-label": "Close", title: "Close",
          onClick: function() { ctx.setColPickerOpen(false); }}, Icons.x())
      ),
      ctx.isScratchMode && h("div", {style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:'var(--s-1)',marginBottom:'var(--s-2)',padding:"6px 8px",background:"var(--surface-tertiary)",borderRadius:'var(--radius-md)'}},
        [["1","Add colour",true],["2","Select chip",true],["3","Paint!",false]].map(function(item,i) {
          return h(React.Fragment, {key:i},
            h("div", {style:{display:"flex",alignItems:"center",gap:'var(--s-1)'}},
              h("span", {style:{width:16,height:16,borderRadius:"50%",background:"var(--accent)",color:"var(--surface)",fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}, item[0]),
              h("span", {style:{fontSize:10,color:"var(--text-secondary)",fontWeight:500,whiteSpace:"nowrap"}}, item[1])
            ),
            item[2] && h("span", {"aria-hidden":"true", style:{fontSize:10,color:"var(--text-tertiary)",display:"inline-flex"}}, window.Icons && window.Icons.chevronRight ? window.Icons.chevronRight() : null)
          );
        })
      ),
      // Toggle between single thread and blend mode
      h("div", {style:{display:"flex",gap:'var(--s-1)',marginBottom:'var(--s-2)'}},
        h("button", {
          type:"button", "aria-pressed":!blendMode, onClick:function(){ setBlendMode(false); },
          style:{flex:1,padding:"4px 8px",fontSize:'var(--text-xs)',fontWeight:blendMode?500:700,cursor:"pointer",
            border:blendMode?"1px solid var(--border)":"1px solid var(--accent)",borderRadius:'var(--radius-sm)',
            background:blendMode?"var(--surface)":"var(--accent-light)",color:blendMode?"var(--text-secondary)":"var(--accent)"}
        }, "Single thread"),
        h("button", {
          type:"button", "aria-pressed":blendMode, onClick:function(){ setBlendMode(true); },
          style:{flex:1,padding:"4px 8px",fontSize:'var(--text-xs)',fontWeight:blendMode?700:500,cursor:"pointer",
            border:blendMode?"1px solid var(--accent)":"1px solid var(--border)",borderRadius:'var(--radius-sm)',
            background:blendMode?"var(--accent-light)":"var(--surface)",color:blendMode?"var(--accent)":"var(--text-secondary)"}
        }, "Blend (2 threads)")
      ),
      !blendMode ? singlePicker : h(React.Fragment, null,
        // Blend mode UI: pick two threads
        h("div", {className:"blend-component-slots",style:{display:"flex",flexDirection:"column",gap:'var(--s-1)',marginBottom:6}},
          h("div", {style:{flex:1,padding:"4px 8px",borderRadius:'var(--radius-sm)',border:"1px solid var(--border)",fontSize:'var(--text-xs)',minHeight:24,display:"flex",alignItems:"center",gap:'var(--s-1)',background:blendThread1?"var(--accent-light)":"var(--surface)"}},
            blendThread1 ? h(React.Fragment, null,
              h("span", {style:{width:12,height:12,borderRadius:2,background:"rgb("+blendThread1.rgb+")",border:"1px solid var(--border)",flexShrink:0}}),
              h("span", {style:{fontWeight:600}}, "Thread 1: " + blendThread1.id + " " + blendThread1.name),
              h("button", {type:"button", "aria-label":"Remove thread 1", onClick:function(){setBlendThread1(null);}}, window.Icons.x())
            ) : h("span", {style:{color:"var(--text-tertiary)"}}, "Thread 1\u2026")
          ),
          h("span", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",fontWeight:600}}, "+"),
          h("div", {style:{flex:1,padding:"4px 8px",borderRadius:'var(--radius-sm)',border:"1px solid var(--border)",fontSize:'var(--text-xs)',minHeight:24,display:"flex",alignItems:"center",gap:'var(--s-1)',background:blendThread2?"var(--accent-light)":"var(--surface)"}},
            blendThread2 ? h(React.Fragment, null,
              h("span", {style:{width:12,height:12,borderRadius:2,background:"rgb("+blendThread2.rgb+")",border:"1px solid var(--border)",flexShrink:0}}),
              h("span", {style:{fontWeight:600}}, "Thread 2: " + blendThread2.id + " " + blendThread2.name),
              h("button", {type:"button", "aria-label":"Remove thread 2", onClick:function(){setBlendThread2(null);}}, window.Icons.x())
            ) : h("span", {style:{color:"var(--text-tertiary)"}}, "Thread 2\u2026")
          )
        ),
        blendPreview && h(window.BlendRecipePreview, {recipe:blendPreview, fabricColour:app.fabricColour, fabricCt:ctx.fabricCt}),
        blendPreview && dE2000(blendThread1.lab,blendThread2.lab)>20 && h("p",{className:"cs-toolsec__hint"},"These colours are far apart and may look speckled together. Automatic conversion uses closer partners; you can still add this recipe."),
        blendThread1 && blendThread2 && blendThread1.id !== blendThread2.id && h("button", {
          type:"button", onClick:addBlend,
          style:{width:"100%",padding:"6px 0",fontSize:'var(--text-sm)',fontWeight:600,cursor:"pointer",
            border:"1px solid var(--accent)",borderRadius:'var(--radius-sm)',background:"var(--accent-light)",color:"var(--accent)",marginBottom:'var(--s-2)'}
        }, existingBlend ? "Select existing blend" : "Add blend " + blendPreview.id),
        blendThread1 && blendThread2 && blendThread1.id === blendThread2.id && h("div", {style:{fontSize:'var(--text-xs)',color:"var(--danger)",marginBottom:'var(--s-2)'}}, "Pick two different threads"),
        h("input", {
          type:"text", "aria-label":"Search " + brandName + " threads", placeholder:"Search " + brandName + " threads\u2026",
          value:blendSearch, onChange:function(e){setBlendSearch(e.target.value);setBlendShown(60);},
          style:{width:"100%",padding:"6px 10px",border:"0.5px solid var(--border)",borderRadius:'var(--radius-md)',fontSize:'var(--text-sm)',marginBottom:'var(--s-2)',boxSizing:"border-box"}
        }),
        h("div", {style:{maxHeight:200,overflow:"auto",display:"flex",flexDirection:"column",gap:2}},
          blendFiltered.slice(0,blendShown).map(function(d) {
            var isSel1 = blendThread1 && blendThread1.id === d.id;
            var isSel2 = blendThread2 && blendThread2.id === d.id;
            return h("button", {
              type:"button", "aria-pressed":!!(isSel1||isSel2), "aria-label":"Choose " + brandName + " " + d.id + " " + d.name,
              key:d.id,
              onClick:function(){
                if (isSel1) setBlendThread1(null);
                else if (isSel2) setBlendThread2(null);
                else if (!blendThread1) {setBlendThread1(d);setBlendShown(60);}
                else if (!blendThread2 && d.id !== blendThread1.id) setBlendThread2(d);
              },
              style:{display:"flex",alignItems:"center",gap:'var(--s-2)',textAlign:"left",minHeight:40,padding:"4px 8px",borderRadius:'var(--radius-sm)',cursor:"pointer",
                background:(isSel1||isSel2)?"var(--accent-light)":"var(--surface)",
                border:(isSel1||isSel2)?"1px solid var(--accent-border)":"1px solid transparent",
                opacity:(isSel1||isSel2)?0.7:1,width:"100%"}
            },
              h("span", {style:{width:16,height:16,borderRadius:3,flexShrink:0,background:"rgb("+d.rgb[0]+","+d.rgb[1]+","+d.rgb[2]+")",border:"1px solid var(--border)"}}),
              h("span", {style:{fontFamily:"monospace",fontSize:'var(--text-sm)',fontWeight:600,minWidth:36,color:"var(--text-primary)"}}, d.id),
              h("span", {style:{fontSize:'var(--text-xs)',color:"var(--text-secondary)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}, d.name),
              (isSel1||isSel2) ? h("span", {style:{fontSize:10,color:"var(--accent)"}}, isSel1?"1":"2") : h("span", {style:{fontSize:10,color:"var(--text-tertiary)"}}, "+")
            );
          }),
          blendShown < blendFiltered.length && h("button",{type:"button",onClick:function(){setBlendShown(blendShown+60);}},"Show more threads ("+Math.min(blendShown,blendFiltered.length)+" of "+blendFiltered.length+")"),
          blendFiltered.length === 0 && h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-tertiary)",padding:"8px 0",textAlign:"center"}}, "No colours found")
        )
      )
    );

  // ── Fabric block ────────────────────────────────────────────────────────────
  // The fabric the pattern is stitched on (audit COMMON-08): count, colour,
  // finished and cut size. Saved with the pattern; the same block is in
  // Convert > Size (ConvertPanel.js), the Canvas tab and Edit > Project.
  function fabricBlock() {
    return h(window.CreatorFabricBlock, {
      fabricCt: ctx.fabricCt, setFabricCt: ctx.setFabricCt,
      fabricColour: app.fabricColour, setFabricColour: app.setFabricColour,
      sW: ctx.sW, sH: ctx.sH
    });
  }

  // ─── Edit panel tab bar (Polish 13 step 3) ─────────────────────────────
  // Convert has its own step tabs (creator/ConvertPanel.js); these are Edit's.
  // Tools and View are locked until a pattern exists.
  var mode = app.appMode || "edit";
  var hasPattern = !!(ctx.pat && ctx.pal);
  var editTabs = [
    {id:"palette",    label:"Palette",    icon:"palette"},
    {id:"tools",      label:"Tools",      icon:"pencil",
      disabled: !hasPattern,
      disabledHint:"Generate a pattern to unlock brush, lasso, magic wand, half-stitches, and backstitch."},
    {id:"view",       label:"View",       icon:"eye",
      disabled: !hasPattern,
      disabledHint:"Generate a pattern to unlock display options."},
    {id:"preview",    label:"Preview",    icon:"image"},
    {id:"project",    label:"Project",    icon:"folder"}
  ];
  var tabs = editTabs;
  // A stored tab Edit doesn't have (the old Convert ids "image",
  // "dimensions" or "settings") opens the first Edit tab that is available.
  var sTab = app.sidebarTab;
  var sTabMeta = tabs.find(function(t) { return t.id === sTab; });
  if (!sTabMeta || sTabMeta.disabled) {
    sTab = (tabs.find(function(t) { return !t.disabled; }) || tabs[0]).id;
  }

  var tabBar = h("div", {
    role:"tablist", "aria-label":"Edit mode panels",
    style:{display:"flex",background:"var(--surface)",flexDirection:"column"}
  },
    h("div", {"aria-hidden":"true", className:"rpanel-handle-wrap", style:{paddingTop:6,paddingBottom:2,display:"flex",justifyContent:"center"}},
      h("div", {className:"rpanel-handle-bar"})
    ),
    h("div", {className:"creator-sidebar-tabs", "data-onboard":"creator-sidebar-tabs"},
      tabs.map(function(t) {
        var isActive = sTab === t.id;
        var isDisabled = !!t.disabled;
        var iconFn = (window.Icons && window.Icons[t.icon]) ? window.Icons[t.icon] : null;
        return h("button", {
          key: t.id,
          role: "tab",
          className: "creator-sidebar-tab",
          "data-tab-id": t.id,
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
    // Under 900px the panel is a bottom drawer. Edit mode peeks its tab
    // strip; Convert and the Canvas tab get this Settings row instead, which
    // stays visible while the drawer is closed (hidden by CSS at 900px and
    // wider). Convert's step tabs are inside the open drawer.
    var drawerOpen = !!app.panelOpen;
    var drawerHeader = h("button", {
      type:"button", className:"rpanel-drawer-header",
      "aria-expanded": drawerOpen ? "true" : "false",
      onClick: function() { if (typeof app.setPanelOpen === "function") app.setPanelOpen(!drawerOpen); }
    },
      h("span", {className:"rpanel-handle-bar", "aria-hidden":"true"}),
      h("span", {className:"rpanel-drawer-header__row"},
        h("span", null, "Settings"),
        h("span", {className:"rpanel-drawer-header__chev", "aria-hidden":"true"},
          window.Icons && (drawerOpen ? window.Icons.chevronDown() : window.Icons.chevronUp()))
      )
    );

    // ── Canvas (audit COMMON-10): a design drawn from scratch has no picture
    //    to convert, so its first tab is the grid's size and fabric. Size
    //    changes go through Resize canvas, which keeps the stitches. ──
    if (app.sourceTab === "canvas") {
      var canvasPanel = h("div", {className:"creator-canvas-panel", style:{overflowY:"auto",flex:1,display:"flex",flexDirection:"column"}},
        h(Section, {title:"Size & fabric", defaultOpen:true},
          h("div", {style:{display:"grid",gridTemplateColumns:"auto 1fr",columnGap:12,rowGap:4,fontSize:'var(--text-sm)',padding:"6px 0 10px"}},
            h("span", {style:{color:"var(--text-tertiary)"}}, "Grid"),
            h("span", {style:{textAlign:"right",fontVariantNumeric:"tabular-nums"}}, ctx.sW + " \u00D7 " + ctx.sH + " stitches")
          ),
          h("button", {
            type:"button", className:"g-btn", style:{width:"100%",justifyContent:"center",marginBottom:'var(--s-3)'},
            onClick:function(){ if (app.openResizeCanvas) app.openResizeCanvas(); }
          }, window.Icons && window.Icons.canvasResize ? window.Icons.canvasResize() : null, "Resize canvas\u2026"),
          fabricBlock()
        ),
        // Tracing picture (audit DRAW-02): shown faintly under the grid,
        // never converted. Kept with the project as trace:<projectId>.
        h(Section, {title:"Tracing picture", defaultOpen:true},
          h("input", {type:"file", accept:"image/*", ref:traceInputRef, style:{display:"none"},
            "aria-label":"Choose a picture to trace",
            onChange:function(e){ var f = e.target.files && e.target.files[0]; e.target.value = "";
              if (f && app.setTracePicture) app.setTracePicture(f, typeof cv.overlayOpacity === "number" ? cv.overlayOpacity : 0.3); }}),
          (gen.img && gen.img.src)
            ? h("div", {className:"canvas-trace", style:{display:"flex",flexDirection:"column",gap:'var(--s-2)',padding:"6px 0"}},
                h("img", {src:gen.img.src, alt:"Tracing picture", style:{maxWidth:"100%",maxHeight:120,objectFit:"contain",borderRadius:'var(--radius-sm)',border:"1px solid var(--border)",alignSelf:"flex-start"}}),
                h("label", {style:{display:"flex",alignItems:"center",gap:6,fontSize:'var(--text-sm)',cursor:"pointer"}},
                  h("input", {type:"checkbox", checked:!!cv.showOverlay, onChange:function(e){ cv.setShowOverlay(e.target.checked); }}),
                  "Show under the grid"),
                h("label", {style:{display:"flex",flexDirection:"column",gap:4,fontSize:'var(--text-sm)'}},
                  h("span", null, "Opacity ", h("strong", null, Math.round((cv.overlayOpacity || 0) * 100) + "%")),
                  h("input", {type:"range", min:5, max:90, step:5, value:Math.round((cv.overlayOpacity || 0.3) * 100),
                    "aria-label":"Tracing picture opacity",
                    onChange:function(e){ cv.setOverlayOpacity(Number(e.target.value) / 100); }})),
                h("div", {style:{display:"flex",gap:'var(--s-2)'}},
                  h("button", {type:"button", className:"g-btn", onClick:function(){ traceInputRef.current && traceInputRef.current.click(); }}, "Change"),
                  h("button", {type:"button", className:"g-btn", onClick:function(){ if (app.removeTracePicture) app.removeTracePicture(); }}, "Remove"))
              )
            : h("div", {style:{padding:"6px 0",display:"flex",flexDirection:"column",gap:'var(--s-2)'}},
                h("p", {style:{margin:0,fontSize:'var(--text-xs)',color:"var(--text-tertiary)"}}, "Show a picture faintly under the grid to draw over. It isn\u2019t converted."),
                h("button", {type:"button", className:"g-btn", style:{alignSelf:"flex-start"}, onClick:function(){ traceInputRef.current && traceInputRef.current.click(); }},
                  window.Icons && window.Icons.image ? window.Icons.image() : null, "Add a tracing picture"))
        )
      );
      var canvasActions = h("div", {style:{flexShrink:0,borderTop:"1px solid var(--border)",padding:"12px",background:"var(--surface)"}},
        h("button", {
          type:"button", className:"g-btn primary", style:{width:"100%",justifyContent:"center",padding:"10px"},
          onClick:function(){ if (app.setAppMode) app.setAppMode("edit"); }
        }, window.Icons && window.Icons.pencil ? window.Icons.pencil() : null, "Back to drawing")
      );
      return h(React.Fragment, null,
        drawerHeader,
        canvasPanel,
        canvasActions
      );
    }

    // Convert: the step-by-step settings panel (creator/ConvertPanel.js).
    return h(window.CreatorConvertPanel, {drawerHeader: drawerHeader});
  }

  // ─── Project Info Section (shared between Create and Edit modes) ──────────
  // Name, designer, and description fields. Always-editable in both modes.
  var projectInfoSection = h(Section, {title:"Project info", defaultOpen:true},
    h("div", {style:{display:"flex",flexDirection:"column",gap:'var(--s-2)',padding:"4px 0 2px"}},
      h("label", {style:{display:"flex",flexDirection:"column",gap:3,fontSize:'var(--text-xs)',color:"var(--text-secondary)"}},
        "Pattern name",
        h("input", {
          type:"text", value: app.projectName || "", maxLength:60,
          placeholder: ctx.pat ? (ctx.sW + "\xD7" + ctx.sH + " pattern") : "e.g. Sunflower sampler",
          onChange: function(e) { var v = e.target.value.slice(0,60); if (typeof app.renameProject === "function") app.renameProject(v); else if (typeof app.setProjectName === "function") app.setProjectName(v); },
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
    ["backstitch",    "Backstitch"],
    ["knot",          "French knot"]
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
    h("div", {style:{display:"flex",alignItems:"center",gap:'var(--s-2)',marginBottom:'var(--s-2)'}},
      h("input", {type:"range", min:1, max:10, step:1, value:cv.brushSize||1,
        onChange:function(e){ cv.setBrushSize(parseInt(e.target.value,10)); },
        "aria-label":"Brush size",
        style:{flex:1}}),
      h("span", {style:{minWidth:40,textAlign:"right",fontSize:'var(--text-sm)',color:"var(--text-secondary)",fontVariantNumeric:"tabular-nums"}},
        (cv.brushSize||1) + "\xD7" + (cv.brushSize||1))
    ),
    h("div", {style:{display:"flex",flexWrap:"wrap",gap:3}},
      [1,2,3,5,7,10].map(function(sz) {
        var on = (cv.brushSize||1) === sz;
        return h("button", {
          key:sz,
          onClick:function(){ cv.setBrushSize(sz); },
          "aria-pressed": on ? "true" : "false",
          "aria-label": sz + " by " + sz + " brush",
          style:{
            minWidth:28,padding:"4px 8px",fontSize:'var(--text-sm)',fontWeight:on?600:400,
            border:"1px solid "+(on?"var(--accent)":"var(--border)"),
            background:on?"var(--accent-light)":"transparent",
            color:on?"var(--accent)":"var(--text-secondary)",
            borderRadius:'var(--radius-sm)',cursor:"pointer",fontFamily:"inherit"
          }
        }, sz);
      })
    ),
    h("div", {style:{fontSize:10,color:"var(--text-tertiary)",marginTop:6,lineHeight:1.4}},
      "Applies to Cross and Half stitches, the Erase tool and shapes.")
  );

  // Shapes and mirror drawing (audit DRAW-04)
  function pickShapeTool(tool) {
    if (cv.activeTool === tool) { cv.setActiveTool(null); return; }
    cv.setActiveTool(tool); ctx.setPartialStitchTool(null); cv.setBsStart(null);
    if (cv.cancelLasso) cv.cancelLasso();
    if (cv.setDrawMode && !cv.drawMode) cv.setDrawMode(true);
  }
  var shapeTools = [["line", "Line", window.Icons.shapeLine()], ["rect", "Rectangle", window.Icons.shapeRect()], ["ellipse", "Ellipse", window.Icons.shapeEllipse()], ["text", "Text", window.Icons.textTool()]];
  var shapesSection = h("div", {className:"cs-toolsec"},
    h("div", {className:"cs-toolsec__title"}, "Shapes"),
    h("div", {className:"cs-seltools", style:{gridTemplateColumns:"1fr 1fr"}},
      shapeTools.map(function(t) {
        var on = cv.activeTool === t[0];
        return h("button", {key:t[0], type:"button", className:"cs-seltools__btn" + (on ? " cs-seltools__btn--on" : ""),
          "aria-pressed": on ? "true" : "false", onClick:function(){ pickShapeTool(t[0]); },
          title: t[0] === "text" ? "Text: tap where it should start, then type" : t[1] + ": drag on the chart"}, t[2], h("span", null, t[1]));
      })
    ),
    h("div", {role:"radiogroup", "aria-label":"Rectangle and ellipse", className:"cs-seltools", style:{gridTemplateColumns:"1fr 1fr"}},
      [["outline", "Outline"], ["filled", "Filled"]].map(function(o) {
        var on = (o[0] === "filled") === !!cv.shapeFilled;
        return h("button", {key:o[0], type:"button", role:"radio", "aria-checked": on ? "true" : "false",
          className:"cs-seltools__btn" + (on ? " cs-seltools__btn--on" : ""),
          onClick:function(){ if (cv.setShapeFilled) cv.setShapeFilled(o[0] === "filled"); }}, o[1]);
      })
    ),
    h("label", {className:"cs-toolsec__check"},
      h("input", {type:"checkbox", checked: !!cv.lineSnap, onChange:function(e){ if (cv.setLineSnap) cv.setLineSnap(e.target.checked); }}),
      h("span", null, "Keep lines straight or at 45\u00B0")),
    h("div", {className:"cs-toolsec__hint"}, "Shapes stitch whole crosses in the selected colour, as wide as the brush.")
  );

  var mir = cv.mirror || { on: false, axis: "v" };
  function setMir(patch) { if (cv.setMirror) cv.setMirror(function(m) { return Object.assign({}, m, patch); }); }
  var mirrorSection = h("div", {className:"cs-toolsec"},
    h("div", {className:"cs-toolsec__title"}, "Mirror"),
    h("label", {className:"cs-toolsec__check"},
      h("input", {type:"checkbox", checked: !!mir.on, onChange:function(e){ setMir({ on: e.target.checked }); }}),
      h("span", null, "Mirror drawing")),
    h("div", {role:"radiogroup", "aria-label":"Mirror axis", className:"cs-seltools", style:{gridTemplateColumns:"1fr 1fr 1fr"}},
      [["v", "Left\u2013right"], ["h", "Top\u2013bottom"], ["both", "Both"]].map(function(o) {
        var on = mir.axis === o[0];
        return h("button", {key:o[0], type:"button", role:"radio", "aria-checked": on ? "true" : "false",
          className:"cs-seltools__btn" + (on ? " cs-seltools__btn--on" : ""),
          onClick:function(){ setMir({ axis: o[0], on: true }); }}, o[1]);
      })
    ),
    mir.on && h("button", {type:"button", className:"cs-seltools__btn", style:{marginTop:6},
      onClick:function(){ setMir({ ax: ctx.sW / 2, ay: ctx.sH / 2 }); }}, "Centre the axis"),
    h("div", {className:"cs-toolsec__hint"},
      "Paint, Erase, Fill, shapes and part stitches are copied across the dashed axis. Drag its handle at the chart's edge to move it.")
  );

  var lassoModes = [["freehand","Lasso"],["polygon","Polygon"],["magnetic","Magnetic"]];
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
    // Copy, paste, flip and rotate (audit DRAW-04)
    cv.clip && (function() {
      var clip = cv.clip, I = window.Icons;
      var canSel = !!cv.hasSelection || clip.floatActive;
      var acts = [
        ["Copy", "Copy (Ctrl+C)", I.copy(), canSel, function(){ clip.copy(); }],
        ["Cut", "Cut (Ctrl+X)", I.scissors(), canSel, function(){ clip.cut(); }],
        ["Paste", "Paste, then drag it into place (Ctrl+V)", I.clipboard(), clip.hasClipboard, function(){ clip.paste(); }],
        ["Duplicate", "Duplicate (Ctrl+D)", I.duplicate(), canSel, function(){ clip.duplicate(); }],
        ["Flip horizontally", "Flip left to right (Shift+H)", I.flipHorizontal(), canSel, function(){ clip.transform("flipH"); }],
        ["Flip vertically", "Flip upside down (Shift+V)", I.flipVertical(), canSel, function(){ clip.transform("flipV"); }],
        ["Rotate left", "Rotate anticlockwise (,)", I.rotateCcw(), canSel, function(){ clip.transform("rotCCW"); }],
        ["Rotate right", "Rotate clockwise (.)", I.rotateCw(), canSel, function(){ clip.transform("rotCW"); }]
      ];
      return h("div", {className:"cs-seltools", role:"group", "aria-label":"Selection actions"},
        acts.map(function(a, i) {
          return h("button", {
            key:i, type:"button", className:"cs-seltools__btn", disabled:!a[3],
            title:a[1], onClick:a[4]
          }, a[2], h("span", null, a[0]));
        }),
        clip.floatActive && h("div", {className:"cs-seltools__float"},
          h("span", null, "Drag the selection to move it."),
          h("button", {type:"button", className:"cs-seltools__btn", onClick:function(){ clip.cancel(); }}, "Cancel"),
          h("button", {type:"button", className:"cs-seltools__btn cs-seltools__btn--primary", onClick:function(){ clip.commit(); }}, I.check(), h("span", null, "Done")))
      );
    })(),
    cv.hasSelection && h("button", {
      onClick:function(){ if (cv.deleteSelection) cv.deleteSelection(); },
      title:"Delete the stitches in the selection (Delete)",
      style:{
        marginTop:'var(--s-2)',width:"100%",padding:"6px 8px",fontSize:'var(--text-xs)',
        display:"flex",alignItems:"center",justifyContent:"center",gap:'var(--s-1)',
        border:"1px solid var(--danger)",borderRadius:'var(--radius-sm)',
        background:"var(--danger-soft)",color:"var(--danger)",
        cursor:"pointer",fontFamily:"inherit"
      }
    }, window.Icons && window.Icons.trash ? window.Icons.trash() : null, "Delete selected stitches"),
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

  var correctSection = h("div", {style:{padding:"0 12px 12px",borderTop:"1px solid var(--border)",paddingTop:12}},
    h("div", {style:{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:'var(--s-2)'}},
      "Correct"),
    h("div", {style:{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}},
      h("button", {
        onClick:function(){
          if (cv.activeTool==="cleanup") { if (cv.exitCleanup) cv.exitCleanup(); }
          else { cv.setBsStart(null); ctx.setPartialStitchTool(null); if (cv.cancelLasso) cv.cancelLasso(); if (cv.enterCleanup) cv.enterCleanup(); }
        },
        "aria-pressed": cv.activeTool==="cleanup" ? "true" : "false",
        style:{
          flex:1,padding:"6px 8px",fontSize:'var(--text-sm)',
          fontWeight:cv.activeTool==="cleanup"?600:400,
          border:"1px solid "+(cv.activeTool==="cleanup"?"var(--accent)":"var(--border)"),
          background:cv.activeTool==="cleanup"?"var(--accent-light)":"transparent",
          color:cv.activeTool==="cleanup"?"var(--accent)":"var(--text-secondary)",
          borderRadius:'var(--radius-sm)',cursor:"pointer",fontFamily:"inherit"
        }
      }, "Fix outline colours"),
      h("button", {
        onClick:function(){
          if (cv.activeTool==="denoise") { if (cv.exitDenoise) cv.exitDenoise(); }
          else { cv.setBsStart(null); ctx.setPartialStitchTool(null); if (cv.cancelLasso) cv.cancelLasso(); if (cv.enterDenoise) cv.enterDenoise(); }
        },
        "aria-pressed": cv.activeTool==="denoise" ? "true" : "false",
        style:{
          flex:1,padding:"6px 8px",fontSize:'var(--text-sm)',
          fontWeight:cv.activeTool==="denoise"?600:400,
          border:"1px solid "+(cv.activeTool==="denoise"?"var(--accent)":"var(--border)"),
          background:cv.activeTool==="denoise"?"var(--accent-light)":"transparent",
          color:cv.activeTool==="denoise"?"var(--accent)":"var(--text-secondary)",
          borderRadius:'var(--radius-sm)',cursor:"pointer",fontFamily:"inherit"
        }
      }, "Reduce confetti")
    ),
    h("button", {
      onClick:function(){ if (app&&app.openResizeCanvas) app.openResizeCanvas(); },
      style:{
        width:"100%",padding:"6px 8px",fontSize:'var(--text-sm)',
        border:"1px solid var(--border)",borderRadius:'var(--radius-sm)',
        background:"transparent",color:"var(--text-secondary)",
        cursor:"pointer",fontFamily:"inherit",textAlign:"left"
      }
    }, "Resize canvas\u2026"),
    // Trims rows and columns with nothing on them from the chart's edges:
    // one undo step that keeps progress, backstitches and knots
    // (creator-main.js cropToStitches).
    app.cropToStitches && h("button", {
      type:"button", className:"cs-seltools__btn", style:{width:"100%",marginTop:6},
      onClick:function(){ app.cropToStitches(); },
      title:"Remove empty rows and columns around the stitches"
    }, window.Icons.crop(), h("span", null, "Crop to the stitches"))
  );

  // Navigate | Draw (audit DRAW-01). On touch it is the first control in the
  // tool strip instead, so it isn't repeated here.
  var coarseTools = !!(window.Platform && window.Platform.isCoarsePointer && window.Platform.isCoarsePointer());
  var modeSection = (!coarseTools && window.ModeToggle) ? h("div", {style:{padding:"12px 12px 0"}},
    h("div", {style:{fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5,marginBottom:'var(--s-2)'}},
      "Chart mode"),
    h(window.ModeToggle, {
      className: "mode-toggle--block",
      ariaLabel: "Chart mode",
      value: cv.drawMode ? "draw" : "navigate",
      onChange: function (v) { cv.setDrawMode(v === "draw"); },
      options: [
        { value: "navigate", label: "Navigate", icon: window.Icons.hand(), title: "Navigate: drag to move around the chart (H)" },
        { value: "draw", label: "Draw", icon: window.Icons.pencil ? window.Icons.pencil() : null, title: "Draw: clicks change the chart (H)" }
      ]
    })
  ) : null;
  var toolsContent = h(React.Fragment, null,
    modeSection,
    stitchTypeSection,
    bsContSection,
    brushSizeSection,
    shapesSection,
    mirrorSection,
    selectionSection,
    correctSection
  );

  var subHeaderStyle = {padding:"10px 12px 2px",fontSize:'var(--text-xs)',fontWeight:600,color:"var(--text-tertiary)",textTransform:"uppercase",letterSpacing:0.5};
  var viewContent = h(React.Fragment, null,
    h("div", {style:subHeaderStyle}, "View"),
    viewToggle,
    highlightControls
  );

  var displayContent = h(React.Fragment, null,
    h("div", {style:subHeaderStyle}, "View"),
    viewToggle,
    highlightControls,
    h("div", {style:{borderTop:"0.5px solid var(--border)",margin:"8px 0 0"}}),
    h("div", {style:subHeaderStyle}, "Preview"),
    previewPanel
  );

  var moreContent = h(React.Fragment, null,
    h(Section, {title:"Project Info",defaultOpen:false},
      h("div", {style:{fontSize:'var(--text-xs)',color:"var(--text-secondary)",padding:"4px 0"}},
        ctx.sW + " \xD7 " + ctx.sH + " stitches \u00B7 " + window.threadCountsShort(window.creatorThreadCounts(ctx.displayPal||ctx.pal))
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
    return h('aside', { className: 'cs-sidebar-fade', style: { padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 } },
      h('div', { style: { fontSize:'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: 0.4 } }, 'Project at a glance'),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 4, fontSize:'var(--text-sm)' } },
        h('span', { style: { color: 'var(--text-tertiary)' } }, 'Size'),
        h('span', null, ctx.sW + ' \u00D7 ' + ctx.sH + ' stitches'),
        h('span', { style: { color: 'var(--text-tertiary)' } }, 'Threads'),
        h('span', null, window.threadCountsShort(window.creatorThreadCounts(ctx.displayPal || ctx.pal))),
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
    // "Back to Convert" link — shown in edit mode when a source image exists.
    // Fires the back-to-convert request (may show warning modal if edits exist).
    gen.img && app.sourceTab !== "canvas" && h("div", {className:"rpanel-back-to-convert", style:{
      flexShrink:0, padding:"6px 12px",
      borderBottom:"1px solid var(--line)",
      background:"var(--surface-secondary)"
    }},
      h("button", {
        type:"button",
        onClick:function(){
          if(app.requestBackToConvert) app.requestBackToConvert();
          else if(app.setAppMode) app.setAppMode("create");
        },
        style:{
          display:"inline-flex",alignItems:"center",gap:4,
          background:"none",border:"none",cursor:"pointer",
          padding:"3px 0",fontSize:"var(--text-xs)",
          color:"var(--text-secondary)",fontFamily:"inherit"
        }
      },
        window.Icons && window.Icons.chevronLeft ? window.Icons.chevronLeft() : null,
        "Back to Convert"
      )
    ),
    tabBar,
    h("div", {style:{overflowY:"auto",flex:1}},
      sTab === "palette" && h(React.Fragment, null,
        palChipsSection,
        coloursSection,
        // Recolouring the chart: shift every colour, apply a preset palette,
        // or go back to the generated palette. These change the chart, so they
        // live here rather than in Convert.
        cv.paletteSwap && (cv.paletteSwap.shiftSection || cv.paletteSwap.presetSection) && h("div", {className:"cs-toolsec cv-recolour"},
          h("div", {className:"cs-toolsec__title"}, "Recolour the chart"),
          cv.paletteSwap.shiftSection,
          cv.paletteSwap.presetSection,
          cv.paletteSwap.revertSection
        )
      ),
      sTab === "tools" && toolsContent,
      sTab === "view" && viewContent,
      sTab === "preview" && previewPanel,
      sTab === "project" && h(React.Fragment, null,
        projectInfoSection,
        // Fabric can change after the pattern is made (audit COMMON-08).
        h(Section, {title:"Fabric", defaultOpen:true}, h("div", {style:{padding:"4px 0 2px"}}, fabricBlock()))
      ),
      sTab === "more" && moreContent
    ),
    editActions
  );
};
