const fs=require('fs');
const src=fs.readFileSync(require('path').join(__dirname,'../tracker-app.js'),'utf8');
const begin=src.indexOf('useEffect(()=>{',src.indexOf('// Presence is advisory'));
const effect=src.slice(begin,src.indexOf('// Debounced write:',begin));
function tabs(broadcast){
 const peers=[],queue=[],intervals=new Set();let sends=0;
 const storage={value:null,getItem(){return this.value;},setItem(k,v){this.value=v;for(const p of peers)if(p!==active)queue.push(()=>p.listener&&p.listener({key:k,newValue:v}));},removeItem(){this.value=null;}};
 let active;
 function drain(){let n=0;while(queue.length){if(++n>50)throw Error('Announcement feedback loop');queue.shift()();}}
 function add(){
  const p={toast:jest.fn()};peers.push(p);active=p;
  const win={Toast:{show:p.toast},addEventListener(t,fn){p.listener=fn;},removeEventListener(){p.listener=null;}};
  class Channel{
   constructor(){p.channel=this;}
   addEventListener(t,fn){this.listener=fn;}
   removeEventListener(){this.listener=null;}
   close(){p.closed=true;}
   postMessage(data){p.last=data;sends++;for(const other of peers)if(other!==p&&!other.closed)queue.push(()=>other.channel&&other.channel.listener&&other.channel.listener({data}));}
  }
  const ls={...storage,getItem(){return storage.value;},setItem(k,v){p.last=JSON.parse(v);sends++;active=p;storage.setItem(k,v);}};
  const cleanup=new Function('useEffect','wastePrefs','window','localStorage','BroadcastChannel','setInterval','clearInterval',effect.replace('useEffect(()=>{','return useEffect(()=>{'))(fn=>fn(),{enabled:true},win,ls,broadcast?Channel:undefined,fn=>{intervals.add(fn);return fn;},fn=>intervals.delete(fn));
  p.cleanup=cleanup;
  drain();return p;
 }
 return {add,drain,peers,queue,get sends(){return sends;},heartbeat(){for(const fn of intervals)fn();drain();},intervals};
}
for(const broadcast of [true,false])test(`${broadcast?'BroadcastChannel':'localStorage'} joins and periodic heartbeats have bounded announcements`,()=>{
 const t=tabs(broadcast);const a=t.add(),b=t.add();
 expect(t.sends).toBe(3);expect(a.toast).toHaveBeenCalledTimes(1);expect(b.toast).toHaveBeenCalledTimes(1);
 t.heartbeat();expect(t.sends).toBe(5);
 t.heartbeat();expect(t.sends).toBe(7);
 expect(a.toast).toHaveBeenCalledTimes(1);expect(b.toast).toHaveBeenCalledTimes(1);
 a.cleanup();b.cleanup();expect(t.intervals.size).toBe(0);
 t.heartbeat();expect(t.sends).toBe(7);
});

for(const broadcast of [true,false])test(`${broadcast?'BroadcastChannel':'localStorage'} ignores stale, future, self and foreign messages`,()=>{
 const t=tabs(broadcast),p=t.add();
 const receive=msg=>broadcast?p.channel.listener({data:msg}):p.listener({key:'cs-rt-tracker-hb',newValue:JSON.stringify(msg)});
 receive({...p.last,type:'rt-join'});
 receive({type:'rt-join',id:'other',t:Date.now()-100000});
 receive({type:'rt-join',id:'other',t:Date.now()+100000});
 receive({type:'foreign',id:'other',t:Date.now()});receive(null);
 t.drain();expect(t.sends).toBe(1);expect(p.toast).not.toHaveBeenCalled();p.cleanup();
});
