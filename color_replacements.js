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
  // specific replacements
  { from: /"✏️ Backstitch"/g, to: '"Backstitch"' },
  { from: /"🗑️ Erase Line"/g, to: '"Erase line"' },
  { from: /"🖌️ Paint"/g, to: '"Paint"' },
  { from: /"🪣 Fill"/g, to: '"Fill"' },
  { from: /linear-gradient\(135deg,#5b7bb3,#4a6fa5\)/g, to: '#0d9488' },
  { from: /0 2px 8px rgba\(74,111,165,0\.25\)/g, to: 'none' },
  { from: /"rgba\(74,111,165,0\.25\)"/g, to: '""' }, // removed shadow
  { from: /#bfdbfe/g, to: '#99f6e4' },
  { from: /#eff6ff/g, to: '#f0fdfa' },

  // segment controls replacement is too complex for simple regex
  // doing manual replacement for those
];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  for (const { from, to } of replacements) {
    content = content.replace(from, to);
  }

  // Remove tBtn color args
  content = content.replace(/tBtn\(activeTool==="backstitch","orange"\)/g, 'tBtn(activeTool==="backstitch")');
  content = content.replace(/tBtn\(activeTool==="eraseBs","orange"\)/g, 'tBtn(activeTool==="eraseBs")');
  content = content.replace(/tBtn\(activeTool==="paint","blue"\)/g, 'tBtn(activeTool==="paint")');
  content = content.replace(/tBtn\(activeTool==="fill","green"\)/g, 'tBtn(activeTool==="fill")');

  // specific replacements for context
  // Undo button
  content = content.replace(/color:"#2563eb"/g, 'color:"#0d9488"');

  // Project tab section backgrounds
  // Check text color replacements

  // Tab bar bottom border
  content = content.replace(/borderBottom:"2px solid #f0f2f5"/g, 'borderBottom:"2px solid #f4f4f5"');

  // Convert view toggles to segmented controls
  content = content.replace(
    /\{\[\["color","Colour"\],\["symbol","Symbol"\],\["both","Both"\]\]\.map\(it=><button key=\{it\[0\]\} onClick=\{([^}]+)\} style=\{pill\(([^)]+)\)\}>\{it\[1\]\}<\/button>\)\}/g,
    `<div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2 }}>{[["color","Colour"],["symbol","Symbol"],["both","Both"]].map(it=><button key={it[0]} onClick={$1} style={{ padding: "5px 12px", fontSize: 12, fontWeight: view===it[0] ? 500 : 400, background: view===it[0] ? "#fff" : "transparent", borderRadius: 6, color: view===it[0] ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: view===it[0] ? "0 1px 2px rgba(0,0,0,0.04)" : "none" }}>{it[1]}</button>)}</div>`
  );

  // Direct/Dithered toggle
  content = content.replace(
    /<button onClick=\{([^}]+)\} style=\{\{\.\.\.pill\(!dith\),flex:1\}\}>Direct<\/button><button onClick=\{([^}]+)\} style=\{\{\.\.\.pill\(dith\),flex:1\}\}>Dithered<\/button>/g,
    `<div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2, flex: 1 }}><button onClick={$1} style={{ padding: "5px 12px", fontSize: 12, fontWeight: !dith ? 500 : 400, background: !dith ? "#fff" : "transparent", borderRadius: 6, color: !dith ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: !dith ? "0 1px 2px rgba(0,0,0,0.04)" : "none", flex: 1 }}>Direct</button><button onClick={$2} style={{ padding: "5px 12px", fontSize: 12, fontWeight: dith ? 500 : 400, background: dith ? "#fff" : "transparent", borderRadius: 6, color: dith ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: dith ? "0 1px 2px rgba(0,0,0,0.04)" : "none", flex: 1 }}>Dithered</button></div>`
  );

  // Median/Gaussian toggle
  content = content.replace(
    /<button onClick=\{([^}]+)\} style=\{\{\.\.\.pill\(smoothType==="median"\),flex:1\}\}>Median<\/button><button onClick=\{([^}]+)\} style=\{\{\.\.\.pill\(smoothType==="gaussian"\),flex:1\}\}>Gaussian<\/button>/g,
    `<div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2, flex: 1 }}><button onClick={$1} style={{ padding: "5px 12px", fontSize: 12, fontWeight: smoothType==="median" ? 500 : 400, background: smoothType==="median" ? "#fff" : "transparent", borderRadius: 6, color: smoothType==="median" ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: smoothType==="median" ? "0 1px 2px rgba(0,0,0,0.04)" : "none", flex: 1 }}>Median</button><button onClick={$2} style={{ padding: "5px 12px", fontSize: 12, fontWeight: smoothType==="gaussian" ? 500 : 400, background: smoothType==="gaussian" ? "#fff" : "transparent", borderRadius: 6, color: smoothType==="gaussian" ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: smoothType==="gaussian" ? "0 1px 2px rgba(0,0,0,0.04)" : "none", flex: 1 }}>Gaussian</button></div>`
  );

  // Toolbar grouping
  content = content.replace(
    /<div style=\{\{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap",alignItems:"center"\}\}>/g,
    `<div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap",alignItems:"center", padding: "6px 10px", background: "#fff", border: "0.5px solid #e4e4e7", borderRadius: 10}}>`
  );

  fs.writeFileSync(filePath, content, 'utf8');
}

processFile('creator-app.js');
processFile('index.html');
