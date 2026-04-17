/* creator/Toast.js — Toast notification overlay.
   Reads from AppContext. Shows temporary messages that auto-dismiss.
   Depends on: AppContext (context.js) */

window.CreatorToastContainer = function CreatorToastContainer() {
  var app = window.useApp();
  var h = React.createElement;
  if (!app.toasts || app.toasts.length === 0) return null;

  var typeStyles = {
    info:    { bg: "#f0f9ff", border: "#bae6fd", color: "#0369a1", icon: Icons.info },
    success: { bg: "#f0fdf4", border: "#bbf7d0", color: "#166534", icon: Icons.check },
    warning: { bg: "#fffbeb", border: "#fde68a", color: "#92400e", icon: Icons.warning },
    error:   { bg: "#fef2f2", border: "#fecaca", color: "#991b1b", icon: Icons.x }
  };

  return h("div", {
    role: "status",
    "aria-live": "polite",
    "aria-relevant": "additions",
    style: {
      position: "fixed", bottom: 20, right: 20, zIndex: 10000,
      display: "flex", flexDirection: "column-reverse", gap: 8,
      pointerEvents: "none", maxWidth: 340
    }
  },
    app.toasts.map(function(toast) {
      var ts = typeStyles[toast.type] || typeStyles.info;
      return h("div", {
        key: toast.id,
        role: toast.type === "error" ? "alert" : undefined,
        style: {
          pointerEvents: "auto",
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderRadius: 10,
          background: ts.bg, border: "1px solid " + ts.border,
          color: ts.color, fontSize: 12, fontWeight: 500,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          animation: "toast-in 0.25s ease-out",
          fontFamily: "inherit", lineHeight: 1.4, maxWidth: 340
        }
      },
        h("span", { style: { fontSize: 14, flexShrink: 0 } }, ts.icon()),
        h("span", { style: { flex: 1 } }, toast.message),
        h("button", {
          onClick: function() { app.dismissToast(toast.id); },
          style: {
            background: "none", border: "none", cursor: "pointer",
            color: ts.color, opacity: 0.6, fontSize: 14, padding: 0,
            lineHeight: 1, flexShrink: 0
          }
        }, "\xD7")
      );
    })
  );
};
