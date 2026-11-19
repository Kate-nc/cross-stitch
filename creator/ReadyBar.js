/* creator/ReadyBar.js — "Your pattern is ready", shown once at the top of the
   chart right after Generate (reports/create-from-image-workflow, decision 3).

   It replaces the four notices that used to arrive together after Generate
   (the "Pattern generated and saved" toast, the Tools tab tip, the Ready to
   stitch review note and the keyboard-shortcuts hint): one line saying what
   was made, and the three things most people do next, Print PDF, Open in
   Tracker and Threads to buy. Close it, or start editing, and it goes; the
   editing tips then appear one at a time as before.

   Reads AppContext (readyBarOpen, setReadyBarOpen, printPdf,
   handleOpenInTracker, setTab, setMaterialsTab) and PatternDataContext.
   Concatenated into creator/bundle.js before PatternTab.js, which renders it. */

(function () {
  var h = React.createElement;

  // "100 × 75 stitches, 15 threads, 16 chart symbols (1 is a blend of two
  // threads), about 3 skeins". The counts come from the chart itself.
  function readySummary(sW, sH, pal, totalSkeins) {
    var parts = [Number(sW).toLocaleString("en-GB") + " × " + Number(sH).toLocaleString("en-GB") + " stitches"];
    var tc = typeof window.creatorThreadCounts === "function" ? window.creatorThreadCounts(pal) : null;
    if (tc && typeof window.threadCountsSentence === "function") parts.push(window.threadCountsSentence(tc));
    var sk = Number(totalSkeins);
    if (sk > 0) parts.push("about " + Math.ceil(sk).toLocaleString("en-GB") + " skein" + (Math.ceil(sk) === 1 ? "" : "s"));
    return { text: parts.join(", "), blends: tc ? tc.blends : 0 };
  }
  window.creatorReadySummary = readySummary;

  function readySaveState(saveStatus, savedAt) {
    if (saveStatus === "error" || saveStatus === "conflict") {
      return { state: "error", text: "Couldn't save on this device" };
    }
    if (saveStatus === "pending" || saveStatus === "saving") {
      return { state: "saving", text: "Saving on this device\u2026" };
    }
    if (saveStatus === "saved" || (saveStatus === "idle" && savedAt)) {
      return { state: "saved", text: "Saved on this device" };
    }
    if (!saveStatus && savedAt) {
      return { state: "saved", text: "Saved on this device" };
    }
    return { state: "saving", text: "Saving on this device\u2026" };
  }
  window.creatorReadySaveState = readySaveState;

  window.CreatorReadyBar = function CreatorReadyBar() {
    var app = window.useApp();
    var ctx = window.usePatternData();
    if (!app.readyBarOpen || !ctx.pat || !ctx.pal) return null;
    var Icons = window.Icons || {};
    var compact = typeof window.useCreatorCompact === "function" ? window.useCreatorCompact() : false;
    var coarse = !!(window.Platform && typeof window.Platform.isCoarsePointer === "function" && window.Platform.isCoarsePointer());
    var s = readySummary(ctx.sW, ctx.sH, ctx.pal, ctx.totalSkeins);
    var save = readySaveState(app.saveStatus, app.savedAt);
    var isError = save.state === "error";
    function close() { app.setReadyBarOpen(false); }
    function then(fn) { return function () { close(); fn(); }; }
    function openPaletteAndFocus() {
      if (app.setSidebarTab) app.setSidebarTab("palette");
      if (app.setPanelOpen) app.setPanelOpen(true);
      var focusFirst = function () {
        var row = document.querySelector(".pal-rows .pal-row");
        if (row && typeof row.focus === "function") row.focus();
      };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(function () { setTimeout(focusFirst, 0); });
      } else {
        setTimeout(focusFirst, 0);
      }
    }
    var fromTracker = !!app.pictureFromTracker;
    function trackBtn(primary) {
      return app.handleOpenInTracker ? h("button", { key: "track", type: "button", className: "btn btn-sm" + (primary ? " btn-primary" : ""), onClick: then(app.handleOpenInTracker) },
        Icons.pointing ? Icons.pointing() : null, h("span", null, "Open in Tracker")) : null;
    }
    var chooseThreadBtn = h("button", {
      key: "choose-thread",
      type: "button",
      className: "btn btn-sm" + (!compact && !fromTracker ? " btn-primary" : ""),
      onClick: openPaletteAndFocus
    }, Icons.palette ? Icons.palette() : (Icons.thread ? Icons.thread() : null), h("span", null, "Choose a thread"));
    var saveLine = save.state === "saved"
      ? (save.text + (fromTracker ? "; Open in Tracker to start stitching it." : "."))
      : (save.state === "saving" ? save.text : save.text + ".");
    return h("section", { className: "ready-bar" + (isError ? " ready-bar--error" : ""), role: "region", "aria-label": "Your pattern is ready" },
      h("span", { className: "ready-bar__icon", "aria-hidden": "true" },
        isError ? (Icons.warning ? Icons.warning() : null) : (Icons.check ? Icons.check() : null)),
      h("div", { className: "ready-bar__text" },
        h("strong", { className: "ready-bar__title" }, "Your pattern is ready"),
        h("span", { className: "ready-bar__summary", "data-ready-summary": "" },
          s.text + ". ",
          h("span", { className: "ready-bar__save-status", "data-ready-save-status": save.state, role: isError ? "alert" : "status" }, saveLine)),
        h("span", { className: "ready-bar__next", "data-ready-next": "" },
          coarse ? "Choose a thread, then tap a square to change it." : "Choose a thread, then click a square to change it."),
        isError && h("span", { className: "ready-bar__save-actions" },
          app.retryAutoSave ? h("button", { type: "button", className: "btn btn-sm", onClick: function () { app.retryAutoSave(); } },
            Icons.refresh ? Icons.refresh() : null, h("span", null, "Retry")) : null,
          app.saveProject ? h("button", { type: "button", className: "btn btn-sm", onClick: function () { app.saveProject(); } },
            Icons.save ? Icons.save() : null, h("span", null, "Download project (.json)")) : null),
        h("span", { className: "ready-bar__links" },
          h("button", { type: "button", className: "ready-bar__link", onClick: then(function () { app.setMaterialsTab("review"); app.setTab("materials"); }) }, "Ready to stitch review"),
          s.blends > 0 && window.openBlendHelp && window.BLEND_HELP
            ? h("button", { type: "button", className: "ready-bar__link", onClick: function () { window.openBlendHelp(); } }, window.BLEND_HELP.title)
            : null)),
      h("div", { className: "ready-bar__actions" },
        // On desktop, Print PDF and Open in Tracker live in the ActionBar only;
        // on phones (no ActionBar) the Ready bar keeps them. Pictures from the
        // Tracker keep Open in Tracker first and primary everywhere.
        compact && fromTracker && trackBtn(true),
        chooseThreadBtn,
        compact && app.printPdf && h("button", { key: "print", type: "button", className: "btn btn-sm" + (fromTracker ? "" : " btn-primary"), onClick: then(app.printPdf) },
          Icons.printer ? Icons.printer() : null, h("span", null, "Print PDF")),
        compact && !fromTracker && trackBtn(false),
        h("button", { key: "threads", type: "button", className: "btn btn-sm", onClick: then(function () { app.setMaterialsTab("threads"); app.setTab("materials"); }) },
          Icons.thread ? Icons.thread() : null, h("span", null, "Threads to buy"))),
      h("button", { type: "button", className: "ready-bar__close", onClick: close, "aria-label": "Close: keep editing", title: "Close" },
        Icons.x ? Icons.x() : null));
  };
})();
