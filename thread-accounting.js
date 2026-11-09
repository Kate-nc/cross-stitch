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
  // Sums in event-id order, as always (floating-point sums depend on order). Taking
  // the project's events before sorting keeps that order and skips sorting the rest.
  function totals(ledger,pid) {
    let ids=Object.keys(ledger.events);
    if(pid)ids=ids.filter(id=>ledger.events[id].projectId===pid);
    const out=dict();ids.sort().map(id=>ledger.events[id]).forEach(e=>{Object.entries(e.debit||{}).forEach(([k,v])=>out[k]=(out[k]||0)+v);Object.entries(e.credit||{}).forEach(([k,v])=>out[k]=(out[k]||0)-v);});return out;
  }
  /* Events are never edited once written, so equal parts can be one shared object:
     the estimate (identical for every stitch of a thread and type) and the empty
     debit/credit/remaining amounts most events carry. The ledger holds an event for
     every stitch ever marked and is stored as one IndexedDB record, read and written
     whole on each write; structured clone keeps shared references (and reads them
     back shared), so this roughly halves its size and the time to read and write it.
     JSON (backups, sync files) is unchanged. */
  const EMPTY=Object.freeze({});
  const sharedParts=new Map();const SHARE_MAX=2048;
  function share(x,memo){
    if(!x||typeof x!=='object')return x;
    const known=memo&&memo.get(x);if(known)return known;
    const key=JSON.stringify(x);let s=sharedParts.get(key);   // key order too: the stored JSON must not change
    if(!s){if(sharedParts.size>=SHARE_MAX)sharedParts.clear();s=copy(x);sharedParts.set(key,s);}
    if(memo)memo.set(x,s);
    return s;
  }
  const emptyOr=d=>d&&typeof d==='object'&&!Array.isArray(d)&&Object.keys(d).length===0?EMPTY:d;
  // Share the parts of every event in a ledger read from storage (it is owned by the
  // caller, so objects can be recognised by identity). Content is unchanged.
  function compact(ledger){
    const memo=typeof WeakMap==='function'?new WeakMap():null;
    Object.values(ledger.events||{}).forEach(e=>{
      if(!e||typeof e!=='object')return;
      if(e.estimate&&typeof e.estimate==='object')e.estimate=share(e.estimate,memo);
      e.debit=emptyOr(e.debit);e.credit=emptyOr(e.credit);e.remainingDebits=emptyOr(e.remainingDebits);
    });
    return ledger;
  }
  function apply(ledger,threads,ops,date,protectedStock) {
    const changed=new Set();
    // The newest event of each (project, unit) the operations touch. Only those are
    // ever looked up, so other events are skipped without building a key for each.
    const want=new Map(),heads=new Map();
    ops.forEach(op=>{if(op){if(!want.has(op.projectId))want.set(op.projectId,new Set());want.get(op.projectId).add(op.unit);}});
    Object.values(ledger.events).forEach(e=>{
      const units=want.get(e.projectId);if(!units||!units.has(e.unit))return;
      let byUnit=heads.get(e.projectId);if(!byUnit)heads.set(e.projectId,byUnit=new Map());
      const h=byUnit.get(e.unit);if(!h||h.seq<e.seq)byUnit.set(e.unit,e);
    });
    const headOf=(pid,unit)=>{const m=heads.get(pid);return m?m.get(unit):undefined;};
    ops.forEach(op=>{
      if(!safeId(op.projectId)||!safeId(op.unit)||!Number.isSafeInteger(op.seq)||op.seq<1)throw Error('Invalid consumption operation identity');
      if(!ledger.projects[op.projectId])throw Error('Consumption baseline required');
      const id=JSON.stringify([op.projectId,op.unit,op.seq]);
      if(!ledger.receipts)ledger.receipts={};
      if(op.token&&ledger.receipts[op.token])return;
      if(ledger.events[id]){if(op.token)ledger.receipts[op.token]=id;return;} // committed retry, including a lost acknowledgement
      const head=headOf(op.projectId,op.unit);
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
      ledger.events[id]={id,projectId:op.projectId,unit:op.unit,seq:op.seq,kind:op.kind,date:op.date||date,active,estimate:share(estimate),debit:emptyOr(debit),credit:emptyOr(credit),remainingDebits:emptyOr(remainingDebits),unpicked,
        description:op.kind==='unpick'?'Physically unpicked; used thread stays consumed':op.kind==='mark'?(op.enabled?'Stitched '+estimate.type:'Marked while live deductions were off'):op.kind==='undo-unpick'?'Corrected an accidental unpick; no new thread used':'Corrected accidental progress; only recorded stock debit returned'};
      if(!heads.has(op.projectId))heads.set(op.projectId,new Map());
      heads.get(op.projectId).set(op.unit,ledger.events[id]);
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
  const projectsWithEvents=l=>{const s=new Set();Object.values(l.events).forEach(e=>s.add(e.projectId));return s;};
  /* The Tracker records a baseline when a project is first opened on a device,
     so two devices that opened it before their stashes synced hold different
     ones. A baseline with no events after it recorded no thread use: keep the
     other side's, whose events depend on it. With neither used, keep the earlier
     (then the smaller), so the result does not depend on merge order. With both
     used the histories really differ, and this returns null. */
  function pickBaseline(l,lUsed,r,rUsed){
    if(lUsed&&rUsed)return null;
    if(lUsed)return l;if(rUsed)return r;
    if(l.date!==r.date)return r.date<l.date?r:l;
    return stable(r)<stable(l)?r:l;
  }
  function merge(a,b) {
    a=a||empty();b=b||empty();validate(a);validate(b);
    const out=copy(a);let aUsed=null,bUsed=null;
    Object.entries(b.projects).forEach(([id,p])=>{const o=out.projects[id];if(!o)out.projects[id]=copy(p);
      else if(stable(o.baseline)!==stable(p.baseline)||stable(o.legacy)!==stable(p.legacy)){
        if(!aUsed){aUsed=projectsWithEvents(a);bUsed=projectsWithEvents(b);}
        const keep=pickBaseline(o,aUsed.has(id),p,bUsed.has(id));
        if(!keep)throw Error('Conflicting consumption baselines. Reconcile inventory before syncing these copies.');
        if(keep===p)out.projects[id]=copy(p);
      }
      else if (p.date < o.date) o.date = p.date;});
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
  // A ledger split into one small ledger per project (record, events, receipts).
  function byProject(l){
    const out=new Map(),part=pid=>{let p=out.get(pid);if(!p)out.set(pid,p=empty());return p;};
    Object.entries(l.projects).forEach(([pid,p])=>{part(pid).projects[pid]=p;});
    Object.entries(l.events).forEach(([id,e])=>{part(e.projectId).events[id]=e;});
    Object.entries(l.receipts||{}).forEach(([t,id])=>{const e=l.events[id];if(e)part(e.projectId).receipts[t]=id;});
    return out;
  }
  /* merge(), but a project whose two histories cannot be combined keeps this
     device's history (a) and leaves out the incoming one (b), instead of the
     whole merge failing. Returns {ledger, conflicts}, conflicts being the
     project ids left out. Leaving out events never charges thread twice: the
     other device's stitching on that project is just not charged here. A
     malformed ledger still throws. */
  function mergeContained(a,b) {
    a=a||empty();b=b||empty();
    try{return {ledger:merge(a,b),conflicts:[]};}catch(e){validate(a);validate(b);}
    const pa=byProject(a),pb=byProject(b),bad=new Set();
    pb.forEach((part,pid)=>{try{merge(pa.get(pid)||empty(),part);}catch(e){bad.add(pid);}});
    // A receipt token names one event; two names for it is a contradiction too.
    Object.entries(b.receipts||{}).forEach(([t,id])=>{const mine=(a.receipts||{})[t];if(mine&&mine!==id&&b.events[id])bad.add(b.events[id].projectId);});
    const kept=empty();
    Object.entries(b.projects).forEach(([pid,p])=>{if(!bad.has(pid))kept.projects[pid]=p;});
    Object.entries(b.events).forEach(([id,e])=>{if(!bad.has(e.projectId))kept.events[id]=e;});
    Object.entries(b.receipts||{}).forEach(([t,id])=>{if(kept.events[id])kept.receipts[t]=id;});
    return {ledger:merge(a,kept),conflicts:Array.from(bad).sort()};
  }
  // Reconstruct each side's stock before its known events, reconcile that stock,
  // then subtract the union once. A side without a ledger is an inventory baseline.
  // Each side's gross uses its whole ledger: gross stock does not change with
  // stitching, so leaving a project's incoming events out of the union leaves
  // that stitching uncharged here rather than charging it twice. report, when
  // given, receives {conflicts} from mergeContained.
  function mergeStock(local,remote,mergedThreads,report) {
    const a=local[KEY]||empty(),b=remote[KEY]||empty(),contained=mergeContained(a,b),ledger=contained.ledger,at=totals(a),bt=totals(b),mt=totals(ledger);
    if(report)report.conflicts=contained.conflicts;
    Object.keys(mergedThreads).forEach(k=>{
      // Also a thread used only by incoming events left out above: its stock is
      // still rebuilt from each side's gross, with nothing to subtract.
      if(!(k in mt)&&!(k in at)&&!(k in bt))return;
      const l=(local.threads||{})[k],r=(remote.threads||{})[k];
      const gross=Math.max(l?quantity(l)+(at[k]||0):-Infinity,r?quantity(r)+(bt[k]||0):-Infinity,0);
      if((mt[k]||0)>gross+1e-12)throw Error('Combined consumption exceeds recorded stock. Reconcile inventory before syncing these copies.');
      mergedThreads[k].owned=Math.max(0,gross-(mt[k]||0));mergedThreads[k].partialStatus=null;
    });return ledger;
  }
  /* The marks before some pending operations, given the marks after them. The
     Tracker writes a project's baseline with its first operation, so after a
     crash that saved progress but not the pending operations, the reloaded marks
     already include them: as a baseline they would make the replayed marks look
     like history and charge nothing. Each operation says how its unit stood
     before it (a mark or undo-unpick found it unmarked, a correction or unpick
     found it marked), and the earliest one on a unit decides. Only the keys
     matter to a baseline. */
  function marksBefore(marks,ops){
    const out=Object.assign(dict(),marks),seen=new Set();
    (ops||[]).filter(op=>op&&safeId(op.unit)).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))).forEach(op=>{
      if(seen.has(op.unit))return;seen.add(op.unit);
      if(op.kind==='mark'||op.kind==='undo-unpick')delete out[op.unit];
      else if(op.kind==='correction'||op.kind==='unpick')out[op.unit]=out[op.unit]||op.estimate||true;
    });
    return out;
  }
  /* ── Stored form ────────────────────────────────────────────────────────
     The ledger used to be one IndexedDB record (KEY), read and written whole
     by every commit: with a long history (many projects, an event per stitch
     ever marked) committing five events cost a second at phone speed. It is
     now kept in the same manager_state store as one record per event, one per
     project and one per receipt token, so a commit reads the heads of the units
     it touches and writes what it adds:

       tc2:meta                                   {t:'meta', format:1}
       tc2:p|<project>                            {projectId, record, totals, events}
           record   ledger.projects[project] (null before the first operation)
           totals   per thread: exact running sums of debit - credit (sumAdd)
           events   how many events the project has
       tc2:e|<project>|<unit>|<seq, 16 digits>    the event, exactly as in ledger.events
       tc2:r|<token>                              {token, id}

     Identifiers are URI-encoded, so '|' only ever separates them, and seq is
     zero-padded, so a reverse cursor over a unit's range finds its newest
     event. The whole-ledger shape (KEY) stays the interchange form: backups,
     sync files and the Stash Manager's history assemble it (fromRows), and a
     whole ledger written under KEY (a restore, a sync import, an older build)
     is folded into the stored form by the next write (StashBridge). */
  const STORED_PREFIX='tc2:',STORED_END='tc2:\uffff',META_KEY='tc2:meta',P_PREFIX='tc2:p|',E_PREFIX='tc2:e|',R_PREFIX='tc2:r|';
  const enc=encodeURIComponent,dec=decodeURIComponent;
  const pad=n=>{const s=String(n);return '0000000000000000'.slice(s.length)+s;};
  const storedKeys={
    project:pid=>P_PREFIX+enc(pid),
    event:(pid,unit,seq)=>E_PREFIX+enc(pid)+'|'+enc(unit)+'|'+pad(seq),
    eventId:e=>E_PREFIX+enc(e.projectId)+'|'+enc(e.unit)+'|'+pad(e.seq),
    receipt:t=>R_PREFIX+enc(t),
    // [lower, upper] bounds of a unit's events, and of a project's.
    unitRange:(pid,unit)=>[E_PREFIX+enc(pid)+'|'+enc(unit)+'|',E_PREFIX+enc(pid)+'|'+enc(unit)+'|\uffff'],
    projectRange:pid=>[E_PREFIX+enc(pid)+'|',E_PREFIX+enc(pid)+'|\uffff'],
    eventRange:[E_PREFIX,E_PREFIX+'\uffff'],
    projectRows:[P_PREFIX,P_PREFIX+'\uffff'],
    all:[STORED_PREFIX,STORED_END],
  };
  const isStoredKey=k=>typeof k==='string'&&k.slice(0,4)===STORED_PREFIX;
  /* Exact running sums (Shewchuk's partials, as Python's fsum): adding the same
     amounts in any order gives the same correctly rounded total, so a total
     kept up to date one commit at a time equals one counted from scratch. */
  function sumAdd(p,x){
    let i=0;
    for(let j=0;j<p.length;j++){let y=p[j];if(Math.abs(x)<Math.abs(y)){const t=x;x=y;y=t;}const hi=x+y,lo=y-(hi-x);if(lo)p[i++]=lo;x=hi;}
    p.length=i;p.push(x);return p;
  }
  function sumValue(p){
    let n=p.length;if(!n)return 0;
    let hi=p[--n],lo=0;
    while(n>0){const x=hi,y=p[--n];hi=x+y;lo=y-(hi-x);if(lo)break;}
    if(n>0&&((lo<0&&p[n-1]<0)||(lo>0&&p[n-1]>0))){const y=lo*2,x=hi+y;if(y===x-hi)hi=x;}
    return hi;
  }
  function addEventTotals(totals,e){
    Object.entries(e.debit||{}).forEach(([k,v])=>{if(v)sumAdd(totals[k]||(totals[k]=[]),v);});
    Object.entries(e.credit||{}).forEach(([k,v])=>{if(v)sumAdd(totals[k]||(totals[k]=[]),-v);});
    return totals;
  }
  // A project's (or, merged, several projects') running sums as numbers.
  function totalsValue(sums){const out=dict();Object.keys(sums||{}).sort().forEach(k=>{const v=sumValue(sums[k].slice());if(v)out[k]=v;});return out;}
  // The stored rows of a whole ledger: [[key, value], ...].
  function toRows(l){
    const rows=[[META_KEY,{t:'meta',format:1}]],per=new Map();
    const row=pid=>{let r=per.get(pid);if(!r)per.set(pid,r={projectId:pid,record:null,totals:{},events:0});return r;};
    Object.entries(l.projects||{}).forEach(([pid,rec])=>{row(pid).record=rec;});
    Object.values(l.events||{}).forEach(e=>{const r=row(e.projectId);r.events++;addEventTotals(r.totals,e);rows.push([storedKeys.eventId(e),e]);});
    Object.entries(l.receipts||{}).forEach(([t,id])=>rows.push([storedKeys.receipt(t),{token:t,id}]));
    per.forEach((r,pid)=>rows.push([storedKeys.project(pid),r]));
    return rows;
  }
  // The whole ledger from stored rows ([[key, value], ...] or {key: value}),
  // or null when there are none. Does not include a KEY row (see fromRows).
  function assemble(rows){
    const list=Array.isArray(rows)?rows:Object.entries(rows||{});
    let out=null;
    list.forEach(([k,v])=>{
      if(!isStoredKey(k)||!v)return;
      if(!out)out=empty();
      if(k.startsWith(E_PREFIX))out.events[v.id]=v;
      else if(k.startsWith(P_PREFIX)){if(v.record)out.projects[v.projectId]=v.record;}
      else if(k.startsWith(R_PREFIX))out.receipts[v.token]=v.id;
    });
    return out;
  }
  // A stored ledger and a whole one written under KEY beside it (a restore or
  // a sync import that wrote the old way): combined as sync combines two
  // devices' histories, this device's (stored) winning a contradiction.
  function combineStored(stored,whole){
    if(!stored)return whole;if(!whole)return stored;
    return mergeContained(stored,whole).ledger;
  }
  // manager_state rows as their readers expect them: the ledger under KEY,
  // none of the stored rows. `rows` is {key: value}; returns a new object.
  function fromRows(rows){
    const out={},stored=[];
    Object.keys(rows||{}).forEach(k=>{if(isStoredKey(k))stored.push([k,rows[k]]);else out[k]=rows[k];});
    const ledger=combineStored(assemble(stored),out[KEY]||null);
    if(ledger)out[KEY]=ledger;else delete out[KEY];
    return out;
  }
  const api={KEY,snapshot,live,empty,baseline,state,apply,totals,merge,mergeContained,mergeStock,quantity,validate,sequences,compact,marksBefore,
    storedKeys,isStoredKey,META_KEY,sumAdd,sumValue,addEventTotals,totalsValue,toRows,assemble,combineStored,fromRows};root.ThreadAccounting=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
