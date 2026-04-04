var fs=require('fs');
var lines=fs.readFileSync('tracker-app.js','utf8').split('\n');
var s=-1,e=-1;
for(var i=0;i<lines.length;i++){
  if(lines[i].indexOf('gap:6,marginBottom:6,alignItems')>-1 && s===-1) s=i;
  if(i>1600 && lines[i].indexOf('fecaca')>-1 && lines[i].indexOf('Revert to Original')>-1) e=i;
}
console.log('start='+s+' end='+e);
console.log('s-1: '+lines[s-1].trim());
console.log('s:   '+lines[s].trim().substring(0,80));
console.log('e:   '+lines[e].trim().substring(0,80));
console.log('e+1: '+lines[e+1].trim());
console.log('e+2: '+lines[e+2].trim());
console.log('e+3: '+lines[e+3].trim());
