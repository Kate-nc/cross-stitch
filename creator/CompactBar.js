/* creator/CompactBar.js — the Creator's compact phone chrome (audit COMMON-03).
 *
 * Under 900px wide the global header, the outcome action bar
 * (creator/ActionBar.js), the tool strip and the Stitch Score banner used to
 * stack up to more than half of a phone screen above the chart. In that
 * layout this file supplies:
 *
 *   window.useCreatorCompact()  → true while the viewport is under 900px.
 *   window.CreatorCompactTopBar → one 48px bar: Home, project name (tap to
 *     rename), save status icon, Convert / Edit / Materials and a More
 *     button. More opens a sheet with Print PDF, Export…, Open in Tracker,
 *     Pattern info, the Stitch Score, Help and links to the other tools.
 *
 * The bottom tool rail lives in creator/ToolStrip.js (it shares the More
 * panel there). CSS: the "Compact phone chrome" block in styles.css, keyed
 * on body.creator-compact, which creator-main.js sets.
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 */

(function () {
  var COMPACT_QUERY = "(max-width: 899px)";

  function matches() {
    try { return !!(window.matchMedia && window.matchMedia(COMPACT_QUERY).matches); } catch (_) { return false; }
  }

  window.CREATOR_COMPACT_QUERY = COMPACT_QUERY;
  window.useCreatorCompact = function useCreatorCompact() {
    var st = React.useState(matches);
    var compact = st[0], setCompact = st[1];
    React.useEffect(function () {
      if (!window.matchMedia) return undefined;
      var mq = window.matchMedia(COMPACT_QUERY);
      var on = function () { setCompact(mq.matches); };
      on();
      if (mq.addEventListener) mq.addEventListener("change", on); else if (mq.addListener) mq.addListener(on);
      return function () {
        if (mq.removeEventListener) mq.removeEventListener("change", on); else if (mq.removeListener) mq.removeListener(on);
      };
    }, []);
    return compact;
  };

  function saveStatusIcon(status, savedAt, Icons) {
    var effective = status || (savedAt ? "saved" : "idle");
    if (effective === "saving" || effective === "pending") return { icon: Icons.spinner ? Icons.spinner() : null, label: effective === "saving" ? "Saving…" : "Editing…", tone: "muted" };
    if (effective === "error") return { icon: Icons.cloudAlert ? Icons.cloudAlert() : Icons.warning(), label: "Save failed", tone: "danger" };
    return { icon: Icons.cloudCheck ? Icons.cloudCheck() : Icons.check(), label: "All changes saved", tone: "ok" };
  }

  window.CreatorCompactTopBar = function CreatorCompactTopBar(props) {
    var h = React.createElement;
    var Icons = window.Icons || {};
    var sheetState = React.useState(false);
    var sheetOpen = sheetState[0], setSheetOpen = sheetState[1];
    var exportState = React.useState(false);
    var exportOpen = exportState[0], setExportOpen = exportState[1];
    var infoState = React.useState(false);
    var infoOpen = infoState[0], setInfoOpen = infoState[1];
    var moreBtnRef = React.useRef(null);
    var infoBtnRef = React.useRef(null);

    var hasPat = !!props.pat;
    var appMode = props.appMode;
    var tab = props.tab;

    // Escape closes the sheet.
    React.useEffect(function () {
      if (!sheetOpen) return undefined;
      function onKey(e) { if (e.key === "Escape") { setSheetOpen(false); if (moreBtnRef.current) moreBtnRef.current.focus(); } }
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("keydown", onKey); };
    }, [sheetOpen]);

    function close() { setSheetOpen(false); setExportOpen(false); }
    function run(fn) { return function () { close(); if (typeof fn === "function") fn(); }; }

    var status = saveStatusIcon(props.saveStatus, props.savedAt, Icons);

    // Convert / Edit / Materials — icon segmented control with labels for
    // screen readers (visible labels sit in the More sheet's heading).
    var modes = [
      { id: "convert", label: "Convert", icon: Icons.image, active: appMode === "create",
        disabled: !props.hasImage && !hasPat,
        onClick: function () { if (appMode !== "create" && typeof props.onRequestBackToConvert === "function") props.onRequestBackToConvert(); } },
      { id: "edit", label: "Edit", icon: Icons.pencil, active: appMode === "edit" && tab === "pattern", disabled: !hasPat,
        onClick: function () { if (typeof props.onTabChange === "function") props.onTabChange("pattern"); } },
      { id: "materials", label: "Materials", icon: Icons.layers, active: tab === "materials", disabled: !hasPat,
        onClick: function () { if (typeof props.onTabChange === "function") props.onTabChange("materials"); } }
    ];
    var modeSwitch = h("div", { className: "cc-modes", role: "tablist", "aria-label": "Creator section" },
      modes.map(function (m) {
        return h("button", {
          key: m.id, type: "button", role: "tab",
          className: "cc-btn cc-mode" + (m.active ? " cc-mode--on" : ""),
          "aria-selected": m.active ? "true" : "false",
          "aria-label": m.label, title: m.label,
          disabled: m.disabled,
          onClick: m.onClick
        }, m.icon ? m.icon() : m.label);
      })
    );

    var bar = h("div", { className: "creator-compact-top", role: "toolbar", "aria-label": "Pattern" },
      h("a", { href: "home.html", className: "cc-btn cc-home", "aria-label": "Home", title: "Home" },
        Icons.chevronLeft ? Icons.chevronLeft() : null),
      h("button", {
        type: "button", className: "cc-name",
        onClick: function () { window.dispatchEvent(new CustomEvent("cs:openRename")); },
        disabled: !hasPat,
        title: "Rename", "aria-label": "Rename “" + (props.projectName || "pattern") + "”"
      },
        h("span", { className: "cc-name__text" }, props.projectName || "New pattern"),
        hasPat && Icons.pencil ? h("span", { className: "cc-name__icon", "aria-hidden": "true" }, Icons.pencil()) : null
      ),
      hasPat ? h("span", {
        className: "cc-save cc-save--" + status.tone, role: "status", "aria-label": status.label, title: status.label
      }, status.icon) : null,
      // Convert: Generate stays one tap away (it is also in the settings drawer).
      appMode === "create" && props.hasImage ? h("button", {
        type: "button", className: "cc-generate",
        "data-onboard": "creator-generate",
        disabled: !!props.generatingPattern,
        onClick: props.generatingPattern ? undefined : props.onGenerate,
        "aria-label": props.generatingPattern ? "Generating\u2026" : hasPat ? "Regenerate pattern" : "Generate pattern",
        title: hasPat ? "Regenerate pattern" : "Generate pattern"
      }, props.generatingPattern ? (Icons.spinner ? Icons.spinner() : null) : (Icons.refresh ? Icons.refresh() : null),
        h("span", null, props.generatingPattern ? "Generating\u2026" : hasPat ? "Regenerate" : "Generate")) : modeSwitch,
      h("button", {
        ref: moreBtnRef, type: "button", className: "cc-btn cc-more",
        "aria-haspopup": "dialog", "aria-expanded": sheetOpen ? "true" : "false",
        "aria-label": "More actions", title: "More actions",
        onClick: function () { setSheetOpen(!sheetOpen); }
      }, Icons.more ? Icons.more() : Icons.menu())
    );

    var score = props.stitchScore;
    var sheet = sheetOpen ? h(React.Fragment, null,
      h("div", { className: "cc-sheet-backdrop", onClick: close }),
      h("div", { className: "cc-sheet", role: "dialog", "aria-modal": "true", "aria-label": "Pattern actions" },
        h("div", { className: "cc-sheet__handle", "aria-hidden": "true" }),
        hasPat ? h("button", { type: "button", className: "cc-sheet__item cc-sheet__item--primary", onClick: run(props.onPrintPdf) },
          Icons.printer ? Icons.printer() : null, h("span", null, "Print PDF")) : null,
        hasPat ? h("button", {
          type: "button", className: "cc-sheet__item", "aria-expanded": exportOpen ? "true" : "false",
          onClick: function () { setExportOpen(!exportOpen); }
        }, Icons.document ? Icons.document() : null, h("span", null, "Export…"),
          h("span", { className: "cc-sheet__chev", "aria-hidden": "true" }, exportOpen ? Icons.chevronUp() : Icons.chevronDown())) : null,
        hasPat && exportOpen ? h("div", { className: "cc-sheet__sub" },
          h("button", { type: "button", className: "cc-sheet__item", onClick: run(props.onSaveJson) },
            Icons.save ? Icons.save() : null, h("span", null, "Save project (.json)")),
          h("button", { type: "button", className: "cc-sheet__item", onClick: run(props.onMoreExports) },
            Icons.archive ? Icons.archive() : null, h("span", null, "More export options…"))
        ) : null,
        hasPat ? h("button", { type: "button", className: "cc-sheet__item", onClick: run(props.onTrackPattern) },
          Icons.chevronRight ? Icons.chevronRight() : null, h("span", null, "Open in Tracker")) : null,
        hasPat ? h("button", {
          ref: infoBtnRef, type: "button", className: "cc-sheet__item",
          onClick: function () { close(); setInfoOpen(true); }
        }, Icons.info ? Icons.info() : null, h("span", null, "Pattern info"),
          props.difficulty ? h("span", { className: "cc-sheet__meta" }, props.difficulty.label) : null) : null,
        score != null ? h("div", { className: "cc-sheet__score", title: "Higher score = easier to stitch: fewer isolated single stitches." },
          h("span", { className: "cc-sheet__score-lbl" }, "Stitch Score"),
          h("span", { className: "cc-sheet__score-val" }, score + "/100"),
          props.stitchScoreNote ? h("span", { className: "cc-sheet__meta" }, props.stitchScoreNote) : null) : null,
        h("div", { className: "cc-sheet__sep", role: "separator" }),
        h("button", { type: "button", className: "cc-sheet__item", onClick: run(function () { if (window.HelpDrawer) window.HelpDrawer.open({ tab: "help" }); }) },
          Icons.help ? Icons.help() : null, h("span", null, "Help")),
        typeof props.onPreferences === "function" ? h("button", { type: "button", className: "cc-sheet__item", onClick: run(props.onPreferences) },
          Icons.settings ? Icons.settings() : null, h("span", null, "Preferences")) : null,
        h("div", { className: "cc-sheet__links" },
          h("a", { href: "home.html", className: "cc-sheet__link" }, "Home"),
          h("a", { href: "manager.html", className: "cc-sheet__link" }, "Stash"),
          h("a", { href: "index.html?mode=stats&from=home", className: "cc-sheet__link" }, "Stats")
        )
      )
    ) : null;

    var info = infoOpen && typeof window.CreatorPatternInfoPopover !== "undefined"
      ? h(window.CreatorPatternInfoPopover, {
          open: true,
          onClose: function () { setInfoOpen(false); },
          triggerRef: moreBtnRef,
          sW: props.sW, sH: props.sH, fabricCt: props.fabricCt,
          colourCount: props.colourCount, skeinEstimate: props.skeinEstimate,
          totalStitchable: props.totalStitchable, difficulty: props.difficulty,
          solidPct: props.solidPct, stitchSpeed: props.stitchSpeed, doneCount: props.doneCount
        })
      : null;

    return h(React.Fragment, null, bar, sheet, info);
  };
})();
