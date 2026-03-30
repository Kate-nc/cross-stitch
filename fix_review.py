import re

def apply_patch(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # 1. Fix `offX` and `offY` in `drawSymbol`
    # It says `let off = cSz * 0.25;` then uses `offX` and `offY`!
    # Let's fix that.
    content = content.replace('let off = cSz * 0.25;\n      if (corner === "tl") { symX -= offX; symY -= offY; }\n      else if (corner === "tr") { symX += offX; symY -= offY; }\n      else if (corner === "bl") { symX -= offX; symY += offY; }\n      else if (corner === "br") { symX += offX; symY += offY; }',
                              'let off = cSz * 0.25;\n      if (corner === "tl") { symX -= off; symY -= off; }\n      else if (corner === "tr") { symX += off; symY -= off; }\n      else if (corner === "bl") { symX -= off; symY += off; }\n      else if (corner === "br") { symX += off; symY += off; }')

    # 2. Fix "Color" view mode in Pattern Editor
    # In `drawSymbol`, we had:
    # if (viewMode === "color" || viewMode === "colour") {
    #   if (isDone) return;
    # }
    # This was meant for tracker where color view hides symbol if done. But in creator, color view ALWAYS hides symbol!
    # The review says "symbols are now incorrectly drawn on top of the stitches in the 'Color' view mode"
    # So `if (viewMode === "color" || viewMode === "colour") return;`
    content = content.replace('if (viewMode === "color" || viewMode === "colour") {\n    if (isDone) return;\n  }',
                              'if (viewMode === "color" || viewMode === "colour") return;')

    with open(filename, 'w') as f:
        f.write(content)

apply_patch('creator-app.js')
apply_patch('index.html')
apply_patch('tracker-app.js')
apply_patch('stitch.html')
