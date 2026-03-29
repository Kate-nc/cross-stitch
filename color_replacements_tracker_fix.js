const fs = require('fs');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix drawer focused background
  content = content.replace(/background:isFocused\?"#eff6ff"/g, 'background:isFocused?"#f0fdfa"');

  // Track Mode button replacement fix
  content = content.replace(
    /<div style=\{\{display:"flex",borderRadius:8,overflow:"hidden",border:"1\.5px solid #e2e5ea"\}\}><button onClick=\{([^}]+)\} style=\{\{padding:"6px 16px",fontSize:12,fontWeight:stitchMode==="track"\?700:400,background:stitchMode==="track"\?"#7c3aed":"#fff",color:stitchMode==="track"\?"#fff":"#4a5568",border:"none",cursor:"pointer"\}\}>✅ Track<\/button><button onClick=\{([^}]+)\} style=\{\{padding:"6px 16px",fontSize:12,fontWeight:stitchMode==="navigate"\?700:400,background:stitchMode==="navigate"\?"#2563eb":"#fff",color:stitchMode==="navigate"\?"#fff":"#4a5568",border:"none",cursor:"pointer",borderLeft:"1px solid #e2e5ea"\}\}>🧭 Navigate<\/button><\/div>/g,
    `<div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2 }}><button onClick={$1} style={{ padding: "5px 12px", fontSize: 12, fontWeight: stitchMode==="track" ? 500 : 400, background: stitchMode==="track" ? "#0d9488" : "transparent", borderRadius: 6, color: stitchMode==="track" ? "#fff" : "#71717a", border: "none", cursor: "pointer", boxShadow: stitchMode==="track" ? "0 1px 2px rgba(0,0,0,0.04)" : "none" }}>Track</button><button onClick={$2} style={{ padding: "5px 12px", fontSize: 12, fontWeight: stitchMode==="navigate" ? 500 : 400, background: stitchMode==="navigate" ? "#18181b" : "transparent", borderRadius: 6, color: stitchMode==="navigate" ? "#fff" : "#71717a", border: "none", cursor: "pointer", boxShadow: stitchMode==="navigate" ? "0 1px 2px rgba(0,0,0,0.04)" : "none" }}>Navigate</button></div>`
  );

  fs.writeFileSync(filePath, content, 'utf8');
}

processFile('tracker-app.js');
processFile('stitch.html');
