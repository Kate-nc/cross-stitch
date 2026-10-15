const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS, trackerCellPoint } = require('./touch-helpers');
test.use({timezoneId:'UTC'});

// Expose existing handlers in the served test copy only, to exercise several calls in a single React batch.
// No test bridge or persistent history is shipped in the application.
test.beforeEach(async ({ context, page }) => {
  page.on('pageerror', e => console.error('Tracker page error:',e.message));
  await installLocalCdn(context);
  await context.route('**/compiled/tracker-app.compiled.js*', async route => {
    const response = await route.fetch();
    const original=await response.text();
    if(!original.includes('function toggleKnotDone(k){'))throw new Error('Missing test bridge anchor');
    const body = original.replace('function toggleKnotDone(k){',
      'window.__qaTrack={half:_toggleHalfDone,quarter:toggleQuarterDone,knot:toggleKnotDone,bulk:_commitBulk,colour:markColourDone,unpick:unpickArea,bs:toggleBsLine,progress:writeProgressNow,undo:undoTrack,redo:redoTrack,load:processLoadedProject,openSession:()=>{setLeftSidebarTab("session");setMorePanelOpen(true);},read:()=>({snapshot:snapshotNow(),counts:colourDoneCountsRef.current,full:doneCountRef.current,undo:trackHistoryRef.current.length,redo:redoStackRef.current.length,active:!!currentAutoSessionRef.current})};function toggleKnotDone(k){');
    await route.fulfill({ response, body });
  });
  await page.addInitScript(() => {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker','creator','manager','home'].forEach(k => localStorage.setItem('cs_welcome_'+k+'_done','1'));
    localStorage.setItem('cs_sessionOnboardingDone','1');
    localStorage.setItem('cs_pref_trackerResumeRecap','false');
    ['firstStitch_tracker','rectSelect_tracker','firstStitch_creator','import','undo','progress','save'].forEach(k=>localStorage.setItem('cs_pref_onboarding.coached.'+k,'true'));
  });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  await page.evaluate(async () => {
    const side = { id:'310', type:'solid', rgb:[0,0,0] };
    const pattern = Array.from({length:120},(_,i)=>i===14||i===15?{id:'__skip__'}:side);
    await ProjectStorage.save({ id:'proj_history', name:'History review', settings:{sW:12,sH:10,fabricCt:14}, pattern, done:Array(120).fill(0),
      halfStitches:[[14,{fwd:side,bck:{...side,id:'550'}}]], partialStitches:[[15,{TL:side}]], knots:[{x:8,y:8,...side}], bsLines:[{x1:8,y1:8,x2:9,y2:8,colorId:'310'}],
      originalPaletteState:[{...side,name:'Black',symbol:'A',count:118}], statsSessions:[], savedZoom:2 });
  });
  await page.goto('/stitch.html?id=proj_history');
  await page.waitForSelector(TRACKER_CANVAS);
  await expect.poll(()=>page.evaluate(()=>({bridge:!!window.__qaTrack,id:window.__qaTrack?.read().snapshot?.id}))).toEqual({bridge:true,id:'proj_history'});
  await expect.poll(()=>page.evaluate(()=>window.__qaTrack.read().full)).toBe(0);
});

async function endAndSave(page) {
  await page.evaluate(()=>window.__qaTrack.openSession());
  await page.getByRole('button',{name:'End session',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__qaTrack.read().active)).toBe(false);
  await page.evaluate(()=>window.__flushProjectToIDB());
  return page.evaluate(async()=>await ProjectStorage.get('proj_history'));
}

test('QA-05: half is the latest action; counts, redo invalidation and saved marks agree', async ({page}) => {
  await page.evaluate(()=>{const q=window.__qaTrack;q.bulk(new Set([0]),'mark','drag');q.half(14,'fwd');q.half(14,'bck');q.undo();});
  const r=await page.evaluate(()=>window.__qaTrack.read());
  expect(r.full).toBe(1); expect(r.counts['310'].halfDone).toBe(1); expect(r.counts['550'].halfDone).toBe(0);
  await page.evaluate(()=>{const q=window.__qaTrack;q.redo();q.undo();q.half(14,'fwd');});
  expect((await page.evaluate(()=>window.__qaTrack.read())).redo).toBe(0);
  const p=await endAndSave(page);
  expect(p.done[0]).toBe(1); expect(p.halfDone||[]).toEqual([]);
  expect(p.statsSessions[0]).toMatchObject({unitsCompleted:1.5,unitsUndone:0.5,units:1});
});

