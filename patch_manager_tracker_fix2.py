import sys
import re

with open("manager-app.js", "r") as f:
    content = f.read()

# I need to match the actual function that's there
btn_html = """<button onClick={()=>{
            let minimal = { version: 8, page: "tracker", settings: { sW: 100, sH: 100, fabricCt: 14, skeinPrice: 1.0, stitchSpeed: 40 }, pattern: [], bsLines: [], done: null, parkMarkers: [], totalTime: 0, sessions: [], hlRow: -1, hlCol: -1, threadOwned: inventoryThreads, singleStitchEdits: [] };
            try{
              localStorage.setItem('crossstitch_handoff', JSON.stringify(minimal));
              window.location.href = 'stitch.html?source=manager';
            }catch(e){
              alert('Could not open in Tracker: ' + e.message);
            }
          }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0d9488", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Start Tracking →</button>"""


new_btn_html = """<button onClick={()=>{
            let sW = 10;
            let sH = 10;
            let patGrid = [];
            if(pattern.pattern && pattern.pattern.length > 0) {
               patGrid = pattern.pattern;
               sW = pattern.settings?.sW || 10;
               sH = pattern.settings?.sH || 10;
            } else {
               patGrid = Array.from({length: 100}, () => ({id: "__skip__", rgb: [255,255,255]}));
            }

            let minimal = { version: 8, page: "tracker", settings: { sW: sW, sH: sH, fabricCt: 14, skeinPrice: 1.0, stitchSpeed: 40 }, pattern: patGrid, bsLines: pattern.bsLines || [], done: null, parkMarkers: [], totalTime: 0, sessions: [], hlRow: -1, hlCol: -1, threadOwned: inventoryThreads, singleStitchEdits: [] };
            try{
              localStorage.setItem('crossstitch_handoff', JSON.stringify(minimal));
              window.location.href = 'stitch.html?source=manager';
            }catch(e){
              alert('Could not open in Tracker: ' + e.message);
            }
          }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0d9488", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Start Tracking →</button>"""

if btn_html in content:
    content = content.replace(btn_html, new_btn_html)
else:
    print("Could not find the button HTML exactly to replace.")

with open("manager-app.js", "w") as f:
    f.write(content)
