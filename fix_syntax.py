import re

with open('creator-app.js', 'r') as f:
    c = f.read()

c = c.replace('const[activeTool,setActiveTool]=useState(null),const[activeStitchType,setActiveStitchType]=useState("full"),const[activeQuarterCorner,setActiveQuarterCorner]=useState("tl"),',
              'const[activeTool,setActiveTool]=useState(null),[activeStitchType,setActiveStitchType]=useState("full"),[activeQuarterCorner,setActiveQuarterCorner]=useState("tl"),')

c = c.replace('const[done,setDone]=useState(null),const[fractional,setFractional]=useState(false);',
              'const[done,setDone]=useState(null),[fractional,setFractional]=useState(false);')

with open('creator-app.js', 'w') as f: f.write(c)

with open('index.html', 'r') as f:
    c = f.read()

c = c.replace('const[activeTool,setActiveTool]=useState(null),const[activeStitchType,setActiveStitchType]=useState("full"),const[activeQuarterCorner,setActiveQuarterCorner]=useState("tl"),',
              'const[activeTool,setActiveTool]=useState(null),[activeStitchType,setActiveStitchType]=useState("full"),[activeQuarterCorner,setActiveQuarterCorner]=useState("tl"),')

c = c.replace('const[done,setDone]=useState(null),const[fractional,setFractional]=useState(false);',
              'const[done,setDone]=useState(null),[fractional,setFractional]=useState(false);')

with open('index.html', 'w') as f: f.write(c)
