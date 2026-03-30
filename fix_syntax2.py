import re

with open('tracker-app.js', 'r') as f:
    c = f.read()

c = c.replace('const[done,setDone]=useState(null),const[fractional,setFractional]=useState(false);',
              'const[done,setDone]=useState(null),[fractional,setFractional]=useState(false);')

with open('tracker-app.js', 'w') as f: f.write(c)

with open('stitch.html', 'r') as f:
    c = f.read()

c = c.replace('const[done,setDone]=useState(null),const[fractional,setFractional]=useState(false);',
              'const[done,setDone]=useState(null),[fractional,setFractional]=useState(false);')

with open('stitch.html', 'w') as f: f.write(c)
