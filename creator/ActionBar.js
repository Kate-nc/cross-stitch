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
 *   ready            — boolean; render nothing when no pattern is loaded
 */

window.CreatorActionBar = function CreatorActionBar(props) {
  var h = React.createElement;
  var Icons = window.Icons || {};

  var menuOpenState = React.useState(false);
  var menuOpen = menuOpenState[0];
  var setMenuOpen = menuOpenState[1];
  var menuRef = React.useRef(null);
  var btnRef = React.useRef(null);

  var infoOpenState = React.useState(false);
  var infoOpen = infoOpenState[0];
  var setInfoOpen = infoOpenState[1];
  var infoBtnRef = React.useRef(null);

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

  if (!props || !props.ready) return null;

  function safeCall(fn) {
    return function() {
      setMenuOpen(false);
      if (typeof fn === "function") fn();
    };
  }

  // Mode switch (Polish A — was a 3-pip Create/Edit/Track segmented
  // control where "Edit" looked active but did nothing because the bar
  // only mounts in Edit mode. Now rendered as a phase label + two real
  // actions, so every visible control performs an action and the
  // current state is unambiguous.)
  //   ◀ Setup   |   Editing pattern   |   Open in Tracker ▶
  // The Setup button is shown only when there is something to go back
  // to (props.onSwitchToCreate present); Track is always shown.
  var appMode = props.appMode || "edit";
  var setupBtn = (typeof props.onSwitchToCreate === "function") ? h("button", {
      type: "button",
      className: "creator-actionbar__mode-btn creator-actionbar__mode-btn--back",
      onClick: props.onSwitchToCreate,
      title: "Back to Setup (image, dimensions, palette)",
      "aria-label": "Back to setup"
    },
    Icons.chevronLeft ? Icons.chevronLeft() : h("span", { "aria-hidden": "true" }, "\u2039"),
    h("span", null, "Setup")
  ) : null;

  var phaseLabel = h("span", {
      className: "creator-actionbar__mode-phase",
      "aria-live": "polite"
    },
    appMode === "create" ? "Setting up" : "Editing pattern"
  );

  var trackBtn = (typeof props.onTrackPattern === "function") ? h("button", {
      type: "button",
      className: "creator-actionbar__mode-btn creator-actionbar__mode-btn--forward",
      onClick: props.onTrackPattern,
      title: "Open this pattern in the Stitch Tracker",
      "aria-label": "Open in Tracker"
    },
    h("span", null, "Open in Tracker"),
    Icons.chevronRight ? Icons.chevronRight() : h("span", { "aria-hidden": "true" }, "\u203A")
  ) : null;

  var modeSwitch = h("div", {
      className: "creator-actionbar__mode-switch",
      role: "group",
      "aria-label": "Pattern phase"
    },
    setupBtn,
    phaseLabel,
    trackBtn
  );

  // Pattern info chip — replaces the inline four-stat block. Opens the
  // popover (or, on phones, a bottom sheet) with the canonical summary.
  // British English: "Pattern info" / "colours" used inside the popover.
  var infoChip = h("div", { className: "creator-actionbar__info-wrap" },
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
    modeSwitch,
    h("div", { className: "creator-actionbar__primary" },
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
    ),
    infoChip
  );
};
