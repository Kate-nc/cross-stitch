import re

def fix_save(filename):
    with open(filename, 'r') as f:
        c = f.read()

    # The current save logic:
    # pattern:pat.map(m=>m.id==="__skip__"?{id:"__skip__"}:{id:m.id,type:m.type,rgb:m.rgb})
    # We need to change it to include stitchType and secondary if they exist and are not "full"

    orig = 'pattern:pat.map(m=>m.id==="__skip__"?{id:"__skip__"}:{id:m.id,type:m.type,rgb:m.rgb})'

    # We will use an arrow function with a body:
    new_repl = 'pattern:pat.map(m=>{if(m.id==="__skip__")return{id:"__skip__"};let o={id:m.id,type:m.type,rgb:m.rgb};if(m.stitchType&&m.stitchType!=="full")o.stitchType=m.stitchType;if(m.secondary)o.secondary=m.secondary;return o;})'

    if orig in c:
        c = c.replace(orig, new_repl)
        with open(filename, 'w') as f:
            f.write(c)
        print(f"Fixed {filename}")
    else:
        print(f"Could not find orig in {filename}")

fix_save('creator-app.js')
fix_save('index.html')
fix_save('tracker-app.js')
fix_save('stitch.html')
