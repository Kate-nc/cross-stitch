const fs = require('fs');
const vm = require('vm');
const E = require('../threadCalc');
const R = require('../material-reservations');
const A = require('../thread-accounting');

test('published 14-count benchmark: 0.5 inches per strand, 20% allowance, 48m capacity', () => {
  const r = E.stitchesToSkeins({stitchCount:5000});
  expect(r.skeinsRaw).toBeCloseTo(3.175, 12);
  expect(r.skeinsToBuy).toBe(4);
  expect(E.skeinsToStitches({skeinCount:1}).stitchesApprox).toBe(1574);
});

test('mostly-full stash covers the audit example without requesting another skein', () => {
  const [r] = E.threadDemandRows([{id:'310',count:800}], {stash:{'dmc:310':{owned:0,partialStatus:'mostly-full'}}});
  expect(r.estimatedNeeded).toBeCloseTo(.508, 12);
  expect(r.owned).toBe(.75);
  expect(r.missing).toBe(0);
  expect(r.status).toBe('owned');
});

test('aggregate raw shared components and subtract stock before rounding a shortage', () => {
  const rows=E.threadDemandRows([{id:'310',count:1000},{id:'310+550',type:'blend',count:1000}], {stash:{'dmc:310':{owned:.5}}});
  expect(rows.map(r=>r.key)).toEqual(['dmc:310','dmc:550']);
  expect(rows[0].estimatedNeeded).toBeCloseTo(.9525,12);
  expect(rows[0].missing).toBe(1); // ceil(.9525 - .5), not ceil(.9525) - .5
  expect(rows[1].estimatedNeeded).toBeCloseTo(.3175,12);
});

test('unequal mixed-brand blends and keys use identical constituent demands', () => {
  const e={id:'310+1000',type:'blend',count:3000,blendRatio:[2,1],threads:[{id:'310',brand:'dmc'},{id:'1000',brand:'Madeira'}]};
  const rows=E.threadDemandRows([e]),key=E.threadKeyUsage(e);
  expect(rows.map(r=>r.estimatedNeeded)).toEqual(key.skeins);
  expect(rows.map(r=>r.needed)).toEqual(key.toBuy);
  expect(rows.map(r=>r.needed)).toEqual([2,1]);
});

test('Madeira key and shopping agree for a lower-case brand', () => {
  const e={id:'1000',brand:'madeira',count:5000};
  const [row]=E.threadDemandRows([e]);
  expect(row.estimatedNeeded).toBeCloseTo(2.54,12);
  expect(row.needed).toBe(E.threadKeyUsage(e).toBuy[0]);
});

test('boundary decisions use raw values while the display explains just-over amounts', () => {
  const r=E.stitchesToSkeins({stitchCount:1575});
  const key=E.threadKeyUsage({id:'310',count:1575});
  expect(r.skeinsExact).toBe(1);
  expect(r.skeinsRaw).toBeCloseTo(1.000125,12);
  expect(key.toBuy[0]).toBe(r.skeinsToBuy);
  expect(E.threadUsageText(key)).toContain('just over 1 skein');
  expect(E.wholeSkeins(1+Number.EPSILON)).toBe(1);
  expect(E.wholeSkeins(1.000001)).toBe(2);
});

test('tiny positive requirements survive aggregation and zero allowance is honoured', () => {
  const [r]=E.threadDemandRows([{id:'310',count:.25}],{wasteFactor:0});
  expect(r.estimatedNeeded).toBeGreaterThan(0);
  expect(r.needed).toBe(1);
  expect(E.threadDemandRows([{id:'310',count:.25}],{})[0].estimatedNeeded/r.estimatedNeeded).toBeCloseTo(1.2,12);
  expect(E.threadDemandRows([{id:'310',count:0}],{})).toEqual([]);
});

test('fractionals, petite, knots and line-only colours are included; remaining planning excludes marks', () => {
  const p={settings:{fabricCt:14},pattern:[{id:'310'}],done:[1],halfStitches:[[1,{fwd:{id:'310'}}]],
    partialStitches:[[2,{TL:{id:'310'},TR:{id:'310'},BL:{id:'310'}}]],
    knots:[{x:2,y:3,id:'310'}],specialtyStitches:[{uid:'petite',type:'petite',thread:{id:'310'}}],
    bsLines:[{x1:0,y1:0,x2:3,y2:4,colorId:'321'}]};
  const rows=E.threadDemandRows(E.projectThreadEntries(p));
  expect(rows[0].estimatedNeeded).toBeCloseTo(3.75*.000635,12);
  expect(rows[1].estimatedNeeded).toBeCloseTo(10/14/(48/.0254)*1.2,12);
  expect(R.estimate(p)['dmc:310']).toBeCloseTo(2.75*.000635,12);
});

test('planning model never changes recorded consumption geometry or balances', () => {
  const p={fabricCt:14,pattern:[{id:'310'}],done:[1]};
  const snapshot=A.snapshot(p,{tailAllowanceIn:0,generalWasteMultiplier:1});
  const before=JSON.stringify(snapshot);
  E.threadDemandRows(E.projectThreadEntries(p));
  expect(JSON.stringify(snapshot)).toBe(before);
  expect(snapshot['d:0'].amounts['dmc:310']).toBeCloseTo(4.8*2/14/1890,14);
});

test('real Creator row adapter uses project fabric and includes line-only colours', () => {
  const ctx={};ctx.window=ctx;vm.createContext(ctx);
  for(const f of ['constants.js','threadCalc.js'])vm.runInContext(fs.readFileSync(f,'utf8'),ctx);
  const src=fs.readFileSync('creator/useCreatorState.js','utf8');
  const start=src.indexOf('window.buildThreadShoppingRows = function');
  vm.runInContext(src.slice(start,src.indexOf('\n};',start)+3),ctx);
  const rows=ctx.buildThreadShoppingRows([], {fabricCt:18,project:{pat:Array(5000).fill({id:'310'}),bsLines:[{colorId:'321',x1:0,y1:0,x2:10,y2:0}]}});
  expect(rows.map(r=>r.key)).toEqual(['dmc:310','dmc:321']);
  expect(rows[0].needed).toBe(3);
});
