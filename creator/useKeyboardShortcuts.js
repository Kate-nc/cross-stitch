/* creator/useKeyboardShortcuts.js — Keyboard shortcut handler for CreatorApp.
   Registers/unregisters a keydown listener on the window.
   Expects state (from useCreatorState), history (from useEditHistory),
   and io (from useProjectIO). */

window.useKeyboardShortcuts = function useKeyboardShortcuts(state, history, io) {
  var app = window.useApp();
  var creatorMode = app && app.creatorMode;
  React.useEffect(function() {
    if (!state.isActive) return;

    function handleKeyDown(e) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      var mod = e.ctrlKey || e.metaKey;

      if (mod && !e.shiftKey && e.key === "z") { e.preventDefault(); history.undoEdit(); return; }
      if ((mod && e.key === "y") || (mod && e.shiftKey && e.key === "z")) { e.preventDefault(); history.redoEdit(); return; }
      if (mod && e.key === "s") { e.preventDefault(); if (state.pat && state.pal) io.saveProject(); return; }
      if (mod && !e.shiftKey && e.key === "a") { e.preventDefault(); if (state.pat) { state.selectAll(); } return; }
      if (mod && e.shiftKey && (e.key === "i" || e.key === "I")) { e.preventDefault(); if (state.pat) { state.invertSelection(); } return; }
      if (mod) return;

      if (e.key === "Escape") {
        if (state.namePromptOpen) { state.setNamePromptOpen(false); return; }
        if (state.modal) { state.setModal(null); return; }
        if (state.overflowOpen) { state.setOverflowOpen(false); return; }
        if (state.lassoInProgress) { state.cancelLasso(); return; }
        if (state.hasSelection) { state.clearSelection(); return; }
        if (state.activeTool === "backstitch" && state.bsStart) { state.setBsStart(null); return; }
        if (state.activeTool || state.partialStitchTool) {
          state.setActiveTool(null); state.setPartialStitchTool(null); state.setBsStart(null); return;
        }
        if (state.hiId) { state.setHiId(null); return; }
        if (state.selectedColorId) { state.setSelectedColorId(null); return; }
        return;
      }

      if (e.key === "?") { state.setModal(function(m) { return m === "shortcuts" ? null : "shortcuts"; }); return; }
      if (!state.pat) return;
      if (creatorMode === "create") {
        if (e.key === "=" || e.key === "+") { state.setZoom(function(z) { return Math.min(3, +(z + 0.1).toFixed(2)); }); return; }
        if (e.key === "-") { state.setZoom(function(z) { return Math.max(0.05, +(z - 0.1).toFixed(2)); }); return; }
        if (e.key === "0") { state.fitZ(); return; }
        return;
      }

      if (e.key === "1") { if (state.hiId) { state.setHighlightMode("isolate"); return; } state.selectStitchType("cross"); return; }
      if (e.key === "2") { if (state.hiId) { state.setHighlightMode("outline"); return; } state.selectStitchType("half-fwd"); return; }
      if (e.key === "3") { if (state.hiId) { state.setHighlightMode("tint"); return; } state.selectStitchType("half-bck"); return; }
      if (e.key === "4") { if (state.hiId) { state.setHighlightMode("spotlight"); return; } state.selectStitchType("backstitch"); return; }
      if (e.key === "5") { state.selectStitchType("erase"); return; }
      if (e.key === "w" || e.key === "W") {
        if (state.activeTool === "magicWand") { state.setActiveTool(null); }
        else { state.setActiveTool("magicWand"); state.setPartialStitchTool(null); state.setBsStart(null); }
        return;
      }
      if (e.key === "p" || e.key === "P") {
        if (!state.partialStitchTool && state.activeTool !== "backstitch") state.setBrushAndActivate("paint");
        return;
      }
      if (e.key === "f" || e.key === "F") {
        if (!state.partialStitchTool && state.activeTool !== "backstitch") state.setBrushAndActivate("fill");
        return;
      }
      if (e.key === "i" || e.key === "I") {
        state.setActiveTool("eyedropper"); state.setBsStart(null); state.setPartialStitchTool(null);
        return;
      }
      if (e.key === "v" || e.key === "V") {
        state.setView(function(v) { return v === "color" ? "symbol" : v === "symbol" ? "both" : "color"; });
        return;
      }
      if (e.key === "\\") {
        var nextSplit = !state.splitPaneEnabled;
        state.setSplitPaneEnabled(nextSplit);
        if (typeof UserPrefs !== "undefined") UserPrefs.set("splitPaneEnabled", nextSplit);
        return;
      }
      if (e.key === "=" || e.key === "+") { state.setZoom(function(z) { return Math.min(3, +(z + 0.1).toFixed(2)); }); return; }
      if (e.key === "-") { state.setZoom(function(z) { return Math.max(0.05, +(z - 0.1).toFixed(2)); }); return; }
      if (e.key === "0") { state.fitZ(); return; }
    }

    window.addEventListener("keydown", handleKeyDown);
    return function() { window.removeEventListener("keydown", handleKeyDown); };
  }, [
    state.activeTool, state.bsStart, state.isActive,
    state.editHistory, state.redoHistory, state.pat, state.pal,
    state.namePromptOpen, state.modal, state.overflowOpen,
    state.selectedColorId, state.partialStitchTool, state.hiId,
    state.hasSelection, state.lassoInProgress, state.highlightMode,
    state.splitPaneEnabled, creatorMode,
    history.undoEdit, history.redoEdit, io.saveProject,
  ]);
};
