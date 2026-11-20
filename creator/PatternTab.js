/* creator/PatternTab.js — The pattern view tab (canvas area + palette chips).
   Reads from CreatorContext and GenerationContext.
   Concatenated into creator/bundle.js, which the page loads before creator-main.
   Depends on: PatternCanvas (PatternCanvas.js), Tooltip (components.js),
               CreatorContext, GenerationContext (context.js) */

window.CreatorPatternTab = function CreatorPatternTab() {
  var ctx = window.usePatternData();
  var cv = window.useCanvas();
  var app = window.useApp();
  var gen = window.useGeneration();
  // Hover coords live in their own context (action plan H5 = 2B.1).
  var hov = window.useHover() || {};
  var h = React.createElement;

  var _dismissed = React.useState(false); var confettiBannerDismissed = _dismissed[0], setConfettiBannerDismissed = _dismissed[1];
  var prevConfettiKeyRef = React.useRef(null);
  React.useEffect(function() {
    var newKey = app.confettiData ? (app.confettiData.raw.singles + "|" + app.confettiData.clean.singles) : null;
    if (prevConfettiKeyRef.current !== newKey) {
      prevConfettiKeyRef.current = newKey;
      if (newKey) setConfettiBannerDismissed(false);
    }
  }, [app.confettiData]);

  // Track Shift/Alt modifier keys when a selection tool is active.
  // Updates cv.selectionModifier so MagicWandPanel can show the effective mode.
  // Must be declared before any early returns (Rules of Hooks).
  React.useEffect(function() {
    if (cv.activeTool !== "magicWand" && cv.activeTool !== "lasso") {
      cv.setSelectionModifier(null);
      return;
    }
    function update(e) {
      if (e.shiftKey && e.altKey)  cv.setSelectionModifier("intersect");
      else if (e.shiftKey)         cv.setSelectionModifier("add");
      else if (e.altKey)           cv.setSelectionModifier("subtract");
      else                         cv.setSelectionModifier(null);
    }
    window.addEventListener("keydown", update);
    window.addEventListener("keyup",   update);
    return function() {
      window.removeEventListener("keydown", update);
      window.removeEventListener("keyup",   update);
      cv.setSelectionModifier(null);
    };
  }, [cv.activeTool]);

  if (!(ctx.pat && ctx.pal)) return null;
  if (app.tab !== "pattern") return null;

  // PaletteSwap confirm view takes over when active
  if (cv.paletteSwap && cv.paletteSwap.showConfirm) {
    return cv.paletteSwap.confirmView || null;
  }

  // Build status text. Touch screens get touch wording (audit COMMON-06).
  var coarse = !!(window.Platform && typeof window.Platform.isCoarsePointer === "function" && window.Platform.isCoarsePointer());
  var statusText;
  if (cv.drawMode === false) {
    // Navigate (audit DRAW-01) — same wording as the Tracker's Navigate mode.
    statusText = coarse
      ? "Drag to pan \u00B7 Tap a stitch to see its thread \u00B7 Press and hold for more options \u00B7 Choose Draw to edit"
      : "Drag to pan. Choose Paint, Fill or Erase (P, F, 5) to change stitches.";
  } else if (app.eyedropperEmpty) {
    statusText = "That cell is empty \u2014 no colour to sample.";
  } else if (cv.activeTool === "text") {
    statusText = (coarse ? "Text \u2014 tap" : "Text \u2014 click") + " where the text should start, then type it.";
  } else if (cv.activeTool === "line" || cv.activeTool === "rect" || cv.activeTool === "ellipse") {
    var shapeName = { line: "Line", rect: "Rectangle", ellipse: "Ellipse" }[cv.activeTool];
    statusText = shapeName + " \u2014 " + (coarse ? "drag" : "drag on the chart") + (cv.activeTool === "line" ? " from one end to the other" : " from one corner to the other") +
      (cv.activeTool === "line" && cv.lineSnap ? "; it keeps to straight and 45\u00B0 lines" : "") +
      (cv.mirror && cv.mirror.on ? ". Mirror drawing is on." : ".");
  } else if (cv.activeTool === "float") {
    statusText = coarse
      ? "Drag the selection into place, then tap Done or tap outside it."
      : "Drag the selection into place, then press Done or click outside it. Esc puts it back.";
  } else if (cv.activeTool === "eyedropper") {
    statusText = "Eyedropper \u2014 click a cell to sample its colour.";
  } else if (cv.activeTool === "colourReplace") {
    statusText = "Replace colour \u2014 hover to see every stitch of a colour, click one to replace it. Press R to exit.";
  } else if (cv.activeTool === "magicWand") {
    var wModLabel = cv.selectionModifier === "add" ? "[+] Add" : cv.selectionModifier === "subtract" ? "[\u2212] Subtract" : cv.selectionModifier === "intersect" ? "[\u2229] Intersect" : null;
    statusText = "Magic Wand \u2014 click to select by colour" + (wModLabel ? " \u2022 " + wModLabel : ". Shift=add, Alt=subtract.");
  } else if (cv.activeTool === "lasso") {
    var lModLabel = cv.selectionModifier === "add" ? "[+] Add" : cv.selectionModifier === "subtract" ? "[\u2212] Subtract" : cv.selectionModifier === "intersect" ? "[\u2229] Intersect" : null;
    statusText = "Lasso (" + (cv.lassoMode || "freehand") + ")" + (lModLabel ? " \u2022 " + lModLabel : "") + " \u2014 " +
      (cv.lassoMode === "freehand" ? "drag to paint selection." :
       cv.lassoMode === "polygon" ? "click to place anchor points. Click near start to close." :
       "click to place anchors; snaps to colour edges.");
  } else if (coarse && (cv.stitchType === "cross" || !cv.stitchType)) {
    // Touch screens: no right-click or keyboard; long-press opens the menu.
    statusText = "Long-press a stitch for more options.";
  } else if (cv.stitchType === "cross") {
    if (!cv.selectedColorId) {
      statusText = "Cross stitch \u2014 select a colour in the panel, or right-click the canvas to pick one.";
    } else {
      statusText = "Cross stitch \u2014 " + (cv.brushMode === "fill" ? "fill" : "paint") + " mode. Right-click any cell to change colour.";
    }
  } else if (cv.stitchType === "half-fwd") {
    statusText = "Half stitch / \u2014 click cells to place.";
  } else if (cv.stitchType === "half-bck") {
    statusText = "Half stitch \\ \u2014 click cells to place.";
  } else if (cv.stitchType === "backstitch") {
    statusText = coarse
      ? "Backstitch \u2014 tap grid intersections. Press and hold to cancel."
      : "Backstitch \u2014 click grid intersections. Right-click to cancel.";
  } else if (cv.stitchType === "knot") {
    statusText = (coarse ? "French knot \u2014 tap" : "French knot \u2014 click") +
      " a grid corner or the middle of a stitch to add a knot, or a knot to remove it.";
  } else if (cv.stitchType === "erase") {
    statusText = "Erase \u2014 click to remove stitches. Use backstitch erase (Bs tool) for backstitch lines.";
  } else {
    statusText = "Select a colour in the panel on the right, then choose a stitch type above.";
  }

  var stitchedOn = app.chartView === "stitched" && !app.previewActive && !app.splitPaneEnabled;

  // How far the next action reaches (Stage 3), said beside the progress
  // note: one stitch, a brush's worth, every joined stitch of a colour,
  // every stitch of a colour, or the selection. Regenerate and Recolour,
  // which change the whole chart, say so in their own dialogs.
  var reachText = window.creatorActionReach ? window.creatorActionReach(cv, ctx, stitchedOn) : null;

  return h("div", null,
    cv.cs < 6 && (cv.view === "symbol" || cv.view === "both") && h("div", {className:"pt-note"},
      "To see symbols, you may need to zoom in."),

    ctx.isScratchMode && (Number(ctx.totalStitchable) || 0) === 0 && (function() {
      var hasThreads = !!(ctx.displayPal && ctx.displayPal.length > 0);
      var activeThread = cv.selectedColorId && ctx.cmap && ctx.cmap[cv.selectedColorId];
      var threadName = activeThread
        ? (typeof formatThread === "function" ? formatThread(activeThread) : (activeThread.name ? activeThread.id + " " + activeThread.name : activeThread.id))
        : "";
      return h("div", {
        className: "pt-note pt-note--centre scratch-empty-hint"
      },
        activeThread
          ? h("span", null, cv.drawMode && cv.activeTool === "paint"
              ? (coarse ? "Tap a square to stitch with " : "Click a square to stitch with ") + threadName
              : "Select Paint to stitch with " + threadName)
          : h(React.Fragment, null,
              h("span", null, hasThreads ? "Choose a working thread" : "Choose your first thread"),
              h("button", {
                type: "button",
                className: "btn btn-sm",
                onClick: function() {
                  if (app.setSidebarTab) app.setSidebarTab("palette");
                  if (app.setPanelOpen) app.setPanelOpen(true);
                }
              }, "Open Palette")
            )
      );
    })(),

    window.CreatorReadyBar && h(window.CreatorReadyBar, null),

    // The shortcuts hint and review note wait while "Your pattern is ready"
    // or a one-off tip is showing, so notices come one at a time.
    // The tool rail's tooltips name each shortcut, so it has no hint row.
    !app.readyBarOpen && !app.coachTipActive && !app.shortcutsHintDismissed && !coarse && !app.desktopRail && h("div", {className:"pt-note pt-note--quiet"},
      h("span", {className:"pt-note__text"}, Icons.lightbulb(), " Press ", h("kbd", null, "?"), " for keyboard shortcuts"),
      h("button", {
        type: "button", className: "pt-note__close", "aria-label": "Dismiss", title: "Dismiss",
        onClick: function() {
          localStorage.setItem("shortcuts_hint_dismissed", "1");
          app.setShortcutsHintDismissed(true);
        }
      }, Icons.x())
    ),

    !confettiBannerDismissed && app.confettiData && gen.orphans > 0 && (function() {
      var rawSingles = app.confettiData.raw.singles;
      var cleanSingles = app.confettiData.clean.singles;
      var removed = rawSingles - cleanSingles;
      var totalStitchable = ctx.pat ? ctx.pat.filter(function(m){return m.id!=="__skip__"&&m.id!=="__empty__";}).length : 1;
      var pctOfTotal = removed / Math.max(1, totalStitchable) * 100;
      if (pctOfTotal < 15) return null;
      return h("div", {className:"pt-note pt-note--danger", role:"note"},
        h("span", {className:"pt-note__text"}, Icons.warning(), " Reduce confetti changed ", removed.toLocaleString(), " stitches (", pctOfTotal.toFixed(1), "% of pattern). You may want to convert again with a lower Reduce confetti level."),
        h("button", {
          type:"button", className:"pt-note__close", "aria-label":"Dismiss", title:"Dismiss",
          onClick:function(){setConfettiBannerDismissed(true);}
        }, Icons.x())
      );
    })(),

    // Stitched progress (UX-006): edits to stitched cells reset them, so say so
    // up front and offer to show which cells those are.
    ctx.progressPct > 0 && h("div", {
      className:"stitched-banner pt-note pt-note--accent", role:"status"
    },
      h("span", {className:"pt-note__text"}, Icons.info(), " ",
        h("strong", null, ctx.progressPct >= 100 ? "100" : ctx.progressPct >= 1 ? Math.min(99, Math.round(ctx.progressPct)) : "Less than 1", "% stitched."),
        " Changing a marked stitch clears its mark.",
        reachText && h("span", {className:"pt-note__reach", "data-reach":""}, " " + reachText)),
      h("button", {
        type:"button", "aria-pressed": !!cv.showStitched,
        className:"stitched-banner__toggle cs-seltools__btn" + (cv.showStitched ? " cs-seltools__btn--on" : ""),
        onClick:function(){ cv.setShowStitched(!cv.showStitched); }
      }, cv.showStitched ? Icons.eyeOff() : Icons.eye(), " Show stitched")
    ),

    h(window.MagicWandPanel, null),

    gen.disambig && (function() {
      var hasResult = gen.disambigData != null;
      var canRun = ctx.pat && ctx.pal && !app.busy;
      return h("div", {className:"pt-note pt-note--small"},
        h("span", {className:"pt-note__text pt-note__title"}, "Keep look-alike colours apart"),
        hasResult && gen.disambigData.swaps > 0 && h("span", {className:"pt-note__meta"},
          gen.disambigData.swaps.toLocaleString(), " cell", gen.disambigData.swaps !== 1 ? "s" : "", " corrected"
        ),
        hasResult && gen.disambigData.swaps === 0 && h("span", {className:"pt-note__meta pt-note__meta--good"}, "No clashes found"),
        h("button", {
          type: "button", className: "cs-seltools__btn cs-seltools__btn--primary",
          disabled: !canRun,
          onClick: function() {
            if (!canRun) return;
            gen.disambiguateNow();
          }
        }, hasResult ? "Re-apply" : "Apply now"),
        h("button", {
          type: "button", className: "pt-note__close", "aria-label": "Turn off Keep look-alike colours apart", title: "Turn off",
          onClick: function() { gen.setDisambig(false); }
        }, Icons.x())
      );
    })(),

    app.splitPaneEnabled
      ? h(window.CreatorSplitPane, null)
      : h("div", {className:"cs-chart-frame"},
        // Chart / Stitched (Stage 3), with a note while painting is off.
        h("div", {className:"chart-view-bar"},
          stitchedOn && h("p", {className:"chart-stitched-hint", role:"status"}, Icons.info(),
            h("span", null, coarse ? "Painting is off. Choose Chart to edit." : "Painting is off. Choose Chart, or press S, to edit.")),
          window.CreatorChartViewSwitch && h(window.CreatorChartViewSwitch, null)),
        h("div", {
      ref:app.scrollRef,
      className:"cs-chart-scroll",
      // The fitted height and the cursor for the tool change as you work.
      style:{minHeight:app.chartFitH ? Math.min(550, app.chartFitH) : undefined,cursor:(function(){
        var selTool = cv.activeTool === "magicWand" || cv.activeTool === "lasso";
        if (stitchedOn || cv.activeTool === "hand" || cv.drawMode === false) return "grab";
        if (cv.activeTool === "eyedropper") return "copy";
        if (cv.activeTool === "float") return "move";
        if (cv.activeTool === "line" || cv.activeTool === "rect" || cv.activeTool === "ellipse") return "crosshair";
        if (cv.activeTool === "text") return "text";
        if (selTool) return "crosshair";
        if (app.previewActive) return "default";
        if (cv.activeTool === "fill") return "cell";
        if (cv.activeTool === "eraseBs") return "not-allowed";
        if (cv.activeTool || ctx.partialStitchTool) return "crosshair";
        return "default";
      })()},
      onContextMenu: function(e) {
        // Right-click context menu (except when backstitch has a special right-click action)
        if (cv.activeTool === "backstitch" && cv.bsStart) return;
        e.preventDefault();
        // Nothing on the chart changes from the Stitched view, so no menu.
        if (stitchedOn) return;
        var pcRef = app.pcRef;
        if (!pcRef.current || !ctx.pat) return;
        var gc = gridCoord(pcRef, e, cv.cs, app.G, false);
        if (!gc || gc.gx < 0 || gc.gx >= ctx.sW || gc.gy < 0 || gc.gy >= ctx.sH) return;
        var idx = gc.gy * ctx.sW + gc.gx;
        var cell = ctx.pat[idx];
        // In paint/fill mode, right-click directly picks the colour (eyedropper gesture)
        var rcIsHsTool = ctx.partialStitchTool && ctx.partialStitchTool !== "erase";
        if ((cv.activeTool === "paint" || cv.activeTool === "fill" || rcIsHsTool) &&
            cell && cell.id !== "__skip__" && cell.id !== "__empty__" &&
            ctx.cmap && ctx.cmap[cell.id]) {
          cv.setSelectedColorId(cell.id);
          return;
        }
        cv.setContextMenu({ x: e.clientX, y: e.clientY, gx: gc.gx, gy: gc.gy, idx: idx, cell: cell });
      }
    },
      // Every view of the chart lies in one layer the chart's size (grid plus
      // rulers), so switching Chart, Stitched, Flat and Realistic keeps the
      // zoom and the place on the chart. The stitched picture lies over the
      // chart, which stays mounted (ChartStitchedView.js); Flat and Realistic
      // have no rulers, so they sit where the grid starts.
      h("div", {className:"cs-chart-layer", style:{minWidth: ctx.sW * cv.cs + app.G + 2, minHeight: ctx.sH * cv.cs + app.G + 2}},
        app.previewActive
          ? h("div", {className:"cs-chart-layer__view", style:{left: app.G, top: app.G}},
              app.previewMode === "realistic" ? h(window.CreatorRealisticCanvas, null) : h(window.CreatorPreviewCanvas, null))
          : h(React.Fragment, null,
              h(window.PatternCanvas, null),
              stitchedOn && window.CreatorStitchedOverlay && h(window.CreatorStitchedOverlay, null)))
    )),

    // Copy / paste / flip / rotate bar over the selection (audit DRAW-04)
    window.CreatorSelectionBar && h(window.CreatorSelectionBar, null),
    // Grips for moving the mirror-drawing axes (audit DRAW-04)
    window.CreatorMirrorHandle && h(window.CreatorMirrorHandle, null),
    // The text tool's sheet (audit DRAW-04)
    window.CreatorTextToolSheet && h(window.CreatorTextToolSheet, null),

    // Context menu overlay
    cv.contextMenu && h(window.CreatorContextMenu, null),

    // Touch loupe and precision cursor (fixed position; shown while drawing).
    window.CreatorLoupe && h(window.CreatorLoupe, null),

    // Enhanced status bar: tool hint + coordinates + colour-under-cursor
    (function() {
      var parts = [statusText];
      if (hov.hoverCoords && hov.hoverCoords.gx >= 0 && hov.hoverCoords.gx < ctx.sW && hov.hoverCoords.gy >= 0 && hov.hoverCoords.gy < ctx.sH) {
        parts.push("X: " + (hov.hoverCoords.gx + 1) + ", Y: " + (hov.hoverCoords.gy + 1));
        var hIdx = hov.hoverCoords.gy * ctx.sW + hov.hoverCoords.gx;
        var hCell = ctx.pat[hIdx];
        if (hCell && hCell.id !== "__skip__" && hCell.id !== "__empty__" && ctx.cmap && ctx.cmap[hCell.id]) {
          var info = ctx.cmap[hCell.id];
          parts.push(formatThread(info) + " (" + (info.count || 0) + " st)");
        }
      }
      return h("div", {className:"tb-status"},
        h("span", null, parts[0]),
        parts.length > 1 && h("span", {className:"tb-status__coords"}, parts[1]),
        parts.length > 2 && h("span", {className:"tb-status__thread"},
          ctx.cmap && ctx.pat && hov.hoverCoords && (function() {
            var hIdx2 = hov.hoverCoords.gy * ctx.sW + hov.hoverCoords.gx;
            var hCell2 = ctx.pat[hIdx2];
            if (hCell2 && hCell2.id !== "__skip__" && hCell2.id !== "__empty__" && ctx.cmap[hCell2.id]) {
              return h("span", {className:"tb-status__swatch", style:{background:"rgb("+ctx.cmap[hCell2.id].rgb+")"}});
            }
            return null;
          })(),
          h("span", {className:"tb-status__name"}, parts[2])
        )
      );
    })(),

    // Clear for a highlighted thread; in the tool-rail layout it is in the options bar.
    !app.desktopRail && h("div", {className:"pt-hi-clear"},
      cv.hiId && h("button", {
        type: "button", className: "cs-seltools__btn sb-danger-btn",
        "aria-label": "Clear the highlighted thread",
        onClick: function(){cv.setHiId(null);}
      }, h("span", null, "Clear"), Icons.x())
    ),

  );
};
