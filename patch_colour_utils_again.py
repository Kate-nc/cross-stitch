import re

with open('colour-utils.js', 'r') as f:
    content = f.read()

def repl(match):
    prefix = match.group(1)
    ret_obj = match.group(2)
    return prefix + ret_obj[:-1] + ', stitchType: m.stitchType || "full", secondary: m.secondary || null}'

content = re.sub(r'(if\(m\.id==="__skip__"\)return\s*)(\{.*?\});', repl, content)
content = re.sub(r'(if\(t0&&t1\)return\s*)(\{.*?\});', repl, content)
content = re.sub(r'(if\(dmc\)return\s*)(\{.*?\});', repl, content)
content = re.sub(r'(return\s*)(\{type:"solid",id:m\.id,name:m\.id,rgb:m\.rgb\|\|\[128,128,128\],lab:rgbToLab\(\.\.\.\(m\.rgb\|\|\[128,128,128\]\)\),dist:0\});', repl, content)

def repl_buildPalette(match):
    new_code = """function buildPalette(patArr){
  let usage={};
  for(let i=0;i<patArr.length;i++){
    let m=patArr[i];if(m.id==="__skip__")continue;
    if(!usage[m.id])usage[m.id]={id:m.id,type:m.type,name:m.name,rgb:m.rgb,lab:m.lab,threads:m.threads,count:0};
    usage[m.id].count++;
    if(m.secondary){
      let sec=m.secondary;
      if(!usage[sec.id])usage[sec.id]={id:sec.id,type:sec.type,name:sec.name,rgb:sec.rgb,lab:sec.lab,threads:sec.threads,count:0};
      usage[sec.id].count++;
    }
  }
  let entries=Object.values(usage).sort((a,b)=>b.count-a.count);"""

    return new_code

content = re.sub(r'function buildPalette\(patArr\)\{.*?let entries=Object\.values\(usage\)\.sort\(\(a,b\)=>b\.count-a\.count\);', repl_buildPalette, content, flags=re.DOTALL)

with open('colour-utils.js', 'w') as f:
    f.write(content)
