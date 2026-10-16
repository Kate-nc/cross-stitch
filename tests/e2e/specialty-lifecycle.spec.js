const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { quietOnboarding, device } = require('./creator-helpers');
const { TRACKER_CANVAS } = require('./touch-helpers');
test.use(device('desktop'));

test.beforeEach(async({context,page})=>{
 await installLocalCdn(context);await quietOnboarding(page);
 await page.addInitScript(()=>{
  localStorage.setItem('cs_stitchStyle','block');localStorage.setItem('cs_sessionOnboardingDone','1');
  localStorage.setItem('cs_pref_trackerResumeRecap','false');
  ['firstStitch_tracker','rectSelect_tracker'].forEach(k=>localStorage.setItem('cs_pref_onboarding.coached.'+k,'true'));
 });
 await context.route('**/compiled/tracker-app.compiled.js*',async route=>{
  const response=await route.fetch();const body=(await response.text()).replace('function toggleKnotDone(k){',
   'window.__specialtyQA={read:()=>({snapshot:snapshotNow(),progress:progAll,shown:progShown,counts:layerCounts,colours:colourDoneCounts}),point:(fx,fy)=>{const r=stitchRef.current.getBoundingClientRect(),t=chartTileRef.current||{x:0,y:0};return {x:r.left+G+fx*scs-t.x,y:r.top+G+fy*scs-t.y};},toggle:toggleSpecialtyDone,undo:undoTrack,redo:redoTrack,unpick:unpickArea,open:()=>{setLeftSidebarTab("layers");setMorePanelOpen(true);},hide:(type)=>setLayerVis(v=>({...v,[type]:false})),load:processLoadedProject,end:()=>{setLeftSidebarTab("session");setMorePanelOpen(true);}};function toggleKnotDone(k){');
  await route.fulfill({response,body});
 });
 await context.route('**/creator/extras-bundle.js*',async route=>{const response=await route.fetch();const body=(await response.text()).replace('  function renderPatternPng(cellPx) {','  window.__specialtyPng=renderPatternPng;\n  function renderPatternPng(cellPx) {');await route.fulfill({response,body});});
 await context.route('**/compiled/creator-main.compiled.js*',async route=>{
  const response=await route.fetch();const body=(await response.text()).replace('const state = useCreatorStateHook();','const state = useCreatorStateHook(); window.__specialtyCreator=state;');
  await route.fulfill({response,body});
 });
 await page.goto('/home.html');await page.waitForFunction(()=>window.ProjectStorage);
 await page.evaluate(async()=>{
  const thread={id:'310',type:'solid',rgb:[0,0,0]};
  await ProjectStorage.save({version:11,id:'proj_specialty',name:'Specialty lifecycle',page:'creator',settings:{sW:10,sH:10,fabricCt:14,isScratchMode:true},pattern:Array.from({length:100},(_,i)=>i===0?thread:{id:'__skip__'}),done:Array(100).fill(0),bsLines:[],partialStitches:[],knots:[],sessions:[],threadOwned:{},specialtyVersion:1,specialtyStitches:[
   {uid:'p',type:'petite',x:0,y:0,thread},{uid:'p2',type:'petite',x:0,y:0,thread},
   {uid:'l',type:'long_stitch',x1:0,y1:10,x2:10,y2:0,thread}
  ],specialtyDone:[]});
  ProjectStorage.setActiveProject('proj_specialty');
 });
});
const read=page=>page.evaluate(()=>window.__specialtyQA.read());
async function tracker(page){await page.goto('/stitch.html?id=proj_specialty');await page.waitForSelector(TRACKER_CANVAS);await page.waitForFunction(()=>window.__specialtyQA?.read().snapshot?.id==='proj_specialty');}

