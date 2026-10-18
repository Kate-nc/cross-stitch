/** @jest-environment jsdom */
const fs=require('fs');
const React=require('react');
const {createRoot}=require('react-dom/client');
const {act}=require('react-dom/test-utils');
global.IS_REACT_ACT_ENVIRONMENT=true;
let root,host,ctx,app;
function source(file){new Function('window','React',fs.readFileSync(file,'utf8'))(window,React);}
function render(){act(()=>root.render(React.createElement(window.CreatorExportTab)));}
function button(text){return [...host.querySelectorAll('button')].find(b=>b.textContent===text || (b.querySelector("strong") && b.querySelector("strong").textContent===text));}
function click(text){act(()=>button(text).click());}
function change(label,value){const el=host.querySelector('[aria-label="'+label+'"]');act(()=>{
  const descriptor=Object.getOwnPropertyDescriptor(el.tagName==='INPUT'?HTMLInputElement.prototype:HTMLSelectElement.prototype,'value');
  descriptor.set.call(el,value); el.dispatchEvent(new Event(el.tagName==='INPUT'?'input':'change',{bubbles:true}));
});}
beforeEach(()=>{
 localStorage.clear(); source('user-prefs.js'); source('creator/pdfExport.js');
 window.PdfChartLayout=require('../creator/pdfChartLayout'); window.SYMBOL_FONT_SPEC=require('../creator/symbolFontSpec');
 window.generatePatternThumbnail=()=>null;
 ctx={sW:13,sH:7,pat:Array.from({length:91},()=>({id:'310',type:'solid',rgb:[0,0,0]})),pal:[{id:'310',type:'solid',rgb:[0,0,0]}]};
 app={tab:'materials',materialsTab:'output',projectName:'Old project',projectDesigner:'Project studio'};
 window.usePatternData=()=>ctx; window.useApp=()=>app;
 source('creator/ExportTab.js'); host=document.createElement('div'); document.body.append(host); root=createRoot(host); render();
});
afterEach(()=>{act(()=>root.unmount());host.remove();});
test('preset lifecycle applies real controls, persists through remount and project switches; preview/export match',async()=>{
 change('Preset name','Shop'); click('Save as new preset');
 expect(window.UserPrefs.namedExportPresets()[0].name).toBe('Shop');
 click('Chart only'); change('Preset name','Charts'); click('Update selected preset');
 expect(window.UserPrefs.namedExportPresets()[0]).toMatchObject({name:'Charts',settings:{exportIncludeLegend:false,exportIncludeCover:false}});
 click('For printing (home)'); change('Saved export preset','Charts'); click('Apply preset');
 expect(host.querySelector('figure').textContent).toContain('0 thread legend');
 act(()=>root.unmount()); root=createRoot(host); render();
 expect(host.querySelector('figure').textContent).toContain('0 thread legend');
 ctx={...ctx,sW:7,sH:13}; render(); expect(window.UserPrefs.namedExportPresets()[0].name).toBe('Charts');
 let captured; window.PdfExport.runExport=jest.fn((p,o)=>{captured={p,o};return Promise.resolve(new Uint8Array([1]));}); window.PdfExport.downloadBytes=jest.fn();
 await act(async()=>button('Export PDF').click());
 expect(captured.o).toMatchObject({includeCover:false,includeInfo:false,includeIndex:false,includeLegend:false,miniLegend:false});
 expect(host.querySelector('figure').textContent).toContain(window.PdfChartLayout.planExport(captured.p,captured.o).totalPages+' pages');
 change('Saved export preset','Charts'); click('Delete preset'); expect(window.UserPrefs.namedExportPresets()).toEqual([]);
});
test('invalid settings disable PDF export and do not save presets',()=>{
 click('Format & settings'); change('Stitches per page','custom'); change('Custom columns per PDF page','0');
 expect(button('Export PDF').disabled).toBe(true);
 change('Preset name','Invalid');click('Save as new preset');expect(window.UserPrefs.namedExportPresets()).toEqual([]);
});
