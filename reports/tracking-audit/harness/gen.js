const WORK = process.env.AUDIT_WORK || (require('os').tmpdir() + '/tracking-audit-work/');
// Generates project JSON fixtures (version 11 shape) using real DMC ids.
const fs=require('fs'); const vm=require('vm');
const ctx={window:{},console}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('../../../dmc-data.js','utf8')+';this.D=DMC;',ctx);
const DMC=ctx.D; const out=WORK+'fx/';
function mk(name,sW,sH,cell,extra={}){
  const pattern=[];for(let y=0;y<sH;y++)for(let x=0;x<sW;x++){const c=cell(x,y);pattern.push(c===null?{id:'__skip__'}:{id:c.id,type:'solid',rgb:c.rgb});}
  return Object.assign({version:11,id:'proj_'+name.replace(/\W/g,'_').toLowerCase(),page:'tracker',name,
    settings:{sW,sH,fabricCt:14,skeinPrice:0.95,stitchSpeed:40},pattern,bsLines:[],done:new Array(sW*sH).fill(0),parkMarkers:[],
    totalTime:0,hlRow:-1,hlCol:-1,threadOwned:{},halfStitches:[],halfDone:[],statsSessions:[],statsSettings:{},
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},extra);
}
const pick=ids=>ids.map(i=>DMC.find(d=>d.id===String(i)));
// small: 40x40 "heart + flowers", 6 colours incl. background skipped
const sm=pick([310,321,666,700,912,3865]);
const small=mk('Small Heart Sampler',40,40,(x,y)=>{
  const dx=(x-19.5)/12,dy=(y-17)/12; const h=Math.pow(dx*dx+dy*dy-1,3)-dx*dx*dy*dy*dy*(-1); // heart-ish
  const inHeart=(Math.pow(dx*dx+(1.2*-dy)*(1.2*-dy)-1,3)-dx*dx*Math.pow(-dy*1.2,3))<=0;
  if(x<2||y<2||x>37||y>37) return sm[1];             // border red
  if(inHeart) return (x+y)%7===0?sm[3]:sm[2];        // heart red/yellow sparkle? use 666 + 700
  if((x*3+y*5)%11===0) return sm[4];                 // sparse green
  if(y>33) return sm[0];
  return sm[5];
});
fs.writeFileSync(out+'small.json',JSON.stringify(small));
// large: 300x300 full coverage, 64 colours, deterministic noise; one rare colour (14 stitches)
const pool=DMC.filter(d=>/^\d+$/.test(d.id)).slice(0,200);
const big=[];for(let i=0;i<64;i++)big.push(pool[(i*3)%pool.length]);
const rare=pool[150];
function rnd(x,y,s){let h=(x*374761393+y*668265263+s*1274126177)|0;h=(h^(h>>>13))*1274126177|0;return ((h^(h>>>16))>>>0)/4294967296;}
const large=mk('Large Landscape 300x300',300,300,(x,y)=>{
  if(x>=100&&x<107&&y>=200&&y<202) return rare; // 14 stitches
  const band=Math.floor(y/300*8), cx=Math.floor((x+ Math.sin(y/17)*9)/38);
  const k=(band*8+cx+ (rnd(x>>2,y>>2,1)>0.82?1:0))%64; return big[k];
});
fs.writeFileSync(out+'large.json',JSON.stringify(large));
// special: 50x50, with half stitches, quarters, backstitch, knots
const sp=pick([310,321,666,700,912,3865]);
const spec=mk('Special Stitches Test',50,50,(x,y)=>{ if(x<4||y<4||x>45||y>45) return null; return sp[(Math.floor(x/8)+Math.floor(y/8))%4]; });
const idx=(x,y)=>y*50+x;
spec.halfStitches=[];for(let i=0;i<10;i++)spec.halfStitches.push([idx(10+i,20),{fwd:{id:'666',rgb:sp[2].rgb}}]);
for(let i=0;i<10;i++)spec.halfStitches.push([idx(10+i,22),{fwd:{id:'700',rgb:sp[3].rgb},bck:{id:'700',rgb:sp[3].rgb}}]);
spec.partialStitches=[[idx(30,30),{TL:{id:'912',rgb:sp[4].rgb},BR:{id:'912',rgb:sp[4].rgb}}],[idx(31,30),{TL:{id:'912',rgb:sp[4].rgb}}]];
spec.bsLines=[];for(let i=0;i<8;i++)spec.bsLines.push({x1:10+i,y1:30,x2:11+i,y2:31,color:'#333333'});
spec.knots=[{x:41,y:41,id:'321',rgb:sp[1].rgb},{x:43,y:43,id:'321',rgb:sp[1].rgb}];
spec.halfStitches.forEach(([i])=>{spec.pattern[i]={id:'__skip__'};});spec.partialStitches.forEach(([i])=>{spec.pattern[i]={id:'__skip__'};});
fs.writeFileSync(out+'special.json',JSON.stringify(spec));
console.log('ok', small.pattern.length, large.pattern.length, spec.pattern.length);
