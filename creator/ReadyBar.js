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

  window.CreatorReadyBar = function CreatorReadyBar() {
    var app = window.useApp();
    var ctx = window.usePatternData();
    if (!app.readyBarOpen || !ctx.pat || !ctx.pal) return null;
    var Icons = window.Icons || {};
    var s = readySummary(ctx.sW, ctx.sH, ctx.pal, ctx.totalSkeins);
    function close() { app.setReadyBarOpen(false); }
    function then(fn) { return function () { close(); fn(); }; }
    return h("section", { className: "ready-bar", role: "region", "aria-label": "Your pattern is ready" },
      h("span", { className: "ready-bar__icon", "aria-hidden": "true" }, Icons.check ? Icons.check() : null),
      h("div", { className: "ready-bar__text" },
        h("strong", { className: "ready-bar__title" }, "Your pattern is ready"),
        h("span", { className: "ready-bar__summary", "data-ready-summary": "" }, s.text + ". It is saved in your library."),
        h("span", { className: "ready-bar__links" },
          h("button", { type: "button", className: "ready-bar__link", onClick: then(function () { app.setMaterialsTab("review"); app.setTab("materials"); }) }, "Ready to stitch review"),
          s.blends > 0 && window.openBlendHelp && window.BLEND_HELP
            ? h("button", { type: "button", className: "ready-bar__link", onClick: function () { window.openBlendHelp(); } }, window.BLEND_HELP.title)
            : null)),
      h("div", { className: "ready-bar__actions" },
        app.printPdf && h("button", { type: "button", className: "btn btn-sm btn-primary", onClick: then(app.printPdf) },
          Icons.printer ? Icons.printer() : null, h("span", null, "Print PDF")),
        app.handleOpenInTracker && h("button", { type: "button", className: "btn btn-sm", onClick: then(app.handleOpenInTracker) },
          Icons.pointing ? Icons.pointing() : null, h("span", null, "Open in Tracker")),
        h("button", { type: "button", className: "btn btn-sm", onClick: then(function () { app.setMaterialsTab("threads"); app.setTab("materials"); }) },
          Icons.thread ? Icons.thread() : null, h("span", null, "Threads to buy"))),
      h("button", { type: "button", className: "ready-bar__close", onClick: close, "aria-label": "Close: keep editing", title: "Close" },
        Icons.x ? Icons.x() : null));
  };
})();
