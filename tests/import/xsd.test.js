const fs = require('fs');
const vm = require('vm');
const {TextDecoder} = require('util');
const {parseXSD, XSD_LIMITS} = require('../../import-engine/formats/xsd');
const {validateExtraction} = require('../../import-engine/pipeline/validate');
const {sniffMagic} = require('../../import-engine/classifier/sniffMagic');
const {chart} = require('../fixtures/xsd/generate');
const dmc=[{id:'310',name:'Black',rgb:[0,0,0]}, {id:'321',name:'Red',rgb:[200,0,0]}];
const read=(b,opts={})=>parseXSD(b,{dmc,...opts});
const mutate=(f,opts)=>{const c=chart(opts);f(c.bytes,c);return c.bytes;};

test('physical palette references, dimensions and row-major coordinates survive a display reorder',()=>{
  const p=read(chart({reversePalette:true,words:[0x00010000,0x0f000000,0,0x0f000000,0x00010000,0]}).bytes)._legacyProject;
  expect([p.w,p.h,p.settings.fabricCt]).toEqual([3,2,14]);
  expect(p.pattern.map(x=>x.id)).toEqual(['321','__skip__','310','__skip__','321','310']);
});
test('all fractional directions and petite quadrants preserve thread identity and geometry',()=>{
  const r=read(chart({words:[0x80000000,0x80010000,0x80020000,0x0f000000,0x0f000000,0x0f000000],
    small:[[1,0,0,0,0,0,0,0,0,0],[2,0,0,1,0,0,0,0,0,0],[60,15,0,0,0,1,1,0,0,0]]}).bytes);
  const p=r._legacyProject;
  expect(p.partialStitches).toEqual([[0,{TL:expect.objectContaining({id:'310'}),BR:expect.objectContaining({id:'310'})}],
    [1,{BL:expect.objectContaining({id:'321'}),TR:expect.objectContaining({id:'321'})}],
    [2,{TL:expect.objectContaining({id:'310'}),BL:expect.objectContaining({id:'321'}),TR:expect.objectContaining({id:'321'}),BR:expect.objectContaining({id:'310'})}]]);
  expect(p.specialtyStitches.map(s=>[s.type,s.x,s.y,s.thread.id])).toEqual([
    ['petite',2,0,'310'],['petite',2,0.5,'321'],['petite',2.5,0,'321'],['petite',2.5,0.5,'310']]);
});
test('supported lines, knots, bead positions and approximation counts reach verification',()=>{
  const r=read(chart({joints:[{kind:2,x:0,y:0,x2:3,y2:2,pi:1},{kind:5,x:0.5,y:0,x2:2.5,y2:2},
    {kind:1,x:1.5,y:0.5},{kind:6,x:0.5,y:0,pi:1,rotation:90},{kind:3,points:[[0,0],[30,30]]}]}).bytes);
  const p=r._legacyProject;
  expect(p.bsLines).toEqual([expect.objectContaining({x1:0,y1:0,x2:3,y2:2,colorId:'321'})]);
  expect(p.specialtyStitches[0]).toMatchObject({type:'long_stitch',x1:0.5,y1:0,x2:2.5,y2:2});
  expect(p.knots[0]).toMatchObject({x:3,y:1,id:'310'});
  expect(p.beads[0]).toMatchObject({x:1,y:0,label:'XSD brand 0 321'});
  expect(r._xsdAudit.losses).toEqual(expect.arrayContaining([expect.objectContaining({count:1,reason:expect.stringContaining('curve:')}),expect.objectContaining({count:1,reason:expect.stringContaining('bead:')})]));
  const v=validateExtraction(r).verification;
  expect(v.status).toBe('limited');expect(v.checks.dimensions.status).toBe('verified');
  expect(v.checks.unsupportedContent.status).toBe('limited');
});
test('equal same-brand two-thread blends retain components; other ratios never become solids',()=>{
  const palette=[{brand:0,id:'blend',rgb:[100,0,0],blends:[{brand:0,id:'310',strands:1},{brand:0,id:'321',strands:1}]},{brand:0,id:'310'}];
  const r=read(chart({palette}).bytes);expect(r._legacyProject.pattern[0]).toMatchObject({id:'310+321',type:'blend',threads:[{id:'310',name:'Black',rgb:[0,0,0]},{id:'321',name:'Red',rgb:[200,0,0]}]});
  palette[0].blends[1].strands=2;
  const unequal=read(chart({palette}).bytes);expect(unequal._legacyProject.pattern[0].id).toBe('__skip__');
  expect(unequal.flags.warnings.join(' ')).toMatch(/1 full cross: palette 0 .*unequal blend strand proportions 1:2/);
  expect(validateExtraction(unequal).verification.checks.legendMatches.status).toBe('limited');
});
test('Anchor identities are preserved, unknown brands are counted rather than colour-matched',()=>{
  const palette=[{brand:1,id:'403',rgb:[1,2,3]},{brand:77,id:'310'}];
  const r=read(chart({palette}).bytes,{anchor:[{id:'403',rgb:[0,0,0]}]});
  expect(r._legacyProject.pattern[0]).toMatchObject({id:'403',brand:'anchor',rgb:[1,2,3]});
  expect(r._legacyProject.pattern[1].id).toBe('__skip__');
  expect(r._xsdAudit.importedObjects).toBe(1);
});
test.each([
  ['version',b=>b.writeUInt16LE(5,8),/unsupported.*5\.8\.4\.12/],
  ['zero dimensions',b=>b.writeUInt16LE(0,741),/dimensions/],
  ['large grid',b=>{b.writeUInt16LE(65535,741);b.writeUInt16LE(65535,743);},/250,000/],
  ['small count',b=>b.writeUInt32LE(0xffffffff,745),/buffer count/],
  ['palette count',b=>b.writeUInt16LE(65535,761),/palette count/],
  ['blend count',b=>b.writeUInt16LE(65535,822),/blend component count/],
  ['positions',b=>b.writeUInt16LE(250,1009),/display position/],
  ['block count',(b,c)=>b.writeUInt32LE(0xffffffff,c.stream+16),/block word count/],
  ['zero block',(b,c)=>b.writeUInt32LE(0,c.stream+16),/block word count/],
  ['models',(b,c)=>b.writeUInt16LE(65535,c.modelOffset+2),/model count/],
  ['joints',b=>b.writeUInt16LE(65535,749),/truncated/],
])('rejects malformed %s with an offset and no project',(label,f,message)=>{
  try {read(mutate(f));throw new Error('unexpected success');}catch(e){expect(e.message).toMatch(message);expect(e.details).toMatchObject({strategy:'xsd',offset:expect.any(Number),verification:{status:'invalid'}});}
});
test.each([
  [[0x40000000,0],/run-length/], [[0x40070000,0],/exceeds declared grid/], [[0x40010000],/run-length/],
  [[0x00ff0000,0,0,0,0,0],/palette index/], [[0x80000000,0,0,0,0,0],/buffer index/], [[0x02000000,0,0,0,0,0],/cell tag/],
])('rejects malformed decoded words without out-of-bounds access',(words,message)=>{expect(()=>read(chart({words}).bytes)).toThrow(message);});
test('bounded RLE expands exactly the declared cells',()=>{const r=read(chart({words:[0x40060000,0]}).bytes);expect(r._legacyProject.pattern.map(t=>t.id)).toEqual(Array(6).fill('310'));});
test('unknown or wholly omitted objects cannot report success',()=>{
  expect(()=>read(chart({palette:[{brand:99,id:'310'},{brand:99,id:'321'}]}).bytes)).toThrow(/no supported stitch objects remain/);
  expect(()=>read(chart({joints:[{kind:99,x:0,y:0}]}).bytes)).toThrow(/unknown joint type 99/);
  expect(()=>read(chart({joints:[{kind:2,x:0,y:0,x2:4,y2:2}]}).bytes)).toThrow(/coordinates/);
  expect(()=>read(chart({joints:[{kind:2,x:0,y:0,x2:0,y2:0}]}).bytes)).toThrow(/zero-length/);
});
test('header boundaries and every stitch-stream truncation fail deterministically',()=>{
  const {bytes,stream}=chart({joints:[{kind:2,x:0,y:0,x2:3,y2:2}]});
  const cuts=new Set([0,1,2,5,6,13,740,741,762,763,bytes.length-1,...Array.from({length:bytes.length-stream},(_,i)=>stream+i)]);
  for(const n of cuts)expect(()=>read(bytes.subarray(0,n))).toThrow(/XSD:/);
});
test('pre-allocation limit and byte views respect size and offsets',()=>{
  expect(()=>read(new Uint8Array(XSD_LIMITS.bytes+1))).toThrow(/input limit/);
  const {bytes}=chart();const wrapped=Buffer.concat([Buffer.alloc(13),bytes,Buffer.alloc(7)]);
  expect(read(wrapped.subarray(13,13+bytes.length))._legacyProject.pattern[0].id).toBe('310');
});
test('the extension routes a family, never XML Schema or unrelated bytes into another parser',()=>{
  expect(sniffMagic({fileName:'schema.xsd',bytes:Buffer.from('<?xml version="1.0"?><schema/>')})).toMatchObject({format:'xsd'});
  expect(()=>read(Buffer.from('<?xml version="1.0"?><schema/>'))).toThrow(/not a recognised/);
  expect(sniffMagic({fileName:'renamed.bin',bytes:chart().bytes})).toMatchObject({format:'xsd'});
});
test('actual browser bundle imports through classifier, strategy, validation and materialisation',async()=>{
  const context={window:{}, Uint8Array, DataView, TextDecoder, DMC:dmc, console, setTimeout,clearTimeout};
  vm.createContext(context);vm.runInContext(fs.readFileSync('import-engine/bundle.js','utf8'),context);
  const engine=context.window.ImportEngine;
  const {bytes}=chart();
  const r=await engine.importPattern({name:'tiny.xsd',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
  expect(r.ok).toBe(true);expect(r.project.pattern[1].id).toBe('321');expect(r.verification.status).toBe('limited');
  expect(r.project.meta.attachments.originalFile.name).toBe('tiny.xsd');
  expect(r.project._import.xsd.version).toBe('4.8.4.12');
  const huge=await engine.importPattern({name:'huge.xsd',size:XSD_LIMITS.bytes+1,arrayBuffer:()=>{throw Error('must not read');}});
  expect(huge.ok).toBe(false);expect(huge.error.message).toMatch(/input limit/);
  const renamed=await engine.importPattern({name:'renamed.bin',size:XSD_LIMITS.bytes+1,slice:(start,end)=>{expect([start,end]).toEqual([0,2]);return {arrayBuffer:async()=>new Uint8Array([0x10,0x05]).buffer};},arrayBuffer:()=>{throw Error('must not read');}});
  expect(renamed.ok).toBe(false);expect(renamed.error.message).toMatch(/input limit/);
  const future=Buffer.from(bytes);future.writeUInt16LE(5,8);
  const failed=await engine.importPattern({name:'future.xsd',arrayBuffer:async()=>future.buffer.slice(future.byteOffset,future.byteOffset+future.byteLength)});
  expect(failed.ok).toBe(false);expect(failed.project).toBeUndefined();expect(failed.verification.status).toBe('invalid');
  expect(failed.error.message).toMatch(/unsupported Pattern Maker version 5\.8\.4\.12/);
  expect(engine.classifyFileForCreate({name:'tiny.xsd'})).toBe('pattern');
});
test('the largest permitted grid expands within the bound; an adjacent larger grid is rejected',()=>{
  let remaining=250000;const words=[];
  while(remaining){const n=Math.min(remaining,16383);words.push(0x40000000|(n<<16),0);remaining-=n;}
  const r=read(chart({width:500,height:500,words}).bytes);
  expect(r._legacyProject.pattern).toHaveLength(250000);expect(r._xsdAudit.fullCells).toBe(250000);
  expect(()=>read(chart({width:501,height:500,words}).bytes)).toThrow(/250,000/);
});
test('fractional-only and line-only charts remain usable without false full-cross completeness figures',()=>{
  for(const opts of [
    {words:[0x80000000,0x0f000000,0x0f000000,0x0f000000,0x0f000000,0x0f000000],small:[[1,0,0,0,0,0,0,0,0,0]]},
    {words:[0x40060000,0x0f000000],joints:[{kind:2,x:0,y:0,x2:3,y2:2}]},
  ]){
    const r=read(chart(opts).bytes),v=validateExtraction(r);
    expect(v.errors).toEqual([]);expect(v.verification.status).toBe('limited');
    expect(v.verification.checks.recognisedCells.coverage).toBeNull();
  }
});
test.each([
  [[{brand:0,id:'310',strands:1},{brand:0,id:'321',strands:1},{brand:0,id:'310',strands:1}],/blend has 3 components/],
  [[{brand:0,id:'310',strands:1},{brand:1,id:'403',strands:1}],/mixed-brand blend \(XSD brands 0 and 1\)/],
  [[{brand:0,id:'blanc',strands:1},{brand:0,id:'BLANC',strands:1}],/duplicate blend component Blanc/],
  [[{brand:0,id:'310',strands:1},{brand:0,id:'unknown',strands:1}],/unresolved blend components: XSD brand 0 number unknown/],
])('unsupported blend compositions give the exact reason and affected object count',(blends,message)=>{
  const r=read(chart({palette:[{brand:0,id:'Blend',blends},{brand:0,id:'310'}]}).bytes,{dmc:dmc.concat({id:'Blanc',rgb:[255,255,255]})});
  expect(r._legacyProject.pattern[0].id).toBe('__skip__');
  expect(r._xsdAudit.losses[0].count).toBe(1);expect(r._xsdAudit.losses[0].reason).toMatch(message);
});
