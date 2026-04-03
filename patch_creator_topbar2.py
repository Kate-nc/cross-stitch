import sys

with open("creator-app.js", "r") as f:
    content = f.read()

# Change the existing "Start Tracking ->" button in the top right to just "Track ->"
old_btn = """<button onClick={handleOpenInTracker} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"none",background:"#ea580c",color:"#fff",cursor:"pointer",fontWeight:500}}>Start Tracking →</button>"""
new_btn = """<button onClick={handleOpenInTracker} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"none",background:"#ea580c",color:"#fff",cursor:"pointer",fontWeight:500}}>Track →</button>"""

if old_btn in content:
    content = content.replace(old_btn, new_btn)
else:
    print("Could not find the button.")
    sys.exit(1)

with open("creator-app.js", "w") as f:
    f.write(content)
