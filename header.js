function Header({ page, onNewProject, onExportPDF, setModal }) {
  return React.createElement("header", { style: { background: "#fff", borderBottom: "0.5px solid #e4e4e7", boxShadow: "none" } },
    React.createElement("div", { style: { maxWidth: 1100, margin: "0 auto", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" } },
      React.createElement("div", { style: { fontWeight: 700, color: "#18181b", cursor: "pointer" }, onClick: () => { if(page==='creator') window.scrollTo(0,0); else window.location.href = 'index.html'; } }, "Cross Stitch Pattern Generator"),
      React.createElement("div", { style: { display: "flex", gap: 20, alignItems: "center" } },
        React.createElement("a", { className: "nav-link", style: page === 'creator' ? { color: '#0d9488', textDecoration: 'underline' } : {}, onClick: () => { if(page==='creator') window.scrollTo(0,0); else window.location.href = 'index.html'; } }, "Pattern Creator"),
        React.createElement("a", { className: "nav-link", style: page === 'tracker' ? { color: '#0d9488', textDecoration: 'underline' } : {}, onClick: () => { if(page==='tracker') window.scrollTo(0,0); else window.location.href = 'stitch.html'; } }, "Stitch Tracker"),
        React.createElement("a", { className: "nav-link", style: page === 'manager' ? { color: '#0d9488', textDecoration: 'underline' } : {}, onClick: () => { if(page==='manager') window.scrollTo(0,0); else window.location.href = 'manager.html'; } }, "Stash Manager"),
        React.createElement("a", { className: "nav-link", onClick: () => setModal("calculator") }, "Calculator"),
        React.createElement("a", { className: "nav-link", onClick: () => setModal("help") }, "Help"),
        React.createElement("a", { className: "nav-link", onClick: () => setModal("about") }, "About")
      ),
      React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "center" } },
        page === 'creator' && React.createElement("button", { onClick: onNewProject, style: { padding: "6px 14px", fontSize: 13, borderRadius: 8, border: "0.5px solid #e4e4e7", background: "#fff", color: "#71717a", cursor: "pointer", fontWeight: 500 } }, "New Project"),
        onExportPDF && React.createElement("button", { onClick: onExportPDF, style: { padding: "6px 14px", fontSize: 13, borderRadius: 8, border: "none", background: "#0d9488", color: "#fff", cursor: "pointer", fontWeight: 500 } }, "Export PDF")
      )
    )
  );
}
