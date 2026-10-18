const {test,expect}=require('@playwright/test');
const path=require('path');
const {installLocalCdn}=require('./local-cdn');
const {quietOnboarding,skipTourIfShown,clickGenerate,waitForEdit,generateLogo,zoomUntilScrollable,pickDarkSwatch,undoButton}=require('./creator-helpers');
const {dispatchTouchSequence}=require('./touch-helpers');

test.beforeEach(async({page,context})=>{
 await installLocalCdn(context); await quietOnboarding(page);
 // Observe the real hook in tests, without adding a production debug interface.
 await page.addInitScript(()=>{
  let hook;
  Object.defineProperty(window,'useCreatorState',{configurable:true,get:()=>hook,set:fn=>{
   hook=function(){const state=fn();window.__tabletState=state;return state;};
  }});
 });
});
const ids=page=>page.evaluate(()=>window.__tabletState.pat.map(c=>c.id));
async function dispatch(page,type,opts={}){
 await page.locator('.cs-chart-scroll canvas').first().evaluate((canvas,{type,opts})=>{
  const s=window.__tabletState,r=canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:71,pointerType:'pen',button:0,buttons:type==='pointerup'?0:1,
   clientX:r.left+s.G+s.cs*1.5,clientY:r.top+s.G+s.cs*1.5,...opts}));
 },{type,opts});
}
async function enablePenNavigation(page){
 await page.getByRole('button',{name:'More tools',exact:true}).click();
 await page.getByRole('checkbox',{name:'Pen draws; fingers navigate'}).check();
 await page.getByRole('button',{name:'More tools',exact:true}).click();
}

test('exact PNG import previews native pixels, alpha and remapping before generating',async({page})=>{
 await page.goto('/home.html?tab=create'); await skipTourIfShown(page);
 await page.locator('input.home-create-file-input').setInputFiles(path.join(__dirname,'../fixtures/pixel-art-alpha.png'));
 await page.waitForURL(/create\.html/); await skipTourIfShown(page);
 const settings = page.locator('.rpanel-drawer-header');
 if(await settings.isVisible() && await settings.getAttribute('aria-expanded')==='false') await settings.click();
 await page.getByRole('checkbox',{name:'Exact pixel-art import',exact:true}).check();
 if(await settings.isVisible() && await settings.getAttribute('aria-expanded')==='true') await settings.click();
 await expect.poll(()=>page.evaluate(()=>[window.__tabletState.sW,window.__tabletState.sH])).toEqual([9,7]);
 await expect(page.getByText('Source colours mapped to threads', {exact:false})).toBeVisible();
 await page.getByText('Source colours mapped to threads',{exact:false}).click();
 await expect(page.getByRole('columnheader',{name:'Source RGB'})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.__tabletState.previewStats?.stitchable)).toBe(49);
 const before=await page.evaluate(()=>({ids:window.__tabletState.previewMapped.map(c=>c.id),url:window.__tabletState.previewUrl}));
 const alpha=await page.evaluate(async url=>{const i=new Image();i.src=url;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);const d=x.getImageData(0,0,i.width,i.height).data;return [i.width,i.height,d[3],d[11],d[35]];},before.url);
 expect(alpha).toEqual([9,7,0,255,255]);
 await clickGenerate(page);await waitForEdit(page);
 expect(await ids(page)).toEqual(before.ids);
 expect(await page.evaluate(()=>window.__tabletState.pal.some(p=>p.count===1))).toBe(true);
});

test('finger navigation, mixed contact, pen cancellation and undo use the existing history',async({page})=>{
 await generateLogo(page);await page.getByRole('button',{name:'Paint tool',exact:true}).click();await pickDarkSwatch(page);
 await enablePenNavigation(page);
 const box=await zoomUntilScrollable(page), before=await ids(page);
 const b=await box.boundingBox(),x=b.x+b.width*.6,y=b.y+b.height*.6;
 await dispatchTouchSequence(page,[{type:'touchStart',touchPoints:[{id:1,x,y}]},{type:'touchMove',touchPoints:[{id:1,x:x-60,y:y-30}]},{type:'touchEnd',touchPoints:[]}]);
 expect(await ids(page)).toEqual(before);await expect(undoButton(page)).toBeDisabled();
 const zoomBefore=await page.evaluate(()=>window.__tabletState.zoom);
 await dispatchTouchSequence(page,[
  {type:'touchStart',touchPoints:[{id:1,x:x-30,y},{id:2,x:x+30,y}]},
  {type:'touchMove',touchPoints:[{id:1,x:x-50,y},{id:2,x:x+50,y}]},
  {type:'touchEnd',touchPoints:[]}
 ]);
 await expect.poll(()=>page.evaluate(()=>window.__tabletState.zoom)).toBeGreaterThan(zoomBefore);
 await expect.poll(()=>page.locator('.cs-chart-scroll canvas').first().evaluate(el=>el.style.transform)).toBe('');
 expect(await ids(page)).toEqual(before);await expect(undoButton(page)).toBeDisabled();
 await dispatch(page,'pointerdown'); await dispatch(page,'pointercancel');
 await expect(undoButton(page)).toBeEnabled();
 await undoButton(page).click();expect(await ids(page)).toEqual(before);
 await dispatch(page,'pointerdown');
 await dispatch(page,'pointerdown',{pointerId:72,pointerType:'touch'});
 await dispatch(page,'pointerup',{pointerId:72,pointerType:'touch'});
 await dispatch(page,'pointermove');await dispatch(page,'pointerup');
 expect(await ids(page)).toEqual(before);await expect(undoButton(page)).toBeDisabled();
});

