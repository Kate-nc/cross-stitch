const C=require('../chart-updates.js');
const A=require('../thread-accounting.js');
const cell=id=>({id,type:'solid',rgb:[0,0,0]}),skip=()=>({id:'__skip__'});
const chart=(w,h,pattern,extra={})=>({id:'proj_chart',name:'Chart',settings:{sW:w,sH:h,threadBrand:'dmc'},pattern:pattern.map(t=>typeof t==='string'?cell(t):t),done:new Array(w*h).fill(0),...extra});
const full=(w,h,id='310',extra={})=>chart(w,h,new Array(w*h).fill(id),extra);
const resolveAll=(b,n,o,choice='archive')=>{
  let p=C.preview(b,n,o),r={};p.conflicts.forEach(c=>r[c.id]=c.choices.includes(choice)?choice:c.choices[0]);return C.preview(b,n,o,r);
};
test('appended pages preserve completed rows, notes and sessions; imported marks are ignored',()=>{
  const b=full(2,2,'310',{done:[1,0,0,1],notes:'Keep my note',statsSessions:[{id:'session',netStitches:2}]});
  const n=full(2,2,'666',{done:[1,1,1,1]});
  const p=C.preview(b,n,{mode:'append',dx:2});
  expect(p.ready).toBe(true);expect(p.dimensions.after).toEqual([4,2]);
  expect(p.result.done).toEqual([1,0,0,0,0,1,0,0]);
  expect(p.result.notes).toBe(b.notes);expect(p.result.statsSessions).toEqual(b.statsSessions);
  expect(p.result.chartAccountingUnits['d:5']).toBe('d:3');
});
test('inserted middle pages use explicit old region mappings instead of linear array indices',()=>{
  const b=chart(2,2,['310','310','666','666'],{done:[1,0,0,1]});
  const n=chart(2,3,['310','310','550','550','666','666']);
  const p=C.preview(b,n,{regions:[{x:0,y:1,w:2,h:1,dx:0,dy:1}]});
  expect(p.ready).toBe(true);expect(p.result.done).toEqual([1,0,0,0,0,1]);
});
test('moved origins transfer by x/y and width, with explicit offsets',()=>{
  const b=full(2,2,'310',{done:[1,0,0,1],parkMarkers:[{x:1,y:0,colorId:'310',note:'park here'}]});
  const n=full(3,3);
  const p=C.preview(b,n,{dx:1,dy:1});
  expect(p.ready).toBe(true);expect(p.result.done).toEqual([0,0,0,0,1,0,0,0,1]);
  expect(p.result.parkMarkers).toEqual([{x:2,y:1,colorId:'310',note:'park here'}]);
});
test('identical overlapping pages coalesce and do not duplicate crosses, lines or knots',()=>{
  const b=full(2,2,'310',{done:[1,0,0,1],bsLines:[{x1:0,y1:0,x2:1,y2:1,colorId:'310'}],bsDone:['0,0,1,1,310']});
  const p=C.preview(b,b,{mode:'append'});
  expect(p.ready).toBe(true);expect(p.counts.added).toBe(0);expect(p.result.bsLines).toHaveLength(1);expect(p.result.done).toEqual(b.done);
});
test('overlapping changed content cannot apply without page and progress decisions',()=>{
  const b=full(1,1,'310',{done:[1]}),n=full(1,1,'666');
  const p=C.preview(b,n,{mode:'append'});expect(p.ready).toBe(false);
  const keep=C.preview(b,n,{mode:'append'},{'overlap:new:d:0':'keep'});
  expect(keep.ready).toBe(true);expect(keep.result.pattern[0].id).toBe('310');
  const accept=C.preview(b,n,{mode:'append'},{'overlap:new:d:0':'incoming','d:0':'new:d:0'});
  expect(accept.ready).toBe(true);expect(accept.result.pattern[0].id).toBe('666');expect(accept.result.done).toEqual([1]);
});
test('corrected symbols and reordered palette match thread identity rather than labels or positions',()=>{
  const b=chart(2,1,['310','666'],{done:[1,0],symbols:{310:'A',666:'B'},palette:['310','666']});
  const n=chart(2,1,['310','666'],{symbols:{310:'B',666:'A'},palette:['666','310']});
  const p=C.preview(b,n);
  expect(p.ready).toBe(true);expect(p.result.done).toEqual([1,0]);expect(p.result.symbols).toEqual(n.symbols);
});
test('thread substitutions require explicit transfer or archive; deletion does not shift completion',()=>{
  const b=chart(3,1,['310','666','550'],{done:[1,1,1],notes:'annotated'});
  const n=chart(3,1,['310','321',skip()]);
  const p=C.preview(b,n);expect(p.ready).toBe(false);expect(p.result.done).toEqual([1,0,0]);
  const resolved=C.preview(b,n,{}, {'d:1':'new:d:1','d:2':'archive'});
  expect(resolved.ready).toBe(true);expect(resolved.result.done).toEqual([1,1,0]);expect(resolved.result.notes).toBe('annotated');
  expect(b.done).toEqual([1,1,1]);
});
test('brands, blends and stitch types must match',()=>{
  const b=chart(1,1,[{id:'310',brand:'dmc',type:'solid'}],{done:[1]});
  expect(C.preview(b,chart(1,1,[{id:'310',brand:'anchor',type:'solid'}])).ready).toBe(false);
  expect(C.preview(b,chart(1,1,[{id:'310',type:'half'}])).ready).toBe(false);
  const blend=full(1,1,'310+666',{done:[1]});blend.pattern[0].type='blend';blend.pattern[0].blendRatio=[1,2];
  const corrected=structuredClone(blend);corrected.pattern[0].blendRatio=[2,1];expect(C.preview(blend,corrected).ready).toBe(false);
});
function special() {
  return chart(2,2,[skip(),skip(),skip(),skip()],{
    notes:'Specialty note',halfStitches:[[0,{fwd:cell('310'),bck:cell('666')}]],halfDone:[[0,{fwd:true}]],
    partialStitches:[[1,{TL:cell('550'),BR:cell('321')}]],partialDone:[[1,['BR']]],
    knots:[{x:1,y:1,id:'310'}],knotsDone:['1,1'],
    bsLines:[{x1:0,y1:0,x2:2,y2:1,colorId:'310'}],bsDone:['0,0,2,1,310'],
    beads:[{uid:'bead-a',x:3,y:3,id:'bead-1'}],beadsDone:['bead-a'],
    specialtyStitches:[{uid:'petite-a',type:'petite',x:0,y:1,thread:cell('310')},{uid:'long-a',type:'long_stitch',x1:0,y1:0,x2:2,y2:2,thread:cell('666')}],specialtyDone:['petite-a']
  });
}
test('partial work across every specialised layer survives shifted origins and regenerated uids',()=>{
  const b=special(),n=structuredClone(b);n.settings.sW=3;n.settings.sH=3;n.pattern=new Array(9).fill(skip());
  n.halfStitches=[[4,{fwd:cell('310'),bck:cell('666')}]];n.partialStitches=[[5,{TL:cell('550'),BR:cell('321')}]];
  n.knots[0].x+=2;n.knots[0].y+=2;n.beads[0].x+=2;n.beads[0].y+=2;n.beads[0].uid='new-bead';
  n.bsLines.forEach(o=>{o.x1++;o.x2++;o.y1++;o.y2++;});
  n.specialtyStitches.forEach(o=>{o.uid+='-new';if(o.type==='petite'){o.x++;o.y++;}else {o.x1++;o.x2++;o.y1++;o.y2++;}});
  const p=C.preview(b,n,{dx:1,dy:1});expect(p.ready).toBe(true);
  expect(p.result.halfDone).toEqual([[4,{fwd:true}]]);expect(p.result.partialDone).toEqual([[5,['BR']]]);
  expect(p.result.knotsDone).toEqual(['3,3']);expect(p.result.bsDone).toEqual(['1,1,3,2,310']);
  expect(p.result.beadsDone).toEqual(['bead-a']);expect(p.result.specialtyDone).toEqual(['petite-a']);
  expect(Object.keys(A.snapshot(p.result))).toEqual(Object.keys(A.snapshot(b)));
});
test('coincident specialty stitches require one-to-one resolution; no progress copying',()=>{
  const b=special(),n=structuredClone(b);n.specialtyStitches.push({...n.specialtyStitches[0],uid:'duplicate'});
  const p=C.preview(b,n);expect(p.ready).toBe(false);
  const resolved=C.preview(b,n,{}, {'s:0':'new:s:0'});expect(resolved.ready).toBe(true);
  expect(resolved.result.specialtyDone).toEqual(['petite-a']);
});
test('annotations and chart-dependent undo caches require archival acknowledgement',()=>{
  const b=full(2,1,'310',{parkMarkers:[{x:1,y:0,colorId:'310',note:'keep'}],doneSnapshots:[{done:[1,0]}]});
  const n=full(1,1);const p=C.preview(b,n);expect(p.ready).toBe(false);
  const resolved=resolveAll(b,n,{});expect(resolved.ready).toBe(true);expect(resolved.annotations).toHaveLength(2);
  expect(b.doneSnapshots).toBeDefined();expect(resolved.result.doneSnapshots).toBeUndefined();
});
test('identical re-imports keep progress and accounting identities without mutating source',()=>{
  const b=full(2,2,'310',{done:[1,0,0,1],chartAccountingUnits:{'d:0':'old-mark'}}),before=structuredClone(b);
  const p=C.preview(b,b);expect(p.ready).toBe(true);expect(p.counts.added).toBe(0);expect(p.result.done).toEqual(b.done);
  expect(Object.keys(A.snapshot(p.result))).toEqual(Object.keys(A.snapshot(b)));expect(b).toEqual(before);
});
test('new material adopts incoming brand and adds no migrated consumption',()=>{
  const b=full(1,1,'310',{done:[1]}),n=full(1,1,'403');n.settings.threadBrand='anchor';
  const p=C.preview(b,n,{mode:'append',dx:1});
  expect(p.result.pattern[1].brand).toBe('anchor');expect(A.snapshot(p.result)).toEqual(A.snapshot(b));
});

