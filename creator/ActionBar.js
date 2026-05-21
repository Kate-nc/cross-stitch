/* creator/ActionBar.js — UX-12 Phase 5 + Option 2: Creator outcome action bar.
 *
 * A persistent bar mounted above the Creator's tab-host content that
 * promotes the most common outcomes — Print PDF and a small Export…
 * menu — and now also hosts a 3-button Create / Edit / Track mode switch
 * (Option 2) and a `Pattern info` chip that opens a popover with the
 * canonical pattern summary. The previous four-stat inline block was
 * duplicating data shown elsewhere; collapsing it into the popover gives
 * the bar room to breathe and replaces the duplicated `Start Tracking`
 * button that used to live at the bottom of the sidebar.
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 * Exposes window.CreatorActionBar.
 *
 * Props:
 *   onPrintPdf       — required; primary "Print PDF" click handler
 *   onTrackPattern   — required; "Track" mode-switch handler
 *   onSwitchToCreate — required; "Create" mode-switch handler
 *   onSaveJson       — required; "Save project (.json)" menu item
 *   onMoreExports    — required; "More export options…" menu item
 *                      (jumps to Materials → Output sub-tab)
 *   appMode          — "create" | "edit" | "track"; selects the active
 *                      mode-switch button. While mounted in the Creator
 *                      this will always be "edit"; the Edit pip stays
 *                      selected and is a no-op.
 *   sW, sH           — pattern dimensions (popover only)
 *   fabricCt         — fabric count (popover only)
 *   colourCount      — palette length (popover only)
 *   skeinEstimate    — pre-computed skein estimate (popover only)
 *   totalStitchable  — stitch count (popover only)
 *   difficulty       — { stars, color, label } object (popover only)
 *   solidPct         — stitchability percentage (popover only)
 *   stitchSpeed      — stitches/hr (popover only)
 *   doneCount        — stitches completed (popover only)
 *   ready            — boolean; true when a generated pattern is available
 */

