/* Real import + input-to-two-animation-frames benchmark. No navigation-spanning marks.
 * Run sequentially: E2E_LOCAL_CDN=1 node tests/perf/focused-journey.cjs [label]
 * BROWSERS=chromium,firefox,webkit WARMUPS=1 REPEATS=3 SIZES=400x500,600x800
 * Start `npm start` first. Results include environment and raw samples. */
const { chromium, firefox, webkit } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { installLocalCdn } = require('../e2e/local-cdn');
const { makeTrackerFixture } = require('../_helpers/trackerFixture');
const GRID = 'canvas[role="application"]';
function hostCondition(file) { try { return fs.readFileSync(file,'utf8').trim(); } catch (_) { return null; } }
async function prepare(context) {
  await installLocalCdn(context);
  // Optional exact-source A/B replay. Both variants use the same route and
  // libraries; callers provide either a saved baseline or current-source root.
  if(process.env.BENCH_SOURCE_ROOT){
    const names=['project-storage.js','tracking-sync.js','compiled/tracker-app.compiled.js','styles.css','components/Overlay.js'];
    for(const name of names)await context.route('**/'+name+'*',route=>route.fulfill({
      contentType:name.endsWith('.css')?'text/css':'application/javascript',
      body:fs.readFileSync(path.join(process.env.BENCH_SOURCE_ROOT,name))
    }));
  }
  await context.addInitScript(() => {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    sessionStorage.setItem('cs_eviction_warned', '1');
  });
}
async function importChart(page, size) {
  await page.goto((process.env.BASE_URL || 'http://127.0.0.1:8000') + '/stitch.html?from=home');
  const file = makeTrackerFixture({ sW: size[0], sH: size[1], nColours: 60 });
  const start = performance.now();
  await page.locator('input[type=file]').first().setInputFiles(file);
  await page.locator(GRID).waitFor();
  await page.waitForFunction(() => {
    const c = document.querySelector('canvas[role=application]');
    return c && c.__chartTile && c.width > 0;
  });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  return performance.now() - start;
}
async function input(page, key, selector = GRID) {
  return page.evaluate(async ({ key, selector }) => {
    const el = document.querySelector(selector);
    const t = performance.now();
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return performance.now() - t;
  }, { key, selector });
}
async function guideIndex(page,width) {
  await page.waitForFunction(() => /Guide at row \d+, column \d+/.test(document.getElementById('tracker-chart-status').textContent));
  const text=await page.locator('#tracker-chart-status').textContent();
  const match=text.match(/Guide at row (\d+), column (\d+)/);
  return (Number(match[1])-1)*width+Number(match[2])-1;
}
function summary(a) {
  const s = [...a].sort((a,b) => a-b);
  return { median: s[Math.floor(s.length/2)], p95: s[Math.min(s.length-1,Math.floor(s.length*.95))], max: s.at(-1), samples: a };
}
async function run() {
  const warmups=Number(process.env.WARMUPS || 1), repeats=Number(process.env.REPEATS || 3);
  assert(Number.isInteger(warmups) && warmups >= 1, 'WARMUPS must be at least 1');
  assert(Number.isInteger(repeats) && repeats >= 3, 'REPEATS must be at least 3');
  const harnessRoot=path.join(__dirname,'../..'), sourceRoot=process.env.BENCH_SERVER_ROOT || harnessRoot;
  const revision=root=>execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const report = { label: process.argv[2] || 'current', timestamp: new Date().toISOString(), warmups, repeats, sourceSha: revision(sourceRoot), harnessSha: revision(harnessRoot), environment: {
    os: os.type() + ' ' + os.release(), arch: os.arch(), cpu: os.cpus()[0].model,
    logicalCpus: os.cpus().length, hostMemoryGiB: os.totalmem()/2**30, node: process.version,
    playwright: require('playwright/package.json').version, viewport: '1440x900', dpr: 1,
    cpuQuota: hostCondition('/sys/fs/cgroup/cpu.max'), memoryLimit: hostCondition('/sys/fs/cgroup/memory.max'),
    headless: true, throttling: 'none', localCdn: process.env.E2E_LOCAL_CDN === '1', sourceVariant: process.env.BENCH_SOURCE_LABEL || 'working-tree', sourceOverlay: process.env.BENCH_SOURCE_ROOT || null, baseUrl: process.env.BASE_URL || 'http://127.0.0.1:8000',
    fixture: { generator: 'tests/_helpers/trackerFixture.js', colours: 60, doneFraction: 0, version: 11 },
  }, results: [] };
  for (const name of (process.env.BROWSERS || 'chromium,firefox,webkit').split(',')) {
    let browser;
    try { browser = await ({chromium,firefox,webkit}[name]).launch(); }
    catch(e) { report.results.push({browser:name,unavailable:String(e)}); continue; }
    for (const size of (process.env.SIZES || '400x500,600x800').split(',').map(s=>s.split('x').map(Number))) {
      for (let repeat=-warmups; repeat<repeats; repeat++) {
        const context = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
        await prepare(context); const page = await context.newPage();
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        const result={browser:name,version:browser.version(),size,repeat,warmup:repeat<0};
        try {
          result.importMs = await importChart(page,size);
          await page.waitForFunction(() => typeof window.__flushProjectToIDB === 'function');
          await page.evaluate(() => window.__flushProjectToIDB()); // settle import persistence outside measured input
          await page.locator(GRID).focus(); await input(page,'ArrowRight');
          const initialGuide=await guideIndex(page,size[0]);
          const mark=[], pointer=[], undo=[], zoom=[], pan=[];
          for(let i=0;i<20;i++) { await input(page,'ArrowRight'); mark.push(await input(page,'Enter')); }
          // Pointer input uses chart-space coordinates, retaining tiled renderer geometry.
          for(let i=0;i<10;i++) pointer.push(await page.evaluate(async i=>{
            const c=document.querySelector('canvas[role=application]'),r=c.getBoundingClientRect(),t=c.__chartTile;
            const cs=document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width;
            const x=r.left-t.x+28+(i+1.5)*cs,y=r.top-t.y+28+1.5*cs,start=performance.now();
            c.dispatchEvent(new PointerEvent('pointerdown',{clientX:x,clientY:y,button:0,buttons:1,pointerId:1,pointerType:'mouse',bubbles:true}));
            c.dispatchEvent(new PointerEvent('pointerup',{clientX:x,clientY:y,button:0,buttons:0,pointerId:1,pointerType:'mouse',bubbles:true}));
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return performance.now()-start;
          },i));
          for(let i=0;i<10;i++) undo.push(await page.evaluate(async()=>{
            const start=performance.now();document.querySelector('.ppal-mode-btn[title="Undo (Ctrl+Z)"]').click();
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return performance.now()-start;
          }));
          const initialCell=await page.locator('.tracker-chart-scroll > div').first().evaluate(e=>e.children[1].getBoundingClientRect().width);
          zoom.push(await input(page,'='));
          assert(await page.locator('.tracker-chart-scroll > div').first().evaluate(e=>e.children[1].getBoundingClientRect().width)>initialCell,'zoom must change cell size');
          for(let i=1;i<6;i++) zoom.push(await input(page,i%2?'-':'='));
          for(let i=0;i<20;i++) pan.push(await page.evaluate(async i=>{
            const t=performance.now(),s=document.querySelector('.tracker-chart-scroll');s.scrollTop=i*120;s.scrollLeft=i*60;
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return performance.now()-t;
          },i));
          result.latencyMs={mark:summary(mark),pointer:summary(pointer),undo:summary(undo),zoom:summary(zoom),pan:summary(pan)};
          result.canvas = await page.evaluate(()=>({ bytes:[...document.querySelectorAll('canvas')].reduce((n,c)=>n+c.width*c.height*4,0), nodes:document.querySelectorAll('*').length, tile:document.querySelector('canvas[role=application]').__chartTile }));
          if(name==='chromium') {
            const cdp=await context.newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');result.heapAfterGC=await cdp.send('Runtime.getHeapUsage');await cdp.detach();
          }
          const expected=Array.from({length:20},(_,i)=>initialGuide+i+1);
          result.save = await page.evaluate(async()=>{
            const t=performance.now();await window.__flushProjectToIDB();
            const id=localStorage.getItem('crossstitch_active_project'),db=await getDB();
            // Read the full persisted record directly, without saveProgress overlays or full-cache hits.
            const p=await new Promise((resolve,reject)=>{const q=db.transaction('projects').objectStore('projects').get(id);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
            return {ms:performance.now()-t,version:p.version,patternLength:p.pattern.length,
              indices:Array.from(p.done).flatMap((v,i)=>v?[i]:[])};
          });
          result.save.done=result.save.indices.length;
          assert.deepEqual(result.save.indices,expected,'undo must leave precisely the keyboard-marked cells');
          assert.equal(result.save.patternLength,size[0]*size[1]);
          assert.equal(result.save.version,11);
          const t=performance.now();await page.reload();await page.locator(GRID).waitFor();
          await page.waitForFunction(()=>document.querySelector('canvas[role=application]').__chartTile);
          result.reopenMs=performance.now()-t;
          // Flush the mounted Tracker's restored state: a DB-only count cannot prove React restored it.
          await page.waitForFunction(() => typeof window.__flushProjectToIDB === 'function');
          result.reopenedIndices=await page.evaluate(async()=>{
            await window.__flushProjectToIDB();
            const p=await ProjectStorage.get(localStorage.getItem('crossstitch_active_project'));
            return Array.from(p.done).flatMap((v,i)=>v?[i]:[]);
          });
          result.reopenedDone=result.reopenedIndices.length;
          assert.deepEqual(result.reopenedIndices,expected);assert.deepEqual(errors,[]);
          if(name==='chromium') {
            const cdp=await context.newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');
            result.heapAfterReopenGC=await cdp.send('Runtime.getHeapUsage');await cdp.detach();
          }
          // Selection samples follow the comparable mark/save batch, so they do
          // not alter its initial view, timing or memory conditions.
          await page.locator(GRID).focus();const select=[];
          for(let i=0;i<3;i++){
            select.push(await page.evaluate(async i=>{
              const t=performance.now();document.querySelectorAll('.ppal-tile')[i].click();
              await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return performance.now()-t;
            },i));
            await input(page,'v'); // return from Highlight to Symbol before the next selection
          }
          result.selectionLatencyMs=summary(select);

        } catch(e) { result.error=String(e);process.exitCode=1; }
        report.results.push(result);console.log(name,size.join('x'),repeat,JSON.stringify(result.error || {importMs:result.importMs,mark:result.latencyMs.mark.p95,undo:result.latencyMs.undo.p95,heap:result.heapAfterGC?.usedSize,done:result.save.indices.length}));
        await context.close();
      }
    }
    await browser.close();
  }
  report.distributions=[];
  for(const browser of [...new Set(report.results.map(r=>r.browser))])for(const size of (process.env.SIZES || '400x500,600x800').split(',')){
    const runs=report.results.filter(r=>r.browser===browser && r.size?.join('x')===size && !r.warmup && !r.error);
    if(runs.length)report.distributions.push({browser,size,runs:runs.length,importMs:summary(runs.map(r=>r.importMs)),saveMs:summary(runs.map(r=>r.save.ms)),reopenMs:summary(runs.map(r=>r.reopenMs)),markP95Ms:summary(runs.map(r=>r.latencyMs.mark.p95)),heapAfterGC:runs.every(r=>r.heapAfterGC)?summary(runs.map(r=>r.heapAfterGC.usedSize)):null});
  }
  if(!report.distributions.length)process.exitCode=1;
  const out=path.join(__dirname,'../../reports/perf-results');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'focused-'+report.label+'.json'),JSON.stringify(report,null,2));
}
module.exports={prepare,importChart,input,guideIndex,GRID};
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
