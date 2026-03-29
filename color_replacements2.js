const fs = require('fs');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix segmented controls replacements for Direct/Dithered since the regex above was slightly off for exact matches
  content = content.replace(
    /<div style=\{\{display:"flex",gap:6,marginTop:6\}\}><button onClick=\{([^}]+)\} style=\{\{\.\.\.pill\(!dith\),flex:1\}\}>Direct<\/button><button onClick=\{([^}]+)\} style=\{\{\.\.\.pill\(dith\),flex:1\}\}>Dithered<\/button><\/div>/g,
    `<div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2, marginTop: 6 }}><button onClick={$1} style={{ padding: "5px 12px", fontSize: 12, fontWeight: !dith ? 500 : 400, background: !dith ? "#fff" : "transparent", borderRadius: 6, color: !dith ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: !dith ? "0 1px 2px rgba(0,0,0,0.04)" : "none", flex: 1 }}>Direct</button><button onClick={$2} style={{ padding: "5px 12px", fontSize: 12, fontWeight: dith ? 500 : 400, background: dith ? "#fff" : "transparent", borderRadius: 6, color: dith ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: dith ? "0 1px 2px rgba(0,0,0,0.04)" : "none", flex: 1 }}>Dithered</button></div>`
  );

  content = content.replace(
    /<div style=\{\{display:"flex",gap:6,marginBottom:6\}\}><button onClick=\{([^}]+)\} style=\{\{\.\.\.pill\(smoothType==="median"\),flex:1\}\}>Median<\/button><button onClick=\{([^}]+)\} style=\{\{\.\.\.pill\(smoothType==="gaussian"\),flex:1\}\}>Gaussian<\/button><\/div>/g,
    `<div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2, marginBottom: 6 }}><button onClick={$1} style={{ padding: "5px 12px", fontSize: 12, fontWeight: smoothType==="median" ? 500 : 400, background: smoothType==="median" ? "#fff" : "transparent", borderRadius: 6, color: smoothType==="median" ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: smoothType==="median" ? "0 1px 2px rgba(0,0,0,0.04)" : "none", flex: 1 }}>Median</button><button onClick={$2} style={{ padding: "5px 12px", fontSize: 12, fontWeight: smoothType==="gaussian" ? 500 : 400, background: smoothType==="gaussian" ? "#fff" : "transparent", borderRadius: 6, color: smoothType==="gaussian" ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: smoothType==="gaussian" ? "0 1px 2px rgba(0,0,0,0.04)" : "none", flex: 1 }}>Gaussian</button></div>`
  );

  // Manual replacement for tBtn without color
  content = content.replace(/tBtn\(activeTool==="backstitch","orange"\)/g, 'tBtn(activeTool==="backstitch")');
  content = content.replace(/tBtn\(activeTool==="eraseBs","orange"\)/g, 'tBtn(activeTool==="eraseBs")');
  content = content.replace(/tBtn\(activeTool==="paint","blue"\)/g, 'tBtn(activeTool==="paint")');
  content = content.replace(/tBtn\(activeTool==="fill","green"\)/g, 'tBtn(activeTool==="fill")');

  fs.writeFileSync(filePath, content, 'utf8');
}

processFile('creator-app.js');
processFile('index.html');