describe('separate bug-hunting regressions',()=>{
  test('negative origin shifts archive clipped content and keep the right column',()=>{
    const b=chart(3,2,['310','666','550','310','666','550'],{done:[1,0,1,0,1,0]}),n=chart(2,2,['666','550','666','550']);
    const p=resolveAll(b,n,{dx:-1});expect(p.ready).toBe(true);expect(p.result.done).toEqual([0,1,1,0]);
  });
  test('mapping boundary is exclusive and objects spanning different shifts cannot transfer',()=>{
    const b=special(),n=special();
    const p=C.preview(b,n,{regions:[{x:0,y:0,w:1,h:2,dx:1,dy:0}]});
    expect(p.conflicts.some(c=>c.id==='s:1'&&c.reason==='Object crosses mapping regions')).toBe(true);
    expect(p.result.specialtyDone).not.toContain('long-a');
  });
  test('overlapping alignment regions fail before guessing a shift',()=>{
    expect(()=>C.preview(full(2,2),full(2,2),{regions:[{x:0,y:0,w:2,h:1,dx:1,dy:0},{x:1,y:0,w:1,h:2,dx:0,dy:1}]})).toThrow(/regions overlap/);
  });
  test('two old cells mapped onto the same new cell cannot duplicate completion',()=>{
    const b=full(2,1,'310',{done:[1,1]}),n=full(1,1),o={regions:[{x:1,y:0,w:1,h:1,dx:-1,dy:0}]};
    const p=C.preview(b,n,o,{'d:0':'new:d:0','d:1':'new:d:0'});expect(p.ready).toBe(false);expect(p.result.done).toEqual([1]);
    const r=C.preview(b,n,o,{'d:0':'new:d:0','d:1':'archive'});expect(r.ready).toBe(true);
  });
  test('repeated page additions allocate new object identities without reusing previous uids',()=>{
    const b=chart(1,1,[skip()]),n=chart(1,1,[skip()],{specialtyStitches:[{uid:'source',type:'petite',x:0,y:0,thread:cell('310')}]});
    const first=C.preview(b,n,{mode:'append',dx:1}).result;
    const second=C.preview(first,n,{mode:'append',dx:2});expect(second.ready).toBe(true);
    expect(new Set(second.result.specialtyStitches.map(o=>o.uid)).size).toBe(2);
  });
  test('unassigned symbol identifiers are never confident matches',()=>{
    const b=full(1,1,'S1',{done:[1]});expect(C.preview(b,b).ready).toBe(false);
  });
  test('malformed specialised geometry is rejected rather than dropped on reload',()=>{
    const b=special();b.specialtyStitches[0].x=2;
    expect(()=>C.preview(b,special())).toThrow(/outside the chart/);
  });
  test('random rectangular origin shifts preserve exactly the same marked coordinates',()=>{
    const fc=require('fast-check');
    fc.assert(fc.property(fc.integer({min:1,max:15}),fc.integer({min:1,max:10}),fc.integer({min:0,max:5}),fc.integer({min:0,max:5}),(w,h,dx,dy)=>{
      const done=Array.from({length:w*h},(_,i)=>i%3===0?1:0),b=full(w,h,'310',{done}),n=full(w+dx,h+dy),p=C.preview(b,n,{dx,dy});
      expect(p.ready).toBe(true);
      const expected=new Array((w+dx)*(h+dy)).fill(0);
      done.forEach((d,i)=>expected[(Math.floor(i/w)+dy)*(w+dx)+i%w+dx]=d);
      expect(p.result.done).toEqual(expected);
    }),{numRuns:80});
  });
});

