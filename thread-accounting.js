/* Durable consumption v2. Quantities are unrounded skeins of 6 x 315 single-strand inches.
 * Immutable events are separate from inventory and from project reservations. */
(function(root) {
  const KEY = 'thread_consumption_v2';
  const copy = x => JSON.parse(JSON.stringify(x));
  const dict = () => Object.create(null);
  const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((o,k)=>{Object.defineProperty(o,k,{value:v[k],enumerable:true});return o;},{}):v);
  const safeId=x=>typeof x==='string'&&x.length>0&&!['__proto__','constructor','prototype'].includes(x);
  const positive = (x, fallback, zero) => Number.isFinite(x) && (zero ? x >= 0 : x > 0) ? x : fallback;
  // One stitch's estimate. Shared by snapshot() (every marked stitch) and
  // live() (only the stitches that changed), so the two cannot disagree.
  function estimator(p, prefs) {
    const wp=prefs||{}, fc=positive(p.fabricCt || (p.settings&&p.settings.fabricCt),14);
    const over=typeof root.stitchOverFor==='function'?root.stitchOverFor(fc):([25,28,32].includes(fc)?2:1);
    const assumptions={model:2, fabricCount:fc, stitchOver:over, strands:positive(wp.strandCountOverride,2),
      tailAllowanceIn:positive(wp.tailAllowanceIn,1.5,true), stitchesPerRun:positive(wp.threadRunLength,30),
      wasteMultiplier:positive(wp.generalWasteMultiplier,1.1,true), capacitySingleStrandIn:1890};
    const brand=p.settings&&p.settings.threadBrand, units=p.chartAccountingUnits;
    return {
      // Everything here that is not a stitch: when it changes, every estimate does.
      // No brand estimates exactly as 'dmc' (every use defaults and lower-cases it).
      signature:JSON.stringify([assumptions,String(brand||'dmc').toLowerCase()]),
      key:unit=>(units&&units[unit])||unit,
      estimate(thread, weight, type, geometry) {
        if(!thread || thread.id==null || String(thread.id).startsWith('__'))return null;
        const parts=thread.type==='blend'||(!thread.type&&['dmc','anchor'].includes(String(thread.brand||brand||'dmc').toLowerCase())&&String(thread.id).includes('+'))?(thread.threads||String(thread.id).split('+').map(id=>({id}))):[thread];
        let weights=parts.map((t,i)=>positive(thread.blendRatio&&thread.blendRatio[i]!=null?thread.blendRatio[i]:t.strands,1,true));
        if(!weights.some(x=>x>0))weights=weights.map(()=>1);
        const sum=weights.reduce((a,b)=>a+b,0), amounts=dict();
        const length=((geometry==null?4.8*weight:geometry)*assumptions.strands/(fc/over)+2*assumptions.tailAllowanceIn/assumptions.stitchesPerRun*weight)*assumptions.wasteMultiplier;
        parts.forEach((t,i)=>{const k=String(t.brand||thread.brand||brand||'dmc').toLowerCase()+':'+t.id;amounts[k]=(amounts[k]||0)+length/1890*weights[i]/sum;});
        return {type,amounts,assumptions:Object.assign({},assumptions,{weight,geometryInPerCount:geometry==null?4.8*weight:geometry,blendWeights:weights})};
      },
    };
  }
  function addFull(p, E, put) {
    (p.pattern||[]).forEach((t,i)=>{if(p.done&&p.done[i]===1)put('d:'+i,t,1,'full');});
  }
  // Everything but full crosses: few enough to rebuild whenever any of it changes.
  const REST_FIELDS=['halfStitches','halfDone','partialStitches','partialDone','specialtyStitches','specialtyDone','knots','knotsDone','bsLines','bsDone'];
  function addRest(p, E, put) {
    const map=x=>x instanceof Map?x:new Map(x||[]);
    const hs=map(p.halfStitches), hd=map(p.halfDone);
    hs.forEach((cell,i)=>['fwd','bck'].forEach(side=>{if(hd.get(i)&&hd.get(i)[side])put('h:'+i+':'+side,cell[side],.5,'half');}));
    let ps=map(p.partialStitches);
    if(root.ProgressUnits)ps=root.ProgressUnits.partialWithoutLegacyHalves(ps,hs,p.settings&&p.settings.threadBrand);
    const pd=map(p.partialDone);
    ps.forEach((cell,i)=>['TL','TR','BL','BR'].forEach(pos=>{const m=pd.get(i);if(m&&(m instanceof Set?m.has(pos):m.includes(pos)))put('q:'+i+':'+pos,cell[pos],.25,'quarter');}));
    const sd=new Set(p.specialtyDone||[]);
    (p.specialtyStitches||[]).forEach(st=>{
      if(!sd.has(st.uid))return;
      if(st.type==='petite')put('s:'+st.uid,st.thread,.5,'petite');
      else if(st.type==='long_stitch'){
        const length=Math.hypot(st.x2-st.x1,st.y2-st.y1);
        if(Number.isFinite(length)&&length>0)put('s:'+st.uid,st.thread,length,'long stitch',2*length);
      }
    });
    const kd=new Set(p.knotsDone||[]);
    (p.knots||[]).forEach(k=>{if(kd.has(k.x+','+k.y))put('k:'+k.x+','+k.y,k,1,'knot');});
    const bd=new Set(p.bsDone||[]);
    (p.bsLines||[]).forEach(l=>{
      let {x1,y1,x2,y2}=l;if(![x1,y1,x2,y2].every(Number.isFinite))return;
      const distance=Math.hypot(x2-x1,y2-y1);if(!distance)return;
      if(x2<x1||(x2===x1&&y2<y1)){[x1,x2]=[x2,x1];[y1,y2]=[y2,y1];}
      const id=String(l.colorId!=null?l.colorId:l.color||''), key=[x1,y1,x2,y2,id].join(',');
      if(bd.has(key))put('b:'+key,{id,brand:l.brand},distance,'backstitch',2*distance);
    });
  }
  function snapshot(p, prefs) {
    const E=estimator(p,prefs), out=dict();
    const put=(unit,thread,weight,type,geometry)=>{const e=E.estimate(thread,weight,type,geometry);if(e)out[E.key(unit)]=e;};
    addFull(p,E,put);addRest(p,E,put);
    return out;
  }
  /* The same marks as snapshot(), kept up to date instead of rebuilt.
     snapshot() costs one estimate per marked stitch, so on a large chart that
     is well under way every tap paid for every finished stitch. A live set
     remembers what it last saw and only re-estimates what changed: the full
     crosses whose done value flipped (a value compare, not an estimate, per
     cell), and the other kinds — few — whenever any of their fields is a new
     object (the Tracker never edits them in place). A new pattern, chart
     units map, fabric count, thread brand or waste setting changes every
     estimate, so it rebuilds.

       sync(p, prefs)        bring the marks to p; returns the units marked or
                             unmarked, [{unit, before, after}], in the shape the
                             Tracker's ledger outbox takes (one of before/after
                             is null). A unit whose estimate merely changed is
                             updated but is not a change, as before.
       adopt(p, prefs, m)    start from p, whose snapshot() is m, reporting
                             nothing (a load, or progress merged from another
                             tab, which is not stitching done here).
       marks()               the current marks (read only)
       threadKeys()          brand:id keys used by at least one mark
       rebuilds()            how many syncs had to rebuild (for tests and probes) */
  function live() {
    let marks=dict(), seen=null, restKeys=new Set(), rebuilt=0;
    const useCount=dict();
    function count(e,d){Object.keys(e.amounts).forEach(k=>{const n=(useCount[k]||0)+d;if(n)useCount[k]=n;else delete useCount[k];});}
    function put(k,e,changes){const prev=marks[k];if(prev)count(prev,-1);else if(changes)changes.push({unit:k,before:null,after:e});marks[k]=e;count(e,1);}
    function drop(k,changes){const prev=marks[k];if(!prev)return;count(prev,-1);delete marks[k];if(changes)changes.push({unit:k,before:prev,after:null});}
    function doneBits(d,n){const b=new Uint8Array(n);if(d)for(let i=0;i<n;i++)b[i]=d[i]===1?1:0;return b;}
    // When two marked stitches share a unit name, snapshot() keeps the later
    // one, and only a rebuild reproduces that. A units map that sends two
    // stitches to one name always rebuilds. Otherwise two can share a name only
    // when a stitch is mapped to a name that no mapped stitch has (a `shadow`
    // name) and a stitch added since the map was made has that name unmapped.
    // A change to either rebuilds while both are marked.
    const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
    function oneToOne(u){if(!u)return true;const v=Object.values(u);return new Set(v).size===v.length;}
    function shadowOf(u){const out=new Map();if(u)Object.keys(u).forEach(k=>{const v=u[k];if(!own(u,v))out.set(v,k);});return out;}
    function remember(p,E,rest){
      const n=(p.pattern||[]).length,u=p.chartAccountingUnits;
      seen={pattern:p.pattern,units:u,signature:E.signature,simple:oneToOne(u),shadow:shadowOf(u),
        done:doneBits(p.done,n),rest:REST_FIELDS.map(f=>p[f]),restRaw:rest.raw};
    }
    function restOf(p,E){
      const byKey=new Map(),raw=new Set();
      addRest(p,E,(unit,thread,weight,type,geometry)=>{const e=E.estimate(thread,weight,type,geometry);if(e){byKey.set(E.key(unit),e);raw.add(unit);}});
      return {byKey,raw};
    }
    function rebuild(p,prefs,changes){
      rebuilt++;
      const E=estimator(p,prefs), next=snapshot(p,prefs), rest=restOf(p,E);
      Object.keys(marks).forEach(k=>{if(!(k in next))drop(k,changes);});
      Object.keys(next).forEach(k=>put(k,next[k],changes));
      remember(p,E,rest);restKeys=new Set(rest.byKey.keys());
    }
    return {
      sync(p,prefs){
        const changes=[], E=estimator(p,prefs);
        if(!seen||!seen.simple||p.pattern!==seen.pattern||p.chartAccountingUnits!==seen.units||E.signature!==seen.signature){
          rebuild(p,prefs,changes);return changes;
        }
        const pat=p.pattern||[], d=p.done, old=seen.done, shadow=seen.shadow;
        const next=REST_FIELDS.some((f,i)=>p[f]!==seen.rest[i])?restOf(p,E):null;
        const restRaw=next?next.raw:seen.restRaw;
        // Is raw unit u marked in p? (Full crosses: done and a real thread.)
        const markedNow=u=>u!=null&&(u.startsWith('d:')?(()=>{const j=+u.slice(2);return !!d&&d[j]===1&&!!E.estimate(pat[j],1,'full');})():restRaw.has(u));
        const flips=[];
        for(let i=0;i<pat.length;i++){
          if((!!d&&d[i]===1)===(old[i]===1))continue;
          if(shadow.size){const u='d:'+i,k=E.key(u),other=shadow.has(k)?(k===u?shadow.get(k):k):null;
            if(other!=null&&markedNow(other)){rebuild(p,prefs,changes);return changes;}}
          flips.push(i);
        }
        if(next&&shadow.size){
          for(const u of next.raw){const k=E.key(u);if(shadow.has(k)&&markedNow(k===u?shadow.get(k):k)){rebuild(p,prefs,changes);return changes;}}
          for(const u of seen.restRaw){if(next.raw.has(u))continue;const k=E.key(u);if(shadow.has(k)&&markedNow(k===u?shadow.get(k):k)){rebuild(p,prefs,changes);return changes;}}
        }
        flips.forEach(i=>{
          const on=!!d&&d[i]===1, k=E.key('d:'+i);
          old[i]=on?1:0;
          if(on){const e=E.estimate(pat[i],1,'full');if(e)put(k,e,changes);else drop(k,changes);}
          else drop(k,changes);
        });
        if(next){
          restKeys.forEach(k=>{if(!next.byKey.has(k))drop(k,changes);});
          next.byKey.forEach((e,k)=>put(k,e,changes));
          restKeys=new Set(next.byKey.keys());seen.rest=REST_FIELDS.map(f=>p[f]);seen.restRaw=next.raw;
        }
        return changes;
      },
      adopt(p,prefs,m){
        const E=estimator(p,prefs), next=m||snapshot(p,prefs), rest=restOf(p,E);
        Object.keys(marks).forEach(k=>{if(!(k in next))drop(k,null);});
        Object.keys(next).forEach(k=>put(k,next[k],null));
        remember(p,E,rest);restKeys=new Set(rest.byKey.keys());
      },
      marks:()=>marks,
      threadKeys:()=>Object.keys(useCount),
      rebuilds:()=>rebuilt,
    };
  }
  function empty(){return {version:2,projects:{},events:{},receipts:{}};}
  function validateAmounts(a){
    if(!a||typeof a!=='object'||Array.isArray(a))throw Error('Invalid consumption quantities');
    Object.entries(a).forEach(([k,v])=>{if(!/^[a-z][a-z0-9-]{0,63}:[^:\x00-\x1f]+$/.test(k)||!Number.isFinite(v)||v<0)throw Error('Invalid consumption quantity: '+k);});
  }
  function validateEstimate(e){
    if(!e||typeof e.type!=='string'||!e.assumptions)throw Error('Missing consumption estimation assumptions');
    validateAmounts(e.amounts);
    const a=e.assumptions;
    if(a.model!==2||a.capacitySingleStrandIn!==1890||![1,2].includes(a.stitchOver))throw Error('Unsupported consumption estimation model');
    ['fabricCount','strands','stitchesPerRun'].forEach(k=>{if(!Number.isFinite(a[k])||a[k]<=0)throw Error('Invalid consumption assumption: '+k);});
    ['tailAllowanceIn','wasteMultiplier','weight','geometryInPerCount'].forEach(k=>{if(!Number.isFinite(a[k])||a[k]<0)throw Error('Invalid consumption assumption: '+k);});
    if(!Array.isArray(a.blendWeights)||!a.blendWeights.length||a.blendWeights.some(n=>!Number.isFinite(n)||n<0)||!a.blendWeights.some(n=>n>0))throw Error('Invalid consumption blend weights');
  }
  function baselineState(ledger,pid,unit){
    const p=ledger.projects[pid],marked=p&&p.baseline[unit];
    return {seq:0,active:!!marked,estimate:null,debits:{},unpicked:null};
  }
  function eventState(e){return {seq:e.seq,active:e.active,estimate:e.estimate,debits:e.remainingDebits,unpicked:e.unpicked};}
  function state(ledger,pid,unit) {
    let s=baselineState(ledger,pid,unit);
    Object.values(ledger.events).forEach(e=>{if(e.projectId===pid&&e.unit===unit&&e.seq>s.seq)s=eventState(e);});return s;
  }
  function sequences(ledger,pid){
    const out=dict();Object.values(ledger.events).forEach(e=>{if(e.projectId===pid)out[e.unit]=Math.max(out[e.unit]||0,e.seq);});return out;
  }
  function baseline(ledger,pid,marks,legacy,date) {
    if(ledger.version!==2)throw Error('Unsupported consumption version');
    if(!safeId(pid))throw Error('Invalid consumption project identity');
    if(!ledger.projects[pid])ledger.projects[pid]={baseline:Object.fromEntries(Object.keys(marks).map(k=>[k,true])),date,reason:'Existing stock preserved; historical consumption unknown',legacy:legacy||null};
  }
  function totals(ledger,pid) {
    const out=dict();Object.keys(ledger.events).sort().map(id=>ledger.events[id]).forEach(e=>{if(pid&&e.projectId!==pid)return;Object.entries(e.debit||{}).forEach(([k,v])=>out[k]=(out[k]||0)+v);Object.entries(e.credit||{}).forEach(([k,v])=>out[k]=(out[k]||0)-v);});return out;
  }
  function apply(ledger,threads,ops,date,protectedStock) {
    const changed=new Set(),heads=dict();
    Object.values(ledger.events).forEach(e=>{const k=JSON.stringify([e.projectId,e.unit]);if(!heads[k]||heads[k].seq<e.seq)heads[k]=e;});
    ops.forEach(op=>{
      if(!safeId(op.projectId)||!safeId(op.unit)||!Number.isSafeInteger(op.seq)||op.seq<1)throw Error('Invalid consumption operation identity');
      if(!ledger.projects[op.projectId])throw Error('Consumption baseline required');
      const id=JSON.stringify([op.projectId,op.unit,op.seq]);
      if(!ledger.receipts)ledger.receipts={};
      if(op.token&&ledger.receipts[op.token])return;
      if(ledger.events[id]){if(op.token)ledger.receipts[op.token]=id;return;} // committed retry, including a lost acknowledgement
      const headKey=JSON.stringify([op.projectId,op.unit]),head=heads[headKey];
      const s=head?eventState(head):baselineState(ledger,op.projectId,op.unit);
      if(op.seq!==s.seq+1)throw Error('Consumption history changed. Reload the project before continuing.');
      if(!['mark','correction','unpick','undo-unpick','correct-project'].includes(op.kind))throw Error('Invalid consumption action');
      const estimate=op.kind==='mark'?(op.estimate||s.estimate):(s.estimate||op.estimate);
      if(!estimate)throw Error('Consumption estimate required');
      validateEstimate(estimate);
      let active=op.kind==='mark'||op.kind==='undo-unpick', debit={},credit={},remainingDebits=copy(s.debits),unpicked=null;
      if(op.kind==='mark'&&!s.active&&op.enabled){
        Object.entries(estimate.amounts).forEach(([k,v])=>{const entry=threads[k],available=Math.max(0,quantity(entry)-((protectedStock||{})[k]||0));debit[k]=Math.min(available,v);remainingDebits[k]=debit[k];});
      } else if(op.kind==='correction'||op.kind==='correct-project') {
        credit=copy(s.debits);remainingDebits={};active=op.kind==='correct-project'?s.active:false;
      } else if(op.kind==='unpick') {unpicked={debits:copy(s.debits)};remainingDebits={};}
      else if(op.kind==='undo-unpick'){remainingDebits=s.unpicked?s.unpicked.debits:{};}
      new Set([...Object.keys(debit),...Object.keys(credit)]).forEach(k=>{
        const delta=(credit[k]||0)-(debit[k]||0);if(!delta)return;
        const t=threads[k]||(threads[k]={owned:0});t.owned=Math.max(0,quantity(t)+delta);t.partialStatus=null;
        t.lastAdjustedAt=date;t._v=(t._v||0)+1;
        if(!Array.isArray(t.history))t.history=[];
        t.history.push({date,delta,eventId:id,reason:op.kind==='mark'?'Stitched '+estimate.type+' in '+op.projectId:'Corrected accidental progress mark in '+op.projectId});
        changed.add(k);
      });
      if(op.token)ledger.receipts[op.token]=id;
      ledger.events[id]={id,projectId:op.projectId,unit:op.unit,seq:op.seq,kind:op.kind,date:op.date||date,active,estimate:copy(estimate),debit,credit,remainingDebits,unpicked,
        description:op.kind==='unpick'?'Physically unpicked; used thread stays consumed':op.kind==='mark'?(op.enabled?'Stitched '+estimate.type:'Marked while live deductions were off'):op.kind==='undo-unpick'?'Corrected an accidental unpick; no new thread used':'Corrected accidental progress; only recorded stock debit returned'};
      heads[headKey]=ledger.events[id];
    });
    return Array.from(changed);
  }
  function quantity(t){return t?(Number.isFinite(t.owned)&&t.owned>0?t.owned:0)+({'mostly-full':.75,'about-half':.5,remnant:.25}[t.partialStatus]||0):0;}
  function validate(ledger) {
    if(!ledger||ledger.version!==2||!ledger.projects||!ledger.events)throw Error('Unsupported consumption history');
    const replay=empty(),heads=dict();
    Object.entries(ledger.projects).forEach(([pid,p])=>{
      if(!safeId(pid)||!p||!p.baseline)throw Error('Invalid consumption baseline');
      if(Object.values(p.baseline).some(v=>v!==true))throw Error('Invalid historical progress baseline');replay.projects[pid]=copy(p);
    });
    Object.entries(ledger.events).sort((a,b)=>a[1].seq-b[1].seq).forEach(([id,e])=>{
      if(!e||id!==e.id||id!==JSON.stringify([e.projectId,e.unit,e.seq])||!Number.isSafeInteger(e.seq)||e.seq<1||!safeId(e.projectId)||!safeId(e.unit)||!replay.projects[e.projectId])throw Error('Invalid consumption event identity');
      validateAmounts(e.debit);validateAmounts(e.credit);validateAmounts(e.remainingDebits);
      validateEstimate(e.estimate);
      const hk=JSON.stringify([e.projectId,e.unit]),st=heads[hk]?eventState(heads[hk]):baselineState(replay,e.projectId,e.unit);
      if(e.seq!==st.seq+1)throw Error('Incomplete consumption history');
      const correction=e.kind==='correction'||e.kind==='correct-project';
      if(!['mark','correction','correct-project','unpick','undo-unpick'].includes(e.kind))throw Error('Invalid consumption event kind');
      if(stable(e.credit)!==stable(correction?st.debits:{}))throw Error('Invalid consumption correction credit');
      Object.entries(e.debit).forEach(([k,v])=>{if(e.kind!=='mark'||st.active||v>(e.estimate.amounts[k]||0))throw Error('Invalid consumption debit');});
      let remaining=correction||e.kind==='unpick'?{}:e.kind==='undo-unpick'?(st.unpicked?st.unpicked.debits:{}):e.kind==='mark'&&!st.active?e.debit:st.debits;
      // A disabled mark has an empty debit map.
      if(stable(e.remainingDebits)!==stable(remaining))throw Error('Invalid remaining consumption debit');
      const active=e.kind==='mark'||e.kind==='undo-unpick'||(e.kind==='correct-project'&&st.active);
      if(e.active!==active)throw Error('Invalid consumption progress state');
      const expectedUnpick=e.kind==='unpick'?{debits:st.debits}:null;
      if(stable(e.unpicked)!==stable(expectedUnpick))throw Error('Invalid physical unpick history');
      replay.events[id]=e;heads[hk]=e;
    });
    Object.entries(ledger.receipts||{}).forEach(([token,id])=>{if(!safeId(token)||!ledger.events[id])throw Error('Invalid consumption receipt');});
    Object.values(totals(ledger)).forEach(n=>{if(!Number.isFinite(n)||n < -1e-12)throw Error('Invalid consumption total');});
    return ledger;
  }
  function merge(a,b) {
    a=a||empty();b=b||empty();validate(a);validate(b);
    const out=copy(a);
    Object.entries(b.projects).forEach(([id,p])=>{if(!out.projects[id])out.projects[id]=copy(p);
      else if(stable(out.projects[id].baseline)!==stable(p.baseline)||stable(out.projects[id].legacy)!==stable(p.legacy))throw Error('Conflicting consumption baselines. Reconcile inventory before syncing these copies.');
      else if (p.date < out.projects[id].date) out.projects[id].date = p.date;});
    Object.entries(b.events).forEach(([id,e])=>{
      validateAmounts(e.debit);validateAmounts(e.credit);
      if(id!==JSON.stringify([e.projectId,e.unit,e.seq])||!Number.isSafeInteger(e.seq)||e.seq<1)throw Error('Invalid consumption event identity');
      if(out.events[id]){
        const l=Object.assign({},out.events[id]),r=Object.assign({},e);delete l.date;delete r.date;
        if(stable(l)!==stable(r))throw Error('Conflicting consumption history. Reconcile inventory before syncing these copies.');
        if (e.date < out.events[id].date) out.events[id].date = e.date;
      }else out.events[id]=copy(e);
    });Object.entries(b.receipts||{}).forEach(([token,id])=>{if(out.receipts[token]&&out.receipts[token]!==id)throw Error('Conflicting consumption receipt');out.receipts[token]=id;});return validate(out);
  }
  // Reconstruct each side's stock before its known events, reconcile that stock,
  // then subtract the union once. A side without a ledger is an inventory baseline.
  function mergeStock(local,remote,mergedThreads) {
    const a=local[KEY]||empty(),b=remote[KEY]||empty(),ledger=merge(a,b),at=totals(a),bt=totals(b),mt=totals(ledger);
    Object.keys(mergedThreads).forEach(k=>{
      if(!(k in mt))return;
      const l=(local.threads||{})[k],r=(remote.threads||{})[k];
      const gross=Math.max(l?quantity(l)+(at[k]||0):-Infinity,r?quantity(r)+(bt[k]||0):-Infinity,0);
      if((mt[k]||0)>gross+1e-12)throw Error('Combined consumption exceeds recorded stock. Reconcile inventory before syncing these copies.');
      mergedThreads[k].owned=Math.max(0,gross-(mt[k]||0));mergedThreads[k].partialStatus=null;
    });return ledger;
  }
  const api={KEY,snapshot,live,empty,baseline,state,apply,totals,merge,mergeStock,quantity,validate,sequences};root.ThreadAccounting=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