test('QA-13: one click then repeated keyboard Undo/Redo, End session and reload saves one addition', async ({page}) => {
  const p=await trackerCellPoint(page,2,2);await page.mouse.click(p.x,p.y);
  await expect.poll(()=>page.evaluate(()=>window.__qaTrack.read().full)).toBe(1);
  for(let i=0;i<4;i++){await page.keyboard.press('Control+z');await page.keyboard.press('Control+Shift+z');}
  const saved=await endAndSave(page);
  expect(saved.statsSessions).toHaveLength(1);
  expect(saved.statsSessions[0]).toMatchObject({unitsCompleted:1,unitsUndone:0,units:1});
  await page.reload();await page.waitForFunction(()=>window.__qaTrack?.read().snapshot?.id==='proj_history');
  const reloaded=await page.evaluate(()=>window.__qaTrack.read());
  expect(reloaded.full).toBe(1);expect(reloaded.undo).toBe(0);expect(reloaded.redo).toBe(0);
  expect(reloaded.snapshot.statsSessions[0].unitsCompleted).toBe(1);
});

test('mixed rapid full/half/quarter/knot/backstitch and physical unpick restore exact chart and contributions',async({page})=>{
  const progress=await page.evaluate(async()=>{
    const q=window.__qaTrack;q.bulk(new Set([0,1]),'mark','drag');q.half(14,'fwd');q.quarter({idx:15,pos:'TL',id:'310'});q.knot({x:8,y:8,id:'310'});q.bs(0);
    for(let n=0;n<6;n++)q.undo();for(let n=0;n<6;n++)q.redo();
    q.unpick(new Set(Array.from({length:120},(_,i)=>i)));q.undo();q.redo();q.undo();
    // Capture and await the actual small-record transaction, started before this batch can render.
    const original=ProjectStorage.saveProgress;let pending;
    ProjectStorage.saveProgress=function(...args){return pending=original.apply(ProjectStorage,args);};
    try{q.progress();}finally{ProjectStorage.saveProgress=original;}
    if(!pending)throw new Error('The small progress write did not start');
    await pending;
    return await ProjectStorage.get('proj_history');
  });
  expect(progress.done.reduce((a,b)=>a+b,0)).toBe(2);
  expect(progress.halfDone).toEqual([[14,{fwd:1}]]);
  expect(progress.partialDone).toEqual([[15,['TL']]]);
  expect(progress.knotsDone).toEqual(['8,8']);expect(progress.bsDone).toHaveLength(1);
  const saved=await endAndSave(page);
  expect(saved.done.reduce((a,b)=>a+b,0)).toBe(2);
  expect(saved.halfDone).toEqual([[14,{fwd:1}]]);expect(saved.partialDone).toEqual([[15,['TL']]]);expect(saved.knotsDone).toEqual(['8,8']);expect(saved.bsDone).toHaveLength(1);
  expect(saved.statsSessions[0]).toMatchObject({unitsCompleted:3.75,unitsUndone:0,units:3.75});
  await page.reload();
  await page.waitForFunction(()=>window.__qaTrack?.read().snapshot?.id==='proj_history');
  await expect.poll(()=>page.evaluate(()=>window.__qaTrack.read().full)).toBe(2);
  const reloaded=await page.evaluate(()=>window.__qaTrack.read());
  expect(reloaded.snapshot.halfDone).toEqual(saved.halfDone);
  expect(reloaded.snapshot.partialDone).toEqual(saved.partialDone);
  expect(reloaded.snapshot.knotsDone).toEqual(saved.knotsDone);
  expect(reloaded.snapshot.bsDone).toEqual(saved.bsDone);
  expect(reloaded.snapshot.statsSessions[0]).toMatchObject({unitsCompleted:3.75,unitsUndone:0,units:3.75});
  expect(reloaded.undo).toBe(0);expect(reloaded.redo).toBe(0);
});

