// Real browser geometry, canvas pixels and interactions: source assertions cannot catch these regressions.
const { test, expect, chromium } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');

test.use({video:'off',actionTimeout:15000,navigationTimeout:30000});
const sizes = [{name:'desktop',width:1440,height:1000},{name:'tablet',width:768,height:1024},{name:'phone',width:390,height:844},{name:'narrow-phone',width:320,height:740},{name:'zoom-200',width:1440,height:1000,zoom:2}];
test.beforeEach(async ({context,page}) => {
  await installLocalCdn(context);
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.addInitScript(() => {
    ['tracker','creator','manager','home'].forEach(k => localStorage.setItem('cs_welcome_'+k+'_done','1'));
    localStorage.setItem('cs_sessionOnboardingDone','1');sessionStorage.setItem('cs_eviction_warned','1');
    localStorage.setItem('cs_stitchStyle','block');
  });
});
async function seed(page, kind) {
  await page.goto('/home.html', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.ProjectStorage);
  await page.evaluate(async kind => {
    const long = 'Long project, thread and section label without clipping '+ 'W'.repeat(90);
    const w = kind === 'populated' ? 400 : 12, h = kind === 'populated' ? 200 : 8;
    const pattern = Array.from({length:w*h},(_,i)=>({id:i%2?'310':'321',type:'solid'}));
    const done = pattern.map((_,i)=>i%3===0?1:0);
    const day = n => {const d=new Date();d.setDate(d.getDate()-n);return formatYMD(d);};
    const statsSessions = kind === 'empty' ? [] : Array.from({length:kind==='sparse'?1:40},(_,i)=>({id:'s'+i,date:day(40-i),startTime:day(40-i)+'T19:00:00',endTime:day(40-i)+'T20:00:00',durationSeconds:3600,stitchesCompleted:20,unitsCompleted:20,unitsUndone:0,units:20,netStitches:20,totalAtEnd:(i+1)*20,coloursWorked:['310','321'],note:long}));
    window.__statsFixture={long,w,h,pattern,done,statsSessions,kind};
    if(kind!=='empty') {
      for(let i=0;i<3;i++) await ProjectStorage.save({id:'proj_stats_sizing'+i,name:long+i,settings:{sW:w,sH:h,fabricCt:14},pattern,done,statsSessions,stitchLog:statsSessions.map(s=>({date:s.date,count:20})),createdAt:'2025-0'+(i+1)+'-01T12:00:00Z',palette:[{id:'310',name:long,rgb:[0,0,0]},{id:'321',name:long,rgb:[199,43,59]}],statsSettings:{sectionLabels:{'0,0':long}}});
      ProjectStorage.setActiveProject('proj_stats_sizing0');
      const db=await openManagerDB();
      await new Promise((res,rej)=>{const tx=db.transaction('manager_state','readwrite');const st=tx.objectStore('manager_state');st.put({'dmc:310':{owned:10,addedAt:'2025-01-01'},'dmc:321':{owned:5,addedAt:'2026-01-01'}},'threads');st.put([{id:'lib1',title:long,designer:long,status:'wishlist',threads:[{id:'310',brand:'dmc',skeins:1}]}],'patterns');tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();
    }
    const keys=['sableIndex','stashComposition','dmcCoverage','useWhatYouHave','buyingImpact','duplicateRisk','stashAge','mostUsedColours','threadsNeverUsed','colourFingerprint','designerLeaderboard','brandAlignment','quarterPortfolio','difficultyVsCompletion','patternSource','finishRate','completionEta','seasonalPattern','peakTimeSummary','oldestWip','readyToStart','coverage'];
    localStorage.setItem('cs_stats_visibility',JSON.stringify(Object.fromEntries(keys.map(k=>[k,true]))));
  },kind);
}
async function size(page, s) {
  await page.setViewportSize({width:s.width,height:s.height});
  await page.evaluate(z=>{document.body.style.zoom=z;},String(s.zoom||1));
}
async function contained(page, selector) {
  const failures=await page.locator(selector).evaluateAll(es=>es.flatMap(e=>{
    const b=e.getBoundingClientRect();
    return b.width && (e.scrollWidth>e.clientWidth+2 || b.right>document.documentElement.clientWidth+2) ? [{class:e.className,width:e.clientWidth,scroll:e.scrollWidth,right:b.right}] : [];
  }));
  expect(failures).toEqual([]);
}
async function shot(page, info, name) {
  await page.screenshot({path:info.outputPath(name+'.png'),fullPage:true,scale:'css'});
  // Global Stats is in a fixed scroller. Full-page screenshots alone omit its lower panels.
  if(info.title.includes('all global')&&info.title.includes('populated')){
    const handle=await page.locator('.gsd-tabs').first().evaluateHandle(e=>{
      for(let p=e.parentElement;p;p=p.parentElement)if(p.scrollHeight>p.clientHeight+2&&getComputedStyle(p).overflowY==='auto')return p;
      return null;
    });
    if(handle.asElement()){
      const metrics=await handle.evaluate(e=>({height:e.clientHeight,total:e.scrollHeight}));
      let frame=0;
      for(let y=metrics.height*.8;y<metrics.total;y+=metrics.height*.8){
        await handle.evaluate((e,y)=>{e.scrollTop=y;},y);await page.screenshot({path:info.outputPath(name+'-scroll-'+(++frame)+'.png'),scale:'css'});
      }
      await handle.evaluate(e=>{e.scrollTop=0;});
    }
    await handle.dispose();
  }
}

for (const kind of ['empty','sparse','populated']) {
  test('project Stats sizing: '+kind, async ({page},info)=>{
    test.setTimeout(600000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await seed(page,kind);
    await page.addScriptTag({url:'/components.js'});await page.addScriptTag({url:'/components-stats.js'});
    await page.evaluate(()=>{
      const f=window.__statsFixture;
      const stage=document.createElement('main');stage.id='stats-test-stage';document.body.replaceChildren(stage);
      function Fixture(){
        const [settings,setSettings]=React.useState({sectionCols:50,sectionRows:50,sectionLabels:{'0,0':f.long},dailyGoal:20});
        const [snaps,setSnaps]=React.useState([]);
        const palette=f.kind==='empty'?[]:[{id:'310',name:f.long,rgb:[0,0,0]},{id:'321',name:f.long,rgb:[199,43,59]}];
        return React.createElement(StatsDashboard,{statsSessions:f.statsSessions,statsSettings:settings,onUpdateSettings:setSettings,totalCompleted:f.kind==='empty'?0:30,totalStitches:f.kind==='empty'?0:f.pattern.length,onEditNote(){},onEditSession(){return {};},onClose(){},projectName:f.long,palette,colourDoneCounts:{'310':{total:100,done:25,halfTotal:20,halfDone:5},'321':{total:50,done:50}},done:f.done,pat:f.kind==='empty'?null:f.pattern,sW:f.w,sH:f.h,doneSnapshots:snaps,setDoneSnapshots:setSnaps,sections:f.kind==='empty'?[]:Array.from({length:32},(_,i)=>({sx:i%8,sy:Math.floor(i/8),label:String(i+1),pct:25,total:10,completed:3,x0:0,y0:0,x1:5,y1:5})),canEdit:true});
      }
      window.__statsRoot=ReactDOM.createRoot(stage);ReactDOM.flushSync(()=>window.__statsRoot.render(React.createElement(Fixture)));
    });
    for(const s of sizes){
      await size(page,s);
      for(const view of ['Overview','Visuals']){
        await page.getByRole('tab',{name:view,exact:true}).click();
        await contained(page,'.stats-dashboard, .bento-cell, .colour-progress, .stats-comparison, .stats-sections');
        await shot(page,info,s.name+'-'+view);
      }
    }
    await size(page,sizes[2]);
    if(kind!=='empty'){
      const row=page.locator('.stats-colour-row').filter({hasText:'DMC 310'});
      await expect(row.locator('.colour-bar')).toHaveAttribute('aria-label','25% done');
      const ratio=await row.evaluate(e=>e.querySelector('.colour-bar-fill').getBoundingClientRect().width/e.querySelector('.colour-bar').getBoundingClientRect().width);
      expect(ratio).toBeCloseTo(.25,2);
      await page.getByLabel('Show colours',{exact:true}).selectOption('done');await expect(page.locator('.stats-colour-row')).toHaveCount(1);
      await page.getByLabel('Show colours',{exact:true}).selectOption('all');await page.getByLabel('Sort colours',{exact:true}).selectOption('palette');
      await page.getByLabel('Snapshot label',{exact:true}).fill('Long snapshot '+ 'W'.repeat(80));await page.getByRole('button',{name:'Save snapshot',exact:true}).click();
      await expect(page.getByLabel('Snapshot to compare with').locator('option')).toHaveCount(2);
      const id=await page.getByLabel('Snapshot to compare with').locator('option').last().getAttribute('value');
      await page.getByLabel('Snapshot to compare with').selectOption(id);
      await page.getByLabel('Diff view').check();
      await expect(page.locator('.comparison-previews canvas')).toHaveCount(3);
      for(const c of await page.locator('.comparison-previews canvas').all()){
        const dims=await c.evaluate(e=>({w:e.width,h:e.height,box:e.getBoundingClientRect().toJSON(),paint:e.getContext('2d').getImageData(0,0,1,1).data[3]}));
        expect(dims.w).toBeGreaterThan(0);expect(dims.h).toBeGreaterThan(0);expect(dims.paint).toBe(255);
        expect(dims.box.width/dims.box.height).toBeCloseTo(dims.w/dims.h,1);
      }
      await page.getByLabel('Snapshot to compare with').selectOption('');
      expect(await page.locator('.comparison-previews canvas').first().evaluate(e=>e.getContext('2d').getImageData(0,0,1,1).data[3])).toBe(0);
      await page.getByRole('tab',{name:'Overview',exact:true}).click();
      for(const chart of ['Daily','Cumulative','Speed','Calendar']){
        await page.getByRole('button',{name:chart,exact:true}).click();
        await contained(page,'.stats-dashboard, .bento-cell, .chart-section');
        if(kind==='populated'&&chart!=='Calendar'){
          await page.locator('.chart-scrub-range').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');await expect(page.locator('.chart-readout')).not.toContainText('Tap the chart');
          await page.locator('.chart-table summary').click();await expect(page.locator('.chart-table table')).toBeVisible();
          await page.locator('.stats-plot-scroll').evaluate(e=>e.scrollLeft=e.scrollWidth);
          await page.locator('.stats-plot svg').click({position:{x:460,y:25},force:true});
        }
        await shot(page,info,'phone-chart-'+chart);
      }
      await page.locator('.stats-accordion summary').click();
      await contained(page,'.stats-dashboard, .bento-cell');
      await page.locator('.stats-accordion summary').click();await page.locator('.stats-accordion summary').click();
      if(kind==='populated'){await page.getByRole('button',{name:'Edit session',exact:true}).first().click();await contained(page,'.session-editor');await page.getByRole('button',{name:'Cancel',exact:true}).click();}
      await page.getByRole('tab',{name:'Visuals',exact:true}).click();await expect(page.locator('canvas[aria-label="Current progress"]')).toBeVisible();
    }else{await expect(page.locator('.colour-progress')).toContainText('No colours');await expect(page.getByRole('button',{name:'Save snapshot',exact:true})).toBeDisabled();}
    expect(errors).toEqual([]);
  });
  test('all global Stats tabs sizing: '+kind,async({page},info)=>{
    test.setTimeout(600000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await seed(page,kind);await page.goto('/index.html?mode=stats&from=home',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Stitching',exact:true}).waitFor();
    for(const s of sizes){await size(page,s);for(const tab of ['Stitching','Stash','Showcase','Activity','Insights']){
      await page.locator('.gsd-tabs-inner').getByRole('button',{name:tab,exact:true}).click();
      await expect(page.getByText(/^(?:Loading|Building)(?:\s+.*)?(?:…|\.\.\.)$/i).filter({visible:true})).toHaveCount(0);
      await contained(page,'.gsd, .stats-dashboard, .bento-cell');await expect(page.getByText('Stats failed to render',{exact:true})).toHaveCount(0);
      await shot(page,info,s.name+'-'+tab);
    }}
    await page.locator('.gsd-tabs-inner').getByRole('button',{name:'Stash',exact:true}).click();
    const customise=page.getByRole('button',{name:/Customise/});
    if(await customise.count()){
      await customise.click();const cb=page.getByRole('checkbox',{name:'SABLE Index',exact:true});await cb.uncheck();await page.keyboard.press('Escape');await expect(page.locator('#stats-sableIndex')).toHaveCount(0);await customise.click();await page.getByRole('checkbox',{name:'SABLE Index',exact:true}).check();await page.keyboard.press('Escape');await expect(page.locator('#stats-sableIndex')).toBeVisible();
    }
    if(kind==='populated'){
      await size(page,sizes[2]);await page.locator('.gsd-tabs-inner').getByRole('button',{name:'Showcase',exact:true}).click();const acquisition=page.getByRole('region',{name:'Thread acquisition plot',exact:true});await acquisition.scrollIntoViewIfNeeded();const plotBox=await acquisition.locator('svg').boundingBox();expect(plotBox.width).toBeGreaterThanOrEqual(480);expect(plotBox.width/plotBox.height).toBeCloseTo(600/160,2);await page.getByRole('button',{name:'Share this section',exact:true}).first().click();await expect(page.getByRole('button',{name:'Download PNG',exact:true})).toBeVisible();await contained(page,'.modal-content');await shot(page,info,'phone-share');await page.getByRole('button',{name:'Close share modal',exact:true}).click();
      await page.locator('.gsd-tabs-inner').getByRole('button',{name:'Activity',exact:true}).click();await page.getByRole('button',{name:'Last 6 months',exact:true}).click();await page.getByRole('button',{name:'Last 12 months',exact:true}).click();const cell=page.locator('svg[aria-label="Stitching activity heatmap"] rect[aria-label]').first();if(await cell.count()){await cell.click();await expect(page.getByRole('button',{name:'Dismiss',exact:true})).toBeVisible();await page.getByRole('button',{name:'Dismiss',exact:true}).click();}
      await page.locator('.gsd-tabs-inner').getByRole('button',{name:'Insights',exact:true}).click();const dismiss=page.getByRole('button',{name:'Dismiss insight',exact:true});if(await dismiss.count()){await dismiss.first().click();await page.getByRole('button',{name:/Show all insights/}).click();await expect(dismiss.first()).toBeVisible();}
    }
    expect(errors).toEqual([]);
  });
}

test('Tracker Stats reopen, sections and project comparison remain usable', async({page},info)=>{
  test.setTimeout(600000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await seed(page,'sparse');await page.goto('/stitch.html?id=proj_stats_sizing0',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__openTrackerStats);
  const resume=page.getByRole('button',{name:'Continue stitching',exact:true});if(await resume.count())await resume.click();
  await page.evaluate(()=>window.__openTrackerStats());await expect(page.locator('.resume-recap-banner')).toHaveCount(0);await page.getByRole('tab',{name:'Visuals',exact:true}).click();
  await size(page,sizes[2]);const section=page.locator('.section-cell').first();await section.click();await expect(page.getByRole('button',{name:'Close section threads'})).toBeVisible();
  await section.click();await section.locator('input').fill('Renamed long section '+'W'.repeat(80));await section.locator('input').press('Enter');await expect(section).toHaveAttribute('title',/Renamed long section/);
  await page.getByRole('button',{name:/Back to (projects|chart)/}).click();await page.evaluate(()=>window.__openTrackerStats());await expect(page.locator('.stats-sections')).toBeVisible();
  await size(page,sizes[1]);await page.getByRole('tab',{name:'Overview',exact:true}).click();await page.getByRole('button',{name:'Compare projects',exact:true}).click();
  await expect(page.locator('.project-comparison')).toBeVisible();await page.getByRole('columnheader',{name:/Progress/}).click();await page.getByRole('columnheader',{name:/Progress/}).click();await size(page,sizes[2]);await contained(page,'.project-comparison');
  await page.locator('.comparison-table').evaluate(e=>e.parentElement.scrollLeft=e.parentElement.scrollWidth);await shot(page,info,'phone-project-comparison');await page.getByRole('button',{name:/Back to stats/}).click();await expect(page.locator('.stats-viewtabs')).toBeVisible();expect(errors).toEqual([]);
});

test('dense Colours list scrolls without squeezing labels, counts or percentages',async({page},info)=>{
  test.setTimeout(300000);await seed(page,'empty');await page.addScriptTag({url:'/components-stats.js'});
  await page.evaluate(()=>{
    const stage=document.createElement('main');document.body.replaceChildren(stage);stage.className='stats-dashboard';
    const palette=Array.from({length:40},(_,i)=>({id:'custom_'+i,name:'Long colour description '+ 'W'.repeat(70),brand:'dmc',rgb:[100,30,40]}));
    const counts=Object.fromEntries(palette.map((c,i)=>[c.id,{total:100000,done:i===39?100000:25000,halfTotal:20000,halfDone:i===39?20000:5000}]));
    ReactDOM.createRoot(stage).render(React.createElement('div',{className:'bento-cell'},React.createElement(ColourProgress,{palette,colourDoneCounts:counts,sessions:[]})));
  });
  await expect(page.locator('.stats-colour-row')).toHaveCount(40);
  for(const s of [sizes[0],sizes[2],sizes[4]]){
    await size(page,s);await contained(page,'.stats-dashboard, .colour-progress');
    const list=page.getByRole('region',{name:'Colour progress list'});expect(await list.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);
    const row=page.locator('.stats-colour-row').first();await expect(row.locator('.colour-bar')).toHaveAttribute('aria-label','25% done');
    const geometry=await row.evaluate(e=>{const a=e.querySelector('.colour-info').getBoundingClientRect(),b=e.querySelector('.colour-bar').getBoundingClientRect(),f=e.querySelector('.colour-bar-fill').getBoundingClientRect();return {label:a.toJSON(),bar:b.toJSON(),ratio:f.width/b.width};});
    expect(geometry.bar.width).toBeGreaterThan(80);expect(geometry.ratio).toBeCloseTo(.25,2);
    await list.evaluate(e=>e.scrollTop=e.scrollHeight);await page.locator('.stats-colour-row').last().scrollIntoViewIfNeeded();await expect(page.locator('.stats-colour-row').last()).toBeInViewport();await shot(page,info,s.name+'-dense-colours');await list.evaluate(e=>e.scrollTop=0);
  }
});


test('native Chrome 200% zoom fits empty, sparse and populated Stats',async({},info)=>{
  test.setTimeout(180000);
  const fs=require('fs'),os=require('os'),path=require('path');
  for(const kind of ['empty','sparse','populated']){
    const profile=fs.mkdtempSync(path.join(os.tmpdir(),'stats-native-zoom-'));
    const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,isMobile:false,hasTouch:false,deviceScaleFactor:1,userAgent:undefined,viewport:{width:1440,height:1000},baseURL:'http://127.0.0.1:8000',serviceWorkers:'block'});
    try{
      await installLocalCdn(context);await context.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
      await context.addInitScript(()=>{['tracker','creator','manager','home'].forEach(k=>localStorage.setItem('cs_welcome_'+k+'_done','1'));localStorage.setItem('cs_sessionOnboardingDone','1');sessionStorage.setItem('cs_eviction_warned','1');});
      const page=context.pages()[0],errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto('chrome://settings/appearance');await page.locator('#zoomLevel').selectOption('2');
      await seed(page,kind);
      expect(await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio,zoom:getComputedStyle(document.body).zoom}))).toEqual({width:720,dpr:2,zoom:'1'});
      await page.goto('/index.html?mode=stats&from=home',{waitUntil:'domcontentloaded'});
      for(const tab of ['Stitching','Stash','Showcase','Activity','Insights']){
        await page.locator('.gsd-tabs-inner').getByRole('button',{name:tab,exact:true}).click();await expect(page.getByText(/^(?:Loading|Building)(?:\s+.*)?(?:…|\.\.\.)$/i).filter({visible:true})).toHaveCount(0);
        await contained(page,'.gsd, .stats-dashboard, .bento-cell');await page.screenshot({path:info.outputPath(kind+'-native-200-'+tab+'.png'),scale:'css'});
      }
      if(kind!=='empty'){
        await page.goto('/stitch.html?id=proj_stats_sizing0',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__openTrackerStats);await expect(page.locator('.tracker-chart-scroll canvas').first()).toBeVisible();await page.evaluate(()=>window.__openTrackerStats());
        for(const view of ['Overview','Visuals']){await page.getByRole('tab',{name:view,exact:true}).click();await contained(page,'.stats-dashboard, .bento-cell, .colour-progress, .stats-comparison, .stats-sections');await page.screenshot({path:info.outputPath(kind+'-native-200-'+view+'.png'),scale:'css'});}
      }
      expect(errors).toEqual([]);
    }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
  }
});
