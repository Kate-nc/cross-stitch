const fs = require('fs');
const vm = require('vm');
function context() {
  const ctx = { console, addEventListener() {}, removeEventListener() {}, document: { createElement: () => ({ getContext: () => null }) } };
  ctx.window = ctx;
  vm.createContext(ctx);
  ['constants.js', 'dmc-data.js', 'anchor-data.js', 'helpers.js', 'colour-utils.js', 'creator/generate.js']
    .forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));
  return ctx;
}
test('fresh no-shading mapping uses physical blends and ignores previous palette calls', () => {
  const c = context();
  const result = vm.runInContext(`(() => {
    const p = ['3799','317'].map(id => DMC.find(t => t.id === id));
    const raw = new Uint8ClampedArray([87,87,87,255]);
    const first = doMap(raw,1,1,p,true)[0];
    doMap(raw,1,1,DMC.slice(0,8),true);
    const second = doMap(raw,1,1,p,true)[0];
    return [first.id, second.id, doMap(raw,1,1,p,false)[0].type];
  })()`, c);
  expect(Array.from(result)).toEqual(['317+3799','317+3799','solid']);
});
test('conversion retains blend components and uses them with shading off', () => {
  const c = context();
  const r = vm.runInContext(`(() => {
    const p = ['3799','317'].map(id => DMC.find(t => t.id === id));
    const raw = new Uint8ClampedArray(20*20*4);
    for(let i=0;i<400;i++) raw.set([87,87,87,255],i*4);
    return runCleanupPipeline(raw,20,20,{maxC:2,dith:false,allowBlends:true,allowedPalette:p,stitchCleanup:{enabled:false},orphans:0});
  })()`, c);
  expect(r.mapped.every(m => m.id === '317+3799')).toBe(true);
});
test('manual and automatic recipes share an identity, including reverse selections', () => {
  const c = context();
  expect(vm.runInContext(`(() => {
    const a=DMC.find(t=>t.id==='317'), b=DMC.find(t=>t.id==='3799');
    const manual=makeThreadBlend(b,a);
    findBest.precomputeBlends([a,b]);
    return manual.id === findBest._blends[0].id && manual.threads[0].id === '317' &&
      blendRecipeKey(manual) === blendRecipeKey({type:'blend',id:'3799+317'});
  })()`,c)).toBe(true);
});
test('recipe identity keeps brands and quantities attached to their component', () => {
  const c = context();
  expect(vm.runInContext(`(() => {
    const a={type:'blend',id:'310+550',threads:[{id:'310',brand:'anchor'},{id:'550',brand:'dmc'}],blendRatio:[2,1]};
    const b={type:'blend',id:'550+310',threads:[{id:'550',brand:'dmc'},{id:'310',brand:'anchor'}],blendRatio:[1,2]};
    const other=Object.assign({},b,{blendRatio:[2,1]});
    return blendRecipeKey(a)===blendRecipeKey(b) && blendRecipeKey(a)!==blendRecipeKey(other);
  })()`,c)).toBe(true);
});
test('JSON save/reload and palette rebuilding preserve unequal mixed-brand recipes', () => {
  const c=context();
  const result=vm.runInContext(`(() => {
    const original={type:'blend',id:'310+550',rgb:[42,15,30],blendRatio:[2,1],
      threads:[{id:'310',brand:'anchor',rgb:[8,9,10],strands:2},{id:'550',brand:'dmc',rgb:[92,24,78],strands:1}]};
    const saved=JSON.parse(JSON.stringify(serializePattern([original])));
    const loaded=restoreStitch(saved[0]);
    const palette=buildPalette([loaded]).pal[0];
    return {saved:saved[0],loaded:loaded,palette:palette};
  })()`,c);
  for(const entry of [result.saved,result.loaded,result.palette]) {
    expect(Array.from(entry.blendRatio)).toEqual([2,1]);
    expect(entry.threads[0]).toMatchObject({id:'310',brand:'anchor',strands:2,rgb:[8,9,10]});
    expect(entry.threads[1].strands).toBe(1);
    expect(Array.from(entry.rgb)).toEqual([42,15,30]);
  }
});
test('legacy equal blend records and explicit custom component snapshots still restore', () => {
  const c=context();
  expect(vm.runInContext(`restoreStitch({type:'blend',id:'317+3799'}).threads.length`,c)).toBe(2);
  expect(vm.runInContext(`restoreStitch({type:'blend',id:'custom+310',threads:[{id:'custom',rgb:[12,34,56]},{id:'310'}]}).threads[0].rgb.join(',')`,c)).toBe('12,34,56');
});
