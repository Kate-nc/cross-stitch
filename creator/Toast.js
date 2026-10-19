/* creator/Toast.js — Toast notification overlay.
   Reads from AppContext. Shows temporary messages that auto-dismiss.
   Depends on: AppContext (context.js) */

window.CreatorToastContainer = function CreatorToastContainer() {
  var app = window.useApp();
  var h = React.createElement;
  // Phones (under 900px, the compact layout): one full-width banner at a time, the rest wait their turn
  // (errors, then warnings, then the rest), and a coachmark waits for it (coaching.js).
  var compact = window.useCreatorCompact ? window.useCreatorCompact() : false;
  var list = app.toasts || [];
  var shown = list;
  if (compact && list.length) {
    var pick = 0;
    var errAt = -1, warnAt = -1;
    list.forEach(function(t, i) { if (t.type === "error" && errAt < 0) errAt = i; else if (t.type === "warning" && warnAt < 0) warnAt = i; });
    pick = errAt >= 0 ? errAt : warnAt >= 0 ? warnAt : 0;
    shown = [list[pick]];
  }
  var banner = compact && shown.length > 0;
  React.useEffect(function() {
    if (!banner) return undefined;
    var C = window.Coaching;
    if (C && C.overlayOpened) C.overlayOpened();
    return function() { if (C && C.overlayClosed) C.overlayClosed(); };
  }, [banner]);
  if (list.length === 0) return null;

  var typeStyles = {
    info:    { bg: "var(--accent-light)", border: "var(--accent-border)", color: "var(--accent-hover)", icon: Icons.info },
    success: { bg: "#E6EFD9", border: "#B8CC9E", color: "var(--success)", icon: Icons.check },
    warning: { bg: "#F4E5C8", border: "#D6B97A", color: "#8A6325", icon: Icons.warning },
    error:   { bg: "#F2D8D8", border: "#D49A9A", color: "var(--danger)", icon: Icons.x }
  };

  return h("div", {
    className: "creator-toast-container" + (compact ? " creator-toast-container--phone" : ""),
    role: "status", "aria-live": "polite",
    style: compact ? {
      position: "fixed", bottom: 20, left: 0, right: 0, padding: "0 8px", zIndex: 10000,
      display: "flex", flexDirection: "column", gap:'var(--s-2)',
      pointerEvents: "none"
    } : {
      position: "fixed", bottom: 20, right: 20, zIndex: 10000,
      display: "flex", flexDirection: "column-reverse", gap:'var(--s-2)',
      pointerEvents: "none", maxWidth: 340
    }
  },
    shown.map(function(toast) {
      var ts = typeStyles[toast.type] || typeStyles.info;
      var touchBtn = compact ? { minWidth: 44, minHeight: 44 } : null;
      return h("div", {
        key: toast.id,
        style: {
          pointerEvents: "auto",
          display: "flex", alignItems: "center", gap:'var(--s-2)',
          padding: compact ? "4px 4px 4px 14px" : "8px 14px", borderRadius:'var(--radius-lg)',
          background: ts.bg, border: "1px solid " + ts.border,
          color: ts.color, fontSize:'var(--text-sm)', fontWeight: 500,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          animation: "toast-in 0.25s ease-out",
          fontFamily: "inherit", lineHeight: 1.4, maxWidth: compact ? 560 : 340,
          width: compact ? "100%" : undefined, margin: compact ? "0 auto" : undefined, boxSizing: "border-box"
        }
      },
        h("span", { style: { fontSize:'var(--text-lg)', flexShrink: 0 } }, ts.icon()),
        h("span", { style: { flex: 1, minWidth: 0, overflowWrap: "anywhere", padding: compact ? "6px 0" : 0 } }, toast.message),
        toast.action && h("button", {
          onClick: function() {
            try { toast.action.onClick(); } finally { app.dismissToast(toast.id); }
          },
          style: Object.assign({
            background: "none", border: "none", cursor: "pointer",
            color: ts.color, fontWeight: 600, padding: compact ? "0 10px" : "0 2px",
            fontSize: "inherit", fontFamily: "inherit", flexShrink: 0
          }, touchBtn)
        }, toast.action.label),
        h("button", {
          onClick: function() { app.dismissToast(toast.id); },
          "aria-label": "Dismiss toast",
          style: Object.assign({
            background: "none", border: "none", cursor: "pointer",
            color: ts.color, opacity: 0.6, display:"inline-flex", alignItems:"center", justifyContent:"center", padding: 0,
            lineHeight: 1, flexShrink: 0
          }, touchBtn)
        }, Icons.x())
      );
    })
  );
};
