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
}, 30000);
test.each([{marginsMm:NaN},{marginsMm:100},{customCols:0},{customRows:Infinity},{pageSize:'a3'},{chartModes:[]},{chartModes:['javascript']},{includeLegend:'false'}])('invalid options fail before PDF generation: %j',async bad=>{
  await expect(loadWorker().buildPdf(fixture(2),{...base,...bad},1)).rejects.toThrow();
});
test('chart-only still enforces symbol capacity and missing palette checks',async()=>{
  const opts={...base,includeLegend:false,includeCover:false,includeInfo:false};
  await expect(loadWorker().buildPdf(fixture(113),opts,1)).rejects.toThrow('verified capacity');
  const p=fixture(2); p.palette.pop();
  await expect(loadWorker().buildPdf(p,opts,1)).rejects.toThrow('missing from the palette');
});

test('minimum custom density really overlaps two stitches without omitting or inventing rows',async()=>{
  const p=fixture(2,{w:19,h:19});p.pattern=Array.from({length:361},(_,i)=>p.palette[i%2]);
  const opts={...base,stitchesPerPage:'custom',customCols:10,customRows:10,overlap:true};
  const plan=layout.planExport(p,opts);
  expect(plan.pages[1].x0).toBe(plan.pages[0].x1-2);
  expect(plan.pages[3].y0).toBe(plan.pages[0].y1-2);
  const pdf=await PDFDocument.load(await loadWorker().buildPdf(p,opts,1));expect(pdf.getPageCount()).toBe(plan.totalPages);
},30000);
test('non-multiple custom density from older saved preferences is preserved and snapped consistently',async()=>{
  const p=fixture(2),opts={...base,stitchesPerPage:'custom',customCols:88,customRows:99};
  const plan=layout.planExport(p,opts);expect(plan.geom.colsPerPage).toBe(80);expect(plan.geom.rowsPerPage).toBe(90);
  expect((await PDFDocument.load(await loadWorker().buildPdf(p,opts,1))).getPageCount()).toBe(plan.totalPages);
});
test('Workshop knot legends paginate across multiple pages and retain exact preview totals',async()=>{
 const p=fixture(112,{w:10,h:12});p.knots=p.palette.map((c,i)=>({id:c.id,x:i%10,y:0,rgb:c.rgb}));
 const opts={...base,pageSize:'letter',marginsMm:30,theme:'workshop'},plan=layout.planExport(p,opts);
 const bytes=await loadWorker().buildPdf(p,opts,1),pdf=await PDFDocument.load(bytes),pages=await texts(bytes);
 expect(pdf.getPageCount()).toBe(plan.totalPages);expect(plan.legendPages).toBeGreaterThan(5);
 const knotPages=pages.filter(items=>items.some(t=>t.str==='French knots'));
 expect(knotPages).toHaveLength(4);
 for(const items of knotPages)for(const t of items)expect(t.transform[5]).toBeGreaterThanOrEqual(layout.mmToPt(30));
},30000);
test('long branding shrinks to fit and excessive branding stops with an actionable error',async()=>{
 const p=fixture(2),opts={...base,pageSize:'letter',marginsMm:30,branding:{designerName:'Long studio name with a copyright and contact line repeated for layout',designerContact:'hello@example.test',designerCopyright:'© 2026 Needle Studio'}};
 const pdf=await PDFDocument.load(await loadWorker().buildPdf(p,opts,1)),pages=await texts(await loadWorker().buildPdf(p,opts,2));
 for(const [i,items]of pages.entries())for(const t of items.filter(t=>/Long studio|hello@example|© 2026/.test(t.str)))expect(t.transform[4]+t.width).toBeLessThanOrEqual(pdf.getPage(i).getWidth()-layout.mmToPt(30)+0.1);
 await expect(loadWorker().buildPdf(p,{...opts,branding:{designerName:'Studio '.repeat(1000)}},3)).rejects.toThrow('branding text is too long');
 // Disabling branding in a preset is enforced at the worker boundary too.
 await expect(loadWorker().buildPdf(p,{...opts,includeBranding:false,branding:{designerName:'Studio '.repeat(1000)}},4)).resolves.toBeInstanceOf(Uint8Array);
},30000);
test('large-margin cover metadata stays above the copyright footer',async()=>{
 const opts={...base,pageSize:'letter',marginsMm:30,branding:{designerCopyright:'Copyright studio'}};
 const pages=await texts(await loadWorker().buildPdf(fixture(2),opts,1));
 const copyright=pages[0].find(t=>t.str==='Copyright studio'),lastMeta=pages[0].find(t=>t.str==='Total stitches:');
 expect(lastMeta.transform[5]-copyright.transform[5]).toBeGreaterThanOrEqual(15.99);
});
test.each([0,Infinity,-1,1.5])('invalid chart dimensions %s fail without constructing a page plan',async w=>{
 expect(()=>layout.planExport(fixture(1,{w}),base)).toThrow('chart dimensions');
 await expect(loadWorker().buildPdf(fixture(1,{w}),base,1)).rejects.toThrow('chart dimensions');
});
