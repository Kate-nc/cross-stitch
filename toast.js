// toast.js — lightweight toast notification system with optional Undo button.
// Plain JS (no JSX). Exposes window.Toast.{ show, dismiss }.
(function () {
  "use strict";

  var MAX_VISIBLE = 3;
  var toasts = []; // { id, el, timer }
  var nextId = 1;

  function ensureContainer() {
    if (window.Toast._container && document.body.contains(window.Toast._container)) {
      return window.Toast._container;
    }
    var c = document.createElement("div");
    c.setAttribute("data-toast-container", "");
    c.setAttribute("aria-live", "polite");
    c.setAttribute("role", "status");
    c.style.cssText = [
      "position:fixed",
      "bottom:24px",
      "left:50%",
      "transform:translateX(-50%)",
      "z-index:9999",
      "display:flex",
      "flex-direction:column-reverse",
      "gap:8px",
      "pointer-events:none",
      "max-width:calc(100vw - 32px)"
    ].join(";");
    document.body.appendChild(c);
    window.Toast._container = c;
    return c;
  }

  function accentBorder(type) {
    if (type === "success") return "#16a34a";
    if (type === "error") return "#dc2626";
    return "var(--accent, #0d9488)";
  }

  function removeToast(entry, immediate) {
    if (!entry || entry._removed) return;
    entry._removed = true;
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
    var idx = toasts.indexOf(entry);
    if (idx >= 0) toasts.splice(idx, 1);
    var el = entry.el;
    if (!el || !el.parentNode) return;
    if (immediate) {
      el.parentNode.removeChild(el);
      return;
    }
    el.style.opacity = "0";
    el.style.transform = "translateY(10px)";
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 320);
  }

  function show(opts) {
    opts = opts || {};
    var message = opts.message != null ? String(opts.message) : "";
    var type = opts.type || "info";
    var duration = (typeof opts.duration === "number") ? opts.duration : 6000;
    var undoAction = (typeof opts.undoAction === "function") ? opts.undoAction : null;
    var undoLabel = opts.undoLabel || "Undo";

    var container = ensureContainer();

    // Cap visible toasts: dismiss oldest beyond limit.
    while (toasts.length >= MAX_VISIBLE) {
      removeToast(toasts[0], false);
    }

    var id = "toast_" + (nextId++);
    var el = document.createElement("div");
    el.setAttribute("data-toast-id", id);
    el.style.cssText = [
      "display:flex",
      "align-items:center",
      "background:var(--surface, #ffffff)",
      "border:1px solid var(--border, #e2e8f0)",
      "border-left:3px solid " + accentBorder(type),
      "border-radius:var(--radius-lg, 12px)",
      "box-shadow:var(--shadow-md, 0 4px 12px rgba(0,0,0,0.08))",
      "padding:10px 16px",
      "font-size:13px",
      "color:var(--text-primary, #1e293b)",
      "font-family:inherit",
      "pointer-events:auto",
      "animation:toast-in 0.25s ease-out both",
      "transition:opacity 0.3s ease, transform 0.3s ease",
      "max-width:480px"
    ].join(";");

    var msgSpan = document.createElement("span");
    msgSpan.textContent = message;
    msgSpan.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;";
    el.appendChild(msgSpan);

    var entry = { id: id, el: el, timer: null, _removed: false };

    if (undoAction) {
      var undoBtn = document.createElement("button");
      undoBtn.type = "button";
      undoBtn.textContent = undoLabel;
      undoBtn.setAttribute("aria-label", undoLabel);
      undoBtn.style.cssText = [
        "font-weight:600",
        "color:var(--accent, #0d9488)",
        "background:none",
        "border:none",
        "cursor:pointer",
        "margin-left:12px",
        "padding:2px 4px",
        "font-family:inherit",
        "font-size:13px"
      ].join(";");
      undoBtn.addEventListener("click", function () {
        try { undoAction(); } catch (err) { console.error("Toast undo handler failed:", err); }
        removeToast(entry, true);
        // Follow-up confirmation toast.
        show({ message: "Undone", type: "success", duration: 2000 });
      });
      el.appendChild(undoBtn);
    }

    var dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.setAttribute("aria-label", "Dismiss");
    dismissBtn.textContent = "×";
    dismissBtn.style.cssText = [
      "color:var(--text-tertiary, #94a3b8)",
      "font-size:16px",
      "line-height:1",
      "margin-left:8px",
      "background:none",
      "border:none",
      "cursor:pointer",
      "padding:2px 6px",
      "font-family:inherit"
    ].join(";");
    dismissBtn.addEventListener("click", function () { removeToast(entry, false); });
    el.appendChild(dismissBtn);

    container.appendChild(el);
    toasts.push(entry);

    if (duration > 0) {
      entry.timer = setTimeout(function () { removeToast(entry, false); }, duration);
    }

    return id;
  }

  function dismiss(id) {
    for (var i = 0; i < toasts.length; i++) {
      if (toasts[i].id === id) { removeToast(toasts[i], false); return; }
    }
  }

  window.Toast = {
    show: show,
    dismiss: dismiss,
    _container: null
  };
})();
