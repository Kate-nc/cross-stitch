import sys
import re

with open("manager-app.js", "r") as f:
    content = f.read()

# Locate PatternDetailsModal
pdm_func = """function PatternDetailsModal({ pattern, onClose, onEdit, inventoryThreads, userProfile }) {"""

# Find the buttons at the end of the PatternDetailsModal
buttons = """<button onClick={onEdit} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #e4e4e7", background: "#fff", cursor: "pointer", fontWeight: 600 }}>Edit Pattern</button>"""
new_buttons = """<button onClick={()=>{
            let minimal = { version: 8, page: "tracker", settings: { sW: 100, sH: 100, fabricCt: 14, skeinPrice: 1.0, stitchSpeed: 40 }, pattern: [], bsLines: [], done: null, parkMarkers: [], totalTime: 0, sessions: [], hlRow: -1, hlCol: -1, threadOwned: inventoryThreads, singleStitchEdits: [] };
            try{
              localStorage.setItem('crossstitch_handoff', JSON.stringify(minimal));
              window.location.href = 'stitch.html?source=manager';
            }catch(e){
              alert('Could not open in Tracker: ' + e.message);
            }
          }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0d9488", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Start Tracking →</button>
          <button onClick={onEdit} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #e4e4e7", background: "#fff", cursor: "pointer", fontWeight: 600 }}>Edit Pattern</button>"""

content = content.replace(buttons, new_buttons)

with open("manager-app.js", "w") as f:
    f.write(content)
