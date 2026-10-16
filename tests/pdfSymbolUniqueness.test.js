const fs = require('fs');
const path = require('path');
const {PDFDocument, PDFName, PDFRawStream, decodePDFRawStream} = require('pdf-lib');
const {loadWorker, fixture} = require('./pdfWorkerHarness');
const spec = require('../creator/symbolFontSpec');
const layout = require('../creator/pdfChartLayout');
const options = {chartModes:['colour','bw'], miniLegend:true, includeCover:true, includeInfo:true, includeIndex:true};
const symbols = items => items.flatMap(t => Array.from(t.str).filter(c => c.codePointAt(0) >= 0xE000 && c.codePointAt(0) <= 0xE06F));
async function readPdf(bytes) {
  const {getDocument} = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({data:bytes.slice(), useSystemFonts:false, isEvalSupported:false, standardFontDataUrl:path.join(__dirname, '../node_modules/pdfjs-dist/standard_fonts/')}).promise;
  const pages = [];
  for(let i=1;i<=doc.numPages;i++) pages.push((await (await doc.getPage(i)).getTextContent()).items);
  await doc.destroy();
  return pages;
}

describe('actual worker PDFs: symbol capacity and Pattern Keeper primitives', () => {
  test.each([95,96,97,99,100,111,112])('%i colours survive chart, legend and page summaries', async n => {
    const project = fixture(n);
    // Include a blend, repeat palette references, unused entries and empties.
    project.palette[n-1] = {...project.palette[n-1], id:'310+550', type:'blend', threads:[{id:'310'},{id:'550'}]};
    project.pattern[n-1] = project.palette[n-1];
    project.palette.push(project.palette[0], null, {id:'__skip__'}, {id:'__empty__'}, {id:'unused'});
    const bytes = await loadWorker().buildPdf(project, options, 1);
    const pages = await readPdf(bytes);
    const assigned = layout.buildCodepointMap(project.palette, spec, Object.fromEntries(project.pattern.map(p=>[p.id,1])));
    const expected = assigned.order.map(id=>String.fromCodePoint(assigned.map[id]));
    const legends = pages.filter(p=>p.some(t=>t.str === 'Brand & no.'));
    expect(symbols(legends.flat()).sort()).toEqual(expected.slice().sort());
    // Legend rows associate the actual embedded glyph and thread label by Y.
    for(const page of legends) {
      for(const item of page.filter(t=>symbols([t]).length)) {
        const label = page.find(t=>Math.abs(t.transform[5]-item.transform[5])<0.01 && /^DMC /.test(t.str));
        expect(item.str).toBe(String.fromCodePoint(assigned.map[label.str.replace('DMC ', '').replace(/ /g, '')]));
      }
    }
    const charts = pages.filter(p=>p.some(t=>t.str==='On this page:'));
    expect(charts).toHaveLength(2);
    for(const page of charts) {
      const cells = page.filter(t=>t.height < 8 && symbols([t]).length);
      expect(symbols(cells).sort()).toEqual(expected.slice().sort());
      const summaries = page.filter(t=>t.height===9 && symbols([t]).length);
      expect(summaries.length).toBeGreaterThan(0);
      for(const item of summaries) {
        const label = page.find(t=>Math.abs(t.transform[4]-item.transform[4]-10)<0.01 && Math.abs(t.transform[5]-item.transform[5]-1)<0.01);
        expect(item.str).toBe(String.fromCodePoint(assigned.map[label.str]));
      }
    }
    const doc = await PDFDocument.load(bytes);
    const fonts = doc.context.enumerateIndirectObjects().map(([,o])=>o).filter(o=>o.get && String(o.get(PDFName.of('Type')))==='/Font');
    expect(fonts.some(f=>/CrossStitchSymbols/.test(String(f.get(PDFName.of('BaseFont')))))).toBe(true);
    expect(Buffer.from(bytes).toString('latin1')).not.toContain('/ObjStm');
    // A complete font stream, not outlined cells or a subset, is embedded.
    const embedded = doc.context.enumerateIndirectObjects().map(([,o])=>o).filter(o=>o instanceof PDFRawStream).map(o=>Buffer.from(decodePDFRawStream(o).decode()));
    expect(embedded.some(b=>b.equals(fs.readFileSync('assets/fonts/CrossStitchSymbols.ttf')))).toBe(true);
  });

  test.each([113,114,200])('rejects %i used threads without returning a PDF', async n => {
    await expect(loadWorker().buildPdf(fixture(n), options, 1)).rejects.toThrow('verified capacity is 112');
  });

  test('unused palette entries never consume capacity; repeated stitches keep their symbol', async () => {
    const p = fixture(200);
    p.pattern = [p.palette[0], p.palette[0], {id:'__empty__'}, null, {id:'__skip__'}];
    p.w=5; p.h=1;
    const bytes = await loadWorker().buildPdf(p, options, 1);
    const pages = await readPdf(bytes);
    expect(pages.flat().some(t=>t.str==='1 threads')).toBe(true);
    expect(new Set(symbols(pages.flat()))).toEqual(new Set([String.fromCodePoint(0xE000)]));
  });

  test('missing palette thread and missing embedded glyph fail explicitly', async () => {
    const p = fixture(2);
    p.palette.pop();
    await expect(loadWorker().buildPdf(p, options, 1)).rejects.toThrow('missing from the palette');
    const ctx = loadWorker();
    ctx.FONT_SPEC = {...spec, glyphs:[{codepoint:0xEFFF}]};
    await expect(ctx.buildPdf(fixture(1), options, 1)).rejects.toThrow('missing the glyph');
  });

  test.each(['legend', 'chart', 'summary'])('drawing failures in %s propagate instead of omitting symbols', async stage => {
    const {PDFPage} = require('pdf-lib');
    const original = PDFPage.prototype.drawText;
    const mock = jest.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function(text, opts) {
      if (text.codePointAt(0)>=0xE000 && (stage==='legend' ? opts.size===12 : stage==='summary' ? opts.size===9 : opts.size<8)) throw new Error('cannot render symbol');
      return original.call(this,text,opts);
    });
    try { await expect(loadWorker().buildPdf(fixture(1), options, 1)).rejects.toThrow('cannot render symbol'); }
    finally { mock.mockRestore(); }
  });
});


