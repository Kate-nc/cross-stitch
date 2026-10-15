const {rtThreadUsage}=require('../threadCalc');
const noWaste={strandCountOverride:2,tailAllowanceIn:0,generalWasteMultiplier:1};
function usage(cell,n=100,fc=14,prefs=noWaste){return rtThreadUsage(Array(n).fill(cell),Array(n).fill(1),fc,prefs);}
const blend={type:'blend',id:'310+550',threads:[{id:'310'},{id:'550'}]};
afterEach(()=>{delete global.stitchOverFor;});
test('QA-08: 100 crosses, 14 count, 1+1 blend consumes 0.01814 skeins each',()=>{
 const v=usage(blend);expect(v['dmc:310']).toBeCloseTo(.01814058957,10);expect(v['dmc:550']).toBeCloseTo(v['dmc:310'],12);
 expect(v['dmc:310']+v['dmc:550']).toBeCloseTo(usage({id:'310',type:'solid'})['dmc:310'],12);
});
test('fabric count, over-two and strand overrides scale single-strand inches',()=>{
 const base=usage(blend)['dmc:310'];
 expect(usage(blend,100,28)['dmc:310']).toBeCloseTo(base/2,12);
 global.stitchOverFor=fc=>fc===28?2:1;
 expect(usage(blend,100,28)['dmc:310']).toBeCloseTo(base,12);
 expect(usage(blend,100,14,{...noWaste,strandCountOverride:4})['dmc:310']).toBeCloseTo(base*2,12);
});
test('unequal strand ratios and constituent brands are retained',()=>{
 const v=usage({...blend,blendRatio:[2,1],threads:[{id:'310',brand:'anchor'},{id:'310',brand:'dmc'}]},100,14,{...noWaste,strandCountOverride:3});
 expect(v['anchor:310']).toBeCloseTo(2*v['dmc:310'],12);
 expect(v['dmc:310']).toBeCloseTo(.01814058957,10);
});
test('tails and waste are allocated once, zero tails/waste and blank marks stay finite',()=>{
 const v=usage(blend,100,14,{...noWaste,tailAllowanceIn:1.5,threadRunLength:30,generalWasteMultiplier:1.1});
 expect(v['dmc:310']).toBeCloseTo(100*(4.8*2/14+.1)*1.1/1890/2,12);
 expect(usage(blend,0)).toEqual({});
 expect(rtThreadUsage([blend],[0],14,noWaste)).toEqual({'dmc:310':0,'dmc:550':0});
 expect(usage(blend,100,14,{...noWaste,generalWasteMultiplier:0})['dmc:310']).toBe(0);
});
test('solid and blend same-id constituents aggregate without brand collisions',()=>{
 const out=rtThreadUsage([{id:'310',brand:'anchor'},blend,{id:'310',brand:'dmc'}],[1,1,1],14,noWaste);
 expect(out['dmc:310']).toBeCloseTo(3*out['dmc:550'],12);
 expect(out['anchor:310']).toBeCloseTo(2*out['dmc:550'],12);
});
