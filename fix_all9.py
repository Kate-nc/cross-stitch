orig_creator_draw_inner = """if(m.id==="__skip__"){drawCk(ctx,px,py,cSz);}
    else if(view==="color"||view==="both"){ctx.fillStyle=dim?`rgba(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]},0.15)`:`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
    else{ctx.fillStyle=dim?"#f5f5f5":"#fff";ctx.fillRect(px,py,cSz,cSz);}
    if(m.id!=="__skip__"&&(view==="symbol"||view==="both")&&info&&cSz>=6){let lum=luminance(m.rgb);ctx.fillStyle=dim?"rgba(0,0,0,0.08)":(view==="both"?(lum>128?"#000":"#fff"):"#333");ctx.font=`bold ${Math.max(6,cSz*0.6)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}"""

new_creator_draw_inner = """if(m.id==="__skip__"){
      drawCk(ctx,px,py,cSz);
    } else {
      drawStitchShape(ctx, m, px, py, cSz, dim, false, view);
      drawSymbol(ctx, m, info, px, py, cSz, dim, false, view);
      if(m.secondary){
          let sec = m.secondary;
          sec.isSecondary = true;
          let secInfo = cmap ? cmap[sec.id] : null;
          drawStitchShape(ctx, sec, px, py, cSz, dim, false, view);
          drawSymbol(ctx, sec, secInfo, px, py, cSz, dim, false, view);
      }
    }"""
def count_b(s):
    ct = 0
    for c in s:
        if c == '{': ct+=1
        elif c == '}': ct-=1
    return ct

print("orig creator:", count_b(orig_creator_draw_inner))
print("new creator:", count_b(new_creator_draw_inner))
