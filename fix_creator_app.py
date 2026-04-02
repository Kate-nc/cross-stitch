import sys
import re

with open("creator-app.js", "r") as f:
    content = f.read()

# 1. Remove duplicate handleOpenInTracker
# We will keep only one copy by regex matching the function definition
func_pattern = r"function handleOpenInTracker\(\)\{[\s\S]*?\}\n"
matches = list(re.finditer(func_pattern, content))
if len(matches) > 1:
    # Keep the last one, remove others
    for m in reversed(matches[:-1]):
        content = content[:m.start()] + content[m.end():]

# 2. Remove duplicate "Start Tracking" button
button_html = """{pat&&pal&&<button onClick={handleOpenInTracker} style={{padding:"5px 12px",fontSize:12,borderRadius:8,border:"none",background:"#ea580c",color:"#fff",cursor:"pointer",fontWeight:500}}>Start Tracking →</button>}"""
# Count occurrences
if content.count(button_html) > 1:
    content = content.replace(button_html, "", content.count(button_html) - 1)

with open("creator-app.js", "w") as f:
    f.write(content)
