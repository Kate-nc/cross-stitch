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
      var isSelected = cv.selectedColorId === p.id;
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
        if (cv.chooseThread) cv.chooseThread(p.id);
        else cv.setSelectedColorId(p.id);
      }
      var withTip = function(tipText, el) {
        return typeof Tooltip !== "undefined" ? h(Tooltip, { text: tipText, width: 170 }, el) : el;
      };
      return h("div", {
        key: p.id,
        role: "button",
        tabIndex: 0,
        "aria-pressed": isSelected,
        "aria-label": (window.PaletteTools ? window.PaletteTools.swatchLabel(p) : threadLabel(p)) + (keyRow && keyRow.usageTitle ? ". " + keyRow.usageTitle : ""),
        title: keyRow ? keyRow.title : undefined,
        className: "pal-row" + (isSelected ? " pal-row--selected" : "") + (ihs ? " pal-row--hi" : "") + (isUnused ? " pal-row--unused" : ""),
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
          "aria-label": "Stash status: " + stashStatus
        }),
        app.appMode === "edit" && withTip(ihs ? "Stop showing on chart" : "Show on chart", h("button", {
          type: "button",
          className: "pal-row__btn pal-row__btn--hi" + (ihs ? " pal-row__btn--on" : ""),
          title: ihs ? "Stop showing on chart" : "Show on chart",
          "aria-label": "Show on chart \u2014 " + formatThread(p),
          "aria-pressed": ihs ? "true" : "false",
          onClick: function(e) {
            e.stopPropagation();
            cv.setHiId(cv.hiId === p.id ? null : p.id);
          }
        }, Icons.eye ? Icons.eye() : null)),
        app.appMode === "edit" && withTip("Change symbol", h("button", {
          type: "button",
          className: "pal-row__btn",
          title: "Change symbol",
          "aria-label": "Change symbol for " + formatThread(p),
          "aria-expanded": symbolPickerFor === p.id ? "true" : "false",
          onClick: function(e) { e.stopPropagation(); setSymbolPickerFor(symbolPickerFor === p.id ? null : p.id); }
        }, Icons.symbols ? Icons.symbols() : null)),
        // Colour swap button
        app.appMode === "edit" && withTip("Replace colour", h("button", {
          key: "swap-" + p.id,
          type: "button",
          className: "pal-row__btn pal-chip-swap",
          title: "Replace " + (keyRow ? keyRow.label : threadLabel(p)) + " with another colour",
          "aria-label": "Replace " + (keyRow ? keyRow.label : threadLabel(p)) + " with another colour",
          onClick: function(e) {
            e.stopPropagation();
            cv.setColourReplaceModal({ srcId: p.id, srcName: p.name || p.id, srcRgb: p.rgb });
          }
        }, typeof Icons !== 'undefined' && Icons.colourSwap ? Icons.colourSwap() : null)),
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
    return h("div", {className:"pal-sec"},
      h("div", {
        className:"pal-sec__head",
        onClick:function(){setPalChipsOpen(function(o){return !o;});}
      },
        h("div", {className:"pal-sec__lead"},
          h("span", {"aria-hidden":"true", className:"pal-sec__chev" + (palChipsOpen ? " pal-sec__chev--open" : "")}, Icons.chevronRight()),
          h("span", {className:"pal-sec__title"}, "In this pattern"),
          app.appMode === "edit" && typeof InfoIcon !== "undefined" && h(InfoIcon, {
            label: "Palette",
            width: 260,
            text: "Use Change symbol beside a thread to choose a different chart symbol. Strands and skeins are for each symbol on its own; Materials adds up the threads that several symbols share."
          })
        ),
        h("div", {className:"pal-sec__actions"},
          app.appMode === "edit" && unusedCount > 0 && h("button", {
            type: "button", className: "sb-mini-btn",
            onClick: function(e) { e.stopPropagation(); if (typeof ctx.removeUnusedColours === 'function') ctx.removeUnusedColours(); },
            title: "Remove all colours not used in the pattern"
          }, "Remove unused (" + unusedCount + ")"),
          app.appMode === "edit" && ctx.pal && ctx.pal.length > 1 && h("button", {
            type: "button", className: "sb-mini-btn",
            onClick: function(e) {
              e.stopPropagation();
              cv.setActiveTool("magicWand");
              ctx.setPartialStitchTool && ctx.setPartialStitchTool(null);
              cv.setBsStart && cv.setBsStart(null);
              cv.selectAll();
              cv.setWandPanel("reduce");
            },
            title: "Select all stitches and open Simplify colours to merge similar colours"
          }, "Simplify colours\u2026"),
          window.creatorThreadCounts(displayPal).threads > 0 && h("span", {className:"palette-counts", title:"Threads used in stitches"}, window.threadCountsShort(window.creatorThreadCounts(displayPal))),
          symbolLimitMsg && h("span", {
            className: "palette-counts-warn", role: "img",
            title: symbolLimitMsg,
            "aria-label": symbolLimitMsg
          }, Icons.warning())
        )
      ),
      palChipsOpen && h("div", {className:"pal-sec__body"},
      window.BlendHelpNote && window.creatorThreadCounts(displayPal).blends > 0 && h(window.BlendHelpNote, null),
      // Brief D — stash filter toggle + "Need to buy" button (only when stash has data)
      stashHas && h("div", {className:"pal-stash-filter"},
        h("label", {className:"pal-stash-filter__label"},
          h("input", {
            type:"checkbox",
            checked: !!ctx.creatorStashFilter,
            onChange: function(e) { if (typeof ctx.setCreatorStashFilter === 'function') ctx.setCreatorStashFilter(e.target.checked); }
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
        className: "pal-unowned"
      },
        h("div", {className:"pal-unowned__head"},
          typeof Icons !== 'undefined' && Icons.warning ? Icons.warning() : null,
          h("span", null,
            unownedKeys.length + " unowned thread" + (unownedKeys.length !== 1 ? "s" : "") + " still in this pattern"
          )
        ),
        h("div", {className:"pal-unowned__text"},
          "The filter only hides chips \u2014 it does not change the pattern. Substitute or buy these threads to be truly stash-ready."
        ),
        h("div", {className:"pal-unowned__actions"},
          h("button", {
            type: "button", className: "pal-unowned__btn",
            onClick: function() {
              if (typeof ctx.setAdaptModalMode === 'function') ctx.setAdaptModalMode('stash');
              if (typeof ctx.setAdaptModalOpen === 'function') ctx.setAdaptModalOpen(true);
            }
          }, "Adapt to my stash"),
          h("button", {
            type: "button", className: "pal-unowned__btn pal-unowned__btn--strong",
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
            }
          }, "Add to shopping list")
        )
      ),
      // Brief D — banner when filter hides chips (kept as a quieter follow-up
      // line for users who still need the "turn off the filter" hint).
      ctx.creatorStashFilter && stashHas && hiddenByFilter > 0 && unownedKeys.length === 0 && h("div", {className:"pal-filter-note"}, hiddenByFilter + " unowned colour" + (hiddenByFilter !== 1 ? "s" : "") + " hidden \u2014 turn off the filter to see all."),
      ctx.creatorStashFilter && !stashHas && h("div", {className:"pal-filter-note pal-filter-note--danger"}, "Your stash is empty \u2014 turn off this filter, or add threads in the Stash Manager."),
      isPaintMode && h("div", {className:"pal-paint-hint" + (selInfo ? " pal-paint-hint--chosen" : "")},
        selInfo
          ? h(React.Fragment, null,
              h("span", {className:"pal-paint-hint__swatch", style:{background:"rgb("+selInfo.rgb+")"}}),
              h("span", {className:"pal-paint-hint__id", title: formatThread(selInfo, {variant:"title"})}, formatThread(selInfo, {variant:"short"})),
              h("span", {className:"pal-paint-hint__name"}, formatThread(selInfo, {variant:"name"})),
              h("button", {
                type:"button", className:"pal-paint-hint__clear",
                onClick:function(){cv.setSelectedColorId(null);},
                title:"Clear selection", "aria-label":"Clear selection"
              }, Icons.x())
            )
          : h(React.Fragment, null,
              h("span", {className:"pal-paint-hint__icon", "aria-hidden":"true"}, Icons.pointing()),
              h("span", {className:"pal-paint-hint__text"}, (window.Platform && window.Platform.isCoarsePointer && window.Platform.isCoarsePointer())
                ? "Select a colour to paint \u2014 or long-press a stitch"
                : "Select a colour to paint \u2014 or right-click the canvas")
            )
      ),
      displayPal.length > 0
        ? h("div", {className:"creator-pattern-chips pal-rows", role:"list"}, chips)
        : h("div", {className:"pal-pick-empty"}, "No colours yet"),
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
      ctx.isScratchMode && h("div", {className:"pal-steps"},
        [["1","Add colour",true],["2","Select chip",true],["3","Paint!",false]].map(function(item,i) {
          return h(React.Fragment, {key:i},
            h("div", {className:"pal-steps__item"},
              h("span", {className:"pal-steps__num"}, item[0]),
              h("span", {className:"pal-steps__label"}, item[1])
            ),
            item[2] && h("span", {"aria-hidden":"true", className:"pal-steps__sep"}, window.Icons && window.Icons.chevronRight ? window.Icons.chevronRight() : null)
          );
        })
      ),
      // Toggle between single thread and blend mode
      h("div", {className:"cs-seltools sb-pair"},
        h("button", {
          type:"button", "aria-pressed":!blendMode, onClick:function(){ setBlendMode(false); },
          className:"cs-seltools__btn" + (!blendMode ? " cs-seltools__btn--on" : "")
        }, "Single thread"),
        h("button", {
          type:"button", "aria-pressed":blendMode, onClick:function(){ setBlendMode(true); },
          className:"cs-seltools__btn" + (blendMode ? " cs-seltools__btn--on" : "")
        }, "Blend (2 threads)")
      ),
      !blendMode ? singlePicker : h(React.Fragment, null,
        // Blend mode UI: pick two threads
        h("div", {className:"blend-component-slots"},
          [[blendThread1, setBlendThread1, 1], [blendThread2, setBlendThread2, 2]].map(function(slot, i) {
            var t = slot[0];
            return h(React.Fragment, {key:slot[2]},
              i > 0 && h("span", {className:"blend-slot__plus"}, "+"),
              h("div", {className:"blend-slot" + (t ? " blend-slot--filled" : "")},
                t ? h(React.Fragment, null,
                  h("span", {className:"blend-slot__swatch", style:{background:"rgb("+t.rgb+")"}}),
                  h("span", {className:"blend-slot__name"}, "Thread " + slot[2] + ": " + formatThread(Object.assign({},t,{brand:patBrand}))),
                  h("button", {type:"button", "aria-label":"Remove thread " + slot[2], onClick:function(){slot[1](null);}}, window.Icons.x())
                ) : h("span", {className:"blend-slot__empty"}, "Thread " + slot[2] + "\u2026")
              ));
          })
        ),
        blendPreview && h(window.BlendRecipePreview, {recipe:blendPreview, fabricColour:app.fabricColour, fabricCt:ctx.fabricCt}),
        blendPreview && dE2000(blendThread1.lab,blendThread2.lab)>20 && h("p",{className:"cs-toolsec__hint"},"These colours are far apart and may look speckled together. Automatic conversion uses closer partners; you can still add this recipe."),
        blendThread1 && blendThread2 && blendThread1.id !== blendThread2.id && h("button", {
          type:"button", onClick:addBlend,
          className:"cs-seltools__btn cs-seltools__btn--on sb-block-btn"
        }, existingBlend ? "Select existing blend" : "Add blend " + blendPreview.id),
        blendThread1 && blendThread2 && blendThread1.id === blendThread2.id && h("div", {className:"sb-error", role:"alert"}, "Pick two different threads"),
        h("input", {
          type:"text", "aria-label":"Search " + brandName + " threads", placeholder:"Search " + brandName + " threads\u2026",
          className:"pal-pick-search",
          value:blendSearch, onChange:function(e){setBlendSearch(e.target.value);setBlendShown(60);}
        }),
        h("div", {className:"pal-pick-list blend-pick-list"},
          blendFiltered.slice(0,blendShown).map(function(d) {
            var isSel1 = blendThread1 && blendThread1.id === d.id;
            var isSel2 = blendThread2 && blendThread2.id === d.id;
            return h("button", {
              type:"button", "aria-pressed":!!(isSel1||isSel2), "aria-label":"Choose " + formatThread(Object.assign({},d,{brand:patBrand})),
              key:d.id,
              onClick:function(){
                if (isSel1) setBlendThread1(null);
                else if (isSel2) setBlendThread2(null);
                else if (!blendThread1) {setBlendThread1(d);setBlendShown(60);}
                else if (!blendThread2 && d.id !== blendThread1.id) setBlendThread2(d);
              },
              className:"pal-pick-row" + ((isSel1||isSel2) ? " pal-pick-row--in" : "")
            },
              h("span", {className:"pal-pick-row__swatch", style:{background:"rgb("+d.rgb[0]+","+d.rgb[1]+","+d.rgb[2]+")"}}),
              h("span", {className:"pal-pick-row__id"}, d.id),
              h("span", {className:"pal-pick-row__name"}, formatThread(Object.assign({},d,{brand:patBrand}),{variant:"name"})),
              h("span", {className:"pal-pick-row__mark", "aria-hidden":"true"}, (isSel1||isSel2) ? (isSel1?"1":"2") : Icons.plus())
            );
          }),
          blendShown < blendFiltered.length && h("button",{type:"button",className:"cv-link sb-more-link",onClick:function(){setBlendShown(blendShown+60);}},"Show more threads ("+Math.min(blendShown,blendFiltered.length)+" of "+blendFiltered.length+")"),
          blendFiltered.length === 0 && h("div", {className:"pal-pick-empty"}, "No colours found")
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
  // Tool-rail layout (creator.desktopRail, Stage 2): the rail and the
  // options bar hold what was in Tools, so the tabs are Palette, View (with
  // Preview in it) and Project.
  var railLayout = !!app.desktopRail && !app.compact;
  if (railLayout) {
    editTabs = [
      {id:"palette", label:"Palette", icon:"palette"},
      {id:"view",    label:"View",    icon:"eye",
        disabled: !hasPattern,
        disabledHint:"Generate a pattern to unlock display options."},
      {id:"project", label:"Project", icon:"folder"}
    ];
  }
  var tabs = editTabs;
  // A stored tab Edit doesn't have (the old Convert ids "image",
  // "dimensions" or "settings") opens the first Edit tab that is available.
  var sTab = app.sidebarTab;
  if (railLayout && sTab === "preview") sTab = "view";
  var sTabMeta = tabs.find(function(t) { return t.id === sTab; });
  if (!sTabMeta || sTabMeta.disabled) {
    sTab = (tabs.find(function(t) { return !t.disabled; }) || tabs[0]).id;
  }

  var tabBar = h("div", {role:"tablist", "aria-label":"Edit mode panels", className:"creator-sidebar-tablist"},
    h("div", {"aria-hidden":"true", className:"rpanel-handle-wrap"},
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

  // Convert's building blocks (creator/ConvertPanel.js), so the two panels
  // read the same. ConvertPanel.js is later in the bundle; these run at render.
  var P = window.CreatorPanelParts;

  // ─── View toggle (shared between View tab content in both modes) ─────────
  var viewToggle = (ctx.pat && ctx.pal) ? h("div", {className:"cs-toolsec sb-viewrow"},
    h("span", {className:"cs-toolsec__title sb-viewrow__label", id:"sb-view-label"}, "View"),
    P.seg({label:"View", className:"sb-viewrow__seg", value:cv.view, onChange:function(id){ cv.setView(id); },
      options:[["color","Colour"],["symbol","Symbol"],["both","Both"]].map(function(kl){ return {id:kl[0], label:kl[1], title:"Cycle view (V)"}; })})
  ) : null;

  // ─── Highlight mode controls (shared between Edit and Track View tabs) ──
  function dimSlider(value, set) {
    return h("label", {className:"sb-slider-row"},
      h("span", {className:"sb-slider-row__label"}, "Dim strength"),
      h("input", {type:"range",min:0,max:1,step:0.05,value:value,
        onChange:function(e){set(parseFloat(e.target.value));}}));
  }
  var highlightControls = cv.hiId ? h("div", {className:"cs-toolsec"},
    h("div", {className:"cs-toolsec__title"}, "Highlight Mode"),
    P.seg({label:"Highlight mode", className:"cv-seg--sub", value:cv.highlightMode, onChange:function(id){ cv.setHighlightMode(id); },
      options:[["isolate","Isolate"],["outline","Outline"],["tint","Tint"],["spotlight","Spotlight"]].map(function(kl){ return {id:kl[0], label:kl[1]}; })}),
    cv.highlightMode === "isolate" && dimSlider(cv.bgDimOpacity, cv.setBgDimOpacity),
    cv.highlightMode === "tint" && h("div", {className:"sb-slider-row"},
      h("label", {className:"sb-slider-row__label", htmlFor:"sb-tint-colour"}, "Tint"),
      h("input", {id:"sb-tint-colour", type:"color", className:"sb-colour-input", value:cv.tintColor, onChange:function(e){cv.setTintColor(e.target.value);}}),
      h("input", {type:"range",min:0,max:1,step:0.05,value:cv.tintOpacity, "aria-label":"Tint strength",
        onChange:function(e){cv.setTintOpacity(parseFloat(e.target.value));}})
    ),
    cv.highlightMode === "spotlight" && dimSlider(cv.spotDimOpacity, cv.setSpotDimOpacity)
  ) : null;

  // ─── Preview panel (shared between Create and Edit) ──────────────────────
  var isRealistic = app.previewMode === "realistic";
  var chartModeNow = !app.previewActive ? "chart" : app.previewMode;
  var coverageNow = app.coverageOverride;
  var previewPanel = h("div", {className:"cs-toolsec sb-preview"},
    h("div", {className:"cs-toolsec__title"}, "Chart Mode"),
    P.seg({label:"Chart mode", value:chartModeNow, onChange:function(id){
        if (id === "chart") { app.setPreviewActive(false); }
        else { app.setPreviewActive(true); app.setPreviewMode(id); }
      },
      options:[{id:"chart",label:"Chart"},{id:"pixel",label:"Pixel"},{id:"realistic",label:"Realistic"}]}),
    isRealistic && app.previewActive && h(React.Fragment, null,
      h("div", {className:"cs-toolsec__title sb-subtitle"}, "Quality Level"),
      P.seg({label:"Quality level", className:"cv-seg--sub", value:app.realisticLevel, onChange:function(id){ app.setRealisticLevel(id); },
        options:[1,2,3,4].map(function(lv){ return {id:lv, label:"Level " + lv}; })})
    ),
    h("div", {className:"sb-slider-row"},
      h("label", {className:"sb-slider-row__label", htmlFor:"sb-coverage"}, "Coverage"),
      h("input", {id:"sb-coverage", type:"range",min:0,max:1,step:0.05,
        value:coverageNow!=null?coverageNow:0.5,
        onChange:function(e){app.setCoverageOverride(parseFloat(e.target.value));}
      }),
      coverageNow!=null && h("button", {type:"button", className:"cs-seltools__btn sb-auto-btn",
        title:"Let the fabric count set the coverage",
        onClick:function(){app.setCoverageOverride(null);}
      }, Icons.refresh(), h("span", null, "Auto"))
    ),
    P.seg({label:"Coverage preset", className:"cv-seg--sub",
      value:(function(){ if (coverageNow == null) return null; var hit = [0.25,0.5,0.8,0.95].filter(function(v){ return Math.abs(coverageNow - v) < 0.03; }); return hit.length ? hit[0] : null; })(),
      onChange:function(id){ app.setCoverageOverride(id); },
      options:[["Sparse",0.25],["Standard",0.50],["Dense",0.80],["Full",0.95]].map(function(p){ return {id:p[1], label:p[0]}; })}),
    h("label", {className:"cs-toolsec__check"},
      h("input", {type:"checkbox",checked:app.previewShowGrid,onChange:function(){app.setPreviewShowGrid(!app.previewShowGrid);}}),
      h("span", null, "Grid overlay")
    ),
    h("label", {className:"cs-toolsec__check"},
      h("input", {type:"checkbox",checked:app.previewFabricBg,onChange:function(){app.setPreviewFabricBg(!app.previewFabricBg);}}),
      h("span", null, "Fabric background")
    ),
    // ── Split / compare view (moved here from the top toolbar) ──────────
    (ctx.pat && ctx.pal) && h("div", {className:"sb-compare"},
      h("div", {className:"cs-toolsec__title"}, "Compare"),
      h("button", {
        type:"button",
        onClick:function(){
          var next = !app.splitPaneEnabled;
          app.setSplitPaneEnabled(next);
          if (typeof window.UserPrefs !== "undefined") window.UserPrefs.set("splitPaneEnabled", next);
        },
        "aria-pressed": app.splitPaneEnabled ? "true" : "false",
        title: app.splitPaneEnabled ? "Exit compare view (\\)" : "Compare chart vs realistic preview (\\)",
        className:"cs-seltools__btn sb-block-btn" + (app.splitPaneEnabled ? " cs-seltools__btn--on" : "")
      },
        Icons.splitView(),
        app.splitPaneEnabled ? "Exit compare" : "Compare side-by-side"
      ),
      h("p", {className:"cs-toolsec__hint"},
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
      var canvasPanel = h("div", {className:"creator-canvas-panel"},
        h(Section, {title:"Size & fabric", defaultOpen:true},
          h("div", {className:"sb-facts"},
            h("span", {className:"sb-facts__k"}, "Grid"),
            h("span", {className:"sb-facts__v"}, ctx.sW + " \u00D7 " + ctx.sH + " stitches")
          ),
          h("button", {
            type:"button", className:"g-btn sb-block-btn",
            onClick:function(){ if (app.openResizeCanvas) app.openResizeCanvas(); }
          }, window.Icons && window.Icons.canvasResize ? window.Icons.canvasResize() : null, "Resize canvas\u2026"),
          fabricBlock()
        ),
        // Tracing picture (audit DRAW-02): shown faintly under the grid,
        // never converted. Kept with the project as trace:<projectId>.
        h(Section, {title:"Tracing picture", defaultOpen:true},
          h("input", {type:"file", accept:"image/*", ref:traceInputRef, hidden:true,
            "aria-label":"Choose a picture to trace",
            onChange:function(e){ var f = e.target.files && e.target.files[0]; e.target.value = "";
              if (f && app.setTracePicture) app.setTracePicture(f, typeof cv.overlayOpacity === "number" ? cv.overlayOpacity : 0.3); }}),
          (gen.img && gen.img.src)
            ? h("div", {className:"canvas-trace"},
                h("img", {src:gen.img.src, alt:"Tracing picture", className:"canvas-trace__img"}),
                h("label", {className:"cs-toolsec__check"},
                  h("input", {type:"checkbox", checked:!!cv.showOverlay, onChange:function(e){ cv.setShowOverlay(e.target.checked); }}),
                  h("span", null, "Show under the grid")),
                h("label", {className:"sb-field"},
                  h("span", null, "Opacity ", h("strong", null, Math.round((cv.overlayOpacity || 0) * 100) + "%")),
                  h("input", {type:"range", min:5, max:90, step:5, value:Math.round((cv.overlayOpacity || 0.3) * 100),
                    "aria-label":"Tracing picture opacity",
                    onChange:function(e){ cv.setOverlayOpacity(Number(e.target.value) / 100); }})),
                h("div", {className:"sb-btnrow"},
                  h("button", {type:"button", className:"g-btn", onClick:function(){ traceInputRef.current && traceInputRef.current.click(); }}, "Change"),
                  h("button", {type:"button", className:"g-btn", onClick:function(){ if (app.removeTracePicture) app.removeTracePicture(); }}, "Remove"))
              )
            : h("div", {className:"canvas-trace"},
                h("p", {className:"cs-toolsec__hint"}, "Show a picture faintly under the grid to draw over. It isn\u2019t converted."),
                h("button", {type:"button", className:"g-btn sb-start", onClick:function(){ traceInputRef.current && traceInputRef.current.click(); }},
                  window.Icons && window.Icons.image ? window.Icons.image() : null, "Add a tracing picture"))
        )
      );
      var canvasActions = h("div", {className:"creator-canvas-actions"},
        h("button", {
          type:"button", className:"g-btn primary sb-block-btn sb-block-btn--tall",
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
    h("div", {className:"sb-fields"},
      h("label", {className:"sb-field"},
        "Pattern name",
        h("input", {
          type:"text", value: app.projectName || "", maxLength:60,
          placeholder: ctx.pat ? (ctx.sW + "\xD7" + ctx.sH + " pattern") : "e.g. Sunflower sampler",
          onChange: function(e) { var v = e.target.value.slice(0,60); if (typeof app.renameProject === "function") app.renameProject(v); else if (typeof app.setProjectName === "function") app.setProjectName(v); },
          className:"cv-input"
        })
      ),
      h("label", {className:"sb-field"},
        "Designer (optional)",
        h("input", {
          type:"text", value: app.projectDesigner || "", maxLength:80,
          placeholder: "Your name or studio",
          onChange: function(e) { var v = e.target.value.slice(0,80); if (typeof app.setProjectDesigner === "function") app.setProjectDesigner(v); },
          className:"cv-input"
        })
      ),
      h("label", {className:"sb-field"},
        "Description / notes (optional)",
        h("textarea", {
          value: app.projectDescription || "", maxLength:500, rows:3,
          placeholder: "Source, copyright, stitching notes\u2026",
          onChange: function(e) { var v = e.target.value.slice(0,500); if (typeof app.setProjectDescription === "function") app.setProjectDescription(v); },
          className:"cv-input cv-input--area"
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
  // A pressed-or-not button in the Convert panel's style (.cs-seltools__btn).
  function toolBtn(o, label) {
    return h("button", Object.assign({type:"button"}, o.props || {}, {
      className:"cs-seltools__btn" + (o.on ? " cs-seltools__btn--on" : "") + (o.className ? " " + o.className : ""),
      onClick:o.onClick
    }), label);
  }
  var stitchTypeSection = h("div", {className:"cs-toolsec"},
    h("div", {className:"cs-toolsec__title"}, "Stitch type"),
    h("div", {role:"radiogroup", "aria-label":"Stitch type", className:"cs-seltools"},
      stitchOpts.map(function(kl) {
        var on = curStitch === kl[0];
        return toolBtn({on:on, onClick:function(){ cv.selectStitchType(kl[0]); },
          props:{key:kl[0], role:"radio", "aria-checked": on ? "true" : "false"}}, kl[1]);
      })
    ),
    h("p", {className:"cs-toolsec__hint"},
      "Shortcuts: 1\u20134 for Cross / Half\u2009/ / Half\u2009\\ / Backstitch \u00B7 T cycles, Shift+T reverses.")
  );

  var bsContSection = (curStitch === "backstitch") ? h("div", {className:"cs-toolsec"},
    h("div", {className:"cs-toolsec__title"}, "Backstitch options"),
    h("label", {className:"cs-toolsec__check"},
      h("input", {type:"checkbox", checked: !!cv.bsContinuous,
        onChange:function(e){ cv.setBsContinuous(e.target.checked); cv.setBsStart(null); }}),
      h("span", null, "Continuous mode \u2014 chain segments without re-clicking the start")
    )
  ) : null;

  var brushSizeSection = h("div", {className:"cs-toolsec"},
    h("div", {className:"cs-toolsec__title"}, "Brush size"),
    h("div", {className:"sb-slider-row"},
      h("input", {type:"range", min:1, max:10, step:1, value:cv.brushSize||1,
        onChange:function(e){ cv.setBrushSize(parseInt(e.target.value,10)); },
        "aria-label":"Brush size"}),
      h("span", {className:"sb-slider-row__value"},
        (cv.brushSize||1) + "\xD7" + (cv.brushSize||1))
    ),
    h("div", {className:"sb-chips"},
      [1,2,3,5,7,10].map(function(sz) {
        var on = (cv.brushSize||1) === sz;
        return toolBtn({on:on, onClick:function(){ cv.setBrushSize(sz); },
          props:{key:sz, "aria-pressed": on ? "true" : "false", "aria-label": sz + " by " + sz + " brush"}}, sz);
      })
    ),
    h("p", {className:"cs-toolsec__hint"},
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
    h("div", {className:"cs-seltools"},
      shapeTools.map(function(t) {
        var on = cv.activeTool === t[0];
        return h("button", {key:t[0], type:"button", className:"cs-seltools__btn" + (on ? " cs-seltools__btn--on" : ""),
          "aria-pressed": on ? "true" : "false", onClick:function(){ pickShapeTool(t[0]); },
          title: t[0] === "text" ? "Text: tap where it should start, then type" : t[1] + ": drag on the chart"}, t[2], h("span", null, t[1]));
      })
    ),
    h("div", {role:"radiogroup", "aria-label":"Rectangle and ellipse", className:"cs-seltools"},
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
    h("p", {className:"cs-toolsec__hint"}, "Shapes stitch whole crosses in the selected colour, as wide as the brush.")
  );

  var mir = cv.mirror || { on: false, axis: "v" };
  function setMir(patch) { if (cv.setMirror) cv.setMirror(function(m) { return Object.assign({}, m, patch); }); }
  var mirrorSection = h("div", {className:"cs-toolsec"},
    h("div", {className:"cs-toolsec__title"}, "Mirror"),
    h("label", {className:"cs-toolsec__check"},
      h("input", {type:"checkbox", checked: !!mir.on, onChange:function(e){ setMir({ on: e.target.checked }); }}),
      h("span", null, "Mirror drawing")),
    h("div", {role:"radiogroup", "aria-label":"Mirror axis", className:"cs-seltools cs-seltools--3"},
      [["v", "Left\u2013right"], ["h", "Top\u2013bottom"], ["both", "Both"]].map(function(o) {
        var on = mir.axis === o[0];
        return h("button", {key:o[0], type:"button", role:"radio", "aria-checked": on ? "true" : "false",
          className:"cs-seltools__btn" + (on ? " cs-seltools__btn--on" : ""),
          onClick:function(){ setMir({ axis: o[0], on: true }); }}, o[1]);
      })
    ),
    mir.on && h("button", {type:"button", className:"cs-seltools__btn sb-block-btn",
      onClick:function(){ setMir({ ax: ctx.sW / 2, ay: ctx.sH / 2 }); }}, "Centre the axis"),
    h("p", {className:"cs-toolsec__hint"},
      "Paint, Erase, Fill, shapes and part stitches are copied across the dashed axis. Drag its handle at the chart's edge to move it.")
  );

  var lassoModes = [["freehand","Lasso"],["polygon","Polygon"],["magnetic","Magnetic"]];
  var curLasso = cv.lassoMode || "freehand";
  var selectionSection = h("div", {className:"cs-toolsec"},
    h("div", {className:"cs-toolsec__title"}, "Selection"),
    h("div", {className:"cs-seltools"},
      toolBtn({on: cv.activeTool === "magicWand", props:{"aria-pressed": cv.activeTool === "magicWand" ? "true" : "false"},
        onClick:function(){
          if (cv.activeTool === "magicWand") { cv.setActiveTool(null); }
          else { cv.setActiveTool("magicWand"); ctx.setPartialStitchTool(null); cv.setBsStart(null); if (cv.cancelLasso) cv.cancelLasso(); }
        }}, "Magic Wand (W)"),
      toolBtn({on: cv.activeTool === "lasso", props:{"aria-pressed": cv.activeTool === "lasso" ? "true" : "false"},
        onClick:function(){
          if (cv.activeTool === "lasso") { if (cv.cancelLasso) cv.cancelLasso(); cv.setActiveTool(null); }
          else { cv.setActiveTool("lasso"); cv.setLassoMode(curLasso); ctx.setPartialStitchTool(null); cv.setBsStart(null); }
        }}, "Lasso")
    ),
    h("div", {className:"cv-field__label sb-subtitle"}, "Lasso mode"),
    P.seg({label:"Lasso mode", className:"cv-seg--sub", value:curLasso,
      onChange:function(id){
        cv.setLassoMode(id);
        // If lasso isn't active yet, picking a mode here activates it.
        if (cv.activeTool !== "lasso") {
          cv.setActiveTool("lasso"); ctx.setPartialStitchTool(null); cv.setBsStart(null);
        }
      },
      options: lassoModes.map(function(kl){ return {id:kl[0], label:kl[1]}; })}),
    h("p", {className:"cs-toolsec__hint"},
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
      type:"button", className:"cs-seltools__btn sb-block-btn sb-danger-btn",
      onClick:function(){ if (cv.deleteSelection) cv.deleteSelection(); },
      title:"Delete the stitches in the selection (Delete)"
    }, window.Icons && window.Icons.trash ? window.Icons.trash() : null, "Delete selected stitches"),
    (cv.hasSelection || cv.lassoInProgress) && h("button", {
      type:"button", className:"cs-seltools__btn sb-block-btn",
      onClick:function(){ if (cv.cancelLasso) cv.cancelLasso(); if (cv.clearSelection) cv.clearSelection(); }
    }, "Clear selection (" + (cv.selectionCount || 0).toLocaleString() + ")")
  );

  var correctSection = h("div", {className:"cs-toolsec"},
    h("div", {className:"cs-toolsec__title"}, "Correct"),
    h("div", {className:"cs-seltools"},
      toolBtn({on: cv.activeTool==="cleanup", props:{"aria-pressed": cv.activeTool==="cleanup" ? "true" : "false"},
        onClick:function(){
          if (cv.activeTool==="cleanup") { if (cv.exitCleanup) cv.exitCleanup(); }
          else { cv.setBsStart(null); ctx.setPartialStitchTool(null); if (cv.cancelLasso) cv.cancelLasso(); if (cv.enterCleanup) cv.enterCleanup(); }
        }}, "Fix outline colours"),
      toolBtn({on: cv.activeTool==="denoise", props:{"aria-pressed": cv.activeTool==="denoise" ? "true" : "false"},
        onClick:function(){
          if (cv.activeTool==="denoise") { if (cv.exitDenoise) cv.exitDenoise(); }
          else { cv.setBsStart(null); ctx.setPartialStitchTool(null); if (cv.cancelLasso) cv.cancelLasso(); if (cv.enterDenoise) cv.enterDenoise(); }
        }}, "Reduce confetti")
    ),
    toolBtn({className:"sb-block-btn", onClick:function(){ if (app&&app.openResizeCanvas) app.openResizeCanvas(); }}, "Resize canvas\u2026"),
    // Trims rows and columns with nothing on them from the chart's edges:
    // one undo step that keeps progress, backstitches and knots
    // (creator-main.js cropToStitches).
    app.cropToStitches && h("button", {
      type:"button", className:"cs-seltools__btn sb-block-btn",
      onClick:function(){ app.cropToStitches(); },
      title:"Remove empty rows and columns around the stitches"
    }, window.Icons.crop(), h("span", null, "Crop to the stitches"))
  );

  // Navigate | Draw (audit DRAW-01). On touch it is the first control in the
  // tool strip instead, so it isn't repeated here.
  var coarseTools = !!(window.Platform && window.Platform.isCoarsePointer && window.Platform.isCoarsePointer());
  var modeSection = (!coarseTools && window.ModeToggle) ? h("div", {className:"cs-toolsec"},
    h("div", {className:"cs-toolsec__title"}, "Chart mode"),
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

  var viewContent = h(React.Fragment, null,
    viewToggle,
    highlightControls
  );

  // The tool-rail layout's View tab: the chart view and highlight, the
  // picture overlay (from More) and Preview.
  var railViewContent = h(React.Fragment, null,
    viewToggle,
    highlightControls,
    (gen.img && gen.img.src) && h("div", {className:"cs-toolsec"},
      h("div", {className:"cs-toolsec__title"}, "Your picture over the chart"),
      h("label", {className:"cs-toolsec__check"},
        h("input", {type:"checkbox", checked:!!cv.showOverlay, onChange:function(e){ cv.setShowOverlay(e.target.checked); }}),
        h("span", null, "Show the picture")),
      cv.showOverlay && h("input", {type:"range", min:0.1, max:0.8, step:0.05, value:cv.overlayOpacity,
        onChange:function(e){ cv.setOverlayOpacity(Number(e.target.value)); },
        className:"sb-range", "aria-label":"Overlay opacity"})
    ),
    h("div", {className:"cs-toolsec sb-subhead"}, h("div", {className:"cs-toolsec__title"}, "Preview")),
    previewPanel
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
    return h('aside', { className: 'cs-sidebar-fade cs-toolsec sb-glance' },
      h('div', { className: 'cs-toolsec__title' }, 'Project at a glance'),
      h('div', { className: 'sb-facts sb-facts--left' },
        h('span', { className: 'sb-facts__k' }, 'Size'),
        h('span', null, ctx.sW + ' \u00D7 ' + ctx.sH + ' stitches'),
        h('span', { className: 'sb-facts__k' }, 'Threads'),
        h('span', null, window.threadCountsShort(window.creatorThreadCounts(ctx.displayPal || ctx.pal))),
        h('span', { className: 'sb-facts__k' }, 'Fabric'),
        h('span', null, (ctx.fabricCt || 14) + ' count'),
        ctx.totalSkeins != null && h('span', { className: 'sb-facts__k' }, 'Skeins'),
        ctx.totalSkeins != null && h('span', null, ctx.totalSkeins)
      ),
      h('p', { className: 'cs-toolsec__hint' },
        'Use the canvas tools on the Pattern page to edit. Generation parameters are above on this page.')
    );
  }

  return h(React.Fragment, null,
    // "Back to Convert" link — shown in edit mode when a source image exists.
    // Fires the back-to-convert request (may show warning modal if edits exist).
    // (The tool-rail layout has none: the Convert tab in the top bar does it.)
    !railLayout && gen.img && app.sourceTab !== "canvas" && h("div", {className:"rpanel-back-to-convert"},
      h("button", {
        type:"button", className:"rpanel-back-to-convert__btn",
        onClick:function(){
          if(app.requestBackToConvert) app.requestBackToConvert();
          else if(app.setAppMode) app.setAppMode("create");
        }
      },
        window.Icons && window.Icons.chevronLeft ? window.Icons.chevronLeft() : null,
        "Back to Convert"
      )
    ),
    tabBar,
    h("div", {className:"creator-sidebar-body", id:"sidebar-panel-" + sTab, role:"tabpanel"},
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
      sTab === "view" && (railLayout ? railViewContent : viewContent),
      sTab === "preview" && previewPanel,
      sTab === "project" && h(React.Fragment, null,
        projectInfoSection,
        // Fabric can change after the pattern is made (audit COMMON-08).
        h(Section, {title:"Fabric", defaultOpen:true}, h("div", {className:"sb-fields"}, fabricBlock()))
      ),
    ),
    editActions
  );
};
