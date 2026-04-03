import re

with open("creator-app.js", "r") as f:
    content = f.read()

# We look for the top right toolbar in creator-app.js
# Currently it looks like:
# <div style={{display:"flex",gap:6}}><input ref={loadRef} type="file" accept=".json" onChange={loadProject} style={{display:"none"}}/><button onClick={()=>loadRef.current.click()} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"0.5px solid #e4e4e7",background:"#fafafa",cursor:"pointer",color:"#71717a",fontWeight:500}}>Open</button>{pat&&pal&&<button onClick={saveProject} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:500}}>Save</button>}{pat&&pal&&<button onClick={handleOpenInTracker} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"none",background:"#ea580c",color:"#fff",cursor:"pointer",fontWeight:500}}>Start Tracking →</button>}</div>

ui1 = """<button onClick={()=>loadRef.current.click()} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"0.5px solid #e4e4e7",background:"#fafafa",cursor:"pointer",color:"#71717a",fontWeight:500}}>Open</button>"""
new_ui1 = ui1 + """{pat&&pal&&<button onClick={saveProject} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"none",background:"#0d9488",color:"#fff",cursor:"pointer",fontWeight:500}}>Save</button>}{pat&&pal&&<button onClick={handleOpenInTracker} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"none",background:"#ea580c",color:"#fff",cursor:"pointer",fontWeight:500}}>Track</button>}"""

# Since I already added "Start Tracking ->" in the previous step, let me find exactly what is there now.