test('reordered palettes and screen symbol overrides leave the actual PDF assignment unchanged', async () => {
  const project = fixture(100);
  const baseline = await readPdf(await loadWorker().buildPdf(project, options, 1));
  project.palette = project.palette.slice().reverse().map(p=>({...p, symbol:'duplicate override'}));
  project.pattern = project.pattern.map(p=>({...p, symbol:'another screen glyph'}));
  project.symbolOverrides = Object.fromEntries(project.palette.map(p=>[p.id, 'same']));
  const reordered = await readPdf(await loadWorker().buildPdf(project, options, 1));
  const assignments = pages => pages.map(p=>p.filter(t=>symbols([t]).length).map(t=>({str:t.str, transform:t.transform})));
  expect(assignments(reordered)).toEqual(assignments(baseline));
});

test('overlapping multi-page charts retain the assignment for every repeated cell', async () => {
  const project = fixture(112);
  project.w=80; project.h=2;
  project.pattern=Array.from({length:160},(_,i)=>project.palette[i%112]);
  const opts={...options, overlap:true};
  const geometry=layout.computePageGeometry(opts);
  const segments=layout.paginate({patternW:80,patternH:2,colsPerPage:geometry.colsPerPage,rowsPerPage:geometry.rowsPerPage,overlap:true});
  expect(segments.length).toBeGreaterThan(1);
  const pages=await readPdf(await loadWorker().buildPdf(project,opts,1));
  const charts=pages.filter(p=>p.some(t=>t.str==='On this page:'));
  const assignment=layout.buildCodepointMap(project.palette,spec).map;
  expect(charts).toHaveLength(segments.length*2);
  charts.forEach((page,index)=>{
    const segment=segments[index%segments.length], expected=[];
    for(let y=segment.y0;y<segment.y1;y++) for(let x=segment.x0;x<segment.x1;x++) expected.push(String.fromCodePoint(assignment[project.pattern[y*80+x].id]));
    expect(symbols(page.filter(t=>t.height<8 && symbols([t]).length))).toEqual(expected);
  });
});
