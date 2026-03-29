const fs = require('fs');

const replacements = [
  { from: /#5b7bb3/g, to: '#0d9488' },
  { from: /#4a6fa5/g, to: '#0f766e' },
  { from: /#edf2fa/g, to: '#f0fdfa' },
  { from: /#3d5a8c/g, to: '#0d9488' },
  { from: /#0f172a/g, to: '#18181b' },
  { from: /#1e293b/g, to: '#18181b' },
  { from: /#2d3748/g, to: '#18181b' },
  { from: /#334155/g, to: '#18181b' },
  { from: /#4a5568/g, to: '#71717a' },
  { from: /#64748b/g, to: '#71717a' },
  { from: /#94a3b8/g, to: '#a1a1aa' },
  { from: /1\.5px solid #e2e5ea/g, to: '0.5px solid #e4e4e7' },
  { from: /1px solid #e2e5ea/g, to: '0.5px solid #e4e4e7' },
  { from: /#e2e5ea/g, to: '#e4e4e7' },
  { from: /1px solid #f0f2f5/g, to: '0.5px solid #f4f4f5' },
  { from: /#f0f2f5/g, to: '#f4f4f5' },
  { from: /#f8fafc/g, to: '#fafafa' },
  { from: /#f1f5f9/g, to: '#f4f4f5' },
  { from: /#cbd5e1/g, to: '#d4d4d8' },

  // Specific replacements
  { from: /#7c3aed/g, to: '#0d9488' }, // track mode -> teal
  { from: /#2563eb/g, to: '#18181b' }, // navigate mode -> dark neutral

  // Toolbar grouping
  { from: /<div style=\{\{display:"flex",gap:6,marginBottom:6,alignItems:"center",flexWrap:"wrap"\}\}>/g,
    to: '<div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center",flexWrap:"wrap", padding: "6px 10px", background: "#fff", border: "0.5px solid #e4e4e7", borderRadius: 10}}>' },

  // Undo button tracker
  { from: /border:"1px solid #c4b5fd",borderRadius:6,background:"#f5f3ff",color:"#7c3aed"/g,
    to: 'border:"0.5px solid #99f6e4",borderRadius:6,background:"#f0fdfa",color:"#0d9488"' },
  { from: /border:"1px solid #bfdbfe",borderRadius:6,background:"#eff6ff",color:"#2563eb"/g,
    to: 'border:"0.5px solid #99f6e4",borderRadius:6,background:"#f0fdfa",color:"#0d9488"' },
];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Manual specific replacements for Tracker View Toggles
  content = content.replace(
    /\{\[\["symbol","Sym"\],\["colour","Col\+Sym"\],\["highlight","Highlight"\]\]\.map\(\(\[k,l\]\)=><button key=\{k\} onClick=\{([^}]+)\} style=\{\{\.\.\.pill\(stitchView===k\),padding:"4px 10px",fontSize:11\}\}>\{l\}<\/button>\)\}/g,
    `<div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2 }}>{[["symbol","Sym"],["colour","Col+Sym"],["highlight","Highlight"]].map(([k,l])=><button key={k} onClick={$1} style={{ padding: "5px 12px", fontSize: 12, fontWeight: stitchView===k ? 500 : 400, background: stitchView===k ? "#fff" : "transparent", borderRadius: 6, color: stitchView===k ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: stitchView===k ? "0 1px 2px rgba(0,0,0,0.04)" : "none" }}>{l}</button>)}</div>`
  );

  // Track/Navigate toggles
  content = content.replace(
    /<div style=\{\{display:"flex",borderRadius:8,overflow:"hidden",border:"0\.5px solid #e4e4e7"\}\}><button onClick=\{([^}]+)\} style=\{\{padding:"6px 16px",fontSize:12,fontWeight:stitchMode==="track"\?700:400,background:stitchMode==="track"\?"#0d9488":"#fff",color:stitchMode==="track"\?"#fff":"#71717a",border:"none",cursor:"pointer"\}\}>✅ Track<\/button><button onClick=\{([^}]+)\} style=\{\{padding:"6px 16px",fontSize:12,fontWeight:stitchMode==="navigate"\?700:400,background:stitchMode==="navigate"\?"#18181b":"#fff",color:stitchMode==="navigate"\?"#fff":"#71717a",border:"none",cursor:"pointer",borderLeft:"1px solid #e4e4e7"\}\}>🧭 Navigate<\/button><\/div>/g,
    `<div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2 }}><button onClick={$1} style={{ padding: "5px 12px", fontSize: 12, fontWeight: stitchMode==="track" ? 500 : 400, background: stitchMode==="track" ? "#0d9488" : "transparent", borderRadius: 6, color: stitchMode==="track" ? "#fff" : "#71717a", border: "none", cursor: "pointer", boxShadow: stitchMode==="track" ? "0 1px 2px rgba(0,0,0,0.04)" : "none" }}>Track</button><button onClick={$2} style={{ padding: "5px 12px", fontSize: 12, fontWeight: stitchMode==="navigate" ? 500 : 400, background: stitchMode==="navigate" ? "#18181b" : "transparent", borderRadius: 6, color: stitchMode==="navigate" ? "#fff" : "#71717a", border: "none", cursor: "pointer", boxShadow: stitchMode==="navigate" ? "0 1px 2px rgba(0,0,0,0.04)" : "none" }}>Navigate</button></div>`
  );

  for (const { from, to } of replacements) {
    content = content.replace(from, to);
  }

  // Instruction banners
  content = content.replace(/background:"#faf5ff"/g, 'background:"#f0fdfa"');
  content = content.replace(/border:"1px solid #e9d5ff"/g, 'border:"0.5px solid #99f6e4"');
  content = content.replace(/color:"#0d9488",background:"#f0fdfa",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"0\.5px solid #99f6e4"/g, 'color:"#0d9488",background:"#f0fdfa",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"0.5px solid #99f6e4"');
  content = content.replace(/color:"#18181b",background:"#f0fdfa",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"0\.5px solid #99f6e4"/g, 'color:"#18181b",background:"#f4f4f5",padding:"6px 14px",borderRadius:8,marginBottom:6,border:"0.5px solid #e4e4e7"');

  // Colour drawer focused
  content = content.replace(/border:isFocused\?"2px solid #3b82f6":"1px solid transparent"/g, 'border:isFocused?"2px solid #0d9488":"1px solid transparent"');

  fs.writeFileSync(filePath, content, 'utf8');
}

processFile('tracker-app.js');
processFile('stitch.html');
