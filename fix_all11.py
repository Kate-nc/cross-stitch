# The -1 brace count issue MUST be from something else.
import subprocess
import re

subprocess.run(['git', 'checkout', 'HEAD', 'creator-app.js', 'index.html', 'tracker-app.js', 'stitch.html'])

def count_braces(s):
    c = 0
    for ch in s:
        if ch == '{': c+=1
        elif ch == '}': c-=1
    return c

with open('creator-app.js', 'r') as f: c = f.read()

# Instead of using regex for the `for` loops in drawPattern, let's just replace the exact text!
orig_text_creator = """    if(m.id==="__skip__"){drawCk(ctx,px,py,cSz);}
    else if(view==="color"||view==="both"){ctx.fillStyle=dim?`rgba(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]},0.15)`:`rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})`;ctx.fillRect(px,py,cSz,cSz);}
    else{ctx.fillStyle=dim?"#f5f5f5":"#fff";ctx.fillRect(px,py,cSz,cSz);}
    if(m.id!=="__skip__"&&(view==="symbol"||view==="both")&&info&&cSz>=6){let lum=luminance(m.rgb);ctx.fillStyle=dim?"rgba(0,0,0,0.08)":(view==="both"?(lum>128?"#000":"#fff"):"#333");ctx.font=`bold ${Math.max(6,cSz*0.6)}px monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(info.symbol,px+cSz/2,py+cSz/2);}"""

new_text_creator = """    if(m.id==="__skip__"){
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

if orig_text_creator in c:
    c = c.replace(orig_text_creator, new_text_creator)
else:
    print("creator inner text not found")

orig_text_tracker = """    if(m.id==="__skip__"){drawCk(ctx,px,py,cSz);if(cSz>=4){ctx.strokeStyle="rgba(0,0,0,0.06)";ctx.strokeRect(px,py,cSz,cSz);}continue;}
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

new_text_tracker = """    if(m.id==="__skip__"){
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
    }"""

with open('tracker-app.js', 'r') as f: t = f.read()

if orig_text_tracker in t:
    t = t.replace(orig_text_tracker, new_text_tracker)
else:
    print("tracker inner text not found")

print("creator braces after replacement:", count_braces(c))
print("tracker braces after replacement:", count_braces(t))
