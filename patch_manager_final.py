import sys
import re

with open("manager-app.js", "r") as f:
    content = f.read()


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
            // Generate a grid based on thread quantities
            let patternGrid = [];
            let totalStitches = 0;
            if (pattern.threads) {
                pattern.threads.forEach(t => {
                    let st = t.unit === "stitches" ? t.qty : (t.qty * 800); // approx
                    for (let i = 0; i < st; i++) {
                        patternGrid.push({ id: t.id, type: t.is_blended ? "blend" : "solid", rgb: [128,128,128] }); // minimal rgb
                    }
                    totalStitches += st;
                });
            }
            if (totalStitches === 0) patternGrid.push({ id: "__empty__", type: "skip", rgb: [255,255,255] });

            let sW = Math.ceil(Math.sqrt(Math.max(1, totalStitches)));
            let sH = Math.ceil(totalStitches / sW);

            // pad grid
            while (patternGrid.length < sW * sH) {
                patternGrid.push({ id: "__empty__", type: "skip", rgb: [255,255,255] });
            }

            let minimal = { version: 8, page: "tracker", settings: { sW, sH, fabricCt: pattern.fabric ? parseInt(pattern.fabric) || 14 : 14, skeinPrice: 1.0, stitchSpeed: 40 }, pattern: patternGrid, bsLines: [], done: null, parkMarkers: [], totalTime: 0, sessions: [], hlRow: -1, hlCol: -1, threadOwned: inventoryThreads, singleStitchEdits: [] };
            try{
              localStorage.setItem('crossstitch_handoff', JSON.stringify(minimal));
              window.location.href = 'stitch.html?source=manager';
            }catch(e){
              alert('Could not open in Tracker: ' + e.message);
            }
          }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0d9488", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Start Tracking →</button>"""

buttons = """<button onClick={onEdit} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #e4e4e7", background: "#fff", cursor: "pointer", fontWeight: 600 }}>Edit Pattern</button>"""
new_buttons = new_btn_html + """\n          <button onClick={onEdit} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #e4e4e7", background: "#fff", cursor: "pointer", fontWeight: 600 }}>Edit Pattern</button>"""

content = content.replace(buttons, new_buttons)

with open("manager-app.js", "w") as f:
    f.write(content)
