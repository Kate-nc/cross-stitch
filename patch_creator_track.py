import re

with open("creator-app.js", "r") as f:
    content = f.read()

# Add the 'Track' button
ui1 = """<button onClick={saveProject} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:500}}>Save</button>}"""
new_ui1 = ui1 + """{pat&&pal&&<button onClick={handleOpenInTracker} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"none",background:"#ea580c",color:"#fff",cursor:"pointer",fontWeight:500}}>Track</button>}"""

content = content.replace(ui1, new_ui1)

with open("creator-app.js", "w") as f:
    f.write(content)
