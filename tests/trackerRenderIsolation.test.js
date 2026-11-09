/** @jest-environment jsdom */
const fs=require('fs'),babel=require('@babel/core');
const React=require('react'),{createRoot}=require('react-dom/client'),{act}=require('react-dom/test-utils');
global.IS_REACT_ACT_ENVIRONMENT=true;
const src=fs.readFileSync('tracker-app.js','utf8');
const block=src.slice(src.indexOf('const TILE_KEY_CLASSES='),src.indexOf('function TrackerApp('));
const code=babel.transformSync(block,{presets:['@babel/preset-react']}).code;
let rowRenders,headerRenders;
const Icons=new Proxy({},{get:()=>()=>React.createElement('svg')});
const {Row,createStore,SaveHeader}=new Function('React','Icons','luminance','colourDoneName','ThreadKeyLabel','Header',code+';return {Row:MemoTrackerPaletteRow,createStore:createTrackerSaveStore,SaveHeader:TrackerSaveHeader};')(
 React,Icons,()=>0,p=>p.id,({row})=>{rowRenders++;return React.createElement('span',null,row.title);},props=>{headerRenders++;return React.createElement('span',null,[props.projectName,props.saveStatus,props.saveError&&props.saveError.message,props.savedAt&&props.savedAt.toISOString()].filter(Boolean).join('|'));});
let root,container;
beforeEach(()=>{rowRenders=0;headerRenders=0;container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();});
const props=id=>({p:{id,rgb:[1,2,3]},kr:{title:id,usageTitle:'2 strands',label:id},pct:0,complete:false,isFocused:false,compactColours:false,countText:'0/10',parkCount:0,parkVisible:false,bsTotal:0,bsDone:0,hasStitches:true,actions:jest.fn()});
test('ordinary, bulk, undo/redo and colour changes render only rows with new display values',()=>{
 let rows=[props('a'),props('b'),props('c')];const draw=()=>act(()=>root.render(React.createElement('div',null,rows.map(p=>React.createElement(Row,{...p,key:p.p.id})))));
 draw();expect(rowRenders).toBe(3);
 // Each input represents the immutable display snapshot built from the mutable counts.
 for(let n=1;n<=20;n++){rows[0]={...rows[0],countText:n+'/20',pct:n*5,complete:n===20};draw();}
 expect(rowRenders).toBe(23);expect(container.textContent).toContain('20/20');expect(container.querySelector('button[aria-label="Mark all not done: a"]')).not.toBeNull();
 rows[0]={...rows[0],countText:'0/20',pct:0,complete:false};draw();expect(rowRenders).toBe(24);
 rows[0]={...rows[0],countText:'20/20',pct:100,complete:true};draw();expect(rowRenders).toBe(25);
 rows[0]={...rows[0],isFocused:true};draw();expect(rowRenders).toBe(26);
 rows[0]={...rows[0],isFocused:false};rows[1]={...rows[1],isFocused:true};draw();expect(rowRenders).toBe(28);
 draw();expect(rowRenders).toBe(28);
});
test('memoised row actions use current completion and project, including backstitch and detail',()=>{
 const a=props('a');a.bsTotal=2;a.parkCount=1;
 const draw=p=>act(()=>root.render(React.createElement(Row,p)));draw(a);
 act(()=>container.querySelector('[aria-label="Mark all done: a"]').click());expect(a.actions).toHaveBeenLastCalledWith('mark',a.p,true);
 draw({...a,complete:true,bsDone:2});act(()=>container.querySelector('[aria-label="Mark all not done: a"]').click());expect(a.actions).toHaveBeenLastCalledWith('mark',a.p,false);
 act(()=>container.querySelector('[aria-label="Mark all lines not done: a"]').click());expect(a.actions).toHaveBeenLastCalledWith('backstitch',a.p);
 const b=props('b');draw(b);act(()=>container.querySelector('.ppal-tile-select').click());expect(b.actions).toHaveBeenLastCalledWith('pick',b.p);
 act(()=>container.querySelector('.ppal-tile-swatch').click());expect(b.actions).toHaveBeenLastCalledWith('detail',b.p,expect.objectContaining({left:0}));
});
test('save success, failure, conflict and project reset update the header without rendering the parent or palette',()=>{
 const store=createStore(),p=props('a');let parents=0;
 function Parent(){parents++;return React.createElement('div',null,React.createElement(SaveHeader,{saveStore:store,projectName:'A'}),React.createElement(Row,p));}
 act(()=>root.render(React.createElement(Parent)));const before=headerRenders;
 act(()=>store.setSaveStatus('saving'));expect(container.textContent).toContain('A|saving');
 act(()=>{store.setSaveStatus('error');store.setSaveError(new Error('disk full'));});expect(container.textContent).toContain('error|disk full');
 act(()=>{store.setSaveError(null);store.setSaveStatus('conflict');});expect(container.textContent).toContain('A|conflict');
 act(()=>{store.setSaveStatus('saved');store.setSavedAt(new Date('2026-01-01'));});expect(container.textContent).toContain('2026-01-01');
 const count=headerRenders;act(()=>store.setSaveStatus('saved'));expect(headerRenders).toBe(count);
 act(()=>{store.setSavedAt(null);store.setSaveStatus('idle');});expect(container.textContent).toContain('A|idle');
 expect(headerRenders).toBeGreaterThan(before);expect(parents).toBe(1);expect(rowRenders).toBe(1);
});
