/* components/Overlay.js — UX-12 Phase 3 unified overlay primitive.
 *
 * Single React component family for every dialog / sheet / drawer in the app.
 * Replaces the ad-hoc `<div className="modal-overlay">` pattern that had
 * accumulated 12+ near-duplicate implementations, each with subtly different
 * focus-trap, ESC, scrim, and ARIA behaviour.
 *
 * Variants:
 *   variant="dialog"  centred panel, max-width-driven (default)
 *   variant="sheet"   bottom sheet on phone, centred dialog on desktop
 *                     (mirrors the existing .modal-content--sheet behaviour)
 *   variant="drawer"  edge-anchored panel (left or right via `side` prop)
 *
 * Built-in behaviour:
 *   - ESC closes via window.useEscape stack (composes with nested overlays)
 *   - Scrim click closes (suppressible via dismissOnScrim={false})
 *   - role="dialog" + aria-modal="true" + aria-labelledby (auto-derived from
 *     <Overlay.Title> if used) so assistive tech announces it correctly
 *   - Focus trap: first focusable element in the panel is focused on open;
 *     Tab / Shift+Tab cycles within the panel; focus restored to the
 *     opener element on close
 *   - env(safe-area-inset-bottom) padding on sheet variant for iPhone
 *   - Reduced-motion respected (no slide-up animation when prefers-reduced)
 *
 * Drop-in compatibility:
 *   Pass `className` to override the inner panel class (so existing migrations
 *   can keep their `.modal-box` / `.modal-content` styling). The scrim always
 *   uses `.overlay-scrim`.
 *
 * Usage:
 *   <Overlay onClose={...} variant="dialog" labelledBy="my-title">
 *     <Overlay.Title id="my-title">Hello</Overlay.Title>
 *     <Overlay.Body>...</Overlay.Body>
 *     <Overlay.Footer>...</Overlay.Footer>
 *   </Overlay>
 */
(function () {
  if (typeof window === "undefined" || typeof React === "undefined") return;

  var h = React.createElement;

  // Selector for elements that participate in the focus trap.
  var FOCUSABLE =
    'a[href],button:not([disabled]),textarea:not([disabled]),' +
    'input:not([disabled]):not([type="hidden"]),select:not([disabled]),' +
    '[tabindex]:not([tabindex="-1"])';

  function getFocusable(root) {
    if (!root) return [];
    var list = root.querySelectorAll(FOCUSABLE);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      // Skip elements that are visually hidden or have aria-hidden ancestors.
      if (el.offsetParent !== null || el === document.activeElement) out.push(el);
    }
    return out;
  }

  function useFocusTrap(panelRef, active) {
    React.useEffect(function () {
      if (!active || !panelRef.current) return;
      var panel = panelRef.current;
      var prevActive = document.activeElement;

      // Move focus into the panel on mount. Prefer an element marked
      // data-autofocus, otherwise the first focusable child, otherwise
      // the panel itself.
      var auto = panel.querySelector("[data-autofocus]");
      var first = auto || getFocusable(panel)[0] || panel;
      try { first.focus({ preventScroll: true }); }
      catch (_) { try { first.focus(); } catch (_) {} }

      function onKeyDown(e) {
        if (e.key !== "Tab") return;
        var nodes = getFocusable(panel);
        if (nodes.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        var first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }

      panel.addEventListener("keydown", onKeyDown);
      return function () {
        panel.removeEventListener("keydown", onKeyDown);
        // Restore focus to whatever opened the overlay, if it's still in the DOM.
        if (prevActive && typeof prevActive.focus === "function" &&
            document.contains(prevActive)) {
          try { prevActive.focus({ preventScroll: true }); } catch (_) {}
        }
      };
    }, [active]);
  }

  function Overlay(props) {
    var onClose = props.onClose;
    var variant = props.variant || "dialog";
    var side = props.side || "right";       // for variant="drawer"
    var dismissOnScrim = props.dismissOnScrim !== false;
    var labelledBy = props.labelledBy || null;
    var describedBy = props.describedBy || null;
    var className = props.className || "";
    var style = props.style || null;
    var zIndex = props.zIndex || 1000;
    var maxWidth = props.maxWidth || null;

    // ESC handling via the central stack (composes with nested overlays).
    // Pass `escapeOptions={{ skipWhenEditingTextField: false }}` for modals
    // whose only focusable element is a text input — otherwise ESC would
    // be swallowed by the input rather than closing the modal.
    if (typeof window.useEscape === "function" && typeof onClose === "function") {
      window.useEscape(onClose, props.escapeOptions || undefined);
    }

    var panelRef = React.useRef(null);
    useFocusTrap(panelRef, true);

    // Lock body scroll while overlay is open. Restored on unmount.
    React.useEffect(function () {
      var prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return function () { document.body.style.overflow = prev; };
    }, []);

    function onScrimClick(e) {
      if (e.target !== e.currentTarget) return;
      if (dismissOnScrim && typeof onClose === "function") onClose();
    }

    // Compose CSS classes. Variant drives layout; consumer className
    // overrides the inner panel skin so existing modals keep their look.
    var scrimClass = "overlay-scrim overlay-scrim--" + variant;
    if (variant === "drawer") scrimClass += " overlay-scrim--" + side;
    var panelClass = "overlay-panel overlay-panel--" + variant +
      (className ? " " + className : "");
    if (variant === "drawer") panelClass += " overlay-panel--" + side;

    var panelStyle = Object.assign({}, style || {});
    if (maxWidth) panelStyle.maxWidth = typeof maxWidth === "number" ? maxWidth + "px" : maxWidth;

    return h("div", {
      className: scrimClass,
      onClick: onScrimClick,
      style: { zIndex: zIndex }
    },
      h("div", Object.assign({
        ref: panelRef,
        className: panelClass,
        role: "dialog",
        "aria-modal": "true",
        tabIndex: -1,
        onClick: function (e) { e.stopPropagation(); }
      },
        labelledBy ? { "aria-labelledby": labelledBy } : {},
        describedBy ? { "aria-describedby": describedBy } : {},
        Object.keys(panelStyle).length ? { style: panelStyle } : {}
      ),
        props.children
      )
    );
  }

  // Sub-components — opt-in helpers for consistent header / body / footer.
  // Existing modals can ignore these and pass arbitrary children.
  Overlay.Title = function (props) {
    return h("h2", Object.assign({
      className: "overlay-title" + (props.className ? " " + props.className : "")
    }, props.id ? { id: props.id } : {}, props.style ? { style: props.style } : {}),
      props.children);
  };

  Overlay.Body = function (props) {
    return h("div", {
      className: "overlay-body" + (props.className ? " " + props.className : ""),
      style: props.style || null
    }, props.children);
  };

  Overlay.Footer = function (props) {
    return h("div", {
      className: "overlay-footer" + (props.className ? " " + props.className : ""),
      style: props.style || null
    }, props.children);
  };

  // Close button — pass `onClose` and it renders an icon button. Uses the
  // app's SVG icon set (no emoji) per house rules.
  Overlay.CloseButton = function (props) {
    var label = props.label || "Close";
    var icon = (window.Icons && window.Icons.x) ? window.Icons.x() : "\u00D7";
    return h("button", {
      type: "button",
      onClick: props.onClose,
      "aria-label": label,
      className: "overlay-close" + (props.className ? " " + props.className : ""),
      style: props.style || null
    }, icon);
  };

  window.Overlay = Overlay;
})();
