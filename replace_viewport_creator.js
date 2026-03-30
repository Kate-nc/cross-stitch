const fs = require('fs');

function processFile(file) {
    let content = fs.readFileSync(file, 'utf8');
    const searchRegex = /(<div style=\{\{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap",alignItems:"center"\}\}>\s*<div style=\{\{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2, flex: 1 \}\}>\{\[\["color","Colour"\],\["symbol","Symbol"\],\["both","Both"\]\]\.map\(it=><button key=\{it\[0\]\} onClick=\{\(\)=>setView\(it\[0\]\)\} style=\{\{ padding: "5px 12px", fontSize: 12, fontWeight: view===it\[0\] \? 500 : 400, background: view===it\[0\] \? "#fff" : "transparent", borderRadius: 6, color: view===it\[0\] \? "#18181b" : "#71717a", border: "none", cursor: "pointer", boxShadow: view===it\[0\] \? "0 1px 2px rgba\(0,0,0,0\.04\)" : "none", flex: 1 \}\}>\{it\[1\]\}<\/button>\)\}<\/div>\s*<div style=\{\{width:1,height:18,background:"#e4e4e7",margin:"0 2px"\}\}\/>\s*<span style=\{\{fontSize:11,color:"#a1a1aa"\}\}>Zoom<\/span><input type="range" min=\{0\.05\} max=\{3\} step=\{0\.05\} value=\{zoom\} onChange=\{e=>setZoom\(Number\(e\.target\.value\)\)\} style=\{\{width:60\}\}\/><span style=\{\{fontSize:11,minWidth:28\}\}>\{Math\.round\(zoom\*100\)\}%<\/span><button onClick=\{fitZ\} style=\{\{fontSize:11,padding:"3px 8px",border:"0\.5px solid #e4e4e7",borderRadius:6,background:"#fafafa",cursor:"pointer"\}\}>Fit<\/button>\s*<\/div>)/g;

    let matchCount = 0;
    content = content.replace(searchRegex, (match, p1) => {
        matchCount++;
        return p1 + '\n          {cs < 6 && (view === "symbol" || view === "both") && <div style={{fontSize: 12, color: "#71717a", marginBottom: 6, background: "#f4f4f5", padding: "6px 10px", borderRadius: 8}}>To see symbols, you may need to zoom in.</div>}';
    });

    if (matchCount > 0) {
        fs.writeFileSync(file, content);
        console.log(`Replaced in ${file} (${matchCount} times)`);
    } else {
        console.log(`No match in ${file}`);
    }
}

processFile('creator-app.js');
processFile('index.html');
