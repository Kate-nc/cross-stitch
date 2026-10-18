const fc=require('fast-check');
const {fixture}=require('../fixtures/pat/make-fixture');
const {parsePAT}=require('../../import-engine/strategies/patStrategy');
test('seeded mutations either reject with typed errors or retain bounded, in-range geometry',()=>{
  const original=fixture({runs:[[6,255,255]],lines:[[1,1,1,3,2,9,2]]}).bytes;
  fc.assert(fc.property(fc.array(fc.tuple(fc.nat(original.length-1),fc.nat(255)),{minLength:1,maxLength:20}),edits=>{
    const bytes=Buffer.from(original);edits.forEach(([i,v])=>{bytes[i]=v;});
    let p;
    try { p=parsePAT(bytes); } catch(e) { expect(['ImportParseError','ImportUnsupportedError']).toContain(e.name); return; }
    expect(p.pattern).toHaveLength(p.w*p.h);expect(p.pattern.length).toBeLessThanOrEqual(1000000);
    for(const [i,q] of p.partialStitches){expect(i).toBeGreaterThanOrEqual(0);expect(i).toBeLessThan(p.pattern.length);expect(Object.keys(q).every(k=>['TL','TR','BL','BR'].includes(k))).toBe(true);}
    for(const l of p.bsLines)for(const k of ['x1','x2','y1','y2']){expect(l[k]).toBeGreaterThanOrEqual(0);expect(l[k]).toBeLessThanOrEqual(k[0]==='x'?p.w:p.h);}
  }),{numRuns:5000,seed:20261018});
});
test('all nine snap positions have independently stated expected endpoints',()=>{
  const expected=[[0,0],[.5,0],[1,0],[0,.5],[.5,.5],[1,.5],[0,1],[.5,1],[1,1]];
  expected.forEach((xy,i)=>{const p=parsePAT(fixture({runs:[[6,255,255]],lines:[[1,1,i+1,3,2,9,1]]}).bytes);expect([p.bsLines[0].x1,p.bsLines[0].y1]).toEqual(xy);});
});
test('oversized cells and occupied-object budgets reject instead of expanding hostile runs',()=>{
  expect(()=>parsePAT(fixture({w:1001,h:1000,runs:[[1,255,255]]}).bytes)).toThrow(/dimensions/);
  expect(()=>parsePAT(fixture({w:1000,h:1000,runs:[[65535,1,1],[65535,1,1],[65535,1,1],[65535,1,1]]}).bytes)).toThrow(/Too many/);
});
