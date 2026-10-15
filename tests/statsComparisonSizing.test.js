/** @jest-environment jsdom */
const fs=require('fs');
const React=require('react');
const {createRoot}=require('react-dom/client');
const {act}=require('react-dom/test-utils');
const pako=require('pako');
const source=fs.readFileSync('components-stats.js','utf8');
const helpers=fs.readFileSync('helpers.js','utf8');
const renderers=new Function(helpers.slice(helpers.indexOf('function comparisonCellFill'),helpers.indexOf('// ═══ Global Stats Dashboard helpers'))+';return {renderComparisonCanvas,renderDiffCanvas};')();
const ComparisonView=new Function('React','pako','Icons','renderComparisonCanvas','renderDiffCanvas','getStitchingDate','getDayEndHour','daysBetween',source.slice(source.indexOf('function ComparisonView'),source.indexOf('function ProjectComparison'))+';return ComparisonView;')(React,pako,{camera:()=>null},renderers.renderComparisonCanvas,renderers.renderDiffCanvas,()=> '2026-10-14',()=>0,()=>0);
let root, stage, clears;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;clears=jest.fn();jest.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(()=>({fillRect(){},clearRect:clears}));stage=document.createElement('div');document.body.append(stage);root=createRoot(stage);});
afterEach(()=>{act(()=>root.unmount());stage.remove();jest.restoreAllMocks();delete global.IS_REACT_ACT_ENVIRONMENT;});
const data=bytes=>btoa(String.fromCharCode(...pako.deflate(bytes)));
function props(w=301,h=2){return {sW:w,sH:h,pat:Array.from({length:w*h},()=>({id:'310',rgb:[0,0,0]})),done:new Uint8Array(w*h).fill(1),doneSnapshots:[],setDoneSnapshots(){}};}
function render(p){act(()=>root.render(React.createElement(ComparisonView,p)));}
function select(v){act(()=>{const el=stage.querySelector('select');el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));});}
test.each([[301,2],[2,301],[400,200]])('large %ix%i comparisons keep positive canvas dimensions and a fluid aspect ratio',(w,h)=>{
 render(props(w,h));const canvas=stage.querySelector('[aria-label="Current progress"]');
 expect(canvas.width).toBe(w);expect(canvas.height).toBe(h);expect(canvas.style.width).toContain('min(100%,');expect(canvas.style.height).toBe('auto');expect(canvas.style.aspectRatio).toBe(w+'/'+h);
});
test('deselecting a snapshot clears its old image',()=>{
 const p=props();p.doneSnapshots=[{id:'old',label:'Old',date:'2026-10-13',w:p.sW,h:p.sH,data:data(p.done)}];render(p);select('old');clears.mockClear();select('');expect(clears).toHaveBeenCalled();expect(stage.textContent).not.toContain('Since 2026');
});
test('unreadable and resized snapshots show a status and no misleading difference',()=>{
 const p=props();p.doneSnapshots=[{id:'bad',label:'Bad',date:'2026-10-13',data:'broken'},{id:'size',label:'Resized',date:'2026-10-13',w:2,h:301,data:data(p.done)}];render(p);select('bad');expect(stage.querySelector('[role="status"]').textContent).toContain('could not be read');expect(stage.textContent).not.toContain('Since 2026');select('size');expect(stage.querySelector('[role="status"]').textContent).toContain('changed size');expect(stage.querySelectorAll('canvas')).toHaveLength(2);
});
test('empty data disables snapshots, then loaded data paints the newly mounted current canvas',()=>{
 const p=props();render({...p,pat:null,done:null,sW:0,sH:0});expect(stage.querySelector('button').disabled).toBe(true);expect(stage.querySelector('canvas')).toBeNull();render(p);expect(stage.querySelector('[aria-label="Current progress"]').width).toBe(301);expect(stage.querySelector('button').disabled).toBe(false);
});

test('manual snapshots accept stored completion arrays and save their exact bytes',()=>{
 const p=props(4,2);p.done=[1,0,1,0,0,1,0,0];p.setDoneSnapshots=jest.fn();render(p);act(()=>stage.querySelector('button').click());expect(p.setDoneSnapshots).toHaveBeenCalledTimes(1);const saved=p.setDoneSnapshots.mock.calls[0][0]([])[0];expect(saved.doneCount).toBe(3);expect(Array.from(pako.inflate(Uint8Array.from(atob(saved.data),c=>c.charCodeAt(0))))).toEqual(p.done);
});
test('other projects can be compared but cannot save snapshots',()=>{
 render({...props(),canEdit:false});expect(stage.querySelector('button').disabled).toBe(true);expect(stage.querySelector('input[type="text"]').disabled).toBe(true);expect(stage.querySelector('select').disabled).toBe(false);
});