test('Tracker selects overlapping objects separately, marks/unmarks, undo/redo, hides, saves and reloads exact units',async({page})=>{
 await tracker(page);
 expect((await read(page)).progress.totalUnits).toBe(2);
 expect((await read(page)).counts).toMatchObject({full:1,petite:2,long_stitch:1});
 const pt=await page.evaluate(()=>window.__specialtyQA.point(0.25,0.25));
 await page.mouse.click(pt.x,pt.y);expect((await read(page)).snapshot.specialtyDone).toEqual(['p']);
 await page.evaluate(()=>window.__specialtyQA.undo());
 await page.evaluate(()=>window.__specialtyQA.open());
 await page.getByText('Petite and long stitches (3)',{exact:true}).click();
 const group=page.getByRole('group',{name:'Petite and long stitch objects'});
 await group.getByRole('button',{name:'Petite 2 · 310',exact:true}).click();
 await expect(group.getByRole('button',{name:'Petite 2 · 310',exact:true})).toHaveAttribute('aria-pressed','true');
 await group.getByRole('button',{name:'Mark',exact:true}).nth(1).click();
 expect((await read(page)).snapshot.specialtyDone).toEqual(['p2']);
 expect((await read(page)).progress.percent).toBe(12.5);
 await group.getByRole('button',{name:'Unmark',exact:true}).click();
 expect((await read(page)).progress.doneUnits).toBe(0);
 await page.evaluate(()=>window.__specialtyQA.undo());expect((await read(page)).progress.doneUnits).toBe(0.25);
 await page.evaluate(()=>window.__specialtyQA.redo());expect((await read(page)).progress.doneUnits).toBe(0);
 await page.evaluate(()=>{window.__specialtyQA.toggle('p');window.__specialtyQA.toggle('l');});
 expect((await read(page)).progress.doneUnits).toBe(0.75);
 expect((await read(page)).colours['310']).toMatchObject({petiteDone:1,longDone:1});
 await page.evaluate(()=>window.__specialtyQA.hide('petite'));
 await expect(group.getByRole('button',{name:/^Petite/})).toHaveCount(0);
 await page.evaluate(()=>window.__specialtyQA.toggle('p2'));
 expect((await read(page)).snapshot.specialtyDone).toEqual(['p','l']);
 await page.evaluate(()=>window.__specialtyQA.end());
 await page.getByRole('button',{name:'End session',exact:true}).click();
 await page.evaluate(()=>window.__flushProjectToIDB());
 await page.reload();await page.waitForFunction(()=>window.__specialtyQA?.read().snapshot?.id==='proj_specialty');
 expect((await read(page)).progress).toMatchObject({doneUnits:0.75,totalUnits:2,percent:37.5,complete:false});
 expect((await read(page)).snapshot.specialtyStitches.map(o=>o.uid)).toEqual(['p','p2','l']);
 await page.evaluate(()=>window.__flushProjectToIDB());
 const p=await page.evaluate(()=>ProjectStorage.get('proj_specialty'));
 expect(p.statsSessions.reduce((n,s)=>n+(s.unitsCompleted||0),0)).toBe(1);
 expect(p.statsSessions.reduce((n,s)=>n+(s.unitsUndone||0),0)).toBe(0.25);
 expect(p.specialtyDone.sort()).toEqual(['l','p']);
});

