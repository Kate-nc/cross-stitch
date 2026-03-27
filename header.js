function Header({ page, onNewProject, onExportPDF, setModal }) {
  return React.createElement("header", { style: { background: "#fff", borderBottom: "1px solid #e2e5ea", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" } },
    React.createElement("div", { style: { maxWidth: 1100, margin: "0 auto", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" } },
      React.createElement("div", { style: { fontWeight: 700, color: "#0f172a", cursor: "pointer" }, onClick: () => { if(page==='creator') window.scrollTo(0,0); else window.location.href = 'index.html'; } }, "Cross Stitch Pattern Generator"),
      React.createElement("div", { style: { display: "flex", gap: 20, alignItems: "center" } },
        React.createElement("a", { className: "nav-link", style: page === 'creator' ? { color: '#5b7bb3', textDecoration: 'underline' } : {}, onClick: () => { if(page==='creator') window.scrollTo(0,0); else window.location.href = 'index.html'; } }, "Pattern Creator"),
        React.createElement("a", { className: "nav-link", style: page === 'tracker' ? { color: '#5b7bb3', textDecoration: 'underline' } : {}, onClick: () => { if(page==='tracker') window.scrollTo(0,0); else window.location.href = 'stitch.html'; } }, "Stitch Tracker"),
        React.createElement("a", { className: "nav-link", onClick: () => setModal("help") }, "Help"),
        React.createElement("a", { className: "nav-link", onClick: () => setModal("about") }, "About")
      ),
      React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "center" } },
        page === 'creator' && React.createElement("button", { onClick: onNewProject, style: { padding: "6px 14px", fontSize: 13, borderRadius: 8, border: "1px solid #e2e5ea", background: "#f8fafc", color: "#4a5568", cursor: "pointer", fontWeight: 500 } }, "New Project"),
        page === 'creator' && onExportPDF && React.createElement("button", { onClick: onExportPDF, style: { padding: "6px 14px", fontSize: 13, borderRadius: 8, border: "none", background: "#5b7bb3", color: "#fff", cursor: "pointer", fontWeight: 500 } }, "Export PDF")
      )
    )
  );
}
