/* creator/ActionBar.js — UX-12 Phase 5: Creator outcome action bar.
 *
 * A persistent bar mounted above the Creator's tab-host content that
 * promotes the most common outcomes — Print PDF, Track this pattern,
 * and a small Export… menu — without removing or relocating any of the
 * existing per-tab controls. Strictly an alias / fast-path; every menu
 * item routes to a handler that already exists somewhere else in the
 * Creator.
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 * Exposes window.CreatorActionBar.
 *
 * Props:
 *   onPrintPdf      — required; primary "Print PDF" click handler
 *   onTrackPattern  — required; "Track this pattern" click handler
 *   onSaveJson      — required; "Save project (.json)" menu item
 *   onMoreExports   — required; "More export options…" menu item
 *                     (jumps to Materials → Output sub-tab)
 *   sW, sH          — pattern dimensions
 *   fabricCt        — fabric count (e.g. 14)
 *   colourCount     — number of palette colours
 *   skeinEstimate   — pre-computed skein estimate (number, may be null)
 *   ready           — boolean; render nothing when no pattern is loaded
 *
 * Read-only — no internal state beyond the open/closed flag of the
 * Export dropdown menu. No data source wiring, no IndexedDB calls.
 */

window.CreatorActionBar = function CreatorActionBar(props) {
  var h = React.createElement;
  var Icons = window.Icons || {};

  var menuOpenState = React.useState(false);
  var menuOpen = menuOpenState[0];
  var setMenuOpen = menuOpenState[1];
  var menuRef = React.useRef(null);
  var btnRef = React.useRef(null);

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
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return function() {
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

  function statSep() {
    return h("span", {
      className: "creator-actionbar__stat-sep",
      "aria-hidden": "true"
    }, " \u00B7 ");
  }

  // Stats block — British English, ` · ` separator, tabular numerals via CSS.
  var sW = props.sW, sH = props.sH;
  var hasDims = (typeof sW === "number" && typeof sH === "number");
  var hasFabric = (typeof props.fabricCt === "number" && props.fabricCt > 0);
  var hasColours = (typeof props.colourCount === "number" && props.colourCount >= 0);
  var hasSkeins = (typeof props.skeinEstimate === "number" && isFinite(props.skeinEstimate));
  var skeinsRounded = hasSkeins ? Math.max(1, Math.round(props.skeinEstimate)) : null;
  var statsAria = [
    hasDims    ? (sW + " by " + sH + " stitches") : null,
    hasFabric  ? (props.fabricCt + " count fabric") : null,
    hasColours ? (props.colourCount + " colours") : null,
    hasSkeins  ? ("about " + skeinsRounded + " skeins") : null
  ].filter(Boolean).join(", ");

  var statsBlock = h("div", {
      className: "creator-actionbar__stats",
      role: "group",
      "aria-label": "Pattern summary: " + statsAria
    },
    hasDims    && h("span", { className: "creator-actionbar__stat" },
      h("strong", null, sW + " \u00D7 " + sH)),
    hasFabric  && (hasDims    ? statSep() : null),
    hasFabric  && h("span", { className: "creator-actionbar__stat" },
      props.fabricCt + "ct"),
    hasColours && (hasDims || hasFabric ? statSep() : null),
    hasColours && h("span", { className: "creator-actionbar__stat" },
      props.colourCount + " colour" + (props.colourCount === 1 ? "" : "s")),
    hasSkeins  && (hasDims || hasFabric || hasColours ? statSep() : null),
    hasSkeins  && h("span", { className: "creator-actionbar__stat" },
      "~" + skeinsRounded + " skein" + (skeinsRounded === 1 ? "" : "s"))
  );

  return h("div", {
      className: "creator-actionbar",
      role: "toolbar",
      "aria-label": "Pattern actions"
    },
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
      h("button", {
          type: "button",
          className: "creator-actionbar__btn",
          onClick: props.onTrackPattern,
          title: "Open this pattern in the Stitch Tracker"
        },
        Icons.thread ? Icons.thread() : null,
        h("span", null, "Track this pattern")
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
    statsBlock
  );
};
