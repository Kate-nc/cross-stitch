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
test('every eligible DMC pair uses exactly its displayed colour for matching', () => {
  const c=context();
  expect(vm.runInContext(`(() => {
    findBest.precomputeBlends(DMC);
    return findBest._blends.every(b => dE2000(b.lab,rgbToLab(...b.rgb)) < 1e-9);
  })()`,c)).toBe(true);
});
test('new and legacy blend Lab values stay consistent through saving and reloading', () => {
  const c=context();
  expect(vm.runInContext(`(() => {
    const b=makeThreadBlend(DMC.find(t=>t.id==='633'),DMC.find(t=>t.id==='817'));
    const restored=restoreStitch(JSON.parse(JSON.stringify(serializePattern([b])))[0]);
    const legacy=restoreStitch({id:b.id,type:'blend'});
    return dE2000(b.lab,restored.lab)<1e-9 && dE2000(b.lab,legacy.lab)<1e-9;
  })()`,c)).toBe(true);
});
test('generated blend budget ranks useful coverage and replaces recipes beyond the limit', () => {
  const c=context();
  const r=vm.runInContext(`(() => {
    const p=['3799','317','414'].map(id=>DMC.find(t=>t.id===id));
    const a=makeThreadBlend(p[0],p[1]), b=makeThreadBlend(p[0],p[2]);
    const raw=new Uint8ClampedArray(40*4);
    const mapped=Array.from({length:40},(_,i)=>i<30?a:b);
    mapped.forEach((m,i)=>raw.set([...m.rgb,255],i*4));
    limitGeneratedBlends(mapped,raw,40,1,p,1);
    const used=[...new Set(mapped.filter(m=>m.type==='blend').map(m=>m.id))];
    limitGeneratedBlends(mapped,raw,40,1,p,0);
    return {used:used,remaining:mapped.filter(m=>m.type==='blend').length};
  })()`,c);
  expect(Array.from(r.used)).toEqual(['317+3799']);
  expect(r.remaining).toBe(0);
});
test('blend recipe budget reserves solid symbols within the 112-symbol ceiling', () => {
  const c=context();
  expect(vm.runInContext(`(() => {
    const a=DMC.find(t=>t.id==='317'),b=DMC.find(t=>t.id==='3799');
    const m=makeThreadBlend(a,b), p=Array(112).fill(a);
    const mapped=Array(20).fill(m),raw=new Uint8ClampedArray(80);
    mapped.forEach((cell,i)=>raw.set([...cell.rgb,255],4*i));
    limitGeneratedBlends(mapped,raw,20,1,p,100);
    return mapped.every(cell=>cell.type==='solid');
  })()`,c)).toBe(true);
});
test.each([false,true])('worker and fallback agree with shading=%s and blend budget zero', dith => {
  const c=context();
  const settings={maxC:2,dith,allowBlends:true,maxBlends:0,allowedPalette:vm.runInContext("['3799','317'].map(id=>DMC.find(t=>t.id===id))",c),stitchCleanup:{enabled:false},orphans:0};
  const raw=new Uint8ClampedArray(400*4);for(let i=0;i<400;i++)raw.set([87,87,87,255],4*i);
  const expected=c.runCleanupPipeline(raw,20,20,settings).mapped.map(m=>m.id);
  const messages=[];
  c.self=c;c.postMessage=m=>messages.push(m);c.importScripts=()=>{};
  vm.runInContext(fs.readFileSync('generate-worker.js','utf8'),c);
  c.onmessage({data:{type:'generate',reqId:1,pixels:raw.buffer,width:20,height:20,settings}});
  const error=messages.find(m=>m.type==='error');expect(error).toBeUndefined();
  const result=messages.find(m=>m.type==='result');expect(Array.from(result.mapped,m=>m.id)).toEqual(Array.from(expected));
  expect(result.mapped.some(m=>m.type==='blend')).toBe(false);
});
