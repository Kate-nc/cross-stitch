/* creator/useKeyboardShortcuts.js — Creator design-mode shortcuts.
   Migrated to the central registry (window.Shortcuts). The hook
   declares the entries; the registry handles dispatch, the canonical
   input-element guard, scope activation, and conflict detection.

   Scope: 'creator.design' is pushed by this hook while the Creator
   is active. Esc handling stays imperative (composes with the
   useEscape stack via the registry's allowInInput=false default
   for the bare 'esc' key). */

window.useKeyboardShortcuts = function useKeyboardShortcuts(state, history, io) {
  // Activate the Creator design scope while the hook is mounted + active.
  // useScope is a no-op when when=false, so this safely toggles.
  if (typeof window.useScope === "function") {
    window.useScope("creator.design", !!state.isActive);
  }

  // Register all entries through the central registry. The hook re-runs
  // when any of the closure-captured state references change so the
  // run() bodies always see fresh values.
  var entries = !state.isActive ? [] : [
    // Esc cascade — preserves the original priority order.
    { id: "creator.esc", keys: "esc", scope: "creator.design",
      description: "Cancel / dismiss",
      hidden: true, // Esc is implicit in every modal — don't list separately.
      run: function () {
        if (state.namePromptOpen) { state.setNamePromptOpen(false); return; }
        if (state.modal) { state.setModal(null); return; }
        if (state.overflowOpen) { state.setOverflowOpen(false); return; }
        // Background-pick mode: ESC backs out without sampling.
        if (state.pickBg) { state.setPickBg(false); return; }
        if (state.lassoInProgress) { state.cancelLasso(); return; }
        if (state.hasSelection) { state.clearSelection(); return; }
        if (state.activeTool === "backstitch" && state.bsStart) { state.setBsStart(null); return; }
        if (state.activeTool || state.partialStitchTool) {
          state.setActiveTool(null); state.setPartialStitchTool(null); state.setBsStart(null); return;
        }
        if (state.hiId) { state.setHiId(null); return; }
        if (state.selectedColorId) { state.setSelectedColorId(null); return; }
      } },

    // History / save / select-all / invert
    { id: "creator.undo", keys: "mod+z", scope: "creator.design",
      description: "Undo edit",
      run: function () { history.undoEdit(); } },
    { id: "creator.redo", keys: ["mod+y", "mod+shift+z"], scope: "creator.design",
      description: "Redo edit",
      run: function () { history.redoEdit(); } },
    { id: "creator.save", keys: "mod+s", scope: "creator.design",
      description: "Save project",
      run: function () { if (state.pat && state.pal) io.saveProject(); } },
    { id: "creator.selectAll", keys: "mod+a", scope: "creator.design",
      description: "Select all stitches",
      run: function () { if (state.pat) state.selectAll(); } },
    { id: "creator.invertSel", keys: "mod+shift+i", scope: "creator.design",
      description: "Invert selection",
      run: function () { if (state.pat) state.invertSelection(); } },

    // Help / shortcuts
    { id: "creator.shortcuts", keys: "?", scope: "creator.design",
      description: "Toggle shortcuts panel",
      run: function () {
        state.setModal(function (m) { return m === "shortcuts" ? null : "shortcuts"; });
      } },

    // Stitch type / highlight modes (conditional behaviour preserved).
    { id: "creator.stitch.cross", keys: "1", scope: "creator.design",
      description: "Cross stitch (or highlight: isolate)",
      when: function () { return !!state.pat; },
      run: function () {
        if (state.hiId) { state.setHighlightMode("isolate"); return; }
        state.selectStitchType("cross");
      } },
    { id: "creator.stitch.halffwd", keys: "2", scope: "creator.design",
      description: "Half stitch / (or highlight: outline)",
      when: function () { return !!state.pat; },
      run: function () {
        if (state.hiId) { state.setHighlightMode("outline"); return; }
        state.selectStitchType("half-fwd");
      } },
    { id: "creator.stitch.halfbck", keys: "3", scope: "creator.design",
      description: "Half stitch \\ (or highlight: tint)",
      when: function () { return !!state.pat; },
      run: function () {
        if (state.hiId) { state.setHighlightMode("tint"); return; }
        state.selectStitchType("half-bck");
      } },
    { id: "creator.stitch.bs", keys: "4", scope: "creator.design",
      description: "Backstitch (or highlight: spotlight)",
      when: function () { return !!state.pat; },
      run: function () {
        if (state.hiId) { state.setHighlightMode("spotlight"); return; }
        state.selectStitchType("backstitch");
      } },
    { id: "creator.stitch.erase", keys: "5", scope: "creator.design",
      description: "Erase",
      when: function () { return !!state.pat; },
      run: function () { state.selectStitchType("erase"); } },

    // Cycle through stitch types — pairs with the Tools sidebar tab where
    // the stitch-type chooser now lives. Skips "erase" (its own shortcut: 5).
    { id: "creator.stitch.cycle", keys: "t", scope: "creator.design",
      description: "Cycle stitch type forward",
      when: function () { return !!state.pat; },
      run: function () {
        var order = ["cross","quarter","half-fwd","half-bck","three-quarter","backstitch"];
        var cur = state.stitchType || "cross";
        var i = order.indexOf(cur);
        var next = order[(i < 0 ? 0 : (i + 1) % order.length)];
        state.selectStitchType(next);
      } },
    { id: "creator.stitch.cycleBack", keys: "shift+t", scope: "creator.design",
      description: "Cycle stitch type backward",
      when: function () { return !!state.pat; },
      run: function () {
        var order = ["cross","quarter","half-fwd","half-bck","three-quarter","backstitch"];
        var cur = state.stitchType || "cross";
        var i = order.indexOf(cur);
        var prev = order[(i <= 0 ? order.length - 1 : i - 1)];
        state.selectStitchType(prev);
      } },

    // Tools
    { id: "creator.tool.wand", keys: "w", scope: "creator.design",
      description: "Magic wand",
      when: function () { return !!state.pat; },
      run: function () {
        if (state.activeTool === "magicWand") { state.setActiveTool(null); }
        else { state.setActiveTool("magicWand"); state.setPartialStitchTool(null); state.setBsStart(null); }
      } },
    { id: "creator.tool.paint", keys: "p", scope: "creator.design",
      description: "Paint brush",
      when: function () { return !!state.pat && !state.partialStitchTool && state.activeTool !== "backstitch"; },
      run: function () { state.setBrushAndActivate("paint"); } },
    { id: "creator.tool.fill", keys: "f", scope: "creator.design",
      description: "Fill bucket",
      when: function () { return !!state.pat && !state.partialStitchTool && state.activeTool !== "backstitch"; },
      run: function () { state.setBrushAndActivate("fill"); } },
    { id: "creator.tool.eyedropper", keys: "i", scope: "creator.design",
      description: "Eyedropper",
      when: function () { return !!state.pat; },
      run: function () {
        state.setActiveTool("eyedropper"); state.setBsStart(null); state.setPartialStitchTool(null);
      } },
    { id: "creator.tool.hand", keys: "h", scope: "creator.design",
      description: "Hand — pan / drag to scroll",
      when: function () { return !!state.pat; },
      run: function () {
        if (state.activeTool === "hand") { state.setActiveTool(null); }
        else { state.setActiveTool("hand"); state.setBsStart(null); state.setPartialStitchTool(null); }
      } },

    // View / canvas
    { id: "creator.view.cycle", keys: "v", scope: "creator.design",
      description: "Cycle view: colour → symbol → both",
      when: function () { return !!state.pat; },
      run: function () {
        state.setView(function (v) { return v === "color" ? "symbol" : v === "symbol" ? "both" : "color"; });
      } },
    { id: "creator.split", keys: "\\", scope: "creator.design",
      description: "Toggle split-pane preview",
      when: function () { return !!state.pat; },
      run: function () {
        var nextSplit = !state.splitPaneEnabled;
        state.setSplitPaneEnabled(nextSplit);
        if (typeof UserPrefs !== "undefined") UserPrefs.set("splitPaneEnabled", nextSplit);
      } },
    { id: "creator.zoom.in", keys: ["=", "+"], scope: "creator.design",
      description: "Zoom in",
      when: function () { return !!state.pat; },
      run: function () { state.setZoom(function (z) { return Math.min(3, +(z + 0.1).toFixed(2)); }); } },
    { id: "creator.zoom.out", keys: "-", scope: "creator.design",
      description: "Zoom out",
      when: function () { return !!state.pat; },
      run: function () { state.setZoom(function (z) { return Math.max(0.05, +(z - 0.1).toFixed(2)); }); } },
    { id: "creator.zoom.fit", keys: "0", scope: "creator.design",
      description: "Zoom to fit",
      when: function () { return !!state.pat; },
      run: function () { state.fitZ(); } },
  ];

  if (typeof window.useShortcuts === "function") {
    window.useShortcuts(entries, [
      state.isActive, state.activeTool, state.bsStart,
      state.editHistory, state.redoHistory, state.pat, state.pal,
      state.namePromptOpen, state.modal, state.overflowOpen,
      state.selectedColorId, state.partialStitchTool, state.hiId,
      state.hasSelection, state.lassoInProgress, state.highlightMode,
      state.splitPaneEnabled, state.stitchType,
      history.undoEdit, history.redoEdit, io.saveProject,
    ]);
  }
};
