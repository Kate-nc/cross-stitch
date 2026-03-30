import re

# `drawSymbol` needs fixing.
# In creator-app.js and index.html (the editor), viewMode "color" means NO symbols.
# In tracker-app.js and stitch.html, viewMode "colour" means symbol IS shown, UNLESS it's isDone. Wait! Tracker view "colour" means "Colour+Symbol"!
# Let's look at original tracker code.
# `}else if(stitchView==="colour"){ ... if(!isDn&&info&&cSz>=6){ctx.fillText(...)}`
# Yes, tracker "colour" mode shows symbols. So my `if (viewMode === "color" || viewMode === "colour") return;` was WRONG for tracker!
# It broke tracker's "colour" mode!
# "color" is Pattern Editor's mode: `[["color","Colour"],["symbol","Symbol"],["both","Both"]]`. Wait, the original code had:
# `if(m.id!=="__skip__"&&(view==="symbol"||view==="both")&&info&&cSz>=6)`
# Yes! Editor only shows symbol in "symbol" or "both" views! In "color" view it doesn't show symbols!

def fix_draw_symbol(filename):
    with open(filename, 'r') as f:
        c = f.read()

    # We previously replaced it with `if (viewMode === "color" || viewMode === "colour") return;` inside `fix_review.py` maybe?
    # Let's check what's in `drawSymbol` right now.

    # Re-apply correctly.
    if "creator" in filename or "index" in filename:
        c = re.sub(r'if \(viewMode === "color" \|\| viewMode === "colour"\).*?\}', 'if (viewMode === "color") return;', c, flags=re.DOTALL)

    if "tracker" in filename or "stitch" in filename:
        c = re.sub(r'if \(viewMode === "color" \|\| viewMode === "colour"\).*?\}', 'if (viewMode === "color" || viewMode === "colour") { if (isDone) return; }', c, flags=re.DOTALL)

    # Fix the `offX` and `offY` variable crash! The variable is `off` but used as `offX`!
    c = c.replace('let offX = cellMM*0.25, offY = cellMM*0.25;', 'let off = cellMM*0.25;')
    c = c.replace('symX -= offX; symY -= offY;', 'symX -= off; symY -= off;')
    c = c.replace('symX += offX; symY -= offY;', 'symX += off; symY -= off;')
    c = c.replace('symX -= offX; symY += offY;', 'symX -= off; symY += off;')
    c = c.replace('symX += offX; symY += offY;', 'symX += off; symY += off;')

    with open(filename, 'w') as f:
        f.write(c)

fix_draw_symbol('creator-app.js')
fix_draw_symbol('index.html')
fix_draw_symbol('tracker-app.js')
fix_draw_symbol('stitch.html')
