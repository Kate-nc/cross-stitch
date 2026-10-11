const WORK = process.env.AUDIT_WORK || (require('os').tmpdir() + '/tracking-audit-work/');
const fs=require('fs');const S=WORK+'fx/';
const p=JSON.parse(fs.readFileSync(S+'small.json','utf8'));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
// days-ago : [net stitches, minutes]
const plan={24:[100,40],23:[120,45],22:[90,30],17:[200,70],16:[150,50],10:[80,30],9:[110,40],8:[60,20],3:[300,100],2:[-0,0],1:[140,45]};
let total=0,idx=0;const sessions=[];
Object.keys(plan).map(Number).sort((a,b)=>b-a).forEach(k=>{const [n,m]=plan[k];if(!n)return;const d=new Date();d.setDate(d.getDate()-k);d.setHours(20,0,0,0);
  total+=n;sessions.push({id:'sess_h'+k,date:ymd(d),startTime:d.toISOString(),endTime:new Date(d.getTime()+m*60000).toISOString(),durationSeconds:m*60,durationMinutes:m,stitchesCompleted:n,stitchesUndone:0,netStitches:n,totalAtEnd:total,percentAtEnd:Math.round(total/1600*1000)/10,note:'',coloursWorked:[]});});
// done array = total stitches in first `total` cells
p.done=p.done.map((v,i)=>i<total?1:0);
p.statsSessions=sessions;p.id='proj_history';p.name='History Test';
fs.writeFileSync(S+'history.json',JSON.stringify(p));console.log('total',total,'sessions',sessions.length);
