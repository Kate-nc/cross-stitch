/** @jest-environment jsdom */
// Opt-in, read-only verification against locally authorised upstream fixtures.
// No copyrighted charts are redistributed. See docs/xsd-import.md for provenance.
const fs=require('fs'),path=require('path');
const {TextDecoder}=require('util');global.TextDecoder=TextDecoder;
const {parseXSD}=require('../../import-engine/formats/xsd');
const root=process.env.XSD_REFERENCE_ROOT;
const real=root?test:test.skip;
const dmc=new Function(fs.readFileSync('dmc-data.js','utf8')+';return DMC;')();
function read(relative){return fs.readFileSync(path.join(root,relative));}
real('Piggies full cells agree with the independently supplied OXS chart; other export differences stay explicit',()=>{
  const xml=new DOMParser().parseFromString(read('app/public/demo/Piggies.oxs').toString(),'text/xml');
  const palette=Object.fromEntries([...xml.querySelectorAll('palette_item')].map(p=>[p.getAttribute('index'),p.getAttribute('number').replace(/^DMC\s*/,'')]));
  const r=parseXSD(read('testdata/patterns/pmaker/piggies.xsd'),{dmc});const p=r._legacyProject;
  const props=xml.querySelector('properties');expect([p.w,p.h]).toEqual([+props.getAttribute('chartwidth'),+props.getAttribute('chartheight')]);
  const expected=[...xml.querySelectorAll('fullstitches stitch')].map(s=>[+s.getAttribute('y')*p.w + +s.getAttribute('x'),palette[s.getAttribute('palindex')]]).sort((a,b)=>a[0]-b[0]);
  const actual=p.pattern.flatMap((t,i)=>t.id==='__skip__'?[]:[[i,t.id]]);
  expect(expected).toHaveLength(1000);expect(actual).toEqual(expected);
  const oxsLines=[...xml.querySelectorAll('backstitches backstitch')].map(s=>({x1:+s.getAttribute('x1'),y1:+s.getAttribute('y1'),x2:+s.getAttribute('x2'),y2:+s.getAttribute('y2'),id:palette[s.getAttribute('palindex')]}));
  const xsdLines=p.bsLines.map(l=>({...l,id:l.colorId})).concat(p.specialtyStitches.filter(s=>s.type==='long_stitch').map(l=>({...l,id:l.thread.id})));
  // The OXS chart is a different export: decorative endpoints have finer
  // precision and two half-unit black segments differ. It is an exact oracle
  // for full cells only. Joint geometry is verified independently below.
  expect(xsdLines).toHaveLength(446);
  expect(oxsLines).toHaveLength(1105);
  expect(r._xsdAudit.unknownSmallCells).toBe(0);
  expect(p.knots).toHaveLength(10);expect(p.beads).toHaveLength(8);
  expect(r.flags.warnings.join(' ')).toMatch(/trailing data.*21166 bytes/);
});
real('upstream sectional stitch fixture agrees with its independently known expected coordinates',()=>{
  const {chart}=require('../fixtures/xsd/generate');
  const section=read('testdata/patterns/pmaker/xsd/stitches');
  const base=chart({width:10,height:10,words:[0x40640000,0],small:Array(8).fill(Array(10).fill(0)),palette:Array.from({length:7},(_,i)=>({brand:0,id:String(i),rgb:[i,0,0]}))});
  const prefix=Buffer.from(base.bytes.subarray(0,base.stream));
  const bytes=Buffer.concat([prefix,section,Buffer.alloc(4)]);
  const r=parseXSD(bytes,{dmc:Array.from({length:7},(_,i)=>({id:String(i),rgb:[i,0,0]}))});
  const p=r._legacyProject;
  expect(p.pattern.flatMap((t,i)=>t.id==='__skip__'?[]:[[i%10,Math.floor(i/10),t.id]])).toEqual([[0,0,'1'],[9,0,'2'],[0,9,'6'],[9,9,'0']]);
  expect(p.specialtyStitches.map(s=>[s.x,s.y,s.thread.id])).toEqual([[1,1,'3'],[2.5,1,'3'],[1,2.5,'3'],[2.5,2.5,'3']]);
  expect(p.partialStitches.map(([i,q])=>[i,Object.keys(q).sort()])).toEqual([[11,['BR']],[12,['BL']],[21,['TR']],[22,['TL']],[33,['BR','TL']],[34,['BL','TR']],[43,['BL','TR']],[44,['BR','TL']]]);
});
real('the specials-only real chart fails instead of creating an empty successful project',()=>{
  expect(()=>parseXSD(read('testdata/patterns/pmaker/specials.xsd'),{dmc})).toThrow(/no supported stitch objects remain/);
});

real('real sectional joints retain expected backstitch, straight, knot and bead geometry while counting special motifs',()=>{
  const {chart}=require('../fixtures/xsd/generate');
  const base=chart({width:14,height:10,words:[0x408c0000,0],palette:[{brand:0,id:'310'},{brand:0,id:'321'},{brand:0,id:'310',bead:true}]});
  const prefix=Buffer.from(base.bytes.subarray(0,base.modelOffset));prefix.writeUInt16LE(16,749);
  const b=Buffer.concat([prefix,read('testdata/patterns/pmaker/xsd/special_stitch_models'),read('testdata/patterns/pmaker/xsd/joints')]);
  const r=parseXSD(b,{dmc}),p=r._legacyProject;
  expect(p.bsLines.map(l=>[l.x1,l.y1,l.x2,l.y2,l.colorId])).toEqual([[1,1,2,2,'321'],[3,2,4,1,'321'],[4,1,5,1,'321']]);
  expect(p.specialtyStitches.map(l=>[l.type,l.x1,l.y1,l.x2,l.y2,l.thread.id])).toEqual([['long_stitch',1,2,5,2,'321']]);
  expect(p.knots[0]).toMatchObject({x:6,y:6,id:'310'});
  expect(p.beads.map(x=>[x.x,x.y])).toEqual([[6,9],[6,11]]);
  expect(r._xsdAudit.losses.filter(x=>x.reason.startsWith('special stitch:')).reduce((n,x)=>n+x.count,0)).toBe(9);
});
