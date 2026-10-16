/** @jest-environment jsdom */
const fs = require('fs');
const {validateExtraction, pdfKeyMatch} = require('../../import-engine/pipeline/validate.js');
const dmc = [{id:'310',rgb:[0,0,0],lab:[0,0,0],name:'Black'}];
const {parseOXS, importResultToProject} = new Function('DMC','rgbToLab','dE', fs.readFileSync('import-formats.js','utf8') + '\nreturn {parseOXS,importResultToProject};')(dmc, (...a)=>a, ()=>0);
const xml = body => '<chart><properties chartwidth="4" chartheight="3"/><palette><color index="1" number="310"/></palette>'+body+'</chart>';
const full = '<fullstitches><stitch x="0" y="0" palindex="1"/></fullstitches>';
const validateOXS = body => { const r = parseOXS(xml(body)); return validateExtraction({_legacyProject:importResultToProject(r),_legacyResult:r, flags:{warnings:r.warnings}}); };

test('a complete supported OXS import verifies each applicable check', () => {
  const r = validateOXS(full);
  expect(r.verification.status).toBe('verified');
  expect(r.verification.checks.recognisedCells.coverage).toBe(1);
  expect(r.coverage).toBeNull(); // no numeric palette denominator
});
test('backstitch-only and fractional-only charts never get a zero-cell warning or percentage', () => {
  for (const body of ['<backstitches><backstitch x1="0" y1="0" x2="3" y2="2" palindex="1"/></backstitches>', '<partstitches><partstitch x="0" y="0" direction="3" palindex1="1"/></partstitches>']) {
    const r = validateOXS(body);
    expect(r.errors).toEqual([]);
    expect(r.verification.status).toBe('verified');
    expect(r.verification.checks.recognisedCells.coverage).toBeNull();
  }
});
test.each([
  '<fullstitches><stitch x="0" y="0" palindex="99"/><stitch x="1" y="0" palindex="1"/></fullstitches>',
  full+'<ornaments><object x1="0" y1="0" objecttype="mini" palindex="1"/></ornaments>',
  full+'<specialstitches><special/></specialstitches>',
  full+'<backstitches><curve/></backstitches>'
])('loss or an unrecognised source object cannot produce full verification', body => {
  const r = validateOXS(body);
  expect(r.verification.status).toBe('limited');
  expect(r.verification.checks.unsupportedContent.status).toBe('limited');
});
test('legacy projects check stored structure without claiming source fidelity', () => {
  const p = {w:2,h:1,pattern:[{id:'310'},{id:'__skip__'}]};
  const r = validateExtraction({_legacyProject:p});
  expect(r.coverage).toBeNull();
  expect(r.verification.status).toBe('limited');
  expect(r.verification.checks.recognisedCells.status).toBe('unknown');
  const bad = validateExtraction({_legacyProject:{...p,settings:{sW:3,sH:1}}});
  expect(bad.verification.status).toBe('invalid');
  expect(bad.errors[0].code).toBe('DIMENSIONS');
});
test('missing references in lines, fractional stitches and knots are surfaced', () => {
  const r = validateExtraction({_legacyProject:{w:1,h:1,pattern:[{id:'__skip__'}],bsLines:[{}],partialStitches:[[0,{TL:{rgb:[0,0,0]}}]],knots:[{}]}});
  expect(r.warnings.filter(x=>x.code==='THREAD_REFERENCE')).toHaveLength(1);
});
test('unsupported native and stored stitch types are limitations', () => {
  for (const raw of [{width:1,height:1,cells:[{col:0,row:0,code:'310',type:'mini'}]}, {_legacyProject:{w:1,h:1,pattern:[{id:'310',type:'mini'}]}}]) {
    expect(validateExtraction(raw).verification.checks.stitchTypes.status).toBe('limited');
  }
});
test('small discrepancies and zero declared counts are compared exactly', () => {
  for (const expectedCount of [0,2]) {
    const r = validateExtraction({width:10,height:10,cells:[{code:'310',matchConfidence:1}],legend:{rows:[{code:'310',expectedCount}]}});
    expect(r.verification.checks.counts.status).toBe('limited');
    expect(r.warnings.filter(x=>x.code==='COUNT_MISMATCH')).toHaveLength(1);
  }
});
test('PDF matching uses one shared calculation; size/count failures remain separate', () => {
  const report = {keyEntries:1,matched:{symbol:1},checks:[{what:'size',ok:false},{what:'per-thread counts',ok:false}]};
  expect(pdfKeyMatch(report)).toEqual({read:1,total:1});
  const r=validateExtraction({_legacyProject:{w:1,h:1,pattern:[{id:'310'}],importReport:report}});
  expect(r.coverage).toBe(1);
  expect(r.verification.status).toBe('limited');
  expect(r.verification.checks.dimensions.status).toBe('limited');
  expect(r.verification.checks.counts.status).toBe('limited');
  expect(pdfKeyMatch({keyEntries:1,matched:{symbol:0}})).toBeNull();
});

test('the pipeline retains source bytes and verification independently of confidence', async () => {
  require('../../import-engine/types.js');
  require('../../import-engine/pipeline/materialise.js');
  const {runPipeline} = require('../../import-engine/pipeline.js');
  const r = parseOXS(xml(full));
  const project = importResultToProject(r);
  const bytes = new Uint8Array([1,2,3]);
  const out = await runPipeline({fileName:'original.oxs',fullBytes:async()=>bytes}, {}, {}, {
    sniff:async p=>p, classify:async()=>({id:'oxs'}),
    extract:async()=>({_legacyProject:project,_legacyResult:r,flags:{warnings:r.warnings}}),
  });
  expect(out.ok).toBe(true);
  expect(out.verification.status).toBe('verified');
  expect(out.project.meta.attachments.originalFile.bytes).toEqual(bytes);
  expect(out.project._import.verification).toBe(out.verification);
});
test('native backstitch-only extractions have no false empty-grid error', () => {
  const out=validateExtraction({width:4,height:3,cells:[],bsLines:[{colorId:'310',x1:0,y1:0,x2:1,y2:1}]});
  expect(out.errors).toEqual([]);
  expect(out.coverage).toBeNull();
});
