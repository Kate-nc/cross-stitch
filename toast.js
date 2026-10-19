// toast.js — lightweight toast notification system with optional Undo button.
// Plain JS (no JSX). Exposes window.Toast.{ show, dismiss, isBannerOpen }.
//
// On phones (see PHONE_QUERY) toasts become one full-width banner at the bottom,
// never more than one at a time. The rest wait in a queue: errors first, then
// warnings and Undo offers, then ordinary feedback, then first-run notices
// (`priority: 0`). Informational ones dismiss themselves quickly. While the
// banner is up it registers with the Coaching overlay registry (coaching.js), so
// a coachmark waits for it instead of stacking over the chart.
// Elsewhere toasts stack, up to the `toastMaxVisible` preference.
(function () {
  "use strict";

  var PHONE_QUERY = "(max-width: 599px), (pointer: coarse) and (max-height: 500px)";
  var PHONE_INFO_MS = 4000;     // info / success with nothing to press
  var PHONE_ACTION_MS = 6000;   // info / success with a button to press
  var PHONE_QUEUE_MAX = 5;
  var PHONE_STALE_MS = 12000;   // queued feedback older than this is no longer news
  var RANK_FIRST_RUN = 0, RANK_INFO = 1, RANK_NOTICE = 2, RANK_ERROR = 3;

  function isPhone() {
    try { return !!(window.matchMedia && window.matchMedia(PHONE_QUERY).matches); } catch (_) {}
    return false;
  }

  var DEFAULT_MAX_VISIBLE = 3;
  function getMaxVisible() {
    try {
      if (window.UserPrefs && typeof window.UserPrefs.get === "function") {
        var v = window.UserPrefs.get("toastMaxVisible");
        if (typeof v === "number" && v >= 1 && v <= 10) return v;
      }
    } catch (_) {}
    return DEFAULT_MAX_VISIBLE;
  }
  function toastsEnabled() {
    try {
      if (window.UserPrefs && typeof window.UserPrefs.get === "function") {
        var v = window.UserPrefs.get("toastsEnabled");
        if (v === false) return false;
      }
    } catch (_) {}
    return true;
  }
  var toasts = [];   // showing: { id, el, timer, phone, rank, keep, item }
  var queue = [];    // phone, waiting: { id, opts, message, type, rank, keep, at }
  var nextId = 1;
  var bannerRegistered = false;

  // A page with its own bottom bar (Tracker focus bar, Creator rail) lifts the phone
  // banner clear of it from styles.css, keyed on [data-toast-phone="1"].
  function containerCss(phone) {
    return (phone ? [
      "position:fixed",
      "bottom:max(8px, env(safe-area-inset-bottom, 0px))",
      "left:0",
      "right:0",
      "box-sizing:border-box",
      "padding:0 8px",
      "z-index:9999",
      "display:flex",
      "flex-direction:column",
      "gap:8px",
      "pointer-events:none"
    ] : [
      "position:fixed",
      "bottom:max(24px, env(safe-area-inset-bottom, 0px))",
      "left:50%",
      "transform:translateX(-50%)",
      "z-index:9999",
      "display:flex",
      "flex-direction:column-reverse",
      "gap:8px",
      "pointer-events:none",
      "max-width:calc(100vw - 32px)"
    ]).join(";");
  }

  function ensureContainer(phone) {
    var c = window.Toast._container;
    if (!(c && document.body.contains(c))) {
      c = document.createElement("div");
      c.setAttribute("data-toast-container", "");
      c.setAttribute("aria-live", "polite");
      c.setAttribute("role", "status");
      document.body.appendChild(c);
      window.Toast._container = c;
    }
    // Re-read each time: a rotation or a resized window can change which layout applies.
    if (c.getAttribute("data-toast-phone") !== (phone ? "1" : "0")) {
      c.style.cssText = containerCss(phone);
      c.setAttribute("data-toast-phone", phone ? "1" : "0");
    }
    return c;
  }

  function accentBorder(type) {
    if (type === "success") return "var(--success)";
    if (type === "error") return "var(--danger)";
    if (type === "warning") return "var(--warning)";
    return "var(--accent)";
  }

  // Keep the Coaching registry in step with whether a phone banner is showing.
  // Only closes what this file opened, so it never cancels a walkthrough's claim.
  function syncBanner() {
    var open = false;
    for (var i = 0; i < toasts.length; i++) if (toasts[i].phone) { open = true; break; }
    var C = window.Coaching;
    if (open && !bannerRegistered) {
      if (C && typeof C.overlayOpened === "function") { C.overlayOpened(); bannerRegistered = true; }
    } else if (!open && bannerRegistered) {
      bannerRegistered = false;
      if (C && typeof C.overlayClosed === "function") C.overlayClosed();
    }
  }

  function removeToast(entry, immediate, keepQueue) {
    if (!entry || entry._removed) return;
    entry._removed = true;
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
    var idx = toasts.indexOf(entry);
    if (idx >= 0) toasts.splice(idx, 1);
    var el = entry.el;
    var next = entry.phone && !keepQueue && queue.length > 0;
    // The next banner replaces this one in place, so there is never a second on screen.
    if (el && el.parentNode) {
      if (immediate || next) {
        el.parentNode.removeChild(el);
      } else {
        el.style.opacity = "0";
        el.style.transform = "translateY(10px)";
        setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 320);
      }
    }
    if (keepQueue) return;   // the caller is swapping in another banner and syncs afterwards
    if (entry.phone) showNext();
    syncBanner();
  }

  function phoneDuration(opts, type, interactive) {
    var d = (typeof opts.duration === "number") ? opts.duration : 6000;
    if (d <= 0) return d;                                  // the caller asked for it to stay
    if (type === "error" || type === "warning") return d;  // read in full
    return Math.min(d, interactive ? PHONE_ACTION_MS : PHONE_INFO_MS);
  }

  // Build one toast, append it and start its timer. `phone` picks the layout.
  function mount(id, opts, phone, info) {
    var message = opts.message != null ? String(opts.message) : "";
    var type = opts.type || "info";
    var duration = (typeof opts.duration === "number") ? opts.duration : 6000;
    var undoAction = (typeof opts.undoAction === "function") ? opts.undoAction : null;
    var undoLabel = opts.undoLabel || "Undo";
    // Generic action button (Phase C). Distinct from undoAction so callers
    // can offer a follow-up like "View activity" without losing the undo
    // semantics elsewhere. Like undo, action clicks run the handler and
    // then immediately dismiss this toast entry.
    var action = (typeof opts.action === "function") ? opts.action : null;
    var actionLabel = opts.actionLabel || "View";
    // Several actions: [{ label, onClick, keepOpen }]. keepOpen leaves the
    // toast up after the click (e.g. "Copy details").
    var actions = Array.isArray(opts.actions) ? opts.actions.filter(function (a) {
      return a && typeof a.onClick === "function" && a.label;
    }) : [];
    var interactive = !!(undoAction || action || actions.length);
    if (phone) duration = phoneDuration(opts, type, interactive);

    var container = ensureContainer(phone);
    if (phone) {
      // One at a time: clear anything still fading out.
      while (container.firstChild) container.removeChild(container.firstChild);
    } else {
      // Cap visible toasts: dismiss oldest beyond limit.
      var maxVisible = getMaxVisible();
      var plain = toasts.filter(function (t) { return !t.phone; });
      while (plain.length >= maxVisible) {
        removeToast(plain.shift(), false);
      }
    }

    var el = document.createElement("div");
    el.setAttribute("data-toast-id", id);
    el.style.cssText = [
      "display:flex",
      "align-items:center",
      "background:var(--surface, #ffffff)",
      "border:1px solid var(--border)",
      "border-left:3px solid " + accentBorder(type),
      "border-radius:var(--radius-lg, 12px)",
      "box-shadow:var(--shadow-md, 0 4px 12px rgba(0,0,0,0.08))",
      "padding:" + (phone ? "4px 4px 4px 14px" : "10px 16px"),
      "font-size:" + (phone ? "14px" : "13px"),
      "color:var(--text-primary)",
      "font-family:inherit",
      "pointer-events:auto",
      "animation:toast-in 0.25s ease-out both",
      "transition:opacity 0.3s ease, transform 0.3s ease",
      phone ? "box-sizing:border-box;width:100%;flex-wrap:wrap;line-height:1.4"
            : "max-width:min(480px, calc(100vw - 32px))"
    ].join(";");

    // Status icon — prefer the SVG icon library so we match the rest of the
    // app's visual language. Falls back to a coloured pip if the icon library
    // hasn't loaded yet (toast.js can be invoked very early).
    var iconMeta = {
      success: { icon: "check",   color: "var(--success)" },
      error:   { icon: "x",       color: "var(--danger)" },
      warning: { icon: "warning", color: "var(--warning)" }
    };
    var meta = iconMeta[type];
    if (meta) {
      var iconSpan = document.createElement("span");
      iconSpan.setAttribute("aria-hidden", "true");
      iconSpan.style.cssText = "margin-right:8px;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex-shrink:0;color:" + meta.color + ";";
      var svgMarkup = (window.Icons && typeof window.Icons.svgString === "function") ? window.Icons.svgString(meta.icon) : "";
      if (svgMarkup) {
        iconSpan.innerHTML = svgMarkup;
      } else {
        // Pre-load fallback: solid coloured dot, never an emoji glyph.
        iconSpan.style.cssText += "background:" + meta.color + ";border-radius:50%;width:8px;height:8px;";
      }
      el.appendChild(iconSpan);
    }

    var msgSpan = document.createElement("span");
    msgSpan.textContent = message;
    // Phones wrap the whole message; a banner is no place for an ellipsis.
    msgSpan.style.cssText = phone
      ? "flex:1 1 55%;min-width:0;overflow-wrap:anywhere;padding:8px 0;"
      : "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;";
    el.appendChild(msgSpan);

    var entry = { id: id, el: el, timer: null, _removed: false, phone: phone,
      rank: info.rank, keep: !!(info.keep || undoAction || duration <= 0), item: info.item };

    // Phones keep the buttons beside the message when they fit and drop them to the next row when they do not.
    var actionHost = el;
    if (phone && interactive) {
      actionHost = document.createElement("span");
      actionHost.className = "toast-actions";
      actionHost.style.cssText = "order:2;flex:0 0 auto;display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;margin-left:auto;";
      el.appendChild(actionHost);
    }
    var btnPad = phone ? "0 14px" : "2px 4px";
    var btnMin = phone ? ";min-height:44px;min-width:44px" : "";

    if (undoAction) {
      var undoBtn = document.createElement("button");
      undoBtn.type = "button";
      undoBtn.className = "toast-action";
      undoBtn.textContent = undoLabel;
      undoBtn.setAttribute("aria-label", undoLabel);
      undoBtn.style.cssText = [
        "font-weight:600",
        "color:var(--accent)",
        "background:none",
        "border:none",
        "cursor:pointer",
        "margin-left:" + (phone ? "0" : "12px"),
        "padding:" + btnPad,
        "font-family:inherit",
        "font-size:" + (phone ? "14px" : "13px")
      ].join(";") + btnMin;
      undoBtn.addEventListener("click", function () {
        var undone;
        try { undone = undoAction(); } catch (err) { console.error("Toast undo handler failed:", err); }
        removeToast(entry, true);
        // Follow-up confirmation toast (an undo handler that returns false declined, and said so itself).
        if (undone !== false) show({ message: "Undone", type: "success", duration: 2000, priority: RANK_NOTICE });
      });
      actionHost.appendChild(undoBtn);
    }

    function actionButton(label, onClick, keepOpen) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toast-action";
      btn.textContent = label;
      btn.setAttribute("aria-label", label);
      btn.style.cssText = [
        "font-weight:600",
        "color:var(--accent)",
        "background:none",
        "border:none",
        "cursor:pointer",
        "margin-left:" + (phone ? "0" : "12px"),
        "padding:" + btnPad,
        "font-family:inherit",
        "font-size:" + (phone ? "14px" : "13px"),
        "white-space:nowrap"
      ].join(";") + btnMin;
      btn.addEventListener("click", function () {
        try { onClick(); } catch (err) { console.error("Toast action handler failed:", err); }
        if (!keepOpen) removeToast(entry, true);
      });
      return btn;
    }

    if (action) actionHost.appendChild(actionButton(actionLabel, action, false));
    if (actions.length) {
      var actionRow = document.createElement("span");
      actionRow.style.cssText = "display:inline-flex;flex-wrap:wrap;align-items:center;";
      actions.forEach(function (a) { actionRow.appendChild(actionButton(a.label, a.onClick, !!a.keepOpen)); });
      actionHost.appendChild(actionRow);
    }

    var dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.className = "toast-dismiss";
    dismissBtn.setAttribute("aria-label", "Dismiss");
    // The shared close icon (never a typed glyph); the word is the fallback until the icon library has loaded.
    var closeSvg = (window.Icons && typeof window.Icons.svgString === "function") ? window.Icons.svgString("x") : "";
    if (closeSvg) {
      dismissBtn.innerHTML = closeSvg;
      dismissBtn.style.display = "inline-flex";
      dismissBtn.style.alignItems = "center";
    } else {
      dismissBtn.textContent = "Close";
    }
    dismissBtn.style.cssText = [
      "color:var(--text-tertiary)",
      "font-size:16px",
      "line-height:1",
      "margin-left:8px",
      "background:none",
      "border:none",
      "cursor:pointer",
      "padding:2px 6px",
      "font-family:inherit"
    ].join(";") + (phone ? ";order:3;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center" : "");
    dismissBtn.addEventListener("click", function () { removeToast(entry, false); });
    el.appendChild(dismissBtn);

    container.appendChild(el);
    toasts.push(entry);

    if (duration > 0) {
      entry.timer = setTimeout(function () { removeToast(entry, false); }, duration);
    }
    return entry;
  }

  function rankOf(opts, type) {
    if (typeof opts.priority === "number") return opts.priority;
    if (type === "error") return RANK_ERROR;
    if (type === "warning" || typeof opts.undoAction === "function") return RANK_NOTICE;
    return RANK_INFO;
  }

  function currentPhone() {
    for (var i = 0; i < toasts.length; i++) if (toasts[i].phone) return toasts[i];
    return null;
  }

  function showItem(item) {
    mount(item.id, item.opts, true, { rank: item.rank, keep: item.keep, item: item });
  }

  function showNext() {
    var now = Date.now();
    while (queue.length) {
      var it = queue.shift();
      // Ordinary feedback that has waited this long is old news.
      if (it.rank === RANK_INFO && !it.keep && now - it.at > PHONE_STALE_MS) continue;
      showItem(it);
      return;
    }
  }

  function enqueuePhone(id, opts, type, message) {
    var i;
    // The same words already showing or waiting are not shown twice. Only plain information is folded together:
    // a message with a button carries its own handler, which a twin must not swallow.
    var plain = !(typeof opts.undoAction === "function" || typeof opts.action === "function" ||
      (Array.isArray(opts.actions) && opts.actions.length));
    var cur = currentPhone();
    if (plain && cur && cur.item && cur.item.plain && cur.item.message === message && cur.item.type === type) return cur.id;
    for (i = 0; plain && i < queue.length; i++) {
      if (queue[i].plain && queue[i].message === message && queue[i].type === type) return queue[i].id;
    }
    var rank = rankOf(opts, type);
    var item = { id: id, opts: opts, message: message, type: type, rank: rank, plain: plain, at: Date.now(),
      keep: typeof opts.undoAction === "function" || (typeof opts.duration === "number" && opts.duration <= 0) };
    if (!cur) {
      showItem(item);
    } else if (rank > cur.rank) {
      // Something more important than what is showing. Put back what must not be lost.
      removeToast(cur, true, true);
      if (cur.keep || cur.rank === RANK_FIRST_RUN) queue.unshift(cur.item);
      showItem(item);
    } else {
      for (i = 0; i < queue.length && queue[i].rank >= rank; i++) { /* behind its equals */ }
      queue.splice(i, 0, item);
      // A long wait helps nobody: drop the oldest ordinary feedback.
      if (queue.length > PHONE_QUEUE_MAX) {
        for (i = 0; i < queue.length; i++) {
          if (queue[i].rank === RANK_INFO && !queue[i].keep) { queue.splice(i, 1); break; }
        }
      }
    }
    syncBanner();
    return id;
  }

  function show(opts) {
    opts = opts || {};
    var type = opts.type || "info";

    // Honour the user's "show toasts" preference. Errors always show so
    // users still see why something failed.
    if (!toastsEnabled() && type !== "error") {
      return null;
    }

    var id = "toast_" + (nextId++);
    if (isPhone()) return enqueuePhone(id, opts, type, opts.message != null ? String(opts.message) : "");
    mount(id, opts, false, { rank: rankOf(opts, type), keep: false, item: null });
    return id;
  }

  function dismiss(id) {
    for (var i = 0; i < toasts.length; i++) {
      if (toasts[i].id === id) { removeToast(toasts[i], false); return; }
    }
    for (var j = 0; j < queue.length; j++) {
      if (queue[j].id === id) { queue.splice(j, 1); return; }
    }
  }

  window.Toast = {
    show: show,
    dismiss: dismiss,
    isBannerOpen: function () { return bannerRegistered; },
    _container: null
  };
})();
