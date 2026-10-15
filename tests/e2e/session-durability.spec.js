/* QA-10 / QA-14. Page.crash is intentional: page.close can dispatch pagehide. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { loadTrackerFixture, trackerCellPoint, TRACKER_CANVAS } = require('./touch-helpers');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });
async function init(page) {
  await loadTrackerFixture(page);
  return page.evaluate(() => localStorage.getItem('crossstitch_active_project'));
}
async function marks(page) {
  for(let x=2;x<5;x++){const p=await trackerCellPoint(page,x,3);await page.mouse.click(p.x,p.y);await page.waitForTimeout(180);}
}
async function sessions(page,id) {
  return page.evaluate(async id=>{await window.__flushProjectToIDB();return (await ProjectStorage.get(id)).statsSessions||[];},id);
}
async function open(page,id) {
  await page.goto('/stitch.html?id='+id); await page.waitForSelector(TRACKER_CANVAS);await page.waitForTimeout(600);
}
async function start(page) {
  await page.getByRole('button',{name:'More',exact:true}).click();
  await page.getByRole('button',{name:'Session',exact:true}).click();
  await page.getByRole('button',{name:'Start timer',exact:true}).first().click();
}
async function crash(page,context,id,flush=true) {
  // Assert a committed checkpoint before killing the renderer; no lifecycle handler can save afterwards.
  if(flush)await page.evaluate(()=>window.__flushProjectToIDB());
  const row=await page.evaluate(async id=>{
    const db=await getDB();return new Promise(resolve=>{const r=db.transaction('pendingImports').objectStore('pendingImports').getAll();r.onsuccess=()=>resolve(r.result.filter(r=>r.projectId===id&&r.sessionId&&!r.closed));});
  },id);
  expect(row).toHaveLength(1);
  const cdp=await context.newCDPSession(page); const crashed=page.waitForEvent('crash');
  cdp.send('Page.crash').catch(()=>{}); await crashed;
  await page.close().catch(()=>{});
  const next=await context.newPage();await open(next,id);return {next,row:row[0]};
}

test('60-second explicit timer without marks can be saved through the dialog',async({page})=>{
  const id=await init(page);await start(page);
  await page.evaluate(()=>{const real=Date.now;Date.now=()=>real()+60000;});
  await page.waitForTimeout(1100);await page.locator('.info-strip-timer').click();
  await page.getByRole('button',{name:'Stop timer',exact:true}).click();
  await page.getByRole('button',{name:'Save session',exact:true}).click();
  const s=await sessions(page,id);expect(s).toHaveLength(1);expect(s[0].durationSeconds).toBeGreaterThanOrEqual(60);expect(s[0].durationSeconds).toBeLessThan(65);expect(s[0].unitsCompleted).toBe(0);
});

test('actual renderer crash recovers three stitches once and excludes downtime',async({page,context})=>{
  const id=await init(page);await marks(page);
  const {next,row}=await crash(page,context,id);
  let s=await sessions(next,id);expect(s).toHaveLength(row.records.length);
  expect(s.reduce((n,s)=>n+s.unitsCompleted,0)).toBe(3);
  expect(s.reduce((n,s)=>n+s.durationSeconds,0)).toBe(row.records.reduce((n,s)=>n+s.durationSeconds,0));
  expect(await next.evaluate(async id=>(await ProjectStorage.get(id)).done.filter(v=>v===1).length,id)).toBe(3);
  const before=s;for(let i=0;i<2;i++){await next.reload();await next.waitForSelector(TRACKER_CANVAS);await next.waitForTimeout(400);s=await sessions(next,id);expect(s).toEqual(before);}
});

test('other live tab does not recover the active owner; crash releases its lock',async({page,context})=>{
  const id=await init(page);await marks(page);await page.evaluate(()=>window.__flushProjectToIDB());
  const other=await context.newPage();await other.goto('/home.html');await other.waitForFunction(()=>window.ProjectStorage);
  const read=()=>other.evaluate(async id=>(await ProjectStorage.get(id)).sessionCheckpoints,id);
  expect(await read()).toEqual([]);
  const cdp=await context.newCDPSession(page);const ev=page.waitForEvent('crash');cdp.send('Page.crash').catch(()=>{});await ev;
  await expect.poll(read).toHaveLength(1);
});

test('checkpoint failure gives feedback and retries without claiming success',async({page})=>{
  await init(page);await page.evaluate(()=>{ProjectStorage.saveSessionCheckpoint=()=>Promise.reject(new Error('Quota test'));});
  await marks(page);await expect(page.getByText(/Session recovery could not be saved/)).toBeVisible();
});

for(const leave of ['reload','close','hidden'])test(`${leave} keeps session records exactly once`,async({page,context})=>{
  const id=await init(page);await marks(page);await page.evaluate(()=>window.__flushProjectToIDB());
  if(leave==='hidden')await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  if(leave==='close'){await page.close();page=await context.newPage();await open(page,id);}
  else{await page.reload();await page.waitForSelector(TRACKER_CANVAS);await page.waitForTimeout(600);}
  const first=await sessions(page,id);expect(first.reduce((n,s)=>n+s.unitsCompleted,0)).toBe(3);
  await page.reload();await page.waitForSelector(TRACKER_CANVAS);await page.waitForTimeout(600);expect(await sessions(page,id)).toEqual(first);
});

test('timer-only periodic checkpoint recovers without a finalisation or full project flush',async({page,context})=>{
  const id=await init(page);await page.waitForTimeout(5500);await start(page);
  await page.evaluate(()=>{const real=Date.now;Date.now=()=>real()+60000;
    window.__timerFullSaves=0;const save=ProjectStorage.save.bind(ProjectStorage);
    ProjectStorage.save=(...args)=>{window.__timerFullSaves++;return save(...args);};
  });
  await page.waitForTimeout(5500);
  expect(await page.evaluate(()=>window.__timerFullSaves)).toBe(0);
  const {next,row}=await crash(page,context,id,false);
  const s=await sessions(next,id);expect(s).toHaveLength(1);
  expect(s[0].durationSeconds).toBe(row.records[0].durationSeconds);
  expect(s[0].durationSeconds).toBeGreaterThanOrEqual(60);expect(s[0].stitchesCompleted).toBe(0);
});

test('explicit timer pause/resume and hidden intervals preserve active elapsed time',async({page})=>{
  const id=await init(page);await start(page);
  await page.evaluate(()=>{const real=Date.now;window.__timeOffset=60000;Date.now=()=>real()+window.__timeOffset;});
  await page.locator('.info-strip-timer').click();
  await page.getByRole('button',{name:'Pause session',exact:true}).click();
  await page.evaluate(()=>{window.__timeOffset+=120000;});
  await page.getByRole('button',{name:'Resume session',exact:true}).click();
  await page.evaluate(()=>{window.__timeOffset+=60000;Object.defineProperty(document,'hidden',{configurable:true,value:true});Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));window.__timeOffset+=120000;});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
  await page.getByRole('button',{name:'Stop timer',exact:true}).click();
  await page.getByRole('button',{name:'Save session',exact:true}).click();
  const s=await sessions(page,id);expect(s).toHaveLength(1);expect(Math.abs(s[0].durationSeconds-120)).toBeLessThan(5);
});
