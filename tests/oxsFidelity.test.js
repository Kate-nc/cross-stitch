/** @jest-environment jsdom */
const fs = require('fs');
const source = fs.readFileSync('./import-formats.js', 'utf8');
const DMC = [
  {id:'310',name:'Black',rgb:[0,0,0]},
  {id:'666',name:'Red',rgb:[204,0,0]},
  {id:'550',name:'Violet',rgb:[68,0,87]},
  {id:'3750',name:'Blue',rgb:[32,58,99]},
].map(t => ({...t,lab:t.rgb}));
const api = new Function('DMC','rgbToLab','dE', source + '\nreturn {parseOXS,generateOXS,importResultToProject};')(
  DMC,(...rgb)=>rgb,(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])));
const {parseOXS,generateOXS,importResultToProject} = api;
const fixture = fs.readFileSync('./tests/fixtures/oxs-fidelity.oxs','utf8');
const thread = id => ({...DMC.find(t=>t.id===id),type:'solid'});
const wrap = (content, palette = '<color index="1" number="310" color="000000"/><color index="2" number="666" color="CC0000"/>') =>
  '<chart><properties chartwidth="4" chartheight="3"/><palette>' + palette + '</palette>' + content + '</chart>';
const semantic = r => ({
  width:r.width,height:r.height,
  cells:r.pattern.map(c=>[c.id,c.type==='blend'?'blend':'solid']).map(c=>c[0]==='__skip__'?null:c),
  lines:r.bsLines.map(l=>[l.x1,l.y1,l.x2,l.y2,l.colorId,l.brand||'dmc',l.rgb,l.color]),
  partials:r.partialStitches.map(([i,qs])=>[i,Object.fromEntries(Object.entries(qs).sort().map(([q,t])=>[q,[t.id,t.type]]))]).sort((a,b)=>a[0]-b[0]),
});

test('sparse mixed chart preserves semantic objects and thread assignments through project save and two OXS cycles',()=>{
  const first=parseOXS(fixture);
  expect(first.warnings).toEqual([]);
  expect(first.bsLines.map(l=>l.colorId)).toEqual(['666','3750','310+550']);
  expect(first.bsLines.map(l=>l.color)).toEqual(['#CC0000','#203A63','#22002C']);
  expect(first.pattern[1].id).toBe('__skip__');
  expect(first.partialStitches.map(([i,qs])=>[i,Object.keys(qs).sort()])).toEqual([
    [5,['BL','TR']], [6,['BR','TL']], [7,['BL','TL','TR']], [8,['TR']],
  ]);
  expect(first.partialStitches[1][1].TL.id).toBe('310+550');
  let current=first;
  for(let cycle=0;cycle<2;cycle++){
    const saved=JSON.parse(JSON.stringify(importResultToProject(current)));
    const out=generateOXS(saved);
    expect(out.warnings).toEqual([]);
    current=parseOXS(out.xml);
    expect(current.warnings).toEqual([]);
    expect(semantic(current)).toEqual(semantic(first));
  }
});

test('the original two red lines survive import/re-export over black and empty cells',()=>{
  const original={w:4,h:3,pattern:[thread('310')],bsLines:[
    {x1:0,y1:0,x2:1,y2:1,colorId:'666'},
    {x1:2,y1:0,x2:4,y2:3,colorId:'666'},
  ]};
  const first=parseOXS(generateOXS(original).xml);
  const second=parseOXS(generateOXS(importResultToProject(first)).xml);
  expect(second.bsLines.map(l=>[l.x1,l.y1,l.x2,l.y2,l.colorId])).toEqual(original.bsLines.map(l=>[l.x1,l.y1,l.x2,l.y2,l.colorId]));
});

