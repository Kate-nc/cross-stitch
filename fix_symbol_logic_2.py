import re

def fix_file(filename):
    with open(filename, 'r') as f:
        c = f.read()

    # My bad regex destroyed:
    # let isQuarter = stType.startsWith("quarter_") || stType.startsWith("three_quarter_") || st.isSecondary;
    # let symCol = "#333";
    # let lum = luminance(st.rgb);
    # if (viewMode === "symbol") { ... } else if (viewMode === "color" || viewMode === "colour") { ... }

    # Let's completely recreate the correct `drawSymbol` function!
    # I can just replace the whole function by matching `function drawSymbol(...) { ... }` but that's hard because of nested braces.
    # Luckily I can match `function drawSymbol` up to `ctx.fillText(info.symbol, symX, symY);`

    new_drawSymbol = """function drawSymbol(ctx, st, info, px, py, cSz, isDimmed, isDone, viewMode) {
  if (!info || cSz < 6) return;
  let stType = st.stitchType || "full";

  if (viewMode === "color" || viewMode === "colour") {
    if (isDone) return;
    /* In creator 'color' view, symbols are NOT drawn anyway.
       Wait, in creator, we simply shouldn't draw symbol if viewMode === "color" */
    // However, tracker "colour" mode IS "Colour+Symbol", so it DOES draw symbols!
    // But creator "color" mode is pure color. The string is "color" for creator, "colour" for tracker!
    if (viewMode === "color") return;
  }

  let isQuarter = stType.startsWith("quarter_") || stType.startsWith("three_quarter_") || st.isSecondary;

  let symCol = "#333";
  let lum = luminance(st.rgb);

  if (viewMode === "symbol") {
    symCol = isDone ? "#059669" : "#333";
    if (isDimmed) symCol = "rgba(0,0,0,0.15)";
  } else if (viewMode === "colour") {
    // Tracker's "Colour+Symbol" mode
    symCol = lum > 140 ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.95)";
  } else if (viewMode === "both") {
    symCol = lum > 128 ? "#000" : "#fff";
    if (isDimmed) symCol = "rgba(0,0,0,0.3)";
  } else if (viewMode === "highlight") {
    symCol = isDimmed ? "rgba(0,0,0,0.06)" : "#18181b";
    if (isDone && !isDimmed) symCol = "#fff";
  }

  ctx.fillStyle = symCol;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let symX = px + cSz / 2;
  let symY = py + cSz / 2;
  let fontSize = cSz * (viewMode === "highlight" ? 0.7 : 0.6);

  if (isQuarter) {
    if (cSz < 10 && !st.isSecondary && !stType.startsWith("three_quarter_")) return;

    let corner = "";
    if (st.isSecondary) {
      corner = st.stitchType.split("_")[1];
    } else if (stType.startsWith("quarter_")) {
      corner = stType.split("_")[1];
    }

    if (corner) {
      fontSize = cSz * 0.4;
      let off = cSz * 0.25;
      if (corner === "tl") { symX -= off; symY -= off; }
      else if (corner === "tr") { symX += off; symY -= off; }
      else if (corner === "bl") { symX -= off; symY += off; }
      else if (corner === "br") { symX += off; symY += off; }
    }
  }

  ctx.font = `bold ${Math.max(5, fontSize)}px monospace`;
  if (viewMode === "highlight" && isDimmed) ctx.font = `${Math.max(5, fontSize)}px monospace`;

  ctx.fillText(info.symbol, symX, symY);
}"""

    # We match `function drawSymbol` up to `ctx.fillText(info.symbol, symX, symY);` and the closing brace.
    # It might be `ctx.fillText(info.symbol, symX, symY);\n}` or similar.
    c = re.sub(r'function drawSymbol\(ctx, st, info, px, py, cSz, isDimmed, isDone, viewMode\).*?ctx\.fillText\(info\.symbol, symX, symY\);\n\}', new_drawSymbol, c, flags=re.DOTALL)

    with open(filename, 'w') as f:
        f.write(c)

fix_file('creator-app.js')
fix_file('index.html')
fix_file('tracker-app.js')
fix_file('stitch.html')
