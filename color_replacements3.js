const fs = require('fs');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Welcome screen h1 color `#0f172a` was `#18181b` now
  // Check if button text was updated correctly

  // Fix segmented control for Colour/Symbol/Both toggle
  content = content.replace(
    /\{\[\["color","Colour"\],\["symbol","Symbol"\],\["both","Both"\]\]\.map\(it=><button key=\{it\[0\]\} onClick=\{([^}]+)\} style=\{pill\(view===it\[0\]\)\}>\{it\[1\]\}<\/button>\)\}/g,
    `<div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2 }}>{[["color","Colour"],["symbol","Symbol"],["both","Both"]].map(it=><button key={it[0]} onClick={$1} style={{ padding: "5px 12px", fontSize: 12, fontWeight: view===it[0] ? 500 : 400, background: view===it[0] ? "#fff" : "transparent", borderRadius: 6, color: view===it[0] ? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: view===it[0] ? "0 1px 2px rgba(0,0,0,0.04)" : "none" }}>{it[1]}</button>)}</div>`
  );

  fs.writeFileSync(filePath, content, 'utf8');
}

processFile('creator-app.js');
processFile('index.html');
