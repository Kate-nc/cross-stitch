const fs = require('fs');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix Generate button flat background instead of gradient
  content = content.replace(/background:busy\?"#a1a1aa":"linear-gradient\(135deg,#0d9488,#0f766e\)"/g, 'background:busy?"#a1a1aa":"#0d9488"');
  content = content.replace(/background:busy\?"#94a3b8":"linear-gradient\(135deg,#0d9488,#0f766e\)"/g, 'background:busy?"#a1a1aa":"#0d9488"'); // Just in case slate color wasn't caught

  // Fix all other buttons that might still be using the gradient
  content = content.replace(/linear-gradient\(135deg,#0d9488,#0f766e\)/g, '#0d9488');

  fs.writeFileSync(filePath, content, 'utf8');
}

processFile('creator-app.js');
processFile('index.html');

function processTracker(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix Tracker View Toggles (missed because of curly braces in onClick)
  content = content.replace(
    /\{\[\["symbol","Sym"\],\["colour","Col\+Sym"\],\["highlight","Highlight"\]\]\.map\(\(\[k,l\]\)=><button key=\{k\} onClick=\{([^}]+)\}\} style=\{\{\.\.\.pill\(stitchView===k\),padding:"4px 10px",fontSize:11\}\}>\{l\}<\/button>\)\}/g,
    `<div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2 }}>{[["symbol","Sym"],["colour","Col+Sym"],["highlight","Highlight"]].map(([k,l])=><button key={k} onClick={$1}} style={{ padding: "5px 12px", fontSize: 12, fontWeight: stitchView===k ? 500 : 400, background: stitchView===k ? "#fff" : "transparent", borderRadius: 6, color: stitchView===k ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: stitchView===k ? "0 1px 2px rgba(0,0,0,0.04)" : "none" }}>{l}</button>)}</div>`
  );

  // Fix Undo Button Tracker (violet background missed because it might have had different colors or already partially replaced)
  content = content.replace(
    /border:"0\.5px solid #c4b5fd",borderRadius:6,background:"#f5f3ff",color:"#0d9488"/g,
    'border:"0.5px solid #99f6e4",borderRadius:6,background:"#f0fdfa",color:"#0d9488"'
  );
  content = content.replace(
    /border:"1px solid #c4b5fd",borderRadius:6,background:"#f5f3ff",color:"#0d9488"/g,
    'border:"0.5px solid #99f6e4",borderRadius:6,background:"#f0fdfa",color:"#0d9488"'
  );

  // Fix any remaining buttons that might still be using the gradient
  content = content.replace(/linear-gradient\(135deg,#0d9488,#0f766e\)/g, '#0d9488');

  fs.writeFileSync(filePath, content, 'utf8');
}

processTracker('tracker-app.js');
processTracker('stitch.html');
