# The tracker orig has: `if(m.id==="__skip__"){drawCk(ctx,px,py,cSz);if(cSz>=4){ctx.strokeStyle="rgba(0,0,0,0.06)";ctx.strokeRect(px,py,cSz,cSz);}continue;}`
# Ah! I replaced `continue;` with `}` ! That's why it loses a brace because the loop doesn't skip, it goes into `else`. Wait, replacing `continue;` doesn't change brace count!
# BUT `orig_tracker_draw_inner` has `{` and `}` counts:
orig_tracker_draw_inner = """if(m.id==="__skip__"){drawCk(ctx,px,py,cSz);if(cSz>=4){ctx.strokeStyle="rgba(0,0,0,0.06)";ctx.strokeRect(px,py,cSz,cSz);}continue;}
    if(stitchView==="symbol"){
      if(isDn){ctx.fillStyle="#d1fae5";ctx.fillRect(px,py,cSz,cSz);}
      else{ctx.fillStyle="#fff";ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=6){ctx.fillStyle="#18181b";ctx.font=`bold ${Math.max(7,cSz*0.65)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
    }else if(stitchView==="colour"){
      ctx.fillStyle=`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);
      if(!isDn&&info&&cSz>=6){ctx.fillStyle=luminance(m.rgb)>140?"rgba(0,0,0,0.8)":"rgba(255,255,255,0.95)";ctx.font=`bold ${Math.max(7,cSz*0.6)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}
    }else{
      if(isDn){ctx.fillStyle=dimmed?"#f4f4f5":`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
      else if(dimmed){ctx.fillStyle="#f4f4f5";ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=8){ctx.fillStyle="rgba(0,0,0,0.06)";ctx.font=`${Math.max(6,cSz*0.45)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
      else{ctx.fillStyle=`rgba(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]},0.25)`;ctx.fillRect(px,py,cSz,cSz);if(info&&cSz>=6){ctx.fillStyle="#18181b";ctx.font=`bold ${Math.max(7,cSz*0.7)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}}
    }"""

def count_b(s):
    ct = 0
    for c in s:
        if c == '{': ct+=1
        elif c == '}': ct-=1
    return ct
print("orig tracker:", count_b(orig_tracker_draw_inner))
print("new tracker:", count_b("""if(m.id==="__skip__"){
      drawCk(ctx,px,py,cSz);
    } else {
      drawStitchShape(ctx, m, px, py, cSz, dimmed, isDn, stitchView);
      drawSymbol(ctx, m, info, px, py, cSz, dimmed, isDn, stitchView);
      if(m.secondary){
          let sec = m.secondary;
          sec.isSecondary = true;
          let secInfo = cmap ? cmap[sec.id] : null;
          drawStitchShape(ctx, sec, px, py, cSz, dimmed, isDn, stitchView);
          drawSymbol(ctx, sec, secInfo, px, py, cSz, dimmed, isDn, stitchView);
      }
    }"""))
