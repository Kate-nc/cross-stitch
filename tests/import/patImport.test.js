const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { fixture } = require('../fixtures/pat/make-fixture');
const { parsePAT, patStrategy } = require('../../import-engine/strategies/patStrategy');
const { sniffMagic } = require('../../import-engine/classifier/sniffMagic');
const { validateExtraction } = require('../../import-engine/pipeline/validate');
const read = opts => parsePAT(fixture(opts).bytes, 'fixture');

test('non-square column-major grid has independently known row-major positions and thread IDs', () => {
  const p = read();
  expect(p.settings).toEqual({sW:3,sH:2,fabricCt:14});
  expect(p.pattern.map(t => t.id)).toEqual(['310','321','__skip__','__skip__','321','__skip__']);
  expect(p.meta.pcstitch.palette.map(t => t.sourceId)).toEqual(['310','321']);
  expect(p.pattern[1].rgb).toEqual([199,43,59]);
});

test.each([['White','Blanc'],['5200','B5200'],['Ecru','Ecru']])('DMC alias %s retains original identifier', (source,id) => {
  const p = read({w:1,h:1,palette:[{scheme:'DMC',id:source,rgb:[255,255,255]}],runs:[[1,1,1]]});
  expect(p.pattern[0].id).toBe(id); expect(p.meta.pcstitch.palette[0].sourceId).toBe(source);
});

test('non-DMC and explicit blend labels are placeholders, never remapped to a solid DMC colour', () => {
  const p = read({palette:[{scheme:'Blend',id:'310+321',rgb:[100,20,30]},{scheme:'Anchor',id:'310',rgb:[1,2,3]}]});
  expect(p.pattern[0].id).toBe('U1'); expect(p.pattern[1].id).toBe('U2');
  expect(p.importReport.placeholders.map(t=>t.id)).toEqual(['U1','U2']);
  expect(p.importReport.warnings.join(' ')).toMatch(/blended.*placeholders/);
  const v = validateExtraction({_legacyProject:p}).verification;
  expect(v.status).toBe('limited'); expect(v.checks.legendMatches.status).not.toBe('verified');
});

const corners = [[2,['TL','TR','BL']],[3,['TL','TR','BR']],[4,['TL','BL','BR']],[5,['TR','BL','BR']],
  [6,['TL','BR']],[7,['TR','BL']],[9,['TL']],[10,['TR']],[11,['BL']],[12,['BR']]];
test.each(corners)('fractional type %s retains exact quadrants', (type,expected) => {
  const p = read({w:1,h:1,runs:[[1,1,type]]});
  expect(p.pattern[0].id).toBe('__skip__');
  expect(p.partialStitches[0][0]).toBe(0);
  expect(Object.keys(p.partialStitches[0][1])).toEqual(expected);
  expect(Object.values(p.partialStitches[0][1]).every(t=>t.id==='310')).toBe(true);
});

test('extras retain two fractional colours at one-based bottom-right cell', () => {
  const p = read({runs:[[6,255,255]],extras:[{x:3,y:2,stitches:[[1,9],[2,12],[255,255],[255,255]]}]});
  expect(p.partialStitches).toEqual([[5,{TL:expect.objectContaining({id:'310'}),BR:expect.objectContaining({id:'321'})}]]);
});

test('backstitch snap points keep half-cell geometry over an empty chart', () => {
  const p = read({runs:[[6,255,255]], lines:[[1,1,1,3,2,9,2],[1,1,5,2,1,6,1]]});
  expect(p.bsLines[0]).toMatchObject({x1:0,y1:0,x2:3,y2:2,colorId:'321'});
  expect(p.bsLines[1]).toMatchObject({x1:0.5,y1:0.5,x2:2,y2:0.5,colorId:'310'});
});

test('empty and sparse charts are valid but retain explicit limits', () => {
  for (const p of [read({palette:[],runs:[[6,255,255]]}),read({runs:[[5,255,255],[1,1,1]]})]) {
    expect(p.pattern).toHaveLength(6);
    expect(validateExtraction({_legacyProject:p}).verification.status).toBe('limited');
  }
});

test('unknown stitch types, knots, trailing data and fabric approximation are visible', () => {
  const p = read({runs:[[6,1,8]],knots:[[1,1,1]],trailing:[1,2,3],fabricY:16});
  expect(p.pattern.every(t=>t.id==='__skip__')).toBe(true);
  expect(p.importReport.warnings.join(' ')).toMatch(/type 8 omitted. Count: 6/);
  expect(p.importReport.warnings.join(' ')).toMatch(/French knots omitted.*Count: 1/);
  expect(p.importReport.warnings.join(' ')).toMatch(/trailing bytes.*Count: 3/);
  expect(p.importReport.warnings.join(' ')).toMatch(/fabric count approximated/);
});

test.each([5,6,8,9,10,11])('version %s is rejected without attempting another layout', version => {
  expect(()=>read({version})).toThrow(/version .* unsupported/);
});

