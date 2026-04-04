var fs=require('fs');
var t=fs.readFileSync('tracker-app.js','utf8');
var op=0,cl=0,sq=0,sc=0;
for(var i=0;i<t.length;i++){
  var c=t[i];
  if(c==='{')op++;
  if(c==='}')cl++;
  if(c==='(')sq++;
  if(c===')')sc++;
}
console.log('tracker-app.js: {='+op+' }='+cl+' diff='+(op-cl)+' (='+sq+' )='+sc+' diff='+(sq-sc));

t=fs.readFileSync('index.html','utf8');
op=0;cl=0;sq=0;sc=0;
for(var i=0;i<t.length;i++){
  var c=t[i];
  if(c==='{')op++;
  if(c==='}')cl++;
  if(c==='(')sq++;
  if(c===')')sc++;
}
console.log('index.html:      {='+op+' }='+cl+' diff='+(op-cl)+' (='+sq+' )='+sc+' diff='+(sq-sc));
