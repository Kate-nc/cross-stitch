// keyboard-utils.js — Shared keyboard helpers.
//
// window.useEscape(handler, options) — React hook that registers an ESC handler
// in a global stack. Only the most-recently-mounted handler fires per ESC press,
// which fixes nested-modal scenarios where the page or an outer modal would
// otherwise also respond to the same key event.
//
// Implementation notes:
//   * Handlers are stored in module-level _stack; each entry { id, fn, opts }.
//   * One document-level keydown listener is installed lazily on first use.
//   * The listener walks the stack from the top, finds the first enabled
//     handler, calls it, and stops propagation. This guarantees outer
//     handlers never see ESC while an inner modal is open.
//   * If `options.skipWhenEditingTextField` is true (default for modals), the
//     handler is suppressed when the focused element is a text input/textarea
//     so the user can press ESC to revert inline edits without closing the
//     surrounding modal.

(function () {
  if (typeof window === "undefined" || typeof React === "undefined") return;

  var _stack = [];
  var _installed = false;
  var _nextId = 1;

  function isTextInputFocused() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = (el.tagName || "").toUpperCase();
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      var type = (el.getAttribute("type") || "text").toLowerCase();
      // Only suppress for text-style inputs; checkboxes, buttons etc. are safe.
      return ["text", "search", "email", "url", "tel", "password", "number"].indexOf(type) !== -1;
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function onKeyDown(e) {
    if (e.key !== "Escape" && e.keyCode !== 27) return;
    if (!_stack.length) return;
    // Walk from top of stack; first enabled handler wins.
    for (var i = _stack.length - 1; i >= 0; i--) {
      var entry = _stack[i];
      var opts = entry.opts || {};
      if (opts.skipWhenEditingTextField !== false && isTextInputFocused()) {
        // Let the inline editor handle its own ESC (e.g. revert + blur).
        return;
      }
      try { entry.fn(e); }
      catch (err) { /* swallow so other handlers don't break */ }
      e.stopPropagation();
      e.preventDefault();
      return;
    }
  }

  function ensureInstalled() {
    if (_installed) return;
    _installed = true;
    document.addEventListener("keydown", onKeyDown, true); // capture phase
  }

  function useEscape(handler, options) {
    React.useEffect(function () {
      if (typeof handler !== "function") return;
      ensureInstalled();
      var id = _nextId++;
      _stack.push({ id: id, fn: handler, opts: options || {} });
      return function () {
        for (var i = _stack.length - 1; i >= 0; i--) {
          if (_stack[i].id === id) { _stack.splice(i, 1); break; }
        }
      };
    }, [handler]);
  }

  // Test/diagnostic accessors (not part of the public API).
  useEscape._stackSize = function () { return _stack.length; };
  useEscape._reset = function () { _stack = []; };

  window.useEscape = useEscape;

  // ─── Global "?" shortcut → dispatch cs:openHelp ──────────────────────────
  // Pressing "?" anywhere outside a text field dispatches a window CustomEvent
  // 'cs:openHelp' that page-level apps listen for to open their Help modal.
  // We do this via a lightweight document-level listener installed once.
  var _helpInstalled = false;
  function installHelpShortcut() {
    if (_helpInstalled) return;
    _helpInstalled = true;
    document.addEventListener("keydown", function (e) {
      // "?" on most layouts is Shift+/; e.key === '?' is the reliable signal.
      if (e.key !== "?") return;
      if (isTextInputFocused()) return;
      // Don't fire when modifier-with-letter combos use ? as part of a chord.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      try {
        window.dispatchEvent(new CustomEvent("cs:openHelp"));
        e.preventDefault();
        e.stopPropagation();
      } catch (_) { /* ignore */ }
    }, true);
  }
  if (typeof document !== "undefined") installHelpShortcut();

  // ─── Help-discoverability hint banner ───────────────────────────────────
  // window.HelpHintBanner — a tiny floating "Press ? for help" pill that
  // appears bottom-right on first visit, dismissible, and remembers the
  // dismissal in localStorage under "cs_help_hint_dismissed". Pages mount
  // <window.HelpHintBanner /> once at the root of their tree.
  var HINT_KEY = "cs_help_hint_dismissed";
  // Show after ~30 s of true idleness on first visit so it doesn't intrude
  // immediately and so it doesn't pop up while the user is actively engaged.
  var HINT_IDLE_MS = 30000;
  var IDLE_EVENTS = ["keydown", "mousemove", "click", "touchstart", "scroll", "wheel"];
  function isTypingTarget(el) {
    if (!el) return false;
    var tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    return false;
  }
  function HelpHintBanner() {
    var _v = React.useState(false);
    var visible = _v[0], setVisible = _v[1];
    var _t = React.useState(function () {
      try { return isTypingTarget(document.activeElement); } catch (_) { return false; }
    });
    var typing = _t[0], setTyping = _t[1];
    // True-idle trigger: any user input resets a 30s countdown. Only after
    // the countdown elapses without further input do we surface the hint.
    React.useEffect(function () {
      var dismissed = false;
      try { dismissed = !!localStorage.getItem(HINT_KEY); } catch (_) {}
      if (dismissed) return;
      var t = null;
      function scheduleShow() {
        if (t) clearTimeout(t);
        t = setTimeout(function () {
          // Re-check at fire time in case another tab dismissed it.
          try { if (localStorage.getItem(HINT_KEY)) return; } catch (_) {}
          setVisible(true);
        }, HINT_IDLE_MS);
      }
      function onActivity() {
        // Once visible, further activity does not re-hide the banner; the
        // user dismisses it explicitly.
        if (visible) return;
        scheduleShow();
      }
      IDLE_EVENTS.forEach(function (e) { window.addEventListener(e, onActivity, { passive: true, capture: true }); });
      scheduleShow();
      return function () {
        if (t) clearTimeout(t);
        IDLE_EVENTS.forEach(function (e) { window.removeEventListener(e, onActivity, { capture: true }); });
      };
    }, [visible]);
    // Focus-aware: hide while the user is typing in any input/textarea/
    // contenteditable. Returning focus elsewhere reveals the banner again
    // (provided it has already become visible via the idle timer).
    React.useEffect(function () {
      function check() {
        try { setTyping(isTypingTarget(document.activeElement)); } catch (_) {}
      }
      document.addEventListener("focusin", check, true);
      document.addEventListener("focusout", check, true);
      return function () {
        document.removeEventListener("focusin", check, true);
        document.removeEventListener("focusout", check, true);
      };
    }, []);
    if (!visible || typing) return null;
    function dismiss() {
      setVisible(false);
      try { localStorage.setItem(HINT_KEY, "1"); } catch (_) {}
    }
    function open() {
      try { window.dispatchEvent(new CustomEvent("cs:openHelp")); } catch (_) {}
      dismiss();
    }
    return React.createElement("div", {
      role: "status",
      style: {
        position: "fixed", bottom: 16, right: 16, zIndex: 1200,
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px 8px 14px", borderRadius: 999,
        background: "#0f172a", color: "#fff", fontSize: 12,
        boxShadow: "0 6px 20px rgba(15,23,42,0.25)", fontFamily: "inherit"
      }
    },
      React.createElement("button", {
        onClick: open,
        title: "Open the Help Centre",
        style: { background: "transparent", color: "#fff", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600 }
      },
        "Press ", React.createElement("kbd", { style: { background: "#1e293b", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace", fontWeight: 700 } }, "?"), " for help"
      ),
      React.createElement("button", {
        onClick: dismiss, "aria-label": "Dismiss help hint",
        title: "Dismiss",
        style: { background: "transparent", color: "#cbd5e1", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }
      }, "\u00d7")
    );
  }
  HelpHintBanner.dismissed = function () { try { return !!localStorage.getItem(HINT_KEY); } catch (_) { return false; } };
  HelpHintBanner.reset = function () { try { localStorage.removeItem(HINT_KEY); } catch (_) {} };
  window.HelpHintBanner = HelpHintBanner;
})();