test('Creator creates, edits geometry/thread, deletes and undoes objects; native handoff retains marks',async({page})=>{
 await page.goto('/create.html');await page.waitForSelector('.cs-chart-scroll canvas');
 await page.getByRole('button',{name:'More tools',exact:true}).click();
 await page.getByText('Petite and long stitches (3)',{exact:true}).click();
 const panel=page.getByRole('dialog',{name:'More tools'});
 await panel.getByRole('button',{name:'Petite 1 · 310',exact:true}).click();
 await panel.getByLabel('x',{exact:true}).fill('9.5');await panel.getByLabel('y',{exact:true}).fill('9.5');
 await panel.getByRole('button',{name:'Apply object edit'}).click();
 await expect.poll(()=>page.evaluate(()=>window.__specialtyCreator.specialtyStitches[0].x)).toBe(9.5);
 await panel.getByRole('button',{name:'Petite 1 · 310',exact:true}).click();
 await panel.getByRole('button',{name:'Delete object'}).click();
 await expect.poll(()=>page.evaluate(()=>window.__specialtyCreator.specialtyStitches.length)).toBe(2);
 // Use the actual registered keyboard history; the tools popup is dismissed first.
 await page.getByRole('button',{name:'More tools',exact:true}).click();
 await page.keyboard.press('Control+z');
 await expect.poll(()=>page.evaluate(()=>window.__specialtyCreator.specialtyStitches.length)).toBe(3);
 await page.keyboard.press('Control+y');await expect.poll(()=>page.evaluate(()=>window.__specialtyCreator.specialtyStitches.length)).toBe(2);
 await page.keyboard.press('Control+z');
 await page.getByRole('button',{name:'More tools',exact:true}).click();
 await page.getByText('Petite and long stitches (3)',{exact:true}).click();
 await page.evaluate(()=>window.__specialtyCreator.addScratchColour(DMC.find(t=>t.id==='666')));
 await panel.getByRole('button',{name:'New object'}).click();
 await panel.getByRole('combobox',{name:'Thread',exact:true}).selectOption('666');
 await panel.getByLabel('x',{exact:true}).fill('10');
 await panel.getByRole('button',{name:'Add object'}).click();
 await expect(panel.getByRole('alert')).toContainText('valid half-cell coordinates');
 await panel.getByLabel('x',{exact:true}).fill('9');
 await panel.getByRole('button',{name:'Add object'}).click();
 await expect.poll(()=>page.evaluate(()=>window.__specialtyCreator.specialtyStitches.length)).toBe(4);
 await panel.getByRole('combobox',{name:'Type',exact:true}).selectOption('long_stitch');
 await panel.getByRole('combobox',{name:'Thread',exact:true}).selectOption('310');
 await panel.getByLabel('x2',{exact:true}).fill('10');await panel.getByLabel('y2',{exact:true}).fill('10');
 await panel.getByRole('button',{name:'Add object'}).click();
 await expect.poll(()=>page.evaluate(()=>window.__specialtyCreator.specialtyStitches.length)).toBe(5);
 await page.evaluate(()=>window.__flushProjectToIDB());
 const saved=await page.evaluate(()=>ProjectStorage.getActiveProject());expect(saved.specialtyStitches).toHaveLength(5);
 expect(saved.specialtyStitches[3].thread.id).toBe('666');
 await tracker(page);expect((await read(page)).progress.totalUnits).toBe(2.75);
});


test.describe('touch geometry',()=>{
 test.use(device('iPad Mini'));
 test('tapping petite and long geometry respects independent whole-object marks and hidden layers',async({page})=>{
  await tracker(page);
  const pt=await page.evaluate(()=>window.__specialtyQA.point(0.25,0.25));
  await page.touchscreen.tap(pt.x,pt.y);expect((await read(page)).snapshot.specialtyDone).toEqual(['p']);
  const line=await page.evaluate(()=>window.__specialtyQA.point(5,5));
  await page.touchscreen.tap(line.x,line.y);expect((await read(page)).progress.doneUnits).toBe(0.75);
  await page.touchscreen.tap(line.x,line.y);expect((await read(page)).progress.doneUnits).toBe(0.25);
  await page.evaluate(()=>window.__specialtyQA.hide('petite'));
  await page.touchscreen.tap(pt.x,pt.y);expect((await read(page)).snapshot.specialtyDone).toEqual(['p']);
 });
});


