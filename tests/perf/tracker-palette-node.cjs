/* Isolated React reconciliation reproduction, not a browser/device benchmark.
   The baseline is the exact inline palette subtree from the recorded main.
   jsdom has no layout/paint. Callbacks are inert; behaviour is tested elsewhere. */
const fs=require('fs'),{execFileSync}=require('child_process'),vm=require('vm');
const babel=require('@babel/core'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});
global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;
const React=require('react'),{createRoot}=require('react-dom/client'),{flushSync}=require('react-dom');
window.React=React;
const src=process.env.AFTER?fs.readFileSync('tracker-app.js','utf8'):execFileSync('git',['show','08c78b4fa3d6e02974eacc43cc7b4cbc004c64c5:tracker-app.js'],{encoding:'utf8'});
const ast=babel.parseSync(src,{parserOpts:{plugins:['jsx']}});
function decl(name){let result;babel.traverse(ast,{FunctionDeclaration(p){if(p.node.id.name===name)result=babel.transformFromAstSync({type:'File',program:{type:'Program',body:[p.node],directives:[],sourceType:'script'}},null,{presets:['@babel/preset-react']}).code;}});return result;}
const scope={React,window,document,console,Icons:new Proxy({},{get:()=>()=>React.createElement('svg')}),luminance:()=>0,formatThread:p=>p.name,colourDoneName:p=>p.name};vm.createContext(scope);
vm.runInContext(fs.readFileSync('components.js','utf8'),scope);
const start=src.indexOf('return rows.map(row=>{'),end=src.indexOf('\n          });',start);
const map=src.slice(start,end+'\n          });'.length);
let code=decl('legendCountText')+'\nconst TILE_KEY_CLASSES={wrap:"ppal-tile-text",id:"ppal-tile-id",tag:"ppal-tile-tag",name:"ppal-tile-name",use:"ppal-tile-use"};\n';
if(process.env.AFTER){for(const n of ['TrackerPaletteRow','TrackerColourActions'])code+=decl(n)+'\n';code+='const MemoTrackerPaletteRow=React.memo(TrackerPaletteRow);';}
code+=`function Palette({rows,focusColour=null,compactColours=false,open=true}){const keyRowsById=keys,fabricCt=14,isEditMode=false,parkCountsByColour={},isParkLayerVisible=()=>false,setPaletteDetail=()=>{},setEditModalColor=()=>{},selectTrackerColour=()=>{},goToParkedThread=()=>{},confirmAndMarkBsOfColour=()=>{},confirmAndMarkColour=()=>{};const paletteActions=actions;if(!open)return null;${decl('renderColourActions')||''} ${map}}`;
code=babel.transformSync(code,{presets:['@babel/preset-react']}).code;
const noop=()=>{};scope.actions=noop;scope.keys={};
let rows=Array.from({length:200},(_,i)=>{const p={id:String(i),name:'Thread '+i,rgb:[100,120,130],type:'solid'};scope.keys[p.id]={title:p.name,label:p.name,idText:p.id,name:p.name,usage:'2 strands',usageTitle:'Two strands'};return{p,dc:{done:0,total:100,halfDone:0,halfTotal:0},kn:{done:0,total:0},qt:{done:0,total:0},bsc:{done:0,total:0},pct:0,complete:false};});
vm.runInContext(code,scope);
const root=createRoot(document.getElementById('root'));let commits=[];let elements=0;const ce=React.createElement;React.createElement=function(...a){elements++;return ce(...a);};
function render(open,compact){flushSync(()=>root.render(ce(React.Profiler,{id:'palette',onRender:(id,phase,ms)=>commits.push(ms)},ce(scope.Palette,{rows,open,compactColours:compact}))));}
const out={kind:'Isolated React/jsdom, development React, 200 colours; no browser layout, rendering, storage or worker; not user-visible latency.',cases:{}};
for(const open of [false,true])for(const compact of [false,true]){
 render(open,compact);commits=[];elements=0;const t=performance.now();
 for(let i=0;i<30;i++){const j=i%200;rows=rows.map((r,k)=>k===j?{...r,dc:{...r.dc,done:r.dc.done+1},pct:r.pct+1}:r);render(open,compact);render(open,compact);}
 out.cases[`${open?'open':'closed'}-${compact?'compact':'comfortable'}`]={commits:commits.length,elements,renderMs:commits.reduce((a,b)=>a+b,0),elapsedMs:performance.now()-t};
}
console.log(JSON.stringify(out,null,2));fs.writeFileSync(process.env.OUT||'reports/track-mode-baseline/palette-node-before.json',JSON.stringify(out,null,2));root.unmount();
