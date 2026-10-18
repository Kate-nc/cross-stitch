// Separate adversarial pass: deterministic mutations of valid structured inputs.
const fc=require('fast-check');
const {chart}=require('../fixtures/xsd/generate');
const {parseXSD}=require('../../import-engine/formats/xsd');
const dmc=[{id:'310',rgb:[0,0,0]},{id:'321',rgb:[200,0,0]}];

test('2,000 structured mutations return bounded, consistent projects or typed failures',()=>{
  const base=chart({joints:[{kind:2,x:0,y:0,x2:3,y2:2,pi:1},{kind:1,x:0.5,y:0.5},{kind:6,x:1,y:1}]}).bytes;
  fc.assert(fc.property(fc.array(fc.tuple(fc.integer({min:0,max:base.length-1}),fc.integer({min:0,max:255})),{minLength:1,maxLength:8}),changes=>{
    const bytes=Buffer.from(base);changes.forEach(([i,v])=>{bytes[i]=v;});
    try {
      const r=parseXSD(bytes,{dmc}),p=r._legacyProject;
      expect(p.pattern.length).toBe(p.w*p.h);expect(p.pattern.length).toBeLessThanOrEqual(250000);
      expect(r._xsdAudit.importedObjects).toBeGreaterThan(0);
      expect(r.flags.warnings.length).toBeGreaterThan(0);
      for(const l of p.bsLines) for(const [x,y] of [[l.x1,l.y1],[l.x2,l.y2]]){expect(x>=0&&x<=p.w&&y>=0&&y<=p.h).toBe(true);}
      expect(p.pattern.filter(t=>t.id!=='__skip__').every(t=>['310','321'].includes(t.id))).toBe(true);
    }catch(e){expect(['ImportParseError','ImportUnsupportedError']).toContain(e.name);expect(e.details.verification.status).toBe('invalid');}
  }),{seed:17012026,numRuns:2000});
});
test('unknown fractional flags never produce plausible but wrong quarter crosses',()=>{
  const r=parseXSD(chart({words:[0x80000000,0,0,0,0,0],small:[[136,0,0,0,0,1,0,0,0,0]]}).bytes,{dmc});
  expect(r._legacyProject.partialStitches).toEqual([]);
  expect(r._xsdAudit.unknownSmallCells).toBe(1);
  expect(r.flags.warnings.join(' ')).toMatch(/1 fractional cell: unknown flags 128\/0; all stitches in this cell omitted/);
});
test('off-chart geometry is rejected even when its thread is unsupported',()=>{
  expect(()=>parseXSD(chart({palette:[{brand:99,id:'310'},{brand:0,id:'321'}],joints:[{kind:2,x:0,y:0,x2:4,y2:2}]}).bytes,{dmc})).toThrow(/coordinates outside/);
});
test('unmatched partial, model and curve counts cannot hide truncated payloads',()=>{
  for(const modify of [
    (b,c)=>{b.writeUInt32LE(1,745);},
    (b,c)=>{b.writeUInt16LE(1,c.modelOffset+2);},
    (b,c)=>{b.writeUInt16LE(65535,b.length-2);},
  ]){
    const c=chart();const b=Buffer.from(c.bytes);modify(b,c);
    expect(()=>parseXSD(b,{dmc})).toThrow(/XSD:/);
  }
});
test('palette indices cannot wrap into valid threads in any stitch layer',()=>{
  for(const opts of [
    {words:[0x80000000,0,0,0,0,0],small:[[1,0,255,0,0,0,0,0,0,0]]},
    {words:[0x80000000,0,0,0,0,0],small:[[0,1,0,0,255,0,0,0,0,0]]},
    {joints:[{kind:1,x:0,y:0,pi:255}]},
    {joints:[{kind:2,x:0,y:0,x2:3,y2:2,pi:255}]},
    {joints:[{kind:6,x:0,y:0,pi:255}]},
  ])expect(()=>parseXSD(chart(opts).bytes,{dmc})).toThrow(/palette index/);
});

test('non-byte views fail with a typed error rather than signed palette values',()=>{
  for(const b of [new Int8Array(1000),new DataView(new ArrayBuffer(1000))]) {
    try {parseXSD(b,{dmc});throw Error('unexpected success');}catch(e){expect(e.name).toBe('ImportParseError');expect(e.message).toMatch(/expected a byte array/);}
  }
});

test('special motif model indices retain all 16 bits and must reference a declared model',()=>{
  const models=Buffer.alloc(568);models.writeUInt16LE(1,2);models.writeUInt16LE(4,4);models.write('sps1',8);
  for(let i=0;i<3;i++)models.writeUInt16LE(0x0510,4+522+i*14+10);
  const base=chart({models}).bytes;base.writeUInt16LE(1,749);
  const joint=Buffer.alloc(25);joint.writeUInt16LE(4,0);joint.writeUInt16LE(256,23);
  expect(()=>parseXSD(Buffer.concat([base,joint]),{dmc})).toThrow(/model index outside declared count/);
});