test('resize moves stable geometry and marks, and undo/redo restore the same objects',async({page})=>{
 await page.evaluate(async()=>{const p=await ProjectStorage.get('proj_specialty');await ProjectStorage.save({...p,specialtyDone:['p','l']});});
 await page.goto('/create.html');await page.waitForSelector('.cs-chart-scroll canvas');
 await page.getByRole('tab',{name:'Canvas',exact:true}).click();
 await page.getByRole('button',{name:/^Resize canvas/}).click();
 const dialog=page.getByRole('dialog',{name:'Resize canvas',exact:true});
 await dialog.getByLabel('Left',{exact:true}).fill('1');await dialog.getByRole('button',{name:/^Apply resize/}).click();
 await page.getByRole('button',{name:'Back to drawing',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__specialtyCreator.specialtyStitches[0].x)).toBe(1);
 await page.keyboard.press('Control+z');await expect.poll(()=>page.evaluate(()=>window.__specialtyCreator.specialtyStitches[0].x)).toBe(0);
 await page.keyboard.press('Control+y');await expect.poll(()=>page.evaluate(()=>window.__specialtyCreator.specialtyStitches[0].x)).toBe(1);
 await page.evaluate(()=>window.__flushProjectToIDB());
 const p=await page.evaluate(()=>ProjectStorage.getActiveProject());
 expect(p.settings.sW).toBe(11);expect(p.specialtyStitches.map(o=>o.uid)).toEqual(['p','p2','l']);
 expect(p.specialtyStitches[2]).toMatchObject({x1:1,y1:10,x2:11,y2:0});expect(p.specialtyDone).toEqual(['p','l']);
 await tracker(page);expect((await read(page)).progress).toMatchObject({doneUnits:0.75,totalUnits:2});
});

test('old petite-cell project migrates once, preserves marks, and does not count a full cross',async({page})=>{
 await page.evaluate(async()=>{const p=await ProjectStorage.get('proj_specialty');delete p.specialtyVersion;p.specialtyStitches=[];p.pattern[0].type='petite';p.done[0]=1;await ProjectStorage.save(p);});
 await tracker(page);expect((await read(page)).counts).toMatchObject({full:0,petite:1,long_stitch:0});
 expect((await read(page)).progress).toMatchObject({totalUnits:0.25,doneUnits:0.25,percent:100});
 await page.evaluate(()=>window.__flushProjectToIDB());await page.reload();await page.waitForFunction(()=>window.__specialtyQA?.read().snapshot?.id==='proj_specialty');
 expect((await read(page)).snapshot.specialtyStitches).toHaveLength(1);
 expect((await read(page)).snapshot.specialtyStitches[0].uid).toBe('legacy-petite-cell-0');
 expect((await read(page)).progress).toMatchObject({totalUnits:0.25,doneUnits:0.25,percent:100});
});


test('PNG exports both object geometries on cloth, and PDF reports unsupported objects',async({page})=>{
 await page.evaluate(async()=>{const p=await ProjectStorage.get('proj_specialty');p.pattern=p.pattern.map(()=>({id:'__skip__'}));await ProjectStorage.save(p);});
 await page.goto('/create.html');await page.waitForSelector('.cs-chart-scroll canvas');
 await page.evaluate(()=>{window.__specialtyCreator.setTab('materials');window.__specialtyCreator.setMaterialsTab('output');});
 await page.waitForFunction(()=>window.__specialtyPng);
 const pixels=await page.evaluate(async()=>{
  const bitmap=await createImageBitmap(await window.__specialtyPng(20)),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;
  const g=c.getContext('2d');g.drawImage(bitmap,0,0);const at=(x,y)=>Array.from(g.getImageData(x,y,1,1).data);
  return {width:c.width,height:c.height,petite:at(5,5),long:at(100,100),cloth:at(60,60)};
 });
 expect(pixels).toMatchObject({width:200,height:200,cloth:[255,255,255,255]});
 expect(pixels.petite[0]).toBeLessThan(128);expect(pixels.long[0]).toBeLessThan(128);
 await page.getByRole('button',{name:'Export PDF',exact:true}).click();
 await expect(page.getByText(/PDF export does not support petite or long stitches/)).toBeVisible();
});
