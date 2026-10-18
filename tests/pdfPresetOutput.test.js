const {PDFDocument} = require('pdf-lib');
const {loadWorker, fixture} = require('./pdfWorkerHarness');
const layout = require('../creator/pdfChartLayout');
const path = require('path');
const base = {chartModes:['bw','colour'],pageSize:'a4',marginsMm:12,includeCover:true,includeInfo:true,includeIndex:true,miniLegend:true};
const cases = [
  ['tiny',1,1,{includeIndex:true}],
  ['wide',137,3,{pageSize:'letter',overlap:true,stitchesPerPage:'custom',customCols:50,customRows:30}],
  ['tall',3,173,{stitchesPerPage:'large',overlap:false}],
  ['multipage',121,97,{overlap:true}],
  ['letter-large-margin',11,7,{pageSize:'letter',marginsMm:30}],
  ['chart-only',73,41,{includeCover:false,includeInfo:false,includeIndex:false,includeLegend:false,miniLegend:false,chartModes:['bw']}],
  ['empty',1,1,{}],
];
async function texts(bytes) {
  const {getDocument} = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc=await getDocument({data:bytes.slice(),standardFontDataUrl:path.resolve('node_modules/pdfjs-dist/standard_fonts')+'/'}).promise;
  const result=[]; for(let i=1;i<=doc.numPages;i++) result.push((await (await doc.getPage(i)).getTextContent()).items);
  await doc.destroy(); return result;
}
test.each(cases)('%s actual page count, legends, chart bounds and progress agree with preview',async(name,w,h,patch)=>{
  const p=fixture(name==='letter-large-margin'?64:5,{w,h});
  p.pattern=Array.from({length:w*h},(_,i)=>name==='empty'?{id:'__skip__'}:p.palette[i%p.palette.length]);
  p.palette.push({id:'unused',rgb:[1,2,3]});
  const opts={...base,...patch}; const plan=layout.planExport(p,opts), progress=[];
  const bytes=await loadWorker({postMessage:m=>progress.push(m)}).buildPdf(p,opts,1);
  const pdf=await PDFDocument.load(bytes), pages=await texts(bytes);
  expect(pdf.getPageCount()).toBe(plan.totalPages);
  expect(progress.at(-1)).toMatchObject({current:plan.totalPages,total:plan.totalPages});
  expect(pages.filter(items=>items.some(t=>t.str.startsWith('Thread Legend')))).toHaveLength(plan.legendPages);
  for(const [i,items] of pages.entries()) {
    expect(pdf.getPage(i).getWidth()).toBeCloseTo(layout.mmToPt(plan.geom.pageWmm));
    for(const t of items.filter(t=>/^[\uE000-\uE06F]+$/.test(t.str))) {
      expect(t.transform[4]).toBeGreaterThanOrEqual(0);
      expect(t.transform[4]+t.width).toBeLessThanOrEqual(pdf.getPage(i).getWidth());
      expect(t.transform[5]).toBeGreaterThanOrEqual(layout.mmToPt(opts.marginsMm));
    }
  }
  for(const seg of plan.pages) {
    expect((seg.x1-seg.x0)*plan.geom.cellMm).toBeLessThanOrEqual(plan.geom.chartAreaWmm+1e-8);
    expect((seg.y1-seg.y0)*plan.geom.cellMm).toBeLessThanOrEqual(plan.geom.chartAreaHmm+1e-8);
  }
});
test.each([{marginsMm:NaN},{marginsMm:100},{customCols:0},{customRows:Infinity},{pageSize:'a3'},{chartModes:[]},{chartModes:['javascript']},{includeLegend:'false'}])('invalid options fail before PDF generation: %j',async bad=>{
  await expect(loadWorker().buildPdf(fixture(2),{...base,...bad},1)).rejects.toThrow();
});
test('chart-only still enforces symbol capacity and missing palette checks',async()=>{
  const opts={...base,includeLegend:false,includeCover:false,includeInfo:false};
  await expect(loadWorker().buildPdf(fixture(113),opts,1)).rejects.toThrow('verified capacity');
  const p=fixture(2); p.palette.pop();
  await expect(loadWorker().buildPdf(p,opts,1)).rejects.toThrow('missing from the palette');
});
