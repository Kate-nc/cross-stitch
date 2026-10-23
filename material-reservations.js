/* Project reservation intent. Stock is never changed by planning. */
(function(root) {
  const KEY='thread_reservations_v1', A=root.ThreadAccounting;
  const E=typeof module!=='undefined'&&module.exports?require('./threadCalc'):root;
  const empty=()=>({version:1,projects:{}});
  const identity=k=>typeof k==='string'&&/^[a-z][a-z0-9-]{0,63}:[^:\x00-\x1f]+$/.test(k)&&k.slice(k.indexOf(':')+1)===k.slice(k.indexOf(':')+1).trim();
  const active=p=>p&&!['paused','complete'].includes(p.materialState)&&!p.archived&&!p.isArchived&&!['completed','UFO','abandoned','archived'].includes(p.finishStatus)&&!p.isComplete;
  function validate(r) {
    if(!r||r.version!==1||!r.projects||Array.isArray(r.projects))throw Error('Invalid material reservations');
    Object.entries(r.projects).forEach(([id,v])=>{
      if(!id||['__proto__','constructor','prototype'].includes(id)||!v||typeof v.enabled!=='boolean'||!v.limits||Array.isArray(v.limits)||!v.substitutions||Array.isArray(v.substitutions)||(v.revision!=null&&(!Number.isSafeInteger(v.revision)||v.revision<0)))throw Error('Invalid project reservation');
      Object.entries(v.limits).forEach(([k,n])=>{if(!identity(k)||!Number.isFinite(n)||n<0)throw Error('Invalid reservation quantity');});
      Object.entries(v.substitutions).forEach(([k,s])=>{if(!identity(k)||!s||!identity(s.key)||s.confirmed!==true||s.key===k)throw Error('Substitution requires explicit confirmation');});
    });return r;
  }
  function remap(amounts,request,convertSkeinLengths) {
    const out=Object.create(null);
    Object.entries(amounts).forEach(([k,n])=>{
      const s=request&&request.substitutions[k],key=s?s.key:k;
      // Planning quantities are skeins of each actual brand. Convert through
      // material length before adding uses of a replacement with another pack
      // length. Consumption events retain model 2's recorded standard-skein
      // units: their identity-only remap must never revalue a debit.
      const factor=s&&convertSkeinLengths?E.skeinLengthForBrand(k.slice(0,k.indexOf(':')))/E.skeinLengthForBrand(key.slice(0,key.indexOf(':'))):1;
      out[key]=(out[key]||0)+n*factor;
    });return out;
  }
  // Remaining chart demand uses the same planning model as Creator. Immutable
  // consumption events and stock balances are never recalculated here.
  function estimate(p,prefs) {
    const settings=p.settings||{};
    const rows=E.threadDemandRows(E.projectThreadEntries(p,true),{
      fabricCount:p.fabricCt||settings.fabricCt||p.fc||14,
      strandsUsed:settings.strandsUsed||2,
      wasteFactor:settings.wasteFactor==null?.20:settings.wasteFactor});
    return Object.fromEntries(rows.map(r=>[r.key,r.estimatedNeeded]));
  }
  function plan(threads,requests,projects,prefs) {
    validate(requests);const available=Object.create(null),reserved=Object.create(null),groups=[],combined=Object.create(null);
    Object.entries(threads||{}).forEach(([k,t])=>available[k]=A.quantity(t));
    // Stable ID priority is independent of tab order and clocks.
    projects.filter(active).sort((a,b)=>a.id.localeCompare(b.id)).forEach(p=>{
      const request=requests.projects[p.id],needed=remap(estimate(p,(p.settings&&p.settings.wastePrefs)||prefs),request,true),rows=[];
      Object.keys(needed).sort().forEach(k=>{
        const owned=A.quantity(threads[k]),free=available[k]||0,n=needed[k];
        const limit=request&&request.limits[k]!=null?request.limits[k]:n;
        const held=request&&request.enabled?Math.min(n,limit,free):0;
        available[k]=Math.max(0,free-held);reserved[k]=(reserved[k]||0)+held;
        rows.push({key:k,skeinLengthM:E.skeinLengthForBrand(k.slice(0,k.indexOf(':'))),owned,estimatedNeeded:n,reserved:held,shortage:Math.max(0,n-held)});
      });groups.push({id:p.id,name:p.name||p.id,estimationAssumptions:{model:'planning-3',fabricCount:p.fabricCt||(p.settings&&p.settings.fabricCt)||p.fc||14,strands:(p.settings&&p.settings.strandsUsed)||2,wasteFactor:p.settings&&p.settings.wasteFactor!=null?p.settings.wasteFactor:.20},enabled:!!(request&&request.enabled),rows,request:request||{enabled:false,limits:{},substitutions:{},revision:0},substitutions:request?request.substitutions:{}});
    });
    // Unreserved free stock covers the shopping view once, including projects
    // that have not elected to reserve. Round only after combining shortages.
    const shoppingFree={...available};
    groups.forEach(g=>g.rows.forEach(row=>{
      row.available=available[row.key]||0;
      const cover=Math.min(row.shortage,shoppingFree[row.key]||0);shoppingFree[row.key]=(shoppingFree[row.key]||0)-cover;
      row.shortage=Math.max(0,row.shortage-cover);
      const c=combined[row.key]||(combined[row.key]={key:row.key,shortage:0,projects:[]});c.shortage+=row.shortage;if(row.shortage>0)c.projects.push(g.id);
    }));
    return {version:1,unit:'skeins',model:'planning-3',defaultSkeinLengthM:8,groups,available,reserved,combined:Object.values(combined).filter(r=>r.shortage>1e-12).map(r=>({...r,buySkeins:Math.ceil(r.shortage-1e-12)}))};
  }
  root.MaterialReservations={KEY,empty,validate,active,estimate,plan,remap};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.MaterialReservations;
})(typeof window!=='undefined'?window:globalThis);