test('bulk colour catch-up survives history, finalised corrections and a later session',async({page})=>{
  await page.evaluate(()=>{const q=window.__qaTrack;q.colour('310',true,true);q.undo();q.redo();});
  let p=await endAndSave(page);
  expect(p.statsSessions[0]).toMatchObject({unitsCompleted:118,catchUp:118,unitsUndone:0});
  await page.evaluate(()=>window.__qaTrack.undo());
  await page.evaluate(()=>window.__flushProjectToIDB());
  p=await page.evaluate(()=>ProjectStorage.get('proj_history'));
  expect(p.statsSessions[0]).toMatchObject({unitsCompleted:0,catchUp:0,units:0});
  await page.evaluate(()=>{const q=window.__qaTrack;q.redo();q.half(14,'fwd');});
  p=await endAndSave(page);
  expect(p.statsSessions.map(s=>s.unitsCompleted)).toEqual([118,0.5]);
});

test('history across midnight stays with the original day, including after End session',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-10-15T23:59:00Z'));
  await page.evaluate(()=>window.__qaTrack.bulk(new Set([0]),'mark','drag'));
  await page.clock.setFixedTime(new Date('2026-10-16T00:01:00Z'));
  await page.evaluate(()=>{const q=window.__qaTrack;q.half(14,'fwd');q.undo();q.undo();q.redo();q.redo();});
  let p=await endAndSave(page);
  expect(p.statsSessions.map(s=>[s.date,s.unitsCompleted,s.unitsUndone])).toEqual([['2026-10-15',1,0],['2026-10-16',0.5,0]]);
  await page.clock.setFixedTime(new Date('2026-10-17T12:00:00Z'));
  await page.evaluate(()=>{const q=window.__qaTrack;q.undo();q.undo();q.redo();q.redo();});
  expect(await page.evaluate(()=>window.__qaTrack.read().active)).toBe(false);
  await page.evaluate(()=>window.__flushProjectToIDB());
  p=await page.evaluate(()=>ProjectStorage.get('proj_history'));
  expect(p.statsSessions.map(s=>[s.date,s.unitsCompleted,s.unitsUndone])).toEqual([['2026-10-15',1,0],['2026-10-16',0.5,0]]);
});

test('physical unpick remains unpicked work; restoring it after finalisation never adds stitches',async({page})=>{
  await page.evaluate(()=>{const q=window.__qaTrack;q.bulk(new Set([0]),'mark','drag');q.half(14,'fwd');q.unpick(new Set(Array.from({length:120},(_,i)=>i)));});
  let p=await endAndSave(page);
  expect(p.statsSessions[0]).toMatchObject({unitsCompleted:1.5,unitsUndone:1.5,units:0});
  await page.evaluate(()=>{const q=window.__qaTrack;q.undo();q.redo();q.undo();});
  expect(await page.evaluate(()=>window.__qaTrack.read().active)).toBe(false);
  await page.evaluate(()=>window.__flushProjectToIDB());
  p=await page.evaluate(()=>ProjectStorage.get('proj_history'));
  expect(p.statsSessions[0]).toMatchObject({unitsCompleted:1.5,unitsUndone:0,units:1.5});
  expect(p.done[0]).toBe(1);expect(p.halfDone).toEqual([[14,{fwd:1}]]);
});

test('in-page project load clears both stacks and cannot transfer contribution to another project',async({page})=>{
  await page.evaluate(()=>window.__qaTrack.half(14,'fwd'));
  await endAndSave(page);
  await page.evaluate(async()=>{
    const p=await ProjectStorage.get('proj_history');
    const other={...p,id:'proj_history_other',name:'Other history',statsSessions:[],halfDone:[],done:Array(120).fill(0)};
    await ProjectStorage.save(other);window.__qaTrack.load(other);
  });
  await expect.poll(()=>page.evaluate(()=>window.__qaTrack.read().snapshot.id)).toBe('proj_history_other');
  await page.evaluate(()=>{window.__qaTrack.undo();window.__qaTrack.redo();});
  const r=await page.evaluate(()=>window.__qaTrack.read());
  expect(r.undo).toBe(0);expect(r.redo).toBe(0);expect(r.snapshot.statsSessions).toEqual([]);expect(r.snapshot.halfDone).toEqual([]);
  await page.evaluate(()=>window.__flushProjectToIDB());
  expect(await page.evaluate(async()=>(await ProjectStorage.get('proj_history')).statsSessions[0].unitsCompleted)).toBe(0.5);
});