test.each(['backstitch','fractional','knot','bead'])('accepts a %s-only chart without synthesising full crosses',type=>{
  const content={
    backstitch:'<backstitches><backstitch x1="0" y1="0" x2="4" y2="3" palindex="2"/></backstitches>',
    fractional:'<partstitches><partstitch x="0" y="0" direction="3" palindex1="2"/></partstitches>',
    knot:'<ornaments><object x1="0.5" y1="0.5" objecttype="knot" palindex="2"/></ornaments>',
    bead:'<ornaments><object x1="0.5" y1="0.5" objecttype="bead" palindex="2"/></ornaments>',
  }[type];
  const first=parseOXS(wrap(content));
  expect(first.pattern.every(c=>c.id==='__skip__')).toBe(true);
  const out=generateOXS(importResultToProject(first));
  expect(out.warnings).toEqual([]);
  expect(semantic(parseOXS(out.xml))).toEqual(semantic(first));
});

test('legacy half-stitch arrays and modern quadrant Maps export the same diagonal threads, without doubling them',()=>{
  const halfStitches=[[0,{fwd:thread('666'),bck:thread('310')}]];
  const partialStitches=new Map([[0,{BL:thread('666'),TR:thread('666'),TL:thread('310'),BR:thread('310')}]]);
  const a=parseOXS(generateOXS({w:4,h:3,halfStitches}).xml);
  const b=parseOXS(generateOXS({w:4,h:3,halfStitches,partialStitches}).xml);
  expect(semantic(a)).toEqual(semantic(b));
  expect(a.partialStitches[0][1].BL.id).toBe('666');
  expect(a.partialStitches[0][1].TL.id).toBe('310');
});

test('all three-quarter directions and major sides retain their quadrant assignments',()=>{
  const xml=wrap('<partstitches>'+[
    '<partstitch x="0" y="0" direction="1" palindex1="1"/>',
    '<partstitch x="1" y="0" direction="2" palindex1="1"/>',
    '<partstitch x="2" y="0" direction="1" palindex2="2"/>',
    '<partstitch x="3" y="0" direction="2" palindex2="2"/>',
    '<partstitch x="0" y="1" direction="1" major="1" palindex1="1" palindex2="2"/>',
    '<partstitch x="1" y="1" direction="2" major="2" palindex1="1" palindex2="2"/>',
  ].join('')+'</partstitches>');
  const r=parseOXS(xml),qs=Object.fromEntries(r.partialStitches);
  expect(Object.keys(qs[0]).sort()).toEqual(['BL','BR','TL']);
  expect(Object.keys(qs[1]).sort()).toEqual(['BL','TL','TR']);
  expect(Object.keys(qs[2]).sort()).toEqual(['BR','TL','TR']);
  expect(Object.keys(qs[3]).sort()).toEqual(['BL','BR','TR']);
  expect(qs[4].TR.id).toBe('666');
  expect(qs[4].BL.id).toBe('310');
  expect(qs[5].TL.id).toBe('310');
  expect(qs[5].TR.id).toBe('666');
  expect(semantic(parseOXS(generateOXS(importResultToProject(r)).xml))).toEqual(semantic(r));
});

test('unsupported blends and line types are reported; miniature crosses are imported',()=>{
  const xml=wrap('<fullstitches><stitch x="0" y="0" palindex="1"/><stitch x="1" y="0" palindex="8"/><stitch x="2" y="0" palindex="8"/></fullstitches>'+
    '<backstitches><backstitch x1="0" y1="0" x2="1" y2="1" palindex="1" objecttype="daisy"/></backstitches>'+
    '<ornaments><object x1="0" y1="0" objecttype="quarter" palindex="1"/></ornaments>',
    '<color index="1" number="310"/><color index="8"><blend number="DMC 310" strands="2"/><blend number="DMC 666" strands="1"/></color>');
  const r=parseOXS(xml);
  expect(r.warnings.join(' ')).toMatch(/2 full stitch: blend/);
  expect(r.warnings.join(' ')).toMatch(/1 daisy: unsupported line type/);
  expect(r.specialtyStitches).toHaveLength(1);
  expect(r.specialtyStitches[0].type).toBe('petite');
  expect(r.stitchCount).toBe(1);
});

test('import-engine strategy and materialisation retain fractional and line data',async()=>{
  Object.assign(window,api);
  const {oxsStrategy}=require('../import-engine/strategies/oxsStrategy');
  const raw=await oxsStrategy.parse({fileName:'fixture.oxs',fullBytes:async()=>Buffer.from(fixture)}, {}, {});
  const {materialiseProject}=require('../import-engine/pipeline/materialise');
  const project=materialiseProject(raw,{});
  expect(project.partialStitches).toEqual(parseOXS(fixture).partialStitches);
  expect(project.bsLines.map(l=>l.colorId)).toEqual(['666','3750','310+550']);
});