test('bug hunt: a long stitch crossing an inserted region cannot match on its endpoints alone',()=>{
  const b=full(4,4,'310',{specialtyStitches:[{uid:'crossing',type:'long_stitch',x1:0,y1:0,x2:4,y2:4,thread:cell('310')}],specialtyDone:['crossing']});
  const p=C.preview(b,b,{regions:[{x:1,y:1,w:2,h:2,dx:0,dy:1}]});
  expect(p.conflicts.some(c=>c.id==='s:0'&&c.reason==='Object crosses mapping regions')).toBe(true);
  expect(p.result.specialtyDone).toEqual([]);
});

test('bug hunt: substituted parking threads are explicitly archived before Tracker would hide them',()=>{
  const b=full(1,1,'310',{parkMarkers:[{x:0,y:0,colorId:'310',note:'parked original thread'}]}),n=full(1,1,'666');
  const p=C.preview(b,n,{}, {'d:0':'new:d:0'});expect(p.ready).toBe(false);expect(p.annotations[0].value.note).toBe('parked original thread');
  const r=C.preview(b,n,{}, {'d:0':'new:d:0',annotations:'archive'});expect(r.ready).toBe(true);expect(r.result.parkMarkers).toEqual([]);
});
test('bug hunt: adding a disjoint page keeps existing coincident and unassigned objects by their existing identity',()=>{
  const b=full(1,1,'S1',{done:[1],specialtyStitches:[{uid:'a',type:'petite',x:0,y:0,thread:cell('310')},{uid:'b',type:'petite',x:0,y:0,thread:cell('310')}],specialtyDone:['b']});
  const p=C.preview(b,full(1,1),{mode:'append',dx:1});expect(p.ready).toBe(true);expect(p.result.specialtyDone).toEqual(['b']);expect(p.result.done).toEqual([1,0]);
});

test('bug hunt: unsupported specialty objects stop, rather than vanishing on Tracker load',()=>{
  const b=special();b.specialtyStitches[0].type='unsupported';expect(()=>C.preview(b,special())).toThrow(/Unsupported or invalid specialty/);
});
test('bug hunt: legacy petite cells migrate to explicit objects before matching',()=>{
  const b=chart(1,1,[{...cell('310'),type:'petite'}],{done:[1]});
  const p=C.preview(b,b);expect(p.ready).toBe(true);expect(p.result.pattern[0].id).toBe('__skip__');
  expect(p.result.specialtyStitches).toHaveLength(1);expect(p.result.specialtyDone).toEqual(['legacy-petite-cell-0']);
});
