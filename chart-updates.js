/* Reviewed chart migrations. No importer and no inventory writes: source charts
 * are supplied by the existing import review. Coordinates are zero-based cells. */
(function(root) {
  'use strict';
  const clone = x => structuredClone(x);
  const canonical = x => JSON.stringify(x, (_,v) => v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v)
    ? Object.keys(v).sort().reduce((o,k) => { Object.defineProperty(o,k,{value:v[k],enumerable:true}); return o; },{}) : v);
  const empty = t => !t || t.id == null || String(t.id).startsWith('__');
  function size(p) {
    const w=p.settings && p.settings.sW, h=p.settings && p.settings.sH;
    if (!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||w*h>4000000||!Array.isArray(p.pattern)||p.pattern.length!==w*h)
      throw Error('This update needs a native chart grid with valid dimensions. Repair or re-export the chart first.');
    return [w,h];
  }
  function material(t,brand) {
    if (!t) return null;
    const b=String(t.brand||brand||'dmc').toLowerCase();
    return {id:String(t.id),brand:b,type:t.type||'solid',strands:t.strands,blendRatio:t.blendRatio,
      threads:t.threads && t.threads.map(v=>material(v,b)),unresolved:t.id==null||!!t.placeholder||/^(?:[USC]\d+|unknown|unresolved)/i.test(String(t.id)),rgb:!['dmc','anchor'].includes(b)||t.placeholder||/^[USC]\d+$/i.test(String(t.id))?t.rgb:undefined};
  }
  function geometry(kind,points,part) {
    let pts=points;
    if (points.length===2) pts=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    return canonical([kind,pts,part||'']);
  }
  function units(p) {
    if(p.specialtyVersion!=null&&p.specialtyVersion!==1)throw Error('Unsupported specialty stitch version; re-export supported native objects first.');
    const [w,h]=size(p), brand=p.settings.threadBrand||'dmc', out=[];
    const hd=new Map(p.halfDone||[]),pd=new Map(p.partialDone||[]);
    const done={bs:new Set(p.bsDone||[]),knot:new Set(p.knotsDone||[]),bead:new Set(p.beadsDone||[]),specialty:new Set(p.specialtyDone||[])};
    function add(kind,id,points,t,raw,marked,part) {
      if (!points.every(pt=>pt.every(Number.isFinite))) throw Error('Invalid stitch geometry: '+id);
      if(points.some(([x,y])=>x<0||y<0||x>w||y>h)||(['full','half','quarter'].includes(kind)&&points.some(([x,y])=>x>=w||y>=h))||
        (part==='petite'&&(points[0][0]+0.5>w||points[0][1]+0.5>h)))throw Error('Stitch lies outside the chart: '+id);
      if(kind==='specialty' && (!['petite','long_stitch'].includes(part)||empty(t)||typeof t.id!=='string'||
        !Array.isArray(t.rgb)||t.rgb.length!==3||!t.rgb.every(v=>Number.isInteger(v)&&v>=0&&v<=255)||
        points.some(pt=>pt.some(v=>!Number.isInteger(v*2)))||(part==='long_stitch'&&canonical(points[0])===canonical(points[1]))))
        throw Error('Unsupported or invalid specialty stitch; repair its thread and geometry in the source first: '+id);
      if(kind==='bead'&&points.some(pt=>pt.some(v=>!Number.isInteger(v*2))))throw Error('Invalid bead half-cell coordinates: '+id);
      if(kind==='knot'&&(!Number.isInteger(raw.x)||!Number.isInteger(raw.y)||(raw.x&1)!==(raw.y&1)))throw Error('Invalid knot lattice coordinates: '+id);
      const thread=material(t,brand);
      if(kind==='bead')thread.appearance={label:raw.label,rgb:raw.rgb,size:raw.size,shape:raw.shape};
      out.push({kind,id,points,thread,raw:clone(raw),done:!!marked,part,geom:geometry(kind,points,part)});
    }
    p.pattern.forEach((t,i)=>{if(!empty(t))add('full','d:'+i,[[i%w,Math.floor(i/w)]],t,t,p.done&&p.done[i]===1);});
    [['halfStitches','half',['fwd','bck']],['partialStitches','quarter',['TL','TR','BL','BR']]].forEach(([field,kind,parts])=>{
      const seen=new Set();
      (p[field]||[]).forEach(([i,cell])=>{
        if(!Number.isInteger(i)||i<0||i>=w*h||seen.has(i))throw Error('Duplicate or invalid fractional cell. Repair the source first.');
        seen.add(i);
        parts.forEach(part=>{if(!empty(cell[part]))add(kind,(kind==='half'?'h:':'q:')+i+':'+part,[[i%w,Math.floor(i/w)]],cell[part],cell[part],kind==='half'?hd.get(i)&&hd.get(i)[part]:(pd.get(i)||[]).includes(part),part);});
      });
    });
    (p.bsLines||p.bs||[]).forEach((o,i)=>{
      const key=backKey(o);
      add('bs','b:'+i,[[o.x1,o.y1],[o.x2,o.y2]],{id:o.colorId||o.color,brand:o.brand},o,done.bs.has(key));
    });
    (p.knots||[]).forEach((o,i)=>add('knot','k:'+i,[[o.x/2,o.y/2]],o,o,done.knot.has(o.x+','+o.y)));
    ['beads','specialtyStitches'].forEach(field=>{
      const kind=field==='beads'?'bead':'specialty';
      (p[field]||[]).forEach((o,i)=>add(kind,(kind==='bead'?'e:':'s:')+i,o.type==='long_stitch'?[[o.x1,o.y1],[o.x2,o.y2]]:[[o.x/(kind==='bead'?2:1),o.y/(kind==='bead'?2:1)]],o.thread||o,o,done[kind].has(o.uid),o.type||''));
    });
    const seen=new Map();
    return out.filter(u=>{
      if(!['bs','knot'].includes(u.kind))return true;
      const key=canonical([u.geom,u.thread]);
      if(seen.has(key))return false;seen.set(key,u);return true;
    });
  }
  function backKey(o) {
    let pts=[[o.x1,o.y1],[o.x2,o.y2]].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    return pts.flat().concat(String(o.colorId!=null?o.colorId:o.color||'')).join(',');
  }
  function shifted(u,dx,dy) {
    const v=clone(u);v.points=v.points.map(([x,y])=>[x+dx,y+dy]);v.geom=geometry(v.kind,v.points,v.part);return v;
  }
  function options(raw) {
    const o=Object.assign({mode:'replace',dx:0,dy:0,regions:[]},raw);
    if(!['replace','append'].includes(o.mode)||![o.dx,o.dy].every(Number.isSafeInteger))throw Error('Choose an update mode and whole-cell offsets.');
    if(o.mode==='append'&&(o.dx<0||o.dy<0))throw Error('Page offsets must be non-negative. Use a corrected full chart to move the canvas origin.');
    if(!Array.isArray(o.regions))throw Error('Region mappings must be an array.');
    o.regions.forEach(r=>{if(!['x','y','w','h','dx','dy'].every(k=>Number.isSafeInteger(r[k]))||r.w<1||r.h<1)throw Error('Each region needs integer x, y, w, h, dx and dy.');});
    for(let i=0;i<o.regions.length;i++)for(let j=0;j<i;j++) {
      const a=o.regions[i],b=o.regions[j];
      if(a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h)throw Error('Old-coordinate mapping regions overlap. Resolve the alignment first.');
    }
    return o;
  }
  function offsetAt(points,o) {
    const shifts=points.map(([x,y])=>{
      const r=o.regions.find(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h);
      return r?[r.dx,r.dy]:[o.dx,o.dy];
    });
    if(shifts.some(v=>canonical(v)!==canonical(shifts[0])))return null;
    // A segment may cross a shifted interior even when both endpoints are outside.
    // Conservatively archive bounding-box intersections rather than bend a line.
    if(points.length>1 && o.regions.some(r=>{
      const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
      return Math.min(...xs)<r.x+r.w&&Math.max(...xs)>=r.x&&Math.min(...ys)<r.y+r.h&&Math.max(...ys)>=r.y&&
        canonical([r.dx,r.dy])!==canonical(shifts[0]);
    }))return null;
    return shifts[0];
  }
  function group(list,key) {
    const m=new Map();list.forEach(u=>{const k=key(u);if(!m.has(k))m.set(k,[]);m.get(k).push(u);});return m;
  }
  // A preview is data, and is rebuilt with every resolution. No writes occur here.
  function preview(before,incoming,rawOptions,resolutions) {
    if(root.ProgressUnits&&root.ProgressUnits.specialty){before=root.ProgressUnits.specialty.migrate(before);incoming=root.ProgressUnits.specialty.migrate(incoming);}
    const o=options(rawOptions), choices=resolutions||{}, [ow,oh]=size(before),[nw,nh]=size(incoming);
    const old=units(before), fresh=units(incoming), conflicts=[], changes=[], pairs=new Map(), originalById=new Map(old.map(u=>[u.id,u]));
    let target, w=nw,h=nh;
    const mapped=old.map(u=>{
      const off=o.mode==='append'?[0,0]:offsetAt(u.points,o);
      const v=off?shifted(u,...off):clone(u);v.unaligned=!off;return v;
    });
    if(o.mode==='append') {
      w=Math.max(ow,nw+o.dx);h=Math.max(oh,nh+o.dy);
      if(w*h>4000000)throw Error('The combined chart exceeds the supported grid size.');
      target=mapped.map(u=>Object.assign(clone(u),{id:'old:'+u.id}));
      const byGeom=group(target,u=>u.geom);
      fresh.forEach(u=>{
        const v=shifted(u,o.dx,o.dy);v.id='new:'+u.id;
        const same=byGeom.get(v.geom)||[];
        if(!same.length){target.push(v);byGeom.set(v.geom,[v]);return;}
        // Object identities can denote coincident stitches: never silently collapse them.
        const exact=same.length===1&&!v.thread.unresolved&&canonical(same[0].thread)===canonical(v.thread)&&!['bead','specialty'].includes(v.kind);
        if(exact)return;
        const key='overlap:'+v.id, choice=choices[key];
        conflicts.push({id:key,reason:'Overlapping page content',old:same.map(x=>x.id).join(', '),target:v.id,choices:['keep','incoming'],resolved:['keep','incoming'].includes(choice)});
        if(choice==='incoming') {target=target.filter(x=>!same.includes(x));target.push(v);byGeom.set(v.geom,[v]);}
      });
    } else target=fresh.map(u=>Object.assign(clone(u),{id:'new:'+u.id}));
    const byGeom=group(target,u=>u.geom),oldGeom=group(mapped,u=>u.geom),used=new Set();
    mapped.forEach(u=>{
      const candidates=u.unaligned?[]:(byGeom.get(u.geom)||[]);
      const exact=candidates.filter(v=>canonical(v.thread)===canonical(u.thread));
      const unique=exact.length===1&&!u.thread.unresolved&&!exact[0].thread.unresolved&&(oldGeom.get(u.geom)||[]).filter(v=>canonical(v.thread)===canonical(u.thread)).length===1;
      let match=o.mode==='append'?candidates.find(v=>v.id==='old:'+u.id)||null:null;
      if(!match&&unique&&!u.unaligned)match=exact[0];
      const unchanged=match && !used.has(match.id);
      if(!unchanged) {
        const choice=choices[u.id];
        match=candidates.find(v=>v.id===choice&&!used.has(v.id))||null;
        const resolved=choice==='archive'||!!match;
        conflicts.push({id:u.id,reason:u.unaligned?'Object crosses mapping regions':candidates.length?'Changed thread, stitch or duplicate geometry':'Deleted or moved stitch',description:u.kind+' at '+canonical(u.points)+'; old thread '+canonical(u.thread),old:u.id,target:candidates.map(v=>v.id).join(', '),choices:['archive'].concat(candidates.map(v=>v.id)),resolved});
      }
      if(match) {
        if(used.has(match.id))throw Error('Two old stitches cannot transfer to the same new stitch: '+match.id);
        used.add(match.id);pairs.set(u.id,match.id);
      }
      if(!unchanged)changes.push({old:u.id,kind:u.kind,oldPoints:originalById.get(u.id).points,mappedPoints:u.points,from:u.thread,to:match&&match.thread,completed:u.done,action:match?'transfer':'archive'});
    });
    const added=target.filter(u=>!used.has(u.id));
    const result=clone(before);
    result.settings=Object.assign({},before.settings,{sW:w,sH:h}); result.w=w;result.h=h;result.specialtyVersion=1;
    result.pattern=Array.from({length:w*h},()=>({id:'__skip__'}));result.done=new Array(w*h).fill(0);
    ['halfStitches','halfDone','partialStitches','partialDone','bsLines','bsDone','knots','knotsDone','beads','beadsDone','specialtyStitches','specialtyDone'].forEach(k=>{result[k]=[];});
    const oldById=originalById;
    const reverse=new Map(Array.from(pairs,([a,b])=>[b,oldById.get(a)]));
    result.chartAccountingUnits={};
    function accountingKey(u,w) {
      const [x,y]=u.points[0],i=y*w+x;
      if(u.kind==='full')return 'd:'+i;
      if(u.kind==='half'||u.kind==='quarter')return (u.kind==='half'?'h:':'q:')+i+':'+u.part;
      if(u.kind==='knot')return 'k:'+x*2+','+y*2;
      if(u.kind==='bs')return 'b:'+backKey(Object.assign({},u.raw,{x1:u.points[0][0],y1:u.points[0][1],x2:u.points[1][0],y2:u.points[1][1]}));
      return (u.kind==='bead'?'e:':'s:')+u.raw.uid;
    }
    const half=new Map(),quarter=new Map(),hd=new Map(),pd=new Map(),uidSets={bead:new Set(),specialty:new Set()};
    const reservedUids=new Set(old.map(u=>u.raw.uid).filter(Boolean));
    target.forEach(u=>{
      const from=reverse.get(u.id), marked=!!(from&&from.done), [x,y]=u.points[0], idx=y*w+x;
      if(['full','half','quarter'].includes(u.kind)&&(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=w||y>=h))throw Error('Mapped cell lies outside the new chart.');
      if(u.kind==='full'){result.pattern[idx]=Object.assign(clone(u.raw),{brand:u.thread.brand});result.done[idx]=marked?1:0;}
      else if(u.kind==='half'||u.kind==='quarter') {
        const cells=u.kind==='half'?half:quarter,marks=u.kind==='half'?hd:pd;
        if(!cells.has(idx))cells.set(idx,{});cells.get(idx)[u.part]=Object.assign(clone(u.raw),{brand:u.thread.brand});
        if(marked){if(!marks.has(idx))marks.set(idx,u.kind==='half'?{}:[]);if(u.kind==='half')marks.get(idx)[u.part]=true;else marks.get(idx).push(u.part);}
      } else {
        const v=clone(u.raw);
        if(u.kind==='specialty')v.thread=Object.assign({},v.thread,{brand:u.thread.brand});else v.brand=u.thread.brand;
        if(u.points.length===2){[v.x1,v.y1]=u.points[0];[v.x2,v.y2]=u.points[1];}
        else {v.x=x*(['knot','bead'].includes(u.kind)?2:1);v.y=y*(['knot','bead'].includes(u.kind)?2:1);}
        if(u.kind==='bs'){result.bsLines.push(v);if(marked)result.bsDone.push(backKey(v));}
        if(u.kind==='knot'){result.knots.push(v);if(marked)result.knotsDone.push(v.x+','+v.y);}
        if(['bead','specialty'].includes(u.kind)) {
          // Keep old uid for an actual match; fresh objects receive distinct ids.
          v.uid=from&&from.raw.uid||'chart-'+u.id;
          if(!from)while(reservedUids.has(v.uid)||uidSets[u.kind].has(v.uid))v.uid+='-new';
          if(uidSets[u.kind].has(v.uid))throw Error('Duplicate object identity in the source. Repair the chart first.');
          uidSets[u.kind].add(v.uid);
          const field=u.kind==='bead'?'beads':'specialtyStitches',df=u.kind==='bead'?'beadsDone':'specialtyDone';
          result[field].push(v);if(marked)result[df].push(v.uid);u.raw.uid=v.uid;
        }
      }
      const key=accountingKey(u,w),prior=from&&accountingKey(from,ow);
      result.chartAccountingUnits[key]=from?((before.chartAccountingUnits||{})[prior]||prior):'pending:'+key;
    });
    result.halfStitches=Array.from(half);result.halfDone=Array.from(hd);result.partialStitches=Array.from(quarter);result.partialDone=Array.from(pd);
    // Coordinate annotations are migrated only through an explicit alignment.
    // Out-of-bounds / spanning annotations are archived, never silently clamped.
    const annotations=[];
    ['singleStitchEdits','doneSnapshots','focusBlock','workingContext','workArea'].forEach(field=>{
      if(before[field]!=null && canonical(before[field])!=='[]')annotations.push({field,value:clone(before[field])});
    });
    const liveThreadIds=new Set(target.flatMap(u=>[u.thread.id].concat((u.thread.threads||[]).map(t=>t.id))));
    ['parkMarkers','breadcrumbs'].forEach(field=>{
      result[field]=(before[field]||[]).flatMap(v=>{
        if(!Number.isFinite(v.x)||!Number.isFinite(v.y)){annotations.push({field,value:v});return [];}
        const off=o.mode==='append'?[0,0]:offsetAt([[v.x,v.y]],o);
        const n=Object.assign({},v,{x:v.x+off[0],y:v.y+off[1]});
        if(n.x<0||n.y<0||n.x>=w||n.y>=h||(field==='parkMarkers'&&(!liveThreadIds.has(String(n.colorId))||result.done[n.y*w+n.x]===1))){annotations.push({field,value:v});return [];}
        return [n];
      });
    });
    // Chart-dependent edit/undo/focus caches are invalid after a migration.
    ['p','bs','originalPaletteState','singleStitchEdits','doneSnapshots','focusBlock','workingContext','workArea','savedScroll','hlRow','hlCol','trackingSync','valueSync','_import'].forEach(k=>delete result[k]);
    result.symbols=o.mode==='replace'?clone(incoming.symbols||{}):{};
    result.meta=Object.assign({},before.meta,{attachments:Object.assign({},before.meta&&before.meta.attachments,incoming.meta&&incoming.meta.attachments)});
    const annotationKey='annotations';
    if(annotations.length)conflicts.push({id:annotationKey,reason:annotations.length+' coordinate annotations need archiving',choices:['archive'],resolved:choices[annotationKey]==='archive'});
    return {result,conflicts,changes,added:added.map(u=>({id:u.id,thread:u.thread,points:u.points})),pairs:Array.from(pairs),annotations,
      counts:{matched:pairs.size,added:added.length,changed:changes.length,completed:Array.from(reverse.values()).filter(u=>u.done).length},
      dimensions:{before:[ow,oh],after:[w,h]},options:o,ready:conflicts.every(c=>c.resolved)};
  }
  const api={preview,units,canonical};root.ChartUpdates=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