test('resize interrupts capture; zoomed mouse edge drawing targets the same cell and undoes',async({page})=>{
 await generateLogo(page);await page.getByRole('button',{name:'Paint tool',exact:true}).click();await pickDarkSwatch(page);
 await zoomUntilScrollable(page);
 const before=await ids(page);
 await dispatch(page,'pointerdown');
 await page.setViewportSize({width:1024,height:768});
 await expect.poll(()=>page.evaluate(()=>window.__tabletState.editHistory.length)).toBe(1);
 await undoButton(page).click();expect(await ids(page)).toEqual(before);
 await dispatch(page,'pointerup'); // late release cannot commit twice
 await page.setViewportSize({width:768,height:1024});
 // Scroll to the right/bottom at high zoom and paint just inside the last cell.
 await page.evaluate(()=>window.__tabletState.setZoom(3));
 await expect.poll(()=>page.evaluate(()=>window.__tabletState.cs)).toBe(60);
 const canvas=page.locator('.cs-chart-scroll canvas').first();
 await page.locator('.cs-chart-scroll').evaluate(el=>{el.scrollLeft=el.scrollWidth;el.scrollTop=el.scrollHeight;});
 const pt=await canvas.evaluate(el=>{const s=window.__tabletState,r=el.getBoundingClientRect();return{x:r.left+s.G+s.sW*s.cs-2,y:r.top+s.G+s.sH*s.cs-2,idx:s.sW*s.sH-1};});
 await page.mouse.click(pt.x,pt.y);
 const after=await ids(page);expect(after[pt.idx]).not.toBe(before[pt.idx]);
 expect(after.filter((id,i)=>id!==before[i])).toHaveLength(1);
 await undoButton(page).click();expect(await ids(page)).toEqual(before);
});

test('trusted mouse capture can be lost mid-stroke and drawing recovers after undo',async({page})=>{
 await generateLogo(page);await page.getByRole('button',{name:'Paint tool',exact:true}).click();await pickDarkSwatch(page);
 const before=await ids(page),canvas=page.locator('.cs-chart-scroll canvas').first();
 const pt=await canvas.evaluate(el=>{const s=window.__tabletState,r=el.getBoundingClientRect();
  const idx=s.pat.findIndex(c=>c.id!==s.selectedColorId),x=idx%s.sW,y=Math.floor(idx/s.sW);
  el.addEventListener('gotpointercapture',e=>{window.__captureId=e.pointerId;});
  return{x:r.left+s.G+(x+.5)*s.cs,y:r.top+s.G+(y+.5)*s.cs};});
 await page.mouse.move(pt.x,pt.y);await page.mouse.down();
 await page.mouse.move(pt.x+1,pt.y);
 await expect.poll(()=>canvas.evaluate(el=>el.hasPointerCapture(window.__captureId))).toBe(true);
 await canvas.evaluate(el=>el.releasePointerCapture(window.__captureId));
 await page.mouse.move(pt.x+2,pt.y);
 await expect.poll(()=>page.evaluate(()=>window.__tabletState.editHistory.length)).toBe(1);
 await page.mouse.up();
 await expect.poll(()=>canvas.evaluate(el=>el.hasPointerCapture(window.__captureId))).toBe(false);
 await undoButton(page).click();expect(await ids(page)).toEqual(before);
 await page.mouse.click(pt.x,pt.y);
 await expect(undoButton(page)).toBeEnabled();
 await undoButton(page).click();expect(await ids(page)).toEqual(before);
});
