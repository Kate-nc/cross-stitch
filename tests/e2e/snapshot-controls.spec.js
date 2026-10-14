const {test,expect}=require('@playwright/test');
const {loadTrackerFixture,trackerCellPoint,TRACKER_CANVAS}=require('./touch-helpers');
const {installLocalCdn}=require('./local-cdn');
test.beforeEach(async({context,page})=>{
  await installLocalCdn(context);
  await page.addInitScript(()=>{
    const Real=Date;window.__off=0;
    window.Date=class extends Real{constructor(...a){super(...(a.length?a:[Real.now()+window.__off]));}static now(){return Real.now()+window.__off;}};
  });
});
const mark=async(page,x)=>{const p=await trackerCellPoint(page,x,3);await page.mouse.click(p.x,p.y);await page.waitForTimeout(300);};
const saved=page=>page.evaluate(async()=>{await window.__flushProjectToIDB();return ProjectStorage.get(localStorage.getItem('crossstitch_active_project'));});
const compare=async page=>{
  await page.evaluate(()=>window.__openTrackerStats());
  await page.getByRole('tab',{name:'Visuals',exact:true}).click();
};

test('opt-in baseline, queued off/on cancellation, manual save, both deletions and reload',async({page})=>{
  test.setTimeout(120000); // This flow includes marking, confirmation dialogs and a full Tracker reload.
  await loadTrackerFixture(page);
  await mark(page,3);
  await page.evaluate(()=>{window.__off=3*86400000;});
  await mark(page,4);
  expect((await saved(page)).doneSnapshots||[]).toEqual([]);
  await page.evaluate(()=>{
    UserPrefs.set('trackerAutomaticSnapshots',true);
    window.__idle=[];window.requestIdleCallback=fn=>{window.__idle.push(fn);return window.__idle.length;};
  });
  await mark(page,5); // baseline: no backfill
  expect(await page.evaluate(()=>window.__idle.length)).toBe(0);
  await page.evaluate(()=>{window.__off+=86400000;});
  await mark(page,6);
  expect(await page.evaluate(()=>window.__idle.length)).toBe(1);
  await page.evaluate(()=>{
    UserPrefs.set('trackerAutomaticSnapshots',false);UserPrefs.set('trackerAutomaticSnapshots',true);
    window.__idle.splice(0).forEach(fn=>fn());
  });
  expect((await saved(page)).doneSnapshots||[]).toEqual([]);
  await page.evaluate(()=>{window.__off+=86400000;});
  await mark(page,7);
  await page.evaluate(()=>window.__idle.splice(0).forEach(fn=>fn()));
  await expect.poll(async()=>((await saved(page)).doneSnapshots||[]).length).toBe(1);
  await page.evaluate(()=>UserPrefs.set('trackerAutomaticSnapshots',false));
  await compare(page);
  await page.getByRole('textbox',{name:'Snapshot label',exact:true}).fill('Manual milestone');
  await page.getByRole('button',{name:'Save snapshot',exact:true}).click();
  let project=await saved(page);expect(project.doneSnapshots).toHaveLength(2);
  page.once('dialog',d=>d.dismiss());
  await page.getByRole('button',{name:'Delete all automatic snapshots',exact:true}).click();
  expect((await saved(page)).doneSnapshots).toHaveLength(2);
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Delete all automatic snapshots',exact:true}).click();
  await expect.poll(async()=>((await saved(page)).doneSnapshots||[]).length).toBe(1);
  project=await saved(page);expect(project.doneSnapshots[0].label).toBe('Manual milestone');expect(project.deletedSnapshotIds).toHaveLength(1);
  await page.reload();await page.waitForSelector(TRACKER_CANVAS);await page.waitForTimeout(800);
  const recap=page.locator('.resume-recap-overlay');if(await recap.count())await recap.getByRole('button',{name:/continue/i}).click();
  await compare(page);
  const selection=page.getByRole('combobox',{name:'Snapshot to compare with'});
  await selection.selectOption(project.doneSnapshots[0].id);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete snapshot',exact:true}).click();
  await expect(selection).toHaveValue('');await expect.poll(async()=>((await saved(page)).doneSnapshots||[]).length).toBe(0);
  project=await saved(page);expect(project.deletedSnapshotIds).toHaveLength(2);expect(project.done.filter(Boolean)).toHaveLength(5);
});

test('existing history survives default off and another project is read-only',async({page})=>{
  await loadTrackerFixture(page);
  const id=await page.evaluate(async()=>{
    await window.__flushProjectToIDB();
    const p=await ProjectStorage.get(localStorage.getItem('crossstitch_active_project'));
    const data=btoa(String.fromCharCode(...pako.deflate(new Uint8Array(p.done))));
    p.doneSnapshots=[{id:'legacy_auto',label:'auto',date:'2026-10-01',data,w:60,h:60},{id:'recovery',label:'Before pattern change',date:'2026-10-01',data,w:60,h:60}];
    p.statsSessions=[{id:'old',date:'2026-10-01',netStitches:1,durationSeconds:60}];
    p.done[0]=1;p.id='proj_readonly';p.name='Read-only history';delete p.lastWriteAt;
    await ProjectStorage.save(p);return p.id;
  });
  expect(await page.evaluate(()=>UserPrefs.get('trackerAutomaticSnapshots'))).toBe(false);
  await page.evaluate(id=>window.__openTrackerStats(id),id);
  await page.getByRole('tab',{name:'Visuals',exact:true}).click();
  const selection=page.getByRole('combobox',{name:'Snapshot to compare with'});
  await selection.selectOption('legacy_auto');
  await expect(page.getByRole('button',{name:'Delete snapshot',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Delete all automatic snapshots',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Save snapshot',exact:true})).toBeDisabled();
  const history=await page.evaluate(async id=>(await ProjectStorage.get(id)).doneSnapshots,id);
  expect(history.map(s=>s.id)).toEqual(['legacy_auto','recovery']);
});