window.CreatorActionBar = function CreatorActionBar(props) {
  var h = React.createElement;
  var Icons = window.Icons || {};
  props = props || {};

  var menuOpenState = React.useState(false);
  var menuOpen = menuOpenState[0];
  var setMenuOpen = menuOpenState[1];
  var menuRef = React.useRef(null);
  var btnRef = React.useRef(null);

  var infoOpenState = React.useState(false);
  var infoOpen = infoOpenState[0];
  var setInfoOpen = infoOpenState[1];
  var infoBtnRef = React.useRef(null);
  var tablistRef = React.useRef(null);

  // Click-outside / Escape to close the Export menu.
  React.useEffect(function() {
    if (!menuOpen) return undefined;
    function onDoc(e) {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      setMenuOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        if (btnRef.current && btnRef.current.focus) btnRef.current.focus();
        return;
      }
      // Roving focus inside the menu (matches CreatorMaterialsHub pattern).
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
      if (!menuRef.current) return;
      var items = Array.prototype.slice.call(
        menuRef.current.querySelectorAll('[role="menuitem"]')
      );
      if (!items.length) return;
      var idx = items.indexOf(document.activeElement);
      var next = idx;
      if (e.key === "ArrowDown") next = idx < 0 ? 0 : (idx + 1) % items.length;
      else if (e.key === "ArrowUp") next = idx <= 0 ? items.length - 1 : idx - 1;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      if (items[next] && items[next].focus) {
        items[next].focus();
        e.preventDefault();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    var raf = (typeof requestAnimationFrame === "function") ? requestAnimationFrame : function(fn) { return setTimeout(fn, 0); };
    var cancel = (typeof cancelAnimationFrame === "function") ? cancelAnimationFrame : clearTimeout;
    var focusHandle = raf(function() {
      if (!menuRef.current) return;
      var first = menuRef.current.querySelector('[role="menuitem"]');
      if (first && first.focus) first.focus();
    });
    return function() {
      cancel(focusHandle);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function safeCall(fn) {
    return function() {
      setMenuOpen(false);
      if (typeof fn === "function") fn();
    };
  }

  // ── Tab bar: Convert | Edit | Materials ────────────────────────────────────
  // Convert: active when appMode === "create". Clickable only when another
  //          tab is active; prevents reopening the confirm modal from create.
  // Edit:    active when appMode === "edit". Disabled when no pattern exists.
  // Materials: active when tab === "materials". Always available once pattern exists.
  var appMode = (props && props.appMode) || "edit";
  var currentTab = (props && props.tab) || "pattern";
  var hasPat = !!(props && props.ready);

  function tabStyle(active, disabled) {
    return {
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "5px 12px", borderRadius: "var(--radius-sm)",
      border: "none", cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "inherit", fontSize: "var(--text-sm)", fontWeight: active ? 600 : 400,
      background: active ? "var(--accent)" : "transparent",
      color: active ? "var(--surface)" : disabled ? "var(--text-secondary)" : "var(--text-primary)",
      opacity: disabled ? 0.45 : 1,
      transition: "background var(--motion), color var(--motion)"
    };
  }

  function focusTabByIndex(idx) {
    if (!tablistRef.current) return;
    var tabs = tablistRef.current.querySelectorAll('button[role="tab"]');
    if (tabs && tabs[idx] && tabs[idx].focus) tabs[idx].focus();
  }

  var tabs = [
    {
      active: appMode === "create",
      disabled: false,
      onClick: (appMode === "create" || typeof props.onRequestBackToConvert !== "function")
        ? undefined
        : props.onRequestBackToConvert
    },
    {
      active: appMode === "edit" && currentTab === "pattern",
      disabled: !hasPat,
      onClick: !hasPat ? undefined : function() {
        if (typeof props.onTabChange === "function") props.onTabChange("pattern");
      }
    },
    {
      active: currentTab === "materials",
      disabled: !hasPat,
      onClick: !hasPat ? undefined : function() {
        if (typeof props.onTabChange === "function") props.onTabChange("materials");
      }
    }
  ];
  var activeTabIndex = 0;
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].active) { activeTabIndex = i; break; }
  }

  function onTablistKeyDown(e) {
    var key = e.key;
    if (key !== "ArrowRight" && key !== "ArrowLeft" && key !== "Home" && key !== "End") return;
    e.preventDefault();
    var n = tabs.length;
    var next = activeTabIndex;
    if (key === "ArrowRight" || key === "ArrowLeft") {
      var step = key === "ArrowRight" ? 1 : -1;
      for (var tries = 0; tries < n; tries++) {
        next = (next + step + n) % n;
        if (!tabs[next].disabled) break;
      }
    } else if (key === "Home") {
      for (var hIdx = 0; hIdx < n; hIdx++) { if (!tabs[hIdx].disabled) { next = hIdx; break; } }
    } else if (key === "End") {
      for (var eIdx = n - 1; eIdx >= 0; eIdx--) { if (!tabs[eIdx].disabled) { next = eIdx; break; } }
    }
    if (typeof tabs[next].onClick === "function") tabs[next].onClick();
    setTimeout(function() { focusTabByIndex(next); }, 0);
  }

  var tabBar = h("div", {
      role: "tablist",
      "aria-label": "Creator phase",
      ref: tablistRef,
      onKeyDown: onTablistKeyDown,
      style: {
        display: "flex", alignItems: "center",
        background: "var(--surface-tertiary)",
        borderRadius: "var(--radius-sm)",
        padding: 3, gap: 2
      }
    },
    h("button", {
        type: "button",
        role: "tab",
        "aria-selected": tabs[0].active,
        tabIndex: tabs[0].active ? 0 : -1,
        style: tabStyle(appMode === "create", false),
        onClick: tabs[0].onClick,
        title: "Convert settings — adjust palette, dimensions and generate"
      },
      Icons.sliders ? Icons.sliders() : null,
      h("span", null, "Convert")
    ),
    h("button", {
        type: "button",
        role: "tab",
        "aria-selected": tabs[1].active,
        tabIndex: tabs[1].active ? 0 : -1,
        disabled: !hasPat,
        style: tabStyle(appMode === "edit" && currentTab === "pattern", !hasPat),
        onClick: tabs[1].onClick,
        title: hasPat ? "Edit the generated pattern" : "Generate a pattern first"
      },
      Icons.pencil ? Icons.pencil() : null,
      h("span", null, "Edit")
    ),
    h("button", {
        type: "button",
        role: "tab",
        "aria-selected": tabs[2].active,
        tabIndex: tabs[2].active ? 0 : -1,
        disabled: !hasPat,
        style: tabStyle(currentTab === "materials", !hasPat),
        onClick: tabs[2].onClick,
        title: hasPat ? "Materials — thread count, export options" : "Generate a pattern first"
      },
      Icons.layers ? Icons.layers() : null,
      h("span", null, "Materials")
    )
  );

  var trackBtn = hasPat && (typeof props.onTrackPattern === "function") ? h("button", {
      type: "button",
      className: "creator-actionbar__mode-btn creator-actionbar__mode-btn--forward",
      onClick: props.onTrackPattern,
      title: "Open this pattern in the Stitch Tracker",
      "aria-label": "Open in Tracker"
    },
    h("span", null, "Open in Tracker"),
    Icons.chevronRight ? Icons.chevronRight() : h("span", { "aria-hidden": "true" }, "\u203A")
  ) : null;

  // Difficulty badge — always-visible tier chip, e.g. "Intermediate".
  // Full breakdown is inside the Pattern info popover.
  var difficultyBadge = props.difficulty ? h("span", {
    className: "creator-actionbar__difficulty-chip",
    style: { color: props.difficulty.color, borderColor: props.difficulty.color },
    title: "Difficulty: " + props.difficulty.label + " \u00B7 " + (props.difficulty.score != null ? props.difficulty.score + " / 100" : "") + ". Open \u2018Pattern info\u2019 for the full breakdown."
  }, props.difficulty.label) : null;

  // Pattern info chip — replaces the inline four-stat block. Opens the
  // popover (or, on phones, a bottom sheet) with the canonical summary.
  // British English: "Pattern info" / "colours" used inside the popover.
  var infoChip = h("div", { className: "creator-actionbar__info-wrap" },
    difficultyBadge,
    h("button", {
        ref: infoBtnRef,
        type: "button",
        className: "creator-actionbar__info-trigger",
        onClick: function() { setInfoOpen(!infoOpen); },
        "aria-haspopup": "dialog",
        "aria-expanded": infoOpen ? "true" : "false",
        title: "Pattern dimensions, fabric, colours, skeins"
      },
      h("span", null, "Pattern info"),
      Icons.chevronDown ? Icons.chevronDown() : null
    ),
    infoOpen && typeof window.CreatorPatternInfoPopover !== "undefined"
      ? h(window.CreatorPatternInfoPopover, {
          open: true,
          onClose: function() { setInfoOpen(false); },
          triggerRef: infoBtnRef,
          sW: props.sW,
          sH: props.sH,
          fabricCt: props.fabricCt,
          colourCount: props.colourCount,
          skeinEstimate: props.skeinEstimate,
          totalStitchable: props.totalStitchable,
          difficulty: props.difficulty,
          solidPct: props.solidPct,
          stitchSpeed: props.stitchSpeed,
          doneCount: props.doneCount
        })
      : null
  );

  return h("div", {
      className: "creator-actionbar",
      role: "toolbar",
      "aria-label": "Pattern actions"
    },
    tabBar,
    hasPat ? h("div", { className: "creator-actionbar__primary" },
      h("button", {
          type: "button",
          className: "creator-actionbar__btn creator-actionbar__btn--primary",
          onClick: props.onPrintPdf,
          title: "Print to PDF"
        },
        Icons.printer ? Icons.printer() : null,
        h("span", null, "Print PDF")
      ),
      h("div", { className: "creator-actionbar__menu-wrap" },
        h("button", {
            ref: btnRef,
            type: "button",
            className: "creator-actionbar__btn creator-actionbar__btn--ghost",
            onClick: function() { setMenuOpen(!menuOpen); },
            "aria-haspopup": "menu",
            "aria-expanded": menuOpen ? "true" : "false",
            title: "Other export options"
          },
          Icons.document ? Icons.document() : null,
          h("span", null, "Export\u2026"),
          Icons.chevronDown ? Icons.chevronDown() : null
        ),
        menuOpen && h("div", {
            ref: menuRef,
            className: "creator-actionbar__menu",
            role: "menu",
            "aria-label": "Export options"
          },
          h("button", {
              type: "button",
              role: "menuitem",
              className: "creator-actionbar__menu-item",
              onClick: safeCall(props.onSaveJson)
            },
            Icons.save ? Icons.save() : null,
            h("span", null, "Save project (.json)")
          ),
          h("button", {
              type: "button",
              role: "menuitem",
              className: "creator-actionbar__menu-item",
              onClick: safeCall(props.onMoreExports)
            },
            Icons.archive ? Icons.archive() : null,
            h("span", null, "More export options\u2026")
          )
        )
      )
    ) : h("div", { className: "creator-actionbar__primary" }),
    hasPat ? trackBtn : null,
    hasPat ? infoChip : null
  );
};
