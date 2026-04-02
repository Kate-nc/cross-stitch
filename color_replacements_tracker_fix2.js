const fs = require('fs');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Track Mode button replacement (catch the new version with replaced borders)
  content = content.replace(
    /<div style=\{\{display:"flex",borderRadius:8,overflow:"hidden",border:"0\.5px solid #e4e4e7"\}\}><button onClick=\{([^}]+)\} style=\{\{padding:"6px 16px",fontSize:12,fontWeight:stitchMode==="track"\?700:400,background:stitchMode==="track"\?"#0d9488":"#fff",color:stitchMode==="track"\?"#fff":"#71717a",border:"none",cursor:"pointer"\}\}>✅ Track<\/button><button onClick=\{([^}]+)\} style=\{\{padding:"6px 16px",fontSize:12,fontWeight:stitchMode==="navigate"\?700:400,background:stitchMode==="navigate"\?"#18181b":"#fff",color:stitchMode==="navigate"\?"#fff":"#71717a",border:"none",cursor:"pointer",borderLeft:"0\.5px solid #e4e4e7"\}\}>🧭 Navigate<\/button><\/div>/g,
    `<div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2 }}><button onClick={$1} style={{ padding: "5px 12px", fontSize: 12, fontWeight: stitchMode==="track" ? 500 : 400, background: stitchMode==="track" ? "#0d9488" : "transparent", borderRadius: 6, color: stitchMode==="track" ? "#fff" : "#71717a", border: "none", cursor: "pointer", boxShadow: stitchMode==="track" ? "0 1px 2px rgba(0,0,0,0.04)" : "none" }}>Track</button><button onClick={$2} style={{ padding: "5px 12px", fontSize: 12, fontWeight: stitchMode==="navigate" ? 500 : 400, background: stitchMode==="navigate" ? "#18181b" : "transparent", borderRadius: 6, color: stitchMode==="navigate" ? "#fff" : "#71717a", border: "none", cursor: "pointer", boxShadow: stitchMode==="navigate" ? "0 1px 2px rgba(0,0,0,0.04)" : "none" }}>Navigate</button></div>`
  );

  // Navigate banner color replacement (was skipped somehow)
  content = content.replace(
    /color:"#18181b",background:"#eff6ff",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"1px solid #bfdbfe"/g,
    'color:"#18181b",background:"#f4f4f5",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"0.5px solid #e4e4e7"'
  );

  // Drawer toggle button color
  content = content.replace(
    /color:"#5b7bb3",display:"flex"/g,
    'color:"#0d9488",display:"flex"'
  );

  // Progress bar fill (tracker complete)
  // already done via bulk replace?
  // Let's check session controls start/stop and progress bar:
  // background:progressPct>=100?"#16a34a":"#0d9488" -> this is correct from bulk replace of #5b7bb3.

  fs.writeFileSync(filePath, content, 'utf8');
}

processFile('tracker-app.js');
processFile('stitch.html');