describe('separate fidelity bug-hunting pass',()=>{
  test('palette index zero stays compatible with legacy thread palettes but explicit cloth never becomes a stitch',()=>{
    const legacy=wrap('<fullstitches><stitch x="0" y="0" palindex="0"/></fullstitches>', '<color index="0" number="666"/>');
    expect(parseOXS(legacy).pattern[0].id).toBe('666');
    const standard=wrap('<fullstitches><stitch x="0" y="0" palindex="0"/><stitch x="1" y="0" palindex="1"/></fullstitches>', '<palette_item index="0" number="cloth" color="FFFFFF"/><palette_item index="1" number="310"/>');
    expect(parseOXS(standard).pattern[0].id).toBe('__skip__');
  });
  test('palette aliases resolve consistently and duplicate numeric indices are rejected',()=>{
    const r=parseOXS(wrap('<fullstitches><stitch x="0" y="0" palindex="01"/></fullstitches>'));
    expect(r.pattern[0].id).toBe('310');
    expect(()=>parseOXS(wrap('<fullstitches/>','<color index="1" number="310"/><color index="01" number="666"/>'))).toThrow(/duplicate index/);
  });
  test('non-finite, fractional, missing and trailing-garbage cell coordinates are counted, never truncated',()=>{
    const invalid=['x="Infinity" y="0"','x="0.5" y="0"','y="0"','x="1bad" y="0"','x="4" y="0"'];
    const r=parseOXS(wrap('<fullstitches><stitch x="0" y="0" palindex="1"/>'+invalid.map(attrs=>'<stitch '+attrs+' palindex="1"/>').join('')+'</fullstitches>'));
    expect(r.stitchCount).toBe(1);
    expect(r.warnings).toContain('5 full stitch: invalid or out-of-bounds coordinates.');
    expect(()=>parseOXS('<chart width="4bad" height="3"/>')).toThrow(/dimensions/);
    expect(()=>parseOXS('<chart>')).toThrow(/malformed XML/);
  });
  test('unresolved backstitches and knots produce counted type-specific warnings',()=>{
    const r=parseOXS(wrap('<fullstitches><stitch x="0" y="0" palindex="1"/></fullstitches>'+
      '<backstitches><backstitch x1="0" y1="0" x2="4" y2="3"/><backstitch x1="0" y1="0" x2="1" y2="1" palindex="99"/></backstitches>'+
      '<ornaments><object x1="1" y1="1" palindex="99" objecttype="knot"/></ornaments>'));
    expect(r.bsLines).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/1 backstitch: missing or unresolved palette reference null/);
    expect(r.warnings.join(' ')).toMatch(/1 French knot: missing or unresolved palette reference 99/);
  });
  test('off-grid knot positions and colliding knots are reported',()=>{
    const r=parseOXS(wrap('<ornaments><object x1="0.2" y1="0.1" palindex="1" objecttype="knot"/><object x1="0" y1="0" palindex="2" objecttype="knot"/></ornaments>'));
    expect(r.knots).toHaveLength(1);
    expect(r.warnings.join(' ')).toMatch(/1 French knot: position snapped/);
    expect(r.warnings.join(' ')).toMatch(/1 French knot: duplicate position/);
  });
  test('legacy uncoloured lines never disappear or infer a thread silently',()=>{
    const result=generateOXS({w:4,h:3,pattern:[thread('310')],bsLines:[
      {x1:0,y1:0,x2:1,y2:1},{x1:3,y1:2,x2:4,y2:3},
      {x1:0,y1:0,x2:1,y2:1,colorId:'unavailable'},
    ]});
    expect(result.warnings.join(' ')).toMatch(/1 backstitch: legacy line has no thread reference; inferred/);
    expect(result.warnings.join(' ')).toMatch(/1 backstitch: legacy line has no thread reference or underlying stitch; not exported/);
    expect(result.warnings.join(' ')).toMatch(/1 backstitch: thread unavailable has no valid colour/);
    expect(parseOXS(result.xml).bsLines[0].colorId).toBe('310');
  });
  test('malformed legacy arrays are warned about without aborting valid content',()=>{
    const out=generateOXS({w:4,h:3,pattern:[thread('310')],partialStitches:[null,[0,{TL:thread('666')}]],halfStitches:[null]});
    expect(out.warnings.join(' ')).toMatch(/fractional stitch: malformed/);
    expect(parseOXS(out.xml).partialStitches[0][1].TL.id).toBe('666');
  });
});

