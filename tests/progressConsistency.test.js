const PU = require('../progress-units');
const fc = require('fast-check');
test('near completion reserves 100 for all counted work', () => {
  expect(PU.progressUnits({full:{done:2499,total:2500}})).toMatchObject({percent:99.9,complete:false,remainingUnits:1});
  expect(PU.percent(99999,100000)).toBe(99.9);
});
test('small fractional fixtures remain meaningful across save/reload', () => {
  for (const quarters of [1,2,3]) {
    const p = {pattern:[{id:'__empty__'}],partialStitches:[[0,Object.fromEntries(['TL','TR','BL'].slice(0,quarters).map(q=>[q,{id:'310'}]))]],partialDone:[]};
    const r=PU.fromProject(JSON.parse(JSON.stringify(p)));
    expect(r.totalUnits).toBe(quarters*.25); expect(r.complete).toBe(false);
    expect(PU.formatUnits(r.totalUnits)).toBe(String(quarters*.25));
  }
  expect(PU.progressUnits({full:{done:1,total:1},half:{done:0,total:1}}).percent).toBe(66.7);
  expect(PU.fromProject({halfStitches:[[0,{fwd:{id:'310'}}]],halfDone:[[0,{fwd:true}]]})).toMatchObject({percent:100,complete:true,totalUnits:.5});
});
test('exact conservation, colour aggregation and reset for arbitrary counts', () => {
  fc.assert(fc.property(fc.array(fc.tuple(fc.nat(500),fc.nat(500)),{minLength:4,maxLength:4}), rows=>{
    const counts=Object.fromEntries(['full','half','quarter','knot'].map((k,i)=>[k,{total:rows[i][0],done:Math.min(...rows[i])}]));
    const r=PU.progressUnits(counts);
    expect(r.doneUnits+r.remainingUnits).toBe(r.totalUnits);
    expect(Number.isFinite(r.percent)).toBe(true);
    if(!r.complete)expect(r.percent).toBeLessThan(100);
    const reset=PU.progressUnits(Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,{...v,done:0}])));
    expect(reset.doneUnits).toBe(0); expect(reset.percent).toBe(0);
  }));
});
test('excess marks cannot compensate for pending work of another type',()=>{
  expect(PU.progressUnits({full:{done:2,total:1},half:{done:0,total:1}})).toMatchObject({doneUnits:1,remainingUnits:.5,complete:false});
});
test('saved per-colour sums match project units, including fractional-only, blend and knot colours',()=>{
  const p={pattern:[{id:'310'},{id:'__empty__'}],done:[1,0],halfStitches:[[1,{fwd:{id:'310'}}]],halfDone:[],partialStitches:[[1,{TL:{id:'550+310'}}]],partialDone:[[1,['TL']]],knots:[{id:'550',x:0,y:1}],knotsDone:[]};
  const colours=PU.coloursFromProject(JSON.parse(JSON.stringify(p)));
  const sum=Object.values(colours).map(PU.colourProgress).reduce((a,b)=>({doneUnits:a.doneUnits+b.doneUnits,totalUnits:a.totalUnits+b.totalUnits}),{doneUnits:0,totalUnits:0});
  const all=PU.fromProject(p);expect(sum).toEqual({doneUnits:all.doneUnits,totalUnits:all.totalUnits});
  expect(PU.colourProgress(colours['310']).percent).toBe(66.7);
  expect(Object.keys(colours)).toHaveLength(3);
  expect(PU.fromProject({...p,halfDone:[[9,{fwd:true}]]}).doneUnits).toBe(all.doneUnits);
});
test('visible complete scope cannot change incomplete project result; backstitch stays separate',()=>{
  const c={full:{done:1,total:1},half:{done:0,total:1},backstitch:{done:0,total:5}};
  expect(PU.progressUnits(c,{include:['full']}).complete).toBe(true);
  expect(PU.progressUnits(c).complete).toBe(false);
  expect(PU.progressUnits({...c,half:{done:1,total:1}})).toMatchObject({complete:true,percent:100,separate:{backstitch:{done:0,total:5}}});
});
test('marks on background cells do not finish real pending stitches',()=>{
  const p={pattern:[{id:'__empty__'},{id:'310'}],done:[1,0]};
  expect(PU.fromProject(p)).toMatchObject({doneUnits:0,totalUnits:1,complete:false});
  expect(PU.colourProgress(PU.coloursFromProject(p)['310']).doneUnits).toBe(0);
});