test('signature detection is content based; unrelated PAT extensions never select this strategy', async () => {
  for (const str of ['GPAT','8BPT','*ANSI31, ANSI Iron','PCStitch 7 Pattern FileX']) {
    const probe = {fileName:'chart.pat',bytes:Buffer.from(str)};
    expect(sniffMagic(probe).format).toBe('unknown'); expect(await patStrategy.canHandle(probe)).toBe(0);
    expect(()=>parsePAT(probe.bytes)).toThrow(/signature/);
  }
  expect(sniffMagic({fileName:'chart.bin',bytes:fixture().bytes}).format).toBe('pat');
});

test('every truncated prefix of a valid file fails, including string, palette, RLE and line records', () => {
  const {bytes} = fixture({lines:[[1,1,1,3,2,9,1]]});
  for (let i=0;i<bytes.length;i++) expect(()=>parsePAT(bytes.subarray(0,i))).toThrow();
});

test.each([
  ['dimensions',(b,o)=>b.writeUInt16LE(65535,o.dimensions)],
  ['zero width',(b,o)=>b.writeUInt16LE(0,o.dimensions)],
  ['zero run',(b,o)=>b.writeUInt16LE(0,o.runs)],
  ['oversized run',(b,o)=>b.writeUInt16LE(7,o.runs)],
  ['thread zero',(b,o)=>{b[o.runs+2]=0;}],
  ['thread missing',(b,o)=>{b[o.runs+2]=3;}],
  ['mixed empty',(b,o)=>{b[o.runs+3]=255;}],
  ['extra count',(b,o)=>b.writeUInt32LE(0xffffffff,o.extras)],
  ['knot count',(b,o)=>b.writeUInt32LE(0xffffffff,o.knots)],
  ['line count',(b,o)=>b.writeUInt32LE(0xffffffff,o.lines)],
  ['bad marker',(b,o)=>{b[o.marker]=0;}],
])('malformed %s rejects before materialisation', (_,mutate) => {
  const {bytes,offsets} = fixture(); mutate(bytes,offsets); expect(()=>parsePAT(bytes)).toThrow();
});

test.each([
  {extras:[{x:0,y:1,stitches:[[1,9],[255,255],[255,255],[255,255]]}]},
  {extras:[{x:1,y:1,stitches:[[1,9],[1,9],[255,255],[255,255]]}],runs:[[6,255,255]]},
  {lines:[[1,1,0,3,2,9,1]]}, {lines:[[1,1,1,4,2,9,1]]}, {lines:[[1,1,1,1,1,1,1]]},
])('invalid or overlapping geometry rejects', opts => expect(()=>read(opts)).toThrow());

test('a typed array subview honours byte offsets', () => {
  const {bytes} = fixture(); const wrapped=Buffer.concat([Buffer.alloc(17),bytes,Buffer.alloc(9)]);
  expect(parsePAT(wrapped.subarray(17,17+bytes.length)).pattern.map(t=>t.id)).toEqual(read().pattern.map(t=>t.id));
});

test('browser bundle runs the real pipeline, carries verification through review refresh and attaches source', async () => {
  const window={}; const context=vm.createContext({window,console,Uint8Array,DataView,Map,Set,TextDecoder,URL,Buffer});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../../import-engine/bundle.js'),'utf8'),context);
  const {bytes}=fixture({runs:[[6,255,255]]});
  const result=await window.ImportEngine.importPattern({name:'empty.pat',type:'application/octet-stream',arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)});
  expect(result.ok).toBe(true); expect(result.publisher).toBe('PCStitch 7');
  expect(result.verification.status).toBe('limited'); expect(result.project.meta.attachments.originalFile.bytes).toHaveLength(bytes.length);
  expect(window.ImportEngine.validateExtraction({_legacyProject:result.project}).verification.checks.recognisedCells.status).toBe('verified');
  const oversize=await window.ImportEngine.importPattern({name:'large.pat',size:17000000,arrayBuffer:()=>{throw new Error('must not read');}});
  expect(oversize.error.message).toMatch(/16 MiB/);
});

test('committed original representative files match hand-authored expectations', () => {
  const parse = name => parsePAT(fs.readFileSync(path.join(__dirname,'../fixtures/pat/'+name+'.pat')));
  expect(parse('sparse').pattern.map(t=>t.id)).toEqual(['310','321','__skip__','__skip__','321','__skip__']);
  expect(parse('empty').pattern.every(t=>t.id==='__skip__')).toBe(true);
  const p = parse('geometry');
  expect(p.partialStitches[0][0]).toBe(5);
  expect(p.partialStitches[0][1].TL.id).toBe('310'); expect(p.partialStitches[0][1].BR.id).toBe('321');
  expect(p.bsLines[0]).toMatchObject({x1:0,y1:0,x2:3,y2:2,colorId:'321'});
  expect(parse('unsupported').importReport.warnings.join(' ')).toMatch(/French knots omitted/);
});
