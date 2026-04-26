/* creator/Toast.js — Toast notification overlay.
   Reads from AppContext. Shows temporary messages that auto-dismiss.
   Depends on: AppContext (context.js) */

window.CreatorToastContainer = function CreatorToastContainer() {
  var app = window.useApp();
  var h = React.createElement;
  if (!app.toasts || app.toasts.length === 0) return null;

  var typeStyles = {
    info:    { bg: "var(--accent-light)", border: "var(--accent-border)", color: "var(--accent-hover)", icon: Icons.info },
    success: { bg: "#E6EFD9", border: "#B8CC9E", color: "var(--success)", icon: Icons.check },
    warning: { bg: "#F4E5C8", border: "#D6B97A", color: "#8A6325", icon: Icons.warning },
    error:   { bg: "#F2D8D8", border: "#D49A9A", color: "var(--danger)", icon: Icons.x }
  };

  return h("div", {
    style: {
      position: "fixed", bottom: 20, right: 20, zIndex: 10000,
      display: "flex", flexDirection: "column-reverse", gap:'var(--s-2)',
      pointerEvents: "none", maxWidth: 340
    }
  },
    app.toasts.map(function(toast) {
      var ts = typeStyles[toast.type] || typeStyles.info;
      return h("div", {
        key: toast.id,
        style: {
          pointerEvents: "auto",
          display: "flex", alignItems: "center", gap:'var(--s-2)',
          padding: "8px 14px", borderRadius:'var(--radius-lg)',
          background: ts.bg, border: "1px solid " + ts.border,
          color: ts.color, fontSize:'var(--text-sm)', fontWeight: 500,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          animation: "toast-in 0.25s ease-out",
          fontFamily: "inherit", lineHeight: 1.4, maxWidth: 340
        }
      },
        h("span", { style: { fontSize:'var(--text-lg)', flexShrink: 0 } }, ts.icon()),
        h("span", { style: { flex: 1 } }, toast.message),
        h("button", {
          onClick: function() { app.dismissToast(toast.id); },
          style: {
            background: "none", border: "none", cursor: "pointer",
            color: ts.color, opacity: 0.6, fontSize:'var(--text-lg)', padding: 0,
            lineHeight: 1, flexShrink: 0
          }
        }, "\xD7")
      );
    })
  );
};
