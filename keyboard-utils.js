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
})();