test('known Anchor blends preserve their brand independently of DMC cells and backstitch underlays',()=>{
  const anchor=[{id:'403',name:'Black',rgb:[0,0,0]},{id:'46',name:'Red',rgb:[204,0,0]}];
  const branded=new Function('DMC','findThreadInCatalog',source+'\nreturn {parseOXS,generateOXS,importResultToProject};')(DMC,(b,id)=>b==='anchor'?anchor.find(t=>t.id===id):DMC.find(t=>t.id===id));
  const xml=branded.generateOXS({w:1,h:1,pattern:[],bsLines:[{x1:0,y1:0,x2:1,y2:1,colorId:'403+46',brand:'anchor'}]}).xml;
  const first=branded.parseOXS(xml);
  expect(first.bsLines[0]).toMatchObject({colorId:'403+46',brand:'anchor'});
  const second=branded.parseOXS(branded.generateOXS(branded.importResultToProject(first)).xml);
  expect(second.bsLines).toEqual(first.bsLines);
});

test('unsupported live blend strand ratios are counted instead of being normalised silently',()=>{
  const out=generateOXS({w:1,h:1,pattern:[{id:'310+666',type:'blend',blendRatio:[2,1]}]});
  expect(out.warnings).toEqual(['1 full stitch: blend 310+666 has unsupported strand proportions or mixed brands.']);
});

test('palette reuse cannot hide an unsupported blend ratio on a later stitch',()=>{
  const out=generateOXS({w:3,h:1,pattern:[{id:'310+666',type:'blend'}, {id:'310+666',type:'blend',blendRatio:[2,1]}, {id:'310+666',type:'blend',threads:[null]}]});
  expect(out.warnings.join(' ')).toMatch(/1 full stitch: blend 310\+666 has unsupported strand proportions/);
  expect(out.warnings.join(' ')).toMatch(/1 full stitch: blend 310\+666 has malformed component data/);
  expect(parseOXS(out.xml).stitchCount).toBe(1);
});

test('petites round-trip in OXS on chart boundaries; unsupported long export warns with a count',()=>{
 const thread={id:'310',type:'solid',rgb:[0,0,0]};
 const p={w:3,h:2,pattern:Array.from({length:6},()=>({id:'__skip__'})),specialtyStitches:[
  {uid:'p',type:'petite',x:2.5,y:1.5,thread},
  {uid:'p2',type:'petite',x:2.5,y:1.5,thread},
  {uid:'l',type:'long_stitch',x1:0,y1:0,x2:3,y2:2,thread}
 ]};
 const exported=generateOXS(p);expect(exported.warnings.join(' ')).toMatch(/1 long stitch: external OXS export is unsupported/);
 const r=parseOXS(exported.xml);expect(r.stitchCount).toBe(0);expect(r.specialtyStitches).toHaveLength(2);
 expect(r.specialtyStitches[0]).toMatchObject({type:'petite',x:2.5,y:1.5,thread:{id:'310'}});
 const twice=parseOXS(generateOXS(importResultToProject(r)).xml);expect(twice.specialtyStitches).toEqual(r.specialtyStitches);
});
test('OXS straight stitches import as independently identified long objects with explicit thread',()=>{
 const r=parseOXS(wrap('<backstitches><backstitch x1="0" y1="0" x2="3" y2="2" palindex="1" objecttype="straightstitch"/></backstitches>', '<color index="1" number="310"/>'));
 expect(r.bsLines).toEqual([]);expect(r.specialtyStitches[0]).toMatchObject({type:'long_stitch',x1:0,y1:0,x2:3,y2:2,thread:{id:'310'}});
});
